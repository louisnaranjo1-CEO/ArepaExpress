import React, { useState, useEffect } from 'react';
import { ArrowLeft, Bell, BellOff, ChevronRight, Clock, Trash2, Utensils } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, query, where, orderBy, getDocs, doc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';

export default function Notifications() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [notifications, setNotifications] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) return;

        const fetchNotifications = async () => {
            try {
                const q = query(
                    collection(db, 'notifications'),
                    where('userId', '==', user.uid),
                    orderBy('createdAt', 'desc')
                );
                const querySnapshot = await getDocs(q);
                const fetched = querySnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                setNotifications(fetched);
            } catch (error) {
                console.error("Error fetching notifications:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchNotifications();
    }, [user]);

    const markAsRead = async (id: string, restaurantId?: string) => {
        try {
            const notifRef = doc(db, 'notifications', id);
            await updateDoc(notifRef, { read: true });
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));

            if (restaurantId) {
                navigate(`/restaurant/${restaurantId}`);
            }
        } catch (error) {
            console.error("Error marking notification as read:", error);
        }
    };

    const clearAll = async () => {
        if (!user || notifications.length === 0) return;
        if (!confirm("¿Estás seguro de que quieres eliminar todas las notificaciones?")) return;

        try {
            const batch = writeBatch(db);
            notifications.forEach(n => {
                const ref = doc(db, 'notifications', n.id);
                batch.delete(ref);
            });
            await batch.commit();
            setNotifications([]);
        } catch (error) {
            console.error("Error clearing notifications:", error);
        }
    };

    if (!user) {
        return (
            <div className="flex flex-col items-center justify-center h-full p-6 text-center space-y-4">
                <div className="p-4 bg-slate-100 rounded-full">
                    <BellOff className="w-12 h-12 text-slate-400" />
                </div>
                <h2 className="text-xl font-bold text-slate-900">Inicia sesión</h2>
                <p className="text-slate-500">Debes estar registrado para recibir notificaciones de tus restaurantes favoritos.</p>
                <Link to="/profile" className="px-6 py-3 bg-primary text-white font-black rounded-xl shadow-lg">Ir a mi perfil</Link>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-slate-50">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-md px-5 py-6 flex items-center justify-between border-b border-slate-100">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate(-1)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                        <ArrowLeft className="w-6 h-6 text-slate-900" />
                    </button>
                    <h1 className="text-xl font-black text-slate-900">Notificaciones</h1>
                </div>
                {notifications.length > 0 && (
                    <button onClick={clearAll} className="p-2 text-slate-400 hover:text-red-500 transition-colors" title="Limpiar todo">
                        <Trash2 className="w-5 h-5" />
                    </button>
                )}
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-5 pb-24">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 space-y-4">
                        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                        <p className="text-slate-500 font-medium">Cargando...</p>
                    </div>
                ) : notifications.length > 0 ? (
                    <div className="space-y-3">
                        {notifications.map((notif) => (
                            <button
                                key={notif.id}
                                onClick={() => markAsRead(notif.id, notif.restaurantId)}
                                className={`w-full flex items-start gap-4 p-4 rounded-3xl transition-all border ${notif.read
                                        ? 'bg-white border-slate-100 opacity-70'
                                        : 'bg-white border-primary/20 shadow-md shadow-primary/5 ring-1 ring-primary/5'
                                    }`}
                            >
                                <div className={`p-3 rounded-2xl flex-shrink-0 ${notif.read ? 'bg-slate-100 text-slate-400' : 'bg-primary/10 text-primary'
                                    }`}>
                                    <Utensils className="w-5 h-5" />
                                </div>
                                <div className="flex-1 text-left min-w-0">
                                    <div className="flex items-center justify-between gap-2 mb-1">
                                        <p className={`text-xs font-black uppercase tracking-wider truncate transition-colors ${notif.read ? 'text-slate-400' : 'text-primary'}`}>
                                            {notif.restaurantName}
                                        </p>
                                        <div className="flex items-center gap-1 text-[10px] text-slate-400 font-medium flex-shrink-0">
                                            <Clock className="w-3 h-3" />
                                            {notif.createdAt?.toDate ? notif.createdAt.toDate().toLocaleDateString() : 'Hoy'}
                                        </div>
                                    </div>
                                    <h4 className={`text-sm font-bold text-slate-900 mb-1 ${notif.read ? 'font-medium' : ''}`}>
                                        {notif.title}
                                    </h4>
                                    <p className="text-[12px] text-slate-500 line-clamp-2 leading-relaxed">
                                        {notif.body}
                                    </p>
                                </div>
                                {!notif.read && (
                                    <div className="w-2.5 h-2.5 rounded-full bg-primary mt-1 shadow-sm"></div>
                                )}
                            </button>
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-20 px-10 text-center space-y-4">
                        <div className="p-5 bg-white rounded-full shadow-sm border border-slate-100">
                            <Bell className="w-10 h-10 text-slate-200" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-slate-900">Todo al día</h3>
                            <p className="text-sm text-slate-400 mt-1">No tienes nuevas actualizaciones de tus restaurantes favoritos.</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
