import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { soundEngine, SoundEventKey } from '../lib/soundEngine';
import { toast } from 'react-hot-toast';

export type AppAudioRole = 'cpanel' | 'admin' | 'cashier' | 'restaurant' | 'delivery' | 'user';

export interface UseGlobalAudioAlertsOptions {
    role?: AppAudioRole;
    userId?: string;
    restaurantId?: string;
    enableToasts?: boolean;
}

/**
 * Hook Global de Alertas y Sonidos Dinámicos en Tiempo Real
 * Conecta los ciclos de vida de Pedidos, Viajes, Chats, Emergencias y Pagos
 * con el motor de audio centralizado `soundEngine`.
 */
export function useGlobalAudioAlerts(
    roleOrOptions?: AppAudioRole | UseGlobalAudioAlertsOptions,
    maybeUserId?: string
) {
    const options: UseGlobalAudioAlertsOptions = typeof roleOrOptions === 'string'
        ? { role: roleOrOptions, userId: maybeUserId }
        : (roleOrOptions || { role: 'cpanel' });

    const { role = 'cpanel', userId, restaurantId, enableToasts = true } = options;

    const [currentUserId, setCurrentUserId] = useState<string | null>(userId || null);
    const audioAlertsEnabledRef = useRef<boolean>(true);
    const hasInitializedRef = useRef<boolean>(false);

    // Inicializar el motor de audio al montar el hook
    useEffect(() => {
        if (!hasInitializedRef.current) {
            hasInitializedRef.current = true;
            soundEngine.initialize().catch((err) => {
                console.warn('[useGlobalAudioAlerts] Fallo inicializando soundEngine:', err);
            });
        }
    }, []);

    // Resolver usuario actual autenticado
    useEffect(() => {
        if (userId) {
            setCurrentUserId(userId);
            return;
        }

        supabase.auth.getSession().then(({ data }) => {
            if (data.session?.user?.id) {
                setCurrentUserId(data.session.user.id);
            }
        }).catch(() => {});
    }, [userId]);

    // Consultar preferencia del comercio si aplica (rol restaurant)
    useEffect(() => {
        const targetId = restaurantId || userId;
        if (role === 'restaurant' && targetId) {
            supabase
                .from('comercios')
                .select('audio_alerts_enabled')
                .eq('id', targetId)
                .maybeSingle()
                .then(({ data }) => {
                    if (data && data.audio_alerts_enabled !== undefined) {
                        audioAlertsEnabledRef.current = Boolean(data.audio_alerts_enabled);
                    }
                })
                .catch(() => {});
        }
    }, [role, userId, restaurantId]);

    // Helpers seguros para reproducir y detener sonidos
    const safePlay = useCallback((eventKey: SoundEventKey) => {
        if (!audioAlertsEnabledRef.current && role === 'restaurant') return;
        soundEngine.play(eventKey).catch((err) => {
            console.warn(`[useGlobalAudioAlerts] Error reproduciendo "${eventKey}":`, err);
        });
    }, [role]);

    const safeStop = useCallback((eventKey: SoundEventKey) => {
        soundEngine.stop(eventKey);
    }, []);

    // Configuración de canales de Supabase Realtime
    useEffect(() => {
        if (!supabase || typeof window === 'undefined') return;

        const channels: any[] = [];
        const channelPrefix = `audio_${role}_${Date.now()}`;

        // =====================================================================
        // A. CICLO COMPLETO DE PEDIDOS / ÓRDENES (public.orders)
        // =====================================================================
        const ordersChannel = supabase.channel(`${channelPrefix}_orders`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'orders' },
                (payload: any) => {
                    const { eventType, new: newOrder, old: oldOrder } = payload;

                    // Si es para un comercio específico, filtrar pedidos
                    const currentRestId = restaurantId || (role === 'restaurant' ? userId : null);
                    if (currentRestId && newOrder?.restaurant_id && newOrder.restaurant_id !== currentRestId) {
                        return;
                    }

                    // Si es para un cliente específico
                    if (role === 'user' && currentUserId && newOrder?.user_id && newOrder.user_id !== currentUserId) {
                        return;
                    }

                    // 1. NUEVO PEDIDO ENTRANTE (INSERT o paso a estado inicial/pendiente)
                    if (eventType === 'INSERT') {
                        const status = (newOrder?.status || '').toLowerCase();
                        const isPending = !status || status === 'pending' || status === 'nuevo' || status === 'buscando_piloto';

                        if (isPending) {
                            if (role === 'cpanel' || role === 'admin' || role === 'cashier' || role === 'restaurant') {
                                safePlay('notif_new_order');
                                if (enableToasts) {
                                    toast('🔔 ¡Nuevo pedido entrante!', { icon: '📦' });
                                }
                            }
                        }
                        return;
                    }

                    // 2. ACTUALIZACIONES DE ESTADO (UPDATE)
                    if (eventType === 'UPDATE' && newOrder) {
                        const oldStatus = (oldOrder?.status || '').toLowerCase().trim();
                        const newStatus = (newOrder?.status || '').toLowerCase().trim();

                        // Apagar bucle de nuevo pedido si sale de pendiente
                        const wasPending = !oldStatus || oldStatus === 'pending' || oldStatus === 'nuevo' || oldStatus === 'buscando_piloto';
                        const isNoLongerPending = newStatus && newStatus !== 'pending' && newStatus !== 'nuevo' && newStatus !== 'buscando_piloto';

                        if (wasPending && isNoLongerPending) {
                            safeStop('notif_new_order');
                        }

                        // Si el estado no cambió y no hubo asignación de driver, no disparar eventos repetidos
                        const oldDriver = oldOrder?.driver_id || oldOrder?.delivery_driver_id;
                        const newDriver = newOrder?.driver_id || newOrder?.delivery_driver_id;
                        const driverAssigned = !oldDriver && Boolean(newDriver);

                        if (oldStatus === newStatus && !driverAssigned) {
                            return;
                        }

                        // Asignación de repartidor
                        if (driverAssigned || newStatus === 'assigned' || newStatus === 'piloto_asignado') {
                            safePlay('cycle_driver_assigned');
                            if (enableToasts && (role === 'cpanel' || role === 'admin' || role === 'cashier' || role === 'user')) {
                                toast.success('Piloto asignado al pedido');
                            }
                        }

                        // Pedido aceptado / en cocina
                        if (
                            newStatus === 'accepted' ||
                            newStatus === 'aceptado' ||
                            newStatus === 'preparing' ||
                            newStatus === 'en_preparacion' ||
                            newStatus === 'cooking'
                        ) {
                            safePlay('cycle_order_accepted');
                            if (enableToasts && role === 'user') {
                                toast.success('El comercio ha aceptado tu pedido y está en preparación');
                            }
                        }

                        // Pedido listo para despacho / retirar
                        else if (
                            newStatus === 'ready' ||
                            newStatus === 'listo' ||
                            newStatus === 'ready_for_pickup' ||
                            newStatus === 'empaquetado'
                        ) {
                            safePlay('cycle_order_ready');
                            if (enableToasts) {
                                toast.success('Pedido listo para ser retirado');
                            }
                        }

                        // Pedido en camino / tránsito
                        else if (
                            newStatus === 'on_the_way' ||
                            newStatus === 'in_transit' ||
                            newStatus === 'en_camino' ||
                            newStatus === 'delivering' ||
                            newStatus === 'picked_up'
                        ) {
                            safePlay('cycle_order_in_transit');
                            if (enableToasts && role === 'user') {
                                toast.success('Tu pedido va en camino');
                            }
                        }

                        // Repartidor llegó al destino
                        else if (
                            newStatus === 'arrived' ||
                            newStatus === 'llegado' ||
                            newStatus === 'en_sitio'
                        ) {
                            safePlay('cycle_driver_arrived');
                            if (enableToasts && role === 'user') {
                                toast.success('¡El repartidor ha llegado a tu ubicación!');
                            }
                        }

                        // Pedido entregado con éxito
                        else if (
                            newStatus === 'delivered' ||
                            newStatus === 'entregado' ||
                            newStatus === 'completed' ||
                            newStatus === 'completado' ||
                            newStatus === 'finalizado'
                        ) {
                            safePlay('done_order_delivered');
                            if (enableToasts) {
                                toast.success('¡Pedido entregado exitosamente!');
                            }
                        }

                        // Pedido cancelado / rechazado (detener bucle por si acaso)
                        else if (
                            newStatus === 'cancelled' ||
                            newStatus === 'canceled' ||
                            newStatus === 'cancelado' ||
                            newStatus === 'rejected' ||
                            newStatus === 'rechazado'
                        ) {
                            safeStop('notif_new_order');
                        }
                    }
                }
            )
            .subscribe();

        channels.push(ordersChannel);

        // =====================================================================
        // B. CICLO DE TRANSPORTE / VIAJES (public.transport_requests)
        // =====================================================================
        const transportChannel = supabase.channel(`${channelPrefix}_transport`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'transport_requests' },
                (payload: any) => {
                    const { eventType, new: newRide, old: oldRide } = payload;

                    // Si es usuario individual
                    if (role === 'user' && currentUserId && newRide?.user_id && newRide.user_id !== currentUserId) {
                        return;
                    }

                    // 1. NUEVA SOLICITUD DE VIAJE (INSERT)
                    if (eventType === 'INSERT') {
                        const status = (newRide?.status || '').toLowerCase();
                        if (status === 'searching' || status === 'pending' || !status) {
                            if (role === 'cpanel' || role === 'admin' || role === 'delivery') {
                                safePlay('notif_new_order');
                                if (enableToasts && (role === 'cpanel' || role === 'admin')) {
                                    toast('🚖 ¡Nueva solicitud de transporte!', { icon: '📍' });
                                }
                            }
                        }
                        return;
                    }

                    // 2. ACTUALIZACIONES DE VIAJE (UPDATE)
                    if (eventType === 'UPDATE' && newRide) {
                        const oldStatus = (oldRide?.status || '').toLowerCase().trim();
                        const newStatus = (newRide?.status || '').toLowerCase().trim();

                        // Detener loop de búsqueda si ya no está en searching
                        if (oldStatus === 'searching' && newStatus !== 'searching') {
                            safeStop('notif_new_order');
                        }

                        const driverAssigned = !oldRide?.driver_id && Boolean(newRide.driver_id);

                        // Conductor asignado / aceptó
                        if (driverAssigned || (oldStatus !== 'accepted' && newStatus === 'accepted')) {
                            safePlay('cycle_driver_assigned');
                            if (enableToasts && role === 'user') {
                                toast.success('Conductor asignado en camino');
                            }
                        }

                        // Conductor llegó a recoger al pasajero
                        else if (newStatus === 'arriving' || newStatus === 'arrived') {
                            safePlay('cycle_driver_arrived');
                            if (enableToasts && role === 'user') {
                                toast.success('Tu conductor ha llegado');
                            }
                        }

                        // Viaje en curso / iniciado
                        else if (
                            newStatus === 'in_progress' ||
                            newStatus === 'started' ||
                            newStatus === 'picked_up'
                        ) {
                            safePlay('cycle_ride_started');
                            if (enableToasts) {
                                toast.success('Viaje en curso');
                            }
                        }

                        // Viaje finalizado con éxito
                        else if (newStatus === 'completed' || newStatus === 'finished') {
                            safePlay('done_ride_completed');
                            if (enableToasts) {
                                toast.success('Viaje finalizado exitosamente');
                            }
                        }

                        // Viaje cancelado
                        else if (newStatus === 'cancelled' || newStatus === 'canceled' || newStatus === 'disputed') {
                            safeStop('notif_new_order');
                        }
                    }
                }
            )
            .subscribe();

        channels.push(transportChannel);

        // =====================================================================
        // C. NOTIFICACIONES DE CHATS (public.messages)
        // =====================================================================
        const messagesChannel = supabase.channel(`${channelPrefix}_messages`)
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'messages' },
                (payload: any) => {
                    const msg = payload.new;
                    if (!msg) return;

                    // Manejo de emergencias SOS en el chat
                    if (msg.action === 'lost_item_emergency') {
                        safePlay('notif_emergency_sos');
                        if (enableToasts) {
                            toast.error('🚨 ¡Alerta SOS / Emergencia en viaje!');
                        }
                        return;
                    }

                    if (msg.action === 'lost_item_resolved') {
                        safeStop('notif_emergency_sos');
                        return;
                    }

                    // Si el remitente es el mismo usuario local, no disparar sonido
                    const isSelf = currentUserId && (
                        msg.sender_id === currentUserId ||
                        msg.senderId === currentUserId
                    );
                    if (isSelf) return;

                    // Sonido de chat pop
                    safePlay('notif_new_chat');
                }
            )
            .subscribe();

        channels.push(messagesChannel);

        // =====================================================================
        // D. EMERGENCIAS Y SOS (public.emergency_services & public.lost_items)
        // =====================================================================
        if (role === 'cpanel' || role === 'admin') {
            const emergencyChannel = supabase.channel(`${channelPrefix}_emergencies`)
                .on(
                    'postgres_changes',
                    { event: '*', schema: 'public', table: 'emergency_services' },
                    (payload: any) => {
                        const { eventType, new: newService, old: oldService } = payload;
                        if (eventType === 'INSERT' && newService?.is_active !== false) {
                            safePlay('notif_emergency_sos');
                            if (enableToasts) {
                                toast.error('🚨 ¡Nuevo reporte o servicio de emergencia!');
                            }
                        } else if (eventType === 'UPDATE') {
                            if (newService?.is_active === false) {
                                safeStop('notif_emergency_sos');
                            } else if (oldService?.is_active === false && newService?.is_active === true) {
                                safePlay('notif_emergency_sos');
                            }
                        }
                    }
                )
                .on(
                    'postgres_changes',
                    { event: '*', schema: 'public', table: 'lost_items' },
                    (payload: any) => {
                        const { eventType, new: newItem } = payload;
                        if (eventType === 'INSERT' && newItem?.status === 'active') {
                            safePlay('notif_emergency_sos');
                        } else if (eventType === 'UPDATE' && newItem?.status === 'resolved') {
                            safeStop('notif_emergency_sos');
                        }
                    }
                )
                .subscribe();

            channels.push(emergencyChannel);
        }

        // =====================================================================
        // E. TICKETS DE SOPORTE (public.support_tickets)
        // =====================================================================
        if (role === 'cpanel' || role === 'admin') {
            const ticketsChannel = supabase.channel(`${channelPrefix}_support`)
                .on(
                    'postgres_changes',
                    { event: 'INSERT', schema: 'public', table: 'support_tickets' },
                    () => {
                        safePlay('notif_support_ticket');
                        if (enableToasts) {
                            toast('🎫 Nuevo ticket de soporte creado', { icon: '🛎️' });
                        }
                    }
                )
                .subscribe();

            channels.push(ticketsChannel);
        }

        // =====================================================================
        // F. LIQUIDACIONES Y PAGOS (public.driver_commission_payments & payouts)
        // =====================================================================
        const paymentsChannel = supabase.channel(`${channelPrefix}_payments`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'driver_commission_payments' },
                (payload: any) => {
                    const { eventType, new: payment, old: oldPayment } = payload;
                    if (eventType === 'UPDATE' && payment) {
                        const wasVerified = oldPayment?.status === 'verified' || oldPayment?.status === 'approved';
                        const isVerified = payment.status === 'verified' || payment.status === 'approved' || Boolean(payment.verified_at);

                        if (!wasVerified && isVerified) {
                            safePlay('done_payment_verified');
                            if (enableToasts) {
                                toast.success('💰 Liquidación/pago verificado con éxito');
                            }
                        }
                    }
                }
            )
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'payouts_history' },
                () => {
                    safePlay('done_payment_verified');
                }
            )
            .subscribe();

        channels.push(paymentsChannel);

        // =====================================================================
        // CLEANUP: Limpiar y remover todos los canales Realtime suscritos
        // =====================================================================
        return () => {
            channels.forEach((ch) => {
                try {
                    supabase.removeChannel(ch);
                } catch (e) {
                    console.warn('[useGlobalAudioAlerts] Error al desuscribir canal:', e);
                }
            });
        };
    }, [role, currentUserId, restaurantId, enableToasts, safePlay, safeStop]);

    return {
        stopAllLoops: () => soundEngine.stopAllLoops(),
        playSound: (eventKey: SoundEventKey) => soundEngine.play(eventKey),
        stopSound: (eventKey: SoundEventKey) => soundEngine.stop(eventKey),
        soundEngine
    };
}
