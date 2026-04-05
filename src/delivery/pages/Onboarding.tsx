import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { registerDriver } from '../../lib/delivery-service';
import { logout } from '../../lib/auth-service';
import { Upload, ChevronRight, CheckCircle2, AlertCircle, MapPin, LogOut } from 'lucide-react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { VENEZUELA_DATA, VENEZUELA_STATES } from '../../lib/venezuelaData';
import AddressPicker from '../../components/AddressPicker';

export default function Onboarding() {
    const { user, userData } = useAuth();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [step, setStep] = useState(1);
    const [error, setError] = useState('');
    const [showMap, setShowMap] = useState(false);

    const [formData, setFormData] = useState({
        fullName: '',
        age: '',
        cedula: '',
        rif: '',
        phone: '',
        vehicleType: 'moto' as 'moto' | 'carro' | 'bicicleta',
        vehiclePlate: '',
        homeState: '',
        homeCity: '',
        homeCoords: null as { lat: number; lng: number } | null
    });

    useEffect(() => {
        if (user) {
            setFormData(prev => ({
                ...prev,
                fullName: prev.fullName || user.displayName || ''
            }));
        }
    }, [user]);

    const [files, setFiles] = useState<{
        selfie: File | null;
        vehicle: File | null;
        license: File | null;
    }>({
        selfie: null,
        vehicle: null,
        license: null
    });

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'selfie' | 'vehicle' | 'license') => {
        if (e.target.files && e.target.files[0]) {
            setFiles(prev => ({ ...prev, [type]: e.target.files![0] }));
        }
    };

    const nextStep = () => {
        setError('');
        if (step === 1) {
            if (!formData.fullName || !formData.age || !formData.cedula || !formData.phone) {
                return setError('Por favor completa todos los datos personales');
            }
            if (parseInt(formData.age) < 18) {
                return setError('Debes ser mayor de edad para registrarte');
            }
        } else if (step === 2) {
            if (!formData.rif || !formData.vehiclePlate) {
                return setError('Por favor completa los datos del vehículo y legales');
            }
        } else if (step === 3) {
            if (!formData.homeState || !formData.homeCity) {
                return setError('Por favor selecciona tu estado y ciudad');
            }
        } else if (step === 4) {
            if (!files.selfie || !files.vehicle || !files.license) {
                return setError('Debes subir todos los documentos requeridos');
            }
        }
        setStep(p => p + 1);
    };

    const handleSubmit = async () => {
        if (!user || step !== 5) return;
        setLoading(true);
        setError('');

        try {
            await registerDriver(
                user.uid,
                user.email || '',
                {
                    fullName: formData.fullName,
                    age: parseInt(formData.age),
                    cedula: formData.cedula,
                    rif: formData.rif,
                    phone: formData.phone,
                    vehicleType: formData.vehicleType,
                    vehiclePlate: formData.vehiclePlate,
                    homeLocation: {
                        state: formData.homeState,
                        city: formData.homeCity,
                        coords: formData.homeCoords || undefined
                    }
                },
                {
                    selfie: files.selfie!,
                    vehicle: files.vehicle!,
                    license: files.license!,
                }
            );

            // También actualizar la colección global de usuarios
            await setDoc(doc(db, 'users', user.uid), {
                displayName: formData.fullName,
                phone: formData.phone,
                updatedAt: serverTimestamp()
            }, { merge: true });

            // Forzar recarga completa para que App.tsx detecte el nuevo rol
            window.location.href = '/delivery/pending';

        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Error al enviar solicitud. Intenta de nuevo.');
            setLoading(false);
        }
    };

    return (
        <div className="min-h-[100dvh] bg-slate-50 flex flex-col pb-safe">
            <header className="bg-white px-6 py-4 shadow-sm z-10 sticky top-0">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <img
                            src="https://firebasestorage.googleapis.com/v0/b/arepa-express-ve-2026.firebasestorage.app/o/logo.png?alt=media&token=8acf92ec-b853-4f37-bd82-a4f651bbdcd9"
                            alt="Logo"
                            className="w-10 h-10 object-contain rounded-xl shadow-sm"
                        />
                        <div>
                            <h1 className="font-black text-xl text-slate-900 leading-none">Registro de Piloto</h1>
                            <p className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-widest">Paso {step} de 5</p>
                        </div>
                    </div>

                    <button
                        onClick={async () => {
                            await logout();
                            window.location.href = '/delivery/login';
                        }}
                        className="flex items-center gap-2 text-slate-400 hover:text-red-500 transition-colors"
                    >
                        <LogOut className="w-5 h-5" />
                        <span className="text-xs font-black uppercase tracking-wider hidden sm:inline">Cerrar Sesión</span>
                    </button>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-slate-100 h-1.5 rounded-full mt-4 overflow-hidden">
                    <div
                        className="bg-primary h-full transition-all duration-300 rounded-full"
                        style={{ width: `${(step / 5) * 100}%` }}
                    />
                </div>
            </header>

            <main className="flex-1 p-6 flex flex-col max-w-md mx-auto w-full">
                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-2xl mb-6 text-sm flex gap-3 items-start font-medium animate-shake">
                        <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                        <p>{error}</p>
                    </div>
                )}

                {step === 1 && (
                    <div className="space-y-5 flex-1 animate-fade-in">
                        <h2 className="text-2xl font-black text-slate-800">Datos Personales</h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Nombre Completo</label>
                                <input
                                    type="text"
                                    value={formData.fullName}
                                    onChange={e => setFormData({ ...formData, fullName: e.target.value })}
                                    className="w-full bg-white border-2 border-slate-200 focus:border-primary rounded-2xl px-4 py-3 outline-none transition-all font-bold text-slate-700"
                                    placeholder="Ej: Juan Pérez"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Edad</label>
                                    <input
                                        type="number"
                                        value={formData.age}
                                        onChange={e => setFormData({ ...formData, age: e.target.value })}
                                        className="w-full bg-white border-2 border-slate-200 focus:border-primary rounded-2xl px-4 py-3 outline-none transition-all font-bold text-slate-700"
                                        placeholder="Ej: 25"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Cédula</label>
                                    <input
                                        type="text"
                                        value={formData.cedula}
                                        onChange={e => setFormData({ ...formData, cedula: e.target.value })}
                                        className="w-full bg-white border-2 border-slate-200 focus:border-primary rounded-2xl px-4 py-3 outline-none transition-all font-bold text-slate-700"
                                        placeholder="V-12345678"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Teléfono Móvil (WhatsApp)</label>
                                <input
                                    type="tel"
                                    value={formData.phone}
                                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                    className="w-full bg-white border-2 border-slate-200 focus:border-primary rounded-2xl px-4 py-3 outline-none transition-all font-bold text-slate-700"
                                    placeholder="0414-1234567"
                                />
                            </div>
                        </div>
                    </div>
                )}

                {step === 2 && (
                    <div className="space-y-5 flex-1 animate-fade-in">
                        <h2 className="text-2xl font-black text-slate-800">Vehículo e Info Legal</h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">RIF (Opcional por ahora)</label>
                                <input
                                    type="text"
                                    value={formData.rif}
                                    onChange={e => setFormData({ ...formData, rif: e.target.value })}
                                    className="w-full bg-white border-2 border-slate-200 focus:border-primary rounded-2xl px-4 py-3 outline-none transition-all font-bold text-slate-700"
                                    placeholder="J-12345678-9"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Tipo de Vehículo</label>
                                <div className="grid grid-cols-3 gap-3">
                                    {(['moto', 'carro', 'bicicleta'] as const).map(type => (
                                        <button
                                            key={type}
                                            onClick={() => setFormData({ ...formData, vehicleType: type })}
                                            className={`py-3 px-2 rounded-2xl border-2 font-black text-xs uppercase tracking-wider transition-all ${formData.vehicleType === type
                                                ? 'bg-indigo-50 border-primary text-indigo-700'
                                                : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'
                                                }`}
                                        >
                                            {type}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            {formData.vehicleType !== 'bicicleta' && (
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Placa del Vehículo</label>
                                    <input
                                        type="text"
                                        value={formData.vehiclePlate}
                                        onChange={e => setFormData({ ...formData, vehiclePlate: e.target.value })}
                                        className="w-full bg-white border-2 border-slate-200 focus:border-primary rounded-2xl px-4 py-3 outline-none transition-all font-bold text-slate-700"
                                        placeholder="AB123CD"
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {step === 3 && (
                    <div className="space-y-5 flex-1 animate-fade-in">
                        <h2 className="text-2xl font-black text-slate-800">Ubicación Base</h2>
                        <p className="text-sm font-medium text-slate-500">
                            Solo recibirás pedidos de restaurantes que estén en tu misma ciudad y a máximo 10km de esta ubicación.
                        </p>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">País</label>
                                <input type="text" disabled value="Venezuela" className="w-full bg-slate-100 border-2 border-slate-200 rounded-2xl px-4 py-3 font-bold text-slate-500" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Estado</label>
                                    <select
                                        value={formData.homeState}
                                        onChange={e => {
                                            const newState = e.target.value;
                                            const firstCity = VENEZUELA_DATA[newState]?.[0] || '';
                                            setFormData({ ...formData, homeState: newState, homeCity: firstCity });
                                        }}
                                        className="w-full bg-white border-2 border-slate-200 focus:border-primary text-sm font-bold text-slate-700 rounded-xl px-3 py-3 outline-none"
                                    >
                                        <option value="">Selecciona...</option>
                                        {VENEZUELA_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Ciudad</label>
                                    <select
                                        value={formData.homeCity}
                                        onChange={e => setFormData({ ...formData, homeCity: e.target.value })}
                                        disabled={!formData.homeState}
                                        className="w-full bg-white border-2 border-slate-200 focus:border-primary text-sm font-bold text-slate-700 rounded-xl px-3 py-3 outline-none disabled:bg-slate-50"
                                    >
                                        <option value="">Selecciona...</option>
                                        {formData.homeState && VENEZUELA_DATA[formData.homeState]?.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div className="pt-2">
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Ubicación Exacta (Punto de Partida)</label>
                                {!showMap ? (
                                    <button
                                        onClick={() => setShowMap(true)}
                                        className="w-full py-4 border-2 border-dashed border-indigo-200 rounded-2xl flex flex-col items-center justify-center gap-2 text-slate-900 hover:bg-white transition-colors"
                                    >
                                        {formData.homeCoords ? (
                                            <>
                                                <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                                                    <CheckCircle2 className="w-5 h-5 text-indigo-600" />
                                                </div>
                                                <span className="font-bold text-sm">Ubicación guardada - Toca para cambiar</span>
                                            </>
                                        ) : (
                                            <>
                                                <div className="w-10 h-10 bg-indigo-50 rounded-full flex items-center justify-center group-hover:bg-indigo-100 transition-colors">
                                                    <MapPin className="w-5 h-5 text-indigo-600" />
                                                </div>
                                                <span className="font-bold text-sm">Abrir mapa para fijar ubicación</span>
                                            </>
                                        )}
                                    </button>
                                ) : (
                                    <div className="rounded-2xl overflow-hidden border-2 border-indigo-100 h-[400px]">
                                        <AddressPicker
                                            onClose={() => setShowMap(false)}
                                            onSave={(data) => {
                                                setFormData({ ...formData, homeCoords: { lat: data.lat, lng: data.lng } });
                                                setShowMap(false);
                                            }}
                                            initialData={formData.homeCoords ? { lat: formData.homeCoords.lat, lng: formData.homeCoords.lng, name: 'Mi Ubicación', reference: '' } : undefined}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {step === 4 && (
                    <div className="space-y-5 flex-1 animate-fade-in">
                        <h2 className="text-2xl font-black text-slate-800">Documentación</h2>
                        <p className="text-sm font-medium text-slate-500">Sube fotos claras de tus documentos. Esto es necesario para verificar tu identidad.</p>

                        <div className="space-y-4">
                            {[
                                { id: 'selfie', label: 'Foto Selfie (Rostro claro)', state: files.selfie },
                                { id: 'vehicle', label: 'Foto de tu Vehículo', state: files.vehicle },
                                { id: 'license', label: 'Licencia de Conducir', state: files.license },
                            ].map(doc => (
                                <div key={doc.id} className="relative cursor-pointer">
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={e => handleFileChange(e, doc.id as any)}
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                    />
                                    <div className={`border-2 border-dashed rounded-2xl p-4 flex items-center justify-between transition-all ${doc.state ? 'border-emerald-500 bg-emerald-50' : 'border-slate-300 bg-white hover:border-primary'}`}>
                                        <div className="flex items-center gap-3">
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${doc.state ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                                                {doc.state ? <CheckCircle2 className="w-5 h-5" /> : <Upload className="w-5 h-5" />}
                                            </div>
                                            <div>
                                                <p className={`font-bold text-sm ${doc.state ? 'text-emerald-700' : 'text-slate-700'}`}>{doc.label}</p>
                                                <p className="text-xs font-medium text-slate-400 mt-0.5">{doc.state ? 'Archivo cargado correctamente' : 'Toca para subir imagen'}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {step === 5 && (
                    <div className="space-y-6 flex-1 animate-fade-in">
                        <div className="w-20 h-20 bg-indigo-100 text-primary rounded-full flex items-center justify-center mx-auto mb-6">
                            <CheckCircle2 className="w-10 h-10" />
                        </div>
                        <h2 className="text-center text-3xl font-black text-slate-800">Todo Listo</h2>
                        <p className="text-center text-slate-500 font-medium pb-6 border-b border-slate-200">
                            Revisa nuestros términos y envía tu solicitud. Te notificaremos cuando tu cuenta sea aprobada.
                        </p>
                        <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-4 text-sm font-medium text-slate-600">
                            <p>1. Al aceptar un pedido, me comprometo a <strong>entregarlo en el menor tiempo posible</strong>.</p>
                            <p>2. Esta cuenta es <strong>personal e intransferible</strong>. Solo yo puedo conducir el vehículo registrado.</p>
                            <p>3. Autorizo que se <strong>rastree mi ubicación temporalmente</strong> únicamente mientras esté en ruta hacia un cliente, por motivos de seguridad y eficiencia.</p>
                            <p>4. Cumpliré con las normas de seguridad vial.</p>
                        </div>
                    </div>
                )}

                <div className="mt-8 pt-4 pb-6 sticky bottom-0 bg-slate-50 flex gap-3">
                    {step > 1 && (
                        <button
                            onClick={() => setStep(p => p - 1)}
                            className="px-6 py-4 bg-white border border-slate-200 text-slate-600 rounded-2xl font-black shadow-sm active:scale-95 transition-transform"
                        >
                            Atrás
                        </button>
                    )}

                    {step < 5 ? (
                        <button
                            onClick={nextStep}
                            className="flex-1 bg-primary text-slate-900 py-4 rounded-2xl font-black flex items-center justify-center gap-2 shadow-lg shadow-primary/20 active:scale-95 transition-transform"
                        >
                            Siguiente <ChevronRight className="w-5 h-5" />
                        </button>
                    ) : (
                        <button
                            onClick={handleSubmit}
                            disabled={loading}
                            className="flex-1 bg-primary text-slate-900 py-4 rounded-2xl font-black flex items-center justify-center gap-2 shadow-lg shadow-primary/20 active:scale-95 transition-transform disabled:opacity-70 disabled:active:scale-100"
                        >
                            {loading ? (
                                <div className="w-6 h-6 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                                'Acepto, Enviar Solicitud'
                            )}
                        </button>
                    )}
                </div>
            </main>
        </div>
    );
}
