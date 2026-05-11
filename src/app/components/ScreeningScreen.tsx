import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle, XCircle, Package, ImageIcon, Upload, Eye, ScanLine, Layers, Loader2, Wifi, WifiOff } from 'lucide-react';
import { toast } from 'sonner';
import { scanDB, uploadBase64Image, uploadFileImage, settingsAPI } from '../../db/db';
import type { ScanHistoryItem } from '../../db/db';
import { useAuth } from '../context/AuthContext';
import { ImageZoomModal } from './ui/ImageZoomModal';
import { getObjectDetector } from '../utils/mediapipe';

interface CargoData {
    id: string;
    uldNo: string;
    mawb: string;
    hawb: string;
    totalPcs: number;
    totalWeight: number;
    goodsDescription: string;
    actualPcs: number;
    remarks: string;
    actualTime: string;
    statusComplete: 'Yes' | 'No';
}

interface BBox { minX: number; minY: number; maxX: number; maxY: number; count: number; }

/** Client-side threshold + connected component detection on a downsampled canvas.
 *  Returns bounding boxes scaled back to (displayW, displayH). */
function detectKoliBBoxes(
    video: HTMLVideoElement,
    displayW: number,
    displayH: number,
    baselineCanvases?: HTMLCanvasElement[] | null
): BBox[] {
    const VW = video.videoWidth;
    const VH = video.videoHeight;
    if (!VW || !VH) return [];

    // Downsample to max 320px wide for speed
    const SCALE = Math.min(1, 320 / VW);
    const W = Math.round(VW * SCALE);
    const H = Math.round(VH * SCALE);

    const offscreen = document.createElement('canvas');
    offscreen.width = W;
    offscreen.height = H;
    const ctx = offscreen.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(video, 0, 0, W, H);
    const { data } = ctx.getImageData(0, 0, W, H); // RGBA

    let baselineDatas: Uint8ClampedArray[] = [];
    if (baselineCanvases && baselineCanvases.length > 0) {
        baselineCanvases.forEach(canvas => {
            const bgOffscreen = document.createElement('canvas');
            bgOffscreen.width = W;
            bgOffscreen.height = H;
            const bgCtx = bgOffscreen.getContext('2d', { willReadFrequently: true })!;
            bgCtx.drawImage(canvas, 0, 0, W, H);
            baselineDatas.push(bgCtx.getImageData(0, 0, W, H).data);
        });
    }

    const mask = new Uint8Array(W * H);

    if (baselineDatas.length > 0) {
        // Use background subtraction against multiple baselines
        for (let i = 0; i < W * H; i++) {
            const r1 = data[i * 4], g1 = data[i * 4 + 1], b1 = data[i * 4 + 2];
            const gray1 = (r1 * 77 + g1 * 150 + b1 * 29) >> 8;
            
            let isBackground = false;
            for (const bgData of baselineDatas) {
                const r2 = bgData[i * 4], g2 = bgData[i * 4 + 1], b2 = bgData[i * 4 + 2];
                const gray2 = (r2 * 77 + g2 * 150 + b2 * 29) >> 8;
                
                const diff = Math.abs(gray1 - gray2);
                if (diff <= 35) {
                    isBackground = true;
                    break; // Matched a baseline, so it's background
                }
            }
            mask[i] = isBackground ? 0 : 1;
        }
    } else {
        // Fallback to mean thresholding
        const gray = new Uint8Array(W * H);
        let sum = 0;
        for (let i = 0; i < W * H; i++) {
            const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
            gray[i] = (r * 77 + g * 150 + b * 29) >> 8;
            sum += gray[i];
        }
        const mean = sum / (W * H);
        const THRESHOLD = Math.min(Math.max(mean * 0.8, 20), 200);

        for (let i = 0; i < gray.length; i++) mask[i] = gray[i] > THRESHOLD ? 1 : 0;
    }

    // Connected component labeling (2-pass union-find)
    const labels = new Int32Array(W * H).fill(0);
    let nextLabel = 1;
    const parent: number[] = [0];

    function find(x: number): number {
        while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
        return x;
    }
    function union(a: number, b: number) {
        const ra = find(a), rb = find(b);
        if (ra !== rb) parent[ra] = rb;
    }

    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const idx = y * W + x;
            if (!mask[idx]) continue;
            const top = y > 0 ? labels[(y - 1) * W + x] : 0;
            const left = x > 0 ? labels[y * W + x - 1] : 0;
            if (!top && !left) { labels[idx] = nextLabel; parent.push(nextLabel); nextLabel++; }
            else if (top && !left) { labels[idx] = top; }
            else if (!top && left) { labels[idx] = left; }
            else { labels[idx] = Math.min(top, left); union(top, left); }
        }
    }
    for (let i = 0; i < labels.length; i++) if (labels[i]) labels[i] = find(labels[i]);

    // Bounding boxes
    const bboxMap: Record<number, BBox> = {};
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const lbl = labels[y * W + x];
            if (!lbl) continue;
            if (!bboxMap[lbl]) bboxMap[lbl] = { minX: x, minY: y, maxX: x, maxY: y, count: 0 };
            const b = bboxMap[lbl];
            if (x < b.minX) b.minX = x;
            if (y < b.minY) b.minY = y;
            if (x > b.maxX) b.maxX = x;
            if (y > b.maxY) b.maxY = y;
            b.count++;
        }
    }

    const MIN_AREA = W * H * 0.005;
    const MIN_DIM = Math.min(W, H) * 0.03;
    const valid = Object.values(bboxMap).filter(b => {
        const w = b.maxX - b.minX, h = b.maxY - b.minY;
        return b.count >= MIN_AREA && w >= MIN_DIM && h >= MIN_DIM;
    });

    // Scale bboxes: from downsampled video coords → display coords
    // Video aspect may differ from display aspect (object-cover behaviour)
    const videoAspect = VW / VH;
    const displayAspect = displayW / displayH;
    let renderW: number, renderH: number, offsetX: number, offsetY: number;
    if (videoAspect > displayAspect) {
        // video is wider than display → letterbox left/right
        renderH = displayH;
        renderW = displayH * videoAspect;
        offsetX = (displayW - renderW) / 2;
        offsetY = 0;
    } else {
        // video is taller than display → letterbox top/bottom
        renderW = displayW;
        renderH = displayW / videoAspect;
        offsetX = 0;
        offsetY = (displayH - renderH) / 2;
    }

    return valid.map(b => ({
        minX: (b.minX / W) * renderW + offsetX,
        minY: (b.minY / H) * renderH + offsetY,
        maxX: (b.maxX / W) * renderW + offsetX,
        maxY: (b.maxY / H) * renderH + offsetY,
        count: b.count,
    }));
}

const ScreeningScreen = () => {
    const { user } = useAuth();
    const { cargoId } = useParams();
    const [cargo, setCargo] = useState<CargoData | null>(null);
    const [mawb, setMawb] = useState<string>('');
    const [hawb, setHawb] = useState<string>('');
    const [actualPcs, setActualPcs] = useState<number>(1);
    const [fotoBarang, setFotoBarang] = useState<string | null>(null);
    const [fotoBarangFile, setFotoBarangFile] = useState<File | null>(null);
    const topVideoRef = useRef<HTMLVideoElement>(null);
    const sideVideoRef = useRef<HTMLVideoElement>(null);
    const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
    const overlaySideCanvasRef = useRef<HTMLCanvasElement>(null);
    const highlightCanvasRef = useRef<HTMLCanvasElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const mawbInputRef = useRef<HTMLInputElement>(null);
    const hawbInputRef = useRef<HTMLInputElement>(null);

    const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
    const [topDeviceId, setTopDeviceId] = useState<string>('');
    const [sideDeviceId, setSideDeviceId] = useState<string>('');

    const [recentScans, setRecentScans] = useState<ScanHistoryItem[]>([]);
    const [recordsPerPage, setRecordsPerPage] = useState<number | 'All'>(10);
    const [selectedScan, setSelectedScan] = useState<ScanHistoryItem | null>(null);
    const [zoomImage, setZoomImage] = useState<string | null>(null);

    // AI Vision state
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [cropImages, setCropImages] = useState<string[]>([]);
    const [cropBBoxes, setCropBBoxes] = useState<{x: number, y: number, w: number, h: number, source?: 'top' | 'side'}[]>([]);
    const [hoveredCropIndex, setHoveredCropIndex] = useState<number | null>(null);
    const [aiDetectedCount, setAiDetectedCount] = useState<number | null>(null);
    const [liveKoliCount, setLiveKoliCount] = useState<number>(0);
    const [scannerConnected, setScannerConnected] = useState(false);
    const [aiMethod, setAiMethod] = useState<'OpenCV' | 'MediaPipe' | 'Manual'>('OpenCV');
    const [fixedCameraIntegration, setFixedCameraIntegration] = useState<'TCP_FTP'|'JSON_API'|'NONE'>('TCP_FTP');
    const [baselineUrls, setBaselineUrls] = useState<string[]>([]);
    const baselineCanvasRefs = useRef<HTMLCanvasElement[]>([]);
    const [isDrawing, setIsDrawing] = useState(false);
    const [startPoint, setStartPoint] = useState<{x: number, y: number} | null>(null);
    const [currentBox, setCurrentBox] = useState<{x: number, y: number, w: number, h: number} | null>(null);
    const [activeCanvas, setActiveCanvas] = useState<'top' | 'side' | null>(null);

    const loadRecentScans = async () => {
        try {
            const data = await scanDB.getAll();
            const sorted = data.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            setRecentScans(sorted);
        } catch (e) { console.error('Failed fetching recent scans'); }
    };

    // OCR Scanner Real-time Integration via SSE
    useEffect(() => {
        if (fixedCameraIntegration === 'NONE') {
            setScannerConnected(false);
            return;
        }

        let eventSource: EventSource;
        let reconnectTimeout: any;

        const connect = () => {
            console.log('📡 Attempting to connect to Scanner Event Stream...');
            eventSource = new EventSource('/api/events');

            eventSource.onopen = () => {
                console.log('✅ Connected to Scanner Event Stream');
                setScannerConnected(true);
            };

            eventSource.addEventListener('ocr-data', (event) => {
                console.log('📩 OCR Data received:', event.data);
                try {
                    const data = JSON.parse(event.data);
                    if (data.mawb) {
                        setMawb(data.mawb);
                        setHawb(data.hawb || '');
                        if (data.fotoBarang) {
                            setFotoBarang(data.fotoBarang);
                            setFotoBarangFile(null); // Clear any previously selected file
                        }
                        toast.success('Data AWB terisi otomatis dari Scanner OCR', { 
                            description: `MAWB: ${data.mawb}${data.fotoBarang ? ' (+ Foto)' : ''}`,
                            icon: <ScanLine size={16} className="text-blue-500" />
                        });
                    }
                } catch (err) {
                    console.error('❌ Error parsing OCR data:', err);
                }
            });

            eventSource.onerror = (err) => {
                console.error('❌ Scanner Event Stream Error:', err);
                setScannerConnected(false);
                eventSource.close();
                
                // Reconnect after 5 seconds without page reload
                reconnectTimeout = setTimeout(connect, 5000);
            };
        };

        connect();

        return () => {
            if (eventSource) eventSource.close();
            if (reconnectTimeout) clearTimeout(reconnectTimeout);
        };
    }, [fixedCameraIntegration]);

    useEffect(() => {
        // Fetch from IndexedDB first
        settingsAPI.getAll().then((s: any) => {
            if (Object.keys(s).length > 0) {
                if (s.recordsPerPage) setRecordsPerPage(s.recordsPerPage === 'All' ? 'All' : Number(s.recordsPerPage));
                if (s.aiMethod) setAiMethod(s.aiMethod as any);
                if (s.fixedCameraIntegration) setFixedCameraIntegration(s.fixedCameraIntegration as any);
            } else {
                // Fallback to localStorage if empty
                const savedSettings = localStorage.getItem('apiSettings');
                if (savedSettings) {
                    try {
                        const parsed = JSON.parse(savedSettings);
                        if (parsed.recordsPerPage) setRecordsPerPage(parsed.recordsPerPage === 'All' ? 'All' : Number(parsed.recordsPerPage));
                        if (parsed.aiMethod) setAiMethod(parsed.aiMethod);
                        if (parsed.fixedCameraIntegration) setFixedCameraIntegration(parsed.fixedCameraIntegration);
                    } catch (e) { }
                }
            }
        }).catch(() => {
            const savedSettings = localStorage.getItem('apiSettings');
            if (savedSettings) {
                try {
                    const parsed = JSON.parse(savedSettings);
                    if (parsed.recordsPerPage) setRecordsPerPage(parsed.recordsPerPage === 'All' ? 'All' : Number(parsed.recordsPerPage));
                    if (parsed.aiMethod) setAiMethod(parsed.aiMethod);
                    if (parsed.fixedCameraIntegration) setFixedCameraIntegration(parsed.fixedCameraIntegration);
                } catch (e) { }
            }
        });

        const savedBaselines = localStorage.getItem('xray_baseline_images');
        if (savedBaselines) {
            try {
                const urls = JSON.parse(savedBaselines);
                if (Array.isArray(urls)) setBaselineUrls(urls);
            } catch (e) {}
        } else {
            // Backward compatibility for old single baseline
            const oldBaseline = localStorage.getItem('xray_baseline_image');
            if (oldBaseline) {
                setBaselineUrls([oldBaseline]);
                localStorage.setItem('xray_baseline_images', JSON.stringify([oldBaseline]));
                localStorage.removeItem('xray_baseline_image');
            }
        }
        loadRecentScans();
    }, []);

    useEffect(() => {
        baselineCanvasRefs.current = [];
        if (baselineUrls.length > 0) {
            baselineUrls.forEach(url => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext('2d');
                    ctx?.drawImage(img, 0, 0);
                    baselineCanvasRefs.current.push(canvas);
                };
                img.src = url;
            });
        }
    }, [baselineUrls]);

    useEffect(() => {
        if (cargoId) {
            fetch(`/api/cargo`).then(r => r.json()).then((list: any[]) => {
                const found = list.find((c: any) => c.id === cargoId);
                if (found) {
                    setCargo(found);
                    setMawb(found.mawb || '');
                    setHawb(found.hawb || '');
                    setActualPcs(1);
                } else {
                    toast.error('Cargo tidak ditemukan');
                }
            }).catch(() => {
                const cargoList = JSON.parse(localStorage.getItem('cargoData') || '[]');
                const foundCargo = cargoList.find((c: any) => c.id === cargoId);
                if (foundCargo) { setCargo(foundCargo); setMawb(foundCargo.mawb || ''); setHawb(foundCargo.hawb || ''); setActualPcs(1); }
            });
        } else {
            setActualPcs(1);
        }
        setTimeout(() => { mawbInputRef.current?.focus(); }, 100);
    }, [cargoId]);

    useEffect(() => {
        const getDevices = async () => {
            try {
                await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
                const devices = await navigator.mediaDevices.enumerateDevices();
                const videoInputs = devices.filter(device => device.kind === 'videoinput');
                setVideoDevices(videoInputs);
                if (videoInputs.length > 0) {
                    setTopDeviceId(videoInputs[0].deviceId);
                    setSideDeviceId(videoInputs.length > 1 ? videoInputs[1].deviceId : videoInputs[0].deviceId);
                }
            } catch (err) {
                console.error("Error accessing camera:", err);
                toast.error("Tidak dapat mengakses kamera / capture card.");
            }
        };
        getDevices();
    }, []);

    useEffect(() => {
        if (!topDeviceId) return;
        let stream: MediaStream;
        const start = async () => {
            try {
                stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: topDeviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
                if (topVideoRef.current) { topVideoRef.current.srcObject = stream; topVideoRef.current.play().catch(e => console.error("Play error top:", e)); }
            } catch (err) { console.error("Error top camera:", err); }
        };
        start();
        return () => { if (stream) stream.getTracks().forEach(track => track.stop()); };
    }, [topDeviceId]);

    useEffect(() => {
        if (!sideDeviceId) return;
        let stream: MediaStream;
        const start = async () => {
            try {
                stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: sideDeviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
                if (sideVideoRef.current) { sideVideoRef.current.srcObject = stream; sideVideoRef.current.play().catch(e => console.error("Play error side:", e)); }
            } catch (err) { console.error("Error side camera:", err); }
        };
        start();
        return () => { if (stream) stream.getTracks().forEach(track => track.stop()); };
    }, [sideDeviceId]);

    // === Live bounding box overlay ===
    const drawOverlay = useCallback(() => {
        // --- TOP VIEW ---
        const video = topVideoRef.current;
        const canvas = overlayCanvasRef.current;
        if (canvas && video && video.readyState >= 2) {
            const rect = video.getBoundingClientRect();
            const dW = rect.width || video.clientWidth;
            const dH = rect.height || video.clientHeight;
            if (dW && dH) {
                canvas.width = dW;
                canvas.height = dH;
                const ctx = canvas.getContext('2d')!;
                ctx.clearRect(0, 0, dW, dH);

                if (aiMethod === 'Manual') {
                    cropBBoxes.forEach((b, i) => {
                        if (b.source === 'side') return;
                        ctx.strokeStyle = 'rgba(59, 130, 246, 0.9)'; // blue-500
                        ctx.lineWidth = 2.5;
                        ctx.strokeRect(b.x, b.y, b.w, b.h);
                        
                        const label = `Manual #${i + 1}`;
                        ctx.font = 'bold 11px sans-serif';
                        const textW = ctx.measureText(label).width;
                        ctx.fillStyle = 'rgba(37, 99, 235, 0.85)';
                        const labelY = b.y > 20 ? b.y - 4 : b.y + b.h + 18;
                        ctx.fillRect(b.x, labelY - 14, textW + 10, 18);
                        ctx.fillStyle = '#ffffff';
                        ctx.fillText(label, b.x + 5, labelY);
                    });

                    if (currentBox && activeCanvas === 'top') {
                        ctx.strokeStyle = 'rgba(239, 68, 68, 0.9)'; // red-500
                        ctx.lineWidth = 2;
                        ctx.setLineDash([5, 5]);
                        ctx.strokeRect(currentBox.x, currentBox.y, currentBox.w, currentBox.h);
                        ctx.setLineDash([]);
                    }
                } else {
                    const bboxes = detectKoliBBoxes(video, dW, dH, baselineCanvasRefs.current);
                    setLiveKoliCount(bboxes.length);

                    bboxes.forEach((b, i) => {
                        const x = b.minX, y = b.minY;
                        const w = b.maxX - b.minX, h = b.maxY - b.minY;
                        const PADDING = Math.min(dW, dH) * 0.01;
                        const rx = Math.max(0, x - PADDING), ry = Math.max(0, y - PADDING);
                        const rw = Math.min(dW - rx, w + PADDING * 2), rh = Math.min(dH - ry, h + PADDING * 2);

                        ctx.strokeStyle = 'rgba(74, 222, 128, 0.9)';  // green-400
                        ctx.lineWidth = 2.5;
                        ctx.shadowColor = 'rgba(74, 222, 128, 0.6)';
                        ctx.shadowBlur = 8;
                        ctx.strokeRect(rx, ry, rw, rh);
                        ctx.shadowBlur = 0;

                        const label = `Koli #${i + 1}`;
                        ctx.font = 'bold 11px sans-serif';
                        const textW = ctx.measureText(label).width;
                        ctx.fillStyle = 'rgba(22, 163, 74, 0.85)';  // green-600
                        const labelY = ry > 20 ? ry - 4 : ry + rh + 4;
                        const labelH = 18;
                        ctx.fillRect(rx, labelY - 14, textW + 10, labelH);
                        ctx.fillStyle = '#ffffff';
                        ctx.fillText(label, rx + 5, labelY);
                    });
                }
            }
        }

        // --- SIDE VIEW ---
        const sideVideo = sideVideoRef.current;
        const sideCanvas = overlaySideCanvasRef.current;
        if (sideCanvas && sideVideo && sideVideo.readyState >= 2) {
            const rect = sideVideo.getBoundingClientRect();
            const dW = rect.width || sideVideo.clientWidth;
            const dH = rect.height || sideVideo.clientHeight;
            if (dW && dH) {
                sideCanvas.width = dW;
                sideCanvas.height = dH;
                const ctx = sideCanvas.getContext('2d')!;
                ctx.clearRect(0, 0, dW, dH);

                if (aiMethod === 'Manual') {
                    cropBBoxes.forEach((b, i) => {
                        if (b.source !== 'side') return;
                        ctx.strokeStyle = 'rgba(245, 158, 11, 0.9)'; // amber-500
                        ctx.lineWidth = 2.5;
                        ctx.strokeRect(b.x, b.y, b.w, b.h);
                        
                        const label = `Side Crop #${i + 1}`;
                        ctx.font = 'bold 11px sans-serif';
                        const textW = ctx.measureText(label).width;
                        ctx.fillStyle = 'rgba(217, 119, 6, 0.85)';
                        const labelY = b.y > 20 ? b.y - 4 : b.y + b.h + 18;
                        ctx.fillRect(b.x, labelY - 14, textW + 10, 18);
                        ctx.fillStyle = '#ffffff';
                        ctx.fillText(label, b.x + 5, labelY);
                    });

                    if (currentBox && activeCanvas === 'side') {
                        ctx.strokeStyle = 'rgba(239, 68, 68, 0.9)'; // red-500
                        ctx.lineWidth = 2;
                        ctx.setLineDash([5, 5]);
                        ctx.strokeRect(currentBox.x, currentBox.y, currentBox.w, currentBox.h);
                        ctx.setLineDash([]);
                    }
                }
            }
        }
    }, [aiMethod, cropBBoxes, currentBox, activeCanvas]);

    useEffect(() => {
        if (aiMethod === 'Manual') {
            drawOverlay();
            return;
        }
        const interval = setInterval(drawOverlay, 800);
        return () => clearInterval(interval);
    }, [drawOverlay, aiMethod]);

    const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>, type: 'top' | 'side') => {
        if (aiMethod !== 'Manual') return;
        const canvasRef = type === 'top' ? overlayCanvasRef : overlaySideCanvasRef;
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        setStartPoint({ x, y });
        setIsDrawing(true);
        setActiveCanvas(type);
        setCurrentBox({ x, y, w: 0, h: 0 });
    };

    const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>, type: 'top' | 'side') => {
        if (aiMethod !== 'Manual' || !isDrawing || !startPoint || activeCanvas !== type) return;
        const canvasRef = type === 'top' ? overlayCanvasRef : overlaySideCanvasRef;
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        setCurrentBox({
            x: Math.min(x, startPoint.x),
            y: Math.min(y, startPoint.y),
            w: Math.abs(x - startPoint.x),
            h: Math.abs(y - startPoint.y)
        });
    };

    const handleCanvasMouseUp = (type: 'top' | 'side') => {
        if (aiMethod !== 'Manual' || !isDrawing || activeCanvas !== type) return;
        setIsDrawing(false);
        setActiveCanvas(null);
        
        if (!currentBox || currentBox.w < 20 || currentBox.h < 20) {
            setCurrentBox(null);
            return;
        }
        
        const video = type === 'top' ? topVideoRef.current : sideVideoRef.current;
        const canvas = type === 'top' ? overlayCanvasRef.current : overlaySideCanvasRef.current;
        if (!video || !canvas) {
            setCurrentBox(null);
            return;
        }

        // Video is natural-sized (w-full h-auto), so the canvas display size == video display size.
        // Just scale from canvas (display) pixels → video stream pixels.
        const scaleX = video.videoWidth / canvas.width;
        const scaleY = video.videoHeight / canvas.height;

        const srcX = Math.round(currentBox.x * scaleX);
        const srcY = Math.round(currentBox.y * scaleY);
        const srcW = Math.round(currentBox.w * scaleX);
        const srcH = Math.round(currentBox.h * scaleY);

        if (srcW < 5 || srcH < 5) { setCurrentBox(null); return; }

        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = srcW;
        cropCanvas.height = srcH;

        const ctx = cropCanvas.getContext('2d');
        if (ctx) {
            ctx.drawImage(video, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);
            const dataUrl = cropCanvas.toDataURL('image/png');
            setCropImages(prev => [...prev, dataUrl]);
            setCropBBoxes(prev => [...prev, { ...currentBox, source: type }]);
            toast.success(`Crop manual berhasil ditambahkan.`);
        }
        setCurrentBox(null);
    };

    const handleCanvasMouseLeave = (type: 'top' | 'side') => {
        if (isDrawing && activeCanvas === type) handleCanvasMouseUp(type);
    };

    const captureFrame = (videoElement: HTMLVideoElement | null): string => {
        if (!videoElement) return '';
        const canvas = document.createElement('canvas');
        canvas.width = videoElement.videoWidth || 500;
        canvas.height = videoElement.videoHeight || 350;
        const ctx = canvas.getContext('2d');
        if (ctx) { ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height); }
        return canvas.toDataURL('image/png');
    };

    const handleCalibrateBackground = () => {
        const topBase64 = captureFrame(topVideoRef.current);
        if (!topBase64 || topBase64 === 'data:,') {
            toast.error('Kamera Top View tidak aktif.');
            return;
        }
        
        setBaselineUrls(prev => {
            const newUrls = [...prev, topBase64];
            if (newUrls.length > 2) {
                newUrls.shift(); // Remove oldest to keep max 2
            }
            localStorage.setItem('xray_baseline_images', JSON.stringify(newUrls));
            return newUrls;
        });
        toast.success('Background (Baseline) berhasil dikalibrasi.');
    };

    const handleFotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setFotoBarangFile(file);
        const reader = new FileReader();
        reader.onload = (evt) => setFotoBarang(evt.target?.result as string);
        reader.readAsDataURL(file);
    };

    // === AI Vision: Analyze & Autocrop ===
    const handleAIAnalyze = async () => {
        const topBase64 = captureFrame(topVideoRef.current);
        if (!topBase64 || topBase64 === 'data:,') {
            toast.error('Kamera Top View tidak aktif. Pastikan kamera terhubung.');
            return;
        }

        setIsAnalyzing(true);
        setCropImages([]);
        setCropBBoxes([]);
        setAiDetectedCount(null);
        toast.loading(`AI (${aiMethod}) sedang menganalisa gambar...`, { id: 'ai-analyze' });

        try {
            if (aiMethod === 'OpenCV') {
                // SERVER-SIDE OPENCV METHOD
                const res = await fetch('/api/ai-analyze', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ dataUrl: topBase64, baselineUrls: baselineUrls.length > 0 ? baselineUrls : undefined }),
                });

                if (!res.ok) {
                    const err = await res.json();
                    throw new Error(err.error || 'Analisis gagal');
                }

                const { koliCount, cropUrls, cropData } = await res.json();
                setCropImages(cropUrls);
                setCropBBoxes(cropData ? cropData.map((c: any) => c.bbox) : []);
                setAiDetectedCount(koliCount);
                setActualPcs(koliCount > 0 ? koliCount : 1);

                if (koliCount === 0) {
                    toast.warning('AI (OpenCV) tidak mendeteksi koli. Cek pencahayaan.', { id: 'ai-analyze' });
                } else {
                    toast.success(`AI (OpenCV) mendeteksi ${koliCount} koli.`, { id: 'ai-analyze' });
                }
            } else {
                // CLIENT-SIDE MEDIAPIPE METHOD
                if (baselineUrls.length > 0) {
                    // Use highly accurate BGS bounding boxes directly
                    const videoElement = topVideoRef.current;
                    if (!videoElement) throw new Error("Video element not found");
                    
                    const videoW = videoElement.videoWidth;
                    const videoH = videoElement.videoHeight;
                    const bboxesVideoCoords = detectKoliBBoxes(videoElement, videoW, videoH, baselineCanvasRefs.current);
                    
                    if (bboxesVideoCoords.length === 0) {
                        toast.warning('AI (BGS) tidak mendeteksi koli.', { id: 'ai-analyze' });
                        setActualPcs(1);
                        return;
                    }

                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    if (!ctx) throw new Error("Canvas context failed");
                    
                    const urls: string[] = [];
                    const boxes: {x: number, y: number, w: number, h: number}[] = [];
                    const PADDING = 10;
                    
                    bboxesVideoCoords.forEach(b => {
                        const x = Math.max(0, b.minX - PADDING);
                        const y = Math.max(0, b.minY - PADDING);
                        const w = Math.min(videoW - x, (b.maxX - b.minX) + PADDING * 2);
                        const h = Math.min(videoH - y, (b.maxY - b.minY) + PADDING * 2);
                        
                        canvas.width = w;
                        canvas.height = h;
                        ctx.drawImage(videoElement, x, y, w, h, 0, 0, w, h);
                        urls.push(canvas.toDataURL('image/png'));
                        boxes.push({ x, y, w, h });
                    });
                    
                    setCropImages(urls);
                    setCropBBoxes(boxes);
                    setAiDetectedCount(bboxesVideoCoords.length);
                    setActualPcs(bboxesVideoCoords.length > 0 ? bboxesVideoCoords.length : 1);
                    toast.success(`AI (BGS) mendeteksi ${bboxesVideoCoords.length} koli.`, { id: 'ai-analyze' });
                } else {
                    const detector = await getObjectDetector();
                    const videoElement = topVideoRef.current;
                    
                    if (!videoElement) throw new Error("Video element not found");
                    
                    // Make sure video is ready
                    if (videoElement.readyState < 2) {
                        throw new Error("Video stream not ready");
                    }
                    
                    const detections = detector.detect(videoElement);
                    const count = detections.detections.length;
                    
                    if (count === 0) {
                        toast.warning('AI (MediaPipe) tidak mendeteksi koli.', { id: 'ai-analyze' });
                        setActualPcs(1);
                        return;
                    }
                    
                    // Draw crops to a canvas and save as data URLs
                    const videoW = videoElement.videoWidth;
                    const videoH = videoElement.videoHeight;
                    
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    if (!ctx) throw new Error("Canvas context failed");
                    
                    const urls: string[] = [];
                    const boxes: {x: number, y: number, w: number, h: number}[] = [];
                    const PADDING = 10;
                    
                    detections.detections.forEach(det => {
                        const bb = det.boundingBox;
                        if (!bb) return;
                        
                        const x = Math.max(0, bb.originX - PADDING);
                        const y = Math.max(0, bb.originY - PADDING);
                        const w = Math.min(videoW - x, bb.width + PADDING * 2);
                        const h = Math.min(videoH - y, bb.height + PADDING * 2);
                        
                        canvas.width = w;
                        canvas.height = h;
                        
                        ctx.drawImage(videoElement, x, y, w, h, 0, 0, w, h);
                        urls.push(canvas.toDataURL('image/png'));
                        boxes.push({ x, y, w, h });
                    });
                    
                    setCropImages(urls);
                    setCropBBoxes(boxes);
                    setAiDetectedCount(count);
                    setActualPcs(count > 0 ? count : 1);
                    toast.success(`AI (MediaPipe) mendeteksi ${count} koli.`, { id: 'ai-analyze' });
                }
            }
        } catch (err: any) {
            console.error(err);
            toast.error(`Analisis gagal: ${err.message}`, { id: 'ai-analyze' });
        } finally {
            setIsAnalyzing(false);
        }
    };

    const processDecisionBackground = async (result: 'Finished XRay' | 'Pending XRay', data: any, topBase64: string, sideBase64: string) => {
        const [topUrl, sideUrl, fotoUrl] = await Promise.all([
            topBase64 ? uploadBase64Image(topBase64, 'top') : Promise.resolve(''),
            sideBase64 ? uploadBase64Image(sideBase64, 'side') : Promise.resolve(''),
            data.fotoBarangFile 
                ? uploadFileImage(data.fotoBarangFile, 'foto') 
                : (data.fotoBarangBase64 ? uploadBase64Image(data.fotoBarangBase64, 'foto') : Promise.resolve('')),
        ]);

        const uploadedCropImages = await Promise.all(
            (data.cropImages || []).map(async (img: string, idx: number) => {
                if (img.startsWith('data:')) {
                    return await uploadBase64Image(img, `crop-${idx}`);
                }
                return img;
            })
        );

        const newHistoryItem: any = {
            mawb: data.mawb, hawb: data.hawb,
            uldNo: data.uldNo,
            totalWeight: data.totalWeight,
            topViewImage: topUrl,
            sideViewImage: sideUrl,
            fotoBarang: fotoUrl,
            qty: data.actualPcs,
            status: result,
            timestamp: new Date().toISOString(),
            submittedToCustoms: false,
            userID: user?.email || null,
            cropImages: uploadedCropImages.length > 0 ? uploadedCropImages : undefined,
        };

        await scanDB.add(newHistoryItem);
        loadRecentScans();

        if (data.cargoId) {
            await fetch(`/api/cargo/${data.cargoId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: result === 'Finished XRay' ? 'released' : 'rejected', actualPcs: data.actualPcs, screenedAt: new Date().toISOString() }),
            });
        }
    };

    const handleDecision = useCallback(async (result: 'Finished XRay' | 'Pending XRay') => {
        let finalMawb = mawb;
        if (finalMawb.length >= 16) {
            finalMawb = finalMawb.slice(0, -5);
        }
        if (!finalMawb) { toast.error('MAWB harus diisi'); return; }

        // 1. Capture frames synchronously
        const topBase64 = captureFrame(topVideoRef.current);
        const sideBase64 = captureFrame(sideVideoRef.current);

        // 2. Clone state
        const currentData = {
            mawb: finalMawb,
            hawb,
            actualPcs,
            cropImages: [...cropImages],
            fotoBarangFile,
            fotoBarangBase64: !fotoBarangFile && fotoBarang ? fotoBarang : null,
            cargoId: cargo?.id,
            uldNo: cargo?.uldNo || '',
            totalWeight: cargo?.totalWeight || 0
        };

        // 3. Reset UI immediately for non-blocking UX
        setMawb('');
        setHawb('');
        setActualPcs(1);
        setFotoBarang(null);
        setFotoBarangFile(null);
        setCropImages([]);
        setCropBBoxes([]);
        setAiDetectedCount(null);
        setTimeout(() => { mawbInputRef.current?.focus(); }, 50);

        // 4. Start background task
        toast.promise(
            processDecisionBackground(result, currentData, topBase64, sideBase64),
            {
                loading: `Menyimpan ${finalMawb}...`,
                success: `Data ${finalMawb} tersimpan (${result})`,
                error: `Gagal menyimpan ${finalMawb}`
            }
        );
    }, [mawb, hawb, actualPcs, cropImages, fotoBarangFile, cargo, user]);

    // === Global Keyboard Shortcuts (Enter & Spacebar) ===
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore if typing in input
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                return;
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                handleDecision('Finished XRay');
            } else if (e.key === ' ') {
                e.preventDefault();
                handleDecision('Pending XRay');
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleDecision]);

    // === Highlight Canvas Render Effect ===
    useEffect(() => {
        const canvas = highlightCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const video = topVideoRef.current;
        if (!video || video.readyState < 2) return;

        const rect = video.getBoundingClientRect();
        const dW = rect.width || video.clientWidth;
        const dH = rect.height || video.clientHeight;
        if (!dW || !dH) return;

        canvas.width = dW;
        canvas.height = dH;
        ctx.clearRect(0, 0, dW, dH);

        if (hoveredCropIndex !== null && cropBBoxes[hoveredCropIndex]) {
            const vBBox = cropBBoxes[hoveredCropIndex];
            const VW = video.videoWidth;
            const VH = video.videoHeight;
            if (!VW || !VH) return;

            const videoAspect = VW / VH;
            const displayAspect = dW / dH;
            let renderW, renderH, offsetX, offsetY;
            if (videoAspect > displayAspect) {
                renderH = dH;
                renderW = dH * videoAspect;
                offsetX = (dW - renderW) / 2;
                offsetY = 0;
            } else {
                renderW = dW;
                renderH = dW / videoAspect;
                offsetX = 0;
                offsetY = (dH - renderH) / 2;
            }
            
            const rx = (vBBox.x / VW) * renderW + offsetX;
            const ry = (vBBox.y / VH) * renderH + offsetY;
            const rw = (vBBox.w / VW) * renderW;
            const rh = (vBBox.h / VH) * renderH;
            
            // Dim background
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(0, 0, dW, dH);
            ctx.clearRect(rx, ry, rw, rh);

            // Draw highlight overlay
            ctx.strokeStyle = 'rgba(168, 85, 247, 1)';  // purple-500
            ctx.lineWidth = 4;
            ctx.shadowColor = 'rgba(168, 85, 247, 0.8)';
            ctx.shadowBlur = 10;
            ctx.strokeRect(rx, ry, rw, rh);
            
            // Draw label
            const label = `Crop #${hoveredCropIndex + 1}`;
            ctx.font = 'bold 12px sans-serif';
            ctx.shadowBlur = 0;
            const textW = ctx.measureText(label).width;
            ctx.fillStyle = 'rgba(168, 85, 247, 0.9)';
            const labelY = ry > 20 ? ry - 4 : ry + rh + 4;
            ctx.fillRect(rx, labelY - 16, textW + 12, 20);
            ctx.fillStyle = '#ffffff';
            ctx.fillText(label, rx + 6, labelY - 2);
        }
    }, [hoveredCropIndex, cropBBoxes]);

    return (
        <div className="p-6 bg-gray-50 min-h-screen">
            <div className="flex justify-between items-center mb-6 border-b border-gray-200 pb-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Screening X-Ray</h1>
                    <p className="text-sm text-gray-500">Proses pemeriksaan kargo dan pencatatan riwayat scan.</p>
                </div>
                <div className="flex items-center space-x-2">
                    {fixedCameraIntegration !== 'NONE' && (
                        <div className={`flex items-center space-x-2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${scannerConnected ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-red-100 text-red-700 border border-red-200 animate-pulse'}`}>
                            {scannerConnected ? <Wifi size={12} /> : <WifiOff size={12} />}
                            <span>OCR Scanner: {scannerConnected ? 'Online' : 'Offline'}</span>
                        </div>
                    )}
                    <span className="bg-blue-900 text-white px-3 py-1 rounded text-xs font-bold uppercase tracking-tight">X-Ray Mode</span>
                </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-6">
                <div className="space-y-4 w-full lg:w-80">
                    <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
                        <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center border-b pb-2">
                            <Package className="mr-2 text-blue-600" size={18} />Informasi Kargo
                        </h3>
                        <div className="space-y-4 text-sm">
                            <div className="space-y-1">
                                <label className="text-gray-500 font-semibold block uppercase text-[10px]">MAWB (SMU)</label>
                                <input ref={mawbInputRef} autoFocus value={mawb} onChange={(e) => setMawb(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            let finalMawb = mawb;
                                            if (finalMawb.length >= 16) {
                                                finalMawb = finalMawb.slice(0, -5);
                                                setMawb(finalMawb);
                                            }
                                            hawbInputRef.current?.focus();
                                        }
                                    }}
                                    placeholder="Input MAWB via Scan..."
                                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-blue-500 outline-none font-bold text-blue-700"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-gray-500 font-semibold block uppercase text-[10px]">HAWB</label>
                                <input ref={hawbInputRef} value={hawb} onChange={(e) => {
                                    let val = e.target.value;
                                    if (val.includes('+')) { val = val.split('+')[0]; }
                                    setHawb(val);
                                }}
                                    onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
                                    placeholder="Input HAWB via Scan..."
                                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-blue-500 outline-none font-bold text-gray-700"
                                />
                            </div>
                            <div className="pt-3 border-t">
                                <label className="text-blue-700 font-bold block mb-1 uppercase text-[10px]">
                                    Barcode / Qty (Actual Pcs):
                                    {aiDetectedCount !== null && (
                                        <span className="ml-2 bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider">
                                            AI: {aiDetectedCount} koli
                                        </span>
                                    )}
                                </label>
                                <input type="number" value={actualPcs} onChange={(e) => setActualPcs(Number(e.target.value))}
                                    className="w-full px-3 py-2 border-2 border-blue-500 rounded-lg focus:ring-4 focus:ring-blue-100 outline-none font-bold text-xl text-blue-700"
                                />
                            </div>
                        </div>
                    </div>

                    <div onClick={() => fileInputRef.current?.click()} className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 cursor-pointer hover:border-blue-300 transition-all group">
                        <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center group-hover:text-blue-600">
                            <ImageIcon className="mr-2 text-gray-600 group-hover:text-blue-600" size={18} /> Preview Foto Barang
                        </h3>
                        {fotoBarang ? (
                            <div className="rounded-lg overflow-hidden border border-gray-200 bg-black aspect-video flex items-center justify-center">
                                <img src={fotoBarang} alt="Foto Barang" className="max-w-full max-h-full object-contain" />
                            </div>
                        ) : (
                            <div className="h-32 bg-gray-100 rounded-lg border-2 border-dashed border-gray-200 flex flex-col items-center justify-center text-gray-400 group-hover:bg-blue-50 group-hover:border-blue-200">
                                <Upload size={24} className="mb-1" />
                                <span className="text-[10px] uppercase font-bold text-center px-4">Klik untuk Upload Foto Barang</span>
                            </div>
                        )}
                        <input type="file" ref={fileInputRef} onChange={handleFotoUpload} accept="image/*" className="hidden" />
                    </div>
                </div>

                <div className="flex-1 flex flex-col space-y-4">
                    <div className={`grid gap-4 ${aiMethod === 'Manual' ? 'grid-cols-1' : 'grid-cols-1 xl:grid-cols-2'}`}>

                        {/* === MODE MANUAL: Top View full-width, canvas besar === */}
                        {aiMethod === 'Manual' && (
                            <>
                                {/* Top View - Manual mode, full width */}
                                <div className="bg-gray-900 rounded-2xl shadow-2xl border border-gray-800">
                                    {/* Label + kalibrasi buttons */}
                                    <div className="flex items-center space-x-2 p-3 border-b border-gray-800">
                                        <span className="bg-blue-600/80 text-white text-[10px] font-bold px-2 py-1 rounded tracking-widest uppercase">TOP VIEW (CAMERA)</span>
                                        {videoDevices.length > 0 && (
                                            <select value={topDeviceId} onChange={(e) => { setTopDeviceId(e.target.value); }} className="bg-black/50 text-white text-[10px] rounded px-2 py-1 outline-none border border-gray-700">
                                                {videoDevices.map(d => (<option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${d.deviceId.slice(0, 5)}`}</option>))}
                                            </select>
                                        )}
                                        <button
                                            onClick={(e) => { e.preventDefault(); handleCalibrateBackground(); }}
                                            className="bg-purple-600/80 hover:bg-purple-500 text-white text-[10px] font-bold px-3 py-1.5 rounded tracking-widest uppercase transition-all shadow-lg"
                                        >
                                            Kalibrasi {baselineUrls.length > 0 ? `(${baselineUrls.length}/2)` : ''}
                                        </button>
                                        {baselineUrls.length > 0 && (
                                            <button
                                                onClick={(e) => { e.preventDefault(); setBaselineUrls([]); localStorage.removeItem('xray_baseline_images'); toast.info('Semua kalibrasi dihapus.'); }}
                                                className="bg-red-600/80 hover:bg-red-500 text-white text-[10px] font-bold px-2 py-1.5 rounded tracking-widest uppercase transition-all shadow-lg flex items-center"
                                                title="Hapus Kalibrasi"
                                            >
                                                <XCircle size={14} />
                                            </button>
                                        )}
                                    </div>
                                    {/* Video wrapper: position:relative, video defines height */}
                                    <div className="relative w-full bg-black rounded-b-2xl overflow-hidden">
                                        <video ref={topVideoRef} autoPlay playsInline muted style={{ display: 'block', width: '100%', height: 'auto' }} />
                                        <canvas
                                            ref={overlayCanvasRef}
                                            onMouseDown={(e) => handleCanvasMouseDown(e, 'top')}
                                            onMouseMove={(e) => handleCanvasMouseMove(e, 'top')}
                                            onMouseUp={() => handleCanvasMouseUp('top')}
                                            onMouseLeave={() => handleCanvasMouseLeave('top')}
                                            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', cursor: 'crosshair' }}
                                        />
                                        <canvas
                                            ref={highlightCanvasRef}
                                            className={`pointer-events-none z-20 ${hoveredCropIndex !== null ? 'opacity-100' : 'opacity-0'}`}
                                            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', transition: 'opacity 0.2s' }}
                                        />
                                    </div>
                                </div>

                                {/* Side View - Manual mode, full width — identical settings to Top View */}
                                <div className="bg-gray-900 rounded-2xl shadow-2xl border border-gray-800">
                                    {/* Label + kalibrasi buttons */}
                                    <div className="flex items-center space-x-2 p-3 border-b border-gray-800">
                                        <span className="bg-amber-600/80 text-white text-[10px] font-bold px-2 py-1 rounded tracking-widest uppercase">SIDE VIEW (CAMERA)</span>
                                        {videoDevices.length > 0 && (
                                            <select value={sideDeviceId} onChange={(e) => { setSideDeviceId(e.target.value); }} className="bg-black/50 text-white text-[10px] rounded px-2 py-1 outline-none border border-gray-700">
                                                {videoDevices.map(d => (<option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${d.deviceId.slice(0, 5)}`}</option>))}
                                            </select>
                                        )}
                                        <button
                                            onClick={(e) => { e.preventDefault(); handleCalibrateBackground(); }}
                                            className="bg-purple-600/80 hover:bg-purple-500 text-white text-[10px] font-bold px-3 py-1.5 rounded tracking-widest uppercase transition-all shadow-lg"
                                        >
                                            Kalibrasi {baselineUrls.length > 0 ? `(${baselineUrls.length}/2)` : ''}
                                        </button>
                                        {baselineUrls.length > 0 && (
                                            <button
                                                onClick={(e) => { e.preventDefault(); setBaselineUrls([]); localStorage.removeItem('xray_baseline_images'); toast.info('Semua kalibrasi dihapus.'); }}
                                                className="bg-red-600/80 hover:bg-red-500 text-white text-[10px] font-bold px-2 py-1.5 rounded tracking-widest uppercase transition-all shadow-lg flex items-center"
                                                title="Hapus Kalibrasi"
                                            >
                                                <XCircle size={14} />
                                            </button>
                                        )}
                                    </div>
                                    {/* Video wrapper — identical to Top View */}
                                    <div className="relative w-full bg-black rounded-b-2xl overflow-hidden">
                                        <video
                                            ref={sideVideoRef}
                                            autoPlay
                                            playsInline
                                            muted
                                            style={{ display: 'block', width: '100%', height: 'auto' }}
                                        />
                                        <canvas
                                            ref={overlaySideCanvasRef}
                                            onMouseDown={(e) => handleCanvasMouseDown(e, 'side')}
                                            onMouseMove={(e) => handleCanvasMouseMove(e, 'side')}
                                            onMouseUp={() => handleCanvasMouseUp('side')}
                                            onMouseLeave={() => handleCanvasMouseLeave('side')}
                                            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', cursor: 'crosshair' }}
                                        />
                                        <canvas
                                            ref={highlightCanvasRef}
                                            className={`pointer-events-none z-20 ${hoveredCropIndex !== null ? 'opacity-100' : 'opacity-0'}`}
                                            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', transition: 'opacity 0.2s' }}
                                        />
                                    </div>
                                </div>
                            </>
                        )}

                        {/* === MODE OpenCV / MediaPipe: Side View KIRI, Top View KANAN === */}
                        {aiMethod !== 'Manual' && (
                            <>
                                {/* Side View - Kiri */}
                                <div className="bg-gray-900 rounded-2xl overflow-hidden relative shadow-2xl border border-gray-800 flex flex-col">
                                    <div className="absolute top-4 left-4 z-10 flex items-center space-x-2">
                                        <span className="bg-amber-600/80 backdrop-blur-md text-white text-[10px] font-bold px-2 py-1 rounded tracking-widest uppercase">SIDE VIEW (CAMERA)</span>
                                        {videoDevices.length > 0 && (
                                            <select value={sideDeviceId} onChange={(e) => { setSideDeviceId(e.target.value); }} className="bg-black/50 text-white text-[10px] rounded px-2 py-1 outline-none border border-gray-700">
                                                {videoDevices.map(d => (<option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${d.deviceId.slice(0, 5)}`}</option>))}
                                            </select>
                                        )}
                                    </div>
                                    <div className="relative w-full aspect-[4/3]">
                                        <video ref={sideVideoRef} autoPlay playsInline muted className="w-full h-full object-cover bg-black" />
                                        <canvas
                                            ref={overlaySideCanvasRef}
                                            onMouseDown={(e) => handleCanvasMouseDown(e, 'side')}
                                            onMouseMove={(e) => handleCanvasMouseMove(e, 'side')}
                                            onMouseUp={() => handleCanvasMouseUp('side')}
                                            onMouseLeave={() => handleCanvasMouseLeave('side')}
                                            className="absolute inset-0 w-full h-full pointer-events-none"
                                            style={{ mixBlendMode: 'normal' }}
                                        />
                                    </div>
                                </div>

                                {/* Top View - Kanan, dengan Kalibrasi di atas kiri */}
                                <div className="bg-gray-900 rounded-2xl overflow-hidden relative shadow-2xl border border-gray-800 flex flex-col">
                                    {/* Row 1: label + device selector */}
                                    <div className="absolute top-4 left-4 z-10 flex items-center space-x-2">
                                        <span className="bg-blue-600/80 backdrop-blur-md text-white text-[10px] font-bold px-2 py-1 rounded tracking-widest uppercase">TOP VIEW (CAMERA)</span>
                                        {videoDevices.length > 0 && (
                                            <select value={topDeviceId} onChange={(e) => { setTopDeviceId(e.target.value); }} className="bg-black/50 text-white text-[10px] rounded px-2 py-1 outline-none border border-gray-700">
                                                {videoDevices.map(d => (<option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${d.deviceId.slice(0, 5)}`}</option>))}
                                            </select>
                                        )}
                                    </div>
                                    {/* Row 2: Kalibrasi - top left */}
                                    <div className="absolute top-12 left-4 z-10 flex items-center space-x-2">
                                        <button
                                            onClick={(e) => { e.preventDefault(); handleCalibrateBackground(); }}
                                            className="bg-purple-600/80 hover:bg-purple-500 backdrop-blur-md text-white text-[10px] font-bold px-3 py-1.5 rounded tracking-widest uppercase transition-all shadow-lg flex items-center"
                                        >
                                            Kalibrasi {baselineUrls.length > 0 ? `(${baselineUrls.length}/2)` : ''}
                                        </button>
                                        {baselineUrls.length > 0 && (
                                            <button
                                                onClick={(e) => { e.preventDefault(); setBaselineUrls([]); localStorage.removeItem('xray_baseline_images'); toast.info('Semua kalibrasi dihapus.'); }}
                                                className="bg-red-600/80 hover:bg-red-500 backdrop-blur-md text-white text-[10px] font-bold px-2 py-1.5 rounded tracking-widest uppercase transition-all shadow-lg flex items-center"
                                                title="Hapus Kalibrasi"
                                            >
                                                <XCircle size={14} />
                                            </button>
                                        )}
                                    </div>
                                    {/* Live koli count badge */}
                                    {liveKoliCount > 0 && (
                                        <div className="absolute top-4 right-4 z-10 bg-green-500/90 backdrop-blur-md text-white text-[10px] font-black px-2.5 py-1 rounded-full flex items-center space-x-1.5 shadow-lg">
                                            <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse inline-block" />
                                            <span>{liveKoliCount} koli</span>
                                        </div>
                                    )}
                                    {/* Video + canvas overlay stacked */}
                                    <div className="relative w-full aspect-[4/3]">
                                        <video ref={topVideoRef} autoPlay playsInline muted className="w-full h-full object-cover bg-black" />
                                        <canvas
                                            ref={overlayCanvasRef}
                                            onMouseDown={(e) => handleCanvasMouseDown(e, 'top')}
                                            onMouseMove={(e) => handleCanvasMouseMove(e, 'top')}
                                            onMouseUp={() => handleCanvasMouseUp('top')}
                                            onMouseLeave={() => handleCanvasMouseLeave('top')}
                                            className="absolute inset-0 w-full h-full pointer-events-none"
                                            style={{ mixBlendMode: 'normal' }}
                                        />
                                        <canvas
                                            ref={highlightCanvasRef}
                                            className={`absolute inset-0 w-full h-full pointer-events-none z-20 ${hoveredCropIndex !== null ? 'opacity-100' : 'opacity-0'}`}
                                            style={{ transition: 'opacity 0.2s' }}
                                        />
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    {/* AI Vision Analysis Panel */}
                    <div className="bg-gradient-to-br from-purple-900 to-indigo-900 rounded-2xl shadow-xl border border-purple-700/50 p-5">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center space-x-3">
                                <div className="p-2 bg-purple-700/50 rounded-xl">
                                    <ScanLine size={20} className="text-purple-200" />
                                </div>
                                <div>
                                    <h3 className="text-white font-black text-sm uppercase tracking-widest">
                                        {aiMethod === 'Manual' ? 'Manual Crop Workspace' : 'AI Vision Analysis'}
                                    </h3>
                                    <p className="text-purple-300 text-[10px] font-semibold mt-0.5">
                                        {aiMethod === 'Manual' ? 'Drag di atas video untuk memotong koli secara manual' : 'Autocrop koli & deteksi jumlah otomatis dari Top View'}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center space-x-2">
                                {aiMethod === 'Manual' && cropImages.length > 0 && (
                                    <button
                                        onClick={() => {
                                            setCropImages([]);
                                            setCropBBoxes([]);
                                        }}
                                        className="bg-red-500/20 text-red-300 hover:bg-red-500 hover:text-white px-3 py-2 rounded-lg text-xs font-bold transition-all"
                                    >
                                        Reset Crops
                                    </button>
                                )}
                                {aiMethod !== 'Manual' && (
                                    <button
                                        onClick={handleAIAnalyze}
                                        disabled={isAnalyzing}
                                        className="flex items-center space-x-2 bg-purple-500 hover:bg-purple-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black text-xs uppercase tracking-widest px-5 py-3 rounded-xl transition-all hover:scale-105 active:scale-95 shadow-lg shadow-purple-900/50"
                                    >
                                        {isAnalyzing ? (
                                            <><Loader2 size={16} className="animate-spin" /><span>Menganalisa...</span></>
                                        ) : (
                                            <><ScanLine size={16} /><span>Analisis Koli (AI)</span></>
                                        )}
                                    </button>
                                )}
                            </div>
                        </div>

                        {cropImages.length > 0 ? (
                            <div>
                                <div className="flex items-center space-x-2 mb-3">
                                    <Layers size={14} className="text-purple-300" />
                                    <span className="text-purple-200 text-[11px] font-black uppercase tracking-widest">
                                        {cropImages.length} Koli Terdeteksi — Hasil Autocrop:
                                    </span>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-2">
                                    {cropImages.map((url, i) => (
                                        <div
                                            key={url}
                                            className="relative group cursor-pointer aspect-square bg-black rounded-xl overflow-hidden border-2 border-purple-700/60 hover:border-purple-400 transition-all shadow-md"
                                            onClick={() => setZoomImage(url)}
                                            onMouseEnter={() => setHoveredCropIndex(i)}
                                            onMouseLeave={() => setHoveredCropIndex(null)}
                                        >
                                            <img src={url} alt={`Koli ${i + 1}`} className="w-full h-full object-contain" />
                                            <div className="absolute inset-0 bg-purple-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                <Eye size={18} className="text-white" />
                                            </div>
                                            <span className="absolute bottom-1 left-1 bg-purple-600/90 text-white text-[9px] font-black px-1.5 py-0.5 rounded">
                                                #{i + 1}
                                            </span>
                                            <button
                                                className="absolute top-1 right-1 bg-red-600 hover:bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity z-10 shadow-lg"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    const newUrls = [...cropImages];
                                                    newUrls.splice(i, 1);
                                                    setCropImages(newUrls);
                                                    
                                                    const newBoxes = [...cropBBoxes];
                                                    newBoxes.splice(i, 1);
                                                    setCropBBoxes(newBoxes);
                                                    
                                                    setActualPcs(prev => Math.max(1, prev - 1));
                                                    setHoveredCropIndex(null);
                                                }}
                                                title="Hapus crop ini"
                                            >
                                                <XCircle size={14} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="border-2 border-dashed border-purple-700/40 rounded-xl p-4 flex items-center justify-center">
                                <p className="text-purple-400/80 text-[11px] font-semibold uppercase tracking-wider text-center">
                                    {aiMethod === 'Manual'
                                        ? 'Area ini akan terisi otomatis saat Anda menggambar (drag) di atas video Top View'
                                        : (liveKoliCount > 0
                                            ? `Live preview mendeteksi ${liveKoliCount} koli — Klik "Analisis Koli (AI)" untuk autocrop`
                                            : 'Klik "Analisis Koli (AI)" untuk mendeteksi dan autocrop koli dari kamera Top View')}
                                </p>
                            </div>
                        )}
                    </div>

                    <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8">
                        <h3 className="text-xl font-bold text-gray-900 mb-6 text-center tracking-tight uppercase">Simpan Keputusan Screening</h3>
                        <div className="grid grid-cols-2 gap-6 max-w-2xl mx-auto">
                            <button onClick={() => handleDecision('Finished XRay')} className="group flex flex-col items-center justify-center py-8 bg-green-600 text-white rounded-2xl hover:bg-green-700 transition-all shadow-xl hover:-translate-y-1 active:translate-y-0 disabled:opacity-60 disabled:cursor-not-allowed">
                                <CheckCircle size={40} className="mb-2" />
                                <span className="text-xl font-black tracking-widest leading-none">FINISHED XRAY</span>
                            </button>
                            <button onClick={() => handleDecision('Pending XRay')} className="group flex flex-col items-center justify-center py-8 bg-red-600 text-white rounded-2xl hover:bg-red-700 transition-all shadow-xl hover:-translate-y-1 active:translate-y-0 disabled:opacity-60 disabled:cursor-not-allowed">
                                <XCircle size={40} className="mb-2" />
                                <span className="text-xl font-black tracking-widest leading-none">PENDING XRAY</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Recent Scans */}
            <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6 mt-6">
                <h3 className="text-sm font-bold text-gray-900 mb-4 tracking-tight uppercase flex items-center justify-between">
                    <span>Recent Scans History</span>
                    <span className="text-xs font-normal text-gray-500">
                        {recordsPerPage === 'All' ? 'All items recorded' : `Last ${recordsPerPage} items recorded`}
                    </span>
                </h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-sm">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-500 uppercase">
                                <th className="py-3 px-4">MAWB (SMU)</th>
                                <th className="py-3 px-4">HAWB</th>
                                <th className="py-3 px-4">Qty</th>
                                <th className="py-3 px-4">Koli AI</th>
                                <th className="py-3 px-4">Screener</th>
                                <th className="py-3 px-4">Status</th>
                                <th className="py-3 px-4 text-right">Time</th>
                                <th className="py-3 px-4 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {recentScans.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="py-8 text-center text-gray-400 text-xs italic font-semibold uppercase tracking-wider bg-gray-50/50">
                                        No recent scans history found
                                    </td>
                                </tr>
                            ) : (
                                recentScans.slice(0, recordsPerPage === 'All' ? recentScans.length : recordsPerPage).map(scan => (
                                    <tr key={scan.scanId} className="hover:bg-gray-50 transition-colors">
                                        <td className="py-3 px-4 font-bold text-blue-700">{scan.mawb}</td>
                                        <td className="py-3 px-4 text-gray-600 font-medium">{scan.hawb || '-'}</td>
                                        <td className="py-3 px-4 font-bold text-gray-900">{scan.qty || '-'}</td>
                                        <td className="py-3 px-4">
                                            {scan.cropImages && scan.cropImages.length > 0 ? (
                                                <span className="inline-flex items-center space-x-1 bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full text-[10px] font-black">
                                                    <Layers size={10} />
                                                    <span>{scan.cropImages.length} koli</span>
                                                </span>
                                            ) : (
                                                <span className="text-gray-300 text-[10px]">—</span>
                                            )}
                                        </td>
                                        <td className="py-3 px-4 text-gray-500 italic">{scan.userID || '-'}</td>
                                        <td className="py-3 px-4">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold ${scan.status === 'Finished XRay' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                                {scan.status}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-right text-xs text-gray-500 font-mono">
                                            {new Date(scan.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                        </td>
                                        <td className="py-3 px-4 text-right">
                                            <button onClick={() => setSelectedScan(scan)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-all border border-transparent hover:border-blue-100" title="View Detail">
                                                <Eye size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal Detail Scan */}
            {selectedScan && (
                <div className="fixed inset-0 bg-gray-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4" onClick={() => setSelectedScan(null)}>
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl max-h-[95vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
                        <div className="px-8 py-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <div>
                                <h2 className="text-2xl font-black text-gray-900">Scan Snapshot Detail</h2>
                                <p className="text-xs text-blue-600 font-bold mt-1 uppercase tracking-widest">SCAN ID: #{selectedScan.scanId} | STATUS: {selectedScan.status}</p>
                            </div>
                            <button onClick={() => setSelectedScan(null)} className="text-gray-400 hover:text-red-500 p-2 hover:bg-red-50 rounded-full transition-all border border-gray-200">
                                <XCircle size={32} />
                            </button>
                        </div>
                        <div className="p-8 overflow-y-auto flex-1">
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8 bg-blue-50/50 p-6 rounded-2xl border border-blue-100">
                                <div className="space-y-1">
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">MAWB (SMU)</span>
                                    <span className="text-2xl font-black text-blue-700">{selectedScan.mawb}</span>
                                </div>
                                <div className="space-y-1">
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">HAWB</span>
                                    <span className="text-2xl font-black text-gray-900">{selectedScan.hawb || '-'}</span>
                                </div>
                                <div className="space-y-1">
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Actual Pcs</span>
                                    <span className="text-2xl font-black text-blue-600">{selectedScan.qty} <span className="text-xs text-gray-400">Pcs</span></span>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                <div className="space-y-3">
                                    <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest flex items-center"><ImageIcon size={14} className="mr-2" /> Top View X-Ray</h3>
                                    <div className="bg-gray-900 aspect-[4/3] rounded-xl overflow-hidden border-4 border-gray-800 shadow-inner">
                                        {selectedScan.topViewImage ? <img src={selectedScan.topViewImage} className="w-full h-full object-contain cursor-pointer hover:opacity-90 transition-opacity" alt="Top View" onClick={() => setZoomImage(selectedScan.topViewImage!)} /> : <div className="w-full h-full flex items-center justify-center text-gray-600 text-xs uppercase font-bold">No Image</div>}
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest flex items-center"><ImageIcon size={14} className="mr-2" /> Side View X-Ray</h3>
                                    <div className="bg-gray-900 aspect-[4/3] rounded-xl overflow-hidden border-4 border-gray-800 shadow-inner">
                                        {selectedScan.sideViewImage ? <img src={selectedScan.sideViewImage} className="w-full h-full object-contain cursor-pointer hover:opacity-90 transition-opacity" alt="Side View" onClick={() => setZoomImage(selectedScan.sideViewImage!)} /> : <div className="w-full h-full flex items-center justify-center text-gray-600 text-xs uppercase font-bold">No Image</div>}
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest flex items-center"><ImageIcon size={14} className="mr-2" /> Foto Barang</h3>
                                    <div className="bg-gray-200 aspect-[4/3] rounded-xl overflow-hidden border-4 border-gray-100 shadow-inner flex items-center justify-center">
                                        {selectedScan.fotoBarang ? <img src={selectedScan.fotoBarang} className="w-full h-full object-contain cursor-pointer hover:opacity-90 transition-opacity" alt="Foto Barang" onClick={() => setZoomImage(selectedScan.fotoBarang!)} /> : <div className="text-gray-400 text-xs text-center p-4 italic font-medium">No Photo Uploaded</div>}
                                    </div>
                                </div>
                            </div>

                            {/* AI Crop Images Section */}
                            {selectedScan.cropImages && selectedScan.cropImages.length > 0 && (
                                <div className="mt-8 bg-gradient-to-br from-purple-50 to-indigo-50 rounded-2xl border border-purple-200 p-6">
                                    <h3 className="text-xs font-black text-purple-700 uppercase tracking-widest flex items-center mb-4">
                                        <Layers size={14} className="mr-2" />
                                        AI Autocrop — {selectedScan.cropImages.length} Koli Terdeteksi
                                    </h3>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                                        {selectedScan.cropImages.map((url, i) => (
                                            <div key={url} className="relative group cursor-pointer aspect-square bg-gray-900 rounded-xl overflow-hidden border-2 border-purple-300 hover:border-purple-500 transition-all shadow" onClick={() => setZoomImage(url)}>
                                                <img src={url} alt={`Koli ${i + 1}`} className="w-full h-full object-contain" />
                                                <div className="absolute inset-0 bg-purple-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                    <Eye size={18} className="text-white" />
                                                </div>
                                                <span className="absolute bottom-1 left-1 bg-purple-600/90 text-white text-[9px] font-black px-1.5 py-0.5 rounded">Koli #{i + 1}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="mt-8 pt-6 border-t border-gray-100 flex justify-between items-center text-gray-400 italic text-xs">
                                <span>Scan processed at: {new Date(selectedScan.timestamp).toLocaleString()}</span>
                                <span className="font-bold text-gray-300">SYSTEM SNAPSHOT SECURE</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <ImageZoomModal
                isOpen={!!zoomImage}
                onClose={() => setZoomImage(null)}
                imageUrl={zoomImage || ''}
            />
        </div>
    );
};

export default ScreeningScreen;
