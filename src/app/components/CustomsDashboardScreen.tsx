import { useState, useEffect } from 'react';
import { ShieldAlert, CheckCircle, XCircle, Search, Calendar, AlertTriangle, Eye, ScanBarcode, ChevronLeft, ChevronRight, Layers } from 'lucide-react';
import { scanDB } from '../../db/db';
import { ImageZoomModal } from './ui/ImageZoomModal';

interface ScanHistoryItem {
    scanId: number;
    mawb: string;
    hawb: string;
    uldNo?: string;
    qty: number;
    status: 'Finished XRay' | 'Pending XRay' | string;
    timestamp: string;
    topViewImage?: string;
    sideViewImage?: string;
    fotoBarang?: string;
    cropImages?: string[];
}

const CustomsDashboardScreen = () => {
    const [scanData, setScanData] = useState<ScanHistoryItem[]>([]);

    const [currentPage, setCurrentPage] = useState(1);
    const [recordsPerPage, setRecordsPerPage] = useState('10');

    useEffect(() => {
        const savedSettings = localStorage.getItem('apiSettings');
        if (savedSettings) {
            try {
                const parsed = JSON.parse(savedSettings);
                if (parsed.recordsPerPage) {
                    setRecordsPerPage(String(parsed.recordsPerPage));
                }
            } catch (e) { }
        }
    }, []);

    const [filterDate, setFilterDate] = useState<string>(new Date().toISOString().substring(0, 10));
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedItem, setSelectedItem] = useState<ScanHistoryItem | null>(null);
    const [zoomImage, setZoomImage] = useState<string | null>(null);

    useEffect(() => {
        const loadData = async () => {
            try {
                // Use IndexedDB to load scan history
                const allScans = await scanDB.getAll();
                // Sort by newest first
                const sorted = [...allScans].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
                setScanData(sorted);
            } catch (error) {
                console.error("Failed to load scan history:", error);
                const local = JSON.parse(localStorage.getItem('scanHistory') || '[]');
                const sorted = [...local].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
                setScanData(sorted);
            }
        };
        loadData();
        // Setup a polling mechanism to simulate real-time updates for the dashboard
        const interval = setInterval(loadData, 5000);
        return () => clearInterval(interval);
    }, []);

    // Derived states
    const filteredByDate = filterDate
        ? scanData.filter(item => item.timestamp.startsWith(filterDate))
        : scanData;

    const filteredScans = filteredByDate.filter(item =>
        (item.mawb || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.hawb || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    const totalScans = filteredByDate.length;
    const totalReleased = filteredByDate.filter(item => item.status && item.status === 'Finished XRay').length;
    const totalRejected = filteredByDate.filter(item => item.status && item.status === 'Pending XRay').length;

    const highRiskAlerts = filteredByDate.filter(item => item.status && item.status === 'Pending XRay');

    const totalPages = recordsPerPage === 'All' ? 1 : Math.ceil(filteredScans.length / (recordsPerPage as unknown as number));
    const paginatedList = recordsPerPage === 'All' ? filteredScans : filteredScans.slice((currentPage - 1) * (recordsPerPage as unknown as number), currentPage * (recordsPerPage as unknown as number));

    return (
        <div className="p-6 min-h-screen bg-slate-50 w-full">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-slate-800 flex items-center">
                        <ShieldAlert className="mr-3 text-blue-800" size={32} />
                        Customs Dashboard
                    </h1>
                    <p className="text-slate-500 mt-1">Monitoring jalur X-Ray dan manajemen risiko.</p>
                </div>

                <div className="flex items-center space-x-3 bg-white p-2 rounded-lg shadow-sm border border-slate-200">
                    <Calendar className="text-slate-400" size={20} />
                    <input
                        type="date"
                        value={filterDate}
                        onChange={(e) => { setFilterDate(e.target.value); setCurrentPage(1); }}
                        className="outline-none text-slate-700 font-medium bg-transparent"
                    />
                    {filterDate && (
                        <button
                            onClick={() => { setFilterDate(''); setCurrentPage(1); }}
                            className="text-xs text-red-500 hover:text-red-700 ml-2 border-l border-slate-200 pl-2"
                        >
                            Reset
                        </button>
                    )}
                </div>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between border-l-4 border-l-blue-500">
                    <div>
                        <p className="text-sm font-semibold text-slate-500 uppercase tracking-widest">Total Diperiksa</p>
                        <p className="text-4xl font-black text-slate-800 mt-1">{totalScans}</p>
                    </div>
                    <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                        <ScanBarcode size={24} />
                    </div>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between border-l-4 border-l-green-500">
                    <div>
                        <p className="text-sm font-semibold text-slate-500 uppercase tracking-widest">Finished XRay</p>
                        <p className="text-4xl font-black text-slate-800 mt-1">{totalReleased}</p>
                    </div>
                    <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center text-green-600">
                        <CheckCircle size={24} />
                    </div>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between border-l-4 border-l-red-500">
                    <div>
                        <p className="text-sm font-semibold text-slate-500 uppercase tracking-widest">Tertahan (Pending XRay)</p>
                        <p className="text-4xl font-black text-red-600 mt-1">{totalRejected}</p>
                    </div>
                    <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center text-red-600">
                        <AlertTriangle size={24} />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                {/* Main Table */}
                <div className="xl:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-[600px]">
                    <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                        <h2 className="text-lg font-bold text-slate-800">Daftar Kargo Terscan</h2>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                            <input
                                type="text"
                                placeholder="Cari MAWB/HAWB..."
                                value={searchTerm}
                                onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                                className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
                            />
                        </div>
                    </div>

                    <div className="overflow-y-auto flex-1">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-slate-50 sticky top-0 z-10">
                                <tr>
                                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b">Waktu</th>
                                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b">MAWB / HAWB</th>
                                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b">Status Operator</th>
                                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b">Aksi</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredScans.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="text-center py-8 text-slate-400">Tidak ada data ditemukan.</td>
                                    </tr>
                                ) : (
                                    paginatedList.map((item) => (
                                        <tr key={item.scanId} className={`hover:bg-slate-50 transition-colors ${selectedItem?.scanId === item.scanId ? 'bg-blue-50/50' : ''}`}>
                                            <td className="px-4 py-3 text-sm text-slate-600">
                                                {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="font-bold text-slate-800">{item.mawb || '-'}</div>
                                                <div className="text-xs text-slate-500">{item.hawb || '-'}</div>
                                            </td>
                                            <td className="px-4 py-3">
                                                {item.status && item.status === 'Finished XRay' ? (
                                                    <span className="inline-flex items-center px-2 py-1 bg-green-100 text-green-700 text-xs font-bold rounded">
                                                        FINISHED XRAY
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center px-2 py-1 bg-red-100 text-red-700 text-xs font-bold rounded">
                                                        PENDING XRAY
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                <button
                                                    onClick={() => setSelectedItem(item)}
                                                    className="inline-flex items-center text-blue-600 hover:text-blue-800 text-sm font-medium"
                                                >
                                                    <Eye size={16} className="mr-1" />
                                                    View
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table></div>
                    {/* Pagination */}
                    {recordsPerPage !== 'All' && totalPages > 1 && (
                        <div className="flex items-center justify-between px-4 py-3 bg-white border-t border-slate-200">
                            <div className="flex items-center text-sm text-slate-500">
                                Page {currentPage} of {totalPages} (Total {filteredScans.length} records)
                            </div>
                            <div className="flex items-center space-x-2">
                                <button
                                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                    disabled={currentPage === 1}
                                    className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    <ChevronLeft size={18} />
                                </button>
                                <button
                                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                    disabled={currentPage === totalPages}
                                    className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    <ChevronRight size={18} />
                                </button>
                            </div>
                        </div>
                    )}</div>

                {/* Right Panel: Detail view or Alerts */}
                <div className="bg-slate-900 rounded-xl shadow-xl overflow-hidden flex flex-col h-[600px] text-white">
                    {selectedItem ? (
                        <div className="flex flex-col h-full">
                            <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800">
                                <h3 className="font-bold text-slate-100">Detail X-Ray</h3>
                                <button onClick={() => setSelectedItem(null)} className="text-slate-400 hover:text-white">
                                    <XCircle size={20} />
                                </button>
                            </div>
                            <div className="p-4 overflow-y-auto space-y-4">
                                <div>
                                    <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">MAWB / HAWB</p>
                                    <p className="font-bold">{selectedItem.mawb} {selectedItem.hawb ? `/ ${selectedItem.hawb}` : ''}</p>
                                </div>
                                <div className="space-y-2">
                                    {selectedItem.topViewImage && (
                                        <div className="bg-black rounded-lg overflow-hidden border border-slate-700 relative">
                                            <span className="absolute top-2 left-2 bg-black/60 text-[10px] px-2 py-1 rounded">TOP VIEW</span>
                                            <img
                                                src={selectedItem.topViewImage}
                                                alt="X-Ray Top"
                                                className="w-full max-h-40 object-contain mx-auto cursor-pointer hover:opacity-90 transition-opacity"
                                                onClick={() => setZoomImage(selectedItem.topViewImage || null)}
                                            />
                                        </div>
                                    )}
                                    {selectedItem.sideViewImage && (
                                        <div className="bg-black rounded-lg overflow-hidden border border-slate-700 relative">
                                            <span className="absolute top-2 left-2 bg-black/60 text-[10px] px-2 py-1 rounded">SIDE VIEW</span>
                                            <img
                                                src={selectedItem.sideViewImage}
                                                alt="X-Ray Side"
                                                className="w-full max-h-40 object-contain mx-auto cursor-pointer hover:opacity-90 transition-opacity"
                                                onClick={() => setZoomImage(selectedItem.sideViewImage || null)}
                                            />
                                        </div>
                                    )}
                                    {selectedItem.fotoBarang && (
                                        <div className="bg-black rounded-lg overflow-hidden border border-slate-700 relative">
                                            <span className="absolute top-2 left-2 bg-black/60 text-[10px] px-2 py-1 rounded">FOTO BARANG</span>
                                            <img
                                                src={selectedItem.fotoBarang}
                                                alt="Foto Aktual"
                                                className="w-full max-h-40 object-contain mx-auto cursor-pointer hover:opacity-90 transition-opacity"
                                                onClick={() => setZoomImage(selectedItem.fotoBarang || null)}
                                            />
                                        </div>
                                    )}
                                </div>

                                {/* AI Crop Images Section */}
                                {selectedItem.cropImages && selectedItem.cropImages.length > 0 && (
                                    <div className="mt-4 pt-4 border-t border-slate-700">
                                        <p className="text-xs text-slate-400 uppercase tracking-wider mb-3 flex items-center">
                                            <Layers size={14} className="mr-2" />
                                            AI Autocrop ({selectedItem.cropImages.length} Koli)
                                        </p>
                                        <div className="grid grid-cols-2 gap-2">
                                            {selectedItem.cropImages.map((url, i) => (
                                                <div key={url} className="bg-black rounded-lg overflow-hidden border border-slate-700 relative aspect-square">
                                                    <span className="absolute top-1 left-1 bg-black/80 text-[9px] px-1.5 py-0.5 rounded text-white font-bold z-10">#{i + 1}</span>
                                                    <img
                                                        src={url}
                                                        alt={`Koli ${i + 1}`}
                                                        className="w-full h-full object-contain cursor-pointer hover:opacity-90 transition-opacity"
                                                        onClick={() => setZoomImage(url)}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                <div className="pt-4 border-t border-slate-700">
                                    <button className="w-full py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold tracking-wide transition-colors">
                                        Tandai Untuk Pemeriksaan Fisik (NHI)
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="p-4 border-b border-slate-700 bg-red-900/40">
                                <h3 className="font-bold flex items-center text-red-100">
                                    <AlertTriangle className="mr-2 text-red-500" size={18} />
                                    Alert Feed / Anomaly
                                </h3>
                            </div>
                            <div className="p-4 flex-1 overflow-y-auto">
                                {highRiskAlerts.length > 0 ? (
                                    <div className="space-y-3">
                                        {highRiskAlerts.slice(0, 5).map(alert => (
                                            <div key={alert.scanId} className="bg-slate-800 p-3 rounded-lg border-l-4 border-l-red-500 cursor-pointer hover:bg-slate-700 transition" onClick={() => setSelectedItem(alert)}>
                                                <p className="text-xs text-red-400 font-bold mb-1">{new Date(alert.timestamp).toLocaleTimeString()}</p>
                                                <p className="text-sm text-slate-200">Kargo <span className="font-bold">{alert.mawb}</span> berstatus Pending XRay.</p>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center text-slate-500">
                                        <CheckCircle size={48} className="mb-2 opacity-50" />
                                        <p className="text-sm">Gudang kondusif.</p>
                                        <p className="text-xs">Tidak ada flag risiko tinggi.</p>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>

            <ImageZoomModal
                isOpen={!!zoomImage}
                onClose={() => setZoomImage(null)}
                imageUrl={zoomImage || ''}
            />
        </div >
    );
};

export default CustomsDashboardScreen;
