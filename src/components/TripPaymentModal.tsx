import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
    X, 
    Copy, 
    Check, 
    UploadCloud, 
    CheckCircle2, 
    Clock, 
    AlertTriangle, 
    MessageCircle, 
    Star, 
    ShieldCheck, 
    Navigation, 
    MapPin, 
    DollarSign, 
    CreditCard, 
    Sparkles, 
    Bike, 
    Car, 
    Package,
    Trash2
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useCurrency } from '../context/CurrencyContext';
import { compressImage } from '../utils/mediaCompressor';
import { vibrate } from '../utils/haptics';
import toast from 'react-hot-toast';
import RideChat from './RideChat';

interface TripPaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    trip: any;
    onPaymentReported?: () => void;
    onRatingSubmitted?: () => void;
}

const POSITIVE_TAGS = [
    { id: 'puntual', label: '⏱️ Puntual' },
    { id: 'amable', label: '😊 Muy amable' },
    { id: 'buen_manejo', label: '🚗 Manejo seguro' },
    { id: 'vehiculo_limpio', label: '✨ Vehículo impecable' },
    { id: 'comunicativo', label: '💬 Excelente comunicación' },
];

const NEGATIVE_TAGS = [
    { id: 'retraso', label: '⏳ Demorado' },
    { id: 'manejo_brusco', label: '⚠️ Manejo brusco' },
    { id: 'vehiculo_descuidado', label: '🧹 Vehículo descuidado' },
    { id: 'mala_actitud', label: '🙁 Mala actitud' },
];

export default function TripPaymentModal({
    isOpen,
    onClose,
    trip: initialTrip,
    onPaymentReported,
    onRatingSubmitted
}: TripPaymentModalProps) {
    const { user, userData } = useAuth();
    const { bcvRate } = useCurrency();

    const [trip, setTrip] = useState<any>(initialTrip);
    const [copiedKey, setCopiedKey] = useState<string | null>(null);

    // Formulario de Pago
    const [paymentFile, setPaymentFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [reference, setReference] = useState<string>('');
    const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
    const [isEditingReported, setIsEditingReported] = useState(false);

    // Formulario de Calificación
    const [rating, setRating] = useState<number>(0);
    const [hoverRating, setHoverRating] = useState<number>(0);
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [comment, setComment] = useState<string>('');
    const [isSubmittingRating, setIsSubmittingRating] = useState(false);
    const [hasRated, setHasRated] = useState<boolean>(false);

    // Chat modal interno
    const [showChat, setShowChat] = useState<boolean>(false);

    // Datos extra de pago móvil del chofer si no vinieron en la solicitud
    const [driverPaymentMobile, setDriverPaymentMobile] = useState<any>(null);

    // Sincronizar estado inicial
    useEffect(() => {
        if (!initialTrip) return;
        setTrip(initialTrip);
        if (initialTrip.payment_ref) {
            setReference(initialTrip.payment_ref);
        }
        if (initialTrip.payment_proof_url) {
            setPreviewUrl(initialTrip.payment_proof_url);
        }
        if (initialTrip.rating) {
            setRating(Number(initialTrip.rating));
            setHasRated(true);
        }
    }, [initialTrip]);

    // Suscripción en tiempo real a cambios en este viaje específico
    useEffect(() => {
        if (!isOpen || !trip?.id) return;

        const channel = supabase
            .channel(`trip_payment_modal_${trip.id}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'transport_requests',
                    filter: `id=eq.${trip.id}`
                },
                (payload: any) => {
                    if (payload.new) {
                        setTrip((prev: any) => ({ ...prev, ...payload.new }));
                        if (payload.new.rating) {
                            setRating(Number(payload.new.rating));
                            setHasRated(true);
                        }
                    }
                }
            )
            .subscribe();

        // Buscar datos de pago móvil si no están en el objeto del viaje
        const driverId = trip.driver_id || trip.driverId;
        if (driverId && !trip.driver_payment_info) {
            supabase
                .from('drivers')
                .select('payment_mobile, payment_info, bank_name, phone')
                .eq('id', driverId)
                .maybeSingle()
                .then(({ data }) => {
                    if (data) {
                        const pm = data.payment_mobile || data.payment_info;
                        if (pm) setDriverPaymentMobile(pm);
                    }
                })
                .catch(console.warn);
        }

        return () => {
            supabase.removeChannel(channel);
        };
    }, [isOpen, trip?.id, trip?.driver_id]);

    if (!isOpen || !trip) return null;

    const amountUsd = parseFloat(trip.price || trip.fare || trip.total || 0);
    const amountBs = bcvRate > 0 ? (amountUsd * bcvRate).toFixed(2) : (amountUsd * 1).toFixed(2);

    const pm = trip.driver_payment_info || driverPaymentMobile || {};
    const bankName = pm.bank || pm.bank_name || 'Banco de Venezuela';
    const phone = pm.phone || trip.driver_phone || (pm.phoneNumber) || 'Sin teléfono';
    const idf = pm.idf || pm.cedula || 'Sin cédula';
    const driverName = trip.driver_name || 'Tu Conductor';

    const isConfirmed = trip.payment_status === 'confirmed' || trip.driver_paid === true;
    const isReported = (trip.payment_status === 'reported' || Boolean(trip.payment_ref || trip.payment_proof_url)) && !isEditingReported;

    const handleCopy = (text: string, key: string) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        vibrate(30);
        setCopiedKey(key);
        toast.success(`Copiado: ${text}`);
        setTimeout(() => setCopiedKey(null), 2000);
    };

    const handleCopyAll = () => {
        const text = `Pago Móvil a: ${driverName}\nBanco: ${bankName}\nTeléfono: ${phone}\nCédula: ${idf}\nMonto: Bs. ${amountBs} (${amountUsd.toFixed(2)} USD)`;
        navigator.clipboard.writeText(text);
        vibrate(40);
        toast.success("¡Todos los datos de Pago Móvil copiados!");
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 8 * 1024 * 1024) {
            toast.error("El archivo supera los 8MB");
            return;
        }
        setPaymentFile(file);
        const url = URL.createObjectURL(file);
        setPreviewUrl(url);
    };

    const handleRemoveFile = () => {
        setPaymentFile(null);
        setPreviewUrl(null);
    };

    const handleSubmitPaymentReport = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!reference.trim() && !paymentFile && !previewUrl) {
            toast.error("Ingresa el número de referencia o adjunta el capture de pantalla.");
            return;
        }

        setIsSubmittingPayment(true);
        try {
            let uploadedProofUrl = trip.payment_proof_url || null;

            if (paymentFile) {
                const compressed = await compressImage(paymentFile, 1280, 0.8);
                const ext = paymentFile.name.split('.').pop() || 'jpg';
                const filePath = `payment_proofs/proof_${trip.id}_${Date.now()}.${ext}`;

                const { error: upErr } = await supabase.storage
                    .from('store_assets')
                    .upload(filePath, compressed, { upsert: true });

                if (!upErr) {
                    const { data: { publicUrl } } = supabase.storage
                        .from('store_assets')
                        .getPublicUrl(filePath);
                    uploadedProofUrl = publicUrl;
                } else {
                    console.warn("Storage upload fallback error:", upErr);
                }
            }

            const cleanRef = reference.trim();

            const { error: updErr } = await supabase
                .from('transport_requests')
                .update({
                    payment_status: 'reported',
                    payment_proof_url: uploadedProofUrl,
                    payment_ref: cleanRef || trip.payment_ref || null,
                    payment_reported_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq('id', trip.id);

            if (updErr) throw updErr;

            // Broadcast al conductor por canal en vivo
            try {
                const notifyChannel = supabase.channel(`call_${trip.id}`);
                notifyChannel.subscribe((subStatus) => {
                    if (subStatus === 'SUBSCRIBED') {
                        notifyChannel.send({
                            type: 'broadcast',
                            event: 'payment_reported',
                            payload: {
                                requestId: trip.id,
                                payment_ref: cleanRef,
                                payment_proof_url: uploadedProofUrl
                            }
                        });
                    }
                });
            } catch (bErr) {
                console.warn("Broadcast payment error:", bErr);
            }

            // Enviar mensaje de comprobante al chat
            try {
                const chatPath = `transport_requests/${trip.id}`;
                const refText = cleanRef ? ` (Ref: ${cleanRef})` : '';
                await supabase.from('messages').insert({
                    chat_path: chatPath,
                    order_id: trip.id,
                    sender_id: user?.uid || (userData as any)?.id || 'client',
                    sender_name: userData?.displayName || userData?.name || 'Cliente',
                    sender_role: 'client',
                    text: `📲 He enviado el pago por Pago Móvil de Bs. ${amountBs}${refText}. Favor confirmar recepción.`,
                    image_url: uploadedProofUrl,
                    created_at: new Date().toISOString()
                });
            } catch (chatErr) {
                console.warn("Chat notify error:", chatErr);
            }

            setTrip((prev: any) => ({
                ...prev,
                payment_status: 'reported',
                payment_proof_url: uploadedProofUrl,
                payment_ref: cleanRef || prev.payment_ref
            }));

            setIsEditingReported(false);
            vibrate(50);
            toast.success("¡Comprobante enviado! El conductor confirmará la recepción.", { icon: '🚀', duration: 4000 });
            if (onPaymentReported) onPaymentReported();
        } catch (err: any) {
            console.error("Error al reportar pago:", err);
            toast.error("No se pudo enviar el reporte de pago: " + (err.message || 'Intenta de nuevo'));
        } finally {
            setIsSubmittingPayment(false);
        }
    };

    const toggleTag = (tagId: string) => {
        setSelectedTags(prev => 
            prev.includes(tagId) ? prev.filter(t => t !== tagId) : [...prev, tagId]
        );
    };

    const handleSubmitRating = async () => {
        if (rating === 0) {
            toast.error("Selecciona al menos 1 estrella.");
            return;
        }

        setIsSubmittingRating(true);
        try {
            const driverId = trip.driver_id || trip.driverId;
            const fullComment = comment.trim();
            const tagsComment = selectedTags.length > 0 ? ` [${selectedTags.join(', ')}]` : '';
            const finalComment = `${fullComment}${tagsComment}`.trim() || `Calificación del cliente (${rating}★)`;

            // Actualizar transport_requests
            await supabase
                .from('transport_requests')
                .update({
                    rating,
                    rating_comment: finalComment,
                    rated_at: new Date().toISOString()
                })
                .eq('id', trip.id);

            // Insertar en tabla de reviews
            try {
                await supabase.from('reviews').insert([{
                    user_id: user?.uid || (userData as any)?.id,
                    user_name: userData?.displayName || userData?.name || 'Cliente',
                    user_avatar: userData?.avatar_url || (userData as any)?.photoURL || null,
                    driver_id: driverId,
                    rating,
                    comment: finalComment,
                    order_id: trip.id,
                    created_at: new Date().toISOString()
                }]);
            } catch (revErr) {
                console.warn("Reviews insert error:", revErr);
            }

            setHasRated(true);
            vibrate(40);
            toast.success("¡Gracias por calificar al conductor! ⭐");
            if (onRatingSubmitted) onRatingSubmitted();

            // Si el pago ya está confirmado, podemos cerrar tras calificar
            if (isConfirmed) {
                setTimeout(() => {
                    onClose();
                }, 1500);
            }
        } catch (err: any) {
            console.error("Error al enviar calificación:", err);
            toast.error("No se pudo guardar la calificación");
        } finally {
            setIsSubmittingRating(false);
        }
    };

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
                <motion.div
                    initial={{ y: '100%', opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: '100%', opacity: 0 }}
                    transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                    className="w-full max-w-lg bg-white rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl max-h-[92vh] flex flex-col overflow-hidden border border-slate-100"
                >
                    {/* Header con botón cerrar */}
                    <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
                        <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center font-black shadow-sm">
                                <CreditCard className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="font-black text-slate-900 text-base leading-tight">
                                    Pago y Calificación del Viaje
                                </h3>
                                <p className="text-[11px] font-bold text-slate-400">
                                    Viaje #{trip.id.slice(0, 8).toUpperCase()}
                                </p>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={onClose}
                            className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center active:scale-95 transition-all"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Contenido scrolleable */}
                    <div className="p-4 sm:p-6 overflow-y-auto space-y-4">
                        {/* Ficha del Conductor */}
                        <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-2xl border border-slate-100">
                            <div className="flex items-center gap-3">
                                {trip.driver_photo ? (
                                    <img 
                                        src={trip.driver_photo} 
                                        alt={driverName} 
                                        className="w-12 h-12 rounded-full object-cover border-2 border-amber-400 shadow-sm"
                                    />
                                ) : (
                                    <div className="w-12 h-12 rounded-full bg-slate-900 text-amber-400 flex items-center justify-center font-black text-base shadow-sm">
                                        {driverName.substring(0, 2).toUpperCase()}
                                    </div>
                                )}
                                <div>
                                    <h4 className="font-black text-slate-900 text-sm leading-snug">
                                        {driverName}
                                    </h4>
                                    <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-500">
                                        <span className="capitalize">{trip.vehicle_type || 'Moto/Carro'}</span>
                                        {trip.vehicle_plate && (
                                            <span className="font-mono bg-slate-200 px-1.5 py-0.2 rounded text-[10px] text-slate-800 font-black">
                                                {trip.vehicle_plate}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={() => setShowChat(true)}
                                className="px-3.5 py-2 bg-slate-900 text-amber-400 hover:bg-slate-800 rounded-xl font-black text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
                            >
                                <MessageCircle className="w-3.5 h-3.5" />
                                <span>Chat</span>
                            </button>
                        </div>

                        {/* Monto Destacado a Pagar */}
                        <div className="p-4 bg-gradient-to-br from-amber-500/10 via-amber-50 to-orange-50 border-2 border-amber-400 rounded-3xl flex items-center justify-between shadow-xs">
                            <div>
                                <span className="text-[10px] font-black uppercase tracking-wider text-amber-900 block">
                                    Monto Total a Pagar
                                </span>
                                <div className="text-3xl font-black text-slate-950 mt-0.5">
                                    ${amountUsd.toFixed(2)} <span className="text-sm font-bold text-amber-700">USD</span>
                                </div>
                            </div>

                            <div className="text-right">
                                <span className="text-[10px] font-bold text-slate-500 block">
                                    {bcvRate > 0 ? `Tasa BCV: ${bcvRate.toFixed(2)} Bs/$` : 'En Bolívares'}
                                </span>
                                <div className="text-xl font-black text-emerald-600 mt-0.5">
                                    Bs. {amountBs}
                                </div>
                            </div>
                        </div>

                        {/* Estado de Conciliación / Confirmación del Conductor */}
                        {isConfirmed ? (
                            <div className="p-4 bg-emerald-50 border-2 border-emerald-400 rounded-2xl flex items-center gap-3">
                                <div className="w-10 h-10 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shrink-0 font-black shadow-sm">
                                    <CheckCircle2 className="w-6 h-6" />
                                </div>
                                <div className="flex-1">
                                    <h4 className="font-black text-emerald-950 text-sm">
                                        ¡Pago Confirmado y Conciliado!
                                    </h4>
                                    <p className="text-xs text-emerald-800 font-medium">
                                        Tu conductor ha validado la recepción del dinero.
                                    </p>
                                </div>
                            </div>
                        ) : isReported ? (
                            <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl space-y-3">
                                <div className="flex items-start gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-blue-500 text-white flex items-center justify-center shrink-0">
                                        <Clock className="w-5 h-5 animate-spin" />
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center justify-between">
                                            <h4 className="font-black text-blue-950 text-sm">
                                                Pago Enviado y en Verificación
                                            </h4>
                                            <span className="text-[10px] font-black uppercase px-2 py-0.5 bg-blue-200 text-blue-900 rounded-full">
                                                En espera
                                            </span>
                                        </div>
                                        <p className="text-xs text-blue-900/90 font-medium mt-1">
                                            {trip.payment_ref ? `Referencia reportada: ${trip.payment_ref}. ` : 'Capture de pantalla adjuntado. '}
                                            Esperando que el conductor presione "Pago Recibido" en su aplicación.
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 pt-1">
                                    <button
                                        type="button"
                                        onClick={() => setShowChat(true)}
                                        className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-800 text-amber-400 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all"
                                    >
                                        <MessageCircle className="w-3.5 h-3.5" />
                                        <span>Escribir al conductor por chat</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setIsEditingReported(true)}
                                        className="px-3 py-2.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl font-bold text-xs active:scale-95 transition-all"
                                    >
                                        Editar datos
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-2.5 text-xs text-rose-900 font-bold">
                                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                                <span>Por favor realiza el Pago Móvil y adjunta el capture o referencia abajo:</span>
                            </div>
                        )}

                        {/* Datos de Pago Móvil del Conductor */}
                        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2.5">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                                    📲 Datos de Pago Móvil del Conductor
                                </span>
                                <span className="text-[10px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                                    Directo
                                </span>
                            </div>

                            <div className="space-y-1.5 text-xs">
                                <div className="flex justify-between items-center bg-white p-2.5 rounded-xl border border-slate-200/80">
                                    <span className="text-slate-500 font-bold">Banco: <b className="text-slate-900">{bankName}</b></span>
                                    <button
                                        type="button"
                                        onClick={() => handleCopy(bankName, 'banco')}
                                        className="text-xs font-black text-amber-600 flex items-center gap-1 hover:underline active:scale-95"
                                    >
                                        {copiedKey === 'banco' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                                        <span>{copiedKey === 'banco' ? 'Copiado' : 'Copiar'}</span>
                                    </button>
                                </div>

                                <div className="flex justify-between items-center bg-white p-2.5 rounded-xl border border-slate-200/80">
                                    <span className="text-slate-500 font-bold">Teléfono: <b className="text-slate-900">{phone}</b></span>
                                    <button
                                        type="button"
                                        onClick={() => handleCopy(phone, 'telefono')}
                                        className="text-xs font-black text-amber-600 flex items-center gap-1 hover:underline active:scale-95"
                                    >
                                        {copiedKey === 'telefono' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                                        <span>{copiedKey === 'telefono' ? 'Copiado' : 'Copiar'}</span>
                                    </button>
                                </div>

                                <div className="flex justify-between items-center bg-white p-2.5 rounded-xl border border-slate-200/80">
                                    <span className="text-slate-500 font-bold">Cédula / RIF: <b className="text-slate-900">{idf}</b></span>
                                    <button
                                        type="button"
                                        onClick={() => handleCopy(idf, 'cedula')}
                                        className="text-xs font-black text-amber-600 flex items-center gap-1 hover:underline active:scale-95"
                                    >
                                        {copiedKey === 'cedula' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                                        <span>{copiedKey === 'cedula' ? 'Copiado' : 'Copiar'}</span>
                                    </button>
                                </div>

                                <div className="flex justify-between items-center bg-white p-2.5 rounded-xl border border-slate-200/80">
                                    <span className="text-slate-500 font-bold">Monto exacto: <b className="text-emerald-700">{amountBs} Bs</b></span>
                                    <button
                                        type="button"
                                        onClick={() => handleCopy(amountBs, 'monto')}
                                        className="text-xs font-black text-amber-600 flex items-center gap-1 hover:underline active:scale-95"
                                    >
                                        {copiedKey === 'monto' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                                        <span>{copiedKey === 'monto' ? 'Copiado' : 'Copiar'}</span>
                                    </button>
                                </div>

                                <button
                                    type="button"
                                    onClick={handleCopyAll}
                                    className="w-full py-2 bg-amber-400 hover:bg-amber-500 text-slate-950 font-black text-xs rounded-xl active:scale-98 transition-all flex items-center justify-center gap-1.5 shadow-sm mt-1"
                                >
                                    <Copy className="w-3.5 h-3.5" />
                                    <span>Copiar todos los datos de Pago Móvil</span>
                                </button>
                            </div>
                        </div>

                        {/* Formulario de Subida de Comprobante / Referencia (si no está confirmado o si está editando) */}
                        {(!isConfirmed && (!isReported || isEditingReported)) && (
                            <form onSubmit={handleSubmitPaymentReport} className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                                <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                                    Adjuntar Comprobante de Pago
                                </h4>

                                {/* Upload box */}
                                <div>
                                    {previewUrl ? (
                                        <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-950 max-h-48 flex justify-center">
                                            <img 
                                                src={previewUrl} 
                                                alt="Comprobante" 
                                                className="max-h-48 object-contain"
                                            />
                                            <button
                                                type="button"
                                                onClick={handleRemoveFile}
                                                className="absolute top-2 right-2 w-8 h-8 rounded-full bg-rose-600 text-white flex items-center justify-center shadow-md active:scale-90"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ) : (
                                        <label className="border-2 border-dashed border-slate-300 hover:border-amber-400 rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer bg-white transition-colors">
                                            <UploadCloud className="w-8 h-8 text-slate-400 mb-1" />
                                            <span className="text-xs font-black text-slate-700">Subir Capture de Pantalla</span>
                                            <span className="text-[10px] text-slate-400">JPG, PNG o comprobante bancario</span>
                                            <input 
                                                type="file" 
                                                accept="image/*" 
                                                onChange={handleFileChange} 
                                                className="hidden" 
                                            />
                                        </label>
                                    )}
                                </div>

                                {/* Referencia numéricas */}
                                <div>
                                    <label className="text-[11px] font-bold text-slate-600 block mb-1">
                                        Número de Referencia (4 a 8 dígitos):
                                    </label>
                                    <input
                                        type="text"
                                        value={reference}
                                        onChange={(e) => setReference(e.target.value)}
                                        placeholder="Ej: 849204"
                                        className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-400"
                                    />
                                </div>

                                <button
                                    type="submit"
                                    disabled={isSubmittingPayment}
                                    className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-md active:scale-98 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    {isSubmittingPayment ? (
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                        <>
                                            <CheckCircle2 className="w-4 h-4" />
                                            <span>Enviar Comprobante y Reportar Pago</span>
                                        </>
                                    )}
                                </button>
                            </form>
                        )}

                        {/* Sección de Calificación al Conductor */}
                        <div className="bg-gradient-to-b from-indigo-50/70 to-white border border-indigo-100 rounded-2xl p-4 space-y-3">
                            <h4 className="text-center font-black text-slate-900 text-sm">
                                ¿Cómo estuvo tu experiencia con {driverName}?
                            </h4>

                            {hasRated ? (
                                <div className="text-center py-2 space-y-1">
                                    <div className="flex justify-center gap-1 text-amber-400">
                                        {[1, 2, 3, 4, 5].map(s => (
                                            <Star key={s} className={`w-6 h-6 ${s <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`} />
                                        ))}
                                    </div>
                                    <p className="text-xs font-black text-emerald-700">
                                        ✓ ¡Calificación guardada ({rating} estrellas)!
                                    </p>
                                </div>
                            ) : (
                                <>
                                    {/* Estrellas */}
                                    <div className="flex justify-center gap-2 py-1">
                                        {[1, 2, 3, 4, 5].map((star) => (
                                            <button
                                                key={star}
                                                type="button"
                                                onMouseEnter={() => setHoverRating(star)}
                                                onMouseLeave={() => setHoverRating(0)}
                                                onClick={() => {
                                                    setRating(star);
                                                    vibrate(30);
                                                }}
                                                className="transition-transform active:scale-90"
                                            >
                                                <Star
                                                    className={`w-9 h-9 ${(hoverRating || rating) >= star ? 'fill-amber-400 text-amber-400' : 'text-slate-200'} transition-colors drop-shadow`}
                                                    strokeWidth={1.5}
                                                />
                                            </button>
                                        ))}
                                    </div>

                                    {/* Chips de tags */}
                                    {rating > 0 && (
                                        <div className="space-y-2">
                                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider text-center">
                                                {rating >= 4 ? '¿Qué fue lo mejor?' : '¿Qué falló?'}
                                            </p>
                                            <div className="flex flex-wrap justify-center gap-1.5">
                                                {(rating >= 4 ? POSITIVE_TAGS : NEGATIVE_TAGS).map(tag => (
                                                    <button
                                                        key={tag.id}
                                                        type="button"
                                                        onClick={() => toggleTag(tag.label)}
                                                        className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all active:scale-95 ${
                                                            selectedTags.includes(tag.label)
                                                                ? 'bg-amber-400 border-amber-400 text-slate-950 shadow-xs'
                                                                : 'bg-white border-slate-200 text-slate-600'
                                                        }`}
                                                    >
                                                        {tag.label}
                                                    </button>
                                                ))}
                                            </div>

                                            <textarea
                                                value={comment}
                                                onChange={(e) => setComment(e.target.value)}
                                                placeholder="Comentario adicional (opcional)..."
                                                rows={2}
                                                className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400 text-slate-800 placeholder:text-slate-400 resize-none"
                                            />

                                            <button
                                                type="button"
                                                onClick={handleSubmitRating}
                                                disabled={isSubmittingRating}
                                                className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-amber-400 rounded-xl font-black text-xs uppercase tracking-wider shadow-sm active:scale-98 transition-all flex items-center justify-center gap-2"
                                            >
                                                {isSubmittingRating ? (
                                                    <div className="w-3.5 h-3.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                                                ) : (
                                                    <>
                                                        <Star className="w-3.5 h-3.5 fill-amber-400" />
                                                        <span>Enviar Calificación</span>
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        {/* Botón de Salir si ya todo está conciliado */}
                        {isConfirmed && (
                            <button
                                type="button"
                                onClick={onClose}
                                className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 active:scale-98 text-white rounded-2xl font-black text-xs uppercase tracking-wider shadow-lg flex items-center justify-center gap-2 transition-all"
                            >
                                <span>Entendido / Cerrar</span>
                            </button>
                        )}
                    </div>
                </motion.div>

                {/* Sub-Modal de Chat Integrado para contacto directo */}
                <AnimatePresence>
                    {showChat && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="fixed inset-0 z-[60] bg-white flex flex-col"
                        >
                            <RideChat
                                requestId={trip.id}
                                onClose={() => setShowChat(false)}
                                serviceCategory={trip.service_category}
                                requestStatus={trip.status}
                                completedAt={trip.completed_at}
                                clientPhone={trip.passenger_phone || trip.user_phone}
                                driverPhone={trip.driver_phone}
                                isDriver={false}
                                allowChatOnCompleted={true}
                            />
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </AnimatePresence>
    );
}
