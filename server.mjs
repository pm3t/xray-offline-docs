import express from 'express';
import cors from 'cors';
import multer from 'multer';
import Database from 'better-sqlite3';
import pg from 'pg';
import { fileURLToPath } from 'url';
import { dirname, join, extname } from 'path';
import { existsSync, mkdirSync, unlinkSync, writeFileSync, readFileSync } from 'fs';
import crypto from 'crypto';
import sharp from 'sharp';
import { exec } from 'child_process';
import { FtpSrv } from 'ftp-srv';
import net from 'net';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// === DIRECTORIES ===
const UPLOADS_DIR = process.env.UPLOADS_DIR || join(__dirname, 'uploads');
const DB_PATH = process.env.DB_PATH || join(__dirname, 'xray.db');
if (!existsSync(UPLOADS_DIR)) mkdirSync(UPLOADS_DIR, { recursive: true });

// === DATABASE SETUP ===
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS cargo (
    id TEXT PRIMARY KEY,
    uldNo TEXT,
    mawb TEXT NOT NULL,
    hawb TEXT,
    totalPcs INTEGER DEFAULT 0,
    totalWeight REAL DEFAULT 0,
    goodsDescription TEXT,
    actualPcs INTEGER DEFAULT 0,
    isSentToCeisa INTEGER DEFAULT 0,
    smu TEXT,
    airline TEXT,
    flightNumber TEXT,
    origin TEXT,
    destination TEXT
  );

  CREATE TABLE IF NOT EXISTS scan_history (
    scanId INTEGER PRIMARY KEY AUTOINCREMENT,
    mawb TEXT NOT NULL,
    hawb TEXT,
    uldNo TEXT,
    totalWeight REAL DEFAULT 0,
    topViewImage TEXT,
    sideViewImage TEXT,
    fotoBarang TEXT,
    qty INTEGER DEFAULT 0,
    status TEXT,
    timestamp TEXT,
    submittedToCustoms INTEGER DEFAULT 0,
    submittedAt TEXT,
    userID TEXT
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    warehouseName TEXT,
    role TEXT DEFAULT 'user'
  );
`);

// === MIGRATIONS ===
try { db.prepare("ALTER TABLE scan_history ADD COLUMN userID TEXT").run(); console.log('✅ Migration: added userID to scan_history'); } catch (e) { /* ignore if column exists */ }
try { db.prepare("ALTER TABLE scan_history ADD COLUMN cropImages TEXT").run(); console.log('✅ Migration: added cropImages to scan_history'); } catch (e) { /* ignore if column exists */ }
try { db.prepare("ALTER TABLE scan_history ADD COLUMN workstationId TEXT").run(); console.log('✅ Migration: added workstationId'); } catch (e) { }
try { db.prepare("ALTER TABLE scan_history ADD COLUMN isSyncedToHub INTEGER DEFAULT 0").run(); console.log('✅ Migration: added isSyncedToHub'); } catch (e) { }
try { db.prepare("ALTER TABLE scan_history ADD COLUMN isSyncedToCloud INTEGER DEFAULT 0").run(); console.log('✅ Migration: added isSyncedToCloud'); } catch (e) { }
try { db.prepare("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'").run(); console.log('✅ Migration: added role to users'); } catch (e) { /* ignore if column exists */ }

// === LOAD SETTINGS ===
function loadSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  for (const r of rows) settings[r.key] = r.value;
  return settings;
}
let appSettings = loadSettings();

// === PG POOL (Hub Mode) ===
const { Pool } = pg;
let pgPool = null;
if ((appSettings.appRole === 'Hub' || appSettings.appRole === 'Cloud') && appSettings.pgConnectionString) {
    pgPool = new Pool({ connectionString: appSettings.pgConnectionString });
    pgPool.query(`
        CREATE TABLE IF NOT EXISTS scan_history (
            "scanId" SERIAL PRIMARY KEY,
            mawb TEXT NOT NULL,
            hawb TEXT,
            "uldNo" TEXT,
            "totalWeight" REAL DEFAULT 0,
            "topViewImage" TEXT,
            "sideViewImage" TEXT,
            "fotoBarang" TEXT,
            qty INTEGER DEFAULT 0,
            status TEXT,
            timestamp TEXT,
            "submittedToCustoms" INTEGER DEFAULT 0,
            "submittedAt" TEXT,
            "userID" TEXT,
            "cropImages" TEXT,
            "workstationId" TEXT,
            "isSyncedToCloud" INTEGER DEFAULT 0
        );
    `).then(() => console.log(`✅ PostgreSQL ${appSettings.appRole} Database initialized`))
      .catch(e => console.error('❌ PostgreSQL init error:', e));
}

// === MIDDLEWARE ===
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// === SSE (Server-Sent Events) for Real-time Scanner Data ===
let clients = [];

app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable buffering for Nginx if present
  res.flushHeaders();

  // Prime the stream
  res.write(':ok\n\n');

  // Keep-alive heartbeat every 15 seconds
  const keepAlive = setInterval(() => {
    res.write(':keep-alive\n\n');
  }, 15000);

  const clientId = Date.now();
  const newClient = { id: clientId, res };
  clients.push(newClient);
  // Only log when total changes to avoid spam
  if (clients.length === 1) console.log(`📡 SSE stream active. Clients: ${clients.length}`);

  req.on('close', () => {
    clearInterval(keepAlive);
    clients = clients.filter(c => c.id !== clientId);
    if (clients.length === 0) console.log(`📡 SSE stream idle. No clients connected.`);
  });
});

// Endpoint for the physical OCR scanner to POST JSON data
app.post('/api/ocr-scanner', (req, res) => {
  const { mawb, hawb, fotoBarang } = req.body;
  
  if (!mawb) return res.status(400).json({ error: 'MAWB is required' });

  // Broadcast to all connected frontend clients
  const data = JSON.stringify({ mawb, hawb, fotoBarang });
  console.log(`📡 Broadcasting to ${clients.length} clients...`);
  clients.forEach(c => {
    try {
      c.res.write(`event: ocr-data\ndata: ${data}\n\n`);
    } catch (e) {
      console.error('Failed to write to client:', e);
    }
  });

  console.log(`📡 OCR Scanner Data Received: MAWB=${mawb}, HAWB=${hawb || '-'}, Foto=${fotoBarang ? 'Yes' : 'No'}`);
  res.json({ success: true, message: `Data broadcasted to ${clients.length} frontend clients` });
});

// Serve frontend build
const distPath = join(__dirname, 'dist');
if (existsSync(distPath)) {
  app.use(express.static(distPath));
}

// Serve uploaded images
app.use('/uploads', express.static(UPLOADS_DIR));

// === IMAGE UPLOAD (Multer) ===
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const unique = crypto.randomUUID();
    cb(null, `${unique}${extname(file.originalname) || '.png'}`);
  }
});
const upload = multer({ storage });

app.post('/api/upload-image', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

// Upload base64 image (dari capture kamera)
app.post('/api/upload-image-base64', (req, res) => {
  const { dataUrl, prefix } = req.body;
  if (!dataUrl) return res.status(400).json({ error: 'No dataUrl provided' });
  const matches = dataUrl.match(/^data:(.+);base64,(.+)$/);
  if (!matches) return res.status(400).json({ error: 'Invalid base64 data' });
  const ext = matches[1].includes('png') ? '.png' : '.jpg';
  const buffer = Buffer.from(matches[2], 'base64');
  const filename = `${prefix || 'img'}-${crypto.randomUUID()}${ext}`;
  const filepath = join(UPLOADS_DIR, filename);
  import('fs').then(({ writeFileSync }) => {
    writeFileSync(filepath, buffer);
    res.json({ url: `/uploads/${filename}` });
  });
});

// === AI ANALYZE ENDPOINT (OpenCV Integration) ===
// Memanggil analyze_koli.py untuk edge detection dan contours OpenCV
app.post('/api/ai-analyze', async (req, res) => {
  const { dataUrl, baselineUrls } = req.body;
  if (!dataUrl) return res.status(400).json({ error: 'No image provided' });

  try {
    const matches = dataUrl.match(/^data:(.+);base64,(.+)$/);
    if (!matches) return res.status(400).json({ error: 'Invalid base64 data' });
    const buffer = Buffer.from(matches[2], 'base64');

    // Simpan buffer ke temporary file
    const tempFilename = `temp-${crypto.randomUUID()}.png`;
    const tempPath = join(UPLOADS_DIR, tempFilename);
    writeFileSync(tempPath, buffer);

    let baselinePaths = [];
    if (baselineUrls && Array.isArray(baselineUrls)) {
      for (const bUrl of baselineUrls) {
        const bMatches = bUrl.match(/^data:(.+);base64,(.+)$/);
        if (bMatches) {
          const bBuffer = Buffer.from(bMatches[2], 'base64');
          const bPath = join(UPLOADS_DIR, `bg-${crypto.randomUUID()}.png`);
          writeFileSync(bPath, bBuffer);
          baselinePaths.push(bPath);
        }
      }
    }

    // Panggil script python
    const scriptPath = join(__dirname, 'analyze_koli.py');
    const cmd = `python3 "${scriptPath}" "${tempPath}" "${UPLOADS_DIR}" ${baselinePaths.map(p => `"${p}"`).join(' ')}`;

    exec(cmd, (error, stdout, stderr) => {
      // Hapus temp file
      try { unlinkSync(tempPath); } catch (e) {}
      if (baselinePaths && baselinePaths.length > 0) {
        baselinePaths.forEach(p => {
          try { unlinkSync(p); } catch (e) {}
        });
      }

      if (error) {
        console.error('Python OpenCV error:', stderr || error.message);
        return res.status(500).json({ error: 'OpenCV error. Pastikan python3 dan opencv-python terinstall di server.' });
      }

      try {
        const result = JSON.parse(stdout.trim());
        if (result.success) {
          res.json({ koliCount: result.koliCount, cropUrls: result.cropUrls, cropData: result.cropData });
        } else {
          res.status(500).json({ error: result.error });
        }
      } catch (e) {
        console.error('Failed to parse Python output:', stdout);
        res.status(500).json({ error: 'Invalid response from OpenCV processing' });
      }
    });
  } catch (err) {
    console.error('AI analyze error:', err);
    res.status(500).json({ error: err.message });
  }
});

// === CARGO API ===
app.get('/api/cargo', (_req, res) => {
  const rows = db.prepare('SELECT * FROM cargo').all();
  // Convert isSentToCeisa to bool
  res.json(rows.map(r => ({ ...r, isSentToCeisa: !!r.isSentToCeisa })));
});

app.post('/api/cargo', (req, res) => {
  const c = req.body;
  db.prepare(`
    INSERT OR REPLACE INTO cargo
      (id, uldNo, mawb, hawb, totalPcs, totalWeight, goodsDescription, actualPcs, isSentToCeisa, smu, airline, flightNumber, origin, destination)
    VALUES
      (@id, @uldNo, @mawb, @hawb, @totalPcs, @totalWeight, @goodsDescription, @actualPcs, @isSentToCeisa, @smu, @airline, @flightNumber, @origin, @destination)
  `).run({
    id: c.id, uldNo: c.uldNo ?? null, mawb: c.mawb, hawb: c.hawb ?? null,
    totalPcs: c.totalPcs ?? 0, totalWeight: c.totalWeight ?? 0,
    goodsDescription: c.goodsDescription ?? null, actualPcs: c.actualPcs ?? 0,
    isSentToCeisa: c.isSentToCeisa ? 1 : 0, smu: c.smu ?? null,
    airline: c.airline ?? null, flightNumber: c.flightNumber ?? null,
    origin: c.origin ?? null, destination: c.destination ?? null
  });
  res.json({ success: true });
});

// Bulk upsert (for imports)
app.post('/api/cargo/bulk', (req, res) => {
  const list = req.body;
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO cargo
      (id, uldNo, mawb, hawb, totalPcs, totalWeight, goodsDescription, actualPcs, isSentToCeisa, smu, airline, flightNumber, origin, destination)
    VALUES
      (@id, @uldNo, @mawb, @hawb, @totalPcs, @totalWeight, @goodsDescription, @actualPcs, @isSentToCeisa, @smu, @airline, @flightNumber, @origin, @destination)
  `);
  const insertMany = db.transaction((items) => {
    for (const c of items) {
      stmt.run({
        id: c.id, uldNo: c.uldNo ?? null, mawb: c.mawb, hawb: c.hawb ?? null,
        totalPcs: c.totalPcs ?? 0, totalWeight: c.totalWeight ?? 0,
        goodsDescription: c.goodsDescription ?? null, actualPcs: c.actualPcs ?? 0,
        isSentToCeisa: c.isSentToCeisa ? 1 : 0, smu: c.smu ?? null,
        airline: c.airline ?? null, flightNumber: c.flightNumber ?? null,
        origin: c.origin ?? null, destination: c.destination ?? null
      });
    }
  });
  insertMany(list);
  res.json({ success: true, count: list.length });
});

app.put('/api/cargo/:id', (req, res) => {
  const c = req.body;
  db.prepare(`
    UPDATE cargo SET
      uldNo=@uldNo, mawb=@mawb, hawb=@hawb, totalPcs=@totalPcs, totalWeight=@totalWeight,
      goodsDescription=@goodsDescription, actualPcs=@actualPcs, isSentToCeisa=@isSentToCeisa,
      smu=@smu, airline=@airline, flightNumber=@flightNumber, origin=@origin, destination=@destination
    WHERE id=@id
  `).run({
    id: req.params.id, uldNo: c.uldNo ?? null, mawb: c.mawb, hawb: c.hawb ?? null,
    totalPcs: c.totalPcs ?? 0, totalWeight: c.totalWeight ?? 0,
    goodsDescription: c.goodsDescription ?? null, actualPcs: c.actualPcs ?? 0,
    isSentToCeisa: c.isSentToCeisa ? 1 : 0, smu: c.smu ?? null,
    airline: c.airline ?? null, flightNumber: c.flightNumber ?? null,
    origin: c.origin ?? null, destination: c.destination ?? null
  });
  res.json({ success: true });
});

app.delete('/api/cargo/:id', (req, res) => {
  db.prepare('DELETE FROM cargo WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// === SCAN HISTORY API ===
app.get('/api/scan-history', async (_req, res) => {
  if (appSettings.appRole === 'Hub' && pgPool) {
    try {
      const { rows } = await pgPool.query('SELECT * FROM scan_history ORDER BY "scanId" DESC');
      res.json(rows.map(r => ({
        ...r,
        submittedToCustoms: !!r.submittedToCustoms,
        cropImages: r.cropImages ? JSON.parse(r.cropImages) : []
      })));
    } catch (e) {
      console.error('PG fetch error:', e);
      res.status(500).json({ error: e.message });
    }
  } else {
    const rows = db.prepare('SELECT * FROM scan_history ORDER BY scanId DESC').all();
    res.json(rows.map(r => ({
      ...r,
      submittedToCustoms: !!r.submittedToCustoms,
      cropImages: r.cropImages ? JSON.parse(r.cropImages) : []
    })));
  }
});

app.post('/api/scan-history', (req, res) => {
  // Simple migration for userID column
  try { db.prepare("ALTER TABLE scan_history ADD COLUMN userID TEXT").run(); } catch (e) { }

  const s = req.body;
  const info = db.prepare(`
    INSERT INTO scan_history
      (mawb, hawb, uldNo, totalWeight, topViewImage, sideViewImage, fotoBarang, qty, status, timestamp, submittedToCustoms, submittedAt, userID, cropImages)
    VALUES
      (@mawb, @hawb, @uldNo, @totalWeight, @topViewImage, @sideViewImage, @fotoBarang, @qty, @status, @timestamp, @submittedToCustoms, @submittedAt, @userID, @cropImages)
  `).run({
    mawb: s.mawb, hawb: s.hawb ?? null, uldNo: s.uldNo ?? null,
    totalWeight: s.totalWeight ?? 0, topViewImage: s.topViewImage ?? null,
    sideViewImage: s.sideViewImage ?? null, fotoBarang: s.fotoBarang ?? null,
    qty: s.qty ?? 0, status: s.status ?? null, timestamp: s.timestamp ?? new Date().toISOString(),
    submittedToCustoms: s.submittedToCustoms ? 1 : 0, submittedAt: s.submittedAt ?? null,
    userID: s.userID ?? null,
    cropImages: s.cropImages ? JSON.stringify(s.cropImages) : null
  });
  res.json({ success: true, scanId: info.lastInsertRowid });
});

app.put('/api/scan-history/:id', (req, res) => {
  const s = req.body;
  db.prepare(`
    UPDATE scan_history SET
      submittedToCustoms=@submittedToCustoms, submittedAt=@submittedAt
    WHERE scanId=@scanId
  `).run({ submittedToCustoms: s.submittedToCustoms ? 1 : 0, submittedAt: s.submittedAt || null, scanId: req.params.id });
  res.json({ success: true });
});

// Helper: hapus file gambar dari folder uploads/
function deleteImageFiles(row) {
  ['topViewImage', 'sideViewImage', 'fotoBarang'].forEach(field => {
    const urlPath = row[field];
    if (!urlPath) return;
    // URL path contoh: /uploads/uuid.png → ambil nama file saja
    const filename = urlPath.split('/').pop();
    if (!filename) return;
    const filepath = join(UPLOADS_DIR, filename);
    if (existsSync(filepath)) {
      try { unlinkSync(filepath); } catch (e) { console.warn('Gagal hapus file:', filepath, e.message); }
    }
  });
  // Hapus juga crop images
  if (row.cropImages) {
    let crops = [];
    try { crops = JSON.parse(row.cropImages); } catch (e) { }
    crops.forEach(urlPath => {
      if (!urlPath) return;
      const filename = urlPath.split('/').pop();
      if (!filename) return;
      const filepath = join(UPLOADS_DIR, filename);
      if (existsSync(filepath)) {
        try { unlinkSync(filepath); } catch (e) { console.warn('Gagal hapus crop file:', filepath, e.message); }
      }
    });
  }
}

app.delete('/api/scan-history/:id', (req, res) => {
  const row = db.prepare('SELECT topViewImage, sideViewImage, fotoBarang, cropImages FROM scan_history WHERE scanId=?').get(req.params.id);
  if (row) deleteImageFiles(row);
  db.prepare('DELETE FROM scan_history WHERE scanId=?').run(req.params.id);
  res.json({ success: true });
});

app.delete('/api/scan-history/bulk', (req, res) => {
  const { ids } = req.body;
  const getStmt = db.prepare('SELECT topViewImage, sideViewImage, fotoBarang, cropImages FROM scan_history WHERE scanId=?');
  const delStmt = db.prepare('DELETE FROM scan_history WHERE scanId=?');
  const deleteMany = db.transaction((idList) => {
    for (const id of idList) {
      const row = getStmt.get(id);
      if (row) deleteImageFiles(row);
      delStmt.run(id);
    }
  });
  deleteMany(ids);
  res.json({ success: true });
});

// === SETTINGS API ===
app.get('/api/settings', (_req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  for (const r of rows) settings[r.key] = r.value;
  res.json(settings);
});

app.post('/api/settings', (req, res) => {
  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  const saveAll = db.transaction((obj) => {
    for (const [key, value] of Object.entries(obj)) stmt.run(key, String(value));
  });
  saveAll(req.body);
  appSettings = loadSettings();
  res.json({ success: true, message: 'Settings saved. If changing App Role, please restart the server.' });
});

// === USERS API ===
const seedAdmin = () => {
  const admin = db.prepare('SELECT * FROM users WHERE email = ?').get('admin@technohub.co.id');
  if (!admin) {
    db.prepare(`
      INSERT INTO users (id, name, email, password, warehouseName)
      VALUES (?, ?, ?, ?, ?)
    `).run(crypto.randomUUID(), 'Administrator', 'admin@technohub.co.id', 'password', 'Main Warehouse');
    console.log('👤 Default admin user created');
  }
};
seedAdmin();

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ? AND password = ?').get(email, password);
  if (!user) return res.status(401).json({ error: 'Invalid email or password' });

  // Simple token-less response for this mockup
  const { password: _, ...userInfo } = user;
  res.json({ user: userInfo });
});

app.get('/api/users', (_req, res) => {
  const rows = db.prepare('SELECT id, name, email, warehouseName, role FROM users').all();
  res.json(rows);
});

app.post('/api/users', (req, res) => {
  const { name, email, password, warehouseName, role } = req.body;
  try {
    db.prepare(`
      INSERT INTO users (id, name, email, password, warehouseName, role)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(crypto.randomUUID(), name, email, password, warehouseName, role || 'user');
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.put('/api/users/:id', (req, res) => {
  const { name, email, password, warehouseName, role } = req.body;
  if (password) {
    db.prepare('UPDATE users SET name=?, email=?, password=?, warehouseName=?, role=? WHERE id=?')
      .run(name, email, password, warehouseName, role || 'user', req.params.id);
  } else {
    db.prepare('UPDATE users SET name=?, email=?, warehouseName=?, role=? WHERE id=?')
      .run(name, email, warehouseName, role || 'user', req.params.id);
  }
  res.json({ success: true });
});

app.delete('/api/users/:id', (req, res) => {
  db.prepare('DELETE FROM users WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// === HUB RECEIVER ENDPOINT & SYNC AGENT ===
// Helper to convert local image to base64 for payload
function getBase64Image(urlPath) {
    if (!urlPath) return null;
    const filename = urlPath.split('/').pop();
    if (!filename) return null;
    const filepath = join(UPLOADS_DIR, filename);
    if (!existsSync(filepath)) return null;
    const ext = extname(filename).replace('.', '') || 'png';
    const buffer = readFileSync(filepath);
    return `data:image/${ext};base64,${buffer.toString('base64')}`;
}

app.post('/api/sync/receive', async (req, res) => {
    if (appSettings.appRole !== 'Hub' || !pgPool) {
        return res.status(400).json({ error: 'Server is not configured as Central Hub' });
    }
    const s = req.body;
    
    const saveImage = (b64, prefix) => {
        if (!b64) return null;
        const matches = b64.match(/^data:(.+);base64,(.+)$/);
        if (!matches) return null;
        const ext = matches[1].includes('png') ? '.png' : '.jpg';
        const buffer = Buffer.from(matches[2], 'base64');
        const filename = `${prefix}-${crypto.randomUUID()}${ext}`;
        writeFileSync(join(UPLOADS_DIR, filename), buffer);
        return `/uploads/${filename}`;
    };

    const topView = saveImage(s.topViewImageB64, 'top');
    const sideView = saveImage(s.sideViewImageB64, 'side');
    const fotoBarang = saveImage(s.fotoBarangB64, 'foto');
    
    let cropUrls = [];
    if (s.cropImagesB64 && Array.isArray(s.cropImagesB64)) {
        for (const c of s.cropImagesB64) {
            const url = saveImage(c, 'crop');
            if (url) cropUrls.push(url);
        }
    }

    try {
        await pgPool.query(`
            INSERT INTO scan_history
            (mawb, hawb, "uldNo", "totalWeight", "topViewImage", "sideViewImage", "fotoBarang", qty, status, timestamp, "submittedToCustoms", "submittedAt", "userID", "cropImages", "workstationId")
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        `, [
            s.mawb, s.hawb || null, s.uldNo || null, s.totalWeight || 0,
            topView, sideView, fotoBarang, s.qty || 0, s.status || null,
            s.timestamp || new Date().toISOString(), s.submittedToCustoms ? 1 : 0,
            s.submittedAt || null, s.userID || null,
            cropUrls.length > 0 ? JSON.stringify(cropUrls) : null,
            s.workstationId
        ]);
        
        // Broadcast SSE to refresh Hub Dashboard
        const eventData = JSON.stringify({ action: 'reload_dashboard' });
        clients.forEach(c => {
            try { c.res.write(`event: hub-sync\ndata: ${eventData}\n\n`); } catch(e){}
        });
        
        res.json({ success: true });
    } catch (e) {
        console.error('Hub Receiver DB Error:', e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/sync/receive_cloud', async (req, res) => {
    if (appSettings.appRole !== 'Cloud' || !pgPool) {
        return res.status(400).json({ error: 'Server is not configured as Cloud' });
    }
    const s = req.body;
    
    const saveImage = (b64, prefix) => {
        if (!b64) return null;
        const matches = b64.match(/^data:(.+);base64,(.+)$/);
        if (!matches) return null;
        const ext = matches[1].includes('png') ? '.png' : '.jpg';
        const buffer = Buffer.from(matches[2], 'base64');
        const filename = `${prefix}-${crypto.randomUUID()}${ext}`;
        writeFileSync(join(UPLOADS_DIR, filename), buffer);
        return `/uploads/${filename}`;
    };

    const topView = saveImage(s.topViewImageB64, 'top');
    const sideView = saveImage(s.sideViewImageB64, 'side');
    const fotoBarang = saveImage(s.fotoBarangB64, 'foto');
    
    let cropUrls = [];
    if (s.cropImagesB64 && Array.isArray(s.cropImagesB64)) {
        for (const c of s.cropImagesB64) {
            const url = saveImage(c, 'crop');
            if (url) cropUrls.push(url);
        }
    }

    try {
        await pgPool.query(`
            INSERT INTO scan_history
            (mawb, hawb, "uldNo", "totalWeight", "topViewImage", "sideViewImage", "fotoBarang", qty, status, timestamp, "submittedToCustoms", "submittedAt", "userID", "cropImages", "workstationId")
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        `, [
            s.mawb, s.hawb || null, s.uldNo || null, s.totalWeight || 0,
            topView, sideView, fotoBarang, s.qty || 0, s.status || null,
            s.timestamp || new Date().toISOString(), s.submittedToCustoms ? 1 : 0,
            s.submittedAt || null, s.userID || null,
            cropUrls.length > 0 ? JSON.stringify(cropUrls) : null,
            s.workstationId
        ]);
        
        // Broadcast SSE to refresh Cloud Dashboard (can reuse hub-sync event)
        const eventData = JSON.stringify({ action: 'reload_dashboard' });
        clients.forEach(c => {
            try { c.res.write(`event: hub-sync\ndata: ${eventData}\n\n`); } catch(e){}
        });
        
        res.json({ success: true });
    } catch (e) {
        console.error('Cloud Receiver DB Error:', e);
        res.status(500).json({ error: e.message });
    }
});

setInterval(async () => {
    appSettings = loadSettings(); 
    if (appSettings.appRole !== 'Workstation' || !appSettings.hubUrl) return;
    
    const pending = db.prepare('SELECT * FROM scan_history WHERE isSyncedToHub = 0 LIMIT 5').all();
    if (pending.length === 0) return;
    
    for (const row of pending) {
        try {
            let cropB64 = [];
            if (row.cropImages) {
                try {
                    const parsed = JSON.parse(row.cropImages);
                    for (const c of parsed) {
                        const b = getBase64Image(c);
                        if (b) cropB64.push(b);
                    }
                } catch(e){}
            }

            const payload = {
                ...row,
                workstationId: appSettings.workstationId || 'Unknown',
                topViewImageB64: getBase64Image(row.topViewImage),
                sideViewImageB64: getBase64Image(row.sideViewImage),
                fotoBarangB64: getBase64Image(row.fotoBarang),
                cropImagesB64: cropB64
            };

            const response = await fetch(`${appSettings.hubUrl}/api/sync/receive`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                db.prepare('UPDATE scan_history SET isSyncedToHub = 1 WHERE scanId = ?').run(row.scanId);
                console.log(`✅ Synced scanId ${row.scanId} to Hub`);
            } else {
                console.warn(`⚠️ Failed to sync scanId ${row.scanId} to Hub: ${response.statusText}`);
            }
        } catch (e) {
            console.error(`❌ Sync error for scanId ${row.scanId}:`, e.message);
        }
    }
}, 5000);

setInterval(async () => {
    appSettings = loadSettings(); 
    if (appSettings.appRole !== 'Hub' || !appSettings.cloudUrl || !pgPool) return;
    
    try {
        const { rows: pending } = await pgPool.query('SELECT * FROM scan_history WHERE "isSyncedToCloud" = 0 LIMIT 5');
        if (pending.length === 0) return;
        
        for (const row of pending) {
            try {
                let cropB64 = [];
                if (row.cropImages) {
                    try {
                        const parsed = JSON.parse(row.cropImages);
                        for (const c of parsed) {
                            const b = getBase64Image(c);
                            if (b) cropB64.push(b);
                        }
                    } catch(e){}
                }

                const payload = {
                    ...row,
                    workstationId: row.workstationId || appSettings.workstationId || 'UnknownHub',
                    topViewImageB64: getBase64Image(row.topViewImage),
                    sideViewImageB64: getBase64Image(row.sideViewImage),
                    fotoBarangB64: getBase64Image(row.fotoBarang),
                    cropImagesB64: cropB64
                };

                const response = await fetch(`${appSettings.cloudUrl}/api/sync/receive_cloud`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (response.ok) {
                    await pgPool.query('UPDATE scan_history SET "isSyncedToCloud" = 1 WHERE "scanId" = $1', [row.scanId]);
                    console.log(`☁️ Synced scanId ${row.scanId} to Cloud`);
                } else {
                    console.warn(`⚠️ Failed to sync scanId ${row.scanId} to Cloud: ${response.statusText}`);
                }
            } catch (e) {
                console.error(`❌ Cloud Sync error for scanId ${row.scanId}:`, e.message);
            }
        }
    } catch (dbErr) {
        // PG error catching
    }
}, 5000);

// === FALLBACK: Serve React app ===
app.get('{*path}', (_req, res) => {
  const indexPath = join(__dirname, 'dist', 'index.html');
  if (existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('Frontend not built. Run: npm run build');
  }
});

// === FIXED CAMERA SCANNER INTEGRATION (TCP + FTP) ===
const cameraBuffer = new Map();
const fixedCameraMode = appSettings.fixedCameraIntegration || 'TCP_FTP';

if (fixedCameraMode === 'TCP_FTP') {
    const TCP_PORT = parseInt(appSettings.tcpPort || '1337', 10);
    const FTP_PORT = parseInt(appSettings.ftpPort || '2121', 10);

    // TCP Listener
    const tcpServer = net.createServer((socket) => {
        socket.on('data', (data) => {
            try {
                const text = data.toString().trim();
                if (!text) return;
                const parts = text.split('_');
                if (parts.length >= 3) {
                    const mawb = parts[0];
                    const hawb = parts[1] === 'NONE' ? '' : parts[1];
                    const timestamp = parts[2];
                    const bufferKey = `${mawb}_${parts[1]}_${timestamp}`;
                    console.log(`[TCP] Received key: ${bufferKey}`);
                    const textData = { mawb, hawb };
                    if (cameraBuffer.has(bufferKey)) {
                        const existing = cameraBuffer.get(bufferKey);
                        existing.textData = textData;
                        if (existing.imagePath) { clearTimeout(existing.timer); broadcastCameraData(bufferKey); }
                    } else {
                        const timer = setTimeout(() => { broadcastCameraData(bufferKey); }, 5000);
                        cameraBuffer.set(bufferKey, { textData, imagePath: null, timer });
                    }
                }
            } catch (e) { console.error('TCP Data parse error:', e); }
        });
    });
    tcpServer.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.warn(`⚠️  Port ${TCP_PORT} (TCP) already in use. Kill old process and restart.`);
        } else { console.error('TCP Server error:', err); }
    });
    tcpServer.listen(TCP_PORT, '0.0.0.0', () => {
        console.log(`🔌 TCP Fixed Camera Scanner listening on port ${TCP_PORT}`);
    });

    // FTP Server
    const ftpServer = new FtpSrv({
        url: `ftp://0.0.0.0:${FTP_PORT}`,
        pasv_url: '127.0.0.1',
        anonymous: true,
        greeting: ['Welcome to X-Ray FTP Server']
    });
    ftpServer.on('login', ({ connection }, resolve) => {
        connection.on('STOR', (error, fileName) => {
            if (error) return;
            import('path').then(({ basename }) => {
                const actualFileName = basename(fileName);
                const baseName = actualFileName.replace(/\.(jpg|jpeg|png)$/i, '');
                const bufferKey = baseName;
                console.log(`[FTP] Received key: ${bufferKey}`);
                if (cameraBuffer.has(bufferKey)) {
                    const existing = cameraBuffer.get(bufferKey);
                    existing.imagePath = actualFileName;
                    if (existing.textData) { clearTimeout(existing.timer); broadcastCameraData(bufferKey); }
                } else {
                    const timer = setTimeout(() => {
                        const entry = cameraBuffer.get(bufferKey);
                        if (entry) { entry.textData = { mawb: '', hawb: '' }; broadcastCameraData(bufferKey); }
                    }, 5000);
                    cameraBuffer.set(bufferKey, { textData: null, imagePath: actualFileName, timer });
                }
            });
        });
        resolve({ root: UPLOADS_DIR });
    });
    ftpServer.listen().then(() => {
        console.log(`📁 FTP Fixed Camera Scanner listening on port ${FTP_PORT}`);
    }).catch((err) => {
        if (err.code === 'EADDRINUSE') {
            console.warn(`⚠️  Port ${FTP_PORT} (FTP) already in use. Kill old process and restart.`);
        } else { console.error('FTP Server error:', err.message); }
    });

} else {
    console.log(`📷 Fixed Camera Integration: ${fixedCameraMode} (TCP/FTP servers not started)`);
}

function broadcastCameraData(key) {
    const data = cameraBuffer.get(key);
    if (!data) return;

    const eventData = JSON.stringify({
        mawb: data.textData.mawb || '',
        hawb: data.textData.hawb || '',
        fotoBarang: data.imagePath ? `/uploads/${data.imagePath}` : null
    });

    console.log(`📡 Broadcasting Fixed Camera Data: MAWB=${data.textData.mawb}, Foto=${data.imagePath ? 'Yes' : 'No'}`);
    clients.forEach(c => {
        try { c.res.write(`event: ocr-data\ndata: ${eventData}\n\n`); } catch(e){}
    });

    cameraBuffer.delete(key);
}

app.listen(PORT, () => {
  console.log(`✅ X-Ray Server running at http://localhost:${PORT}`);
  console.log(`📁 Database: ${DB_PATH}`);
  console.log(`🖼️  Uploads: ${UPLOADS_DIR}`);
});
