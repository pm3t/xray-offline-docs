import { useState, useEffect } from 'react';
import { Search, Filter, Eye, Send, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const RepositoryScreen = () => {
    const [cargoList, setCargoList] = useState<any[]>([]);
    const [filteredList, setFilteredList] = useState<any[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('Semua Status');
    const [selectedCargo, setSelectedCargo] = useState<any>(null);

    useEffect(() => {
        const data = JSON.parse(localStorage.getItem('cargoData') || '[]');
        setCargoList(data);
        setFilteredList(data);
    }, []);

    useEffect(() => {
        let result = cargoList;
        if (searchTerm) {
            result = result.filter(c =>
                c.smu.toLowerCase().includes(searchTerm.toLowerCase()) ||
                c.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                c.airline.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }

        if (statusFilter !== 'Semua Status') {
            result = result.filter(c => c.status === statusFilter.toLowerCase());
        }

        setFilteredList(result);
    }, [searchTerm, statusFilter, cargoList]);

    const handleSendToCustoms = async (cargoId: string) => {
        // Optimistic UI update
        setCargoList(prev => prev.map(c => c.id === cargoId ? { ...c, customsStatus: 'sending' } : c));

        // Simulate API Call
        await new Promise(resolve => setTimeout(resolve, 2000));

        const updatedList = cargoList.map(c =>
            c.id === cargoId ? { ...c, customsStatus: 'sent', customsSentAt: new Date().toISOString() } : c
        );

        setCargoList(updatedList);
        localStorage.setItem('cargoData', JSON.stringify(updatedList));
        toast.success('Data berhasil dikirim ke Customs');
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'released':
                return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-300"><CheckCircle size={12} className="mr-1" /> Released</span>;
            case 'rejected':
                return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 border border-red-300"><XCircle size={12} className="mr-1" /> Rejected</span>;
            default:
                return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-300">Pending</span>;
        }
    };

    const getCustomsBadge = (customsStatus: string) => {
        switch (customsStatus) {
            case 'sent':
                return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-300"><CheckCircle size={12} className="mr-1" /> Terkirim</span>;
            case 'sending':
                return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-300"><Loader2 size={12} className="mr-1 animate-spin" /> Mengirim...</span>;
            default:
                return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">Belum Dikirim</span>;
        }
    };

    const stats = {
        total: cargoList.length,
        screened: cargoList.filter(c => c.status !== 'pending').length,
        released: cargoList.filter(c => c.status === 'released').length,
        sentToCustoms: cargoList.filter(c => c.customsStatus === 'sent').length
    };

    return (
        <div className="p-6">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900">Repository Cargo</h1>
                <p className="text-gray-600 mt-1">Kelola data kargo yang sudah di-screening dan kirim ke Customs.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
                    <h3 className="text-gray-500 text-sm font-medium">Total Cargo</h3>
                    <p className="text-3xl font-bold text-blue-600 mt-2">{stats.total}</p>
                </div>
                <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
                    <h3 className="text-gray-500 text-sm font-medium">Sudah Screening</h3>
                    <p className="text-3xl font-bold text-purple-600 mt-2">{stats.screened}</p>
                </div>
                <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
                    <h3 className="text-gray-500 text-sm font-medium">Released</h3>
                    <p className="text-3xl font-bold text-green-600 mt-2">{stats.released}</p>
                </div>
                <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
                    <h3 className="text-gray-500 text-sm font-medium">Terkirim ke Customs</h3>
                    <p className="text-3xl font-bold text-orange-600 mt-2">{stats.sentToCustoms}</p>
                </div>
            </div>

            <div className="flex space-x-4 mb-6">
                <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Cari berdasarkan SMU, ID Cargo, atau Airline..."
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    />
                </div>
                <div className="w-48 relative">
                    <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 bg-white"
                    >
                        <option>Semua Status</option>
                        <option>Pending</option>
                        <option>Released</option>
                        <option>Rejected</option>
                    </select>
                </div>
            </div>

            <div className="bg-white rounded-lg shadow border border-gray-200 overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">ID Cargo</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">SMU</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Airline</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Rute</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Status Screening</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Status Customs</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Waktu Screening</th>
                            <th className="px-6 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">Aksi</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {filteredList.length === 0 ? (
                            <tr>
                                <td colSpan={8} className="px-6 py-8 text-center text-sm text-gray-500">Tidak ada data kargo</td>
                            </tr>
                        ) : (
                            filteredList.map((cargo) => (
                                <tr key={cargo.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-500">{cargo.id}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">{cargo.smu}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{cargo.airline} - {cargo.flightNumber}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{cargo.origin} → {cargo.destination}</td>
                                    <td className="px-6 py-4 whitespace-nowrap">{getStatusBadge(cargo.status)}</td>
                                    <td className="px-6 py-4 whitespace-nowrap">{getCustomsBadge(cargo.customsStatus)}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{cargo.screenedAt ? new Date(cargo.screenedAt).toLocaleString() : '-'}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2 flex justify-end">
                                        <button onClick={() => setSelectedCargo(cargo)} className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                                            <Eye size={14} className="mr-1.5" /> Detail
                                        </button>
                                        {(cargo.status === 'released' || cargo.status === 'rejected') && !['sent', 'sending'].includes(cargo.customsStatus) && (
                                            <button
                                                onClick={() => cargo.status === 'released' && handleSendToCustoms(cargo.id)}
                                                disabled={cargo.status !== 'released'}
                                                className={`inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${cargo.status === 'released' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-400 cursor-not-allowed'}`}
                                            >
                                                <Send size={14} className="mr-1.5" /> Kirim ke CEISA
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Modal Detail Cargo */}
            {selectedCargo && (
                <div className="fixed inset-0 bg-gray-900/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedCargo(null)}>
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50 rounded-t-lg">
                            <h2 className="text-xl font-bold text-gray-900">Detail Cargo</h2>
                            <button onClick={() => setSelectedCargo(null)} className="text-gray-400 hover:text-gray-500">
                                <XCircle size={24} />
                            </button>
                        </div>
                        <div className="p-6">
                            <div className="grid grid-cols-2 gap-6 mb-6">
                                <div><span className="text-sm text-gray-500 block">ID Cargo:</span> <span className="font-semibold font-mono">{selectedCargo.id}</span></div>
                                <div><span className="text-sm text-gray-500 block">SMU:</span> <span className="font-semibold">{selectedCargo.smu}</span></div>
                                <div><span className="text-sm text-gray-500 block">Airline:</span> <span className="font-semibold">{selectedCargo.airline} - {selectedCargo.flightNumber}</span></div>
                                <div><span className="text-sm text-gray-500 block">Rute:</span> <span className="font-semibold">{selectedCargo.origin} → {selectedCargo.destination}</span></div>
                                <div><span className="text-sm text-gray-500 block">Jumlah & Berat:</span> <span className="font-semibold">{selectedCargo.quantity} koli, {selectedCargo.weight} kg</span></div>
                                <div><span className="text-sm text-gray-500 block">Status Screening:</span> <div className="mt-1">{getStatusBadge(selectedCargo.status)}</div></div>
                                <div className="col-span-2"><span className="text-sm text-gray-500 block">Deskripsi:</span> <span className="font-semibold">{selectedCargo.description}</span></div>
                            </div>

                            {selectedCargo.captures && selectedCargo.captures.length > 0 && (
                                <div className="border-t border-gray-200 pt-6">
                                    <h3 className="text-md font-semibold text-gray-900 mb-3">Captures ({selectedCargo.captures.length})</h3>
                                    <div className="flex flex-wrap gap-2">
                                        {selectedCargo.captures.map((cap: any, i: number) => (
                                            <span key={i} className="inline-flex items-center px-2.5 py-1 border border-gray-300 rounded text-xs font-semibold bg-gray-50 uppercase">
                                                {cap.type} <span className="text-gray-400 font-normal ml-2">{new Date(cap.timestamp).toLocaleTimeString()}</span>
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default RepositoryScreen;
