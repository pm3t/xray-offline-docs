import React, { useState, useEffect } from 'react';
import { Search, Eye, CheckCircle, XCircle, Package, Clock, ImageIcon, Trash2, Send, RotateCcw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { scanDB } from '../../db/db';
import type { ScanHistoryItem } from '../../db/db';

const RepositoryScreen = () => {
    const [history, setHistory] = useState<ScanHistoryItem[]>([]);
    const [filteredList, setFilteredList] = useState<ScanHistoryItem[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('Semua Status');
    const [selectedScanIds, setSelectedScanIds] = useState<number[]>([]);
    const [selectedScan, setSelectedScan] = useState<ScanHistoryItem | null>(null);
    const navigate = useNavigate();

    const loadHistory = async () => {
        try {
            const data = await scanDB.getAll();
            const sortedData = data.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            setHistory(sortedData);
            setFilteredList(sortedData);
        } catch (err) {
            console.error('Failed to load history', err);
            toast.error('Gagal memuat riwayat scan');
        }
    };

    useEffect(() => {
        loadHistory();
    }, []);

    useEffect(() => {
        let result = history;
        if (searchTerm) {
            result = result.filter(h =>
                h.mawb.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (h.hawb && h.hawb.toLowerCase().includes(searchTerm.toLowerCase()))
            );
        }

        if (statusFilter !== 'Semua Status') {
            result = result.filter(h => h.status === statusFilter);
        }

        setFilteredList(result);
        setSelectedScanIds([]); // Reset selection on filter change
    }, [searchTerm, statusFilter, history]);

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedScanIds(filteredList.map(h => h.scanId));
        } else {
            setSelectedScanIds([]);
        }
    };

    const handleSelectRow = (scanId: number) => {
        if (selectedScanIds.includes(scanId)) {
            setSelectedScanIds(selectedScanIds.filter(id => id !== scanId));
        } else {
            setSelectedScanIds([...selectedScanIds, scanId]);
        }
    };

    const handleRedoScan = (item: ScanHistoryItem) => {
        if (window.confirm('Ulangi scan untuk kargo ini? Data scan lama akan tetap ada di history.')) {
            const cargoList = JSON.parse(localStorage.getItem('cargoData') || '[]');
            const cargo = cargoList.find((c: any) => c.mawb === item.mawb);
            if (cargo) {
                navigate(`/screening/${cargo.id}`);
            } else {
                navigate(`/screening?mawb=${item.mawb}&hawb=${item.hawb}`);
            }
        }
    };

    const handleSubmitToCustoms = async (item: ScanHistoryItem) => {
        if (item.submittedToCustoms) {
            toast.info('Data ini sudah disubmit ke Bea Cukai');
            return;
        }

        const confirmMsg = `Submit ke Bea Cukai?
Data yang akan dikirim:
- MAWB: ${item.mawb}
- HAWB: ${item.hawb || '-'}
- Qty: ${item.qty} Pcs
- Images: Top View, Side View, Foto Produk`;

        if (window.confirm(confirmMsg)) {
            const updatedItem: ScanHistoryItem = {
                ...item,
                submittedToCustoms: true,
                submittedAt: new Date().toISOString()
            };

            try {
                await scanDB.update(updatedItem);
                toast.success('Data berhasil disubmit ke Bea Cukai');
                loadHistory();
            } catch (err) {
                console.error('Failed to update submission status', err);
                toast.error('Gagal submit ke Bea Cukai');
            }
        }
    };

    const handleDelete = async (scanId: number) => {
        if (window.confirm('Hapus riwayat scan ini?')) {
            try {
                await scanDB.delete(scanId);
                toast.success('Riwayat scan berhasil dihapus');
                loadHistory();
                setSelectedScanIds(selectedScanIds.filter(id => id !== scanId));
                window.dispatchEvent(new Event('storage'));
            } catch (err) {
                console.error('Failed to delete scan', err);
                toast.error('Gagal menghapus riwayat scan');
            }
        }
    };

    const handleBulkDelete = async () => {
        if (selectedScanIds.length === 0) return;
        if (window.confirm(`Hapus ${selectedScanIds.length} riwayat scan terpilih?`)) {
            try {
                await scanDB.bulkDelete(selectedScanIds);
                toast.success(`${selectedScanIds.length} Riwayat scan berhasil dihapus`);
                loadHistory();
                setSelectedScanIds([]);
                window.dispatchEvent(new Event('storage'));
            } catch (err) {
                console.error('Failed to delete scans', err);
                toast.error('Gagal menghapus riwayat scan');
            }
        }
    };

    const getStatusBadge = (item: ScanHistoryItem) => {
        const status = item.status;
        const submitted = item.submittedToCustoms;

        let statusEl;
        switch (status) {
            case 'Release':
                statusEl = <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800 border border-green-300"><CheckCircle size={12} className="mr-1" /> Release</span>;
                break;
            case 'Reject':
                statusEl = <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800 border border-red-300"><XCircle size={12} className="mr-1" /> Reject</span>;
                break;
            default:
                statusEl = <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-800 border border-gray-300">{status}</span>;
        }

        return (
            <div className="flex flex-col space-y-1">
                {statusEl}
                {submitted && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold bg-blue-100 text-blue-700 border border-blue-200 uppercase tracking-tighter">
                        <Send size={10} className="mr-1" /> Submitted to Customs
                    </span>
                )}
            </div>
        );
    };

    const stats = {
        total: history.length,
        released: history.filter(h => h.status === 'Release').length,
        rejected: history.filter(h => h.status === 'Reject').length,
        submittedToCustoms: history.filter(h => h.submittedToCustoms).length
    };

    return (
        <div className="p-6">
            <div className="mb-6 flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 font-mono tracking-tighter uppercase">Scan History</h1>
                    <p className="text-gray-500 mt-1">Riwayat pemeriksaan kargo dan status sinkronisasi Bea Cukai.</p>
                </div>
                <div className="flex space-x-2">
                    <div className="text-right">
                        <span className="text-xs text-gray-400 block">Total Scans</span>
                        <span className="text-xl font-black text-blue-900">{stats.total}</span>
                    </div>
                    {selectedScanIds.length > 0 && (
                        <button
                            onClick={handleBulkDelete}
                            className="flex items-center space-x-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium transition-all shadow-sm animate-in fade-in slide-in-from-right-2 ml-4"
                        >
                            <Trash2 size={18} />
                            <span>Hapus Terpilih ({selectedScanIds.length})</span>
                        </button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                    <h3 className="text-gray-500 text-[10px] font-bold uppercase tracking-wider">Total Scans</h3>
                    <p className="text-2xl font-black text-gray-900 mt-1">{stats.total}</p>
                </div>
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                    <h3 className="text-gray-500 text-[10px] font-bold uppercase tracking-wider text-green-600">Total Released</h3>
                    <p className="text-2xl font-black text-green-600 mt-1">{stats.released}</p>
                </div>
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                    <h3 className="text-gray-500 text-[10px] font-bold uppercase tracking-wider text-red-600">Total Rejected</h3>
                    <p className="text-2xl font-black text-red-600 mt-1">{stats.rejected}</p>
                </div>
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                    <h3 className="text-gray-500 text-[10px] font-bold uppercase tracking-wider text-purple-600">Submit ke CEISA</h3>
                    <p className="text-2xl font-black text-purple-600 mt-1">{stats.submittedToCustoms}</p>
                </div>
            </div>

            <div className="flex flex-col md:flex-row gap-4 mb-6">
                <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search by MAWB or HAWB..."
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    />
                </div>
                <div className="w-full md:w-56 relative">
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white font-medium"
                    >
                        <option>Semua Status</option>
                        <option value="Release">Release</option>
                        <option value="Reject">Reject</option>
                    </select>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-4 w-10">
                                    <input
                                        type="checkbox"
                                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        onChange={handleSelectAll}
                                        checked={selectedScanIds.length === filteredList.length && filteredList.length > 0}
                                    />
                                </th>
                                <th className="px-4 py-4 text-left text-[10px] font-bold text-gray-500 uppercase tracking-widest">Scan ID</th>
                                <th className="px-4 py-4 text-left text-[10px] font-bold text-gray-500 uppercase tracking-widest">ULD No.</th>
                                <th className="px-4 py-4 text-left text-[10px] font-bold text-gray-500 uppercase tracking-widest">MAWB</th>
                                <th className="px-4 py-4 text-left text-[10px] font-bold text-gray-500 uppercase tracking-widest">HAWB</th>
                                <th className="px-4 py-4 text-left text-[10px] font-bold text-gray-500 uppercase tracking-widest">Pcs (Tot/Act)</th>
                                <th className="px-4 py-4 text-left text-[10px] font-bold text-gray-500 uppercase tracking-widest">Weight</th>
                                <th className="px-4 py-4 text-left text-[10px] font-bold text-gray-500 uppercase tracking-widest">Status</th>
                                <th className="px-4 py-4 text-left text-[10px] font-bold text-gray-500 uppercase tracking-widest">Time</th>
                                <th className="px-4 py-4 text-right text-[10px] font-bold text-gray-500 uppercase tracking-widest">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {filteredList.length === 0 ? (
                                <tr>
                                    <td colSpan={10} className="px-6 py-12 text-center">
                                        <Package size={40} className="mx-auto text-gray-200 mb-2" />
                                        <p className="text-sm text-gray-500 font-medium">No scan history found</p>
                                    </td>
                                </tr>
                            ) : (
                                filteredList.map((item) => (
                                    <tr key={item.scanId} className={`hover:bg-gray-50 transition-colors group border-l-4 border-l-transparent hover:border-l-blue-500 ${selectedScanIds.includes(item.scanId) ? 'bg-blue-50/50' : ''}`}>
                                        <td className="px-4 py-4">
                                            <input
                                                type="checkbox"
                                                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                checked={selectedScanIds.includes(item.scanId)}
                                                onChange={() => handleSelectRow(item.scanId)}
                                            />
                                        </td>
                                        <td className="px-4 py-4 whitespace-nowrap text-sm font-bold text-gray-400 font-mono">#{item.scanId}</td>
                                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600 font-medium">{item.uldNo || '-'}</td>
                                        <td className="px-4 py-4 whitespace-nowrap text-sm font-black text-blue-700">{item.mawb}</td>
                                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600 font-medium">{item.hawb || '-'}</td>
                                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 font-bold">
                                            {item.qty} Pcs
                                        </td>
                                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600 font-mono">{item.totalWeight || 0} kg</td>
                                        <td className="px-4 py-4 whitespace-nowrap">{getStatusBadge(item)}</td>
                                        <td className="px-4 py-4 whitespace-nowrap text-xs text-gray-500 items-center mt-1">
                                            <Clock size={12} className="inline mr-1" />
                                            {new Date(item.timestamp).toLocaleString()}
                                        </td>
                                        <td className="px-4 py-4 whitespace-nowrap text-right space-x-1">
                                            <button onClick={() => setSelectedScan(item)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-all shadow-sm border border-transparent hover:border-blue-100" title="View Snapshot">
                                                <Eye size={16} />
                                            </button>
                                            <button onClick={() => handleRedoScan(item)} className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg transition-all shadow-sm border border-transparent hover:border-amber-100" title="Mengulang Scan">
                                                <RotateCcw size={16} />
                                            </button>
                                            <button
                                                onClick={() => handleSubmitToCustoms(item)}
                                                className={`p-2 rounded-lg transition-all shadow-sm border border-transparent ${item.submittedToCustoms ? 'text-gray-400 bg-gray-50 cursor-not-allowed' : 'text-green-600 hover:bg-green-50 hover:border-green-100'}`}
                                                title="Submit ke Bea Cukai"
                                            >
                                                <Send size={16} />
                                            </button>
                                            <button onClick={() => handleDelete(item.scanId)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-all shadow-sm border border-transparent hover:border-red-100" title="Hapus">
                                                <Trash2 size={16} />
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
                                    <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest flex items-center">
                                        <ImageIcon size={14} className="mr-2" /> Top View X-Ray
                                    </h3>
                                    <div className="bg-gray-900 aspect-[4/3] rounded-xl overflow-hidden border-4 border-gray-800 shadow-inner">
                                        {selectedScan.topViewImage ? <img src={selectedScan.topViewImage} className="w-full h-full object-contain" alt="Top View" /> : <div className="w-full h-full flex items-center justify-center text-gray-600 text-xs uppercase font-bold">No Image</div>}
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest flex items-center">
                                        <ImageIcon size={14} className="mr-2" /> Side View X-Ray
                                    </h3>
                                    <div className="bg-gray-900 aspect-[4/3] rounded-xl overflow-hidden border-4 border-gray-800 shadow-inner">
                                        {selectedScan.sideViewImage ? <img src={selectedScan.sideViewImage} className="w-full h-full object-contain" alt="Side View" /> : <div className="w-full h-full flex items-center justify-center text-gray-600 text-xs uppercase font-bold">No Image</div>}
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest flex items-center">
                                        <ImageIcon size={14} className="mr-2" /> Foto Barang
                                    </h3>
                                    <div className="bg-gray-200 aspect-[4/3] rounded-xl overflow-hidden border-4 border-gray-100 shadow-inner flex items-center justify-center">
                                        {selectedScan.fotoBarang ? <img src={selectedScan.fotoBarang} className="w-full h-full object-contain" alt="Foto Barang" /> : <div className="text-gray-400 text-xs text-center p-4 italic font-medium">No Photo Uploaded</div>}
                                    </div>
                                </div>
                            </div>

                            <div className="mt-8 pt-6 border-t border-gray-100 flex justify-between items-center text-gray-400 italic text-xs">
                                <span>Scan processed at: {new Date(selectedScan.timestamp).toLocaleString()}</span>
                                <span className="font-bold text-gray-300">SYSTEM SNAPSHOT SECURE</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default RepositoryScreen;
