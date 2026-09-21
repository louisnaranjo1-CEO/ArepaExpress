import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { Send, Image as ImageIcon, CheckCircle, Receipt, Clock, CreditCard, Gift, Phone, Store, Bike, Paperclip, AlertTriangle, RefreshCw, Plus, X, MessageCircle, Copy, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface Message {
  id: string;
  text: string;
  imageUrl?: string;
  senderId: string;
  senderName: string;
  senderRole: 'client' | 'restaurant' | 'system' | 'delivery';
  createdAt: any;
  action?: 'payment_confirmed' | 'payment_reminder' | 'items_modified';
}

interface OrderChatWindowProps {
  orderId: string;
  currentUserRole: 'client' | 'restaurant' | 'cpanel' | 'delivery' | 'cashier';
  currentUserId: string;
  currentUserName: string;
  restaurantId: string;
  orderInfo: any;
  customCollectionPath?: string;
}

export default function OrderChatWindow({
  orderId,
  currentUserRole,
  currentUserId,
  currentUserName,
  restaurantId,
  orderInfo,
  customCollectionPath
}: OrderChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [casheaQrUrl, setCasheaQrUrl] = useState<string | null>(null);
  const [showItemsList, setShowItemsList] = useState(true);
  const [orderItems, setOrderItems] = useState<any[]>(orderInfo?.items || []);
  const [substitutingItem, setSubstitutingItem] = useState<any | null>(null);
  const [restaurantProducts, setRestaurantProducts] = useState<any[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [showSubstituteModal, setShowSubstituteModal] = useState(false);
  const [waTimeoutPassed, setWaTimeoutPassed] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isStoreRole = currentUserRole === 'restaurant' || (currentUserRole as string) === 'cashier';

  useEffect(() => {
    if (orderInfo?.items) {
      setOrderItems(orderInfo.items);
    }
  }, [orderInfo?.items]);

  useEffect(() => {
    // WhatsApp fallback timer: after 90 seconds (1.5 min) without recent store response
    const timer = setTimeout(() => {
      setWaTimeoutPassed(true);
    }, 90000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const fetchRestaurantData = async () => {
      if (!restaurantId) return;
      try {
        const { data: resDoc } = await supabase
          .from('comercios')
          .select('cashea_qr_url, casheaQrUrl')
          .eq('id', restaurantId)
          .maybeSingle();

        if (resDoc && (resDoc.cashea_qr_url || resDoc.casheaQrUrl)) {
          setCasheaQrUrl(resDoc.cashea_qr_url || resDoc.casheaQrUrl);
        }
      } catch (e) { console.error("Error fetching cashea QR", e); }
    };
    fetchRestaurantData();
  }, [restaurantId]);

  useEffect(() => {
    const fetchMessages = async () => {
      try {
        let queryBuilder = supabase
          .from('messages')
          .select('*')
          .order('created_at', { ascending: true });

        if (customCollectionPath) {
          queryBuilder = queryBuilder.eq('chat_path', customCollectionPath);
        } else {
          queryBuilder = queryBuilder.eq('order_id', orderId);
        }

        const { data, error } = await queryBuilder;
        if (error) throw error;
        if (data) {
          setMessages(data.map((d: any) => ({
            id: d.id,
            text: d.text,
            imageUrl: d.image_url || d.imageUrl,
            senderId: d.sender_id || d.senderId,
            senderName: d.sender_name || d.senderName,
            senderRole: d.sender_role || d.senderRole,
            createdAt: d.created_at,
            action: d.action
          })));
          setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        }
      } catch (err) {
        console.error("Error loading chat messages:", err);
      }
    };

    fetchMessages();

    const channelName = `chat_${orderId || customCollectionPath || 'default'}`;
    const filterField = customCollectionPath ? 'chat_path' : 'order_id';
    const filterVal = customCollectionPath || orderId;

    const channel = supabase.channel(channelName)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'messages',
        filter: `${filterField}=eq.${filterVal}`
      }, () => {
        fetchMessages();
      })
      .subscribe();

    // Also listen to order updates for stock and status changes
    const orderSub = supabase.channel(`order_chat_sync_${orderId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'orders',
        filter: `id=eq.${orderId}`
      }, (payload) => {
        if (payload.new && (payload.new as any).items) {
          setOrderItems((payload.new as any).items);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(orderSub);
    };
  }, [orderId, customCollectionPath]);

  const handleSendMessage = async (text: string, actionUrl?: string, actionType?: 'payment_confirmed' | 'payment_reminder' | 'items_modified') => {
    if ((!text.trim() && !actionUrl && !actionType) || sending) return;
    setSending(true);

    try {
      await supabase.from('messages').insert({
        order_id: orderId,
        chat_path: customCollectionPath || null,
        text: text.trim(),
        image_url: actionUrl || null,
        action: actionType || null,
        sender_id: currentUserId,
        sender_name: currentUserName,
        sender_role: currentUserRole === 'cashier' ? 'restaurant' : currentUserRole,
        created_at: new Date().toISOString()
      });
      setNewMessage('');
    } catch (error) {
      console.error(error);
      toast.error('Error al enviar mensaje');
    } finally {
      setSending(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSending(true);
    try {
      const fileExt = file.name.split('.').pop() || 'jpg';
      const fileName = `receipt_${orderId}_${Date.now()}.${fileExt}`;
      const filePath = `order_chat/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file);

      if (uploadError) {
        // Fallback to base64 data URL
        const reader = new FileReader();
        reader.onload = async () => {
          const base64 = reader.result as string;
          await handleSendMessage('📸 Comprobante de pago / Foto adjunta:', base64);
        };
        reader.readAsDataURL(file);
      } else {
        const { data: { publicUrl } } = supabase.storage
          .from('documents')
          .getPublicUrl(filePath);
        await handleSendMessage('📸 Comprobante de pago / Foto adjunta:', publicUrl);
      }
      toast.success('Comprobante enviado al chat');
    } catch (err) {
      console.error(err);
      toast.error('Error al subir imagen');
    } finally {
      setSending(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleToggleSoldOut = async (itemId: string, currentSoldOut: boolean) => {
    const updatedItems = orderItems.map(it => it.id === itemId ? { ...it, isSoldOut: !currentSoldOut } : it);
    setOrderItems(updatedItems);

    const missing = updatedItems.filter(it => it.isSoldOut).map(it => it.id);
    const targetItem = orderItems.find(it => it.id === itemId);

    try {
      await supabase.from('orders').update({
        items: updatedItems,
        missing_items: missing,
        missingItems: missing,
        updated_at: new Date().toISOString()
      }).eq('id', orderId);

      if (!currentSoldOut) {
        await handleSendMessage(
          `⚠️ El producto "${targetItem?.name || 'solicitado'}" ha sido marcado como AGOTADO por el negocio. Puedes sustituirlo pulsando "Sustituir producto".`,
          undefined,
          'items_modified'
        );
        toast.success('Producto marcado como agotado');
      } else {
        await handleSendMessage(`✅ El producto "${targetItem?.name || 'solicitado'}" vuelve a estar disponible.`);
        toast.success('Producto restablecido como disponible');
      }
    } catch (e) {
      console.error(e);
      toast.error('Error al actualizar disponibilidad');
    }
  };

  const handleOpenSubstituteModal = async (item: any) => {
    setSubstitutingItem(item);
    setShowSubstituteModal(true);
    setLoadingProducts(true);
    try {
      const { data: prods } = await supabase
        .from('products')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .eq('available', true);
      setRestaurantProducts(prods || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingProducts(false);
    }
  };

  const handleSelectReplacement = async (newProduct: any) => {
    if (!substitutingItem) return;
    const updatedItems = orderItems.map(it => {
      if (it.id === substitutingItem.id) {
        return {
          id: `prod_${newProduct.id}_${Date.now()}`,
          productId: newProduct.id,
          restaurantId: newProduct.restaurant_id || restaurantId,
          name: newProduct.name,
          price: newProduct.price,
          quantity: substitutingItem.quantity || 1,
          image: newProduct.image || newProduct.image_url || '',
          category: newProduct.category || '',
          isSoldOut: false
        };
      }
      return it;
    });

    const newSubtotal = updatedItems.reduce((sum, it) => sum + ((it.price || 0) * (it.quantity || 1)), 0);
    const missing = updatedItems.filter(it => it.isSoldOut).map(it => it.id);

    setOrderItems(updatedItems);
    setShowSubstituteModal(false);

    try {
      await supabase.from('orders').update({
        items: updatedItems,
        subtotal: newSubtotal,
        total: newSubtotal + (orderInfo?.deliveryFee || 0),
        missing_items: missing,
        missingItems: missing,
        updated_at: new Date().toISOString()
      }).eq('id', orderId);

      await handleSendMessage(`🔄 He sustituido "${substitutingItem.name}" por "${newProduct.name}" ($${Number(newProduct.price || 0).toFixed(2)}).`);
      toast.success('Producto sustituido con éxito');
    } catch (e) {
      console.error(e);
      toast.error('Error al sustituir producto');
    }
  };

  const handleSendPagoMovilInfo = async () => {
    try {
      const { data: res } = await supabase.from('comercios').select('*').eq('id', restaurantId).maybeSingle();
      if (!res) return;
      const pm = res.payment_methods?.find((m: any) => m.type === 'Pago Móvil') || res.pago_movil || res.pagoMovil;
      if (pm) {
        const pmText = `💳 *DATOS OFICIALES PARA PAGO MÓVIL:*\n• Banco: ${pm.bank || 'Por definir'}\n• Teléfono: ${pm.phone || res.phone || 'Por definir'}\n• Cédula/RIF: ${pm.rif || pm.idf || pm.id_number || 'Por definir'}\n• Titular: ${pm.owner || pm.name || res.name}\n\nPor favor adjunta el capture o comprobante por este chat para verificarlo de inmediato.`;
        await handleSendMessage(pmText);
      } else {
        await handleSendMessage(`💳 Puedes realizar tu pago móvil a los datos del comercio: Teléfono ${res.phone || res.whatsapp || ''}. Por favor adjunta el comprobante por aquí.`);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleOpenWhatsAppFallback = () => {
    try {
      const stored = localStorage.getItem(`wa_fallback_${orderId}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.number && parsed.message) {
          window.open(`https://wa.me/${parsed.number}?text=${encodeURIComponent(parsed.message)}`, '_blank');
          return;
        }
      }
    } catch (e) {}

    // Fallback if no stored template
    if (orderInfo?.restaurantPhone || orderInfo?.restaurantWhatsapp) {
      const num = (orderInfo.restaurantPhone || orderInfo.restaurantWhatsapp).replace(/\D/g, '');
      const msg = `Hola, tengo una orden activa en la app (ID: ${orderId.slice(0, 8)}). Quisiera coordinar el pedido.`;
      window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`, '_blank');
    }
  };

  const confirmPayment = async () => {
    if (!isStoreRole) return;

    const isPickup = orderInfo?.deliveryMethod === 'pickup' || orderInfo?.delivery_method === 'pickup';
    const nextStatus = isPickup ? 'preparing' : 'awaiting_delivery_driver';
    const confirmMsg = isPickup
      ? '¡Pago confirmado! Tu orden está en preparación. Te notificaremos cuando puedas pasar a retirarla en el local.'
      : '¡Pago de productos verificado con éxito! Ahora puedes solicitar tu conductor de delivery en la pantalla para la entrega.';

    await handleSendMessage(confirmMsg, undefined, 'payment_confirmed');

    try {
      await supabase.from('orders').update({
        restaurant_payment_client_confirmed: true,
        restaurantPaymentClientConfirmed: true,
        status: nextStatus,
        updated_at: new Date().toISOString()
      }).eq('id', orderId);
      toast.success('Pago confirmado por el comercio.');
    } catch (e) {
      console.error(e);
      toast.error('Error al actualizar la orden');
    }
  };

  const renderMessageContent = (msg: Message) => {
    if (msg.action === 'payment_confirmed') {
      return (
        <div className="bg-emerald-100 border border-emerald-200 p-4 rounded-2xl text-center shadow-sm w-full mx-4 my-2">
          <CheckCircle className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
          <p className="text-emerald-900 font-black text-sm leading-snug">{msg.text}</p>
        </div>
      );
    }

    if (msg.action === 'items_modified') {
      return (
        <div className="bg-amber-100 border border-amber-300 p-3.5 rounded-2xl text-center shadow-sm w-full mx-4 my-1">
          <AlertTriangle className="w-6 h-6 text-amber-600 mx-auto mb-1.5" />
          <p className="text-amber-900 font-bold text-xs leading-snug">{msg.text}</p>
        </div>
      );
    }

    if (msg.senderRole === 'delivery' && currentUserRole === 'client') {
      return (
        <div className="p-3.5 rounded-2xl max-w-[85%] bg-amber-50 border border-amber-200 text-slate-700 rounded-tl-none mr-auto shadow-sm">
          <p className="text-[10px] font-black opacity-60 mb-1 uppercase tracking-wider flex items-center gap-1.5">
            <Bike className="w-3 h-3" /> Repartidor: {msg.senderName}
          </p>
          <p className="text-sm font-bold leading-relaxed whitespace-pre-wrap">{msg.text}</p>
        </div>
      );
    }

    const isMe = msg.senderRole === currentUserRole || (isStoreRole && msg.senderRole === 'restaurant');

    return (
      <div className={`p-3.5 rounded-2xl max-w-[85%] ${
        isMe
          ? 'bg-primary text-slate-900 rounded-tr-none ml-auto shadow-md shadow-primary/10'
          : 'bg-white border border-slate-200/80 text-slate-800 rounded-tl-none mr-auto shadow-sm'
      }`}>
        <p className="text-[10px] font-black opacity-60 mb-1 uppercase tracking-wider">{msg.senderName}</p>
        <p className="text-sm font-bold leading-relaxed whitespace-pre-wrap">{msg.text}</p>
        {msg.imageUrl && (
          <div className="mt-2 text-center">
            <a href={msg.imageUrl} target="_blank" rel="noreferrer">
              <img src={msg.imageUrl} alt="comprobante" className="max-w-full rounded-xl max-h-52 object-contain bg-slate-50 border border-slate-200 shadow-sm" />
            </a>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-[560px] bg-slate-50 rounded-3xl overflow-hidden border-2 border-slate-200 shadow-xl relative">
      {/* Hidden file input for receipt/capture upload */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept="image/*"
        className="hidden"
      />

      {/* Chat header */}
      <div className="bg-white p-3.5 border-b border-slate-200 flex items-center justify-between z-10 shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${currentUserRole === 'client' ? 'bg-primary/20 text-slate-900' : 'bg-slate-900 text-white'}`}>
            {currentUserRole === 'client' ? <Store className="w-5 h-5" /> : <Receipt className="w-5 h-5" />}
          </div>
          <div>
            <h3 className="font-black text-slate-900 leading-none text-sm">
              {currentUserRole === 'client' ? (orderInfo?.restaurantName || 'Atención al Cliente') : (orderInfo?.userName || 'Cliente')}
            </h3>
            <p className="text-[10px] text-slate-500 font-bold uppercase mt-1 tracking-wider flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              {currentUserRole === 'client' ? 'En línea • Comercio' : 'Chat en Vivo'}
            </p>
          </div>
        </div>

        {/* Toggle Products Card */}
        {orderItems.length > 0 && (
          <button
            onClick={() => setShowItemsList(!showItemsList)}
            className="flex items-center gap-1 text-xs font-black text-slate-700 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-200 transition-colors"
          >
            <span>Productos ({orderItems.length})</span>
            {showItemsList ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>

      {/* Interactive Stock / Order Items Bar */}
      {showItemsList && orderItems.length > 0 && (
        <div className="bg-slate-100/90 border-b border-slate-200 p-2.5 max-h-40 overflow-y-auto space-y-1.5 shrink-0">
          {orderItems.map((item: any, idx: number) => {
            const isSoldOut = !!item.isSoldOut;
            return (
              <div
                key={item.id || idx}
                className={`flex items-center justify-between gap-2 p-2 rounded-xl text-xs transition-all ${
                  isSoldOut
                    ? 'bg-red-50/90 border border-red-200 text-red-700'
                    : 'bg-white border border-slate-200/80 text-slate-800'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {item.image && (
                    <img src={item.image} alt={item.name} className="w-8 h-8 rounded-lg object-cover shrink-0 border border-slate-200" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className={`font-black truncate ${isSoldOut ? 'line-through text-red-600' : 'text-slate-800'}`}>
                      {item.quantity}x {item.name}
                    </p>
                    <span className="text-[10px] text-slate-400 font-bold">
                      ${((item.price || 0) * (item.quantity || 1)).toFixed(2)} USD
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {isSoldOut && (
                    <span className="text-[10px] font-black bg-red-100 text-red-700 px-2 py-0.5 rounded-md uppercase">
                      Agotado
                    </span>
                  )}

                  {/* For Client: Replacement quick action */}
                  {currentUserRole === 'client' && isSoldOut && (
                    <button
                      onClick={() => handleOpenSubstituteModal(item)}
                      className="bg-amber-400 hover:bg-amber-500 text-slate-950 px-2.5 py-1 rounded-lg text-[10px] font-black flex items-center gap-1 shadow-sm transition-transform active:scale-95"
                    >
                      <Plus className="w-3 h-3" /> Sustituir
                    </button>
                  )}

                  {/* For Restaurant/Cashier: Stock toggle button */}
                  {isStoreRole && (
                    <button
                      onClick={() => handleToggleSoldOut(item.id, isSoldOut)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition-all active:scale-95 ${
                        isSoldOut
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
                          : 'bg-red-50 hover:bg-red-100 text-red-600 border border-red-200'
                      }`}
                    >
                      {isSoldOut ? '✅ Hay Stock' : '⚠️ Agotado'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-slate-400 font-medium text-xs mt-12 space-y-2">
            <Store className="w-10 h-10 mx-auto text-slate-300" />
            <p>Escribe tu mensaje para iniciar la conversación en tiempo real.</p>
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className="flex">
            {renderMessageContent(msg)}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* WhatsApp Fallback Button for Client if store is slow */}
      {currentUserRole === 'client' && waTimeoutPassed && (
        <div className="bg-emerald-50 border border-emerald-200 p-2.5 px-4 flex items-center justify-between text-xs text-emerald-900 rounded-2xl mx-3 mb-2 shadow-sm shrink-0">
          <span className="font-bold flex items-center gap-1.5 text-[11px]">
            <MessageCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            ¿El comercio tarda en responder?
          </span>
          <button
            onClick={handleOpenWhatsAppFallback}
            className="bg-emerald-500 hover:bg-emerald-600 text-white font-black px-3 py-1.5 rounded-xl flex items-center gap-1 shadow-sm transition-all text-xs"
          >
            WhatsApp
          </button>
        </div>
      )}

      {/* Quick Actions (for restaurants / cashiers) */}
      {isStoreRole && !orderInfo?.restaurantPaymentClientConfirmed && (
        <div className="bg-white p-2.5 border-t border-slate-200 flex items-center gap-2 overflow-x-auto whitespace-nowrap scrollbar-hide shadow-sm z-10 w-full shrink-0">
          <button
            onClick={handleSendPagoMovilInfo}
            className="shrink-0 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-xl text-xs font-black text-blue-700 hover:bg-blue-100 active:scale-95 transition-all flex items-center gap-1"
          >
            <CreditCard className="w-3.5 h-3.5" /> Enviar Pago Móvil
          </button>
          <button
            onClick={() => handleSendMessage("Por favor, ayúdame enviando la captura de pantalla o foto del comprobante de tu pago por este chat.")}
            className="shrink-0 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-200 active:scale-95 transition-all"
          >
            📸 Pedir Capture
          </button>
          {casheaQrUrl && (
            <button
              onClick={() => handleSendMessage("Puedes realizar tu pago a través de Cashea escaneando el siguiente QR.", casheaQrUrl)}
              className="shrink-0 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-200 active:scale-95 transition-all"
            >
              🛍️ Cashea QR
            </button>
          )}
          <button
            onClick={confirmPayment}
            className="shrink-0 bg-emerald-600 hover:bg-emerald-700 px-4 py-1.5 rounded-xl text-xs font-black text-white active:scale-95 transition-all flex items-center gap-1.5 ml-auto shadow-sm"
          >
            <CheckCircle className="w-4 h-4" /> CONFIRMAR PAGO
          </button>
        </div>
      )}

      {/* Input area */}
      <div className="p-3 bg-white border-t border-slate-200 shrink-0">
        <div className="flex items-end gap-2">
          {/* Client Attachment Button */}
          {currentUserRole === 'client' && (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={sending}
              title="Adjuntar comprobante o foto"
              className="w-11 h-11 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl flex items-center justify-center active:scale-95 transition-all shrink-0 border border-slate-200"
            >
              <Paperclip className="w-5 h-5" />
            </button>
          )}

          <div className="flex-1 bg-slate-50 rounded-2xl border-2 border-slate-200/80 relative focus-within:border-primary focus-within:bg-white transition-all p-1">
            <textarea
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder={currentUserRole === 'client' ? "Escribe un mensaje o adjunta tu pago..." : "Escribe un mensaje al cliente..."}
              className="w-full bg-transparent px-3 py-2 outline-none min-h-[40px] max-h-24 text-xs font-bold text-slate-800 resize-none"
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
            className="w-11 h-11 bg-primary rounded-2xl flex items-center justify-center text-slate-900 shadow-md shadow-primary/20 hover:scale-[1.02] active:scale-95 disabled:opacity-50 transition-all shrink-0 font-black"
          >
            {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5 ml-0.5" />}
          </button>
        </div>
      </div>

      {/* Modal: Quick Product Substitution for Client */}
      {showSubstituteModal && (
        <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl p-5 w-full max-w-sm max-h-[85%] flex flex-col shadow-2xl border border-slate-200 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
              <div>
                <h4 className="font-black text-slate-900 text-sm">Sustituir Producto</h4>
                <p className="text-[10px] text-slate-400 font-bold">
                  Elige un reemplazo para: <span className="text-red-500 font-black">{substitutingItem?.name}</span>
                </p>
              </div>
              <button
                onClick={() => setShowSubstituteModal(false)}
                className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {loadingProducts ? (
                <div className="text-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
                  <p className="text-xs font-bold text-slate-400 mt-2">Cargando menú...</p>
                </div>
              ) : restaurantProducts.length === 0 ? (
                <p className="text-center text-xs text-slate-400 py-8 font-bold">No hay otros productos disponibles.</p>
              ) : (
                restaurantProducts.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => handleSelectReplacement(p)}
                    className="flex items-center justify-between gap-3 p-2.5 bg-slate-50 hover:bg-primary/10 rounded-2xl border border-slate-200/80 cursor-pointer transition-colors group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      {(p.image || p.image_url) && (
                        <img src={p.image || p.image_url} alt={p.name} className="w-10 h-10 rounded-xl object-cover shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-black text-slate-800 truncate group-hover:text-slate-950">{p.name}</p>
                        <p className="text-[11px] font-black text-emerald-600">${Number(p.price || 0).toFixed(2)} USD</p>
                      </div>
                    </div>
                    <button className="bg-white group-hover:bg-primary text-slate-800 text-[10px] font-black px-2.5 py-1.5 rounded-xl border border-slate-200 shadow-sm shrink-0">
                      Elegir
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
