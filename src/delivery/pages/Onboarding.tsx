import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { registerDriver } from '../../lib/delivery-service';
import { Upload, ChevronRight, CheckCircle2, AlertCircle } from 'lucide-react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';

export default function Onboarding() {
    const { user, userData } = useAuth();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [step, setStep] = useState(1);
    const [error, setError] = useState('');

    const [formData, setFormData] = useState({
        fullName: '',
        age: '',
        cedula: '',
        rif: '',
        phone: '',
        vehicleType: 'moto' as 'moto' | 'carro' | 'bicicleta',
        vehiclePlate: ''
    });

    useEffect(() => {
        if (user) {
            setFormData(prev => ({
                ...prev,
                fullName: prev.fullName || user.displayName || '',
                phone: prev.phone || userData?.phone || ''
            }));
        }
    }, [user, userData]);

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
            if (!files.selfie || !files.vehicle || !files.license) {
                return setError('Debes subir todos los documentos requeridos');
            }
        }
        setStep(p => p + 1);
    };

    const handleSubmit = async () => {
        if (!user || step !== 4) return;
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
                <div className="flex items-center gap-3">
                    <img
                        src="https://firebasestorage.googleapis.com/v0/b/arepa-express-ve-2026.firebasestorage.app/o/arepalogo.png?alt=media"
                        alt="Logo"
                        className="w-10 h-10 object-contain rounded-full shadow-sm"
                    />
                    <div>
                        <h1 className="font-black text-xl text-slate-900 leading-none">Registro de Piloto</h1>
                        <p className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-widest">Paso {step} de 4</p>
                    </div>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-slate-100 h-1.5 rounded-full mt-4 overflow-hidden">
                    <div
                        className="bg-indigo-600 h-full transition-all duration-300 rounded-full"
                        style={{ width: `${(step / 4) * 100}%` }}
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
                                    className="w-full bg-white border-2 border-slate-200 focus:border-indigo-500 rounded-2xl px-4 py-3 outline-none transition-all font-bold text-slate-700"
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
                                        className="w-full bg-white border-2 border-slate-200 focus:border-indigo-500 rounded-2xl px-4 py-3 outline-none transition-all font-bold text-slate-700"
                                        placeholder="Ej: 25"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Cédula</label>
                                    <input
                                        type="text"
                                        value={formData.cedula}
                                        onChange={e => setFormData({ ...formData, cedula: e.target.value })}
                                        className="w-full bg-white border-2 border-slate-200 focus:border-indigo-500 rounded-2xl px-4 py-3 outline-none transition-all font-bold text-slate-700"
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
                                    className="w-full bg-white border-2 border-slate-200 focus:border-indigo-500 rounded-2xl px-4 py-3 outline-none transition-all font-bold text-slate-700"
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
                                    className="w-full bg-white border-2 border-slate-200 focus:border-indigo-500 rounded-2xl px-4 py-3 outline-none transition-all font-bold text-slate-700"
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
                                                ? 'bg-indigo-50 border-indigo-600 text-indigo-700'
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
                                        className="w-full bg-white border-2 border-slate-200 focus:border-indigo-500 rounded-2xl px-4 py-3 outline-none transition-all font-bold text-slate-700"
                                        placeholder="AB123CD"
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {step === 3 && (
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
                                    <div className={`border-2 border-dashed rounded-2xl p-4 flex items-center justify-between transition-all ${doc.state ? 'border-emerald-500 bg-emerald-50' : 'border-slate-300 bg-white hover:border-indigo-400'}`}>
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

                {step === 4 && (
                    <div className="space-y-6 flex-1 animate-fade-in">
                        <div className="w-20 h-20 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-6">
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

                    {step < 4 ? (
                        <button
                            onClick={nextStep}
                            className="flex-1 bg-indigo-600 text-white py-4 rounded-2xl font-black flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 active:scale-95 transition-transform"
                        >
                            Siguiente <ChevronRight className="w-5 h-5" />
                        </button>
                    ) : (
                        <button
                            onClick={handleSubmit}
                            disabled={loading}
                            className="flex-1 bg-indigo-600 text-white py-4 rounded-2xl font-black flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 active:scale-95 transition-transform disabled:opacity-70 disabled:active:scale-100"
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
