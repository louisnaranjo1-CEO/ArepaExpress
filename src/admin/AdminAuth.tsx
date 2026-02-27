import React, { useState } from 'react';
import { Mail, Lock, Building2, FileText, ArrowRight, Store, LogIn, UserPlus } from 'lucide-react';
import { registerRestaurant, signInAdmin } from '../lib/auth-service';
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            if (isLogin) {
                await signInAdmin(email, password);
            } else {
                await registerRestaurant(email, password, restaurantName, rif);
            }
            navigate('/'); // Redirect to dashboard
        } catch (err: any) {
            console.error("Auth error:", err);
            setError(err.message || "Ocurrió un error en la autenticación");
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
                    <div className="inline-flex items-center justify-center w-20 h-20 bg-primary rounded-[30%] shadow-2xl shadow-primary/30 mb-6 rotate-3 hover:rotate-0 transition-transform duration-500">
                        <Store className="w-10 h-10 text-white" />
                    </div>
                    <h1 className="text-4xl font-black text-slate-900 tracking-tight">DeliExpress <span className="text-primary">Admin</span></h1>
                    <p className="text-slate-500 mt-2 font-medium">
                        {isLogin ? 'Ingresa para gestionar tu restaurante' : 'Registra tu negocio y empieza a vender'}
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
                                        placeholder="Nombre del Restaurante"
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
                            className="w-full bg-primary text-white py-4 rounded-2xl font-black shadow-xl shadow-primary/30 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-70 disabled:hover:scale-100 flex items-center justify-center gap-2 group mt-6"
                        >
                            {loading ? (
                                <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                                <>
                                    <span>{isLogin ? 'Entrar al Panel' : 'Registrar Restaurante'}</span>
                                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                                </>
                            )}
                        </button>
                    </form>

                    <div className="mt-8 flex flex-col items-center gap-4">
                        <div className="w-full h-px bg-slate-100"></div>
                        <button
                            onClick={() => setIsLogin(!isLogin)}
                            className="text-slate-500 font-bold hover:text-primary transition-colors flex items-center gap-2"
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
                    Al continuar, aceptas los términos de servicio<br />y políticas de privacidad de DeliExpress.
                </p>
            </div>
        </div>
    );
}
