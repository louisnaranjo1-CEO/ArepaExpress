import React, { useEffect, useRef } from 'react';
import { Phone, PhoneOff, Mic, MicOff } from 'lucide-react';
import { useWebRTCCall, CallStatus } from '../hooks/useWebRTCCall';

interface InAppCallProps {
    requestId: string;
    myId: string;
    remoteId: string;
    remoteDisplayName: string;
    remotePhotoUrl?: string;
    role: 'caller' | 'receiver';
    initialOffer?: any;
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
    onClose,
}: InAppCallProps) {
    const [muted, setMuted] = React.useState(false);
    const localStreamRef = useRef<MediaStream | null>(null);

    const { callStatus, duration, startCall, answerCall, hangUp, rejectCall } = useWebRTCCall({
        requestId,
        myId,
        remoteId,
        role,
        initialOffer,
        onCallEnded: onClose,
    });

    // Auto-start call if we're the initiator
    useEffect(() => {
        if (role === 'caller') {
            startCall().catch(console.error);
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleHangUp = async () => {
        await hangUp();
        onClose();
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

    const toggleMute = () => {
        if (localStreamRef.current) {
            localStreamRef.current.getAudioTracks().forEach(track => {
                track.enabled = muted;
            });
        }
        setMuted(m => !m);
    };

    const isConnected = callStatus === 'connected';
    const isRinging = callStatus === 'ringing';

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
                            className={`w-14 h-14 rounded-full flex items-center justify-center transition-all active:scale-95 ${muted ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/40' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                            title={muted ? 'Activar micrófono' : 'Silenciar'}
                        >
                            {muted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
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
