import React, { useState } from 'react';
import { Mail, Lock, LogIn, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { userAPI } from '../../db/db';

interface LoginScreenProps {
    onLogin: (user: any) => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const data = await userAPI.login({ email, password });
            toast.success(`Welcome back, ${data.user.name}!`);
            onLogin(data.user);
        } catch (err: any) {
            toast.error(err.message || 'Invalid credentials');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
            <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
                <div className="bg-blue-900 px-6 py-10 text-center">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-800 rounded-2xl mb-4 shadow-inner">
                        <ShieldCheck size={32} className="text-white" />
                    </div>
                    <h1 className="text-2xl font-bold text-white tracking-tight">X-Ray Offline System</h1>
                    <p className="text-blue-300 text-sm mt-1">Please sign in to your account</p>
                </div>

                <form onSubmit={handleSubmit} className="p-8 space-y-6">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700 block ml-1">Email Address</label>
                        <div className="relative">
                            <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all"
                                placeholder="name@technohub.co.id"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700 block ml-1">Password</label>
                        <div className="relative">
                            <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                type="password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all"
                                placeholder="••••••••"
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className={`w-full py-3.5 px-4 rounded-xl font-bold text-white shadow-lg transition-all flex items-center justify-center space-x-2 ${loading
                                ? 'bg-blue-400 cursor-not-allowed'
                                : 'bg-blue-600 hover:bg-blue-700 active:scale-[0.98]'
                            }`}
                    >
                        {loading ? (
                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                            <>
                                <LogIn size={20} />
                                <span>Sign In</span>
                            </>
                        )}
                    </button>

                    <div className="text-center pt-2">
                        <p className="text-sm text-gray-500">
                            Technohub X-Ray Solution v2.4
                        </p>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default LoginScreen;
