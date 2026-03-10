import React, { useState, useEffect, useRef } from 'react';
import { User, Mail, MapPin, CreditCard, LogOut, ShoppingBag, Settings, ChevronRight, Clock, FileText, Bell, Navigation, X, Shield, UploadCloud, Star } from 'lucide-react';
import { requestNotificationPermission, disableNotifications } from '../lib/notifications';
import { useAuth } from '../context/AuthContext';
import { auth, db, storage } from '../lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useNavigate } from 'react-router-dom';
import { signInWithGoogle, signInWithEmail, signUpWithEmail } from '../lib/auth-service';
import { collection, query, where, orderBy, getDocs, doc, setDoc, serverTimestamp, collectionGroup, getDoc, updateDoc } from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';
import { Image as ImageIcon, Camera, Smartphone, User as UserIcon, Save } from 'lucide-react';
import AddressPicker from '../components/AddressPicker';
import { motion, AnimatePresence } from 'framer-motion';
import ReviewModal from '../components/ReviewModal';

interface OrderInfo {
    id: string;
    total: number;
    status: string;
    createdAt: any;
    items: any[];
    deliveryMethod?: string;
    hasReviewed?: boolean;
    restaurantId?: string;
}

export default function Profile() {
    const { user, userData, isProfileComplete } = useAuth();
    const navigate = useNavigate();
    const [isSigningIn, setIsSigningIn] = useState(false);
    const [orders, setOrders] = useState<OrderInfo[]>([]);
    const [loadingOrders, setLoadingOrders] = useState(false);
    const [showAddressPicker, setShowAddressPicker] = useState(false);
    const [showEditProfileModal, setShowEditProfileModal] = useState(false);
    const [updatingNotifications, setUpdatingNotifications] = useState(false);
    const [completingProfile, setCompletingProfile] = useState(false);
    const [reviewModalData, setReviewModalData] = useState<{ isOpen: boolean; orderId: string; restaurantId: string } | null>(null);
    const ordersRef = useRef<HTMLDivElement>(null);

    // Profile completion form state
    const [profileForm, setProfileForm] = useState({
        displayName: '',
        phone: '',
        cedula: ''
    });

    // Email Login/Signup State
    const [showEmailModal, setShowEmailModal] = useState(false);
    const [isLoginMode, setIsLoginMode] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [isEmailAuthLoading, setIsEmailAuthLoading] = useState(false);
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [logoPreview, setLogoPreview] = useState<string | null>(null);

    useEffect(() => {
        if (userData) {
            setProfileForm({
                displayName: userData.displayName || user?.displayName || '',
                phone: userData.phone || '',
                cedula: userData.cedula || ''
            });
        }
    }, [userData, user]);

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
                const fetchedOrders = querySnapshot.docs.map(doc => {
                    const data = doc.data();
                    // Identify the restaurant ID from the first item if not globally set
                    const restId = data.restaurantId || (data.items && data.items.length > 0 ? data.items[0].restaurantId : null);

                    return {
                        id: doc.id,
                        restaurantId: restId,
                        ...data
                    } as OrderInfo;
                });
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
    const [activeFaq, setActiveFaq] = useState<number | null>(null);

    const FAQ_DATA = [
        {
            q: "¿Qué es 2x3?",
            a: "Es la aplicación móvil todo-en-uno que conecta a nivel nacional a restaurantes, supermercados, bodegas y emprendimientos con los usuarios. Es una plataforma diseñada para facilitar compras sin colas, ofrecer servicios de delivery y transporte, y potenciar el crecimiento tecnológico de los negocios locales."
        },
        {
            q: "¿Qué productos o servicios puedo encontrar en 2x3?",
            a: "¡Prácticamente todo! Puedes explorar catálogos de comida, artículos de primera necesidad y servicios profesionales. Además, contamos con una red integrada de Delivery y Taxi siempre disponible para llevarte lo que necesites o trasladarte a donde desees."
        },
        {
            q: "¿Cómo puedo ser aliado a 2x3?",
            a: "Es muy sencillo transformar tu negocio. Solo debes ingresar a la aplicación y enviar tu solicitud formal a través de la sección \"Ser Aliado\". Al unirte, recibirás acceso a nuestro panel administrativo, sistema de comandas y herramientas de publicidad interna."
        }
    ];

    // Role-based automatic redirection
    useEffect(() => {
        if (user && userData) {
            const checkRoleAndRedirect = async () => {
                // If it's a delivery driver or taxi
                if (userData.role === 'delivery' || userData.role === 'driver') {
                    navigate('/delivery');
                    return;
                }

                // Double check delivery_drivers collection if role isn't explicitly set in users
                const driverDoc = await getDoc(doc(db, 'delivery_drivers', user.uid));
                if (driverDoc.exists()) {
                    navigate('/delivery');
                    return;
                }

                // If it's a waiter
                if (userData.role === 'waiter') {
                    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
                    if (isLocalhost) {
                        window.location.href = `${window.location.protocol}//meseros.localhost:${window.location.port}`;
                    } else {
                        window.location.href = 'https://meseros.deliexpress.app';
                    }
                    return;
                }
            };
            checkRoleAndRedirect();
        }
    }, [user, userData, navigate]);

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

    const handleEmailAuthSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsEmailAuthLoading(true);
        setError(null);
        try {
            if (isLoginMode) {
                await signInWithEmail(email, password);
            } else {
                if (!fullName) {
                    setError("Por favor ingresa tu nombre completo.");
                    setIsEmailAuthLoading(false);
                    return;
                }
                await signUpWithEmail(email, password, fullName);
            }
            setShowEmailModal(false);
            // Reset form
            setEmail('');
            setPassword('');
            setFullName('');
        } catch (err: any) {
            console.error("Email auth error", err);
            setError(err.message || "Ocurrió un error. Intenta de nuevo.");
        } finally {
            setIsEmailAuthLoading(false);
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
            const isEnabled = userData?.notificationsEnabled || (userData?.fcmTokens && userData.fcmTokens.length > 0);
            if (isEnabled) {
                await disableNotifications(user.uid);
                alert("Notificaciones desactivadas.");
            } else {
                const result = await requestNotificationPermission(user.uid);
                if (result.success) {
                    alert("Notificaciones activadas con éxito! 🎉");
                } else if (result.error) {
                    alert(result.error);
                }
            }
        } catch (err) {
            console.error("Error toggling notifications", err);
            alert("Ocurrió un error al procesar tu solicitud.");
        } finally {
            setUpdatingNotifications(false);
        }
    };

    const handleCompleteProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        if (!profileForm.displayName || !profileForm.phone || !profileForm.cedula) {
            alert("Por favor completa todos los campos (Nombre, Celular y Cédula).");
            return;
        }

        setCompletingProfile(true);
        try {
            let photoURL = user.photoURL;

            if (logoFile) {
                const storageRef = ref(storage, `users/${user.uid}/profile_${Date.now()}`);
                const snapshot = await uploadBytes(storageRef, logoFile);
                photoURL = await getDownloadURL(snapshot.ref);

                // Update Firebase Auth profile
                await updateProfile(user, { photoURL });
            }

            const updateData = {
                displayName: profileForm.displayName,
                phone: profileForm.phone,
                cedula: profileForm.cedula,
                photoURL,
                updatedAt: serverTimestamp()
            };

            await setDoc(doc(db, 'users', user.uid), updateData, { merge: true });

            // If explicit update profile was triggered from modal, we might want to close it here
            setShowEditProfileModal(false);
            setLogoFile(null);
            setLogoPreview(null);
        } catch (e) {
            console.error("Error updating profile", e);
            alert("Ocurrió un error al guardar tus datos.");
        } finally {
            setCompletingProfile(false);
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
                    <button
                        onClick={() => {
                            setIsLoginMode(true);
                            setShowEmailModal(true);
                        }}
                        className="w-full bg-white text-slate-700 border-2 border-slate-100 py-4 rounded-2xl font-bold hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
                    >
                        <Mail className="w-5 h-5 text-slate-400" />
                        Entrar con Correo
                    </button>
                    <button
                        onClick={() => {
                            setIsLoginMode(false);
                            setShowEmailModal(true);
                        }}
                        className="w-full bg-white text-primary border-2 border-primary py-4 rounded-2xl font-bold hover:bg-primary/5 transition-colors"
                    >
                        Crear Cuenta
                    </button>
                    <div className="flex items-center gap-4 my-2">
                        <div className="h-px bg-slate-100 flex-1"></div>
                        <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">¿trabajas con nuestros aliados?</span>
                        <div className="h-px bg-slate-100 flex-1"></div>
                    </div>
                    <button
                        onClick={() => {
                            const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
                            if (isLocalhost) {
                                window.location.href = `${window.location.protocol}//meseros.localhost:${window.location.port}`;
                            } else {
                                window.location.href = 'https://meseros.deliexpress.app';
                            }
                        }}
                        className="w-full bg-slate-50 text-slate-500 py-4 rounded-2xl font-bold hover:bg-slate-100 transition-colors flex items-center justify-center gap-2"
                    >
                        <Shield className="w-5 h-5 opacity-50" />
                        Acceso Meseros
                    </button>

                    <div className="flex items-center gap-4 my-2 pt-2">
                        <div className="h-px bg-slate-100 flex-1"></div>
                        <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Emprende y se un freelancer en un 2x3</span>
                        <div className="h-px bg-slate-100 flex-1"></div>
                    </div>
                    <button
                        onClick={() => navigate('/delivery')}
                        className="w-full bg-indigo-50 text-indigo-600 py-4 rounded-2xl font-bold hover:bg-indigo-100 transition-colors flex items-center justify-center gap-2"
                    >
                        <Navigation className="w-5 h-5 opacity-50" />
                        Acceso Delivery / Taxi
                    </button>
                </div>

                {/* Email Login/Signup Modal */}
                <AnimatePresence>
                    {showEmailModal && (
                        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
                            <motion.div
                                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                                className="bg-white rounded-[32px] w-full max-w-sm shadow-2xl overflow-hidden"
                            >
                                <div className="p-8 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
                                    <div>
                                        <h3 className="text-xl font-black text-slate-900">
                                            {isLoginMode ? "Iniciar Sesión" : "Crear Cuenta"}
                                        </h3>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
                                            Arepa Lover 🫓
                                        </p>
                                    </div>
                                    <button onClick={() => setShowEmailModal(false)} className="p-2 hover:bg-slate-200 rounded-xl transition-all">
                                        <X className="w-5 h-5 text-slate-400" />
                                    </button>
                                </div>

                                <form onSubmit={handleEmailAuthSubmit} className="p-8 space-y-4">
                                    {!isLoginMode && (
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nombre Completo</label>
                                            <input
                                                type="text"
                                                required
                                                value={fullName}
                                                onChange={(e) => setFullName(e.target.value)}
                                                placeholder="Ej: Juan Pérez"
                                                className="w-full bg-slate-50 border-2 border-slate-100 focus:border-primary px-4 py-3 rounded-2xl outline-none font-bold text-slate-700 transition-all"
                                            />
                                        </div>
                                    )}

                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Correo Electrónico</label>
                                        <input
                                            type="email"
                                            required
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            placeholder="tu@correo.com"
                                            className="w-full bg-slate-50 border-2 border-slate-100 focus:border-primary px-4 py-3 rounded-2xl outline-none font-bold text-slate-700 transition-all"
                                        />
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Contraseña</label>
                                        <input
                                            type="password"
                                            required
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            placeholder="••••••••"
                                            className="w-full bg-slate-50 border-2 border-slate-100 focus:border-primary px-4 py-3 rounded-2xl outline-none font-bold text-slate-700 transition-all"
                                        />
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={isEmailAuthLoading}
                                        className="w-full bg-primary text-white py-4 rounded-2xl font-bold shadow-lg shadow-primary/30 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-70 mt-4 flex items-center justify-center gap-2"
                                    >
                                        {isEmailAuthLoading ? (
                                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                        ) : (
                                            isLoginMode ? "Entrar" : "Registrarme"
                                        )}
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setIsLoginMode(!isLoginMode)}
                                        className="w-full text-slate-400 font-bold py-2 mt-2 hover:text-primary transition-colors text-xs"
                                    >
                                        {isLoginMode ? "¿No tienes cuenta? Regístrate" : "¿Ya tienes cuenta? Inicia sesión"}
                                    </button>
                                </form>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

                {/* Waiter Login Modal removed, now redirects to subdomain */}
            </div>
        );
    }

    // Profile Completion Overlay/View
    if (user && !isProfileComplete) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[80vh] px-6 py-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mb-6">
                    <User className="w-12 h-12 text-primary" />
                </div>
                <h1 className="text-2xl font-black text-slate-900 mb-2 text-center">¡Un paso más! 🚀</h1>
                <p className="text-slate-500 mb-8 max-w-[280px] text-center">
                    Necesitamos estos datos para poder procesar tus pedidos correctamente.
                </p>

                <form onSubmit={handleCompleteProfile} className="w-full max-w-sm space-y-4">
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Nombre Completo</label>
                        <input
                            type="text"
                            required
                            value={profileForm.displayName}
                            onChange={(e) => setProfileForm({ ...profileForm, displayName: e.target.value })}
                            className="w-full bg-slate-50 border-2 border-slate-100 focus:border-primary px-4 py-4 rounded-2xl outline-none font-bold text-slate-700 transition-all"
                            placeholder="Ej. Juan Pérez"
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Número de Celular</label>
                        <input
                            type="tel"
                            required
                            value={profileForm.phone}
                            onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                            className="w-full bg-slate-50 border-2 border-slate-100 focus:border-primary px-4 py-4 rounded-2xl outline-none font-bold text-slate-700 transition-all"
                            placeholder="Ej. 04141234567"
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Cédula de Identidad</label>
                        <input
                            type="text"
                            required
                            value={profileForm.cedula}
                            onChange={(e) => setProfileForm({ ...profileForm, cedula: e.target.value })}
                            className="w-full bg-slate-50 border-2 border-slate-100 focus:border-primary px-4 py-4 rounded-2xl outline-none font-bold text-slate-700 transition-all"
                            placeholder="Ej. V-12345678"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={completingProfile}
                        className="w-full bg-primary text-white py-4 rounded-2xl font-bold shadow-lg shadow-primary/30 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-70 mt-4 flex items-center justify-center gap-2"
                    >
                        {completingProfile ? (
                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                            "Completar Mi Perfil"
                        )}
                    </button>
                </form>

                <button
                    onClick={handleLogout}
                    className="mt-6 text-slate-400 font-bold hover:text-red-500 transition-colors text-sm"
                >
                    Cerrar Sesión
                </button>
            </div>
        );
    }

    return (
        <>
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
                        <div className="flex-1">
                            <h2 className="text-2xl font-black">{user.displayName || 'Arepa Fan'}</h2>
                            <div className="flex items-center gap-1 text-white/80 text-sm">
                                <Mail className="w-3 h-3" />
                                <span>{user.email}</span>
                            </div>
                        </div>
                        <button
                            onClick={() => setShowEditProfileModal(true)}
                            className="bg-white/20 backdrop-blur-md p-3 rounded-2xl hover:bg-white/30 transition-all active:scale-95"
                        >
                            <Settings className="w-5 h-5 text-white" />
                        </button>
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
                                            {/* Tracking Button for App Delivery */}
                                            {order.deliveryMethod === 'app_delivery' && (order.status === 'finding_driver' || order.status === 'driver_assigned' || order.status === 'in_transit') && (
                                                <button
                                                    onClick={() => navigate(`/track/${order.id}`)}
                                                    className="mt-2 w-full bg-indigo-50 text-indigo-600 font-bold py-3 rounded-xl flex justify-center items-center gap-2 active:scale-95 transition-transform"
                                                >
                                                    <Navigation className="w-4 h-4" /> Rastrear Pedido
                                                </button>
                                            )}

                                            {/* Leave Review Button */}
                                            {order.status === 'completed' && !order.hasReviewed && order.restaurantId && (
                                                <button
                                                    onClick={() => setReviewModalData({ isOpen: true, orderId: order.id, restaurantId: order.restaurantId! })}
                                                    className="mt-2 w-full bg-orange-50 text-orange-600 font-bold py-3 rounded-xl flex justify-center items-center gap-2 active:scale-95 transition-transform"
                                                >
                                                    <Star className="w-4 h-4 fill-orange-600" /> Dejar Reseña
                                                </button>
                                            )}
                                            {order.hasReviewed && (
                                                <div className="mt-2 w-full bg-slate-50 text-slate-400 font-bold py-2 rounded-xl flex justify-center items-center gap-2 text-xs">
                                                    <Star className="w-4 h-4 fill-slate-300" /> Reseña Enviada
                                                </div>
                                            )}
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
                                <div
                                    onClick={handleToggleNotifications}
                                    className={`w-full flex items-center justify-between p-4 bg-slate-50 rounded-2xl transition-all cursor-pointer hover:bg-slate-100 ${updatingNotifications ? 'opacity-70 pointer-events-none' : ''}`}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm">
                                            <Bell className="w-5 h-5 text-blue-500" />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="font-bold text-slate-700">Notificaciones</span>
                                            <span className="text-[10px] text-slate-400 font-medium">Recibe promos y actualizaciones</span>
                                        </div>
                                    </div>
                                    <div
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${userData?.notificationsEnabled || (userData?.fcmTokens && userData.fcmTokens.length > 0) ? 'bg-green-500' : 'bg-slate-300'
                                            }`}
                                    >
                                        {updatingNotifications ? (
                                            <div className="ml-1 w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                        ) : (
                                            <span
                                                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${userData?.notificationsEnabled || (userData?.fcmTokens && userData.fcmTokens.length > 0) ? 'translate-x-6' : 'translate-x-1'
                                                    }`}
                                            />
                                        )}
                                    </div>
                                </div>

                            </div>

                            <div className="space-y-3 pt-6 border-t border-slate-100">
                                <h3 className="text-lg font-black text-slate-900 px-2 flex items-center gap-2">
                                    <FileText className="w-5 h-5 text-primary" />
                                    📋 Sección de Soporte: Preguntas Frecuentes (FAQ)
                                </h3>
                                <div className="space-y-2">
                                    {FAQ_DATA.map((faq, index) => (
                                        <div
                                            key={index}
                                            className="bg-slate-50 rounded-2xl overflow-hidden border border-slate-100 transition-all"
                                        >
                                            <button
                                                onClick={() => setActiveFaq(activeFaq === index ? null : index)}
                                                className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-100 transition-colors"
                                            >
                                                <span className="text-xs font-black text-slate-700 leading-tight pr-4">{faq.q}</span>
                                                <motion.div
                                                    animate={{ rotate: activeFaq === index ? 180 : 0 }}
                                                    transition={{ duration: 0.2 }}
                                                >
                                                    <ChevronRight className={`w-4 h-4 ${activeFaq === index ? 'text-primary' : 'text-slate-300'}`} />
                                                </motion.div>
                                            </button>
                                            <AnimatePresence>
                                                {activeFaq === index && (
                                                    <motion.div
                                                        initial={{ height: 0, opacity: 0 }}
                                                        animate={{ height: "auto", opacity: 1 }}
                                                        exit={{ height: 0, opacity: 0 }}
                                                        transition={{ duration: 0.3, ease: "easeInOut" }}
                                                    >
                                                        <div className="px-4 pb-4 pt-0">
                                                            <p className="text-xs text-slate-500 font-medium leading-relaxed whitespace-pre-line">
                                                                {faq.a}
                                                            </p>
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    ))}
                                </div>
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
                    <img src="https://firebasestorage.googleapis.com/v0/b/arepa-express-ve-2026.firebasestorage.app/o/logo%20oficial.png?alt=media&token=2dd047ea-6c45-4347-8869-1a1edf4253f4" alt="2X3" className="h-10 mx-auto mb-2" />
                    <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400">Hecho con ❤️ en Venezuela</p>
                </div>
            </div>

            {
                showAddressPicker && user && (
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
                )
            }

            {/* Review Modal */}
            {
                reviewModalData?.isOpen && (
                    <ReviewModal
                        isOpen={reviewModalData.isOpen}
                        onClose={() => setReviewModalData(null)}
                        orderId={reviewModalData.orderId}
                        restaurantId={reviewModalData.restaurantId}
                        onReviewSubmitted={() => {
                            setReviewModalData(null);
                            // Make optimistic update to orders list
                            setOrders(prev => prev.map(o => o.id === reviewModalData.orderId ? { ...o, hasReviewed: true } : o));
                            alert('¡Gracias por tu reseña!');
                        }}
                    />
                )
            }

            {/* Edit Profile Modal */}
            <AnimatePresence>
                {showEditProfileModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="bg-white rounded-[40px] w-full max-w-2xl shadow-2xl overflow-hidden my-auto"
                        >
                            <div className="p-8 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-primary/10 rounded-2xl text-primary">
                                        <Settings className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-black text-slate-900 leading-none">Editar Perfil</h3>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-2">Personaliza tu información</p>
                                    </div>
                                </div>
                                <button onClick={() => setShowEditProfileModal(false)} className="p-3 hover:bg-slate-200 rounded-2xl transition-all">
                                    <X className="w-6 h-6 text-slate-400" />
                                </button>
                            </div>

                            <form onSubmit={handleCompleteProfile} className="p-8">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    {/* Basic Info */}
                                    <div className="space-y-6">
                                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                                            <UserIcon className="w-4 h-4" /> Información Básica
                                        </h3>

                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Nombre Completo</label>
                                            <input
                                                type="text"
                                                required
                                                value={profileForm.displayName}
                                                onChange={(e) => setProfileForm({ ...profileForm, displayName: e.target.value })}
                                                className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 font-bold text-slate-700 focus:bg-white focus:border-primary transition-all outline-none"
                                                placeholder="Ej. Juan Pérez"
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Número de Celular</label>
                                            <div className="relative">
                                                <input
                                                    type="tel"
                                                    required
                                                    value={profileForm.phone}
                                                    onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                                                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 pl-12 font-bold text-slate-700 focus:bg-white focus:border-primary transition-all outline-none"
                                                    placeholder="Ej. 04141234567"
                                                />
                                                <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Cédula de Identidad</label>
                                            <div className="relative">
                                                <input
                                                    type="text"
                                                    required
                                                    value={profileForm.cedula}
                                                    onChange={(e) => setProfileForm({ ...profileForm, cedula: e.target.value })}
                                                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 pl-12 font-bold text-slate-700 focus:bg-white focus:border-primary transition-all outline-none"
                                                    placeholder="Ej. V-12345678"
                                                />
                                                <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Visual Info */}
                                    <div className="space-y-6">
                                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                                            <Camera className="w-4 h-4" /> Información Visual
                                        </h3>

                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between">
                                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Foto de Perfil</p>
                                                <UploadCloud className="w-4 h-4 text-primary" />
                                            </div>

                                            <div className="relative group/photo">
                                                <div className="w-full h-48 rounded-[32px] bg-slate-50 border-2 border-dashed border-slate-200 flex flex-col items-center justify-center overflow-hidden transition-all group-hover/photo:border-primary/50">
                                                    {(logoPreview || user?.photoURL) ? (
                                                        <img
                                                            src={logoPreview || user?.photoURL || ''}
                                                            alt="Profile Preview"
                                                            className="w-full h-full object-cover"
                                                        />
                                                    ) : (
                                                        <div className="flex flex-col items-center gap-2 text-slate-400">
                                                            <ImageIcon className="w-10 h-10" />
                                                            <span className="text-[10px] font-bold uppercase tracking-widest">Subir Foto</span>
                                                        </div>
                                                    )}

                                                    <input
                                                        type="file"
                                                        accept="image/*"
                                                        onChange={(e) => {
                                                            const file = e.target.files?.[0];
                                                            if (file) {
                                                                setLogoFile(file);
                                                                setLogoPreview(URL.createObjectURL(file));
                                                            }
                                                        }}
                                                        className="absolute inset-0 opacity-0 cursor-pointer z-10"
                                                    />

                                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/photo:opacity-100 transition-opacity flex items-center justify-center">
                                                        <Camera className="w-8 h-8 text-white" />
                                                    </div>
                                                </div>
                                                <p className="text-[9px] text-slate-400 font-bold mt-2 text-center uppercase tracking-tighter italic">Recomendado: 400x400px (JPG/PNG)</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-12 flex gap-4 pt-8 border-t border-slate-100">
                                    <button
                                        type="button"
                                        onClick={() => setShowEditProfileModal(false)}
                                        className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-all shadow-sm active:scale-95"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={completingProfile}
                                        className="flex-[2] py-4 bg-primary text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-orange-600 transition-all shadow-xl shadow-orange-500/30 flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
                                    >
                                        {completingProfile ? (
                                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                        ) : (
                                            <>
                                                <Save className="w-4 h-4" /> Guardar Cambios
                                            </>
                                        )}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </>
    );
}
