const fs = require('fs');
const filepath = "D:\\arepa-express\\src\\delivery\\pages\\OrdersRadar.tsx";

let content = fs.readFileSync(filepath, 'utf8');

// 1. Imports
content = content.replace(
    "import { collection, query, where, onSnapshot, updateDoc, doc, serverTimestamp, getDoc, orderBy, limit, increment, runTransaction } from 'firebase/firestore';\n",
    ""
);
content = content.replace(
    "import { rtdb, storage, db } from '../../lib/firebase';",
    "import { rtdb, storage } from '../../lib/firebase';"
);

// We replace the actions for food
const old_actions_food = `    // --- ACCIONES DE COMIDA ---
    const handleAcceptOrder = async (orderId: string) => {
        if (!user || activeOrder || activeTransport || processingAction) return;
        setProcessingAction(orderId);
        try {
            const orderRef = doc(db, 'orders', orderId);
            await runTransaction(db, async (transaction) => {
                const orderDoc = await transaction.get(orderRef);
                if (!orderDoc.exists()) {
                    throw new Error("El pedido no existe.");
                }

                const data = orderDoc.data();
                if (data.status === 'buscando_piloto' && !data.deliveryDriverId) {
                    transaction.update(orderRef, {
                        status: 'en_camino',
                        deliveryDriverId: user.uid,
                        driverAssignedAt: serverTimestamp()
                    });
                } else {
                    throw new Error("ALREADY_TAKEN");
                }
            });
        } catch (error: any) {
            console.error("Error al aceptar orden:", error);
            if (error.message === "ALREADY_TAKEN") {
                toast.error("El pedido ya fue tomado por otro repartidor.");
            } else {
                toast.error("Hubo un problema al aceptar el viaje.");
            }
        } finally {
            setProcessingAction(null);
        }
    };

    const handleMarkInTransit = async () => {
        if (!activeOrder || processingAction) return;
        setProcessingAction('in_transit');
        try {
            await updateDoc(doc(db, 'orders', activeOrder.id), { status: 'in_transit' });
        } finally {
            setProcessingAction(null);
        }
    };

    const handleMarkDelivered = async () => {
        if (!activeOrder || processingAction) return;
        setProcessingAction('delivered');
        try {
            // Calculate total service duration in seconds
            let durationSeconds = 0;
            if (activeOrder.driverAssignedAt) {
                const start = activeOrder.driverAssignedAt.toDate().getTime();
                durationSeconds = Math.floor((Date.now() - start) / 1000);
            }

            await updateDoc(doc(db, 'orders', activeOrder.id), {
                status: 'delivered',
                deliveredAt: serverTimestamp(),
                totalServiceDuration: durationSeconds
            });

            if (activeOrder.restaurantId && activeOrder.deliveryFee) {
                try {
                    const restRef = doc(db, 'restaurants', activeOrder.restaurantId);
                    await updateDoc(restRef, {
                        deuda_delivery_acumulada: increment(activeOrder.deliveryFee)
                    });
                } catch (err) {
                    console.error("Error sumando deuda al restaurante:", err);
                }
            }
            // Puntos Globales por Delivery Fee (2 puntos por cada $)
            if (activeOrder.userId && activeOrder.deliveryFee) {
                try {
                    const pointsToAdd = activeOrder.deliveryFee * 2;
                    const userRef = doc(db, 'users', activeOrder.userId);
                    await updateDoc(userRef, {
                        points: increment(pointsToAdd)
                    });
                } catch (err) {
                    console.error("Error sumando puntos globales al usuario:", err);
                }
            }

            // Puntos por Consumo de Restaurante (2.5 puntos por cada $) si no se han otorgado
            if (activeOrder.userId && activeOrder.userId !== 'pos_customer' && !activeOrder.pointsCredited) {
                try {
                    const pointsToAdd = (activeOrder.total || 0) * 2.5;
                    const userRef = doc(db, 'users', activeOrder.userId);
                    await updateDoc(userRef, {
                        points: increment(pointsToAdd),
                        [\`restaurantPoints.\${activeOrder.restaurantId}\`]: increment(pointsToAdd)
                    });
                    await updateDoc(doc(db, 'orders', activeOrder.id), { pointsCredited: true });
                    console.log(\`Puntos de consumo otorgados por delivery: \${pointsToAdd}\`);
                } catch (err) {
                    console.error("Error sumando puntos de consumo:", err);
                }
            }

            setActiveOrder(null);
        } finally {
            setProcessingAction(null);
        }
    };`;

const new_actions_food = `    // --- ACCIONES DE COMIDA (Supabase) ---
    const handleAcceptOrder = async (orderId: string) => {
        if (!user || activeOrder || activeTransport || processingAction) return;
        setProcessingAction(orderId);
        try {
            const { data, error } = await supabase
                .from('orders')
                .update({ 
                    status: 'en_camino', 
                    delivery_driver_id: user.uid, 
                    driver_assigned_at: new Date().toISOString() 
                })
                .eq('id', orderId)
                .eq('status', 'buscando_piloto')
                .is('delivery_driver_id', null)
                .select();
                
            if (error || !data || data.length === 0) {
                throw new Error("ALREADY_TAKEN");
            }
        } catch (error: any) {
            console.error("Error al aceptar orden:", error);
            if (error.message === "ALREADY_TAKEN") {
                toast.error("El pedido ya fue tomado por otro repartidor.");
            } else {
                toast.error("Hubo un problema al aceptar el viaje.");
            }
        } finally {
            setProcessingAction(null);
        }
    };

    const handleMarkInTransit = async () => {
        if (!activeOrder || processingAction) return;
        setProcessingAction('in_transit');
        try {
            await supabase.from('orders').update({ status: 'in_transit' }).eq('id', activeOrder.id);
        } finally {
            setProcessingAction(null);
        }
    };

    const handleMarkDelivered = async () => {
        if (!activeOrder || processingAction) return;
        setProcessingAction('delivered');
        try {
            let durationSeconds = 0;
            if (activeOrder.driverAssignedAt) {
                const start = activeOrder.driverAssignedAt.toDate ? activeOrder.driverAssignedAt.toDate().getTime() : new Date(activeOrder.driverAssignedAt).getTime();
                durationSeconds = Math.floor((Date.now() - start) / 1000);
            }

            await supabase.from('orders').update({
                status: 'delivered',
                delivered_at: new Date().toISOString(),
                total_service_duration: durationSeconds
            }).eq('id', activeOrder.id);

            // Increment restaurant debt
            if (activeOrder.restaurantId && activeOrder.deliveryFee) {
                try {
                    await supabase.rpc('increment_restaurant_debt', {
                        p_restaurant_id: activeOrder.restaurantId,
                        p_amount: activeOrder.deliveryFee
                    });
                } catch (err) {
                    console.error("Error sumando deuda al restaurante:", err);
                }
            }

            // Global points for delivery fee
            if (activeOrder.userId && activeOrder.deliveryFee) {
                try {
                    const pointsToAdd = activeOrder.deliveryFee * 2;
                    await supabase.rpc('increment_user_points', {
                        p_user_id: activeOrder.userId,
                        p_amount: pointsToAdd
                    });
                } catch (err) {
                    console.error("Error sumando puntos globales al usuario:", err);
                }
            }

            // Global points for consumption
            if (activeOrder.userId && activeOrder.userId !== 'pos_customer' && !activeOrder.pointsCredited) {
                try {
                    const pointsToAdd = (activeOrder.total || 0) * 2.5;
                    await supabase.rpc('increment_user_and_restaurant_points', {
                        p_user_id: activeOrder.userId,
                        p_restaurant_id: activeOrder.restaurantId,
                        p_amount: pointsToAdd
                    });
                    await supabase.from('orders').update({ points_credited: true }).eq('id', activeOrder.id);
                } catch (err) {
                    console.error("Error sumando puntos de consumo:", err);
                }
            }

            setActiveOrder(null);
        } finally {
            setProcessingAction(null);
        }
    };`;

content = content.replace(old_actions_food, new_actions_food);

const old_actions_transport = `    // --- ACCIONES DE TRANSPORTE (TAXI) ---
    const handleAcceptTransport = async (reqId: string) => {
        if (!user || activeOrder || activeTransport || processingAction) return;
        setProcessingAction(reqId);
        try {
            const reqRef = doc(db, 'transport_requests', reqId);
            const reqSnap = await getDoc(reqRef);
            if (reqSnap.exists() && reqSnap.data().status === 'searching') {
                await updateDoc(reqRef, {
                    status: 'accepted',
                    driverId: user.uid,
                    driverAssignedAt: serverTimestamp()
                });
            } else {
                alert("Este viaje ya fue tomado por otro conductor.");
            }
        } catch (error) {
            console.error("Error al aceptar viaje:", error);
        } finally {
            setProcessingAction(null);
        }
    };

    const handleTransportArriving = async () => {
        if (!activeTransport || processingAction) return;
        setProcessingAction('arriving');
        try {
            // Calculate arrival duration in seconds
            let durationSeconds = 0;
            if (activeTransport.driverAssignedAt) {
                const start = activeTransport.driverAssignedAt.toDate().getTime();
                durationSeconds = Math.floor((Date.now() - start) / 1000);
            }

            await updateDoc(doc(db, 'transport_requests', activeTransport.id), { 
                status: 'arriving', 
                driverArrivedAt: serverTimestamp(),
                arrivalDuration: durationSeconds
            });
        } finally {
            setProcessingAction(null);
        }
    };

    const handleTransportStart = async () => {
        if (!activeTransport || processingAction) return;
        setProcessingAction('start');
        try {
            await updateDoc(doc(db, 'transport_requests', activeTransport.id), { status: 'in_progress' });
        } finally {
            setProcessingAction(null);
        }
    };

    const handleTransportComplete = async () => {
        if (!activeTransport || processingAction) return;
        setProcessingAction('complete');
        try {
            await updateDoc(doc(db, 'transport_requests', activeTransport.id), {
                status: 'completed',
                completedAt: serverTimestamp()
            });

            // Si es un food_delivery, actualizar el estado de la orden original
            if (activeTransport.type === 'food_delivery' && activeTransport.id) {
                try {
                    await updateDoc(doc(db, 'orders', activeTransport.id), {
                        status: 'delivered',
                        deliveredAt: serverTimestamp()
                    });
                } catch (orderError) {
                    console.error("Error al actualizar estado de orden:", orderError);
                }
            }

            // Si el viaje tiene usuario asociado y costo, sumar puntos al usuario (2.5 puntos por cada $)
            if (activeTransport.userId && activeTransport.price) {
                try {
                    const pointsToAdd = activeTransport.price * 2.5;
                    const userRef = doc(db, 'users', activeTransport.userId);
                    
                    const updates: any = {
                        points: increment(pointsToAdd)
                    };

                    // Si es un food_delivery, también sumar a puntos de restaurante
                    if (activeTransport.type === 'food_delivery' && activeTransport.restaurantId) {
                        updates[\`restaurantPoints.\${activeTransport.restaurantId}\`] = increment(pointsToAdd);
                    }

                    await updateDoc(userRef, updates);
                } catch (pointsError) {
                    console.error("Error al sumar puntos de viaje:", pointsError);
                }
            }

            setActiveTransport(null);
        } finally {
            setProcessingAction(null);
        }
    };`;

const new_actions_transport = `    // --- ACCIONES DE TRANSPORTE (TAXI) (Supabase) ---
    const handleAcceptTransport = async (reqId: string) => {
        if (!user || activeOrder || activeTransport || processingAction) return;
        setProcessingAction(reqId);
        try {
            const { data, error } = await supabase
                .from('transport_requests')
                .update({ 
                    status: 'accepted', 
                    driver_id: user.uid, 
                    driver_assigned_at: new Date().toISOString() 
                })
                .eq('id', reqId)
                .eq('status', 'searching')
                .select();
                
            if (error || !data || data.length === 0) {
                alert("Este viaje ya fue tomado por otro conductor.");
            }
        } catch (error) {
            console.error("Error al aceptar viaje:", error);
        } finally {
            setProcessingAction(null);
        }
    };

    const handleTransportArriving = async () => {
        if (!activeTransport || processingAction) return;
        setProcessingAction('arriving');
        try {
            let durationSeconds = 0;
            if (activeTransport.driverAssignedAt) {
                const start = activeTransport.driverAssignedAt.toDate ? activeTransport.driverAssignedAt.toDate().getTime() : new Date(activeTransport.driverAssignedAt).getTime();
                durationSeconds = Math.floor((Date.now() - start) / 1000);
            }

            await supabase.from('transport_requests').update({ 
                status: 'arriving', 
                driver_arrived_at: new Date().toISOString(),
                arrival_duration: durationSeconds
            }).eq('id', activeTransport.id);
        } finally {
            setProcessingAction(null);
        }
    };

    const handleTransportStart = async () => {
        if (!activeTransport || processingAction) return;
        setProcessingAction('start');
        try {
            await supabase.from('transport_requests').update({ status: 'in_progress' }).eq('id', activeTransport.id);
        } finally {
            setProcessingAction(null);
        }
    };

    const handleTransportComplete = async () => {
        if (!activeTransport || processingAction) return;
        setProcessingAction('complete');
        try {
            await supabase.from('transport_requests').update({
                status: 'completed',
                completed_at: new Date().toISOString()
            }).eq('id', activeTransport.id);

            if (activeTransport.type === 'food_delivery' && activeTransport.id) {
                try {
                    await supabase.from('orders').update({
                        status: 'delivered',
                        delivered_at: new Date().toISOString()
                    }).eq('id', activeTransport.id);
                } catch (orderError) {
                    console.error("Error al actualizar estado de orden:", orderError);
                }
            }

            // Puntos en Supabase RPC
            if (activeTransport.userId && activeTransport.price) {
                try {
                    const pointsToAdd = activeTransport.price * 2.5;
                    
                    if (activeTransport.type === 'food_delivery' && activeTransport.restaurantId) {
                        await supabase.rpc('increment_user_and_restaurant_points', {
                            p_user_id: activeTransport.userId,
                            p_restaurant_id: activeTransport.restaurantId,
                            p_amount: pointsToAdd
                        });
                    } else {
                        await supabase.rpc('increment_user_points', {
                            p_user_id: activeTransport.userId,
                            p_amount: pointsToAdd
                        });
                    }
                } catch (pointsError) {
                    console.error("Error al sumar puntos de viaje:", pointsError);
                }
            }

            setActiveTransport(null);
        } finally {
            setProcessingAction(null);
        }
    };`;

content = content.replace(old_actions_transport, new_actions_transport);

// Save the file
fs.writeFileSync(filepath, content);
console.log("Refactor phase 1 complete");
