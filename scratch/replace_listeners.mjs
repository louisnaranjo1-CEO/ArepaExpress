import fs from 'fs';

const filepath = "src/delivery/pages/OrdersRadar.tsx";
let content = fs.readFileSync(filepath, 'utf-8');

// 1. Active Order/Transport
const old_active = `    // 2. Escuchar órdenes de delivery y transporte activo
    useEffect(() => {
        if (!user) return;

        // Escuchar orden activa del conductor
        const activeQ = query(
            collection(db, 'orders'),
            where('deliveryDriverId', '==', user.uid),
            where('status', 'in', ['en_camino', 'in_transit'])
        );
        const unsubActive = onSnapshot(activeQ, (snapshot) => {
            if (!snapshot.empty) {
                setActiveOrder({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() });
            } else {
                setActiveOrder(null);
            }
        });

        // Escuchar transport activo y reservas programadas
        const activeTransportQ = query(
            collection(db, 'transport_requests'),
            where('driverId', '==', user.uid),
            where('status', 'in', ['accepted', 'arriving', 'in_progress'])
        );
        const unsubActiveTransport = onSnapshot(activeTransportQ, (snapshot) => {
            if (!snapshot.empty) {
                const allReqs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
                
                // Mostrar en pantalla completa ("Viaje en Curso") si NO es programado (viaje normal), 
                // O si es programado pero el transportista ya indicó que va en camino ('arriving') o en progreso ('in_progress').
                const mainActive = allReqs.find((req: any) => !req.scheduled || req.status === 'arriving' || req.status === 'in_progress');
                setActiveTransport(mainActive || null);
                
                // Las reservas que solo han sido aceptadas van a una lista especial para que el transportista pueda iniciarlas luego
                const pendingReservations = allReqs.filter((req: any) => req.scheduled && req.status === 'accepted');
                setMyReservations(pendingReservations);
            } else {
                setActiveTransport(null);
                setMyReservations([]);
            }
        });

        // Escuchar órdenes de comida disponibles
        const availableQ = query(
            collection(db, 'orders'),
            where('status', '==', 'buscando_piloto'),
            where('eligibleDrivers', 'array-contains', user.uid)
        );
        const unsubAvailable = onSnapshot(availableQ, (snapshot) => {
            const orders = snapshot.docs.map(doc => {
                const data = doc.data();
                return { id: doc.id, ...data } as any;
            });
            setAvailableOrders(orders);
        });

        return () => {
            unsubActive();
            unsubActiveTransport();
            unsubAvailable();
        };
    }, [user, driverProfile]);`;

const new_active = `    // 2. Escuchar órdenes de delivery y transporte activo (Supabase)
    useEffect(() => {
        if (!user) return;

        let activeOrderChannel: any;
        let activeTransportChannel: any;
        let availableOrdersChannel: any;

        const fetchActiveOrder = async () => {
            const { data, error } = await supabase
                .from('orders')
                .select('*')
                .eq('deliveryDriverId', user.uid)
                .in('status', ['en_camino', 'in_transit'])
                .limit(1);
            if (data && data.length > 0) {
                setActiveOrder(data[0]);
            } else {
                setActiveOrder(null);
            }
        };

        const fetchActiveTransport = async () => {
            const { data, error } = await supabase
                .from('transport_requests')
                .select('*')
                .eq('driverId', user.uid)
                .in('status', ['accepted', 'arriving', 'in_progress']);
            
            if (data && data.length > 0) {
                const mainActive = data.find((req: any) => !req.scheduled || req.status === 'arriving' || req.status === 'in_progress');
                setActiveTransport(mainActive || null);
                
                const pendingReservations = data.filter((req: any) => req.scheduled && req.status === 'accepted');
                setMyReservations(pendingReservations);
            } else {
                setActiveTransport(null);
                setMyReservations([]);
            }
        };

        const fetchAvailableOrders = async () => {
            const { data, error } = await supabase
                .from('orders')
                .select('*')
                .eq('status', 'buscando_piloto')
                .contains('eligibleDrivers', [user.uid]);
            
            if (data) {
                setAvailableOrders(data);
            } else {
                setAvailableOrders([]);
            }
        };

        fetchActiveOrder();
        fetchActiveTransport();
        fetchAvailableOrders();

        activeOrderChannel = supabase.channel('active_order_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: \`deliveryDriverId=eq.\${user.uid}\` }, fetchActiveOrder)
            .subscribe();

        activeTransportChannel = supabase.channel('active_transport_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'transport_requests', filter: \`driverId=eq.\${user.uid}\` }, fetchActiveTransport)
            .subscribe();

        availableOrdersChannel = supabase.channel('available_orders_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: \`status=eq.buscando_piloto\` }, fetchAvailableOrders)
            .subscribe();

        return () => {
            if (activeOrderChannel) supabase.removeChannel(activeOrderChannel);
            if (activeTransportChannel) supabase.removeChannel(activeTransportChannel);
            if (availableOrdersChannel) supabase.removeChannel(availableOrdersChannel);
        };
    }, [user, driverProfile]);`;

const old_available = `    // 3. Escuchar viajes disponibles filtrados por vehicleType
    useEffect(() => {
        if (!driverProfile?.vehicleType) {
            setAvailableTransport([]);
            setLoading(false);
            return;
        }

        // Escuchar viajes disponibles
        // Nota: Para delivery de comida, podríamos querer mostrarlo a todos los conductores activos 
        // o filtrar también por tipo de vehículo si es necesario.
        const transportQ = query(
            collection(db, 'transport_requests'),
            where('status', '==', 'searching')
        );

        const unsub = onSnapshot(transportQ, (snapshot) => {
            const reqs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any))
                .filter((req: any) => {
                    // Si es taxi, filtrar por tipo de vehículo
                    if (req.type !== 'food_delivery') {
                        return req.vehicleType === driverProfile.vehicleType;
                    }
                    // Si es food_delivery, permitir que todos lo vean
                    return true;
                });
            setAvailableTransport(reqs);
            setLoading(false);
        });

        return () => unsub();
    }, [driverProfile]);`;

const new_available = `    // 3. Escuchar viajes disponibles filtrados por vehicleType
    useEffect(() => {
        if (!driverProfile?.vehicleType) {
            setAvailableTransport([]);
            setLoading(false);
            return;
        }

        let channel: any;

        const fetchAvailableTransport = async () => {
            const { data, error } = await supabase
                .from('transport_requests')
                .select('*')
                .eq('status', 'searching');
            
            if (data) {
                const reqs = data.filter((req: any) => {
                    if (req.type !== 'food_delivery') {
                        return req.vehicleType === driverProfile.vehicleType;
                    }
                    return true;
                });
                setAvailableTransport(reqs);
            }
            setLoading(false);
        };

        fetchAvailableTransport();

        channel = supabase.channel('available_transport_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'transport_requests', filter: \`status=eq.searching\` }, fetchAvailableTransport)
            .subscribe();

        return () => {
            if (channel) supabase.removeChannel(channel);
        };
    }, [driverProfile]);`;

const old_feedback = `    // 5. Escuchar último feedback (calificación)
    useEffect(() => {
        if (!user) return;

        const feedbackQ = query(
            collection(db, 'transport_requests'),
            where('driverId', '==', user.uid),
            where('status', '==', 'completed'),
            orderBy('ratedAt', 'desc'),
            limit(1)
        );

        const unsub = onSnapshot(feedbackQ, (snapshot) => {
            if (!snapshot.empty) {
                const data = snapshot.docs[0].data();
                if (data.rating) {
                    setLatestFeedback({ id: snapshot.docs[0].id, ...data });
                }
            }
        });

        return () => unsub();
    }, [user]);`;

const new_feedback = `    // 5. Escuchar último feedback (calificación)
    useEffect(() => {
        if (!user) return;

        let channel: any;

        const fetchFeedback = async () => {
            const { data, error } = await supabase
                .from('transport_requests')
                .select('*')
                .eq('driverId', user.uid)
                .eq('status', 'completed')
                .order('ratedAt', { ascending: false })
                .limit(1);
            
            if (data && data.length > 0 && data[0].rating) {
                setLatestFeedback(data[0]);
            }
        };

        fetchFeedback();

        channel = supabase.channel('feedback_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'transport_requests', filter: \`driverId=eq.\${user.uid}\` }, fetchFeedback)
            .subscribe();

        return () => {
            if (channel) supabase.removeChannel(channel);
        };
    }, [user]);`;

const old_chat = `        const q = query(
            collection(db, \`transport_requests/\${activeTransport.id}/messages\`),
            orderBy('createdAt', 'desc'),
            limit(1)
        );

        const unsub = onSnapshot(q, (snapshot) => {
            if (!snapshot.empty) {
                const latestMsg = snapshot.docs[0];
                const data = latestMsg.data();
                
                // Si es un mensaje nuevo y no es mío
                if (lastChatIdSeen.current !== null && 
                    lastChatIdSeen.current !== latestMsg.id && 
                    data.senderId !== user.uid) {
                    
                    // Solo sonar si es un mensaje de hace menos de 30 segundos (evitar sonar por viejos al reconectar)
                    const now = Date.now();
                    const msgTime = data.createdAt?.toMillis() || now;
                    if (now - msgTime < 30000) {
                        // Play sound
                        if (notificationSoundUrl.current) {
                            const audio = new Audio(notificationSoundUrl.current);
                            audio.play().catch(e => console.error("Error playing audio:", e));
                        }

                        // Alerta Visual (Toast)
                        toast((t) => (
                            <div className="flex flex-col gap-1 p-1">
                                <p className="font-black text-slate-900 text-sm flex items-center gap-2">
                                    <MessageCircle className="w-4 h-4 text-emerald-500" />
                                    Nuevo Mensaje
                                </p>
                                <p className="text-slate-500 text-xs font-bold leading-tight line-clamp-2">
                                    {data.text || "Ha enviado un archivo o ubicación"}
                                </p>
                            </div>
                        ), {
                            position: 'top-center',
                            duration: 4000,
                            style: {
                                borderRadius: '1.25rem',
                                padding: '12px 16px',
                                border: '1px solid rgba(0,0,0,0.05)',
                                boxShadow: '0 10px 25px rgba(0,0,0,0.1)'
                            }
                        });

                        // Update count if chat is closed
                        if (!showChat) {
                            setUnreadChatCount(prev => prev + 1);
                        }
                    }
                }
                lastChatIdSeen.current = latestMsg.id;
            } else {
                lastChatIdSeen.current = ""; // No hay mensajes
            }
        });

        return () => unsub();`;

const new_chat = `        let channel: any;

        const fetchLatestMessage = async () => {
            const { data, error } = await supabase
                .from('order_messages')
                .select('*')
                .eq('order_id', activeTransport.id)
                .order('created_at', { ascending: false })
                .limit(1);

            if (data && data.length > 0) {
                const latestMsg = data[0];
                
                // Si es un mensaje nuevo y no es mío
                if (lastChatIdSeen.current !== null && 
                    lastChatIdSeen.current !== latestMsg.id && 
                    latestMsg.user_id !== user.uid) {
                    
                    const now = Date.now();
                    const msgTime = new Date(latestMsg.created_at).getTime();
                    if (now - msgTime < 30000) {
                        // Play sound
                        if (notificationSoundUrl.current) {
                            const audio = new Audio(notificationSoundUrl.current);
                            audio.play().catch(e => console.error("Error playing audio:", e));
                        }

                        // Alerta Visual (Toast)
                        toast((t) => (
                            <div className="flex flex-col gap-1 p-1">
                                <p className="font-black text-slate-900 text-sm flex items-center gap-2">
                                    <MessageCircle className="w-4 h-4 text-emerald-500" />
                                    Nuevo Mensaje
                                </p>
                                <p className="text-slate-500 text-xs font-bold leading-tight line-clamp-2">
                                    {latestMsg.message || "Ha enviado un archivo o ubicación"}
                                </p>
                            </div>
                        ), {
                            position: 'top-center',
                            duration: 4000,
                            style: {
                                borderRadius: '1.25rem',
                                padding: '12px 16px',
                                border: '1px solid rgba(0,0,0,0.05)',
                                boxShadow: '0 10px 25px rgba(0,0,0,0.1)'
                            }
                        });

                        // Update count if chat is closed
                        if (!showChat) {
                            setUnreadChatCount(prev => prev + 1);
                        }
                    }
                }
                lastChatIdSeen.current = latestMsg.id;
            } else {
                lastChatIdSeen.current = "";
            }
        };

        fetchLatestMessage();

        channel = supabase.channel('order_messages_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'order_messages', filter: \`order_id=eq.\${activeTransport.id}\` }, fetchLatestMessage)
            .subscribe();

        return () => {
            if (channel) supabase.removeChannel(channel);
        };`;

if (content.includes(old_active)) {
    content = content.replace(old_active, new_active);
    console.log("Replaced active");
} else {
    console.log("Not found active");
}

if (content.includes(old_available)) {
    content = content.replace(old_available, new_available);
    console.log("Replaced available");
} else {
    console.log("Not found available");
}

if (content.includes(old_feedback)) {
    content = content.replace(old_feedback, new_feedback);
    console.log("Replaced feedback");
} else {
    console.log("Not found feedback");
}

if (content.includes(old_chat)) {
    content = content.replace(old_chat, new_chat);
    console.log("Replaced chat");
} else {
    console.log("Not found chat");
}

fs.writeFileSync(filepath, content, 'utf-8');
