import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { Send, Image as ImageIcon, CheckCircle, Receipt, Clock, CreditCard, Gift, Phone, Store, Bike, Paperclip, AlertTriangle, RefreshCw, Plus, X, MessageCircle, Copy, ChevronDown, ChevronUp, Loader2, Mic, MicOff, Square, Play, Video, UserCheck, ShieldCheck, UploadCloud, Check } from 'lucide-react';
import toast from 'react-hot-toast';

interface Message {
  id: string;
  text: string;
  imageUrl?: string;
  senderId: string;
  senderName: string;
  senderRole: 'client' | 'restaurant' | 'system' | 'delivery';
  createdAt: any;
  action?: 'payment_confirmed' | 'payment_reminder' | 'items_modified' | 'voice_note';
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

  // Live synced order object
  const [liveOrder, setLiveOrder] = useState<any>(orderInfo || {});
  const [prepCountdownStr, setPrepCountdownStr] = useState<string>('');

  // Voice note recording states
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<any>(null);

  // "Ya pagué" verification modal states (strict: receipt or valid reference required)
  const [showPayModal, setShowPayModal] = useState(false);
  const [payProofFile, setPayProofFile] = useState<File | null>(null);
  const [payProofPreview, setPayProofPreview] = useState<string | null>(null);
  const [payReferenceCode, setPayReferenceCode] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [submittingPayment, setSubmittingPayment] = useState(false);

  // Preparation tool modal state
  const [showPrepTimeModal, setShowPrepTimeModal] = useState(false);
  const [customPrepMinutes, setCustomPrepMinutes] = useState(20);

  // Driver Dispatch modal state
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [driversList, setDriversList] = useState<any[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState<string>('');
  const [loadingDrivers, setLoadingDrivers] = useState(false);
  const [dispatching, setDispatching] = useState(false);

  const isStoreRole = currentUserRole === 'restaurant' || (currentUserRole as string) === 'cashier';

  useEffect(() => {
    if (orderInfo) {
      setLiveOrder(orderInfo);
      if (orderInfo.items) setOrderItems(orderInfo.items);
    }
  }, [orderInfo]);

  // Synchronized countdown timer for preparation
  useEffect(() => {
    const targetTime = liveOrder?.estimated_ready_at || liveOrder?.estimatedReadyAt;
    const isPreparing = liveOrder?.status === 'preparing';

    if (!targetTime || !isPreparing) {
      setPrepCountdownStr('');
      return;
    }

    const updateTimer = () => {
      const now = Date.now();
      const target = new Date(targetTime).getTime();
      const diffSec = Math.max(0, Math.floor((target - now) / 1000));
      if (diffSec <= 0) {
        setPrepCountdownStr('00:00 • ¡Pedido listo!');
        return;
      }
      const mins = Math.floor(diffSec / 60);
      const secs = diffSec % 60;
      setPrepCountdownStr(`${mins}:${secs.toString().padStart(2, '0')} min`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [liveOrder?.estimated_ready_at, liveOrder?.estimatedReadyAt, liveOrder?.status]);

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
        if (payload.new) {
          const ord = payload.new as any;
          if (ord.items) setOrderItems(ord.items);
          setLiveOrder(ord);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(orderSub);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    };
  }, [orderId, customCollectionPath]);

  const handleSendMessage = async (text: string, actionUrl?: string, actionType?: 'payment_confirmed' | 'payment_reminder' | 'items_modified' | 'voice_note') => {
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
      const isVideo = file.type.startsWith('video/');
      const fileName = `${isVideo ? 'video' : 'media'}_${orderId}_${Date.now()}.${fileExt}`;
      const filePath = `order_chat/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file);

      if (uploadError) {
        const reader = new FileReader();
        reader.onload = async () => {
          const base64 = reader.result as string;
          await handleSendMessage(isVideo ? '🎥 Video adjunto:' : '📸 Archivo multimedia / Comprobante:', base64);
        };
        reader.readAsDataURL(file);
      } else {
        const { data: { publicUrl } } = supabase.storage
          .from('documents')
          .getPublicUrl(filePath);
        await handleSendMessage(isVideo ? '🎥 Video adjunto:' : '📸 Archivo multimedia / Comprobante:', publicUrl);
      }
      toast.success(isVideo ? 'Video enviado al chat' : 'Archivo enviado al chat');
    } catch (err) {
      console.error(err);
      toast.error('Error al subir archivo');
    } finally {
      setSending(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Voice Note Recording
  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      setRecordingSeconds(0);
      setIsRecordingVoice(true);

      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds(prev => prev + 1);
      }, 1000);

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.start();
    } catch (e) {
      console.error("Audio recording error:", e);
      toast.error("No se pudo acceder al micrófono.");
    }
  };

  const cancelVoiceRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream?.getTracks().forEach(t => t.stop());
    }
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    setIsRecordingVoice(false);
    setRecordingSeconds(0);
  };

  const stopAndSendVoiceRecording = async () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') return;
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    setIsRecordingVoice(false);
    setSending(true);

    mediaRecorderRef.current.onstop = async () => {
      mediaRecorderRef.current?.stream?.getTracks().forEach(t => t.stop());
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      if (audioBlob.size === 0) {
        setSending(false);
        return;
      }

      try {
        const fileName = `voice_${orderId}_${Date.now()}.webm`;
        const filePath = `order_chat/${fileName}`;
        const { error: upErr } = await supabase.storage.from('documents').upload(filePath, audioBlob);
        let audioUrl = '';
        if (upErr) {
          audioUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(audioBlob);
          });
        } else {
          const { data } = supabase.storage.from('documents').getPublicUrl(filePath);
          audioUrl = data.publicUrl;
        }

        await handleSendMessage('🎙️ Nota de voz', audioUrl, 'voice_note');
        toast.success('Nota de voz enviada');
      } catch (e) {
        console.error("Error sending voice note:", e);
        toast.error("Error al enviar la nota de voz");
      } finally {
        setSending(false);
        setRecordingSeconds(0);
      }
    };

    mediaRecorderRef.current.stop();
  };

  // Payment Confirmation by Client ("Ya pagué" strict)
  const handleConfirmPaid = async () => {
    const hasValidRef = payReferenceCode.trim().length >= 4;
    const hasFile = Boolean(payProofFile);

    if (!hasFile && !hasValidRef) {
      toast.error("Debes adjuntar el comprobante o ingresar un número de referencia válido (mínimo 4 caracteres).");
      return;
    }

    setSubmittingPayment(true);
    try {
      let proofUrl = '';
      if (payProofFile) {
        const ext = payProofFile.name.split('.').pop() || 'jpg';
        const fileName = `payment_${orderId}_${Date.now()}.${ext}`;
        const filePath = `order_chat/${fileName}`;
        const { error: upErr } = await supabase.storage.from('documents').upload(filePath, payProofFile);
        if (upErr) {
          proofUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(payProofFile);
          });
        } else {
          const { data } = supabase.storage.from('documents').getPublicUrl(filePath);
          proofUrl = data.publicUrl;
        }
      }

      await supabase.from('orders').update({
        payment_status: 'verifying',
        payment_reference: payReferenceCode.trim() || null,
        paymentReference: payReferenceCode.trim() || null,
        payment_proof_url: proofUrl || null,
        paymentProofUrl: proofUrl || null,
        restaurant_payment_client_confirmed: true,
        restaurantPaymentClientConfirmed: true,
        updated_at: new Date().toISOString()
      }).eq('id', orderId);

      const refText = payReferenceCode.trim() ? `• Referencia: #${payReferenceCode.trim()}` : '';
      const notesText = payNotes.trim() ? `\n• Nota: ${payNotes.trim()}` : '';
      const payMsgText = `💳 *¡PAGO REPORTADO POR EL CLIENTE!*\n${refText}${notesText}\n\n*Por favor verificar el comprobante para confirmar e iniciar la preparación.*`;

      await handleSendMessage(payMsgText, proofUrl || undefined, 'payment_confirmed');

      toast.success("¡Pago reportado con éxito al comercio! 🎉");
      setShowPayModal(false);
      setPayProofFile(null);
      setPayProofPreview(null);
      setPayReferenceCode('');
      setPayNotes('');
    } catch (e) {
      console.error(e);
      toast.error("Error al reportar el pago.");
    } finally {
      setSubmittingPayment(false);
    }
  };

  // Preparation Time Tool for Store
  const handleSetPrepTime = async (minutes: number) => {
    try {
      const readyAt = new Date(Date.now() + minutes * 60000).toISOString();
      await supabase.from('orders').update({
        status: 'preparing',
        preparation_time_minutes: minutes,
        preparation_started_at: new Date().toISOString(),
        estimated_ready_at: readyAt,
        estimatedReadyAt: readyAt,
        updated_at: new Date().toISOString()
      }).eq('id', orderId);

      await handleSendMessage(`👨‍🍳 *¡Comenzó la preparación del pedido!* Tiempo estimado fijado en: **${minutes} minutos**.`);
      toast.success(`Tiempo de preparación: ${minutes} min`);
      setShowPrepTimeModal(false);
    } catch (e) {
      console.error(e);
      toast.error("Error al fijar tiempo de preparación");
    }
  };

  // Driver Dispatch Tool for Store
  const fetchDrivers = async () => {
    setLoadingDrivers(true);
    try {
      const { data } = await supabase.from('delivery_drivers').select('*');
      if (data && data.length > 0) {
        setDriversList(data);
      } else {
        const { data: profs } = await supabase.from('profiles').select('*').eq('role', 'driver');
        setDriversList(profs || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingDrivers(false);
    }
  };

  const handleDispatchOrder = async () => {
    const chosenDriver = driversList.find(d => d.id === selectedDriverId) || 
      (liveOrder?.preferred_driver_id && { id: liveOrder.preferred_driver_id, name: liveOrder.preferred_driver_name });

    if (!chosenDriver) {
      toast.error("Por favor selecciona un repartidor.");
      return;
    }

    setDispatching(true);
    try {
      const driverName = chosenDriver.name || chosenDriver.displayName || chosenDriver.full_name || 'Repartidor de la Red';
      await supabase.from('orders').update({
        status: 'delivering',
        driver_id: chosenDriver.id,
        driverId: chosenDriver.id,
        driver_name: driverName,
        driverName: driverName,
        dispatched_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }).eq('id', orderId);

      await handleSendMessage(`🛵 *¡Tu pedido ha sido despachado!* Repartidor asignado: **${driverName}**. Va en camino con tu entrega.`);
      toast.success(`Pedido despachado con ${driverName}`);
      setShowDispatchModal(false);
    } catch (e) {
      console.error(e);
      toast.error("Error al despachar pedido");
    } finally {
      setDispatching(false);
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

    const isVoiceNote = msg.action === 'voice_note' || (msg.imageUrl && (msg.imageUrl.includes('voice_') || msg.imageUrl.endsWith('.webm') || msg.imageUrl.endsWith('.ogg') || msg.imageUrl.endsWith('.mp3')));
    const isVideo = msg.imageUrl && (msg.imageUrl.includes('video_') || msg.imageUrl.endsWith('.mp4') || msg.imageUrl.endsWith('.mov'));

    return (
      <div className={`p-3.5 rounded-2xl max-w-[85%] ${
        isMe
          ? 'bg-primary text-slate-900 rounded-tr-none ml-auto shadow-md shadow-primary/10'
          : 'bg-white border border-slate-200/80 text-slate-800 rounded-tl-none mr-auto shadow-sm'
      }`}>
        <p className="text-[10px] font-black opacity-60 mb-1 uppercase tracking-wider">{msg.senderName}</p>
        <p className="text-sm font-bold leading-relaxed whitespace-pre-wrap">{msg.text}</p>
        {msg.imageUrl && (
          <div className="mt-2">
            {isVoiceNote ? (
              <div className="bg-black/5 p-2 rounded-xl flex items-center gap-2">
                <audio controls src={msg.imageUrl} className="w-full max-w-[260px] h-9 rounded-lg" />
              </div>
            ) : isVideo ? (
              <video controls src={msg.imageUrl} className="max-w-full rounded-xl max-h-56 bg-black border border-slate-200 shadow-sm" />
            ) : (
              <a href={msg.imageUrl} target="_blank" rel="noreferrer" className="block text-center">
                <img src={msg.imageUrl} alt="comprobante" className="max-w-full rounded-xl max-h-52 object-contain bg-slate-50 border border-slate-200 shadow-sm" />
              </a>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-[580px] bg-slate-50 rounded-3xl overflow-hidden border-2 border-slate-200 shadow-xl relative">
      {/* Hidden file input for receipt/capture/video upload */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept="image/*,video/*"
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

      {/* Countdown Timer Header Banner (Real-time synchronized) */}
      {prepCountdownStr && (
        <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-white px-4 py-2 flex items-center justify-between text-xs font-black shadow-md z-10 shrink-0 animate-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 animate-spin shrink-0" />
            <span>Tiempo de preparación restante:</span>
          </div>
          <span className="bg-white/20 backdrop-blur-md px-3 py-1 rounded-xl font-mono text-xs tracking-wider border border-white/30">
            {prepCountdownStr}
          </span>
        </div>
      )}

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

      {/* Quick Actions (for Client: "Ya pagué" Action Bar) */}
      {currentUserRole === 'client' && !liveOrder?.restaurant_payment_client_confirmed && !liveOrder?.restaurantPaymentClientConfirmed && (
        <div className="bg-amber-50 border-t border-amber-200 p-2.5 px-4 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="text-xs font-bold text-amber-900">¿Realizaste el pago de tu pedido?</span>
          </div>
          <button
            onClick={() => setShowPayModal(true)}
            className="bg-primary hover:bg-primary/90 text-slate-900 font-black px-3.5 py-1.5 rounded-xl text-xs flex items-center gap-1.5 shadow-md active:scale-95 transition-all shrink-0"
          >
            <CheckCircle className="w-4 h-4 text-slate-900" /> Ya pagué
          </button>
        </div>
      )}

      {/* Quick Actions (for Store / Cashier) */}
      {isStoreRole && (
        <div className="bg-white p-2.5 border-t border-slate-200 flex items-center gap-2 overflow-x-auto whitespace-nowrap scrollbar-hide shadow-sm z-10 w-full shrink-0">
          {!orderInfo?.restaurantPaymentClientConfirmed && (
            <>
              <button
                onClick={handleSendPagoMovilInfo}
                className="shrink-0 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-xl text-xs font-black text-blue-700 hover:bg-blue-100 active:scale-95 transition-all flex items-center gap-1"
              >
                <CreditCard className="w-3.5 h-3.5" /> Pago Móvil
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
                className="shrink-0 bg-emerald-600 hover:bg-emerald-700 px-3.5 py-1.5 rounded-xl text-xs font-black text-white active:scale-95 transition-all flex items-center gap-1.5 shadow-sm"
              >
                <CheckCircle className="w-4 h-4" /> CONFIRMAR PAGO
              </button>
            </>
          )}

          {/* Store preparation tool */}
          <button
            onClick={() => setShowPrepTimeModal(true)}
            className="shrink-0 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
          >
            <Clock className="w-3.5 h-3.5" /> ⏱️ Tiempo Prep.
          </button>

          {/* Store dispatch tool (if delivery) */}
          {(liveOrder?.deliveryMethod !== 'pickup' && liveOrder?.delivery_method !== 'pickup') && (
            <button
              onClick={() => {
                fetchDrivers();
                setShowDispatchModal(true);
              }}
              className="shrink-0 bg-slate-900 hover:bg-slate-800 text-white font-black px-3.5 py-1.5 rounded-xl text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition-all ml-auto"
            >
              <Bike className="w-3.5 h-3.5 text-primary" /> 🛵 Enviar Pedido
            </button>
          )}
        </div>
      )}

      {/* Input area */}
      <div className="p-3 bg-white border-t border-slate-200 shrink-0">
        {isRecordingVoice ? (
          <div className="flex items-center justify-between gap-3 bg-red-50 border-2 border-red-300 p-2.5 rounded-2xl animate-in fade-in">
            <div className="flex items-center gap-2.5">
              <span className="w-3 h-3 rounded-full bg-red-600 animate-ping"></span>
              <span className="text-xs font-black text-red-700 font-mono">
                Grabando nota de voz ({recordingSeconds}s)...
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={cancelVoiceRecording}
                className="p-1.5 rounded-xl bg-slate-200 text-slate-600 hover:bg-slate-300 text-xs font-bold"
                title="Cancelar"
              >
                <X className="w-4 h-4" />
              </button>
              <button
                onClick={stopAndSendVoiceRecording}
                className="px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-black text-xs flex items-center gap-1.5 shadow-md active:scale-95"
              >
                <Send className="w-3.5 h-3.5" /> Enviar Audio
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-end gap-2">
            {/* Attachment Button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={sending}
              title="Adjuntar comprobante, foto o video"
              className="w-11 h-11 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl flex items-center justify-center active:scale-95 transition-all shrink-0 border border-slate-200"
            >
              <Paperclip className="w-5 h-5" />
            </button>

            {/* Mic Voice Note Button */}
            <button
              type="button"
              onClick={startVoiceRecording}
              disabled={sending}
              title="Grabar nota de voz"
              className="w-11 h-11 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl flex items-center justify-center active:scale-95 transition-all shrink-0 border border-slate-200"
            >
              <Mic className="w-5 h-5 text-slate-700" />
            </button>

            <div className="flex-1 bg-slate-50 rounded-2xl border-2 border-slate-200/80 relative focus-within:border-primary focus-within:bg-white transition-all p-1">
              <textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder={currentUserRole === 'client' ? "Escribe un mensaje o adjunta tu comprobante..." : "Escribe un mensaje al cliente..."}
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
        )}
      </div>

      {/* Modal: "Ya pagué" Strict Verification for Client */}
      {showPayModal && (
        <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl p-5 w-full max-w-sm max-h-[90%] flex flex-col shadow-2xl border border-slate-200 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
              <div>
                <h4 className="font-black text-slate-900 text-sm flex items-center gap-1.5">
                  <CreditCard className="w-4 h-4 text-primary" /> Reportar Pago Realizado
                </h4>
                <p className="text-[10px] text-slate-500 font-bold">
                  Comprobante o referencia obligatoria para validación
                </p>
              </div>
              <button
                onClick={() => setShowPayModal(false)}
                className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs">
              {/* Receipt File upload */}
              <div>
                <label className="font-black text-slate-700 block mb-1 text-[11px]">
                  Capture o Foto del Comprobante:
                </label>
                {payProofPreview ? (
                  <div className="relative border-2 border-emerald-300 rounded-2xl overflow-hidden bg-slate-50 p-1">
                    <img src={payProofPreview} alt="Comprobante" className="max-h-40 w-full object-contain rounded-xl" />
                    <button
                      onClick={() => {
                        setPayProofFile(null);
                        setPayProofPreview(null);
                      }}
                      className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <label className="border-2 border-dashed border-slate-300 hover:border-primary rounded-2xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer bg-slate-50 transition-colors">
                    <UploadCloud className="w-8 h-8 text-slate-400" />
                    <span className="font-black text-slate-600 text-[11px]">Subir captura de pago</span>
                    <span className="text-[9px] text-slate-400">Formatos JPG, PNG, WEBP</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setPayProofFile(file);
                          const url = URL.createObjectURL(file);
                          setPayProofPreview(url);
                        }
                      }}
                    />
                  </label>
                )}
              </div>

              {/* Reference Code Input */}
              <div>
                <label className="font-black text-slate-700 block mb-1 text-[11px]">
                  Número de Referencia:
                </label>
                <input
                  type="text"
                  placeholder="Ej: 12345678 (Mínimo 4 dígitos)"
                  value={payReferenceCode}
                  onChange={(e) => setPayReferenceCode(e.target.value)}
                  className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-primary focus:bg-white"
                />
              </div>

              {/* Optional Notes */}
              <div>
                <label className="font-black text-slate-700 block mb-1 text-[11px]">
                  Notas adicionales (Opcional):
                </label>
                <input
                  type="text"
                  placeholder="Ej: Banco emisor, titular de la cuenta..."
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-primary focus:bg-white"
                />
              </div>

              {/* Validation Warning */}
              {!payProofFile && payReferenceCode.trim().length < 4 && (
                <div className="bg-red-50 border border-red-200 p-2.5 rounded-xl text-[10px] font-bold text-red-700 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Obligatorio: Adjunta la captura o escribe al menos 4 caracteres de referencia.</span>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 mt-2">
              <button
                onClick={handleConfirmPaid}
                disabled={submittingPayment || (!payProofFile && payReferenceCode.trim().length < 4)}
                className="w-full bg-primary hover:bg-primary-hover text-slate-900 font-black py-3 rounded-2xl text-xs flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 active:scale-95 transition-all"
              >
                {submittingPayment ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Check className="w-4 h-4" /> Notificar Pago al Comercio
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Set Preparation Time for Store */}
      {showPrepTimeModal && (
        <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl p-5 w-full max-w-sm flex flex-col shadow-2xl border border-slate-200 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
              <div>
                <h4 className="font-black text-slate-900 text-sm flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-amber-500" /> Tiempo de Preparación
                </h4>
                <p className="text-[10px] text-slate-500 font-bold">
                  Sincroniza un contador visible para ambas partes
                </p>
              </div>
              <button
                onClick={() => setShowPrepTimeModal(false)}
                className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-black text-slate-700 block">Selecciona o ingresa minutos:</label>
              <div className="grid grid-cols-4 gap-2">
                {[15, 20, 30, 45].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setCustomPrepMinutes(m)}
                    className={`py-2 rounded-xl text-xs font-black transition-all ${
                      customPrepMinutes === m
                        ? 'bg-amber-500 text-white shadow-md'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {m} min
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 mt-2">
                <input
                  type="number"
                  min="5"
                  max="180"
                  value={customPrepMinutes}
                  onChange={(e) => setCustomPrepMinutes(Number(e.target.value))}
                  className="w-24 bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2 text-center text-sm font-black text-slate-900 outline-none focus:border-amber-500"
                />
                <span className="text-xs font-bold text-slate-600">minutos totales</span>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 mt-4">
              <button
                onClick={() => handleSetPrepTime(customPrepMinutes)}
                className="w-full bg-amber-500 hover:bg-amber-600 text-white font-black py-3 rounded-2xl text-xs flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all"
              >
                <Clock className="w-4 h-4" /> Iniciar Cuenta Regresiva
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Driver Dispatch for Store */}
      {showDispatchModal && (
        <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl p-5 w-full max-w-sm max-h-[90%] flex flex-col shadow-2xl border border-slate-200 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
              <div>
                <h4 className="font-black text-slate-900 text-sm flex items-center gap-1.5">
                  <Bike className="w-4 h-4 text-primary" /> Asignar y Despachar Pedido
                </h4>
                <p className="text-[10px] text-slate-500 font-bold">
                  Selecciona el driver de la red para la entrega
                </p>
              </div>
              <button
                onClick={() => setShowDispatchModal(false)}
                className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs">
              {/* Client Driver Preference Highlight */}
              {liveOrder?.preferred_driver_name && (
                <div className="bg-blue-50 border border-blue-200 p-2.5 rounded-2xl">
                  <p className="text-[10px] font-black text-blue-800 uppercase tracking-wider flex items-center gap-1">
                    <UserCheck className="w-3.5 h-3.5 text-blue-600" /> Preferencia del Cliente:
                  </p>
                  <p className="text-xs font-black text-blue-900 mt-1">
                    {liveOrder.preferred_driver_name}
                  </p>
                  <button
                    onClick={() => setSelectedDriverId(liveOrder.preferred_driver_id || '')}
                    className="mt-1.5 bg-blue-600 text-white font-black px-2.5 py-1 rounded-xl text-[10px] hover:bg-blue-700 active:scale-95"
                  >
                    Seleccionar este Driver
                  </button>
                </div>
              )}

              {/* Free Delivery Commission Notice */}
              <div className="bg-slate-100 border border-slate-200 p-2.5 rounded-2xl">
                <p className="text-[10px] font-black text-slate-700 uppercase tracking-wider flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Esquema de Tarifa:
                </p>
                <p className="text-[11px] font-bold text-slate-600 mt-1">
                  {liveOrder?.free_delivery || liveOrder?.deliveryFee === 0
                    ? '🎁 Envío Gratis activo: El comercio asume la comisión de despacho.'
                    : `🛵 Tarifa de delivery cubierta por el cliente: $${Number(liveOrder?.deliveryFee || 0).toFixed(2)}.`}
                </p>
              </div>

              {/* Drivers List */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-black text-slate-700 block">
                  Repartidores Disponibles:
                </label>
                {loadingDrivers ? (
                  <div className="text-center py-6 text-slate-400">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto text-primary" />
                    <span className="text-[10px] font-bold mt-1 block">Buscando conductores...</span>
                  </div>
                ) : driversList.length === 0 ? (
                  <p className="text-slate-400 text-center py-4 text-[11px]">No hay repartidores conectados en este momento.</p>
                ) : (
                  driversList.map((drv: any) => {
                    const isSelected = selectedDriverId === drv.id;
                    const name = drv.name || drv.displayName || drv.full_name || 'Driver';
                    return (
                      <div
                        key={drv.id}
                        onClick={() => setSelectedDriverId(drv.id)}
                        className={`p-2.5 rounded-2xl border flex items-center justify-between cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-primary/10 border-primary shadow-sm'
                            : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Bike className="w-4 h-4 text-slate-700" />
                          <div>
                            <p className="font-black text-slate-900 text-xs">{name}</p>
                            <span className="text-[10px] text-slate-400 font-bold">{drv.vehicleType || drv.vehicle_type || 'Moto'}</span>
                          </div>
                        </div>
                        <input
                          type="radio"
                          checked={isSelected}
                          onChange={() => setSelectedDriverId(drv.id)}
                          className="accent-primary"
                        />
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 mt-2">
              <button
                onClick={handleDispatchOrder}
                disabled={dispatching || (!selectedDriverId && !liveOrder?.preferred_driver_id)}
                className="w-full bg-slate-950 hover:bg-slate-900 text-white font-black py-3 rounded-2xl text-xs flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 active:scale-95 transition-all"
              >
                {dispatching ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Bike className="w-4 h-4 text-primary" /> Confirmar y Despachar
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

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
