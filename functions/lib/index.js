"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkOrderTimeout = exports.onOrderRequested = void 0;
const admin = require("firebase-admin");
const firestore_1 = require("firebase-functions/v2/firestore");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const v2_1 = require("firebase-functions/v2");
admin.initializeApp();
const db = admin.firestore();
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}
exports.onOrderRequested = (0, firestore_1.onDocumentUpdated)({
    document: 'orders/{orderId}'
}, async (event) => {
    var _a, _b, _c, _d;
    const dataBefore = (_a = event.data) === null || _a === void 0 ? void 0 : _a.before.data();
    const dataAfter = (_b = event.data) === null || _b === void 0 ? void 0 : _b.after.data();
    if (!dataBefore || !dataAfter)
        return;
    if (dataAfter.status === 'buscando_piloto' && dataBefore.status !== 'buscando_piloto') {
        const orderId = event.params.orderId;
        const restaurantCoords = dataAfter.restaurantCoords;
        if (!restaurantCoords) {
            v2_1.logger.warn(`El pedido ${orderId} no tiene restaurantCoords.`);
            return;
        }
        // Radios de Búsqueda
        let radius = 20;
        const settingsSnap = await db.collection('delivery_settings').doc('settings').get();
        if (settingsSnap.exists) {
            const deliveryRadius = (_c = settingsSnap.data()) === null || _c === void 0 ? void 0 : _c.deliveryRadius;
            if (typeof deliveryRadius === 'number') {
                radius = deliveryRadius;
            }
        }
        const pilotsQuery = await db.collection('delivery_drivers')
            .where('status', '==', 'active')
            .where('role', '==', 'pilot')
            .where('isOnline', '==', true)
            .get();
        const eligibleDrivers = [];
        const fcmTokens = [];
        pilotsQuery.forEach(docSnap => {
            var _a;
            const pilot = docSnap.data();
            if (pilot.vehicleType !== 'moto')
                return;
            if ((_a = pilot.homeLocation) === null || _a === void 0 ? void 0 : _a.coords) {
                const dist = calculateDistance(restaurantCoords.lat, restaurantCoords.lng, pilot.homeLocation.coords.lat, pilot.homeLocation.coords.lng);
                if (dist <= radius) {
                    eligibleDrivers.push(docSnap.id);
                    if (pilot.fcmToken) {
                        fcmTokens.push(pilot.fcmToken);
                    }
                }
            }
        });
        if (eligibleDrivers.length === 0) {
            v2_1.logger.warn(`No se encontraron pilotos elegibles dentro de ${radius}km para el pedido ${orderId}`);
            return;
        }
        v2_1.logger.info(`Agregando ${eligibleDrivers.length} pilotos al pedido ${orderId}`);
        await ((_d = event.data) === null || _d === void 0 ? void 0 : _d.after.ref.update({
            eligibleDrivers,
            deliveryRequestedAt: admin.firestore.FieldValue.serverTimestamp()
        }));
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
                v2_1.logger.info(`Notificaciones enviadas. Exitos: ${pushResponse.successCount}, Fallos: ${pushResponse.failureCount}`);
            }
            catch (error) {
                v2_1.logger.error('Error enviando push:', error);
            }
        }
    }
});
exports.checkOrderTimeout = (0, scheduler_1.onSchedule)('* * * * *', async (event) => {
    const timeoutMs = 20 * 60 * 1000;
    const now = Date.now();
    const ordersQuery = await db.collection('orders')
        .where('status', '==', 'en_camino')
        .get();
    const batch = db.batch();
    let updatedCount = 0;
    ordersQuery.forEach(docSnap => {
        var _a;
        const orderData = docSnap.data();
        const assignedAt = ((_a = orderData.driverAssignedAt) === null || _a === void 0 ? void 0 : _a.toMillis) ? orderData.driverAssignedAt.toMillis() : null;
        if (assignedAt && (now - assignedAt > timeoutMs)) {
            v2_1.logger.info(`Pedido ${docSnap.id} venció sus 20 minutos. Reseteando a buscando_piloto.`);
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
        v2_1.logger.info(`${updatedCount} pedidos reseteados por timeout.`);
    }
});
//# sourceMappingURL=index.js.map