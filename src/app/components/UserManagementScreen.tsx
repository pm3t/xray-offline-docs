import React, { useState, useEffect } from 'react';
import { UserPlus, Edit2, Trash2, Mail, Building2, User as UserIcon, Shield, Search } from 'lucide-react';
import { toast } from 'sonner';
import { userAPI } from '../../db/db';

const UserManagementScreen = () => {
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<any>(null);

    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        warehouseName: ''
    });

    const fetchUsers = async () => {
        try {
            const data = await userAPI.getAll();
            setUsers(data);
        } catch (err) {
            toast.error('Failed to fetch users');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const handleOpenModal = (user: any = null) => {
        if (user) {
            setEditingUser(user);
            setFormData({
                name: user.name,
                email: user.email,
                password: '', // Don't show password
                warehouseName: user.warehouseName || ''
            });
        } else {
            setEditingUser(null);
            setFormData({ name: '', email: '', password: '', warehouseName: '' });
        }
        setIsModalOpen(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingUser) {
                await userAPI.update(editingUser.id, formData);
                toast.success('User updated successfully');
            } else {
                if (!formData.password) {
                    toast.error('Password is required for new users');
                    return;
                }
                await userAPI.add(formData);
                toast.success('User added successfully');
            }
            setIsModalOpen(false);
            fetchUsers();
        } catch (err: any) {
            toast.error(err.message || 'Operation failed');
        }
    };

    const handleDelete = async (id: string, email: string) => {
        if (email === 'admin@technohub.co.id') {
            toast.error('Cannot delete the default admin account');
            return;
        }
        if (window.confirm('Are you sure you want to delete this user?')) {
            try {
                await userAPI.delete(id);
                toast.success('User deleted');
                fetchUsers();
            } catch (err) {
                toast.error('Delete failed');
            }
        }
    };

    const filteredUsers = users.filter(u =>
        u.name.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase()) ||
        u.warehouseName?.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="py-8 px-4 max-w-6xl mx-auto">
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">User Administration</h1>
                    <p className="text-gray-600 mt-1">Manage system users, access levels and warehouse assignments.</p>
                </div>
                <button
                    onClick={() => handleOpenModal()}
                    className="flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-semibold transition-all shadow-md hover:shadow-lg active:scale-95"
                >
                    <UserPlus size={20} />
                    <span>Add New User</span>
                </button>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-4 border-b border-gray-50 flex items-center bg-gray-50/30">
                    <div className="relative flex-1 max-w-md">
                        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search by name, email, or warehouse..."
                            className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm transition-all"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-gray-50/50 text-gray-500 text-xs font-semibold uppercase tracking-wider">
                                <th className="px-6 py-4">User Details</th>
                                <th className="px-6 py-4">Warehouse</th>
                                <th className="px-6 py-4">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {loading ? (
                                <tr>
                                    <td colSpan={3} className="px-6 py-10 text-center text-gray-400">Loading users...</td>
                                </tr>
                            ) : filteredUsers.length === 0 ? (
                                <tr>
                                    <td colSpan={3} className="px-6 py-10 text-center text-gray-400">No users found.</td>
                                </tr>
                            ) : filteredUsers.map((user) => (
                                <tr key={user.id} className="hover:bg-blue-50/30 transition-colors">
                                    <td className="px-6 py-4 text-sm">
                                        <div className="flex items-center space-x-3">
                                            <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                                                {user.name.charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                                <p className="font-semibold text-gray-900">{user.name}</p>
                                                <p className="text-gray-500 text-xs">{user.email}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-sm font-medium text-gray-700">
                                        <div className="flex items-center space-x-1.5">
                                            <Building2 size={14} className="text-gray-400" />
                                            <span>{user.warehouseName || '-'}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-sm">
                                        <div className="flex items-center space-x-2">
                                            <button
                                                onClick={() => handleOpenModal(user)}
                                                className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                                title="Edit User"
                                            >
                                                <Edit2 size={18} />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(user.id, user.email)}
                                                className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                                disabled={user.email === 'admin@technohub.co.id'}
                                                title="Delete User"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="bg-blue-900 px-6 py-4 text-white flex justify-between items-center">
                            <h2 className="text-lg font-bold flex items-center">
                                {editingUser ? <Shield size={20} className="mr-2" /> : <UserPlus size={20} className="mr-2" />}
                                {editingUser ? 'Edit User' : 'Add New User'}
                            </h2>
                            <button onClick={() => setIsModalOpen(false)} className="text-blue-200 hover:text-white transition-colors">×</button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-gray-500 uppercase ml-1">Full Name</label>
                                <div className="relative">
                                    <UserIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        required
                                        className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                        placeholder="Enter name"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-gray-500 uppercase ml-1">Email Address</label>
                                <div className="relative">
                                    <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        required
                                        type="email"
                                        className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                        placeholder="name@technohub.co.id"
                                        value={formData.email}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-gray-500 uppercase ml-1">Warehouse Name</label>
                                <div className="relative">
                                    <Building2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                        placeholder="e.g. Warehouse Alpha"
                                        value={formData.warehouseName}
                                        onChange={(e) => setFormData({ ...formData, warehouseName: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-gray-500 uppercase ml-1">
                                    {editingUser ? 'New Password (Optional)' : 'Password'}
                                </label>
                                <div className="relative">
                                    <Shield size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        required={!editingUser}
                                        type="password"
                                        className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                        placeholder={editingUser ? 'Leave blank to keep same' : '••••••••'}
                                        value={formData.password}
                                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="flex gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="flex-1 py-2.5 border border-gray-200 text-gray-600 rounded-xl font-semibold hover:bg-gray-50 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-bold shadow-md hover:bg-blue-700 transition-all hover:shadow-lg active:scale-95"
                                >
                                    {editingUser ? 'Save Changes' : 'Create User'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default UserManagementScreen;
