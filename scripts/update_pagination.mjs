import fs from 'fs';

function applyPagination(filepath, listName, tableParentDivFinder) {
    let content = fs.readFileSync(filepath, 'utf8');

    // add imports
    if (!content.includes('ChevronLeft')) {
        content = content.replace(
            /import \{([^\}]+)\} from 'lucide-react';/,
            "import { $1, ChevronLeft, ChevronRight } from 'lucide-react';"
        );
    }

    // add states
    if (!content.includes('recordsPerPage')) {
        const states = `
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
            } catch (e) {}
        }
    }, []);
`;
        // insert after useState hooks
        content = content.replace(/(const \[[^\]]+\] = useState.*?;\n)/, "$1" + states + "\n");
    }

    // add derived
    if (!content.includes('const paginatedList =')) {
        const derived = `
    const totalPages = recordsPerPage === 'All' ? 1 : Math.ceil(${listName}.length / (recordsPerPage as unknown as number));
    const paginatedList = recordsPerPage === 'All' ? ${listName} : ${listName}.slice((currentPage - 1) * (recordsPerPage as unknown as number), currentPage * (recordsPerPage as unknown as number));
`;
        content = content.replace('return (', derived + '\n    return (');
    }

    // replace mapping
    content = content.replace(new RegExp(`\\{${listName}\\.length === 0 \\?`, 'g'), `{${listName}.length === 0 ?`); // keep condition on total
    content = content.replace(new RegExp(`${listName}\\.map\\(`, 'g'), `paginatedList.map(`);

    // add UI
    const paginationJSX = `
                {/* Pagination */}
                {recordsPerPage !== 'All' && totalPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 bg-white border-t border-slate-200">
                        <div className="flex items-center text-sm text-slate-500">
                            Page {currentPage} of {totalPages} (Total {${listName}.length} records)
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
                )}`;

    // The tricky part: injecting below the table
    // For RepositoryScreen:
    // </table>\n                </div>\n            </div>
    if (filepath.includes('RepositoryScreen')) {
        content = content.replace(/<\/table>\s*<\/div>\s*<\/div>/, '</table></div>' + paginationJSX + '</div>');
        // also reset page on filter change
        content = content.replace(/setFilteredList\(result\);\n\s*setSelectedScanIds\(\[\]\);/, 'setFilteredList(result);\n        setSelectedScanIds([]);\n        setCurrentPage(1);');
        // fix select all to use paginatedList
        content = content.replace(/setSelectedScanIds\(filteredList\.map\(h => h\.scanId\)\);/, 'setSelectedScanIds(paginatedList.map(h => h.scanId));');
        content = content.replace(/checked=\{selectedScanIds\.length === filteredList\.length && filteredList\.length > 0\}/, 'checked={selectedScanIds.length === paginatedList.length && paginatedList.length > 0}');
    }

    if (filepath.includes('CustomsDashboardScreen')) {
        content = content.replace(/<\/table>\s*<\/div>\s*<\/div>/, '</table></div>' + paginationJSX + '</div>');
        content = content.replace(/ setSearchTerm\(e\.target\.value\)/, ' { setSearchTerm(e.target.value); setCurrentPage(1); }');
        content = content.replace(/ setFilterDate\(e\.target\.value\)/, ' { setFilterDate(e.target.value); setCurrentPage(1); }');
        content = content.replace(/ setFilterDate\(''\)/, ' { setFilterDate(\'\'); setCurrentPage(1); }');
    }

    fs.writeFileSync(filepath, content, 'utf8');
}

applyPagination('src/app/components/RepositoryScreen.tsx', 'filteredList');
applyPagination('src/app/components/CustomsDashboardScreen.tsx', 'filteredScans');

// Extra: clean up navigate from ScreeningScreen.tsx
let ss = fs.readFileSync('src/app/components/ScreeningScreen.tsx', 'utf8');
ss = ss.replace(/import \{ useParams, useNavigate \} from 'react-router-dom';/, "import { useParams } from 'react-router-dom';");
ss = ss.replace(/const navigate = useNavigate\(\);\n\s*/, '');
fs.writeFileSync('src/app/components/ScreeningScreen.tsx', ss, 'utf8');

console.log('Pagination applied to both files.');
