import React, { useState, useEffect } from 'react';
import { Search, Filter, Clock, MapPin, ChevronRight, Bike, Truck, CheckCircle, Loader2, Bell, ExternalLink, X, ShoppingCart, Plus, Minus, Trash2, User, CreditCard, Store, ShoppingBag, Users, Upload, Image as ImageIcon, DollarSign, Edit } from 'lucide-react';
import { db } from '../../lib/firebase';
import { collection, query, where, onSnapshot, orderBy, doc, updateDoc, getDocs, increment, addDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { printToUsbDevice, formatTicket, PrintOrder } from '../../lib/usb-printer';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import ComandaPreview from '../components/ComandaPreview';
import OrderChatWindow from '../../components/chat/OrderChatWindow';

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
    status: 'pending' | 'pendiente_pago' | 'preparing' | 'delivering' | 'delivered' | 'rejected';
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
    const [activeTab, setActiveTab] = useState<'pending' | 'pendiente_pago' | 'preparing' | 'delivering' | 'delivered' | 'rejected' | 'tables'>('pending');
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
    
    // Radar UI State
    const [radarOrderId, setRadarOrderId] = useState<string | null>(null);

    // Payment Proofs State
    const [referenceInputs, setReferenceInputs] = useState<Record<string, string>>({});
    const [proofUploadFiles, setProofUploadFiles] = useState<Record<string, File>>({});
    const [isUploadingProof, setIsUploadingProof] = useState<Record<string, boolean>>({});

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

    const handleCloseSale = async () => {
        if (!selectedOrderForClose) return;
        setIsAccepting(true);
        try {
            const updates: any = {
                paymentMethod: paymentMethod,
                paymentStatus: 'sold',
                tip: closeTip,
                total: selectedOrderForClose.subtotal + ((selectedOrderForClose as any).deliveryFee || 0) + closeTip
            };
            await updateDoc(doc(db, 'orders', selectedOrderForClose.id), updates);
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
             const usersRef = collection(db, 'users');
             const q = query(usersRef, where('role', '==', 'delivery'));
             const snap = await getDocs(q);
             setDrivers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        };
        fetchDrivers();

        if (user) {
            // Real-time Tables for Admin
            const tablesRef = collection(db, 'restaurants', user.uid, 'tables');
            const unsubscribeTables = onSnapshot(tablesRef, (snapshot) => {
                const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                data.sort((a: any, b: any) => {
                    const numA = parseInt(a.number, 10);
                    const numB = parseInt(b.number, 10);
                    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
                    return (a.number || '').localeCompare(b.number || '');
                });
                setTables(data);
            });

            // Fetch Waiters
            const fetchWaiters = async () => {
                const waitersRef = collection(db, 'restaurants', user.uid, 'waiters');
                const snap = await getDocs(waitersRef);
                setWaiters(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            };
            fetchWaiters();

            return () => unsubscribeTables();
        }
    }, [user]);

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

        fetchPosProducts();
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
            const hasNewPending = items.some(o => (o.status === 'pending' || o.status === 'pendiente_pago') && (!orders.find(prev => prev.id === o.id)));
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
                    const printData = {
                        id: orderData.id,
                        userName: orderData.userName,
                        items: itemsForThisPrinter.map(i => ({ name: i.name, quantity: i.quantity, price: i.price, notes: (i as any).notes })),
                        stationName: printer.name,
                        createdAt: orderData.createdAt?.toDate ? orderData.createdAt.toDate() : new Date(),
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
                paymentMethod: paymentMethod,
                paymentStatus: (paymentMethod === 'Crédito (2x3)') ? 'pending' : 'sold'
            };

            // Process optional Pago Móvil reference and screenshot
            if (paymentMethod === 'Pago Móvil') {
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
            
            setAcceptModalOpen(false);
            setSelectedOrderForAccept(null);
            
            // Mostrar modal de vista previa de comanda en lugar de imprimir directo
            setSelectedOrderForComanda(orderTemp as Order);
            
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
            const updates: any = {};
            if (dispatchType === 'platform') {
                updates.status = 'buscando_piloto';
                // Trigger backend search
            } else {
                updates.status = 'delivering';
            }

            const orderRef = doc(db, 'orders', selectedOrderForDispatch.id);
            await updateDoc(orderRef, updates);
            
            if (dispatchType === 'platform') {
                setRadarOrderId(selectedOrderForDispatch.id);
            }

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
            const orderRef = doc(db, 'orders', orderId);
            const missing = missingItemsByOrder[orderId] || [];
            
            if (missing.length > 0) {
                // Hay items faltantes, pasar a action_required
                await updateDoc(orderRef, { 
                    status: 'action_required', 
                    missingItems: missing,
                    stockConfirmed: true 
                });
                
                const orderTemp = orders.find(o => o.id === orderId);
                const missingNames = orderTemp?.items
                    .filter(i => missing.includes(i.id))
                    .map(i => i.name)
                    .join(', ');

                await addDoc(collection(db, `orders/${orderId}/messages`), {
                    text: `⚠️ *Atención:* Lamentablemente no contamos con stock de: *${missingNames}*. Por favor, selecciona una opción en tu pantalla para continuar con el pedido.`,
                    senderId: user.uid,
                    senderName: 'Restaurante',
                    senderRole: 'restaurant',
                    createdAt: serverTimestamp()
                });
                
                toast.success("Pedido marcado con falta de stock. El cliente ha sido notificado.");
            } else {
                // Stock completo, permitir pago
                await updateDoc(orderRef, { 
                    status: 'awaiting_payment',
                    stockConfirmed: true 
                });

                // Enviar mensaje de pago
                const restaurantRef = doc(db, 'restaurants', user.uid);
                const restaurantSnap = await getDoc(restaurantRef);
                
                if (restaurantSnap.exists()) {
                    const restaurantData = restaurantSnap.data();
                    const methods = restaurantData.paymentMethods || [];
                    
                    let paymentMsg = "✅ *Stock confirmado.* Ya puedes realizar tu pago:\n\n";
                    if (methods.length > 0) {
                        methods.forEach((m: any) => {
                            paymentMsg += `*${m.type}:*\n${m.bank ? 'Banco: ' + m.bank + '\n' : ''}${m.phone ? 'Tlf: ' + m.phone + '\n' : ''}${m.rif ? 'RIF/CI: ' + m.rif + '\n' : ''}${m.owner ? 'Titular: ' + m.owner + '\n' : ''}${m.email ? 'Correo: ' + m.email + '\n' : ''}\n`;
                        });
                        paymentMsg += "Favor enviar el capture y la referencia por este medio.\n\n_Hemos verificado tu pedido puedes proceder a realizar el pago_";
                    } else {
                        paymentMsg += "Por favor contacta con el restaurante para los métodos de pago.";
                    }

                    await addDoc(collection(db, `orders/${orderId}/messages`), {
                        text: paymentMsg,
                        senderId: user.uid,
                        senderName: 'Restaurante',
                        senderRole: 'restaurant',
                        createdAt: serverTimestamp()
                    });
                }
                toast.success("Stock confirmado. El cliente ahora puede pagar.");
            }
        } catch (error) {
            console.error("Error confirming stock:", error);
            toast.error("Error al confirmar stock");
        }
    };

    const handleVerifyPayment = async (orderId: string) => {
        try {
            const orderRef = doc(db, 'orders', orderId);
            const orderTemp = orders.find(o => o.id === orderId);
            await updateDoc(orderRef, { 
                status: 'preparing',
                paymentStatus: 'paid',
                verifiedAt: serverTimestamp()
            });
            toast.success("Pago verificado. Orden enviada a cocina.");
            
            if (orderTemp) {
                await handlePrintOrder(orderId, orderTemp as any);

                // Si hay un piloto asignado, le enviamos una alerta de que el pago fue verificado
                if (orderTemp.deliveryDriverId) {
                    await addDoc(collection(db, `orders/${orderId}/messages`), {
                        text: "🔔 *Pago verificado.* El cliente ha pagado el pedido y el restaurante está preparando. Piloto, mantente atento para el despacho.",
                        senderId: user.uid,
                        senderName: 'Sistema',
                        senderRole: 'admin',
                        createdAt: serverTimestamp()
                    });
                }
            }
        } catch (error) {
            console.error("Error verifying payment:", error);
            toast.error("Error al verificar el pago");
        }
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
                    waiterId: selectedWaiter?.id || '',
                    waiterName: selectedWaiter?.name || '',
                    tableId: posOrderType === 'local' ? (selectedTable?.id || '') : '',
                    tableNumber: posOrderType === 'local' ? (selectedTable?.number || '') : '',
                    updatedAt: serverTimestamp()
                });
                targetOrderRefId = posEditingOrderId;
                toast.success("Pedido actualizado");
            } else {
                // Create new order
                const newOrderRef = await addDoc(collection(db, 'orders'), {
                    restaurantId: user.uid,
                    userId: 'pos_customer',
                    userName: posClientName || 'Cliente en mostrador',
                    clientId: posClientDNI || '',
                    items,
                    total,
                    status: 'preparing',
                    paymentStatus: posOrderType === 'local' ? 'paid' : 'sold', // Local needs to stay active for table status
                    createdAt: serverTimestamp(),
                    deliveryAddress: deliveryAddressStr,
                    source: 'pos',
                    type: posOrderType,
                    deliveryFee: posDeliveryFee,
                    waiterId: selectedWaiter?.id || '',
                    waiterName: selectedWaiter?.name || '',
                    tableId: posOrderType === 'local' ? (selectedTable?.id || '') : '',
                    tableNumber: posOrderType === 'local' ? (selectedTable?.number || '') : '',
                });
                targetOrderRefId = newOrderRef.id;
                toast.success("Pedido creado");
            }

            // Update Table Status if local
            if (posOrderType === 'local' && selectedTable) {
                const tableRef = doc(db, 'restaurants', user.uid, 'tables', selectedTable.id);
                await updateDoc(tableRef, {
                    status: 'occupied',
                    lastOrderId: targetOrderRefId,
                    waiterId: selectedWaiter?.id || '',
                    waiterName: selectedWaiter?.name || ''
                });
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

            // Mostramos la vista previa antes de mandar a la impresora
            setSelectedOrderForComanda(printData);

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
        pending: orders.filter(o => o.status === 'pending' || o.status === 'pendiente_pago' || o.status === 'calling').length,
        preparing: orders.filter(o => o.status === 'preparing').length,
        delivering: orders.filter(o => o.status === 'delivering').length,
        delivered: orders.filter(o => o.status === 'delivered').length,
        rejected: orders.filter(o => o.status === 'rejected').length,
        tables: tables.length
    };

    const filteredOrders = orders
        .filter(o => {
            if (activeTab === 'pending') return (o.status === 'pending' || o.status === 'pendiente_pago' || o.status === 'calling');
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
        if (!user) return;
        try {
            const tableRef = doc(db, 'restaurants', user.uid, 'tables', tableId);
            await updateDoc(tableRef, {
                waiterId: waiter ? waiter.id : '',
                waiterName: waiter ? waiter.name : '',
                status: waiter ? 'occupied' : 'free'
            });

            // Si hay una orden activa en esta mesa, actualizarla también
            const activeOrder = orders.find(o => o.tableId === tableId && (o.status === 'occupied' || o.status === 'calling' || o.status === 'preparing'));
            if (activeOrder) {
                await updateDoc(doc(db, 'orders', activeOrder.id), {
                    waiterId: waiter ? waiter.id : '',
                    waiterName: waiter ? waiter.name : ''
                });
            }

            setShowTableModal(false);
            setSelectedTable(null);
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
    const renderOrderCard = (order: any) => (
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
                            <span className="bg-yellow-400 text-black text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-widest flex items-center gap-1">
                                Mesero
                            </span>
                        ) : (
                            <span className="bg-yellow-400 text-black text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-widest flex items-center gap-1">
                                App
                            </span>
                        )}
                    </div>
                    <h3 className="text-xl font-black text-slate-900">{order.userName || 'Usuario de Deliexpress'}</h3>
                    <p className="text-sm text-slate-400 font-bold flex items-center gap-1 mt-1">
                        <Clock className="w-4 h-4" />
                        {order.createdAt?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                </div>
                <div className="text-right">
                    <p className="text-2xl font-black text-slate-900">${order.total.toFixed(2)}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Cobrado</p>
                </div>
            </div>

            <div className="space-y-3 mb-6">
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

            <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-2xl mb-8">
                <MapPin className="w-5 h-5 text-slate-900 shrink-0" />
                <p className="text-sm font-bold text-slate-600 leading-relaxed italic">{order.deliveryAddress}</p>
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
                                <button 
                                    onClick={() => window.open(order.paymentProofUrl, '_blank')}
                                    className="w-full flex items-center justify-center gap-2 py-2 bg-white rounded-xl text-xs font-black text-slate-600 hover:bg-slate-100 transition-colors border border-slate-200 shadow-sm"
                                >
                                    <ImageIcon className="w-4 h-4" />
                                    Ver Comprobante
                                </button>
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
                {(order.status === 'pending' || order.status === 'pendiente_pago' || order.status === 'pending_verification') && (
                    <>
                        <button
                            onClick={() => setChatOrderId(order.id)}
                            className="px-6 bg-slate-100 text-slate-500 py-4 rounded-2xl font-black hover:bg-slate-200 transition-all flex items-center justify-center gap-2"
                            title="Chatear"
                        >
                            <Bell className="w-5 h-5" />
                        </button>
                        {order.status === 'pending_verification' ? (
                            <button
                                onClick={() => handleVerifyPayment(order.id)}
                                className="flex-1 bg-primary text-slate-900 py-4 rounded-2xl font-black shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                            >
                                <CheckCircle className="w-5 h-5" /> Aceptar Pago
                            </button>
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
                        <button
                            onClick={() => updateStatus(order.id, 'rejected')}
                            className="px-6 bg-slate-100 text-slate-500 py-4 rounded-2xl font-black hover:bg-red-50 hover:text-red-500 transition-all"
                        >
                            Rechazar
                        </button>
                    </>
                )}
                {order.status === 'preparing' && (
                    order.source === 'waiter' ? (
                        <button
                            onClick={() => updateStatus(order.id, 'delivered')}
                            className="flex-1 bg-primary text-slate-900 py-4 rounded-2xl font-black shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                        >
                            Entregar a Mesa
                        </button>
                    ) : (order.deliveryAddress === 'PickUp' || order.type === 'takeout') ? (
                        <button
                            onClick={() => updateStatus(order.id, 'delivered', 'sold')}
                            className="flex-1 bg-green-500 text-white py-4 rounded-2xl font-black shadow-lg shadow-green-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                        >
                            <CheckCircle className="w-5 h-5" /> Venta Realizada (PickUp)
                        </button>
                    ) : (
                        <button
                            onClick={() => { setSelectedOrderForDispatch(order); setDispatchModalOpen(true); }}
                            disabled={printingOrderId === order.id}
                            className="flex-1 bg-primary text-slate-900 py-4 rounded-2xl font-black shadow-lg shadow-blue-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {printingOrderId === order.id ? (
                                <><Loader2 className="w-5 h-5 animate-spin" /> Imprimiendo...</>
                            ) : (
                                <>Enviar Pedido</>
                            )}
                        </button>
                    )
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
                {order.status === 'delivered' && order.paymentStatus === 'pending' && order.source === 'waiter' && (
                    <button
                        onClick={() => { setSelectedOrderForClose(order); setCloseSaleModalOpen(true); }}
                        className="w-full bg-emerald-500 text-white py-4 rounded-2xl font-black shadow-lg shadow-emerald-500/20 hover:bg-emerald-600 transition-all flex items-center justify-center gap-2"
                    >
                        <DollarSign className="w-5 h-5" /> Cerrar Venta y Cobrar
                    </button>
                )}
                <button 
                  onClick={() => setChatOrderId(order.id)}
                  className="p-4 bg-slate-100 text-slate-400 rounded-2xl hover:bg-slate-200 transition-colors"
                >
                    <Bell className="w-5 h-5" />
                </button>
                {chatOrderId === order.id && (
                    <OrderChatWindow
                        orderId={order.id}
                        onClose={() => setChatOrderId(null)}
                    />
                )}
            </div>
        </div>
    );

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

            {/* Status Tabs */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 p-2 bg-slate-100 rounded-[30px]">
                {[
                    { id: 'pending', label: 'Pendientes', icon: Bell, color: 'bg-emerald-500' },
                    { id: 'delivering', label: 'Camino', icon: Truck, color: 'bg-emerald-700' },
                    { id: 'delivered', label: 'Entregados', icon: CheckCircle, color: 'bg-emerald-500' },
                    { id: 'tables', label: 'Mesas', icon: Users, color: 'bg-primary' },
                    { id: 'rejected', label: 'Rechazados', icon: X, color: 'bg-slate-500' },
                ].map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`flex items-center justify-center gap-2 p-4 rounded-[25px] font-black transition-all ${activeTab === tab.id
                            ? 'bg-white shadow-lg text-slate-900'
                            : 'text-slate-500 hover:bg-white/50'
                            }`}
                    >
                        <tab.icon className={`w-5 h-5 ${activeTab === tab.id ? 'text-slate-900' : ''}`} />
                        <span className="hidden xl:inline">{tab.label}</span>
                        <span className={`ml-1 text-[10px] px-2 py-0.5 rounded-full ${tab.id === 'tables' ? 'bg-slate-900 text-white' : 'text-white ' + tab.color}`}>
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
                                <h2 className="text-xl font-black text-emerald-500 flex items-center gap-2 uppercase tracking-widest bg-emerald-50 px-6 py-2 rounded-full border border-emerald-100">
                                    <Truck className="w-6 h-6" /> 🚚 App / Delivery Express ({filteredOrders.filter(o => o.source !== 'waiter').length})
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
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4">
                    <div className="bg-white rounded-[40px] p-8 w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
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
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
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
                                    <div className="bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden h-[400px]">
                                        <OrderChatWindow 
                                            orderId={selectedOrderForAccept.id} 
                                            currentUserRole="restaurant" 
                                            currentUserId={user?.uid || 'admin'}
                                            currentUserName={user?.email === 'admin@un2x3.com' ? 'Administración 2x3' : 'Caja Central'} 
                                            restaurantId={user?.uid!} // Or get from order.restaurantId if it's the admin panel
                                            orderInfo={selectedOrderForAccept}
                                        />
                                    </div>
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
                                className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 font-bold transition-all ${dispatchType === 'own' ? 'border-primary bg-primary/5 text-slate-900' : 'border-slate-100 text-slate-500 hover:bg-slate-50'}`}
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

                        {dispatchType === 'platform' ? (
                            <div className="mb-6 flex flex-col items-center justify-center p-6 bg-slate-50 rounded-2xl border border-slate-200">
                                <div className="w-16 h-16 bg-blue-100 text-blue-500 rounded-full flex items-center justify-center mb-4 relative">
                                    <div className="absolute inset-0 bg-blue-400 rounded-full animate-ping opacity-20"></div>
                                    <Truck className="w-8 h-8 relative z-10" />
                                </div>
                                <h4 className="font-black text-slate-800 text-center mb-2">Asignación por Radar</h4>
                                <p className="text-xs text-slate-500 text-center leading-relaxed">
                                    Se buscará automáticamente al motorizado más cercano en un radio de 15km usando el sistema de Radar.
                                </p>
                            </div>
                        ) : null}

                        <button
                            onClick={handleConfirmDispatch}
                            disabled={isAccepting}
                            className={`w-full text-slate-900 py-4 rounded-2xl font-black shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 ${dispatchType === 'platform' ? 'bg-primary shadow-blue-500/20' : 'bg-primary shadow-primary/20'}`}
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
                                                        className={`px-3 py-2 rounded-xl text-xs font-black whitespace-nowrap transition-all border ${selectedWaiter?.id === waiter.id ? 'bg-primary text-slate-900 border-primary' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
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
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm px-4">
                    <div className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col items-center text-center">
                        {(() => {
                            const radarOrder = orders.find(o => o.id === radarOrderId);
                            const isFound = radarOrder && (radarOrder.status === 'delivering' || radarOrder.status as any === 'asignado');
                            
                            return (
                                <>
                                    <div className="relative w-32 h-32 mb-6 flex items-center justify-center">
                                        {isFound ? (
                                            <div className="w-24 h-24 bg-green-100 text-green-500 rounded-full flex items-center justify-center animate-in zoom-in duration-300">
                                                <CheckCircle className="w-12 h-12" />
                                            </div>
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
                                        {isFound ? '¡Piloto Encontrado!' : 'Buscando Delivery...'}
                                    </h3>
                                    
                                    <p className="text-sm text-slate-500 mb-8 max-w-[250px] mx-auto leading-relaxed">
                                        {isFound 
                                            ? `El motorizado ${radarOrder?.waiterName || ''} ha aceptado el pedido y está en camino.` 
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
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-md px-4 p-4">
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        className="bg-white rounded-[2.5rem] w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
                    >
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
        </div >
    );
}
