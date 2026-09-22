import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { sendAppNotification } from '../services/nativeNotificationService';

export const NOTIFICATION_SOUND_URL = "https://xfialzrbbsdzzcjtefqo.supabase.co/storage/v1/object/public/store_assets/Digital_Cascade_01.mp3";
export const CPANEL_SOUND_URL = "https://xfialzrbbsdzzcjtefqo.supabase.co/storage/v1/object/public/store_assets/telefono_off.mp3";

export async function getCachedAudioUrl(url: string, cacheKey: string): Promise<string> {
    try {
        if (!('caches' in window)) return url;
        const cache = await caches.open('arepa-audio-cache-v1');
        const response = await cache.match(cacheKey);
        if (response) {
            const blob = await response.blob();
            return URL.createObjectURL(blob);
        }
        const fetchRes = await fetch(url);
        if (fetchRes.ok) {
            await cache.put(cacheKey, fetchRes.clone());
            const blob = await fetchRes.blob();
            return URL.createObjectURL(blob);
        }
        return url;
    } catch (e) {
        console.error("Audio Cache Error:", e);
        return url;
    }
}

export function useGlobalAudioAlerts(role?: 'cpanel' | 'restaurant' | 'delivery' | 'user', userId?: string) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cpanelAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioAlertsEnabledRef = useRef<boolean>(true);

  useEffect(() => {
    const initAudio = async () => {
      const deliveryUrl = await getCachedAudioUrl(NOTIFICATION_SOUND_URL, 'delivery-sound');
      const cpanelUrl = await getCachedAudioUrl(CPANEL_SOUND_URL, 'cpanel-sound');
      
      audioRef.current = new Audio(deliveryUrl);
      audioRef.current.preload = 'auto';

      cpanelAudioRef.current = new Audio(cpanelUrl);
      cpanelAudioRef.current.preload = 'auto';
    };
    initAudio();
  }, []);

  useEffect(() => {
    if (!role) return;

    const channels: any[] = [];

    const playAlert = () => {
      if (!audioAlertsEnabledRef.current && role !== 'cpanel') return;
      
      const audioToPlay = role === 'cpanel' ? cpanelAudioRef.current : audioRef.current;

      if (audioToPlay) {
        audioToPlay.currentTime = 0;
        audioToPlay.play().catch((err) => {
          console.log('Reproducción automática de audio bloqueada por el navegador:', err);
        });
      }
    };

    if (role === 'cpanel') {
      const cpanelChannel = supabase.channel('cpanel_audio_alerts')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'profiles' }, () => {
          playAlert();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'transport_requests' }, (payload: any) => {
          if (payload.eventType === 'INSERT' && (payload.new?.status === 'searching' || payload.new?.status === 'verifying_payment')) {
            playAlert();
          } else if (payload.new?.payment_requested === true && payload.new?.driver_paid === false) {
            playAlert();
          }
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comercios' }, () => {
          playAlert();
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'banners' }, () => {
          playAlert();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload: any) => {
          if (payload.new?.payment_requested === true && payload.new?.delivery_paid === false) {
            playAlert();
          }
        })
        .subscribe();

      channels.push(cpanelChannel);
    }

    if (role === 'restaurant' && userId) {
      const checkPref = async () => {
        const { data } = await supabase
          .from('comercios')
          .select('audio_alerts_enabled')
          .eq('id', userId)
          .maybeSingle();
        if (data && data.audio_alerts_enabled !== undefined) {
          audioAlertsEnabledRef.current = data.audio_alerts_enabled;
        }
      };
      checkPref();

      const resChannel = supabase.channel(`res_alerts_${userId}`)
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'comercios',
          filter: `id=eq.${userId}`
        }, (payload: any) => {
          if (payload.new?.audio_alerts_enabled !== undefined) {
            audioAlertsEnabledRef.current = payload.new.audio_alerts_enabled;
          }
        })
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'orders',
          filter: `restaurant_id=eq.${userId}`
        }, (payload: any) => {
          if (payload.new?.status === 'pending') {
            playAlert();
          }
        })
        .subscribe();

      channels.push(resChannel);
    }

    if (role === 'delivery' && userId) {
      const delChannel = supabase.channel(`delivery_alerts_${userId}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'transport_requests'
        }, (payload: any) => {
          if (payload.new?.status === 'searching') {
            playAlert();
          }
        })
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'orders'
        }, (payload: any) => {
          if (payload.new?.status === 'buscando_piloto') {
            playAlert();
          }
        })
        .subscribe();

      channels.push(delChannel);
    }

    if (role === 'user' && userId) {
      const userChannel = supabase.channel(`user_alerts_${userId}`)
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'transport_requests',
          filter: `user_id=eq.${userId}`
        }, (payload: any) => {
          const status = payload.new?.status;
          if (status === 'accepted') {
            sendAppNotification({
              title: '¡Conductor Asignado!',
              body: 'Un conductor ha aceptado tu viaje y va en camino.',
              soundType: 'client'
            });
          } else if (status === 'arrived' || status === 'arriving') {
            sendAppNotification({
              title: '¡Tu Conductor Ha Llegado!',
              body: 'Tu conductor ya está en el punto de encuentro esperándote.',
              soundType: 'client'
            });
          } else if (status === 'started' || status === 'in_progress') {
            sendAppNotification({
              title: '¡Viaje en Curso!',
              body: 'Tu viaje ha iniciado. ¡Que tengas un excelente recorrido!',
              soundType: 'client'
            });
          } else if (status === 'completed') {
            sendAppNotification({
              title: '¡Has Llegado a tu Destino!',
              body: 'Viaje finalizado exitosamente. ¡Gracias por viajar con nosotros!',
              soundType: 'client'
            });
          }
        })
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `user_id=eq.${userId}`
        }, (payload: any) => {
          const status = payload.new?.status;
          if (status === 'preparing') {
            sendAppNotification({
              title: 'Pedido en Preparación 👨‍🍳',
              body: 'El comercio ha recibido tu orden y la está preparando.',
              soundType: 'client'
            });
          } else if (status === 'ready' || status === 'buscando_piloto') {
            sendAppNotification({
              title: 'Pedido Listo 📦',
              body: 'Tu orden está lista y buscando repartidor para la entrega.',
              soundType: 'client'
            });
          } else if (status === 'delivering') {
            sendAppNotification({
              title: '¡Tu Pedido va en Camino! 🛵',
              body: 'El repartidor lleva tu pedido directamente hacia tu dirección.',
              soundType: 'client'
            });
          } else if (status === 'delivered') {
            sendAppNotification({
              title: '¡Pedido Entregado! 🎉',
              body: 'El repartidor ha llegado con tu pedido. ¡Buen provecho!',
              soundType: 'client'
            });
          }
        })
        .subscribe();

      channels.push(userChannel);
    }

    return () => {
      channels.forEach(ch => supabase.removeChannel(ch));
    };
  }, [role, userId]);
}
