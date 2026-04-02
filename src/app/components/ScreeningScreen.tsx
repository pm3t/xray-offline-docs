import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Camera, CheckCircle, XCircle, Package, ImageIcon, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { scanDB } from '../../db/db';

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
    const navigate = useNavigate();
    const [cargo, setCargo] = useState<CargoData | null>(null);
    const [mawb, setMawb] = useState<string>('');
    const [hawb, setHawb] = useState<string>('');
    const [actualPcs, setActualPcs] = useState<number>(1);
    const [fotoBarang, setFotoBarang] = useState<string | null>(null);
    const topVideoRef = useRef<HTMLVideoElement>(null);
    const sideVideoRef = useRef<HTMLVideoElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
    const [topDeviceId, setTopDeviceId] = useState<string>('');
    const [sideDeviceId, setSideDeviceId] = useState<string>('');

    const [capturedTop, setCapturedTop] = useState<string>('');
    const [capturedSide, setCapturedSide] = useState<string>('');

    useEffect(() => {
        if (cargoId) {
            const cargoList = JSON.parse(localStorage.getItem('cargoData') || '[]');
            const foundCargo = cargoList.find((c: any) => c.id === cargoId);
            if (foundCargo) {
                setCargo(foundCargo);
                setMawb(foundCargo.mawb || '');
                setHawb(foundCargo.hawb || '');
                setActualPcs(1);
            } else {
                toast.error('Cargo tidak ditemukan');
            }
        } else {
            setActualPcs(1);
        }
    }, [cargoId]);

    useEffect(() => {
        const getDevices = async () => {
            try {
                // Request permissions first to enumerate devices with labels
                await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
                const devices = await navigator.mediaDevices.enumerateDevices();
                const videoInputs = devices.filter(device => device.kind === 'videoinput');
                setVideoDevices(videoInputs);
                if (videoInputs.length > 0) {
                    setTopDeviceId(videoInputs[0].deviceId);
                    if (videoInputs.length > 1) {
                        setSideDeviceId(videoInputs[1].deviceId);
                    } else {
                        setSideDeviceId(videoInputs[0].deviceId);
                    }
                }
            } catch (err) {
                console.error("Error accessing camera / enumerating devices:", err);
                toast.error("Tidak dapat mengakses kamera / capture card.");
            }
        };
        getDevices();
    }, []);

    useEffect(() => {
        if (!topDeviceId) return;
        let stream: MediaStream;
        const startStream = async () => {
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: { deviceId: { exact: topDeviceId } }
                });
                if (topVideoRef.current) {
                    topVideoRef.current.srcObject = stream;
                }
            } catch (err) {
                console.error("Error accessing top camera:", err);
            }
        };
        startStream();
        return () => {
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }
        };
    }, [topDeviceId]);

    useEffect(() => {
        if (!sideDeviceId) return;
        let stream: MediaStream;
        const startStream = async () => {
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: { deviceId: { exact: sideDeviceId } }
                });
                if (sideVideoRef.current) {
                    sideVideoRef.current.srcObject = stream;
                }
            } catch (err) {
                console.error("Error accessing side camera:", err);
            }
        };
        startStream();
        return () => {
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }
        };
    }, [sideDeviceId]);

    const captureFrame = (videoElement: HTMLVideoElement | null) => {
        if (!videoElement) return '';
        const canvas = document.createElement('canvas');
        canvas.width = videoElement.videoWidth || 500;
        canvas.height = videoElement.videoHeight || 350;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
            return canvas.toDataURL('image/png');
        }
        return '';
    };

    const handleCapture = () => {
        const topImg = captureFrame(topVideoRef.current);
        const sideImg = captureFrame(sideVideoRef.current);
        setCapturedTop(topImg);
        setCapturedSide(sideImg);
        toast.success('Capture Image berhasil ditangkap dari Capture Card');
    };

    const handleFotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            const dataUrl = evt.target?.result as string;
            setFotoBarang(dataUrl);
        };
        reader.readAsDataURL(file);
    };

    const handleDecision = (result: 'Release' | 'Reject') => {
        if (!mawb) {
            toast.error('MAWB harus diisi');
            return;
        }

        const nextId = Date.now(); // Simple unique ID for mock

        const topImg = capturedTop || captureFrame(topVideoRef.current);
        const sideImg = capturedSide || captureFrame(sideVideoRef.current);

        const newHistoryItem: any = {
            scanId: nextId,
            mawb: mawb,
            hawb: hawb,
            uldNo: cargo?.uldNo || '',
            totalWeight: cargo?.totalWeight || 0,
            topViewImage: topImg,
            sideViewImage: sideImg,
            fotoBarang: fotoBarang || '',
            qty: actualPcs,
            status: result,
            timestamp: new Date().toISOString(),
            submittedToCustoms: false
        };

        scanDB.add(newHistoryItem).then(() => {
            console.log('Saved to IndexedDB');
        }).catch(err => {
            console.error('Failed to save to IndexedDB', err);
            // Fallback to localStorage if IndexedDB fails (optional)
            const scanHistory = JSON.parse(localStorage.getItem('scanHistory') || '[]');
            localStorage.setItem('scanHistory', JSON.stringify([...scanHistory, newHistoryItem]));
        });

        if (cargoId) {
            const cargoList = JSON.parse(localStorage.getItem('cargoData') || '[]');
            const updatedCargoList = cargoList.map((c: any) =>
                c.id === cargoId ? {
                    ...c,
                    status: result.toLowerCase() === 'release' ? 'released' : 'rejected',
                    actualPcs: actualPcs,
                    screenedAt: new Date().toISOString()
                } : c
            );
            localStorage.setItem('cargoData', JSON.stringify(updatedCargoList));
        }

        toast[result === 'Release' ? 'success' : 'error'](`Scan History berhasil disimpan dengan status ${result}`);

        setTimeout(() => {
            navigate('/repository');
        }, 1500);
    };

    return (
        <div className="p-6 bg-gray-50 min-h-screen">
            <div className="flex justify-between items-center mb-6 border-b border-gray-200 pb-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Screening X-Ray</h1>
                    <p className="text-sm text-gray-500">Proses pemeriksaan kargo dan pencatatan riwayat scan.</p>
                </div>
                <div className="flex items-center space-x-2">
                    <span className="bg-blue-900 text-white px-3 py-1 rounded text-xs font-bold uppercase tracking-tight">
                        X-Ray Mode
                    </span>
                </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-6">
                <div className="w-full lg:w-80 space-y-4">
                    <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
                        <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center border-b pb-2">
                            <Package className="mr-2 text-blue-600" size={18} />
                            Informasi Kargo
                        </h3>
                        <div className="space-y-4 text-sm">
                            <div className="space-y-1">
                                <label className="text-gray-500 font-semibold block uppercase text-[10px]">MAWB (SMU)</label>
                                <input
                                    value={mawb}
                                    onChange={(e) => setMawb(e.target.value)}
                                    placeholder="Input MAWB via Scan..."
                                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-blue-500 outline-none font-bold text-blue-700"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-gray-500 font-semibold block uppercase text-[10px]">HAWB</label>
                                <input
                                    value={hawb}
                                    onChange={(e) => setHawb(e.target.value)}
                                    placeholder="Input HAWB via Scan..."
                                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-blue-500 outline-none font-bold text-gray-700"
                                />
                            </div>

                            <div className="pt-3 border-t">
                                <label className="text-blue-700 font-bold block mb-1 uppercase text-[10px]">Barcode / Qty (Actual Pcs):</label>
                                <input
                                    type="number"
                                    value={actualPcs}
                                    onChange={(e) => setActualPcs(Number(e.target.value))}
                                    className="w-full px-3 py-2 border-2 border-blue-500 rounded-lg focus:ring-4 focus:ring-blue-100 outline-none font-bold text-xl text-blue-700"
                                />
                            </div>
                        </div>
                    </div>

                    <div
                        onClick={() => fileInputRef.current?.click()}
                        className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 cursor-pointer hover:border-blue-300 transition-all group"
                    >
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
                                <span className="bg-blue-600/80 backdrop-blur-md text-white text-[10px] font-bold px-2 py-1 rounded tracking-widest uppercase">
                                    TOP VIEW (CAMERA)
                                </span>
                                {videoDevices.length > 0 && (
                                    <select
                                        value={topDeviceId}
                                        onChange={(e) => { setTopDeviceId(e.target.value); setCapturedTop(''); }}
                                        className="bg-black/50 text-white text-[10px] rounded px-2 py-1 outline-none border border-gray-700"
                                    >
                                        {videoDevices.map(d => (
                                            <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${d.deviceId.slice(0, 5)}`}</option>
                                        ))}
                                    </select>
                                )}
                            </div>
                            {capturedTop ? (
                                <img src={capturedTop} className="w-full aspect-[4/3] object-cover" alt="Captured Top View" />
                            ) : (
                                <video ref={topVideoRef} autoPlay playsInline muted className="w-full aspect-[4/3] object-cover bg-black" />
                            )}
                        </div>

                        <div className="bg-gray-900 rounded-2xl overflow-hidden relative shadow-2xl border border-gray-800 flex flex-col">
                            <div className="absolute top-4 left-4 z-10 flex items-center space-x-2">
                                <span className="bg-amber-600/80 backdrop-blur-md text-white text-[10px] font-bold px-2 py-1 rounded tracking-widest uppercase">
                                    SIDE VIEW (CAMERA)
                                </span>
                                {videoDevices.length > 0 && (
                                    <select
                                        value={sideDeviceId}
                                        onChange={(e) => { setSideDeviceId(e.target.value); setCapturedSide(''); }}
                                        className="bg-black/50 text-white text-[10px] rounded px-2 py-1 outline-none border border-gray-700"
                                    >
                                        {videoDevices.map(d => (
                                            <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${d.deviceId.slice(0, 5)}`}</option>
                                        ))}
                                    </select>
                                )}
                            </div>
                            {capturedSide ? (
                                <img src={capturedSide} className="w-full aspect-[4/3] object-cover" alt="Captured Side View" />
                            ) : (
                                <video ref={sideVideoRef} autoPlay playsInline muted className="w-full aspect-[4/3] object-cover bg-black" />
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                        <button onClick={handleCapture} className="flex items-center justify-center px-6 py-4 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-all shadow-sm active:scale-95 group">
                            <Camera size={20} className="mr-2 text-gray-400 group-hover:text-blue-500" />
                            <span className="font-semibold text-gray-700">{capturedTop || capturedSide ? 'Retake Image' : 'Capture Image'}</span>
                        </button>
                    </div>

                    <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8">
                        <h3 className="text-xl font-bold text-gray-900 mb-6 text-center tracking-tight uppercase">Simpan Keputusan Screening</h3>
                        <div className="grid grid-cols-2 gap-6 max-w-2xl mx-auto">
                            <button onClick={() => handleDecision('Release')} className="group flex flex-col items-center justify-center py-8 bg-green-600 text-white rounded-2xl hover:bg-green-700 transition-all shadow-xl hover:-translate-y-1 active:translate-y-0">
                                <CheckCircle size={40} className="mb-2" />
                                <span className="text-xl font-black tracking-widest leading-none">RELEASE</span>
                            </button>
                            <button onClick={() => handleDecision('Reject')} className="group flex flex-col items-center justify-center py-8 bg-red-600 text-white rounded-2xl hover:bg-red-700 transition-all shadow-xl hover:-translate-y-1 active:translate-y-0">
                                <XCircle size={40} className="mb-2" />
                                <span className="text-xl font-black tracking-widest leading-none">REJECT</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ScreeningScreen;
