import express from 'express';
import cors from 'cors';
import multer from 'multer';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join, extname } from 'path';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 3000;

// === DIRECTORIES ===
const UPLOADS_DIR = join(__dirname, 'uploads');
const DB_PATH = join(__dirname, 'xray.db');
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
    submittedAt TEXT
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

// === MIDDLEWARE ===
app.use(cors());
app.use(express.json({ limit: '50mb' }));

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
  `).run({ ...c, isSentToCeisa: c.isSentToCeisa ? 1 : 0 });
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
    for (const c of items) stmt.run({ ...c, isSentToCeisa: c.isSentToCeisa ? 1 : 0 });
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
  `).run({ ...c, id: req.params.id, isSentToCeisa: c.isSentToCeisa ? 1 : 0 });
  res.json({ success: true });
});

app.delete('/api/cargo/:id', (req, res) => {
  db.prepare('DELETE FROM cargo WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// === SCAN HISTORY API ===
app.get('/api/scan-history', (_req, res) => {
  const rows = db.prepare('SELECT * FROM scan_history ORDER BY scanId DESC').all();
  res.json(rows.map(r => ({ ...r, submittedToCustoms: !!r.submittedToCustoms })));
});

app.post('/api/scan-history', (req, res) => {
  const s = req.body;
  const info = db.prepare(`
    INSERT INTO scan_history
      (mawb, hawb, uldNo, totalWeight, topViewImage, sideViewImage, fotoBarang, qty, status, timestamp, submittedToCustoms, submittedAt)
    VALUES
      (@mawb, @hawb, @uldNo, @totalWeight, @topViewImage, @sideViewImage, @fotoBarang, @qty, @status, @timestamp, @submittedToCustoms, @submittedAt)
  `).run({ ...s, submittedToCustoms: s.submittedToCustoms ? 1 : 0, submittedAt: s.submittedAt || null });
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
}

app.delete('/api/scan-history/:id', (req, res) => {
  const row = db.prepare('SELECT topViewImage, sideViewImage, fotoBarang FROM scan_history WHERE scanId=?').get(req.params.id);
  if (row) deleteImageFiles(row);
  db.prepare('DELETE FROM scan_history WHERE scanId=?').run(req.params.id);
  res.json({ success: true });
});

app.delete('/api/scan-history/bulk', (req, res) => {
  const { ids } = req.body;
  const getStmt = db.prepare('SELECT topViewImage, sideViewImage, fotoBarang FROM scan_history WHERE scanId=?');
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
  res.json({ success: true });
});

// === FALLBACK: Serve React app ===
app.get('{*path}', (_req, res) => {
  const indexPath = join(__dirname, 'dist', 'index.html');
  if (existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('Frontend not built. Run: npm run build');
  }
});

app.listen(PORT, () => {
  console.log(`✅ X-Ray Server running at http://localhost:${PORT}`);
  console.log(`📁 Database: ${DB_PATH}`);
  console.log(`🖼️  Uploads: ${UPLOADS_DIR}`);
});
