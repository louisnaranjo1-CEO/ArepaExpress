import React, { useState, useEffect } from 'react';
import { Users, Search, ShoppingBag, Heart, Star, ChevronRight, User as UserIcon, Loader2, Calendar, MapPin, Phone } from 'lucide-react';
import { db } from '../../lib/firebase';
import { collection, query, getDocs, doc, getDoc, where, orderBy } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface Client {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    photoURL?: string;
    createdAt?: any;
    lastOrderDate?: any;
    totalOrders: number;
    points: number;
    favorites: string[];
    cartItems?: any[];
}

export default function Clients() {
    const { user, userData } = useAuth();
    const [clients, setClients] = useState<Client[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedClient, setSelectedClient] = useState<Client | null>(null);

    useEffect(() => {
        if (!user) return;
        fetchClients();
    }, [user]);

    const fetchClients = async () => {
        if (!user) return;
        const rid = userData?.managedRestaurantId || user.uid;
        setLoading(true);
        console.log("Fetching clients for restaurant:", rid);
        
        try {
            // 1. Get all orders for this restaurant
            const ordersRef = collection(db, 'orders');
            let ordersSnap;
            
            try {
                // Try with sorting (requires index: restaurantId ASC, createdAt DESC)
                const q = query(ordersRef, where('restaurantId', '==', rid), orderBy('createdAt', 'desc'));
                ordersSnap = await getDocs(q);
            } catch (indexError) {
                console.warn("Index not found for sorted orders, falling back to unsorted query:", indexError);
                // Fallback to unsorted query (doesn't require composite index)
                const qFallback = query(ordersRef, where('restaurantId', '==', rid));
                ordersSnap = await getDocs(qFallback);
            }

            console.log(`Found ${ordersSnap.size} orders`);

            const clientMap = new Map<string, { 
                lastOrderDate: any, 
                totalOrders: number,
                name: string,
                email: string,
                phone: string,
                photoURL?: string
            }>();

            ordersSnap.forEach(docSnap => {
                const data = docSnap.data();
                if (!data) return;

                // Determine a unique ID for this client
                let clientId = data.userId;
                
                // Special handling for guest/local/POS orders to ensure they don't aggregate together incorrectly
                const isGenericId = !clientId || 
                                   clientId === 'waiter' || 
                                   clientId === 'local_walk_in' || 
                                   clientId === 'pos_customer' || 
                                   clientId.startsWith('guest_');

                if (isGenericId) {
                    // Try to use unique identifiers in this order:
                    // 1. clientId (which POS uses for DNI)
                    // 2. userPhone
                    // 3. userEmail
                    // 4. userName (last resort, might group different people with same name)
                    // 5. fallback to order doc ID
                    clientId = data.clientId || data.userPhone || data.userEmail || data.userName || `anonymous_${docSnap.id}`;
                }
                
                const orderDate = data.createdAt;
                
                if (clientMap.has(clientId)) {
                    const stats = clientMap.get(clientId)!;
                    stats.totalOrders += 1;
                    
                    // Safe comparison using timestamps or conversion
                    const currentLastMillis = stats.lastOrderDate?.toMillis?.() || (stats.lastOrderDate instanceof Date ? stats.lastOrderDate.getTime() : 0);
                    const orderDateMillis = orderDate?.toMillis?.() || (orderDate instanceof Date ? orderDate.getTime() : 0);
                    const isMoreRecent = orderDateMillis > currentLastMillis;
                    
                    if (isMoreRecent) {
                        stats.lastOrderDate = orderDate;
                        if (data.userName) stats.name = data.userName;
                        if (data.userEmail) stats.email = data.userEmail;
                        if (data.userPhone) stats.phone = data.userPhone;
                    }
                } else {
                    clientMap.set(clientId, {
                        lastOrderDate: orderDate,
                        totalOrders: 1,
                        name: data.userName || 'Cliente Invitado',
                        email: data.userEmail || 'N/A',
                        phone: data.userPhone || 'N/A'
                    });
                }
            });

            // 2. Map aggregated data to Client objects
            const fetchedClients: Client[] = Array.from(clientMap.entries()).map(([cid, stats]) => ({
                id: cid,
                name: stats.name,
                email: stats.email,
                phone: stats.phone,
                photoURL: stats.photoURL,
                lastOrderDate: stats.lastOrderDate,
                totalOrders: stats.totalOrders,
                points: 0,
                favorites: [],
                createdAt: stats.lastOrderDate // Approximation
            }));

            // Sort by last order date descending manually
            fetchedClients.sort((a, b) => {
                const timeA = a.lastOrderDate?.toMillis?.() || (a.lastOrderDate instanceof Date ? a.lastOrderDate.getTime() : 0);
                const timeB = b.lastOrderDate?.toMillis?.() || (b.lastOrderDate instanceof Date ? b.lastOrderDate.getTime() : 0);
                return timeB - timeA;
            });

            console.log(`Aggregated ${fetchedClients.length} unique clients`);
            setClients(fetchedClients);
        } catch (error) {
            console.error("Error in fetchClients:", error);
        } finally {
            setLoading(false);
        }
    };

    const filteredClients = clients.filter(c =>
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.phone?.includes(searchTerm)
    );

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px]">
                <Loader2 className="w-10 h-10 text-slate-900 animate-spin" />
                <p className="mt-4 text-slate-500 font-bold">Cargando clientes...</p>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-700 pb-20">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-slate-900">Mis Clientes</h1>
                    <p className="text-slate-500 font-medium">Gestiona y conoce a las personas que prefieren tu comida.</p>
                </div>
            </div>

            <div className="flex flex-col md:flex-row gap-6">
                {/* Clients List */}
                <div className={`${selectedClient ? 'hidden md:block w-1/3' : 'w-full'} space-y-4`}>
                    <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Buscar cliente..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-white border border-slate-200 p-4 pl-12 rounded-2xl outline-none focus:border-primary transition-all font-bold text-slate-700 shadow-sm"
                        />
                    </div>

                    <div className="bg-white border border-slate-100 rounded-[35px] overflow-hidden shadow-sm">
                        {filteredClients.length === 0 ? (
                            <div className="p-10 text-center text-slate-400 italic font-medium">No se encontraron clientes</div>
                        ) : (
                            <div className="divide-y divide-slate-50">
                                {filteredClients.map((client) => (
                                    <button
                                        key={client.id}
                                        onClick={() => setSelectedClient(client)}
                                        className={`w-full p-5 flex items-center gap-4 hover:bg-slate-50 transition-all text-left ${selectedClient?.id === client.id ? 'bg-slate-50 border-l-4 border-l-primary' : ''}`}
                                    >
                                        <div className="w-12 h-12 rounded-full bg-slate-100 overflow-hidden flex-shrink-0">
                                            {client.photoURL ? (
                                                <img src={client.photoURL} alt={client.name} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-slate-300">
                                                    <UserIcon className="w-6 h-6" />
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-black text-slate-900 truncate">{client.name}</h3>
                                            <div className="flex items-center gap-2">
                                                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">{client.totalOrders} pedidos</p>
                                                <span className="text-[10px] text-slate-900 font-black">•</span>
                                                <p className="text-xs text-slate-900 font-black tracking-tight">{client.points} Pts</p>
                                            </div>
                                        </div>
                                        <ChevronRight className={`w-5 h-5 text-slate-300 transition-transform ${selectedClient?.id === client.id ? 'translate-x-1 text-slate-900' : ''}`} />
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Client Detail View */}
                <div className={`${selectedClient ? 'w-full md:w-2/3' : 'hidden'} min-h-[500px]`}>
                    {selectedClient ? (
                        <div className="bg-white border border-slate-100 rounded-[40px] shadow-sm overflow-hidden animate-in slide-in-from-right-4 duration-300">
                            {/* Header / Profile */}
                            <div className="p-8 bg-slate-900 text-white flex flex-col items-center text-center relative">
                                <button
                                    onClick={() => setSelectedClient(null)}
                                    className="absolute top-6 right-6 md:hidden p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
                                >
                                    <ChevronRight className="w-5 h-5 rotate-180" />
                                </button>

                                <div className="w-24 h-24 rounded-full border-4 border-white/20 p-1 mb-4">
                                    <div className="w-full h-full rounded-full bg-white/10 overflow-hidden">
                                        {selectedClient.photoURL ? (
                                            <img src={selectedClient.photoURL} alt={selectedClient.name} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-white/30">
                                                <UserIcon className="w-10 h-10" />
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <h2 className="text-2xl font-black">{selectedClient.name}</h2>
                                <div className="mt-4 flex flex-wrap justify-center gap-3">
                                    {selectedClient.email && (
                                        <div className="flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-full text-xs font-bold">
                                            <UserIcon className="w-3.5 h-3.5 opacity-60" />
                                            {selectedClient.email}
                                        </div>
                                    )}
                                    {selectedClient.phone && (
                                        <div className="flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-full text-xs font-bold">
                                            <Phone className="w-3.5 h-3.5 opacity-60" />
                                            {selectedClient.phone}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Stats Grid */}
                            <div className="grid grid-cols-2 md:grid-cols-4 border-b border-slate-50">
                                <div className="p-6 text-center border-r border-slate-50">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Pedidos</p>
                                    <p className="text-xl font-black text-slate-900">{selectedClient.totalOrders}</p>
                                </div>
                                <div className="p-6 text-center border-r border-slate-50">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Favoritos</p>
                                    <p className="text-xl font-black text-slate-900">{selectedClient.favorites.length}</p>
                                </div>
                                <div className="p-6 text-center border-r border-slate-50">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">En Carrito</p>
                                    <p className="text-xl font-black text-slate-900">{selectedClient.cartItems?.length || 0}</p>
                                </div>
                                <div className="p-6 text-center border-r border-slate-50 bg-indigo-50/30">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Puntos</p>
                                    <p className="text-xl font-black text-slate-900">{selectedClient.points}</p>
                                </div>
                                <div className="p-6 text-center">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Desde</p>
                                    <p className="text-xs font-black text-slate-900">
                                        {selectedClient.createdAt ? format(selectedClient.createdAt.toDate(), 'MMM yyyy', { locale: es }) : 'Reciente'}
                                    </p>
                                </div>
                            </div>

                            {/* Content */}
                            <div className="p-8 space-y-8">
                                {/* Last Order */}
                                <div className="space-y-4">
                                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                                        <Calendar className="w-4 h-4 text-slate-900" /> Último Pedido
                                    </h3>
                                    <div className="bg-slate-50 p-4 rounded-2xl flex items-center justify-between">
                                        <div>
                                            <p className="font-black text-slate-900">
                                                {selectedClient.lastOrderDate ? format(selectedClient.lastOrderDate.toDate(), "eeee d 'de' MMMM", { locale: es }) : 'N/A'}
                                            </p>
                                            <p className="text-xs text-slate-500 font-medium">
                                                {selectedClient.lastOrderDate ? format(selectedClient.lastOrderDate.toDate(), 'p') : ''}
                                            </p>
                                        </div>
                                        <ShoppingBag className="w-8 h-8 text-slate-200" />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    {/* Preference indicators or favorite products (if we had specific order item tracking over time) */}
                                    <div className="space-y-4">
                                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                                            <Heart className="w-4 h-4 text-red-500 fill-red-500" /> Restaurantes Favoritos
                                        </h3>
                                        <div className="space-y-2">
                                            <p className="text-xs text-slate-500 italic font-medium">Este cliente tiene {selectedClient.favorites.length} locales guardados en su perfil.</p>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                                            <ShoppingBag className="w-4 h-4 text-slate-900" /> Carrito Actual
                                        </h3>
                                        <div className="space-y-2">
                                            {selectedClient.cartItems && selectedClient.cartItems.length > 0 ? (
                                                <div className="space-y-2">
                                                    {selectedClient.cartItems.map((item, idx) => (
                                                        <div key={idx} className="flex justify-between items-center text-sm font-bold bg-orange-50 text-orange-700 p-2 px-3 rounded-lg border border-orange-100">
                                                            <span>{item.name} x{item.quantity}</span>
                                                            <span className="text-xs text-slate-900 opacity-70">${(item.price * item.quantity).toFixed(2)}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className="text-xs text-slate-400 italic font-medium">El carrito actual está vacío.</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-slate-300 border-2 border-dashed border-slate-100 rounded-[40px]">
                            <UserIcon className="w-16 h-16 mb-4 opacity-20" />
                            <p className="font-black">Selecciona un cliente para ver su perfil</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
