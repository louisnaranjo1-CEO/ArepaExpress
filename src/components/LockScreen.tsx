import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { verifyBiometric } from '../utils/security';
import { auth } from '../lib/firebase';
import { UN2X3_LOGO } from '../lib/env';
import { Shield, Fingerprint, Lock, ChevronRight, AlertCircle, LogOut } from 'lucide-react';

export default function LockScreen() {
    const { userData, setIsUnlocked } = useAuth();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleUnlock = async () => {
        setLoading(true);
        setError(null);
        try {
            const success = await verifyBiometric();
            if (success) {
                sessionStorage.setItem('lock_unlocked', 'true');
                setIsUnlocked(true);
            }
        } catch (err: any) {
            console.error(err);
            setError(err.message || "No se pudo verificar la identidad biométrica.");
            
            // Only logout if it's a persistent failure or if we want to enforce security
            // If the user just canceled, maybe we shouldn't logout immediately?
            // But for now, let's keep the security policy strict.
            console.error("LockScreen: Auth error or biometric fail:", err);
            if (!err.message?.includes('canceled')) {
                console.error("LockScreen: persistent error, signing out...");
                setTimeout(async () => {
                    await auth.signOut();
                    window.location.reload();
                }, 3000);
            } else {
                console.log("LockScreen: biometric canceled by user");
            }
        } finally {

            setLoading(false);
        }
    };

    // Auto-trigger on mount
    useEffect(() => {
        setTimeout(() => {
            handleUnlock();
        }, 800);
    }, []);

    return (
    <div className="fixed inset-0 z-[10000] bg-primary flex flex-col items-center justify-center p-6 animate-fade-in">
            {/* Glossy Backdrop Elements */}
            <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-white/20 rounded-full blur-[100px] animate-pulse" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-black/5 rounded-full blur-[100px] animate-pulse" />

            <div className="w-full max-w-sm flex flex-col items-center gap-8 relative z-10">
                {/* Visual Header */}
                <div className="relative group">
                    <div className="absolute inset-0 bg-white/40 rounded-full blur-2xl group-hover:blur-3xl transition-all duration-500" />
                    <div className="relative w-48 h-48 flex items-center justify-center p-6 animate-scale-in">
                        <img 
                            src={UN2X3_LOGO} 
                            alt="Arepa Express Official Logo" 
                            className="w-full h-full object-contain filter drop-shadow-xl"
                        />
                    </div>
                    <div className="absolute -bottom-2 -right-2 w-10 h-10 bg-slate-900 text-white rounded-2xl flex items-center justify-center shadow-lg animate-bounce">
                        <Lock className="w-5 h-5 text-primary" />
                    </div>
                </div>

                <div className="text-center space-y-2">
                    <h2 className="text-3xl font-black text-slate-900 tracking-tight uppercase">Seguridad</h2>
                    <p className="text-slate-800 font-bold px-4">Verifica tu identidad para continuar con tu sesión segura.</p>
                </div>

                {error && (
                    <div className="w-full bg-red-600 p-4 rounded-2xl flex items-center gap-3 text-white animate-shake shadow-lg">
                        <AlertCircle className="w-5 h-5 shrink-0" />
                        <p className="text-xs font-bold">{error}</p>
                    </div>
                )}

                <button
                    onClick={handleUnlock}
                    disabled={loading}
                    className="w-full group relative overflow-hidden bg-slate-900 text-primary p-6 rounded-[28px] font-black text-lg flex items-center justify-center gap-4 shadow-2xl active:scale-[0.98] transition-all disabled:opacity-50"
                >
                    <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-transparent to-primary/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    {loading ? (
                        <div className="w-6 h-6 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                    ) : (
                        <>
                            <Fingerprint className="w-7 h-7" />
                            <span>Desbloquear App</span>
                            <ChevronRight className="w-5 h-5 text-primary/40 group-hover:translate-x-1 transition-transform" />
                        </>
                    )}
                </button>

                <div className="flex flex-col items-center gap-4 w-full">
                    <p className="text-[10px] uppercase tracking-[0.3em] font-black text-slate-800/60">Powered by Deliexpress Biometrics</p>
                    
                    <button 
                        onClick={async () => {
                            await auth.signOut();
                            window.location.reload();
                        }}
                        className="flex items-center gap-2 text-slate-900 font-black text-xs uppercase tracking-widest hover:opacity-70 transition-opacity"
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
