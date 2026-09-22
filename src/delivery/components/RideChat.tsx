import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { 
    Send, 
    ArrowLeft, 
    Image as ImageIcon, 
    Video as VideoIcon, 
    Mic, 
    Square, 
    Play, 
    Pause, 
    ShieldCheck, 
    Lock, 
    Clock, 
    FileText,
    Phone,
    AlertTriangle,
    X
} from 'lucide-react';
import toast from 'react-hot-toast';
import { compressImage } from '../utils/mediaCompressor';

interface ChatProps {
    requestId: string;
    onClose?: () => void;
    readOnly?: boolean;
    serviceCategory?: string;
    requestStatus?: string;
    completedAt?: string;
    onStartCall?: () => void;
    driverPhone?: string;
    clientPhone?: string;
    isDriver?: boolean;
}

// In-Bubble Audio Player Component
function AudioPlayerBubble({ src, isMine }: { src: string; isMine: boolean }) {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const updateTime = () => {
            setCurrentTime(audio.currentTime);
            if (audio.duration && !isNaN(audio.duration)) {
                setProgress((audio.currentTime / audio.duration) * 100);
            }
        };

        const handleLoaded = () => {
            if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
                setDuration(audio.duration);
            }
        };

        const handleEnded = () => {
            setIsPlaying(false);
            setProgress(0);
            setCurrentTime(0);
        };

        audio.addEventListener('timeupdate', updateTime);
        audio.addEventListener('loadedmetadata', handleLoaded);
        audio.addEventListener('ended', handleEnded);

        return () => {
            audio.removeEventListener('timeupdate', updateTime);
            audio.removeEventListener('loadedmetadata', handleLoaded);
            audio.removeEventListener('ended', handleEnded);
        };
    }, [src]);

    const togglePlay = () => {
        if (!audioRef.current) return;
        if (isPlaying) {
            audioRef.current.pause();
            setIsPlaying(false);
        } else {
            audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
        }
    };

    const formatTime = (secs: number) => {
        if (isNaN(secs) || !isFinite(secs)) return '0:00';
        const m = Math.floor(secs / 60);
        const s = Math.floor(secs % 60);
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    };

    return (
        <div className={`flex items-center gap-2.5 p-2 rounded-xl min-w-[200px] sm:min-w-[230px] ${
            isMine ? 'bg-black/10 text-slate-950' : 'bg-white/10 text-white'
        }`}>
            <audio ref={audioRef} src={src} preload="metadata" />
            <button
                type="button"
                onClick={togglePlay}
                className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 shadow-sm active:scale-90 transition-all ${
                    isMine ? 'bg-slate-950 text-white hover:bg-black' : 'bg-emerald-500 text-white hover:bg-emerald-600'
                }`}
            >
                {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
            </button>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1 h-3 mb-1">
                    {[35, 65, 30, 90, 55, 100, 45, 80, 50, 75, 35, 65, 85, 40].map((h, i) => (
                        <div
                            key={i}
                            className={`flex-1 rounded-full transition-all duration-200 ${
                                (i / 14) * 100 <= progress
                                    ? (isMine ? 'bg-slate-950' : 'bg-emerald-400')
                                    : (isMine ? 'bg-black/25' : 'bg-white/20')
                            }`}
                            style={{ height: `${h}%` }}
                        />
                    ))}
                </div>
                <div className="flex justify-between items-center text-[10px] font-bold opacity-75">
                    <span>{formatTime(currentTime)}</span>
                    <span>{duration > 0 ? formatTime(duration) : 'Audio'}</span>
                </div>
            </div>
        </div>
    );
}

export default function RideChat({ 
    requestId, 
    onClose, 
    readOnly = false, 
    serviceCategory,
    requestStatus,
    completedAt,
    onStartCall,
    driverPhone,
    clientPhone,
    isDriver = false
}: ChatProps) {
    const { user } = useAuth();
    const [messages, setMessages] = useState<any[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [sending, setSending] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [uploadingMedia, setUploadingMedia] = useState(false);
    const [showIssueModal, setShowIssueModal] = useState(false);

    // Voice recording inside chat
    const [isRecordingVoice, setIsRecordingVoice] = useState(false);
    const [voiceSeconds, setVoiceSeconds] = useState(0);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const voiceChunksRef = useRef<Blob[]>([]);
    const voiceTimerRef = useRef<any>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const chatPath = `transport_requests/${requestId}`;

    // 48-Hour Retention Logic
    const isCompleted = requestStatus === 'completed';
    const completedTimestamp = completedAt ? new Date(completedAt).getTime() : Date.now();
    const hoursSinceCompletion = isCompleted ? (Date.now() - completedTimestamp) / (1000 * 60 * 60) : 0;
    const isExpired = isCompleted && hoursSinceCompletion > 48;
    const isChatLocked = readOnly || isCompleted || isExpired;
    const hoursRemaining = Math.max(0, Math.ceil(48 - hoursSinceCompletion));

    // Vehicle Category Meta
    const getVehicleMeta = () => {
        switch (serviceCategory) {
            case 'mototaxi':
                return { emoji: 'ðŸ›µ', label: 'Mototaxi' };
            case 'mandado':
            case 'muchacho_mandado':
                return { emoji: 'ðŸ“¦', label: 'Muchacho e\' Mandao' };
            case 'encomienda':
                return { emoji: 'ðŸ“¦', label: 'Encomienda' };
            case 'confort':
                return { emoji: 'ðŸš˜', label: 'Confort VIP' };
            case 'taxi':
            default:
                return { emoji: 'ðŸš•', label: 'Taxi Express' };
        }
    };
    const vehicleMeta = getVehicleMeta();

    useEffect(() => {
        if (!requestId) return;

        const fetchMessages = async () => {
            try {
                const { data, error } = await supabase
                    .from('messages')
                    .select('*')
                    .or(`chat_path.eq.${chatPath},order_id.eq.${requestId}`)
                    .order('created_at', { ascending: true });

                if (error) throw error;
                if (data) {
                    setMessages(data.map((d: any) => {
                        const cDate = d.created_at ? new Date(d.created_at) : new Date();
                        return {
                            id: d.id,
                            text: d.text,
                            imageUrl: d.image_url || d.imageUrl,
                            videoUrl: d.video_url || d.videoUrl,
                            audioUrl: d.audio_url || d.audioUrl,
                            action: d.action,
                            senderId: d.sender_id || d.senderId,
                            senderName: d.sender_name || d.senderName,
                            senderRole: d.sender_role || d.senderRole,
                            createdAt: {
                                toDate: () => cDate,
                                toLocaleTimeString: (...args: any[]) => cDate.toLocaleTimeString(...args)
                            }
                        };
                    }));
                    setErrorMsg('');
                }
            } catch (err: any) {
                console.error("Error fetching messages:", err);
                setErrorMsg('Error al leer mensajes.');
            }
        };

        fetchMessages();

        const channel = supabase
            .channel(`ride_chat_unified_${requestId}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'messages',
                filter: `chat_path=eq.${chatPath}`
            }, () => {
                fetchMessages();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
            if (voiceTimerRef.current) clearInterval(voiceTimerRef.current);
        };
    }, [requestId, chatPath]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || sending || isChatLocked) return;

        setSending(true);
        setErrorMsg('');
        try {
            const uid = user?.id || (user as any)?.uid || (isDriver ? 'driver' : 'passenger');
            const role = isDriver ? 'delivery' : 'client';
            const defaultName = isDriver ? 'Piloto' : 'Pasajero';

            const { error } = await supabase.from('messages').insert({
                chat_path: chatPath,
                order_id: requestId,
                text: newMessage.trim(),
                sender_id: uid,
                sender_name: user?.displayName || defaultName,
                sender_role: role,
                created_at: new Date().toISOString()
            });

            if (error) throw error;
            setNewMessage('');
        } catch (error: any) {
            console.error("Error sending message:", error);
            setErrorMsg('No se pudo enviar: ' + (error?.message || 'Error de la base de datos'));
        } finally {
            setSending(false);
        }
    };

    // Upload Media (Image compressed via Canvas, or Video)
    const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || !e.target.files[0] || isChatLocked) return;
        const file = e.target.files[0];
        setUploadingMedia(true);
        const isVideo = file.type.startsWith('video/');
        const tId = toast.loading(isVideo ? 'Subiendo video...' : 'Optimizando y subiendo comprobante / foto...');

        try {
            const uid = user?.id || (user as any)?.uid || (isDriver ? 'driver' : 'passenger');
            let uploadBlob: Blob = file;

            // Compress images automatically before uploading
            if (!isVideo && file.type.startsWith('image/')) {
                uploadBlob = await compressImage(file, 1280, 0.8);
            }

            const ext = isVideo ? (file.name.split('.').pop() || 'mp4') : 'jpg';
            const filePath = `chat_attachments/${requestId}_${Date.now()}.${ext}`;
            const { error: upErr } = await supabase.storage.from('store_assets').upload(filePath, uploadBlob, { 
                contentType: isVideo ? file.type : 'image/jpeg',
                upsert: true 
            });

            if (upErr) throw upErr;

            const { data: { publicUrl } } = supabase.storage.from('store_assets').getPublicUrl(filePath);

            const insertPayload: any = {
                chat_path: chatPath,
                order_id: requestId,
                text: isVideo ? 'ðŸŽ¥ [Video adjunto]' : 'ðŸ“· [Comprobante de compra o foto adjunta]',
                sender_id: uid,
                sender_name: user?.displayName || (isDriver ? 'Piloto' : 'Pasajero'),
                sender_role: isDriver ? 'delivery' : 'client',
                created_at: new Date().toISOString()
            };

            if (isVideo) {
                insertPayload.video_url = publicUrl;
            } else {
                insertPayload.image_url = publicUrl;
            }

            await supabase.from('messages').insert(insertPayload);
            toast.success(isVideo ? 'Video enviado' : 'Comprobante / foto enviada', { id: tId });
        } catch (err: any) {
            console.error("Error uploading media to chat:", err);
            toast.error('Error al subir archivo', { id: tId });
        } finally {
            setUploadingMedia(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    // Cross-Browser Voice Recording
    const handleStartVoice = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            let mimeType = 'audio/webm';
            let ext = 'webm';
            if (typeof MediaRecorder !== 'undefined') {
                if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
                    mimeType = 'audio/webm;codecs=opus';
                    ext = 'webm';
                } else if (MediaRecorder.isTypeSupported('audio/webm')) {
                    mimeType = 'audio/webm';
                    ext = 'webm';
                } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
                    mimeType = 'audio/mp4';
                    ext = 'mp4';
                } else if (MediaRecorder.isTypeSupported('audio/aac')) {
                    mimeType = 'audio/aac';
                    ext = 'aac';
                } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
                    mimeType = 'audio/ogg';
                    ext = 'ogg';
                }
            }

            const mr = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
            mediaRecorderRef.current = mr;
            voiceChunksRef.current = [];

            mr.ondataavailable = (e) => {
                if (e.data.size > 0) voiceChunksRef.current.push(e.data);
            };

            mr.onstop = async () => {
                const audioBlob = new Blob(voiceChunksRef.current, { type: mimeType || 'audio/webm' });
                stream.getTracks().forEach(t => t.stop());

                const tId = toast.loading('Enviando nota de voz...');
                try {
                    const uid = user?.id || (user as any)?.uid || (isDriver ? 'driver' : 'passenger');
                    const audioPath = `chat_attachments/${requestId}_audio_${Date.now()}.${ext}`;
                    const { error: upErr } = await supabase.storage.from('store_assets').upload(audioPath, audioBlob, {
                        contentType: mimeType || 'audio/webm',
                        upsert: true
                    });
                    if (upErr) throw upErr;

                    const { data: { publicUrl } } = supabase.storage.from('store_assets').getPublicUrl(audioPath);

                    await supabase.from('messages').insert({
                        chat_path: chatPath,
                        order_id: requestId,
                        text: 'ðŸŽ¤ [Nota de voz]',
                        audio_url: publicUrl,
                        sender_id: uid,
                        sender_name: user?.displayName || (isDriver ? 'Piloto' : 'Pasajero'),
                        sender_role: isDriver ? 'delivery' : 'client',
                        created_at: new Date().toISOString()
                    });

                    toast.success('Nota de voz enviada', { id: tId });
                } catch (err) {
                    console.error("Error uploading audio to chat:", err);
                    toast.error('Error al enviar audio', { id: tId });
                }
            };

            mr.start(200);
            setIsRecordingVoice(true);
            setVoiceSeconds(0);

            voiceTimerRef.current = setInterval(() => {
                setVoiceSeconds(prev => prev + 1);
            }, 1000);
        } catch (err) {
            toast.error('No se pudo acceder al micrÃ³fono');
        }
    };

    const handleStopVoice = () => {
        if (mediaRecorderRef.current && isRecordingVoice) {
            mediaRecorderRef.current.stop();
            setIsRecordingVoice(false);
            if (voiceTimerRef.current) clearInterval(voiceTimerRef.current);
        }
    };

    const handleCallAction = () => {
        if (onStartCall) {
            onStartCall();
            return;
        }
        const phone = driverPhone || clientPhone;
        if (phone) {
            window.location.href = `tel:${phone}`;
        } else {
            toast('NÃºmero de contacto no disponible para llamada directa', { icon: 'ðŸ“ž' });
        }
    };

    const handleReportIssue = async (reason: string) => {
        try {
            const uid = user?.id || (user as any)?.uid || 'driver';
            await supabase.from('messages').insert({
                chat_path: chatPath,
                order_id: requestId,
                text: `ðŸš¨ [NOVEDAD REPORTADA]: ${reason}`,
                action: 'merchant_issue',
                sender_id: uid,
                sender_name: user?.displayName || 'Piloto',
                sender_role: 'delivery',
                created_at: new Date().toISOString()
            });
            setShowIssueModal(false);
            toast.success('Novedad reportada en el chat');
        } catch (err) {
            console.error("Error reporting issue:", err);
            toast.error('No se pudo enviar la novedad');
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-100 relative pointer-events-auto select-none">
            {/* Embedded styles for vehicle track animation */}
            <style>{`
                @keyframes driveHorizontal {
                    0% { left: 5%; transform: translateY(-50%) scaleX(1); }
                    48% { left: 78%; transform: translateY(-50%) scaleX(1); }
                    52% { left: 78%; transform: translateY(-50%) scaleX(-1); }
                    98% { left: 5%; transform: translateY(-50%) scaleX(-1); }
                    100% { left: 5%; transform: translateY(-50%) scaleX(1); }
                }
            `}</style>

            {/* Top Bar Header */}
            <div className="bg-white px-3.5 py-3 border-b border-slate-200 flex items-center justify-between sticky top-0 z-20 shadow-sm">
                <div className="flex items-center gap-2.5 min-w-0">
                    {onClose && (
                        <button 
                            type="button"
                            onClick={onClose} 
                            className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 shadow-sm transition-all active:scale-90 shrink-0"
                            title="Volver"
                        >
                            <ArrowLeft className="w-4 h-4" />
                        </button>
                    )}
                    <div className="min-w-0">
                        <h3 className="font-black text-slate-900 text-sm flex items-center gap-1.5 truncate">
                            <span>{isDriver ? 'Chat con el Cliente' : 'Chat de Servicio Un 2x3'}</span>
                            {isCompleted && (
                                <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
                                    Respaldo 48h
                                </span>
                            )}
                        </h3>
                        <p className="text-[11px] font-medium text-slate-500 truncate">
                            {isCompleted ? 'Historial de comprobantes y conversaciÃ³n' : 'MensajerÃ­a en tiempo real y comprobantes'}
                        </p>
                    </div>
                </div>

                {/* Header Action Buttons */}
                <div className="flex items-center gap-1.5 shrink-0">
                    {isDriver && !isChatLocked && (
                        <button
                            type="button"
                            onClick={() => setShowIssueModal(true)}
                            className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 text-[10px] font-black uppercase rounded-xl border border-rose-200 flex items-center gap-1 transition-all active:scale-95"
                            title="Reportar novedad"
                        >
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Novedad</span>
                        </button>
                    )}

                    {/* Green Call Button */}
                    {!isCompleted && (
                        <button
                            type="button"
                            onClick={handleCallAction}
                            className="w-8 h-8 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-500/25 active:scale-90 transition-all shrink-0"
                            title="Llamar"
                        >
                            <Phone className="w-4 h-4 fill-white" />
                        </button>
                    )}
                </div>
            </div>

            {/* Top Animated Route Progress Header */}
            <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white px-3.5 py-2 border-b border-slate-800 shadow-inner">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-300 mb-1">
                    <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                        <span>{vehicleMeta.label}</span>
                    </span>
                    <span className="text-[10px] text-amber-400 font-black uppercase tracking-wider">
                        {isCompleted ? 'Llegada completada' : 'En trayecto'}
                    </span>
                </div>

                {/* Track visual */}
                <div className="relative flex items-center justify-between py-1 px-2.5 bg-white/5 rounded-xl border border-white/10 overflow-hidden">
                    {/* Origin */}
                    <div className="flex items-center gap-1 z-10 shrink-0">
                        <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50 flex items-center justify-center">
                            <div className="w-1 h-1 rounded-full bg-white"></div>
                        </div>
                        <span className="text-[9px] font-bold text-slate-300">Punto A</span>
                    </div>

                    {/* Animated Line & Driving Vehicle */}
                    <div className="flex-1 mx-3 relative h-1.5 bg-slate-700/60 rounded-full">
                        <div className="absolute inset-0 bg-gradient-to-r from-emerald-500 via-amber-400 to-indigo-400 rounded-full opacity-60"></div>
                        {!isCompleted && (
                            <div 
                                className="absolute top-1/2 flex items-center justify-center pointer-events-none"
                                style={{ animation: 'driveHorizontal 5s ease-in-out infinite' }}
                            >
                                <span className="text-base select-none filter drop-shadow-md">
                                    {vehicleMeta.emoji}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Destination */}
                    <div className="flex items-center gap-1 z-10 shrink-0">
                        <span className="text-sm select-none">ðŸ </span>
                        <span className="text-[9px] font-bold text-slate-300">Destino</span>
                    </div>
                </div>
            </div>

            {/* 48-Hour Retention Banner */}
            {isCompleted && (
                <div className={`p-2.5 px-3 border-b text-xs flex items-center gap-2 ${
                    isExpired 
                        ? 'bg-rose-50 border-rose-200 text-rose-800' 
                        : 'bg-amber-50 border-amber-200 text-amber-900'
                }`}>
                    <Clock className="w-4 h-4 shrink-0" />
                    <p className="text-[11px] font-medium leading-tight">
                        {isExpired ? (
                            <span>El periodo de respaldo de 48 horas ha expirado.</span>
                        ) : (
                            <span>
                                <strong>Respaldo de 48 horas:</strong> Chat disponible para consulta de comprobantes por <strong>{hoursRemaining} horas mÃ¡s</strong>.
                            </span>
                        )}
                    </p>
                </div>
            )}

            {/* Pinned Muchacho e' Mandado Rule Banner */}
            {(serviceCategory === 'mandado' || serviceCategory === 'muchacho_mandado' || !isCompleted) && (
                <div className="bg-amber-50 p-2.5 px-3 border-b border-amber-200/80 flex items-start gap-2 text-[11px] text-amber-950 leading-tight">
                    <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                        <strong>Norma de Seguridad Un 2x3:</strong> Transfiere el costo de compras directo al negocio por Pago MÃ³vil y comparte el comprobante aquÃ­. Al llegar el piloto, pagas su tarifa convenida.
                    </div>
                </div>
            )}

            {errorMsg && (
                <div className="bg-red-50 text-red-600 text-[10px] font-bold px-4 py-2 text-center border-b border-red-100">
                    {errorMsg}
                </div>
            )}

            {/* Messages Area - WhatsApp style */}
            <div className="flex-1 overflow-y-auto p-3.5 space-y-3 pb-6">
                {messages.length === 0 ? (
                    <div className="text-center text-slate-400 font-medium text-xs mt-10 space-y-1">
                        <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                        <p>No hay mensajes aÃºn.</p>
                        <p className="text-[11px]">Â¡Escribe o envÃ­a el capture del Pago MÃ³vil aquÃ­!</p>
                    </div>
                ) : (
                    messages.map((msg) => {
                        const isMine = isDriver
                            ? (msg.senderRole === 'delivery' || msg.senderRole === 'driver' || (!msg.senderRole && (msg.senderId === user?.uid || msg.senderId === (user as any)?.id)))
                            : (msg.senderRole === 'client' || (!msg.senderRole && (msg.senderId === (user as any)?.id || msg.senderId === user?.uid || msg.senderId === 'passenger')));
                        const isAlert = msg.action === 'merchant_issue' || msg.text?.startsWith('ðŸš¨');

                        return (
                            <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-3.5 py-2.5 space-y-1.5 shadow-sm ${
                                    isAlert
                                        ? 'bg-rose-950 text-rose-100 border border-rose-500/50 rounded-2xl'
                                        : isMine
                                        ? 'bg-[#FFB800] text-slate-950 rounded-tr-xs shadow-amber-500/20'
                                        : 'bg-slate-800 text-white rounded-tl-xs shadow-slate-900/10'
                                }`}>
                                    {/* Sender Label */}
                                    <div className="flex items-center justify-between gap-2">
                                        <span className={`text-[10px] font-black uppercase tracking-wider ${
                                            isAlert ? 'text-rose-300' : isMine ? 'text-slate-900/70' : 'text-amber-400'
                                        }`}>
                                            {isMine ? 'TÃº' : (msg.senderName || (msg.senderRole === 'delivery' ? 'Piloto' : 'Cliente'))}
                                        </span>
                                    </div>

                                    {/* Image Attachment */}
                                    {msg.imageUrl && (
                                        <a href={msg.imageUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-black/10">
                                            <img src={msg.imageUrl} alt="Adjunto" className="max-h-56 w-full object-cover hover:opacity-95 transition-opacity" />
                                        </a>
                                    )}

                                    {/* Video Attachment */}
                                    {msg.videoUrl && (
                                        <div className="overflow-hidden rounded-xl border border-black/10">
                                            <video controls src={msg.videoUrl} className="max-h-56 w-full object-cover" />
                                        </div>
                                    )}

                                    {/* Custom Audio Player in Bubble */}
                                    {msg.audioUrl && (
                                        <AudioPlayerBubble src={msg.audioUrl} isMine={isMine && !isAlert} />
                                    )}

                                    <p className="text-xs font-semibold leading-relaxed break-words">{msg.text}</p>
                                    
                                    {/* Timestamp */}
                                    <span className={`text-[9px] block font-bold text-right ${
                                        isAlert ? 'text-rose-300/80' : isMine ? 'text-slate-950/60' : 'text-slate-400'
                                    }`}>
                                        {msg.createdAt?.toDate?.() ? msg.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                    </span>
                                </div>
                            </div>
                        );
                    })
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Bar - Mobile Safe */}
            {isChatLocked ? (
                <div className="p-3 bg-slate-200/80 border-t border-slate-300 text-center flex items-center justify-center gap-2 text-slate-600 text-xs font-bold">
                    <Lock className="w-3.5 h-3.5 text-slate-500" />
                    <span>Chat cerrado por servicio completado (Modo lectura de respaldo por 48h)</span>
                </div>
            ) : (
                <div className="p-2 sm:p-3 bg-white border-t border-slate-200 sticky bottom-0 z-20">
                    {/* Voice Recording Active Bar */}
                    {isRecordingVoice ? (
                        <div className="flex items-center justify-between bg-rose-50 border-2 border-rose-300 rounded-2xl px-3 py-2">
                            <div className="flex items-center gap-2 min-w-0">
                                <div className="w-2.5 h-2.5 rounded-full bg-rose-600 animate-ping shrink-0"></div>
                                <span className="text-xs font-black text-rose-600 truncate">
                                    Grabando audio... {voiceSeconds}s
                                </span>
                            </div>
                            <button
                                type="button"
                                onClick={handleStopVoice}
                                className="py-1 px-3 bg-rose-600 text-white font-black text-xs rounded-xl flex items-center gap-1.5 shadow-sm active:scale-95 shrink-0"
                            >
                                <Square className="w-3 h-3 fill-white" />
                                <span>Enviar</span>
                            </button>
                        </div>
                    ) : (
                        <form onSubmit={handleSendMessage} className="flex items-center gap-1.5 sm:gap-2 w-full max-w-full">
                            {/* Hidden file input */}
                            <input
                                type="file"
                                ref={fileInputRef}
                                accept="image/*,video/*"
                                onChange={handleMediaUpload}
                                className="hidden"
                            />

                            {/* Attach Media button */}
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={uploadingMedia}
                                className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center shrink-0 active:scale-95 transition-all"
                                title="Adjuntar foto, comprobante o video"
                            >
                                <ImageIcon className="w-4 h-4" />
                            </button>

                            {/* Record Voice button */}
                            <button
                                type="button"
                                onClick={handleStartVoice}
                                className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-amber-50 hover:bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 active:scale-95 transition-all"
                                title="Grabar nota de voz"
                            >
                                <Mic className="w-4 h-4" />
                            </button>

                            {/* Text Input */}
                            <input
                                type="text"
                                value={newMessage}
                                onChange={(e) => setNewMessage(e.target.value)}
                                placeholder="Escribe un mensaje o comprobante..."
                                className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-full px-3.5 py-2 sm:py-2.5 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 font-medium text-slate-800 placeholder:text-slate-400"
                            />

                            {/* Send button - Always Visible */}
                            <button
                                type="submit"
                                disabled={!newMessage.trim() || sending}
                                className="w-9 h-9 sm:w-10 sm:h-10 bg-[#FFB800] text-slate-950 rounded-full flex items-center justify-center shrink-0 disabled:opacity-40 hover:bg-amber-400 transition-colors shadow-sm active:scale-95"
                                title="Enviar mensaje"
                            >
                                <Send className="w-4 h-4 ml-0.5" />
                            </button>
                        </form>
                    )}
                </div>
            )}

            {/* Issue Modal for Driver */}
            {showIssueModal && (
                <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 w-full max-w-sm space-y-4">
                        <div className="flex items-center justify-between">
                            <h4 className="font-black text-white text-sm flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4 text-amber-400" />
                                Reportar Novedad al Cliente
                            </h4>
                            <button onClick={() => setShowIssueModal(false)} className="text-slate-400 hover:text-white">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="space-y-2">
                            {[
                                "Comercio cerrado temporalmente",
                                "Producto no disponible o sin stock",
                                "Precio diferente al esperado",
                                "Cola larga / Tiempo de espera mayor",
                                "Falta nÃºmero de referencia de Pago MÃ³vil"
                            ].map((issue) => (
                                <button
                                    key={issue}
                                    onClick={() => handleReportIssue(issue)}
                                    className="w-full text-left p-3 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-xs font-bold text-slate-200 active:scale-98 transition-all"
                                >
                                    {issue}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
