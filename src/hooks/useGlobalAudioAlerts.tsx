import { useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';

const NOTIFICATION_SOUND_URL = "https://firebasestorage.googleapis.com/v0/b/arepa-express-ve-2026.firebasestorage.app/o/Digital_Cascade_01.mp3?alt=media";

export function useGlobalAudioAlerts(role?: 'cpanel' | 'restaurant' | 'delivery' | 'user', userId?: string) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioAlertsEnabledRef = useRef<boolean>(true);

  useEffect(() => {
    audioRef.current = new Audio(NOTIFICATION_SOUND_URL);
    audioRef.current.preload = 'auto';
  }, []);

  useEffect(() => {
    if (!role) return;

    let unsubscribes: (() => void)[] = [];

    const playAlert = () => {
      if (!audioAlertsEnabledRef.current && role !== 'cpanel') return;
      
      if (audioRef.current) {
        // Reset time to play multiple overlapping sounds in succession if needed
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch((err) => {
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

      // 2. Nuevos transportes o delivery
      let initialTransports = true;
      unsubscribes.push(
        onSnapshot(query(collection(db, 'transport_requests'), where('status', '==', 'pending')), (snapshot) => {
          if (initialTransports) {
            initialTransports = false;
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

      // Nuevas solicitudes de transporte Globales (pending)
      let initialDeliveryRequests = true;
      unsubscribes.push(
        onSnapshot(query(collection(db, 'transport_requests'), where('status', '==', 'pending')), (snapshot) => {
          if (initialDeliveryRequests) {
            initialDeliveryRequests = false;
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
                 if (data.status === 'accepted' || data.status === 'arrived' || data.status === 'started') {
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
                 if (data.status === 'preparing' || data.status === 'ready' || data.status === 'delivering' || data.status === 'delivered') {
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
