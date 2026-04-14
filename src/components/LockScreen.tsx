import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { verifyBiometric } from '../utils/security';
import { Shield, Fingerprint, Lock, ChevronRight, AlertCircle } from 'lucide-react';

export default function LockScreen() {
    const { userData, setIsUnlocked } = useAuth();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleUnlock = async () => {
        if (!userData?.biometricCredentialId) {
            // Failsafe: if somehow the id is missing but lock is enabled
            setIsUnlocked(true);
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const success = await verifyBiometric(userData.biometricCredentialId);
            if (success) {
                sessionStorage.setItem('lock_unlocked', 'true');
                setIsUnlocked(true);
            } else {
                setError("No se pudo verificar la identidad biométrica.");
            }
        } catch (err) {
            setError("Ocurrió un error al intentar desbloquear.");
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
        <div className="fixed inset-0 z-[10000] bg-[#FFFF00] flex flex-col items-center justify-center p-6 animate-fade-in">
            {/* Glossy Backdrop Elements */}
            <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-white/20 rounded-full blur-[100px] animate-pulse" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-black/5 rounded-full blur-[100px] animate-pulse" />

            <div className="w-full max-w-sm flex flex-col items-center gap-8 relative z-10">
                {/* Visual Header */}
                <div className="relative group">
                    <div className="absolute inset-0 bg-black/10 rounded-full blur-2xl group-hover:blur-3xl transition-all duration-500" />
                    <div className="relative w-32 h-32 bg-white rounded-[40px] shadow-2xl flex items-center justify-center p-6 animate-scale-in">
                        <img 
                            src="https://firebasestorage.googleapis.com/v0/b/arepa-express-ve-2026.firebasestorage.app/o/logos%20un%202x3.jpg?alt=media&token=8002c006-9009-4aef-8043-76bd29ef01e8" 
                            alt="Un 2x3 Logo" 
                            className="w-full h-full object-contain"
                        />
                    </div>
                    <div className="absolute -bottom-2 -right-2 w-10 h-10 bg-black text-[#FFFF00] rounded-2xl flex items-center justify-center shadow-lg animate-bounce">
                        <Lock className="w-5 h-5" />
                    </div>
                </div>

                <div className="text-center space-y-2">
                    <h2 className="text-3xl font-black text-black tracking-tight uppercase">Aplicación Bloqueada</h2>
                    <p className="text-black/60 font-bold px-4">Verifica tu identidad para continuar con tu sesión segura.</p>
                </div>

                {error && (
                    <div className="w-full bg-red-500/10 border border-red-500/20 p-4 rounded-2xl flex items-center gap-3 text-red-700 animate-shake">
                        <AlertCircle className="w-5 h-5 shrink-0" />
                        <p className="text-xs font-bold">{error}</p>
                    </div>
                )}

                <button
                    onClick={handleUnlock}
                    disabled={loading}
                    className="w-full group relative overflow-hidden bg-black text-white p-6 rounded-[28px] font-black text-lg flex items-center justify-center gap-4 shadow-2xl active:scale-[0.98] transition-all disabled:opacity-50"
                >
                    <div className="absolute inset-0 bg-gradient-to-r from-primary/20 via-transparent to-primary/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    {loading ? (
                        <div className="w-6 h-6 border-4 border-white/20 border-t-white rounded-full animate-spin" />
                    ) : (
                        <>
                            <Fingerprint className="w-7 h-7 text-[#FFFF00]" />
                            <span>Desbloquear App</span>
                            <ChevronRight className="w-5 h-5 text-white/40 group-hover:translate-x-1 transition-transform" />
                        </>
                    )}
                </button>

                <p className="text-[10px] uppercase tracking-[0.3em] font-black text-black/40">Powered by Deliexpress Biometrics</p>
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
