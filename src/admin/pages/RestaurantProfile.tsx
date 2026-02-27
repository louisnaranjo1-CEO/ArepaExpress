import React, { useState, useEffect } from 'react';
import { Store, MapPin, Phone, Truck, Save, Plus, Trash2, Loader2, Check } from 'lucide-react';
import { db } from '../../lib/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';

interface Location {
    address: string;
    city: string;
    coords?: { lat: number; lng: number };
}

export default function RestaurantProfile() {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    // Form states
    const [name, setName] = useState('');
    const [rif, setRif] = useState('');
    const [whatsapp, setWhatsapp] = useState('');
    const [ownDelivery, setOwnDelivery] = useState(false);
    const [deliveryTime, setDeliveryTime] = useState('30-45 min');
    const [locations, setLocations] = useState<Location[]>([]);

    useEffect(() => {
        if (!user) return;

        const fetchRestaurant = async () => {
            try {
                const docRef = doc(db, 'restaurants', user.uid);
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    const data = docSnap.data();
                    setName(data.name || '');
                    setRif(data.rif || '');
                    setWhatsapp(data.whatsapp || '');
                    setOwnDelivery(data.ownDelivery || false);
                    setDeliveryTime(data.deliveryTime || '30-45 min');
                    setLocations(data.locations || []);
                }
            } catch (error) {
                console.error("Error fetching restaurant:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchRestaurant();
    }, [user]);

    const handleSave = async () => {
        if (!user) return;
        setSaving(true);
        try {
            const docRef = doc(db, 'restaurants', user.uid);
            await updateDoc(docRef, {
                name,
                rif,
                whatsapp,
                ownDelivery,
                deliveryTime,
                locations,
                updatedAt: new Date()
            });
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch (error) {
            console.error("Error updating restaurant:", error);
            alert("Error al guardar los cambios");
        } finally {
            setSaving(false);
        }
    };

    const addLocation = () => {
        setLocations([...locations, { address: '', city: 'Caracas' }]);
    };

    const removeLocation = (index: number) => {
        setLocations(locations.filter((_, i) => i !== index));
    };

    const updateLocation = (index: number, field: keyof Location, value: string) => {
        const newLocations = [...locations];
        (newLocations[index] as any)[field] = value;
        setLocations(newLocations);
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px]">
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
                <p className="mt-4 text-slate-500 font-bold">Cargando configuración...</p>
            </div>
        );
    }

    return (
        <div className="max-w-4xl space-y-8 animate-in fade-in duration-700 pb-20">
            <div className="flex justify-between items-end flex-wrap gap-4">
                <div>
                    <h1 className="text-3xl font-black text-slate-900">Configuración del Negocio</h1>
                    <p className="text-slate-500 font-medium">Gestiona la información pública de tu restaurante.</p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className={`px-6 py-3 rounded-2xl font-black shadow-lg flex items-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70 ${saved ? 'bg-green-500 text-white shadow-green-500/20' : 'bg-primary text-white shadow-primary/20'
                        }`}
                >
                    {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : saved ? <Check className="w-5 h-5" /> : <Save className="w-5 h-5" />}
                    <span>{saving ? 'Guardando...' : saved ? '¡Guardado!' : 'Guardar Cambios'}</span>
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Left Column: Logo & Main Info */}
                <div className="md:col-span-2 space-y-6">
                    <section className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-100 space-y-6">
                        <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                            <Store className="w-6 h-6 text-primary" />
                            Información Principal
                        </h2>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-500 ml-2">Nombre del Negocio</label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="w-full bg-slate-50 border-2 border-transparent focus:border-primary focus:bg-white p-4 rounded-2xl outline-none transition-all font-bold text-slate-700"
                                    placeholder="Ej: Arepa Express"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-500 ml-2">RIF</label>
                                <input
                                    type="text"
                                    value={rif}
                                    onChange={(e) => setRif(e.target.value)}
                                    className="w-full bg-slate-50 border-2 border-transparent focus:border-primary focus:bg-white p-4 rounded-2xl outline-none transition-all font-bold text-slate-700"
                                    placeholder="Ej: J-12345678-9"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-bold text-slate-500 ml-2">WhatsApp de Pedidos</label>
                            <div className="relative">
                                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                                <input
                                    type="text"
                                    value={whatsapp}
                                    onChange={(e) => setWhatsapp(e.target.value)}
                                    className="w-full bg-slate-50 border-2 border-transparent focus:border-primary focus:bg-white p-4 pl-12 rounded-2xl outline-none transition-all font-bold text-slate-700"
                                    placeholder="Ej: +58 412 1234567"
                                />
                            </div>
                        </div>
                    </section>

                    <section className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-100 space-y-6">
                        <div className="flex justify-between items-center">
                            <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                                <MapPin className="w-6 h-6 text-primary" />
                                Sucursales / Ubicaciones
                            </h2>
                            <button
                                onClick={addLocation}
                                className="text-primary font-bold flex items-center gap-1 hover:underline"
                            >
                                <Plus className="w-4 h-4" />
                                Añadir Sucursal
                            </button>
                        </div>

                        <div className="space-y-4">
                            {locations.length === 0 ? (
                                <div className="p-12 text-center border-2 border-dashed border-slate-100 rounded-[30px] grayscale opacity-50">
                                    <MapPin className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                                    <p className="text-slate-400 font-bold">Añade al menos una ubicación para que los clientes te encuentren.</p>
                                </div>
                            ) : (
                                locations.map((loc, idx) => (
                                    <div key={idx} className="bg-slate-50 p-6 rounded-3xl border border-slate-100 space-y-4 group relative">
                                        <button
                                            onClick={() => removeLocation(idx)}
                                            className="absolute top-4 right-4 p-2 text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                                        >
                                            <Trash2 className="w-5 h-5" />
                                        </button>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Ciudad</label>
                                                <input
                                                    type="text"
                                                    value={loc.city}
                                                    onChange={(e) => updateLocation(idx, 'city', e.target.value)}
                                                    className="w-full bg-white border border-slate-200 p-3 rounded-xl outline-none focus:border-primary font-bold text-slate-700 text-sm"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Dirección Exacta</label>
                                                <input
                                                    type="text"
                                                    value={loc.address}
                                                    onChange={(e) => updateLocation(idx, 'address', e.target.value)}
                                                    className="w-full bg-white border border-slate-200 p-3 rounded-xl outline-none focus:border-primary font-bold text-slate-700 text-sm"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </section>
                </div>

                {/* Right Column: Settings */}
                <div className="space-y-6">
                    <section className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-100 space-y-6">
                        <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                            <Truck className="w-6 h-6 text-primary" />
                            Logística
                        </h2>

                        <div
                            className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl cursor-pointer group"
                            onClick={() => setOwnDelivery(!ownDelivery)}
                        >
                            <span className="font-bold text-slate-700">Delivery Propio</span>
                            <div className={`w-12 h-6 rounded-full relative transition-colors ${ownDelivery ? 'bg-primary' : 'bg-slate-200'}`}>
                                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${ownDelivery ? 'left-7' : 'left-1'}`}></div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-bold text-slate-500 ml-2">Tiempo Prep. Promedio</label>
                            <select
                                value={deliveryTime}
                                onChange={(e) => setDeliveryTime(e.target.value)}
                                className="w-full bg-slate-50 border-2 border-transparent focus:border-primary focus:bg-white p-4 rounded-2xl outline-none transition-all font-bold text-slate-700 appearance-none"
                            >
                                <option value="15-30 min">15-30 min</option>
                                <option value="30-45 min">30-45 min</option>
                                <option value="45-60 min">45-60 min</option>
                                <option value="60+ min">Más de 1 hora</option>
                            </select>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}
