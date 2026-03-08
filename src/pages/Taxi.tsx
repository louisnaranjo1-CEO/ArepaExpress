import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Car, Bike, MapPin, Navigation, ArrowRight, CheckCircle2 } from 'lucide-react';
import AddressPicker from '../components/AddressPicker';

interface Location {
    lat: number;
    lng: number;
    address: string;
}

export default function Taxi() {
    const { user, userData } = useAuth();
    const navigate = useNavigate();

    const [origin, setOrigin] = useState<Location | null>(null);
    const [destination, setDestination] = useState<Location | null>(null);

    const [pickingFor, setPickingFor] = useState<'origin' | 'destination' | null>(null);
    const [vehicleType, setVehicleType] = useState<'moto' | 'carro' | null>(null);
    const [step, setStep] = useState<'locations' | 'vehicle' | 'searching'>('locations');

    const handleSaveAddress = (data: { name: string; lat: number; lng: number; reference: string }) => {
        const loc: Location = {
            lat: data.lat,
            lng: data.lng,
            address: data.reference ? `${data.name} - ${data.reference}` : data.name
        };

        if (pickingFor === 'origin') setOrigin(loc);
        if (pickingFor === 'destination') setDestination(loc);
        setPickingFor(null);
    };

    const handleRequestTaxi = async () => {
        if (!user || !origin || !destination || !vehicleType) return;

        // Simulate payment/request processing
        setStep('searching');

        try {
            const requestRef = await addDoc(collection(db, 'transport_requests'), {
                userId: user.uid,
                userName: userData?.displayName || user.email,
                userPhone: userData?.phone || '',
                origin,
                destination,
                vehicleType,
                status: 'searching',
                createdAt: serverTimestamp(),
                price: vehicleType === 'moto' ? 2.50 : 5.00, // Fixed price for testing
            });

            // Redirect to tracking page
            setTimeout(() => {
                navigate(`/taxi/track/${requestRef.id}`);
            }, 1000);

        } catch (error) {
            console.error("Error creating transport request:", error);
            alert("No se pudo procesar la solicitud. Intenta de nuevo.");
            setStep('vehicle');
        }
    };

    if (step === 'searching') {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center animate-fade-in relative z-10 bg-white">
                <div className="relative mb-8">
                    <div className="w-32 h-32 bg-primary/10 rounded-full flex items-center justify-center z-10 relative">
                        {vehicleType === 'moto' ? <Bike className="w-12 h-12 text-primary" /> : <Car className="w-12 h-12 text-primary" />}
                    </div>
                    {/* Radar ping animation */}
                    <div className="absolute inset-0 bg-primary rounded-full animate-ping opacity-20"></div>
                </div>
                <h2 className="text-2xl font-black text-slate-800 mb-2">Buscando conductor...</h2>
                <p className="text-slate-500 font-medium">Estamos conectándote con el {vehicleType === 'moto' ? 'mototaxi' : 'taxi'} más cercano.</p>
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-y-auto bg-slate-50 p-6 pb-32 animate-fade-in relative z-10">
            <header className="mb-6">
                <h1 className="text-2xl font-black text-slate-900 tracking-tight">Solicitar Transporte</h1>
                <p className="text-slate-500 font-medium mt-1">Viaja seguro y rápido</p>
            </header>

            {step === 'locations' && (
                <div className="space-y-6 animate-fade-in">
                    {/* Location Selection */}
                    <div className="bg-white p-5 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col gap-4 relative">
                        {/* Connecting line */}
                        <div className="absolute left-[33px] top-[45px] bottom-[45px] w-0.5 bg-slate-100"></div>

                        {/* Origin */}
                        <div
                            className="flex items-center gap-4 cursor-pointer group"
                            onClick={() => setPickingFor('origin')}
                        >
                            <div className="w-10 h-10 bg-slate-50 rounded-full flex flex-shrink-0 items-center justify-center z-10 transition-colors group-hover:bg-primary/10 group-hover:text-primary">
                                <Navigation className="w-5 h-5" />
                            </div>
                            <div className="flex-1 border-b border-slate-100 pb-4">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Punto de Partida</p>
                                <p className={`font-bold truncate ${origin ? 'text-slate-800' : 'text-slate-400'}`}>
                                    {origin ? origin.address : '¿Dónde te encuentras?'}
                                </p>
                            </div>
                        </div>

                        {/* Destination */}
                        <div
                            className="flex items-center gap-4 cursor-pointer group"
                            onClick={() => setPickingFor('destination')}
                        >
                            <div className="w-10 h-10 bg-slate-50 rounded-full flex flex-shrink-0 items-center justify-center z-10 transition-colors group-hover:bg-primary/10 group-hover:text-primary">
                                <MapPin className="w-5 h-5 text-primary" />
                            </div>
                            <div className="flex-1 pt-2">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Destino</p>
                                <p className={`font-bold truncate ${destination ? 'text-slate-800' : 'text-slate-400'}`}>
                                    {destination ? destination.address : '¿A dónde vas?'}
                                </p>
                            </div>
                        </div>
                    </div>

                    <button
                        disabled={!origin || !destination}
                        onClick={() => setStep('vehicle')}
                        className="w-full bg-primary text-white py-4 rounded-2xl font-black shadow-xl shadow-primary/30 flex justify-center items-center gap-2 active:scale-95 transition-all disabled:opacity-50 disabled:active:scale-100"
                    >
                        Continuar <ArrowRight className="w-5 h-5" />
                    </button>
                </div>
            )}

            {step === 'vehicle' && (
                <div className="space-y-6 animate-fade-in relative z-10">
                    <button
                        onClick={() => setStep('locations')}
                        className="text-sm font-bold text-slate-400 mb-2.5 inline-block"
                    >
                        ← Volver a ubicaciones
                    </button>

                    <h2 className="text-xl font-black text-slate-900">Selecciona tu transporte</h2>

                    <div className="grid grid-cols-2 gap-4">
                        <button
                            onClick={() => setVehicleType('moto')}
                            className={`p-5 rounded-[2rem] border-2 transition-all flex flex-col items-center gap-3 ${vehicleType === 'moto' ? 'border-primary bg-primary/5' : 'border-slate-100 bg-white'}`}
                        >
                            <div className={`w-14 h-14 rounded-full flex items-center justify-center ${vehicleType === 'moto' ? 'bg-primary text-white shadow-lg shadow-primary/30' : 'bg-slate-50 text-slate-400'}`}>
                                <Bike className="w-7 h-7" />
                            </div>
                            <div className="text-center">
                                <h3 className={`font-black ${vehicleType === 'moto' ? 'text-primary' : 'text-slate-700'}`}>Mototaxi</h3>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Rápido • 1 Pax</p>
                                <p className="font-black text-slate-800 mt-2">$2.50</p>
                            </div>
                            {vehicleType === 'moto' && <CheckCircle2 className="w-5 h-5 text-primary absolute top-4 right-4" />}
                        </button>

                        <button
                            onClick={() => setVehicleType('carro')}
                            className={`p-5 rounded-[2rem] border-2 transition-all flex flex-col items-center gap-3 relative ${vehicleType === 'carro' ? 'border-primary bg-primary/5' : 'border-slate-100 bg-white'}`}
                        >
                            <div className={`w-14 h-14 rounded-full flex items-center justify-center ${vehicleType === 'carro' ? 'bg-primary text-white shadow-lg shadow-primary/30' : 'bg-slate-50 text-slate-400'}`}>
                                <Car className="w-7 h-7" />
                            </div>
                            <div className="text-center">
                                <h3 className={`font-black ${vehicleType === 'carro' ? 'text-primary' : 'text-slate-700'}`}>Taxi</h3>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Cómodo • 4 Pax</p>
                                <p className="font-black text-slate-800 mt-2">$5.00</p>
                            </div>
                            {vehicleType === 'carro' && <CheckCircle2 className="w-5 h-5 text-primary absolute top-4 right-4" />}
                        </button>
                    </div>

                    <button
                        disabled={!vehicleType}
                        onClick={handleRequestTaxi}
                        className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black shadow-xl flex justify-center items-center gap-2 active:scale-95 transition-all disabled:opacity-50 disabled:active:scale-100 mt-4"
                    >
                        Pagar y Solicitar
                    </button>
                </div>
            )}

            {pickingFor && (
                <AddressPicker
                    onClose={() => setPickingFor(null)}
                    onSave={handleSaveAddress}
                    initialData={pickingFor === 'origin' ? origin : destination}
                />
            )}
        </div>
    );
}
