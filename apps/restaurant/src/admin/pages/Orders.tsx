import React, { useState, useEffect } from 'react';
import { Search, Filter, Clock, MapPin, ChevronRight, Bike, Truck, CheckCircle, Loader2, Bell, ExternalLink, X, ShoppingCart, Plus, Minus, Trash2, User, CreditCard, Store, ShoppingBag, Users, Upload, Image as ImageIcon, DollarSign, Edit, MessageCircle, Package, Eye, Download, Star, Sparkles, Navigation, ArrowLeft, Info } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { printToUsbDevice, formatTicket, PrintOrder } from '../../lib/usb-printer';
import { motion, AnimatePresence } from 'motion/react';
import toast from 'react-hot-toast';
import ComandaPreview from '../components/ComandaPreview';
import OrderChatWindow from '../../components/chat/OrderChatWindow';
import { useHaptics } from '../../hooks/useHaptics';

interface OrderItem {
    id: string;
    name: string;
    quantity: number;
    price: number;
    consultPrice?: boolean;
    image?: string;
}

interface Order {
    id: string;
    userId: string;
    items: OrderItem[];
    total: number;
    subtotal?: number;
    deliveryFee?: number;
    tip?: number;
    status: 'pending' | 'pendiente_pago' | 'preparing' | 'delivering' | 'delivered' | 'rejected';
    paymentStatus?: 'sold' | 'not_sold';
    createdAt: any;
    deliveryAddress: string;
    deliveryCoords?: { lat: number; lng: number } | null;
    paymentMethod?: string;
    paymentReference?: string;
    paymentProofUrl?: string;
    userName?: string;
    userPhone?: string;
    source?: string;
    waiterId?: string;
    waiterName?: string;
    tableNumber?: string;
    orderType?: string;
    orderNote?: string;
    notes?: string;
    clientDNI?: string;
    stockConfirmed?: boolean;
    preferred_driver_id?: string | null;
    preferred_driver_name?: string | null;
    preferred_driver_expires_at?: string | null;
    driver_id?: string | null;
    driver_name?: string | null;
    driverName?: string | null;
    delivery_driver_id?: string | null;
    dispatched_at?: string | null;
    updated_at?: string | null;
}

export default function Orders() {
    const { user, userData } = useAuth();
    const rid = userData?.managedRestaurantId || user?.uid;
    const [activeTab, setActiveTab] = useState<'pending' | 'pendiente_pago' | 'preparing' | 'delivering' | 'delivered' | 'rejected' | 'tables'>('pending');
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [printingOrderId, setPrintingOrderId] = useState<string | null>(null);

    const { vibrateSelection, vibrateSuccess, vibrateWarning } = useHaptics();

    // Modals State
    const [acceptModalOpen, setAcceptModalOpen] = useState(false);
    const [selectedOrderForAccept, setSelectedOrderForAccept] = useState<Order | null>(null);
    const [paymentMethod, setPaymentMethod] = useState<string>('Punto de Venta');
    const [isAccepting, setIsAccepting] = useState(false);

    const [dispatchModalOpen, setDispatchModalOpen] = useState(false);
    const [selectedOrderForDispatch, setSelectedOrderForDispatch] = useState<Order | null>(null);
    const [dispatchType, setDispatchType] = useState<'platform' | 'own'>('own');
    const [selectedDriver, setSelectedDriver] = useState<string>('');
    const [drivers, setDrivers] = useState<any[]>([]);
    const [prepMinutes, setPrepMinutes] = useState<number>(20);
    const [driverSearch, setDriverSearch] = useState<string>('');
    const [driverCategoryFilter, setDriverCategoryFilter] = useState<'all' | 'moto' | 'carro' | 'confort'>('all');
    const [selectedVehicleCategory, setSelectedVehicleCategory] = useState<'moto' | 'carro' | 'confort' | null>(null);
    const [previewImageModal, setPreviewImageModal] = useState<string | null>(null);
    const [selectedOrderForDetail, setSelectedOrderForDetail] = useState<any | null>(null);
    
    // Radar UI State
    const [radarOrderId, setRadarOrderId] = useState<string | null>(null);
    const [preferredCountdown, setPreferredCountdown] = useState<number>(0);

    // Payment Proofs State
    const [referenceInputs, setReferenceInputs] = useState<Record<string, string>>({});
    const [proofUploadFiles, setProofUploadFiles] = useState<Record<string, File>>({});
    const [isUploadingProof, setIsUploadingProof] = useState<Record<string, boolean>>({});

    // Payment Verification Modal State
    const [verifyModalOpen, setVerifyModalOpen] = useState(false);
    const [selectedOrderForVerify, setSelectedOrderForVerify] = useState<Order | null>(null);
    const [isVerifying, setIsVerifying] = useState(false);
    const [verificationSuccess, setVerificationSuccess] = useState(false);

    // Edit Order Modal State
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [selectedOrderForEdit, setSelectedOrderForEdit] = useState<Order | null>(null);
    const [editOrderItems, setEditOrderItems] = useState<OrderItem[]>([]);
    const [editOrderNote, setEditOrderNote] = useState('');

    const [editAddProductId, setEditAddProductId] = useState('');
    const [editAddVariant, setEditAddVariant] = useState('');
    const [editAddQty, setEditAddQty] = useState(1);
    const [editAddNote, setEditAddNote] = useState('');

    const [closeSaleModalOpen, setCloseSaleModalOpen] = useState(false);
    const [selectedOrderForClose, setSelectedOrderForClose] = useState<Order | null>(null);
    const [closeTip, setCloseTip] = useState(0);
    const [missingItemsByOrder, setMissingItemsByOrder] = useState<Record<string, string[]>>({});
    const [chatOrderId, setChatOrderId] = useState<string | null>(null);

    // Smart Rejection State (Fase 2.3)
    const [smartRejectModalOpen, setSmartRejectModalOpen] = useState(false);
    const [selectedOrderForReject, setSelectedOrderForReject] = useState<Order | null>(null);
    const [smartRejectReason, setSmartRejectReason] = useState<'closed' | 'no_stock' | null>(null);

    const handleCloseSale = async () => {
        if (!selectedOrderForClose) return;
        setIsAccepting(true);
        try {
            const finalTotal = (selectedOrderForClose.subtotal || selectedOrderForClose.total || 0) + ((selectedOrderForClose as any).deliveryFee || 0) + closeTip;
            const updates: any = {
                payment_method: paymentMethod,
                payment_status: 'sold',
                tip: closeTip,
                total: finalTotal,
                updated_at: new Date().toISOString()
            };
            await supabase.from('orders').update(updates).eq('id', selectedOrderForClose.id);
            setCloseSaleModalOpen(false);
            setSelectedOrderForClose(null);
            setCloseTip(0);
        } catch (error) {
            console.error(error);
            alert("Error al cerrar venta");
        } finally {
            setIsAccepting(false);
        }
    };

    useEffect(() => {
        const fetchDrivers = async () => {
            const { data } = await supabase.from('profiles').select('*').eq('role', 'delivery');
            setDrivers(data || []);
        };
        fetchDrivers();

        if (user && rid) {
            const fetchTables = async () => {
                const { data } = await supabase.from('restaurant_tables').select('*').eq('restaurant_id', rid);
                const sorted = (data || []).map((t: any) => ({
                    id: t.id,
                    number: t.table_number || t.number || '',
                    capacity: t.capacity || 4,
                    status: t.status || 'available',
                    currentOrderId: t.current_order_id
                }));
                sorted.sort((a: any, b: any) => {
                    const numA = parseInt(a.number, 10);
                    const numB = parseInt(b.number, 10);
                    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
                    return (a.number || '').localeCompare(b.number || '');
                });
                setTables(sorted);
            };
            fetchTables();

            const tableChannel = supabase
                .channel(`orders_tables_${rid}`)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_tables', filter: `restaurant_id=eq.${rid}` }, () => {
                    fetchTables();
                })
                .subscribe();

            const fetchWaiters = async () => {
                const { data } = await supabase.from('waiters').select('*').eq('restaurant_id', rid);
                setWaiters(data || []);
            };
            fetchWaiters();

            return () => {
                supabase.removeChannel(tableChannel);
            };
        }
    }, [user, rid]);

    const [restaurantConfig, setRestaurantConfig] = useState<any>(null);

    useEffect(() => {
        if (!user || !rid) return;
        const fetchConfig = async () => {
            const { data } = await supabase.from('comercios').select('*').eq('id', rid).single();
            if (data) setRestaurantConfig(data);
        };
        fetchConfig();
    }, [user, rid]);

    // POS State
    const [showPOS, setShowPOS] = useState(false);
    const [posProducts, setPosProducts] = useState<any[]>([]);
    const [posCategories, setPosCategories] = useState<string[]>(['Todos']);
    const [posActiveCategory, setPosActiveCategory] = useState<string>('Todos');
    const [posSearchTerm, setPosSearchTerm] = useState('');
    const [posCart, setPosCart] = useState<any[]>([]);
    const [posClientName, setPosClientName] = useState('');
    const [posClientDNI, setPosClientDNI] = useState('');
    const [posOrderType, setPosOrderType] = useState<'local' | 'takeout' | 'delivery'>('local');
    const [posDeliveryAddress, setPosDeliveryAddress] = useState('');
    const [posDeliveryFee, setPosDeliveryFee] = useState(0);
    const [isSubmittingPOS, setIsSubmittingPOS] = useState(false);

    const [waiters, setWaiters] = useState<any[]>([]);
    const [tables, setTables] = useState<any[]>([]);
    const [selectedWaiter, setSelectedWaiter] = useState<any | null>(null);
    const [selectedTable, setSelectedTable] = useState<any | null>(null);
    const [waiterSearch, setWaiterSearch] = useState('');
    const [tableSearch, setTableSearch] = useState('');
    
    // Comanda Preview State
    const [selectedOrderForComanda, setSelectedOrderForComanda] = useState<Order | any | null>(null);

    // Product Selection Modal (Variants/Description)
    const [selectionModalOpen, setSelectionModalOpen] = useState(false);
    const [selectedProductForSelection, setSelectedProductForSelection] = useState<any | null>(null);
    const [selectionVariant, setSelectionVariant] = useState<any | null>(null);
    const [selectionQty, setSelectionQty] = useState(1);
    const [selectionNote, setSelectionNote] = useState('');

    const [posEditingOrderId, setPosEditingOrderId] = useState<string | null>(null);

    useEffect(() => {
        if (!user || !showPOS || !rid) return;
        const fetchPosProducts = async () => {
            const { data } = await supabase.from('products').select('*').eq('restaurant_id', rid);
            const items: any[] = [];
            const cats = new Set<string>();
            (data || []).forEach((p: any) => {
                if (p.is_active !== false) {
                    const prod = {
                        id: p.id,
                        name: p.name,
                        price: Number(p.price) || 0,
                        promoPrice: Number(p.promo_price) || 0,
                        category: p.category_name || p.category || '',
                        image: p.image_url || p.image || '',
                        variants: p.variants || [],
                        modifiers: p.modifiers || [],
                        isActive: p.is_active
                    };
                    items.push(prod);
                    if (prod.category) cats.add(prod.category);
                }
            });
            setPosProducts(items);
            setPosCategories(['Todos', ...Array.from(cats)]);
        };

        fetchPosProducts();
    }, [user, showPOS, rid]);

    const fetchOrders = async () => {
        if (!rid) return;
        try {
            const { data, error } = await supabase
                .from('orders')
                .select('*')
                .eq('restaurant_id', rid)
                .order('created_at', { ascending: false });

            if (error) {
                console.error("Error fetching orders:", error);
                return;
            }

            const items: Order[] = (data || []).map((o: any) => ({
                id: o.id,
                userId: o.user_id,
                items: o.items || [],
                total: Number(o.total) || 0,
                subtotal: Number(o.subtotal) || Number(o.total) || 0,
                deliveryFee: Number(o.delivery_fee) || 0,
                tip: Number(o.tip) || 0,
                status: o.status,
                paymentStatus: o.payment_status || 'not_sold',
                createdAt: o.created_at ? { toDate: () => new Date(o.created_at) } : { toDate: () => new Date() },
                deliveryAddress: o.delivery_address || (typeof o.shipping_address === 'string' ? o.shipping_address : o.shipping_address?.address || ''),
                deliveryCoords: o.delivery_coords || (o.shipping_address?.lat ? { lat: Number(o.shipping_address.lat), lng: Number(o.shipping_address.lng) } : null),
                paymentMethod: o.payment_method || '',
                paymentReference: o.payment_reference || '',
                paymentProofUrl: o.payment_proof_url || '',
                userName: o.user_name || '',
                userPhone: o.user_phone || '',
                source: o.source || '',
                waiterId: o.waiter_id || '',
                waiterName: o.waiter_name || '',
                tableNumber: o.table_number || '',
                orderType: o.order_type || o.delivery_method || '',
                notes: o.notes || o.order_note || '',
                orderNote: o.order_note || o.notes || '',
                clientDNI: o.client_dni || o.user_cedula || '',
                preferred_driver_id: o.preferred_driver_id,
                preferred_driver_name: o.preferred_driver_name,
                preferred_driver_expires_at: o.preferred_driver_expires_at,
                driver_id: o.driver_id || o.delivery_driver_id,
                driver_name: o.driver_name,
                driverName: o.driver_name,
                delivery_driver_id: o.delivery_driver_id,
                dispatched_at: o.dispatched_at,
                updated_at: o.updated_at
            }));

            // 24h Auto-Close Check for delivering/delivered orders awaiting customer rating
            const ONE_DAY_MS = 24 * 60 * 60 * 1000;
            const now = Date.now();
            const expiredOrders = (data || []).filter((o: any) => {
                if (!['delivering', 'delivered'].includes(o.status)) return false;
                const refTime = new Date(o.dispatched_at || o.delivered_at || o.updated_at || o.created_at).getTime();
                return (now - refTime) >= ONE_DAY_MS;
            });

            if (expiredOrders.length > 0) {
                for (const exp of expiredOrders) {
                    supabase.from('orders').update({
                        status: 'completed',
                        payment_status: exp.payment_status || 'paid',
                        auto_closed_24h: true,
                        updated_at: new Date().toISOString()
                    }).eq('id', exp.id).then(() => {});
                }
            }

            // Sound on new pending order or incoming payment proof to verify
            const hasNewActionable = items.some(o => {
                const prev = orders.find(p => p.id === o.id);
                if ((o.status === 'pending' || o.status === 'pendiente_pago') && !prev) return true;
                if (o.status === 'pending_verification' && prev?.status !== 'pending_verification') return true;
                return false;
            });
            if (hasNewActionable && orders.length > 0) {
                const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
                audio.play().catch(e => console.log("Audio play blocked"));
            }

            setOrders(items);
        } catch (err) {
            console.error("Error in fetchOrders:", err);
        } finally {
            setLoading(false);
        }
    };

    // Preferred driver 60s countdown timer
    useEffect(() => {
        if (!radarOrderId) {
            setPreferredCountdown(0);
            return;
        }
        const radarOrder = orders.find(o => o.id === radarOrderId);
        if (!radarOrder || !radarOrder.preferred_driver_expires_at) {
            setPreferredCountdown(0);
            return;
        }

        const updateTimer = () => {
            const exp = new Date(radarOrder.preferred_driver_expires_at!).getTime();
            const diff = Math.max(0, Math.ceil((exp - Date.now()) / 1000));
            setPreferredCountdown(diff);
        };

        updateTimer();
        const interval = setInterval(updateTimer, 1000);
        return () => clearInterval(interval);
    }, [radarOrderId, orders]);

    const fetchActiveDrivers = async () => {
        try {
            const { data: driversData, error: dErr } = await supabase
                .from('drivers')
                .select(`
                    id,
                    full_name,
                    phone,
                    vehicle_type,
                    vehicle_brand,
                    vehicle_model,
                    vehicle_color,
                    vehicle_plate,
                    vehicle_image_url,
                    rating,
                    total_trips,
                    is_online,
                    availability,
                    current_location,
                    registered_home_address,
                    is_comfort_eligible,
                    city
                `);

            if (dErr) console.warn("Error fetching drivers:", dErr);

            if (driversData && driversData.length > 0) {
                const driverIds = driversData.map(d => d.id);
                const { data: profilesData } = await supabase
                    .from('profiles')
                    .select('id, photo_url, last_city, last_state')
                    .in('id', driverIds);

                const profileMap = new Map((profilesData || []).map(p => [p.id, p]));

                const enriched = driversData.map(d => {
                    const prof = profileMap.get(d.id);
                    const city = d.city || prof?.last_city || (d.registered_home_address as any)?.city || (d.registered_home_address as any)?.name || 'Calabozo';
                    return {
                        ...d,
                        photo_url: prof?.photo_url || d.vehicle_image_url || null,
                        city
                    };
                });
                setDrivers(enriched);
            }
        } catch (e) {
            console.warn("Error loading drivers:", e);
        }
    };

    const getDriverPayout = (order: Order | null, driverVehicleType: string = 'moto'): number => {
        if (!order) return 1.5;
        const dist = (order as any).distance || 2.0;
        const vType = driverVehicleType === 'confort' ? 'confort' : (driverVehicleType === 'carro' ? 'carro' : 'moto');
        const baseFare = vType === 'confort' ? 3.5 : (vType === 'carro' ? 2.5 : 1.5);
        const baseKm = 2.0;
        const pricePerKm = vType === 'confort' ? 0.8 : (vType === 'carro' ? 0.6 : 0.5);
        const extraKm = Math.max(0, dist - baseKm);
        const totalFare = baseFare + (extraKm * pricePerKm);
        const payout = Number((totalFare * 0.85).toFixed(2));
        return Math.max(1.20, payout);
    };

    useEffect(() => {
        if (!user || !rid) return;
        fetchOrders();
        fetchActiveDrivers();

        const channel = supabase
            .channel(`orders_page_${rid}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${rid}` }, () => {
                fetchOrders();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user, rid]);

    const handlePrintOrder = async (orderId: string, orderData: Order) => {
        if (!user || !rid) return;
        setPrintingOrderId(orderId);
        try {
            const { data: printersData } = await supabase.from('printers').select('*').eq('restaurant_id', rid);
            const printers = (printersData || []).map((p: any) => ({
                id: p.id,
                name: p.name,
                categories: p.categories || [],
                isActive: p.is_active ?? true,
                vendorId: p.vendor_id,
                productId: p.product_id
            }));

            // Promesas de impresión
            const printPromises: Promise<boolean>[] = [];

            // Agrupar ítems por impresora según categoría
            for (const printer of printers) {
                if (!printer.vendorId || !printer.productId || !printer.isActive) continue;

                // Si la estación no tiene categorías asignadas, salta. Si tiene, busca los ítems que coinciden.
                // Asumimos que `orderData.items` puede o no tener `category`.
                // Si la pizzería no tiene category en item, hay que tener cuidado. En este boilerplate, confiaremos en que el 'name' o algo matchea la categoría.
                // Lo más robusto si no hay 'category' en OrderItem es buscar qué items caen en qué estación.
                // Como no sabemos si 'category' viene en la orden, de momento vamos a validar si printer.categories incluye 'category' del item o si le mandamos toda la orden a todas las impresoras si queremos simplicidad.
                // Por requerimiento: Filtrado por Categoría de los ítems. Asumiremos que item.category existe.

                const itemsForThisPrinter = orderData.items.filter(item => {
                    // Si el item tiene categoría explícita y está en la impresora
                    const itemCat = (item as any).category || '';
                    return printer.categories?.includes(itemCat);
                });

                // Si por alguna razón la impresora tiene categoría "Todas" y no hay match con nombres, mandamos.
                // Para mantenerlo acorde al requerimiento, solo enviamos si hay items filtrados:
                if (itemsForThisPrinter.length > 0) {
                    const printData = {
                        id: orderData.id,
                        userName: orderData.userName,
                        items: itemsForThisPrinter.map(i => ({ name: i.name, quantity: i.quantity, price: i.price, notes: (i as any).notes })),
                        stationName: printer.name,
                        createdAt: orderData.createdAt?.toDate ? orderData.createdAt.toDate() : (orderData.createdAt ? new Date(orderData.createdAt) : new Date()),
                        orderNote: (orderData as any).orderNote,
                        tableNumber: (orderData as any).tableNumber
                    } as any;

                    const buffer = formatTicket(printData);
                    printPromises.push(printToUsbDevice(printer.vendorId, printer.productId, buffer));

                    // Generar y descargar version Texto (Backup manual o visualizacion)
                    try {
                        let txtContent = `=== TICKET: ${printer.name.toUpperCase()} ===\n`;
                        txtContent += `Pedido ID: ${orderData.id.slice(-6).toUpperCase()}\n`;
                        txtContent += `Cliente: ${orderData.userName || 'Consumidor Final'}\n`;
                        if ((orderData as any).tableNumber) txtContent += `Mesa: ${(orderData as any).tableNumber}\n`;
                        txtContent += `--------------------------------\n`;
                        itemsForThisPrinter.forEach(item => {
                            txtContent += `${item.quantity}x ${item.name}\n`;
                            if ((item as any).notes) {
                                txtContent += `  Nota: ${(item as any).notes}\n`;
                            }
                        });
                        txtContent += `--------------------------------\n`;
                        if ((orderData as any).orderNote) {
                            txtContent += `Nota Pedido: ${(orderData as any).orderNote}\n`;
                        }
                        txtContent += `================================\n`;
                        
                        const blob = new Blob([txtContent], { type: 'text/plain' });
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.href = url;
                        link.download = `Ticket_${printer.name.replace(/\s+/g, '_')}_${orderData.id.slice(-6)}.txt`;
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                        URL.revokeObjectURL(url);
                    } catch (e) {
                         console.error("Error generating text file backup:", e);
                    }
                }
            }

            // Esperamos que todas las impresiones enviadas terminen
            if (printPromises.length > 0) {
                await Promise.all(printPromises);
            } else {
                console.log("No se encontraron impresoras USB configuradas o items asignables a ellas para este pedido.");
            }

        } catch (error) {
            console.error("Error general de impresión:", error);
            alert("Ocurrió un error al intentar imprimir. Verifica que las impresoras USB estén conectadas y configuradas.");
        } finally {
            setPrintingOrderId(null);
        }
    };

    const handleConfirmAccept = async () => {
        if (!selectedOrderForAccept) return;
        setIsAccepting(true);
        try {
            const updates: any = { 
                status: 'preparing', 
                payment_method: paymentMethod,
                payment_status: (paymentMethod === 'Crédito (2x3)') ? 'pending' : 'sold',
                updated_at: new Date().toISOString()
            };

            // Process optional Pago Móvil reference and screenshot
            if (paymentMethod === 'Pago Móvil') {
                const refVal = referenceInputs[selectedOrderForAccept.id];
                const file = proofUploadFiles[selectedOrderForAccept.id];
                if (refVal) updates.payment_reference = refVal;
                
                if (file) {
                    const ext = file.name.split('.').pop() || 'png';
                    const filePath = `payment_proofs/${selectedOrderForAccept.id}_${Date.now()}.${ext}`;
                    const { error: upErr } = await supabase.storage.from('store_assets').upload(filePath, file, { upsert: true });
                    if (!upErr) {
                        const { data: urlData } = supabase.storage.from('store_assets').getPublicUrl(filePath);
                        updates.payment_proof_url = urlData.publicUrl;
                    }
                }
            }

            // Si el pago ya es exitoso (sold), otorgar puntos
            if (updates.payment_status === 'sold' && selectedOrderForAccept.userId && selectedOrderForAccept.userId !== 'pos_customer') {
                const pointsToAdd = Math.round(selectedOrderForAccept.total * 2.5);
                try {
                    const { data: prof } = await supabase.from('profiles').select('points').eq('id', selectedOrderForAccept.userId).single();
                    const currentPoints = prof?.points || 0;
                    await supabase.from('profiles').update({ points: currentPoints + pointsToAdd }).eq('id', selectedOrderForAccept.userId);
                    updates.points_credited = true;
                } catch (pErr) {
                    console.warn("Points update note:", pErr);
                }
            }

            await supabase.from('orders').update(updates).eq('id', selectedOrderForAccept.id);
            
            const orderTemp = { ...selectedOrderForAccept, ...updates };
            
            vibrateSuccess();

            setAcceptModalOpen(false);
            setSelectedOrderForAccept(null);
            
            // Mostrar modal de vista previa de comanda
            setSelectedOrderForComanda(orderTemp as Order);
            fetchOrders();
        } catch (error) {
            console.error("Error setting preparing status:", error);
            alert("Error al procesar el pedido.");
        } finally {
            setIsAccepting(false);
        }
    };

    const handleConfirmDispatch = async () => {
        if (!selectedOrderForDispatch) return;
        setIsAccepting(true);
        try {
            // Caso 1: Retiro en Tienda / Entrega Propia (Requerimiento 6)
            if (dispatchType === 'own') {
                const updates: any = {
                    delivery_method: 'pickup',
                    deliveryMethod: 'pickup',
                    order_type: 'pickup',
                    status: 'ready',
                    updated_at: new Date().toISOString()
                };
                await supabase.from('orders').update(updates).eq('id', selectedOrderForDispatch.id);

                try {
                    await supabase.from('messages').insert({
                        order_id: selectedOrderForDispatch.id,
                        sender_id: user?.uid,
                        sender_name: 'Restaurante',
                        sender_role: 'restaurant',
                        text: `🏪 *¡Pedido listo para retiro en tienda!* Tu orden está preparada y lista para ser retirada en nuestro local.`,
                        created_at: new Date().toISOString()
                    });
                } catch (mErr) {
                    console.warn("Message err:", mErr);
                }

                vibrateSelection();
                toast.success("Configurado con éxito para Retiro en Tienda.");
                setDispatchModalOpen(false);
                setSelectedOrderForDispatch(null);
                setSelectedDriver('');
                setDriverSearch('');
                setSelectedVehicleCategory(null);
                setDriverCategoryFilter('all');
                fetchOrders();
                return;
            }

            // Caso 2: Driver de la Plataforma (o seleccionado por el cliente)
            const targetDriverId = selectedDriver || selectedOrderForDispatch.preferred_driver_id || selectedOrderForDispatch.driver_id;
            const chosenDriverName = selectedOrderForDispatch.driver_name 
                || (selectedOrderForDispatch as any).driverName 
                || selectedOrderForDispatch.preferred_driver_name;

            const driverObj = drivers.find(d => d.id === targetDriverId) || (targetDriverId ? {
                id: targetDriverId,
                full_name: chosenDriverName || 'Conductor',
                phone: '',
                photo_url: '',
                vehicle_type: selectedVehicleCategory || 'moto'
            } : null);

            const payout = driverObj ? getDriverPayout(selectedOrderForDispatch, driverObj.vehicle_type) : 1.50;

            const updates: any = {
                status: 'delivering',
                dispatched_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            if (driverObj) {
                // Asignación directa y exclusiva al conductor seleccionado (Requerimiento 6)
                updates.driver_id = driverObj.id;
                updates.delivery_driver_id = driverObj.id;
                updates.driver_name = driverObj.full_name || chosenDriverName || 'Conductor';
                updates.preferred_driver_id = driverObj.id;
                updates.preferred_driver_name = driverObj.full_name || chosenDriverName;
                updates.eligible_drivers = [driverObj.id];
                updates.assigned_driver_id = driverObj.id;
                updates.driver_payout = payout;
                updates.dispatched_at = new Date().toISOString();
                updates.preferred_driver_expires_at = new Date(Date.now() + 120000).toISOString();

                // Enlazar transport_requests exclusivo para este repartidor con manifiesto unificado (Fase 5)
                try {
                    const itemsSummary = selectedOrderForDispatch.items?.map((i: any) => `${i.quantity}x ${i.name}`).join(', ') || 'Productos del comercio';
                    await supabase.from('transport_requests').upsert({
                        order_id: selectedOrderForDispatch.id,
                        restaurant_id: rid,
                        restaurant_name: (selectedOrderForDispatch as any).restaurantName || restaurantConfig?.name || 'Comercio',
                        user_id: selectedOrderForDispatch.userId,
                        user_name: selectedOrderForDispatch.userName || 'Cliente',
                        user_phone: selectedOrderForDispatch.userPhone || '',
                        user_cedula: selectedOrderForDispatch.clientDNI || '',
                        driver_id: driverObj.id,
                        assigned_driver_id: driverObj.id,
                        driver_name: driverObj.full_name || chosenDriverName,
                        driver_phone: driverObj.phone,
                        driver_photo: driverObj.photo_url,
                        vehicle_type: driverObj.vehicle_type || selectedVehicleCategory || 'moto',
                        type: 'food_delivery',
                        service_category: 'food_delivery',
                        status: 'accepted',
                        price: payout,
                        driver_payout: payout,
                        items_summary: itemsSummary,
                        flete_pagado_por: 'negocio',
                        notes: `🎁 Flete pagado por el comercio. Entregar a: ${selectedOrderForDispatch.userName || 'Cliente'} (Tlf: ${selectedOrderForDispatch.userPhone || 'N/A'}). Ítems: ${itemsSummary}`,
                        origin: {
                            address: restaurantConfig?.address || restaurantConfig?.name || 'Local',
                            lat: restaurantConfig?.location?.lat,
                            lng: restaurantConfig?.location?.lng
                        },
                        destination: selectedOrderForDispatch.deliveryCoords || { address: selectedOrderForDispatch.deliveryAddress },
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    });
                } catch (trErr) {
                    console.warn("Transport request link err:", trErr);
                }

                // Chat message
                try {
                    await supabase.from('messages').insert({
                        order_id: selectedOrderForDispatch.id,
                        sender_id: user?.uid,
                        sender_name: 'Restaurante',
                        sender_role: 'restaurant',
                        text: `🛵 *¡Pedido despachado!* El repartidor *${driverObj.full_name || chosenDriverName}* ya va en camino con tu comida.`,
                        created_at: new Date().toISOString()
                    });
                } catch (mErr) {
                    console.warn("Message err:", mErr);
                }
            } else {
                updates.status = 'buscando_piloto';
                setRadarOrderId(selectedOrderForDispatch.id);
            }

            await supabase.from('orders').update(updates).eq('id', selectedOrderForDispatch.id);

            vibrateSelection();
            toast.success(driverObj ? `¡Notificación enviada a ${driverObj.full_name}!` : "Despacho abierto al radar.");

            setDispatchModalOpen(false);
            setSelectedOrderForDispatch(null);
            setSelectedDriver('');
            setDriverSearch('');
            setSelectedVehicleCategory(null);
            setDriverCategoryFilter('all');
            fetchOrders();
        } catch (error) {
            console.error("Error setting delivering status:", error);
            toast.error("Error al despachar.");
        } finally {
            setIsAccepting(false);
        }
    };

    const handleSavePaymentProof = async (orderId: string) => {
        const refVal = referenceInputs[orderId] || '';
        const file = proofUploadFiles[orderId];
        
        if (!refVal && !file) return;

        setIsUploadingProof(prev => ({...prev, [orderId]: true}));
        try {
            const updates: any = { updated_at: new Date().toISOString() };
            if (refVal) updates.payment_reference = refVal;
            
            if (file) {
                const ext = file.name.split('.').pop() || 'png';
                const filePath = `payment_proofs/${orderId}_${Date.now()}.${ext}`;
                const { error: upErr } = await supabase.storage.from('store_assets').upload(filePath, file, { upsert: true });
                if (!upErr) {
                    const { data: urlData } = supabase.storage.from('store_assets').getPublicUrl(filePath);
                    updates.payment_proof_url = urlData.publicUrl;
                }
            }
            
            await supabase.from('orders').update(updates).eq('id', orderId);
            
            setReferenceInputs(prev => ({...prev, [orderId]: ''}));
            setProofUploadFiles(prev => {
                const next = {...prev};
                delete next[orderId];
                return next;
            });
            fetchOrders();
            alert("Comprobante guardado exitosamente");
        } catch(e) {
            console.error(e);
            alert("Error al subir el comprobante");
        } finally {
            setIsUploadingProof(prev => ({...prev, [orderId]: false}));
        }
    };

    const handleUpdateOrderItems = async () => {
        if (!selectedOrderForEdit) return;
        setIsAccepting(true);
        try {
            const newTotal = editOrderItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);
            const fee = (selectedOrderForEdit as any).deliveryFee || 0;
            const updates = {
                items: editOrderItems,
                subtotal: newTotal,
                total: newTotal + fee,
                notes: editOrderNote,
                updated_at: new Date().toISOString()
            };
            await supabase.from('orders').update(updates).eq('id', selectedOrderForEdit.id);
            setEditModalOpen(false);
            setSelectedOrderForEdit(null);
            fetchOrders();
        } catch(e) {
            console.error(e);
            alert("Error al editar");
        } finally {
            setIsAccepting(false);
        }
    };

    const updateEditItemQty = (id: string, delta: number) => {
        setEditOrderItems(prev => prev.map(i => {
            if (i.id === id) {
                const n = i.quantity + delta;
                return n > 0 ? { ...i, quantity: n } : i;
            }
            return i;
        }));
    };

    const removeEditItem = (id: string) => {
        setEditOrderItems(prev => prev.filter(i => i.id !== id));
    };

    const updateEditItemNotes = (id: string, notes: string) => {
        setEditOrderItems(prev => prev.map(i => i.id === id ? { ...i, notes } : i));
    };

    const handleAddEditItem = () => {
        if (!editAddProductId) return;
        const prod = posProducts.find(p => p.id === editAddProductId);
        if (!prod) return;

        let finalPrice = prod.promoPrice > 0 ? prod.promoPrice : prod.price;
        let finalName = prod.name;
        
        if (editAddVariant) {
            const variantEntry = prod.priceVariants?.find((v:any) => v.name === editAddVariant);
            if (variantEntry) {
                finalPrice = variantEntry.price;
                finalName = `${prod.name} - ${editAddVariant}`;
            }
        }

        const newItem = {
            id: prod.id + '-' + Date.now(),
            name: finalName,
            price: finalPrice,
            quantity: editAddQty,
            notes: editAddNote
        };

        setEditOrderItems(prev => [...prev, newItem]);
        
        // Reset fields
        setEditAddProductId('');
        setEditAddVariant('');
        setEditAddQty(1);
        setEditAddNote('');
    };

    const toggleItemStock = (orderId: string, itemId: string) => {
        setMissingItemsByOrder(prev => {
            const current = prev[orderId] || [];
            if (current.includes(itemId)) {
                return { ...prev, [orderId]: current.filter(id => id !== itemId) };
            } else {
                return { ...prev, [orderId]: [...current, itemId] };
            }
        });
    };

    const handleConfirmStock = async (orderId: string) => {
        try {
            const missing = missingItemsByOrder[orderId] || [];
            
            if (missing.length > 0) {
                await supabase.from('orders').update({ 
                    status: 'action_required', 
                    updated_at: new Date().toISOString()
                }).eq('id', orderId);
                
                const orderTemp = orders.find(o => o.id === orderId);
                const missingNames = orderTemp?.items
                    .filter(i => missing.includes(i.id))
                    .map(i => i.name)
                    .join(', ');

                await supabase.from('messages').insert({
                    order_id: orderId,
                    text: `⚠️ *Atención:* Lamentablemente no contamos con stock de: *${missingNames}*. Por favor, selecciona una opción en tu pantalla para continuar con el pedido.`,
                    sender_id: user?.uid,
                    sender_name: 'Restaurante',
                    sender_role: 'restaurant',
                    created_at: new Date().toISOString()
                });
                
                toast.success("Pedido marcado con falta de stock. El cliente ha sido notificado.");
            } else {
                await supabase.from('orders').update({ 
                    status: 'awaiting_payment',
                    updated_at: new Date().toISOString()
                }).eq('id', orderId);

                // Enviar mensaje de pago
                const { data: restaurantData } = await supabase.from('comercios').select('*').eq('id', rid).single();
                
                if (restaurantData) {
                    const methods = restaurantData.payment_methods || [];
                    let paymentMsg = "✅ *Stock confirmado.* Ya puedes realizar tu pago:\n\n";
                    if (methods.length > 0) {
                        methods.forEach((m: any) => {
                            paymentMsg += `*${m.type}:*\n${m.bank ? 'Banco: ' + m.bank + '\n' : ''}${m.phone ? 'Tlf: ' + m.phone + '\n' : ''}${m.rif ? 'RIF/CI: ' + m.rif + '\n' : ''}${m.owner ? 'Titular: ' + m.owner + '\n' : ''}${m.email ? 'Correo: ' + m.email + '\n' : ''}\n`;
                        });
                        paymentMsg += "Favor enviar el capture y la referencia por este medio.\n\n_Hemos verificado tu pedido puedes proceder a realizar el pago_";
                    } else {
                        paymentMsg += "Por favor contacta con el restaurante para los métodos de pago.";
                    }

                    await supabase.from('messages').insert({
                        order_id: orderId,
                        text: paymentMsg,
                        sender_id: user?.uid,
                        sender_name: 'Restaurante',
                        sender_role: 'restaurant',
                        created_at: new Date().toISOString()
                    });
                }
                toast.success("Stock confirmado. El cliente ahora puede pagar.");
            }
            fetchOrders();
        } catch (error) {
            console.error("Error confirming stock:", error);
            toast.error("Error al confirmar stock");
        }
    };

    const handleVerifyPayment = async (orderId: string) => {
        const order = orders.find(o => o.id === orderId);
        if (!order) return;
        setSelectedOrderForVerify(order);
        setVerifyModalOpen(true);
        setVerificationSuccess(false);
    };

    const handleConfirmPayment = async () => {
        if (!selectedOrderForVerify) return;
        setIsVerifying(true);
        try {
            const isReadyNow = prepMinutes === 0;
            const nextStatus = isReadyNow ? 'ready' : 'preparing';
            const readyAt = isReadyNow 
                ? new Date().toISOString() 
                : new Date(Date.now() + prepMinutes * 60 * 1000).toISOString();

            await supabase.from('orders').update({ 
                status: nextStatus,
                payment_status: 'paid',
                preparation_time_minutes: prepMinutes,
                estimated_ready_at: readyAt,
                updated_at: new Date().toISOString()
            }).eq('id', selectedOrderForVerify.id);

            // Anunciar en el chat el tiempo de cocina asignado
            try {
                const msgText = isReadyNow
                    ? `👨‍🍳 *¡Pago verificado y pedido listo de inmediato!* Ya puedes solicitar tu repartidor o buscar tu pedido por pickup.`
                    : `👨‍🍳 *¡Pago verificado y comanda iniciada!* Tiempo estimado de preparación: *${prepMinutes} minutos*. Te avisaremos cuando esté listo para que solicites tu repartidor.`;

                await supabase.from('messages').insert({
                    order_id: selectedOrderForVerify.id,
                    sender_id: user?.uid,
                    sender_name: 'Restaurante',
                    sender_role: 'restaurant',
                    text: msgText,
                    action: 'payment_confirmed',
                    created_at: new Date().toISOString()
                });
            } catch (mErr) {
                console.warn("Message err:", mErr);
            }

            // Otorgar puntos por consumo (2.5 por cada $) si no se han otorgado
            if (selectedOrderForVerify.userId && selectedOrderForVerify.userId !== 'pos_customer' && !(selectedOrderForVerify as any).pointsCredited) {
                const pointsToAdd = Math.round(selectedOrderForVerify.total * 2.5);
                try {
                    const { data: prof } = await supabase.from('profiles').select('points').eq('id', selectedOrderForVerify.userId).single();
                    const currentPoints = prof?.points || 0;
                    await supabase.from('profiles').update({ points: currentPoints + pointsToAdd }).eq('id', selectedOrderForVerify.userId);
                    await supabase.from('orders').update({ points_credited: true }).eq('id', selectedOrderForVerify.id);
                } catch (pErr) {
                    console.warn("Points note:", pErr);
                }
            }

            await handlePrintOrder(selectedOrderForVerify.id, selectedOrderForVerify as any);

            toast.success(`Pago acreditado. Cocina: ${prepMinutes} min.`);
            setVerificationSuccess(true);
            fetchOrders();
            
            setTimeout(() => {
                setVerifyModalOpen(false);
                setSelectedOrderForVerify(null);
                setVerificationSuccess(false);
            }, 1800);

        } catch (error) {
            console.error("Error verifying payment:", error);
            toast.error("Error al procesar la acreditación");
        } finally {
            setIsVerifying(false);
        }
    };

    const updateStatus = async (orderId: string, newStatus: string, paymentStatus?: string) => {
        try {
            const orderTemp = orders.find(o => o.id === orderId);

            if (newStatus === 'preparing' && orderTemp) {
                await handlePrintOrder(orderId, orderTemp);
            }

            const updates: any = { status: newStatus, updated_at: new Date().toISOString() };
            if (paymentStatus) {
                updates.payment_status = paymentStatus;

                if (paymentStatus === 'sold' && orderTemp?.userId && orderTemp.userId !== 'pos_customer' && !(orderTemp as any).pointsCredited) {
                    try {
                        const pointsToAdd = Math.round(orderTemp.total * 2.5);
                        const { data: prof } = await supabase.from('profiles').select('points').eq('id', orderTemp.userId).single();
                        const currentPoints = prof?.points || 0;
                        await supabase.from('profiles').update({ points: currentPoints + pointsToAdd }).eq('id', orderTemp.userId);
                        updates.points_credited = true;
                    } catch (pointsError) {
                        console.error("Error al sumar puntos al usuario:", pointsError);
                    }
                }
            }
            await supabase.from('orders').update(updates).eq('id', orderId);

            if (newStatus === 'rejected') vibrateWarning();
            else vibrateSelection();
            fetchOrders();
        } catch (error) {
            console.error("Error updating order status:", error);
        }
    };

    const handleCreatePOSOrder = async () => {
        if (!user || !rid) return;
        if (posCart.length === 0) return alert("El carrito está vacío");
        if (posOrderType === 'delivery' && !posDeliveryAddress) return alert("Ingresa la dirección de envío");

        setIsSubmittingPOS(true);
        try {
            const items = posCart.map(item => ({
                id: item.id,
                name: item.name,
                price: item.price,
                quantity: item.quantity,
                category: item.category || ''
            }));

            const subtotal = items.reduce((acc, item) => acc + (item.price * item.quantity), 0);
            const total = subtotal + posDeliveryFee;

            let deliveryAddressStr = posOrderType === 'local' ? 'Consumo Local' : posOrderType === 'takeout' ? 'Para Llevar' : posDeliveryAddress;
            let targetOrderRefId = '';

            if (posEditingOrderId) {
                const orderPayload: any = {
                    items,
                    subtotal,
                    total,
                    user_name: posClientName || 'Cliente en mostrador',
                    client_dni: posClientDNI || '',
                    delivery_address: deliveryAddressStr,
                    delivery_fee: posDeliveryFee,
                    waiter_id: selectedWaiter?.id || '',
                    waiter_name: selectedWaiter?.name || '',
                    table_number: posOrderType === 'local' ? (selectedTable?.number || '') : '',
                    updated_at: new Date().toISOString()
                };
                await supabase.from('orders').update(orderPayload).eq('id', posEditingOrderId);
                targetOrderRefId = posEditingOrderId;
                toast.success("Pedido actualizado");
            } else {
                const newOrderPayload: any = {
                    restaurant_id: rid,
                    user_id: null,
                    user_name: posClientName || 'Cliente en mostrador',
                    client_dni: posClientDNI || '',
                    items,
                    subtotal,
                    total,
                    status: 'preparing',
                    payment_status: posOrderType === 'local' ? 'paid' : 'sold',
                    delivery_address: deliveryAddressStr,
                    source: 'pos',
                    order_type: posOrderType,
                    delivery_fee: posDeliveryFee,
                    waiter_id: selectedWaiter?.id || '',
                    waiter_name: selectedWaiter?.name || '',
                    table_number: posOrderType === 'local' ? (selectedTable?.number || '') : '',
                    created_at: new Date().toISOString()
                };
                const { data: insData, error: insErr } = await supabase.from('orders').insert(newOrderPayload).select().single();
                if (insErr) throw insErr;
                targetOrderRefId = insData?.id || '';
                toast.success("Pedido creado");
            }

            // Update Table Status if local
            if (posOrderType === 'local' && selectedTable) {
                await supabase.from('restaurant_tables').update({
                    status: 'occupied',
                    current_order_id: targetOrderRefId
                }).eq('id', selectedTable.id);
            }

            const printData = {
                id: targetOrderRefId,
                userName: posClientName || 'Cliente en mostrador',
                items,
                total,
                status: 'preparing',
                createdAt: new Date(),
                deliveryAddress: deliveryAddressStr,
                source: 'pos',
                userId: 'pos_customer',
                waiterName: selectedWaiter?.name || '',
                tableNumber: posOrderType === 'local' ? (selectedTable?.number || '') : '',
            } as any;

            setShowPOS(false);
            setPosEditingOrderId(null);
            setPosCart([]);
            setPosClientName('');
            setPosClientDNI('');
            setPosDeliveryAddress('');
            setPosDeliveryFee(0);
            setPosOrderType('local');
            setSelectedWaiter(null);
            setSelectedTable(null);
            setWaiterSearch('');
            setTableSearch('');

            setSelectedOrderForComanda(printData);
            fetchOrders();
        } catch (error) {
            console.error("Error creando orden POS:", error);
            alert("Error al procesar la venta");
        } finally {
            setIsSubmittingPOS(false);
        }
    };

    const addToPosCart = (product: any) => {
        setPosCart(current => {
            const existing = current.find(item => item.id === product.id);
            if (existing) {
                return current.map(item =>
                    item.id === product.id
                        ? { ...item, quantity: item.quantity + 1 }
                        : item
                );
            }
            return [...current, { ...product, quantity: 1, price: product.promoPrice > 0 ? product.promoPrice : product.price }];
        });
    };

    const updatePosCartItem = (id: string, delta: number) => {
        setPosCart(current => current.map(item => {
            if (item.id === id) {
                const newQuantity = item.quantity + delta;
                return newQuantity > 0 ? { ...item, quantity: newQuantity } : item;
            }
            return item;
        }));
    };

    const removePosCartItem = (id: string) => {
        setPosCart(current => current.filter(item => item.id !== id));
    };

    const stats = {
        pending: orders.filter(o => 
            o.status === 'pending' || 
            o.status === 'pendiente_pago' || 
            o.status === 'calling' ||
            o.status === 'awaiting_payment' ||
            o.status === 'action_required' ||
            o.status === 'pending_verification' ||
            o.status === 'preparing' ||
            o.status === 'awaiting_delivery_driver'
        ).length,
        delivering: orders.filter(o => o.status === 'delivering' || o.status === 'buscando_piloto' || o.status === 'piloto_asignado' || o.status === 'conductor_asignado' || o.status === 'en_camino' || o.status === 'ready').length,
        delivered: orders.filter(o => o.status === 'delivered').length,
        rejected: orders.filter(o => o.status === 'rejected').length,
        tables: tables.length
    };

    const filteredOrders = orders
        .filter(o => {
            if (activeTab === 'pending') return (
                o.status === 'pending' ||
                o.status === 'pendiente_pago' ||
                o.status === 'calling' ||
                o.status === 'awaiting_payment' ||
                o.status === 'action_required' ||
                o.status === 'pending_verification' ||
                o.status === 'preparing' ||
                o.status === 'awaiting_delivery_driver' ||
                o.status === 'awaiting_delivery_payment' ||
                o.status === 'verificando_pago_delivery'
            );
            if (activeTab === 'delivering') return (
                o.status === 'delivering' ||
                o.status === 'buscando_piloto' ||
                o.status === 'piloto_asignado' ||
                o.status === 'conductor_asignado' ||
                o.status === 'en_camino' ||
                o.status === 'ready'
            );
            if (activeTab === 'tables') return false; // Handled by renderTablesView
            return o.status === activeTab;
        })
        .filter(o =>
            (o.id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (o.deliveryAddress || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            ((o.userName || '').toLowerCase().includes(searchTerm.toLowerCase()))
        );

    const [showTableModal, setShowTableModal] = useState(false);

    const handleAssignWaiter = async (tableId: string, waiter: { id: string, name: string } | null) => {
        if (!user || !rid) return;
        try {
            await supabase.from('restaurant_tables').update({
                status: waiter ? 'occupied' : 'available'
            }).eq('id', tableId);

            const activeOrder = orders.find(o => (o as any).tableId === tableId && (o.status === 'occupied' || o.status === 'calling' || o.status === 'preparing'));
            if (activeOrder) {
                await supabase.from('orders').update({
                    waiter_id: waiter ? waiter.id : '',
                    waiter_name: waiter ? waiter.name : ''
                }).eq('id', activeOrder.id);
            }

            setShowTableModal(false);
            setSelectedTable(null);
            fetchOrders();
        } catch (error) {
            console.error("Error assigning waiter:", error);
            alert("Error al asignar mesero");
        }
    };

    const renderTablesView = () => {
        return (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6 animate-in fade-in slide-in-from-bottom-4">
                {tables.map((table) => {
                    const activeOrder = orders.find(o => 
                        ((o as any).tableId === table.id || (o as any).tableNumber === table.number || (o as any).table === table.number) && 
                        ['occupied', 'calling', 'preparing', 'delivering', 'delivered', 'pending', 'pendiente_pago'].includes(o.status) &&
                        o.paymentStatus !== 'sold' &&
                        o.paymentStatus !== 'merged'
                    );
                    
                    let status = table.status === 'available' ? 'free' : (table.status || 'free');
                    if (status === 'billing') status = 'occupied';
                    
                    if (activeOrder) {
                        status = activeOrder.status === 'calling' ? 'calling' : 'occupied';
                    }

                    return (
                        <div
                            key={table.id}
                            onClick={() => {
                                setSelectedTable(table);
                                setShowTableModal(true);
                            }}
                            className={`relative group cursor-pointer transition-all duration-300 ${
                                status === 'calling' ? 'ring-4 ring-red-500 ring-offset-4 animate-pulse' : ''
                            }`}
                        >
                            <div className={`aspect-square rounded-[35px] border-2 flex flex-col items-center justify-center gap-3 transition-all ${
                                status === 'occupied' ? 'bg-emerald-50 border-emerald-200' :
                                status === 'calling' ? 'bg-red-50 border-red-200' :
                                'bg-white border-slate-100 hover:border-primary/30 hover:shadow-xl'
                            }`}>
                                <Users className={`w-8 h-8 ${
                                    status === 'occupied' ? 'text-primary' :
                                    status === 'calling' ? 'text-red-500' :
                                    'text-slate-300 group-hover:text-slate-900 transition-colors'
                                }`} />
                                <div className="text-center">
                                    <p className={`text-2xl font-black ${
                                        status === 'occupied' ? 'text-emerald-900' :
                                        status === 'calling' ? 'text-red-900' :
                                        'text-slate-600'
                                    }`}>#{table.number}</p>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                        {status === 'free' ? 'Disponible' : status === 'calling' ? 'Llamando' : 'Ocupada'}
                                    </p>
                                </div>
                                {table.waiterName && (
                                    <div className="absolute -bottom-2 bg-white border border-slate-100 px-3 py-1 rounded-full shadow-sm">
                                        <p className="text-[10px] font-black text-slate-900 truncate max-w-[80px]">
                                            {table.waiterName}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };
    const renderOrderCard = (order: any) => {
        // Rediseño simplificado para pedidos en pestaña "Entregados" (Requerimiento 5)
        if (order.status === 'delivered') {
            const totalItemsCount = (order.items || []).reduce((acc: number, item: any) => acc + (item.quantity || 1), 0);
            const itemsText = totalItemsCount === 1 ? '1 ítem' : `${totalItemsCount} productos`;
            const timeStr = order.createdAt?.toDate 
                ? order.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
                : (order.createdAt ? new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');

            return (
                <div 
                    key={order.id} 
                    onClick={() => setSelectedOrderForDetail(order)}
                    className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-slate-100 shadow-xs hover:shadow-md hover:border-slate-200 transition-all cursor-pointer group relative overflow-hidden"
                >
                    {order.paymentStatus === 'sold' && (
                        <div className="absolute top-0 right-0 p-3 sm:p-4">
                            <span className="bg-green-100 text-green-700 text-[9px] sm:text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">Venta Exitosa</span>
                        </div>
                    )}
                    {order.paymentStatus === 'not_sold' && (
                        <div className="absolute top-0 right-0 p-3 sm:p-4">
                            <span className="bg-red-100 text-red-600 text-[9px] sm:text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">No Vendido</span>
                        </div>
                    )}

                    <div className="flex justify-between items-start">
                        <div className="space-y-1">
                            <div className="flex items-center gap-1.5 mb-1">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">#{order.id.slice(-6).toUpperCase()}</span>
                                <span className="bg-emerald-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider flex items-center gap-1">
                                    {order.source === 'waiter' ? 'Mesero' : 'App Delivery'}
                                </span>
                                <span className="bg-emerald-100 text-emerald-700 text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1">
                                    <CheckCircle className="w-3 h-3" /> Entregado
                                </span>
                            </div>
                            <h3 className="text-base sm:text-lg font-black text-slate-900 group-hover:text-primary transition-colors">
                                {order.userName || 'Usuario de Deliexpress'}
                            </h3>
                            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-slate-500 font-bold">
                                {order.clientDNI && (
                                    <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-lg text-[11px] font-bold">
                                        CI: {order.clientDNI}
                                    </span>
                                )}
                                <span className="flex items-center gap-1 text-slate-400">
                                    <Clock className="w-3.5 h-3.5" />
                                    {timeStr}
                                </span>
                                <span className="bg-amber-50 text-amber-800 border border-amber-200/60 px-2 py-0.5 rounded-lg text-[11px] font-black">
                                    🛍️ {itemsText}
                                </span>
                            </div>
                        </div>

                        <div className="text-right shrink-0">
                            <p className="text-xl sm:text-2xl font-black text-slate-900">${order.total.toFixed(2)}</p>
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Total Cobrado</p>
                            <span className="text-[10px] font-black text-primary group-hover:underline mt-2 inline-flex items-center gap-1">
                                Ver detalle <ChevronRight className="w-3 h-3" />
                            </span>
                        </div>
                    </div>
                </div>
            );
        }

        return (
            <div key={order.id} className="bg-white rounded-2xl sm:rounded-[32px] p-3.5 sm:p-6 border border-slate-100 shadow-sm hover:shadow-md transition-all group relative overflow-hidden">
            {order.paymentStatus === 'sold' && (
                <div className="absolute top-0 right-0 p-3 sm:p-4">
                    <span className="bg-green-100 text-green-700 text-[9px] sm:text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">Venta Exitosa</span>
                </div>
            )}
            {order.paymentStatus === 'not_sold' && (
                <div className="absolute top-0 right-0 p-3 sm:p-4">
                    <span className="bg-red-100 text-red-600 text-[9px] sm:text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">No Vendido</span>
                </div>
            )}

            <div className="flex justify-between items-start mb-3 sm:mb-5">
                <div>
                    <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">#{order.id.slice(-6).toUpperCase()}</span>
                        {order.source === 'waiter' ? (
                            <span className="bg-slate-900 text-white text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider flex items-center gap-1">
                                Mesero
                            </span>
                        ) : (
                            <span className="bg-emerald-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider flex items-center gap-1">
                                App Delivery
                            </span>
                        )}
                    </div>
                    <h3 className="text-base sm:text-lg font-black text-slate-900">{order.userName || 'Usuario de Deliexpress'}</h3>
                    <div className="flex flex-wrap items-center gap-2 mt-0.5">
                        <p className="text-xs text-slate-400 font-bold flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            {order.createdAt?.toDate ? order.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : (order.createdAt ? new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '')}
                        </p>
                        {order.userPhone && (
                            <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-lg">📞 {order.userPhone}</span>
                        )}
                        {order.clientDNI && (
                            <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">CI: {order.clientDNI}</span>
                        )}
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-xl sm:text-2xl font-black text-slate-900">${order.total.toFixed(2)}</p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Total Cobrado</p>
                </div>
            </div>

            <div className="space-y-2 mb-3 sm:mb-5">
                {order.items.map((item: any, idx: number) => {
                    const isMissing = (missingItemsByOrder[order.id] || []).includes(item.id);
                    return (
                        <div key={idx} className={`flex items-center gap-3 p-3 rounded-2xl transition-all ${isMissing ? 'bg-red-50 border border-red-100 opacity-60' : 'bg-slate-50 border border-transparent'}`}>
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black border shadow-sm ${isMissing ? 'bg-red-100 text-red-600 border-red-200' : 'bg-white text-slate-900 border-slate-100'}`}>
                                {item.quantity}x
                            </div>
                            <div className="flex-1">
                                <p className={`font-black ${isMissing ? 'text-red-700' : 'text-slate-700'}`}>{item.name}</p>
                                <p className="text-xs text-slate-400 font-bold">
                                    {item.consultPrice || item.price === 0 ? 'Precio a consultar' : `$${item.price.toFixed(2)} c/u`}
                                </p>
                            </div>
                            {(!order.stockConfirmed || order.status === 'pending') && (
                                <button
                                    onClick={() => toggleItemStock(order.id, item.id)}
                                    className={`p-2 rounded-xl transition-all ${isMissing ? 'bg-red-500 text-white' : 'bg-white text-slate-400 hover:text-red-500 border border-slate-100'}`}
                                    title={isMissing ? "Marcar como disponible" : "Marcar como sin stock"}
                                >
                                    <ShoppingCart className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>

            {(order as any).orderNote && (
                <div className="bg-primary border border-primary/20 text-slate-900 p-4 rounded-xl mb-6 text-sm">
                    <span className="font-black uppercase tracking-widest text-[10px] block mb-1 opacity-70">Nota del Cliente:</span>
                    <p className="font-bold">{((order as any).orderNote)}</p>
                </div>
            )}

            <div className="flex items-start justify-between gap-3 p-4 bg-slate-50 rounded-2xl mb-8">
                <div className="flex items-start gap-3">
                    {order.delivery_method === 'pickup' || order.order_type === 'pickup' || order.deliveryMethod === 'pickup' ? (
                        <Store className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    ) : (
                        <MapPin className="w-5 h-5 text-slate-900 shrink-0 mt-0.5" />
                    )}
                    <div>
                        <p className="text-sm font-bold text-slate-700 leading-relaxed italic">
                            {order.delivery_method === 'pickup' || order.order_type === 'pickup' || order.deliveryMethod === 'pickup'
                                ? '🏪 Retiro en Tienda / Entrega Propia'
                                : (order.deliveryAddress || 'Sin dirección especificada')}
                        </p>
                        {order.userPhone && (
                            <p className="text-xs font-bold text-slate-500 mt-1">📞 Contacto: {order.userPhone}</p>
                        )}
                    </div>
                </div>
                {order.deliveryCoords?.lat && order.status !== 'delivering' && order.status !== 'en_camino' && order.status !== 'ready' && order.status !== 'delivered' && (
                    <a
                        href={`https://www.google.com/maps?q=${order.deliveryCoords.lat},${order.deliveryCoords.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 bg-primary/20 hover:bg-primary text-slate-900 px-3 py-1.5 rounded-xl font-black text-xs transition-all flex items-center gap-1 shadow-xs cursor-pointer"
                    >
                        🗺️ Ver GPS
                    </a>
                )}
            </div>

            {/* Payment Details Block */}
            {order.paymentMethod && (
                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 mb-6">
                    <div className="flex items-center justify-between mb-3">
                        <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Método de Pago</p>
                            <p className="font-black text-slate-800 flex items-center gap-2">
                                <CreditCard className="w-4 h-4 text-slate-400" />
                                {order.paymentMethod}
                            </p>
                        </div>
                        {order.status === 'pending_verification' && (
                            <div className="bg-amber-100 text-amber-700 px-3 py-1 rounded-lg text-[10px] font-black uppercase">
                                Por Verificar
                            </div>
                        )}
                    </div>

                    {(order.paymentReference || order.paymentProofUrl) && (
                        <div className="mt-3 pt-3 border-t border-slate-200/50 space-y-2">
                            <div className="flex justify-between items-center text-xs">
                                <span className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">Referencia:</span>
                                <span className="font-black text-slate-700">{order.paymentReference || 'N/A'}</span>
                            </div>
                            {order.paymentProofUrl && (
                                <div className="mt-2 p-2.5 bg-white border border-slate-200 rounded-2xl flex items-center gap-3 shadow-xs">
                                    <div 
                                        onClick={() => setPreviewImageModal(order.paymentProofUrl || null)}
                                        className="w-16 h-16 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0 cursor-zoom-in group relative"
                                        title="Clic para ampliar comprobante"
                                    >
                                        <img 
                                            src={order.paymentProofUrl} 
                                            alt="Comprobante" 
                                            className="w-full h-full object-cover group-hover:scale-110 transition-transform" 
                                        />
                                        <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                            <Eye className="w-5 h-5 text-white" />
                                        </div>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Captura Adjunta</p>
                                        <p className="text-xs font-black text-slate-800 truncate">Comprobante de Pago</p>
                                        <div className="flex items-center gap-3 mt-1.5">
                                            <button
                                                type="button"
                                                onClick={() => setPreviewImageModal(order.paymentProofUrl || null)}
                                                className="text-[11px] font-black text-blue-600 hover:text-blue-700 flex items-center gap-1 active:scale-95"
                                            >
                                                <Eye className="w-3.5 h-3.5" /> Ampliar
                                            </button>
                                            <a
                                                href={order.paymentProofUrl}
                                                download={`comprobante_${order.id.slice(-6)}.jpg`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-[11px] font-black text-emerald-600 hover:text-emerald-700 flex items-center gap-1 active:scale-95"
                                            >
                                                <Download className="w-3.5 h-3.5" /> Descargar
                                            </a>
                                        </div>
                                    </div>
                                    {!order.restaurantPaid && (
                                        <button
                                            onClick={() => handleVerifyPayment(order.id)}
                                            className="bg-primary hover:bg-primary/90 text-slate-900 px-3.5 py-2.5 rounded-xl text-xs font-black shrink-0 active:scale-95 shadow-sm transition-all"
                                        >
                                            Validar
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
                    
                    {/* Inline Proof Upload Form */}
                    {order.status !== 'rejected' && !order.paymentProofUrl && ['Pago Móvil', 'Transferencia'].includes(order.paymentMethod) && (
                        <div className="flex gap-2 items-center mt-3 pt-3 border-t border-slate-200/50">
                            <div className="flex-1">
                                <input 
                                    type="text" 
                                    placeholder="Ref (6 dígitos)" 
                                    className="w-full bg-white border border-slate-200 px-3 py-2 rounded-xl text-sm outline-none focus:border-primary font-bold text-slate-700"
                                    value={referenceInputs[order.id] || ''}
                                    onChange={(e) => setReferenceInputs(prev => ({...prev, [order.id]: e.target.value}))}
                                />
                            </div>
                            <label className="bg-white border border-slate-200 p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:border-primary transition-all cursor-pointer">
                                <input 
                                    type="file" 
                                    accept="image/*" 
                                    className="hidden" 
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) setProofUploadFiles(prev => ({...prev, [order.id]: file}));
                                    }}
                                />
                                <ImageIcon className={`w-5 h-5 ${proofUploadFiles[order.id] ? 'text-slate-900' : ''}`} />
                            </label>
                            <button 
                                onClick={() => handleSavePaymentProof(order.id)}
                                disabled={isUploadingProof[order.id] || (!referenceInputs[order.id] && !proofUploadFiles[order.id])}
                                className="bg-primary text-slate-900 p-2 rounded-xl hover:bg-primary/90 transition-all disabled:opacity-50"
                                title="Guardar Pago"
                            >
                                {isUploadingProof[order.id] ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                            </button>
                        </div>
                    )}

                <div className="flex flex-wrap items-center gap-3">
                {order.restaurantPaid && (
                   <div className="w-full flex flex-col items-center justify-center p-6 bg-green-50 rounded-3xl border-2 border-green-200 animate-in zoom-in duration-500 mb-4">
                       <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mb-3 shadow-lg shadow-green-200">
                           <CheckCircle className="w-10 h-10 text-white" />
                       </div>
                       <p className="text-xl font-black text-green-600 uppercase tracking-tighter">Pago Acreditado</p>
                       <p className="text-[10px] font-bold text-green-500/70 uppercase">Verificado por Administración</p>
                   </div>
                )}

                {(order.status === 'pending' || order.status === 'pendiente_pago' || order.status === 'pending_verification' || order.status === 'awaiting_delivery_payment' || order.status === 'awaiting_payment') && (
                    <>
                        <button
                            onClick={() => setChatOrderId(order.id)}
                            className="px-5 bg-slate-100 text-slate-800 py-4 rounded-2xl font-black hover:bg-slate-200 active:scale-95 transition-all flex items-center justify-center gap-2 border border-slate-200 shadow-sm"
                            title="Abrir Chat con Cliente"
                        >
                            <MessageCircle className="w-5 h-5 text-slate-700" />
                            <span>Chat</span>
                        </button>
                        {(order.status === 'awaiting_payment' && !order.paymentProofUrl) ? (
                            <div className="flex-1 bg-emerald-50 text-emerald-700 py-4 rounded-2xl font-black border border-emerald-200 flex flex-col items-center justify-center gap-1">
                                <span className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-emerald-500" /> Stock Confirmado</span>
                                <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">Esperando Pago del Cliente</span>
                            </div>
                        ) : (order.status === 'pending_verification' || order.paymentProofUrl || (order as any).payment_status === 'verifying') ? (
                            <button
                                onClick={() => handleVerifyPayment(order.id)}
                                className="flex-1 bg-primary text-slate-900 py-4 rounded-2xl font-black shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                            >
                                <CheckCircle className="w-5 h-5" /> Validar Pago e Iniciar Cocina
                            </button>
                        ) : order.status === 'awaiting_delivery_payment' ? (
                            <div className="flex-1 bg-amber-50 text-amber-600 py-4 rounded-2xl font-black border border-amber-100 flex flex-col items-center justify-center group relative overflow-hidden">
                                <span className="flex items-center gap-2 relative z-10"><Clock className="w-4 h-4 animate-spin" /> Esperando Delivery...</span>
                                <div className="absolute inset-0 bg-amber-100/30 -translate-x-full group-hover:translate-x-0 transition-transform duration-500"></div>
                            </div>
                        ) : !(order as any).stockConfirmed ? (
                            <button
                                onClick={() => handleConfirmStock(order.id)}
                                className="flex-1 bg-blue-500 text-white py-4 rounded-2xl font-black shadow-lg shadow-blue-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                            >
                                <CheckCircle className="w-5 h-5" /> Confirmar Stock
                            </button>
                        ) : (
                            <button
                                onClick={() => { setSelectedOrderForAccept(order); setAcceptModalOpen(true); }}
                                disabled={printingOrderId === order.id}
                                className="flex-1 min-w-[140px] bg-primary text-slate-900 py-4 rounded-2xl font-black shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {printingOrderId === order.id ? (
                                    <><Loader2 className="w-5 h-5 animate-spin" /> Imprimiendo...</>
                                ) : (
                                    <>{order.status === 'pendiente_pago' ? 'Verificar y Procesar' : 'Aceptar'}</>
                                )}
                            </button>
                        )}
                        {/* Edge Case 6.1: Pre-payment 45-min inactivity timeout */}
                        {(() => {
                            const orderCreatedTime = order.createdAt?.toDate ? order.createdAt.toDate().getTime() : new Date(order.createdAt).getTime();
                            const isInactive45Min = (Date.now() - orderCreatedTime > 45 * 60 * 1000) && !order.paymentProofUrl && ['pending', 'pendiente_pago', 'awaiting_payment'].includes(order.status);
                            if (!isInactive45Min) return null;
                            return (
                                <button
                                    onClick={async () => {
                                        if (window.confirm("¿Deseas cancelar esta orden por inactividad tras más de 45 min sin pago? Esto liberará el stock.")) {
                                            try {
                                                await supabase.from('orders').update({
                                                    status: 'cancelled',
                                                    rejection_reason: 'inactivity_timeout',
                                                    cancellation_reason: 'inactivity_timeout',
                                                    updated_at: new Date().toISOString()
                                                }).eq('id', order.id);

                                                await supabase.from('messages').insert({
                                                    order_id: order.id,
                                                    sender_id: user?.uid,
                                                    sender_name: 'Restaurante',
                                                    sender_role: 'restaurant',
                                                    text: "❌ *Orden cancelada por inactividad:* Tras más de 45 minutos sin confirmación de pago, la orden ha sido cancelada para liberar el inventario.",
                                                    created_at: new Date().toISOString()
                                                });

                                                toast.success("Orden cancelada por inactividad. Stock liberado.");
                                                fetchOrders();
                                            } catch (e) {
                                                console.error(e);
                                                toast.error("Error al cancelar orden");
                                            }
                                        }
                                    }}
                                    className="px-3 py-2 bg-red-50 text-red-700 border border-red-200 rounded-xl text-xs font-black hover:bg-red-100 transition-all flex items-center gap-1 shrink-0"
                                    title="Liberar Stock por Inactividad (45+ min)"
                                >
                                    <Clock className="w-3.5 h-3.5" /> Liberar Stock (Inactividad)
                                </button>
                            );
                        })()}

                        {order.status !== 'awaiting_payment' && !order.restaurantPaid && (
                            <button
                                onClick={() => {
                                    setSelectedOrderForReject(order);
                                    setSmartRejectReason(null);
                                    setSmartRejectModalOpen(true);
                                }}
                                className="px-6 bg-slate-100 text-slate-500 py-4 rounded-2xl font-black hover:bg-red-50 hover:text-red-500 transition-all"
                            >
                                Rechazar
                            </button>
                        )}
                    </>
                )}
                
                {(order.status === 'preparing' || order.status === 'awaiting_delivery_driver' || order.status === 'buscando_piloto' || order.status === 'piloto_asignado') && (
                    <div className="flex flex-col w-full gap-2.5">
                        {order.status === 'preparing' && (
                            <div className="bg-amber-50 border border-amber-200 px-3.5 py-2 rounded-2xl flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2 text-amber-900 font-black">
                                    <Clock className="w-4 h-4 text-amber-600 animate-spin" />
                                    <span>Preparación en Cocina</span>
                                </div>
                                <span className="bg-amber-200/80 text-amber-900 px-2.5 py-0.5 rounded-full font-black text-[11px]">
                                    {(order as any).preparation_time_minutes || 20} min est.
                                </span>
                            </div>
                        )}
                        <div className="flex w-full gap-2">
                            {(() => {
                                const cardChosenDriver = order.driver_name || order.driverName || order.preferred_driver_name || (drivers.find(d => d.id === order.preferred_driver_id || d.id === order.driver_id)?.full_name);
                                return (
                                    <button
                                        onClick={() => {
                                            setSelectedOrderForDispatch(order);
                                            setDispatchType('platform');
                                            if (order.preferred_driver_id || order.driver_id) {
                                                setSelectedDriver(order.preferred_driver_id || order.driver_id!);
                                                setSelectedVehicleCategory('moto');
                                            }
                                            setDispatchModalOpen(true);
                                            fetchActiveDrivers();
                                        }}
                                        className="flex-1 bg-amber-500 hover:bg-amber-600 text-slate-950 py-4 rounded-2xl font-black shadow-lg shadow-amber-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                                    >
                                        <Bike className="w-5 h-5" /> {cardChosenDriver ? `Despachar a ${cardChosenDriver}` : 'Despachar Repartidor'}
                                    </button>
                                );
                            })()}
                            <button
                                onClick={() => setChatOrderId(order.id)}
                                className="px-4 bg-slate-100 text-slate-700 py-4 rounded-2xl font-black hover:bg-slate-200 transition-all flex items-center justify-center gap-1.5 border border-slate-200 shadow-sm"
                                title="Abrir Chat"
                            >
                                <MessageCircle className="w-5 h-5 text-slate-700" />
                                <span>Chat</span>
                            </button>
                        </div>
                    </div>
                )}

                {order.status === 'delivering' && (
                    <div className="flex flex-col w-full gap-2.5">
                        <div className="w-full bg-amber-50/90 border border-amber-200/80 p-3.5 rounded-2xl flex items-center justify-between shadow-xs">
                            <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-700 flex items-center justify-center shrink-0">
                                    <Bike className="w-5 h-5 animate-pulse" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-xs font-black text-slate-900 truncate">
                                        Pedido en tránsito con {order.driver_name || order.driverName || order.preferred_driver_name || (order as any).assigned_driver_name || 'repartidor'}
                                    </p>
                                    <p className="text-[10px] font-bold text-amber-700">
                                        ⏳ Esperando calificación del cliente • Se cerrará automáticamente en 24h
                                    </p>
                                </div>
                            </div>
                            <span className="bg-amber-100 text-amber-800 text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider flex items-center gap-1.5 shrink-0">
                                <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span> En Camino
                            </span>
                        </div>
                        <button
                            onClick={() => setChatOrderId(order.id)}
                            className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 py-3 rounded-2xl font-black transition-all flex items-center justify-center gap-2 border border-slate-200 shadow-sm text-xs"
                            title="Abrir Chat del Pedido"
                        >
                            <MessageCircle className="w-4 h-4 text-slate-700" />
                            <span>Abrir Chat con Cliente / Conductor</span>
                        </button>
                    </div>
                )}

                {order.status === 'ready' && (
                    <div className="flex flex-col w-full gap-2.5">
                        <div className="w-full bg-emerald-50 border border-emerald-200 p-3.5 rounded-2xl flex items-center justify-between">
                            <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-700 flex items-center justify-center shrink-0">
                                    <Store className="w-5 h-5" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-xs font-black text-slate-900 truncate">Listo para Retiro en Tienda</p>
                                    <p className="text-[10px] font-bold text-slate-500">Cliente o personal propio retira en el local</p>
                                </div>
                            </div>
                            <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider shrink-0">
                                Listo
                            </span>
                        </div>
                        <div className="flex w-full gap-2">
                            <button
                                onClick={() => updateStatus(order.id, 'delivered')}
                                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-3.5 rounded-2xl font-black shadow-lg shadow-emerald-600/20 hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2 text-xs"
                            >
                                <CheckCircle className="w-4 h-4" /> Confirmar Entrega en Local
                            </button>
                            <button
                                onClick={() => setChatOrderId(order.id)}
                                className="px-4 bg-slate-100 text-slate-700 py-3.5 rounded-2xl font-black hover:bg-slate-200 transition-all flex items-center justify-center gap-1.5 border border-slate-200 shadow-sm"
                                title="Abrir Chat"
                            >
                                <MessageCircle className="w-4 h-4 text-slate-700" />
                                <span className="text-xs">Chat</span>
                            </button>
                        </div>
                    </div>
                )}
                {order.status === 'delivered' && !order.paymentStatus && (
                    <div className="flex w-full gap-2">
                        <button
                            onClick={() => updateStatus(order.id, 'delivered', 'sold')}
                            className="flex-1 bg-green-100 text-green-700 py-3 rounded-xl font-black hover:bg-green-200 transition-all flex items-center justify-center gap-2"
                        >
                            <CheckCircle className="w-4 h-4" /> Venta Exitosa
                        </button>
                        <button
                            onClick={() => updateStatus(order.id, 'delivered', 'not_sold')}
                            className="flex-1 bg-red-50 text-red-600 py-3 rounded-xl font-black hover:bg-red-100 transition-all flex items-center justify-center gap-2"
                        >
                            <X className="w-4 h-4" /> No Vendido
                        </button>
                        <button
                            onClick={() => setChatOrderId(order.id)}
                            className="px-4 bg-slate-100 text-slate-700 py-3 rounded-xl font-black hover:bg-slate-200 transition-all flex items-center justify-center border border-slate-200"
                            title="Abrir Chat"
                        >
                            <MessageCircle className="w-4 h-4 text-slate-700" />
                        </button>
                    </div>
                )}
                {order.status === 'delivered' && order.paymentStatus === 'pending' && order.source === 'waiter' && (
                    <button
                        onClick={() => { setSelectedOrderForClose(order); setCloseSaleModalOpen(true); }}
                        className="w-full bg-emerald-500 text-white py-4 rounded-2xl font-black shadow-lg shadow-emerald-500/20 hover:bg-emerald-600 transition-all flex items-center justify-center gap-2"
                    >
                        <DollarSign className="w-5 h-5" /> Cerrar Venta y Cobrar
                    </button>
                )}
                {chatOrderId === order.id && (
                    <div className="fixed inset-0 z-[200] bg-white flex flex-col w-full h-full overflow-hidden animate-in fade-in duration-200">
                        <OrderChatWindow
                            orderId={order.id}
                            currentUserRole="restaurant"
                            currentUserId={user?.uid || 'admin'}
                            currentUserName={user?.email === 'admin@un2x3.com' ? 'Administración 2x3' : 'Caja Central'}
                            restaurantId={rid!}
                            orderInfo={order}
                            onClose={() => setChatOrderId(null)}
                        />
                    </div>
                )}
            </div>
        </div>
    );
};

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px]">
                <Loader2 className="w-10 h-10 text-slate-900 animate-spin" />
                <p className="mt-4 text-slate-500 font-bold">Cargando pedidos en tiempo real...</p>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-700 pb-20">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 flex items-center gap-3">
                        Gestión de Pedidos
                        {stats.pending > 0 && (
                            <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full animate-bounce">
                                {stats.pending} NUEVOS
                            </span>
                        )}
                    </h1>
                    <p className="text-slate-500 font-medium">Monitorea y despacha tus órdenes al momento.</p>
                </div>
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => setShowPOS(true)}
                        className="bg-primary text-slate-900 px-6 py-3 rounded-2xl font-black hover:scale-105 transition-all shadow-lg shadow-primary/30 flex items-center gap-2"
                    >
                        <ShoppingCart className="w-5 h-5" />
                        <span className="hidden sm:inline">Nueva Venta (POS)</span>
                    </button>
                    <div className="flex items-center gap-2 bg-green-50 text-green-600 px-4 py-2 rounded-xl text-sm font-bold border border-green-100 italic">
                        <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                        <span className="hidden sm:inline">Buscando nuevos pedidos...</span>
                    </div>
                </div>
            </div>

            {/* 💸 Driver Payment Pending Notice */}
            {(() => {
                const pendingDriverPayments = orders.filter((o: any) => 
                    o.status === 'delivering' || o.status === 'delivered' || o.status === 'completed'
                ).filter((o: any) => (o as any).driver_payout && !(o as any).driver_paid);
                if (pendingDriverPayments.length === 0) return null;
                return (
                    <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 flex items-start gap-3">
                        <div className="w-9 h-9 rounded-xl bg-orange-500 text-white flex items-center justify-center shrink-0 mt-0.5">
                            <DollarSign className="w-5 h-5" />
                        </div>
                        <div className="flex-1">
                            <p className="font-black text-sm text-orange-900">
                                💸 Debes pagar a {pendingDriverPayments.length} repartidor{pendingDriverPayments.length > 1 ? 'es' : ''}
                            </p>
                            <p className="text-[11px] font-bold text-orange-700 mt-0.5">
                                Tienes entregas con driver asignado donde aún no has pagado el flete. Recuerda cancelarle directamente al driver.
                            </p>
                            <div className="mt-2 space-y-1">
                                {pendingDriverPayments.slice(0, 3).map((o: any) => (
                                    <div key={o.id} className="flex items-center justify-between bg-white rounded-xl px-3 py-2 border border-orange-100">
                                        <div>
                                            <p className="text-[10px] font-black text-slate-700">Pedido #{o.id.slice(0, 8)} — {(o as any).driver_name || 'Driver'}</p>
                                            <p className="text-[10px] font-bold text-slate-500">{o.deliveryAddress || 'Sin dirección'}</p>
                                        </div>
                                        <span className="text-xs font-black text-emerald-700">${Number((o as any).driver_payout || 0).toFixed(2)} USD</span>
                                    </div>
                                ))}
                                {pendingDriverPayments.length > 3 && (
                                    <p className="text-[10px] font-bold text-orange-600 px-1">+ {pendingDriverPayments.length - 3} más…</p>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Status Tabs */}
            <div className="flex items-center gap-1.5 p-1.5 bg-slate-100 rounded-2xl overflow-x-auto no-scrollbar">
                {[
                    { id: 'pending', label: 'Pendientes', icon: Bell, color: 'bg-emerald-500' },
                    { id: 'delivering', label: 'En Camino', icon: Truck, color: 'bg-emerald-700' },
                    { id: 'delivered', label: 'Entregados', icon: CheckCircle, color: 'bg-emerald-500' },
                    { id: 'tables', label: 'Mesas', icon: Users, color: 'bg-slate-900' },
                    { id: 'rejected', label: 'Rechazados', icon: X, color: 'bg-slate-500' },
                ].map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`flex items-center justify-center gap-1.5 px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl font-black text-xs transition-all whitespace-nowrap shrink-0 sm:flex-1 ${activeTab === tab.id
                            ? 'bg-white shadow-sm text-slate-900'
                            : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
                            }`}
                    >
                        <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? 'text-slate-900' : 'text-slate-400'}`} />
                        <span>{tab.label}</span>
                        <span className={`text-[10px] font-black px-1.5 py-0.2 rounded-full ${tab.id === 'tables' ? 'bg-slate-900 text-white' : 'text-white ' + tab.color}`}>
                            {(stats as any)[tab.id]}
                        </span>
                    </button>
                ))}
            </div>

            <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                    type="text"
                    placeholder="Buscar por ID de pedido o dirección..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-white border border-slate-200 p-2.5 sm:p-3.5 pl-10 rounded-xl sm:rounded-2xl outline-none focus:border-primary transition-all font-bold text-xs sm:text-sm text-slate-700 shadow-sm"
                />
            </div>

            {activeTab === 'tables' ? (
                renderTablesView()
            ) : filteredOrders.length === 0 ? (
                <div className="p-20 text-center border-2 border-dashed border-slate-100 rounded-[40px] grayscale opacity-50 bg-white/50">
                    <Clock className="w-16 h-16 text-slate-200 mx-auto mb-4" />
                    <p className="text-slate-400 font-bold text-xl">Sin pedidos en esta sección</p>
                    <p className="text-slate-300 font-medium max-w-xs mx-auto mt-2 italic">Aquí aparecerán los pedidos que coincidan con el estado seleccionado.</p>
                </div>
            ) : (
                <div className="space-y-12">
                    {/* Waiter Orders Section */}
                    {filteredOrders.filter(o => o.source === 'waiter').length > 0 && (
                        <div className="space-y-6">
                            <div className="flex items-center gap-4 px-2">
                                <div className="h-px flex-1 bg-indigo-100"></div>
                                <h2 className="text-xl font-black text-slate-900 flex items-center gap-2 uppercase tracking-widest bg-primary px-6 py-2 rounded-full border border-primary/20">
                                    <Users className="w-6 h-6" /> 🍽️ Servicio en Mesa / Local ({filteredOrders.filter(o => o.source === 'waiter').length})
                                </h2>
                                <div className="h-px flex-1 bg-indigo-100"></div>
                            </div>
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                                {filteredOrders.filter(o => o.source === 'waiter').map(order => renderOrderCard(order))}
                            </div>
                        </div>
                    )}

                    {/* App / Delivery Orders Section */}
                    {filteredOrders.filter(o => o.source !== 'waiter').length > 0 && (
                        <div className="space-y-6">
                            <div className="flex items-center gap-4 px-2">
                                <div className="h-px flex-1 bg-emerald-100"></div>
                                <h2 className="text-xl font-black text-emerald-600 flex items-center gap-2 uppercase tracking-widest bg-emerald-50 px-6 py-2 rounded-full border border-emerald-100">
                                    <Package className="w-6 h-6 text-emerald-600" /> 📦 Pedidos Entrantes ({filteredOrders.filter(o => o.source !== 'waiter').length})
                                </h2>
                                <div className="h-px flex-1 bg-emerald-100"></div>
                            </div>
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                                {filteredOrders.filter(o => o.source !== 'waiter').map((order) => renderOrderCard(order))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Table Assignment Modal */}
            {showTableModal && selectedTable && (
                <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-slate-900/40 backdrop-blur-sm sm:px-4">
                    <div className="bg-white rounded-t-[40px] sm:rounded-[40px] p-8 w-full max-w-lg shadow-2xl animate-in slide-in-from-bottom sm:zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                        <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-6 sm:hidden shrink-0"></div>
                        {(() => {
                            const activeOrder = orders.find(o => 
                                ((o as any).tableId === selectedTable.id || (o as any).tableNumber === selectedTable.number || o.table === selectedTable.number) && 
                                ['occupied', 'calling', 'preparing', 'delivering', 'delivered'].includes(o.status) &&
                                (o.paymentStatus !== 'sold')
                            );

                            return (
                                <>
                                    <div className="flex justify-between items-start mb-6 shrink-0">
                                        <div>
                                            <div className="flex items-center gap-3">
                                                <h3 className="text-2xl font-black text-slate-900">Mesa #{selectedTable.number}</h3>
                                                {activeOrder && (
                                                    <span className="px-3 py-1 bg-emerald-500 text-white rounded-full text-[10px] font-black uppercase tracking-widest">
                                                        Ocupada
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px] mt-1">Gestión de Servicio</p>
                                        </div>
                                        <button onClick={() => setShowTableModal(false)} className="bg-slate-50 p-2 rounded-2xl text-slate-400 hover:text-slate-600 transition-colors">
                                            <X className="w-6 h-6" />
                                        </button>
                                    </div>

                                    <div className="space-y-6 overflow-y-auto pr-2 custom-scrollbar flex-1">
                                        {activeOrder ? (
                                            <div className="space-y-4">
                                                {/* Waiter Info */}
                                                <div className="flex items-center gap-3 p-4 bg-indigo-50 border border-indigo-100 rounded-3xl">
                                                    <div className="w-10 h-10 rounded-2xl bg-primary flex items-center justify-center text-slate-900 shadow-lg shadow-primary/20">
                                                        <User className="w-5 h-5" />
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Mesero Responsable</p>
                                                        <p className="font-black text-slate-900">{activeOrder.waiterName || 'Sin asignar'}</p>
                                                    </div>
                                                </div>

                                                {/* Consumption details */}
                                                <div className="space-y-3">
                                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block px-1">Consumo Actual</label>
                                                    <div className="bg-slate-50 rounded-[32px] p-6 border border-slate-100">
                                                        <div className="space-y-3 max-h-[300px] overflow-y-auto mb-4 pr-2">
                                                            {activeOrder.items?.map((item: any, idx: number) => (
                                                                <div key={idx} className="flex justify-between items-center text-sm">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="font-black text-slate-900">x{item.quantity}</span>
                                                                        <span className="font-bold text-slate-700">{item.name}</span>
                                                                    </div>
                                                                    <span className="font-black text-slate-900">${(item.price * item.quantity).toFixed(2)}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                        <div className="pt-4 border-t border-slate-200 flex justify-between items-center">
                                                            <span className="text-sm font-black text-slate-500 uppercase">Total Acumulado</span>
                                                            <span className="text-2xl font-black text-slate-900">${(activeOrder.total || 0).toFixed(2)}</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-2 gap-3 pt-2">
                                                    <button
                                                        onClick={() => {
                                                            setPosEditingOrderId(activeOrder.id);
                                                            setPosCart(activeOrder.items || []);
                                                            setPosClientName(activeOrder.userName || '');
                                                            setPosOrderType('local');
                                                            setSelectedTable(selectedTable);
                                                            setSelectedWaiter(waiters.find(w => w.id === activeOrder.waiterId) || null);
                                                            setShowPOS(true);
                                                            setShowTableModal(false);
                                                        }}
                                                        className="flex items-center justify-center gap-2 p-4 bg-primary text-slate-900 rounded-2xl font-black shadow-lg shadow-primary/20 hover:scale-[1.02] transition-all text-sm"
                                                    >
                                                        <ShoppingCart className="w-4 h-4" /> Editar POS
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            setSelectedOrderForClose(activeOrder);
                                                            setCloseSaleModalOpen(true);
                                                            setShowTableModal(false);
                                                        }}
                                                        className="flex items-center justify-center gap-2 p-4 bg-emerald-500 text-white rounded-2xl font-black shadow-lg shadow-emerald-500/20 hover:scale-[1.02] transition-all text-sm"
                                                    >
                                                        <DollarSign className="w-4 h-4" /> Cobrar Mesa
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            /* No active order - Show Waiter Selection for New Order */
                                            <div className="space-y-6">
                                                {/* Waiter Selection */}
                                                <div className="space-y-3">
                                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1 px-1">Asignar Mesero</label>
                                                    <div className="grid grid-cols-1 gap-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                                                        <button
                                                            onClick={() => handleAssignWaiter(selectedTable.id, null)}
                                                            className={`flex items-center justify-between p-4 rounded-2xl font-bold transition-all border-2 ${
                                                                !selectedTable.waiterId ? 'border-primary bg-primary/5 text-slate-900' : 'border-slate-100 text-slate-500 hover:border-slate-200'
                                                            }`}
                                                        >
                                                            <div className="flex items-center gap-3">
                                                                 <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
                                                                    <X className="w-4 h-4" />
                                                                </div>
                                                                <span>Sin Mesero (Libre)</span>
                                                            </div>
                                                        </button>
                                                        
                                                        {waiters.map((waiter) => (
                                                            <button
                                                                key={waiter.id}
                                                                onClick={() => handleAssignWaiter(selectedTable.id, waiter)}
                                                                className={`flex items-center justify-between p-4 rounded-2xl font-bold transition-all border-2 ${
                                                                    selectedTable.waiterId === waiter.id ? 'border-primary bg-primary/5 text-slate-900' : 'border-slate-100 text-slate-500 hover:border-slate-200'
                                                                }`}
                                                            >
                                                                <div className="flex items-center gap-3">
                                                                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-primary">
                                                                        <User className="w-4 h-4" />
                                                                    </div>
                                                                    <span>{waiter.name}</span>
                                                                </div>
                                                                {selectedTable.waiterId === waiter.id && <CheckCircle className="w-5 h-5" />}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>

                                                {/* Direct Action for Admin */}
                                                <div className="pt-4 border-t border-slate-100">
                                                    <button
                                                        onClick={() => {
                                                            // Set current table as selected for POS
                                                            setSelectedTable(selectedTable);
                                                            setPosEditingOrderId(null);
                                                            setPosCart([]);
                                                            setPosClientName('');
                                                            
                                                            // Open POS for this table
                                                            setPosOrderType('local');
                                                            setShowPOS(true);
                                                            setShowTableModal(false);
                                                        }}
                                                        className="w-full bg-primary text-slate-900 py-4 rounded-2xl font-black shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                                                    >
                                                        <ShoppingCart className="w-5 h-5" /> Abrir Nuevo Pedido en esta Mesa
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            const adminWaiter = { id: user.uid, name: 'Administrador' };
                                                            handleAssignWaiter(selectedTable.id, adminWaiter);
                                                            
                                                            // Also open POS immediately
                                                            setSelectedTable(selectedTable);
                                                            setSelectedWaiter(adminWaiter);
                                                            setPosEditingOrderId(null);
                                                            setPosCart([]);
                                                            setPosClientName('');
                                                            setPosOrderType('local');
                                                            setShowPOS(true);
                                                        }}
                                                        className="w-full mt-3 bg-slate-100 text-slate-600 py-4 rounded-2xl font-black hover:bg-slate-200 transition-all flex items-center justify-center gap-2"
                                                    >
                                                         Tomar Pedido Yo Mismo
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </>
                            );
                        })()}
                    </div>
                </div>
            )}

            {/* Acceptance Modal */}
            {acceptModalOpen && selectedOrderForAccept && (
                <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-slate-900/40 backdrop-blur-sm sm:px-4">
                    <div className="bg-white rounded-t-[40px] sm:rounded-3xl p-6 w-full max-w-lg shadow-2xl animate-in slide-in-from-bottom sm:zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                        <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-6 sm:hidden shrink-0"></div>
                        <div className="flex justify-between items-center mb-6 shrink-0">
                            <h3 className="text-xl font-black text-slate-900">
                                {selectedOrderForAccept.status === 'pendiente_pago' ? 'Verificar y Procesar' : 'Aceptar Pedido'}
                            </h3>
                            <button onClick={() => setAcceptModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto pr-2 space-y-6 scrollbar-hide">
                            {/* Resumen de Orden */}
                            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                <div className="flex justify-between items-center mb-3">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Resumen del Pedido</p>
                                    <button 
                                        onClick={() => { 
                                            setSelectedOrderForEdit(selectedOrderForAccept); 
                                            setEditOrderItems([...selectedOrderForAccept.items]); 
                                            setEditOrderNote((selectedOrderForAccept as any).orderNote || ''); 
                                            setEditModalOpen(true); 
                                        }}
                                        className="text-[10px] font-black text-primary hover:text-primary-dark transition-colors flex items-center gap-1"
                                    >
                                        <Edit className="w-3 h-3" /> Editar
                                    </button>
                                </div>
                                <div className="space-y-2">
                                    {selectedOrderForAccept.items.map((item, idx) => (
                                        <div key={idx} className="flex justify-between text-sm">
                                            <span className="font-bold text-slate-700">{item.quantity}x {item.name}</span>
                                            <span className="font-black text-slate-900">${(item.price * item.quantity).toFixed(2)}</span>
                                        </div>
                                    ))}
                                </div>
                                <div className="mt-4 pt-4 border-t border-slate-200 flex justify-between items-center">
                                    <span className="font-black text-slate-500 uppercase text-xs">Total a Liquidar</span>
                                    <span className="text-xl font-black text-slate-900">${selectedOrderForAccept.total.toFixed(2)}</span>
                                </div>
                            </div>

                            {/* Selección de Pago */}
                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block px-1">Confirmar Método de Pago</label>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                    {['Efectivo', 'Pago Móvil', 'Zelle', 'Punto de Venta', 'Transferencia', 'Crédito (2x3)', 'Cashea', 'Fidelidad'].map(method => (
                                        <button
                                            key={method}
                                            onClick={() => setPaymentMethod(method)}
                                            className={`p-3 rounded-xl text-[10px] font-black border-2 transition-all ${paymentMethod === method ? 'border-primary bg-primary/5 text-slate-900' : 'border-slate-100 text-slate-500 hover:border-slate-200'}`}
                                        >
                                            {method}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {(selectedOrderForAccept.source === 'client' || ['Pago Móvil', 'Transferencia', 'Zelle', 'Punto de Venta', 'Cashea'].includes(paymentMethod)) && (
                                <div className="space-y-4 animate-in slide-in-from-top-2 duration-300">
                                    <OrderChatWindow 
                                        orderId={selectedOrderForAccept.id} 
                                        currentUserRole="restaurant" 
                                        currentUserId={user?.uid || 'admin'}
                                        currentUserName={user?.email === 'admin@un2x3.com' ? 'Administración 2x3' : 'Caja Central'} 
                                        restaurantId={rid!}
                                        orderInfo={selectedOrderForAccept}
                                    />
                                </div>
                            )}

                            {paymentMethod === 'Crédito (2x3)' && (
                                <div className="p-4 bg-orange-50 border border-orange-100 rounded-2xl animate-in slide-in-from-top-2">
                                    <h4 className="text-[10px] font-black text-orange-600 uppercase mb-1">Plan de Financiamiento 2x3</h4>
                                    <p className="text-xs text-orange-800 font-medium">Se generarán las cuotas automáticamente según la configuración del negocio. La orden quedará marcada como "No Pagada" hasta completar el plan.</p>
                                </div>
                            )}
                        </div>

                        <div className="shrink-0 pt-6 mt-6 border-t border-slate-100">
                            <button
                                onClick={handleConfirmAccept}
                                disabled={isAccepting}
                                className="w-full bg-primary text-slate-900 py-4 rounded-2xl font-black shadow-xl shadow-primary/30 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {isAccepting ? <Loader2 className="w-5 h-5 animate-spin" /> : <><CheckCircle className="w-5 h-5" /> Confirmar y Procesar</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Dispatch Order Modal */}
            {dispatchModalOpen && selectedOrderForDispatch && (
                <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-sm sm:px-4">
                    <div className="bg-white rounded-t-[40px] sm:rounded-3xl p-6 w-full max-w-lg shadow-2xl animate-in slide-in-from-bottom sm:zoom-in-95 duration-200 flex flex-col max-h-[92vh]">
                        <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-4 sm:hidden shrink-0"></div>
                        
                        <div className="flex justify-between items-center mb-4 shrink-0">
                            <div>
                                <h3 className="text-xl font-black text-slate-900 flex items-center gap-2">
                                    <Truck className="w-6 h-6 text-primary" /> Centro de Despacho
                                </h3>
                                <p className="text-xs text-slate-500 font-bold">Orden #{selectedOrderForDispatch.id.slice(0, 8)} • Destino: {selectedOrderForDispatch.deliveryAddress || 'Dirección registrada'}</p>
                            </div>
                            <button onClick={() => { setDispatchModalOpen(false); setSelectedVehicleCategory(null); }} className="text-slate-400 hover:text-slate-600 p-2">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        {/* Contenedor con Scroll Completo para Móviles y Escritorio */}
                        <div className="flex-1 overflow-y-auto overscroll-contain pr-1 space-y-4 min-h-0">
                            {/* ⚠️ AVISO: Gifting Delivery — El Negocio Paga al Driver */}
                            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3 shrink-0">
                                <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 mt-0.5">
                                    <DollarSign className="w-4 h-4" />
                                </div>
                                <div>
                                    <p className="text-xs font-black text-amber-900">Opción: Obsequiar el Delivery al Cliente</p>
                                    <p className="text-[11px] font-bold text-amber-700 mt-0.5 leading-relaxed">
                                        Al asignar un repartidor de la plataforma, <strong>el negocio asume el pago del transporte</strong>. El monto calculado será tu deuda con el driver y debe ser cancelado directamente a él. El cliente no paga el flete.
                                    </p>
                                </div>
                            </div>

                            {/* Free delivery badge if shop covers delivery */}
                            {((selectedOrderForDispatch as any).freeDelivery || restaurantConfig?.free_delivery) && (
                                <div className="p-3 bg-gradient-to-r from-amber-500/10 to-yellow-500/20 border border-amber-300 rounded-2xl flex items-center gap-3 shrink-0">
                                    <Sparkles className="w-5 h-5 text-amber-600 shrink-0" />
                                    <div className="text-xs text-amber-900">
                                        <span className="font-black">¡Envío Gratis Activado!</span> La tienda asume el flete del conductor. El cliente no verá tarifas de envío.
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-3 shrink-0">
                                <button
                                    onClick={() => setDispatchType('own')}
                                    className={`flex flex-col items-center gap-2 p-3.5 rounded-2xl border-2 font-bold transition-all ${dispatchType === 'own' ? 'border-primary bg-primary/10 text-slate-900 shadow-sm' : 'border-slate-100 text-slate-500 hover:bg-slate-50'}`}
                                >
                                    <Store className="w-5 h-5" />
                                    <span className="text-xs text-center font-black">Propio / Retiro en Tienda</span>
                                </button>
                                <button
                                    onClick={() => { setDispatchType('platform'); setSelectedVehicleCategory(null); setSelectedDriver(''); }}
                                    className={`flex flex-col items-center gap-2 p-3.5 rounded-2xl border-2 font-bold transition-all ${dispatchType === 'platform' ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm' : 'border-slate-100 text-slate-500 hover:bg-slate-50'}`}
                                >
                                    <Users className="w-5 h-5" />
                                    <span className="text-xs text-center font-black">Driver de la Plataforma</span>
                                </button>
                            </div>

                            {dispatchType === 'own' && (
                                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2 animate-in fade-in duration-200">
                                    <div className="flex items-center gap-2 text-slate-800 font-black text-sm">
                                        <Store className="w-5 h-5 text-primary" />
                                        <span>Retiro en Tienda / Reparto Propio</span>
                                    </div>
                                    <p className="text-xs text-slate-600 font-bold leading-relaxed">
                                        El pedido se marcará como listo para retiro. Se notificará inmediatamente al cliente por el chat integrado. No se solicitarán conductores de la plataforma para esta orden.
                                    </p>
                                </div>
                            )}

                            {dispatchType === 'platform' && (() => {
                                const clientChosenDriverId = selectedOrderForDispatch.preferred_driver_id || selectedOrderForDispatch.driver_id || (selectedOrderForDispatch as any).delivery_driver_id;
                                const clientChosenDriverName = selectedOrderForDispatch.driver_name 
                                    || (selectedOrderForDispatch as any).driverName 
                                    || selectedOrderForDispatch.preferred_driver_name
                                    || (drivers.find(d => d.id === clientChosenDriverId)?.full_name);
                                const clientChosenDriverObj = drivers.find(d => d.id === clientChosenDriverId);
                                const hasClientChosenDriver = Boolean(clientChosenDriverId || clientChosenDriverName);

                                if (hasClientChosenDriver) {
                                    return (
                                        <div className="space-y-4 animate-in fade-in duration-200">
                                            <div className="p-5 bg-gradient-to-br from-emerald-50 via-teal-50 to-emerald-100/50 border-2 border-emerald-500/40 rounded-3xl text-center space-y-3 shadow-sm">
                                                <div className="relative w-16 h-16 mx-auto">
                                                    {clientChosenDriverObj?.photo_url ? (
                                                        <img 
                                                            src={clientChosenDriverObj.photo_url} 
                                                            alt={clientChosenDriverName || 'Repartidor'} 
                                                            className="w-16 h-16 rounded-2xl object-cover border-2 border-emerald-500 shadow-md"
                                                        />
                                                    ) : (
                                                        <div className="w-16 h-16 rounded-2xl bg-emerald-500 text-white flex items-center justify-center text-3xl shadow-md">
                                                            🛵
                                                        </div>
                                                    )}
                                                    <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-black border-2 border-white shadow-xs">
                                                        ✓
                                                    </span>
                                                </div>

                                                <div>
                                                    <span className="inline-block px-3 py-1 bg-emerald-200/80 text-emerald-900 text-[10px] font-black uppercase tracking-wider rounded-full mb-1.5">
                                                        Repartidor Seleccionado por el Cliente
                                                    </span>
                                                    <h4 className="text-lg font-black text-slate-900">
                                                        {clientChosenDriverName || clientChosenDriverObj?.full_name || 'Conductor Seleccionado'}
                                                    </h4>
                                                    <p className="text-xs text-slate-600 font-bold mt-0.5">
                                                        {clientChosenDriverObj?.vehicle_type === 'confort' ? '✨ Carro Confort' : (clientChosenDriverObj?.vehicle_type === 'carro' ? '🚗 Carro Económico' : '🛵 Moto Taxi')}
                                                        {clientChosenDriverObj?.vehicle_brand ? ` • ${clientChosenDriverObj.vehicle_brand} ${clientChosenDriverObj.vehicle_model || ''}` : ''}
                                                        {clientChosenDriverObj?.vehicle_plate ? ` [${clientChosenDriverObj.vehicle_plate}]` : ''}
                                                    </p>
                                                </div>

                                                <div className="bg-white/90 p-3.5 rounded-2xl border border-emerald-200 flex items-center justify-between shadow-xs">
                                                    <span className="text-xs font-bold text-slate-600">Tarifa a cancelar al conductor:</span>
                                                    <span className="text-base font-black text-emerald-700 font-mono">
                                                        ${getDriverPayout(selectedOrderForDispatch, clientChosenDriverObj?.vehicle_type || 'moto').toFixed(2)} USD
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="p-3 bg-blue-50 border border-blue-200 rounded-2xl flex items-start gap-2.5">
                                                <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                                                <p className="text-[11px] font-bold text-blue-800 leading-snug">
                                                    El cliente escogió a este repartidor para su orden. Al presionar <strong>OK • Despachar Pedido</strong>, se notificará al conductor y el pedido quedará en estado de entrega en camino en espera de la calificación del cliente.
                                                </p>
                                            </div>

                                            <button
                                                onClick={handleConfirmDispatch}
                                                disabled={isAccepting}
                                                className="w-full bg-emerald-500 hover:bg-emerald-600 text-slate-950 py-4 rounded-2xl font-black shadow-lg shadow-emerald-500/25 hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2 text-base"
                                            >
                                                {isAccepting ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                                                    <>
                                                        <CheckCircle className="w-5 h-5" />
                                                        <span>OK • Despachar Pedido a {clientChosenDriverName || 'Repartidor'}</span>
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    );
                                }

                                return (
                                    <div className="space-y-3">
                                        {/* STEP 1: Select Vehicle Type First */}
                                        {!selectedVehicleCategory ? (
                                        <div className="space-y-3">
                                            <div className="text-center">
                                                <p className="text-xs font-black text-slate-700 uppercase tracking-widest">Paso 1: Selecciona el tipo de vehículo</p>
                                                <p className="text-[10px] text-slate-400 font-bold mt-1">Solo se mostrarán los drivers de tu ciudad disponibles con ese tipo de vehículo.</p>
                                            </div>
                                            {[
                                                { id: 'moto' as const, label: '🛵 Moto Taxi', desc: 'Rápido y económico para distancias cortas', color: 'border-amber-400 bg-amber-50 text-amber-900' },
                                                { id: 'carro' as const, label: '🚗 Carro Económico', desc: 'Ideal para mayor capacidad de carga', color: 'border-blue-400 bg-blue-50 text-blue-900' },
                                                { id: 'confort' as const, label: '✨ Carro Confort', desc: 'Servicio premium y mayor espacio', color: 'border-purple-400 bg-purple-50 text-purple-900' },
                                            ].map(vt => (
                                                <button
                                                    key={vt.id}
                                                    onClick={() => {
                                                        setSelectedVehicleCategory(vt.id);
                                                        setDriverCategoryFilter(vt.id);
                                                        setSelectedDriver('');
                                                    }}
                                                    className={`w-full p-4 rounded-2xl border-2 text-left flex items-center gap-3 transition-all hover:scale-[1.01] active:scale-[0.99] ${vt.color}`}
                                                >
                                                    <div className="text-2xl">{vt.label.split(' ')[0]}</div>
                                                    <div className="flex-1">
                                                        <p className="font-black text-sm">{vt.label.split(' ').slice(1).join(' ')}</p>
                                                        <p className="text-[11px] font-bold opacity-70 mt-0.5">{vt.desc}</p>
                                                    </div>
                                                    <ChevronRight className="w-5 h-5 opacity-50 shrink-0" />
                                                </button>
                                            ))}
                                        </div>
                                    ) : (
                                        /* STEP 2: Show filtered drivers */
                                        <div className="space-y-3">
                                            {/* Back + vehicle header */}
                                            <div className="flex items-center gap-2 shrink-0">
                                                <button
                                                    onClick={() => { setSelectedVehicleCategory(null); setSelectedDriver(''); }}
                                                    className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-slate-200 transition-all"
                                                >
                                                    <ArrowLeft className="w-4 h-4" />
                                                </button>
                                                <div className="flex-1">
                                                    <p className="text-xs font-black text-slate-900">
                                                        {selectedVehicleCategory === 'moto' ? '🛵 Moto Taxi' : selectedVehicleCategory === 'carro' ? '🚗 Carro Económico' : '✨ Carro Confort'} — Drivers disponibles en tu ciudad
                                                    </p>
                                                    <p className="text-[10px] text-slate-400 font-bold">
                                                        {restaurantConfig?.city || restaurantConfig?.address ? `📍 ${restaurantConfig.city || restaurantConfig.address?.split(',')[0]}` : '📍 Tu zona de operación'}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Driver Search Bar */}
                                            <div className="relative shrink-0">
                                                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                                                <input 
                                                    type="text"
                                                    placeholder="Buscar conductor por nombre..."
                                                    value={driverSearch}
                                                    onChange={(e) => setDriverSearch(e.target.value)}
                                                    className="w-full bg-slate-50 border border-slate-200 pl-10 pr-4 py-2.5 rounded-xl text-xs font-bold text-slate-800 placeholder-slate-400 outline-none focus:border-blue-500 focus:bg-white transition-all"
                                                />
                                                {driverSearch && (
                                                    <button onClick={() => setDriverSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                                                        <X className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                            </div>

                                            {/* Radar General Option */}
                                            <div 
                                                onClick={() => setSelectedDriver('')}
                                                className={`p-3.5 rounded-2xl border-2 cursor-pointer transition-all flex items-center justify-between ${
                                                    selectedDriver === '' 
                                                        ? 'border-blue-500 bg-blue-50/80 shadow-sm' 
                                                        : 'border-slate-100 bg-slate-50/60 hover:bg-slate-100'
                                                }`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-2xl bg-blue-500 text-white flex items-center justify-center relative shadow-md shadow-blue-500/20">
                                                        <div className="absolute inset-0 rounded-2xl bg-blue-400 animate-ping opacity-25"></div>
                                                        <Truck className="w-5 h-5 relative z-10" />
                                                    </div>
                                                    <div>
                                                        <h4 className="font-black text-xs text-slate-900 flex items-center gap-1.5">
                                                            Radar Abierto General
                                                            <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-md text-[9px] font-black uppercase">Automático</span>
                                                        </h4>
                                                        <p className="text-[10px] text-slate-500 font-medium">Notifica a todos los {selectedVehicleCategory === 'moto' ? 'motorizados' : 'conductores'} disponibles en tu zona</p>
                                                    </div>
                                                </div>
                                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selectedDriver === '' ? 'border-blue-500 bg-blue-500 text-white' : 'border-slate-300'}`}>
                                                    {selectedDriver === '' && <div className="w-2 h-2 rounded-full bg-white"></div>}
                                                </div>
                                            </div>

                                            {/* Filtered Drivers List by vehicle type & city */}
                                            {(() => {
                                                const restaurantCity = (restaurantConfig?.location?.city || restaurantConfig?.city || '').trim().toLowerCase();
                                                const filteredDriversList = drivers.filter(d => {
                                                    const matchesSearch = !driverSearch || (d.full_name || '').toLowerCase().includes(driverSearch.toLowerCase());
                                                    const matchesCat = 
                                                        (selectedVehicleCategory === 'moto' && (d.vehicle_type === 'moto' || !d.vehicle_type)) ||
                                                        (selectedVehicleCategory === 'carro' && (d.vehicle_type === 'carro' || d.vehicle_type === 'taxi' || d.vehicle_type === 'auto')) ||
                                                        (selectedVehicleCategory === 'confort' && (d.vehicle_type === 'confort' || d.is_comfort_eligible));
                                                    const drvCity = (d.city || '').trim().toLowerCase();
                                                    const matchesCity = !restaurantCity || !drvCity || drvCity.includes(restaurantCity) || restaurantCity.includes(drvCity);
                                                    return matchesSearch && matchesCat && matchesCity;
                                                });

                                                return (
                                                    <div className="space-y-2">
                                                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                                                            Conductores Disponibles ({filteredDriversList.length}) {restaurantCity ? `· ${restaurantConfig?.location?.city || restaurantConfig?.city}` : ''}
                                                        </div>

                                                        {filteredDriversList.map(drv => {
                                                            const payout = getDriverPayout(selectedOrderForDispatch, drv.vehicle_type);
                                                            const isSelected = selectedDriver === drv.id;
                                                            const vType = drv.vehicle_type === 'confort' ? 'Confort' : (drv.vehicle_type === 'carro' ? 'Auto Económico' : 'Moto Taxi');
                                                            
                                                            return (
                                                                <div 
                                                                    key={drv.id}
                                                                    onClick={() => setSelectedDriver(drv.id)}
                                                                    className={`p-3 rounded-2xl border-2 cursor-pointer transition-all flex items-center justify-between ${
                                                                        isSelected 
                                                                            ? 'border-primary bg-primary/10 shadow-sm ring-1 ring-primary' 
                                                                            : 'border-slate-100 bg-white hover:border-slate-200'
                                                                    }`}
                                                                >
                                                                    <div className="flex items-center gap-3">
                                                                        {/* Driver Photo */}
                                                                        <div className="relative">
                                                                            {drv.photo_url ? (
                                                                                <img 
                                                                                    src={drv.photo_url} 
                                                                                    alt={drv.full_name} 
                                                                                    className="w-11 h-11 rounded-2xl object-cover border border-slate-200 shadow-sm"
                                                                                />
                                                                            ) : (
                                                                                <div className="w-11 h-11 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-500 font-black text-sm">
                                                                                    {drv.full_name ? drv.full_name.charAt(0).toUpperCase() : 'D'}
                                                                                </div>
                                                                            )}
                                                                            <div className="absolute -bottom-1 -right-1 bg-emerald-500 w-3 h-3 rounded-full border-2 border-white"></div>
                                                                        </div>

                                                                        <div>
                                                                            <div className="flex items-center gap-1.5">
                                                                                <h5 className="font-black text-xs text-slate-900">{drv.full_name || 'Conductor'}</h5>
                                                                                <span className="flex items-center text-[10px] font-black text-amber-500">
                                                                                    ⭐ {drv.rating ? Number(drv.rating).toFixed(1) : '5.0'}
                                                                                </span>
                                                                            </div>
                                                                            <p className="text-[10px] text-slate-500 font-bold">
                                                                                {vType} • {drv.vehicle_brand || ''} {drv.vehicle_model || ''} {drv.vehicle_plate ? `[${drv.vehicle_plate}]` : ''} {drv.city ? `• ${drv.city}` : ''}
                                                                            </p>
                                                                            <p className="text-[10px] font-black text-emerald-600 mt-0.5">
                                                                                💰 Debes pagarle: ${payout.toFixed(2)} USD
                                                                            </p>
                                                                        </div>
                                                                    </div>

                                                                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${isSelected ? 'border-primary bg-primary text-slate-900' : 'border-slate-300'}`}>
                                                                        {isSelected && <div className="w-2 h-2 rounded-full bg-slate-900"></div>}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}

                                                        {/* Empty state */}
                                                        {filteredDriversList.length === 0 && (
                                                            <div className="text-center py-6 text-slate-400">
                                                                <Truck className="w-8 h-8 mx-auto mb-2 opacity-30" />
                                                                <p className="text-xs font-bold">No hay conductores de este tipo disponibles en tu ciudad.</p>
                                                                <p className="text-[10px] font-bold mt-1">Puedes usar el Radar General para notificar a toda la red.</p>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    )}
                                </div>
                            );
                        })()}
                    </div>

                        {(() => {
                            const clientChosenDriverId = selectedOrderForDispatch.preferred_driver_id || selectedOrderForDispatch.driver_id || (selectedOrderForDispatch as any).delivery_driver_id;
                            const clientChosenDriverName = selectedOrderForDispatch.driver_name 
                                || (selectedOrderForDispatch as any).driverName 
                                || selectedOrderForDispatch.preferred_driver_name
                                || (drivers.find(d => d.id === clientChosenDriverId)?.full_name);
                            const hasClientChosenDriver = Boolean(clientChosenDriverId || clientChosenDriverName);

                            if (hasClientChosenDriver && dispatchType === 'platform') return null;

                            return (
                                <div className="pt-4 mt-2 border-t border-slate-100 shrink-0">
                                    {dispatchType === 'platform' && selectedVehicleCategory && (
                                        <div className="mb-3 p-3 bg-orange-50 border border-orange-200 rounded-2xl flex items-center gap-2">
                                            <DollarSign className="w-4 h-4 text-orange-600 shrink-0" />
                                            <p className="text-[11px] font-black text-orange-800">
                                                Recuerda: <span className="font-black">tú pagas al driver</span> una vez entregue el pedido. Monto estimado según la tarifa calculada.
                                            </p>
                                        </div>
                                    )}
                                    <button
                                        onClick={handleConfirmDispatch}
                                        disabled={isAccepting || (dispatchType === 'platform' && !selectedVehicleCategory)}
                                        className={`w-full py-4 rounded-2xl font-black shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 ${
                                            dispatchType === 'own' 
                                                ? 'bg-slate-900 text-white shadow-slate-900/20'
                                                : selectedDriver 
                                                    ? 'bg-primary text-slate-900 shadow-primary/20' 
                                                    : 'bg-blue-600 text-white shadow-blue-500/20'
                                        }`}
                                    >
                                        {isAccepting ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                                            <>
                                                <Truck className="w-5 h-5" /> 
                                                {dispatchType === 'own' ? 'Confirmar Retiro / Entrega Propia' : selectedDriver ? 'Asignar Conductor y Despachar' : selectedVehicleCategory ? 'Abrir Radar y Despachar Pedido' : 'Selecciona el tipo de vehículo'}
                                            </>
                                        )}
                                    </button>
                                </div>
                            );
                        })()}
                    </div>
                </div>
            )}

            {/* Payment Verification Modal */}
            <AnimatePresence>
                {verifyModalOpen && selectedOrderForVerify && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-md sm:px-4"
                    >
                        <motion.div 
                            initial={{ y: "100%" }}
                            animate={{ y: 0 }}
                            exit={{ y: "100%" }}
                            transition={{ type: "spring", bounce: 0, duration: 0.4 }}
                            className="bg-white rounded-t-[40px] sm:rounded-[40px] p-6 sm:p-8 w-full max-w-lg shadow-2xl relative overflow-hidden flex flex-col max-h-[92vh]"
                        >
                            <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-4 sm:hidden shrink-0"></div>
                            {verificationSuccess ? (
                                <div className="py-12 flex flex-col items-center justify-center text-center animate-in zoom-in-50 duration-500">
                                    <div className="w-24 h-24 bg-emerald-500 text-white rounded-full flex items-center justify-center mb-6 shadow-xl shadow-emerald-500/20">
                                        <CheckCircle className="w-16 h-16" />
                                    </div>
                                    <h3 className="text-3xl font-black text-slate-900 mb-2">PAGO ACREDITADO</h3>
                                    <p className="text-slate-500 font-bold text-base">Comanda iniciada con {prepMinutes} min de preparación</p>
                                    <div className="mt-6 px-6 py-3 bg-emerald-50 text-emerald-600 rounded-2xl font-black text-sm border border-emerald-100 italic">
                                        Cuenta regresiva activada en vivo para el cliente ✨
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="flex justify-between items-start mb-6 shrink-0">
                                        <div>
                                            <h3 className="text-2xl font-black text-slate-900 tracking-tight">
                                                {selectedOrderForVerify.status === 'verificando_pago_delivery' ? 'Validar Pago Delivery' : 'Validar Pago y Preparar'}
                                            </h3>
                                            <p className="text-slate-500 font-bold text-xs uppercase tracking-widest mt-1">Revisión de Comprobante & Cocina</p>
                                        </div>
                                        <button 
                                            onClick={() => setVerifyModalOpen(false)}
                                            className="bg-slate-50 p-2 rounded-2xl text-slate-400 hover:text-slate-600 transition-colors"
                                        >
                                            <X className="w-6 h-6" />
                                        </button>
                                    </div>

                                    <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                                        {/* Reference Info */}
                                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                            <div className="flex items-center justify-between mb-3">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm text-slate-400">
                                                        <CreditCard className="w-5 h-5" />
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Referencia</p>
                                                        <p className="text-base font-black text-slate-900">
                                                            #{selectedOrderForVerify.status === 'verificando_pago_delivery' ? selectedOrderForVerify.deliveryPaymentReference : selectedOrderForVerify.paymentReference || 'N/A'}
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="text-right">
                                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Monto</p>
                                                    <p className="text-lg font-black text-emerald-600">
                                                        ${selectedOrderForVerify.status === 'verificando_pago_delivery' ? selectedOrderForVerify.deliveryFee?.toFixed(2) : selectedOrderForVerify.total?.toFixed(2)}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Proof Image */}
                                        <div className="relative">
                                            <div className="flex justify-between items-center mb-1.5 px-1">
                                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Comprobante de Pago</p>
                                                {(selectedOrderForVerify.status === 'verificando_pago_delivery' ? selectedOrderForVerify.deliveryPaymentProofUrl : selectedOrderForVerify.paymentProofUrl) && (
                                                    <div className="flex gap-2">
                                                        <button 
                                                            type="button"
                                                            onClick={() => setPreviewImageModal(selectedOrderForVerify.status === 'verificando_pago_delivery' ? selectedOrderForVerify.deliveryPaymentProofUrl! : selectedOrderForVerify.paymentProofUrl!)}
                                                            className="text-xs font-black text-blue-600 hover:text-blue-800 flex items-center gap-1"
                                                        >
                                                            <Eye className="w-3.5 h-3.5" /> Ampliar
                                                        </button>
                                                        <a 
                                                            href={selectedOrderForVerify.status === 'verificando_pago_delivery' ? selectedOrderForVerify.deliveryPaymentProofUrl : selectedOrderForVerify.paymentProofUrl}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            download={`pago_${selectedOrderForVerify.id}.jpg`}
                                                            className="text-xs font-black text-slate-600 hover:text-slate-900 flex items-center gap-1"
                                                        >
                                                            <Download className="w-3.5 h-3.5" /> Descargar
                                                        </a>
                                                    </div>
                                                )}
                                            </div>

                                            <div 
                                                className="w-full h-44 rounded-2xl bg-slate-100 border-2 border-slate-200 overflow-hidden cursor-zoom-in relative group"
                                                onClick={() => {
                                                    const img = selectedOrderForVerify.status === 'verificando_pago_delivery' ? selectedOrderForVerify.deliveryPaymentProofUrl : selectedOrderForVerify.paymentProofUrl;
                                                    if (img) setPreviewImageModal(img);
                                                }}
                                            >
                                                {(selectedOrderForVerify.status === 'verificando_pago_delivery' ? selectedOrderForVerify.deliveryPaymentProofUrl : selectedOrderForVerify.paymentProofUrl) ? (
                                                    <>
                                                        <img 
                                                            src={selectedOrderForVerify.status === 'verificando_pago_delivery' ? selectedOrderForVerify.deliveryPaymentProofUrl : selectedOrderForVerify.paymentProofUrl} 
                                                            alt="Comprobante de pago" 
                                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                                        />
                                                        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold gap-1">
                                                            <Eye className="w-4 h-4" /> Toca para ampliar
                                                        </div>
                                                    </>
                                                ) : (
                                                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-400">
                                                        <ImageIcon className="w-10 h-10 mb-1 opacity-50" />
                                                        <p className="font-bold text-xs">Sin captura adjunta</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Kitchen Preparation Time Selector */}
                                        <div className="p-4 bg-amber-500/10 border border-amber-300/60 rounded-2xl">
                                            <div className="flex items-center gap-2 mb-2">
                                                <Clock className="w-4 h-4 text-amber-600" />
                                                <label className="text-xs font-black text-amber-950 uppercase tracking-wide">
                                                    Tiempo de Preparación en Cocina:
                                                </label>
                                            </div>
                                            <p className="text-[11px] text-amber-800 font-medium mb-3">
                                                Al aprobar, se activará automáticamente un contador regresivo en vivo en la pantalla del cliente.
                                            </p>

                                            <div className="grid grid-cols-4 gap-2">
                                                {[
                                                    { mins: 0, label: 'Listo ya' },
                                                    { mins: 15, label: '15 min' },
                                                    { mins: 20, label: '20 min' },
                                                    { mins: 30, label: '30 min' }
                                                ].map((item) => (
                                                    <button
                                                        key={item.mins}
                                                        type="button"
                                                        onClick={() => setPrepMinutes(item.mins)}
                                                        className={`py-2 px-1 rounded-xl font-black text-xs transition-all border text-center ${
                                                            prepMinutes === item.mins 
                                                                ? 'bg-amber-500 text-slate-900 border-amber-600 shadow-md font-black scale-105' 
                                                                : 'bg-white text-slate-700 border-amber-200 hover:bg-amber-50'
                                                        }`}
                                                    >
                                                        {item.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        <div className="grid grid-cols-2 gap-3 pt-2">
                                            <button
                                                onClick={() => {
                                                    if(window.confirm("¿Seguro que deseas rechazar este comprobante?")) {
                                                        const isDelivery = selectedOrderForVerify.status === 'verificando_pago_delivery';
                                                        updateStatus(selectedOrderForVerify.id, isDelivery ? 'awaiting_delivery_payment' : 'pendiente_pago');
                                                        setVerifyModalOpen(false);
                                                    }
                                                }}
                                                className="bg-slate-100 text-slate-500 py-3.5 rounded-2xl font-black hover:bg-red-50 hover:text-red-500 transition-all text-sm"
                                            >
                                                Rechazar
                                            </button>
                                            <button
                                                onClick={handleConfirmPayment}
                                                disabled={isVerifying}
                                                className="bg-primary text-slate-900 py-3.5 rounded-2xl font-black shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 text-sm"
                                            >
                                                {isVerifying ? <Loader2 className="w-5 h-5 animate-spin" /> : <><CheckCircle className="w-5 h-5" /> Aprobar e Iniciar Cocina</>}
                                            </button>
                                        </div>
                                    </div>
                                </>
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Edit Order Modal */}
            {editModalOpen && selectedOrderForEdit && (
                <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-slate-900/40 backdrop-blur-sm sm:px-4">
                    <div className="bg-white rounded-t-[40px] sm:rounded-3xl p-6 w-full max-w-lg shadow-2xl animate-in slide-in-from-bottom sm:zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                        <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-6 sm:hidden shrink-0"></div>
                        <div className="flex justify-between items-center mb-6 shrink-0">
                            <h3 className="text-xl font-black text-slate-900">Editar Pedido</h3>
                            <button onClick={() => setEditModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto pr-2 space-y-4">
                            {editOrderItems.map(item => (
                                <div key={item.id} className="flex flex-col bg-slate-50 p-3 rounded-2xl border border-slate-100 mb-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex-1">
                                            <p className="font-bold text-slate-800">{item.name}</p>
                                            <p className="text-xs text-slate-900 font-bold">${item.price.toFixed(2)}</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => updateEditItemQty(item.id, -1)} className="p-2 bg-white rounded-xl shadow-sm text-slate-500 hover:text-slate-700">
                                                <Minus className="w-4 h-4" />
                                            </button>
                                            <span className="w-6 text-center font-black">{item.quantity}</span>
                                            <button onClick={() => updateEditItemQty(item.id, 1)} className="p-2 bg-white rounded-xl shadow-sm text-slate-500 hover:text-slate-700">
                                                <Plus className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => removeEditItem(item.id)} className="p-2 bg-red-50 text-red-500 rounded-xl hover:bg-red-100 ml-2">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                    <input 
                                        type="text"
                                        placeholder="Comentario sobre el producto (opcional)"
                                        value={(item as any).notes || ''}
                                        onChange={(e) => updateEditItemNotes(item.id, e.target.value)}
                                        className="w-full bg-white border border-slate-200 mt-2 p-2 rounded-xl text-xs outline-none focus:border-primary text-slate-700"
                                    />
                                </div>
                            ))}

                            <div className="bg-slate-100 rounded-2xl p-4 mt-6 border border-slate-200 shadow-inner">
                                <h4 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3 block">Agregar Producto</h4>
                                <div className="space-y-3">
                                    <select 
                                        value={editAddProductId}
                                        onChange={(e) => { 
                                            setEditAddProductId(e.target.value); 
                                            setEditAddVariant(''); 
                                        }}
                                        className="w-full p-3 rounded-xl bg-white border border-slate-200 outline-none text-sm font-bold text-slate-700 focus:border-primary"
                                    >
                                        <option value="">Selecciona un producto...</option>
                                        {posProducts.map(p => (
                                            <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                    </select>
                                    
                                    {editAddProductId && posProducts.find(p => p.id === editAddProductId)?.hasVariants && (posProducts.find(p => p.id === editAddProductId)?.priceVariants?.length > 0) && (
                                        <select 
                                            value={editAddVariant}
                                            onChange={(e) => setEditAddVariant(e.target.value)}
                                            className="w-full p-3 rounded-xl bg-white border border-slate-200 outline-none text-sm font-bold text-slate-700 focus:border-primary"
                                        >
                                            <option value="">Variante / Tamaño...</option>
                                            {posProducts.find(p => p.id === editAddProductId)?.priceVariants?.map((v:any, idx:number) => (
                                                <option key={idx} value={v.name}>{v.name} - ${v.price.toFixed(2)}</option>
                                            ))}
                                        </select>
                                    )}

                                    {editAddProductId && (
                                        <div className="flex gap-2">
                                            <input 
                                                type="number"
                                                min="1"
                                                value={editAddQty}
                                                onChange={(e) => setEditAddQty(parseInt(e.target.value) || 1)}
                                                className="w-20 p-3 rounded-xl bg-white border border-slate-200 outline-none text-center font-bold focus:border-primary"
                                            />
                                            <input 
                                                type="text"
                                                placeholder="Comentario adicional (opcional)"
                                                value={editAddNote}
                                                onChange={(e) => setEditAddNote(e.target.value)}
                                                className="flex-1 p-3 rounded-xl bg-white border border-slate-200 outline-none text-sm font-medium focus:border-primary"
                                            />
                                            <button 
                                                onClick={handleAddEditItem}
                                                disabled={posProducts.find(p => p.id === editAddProductId)?.hasVariants && !editAddVariant}
                                                className="bg-primary text-slate-900 p-3 rounded-xl font-bold shadow-md hover:scale-105 transition-all disabled:opacity-50"
                                            >
                                                <Plus className="w-5 h-5 mx-auto" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>


                            <div className="mt-4">
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Notas del Pedido</label>
                                <textarea
                                    value={editOrderNote}
                                    onChange={(e) => setEditOrderNote(e.target.value)}
                                    placeholder="Ej: Sin mayonesa, papas extras..."
                                    className="w-full bg-slate-50 border border-slate-200 p-4 rounded-2xl outline-none focus:border-primary font-bold text-slate-700 min-h-[100px] resize-none"
                                />
                            </div>
                        </div>

                        <div className="shrink-0 pt-4 mt-4 border-t border-slate-100">
                            <div className="flex justify-between items-center mb-4 text-lg">
                                <span className="font-bold text-slate-500">Nuevo Total:</span>
                                <span className="font-black text-slate-900">
                                    ${(editOrderItems.reduce((acc, item) => acc + (item.price * item.quantity), 0) + ((selectedOrderForEdit as any).deliveryFee || 0)).toFixed(2)}
                                </span>
                            </div>
                            <button
                                onClick={handleUpdateOrderItems}
                                disabled={isAccepting}
                                className="w-full bg-primary text-slate-900 py-4 rounded-2xl font-black shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {isAccepting ? <Loader2 className="w-5 h-5 animate-spin" /> : <><CheckCircle className="w-5 h-5" /> Guardar Cambios</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* POS Modal */}
            {showPOS && (
                <div className="fixed inset-0 z-[100] flex bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="flex-1 overflow-hidden flex flex-col h-full bg-slate-50 p-4 pb-20 lg:p-4 animate-in slide-in-from-bottom-10 lg:slide-in-from-left-10 duration-500">
                        {/* POS Header */}
                        <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100 mb-4 flex items-center justify-between">
                            <h2 className="text-2xl font-black text-slate-900 flex items-center gap-2 mb-2 md:mb-0">
                                <ShoppingCart className="w-6 h-6 text-slate-900" />
                                Punto de Venta (POS)
                            </h2>
                            <button onClick={() => setShowPOS(false)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="flex-1 flex flex-col lg:flex-row gap-4 overflow-hidden">
                            {/* Products Section */}
                            <div className="flex-1 bg-white rounded-3xl shadow-sm border border-slate-100 p-4 flex flex-col overflow-hidden">
                                <div className="flex gap-2 pb-4 overflow-x-auto scrollbar-hide shrink-0">
                                    {posCategories.map(cat => (
                                        <button
                                            key={cat}
                                            onClick={() => setPosActiveCategory(cat)}
                                            className={`px-4 py-2 rounded-xl font-bold whitespace-nowrap border ${posActiveCategory === cat ? 'bg-primary text-slate-900 border-primary shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                                        >
                                            {cat}
                                        </button>
                                    ))}
                                </div>
                                <div className="relative mb-4 shrink-0">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <input
                                        type="text"
                                        placeholder="Buscar producto..."
                                        value={posSearchTerm}
                                        onChange={(e) => setPosSearchTerm(e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-200 py-3 pl-10 pr-4 rounded-xl outline-none focus:border-primary font-bold text-slate-700"
                                    />
                                </div>
                                <div className="flex-1 overflow-y-auto pr-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 pb-24 lg:pb-0">
                                    {posProducts
                                        .filter(p => posActiveCategory === 'Todos' || p.category === posActiveCategory)
                                        .filter(p => p.name.toLowerCase().includes(posSearchTerm.toLowerCase()))
                                        .map(product => (
                                            <div
                                                key={product.id}
                                                onClick={() => {
                                                    setSelectedProductForSelection(product);
                                                    setSelectionModalOpen(true);
                                                    setSelectionQty(1);
                                                    setSelectionNote('');
                                                    setSelectionVariant(null);
                                                }}
                                                className="bg-white border-2 border-slate-100 rounded-2xl overflow-hidden cursor-pointer hover:border-primary/50 transition-all hover:shadow-lg group flex flex-col"
                                            >
                                                <div className="h-24 bg-slate-100 relative overflow-hidden shrink-0">
                                                    {product.image ? (
                                                        <img src={product.image} className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-slate-300">
                                                            <Bike className="w-8 h-8" />
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="p-3 flex-1 flex flex-col justify-between">
                                                    <p className="font-bold text-slate-800 text-sm line-clamp-2 leading-tight">{product.name}</p>
                                                    <p className="font-black text-slate-900 text-lg mt-2">${(product.promoPrice > 0 ? product.promoPrice : product.price).toFixed(2)}</p>
                                                </div>
                                            </div>
                                        ))}
                                </div>
                            </div>

                            {/* Cart Sidebar */}
                            <div className="w-full lg:w-96 bg-white rounded-3xl shadow-sm border border-slate-100 flex flex-col shrink-0">
                                {/* Tipos de orden */}
                                <div className="grid grid-cols-3 gap-1 p-2 bg-slate-100 m-4 rounded-2xl">
                                    <button onClick={() => setPosOrderType('local')} className={`py-3 flex flex-col items-center justify-center gap-1 rounded-xl font-bold text-[10px] uppercase transition-all ${posOrderType === 'local' ? 'bg-primary text-slate-900 shadow-sm' : 'text-slate-500 hover:bg-white/50'}`}>
                                        <Store className="w-5 h-5" /> Local
                                    </button>
                                    <button onClick={() => setPosOrderType('takeout')} className={`py-3 flex flex-col items-center justify-center gap-1 rounded-xl font-bold text-[10px] uppercase transition-all ${posOrderType === 'takeout' ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-500 hover:bg-white/50'}`}>
                                        <ShoppingBag className="w-5 h-5" /> P. Llevar
                                    </button>
                                    <button onClick={() => setPosOrderType('delivery')} className={`py-3 flex flex-col items-center justify-center gap-1 rounded-xl font-bold text-[10px] uppercase transition-all ${posOrderType === 'delivery' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:bg-white/50'}`}>
                                        <Truck className="w-5 h-5" /> Delivery
                                    </button>
                                </div>

                                {/* Secciones de Selección */}
                                <div className="flex-1 overflow-y-auto px-4 space-y-4 py-2 border-b border-slate-100">
                                    {/* Información del Cliente */}
                                    <div className="space-y-3">
                                        <div className="flex gap-2">
                                            <div className="flex-1 space-y-1">
                                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Cliente</label>
                                                <input
                                                    type="text"
                                                    placeholder="Nombre..."
                                                    value={posClientName}
                                                    onChange={(e) => setPosClientName(e.target.value)}
                                                    className="w-full bg-slate-50 border border-slate-200 py-2 px-3 rounded-xl outline-none focus:border-primary text-xs font-bold"
                                                />
                                            </div>
                                            <div className="w-32 space-y-1">
                                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">DNI/ID</label>
                                                <input
                                                    type="text"
                                                    placeholder="Opcional"
                                                    value={posClientDNI}
                                                    onChange={(e) => setPosClientDNI(e.target.value)}
                                                    className="w-full bg-slate-50 border border-slate-200 py-2 px-3 rounded-xl outline-none focus:border-primary text-xs font-bold"
                                                />
                                            </div>
                                        </div>

                                        {posOrderType === 'delivery' && (
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Dirección de Envío</label>
                                                <div className="relative">
                                                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                                                    <input
                                                        type="text"
                                                        placeholder="Calle, número, apto..."
                                                        value={posDeliveryAddress}
                                                        onChange={(e) => setPosDeliveryAddress(e.target.value)}
                                                        className="w-full bg-slate-50 border border-slate-200 py-2 pl-8 pr-4 rounded-xl outline-none focus:border-primary text-xs font-bold"
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>


                                    {/* Table Selection (Only for Local) */}
                                    {posOrderType === 'local' && (
                                        <div className="space-y-2 pt-2 border-t border-slate-100">
                                            <label className="text-[10px] font-black text-slate-400 uppercase ml-1 flex items-center gap-2">
                                                <Store className="w-3 h-3" /> Mesa
                                            </label>
                                            <div className="relative">
                                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                                                <input
                                                    type="text"
                                                    placeholder="Buscar mesa..."
                                                    value={tableSearch}
                                                    onChange={(e) => setTableSearch(e.target.value)}
                                                    className="w-full bg-slate-50 border border-slate-200 py-2 pl-8 pr-4 rounded-xl outline-none focus:border-primary text-xs font-bold"
                                                />
                                            </div>
                                            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                                                {tables
                                                    .filter(t => t.number.toLowerCase().includes(tableSearch.toLowerCase()))
                                                    .map(table => (
                                                        <button
                                                            key={table.id}
                                                            onClick={() => setSelectedTable(selectedTable?.id === table.id ? null : table)}
                                                            className={`px-3 py-2 rounded-xl text-xs font-black whitespace-nowrap transition-all border ${selectedTable?.id === table.id ? 'bg-primary text-slate-900 border-primary' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                                                        >
                                                            Mesa {table.number}
                                                        </button>
                                                    ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Items List */}
                                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                                    {posCart.map(item => (
                                        <div key={item.id} className="flex flex-col gap-2 p-3 bg-slate-50 rounded-2xl border border-slate-100">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <p className="font-bold text-slate-800 text-sm leading-tight">{item.name}</p>
                                                    <p className="font-black text-slate-900 text-sm">${item.price.toFixed(2)}</p>
                                                </div>
                                                <button onClick={() => removePosCartItem(item.id)} className="text-slate-400 hover:text-red-500 transition-colors p-1">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center bg-white rounded-lg border border-slate-200 p-1">
                                                    <button onClick={() => updatePosCartItem(item.id, -1)} className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-md">
                                                        <Minus className="w-4 h-4" />
                                                    </button>
                                                    <span className="w-8 text-center font-black text-sm">{item.quantity}</span>
                                                    <button onClick={() => updatePosCartItem(item.id, 1)} className="w-8 h-8 flex items-center justify-center text-slate-900 hover:bg-primary/10 rounded-md">
                                                        <Plus className="w-4 h-4" />
                                                    </button>
                                                </div>
                                                <p className="font-black text-slate-800">${(item.price * item.quantity).toFixed(2)}</p>
                                            </div>
                                        </div>
                                    ))}
                                    {posCart.length === 0 && (
                                        <div className="text-center text-slate-400 font-bold text-sm mt-10 opacity-50">
                                            <ShoppingCart className="w-10 h-10 mx-auto mb-2" />
                                            Carrito vacío
                                        </div>
                                    )}
                                </div>

                                {/* Totals & Actions */}
                                <div className="p-4 bg-slate-100 rounded-b-3xl">
                                    <div className="space-y-2 mb-4">
                                        <div className="flex justify-between text-sm font-bold text-slate-500">
                                            <span>Subtotal</span>
                                            <span>${posCart.reduce((sum, i) => sum + i.price * i.quantity, 0).toFixed(2)}</span>
                                        </div>
                                        {posOrderType === 'delivery' && (
                                            <div className="flex justify-between text-sm font-bold text-slate-500">
                                                <span>Envío</span>
                                                <span>${posDeliveryFee.toFixed(2)}</span>
                                            </div>
                                        )}
                                        <div className="flex justify-between text-xl font-black text-slate-900 border-t border-slate-200 pt-2">
                                            <span>Total</span>
                                            <span>${(posCart.reduce((sum, i) => sum + i.price * i.quantity, 0) + posDeliveryFee).toFixed(2)}</span>
                                        </div>
                                    </div>
                                    <button
                                        onClick={handleCreatePOSOrder}
                                        disabled={isSubmittingPOS || posCart.length === 0}
                                        className="w-full bg-primary text-slate-900 py-4 rounded-2xl font-black shadow-lg hover:shadow-primary/50 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    >
                                        {isSubmittingPOS ? (
                                            <><Loader2 className="w-5 h-5 animate-spin" /> Procesando...</>
                                        ) : (
                                            <>Cobrar y Enviar Comanda</>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )
            }

            {/* Buscando Radar Modal */}
            {radarOrderId && (
                <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm sm:px-4">
                    <div className="bg-white rounded-t-[40px] sm:rounded-3xl p-8 w-full max-w-sm shadow-2xl animate-in slide-in-from-bottom sm:zoom-in-95 duration-200 flex flex-col items-center text-center max-h-[90vh]">
                        <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-6 sm:hidden shrink-0"></div>
                        {(() => {
                            const radarOrder = orders.find(o => o.id === radarOrderId);
                            const isFound = radarOrder && (radarOrder.status === 'delivering' || radarOrder.status as any === 'asignado');
                            const hasPreferred = !!radarOrder?.preferred_driver_id && preferredCountdown > 0;
                            const preferredDriverName = hasPreferred 
                                ? (drivers.find(d => d.id === radarOrder?.preferred_driver_id)?.full_name || 'Conductor asignado')
                                : null;
                            
                            return (
                                <>
                                    <div className="relative w-32 h-32 mb-6 flex items-center justify-center">
                                        {isFound ? (
                                            <div className="w-24 h-24 bg-green-100 text-green-500 rounded-full flex items-center justify-center animate-in zoom-in duration-300">
                                                <CheckCircle className="w-12 h-12" />
                                            </div>
                                        ) : hasPreferred ? (
                                            <>
                                                <div className="absolute inset-0 bg-amber-400/20 rounded-full animate-ping" style={{ animationDuration: '1.5s' }}></div>
                                                <div className="w-20 h-20 bg-amber-500 text-white rounded-full flex items-center justify-center relative z-10 shadow-lg shadow-amber-500/30">
                                                    <Clock className="w-10 h-10 animate-pulse" />
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <div className="absolute inset-0 bg-emerald-500/20 rounded-full animate-ping" style={{ animationDuration: '2s' }}></div>
                                                <div className="absolute inset-4 bg-emerald-500/20 rounded-full animate-ping" style={{ animationDuration: '2s', animationDelay: '0.5s' }}></div>
                                                <div className="absolute inset-8 bg-emerald-500/20 rounded-full animate-ping" style={{ animationDuration: '2s', animationDelay: '1s' }}></div>
                                                <div className="w-16 h-16 bg-primary text-slate-900 rounded-full flex items-center justify-center relative z-10 shadow-lg shadow-primary/30">
                                                    <Search className="w-8 h-8 animate-pulse" />
                                                </div>
                                            </>
                                        )}
                                    </div>
                                    
                                    <h3 className="text-2xl font-black text-slate-800 mb-2">
                                        {isFound 
                                            ? '¡Piloto Encontrado!' 
                                            : hasPreferred 
                                            ? 'Conductor Preferido' 
                                            : 'Buscando Delivery...'}
                                    </h3>

                                    {hasPreferred && !isFound && (
                                        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 mb-4 w-full">
                                            <p className="text-xs font-bold text-amber-800 flex items-center justify-center gap-1.5 mb-1">
                                                <Clock className="w-3.5 h-3.5 text-amber-600 animate-spin" />
                                                Esperando respuesta del conductor asignado:
                                            </p>
                                            <p className="text-2xl font-black text-amber-900">
                                                {preferredCountdown}s
                                            </p>
                                            <p className="text-[10px] text-amber-600 mt-1">antes de abrir a radar general</p>
                                        </div>
                                    )}
                                    
                                    <p className="text-sm text-slate-500 mb-8 max-w-[250px] mx-auto leading-relaxed">
                                        {isFound 
                                            ? `El motorizado ${radarOrder?.waiterName || ''} ha aceptado el pedido y está en camino.` 
                                            : hasPreferred
                                            ? `Esperando confirmación exclusiva de ${preferredDriverName} (${preferredCountdown}s restantes).`
                                            : 'Notificando a todos los motorizados disponibles en un radio de 15km.'}
                                    </p>

                                    {isFound ? (
                                        <button
                                            onClick={() => setRadarOrderId(null)}
                                            className="w-full bg-green-500 text-white py-4 rounded-2xl font-black shadow-lg shadow-green-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                                        >
                                            Cerrar y Continuar
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => setRadarOrderId(null)}
                                            className="w-full bg-slate-100 text-slate-500 py-4 rounded-2xl font-bold hover:bg-slate-200 transition-all"
                                        >
                                            Minimizar Radar
                                        </button>
                                    )}
                                </>
                            );
                        })()}
                    </div>
                </div>
            )}

            {/* Comanda Preview Modal */}
            {selectedOrderForComanda && (
                <ComandaPreview
                    order={selectedOrderForComanda}
                    restaurantName={restaurantConfig?.name || 'Deliexpress'}
                    onClose={() => setSelectedOrderForComanda(null)}
                    onPrint={async (orderToPrint) => {
                        await handlePrintOrder(orderToPrint.id, orderToPrint as Order);
                    }}
                />
            )}

            {/* Product Selection Modal (Variants / Description) */}
            {selectionModalOpen && selectedProductForSelection && (
                <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-md sm:px-4 sm:p-4">
                    <motion.div 
                        initial={{ y: "100%" }}
                        animate={{ y: 0 }}
                        transition={{ type: "spring", bounce: 0, duration: 0.4 }}
                        className="bg-white rounded-t-[40px] sm:rounded-[2.5rem] w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh] relative"
                    >
                        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-12 h-1.5 bg-white/50 backdrop-blur-md rounded-full sm:hidden z-10"></div>
                        {/* Modal Header with Image */}
                        <div className="relative h-48 sm:h-64 bg-slate-100 shrink-0">
                            {selectedProductForSelection.image ? (
                                <img src={selectedProductForSelection.image} className="w-full h-full object-cover" alt={selectedProductForSelection.name} />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-slate-300">
                                    <Bike className="w-16 h-16" />
                                </div>
                            )}
                            <button 
                                onClick={() => setSelectionModalOpen(false)}
                                className="absolute top-4 right-4 bg-black/20 backdrop-blur-md text-white p-2 rounded-full hover:bg-black/40 transition-colors"
                            >
                                <X className="w-6 h-6" />
                            </button>
                            <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 to-transparent">
                                <h3 className="text-2xl font-black text-white">{selectedProductForSelection.name}</h3>
                                <p className="text-white/80 font-bold text-sm">
                                    {selectedProductForSelection.category} • ${(selectedProductForSelection.promoPrice > 0 ? selectedProductForSelection.promoPrice : selectedProductForSelection.price).toFixed(2)}
                                </p>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6">
                            {/* Description */}
                            {selectedProductForSelection.description && (
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Descripción</label>
                                    <p className="text-slate-600 font-medium leading-relaxed bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                        {selectedProductForSelection.description}
                                    </p>
                                </div>
                            )}

                            {/* Variants selection */}
                            {selectedProductForSelection.hasVariants && selectedProductForSelection.priceVariants?.length > 0 && (
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Selecciona una Variante</label>
                                    <div className="grid grid-cols-1 gap-2">
                                        {selectedProductForSelection.priceVariants.map((variant: any, idx: number) => (
                                            <button
                                                key={idx}
                                                onClick={() => setSelectionVariant(variant)}
                                                className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all font-bold ${
                                                    selectionVariant?.name === variant.name 
                                                    ? 'border-primary bg-primary/5 text-slate-900' 
                                                    : 'border-slate-100 text-slate-600 hover:border-slate-200'
                                                }`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selectionVariant?.name === variant.name ? 'border-primary bg-primary' : 'border-slate-300'}`}>
                                                        {selectionVariant?.name === variant.name && <div className="w-2 h-2 bg-slate-900 rounded-full" />}
                                                    </div>
                                                    <span>{variant.name}</span>
                                                </div>
                                                <span className="font-black">${variant.price.toFixed(2)}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Quantity and Notes */}
                            <div className="flex flex-col sm:flex-row gap-6">
                                <div className="space-y-3 shrink-0">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Cantidad</label>
                                    <div className="flex items-center bg-slate-100 p-1 rounded-2xl w-fit">
                                        <button 
                                            onClick={() => setSelectionQty(Math.max(1, selectionQty - 1))}
                                            className="w-12 h-12 flex items-center justify-center bg-white rounded-xl shadow-sm text-slate-500 hover:text-slate-700"
                                        >
                                            <Minus className="w-5 h-5" />
                                        </button>
                                        <span className="w-16 text-center font-black text-xl">{selectionQty}</span>
                                        <button 
                                            onClick={() => setSelectionQty(selectionQty + 1)}
                                            className="w-12 h-12 flex items-center justify-center bg-white rounded-xl shadow-sm text-slate-900 hover:text-slate-900-dark"
                                        >
                                            <Plus className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-3 flex-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Notas Especiales</label>
                                    <input 
                                        type="text"
                                        placeholder="Ej: Sin cebolla, extra salsa..."
                                        value={selectionNote}
                                        onChange={(e) => setSelectionNote(e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-200 p-4 rounded-2xl outline-none focus:border-primary font-bold text-slate-700 h-14"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="p-6 sm:p-8 bg-slate-50 border-t border-slate-100 shrink-0">
                            <button
                                onClick={() => {
                                    if (selectedProductForSelection.hasVariants && !selectionVariant) {
                                        toast.error("Por favor selecciona una variante");
                                        return;
                                    }
                                    
                                    const finalPrice = selectionVariant ? selectionVariant.price : (selectedProductForSelection.promoPrice > 0 ? selectedProductForSelection.promoPrice : selectedProductForSelection.price);
                                    const finalName = selectionVariant ? `${selectedProductForSelection.name} (${selectionVariant.name})` : selectedProductForSelection.name;
                                    
                                    const newItem = {
                                        id: `${selectedProductForSelection.id}-${selectionVariant?.name || 'default'}-${Date.now()}`,
                                        productId: selectedProductForSelection.id,
                                        name: finalName,
                                        price: finalPrice,
                                        quantity: selectionQty,
                                        note: selectionNote,
                                        category: selectedProductForSelection.category || ''
                                    };
                                    
                                    setPosCart(prev => [...prev, newItem]);
                                    setSelectionModalOpen(false);
                                    toast.success("Producto agregado al carrito");
                                }}
                                className="w-full bg-primary text-slate-900 py-5 rounded-2xl font-black text-lg shadow-xl shadow-primary/30 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3"
                            >
                                <ShoppingCart className="w-6 h-6" />
                                Agregar al Pedido • ${( (selectionVariant ? selectionVariant.price : (selectedProductForSelection.promoPrice > 0 ? selectedProductForSelection.promoPrice : selectedProductForSelection.price)) * selectionQty ).toFixed(2)}
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}

            {/* Image Preview Lightbox Modal */}
            <AnimatePresence>
                {previewImageModal && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 backdrop-blur-md p-4"
                        onClick={() => setPreviewImageModal(null)}
                    >
                        <motion.div 
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="relative max-w-3xl max-h-[90vh] bg-slate-900 rounded-3xl p-3 shadow-2xl flex flex-col items-center"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
                                <a 
                                    href={previewImageModal} 
                                    download="comprobante_pago.jpg"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-2.5 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors shadow-lg flex items-center gap-1.5 text-xs font-bold"
                                    title="Descargar imagen"
                                >
                                    <Download className="w-4 h-4" />
                                    <span>Descargar</span>
                                </a>
                                <button 
                                    onClick={() => setPreviewImageModal(null)}
                                    className="p-2.5 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors shadow-lg"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <img 
                                src={previewImageModal} 
                                alt="Comprobante ampliado" 
                                className="max-w-full max-h-[82vh] object-contain rounded-2xl shadow-inner"
                            />
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Modal Detalle de Pedido Entregado (Requerimiento 5) */}
            <AnimatePresence>
                {selectedOrderForDetail && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-md sm:px-4"
                        onClick={() => setSelectedOrderForDetail(null)}
                    >
                        <motion.div 
                            initial={{ y: "100%" }}
                            animate={{ y: 0 }}
                            exit={{ y: "100%" }}
                            transition={{ type: "spring", bounce: 0, duration: 0.35 }}
                            className="bg-white rounded-t-[40px] sm:rounded-[36px] w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Modal Header */}
                            <div className="p-6 pb-4 border-b border-slate-100 flex items-center justify-between shrink-0">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                            #{selectedOrderForDetail.id.slice(-6).toUpperCase()}
                                        </span>
                                        <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1">
                                            <CheckCircle className="w-3 h-3" /> Entregado
                                        </span>
                                        {selectedOrderForDetail.paymentStatus === 'sold' && (
                                            <span className="bg-green-100 text-green-700 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                                                Venta Exitosa
                                            </span>
                                        )}
                                    </div>
                                    <h3 className="text-xl font-black text-slate-900">
                                        Detalle de Entrega
                                    </h3>
                                </div>
                                <button 
                                    onClick={() => setSelectedOrderForDetail(null)}
                                    className="w-9 h-9 rounded-2xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Modal Scrollable Content */}
                            <div className="flex-1 overflow-y-auto overscroll-contain p-6 space-y-5">
                                {/* Cliente info */}
                                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 space-y-2">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Datos del Cliente</p>
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <h4 className="font-black text-slate-900 text-base">{selectedOrderForDetail.userName || 'Usuario'}</h4>
                                            {selectedOrderForDetail.clientDNI && (
                                                <p className="text-xs font-bold text-slate-600 mt-0.5">C.I.: {selectedOrderForDetail.clientDNI}</p>
                                            )}
                                            {selectedOrderForDetail.userPhone && (
                                                <p className="text-xs font-bold text-slate-600">Teléfono: {selectedOrderForDetail.userPhone}</p>
                                            )}
                                        </div>
                                        <span className="text-xs font-bold text-slate-500 bg-white px-3 py-1 rounded-xl border border-slate-100">
                                            {selectedOrderForDetail.createdAt?.toDate 
                                                ? selectedOrderForDetail.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
                                                : (selectedOrderForDetail.createdAt ? new Date(selectedOrderForDetail.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '')}
                                        </span>
                                    </div>
                                    <div className="pt-2 border-t border-slate-200/60 flex items-center gap-2 text-xs font-bold text-slate-600">
                                        {selectedOrderForDetail.delivery_method === 'pickup' || selectedOrderForDetail.order_type === 'pickup' ? (
                                            <>
                                                <Store className="w-4 h-4 text-primary shrink-0" />
                                                <span>Retiro en Tienda / Entrega Propia</span>
                                            </>
                                        ) : (
                                            <>
                                                <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                                                <span>{selectedOrderForDetail.deliveryAddress || 'Sin dirección registrada'}</span>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* Desglose de Productos */}
                                <div className="space-y-3">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                                        Productos ({selectedOrderForDetail.items?.length || 0})
                                    </p>
                                    <div className="space-y-2">
                                        {(selectedOrderForDetail.items || []).map((item: any, idx: number) => (
                                            <div key={idx} className="flex items-center justify-between p-3.5 bg-white border border-slate-100 rounded-2xl shadow-xs">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center font-black text-xs text-slate-900">
                                                        {item.quantity}x
                                                    </div>
                                                    <div>
                                                        <p className="font-black text-sm text-slate-800">{item.name}</p>
                                                        {item.note && (
                                                            <p className="text-[11px] font-bold text-amber-700 italic">Nota: {item.note}</p>
                                                        )}
                                                    </div>
                                                </div>
                                                <p className="font-black text-sm text-slate-900">
                                                    ${((item.price || 0) * (item.quantity || 1)).toFixed(2)}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Nota del pedido */}
                                {(selectedOrderForDetail as any).orderNote && (
                                    <div className="bg-amber-50 border border-amber-200/80 p-3.5 rounded-2xl text-xs">
                                        <span className="font-black uppercase tracking-wider text-[10px] text-amber-800 block mb-1">Nota de la orden:</span>
                                        <p className="font-bold text-amber-900">{((selectedOrderForDetail as any).orderNote)}</p>
                                    </div>
                                )}

                                {/* Resumen Financiero */}
                                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 space-y-2.5">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Resumen Financiero</p>
                                    <div className="flex justify-between text-xs font-bold text-slate-600">
                                        <span>Método de Pago</span>
                                        <span className="font-black text-slate-900">{selectedOrderForDetail.paymentMethod || 'No especificado'}</span>
                                    </div>
                                    {selectedOrderForDetail.paymentReference && (
                                        <div className="flex justify-between text-xs font-bold text-slate-600">
                                            <span>Referencia</span>
                                            <span className="font-black font-mono text-slate-900">{selectedOrderForDetail.paymentReference}</span>
                                        </div>
                                    )}
                                    <div className="pt-2 border-t border-slate-200/60 flex justify-between items-center">
                                        <span className="font-black text-sm text-slate-900">Total Liquidado</span>
                                        <span className="text-xl font-black text-slate-900">${(selectedOrderForDetail.total || 0).toFixed(2)}</span>
                                    </div>
                                </div>

                                {/* Comprobante de pago si existe */}
                                {selectedOrderForDetail.paymentProofUrl && (
                                    <div className="p-3 bg-white border border-slate-100 rounded-2xl flex items-center justify-between">
                                        <div className="flex items-center gap-2.5">
                                            <img 
                                                src={selectedOrderForDetail.paymentProofUrl} 
                                                alt="Comprobante" 
                                                className="w-12 h-12 rounded-xl object-cover border border-slate-200"
                                            />
                                            <div>
                                                <p className="text-xs font-black text-slate-900">Comprobante de Pago</p>
                                                <p className="text-[10px] text-slate-400 font-bold">Adjuntado en la orden</p>
                                            </div>
                                        </div>
                                        <button 
                                            onClick={() => setPreviewImageModal(selectedOrderForDetail.paymentProofUrl)}
                                            className="px-3 py-1.5 rounded-xl bg-blue-50 text-blue-600 text-xs font-black hover:bg-blue-100 transition-colors flex items-center gap-1"
                                        >
                                            <Eye className="w-3.5 h-3.5" /> Ver
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Modal Footer */}
                            <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-100 shrink-0 flex gap-2">
                                <button
                                    onClick={() => {
                                        const ordId = selectedOrderForDetail.id;
                                        setSelectedOrderForDetail(null);
                                        setChatOrderId(ordId);
                                    }}
                                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-800 py-3.5 rounded-2xl font-black text-sm transition-all flex items-center justify-center gap-2 border border-slate-200"
                                >
                                    <MessageCircle className="w-4 h-4 text-slate-700" />
                                    <span>Chat del Pedido</span>
                                </button>
                                <button
                                    onClick={() => setSelectedOrderForDetail(null)}
                                    className="px-6 bg-slate-900 text-white py-3.5 rounded-2xl font-black text-sm hover:bg-slate-800 transition-all"
                                >
                                    Cerrar
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Smart Rejection Modal (Fase 2.3) */}
            {smartRejectModalOpen && selectedOrderForReject && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-slate-200 animate-in zoom-in-95 space-y-4">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                            <div>
                                <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                                    <AlertTriangle className="w-5 h-5 text-amber-500" /> Rechazar Pedido
                                </h3>
                                <p className="text-xs text-slate-500 font-bold">
                                    Orden #{selectedOrderForReject.id.slice(0, 8)}
                                </p>
                            </div>
                            <button
                                onClick={() => {
                                    setSmartRejectModalOpen(false);
                                    setSelectedOrderForReject(null);
                                    setSmartRejectReason(null);
                                }}
                                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {!smartRejectReason ? (
                            <div className="space-y-3">
                                <p className="text-xs font-bold text-slate-700">
                                    ¿Por qué no puedes atender este pedido?
                                </p>

                                <button
                                    onClick={() => setSmartRejectReason('closed')}
                                    className="w-full p-4 rounded-2xl border-2 border-slate-200 hover:border-red-400 hover:bg-red-50/50 transition-all text-left flex items-start gap-3 group"
                                >
                                    <div className="w-9 h-9 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                                        <Store className="w-5 h-5" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-xs font-black text-slate-900 group-hover:text-red-700">1. Negocio no abierto</p>
                                        <p className="text-[11px] text-slate-500 font-medium">El local se encuentra cerrado o fuera de horario de cocina.</p>
                                    </div>
                                </button>

                                <button
                                    onClick={() => setSmartRejectReason('no_stock')}
                                    className="w-full p-4 rounded-2xl border-2 border-slate-200 hover:border-amber-400 hover:bg-amber-50/50 transition-all text-left flex items-start gap-3 group"
                                >
                                    <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                                        <Package className="w-5 h-5" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-xs font-black text-slate-900 group-hover:text-amber-800">2. Falta de Stock</p>
                                        <p className="text-[11px] text-slate-500 font-medium">No cuentas con los insumos o productos solicitados.</p>
                                    </div>
                                </button>
                            </div>
                        ) : smartRejectReason === 'closed' ? (
                            <div className="space-y-4">
                                <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-800 leading-relaxed font-semibold">
                                    Se cancelará el pedido y se notificará al cliente que el negocio se encuentra cerrado en este momento.
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setSmartRejectReason(null)}
                                        className="flex-1 py-3 rounded-2xl bg-slate-100 text-slate-700 font-black text-xs hover:bg-slate-200"
                                    >
                                        Volver
                                    </button>
                                    <button
                                        onClick={async () => {
                                            try {
                                                await updateStatus(selectedOrderForReject.id, 'rejected');
                                                await supabase.from('messages').insert({
                                                    order_id: selectedOrderForReject.id,
                                                    sender_id: user?.uid,
                                                    sender_name: 'Restaurante',
                                                    sender_role: 'restaurant',
                                                    text: "❌ *Pedido no aceptado:* El establecimiento se encuentra cerrado en este momento. Disculpa los inconvenientes.",
                                                    created_at: new Date().toISOString()
                                                });
                                                toast.success("Pedido cancelado: Negocio no abierto");
                                                setSmartRejectModalOpen(false);
                                                setSelectedOrderForReject(null);
                                                setSmartRejectReason(null);
                                                fetchOrders();
                                            } catch (e) {
                                                console.error(e);
                                                toast.error("Error al rechazar pedido");
                                            }
                                        }}
                                        className="flex-1 py-3 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-black text-xs shadow-md active:scale-95"
                                    >
                                        Confirmar Cancelación
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="p-3.5 bg-amber-50 border-2 border-amber-300 rounded-2xl space-y-1.5">
                                    <p className="text-xs font-black text-amber-950 flex items-center gap-1.5">
                                        <Sparkles className="w-4 h-4 text-amber-600" /> Invita a tu cliente a adquirir otro producto
                                    </p>
                                    <p className="text-[11px] font-bold text-amber-800 leading-relaxed">
                                        No cancelaremos la orden inmediatamente. Puedes ofrecerle sustitutos o alternativas directamente por el chat para no perder la venta.
                                    </p>
                                </div>

                                <div className="flex flex-col gap-2">
                                    <button
                                        onClick={async () => {
                                            const ordId = selectedOrderForReject.id;
                                            setSmartRejectModalOpen(false);
                                            setSelectedOrderForReject(null);
                                            setSmartRejectReason(null);
                                            try {
                                                await supabase.from('messages').insert({
                                                    order_id: ordId,
                                                    sender_id: user?.uid,
                                                    sender_name: 'Restaurante',
                                                    sender_role: 'restaurant',
                                                    text: "⚠️ *Aviso de disponibilidad:* Algunos productos de tu orden no cuentan con stock disponible en este momento. ¿Te gustaría cambiarlos por otro producto o alternativa de nuestro menú?",
                                                    created_at: new Date().toISOString()
                                                });
                                            } catch (err) {
                                                console.warn("Message err:", err);
                                            }
                                            setChatOrderId(ordId);
                                        }}
                                        className="w-full py-3.5 rounded-2xl bg-primary hover:bg-primary/90 text-slate-900 font-black text-xs shadow-md active:scale-95 flex items-center justify-center gap-2"
                                    >
                                        <MessageCircle className="w-4 h-4" /> Abrir Chat para ofrecer alternativas
                                    </button>

                                    <button
                                        onClick={async () => {
                                            if (window.confirm("¿Seguro que deseas cancelar la orden definitivamente por falta de stock?")) {
                                                try {
                                                    await updateStatus(selectedOrderForReject.id, 'rejected');
                                                    await supabase.from('messages').insert({
                                                        order_id: selectedOrderForReject.id,
                                                        sender_id: user?.uid,
                                                        sender_name: 'Restaurante',
                                                        sender_role: 'restaurant',
                                                        text: "❌ *Pedido cancelado:* No contamos con disponibilidad de inventario para este pedido.",
                                                        created_at: new Date().toISOString()
                                                    });
                                                    toast.success("Pedido cancelado por falta de stock");
                                                    setSmartRejectModalOpen(false);
                                                    setSelectedOrderForReject(null);
                                                    setSmartRejectReason(null);
                                                    fetchOrders();
                                                } catch (e) {
                                                    console.error(e);
                                                    toast.error("Error al rechazar pedido");
                                                }
                                            }
                                        }}
                                        className="w-full py-2.5 rounded-2xl bg-slate-100 hover:bg-red-50 text-slate-600 hover:text-red-600 font-bold text-xs transition-colors"
                                    >
                                        Cancelar orden definitivamente
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div >
    );
}
