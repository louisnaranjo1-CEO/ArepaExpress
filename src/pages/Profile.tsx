import React, { useState, useEffect, useRef } from 'react';
import { User, Mail, MapPin, CreditCard, LogOut, ShoppingBag, Settings, ChevronRight, Clock, FileText, Bell, Navigation, X, Shield, UploadCloud, Star, Wallet, Gift, Award, MessageSquareWarning, Plus, Send, AlertCircle, CheckCircle, Store, Handshake } from 'lucide-react';
import { requestNotificationPermission, disableNotifications } from '../lib/notifications';
import { useAuth } from '../context/AuthContext';
import { auth, db, storage } from '../lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { signInWithGoogle, signInWithEmail, signUpWithEmail, processReferralCode } from '../lib/auth-service';
import { collection, query, where, orderBy, getDocs, doc, setDoc, serverTimestamp, collectionGroup, getDoc, updateDoc, addDoc } from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';
import { Image as ImageIcon, Camera, Smartphone, User as UserIcon, Save } from 'lucide-react';
import AddressPicker from '../components/AddressPicker';
import { motion, AnimatePresence } from 'framer-motion';
import ReviewModal from '../components/ReviewModal';
import { Copy, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { vibrate } from '../utils/haptics';

interface SupportTicket {
    id: string;
    userId: string;
    userName: string;
    userEmail: string;
    userPhone: string;
    title: string;
    description: string;
    status: 'open' | 'closed';
    createdAt: any;
    adminResponse?: string;
}

interface ActivityItem {
    id: string;
    type: 'order' | 'transport';
    total?: number;
    status: string;
    createdAt: any;
    // Order specific
    items?: any[];
    deliveryMethod?: string;
    hasReviewed?: boolean;
    restaurantId?: string;
    // Transport specific
    origin?: { lat: number, lng: number, address: string };
    destination?: { lat: number, lng: number, address: string };
    fare?: number;
    serviceType?: string;
}

const RestaurantPointCard: React.FC<{ restId: string, points: number }> = ({ restId, points }) => {
    const [name, setName] = useState('Cargando...');
    useEffect(() => {
        getDoc(doc(db, 'restaurants', restId)).then(d => {
            if (d.exists()) setName(d.data().name);
            else setName('Local Afiliado');
        });
    }, [restId]);

    if (points <= 0) return null;

    return (
        <div className="bg-orange-50 border border-orange-100 p-3 rounded-2xl flex items-center gap-3 hover:bg-orange-100 transition-colors">
            <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-orange-500 font-black text-[10px] shadow-sm shadow-orange-500/10 shrink-0">
                {Math.floor(points)}
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-[10px] text-orange-600/70 font-black uppercase tracking-wider">Tus Puntos</p>
                <p className="text-sm font-black text-slate-800 truncate">{name}</p>
            </div>
        </div>
    );
};

export default function Profile() {
    const { user, userData, isProfileComplete } = useAuth();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [isSigningIn, setIsSigningIn] = useState(false);
    const [activities, setActivities] = useState<ActivityItem[]>([]);
    const [loadingActivities, setLoadingActivities] = useState(false);
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

    // Wallet State
    const [showWalletModal, setShowWalletModal] = useState(false);
    const [rechargeAmount, setRechargeAmount] = useState('');
    const [rechargeProof, setRechargeProof] = useState<File | null>(null);
    const [isRecharging, setIsRecharging] = useState(false);
    const [paymentMethods, setPaymentMethods] = useState<any>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [rechargeRef, setRechargeRef] = useState('');

    // Referral State
    const [referralCodeInput, setReferralCodeInput] = useState('');
    const [showReferralModal, setShowReferralModal] = useState(false);
    const [tempGoogleUser, setTempGoogleUser] = useState<any>(null);
    const [isApplyingReferral, setIsApplyingReferral] = useState(false);
    const [isForcedRegister, setIsForcedRegister] = useState(false);

    // Support Ticket State
    const [supportTickets, setSupportTickets] = useState<SupportTicket[]>([]);
    const [loadingTickets, setLoadingTickets] = useState(false);
    const [showSupportModal, setShowSupportModal] = useState(false);
    const [showNewTicketModal, setShowNewTicketModal] = useState(false);
    const [ticketForm, setTicketForm] = useState({ title: '', description: '' });
    const [isSubmittingTicket, setIsSubmittingTicket] = useState(false);

    // Credits State
    const [myCredits, setMyCredits] = useState<any[]>([]);
    const [loadingCredits, setLoadingCredits] = useState(false);
    const [showCreditsModal, setShowCreditsModal] = useState(false);

    useEffect(() => {
        if (userData) {
            setProfileForm({
                displayName: userData.displayName || user?.displayName || '',
                phone: userData.phone || '',
                cedula: userData.cedula || ''
            });
        }
    }, [userData, user]);

    useEffect(() => {
        const urlRef = searchParams.get('ref');
        const action = searchParams.get('action');
        
        if (urlRef && !user) {
            setReferralCodeInput(urlRef.toUpperCase());
            setIsLoginMode(false);
            setIsForcedRegister(true);
        } else if (action === 'register' && !user) {
            setIsLoginMode(false);
            setIsForcedRegister(true);
            setShowEmailModal(true); // Abre el modal de registro directamente
        }
    }, [searchParams, user]);

    const scrollToOrders = () => {
        ordersRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        const fetchActivities = async () => {
            if (!user) return;
            setLoadingActivities(true);
            try {
                // Fetch Orders
                const qOrders = query(
                    collection(db, 'orders'),
                    where('userId', '==', user.uid),
                    orderBy('createdAt', 'desc')
                );
                const orderSnapshot = await getDocs(qOrders);
                const fetchedOrders = orderSnapshot.docs.map(doc => {
                    const data = doc.data();
                    const restId = data.restaurantId || (data.items && data.items.length > 0 ? data.items[0].restaurantId : null);
                    return {
                        id: doc.id,
                        type: 'order',
                        restaurantId: restId,
                        ...data
                    } as ActivityItem;
                });

                // Fetch Transports
                const qTransports = query(
                    collection(db, 'transport_requests'),
                    where('userId', '==', user.uid),
                    orderBy('createdAt', 'desc')
                );
                const transportSnapshot = await getDocs(qTransports);
                const fetchedTransports = transportSnapshot.docs.map(doc => {
                    return {
                        id: doc.id,
                        type: 'transport',
                        ...doc.data()
                    } as ActivityItem;
                });

                // Combine and sort
                const combined = [...fetchedOrders, ...fetchedTransports].sort((a, b) => {
                    const timeA = a.createdAt?.toMillis() || 0;
                    const timeB = b.createdAt?.toMillis() || 0;
                    return timeB - timeA;
                });

                setActivities(combined);
            } catch (err) {
                console.error("Error fetching activities:", err);
            } finally {
                setLoadingActivities(false);
            }
        };

        const fetchPaymentMethods = async () => {
            try {
                const docSnap = await getDoc(doc(db, 'system_configs', 'finances'));
                if (docSnap.exists()) {
                    setPaymentMethods(docSnap.data().paymentMethods);
                }
            } catch (error) {
                console.error("Error fetching payment methods:", error);
            }
        };

        fetchActivities();
        fetchPaymentMethods();
    }, [user]);

    // Fetch Support Tickets
    useEffect(() => {
        const fetchTickets = async () => {
            if (!user) return;
            setLoadingTickets(true);
            try {
                const qTickets = query(
                    collection(db, 'support_tickets'),
                    where('userId', '==', user.uid)
                );
                const snapshot = await getDocs(qTickets);
                const fetchedTickets = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                })) as SupportTicket[];
                
                // Sort locally by createdAt desc
                fetchedTickets.sort((a, b) => {
                    const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : Date.now();
                    const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : Date.now();
                    return timeB - timeA;
                });
                
                setSupportTickets(fetchedTickets);
            } catch (error) {
                console.error("Error fetching support tickets:", error);
            } finally {
                setLoadingTickets(false);
            }
        };

        const fetchCredits = async () => {
            if (!user) return;
            setLoadingCredits(true);
            try {
                const qCredits = query(
                    collectionGroup(db, 'credits'),
                    where('userEmail', '==', user.email)
                );
                const snapshot = await getDocs(qCredits);
                const fetchedCredits = await Promise.all(snapshot.docs.map(async (doc) => {
                    const data = doc.data();
                    // Obtener nombre del restaurante
                    const restRef = doc.ref.parent.parent;
                    let restName = 'Restaurante';
                    if (restRef) {
                        const restSnap = await getDoc(restRef);
                        if (restSnap.exists()) restName = restSnap.data().name;
                    }
                    return { id: doc.id, restaurantName: restName, ...data };
                }));
                // Sort by date created desc
                setMyCredits(fetchedCredits.sort((a:any, b:any) => b.createdAt - a.createdAt));
            } catch (error) {
                console.error("Error fetching credits:", error);
            } finally {
                setLoadingCredits(false);
            }
        };

        // Call the additional fetches
        fetchTickets();
        fetchCredits();
    }, [user]);

    const handleCopy = (text: string, id: string) => {
        navigator.clipboard.writeText(text);
        setCopiedId(id);
        toast.success("Copiado al portapapeles");
        setTimeout(() => setCopiedId(null), 2000);
    };

    const handleSubmitTicket = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !userData) return;
        if (!ticketForm.title.trim() || !ticketForm.description.trim()) {
            toast.error("Por favor completa todos los campos");
            return;
        }

        setIsSubmittingTicket(true);
        try {
            const newTicket = {
                userId: user.uid,
                userName: userData.displayName || 'Usuario sin nombre',
                userEmail: user.email || '',
                userPhone: userData.phone || '',
                title: ticketForm.title,
                description: ticketForm.description,
                status: 'open',
                createdAt: serverTimestamp()
            };

            const docRef = await addDoc(collection(db, 'support_tickets'), newTicket);
            
            // Add locally to update UI immediately
            setSupportTickets(prev => [{
                ...newTicket,
                id: docRef.id,
                createdAt: { toDate: () => new Date() } // Mock timestamp for local display immediately
            } as any, ...prev]);

            toast.success("Reporte enviado con éxito");
            setTicketForm({ title: '', description: '' });
            setShowNewTicketModal(false);
            setShowSupportModal(true);
        } catch (error) {
            console.error("Error submitting ticket:", error);
            toast.error("Error al enviar el reporte");
        } finally {
            setIsSubmittingTicket(false);
        }
    };


    const [error, setError] = useState<string | null>(null);
    const [activeFaq, setActiveFaq] = useState<number | null>(null);

    const FAQ_DATA = [
        {
            q: "¿Qué es un 2x3?",
            a: "Es la aplicación móvil todo-en-uno que conecta a nivel nacional a restaurantes, supermercados, bodegas y emprendimientos con los usuarios. Es una plataforma diseñada para facilitar compras sin colas, ofrecer servicios de delivery y transporte, y potenciar el crecimiento tecnológico de los negocios locales."
        },
        {
            q: "¿Qué productos o servicios puedo encontrar en un 2x3?",
            a: "¡Prácticamente todo! Puedes explorar catálogos de comida, artículos de primera necesidad y servicios profesionales. Además, contamos con una red integrada de Delivery y Taxi siempre disponible para llevarte lo que necesites o trasladarte a donde desees."
        },
        {
            q: "¿Cómo puedo ser aliado a un 2x3?",
            a: "Es muy sencillo transformar tu negocio. Solo debes ingresar a la aplicación y enviar tu solicitud formal a través de la sección \"Ser Aliado\". Al unirte, recibirás acceso a nuestro panel administrativo, sistema de comandas y herramientas de publicidad interna."
        }
    ];

    // Role-based automatic redirection removed to allow multi-role user access.
    // Users can still manually access the delivery panel via the footer buttons if needed.

    const handleGoogleSignIn = async () => {
        setIsSigningIn(true);
        setError(null);
        try {
            const { user, isNewUser } = await signInWithGoogle();
            if (isNewUser) {
                if (isForcedRegister && referralCodeInput) {
                    await processReferralCode(user.uid, referralCodeInput);
                } else {
                    setTempGoogleUser(user);
                    setShowReferralModal(true);
                }
            }
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
                const cleanReferral = referralCodeInput ? referralCodeInput.trim() : undefined;
                await signUpWithEmail(email, password, fullName, cleanReferral);
            }
            setShowEmailModal(false);
            // Reset form
            setEmail('');
            setPassword('');
            setFullName('');
            setReferralCodeInput('');
        } catch (err: any) {
            console.error("Email auth error", err);
            setError(err.message || "Ocurrió un error. Intenta de nuevo.");
        } finally {
            setIsEmailAuthLoading(false);
        }
    };

    const handleGoogleReferralSubmit = async () => {
        if (!tempGoogleUser) return;
        if (!referralCodeInput) {
            handleSkipReferral();
            return;
        }
        setIsApplyingReferral(true);
        try {
            const success = await processReferralCode(tempGoogleUser.uid, referralCodeInput);
            if (success) {
                toast.success("¡Código de referido aplicado exitosamente!");
            } else {
                toast.error("El código ingresado no es válido o es tu propio código.", { icon: '⚠️' });
            }
        } catch (error) {
            console.error(error);
            toast.error("Error al aplicar el código");
        } finally {
            setIsApplyingReferral(false);
            setShowReferralModal(false);
            setTempGoogleUser(null);
            setReferralCodeInput('');
        }
    };

    const handleSkipReferral = () => {
        setShowReferralModal(false);
        setTempGoogleUser(null);
        setReferralCodeInput('');
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

    const handleRechargeSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || (!rechargeAmount && !rechargeProof)) return;

        setIsRecharging(true);
        try {
            let proofUrl = '';
            if (rechargeProof) {
                const storageRef = ref(storage, `wallet_recharges/${user.uid}/${Date.now()}_${rechargeProof.name}`);
                const snapshot = await uploadBytes(storageRef, rechargeProof);
                proofUrl = await getDownloadURL(snapshot.ref);
            }

            await addDoc(collection(db, 'wallet_recharges'), {
                userId: user.uid,
                userName: userData?.displayName || user.displayName || 'Usuario',
                userPhone: userData?.phone || '',
                amount: parseFloat(rechargeAmount),
                proofUrl,
                paymentRef: rechargeRef,
                status: 'pending',
                createdAt: serverTimestamp()
            });

            alert("¡Recarga enviada! Verificaremos los datos pronto.");
            setShowWalletModal(false);
            setRechargeAmount('');
            setRechargeProof(null);
        } catch (err: any) {
            console.error("Error submitting recharge:", err);
            const errorMsg = err?.message || "Error desconocido";
            alert(`Error al procesar la recarga: ${errorMsg}`);
        } finally {
            setIsRecharging(false);
        }
    };

    if (!user) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[80vh] px-6 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div 
                    onClick={() => toast('¡Epale! ¿Iniciamos ya?', { icon: '🚀', style: { borderRadius: '15px', background: '#333', color: '#fff' } })}
                    className="w-80 h-32 flex items-center justify-center mb-8 cursor-pointer active:scale-95 transition-transform p-2 overflow-visible"
                >
                    <img 
                        src="https://firebasestorage.googleapis.com/v0/b/arepa-express-ve-2026.firebasestorage.app/o/logo.png?alt=media&token=8acf92ec-b853-4f37-bd82-a4f651bbdcd9" 
                        alt="Deliexpress Logo"
                        className="w-auto h-full object-contain filter drop-shadow-xl"
                    />
                </div>
                <h1 className="text-3xl font-black text-slate-900 mb-2">¿Epale, que buscamos hoy?</h1>
                <p className="text-slate-500 mb-8 max-w-[280px]">
                    Ingresa para guardar tus sitios favoritos, pedir lo que más te gusta o dejar que te llevemos.
                </p>
                {error && (
                    <div className="mb-4 p-4 bg-red-50 text-red-600 rounded-2xl text-xs font-bold animate-in shake-in duration-300">
                        {error}
                    </div>
                )}
                <div className="space-y-4 w-full max-w-xs relative">
                    <button
                        onClick={async () => {
                            vibrate(50);
                            await handleGoogleSignIn();
                        }}
                        disabled={isSigningIn}
                        className="w-full bg-primary text-slate-900 py-4 rounded-2xl font-bold shadow-lg shadow-primary/30 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-70 disabled:hover:scale-100 flex items-center justify-center gap-2"
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
                    {isForcedRegister ? (
                        <button
                            onClick={() => {
                                vibrate(30);
                                setIsLoginMode(false);
                                setShowEmailModal(true);
                            }}
                            className="w-full bg-white text-slate-900 border-2 border-primary py-4 rounded-2xl font-bold hover:bg-primary/5 transition-colors flex items-center justify-center gap-2"
                        >
                            <Mail className="w-5 h-5 opacity-80" />
                            Crear Cuenta con Correo
                        </button>
                    ) : (
                        <>
                            <button
                                onClick={() => {
                                    vibrate(30);
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
                                    vibrate(30);
                                    setIsLoginMode(false);
                                    setShowEmailModal(true);
                                }}
                                className="w-full text-center py-2 group"
                            >
                                <span className="text-slate-900 font-bold text-xs group-hover:text-primary transition-colors">¿No tienes cuenta? </span>
                                <span className="text-primary font-black text-xs group-hover:underline">Regístrate</span>
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
                                onClick={() => window.location.href = 'https://deliexpress.app/delivery/login'}
                                className="w-full bg-primary/10 text-slate-900 py-4 rounded-2xl font-bold hover:bg-primary/20 transition-colors flex items-center justify-center gap-2"
                            >
                                <Navigation className="w-5 h-5 opacity-50" />
                                Acceso Delivery / Taxi
                            </button>

                            <div className="flex items-center gap-4 my-2 pt-2">
                                <div className="h-px bg-slate-100 flex-1"></div>
                                <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">¿Quieres que tu negocio crezca?</span>
                                <div className="h-px bg-slate-100 flex-1"></div>
                            </div>
                            <button
                                onClick={() => window.location.href = 'https://restaurante.deliexpress.app'}
                                className="w-full bg-green-500/10 text-green-600 py-4 rounded-2xl font-bold hover:bg-green-500/20 transition-colors flex items-center justify-center gap-2"
                            >
                                <Store className="w-5 h-5 opacity-50" />
                                Conviértete en aliado y deja que te encuentren en un 2x3
                            </button>
                        </>
                    )}
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
                                            ¡Nos vemos en un 2x3 mi pana! 🚀
                                        </p>
                                    </div>
                                    {!isForcedRegister && (
                                        <button onClick={() => setShowEmailModal(false)} className="p-2 hover:bg-slate-200 rounded-xl transition-all">
                                            <X className="w-5 h-5 text-slate-400" />
                                        </button>
                                    )}
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

                                    {!isLoginMode && (
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{isForcedRegister ? "Código de Referido (Aplicado)" : "Código de Referido (Opcional)"}</label>
                                            <input
                                                type="text"
                                                value={referralCodeInput}
                                                onChange={(e) => setReferralCodeInput(e.target.value.toUpperCase())}
                                                placeholder="Ej: ABCDEF"
                                                className={`w-full bg-slate-50 border-2 border-slate-100 focus:border-primary px-4 py-3 rounded-2xl outline-none font-bold transition-all uppercase ${isForcedRegister ? "text-primary/80 bg-slate-100" : "text-slate-700"}`}
                                                maxLength={10}
                                                readOnly={isForcedRegister}
                                            />
                                        </div>
                                    )}

                                    <button
                                        type="submit"
                                        disabled={isEmailAuthLoading}
                                        className="w-full bg-primary text-slate-900 py-4 rounded-2xl font-bold shadow-lg shadow-primary/30 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-70 mt-4 flex items-center justify-center gap-2"
                                    >
                                        {isEmailAuthLoading ? (
                                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                        ) : (
                                            isLoginMode ? "Entrar" : "Registrarme"
                                        )}
                                    </button>

                                    {!isForcedRegister && (
                                        <button
                                            type="button"
                                            onClick={() => setIsLoginMode(!isLoginMode)}
                                            className="w-full text-slate-400 font-bold py-2 mt-2 hover:text-slate-900 transition-colors text-xs"
                                        >
                                            {isLoginMode ? "¿No tienes cuenta? Regístrate" : "¿Ya tienes cuenta? Inicia sesión"}
                                        </button>
                                    )}
                                </form>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

                {/* Referal Modal for Google Signups */}
                <AnimatePresence>
                    {showReferralModal && tempGoogleUser && (
                        <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
                            <motion.div
                                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                                className="bg-white rounded-[32px] w-full max-w-sm shadow-2xl overflow-hidden p-8"
                            >
                                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <Gift className="w-8 h-8 text-slate-900" />
                                </div>
                                <h3 className="text-xl font-black text-slate-900 text-center mb-2">
                                    ¡Gana 200 puntos! 🎉
                                </h3>
                                <p className="text-slate-500 text-sm text-center mb-6 font-medium">
                                    ¿Alguien te invitó a Deliexpress? Ingresa su código ahora y ambos recibirán puntos gratis.
                                </p>

                                <div className="space-y-4">
                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Código de Referido</label>
                                        <input
                                            type="text"
                                            value={referralCodeInput}
                                            onChange={(e) => setReferralCodeInput(e.target.value.toUpperCase())}
                                            placeholder="Ingresa el código aquí"
                                            className="w-full bg-slate-50 border-2 border-slate-100 focus:border-primary px-4 py-3 rounded-2xl outline-none font-black text-slate-700 transition-all text-center text-lg tracking-widest uppercase mt-1"
                                            maxLength={10}
                                        />
                                    </div>

                                    <div className="flex flex-col gap-2 pt-2">
                                        <button
                                            onClick={handleGoogleReferralSubmit}
                                            disabled={isApplyingReferral}
                                            className="w-full bg-primary text-slate-900 py-4 rounded-2xl font-bold shadow-lg shadow-primary/30 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-70 flex items-center justify-center gap-2"
                                        >
                                            {isApplyingReferral ? (
                                                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                            ) : (
                                                <>Aplicar Código y Continuar</>
                                            )}
                                        </button>
                                        <button
                                            onClick={handleSkipReferral}
                                            disabled={isApplyingReferral}
                                            className="w-full text-slate-400 font-bold py-3 hover:text-slate-600 transition-colors text-sm"
                                        >
                                            Omitir por ahora
                                        </button>
                                    </div>
                                </div>
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
                <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mb-6 overflow-hidden">
                    <User className="w-12 h-12 text-slate-900" />
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
                        className="w-full bg-primary text-slate-900 py-4 rounded-2xl font-bold shadow-lg shadow-primary/30 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-70 mt-4 flex items-center justify-center gap-2"
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
                <div className="bg-gradient-to-br from-secondary to-[#003B85] p-8 pt-12 pb-16 text-white rounded-b-[40px] shadow-xl">
                    <div className="flex items-center gap-4">
                        <div className="w-20 h-20 bg-white/20 backdrop-blur-md rounded-full border-4 border-white/30 flex items-center justify-center overflow-hidden shadow-inner shrink-0">
                            {user.photoURL ? (
                                <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover rounded-full" />
                            ) : (
                                <User className="w-10 h-10 text-white" />
                            )}
                        </div>
                        <div className="flex-1">
                            <h2 className="text-2xl font-black">{user.displayName || 'Deliexpress Fan'}</h2>
                            <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-1 text-white/80 text-xs">
                                    <Mail className="w-3 h-3" />
                                    <span>{user.email}</span>
                                </div>
                                <div className="bg-white/20 backdrop-blur-md self-start px-3 py-1 rounded-full flex items-center gap-1.5 mt-2 border border-white/20 shadow-sm active:scale-95 transition-transform" onClick={() => navigate('/rewards')}>
                                    <Award className="w-3.5 h-3.5 text-amber-400" />
                                    <span className="text-xs font-black text-white">{Math.floor(userData?.points || 0).toLocaleString()} pts</span>
                                    <ChevronRight className="w-3 h-3 text-white/60" />
                                </div>
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
                        <div className="grid grid-cols-4 gap-2">
                            <div
                                onClick={() => setShowWalletModal(true)}
                                className="bg-yellow-50 p-3 rounded-2xl flex flex-col items-center justify-center gap-1.5 group cursor-pointer hover:bg-yellow-100 transition-colors"
                            >
                                <Wallet className="w-6 h-6 text-amber-700 group-hover:scale-110 transition-transform" />
                                <span className="text-[10px] font-bold text-slate-700 text-center leading-tight">Mi Billetera</span>
                            </div>
                            <div
                                onClick={scrollToOrders}
                                className="bg-orange-50 p-3 rounded-2xl flex flex-col items-center justify-center gap-1.5 group cursor-pointer hover:bg-orange-100 transition-colors"
                            >
                                <ShoppingBag className="w-6 h-6 text-orange-500 group-hover:scale-110 transition-transform" />
                                <span className="text-[10px] font-bold text-slate-600 text-center leading-tight">Pedidos</span>
                            </div>
                            <div
                                onClick={() => setShowAddressPicker(true)}
                                className={`p-3 rounded-2xl flex flex-col items-center justify-center gap-1.5 group cursor-pointer transition-colors ${userData?.address ? 'bg-green-50 hover:bg-green-100' : 'bg-blue-50 hover:bg-blue-100'}`}
                            >
                                <MapPin className={`w-6 h-6 group-hover:scale-110 transition-transform ${userData?.address ? 'text-green-500' : 'text-blue-500'}`} />
                                <span className="text-[10px] font-bold text-slate-600 text-center leading-tight">Direcciones</span>
                            </div>
                            <div
                                onClick={() => navigate('/rewards')}
                                className="bg-primary/5 p-3 rounded-2xl flex flex-col items-center justify-center gap-1.5 group cursor-pointer hover:bg-primary/10 transition-colors border border-primary/10"
                            >
                                <Gift className="w-6 h-6 text-slate-900 group-hover:scale-110 transition-transform" />
                                <span className="text-[10px] font-bold text-slate-900 text-center leading-tight">Regalos</span>
                            </div>
                        </div>

                        {myCredits.length > 0 && (
                            <div className="space-y-3 mt-4">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-lg font-black text-slate-900 px-2 flex items-center gap-2">
                                        <Handshake className="w-5 h-5 text-indigo-500" />
                                        Mis Cuotas 2x3
                                    </h3>
                                    {myCredits.some(c => c.status === 'defaulted') && (
                                        <span className="bg-red-100 text-red-600 text-[10px] font-black uppercase px-2 py-1 rounded-full animate-pulse flex items-center gap-1">
                                            <AlertCircle className="w-3 h-3" />
                                            Atrasado
                                        </span>
                                    )}
                                </div>
                                <div className="grid gap-3">
                                    {myCredits.map(credit => {
                                        const pendingInstallments = credit.installments.filter((i:any) => i.status !== 'paid');
                                        const nextInstallment = pendingInstallments.sort((a:any, b:any) => a.dueDate - b.dueDate)[0];
                                        
                                        return (
                                            <div 
                                                key={credit.id} 
                                                onClick={() => {
                                                    // Aquí podrías abrir un modal específico para ver detalles del crédito,
                                                    // por ahora usaremos showCreditsModal que crearemos luego
                                                    setShowCreditsModal(true);
                                                }}
                                                className={`p-4 rounded-2xl border transition-all cursor-pointer hover:scale-[1.01] ${
                                                    credit.status === 'defaulted' ? 'bg-red-50 border-red-200' :
                                                    credit.status === 'completed' ? 'bg-emerald-50 border-emerald-100' :
                                                    'bg-indigo-50 border-indigo-100'
                                                }`}
                                            >
                                                <div className="flex justify-between items-start mb-2">
                                                    <div>
                                                        <h4 className="font-black text-slate-900 leading-tight">{credit.restaurantName}</h4>
                                                        <p className="text-[10px] tracking-wider uppercase font-bold text-slate-500 uppercase mt-0.5">
                                                            {credit.status === 'completed' ? 'Pagado' : credit.status === 'defaulted' ? 'Cuotas Vencidas' : 'Activo'}
                                                        </p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-sm font-black text-slate-900">${credit.totalAmount.toFixed(2)}</p>
                                                        <p className="flex items-center gap-1 text-[10px] font-bold text-slate-500 justify-end">
                                                            <span>{credit.installments.length - pendingInstallments.length}/{credit.installments.length}</span>
                                                            Cuotas
                                                        </p>
                                                    </div>
                                                </div>
                                                {credit.status !== 'completed' && nextInstallment && (
                                                    <div className={`mt-3 pt-3 border-t flex items-center justify-between ${credit.status === 'defaulted' ? 'border-red-200' : 'border-indigo-100'}`}>
                                                        <div className="flex items-center gap-2">
                                                            <Clock className={`w-4 h-4 ${credit.status === 'defaulted' ? 'text-red-500' : 'text-indigo-500'}`} />
                                                            <span className="text-xs font-bold text-slate-600">Próximo pago: {new Date(nextInstallment.dueDate).toLocaleDateString()}</span>
                                                        </div>
                                                        <span className={`text-sm font-black ${credit.status === 'defaulted' ? 'text-red-600' : 'text-indigo-600'}`}>
                                                            ${nextInstallment.amount.toFixed(2)}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {userData?.restaurantPoints && Object.keys(userData.restaurantPoints).length > 0 && (
                            <div className="space-y-3 mt-4">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-lg font-black text-slate-900 px-2 flex items-center gap-2">
                                        <Award className="w-5 h-5 text-orange-500" />
                                        Puntos en Restaurantes
                                    </h3>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    {Object.entries(userData.restaurantPoints).map(([restId, pts]) => (
                                        <RestaurantPointCard key={restId} restId={restId} points={pts as number} />
                                    ))}
                                </div>
                            </div>
                        )}

                        {(userData?.addresses && userData.addresses.length > 0) && (
                            <div className="space-y-3 mt-4">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-lg font-black text-slate-900 px-2 flex items-center gap-2">
                                        <MapPin className="w-5 h-5 text-slate-900" />
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

                        {/* Activity History */}
                        <div ref={ordersRef} className="space-y-4 pt-2">
                            <h3 className="text-lg font-black text-slate-900 px-2 flex items-center gap-2">
                                <FileText className="w-5 h-5 text-slate-900" />
                                Historial de Actividad
                            </h3>

                            {loadingActivities ? (
                                <div className="flex justify-center py-4">
                                    <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                                </div>
                            ) : activities.length > 0 ? (
                                <div className="space-y-3">
                                    {activities.map(activity => (
                                        <div key={activity.id} className="bg-slate-50 border border-slate-100 p-4 rounded-2xl flex flex-col gap-2">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        {activity.type === 'transport' ? (
                                                            <div className="p-1.5 bg-blue-100 rounded-lg text-blue-600">
                                                                <Navigation className="w-4 h-4" />
                                                            </div>
                                                        ) : (
                                                            <div className="p-1.5 bg-orange-100 rounded-lg text-orange-600">
                                                                <ShoppingBag className="w-4 h-4" />
                                                            </div>
                                                        )}
                                                        <p className="font-bold text-slate-900 text-sm">
                                                            {activity.type === 'transport' ? 'Viaje en Taxi' : 'Pedido de Comida'} <span className="text-slate-400 text-xs">#{activity.id.slice(-6).toUpperCase()}</span>
                                                        </p>
                                                    </div>
                                                    <div className="flex items-center gap-1 text-xs text-slate-500 mt-1.5 ml-8">
                                                        <Clock className="w-3 h-3" />
                                                        <span>{activity.createdAt?.toDate().toLocaleDateString()} a las {activity.createdAt?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                    </div>
                                                </div>
                                                <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider mt-1 ${
                                                    activity.status === 'pending' || activity.status === 'finding_driver' ? 'bg-orange-100 text-orange-600' :
                                                    activity.status === 'completed' ? 'bg-green-100 text-green-600' :
                                                    (activity.status === 'accepted' || activity.status === 'arriving' || activity.status === 'in_progress' || activity.status === 'in_transit' || activity.status === 'driver_assigned') ? 'bg-blue-100 text-blue-600' :
                                                    'bg-slate-200 text-slate-600'
                                                }`}>
                                                    {activity.status === 'pending' ? 'Buscando' :
                                                    activity.status === 'finding_driver' ? 'Buscando Piloto' :
                                                    activity.status === 'driver_assigned' || activity.status === 'accepted' ? 'Asignado' :
                                                    activity.status === 'in_transit' || activity.status === 'in_progress' || activity.status === 'arriving' ? 'En Camino' :
                                                    activity.status === 'completed' ? 'Completado' : 'Cancelado'}
                                                </span>
                                            </div>
                                            <div className="h-px bg-slate-200 my-1"></div>
                                            
                                            {/* Details Section */}
                                            {activity.type === 'transport' ? (
                                                <div className="text-xs text-slate-500 flex flex-col gap-1.5">
                                                    <div className="flex items-start gap-1">
                                                        <div className="min-w-4 pt-0.5 max-w-4 flex justify-center"><div className="w-2 h-2 rounded-full bg-primary ring-2 ring-blue-200"></div></div>
                                                        <span className="line-clamp-1">{activity.origin?.address || 'Punto de partida'}</span>
                                                    </div>
                                                    <div className="flex items-start gap-1">
                                                        <div className="min-w-4 pt-0.5 max-w-4 flex justify-center"><MapPin className="w-3.5 h-3.5 text-red-500" /></div>
                                                        <span className="line-clamp-1 font-medium">{activity.destination?.address || 'Destino'}</span>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="text-xs text-slate-500 flex items-center gap-1.5">
                                                    <span className="bg-slate-200 px-2 py-0.5 rounded-md font-bold text-slate-600">
                                                        {activity.items?.length || 0} art.
                                                    </span>
                                                    <span className="line-clamp-1 italic">{activity.items?.map(i => i.name).join(', ')}</span>
                                                </div>
                                            )}

                                            <div className="flex justify-end items-end mt-1">
                                                <span className="font-black text-slate-900 text-base">
                                                    ${(activity.type === 'transport' ? (activity.fare || 0) : (activity.total || 0)).toFixed(2)}
                                                </span>
                                            </div>
                                            
                                            {/* Action Buttons */}
                                            {activity.type === 'transport' && (activity.status === 'finding_driver' || activity.status === 'accepted' || activity.status === 'arriving' || activity.status === 'in_progress') && (
                                                <button
                                                    onClick={() => navigate(`/taxi/track/${activity.id}`)}
                                                    className="mt-2 w-full bg-secondary/10 text-secondary font-bold py-3 rounded-xl flex justify-center items-center gap-2 active:scale-95 transition-transform"
                                                >
                                                    <Navigation className="w-4 h-4" /> Ver Viaje
                                                </button>
                                            )}
                                            {activity.type === 'order' && activity.deliveryMethod === 'app_delivery' && (activity.status === 'finding_driver' || activity.status === 'driver_assigned' || activity.status === 'in_transit') && (
                                                <button
                                                    onClick={() => navigate(`/track/${activity.id}`)}
                                                    className="mt-2 w-full bg-secondary/10 text-secondary font-bold py-3 rounded-xl flex justify-center items-center gap-2 active:scale-95 transition-transform"
                                                >
                                                    <Navigation className="w-4 h-4" /> Rastrear Pedido
                                                </button>
                                            )}

                                            {/* Leave Review Button (Only for orders currently based on existing code) */}
                                            {activity.type === 'order' && activity.status === 'completed' && !activity.hasReviewed && activity.restaurantId && (
                                                <button
                                                    onClick={() => setReviewModalData({ isOpen: true, orderId: activity.id, restaurantId: activity.restaurantId! })}
                                                    className="mt-2 w-full bg-orange-50 text-orange-600 font-bold py-3 rounded-xl flex justify-center items-center gap-2 active:scale-95 transition-transform"
                                                >
                                                    <Star className="w-4 h-4 fill-orange-600" /> Dejar Reseña
                                                </button>
                                            )}
                                            {activity.type === 'order' && activity.hasReviewed && (
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
                                    <p className="text-sm font-bold text-slate-500">Aún no tienes actividad</p>
                                    <p className="text-xs text-slate-400 mt-1">¡Explora la app para hacer tu primer pedido o viaje!</p>
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
                                    <MessageSquareWarning className="w-5 h-5 text-red-500" />
                                    Soporte Técnico
                                </h3>
                                <div 
                                    onClick={() => setShowSupportModal(true)}
                                    className="w-full flex items-center justify-between p-4 bg-red-50 hover:bg-red-100 rounded-2xl transition-colors cursor-pointer"
                                >
                                    <div className="flex flex-col">
                                        <span className="font-bold text-red-700">Reportar una Falla</span>
                                        <span className="text-[10px] text-red-500 font-medium">¿Tienes problemas con la app? Ayúdanos a mejorar.</span>
                                    </div>
                                    <ChevronRight className="w-5 h-5 text-red-400" />
                                </div>
                            </div>

                            <div className="space-y-3 pt-6 border-t border-slate-100">
                                <h3 className="text-lg font-black text-slate-900 px-2 flex items-center gap-2">
                                    <FileText className="w-5 h-5 text-slate-900" />
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
                                                    <ChevronRight className={`w-4 h-4 ${activeFaq === index ? 'text-slate-900' : 'text-slate-300'}`} />
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

                <div 
                    className="mt-8 text-center p-6 grayscale opacity-50 cursor-pointer active:scale-95 transition-transform"
                    onClick={() => window.location.href = 'https://deliexpress.app'}
                >
                    <img src="https://firebasestorage.googleapis.com/v0/b/arepa-express-ve-2026.firebasestorage.app/o/logo.png?alt=media&token=8acf92ec-b853-4f37-bd82-a4f651bbdcd9" alt="Deliexpress" className="h-12 mx-auto mb-2" />
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
                            setActivities(prev => prev.map(o => o.id === reviewModalData.orderId ? { ...o, hasReviewed: true } : o));
                            alert('¡Gracias por tu reseña!');
                        }}
                    />
                )
            }

            {/* Support Tickets Modal */}
            <AnimatePresence>
                {showSupportModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="bg-white rounded-[40px] w-full max-w-2xl shadow-2xl overflow-hidden my-auto flex flex-col max-h-[90vh]"
                        >
                            <div className="p-6 border-b border-slate-50 flex items-center justify-between bg-slate-50/50 shrink-0">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-red-100 rounded-2xl text-red-600">
                                        <MessageSquareWarning className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-black text-slate-900 leading-none">Mis Reportes</h3>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Historial de soporte técnico</p>
                                    </div>
                                </div>
                                <button onClick={() => setShowSupportModal(false)} className="p-3 hover:bg-slate-200 rounded-2xl transition-all">
                                    <X className="w-6 h-6 text-slate-400" />
                                </button>
                            </div>

                            <div className="p-6 overflow-y-auto flex-1 bg-slate-50/30">
                                {loadingTickets ? (
                                    <div className="flex justify-center py-8">
                                        <div className="w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin"></div>
                                    </div>
                                ) : supportTickets.length > 0 ? (
                                    <div className="space-y-4">
                                        {supportTickets.map(ticket => (
                                            <div key={ticket.id} className="bg-white border text-left border-slate-200 p-5 rounded-2xl shadow-sm">
                                                <div className="flex justify-between items-start mb-2">
                                                    <h4 className="font-bold text-slate-800 text-sm">{ticket.title}</h4>
                                                    <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ml-3 ${
                                                        ticket.status === 'open' ? 'bg-orange-100 text-orange-600' : 'bg-green-100 text-green-600'
                                                    }`}>
                                                        {ticket.status === 'open' ? 'Abierto' : 'Resuelto'}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-slate-500 mb-3 whitespace-pre-wrap">{ticket.description}</p>
                                                
                                                <div className="flex items-center gap-1 text-[10px] text-slate-400 font-medium mb-3">
                                                    <Clock className="w-3 h-3" />
                                                    <span>{ticket.createdAt?.toDate ? ticket.createdAt.toDate().toLocaleDateString() : 'Reciente'}</span>
                                                </div>

                                                {ticket.adminResponse && (
                                                    <div className="mt-3 bg-slate-50 p-4 rounded-xl border border-slate-100 relative">
                                                        <div className="absolute -top-3 left-4 bg-primary text-slate-900 text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-widest">Respuesta del Admin</div>
                                                        <p className="text-sm font-medium text-slate-700 mt-1">{ticket.adminResponse}</p>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-12">
                                        <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                                        <p className="text-slate-500 font-bold">No tienes reportes pendientes</p>
                                        <p className="text-xs text-slate-400 mt-1">Si encuentras alguna falla, repórtala aquí.</p>
                                    </div>
                                )}
                            </div>

                            <div className="p-6 border-t border-slate-100 bg-white shrink-0">
                                <button
                                    onClick={() => {
                                        setShowSupportModal(false);
                                        setShowNewTicketModal(true);
                                    }}
                                    className="w-full bg-red-500 hover:bg-red-600 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2 transition-colors"
                                >
                                    <Plus className="w-5 h-5" /> Nuevo Reporte
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* New Support Ticket Modal */}
            <AnimatePresence>
                {showNewTicketModal && (
                    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="bg-white rounded-[40px] w-full max-w-2xl shadow-2xl overflow-hidden my-auto"
                        >
                            <div className="p-6 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-red-100 rounded-2xl text-red-500">
                                        <AlertCircle className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-black text-slate-900 leading-none">Nuevo Reporte</h3>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Detalla la falla encontrada</p>
                                    </div>
                                </div>
                                <button onClick={() => {
                                    setShowNewTicketModal(false);
                                    setShowSupportModal(true);
                                }} className="p-3 hover:bg-slate-200 rounded-2xl transition-all">
                                    <X className="w-6 h-6 text-slate-400" />
                                </button>
                            </div>

                            <form onSubmit={handleSubmitTicket} className="p-6 space-y-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Asunto / Título</label>
                                    <input
                                        type="text"
                                        required
                                        value={ticketForm.title}
                                        onChange={(e) => setTicketForm({...ticketForm, title: e.target.value})}
                                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 font-bold text-slate-700 focus:bg-white focus:border-red-300 transition-all outline-none"
                                        placeholder="Ej. Problema al hacer un pedido"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Descripción de la Falla</label>
                                    <textarea
                                        required
                                        value={ticketForm.description}
                                        onChange={(e) => setTicketForm({...ticketForm, description: e.target.value})}
                                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 font-medium text-slate-700 focus:bg-white focus:border-red-300 transition-all outline-none h-32 resize-none"
                                        placeholder="Por favor describe detalladamente lo que sucedió..."
                                    />
                                </div>

                                <button
                                    type="submit"
                                    disabled={isSubmittingTicket}
                                    className={`w-full bg-red-500 text-white font-black py-4 rounded-2xl flex justify-center items-center gap-2 transition-all ${isSubmittingTicket ? 'opacity-70' : 'hover:bg-red-600 active:scale-95'}`}
                                >
                                    {isSubmittingTicket ? (
                                        <div className="w-6 h-6 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
                                    ) : (
                                        <>
                                            <Send className="w-5 h-5" /> Enviar Reporte
                                        </>
                                    )}
                                </button>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

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
                                    <div className="p-3 bg-primary/10 rounded-2xl text-slate-900">
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
                                                <UploadCloud className="w-4 h-4 text-slate-900" />
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
                                        className="flex-[2] py-4 bg-primary text-slate-900 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-orange-600 transition-all shadow-xl shadow-orange-500/30 flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
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

            {/* Wallet Modal */}
            <AnimatePresence>
                {showWalletModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="bg-white rounded-[40px] w-full max-w-sm shadow-2xl overflow-hidden my-auto"
                        >
                            <div className="p-8 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
                                <div>
                                    <h3 className="text-xl font-black text-slate-900 flex items-center gap-2">
                                        <Wallet className="w-6 h-6 text-slate-900" /> Mi Billetera de Transporte
                                    </h3>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Fondos para Transporte</p>
                                </div>
                                <button onClick={() => setShowWalletModal(false)} className="p-2 hover:bg-slate-200 rounded-xl transition-all">
                                    <X className="w-6 h-6 text-slate-400" />
                                </button>
                            </div>

                            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto hide-scrollbar">
                                {/* Virtual Card */}
                                <div className="relative w-full aspect-[1.586/1] rounded-2xl overflow-hidden shadow-xl shadow-primary/20 group">
                                    {/* Card Pattern Background */}
                                    <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-black transition-transform duration-700 group-hover:scale-105" />
                                    <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.4)_0,transparent_100%)]" style={{ backgroundSize: '20px 20px' }} />

                                    <div className="absolute inset-0 flex flex-col justify-between p-6 z-10">
                                        <div className="flex justify-between items-start">
                                            <div 
                                                className="w-12 h-12 bg-white/10 backdrop-blur-md rounded-xl p-2 flex items-center justify-center border border-white/20 cursor-pointer active:scale-95 transition-transform"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    window.location.href = 'https://deliexpress.app';
                                                }}
                                            >
                                                <img
                                                    src="https://firebasestorage.googleapis.com/v0/b/arepa-express-ve-2026.firebasestorage.app/o/logo.png?alt=media&token=8acf92ec-b853-4f37-bd82-a4f651bbdcd9"
                                                    alt="Deliexpress"
                                                    className="w-full h-full object-contain brightness-0 invert"
                                                />
                                            </div>
                                            <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em] font-mono">Billetera Digital</span>
                                        </div>

                                        <div>
                                            <p className="text-white/40 text-[9px] font-black uppercase tracking-widest mb-1 italic">Titular de la tarjeta</p>
                                            <p className="text-white text-lg font-black tracking-wider uppercase drop-shadow-md truncate max-w-full">
                                                {userData?.displayName || user?.displayName || 'Usuario Deliexpress'}
                                            </p>

                                            <div className="mt-4 flex justify-between items-end">
                                                <div>
                                                    <p className="text-white/40 text-[9px] font-black uppercase tracking-widest mb-1 italic">Saldo Disponible</p>
                                                    <div className="flex items-baseline gap-1">
                                                        <span className={`${(userData?.walletBalance || 0) > 0 ? 'text-emerald-400' : 'text-red-500'} text-3xl font-black drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]`}>${(userData?.walletBalance || 0).toFixed(2)}</span>
                                                        <span className="text-white/20 text-xs font-black">USD</span>
                                                    </div>
                                                </div>
                                                <div className="w-10 h-6 bg-white/5 backdrop-blur-md rounded border border-white/10 flex items-center justify-center">
                                                    <div className="w-3 h-3 rounded-full bg-primary/40 -mr-1.5" />
                                                    <div className="w-3 h-3 rounded-full bg-primary/20" />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Glossy Overlay */}
                                    <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-white/10 pointer-events-none" />
                                </div>

                                <div className="bg-primary/5 p-4 rounded-2xl flex gap-3 text-slate-900 border border-primary/10">
                                    <Shield className="w-5 h-5 shrink-0 text-slate-900 mt-0.5" />
                                    <p className="text-xs font-bold leading-relaxed">Estos fondos son exclusivos para pagar tus viajes de <strong>Taxi</strong> y Moto. No aplican para compras de comida o tienda.</p>
                                </div>

                                {/* Recharge Instructions */}
                                {paymentMethods && (
                                    <div className="space-y-4">
                                        <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Instrucciones de Recarga</h4>

                                        {/* Pago Móvil */}
                                        {paymentMethods.pagoMovil?.active && (
                                            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 relative group">
                                                <div className="flex items-center gap-3 mb-3">
                                                    <div className="w-8 h-8 bg-primary/10 rounded-xl flex items-center justify-center">
                                                        <Smartphone className="w-4 h-4 text-slate-900" />
                                                    </div>
                                                    <span className="font-black text-slate-800 text-sm italic">Pago Móvil (Bs)</span>
                                                </div>
                                                <div className="space-y-2 text-[12px] font-medium text-slate-600">
                                                    <div className="flex justify-between items-center bg-white p-2 rounded-xl">
                                                        <span>Banco: <strong>{paymentMethods.pagoMovil.bank}</strong></span>
                                                        <button onClick={() => handleCopy(paymentMethods.pagoMovil.bank, 'bank')} className="p-1 hover:bg-slate-50 rounded text-slate-900">
                                                            {copiedId === 'bank' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                                        </button>
                                                    </div>
                                                    <div className="flex justify-between items-center bg-white p-2 rounded-xl">
                                                        <span>Teléfono: <strong>{paymentMethods.pagoMovil.phone}</strong></span>
                                                        <button onClick={() => handleCopy(paymentMethods.pagoMovil.phone, 'phone')} className="p-1 hover:bg-slate-50 rounded text-slate-900">
                                                            {copiedId === 'phone' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                                        </button>
                                                    </div>
                                                    <div className="flex justify-between items-center bg-white p-2 rounded-xl">
                                                        <span>Cédula: <strong>{paymentMethods.pagoMovil.idf}</strong></span>
                                                        <button onClick={() => handleCopy(paymentMethods.pagoMovil.idf, 'idf')} className="p-1 hover:bg-slate-50 rounded text-slate-900">
                                                            {copiedId === 'idf' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* Zelle */}
                                        {paymentMethods.zelle?.active && (
                                            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 mt-3">
                                                <div className="flex items-center gap-3 mb-3">
                                                    <div className="w-8 h-8 bg-indigo-100 rounded-xl flex items-center justify-center">
                                                        <Star className="w-4 h-4 text-primary fill-primary" />
                                                    </div>
                                                    <span className="font-black text-slate-800 text-sm italic">Zelle (USD)</span>
                                                </div>
                                                <div className="space-y-2 text-[12px] font-medium text-slate-600">
                                                    <div className="flex justify-between items-center bg-white p-2 rounded-xl">
                                                        <span className="truncate">Email: <strong>{paymentMethods.zelle.email}</strong></span>
                                                        <button onClick={() => handleCopy(paymentMethods.zelle.email, 'zelleEmail')} className="p-1 hover:bg-slate-50 rounded text-primary">
                                                            {copiedId === 'zelleEmail' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                                        </button>
                                                    </div>
                                                    <div className="flex justify-between items-center bg-white p-2 rounded-xl">
                                                        <span className="truncate">Nombre: <strong>{paymentMethods.zelle.name}</strong></span>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div className="h-px bg-slate-100 my-2" />

                                <form onSubmit={handleRechargeSubmit} className="space-y-4">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Monto a Recargar ($)</label>
                                        <input
                                            type="number"
                                            required
                                            min="1"
                                            step="0.01"
                                            value={rechargeAmount}
                                            onChange={(e) => setRechargeAmount(e.target.value)}
                                            className="w-full bg-slate-50 border-2 border-slate-100 focus:border-primary px-4 py-4 rounded-2xl outline-none font-black text-slate-700 transition-all text-xl"
                                            placeholder="Ej. 10.00"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Referencia / Teléfono Emisor</label>
                                        <input
                                            type="text"
                                            required
                                            value={rechargeRef}
                                            onChange={(e) => setRechargeRef(e.target.value)}
                                            className="w-full bg-slate-50 border-2 border-slate-100 focus:border-primary px-4 py-4 rounded-2xl outline-none font-bold text-slate-700 transition-all"
                                            placeholder="Nro. de Referencia"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Capture de Pantalla</label>
                                        <label className="w-full flex items-center justify-center gap-3 p-4 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 hover:bg-slate-100 cursor-pointer transition-all">
                                            <UploadCloud className="w-5 h-5 text-slate-400" />
                                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                                {rechargeProof ? rechargeProof.name : 'Elegir archivo'}
                                            </span>
                                            <input
                                                type="file"
                                                required
                                                accept="image/*"
                                                onChange={(e) => setRechargeProof(e.target.files?.[0] || null)}
                                                className="hidden"
                                            />
                                        </label>
                                    </div>
                                    <button
                                        type="submit"
                                        disabled={isRecharging}
                                        className="w-full bg-primary text-slate-900 py-5 rounded-[24px] font-black shadow-xl shadow-primary/30 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-70 mt-2 flex items-center justify-center gap-2 uppercase tracking-[0.2em] text-sm"
                                    >
                                        {isRecharging ? (
                                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                        ) : (
                                            "Reportar Recarga"
                                        )}
                                    </button>
                                </form>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </>
    );
}
