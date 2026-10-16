import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
    AlertTriangle, 
    CreditCard, 
    MessageCircle, 
    Clock, 
    CheckCircle2, 
    ChevronRight, 
    DollarSign,
    Sparkles,
    Star,
    Send
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useCurrency } from '../context/CurrencyContext';
import { vibrate } from '../utils/haptics';
import TripPaymentModal from './TripPaymentModal';
import RideChat from './RideChat';
import toast from 'react-hot-toast';

export default function PendingPaymentTripBanner() {
    const { user, userData } = useAuth();
    const { bcvRate } = useCurrency();

    const [pendingTrip, setPendingTrip] = useState<any | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState<boolean>(false);
    const [isChatOpen, setIsChatOpen] = useState<boolean>(false);

    const prevTripStatusRef = useRef<string | null>(null);

    const uid = user?.id || user?.uid || (userData as any)?.id || (userData as any)?.uid;

    const fetchPendingPaymentTrip = useCallback(async () => {
        if (!uid) {
            setPendingTrip(null);
            setLoading(false);
            return;
        }

        try {
            // Buscar viajes completados recientes para validar estatus de pago
            const { data, error } = await supabase
                .from('transport_requests')
                .select('*')
                .eq('user_id', uid)
                .eq('status', 'completed')
                .order('completed_at', { ascending: false })
                .limit(3);

            if (error) {
                console.warn("Error fetching pending payment trip:", error);
                return;
            }

            if (data && data.length > 0) {
                // Encontrar un viaje que realmente NO haya sido confirmado ni descartado
                const trip = data.find((t: any) => {
                    const isDismissed = localStorage.getItem(`dismissed_trip_${t.id}`) === 'true';
                    if (isDismissed) return false;
                    const isConfirmed = t.payment_status === 'confirmed' || t.payment_status === 'paid' || t.driver_paid === true;
                    return !isConfirmed;
                });

                if (trip) {
                    setPendingTrip(trip);
                } else {
                    setPendingTrip(null);
                }
            } else {
                setPendingTrip(null);
            }
        } catch (err) {
            console.error("Error checking pending payment trip:", err);
        } finally {
            setLoading(false);
        }
    }, [uid]);

    useEffect(() => {
        fetchPendingPaymentTrip();

        const handleClosed = () => {
            setPendingTrip(null);
            setIsPaymentModalOpen(false);
        };
        window.addEventListener('transport_cycle_closed', handleClosed);

        if (!uid) {
            return () => {
                window.removeEventListener('transport_cycle_closed', handleClosed);
            };
        }

        // Suscripción en tiempo real a transport_requests para este usuario
        const channel = supabase
            .channel(`pending_payment_banner_${uid}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'transport_requests',
                    filter: `user_id=eq.${uid}`
                },
                (payload: any) => {
                    const newTrip = payload.new;
                    if (newTrip) {
                        const isDismissed = localStorage.getItem(`dismissed_trip_${newTrip.id}`) === 'true';
                        const isConfirmed = newTrip.payment_status === 'confirmed' || newTrip.payment_status === 'paid' || newTrip.driver_paid === true || isDismissed;
                        const isCompleted = newTrip.status === 'completed';

                        if (isCompleted && !isConfirmed) {
                            setPendingTrip(newTrip);
                        } else if (isConfirmed) {
                            // Conductor confirmó pago - Liberar inmediatamente al usuario
                            setPendingTrip(null);
                            setIsPaymentModalOpen(false);
                            if (payload.old && (!payload.old.driver_paid && payload.old.payment_status !== 'confirmed')) {
                                vibrate([40, 60, 40]);
                                toast.success("¡Tu conductor ha confirmado el Pago Recibido! 🎉", { icon: '✅', duration: 4500 });
                            }
                        } else if (!isCompleted) {
                            fetchPendingPaymentTrip();
                        }
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
            window.removeEventListener('transport_cycle_closed', handleClosed);
        };
    }, [uid, fetchPendingPaymentTrip]);

    if (!pendingTrip || loading) return null;

    const isDismissed = localStorage.getItem(`dismissed_trip_${pendingTrip.id}`) === 'true';
    const isConfirmed = pendingTrip.payment_status === 'confirmed' || pendingTrip.payment_status === 'paid' || pendingTrip.driver_paid === true || isDismissed;

    // Si ya está confirmado por el chofer o descartado, el usuario está libre: NUNCA mostrar banner de pago pendiente
    if (isConfirmed) return null;

    const amountUsd = parseFloat(pendingTrip.price || pendingTrip.fare || pendingTrip.total || 0);
    const amountBs = bcvRate > 0 ? (amountUsd * bcvRate).toFixed(2) : amountUsd.toFixed(2);
    const driverName = pendingTrip.driver_name || 'tu conductor';
    const isReported = pendingTrip.payment_status === 'reported' || Boolean(pendingTrip.payment_ref || pendingTrip.payment_proof_url);

    return (
        <>
            <motion.div
                initial={{ opacity: 0, y: -20, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -20, scale: 0.98 }}
                className="mx-4 my-3 overflow-hidden rounded-[2rem] shadow-xl border-2 transition-all relative z-30"
                style={{
                    backgroundColor: isReported ? '#F0F9FF' : '#FFFBEB',
                    borderColor: isReported ? '#38BDF8' : '#F59E0B',
                    boxShadow: isReported 
                        ? '0 10px 25px -5px rgba(56, 189, 248, 0.25)' 
                        : '0 10px 25px -5px rgba(245, 158, 11, 0.35)'
                }}
            >
                {/* Glowing top accent stripe */}
                <div 
                    className="h-1.5 w-full animate-pulse"
                    style={{ backgroundColor: isReported ? '#0284C7' : '#D97706' }}
                />

                <div className="p-4 sm:p-4.5 space-y-3">
                    {/* Header del Banner */}
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                            <div 
                                className="w-10 h-10 rounded-2xl flex items-center justify-center font-black shrink-0 shadow-sm animate-bounce-subtle"
                                style={{
                                    backgroundColor: isReported ? '#0284C7' : '#D97706',
                                    color: '#FFFFFF'
                                }}
                            >
                                {isReported ? <Clock className="w-5 h-5 animate-spin" /> : <CreditCard className="w-5 h-5" />}
                            </div>

                            <div>
                                <span 
                                    className="text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full inline-block mb-0.5 border font-mono"
                                    style={{
                                        backgroundColor: isReported ? '#E0F2FE' : '#FEF3C7',
                                        color: isReported ? '#0369A1' : '#92400E',
                                        borderColor: isReported ? '#BAE6FD' : '#FDE68A'
                                    }}
                                >
                                    {isReported ? 'PAGO EN VERIFICACIÓN' : 'PAGO PENDIENTE DE VIAJE'}
                                </span>
                                <h3 className="text-sm font-black text-slate-900 leading-snug">
                                    {isReported ? (
                                        <>Pago enviado (Ref: <span className="font-mono text-blue-700">{pendingTrip.payment_ref || 'Capture adjunto'}</span>)</>
                                    ) : (
                                        <>Tienes un pago pendiente de <span className="text-amber-800">${amountUsd.toFixed(2)} USD</span></>
                                    )}
                                </h3>
                            </div>
                        </div>

                        {/* Monto tag */}
                        <div className="text-right shrink-0">
                            <span className="text-sm font-black text-slate-900 block font-mono leading-none">
                                ${amountUsd.toFixed(2)}
                            </span>
                            {bcvRate > 0 && (
                                <span className="text-[10px] font-bold text-slate-500 block mt-0.5">
                                    Bs. {amountBs}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Descripción del estado */}
                    <p className="text-xs text-slate-700 leading-relaxed font-medium">
                        {isReported ? (
                            <>Esperando que <strong>{driverName}</strong> confirme <em>"Pago Recibido"</em> en su radar. Si ya lo cobró, puedes escribirle por chat directo para agilizar la confirmación.</>
                        ) : (
                            <>Tu viaje con <strong>{driverName}</strong> ha finalizado. Por favor transfiere por Pago Móvil o entrega el dinero y envía tu capture o número de referencia.</>
                        )}
                    </p>

                    {/* Botones de Acción */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
                        {isReported ? (
                            <>
                                {/* Botón de Chat Activo Obligatorio */}
                                <button
                                    type="button"
                                    onClick={() => {
                                        vibrate(30);
                                        setIsChatOpen(true);
                                    }}
                                    className="flex-1 py-3 px-4 bg-slate-900 hover:bg-slate-800 text-amber-400 font-black text-xs uppercase tracking-wider rounded-xl shadow-md active:scale-98 transition-all flex items-center justify-center gap-2"
                                >
                                    <MessageCircle className="w-4 h-4 text-amber-400" />
                                    <span>ESCRIBIR AL CONDUCTOR POR CHAT</span>
                                </button>

                                {/* Ver o Editar Referencia */}
                                <button
                                    type="button"
                                    onClick={() => {
                                        vibrate(30);
                                        setIsPaymentModalOpen(true);
                                    }}
                                    className="py-3 px-3.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-bold text-xs rounded-xl active:scale-98 transition-all flex items-center justify-center gap-1.5"
                                >
                                    <span>Ver Comprobante</span>
                                </button>
                            </>
                        ) : (
                            <>
                                {/* Botón Principal Estado A: Pagar y Enviar Capture / Referencia */}
                                <button
                                    type="button"
                                    onClick={() => {
                                        vibrate(40);
                                        setIsPaymentModalOpen(true);
                                    }}
                                    className="w-full py-3.5 px-4 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-md active:scale-98 transition-all flex items-center justify-center gap-2"
                                >
                                    <CreditCard className="w-4 h-4 text-slate-950" />
                                    <span>PAGAR Y ENVIAR CAPTURE / REFERENCIA</span>
                                    <ChevronRight className="w-4 h-4 ml-1" />
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </motion.div>

            {/* Modal de Pago y Calificación */}
            {isPaymentModalOpen && (
                <TripPaymentModal
                    isOpen={isPaymentModalOpen}
                    onClose={() => {
                        setIsPaymentModalOpen(false);
                        fetchPendingPaymentTrip();
                    }}
                    trip={pendingTrip}
                    onPaymentReported={() => {
                        fetchPendingPaymentTrip();
                    }}
                    onRatingSubmitted={() => {
                        fetchPendingPaymentTrip();
                    }}
                />
            )}

            {/* Sub-modal de Chat Directo con el chofer */}
            <AnimatePresence>
                {isChatOpen && pendingTrip && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="fixed inset-0 z-[60] bg-white flex flex-col"
                    >
                        <RideChat
                            requestId={pendingTrip.id}
                            onClose={() => setIsChatOpen(false)}
                            serviceCategory={pendingTrip.service_category}
                            requestStatus={pendingTrip.status}
                            completedAt={pendingTrip.completed_at}
                            clientPhone={pendingTrip.passenger_phone || pendingTrip.user_phone}
                            driverPhone={pendingTrip.driver_phone}
                            isDriver={false}
                            allowChatOnCompleted={true}
                        />
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
