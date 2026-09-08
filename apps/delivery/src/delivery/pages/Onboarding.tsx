import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { registerDriver } from '../../lib/delivery-service';
import { logout } from '../../lib/auth-service';
import { 
    Upload, 
    ChevronRight, 
    CheckCircle2, 
    AlertCircle, 
    MapPin, 
    LogOut, 
    Cake, 
    ShieldCheck, 
    Car, 
    User, 
    FileText, 
    Check,
    Truck
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { UN2X3_LOGO } from '../../lib/env';
import { VENEZUELA_DATA, VENEZUELA_STATES } from '../../lib/venezuelaData';
import AddressPicker from '../../components/AddressPicker';

// Helper para calcular la edad exacta en base a la fecha de nacimiento
const calculateAge = (birthdateString: string): number => {
    if (!birthdateString) return 0;
    const today = new Date();
    const birth = new Date(birthdateString + 'T00:00:00');
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
        age--;
    }
    return age;
};

export default function Onboarding() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [step, setStep] = useState(1);
    const [error, setError] = useState('');
    const [showMap, setShowMap] = useState(false);

    // Fecha máxima permitida (al menos 18 años cumplidos hoy)
    const today = new Date();
    const maxBirthdate = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate())
        .toISOString()
        .split('T')[0];

    const [formData, setFormData] = useState({
        fullName: '',
        birthdate: '',
        nationality: 'V' as 'V' | 'E',
        cedulaNumber: '',
        phone: '', // 10 dígitos sin el 0 inicial (ej: 4141234567)
        rifType: 'V' as 'V' | 'J' | 'G' | 'E' | 'C',
        rifNumber: '',
        vehicleType: 'moto' as 'moto' | 'carro' | 'bicicleta',
        vehicleBrand: '',
        vehicleModel: '',
        vehicleYear: '',
        vehiclePlate: '',
        vehicleColor: '',
        hasAc: false,
        isVehicleOwner: true,
        homeState: '',
        homeCity: '',
        homeAddressName: '',
        homeAddressReference: '',
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

    // Manejador del teléfono venezolano: auto-eliminar 0 inicial y limitar a 10 dígitos numéricos
    const handlePhoneChange = (val: string) => {
        let digits = val.replace(/\D/g, '');
        if (digits.startsWith('0')) {
            digits = digits.substring(1);
        }
        if (digits.length > 10) {
            digits = digits.slice(0, 10);
        }
        setFormData(prev => ({ ...prev, phone: digits }));
    };

    const calculatedAge = calculateAge(formData.birthdate);
    const fullCedula = `${formData.nationality}-${formData.cedulaNumber.replace(/\D/g, '')}`;
    const fullRif = formData.rifNumber ? `${formData.rifType}-${formData.rifNumber.replace(/[^0-9-]/g, '')}` : '';
    const fullPhone = formData.phone ? `+58${formData.phone}` : '';

    const nextStep = async () => {
        setError('');

        if (step === 1) {
            if (!formData.fullName.trim() || !formData.birthdate || !formData.cedulaNumber.trim() || !formData.phone.trim()) {
                return setError('Por favor completa todos tus datos personales.');
            }
            if (calculatedAge < 18) {
                return setError('Debes tener al menos 18 años para registrarte como conductor.');
            }
            if (formData.phone.length !== 10) {
                return setError('El número celular debe tener exactamente 10 dígitos (sin el 0 inicial, ej: 4141234567).');
            }
            if (formData.cedulaNumber.length < 6) {
                return setError('Ingresa un número de cédula válido (mínimo 6 dígitos).');
            }

            // Validar en Supabase que Cédula y Teléfono no existan en otra cuenta
            try {
                setLoading(true);
                const { data: existingDrivers, error: queryErr } = await supabase
                    .from('drivers')
                    .select('id, cedula, phone')
                    .or(`cedula.eq.${fullCedula},phone.eq.${fullPhone}`);

                if (!queryErr && existingDrivers && existingDrivers.length > 0) {
                    const others = existingDrivers.filter(d => d.id !== user?.uid);
                    if (others.some(d => d.cedula === fullCedula)) {
                        setLoading(false);
                        return setError(`La cédula ${fullCedula} ya se encuentra registrada en otra cuenta.`);
                    }
                    if (others.some(d => d.phone === fullPhone)) {
                        setLoading(false);
                        return setError(`El teléfono ${fullPhone} ya se encuentra registrado en otra cuenta.`);
                    }
                }
            } catch (e) {
                console.warn('Verificación previa omitida:', e);
            } finally {
                setLoading(false);
            }

        } else if (step === 2) {
            if (!formData.rifNumber.trim()) {
                return setError('Por favor ingresa tu número de RIF.');
            }
            if (formData.vehicleType !== 'bicicleta') {
                if (!formData.vehicleBrand.trim() || !formData.vehicleModel.trim() || !formData.vehicleYear.trim() || !formData.vehiclePlate.trim()) {
                    return setError('Por favor completa la marca, modelo, año y placa de tu vehículo.');
                }
                if (!formData.vehicleColor.trim()) {
                    return setError('Por favor indica el color de tu vehículo o moto.');
                }
            }
            if (!formData.isVehicleOwner) {
                return setError('Debes declarar bajo fe de juramento la propiedad o autorización del vehículo para continuar.');
            }

        } else if (step === 3) {
            if (!formData.homeState || !formData.homeCity) {
                return setError('Por favor selecciona tu estado y ciudad de residencia.');
            }
            if (!formData.homeCoords) {
                return setError('Por favor abre el mapa y fija tu ubicación base exacta.');
            }

        } else if (step === 4) {
            if (!files.selfie || !files.vehicle || !files.license) {
                return setError('Debes subir todos los documentos requeridos (Selfie, Vehículo y Licencia).');
            }
        }

        setStep(p => p + 1);
    };

    const handleSubmit = async () => {
        if (!user || step !== 5) return;
        setLoading(true);
        setError('');

        const registeredHomeAddress = {
            state: formData.homeState,
            city: formData.homeCity,
            coords: formData.homeCoords,
            name: formData.homeAddressName || `${formData.homeCity}, ${formData.homeState}`,
            reference: formData.homeAddressReference || '',
            registered_at: new Date().toISOString()
        };

        try {
            await registerDriver(
                user.uid,
                user.email || '',
                {
                    fullName: formData.fullName.trim(),
                    age: calculatedAge,
                    birthdate: formData.birthdate,
                    cedula: fullCedula,
                    rif: fullRif,
                    phone: fullPhone,
                    vehicleType: formData.vehicleType,
                    vehicleBrand: formData.vehicleBrand.trim(),
                    vehicleModel: formData.vehicleModel.trim(),
                    vehicleYear: formData.vehicleYear.trim(),
                    vehiclePlate: formData.vehiclePlate.trim().toUpperCase(),
                    vehicleColor: formData.vehicleColor.trim(),
                    hasAc: formData.vehicleType === 'carro' ? formData.hasAc : false,
                    isVehicleOwner: formData.isVehicleOwner,
                    homeLocation: {
                        state: formData.homeState,
                        city: formData.homeCity,
                        ...(formData.homeCoords ? { coords: formData.homeCoords } : {}),
                        name: formData.homeAddressName,
                        reference: formData.homeAddressReference,
                    },
                    registeredHomeAddress,
                },
                {
                    selfie: files.selfie!,
                    vehicle: files.vehicle!,
                    license: files.license!,
                }
            );

            // Actualizar perfil de usuario en Supabase
            try {
                await supabase.from('profiles').update({
                    full_name: formData.fullName.trim(),
                    phone: fullPhone,
                    birthdate: formData.birthdate,
                    cedula: fullCedula,
                    updated_at: new Date().toISOString()
                }).eq('id', user.uid);
            } catch (err) {
                console.warn('Sync users Supabase:', err);
            }

            // Redirigir a pantalla de verificación pendiente
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
                            src={UN2X3_LOGO}
                            alt="Logo"
                            className="w-10 h-10 object-contain rounded-xl shadow-sm"
                            onError={(e: any) => { e.target.src = '/icon-192.png'; }}
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

                {/* PASO 1: DATOS PERSONALES */}
                {step === 1 && (
                    <div className="space-y-5 flex-1 animate-fade-in">
                        <div>
                            <h2 className="text-2xl font-black text-slate-800">Datos Personales</h2>
                            <p className="text-xs text-slate-500 mt-1">Ingresa tus datos reales exactamente como aparecen en tus documentos.</p>
                        </div>

                        <div className="space-y-4">
                            {/* Nombre Completo */}
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Nombre y Apellido</label>
                                <input
                                    type="text"
                                    value={formData.fullName}
                                    onChange={e => setFormData({ ...formData, fullName: e.target.value })}
                                    className="w-full bg-white border-2 border-slate-200 focus:border-primary rounded-2xl px-4 py-3 outline-none transition-all font-bold text-slate-700"
                                    placeholder="Ej: Juan Vicente Gómez"
                                />
                            </div>

                            {/* Fecha de Nacimiento */}
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                        <Cake className="w-3.5 h-3.5 text-amber-500" />
                                        Fecha de Nacimiento
                                    </label>
                                    {formData.birthdate && (
                                        <span className={`text-xs font-black px-2 py-0.5 rounded-full ${calculatedAge >= 18 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                                            {calculatedAge >= 18 ? `${calculatedAge} años ✓` : `${calculatedAge} años (Menor de edad)`}
                                        </span>
                                    )}
                                </div>
                                <input
                                    type="date"
                                    max={maxBirthdate}
                                    value={formData.birthdate}
                                    onChange={e => setFormData({ ...formData, birthdate: e.target.value })}
                                    className="w-full bg-white border-2 border-slate-200 focus:border-primary rounded-2xl px-4 py-3 outline-none transition-all font-bold text-slate-700"
                                />
                                <p className="text-[11px] text-slate-400 mt-1 font-medium">
                                    🎂 Recibirás beneficios y felicitaciones especiales el día de tu cumpleaños.
                                </p>
                            </div>

                            {/* Cédula de Identidad con selector V / E */}
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Cédula de Identidad</label>
                                <div className="flex items-center">
                                    <div className="flex rounded-l-2xl border-2 border-r-0 border-slate-200 bg-slate-50 overflow-hidden">
                                        <button
                                            type="button"
                                            onClick={() => setFormData(p => ({ ...p, nationality: 'V' }))}
                                            className={`px-3 py-3 font-black text-xs transition-colors ${formData.nationality === 'V' ? 'bg-primary text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}
                                        >
                                            V (Venezolano)
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setFormData(p => ({ ...p, nationality: 'E' }))}
                                            className={`px-3 py-3 font-black text-xs transition-colors ${formData.nationality === 'E' ? 'bg-primary text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}
                                        >
                                            E (Extranjero)
                                        </button>
                                    </div>
                                    <input
                                        type="text"
                                        value={formData.cedulaNumber}
                                        onChange={e => {
                                            const clean = e.target.value.replace(/\D/g, '').slice(0, 9);
                                            setFormData(p => ({ ...p, cedulaNumber: clean }));
                                        }}
                                        placeholder="12345678"
                                        className="w-full bg-white border-2 border-slate-200 focus:border-primary rounded-r-2xl px-4 py-3 outline-none transition-all font-bold text-slate-700"
                                    />
                                </div>
                                <p className="text-[11px] text-slate-400 mt-1 font-medium">Formato: {fullCedula}</p>
                            </div>

                            {/* Teléfono Móvil con prefijo fijo +58 */}
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Teléfono Móvil (WhatsApp)</label>
                                <div className="flex items-center">
                                    <span className="inline-flex items-center gap-1 px-3.5 py-3 rounded-l-2xl border-2 border-r-0 border-slate-200 bg-slate-50 text-slate-700 font-black text-sm select-none">
                                        <span>🇻🇪</span>
                                        <span>+58</span>
                                    </span>
                                    <input
                                        type="tel"
                                        value={formData.phone}
                                        onChange={e => handlePhoneChange(e.target.value)}
                                        maxLength={10}
                                        placeholder="4141234567"
                                        className="w-full bg-white border-2 border-slate-200 focus:border-primary rounded-r-2xl px-4 py-3 outline-none transition-all font-bold text-slate-700"
                                    />
                                </div>
                                <div className="flex items-center justify-between mt-1 text-[11px] text-slate-400 font-medium">
                                    <span>Ingresa 10 dígitos sin el 0 inicial (ej: 4121234567).</span>
                                    <span className={formData.phone.length === 10 ? 'text-emerald-600 font-bold' : ''}>
                                        {formData.phone.length}/10
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* PASO 2: VEHÍCULO E INFO LEGAL */}
                {step === 2 && (
                    <div className="space-y-5 flex-1 animate-fade-in">
                        <div>
                            <h2 className="text-2xl font-black text-slate-800">Vehículo e Info Legal</h2>
                            <p className="text-xs text-slate-500 mt-1">Detalles del transporte que utilizarás para las entregas.</p>
                        </div>

                        <div className="space-y-4">
                            {/* RIF con selector de letra oficial */}
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">RIF (Registro de Información Fiscal)</label>
                                <div className="flex items-center">
                                    <select
                                        value={formData.rifType}
                                        onChange={e => setFormData(p => ({ ...p, rifType: e.target.value as any }))}
                                        className="bg-slate-50 border-2 border-r-0 border-slate-200 text-slate-800 font-black text-sm rounded-l-2xl px-3 py-3 outline-none"
                                    >
                                        <option value="V">V - Natural</option>
                                        <option value="J">J - Jurídico</option>
                                        <option value="G">G - Gubernamental</option>
                                        <option value="E">E - Extranjero</option>
                                        <option value="C">C - Comunal</option>
                                    </select>
                                    <input
                                        type="text"
                                        value={formData.rifNumber}
                                        onChange={e => {
                                            const clean = e.target.value.replace(/[^0-9-]/g, '').slice(0, 11);
                                            setFormData(p => ({ ...p, rifNumber: clean }));
                                        }}
                                        placeholder="12345678-0"
                                        className="w-full bg-white border-2 border-slate-200 focus:border-primary rounded-r-2xl px-4 py-3 outline-none transition-all font-bold text-slate-700"
                                    />
                                </div>
                                <p className="text-[11px] text-slate-400 mt-1 font-medium">Ejemplo: {formData.rifType}-{formData.rifNumber || '12345678-9'}</p>
                            </div>

                            {/* Tipo de Vehículo */}
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Tipo de Vehículo</label>
                                <div className="grid grid-cols-3 gap-3">
                                    {(['moto', 'carro', 'bicicleta'] as const).map(type => (
                                        <button
                                            key={type}
                                            type="button"
                                            onClick={() => setFormData({ ...formData, vehicleType: type })}
                                            className={`py-3 px-2 rounded-2xl border-2 font-black text-xs uppercase tracking-wider transition-all ${formData.vehicleType === type
                                                ? 'bg-primary/10 border-primary text-slate-900 shadow-sm'
                                                : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'
                                                }`}
                                        >
                                            {type}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Detalles del vehículo cuando es Moto o Carro */}
                            {formData.vehicleType !== 'bicicleta' && (
                                <div className="space-y-3 pt-1">
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Marca</label>
                                            <input
                                                type="text"
                                                value={formData.vehicleBrand}
                                                onChange={e => setFormData({ ...formData, vehicleBrand: e.target.value })}
                                                className="w-full bg-white border-2 border-slate-200 focus:border-primary rounded-2xl px-4 py-3 outline-none transition-all font-bold text-slate-700"
                                                placeholder={formData.vehicleType === 'moto' ? 'Ej: Bera / Empire' : 'Ej: Chevrolet'}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Modelo</label>
                                            <input
                                                type="text"
                                                value={formData.vehicleModel}
                                                onChange={e => setFormData({ ...formData, vehicleModel: e.target.value })}
                                                className="w-full bg-white border-2 border-slate-200 focus:border-primary rounded-2xl px-4 py-3 outline-none transition-all font-bold text-slate-700"
                                                placeholder={formData.vehicleType === 'moto' ? 'Ej: SBR 150 / Horse' : 'Ej: Aveo / Spark'}
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Año</label>
                                            <input
                                                type="number"
                                                min={1990}
                                                max={new Date().getFullYear() + 1}
                                                value={formData.vehicleYear}
                                                onChange={e => setFormData({ ...formData, vehicleYear: e.target.value })}
                                                className="w-full bg-white border-2 border-slate-200 focus:border-primary rounded-2xl px-4 py-3 outline-none transition-all font-bold text-slate-700"
                                                placeholder="Ej: 2023"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Placa</label>
                                            <input
                                                type="text"
                                                value={formData.vehiclePlate}
                                                onChange={e => setFormData({ ...formData, vehiclePlate: e.target.value.toUpperCase() })}
                                                className="w-full bg-white border-2 border-slate-200 focus:border-primary rounded-2xl px-4 py-3 outline-none transition-all font-bold text-slate-700 uppercase"
                                                placeholder="AB123CD"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                                            Color de la {formData.vehicleType === 'moto' ? 'Moto' : 'Unidad / Carro'}
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.vehicleColor}
                                            onChange={e => setFormData({ ...formData, vehicleColor: e.target.value })}
                                            className="w-full bg-white border-2 border-slate-200 focus:border-primary rounded-2xl px-4 py-3 outline-none transition-all font-bold text-slate-700"
                                            placeholder="Ej: Blanco, Negro, Rojo, Azul, Gris..."
                                        />
                                    </div>

                                    {formData.vehicleType === 'carro' && (
                                        <div className="bg-slate-50 border-2 border-slate-200 rounded-2xl p-3.5 flex items-center justify-between transition-all hover:border-slate-300">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl transition-colors ${formData.hasAc ? 'bg-cyan-100 text-cyan-600' : 'bg-slate-200 text-slate-400'}`}>
                                                    ❄️
                                                </div>
                                                <div>
                                                    <p className="text-xs font-black text-slate-800">Aire Acondicionado (A/C)</p>
                                                    <p className="text-[11px] text-slate-500 font-medium">
                                                        {formData.hasAc ? 'Cuenta con A/C operativo' : 'Sin aire acondicionado'}
                                                    </p>
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setFormData(prev => ({ ...prev, hasAc: !prev.hasAc }))}
                                                className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
                                                    formData.hasAc
                                                        ? 'bg-cyan-500 text-white shadow-md shadow-cyan-500/20'
                                                        : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                                                }`}
                                            >
                                                {formData.hasAc ? 'Sí tiene ✓' : 'No tiene'}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Declaración Jurada de Propiedad */}
                            <div className="bg-amber-50/80 border border-amber-200/90 rounded-2xl p-4 mt-2">
                                <label className="flex items-start gap-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={formData.isVehicleOwner}
                                        onChange={e => setFormData({ ...formData, isVehicleOwner: e.target.checked })}
                                        className="mt-1 w-5 h-5 rounded border-amber-300 text-amber-600 focus:ring-amber-500 cursor-pointer shrink-0"
                                    />
                                    <span className="text-xs text-slate-700 font-semibold leading-relaxed">
                                        Declaro bajo fe de juramento que este vehículo es de mi propiedad o cuento con la debida autorización legal y vigente de su propietario para operarlo en la plataforma.
                                    </span>
                                </label>
                            </div>
                        </div>
                    </div>
                )}

                {/* PASO 3: UBICACIÓN BASE (CON MAPA LEAFLET) */}
                {step === 3 && (
                    <div className="space-y-5 flex-1 animate-fade-in">
                        <div>
                            <h2 className="text-2xl font-black text-slate-800">Ubicación Base</h2>
                            <p className="text-sm font-medium text-slate-500">
                                Tu dirección de residencia quedará registrada permanentemente para auditoría y asignación de despachos cercanos en tu ciudad.
                            </p>
                        </div>

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
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                                    Punto Exacto de Partida (Mapa Satelital / GPS)
                                </label>
                                {!showMap ? (
                                    <div className="space-y-3">
                                        <button
                                            type="button"
                                            onClick={() => setShowMap(true)}
                                            className="w-full py-4 border-2 border-dashed border-indigo-200 hover:border-primary rounded-2xl flex flex-col items-center justify-center gap-2 text-slate-900 bg-white hover:bg-slate-50 transition-colors"
                                        >
                                            {formData.homeCoords ? (
                                                <>
                                                    <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
                                                        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                                                    </div>
                                                    <span className="font-bold text-sm text-slate-800">Ubicación fijada con éxito ✓</span>
                                                    <span className="text-xs text-indigo-600 font-semibold">Toca para reubicar en el mapa</span>
                                                </>
                                            ) : (
                                                <>
                                                    <div className="w-10 h-10 bg-indigo-50 rounded-full flex items-center justify-center">
                                                        <MapPin className="w-5 h-5 text-indigo-600" />
                                                    </div>
                                                    <span className="font-bold text-sm">Abrir mapa para fijar ubicación exacta</span>
                                                    <span className="text-xs text-slate-400">Permite detectar tu GPS o mover el pin</span>
                                                </>
                                            )}
                                        </button>

                                        {formData.homeCoords && (
                                            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs space-y-1">
                                                <div className="font-bold text-emerald-800 flex items-center gap-1.5">
                                                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                                                    <span>Coordenadas GPS fijadas: {formData.homeCoords.lat.toFixed(5)}, {formData.homeCoords.lng.toFixed(5)}</span>
                                                </div>
                                                {formData.homeAddressName && (
                                                    <p className="text-slate-600"><strong className="text-slate-700">Lugar:</strong> {formData.homeAddressName}</p>
                                                )}
                                                {formData.homeAddressReference && (
                                                    <p className="text-slate-600"><strong className="text-slate-700">Referencia:</strong> {formData.homeAddressReference}</p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="rounded-2xl overflow-hidden border-2 border-indigo-100 h-[420px] relative shadow-lg">
                                        <AddressPicker
                                            onClose={() => setShowMap(false)}
                                            onSave={(data) => {
                                                setFormData(prev => ({
                                                    ...prev,
                                                    homeCoords: { lat: data.lat, lng: data.lng },
                                                    homeAddressName: data.name,
                                                    homeAddressReference: data.reference
                                                }));
                                                setShowMap(false);
                                            }}
                                            initialData={formData.homeCoords ? {
                                                lat: formData.homeCoords.lat,
                                                lng: formData.homeCoords.lng,
                                                name: formData.homeAddressName || 'Mi Casa',
                                                reference: formData.homeAddressReference || ''
                                            } : undefined}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* PASO 4: DOCUMENTACIÓN */}
                {step === 4 && (
                    <div className="space-y-5 flex-1 animate-fade-in">
                        <div>
                            <h2 className="text-2xl font-black text-slate-800">Documentación</h2>
                            <p className="text-sm font-medium text-slate-500">Sube fotos legibles de tus documentos. Esto es necesario para verificar tu cuenta.</p>
                        </div>

                        <div className="space-y-4">
                            {[
                                { id: 'selfie', label: 'Foto Selfie (Rostro claro y visible)', state: files.selfie },
                                { id: 'vehicle', label: 'Foto de tu Vehículo con Placa', state: files.vehicle },
                                { id: 'license', label: 'Licencia de Conducir / Certificado Médico', state: files.license },
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
                                                <p className="text-xs font-medium text-slate-400 mt-0.5">
                                                    {doc.state ? 'Archivo cargado correctamente ✓' : 'Toca para seleccionar o tomar foto'}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* PASO 5: REVISIÓN Y ENVÍO */}
                {step === 5 && (
                    <div className="space-y-6 flex-1 animate-fade-in">
                        <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                            <CheckCircle2 className="w-8 h-8" />
                        </div>
                        <div className="text-center">
                            <h2 className="text-2xl font-black text-slate-800">Revisión Final y Términos</h2>
                            <p className="text-xs text-slate-500 mt-1">Verifica tus datos antes de enviar la solicitud.</p>
                        </div>

                        {/* Resumen de Datos Registrados */}
                        <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-3 text-xs">
                            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                                <span className="text-slate-400 font-bold uppercase">Piloto</span>
                                <span className="font-bold text-slate-800">{formData.fullName} ({calculatedAge} años)</span>
                            </div>
                            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                                <span className="text-slate-400 font-bold uppercase">Cédula & RIF</span>
                                <span className="font-bold text-slate-800">{fullCedula} • {fullRif}</span>
                            </div>
                            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                                <span className="text-slate-400 font-bold uppercase">Teléfono</span>
                                <span className="font-bold text-slate-800">{fullPhone}</span>
                            </div>
                            <div className="flex justify-between items-start pb-2 border-b border-slate-100">
                                <span className="text-slate-400 font-bold uppercase">Vehículo</span>
                                <div className="text-right">
                                    <span className="font-bold text-slate-800 capitalize block">
                                        {formData.vehicleType} {formData.vehicleBrand ? `• ${formData.vehicleBrand} ${formData.vehicleModel || ''}` : ''}
                                    </span>
                                    {(formData.vehiclePlate || formData.vehicleColor) && (
                                        <span className="text-[11px] text-slate-500 font-semibold block">
                                            {formData.vehiclePlate ? `Placa: ${formData.vehiclePlate}` : ''}
                                            {formData.vehiclePlate && formData.vehicleColor ? ' • ' : ''}
                                            {formData.vehicleColor ? `Color: ${formData.vehicleColor}` : ''}
                                        </span>
                                    )}
                                    {formData.vehicleType === 'carro' && (
                                        <span className={`text-[10px] font-bold inline-block mt-0.5 px-2 py-0.5 rounded-full ${
                                            formData.hasAc ? 'bg-cyan-50 text-cyan-700' : 'bg-slate-100 text-slate-500'
                                        }`}>
                                            {formData.hasAc ? '❄️ Con A/C' : 'Sin A/C'}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                                <span className="text-slate-400 font-bold uppercase">Ubicación Base</span>
                                <span className="font-bold text-slate-800">{formData.homeCity}, {formData.homeState}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-slate-400 font-bold uppercase">Documentos</span>
                                <span className="font-bold text-emerald-600">3 de 3 adjuntados ✓</span>
                            </div>
                        </div>

                        {/* Términos y Condiciones */}
                        <div className="bg-slate-100/70 p-4 rounded-2xl border border-slate-200 space-y-2 text-xs font-medium text-slate-600">
                            <p>1. Me comprometo a entregar los pedidos con <strong>máxima rapidez y seguridad</strong>.</p>
                            <p>2. Esta cuenta es <strong>personal e intransferible</strong>. Solo yo conduciré el vehículo registrado.</p>
                            <p>3. Autorizo el <strong>rastreo temporal de ubicación GPS</strong> durante las rutas asignadas para resguardo y soporte.</p>
                            <p>4. He declarado bajo fe de juramento la propiedad o debida autorización del vehículo.</p>
                        </div>
                    </div>
                )}

                {/* CONTROLES INFERIORES */}
                <div className="mt-8 pt-4 pb-6 sticky bottom-0 bg-slate-50 flex gap-3">
                    {step > 1 && (
                        <button
                            type="button"
                            onClick={() => setStep(p => p - 1)}
                            className="px-6 py-4 bg-white border border-slate-200 text-slate-600 rounded-2xl font-black shadow-sm active:scale-95 transition-transform"
                        >
                            Atrás
                        </button>
                    )}

                    {step < 5 ? (
                        <button
                            type="button"
                            onClick={nextStep}
                            disabled={loading}
                            className="flex-1 bg-primary text-slate-900 py-4 rounded-2xl font-black flex items-center justify-center gap-2 shadow-lg shadow-primary/20 active:scale-95 transition-transform disabled:opacity-70"
                        >
                            {loading ? (
                                <div className="w-5 h-5 border-2 border-slate-900 border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                                <>
                                    Siguiente <ChevronRight className="w-5 h-5" />
                                </>
                            )}
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={handleSubmit}
                            disabled={loading}
                            className="flex-1 bg-primary text-slate-900 py-4 rounded-2xl font-black flex items-center justify-center gap-2 shadow-lg shadow-primary/20 active:scale-95 transition-transform disabled:opacity-70 disabled:active:scale-100"
                        >
                            {loading ? (
                                <div className="w-6 h-6 border-4 border-slate-900 border-t-transparent rounded-full animate-spin"></div>
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
