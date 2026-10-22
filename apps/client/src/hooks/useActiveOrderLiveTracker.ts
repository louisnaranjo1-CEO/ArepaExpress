import { useEffect, useRef, useState, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { OrderLiveNotification } from '../plugins/orderLiveNotification';

export type OrderStep = 1 | 2 | 3 | 4;

export interface StepResolution {
    step: OrderStep;
    statusText: string;
}

export const ACTIVE_ORDER_STATUSES = [
    'pending',
    'accepted',
    'preparing',
    'ready',
    'on_the_way',
    'in_transit',
    'delivering',
    'en_camino',
] as const;

export const TERMINAL_ORDER_STATUSES = [
    'delivered',
    'completed',
    'cancelled',
    'rejected',
    'cancelled_by_client',
    'cancelled_by_store',
] as const;

/**
 * Convierte automáticamente el estado y sub-estado del pedido en el paso (1 a 4) correspondiente:
 * - Paso 1 (pending, accepted): "Pedido confirmado por el comercio"
 * - Paso 2 (preparing, ready): "Preparando tu pedido"
 * - Paso 3 (on_the_way o delivery_status === 'picked_up'): "En camino con tu repartidor"
 * - Paso 4 (delivery_status === 'arrived'): "¡Tu repartidor llegó a la entrega!"
 */
export function resolveOrderStepAndStatus(order: any): StepResolution {
    const status = String(order?.status || '').toLowerCase();
    const deliveryStatus = String(order?.delivery_status || '').toLowerCase();

    // Paso 4: Llegada del repartidor al destino
    if (deliveryStatus === 'arrived') {
        return {
            step: 4,
            statusText: '¡Tu repartidor llegó a la entrega!',
        };
    }

    // Paso 3: En camino / Repartidor con el paquete
    if (
        status === 'on_the_way' ||
        status === 'in_transit' ||
        status === 'delivering' ||
        status === 'en_camino' ||
        deliveryStatus === 'picked_up' ||
        deliveryStatus === 'in_transit'
    ) {
        return {
            step: 3,
            statusText: 'En camino con tu repartidor',
        };
    }

    // Paso 2: Preparando en cocina o empaquetando
    if (status === 'preparing' || status === 'ready') {
        return {
            step: 2,
            statusText: status === 'ready' ? 'Pedido listo para entrega' : 'Preparando tu pedido',
        };
    }

    // Paso 1: Pedido confirmado por el comercio
    return {
        step: 1,
        statusText: 'Pedido confirmado por el comercio',
    };
}

/**
 * Hook para monitorear en tiempo real el pedido activo del usuario y sincronizar
 * la barra de notificación Ongoing (Android) y el Widget de la pantalla de inicio.
 */
export function useActiveOrderLiveTracker(customUserId?: string | null) {
    const { user } = useAuth();
    const currentUserId = customUserId ?? (user?.id || (user as any)?.uid || null);

    const [activeOrder, setActiveOrder] = useState<any | null>(null);
    const [stepInfo, setStepInfo] = useState<StepResolution | null>(null);
    const lastTrackedOrderIdRef = useRef<string | null>(null);

    /**
     * Envía la actualización nativa a la barra de notificación y widget si estamos en plataforma nativa
     */
    const syncNativeNotification = useCallback(async (order: any) => {
        if (!Capacitor.isNativePlatform() || !order) return;

        const resolved = resolveOrderStepAndStatus(order);
        setStepInfo(resolved);
        lastTrackedOrderIdRef.current = order.id;

        const eta = order.preparation_time_minutes
            ? `${order.preparation_time_minutes} min`
            : 'En curso';

        const restaurant = order.restaurant_name || order.store_name || 'Un 2x3';
        const driver = order.driver_name || order.delivery_driver_name || undefined;

        try {
            await OrderLiveNotification.startOrUpdateOrder({
                orderId: order.id,
                restaurantName: restaurant,
                statusText: resolved.statusText,
                step: resolved.step,
                etaText: eta,
                driverName: driver,
            });
        } catch (err) {
            console.error('[useActiveOrderLiveTracker] Error starting/updating live notification:', err);
        }
    }, []);

    /**
     * Detiene la notificación persistente y limpia el widget
     */
    const stopNativeNotification = useCallback(async (orderId?: string) => {
        if (!Capacitor.isNativePlatform()) return;

        const idToStop = orderId || lastTrackedOrderIdRef.current;
        if (!idToStop) return;

        try {
            await OrderLiveNotification.stopOrder({ orderId: idToStop });
        } catch (err) {
            console.error('[useActiveOrderLiveTracker] Error stopping live notification:', err);
        } finally {
            lastTrackedOrderIdRef.current = null;
            setActiveOrder(null);
            setStepInfo(null);
        }
    }, []);

    /**
     * Consulta el pedido activo más reciente en Supabase
     */
    const fetchActiveOrder = useCallback(async () => {
        if (!currentUserId) {
            if (lastTrackedOrderIdRef.current) {
                await stopNativeNotification();
            }
            setActiveOrder(null);
            setStepInfo(null);
            return;
        }

        try {
            const { data, error } = await supabase
                .from('orders')
                .select('*')
                .eq('user_id', currentUserId)
                .in('status', ACTIVE_ORDER_STATUSES as unknown as string[])
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (error) {
                console.error('[useActiveOrderLiveTracker] Error fetching active order:', error);
                return;
            }

            if (data) {
                setActiveOrder(data);
                await syncNativeNotification(data);
            } else {
                // Si no hay órdenes activas y teníamos una previa registrada, detenerla
                if (lastTrackedOrderIdRef.current) {
                    await stopNativeNotification();
                }
            }
        } catch (err) {
            console.error('[useActiveOrderLiveTracker] Unexpected error:', err);
        }
    }, [currentUserId, syncNativeNotification, stopNativeNotification]);

    // 1. Carga inicial y cambios de usuario
    useEffect(() => {
        fetchActiveOrder();
    }, [fetchActiveOrder]);

    // 2. Suscripción en tiempo real vía Supabase Realtime
    useEffect(() => {
        if (!currentUserId) return;

        const channel = supabase
            .channel(`live_order_tracker_${currentUserId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'orders',
                    filter: `user_id=eq.${currentUserId}`,
                },
                async (payload) => {
                    if (payload.eventType === 'DELETE') {
                        const oldId = (payload.old as any)?.id;
                        if (oldId === lastTrackedOrderIdRef.current) {
                            await stopNativeNotification(oldId);
                        }
                        return;
                    }

                    const newOrder = payload.new as any;
                    if (!newOrder) return;

                    const isTerminal = (TERMINAL_ORDER_STATUSES as readonly string[]).includes(newOrder.status);

                    if (isTerminal) {
                        // Si la orden actual pasa a completada, cancelada o rechazada:
                        if (lastTrackedOrderIdRef.current === newOrder.id) {
                            await stopNativeNotification(newOrder.id);
                        }
                        // Verificar si el usuario tiene otra orden en paralelo
                        await fetchActiveOrder();
                        return;
                    }

                    const isActive = (ACTIVE_ORDER_STATUSES as readonly string[]).includes(newOrder.status);
                    if (isActive) {
                        setActiveOrder(newOrder);
                        await syncNativeNotification(newOrder);
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [currentUserId, syncNativeNotification, stopNativeNotification, fetchActiveOrder]);

    return {
        activeOrder,
        stepInfo,
        step: stepInfo?.step ?? null,
        statusText: stepInfo?.statusText ?? null,
        refreshActiveOrder: fetchActiveOrder,
    };
}

export default useActiveOrderLiveTracker;
