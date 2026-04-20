import React, { useState, useEffect, useRef } from 'react';
import { Package, Edit, Trash2, Plus, X, FileSpreadsheet, Search, Send, RefreshCw, Settings, Check, Printer, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { Link } from 'react-router-dom';
import { cargoAPI, scanDB, settingsAPI } from '../../db/db';
import type { ScanHistoryItem } from '../../db/db';
import Barcode from 'react-barcode';

interface CargoData {
    id: string;
    uldNo: string;
    mawb: string;
    hawb: string;
    totalPcs: number;
    totalWeight: number;
    goodsDescription: string;
    actualPcs: number;
    isSentToCeisa?: boolean;
    smu?: string;
    airline?: string;
    flightNumber?: string;
    origin?: string;
    destination?: string;
}

const InputDataScreen = () => {
    const [cargoList, setCargoList] = useState<CargoData[]>([]);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [recordsPerPage, setRecordsPerPage] = useState('10');
    const [showIncompleteOnly, setShowIncompleteOnly] = useState(false);

    useEffect(() => {
        settingsAPI.getAll().then(s => {
            if (s.recordsPerPage) setRecordsPerPage(s.recordsPerPage);
        }).catch(() => {
            // fallback
            const saved = localStorage.getItem('apiSettings');
            if (saved) { try { const p = JSON.parse(saved); if (p.recordsPerPage) setRecordsPerPage(String(p.recordsPerPage)); } catch (_) {/* */ } }
        });
    }, []);

    const [columnWidths, setColumnWidths] = useState<{ [key: string]: number }>({
        uldNo: 150, mawb: 180, hawb: 150, totalPcs: 100, totalWeight: 120,
        goodsDescription: 250, actualPcs: 100, releasedPcs: 100, rejectedPcs: 100,
    });
    const [visibleColumns, setVisibleColumns] = useState({
        uldNo: true, totalWeight: true, goodsDescription: true,
        actualPcs: true, releasedPcs: true, rejectedPcs: true,
    });
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingCargo, setEditingCargo] = useState<CargoData | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [formData, setFormData] = useState<Partial<CargoData>>({
        uldNo: '', mawb: '', hawb: '', totalPcs: 0, totalWeight: 0, goodsDescription: '', actualPcs: 0,
    });

    const [scanHistory, setScanHistory] = useState<ScanHistoryItem[]>([]);
    const [printingCargo, setPrintingCargo] = useState<CargoData | null>(null);

    const loadData = async () => {
        try {
            const [list, history] = await Promise.all([cargoAPI.getAll(), scanDB.getAll()]);
            setCargoList(list);
            setScanHistory(history);
        } catch (err) {
            console.error('Failed to load data from API, trying localStorage fallback', err);
            const saved = localStorage.getItem('cargoData');
            if (saved) setCargoList(JSON.parse(saved));
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const handlePrint = (cargo: CargoData) => {
        setPrintingCargo(cargo);
        setTimeout(() => { window.print(); }, 100);
    };

    useEffect(() => {
        const handleAfterPrint = () => setPrintingCargo(null);
        window.addEventListener('afterprint', handleAfterPrint);
        return () => window.removeEventListener('afterprint', handleAfterPrint);
    }, []);

    const handleResize = (column: string, e: React.MouseEvent) => {
        e.preventDefault();
        const startX = e.pageX;
        const startWidth = columnWidths[column];
        const handleMouseMove = (moveEvent: MouseEvent) => {
            const newWidth = Math.max(50, startWidth + (moveEvent.pageX - startX));
            setColumnWidths(prev => ({ ...prev, [column]: newWidth }));
        };
        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'default';
        };
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = 'col-resize';
    };

    const getCalculatedPcs = (mawb: string, hawb: string) => {
        const related = scanHistory.filter(h => h.mawb === mawb && (h.hawb || '') === (hawb || ''));
        const actual = related.reduce((sum, s) => sum + (Number(s.qty) || 0), 0);
        const released = related.filter(s => s.status === 'Finished XRay' || s.status === 'Release').reduce((sum, s) => sum + (Number(s.qty) || 0), 0);
        const rejected = related.filter(s => s.status === 'Pending XRay' || s.status === 'Reject').reduce((sum, s) => sum + (Number(s.qty) || 0), 0);
        return { actual, released, rejected };
    };

    const handleSendToCeisa = async (id: string) => {
        const cargo = cargoList.find(c => c.id === id);
        if (!cargo) return;
        const updated = { ...cargo, isSentToCeisa: true };
        await cargoAPI.update(updated);
        setCargoList(prev => prev.map(c => c.id === id ? updated : c));
        toast.success('Data berhasil dikirim ke CEISA');
    };

    const totalMAWB = new Set(cargoList.map(c => c.mawb)).size;
    const incomingIncompleteScan = cargoList.filter(c => c.totalPcs > getCalculatedPcs(c.mawb, c.hawb).actual).length;
    const totalHAWB = new Set(cargoList.map(c => c.hawb)).size;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData({ ...formData, [name]: name === 'totalPcs' || name === 'totalWeight' || name === 'actualPcs' ? Number(value) : value });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const newCargo: CargoData = {
            ...(editingCargo || { id: `CGO-${Date.now()}` }),
            ...(formData as CargoData),
            smu: formData.mawb, airline: 'GA', flightNumber: 'GA000', origin: 'CGK', destination: 'SUB',
        };
        try {
            if (editingCargo) {
                await cargoAPI.update(newCargo);
                setCargoList(prev => prev.map(c => c.id === editingCargo.id ? newCargo : c));
                toast.success('Data diperbarui');
            } else {
                await cargoAPI.save(newCargo);
                setCargoList(prev => [...prev, newCargo]);
                toast.success('Data ditambahkan');
            }
        } catch { toast.error('Gagal menyimpan data'); }
        setIsModalOpen(false);
        setEditingCargo(null);
        resetForm();
    };

    const resetForm = () => setFormData({ uldNo: '', mawb: '', hawb: '', totalPcs: 0, totalWeight: 0, goodsDescription: '', actualPcs: 0 });
    const handleEdit = (cargo: CargoData) => { setEditingCargo(cargo); setFormData(cargo); setIsModalOpen(true); };

    const handleDelete = async (id: string) => {
        if (window.confirm('Hapus data ini?')) {
            await cargoAPI.delete(id);
            setCargoList(prev => prev.filter(c => c.id !== id));
            setSelectedIds(prev => prev.filter(sid => sid !== id));
            toast.info('Data berhasil dihapus');
        }
    };

    const handleBulkDelete = async () => {
        if (selectedIds.length === 0) return;
        if (window.confirm(`Hapus ${selectedIds.length} data terpilih?`)) {
            await Promise.all(selectedIds.map(id => cargoAPI.delete(id)));
            setCargoList(prev => prev.filter(c => !selectedIds.includes(c.id)));
            setSelectedIds([]);
            toast.info(`${selectedIds.length} data berhasil dihapus`);
        }
    };

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSelectedIds(e.target.checked ? paginatedList.map(c => c.id) : []);
    };
    const handleSelectRow = (id: string) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(sid => sid !== id) : [...prev, id]);
    };

    const handleImportXLS = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (evt) => {
            const bstr = evt.target?.result;
            const workbook = XLSX.read(bstr, { type: 'binary' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const data = XLSX.utils.sheet_to_json(worksheet) as any[];
            const importedCargo: CargoData[] = data.map((row, index) => ({
                id: `CGO-IMP-${Date.now()}-${index}`,
                uldNo: row['ULD No'] || '', mawb: row['MAWB'] || '', hawb: row['HAWB'] || '',
                totalPcs: Number(row['Tot Pcs'] || 0), totalWeight: Number(row['Tot Weight'] || 0),
                goodsDescription: row['Nature of Goods'] || '', actualPcs: Number(row['Tot Pcs'] || 0),
                smu: row['MAWB'] || '', airline: 'GA', flightNumber: 'GA000', origin: 'CGK', destination: 'SUB',
            }));
            try {
                await cargoAPI.saveBulk(importedCargo);
                setCargoList(prev => [...prev, ...importedCargo]);
                toast.success(`Berhasil mengimpor ${importedCargo.length} data`);
            } catch { toast.error('Gagal mengimpor data'); }
            if (fileInputRef.current) fileInputRef.current.value = '';
        };
        reader.readAsBinaryString(file);
    };

    const handleSyncAPI = async () => {
        toast.loading('Sinkronisasi API...', { id: 'sync' });
        await new Promise(resolve => setTimeout(resolve, 2000));
        const mockApiData: CargoData[] = [{
            id: `CGO-API-${Date.now()}-1`, uldNo: 'ULD998877', mawb: '126-55443322', hawb: 'H-55443322',
            totalPcs: 10, totalWeight: 150.5, goodsDescription: 'Electronic Goods', actualPcs: 0,
            smu: '126-55443322', airline: 'GA', flightNumber: 'GA123', origin: 'CGK', destination: 'DPS',
        }];
        try {
            await cargoAPI.saveBulk(mockApiData);
            setCargoList(prev => [...prev, ...mockApiData]);
            toast.success('Sinkronisasi API Berhasil', { id: 'sync' });
        } catch { toast.error('Gagal sinkronisasi API', { id: 'sync' }); }
    };

    const baseFilteredList = cargoList.filter(c => {
        const matchesSearch = c.mawb.toLowerCase().includes(searchTerm.toLowerCase()) ||
            c.uldNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
            c.hawb.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesIncomplete = showIncompleteOnly ? c.totalPcs > getCalculatedPcs(c.mawb, c.hawb).actual : true;
        return matchesSearch && matchesIncomplete;
    });

    const totalPages = recordsPerPage === 'All' ? 1 : Math.ceil(baseFilteredList.length / (recordsPerPage as unknown as number));
    const paginatedList = recordsPerPage === 'All' ? baseFilteredList : baseFilteredList.slice((currentPage - 1) * (recordsPerPage as unknown as number), currentPage * (recordsPerPage as unknown as number));
    const filteredList = paginatedList;

    return (
        <>
            <div className="p-6 max-w-[1400px] mx-auto print:hidden">
                {/* Dashboard */}
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-3 gap-4 mb-8">
                    <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex items-center space-x-4">
                        <div className="p-3 bg-blue-50 text-blue-600 rounded-lg"><FileSpreadsheet size={24} /></div>
                        <div><p className="text-sm text-gray-500 font-medium">Total MAWB</p><p className="text-2xl font-bold text-gray-900">{totalMAWB}</p></div>
                    </div>
                    <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex items-center space-x-4">
                        <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg"><FileSpreadsheet size={24} /></div>
                        <div><p className="text-sm text-gray-500 font-medium">Total HAWB</p><p className="text-2xl font-bold text-gray-900">{totalHAWB}</p></div>
                    </div>
                    <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex items-center space-x-4">
                        <div className="p-3 bg-red-50 text-red-600 rounded-lg"><AlertCircle size={24} /></div>
                        <div><p className="text-sm text-gray-500 font-medium">Incomplete Scan</p><p className="text-2xl font-bold text-gray-900">{incomingIncompleteScan}</p></div>
                    </div>
                </div>

                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">Data Cargo</h1>
                        <p className="text-gray-600 mt-1">Manajemen data manifest kargo untuk proses screening.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <div className="relative">
                            <button onClick={() => setIsSettingsOpen(!isSettingsOpen)} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2.5 rounded-lg flex items-center transition-all font-medium">
                                <Settings size={18} className="mr-2" />Kolom
                            </button>
                            {isSettingsOpen && (
                                <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-gray-100 z-50 p-4">
                                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Tampilkan Kolom</h4>
                                    <div className="space-y-2">
                                        {Object.entries(visibleColumns).map(([key, value]) => (
                                            <label key={key} className="flex items-center space-x-3 cursor-pointer hover:bg-gray-50 p-1 rounded transition-colors">
                                                <input type="checkbox" checked={value} onChange={() => setVisibleColumns(prev => ({ ...prev, [key]: !value }))} className="rounded text-blue-600 focus:ring-blue-500" />
                                                <span className="text-sm text-gray-700 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                        <button onClick={() => { resetForm(); setEditingCargo(null); setIsModalOpen(true); }} className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-all shadow-sm">
                            <Plus size={18} /><span>Add New</span>
                        </button>
                        <label className="flex items-center space-x-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium transition-all shadow-sm cursor-pointer">
                            <FileSpreadsheet size={18} /><span>Import XLS</span>
                            <input type="file" ref={fileInputRef} onChange={handleImportXLS} accept=".xls,.xlsx" className="hidden" />
                        </label>
                        <button onClick={handleSyncAPI} className="flex items-center space-x-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-medium transition-all shadow-sm">
                            <RefreshCw size={18} /><span>Synchronize API</span>
                        </button>
                        {selectedIds.length > 0 && (
                            <button onClick={handleBulkDelete} className="flex items-center space-x-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium transition-all shadow-sm animate-in fade-in slide-in-from-right-2">
                                <Trash2 size={18} /><span>Delete Selected ({selectedIds.length})</span>
                            </button>
                        )}
                    </div>
                </div>

                {/* Search and Filters */}
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-6 flex flex-col md:flex-row gap-4 items-center">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input type="text" placeholder="Search by MAWB, ULD, or HAWB..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all" />
                    </div>
                    <div className="flex items-center space-x-4">
                        <label className="flex items-center space-x-2 cursor-pointer text-sm font-medium text-gray-700 bg-gray-50 px-3 py-2 rounded-lg border border-gray-200">
                            <input type="checkbox" checked={showIncompleteOnly} onChange={(e) => { setShowIncompleteOnly(e.target.checked); setCurrentPage(1); }} className="rounded text-red-600 focus:ring-red-500 border-gray-300" />
                            <span>Show Incomplete Only</span>
                        </label>
                        <div className="text-sm text-gray-500 flex flex-col items-end">
                            <span className="font-bold">Showing {paginatedList.length} of {baseFilteredList.length} filtered items</span>
                            <span className="text-xs text-gray-400">Total data: {cargoList.length} records</span>
                        </div>
                    </div>
                </div>

                {/* Table Container */}
                <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden flex flex-col">
                    <div className="overflow-x-auto h-4 border-b border-gray-100 bg-gray-50/50" onScroll={(e) => { const t = document.getElementById('cargo-table-container'); if (t) t.scrollLeft = (e.target as HTMLDivElement).scrollLeft; }}>
                        <div style={{ width: '1500px', height: '1px' }}></div>
                    </div>
                    <div id="cargo-table-container" className="overflow-x-auto" onScroll={(e) => { const t = e.currentTarget.previousElementSibling as HTMLDivElement; if (t) t.scrollLeft = e.currentTarget.scrollLeft; }}>
                        <table className="w-full text-left border-collapse min-w-[1500px]">
                            <thead>
                                <tr className="bg-gray-50 border-b border-gray-200">
                                    <th className="px-4 py-4 w-10">
                                        <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" onChange={handleSelectAll} checked={selectedIds.length === paginatedList.length && paginatedList.length > 0} />
                                    </th>
                                    {visibleColumns.uldNo && (<th className="px-4 py-4 text-xs font-bold text-gray-600 uppercase tracking-wider relative group" style={{ width: columnWidths.uldNo }}>ULD No.<div onMouseDown={(e) => handleResize('uldNo', e)} className="absolute right-0 top-0 h-full w-1 cursor-col-resize bg-transparent group-hover:bg-blue-300 transition-colors" /></th>)}
                                    <th className="px-4 py-4 text-xs font-bold text-gray-600 uppercase tracking-wider relative group" style={{ width: columnWidths.mawb }}>MAWB<div onMouseDown={(e) => handleResize('mawb', e)} className="absolute right-0 top-0 h-full w-1 cursor-col-resize bg-transparent group-hover:bg-blue-300 transition-colors" /></th>
                                    <th className="px-4 py-4 text-xs font-bold text-gray-600 uppercase tracking-wider relative group" style={{ width: columnWidths.hawb }}>HAWB<div onMouseDown={(e) => handleResize('hawb', e)} className="absolute right-0 top-0 h-full w-1 cursor-col-resize bg-transparent group-hover:bg-blue-300 transition-colors" /></th>
                                    <th className="px-4 py-4 text-xs font-bold text-gray-600 uppercase tracking-wider relative group" style={{ width: columnWidths.totalPcs }}>Total Pcs<div onMouseDown={(e) => handleResize('totalPcs', e)} className="absolute right-0 top-0 h-full w-1 cursor-col-resize bg-transparent group-hover:bg-blue-300 transition-colors" /></th>
                                    {visibleColumns.totalWeight && (<th className="px-4 py-4 text-xs font-bold text-gray-600 uppercase tracking-wider relative group" style={{ width: columnWidths.totalWeight }}>Total Weight<div onMouseDown={(e) => handleResize('totalWeight', e)} className="absolute right-0 top-0 h-full w-1 cursor-col-resize bg-transparent group-hover:bg-blue-300 transition-colors" /></th>)}
                                    {visibleColumns.goodsDescription && (<th className="px-4 py-4 text-xs font-bold text-gray-600 uppercase tracking-wider relative group" style={{ width: columnWidths.goodsDescription }}>Description<div onMouseDown={(e) => handleResize('goodsDescription', e)} className="absolute right-0 top-0 h-full w-1 cursor-col-resize bg-transparent group-hover:bg-blue-300 transition-colors" /></th>)}
                                    {visibleColumns.actualPcs && (<th className="px-4 py-4 text-xs font-bold text-gray-600 uppercase tracking-wider relative group" style={{ width: columnWidths.actualPcs }}>Actual Pcs<div onMouseDown={(e) => handleResize('actualPcs', e)} className="absolute right-0 top-0 h-full w-1 cursor-col-resize bg-transparent group-hover:bg-blue-300 transition-colors" /></th>)}
                                    {visibleColumns.releasedPcs && (<th className="px-4 py-4 text-xs font-bold text-gray-600 uppercase tracking-wider relative group" style={{ width: columnWidths.releasedPcs }}>Released Pcs<div onMouseDown={(e) => handleResize('releasedPcs', e)} className="absolute right-0 top-0 h-full w-1 cursor-col-resize bg-transparent group-hover:bg-blue-300 transition-colors" /></th>)}
                                    {visibleColumns.rejectedPcs && (<th className="px-4 py-4 text-xs font-bold text-gray-600 uppercase tracking-wider relative group" style={{ width: columnWidths.rejectedPcs }}>Rejected Pcs<div onMouseDown={(e) => handleResize('rejectedPcs', e)} className="absolute right-0 top-0 h-full w-1 cursor-col-resize bg-transparent group-hover:bg-blue-300 transition-colors" /></th>)}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {filteredList.length === 0 ? (
                                    <tr><td colSpan={12} className="px-6 py-12 text-center text-gray-500"><div className="flex flex-col items-center"><Package size={48} className="text-gray-200 mb-2" /><p className="text-lg">No records found</p><p className="text-sm">Add new data or import from XLS to get started.</p></div></td></tr>
                                ) : (
                                    filteredList.map((cargo) => (
                                        <tr key={cargo.id} className={`hover:bg-blue-50/30 transition-colors ${selectedIds.includes(cargo.id) ? 'bg-blue-50/50' : ''}`}>
                                            <td className="px-4 py-3"><input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" checked={selectedIds.includes(cargo.id)} onChange={() => handleSelectRow(cargo.id)} /></td>
                                            {visibleColumns.uldNo && <td className="px-4 py-3 text-sm font-medium text-gray-900 truncate" style={{ maxWidth: columnWidths.uldNo }}>{cargo.uldNo || '-'}</td>}
                                            <td className="px-4 py-3 truncate" style={{ maxWidth: columnWidths.mawb }}>
                                                <Link to={`/screening/${cargo.id}`} className="text-sm font-bold text-blue-600 hover:text-blue-800 hover:underline block">{cargo.mawb}</Link>
                                                <div className="flex items-center space-x-1 mt-1.5">
                                                    <button onClick={() => handlePrint(cargo)} className="text-gray-500 hover:text-gray-800 transition-all" title="Print"><Printer size={14} /></button>
                                                    <button onClick={() => handleSendToCeisa(cargo.id)} disabled={cargo.isSentToCeisa || cargo.totalPcs < getCalculatedPcs(cargo.mawb, cargo.hawb).actual} className={`transition-all ${cargo.isSentToCeisa ? 'text-green-500' : cargo.totalPcs < getCalculatedPcs(cargo.mawb, cargo.hawb).actual ? 'text-gray-300 cursor-not-allowed' : 'text-purple-600 hover:text-purple-800'}`} title={cargo.isSentToCeisa ? 'Sent' : 'CEISA'}>{cargo.isSentToCeisa ? <Check size={14} /> : <Send size={14} />}</button>
                                                    <button onClick={() => handleEdit(cargo)} className="text-blue-500 hover:text-blue-800 transition-all" title="Edit"><Edit size={14} /></button>
                                                    <button onClick={() => handleDelete(cargo.id)} className="text-red-500 hover:text-red-800 transition-all" title="Delete"><Trash2 size={14} /></button>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-600 truncate" style={{ maxWidth: columnWidths.hawb }}>{cargo.hawb}</td>
                                            <td className="px-4 py-3 text-sm text-gray-600 font-mono truncate" style={{ maxWidth: columnWidths.totalPcs }}>{cargo.totalPcs}</td>
                                            {visibleColumns.totalWeight && <td className="px-4 py-3 text-sm text-gray-600 font-mono truncate" style={{ maxWidth: columnWidths.totalWeight }}>{cargo.totalWeight} kg</td>}
                                            {visibleColumns.goodsDescription && <td className="px-4 py-3 text-sm text-gray-600 truncate" style={{ maxWidth: columnWidths.goodsDescription }} title={cargo.goodsDescription}>{cargo.goodsDescription}</td>}
                                            {visibleColumns.actualPcs && <td className="px-4 py-3 text-sm font-bold text-blue-600 font-mono italic truncate" style={{ maxWidth: columnWidths.actualPcs }}>{getCalculatedPcs(cargo.mawb, cargo.hawb).actual}</td>}
                                            {visibleColumns.releasedPcs && <td className="px-4 py-3 text-sm font-bold text-green-600 font-mono truncate" style={{ maxWidth: columnWidths.releasedPcs }}>{getCalculatedPcs(cargo.mawb, cargo.hawb).released}</td>}
                                            {visibleColumns.rejectedPcs && <td className="px-4 py-3 text-sm font-bold text-red-600 font-mono truncate" style={{ maxWidth: columnWidths.rejectedPcs }}>{getCalculatedPcs(cargo.mawb, cargo.hawb).rejected}</td>}
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
                {recordsPerPage !== 'All' && totalPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 bg-white border border-t-0 border-gray-200 rounded-b-xl shadow-sm">
                        <div className="flex items-center text-sm text-gray-500">Page {currentPage} of {totalPages}</div>
                        <div className="flex items-center space-x-2">
                            <button onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"><ChevronLeft size={18} /></button>
                            <button onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"><ChevronRight size={18} /></button>
                        </div>
                    </div>
                )}

                {/* Add/Edit Modal */}
                {isModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
                            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
                                <h2 className="text-xl font-bold text-gray-900">{editingCargo ? 'Edit Data Cargo' : 'Add New Cargo'}</h2>
                                <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-200 transition-all"><X size={24} /></button>
                            </div>
                            <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex-1">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    <div className="space-y-1"><label className="text-sm font-semibold text-gray-700">ULD No.</label><input name="uldNo" value={formData.uldNo} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="e.g. ULD12345" /></div>
                                    <div className="space-y-1"><label className="text-sm font-semibold text-gray-700">MAWB (SMU)</label><input required name="mawb" value={formData.mawb} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-bold" placeholder="e.g. 126-12345678" /></div>
                                    <div className="space-y-1"><label className="text-sm font-semibold text-gray-700">HAWB</label><input name="hawb" value={formData.hawb} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="e.g. H12345" /></div>
                                    <div className="space-y-1"><label className="text-sm font-semibold text-gray-700">Total Pcs</label><input type="number" required name="totalPcs" value={formData.totalPcs} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" /></div>
                                    <div className="space-y-1"><label className="text-sm font-semibold text-gray-700">Total Weight (kg)</label><input type="number" step="0.01" required name="totalWeight" value={formData.totalWeight} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" /></div>
                                    <div className="space-y-1"><label className="text-sm font-semibold text-gray-700">Actual Pcs</label><input type="number" name="actualPcs" value={formData.actualPcs} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" /></div>
                                    <div className="space-y-1 lg:col-span-2"><label className="text-sm font-semibold text-gray-700">Goods Description</label><input required name="goodsDescription" value={formData.goodsDescription} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="e.g. Spare Parts" /></div>
                                </div>
                                <div className="mt-8 flex justify-end space-x-3">
                                    <button type="button" onClick={() => setIsModalOpen(false)} className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 transition-all font-medium">Cancel</button>
                                    <button type="submit" className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all font-bold shadow-md">{editingCargo ? 'Update Cargo' : 'Save Cargo'}</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </div>

            {/* Print Label Area */}
            {printingCargo && (
                <div className="hidden print:flex fixed inset-0 bg-white z-[9999] text-black font-sans items-center justify-center">
                    <div className="w-[10cm] h-[10cm] border-4 border-black p-4 flex flex-col relative bg-white">
                        <div className="text-2xl font-black text-center border-b-4 border-black pb-2 mb-2 tracking-widest">IATA CARGO LABEL</div>
                        <div className="flex justify-between font-bold text-lg mb-4"><span>AIRLINE: {printingCargo.airline || 'GA'}</span><span>{printingCargo.origin || 'CGK'}</span></div>
                        <div className="text-center mb-6 flex flex-col items-center">
                            <div className="text-sm font-bold mb-1">AIR WAYBILL NO.</div>
                            <div className="text-4xl font-black tracking-wider mb-2">{printingCargo.mawb}</div>
                            <Barcode value={printingCargo.mawb} format="CODE128" width={2} height={40} displayValue={false} margin={0} />
                        </div>
                        <div className="flex justify-between items-center text-center mb-6 border-y-2 border-black py-2">
                            <div className="flex-1 border-r-2 border-black"><div className="text-xs font-bold">DESTINATION</div><div className="text-3xl font-black">{printingCargo.destination || 'SUB'}</div></div>
                            <div className="flex-1 border-r-2 border-black"><div className="text-xs font-bold">TOTAL PCS</div><div className="text-3xl font-black">{printingCargo.totalPcs}</div></div>
                            <div className="flex-1"><div className="text-xs font-bold">WEIGHT</div><div className="text-3xl font-black">{printingCargo.totalWeight}K</div></div>
                        </div>
                        {printingCargo.hawb && (
                            <div className="mt-2 text-center flex flex-col items-center">
                                <div className="text-lg font-bold mb-1">HAWB: <span className="text-2xl">{printingCargo.hawb}</span></div>
                                <Barcode value={printingCargo.hawb} format="CODE128" width={1.5} height={30} displayValue={false} margin={0} />
                            </div>
                        )}
                        <div className="mt-auto text-[10px] text-center font-bold">Generated by System - {new Date().toLocaleString()}</div>
                    </div>
                </div>
            )}
        </>
    );
};

export default InputDataScreen;
