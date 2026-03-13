import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Camera, Video, ScanBarcode, CheckCircle, XCircle, Plane } from 'lucide-react';
import { toast } from 'sonner';

interface AirlineDetailsProps {
    airline: string;
    flightNumber: string;
    origin: string;
    destination: string;
}

const AirlineDetails: React.FC<AirlineDetailsProps> = ({ airline, flightNumber, origin, destination }) => {
    const getAirlineName = (code: string) => {
        const airlines: Record<string, string> = {
            'GA': 'Garuda Indonesia',
            'QZ': 'AirAsia Indonesia',
            'ID': 'Batik Air',
            'SJ': 'Sriwijaya Air',
            'JT': 'Lion Air',
            'IU': 'Super Air Jet',
            'QG': 'Citilink'
        };
        return airlines[code] || 'Unknown';
    };

    return (
        <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
            <h3 className="flex items-center text-sm font-semibold text-gray-700 mb-3"><Plane className="mr-2" size={16} /> Informasi Maskapai</h3>
            <div className="mb-2">
                <span className="text-xs text-gray-500 block">Kode Maskapai</span>
                <span className="text-2xl font-bold text-blue-600">{airline}</span>
            </div>
            <div className="space-y-2 text-sm">
                <div><span className="text-gray-500">Nama:</span> <br /><span className="font-semibold">{getAirlineName(airline)}</span></div>
                <div><span className="text-gray-500">Nomor Penerbangan:</span> <br /><span className="font-semibold">{flightNumber}</span></div>
                <div><span className="text-gray-500">Rute:</span> <br /><span className="font-semibold">{origin} → {destination}</span></div>
            </div>
        </div>
    );
};

const ScreeningScreen = () => {
    const { cargoId } = useParams();
    const navigate = useNavigate();
    const [cargo, setCargo] = useState<any>(null);
    const [captures, setCaptures] = useState<any[]>([]);
    const [isRecording, setIsRecording] = useState(false);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animationRef = useRef<number>();

    useEffect(() => {
        const cargoList = JSON.parse(localStorage.getItem('cargoData') || '[]');
        const foundCargo = cargoList.find((c: any) => c.id === cargoId);
        if (foundCargo) {
            setCargo(foundCargo);
            if (foundCargo.captures) {
                setCaptures(foundCargo.captures);
            }
        } else {
            toast.error('Cargo tidak ditemukan');
            navigate('/');
        }
    }, [cargoId, navigate]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let scanLineY = 0;
        let scanDirection = 1;

        const drawXRay = () => {
            ctx.fillStyle = '#111827';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Mock X-Ray objects
            ctx.strokeStyle = '#22d3ee';
            ctx.lineWidth = 2;
            ctx.strokeRect(150, 100, 300, 200);
            ctx.strokeRect(200, 150, 100, 100);
            ctx.fillStyle = 'rgba(34, 211, 238, 0.2)';
            ctx.fillRect(150, 100, 300, 200);

            // Scan line
            ctx.strokeStyle = 'rgba(74, 222, 128, 0.8)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(0, scanLineY);
            ctx.lineTo(canvas.width, scanLineY);
            ctx.stroke();

            // Glow effect
            ctx.fillStyle = 'rgba(74, 222, 128, 0.2)';
            ctx.fillRect(0, scanLineY - 10, canvas.width, 20);

            scanLineY += 2 * scanDirection;
            if (scanLineY >= canvas.height || scanLineY <= 0) {
                scanDirection *= -1;
            }

            animationRef.current = requestAnimationFrame(drawXRay);
        };

        drawXRay();

        return () => {
            if (animationRef.current) cancelAnimationFrame(animationRef.current);
        };
    }, []);

    const addCapture = (type: string) => {
        const newCapture = {
            type,
            timestamp: new Date().toISOString()
        };
        setCaptures((prev) => [...prev, newCapture]);
        toast.success(`Berhasil merekam ${type}`);
    };

    const handleDecision = (result: 'released' | 'rejected') => {
        const cargoList = JSON.parse(localStorage.getItem('cargoData') || '[]');
        const updatedList = cargoList.map((c: any) =>
            c.id === cargoId ? {
                ...c,
                status: result,
                screeningResult: result === 'released' ? 'pass' : 'fail',
                screenedAt: new Date().toISOString(),
                captures
            } : c
        );
        localStorage.setItem('cargoData', JSON.stringify(updatedList));

        toast[result === 'released' ? 'success' : 'error'](`Cargo telah di-${result}`);

        setTimeout(() => {
            navigate('/repository');
        }, 1500);
    };

    if (!cargo) return <div>Loading...</div>;

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-6 border-b border-gray-200 pb-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Screening X-Ray</h1>
                    <div className="flex space-x-4 mt-1 text-sm text-gray-600">
                        <span>ID: <code className="bg-gray-100 px-1 rounded">{cargo.id}</code></span>
                        <span>SMU: <span className="font-semibold">{cargo.smu}</span></span>
                    </div>
                </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-6">
                {/* Left Panel */}
                <div className="w-full lg:w-72 space-y-4">
                    <AirlineDetails airline={cargo.airline} flightNumber={cargo.flightNumber} origin={cargo.origin} destination={cargo.destination} />

                    <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
                        <h3 className="text-sm font-semibold text-gray-700 mb-3">Detail Kargo</h3>
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between"><span className="text-gray-500">Jumlah Koli:</span> <span className="font-semibold">{cargo.quantity}</span></div>
                            <div className="flex justify-between"><span className="text-gray-500">Berat:</span> <span className="font-semibold">{cargo.weight} kg</span></div>
                            <div className="mt-2 text-gray-700 break-words">{cargo.description}</div>
                        </div>
                    </div>

                    <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
                        <h3 className="flex items-center text-sm font-semibold text-gray-700 mb-3"><ScanBarcode className="mr-2" size={16} /> Scan Barcode</h3>
                        <div className="flex flex-col space-y-2">
                            <input placeholder="Scan barcode..." className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm" />
                            <button className="flex items-center justify-center w-full px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50 focus:ring-2 focus:ring-gray-200 text-sm">
                                <ScanBarcode size={16} className="mr-2" /> Scan
                            </button>
                        </div>
                    </div>

                    <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
                        <h3 className="text-sm font-semibold text-gray-700 mb-3">Capture List ({captures.length})</h3>
                        <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                            {captures.length === 0 ? (
                                <p className="text-xs text-gray-500 text-center py-2">Belum ada capture</p>
                            ) : (
                                captures.map((cap, i) => (
                                    <div key={i} className="flex justify-between items-center py-1.5 border-b border-gray-100 last:border-0 text-sm">
                                        <div className="flex items-center">
                                            {cap.type === 'video' ? <Video size={14} className="text-blue-500 mr-2" /> : <Camera size={14} className="text-gray-500 mr-2" />}
                                            <span className="uppercase text-xs font-semibold">{cap.type}</span>
                                        </div>
                                        <span className="text-xs text-gray-500">{new Date(cap.timestamp).toLocaleTimeString()}</span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="flex-1 flex flex-col space-y-4">
                    <div className="bg-gray-900 rounded-xl overflow-hidden relative shadow-lg min-h-[400px] flex items-center justify-center border border-gray-800">
                        <div className="absolute top-4 right-4 z-10 flex space-x-2">
                            <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full flex items-center shadow-sm">
                                <span className="w-2 h-2 rounded-full bg-green-500 mr-1.5 animate-pulse"></span>
                                LIVE
                            </span>
                            {isRecording && (
                                <span className="bg-red-600 text-white text-xs px-2 py-1 rounded-full flex items-center shadow-sm">
                                    <span className="w-2 h-2 rounded-full bg-white mr-1.5 animate-pulse"></span>
                                    REC
                                </span>
                            )}
                        </div>
                        <canvas ref={canvasRef} width={600} height={400} className="w-full h-full max-h-[500px] object-contain" />
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                        <button onClick={() => addCapture('image')} className="flex items-center justify-center px-4 py-3 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition shadow-sm text-sm">
                            <Camera size={18} className="mr-2 text-gray-600" /> Capture Image
                        </button>
                        <button
                            onClick={() => {
                                if (isRecording) {
                                    setIsRecording(false);
                                    addCapture('video');
                                } else {
                                    setIsRecording(true);
                                }
                            }}
                            className={`flex items-center justify-center px-4 py-3 border rounded-lg transition shadow-sm text-sm ${isRecording ? 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100' : 'bg-white border-gray-300 hover:bg-gray-50'}`}
                        >
                            <Video size={18} className={`mr-2 ${isRecording ? 'text-red-500' : 'text-gray-600'}`} />
                            {isRecording ? 'Stop Video' : 'Record Video'}
                        </button>
                        <button onClick={() => addCapture('room')} className="flex items-center justify-center px-4 py-3 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition shadow-sm text-sm">
                            <Camera size={18} className="mr-2 text-gray-600" /> Capture Ruang
                        </button>
                    </div>

                    <div className="bg-white rounded-lg shadow border border-gray-200 p-6 mt-4">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4 text-center">Keputusan Screening</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <button onClick={() => handleDecision('released')} className="flex flex-col items-center justify-center h-24 bg-green-600 text-white rounded-xl hover:bg-green-700 transition shadow-md focus:ring-4 focus:ring-green-100">
                                <CheckCircle size={32} className="mb-2" />
                                <span className="text-lg font-bold">RELEASE</span>
                            </button>
                            <button onClick={() => handleDecision('rejected')} className="flex flex-col items-center justify-center h-24 bg-red-600 text-white rounded-xl hover:bg-red-700 transition shadow-md focus:ring-4 focus:ring-red-100">
                                <XCircle size={32} className="mb-2" />
                                <span className="text-lg font-bold">REJECT</span>
                            </button>
                        </div>
                        <p className="text-sm text-center text-gray-500 mt-4 px-8">
                            Pilih <span className="font-semibold text-green-700">RELEASE</span> jika hasil screening aman atau <span className="font-semibold text-red-700">REJECT</span> jika terdeteksi ancaman/barang berbahaya.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ScreeningScreen;
