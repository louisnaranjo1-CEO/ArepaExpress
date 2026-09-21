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
    AlertCircle 
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { vibrate } from '../utils/haptics';

interface MandadoRequestModalProps {
    isOpen: boolean;
    onClose: () => void;
    userLocation: { lat: number; lng: number } | null;
    defaultAddress?: string;
    onSubmit: (data: {
        description: string;
        storeName: string;
        destinationAddress: string;
        destinationCoords?: { lat: number; lng: number };
        audioBlob?: Blob;
    }) => Promise<void>;
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
    const [description, setDescription] = useState('');
    const [storeName, setStoreName] = useState('');
    const [destinationAddress, setDestinationAddress] = useState(defaultAddress || '');

    // Voice note recording states
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [isPlayingAudio, setIsPlayingAudio] = useState(false);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<any>(null);
    const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        if (defaultAddress && !destinationAddress) {
            setDestinationAddress(defaultAddress);
        }
    }, [defaultAddress]);

    // Cleanup audio URL on unmount
    useEffect(() => {
        return () => {
            if (audioUrl) URL.revokeObjectURL(audioUrl);
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [audioUrl]);

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

                // Stop all tracks to free mic
                stream.getTracks().forEach((track) => track.stop());
            };

            mediaRecorder.start(200);
            setIsRecording(true);
            setRecordingTime(0);

            timerRef.current = setInterval(() => {
                setRecordingTime((prev) => {
                    if (prev >= 120) {
                        // Max 2 minutes
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

    const handleFormSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!description.trim() && !audioBlob) {
            toast.error("Por favor escribe el detalle de tu mandado o graba una nota de voz.");
            return;
        }

        vibrate(40);
        await onSubmit({
            description: description.trim(),
            storeName: storeName.trim(),
            destinationAddress: destinationAddress.trim() || 'Mi ubicación actual',
            destinationCoords: userLocation || undefined,
            audioBlob: audioBlob || undefined
        });
    };

    return (
        <div className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-md flex flex-col justify-end sm:justify-center items-center p-0 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
            <div className="w-full max-w-lg bg-white rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[88vh] overflow-hidden border border-amber-200/50">
                {/* Header */}
                <div className="bg-gradient-to-r from-amber-400 via-[#FFB800] to-yellow-400 p-5 px-6 flex items-center justify-between shrink-0 shadow-sm">
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="w-10 h-10 rounded-full bg-slate-950/15 hover:bg-slate-950/25 active:scale-95 text-slate-950 flex items-center justify-center transition-transform"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <div>
                            <h2 className="text-lg font-black text-slate-950 leading-tight flex items-center gap-2">
                                Muchacho e' Mandao
                                <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded-full bg-slate-950 text-[#FFB800] tracking-wider">
                                    Subasta Libre
                                </span>
                            </h2>
                            <p className="text-xs text-slate-900/80 font-bold">
                                Detalla tu vuelta y elige la mejor cotización
                            </p>
                        </div>
                    </div>
                    <div className="w-10 h-10 rounded-2xl bg-slate-950 text-[#FFB800] flex items-center justify-center shrink-0 shadow-md">
                        <ShoppingBag className="w-5 h-5" />
                    </div>
                </div>

                {/* Body Content */}
                <form onSubmit={handleFormSubmit} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
                    {/* Campo de Texto Amplio */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center justify-between">
                            <span>¿Qué necesitas que hagan por ti? *</span>
                            <span className="text-[10px] text-slate-400 font-semibold normal-case">Sé lo más claro posible</span>
                        </label>
                        <div className="relative">
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                rows={5}
                                placeholder="Ejemplo: Necesito que pasen por la farmacia a comprar estas 2 medicinas, luego retiren un paquete en la panadería de la esquina y me lo traigan a la casa..."
                                className="w-full bg-slate-50 border-2 border-slate-200 focus:border-amber-400 focus:bg-white rounded-2xl p-3.5 text-sm text-slate-900 font-medium placeholder:text-slate-400 focus:outline-none transition-all resize-none shadow-inner leading-relaxed"
                            />
                        </div>
                    </div>

                    {/* Grabadora de Nota de Voz */}
                    <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Mic className="w-4 h-4 text-amber-700" />
                                <span className="text-xs font-black text-amber-950 uppercase tracking-wide">
                                    Nota de Voz (Opcional)
                                </span>
                            </div>
                            <span className="text-[10px] font-bold text-amber-800/80">
                                ¿Prefieres hablar? Graba tu audio
                            </span>
                        </div>

                        {!audioBlob ? (
                            <div className="flex items-center gap-3">
                                {!isRecording ? (
                                    <button
                                        type="button"
                                        onClick={handleStartRecording}
                                        className="flex-1 py-3 px-4 bg-white hover:bg-amber-100/60 border border-amber-300 rounded-xl text-amber-900 font-black text-xs flex items-center justify-center gap-2 active:scale-98 transition-all shadow-sm"
                                    >
                                        <div className="w-3 h-3 rounded-full bg-rose-500 animate-pulse"></div>
                                        <span>Tocar para grabar nota de voz</span>
                                    </button>
                                ) : (
                                    <div className="flex-1 flex items-center justify-between bg-white border-2 border-rose-400 rounded-xl px-4 py-2.5 shadow-sm">
                                        <div className="flex items-center gap-2">
                                            <div className="w-3 h-3 rounded-full bg-rose-600 animate-ping"></div>
                                            <span className="text-xs font-black text-rose-600">
                                                Grabando... {formatTime(recordingTime)}
                                            </span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleStopRecording}
                                            className="py-1.5 px-3 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs rounded-lg flex items-center gap-1.5 shadow-sm active:scale-95"
                                        >
                                            <Square className="w-3.5 h-3.5 fill-white" />
                                            <span>Detener</span>
                                        </button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            /* Audio Preview Player */
                            <div className="flex items-center justify-between bg-white border border-amber-300 rounded-xl p-3 shadow-sm">
                                <audio
                                    ref={audioPlayerRef}
                                    src={audioUrl || ''}
                                    onEnded={() => setIsPlayingAudio(false)}
                                    className="hidden"
                                />
                                <div className="flex items-center gap-3">
                                    <button
                                        type="button"
                                        onClick={handleTogglePlayAudio}
                                        className="w-9 h-9 rounded-full bg-[#FFB800] text-slate-950 flex items-center justify-center active:scale-95 transition-transform shadow-sm"
                                    >
                                        {isPlayingAudio ? (
                                            <Pause className="w-4 h-4 fill-slate-950" />
                                        ) : (
                                            <Play className="w-4 h-4 fill-slate-950 ml-0.5" />
                                        )}
                                    </button>
                                    <div>
                                        <p className="text-xs font-black text-slate-900">Nota de voz grabada</p>
                                        <p className="text-[10px] font-bold text-slate-500">
                                            {formatTime(recordingTime)} de duración
                                        </p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleDeleteAudio}
                                    className="w-8 h-8 rounded-full bg-slate-100 hover:bg-rose-50 text-slate-400 hover:text-rose-600 flex items-center justify-center transition-colors"
                                    title="Eliminar audio y grabar de nuevo"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Comercio o Punto de Partida */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                            <Store className="w-3.5 h-3.5 text-slate-500" />
                            <span>Comercio o Lugar de Compra (Opcional)</span>
                        </label>
                        <input
                            type="text"
                            value={storeName}
                            onChange={(e) => setStoreName(e.target.value)}
                            placeholder="Ej: Farmatodo, Panadería Central, Mercado..."
                            className="w-full bg-slate-50 border border-slate-200 focus:border-amber-400 focus:bg-white rounded-xl py-3 px-3.5 text-xs text-slate-900 font-medium placeholder:text-slate-400 focus:outline-none transition-all"
                        />
                    </div>

                    {/* Destino de Entrega */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                            <span>¿A dónde te llevamos el mandado? (Destino)</span>
                        </label>
                        <input
                            type="text"
                            value={destinationAddress}
                            onChange={(e) => setDestinationAddress(e.target.value)}
                            placeholder="Dirección exacta de entrega o referencia de tu casa"
                            className="w-full bg-slate-50 border border-slate-200 focus:border-amber-400 focus:bg-white rounded-xl py-3 px-3.5 text-xs text-slate-900 font-medium placeholder:text-slate-400 focus:outline-none transition-all"
                        />
                    </div>

                    {/* Tarjeta de Seguridad y Normas Obligatorias */}
                    <div className="bg-gradient-to-br from-slate-900 via-slate-950 to-amber-950 rounded-2xl p-4 text-white space-y-2.5 border border-amber-500/20 shadow-md">
                        <div className="flex items-center gap-2 text-amber-400 font-black text-xs uppercase tracking-wider border-b border-white/10 pb-2">
                            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                            <span>Normas de Seguridad y Pagos Directos</span>
                        </div>

                        <div className="space-y-2 text-[11px] text-slate-300 font-medium leading-relaxed">
                            <div className="flex items-start gap-2">
                                <CreditCard className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                                <p>
                                    <strong className="text-white">Cero intermediación de compras:</strong> Ningún conductor te pedirá que le envíes dinero de tu compra a su cuenta. Solo le pagarás directamente al negocio donde se hace la compra (por Pago Móvil directo al comercio).
                                </p>
                            </div>

                            <div className="flex items-start gap-2">
                                <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                                <p>
                                    <strong className="text-white">Pago al piloto:</strong> Al recibir tu compra o finalizar la vuelta, le pagarás al conductor su tarifa acordada a sus datos de Pago Móvil o en efectivo. Es importante no retrasarse con el pago del servicio.
                                </p>
                            </div>

                            <div className="flex items-start gap-2">
                                <Star className="w-3.5 h-3.5 text-yellow-400 shrink-0 mt-0.5" />
                                <p>
                                    <strong className="text-white">Calificación y respaldo:</strong> Recuerda dejar tu calificación, estrellas y reseña al finalizar para respaldar a los buenos pilotos.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Botón de Enviar a Subasta */}
                    <div className="pt-1">
                        <button
                            type="submit"
                            disabled={isSubmitting || (!description.trim() && !audioBlob)}
                            className="w-full py-4 px-6 bg-gradient-to-r from-amber-400 via-[#FFB800] to-yellow-400 hover:from-amber-300 hover:to-yellow-300 text-slate-950 font-black text-sm uppercase tracking-wider rounded-2xl shadow-xl shadow-amber-500/25 active:scale-98 transition-all flex items-center justify-center gap-2.5 disabled:opacity-50 disabled:pointer-events-none"
                        >
                            {isSubmitting ? (
                                <div className="flex items-center gap-2">
                                    <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
                                    <span>Publicando Mandado...</span>
                                </div>
                            ) : (
                                <>
                                    <ShoppingBag className="w-4 h-4" />
                                    <span>Publicar Mandado y Recibir Cotizaciones</span>
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
