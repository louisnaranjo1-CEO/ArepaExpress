import React, { useEffect } from 'react';
import { Phone, PhoneOff, Mic, MicOff } from 'lucide-react';
import { useWebRTCCall, CallStatus } from '../hooks/useWebRTCCall';

interface InAppCallProps {
    requestId: string;
    myId: string;       // userId or driverId
    remoteId: string;   // the other party's id
    remoteDisplayName: string;
    remotePhotoUrl?: string;
    role: 'caller' | 'receiver';
    initialOffer?: any;
    remotePhone?: string;
    onClose: () => void;
}

function formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

const STATUS_LABEL: Record<CallStatus, string> = {
    idle: 'Iniciando...',
    calling: 'Llamando...',
    ringing: 'Llamada entrante...',
    connected: 'En llamada',
    ended: 'Llamada finalizada',
};

export default function InAppCall({
    requestId,
    myId,
    remoteId,
    remoteDisplayName,
    remotePhotoUrl,
    role,
    initialOffer,
    remotePhone,
    onClose,
}: InAppCallProps) {
    const [isUnanswered, setIsUnanswered] = React.useState(false);

    const {
        callStatus,
        duration,
        isMuted,
        toggleMute,
        startCall,
        answerCall,
        hangUp,
        rejectCall
    } = useWebRTCCall({
        requestId,
        myId,
        remoteId,
        role,
        initialOffer,
        onCallEnded: () => {
            if (role === 'caller' && duration === 0 && remotePhone) {
                setIsUnanswered(true);
            } else {
                onClose();
            }
        },
    });

    // Auto-start call if we're the initiator
    useEffect(() => {
        if (role === 'caller') {
            startCall().catch(console.error);
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Caller timeout: if 30s pass without answer, trigger unanswered fallback
    useEffect(() => {
        if (role === 'caller' && callStatus === 'calling') {
            const timer = setTimeout(() => {
                hangUp().catch(() => {});
                if (remotePhone) {
                    setIsUnanswered(true);
                } else {
                    onClose();
                }
            }, 30000);
            return () => clearTimeout(timer);
        }
    }, [role, callStatus, hangUp, remotePhone, onClose]);

    // Ensure hangup if component unmounts during active call
    useEffect(() => {
        return () => {
            if (callStatus === 'calling' || callStatus === 'ringing' || callStatus === 'connected') {
                hangUp().catch(() => {});
            }
        };
    }, [callStatus, hangUp]);

    const handleHangUp = async () => {
        await hangUp();
        if (role === 'caller' && duration === 0 && remotePhone) {
            setIsUnanswered(true);
        } else {
            onClose();
        }
    };

    const handleReject = async () => {
        if (rejectCall) {
            await rejectCall();
        } else {
            await hangUp();
        }
        onClose();
    };

    const handleAnswer = async () => {
        await answerCall();
    };

    const isConnected = callStatus === 'connected';
    const isRinging = callStatus === 'ringing';

    if (isUnanswered && remotePhone) {
        const digitsOnly = remotePhone.replace(/\D/g, '');
        const waPhone = digitsOnly.startsWith('58') ? digitsOnly : digitsOnly.startsWith('0') ? `58${digitsOnly.slice(1)}` : `58${digitsOnly}`;
        const telLink = `tel:${remotePhone}`;
        const waLink = `https://wa.me/${waPhone}`;

        return (
            <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/85 backdrop-blur-sm animate-fade-in p-0 sm:p-4">
                <div className="w-full max-w-sm bg-gradient-to-b from-slate-900 to-slate-950 rounded-t-[32px] sm:rounded-3xl p-6 shadow-2xl border border-white/10 text-white space-y-4 animate-slide-up">
                    <div className="text-center space-y-1">
                        <div className="w-14 h-14 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center mx-auto mb-2 text-2xl font-black">
                            📞
                        </div>
                        <h3 className="text-lg font-black text-white">Sin respuesta en la app</h3>
                        <p className="text-xs font-medium text-slate-400 leading-relaxed">
                            {remoteDisplayName} no contestó la llamada dentro de la aplicación. Puedes comunicarte directamente:
                        </p>
                    </div>

                    <div className="space-y-2.5 pt-1">
                        {/* Botón 1: Llamada Celular Normal */}
                        <a
                            href={telLink}
                            className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-lg shadow-emerald-600/30 transition-all flex items-center justify-center gap-2"
                        >
                            <Phone className="w-4 h-4 fill-white" />
                            <span>Llamar al Teléfono Normal</span>
                        </a>

                        {/* Botón 2: WhatsApp Directo */}
                        <a
                            href={waLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full py-3.5 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 active:scale-95 text-emerald-400 font-black text-xs uppercase tracking-wider rounded-2xl transition-all flex items-center justify-center gap-2"
                        >
                            <span className="text-base">💬</span>
                            <span>Enviar WhatsApp al Conductor</span>
                        </a>

                        {/* Botón Cerrar */}
                        <button
                            type="button"
                            onClick={onClose}
                            className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-400 font-bold text-xs rounded-xl active:scale-95 transition-all"
                        >
                            Cerrar
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/75 backdrop-blur-sm animate-fade-in">
            <div className="w-full max-w-sm bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 rounded-t-3xl px-6 pt-8 pb-12 shadow-2xl border-t border-white/10 animate-slide-up">
                
                {/* Pulse ring animation when calling/ringing */}
                <div className="relative flex justify-center mb-6">
                    {!isConnected && (
                        <>
                            <div className="absolute w-28 h-28 rounded-full bg-emerald-500/20 animate-ping" />
                            <div className="absolute w-24 h-24 rounded-full bg-amber-400/30 animate-ping" style={{ animationDelay: '0.3s' }} />
                        </>
                    )}
                    <div className="relative w-20 h-20 rounded-full overflow-hidden border-4 border-amber-400 shadow-xl shadow-amber-400/30">
                        {remotePhotoUrl ? (
                            <img src={remotePhotoUrl} alt={remoteDisplayName} className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full bg-slate-700 flex items-center justify-center">
                                <span className="text-3xl font-black text-white">
                                    {remoteDisplayName.charAt(0).toUpperCase()}
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Name */}
                <h2 className="text-center text-2xl font-black text-white mb-1">
                    {remoteDisplayName}
                </h2>

                {/* Status / Timer */}
                <p className={`text-center font-bold text-sm mb-8 ${isRinging ? 'text-amber-400 animate-pulse' : 'text-slate-400'}`}>
                    {isConnected ? formatDuration(duration) : STATUS_LABEL[callStatus]}
                </p>

                {/* Action buttons */}
                <div className="flex justify-center items-center gap-6">
                    {/* Mute button — only when connected */}
                    {isConnected && (
                        <button
                            type="button"
                            onClick={toggleMute}
                            className={`w-14 h-14 rounded-full flex items-center justify-center transition-all active:scale-95 ${isMuted ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/40' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                            title={isMuted ? 'Activar micrófono' : 'Silenciar'}
                        >
                            {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                        </button>
                    )}

                    {/* Answer button — for receiver when ringing */}
                    {isRinging && (
                        <button
                            type="button"
                            onClick={handleAnswer}
                            className="w-16 h-16 rounded-full bg-emerald-500 hover:bg-emerald-400 text-white flex items-center justify-center shadow-xl shadow-emerald-500/50 active:scale-95 transition-all animate-bounce"
                            title="Contestar llamada"
                        >
                            <Phone className="w-7 h-7 fill-white" />
                        </button>
                    )}

                    {/* Hang up / Reject button */}
                    <button
                        type="button"
                        onClick={isRinging ? handleReject : handleHangUp}
                        className="w-16 h-16 rounded-full bg-rose-600 hover:bg-rose-500 flex items-center justify-center shadow-xl shadow-rose-600/50 active:scale-95 transition-all"
                        title={isRinging ? 'Rechazar llamada' : 'Colgar'}
                    >
                        <PhoneOff className="w-7 h-7 text-white" />
                    </button>
                </div>

                {/* Secure call disclaimer */}
                <p className="text-center text-[10px] font-medium text-slate-500 mt-6">
                    🔒 Llamada segura en la app • Tu número telefónico permanece privado
                </p>
            </div>
        </div>
    );
}
