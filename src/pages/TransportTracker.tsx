import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { MapPin, Navigation, ArrowLeft, Star, Phone, ShieldCheck } from 'lucide-react';

export default function TransportTracker() {
    const { orderId } = useParams();
    const { user } = useAuth();
    const navigate = useNavigate();
    const [request, setRequest] = useState<any>(null);
    const [driverLocation, setDriverLocation] = useState<{ lat: number, lng: number } | null>(null);
    const [loading, setLoading] = useState(true);
    const [rating, setRating] = useState(0);

    useEffect(() => {
        if (!orderId) return;

        const unsub = onSnapshot(doc(db, 'transport_requests', orderId), (docSnap) => {
            if (docSnap.exists()) {
                setRequest({ id: docSnap.id, ...docSnap.data() });
            }
            setLoading(false);
        });

        return () => unsub();
    }, [orderId]);

    // Simulate driver location updates for the UI progress bar (in a real app this would come from the driver mapping document)
    // We will just derive a progress percentage based on status for now.
    const getProgress = () => {
        if (!request) return 0;
        switch (request.status) {
            case 'searching': return 10;
            case 'accepted': return 30; // Driver assigned, moving to origin
            case 'arriving': return 90; // Driver is very close to origin
            case 'in_progress': return 50; // In transit to destination
            case 'completed': return 100;
            default: return 0;
        }
    };

    const handleRate = async () => {
        if (!request || !orderId || rating === 0) return;
        await updateDoc(doc(db, 'transport_requests', orderId), { rating });
        navigate('/');
    };

    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center bg-slate-50">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    if (!request) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 p-6 text-center">
                <p className="text-slate-500 font-bold">Solicitud no encontrada.</p>
                <button onClick={() => navigate('/')} className="mt-4 text-primary font-bold">Volver al inicio</button>
            </div>
        );
    }

    const progress = getProgress();

    return (
        <div className="flex-1 flex flex-col bg-slate-50 relative">
            {/* Header / Map placeholder area */}
            <div className="h-[40vh] bg-slate-200 relative overflow-hidden">
                {/* Simulated Map Background */}
                <div className="absolute inset-0 opacity-50" style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/cubes.png")' }}></div>

                <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between z-10 bg-gradient-to-b from-black/50 to-transparent">
                    <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="px-4 py-2 bg-white/20 backdrop-blur-md rounded-full text-white font-black text-sm">
                        Ayuda
                    </div>
                </div>

                {/* Simulated Map Pins */}
                <div className="absolute top-1/2 left-1/3 w-12 h-12 bg-primary/20 rounded-full flex items-center justify-center animate-pulse">
                    <div className="w-4 h-4 bg-primary rounded-full border-2 border-white"></div>
                </div>
                <div className="absolute bottom-1/4 right-1/4">
                    <MapPin className="w-8 h-8 text-indigo-600 drop-shadow-lg" />
                </div>
            </div>

            {/* Content Drawer */}
            <div className="flex-1 bg-white -mt-6 rounded-t-[2rem] shadow-[0_-10px_40px_rgba(0,0,0,0.1)] relative z-20 flex flex-col pt-2 px-6 pb-safe">
                <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-6"></div>

                {request.status === 'completed' ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center animate-fade-in py-10">
                        <div className="w-20 h-20 bg-emerald-100 text-emerald-500 rounded-full flex items-center justify-center mb-4">
                            <ShieldCheck className="w-10 h-10" />
                        </div>
                        <h2 className="text-2xl font-black text-slate-900 mb-2">Viaje Completado</h2>
                        <p className="text-slate-500 font-medium mb-8">Esperamos que hayas tenido un excelente viaje. Por favor califica a tu conductor.</p>

                        <div className="flex gap-2 mb-8">
                            {[1, 2, 3, 4, 5].map((star) => (
                                <button key={star} onClick={() => setRating(star)} className="focus:outline-none">
                                    <Star className={`w-10 h-10 transition-colors ${rating >= star ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`} />
                                </button>
                            ))}
                        </div>

                        <button
                            onClick={handleRate}
                            disabled={rating === 0}
                            className="w-full bg-primary text-white py-4 rounded-2xl font-black disabled:opacity-50"
                        >
                            Calificar y Finalizar
                        </button>
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col">
                        <div className="mb-6">
                            <h2 className="text-2xl font-black text-slate-900 mb-1">
                                {request.status === 'searching' && 'Buscando conductor...'}
                                {request.status === 'accepted' && 'El conductor va en camino'}
                                {request.status === 'arriving' && '¡El conductor ha llegado!'}
                                {request.status === 'in_progress' && 'En viaje al destino'}
                            </h2>
                            <p className="text-slate-500 font-medium">
                                {request.vehicleType === 'moto' ? 'Mototaxi' : 'Taxi'} • {request.origin?.address.split(',')[0]}
                            </p>
                        </div>

                        {/* Progress Bar */}
                        <div className="w-full h-2 bg-slate-100 rounded-full mb-8 overflow-hidden">
                            <div
                                className="h-full bg-primary transition-all duration-1000 ease-out"
                                style={{ width: `${progress}%` }}
                            ></div>
                        </div>

                        {request.driverId ? (
                            <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100 mb-6">
                                <div className="w-12 h-12 bg-slate-200 rounded-full overflow-hidden shrink-0">
                                    <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${request.driverId}`} alt="Driver" className="w-full h-full object-cover" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-black text-slate-900 truncate">El Conductor</h3>
                                    <div className="flex items-center gap-1 text-xs font-bold text-amber-500">
                                        <Star className="w-3.5 h-3.5 fill-current" /> 4.9
                                    </div>
                                </div>
                                <a href="tel:0000" className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-primary shadow-sm border border-slate-100 shrink-0">
                                    <Phone className="w-4 h-4 fill-current" />
                                </a>
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-center opacity-50 py-10">
                                <div className="w-16 h-16 border-4 border-slate-200 border-t-primary rounded-full animate-spin mb-4"></div>
                                <p className="font-bold text-slate-400 uppercase tracking-widest text-sm">Buscando conductores cercanos</p>
                            </div>
                        )}

                        {/* Location Summary */}
                        <div className="mt-auto space-y-4 pt-4 border-t border-slate-100">
                            <div className="flex gap-3">
                                <div className="w-6 flex flex-col items-center shrink-0">
                                    <div className="w-4 h-4 rounded-full border-4 border-primary"></div>
                                    <div className="w-0.5 h-8 bg-slate-200 my-1"></div>
                                </div>
                                <div className="pb-4">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Recogida</p>
                                    <p className="font-bold text-slate-800 text-sm line-clamp-1">{request.origin?.address}</p>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <div className="w-6 flex justify-center shrink-0">
                                    <MapPin className="w-5 h-5 text-indigo-500" />
                                </div>
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Destino</p>
                                    <p className="font-bold text-slate-800 text-sm line-clamp-1">{request.destination?.address}</p>
                                </div>
                            </div>
                        </div>

                    </div>
                )}
            </div>
        </div>
    );
}
