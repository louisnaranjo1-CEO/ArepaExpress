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
    AlertTriangle, 
    ShieldCheck, 
    Lock, 
    Clock, 
    X,
    FileText 
} from 'lucide-react';
import toast from 'react-hot-toast';
import { compressImage } from '../utils/mediaCompressor';

interface ChatProps {
    requestId: string;
    onClose?: () => void;
    readOnly?: boolean;
    serviceCategory?: string;
    isDriver?: boolean;
    requestStatus?: string;
    completedAt?: string;
}

export default function RideChat({ 
    requestId, 
    onClose, 
    readOnly = false, 
    serviceCategory, 
    isDriver = true,
    requestStatus,
    completedAt
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
            .channel(`ride_chat_driver_${requestId}`)
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
        if (!newMessage.trim() || !user || sending || isChatLocked) return;

        setSending(true);
        setErrorMsg('');
        try {
            const { error } = await supabase.from('messages').insert({
                chat_path: chatPath,
                order_id: requestId,
                text: newMessage.trim(),
                sender_id: user.uid,
                sender_name: user.displayName || 'Piloto',
                sender_role: 'delivery',
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

    // Upload Media (Image compressed or Video)
    const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || !e.target.files[0] || !user || isChatLocked) return;
        const file = e.target.files[0];
        setUploadingMedia(true);
        const isVideo = file.type.startsWith('video/');
        const tId = toast.loading(isVideo ? 'Subiendo video...' : 'Optimizando y subiendo foto...');

        try {
            let uploadBlob: Blob = file;
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
                text: isVideo ? '🎥 [Video del piloto]' : '📷 [Foto del producto/comercio]',
                sender_id: user.uid,
                sender_name: user.displayName || 'Piloto',
                sender_role: 'delivery',
                created_at: new Date().toISOString()
            };

            if (isVideo) {
                insertPayload.video_url = publicUrl;
            } else {
                insertPayload.image_url = publicUrl;
            }

            await supabase.from('messages').insert(insertPayload);
            toast.success(isVideo ? 'Video enviado' : 'Foto enviada', { id: tId });
        } catch (err: any) {
            console.error("Error uploading media to chat:", err);
            toast.error('Error al subir archivo', { id: tId });
        } finally {
            setUploadingMedia(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    // Voice Note in Chat
    const handleStartVoice = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mr = new MediaRecorder(stream);
            mediaRecorderRef.current = mr;
            voiceChunksRef.current = [];

            mr.ondataavailable = (e) => {
                if (e.data.size > 0) voiceChunksRef.current.push(e.data);
            };

            mr.onstop = async () => {
                const audioBlob = new Blob(voiceChunksRef.current, { type: 'audio/webm' });
                stream.getTracks().forEach(t => t.stop());

                const tId = toast.loading('Enviando nota de voz...');
                try {
                    const audioPath = `chat_attachments/${requestId}_audio_${Date.now()}.webm`;
                    const { error: upErr } = await supabase.storage.from('store_assets').upload(audioPath, audioBlob, {
                        contentType: 'audio/webm',
                        upsert: true
                    });
                    if (upErr) throw upErr;

                    const { data: { publicUrl } } = supabase.storage.from('store_assets').getPublicUrl(audioPath);

                    await supabase.from('messages').insert({
                        chat_path: chatPath,
                        order_id: requestId,
                        text: '🎤 [Nota de voz del piloto]',
                        audio_url: publicUrl,
                        sender_id: user?.uid || 'driver',
                        sender_name: user?.displayName || 'Piloto',
                        sender_role: 'delivery',
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
            toast.error('No se pudo acceder al micrófono');
        }
    };

    const handleStopVoice = () => {
        if (mediaRecorderRef.current && isRecordingVoice) {
            mediaRecorderRef.current.stop();
            setIsRecordingVoice(false);
            if (voiceTimerRef.current) clearInterval(voiceTimerRef.current);
        }
    };

    const handleReportIssue = async (issueType: string) => {
        if (!user) return;
        setShowIssueModal(false);
        const tId = toast.loading('Notificando al cliente...');
        try {
            await supabase.from('messages').insert({
                chat_path: chatPath,
                order_id: requestId,
                text: `🚨 AVISO DEL PILOTO: ${issueType}`,
                action: 'merchant_issue',
                sender_id: user.uid,
                sender_name: user.displayName || 'Piloto',
                sender_role: 'delivery',
                created_at: new Date().toISOString()
            });
            toast.success('Novedad reportada al cliente', { id: tId });
        } catch (err) {
            toast.error('Error al reportar novedad', { id: tId });
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-900 text-white relative pointer-events-auto">
            {/* Header */}
            <div className="bg-slate-950 p-3.5 border-b border-slate-800 flex items-center justify-between sticky top-0 z-10 shadow-md">
                <div>
                    <h3 className="font-black text-amber-400 text-sm flex items-center gap-2">
                        Chat con el Cliente
                        {isCompleted && (
                            <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                                Modo Respaldo
                            </span>
                        )}
                    </h3>
                    <p className="text-[11px] font-bold text-slate-400">
                        {isCompleted ? 'Historial de comprobantes' : 'Pasa datos de pago y verifica captures'}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {!isChatLocked && (
                        <button
                            onClick={() => setShowIssueModal(true)}
                            className="px-2.5 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 text-[10px] font-black uppercase rounded-xl border border-rose-500/30 flex items-center gap-1 transition-all active:scale-95"
                            title="Reportar novedad"
                        >
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>Novedad</span>
                        </button>
                    )}
                    {onClose && (
                        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-800 text-slate-400 hover:text-white transition-all active:scale-90">
                            <ArrowLeft className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>

            {/* Banner de Retención de 48 Horas */}
            {isCompleted && (
                <div className={`p-2.5 px-3 border-b text-xs flex items-center gap-2 ${
                    isExpired 
                        ? 'bg-rose-950/40 border-rose-800 text-rose-300' 
                        : 'bg-amber-950/40 border-amber-800/80 text-amber-300'
                }`}>
                    <Clock className="w-4 h-4 shrink-0 text-amber-400" />
                    <p className="text-[11px] font-medium leading-tight">
                        {isExpired ? (
                            <span>El periodo de respaldo de 48 horas ha expirado.</span>
                        ) : (
                            <span>
                                <strong>Respaldo de 48 horas:</strong> Chat disponible para consulta de comprobantes por <strong>{hoursRemaining} horas más</strong>.
                            </span>
                        )}
                    </p>
                </div>
            )}

            {/* Pinned Muchacho e' Mandado Rule Banner */}
            <div className="bg-amber-500/10 p-2.5 px-3 border-b border-amber-500/20 flex items-start gap-2 text-[11px] text-amber-300 leading-tight">
                <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                    <strong>Cero intermediación:</strong> El cliente debe transferir directo al negocio por Pago Móvil y subir el comprobante aquí. Tú solo retiras con la captura aprobada y cobras tu tarifa acordada.
                </div>
            </div>

            {errorMsg && (
                <div className="bg-rose-500/10 text-rose-400 text-[10px] font-bold px-4 py-2 text-center border-b border-rose-500/20">
                    {errorMsg}
                </div>
            )}

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3.5 pt-4 pb-20">
                {messages.length === 0 ? (
                    <div className="text-center text-slate-500 font-medium text-xs mt-10 space-y-1">
                        <FileText className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                        <p>No hay mensajes en este chat.</p>
                        <p className="text-[11px]">Indica al cliente el monto de la compra o comparte fotos.</p>
                    </div>
                ) : (
                    messages.map((msg) => {
                        const isMine = msg.senderId === user?.uid || msg.senderRole === 'delivery';
                        const isAlert = msg.action === 'merchant_issue' || msg.text?.startsWith('🚨');

                        return (
                            <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 space-y-1.5 ${
                                    isAlert
                                        ? 'bg-rose-500/20 border border-rose-500/40 text-rose-200 rounded-2xl'
                                        : isMine
                                        ? 'bg-amber-400 text-slate-950 rounded-tr-sm font-medium shadow-md shadow-amber-400/10'
                                        : 'bg-slate-800 border border-slate-700 text-slate-200 rounded-tl-sm'
                                }`}>
                                    {/* Image Attachment */}
                                    {msg.imageUrl && (
                                        <a href={msg.imageUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-white/10">
                                            <img src={msg.imageUrl} alt="Adjunto" className="max-h-52 w-full object-cover hover:opacity-90 transition-opacity" />
                                        </a>
                                    )}

                                    {/* Video Attachment */}
                                    {msg.videoUrl && (
                                        <div className="overflow-hidden rounded-xl border border-white/10">
                                            <video controls src={msg.videoUrl} className="max-h-52 w-full object-cover" />
                                        </div>
                                    )}

                                    {/* Audio Attachment */}
                                    {msg.audioUrl && (
                                        <div className="p-2 bg-black/20 rounded-xl">
                                            <audio controls src={msg.audioUrl} className="w-full h-8" />
                                        </div>
                                    )}

                                    <p className="text-xs font-semibold leading-relaxed break-words">{msg.text}</p>
                                    <span className={`text-[9px] block font-bold ${isMine ? 'text-slate-950/60 text-right' : 'text-slate-400 text-left'}`}>
                                        {msg.createdAt?.toDate?.() ? msg.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                    </span>
                                </div>
                            </div>
                        );
                    })
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            {isChatLocked ? (
                <div className="p-3.5 bg-slate-950 border-t border-slate-800 text-center flex items-center justify-center gap-2 text-slate-400 text-xs font-bold">
                    <Lock className="w-3.5 h-3.5 text-amber-400" />
                    <span>Chat cerrado por servicio completado (Modo lectura de respaldo por 48h)</span>
                </div>
            ) : (
                <div className="p-3 bg-slate-950 border-t border-slate-800">
                    {isRecordingVoice ? (
                        <div className="flex items-center justify-between bg-rose-950/40 border-2 border-rose-500/50 rounded-2xl px-4 py-2.5">
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full bg-rose-500 animate-ping"></div>
                                <span className="text-xs font-black text-rose-400">
                                    Grabando audio... {voiceSeconds}s
                                </span>
                            </div>
                            <button
                                type="button"
                                onClick={handleStopVoice}
                                className="py-1 px-3 bg-rose-600 text-white font-black text-xs rounded-xl flex items-center gap-1.5 shadow-sm active:scale-95"
                            >
                                <Square className="w-3 h-3 fill-white" />
                                <span>Enviar</span>
                            </button>
                        </div>
                    ) : (
                        <form onSubmit={handleSendMessage} className="flex items-center gap-2 relative">
                            <input
                                type="file"
                                ref={fileInputRef}
                                accept="image/*,video/*"
                                onChange={handleMediaUpload}
                                className="hidden"
                            />

                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={uploadingMedia}
                                className="w-10 h-10 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center shrink-0 active:scale-95 transition-all"
                                title="Adjuntar foto o video"
                            >
                                <ImageIcon className="w-4 h-4" />
                            </button>

                            <button
                                type="button"
                                onClick={handleStartVoice}
                                className="w-10 h-10 rounded-full bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 active:scale-95 transition-all"
                                title="Grabar nota de voz"
                            >
                                <Mic className="w-4 h-4" />
                            </button>

                            <input
                                type="text"
                                value={newMessage}
                                onChange={(e) => setNewMessage(e.target.value)}
                                placeholder="Escribe al cliente..."
                                className="flex-1 bg-slate-900 border border-slate-800 rounded-full px-4 py-2.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400 font-medium"
                            />

                            <button
                                type="submit"
                                disabled={!newMessage.trim() || sending}
                                className="w-10 h-10 bg-amber-400 text-slate-950 rounded-full flex items-center justify-center shrink-0 disabled:opacity-40 hover:bg-amber-300 transition-colors shadow-sm active:scale-95"
                            >
                                <Send className="w-4 h-4 ml-0.5" />
                            </button>
                        </form>
                    )}
                </div>
            )}

            {/* Issue Modal */}
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
                                "Falta número de referencia de Pago Móvil"
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
