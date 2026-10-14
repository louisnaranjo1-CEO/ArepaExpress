import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { MessageCircle, X, ChevronRight, Car, Store, ArrowRight, Volume2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { playLoudMessageNotificationSound } from '../utils/audioChimes';
import { vibrate } from '../utils/haptics';

interface ActiveMessageNotification {
  id: string;
  senderName: string;
  senderRole?: string;
  preview: string;
  targetUrl: string;
  serviceType: 'transport' | 'order';
}

export default function InAppChatNotificationBanner() {
  const { user, userData } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [notification, setNotification] = useState<ActiveMessageNotification | null>(null);
  const hideTimerRef = useRef<any>(null);

  const rawUserId = user?.id || user?.uid || (userData as any)?.id || (userData as any)?.uid;

  useEffect(() => {
    if (!rawUserId) return;

    // Cache local de identificadores activos para resolución ultrarrápida
    let activeTransportIds = new Set<string>();
    let activeOrderIds = new Set<string>();

    const updateActiveIds = async () => {
      try {
        const [trRes, ordRes] = await Promise.all([
          supabase
            .from('transport_requests')
            .select('id')
            .eq('user_id', rawUserId)
            .in('status', ['searching', 'accepted', 'arriving', 'in_progress', 'verifying_payment']),
          supabase
            .from('orders')
            .select('id')
            .eq('user_id', rawUserId)
            .not('status', 'in', '("completed","cancelled","cancelled_by_client","cancelled_by_store","rejected","delivered")')
        ]);

        if (trRes.data) {
          activeTransportIds = new Set(trRes.data.map(t => t.id));
        }
        if (ordRes.data) {
          activeOrderIds = new Set(ordRes.data.map(o => o.id));
        }
      } catch (err) {
        console.warn('Error fetching active IDs for in-app chat banner:', err);
      }
    };

    updateActiveIds();

    // Suscribirse a mensajes en tiempo real
    const channel = supabase
      .channel(`in_app_chat_notifications_${rawUserId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages'
      }, async (payload) => {
        const msg: any = payload.new;
        if (!msg) return;

        const senderId = msg.sender_id || msg.senderId;
        // Ignorar mensajes enviados por el usuario actual
        if (senderId && senderId === rawUserId) return;

        const orderId = msg.order_id || msg.orderId;
        const chatPath = msg.chat_path || msg.chatPath || '';

        // Extraer id de chatPath si existe (ej. transport_requests/UUID o orders/UUID)
        let resolvedTransportId: string | null = null;
        let resolvedOrderId: string | null = null;

        if (chatPath.includes('transport_requests/')) {
          resolvedTransportId = chatPath.split('transport_requests/')[1]?.split('/')[0];
        } else if (chatPath.includes('orders/')) {
          resolvedOrderId = chatPath.split('orders/')[1]?.split('/')[0];
        }

        if (orderId) {
          if (activeTransportIds.has(orderId)) {
            resolvedTransportId = orderId;
          } else if (activeOrderIds.has(orderId)) {
            resolvedOrderId = orderId;
          }
        }

        // Si no está en cache pero hay id, re-verificar
        if (!resolvedTransportId && !resolvedOrderId) {
          await updateActiveIds();
          if (orderId && activeTransportIds.has(orderId)) {
            resolvedTransportId = orderId;
          } else if (orderId && activeOrderIds.has(orderId)) {
            resolvedOrderId = orderId;
          }
        }

        const isTransport = Boolean(resolvedTransportId);
        const isOrder = Boolean(resolvedOrderId);

        if (!isTransport && !isOrder) return;

        const targetId = resolvedTransportId || resolvedOrderId!;
        const targetUrl = isTransport 
          ? `/taxi/track/${targetId}?chat=true` 
          : `/track/${targetId}?chat=true`;

        // Si el usuario ya está viendo esa pantalla y con el chat abierto, no tapar con el banner
        const isCurrentlyInThisChat = location.pathname.includes(targetId) && location.search.includes('chat=true');

        // Notificar por evento a los componentes que cuentan mensajes sin leer
        window.dispatchEvent(new CustomEvent('chat_message_received', {
          detail: {
            targetId,
            isTransport,
            text: msg.text,
            senderName: msg.sender_name || (isTransport ? 'Conductor' : 'Comercio')
          }
        }));

        // Si el usuario ya está chateando ahí, no hace falta el banner flotante grande
        if (isCurrentlyInThisChat) return;

        // Reproducir sonido fuerte de notificación
        playLoudMessageNotificationSound();
        vibrate(80);

        // Mensaje formateado
        let preview = msg.text || '';
        if (msg.audio_url || msg.audioUrl) {
          preview = '🎙️ Nota de voz';
        } else if (msg.image_url || msg.imageUrl) {
          preview = '📷 Foto adjunta';
        } else if (msg.action === 'lost_item_emergency') {
          preview = '📦 Reactivación por objeto olvidado';
        } else if (!preview) {
          preview = 'Ha enviado un mensaje';
        }

        const senderName = msg.sender_name 
          ? msg.sender_name 
          : isTransport 
          ? 'Tu Conductor' 
          : 'El Negocio';

        setNotification({
          id: msg.id || `${Date.now()}`,
          senderName,
          senderRole: msg.sender_role,
          preview,
          targetUrl,
          serviceType: isTransport ? 'transport' : 'order'
        });

        // Auto-ocultar a los 7 segundos
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
        hideTimerRef.current = setTimeout(() => {
          setNotification(null);
        }, 7000);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [rawUserId, location.pathname, location.search]);

  if (!notification) return null;

  const handleClickBanner = () => {
    vibrate(40);
    const url = notification.targetUrl;
    setNotification(null);
    navigate(url);
  };

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    vibrate(20);
    setNotification(null);
  };

  return (
    <aside 
      aria-label="Notificación de nuevo mensaje"
      onClick={handleClickBanner}
      className="fixed top-3 left-3 right-3 sm:left-auto sm:right-4 sm:max-w-md z-[99999] bg-slate-950/95 backdrop-blur-xl text-white rounded-3xl p-3.5 shadow-[0_20px_50px_rgba(0,0,0,0.45)] border-2 border-primary/40 cursor-pointer animate-in slide-in-from-top-6 duration-300 hover:scale-[1.01] active:scale-[0.99] transition-transform select-none"
    >
      <div className="flex items-center gap-3">
        {/* Icono con badge pulsante */}
        <div className="relative shrink-0 w-11 h-11 rounded-2xl bg-gradient-to-tr from-primary to-amber-300 flex items-center justify-center shadow-lg shadow-primary/20 text-slate-950">
          {notification.serviceType === 'transport' ? (
            <Car className="w-5 h-5 stroke-[2.5]" />
          ) : (
            <Store className="w-5 h-5 stroke-[2.5]" />
          )}
          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-slate-950 animate-ping"></span>
          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-slate-950"></span>
        </div>

        {/* Contenido del mensaje */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20 flex items-center gap-1">
              <MessageCircle className="w-2.5 h-2.5" />
              Nuevo Mensaje
            </span>
          </div>
          <h4 className="text-sm font-black text-white truncate mt-0.5">
            {notification.senderName}
          </h4>
          <p className="text-xs text-slate-300 font-medium truncate leading-tight">
            {notification.preview}
          </p>
        </div>

        {/* Acciones */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[11px] font-black bg-primary text-slate-950 px-2.5 py-1.5 rounded-xl flex items-center gap-1 shadow-sm">
            <span>Ver</span>
            <ChevronRight className="w-3.5 h-3.5 stroke-[3]" />
          </span>
          <button
            type="button"
            onClick={handleDismiss}
            className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
            title="Cerrar notificación"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
