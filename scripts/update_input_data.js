const fs = require('fs');
const filepath = 'src/app/components/InputDataScreen.tsx';
let content = fs.readFileSync(filepath, 'utf8');

// 1. imports
content = content.replace(
    /import \{ useParams, useNavigate \} from 'react-router-dom';/,
    "import { useParams, useNavigate, Link } from 'react-router-dom';"
);
if (!content.includes('react-router-dom')) {
    content = content.replace(
        "import * as XLSX from 'xlsx';",
        "import * as XLSX from 'xlsx';\nimport { Link } from 'react-router-dom';"
    );
}
content = content.replace(
    /import \{\n    Package, Edit, Trash2, Plus, X, FileSpreadsheet,\n    Search, Send, RefreshCw, Settings, Check, Printer\n\} from 'lucide-react';/,
    "import { Package, Edit, Trash2, Plus, X, FileSpreadsheet, Search, Send, RefreshCw, Settings, Check, Printer, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';"
);

// 2. Interface CargoData
content = content.replace(/\s*remarks: string;\n\s*actualTime: string;\n\s*statusComplete: 'Yes' \| 'No';\n/, '\n');

// 3. States & initial defaults
content = content.replace(/\s*remarks: 200,\n\s*actualTime: 180,\n\s*statusComplete: 120,/, '');
content = content.replace(/\s*remarks: true,\n\s*actualTime: true,\n\s*statusComplete: true,/, '');
content = content.replace(/\s*remarks: '',\n\s*actualTime: new Date\(\)\.toISOString\(\)\.slice\(0, 19\)\.replace\('T', ' '\),\n\s*statusComplete: 'No',/g, '');

// Pagination states
const paginationStates = `
    const [currentPage, setCurrentPage] = useState(1);
    const [recordsPerPage, setRecordsPerPage] = useState<number | 'All'>('10');
    const [showIncompleteOnly, setShowIncompleteOnly] = useState(false);

    useEffect(() => {
        const savedSettings = localStorage.getItem('apiSettings');
        if (savedSettings) {
            try {
                const parsed = JSON.parse(savedSettings);
                if (parsed.recordsPerPage) {
                    setRecordsPerPage(parsed.recordsPerPage === 'All' ? 'All' : Number(parsed.recordsPerPage));
                }
            } catch (e) {}
        }
    }, []);
`;
content = content.replace(/const \[searchTerm, setSearchTerm\] = useState\(''\);/, "const [searchTerm, setSearchTerm] = useState('');" + paginationStates);

// 4. Excel Import
const excelImportMatch = `                remarks: row['Remarks'] || '',
                actualTime: row['Actual Time'] || new Date().toLocaleString(),
                statusComplete: (row['Status Complete'] || row['Status Completed'] || '').toString().toLowerCase() === 'yes' ? 'Yes' : 'No',`;
content = content.replace(excelImportMatch, ``);

// 5. Form Modal UI for removed fields
const formModalRemoved1 = `<div className="space-y-1">
                                        <label className="text-sm font-semibold text-gray-700">Status Complete</label>
                                        <select name="statusComplete" value={formData.statusComplete} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                                            <option value="No">No</option>
                                            <option value="Yes">Yes</option>
                                        </select>
                                    </div>
                                    <div className="space-y-1 lg:col-span-2">
                                        <label className="text-sm font-semibold text-gray-700">Remarks</label>
                                        <input name="remarks" value={formData.remarks} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Optional remarks" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-sm font-semibold text-gray-700">Actual Time</label>
                                        <input step="1" name="actualTime" value={formData.actualTime} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="YYYY-MM-DD HH:MM:SS" />
                                    </div>`;
content = content.replace(formModalRemoved1, ``);

// 6. TH headers
const ths = `{visibleColumns.remarks && (
                                        <th className="px-4 py-4 text-xs font-bold text-gray-600 uppercase tracking-wider relative group" style={{ width: columnWidths.remarks }}>
                                            Remarks
                                            <div onMouseDown={(e) => handleResize('remarks', e)} className="absolute right-0 top-0 h-full w-1 cursor-col-resize bg-transparent group-hover:bg-blue-300 transition-colors" />
                                        </th>
                                    )}
                                    {visibleColumns.actualTime && (
                                        <th className="px-4 py-4 text-xs font-bold text-gray-600 uppercase tracking-wider relative group" style={{ width: columnWidths.actualTime }}>
                                            Actual Time
                                            <div onMouseDown={(e) => handleResize('actualTime', e)} className="absolute right-0 top-0 h-full w-1 cursor-col-resize bg-transparent group-hover:bg-blue-300 transition-colors" />
                                        </th>
                                    )}
                                    {visibleColumns.statusComplete && (
                                        <th className="px-4 py-4 text-xs font-bold text-gray-600 uppercase tracking-wider relative group" style={{ width: columnWidths.statusComplete }}>
                                            Complete
                                            <div onMouseDown={(e) => handleResize('statusComplete', e)} className="absolute right-0 top-0 h-full w-1 cursor-col-resize bg-transparent group-hover:bg-blue-300 transition-colors" />
                                        </th>
                                    )}`;
content = content.replace(ths, ``);
content = content.replace(`<th className="px-4 py-4 text-xs font-bold text-gray-600 uppercase tracking-wider text-right">Actions</th>`, '');

// 7. TD columns
const tds = `{visibleColumns.remarks && <td className="px-4 py-3 text-sm text-gray-600 italic truncate" style={{ maxWidth: columnWidths.remarks }}>{cargo.remarks || '-'}</td>}
                                            {visibleColumns.actualTime && <td className="px-4 py-3 text-sm text-gray-500 truncate" style={{ maxWidth: columnWidths.actualTime }}>{cargo.actualTime}</td>}
                                            {visibleColumns.statusComplete && (
                                                <td className="px-4 py-3 truncate" style={{ maxWidth: columnWidths.statusComplete }}>
                                                    <span className={\`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold \${cargo.statusComplete === 'Yes' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}\`}>
                                                        {cargo.statusComplete}
                                                    </span>
                                                </td>
                                            )}
                                            <td className="px-4 py-3 text-right space-x-2">
                                                <button onClick={() => handlePrint(cargo)} className="p-1.5 text-gray-600 hover:bg-gray-100 rounded-md transition-all" title="Print IATA Label">
                                                    <Printer size={16} />
                                                </button>
                                                <button
                                                    onClick={() => handleSendToCeisa(cargo.id)}
                                                    disabled={cargo.isSentToCeisa || cargo.totalPcs < getCalculatedPcs(cargo.mawb, cargo.hawb).actual}
                                                    className={\`p-1.5 rounded-md transition-all \${cargo.isSentToCeisa ? 'text-green-500 bg-green-50' : cargo.totalPcs < getCalculatedPcs(cargo.mawb, cargo.hawb).actual ? 'text-gray-300 cursor-not-allowed' : 'text-purple-600 hover:bg-purple-100'}\`}
                                                    title={cargo.isSentToCeisa ? "Data Sudah Dikirim" : "Send To Ceisa"}
                                                >
                                                    {cargo.isSentToCeisa ? <Check size={16} /> : <Send size={16} />}
                                                </button>
                                                <button onClick={() => handleEdit(cargo)} className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-md transition-all" title="Edit">
                                                    <Edit size={16} />
                                                </button>
                                                <button onClick={() => handleDelete(cargo.id)} className="p-1.5 text-red-600 hover:bg-red-100 rounded-md transition-all" title="Delete">
                                                    <Trash2 size={16} />
                                                </button>
                                            </td>`;
content = content.replace(tds, ``);

// 8. MAWB modifications
const mawbTdOld = `<td className="px-4 py-3 text-sm font-bold text-blue-600 truncate" style={{ maxWidth: columnWidths.mawb }}>{cargo.mawb}</td>`;
const mawbTdNew = `<td className="px-4 py-3 truncate" style={{ maxWidth: columnWidths.mawb }}>
                                                <Link to={\`/screening/\${cargo.id}\`} className="text-sm font-bold text-blue-600 hover:text-blue-800 hover:underline">{cargo.mawb}</Link>
                                                <div className="flex items-center space-x-1 mt-1">
                                                    <button onClick={() => handlePrint(cargo)} className="p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-all" title="Print IATA Label">
                                                        <Printer size={14} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleSendToCeisa(cargo.id)}
                                                        disabled={cargo.isSentToCeisa || cargo.totalPcs < getCalculatedPcs(cargo.mawb, cargo.hawb).actual}
                                                        className={\`p-1 rounded transition-all \${cargo.isSentToCeisa ? 'text-green-500 hover:bg-green-50' : cargo.totalPcs < getCalculatedPcs(cargo.mawb, cargo.hawb).actual ? 'text-gray-300 cursor-not-allowed' : 'text-purple-600 hover:bg-purple-100'}\`}
                                                        title={cargo.isSentToCeisa ? "Data Sudah Dikirim" : "Send To Ceisa"}
                                                    >
                                                        {cargo.isSentToCeisa ? <Check size={14} /> : <Send size={14} />}
                                                    </button>
                                                    <button onClick={() => handleEdit(cargo)} className="p-1 text-blue-500 hover:text-blue-700 hover:bg-blue-100 rounded transition-all" title="Edit">
                                                        <Edit size={14} />
                                                    </button>
                                                    <button onClick={() => handleDelete(cargo.id)} className="p-1 text-red-500 hover:text-red-700 hover:bg-red-100 rounded transition-all" title="Delete">
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </td>`;
content = content.replace(mawbTdOld, mawbTdNew);

// 9. Dashboard Counters
const totalMawbRegex = /const totalMAWB = new Set\(cargoList\.map\(c => c\.mawb\)\)\.size;/;
content = content.replace(totalMawbRegex, `
    const totalMAWB = new Set(cargoList.map(c => c.mawb)).size;
    const incomingIncompleteScan = cargoList.filter(c => c.totalPcs > getCalculatedPcs(c.mawb, c.hawb).actual).length;
`);

const countersOld = `<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4 mb-8">
                    <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex items-center space-x-4">
                        <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
                            <FileSpreadsheet size={24} />
                        </div>
                        <div>
                            <p className="text-sm text-gray-500 font-medium">Total MAWB</p>
                            <p className="text-2xl font-bold text-gray-900">{totalMAWB}</p>
                        </div>
                    </div>
                    <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex items-center space-x-4">
                        <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg">
                            <FileSpreadsheet size={24} />
                        </div>
                        <div>
                            <p className="text-sm text-gray-500 font-medium">Total HAWB</p>
                            <p className="text-2xl font-bold text-gray-900">{totalHAWB}</p>
                        </div>
                    </div>
                </div>`;

const countersNew = `<div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-3 gap-4 mb-8">
                    <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex items-center space-x-4">
                        <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
                            <FileSpreadsheet size={24} />
                        </div>
                        <div>
                            <p className="text-sm text-gray-500 font-medium">Total MAWB</p>
                            <p className="text-2xl font-bold text-gray-900">{totalMAWB}</p>
                        </div>
                    </div>
                    <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex items-center space-x-4">
                        <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg">
                            <FileSpreadsheet size={24} />
                        </div>
                        <div>
                            <p className="text-sm text-gray-500 font-medium">Total HAWB</p>
                            <p className="text-2xl font-bold text-gray-900">{totalHAWB}</p>
                        </div>
                    </div>
                    <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex items-center space-x-4">
                        <div className="p-3 bg-red-50 text-red-600 rounded-lg">
                            <AlertCircle size={24} />
                        </div>
                        <div>
                            <p className="text-sm text-gray-500 font-medium">Incomplete Scan</p>
                            <p className="text-2xl font-bold text-gray-900">{incomingIncompleteScan}</p>
                        </div>
                    </div>
                </div>`;
content = content.replace(countersOld, countersNew);

// 10. Filter Checkbox
const searchFilterOld = `<div className="text-sm text-gray-500">
                        Showing {filteredList.length} of {cargoList.length} records
                    </div>`;
const searchFilterNew = `<div className="flex items-center space-x-4">
                        <label className="flex items-center space-x-2 cursor-pointer text-sm font-medium text-gray-700 bg-gray-50 px-3 py-2 rounded-lg border border-gray-200">
                            <input 
                                type="checkbox" 
                                checked={showIncompleteOnly} 
                                onChange={(e) => { setShowIncompleteOnly(e.target.checked); setCurrentPage(1); }} 
                                className="rounded text-red-600 focus:ring-red-500 border-gray-300" 
                            />
                            <span>Show Incomplete Only</span>
                        </label>
                        <div className="text-sm text-gray-500">
                            Showing {paginatedList.length} (Total: {baseFilteredList.length})
                        </div>
                     </div>`;
content = content.replace(searchFilterOld, searchFilterNew);

// 11. Pagination mapping
const filteredListRegex = /const filteredList = cargoList\.filter\(c =>\s*c\.mawb\.toLowerCase\(\)\.includes\(searchTerm\.toLowerCase\(\)\) \|\|\s*c\.uldNo\.toLowerCase\(\)\.includes\(searchTerm\.toLowerCase\(\)\) \|\|\s*c\.hawb\.toLowerCase\(\)\.includes\(searchTerm\.toLowerCase\(\)\)\s*\);/;

const paginatedListLogic = `const baseFilteredList = cargoList.filter(c => {
        const matchesSearch = c.mawb.toLowerCase().includes(searchTerm.toLowerCase()) || c.uldNo.toLowerCase().includes(searchTerm.toLowerCase()) || c.hawb.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesIncomplete = showIncompleteOnly ? c.totalPcs > getCalculatedPcs(c.mawb, c.hawb).actual : true;
        return matchesSearch && matchesIncomplete;
    });

    const totalPages = recordsPerPage === 'All' ? 1 : Math.ceil(baseFilteredList.length / (recordsPerPage as number));
    const paginatedList = recordsPerPage === 'All' ? baseFilteredList : baseFilteredList.slice((currentPage - 1) * (recordsPerPage as number), currentPage * (recordsPerPage as number));

    // Fix select all behavior for paginated
    const filteredList = paginatedList;`;

content = content.replace(filteredListRegex, paginatedListLogic);

// 12. Pagination JSX
const paginationJSX = `
                {/* Pagination */}
                {recordsPerPage !== 'All' && totalPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 bg-white border border-t-0 border-gray-200 rounded-b-xl shadow-sm">
                        <div className="flex items-center text-sm text-gray-500">
                            Page {currentPage} of {totalPages}
                        </div>
                        <div className="flex items-center space-x-2">
                            <button 
                                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                disabled={currentPage === 1}
                                className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                <ChevronLeft size={18} />
                            </button>
                            <button 
                                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                disabled={currentPage === totalPages}
                                className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                <ChevronRight size={18} />
                            </button>
                        </div>
                    </div>
                )}
`;

content = content.replace(/>\s*\{\/\* Add\/Edit Modal \*\/\}/, ">" + paginationJSX + "\n\n                {/* Add/Edit Modal */}");

// Quick fix mapping missing mockApiData params
content = content.replace(/remarks: 'API Shared',\n\s*actualTime: new Date\(\)\.toLocaleString\(\),\n\s*statusComplete: 'No',/, '');


fs.writeFileSync(filepath, content, 'utf8');
console.log('Done modifying InputDataScreen.tsx');
