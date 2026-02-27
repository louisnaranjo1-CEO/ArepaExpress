import { User, Mail, MapPin, CreditCard, LogOut, ShoppingBag, Settings, ChevronRight, Clock, FileText, Bell } from 'lucide-react';
import { requestNotificationPermission, disableNotifications } from '../lib/notifications';
import { useAuth } from '../context/AuthContext';
import { auth, db } from '../lib/firebase';
import { useNavigate } from 'react-router-dom';
import { signInWithGoogle } from '../lib/auth-service';
import { useState, useEffect, useRef } from 'react';
import { collection, query, where, orderBy, getDocs, doc, setDoc } from 'firebase/firestore';
import AddressPicker from '../components/AddressPicker';

interface OrderInfo {
    id: string;
    total: number;
    status: string;
    createdAt: any;
    items: any[];
}

export default function Profile() {
    const { user, userData } = useAuth();
    const navigate = useNavigate();
    const [isSigningIn, setIsSigningIn] = useState(false);
    const [orders, setOrders] = useState<OrderInfo[]>([]);
    const [loadingOrders, setLoadingOrders] = useState(false);
    const [showAddressPicker, setShowAddressPicker] = useState(false);
    const [updatingNotifications, setUpdatingNotifications] = useState(false);
    const ordersRef = useRef<HTMLDivElement>(null);

    const scrollToOrders = () => {
        ordersRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        const fetchOrders = async () => {
            if (!user) return;
            setLoadingOrders(true);
            try {
                const q = query(
                    collection(db, 'orders'),
                    where('userId', '==', user.uid),
                    orderBy('createdAt', 'desc')
                );
                const querySnapshot = await getDocs(q);
                const fetchedOrders = querySnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                })) as OrderInfo[];
                setOrders(fetchedOrders);
            } catch (err) {
                console.error("Error fetching orders:", err);
            } finally {
                setLoadingOrders(false);
            }
        };

        if (user) {
            fetchOrders();
        }
    }, [user]);

    const [error, setError] = useState<string | null>(null);

    const handleGoogleSignIn = async () => {
        setIsSigningIn(true);
        setError(null);
        try {
            await signInWithGoogle();
        } catch (err: any) {
            console.error("Failed to sign in", err);
            setError(err.message || "Error al iniciar sesión con Google");
        } finally {
            setIsSigningIn(false);
        }
    };

    const handleDeleteAddress = async (addressId: string) => {
        if (!user || (!userData?.addresses)) return;
        const newAddresses = userData.addresses.filter(a => a.id !== addressId);
        try {
            await setDoc(doc(db, 'users', user.uid), { addresses: newAddresses }, { merge: true });
        } catch (e) {
            console.error("Error deleting address", e);
            alert("No se pudo eliminar la dirección.");
        }
    };

    const handleSetDefaultAddress = async (addressId: string) => {
        if (!user || (!userData?.addresses)) return;
        const newAddresses = userData.addresses.map(a => ({
            ...a,
            isDefault: a.id === addressId
        }));
        try {
            await setDoc(doc(db, 'users', user.uid), { addresses: newAddresses }, { merge: true });
        } catch (e) {
            console.error("Error setting default address", e);
            alert("No se pudo establecer como predeterminada.");
        }
    };

    const handleLogout = async () => {
        await auth.signOut();
        navigate('/');
    };

    const handleToggleNotifications = async () => {
        if (!user) return;
        setUpdatingNotifications(true);
        try {
            const isEnabled = userData?.fcmTokens && userData.fcmTokens.length > 0;
            if (isEnabled) {
                await disableNotifications(user.uid);
                alert("Notificaciones desactivadas.");
            } else {
                const success = await requestNotificationPermission(user.uid);
                if (success) {
                    alert("Notificaciones activadas con éxito! 🎉");
                }
            }
        } catch (err) {
            console.error("Error toggling notifications", err);
        } finally {
            setUpdatingNotifications(false);
        }
    };

    if (!user) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[80vh] px-6 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="w-32 h-32 bg-primary/10 rounded-full flex items-center justify-center mb-6">
                    <User className="w-16 h-16 text-primary" />
                </div>
                <h1 className="text-3xl font-black text-slate-900 mb-2">¡Hola, Arepa Lover! 🫓</h1>
                <p className="text-slate-500 mb-8 max-w-[280px]">
                    Ingresa para guardar tus restaurantes favoritos y pedir lo que más te gusta.
                </p>
                {error && (
                    <div className="mb-4 p-4 bg-red-50 text-red-600 rounded-2xl text-xs font-bold animate-in shake-in duration-300">
                        {error}
                    </div>
                )}
                <div className="space-y-4 w-full max-w-xs relative">
                    <button
                        onClick={handleGoogleSignIn}
                        disabled={isSigningIn}
                        className="w-full bg-primary text-white py-4 rounded-2xl font-bold shadow-lg shadow-primary/30 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-70 disabled:hover:scale-100 flex items-center justify-center gap-2"
                    >
                        {isSigningIn ? (
                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                            <>
                                <svg className="w-5 h-5" viewBox="0 0 24 24">
                                    <path
                                        fill="currentColor"
                                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                                    />
                                    <path
                                        fill="currentColor"
                                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                                    />
                                    <path
                                        fill="currentColor"
                                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                                    />
                                    <path
                                        fill="currentColor"
                                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                                    />
                                </svg>
                                Entrar con Google
                            </>
                        )}
                    </button>
                    <button className="w-full bg-white text-primary border-2 border-primary py-4 rounded-2xl font-bold hover:bg-primary/5 transition-colors">
                        Crear Cuenta
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="pb-24 animate-in fade-in duration-500">
            <div className="bg-gradient-to-br from-primary to-orange-400 p-8 pt-12 pb-16 text-white rounded-b-[40px] shadow-xl">
                <div className="flex items-center gap-4">
                    <div className="w-20 h-20 bg-white/20 backdrop-blur-md rounded-full border-4 border-white/30 flex items-center justify-center overflow-hidden shadow-inner">
                        {user.photoURL ? (
                            <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" />
                        ) : (
                            <User className="w-10 h-10 text-white" />
                        )}
                    </div>
                    <div>
                        <h2 className="text-2xl font-black">{user.displayName || 'Arepa Fan'}</h2>
                        <div className="flex items-center gap-1 text-white/80 text-sm">
                            <Mail className="w-3 h-3" />
                            <span>{user.email}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="px-6 -mt-8">
                <div className="bg-white rounded-3xl p-6 shadow-xl shadow-slate-200/50 space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                        <div
                            onClick={scrollToOrders}
                            className="bg-orange-50 p-4 rounded-2xl flex flex-col items-center gap-2 group cursor-pointer hover:bg-orange-100 transition-colors"
                        >
                            <ShoppingBag className="w-6 h-6 text-orange-500 group-hover:scale-110 transition-transform" />
                            <span className="text-xs font-bold text-slate-600">Mis Pedidos</span>
                        </div>
                        <div
                            onClick={() => setShowAddressPicker(true)}
                            className={`p-4 rounded-2xl flex flex-col items-center gap-2 group cursor-pointer transition-colors ${userData?.address ? 'bg-green-50 hover:bg-green-100' : 'bg-blue-50 hover:bg-blue-100'}`}
                        >
                            <MapPin className={`w-6 h-6 group-hover:scale-110 transition-transform ${userData?.address ? 'text-green-500' : 'text-blue-500'}`} />
                            <span className="text-xs font-bold text-slate-600">
                                {userData?.address ? 'Cambiar Dirección' : 'Direcciones'}
                            </span>
                        </div>
                    </div>

                    {(userData?.addresses && userData.addresses.length > 0) && (
                        <div className="space-y-3 mt-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-lg font-black text-slate-900 px-2 flex items-center gap-2">
                                    <MapPin className="w-5 h-5 text-primary" />
                                    Mis Direcciones
                                </h3>
                            </div>
                            <div className="grid gap-3">
                                {userData.addresses.map(addr => (
                                    <div key={addr.id} className={`p-4 rounded-2xl border ${addr.isDefault ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-100'} transition-colors`}>
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="flex items-center gap-2">
                                                <span className={`px-2 py-0.5 rounded text-xs font-bold ${addr.isDefault ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-700'}`}>
                                                    {addr.name}
                                                </span>
                                                {addr.isDefault && (
                                                    <span className="text-[10px] uppercase font-bold text-green-600 tracking-wider">Predeterminada</span>
                                                )}
                                            </div>
                                            <div className="flex gap-2">
                                                {!addr.isDefault && (
                                                    <button onClick={() => handleSetDefaultAddress(addr.id)} className="text-xs font-bold text-blue-500 hover:text-blue-600 transition-colors">
                                                        Fijar
                                                    </button>
                                                )}
                                                <button onClick={() => handleDeleteAddress(addr.id)} className="text-xs font-bold text-red-400 hover:text-red-500 transition-colors">
                                                    Eliminar
                                                </button>
                                            </div>
                                        </div>
                                        <p className="text-sm font-bold text-slate-700 leading-tight">{addr.reference}</p>
                                        <p className="text-[10px] text-slate-400 font-medium mt-1">GPS: {addr.lat.toFixed(4)}, {addr.lng.toFixed(4)}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Order History */}
                    <div ref={ordersRef} className="space-y-4 pt-2">
                        <h3 className="text-lg font-black text-slate-900 px-2 flex items-center gap-2">
                            <FileText className="w-5 h-5 text-primary" />
                            Últimos Pedidos
                        </h3>

                        {loadingOrders ? (
                            <div className="flex justify-center py-4">
                                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                            </div>
                        ) : orders.length > 0 ? (
                            <div className="space-y-3">
                                {orders.map(order => (
                                    <div key={order.id} className="bg-slate-50 border border-slate-100 p-4 rounded-2xl flex flex-col gap-2">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <p className="font-bold text-slate-900 text-sm">Pedido #{order.id.slice(-6).toUpperCase()}</p>
                                                <div className="flex items-center gap-1 text-xs text-slate-500 mt-1">
                                                    <Clock className="w-3 h-3" />
                                                    <span>{order.createdAt?.toDate().toLocaleDateString()} a las {order.createdAt?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                </div>
                                            </div>
                                            <span className={`px-2 py-1 rounded text-xs font-bold ${order.status === 'pending' ? 'bg-orange-100 text-orange-600' :
                                                order.status === 'completed' ? 'bg-green-100 text-green-600' :
                                                    'bg-slate-200 text-slate-600'
                                                }`}>
                                                {order.status === 'pending' ? 'Pendiente' :
                                                    order.status === 'completed' ? 'Completado' : 'Cancelado'}
                                            </span>
                                        </div>
                                        <div className="h-px bg-slate-200 my-1"></div>
                                        <div className="flex justify-between items-end">
                                            <div className="text-xs text-slate-500">
                                                {order.items.length} artículo{order.items.length !== 1 ? 's' : ''}
                                            </div>
                                            <span className="font-black text-primary text-base">${order.total.toFixed(2)}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="bg-slate-50 border border-slate-100 p-6 rounded-2xl text-center flex flex-col items-center justify-center">
                                <ShoppingBag className="w-8 h-8 text-slate-300 mb-2" />
                                <p className="text-sm font-bold text-slate-500">Aún no tienes pedidos</p>
                                <p className="text-xs text-slate-400 mt-1">¡Ve a explorar nuestros restaurantes!</p>
                            </div>
                        )}
                    </div>

                    <div className="space-y-2 pt-2 border-t border-slate-100">
                        <h3 className="text-lg font-black text-slate-900 px-2">Ajustes</h3>
                        <div className="space-y-1">
                            <div className="w-full flex items-center justify-between p-4 bg-slate-50 rounded-2xl transition-colors">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm">
                                        <Bell className="w-5 h-5 text-blue-500" />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="font-bold text-slate-700">Notificaciones</span>
                                        <span className="text-[10px] text-slate-400 font-medium">Recibe promos y actualizaciones</span>
                                    </div>
                                </div>
                                <button
                                    onClick={handleToggleNotifications}
                                    disabled={updatingNotifications}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${userData?.fcmTokens && userData.fcmTokens.length > 0 ? 'bg-primary' : 'bg-slate-300'
                                        }`}
                                >
                                    <span
                                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${userData?.fcmTokens && userData.fcmTokens.length > 0 ? 'translate-x-6' : 'translate-x-1'
                                            }`}
                                    />
                                </button>
                            </div>

                            <button

                                onClick={handleLogout}
                                className="w-full flex items-center justify-between p-4 hover:bg-red-50 rounded-2xl transition-colors cursor-pointer group mt-4"
                            >
                                <div className="flex items-center gap-3 text-red-500">
                                    <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center">
                                        <LogOut className="w-5 h-5" />
                                    </div>
                                    <span className="font-bold">Cerrar Sesión</span>
                                </div>
                            </button>
                        </div>
                    </div>
                </div>

                <div className="mt-8 text-center p-6 grayscale opacity-50">
                    <img src="/logo.png" alt="Arepa Express" className="h-8 mx-auto mb-2" onError={(e) => e.currentTarget.style.display = 'none'} />
                    <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400">Hecho con ❤️ en Venezuela</p>
                </div>
            </div>

            {showAddressPicker && user && (
                <AddressPicker
                    onClose={() => setShowAddressPicker(false)}
                    onSave={async (addressData) => {
                        try {
                            const currentAddresses = userData?.addresses || [];
                            const isFirst = currentAddresses.length === 0 && !userData?.address;

                            const newAddress = {
                                id: Date.now().toString(),
                                name: addressData.name,
                                lat: addressData.lat,
                                lng: addressData.lng,
                                reference: addressData.reference,
                                isDefault: isFirst || currentAddresses.length === 0
                            };

                            const userRef = doc(db, 'users', user.uid);
                            await setDoc(userRef, {
                                addresses: [...currentAddresses, newAddress]
                            }, { merge: true });
                            setShowAddressPicker(false);
                        } catch (err) {
                            console.error("Error saving address:", err);
                            alert("No se pudo guardar la dirección. Por favor intenta de nuevo.");
                        }
                    }}
                />
            )}
        </div>
    );
}
