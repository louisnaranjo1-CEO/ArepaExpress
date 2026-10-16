import { motion, AnimatePresence } from 'motion/react';
import { MapPin, Navigation, X, ShieldAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useBranding } from '../context/BrandingContext';

interface LocationRequiredModalProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    description?: string;
}

export default function LocationRequiredModal({ 
    isOpen, 
    onClose, 
    title = "Permiso de Ubicación en Tiempo Real", 
    description = "Un 2x3 Conductor recopila datos de ubicación en tiempo real para asignarte servicios cercanos y mostrar tu recorrido al cliente durante el viaje o entrega, incluso cuando la aplicación está en segundo plano." 
}: LocationRequiredModalProps) {
    const { branding } = useBranding();
    const navigate = useNavigate();

    const handleGoToSettings = () => {
        onClose();
        navigate('/profile');
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                    />

                    {/* Modal Content */}
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.9, opacity: 0, y: 20 }}
                        className="relative w-full max-w-md bg-white rounded-3xl overflow-hidden shadow-2xl"
                    >
                        {/* Header Image/Icon */}
                        <div className="h-32 bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center relative">
                            <motion.div
                                animate={{ 
                                    scale: [1, 1.1, 1],
                                    rotate: [0, 5, -5, 0]
                                }}
                                transition={{ duration: 4, repeat: Infinity }}
                                className="bg-white/20 p-4 rounded-full backdrop-blur-md"
                            >
                                <MapPin className="w-12 h-12 text-white" />
                            </motion.div>
                            
                            <button 
                                onClick={onClose}
                                className="absolute top-4 right-4 p-2 bg-black/10 hover:bg-black/20 rounded-full text-white transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 md:p-8 text-center">
                            <h3 className="text-xl font-bold text-gray-900 mb-2">{title}</h3>
                            
                            {/* Google Play Prominent Disclosure Box */}
                            <div className="bg-amber-50 border border-amber-200/80 rounded-2xl p-4 text-left my-4 shadow-xs">
                                <div className="flex items-start gap-3">
                                    <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                                    <div className="text-xs text-amber-950 leading-relaxed font-medium">
                                        <span className="font-bold block mb-1 text-amber-900">Divulgación Destacada (Google Play):</span>
                                        Un 2x3 Conductor recopila datos de ubicación en tiempo real para asignarte servicios cercanos y mostrar tu recorrido al cliente durante el viaje o entrega, incluso cuando la aplicación está en segundo plano o cerrada.
                                    </div>
                                </div>
                            </div>

                            <p className="text-xs text-gray-500 mb-6 leading-relaxed">
                                {description}
                            </p>

                            <div className="space-y-3">
                                <button
                                    onClick={handleGoToSettings}
                                    className="w-full py-3.5 bg-amber-400 text-slate-900 rounded-2xl font-bold shadow-lg shadow-amber-400/20 hover:bg-amber-500 transition-all flex items-center justify-center gap-2 group"
                                >
                                    <Navigation className="w-5 h-5 group-hover:scale-110 transition-transform" />
                                    Entendido y Configurar Ubicación
                                </button>
                                
                                <button
                                    onClick={onClose}
                                    className="w-full py-2.5 text-gray-500 text-sm font-medium hover:text-gray-700 transition-colors"
                                >
                                    Quizás más tarde
                                </button>
                            </div>
                        </div>

                        {/* Privacy Footer */}
                        <div className="px-8 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-center gap-2">
                            <Navigation className="w-4 h-4 text-gray-400" />
                            <span className="text-xs text-gray-400 uppercase tracking-widest font-semibold">Seguridad {branding.app_client_name || 'Un 2x3'}</span>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
