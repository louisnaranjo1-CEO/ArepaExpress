import { motion, AnimatePresence } from 'motion';
import { MapPin, Navigation, X, ShieldAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface LocationRequiredModalProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    description?: string;
}

export default function LocationRequiredModal({ 
    isOpen, 
    onClose, 
    title = "Ubicación Requerida", 
    description = "Para poder brindarte un servicio preciso de transporte o delivery, necesitamos acceder a tu ubicación en tiempo real." 
}: LocationRequiredModalProps) {
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
                        <div className="h-32 bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center relative">
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

                        <div className="p-8 text-center">
                            <h3 className="text-2xl font-bold text-gray-900 mb-3">{title}</h3>
                            <p className="text-gray-600 mb-8 leading-relaxed">
                                {description}
                                <br />
                                <span className="text-sm font-medium text-primary mt-2 block italic">
                                    "Tu privacidad es nuestra prioridad, puedes apagarla cuando gustes."
                                </span>
                            </p>

                            <div className="space-y-4">
                                <button
                                    onClick={handleGoToSettings}
                                    className="w-full py-4 bg-primary text-white rounded-2xl font-bold shadow-lg shadow-primary/30 hover:bg-primary-dark transition-all flex items-center justify-center gap-2 group"
                                >
                                    <ShieldAlert className="w-5 h-5 group-hover:scale-110 transition-transform" />
                                    Activar Ubicación en Perfil
                                </button>
                                
                                <button
                                    onClick={onClose}
                                    className="w-full py-3 text-gray-500 font-medium hover:text-gray-700 transition-colors"
                                >
                                    Quizás más tarde
                                </button>
                            </div>
                        </div>

                        {/* Privacy Footer */}
                        <div className="px-8 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-center gap-2">
                            <Navigation className="w-4 h-4 text-gray-400" />
                            <span className="text-xs text-gray-400 uppercase tracking-widest font-semibold">Seguridad Arepa Express</span>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
