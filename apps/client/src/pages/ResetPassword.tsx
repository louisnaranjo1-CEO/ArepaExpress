import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, CheckCircle, AlertCircle, ArrowRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { updateUserPassword } from '../lib/auth-service';
import toast from 'react-hot-toast';

export default function ResetPassword() {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [hasSession, setHasSession] = useState<boolean | null>(null);
    const navigate = useNavigate();

    useEffect(() => {
        // Supabase establishes a session automatically from the URL token (#access_token=...)
        const checkSession = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                setHasSession(true);
            } else {
                // Listen to auth state change if the token is still parsing
                const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
                    if (event === 'PASSWORD_RECOVERY' || !!session) {
                        setHasSession(true);
                    }
                });
                // Fallback timeout
                setTimeout(() => {
                    setHasSession((prev) => (prev === null ? false : prev));
                }, 3000);
                return () => listener.subscription.unsubscribe();
            }
        };
        checkSession();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (password.length < 6) {
            setError('La contraseña debe tener al menos 6 caracteres.');
            return;
        }

        if (password !== confirmPassword) {
            setError('Las contraseñas no coinciden.');
            return;
        }

        setLoading(true);
        try {
            await updateUserPassword(password);
            setSuccess(true);
            toast.success('¡Contraseña actualizada con éxito!');
            setTimeout(() => {
                navigate('/');
            }, 2500);
        } catch (err: any) {
            console.error('Password reset error:', err);
            setError(err.message || 'Error al actualizar la contraseña.');
        } finally {
            setLoading(false);
        }
    };

    if (hasSession === null) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
                <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    if (hasSession === false) {
        return (
            <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4 text-red-600">
                    <AlertCircle className="w-8 h-8" />
                </div>
                <h2 className="text-xl font-black text-slate-900 mb-2">Enlace expirado o inválido</h2>
                <p className="text-sm text-slate-500 max-w-xs mb-6">
                    Este enlace de recuperación ya fue utilizado o ha caducado. Por favor solicita uno nuevo desde la pantalla de inicio de sesión.
                </p>
                <button
                    onClick={() => navigate('/profile')}
                    className="bg-primary text-slate-900 font-bold px-6 py-3 rounded-2xl shadow-lg shadow-primary/30"
                >
                    Volver al Inicio
                </button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
            <div className="w-full max-w-sm bg-white rounded-[32px] p-8 shadow-2xl shadow-slate-200/50 border border-slate-100">
                <div className="text-center mb-6">
                    <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-3">
                        <Lock className="w-7 h-7 text-slate-900" />
                    </div>
                    <h2 className="text-2xl font-black text-slate-900">Nueva Contraseña</h2>
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">
                        Protege tu cuenta en un 2x3 🔐
                    </p>
                </div>

                {success ? (
                    <div className="text-center py-6 animate-in fade-in">
                        <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                            <CheckCircle className="w-8 h-8" />
                        </div>
                        <h3 className="text-lg font-black text-slate-900 mb-2">¡Todo listo!</h3>
                        <p className="text-sm text-slate-500 mb-4">
                            Tu contraseña se ha restablecido. Redirigiéndote a la app...
                        </p>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {error && (
                            <div className="p-3 bg-red-50 text-red-600 rounded-xl text-xs font-bold flex items-center gap-2">
                                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                <span>{error}</span>
                            </div>
                        )}

                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                                Nueva Contraseña
                            </label>
                            <input
                                type="password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Mínimo 6 caracteres"
                                className="w-full bg-slate-50 border-2 border-slate-100 focus:border-primary px-4 py-3 rounded-2xl outline-none font-bold text-slate-700 transition-all text-sm"
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                                Confirmar Contraseña
                            </label>
                            <input
                                type="password"
                                required
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="Repite tu contraseña"
                                className="w-full bg-slate-50 border-2 border-slate-100 focus:border-primary px-4 py-3 rounded-2xl outline-none font-bold text-slate-700 transition-all text-sm"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-primary text-slate-900 py-4 rounded-2xl font-bold shadow-lg shadow-primary/30 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-70 mt-4 flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <div className="w-5 h-5 border-2 border-slate-900 border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                                <>
                                    <span>Guardar Contraseña</span>
                                    <ArrowRight className="w-4 h-4" />
                                </>
                            )}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}
