import { useState, useEffect } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { Package, Settings, ScanBarcode, History as LucideHistory, Shield, Users, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { settingsAPI } from '../../db/db';

const Layout: React.FC = () => {
    const { user, logout, isAdmin } = useAuth();
    const [appRole, setAppRole] = useState('Workstation');

    useEffect(() => {
        settingsAPI.getAll().then(s => {
            if (s.appRole) setAppRole(s.appRole);
        }).catch(() => {
            const saved = localStorage.getItem('apiSettings');
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    if (parsed.appRole) setAppRole(parsed.appRole);
                } catch (_) {}
            }
        });
    }, []);

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
                        {appRole !== 'Hub' && appRole !== 'Cloud' && (
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
                        )}
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
                            to="/customs"
                            className={({ isActive }) =>
                                `flex items-center space-x-3 px-4 py-3 rounded-md transition-colors ${isActive ? 'bg-blue-800' : 'hover:bg-blue-800/50'
                                }`
                            }
                        >
                            <Shield size={20} />
                            <span>Customs Dashboard</span>
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
                        {isAdmin && (
                            <NavLink
                                to="/users"
                                className={({ isActive }) =>
                                    `flex items-center space-x-3 px-4 py-3 rounded-md transition-colors ${isActive ? 'bg-blue-800' : 'hover:bg-blue-800/50'
                                    }`
                                }
                            >
                                <Users size={20} />
                                <span>Users</span>
                            </NavLink>
                        )}
                    </nav>
                </div>

                {/* User Info */}
                <div className="p-4 border-t border-blue-800 space-y-3">
                    <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-full bg-blue-700 flex items-center justify-center font-semibold text-lg uppercase">
                            {user?.name?.charAt(0) || 'U'}
                        </div>
                        <div className="flex-1 overflow-hidden">
                            <p className="font-medium text-sm truncate">{user?.name || 'User'}</p>
                            <p className="text-xs text-blue-300 truncate">{user?.warehouseName || 'General Station'}</p>
                        </div>
                    </div>
                    <button
                        onClick={logout}
                        className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-blue-800/50 hover:bg-red-600/20 hover:text-red-300 rounded-md transition-all text-sm font-medium border border-blue-700/50"
                    >
                        <LogOut size={16} />
                        <span>Sign Out</span>
                    </button>
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
