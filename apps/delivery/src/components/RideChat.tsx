import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Send, ArrowLeft, Image as ImageIcon, AlertTriangle, ShieldCheck, X } from 'lucide-react';
import toast from 'react-hot-toast';

interface ChatProps {
    requestId: string;
    onClose?: () => void;
    readOnly?: boolean;
    serviceCategory?: string;
    isDriver?: boolean;
}

export default function RideChat({ requestId, onClose, readOnly = false, serviceCategory, isDriver = true }: ChatProps) {
    const { user } = useAuth();
    const [messages, setMessages] = useState<any[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [sending, setSending] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [uploadingImage, setUploadingImage] = useState(false);
    const [showIssueModal, setShowIssueModal] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const chatPath = `transport_requests/${requestId}`;

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
                            action: d.action,
                            senderId: d.sender_id || d.senderId,
                            senderName: d.sender_name || d.senderName,
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
        };
    }, [requestId, chatPath]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !user || sending) return;

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

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || !e.target.files[0] || !user) return;
        const file = e.target.files[0];
        setUploadingImage(true);
        const tId = toast.loading('Subiendo imagen...');
        try {
            const ext = file.name.split('.').pop() || 'jpg';
            const filePath = `chat_attachments/${requestId}_${Date.now()}.${ext}`;
            const { error: upErr } = await supabase.storage.from('store_assets').upload(filePath, file, { upsert: true });
            if (upErr) throw upErr;

            const { data: { publicUrl } } = supabase.storage.from('store_assets').getPublicUrl(filePath);

            await supabase.from('messages').insert({
                chat_path: chatPath,
                order_id: requestId,
                text: '📷 [Foto / Comprobante adjunto]',
                image_url: publicUrl,
                sender_id: user.uid,
                sender_name: user.displayName || 'Piloto',
                sender_role: 'delivery',
                created_at: new Date().toISOString()
            });

            toast.success('Imagen enviada', { id: tId });
        } catch (err: any) {
            console.error("Error uploading image to chat:", err);
            toast.error('Error al subir imagen', { id: tId });
        } finally {
            setUploadingImage(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleReportIssue = async (issueText: string) => {
        if (!user) return;
        setShowIssueModal(false);
        const tId = toast.loading('Reportando inconveniente...');
        try {
            await supabase.from('messages').insert({
                chat_path: chatPath,
                order_id: requestId,
                text: `🚨 [NOVEDAD EN COMERCIO] Conductor reporta: "${issueText}". Por favor coordinar por este chat.`,
                action: 'merchant_issue',
                sender_id: user.uid,
                sender_name: user.displayName || 'Piloto',
                sender_role: 'delivery',
                created_at: new Date().toISOString()
            });
            toast.success('Novedad reportada en el chat', { id: tId });
        } catch (err) {
            console.error(err);
            toast.error('Error al enviar reporte', { id: tId });
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-50 relative pointer-events-auto">
            {/* Header */}
            <div className="bg-white p-3.5 border-b border-slate-200 flex items-center justify-between sticky top-0 z-10 shadow-sm">
                <div>
                    <h3 className="font-black text-slate-800 text-sm">Chat de Servicio Un 2x3</h3>
                    <p className="text-[11px] font-bold text-slate-500">Comunícate en tiempo real</p>
                </div>
                <div className="flex items-center gap-1.5">
                    {isDriver && (
                        <button
                            onClick={() => setShowIssueModal(true)}
                            className="px-2.5 py-1.5 bg-red-50 text-red-600 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1 border border-red-200 active:scale-95"
                            title="Reportar problema en comercio"
                        >
                            <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                            Reportar Novedad
                        </button>
                    )}
                    {onClose && (
                        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 shadow-sm transition-all active:scale-90">
                            <ArrowLeft className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>

            {/* Pinned Muchacho e' Mandado Rule Banner */}
            {(serviceCategory === 'mandado' || true) && (
                <div className="bg-gradient-to-r from-amber-50 to-orange-50 p-2.5 px-3 border-b border-amber-200/80 flex items-start gap-2 text-[11px] text-amber-900 leading-tight">
                    <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                        <strong>Norma Muchacho e' Mandado:</strong> El cliente paga la compra directo a la tienda por Pago Móvil y envía el capture aquí. El conductor solo cobra su tarifa de mandado.
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
                    <div className="text-center text-slate-400 font-medium text-xs mt-10">
                        No hay mensajes aún. <br /> ¡Envía un mensaje o capture de pago!
                    </div>
                ) : (
                    messages.map((msg) => {
                        const isMine = msg.senderId === user?.uid;
                        const isAlert = msg.action === 'merchant_issue' || msg.text?.startsWith('🚨');

                        return (
                            <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 space-y-1.5 ${
                                    isAlert
                                        ? 'bg-red-50 text-red-900 border border-red-200 rounded-2xl shadow-sm'
                                        : isMine
                                        ? 'bg-amber-400 text-slate-900 rounded-tr-sm shadow-md shadow-amber-400/20'
                                        : 'bg-white border border-slate-200 text-slate-800 rounded-tl-sm shadow-sm'
                                }`}>
                                    {msg.imageUrl && (
                                        <a href={msg.imageUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl">
                                            <img src={msg.imageUrl} alt="Adjunto" className="max-h-48 w-full object-cover hover:opacity-95 transition-opacity" />
                                        </a>
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

            {/* Input Area */}
            {!readOnly && (
                <div className="p-3 bg-white border-t border-slate-200">
                    <form onSubmit={handleSendMessage} className="flex items-center gap-2 relative">
                        <input
                            type="file"
                            ref={fileInputRef}
                            accept="image/*"
                            onChange={handleImageUpload}
                            className="hidden"
                        />
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploadingImage}
                            className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center shrink-0 active:scale-95 transition-all"
                            title="Adjuntar comprobante o foto"
                        >
                            <ImageIcon className="w-4 h-4" />
                        </button>

                        <input
                            type="text"
                            value={newMessage}
                            onChange={(e) => setNewMessage(e.target.value)}
                            placeholder="Escribe un mensaje..."
                            className="flex-1 bg-slate-50 border border-slate-200 rounded-full px-4 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400/50 font-medium"
                        />

                        <button
                            type="submit"
                            disabled={!newMessage.trim() || sending}
                            className="w-10 h-10 bg-amber-400 text-slate-900 rounded-full flex items-center justify-center shrink-0 disabled:opacity-40 hover:bg-amber-500 transition-colors shadow-sm active:scale-95"
                        >
                            <Send className="w-4 h-4 ml-0.5" />
                        </button>
                    </form>
                </div>
            )}

            {/* Modal: Reportar Inconveniente en Comercio */}
            {showIssueModal && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl w-full max-w-sm p-5 space-y-4 shadow-2xl animate-fade-in relative">
                        <button
                            onClick={() => setShowIssueModal(false)}
                            className="absolute top-4 right-4 w-7 h-7 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center hover:bg-slate-200"
                        >
                            <X className="w-4 h-4" />
                        </button>

                        <div className="flex items-center gap-2 text-red-600">
                            <AlertTriangle className="w-5 h-5" />
                            <h4 className="font-black text-slate-800 text-sm">Reportar en Comercio</h4>
                        </div>
                        <p className="text-xs text-slate-500">
                            Selecciona la novedad que ocurre en el punto de compra o recogida:
                        </p>

                        <div className="space-y-2 pt-1">
                            {[
                                "Comercio o tienda cerrado",
                                "Producto agotado / no disponible",
                                "Sobreprecio o precio diferente al acordado",
                                "Demora excesiva en preparación (+30 min)",
                                "Comercio no acepta Pago Móvil"
                            ].map((issue, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => handleReportIssue(issue)}
                                    className="w-full text-left p-3 rounded-2xl bg-slate-50 hover:bg-red-50 text-slate-700 hover:text-red-700 text-xs font-bold transition-all border border-slate-200/80 active:scale-98"
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
