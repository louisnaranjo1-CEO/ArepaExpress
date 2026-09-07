import React, { useState } from 'react';
import { Shield, ShieldAlert, KeyRound, Smartphone, Laptop, CheckCircle2, AlertCircle, ArrowRight, LogOut, Mail, Send } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { getDeviceMetadata, verifyMasterSecurityPin, authorizeCurrentDevice } from '../../lib/adminSecurity';

interface DeviceChallengeModalProps {
    user: any;
    onAuthorized: () => void;
    onLogout: () => void;
}

export default function DeviceChallengeModal({ user, onAuthorized, onLogout }: DeviceChallengeModalProps) {
    const [pin, setPin] = useState('');
    const [customDeviceName, setCustomDeviceName] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [sendingEmail, setSendingEmail] = useState(false);
    const [emailSent, setEmailSent] = useState(false);

    const meta = getDeviceMetadata();

    const handleAuthorize = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!pin.trim()) {
            setError("Por favor ingresa tu código de seguridad.");
            return;
        }

        setLoading(true);
        setError(null);

        try {
            // Validar PIN Maestro
            const isValidPin = await verifyMasterSecurityPin(user.id, pin.trim());

            if (!isValidPin) {
                // Intentar validar si es un token OTP de correo enviado por Supabase
                try {
                    const { error: otpError } = await supabase.auth.verifyOtp({
                        email: user.email,
                        token: pin.trim(),
                        type: 'email'
                    });
                    if (otpError) throw new Error("Código de seguridad incorrecto.");
                } catch (errOtp) {
                    throw new Error("Código de seguridad incorrecto. Revisa tu PIN Maestro o el código enviado a tu correo.");
                }
            }

            // Registrar este dispositivo en Supabase
            const authorized = await authorizeCurrentDevice(user.id, customDeviceName || meta.name);
            if (!authorized) {
                throw new Error("No se pudo guardar la autorización del dispositivo en la base de datos.");
            }

            setSuccess(true);
            setTimeout(() => {
                onAuthorized();
            }, 1000);
        } catch (err: any) {
            console.error("Error en autorización:", err);
            setError(err.message || "Error al verificar el código.");
        } finally {
            setLoading(false);
        }
    };

    const handleSendEmailOtp = async () => {
        setSendingEmail(true);
        setError(null);
        try {
            const { error: otpSendErr } = await supabase.auth.signInWithOtp({
                email: user.email,
                options: {
                    shouldCreateUser: false
                }
            });

            if (otpSendErr) throw otpSendErr;
            setEmailSent(true);
        } catch (err: any) {
            console.error("Error enviando OTP por correo:", err);
            setError("No se pudo enviar el código por correo. Puedes usar tu PIN Maestro directo (202600).");
        } finally {
            setSendingEmail(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden font-sans">
            {/* Background Glows */}
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

            <div className="max-w-md w-full bg-slate-900/90 border border-white/10 backdrop-blur-2xl rounded-[32px] p-8 shadow-2xl relative z-10 animate-in fade-in zoom-in-95 duration-300">
                {/* Header */}
                <div className="text-center mb-6">
                    <div className="w-20 h-20 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-inner">
                        <ShieldAlert className="w-10 h-10 animate-pulse" />
                    </div>
                    <h2 className="text-2xl font-black text-white tracking-tight">Dispositivo Nuevo</h2>
                    <p className="text-xs text-slate-400 mt-1 font-medium">
                        Se requiere autorización para ingresar al Super Panel
                    </p>
                </div>

                {/* Device Card */}
                <div className="bg-slate-800/60 border border-white/5 rounded-2xl p-4 mb-6 flex items-center gap-3">
                    <div className="p-3 bg-white/5 rounded-xl text-primary">
                        <Laptop className="w-6 h-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Equipo Detectado</p>
                        <p className="text-sm font-bold text-white truncate">{meta.name}</p>
                        <p className="text-[11px] text-slate-500 truncate">{user.email}</p>
                    </div>
                </div>

                {error && (
                    <div className="mb-4 p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-2xl text-xs font-semibold flex items-center gap-2.5">
                        <AlertCircle className="w-5 h-5 shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                {emailSent && (
                    <div className="mb-4 p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-2xl text-xs font-semibold flex items-center gap-2.5">
                        <CheckCircle2 className="w-5 h-5 shrink-0" />
                        <span>¡Código enviado! Revisa tu bandeja de entrada en <strong>{user.email}</strong>.</span>
                    </div>
                )}

                <form onSubmit={handleAuthorize} className="space-y-4">
                    <div>
                        <label className="block text-[11px] font-black uppercase tracking-wider text-slate-300 mb-1.5 pl-1">
                            Código Maestro de Seguridad
                        </label>
                        <div className="relative">
                            <input
                                type="password"
                                required
                                value={pin}
                                onChange={(e) => setPin(e.target.value)}
                                placeholder="Introduce tu código"
                                className="w-full bg-slate-950/80 border border-white/10 rounded-2xl px-4 py-3.5 text-center text-xl tracking-[0.3em] font-black text-white placeholder:text-slate-600 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                                autoFocus
                            />
                            <KeyRound className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 pointer-events-none" />
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1 pl-1">
                            PIN maestro inicial: <strong className="text-primary">202600</strong> (puedes cambiarlo dentro del panel).
                        </p>
                    </div>

                    <div>
                        <label className="block text-[11px] font-black uppercase tracking-wider text-slate-400 mb-1.5 pl-1">
                            Nombre para este equipo (Opcional)
                        </label>
                        <input
                            type="text"
                            value={customDeviceName}
                            onChange={(e) => setCustomDeviceName(e.target.value)}
                            placeholder={`Ej. Mi Laptop Personal`}
                            className="w-full bg-slate-950/50 border border-white/10 rounded-2xl px-4 py-3 text-xs font-medium text-white placeholder:text-slate-600 focus:outline-none focus:border-primary transition-all"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading || success}
                        className="w-full bg-primary hover:bg-yellow-400 text-slate-950 font-black py-4 rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20 active:scale-[0.98] disabled:opacity-50 mt-2"
                    >
                        {loading ? (
                            <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                        ) : success ? (
                            <>
                                <CheckCircle2 className="w-5 h-5 text-slate-950" />
                                <span>¡Dispositivo Autorizado!</span>
                            </>
                        ) : (
                            <>
                                <span>Autorizar y Entrar al Panel</span>
                                <ArrowRight className="w-4 h-4" />
                            </>
                        )}
                    </button>
                </form>

                <div className="mt-6 pt-6 border-t border-white/5 flex flex-col gap-2">
                    <button
                        type="button"
                        onClick={handleSendEmailOtp}
                        disabled={sendingEmail || emailSent}
                        className="w-full py-2.5 text-xs font-bold text-slate-400 hover:text-white transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        <Mail className="w-4 h-4" />
                        {sendingEmail ? "Enviando código..." : "Enviar código de verificación a mi correo"}
                    </button>

                    <button
                        type="button"
                        onClick={onLogout}
                        className="w-full py-2.5 text-xs font-bold text-slate-500 hover:text-red-400 transition-colors flex items-center justify-center gap-2"
                    >
                        <LogOut className="w-4 h-4" />
                        Cerrar Sesión
                    </button>
                </div>
            </div>
        </div>
    );
}
