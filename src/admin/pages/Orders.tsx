import React, { useState, useEffect } from 'react';
import { Search, Filter, Clock, MapPin, ChevronRight, Package, Truck, CheckCircle, Loader2, Bell, ExternalLink, X, ShoppingCart, Plus, Minus, Trash2, User, CreditCard, Store, ShoppingBag, Users, Upload, Image as ImageIcon } from 'lucide-react';
import { db } from '../../lib/firebase';
import { collection, query, where, onSnapshot, orderBy, doc, updateDoc, getDocs, increment, addDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { printToUsbDevice, formatTicket, PrintOrder } from '../../lib/usb-printer';

import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

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
    status: 'pending' | 'preparing' | 'delivering' | 'delivered' | 'rejected';
    paymentStatus?: 'sold' | 'not_sold';
    createdAt: any;
    deliveryAddress: string;
    paymentMethod?: string;
    paymentReference?: string;
    paymentProofUrl?: string;
    userName?: string;
    source?: string;
    waiterId?: string;
    waiterName?: string;
    tableNumber?: string;
}

export default function Orders() {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<'pending' | 'preparing' | 'delivering' | 'delivered' | 'rejected'>('pending');
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [printingOrderId, setPrintingOrderId] = useState<string | null>(null);

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

    // Payment Proofs State
    const [referenceInputs, setReferenceInputs] = useState<Record<string, string>>({});
    const [proofUploadFiles, setProofUploadFiles] = useState<Record<string, File>>({});
    const [isUploadingProof, setIsUploadingProof] = useState<Record<string, boolean>>({});

    // Edit Order Modal State
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [selectedOrderForEdit, setSelectedOrderForEdit] = useState<Order | null>(null);
    const [editOrderItems, setEditOrderItems] = useState<OrderItem[]>([]);
    const [editOrderNote, setEditOrderNote] = useState('');

    useEffect(() => {
        const fetchDrivers = async () => {
             const usersRef = collection(db, 'users');
             const q = query(usersRef, where('role', '==', 'delivery'));
             const snap = await getDocs(q);
             setDrivers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        };
        fetchDrivers();
    }, []);

    const [restaurantConfig, setRestaurantConfig] = useState<any>(null);

    useEffect(() => {
        if (!user) return;
        const fetchConfig = async () => {
            const docRef = doc(db, 'restaurants', user.uid);
            const snap = await getDoc(docRef);
            if (snap.exists()) setRestaurantConfig(snap.data());
        };
        fetchConfig();
    }, [user]);

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

    useEffect(() => {
        if (!user || !showPOS) return;
        const fetchPosProducts = async () => {
            const productsRef = collection(db, 'restaurants', user.uid, 'products');
            const q = query(productsRef);
            const snapshot = await getDocs(q);
            const items: any[] = [];
            const cats = new Set<string>();
            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.isActive !== false) {
                    items.push({ id: doc.id, ...data });
                    if (data.category) cats.add(data.category);
                }
            });
            setPosProducts(items);
            setPosCategories(['Todos', ...Array.from(cats)]);
        };

        const fetchWaitersAndTables = async () => {
            try {
                // Fetch Waiters
                const waitersRef = collection(db, 'restaurants', user.uid, 'waiters');
                const waitersSnap = await getDocs(waitersRef);
                const waitersList = waitersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setWaiters(waitersList);

                // Fetch Tables
                const tablesRef = collection(db, 'restaurants', user.uid, 'tables');
                const tablesSnap = await getDocs(tablesRef);
                const tablesList = tablesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
                setTables(tablesList.sort((a, b) => {
                    const numA = parseInt(a.number, 10);
                    const numB = parseInt(b.number, 10);
                    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
                    return a.number.localeCompare(b.number);
                }));
            } catch (error) {
                console.error("Error fetching POS data:", error);
            }
        };

        fetchPosProducts();
        fetchWaitersAndTables();
    }, [user, showPOS]);

    useEffect(() => {
        if (!user) return;

        const ordersRef = collection(db, 'orders');
        const q = query(
            ordersRef,
            where('restaurantId', '==', user.uid),
            orderBy('createdAt', 'desc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const items: Order[] = [];
            snapshot.forEach((doc) => {
                items.push({ id: doc.id, ...doc.data() } as Order);
            });

            // Check for new pending orders for sound
            const hasNewPending = items.some(o => o.status === 'pending' && (!orders.find(prev => prev.id === o.id)));
            if (hasNewPending && orders.length > 0) {
                const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
                audio.play().catch(e => console.log("Audio play blocked"));
            }

            setOrders(items);
            setLoading(false);
        }, (error) => {
            console.error("Error listening to orders:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user, orders.length]);

    const handlePrintOrder = async (orderId: string, orderData: Order) => {
        if (!user) return;
        setPrintingOrderId(orderId);
        try {
            // Obtener todas las impresoras configuradas
            const printersRef = collection(db, 'restaurants', user.uid, 'printers');
            const snapshot = await getDocs(printersRef);
            const printers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));

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
                    const printData: PrintOrder = {
                        id: orderData.id,
                        userName: orderData.userName,
                        items: itemsForThisPrinter.map(i => ({ name: i.name, quantity: i.quantity, price: i.price })),
                        stationName: printer.name,
                        createdAt: orderData.createdAt?.toDate ? orderData.createdAt.toDate() : new Date(),
                        orderNote: (orderData as any).orderNote,
                        tableNumber: (orderData as any).tableNumber
                    };

                    const buffer = formatTicket(printData);
                    printPromises.push(printToUsbDevice(printer.vendorId, printer.productId, buffer));
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
                paymentMethod: paymentMethod,
                paymentStatus: (paymentMethod === 'Crédito (2x3)') ? 'pending' : 'sold'
            };

            // 2x3 Logic
            if (paymentMethod === 'Crédito (2x3)' && restaurantConfig?.hasTwoByThree) {
                const total = selectedOrderForAccept.total;
                const initialPct = restaurantConfig.twoByThreeInitial || 50;
                const installmentsCount = restaurantConfig.twoByThreeInstallments || 2;
                
                const initialAmount = total * (initialPct / 100);
                const remaining = total - initialAmount;
                const installmentAmount = remaining / installmentsCount;

                const installments = [];
                // Cuota Inicial
                installments.push({
                    id: 'init_' + Date.now(),
                    amount: initialAmount,
                    status: 'pending',
                    dueDate: new Date().toISOString(),
                    type: 'initial'
                });

                // Cuotas restantes
                let nextDate = new Date();
                for (let i = 0; i < installmentsCount; i++) {
                    nextDate = new Date(nextDate.getTime() + 15 * 24 * 60 * 60 * 1000); // 15 días (quincenal)
                    installments.push({
                        id: `inst_${i}_` + Date.now(),
                        amount: installmentAmount,
                        status: 'pending',
                        dueDate: nextDate.toISOString(),
                        type: 'installment',
                        number: i + 1
                    });
                }
                updates.installments = installments;
                updates.isTwoByThree = true;
            }

            const orderRef = doc(db, 'orders', selectedOrderForAccept.id);
            await updateDoc(orderRef, updates);
            
            const orderTemp = { ...selectedOrderForAccept, ...updates };
            await handlePrintOrder(orderTemp.id, orderTemp as Order);
            
            setAcceptModalOpen(false);
            setSelectedOrderForAccept(null);
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
            const updates: any = { status: 'delivering' };
            if (dispatchType === 'platform' && selectedDriver) {
                updates.waiterId = selectedDriver;
                updates.waiterName = drivers.find(d => d.id === selectedDriver)?.displayName || 'Motorizado';
            }
            const orderRef = doc(db, 'orders', selectedOrderForDispatch.id);
            await updateDoc(orderRef, updates);
            
            setDispatchModalOpen(false);
            setSelectedOrderForDispatch(null);
            setDispatchType('own');
            setSelectedDriver('');
        } catch (error) {
            console.error("Error setting delivering status:", error);
            alert("Error al despachar.");
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
            const updates: any = {};
            if (refVal) updates.paymentReference = refVal;
            
            if (file) {
                const storage = getStorage();
                const fileRef = ref(storage, `payment_proofs/${orderId}_${Date.now()}`);
                await uploadBytes(fileRef, file);
                const url = await getDownloadURL(fileRef);
                updates.paymentProofUrl = url;
            }
            
            await updateDoc(doc(db, 'orders', orderId), updates);
            
            setReferenceInputs(prev => ({...prev, [orderId]: ''}));
            setProofUploadFiles(prev => {
                const next = {...prev};
                delete next[orderId];
                return next;
            });
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
                total: newTotal + fee,
                orderNote: editOrderNote
            };
            await updateDoc(doc(db, 'orders', selectedOrderForEdit.id), updates);
            setEditModalOpen(false);
            setSelectedOrderForEdit(null);
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

    const updateStatus = async (orderId: string, newStatus: string, paymentStatus?: string) => {
        try {
            const orderRef = doc(db, 'orders', orderId);
            const orderTemp = orders.find(o => o.id === orderId);

            // Si pasa a preprando, imprimimos los tickets correspondientes
            if (newStatus === 'preparing' && orderTemp) {
                await handlePrintOrder(orderId, orderTemp);
            }

            const updates: any = { status: newStatus };
            if (paymentStatus) {
                updates.paymentStatus = paymentStatus;

                // Si la venta es exitosa, se otorgan puntos al usuario (2.5 puntos por cada $)
                if (paymentStatus === 'sold' && orderTemp?.userId && orderTemp.userId !== 'pos_customer') {
                    try {
                        const pointsToAdd = orderTemp.total * 2.5;
                        const userRef = doc(db, 'users', orderTemp.userId);
                        await updateDoc(userRef, {
                            points: increment(pointsToAdd),
                            [`restaurantPoints.${user.uid}`]: increment(pointsToAdd)
                        });
                        console.log(`Se sumaron ${pointsToAdd} puntos al usuario ${orderTemp.userId}`);
                    } catch (pointsError) {
                        console.error("Error al sumar puntos al usuario:", pointsError);
                    }
                }
            }
            await updateDoc(orderRef, updates);
        } catch (error) {
            console.error("Error updating order status:", error);
        }
    };

    const handleCreatePOSOrder = async () => {
        if (!user) return;
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

            const newOrderRef = await addDoc(collection(db, 'orders'), {
                restaurantId: user.uid,
                userId: 'pos_customer',
                userName: posClientName || 'Cliente en mostrador',
                clientId: posClientDNI || '',
                items,
                total,
                status: 'preparing',
                paymentStatus: 'sold', // Ya pagado
                createdAt: serverTimestamp(),
                deliveryAddress: deliveryAddressStr,
                source: 'pos',
                type: posOrderType,
                deliveryFee: posDeliveryFee,
                waiterId: selectedWaiter?.id || '',
                waiterName: selectedWaiter?.name || '',
                tableNumber: posOrderType === 'local' ? (selectedTable?.number || '') : '',
            });

            const printData = {
                id: newOrderRef.id,
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

            await handlePrintOrder(newOrderRef.id, printData);

            setShowPOS(false);
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
        pending: orders.filter(o => o.status === 'pending').length,
        preparing: orders.filter(o => o.status === 'preparing').length,
        delivering: orders.filter(o => o.status === 'delivering').length,
        delivered: orders.filter(o => o.status === 'delivered').length,
        rejected: orders.filter(o => o.status === 'rejected').length,
    };

    const filteredOrders = orders
        .filter(o => o.status === (activeTab as any))
        .filter(o =>
            o.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
            o.deliveryAddress.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (o.userName && o.userName.toLowerCase().includes(searchTerm.toLowerCase()))
        );

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px]">
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
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
                        className="bg-primary text-white px-6 py-3 rounded-2xl font-black hover:scale-105 transition-all shadow-lg shadow-primary/30 flex items-center gap-2"
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

            {/* Status Tabs */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 p-2 bg-slate-100 rounded-[30px]">
                {[
                    { id: 'pending', label: 'Pendientes', icon: Bell, color: 'bg-orange-500' },
                    { id: 'preparing', label: 'Cocina', icon: Package, color: 'bg-blue-500' },
                    { id: 'delivering', label: 'Camino', icon: Truck, color: 'bg-purple-500' },
                    { id: 'delivered', label: 'Entregados', icon: CheckCircle, color: 'bg-green-500' },
                    { id: 'rejected', label: 'Rechazados', icon: X, color: 'bg-red-500' },
                ].map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`flex items-center justify-center gap-2 p-4 rounded-[25px] font-black transition-all ${activeTab === tab.id
                            ? 'bg-white shadow-lg text-slate-900'
                            : 'text-slate-500 hover:bg-white/50'
                            }`}
                    >
                        <tab.icon className={`w-5 h-5 ${activeTab === tab.id ? 'text-primary' : ''}`} />
                        <span className="hidden xl:inline">{tab.label}</span>
                        <span className={`ml-1 text-[10px] px-2 py-0.5 rounded-full text-white ${tab.color}`}>
                            {(stats as any)[tab.id]}
                        </span>
                    </button>
                ))}
            </div>

            <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                    type="text"
                    placeholder="Buscar por ID de pedido o dirección..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-white border border-slate-200 p-4 pl-12 rounded-2xl outline-none focus:border-primary transition-all font-bold text-slate-700 shadow-sm"
                />
            </div>

            {filteredOrders.length === 0 ? (
                <div className="p-20 text-center border-2 border-dashed border-slate-100 rounded-[40px] grayscale opacity-50 bg-white/50">
                    <Clock className="w-16 h-16 text-slate-200 mx-auto mb-4" />
                    <p className="text-slate-400 font-bold text-xl">Sin pedidos en esta sección</p>
                    <p className="text-slate-300 font-medium max-w-xs mx-auto mt-2 italic">Aquí aparecerán los pedidos que coincidan con el estado seleccionado.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    {filteredOrders.map((order) => (
                        <div key={order.id} className="bg-white rounded-[35px] p-8 border border-slate-100 shadow-sm hover:shadow-xl transition-all group relative overflow-hidden">
                            {order.paymentStatus === 'sold' && (
                                <div className="absolute top-0 right-0 p-4">
                                    <span className="bg-green-100 text-green-600 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest">Venta Exitosa</span>
                                </div>
                            )}
                            {order.paymentStatus === 'not_sold' && (
                                <div className="absolute top-0 right-0 p-4">
                                    <span className="bg-red-100 text-red-600 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest">No Vendido</span>
                                </div>
                            )}

                            <div className="flex justify-between items-start mb-6">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">PEDIDO #{order.id.slice(-6).toUpperCase()}</span>
                                        {order.source === 'waiter' ? (
                                            <span className="bg-indigo-100 text-indigo-700 text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-widest flex items-center gap-1">
                                                Mesero
                                            </span>
                                        ) : (
                                            <span className="bg-emerald-100 text-emerald-700 text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-widest flex items-center gap-1">
                                                App
                                            </span>
                                        )}
                                    </div>
                                    <h3 className="text-xl font-black text-slate-900">{order.userName || 'Usuario de DeliExpress'}</h3>
                                    <p className="text-sm text-slate-400 font-bold flex items-center gap-1 mt-1">
                                        <Clock className="w-4 h-4" />
                                        {order.createdAt?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-2xl font-black text-primary">${order.total.toFixed(2)}</p>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Cobrado</p>
                                </div>
                            </div>

                            <div className="space-y-3 mb-6">
                                {order.items.map((item, idx) => (
                                    <div key={idx} className="flex items-center gap-3 bg-slate-50 p-3 rounded-2xl">
                                        <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center font-black text-primary border border-slate-100 shadow-sm">
                                            {item.quantity}x
                                        </div>
                                        <div className="flex-1">
                                            <p className="font-black text-slate-700">{item.name}</p>
                                            <p className="text-xs text-slate-400 font-bold">
                                                {item.consultPrice || item.price === 0 ? 'Precio a consultar' : `$${item.price.toFixed(2)} c/u`}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {(order as any).orderNote && (
                                <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 p-4 rounded-xl mb-6 text-sm">
                                    <span className="font-black uppercase tracking-widest text-[10px] block mb-1">Nota del Cliente:</span>
                                    <p className="font-bold">{((order as any).orderNote)}</p>
                                </div>
                            )}

                            <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-2xl mb-8">
                                <MapPin className="w-5 h-5 text-primary shrink-0" />
                                <p className="text-sm font-bold text-slate-600 leading-relaxed italic">{order.deliveryAddress}</p>
                            </div>

                            {/* Payment Details Block */}
                            {order.paymentMethod && (
                                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 mb-6">
                                    <div className="flex items-center justify-between mb-3">
                                        <div>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Método de Pago</p>
                                            <p className="font-black text-slate-800 flex items-center gap-2">
                                                <CreditCard className="w-4 h-4 text-primary" /> {order.paymentMethod}
                                            </p>
                                        </div>
                                        {(order.paymentReference || order.paymentProofUrl) ? (
                                            <div className="text-right flex items-center gap-2">
                                                {order.paymentReference && (
                                                    <span className="bg-white border border-slate-200 px-3 py-1 rounded-lg text-xs font-bold text-slate-600 shadow-sm">
                                                        Ref: {order.paymentReference}
                                                    </span>
                                                )}
                                                {order.paymentProofUrl && (
                                                    <a href={order.paymentProofUrl} target="_blank" rel="noopener noreferrer" className="bg-primary/10 text-primary p-2 rounded-lg hover:bg-primary/20 transition-all">
                                                        <ImageIcon className="w-4 h-4" />
                                                    </a>
                                                )}
                                            </div>
                                        ) : null}
                                    </div>
                                    
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
                                            <label className="bg-white border border-slate-200 p-2 rounded-xl text-slate-500 hover:text-primary hover:border-primary transition-all cursor-pointer">
                                                <input 
                                                    type="file" 
                                                    accept="image/*" 
                                                    className="hidden" 
                                                    onChange={(e) => {
                                                        const file = e.target.files?.[0];
                                                        if (file) setProofUploadFiles(prev => ({...prev, [order.id]: file}));
                                                    }}
                                                />
                                                <ImageIcon className={`w-5 h-5 ${proofUploadFiles[order.id] ? 'text-primary' : ''}`} />
                                            </label>
                                            <button 
                                                onClick={() => handleSavePaymentProof(order.id)}
                                                disabled={isUploadingProof[order.id] || (!referenceInputs[order.id] && !proofUploadFiles[order.id])}
                                                className="bg-primary text-white p-2 rounded-xl hover:bg-primary/90 transition-all disabled:opacity-50"
                                                title="Guardar Pago"
                                            >
                                                {isUploadingProof[order.id] ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="flex flex-wrap items-center gap-3">
                                {order.status === 'pending' && (
                                    <>
                                        <button
                                            onClick={() => { 
                                                setSelectedOrderForEdit(order); 
                                                setEditOrderItems([...order.items]); 
                                                setEditOrderNote((order as any).orderNote || ''); 
                                                setEditModalOpen(true); 
                                            }}
                                            className="px-6 bg-slate-100 text-slate-500 py-4 rounded-2xl font-black hover:bg-slate-200 transition-all flex items-center justify-center gap-2"
                                            title="Editar Pedido"
                                        >
                                            <ExternalLink className="w-5 h-5" />
                                        </button>
                                        <button
                                            onClick={() => { setSelectedOrderForAccept(order); setAcceptModalOpen(true); }}
                                            disabled={printingOrderId === order.id}
                                            className="flex-1 min-w-[140px] bg-primary text-white py-4 rounded-2xl font-black shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                        >
                                            {printingOrderId === order.id ? (
                                                <><Loader2 className="w-5 h-5 animate-spin" /> Imprimiendo...</>
                                            ) : (
                                                <>Aceptar</>
                                            )}
                                        </button>
                                        <button
                                            onClick={() => updateStatus(order.id, 'rejected')}
                                            className="px-6 bg-slate-100 text-slate-500 py-4 rounded-2xl font-black hover:bg-red-50 hover:text-red-500 transition-all"
                                        >
                                            Rechazar
                                        </button>
                                    </>
                                )}
                                {order.status === 'preparing' && (
                                    <button
                                        onClick={() => { setSelectedOrderForDispatch(order); setDispatchModalOpen(true); }}
                                        disabled={printingOrderId === order.id}
                                        className="flex-1 bg-blue-500 text-white py-4 rounded-2xl font-black shadow-lg shadow-blue-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                    >
                                        {printingOrderId === order.id ? (
                                            <><Loader2 className="w-5 h-5 animate-spin" /> Imprimiendo...</>
                                        ) : (
                                            <>Enviar Pedido</>
                                        )}
                                    </button>
                                )}
                                {order.status === 'delivering' && (
                                    <button
                                        onClick={() => updateStatus(order.id, 'delivered')}
                                        className="flex-1 bg-green-500 text-white py-4 rounded-2xl font-black shadow-lg shadow-green-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                                    >
                                        Confirmar Entrega
                                    </button>
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
                                    </div>
                                )}
                                <button className="p-4 bg-slate-100 text-slate-400 rounded-2xl hover:bg-slate-200 transition-colors">
                                    <ExternalLink className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Accept Order Modal */}
            {acceptModalOpen && selectedOrderForAccept && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-black text-slate-900">Aceptar y Cobrar</h3>
                            <button onClick={() => setAcceptModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        <p className="text-slate-500 font-medium mb-4 text-sm">
                            Selecciona el método de pago para la orden de <span className="font-bold text-primary">{selectedOrderForAccept.userName}</span> por <span className="font-black text-slate-800">${selectedOrderForAccept.total.toFixed(2)}</span>.
                        </p>
                        <div className="space-y-3 mb-6">
                            {['Punto de Venta', 'Pago Móvil', 'Efectivo', 'Crédito (2x3)'].map((method) => (
                                <button
                                    key={method}
                                    onClick={() => setPaymentMethod(method)}
                                    className={`w-full text-left px-5 py-4 rounded-2xl font-bold transition-all border-2 ${
                                        paymentMethod === method ? 'border-primary bg-primary/5 text-primary' : 'border-slate-100 bg-white text-slate-600 hover:border-slate-200'
                                    }`}
                                >
                                    {method}
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={handleConfirmAccept}
                            disabled={isAccepting}
                            className="w-full bg-primary text-white py-4 rounded-2xl font-black shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {isAccepting ? <Loader2 className="w-5 h-5 animate-spin" /> : <><CheckCircle className="w-5 h-5" /> Confirmar e Imprimir</>}
                        </button>
                    </div>
                </div>
            )}

            {/* Dispatch Order Modal */}
            {dispatchModalOpen && selectedOrderForDispatch && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-black text-slate-900">Despachar Pedido</h3>
                            <button onClick={() => setDispatchModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        <div className="grid grid-cols-2 gap-3 mb-6">
                            <button
                                onClick={() => setDispatchType('own')}
                                className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 font-bold transition-all ${dispatchType === 'own' ? 'border-primary bg-primary/5 text-primary' : 'border-slate-100 text-slate-500 hover:bg-slate-50'}`}
                            >
                                <Store className="w-6 h-6" />
                                <span className="text-xs text-center">Propio / Cliente recoge</span>
                            </button>
                            <button
                                onClick={() => setDispatchType('platform')}
                                className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 font-bold transition-all ${dispatchType === 'platform' ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-slate-100 text-slate-500 hover:bg-slate-50'}`}
                            >
                                <Users className="w-6 h-6" />
                                <span className="text-xs text-center">Motorizado de App</span>
                            </button>
                        </div>

                        {dispatchType === 'platform' && (
                            <div className="mb-6">
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Seleccionar Motorizado</label>
                                <select 
                                    className="w-full bg-slate-50 border border-slate-200 p-4 rounded-2xl outline-none focus:border-blue-500 font-bold text-slate-700"
                                    value={selectedDriver}
                                    onChange={(e) => setSelectedDriver(e.target.value)}
                                >
                                    <option value="">-- Elige un Motorizado --</option>
                                    {drivers.map(d => (
                                        <option key={d.id} value={d.id}>{d.displayName || d.name || d.email}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <button
                            onClick={handleConfirmDispatch}
                            disabled={isAccepting || (dispatchType === 'platform' && !selectedDriver)}
                            className={`w-full text-white py-4 rounded-2xl font-black shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 ${dispatchType === 'platform' ? 'bg-blue-500 shadow-blue-500/20' : 'bg-primary shadow-primary/20'}`}
                        >
                            {isAccepting ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Truck className="w-5 h-5" /> Enviar en Camino</>}
                        </button>
                    </div>
                </div>
            )}

            {/* Edit Order Modal */}
            {editModalOpen && selectedOrderForEdit && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                        <div className="flex justify-between items-center mb-6 shrink-0">
                            <h3 className="text-xl font-black text-slate-900">Editar Pedido</h3>
                            <button onClick={() => setEditModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto pr-2 space-y-4">
                            {editOrderItems.map(item => (
                                <div key={item.id} className="flex items-center justify-between bg-slate-50 p-3 rounded-2xl border border-slate-100">
                                    <div className="flex-1">
                                        <p className="font-bold text-slate-800">{item.name}</p>
                                        <p className="text-xs text-primary font-bold">${item.price.toFixed(2)}</p>
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
                            ))}

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
                                <span className="font-black text-primary">
                                    ${(editOrderItems.reduce((acc, item) => acc + (item.price * item.quantity), 0) + ((selectedOrderForEdit as any).deliveryFee || 0)).toFixed(2)}
                                </span>
                            </div>
                            <button
                                onClick={handleUpdateOrderItems}
                                disabled={isAccepting}
                                className="w-full bg-primary text-white py-4 rounded-2xl font-black shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
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
                                <ShoppingCart className="w-6 h-6 text-primary" />
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
                                            className={`px-4 py-2 rounded-xl font-bold whitespace-nowrap border ${posActiveCategory === cat ? 'bg-primary text-white border-primary shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
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
                                                onClick={() => addToPosCart(product)}
                                                className="bg-white border-2 border-slate-100 rounded-2xl overflow-hidden cursor-pointer hover:border-primary/50 transition-all hover:shadow-lg group flex flex-col"
                                            >
                                                <div className="h-24 bg-slate-100 relative overflow-hidden shrink-0">
                                                    {product.image ? (
                                                        <img src={product.image} className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-slate-300">
                                                            <Package className="w-8 h-8" />
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="p-3 flex-1 flex flex-col justify-between">
                                                    <p className="font-bold text-slate-800 text-sm line-clamp-2 leading-tight">{product.name}</p>
                                                    <p className="font-black text-primary text-lg mt-2">${(product.promoPrice > 0 ? product.promoPrice : product.price).toFixed(2)}</p>
                                                </div>
                                            </div>
                                        ))}
                                </div>
                            </div>

                            {/* Cart Sidebar */}
                            <div className="w-full lg:w-96 bg-white rounded-3xl shadow-sm border border-slate-100 flex flex-col shrink-0">
                                {/* Tipos de orden */}
                                <div className="grid grid-cols-3 gap-1 p-2 bg-slate-100 m-4 rounded-2xl">
                                    <button onClick={() => setPosOrderType('local')} className={`py-3 flex flex-col items-center justify-center gap-1 rounded-xl font-bold text-[10px] uppercase transition-all ${posOrderType === 'local' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:bg-white/50'}`}>
                                        <Store className="w-5 h-5" /> Local
                                    </button>
                                    <button onClick={() => setPosOrderType('takeout')} className={`py-3 flex flex-col items-center justify-center gap-1 rounded-xl font-bold text-[10px] uppercase transition-all ${posOrderType === 'takeout' ? 'bg-white text-orange-500 shadow-sm' : 'text-slate-500 hover:bg-white/50'}`}>
                                        <ShoppingBag className="w-5 h-5" /> P. Llevar
                                    </button>
                                    <button onClick={() => setPosOrderType('delivery')} className={`py-3 flex flex-col items-center justify-center gap-1 rounded-xl font-bold text-[10px] uppercase transition-all ${posOrderType === 'delivery' ? 'bg-white text-blue-500 shadow-sm' : 'text-slate-500 hover:bg-white/50'}`}>
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

                                    {/* Waiter Selection */}
                                    <div className="space-y-2 pt-2 border-t border-slate-100">
                                        <label className="text-[10px] font-black text-slate-400 uppercase ml-1 flex items-center gap-2">
                                            <Users className="w-3 h-3" /> Mesero Asignado
                                        </label>
                                        <div className="relative">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                                            <input
                                                type="text"
                                                placeholder="Buscar mesero..."
                                                value={waiterSearch}
                                                onChange={(e) => setWaiterSearch(e.target.value)}
                                                className="w-full bg-slate-50 border border-slate-200 py-2 pl-8 pr-4 rounded-xl outline-none focus:border-primary text-xs font-bold"
                                            />
                                        </div>
                                        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                                            {waiters
                                                .filter(w => w.name.toLowerCase().includes(waiterSearch.toLowerCase()))
                                                .map(waiter => (
                                                    <button
                                                        key={waiter.id}
                                                        onClick={() => setSelectedWaiter(selectedWaiter?.id === waiter.id ? null : waiter)}
                                                        className={`px-3 py-2 rounded-xl text-xs font-black whitespace-nowrap transition-all border ${selectedWaiter?.id === waiter.id ? 'bg-primary text-white border-primary' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                                                    >
                                                        {waiter.name}
                                                    </button>
                                                ))}
                                        </div>
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
                                                            className={`px-3 py-2 rounded-xl text-xs font-black whitespace-nowrap transition-all border ${selectedTable?.id === table.id ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
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
                                                    <p className="font-black text-primary text-sm">${item.price.toFixed(2)}</p>
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
                                                    <button onClick={() => updatePosCartItem(item.id, 1)} className="w-8 h-8 flex items-center justify-center text-primary hover:bg-primary/10 rounded-md">
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
                                        className="w-full bg-primary text-white py-4 rounded-2xl font-black shadow-lg hover:shadow-primary/50 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
        </div >
    );
}
