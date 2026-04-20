import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle, XCircle, Package, ImageIcon, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { scanDB, uploadBase64Image, uploadFileImage } from '../../db/db';

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

const ScreeningScreen = () => {
    const { cargoId } = useParams();
    const [cargo, setCargo] = useState<CargoData | null>(null);
    const [mawb, setMawb] = useState<string>('');
    const [hawb, setHawb] = useState<string>('');
    const [actualPcs, setActualPcs] = useState<number>(1);
    const [fotoBarang, setFotoBarang] = useState<string | null>(null);
    const [fotoBarangFile, setFotoBarangFile] = useState<File | null>(null);
    const topVideoRef = useRef<HTMLVideoElement>(null);
    const sideVideoRef = useRef<HTMLVideoElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const mawbInputRef = useRef<HTMLInputElement>(null);
    const hawbInputRef = useRef<HTMLInputElement>(null);

    const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
    const [topDeviceId, setTopDeviceId] = useState<string>('');
    const [sideDeviceId, setSideDeviceId] = useState<string>('');

    // capturedTop/capturedSide not used for display; camera always shows live feed.
    // Snapshots are captured automatically on decision.
    const [isSaving, setIsSaving] = useState(false);

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
                // fallback to localStorage
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

    const captureFrame = (videoElement: HTMLVideoElement | null): string => {
        if (!videoElement) return '';
        const canvas = document.createElement('canvas');
        canvas.width = videoElement.videoWidth || 500;
        canvas.height = videoElement.videoHeight || 350;
        const ctx = canvas.getContext('2d');
        if (ctx) { ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height); }
        return canvas.toDataURL('image/png');
    };



    const handleFotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setFotoBarangFile(file);
        const reader = new FileReader();
        reader.onload = (evt) => setFotoBarang(evt.target?.result as string);
        reader.readAsDataURL(file);
    };

    const handleDecision = async (result: 'Finished XRay' | 'Pending XRay') => {
        if (!mawb) { toast.error('MAWB harus diisi'); return; }
        setIsSaving(true);
        toast.loading('Menyimpan data...', { id: 'saving' });
        try {
            // Auto-capture from live feed at decision time
            const topBase64 = captureFrame(topVideoRef.current);
            const sideBase64 = captureFrame(sideVideoRef.current);

            // Upload images to server, get URLs back
            const [topUrl, sideUrl, fotoUrl] = await Promise.all([
                topBase64 ? uploadBase64Image(topBase64, 'top') : Promise.resolve(''),
                sideBase64 ? uploadBase64Image(sideBase64, 'side') : Promise.resolve(''),
                fotoBarangFile ? uploadFileImage(fotoBarangFile, 'foto') : Promise.resolve(''),
            ]);

            const newHistoryItem: any = {
                mawb, hawb,
                uldNo: cargo?.uldNo || '',
                totalWeight: cargo?.totalWeight || 0,
                topViewImage: topUrl,
                sideViewImage: sideUrl,
                fotoBarang: fotoUrl,
                qty: actualPcs,
                status: result,
                timestamp: new Date().toISOString(),
                submittedToCustoms: false,
            };

            await scanDB.add(newHistoryItem);
            toast.success(`Scan berhasil disimpan: ${result}`, { id: 'saving' });

            // Update cargo status
            if (cargoId) {
                await fetch(`/api/cargo/${cargoId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: result === 'Finished XRay' ? 'released' : 'rejected', actualPcs, screenedAt: new Date().toISOString() }),
                });
            }
        } catch (err) {
            console.error(err);
            toast.error('Gagal menyimpan data scan', { id: 'saving' });
        } finally {
            setIsSaving(false);
        }

        setMawb('');
        setHawb('');
        setFotoBarang(null);
        setFotoBarangFile(null);
        setTimeout(() => { mawbInputRef.current?.focus(); }, 100);
    };

    return (
        <div className="p-6 bg-gray-50 min-h-screen">
            <div className="flex justify-between items-center mb-6 border-b border-gray-200 pb-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Screening X-Ray</h1>
                    <p className="text-sm text-gray-500">Proses pemeriksaan kargo dan pencatatan riwayat scan.</p>
                </div>
                <div className="flex items-center space-x-2">
                    <span className="bg-blue-900 text-white px-3 py-1 rounded text-xs font-bold uppercase tracking-tight">X-Ray Mode</span>
                </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-6">
                <div className="w-full lg:w-80 space-y-4">
                    <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
                        <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center border-b pb-2">
                            <Package className="mr-2 text-blue-600" size={18} />Informasi Kargo
                        </h3>
                        <div className="space-y-4 text-sm">
                            <div className="space-y-1">
                                <label className="text-gray-500 font-semibold block uppercase text-[10px]">MAWB (SMU)</label>
                                <input ref={mawbInputRef} autoFocus value={mawb} onChange={(e) => setMawb(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); hawbInputRef.current?.focus(); } }}
                                    placeholder="Input MAWB via Scan..."
                                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-blue-500 outline-none font-bold text-blue-700"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-gray-500 font-semibold block uppercase text-[10px]">HAWB</label>
                                <input ref={hawbInputRef} value={hawb} onChange={(e) => setHawb(e.target.value)}
                                    placeholder="Input HAWB via Scan..."
                                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-blue-500 outline-none font-bold text-gray-700"
                                />
                            </div>
                            <div className="pt-3 border-t">
                                <label className="text-blue-700 font-bold block mb-1 uppercase text-[10px]">Barcode / Qty (Actual Pcs):</label>
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
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                        <div className="bg-gray-900 rounded-2xl overflow-hidden relative shadow-2xl border border-gray-800 flex flex-col">
                            <div className="absolute top-4 left-4 z-10 flex items-center space-x-2">
                                <span className="bg-blue-600/80 backdrop-blur-md text-white text-[10px] font-bold px-2 py-1 rounded tracking-widest uppercase">TOP VIEW (CAMERA)</span>
                                {videoDevices.length > 0 && (
                                    <select value={topDeviceId} onChange={(e) => { setTopDeviceId(e.target.value); }} className="bg-black/50 text-white text-[10px] rounded px-2 py-1 outline-none border border-gray-700">
                                        {videoDevices.map(d => (<option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${d.deviceId.slice(0, 5)}`}</option>))}
                                    </select>
                                )}
                            </div>
                            <video ref={topVideoRef} autoPlay playsInline muted className="w-full aspect-[4/3] object-cover bg-black" />
                        </div>
                        <div className="bg-gray-900 rounded-2xl overflow-hidden relative shadow-2xl border border-gray-800 flex flex-col">
                            <div className="absolute top-4 left-4 z-10 flex items-center space-x-2">
                                <span className="bg-amber-600/80 backdrop-blur-md text-white text-[10px] font-bold px-2 py-1 rounded tracking-widest uppercase">SIDE VIEW (CAMERA)</span>
                                {videoDevices.length > 0 && (
                                    <select value={sideDeviceId} onChange={(e) => { setSideDeviceId(e.target.value); }} className="bg-black/50 text-white text-[10px] rounded px-2 py-1 outline-none border border-gray-700">
                                        {videoDevices.map(d => (<option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${d.deviceId.slice(0, 5)}`}</option>))}
                                    </select>
                                )}
                            </div>
                            <video ref={sideVideoRef} autoPlay playsInline muted className="w-full aspect-[4/3] object-cover bg-black" />
                        </div>
                    </div>



                    <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8">
                        <h3 className="text-xl font-bold text-gray-900 mb-6 text-center tracking-tight uppercase">Simpan Keputusan Screening</h3>
                        <div className="grid grid-cols-2 gap-6 max-w-2xl mx-auto">
                            <button onClick={() => handleDecision('Finished XRay')} disabled={isSaving} className="group flex flex-col items-center justify-center py-8 bg-green-600 text-white rounded-2xl hover:bg-green-700 transition-all shadow-xl hover:-translate-y-1 active:translate-y-0 disabled:opacity-60 disabled:cursor-not-allowed">
                                <CheckCircle size={40} className="mb-2" />
                                <span className="text-xl font-black tracking-widest leading-none">FINISHED XRAY</span>
                            </button>
                            <button onClick={() => handleDecision('Pending XRay')} disabled={isSaving} className="group flex flex-col items-center justify-center py-8 bg-red-600 text-white rounded-2xl hover:bg-red-700 transition-all shadow-xl hover:-translate-y-1 active:translate-y-0 disabled:opacity-60 disabled:cursor-not-allowed">
                                <XCircle size={40} className="mb-2" />
                                <span className="text-xl font-black tracking-widest leading-none">PENDING XRAY</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ScreeningScreen;
