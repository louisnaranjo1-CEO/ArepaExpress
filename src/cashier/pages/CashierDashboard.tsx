import React, { useState, useEffect } from 'react';
import { LogOut, DollarSign, CheckCircle, Clock, X, Loader2, Store, CreditCard, User, Plus, Edit, ClipboardList, MapPin, Instagram, Youtube, Music2, ExternalLink, Star, MessageSquare, Bike, Bell, Package, Truck, Search, Utensils, ShoppingCart, Trash2, Minus, ChevronDown, Check, History, AlertCircle } from 'lucide-react';
import { db } from '../../lib/firebase';
import { collection, query, where, onSnapshot, orderBy, doc, updateDoc, getDoc, getDocs, increment, addDoc, serverTimestamp } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { printToUsbDevice, formatTicket, PrintOrder } from '../../lib/usb-printer';
import ProductTicker from '../components/ProductTicker';
import ReviewsModal from '../components/ReviewsModal';
import ComandaPreview from '../../admin/components/ComandaPreview';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

interface Order {
    id: string;
    items: any[];
    total: number;
    subtotal: number;
    status: string;
    paymentStatus?: string;
    paymentMethod?: string;
    source?: string;
    userName?: string;
    waiterName?: string;
    waiterId?: string;
    table?: string;
    tableNumber?: string;
    tableId?: string;
    createdAt?: any;
    deliveryAddress?: string;
    deliveryFee?: number;
    notified?: boolean;
    tip?: number;
    paymentProofURL?: string;
    paymentProofUrl?: string;
    reference?: string;
    paymentReference?: string;
}

export default function CashierDashboard() {
    const navigate = useNavigate();
    const [orders, setOrders] = useState<Order[]>([]);
    const [cashierData, setCashierData] = useState<any>(null);
    const [restaurantId, setRestaurantId] = useState<string | null>(null);
    const [restaurant, setRestaurant] = useState<any | null>(null);
    const [showReviewsModal, setShowReviewsModal] = useState(false);
    const [showHoursModal, setShowHoursModal] = useState(false);

    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
    const [closeSaleModalOpen, setCloseSaleModalOpen] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState('');
    const [closeTip, setCloseTip] = useState(0);
    const [isAccepting, setIsAccepting] = useState(false);

    // Cierre de caja
    const [closeRegisterModalOpen, setCloseRegisterModalOpen] = useState(false);
    const [registerReport, setRegisterReport] = useState<any>(null);
    const [isLoadingReport, setIsLoadingReport] = useState(false);
    const [notifiedOrderIds, setNotifiedOrderIds] = useState<Set<string>>(new Set());

    const [activeTab, setActiveTab] = useState<'pending' | 'preparing' | 'delivering' | 'delivered' | 'rejected' | 'tables'>('pending');
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);
    const [tables, setTables] = useState<any[]>([]);
    const [waiters, setWaiters] = useState<any[]>([]);
    const [selectedTable, setSelectedTable] = useState<any | null>(null);
    const [showTableModal, setShowTableModal] = useState(false);
    const [assignWaiterLoading, setAssignWaiterLoading] = useState(false);


    // Edit Order State
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [selectedOrderForEdit, setSelectedOrderForEdit] = useState<any>(null);
    const [editOrderItems, setEditOrderItems] = useState<any[]>([]);
    const [editOrderNote, setEditOrderNote] = useState('');
    const [posProducts, setPosProducts] = useState<any[]>([]);
    const [editAddProductId, setEditAddProductId] = useState('');
    const [editAddVariant, setEditAddVariant] = useState('');
    const [editAddQty, setEditAddQty] = useState(1);
    const [editAddNote, setEditAddNote] = useState('');
    // POS & Table State
    const [showPOS, setShowPOS] = useState(false);
    const [posOrderType, setPosOrderType] = useState<'local' | 'takeout' | 'delivery'>('local');
    const [posCart, setPosCart] = useState<any[]>([]);
    const [posEditingOrderId, setPosEditingOrderId] = useState<string | null>(null);
    const [posClientName, setPosClientName] = useState('');
    const [posClientDNI, setPosClientDNI] = useState('');
    const [posDeliveryAddress, setPosDeliveryAddress] = useState('');
    const [posDeliveryFee, setPosDeliveryFee] = useState(0);
    const [posActiveCategory, setPosActiveCategory] = useState<string>('Todos');
    const [posSearchTerm, setPosSearchTerm] = useState('');
    const [posCategories] = useState<string[]>(['Todos']);
    const [isSubmittingPOS, setIsSubmittingPOS] = useState(false);
    const [selectedWaiter, setSelectedWaiter] = useState<any | null>(null);

    // Product Selection Modal (Variants/Description)
    const [selectionModalOpen, setSelectionModalOpen] = useState(false);
    const [selectedProductForSelection, setSelectedProductForSelection] = useState<any | null>(null);
    const [selectionVariant, setSelectionVariant] = useState<any | null>(null);
    const [selectionQty, setSelectionQty] = useState(1);
    const [selectionNote, setSelectionNote] = useState('');

    // Dispatch State
    const [dispatchModalOpen, setDispatchModalOpen] = useState(false);
    const [selectedOrderForDispatch, setSelectedOrderForDispatch] = useState<any>(null);
    const [dispatchType, setDispatchType] = useState<'own' | 'platform'>('own');

    // Printing
    const [printingOrderId, setPrintingOrderId] = useState<string | null>(null);

    // Payment Proofs
    const [referenceInputs, setReferenceInputs] = useState<Record<string, string>>({});
    const [proofUploadFiles, setProofUploadFiles] = useState<Record<string, File>>({});
    const [isUploadingProof, setIsUploadingProof] = useState<Record<string, boolean>>({});

    // Acceptance & Comanda
    const [acceptModalOpen, setAcceptModalOpen] = useState(false);
    const [selectedOrderForAccept, setSelectedOrderForAccept] = useState<Order | null>(null);
    const [selectedOrderForComanda, setSelectedOrderForComanda] = useState<Order | null>(null);

    // Audio object for the notification sound
    const [notificationSound] = useState(() => new Audio('https://firebasestorage.googleapis.com/v0/b/arepa-express-ve-2026.firebasestorage.app/o/Digital_Cascade_01.mp3?alt=media&token=211ed9a7-2b49-469f-8869-3fc2cd38d2f5'));

    useEffect(() => {
        const storedCashier = localStorage.getItem('cashierData');
        const storedRestaurantId = localStorage.getItem('cashierRestaurantId');
        
        if (!storedCashier || !storedRestaurantId) {
            navigate('/login');
            return;
        }

        setCashierData(JSON.parse(storedCashier));
        setRestaurantId(storedRestaurantId);

        // Fetch Restaurant Data
        const fetchRestaurant = async () => {
            try {
                const docRef = doc(db, 'restaurants', storedRestaurantId);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                   setRestaurant({ id: docSnap.id, ...docSnap.data() });
                }
            } catch (error) {
                console.error("Error fetching restaurant:", error);
            }
        };
        fetchRestaurant();

        const ordersRef = collection(db, 'orders');

        const q2 = query(
            ordersRef,
            where('restaurantId', '==', storedRestaurantId),
            orderBy('createdAt', 'desc')
        );

        const unsubscribe2 = onSnapshot(q2, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
            setOrders(data);
            setLoading(false);
        });

        // Fetch products for edit modal
        const fetchProducts = async () => {
            const productsRef = collection(db, 'restaurants', storedRestaurantId, 'products');
            const snap = await getDocs(productsRef);
            setPosProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        };
        fetchProducts();

        // Fetch waiters for assignment
        const fetchWaiters = async () => {
            const waitersRef = collection(db, 'restaurants', storedRestaurantId, 'waiters');
            const snap = await getDocs(waitersRef);
            setWaiters(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        };
        fetchWaiters();

        // Real-time tables
        const tablesRef = collection(db, 'restaurants', storedRestaurantId, 'tables');
        const unsubscribeTables = onSnapshot(tablesRef, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            // Sort tables logically
            data.sort((a: any, b: any) => {
                const numA = parseInt(a.number, 10);
                const numB = parseInt(b.number, 10);
                if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
                return (a.number || '').localeCompare(b.number || '');
            });
            setTables(data);
        });

        return () => {
            unsubscribe2();
            unsubscribeTables();
        };
    }, [navigate]);

    // Real-time notification monitor
    useEffect(() => {
        const unnotifiedWaiterOrders = orders.filter(o => 
            o.source === 'waiter' && 
            o.notified === false && 
            !notifiedOrderIds.has(o.id)
        );

        if (unnotifiedWaiterOrders.length > 0) {
            unnotifiedWaiterOrders.forEach(async (order) => {
                // Play Sound
                notificationSound.play().catch(e => console.error("Error playing sound:", e));

                // Show Custom Toast Alert
                toast.custom((t) => (
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        transition={{ duration: 0.4, type: "spring", stiffness: 200, damping: 20 }}
                        className={`max-w-md w-full bg-white shadow-[0_20px_50px_rgba(0,0,0,0.15)] rounded-[2.2rem] pointer-events-auto flex ring-1 ring-black ring-opacity-5 overflow-hidden border-2 border-primary/20 backdrop-blur-xl`}
                    >
                        <div className="flex-1 w-0 p-6">
                            <div className="flex items-start">
                                <div className="shrink-0 pt-0.5">
                                    <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary relative overflow-hidden group">
                                        <ClipboardList className="w-7 h-7 relative z-10" />
                                        <div className="absolute inset-0 bg-primary/20 scale-0 group-hover:scale-100 transition-transform duration-500 rounded-full" />
                                    </div>
                                </div>
                                <div className="ml-5 flex-1 text-left">
                                    <h3 className="text-xs font-black text-primary uppercase tracking-[0.2em] mb-1">Nueva Comanda</h3>
                                    <div className="flex flex-col gap-0.5">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-bold text-slate-400">Mesero:</span>
                                            <span className="text-sm font-black text-slate-900">{order.waiterName || 'Desconocido'}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-bold text-slate-400">Mesa:</span>
                                            <span className="text-sm font-black text-slate-900">{order.table || 'N/A'}</span>
                                        </div>
                                    </div>
                                    
                                    <div className="mt-5 flex items-center justify-between bg-slate-50/80 p-4 rounded-[1.5rem] border border-slate-100 group/item">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Orden</span>
                                            <span className="text-2xl font-black text-slate-900 leading-none mt-1 tracking-tight">
                                                <span className="text-primary text-sm font-bold mr-0.5">$</span>
                                                {(order.total || 0).toFixed(2)}
                                            </span>
                                        </div>
                                        <button 
                                            onClick={() => {
                                                navigate(`/pos/${order.id}`);
                                                toast.dismiss(t.id);
                                            }}
                                            className="bg-primary text-white text-[10px] font-black uppercase tracking-widest px-5 py-3 rounded-2xl shadow-xl shadow-primary/30 hover:shadow-primary/40 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-300"
                                        >
                                            Atender Ahora
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="flex border-l border-slate-100">
                            <button
                                onClick={() => toast.dismiss(t.id)}
                                className="w-full border border-transparent rounded-none rounded-r-[2.2rem] px-5 flex items-center justify-center text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-600 focus:outline-none hover:bg-slate-50/50 transition-colors"
                            >
                                Ignorar
                            </button>
                        </div>
                    </motion.div>
                ), { duration: 15000, id: order.id });

                // Mark as notified in Firestore and local state
                try {
                    await updateDoc(doc(db, 'orders', order.id), { notified: true });
                    setNotifiedOrderIds(prev => new Set(prev).add(order.id));
                } catch (err) {
                    console.error("Error updating notified status:", err);
                }
            });
        }
    }, [orders, notifiedOrderIds, notificationSound, navigate, db]);

    const handleLogout = () => {
        localStorage.removeItem('cashierData');
        localStorage.removeItem('cashierRestaurantId');
        localStorage.removeItem('isCashier');
        navigate('/login');
    };

    const handleOpenRegisterReport = async () => {
        if (!restaurantId) return;
        setIsLoadingReport(true);
        setCloseRegisterModalOpen(true);
        
        try {
            // Get today's start date
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // Fetch all sold orders for today
            const ordersRef = collection(db, 'orders');
            // Firestore queries usually require composite index for inequality/equality combos. 
            // So we fetch all of today's and filter 'sold' client side if no index exists, 
            // but we can query by restaurantId and order by createdAt and filter locally.
            // Since we already have the real-time query for this restaurant without where clause on time, 
            // let's do a fast one-time fetch or just use snapshot if we collected all today's but we didn't.
            // Actually, best is to do a manual fetch, order by createdAt desc, and stop iterating when < today.
            
            // Simpler: Just fetch all from restaurant where paymentStatus == 'sold' and date >= today.
            // But Date in firestore requires Timestamp. We'll fetch all or just the ones from our state if they have ALL.
            // Our state `orders` only has pending ones! We must query DB.
            const querySnapshot = await import('firebase/firestore').then(({ getDocs, where, query, collection }) => {
                return getDocs(query(
                    collection(db, 'orders'),
                    where('restaurantId', '==', restaurantId),
                    where('paymentStatus', '==', 'sold')
                ));
            });
            
            let totalGeneral = 0;
            const pmData: Record<string, number> = {};
            let propinasMeseros = 0;

            querySnapshot.forEach(doc => {
                const data = doc.data();
                const ts = data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt)) : new Date(0);
                if (ts >= today) { // Only today's sorted out
                    const tot = (data.total || 0);
                    totalGeneral += tot;
                    
                    const method = data.paymentMethod || 'Otro';
                    pmData[method] = (pmData[method] || 0) + tot;
                    
                    if (data.source === 'waiter' && data.tip) {
                        propinasMeseros += data.tip;
                    }
                }
            });

            setRegisterReport({
                totalGeneral,
                paymentMethods: pmData,
                propinasMeseros,
                count: querySnapshot.size
            });
            
        } catch (error) {
            console.error("Error generating report:", error);
            alert("No se pudo generar el reporte.");
        } finally {
            setIsLoadingReport(false);
        }
    };

    const handleCloseSale = async () => {
        if (!selectedOrder || !paymentMethod) {
            alert("Por favor seleccione un método de pago.");
            return;
        }
        setIsAccepting(true);
        try {
            let proofURL = '';
            const file = proofUploadFiles[selectedOrder.id];
            
            if (file) {
                const storage = getStorage();
                const storageRef = ref(storage, `payments/${selectedOrder.id}_${file.name}`);
                const uploadResult = await uploadBytes(storageRef, file);
                proofURL = await getDownloadURL(uploadResult.ref);
            }

            const safeSubtotal = selectedOrder.subtotal ?? selectedOrder.total ?? 0;
            const updates: any = {
                paymentMethod: paymentMethod,
                paymentStatus: 'sold',
                tip: closeTip,
                total: safeSubtotal + (selectedOrder.deliveryFee || 0) + closeTip,
                reference: referenceInputs[selectedOrder.id] || '',
                paymentProofURL: proofURL
            };

            let shouldPrint = false;
            // If it's a waiter's order, mark as delivered if it was preparing
            if (selectedOrder.source === 'waiter') {
                updates.status = 'delivered';
            } else {
                updates.status = 'preparing';
                shouldPrint = true;
            }

            await updateDoc(doc(db, 'orders', selectedOrder.id), updates);
            
            // Print if it's a new App order verified by the Cashier
            if (shouldPrint && restaurantId) {
                try {
                    const printersRef = collection(db, 'restaurants', restaurantId, 'printers');
                    const snapshot = await import('firebase/firestore').then(({ getDocs }) => getDocs(printersRef));
                    const printers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
                    const printPromises: Promise<boolean>[] = [];

                    for (const printer of printers) {
                        if (!printer.vendorId || !printer.productId || !printer.isActive) continue;

                        const itemsForThisPrinter = selectedOrder.items.filter(item => {
                            const itemCat = (item as any).category || '';
                            return printer.categories?.includes(itemCat);
                        });

                        if (itemsForThisPrinter.length > 0) {
                            const printData: PrintOrder = {
                                id: selectedOrder.id,
                                userName: selectedOrder.userName || '',
                                items: itemsForThisPrinter.map(i => ({ name: i.name, quantity: i.quantity, price: i.price })),
                                stationName: printer.name,
                                createdAt: selectedOrder.createdAt?.toDate ? selectedOrder.createdAt.toDate() : new Date(),
                                orderNote: (selectedOrder as any).orderNote,
                                tableNumber: (selectedOrder as any).tableNumber
                            };

                            const buffer = formatTicket(printData);
                            printPromises.push(printToUsbDevice(printer.vendorId, printer.productId, buffer));
                        }
                    }

                    if (printPromises.length > 0) {
                        await Promise.all(printPromises);
                    }
                } catch (error) {
                    console.error("Error al imprimir desde Caja:", error);
                }
            }

            // Download Command for manual record/printing
            downloadOrderTxt(selectedOrder);

            // Free Table if associated
            if (restaurantId && (selectedOrder.tableId || selectedOrder.tableNumber || selectedOrder.table)) {
                try {
                    let tid = selectedOrder.tableId;
                    if (!tid) {
                        const tNum = selectedOrder.tableNumber || selectedOrder.table;
                        const tablesRef = collection(db, 'restaurants', restaurantId, 'tables');
                        const q = query(tablesRef, where('number', '==', tNum.toString()));
                        const qSnap = await getDocs(q);
                        if (!qSnap.empty) {
                            tid = qSnap.docs[0].id;
                        }
                    }
                    if (tid) {
                        await updateDoc(doc(db, 'restaurants', restaurantId, 'tables', tid), {
                            status: 'available',
                            lastOrderId: '',
                            waiterId: '',
                            waiterName: ''
                        });
                    }
                } catch (err) {
                    console.error("Error freeing table:", err);
                }
            }

            setCloseSaleModalOpen(false);
            setSelectedOrder(null);
            setCloseTip(0);
            setPaymentMethod('');
        } catch (error) {
            console.error("Error al cobrar:", error);
            alert("Error al intentar cobrar la orden.");
        } finally {
            setIsAccepting(false);
        }
    };

    const handleRequestDelivery = async (orderId: string) => {
        setIsAccepting(true);
        try {
            await updateDoc(doc(db, 'orders', orderId), {
                status: 'buscando_piloto',
                deliveryRequestedAt: new Date()
            });

            toast.success("Buscando repartidor... (Backend notificado)");
        } catch (error) {
            console.error("Error al publicar pedido:", error);
            toast.error("Ocurrió un error al despachar.");
        } finally {
            setIsAccepting(false);
        }
    };

    const downloadOrderTxt = (order: Order) => {
        if (!order) return;
        const timestamp = order.createdAt?.toDate ? order.createdAt.toDate().toLocaleString() : new Date().toLocaleString();
        const content = `
------------------------------------------
      ${restaurant?.name || 'DELIEXPRESS'}
------------------------------------------
FECHA: ${timestamp}
ORDEN: #${order.id.slice(-5).toUpperCase()}
CLIENTE: ${order.userName || 'CLIENTE'}
MESA: ${order.table || 'N/A'}
------------------------------------------
PRODUCTOS:
${order.items.map(item => `- ${item.name} x${item.quantity} ($${(item.price * item.quantity).toFixed(2)})${item.note ? `\n  - Nota: ${item.note}` : ''}`).join('\n')}
------------------------------------------
SUBTOTAL: $${(order.subtotal || 0).toFixed(2)}
DELIVERY: $${(order.deliveryFee || 0).toFixed(2)}
PROPINA: $${(order.tip || 0).toFixed(2)}
TOTAL: $${(order.total || 0).toFixed(2)}
------------------------------------------
METODO DE PAGO: ${order.paymentMethod || 'PENDIENTE'}
ESTADO: ${order.status.toUpperCase()}
------------------------------------------
¡GRACIAS POR SU COMPRA!
`;
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `comanda_${order.id.slice(-5)}.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        toast.success("Comanda descargada");
    };

    const updateStatus = async (orderId: string, newStatus: string) => {
        try {
            const orderRef = doc(db, 'orders', orderId);
            const orderTemp = orders.find(o => o.id === orderId);
            await updateDoc(orderRef, { status: newStatus });
            toast.success(`Pedido actualizado a ${newStatus}`);
            
            // Si pasa a cocina, imprimir automáticamente si así se desea
            if (newStatus === 'preparing' && orderTemp) {
                await handlePrintOrder(orderId, orderTemp);
            }
        } catch (error) {
            console.error("Error updating status:", error);
            toast.error("No se pudo actualizar el estado");
        }
    };

    const handlePrintOrder = async (orderId: string, orderData: Order) => {
        if (!restaurantId) return;
        setPrintingOrderId(orderId);
        try {
            // Obtener todas las impresoras configuradas
            const printersRef = collection(db, 'restaurants', restaurantId, 'printers');
            const snapshot = await getDocs(printersRef);
            const printers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));

            // Promesas de impresión
            const printPromises: Promise<boolean>[] = [];

            // Agrupar ítems por impresora según categoría
            for (const printer of printers) {
                if (!printer.vendorId || !printer.productId || !printer.isActive) continue;

                const itemsForThisPrinter = orderData.items.filter(item => {
                    const itemCat = (item as any).category || '';
                    return printer.categories?.includes(itemCat) || printer.categories?.length === 0;
                });

                if (itemsForThisPrinter.length > 0) {
                    const printData = {
                        id: orderData.id,
                        userName: orderData.userName,
                        items: itemsForThisPrinter.map(i => ({ name: i.name, quantity: i.quantity, price: i.price, notes: (i as any).notes })),
                        stationName: printer.name,
                        createdAt: orderData.createdAt?.toDate ? orderData.createdAt.toDate() : new Date(),
                        orderNote: (orderData as any).orderNote,
                        tableNumber: orderData.tableNumber || orderData.table
                    } as any;

                    const buffer = formatTicket(printData);
                    printPromises.push(printToUsbDevice(printer.vendorId, printer.productId, buffer));
                }
            }

            if (printPromises.length > 0) {
                await Promise.all(printPromises);
                toast.success("Comanda enviada a impresoras");
            }

        } catch (error) {
            console.error("Error general de impresión:", error);
            toast.error("Error al intentar imprimir");
        } finally {
            setPrintingOrderId(null);
        }
    };

    const handleConfirmAccept = async () => {
        if (!selectedOrderForAccept || !restaurantId) return;
        setIsAccepting(true);
        try {
            const updates: any = { 
                status: 'preparing', 
                paymentMethod: paymentMethod,
                paymentStatus: (paymentMethod === 'Crédito (2x3)') ? 'pending' : 'sold',
                updatedAt: serverTimestamp()
            };

            // Process optional reference and screenshot
            if (paymentMethod === 'Pago Móvil' || paymentMethod === 'Transferencia' || paymentMethod === 'Zelle') {
                const refVal = referenceInputs[selectedOrderForAccept.id];
                const file = proofUploadFiles[selectedOrderForAccept.id];
                if (refVal) updates.paymentReference = refVal;
                
                if (file) {
                    const storage = getStorage();
                    const fileRef = ref(storage, `payment_proofs/${selectedOrderForAccept.id}_${Date.now()}`);
                    await uploadBytes(fileRef, file);
                    const url = await getDownloadURL(fileRef);
                    updates.paymentProofUrl = url;
                }
            }

            // 2x3 Logic (Simplified for Cashier if config not fully available, but keeping pattern)
            if (paymentMethod === 'Crédito (2x3)') {
                const total = selectedOrderForAccept.total;
                const installments = [
                    { id: 'init_'+Date.now(), amount: total * 0.5, status: 'pending', dueDate: new Date().toISOString(), type: 'initial' },
                    { id: 'inst1_'+Date.now(), amount: total * 0.25, status: 'pending', dueDate: new Date(Date.now() + 15*24*60*60*1000).toISOString(), type: 'installment' },
                    { id: 'inst2_'+Date.now(), amount: total * 0.25, status: 'pending', dueDate: new Date(Date.now() + 30*24*60*60*1000).toISOString(), type: 'installment' }
                ];
                updates.installments = installments;
                updates.isTwoByThree = true;
            }

            const orderRef = doc(db, 'orders', selectedOrderForAccept.id);
            await updateDoc(orderRef, updates);
            
            const orderTemp = { ...selectedOrderForAccept, ...updates };
            toast.success("Orden aceptada y enviada a cocina");
            
            setAcceptModalOpen(false);
            setSelectedOrderForAccept(null);
            
            // Mostrar vista previa para impresión manual/revisión
            setSelectedOrderForComanda(orderTemp as any);
            
        } catch (error) {
            console.error("Error accepting order:", error);
            toast.error("Error al procesar el pedido");
        } finally {
            setIsAccepting(false);
        }
    };

    const getSocialIcon = (url: string) => {
        if (url.includes('instagram.com')) return <Instagram className="w-4 h-4" />;
        if (url.includes('tiktok.com')) return <Music2 className="w-4 h-4" />;
        if (url.includes('youtube.com') || url.includes('youtu.be')) return <Youtube className="w-4 h-4" />;
        return <ExternalLink className="w-4 h-4" />;
    };

    const getSocialColor = (url: string) => {
        if (url.includes('instagram.com')) return 'bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-600';
        if (url.includes('tiktok.com')) return 'bg-black';
        if (url.includes('youtube.com') || url.includes('youtu.be')) return 'bg-red-600';
        return 'bg-primary';
    };

    const getRestaurantStatus = () => {
        if (!restaurant || !restaurant.workingHours || restaurant.workingHours.length === 0) return { isOpen: true, text: 'Abierto' };

        const now = new Date();
        const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        const currentDay = days[now.getDay()];
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const currentTimeStr = `${hours}:${minutes}`;

        const todaySchedule = restaurant.workingHours.find((day: any) => day.day === currentDay);

        if (!todaySchedule || todaySchedule.closed) return { isOpen: false, text: 'Cerrado' };

        const isOpen = currentTimeStr >= todaySchedule.open && currentTimeStr <= todaySchedule.close;
        return { isOpen, text: isOpen ? 'Abierto' : 'Cerrado', todaySchedule };
    };

    const statusObj = getRestaurantStatus();

    const stats = React.useMemo(() => {
        return {
            pending: orders.filter(o => ['pending', 'pendiente_pago', 'occupied', 'calling'].includes(o.status)).length,
            preparing: orders.filter(o => o.status === 'preparing').length,
            delivering: orders.filter(o => o.status === 'delivering' || o.status === 'buscando_piloto').length,
            delivered: orders.filter(o => o.status === 'delivered').length,
            rejected: orders.filter(o => o.status === 'rejected').length,
            tables: tables.length
        };
    }, [orders, tables]);

    const filteredOrders = React.useMemo(() => {
        let result = orders.filter(order => {
            // Filter by active tab
            if (activeTab === 'pending') return ['pending', 'pendiente_pago', 'occupied', 'calling'].includes(order.status);
            if (activeTab === 'preparing') return order.status === 'preparing';
            if (activeTab === 'delivering') return order.status === 'delivering' || order.status === 'buscando_piloto';
            if (activeTab === 'delivered') return order.status === 'delivered';
            if (activeTab === 'rejected') return order.status === 'rejected';
            if (activeTab === 'tables') return false; // Orders are not shown in tables tab directly
            return true;
        });


        // Filter by search term
        if (searchTerm) {
            const lowSearch = searchTerm.toLowerCase();
            result = result.filter(o => 
                o.id.toLowerCase().includes(lowSearch) || 
                (o.userName || '').toLowerCase().includes(lowSearch) ||
                (o.table || '').toLowerCase().includes(lowSearch)
            );
        }

        return result;
    }, [orders, activeTab, searchTerm]);

    const renderTablesView = () => {
        const tablesWithStatus = tables.map(table => {
            const tableOrders = orders.filter(o => 
                ((o as any).tableId === table.id || (o as any).tableNumber === table.number || o.table === table.number) && 
                ['occupied', 'calling', 'preparing', 'delivering', 'delivered', 'pending', 'pendiente_pago'].includes(o.status) &&
                o.paymentStatus !== 'sold' &&
                o.paymentStatus !== 'merged'
            );

            let status = table.status === 'available' ? 'free' : (table.status || 'free');
            if (tableOrders.some(o => o.status === 'calling')) status = 'calling';
            else if (tableOrders.length > 0) status = 'occupied';
            // ensure billing maps to distinct state in cashier view
            if (table.status === 'billing' || status === 'billing') status = 'billing';

            // For billing state, we prefer the 'not_sold' order which contains the consolidated items
            const activeOrder = status === 'billing' 
                ? tableOrders.find(o => o.paymentStatus === 'not_sold') || tableOrders[0]
                : tableOrders[0];

            return {
                ...table,
                derivedStatus: status,
                activeOrder: activeOrder
            };
        });

        return (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6 pt-4">
                {tablesWithStatus.map((table) => {
                    const status = table.derivedStatus;
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
                                status === 'occupied' ? 'bg-indigo-50 border-indigo-200' :
                                status === 'calling' ? 'bg-red-50 border-red-200 shadow-lg shadow-red-200/50' :
                                status === 'billing' ? 'bg-emerald-50 border-emerald-200 shadow-lg shadow-emerald-200/50' :
                                'bg-white border-slate-100 hover:border-primary/30 hover:shadow-xl'
                            }`}>
                                <Utensils className={`w-8 h-8 ${
                                    status === 'occupied' ? 'text-indigo-500' :
                                    status === 'calling' ? 'text-red-500' :
                                    status === 'billing' ? 'text-emerald-500' :
                                    'text-slate-300 group-hover:text-primary transition-colors'
                                }`} />
                                <div className="text-center">
                                    <p className={`text-2xl font-black ${
                                        status === 'occupied' ? 'text-indigo-900' :
                                        status === 'calling' ? 'text-red-900' :
                                        status === 'billing' ? 'text-emerald-900' :
                                        'text-slate-600'
                                    }`}>#{table.number}</p>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                        {status === 'free' ? 'Disponible' : status === 'calling' ? 'Llamando' : status === 'billing' ? 'Cobrando' : 'Ocupada'}
                                    </p>
                                </div>
                                {table.activeOrder?.waiterName && (
                                    <div className="absolute -bottom-2 bg-white border border-slate-100 px-3 py-1 rounded-full shadow-sm">
                                        <p className="text-[10px] font-black text-indigo-600 truncate max-w-[80px]">
                                            {table.activeOrder.waiterName}
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

    const handleAssignWaiter = async (waiter: any | null) => {
        if (!selectedTable) return;
        setAssignWaiterLoading(true);
        try {
            const waiterInfo = waiter ? { id: waiter.id, name: waiter.name } : { id: 'cashier', name: 'Caja/Admin' };
            
            if (selectedTable.derivedStatus === 'free') {
                // Open POS for a new order
                setSelectedWaiter(waiterInfo);
                setPosOrderType('local');
                setPosCart([]);
                setPosEditingOrderId(null);
                setPosClientName('');
                setPosClientDNI('');
                setShowPOS(true);
                setShowTableModal(false);
            } else if (selectedTable.activeOrder) {
                // Just update responsibility
                await updateDoc(doc(db, 'orders', selectedTable.activeOrder.id), {
                    waiterId: waiterInfo.id,
                    waiterName: waiterInfo.name
                });
                toast.success("Responsabilidad actualizada");
                setShowTableModal(false);
            }
        } catch (error) {
            console.error("Error delegating table:", error);
            toast.error("Error al asignar mesa");
        } finally {
            setAssignWaiterLoading(false);
        }
    };

    const renderOrderCard = (order: Order) => {
        const isWaiter = order.source === 'waiter';
        const isPreparing = order.status === 'preparing';
        
        return (
            <motion.div
                layout
                key={order.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-[32px] p-6 shadow-sm border border-slate-100 hover:shadow-xl transition-all group relative overflow-hidden"
            >
                {/* Header Info */}
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                            Orden #{order.id.slice(-5).toUpperCase()}
                        </span>
                        <h3 className="text-xl font-black text-slate-900 truncate max-w-[180px]">
                            {isWaiter ? `Mesa ${order.table || 'N/A'}` : (order.userName || 'Cliente')}
                        </h3>
                    </div>
                    <div className={`px-3 py-1.5 rounded-2xl text-[10px] font-black uppercase tracking-widest ${
                        order.status === 'pending' ? 'bg-orange-100 text-orange-600' :
                        order.status === 'preparing' ? 'bg-blue-100 text-blue-600' :
                        order.status === 'delivering' ? 'bg-purple-100 text-purple-600' :
                        order.status === 'delivered' ? 'bg-green-100 text-green-600' :
                        'bg-red-100 text-red-600'
                    }`}>
                        {order.status === 'pending' ? 'Pendiente' :
                         order.status === 'preparing' ? 'Cocina' :
                         order.status === 'delivering' ? 'En Camino' :
                         order.status === 'delivered' ? 'Entregado' : 'Rechazado'}
                    </div>
                </div>

                {/* Content */}
                <div className="space-y-3 mb-6">
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100/50">
                        <div className="flex justify-between items-center text-sm mb-1">
                            <span className="text-slate-400 font-bold">Total:</span>
                            <span className="text-lg font-black text-primary">${(order.total || 0).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center text-[10px] font-black text-slate-400 uppercase tracking-wider">
                            <span>{order.items?.length || 0} Productos</span>
                            <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {order.createdAt ? order.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                            </span>
                        </div>
                    </div>

                    {!isWaiter && (
                        <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-[10px] font-black uppercase tracking-widest border border-emerald-100">
                            <CreditCard className="w-3 h-3" />
                            {order.paymentMethod || 'Por confirmar'}
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                    {(order.status === 'pending' || order.status === 'pendiente_pago') && (
                        <>
                            <button
                                onClick={() => { 
                                    setSelectedOrderForAccept(order); 
                                    setPaymentMethod(order.paymentMethod || '');
                                    setAcceptModalOpen(true); 
                                }}
                                className="flex-1 bg-primary text-white py-4 rounded-2xl font-black text-xs flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg shadow-primary/20"
                            >
                                <CheckCircle className="w-4 h-4" />
                                Verificar y Cocina
                            </button>
                            <button
                                onClick={() => { setSelectedOrder(order); setCloseSaleModalOpen(true); }}
                                className="flex-1 bg-emerald-50 text-emerald-600 py-4 rounded-2xl font-black text-xs flex items-center justify-center gap-2 hover:bg-emerald-100 transition-all border border-emerald-100"
                            >
                                <DollarSign className="w-4 h-4" />
                                Cobrar
                            </button>
                            <button
                                onClick={() => { setSelectedOrderForEdit(order); setEditModalOpen(true); }}
                                className="px-4 bg-slate-100 text-slate-600 rounded-2xl font-black hover:bg-slate-200 transition-all"
                                title="Editar Orden"
                            >
                                <Edit className="w-4 h-4" />
                            </button>
                        </>
                    )}

                    {order.status === 'preparing' && !isWaiter && (
                        <button
                            onClick={() => { setSelectedOrderForDispatch(order); setDispatchModalOpen(true); }}
                            className="flex-1 bg-orange-500 text-white py-4 rounded-2xl font-black text-xs flex items-center justify-center gap-2 hover:bg-orange-600 transition-all shadow-lg shadow-orange-500/20"
                        >
                            <Truck className="w-4 h-4" />
                            Despachar
                        </button>
                    )}

                    {order.status === 'preparing' && isWaiter && (
                        <button
                            onClick={() => updateStatus(order.id, 'delivering')}
                            className="flex-1 bg-blue-500 text-white py-4 rounded-2xl font-black text-xs flex items-center justify-center gap-2 hover:bg-blue-600 transition-all shadow-lg shadow-blue-500/20"
                        >
                            <CheckCircle className="w-4 h-4" />
                            Listo para Mesa
                        </button>
                    )}

                    {order.status === 'delivering' && (
                        <button
                            onClick={() => updateStatus(order.id, 'delivered')}
                            className="flex-1 bg-green-500 text-white py-4 rounded-2xl font-black text-xs flex items-center justify-center gap-2 hover:bg-green-600 transition-all shadow-lg shadow-green-500/20"
                        >
                            <CheckCircle className="w-4 h-4" />
                            Confirmar Entrega
                        </button>
                    )}
                </div>
            </motion.div>
        );
    };
    const handleCreatePOSOrder = async () => {
        if (!restaurantId) return;
        if (posCart.length === 0) return toast.error("El carrito está vacío");
        if (posOrderType === 'delivery' && !posDeliveryAddress) return toast.error("Ingresa la dirección de envío");

        setIsSubmittingPOS(true);
        try {
            const items = posCart.map(item => ({
                id: item.id,
                name: item.name,
                price: item.price,
                quantity: item.quantity,
                category: item.category || '',
                variant: item.variant || '',
                note: item.note || ''
            }));

            const subtotal = items.reduce((acc, item) => acc + (item.price * item.quantity), 0);
            const total = subtotal + posDeliveryFee;

            let deliveryAddressStr = posOrderType === 'local' ? 'Consumo Local' : posOrderType === 'takeout' ? 'Para Llevar' : posDeliveryAddress;

            let targetOrderRefId = '';

            if (posEditingOrderId) {
                // Update existing order
                const orderRef = doc(db, 'orders', posEditingOrderId);
                await updateDoc(orderRef, {
                    items,
                    total,
                    userName: posClientName || 'Cliente en mostrador',
                    clientId: posClientDNI || '',
                    deliveryAddress: deliveryAddressStr,
                    deliveryFee: posDeliveryFee,
                    waiterId: selectedWaiter?.id || 'cashier',
                    waiterName: selectedWaiter?.name || 'Caja/Admin',
                    tableId: posOrderType === 'local' ? (selectedTable?.id || '') : '',
                    tableNumber: posOrderType === 'local' ? (selectedTable?.number || '') : '',
                    updatedAt: serverTimestamp()
                });
                targetOrderRefId = posEditingOrderId;
                toast.success("Pedido actualizado");
            } else {
                // Create new order
                const newOrderRef = await addDoc(collection(db, 'orders'), {
                    restaurantId,
                    userId: 'pos_customer',
                    userName: posClientName || 'Cliente en mostrador',
                    clientId: posClientDNI || '',
                    items,
                    total,
                    status: 'preparing',
                    paymentStatus: posOrderType === 'local' ? 'paid' : 'sold',
                    createdAt: serverTimestamp(),
                    deliveryAddress: deliveryAddressStr,
                    source: 'pos',
                    type: posOrderType,
                    deliveryFee: posDeliveryFee,
                    waiterId: selectedWaiter?.id || 'cashier',
                    waiterName: selectedWaiter?.name || 'Caja/Admin',
                    tableId: posOrderType === 'local' ? (selectedTable?.id || '') : '',
                    tableNumber: posOrderType === 'local' ? (selectedTable?.number || '') : '',
                });
                targetOrderRefId = newOrderRef.id;
                toast.success("Pedido creado");
            }

            // Update Table Status if local
            if (posOrderType === 'local' && selectedTable) {
                const tableRef = doc(db, 'restaurants', restaurantId, 'tables', selectedTable.id);
                await updateDoc(tableRef, {
                    status: 'occupied',
                    lastOrderId: targetOrderRefId,
                    waiterId: selectedWaiter?.id || 'cashier',
                    waiterName: selectedWaiter?.name || 'Caja/Admin'
                });
            }

            setShowPOS(false);
            setPosCart([]);
            setPosClientName('');
            setPosClientDNI('');
            setPosDeliveryAddress('');
            setPosDeliveryFee(0);
            setPosEditingOrderId(null);
            setSelectedTable(null);
            setSelectedWaiter(null);

        } catch (error) {
            console.error("Error creating POS order:", error);
            toast.error("Error al procesar pedido");
        } finally {
            setIsSubmittingPOS(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col">
            <ProductTicker restaurantId={restaurantId || ''} />
            {/* Header */}
            <header className="bg-white px-6 py-4 flex items-center justify-between border-b border-slate-200 sticky top-0 z-40">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm overflow-hidden border border-slate-100">
                        {cashierData?.photo || cashierData?.photoURL ? (
                            <img src={cashierData.photo || cashierData.photoURL} alt={cashierData.name} className="w-full h-full object-cover" />
                        ) : (
                            <Store className="w-6 h-6 text-primary" />
                        )}
                    </div>
                    <div>
                        <h1 className="font-black text-slate-900 text-lg leading-tight">Caja y Cobros</h1>
                        <p className="text-xs font-bold text-slate-500 flex items-center gap-1">
                            <User className="w-3 h-3" /> {cashierData?.name}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleOpenRegisterReport}
                        className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-xl font-bold hover:bg-amber-600 transition-colors shadow-lg shadow-amber-500/20"
                    >
                        <ClipboardList className="w-4 h-4" />
                        <span className="hidden sm:inline">Cierre Caja</span>
                    </button>
                    <button
                        onClick={() => {
                            setPosCart([]);
                            setPosEditingOrderId(null);
                            setPosOrderType('takeout');
                            setPosClientName('');
                            setSelectedTable(null);
                            setSelectedWaiter({ id: 'cashier', name: 'Caja/Admin' });
                            setShowPOS(true);
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
                    >
                        <Plus className="w-4 h-4" />
                        <span className="hidden sm:inline">Nuevo Pedido</span>
                    </button>
                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-colors"
                    >
                        <LogOut className="w-4 h-4" />
                        <span className="hidden sm:inline">Salir</span>
                    </button>
                </div>
            </header>

            <main className="flex-1 p-6 max-w-7xl mx-auto w-full space-y-8 pb-20">
                {/* Status Tabs */}
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 p-2 bg-slate-100 rounded-[30px]">
                    {[
                        { id: 'pending', label: 'Pendientes', icon: Bell, color: 'bg-orange-500' },
                        { id: 'preparing', label: 'Cocina', icon: Package, color: 'bg-blue-500' },
                        { id: 'delivering', label: 'Camino', icon: Truck, color: 'bg-purple-500' },
                        { id: 'delivered', label: 'Entregados', icon: CheckCircle, color: 'bg-green-500' },
                        { id: 'rejected', label: 'Rechazados', icon: X, color: 'bg-red-500' },
                        { id: 'tables', label: 'Mesas', icon: Utensils, color: 'bg-indigo-500' },
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

                {activeTab === 'tables' ? renderTablesView() : (
                    <>
                        <div className="relative">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Buscar por ID, dirección o cliente..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full bg-white border border-slate-200 p-4 pl-12 rounded-2xl outline-none focus:border-primary transition-all font-bold text-slate-700 shadow-sm"
                            />
                        </div>

                        {filteredOrders.length === 0 ? (
                            <div className="p-20 text-center border-2 border-dashed border-slate-100 rounded-[40px] grayscale opacity-50 bg-white/50">
                                <Clock className="w-16 h-16 text-slate-200 mx-auto mb-4" />
                                <p className="text-slate-400 font-bold text-xl">Sin pedidos en esta sección</p>
                                <p className="text-slate-300 font-medium max-w-xs mx-auto mt-2 italic text-sm">Aquí aparecerán los pedidos que coincidan con el estado seleccionado.</p>
                            </div>
                        ) : (
                            <div className="space-y-12">
                                {/* Grouped by Waiter vs App */}
                                {filteredOrders.some(o => o.source === 'waiter') && (
                                    <div className="space-y-6">
                                        <div className="flex items-center gap-4">
                                            <h2 className="text-sm font-black text-indigo-400 uppercase tracking-[0.3em] flex items-center gap-2 whitespace-nowrap">
                                                <Utensils className="w-4 h-4" />
                                                🍽️ Servicio en Mesa / Local ({filteredOrders.filter(o => o.source === 'waiter').length})
                                            </h2>
                                            <div className="h-px flex-1 bg-indigo-100"></div>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                            {filteredOrders.filter(o => o.source === 'waiter').map(order => renderOrderCard(order))}
                                        </div>
                                    </div>
                                )}

                                {filteredOrders.some(o => o.source !== 'waiter') && (
                                    <div className="space-y-6">
                                        <div className="flex items-center gap-4">
                                            <h2 className="text-sm font-black text-emerald-400 uppercase tracking-[0.3em] flex items-center gap-2 whitespace-nowrap">
                                                <Truck className="w-4 h-4" />
                                                🚚 App / Delivery Express ({filteredOrders.filter(o => o.source !== 'waiter').length})
                                            </h2>
                                            <div className="h-px flex-1 bg-emerald-100"></div>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                            {filteredOrders.filter(o => o.source !== 'waiter').map(order => renderOrderCard(order))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}
            </main>

            {/* Modals Adicionales */}
            <ReviewsModal 
                isOpen={showReviewsModal} 
                onClose={() => setShowReviewsModal(false)} 
                restaurantId={restaurantId || ''} 
            />

            {/* Modal de Horarios */}
            {showHoursModal && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4">
                    <div className="bg-white rounded-[2.5rem] p-8 w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                                    <Clock className="w-6 h-6 text-primary" />
                                </div>
                                <h3 className="text-xl font-black text-slate-900">Horario de Trabajo</h3>
                            </div>
                            <button onClick={() => setShowHoursModal(false)} className="text-slate-400 hover:text-slate-600 p-2">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        
                        <div className="space-y-3">
                            {restaurant?.workingHours?.map((day: any, i: number) => (
                                <div key={i} className={`flex justify-between items-center p-3 rounded-2xl ${day.day === (['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][new Date().getDay()]) ? 'bg-primary/5 border border-primary/10 ring-1 ring-primary/20' : 'bg-slate-50'}`}>
                                    <span className={`font-bold ${day.day === (['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][new Date().getDay()]) ? 'text-primary' : 'text-slate-600'}`}>{day.day}</span>
                                    {day.closed ? (
                                        <span className="text-xs font-black text-red-400 uppercase tracking-widest">Cerrado</span>
                                    ) : (
                                        <span className="text-sm font-black text-slate-900">{day.open} - {day.close}</span>
                                    )}
                                </div>
                            ))}
                        </div>

                        <button 
                            onClick={() => setShowHoursModal(false)}
                            className="w-full mt-8 py-4 bg-slate-900 text-white font-black rounded-2xl hover:bg-slate-800 transition-all uppercase tracking-[0.2em] shadow-lg shadow-slate-900/20"
                        >
                            Entendido
                        </button>
                    </div>
                </div>
            )}

            {/* Modal de Cobro */}
            {closeSaleModalOpen && selectedOrder && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-black text-slate-900">Procesar Cobro</h3>
                            <button onClick={() => { setCloseSaleModalOpen(false); setSelectedOrder(null); setCloseTip(0); setPaymentMethod(''); }} className="text-slate-400 hover:text-slate-600">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        
                        <div className="bg-slate-50 p-4 rounded-2xl mb-6">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-sm font-bold text-slate-500">Subtotal:</span>
                                <span className="font-bold text-slate-700">${selectedOrder.subtotal.toFixed(2)}</span>
                            </div>
                            {selectedOrder.deliveryFee && selectedOrder.deliveryFee > 0 ? (
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-sm font-bold text-slate-500">Delivery:</span>
                                    <span className="font-bold text-slate-700">${selectedOrder.deliveryFee.toFixed(2)}</span>
                                </div>
                            ) : null}
                            <div className="flex justify-between items-center border-t border-slate-200 pt-2 mt-2">
                                 <span className="text-sm font-black text-slate-900">Total:</span>
                                 <span className="font-black text-xl text-primary"> ${((selectedOrder.subtotal || 0) + (selectedOrder.deliveryFee || 0)).toFixed(2)}</span>
                            </div>
                        </div>

                        {selectedOrder.source === 'waiter' && (
                            <div className="mb-4">
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Propina Mesero ($)</label>
                                <input
                                    type="number"
                                    min="0"
                                    step="any"
                                    value={closeTip || ''}
                                    onChange={(e) => setCloseTip(parseFloat(e.target.value) || 0)}
                                    className="w-full bg-slate-50 border border-slate-200 px-3 py-3 rounded-xl outline-none focus:border-primary font-bold text-slate-700"
                                    placeholder="0.00"
                                />
                            </div>
                        )}

                        <div className="space-y-3 mb-6">
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">Método de Pago</label>
                            <div className="grid grid-cols-2 gap-2">
                                {['Punto de Venta', 'Pago Móvil', 'Efectivo', 'Zelle'].map((method) => (
                                    <button
                                        key={method}
                                        onClick={() => setPaymentMethod(method)}
                                        className={`w-full px-3 py-3 rounded-xl text-sm font-bold transition-all border-2 flex items-center justify-center ${
                                            paymentMethod === method ? 'border-primary bg-primary/5 text-primary' : 'border-slate-100 bg-white text-slate-600 hover:border-slate-200'
                                        }`}
                                    >
                                        {method}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {paymentMethod === 'Pago Móvil' && (
                            <motion.div 
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                className="space-y-4 mb-6"
                            >
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Ref. (Últimos 6 dígitos)</label>
                                    <input 
                                        type="text"
                                        maxLength={6}
                                        placeholder="000000"
                                        value={referenceInputs[selectedOrder.id] || ''}
                                        onChange={(e) => setReferenceInputs(prev => ({ ...prev, [selectedOrder.id]: e.target.value }))}
                                        className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-2xl outline-none focus:border-primary font-bold text-slate-700 placeholder:text-slate-300"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Comprobante de Pago</label>
                                    <div className="relative group/upload">
                                        <input
                                            type="file"
                                            accept="image/*"
                                            onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                if (file) setProofUploadFiles(prev => ({ ...prev, [selectedOrder.id]: file }));
                                            }}
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                        />
                                        <div className="w-full border-2 border-dashed border-slate-200 rounded-2xl p-4 flex items-center justify-center gap-2 bg-slate-50 group-hover/upload:bg-white group-hover/upload:border-primary/30 transition-all">
                                            {proofUploadFiles[selectedOrder.id] ? (
                                                <div className="flex items-center gap-2 text-primary font-bold text-xs truncate">
                                                    <CheckCircle className="w-4 h-4" /> {proofUploadFiles[selectedOrder.id].name}
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-2 text-slate-400 font-bold text-xs">
                                                    <Plus className="w-4 h-4" /> Subir captura
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                        
                        <button
                            onClick={handleCloseSale}
                            disabled={isAccepting || !paymentMethod}
                            className="w-full bg-emerald-500 text-white py-4 rounded-2xl font-black shadow-lg shadow-emerald-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {isAccepting ? <Loader2 className="w-5 h-5 animate-spin" /> : <><CheckCircle className="w-5 h-5" /> Marcar como Pagado</>}
                        </button>
                    </div>
                </div>
            )}
            {/* Modal de Editar Orden */}
            {editModalOpen && selectedOrderForEdit && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm px-4">
                    <div className="bg-white rounded-[2.5rem] p-8 w-full max-w-2xl shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                        <div className="flex justify-between items-center mb-6 shrink-0">
                            <div>
                                <h3 className="text-2xl font-black text-slate-900">Editar Detalle del Pedido</h3>
                                <p className="text-sm font-bold text-slate-400 mt-1 uppercase tracking-widest">Orden #{selectedOrderForEdit.id.slice(-5).toUpperCase()}</p>
                            </div>
                            <button onClick={() => setEditModalOpen(false)} className="h-12 w-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="overflow-y-auto flex-1 pr-2 -mr-2 space-y-6">
                            {/* Lista de productos actuales */}
                            <div className="space-y-3">
                                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Productos en la Orden</h4>
                                {editOrderItems.map((item, idx) => (
                                    <div key={idx} className="bg-slate-50/50 border border-slate-100 p-4 rounded-3xl flex items-center justify-between group hover:bg-white hover:shadow-xl hover:shadow-slate-200/50 transition-all duration-300">
                                        <div className="flex flex-col flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-black text-slate-900">{item.name}</span>
                                                <span className="text-[10px] font-black text-primary px-2 py-0.5 bg-primary/10 rounded-full uppercase italic">x{item.quantity}</span>
                                            </div>
                                            <div className="flex flex-col gap-1 mt-1">
                                                <input 
                                                    type="text" 
                                                    placeholder="Añadir comentario (opcional)..."
                                                    value={item.note || ''}
                                                    onChange={(e) => {
                                                        const newItems = [...editOrderItems];
                                                        newItems[idx].note = e.target.value;
                                                        setEditOrderItems(newItems);
                                                    }}
                                                    className="text-xs text-slate-400 bg-transparent border-none focus:ring-0 p-0 placeholder:italic"
                                                />
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="flex bg-white rounded-2xl border border-slate-100 p-1 shadow-sm">
                                                <button 
                                                    onClick={() => {
                                                        const newItems = [...editOrderItems];
                                                        if (newItems[idx].quantity > 1) {
                                                            newItems[idx].quantity -= 1;
                                                            setEditOrderItems(newItems);
                                                        }
                                                    }}
                                                    className="w-8 h-8 rounded-xl hover:bg-slate-50 flex items-center justify-center text-slate-400 hover:text-primary transition-colors"
                                                >
                                                    <Minus className="w-4 h-4" />
                                                </button>
                                                <div className="w-8 flex items-center justify-center text-sm font-black text-slate-900">
                                                    {item.quantity}
                                                </div>
                                                <button 
                                                    onClick={() => {
                                                        const newItems = [...editOrderItems];
                                                        newItems[idx].quantity += 1;
                                                        setEditOrderItems(newItems);
                                                    }}
                                                    className="w-8 h-8 rounded-xl hover:bg-slate-50 flex items-center justify-center text-slate-400 hover:text-primary transition-colors"
                                                >
                                                    <Plus className="w-4 h-4" />
                                                </button>
                                            </div>
                                            <button 
                                                onClick={() => setEditOrderItems(prev => prev.filter((_, i) => i !== idx))}
                                                className="w-10 h-10 rounded-2xl bg-red-50 text-red-500 hover:bg-red-500 hover:text-white flex items-center justify-center transition-all shadow-sm"
                                            >
                                                <Trash2 className="w-5 h-5" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Buscador y selector de productos */}
                            <div className="bg-slate-900 rounded-[2rem] p-6 shadow-xl relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -mr-16 -mt-16" />
                                <h4 className="text-xs font-black text-primary uppercase tracking-widest mb-4 flex items-center gap-2 relative z-10">
                                    <Plus className="w-4 h-4" /> Agregar Producto
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative z-10">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Seleccionar Producto</label>
                                        <select 
                                            value={editAddProductId}
                                            onChange={(e) => setEditAddProductId(e.target.value)}
                                            className="w-full bg-slate-800 border-none text-white text-sm font-bold rounded-2xl px-4 py-4 outline-none focus:ring-2 ring-primary/50 transition-all appearance-none"
                                        >
                                            <option value="">Buscar en el menú...</option>
                                            {posProducts.map(p => (
                                                <option key={p.id} value={p.id}>{p.name} - ${p.price}</option>
                                            ))}
                                        </select>
                                    </div>
                                    
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Variante / Precio</label>
                                        <div className="flex gap-2">
                                            <select 
                                                value={editAddVariant}
                                                onChange={(e) => setEditAddVariant(e.target.value)}
                                                className="flex-1 bg-slate-800 border-none text-white text-sm font-bold rounded-2xl px-4 py-4 outline-none focus:ring-2 ring-primary/50 transition-all"
                                            >
                                                <option value="">Normal</option>
                                                {posProducts.find(p => p.id === editAddProductId)?.variants?.map((v: any) => (
                                                    <option key={v.name} value={v.name}>{v.name} (+${v.price})</option>
                                                ))}
                                            </select>
                                            <button 
                                                onClick={() => {
                                                    const prod = posProducts.find(p => p.id === editAddProductId);
                                                    if (!prod) return;
                                                    
                                                    const variantData = prod.variants?.find((v: any) => v.name === editAddVariant);
                                                    const finalPrice = prod.price + (variantData?.price || 0);

                                                    setEditOrderItems(prev => [...prev, {
                                                        id: prod.id,
                                                        name: editAddVariant ? `${prod.name} (${editAddVariant})` : prod.name,
                                                        price: finalPrice,
                                                        quantity: 1,
                                                        category: prod.category || '',
                                                        note: editAddNote
                                                    }]);
                                                    
                                                    setEditAddProductId('');
                                                    setEditAddVariant('');
                                                    setEditAddNote('');
                                                }}
                                                className="px-6 bg-primary text-white font-black rounded-2xl hover:scale-105 active:scale-95 transition-all shadow-lg shadow-primary/20"
                                            >
                                                Añadir
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="pt-6 border-t border-slate-100 flex gap-4 mt-6">
                            <button 
                                onClick={() => setEditModalOpen(false)}
                                className="flex-1 py-4 bg-slate-100 text-slate-600 font-black rounded-2xl hover:bg-slate-200 transition-all uppercase tracking-widest"
                            >
                                Cancelar
                            </button>
                            <button 
                                onClick={async () => {
                                    if (!selectedOrderForEdit) return;
                                    setIsAccepting(true);
                                    try {
                                        const newSubtotal = editOrderItems.reduce((acc, i) => acc + (i.price * i.quantity), 0);
                                        const newTotal = newSubtotal + (selectedOrderForEdit.deliveryFee || 0);
                                        
                                        await updateDoc(doc(db, 'orders', selectedOrderForEdit.id), {
                                            items: editOrderItems,
                                            subtotal: newSubtotal,
                                            total: newTotal,
                                            orderNote: editOrderNote
                                        });
                                        
                                        setEditModalOpen(false);
                                        toast.success("Orden actualizada");
                                    } catch (err) {
                                        console.error(err);
                                        toast.error("Error al actualizar");
                                    } finally {
                                        setIsAccepting(false);
                                    }
                                }}
                                disabled={isAccepting}
                                className="flex-[2] py-4 bg-primary text-white font-black rounded-2xl shadow-xl shadow-primary/30 hover:shadow-primary/40 hover:-translate-y-0.5 active:translate-y-0 transition-all uppercase tracking-widest disabled:opacity-50"
                            >
                                {isAccepting ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "Guardar Cambios"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Despacho (Radar Animation) */}
            {dispatchModalOpen && selectedOrderForDispatch && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/40 backdrop-blur-md px-4">
                    <div className="bg-white rounded-[2.5rem] p-8 w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-300 relative overflow-hidden">
                        <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
                        
                        <div className="flex justify-between items-center mb-8 relative z-10">
                            <div>
                                <h3 className="text-2xl font-black text-slate-900">Despachar Pedido</h3>
                                <p className="text-sm font-bold text-slate-400 mt-1 uppercase tracking-widest italic">#{selectedOrderForDispatch.id.slice(-5).toUpperCase()}</p>
                            </div>
                            <button 
                                onClick={() => setDispatchModalOpen(false)}
                                className="h-12 w-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-all shadow-inner"
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        {dispatchType === 'platform' && isAccepting ? (
                            <div className="flex flex-col items-center py-10 relative">
                                {/* Radar Animation */}
                                <div className="relative w-48 h-48 mb-8">
                                    <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping" />
                                    <div className="absolute inset-4 bg-primary/30 rounded-full animate-ping delay-75" />
                                    <div className="absolute inset-8 bg-primary/40 rounded-full animate-ping delay-150" />
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <div className="w-24 h-24 bg-primary rounded-full flex items-center justify-center shadow-xl shadow-primary/40 relative z-20">
                                            <Bike className="w-12 h-12 text-white animate-bounce" />
                                        </div>
                                    </div>
                                    {/* Rotating Scanner Line */}
                                    <div className="absolute inset-0 rounded-full border border-primary/20 overflow-hidden">
                                        <div className="absolute top-1/2 left-1/2 w-[200%] h-1 bg-gradient-to-r from-transparent via-primary/50 to-primary/80 origin-left -translate-y-1/2 animate-radar-scan" />
                                    </div>
                                </div>
                                <h4 className="text-xl font-black text-slate-900 mb-2">Buscando Delivery</h4>
                                <p className="text-sm font-bold text-slate-400 animate-pulse uppercase tracking-[0.2em]">Contactando repartidores cercanos...</p>
                            </div>
                        ) : (
                            <div className="space-y-6 relative z-10">
                                <div className="grid grid-cols-1 gap-4">
                                    <button
                                        onClick={() => setDispatchType('own')}
                                        className={`group relative flex flex-col items-start p-6 rounded-3xl border-2 transition-all duration-500 overflow-hidden ${
                                            dispatchType === 'own' 
                                            ? 'border-primary bg-primary/5 shadow-xl shadow-primary/10' 
                                            : 'border-slate-100 bg-slate-50/50 hover:bg-white hover:border-slate-300'
                                        }`}
                                    >
                                        <div className={`h-12 w-12 rounded-2xl mb-4 flex items-center justify-center transition-all duration-500 ${
                                            dispatchType === 'own' ? 'bg-primary text-white rotate-6' : 'bg-white text-slate-400 group-hover:bg-slate-100'
                                        }`}>
                                            <Truck className="w-6 h-6" />
                                        </div>
                                        <span className={`text-lg font-black block transition-colors ${dispatchType === 'own' ? 'text-slate-900' : 'text-slate-600'}`}>
                                            Delivery Propio
                                        </span>
                                        <span className="text-xs font-bold text-slate-400">Entrega interna del local</span>
                                    </button>

                                    <button
                                        onClick={() => setDispatchType('platform')}
                                        className={`group relative flex flex-col items-start p-6 rounded-3xl border-2 transition-all duration-500 overflow-hidden ${
                                            dispatchType === 'platform' 
                                            ? 'border-primary bg-primary/5 shadow-xl shadow-primary/10' 
                                            : 'border-slate-100 bg-slate-50/50 hover:bg-white hover:border-slate-300'
                                        }`}
                                    >
                                        <div className={`h-12 w-12 rounded-2xl mb-4 flex items-center justify-center transition-all duration-500 ${
                                            dispatchType === 'platform' ? 'bg-primary text-white rotate-6' : 'bg-white text-slate-400 group-hover:bg-slate-100'
                                        }`}>
                                            <Bike className="w-6 h-6" />
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className={`text-lg font-black block transition-colors ${dispatchType === 'platform' ? 'text-slate-900' : 'text-slate-600'}`}>
                                                Multi-Delivery (2x3)
                                            </span>
                                            <span className="bg-emerald-100 text-emerald-600 text-[10px] font-bold px-2 py-0.5 rounded-lg uppercase tracking-wider">Recomendado</span>
                                        </div>
                                        <span className="text-xs font-bold text-slate-400">Usar red de motorizados de la App</span>
                                    </button>
                                </div>

                                <button
                                    onClick={async () => {
                                        if (dispatchType === 'own') {
                                            setIsAccepting(true);
                                            try {
                                                await updateDoc(doc(db, 'orders', selectedOrderForDispatch.id), {
                                                    status: 'delivering',
                                                    dispatchedAt: serverTimestamp(),
                                                    deliverySource: 'own'
                                                });
                                                toast.success("Pedido enviado con delivery propio");
                                                setDispatchModalOpen(false);
                                            } catch (err) {
                                                toast.error("Error al despachar");
                                            } finally {
                                                setIsAccepting(false);
                                            }
                                        } else {
                                            setIsAccepting(true);
                                            // Show radar for 3 seconds then update
                                            setTimeout(async () => {
                                                try {
                                                    await updateDoc(doc(db, 'orders', selectedOrderForDispatch.id), {
                                                        status: 'buscando_piloto',
                                                        deliveryRequestedAt: serverTimestamp(),
                                                        deliverySource: 'platform'
                                                    });
                                                    toast.success("Señal enviada a los repartidores");
                                                    setDispatchModalOpen(false);
                                                } catch (err) {
                                                    toast.error("Error al solicitar delivery");
                                                } finally {
                                                    setIsAccepting(false);
                                                }
                                            }, 3500);
                                        }
                                    }}
                                    disabled={isAccepting}
                                    className="w-full bg-slate-900 text-white py-5 rounded-3xl font-black text-lg shadow-2xl hover:bg-black hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50 flex items-center justify-center gap-3"
                                >
                                    {isAccepting ? <Loader2 className="w-6 h-6 animate-spin" /> : "Confirmar Despacho"}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Modal de Asignación de Mesa */}
            {showTableModal && selectedTable && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/60 backdrop-blur-md px-4">
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        className="bg-white rounded-[3rem] p-8 w-full max-w-lg shadow-2xl relative overflow-hidden"
                    >
                        <div className="absolute -top-24 -left-24 w-48 h-48 bg-indigo-50 rounded-full blur-3xl" />
                        
                        <div className="flex justify-between items-center mb-8 relative z-10">
                            <div className="flex items-center gap-4">
                                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg ${
                                    selectedTable.derivedStatus === 'free' ? 'bg-emerald-500 text-white shadow-emerald-200' : 
                                    selectedTable.derivedStatus === 'billing' ? 'bg-emerald-600 text-white shadow-emerald-200' :
                                    'bg-indigo-500 text-white shadow-indigo-200'
                                }`}>
                                    <Utensils className="w-7 h-7" />
                                </div>
                                <div>
                                    <h3 className="text-2xl font-black text-slate-900">Mesa {selectedTable.number}</h3>
                                    <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">
                                        {selectedTable.derivedStatus === 'free' ? 'Disponible' : 
                                         selectedTable.derivedStatus === 'billing' ? 'Cobrando / Pendiente' : 
                                         'Ocupada / Con Pedido'}
                                    </p>
                                </div>
                            </div>
                            <button onClick={() => setShowTableModal(false)} className="h-12 w-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="space-y-6 relative z-10 overflow-y-auto pr-2 custom-scrollbar flex-1">
                            {selectedTable.derivedStatus !== 'free' ? (
                                <div className="space-y-4">
                                    {/* Waiter Info */}
                                    <div className="flex items-center gap-3 p-4 bg-indigo-50 border border-indigo-100 rounded-3xl">
                                        <div className="w-10 h-10 rounded-2xl bg-indigo-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
                                            <User className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Mesero Responsable</p>
                                            <p className="font-black text-indigo-900">{selectedTable.activeOrder?.waiterName || 'Sin asignar'}</p>
                                        </div>
                                    </div>

                                    {/* Consumption Details */}
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block px-1">Consumo Actual</label>
                                        <div className="bg-slate-50 rounded-[32px] p-6 border border-slate-100">
                                            <div className="space-y-3 max-h-[300px] overflow-y-auto mb-4 pr-2 custom-scrollbar">
                                                {selectedTable.activeOrder?.items?.map((item: any, idx: number) => (
                                                    <div key={idx} className="flex justify-between items-center text-sm">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-black text-primary">x{item.quantity}</span>
                                                            <span className="font-bold text-slate-700">{item.name}</span>
                                                        </div>
                                                        <span className="font-black text-slate-900">${(item.price * item.quantity).toFixed(2)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="pt-4 border-t border-slate-200 flex justify-between items-center">
                                                <span className="text-sm font-black text-slate-500 uppercase">Total Acumulado</span>
                                                <span className="text-2xl font-black text-primary">${(selectedTable.activeOrder?.total || 0).toFixed(2)}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3 pt-2">
                                        <button
                                            onClick={() => {
                                                // Load existing order into POS
                                                const order = selectedTable.activeOrder;
                                                setPosCart(order.items.map((item: any) => ({
                                                    ...item,
                                                    id: item.id || Math.random().toString(36).substr(2, 9),
                                                    price: Number(item.price),
                                                    quantity: Number(item.quantity)
                                                })));
                                                setPosEditingOrderId(order.id);
                                                setPosClientName(order.userName || '');
                                                setPosClientDNI(order.clientId || '');
                                                setPosOrderType(order.type || 'local');
                                                setSelectedWaiter(order.waiterId ? { id: order.waiterId, name: order.waiterName } : null);
                                                setShowPOS(true);
                                                setShowTableModal(false);
                                            }}
                                            className="flex items-center justify-center gap-2 p-4 bg-primary text-white rounded-2xl font-black shadow-lg shadow-primary/20 hover:scale-[1.02] transition-all text-sm"
                                        >
                                            <Edit className="w-4 h-4" /> Editar POS
                                        </button>
                                        <button
                                            onClick={() => {
                                                setSelectedOrder(selectedTable.activeOrder);
                                                setCloseSaleModalOpen(true);
                                                setShowTableModal(false);
                                            }}
                                            className="flex items-center justify-center gap-2 p-4 bg-emerald-500 text-white rounded-2xl font-black shadow-lg shadow-emerald-500/20 hover:scale-[1.02] transition-all text-sm"
                                        >
                                            <DollarSign className="w-4 h-4" /> Cobrar Mesa
                                        </button>
                                    </div>
                                    
                                    <button
                                        onClick={() => handleAssignWaiter(null)}
                                        className="w-full bg-slate-100 text-slate-500 py-4 rounded-2xl font-black flex items-center justify-center gap-2 hover:bg-slate-200 transition-all text-xs"
                                    >
                                        <Plus className="w-4 h-4" /> Reasignar / Cambiar Mesero
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest ml-2">¿Quién atenderá esta mesa?</p>
                                    
                                    <div className="grid grid-cols-1 gap-3 max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar text-left">
                                        {/* Cashier Option */}
                                        <button
                                            onClick={() => handleAssignWaiter(null)}
                                            disabled={assignWaiterLoading}
                                            className="group flex items-center justify-between p-4 bg-slate-50 hover:bg-primary hover:text-white rounded-[1.5rem] border border-slate-100 transition-all duration-300 w-full"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm group-hover:bg-primary-dark transition-colors">
                                                    <Store className="w-6 h-6 text-primary group-hover:text-white" />
                                                </div>
                                                <div className="text-left">
                                                    <p className="font-black text-slate-900 group-hover:text-white">Atender Yo Mismo</p>
                                                    <p className="text-[10px] font-black text-slate-400 group-hover:text-white/70 uppercase">Caja / Admin</p>
                                                </div>
                                            </div>
                                            <ChevronDown className="w-5 h-5 opacity-0 group-hover:opacity-100 -rotate-90" />
                                        </button>

                                        {/* Waiters List */}
                                        {waiters.map(waiter => (
                                            <button
                                                key={waiter.id}
                                                onClick={() => handleAssignWaiter(waiter)}
                                                disabled={assignWaiterLoading}
                                                className="group flex items-center justify-between p-4 bg-slate-50 hover:bg-indigo-600 hover:text-white rounded-[1.5rem] border border-slate-100 transition-all duration-300 w-full"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="w-12 h-12 bg-indigo-100 rounded-xl overflow-hidden shadow-sm">
                                                        {waiter.photoURL ? (
                                                            <img src={waiter.photoURL} alt={waiter.name} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center text-indigo-400">
                                                                <User className="w-6 h-6" />
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="text-left">
                                                        <p className="font-black text-slate-900 group-hover:text-white">{waiter.name}</p>
                                                        <p className="text-[10px] font-black text-slate-400 group-hover:text-white/70 uppercase">Mesero Disponible</p>
                                                    </div>
                                                </div>
                                                <ChevronDown className="w-5 h-5 opacity-0 group-hover:opacity-100 -rotate-90 transition-all" />
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </motion.div>
                </div>
            )}

            {/* VISTA DEL POS (FULLSCREEN OVERLAY) */}
            {showPOS && (
                <div className="fixed inset-0 z-[200] bg-slate-50 flex flex-col sm:flex-row overflow-hidden">
                    {/* Left Side: Products Catalog */}
                    <div className="flex-1 flex flex-col min-w-0 bg-white">
                        <header className="p-4 sm:p-6 border-b border-slate-100 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center bg-white sticky top-0 z-10">
                            <div className="flex items-center gap-4">
                                <button 
                                    onClick={() => setShowPOS(false)}
                                    className="p-3 hover:bg-slate-100 rounded-2xl transition-colors text-slate-400 hover:text-slate-600"
                                >
                                    <X className="w-6 h-6" />
                                </button>
                                <div>
                                    <h2 className="text-2xl font-black text-slate-900 leading-tight">Terminal POS</h2>
                                    <div className="flex items-center gap-2 mt-1">
                                        <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Listo para tomar pedido</span>
                                    </div>
                                </div>
                            </div>

                            <div className="relative w-full sm:w-72 group">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-primary transition-colors" />
                                <input 
                                    type="text"
                                    placeholder="Buscar producto..."
                                    value={posSearchTerm}
                                    onChange={(e) => setPosSearchTerm(e.target.value)}
                                    className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:border-primary focus:bg-white transition-all font-bold text-slate-600 shadow-sm"
                                />
                            </div>
                        </header>

                        {/* Categories Horizontal Scroll */}
                        <div className="px-4 sm:px-6 py-4 flex gap-2 overflow-x-auto no-scrollbar border-b border-slate-50">
                            {['Todos', ...new Set(posProducts.map(p => p.category))].map(cat => (
                                <button
                                    key={cat}
                                    onClick={() => setPosActiveCategory(cat)}
                                    className={`px-6 py-3 rounded-2xl font-black text-xs whitespace-nowrap transition-all ${
                                        posActiveCategory === cat 
                                        ? 'bg-primary text-white shadow-lg shadow-primary/20 scale-105' 
                                        : 'bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                                    }`}
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>

                        {/* Products Grid */}
                        <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar bg-slate-50/30">
                            <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                {posProducts
                                    .filter(p => posActiveCategory === 'Todos' || p.category === posActiveCategory)
                                    .filter(p => p.name.toLowerCase().includes(posSearchTerm.toLowerCase()))
                                    .map(product => (
                                        <motion.button
                                            key={product.id}
                                            layout
                                            initial={{ opacity: 0, scale: 0.9 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            whileHover={{ y: -5 }}
                                            onClick={() => {
                                                setSelectedProductForSelection(product);
                                                setSelectionVariant(null);
                                                setSelectionQty(1);
                                                setSelectionNote('');
                                                setSelectionModalOpen(true);
                                            }}
                                            className="group relative flex flex-col bg-white rounded-[2rem] overflow-hidden shadow-sm hover:shadow-xl transition-all border border-slate-100"
                                        >
                                            <div className="aspect-square bg-slate-100 relative overflow-hidden">
                                                {product.image ? (
                                                    <img src={product.image} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" alt={product.name} />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-slate-300">
                                                        <Utensils className="w-8 h-8" />
                                                    </div>
                                                )}
                                                <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/50 shadow-sm">
                                                    <p className="text-sm font-black text-slate-900">${(product.promoPrice > 0 ? product.promoPrice : product.price).toFixed(2)}</p>
                                                </div>
                                            </div>
                                            <div className="p-4 text-left flex flex-col flex-1">
                                                <h4 className="font-black text-slate-800 text-sm line-clamp-1 mb-1">{product.name}</h4>
                                                <p className="text-[10px] text-slate-400 font-bold line-clamp-2 leading-tight mb-2 flex-grow">{product.description}</p>
                                                
                                                {product.variants && product.variants.length > 0 ? (
                                                    <div className="flex gap-1.5 flex-wrap mt-auto">
                                                        {product.variants.map((v: any, idx: number) => (
                                                            <div key={idx} className="bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded-lg flex flex-col gap-0">
                                                                <span className="text-[7px] font-black uppercase text-slate-400 leading-none">{v.name}</span>
                                                                <span className="text-[9px] font-black text-slate-700 leading-none">${v.price.toFixed(2)}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-auto">{product.category}</p>
                                                )}
                                            </div>
                                        </motion.button>
                                    ))}
                            </div>
                        </div>
                    </div>

                    {/* Right Side: Current Basket & Order Info */}
                    <div className="w-full sm:w-96 flex flex-col bg-white border-l border-slate-200">
                        <div className="p-6 border-b border-slate-100">
                            <h3 className="text-lg font-black text-slate-900 flex items-center gap-2 mb-4">
                                <ShoppingCart className="w-5 h-5 text-primary" /> Detalles del Pedido
                            </h3>

                            <div className="grid grid-cols-3 gap-2">
                                {(['local' , 'takeout' , 'delivery'] as const).map(type => (
                                    <button
                                        key={type}
                                        onClick={() => {
                                            if (posEditingOrderId && type !== posOrderType) {
                                                toast.error("No se puede cambiar el tipo en una edición");
                                                return;
                                            }
                                            setPosOrderType(type);
                                        }}
                                        className={`py-3 rounded-2xl flex flex-col gap-1 items-center justify-center border-2 transition-all ${
                                            posOrderType === type 
                                            ? 'border-primary bg-primary/5 text-primary' 
                                            : 'border-slate-100 text-slate-400 bg-slate-50 hover:bg-white hover:border-slate-200'
                                        }`}
                                    >
                                        <div className="text-center">
                                            <p className="text-[10px] font-black uppercase tracking-widest">
                                                {type === 'local' ? 'Mesa' : type === 'takeout' ? 'Llevar' : 'Envio'}
                                            </p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Order Form */}
                        <div className="p-6 space-y-4 border-b border-slate-100 bg-slate-50/50">
                            {posOrderType === 'local' ? (
                                <div className="p-4 bg-primary/5 border border-primary/20 rounded-2xl">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-white shadow-lg">
                                            <Utensils className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black text-primary/60 uppercase tracking-widest">Mesa Asignada</p>
                                            <p className="text-lg font-black text-slate-900">Mesa {selectedTable?.number || '?'}</p>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nombre Cliente</label>
                                        <input 
                                            type="text"
                                            value={posClientName}
                                            onChange={(e) => setPosClientName(e.target.value)}
                                            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl outline-none focus:border-primary font-bold transition-all shadow-sm"
                                            placeholder="Nombre..."
                                        />
                                    </div>
                                    {posOrderType === 'delivery' && (
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Dirección de Envío</label>
                                            <textarea 
                                                value={posDeliveryAddress}
                                                onChange={(e) => setPosDeliveryAddress(e.target.value)}
                                                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl outline-none focus:border-primary font-bold transition-all shadow-sm h-20 resize-none"
                                                placeholder="Dirección exacta..."
                                            />
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Items List */}
                        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                            <AnimatePresence mode="popLayout">
                                {posCart.length > 0 ? (
                                    posCart.map((item, idx) => (
                                        <motion.div 
                                            key={item.id}
                                            layout
                                            initial={{ opacity: 0, x: 20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, scale: 0.8 }}
                                            className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100 mb-2 group"
                                        >
                                            <div className="w-12 h-12 bg-white rounded-xl shadow-sm flex items-center justify-center shrink-0 border border-slate-100">
                                                <span className="text-xs font-black text-primary">x{item.quantity}</span>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-bold text-slate-800 text-sm truncate">{item.name}</p>
                                                <p className="text-[10px] font-black text-slate-400">${item.price.toFixed(2)} c/u</p>
                                            </div>
                                            <div className="flex flex-col items-end gap-1">
                                                <p className="font-black text-slate-900 text-sm text-right">${(item.price * item.quantity).toFixed(2)}</p>
                                                <button 
                                                    onClick={() => setPosCart(prev => prev.filter((_, i) => i !== idx))}
                                                    className="p-1 px-2 hover:bg-red-50 text-red-400 hover:text-red-500 rounded-lg transition-colors"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </motion.div>
                                    ))
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center text-slate-300 p-8 text-center gap-4">
                                        <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center">
                                            <ShoppingCart className="w-10 h-10" />
                                        </div>
                                        <p className="text-sm font-black uppercase tracking-widest">El carrito está vacío</p>
                                    </div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Footer / Summary */}
                        <div className="p-6 bg-white border-t border-slate-100 shadow-[0_-10px_30px_rgba(0,0,0,0.02)]">
                            <div className="space-y-2 mb-6">
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Subtotal</span>
                                    <span className="font-black text-slate-600">${posCart.reduce((acc, item) => acc + (item.price * item.quantity), 0).toFixed(2)}</span>
                                </div>
                                {posOrderType === 'delivery' && (
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Envío</span>
                                        <span className="font-black text-slate-600">${posDeliveryFee.toFixed(2)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between items-center pt-2">
                                    <span className="text-slate-900 font-black uppercase tracking-widest text-xs">Total</span>
                                    <span className="text-3xl font-black text-primary">${(posCart.reduce((acc, item) => acc + (item.price * item.quantity), 0) + (posOrderType === 'delivery' ? posDeliveryFee : 0)).toFixed(2)}</span>
                                </div>
                            </div>

                            <button
                                onClick={handleCreatePOSOrder}
                                disabled={isSubmittingPOS || posCart.length === 0}
                                className="w-full bg-slate-900 text-white py-5 rounded-3xl font-black text-xl shadow-2xl hover:bg-black hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-3"
                            >
                                {isSubmittingPOS ? (
                                    <Loader2 className="w-6 h-6 animate-spin" />
                                ) : (
                                    <>
                                        {posEditingOrderId ? 'Actualizar Orden' : 'Confirmar Pedido'}
                                        <Check className="w-6 h-6" />
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* SELECTION MODAL (Varianter / Notes) */}
            {selectionModalOpen && selectedProductForSelection && (
                <div className="fixed inset-0 z-[250] flex items-end sm:items-center justify-center bg-slate-900/40 backdrop-blur-sm p-0 sm:p-4">
                    <motion.div 
                        initial={{ opacity: 0, y: 100 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white w-full max-w-xl h-[90vh] sm:h-auto sm:max-h-[85vh] rounded-t-[3rem] sm:rounded-[3rem] shadow-2xl overflow-hidden flex flex-col"
                    >
                        {/* Cover Image/Header */}
                        <div className="relative h-64 sm:h-72 shrink-0">
                            {selectedProductForSelection.image ? (
                                <img src={selectedProductForSelection.image} className="w-full h-full object-cover" alt={selectedProductForSelection.name} />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-slate-300">
                                    <Package className="w-16 h-16" />
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

                        <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6 custom-scrollbar">
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
                            {selectedProductForSelection.variants && selectedProductForSelection.variants.length > 0 && (
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Selecciona una Variante</label>
                                    <div className="grid grid-cols-1 gap-2">
                                        {selectedProductForSelection.variants.map((variant: any, idx: number) => (
                                            <button
                                                key={idx}
                                                onClick={() => setSelectionVariant(variant)}
                                                className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all font-bold ${
                                                    selectionVariant?.name === variant.name 
                                                    ? 'border-primary bg-primary/5 text-primary' 
                                                    : 'border-slate-100 text-slate-600 hover:border-slate-200'
                                                }`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selectionVariant?.name === variant.name ? 'border-primary bg-primary' : 'border-slate-300'}`}>
                                                        {selectionVariant?.name === variant.name && <div className="w-2 h-2 bg-white rounded-full" />}
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
                                            className="w-12 h-12 flex items-center justify-center bg-white rounded-xl shadow-sm text-primary hover:text-primary-dark"
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
                                    if (selectedProductForSelection.variants && selectedProductForSelection.variants.length > 0 && !selectionVariant) {
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
                                className="w-full bg-primary text-white py-5 rounded-2xl font-black text-lg shadow-xl shadow-primary/30 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3"
                            >
                                <ShoppingCart className="w-6 h-6" />
                                Agregar al Pedido • ${( (selectionVariant ? selectionVariant.price : (selectedProductForSelection.promoPrice > 0 ? selectedProductForSelection.promoPrice : (selectedProductForSelection.price || 0))) * selectionQty ).toFixed(2)}
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}

            {/* MODAL DE ACEPTACIÓN / VERIFICACIÓN */}
            {acceptModalOpen && selectedOrderForAccept && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm px-4">
                    <div className="bg-white rounded-[2.5rem] p-8 w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-black text-slate-900">Verificar y Cocina</h3>
                            <button onClick={() => setAcceptModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-2">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="space-y-6">
                            {/* Payment Method Selector */}
                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Método de Pago Confirmado</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {['Efectivo', 'Pago Móvil', 'Punto de Venta', 'Transferencia', 'Zelle', 'Crédito (2x3)'].map((method) => (
                                        <button
                                            key={method}
                                            onClick={() => setPaymentMethod(method)}
                                            className={`p-3 rounded-2xl text-[10px] font-black transition-all border-2 uppercase tracking-tighter ${
                                                paymentMethod === method 
                                                ? 'border-primary bg-primary/5 text-primary' 
                                                : 'border-slate-100 bg-white text-slate-600 hover:border-slate-200'
                                            }`}
                                        >
                                            {method}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Reference Input for Digital Payments */}
                            {(paymentMethod === 'Pago Móvil' || paymentMethod === 'Transferencia' || paymentMethod === 'Zelle') && (
                                <motion.div 
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="space-y-4"
                                >
                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Referencia / ID</label>
                                        <input 
                                            type="text"
                                            placeholder="Últimos 6 dígitos..."
                                            value={referenceInputs[selectedOrderForAccept.id] || ''}
                                            onChange={(e) => setReferenceInputs(prev => ({ ...prev, [selectedOrderForAccept.id]: e.target.value }))}
                                            className="w-full bg-slate-50 border border-slate-200 p-4 rounded-2xl outline-none focus:border-primary font-bold text-slate-700"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Comprobante de Pago</label>
                                        <div className="relative group/upload">
                                            <input
                                                type="file"
                                                accept="image/*"
                                                onChange={(e) => {
                                                    const file = e.target.files?.[0];
                                                    if (file) setProofUploadFiles(prev => ({ ...prev, [selectedOrderForAccept.id]: file }));
                                                }}
                                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                            />
                                            <div className="w-full border-2 border-dashed border-slate-200 rounded-2xl p-4 flex items-center justify-center gap-2 bg-slate-50 group-hover/upload:bg-white group-hover/upload:border-primary/30 transition-all">
                                                {proofUploadFiles[selectedOrderForAccept.id] ? (
                                                    <div className="flex items-center gap-2 text-primary font-bold text-xs">
                                                        <CheckCircle className="w-4 h-4" /> Archivo seleccionado
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-2 text-slate-400 font-bold text-xs">
                                                        <Plus className="w-4 h-4" /> Adjuntar captura
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            )}

                            <button
                                onClick={handleConfirmAccept}
                                disabled={isAccepting || !paymentMethod}
                                className="w-full bg-primary text-white py-5 rounded-[2rem] font-black shadow-xl shadow-primary/30 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {isAccepting ? <Loader2 className="w-5 h-5 animate-spin" /> : <><CheckCircle className="w-5 h-5" /> Confirmar y Enviar</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* VISTA PREVIA COMANDA (AFTER ACCEPT) */}
            {selectedOrderForComanda && (
                <ComandaPreview
                    order={selectedOrderForComanda as any}
                    restaurantName={restaurant?.name || 'Deliexpress'}
                    onClose={() => setSelectedOrderForComanda(null)}
                    onPrint={async (orderToPrint) => {
                        await handlePrintOrder(orderToPrint.id, orderToPrint as any);
                    }}
                />
            )}
        </div>
    );
}
