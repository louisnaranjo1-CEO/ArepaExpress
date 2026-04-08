import React, { useState } from 'react';
import { Mail, Lock, Building2, FileText, ArrowRight, Store, LogIn, UserPlus, Hotel } from 'lucide-react';
import { registerRestaurant, signInAdmin, signInAdminWithGoogle } from '../lib/auth-service';
import { useNavigate } from 'react-router-dom';

export default function AdminAuth() {
    const [isLogin, setIsLogin] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const navigate = useNavigate();

    // Form fields
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [restaurantName, setRestaurantName] = useState('');
    const [rif, setRif] = useState('');
    const [businessType, setBusinessType] = useState<'restaurant' | 'hotel'>('restaurant');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            if (isLogin) {
                await signInAdmin(email, password);
            } else {
                await registerRestaurant(email, password, restaurantName, rif, businessType);
            }
            navigate('/stations');
        } catch (err: any) {
            console.error("Auth error:", err);
            setError(err.message || "Ocurrió un error en la autenticación");
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleAuth = async () => {
        setLoading(true);
        setError(null);
        try {
            await signInAdminWithGoogle();
            navigate('/stations');
        } catch (err: any) {
            console.error("Google auth error:", err);
            setError(err.message || "Error al conectar con Google");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 relative overflow-hidden">
            {/* Background elements */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none -z-10">
                <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-3xl animate-pulse"></div>
                <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-orange-400/10 rounded-full blur-3xl animate-pulse delay-700"></div>
            </div>

            <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-8 duration-700">
                <div className="text-center mb-8">
                    <div 
                        onClick={() => window.location.href = 'https://deliexpress.app'}
                        className="flex items-center justify-center h-24 mb-6 hover:rotate-2 transition-transform duration-500 cursor-pointer active:scale-95"
                    >
                        <img 
                            src="https://firebasestorage.googleapis.com/v0/b/arepa-express-ve-2026.firebasestorage.app/o/logo.png?alt=media&token=8acf92ec-b853-4f37-bd82-a4f651bbdcd9" 
                            alt="Deliexpress Logo" 
                            className="h-full object-contain"
                        />
                    </div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight">Administra tu cuenta <span className="text-primary">en un 2x3</span></h1>
                    <p className="text-slate-500 mt-2 font-medium">
                        {isLogin ? 'Ingresa para gestionar tu negocio' : 'Registra tu negocio y empieza a vender'}
                    </p>
                </div>

                <div className="bg-white rounded-[40px] p-8 shadow-2xl shadow-slate-200/60 border border-slate-100">
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {!isLogin && (
                            <div className="space-y-4 animate-in fade-in zoom-in-95 duration-300">
                                <div className="relative">
                                    <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                                    <input
                                        type="text"
                                        placeholder={businessType === 'restaurant' ? "Nombre del Restaurante" : "Nombre del Hotel / Posada"}
                                        value={restaurantName}
                                        onChange={(e) => setRestaurantName(e.target.value)}
                                        required
                                        className="w-full bg-slate-50 border-2 border-transparent focus:border-primary focus:bg-white p-4 pl-12 rounded-2xl outline-none transition-all font-bold text-slate-700"
                                    />
                                </div>
                                <div className="relative">
                                    <FileText className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                                    <input
                                        type="text"
                                        placeholder="RIF (Ej: J-12345678-9)"
                                        value={rif}
                                        onChange={(e) => setRif(e.target.value)}
                                        required
                                        className="w-full bg-slate-50 border-2 border-transparent focus:border-primary focus:bg-white p-4 pl-12 rounded-2xl outline-none transition-all font-bold text-slate-700"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-3 p-1.5 bg-slate-50 rounded-2xl border border-slate-100/50">
                                    <button
                                        type="button"
                                        onClick={() => setBusinessType('restaurant')}
                                        className={`flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all ${
                                            businessType === 'restaurant' 
                                            ? 'bg-white text-primary shadow-sm ring-1 ring-slate-200' 
                                            : 'text-slate-400 hover:text-slate-600'
                                        }`}
                                    >
                                        <Store className="w-4 h-4" />
                                        <span>Restaurante</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setBusinessType('hotel')}
                                        className={`flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all ${
                                            businessType === 'hotel' 
                                            ? 'bg-white text-primary shadow-sm ring-1 ring-slate-200' 
                                            : 'text-slate-400 hover:text-slate-600'
                                        }`}
                                    >
                                        <Hotel className="w-4 h-4" />
                                        <span>Hotel/Posada</span>
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className="relative">
                            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                            <input
                                type="email"
                                placeholder="Correo Institucional"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                className="w-full bg-slate-50 border-2 border-transparent focus:border-primary focus:bg-white p-4 pl-12 rounded-2xl outline-none transition-all font-bold text-slate-700"
                            />
                        </div>

                        <div className="relative">
                            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                            <input
                                type="password"
                                placeholder="Contraseña"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                className="w-full bg-slate-50 border-2 border-transparent focus:border-primary focus:bg-white p-4 pl-12 rounded-2xl outline-none transition-all font-bold text-slate-700"
                            />
                        </div>

                        {error && (
                            <div className="p-4 bg-red-50 text-red-600 rounded-2xl text-sm font-bold animate-in shake-in duration-300">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-primary text-slate-900 py-4 rounded-2xl font-black shadow-xl shadow-primary/30 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-70 disabled:hover:scale-100 flex items-center justify-center gap-2 group mt-6"
                        >
                            {loading ? (
                                <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                                <>
                                    <span>{isLogin ? 'Entrar al Panel' : (businessType === 'restaurant' ? 'Registrar Restaurante' : 'Registrar Hotel')}</span>
                                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                                </>
                            )}
                        </button>
                    </form>

                    <div className="mt-8 flex flex-col items-center gap-4">
                        <div className="relative w-full flex items-center justify-center">
                            <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-slate-100"></div>
                            </div>
                            <span className="relative px-4 bg-white text-slate-400 text-xs font-bold uppercase tracking-widest">O continúa con</span>
                        </div>

                        <button
                            onClick={handleGoogleAuth}
                            disabled={loading}
                            className="w-full bg-white border-2 border-slate-100 text-slate-600 py-4 rounded-2xl font-black flex items-center justify-center gap-3 hover:bg-slate-50 transition-all active:scale-[0.98] disabled:opacity-50"
                        >
                            <svg className="w-5 h-5" viewBox="0 0 24 24">
                                <path
                                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                                    fill="#4285F4"
                                />
                                <path
                                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-1.01.69-2.3 1.1-3.71 1.1-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                                    fill="#34A853"
                                />
                                <path
                                    d="M5.84 14.14c-.22-.66-.35-1.36-.35-2.14s.13-1.48.35-2.14V7.02H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.98l3.66-2.84z"
                                    fill="#FBBC05"
                                />
                                <path
                                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.02l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                                    fill="#EA4335"
                                />
                            </svg>
                            <span>Google</span>
                        </button>

                        <div className="w-full h-px bg-slate-100 hidden"></div>
                        <button
                            onClick={() => setIsLogin(!isLogin)}
                            className="text-slate-500 font-bold hover:text-slate-900 transition-colors flex items-center gap-2"
                        >
                            {isLogin ? (
                                <>
                                    <UserPlus className="w-5 h-5" />
                                    <span>¿No tienes cuenta? Regístrate</span>
                                </>
                            ) : (
                                <>
                                    <LogIn className="w-5 h-5" />
                                    <span>Ya tengo cuenta, iniciar sesión</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>

                <p className="text-center text-slate-400 text-xs mt-8 font-medium uppercase tracking-widest leading-relaxed">
                    Al continuar, aceptas los términos de servicio<br />y políticas de privacidad de Un 2x3.
                </p>
            </div>
        </div>
    );
}
