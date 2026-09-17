import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { verifyBiometric } from '../utils/security';
import { supabase } from '../lib/supabase';
import { logout } from '../lib/auth-service';
import { UN2X3_LOGO } from '../lib/env';
import { Fingerprint, Lock, ChevronRight, AlertCircle, LogOut, KeyRound, Eye, EyeOff } from 'lucide-react';

export default function LockScreen() {
    const { user, userData, setIsUnlocked } = useAuth();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showPasswordFallback, setShowPasswordFallback] = useState(false);
    const [passwordInput, setPasswordInput] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [verifyingPassword, setVerifyingPassword] = useState(false);

    const handleUnlock = async () => {
        setLoading(true);
        setError(null);
        try {
            const credId = userData?.biometricCredentialId || userData?.biometric_credential_id;
            const success = await verifyBiometric(credId);
            if (success) {
                sessionStorage.setItem('deliexpress_is_unlocked', 'true');
                setIsUnlocked(true);
            }
        } catch (err: any) {
            console.error("LockScreen: verification error", err);
            const msg = err.message || "No se pudo verificar la identidad biométrica.";
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    const handlePasswordUnlock = async (e: React.FormEvent) => {
        e.preventDefault();
        const email = user?.email || userData?.email;
        if (!email || !passwordInput) {
            setError('Por favor ingresa tu contraseña.');
            return;
        }

        setVerifyingPassword(true);
        setError(null);
        try {
            const { error: signInErr } = await supabase.auth.signInWithPassword({
                email,
                password: passwordInput,
            });

            if (signInErr) {
                setError('Contraseña incorrecta. Por favor intenta de nuevo.');
            } else {
                sessionStorage.setItem('deliexpress_is_unlocked', 'true');
                setIsUnlocked(true);
            }
        } catch (err: any) {
            setError(err.message || 'Error al verificar contraseña.');
        } finally {
            setVerifyingPassword(false);
        }
    };

    const handleSignOut = async () => {
        try {
            sessionStorage.removeItem('deliexpress_is_unlocked');
            await logout();
            setIsUnlocked(true);
            window.location.reload();
        } catch (err) {
            console.error('Error signing out from lock screen:', err);
            window.location.reload();
        }
    };

    // Auto-prompt on mount if user hasn't switched to password mode
    useEffect(() => {
        const timer = setTimeout(() => {
            handleUnlock();
        }, 500);
        return () => clearTimeout(timer);
    }, []);

    return (
        <div className="fixed inset-0 z-[10000] bg-primary flex flex-col items-center justify-center p-6 animate-fade-in select-none">
            {/* Glossy Backdrop Elements */}
            <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-white/20 rounded-full blur-[100px] animate-pulse pointer-events-none" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-black/5 rounded-full blur-[100px] animate-pulse pointer-events-none" />

            <div className="w-full max-w-sm flex flex-col items-center gap-6 relative z-10">
                {/* Visual Header */}
                <div className="relative group">
                    <div className="absolute inset-0 bg-white/40 rounded-full blur-2xl group-hover:blur-3xl transition-all duration-500" />
                    <div className="relative w-36 h-36 flex items-center justify-center p-4 animate-scale-in">
                        <img 
                            src={UN2X3_LOGO} 
                            alt="Arepa Express Official Logo" 
                            className="w-full h-full object-contain filter drop-shadow-xl"
                        />
                    </div>
                    <div className="absolute -bottom-1 -right-1 w-9 h-9 bg-slate-900 text-white rounded-xl flex items-center justify-center shadow-lg animate-bounce">
                        <Lock className="w-4 h-4 text-primary" />
                    </div>
                </div>

                <div className="text-center space-y-1">
                    <h2 className="text-2xl font-black text-slate-900 tracking-tight uppercase">App Bloqueada</h2>
                    <p className="text-slate-800 font-bold text-xs px-4">
                        {showPasswordFallback 
                            ? 'Ingresa la contraseña de tu cuenta para desbloquear' 
                            : 'Verifica tu identidad con Face ID, huella o biometría para continuar.'}
                    </p>
                </div>

                {error && (
                    <div className="w-full bg-red-600 p-3.5 rounded-2xl flex items-center gap-2.5 text-white animate-shake shadow-lg">
                        <AlertCircle className="w-5 h-5 shrink-0" />
                        <p className="text-xs font-bold leading-tight">{error}</p>
                    </div>
                )}

                {!showPasswordFallback ? (
                    <div className="w-full space-y-3">
                        <button
                            type="button"
                            onClick={handleUnlock}
                            disabled={loading}
                            className="w-full group relative overflow-hidden bg-slate-900 text-primary p-5 rounded-[24px] font-black text-base flex items-center justify-center gap-3 shadow-2xl active:scale-[0.98] transition-all disabled:opacity-50"
                        >
                            <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-transparent to-primary/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                            {loading ? (
                                <div className="w-6 h-6 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                            ) : (
                                <>
                                    <Fingerprint className="w-6 h-6" />
                                    <span>Desbloquear con Biometría</span>
                                    <ChevronRight className="w-5 h-5 text-primary/40 group-hover:translate-x-1 transition-transform" />
                                </>
                            )}
                        </button>

                        <button
                            type="button"
                            onClick={() => {
                                setError(null);
                                setShowPasswordFallback(true);
                            }}
                            className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-slate-900 bg-white/60 hover:bg-white flex items-center justify-center gap-2 transition-colors"
                        >
                            <KeyRound className="w-3.5 h-3.5" />
                            <span>Desbloquear con Contraseña</span>
                        </button>
                    </div>
                ) : (
                    <form onSubmit={handlePasswordUnlock} className="w-full space-y-3">
                        <div className="relative">
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={passwordInput}
                                onChange={(e) => setPasswordInput(e.target.value)}
                                placeholder="Tu contraseña..."
                                autoFocus
                                className="w-full px-4 py-3.5 bg-white text-slate-900 rounded-2xl border border-slate-300 font-semibold text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 pr-12 shadow-sm"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-800"
                            >
                                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>

                        <button
                            type="submit"
                            disabled={verifyingPassword || !passwordInput}
                            className="w-full bg-slate-900 text-primary py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-lg active:scale-98 transition-all disabled:opacity-50"
                        >
                            {verifyingPassword ? (
                                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                            ) : (
                                <>
                                    <KeyRound className="w-4 h-4" />
                                    <span>Verificar Contraseña</span>
                                </>
                            )}
                        </button>

                        <button
                            type="button"
                            onClick={() => {
                                setError(null);
                                setShowPasswordFallback(false);
                            }}
                            className="w-full py-2 text-xs font-bold text-slate-900 hover:underline text-center"
                        >
                            ← Volver a Biometría
                        </button>
                    </form>
                )}

                <div className="flex flex-col items-center gap-3 w-full pt-2">
                    <p className="text-[10px] uppercase tracking-[0.25em] font-black text-slate-800/60">
                        Deliexpress Biometric Security
                    </p>
                    
                    <button 
                        type="button"
                        onClick={handleSignOut}
                        className="flex items-center gap-1.5 text-slate-900 font-black text-xs uppercase tracking-widest hover:opacity-70 transition-opacity"
                    >
                        <LogOut className="w-3.5 h-3.5" />
                        Cerrar Sesión
                    </button>
                </div>
            </div>

            <style>{`
                @keyframes shake {
                    0%, 100% { transform: translateX(0); }
                    25% { transform: translateX(-5px); }
                    75% { transform: translateX(5px); }
                }
                .animate-shake {
                    animation: shake 0.5s cubic-bezier(.36,.07,.19,.97) both;
                }
            `}</style>
        </div>
    );
}
