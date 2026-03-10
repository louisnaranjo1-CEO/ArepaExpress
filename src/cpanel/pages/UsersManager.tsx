import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy, where, doc, getDoc, updateDoc, onSnapshot, writeBatch } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { User, ChevronRight, Mail, Phone, Calendar, ShoppingBag, Heart, X, MapPin, Wallet, CheckCircle, XCircle, Search, Filter, Image as ImageIcon } from 'lucide-react';

export default function UsersManager() {
    const [activeTab, setActiveTab] = useState<'users' | 'funds'>('users');
    const [users, setUsers] = useState<any[]>([]);
    const [recharges, setRecharges] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedUser, setSelectedUser] = useState<any | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [userOrders, setUserOrders] = useState<any[]>([]);

    useEffect(() => {
        const fetchUsers = async () => {
            try {
                const querySnapshot = await getDocs(query(collection(db, 'users'), orderBy('createdAt', 'desc')));
                const data = querySnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                setUsers(data);
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

    const handleUserClick = async (user: any) => {
        setSelectedUser(user);
        setIsModalOpen(true);
        setUserOrders([]);

        try {
            const ordersSnap = await getDocs(query(collection(db, 'orders'), where('userId', '==', user.id)));
            const ordersData = ordersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setUserOrders(ordersData);
        } catch (error) {
            console.error("Error fetching user orders:", error);
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

                // Use a batch to update both recharge status and user balance atomically
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
                    <p className="text-slate-500 font-medium">Administra clientes, administradores y sus fondos.</p>
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
                        Fondos y Recargas
                        {recharges.filter(r => r.status === 'pending').length > 0 && (
                            <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full font-black">
                                {recharges.filter(r => r.status === 'pending').length}
                            </span>
                        )}
                    </button>
                </div>
            </div>

            {activeTab === 'users' ? (
                <div className="bg-white rounded-[40px] border border-slate-100 overflow-hidden shadow-xl shadow-slate-200/40">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left whitespace-nowrap">
                            <thead className="bg-slate-50/50 text-slate-400 font-bold text-[10px] uppercase tracking-[0.2em] border-b border-slate-100">
                                <tr>
                                    <th className="px-8 py-5">Usuario</th>
                                    <th className="px-8 py-5">Contacto</th>
                                    <th className="px-8 py-5">Registro</th>
                                    <th className="px-8 py-5">Rol</th>
                                    <th className="px-8 py-5 text-right"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {users.map((user) => (
                                    <tr
                                        key={user.id}
                                        onClick={() => handleUserClick(user)}
                                        className="group hover:bg-slate-50/80 transition-all cursor-pointer"
                                    >
                                        <td className="px-8 py-5">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 rounded-full bg-slate-100 flex flex-col items-center justify-center shrink-0 overflow-hidden border border-slate-200 shadow-inner">
                                                    {user.photoURL ? (
                                                        <img src={user.photoURL} alt={user.name} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <User className="w-6 h-6 text-slate-400" />
                                                    )}
                                                </div>
                                                <div>
                                                    <div className="font-bold text-slate-900 group-hover:text-primary transition-colors">{user.name || 'Sin Nombre'}</div>
                                                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{user.id.slice(0, 8)}...</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-8 py-5">
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
                                            <div className="text-sm font-medium text-slate-600">
                                                {user.createdAt ? new Date(user.createdAt.toDate()).toLocaleDateString() : '-'}
                                            </div>
                                        </td>
                                        <td className="px-8 py-5">
                                            <span className={`inline-flex px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${user.role === 'restaurant' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-700'}`}>
                                                {user.role === 'restaurant' ? 'Restaurante' : 'Cliente'}
                                            </span>
                                        </td>
                                        <td className="px-8 py-5 text-right">
                                            <ChevronRight className="w-5 h-5 text-slate-200 group-hover:text-slate-400 transition-colors" />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                <div className="bg-white rounded-[40px] border border-slate-100 shadow-xl shadow-slate-200/40 p-6 md:p-8">
                    <h2 className="text-xl font-black text-slate-900 mb-6 flex items-center gap-3">
                        <Wallet className="w-6 h-6 text-primary" />
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
                                            <p className="text-3xl font-black text-slate-900">${parseFloat(recharge.amount).toFixed(2)}</p>
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
                                                <a href={recharge.proofUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-primary text-xs font-bold hover:underline bg-primary/5 px-3 py-1.5 rounded-lg mt-2 transition-colors">
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

            {/* User Detail Modal */}
            {isModalOpen && selectedUser && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}></div>
                    <div className="relative bg-white w-full max-w-2xl rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
                        <div className="p-10">
                            <div className="flex justify-between items-start mb-10">
                                <div className="flex items-center gap-6">
                                    <div className="w-24 h-24 rounded-[32px] bg-slate-100 flex items-center justify-center border-4 border-slate-50 shadow-inner shrink-0 overflow-hidden">
                                        {selectedUser.photoURL ? (
                                            <img src={selectedUser.photoURL} alt={selectedUser.name} className="w-full h-full object-cover" />
                                        ) : (
                                            <User className="w-12 h-12 text-slate-300" />
                                        )}
                                    </div>
                                    <div>
                                        <h2 className="text-3xl font-black text-slate-900">{selectedUser.name || 'Sin Nombre'}</h2>
                                        <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] mt-1">ID: {selectedUser.id}</p>
                                        <div className="flex items-center gap-2 mt-4">
                                            <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${selectedUser.role === 'restaurant' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                                {selectedUser.role === 'restaurant' ? 'Administrador de Local' : 'Cliente Arepero'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setIsModalOpen(false)}
                                    className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-all border border-slate-100"
                                >
                                    <X className="w-6 h-6" />
                                </button>
                            </div>

                            {/* Wallet Balance Display in Modal */}
                            <div className="mb-8 bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-6 text-white flex items-center justify-between shadow-xl">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-md border border-white/20">
                                        <Wallet className="w-6 h-6 text-emerald-400" />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Fondos Billetera 2X3</p>
                                        <p className="text-3xl font-black">${(selectedUser.walletBalance || 0).toFixed(2)}</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <span className="text-xs font-bold text-slate-400 bg-white/5 px-3 py-1.5 rounded-full border border-white/10">Sólo Transporte</span>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-8">
                                <div className="space-y-6">
                                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2 border-b border-slate-50 pb-3">Información</h3>
                                    <div className="space-y-4">
                                        <InfoItem icon={Mail} label="Correo" value={selectedUser.email || 'No proporcionado'} />
                                        <InfoItem icon={Phone} label="Teléfono" value={selectedUser.phone || 'No proporcionado'} />
                                        <InfoItem icon={Calendar} label="Miembro desde" value={selectedUser.createdAt ? new Date(selectedUser.createdAt.toDate()).toLocaleDateString() : 'N/A'} />
                                        <InfoItem icon={MapPin} label="Ubicación" value={selectedUser.address || 'Venezuela'} />
                                    </div>
                                </div>
                                <div className="space-y-6">
                                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2 border-b border-slate-50 pb-3">Actividad</h3>
                                    <div className="grid grid-cols-2 gap-4">
                                        <ActivityStat icon={ShoppingBag} label="Pedidos" value={userOrders.length.toString()} color="text-emerald-500" bg="bg-emerald-50" />
                                        <ActivityStat icon={Heart} label="Favoritos" value={(selectedUser.favorites?.length || 0).toString()} color="text-red-500" bg="bg-red-50" />
                                    </div>
                                    <div className="p-6 rounded-[32px] bg-slate-50 border border-slate-100">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Gasto Histórico</p>
                                        <h4 className="text-2xl font-black text-slate-900">
                                            ${userOrders.reduce((acc, order) => acc + (order.total || 0), 0).toFixed(2)}
                                        </h4>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="p-8 bg-slate-50 border-t border-slate-100 flex gap-4">
                            <button className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-slate-900/20">
                                CONTACTAR POR WHATSAPP
                            </button>
                            <button className="flex-1 py-4 bg-white border border-slate-200 text-red-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-red-50 transition-colors">
                                BANEAR USUARIO
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
                <Icon className="w-5 h-5 text-slate-400" />
            </div>
            <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
                <p className="text-sm font-bold text-slate-700 truncate max-w-[180px]">{value}</p>
            </div>
        </div>
    );
}

function ActivityStat({ icon: Icon, label, value, color, bg }: { icon: any, label: string, value: string, color: string, bg: string }) {
    return (
        <div className={`p-4 ${bg} rounded-[28px] border border-transparent hover:border-slate-200 transition-all`}>
            <Icon className={`w-5 h-5 ${color} mb-2`} />
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
            <p className={`text-xl font-black ${color.replace('text-', 'text-slate-900')}`}>{value}</p>
        </div>
    );
}
