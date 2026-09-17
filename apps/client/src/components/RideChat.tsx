import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Send, ArrowLeft, Image as ImageIcon, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';

interface ChatProps {
    requestId: string;
    onClose?: () => void;
    readOnly?: boolean;
    serviceCategory?: string;
}

export default function RideChat({ requestId, onClose, readOnly = false, serviceCategory }: ChatProps) {
    const { user } = useAuth();
    const [messages, setMessages] = useState<any[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [sending, setSending] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [uploadingImage, setUploadingImage] = useState(false);
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
        if (!newMessage.trim() || sending) return;

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

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || !e.target.files[0]) return;
        const file = e.target.files[0];
        setUploadingImage(true);
        const tId = toast.loading('Subiendo comprobante / imagen...');
        try {
            const ext = file.name.split('.').pop() || 'jpg';
            const uid = user?.id || user?.uid || 'passenger';
            const filePath = `chat_attachments/${requestId}_${Date.now()}.${ext}`;
            const { error: upErr } = await supabase.storage.from('store_assets').upload(filePath, file, { upsert: true });
            if (upErr) throw upErr;

            const { data: { publicUrl } } = supabase.storage.from('store_assets').getPublicUrl(filePath);

            await supabase.from('messages').insert({
                chat_path: chatPath,
                order_id: requestId,
                text: '📷 [Comprobante de compra o foto adjunta]',
                image_url: publicUrl,
                sender_id: uid,
                sender_name: user?.displayName || 'Pasajero',
                sender_role: 'client',
                created_at: new Date().toISOString()
            });

            toast.success('Comprobante enviado al conductor', { id: tId });
        } catch (err: any) {
            console.error("Error uploading image to chat:", err);
            toast.error('Error al subir imagen', { id: tId });
        } finally {
            setUploadingImage(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-50 relative pointer-events-auto">
            {/* Header */}
            <div className="bg-white p-3.5 border-b border-slate-200 flex items-center justify-between sticky top-0 z-10 shadow-sm">
                <div>
                    <h3 className="font-black text-slate-800 text-sm">Chat de Viaje Un 2x3</h3>
                    <p className="text-[11px] font-bold text-slate-500">Comunícate en tiempo real</p>
                </div>
                {onClose && (
                    <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 shadow-sm transition-all active:scale-90">
                        <ArrowLeft className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* Pinned Muchacho e' Mandado Rule Banner */}
            {(serviceCategory === 'mandado' || true) && (
                <div className="bg-gradient-to-r from-amber-50 to-orange-50 p-2.5 px-3 border-b border-amber-200/80 flex items-start gap-2 text-[11px] text-amber-900 leading-tight">
                    <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                        <strong>Norma Muchacho e' Mandado:</strong> Paga el valor de tu compra directamente a la tienda por Pago Móvil y sube aquí la captura para que tu conductor retire el encargo. El conductor solo cobrará el favor/mandado.
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
                        No hay mensajes aún. <br /> ¡Envía un mensaje o capture de tu Pago Móvil!
                    </div>
                ) : (
                    messages.map((msg) => {
                        const isMine = msg.senderId === (user?.id || user?.uid || 'passenger') || msg.sender_role === 'client';
                        const isAlert = msg.action === 'merchant_issue' || msg.text?.startsWith('🚨');

                        return (
                            <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 space-y-1.5 ${
                                    isAlert
                                        ? 'bg-red-50 text-red-900 border border-red-200 rounded-2xl shadow-sm'
                                        : isMine
                                        ? 'bg-primary text-slate-900 rounded-tr-sm shadow-md shadow-primary/20'
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
                            title="Adjuntar captura de pago móvil o foto"
                        >
                            <ImageIcon className="w-4 h-4" />
                        </button>

                        <input
                            type="text"
                            value={newMessage}
                            onChange={(e) => setNewMessage(e.target.value)}
                            placeholder="Escribe un mensaje o envía capture..."
                            className="flex-1 bg-slate-50 border border-slate-200 rounded-full px-4 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50 font-medium"
                        />

                        <button
                            type="submit"
                            disabled={!newMessage.trim() || sending}
                            className="w-10 h-10 bg-primary text-slate-900 rounded-full flex items-center justify-center shrink-0 disabled:opacity-40 hover:bg-primary transition-colors shadow-sm active:scale-95"
                        >
                            <Send className="w-4 h-4 ml-0.5" />
                        </button>
                    </form>
                </div>
            )}
        </div>
    );
}
