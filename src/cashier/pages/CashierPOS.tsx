import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { doc, getDoc, collection, getDocs, setDoc, updateDoc, serverTimestamp, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { ArrowLeft, Plus, Minus, Trash2, ShoppingBag, CheckCircle, Loader2, Star, Clock, Store, Truck, X, Tag, MessageSquare, MapPin, Instagram, Youtube, Music2, ExternalLink, Search, LayoutGrid, List } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReviewsModal from '../components/ReviewsModal';
import { printToUsbDevice, formatTicket, downloadTicketImage, downloadTicketText, formatTicketText } from '../../lib/usb-printer';
import AddressPicker from '../../components/AddressPicker';
import toast from 'react-hot-toast';

export default function CashierPOS() {
    const navigate = useNavigate();
    const { orderId } = useParams();
    const location = useLocation();
    const navState = location.state as { table: string, waiter: { id: string, name: string } } | null;
    
    const [restaurant, setRestaurant] = useState<any>(null);
    const [products, setProducts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeCategory, setActiveCategory] = useState<string>('Todos');
    
    const [cartItems, setCartItems] = useState<any[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const [waiterOrderInfo, setWaiterOrderInfo] = useState<any>(null);
    const [showCheckoutModal, setShowCheckoutModal] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState('');
    const [isDelivery, setIsDelivery] = useState(false);
    const [deliveryAddress, setDeliveryAddress] = useState('');
    const [selectedAddress, setSelectedAddress] = useState<any>(null);
    const [showMapPicker, setShowMapPicker] = useState(false);

    const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
    const [selectedVariant, setSelectedVariant] = useState<any | null>(null);
    const [itemNotes, setItemNotes] = useState('');

    const [tables, setTables] = useState<any[]>([]);
    const [showTableModal, setShowTableModal] = useState(false);
    const [selectedTable, setSelectedTable] = useState<any | null>(null);
    const [activeOrder, setActiveOrder] = useState<any | null>(null);
    const [showPrintModal, setShowPrintModal] = useState(false);
    const [newItemsToPrint, setNewItemsToPrint] = useState<any[]>([]);
    const [paymentStatus, setPaymentStatus] = useState<'sold' | 'pending'>('sold');
    const [showReviewsModal, setShowReviewsModal] = useState(false);
    const [showHoursModal, setShowHoursModal] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [stations, setStations] = useState<any[]>([]);
    const [selectedPrinterId, setSelectedPrinterId] = useState<string>('auto');

    const restaurantId = localStorage.getItem('cashierRestaurantId');
    const cashierDataRaw = localStorage.getItem('cashierData');
    const cashierData = cashierDataRaw ? JSON.parse(cashierDataRaw) : { name: 'Cajera', id: 'local' };

    useEffect(() => {
        const fetchData = async () => {
            if (!restaurantId) return;

            try {
                // Fetch Restaurant info
                const resDoc = await getDoc(doc(db, 'restaurants', restaurantId));
                if (resDoc.exists()) {
                    setRestaurant({ id: resDoc.id, ...resDoc.data() });
                }

                // Fetch Products
                const productsRef = collection(db, 'restaurants', restaurantId, 'products');
                const productsSnap = await getDocs(productsRef);
                const fetchedProducts = productsSnap.docs.map(p => ({ id: p.id, ...p.data() }));
                setProducts(fetchedProducts);

                // Fetch Tables
                const tablesRef = collection(db, 'restaurants', restaurantId, 'tables');
                const tablesSnap = await getDocs(tablesRef);
                setTables(tablesSnap.docs.map(d => ({ id: d.id, ...d.data() })));

                // Fetch Printer Stations
                const stationsRef = collection(db, 'restaurants', restaurantId, 'printers');
                const stationsSnap = await getDocs(stationsRef);
                setStations(stationsSnap.docs.map(d => ({ id: d.id, ...d.data() })));

                // Fetch Order if editing specifically by ID
                if (orderId) {
                    const orderDoc = await getDoc(doc(db, 'orders', orderId));
                    if (orderDoc.exists()) {
                        const data = orderDoc.data();
                        loadOrderToPOS(orderDoc.id, data);
                    }
                }
            } catch (error) {
                console.error("Error fetching POS data", error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [restaurantId, orderId]);

    // Handle navigation state for table/waiter assignment
    useEffect(() => {
        if (navState && tables.length > 0) {
            const tableObj = tables.find(t => t.number === navState.table);
            if (tableObj) {
                setSelectedTable(tableObj);
                setWaiterOrderInfo(navState.waiter);
            }
        }
    }, [navState, tables]);

    const loadOrderToPOS = (id: string, data: any) => {
        setActiveOrder({ id, ...data });
        setCartItems(data.items || []);
        if (data.table) {
            const tableObj = tables.find(t => t.number === data.table) || { number: data.table };
            setSelectedTable(tableObj);
        }
    };

    const handleTableSelect = async (table: any) => {
        setSelectedTable(table);
        setShowTableModal(false);
        
        // Search for active order on this table
        try {
            const ordersRef = collection(db, 'orders');
            const q = query(
                ordersRef, 
                where("restaurantId", "==", restaurantId),
                where("table", "==", table.number),
                where("status", "in", ["preparing", "ready"])
            );
            const querySnap = await getDocs(q);
            
            if (!querySnap.empty) {
                const orderDoc = querySnap.docs[0];
                loadOrderToPOS(orderDoc.id, orderDoc.data());
            } else {
                setActiveOrder(null);
                setCartItems([]);
            }
        } catch (err) {
            console.error("Error checking active orders for table:", err);
        }
    };

    const categories = ['Todos', ...Array.from(new Set(products.map(p => p.category)))];

    const filteredProducts = products.filter(p => {
        const query = searchTerm.toLowerCase();
        const matchesCategory = activeCategory === 'Todos' || p.category === activeCategory;
        const matchesSearch = p.name.toLowerCase().includes(query) || 
                            (p.category && p.category.toLowerCase().includes(query)) ||
                            (p.description && p.description.toLowerCase().includes(query));
        return matchesCategory && matchesSearch && p.isAvailable !== false;
    });

    const subtotal = (cartItems || []).reduce((acc: number, item: any) => acc + (item.price * item.quantity), 0);
    const total = subtotal + (isDelivery ? (restaurant?.deliveryFee || 0) : 0);

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
    const handleProductClick = (product: any) => {
        setSelectedProduct(product);
        setSelectedVariant(null);
        setItemNotes('');
    };

    const confirmAddToCart = () => {
        if (!selectedProduct) return;
        
        let finalPrice = selectedProduct.promoPrice && selectedProduct.promoPrice > 0 
            ? selectedProduct.promoPrice : selectedProduct.price;
        let finalName = selectedProduct.name;
        
        if (selectedProduct.variants && selectedProduct.variants.length > 0) {
            if (!selectedVariant) {
                alert("Por favor selecciona una variante");
                return;
            }
            finalPrice = selectedVariant.price;
            finalName = `${selectedProduct.name} (${selectedVariant.name})`;
        }

        const cartItemId = `${selectedProduct.id}-${selectedVariant ? selectedVariant.name : 'default'}-${Date.now()}`;

        setCartItems(prev => [...prev, {
            id: cartItemId,
            productId: selectedProduct.id,
            name: finalName,
            price: finalPrice,
            quantity: 1,
            image: selectedProduct.image,
            category: selectedProduct.category,
            variantName: selectedVariant?.name,
            notes: itemNotes,
            printed: false, // Mark as NOT printed
            printerId: selectedProduct.printerId || ''
        }]);

        setSelectedProduct(null);
    };

    const updateQuantity = (cartId: string, delta: number) => {
        setCartItems(prev => prev.map(item => {
            if (item.id === cartId) {
                const newQuantity = Math.max(0, item.quantity + delta);
                return { ...item, quantity: newQuantity };
            }
            return item;
        }).filter(item => item.quantity > 0));
    };

    const handleSaveOrderPlan = async () => {
        if (!restaurantId || cartItems.length === 0) return;
        
        // Items that haven't been printed yet
        const toPrint = cartItems.filter(item => !item.printed);
        setNewItemsToPrint(toPrint);
        
        setShowCheckoutModal(true);
    };

    const handleConfirmPayment = async () => {
        if (paymentStatus === 'sold' && !paymentMethod) {
            alert("Seleccione un método de pago");
            return;
        }

        setIsSubmitting(true);
        try {
            const orderItems = cartItems.map(item => {
                const cleanedItem: any = { ...item };
                Object.keys(cleanedItem).forEach(key => {
                    if (cleanedItem[key] === undefined) {
                        delete cleanedItem[key];
                    }
                });
                return cleanedItem;
            });
            
            const commonData: any = {
                items: orderItems,
                subtotal: subtotal,
                total: total,
                status: 'preparing',
                paymentStatus: paymentStatus, // 'sold' or 'pending'
                paymentMethod: paymentStatus === 'sold' ? paymentMethod : 'none',
                updatedAt: serverTimestamp(),
                table: selectedTable?.number || waiterOrderInfo?.table || 'Sin Mesa',
                tableId: selectedTable?.id || '',
                waiterId: waiterOrderInfo?.id || '',
                waiterName: waiterOrderInfo?.name || '',
                cashierName: cashierData.name || 'Cajera POS',
                cashierId: cashierData.id || 'local'
            };

            if (isDelivery) {
                if (!selectedAddress) {
                    alert('Por favor selecciona una dirección de entrega válida.');
                    setIsSubmitting(false);
                    return;
                }
                const addressStr = `${selectedAddress.name} - ${selectedAddress.reference || "Sin referencia adicional"}`;
                commonData.isDelivery = true;
                commonData.deliveryAddress = addressStr;
                commonData.deliveryCoords = { lat: selectedAddress.lat, lng: selectedAddress.lng };
                commonData.deliveryFee = restaurant?.deliveryFee || 0;
            }

            let finalOrderId = activeOrder?.id || orderId;

            if (finalOrderId) {
                // Update existing order
                await updateDoc(doc(db, 'orders', finalOrderId), commonData);
            } else {
                // Create new order
                const newOrderRef = doc(collection(db, 'orders'));
                finalOrderId = newOrderRef.id;
                await setDoc(newOrderRef, {
                    ...commonData,
                    userId: 'local_walk_in',
                    restaurantId,
                    userName: 'Cliente Local',
                    source: 'pos',
                    createdAt: serverTimestamp(),
                });

                // Update Table status to occupied
                if (selectedTable) {
                    const tableRef = doc(db, 'restaurants', restaurantId, 'tables', selectedTable.id);
                    await updateDoc(tableRef, {
                        status: 'occupied',
                        lastOrderId: finalOrderId,
                        waiterId: waiterOrderInfo?.id || 'cashier',
                        waiterName: waiterOrderInfo?.name || 'Caja/Admin'
                    });
                }
            }

            // Set active order for printing
            setActiveOrder({ id: finalOrderId, ...commonData });
            
            setShowCheckoutModal(false);
            
            // If there's something new to print, show print modal
            if (newItemsToPrint.length > 0) {
                setShowPrintModal(true);
            } else {
                alert("Pedido procesado correctamente.");
                resetPOS();
            }
        } catch (error) {
            console.error("Error confirming local order:", error);
            alert("Hubo un error al procesar el pedido. Verifique su conexión.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handlePrintedCommand = async () => {
        if (!activeOrder) return;
        
        setIsSubmitting(true);
        try {
            const printResults = [];

            for (const item of newItemsToPrint) {
                let station;
                if (selectedPrinterId === 'virtual') {
                    station = { name: "Impresora Virtual", virtual: true };
                } else if (selectedPrinterId !== 'auto') {
                    station = stations.find(s => s.id === selectedPrinterId) || { name: 'Desconocida', virtual: true };
                } else {
                    station = stations.find(s => s.categories && s.categories.includes(item.category));
                }

                if (station) {
                    const printData = {
                        id: activeOrder.id,
                        userName: activeOrder.userName || 'Cliente Local',
                        userPhone: activeOrder.userPhone || '',
                        items: [item],
                        tableNumber: activeOrder.table || '',
                        stationName: station.name,
                        orderNote: item.notes,
                        createdAt: new Date()
                    };

                    let success = false;
                    
                    const triggerDownload = () => {
                        downloadTicketText(printData);
                        return true;
                    };

                    if ((station as any).virtual) {
                        success = triggerDownload();
                    } else if (station.vendorId && station.productId) {
                        try {
                            const ticketData = formatTicket(printData);
                            success = await printToUsbDevice(station.vendorId, station.productId, ticketData);
                            if (!success) {
                                console.warn("Physical print failed, falling back to virtual.");
                                success = triggerDownload();
                            }
                        } catch(e) {
                            success = triggerDownload();
                        }
                    } else {
                        success = triggerDownload();
                    }
                    
                    printResults.push({ item: item.name, station: station.name, success });
                } else {
                    console.warn(`No station configured for category: ${item.category}`);
                    printResults.push({ item: item.name, station: 'Ninguna', success: false });
                }
            }

            const updatedItems = cartItems.map(item => {
                const cleanedItem: any = { ...item, printed: true };
                Object.keys(cleanedItem).forEach(key => {
                    if (cleanedItem[key] === undefined) delete cleanedItem[key];
                });
                return cleanedItem;
            });
            
            await updateDoc(doc(db, 'orders', activeOrder.id), {
                items: updatedItems
            });
            
            const totalSuccess = printResults.filter(r => r.success).length;
            if (totalSuccess > 0) {
                toast.success(`${totalSuccess} comandas procesadas correctamente`);
            } else if (printResults.some(r => r.station !== 'Ninguna')) {
                toast.error("Error al procesar comandas.");
            } else {
                toast.success("Pedido actualizado (sin estaciones válidas configuradas)");
            }

            resetPOS();
        } catch (error) {
            console.error("Error marking as printed:", error);
            toast.error("Error al procesar la impresión");
        } finally {
            setIsSubmitting(false);
            setShowPrintModal(false);
        }
    };

    const resetPOS = () => {
        setCartItems([]);
        setSelectedTable(null);
        setActiveOrder(null);
        setNewItemsToPrint([]);
        setShowPrintModal(false);
        setPaymentMethod('');
        setIsDelivery(false);
        setDeliveryAddress('');
        setSelectedAddress(null);
        setShowCheckoutModal(false);
        setPaymentStatus('sold');
        navigate('/'); // Go back to dashboard after finish or cancel
    };

    if (loading) {
        return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
    }

    return (
        <div className="h-screen flex flex-col md:flex-row bg-slate-50 overflow-hidden">
            {/* Main Product Catalog */}
            <div className="flex-1 flex flex-col h-full overflow-hidden border-r border-slate-200 bg-white">
                
                {/* Restaurant Banner & Table Selector */}
                {restaurant && (
                    <div className="relative w-full h-32 md:h-40 shrink-0 bg-slate-100 overflow-hidden">
                        <div 
                            className="absolute inset-0 bg-cover bg-center"
                            style={{ backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.6) 100%), url("${restaurant.coverUrl || restaurant.image}")` }}
                        />
                        <div className="absolute inset-0 flex items-end p-4 gap-4">
                            <div className="w-16 h-16 md:w-20 md:h-20 bg-white rounded-2xl p-1 shadow-xl border-2 border-white overflow-hidden shrink-0 flex items-center justify-center">
                                <img src={restaurant.logoUrl} className="w-full h-full object-contain rounded-xl" alt="" />
                            </div>
                            <div className="flex-1 pb-1">
                                <h1 className="text-xl md:text-2xl font-black text-white leading-tight drop-shadow-md">{restaurant.name}</h1>
                                <div className="flex items-center gap-3 mt-1">
                                    <button 
                                        onClick={() => setShowTableModal(true)}
                                        className="flex items-center gap-2 bg-white/20 backdrop-blur-md px-3 py-1 rounded-full border border-white/20 hover:bg-white/30 transition-all"
                                    >
                                        <Store className="w-3 h-3 text-white" />
                                        <span className="text-[10px] font-black text-white uppercase tracking-wider">
                                            {selectedTable ? `Mesa: ${selectedTable.number}` : "Seleccionar Mesa"}
                                        </span>
                                    </button>
                                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-500/20 backdrop-blur-md border border-emerald-500/30 text-[10px] font-black uppercase text-emerald-400 tracking-wider">
                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></div>
                                        {statusObj.text}
                                    </div>
                                </div>
                            </div>
                        <button onClick={() => navigate('/')} className="absolute top-4 left-4 z-[100] w-10 h-10 bg-black/20 backdrop-blur-md rounded-full flex items-center justify-center hover:bg-black/30 text-white transition-all">
                            <ArrowLeft className="w-6 h-6" />
                        </button>
                        </div>
                    </div>
                )}

            {/* Restaurant Info Bar */}
            <div className="bg-slate-900 text-white px-6 py-3 flex items-center justify-between gap-4 overflow-x-auto hide-scrollbar shrink-0">
                <div className="flex items-center gap-6 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 ${statusObj.isOpen ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${statusObj.isOpen ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`}></div>
                            {statusObj.text}
                        </div>
                        <button 
                            onClick={() => setShowHoursModal(true)}
                            className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors"
                        >
                            <Clock className="w-3.5 h-3.5" />
                            <span className="text-xs font-bold whitespace-nowrap">
                                {statusObj.todaySchedule ? `${statusObj.todaySchedule.open} - ${statusObj.todaySchedule.close}` : 'Ver Horario'}
                            </span>
                        </button>
                    </div>

                    {restaurant?.location?.address && (
                        <div className="flex items-center gap-2 text-slate-400 max-w-xs">
                            <MapPin className="w-3.5 h-3.5 shrink-0" />
                            <span className="text-xs font-medium truncate">{restaurant.location.address}</span>
                        </div>
                    )}

                    {restaurant?.rating && (
                        <div className="flex items-center gap-1.5 bg-white/10 px-2.5 py-1 rounded-lg border border-white/5">
                            <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                            <span className="text-xs font-black">{restaurant.rating.toFixed(1)}</span>
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-4 shrink-0">
                    <div className="flex items-center gap-2">
                        {restaurant?.socialLinks?.map((link: any, i: number) => (
                            <a 
                                key={i}
                                href={link.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`w-8 h-8 rounded-xl flex items-center justify-center text-white transition-all hover:scale-110 active:scale-95 ${getSocialColor(link.url)}`}
                            >
                                {getSocialIcon(link.url)}
                            </a>
                        ))}
                    </div>

                    <div className="h-6 w-px bg-white/10 mx-1"></div>

                    <button 
                        onClick={() => setShowReviewsModal(true)}
                        className="flex items-center gap-2 bg-primary/10 hover:bg-primary/20 text-primary px-4 py-1.5 rounded-xl border border-primary/20 transition-all group"
                    >
                        <MessageSquare className="w-4 h-4 group-hover:scale-110 transition-transform" />
                        <span className="text-xs font-black uppercase tracking-wider">Reseñas</span>
                    </button>
                </div>
            </div>

                {/* Toolbar: Search & View Mode */}
                <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row gap-4 items-center justify-between bg-white shrink-0">
                    <div className="relative w-full sm:max-w-xs">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input 
                            type="text" 
                            placeholder="Buscar producto o categoría..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-[1.25rem] text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                        />
                        {searchTerm && (
                            <button 
                                onClick={() => setSearchTerm('')}
                                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>

                    <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-2xl shrink-0">
                        <button 
                            onClick={() => setViewMode('grid')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${viewMode === 'grid' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <LayoutGrid className="w-3.5 h-3.5" />
                            Cuadrícula
                        </button>
                        <button 
                            onClick={() => setViewMode('list')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${viewMode === 'list' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <List className="w-3.5 h-3.5" />
                            Lista
                        </button>
                    </div>
                </div>

                {/* Categories */}
                <div className="px-5 py-3 border-b border-slate-50 bg-slate-50/20 shrink-0 overflow-hidden">
                    <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-1">
                        {categories.map(cat => (
                            <button
                                key={cat}
                                onClick={() => setActiveCategory(cat)}
                                className={`px-5 py-2.5 rounded-2xl text-[10px] font-black whitespace-nowrap transition-all uppercase tracking-wider border ${
                                    activeCategory === cat ? 'bg-primary text-white border-primary shadow-lg shadow-primary/20 scale-105' : 'bg-white text-slate-500 border-slate-200 hover:border-primary/30'
                                }`}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Product Area */}
                <div className="flex-1 overflow-y-auto p-5 content-start transition-all duration-300">
                    {viewMode === 'grid' ? (
                        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-5">
                            {filteredProducts.map(product => {
                                const hasVariants = product.variants && product.variants.length > 0;
                                const displayPrice = hasVariants ? Math.min(...product.variants.map((v:any) => v.price)) : (product.promoPrice || product.price);
                                
                                return (
                                    <motion.div
                                        layout
                                        key={product.id}
                                        onClick={() => handleProductClick(product)}
                                        className="bg-white rounded-[2rem] border-2 border-slate-50 p-4 shadow-sm hover:shadow-xl hover:border-primary/10 transition-all cursor-pointer group flex flex-col"
                                    >
                                        <div className="w-full aspect-square bg-slate-50 rounded-2xl mb-4 overflow-hidden relative">
                                            {product.image && <img src={product.image} alt="" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />}
                                            <div className="absolute top-3 right-3 w-10 h-10 bg-white/90 backdrop-blur-sm text-primary rounded-2xl flex items-center justify-center shadow-lg transform translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all">
                                                <Plus className="w-6 h-6" />
                                            </div>
                                            {product.isAvailable === false && (
                                                <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] flex items-center justify-center">
                                                    <span className="bg-red-500 text-white text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest">Agotado</span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1">
                                            <h3 className="text-sm font-black text-slate-900 mb-1 leading-tight line-clamp-2">{product.name}</h3>
                                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-3">{product.category}</p>
                                        </div>
                                        <div className="flex items-center justify-between pt-2 border-t border-slate-50">
                                            <div className="flex flex-col">
                                                {hasVariants && <span className="text-[8px] font-black text-primary uppercase tracking-widest leading-none mb-1">Desde</span>}
                                                <span className="text-xl font-black text-slate-900 leading-none">${displayPrice.toFixed(2)}</span>
                                            </div>
                                            <div className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-primary group-hover:text-white transition-all">
                                                <Plus className="w-4 h-4" />
                                            </div>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="flex flex-col gap-3 max-w-4xl mx-auto">
                            {filteredProducts.map(product => {
                                const hasVariants = product.variants && product.variants.length > 0;
                                const displayPrice = hasVariants ? Math.min(...product.variants.map((v:any) => v.price)) : (product.promoPrice || product.price);
                                
                                return (
                                    <motion.div
                                        layout
                                        key={product.id}
                                        onClick={() => handleProductClick(product)}
                                        className="bg-white rounded-[1.75rem] border-2 border-slate-50 p-4 shadow-sm hover:shadow-md hover:border-primary/10 transition-all cursor-pointer group flex items-center gap-5"
                                    >
                                        <div className="w-20 h-20 bg-slate-50 rounded-2xl overflow-hidden shrink-0 relative">
                                            {product.image && <img src={product.image} alt="" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />}
                                            {product.isAvailable === false && (
                                                <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px] flex items-center justify-center">
                                                    <span className="text-[8px] font-black text-white uppercase tracking-tighter">Agotado</span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="text-base font-black text-slate-900 leading-tight truncate">{product.name}</h3>
                                            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-1">{product.category}</p>
                                            {product.description && <p className="text-xs text-slate-400 line-clamp-1 mt-1 font-medium">{product.description}</p>}
                                        </div>
                                        <div className="text-right shrink-0 px-4 border-l border-slate-50">
                                            {hasVariants && <div className="text-[8px] font-black text-primary uppercase tracking-widest mb-1 text-right">Desde</div>}
                                            <div className="text-2xl font-black text-slate-900 leading-none">${displayPrice.toFixed(2)}</div>
                                        </div>
                                        <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-primary group-hover:text-white transition-all shrink-0">
                                            <Plus className="w-6 h-6" />
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </div>
                    )}

                    {filteredProducts.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-24 text-center">
                            <div className="w-24 h-24 bg-slate-50 rounded-[2.5rem] flex items-center justify-center mb-6 border-2 border-slate-100/50">
                                <Search className="w-10 h-10 text-slate-200" />
                            </div>
                            <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">No hay resultados</h3>
                            <p className="text-sm font-bold text-slate-400 mt-1">Intenta con otro nombre o categoría</p>
                            <button 
                                onClick={() => { setSearchTerm(''); setActiveCategory('Todos'); }}
                                className="mt-8 px-8 py-3 bg-primary text-white font-black rounded-2xl hover:scale-105 active:scale-95 transition-all shadow-xl shadow-primary/20 uppercase text-xs tracking-widest"
                            >
                                Ver todos los productos
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Cart Panel */}
            <div className="w-full md:w-[400px] h-full bg-slate-50 flex flex-col shadow-[-10px_0_30px_-5px_rgba(0,0,0,0.05)] shrink-0 z-10">
                <div className="p-6 bg-white border-b border-slate-200 flex items-center gap-4 shrink-0">
                    <div className="w-12 h-12 bg-primary text-white rounded-[1.25rem] flex items-center justify-center shadow-lg shadow-primary/20">
                        <ShoppingBag className="w-6 h-6" />
                    </div>
                    <div>
                        <h2 className="font-black text-slate-900 text-lg uppercase tracking-tight">Resumen del Pedido</h2>
                        <p className="text-xs font-bold text-slate-400">{cartItems.length} artículos agregados</p>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    <AnimatePresence>
                        {cartItems.map(item => (
                            <motion.div
                                key={item.id}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4 relative overflow-hidden"
                            >
                                <div className="w-14 h-14 rounded-2xl bg-slate-100 overflow-hidden shrink-0 border border-slate-50">
                                    {item.image && <img src={item.image} alt="" className="w-full h-full object-cover" />}
                                </div>
                                <div className="flex-1 min-w-0 pr-2">
                                    <h4 className="text-[13px] font-black text-slate-900 leading-tight mb-0.5">{item.name}</h4>
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-black text-primary">${item.price.toFixed(2)}</span>
                                        {item.notes && <div className="flex items-center gap-1 text-[9px] font-bold text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded-md"><MessageSquare className="w-2.5 h-2.5" /> Nota</div>}
                                        {item.printed && <div className="text-[8px] font-black uppercase text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-md">Impreso</div>}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2.5 shrink-0 bg-slate-50 rounded-2xl p-1.5 border border-slate-100">
                                    <button onClick={() => updateQuantity(item.id, -1)} className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all">
                                        {item.quantity === 1 ? <Trash2 className="w-4.5 h-4.5" /> : <Minus className="w-4.5 h-4.5" />}
                                    </button>
                                    <span className="w-6 text-center font-black text-slate-900 text-sm">{item.quantity}</span>
                                    <button onClick={() => updateQuantity(item.id, 1)} className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-primary hover:bg-primary/5 rounded-xl transition-all">
                                        <Plus className="w-4.5 h-4.5" />
                                    </button>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                    {cartItems.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center text-center py-20">
                            <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-4 opacity-50">
                                <ShoppingBag className="w-10 h-10 text-slate-400" />
                            </div>
                            <p className="font-black text-slate-400 uppercase tracking-widest text-[11px]">Carrito Vacío</p>
                        </div>
                    )}
                </div>

                <div className="p-6 bg-white border-t border-slate-200 shrink-0 shadow-[0_-10px_20px_-5px_rgba(0,0,0,0.02)]">
                    <div className="flex justify-between items-center mb-6">
                        <div className="flex flex-col">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Total a Pagar</span>
                            <span className="text-4xl font-black text-slate-900 leading-none">${total.toFixed(2)}</span>
                        </div>
                    </div>
                    <button
                        onClick={handleSaveOrderPlan}
                        disabled={cartItems.length === 0 || isSubmitting}
                        className="w-full bg-primary text-white py-5 rounded-[2rem] font-black text-lg shadow-2xl shadow-primary/30 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-3 group"
                    >
                        {isSubmitting ? <Loader2 className="w-6 h-6 animate-spin" /> : 
                        (activeOrder || orderId) ? "Actualizar y Procesar" : <><Plus className="w-6 h-6 group-hover:rotate-90 transition-transform" /> Procesar Pedido</>}
                    </button>
                </div>
            </div>

            {/* Product Variant Modal (Internal Modal) */}
            <AnimatePresence>
                {selectedProduct && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            className="bg-white rounded-[2.5rem] w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
                        >
                            <div className="relative h-48 md:h-56">
                                {selectedProduct.image ? (
                                    <img src={selectedProduct.image} className="w-full h-full object-cover" alt="" />
                                ) : (
                                    <div className="w-full h-full bg-slate-100 flex items-center justify-center"><Store className="w-20 h-20 text-slate-200" /></div>
                                )}
                                <button onClick={() => setSelectedProduct(null)} className="absolute top-4 right-4 w-10 h-10 bg-black/30 backdrop-blur-md text-white rounded-full flex items-center justify-center hover:bg-black/50 transition-colors">
                                    <X className="w-6 h-6" />
                                </button>
                                <div className="absolute top-4 left-4">
                                    <div className="bg-primary px-4 py-1.5 rounded-2xl text-[10px] font-black text-white uppercase tracking-widest shadow-lg">Detalles de Orden</div>
                                </div>
                            </div>

                            <div className="p-8 flex-1 overflow-y-auto">
                                <h3 className="text-2xl font-black text-slate-900 leading-tight mb-2">{selectedProduct.name}</h3>
                                {selectedProduct.description && <p className="text-sm text-slate-500 font-medium leading-relaxed mb-8">{selectedProduct.description}</p>}

                                {/* Variants Section */}
                                {selectedProduct.variants && selectedProduct.variants.length > 0 && (
                                    <div className="mb-8 p-6 bg-slate-50 rounded-[2rem] border border-slate-100">
                                        <div className="flex items-center gap-2 mb-4">
                                            <Tag className="w-4 h-4 text-primary" />
                                            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Selecciona Presentación</h4>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            {selectedProduct.variants.map((v: any, i: number) => (
                                                <button
                                                    key={i}
                                                    onClick={() => setSelectedVariant(v)}
                                                    className={`p-4 rounded-2xl border-2 transition-all flex flex-col text-left group ${
                                                        selectedVariant === v ? 'border-primary bg-white shadow-xl shadow-primary/10' : 'border-white bg-white/50 hover:bg-white text-slate-500'
                                                    }`}
                                                >
                                                    <span className={`text-[10px] font-black uppercase tracking-widest mb-1 ${selectedVariant === v ? 'text-primary' : 'text-slate-400'}`}>{v.name}</span>
                                                    <span className={`text-lg font-black ${selectedVariant === v ? 'text-slate-900' : 'text-slate-700'}`}>${v.price.toFixed(2)}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Notes Section */}
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2">
                                        <MessageSquare className="w-4 h-4 text-slate-400" />
                                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Instrucciones Especiales</label>
                                    </div>
                                    <textarea
                                        value={itemNotes}
                                        onChange={(e) => setItemNotes(e.target.value)}
                                        placeholder="Ej: Sin cebolla, extra salsa, bien cocido..."
                                        className="w-full bg-slate-50 border border-slate-200 rounded-3xl px-6 py-4 text-sm font-bold text-slate-700 outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/5 transition-all resize-none"
                                        rows={3}
                                    />
                                </div>
                            </div>

                            <div className="p-8 bg-slate-50/50 border-t border-slate-100 flex gap-4">
                                <button onClick={() => setSelectedProduct(null)} className="flex-1 py-5 rounded-[2rem] font-black text-slate-500 hover:bg-slate-100 transition-colors">Cerrar</button>
                                <button
                                    onClick={confirmAddToCart}
                                    className="flex-[2] bg-primary text-white py-5 rounded-[2rem] font-black shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                                >
                                    <Plus className="w-6 h-6" /> Agregar al Pedido
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Checkout Modal for New Local Orders */}
            {showCheckoutModal && !orderId && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-white rounded-[3rem] p-8 w-full max-w-sm shadow-2xl"
                    >
                        <h3 className="text-2xl font-black text-slate-900 mb-2 uppercase tracking-tight">Cobrar Pedido</h3>
                        <p className="text-sm text-slate-400 font-bold mb-8">Finaliza y registra la transacción</p>
                        
                        <div className="bg-slate-50 p-6 rounded-[2rem] mb-8 flex flex-col border border-slate-100">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Neto</span>
                            <div className="flex items-baseline gap-2">
                                <span className="text-4xl font-black text-primary leading-none">${total.toFixed(2)}</span>
                                {paymentStatus === 'pending' && <span className="text-[10px] font-black text-amber-500 uppercase">Pendiente</span>}
                            </div>
                        </div>

                        <div className="space-y-4 mb-8">
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">Estado de Pago</label>
                            <div className="flex gap-2 p-1 bg-slate-50 rounded-2xl border border-slate-200">
                                <button 
                                    onClick={() => setPaymentStatus('sold')}
                                    className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                                        paymentStatus === 'sold' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-slate-400'
                                    }`}
                                >
                                    Ya Pagó
                                </button>
                                <button 
                                    onClick={() => setPaymentStatus('pending')}
                                    className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                                        paymentStatus === 'pending' ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20' : 'text-slate-400'
                                    }`}
                                >
                                    Pagar Después
                                </button>
                            </div>
                        </div>

                        {paymentStatus === 'sold' && (
                            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 mb-8">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">Método de Pago</label>
                                <div className="grid grid-cols-2 gap-3">
                                    {['Punto', 'Pago Móvil', 'Efectivo', 'Zelle'].map((method) => (
                                        <button
                                            key={method}
                                            onClick={() => setPaymentMethod(method)}
                                            className={`w-full px-4 py-4 rounded-2xl text-xs font-black transition-all border-2 flex items-center justify-center uppercase tracking-wider ${
                                                paymentMethod === method ? 'border-primary bg-primary/5 text-primary shadow-lg shadow-primary/5' : 'border-slate-50 bg-slate-50 text-slate-500 hover:border-slate-200'
                                            }`}
                                        >
                                            {method}
                                        </button>
                                    ))}
                                </div>
                            </motion.div>
                        )}

                        <div className="mb-8">
                            <label className="flex items-center gap-3 cursor-pointer mb-4 group p-1 pl-2">
                                <input
                                    type="checkbox"
                                    checked={isDelivery}
                                    onChange={(e) => setIsDelivery(e.target.checked)}
                                    className="w-5 h-5 text-primary bg-slate-100 border-slate-200 rounded-lg focus:ring-primary focus:ring-2"
                                />
                                <span className="text-sm font-black text-slate-700 uppercase tracking-tight group-hover:text-primary transition-colors">Enviar por Delivery</span>
                            </label>

                            {isDelivery && (
                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="space-y-3 overflow-hidden">
                                     <p className="font-bold text-slate-800 text-[10px] uppercase tracking-wider pl-2 mb-2">Dirección de Entrega</p>
                                     {selectedAddress ? (
                                         <div className="bg-slate-50 p-4 border border-slate-200 rounded-2xl flex justify-between items-center group mb-4">
                                             <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <MapPin className="w-4 h-4 text-primary" />
                                                    <p className="font-bold text-slate-900 leading-none">{selectedAddress.name}</p>
                                                </div>
                                                <p className="text-xs text-slate-500 font-medium pl-6 leading-tight">
                                                    <span className="font-bold text-slate-400">Ref:</span> {selectedAddress.reference || "Sin referencia adicional"}
                                                </p>
                                             </div>
                                             <button onClick={() => setShowMapPicker(true)} className="text-primary text-[10px] font-black uppercase tracking-widest pl-4 hover:underline">Cambiar</button>
                                         </div>
                                     ) : (
                                         <button onClick={() => setShowMapPicker(true)} className="w-full flex items-center justify-center gap-2 py-4 bg-primary/10 text-primary rounded-2xl font-black border border-primary/20 hover:bg-primary/20 transition-all mb-4">
                                             <MapPin className="w-4 h-4" />
                                             Ubicar en el Mapa
                                         </button>
                                     )}
                                     <p className="text-[10px] text-slate-400 font-bold uppercase text-center mt-2 px-4 leading-normal">
                                        Para asegurar una entrega exitosa, verifica que el mapa marque exacto y añade un punto de referencia descriptivo.
                                     </p>
                                </motion.div>
                            )}
                        </div>

                        <div className="flex gap-4">
                            <button
                                onClick={() => setShowCheckoutModal(false)}
                                className="flex-1 bg-slate-50 text-slate-500 py-5 rounded-[1.75rem] font-black uppercase text-xs tracking-widest hover:bg-slate-100 transition-colors"
                            >
                                Volver
                            </button>
                            <button
                                onClick={handleConfirmPayment}
                                disabled={(paymentStatus === 'sold' && !paymentMethod) || isSubmitting}
                                className={`flex-[2] py-5 rounded-[1.75rem] font-black shadow-xl transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center uppercase text-xs tracking-widest ${
                                    paymentStatus === 'sold' ? 'bg-emerald-500 text-white shadow-emerald-500/30' : 'bg-amber-500 text-white shadow-amber-500/30'
                                }`}
                            >
                                {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                                    <>
                                        {paymentStatus === 'sold' ? <CheckCircle className="w-5 h-5 mr-2" /> : <Clock className="w-5 h-5 mr-2" />}
                                        {paymentStatus === 'sold' ? 'Confirmar Pago' : 'Confirmar Pedido'}
                                    </>
                                )}
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}

            {/* Print Command Modal */}
            <AnimatePresence>
                {showPrintModal && (
                    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/80 backdrop-blur-xl p-4">
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.9, y: 30 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            className="bg-white rounded-[3rem] p-10 w-full max-w-lg shadow-2xl relative overflow-hidden"
                        >
                            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-primary via-amber-500 to-primary"></div>
                            
                            <h3 className="text-2xl font-black text-slate-900 mb-2 uppercase tracking-tight">Impresión de Comandas</h3>
                            <p className="text-sm text-slate-400 font-bold mb-4">Revisa y selecciona el método de impresión</p>

                            {/* Ticket Preview Component added here inline to show the general invoice structure */}
                            <div className="mb-4">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2 block mb-2">Vista Previa General (Impresión Final)</span>
                                <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl text-xs font-mono whitespace-pre-wrap max-h-[160px] overflow-y-auto text-slate-600 shadow-inner">
                                    {formatTicketText({
                                        id: activeOrder?.id || 'TEST',
                                        stationName: 'TICKET GENERAL',
                                        userName: activeOrder?.userName || 'Cliente',
                                        userPhone: activeOrder?.userPhone,
                                        tableNumber: activeOrder?.table,
                                        orderNote: '(Notas generales del pedido)',
                                        items: cartItems, // Use all cart items for general preview
                                        createdAt: new Date()
                                    })}
                                </div>
                            </div>

                            <div className="mb-6 bg-slate-50 p-4 rounded-[2rem] border border-slate-100">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2 mb-3">Destino de Impresión</label>
                                <select
                                    value={selectedPrinterId}
                                    onChange={(e) => setSelectedPrinterId(e.target.value)}
                                    className="w-full bg-white border border-slate-200 rounded-2xl px-5 py-4 text-sm font-black text-slate-700 outline-none focus:border-primary/50 transition-all appearance-none cursor-pointer"
                                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%239ca3af'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundPosition: `right 1.25rem center`, backgroundRepeat: `no-repeat`, backgroundSize: `1.2em 1.2em` }}
                                >
                                    <option value="auto">🌟 Auto-asignar (Según Categoría)</option>
                                    <option value="virtual">💻 Bypass / Descargar Texto (.txt) (Sin Impresora)</option>
                                    {stations.map(st => (
                                        <option key={st.id} value={st.id}>🖨️ {st.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="space-y-6 max-h-[40vh] overflow-y-auto pr-2 mb-8">
                                {newItemsToPrint.map((item, idx) => (
                                    <div key={idx} className="flex items-center gap-4 p-4 bg-slate-50 rounded-3xl border border-slate-100">
                                        <div className="w-3 h-3 rounded-full bg-primary animate-pulse"></div>
                                        <div className="flex-1">
                                            <div className="flex justify-between">
                                                <span className="font-black text-slate-900 text-sm">{item.quantity}x {item.name}</span>
                                            </div>
                                            {item.notes && <p className="text-[10px] text-amber-600 font-bold mt-1 italic">"{item.notes}"</p>}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="flex gap-4">
                                <button
                                    onClick={() => setShowPrintModal(false)}
                                    className="flex-1 bg-slate-100 text-slate-500 py-6 rounded-3xl font-black uppercase text-xs tracking-widest hover:bg-slate-200 transition-colors"
                                >
                                    Cerrar
                                </button>
                                <button
                                    onClick={handlePrintedCommand}
                                    className="flex-[2] bg-primary text-white py-6 rounded-3xl font-black shadow-2xl shadow-primary/30 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3 uppercase text-xs tracking-widest"
                                >
                                    {isSubmitting ? <Loader2 className="w-6 h-6 animate-spin" /> : <><Truck className="w-6 h-6" /> Mandar a Producción</>}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Table Selection Modal */}
            <AnimatePresence>
                {showTableModal && (
                    <div className="fixed inset-0 z-[115] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="bg-white rounded-[3rem] p-8 w-full max-w-xl shadow-2xl"
                        >
                            <div className="flex justify-between items-center mb-8">
                                <div>
                                    <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Seleccionar Lugar/Mesa</h3>
                                    <p className="text-xs text-slate-400 font-bold tracking-widest uppercase">Mesas activas del restaurante</p>
                                </div>
                                <button onClick={() => setShowTableModal(false)} className="w-10 h-10 bg-slate-50 rounded-full flex items-center justify-center text-slate-400">
                                    <X className="w-6 h-6" />
                                </button>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
                                <button
                                    onClick={() => { setSelectedTable(null); setShowTableModal(false); }}
                                    className={`p-6 rounded-3xl border-2 transition-all flex flex-col items-center gap-2 group ${
                                        !selectedTable ? 'border-primary bg-primary/5 shadow-lg shadow-primary/5' : 'border-slate-50 bg-slate-50 hover:border-slate-200'
                                    }`}
                                >
                                    <ShoppingBag className={`w-8 h-8 ${!selectedTable ? 'text-primary' : 'text-slate-300'}`} />
                                    <span className={`text-[10px] font-black uppercase tracking-widest ${!selectedTable ? 'text-primary' : 'text-slate-500'}`}>Para Llevar</span>
                                </button>
                                
                                {tables.map((table) => (
                                    <button
                                        key={table.id}
                                        onClick={() => handleTableSelect(table)}
                                        className={`p-6 rounded-3xl border-2 transition-all flex flex-col items-center gap-2 group ${
                                            selectedTable?.id === table.id ? 'border-primary bg-primary/5 shadow-lg shadow-primary/5' : 'border-slate-50 bg-slate-50 hover:border-slate-200'
                                        }`}
                                    >
                                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-xl transition-all ${
                                            selectedTable?.id === table.id ? 'bg-primary text-white' : 'bg-slate-200 text-slate-400'
                                        }`}>
                                            {table.number.slice(0, 2)}
                                        </div>
                                        <span className={`text-[10px] font-black uppercase tracking-widest ${selectedTable?.id === table.id ? 'text-primary' : 'text-slate-500'}`}>
                                            Mesa {table.number}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
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

            {showMapPicker && (
                <AddressPicker 
                    onClose={() => setShowMapPicker(false)}
                    onSave={(data) => {
                        setSelectedAddress(data);
                        setShowMapPicker(false);
                    }}
                    initialData={selectedAddress}
                />
            )}
        </div>
    );
}
