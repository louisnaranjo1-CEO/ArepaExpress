import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { 
  Send, Image as ImageIcon, CheckCircle, Receipt, Clock, CreditCard, Gift, Phone, Store, Bike, 
  Paperclip, AlertTriangle, RefreshCw, Plus, X, MessageCircle, Copy, ChevronDown, ChevronUp, 
  Loader2, Mic, MicOff, Square, Play, Video, UserCheck, ShieldCheck, UploadCloud, Check, 
  Car, Sparkles, Navigation, MapPin, User, ArrowRight, ArrowLeft, Eye, ExternalLink, ChevronRight, Wallet
} from 'lucide-react';
import toast from 'react-hot-toast';

interface Message {
  id: string;
  text: string;
  imageUrl?: string;
  senderId: string;
  senderName: string;
  senderRole: 'client' | 'restaurant' | 'system' | 'delivery';
  createdAt: any;
  action?: 'payment_confirmed' | 'payment_reminder' | 'items_modified' | 'voice_note' | 'dispatch_requested';
}

interface OrderChatWindowProps {
  orderId: string;
  currentUserRole: 'client' | 'restaurant' | 'cpanel' | 'delivery' | 'cashier';
  currentUserId: string;
  currentUserName: string;
  restaurantId: string;
  orderInfo: any;
  customCollectionPath?: string;
  className?: string;
  onClose?: () => void;
}

export default function OrderChatWindow({
  orderId,
  currentUserRole,
  currentUserId,
  currentUserName,
  restaurantId,
  orderInfo,
  customCollectionPath,
  className,
  onClose
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
  const [viewingAttachment, setViewingAttachment] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Live synced order & store info
  const [liveOrder, setLiveOrder] = useState<any>(orderInfo || {});
  const [storeData, setStoreData] = useState<any>(null);
  const [prepCountdownStr, setPrepCountdownStr] = useState<string>('');
  const [bcvRate, setBcvRate] = useState<number>(855.66);

  // Voice note recording states
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<any>(null);

  // "Ya pagué" verification modal states (strict: receipt or valid reference required, or pickup at store)
  const [showPayModal, setShowPayModal] = useState(false);
  const [payProofFile, setPayProofFile] = useState<File | null>(null);
  const [payProofPreview, setPayProofPreview] = useState<string | null>(null);
  const [payReferenceCode, setPayReferenceCode] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [submittingPayment, setSubmittingPayment] = useState(false);

  // Preparation tool modal state (Store)
  const [showPrepTimeModal, setShowPrepTimeModal] = useState(false);
  const [customPrepMinutes, setCustomPrepMinutes] = useState(20);

  // Modalidad A: Driver Dispatch modal state (Store assigns driver)
  const [showStoreDispatchModal, setShowStoreDispatchModal] = useState(false);
  const [driversList, setDriversList] = useState<any[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState<string>('');
  const [loadingDrivers, setLoadingDrivers] = useState(false);
  const [dispatchingStore, setDispatchingStore] = useState(false);

  // Modalidad B: Client Dispatch modal state (Client chooses vehicle category)
  const [showClientDispatchModal, setShowClientDispatchModal] = useState(false);
  const [clientSelectedCategory, setClientSelectedCategory] = useState<'moto' | 'carro' | 'confort'>('moto');
  const [clientReferenceNote, setClientReferenceNote] = useState('');
  const [submittingClientDispatch, setSubmittingClientDispatch] = useState(false);

  const isStoreRole = currentUserRole === 'restaurant' || (currentUserRole as string) === 'cashier';

  // Fetch BCV Rate
  useEffect(() => {
    const fetchBCV = async () => {
      try {
        const res = await fetch('https://ve.dolarapi.com/v1/dolares/oficial');
        if (res.ok) {
          const data = await res.json();
          if (data?.promedio) setBcvRate(Number(data.promedio));
        }
      } catch (e) {
        console.warn('Could not fetch BCV rate, using fallback:', e);
      }
    };
    fetchBCV();
  }, []);

  useEffect(() => {
    if (orderInfo) {
      // Only override local liveOrder if the incoming orderInfo has a more advanced status
      // This prevents the parent component re-rendering from reverting payment state
      const advancedStatuses = ['awaiting_delivery_driver', 'preparing', 'ready', 'buscando_piloto', 'delivering', 'delivered', 'completed', 'paid', 'payment_confirmed'];
      setLiveOrder((prev: any) => {
        const currentIsAdvanced = advancedStatuses.includes(prev?.status);
        const incomingIsAdvanced = advancedStatuses.includes(orderInfo?.status);
        // If current local state is already verified/advanced, don't downgrade it
        if (currentIsAdvanced && !incomingIsAdvanced) return prev;
        return orderInfo;
      });
      if (orderInfo.items) setOrderItems(orderInfo.items);
      if (orderInfo.delivery_address_reference || orderInfo.address?.reference) {
        setClientReferenceNote(orderInfo.delivery_address_reference || orderInfo.address?.reference || '');
      }
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

  // Fetch store data (coordinates, free delivery rules, etc.)
  useEffect(() => {
    const fetchStore = async () => {
      if (!restaurantId) return;
      try {
        const { data } = await supabase
          .from('comercios')
          .select('*')
          .eq('id', restaurantId)
          .maybeSingle();

        if (data) {
          setStoreData(data);
          if (data.cashea_qr_url || data.casheaQrUrl) {
            setCasheaQrUrl(data.cashea_qr_url || data.casheaQrUrl);
          }
        }
      } catch (e) {
        console.error("Error fetching store data:", e);
      }
    };
    fetchStore();
  }, [restaurantId]);

  // Realtime messages & order sync
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
          setTimeout(() => {
            if (messagesContainerRef.current) {
              messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
            }
          }, 100);
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

  const handleSendMessage = async (
    text: string, 
    actionUrl?: string, 
    actionType?: 'payment_confirmed' | 'payment_reminder' | 'items_modified' | 'voice_note' | 'dispatch_requested'
  ) => {
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
        const filePath = `payment_proofs/${fileName}`;
        const { error: upErr } = await supabase.storage.from('store_assets').upload(filePath, payProofFile, { upsert: true });
        if (upErr) {
          const { error: upErr2 } = await supabase.storage.from('documents').upload(filePath, payProofFile, { upsert: true });
          if (!upErr2) {
            const { data } = supabase.storage.from('documents').getPublicUrl(filePath);
            proofUrl = data.publicUrl;
          } else {
            proofUrl = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.readAsDataURL(payProofFile);
            });
          }
        } else {
          const { data } = supabase.storage.from('store_assets').getPublicUrl(filePath);
          proofUrl = data.publicUrl;
        }
      }

      await supabase.from('orders').update({
        status: 'pending_verification',
        payment_status: 'verifying',
        payment_reference: payReferenceCode.trim() || null,
        paymentReference: payReferenceCode.trim() || null,
        payment_proof_url: proofUrl || null,
        paymentProofUrl: proofUrl || null,
        restaurant_payment_client_confirmed: true,
        restaurantPaymentClientConfirmed: true,
        updated_at: new Date().toISOString()
      }).eq('id', orderId);

      setLiveOrder((prev: any) => ({
        ...prev,
        status: 'pending_verification',
        payment_status: 'verifying',
        payment_reference: payReferenceCode.trim() || null,
        paymentReference: payReferenceCode.trim() || null,
        payment_proof_url: proofUrl || null,
        paymentProofUrl: proofUrl || null,
        restaurant_payment_client_confirmed: true,
        restaurantPaymentClientConfirmed: true
      }));

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

  // Pickup Mode: Select card payment / POS on store arrival
  const handleSelectPickupCardPayment = async () => {
    setSubmittingPayment(true);
    try {
      await supabase.from('orders').update({
        status: 'preparing',
        payment_method: 'card_on_pickup',
        payment_status: 'conditionally_paid',
        conditionally_paid: true,
        restaurant_payment_client_confirmed: true,
        restaurantPaymentClientConfirmed: true,
        updated_at: new Date().toISOString()
      }).eq('id', orderId);

      const payMsgText = `🏪 *PAGO EN EL LOCAL SELECCIONADO*\nEl cliente pagará con tarjeta / punto de venta en el establecimiento al momento del retiro. Orden marcada como en preparación condicional.`;
      await handleSendMessage(payMsgText, undefined, 'payment_confirmed');

      toast.success("Has seleccionado pago con punto de venta al retirar en el local. ¡Tu orden se está preparando!");
      setShowPayModal(false);
    } catch (e) {
      console.error(e);
      toast.error("Error al registrar método de pago en tienda.");
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

  // Modalidad A: Store Driver Dispatch
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

  const handleStoreDispatchOrder = async () => {
    const chosenDriver = driversList.find(d => d.id === selectedDriverId) || 
      (liveOrder?.preferred_driver_id && { id: liveOrder.preferred_driver_id, name: liveOrder.preferred_driver_name });

    if (!chosenDriver) {
      toast.error("Por favor selecciona un repartidor.");
      return;
    }

    setDispatchingStore(true);
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

      await handleSendMessage(`🛵 *¡Tu pedido ha sido despachado!* Repartidor asignado por la tienda: **${driverName}**. Va en camino hacia tu dirección.`);
      toast.success(`Pedido despachado con ${driverName}`);
      setShowStoreDispatchModal(false);
    } catch (e) {
      console.error(e);
      toast.error("Error al despachar pedido");
    } finally {
      setDispatchingStore(false);
    }
  };

  // Helper: Haversine distance in km
  const calculateDistanceKm = (lat1?: number, lon1?: number, lat2?: number, lon2?: number): number => {
    if (!lat1 || !lon1 || !lat2 || !lon2) return 2.0; // fallback standard 2 km
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return Number((R * c).toFixed(1));
  };

  // Store & Client Coords
  const storeCoords = storeData?.coordinates || storeData?.location?.coords || { lat: 8.9242, lng: -67.4293 };
  const clientCoords = liveOrder?.delivery_coords || liveOrder?.address?.coords || { lat: 8.9280, lng: -67.4250 };
  const orderDistanceKm = liveOrder?.distance || calculateDistanceKm(storeCoords.lat, storeCoords.lng, clientCoords.lat, clientCoords.lng);

  // Calculate live fares for Modalidad B
  const calculateFare = (cat: 'moto' | 'carro' | 'confort'): number => {
    const dist = Math.max(1, orderDistanceKm);
    if (cat === 'moto') {
      return Number(Math.max(1.50, 1.50 + dist * 0.50).toFixed(2));
    } else if (cat === 'carro') {
      return Number(Math.max(2.50, 2.50 + dist * 0.80).toFixed(2));
    } else {
      return Number(Math.max(3.50, 3.50 + dist * 1.20).toFixed(2));
    }
  };

  // Modalidad B: Client submits dispatch request
  const handleClientSubmitDispatch = async () => {
    setSubmittingClientDispatch(true);
    const selectedFare = calculateFare(clientSelectedCategory);
    const categoryTitle = clientSelectedCategory === 'moto' 
      ? 'Moto Encomienda' 
      : clientSelectedCategory === 'confort' 
      ? 'Carro Confort VIP' 
      : 'Carro Económico';

    try {
      const transportData: any = {
        type: 'delivery_envios',
        service_category: clientSelectedCategory === 'moto' ? 'mototaxi' : clientSelectedCategory === 'confort' ? 'carro_confort' : 'taxi_driver',
        order_id: orderId,
        restaurant_id: restaurantId,
        restaurant_name: liveOrder?.restaurant_name || storeData?.name || 'Comercio',
        user_id: currentUserId,
        user_name: liveOrder?.user_name || currentUserName,
        user_phone: liveOrder?.user_phone || '',
        user_cedula: liveOrder?.user_cedula || '',
        origin: {
          address: storeData?.address || storeData?.location?.address || 'Sede del comercio',
          coords: storeCoords
        },
        destination: {
          address: liveOrder?.delivery_address || liveOrder?.address?.name || 'Dirección de Entrega',
          reference: clientReferenceNote.trim() || liveOrder?.address?.reference || '',
          coords: clientCoords
        },
        distance: orderDistanceKm,
        client_total: selectedFare,
        driver_payout: Number((selectedFare * 0.8).toFixed(2)),
        service_fee: Number((selectedFare * 0.2).toFixed(2)),
        status: 'searching',
        payment_method: 'pago_movil',
        created_at: new Date().toISOString()
      };

      const { data: newTr, error: trErr } = await supabase
        .from('transport_requests')
        .insert(transportData)
        .select('id')
        .single();

      if (trErr) throw trErr;

      const trId = newTr?.id;

      await supabase.from('orders').update({
        transport_request_id: trId || null,
        delivery_fee: selectedFare,
        driver_payout: Number((selectedFare * 0.8).toFixed(2)),
        status: 'buscando_piloto',
        order_note: clientReferenceNote.trim() || liveOrder?.order_note || null,
        updated_at: new Date().toISOString()
      }).eq('id', orderId);

      const msgText = `🛵 *SOLICITUD DE ENVÍO INICIADA*\n` +
        `• Categoría: **${categoryTitle}**\n` +
        `• Tarifa: **$${selectedFare.toFixed(2)} USD** (${(selectedFare * bcvRate).toFixed(0)} Bs)\n` +
        (clientReferenceNote.trim() ? `• Referencia de entrega: ${clientReferenceNote.trim()}\n` : '') +
        `\n*Notificando a conductores disponibles de la red para asignar la entrega.*`;

      await handleSendMessage(msgText, undefined, 'dispatch_requested');

      toast.success(`¡Solicitud de envío enviada! Buscando conductor ${categoryTitle}...`);
      setShowClientDispatchModal(false);
    } catch (e: any) {
      console.error(e);
      toast.error('Error al procesar solicitud de envío.');
    } finally {
      setSubmittingClientDispatch(false);
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

      const statusMsg = !currentSoldOut 
        ? `⚠️ *PRODUCTO AGOTADO:* "${targetItem?.name}". Por favor selecciona un sustituto o coordinemos por aquí.`
        : `✅ *PRODUCTO DISPONIBLE:* "${targetItem?.name}". Hay stock disponible.`;

      await handleSendMessage(statusMsg, undefined, 'items_modified');
      toast.success(!currentSoldOut ? 'Marcado como agotado' : 'Marcado como disponible');
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
      const { data } = await supabase
        .from('products')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .eq('is_available', true);

      if (data) {
        setRestaurantProducts(data.filter((p: any) => p.id !== item.id));
      }
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
          ...it,
          id: newProduct.id,
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

  const handlePhoneCall = () => {
    const rawPhone = liveOrder?.restaurant_phone || orderInfo?.restaurantPhone || orderInfo?.restaurantWhatsapp || storeData?.phone;
    if (rawPhone) {
      const num = rawPhone.replace(/[^\d+]/g, '');
      window.location.href = `tel:${num}`;
    } else {
      toast.error('Número de teléfono no disponible para llamar.');
    }
  };

  const confirmPayment = async () => {
    if (!isStoreRole) return;

    const isPickup = liveOrder?.delivery_method === 'pickup' || liveOrder?.deliveryMethod === 'pickup';
    const nextStatus = isPickup ? 'preparing' : 'awaiting_delivery_driver';
    const confirmMsg = isPickup
      ? '¡Pago confirmado! Tu orden está en preparación. Te notificaremos cuando puedas pasar a retirarla en el local.'
      : '¡Pago de productos verificado con éxito! Ahora puedes procesar el envío de tu paquete con un repartidor.';

    await handleSendMessage(confirmMsg, undefined, 'payment_confirmed');

    try {
      await supabase.from('orders').update({
        restaurant_payment_client_confirmed: true,
        restaurantPaymentClientConfirmed: true,
        status: nextStatus,
        payment_status: 'paid',
        updated_at: new Date().toISOString()
      }).eq('id', orderId);

      setLiveOrder((prev: any) => ({
        ...prev,
        restaurant_payment_client_confirmed: true,
        restaurantPaymentClientConfirmed: true,
        status: nextStatus,
        payment_status: 'paid'
      }));

      toast.success('¡Pago confirmado con éxito! Orden lista para preparación o despacho.');
    } catch (e) {
      console.error(e);
      toast.error('Error al actualizar la orden');
    }
  };

  // Stock Confirmation Tool for Store
  const handleConfirmStoreStock = async () => {
    try {
      await supabase.from('orders').update({
        stock_confirmed: true,
        stockConfirmed: true,
        updated_at: new Date().toISOString()
      }).eq('id', orderId);

      setLiveOrder((prev: any) => ({ ...prev, stock_confirmed: true, stockConfirmed: true }));

      await handleSendMessage("✅ *STOCK CONFIRMADO POR EL COMERCIO:*\nTodos los productos de tu pedido están disponibles y apartados. Puedes proceder con el pago con total tranquilidad.");
      toast.success("Stock confirmado al cliente.");
    } catch (e) {
      console.error(e);
      toast.error("Error al confirmar stock");
    }
  };

  // Financial and Qualification Calculations
  const isPickupOrder = liveOrder?.delivery_method === 'pickup' || liveOrder?.deliveryMethod === 'pickup';
  const calculatedItemsTotal = (orderItems && orderItems.length > 0)
    ? orderItems.reduce((acc, it) => acc + (Number(it.price || 0) * Number(it.quantity || 1)), 0)
    : 0;
  const orderDisplayTotal = calculatedItemsTotal > 0
    ? calculatedItemsTotal
    : (Number(liveOrder?.subtotal) > 0 ? Number(liveOrder?.subtotal) : Number(liveOrder?.total || 0));
  const orderSubtotal = orderDisplayTotal;
  const isFreeDeliveryConfigured = Boolean(storeData?.free_delivery_enabled);
  const freeDeliveryMinAmount = Number(storeData?.free_delivery_min_amount || 0);
  const qualifiesForFreeDelivery = isFreeDeliveryConfigured && orderSubtotal >= freeDeliveryMinAmount && freeDeliveryMinAmount > 0;
  
  const hasPaymentConfirmedMsg = messages.some(m => 
    m.action === 'payment_confirmed' || 
    m.action === 'payment_approved' || 
    (m.text && (m.text.includes('verificado con éxito') || m.text.includes('Pago de productos verificado') || m.text.includes('¡Pago verificado') || m.text.includes('¡Pago confirmado')))
  );

  const hasPaymentReportedMsg = messages.some(m =>
    m.action === 'payment_reported' ||
    (m.text && (m.text.includes('PAGO REPORTADO') || m.text.includes('He realizado el pago')))
  );

  // Three clean mutually exclusive payment states
  const isPaymentVerifiedByStore = Boolean(
    ['awaiting_delivery_driver', 'preparing', 'ready', 'buscando_piloto', 'delivering', 'delivered', 'completed', 'paid', 'payment_confirmed'].includes(liveOrder?.status) ||
    liveOrder?.payment_status === 'paid' ||
    liveOrder?.payment_status === 'approved' ||
    liveOrder?.status === 'paid' ||
    liveOrder?.status === 'payment_confirmed' ||
    hasPaymentConfirmedMsg
  );

  const isPaymentReportedWaitingStore = Boolean(
    !isPaymentVerifiedByStore && (
      liveOrder?.status === 'pending_verification' ||
      liveOrder?.payment_status === 'verifying' ||
      liveOrder?.restaurant_payment_client_confirmed ||
      liveOrder?.restaurantPaymentClientConfirmed ||
      Boolean(liveOrder?.payment_proof_url || liveOrder?.paymentProofUrl) ||
      hasPaymentReportedMsg
    )
  );

  const isPaidOrConditionallyPaid = isPaymentVerifiedByStore || isPaymentReportedWaitingStore || Boolean(liveOrder?.conditionally_paid);

  const isStockConfirmed = Boolean(
    liveOrder?.stock_confirmed ||
    liveOrder?.stockConfirmed ||
    (liveOrder?.status && !['pending', 'action_required'].includes(liveOrder.status))
  );

  const renderMessageContent = (msg: Message) => {
    if (msg.action === 'payment_confirmed') {
      const proofImg = msg.imageUrl || liveOrder?.payment_proof_url || liveOrder?.paymentProofUrl;
      return (
        <div className="bg-emerald-50/95 border-2 border-emerald-300 p-4 rounded-3xl text-left shadow-sm w-full mx-1 my-2 animate-in zoom-in-95 space-y-3">
          <div className="flex items-center justify-between border-b border-emerald-200/80 pb-2.5">
            <div className="flex items-center gap-2 text-emerald-900">
              <div className="w-7 h-7 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <CheckCircle className="w-4 h-4" />
              </div>
              <div>
                <p className="font-black text-xs uppercase tracking-wide text-emerald-950">Reporte de Pago Registrado</p>
                <p className="text-[10px] text-emerald-700 font-bold">{msg.senderName}</p>
              </div>
            </div>
            <span className="text-[10px] font-black uppercase text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full border border-emerald-200">
              Comprobante
            </span>
          </div>

          <p className="text-slate-800 font-bold text-xs leading-relaxed whitespace-pre-wrap">{msg.text}</p>

          {/* Adjunto Visual / Tarjeta de Comprobante (Sin URLs expuestas) */}
          {proofImg && (
            <div className="pt-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1.5 flex items-center gap-1">
                <Paperclip className="w-3.5 h-3.5 text-emerald-600" /> Archivo Adjunto (Comprobante):
              </span>
              <div 
                onClick={() => setViewingAttachment(proofImg)}
                className="bg-white border-2 border-emerald-200 hover:border-emerald-500 p-2.5 rounded-2xl flex items-center gap-3 cursor-pointer group transition-all shadow-xs"
              >
                <div className="w-14 h-14 rounded-xl overflow-hidden bg-slate-100 shrink-0 border border-slate-200 relative">
                  <img 
                    src={proofImg} 
                    alt="Capture de pago" 
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform" 
                  />
                  <div className="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-colors" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-black text-xs text-slate-900 group-hover:text-emerald-700 transition-colors flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5 text-emerald-600" /> Toca para revisar comprobante
                  </p>
                  <p className="text-[10px] font-bold text-slate-400">Ver captura completa en ventana sin URLs</p>
                </div>
                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition-colors shrink-0">
                  <Eye className="w-4 h-4" />
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    if (msg.action === 'dispatch_requested') {
      return (
        <div className="bg-indigo-50 border border-indigo-200 p-4 rounded-2xl text-center shadow-sm w-full mx-2 my-2 animate-in zoom-in-95">
          <Bike className="w-7 h-7 text-indigo-600 mx-auto mb-1.5" />
          <p className="text-indigo-900 font-black text-xs leading-snug whitespace-pre-wrap">{msg.text}</p>
        </div>
      );
    }

    if (msg.action === 'items_modified') {
      return (
        <div className="bg-amber-100 border border-amber-300 p-3.5 rounded-2xl text-center shadow-sm w-full mx-2 my-1">
          <AlertTriangle className="w-6 h-6 text-amber-600 mx-auto mb-1.5" />
          <p className="text-amber-900 font-bold text-xs leading-snug whitespace-pre-wrap">{msg.text}</p>
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
              <div 
                onClick={() => setViewingAttachment(msg.imageUrl || null)}
                className="cursor-pointer group relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 hover:opacity-95 transition-all text-center block"
              >
                <img src={msg.imageUrl} alt="Adjunto" className="max-w-full rounded-2xl max-h-52 object-contain bg-slate-50 border border-slate-200 shadow-sm mx-auto" />
                <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white text-xs font-bold gap-1.5 backdrop-blur-[1px]">
                  <Eye className="w-4 h-4" /> Toca para ver comprobante
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`flex flex-col h-full w-full bg-slate-50 overflow-hidden relative ${className || ''}`}>
      {/* Hidden file input for receipt/capture/video upload */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept="image/*,video/*"
        className="hidden"
      />

      {/* Chat header */}
      <div className="bg-white p-3 border-b border-slate-200 flex items-center justify-between z-10 shrink-0 shadow-sm">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {onClose && (
            <button
              onClick={onClose}
              className="w-9 h-9 bg-slate-100 hover:bg-slate-200 rounded-xl flex items-center justify-center text-slate-700 active:scale-95 transition-all mr-1 shrink-0"
              title="Volver"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${currentUserRole === 'client' ? 'bg-primary/20 text-slate-900' : 'bg-slate-900 text-white'}`}>
            {currentUserRole === 'client' ? <Store className="w-5 h-5" /> : <Receipt className="w-5 h-5" />}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-black text-slate-900 leading-none text-sm truncate">
              {currentUserRole === 'client' ? (liveOrder?.restaurant_name || orderInfo?.restaurantName || 'Comercio') : (liveOrder?.user_name || orderInfo?.userName || 'Cliente')}
            </h3>
            <p className="text-[10px] text-slate-500 font-bold uppercase mt-1 tracking-wider flex items-center gap-1 truncate">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
              {currentUserRole === 'client' ? 'En línea • Comercio' : 'Chat en Vivo'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Direct Call Button (Replaces WhatsApp) */}
          {(liveOrder?.restaurant_phone || orderInfo?.restaurantPhone || orderInfo?.restaurantWhatsapp || storeData?.phone || liveOrder?.user_phone || orderInfo?.userPhone) && (
            <button
              onClick={handlePhoneCall}
              className="flex items-center gap-1 text-xs font-black text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 px-2.5 py-1.5 rounded-xl transition-all active:scale-95"
              title="Llamar directamente"
            >
              <Phone className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Llamar</span>
            </button>
          )}

          {/* Toggle Pinned Summary Card */}
          <button
            onClick={() => setShowItemsList(!showItemsList)}
            className="flex items-center gap-1.5 text-xs font-black text-slate-700 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-200 transition-colors"
          >
            <span>Resumen ({orderItems.length})</span>
            {showItemsList ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {/* Optional Direct Close button in Header */}
          {onClose && (
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors active:scale-95 ml-0.5"
              title="Cerrar chat"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Countdown Timer Banner */}
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

      {/* PINNED VISUAL ORDER SUMMARY CARD (Customer Name, Cédula, Products, Quantities, Amounts in $ and Bs) */}
      {showItemsList && (
        <div className="bg-white border-b-2 border-slate-200 p-3.5 space-y-2.5 shrink-0 max-h-56 overflow-y-auto shadow-sm">
          {/* Top Info: Client Name, Cédula and Delivery Method */}
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100 text-xs">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <div className="w-7 h-7 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                <User className="w-4 h-4 text-slate-600" />
              </div>
              <div className="min-w-0">
                <p className="font-black text-slate-900 text-xs truncate">
                  {liveOrder?.user_name || orderInfo?.userName || 'Cliente'}
                </p>
                <div className="flex items-center gap-2 text-[10px] text-slate-500 font-bold">
                  <span>CI: {liveOrder?.user_cedula || orderInfo?.userCedula || 'No especificada'}</span>
                  {(liveOrder?.user_phone || orderInfo?.userPhone) && (
                    <span>• 📞 {liveOrder?.user_phone || orderInfo?.userPhone}</span>
                  )}
                </div>
              </div>
            </div>

            <div className="shrink-0 text-right">
              <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider inline-flex items-center gap-1 ${
                isPickupOrder ? 'bg-purple-100 text-purple-700' : 'bg-emerald-100 text-emerald-700'
              }`}>
                {isPickupOrder ? '🏪 Retiro en Tienda' : '🛵 Entrega a Domicilio'}
              </span>
            </div>
          </div>

          {/* Products List Breakdown */}
          <div className="space-y-1.5">
            {orderItems.map((item: any, idx: number) => {
              const isSoldOut = !!item.isSoldOut;
              const itemTotal = (item.price || 0) * (item.quantity || 1);
              const itemTotalBs = bcvRate > 0 ? (itemTotal * bcvRate).toFixed(0) : '0';

              return (
                <div
                  key={item.id || idx}
                  className={`flex items-center justify-between gap-2 p-2 rounded-xl text-xs transition-all ${
                    isSoldOut
                      ? 'bg-red-50 border border-red-200 text-red-700'
                      : 'bg-slate-50 border border-slate-100 text-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="font-black text-slate-900 bg-white px-1.5 py-0.5 rounded border border-slate-200 text-[10px]">
                      {item.quantity}x
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={`font-black text-xs truncate ${isSoldOut ? 'line-through text-red-600' : 'text-slate-900'}`}>
                        {item.name}
                      </p>
                      <span className="text-[10px] text-slate-500 font-bold">
                        ${itemTotal.toFixed(2)} USD • {itemTotalBs} Bs
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {isSoldOut && (
                      <span className="text-[9px] font-black bg-red-100 text-red-700 px-2 py-0.5 rounded-md uppercase">
                        Agotado
                      </span>
                    )}

                    {/* For Client: Replacement quick action */}
                    {currentUserRole === 'client' && isSoldOut && (
                      <button
                        onClick={() => handleOpenSubstituteModal(item)}
                        className="bg-amber-400 hover:bg-amber-500 text-slate-950 px-2 py-1 rounded-lg text-[10px] font-black flex items-center gap-1 shadow-sm active:scale-95"
                      >
                        <Plus className="w-3 h-3" /> Sustituir
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Financial Totals & Status */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs font-bold">
            <div className="flex items-center gap-2">
              <span className="text-slate-500 text-[11px]">Total Orden:</span>
              <span className="text-slate-900 font-black text-sm">
                ${orderDisplayTotal.toFixed(2)} USD
              </span>
              <span className="text-slate-500 text-[10px]">
                ({bcvRate > 0 ? (orderDisplayTotal * bcvRate).toFixed(0) : '0'} Bs)
              </span>
            </div>

            {/* Quick stock confirm for store */}
            {isStoreRole && !isStockConfirmed && (
              <button
                onClick={handleConfirmStoreStock}
                className="bg-blue-600 hover:bg-blue-700 text-white font-black text-[10px] px-2.5 py-1 rounded-xl flex items-center gap-1 shadow-sm active:scale-95"
              >
                <CheckCircle className="w-3.5 h-3.5" /> Confirmar Stock
              </button>
            )}
          </div>
        </div>
      )}

      {/* Messages area */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="text-center text-slate-400 font-medium text-xs mt-8 space-y-2">
            <Store className="w-10 h-10 mx-auto text-slate-300" />
            <p className="font-bold text-slate-500">Conversación en Vivo</p>
            <p className="text-[11px] text-slate-400">Coordina detalles del producto, confirma tu pago y gestiona el despacho.</p>
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className="flex">
            {renderMessageContent(msg)}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Phone Call Fallback Button for Client if store is slow */}
      {currentUserRole === 'client' && waTimeoutPassed && (
        <div className="bg-blue-50 border border-blue-200 p-2.5 px-4 flex items-center justify-between text-xs text-blue-900 rounded-2xl mx-3 mb-2 shadow-sm shrink-0">
          <span className="font-bold flex items-center gap-1.5 text-[11px]">
            <Phone className="w-4 h-4 text-blue-600 shrink-0" />
            ¿El comercio tarda en responder?
          </span>
          <button
            onClick={handlePhoneCall}
            className="bg-blue-600 hover:bg-blue-700 text-white font-black px-3.5 py-1.5 rounded-xl flex items-center gap-1.5 shadow-sm active:scale-95 transition-all text-xs"
          >
            <Phone className="w-3.5 h-3.5" /> Llamar por teléfono
          </button>
        </div>
      )}

      {/* ACTION BAR: Client */}
      {currentUserRole === 'client' && (
        <div className="shrink-0 bg-white border-t border-slate-200">
          {/* State 1: Client has not reported payment yet */}
          {!isPaymentVerifiedByStore && !isPaymentReportedWaitingStore && (
            <div className="bg-amber-50 p-2.5 px-4 flex items-center justify-between gap-2 border-b border-amber-200">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-amber-600 shrink-0" />
                <span className="text-xs font-bold text-amber-900">¿Realizaste el pago de tu pedido?</span>
              </div>
              <button
                onClick={() => setShowPayModal(true)}
                className="bg-primary hover:bg-primary/90 text-slate-900 font-black px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-md active:scale-95 transition-all shrink-0"
              >
                <CheckCircle className="w-4 h-4 text-slate-900" /> Reportar Pago
              </button>
            </div>
          )}

          {/* State 2: Client reported payment, waiting for store confirmation */}
          {isPaymentReportedWaitingStore && !isPaymentVerifiedByStore && (
            <div className="bg-amber-50/90 p-3 px-4 flex items-center justify-between gap-3 border-b border-amber-200">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-7 h-7 rounded-full bg-amber-200/80 text-amber-800 flex items-center justify-center shrink-0">
                  <Clock className="w-4 h-4 animate-spin" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-black text-amber-950 truncate">Esperando confirmación del pago...</p>
                  <p className="text-[10px] font-bold text-amber-700">El comercio está verificando tu comprobante</p>
                </div>
              </div>
              <span className="text-[10px] font-black uppercase tracking-wider text-amber-800 bg-amber-100 border border-amber-300 px-2.5 py-1 rounded-full shrink-0">
                En Verificación
              </span>
            </div>
          )}

          {/* State 3: Store has VERIFIED payment */}
          {isPaymentVerifiedByStore && (
            <div className="p-3 px-4 bg-emerald-50 border-b border-emerald-200 flex items-center justify-between gap-3 animate-in slide-in-from-bottom-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                  <CheckCircle className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-black text-emerald-950 truncate">¡Pago Confirmado por el Comercio! 🎉</p>
                  <p className="text-[10px] font-bold text-emerald-700 truncate">
                    {isPickupOrder ? 'Tu pedido está en preparación para retiro' : 'Avanza para seleccionar tu vehículo y repartidor'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  if (onClose) onClose();
                }}
                className="bg-slate-900 hover:bg-slate-800 text-white font-black px-4 py-2.5 rounded-xl text-xs flex items-center gap-1.5 shadow-md active:scale-95 transition-all shrink-0"
              >
                <span>{isPickupOrder ? 'Ver Retiro' : 'Pedir Repartidor'}</span>
                <ChevronRight className="w-4 h-4 text-primary" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ACTION BAR: Store / Cashier */}
      {isStoreRole && (
        <div className="bg-white p-2.5 border-t border-slate-200 flex items-center gap-2 overflow-x-auto whitespace-nowrap scrollbar-hide shadow-sm z-10 w-full shrink-0">
          {!isPaymentVerifiedByStore && (
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

          {isPaymentVerifiedByStore && (
            <div className="flex items-center gap-2 w-full">
              <span className="text-[11px] font-black text-emerald-700 flex items-center gap-1 mr-auto truncate">
                <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                Pago Aprobado
              </span>
              <button
                onClick={() => setShowPrepTimeModal(true)}
                className="shrink-0 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
              >
                <Clock className="w-3.5 h-3.5" /> ⏱️ Tiempo Prep.
              </button>
              {!isPickupOrder && (
                <button
                  onClick={() => {
                    fetchDrivers();
                    setShowStoreDispatchModal(true);
                  }}
                  className={`shrink-0 font-black px-3.5 py-1.5 rounded-xl text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition-all ${
                    qualifiesForFreeDelivery
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      : 'bg-slate-900 hover:bg-slate-800 text-white'
                  }`}
                >
                  <Bike className="w-3.5 h-3.5 text-primary" />
                  {qualifiesForFreeDelivery ? '🎁 Despachar (Envío Gratis)' : '🛵 Despachar Driver'}
                </button>
              )}
              {onClose && (
                <button
                  onClick={onClose}
                  className="shrink-0 bg-slate-900 hover:bg-slate-800 text-white font-black px-3 py-1.5 rounded-xl text-xs transition-all shadow-sm"
                >
                  Ir a Pedidos
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Input area */}
      <div className="p-3 bg-white border-t border-slate-200 shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
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

      {/* MODAL 1: "Ya pagué" Native Bottom Sheet with Pago Móvil / Reference / Retiro en Tienda */}
      {showPayModal && (
        <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-3 animate-in fade-in">
          <div className="bg-white rounded-t-[32px] sm:rounded-3xl p-5 w-full max-w-sm max-h-[90%] flex flex-col shadow-2xl border border-slate-200 animate-in slide-in-from-bottom-5 sm:zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
              <div>
                <h4 className="font-black text-slate-900 text-sm flex items-center gap-1.5">
                  <CreditCard className="w-4 h-4 text-primary" /> Reportar Pago
                </h4>
                <p className="text-[10px] text-slate-500 font-bold">
                  Comprobante, referencia o pago directo en tienda
                </p>
              </div>
              <button
                onClick={() => setShowPayModal(false)}
                className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3.5 pr-1 text-xs">
              {/* Pickup Mode: Option for Card/POS at Store */}
              {isPickupOrder && (
                <div className="p-3.5 rounded-2xl bg-purple-50 border-2 border-purple-200 space-y-2">
                  <div className="flex items-center gap-2 text-purple-900 font-black">
                    <Store className="w-4 h-4 text-purple-600" />
                    <span>Pago en el Establecimiento</span>
                  </div>
                  <p className="text-[11px] text-purple-700 font-semibold leading-relaxed">
                    Si vas a retirar tu pedido en la tienda, puedes cancelar directamente en caja con tarjeta de débito/crédito o punto de venta.
                  </p>
                  <button
                    onClick={handleSelectPickupCardPayment}
                    disabled={submittingPayment}
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white font-black py-2.5 rounded-xl text-xs shadow-md active:scale-95 transition-all flex items-center justify-center gap-1.5"
                  >
                    <CreditCard className="w-4 h-4" /> Pago con tarjeta / Punto de venta en el lugar
                  </button>
                </div>
              )}

              {/* Receipt File upload */}
              <div>
                <label className="font-black text-slate-700 block mb-1 text-[11px]">
                  Subir Captura o Foto del Pago Móvil:
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
                    <span className="font-black text-slate-600 text-[11px]">Subir comprobante / captura</span>
                    <span className="text-[9px] text-slate-400">JPG, PNG o WEBP</span>
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

              {/* Validation Alert */}
              {!payProofFile && payReferenceCode.trim().length < 4 && (
                <div className="bg-red-50 border border-red-200 p-2.5 rounded-xl text-[10px] font-bold text-red-700 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Adjunta la captura o ingresa al menos 4 dígitos de referencia.</span>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 mt-2">
              <button
                onClick={handleConfirmPaid}
                disabled={submittingPayment || (!payProofFile && payReferenceCode.trim().length < 4)}
                className="w-full bg-primary hover:bg-primary/90 text-slate-900 font-black py-3 rounded-2xl text-xs flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 active:scale-95 transition-all"
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

      {/* MODAL 2: Modalidad B - Client Dispatch Bottom Sheet (Moto, Carro Económico, Confort) */}
      {showClientDispatchModal && (
        <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-3 animate-in fade-in">
          <div className="bg-white rounded-t-[32px] sm:rounded-3xl p-5 w-full max-w-sm max-h-[92%] flex flex-col shadow-2xl border border-slate-200 animate-in slide-in-from-bottom-5 sm:zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
              <div>
                <h4 className="font-black text-slate-900 text-sm flex items-center gap-1.5">
                  <Bike className="w-4 h-4 text-primary" /> Procesar Envío de Pedido
                </h4>
                <p className="text-[10px] text-slate-500 font-bold">
                  Selecciona la categoría de transporte para tu entrega
                </p>
              </div>
              <button
                onClick={() => setShowClientDispatchModal(false)}
                className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs">
              {/* Origin & Destination Route Card */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                <div className="flex items-start gap-2">
                  <Store className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] text-slate-400 font-black uppercase">Origen (Comercio):</p>
                    <p className="font-black text-slate-800 text-xs truncate">
                      {liveOrder?.restaurant_name || storeData?.name || 'Comercio'}
                    </p>
                    <p className="text-[10px] text-slate-500 truncate">
                      {storeData?.address || 'Sede del comercio'}
                    </p>
                  </div>
                </div>

                <div className="h-px bg-slate-200 my-1" />

                <div className="flex items-start gap-2">
                  <Navigation className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] text-slate-400 font-black uppercase">Destino (Tu Ubicación):</p>
                    <p className="font-black text-slate-800 text-xs truncate">
                      {liveOrder?.delivery_address || liveOrder?.address?.name || 'Dirección del cliente'}
                    </p>
                    <span className="text-[10px] text-slate-500">
                      Distancia estimada: ~{orderDistanceKm} km
                    </span>
                  </div>
                </div>
              </div>

              {/* Written Reference Input */}
              <div>
                <label className="text-[11px] font-black text-slate-700 block mb-1">
                  Referencia de entrega (Opcional):
                </label>
                <input
                  type="text"
                  placeholder="Ej: Portón verde, casa de dos pisos..."
                  value={clientReferenceNote}
                  onChange={(e) => setClientReferenceNote(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-primary focus:bg-white"
                />
              </div>

              {/* Category Selector: Moto, Carro Económico, Confort */}
              <div className="space-y-2">
                <label className="text-[11px] font-black text-slate-700 block">
                  Elige la categoría de transporte:
                </label>

                {/* 1. Moto */}
                {(() => {
                  const fare = calculateFare('moto');
                  const isSelected = clientSelectedCategory === 'moto';
                  return (
                    <div
                      onClick={() => setClientSelectedCategory('moto')}
                      className={`p-3 rounded-2xl border-2 flex items-center justify-between cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-amber-50 border-amber-400 shadow-md shadow-amber-500/10'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isSelected ? 'bg-amber-400 text-slate-950 font-black' : 'bg-slate-100 text-slate-700'}`}>
                          <Bike className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-black text-slate-900 text-xs">Moto Encomienda</p>
                          <span className="text-[10px] text-slate-500 font-medium">Rápido y ágil para paquetes</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-black text-slate-900 text-xs">${fare.toFixed(2)} USD</p>
                        <span className="text-[9px] text-slate-500 font-bold">{(fare * bcvRate).toFixed(0)} Bs</span>
                      </div>
                    </div>
                  );
                })()}

                {/* 2. Carro Económico */}
                {(() => {
                  const fare = calculateFare('carro');
                  const isSelected = clientSelectedCategory === 'carro';
                  return (
                    <div
                      onClick={() => setClientSelectedCategory('carro')}
                      className={`p-3 rounded-2xl border-2 flex items-center justify-between cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-amber-50 border-amber-400 shadow-md shadow-amber-500/10'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isSelected ? 'bg-amber-400 text-slate-950 font-black' : 'bg-slate-100 text-slate-700'}`}>
                          <Car className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-black text-slate-900 text-xs">Carro Económico</p>
                          <span className="text-[10px] text-slate-500 font-medium">Mayor capacidad y protección</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-black text-slate-900 text-xs">${fare.toFixed(2)} USD</p>
                        <span className="text-[9px] text-slate-500 font-bold">{(fare * bcvRate).toFixed(0)} Bs</span>
                      </div>
                    </div>
                  );
                })()}

                {/* 3. Confort VIP */}
                {(() => {
                  const fare = calculateFare('confort');
                  const isSelected = clientSelectedCategory === 'confort';
                  return (
                    <div
                      onClick={() => setClientSelectedCategory('confort')}
                      className={`p-3 rounded-2xl border-2 flex items-center justify-between cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-purple-50 border-purple-400 shadow-md shadow-purple-500/10'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isSelected ? 'bg-purple-600 text-white font-black' : 'bg-purple-100 text-purple-700'}`}>
                          <Sparkles className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-black text-slate-900 text-xs">Confort VIP</p>
                          <span className="text-[10px] text-slate-500 font-medium">Climatizado A/A, unidad premium</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-black text-slate-900 text-xs">${fare.toFixed(2)} USD</p>
                        <span className="text-[9px] text-slate-500 font-bold">{(fare * bcvRate).toFixed(0)} Bs</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 mt-2">
              <button
                onClick={handleClientSubmitDispatch}
                disabled={submittingClientDispatch}
                className="w-full bg-slate-950 hover:bg-slate-900 text-white font-black py-3 rounded-2xl text-xs flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 active:scale-95 transition-all"
              >
                {submittingClientDispatch ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Bike className="w-4 h-4 text-primary" /> Confirmar y Solicitar Conductor
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Modalidad A - Store Driver Dispatch Modal */}
      {showStoreDispatchModal && (
        <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl p-5 w-full max-w-sm max-h-[90%] flex flex-col shadow-2xl border border-slate-200 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
              <div>
                <h4 className="font-black text-slate-900 text-sm flex items-center gap-1.5">
                  <Bike className="w-4 h-4 text-primary" /> Asignar y Despachar Pedido
                </h4>
                <p className="text-[10px] text-slate-500 font-bold">
                  Selecciona el driver de la red para despachar
                </p>
              </div>
              <button
                onClick={() => setShowStoreDispatchModal(false)}
                className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs">
              {/* Free Delivery Commission Notice */}
              <div className={`p-2.5 rounded-2xl border ${
                qualifiesForFreeDelivery
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-slate-100 border-slate-200 text-slate-700'
              }`}>
                <p className="text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Esquema de Envío:
                </p>
                <p className="text-[11px] font-bold mt-1">
                  {qualifiesForFreeDelivery
                    ? `🎁 Envío Gratis activo: El monto de compra ($${orderSubtotal.toFixed(2)}) califica. El negocio asume la tarifa del driver.`
                    : `🛵 Tarifa de delivery calculada: $${Number(liveOrder?.delivery_fee || liveOrder?.deliveryFee || 2.0).toFixed(2)}.`}
                </p>
              </div>

              {/* Drivers List */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-black text-slate-700 block">
                  Conductores Registrados Disponibles:
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
                onClick={handleStoreDispatchOrder}
                disabled={dispatchingStore || !selectedDriverId}
                className="w-full bg-slate-950 hover:bg-slate-900 text-white font-black py-3 rounded-2xl text-xs flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 active:scale-95 transition-all"
              >
                {dispatchingStore ? (
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

      {/* MODAL 4: Preparation Time Modal for Store */}
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

      {/* MODAL 5: Quick Product Substitution Modal */}
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

      {/* VENTANILLA / LIGHTBOX MODAL: Ver Comprobante o Imagen en Grande (Sin URLs expuestas) */}
      {viewingAttachment && (
        <div 
          className="fixed inset-0 z-[300] bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-between p-4 sm:p-6 animate-in fade-in duration-200"
          onClick={() => setViewingAttachment(null)}
        >
          {/* Header del Lightbox */}
          <div 
            className="w-full max-w-lg flex items-center justify-between text-white shrink-0 py-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-primary">
                <Receipt className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-black text-sm text-white">Comprobante de Pago</h4>
                <p className="text-[10px] text-white/60 font-bold">Vista de archivo adjunto</p>
              </div>
            </div>
            <button
              onClick={() => setViewingAttachment(null)}
              className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors active:scale-95"
              title="Cerrar ventanilla"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Imagen Principal en Grande */}
          <div 
            className="flex-1 w-full max-w-lg flex items-center justify-center overflow-hidden my-auto p-2"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={viewingAttachment}
              alt="Comprobante de pago"
              className="max-w-full max-h-[75vh] object-contain rounded-2xl shadow-2xl border border-white/15 bg-slate-900"
            />
          </div>

          {/* Footer con Acciones */}
          <div 
            className="w-full max-w-lg flex items-center gap-3 pt-3 shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            {isStoreRole && !isPaymentVerifiedByStore && (
              <button
                onClick={async () => {
                  setViewingAttachment(null);
                  await confirmPayment();
                }}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black py-3.5 rounded-2xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 active:scale-95 transition-all"
              >
                <CheckCircle className="w-4 h-4" /> Aprobar y Confirmar Pago
              </button>
            )}
            <button
              onClick={() => setViewingAttachment(null)}
              className={`py-3.5 rounded-2xl font-black text-xs transition-all active:scale-95 ${
                isStoreRole && !isPaymentVerifiedByStore
                  ? 'px-6 bg-white/15 hover:bg-white/25 text-white'
                  : 'w-full bg-white hover:bg-slate-100 text-slate-900'
              }`}
            >
              Cerrar Ventana
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
