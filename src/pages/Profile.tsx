import React, { useState, useEffect, useRef } from 'react';
import { User, Mail, MapPin, CreditCard, LogOut, ShoppingBag, Settings, ChevronRight, ChevronDown, Clock, FileText, Bell, Navigation, X, Shield, UploadCloud, Star, Wallet, Gift, Award, MessageSquareWarning, Plus, Send, AlertCircle, CheckCircle, Store, Handshake, Fingerprint, Calendar, Trash2, AlertTriangle, Ticket, Sparkles } from 'lucide-react';
import { Geolocation } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';
import { isDemoMode, UN2X3_LOGO } from '../lib/env';
import DemoAlertModal from '../components/DemoAlertModal';
import { requestNotificationPermission, disableNotifications } from '../lib/notifications';
import { sendAppNotification } from '../services/nativeNotificationService';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { signInWithGoogle, signInWithEmail, signUpWithEmail, processReferralCode, sendPasswordResetEmail } from '../lib/auth-service';
import { Image as ImageIcon, Camera, Smartphone, User as UserIcon, Save } from 'lucide-react';
import AddressPicker from '../components/AddressPicker';
import { motion, AnimatePresence } from 'motion/react';
import ReviewModal from '../components/ReviewModal';
import { Copy, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { vibrate } from '../utils/haptics';
import { registerBiometric } from '../utils/security';
import { useCurrency } from '../context/CurrencyContext';
import { useBranding } from '../context/BrandingContext';
import RideChat from '../components/RideChat';

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
    amount?: number;
    status: string;
    createdAt: any;
    // Order specific
    items?: any[];
    deliveryMethod?: string;
    hasReviewed?: boolean;
    restaurantId?: string;
    restaurantName?: string;
    // Transport specific
    origin?: { lat: number, lng: number, address: string };
    destination?: { lat: number, lng: number, address: string };
    fare?: number;
    serviceType?: string;
    vehicleType?: string;
}

const RestaurantPointCard: React.FC<{ restId: string, points: number }> = ({ restId, points }) => {
    const [name, setName] = useState('Cargando...');
    useEffect(() => {
        supabase.from('comercios').select('name').eq('id', restId).maybeSingle().then(({ data }) => {
            if (data?.name) setName(data.name);
            else setName('Local Afiliado');
        });
    }, [restId]);

    if (points <= 0) return null;

    return (
        <div className="bg-white border border-slate-200 p-3 rounded-2xl flex items-center gap-3 hover:border-slate-300 transition-colors shadow-xs">
            <div className="w-10 h-10 bg-[#FFD100]/20 rounded-xl flex items-center justify-center text-[#0F172A] font-black text-xs shadow-xs shrink-0">
                {Math.floor(points)}
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-[10px] text-slate-500 font-black uppercase tracking-wider">Tus Puntos</p>
                <p className="text-sm font-black text-[#0F172A] truncate">{name}</p>
            </div>
        </div>
    );
};

export default function Profile() {
    const { user, userData, setUserData, isProfileComplete, refreshUserData, setIsUnlocked } = useAuth();
    const { branding } = useBranding();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [isSigningIn, setIsSigningIn] = useState(false);
    const [activities, setActivities] = useState<ActivityItem[]>([]);
    const [loadingActivities, setLoadingActivities] = useState(false);
    const [showAddressPicker, setShowAddressPicker] = useState(false);
    const [showEditProfileModal, setShowEditProfileModal] = useState(false);
    const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState('');
    const [showPrivacyPolicyModal, setShowPrivacyPolicyModal] = useState(false);
    const [isDeletingAccount, setIsDeletingAccount] = useState(false);
    const [updatingNotifications, setUpdatingNotifications] = useState(false);
    const [updatingBiometrics, setUpdatingBiometrics] = useState(false);
    const [updatingLocation, setUpdatingLocation] = useState(false);
    const [completingProfile, setCompletingProfile] = useState(false);
    const [reviewModalData, setReviewModalData] = useState<{ isOpen: boolean; orderId: string; restaurantId: string } | null>(null);
    const ordersRef = useRef<HTMLDivElement>(null);
    const { bcvRate } = useCurrency();
    const [historyFilter, setHistoryFilter] = useState<'all' | 'transport' | 'mandado' | 'order'>('all');
    const [selectedDetailActivity, setSelectedDetailActivity] = useState<any | null>(null);
    const [activeChatRequestId, setActiveChatRequestId] = useState<string | null>(null);
    const [showAllActivities, setShowAllActivities] = useState(false);
    const [activeRaffle, setActiveRaffle] = useState<any>(null);
    const [clientFooterText, setClientFooterText] = useState('Hecho con ❤️ en Venezuela');
    const [warningModalConfig, setWarningModalConfig] = useState<{
        title: string;
        description: string;
        onConfirm: () => void;
    } | null>(null);

    useEffect(() => {
        supabase
            .from('raffles')
            .select('*')
            .or('status.eq.active,is_active.eq.true')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
            .then(({ data }) => {
                if (data) setActiveRaffle(data);
            });

        supabase
            .from('app_branding')
            .select('client_footer_text')
            .eq('id', 'current')
            .maybeSingle()
            .then(({ data }) => {
                if (data?.client_footer_text) setClientFooterText(data.client_footer_text);
            });
    }, []);

    const getActivityCategoryMeta = (activity: any) => {
        if (activity.type === 'transport') {
            const cat = activity.service_category || activity.serviceCategory || activity.vehicle_type || activity.vehicleType;
            if (cat === 'mototaxi' || cat === 'moto') {
                return { label: 'Mototaxi', emoji: '🛵', color: 'bg-amber-100 text-amber-900 border-amber-300', tag: 'mototaxi' };
            }
            if (cat === 'mandado' || cat === 'muchacho_mandado') {
                return { label: 'Mandado', emoji: '📦', color: 'bg-orange-100 text-orange-900 border-orange-300', tag: 'mandado' };
            }
            if (cat === 'encomienda') {
                return { label: 'Encomienda', emoji: '📬', color: 'bg-purple-100 text-purple-900 border-purple-300', tag: 'encomienda' };
            }
            if (cat === 'confort') {
                return { label: 'Taxi VIP', emoji: '🚘', color: 'bg-indigo-100 text-indigo-900 border-indigo-300', tag: 'confort' };
            }
            return { label: 'Taxi', emoji: '🚕', color: 'bg-yellow-100 text-yellow-900 border-yellow-300', tag: 'taxi' };
        }
        return { label: 'Compra', emoji: '🛍️', color: 'bg-slate-100 text-slate-800 border-slate-200', tag: 'order' };
    };

    const getStatusBadgeClass = (status: string) => {
        const s = (status || '').toLowerCase();
        if (s.includes('cancel') || s === 'rejected' || s === 'failed' || s === 'driver_busy') {
            return 'bg-red-50 text-red-700 border border-red-200';
        }
        if (['completed', 'delivered', 'sold', 'paid', 'approved'].includes(s)) {
            return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
        }
        if (['in_progress', 'in_transit', 'arriving', 'accepted', 'driver_assigned', 'preparing'].includes(s)) {
            return 'bg-blue-50 text-blue-700 border border-blue-200';
        }
        return 'bg-amber-50 text-amber-700 border border-amber-200';
    };

    const getStatusLabel = (status: string, type?: string) => {
        const s = (status || '').toLowerCase();
        if (s.includes('cancel') || s === 'rejected' || s === 'failed' || s === 'driver_busy') {
            return 'Cancelado';
        }
        if (['completed', 'delivered', 'sold', 'paid', 'approved'].includes(s)) {
            return 'Completado';
        }
        if (['in_progress', 'in_transit', 'arriving', 'accepted', 'driver_assigned', 'preparing'].includes(s)) {
            return 'En curso';
        }
        if (['pending', 'finding_driver', 'searching'].includes(s)) {
            return 'Pendiente';
        }
        return 'Pendiente';
    };

    // Profile completion form state
    const [profileForm, setProfileForm] = useState({
        displayName: '',
        phone: '', // 10 digits
        nationality: 'V' as 'V' | 'E',
        cedulaNumber: '',
        birthdate: '',
        gender: '' as 'masculine' | 'feminine' | ''
    });
    const [profileError, setProfileError] = useState<string | null>(null);

    // Email Login/Signup State
    const [showEmailModal, setShowEmailModal] = useState(false);
    const [isLoginMode, setIsLoginMode] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [isEmailAuthLoading, setIsEmailAuthLoading] = useState(false);
    const [showForgotPasswordModal, setShowForgotPasswordModal] = useState(false);
    const [forgotEmail, setForgotEmail] = useState('');
    const [isSendingReset, setIsSendingReset] = useState(false);
    const [resetEmailSent, setResetEmailSent] = useState(false);
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [logoPreview, setLogoPreview] = useState<string | null>(null);

    // Rewards & Points State
    const [showRewardsModal, setShowRewardsModal] = useState(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    // Referral State
    const [referralCodeInput, setReferralCodeInput] = useState('');
    const [showReferralModal, setShowReferralModal] = useState(false);
    const [tempGoogleUser, setTempGoogleUser] = useState<any>(null);
    const [isApplyingReferral, setIsApplyingReferral] = useState(false);
    const [showDemoAlert, setShowDemoAlert] = useState(false);
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
        if (userData || user) {
            let rawPhone = userData?.phone || '';
            if (rawPhone.startsWith('+58')) {
                rawPhone = rawPhone.substring(3);
            } else if (rawPhone.startsWith('0')) {
                rawPhone = rawPhone.substring(1);
            }

            let nat: 'V' | 'E' = 'V';
            let cedNum = userData?.cedula || '';
            if (cedNum.startsWith('V-') || cedNum.startsWith('v-')) {
                nat = 'V';
                cedNum = cedNum.substring(2);
            } else if (cedNum.startsWith('E-') || cedNum.startsWith('e-')) {
                nat = 'E';
                cedNum = cedNum.substring(2);
            }

            setProfileForm({
                displayName: userData?.displayName || (user as any)?.user_metadata?.full_name || user?.email?.split('@')[0] || '',
                phone: rawPhone,
                nationality: nat,
                cedulaNumber: cedNum,
                birthdate: userData?.birthdate || '',
                gender: (userData as any)?.gender || ''
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
        setHistoryFilter('order');
        ordersRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        const fetchActivities = async () => {
            if (!user) return;
            setLoadingActivities(true);
            try {
                const uid = user.id || user.uid;
                // Fetch Orders (capped to 50 most recent for fast profile load)
                const { data: orderData } = await supabase
                    .from('orders')
                    .select('*')
                    .eq('user_id', uid)
                    .order('created_at', { ascending: false })
                    .limit(50);

                const fetchedOrders = (orderData || []).map((data: any) => {
                    const restId = data.restaurant_id || data.restaurantId || (data.items && data.items.length > 0 ? (data.items[0].restaurant_id || data.items[0].restaurantId) : null);
                    return {
                        id: data.id,
                        type: 'order',
                        restaurantId: restId,
                        ...data
                    } as ActivityItem;
                });

                // Fetch Transports (capped to 50 most recent)
                const { data: transportData } = await supabase
                    .from('transport_requests')
                    .select('*')
                    .eq('user_id', uid)
                    .order('created_at', { ascending: false })
                    .limit(50);

                const fetchedTransports = (transportData || []).map((data: any) => {
                    return {
                        id: data.id,
                        type: 'transport',
                        ...data
                    } as ActivityItem;
                });

                // Combine and sort
                const combined = [...fetchedOrders, ...fetchedTransports].sort((a, b) => {
                    const timeA = a.created_at ? new Date(a.created_at).getTime() : (a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt instanceof Date ? a.createdAt.getTime() : 0));
                    const timeB = b.created_at ? new Date(b.created_at).getTime() : (b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt instanceof Date ? b.createdAt.getTime() : 0));
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
                const { data: docSnap } = await supabase
                    .from('system_configs')
                    .select('*')
                    .eq('id', 'finances')
                    .maybeSingle();
                if (docSnap) {
                    setPaymentMethods(docSnap.data?.paymentMethods || docSnap.paymentMethods);
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
                const uid = user.id || user.uid;
                const { data: snapshot } = await supabase
                    .from('support_tickets')
                    .select('*')
                    .eq('user_id', uid)
                    .order('created_at', { ascending: false });

                const fetchedTickets = (snapshot || []).map((data: any) => ({
                    id: data.id,
                    ...data
                })) as SupportTicket[];
                
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
                const { data: snapshot } = await supabase
                    .from('restaurant_credits')
                    .select('*')
                    .eq('user_email', user.email)
                    .order('created_at', { ascending: false });

                const fetchedCredits = (snapshot || []).map((data: any) => {
                    return { id: data.id, restaurantName: data.restaurant_name || data.restaurantName || 'Restaurante', ...data };
                });
                setMyCredits(fetchedCredits);
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
            const uid = user.id || user.uid;
            const newTicket = {
                user_id: uid,
                user_name: userData.displayName || 'Usuario sin nombre',
                user_email: user.email || '',
                user_phone: userData.phone || '',
                title: ticketForm.title,
                description: ticketForm.description,
                status: 'open' as const,
                created_at: new Date().toISOString()
            };

            const { data: insData, error: insErr } = await supabase
                .from('support_tickets')
                .insert(newTicket)
                .select()
                .single();

            if (insErr) throw insErr;

            const ticketId = insData?.id || `ticket_${Date.now()}`;
            
            // Add locally to update UI immediately
            setSupportTickets(prev => [{
                ...newTicket,
                userId: uid,
                userName: userData.displayName || 'Usuario sin nombre',
                userEmail: user.email || '',
                userPhone: userData.phone || '',
                id: ticketId,
                createdAt: new Date().toISOString()
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
        const uid = user?.id || user?.uid;
        if (!uid || (!userData?.addresses)) return;
        const newAddresses = userData.addresses.filter(a => a.id !== addressId);
        try {
            await supabase.from('profiles').update({ addresses: newAddresses, updated_at: new Date().toISOString() }).eq('id', uid);
        } catch (e) {
            console.error("Error deleting address", e);
            alert("No se pudo eliminar la dirección.");
        }
    };

    const handleSetDefaultAddress = async (addressId: string) => {
        const uid = user?.id || user?.uid;
        if (!uid || (!userData?.addresses)) return;
        const newAddresses = userData.addresses.map(a => ({
            ...a,
            isDefault: a.id === addressId
        }));
        try {
            await supabase.from('profiles').update({ addresses: newAddresses, updated_at: new Date().toISOString() }).eq('id', uid);
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

    const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!forgotEmail) return;
        setIsSendingReset(true);
        try {
            await sendPasswordResetEmail(forgotEmail.trim());
            setResetEmailSent(true);
            toast.success("Correo de recuperación enviado con éxito.");
        } catch (err: any) {
            console.error("Error sending reset password email:", err);
            toast.error(err.message || "Error al enviar el correo de recuperación.");
        } finally {
            setIsSendingReset(false);
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
        await supabase.auth.signOut();
        navigate('/');
    };

    const confirmDisableNotifications = async () => {
        const uid = user?.id || (user as any)?.uid;
        if (!uid) return;
        setUpdatingNotifications(true);
        try {
            await disableNotifications(uid);
            localStorage.setItem('notifications_enabled', 'false');
            await supabase.from('profiles').update({
                notifications_enabled: false,
                updated_at: new Date().toISOString()
            }).eq('id', uid);
            setUserData((prev: any) => ({
                ...prev,
                notificationsEnabled: false,
                notifications_enabled: false,
                fcmTokens: [],
                fcm_tokens: []
            }));
            await refreshUserData();
            toast.success("Notificaciones desactivadas");
        } catch (err) {
            console.error("Error toggling notifications", err);
            toast.error("Ocurrió un error al procesar tu solicitud.");
        } finally {
            setUpdatingNotifications(false);
        }
    };

    const handleToggleNotifications = async () => {
        const uid = user?.id || (user as any)?.uid;
        if (!uid) return;
        const isEnabled = Boolean(
            userData?.notificationsEnabled !== false && 
            userData?.notifications_enabled !== false && 
            localStorage.getItem('notifications_enabled') !== 'false'
        );

        if (isEnabled) {
            setWarningModalConfig({
                title: "¿Desactivar Notificaciones?",
                description: "Para garantizar el funcionamiento de los pedidos, la seguridad de tu cuenta y el rastreo de rutas, es necesario que mantengas estas opciones activadas.",
                onConfirm: confirmDisableNotifications
            });
            return;
        }

        setUpdatingNotifications(true);
        try {
            const result = await requestNotificationPermission(uid);
            if (result.success) {
                localStorage.setItem('notifications_enabled', 'true');
                await supabase.from('profiles').update({
                    notifications_enabled: true,
                    notificationsEnabled: true,
                    updated_at: new Date().toISOString()
                }).eq('id', uid);
                setUserData((prev: any) => ({
                    ...prev,
                    notificationsEnabled: true,
                    notifications_enabled: true
                }));
                await refreshUserData();
                sendAppNotification({
                    title: '🔔 ¡Notificaciones Activadas!',
                    body: 'Te avisaremos cuando tu conductor vaya en camino, llegue o haya avances en tus compras.',
                    soundType: 'client'
                });
                toast.success("Notificaciones activadas con éxito 🎉");
            } else if (result.error) {
                toast.error(result.error);
            }
        } catch (err) {
            console.error("Error toggling notifications", err);
            toast.error("Ocurrió un error al procesar tu solicitud.");
        } finally {
            setUpdatingNotifications(false);
        }
    };

    const handleCompleteProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        setProfileError(null);

        const cleanDisplayName = profileForm.displayName.trim();
        if (!cleanDisplayName) {
            setProfileError("Por favor ingresa tu nombre completo.");
            return;
        }

        // Phone validation: strip leading zero, check exactly 10 digits
        let cleanPhone = profileForm.phone.replace(/\D/g, '');
        if (cleanPhone.startsWith('0')) {
            cleanPhone = cleanPhone.substring(1);
        }
        if (cleanPhone.length !== 10) {
            setProfileError("El número de celular debe tener exactamente 10 dígitos (ej: 412 1234567).");
            return;
        }
        const fullPhone = `+58${cleanPhone}`;

        // Cédula validation: numeric, between 6 and 9 digits
        const cleanCedula = profileForm.cedulaNumber.replace(/\D/g, '');
        if (cleanCedula.length < 6 || cleanCedula.length > 9) {
            setProfileError("La cédula de identidad debe contener entre 6 y 9 dígitos.");
            return;
        }
        const fullCedula = `${profileForm.nationality}-${cleanCedula}`;

        // Birthdate validation
        if (!profileForm.birthdate) {
            setProfileError("Por favor ingresa tu fecha de cumpleaños.");
            return;
        }

        const birthDateObj = new Date(profileForm.birthdate);
        const today = new Date();
        if (isNaN(birthDateObj.getTime()) || birthDateObj >= today) {
            setProfileError("Por favor ingresa una fecha de nacimiento válida.");
            return;
        }

        setCompletingProfile(true);
        try {
            // Check for duplicate phone in another account
            const { data: existingPhone, error: phoneErr } = await supabase
                .from('profiles')
                .select('id')
                .eq('phone', fullPhone)
                .neq('id', user.id)
                .maybeSingle();

            if (phoneErr) console.warn("Phone check warning:", phoneErr);
            if (existingPhone) {
                setProfileError(`El número de celular +58 ${cleanPhone} ya está registrado en otra cuenta.`);
                setCompletingProfile(false);
                return;
            }

            // Check for duplicate cédula in another account
            const { data: existingCedula, error: cedulaErr } = await supabase
                .from('profiles')
                .select('id')
                .eq('cedula', fullCedula)
                .neq('id', user.id)
                .maybeSingle();

            if (cedulaErr) console.warn("Cédula check warning:", cedulaErr);
            if (existingCedula) {
                setProfileError(`La cédula de identidad ${fullCedula} ya está registrada en otra cuenta.`);
                setCompletingProfile(false);
                return;
            }

            let photoURL = userData?.photoURL || (user as any)?.user_metadata?.avatar_url || '';

            if (logoFile) {
                const fileExt = logoFile.name.split('.').pop() || 'jpg';
                const filePath = `${user.id}/avatar_${Date.now()}.${fileExt}`;
                const { error: uploadError } = await supabase.storage
                    .from('avatars')
                    .upload(filePath, logoFile, { upsert: true });

                if (!uploadError) {
                    const { data: { publicUrl } } = supabase.storage
                        .from('avatars')
                        .getPublicUrl(filePath);
                    photoURL = publicUrl;
                }
            }

            const { error: updateError } = await supabase
                .from('profiles')
                .update({
                    full_name: cleanDisplayName,
                    phone: fullPhone,
                    cedula: fullCedula,
                    birthdate: profileForm.birthdate,
                    gender: profileForm.gender || null,
                    photo_url: photoURL || null,
                    updated_at: new Date().toISOString()
                })
                .eq('id', user.id);

            if (updateError) {
                if (updateError.code === '23505' || updateError.message?.includes('duplicate key')) {
                    if (updateError.message?.includes('phone')) {
                        throw new Error("El número de teléfono ya está registrado en otra cuenta.");
                    }
                    if (updateError.message?.includes('cedula')) {
                        throw new Error("La cédula de identidad ya está registrada en otra cuenta.");
                    }
                }
                throw updateError;
            }

            if (refreshUserData) {
                await refreshUserData();
            }

            toast.success("¡Perfil completado exitosamente! 🚀");
            setShowEditProfileModal(false);
            setLogoFile(null);
            setLogoPreview(null);
        } catch (e: any) {
            console.error("Error updating profile", e);
            setProfileError(e.message || "Ocurrió un error al guardar tus datos.");
        } finally {
            setCompletingProfile(false);
        }
    };

    const handleDeleteAccount = async () => {
        if (!user) return;
        if (deleteConfirmText.trim().toUpperCase() !== 'ELIMINAR') {
            toast.error("Por favor escribe 'ELIMINAR' para confirmar.");
            return;
        }
        try {
            setIsDeletingAccount(true);
            vibrate(50);

            const { error } = await supabase.rpc('delete_user_account');
            if (error) {
                console.warn("RPC delete_user_account warning:", error);
                await supabase.from('profiles').update({
                    full_name: 'Usuario Eliminado',
                    status: 'deleted',
                    updated_at: new Date().toISOString()
                }).eq('id', user.id || user.uid);
            }

            toast.success("Tu cuenta ha sido eliminada por completo.");
            setShowDeleteAccountModal(false);
            setShowEditProfileModal(false);

            await supabase.auth.signOut();
            localStorage.clear();
            sessionStorage.clear();
            window.location.href = '/';
        } catch (err: any) {
            console.error("Error al eliminar la cuenta:", err);
            toast.error(err.message || "No se pudo eliminar la cuenta. Intenta de nuevo.");
        } finally {
            setIsDeletingAccount(false);
        }
    };

    const handleRedeemReward = (rewardName: string, requiredPoints: number) => {
        const currentPoints = Math.floor(userData?.points || 0);
        if (currentPoints < requiredPoints) {
            toast.error(`Necesitas ${requiredPoints} puntos para canjear esta recompensa (tienes ${currentPoints} pts).`);
            return;
        }
        vibrate(30);
        toast.success(`¡Cupón de "${rewardName}" canjeado con éxito! Se aplicará automáticamente a tu cuenta.`);
    };

    if (!user) {
        return (
            <div className="w-full min-h-[90vh] bg-slate-50 overflow-y-auto overflow-x-hidden flex flex-col items-center justify-center px-4 py-8 text-center animate-in fade-in duration-300">
                <div 
                    onClick={() => {
                        vibrate(20);
                        toast('¡Bienvenido a Un 2x3!', { icon: '🚀', style: { borderRadius: '15px', background: '#333', color: '#fff' } });
                    }}
                    className="w-48 h-20 flex items-center justify-center mb-4 cursor-pointer active:scale-95 transition-transform p-2"
                >
                    <img 
                        src={branding.app_client_logo || UN2X3_LOGO} 
                        alt={`${branding.app_client_name || 'Un 2x3'} Logo`}
                        className="w-auto h-full object-contain filter drop-shadow-md"
                    />
                </div>

                <div className="w-full max-w-sm bg-white rounded-[32px] p-6 shadow-xl border border-slate-100 text-left">
                    <div className="text-center mb-6">
                        <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                            {isLoginMode ? '¡Hola de nuevo!' : 'Únete a Un 2x3'}
                        </h1>
                        <p className="text-xs text-slate-500 font-medium mt-1">
                            {isLoginMode 
                                ? 'Ingresa para pedir comida, taxis y mandados' 
                                : 'Crea tu cuenta en un 2x3 y empieza a disfrutar'}
                        </p>
                    </div>

                    {/* Google Login button */}
                    <button
                        type="button"
                        onClick={async () => {
                            if (isDemoMode()) {
                                setShowDemoAlert(true);
                                return;
                            }
                            vibrate(40);
                            await handleGoogleSignIn();
                        }}
                        disabled={isSigningIn}
                        className="w-full bg-slate-900 text-white hover:bg-slate-800 py-3.5 rounded-2xl font-black shadow-md hover:scale-[1.01] active:scale-[0.98] transition-all disabled:opacity-70 flex items-center justify-center gap-3 cursor-pointer mb-4"
                    >
                        {isSigningIn ? (
                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                            <>
                                <svg className="w-5 h-5" viewBox="0 0 24 24">
                                    <path
                                        fill="#4285F4"
                                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                                    />
                                    <path
                                        fill="#34A853"
                                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                                    />
                                    <path
                                        fill="#FBBC05"
                                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                                    />
                                    <path
                                        fill="#EA4335"
                                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                                    />
                                </svg>
                                <span className="text-sm">Continuar con Google</span>
                            </>
                        )}
                    </button>

                    <div className="flex items-center my-4">
                        <div className="flex-1 border-t border-slate-200"></div>
                        <span className="px-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">o con tu correo</span>
                        <div className="flex-1 border-t border-slate-200"></div>
                    </div>

                    {/* Segmented Mode Selector */}
                    {!isForcedRegister && (
                        <div className="bg-slate-100 p-1 rounded-2xl mb-6 flex relative">
                            <button
                                type="button"
                                onClick={() => {
                                    vibrate(20);
                                    setIsLoginMode(true);
                                    setError(null);
                                }}
                                className={`flex-1 py-2.5 text-xs font-black rounded-xl transition-all ${
                                    isLoginMode 
                                        ? 'bg-primary text-slate-900 shadow-sm' 
                                        : 'text-slate-500 hover:text-slate-800'
                                }`}
                            >
                                INICIAR SESIÓN
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    vibrate(20);
                                    setIsLoginMode(false);
                                    setError(null);
                                }}
                                className={`flex-1 py-2.5 text-xs font-black rounded-xl transition-all ${
                                    !isLoginMode 
                                        ? 'bg-primary text-slate-900 shadow-sm' 
                                        : 'text-slate-500 hover:text-slate-800'
                                }`}
                            >
                                CREAR CUENTA
                            </button>
                        </div>
                    )}

                    {error && (
                        <div className="mb-4 p-3.5 bg-red-50 border border-red-100 text-red-600 rounded-2xl text-xs font-bold flex items-center gap-2 animate-in shake-in duration-300">
                            <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                            <span>{error}</span>
                        </div>
                    )}

                    <form onSubmit={handleEmailAuthSubmit} className="space-y-3.5">
                        {!isLoginMode && (
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nombre Completo</label>
                                <div className="relative">
                                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <input
                                        type="text"
                                        required
                                        value={fullName}
                                        onChange={(e) => setFullName(e.target.value)}
                                        placeholder="Ej: Juan Pérez"
                                        className="w-full bg-slate-50 border-2 border-slate-100 focus:border-primary focus:bg-white pl-10 pr-4 py-3 rounded-2xl outline-none font-bold text-slate-700 text-sm transition-all"
                                    />
                                </div>
                            </div>
                        )}

                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Correo Electrónico</label>
                            <div className="relative">
                                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="tu@correo.com"
                                    className="w-full bg-slate-50 border-2 border-slate-100 focus:border-primary focus:bg-white pl-10 pr-4 py-3 rounded-2xl outline-none font-bold text-slate-700 text-sm transition-all"
                                />
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Contraseña</label>
                            <div className="relative">
                                <Shield className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                    type="password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="w-full bg-slate-50 border-2 border-slate-100 focus:border-primary focus:bg-white pl-10 pr-4 py-3 rounded-2xl outline-none font-bold text-slate-700 text-sm transition-all"
                                />
                            </div>
                        </div>

                        {isLoginMode && (
                            <div className="flex justify-end pt-0.5">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setForgotEmail(email);
                                        setResetEmailSent(false);
                                        setShowForgotPasswordModal(true);
                                    }}
                                    className="text-xs font-bold text-slate-500 hover:text-slate-900 transition-colors"
                                >
                                    ¿Olvidaste tu contraseña?
                                </button>
                            </div>
                        )}

                        {!isLoginMode && (
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                                    {isForcedRegister ? "Código de Referido (Aplicado)" : "Código de Referido (Opcional)"}
                                </label>
                                <div className="relative">
                                    <Gift className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <input
                                        type="text"
                                        value={referralCodeInput}
                                        onChange={(e) => setReferralCodeInput(e.target.value.toUpperCase())}
                                        placeholder="Ej: ABCDEF"
                                        className={`w-full bg-slate-50 border-2 border-slate-100 focus:border-primary focus:bg-white pl-10 pr-4 py-3 rounded-2xl outline-none font-bold text-sm transition-all uppercase ${isForcedRegister ? "text-primary/80 bg-slate-100" : "text-slate-700"}`}
                                        maxLength={10}
                                        readOnly={isForcedRegister}
                                    />
                                </div>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={isEmailAuthLoading}
                            className="w-full bg-primary text-slate-900 py-3.5 rounded-2xl font-black shadow-lg shadow-primary/25 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-70 mt-3 flex items-center justify-center gap-2 cursor-pointer"
                        >
                            {isEmailAuthLoading ? (
                                <div className="w-5 h-5 border-2 border-slate-900 border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                                <span>{isLoginMode ? "Iniciar Sesión" : "Crear Mi Cuenta"}</span>
                            )}
                        </button>

                        {!isForcedRegister && (
                            <div className="pt-2 text-center">
                                <button
                                    type="button"
                                    onClick={() => {
                                        vibrate(20);
                                        setIsLoginMode(!isLoginMode);
                                        setError(null);
                                    }}
                                    className="text-xs font-bold text-slate-500 hover:text-slate-900 transition-colors"
                                >
                                    {isLoginMode ? (
                                        <>¿No tienes cuenta aún? <span className="text-slate-900 font-black underline">Regístrate</span></>
                                    ) : (
                                        <>¿Ya tienes cuenta? <span className="text-slate-900 font-black underline">Inicia Sesión</span></>
                                    )}
                                </button>
                            </div>
                        )}
                    </form>
                </div>

                {/* In-App Forgot Password Modal */}
                <AnimatePresence>
                    {showForgotPasswordModal && (
                        <div className="fixed inset-0 z-[115] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
                            <motion.div
                                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                                className="bg-white rounded-[32px] w-full max-w-sm shadow-2xl overflow-hidden"
                            >
                                <div className="p-6 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
                                    <div>
                                        <h3 className="text-xl font-black text-slate-900">
                                            Recuperar Contraseña
                                        </h3>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
                                            Te enviaremos un enlace a tu correo 📩
                                        </p>
                                    </div>
                                    <button 
                                        onClick={() => setShowForgotPasswordModal(false)} 
                                        className="p-2 hover:bg-slate-200 rounded-xl transition-all"
                                    >
                                        <X className="w-5 h-5 text-slate-400" />
                                    </button>
                                </div>

                                {resetEmailSent ? (
                                    <div className="p-6 text-center space-y-4">
                                        <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                                            <CheckCircle className="w-8 h-8" />
                                        </div>
                                        <h4 className="text-lg font-black text-slate-900">¡Correo Enviado!</h4>
                                        <p className="text-xs text-slate-500 font-medium leading-relaxed">
                                            Hemos enviado las instrucciones para restablecer tu contraseña a <strong>{forgotEmail}</strong>. Revisa tu bandeja de entrada o spam.
                                        </p>
                                        <button
                                            type="button"
                                            onClick={() => setShowForgotPasswordModal(false)}
                                            className="w-full bg-slate-100 text-slate-900 font-black py-3 rounded-2xl hover:bg-slate-200 transition-colors text-sm"
                                        >
                                            Entendido
                                        </button>
                                    </div>
                                ) : (
                                    <form onSubmit={handleForgotPasswordSubmit} className="p-6 space-y-4">
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Correo Electrónico</label>
                                            <div className="relative">
                                                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                                <input
                                                    type="email"
                                                    required
                                                    value={forgotEmail}
                                                    onChange={(e) => setForgotEmail(e.target.value)}
                                                    placeholder="tu@correo.com"
                                                    className="w-full bg-slate-50 border-2 border-slate-100 focus:border-primary focus:bg-white pl-10 pr-4 py-3 rounded-2xl outline-none font-bold text-slate-700 text-sm transition-all"
                                                />
                                            </div>
                                        </div>

                                        <button
                                            type="submit"
                                            disabled={isSendingReset}
                                            className="w-full bg-primary text-slate-900 py-3.5 rounded-2xl font-black shadow-lg shadow-primary/25 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-70 flex items-center justify-center gap-2 cursor-pointer"
                                        >
                                            {isSendingReset ? (
                                                <div className="w-5 h-5 border-2 border-slate-900 border-t-transparent rounded-full animate-spin"></div>
                                            ) : (
                                                <span>Enviar Enlace</span>
                                            )}
                                        </button>
                                    </form>
                                )}
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

                <DemoAlertModal 
                    isOpen={showDemoAlert} 
                    onClose={() => setShowDemoAlert(false)} 
                />
            </div>
        );
    }

    // Profile Completion Overlay/View
    if (user && !isProfileComplete) {
        return (
            <div className="w-full h-full overflow-y-auto overflow-x-hidden flex flex-col items-center justify-center min-h-[80vh] px-6 py-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mb-6 overflow-hidden">
                    <User className="w-12 h-12 text-slate-900" />
                </div>
                <h1 className="text-2xl font-black text-slate-900 mb-2 text-center">¡Un paso más! 🚀</h1>
                <p className="text-slate-500 mb-8 max-w-[280px] text-center">
                    Necesitamos estos datos para poder procesar tus pedidos correctamente.
                </p>

                {profileError && (
                    <div className="w-full max-w-sm mb-4 p-4 bg-red-50 border border-red-200 text-red-600 rounded-2xl text-xs font-semibold flex items-center gap-3">
                        <AlertCircle className="w-5 h-5 shrink-0 text-red-500" />
                        <span>{profileError}</span>
                    </div>
                )}

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
                        <div className="flex rounded-2xl overflow-hidden border-2 border-slate-100 bg-slate-50 focus-within:border-primary transition-all">
                            <div className="px-3.5 py-4 bg-slate-200/70 border-r border-slate-200 text-slate-700 font-black text-sm flex items-center gap-1.5 select-none shrink-0">
                                <span>🇻🇪</span>
                                <span>+58</span>
                            </div>
                            <input
                                type="tel"
                                required
                                maxLength={10}
                                value={profileForm.phone}
                                onChange={(e) => {
                                    let val = e.target.value.replace(/\D/g, '');
                                    if (val.startsWith('0')) val = val.substring(1);
                                    if (val.length <= 10) {
                                        setProfileForm({ ...profileForm, phone: val });
                                    }
                                }}
                                className="w-full bg-transparent px-4 py-4 outline-none font-bold text-slate-700 placeholder:text-slate-400 placeholder:font-normal"
                                placeholder="412 1234567"
                            />
                        </div>
                        <p className="text-[10px] text-slate-400 font-medium ml-1">Ingresa los 10 dígitos sin el cero inicial (ej: 412...)</p>
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Cédula de Identidad</label>
                        <div className="flex rounded-2xl overflow-hidden border-2 border-slate-100 bg-slate-50 focus-within:border-primary transition-all">
                            <div className="flex bg-slate-200/70 p-1 border-r border-slate-200 shrink-0">
                                <button
                                    type="button"
                                    onClick={() => setProfileForm({ ...profileForm, nationality: 'V' })}
                                    className={`px-3 py-2 rounded-xl text-xs font-black transition-all ${
                                        profileForm.nationality === 'V' ? 'bg-primary text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                                    }`}
                                >
                                    V
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setProfileForm({ ...profileForm, nationality: 'E' })}
                                    className={`px-3 py-2 rounded-xl text-xs font-black transition-all ${
                                        profileForm.nationality === 'E' ? 'bg-primary text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                                    }`}
                                >
                                    E
                                </button>
                            </div>
                            <input
                                type="text"
                                required
                                maxLength={9}
                                value={profileForm.cedulaNumber}
                                onChange={(e) => {
                                    const val = e.target.value.replace(/\D/g, '');
                                    if (val.length <= 9) {
                                        setProfileForm({ ...profileForm, cedulaNumber: val });
                                    }
                                }}
                                className="w-full bg-transparent px-4 py-4 outline-none font-bold text-slate-700 placeholder:text-slate-400 placeholder:font-normal"
                                placeholder="12345678"
                            />
                        </div>
                        <p className="text-[10px] text-slate-400 font-medium ml-1">Selecciona V (Venezolano) o E (Extranjero)</p>
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1 flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-primary" /> Fecha de Cumpleaños 🎂
                        </label>
                        <input
                            type="date"
                            required
                            value={profileForm.birthdate}
                            max={new Date().toISOString().split('T')[0]}
                            onChange={(e) => setProfileForm({ ...profileForm, birthdate: e.target.value })}
                            className="w-full bg-slate-50 border-2 border-slate-100 focus:border-primary px-4 py-4 rounded-2xl outline-none font-bold text-slate-700 transition-all cursor-pointer"
                        />
                        <p className="text-[10px] text-slate-400 font-medium ml-1">¡Recibirás promociones y descuentos especiales en tu cumpleaños!</p>
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Género (Para personalización)</label>
                        <div className="flex gap-3 p-1 bg-slate-100 rounded-2xl">
                            <button
                                type="button"
                                onClick={() => setProfileForm({ ...profileForm, gender: 'masculine' })}
                                className={`flex-1 py-3 rounded-xl font-black text-xs transition-all ${profileForm.gender === 'masculine' ? 'bg-primary text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                            >
                                MASCULINO
                            </button>
                            <button
                                type="button"
                                onClick={() => setProfileForm({ ...profileForm, gender: 'feminine' })}
                                className={`flex-1 py-3 rounded-xl font-black text-xs transition-all ${profileForm.gender === 'feminine' ? 'bg-primary text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                            >
                                FEMENINO
                            </button>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={completingProfile}
                        className="w-full bg-primary text-slate-900 py-4 rounded-2xl font-bold shadow-lg shadow-primary/30 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-70 mt-4 flex items-center justify-center gap-2"
                    >
                        {completingProfile ? (
                            <div className="w-5 h-5 border-2 border-slate-900 border-t-transparent rounded-full animate-spin"></div>
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
                        <div className="mt-3 flex items-center justify-center gap-4 text-xs font-semibold">
                            <button
                                type="button"
                                onClick={() => setShowPrivacyPolicyModal(true)}
                                className="text-slate-400 hover:text-slate-600 underline transition-colors cursor-pointer"
                            >
                                Términos y Privacidad
                            </button>
                            <span className="text-slate-300">•</span>
                            <button
                                type="button"
                                onClick={() => {
                                    vibrate(30);
                                    setDeleteConfirmText('');
                                    setShowDeleteAccountModal(true);
                                }}
                                className="text-rose-400 hover:text-rose-600 underline transition-colors cursor-pointer"
                            >
                                Eliminar mi cuenta
                            </button>
                        </div>
            </div>
        );
    }

    return (
        <>
                        <div className="w-full h-full overflow-y-auto overflow-x-hidden pb-32 overscroll-contain animate-in fade-in duration-500 bg-[#F8FAFC]">
                {/* 1. CABECERA DEL PERFIL (NEGRO OBSIDIANA #0F172A + ACENTOS AMARILLO #FFD100 + SAFE AREA) */}
                <div className="bg-[#0F172A] text-white pt-[max(env(safe-area-inset-top,16px),20px)] pb-6 px-5 rounded-b-[32px] shadow-lg">
                    {/* Fila superior con título y botón de ajustes */}
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-xs font-bold tracking-wider uppercase text-white/60">Mi Cuenta</span>
                        <button
                            type="button"
                            onClick={() => setShowEditProfileModal(true)}
                            aria-label="Configuración de Perfil"
                            className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 text-white flex items-center justify-center shrink-0 transition-all border border-white/10"
                        >
                            <Settings className="w-5 h-5 text-white" />
                        </button>
                    </div>

                    {/* Avatar + Datos en fila limpia */}
                    <div className="flex items-center gap-3.5">
                        <div className="w-16 h-16 rounded-full border-2 border-[#FFD100] overflow-hidden bg-white shrink-0 shadow-md flex items-center justify-center">
                            {((userData?.photoURL && typeof userData.photoURL === 'string' && userData.photoURL !== '') || (user?.photoURL && typeof user.photoURL === 'string' && user.photoURL !== '')) ? (
                                <img 
                                    src={userData?.photoURL || user?.photoURL || ''} 
                                    alt="Foto de Perfil" 
                                    className="w-full h-full object-cover rounded-full" 
                                    referrerPolicy="no-referrer"
                                    onError={(e) => {
                                        const nameForAvatar = userData?.fullName || (userData as any)?.full_name || userData?.displayName || (user as any)?.displayName || 'U';
                                        (e.target as HTMLImageElement).onerror = null;
                                        (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(nameForAvatar)}&background=0F172A&color=FFD100&bold=true`;
                                    }}
                                />
                            ) : (
                                <div className="w-full h-full bg-[#0F172A] flex items-center justify-center text-[#FFD100] font-black text-xl">
                                    {(userData?.fullName || userData?.displayName || user?.email || 'U').charAt(0).toUpperCase()}
                                </div>
                            )}
                        </div>
                        <div className="min-w-0 flex-1">
                            <h2 className="text-lg font-extrabold text-white truncate">
                                {userData?.fullName || (userData as any)?.full_name || userData?.displayName || (user as any)?.displayName || (user as any)?.user_metadata?.full_name || (user as any)?.user_metadata?.name || user?.email?.split('@')[0] || 'Usuario'}
                            </h2>
                            <p className="text-xs text-white/70 truncate mt-0.5">
                                {user.email}
                            </p>
                            <button
                                type="button"
                                onClick={() => navigate('/rewards')}
                                className="inline-flex items-center gap-1.5 bg-[#FFD100] hover:bg-[#e6bd00] active:scale-95 text-[#0F172A] font-black text-xs px-3 py-1 rounded-full mt-1.5 transition-all shadow-xs"
                            >
                                <Award className="w-3.5 h-3.5 text-[#0F172A]" />
                                <span>{Math.floor(userData?.points || 0).toLocaleString()} pts</span>
                                <ChevronRight className="w-3 h-3 text-[#0F172A]/70" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* 2. ACCESOS RÁPIDOS ("MIS PUNTOS", "PEDIDOS", "REGALOS") EN GRILLA UNIVERSAL */}
                <div className="grid grid-cols-3 gap-2.5 px-4 -mt-4 relative z-10">
                    <div
                        onClick={() => setShowRewardsModal(true)}
                        className="bg-white border border-slate-200/80 shadow-sm rounded-2xl p-3 flex flex-col items-center justify-center gap-1.5 h-[84px] cursor-pointer hover:border-slate-300 active:scale-95 transition-all"
                    >
                        <div className="w-9 h-9 rounded-xl bg-[#FFD100]/20 text-[#0F172A] flex items-center justify-center shrink-0">
                            <Award className="w-5 h-5 text-[#0F172A]" />
                        </div>
                        <span className="text-xs font-bold text-[#0F172A] whitespace-nowrap">Mis Puntos</span>
                    </div>

                    <div
                        onClick={scrollToOrders}
                        className="bg-white border border-slate-200/80 shadow-sm rounded-2xl p-3 flex flex-col items-center justify-center gap-1.5 h-[84px] cursor-pointer hover:border-slate-300 active:scale-95 transition-all"
                    >
                        <div className="w-9 h-9 rounded-xl bg-[#FFD100]/20 text-[#0F172A] flex items-center justify-center shrink-0">
                            <ShoppingBag className="w-5 h-5 text-[#0F172A]" />
                        </div>
                        <span className="text-xs font-bold text-[#0F172A] whitespace-nowrap">Pedidos</span>
                    </div>

                    <div
                        onClick={() => navigate('/rewards')}
                        className="bg-white border border-slate-200/80 shadow-sm rounded-2xl p-3 flex flex-col items-center justify-center gap-1.5 h-[84px] cursor-pointer hover:border-slate-300 active:scale-95 transition-all"
                    >
                        <div className="w-9 h-9 rounded-xl bg-[#FFD100]/20 text-[#0F172A] flex items-center justify-center shrink-0">
                            <Gift className="w-5 h-5 text-[#0F172A]" />
                        </div>
                        <span className="text-xs font-bold text-[#0F172A] whitespace-nowrap">Regalos</span>
                    </div>
                </div>

                {/* 3. BANNER DE FIDELIZACIÓN ("PRÓXIMAMENTE SORPRESAS" / CANJEAR) UNIVERSAL Y SIN DESBORDES */}
                <div className="mx-4 mt-3 bg-[#0F172A] text-white rounded-2xl p-4 flex items-center justify-between gap-3 border border-[#FFD100]/30 shadow-md">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-11 h-11 rounded-xl bg-[#FFD100] text-[#0F172A] flex items-center justify-center shrink-0 font-black text-xl shadow-sm">
                            🎁
                        </div>
                        <div className="min-w-0 flex-1">
                            <h4 className="text-sm font-extrabold text-white leading-tight truncate">
                                Próximamente sorpresas
                            </h4>
                            <p className="text-xs text-white/75 line-clamp-2 mt-0.5 leading-snug">
                                Acumula puntos con cada viaje o compra para disfrutar de increíbles sorpresas.
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => navigate('/rewards')}
                        className="bg-[#FFD100] hover:bg-[#e6bd00] active:scale-95 text-[#0F172A] font-black text-xs px-4 py-2.5 rounded-xl shrink-0 transition-all shadow-sm"
                    >
                        Canjear
                    </button>
                </div>

                {/* Mis Cuotas 2x3 */}
                {myCredits.length > 0 && (
                    <div className="px-4 mt-4 space-y-2.5">
                        <div className="flex items-center justify-between px-1">
                            <h3 className="text-base font-black text-[#0F172A] flex items-center gap-2">
                                <Handshake className="w-5 h-5 text-indigo-500" />
                                Mis Cuotas 2x3
                            </h3>
                            {myCredits.some(c => c.status === 'defaulted') && (
                                <span className="bg-red-100 text-red-600 text-[10px] font-black uppercase px-2 py-0.5 rounded-full animate-pulse flex items-center gap-1">
                                    <AlertCircle className="w-3 h-3" />
                                    Atrasado
                                </span>
                            )}
                        </div>
                        <div className="grid gap-2.5">
                            {myCredits.map(credit => {
                                const pendingInstallments = credit.installments.filter((i:any) => i.status !== 'paid');
                                const nextInstallment = pendingInstallments.sort((a:any, b:any) => a.dueDate - b.dueDate)[0];
                                return (
                                    <div 
                                        key={credit.id} 
                                        onClick={() => setShowCreditsModal(true)}
                                        className={`p-4 rounded-2xl border transition-all cursor-pointer hover:border-slate-300 shadow-xs ${
                                            credit.status === 'defaulted' ? 'bg-red-50 border-red-200' :
                                            credit.status === 'completed' ? 'bg-emerald-50 border-emerald-200' :
                                            'bg-white border-slate-200'
                                        }`}
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <div>
                                                <h4 className="font-black text-[#0F172A] leading-tight">{credit.restaurantName}</h4>
                                                <p className="text-[10px] tracking-wider uppercase font-bold text-slate-500 mt-0.5">
                                                    {credit.status === 'completed' ? 'Pagado' : credit.status === 'defaulted' ? 'Cuotas Vencidas' : 'Activo'}
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-sm font-black text-[#0F172A]">$${credit.totalAmount.toFixed(2)}</p>
                                                <p className="flex items-center gap-1 text-[10px] font-bold text-slate-500 justify-end">
                                                    <span>{credit.installments.length - pendingInstallments.length}/{credit.installments.length}</span>
                                                    Cuotas
                                                </p>
                                            </div>
                                        </div>
                                        {credit.status !== 'completed' && nextInstallment && (
                                            <div className={`mt-3 pt-3 border-t flex items-center justify-between ${credit.status === 'defaulted' ? 'border-red-200' : 'border-slate-100'}`}>
                                                <div className="flex items-center gap-2">
                                                    <Clock className={`w-4 h-4 ${credit.status === 'defaulted' ? 'text-red-500' : 'text-slate-600'}`} />
                                                    <span className="text-xs font-bold text-slate-600">Próximo pago: {new Date(nextInstallment.dueDate).toLocaleDateString('es-VE')}</span>
                                                </div>
                                                <span className={`text-sm font-black ${credit.status === 'defaulted' ? 'text-red-600' : 'text-indigo-600'}`}>
                                                    $${nextInstallment.amount.toFixed(2)}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Puntos en Restaurantes */}
                {userData?.restaurantPoints && Object.keys(userData.restaurantPoints).length > 0 && (
                    <div className="px-4 mt-4 space-y-2.5">
                        <h3 className="text-base font-black text-[#0F172A] px-1 flex items-center gap-2">
                            <Award className="w-5 h-5 text-amber-500" />
                            Puntos en Restaurantes
                        </h3>
                        <div className="grid grid-cols-2 gap-2.5">
                            {Object.entries(userData.restaurantPoints).map(([restId, pts]) => (
                                <RestaurantPointCard key={restId} restId={restId} points={pts as number} />
                            ))}
                        </div>
                    </div>
                )}

                {/* Mis Direcciones */}
                {userData?.addresses && userData.addresses.length > 0 && (
                    <div className="px-4 mt-4 space-y-2.5">
                        <h3 className="text-base font-black text-[#0F172A] px-1 flex items-center gap-2">
                            <MapPin className="w-5 h-5 text-[#0F172A]" />
                            Mis Direcciones
                        </h3>
                        <div className="grid gap-2.5">
                            {userData.addresses.map(addr => (
                                <div key={addr.id} className="p-3.5 rounded-2xl border border-slate-200 bg-white transition-colors shadow-xs">
                                    <div className="flex justify-between items-start mb-1.5">
                                        <div className="flex items-center gap-2">
                                            <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${addr.isDefault ? 'bg-[#FFD100] text-[#0F172A]' : 'bg-slate-100 text-slate-700'}`}>
                                                {addr.name}
                                            </span>
                                            {addr.isDefault && (
                                                <span className="text-[10px] uppercase font-black text-[#0F172A] tracking-wider">Predeterminada</span>
                                            )}
                                        </div>
                                        <div className="flex gap-2">
                                            {!addr.isDefault && (
                                                <button onClick={() => handleSetDefaultAddress(addr.id)} className="text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors">
                                                    Fijar
                                                </button>
                                            )}
                                            <button onClick={() => handleDeleteAddress(addr.id)} className="text-xs font-bold text-red-500 hover:text-red-600 transition-colors">
                                                Eliminar
                                            </button>
                                        </div>
                                    </div>
                                    <p className="text-xs font-bold text-slate-800 leading-tight">{addr.reference}</p>
                                    <p className="text-[10px] text-slate-400 font-medium mt-1">GPS: {addr.lat.toFixed(4)}, {addr.lng.toFixed(4)}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Lugares Calificados */}
                {activities.some(a => a.type === 'order' && a.hasReviewed) && (
                    <div className="px-4 mt-4 space-y-2.5">
                        <h3 className="text-base font-black text-[#0F172A] px-1 flex items-center gap-2">
                            <Star className="w-5 h-5 text-amber-500 fill-amber-500" />
                            Lugares Calificados
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            {activities
                                .filter(activity => activity.type === 'order' && activity.hasReviewed)
                                .map(activity => (
                                    <div key={`rated-${activity.id}`} className="bg-white border border-slate-200 p-3.5 rounded-2xl flex flex-col gap-1.5 shadow-xs">
                                        <div className="flex justify-between items-start">
                                            <div className="flex items-center gap-2">
                                                <div className="p-1.5 bg-emerald-100 rounded-lg text-emerald-700">
                                                    <CheckCircle className="w-4 h-4" />
                                                </div>
                                                <div>
                                                    <p className="font-bold text-[#0F172A] text-sm truncate">
                                                        {activity.restaurantName || 'Negocio Local'}
                                                    </p>
                                                    <p className="text-[10px] text-slate-400 font-medium">Calificado satisfactoriamente</p>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="h-px bg-slate-100 my-0.5"></div>
                                        <div className="text-[10px] text-slate-500 flex items-center gap-1.5">
                                            <span className="font-bold text-slate-400">PRODUCTOS:</span>
                                            <span className="line-clamp-1 italic">{activity.items?.map(i => i.name).join(', ')}</span>
                                        </div>
                                    </div>
                                ))
                            }
                        </div>
                    </div>
                )}

                {/* 4. HISTORIAL DE ACTIVIDAD MINIMALISTA, ALINEADO Y 100% EN ESPAÑOL */}
                <div ref={ordersRef} className="mt-5">
                    {/* Cabecera de sección compacta */}
                    <div className="px-4 mb-2.5 flex items-center justify-between">
                        <h3 className="text-base font-black text-[#0F172A]">
                            Historial de Actividad
                        </h3>
                        <span className="bg-slate-100 text-[#0F172A] text-xs font-bold px-3 py-1 rounded-full">
                            {activities.length} total
                        </span>
                    </div>

                    {/* Pestañas de filtro con scroll horizontal limpio */}
                    <div className="flex gap-2 overflow-x-auto no-scrollbar px-4 pb-2">
                        {[
                            { id: 'all', label: 'Todos', count: activities.length },
                            { 
                                id: 'transport', 
                                label: 'Viajes', 
                                count: activities.filter(a => {
                                    const cat = a.service_category || (a as any).serviceCategory || (a as any).vehicle_type || a.vehicleType;
                                    return a.type === 'transport' && (cat === 'taxi' || cat === 'confort' || cat === 'mototaxi' || cat === 'moto' || !cat);
                                }).length 
                            },
                            { 
                                id: 'mandado', 
                                label: 'Mandados', 
                                count: activities.filter(a => {
                                    const cat = a.service_category || (a as any).serviceCategory;
                                    return a.type === 'transport' && (cat === 'mandado' || cat === 'muchacho_mandado' || cat === 'encomienda');
                                }).length 
                            },
                            { 
                                id: 'order', 
                                label: 'Compras', 
                                count: activities.filter(a => a.type === 'order').length 
                            }
                        ].map(tab => (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => setHistoryFilter(tab.id as any)}
                                className={`px-3.5 py-1.5 rounded-full text-xs font-bold shrink-0 transition-all flex items-center gap-1.5 ${
                                    historyFilter === tab.id
                                        ? 'bg-[#0F172A] text-[#FFD100] shadow-sm'
                                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                }`}
                            >
                                <span>{tab.label}</span>
                                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                                    historyFilter === tab.id ? 'bg-white/20 text-[#FFD100]' : 'bg-slate-200 text-slate-600'
                                }`}>
                                    {tab.count}
                                </span>
                            </button>
                        ))}
                    </div>

                    {/* Tarjetas del Historial */}
                    <div className="px-4 space-y-2.5">
                        {loadingActivities ? (
                            <div className="flex justify-center py-8">
                                <div className="w-7 h-7 border-3 border-[#FFD100] border-t-transparent rounded-full animate-spin"></div>
                            </div>
                        ) : activities.length > 0 ? (
                            (() => {
                                const filtered = activities.filter(activity => {
                                    if (historyFilter === 'all') return true;
                                    if (historyFilter === 'transport') {
                                        const cat = activity.service_category || (activity as any).serviceCategory || (activity as any).vehicle_type || activity.vehicleType;
                                        return activity.type === 'transport' && (cat === 'taxi' || cat === 'confort' || cat === 'mototaxi' || cat === 'moto' || !cat);
                                    }
                                    if (historyFilter === 'mandado') {
                                        const cat = activity.service_category || (activity as any).serviceCategory;
                                        return activity.type === 'transport' && (cat === 'mandado' || cat === 'muchacho_mandado' || cat === 'encomienda');
                                    }
                                    if (historyFilter === 'order') {
                                        return activity.type === 'order';
                                    }
                                    return true;
                                });

                                if (filtered.length === 0) {
                                    return (
                                        <div className="bg-white border border-slate-200 p-6 rounded-2xl text-center flex flex-col items-center justify-center shadow-xs">
                                            <ShoppingBag className="w-8 h-8 text-slate-300 mb-2" />
                                            <p className="text-sm font-bold text-slate-700">No hay registros en esta categoría</p>
                                        </div>
                                    );
                                }

                                const itemsToRender = showAllActivities ? filtered : filtered.slice(0, 2);

                                return (
                                    <div className="space-y-2.5">
                                        {itemsToRender.map(activity => {
                                            const meta = getActivityCategoryMeta(activity);
                                            const actDate = activity.created_at ? new Date(activity.created_at) : (activity.createdAt?.toDate ? activity.createdAt.toDate() : (activity.createdAt ? new Date(activity.createdAt) : null));
                                            const isTransport = activity.type === 'transport';
                                            const isOrder = activity.type === 'order';
                                            const isRecharge = activity.type === 'wallet_recharge';
                                            const amountUsd = isRecharge ? (activity.amount || 0) : isTransport ? (parseFloat((activity as any).price || activity.fare || 0)) : (parseFloat(activity.total || 0) + parseFloat((activity as any).deliveryFee || (activity as any).delivery_fee || 0));
                                            const amountBs = bcvRate > 0 ? (amountUsd * bcvRate).toFixed(2) : null;

                                            return (
                                                <div 
                                                    key={activity.id} 
                                                    onClick={() => setSelectedDetailActivity(activity)}
                                                    className="bg-white border border-slate-200 rounded-2xl p-3.5 flex items-center justify-between gap-3 shadow-xs hover:border-slate-300 transition-all cursor-pointer active:scale-[0.99]"
                                                >
                                                    {/* Izquierda: Icono/Logo + Nombre + ID y fecha */}
                                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                                        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 text-lg">
                                                            {meta.emoji}
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <p className="font-extrabold text-sm text-[#0F172A] truncate">
                                                                {isTransport 
                                                                    ? ((activity as any).destination_address || activity.destination?.address || 'Viaje Un 2x3')
                                                                    : isOrder 
                                                                    ? (activity.restaurantName || (activity as any).restaurant_name || 'Pedido en Tienda')
                                                                    : 'Recarga de Saldo'}
                                                            </p>
                                                            <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                                                                <span className="font-mono font-bold">#{activity.id.slice(-5).toUpperCase()}</span>
                                                                <span> • </span>
                                                                <span>{actDate ? `${actDate.toLocaleDateString('es-VE')} ${actDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Reciente'}</span>
                                                            </p>
                                                        </div>
                                                    </div>

                                                    {/* Derecha: Monto USD + Monto Bs + Badge de Estado traducido */}
                                                    <div className="text-right shrink-0 flex flex-col items-end gap-1">
                                                        <p className="font-black text-sm text-[#0F172A]">
                                                            $${amountUsd.toFixed(2)}
                                                        </p>
                                                        {amountBs && (
                                                            <p className="text-[11px] text-slate-500 font-semibold">
                                                                {amountBs} Bs
                                                            </p>
                                                        )}
                                                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${getStatusBadgeClass(activity.status)}`}>
                                                            {getStatusLabel(activity.status, activity.type)}
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })}

                                        {filtered.length > 2 && (
                                            <button
                                                type="button"
                                                onClick={() => setShowAllActivities(!showAllActivities)}
                                                className="w-full py-3 bg-white border border-slate-200 hover:bg-slate-50 text-[#0F172A] font-black text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors active:scale-98 shadow-xs"
                                            >
                                                <span>{showAllActivities ? 'Mostrar menos' : `Ver todos (${filtered.length})`}</span>
                                                <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${showAllActivities ? 'rotate-180' : ''}`} />
                                            </button>
                                        )}
                                    </div>
                                );
                            })()
                        ) : (
                            <div className="bg-white border border-slate-200 p-6 rounded-2xl text-center flex flex-col items-center justify-center shadow-xs">
                                <ShoppingBag className="w-8 h-8 text-slate-300 mb-2" />
                                <p className="text-sm font-bold text-slate-700">Aún no tienes actividad</p>
                                <p className="text-xs text-slate-400 mt-1">¡Explora la app para hacer tu primer pedido o viaje!</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* 5. AJUSTES */}
                <div className="px-4 mt-6 space-y-2.5">
                    <h3 className="text-base font-black text-[#0F172A] px-1">Ajustes</h3>
                    <div className="space-y-2">
                        {/* Notificaciones */}
                        <div
                            onClick={handleToggleNotifications}
                            className={`w-full flex items-center justify-between p-4 bg-white border border-slate-200 rounded-2xl transition-all cursor-pointer hover:border-slate-300 shadow-xs ${updatingNotifications ? 'opacity-70 pointer-events-none' : ''}`}
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center shrink-0">
                                    <Bell className="w-5 h-5 text-[#0F172A]" />
                                </div>
                                <div className="flex flex-col">
                                    <span className="font-bold text-sm text-[#0F172A]">Notificaciones</span>
                                    <span className="text-[10px] text-slate-500 font-medium">Recibe promos y actualizaciones</span>
                                </div>
                            </div>
                            <div
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${userData?.notificationsEnabled !== false && userData?.notifications_enabled !== false && localStorage.getItem('notifications_enabled') !== 'false' ? 'bg-[#0F172A]' : 'bg-slate-300'
                                    }`}
                            >
                                {updatingNotifications ? (
                                    <div className="ml-1 w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                ) : (
                                    <span
                                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${userData?.notificationsEnabled !== false && userData?.notifications_enabled !== false && localStorage.getItem('notifications_enabled') !== 'false' ? 'translate-x-6' : 'translate-x-1'
                                            }`}
                                    />
                                )}
                            </div>
                        </div>

                        {/* Bloqueo Biométrico */}
                        <div
                            onClick={async () => {
                                const uid = user?.id || (user as any)?.uid;
                                if (!uid) return;
                                const isCurrentlyEnabled = Boolean(userData?.biometricLockEnabled || userData?.biometric_lock_enabled || localStorage.getItem('biometric_lock_enabled') === 'true');
                                if (isCurrentlyEnabled) {
                                    setWarningModalConfig({
                                        title: "¿Desactivar Bloqueo Biométrico?",
                                        description: "Tu cuenta ya no te solicitará huella o Face ID al abrir la aplicación.",
                                        onConfirm: async () => {
                                            setUpdatingBiometrics(true);
                                            try {
                                                localStorage.removeItem('biometric_lock_enabled');
                                                await supabase.from('profiles').update({
                                                    biometric_lock_enabled: false,
                                                    biometric_credential_id: null,
                                                    updated_at: new Date().toISOString()
                                                }).eq('id', uid);
                                                setUserData((prev) => prev ? {
                                                    ...prev,
                                                    biometricLockEnabled: false,
                                                    biometric_lock_enabled: false
                                                } : prev);
                                                sessionStorage.removeItem('deliexpress_is_unlocked');
                                                setIsUnlocked(true);
                                                toast.success('Bloqueo biométrico desactivado');
                                            } catch (err: any) {
                                                console.error("Error setting up biometrics:", err);
                                                toast.error(err.message || 'Error al configurar biometría');
                                            } finally {
                                                setUpdatingBiometrics(false);
                                            }
                                        }
                                    });
                                    return;
                                }

                                setUpdatingBiometrics(true);
                                try {
                                    const email = user?.email || userData?.email || '';
                                    const biometricData = await registerBiometric(uid, email);
                                    if (biometricData) {
                                        localStorage.setItem('biometric_lock_enabled', 'true');
                                        await supabase.from('profiles').update({
                                            biometric_lock_enabled: true,
                                            biometric_credential_id: biometricData.id,
                                            updated_at: new Date().toISOString()
                                        }).eq('id', uid);
                                        setUserData((prev) => prev ? {
                                            ...prev,
                                            biometricLockEnabled: true,
                                            biometric_lock_enabled: true,
                                            biometricCredentialId: biometricData.id,
                                            biometric_credential_id: biometricData.id
                                        } : prev);
                                        sessionStorage.removeItem('deliexpress_is_unlocked');
                                        setIsUnlocked(true);
                                        toast.success('Bloqueo biométrico activado');
                                    } else {
                                        toast.error('No se pudo activar la biometría');
                                    }
                                } catch (err: any) {
                                    console.error("Error setting up biometrics:", err);
                                    toast.error(err.message || 'Error al configurar biometría');
                                } finally {
                                    setUpdatingBiometrics(false);
                                }
                            }}
                            className={`w-full flex items-center justify-between p-4 bg-white border border-slate-200 rounded-2xl transition-all cursor-pointer hover:border-slate-300 shadow-xs ${updatingBiometrics ? 'opacity-70 pointer-events-none' : ''}`}
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center shrink-0">
                                    <Fingerprint className={`w-5 h-5 transition-colors duration-300 ${Boolean(userData?.biometricLockEnabled || userData?.biometric_lock_enabled || localStorage.getItem('biometric_lock_enabled') === 'true') ? 'text-emerald-600' : 'text-[#0F172A]'}`} />
                                </div>
                                <div className="flex flex-col">
                                    <span className="font-bold text-sm text-[#0F172A]">Bloqueo Biométrico</span>
                                    <span className="text-[10px] text-slate-500 font-medium">Protege tu cuenta con huella o rostro</span>
                                </div>
                            </div>
                            <div
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-300 focus:outline-none ${Boolean(userData?.biometricLockEnabled || userData?.biometric_lock_enabled || localStorage.getItem('biometric_lock_enabled') === 'true') ? 'bg-[#0F172A]' : 'bg-slate-300'
                                    }`}
                            >
                                {updatingBiometrics ? (
                                    <div className="ml-1 w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                ) : (
                                    <span
                                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-300 shadow-sm ${Boolean(userData?.biometricLockEnabled || userData?.biometric_lock_enabled || localStorage.getItem('biometric_lock_enabled') === 'true') ? 'translate-x-6' : 'translate-x-1'
                                            }`}
                                    />
                                )}
                            </div>
                        </div>

                        {/* Ubicación en Línea */}
                        <div
                            onClick={async () => {
                                const uid = user?.id || (user as any)?.uid;
                                if (!uid) return;
                                const isCurrentlyAllowed = Boolean(userData?.location_permissions_allowed !== false && userData?.locationPermissionsAllowed !== false && localStorage.getItem('locationPermissionsAllowed') !== 'false');
                                if (isCurrentlyAllowed) {
                                    setWarningModalConfig({
                                        title: "¿Desactivar Ubicación en Línea?",
                                        description: "Para garantizar el funcionamiento de los pedidos, la seguridad de tu cuenta y el rastreo de rutas, es necesario que mantengas estas opciones activadas.",
                                        onConfirm: async () => {
                                            setUpdatingLocation(true);
                                            try {
                                                await supabase.from('profiles').update({
                                                    location_permissions_allowed: false,
                                                    updated_at: new Date().toISOString()
                                                }).eq('id', uid);
                                                setUserData((prev: any) => ({ ...prev, location_permissions_allowed: false, locationPermissionsAllowed: false }));
                                                localStorage.setItem('locationPermissionsAllowed', 'false');
                                                await refreshUserData();
                                                toast.success('Ubicación en tiempo real desactivada');
                                            } catch (err: any) {
                                                console.error('Error toggling location permission:', err);
                                                toast.error(err?.message || 'Error al desactivar ubicación');
                                            } finally {
                                                setUpdatingLocation(false);
                                            }
                                        }
                                    });
                                    return;
                                }

                                setUpdatingLocation(true);
                                try {
                                    let granted = false;
                                    let userCoords: { lat: number; lng: number } | null = null;

                                    if (Capacitor.isNativePlatform()) {
                                        try {
                                            const permission = await Geolocation.requestPermissions();
                                            granted = permission.location === 'granted';
                                            if (granted) {
                                                const pos = await Geolocation.getCurrentPosition();
                                                userCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                                            }
                                        } catch (capErr) {
                                            console.warn('Capacitor geolocation permission error:', capErr);
                                        }
                                    } else {
                                        if (!navigator.geolocation) {
                                            toast.error('Tu navegador no soporta geolocalización');
                                            return;
                                        }
                                        userCoords = await new Promise<{ lat: number; lng: number } | null>((resolve) => {
                                            navigator.geolocation.getCurrentPosition(
                                                (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                                                (geoErr) => {
                                                    console.warn('High accuracy geolocation failed, trying standard accuracy:', geoErr);
                                                    navigator.geolocation.getCurrentPosition(
                                                        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                                                        (fallbackErr) => {
                                                            console.warn('Fallback geolocation failed:', fallbackErr);
                                                            const savedLat = localStorage.getItem('userLat');
                                                            const savedLng = localStorage.getItem('userLng');
                                                            if (savedLat && savedLng) {
                                                                resolve({ lat: parseFloat(savedLat), lng: parseFloat(savedLng) });
                                                            } else {
                                                                resolve(null);
                                                            }
                                                        },
                                                        { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
                                                    );
                                                },
                                                { enableHighAccuracy: true, timeout: 6000, maximumAge: 60000 }
                                            );
                                        });
                                        granted = !!userCoords;
                                    }

                                    if (granted) {
                                        const payload: any = {
                                            location_permissions_allowed: true,
                                            updated_at: new Date().toISOString()
                                        };
                                        if (userCoords) {
                                            payload.coords = userCoords;
                                            localStorage.setItem('userLat', userCoords.lat.toString());
                                            localStorage.setItem('userLng', userCoords.lng.toString());
                                        }
                                        await supabase.from('profiles').update(payload).eq('id', uid);
                                        setUserData((prev: any) => ({ 
                                            ...prev, 
                                            location_permissions_allowed: true, 
                                            locationPermissionsAllowed: true,
                                            coords: userCoords || prev?.coords 
                                        }));
                                        localStorage.setItem('locationPermissionsAllowed', 'true');
                                        await refreshUserData();
                                        toast.success('Ubicación en tiempo real activada');
                                    } else {
                                        toast.error('Se requiere permiso de ubicación para activar esta función');
                                    }
                                } catch (err: any) {
                                    console.error('Error toggling location permission:', err);
                                    toast.error(err?.message || 'Error al configurar ubicación');
                                } finally {
                                    setUpdatingLocation(false);
                                }
                            }}
                            className={`w-full flex items-center justify-between p-4 bg-white border border-slate-200 rounded-2xl transition-all cursor-pointer hover:border-slate-300 shadow-xs ${updatingLocation ? 'opacity-70 pointer-events-none' : ''}`}
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center shrink-0">
                                    <Navigation className="w-5 h-5 text-[#0F172A]" />
                                </div>
                                <div className="flex flex-col">
                                    <span className="font-bold text-sm text-[#0F172A]">Ubicación en Línea</span>
                                    <span className="text-[10px] text-slate-500 font-medium">Permite usar todas las funciones de la app</span>
                                </div>
                            </div>
                            <div
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${userData?.location_permissions_allowed !== false && userData?.locationPermissionsAllowed !== false && localStorage.getItem('locationPermissionsAllowed') !== 'false' ? 'bg-[#0F172A]' : 'bg-slate-300'
                                    }`}
                            >
                                {updatingLocation ? (
                                    <div className="ml-1 w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                ) : (
                                    <span
                                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${userData?.location_permissions_allowed !== false && userData?.locationPermissionsAllowed !== false && localStorage.getItem('locationPermissionsAllowed') !== 'false' ? 'translate-x-6' : 'translate-x-1'
                                            }`}
                                    />
                                )}
                            </div>
                        </div>

                        {/* Soporte Técnico */}
                        <div 
                            onClick={() => setShowSupportModal(true)}
                            className="w-full flex items-center justify-between p-4 bg-white border border-slate-200 rounded-2xl transition-all cursor-pointer hover:border-slate-300 shadow-xs"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center shrink-0">
                                    <MessageSquareWarning className="w-5 h-5 text-red-600" />
                                </div>
                                <div className="flex flex-col">
                                    <span className="font-bold text-sm text-[#0F172A]">Reportar una Falla</span>
                                    <span className="text-[10px] text-slate-500 font-medium">¿Problemas con la app? Ayúdanos a mejorar</span>
                                </div>
                            </div>
                            <ChevronRight className="w-5 h-5 text-slate-400" />
                        </div>

                        {/* FAQs */}
                        <div className="pt-2">
                            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1 mb-2">Preguntas Frecuentes (FAQ)</h4>
                            <div className="space-y-2">
                                {FAQ_DATA.map((faq, index) => (
                                    <div
                                        key={index}
                                        className="bg-white rounded-2xl overflow-hidden border border-slate-200 shadow-xs transition-all"
                                    >
                                        <button
                                            type="button"
                                            onClick={() => setActiveFaq(activeFaq === index ? null : index)}
                                            className="w-full flex items-center justify-between p-3.5 text-left hover:bg-slate-50 transition-colors"
                                        >
                                            <span className="text-xs font-extrabold text-[#0F172A] leading-tight pr-4">{faq.q}</span>
                                            <motion.div
                                                animate={{ rotate: activeFaq === index ? 180 : 0 }}
                                                transition={{ duration: 0.2 }}
                                            >
                                                <ChevronRight className={`w-4 h-4 ${activeFaq === index ? 'text-[#0F172A]' : 'text-slate-400'}`} />
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
                                                    <div className="px-3.5 pb-3.5 pt-0 border-t border-slate-100">
                                                        <p className="text-xs text-slate-600 font-medium leading-relaxed whitespace-pre-line mt-2">
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

                        {/* Cerrar Sesión */}
                        <button
                            type="button"
                            onClick={handleLogout}
                            className="w-full flex items-center justify-between p-4 bg-white border border-red-200 hover:bg-red-50 text-red-600 rounded-2xl transition-all cursor-pointer group active:scale-98 shadow-xs mt-3"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center shrink-0">
                                    <LogOut className="w-5 h-5 text-red-600" />
                                </div>
                                <span className="font-extrabold text-sm">Cerrar Sesión</span>
                            </div>
                            <ChevronRight className="w-5 h-5 text-red-400 group-hover:translate-x-0.5 transition-transform" />
                        </button>

                        <div className="mt-4 flex items-center justify-center gap-4 text-xs font-semibold">
                            <button
                                type="button"
                                onClick={() => setShowPrivacyPolicyModal(true)}
                                className="text-slate-400 hover:text-slate-600 underline transition-colors cursor-pointer"
                            >
                                Términos y Privacidad
                            </button>
                            <span className="text-slate-300">•</span>
                            <button
                                type="button"
                                onClick={() => {
                                    vibrate(30);
                                    setDeleteConfirmText('');
                                    setShowDeleteAccountModal(true);
                                }}
                                className="text-rose-400 hover:text-rose-600 underline transition-colors cursor-pointer"
                            >
                                Eliminar mi cuenta
                            </button>
                        </div>
                    </div>
                </div>

                {/* Footer Logo */}
                <div 
                    className="mt-8 text-center p-6 grayscale opacity-60 cursor-pointer active:scale-95 transition-transform"
                    onClick={() => {
                        vibrate(20);
                        toast('Un 2x3 - ¡Tu app favorita!', { icon: '🛵', style: { borderRadius: '15px', background: '#333', color: '#fff' } });
                    }}
                >
                    <img src={branding.app_client_logo || UN2X3_LOGO} alt={branding.app_client_name || 'Un 2x3'} className="h-10 mx-auto mb-2" />
                    <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400">{branding.client_footer_text || clientFooterText}</p>
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

                                await supabase.from('profiles').update({
                                    addresses: [...currentAddresses, newAddress],
                                    updated_at: new Date().toISOString()
                                }).eq('id', user.id || user.uid);
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

                                        {profileError && (
                                            <div className="p-4 bg-red-50 border border-red-200 text-red-600 rounded-2xl text-xs font-semibold flex items-center gap-3">
                                                <AlertCircle className="w-5 h-5 shrink-0 text-red-500" />
                                                <span>{profileError}</span>
                                            </div>
                                        )}

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
                                            <div className="flex rounded-2xl overflow-hidden border border-slate-100 bg-slate-50 focus-within:bg-white focus-within:border-primary transition-all">
                                                <div className="px-3.5 py-4 bg-slate-200/70 border-r border-slate-200 text-slate-700 font-black text-sm flex items-center gap-1.5 select-none shrink-0">
                                                    <span>🇻🇪</span>
                                                    <span>+58</span>
                                                </div>
                                                <input
                                                    type="tel"
                                                    required
                                                    maxLength={10}
                                                    value={profileForm.phone}
                                                    onChange={(e) => {
                                                        let val = e.target.value.replace(/\D/g, '');
                                                        if (val.startsWith('0')) val = val.substring(1);
                                                        if (val.length <= 10) {
                                                            setProfileForm({ ...profileForm, phone: val });
                                                        }
                                                    }}
                                                    className="w-full bg-transparent p-4 outline-none font-bold text-slate-700 placeholder:text-slate-400 placeholder:font-normal"
                                                    placeholder="412 1234567"
                                                />
                                            </div>
                                            <p className="text-[9px] text-slate-400 font-bold ml-2">10 dígitos sin el cero inicial</p>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Cédula de Identidad</label>
                                            <div className="flex rounded-2xl overflow-hidden border border-slate-100 bg-slate-50 focus-within:bg-white focus-within:border-primary transition-all">
                                                <div className="flex bg-slate-200/70 p-1 border-r border-slate-200 shrink-0">
                                                    <button
                                                        type="button"
                                                        onClick={() => setProfileForm({ ...profileForm, nationality: 'V' })}
                                                        className={`px-3 py-2 rounded-xl text-xs font-black transition-all ${
                                                            profileForm.nationality === 'V' ? 'bg-primary text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                                                        }`}
                                                    >
                                                        V
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setProfileForm({ ...profileForm, nationality: 'E' })}
                                                        className={`px-3 py-2 rounded-xl text-xs font-black transition-all ${
                                                            profileForm.nationality === 'E' ? 'bg-primary text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                                                        }`}
                                                    >
                                                        E
                                                    </button>
                                                </div>
                                                <input
                                                    type="text"
                                                    required
                                                    maxLength={9}
                                                    value={profileForm.cedulaNumber}
                                                    onChange={(e) => {
                                                        const val = e.target.value.replace(/\D/g, '');
                                                        if (val.length <= 9) {
                                                            setProfileForm({ ...profileForm, cedulaNumber: val });
                                                        }
                                                    }}
                                                    className="w-full bg-transparent p-4 outline-none font-bold text-slate-700 placeholder:text-slate-400 placeholder:font-normal"
                                                    placeholder="12345678"
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4 flex items-center gap-1.5">
                                                <Calendar className="w-3.5 h-3.5 text-primary" /> Fecha de Cumpleaños 🎂
                                            </label>
                                            <input
                                                type="date"
                                                required
                                                value={profileForm.birthdate}
                                                max={new Date().toISOString().split('T')[0]}
                                                onChange={(e) => setProfileForm({ ...profileForm, birthdate: e.target.value })}
                                                className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 font-bold text-slate-700 focus:bg-white focus:border-primary transition-all outline-none cursor-pointer"
                                            />
                                            <p className="text-[9px] text-slate-400 font-bold ml-2">Para promociones especiales en tu día</p>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Género (Para personalización)</label>
                                            <div className="flex gap-4 p-1 bg-slate-100 rounded-2xl">
                                                <button
                                                    type="button"
                                                    onClick={() => setProfileForm({ ...profileForm, gender: 'masculine' })}
                                                    className={`flex-1 py-3 rounded-xl font-bold text-xs transition-all ${profileForm.gender === 'masculine' ? 'bg-white text-primary shadow-sm' : 'text-slate-500'}`}
                                                >
                                                    MASCULINO
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setProfileForm({ ...profileForm, gender: 'feminine' })}
                                                    className={`flex-1 py-3 rounded-xl font-bold text-xs transition-all ${profileForm.gender === 'feminine' ? 'bg-white text-primary shadow-sm' : 'text-slate-500'}`}
                                                >
                                                    FEMENINO
                                                </button>
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

                                <div className="mt-10 pt-6 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
                                    <button
                                        type="button"
                                        onClick={() => { vibrate(30); setDeleteConfirmText(''); setShowDeleteAccountModal(true); }}
                                        className="w-full sm:w-auto py-3.5 px-5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200/80 rounded-2xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 active:scale-95 transition-all"
                                    >
                                        <Trash2 className="w-4 h-4 text-rose-500" />
                                        Eliminar Cuenta
                                    </button>

                                    <div className="flex gap-3 w-full sm:w-auto flex-1 sm:justify-end">
                                        <button
                                            type="button"
                                            onClick={() => setShowEditProfileModal(false)}
                                            className="flex-1 sm:flex-initial px-6 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-all shadow-sm active:scale-95"
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={completingProfile}
                                            className="flex-[2] sm:flex-initial px-8 py-4 bg-primary text-slate-900 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-orange-600 transition-all shadow-xl shadow-orange-500/30 flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
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
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Delete Account Confirmation Modal */}
            <AnimatePresence>
                {showDeleteAccountModal && (
                    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md overflow-y-auto">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="bg-white rounded-[36px] w-full max-w-sm shadow-2xl p-7 text-center space-y-4 my-auto border border-rose-100"
                        >
                            <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-3xl flex items-center justify-center mx-auto shadow-lg shadow-rose-500/10">
                                <Trash2 className="w-8 h-8" />
                            </div>

                            <div>
                                <h3 className="text-xl font-black text-slate-900">¿Eliminar tu cuenta?</h3>
                                <p className="text-xs text-slate-500 font-medium mt-2 leading-relaxed">
                                    Esta acción es <span className="font-bold text-rose-600">permanente e irreversible</span>. Tu información de perfil, historial de pedidos y servicios de taxi se borrarán completamente de la base de datos.
                                </p>
                            </div>

                            <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200/60 text-left flex items-start gap-2.5">
                                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                                <p className="text-[11px] font-bold text-amber-800 leading-tight">
                                    No podrás recuperar tu cuenta ni volver a acceder con tus credenciales actuales.
                                </p>
                            </div>

                            <div className="space-y-1.5 text-left">
                                <label className="text-[11px] font-bold text-slate-600 block">
                                    Escribe <span className="text-rose-600 font-extrabold">ELIMINAR</span> para confirmar:
                                </label>
                                <input
                                    type="text"
                                    value={deleteConfirmText}
                                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                                    placeholder="ELIMINAR"
                                    className="w-full px-4 py-3 rounded-2xl border border-slate-200 text-sm font-bold text-slate-800 focus:outline-none focus:border-rose-500 uppercase tracking-wider text-center"
                                />
                            </div>

                            <p className="text-[11px] text-slate-400">
                                Consulta nuestra{' '}
                                <button
                                    type="button"
                                    onClick={() => setShowPrivacyPolicyModal(true)}
                                    className="text-primary underline font-bold"
                                >
                                    Política de Privacidad
                                </button>
                            </p>

                            <div className="space-y-2 pt-2">
                                <button
                                    type="button"
                                    disabled={isDeletingAccount || deleteConfirmText.trim().toUpperCase() !== 'ELIMINAR'}
                                    onClick={handleDeleteAccount}
                                    className="w-full py-4 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-rose-600/20 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                                >
                                    {isDeletingAccount ? (
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        <>
                                            <Trash2 className="w-4 h-4" /> Sí, Eliminar Definitivamente
                                        </>
                                    )}
                                </button>
                                <button
                                    type="button"
                                    disabled={isDeletingAccount}
                                    onClick={() => {
                                        setDeleteConfirmText('');
                                        setShowDeleteAccountModal(false);
                                    }}
                                    className="w-full py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl font-bold text-xs uppercase tracking-widest active:scale-95 transition-all"
                                >
                                    Cancelar
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Mis Puntos y Premios Catalog Modal */}
            <AnimatePresence>
                {showRewardsModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="bg-white rounded-[40px] w-full max-w-sm shadow-2xl overflow-hidden my-auto"
                        >
                            <div className="p-6 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
                                <div>
                                    <h3 className="text-xl font-black text-slate-900 flex items-center gap-2">
                                        <Award className="w-6 h-6 text-amber-500" /> Mis Puntos y Premios
                                    </h3>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Programa de Lealtad Un 2x3</p>
                                </div>
                                <button onClick={() => setShowRewardsModal(false)} className="p-2 hover:bg-slate-200 rounded-xl transition-all">
                                    <X className="w-6 h-6 text-slate-400" />
                                </button>
                            </div>

                            <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto hide-scrollbar">
                                {/* Virtual VIP Points Card */}
                                <div className="relative w-full aspect-[1.586/1] rounded-2xl overflow-hidden shadow-xl shadow-amber-500/10 group">
                                    <div className="absolute inset-0 bg-gradient-to-br from-amber-500 via-amber-600 to-yellow-600" />
                                    <div className="absolute inset-0 opacity-15 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.8)_0,transparent_100%)]" style={{ backgroundSize: '20px 20px' }} />

                                    <div className="absolute inset-0 flex flex-col justify-between p-6 z-10 text-white">
                                        <div className="flex justify-between items-start">
                                            <div className="w-10 h-10 bg-white/20 backdrop-blur-md rounded-xl p-1.5 flex items-center justify-center border border-white/30">
                                                <Award className="w-6 h-6 text-white" />
                                            </div>
                                            <span className="text-[10px] font-black uppercase tracking-widest bg-white/20 px-2 py-0.5 rounded-full border border-white/20">
                                                {Math.floor(userData?.points || 0) < 50
                                                    ? 'Nivel Bronce 🥉'
                                                    : Math.floor(userData?.points || 0) < 150
                                                    ? 'Nivel Plata 🥈'
                                                    : Math.floor(userData?.points || 0) < 500
                                                    ? 'Nivel Oro 🥇'
                                                    : 'Nivel Diamante 💎'}
                                            </span>
                                        </div>

                                        <div>
                                            <p className="text-white/80 text-[9px] font-black uppercase tracking-widest mb-0.5">Tus Puntos Acumulados</p>
                                            <div className="flex items-baseline gap-2">
                                                <span className="text-3xl font-black drop-shadow-md">
                                                    {Math.floor(userData?.points || 0).toLocaleString()}
                                                </span>
                                                <span className="text-xs font-black text-white/80">PUNTOS</span>
                                            </div>
                                            <p className="text-[10px] text-white/90 font-bold mt-1">
                                                $1 gastado = 1 punto acumulado
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Transparent Info Banner */}
                                <div className="bg-amber-50 border border-amber-200/80 p-4 rounded-2xl text-xs text-amber-900 leading-relaxed space-y-2">
                                    <p className="font-black text-xs flex items-center gap-1.5 text-amber-950">
                                        <Gift className="w-4 h-4 text-amber-600 shrink-0" />
                                        Tus puntos acumulan beneficios
                                    </p>
                                    <p className="text-[11px] text-amber-800 leading-relaxed">
                                        Pagas directo al conductor o comercio. Con cada compra y viaje acumulas puntos. ¡Próximamente sorpresas!
                                    </p>
                                </div>

                                <button
                                    onClick={() => {
                                        setShowRewardsModal(false);
                                        navigate('/rewards');
                                    }}
                                    className="w-full py-3.5 bg-primary hover:bg-amber-400 text-slate-900 font-black text-xs rounded-2xl shadow-lg shadow-primary/20 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
                                >
                                    <Sparkles className="w-4 h-4" />
                                    Ver Mis Puntos y Recompensas
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Interactive Activity Detail Modal */}
            {selectedDetailActivity && (
                <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl p-5 w-full max-w-md max-h-[90vh] overflow-y-auto space-y-4 shadow-2xl border border-slate-100 animate-slide-up">
                        {/* Modal Header */}
                        <div className="flex items-start justify-between">
                            <div className="flex items-center gap-2.5 min-w-0">
                                <span className="text-3xl p-2 bg-slate-100 rounded-2xl shrink-0">
                                    {getActivityCategoryMeta(selectedDetailActivity).emoji}
                                </span>
                                <div className="min-w-0">
                                    <h4 className="font-black text-slate-900 text-base truncate">
                                        {getActivityCategoryMeta(selectedDetailActivity).label}
                                    </h4>
                                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider inline-block mt-0.5 ${getStatusBadgeClass(selectedDetailActivity.status)}`}>
                                        {getStatusLabel(selectedDetailActivity.status, selectedDetailActivity.type)}
                                    </span>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSelectedDetailActivity(null)}
                                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-all active:scale-90 shrink-0"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Service & Route Details */}
                        <div className="bg-slate-50 rounded-2xl p-3.5 space-y-2.5 border border-slate-200/60 text-xs">
                            <div className="flex justify-between items-center text-slate-400 text-[11px] font-bold">
                                <span>ID de Servicio:</span>
                                <span className="font-mono text-slate-700">#{selectedDetailActivity.id}</span>
                            </div>
                            
                            {selectedDetailActivity.type === 'transport' && (
                                <>
                                    <div className="flex items-start gap-2 pt-1">
                                        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 mt-1 shrink-0"></div>
                                        <div>
                                            <span className="text-[10px] font-bold text-slate-400 uppercase">Origen / Salida:</span>
                                            <p className="font-bold text-slate-800 text-xs">
                                                {(selectedDetailActivity as any).origin_address || selectedDetailActivity.origin?.address || 'Ubicación de partida'}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-2 pt-1">
                                        <div className="w-2.5 h-2.5 rounded-full bg-rose-500 mt-1 shrink-0"></div>
                                        <div>
                                            <span className="text-[10px] font-bold text-slate-400 uppercase">Destino / Entrega:</span>
                                            <p className="font-bold text-slate-800 text-xs">
                                                {(selectedDetailActivity as any).destination_address || selectedDetailActivity.destination?.address || 'Ubicación de destino'}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Mandado Details if applicable */}
                                    {(selectedDetailActivity as any).mandado_details && (
                                        <div className="mt-2 p-2.5 bg-amber-50/80 rounded-xl border border-amber-200/70 text-slate-800 space-y-1">
                                            <span className="text-[10px] font-black uppercase text-amber-800">Detalles del Mandado:</span>
                                            <p className="font-medium text-xs">{(selectedDetailActivity as any).mandado_details.itemsDescription || (selectedDetailActivity as any).mandado_details.purchaseList}</p>
                                            {(selectedDetailActivity as any).mandado_details.passengerRouteDescription && (
                                                <div className="mt-1 pt-1 border-t border-amber-200 text-amber-900">
                                                    <span className="text-[10px] font-bold">Ruta del Pasajero: </span>
                                                    <span>{(selectedDetailActivity as any).mandado_details.passengerRouteDescription}</span>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </>
                            )}

                            {selectedDetailActivity.type === 'order' && (
                                <>
                                    <div className="pt-1">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase">Comercio / Tienda:</span>
                                        <p className="font-bold text-slate-800 text-sm">
                                            {selectedDetailActivity.restaurantName || (selectedDetailActivity as any).restaurant_name || 'Comercio Local'}
                                        </p>
                                    </div>
                                    {selectedDetailActivity.items && selectedDetailActivity.items.length > 0 && (
                                        <div className="space-y-1 pt-1 border-t border-slate-200">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase">Productos ({selectedDetailActivity.items.length}):</span>
                                            {selectedDetailActivity.items.map((item: any, idx: number) => (
                                                <div key={idx} className="flex justify-between text-xs text-slate-700 font-medium">
                                                    <span>{item.quantity || 1}x {item.name}</span>
                                                    <span className="font-bold">${((item.price || 0) * (item.quantity || 1)).toFixed(2)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        {/* Financial Breakdown in $ and Bs */}
                        <div className="bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-200/80 rounded-2xl p-4 space-y-2">
                            <div className="flex justify-between items-baseline">
                                <span className="text-xs font-bold text-slate-600">Total en Divisa ($):</span>
                                <span className="text-lg font-black text-slate-900">
                                    ${(selectedDetailActivity.type === 'transport'
                                        ? (parseFloat((selectedDetailActivity as any).price || selectedDetailActivity.fare || 0))
                                        : (parseFloat(selectedDetailActivity.total || 0) + parseFloat((selectedDetailActivity as any).deliveryFee || (selectedDetailActivity as any).delivery_fee || 0))
                                    ).toFixed(2)} USD
                                </span>
                            </div>
                            {bcvRate > 0 && (
                                <div className="flex justify-between items-baseline">
                                    <span className="text-xs font-bold text-slate-600">Total en Bolívares (Bs):</span>
                                    <span className="text-base font-black text-amber-900">
                                        {(
                                            (selectedDetailActivity.type === 'transport'
                                                ? (parseFloat((selectedDetailActivity as any).price || selectedDetailActivity.fare || 0))
                                                : (parseFloat(selectedDetailActivity.total || 0) + parseFloat((selectedDetailActivity as any).deliveryFee || (selectedDetailActivity as any).delivery_fee || 0))
                                            ) * bcvRate
                                        ).toFixed(2)} Bs
                                    </span>
                                </div>
                            )}
                            <div className="flex justify-between items-center text-[10px] text-slate-500 pt-1 border-t border-amber-200/60 font-medium">
                                <span>Método: {(selectedDetailActivity as any).payment_method || (selectedDetailActivity as any).paymentMethod || 'Pago Móvil / Efectivo'}</span>
                                {bcvRate > 0 && <span>Tasa BCV: {bcvRate.toFixed(2)} Bs/$</span>}
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="space-y-2 pt-1">
                            {selectedDetailActivity.type === 'transport' && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        const reqId = selectedDetailActivity.id;
                                        setSelectedDetailActivity(null);
                                        setActiveChatRequestId(reqId);
                                    }}
                                    className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white font-black text-xs rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm active:scale-98"
                                >
                                    <MessageSquareWarning className="w-4 h-4 text-amber-400" />
                                    <span>Ver Chat y Comprobantes (Respaldo 48h)</span>
                                </button>
                            )}

                            {/* Live Track if Active */}
                            {selectedDetailActivity.type === 'transport' && (selectedDetailActivity.status === 'in_progress' || selectedDetailActivity.status === 'accepted' || selectedDetailActivity.status === 'arriving' || selectedDetailActivity.status === 'finding_driver') && (
                                <button
                                    type="button"
                                    onClick={() => navigate(`/taxi/track/${selectedDetailActivity.id}`)}
                                    className="w-full py-3 px-4 bg-[#FFB800] hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm active:scale-98"
                                >
                                    <Navigation className="w-4 h-4" />
                                    <span>Rastrear Viaje en Vivo</span>
                                </button>
                            )}

                            {/* Support Ticket trigger */}
                            <button
                                type="button"
                                onClick={() => {
                                    const sId = selectedDetailActivity.id;
                                    setTicketForm({
                                        title: `Problema con servicio #${sId.slice(-6).toUpperCase()}`,
                                        description: `Hola soporte, necesito asistencia con mi ${getActivityCategoryMeta(selectedDetailActivity).label} (ID: ${sId}) de fecha ${new Date(selectedDetailActivity.created_at || Date.now()).toLocaleDateString()}. Motivo: `
                                    });
                                    setSelectedDetailActivity(null);
                                    setShowNewTicketModal(true);
                                }}
                                className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all active:scale-98"
                            >
                                <AlertCircle className="w-4 h-4 text-rose-500" />
                                <span>Reportar Problema / Ayuda con este Servicio</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal for viewing RideChat history from profile */}
            {activeChatRequestId && (
                <div className="fixed inset-0 z-[100] bg-slate-950/70 backdrop-blur-sm flex flex-col justify-end">
                    <div className="h-[80vh] w-full bg-white rounded-t-3xl overflow-hidden shadow-2xl">
                        <RideChat
                            requestId={activeChatRequestId}
                            onClose={() => setActiveChatRequestId(null)}
                            readOnly={true}
                        />
                    </div>
                </div>
            )}

            {/* Modal de Advertencia al intentar desactivar ajustes críticos */}
            {warningModalConfig && (
                <div className="fixed inset-0 z-[120] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-slate-100 flex flex-col items-center text-center">
                        <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mb-4">
                            <AlertTriangle className="w-8 h-8 text-amber-600" />
                        </div>
                        <h4 className="text-lg font-black text-slate-900 mb-2">
                            {warningModalConfig.title}
                        </h4>
                        <p className="text-xs text-slate-600 font-medium leading-relaxed mb-6">
                            {warningModalConfig.description}
                        </p>
                        <div className="w-full flex flex-col gap-2">
                            <button
                                type="button"
                                onClick={() => setWarningModalConfig(null)}
                                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm rounded-2xl shadow-lg shadow-emerald-600/20 active:scale-95 transition-all"
                            >
                                Entendido, Mantener Activado
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    const action = warningModalConfig.onConfirm;
                                    setWarningModalConfig(null);
                                    action();
                                }}
                                className="w-full py-2.5 text-xs font-bold text-rose-500 hover:bg-rose-50 rounded-xl transition-colors"
                            >
                                Desactivar de todos modos
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
