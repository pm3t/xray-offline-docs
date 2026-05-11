import React, { useState, useEffect } from 'react';
import { Save, Globe, Key, User, Lock, Settings, Server, Camera, Network, Info } from 'lucide-react';
import { toast } from 'sonner';
import { settingsAPI } from '../../db/db';

type Tab = 'general' | 'camera' | 'network' | 'api';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'general',  label: 'Umum',           icon: <Settings size={16} /> },
    { id: 'camera',   label: 'Kamera & Scanner', icon: <Camera size={16} /> },
    { id: 'network',  label: 'Jaringan',        icon: <Network size={16} /> },
    { id: 'api',      label: 'API Eksternal',   icon: <Globe size={16} /> },
];

const Field = ({
    label, name, value, onChange, placeholder = '', type = 'text', icon, hint
}: {
    label: string; name: string; value: string; onChange: React.ChangeEventHandler<HTMLInputElement | HTMLSelectElement>;
    placeholder?: string; type?: string; icon?: React.ReactNode; hint?: string;
}) => (
    <div className="space-y-1.5">
        <label className="text-sm font-medium text-gray-700">{label}</label>
        <div className="relative">
            {icon && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">{icon}</span>}
            <input
                name={name} value={value} onChange={onChange} placeholder={placeholder} type={type}
                className={`w-full ${icon ? 'pl-10' : 'pl-3'} pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white text-sm transition`}
            />
        </div>
        {hint && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
);

const SelectField = ({
    label, name, value, onChange, children, hint
}: {
    label: string; name: string; value: string; onChange: React.ChangeEventHandler<HTMLInputElement | HTMLSelectElement>;
    children: React.ReactNode; hint?: string;
}) => (
    <div className="space-y-1.5">
        <label className="text-sm font-medium text-gray-700">{label}</label>
        <select name={name} value={value} onChange={onChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white text-sm transition">
            {children}
        </select>
        {hint && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
);

const SectionCard = ({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) => (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="bg-gray-50 px-5 py-3.5 border-b border-gray-200 flex items-center gap-2">
            <span className="text-blue-600">{icon}</span>
            <h2 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">{title}</h2>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
            {children}
        </div>
    </div>
);

const InfoBox = ({ children }: { children: React.ReactNode }) => (
    <div className="flex gap-2 p-3 rounded-lg bg-blue-50 border border-blue-100 text-xs text-blue-700 md:col-span-2">
        <Info size={14} className="shrink-0 mt-0.5" />
        <p>{children}</p>
    </div>
);

const SettingsScreen = () => {
    const [activeTab, setActiveTab] = useState<Tab>('general');
    const [settings, setSettings] = useState({
        manifestUrl: '', manifestApiKey: '', manifestUsername: '', manifestPassword: '',
        ceisaUrl: '', ceisaApiKey: '', ceisaUsername: '', ceisaPassword: '',
        recordsPerPage: '10', aiMethod: 'OpenCV',
        fixedCameraIntegration: 'TCP_FTP', tcpPort: '1337', ftpPort: '2121',
        appRole: 'Workstation', workstationId: '', hubUrl: '', pgConnectionString: '', cloudUrl: ''
    });

    useEffect(() => {
        settingsAPI.getAll().then(s => {
            if (Object.keys(s).length > 0) setSettings(prev => ({ ...prev, ...s }));
        }).catch(() => {
            const saved = localStorage.getItem('apiSettings');
            if (saved) { try { setSettings(JSON.parse(saved)); } catch (_) {/* */} }
        });
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setSettings({ ...settings, [e.target.name]: e.target.value });
    };

    const handleSave = async () => {
        try {
            await settingsAPI.save(settings as unknown as Record<string, string>);
            toast.success('Pengaturan berhasil disimpan', {
                description: 'Restart server agar perubahan port TCP/FTP berlaku.'
            });
        } catch {
            localStorage.setItem('apiSettings', JSON.stringify(settings));
            toast.success('Pengaturan disimpan (local fallback)');
        }
    };

    return (
        <div className="max-w-4xl mx-auto py-8 px-4">
            {/* Header */}
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900">Pengaturan Sistem</h1>
                <p className="text-sm text-gray-500 mt-1">Konfigurasi aplikasi, integrasi kamera, dan koneksi API.</p>
            </div>

            {/* Tab Bar */}
            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6 w-fit">
                {TABS.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap
                            ${activeTab === tab.id
                                ? 'bg-white text-blue-700 shadow-sm ring-1 ring-gray-200'
                                : 'text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        {tab.icon}
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <div className="space-y-6">

                {/* === TAB: UMUM === */}
                {activeTab === 'general' && (
                    <SectionCard title="Pengaturan Umum" icon={<Settings size={16} />}>
                        <SelectField label="Jumlah Data per Halaman" name="recordsPerPage"
                            value={settings.recordsPerPage || '10'} onChange={handleChange}>
                            <option value="10">10</option>
                            <option value="20">20</option>
                            <option value="50">50</option>
                            <option value="All">Semua</option>
                        </SelectField>
                        <SelectField label="Metode Analisis Koli (AI)" name="aiMethod"
                            value={settings.aiMethod || 'OpenCV'} onChange={handleChange}
                            hint="Pilih metode deteksi bounding box saat screening.">
                            <option value="OpenCV">OpenCV (Server-side Python)</option>
                            <option value="MediaPipe">MediaPipe EfficientDet (Browser)</option>
                            <option value="Manual">Manual (Drag & Crop Interaktif)</option>
                        </SelectField>
                    </SectionCard>
                )}

                {/* === TAB: KAMERA & SCANNER === */}
                {activeTab === 'camera' && (
                    <SectionCard title="Kamera & Scanner" icon={<Camera size={16} />}>
                        <SelectField label="Mode Integrasi Kamera Pindai" name="fixedCameraIntegration"
                            value={settings.fixedCameraIntegration || 'TCP_FTP'} onChange={handleChange}
                            hint="Pilih cara kamera pindai fisik mengirim data AWB ke aplikasi.">
                            <option value="TCP_FTP">TCP & FTP (Kamera Fixed, Hardware)</option>
                            <option value="JSON_API">JSON via SSE API (HTTP POST)</option>
                            <option value="NONE">Tidak Ada (Handheld Scanner Manual)</option>
                        </SelectField>

                        {settings.fixedCameraIntegration === 'TCP_FTP' && (
                            <div className="md:col-span-2 border-t border-gray-100 pt-4">
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
                                    Konfigurasi Port Server (TCP &amp; FTP)
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                    <Field label="Port TCP (Data Teks / AWB)" name="tcpPort"
                                        value={settings.tcpPort || '1337'} onChange={handleChange}
                                        placeholder="1337" type="number"
                                        hint="Port untuk menerima teks AWB dari kamera. Default: 1337"
                                        icon={<Network size={14} />}
                                    />
                                    <Field label="Port FTP (Upload Foto Kargo)" name="ftpPort"
                                        value={settings.ftpPort || '2121'} onChange={handleChange}
                                        placeholder="2121" type="number"
                                        hint="Port untuk menerima file foto dari kamera. Default: 2121"
                                        icon={<Network size={14} />}
                                    />
                                    <InfoBox>
                                        Perubahan nomor port memerlukan <strong>restart server</strong> (<code>node server.mjs</code>) agar berlaku.
                                        Format nama file foto dari kamera harus: <code>MAWB_HAWB_TIMESTAMP.jpg</code>
                                    </InfoBox>
                                </div>
                            </div>
                        )}
                    </SectionCard>
                )}

                {/* === TAB: JARINGAN === */}
                {activeTab === 'network' && (
                    <SectionCard title="Arsitektur Jaringan" icon={<Server size={16} />}>
                        <SelectField label="Peran Aplikasi (App Role)" name="appRole"
                            value={settings.appRole || 'Workstation'} onChange={handleChange}
                            hint="Tentukan fungsi utama mesin ini dalam jaringan.">
                            <option value="Workstation">Workstation (Edge Node – Input Data)</option>
                            <option value="Hub">Central Hub (Konsolidasi Laporan LAN)</option>
                            <option value="Cloud">Cloud (SaaS Terpusat)</option>
                        </SelectField>

                        {(!settings.appRole || settings.appRole === 'Workstation') && (
                            <>
                                <Field label="Workstation ID" name="workstationId"
                                    value={settings.workstationId || ''} onChange={handleChange}
                                    placeholder="WS-01" hint="Identitas unik mesin ini di jaringan."
                                    icon={<Server size={14} />}
                                />
                                <div className="md:col-span-2">
                                    <Field label="URL Central Hub" name="hubUrl"
                                        value={settings.hubUrl || ''} onChange={handleChange}
                                        placeholder="http://192.168.1.100:3000"
                                        hint="Alamat server Hub tempat data ini akan disinkronkan."
                                        icon={<Globe size={14} />}
                                    />
                                </div>
                            </>
                        )}

                        {settings.appRole === 'Hub' && (
                            <>
                                <div className="md:col-span-2">
                                    <Field label="Cloud API URL (Opsional)" name="cloudUrl"
                                        value={settings.cloudUrl || ''} onChange={handleChange}
                                        placeholder="https://api.cloud-xray.com"
                                        icon={<Globe size={14} />}
                                    />
                                </div>
                                <div className="md:col-span-2">
                                    <Field label="PostgreSQL Connection String" name="pgConnectionString"
                                        value={settings.pgConnectionString || ''} onChange={handleChange}
                                        placeholder="postgresql://user:pass@localhost:5432/xray_db"
                                        icon={<Server size={14} />}
                                    />
                                </div>
                            </>
                        )}

                        {settings.appRole === 'Cloud' && (
                            <div className="md:col-span-2">
                                <Field label="PostgreSQL Connection String" name="pgConnectionString"
                                    value={settings.pgConnectionString || ''} onChange={handleChange}
                                    placeholder="postgresql://user:pass@localhost:5432/xray_db"
                                    icon={<Server size={14} />}
                                />
                            </div>
                        )}
                    </SectionCard>
                )}

                {/* === TAB: API EKSTERNAL === */}
                {activeTab === 'api' && (
                    <>
                        <SectionCard title="Manifest API" icon={<Globe size={16} />}>
                            <Field label="API URL" name="manifestUrl" value={settings.manifestUrl}
                                onChange={handleChange} placeholder="https://api.manifest.com/v1"
                                icon={<Globe size={14} />} />
                            <Field label="API Key" name="manifestApiKey" value={settings.manifestApiKey}
                                onChange={handleChange} placeholder="Masukkan API Key"
                                icon={<Key size={14} />} />
                            <Field label="Username" name="manifestUsername" value={settings.manifestUsername}
                                onChange={handleChange} placeholder="Username"
                                icon={<User size={14} />} />
                            <Field label="Password" name="manifestPassword" value={settings.manifestPassword}
                                onChange={handleChange} placeholder="••••••••" type="password"
                                icon={<Lock size={14} />} />
                        </SectionCard>

                        <SectionCard title="CEISA API" icon={<Globe size={16} />}>
                            <Field label="API URL" name="ceisaUrl" value={settings.ceisaUrl}
                                onChange={handleChange} placeholder="https://api.beacukai.go.id/ceisa"
                                icon={<Globe size={14} />} />
                            <Field label="API Key" name="ceisaApiKey" value={settings.ceisaApiKey}
                                onChange={handleChange} placeholder="Masukkan API Key"
                                icon={<Key size={14} />} />
                            <Field label="Username" name="ceisaUsername" value={settings.ceisaUsername}
                                onChange={handleChange} placeholder="Username"
                                icon={<User size={14} />} />
                            <Field label="Password" name="ceisaPassword" value={settings.ceisaPassword}
                                onChange={handleChange} placeholder="••••••••" type="password"
                                icon={<Lock size={14} />} />
                        </SectionCard>
                    </>
                )}

                {/* Save Button */}
                <div className="flex justify-end pt-2">
                    <button onClick={handleSave}
                        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white px-6 py-2.5 rounded-lg font-medium transition-all shadow-md hover:shadow-lg text-sm">
                        <Save size={16} />
                        Simpan Pengaturan
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SettingsScreen;
