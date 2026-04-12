import React, { useState, useEffect, useRef } from 'react';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Send, Image as ImageIcon, CheckCircle, Receipt, Clock, CreditCard, Gift, Phone, Store } from 'lucide-react';
import toast from 'react-hot-toast';

interface Message {
  id: string;
  text: string;
  imageUrl?: string;
  senderId: string;
  senderName: string;
  senderRole: 'client' | 'restaurant' | 'system';
  createdAt: any;
  action?: 'payment_confirmed' | 'payment_reminder' | 'items_modified';
}

interface OrderChatWindowProps {
  orderId: string;
  currentUserRole: 'client' | 'restaurant' | 'cpanel';
  currentUserId: string;
  currentUserName: string;
  restaurantId: string;
  orderInfo: any; // Passing order details to display quick actions based on conditions
}

export default function OrderChatWindow({
  orderId,
  currentUserRole,
  currentUserId,
  currentUserName,
  restaurantId,
  orderInfo
}: OrderChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query(
      collection(db, `orders/${orderId}/messages`),
      orderBy('createdAt', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      })) as Message[];
      setMessages(msgs);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    });

    return () => unsubscribe();
  }, [orderId]);

  const handleSendMessage = async (text: string, actionUrl?: string, actionType?: 'payment_confirmed' | 'payment_reminder') => {
    if ((!text.trim() && !actionUrl && !actionType) || sending) return;
    setSending(true);

    try {
      await addDoc(collection(db, `orders/${orderId}/messages`), {
        text: text.trim(),
        imageUrl: actionUrl || null,
        action: actionType || null,
        senderId: currentUserId,
        senderName: currentUserName,
        senderRole: currentUserRole,
        createdAt: serverTimestamp()
      });
      setNewMessage('');
    } catch (error) {
      console.error(error);
      toast.error('Error al enviar mensaje');
    } finally {
      setSending(false);
    }
  };

  const confirmPayment = async () => {
    if (currentUserRole !== 'restaurant') return;
    
    // Add a system-like message
    await handleSendMessage('¡Pago confirmado! Empezaremos a procesar tu pedido inmediatamente.', undefined, 'payment_confirmed');
    
    // Update the order document
    try {
      await updateDoc(doc(db, 'orders', orderId), {
        restaurantPaymentClientConfirmed: true,
        status: 'preparing' // advances the order
      });
      toast.success('Pago confirmado. Orden avanzando a preparación.');
    } catch(e) {
      console.error(e);
      toast.error('Error al actualizar la orden');
    }
  };

  const renderMessageContent = (msg: Message) => {
    if (msg.action === 'payment_confirmed') {
      return (
        <div className="bg-emerald-100 border border-emerald-200 p-4 rounded-xl text-center shadow-sm w-full mx-8">
          <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
          <p className="text-emerald-800 font-bold text-sm leading-snug">{msg.text}</p>
        </div>
      );
    }
    return (
      <div className={`p-4 rounded-2xl max-w-[85%] ${
        msg.senderRole === currentUserRole 
          ? 'bg-primary text-slate-900 rounded-tr-none ml-auto shadow-md shadow-primary/20' 
          : 'bg-white border border-slate-100 text-slate-700 rounded-tl-none mr-auto shadow-sm'
      }`}>
        <p className="text-[10px] font-black opacity-50 mb-1 uppercase tracking-wider">{msg.senderName}</p>
        <p className="text-sm font-bold leading-relaxed whitespace-pre-wrap">{msg.text}</p>
        {msg.imageUrl && (
            <div className="mt-2 text-center">
              <a href={msg.imageUrl} target="_blank" rel="noreferrer">
                <img src={msg.imageUrl} alt="attachment" className="max-w-full rounded-xl max-h-48 object-contain bg-slate-50 border border-slate-100"/>
              </a>
            </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-[500px] bg-slate-50 rounded-3xl overflow-hidden border-2 border-slate-200 shadow-xl">
      {/* Chat header */}
      <div className="bg-white p-4 border-b border-slate-200 flex items-center justify-between z-10 shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${currentUserRole === 'client' ? 'bg-primary/20 text-slate-900' : 'bg-slate-900 text-white'}`}>
             {currentUserRole === 'client' ? <Store className="w-6 h-6" /> : <Receipt className="w-6 h-6" />}
          </div>
          <div>
            <h3 className="font-black text-slate-900 leading-none">
              {currentUserRole === 'client' ? 'Atención al Cliente' : orderInfo?.userName || 'Cliente'}
            </h3>
            <p className="text-[10px] text-slate-500 font-bold uppercase mt-1 tracking-widest flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              {currentUserRole === 'client' ? 'En línea' : 'Chat Seguro'}
            </p>
          </div>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-slate-400 font-medium text-sm mt-10">
            Aún no hay mensajes. Escribe para comenzar la conversación.
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className="flex">
            {renderMessageContent(msg)}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Actions (only for restaurants) */}
      {currentUserRole === 'restaurant' && !orderInfo?.restaurantPaymentClientConfirmed && (
        <div className="bg-white p-3 border-t border-slate-200 flex items-center gap-2 overflow-x-auto whitespace-nowrap scrollbar-hide shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-10 w-full">
          <button 
            onClick={() => handleSendMessage("¡Gracias por elegirnos! En este momento serás atendido por uno de nuestros cajeros para confirmar la existencia de cada ítem de tu pedido. ¡Lo haremos en un 2x3!")}
            className="shrink-0 bg-slate-100 border border-slate-200 px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 active:scale-95 transition-all"
          >
            👋 Bienvenida
          </button>
          <button 
            onClick={() => handleSendMessage("Por favor, ayúdame con el capture (captura de pantalla) de tu pago móvil / transferencia para verificarlo.")}
            className="shrink-0 bg-slate-100 border border-slate-200 px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 active:scale-95 transition-all"
          >
            📸 Pedir Capture
          </button>
          <button 
            onClick={() => handleSendMessage("Puedes realizar tu pago a través de Cashea. Si necesitas nuestro QR, avísanos para enviártelo o búscanos directo en el app.")}
            className="shrink-0 bg-slate-100 border border-slate-200 px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 active:scale-95 transition-all"
          >
            🛍️ Cashea
          </button>
          <button 
            onClick={() => handleSendMessage("¿Deseas recompensarte hoy? Puedes usar los puntos de fidelidad que has acumulado con nosotros para pagar parcial o totalmente tu orden. ¡Confírmanos!")}
            className="shrink-0 bg-purple-100 border border-purple-200 px-4 py-2 rounded-xl text-xs font-bold text-purple-700 hover:bg-purple-200 active:scale-95 transition-all"
          >
            ⭐ Premiar Fidelidad
          </button>
          <button 
            onClick={() => confirmPayment()}
            className="shrink-0 bg-emerald-500 border-b-4 border-emerald-700 px-4 py-2 rounded-xl text-xs font-black text-white hover:brightness-110 active:border-b-0 active:translate-y-1 transition-all flex items-center gap-2 ml-auto"
          >
            <CheckCircle className="w-4 h-4" /> CONFIRMAR PAGO
          </button>
        </div>
      )}

      {/* Input area */}
      {(currentUserRole === 'client' || currentUserRole === 'restaurant') && !orderInfo?.restaurantPaymentClientConfirmed && (
        <div className="p-4 bg-white border-t border-slate-200 shrink-0">
          <div className="flex items-end gap-2">
            <div className="flex-1 bg-slate-50 rounded-2xl border-2 border-slate-100 relative focus-within:border-primary focus-within:bg-white transition-all p-1">
              <textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder={currentUserRole === 'client' ? "Escribe un mensaje al restaurante..." : "Escribe un mensaje al cliente..."}
                className="w-full bg-transparent p-3 outline-none min-h-[44px] max-h-32 text-sm font-bold text-slate-700 resize-none"
                rows={1}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage(newMessage);
                  }
                }}
              />
            </div>
            <button
              onClick={() => handleSendMessage(newMessage)}
              disabled={sending || !newMessage.trim()}
              className="w-14 h-14 bg-primary rounded-2xl flex items-center justify-center text-slate-900 shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-95 disabled:opacity-50 transition-all shrink-0 border border-primary"
            >
              <Send className="w-6 h-6 ml-1" />
            </button>
          </div>
          {currentUserRole === 'client' && (
            <p className="text-[10px] text-slate-400 font-bold uppercase mt-3 text-center tracking-wide flex items-center justify-center gap-1">
              <ImageIcon className="w-3 h-3"/> Organiza tu pago comunicandote en el chat
            </p>
          )}
        </div>
      )}
    </div>
  );
}
