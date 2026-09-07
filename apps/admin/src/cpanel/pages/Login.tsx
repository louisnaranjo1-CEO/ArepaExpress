import React, { useState } from 'react';
import { Lock, LayoutDashboard, AlertCircle, ArrowRight, User } from 'lucide-react';

interface LoginProps {
    onLogin: (email: string, password: string) => Promise<boolean>;
    onGoogleLogin: () => Promise<void>;
}

export default function Login({ onLogin, onGoogleLogin }: LoginProps) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            await onLogin(email.trim(), password.trim());
        } catch (err: any) {
            setError(err.message || "Error de conexión con el servidor");
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleClick = async () => {
        setGoogleLoading(true);
        setError(null);
        try {
            await onGoogleLogin();
        } catch (err: any) {
            console.error("Error al iniciar con Google:", err);
            setError(err.message || "No se pudo iniciar sesión con Google.");
            setGoogleLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4 relative overflow-hidden font-sans">
            {/* Background Glow Elements */}
            <div className="absolute -top-40 -left-40 w-96 h-96 bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
            <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-blue-600/10 rounded-full blur-[120px] pointer-events-none" />

            <div className="max-w-md w-full animate-in fade-in slide-in-from-bottom-4 duration-500 relative z-10">
                <div className="text-center mb-8">
                    <div className="w-20 h-20 bg-primary/10 border border-primary/20 rounded-3xl flex items-center justify-center mx-auto mb-5 ring-1 ring-white/10 shadow-inner">
                        <LayoutDashboard className="w-10 h-10 text-primary" />
                    </div>
                    <h1 className="text-3xl font-black text-white tracking-tight">Super Panel</h1>
                    <p className="text-slate-400 mt-1.5 text-xs font-semibold tracking-wider uppercase">
                        Acceso Administrativo Global
                    </p>
                </div>

                <div className="bg-slate-900/80 border border-white/10 backdrop-blur-2xl rounded-[32px] p-8 shadow-2xl space-y-6">
                    {/* Botón de Google */}
                    <div>
                        <button
                            type="button"
                            onClick={handleGoogleClick}
                            disabled={googleLoading || loading}
                            className="w-full bg-white hover:bg-slate-100 text-slate-900 font-black py-4 px-4 rounded-2xl transition-all flex items-center justify-center gap-3 shadow-xl hover:shadow-white/10 active:scale-[0.98] disabled:opacity-60"
                        >
                            {googleLoading ? (
                                <div className="w-5 h-5 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
                            ) : (
                                <>
                                    <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                                        <path
                                            fill="#4285F4"
                                            d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
                                        />
                                        <path
                                            fill="#34A853"
                                            d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                                        />
                                        <path
                                            fill="#FBBC05"
                                            d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                                        />
                                        <path
                                            fill="#EA4335"
                                            d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                                        />
                                    </svg>
                                    <span className="text-sm">Iniciar Sesión con Google</span>
                                </>
                            )}
                        </button>
                        <p className="text-[10px] text-slate-400 text-center mt-2 font-medium">
                            Recomendado para administradores con cuenta Google
                        </p>
                    </div>

                    <div className="relative flex py-1 items-center">
                        <div className="flex-grow border-t border-white/10"></div>
                        <span className="flex-shrink mx-4 text-[10px] font-black uppercase tracking-widest text-slate-500">
                            O con credenciales
                        </span>
                        <div className="flex-grow border-t border-white/10"></div>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-300 mb-1.5 pl-1">
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
                                    className={`block w-full pl-11 pr-4 py-3.5 bg-slate-950/60 border rounded-2xl text-white placeholder-slate-500 focus:ring-2 focus:outline-none transition-all ${error
                                        ? 'border-red-500/50 focus:border-red-500 focus:ring-red-500/20'
                                        : 'border-white/10 focus:border-primary focus:ring-primary/20'
                                        }`}
                                    placeholder="admin@ejemplo.com"
                                    required
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-300 mb-1.5 pl-1">
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
                                    className={`block w-full pl-11 pr-4 py-3.5 bg-slate-950/60 border rounded-2xl text-white placeholder-slate-500 focus:ring-2 focus:outline-none transition-all ${error
                                        ? 'border-red-500/50 focus:border-red-500 focus:ring-red-500/20'
                                        : 'border-white/10 focus:border-primary focus:ring-primary/20'
                                        }`}
                                    placeholder="••••••••••••••"
                                    required
                                />
                            </div>
                        </div>

                        {error && (
                            <div className="p-3.5 bg-red-500/10 border border-red-500/20 text-red-400 rounded-2xl text-xs flex items-center gap-2 font-medium">
                                <AlertCircle className="w-4 h-4 shrink-0" />
                                <span>{error}</span>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading || googleLoading}
                            className={`w-full bg-primary hover:bg-yellow-400 text-slate-950 font-black py-4 px-4 rounded-2xl transition-all flex items-center justify-center gap-2 group hover:shadow-lg hover:shadow-primary/25 active:scale-[0.98] ${loading ? 'opacity-70 cursor-wait' : ''}`}
                        >
                            {loading ? 'Verificando...' : 'Ingresar al Sistema'}
                            {!loading && <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
