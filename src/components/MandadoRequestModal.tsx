import React, { useState, useRef, useEffect } from 'react';
import { 
    ShoppingBag, 
    Mic, 
    Square, 
    Play, 
    Pause, 
    Trash2, 
    MapPin, 
    Store, 
    ShieldCheck, 
    CreditCard, 
    Star, 
    ArrowLeft, 
    Sparkles, 
    Camera, 
    Image as ImageIcon, 
    Users, 
    CheckCircle2, 
    X, 
    ChevronRight, 
    Navigation, 
    Compass,
    Check
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { vibrate } from '../utils/haptics';

export interface MandadoSubmitData {
    description: string;
    storeName: string;
    hasExactStores: boolean;
    storeAddresses?: string;
    transportPassenger: boolean;
    destinationAddress: string;
    destinationCoords?: { lat: number; lng: number };
    audioBlob?: Blob;
    referenceFile?: File | null;
    referencePreviewUrl?: string | null;
    deliveryOption: 'current_location' | 'other_address';
}

interface MandadoRequestModalProps {
    isOpen: boolean;
    onClose: () => void;
    userLocation: { lat: number; lng: number } | null;
    defaultAddress?: string;
    onSubmit: (data: MandadoSubmitData) => Promise<void>;
    isSubmitting: boolean;
}

export default function MandadoRequestModal({
    isOpen,
    onClose,
    userLocation,
    defaultAddress = '',
    onSubmit,
    isSubmitting
}: MandadoRequestModalProps) {
    // Current Step: 1, 2, or 3
    const [step, setStep] = useState<1 | 2 | 3>(1);
    const [showRulesModal, setShowRulesModal] = useState(false);

    // Step 1: Request details
    const [description, setDescription] = useState('');
    const [referenceFile, setReferenceFile] = useState<File | null>(null);
    const [referencePreview, setReferencePreview] = useState<string | null>(null);

    // Audio recorder states
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [isPlayingAudio, setIsPlayingAudio] = useState(false);

    // Step 2: Store locations & passenger conditions
    const [hasExactStores, setHasExactStores] = useState<boolean | null>(null); // true = sí sé, false = que sugiera conductor
    const [storeName, setStoreName] = useState('');
    const [storeAddress, setStoreAddress] = useState('');
    const [transportPassenger, setTransportPassenger] = useState(false);

    // Step 3: Delivery destination
    const [deliveryOption, setDeliveryOption] = useState<'current_location' | 'other_address'>('current_location');
    const [customDestination, setCustomDestination] = useState('');

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<any>(null);
    const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    // Reset when opened
    useEffect(() => {
        if (isOpen) {
            setStep(1);
            if (!customDestination && defaultAddress) {
                setCustomDestination(defaultAddress);
            }
        }
    }, [isOpen, defaultAddress]);

    // Cleanup object URLs on unmount
    useEffect(() => {
        return () => {
            if (audioUrl) URL.revokeObjectURL(audioUrl);
            if (referencePreview) URL.revokeObjectURL(referencePreview);
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [audioUrl, referencePreview]);

    if (!isOpen) return null;

    // Start Audio Recording
    const handleStartRecording = async () => {
        vibrate(30);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorder.onstop = () => {
                const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                setAudioBlob(blob);
                if (audioUrl) URL.revokeObjectURL(audioUrl);
                const newUrl = URL.createObjectURL(blob);
                setAudioUrl(newUrl);

                stream.getTracks().forEach((track) => track.stop());
            };

            mediaRecorder.start(200);
            setIsRecording(true);
            setRecordingTime(0);

            timerRef.current = setInterval(() => {
                setRecordingTime((prev) => {
                    if (prev >= 120) {
                        handleStopRecording();
                        return 120;
                    }
                    return prev + 1;
                });
            }, 1000);
        } catch (err) {
            console.error("Microphone access error:", err);
            toast.error("No se pudo acceder al micrófono. Verifica los permisos de tu dispositivo.");
        }
    };

    // Stop Audio Recording
    const handleStopRecording = () => {
        vibrate(30);
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            if (timerRef.current) clearInterval(timerRef.current);
        }
    };

    // Delete Audio Note
    const handleDeleteAudio = () => {
        vibrate(20);
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        setAudioBlob(null);
        setAudioUrl(null);
        setIsPlayingAudio(false);
        setRecordingTime(0);
    };

    // Toggle Audio Playback Preview
    const handleTogglePlayAudio = () => {
        if (!audioPlayerRef.current || !audioUrl) return;
        if (isPlayingAudio) {
            audioPlayerRef.current.pause();
            setIsPlayingAudio(false);
        } else {
            audioPlayerRef.current.play();
            setIsPlayingAudio(true);
        }
    };

    const formatTime = (secs: number) => {
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    // Image Reference Selection
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 10 * 1024 * 1024) {
            toast.error("La imagen debe pesar menos de 10MB");
            return;
        }

        vibrate(20);
        setReferenceFile(file);
        if (referencePreview) URL.revokeObjectURL(referencePreview);
        setReferencePreview(URL.createObjectURL(file));
    };

    const handleRemoveReference = () => {
        vibrate(20);
        if (referencePreview) URL.revokeObjectURL(referencePreview);
        setReferenceFile(null);
        setReferencePreview(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    // Navigation between steps
    const handleNextFromStep1 = () => {
        if (!description.trim() && !audioBlob) {
            toast.error("Por favor escribe qué necesitas o graba una nota de voz.");
            return;
        }
        vibrate(25);
        setStep(2);
    };

    const handleNextFromStep2 = () => {
        if (hasExactStores === null) {
            toast.error("Selecciona si tienes los lugares de compra definidos o si prefieres sugerencias.");
            return;
        }
        vibrate(25);
        setStep(3);
    };

    const handleFinalSubmit = async () => {
        let finalDestAddress = '';
        let finalDestCoords = userLocation || undefined;

        if (deliveryOption === 'current_location') {
            finalDestAddress = defaultAddress || 'Mi ubicación actual (GPS)';
        } else {
            if (!customDestination.trim()) {
                toast.error("Por favor ingresa la dirección de entrega.");
                return;
            }
            finalDestAddress = customDestination.trim();
        }

        vibrate(40);
        await onSubmit({
            description: description.trim(),
            storeName: storeName.trim(),
            hasExactStores: Boolean(hasExactStores),
            storeAddresses: storeAddress.trim(),
            transportPassenger,
            destinationAddress: finalDestAddress,
            destinationCoords: finalDestCoords,
            audioBlob: audioBlob || undefined,
            referenceFile,
            referencePreviewUrl: referencePreview,
            deliveryOption
        });
    };

    return (
        <div className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-md flex flex-col justify-end sm:justify-center items-center p-0 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
            <div className="w-full max-w-lg bg-white rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[88vh] overflow-hidden border border-amber-200/50">
                {/* Header with Title and Discrete Rules Button */}
                <div className="bg-gradient-to-r from-amber-400 via-[#FFFF00] to-yellow-400 p-4 sm:p-5 px-5 sm:px-6 flex items-center justify-between shrink-0 shadow-sm">
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => {
                                if (step > 1) {
                                    setStep((prev) => (prev - 1) as any);
                                } else {
                                    onClose();
                                }
                            }}
                            className="w-10 h-10 rounded-full bg-slate-950/15 hover:bg-slate-950/25 active:scale-95 text-slate-950 flex items-center justify-center transition-transform"
                            title={step > 1 ? "Paso anterior" : "Cerrar"}
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <div>
                            <h2 className="text-base sm:text-lg font-black text-slate-950 leading-tight flex items-center gap-2">
                                Muchacho e' Mandao
                                <span className="text-[9px] uppercase font-black px-2 py-0.5 rounded-full bg-slate-950 text-[#FFFF00] tracking-wider">
                                    Paso {step} de 3
                                </span>
                            </h2>
                            <p className="text-[11px] text-slate-900/80 font-bold">
                                {step === 1 && "¿Qué necesitas que hagamos por ti?"}
                                {step === 2 && "Lugares de compra y condiciones"}
                                {step === 3 && "Destino final de entrega"}
                            </p>
                        </div>
                    </div>

                    {/* Discrete button to open safety and payment rules popup */}
                    <button
                        type="button"
                        onClick={() => setShowRulesModal(true)}
                        className="px-3 py-1.5 rounded-full bg-slate-950/15 hover:bg-slate-950/25 active:scale-95 text-slate-950 flex items-center gap-1.5 transition-transform text-xs font-black shadow-sm"
                        title="Ver normas del servicio y seguridad"
                    >
                        <ShieldCheck className="w-4 h-4 text-emerald-800" />
                        <span className="hidden xs:inline">Normas</span>
                    </button>
                </div>

                {/* Stepper Progress Bar */}
                <div className="w-full bg-amber-100/60 h-1.5 flex">
                    <div 
                        className={`h-full bg-slate-950 transition-all duration-300 ${
                            step === 1 ? 'w-1/3' : step === 2 ? 'w-2/3' : 'w-full'
                        }`} 
                    />
                </div>

                {/* Body Content by Step */}
                <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
                    {/* ============================================================== */}
                    {/* PASO 1: ¿QUÉ NECESITAS HACER?                                   */}
                    {/* ============================================================== */}
                    {step === 1 && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-200">
                            {/* Textarea amplio */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center justify-between">
                                    <span>Describe tu mandado o diligencia *</span>
                                    <span className="text-[10px] text-slate-400 font-semibold normal-case">Sé lo más claro posible</span>
                                </label>
                                <textarea
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    rows={4}
                                    placeholder="Ejemplo: Necesito que pasen por la farmacia a comprar estas 2 medicinas, luego retiren un paquete en la panadería de la esquina y me lo traigan a la casa..."
                                    className="w-full bg-slate-50 border-2 border-slate-200 focus:border-amber-400 focus:bg-white rounded-2xl p-3.5 text-sm text-slate-900 font-medium placeholder:text-slate-400 focus:outline-none transition-all resize-none shadow-inner leading-relaxed"
                                />
                            </div>

                            {/* Voice note recorder */}
                            <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-3.5 space-y-2.5">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-1.5">
                                        <Mic className="w-4 h-4 text-amber-700" />
                                        <span className="text-xs font-black text-amber-950 uppercase tracking-wide">
                                            Nota de Voz (Opcional)
                                        </span>
                                    </div>
                                    <span className="text-[10px] font-bold text-amber-800/80">
                                        ¿Prefieres hablar? Graba aquí
                                    </span>
                                </div>

                                {!audioBlob ? (
                                    <div className="flex items-center gap-3">
                                        {!isRecording ? (
                                            <button
                                                type="button"
                                                onClick={handleStartRecording}
                                                className="flex-1 py-2.5 px-4 bg-white hover:bg-amber-100/60 border border-amber-300 rounded-xl text-amber-900 font-black text-xs flex items-center justify-center gap-2 active:scale-98 transition-all shadow-sm"
                                            >
                                                <div className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse"></div>
                                                <span>Tocar para grabar audio</span>
                                            </button>
                                        ) : (
                                            <div className="flex-1 flex items-center justify-between bg-white border-2 border-rose-400 rounded-xl px-3.5 py-2 shadow-sm">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2.5 h-2.5 rounded-full bg-rose-600 animate-ping"></div>
                                                    <span className="text-xs font-black text-rose-600">
                                                        Grabando... {formatTime(recordingTime)}
                                                    </span>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={handleStopRecording}
                                                    className="py-1 px-3 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs rounded-lg flex items-center gap-1.5 shadow-sm active:scale-95"
                                                >
                                                    <Square className="w-3 h-3 fill-white" />
                                                    <span>Listo</span>
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    /* Audio Preview Player */
                                    <div className="flex items-center justify-between bg-white border border-amber-300 rounded-xl p-2.5 shadow-sm">
                                        <audio
                                            ref={audioPlayerRef}
                                            src={audioUrl || ''}
                                            onEnded={() => setIsPlayingAudio(false)}
                                            className="hidden"
                                        />
                                        <div className="flex items-center gap-2.5">
                                            <button
                                                type="button"
                                                onClick={handleTogglePlayAudio}
                                                className="w-8 h-8 rounded-full bg-[#FFFF00] border border-yellow-400 text-slate-950 flex items-center justify-center active:scale-95 transition-transform shadow-sm"
                                            >
                                                {isPlayingAudio ? (
                                                    <Pause className="w-3.5 h-3.5 fill-slate-950" />
                                                ) : (
                                                    <Play className="w-3.5 h-3.5 fill-slate-950 ml-0.5" />
                                                )}
                                            </button>
                                            <div>
                                                <p className="text-xs font-black text-slate-900">Audio grabado</p>
                                                <p className="text-[10px] font-bold text-slate-500">
                                                    {formatTime(recordingTime)} de duración
                                                </p>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleDeleteAudio}
                                            className="w-7 h-7 rounded-full bg-slate-100 hover:bg-rose-50 text-slate-400 hover:text-rose-600 flex items-center justify-center transition-colors"
                                            title="Eliminar y grabar de nuevo"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Reference Photo / Attachment (Opcional) */}
                            <div className="space-y-2">
                                <label className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center justify-between">
                                    <span className="flex items-center gap-1.5">
                                        <Camera className="w-3.5 h-3.5 text-slate-500" />
                                        Foto o referencia del producto (Opcional)
                                    </span>
                                </label>

                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    accept="image/*"
                                    onChange={handleFileChange}
                                    className="hidden"
                                />

                                {!referencePreview ? (
                                    <button
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        className="w-full py-3 px-4 border-2 border-dashed border-slate-300 hover:border-amber-400 rounded-2xl bg-slate-50/50 hover:bg-amber-50/30 flex items-center justify-center gap-2.5 text-xs font-bold text-slate-700 transition-all active:scale-98"
                                    >
                                        <ImageIcon className="w-4 h-4 text-amber-500" />
                                        <span>Tomar foto o subir imagen de referencia</span>
                                    </button>
                                ) : (
                                    <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-2xl p-2.5">
                                        <div className="flex items-center gap-3">
                                            <img
                                                src={referencePreview}
                                                alt="Referencia"
                                                className="w-12 h-12 rounded-xl object-cover border border-slate-300"
                                            />
                                            <div>
                                                <p className="text-xs font-black text-slate-900 truncate max-w-[200px]">
                                                    {referenceFile?.name || 'Foto de referencia'}
                                                </p>
                                                <p className="text-[10px] text-emerald-600 font-bold flex items-center gap-1">
                                                    <CheckCircle2 className="w-3 h-3" /> Foto adjunta
                                                </p>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleRemoveReference}
                                            className="w-8 h-8 rounded-full bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-600 flex items-center justify-center shadow-sm"
                                            title="Quitar foto"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Button Siguiente */}
                            <div className="pt-2">
                                <button
                                    type="button"
                                    onClick={handleNextFromStep1}
                                    disabled={!description.trim() && !audioBlob}
                                    className="w-full py-3.5 px-6 bg-primary hover:bg-[#f5f500] text-slate-950 font-black text-xs uppercase tracking-wider rounded-2xl shadow-lg shadow-yellow-500/20 active:scale-98 transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:pointer-events-none"
                                >
                                    <span>Siguiente: Lugares de Compra</span>
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ============================================================== */}
                    {/* PASO 2: LUGARES DE COMPRA Y CONDICIONES DEL VIAJE              */}
                    {/* ============================================================== */}
                    {step === 2 && (
                        <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-200">
                            {/* Question 1: ¿Lugares de compra definidos? */}
                            <div className="space-y-2.5">
                                <label className="text-xs font-black text-slate-900 uppercase tracking-wider block">
                                    1. ¿Tienes los lugares exactos de compra definidos?
                                </label>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {/* Opción A: Sí sé dónde comprar */}
                                    <button
                                        type="button"
                                        onClick={() => {
                                            vibrate(20);
                                            setHasExactStores(true);
                                        }}
                                        className={`p-3.5 rounded-2xl border-2 text-left transition-all relative ${
                                            hasExactStores === true
                                                ? 'border-yellow-400 bg-amber-50/60 shadow-md ring-1 ring-yellow-400'
                                                : 'border-slate-200 hover:border-slate-300 bg-slate-50'
                                        }`}
                                    >
                                        <div className="flex items-start justify-between">
                                            <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-900 flex items-center justify-center mb-2">
                                                <Store className="w-4 h-4" />
                                            </div>
                                            {hasExactStores === true && (
                                                <div className="w-5 h-5 rounded-full bg-slate-950 text-yellow-300 flex items-center justify-center">
                                                    <Check className="w-3 h-3 stroke-[3]" />
                                                </div>
                                            )}
                                        </div>
                                        <h4 className="text-xs font-black text-slate-900">Sí, yo sé dónde comprar</h4>
                                        <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                                            Indicaré los negocios y direcciones exactas
                                        </p>
                                    </button>

                                    {/* Opción B: Conductor sugiere lugares */}
                                    <button
                                        type="button"
                                        onClick={() => {
                                            vibrate(20);
                                            setHasExactStores(false);
                                        }}
                                        className={`p-3.5 rounded-2xl border-2 text-left transition-all relative ${
                                            hasExactStores === false
                                                ? 'border-yellow-400 bg-amber-50/60 shadow-md ring-1 ring-yellow-400'
                                                : 'border-slate-200 hover:border-slate-300 bg-slate-50'
                                        }`}
                                    >
                                        <div className="flex items-start justify-between">
                                            <div className="w-8 h-8 rounded-xl bg-cyan-100 text-cyan-900 flex items-center justify-center mb-2">
                                                <Compass className="w-4 h-4" />
                                            </div>
                                            {hasExactStores === false && (
                                                <div className="w-5 h-5 rounded-full bg-slate-950 text-yellow-300 flex items-center justify-center">
                                                    <Check className="w-3 h-3 stroke-[3]" />
                                                </div>
                                            )}
                                        </div>
                                        <h4 className="text-xs font-black text-slate-900">Que el conductor sugiera</h4>
                                        <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                                            El piloto propondrá los mejores sitios y precios
                                        </p>
                                    </button>
                                </div>

                                {/* Inputs condicionales si tiene lugares exactos */}
                                {hasExactStores === true && (
                                    <div className="space-y-2.5 pt-2 animate-in fade-in duration-200 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                                        <div className="space-y-1">
                                            <label className="text-[11px] font-black text-slate-700 uppercase">
                                                Nombre del negocio o comercio
                                            </label>
                                            <input
                                                type="text"
                                                value={storeName}
                                                onChange={(e) => setStoreName(e.target.value)}
                                                placeholder="Ej: Farmatodo, Panadería Central, Mercado..."
                                                className="w-full bg-white border border-slate-200 focus:border-amber-400 rounded-xl py-2.5 px-3 text-xs text-slate-900 font-medium placeholder:text-slate-400 focus:outline-none"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[11px] font-black text-slate-700 uppercase">
                                                Dirección o referencia del negocio
                                            </label>
                                            <input
                                                type="text"
                                                value={storeAddress}
                                                onChange={(e) => setStoreAddress(e.target.value)}
                                                placeholder="Ej: Av. Principal, al lado de la farmacia..."
                                                className="w-full bg-white border border-slate-200 focus:border-amber-400 rounded-xl py-2.5 px-3 text-xs text-slate-900 font-medium placeholder:text-slate-400 focus:outline-none"
                                            />
                                        </div>
                                    </div>
                                )}

                                {hasExactStores === false && (
                                    <div className="p-3 bg-cyan-50/70 border border-cyan-200/80 rounded-2xl flex items-center gap-2.5 text-xs text-cyan-900 font-medium">
                                        <Sparkles className="w-4 h-4 text-cyan-600 shrink-0" />
                                        <span>El conductor te contactará por chat o llamada para proponerte los lugares más convenientes.</span>
                                    </div>
                                )}
                            </div>

                            {/* Question 2: ¿Se transportará alguna persona? */}
                            <div className="space-y-2.5 pt-1">
                                <label className="text-xs font-black text-slate-900 uppercase tracking-wider block">
                                    2. ¿Se transportará a alguna persona durante este mandado?
                                </label>

                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            vibrate(20);
                                            setTransportPassenger(false);
                                        }}
                                        className={`p-3 rounded-2xl border-2 flex items-center gap-2.5 transition-all ${
                                            !transportPassenger
                                                ? 'border-yellow-400 bg-amber-50/60 shadow-sm ring-1 ring-yellow-400'
                                                : 'border-slate-200 hover:border-slate-300 bg-slate-50'
                                        }`}
                                    >
                                        <div className="w-7 h-7 rounded-xl bg-slate-200 text-slate-700 flex items-center justify-center shrink-0">
                                            <ShoppingBag className="w-3.5 h-3.5" />
                                        </div>
                                        <div className="text-left">
                                            <p className="text-xs font-black text-slate-900">No</p>
                                            <p className="text-[10px] text-slate-500 font-medium leading-tight">Solo diligencias</p>
                                        </div>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            vibrate(20);
                                            setTransportPassenger(true);
                                        }}
                                        className={`p-3 rounded-2xl border-2 flex items-center gap-2.5 transition-all ${
                                            transportPassenger
                                                ? 'border-yellow-400 bg-amber-50/60 shadow-sm ring-1 ring-yellow-400'
                                                : 'border-slate-200 hover:border-slate-300 bg-slate-50'
                                        }`}
                                    >
                                        <div className="w-7 h-7 rounded-xl bg-amber-200 text-amber-950 flex items-center justify-center shrink-0">
                                            <Users className="w-3.5 h-3.5" />
                                        </div>
                                        <div className="text-left">
                                            <p className="text-xs font-black text-slate-900">Sí</p>
                                            <p className="text-[10px] text-slate-500 font-medium leading-tight">Irá un pasajero</p>
                                        </div>
                                    </button>
                                </div>
                            </div>

                            {/* Buttons Navigation */}
                            <div className="flex items-center gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setStep(1)}
                                    className="w-1/3 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 font-black text-xs uppercase tracking-wider rounded-2xl active:scale-98 transition-all flex items-center justify-center gap-1.5"
                                >
                                    <ArrowLeft className="w-3.5 h-3.5" />
                                    <span>Atrás</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={handleNextFromStep2}
                                    disabled={hasExactStores === null}
                                    className="flex-1 py-3 px-4 bg-primary hover:bg-[#f5f500] text-slate-950 font-black text-xs uppercase tracking-wider rounded-2xl shadow-lg shadow-yellow-500/20 active:scale-98 transition-all flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:pointer-events-none"
                                >
                                    <span>Siguiente: Destino</span>
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ============================================================== */}
                    {/* PASO 3: DESTINO FINAL DE ENTREGA                               */}
                    {/* ============================================================== */}
                    {step === 3 && (
                        <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-200">
                            <div className="space-y-2.5">
                                <label className="text-xs font-black text-slate-900 uppercase tracking-wider block">
                                    ¿Dónde finaliza el mandado? (Destino de entrega)
                                </label>

                                <div className="space-y-2.5">
                                    {/* Opción 1: Entregar en mi ubicación actual */}
                                    <button
                                        type="button"
                                        onClick={() => {
                                            vibrate(20);
                                            setDeliveryOption('current_location');
                                        }}
                                        className={`w-full p-4 rounded-2xl border-2 text-left transition-all flex items-center justify-between ${
                                            deliveryOption === 'current_location'
                                                ? 'border-yellow-400 bg-amber-50/60 shadow-md ring-1 ring-yellow-400'
                                                : 'border-slate-200 hover:border-slate-300 bg-slate-50'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                                                <Navigation className="w-4 h-4 fill-emerald-800" />
                                            </div>
                                            <div>
                                                <h4 className="text-xs font-black text-slate-900">
                                                    Entregar en mi ubicación actual
                                                </h4>
                                                <p className="text-[11px] text-slate-500 font-medium">
                                                    {defaultAddress || 'Coordenadas GPS en tiempo real'}
                                                </p>
                                            </div>
                                        </div>
                                        {deliveryOption === 'current_location' && (
                                            <div className="w-5 h-5 rounded-full bg-slate-950 text-yellow-300 flex items-center justify-center shrink-0">
                                                <Check className="w-3 h-3 stroke-[3]" />
                                            </div>
                                        )}
                                    </button>

                                    {/* Opción 2: Entregar en otra dirección */}
                                    <button
                                        type="button"
                                        onClick={() => {
                                            vibrate(20);
                                            setDeliveryOption('other_address');
                                        }}
                                        className={`w-full p-4 rounded-2xl border-2 text-left transition-all flex items-center justify-between ${
                                            deliveryOption === 'other_address'
                                                ? 'border-yellow-400 bg-amber-50/60 shadow-md ring-1 ring-yellow-400'
                                                : 'border-slate-200 hover:border-slate-300 bg-slate-50'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-900 flex items-center justify-center shrink-0">
                                                <MapPin className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <h4 className="text-xs font-black text-slate-900">
                                                    Entregar en otra dirección
                                                </h4>
                                                <p className="text-[11px] text-slate-500 font-medium">
                                                    Escribe o busca una dirección distinta
                                                </p>
                                            </div>
                                        </div>
                                        {deliveryOption === 'other_address' && (
                                            <div className="w-5 h-5 rounded-full bg-slate-950 text-yellow-300 flex items-center justify-center shrink-0">
                                                <Check className="w-3 h-3 stroke-[3]" />
                                            </div>
                                        )}
                                    </button>
                                </div>

                                {/* Campo para escribir otra dirección si eligió esa opción */}
                                {deliveryOption === 'other_address' && (
                                    <div className="pt-2 animate-in fade-in duration-200 space-y-1.5">
                                        <label className="text-[11px] font-black text-slate-700 uppercase">
                                            Dirección exacta de entrega
                                        </label>
                                        <input
                                            type="text"
                                            value={customDestination}
                                            onChange={(e) => setCustomDestination(e.target.value)}
                                            placeholder="Ej: Urbanización Los Mangos, Casa #45..."
                                            className="w-full bg-white border border-slate-200 focus:border-amber-400 rounded-xl py-3 px-3.5 text-xs text-slate-900 font-medium placeholder:text-slate-400 focus:outline-none"
                                        />
                                    </div>
                                )}
                            </div>

                            {/* Resumen del Mandado */}
                            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-2 text-xs">
                                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                                    Resumen de tu solicitud
                                </span>
                                <div className="space-y-1 text-slate-700 text-[11px]">
                                    <p className="line-clamp-2">
                                        <strong className="text-slate-900">Detalle:</strong> {description || 'Nota de voz adjunta'}
                                    </p>
                                    <p>
                                        <strong className="text-slate-900">Lugares:</strong> {hasExactStores ? (storeName || 'Tienda indicada por ti') : 'Conductor sugerirá las mejores opciones'}
                                    </p>
                                    <p>
                                        <strong className="text-slate-900">Pasajero:</strong> {transportPassenger ? 'Sí viajará pasajero' : 'Solo compras/paquete'}
                                    </p>
                                </div>
                            </div>

                            {/* Buttons Navigation */}
                            <div className="flex items-center gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setStep(2)}
                                    className="w-1/3 py-3.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 font-black text-xs uppercase tracking-wider rounded-2xl active:scale-98 transition-all flex items-center justify-center gap-1.5"
                                >
                                    <ArrowLeft className="w-3.5 h-3.5" />
                                    <span>Atrás</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={handleFinalSubmit}
                                    disabled={isSubmitting}
                                    className="flex-1 py-3.5 px-4 bg-primary hover:bg-[#f5f500] text-slate-950 font-black text-xs uppercase tracking-wider rounded-2xl shadow-xl shadow-yellow-500/25 active:scale-98 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none"
                                >
                                    {isSubmitting ? (
                                        <div className="flex items-center gap-2">
                                            <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
                                            <span>Iniciando...</span>
                                        </div>
                                    ) : (
                                        <>
                                            <ShoppingBag className="w-4 h-4" />
                                            <span>Iniciar ahora (Recibir ofertas)</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ============================================================== */}
            {/* MODAL EMERGENTE: NORMAS DE SEGURIDAD Y PAGOS DIRECTOS           */}
            {/* ============================================================== */}
            {showRulesModal && (
                <div className="fixed inset-0 z-[120] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150">
                    <div className="w-full max-w-md bg-white rounded-3xl overflow-hidden shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200">
                        {/* Header */}
                        <div className="bg-slate-950 p-4 px-5 text-white flex items-center justify-between">
                            <div className="flex items-center gap-2 text-yellow-400 font-black text-sm uppercase tracking-wide">
                                <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
                                <span>Normas del Servicio y Seguridad</span>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowRulesModal(false)}
                                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Rules Content */}
                        <div className="p-5 space-y-4 text-xs text-slate-700 leading-relaxed max-h-[70vh] overflow-y-auto">
                            <div className="flex items-start gap-3 p-3 bg-amber-50 rounded-2xl border border-amber-200/80">
                                <CreditCard className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                                <div>
                                    <h4 className="font-black text-slate-900 text-xs mb-0.5">
                                        Cero intermediación de compras
                                    </h4>
                                    <p className="text-[11px] text-slate-600">
                                        Ningún conductor te pedirá que le envíes dinero de tu compra a su cuenta. Solo le pagarás directamente al negocio donde se hace la compra (por Pago Móvil directo al comercio).
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-200">
                                <Sparkles className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
                                <div>
                                    <h4 className="font-black text-slate-900 text-xs mb-0.5">
                                        Pago al piloto
                                    </h4>
                                    <p className="text-[11px] text-slate-600">
                                        Al recibir tu compra o finalizar la vuelta, le pagarás al conductor su tarifa acordada a sus datos de Pago Móvil o en efectivo. Es importante no retrasarse con el pago del servicio.
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-start gap-3 p-3 bg-emerald-50 rounded-2xl border border-emerald-200/80">
                                <Star className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                                <div>
                                    <h4 className="font-black text-slate-900 text-xs mb-0.5">
                                        Calificación y respaldo
                                    </h4>
                                    <p className="text-[11px] text-slate-600">
                                        Recuerda dejar tu calificación, estrellas y reseña al finalizar para respaldar a los buenos pilotos de la comunidad.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="p-4 bg-slate-50 border-t border-slate-200">
                            <button
                                type="button"
                                onClick={() => setShowRulesModal(false)}
                                className="w-full py-3 bg-slate-950 hover:bg-slate-900 text-yellow-300 font-black text-xs uppercase tracking-wider rounded-xl active:scale-98 transition-all"
                            >
                                Entendido
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
