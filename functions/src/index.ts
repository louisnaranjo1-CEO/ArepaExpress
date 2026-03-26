import * as admin from 'firebase-admin';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';

admin.initializeApp();
const db = admin.firestore();

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

export const onOrderRequested = onDocumentUpdated({
    document: 'orders/{orderId}'
}, async (event) => {
    const dataBefore = event.data?.before.data();
    const dataAfter = event.data?.after.data();

    if (!dataBefore || !dataAfter) return;

    if (dataAfter.status === 'buscando_piloto' && dataBefore.status !== 'buscando_piloto') {
        const orderId = event.params.orderId;
        const restaurantCoords = dataAfter.restaurantCoords;

        if (!restaurantCoords) {
            logger.warn(`El pedido ${orderId} no tiene restaurantCoords.`);
            return;
        }

        // Radios de Búsqueda
        let radius = 20;
        const settingsSnap = await db.collection('delivery_settings').doc('settings').get();
        if (settingsSnap.exists) {
            const deliveryRadius = settingsSnap.data()?.deliveryRadius;
            if (typeof deliveryRadius === 'number') {
                radius = deliveryRadius;
            }
        }

        const pilotsQuery = await db.collection('delivery_drivers')
            .where('status', '==', 'active')
            .where('role', '==', 'pilot')
            .where('isOnline', '==', true)
            .get();

        const eligibleDrivers: string[] = [];
        const fcmTokens: string[] = [];

        pilotsQuery.forEach(docSnap => {
            const pilot = docSnap.data();
            if (pilot.vehicleType !== 'moto') return;

            if (pilot.homeLocation?.coords) {
                const dist = calculateDistance(
                    restaurantCoords.lat,
                    restaurantCoords.lng,
                    pilot.homeLocation.coords.lat,
                    pilot.homeLocation.coords.lng
                );

                if (dist <= radius) {
                    eligibleDrivers.push(docSnap.id);
                    if (pilot.fcmToken) {
                        fcmTokens.push(pilot.fcmToken);
                    }
                }
            }
        });

        if (eligibleDrivers.length === 0) {
            logger.warn(`No se encontraron pilotos elegibles dentro de ${radius}km para el pedido ${orderId}`);
            return;
        }

        logger.info(`Agregando ${eligibleDrivers.length} pilotos al pedido ${orderId}`);

        await event.data?.after.ref.update({
            eligibleDrivers,
            deliveryRequestedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // FCM Broadcast
        if (fcmTokens.length > 0) {
            try {
                const message = {
                    notification: {
                        title: '¡Nuevo Reparto Disponible!',
                        body: `Hay un pedido en ${dataAfter.restaurantName} esperando ser recogido.`
                    },
                    data: { orderId, type: 'NEW_ORDER' },
                    tokens: fcmTokens
                };
                const pushResponse = await admin.messaging().sendEachForMulticast(message);
                logger.info(`Notificaciones enviadas. Exitos: ${pushResponse.successCount}, Fallos: ${pushResponse.failureCount}`);
            } catch (error) {
                logger.error('Error enviando push:', error);
            }
        }
    }
});

export const checkOrderTimeout = onSchedule('* * * * *', async (event) => {
    const timeoutMs = 20 * 60 * 1000;
    const now = Date.now();

    const ordersQuery = await db.collection('orders')
        .where('status', '==', 'en_camino')
        .get();

    const batch = db.batch();
    let updatedCount = 0;

    ordersQuery.forEach(docSnap => {
        const orderData = docSnap.data();
        const assignedAt = orderData.driverAssignedAt?.toMillis ? orderData.driverAssignedAt.toMillis() : null;

        if (assignedAt && (now - assignedAt > timeoutMs)) {
            logger.info(`Pedido ${docSnap.id} venció sus 20 minutos. Reseteando a buscando_piloto.`);
            batch.update(docSnap.ref, {
                status: 'buscando_piloto',
                deliveryDriverId: admin.firestore.FieldValue.delete(),
                driverAssignedAt: admin.firestore.FieldValue.delete()
            });
            updatedCount++;
        }
    });

    if (updatedCount > 0) {
        await batch.commit();
        logger.info(`${updatedCount} pedidos reseteados por timeout.`);
    }
});
