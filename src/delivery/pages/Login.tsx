import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, UserPlus, Mail, Lock, User, ArrowRight, ChevronRight, Gavel } from 'lucide-react';
import { signInWithGoogle, signInWithEmail, signUpWithEmail } from '../../lib/auth-service';
import { getDriverProfile } from '../../lib/delivery-service';
import { motion, AnimatePresence } from 'framer-motion';
import { UN2X3_LOGO } from '../../lib/env';

export default function Login() {
    const [mode, setMode] = useState<'login' | 'register'>('login');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        name: ''
    });
    const navigate = useNavigate();

    const handleGoogleLogin = async () => {
        try {
            setLoading(true);
            setError('');
            await signInWithGoogle();
            navigate('/delivery');
        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Error al iniciar sesión');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            // Check if driver exists first
            const driverData = await getDriverProfile(formData.email); // Need to modify getDriverProfile to support email or do a query

            if (mode === 'login') {
                // If login, driver must exist
                if (!driverData) {
                    throw new Error("Usuario no registrado, por favor regístrese");
                }
                await signInWithEmail(formData.email, formData.password);
            } else {
                // If register, driver must NOT exist
                if (driverData) {
                    throw new Error("Usuario ya registrado, por favor inicie sesión");
                }
                if (!formData.name) throw new Error("Por favor ingresa tu nombre");
                await signUpWithEmail(formData.email, formData.password, formData.name);
            }
            navigate('/delivery');
        } catch (err: any) {
            setError(err.message || 'Error en la autenticación');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-[100dvh] bg-slate-950 flex flex-col justify-center items-center p-6 relative overflow-hidden">
            {/* Background elements */}
            <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-primary/20 rounded-full blur-[120px] animate-pulse"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-primary/10 rounded-full blur-[120px] animate-pulse delay-700"></div>

            <div className="w-full max-w-sm z-10 flex flex-col">
                <div className="flex flex-col items-center mb-10">
                    <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        onClick={() => window.location.href = 'https://deliexpress.app'}
                        className="h-40 flex flex-col items-center justify-center mb-4 cursor-pointer active:scale-95 transition-transform"
                    >
                        <img
                            src={UN2X3_LOGO}
                            alt="Logo Deliexpress"
                            className="h-full object-contain drop-shadow-2xl"
                        />
                    </motion.div>

                    <h1 className="text-2xl font-black text-white text-center mb-2 tracking-tighter leading-tight px-4">
                        ¿Llegas tan rapido como en un 2x3?
                    </h1>
                    <p className="text-slate-400 text-center text-sm font-medium px-4">
                        Toma el control de tu tiempo y gana dinero entregando con Deliexpress.
                    </p>
                </div>

                {/* Mode Toggle */}
                <div className="bg-slate-900/50 backdrop-blur-xl p-1 rounded-2xl border border-white/5 mb-8 flex relative">
                    <motion.div
                        className="absolute inset-1 bg-primary rounded-[0.85rem] shadow-lg shadow-primary/20"
                        animate={{ x: mode === 'login' ? '0%' : '100%' }}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                        style={{ width: 'calc(50% - 4px)' }}
                    />
                    <button
                        onClick={() => setMode('login')}
                        className={`flex-1 py-3 text-sm font-black z-10 transition-colors ${mode === 'login' ? 'text-slate-900' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        INICIAR SESIÓN
                    </button>
                    <button
                        onClick={() => setMode('register')}
                        className={`flex-1 py-3 text-sm font-black z-10 transition-colors ${mode === 'register' ? 'text-slate-900' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        REGISTRARSE
                    </button>
                </div>

                <AnimatePresence mode="wait">
                    <motion.form
                        key={mode}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        onSubmit={handleSubmit}
                        className="space-y-4"
                    >
                        {error && (
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-2xl text-xs text-center font-bold backdrop-blur-sm"
                            >
                                {error}
                            </motion.div>
                        )}

                        {mode === 'register' && (
                            <div className="relative group">
                                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-primary transition-colors" />
                                <input
                                    type="text"
                                    placeholder="Nombre Completo"
                                    required
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full bg-slate-900/80 border border-white/5 focus:border-primary/50 p-4 pl-12 rounded-2xl outline-none text-white font-bold transition-all text-sm block"
                                />
                            </div>
                        )}

                        <div className="relative group">
                            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-primary transition-colors" />
                            <input
                                type="email"
                                placeholder="Correo electrónico"
                                required
                                value={formData.email}
                                onChange={e => setFormData({ ...formData, email: e.target.value })}
                                className="w-full bg-slate-900/80 border border-white/5 focus:border-primary/50 p-4 pl-12 rounded-2xl outline-none text-white font-bold transition-all text-sm block"
                            />
                        </div>

                        <div className="relative group">
                            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-primary transition-colors" />
                            <input
                                type="password"
                                placeholder="Contraseña"
                                required
                                value={formData.password}
                                onChange={e => setFormData({ ...formData, password: e.target.value })}
                                className="w-full bg-slate-900/80 border border-white/5 focus:border-primary/50 p-4 pl-12 rounded-2xl outline-none text-white font-bold transition-all text-sm block"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-primary text-slate-900 py-4 rounded-2xl font-black shadow-xl shadow-primary/30 hover:bg-yellow-400 hover:-translate-y-0.5 active:scale-[0.98] transition-all flex items-center justify-center gap-2 group disabled:opacity-70"
                        >
                            {loading ? (
                                <div className="w-5 h-5 border-3 border-white/30 border-t-white rounded-full animate-spin"></div>
                            ) : (
                                <>
                                    {mode === 'login' ? 'Entrar Ahora' : 'Crear Perfil'}
                                    <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                                </>
                            )}
                        </button>
                    </motion.form>
                </AnimatePresence>

                <div className="flex items-center gap-4 my-8">
                    <div className="h-px flex-1 bg-white/5"></div>
                    <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">o continúa con</span>
                    <div className="h-px flex-1 bg-white/5"></div>
                </div>

                <button
                    onClick={handleGoogleLogin}
                    disabled={loading}
                    className="w-full bg-slate-900 border border-white/10 text-white py-4 px-6 rounded-2xl font-black text-sm hover:bg-slate-800 transition-all flex items-center justify-center gap-3 disabled:opacity-70 mb-10"
                >
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                        <path
                            fill="currentColor"
                            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                            fill="currentColor"
                            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                            fill="currentColor"
                            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                        />
                        <path
                            fill="currentColor"
                            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        />
                    </svg>
                    Google
                </button>

                <p className="text-[10px] text-slate-600 font-bold text-center max-w-[280px] leading-relaxed">
                    Al usar Deliexpress, confirmas que has leído y aceptas nuestros
                    <a href="#" className="underline text-slate-500 px-1">Términos de Servicio</a> y
                    <a href="#" className="underline text-slate-500 pl-1">Política de Privacidad</a>.
                </p>
            </div>
        </div>
    );
}
