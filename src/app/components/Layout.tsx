import { Outlet, NavLink } from 'react-router-dom';
import { Package, Settings, ScanBarcode, History as LucideHistory } from 'lucide-react';

const Layout = () => {
    return (
        <div className="flex h-screen w-full overflow-hidden">
            {/* Sidebar */}
            <aside className="w-64 bg-blue-900 text-white flex flex-col justify-between">
                <div>
                    <div className="p-6">
                        <h1 className="text-xl font-bold tracking-tight">Cargo Screening</h1>
                    </div>
                    <nav className="space-y-1 px-4">
                        <NavLink
                            to="/"
                            className={({ isActive }) =>
                                `flex items-center space-x-3 px-4 py-3 rounded-md transition-colors ${isActive ? 'bg-blue-800' : 'hover:bg-blue-800/50'
                                }`
                            }
                        >
                            <Package size={20} />
                            <span>Data Cargo</span>
                        </NavLink>
                        <NavLink
                            to="/screening"
                            className={({ isActive }) =>
                                `flex items-center space-x-3 px-4 py-3 rounded-md transition-colors ${isActive ? 'bg-blue-800' : 'hover:bg-blue-800/50'
                                }`
                            }
                        >
                            <ScanBarcode size={20} />
                            <span>Screening</span>
                        </NavLink>
                        <NavLink
                            to="/repository"
                            className={({ isActive }) =>
                                `flex items-center space-x-3 px-4 py-3 rounded-md transition-colors ${isActive ? 'bg-blue-800' : 'hover:bg-blue-800/50'
                                }`
                            }
                        >
                            <LucideHistory size={20} />
                            <span>Scan History</span>
                        </NavLink>
                        <NavLink
                            to="/settings"
                            className={({ isActive }) =>
                                `flex items-center space-x-3 px-4 py-3 rounded-md transition-colors ${isActive ? 'bg-blue-800' : 'hover:bg-blue-800/50'
                                }`
                            }
                        >
                            <Settings size={20} />
                            <span>Settings</span>
                        </NavLink>
                    </nav>
                </div>

                {/* User Info */}
                <div className="p-4 border-t border-blue-800">
                    <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-full bg-blue-700 flex items-center justify-center font-semibold text-lg">
                            UD
                        </div>
                        <div>
                            <p className="font-medium text-sm">User Demo</p>
                            <p className="text-xs text-blue-300">CGK Station</p>
                        </div>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-auto bg-gray-50 flex justify-center">
                <div className="w-full max-w-6xl">
                    <Outlet />
                </div>
            </main>
        </div>
    );
};

export default Layout;
