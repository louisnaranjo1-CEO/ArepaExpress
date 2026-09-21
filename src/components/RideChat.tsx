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
    FileText 
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
}

export default function RideChat({ 
    requestId, 
    onClose, 
    readOnly = false, 
    serviceCategory,
    requestStatus,
    completedAt
}: ChatProps) {
    const { user } = useAuth();
    const [messages, setMessages] = useState<any[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [sending, setSending] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [uploadingMedia, setUploadingMedia] = useState(false);

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
            .channel(`ride_chat_${requestId}`)
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
            const uid = user?.id || user?.uid || 'passenger';
            const { error } = await supabase.from('messages').insert({
                chat_path: chatPath,
                order_id: requestId,
                text: newMessage.trim(),
                sender_id: uid,
                sender_name: user?.displayName || 'Pasajero',
                sender_role: 'client',
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
            const uid = user?.id || user?.uid || 'passenger';
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
                text: isVideo ? '🎥 [Video adjunto]' : '📷 [Comprobante de compra o foto adjunta]',
                sender_id: uid,
                sender_name: user?.displayName || 'Pasajero',
                sender_role: 'client',
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
                    const uid = user?.id || user?.uid || 'passenger';
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
                        text: '🎤 [Nota de voz]',
                        audio_url: publicUrl,
                        sender_id: uid,
                        sender_name: user?.displayName || 'Pasajero',
                        sender_role: 'client',
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

    return (
        <div className="flex flex-col h-full bg-slate-50 relative pointer-events-auto">
            {/* Header */}
            <div className="bg-white p-3.5 border-b border-slate-200 flex items-center justify-between sticky top-0 z-10 shadow-sm">
                <div>
                    <h3 className="font-black text-slate-800 text-sm flex items-center gap-1.5">
                        Chat de Servicio Un 2x3
                        {isCompleted && (
                            <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                                Modo Respaldo
                            </span>
                        )}
                    </h3>
                    <p className="text-[11px] font-bold text-slate-500">
                        {isCompleted ? 'Historial de comprobantes y conversación' : 'Comunícate en tiempo real de forma segura'}
                    </p>
                </div>
                {onClose && (
                    <button 
                        onClick={onClose} 
                        className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 shadow-sm transition-all active:scale-90"
                    >
                        <ArrowLeft className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* Banner de Retención de 48 Horas */}
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
                                <strong>Respaldo de 48 horas:</strong> Este chat permanecerá disponible para lectura y consulta de comprobantes por <strong>{hoursRemaining} horas más</strong>.
                            </span>
                        )}
                    </p>
                </div>
            )}

            {/* Pinned Muchacho e' Mandado Rule Banner */}
            {(serviceCategory === 'mandado' || serviceCategory === 'muchacho_mandado' || !isCompleted) && (
                <div className="bg-gradient-to-r from-amber-50 to-orange-50 p-2.5 px-3 border-b border-amber-200/80 flex items-start gap-2 text-[11px] text-amber-900 leading-tight">
                    <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                        <strong>Norma de Seguridad:</strong> Transfiere el costo de la compra directamente a la cuenta del negocio por Pago Móvil y sube el capture aquí para que el conductor retire tu encargo. Al finalizar, pagas la tarifa al piloto.
                    </div>
                </div>
            )}

            {errorMsg && (
                <div className="bg-red-50 text-red-600 text-[10px] font-bold px-4 py-2 text-center border-b border-red-100">
                    {errorMsg}
                </div>
            )}

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3.5 pt-4 pb-20">
                {messages.length === 0 ? (
                    <div className="text-center text-slate-400 font-medium text-xs mt-10 space-y-1">
                        <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                        <p>No hay mensajes aún.</p>
                        <p className="text-[11px]">¡Envía un mensaje o capture de tu Pago Móvil!</p>
                    </div>
                ) : (
                    messages.map((msg) => {
                        const isMine = msg.senderId === (user?.id || user?.uid || 'passenger') || msg.senderRole === 'client';
                        const isAlert = msg.action === 'merchant_issue' || msg.text?.startsWith('🚨');

                        return (
                            <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 space-y-1.5 ${
                                    isAlert
                                        ? 'bg-red-50 text-red-900 border border-red-200 rounded-2xl shadow-sm'
                                        : isMine
                                        ? 'bg-[#FFB800] text-slate-950 rounded-tr-sm shadow-md shadow-amber-500/20'
                                        : 'bg-white border border-slate-200 text-slate-800 rounded-tl-sm shadow-sm'
                                }`}>
                                    {/* Image Attachment */}
                                    {msg.imageUrl && (
                                        <a href={msg.imageUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-black/10">
                                            <img src={msg.imageUrl} alt="Adjunto" className="max-h-52 w-full object-cover hover:opacity-95 transition-opacity" />
                                        </a>
                                    )}

                                    {/* Video Attachment */}
                                    {msg.videoUrl && (
                                        <div className="overflow-hidden rounded-xl border border-black/10">
                                            <video controls src={msg.videoUrl} className="max-h-52 w-full object-cover" />
                                        </div>
                                    )}

                                    {/* Audio Attachment */}
                                    {msg.audioUrl && (
                                        <div className="p-2 bg-black/5 rounded-xl">
                                            <audio controls src={msg.audioUrl} className="w-full h-8" />
                                        </div>
                                    )}

                                    <p className="text-xs font-medium leading-relaxed break-words">{msg.text}</p>
                                    <span className={`text-[9px] block font-bold ${isMine ? 'text-black/50 text-right' : 'text-slate-400 text-left'}`}>
                                        {msg.createdAt?.toDate?.() ? msg.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                    </span>
                                </div>
                            </div>
                        );
                    })
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area (Disabled if Completed / ReadOnly) */}
            {isChatLocked ? (
                <div className="p-3.5 bg-slate-100 border-t border-slate-200 text-center flex items-center justify-center gap-2 text-slate-500 text-xs font-bold">
                    <Lock className="w-3.5 h-3.5" />
                    <span>Chat cerrado por servicio completado (Modo lectura de respaldo por 48h)</span>
                </div>
            ) : (
                <div className="p-3 bg-white border-t border-slate-200">
                    {/* Recording Bar */}
                    {isRecordingVoice ? (
                        <div className="flex items-center justify-between bg-rose-50 border-2 border-rose-300 rounded-2xl px-4 py-2.5">
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full bg-rose-600 animate-ping"></div>
                                <span className="text-xs font-black text-rose-600">
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
                            {/* Hidden file input for images & videos */}
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
                                className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center shrink-0 active:scale-95 transition-all"
                                title="Adjuntar captura de pago móvil, foto o video"
                            >
                                <ImageIcon className="w-4 h-4" />
                            </button>

                            {/* Record Voice button */}
                            <button
                                type="button"
                                onClick={handleStartVoice}
                                className="w-10 h-10 rounded-full bg-amber-50 hover:bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 active:scale-95 transition-all"
                                title="Grabar nota de voz"
                            >
                                <Mic className="w-4 h-4" />
                            </button>

                            <input
                                type="text"
                                value={newMessage}
                                onChange={(e) => setNewMessage(e.target.value)}
                                placeholder="Escribe un mensaje o envía capture..."
                                className="flex-1 bg-slate-50 border border-slate-200 rounded-full px-4 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400 font-medium"
                            />

                            <button
                                type="submit"
                                disabled={!newMessage.trim() || sending}
                                className="w-10 h-10 bg-[#FFB800] text-slate-950 rounded-full flex items-center justify-center shrink-0 disabled:opacity-40 hover:bg-amber-400 transition-colors shadow-sm active:scale-95"
                            >
                                <Send className="w-4 h-4 ml-0.5" />
                            </button>
                        </form>
                    )}
                </div>
            )}
        </div>
    );
}
