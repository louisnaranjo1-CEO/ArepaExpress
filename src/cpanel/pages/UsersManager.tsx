import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy, where, doc, getDoc, setDoc, updateDoc, onSnapshot, writeBatch, collectionGroup } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { User, ChevronRight, Mail, Phone, Calendar, ShoppingBag, Heart, X, MapPin, Wallet, CheckCircle, XCircle, Search, Filter, Image as ImageIcon, Activity, Clock, ExternalLink, Gift, Users } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import DualPrice from '../../components/DualPrice';

interface UserProfile {
    id: string;
    displayName?: string;
    name?: string; // Legacy field
    email?: string;
    phone?: string;
    createdAt?: any; // Firebase Timestamp
    role?: string;
    photoURL?: string;
    walletBalance?: number;
    favorites?: any[];
    address?: string;
    lastSeen?: any; // Firebase Timestamp
    totalUsageMinutes?: number;
    lastLogin?: any; // Firebase Timestamp
    totalReferrals?: number;
    points?: number;
    restaurantPoints?: Record<string, number>;
    lastCity?: string;
    lastState?: string;
}

export default function UsersManager() {
    const [activeTab, setActiveTab] = useState<'users' | 'funds'>('users');
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [recharges, setRecharges] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [userOrders, setUserOrders] = useState<any[]>([]);
    const [loadingOrders, setLoadingOrders] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterRole, setFilterRole] = useState('all');
    const [sortBy, setSortBy] = useState<'recent' | 'referrals'>('recent');
    const [showShareLinkModal, setShowShareLinkModal] = useState(false);
    const [shareMessage, setShareMessage] = useState('¡Hola! Únete a la nueva era del delivery con Deliexpress y obtén premios increíbles.');
    const [shareUrl, setShareUrl] = useState('https://deliexpress.app');
    const [savingConfig, setSavingConfig] = useState(false);
    const [restaurantNames, setRestaurantNames] = useState<Record<string, string>>({});

    useEffect(() => {
        const fetchSystemConfig = async () => {
            try {
                const configSnap = await getDoc(doc(db, 'system_configs', 'fidelization'));
                if (configSnap.exists()) {
                    const data = configSnap.data();
                    if (data.shareMessage) setShareMessage(data.shareMessage);
                    if (data.shareUrl) setShareUrl(data.shareUrl);
                }
            } catch (err) {
                console.error("Error fetching config", err);
            }
        };
        fetchSystemConfig();
    }, []);

    const handleSaveShareConfig = async () => {
        setSavingConfig(true);
        try {
            await setDoc(doc(db, 'system_configs', 'fidelization'), {
                shareMessage,
                shareUrl,
                updatedAt: new Date()
            }, { merge: true });
            setShowShareLinkModal(false);
            alert("Configuración de referidos guardada con éxito.");
        } catch (error) {
            console.error(error);
            alert("Error al guardar la configuración.");
        } finally {
            setSavingConfig(false);
        }
    };

    const filteredUsers = users.filter(user => {
        const userName = user.displayName || user.name || '';
        const matchesSearch =
            userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            user.phone?.includes(searchTerm);

        const matchesRole = filterRole === 'all' || user.role === filterRole;

        return matchesSearch && matchesRole;
    }).sort((a, b) => {
        if (sortBy === 'referrals') {
            const aRefs = (a as any).totalReferrals || 0;
            const bRefs = (b as any).totalReferrals || 0;
            return bRefs - aRefs;
        }
        return 0; // maintain original `createdAt` desc sort
    });

    const isOnline = (lastSeen: any) => {
        if (!lastSeen) return false;
        try {
            const now = new Date().getTime();
            const seen = lastSeen.toDate().getTime();
            return (now - seen) < 120000; // 2 minutes threshold
        } catch (e) {
            return false;
        }
    };

    const formatUsage = (minutes: number = 0) => {
        if (minutes < 60) return `${minutes} min`;
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return `${hours}h ${mins}m`;
    };

    useEffect(() => {
        const fetchUsers = async () => {
            try {
                const querySnapshot = await getDocs(query(collection(db, 'users'), orderBy('createdAt', 'desc')));
                const data = querySnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                setUsers(data as UserProfile[]);
            } catch (error) {
                console.error("Error fetching users: ", error);
            } finally {
                setLoading(false);
            }
        };

        const unsubscribeRecharges = onSnapshot(
            query(collection(db, 'wallet_recharges'), orderBy('createdAt', 'desc')),
            (snapshot) => {
                const data = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                setRecharges(data);
            },
            (error) => {
                console.error("Error fetching wallet recharges: ", error);
            }
        );

        fetchUsers();
        return () => unsubscribeRecharges();
    }, []);

    const [selectedDriverData, setSelectedDriverData] = useState<any | null>(null);

    const handleUserClick = async (user: UserProfile) => {
        setSelectedUser(user);
        setIsModalOpen(true);
        setUserOrders([]);
        setLoadingOrders(true);
        setSelectedDriverData(null);

        try {
            const ordersSnap = await getDocs(query(collectionGroup(db, 'orders'), where('userId', '==', user.id)));
            const ordersData = ordersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setUserOrders(ordersData);

            // Fetch driver data if applicable
            if (user.role === 'driver' || user.role === 'delivery') {
                const driverSnap = await getDoc(doc(db, 'delivery_drivers', user.id));
                if (driverSnap.exists()) {
                    setSelectedDriverData(driverSnap.data());
                }
            }
            // Fetch restaurant names for points if needed
            if (user.restaurantPoints) {
                const namesToFetch = Object.keys(user.restaurantPoints).filter(id => !restaurantNames[id]);
                if (namesToFetch.length > 0) {
                    const names: Record<string, string> = { ...restaurantNames };
                    await Promise.all(namesToFetch.map(async (id) => {
                        const rDoc = await getDoc(doc(db, 'restaurants', id));
                        if (rDoc.exists()) {
                            names[id] = rDoc.data().name;
                        } else {
                            names[id] = 'Local Desconocido';
                        }
                    }));
                    setRestaurantNames(names);
                }
            }
        } catch (error) {
            console.error("Error fetching user details:", error);
        } finally {
            setLoadingOrders(false);
        }
    };

    const handleApproveRecharge = async (rechargeId: string, userId: string, amount: number) => {
        if (!window.confirm(`¿Aprobar recarga de $${amount} para este usuario?`)) return;

        try {
            const userRef = doc(db, 'users', userId);
            const userSnap = await getDoc(userRef);

            if (userSnap.exists()) {
                const currentBalance = userSnap.data().walletBalance || 0;
                const newBalance = currentBalance + amount;

                const batch = writeBatch(db);
                batch.update(doc(db, 'wallet_recharges', rechargeId), { status: 'approved', reviewDate: new Date() });
                batch.update(userRef, { walletBalance: newBalance });

                await batch.commit();
            } else {
                console.error("User not found!");
            }
        } catch (error) {
            console.error("Error approving recharge:", error);
        }
    };

    const handleRejectRecharge = async (rechargeId: string) => {
        if (!window.confirm("¿Rechazar esta recarga?")) return;

        try {
            await updateDoc(doc(db, 'wallet_recharges', rechargeId), {
                status: 'rejected',
                reviewDate: new Date()
            });
        } catch (error) {
            console.error("Error rejecting recharge:", error);
        }
    };

    if (loading) {
        return <div className="animate-pulse space-y-4"><div className="h-8 bg-slate-200 rounded w-1/4"></div><div className="h-64 bg-slate-200 rounded"></div></div>;
    }

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div className="flex flex-col gap-2">
                    <h1 className="text-3xl font-black text-slate-900 leading-tight">Gestión de Usuarios</h1>
                    <p className="text-slate-500 font-medium">Administra clientes, conductores y sus estadísticas.</p>
                </div>

                {/* Tabs */}
                <div className="bg-white p-1 rounded-2xl border border-slate-200 shadow-sm flex items-center self-start overflow-x-auto w-full md:w-auto">
                    <button
                        onClick={() => setActiveTab('users')}
                        className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all whitespace-nowrap ${activeTab === 'users' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'}`}
                    >
                        <User className="w-4 h-4" />
                        Lista de Usuarios
                    </button>
                    <button
                        onClick={() => setActiveTab('funds')}
                        className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all whitespace-nowrap ${activeTab === 'funds' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'}`}
                    >
                        <Wallet className="w-4 h-4" />
                        Recargas
                        {recharges.filter(r => r.status === 'pending').length > 0 && (
                            <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full font-black">
                                {recharges.filter(r => r.status === 'pending').length}
                            </span>
                        )}
                    </button>
                </div>

                {/* Configure Referral Button */}
                <button
                    onClick={() => setShowShareLinkModal(true)}
                    className="flex justify-center items-center gap-2 px-6 py-3 bg-indigo-50 text-primary rounded-xl font-bold text-sm hover:bg-indigo-100 transition-all shadow-sm md:ml-auto"
                >
                    <Gift className="w-5 h-5" />
                    Configurar Link Compartir
                </button>
            </div>

            {activeTab === 'users' ? (
                <>
                    {/* Search and Filters */}
                    <div className="flex flex-col md:flex-row gap-4">
                        <div className="flex-1 relative">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Buscar por nombre, correo o teléfono..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full bg-white border border-slate-200 rounded-2xl pl-11 pr-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                            />
                        </div>
                        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-2xl px-4 py-2">
                            <Filter className="w-4 h-4 text-slate-400" />
                            <select
                                value={filterRole}
                                onChange={(e) => setFilterRole(e.target.value)}
                                className="bg-transparent text-sm font-bold text-slate-600 focus:outline-none cursor-pointer pr-4"
                            >
                                <option value="all">Todos los Roles</option>
                                <option value="client">Clientes</option>
                                <option value="delivery">Delivery</option>
                                <option value="driver">Taxi</option>
                                <option value="admin">Admin</option>
                            </select>
                        </div>
                        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-2xl px-4 py-2">
                            <Users className="w-4 h-4 text-slate-400" />
                            <select
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value as any)}
                                className="bg-transparent text-sm font-bold text-slate-600 focus:outline-none cursor-pointer pr-4"
                            >
                                <option value="recent">Más Recientes</option>
                                <option value="referrals">Top Referidores</option>
                            </select>
                        </div>
                    </div>

                    <div className="bg-white rounded-[40px] border border-slate-100 overflow-hidden shadow-xl shadow-slate-200/40">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left whitespace-nowrap">
                                <thead className="bg-slate-50/50 text-slate-400 font-bold text-[10px] uppercase tracking-[0.2em] border-b border-slate-100">
                                    <tr>
                                        <th className="px-6 py-5">Usuario</th>
                                        <th className="px-6 py-5">Estado / Rol</th>
                                        <th className="px-6 py-5">Contacto</th>
                                        <th className="px-6 py-5">Actividad</th>
                                        <th className="px-6 py-5">Referidos / Pts</th>
                                        <th className="px-6 py-5 text-right"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {filteredUsers.map((user) => (
                                        <tr
                                            key={user.id}
                                            onClick={() => handleUserClick(user)}
                                            className="group hover:bg-slate-50/80 transition-all cursor-pointer"
                                        >
                                            <td className="px-6 py-5">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-12 h-12 rounded-full bg-slate-100 flex flex-col items-center justify-center shrink-0 overflow-hidden border border-slate-200 shadow-inner relative">
                                                        {user.photoURL ? (
                                                            <img src={user.photoURL} alt={user.displayName} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <User className="w-6 h-6 text-slate-400" />
                                                        )}
                                                        {isOnline(user.lastSeen) && (
                                                            <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full shadow-sm shadow-green-500/50"></div>
                                                        )}
                                                    </div>
                                                    <div>
                                                        <div className="font-bold text-slate-900 group-hover:text-slate-900 transition-colors">{user.displayName || user.name || 'Sin Nombre'}</div>
                                                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{user.id.slice(0, 8)}...</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-5">
                                                <div className="flex flex-col gap-1.5">
                                                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${user.role === 'admin' ? 'bg-purple-100 text-purple-700' :
                                                        user.role === 'driver' ? 'bg-orange-100 text-orange-700' :
                                                            user.role === 'delivery' ? 'bg-blue-100 text-blue-700' :
                                                                'bg-slate-100 text-slate-600'
                                                        }`}>
                                                        {user.role === 'admin' ? 'Admin' :
                                                            user.role === 'driver' ? 'Taxi' :
                                                                user.role === 'delivery' ? 'Delivery' : 'Cliente'}
                                                    </span>
                                                    <span className={`text-[10px] font-bold ${isOnline(user.lastSeen) ? 'text-green-600' : 'text-slate-400'}`}>
                                                        {isOnline(user.lastSeen) ? 'En Línea' : 'Desconectado'}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-5">
                                                <div className="flex flex-col gap-1">
                                                    <div className="text-sm font-medium text-slate-600 flex items-center gap-2">
                                                        <Mail className="w-3 h-3 text-slate-300" /> {user.email || 'N/A'}
                                                    </div>
                                                    <div className="text-[10px] font-black text-slate-400 flex items-center gap-2">
                                                        <Phone className="w-3 h-3 text-slate-300" /> {user.phone || 'N/A'}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-8 py-5">
                                                <div className="flex flex-col gap-1">
                                                    <div className="text-sm font-medium text-slate-600 flex items-center gap-2">
                                                        <Clock className="w-3 h-3 text-slate-300" /> {formatUsage(user.totalUsageMinutes)}
                                                    </div>
                                                    <div className="text-[10px] font-bold text-slate-400">
                                                        {user.lastLogin ? `Ult. vez: ${format(user.lastLogin.toDate(), 'dd/MM HH:mm')}` : 'Sin ingresos'}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-5">
                                                <div className="flex flex-col gap-1">
                                                    <div className="text-sm font-black text-slate-800 flex items-center gap-1.5">
                                                        <Users className="w-4 h-4 text-primary" /> {user.totalReferrals || 0}
                                                    </div>
                                                    <div className="text-[10px] font-bold text-slate-400 flex items-center gap-1.5">
                                                        <Gift className="w-3 h-3" /> {user.points || 0} pts
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-5 text-right">
                                                <ChevronRight className="w-5 h-5 text-slate-200 group-hover:text-slate-400 transition-colors" />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            ) : (
                <div className="bg-white rounded-[40px] border border-slate-100 shadow-xl shadow-slate-200/40 p-6 md:p-8">
                    <h2 className="text-xl font-black text-slate-900 mb-6 flex items-center gap-3">
                        <Wallet className="w-6 h-6 text-slate-900" />
                        Solicitudes de Recarga
                    </h2>

                    {recharges.length === 0 ? (
                        <div className="text-center py-12">
                            <Wallet className="w-16 h-16 text-slate-200 mx-auto mb-4" />
                            <h3 className="text-lg font-bold text-slate-700">No hay solicitudes</h3>
                            <p className="text-slate-500">Aún no se han recibido solicitudes de recarga de billetera.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {recharges.map((recharge) => {
                                const statusColors = {
                                    pending: 'bg-amber-100 text-amber-700 border-amber-200',
                                    approved: 'bg-emerald-100 text-emerald-700 border-emerald-200',
                                    rejected: 'bg-rose-100 text-rose-700 border-rose-200'
                                };
                                const statusLabels = {
                                    pending: 'Pendiente',
                                    approved: 'Aprobada',
                                    rejected: 'Rechazada'
                                };

                                return (
                                    <div key={recharge.id} className="bg-white border-2 border-slate-100 rounded-3xl p-5 hover:border-slate-200 transition-all flex flex-col">
                                        <div className="flex justify-between items-start mb-4">
                                            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${statusColors[recharge.status as keyof typeof statusColors] || 'bg-slate-100 text-slate-600'}`}>
                                                {statusLabels[recharge.status as keyof typeof statusLabels] || recharge.status}
                                            </span>
                                            <span className="text-xs font-bold text-slate-400">
                                                {recharge.createdAt ? new Date(recharge.createdAt.toDate()).toLocaleDateString() : '-'}
                                            </span>
                                        </div>

                                        <div className="mb-4">
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Monto Solicitado</p>
                                            <DualPrice usdAmount={parseFloat(recharge.amount)} usdClassName="text-3xl font-black text-slate-900" showDivider={false} className="flex flex-col" />
                                        </div>

                                        <div className="space-y-3 mb-6 bg-slate-50 p-4 rounded-2xl">
                                            <div>
                                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Usuario</p>
                                                <p className="font-bold text-slate-700">{recharge.userName || 'Usuario Desconocido'}</p>
                                                <p className="text-xs text-slate-500">{recharge.userEmail}</p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Referencia</p>
                                                <p className="font-medium text-slate-600 bg-white px-2 py-1 rounded border border-slate-200 font-mono text-sm">{recharge.reference}</p>
                                            </div>
                                            {recharge.proofUrl && (
                                                <a href={recharge.proofUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-slate-900 text-xs font-bold hover:underline bg-primary/5 px-3 py-1.5 rounded-lg mt-2 transition-colors">
                                                    <ImageIcon className="w-3.5 h-3.5" />
                                                    Ver Comprobante
                                                </a>
                                            )}
                                        </div>

                                        <div className="mt-auto">
                                            {recharge.status === 'pending' ? (
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => handleRejectRecharge(recharge.id)}
                                                        className="flex-1 py-3 bg-white border border-rose-200 text-rose-600 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-rose-50 transition-colors flex items-center justify-center gap-1"
                                                    >
                                                        <XCircle className="w-4 h-4" /> Rechazar
                                                    </button>
                                                    <button
                                                        onClick={() => handleApproveRecharge(recharge.id, recharge.userId, parseFloat(recharge.amount))}
                                                        className="flex-1 py-3 bg-emerald-500 text-white rounded-xl font-bold text-xs uppercase tracking-widest shadow-lg shadow-emerald-500/30 hover:bg-emerald-600 transition-colors flex items-center justify-center gap-1"
                                                    >
                                                        <CheckCircle className="w-4 h-4" /> Aprobar
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="w-full py-3 bg-slate-50 border border-slate-100 text-slate-400 rounded-xl font-bold text-xs uppercase tracking-widest text-center">
                                                    Solicitud Procesada
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Configurar Referidos Modal */}
            {showShareLinkModal && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowShareLinkModal(false)}></div>
                    <div className="relative bg-white w-full max-w-md rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
                        <div className="p-8">
                            <div className="flex justify-between items-start mb-6">
                                <div>
                                    <h3 className="text-2xl font-black text-slate-900 flex items-center gap-2">
                                        <Gift className="w-6 h-6 text-primary" />
                                        Compartir Deliexpress
                                    </h3>
                                    <p className="text-slate-500 text-sm mt-1">Configura el mensaje que enviarán los usuarios para invitar a sus amigos.</p>
                                </div>
                                <button onClick={() => setShowShareLinkModal(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                                    <X className="w-5 h-5 text-slate-400" />
                                </button>
                            </div>

                            <div className="space-y-4">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Mensaje para Compartir</label>
                                    <textarea
                                        value={shareMessage}
                                        onChange={e => setShareMessage(e.target.value)}
                                        className="w-full bg-slate-50 border-2 border-slate-100 focus:border-primary px-4 py-3 rounded-2xl outline-none font-bold text-slate-700 transition-all resize-none h-24 text-sm"
                                        placeholder="Ej: ¡Usa Deliexpress y obtén recompensas!"
                                    />
                                    <p className="text-[10px] font-medium text-slate-400 ml-1">Nota: El código del usuario y la URL se agregarán al final automáticamente.</p>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">URL de Descarga / App</label>
                                    <input
                                        type="text"
                                        value={shareUrl}
                                        onChange={e => setShareUrl(e.target.value)}
                                        className="w-full bg-slate-50 border-2 border-slate-100 focus:border-primary px-4 py-3 rounded-2xl outline-none font-bold text-slate-700 transition-all text-sm"
                                        placeholder="https://deliexpress.app"
                                    />
                                </div>

                                <button
                                    onClick={handleSaveShareConfig}
                                    disabled={savingConfig}
                                    className="w-full mt-4 bg-primary text-slate-900 py-4 rounded-2xl font-bold shadow-lg shadow-primary/30 hover:bg-primary hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-70 flex items-center justify-center gap-2"
                                >
                                    {savingConfig ? (
                                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                    ) : (
                                        'Guardar Configuración'
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* User Detail Modal */}
            {isModalOpen && selectedUser && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}></div>
                    <div className="relative bg-white w-full max-w-2xl rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 max-h-[90vh] overflow-y-auto">
                        <div className="p-8 md:p-10">
                            <div className="flex justify-between items-start mb-8">
                                <div className="flex items-center gap-6">
                                    <div className="w-20 h-20 rounded-[28px] bg-slate-100 flex items-center justify-center border-4 border-slate-50 shadow-inner shrink-0 overflow-hidden relative">
                                        {selectedUser.photoURL ? (
                                            <img src={selectedUser.photoURL} alt={selectedUser.displayName} className="w-full h-full object-cover" />
                                        ) : (
                                            <User className="w-10 h-10 text-slate-300" />
                                        )}
                                        {isOnline(selectedUser.lastSeen) && (
                                            <div className="absolute bottom-0 right-0 w-4 h-4 bg-green-500 border-2 border-white rounded-full"></div>
                                        )}
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-black text-slate-900">{selectedUser.displayName || selectedUser.name || 'Sin Nombre'}</h2>
                                        <p className="text-slate-400 font-bold uppercase tracking-widest text-[9px] mt-1">ID: {selectedUser.id}</p>
                                        <div className="flex items-center gap-2 mt-3">
                                            <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${selectedUser.role === 'admin' ? 'bg-purple-100 text-purple-700' :
                                                selectedUser.role === 'driver' ? 'bg-orange-100 text-orange-700' :
                                                    selectedUser.role === 'delivery' ? 'bg-blue-100 text-blue-700' :
                                                        'bg-emerald-100 text-emerald-700'
                                                }`}>
                                                {selectedUser.role === 'admin' ? 'Administrador' :
                                                    selectedUser.role === 'driver' ? 'Conductor Taxi' :
                                                        selectedUser.role === 'delivery' ? 'Repartidor Delivery' : 'Cliente'}
                                            </span>
                                            {isOnline(selectedUser.lastSeen) && (
                                                <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-1">
                                                    <Activity className="w-3 h-3" /> ACTIVO
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setIsModalOpen(false)}
                                    className="w-10 h-10 bg-slate-50 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-all border border-slate-100"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Wallet and Stats Container */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                                <div className="bg-slate-900 rounded-[32px] p-6 text-white shadow-xl">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center backdrop-blur-md border border-white/20">
                                            <Wallet className="w-5 h-5 text-emerald-400" />
                                        </div>
                                        <div>
                                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Balance Billetera</p>
                                            <DualPrice usdAmount={selectedUser.walletBalance || 0} usdClassName="text-2xl font-black" showDivider={false} className="flex flex-col" />
                                        </div>
                                    </div>
                                    <div className="pt-4 border-t border-white/10 flex justify-between items-center text-[10px] font-bold text-slate-500">
                                        <span>Solo para transporte</span>
                                        <span className="text-emerald-400">Activa</span>
                                    </div>
                                </div>
                                <div className="bg-slate-50 rounded-[32px] p-6 border border-slate-100">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                                            <Clock className="w-5 h-5 text-slate-900" />
                                        </div>
                                        <div>
                                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Uso de la App</p>
                                            <p className="text-2xl font-black text-slate-900">{formatUsage(selectedUser.totalUsageMinutes)}</p>
                                        </div>
                                    </div>
                                    <div className="pt-4 border-t border-slate-200 flex justify-between items-center text-[10px] font-bold text-slate-500">
                                        <span>Promedio histórico</span>
                                        <span className="text-slate-900">Total</span>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-6">
                                    <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest flex items-center gap-2 border-b border-slate-50 pb-3">Información Personal</h3>
                                    <div className="space-y-4">
                                        <InfoItem icon={Mail} label="Correo" value={selectedUser.email || 'No proporcionado'} />
                                        <InfoItem icon={Phone} label="Teléfono" value={selectedUser.phone || 'No proporcionado'} />
                                        <InfoItem icon={Calendar} label="Registro" value={selectedUser.createdAt ? format(selectedUser.createdAt.toDate(), 'PPP', { locale: es }) : 'N/A'} />
                                        <InfoItem 
                                            icon={MapPin} 
                                            label="Última Ubicación" 
                                            value={
                                                selectedUser.lastCity 
                                                    ? `${selectedUser.lastCity}${selectedUser.lastState ? `, ${selectedUser.lastState}` : ''}`
                                                    : typeof selectedUser.address === 'string' ? selectedUser.address : 
                                                    (selectedUser as any).addresses?.[0]?.name ? `${(selectedUser as any).addresses[0].name} (${(selectedUser as any).addresses[0].reference || 'Sin ref'})` :
                                                    'Sin ubicación registrada'
                                            } 
                                        />
                                    </div>
                                </div>
                                <div className="space-y-6">
                                    <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest flex items-center gap-2 border-b border-slate-50 pb-3">Historial y Métricas</h3>
                                    <div className="grid grid-cols-2 gap-4">
                                        <ActivityStat icon={ShoppingBag} label="Pedidos" value={userOrders.length.toString()} color="text-emerald-500" bg="bg-emerald-50" />
                                        <ActivityStat 
                                            icon={Wallet} 
                                            label="Total Gastado" 
                                            value={
                                                <DualPrice 
                                                    usdAmount={userOrders.reduce((acc, o) => acc + (o.total || 0), 0)} 
                                                    usdClassName="text-xl font-black text-slate-900" 
                                                    showDivider={false} 
                                                    className="flex flex-col" 
                                                />
                                            } 
                                            color="text-blue-500" 
                                            bg="bg-blue-50" 
                                        />
                                    </div>
                                    <div className="p-5 rounded-[28px] bg-slate-50 border border-slate-100">
                                        <div className="flex items-center justify-between mb-4">
                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Puntos Acumulados</p>
                                            <Gift className="w-4 h-4 text-primary" />
                                        </div>
                                        <div className="space-y-2">
                                            <div className="flex justify-between items-center bg-white p-2 rounded-xl border border-slate-100">
                                                <span className="text-[10px] font-bold text-slate-600">DeliPuntos (Global)</span>
                                                <span className="text-xs font-black text-primary">{(selectedUser.points || 0).toLocaleString()} pts</span>
                                            </div>
                                            {selectedUser.restaurantPoints && Object.entries(selectedUser.restaurantPoints).length > 0 && (
                                                <div className="pt-2">
                                                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2 pl-1">Por Restaurante</p>
                                                    <div className="max-h-32 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                                                        {Object.entries(selectedUser.restaurantPoints).map(([id, pts]) => (
                                                            <div key={id} className="flex justify-between items-center bg-orange-50/50 p-2 rounded-xl border border-orange-100/50">
                                                                <span className="text-[10px] font-bold text-slate-800 truncate mr-2">{restaurantNames[id] || `Local ${id.slice(0, 5)}`}</span>
                                                                <span className="text-[10px] font-black text-orange-600 shrink-0">{Math.floor(pts as number)} pts</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="p-5 rounded-[28px] bg-slate-50 border border-slate-100 flex items-center justify-between">
                                        <div>
                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Último Ingreso</p>
                                            <p className="text-xs font-bold text-slate-700">
                                                {selectedUser.lastLogin ? format(selectedUser.lastLogin.toDate(), 'dd/MM/yyyy HH:mm') : 'No registrado'}
                                            </p>
                                        </div>
                                        <Activity className={`w-5 h-5 ${isOnline(selectedUser.lastSeen) ? 'text-green-500 animate-pulse' : 'text-slate-300'}`} />
                                    </div>
                                </div>
                            </div>

                            {/* Pilot Application Data */}
                            {selectedDriverData && (
                                <div className="mt-8 pt-8 border-t border-slate-100 space-y-6">
                                    <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest flex items-center gap-2 border-b border-slate-50 pb-3">Documentos de Piloto ({selectedDriverData.vehicleType})</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <DocCard label="Selfie" url={selectedDriverData.documents?.selfieUrl} />
                                        <DocCard label="Vehículo" url={selectedDriverData.documents?.vehicleUrl} details={`Placa: ${selectedDriverData.vehiclePlate}`} />
                                        <DocCard label="Licencia" url={selectedDriverData.documents?.licenseUrl} />
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="p-8 bg-slate-50 border-t border-slate-100 flex flex-col md:flex-row gap-4">
                            <button 
                                onClick={() => {
                                    if (selectedUser.phone) {
                                        const cleanPhone = selectedUser.phone.replace(/\D/g, '');
                                        window.open(`https://wa.me/${cleanPhone.startsWith('58') ? cleanPhone : `58${cleanPhone}`}`, '_blank');
                                    } else {
                                        alert("El usuario no tiene un número de teléfono registrado.");
                                    }
                                }}
                                className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-slate-900/20 hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
                            >
                                <Phone className="w-4 h-4" /> CONTACTAR POR WHATSAPP
                            </button>
                            <button className="flex-1 py-4 bg-white border border-slate-200 text-red-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-red-50 transition-colors">
                                SUSPENDER CUENTA
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function InfoItem({ icon: Icon, label, value }: { icon: any, label: string, value: string }) {
    return (
        <div className="flex gap-4">
            <div className="w-10 h-10 bg-slate-100 rounded-2xl flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4 text-slate-400" />
            </div>
            <div className="min-w-0 flex-1">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
                <p className="text-xs font-bold text-slate-700 truncate">{value}</p>
            </div>
        </div>
    );
}

function ActivityStat({ icon: Icon, label, value, color, bg }: { icon: any, label: string, value: React.ReactNode, color: string, bg: string }) {
    return (
        <div className={`p-4 ${bg} rounded-[24px] border border-transparent hover:border-slate-200 transition-all`}>
            <Icon className={`w-4 h-4 ${color} mb-2`} />
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
            <p className={`text-xl font-black text-slate-900`}>{value}</p>
        </div>
    );
}

function DocCard({ label, url, details }: { label: string, url?: string, details?: string }) {
    if (!url) return (
        <div className="p-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200 flex flex-col items-center justify-center text-center">
            <ImageIcon className="w-5 h-5 text-slate-300 mb-1" />
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
            <p className="text-[10px] text-slate-400">No cargado</p>
        </div>
    );

    return (
        <a href={url} target="_blank" rel="noopener noreferrer" className="group block p-1 bg-white border border-slate-200 rounded-2xl hover:shadow-lg transition-all overflow-hidden relative">
            <div className="aspect-video rounded-xl overflow-hidden bg-slate-100 relative">
                <img src={url} alt={label} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <ExternalLink className="w-6 h-6 text-white" />
                </div>
            </div>
            <div className="p-2">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
                {details && <p className="text-[10px] font-bold text-slate-700 truncate">{details}</p>}
            </div>
        </a>
    );
}

