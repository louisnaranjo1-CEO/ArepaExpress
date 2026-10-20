import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MapPin, Bell, Mic, Camera, CheckCircle2, Shield, X, ArrowRight, Smartphone } from 'lucide-react';
import { Geolocation } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';
import toast from 'react-hot-toast';

interface PermissionsModalProps {
    isOpen?: boolean;
    onClose?: () => void;
    forceShow?: boolean;
}

export default function PermissionsModal({
    isOpen: controlledIsOpen,
    onClose,
    forceShow = false
}: PermissionsModalProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [loadingAll, setLoadingAll] = useState(false);

    const [locationStatus, setLocationStatus] = useState<'pending' | 'granted' | 'denied'>('pending');
    const [notifStatus, setNotifStatus] = useState<'pending' | 'granted' | 'denied'>('pending');
    const [audioStatus, setAudioStatus] = useState<'pending' | 'granted' | 'denied'>('pending');
    const [storageStatus, setStorageStatus] = useState<'pending' | 'granted' | 'denied'>('pending');

    useEffect(() => {
        const checkInitialStatus = async () => {
            // Check storage of completed onboarding
            const alreadyPrompted = localStorage.getItem('un2x3_permissions_onboarding_done');
            if (forceShow || (controlledIsOpen !== undefined ? controlledIsOpen : !alreadyPrompted)) {
                setIsOpen(true);
            }

            // Check Notifications
            if (typeof window !== 'undefined' && 'Notification' in window) {
                if (Notification.permission === 'granted') setNotifStatus('granted');
                else if (Notification.permission === 'denied') setNotifStatus('denied');
            }

            // Check Geolocation
            try {
                if (Capacitor.isNativePlatform()) {
                    const perm = await Geolocation.checkPermissions();
                    if (perm.location === 'granted') setLocationStatus('granted');
                    else if (perm.location === 'denied') setLocationStatus('denied');
                } else if (navigator.permissions) {
                    const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
                    if (status.state === 'granted') setLocationStatus('granted');
                    else if (status.state === 'denied') setLocationStatus('denied');
                }
            } catch (e) {
                // Ignore query failure
            }

            // Check Audio if permission API available
            try {
                if (navigator.permissions && (navigator.permissions as any).query) {
                    const micStatus = await (navigator.permissions as any).query({ name: 'microphone' });
                    if (micStatus.state === 'granted') setAudioStatus('granted');
                }
            } catch (e) {}

            // Check Camera if permission API available
            try {
                if (navigator.permissions && (navigator.permissions as any).query) {
                    const camStatus = await (navigator.permissions as any).query({ name: 'camera' });
                    if (camStatus.state === 'granted') setStorageStatus('granted');
                }
            } catch (e) {}
        };

        checkInitialStatus();
    }, [controlledIsOpen, forceShow]);

    const requestLocation = async (): Promise<boolean> => {
        try {
            if (Capacitor.isNativePlatform()) {
                const req = await Geolocation.requestPermissions();
                if (req.location === 'granted') {
                    setLocationStatus('granted');
                    return true;
                }
            } else if (navigator.geolocation) {
                await new Promise((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000 });
                });
                setLocationStatus('granted');
                return true;
            }
        } catch (err) {
            console.warn('Location request rejected or timeout:', err);
        }
        setLocationStatus('denied');
        return false;
    };

    const requestNotification = async (): Promise<boolean> => {
        try {
            if (typeof window !== 'undefined' && 'Notification' in window) {
                const perm = await Notification.requestPermission();
                if (perm === 'granted') {
                    setNotifStatus('granted');
                    return true;
                }
            }
        } catch (err) {
            console.warn('Notification permission error:', err);
        }
        setNotifStatus('denied');
        return false;
    };

    const requestAudio = async (): Promise<boolean> => {
        try {
            if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                stream.getTracks().forEach(track => track.stop());
                setAudioStatus('granted');
                return true;
            }
        } catch (err) {
            console.warn('Audio permission error:', err);
        }
        setAudioStatus('denied');
        return false;
    };

    const requestStorageAndCamera = async (): Promise<boolean> => {
        try {
            if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
                stream.getTracks().forEach(track => track.stop());
                setStorageStatus('granted');
                return true;
            }
        } catch (err) {
            console.warn('Camera/Storage permission error:', err);
        }
        // Fallback: file input trigger
        setStorageStatus('granted');
        return true;
    };

    const handleGrantAll = async () => {
        setLoadingAll(true);
        toast('Solicitando permisos al sistema...', { icon: '📱' });

        try {
            if (locationStatus !== 'granted') await requestLocation();
            if (notifStatus !== 'granted') await requestNotification();
            if (audioStatus !== 'granted') await requestAudio();
            if (storageStatus !== 'granted') await requestStorageAndCamera();

            toast.success('¡Configuración de permisos completada!');
        } catch (e) {
            console.error('Error granting all permissions:', e);
        } finally {
            setLoadingAll(false);
            handleClose();
        }
    };

    const handleClose = () => {
        localStorage.setItem('un2x3_permissions_onboarding_done', 'true');
        setIsOpen(false);
        if (onClose) onClose();
    };

    if (!isOpen) return null;

    const allGranted = locationStatus === 'granted' && notifStatus === 'granted' && audioStatus === 'granted' && storageStatus === 'granted';

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
                <motion.div
                    initial={{ opacity: 0, scale: 0.92, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.92, y: 20 }}
                    className="w-full max-w-md bg-white rounded-[36px] shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]"
                >
                    {/* Header */}
                    <div className="bg-gradient-to-br from-amber-400 via-amber-300 to-primary p-6 text-slate-950 relative shrink-0">
                        <button
                            type="button"
                            onClick={handleClose}
                            className="absolute top-5 right-5 w-8 h-8 rounded-full bg-black/10 hover:bg-black/20 flex items-center justify-center transition-colors"
                        >
                            <X className="w-5 h-5 text-slate-950" />
                        </button>

                        <div className="w-12 h-12 rounded-2xl bg-slate-950 text-amber-400 flex items-center justify-center shadow-lg mb-3">
                            <Shield className="w-6 h-6 stroke-[2.5]" />
                        </div>

                        <h2 className="text-2xl font-black tracking-tight text-slate-950">
                            Permisos de la Aplicación
                        </h2>
                        <p className="text-xs text-slate-900/80 font-bold mt-1 max-w-[280px]">
                            Para ofrecerte la mejor experiencia en tiempo real, activa los siguientes accesos en tu dispositivo:
                        </p>
                    </div>

                    {/* Permissions list */}
                    <div className="p-6 space-y-3.5 overflow-y-auto flex-1">
                        {/* 1. Ubicación */}
                        <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-2xl flex items-center gap-3.5">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${locationStatus === 'granted' ? 'bg-emerald-100 text-emerald-600' : 'bg-primary/20 text-slate-900'}`}>
                                <MapPin className="w-5 h-5 stroke-[2.5]" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h4 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                                    Geolocalización en Vivo
                                    {locationStatus === 'granted' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                                </h4>
                                <p className="text-[11px] text-slate-500 font-medium leading-tight mt-0.5">
                                    Para rutas exactas, tarifas justas, comercios y rastreo en mapa.
                                </p>
                            </div>
                            {locationStatus === 'granted' ? (
                                <span className="text-[10px] font-black uppercase text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                                    Listo
                                </span>
                            ) : (
                                <button
                                    type="button"
                                    onClick={requestLocation}
                                    className="text-[11px] font-black text-slate-900 bg-primary hover:bg-amber-400 px-3 py-1.5 rounded-xl shadow-xs active:scale-95 transition-all"
                                >
                                    Permitir
                                </button>
                            )}
                        </div>

                        {/* 2. Notificaciones */}
                        <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-2xl flex items-center gap-3.5">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${notifStatus === 'granted' ? 'bg-emerald-100 text-emerald-600' : 'bg-indigo-100 text-indigo-700'}`}>
                                <Bell className="w-5 h-5 stroke-[2.5]" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h4 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                                    Notificaciones Automáticas
                                    {notifStatus === 'granted' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                                </h4>
                                <p className="text-[11px] text-slate-500 font-medium leading-tight mt-0.5">
                                    Avisos en la barra de tu teléfono cuando el conductor llegue o cambie tu pedido.
                                </p>
                            </div>
                            {notifStatus === 'granted' ? (
                                <span className="text-[10px] font-black uppercase text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                                    Listo
                                </span>
                            ) : (
                                <button
                                    type="button"
                                    onClick={requestNotification}
                                    className="text-[11px] font-black text-slate-900 bg-primary hover:bg-amber-400 px-3 py-1.5 rounded-xl shadow-xs active:scale-95 transition-all"
                                >
                                    Permitir
                                </button>
                            )}
                        </div>

                        {/* 3. Micrófono / Notas de Voz */}
                        <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-2xl flex items-center gap-3.5">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${audioStatus === 'granted' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-700'}`}>
                                <Mic className="w-5 h-5 stroke-[2.5]" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h4 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                                    Micrófono y Notas de Voz
                                    {audioStatus === 'granted' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                                </h4>
                                <p className="text-[11px] text-slate-500 font-medium leading-tight mt-0.5">
                                    Para enviar notas de voz en los chats de delivery, taxi y mandados.
                                </p>
                            </div>
                            {audioStatus === 'granted' ? (
                                <span className="text-[10px] font-black uppercase text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                                    Listo
                                </span>
                            ) : (
                                <button
                                    type="button"
                                    onClick={requestAudio}
                                    className="text-[11px] font-black text-slate-900 bg-primary hover:bg-amber-400 px-3 py-1.5 rounded-xl shadow-xs active:scale-95 transition-all"
                                >
                                    Permitir
                                </button>
                            )}
                        </div>

                        {/* 4. Almacenamiento y Fotos */}
                        <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-2xl flex items-center gap-3.5">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${storageStatus === 'granted' ? 'bg-emerald-100 text-emerald-600' : 'bg-sky-100 text-sky-700'}`}>
                                <Camera className="w-5 h-5 stroke-[2.5]" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h4 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                                    Cámara y Almacenamiento
                                    {storageStatus === 'granted' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                                </h4>
                                <p className="text-[11px] text-slate-500 font-medium leading-tight mt-0.5">
                                    Para subir fotos de perfil, comprobantes de pago y fotos de encomiendas.
                                </p>
                            </div>
                            {storageStatus === 'granted' ? (
                                <span className="text-[10px] font-black uppercase text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                                    Listo
                                </span>
                            ) : (
                                <button
                                    type="button"
                                    onClick={requestStorageAndCamera}
                                    className="text-[11px] font-black text-slate-900 bg-primary hover:bg-amber-400 px-3 py-1.5 rounded-xl shadow-xs active:scale-95 transition-all"
                                >
                                    Permitir
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Bottom CTA */}
                    <div className="p-6 pt-2 border-t border-slate-100 shrink-0 space-y-2">
                        <button
                            type="button"
                            onClick={handleGrantAll}
                            disabled={loadingAll}
                            className="w-full bg-slate-900 hover:bg-slate-800 text-white py-4 rounded-2xl font-black text-sm shadow-xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-70 cursor-pointer"
                        >
                            {loadingAll ? (
                                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                                <>
                                    <span>{allGranted ? 'Continuar a la Aplicación' : 'Conceder Todos los Permisos'}</span>
                                    <ArrowRight className="w-4 h-4 stroke-[2.5]" />
                                </>
                            )}
                        </button>

                        <button
                            type="button"
                            onClick={handleClose}
                            className="w-full text-center text-xs font-bold text-slate-400 hover:text-slate-600 py-1 transition-colors"
                        >
                            Continuar por ahora
                        </button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
