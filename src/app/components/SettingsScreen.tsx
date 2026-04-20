import React, { useState, useEffect } from 'react';
import { Save, Globe, Key, User, Lock, Settings } from 'lucide-react';
import { toast } from 'sonner';
import { settingsAPI } from '../../db/db';

const SettingsScreen = () => {
    const [settings, setSettings] = useState({
        manifestUrl: '', manifestApiKey: '', manifestUsername: '', manifestPassword: '',
        ceisaUrl: '', ceisaApiKey: '', ceisaUsername: '', ceisaPassword: '',
        recordsPerPage: '10',
    });

    useEffect(() => {
        settingsAPI.getAll().then(s => {
            if (Object.keys(s).length > 0) setSettings(prev => ({ ...prev, ...s }));
        }).catch(() => {
            const saved = localStorage.getItem('apiSettings');
            if (saved) { try { setSettings(JSON.parse(saved)); } catch (_) {/* */ } }
        });
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setSettings({ ...settings, [e.target.name]: e.target.value });
    };

    const handleSave = async () => {
        try {
            await settingsAPI.save(settings as unknown as Record<string, string>);
            toast.success('Settings saved successfully');
        } catch {
            localStorage.setItem('apiSettings', JSON.stringify(settings));
            toast.success('Settings saved (local fallback)');
        }
    };

    return (
        <div className="max-w-4xl mx-auto py-8 px-4">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
                <p className="text-gray-600 mt-2">Configure API connections for Manifest and CEISA systems.</p>
            </div>
            <div className="space-y-8">
                {/* Manifest API */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
                        <h2 className="text-lg font-semibold text-gray-800 flex items-center"><Globe size={20} className="mr-2 text-blue-600" />Manifest API Settings</h2>
                    </div>
                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2"><label className="text-sm font-medium text-gray-700">API URL</label><div className="relative"><Globe size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input name="manifestUrl" value={settings.manifestUrl} onChange={handleChange} placeholder="https://api.manifest.com/v1" className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" /></div></div>
                        <div className="space-y-2"><label className="text-sm font-medium text-gray-700">API Key</label><div className="relative"><Key size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input name="manifestApiKey" value={settings.manifestApiKey} onChange={handleChange} placeholder="Enter API Key" className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" /></div></div>
                        <div className="space-y-2"><label className="text-sm font-medium text-gray-700">Username</label><div className="relative"><User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input name="manifestUsername" value={settings.manifestUsername} onChange={handleChange} placeholder="Username" className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" /></div></div>
                        <div className="space-y-2"><label className="text-sm font-medium text-gray-700">Password</label><div className="relative"><Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input type="password" name="manifestPassword" value={settings.manifestPassword} onChange={handleChange} placeholder="••••••••" className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" /></div></div>
                    </div>
                </div>

                {/* CEISA API */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
                        <h2 className="text-lg font-semibold text-gray-800 flex items-center"><Globe size={20} className="mr-2 text-green-600" />CEISA API Settings</h2>
                    </div>
                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2"><label className="text-sm font-medium text-gray-700">API URL</label><div className="relative"><Globe size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input name="ceisaUrl" value={settings.ceisaUrl} onChange={handleChange} placeholder="https://api.beacukai.go.id/ceisa" className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" /></div></div>
                        <div className="space-y-2"><label className="text-sm font-medium text-gray-700">API Key</label><div className="relative"><Key size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input name="ceisaApiKey" value={settings.ceisaApiKey} onChange={handleChange} placeholder="Enter API Key" className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" /></div></div>
                        <div className="space-y-2"><label className="text-sm font-medium text-gray-700">Username</label><div className="relative"><User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input name="ceisaUsername" value={settings.ceisaUsername} onChange={handleChange} placeholder="Username" className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" /></div></div>
                        <div className="space-y-2"><label className="text-sm font-medium text-gray-700">Password</label><div className="relative"><Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input type="password" name="ceisaPassword" value={settings.ceisaPassword} onChange={handleChange} placeholder="••••••••" className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" /></div></div>
                    </div>
                </div>

                {/* General */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
                        <h2 className="text-lg font-semibold text-gray-800 flex items-center"><Settings size={20} className="mr-2 text-purple-600" />General Settings</h2>
                    </div>
                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700">Records per Page</label>
                            <select name="recordsPerPage" value={settings.recordsPerPage || '10'} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                                <option value="10">10</option><option value="20">20</option><option value="50">50</option><option value="All">All</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div className="flex justify-end pt-4">
                    <button onClick={handleSave} className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-medium transition-colors shadow-md hover:shadow-lg">
                        <Save size={20} /><span>Save Settings</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SettingsScreen;
