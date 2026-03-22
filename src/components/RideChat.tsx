import React, { useState, useEffect, useRef } from 'react';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { Send, X } from 'lucide-react';

interface ChatProps {
    requestId: string;
    onClose?: () => void;
    readOnly?: boolean;
}

export default function RideChat({ requestId, onClose, readOnly = false }: ChatProps) {
    const { user } = useAuth();
    const [messages, setMessages] = useState<any[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!requestId) return;

        const q = query(
            collection(db, `transport_requests/${requestId}/messages`),
            orderBy('createdAt', 'asc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const msgs = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setMessages(msgs);
        });

        return () => unsubscribe();
    }, [requestId]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !user) return;

        try {
            await addDoc(collection(db, `transport_requests/${requestId}/messages`), {
                text: newMessage,
                senderId: user.uid,
                createdAt: serverTimestamp()
            });
            setNewMessage('');
        } catch (error) {
            console.error("Error sending message:", error);
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-50 relative">
            {/* Header */}
            <div className="bg-white p-4 border-b border-slate-200 flex items-center justify-between sticky top-0 z-10 shadow-sm">
                <div>
                    <h3 className="font-black text-slate-800">Chat del Viaje</h3>
                    <p className="text-xs font-bold text-slate-500">Comunícate en tiempo real</p>
                </div>
                {onClose && (
                    <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200">
                        <X className="w-5 h-5" />
                    </button>
                )}
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 pt-6">
                {messages.length === 0 ? (
                    <div className="text-center text-slate-500 font-medium text-sm mt-10">
                        No hay mensajes aún. <br /> ¡Di hola!
                    </div>
                ) : (
                    messages.map((msg) => {
                        const isMine = msg.senderId === user?.uid;
                        return (
                            <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[80%] rounded-2xl px-4 py-2 ${isMine
                                        ? 'bg-indigo-600 text-white rounded-tr-sm shadow-md shadow-indigo-600/20'
                                        : 'bg-white border border-slate-200 text-slate-800 rounded-tl-sm shadow-sm'
                                    }`}>
                                    <p className="text-sm font-medium">{msg.text}</p>
                                    <span className={`text-[10px] block mt-1 font-bold ${isMine ? 'text-indigo-200 text-right' : 'text-slate-400 text-left'}`}>
                                        {msg.createdAt?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
                <div className="p-4 bg-white border-t border-slate-200">
                    <form onSubmit={handleSendMessage} className="flex gap-2 relative">
                        <input
                            type="text"
                            value={newMessage}
                            onChange={(e) => setNewMessage(e.target.value)}
                            placeholder="Escribe un mensaje..."
                            className="flex-1 bg-slate-50 border border-slate-200 rounded-full px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600/50 pr-12 font-medium"
                        />
                        <button
                            type="submit"
                            disabled={!newMessage.trim()}
                            className="absolute right-1 top-1 w-10 h-10 bg-indigo-600 text-white rounded-full flex items-center justify-center disabled:opacity-50 disabled:bg-slate-300 hover:bg-indigo-700 transition-colors shadow-sm"
                        >
                            <Send className="w-4 h-4 ml-0.5" />
                        </button>
                    </form>
                </div>
            )}
        </div>
    );
}
