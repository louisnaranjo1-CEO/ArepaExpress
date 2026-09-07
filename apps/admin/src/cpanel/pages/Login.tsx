import React, { useState } from 'react';
import { Lock, LayoutDashboard, AlertCircle, ArrowRight, User } from 'lucide-react';

interface LoginProps {
    onLogin: (email: string, password: string) => Promise<boolean>;
}

export default function Login({ onLogin }: LoginProps) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);

    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            await onLogin(email.trim(), password.trim());
        } catch (err: any) {
            setError(err.message || "Error de conexión con el servidor");
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center p-4">
            <div className="max-w-md w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="text-center mb-10">
                    <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center mx-auto mb-6 ring-1 ring-white/10">
                        <LayoutDashboard className="w-10 h-10 text-primary" />
                    </div>
                    <h1 className="text-3xl font-black text-white tracking-tight">Super Panel</h1>
                    <p className="text-slate-400 mt-2 font-medium">Acceso Administrativo Global</p>
                </div>

                <div className="bg-white/5 border border-white/10 backdrop-blur-xl rounded-[2rem] p-8 shadow-2xl">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <label className="block text-sm font-bold text-slate-300 mb-2 pl-1">
                                Correo del Administrador
                            </label>
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <User className={`w-5 h-5 transition-colors ${error ? 'text-red-400' : 'text-slate-500 group-focus-within:text-primary'}`} />
                                </div>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className={`block w-full pl-11 pr-4 py-4 bg-slate-900/50 border rounded-2xl text-white placeholder-slate-500 focus:ring-2 focus:outline-none transition-all ${error
                                        ? 'border-red-500/50 focus:border-red-500 focus:ring-red-500/20'
                                        : 'border-white/10 focus:border-primary focus:ring-primary/20'
                                        }`}
                                    placeholder="admin@ejemplo.com"
                                    required
                                    autoFocus
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-slate-300 mb-2 pl-1">
                                Código de Acceso
                            </label>
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <Lock className={`w-5 h-5 transition-colors ${error ? 'text-red-400' : 'text-slate-500 group-focus-within:text-primary'}`} />
                                </div>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className={`block w-full pl-11 pr-4 py-4 bg-slate-900/50 border rounded-2xl text-white placeholder-slate-500 focus:ring-2 focus:outline-none transition-all ${error
                                        ? 'border-red-500/50 focus:border-red-500 focus:ring-red-500/20'
                                        : 'border-white/10 focus:border-primary focus:ring-primary/20'
                                        }`}
                                    placeholder="••••••••••••••"
                                    required
                                    autoFocus
                                />
                            </div>
                            {error && (
                                <p className="mt-3 text-sm text-red-400 flex items-center gap-1.5 font-medium animate-in slide-in-from-top-1">
                                    <AlertCircle className="w-4 h-4" />
                                    {error}
                                </p>
                            )}
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className={`w-full bg-primary hover:bg-primary text-slate-900 font-bold py-4 px-4 rounded-2xl transition-all flex items-center justify-center gap-2 group hover:shadow-lg hover:shadow-primary/25 active:scale-[0.98] ${loading ? 'opacity-70 cursor-wait' : ''}`}
                        >
                            {loading ? 'Verificando...' : 'Ingresar al Sistema'}
                            {!loading && <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />}
                        </button>
                    </form>
                </div>
            </div >
        </div >
    );
}
