import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Plane, MapPin, Package } from 'lucide-react';
import { toast } from 'sonner';

const InputDataScreen = () => {
    const navigate = useNavigate();

    const [formData, setFormData] = useState({
        smu: '',
        airline: '',
        flightNumber: '',
        origin: '',
        destination: '',
        quantity: '',
        weight: '',
        description: '',
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleReset = () => {
        setFormData({
            smu: '',
            airline: '',
            flightNumber: '',
            origin: '',
            destination: '',
            quantity: '',
            weight: '',
            description: '',
        });
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.smu || !formData.airline) {
            toast.error('Pastikan form terisi lengkap');
            return;
        }
        const cargoId = `CGO-${Date.now()}`;
        const newCargo = { id: cargoId, ...formData, status: 'pending', createdAt: new Date().toISOString() };
        const cargoList = JSON.parse(localStorage.getItem('cargoData') || '[]');
        cargoList.push(newCargo);
        localStorage.setItem('cargoData', JSON.stringify(cargoList));

        toast.success('Data awal berhasil disimpan');
        navigate(`/screening/${cargoId}`);
    };

    return (
        <div className="max-w-4xl mx-auto py-8">
            <div className="mb-6">
                <h1 className="text-3xl font-bold text-gray-900">Input Data Awal</h1>
                <p className="text-gray-600 mt-2">Masukkan data kargo sebelum proses screening dimulai.</p>
            </div>

            <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
                <form onSubmit={handleSubmit} className="space-y-4">

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-sm font-medium text-gray-700">Nomor SMU</label>
                            <div className="relative flex items-center">
                                <FileText className="absolute left-3 text-gray-400" size={18} />
                                <input required name="smu" value={formData.smu} onChange={handleChange} placeholder="Contoh: 126-12345678" className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500" />
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="text-sm font-medium text-gray-700">Maskapai Penerbangan</label>
                            <div className="relative flex items-center">
                                <Plane className="absolute left-3 text-gray-400" size={18} />
                                <select required name="airline" value={formData.airline} onChange={handleChange} className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 bg-white">
                                    <option value="" disabled>Pilih Maskapai</option>
                                    <option value="GA">GA - Garuda Indonesia</option>
                                    <option value="QZ">QZ - AirAsia Indonesia</option>
                                    <option value="ID">ID - Batik Air</option>
                                    <option value="SJ">SJ - Sriwijaya Air</option>
                                    <option value="JT">JT - Lion Air</option>
                                    <option value="IU">IU - Super Air Jet</option>
                                    <option value="QG">QG - Citilink</option>
                                </select>
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="text-sm font-medium text-gray-700">Nomor Penerbangan</label>
                            <input required name="flightNumber" value={formData.flightNumber} onChange={handleChange} placeholder="Contoh: GA123" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500" />
                        </div>

                        <div className="space-y-1">
                            <label className="text-sm font-medium text-gray-700">Asal (Origin)</label>
                            <div className="relative flex items-center">
                                <MapPin className="absolute left-3 text-gray-400" size={18} />
                                <input required name="origin" maxLength={3} value={formData.origin} onChange={handleChange} placeholder="Contoh: CGK" className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 uppercase" />
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="text-sm font-medium text-gray-700">Tujuan (Destination)</label>
                            <input required name="destination" maxLength={3} value={formData.destination} onChange={handleChange} placeholder="Contoh: DPS" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 uppercase" />
                        </div>

                        <div className="space-y-1">
                            <label className="text-sm font-medium text-gray-700">Jumlah Koli</label>
                            <div className="relative flex items-center">
                                <Package className="absolute left-3 text-gray-400" size={18} />
                                <input type="number" required min="1" name="quantity" value={formData.quantity} onChange={handleChange} placeholder="Contoh: 5" className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500" />
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="text-sm font-medium text-gray-700">Berat (kg)</label>
                            <input type="number" required step="0.01" name="weight" value={formData.weight} onChange={handleChange} placeholder="Contoh: 25.5" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500" />
                        </div>

                        <div className="space-y-1 md:col-span-2">
                            <label className="text-sm font-medium text-gray-700">Deskripsi Barang</label>
                            <input required name="description" value={formData.description} onChange={handleChange} placeholder="Contoh: Electronic Components" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500" />
                        </div>
                    </div>

                    <div className="pt-4 flex justify-between items-center border-t border-gray-200 mt-6">
                        <button type="button" onClick={handleReset} className="px-4 py-2 border border-gray-300 rounded-md text-gray-900 hover:bg-gray-100 transition focus:outline-none focus:ring-2 focus:ring-gray-300">
                            Reset
                        </button>
                        <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
                            Lanjut ke Screening
                        </button>
                    </div>

                </form>
            </div>
        </div>
    );
};

export default InputDataScreen;
