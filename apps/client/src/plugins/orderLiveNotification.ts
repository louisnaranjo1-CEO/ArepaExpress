import { registerPlugin } from '@capacitor/core';

export interface StartOrUpdateOrderOptions {
    /** Identificador único del pedido o viaje */
    orderId: string;
    /** Nombre del restaurante o comercio (Ej: "Arepa Express") */
    restaurantName: string;
    /** Estado descriptivo actual (Ej: "Preparando tu comida...", "El repartidor va en camino") */
    statusText: string;
    /** Paso del 1 al 4: 1 = Recibido, 2 = Cocina, 3 = En camino, 4 = Entregado */
    step: 1 | 2 | 3 | 4 | number;
    /** Tiempo estimado de entrega legible (Ej: "15-20 min" o "Llegada 2:30 PM") */
    etaText: string;
    /** Nombre del repartidor/conductor asignado (opcional) */
    driverName?: string;
}

export interface StopOrderOptions {
    /** Identificador del pedido (opcional) */
    orderId?: string;
}

export interface OrderLiveNotificationPlugin {
    /**
     * Inicia o actualiza la notificación persistente (Ongoing) con barra de progreso
     * y sincroniza el Home Screen Widget de Un 2x3 en la pantalla de inicio.
     */
    startOrUpdateOrder(options: StartOrUpdateOrderOptions): Promise<{ success: boolean; orderId?: string; step?: number }>;

    /**
     * Finaliza la orden activa, retira la notificación fija y restablece el widget al estado de reposo.
     */
    stopOrder(options?: StopOrderOptions): Promise<{ success: boolean }>;
}

const OrderLiveNotification = registerPlugin<OrderLiveNotificationPlugin>('OrderLiveNotification', {
    web: {
        async startOrUpdateOrder(options: StartOrUpdateOrderOptions) {
            console.log('[OrderLiveNotification Web Fallback] startOrUpdateOrder:', options);
            return { success: true, orderId: options.orderId, step: options.step };
        },
        async stopOrder(options?: StopOrderOptions) {
            console.log('[OrderLiveNotification Web Fallback] stopOrder:', options);
            return { success: true };
        },
    },
});

export { OrderLiveNotification };
export default OrderLiveNotification;
