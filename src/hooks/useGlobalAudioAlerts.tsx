import { useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { toast } from 'react-hot-toast';

export const NOTIFICATION_SOUND_URL = "https://firebasestorage.googleapis.com/v0/b/arepa-express-ve-2026.firebasestorage.app/o/Digital_Cascade_01.mp3?alt=media&token=211ed9a7-2b49-469f-8869-3fc2cd38d2f5";
export const CPANEL_SOUND_URL = "https://firebasestorage.googleapis.com/v0/b/arepa-express-ve-2026.firebasestorage.app/o/telefono%20off.mp3?alt=media&token=0ff6e148-e342-48e1-95df-7a2c546bc8a6";

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

    let unsubscribes: (() => void)[] = [];

    const playAlert = () => {
      if (!audioAlertsEnabledRef.current && role !== 'cpanel') return;
      
      const audioToPlay = role === 'cpanel' ? cpanelAudioRef.current : audioRef.current;

      if (audioToPlay) {
        // Reset time to play multiple overlapping sounds in succession if needed
        audioToPlay.currentTime = 0;
        audioToPlay.play().catch((err) => {
          console.log('Reproducción automática de audio bloqueada por el navegador:', err);
        });
      }
    };

    if (role === 'cpanel') {
      // 1. Nuevos usuarios
      let initialUsers = true;
      unsubscribes.push(
        onSnapshot(query(collection(db, 'users')), (snapshot) => {
          if (initialUsers) {
            initialUsers = false;
            return;
          }
          snapshot.docChanges().forEach(change => {
            if (change.type === 'added') playAlert();
          });
        })
      );

      // 2. Nuevos transportes (searching)
      let initialTransports = true;
      unsubscribes.push(
        onSnapshot(query(collection(db, 'transport_requests'), where('status', '==', 'searching')), (snapshot) => {
          if (initialTransports) {
            initialTransports = false;
            return;
          }
          snapshot.docChanges().forEach(change => {
            if (change.type === 'added') playAlert();
          });
        })
      );

      // 2b. Transportes pendientes de verificación de pago
      let initialPaymentVerifications = true;
      unsubscribes.push(
        onSnapshot(query(collection(db, 'transport_requests'), where('status', '==', 'verifying_payment')), (snapshot) => {
          if (initialPaymentVerifications) {
            initialPaymentVerifications = false;
            return;
          }
          snapshot.docChanges().forEach(change => {
            if (change.type === 'added') playAlert();
          });
        })
      );

      // 3. Nuevos restaurantes
      let initialRestaurants = true;
      unsubscribes.push(
        onSnapshot(query(collection(db, 'restaurants')), (snapshot) => {
          if (initialRestaurants) {
            initialRestaurants = false;
            return;
          }
          snapshot.docChanges().forEach(change => {
            // Un nuevo restaurante que no viene de mock data
            if (change.type === 'added' && !change.doc.data().isMock) playAlert();
          });
        })
      );

      // 4. Banners pendientes
      let initialBanners = true;
      unsubscribes.push(
        onSnapshot(query(collection(db, 'banners'), where('status', '==', 'pending_approval')), (snapshot) => {
          if (initialBanners) {
            initialBanners = false;
            return;
          }
          snapshot.docChanges().forEach(change => {
            if (change.type === 'added') playAlert();
          });
        })
      );
      
      // 5. Verificaciones de identidad pendientes (Documentos subidos)
      let initialVerifications = true;
      unsubscribes.push(
        onSnapshot(query(collection(db, 'users'), where('verificationStatus', '==', 'pending')), (snapshot) => {
          if (initialVerifications) {
            initialVerifications = false;
            return;
          }
          // Para verificaciones, si el usuario cambió su estado a 'pending', disparamos el audio
          snapshot.docChanges().forEach(change => {
            if (change.type === 'added' || change.type === 'modified') {
                if (change.doc.data().verificationStatus === 'pending') {
                   playAlert();
                }
            }
          });
        })
      );

      // 6. Solicitudes de pago pendientes
      let initialPayoutsOrders = true;
      unsubscribes.push(
        onSnapshot(query(collection(db, 'orders'), where('paymentRequested', '==', true), where('deliveryPaid', '==', false)), (snapshot) => {
          if (initialPayoutsOrders) {
            initialPayoutsOrders = false;
            return;
          }
          snapshot.docChanges().forEach(change => {
            if (change.type === 'added' || (change.type === 'modified' && change.doc.data().paymentRequested === true)) playAlert();
          });
        })
      );

      let initialPayoutsTransports = true;
      unsubscribes.push(
        onSnapshot(query(collection(db, 'transport_requests'), where('paymentRequested', '==', true), where('driverPaid', '==', false)), (snapshot) => {
          if (initialPayoutsTransports) {
            initialPayoutsTransports = false;
            return;
          }
          snapshot.docChanges().forEach(change => {
            if (change.type === 'added' || (change.type === 'modified' && change.doc.data().paymentRequested === true)) playAlert();
          });
        })
      );
    }

    if (role === 'restaurant' && userId) {
      // Preference Listener for Sound
      unsubscribes.push(
        onSnapshot(doc(db, 'restaurants', userId), (snap) => {
            if (snap.exists()) {
                audioAlertsEnabledRef.current = snap.data().audioAlertsEnabled ?? true;
            }
        })
      );

      // Nuevos pedidos para este restaurante
      let initialOrders = true;
      unsubscribes.push(
        onSnapshot(
          query(collection(db, 'orders'), where('restaurantId', '==', userId), where('status', '==', 'pending')), 
          (snapshot) => {
            if (initialOrders) {
              initialOrders = false;
              return;
            }
            snapshot.docChanges().forEach(change => {
              if (change.type === 'added') playAlert();
            });
          }
        )
      );
    }

    if (role === 'delivery' && userId) {
      // Preference Listener for Sound
      unsubscribes.push(
        onSnapshot(doc(db, 'delivery_drivers', userId), (snap) => {
            if (snap.exists()) {
                audioAlertsEnabledRef.current = snap.data().audioAlertsEnabled ?? true;
            }
        })
      );

      // Nuevas solicitudes de transporte Globales (searching)
      let initialDeliveryRequests = true;
      unsubscribes.push(
        onSnapshot(query(collection(db, 'transport_requests'), where('status', '==', 'searching')), (snapshot) => {
          if (initialDeliveryRequests) {
            initialDeliveryRequests = false;
            return;
          }
          snapshot.docChanges().forEach(change => {
            if (change.type === 'added') playAlert();
          });
        })
      );

      // Nuevas órdenes de comida (buscando_piloto)
      let initialDeliveryOrders = true;
      unsubscribes.push(
        onSnapshot(query(collection(db, 'orders'), where('status', '==', 'buscando_piloto'), where('eligibleDrivers', 'array-contains', userId)), (snapshot) => {
          if (initialDeliveryOrders) {
            initialDeliveryOrders = false;
            return;
          }
          snapshot.docChanges().forEach(change => {
            if (change.type === 'added') playAlert();
          });
        })
      );
    }

    if (role === 'user' && userId) {
      // Actualizaciones de transporte (conductor aceptó o conductor llegó)
      let initialUserTransports = true;
      unsubscribes.push(
        onSnapshot(query(collection(db, 'transport_requests'), where('userId', '==', userId)), (snapshot) => {
          if (initialUserTransports) {
            initialUserTransports = false;
            return;
          }
          snapshot.docChanges().forEach(change => {
             if (change.type === 'modified') {
                 const data = change.doc.data();
                 if (data.status === 'accepted') {
                     toast.success('¡Un conductor ha aceptado tu viaje!');
                     playAlert();
                 } else if (data.status === 'arrived') {
                     toast.success('¡Tu conductor ha llegado!');
                     playAlert();
                 } else if (data.status === 'started') {
                     toast.success('¡Viaje iniciado!');
                     playAlert();
                 } else if (data.status === 'completed') {
                     toast.success('¡Viaje finalizado exitosamente!');
                     playAlert();
                 }
             }
          });
        })
      );
      
      // Actualizaciones de pedidos
      let initialUserOrders = true;
      unsubscribes.push(
        onSnapshot(query(collection(db, 'orders'), where('userId', '==', userId)), (snapshot) => {
          if (initialUserOrders) {
            initialUserOrders = false;
            return;
          }
          snapshot.docChanges().forEach(change => {
             if (change.type === 'modified') {
                 const data = change.doc.data();
                 if (data.status === 'preparing') {
                     toast.success('El restaurante está preparando tu pedido.');
                     playAlert();
                 } else if (data.status === 'ready') {
                     toast.success('Tu pedido está listo y buscando repartidor.');
                     playAlert();
                 } else if (data.status === 'delivering') {
                     toast.success('¡Tu pedido va en camino!');
                     playAlert();
                 } else if (data.status === 'delivered') {
                     toast.success('¡El repartidor ha llegado con tu pedido!');
                     playAlert();
                 }
             }
          });
        })
      );
    }

    return () => {
      unsubscribes.forEach(unsub => unsub());
    };

  }, [role, userId]);

}
