import React, { useState, useEffect, useMemo } from 'react';
import { 
    Phone, 
    ShieldAlert, 
    Ambulance, 
    HeartPulse, 
    Wrench, 
    Car, 
    Flame, 
    ShieldCheck, 
    MapPin, 
    MessageCircle, 
    Search, 
    ArrowLeft,
    Clock, 
    AlertTriangle, 
    LifeBuoy, 
    Sparkles,
    ChevronRight,
    Globe,
    Building2,
    Home
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { vibrate } from '../utils/haptics';

export interface ServiceItem {
    id: string;
    name: string;
    category: 'emergencias' | 'salud' | 'prehospitalaria' | 'vial' | 'oficios' | 'apoyo';
    categoryLabel: string;
    description: string;
    phone: string;
    whatsapp?: string;
    address?: string;
    coords?: { lat: number; lng: number };
    is24Hours: boolean;
    badgeText?: string;
    zone?: string;
    priority?: boolean;
    scope: 'nacional' | 'estado' | 'local';
    city?: string;
    state?: string;
}

const DEFAULT_SERVICES: ServiceItem[] = [
    // 🚨 EMERGENCIAS NACIONALES (Visibles para todos los usuarios)
    {
        id: 'ven-911',
        name: 'VEN 911 - Central de Emergencias',
        category: 'emergencias',
        categoryLabel: 'Emergencias 24/7',
        description: 'Central integral de atención y despacho inmediato para emergencias médicas, seguridad y rescate.',
        phone: '911',
        is24Hours: true,
        badgeText: 'Línea Gratuita',
        priority: true,
        scope: 'nacional',
        zone: 'Nivel Nacional'
    },
    {
        id: 'cicpc-central',
        name: 'CICPC - Denuncias y Urgencias',
        category: 'emergencias',
        categoryLabel: 'Emergencias 24/7',
        description: 'Cuerpo de Investigaciones Científicas, Penales y Criminalísticas.',
        phone: '0800-2427224',
        is24Hours: true,
        badgeText: 'Nacional 24h',
        scope: 'nacional',
        zone: 'Nivel Nacional'
    },
    {
        id: 'transito-pnb-nacional',
        name: 'Tránsito y Auxilio Vial PNB',
        category: 'emergencias',
        categoryLabel: 'Emergencias 24/7',
        description: 'Atención a colisiones, accidentes en autopistas y auxilio vial.',
        phone: '0800-8726748',
        is24Hours: true,
        badgeText: 'Vialidad Activa',
        scope: 'nacional',
        zone: 'Autopistas y Troncales'
    },

    // 🚨 EMERGENCIAS ESTADALES (Guárico / Regional)
    {
        id: 'proteccion-civil-guarico',
        name: 'Protección Civil Guárico',
        category: 'prehospitalaria',
        categoryLabel: 'Pre-Hospitalaria',
        description: 'Atención y rescate en contingencias, crecidas de ríos y contingencias climáticas.',
        phone: '0800-7248451',
        is24Hours: true,
        badgeText: 'Guardia Regional',
        scope: 'estado',
        state: 'Guárico',
        zone: 'Estado Guárico'
    },
    {
        id: 'policia-estadal-guarico',
        name: 'Policía del Estado Guárico (PoliGuárico)',
        category: 'emergencias',
        categoryLabel: 'Emergencias 24/7',
        description: 'Comandancia general de policía estadal y coordinación de cuadrantes.',
        phone: '0246-4311020',
        is24Hours: true,
        badgeText: 'PoliGuárico',
        scope: 'estado',
        state: 'Guárico',
        zone: 'Estado Guárico'
    },

    // 🚨 EMERGENCIAS LOCALES CALABOZO
    {
        id: 'bomberos-calabozo',
        name: 'Cuerpo de Bomberos de Calabozo',
        category: 'emergencias',
        categoryLabel: 'Emergencias 24/7',
        description: 'Combate de incendios, rescate urbano y rescate de emergencia en Calabozo.',
        phone: '0246-8712345',
        whatsapp: '584120000000',
        address: 'Estación de Bomberos, Av. Francisco de Miranda, Calabozo',
        is24Hours: true,
        badgeText: 'Bomberos Calabozo',
        priority: true,
        scope: 'local',
        city: 'Calabozo',
        state: 'Guárico',
        zone: 'Calabozo'
    },
    {
        id: 'hospital-calabozo',
        name: 'Hospital Dr. Rafael Urdaneta Delgado (Calabozo)',
        category: 'salud',
        categoryLabel: 'Clínicas y Salud',
        description: 'Emergencia de adultos, sala de partos, pediatría y trauma shock 24h.',
        phone: '0246-8715566',
        address: 'Carrera 12 con Calle 5, Casco Central, Calabozo',
        is24Hours: true,
        badgeText: 'Hospital Central',
        priority: true,
        scope: 'local',
        city: 'Calabozo',
        state: 'Guárico',
        zone: 'Calabozo'
    },
    {
        id: 'ambulancias-calabozo',
        name: 'Ambulancias y Traslados Calabozo',
        category: 'prehospitalaria',
        categoryLabel: 'Pre-Hospitalaria',
        description: 'Unidad de soporte vital y traslados de pacientes dentro y fuera de Calabozo.',
        phone: '0414-5550199',
        whatsapp: '584145550199',
        is24Hours: true,
        badgeText: 'Ambulancia Local',
        priority: true,
        scope: 'local',
        city: 'Calabozo',
        state: 'Guárico',
        zone: 'Calabozo y Caseríos'
    },
    {
        id: 'clinica-centro-calabozo',
        name: 'Centro Médico Quirúrgico Calabozo',
        category: 'salud',
        categoryLabel: 'Clínicas y Salud',
        description: 'Servicio de laboratorio clínico 24h, rayos X, ecografía de emergencia y pabellón.',
        phone: '0246-8718899',
        whatsapp: '584245551234',
        address: 'Calle 4 entre Carreras 9 y 10, Calabozo',
        is24Hours: true,
        badgeText: 'Clínica Privada',
        scope: 'local',
        city: 'Calabozo',
        state: 'Guárico',
        zone: 'Calabozo'
    },
    {
        id: 'farmacia-calabozo-24h',
        name: 'Farmacia de Turno Calabozo',
        category: 'salud',
        categoryLabel: 'Clínicas y Salud',
        description: 'Medicamentos de urgencia, soluciones fisiológicas e insumos médicos descartables.',
        phone: '0412-8889911',
        whatsapp: '584128889911',
        address: 'Av. Octavio Viana, Local 2, Calabozo',
        is24Hours: true,
        badgeText: 'Turno 24 Horas',
        scope: 'local',
        city: 'Calabozo',
        state: 'Guárico',
        zone: 'Calabozo'
    },
    {
        id: 'gruas-calabozo',
        name: 'Grúas y Auxilio Vial Calabozo 24H',
        category: 'vial',
        categoryLabel: 'Auxilio Vial',
        description: 'Plataforma para remolque de autos, camionetas y camiones en la Carretera Nacional Calabozo.',
        phone: '0424-5112233',
        whatsapp: '584245112233',
        is24Hours: true,
        badgeText: 'Grúas Calabozo',
        scope: 'local',
        city: 'Calabozo',
        state: 'Guárico',
        zone: 'Calabozo y Troncal 2'
    },
    {
        id: 'cerrajero-calabozo',
        name: 'Cerrajería de Urgencia Calabozo 24H',
        category: 'oficios',
        categoryLabel: 'Servicios del Hogar',
        description: 'Apertura de puertas residenciales y vehículos trabados a cualquier hora.',
        phone: '0412-3344556',
        whatsapp: '584123344556',
        is24Hours: true,
        badgeText: 'Cerrajería 24h',
        scope: 'local',
        city: 'Calabozo',
        state: 'Guárico',
        zone: 'A domicilio en Calabozo'
    }
];

export default function Services() {
    const navigate = useNavigate();
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string>('todos');
    const [zoneFilter, setZoneFilter] = useState<'todos' | 'local' | 'nacional'>('todos');
    const [dbServices, setDbServices] = useState<ServiceItem[]>([]);
    const [loading, setLoading] = useState(false);

    const userCity = localStorage.getItem('userCity') || 'Calabozo';
    const userState = localStorage.getItem('userState') || 'Guárico';

    // Fetch emergency services configured by superadmin
    useEffect(() => {
        const fetchDbServices = async () => {
            setLoading(true);
            try {
                const { data, error } = await supabase
                    .from('emergency_services')
                    .select('*')
                    .eq('is_active', true);

                if (data && data.length > 0) {
                    const formatted = data.map((d: any) => ({
                        id: d.id,
                        name: d.name,
                        category: d.category || 'emergencias',
                        categoryLabel: d.category_label || 'Emergencias 24/7',
                        description: d.description || '',
                        phone: d.phone,
                        whatsapp: d.whatsapp,
                        address: d.address,
                        is24Hours: d.is_24_hours ?? true,
                        badgeText: d.badge_text,
                        priority: Boolean(d.priority),
                        scope: d.scope || 'local',
                        city: d.city,
                        state: d.state,
                        zone: d.zone || d.city || 'Local'
                    }));
                    setDbServices(formatted);
                }
            } catch (err) {
                console.warn("Using default emergency directory:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchDbServices();
    }, []);

    // Combine database entries with defaults (avoiding ID duplicates)
    const allServices = useMemo(() => {
        const combined = [...dbServices];
        const existingIds = new Set(combined.map(s => s.id));
        DEFAULT_SERVICES.forEach(s => {
            if (!existingIds.has(s.id)) {
                combined.push(s);
            }
        });
        return combined;
    }, [dbServices]);

    // Categories list
    const categories = [
        { id: 'todos', label: 'Todos', icon: Sparkles },
        { id: 'emergencias', label: '🚨 Emergencias', icon: ShieldAlert },
        { id: 'salud', label: '🏥 Clínicas & Salud', icon: HeartPulse },
        { id: 'prehospitalaria', label: '🚑 Ambulancias', icon: Ambulance },
        { id: 'vial', label: '🚗 Auxilio Vial', icon: Car },
        { id: 'oficios', label: '🛠️ Oficios 24h', icon: Wrench },
    ];

    // Filter services according to user zone and active filters
    const filteredServices = useMemo(() => {
        return allServices.filter((item) => {
            // Zone compatibility check:
            // 1. National numbers always match
            // 2. State numbers match if user state matches
            // 3. Local numbers match if user city matches (or if item.city matches userCity)
            const isNational = item.scope === 'nacional';
            const isSameState = item.scope === 'estado' && (!item.state || item.state.toLowerCase() === userState.toLowerCase());
            const isSameCity = item.scope === 'local' && (!item.city || item.city.toLowerCase() === userCity.toLowerCase());

            const isZoneCompatible = isNational || isSameState || isSameCity;
            if (!isZoneCompatible) return false;

            // Interactive zone filter
            if (zoneFilter === 'local' && (isNational || item.scope === 'estado')) return false;
            if (zoneFilter === 'nacional' && !isNational) return false;

            // Category filter
            const matchesCategory = selectedCategory === 'todos' || item.category === selectedCategory;

            // Search query filter
            const q = searchQuery.toLowerCase().trim();
            const matchesQuery = !q || 
                item.name.toLowerCase().includes(q) || 
                item.description.toLowerCase().includes(q) || 
                item.categoryLabel.toLowerCase().includes(q) ||
                (item.zone && item.zone.toLowerCase().includes(q)) ||
                (item.city && item.city.toLowerCase().includes(q));

            return matchesCategory && matchesQuery;
        });
    }, [allServices, userCity, userState, zoneFilter, selectedCategory, searchQuery]);

    const handleCall = (phone: string) => {
        vibrate(40);
        window.location.href = `tel:${phone.replace(/[^0-9+]/g, '')}`;
    };

    const handleWhatsApp = (wa: string, name: string) => {
        vibrate(30);
        const text = encodeURIComponent(`Hola, me comunico a través de Un 2x3 para solicitar asistencia de ${name}.`);
        window.open(`https://wa.me/${wa.replace(/[^0-9]/g, '')}?text=${text}`, '_blank');
    };

    return (
        <div className="min-h-full bg-slate-50 flex flex-col pb-24 overflow-y-auto hide-scrollbar">
            {/* Header Hero */}
            <div className="bg-gradient-to-br from-rose-700 via-red-700 to-slate-900 text-white px-5 pt-6 pb-6 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl pointer-events-none" />
                
                {/* Back button */}
                <button
                    onClick={() => navigate('/')}
                    className="mb-3 inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-rose-200 hover:text-white bg-white/10 px-3 py-1.5 rounded-full transition-all active:scale-95"
                >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Volver a Inicio</span>
                </button>

                <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-1.5">
                        <div className="w-8 h-8 rounded-xl bg-white/20 text-white flex items-center justify-center ring-1 ring-white/30">
                            <ShieldAlert className="w-5 h-5 animate-pulse" />
                        </div>
                        <span className="text-[11px] font-black uppercase tracking-widest text-rose-200">
                            Central de Emergencias & Asistencia
                        </span>
                    </div>

                    <h1 className="text-2xl font-black tracking-tight text-white mb-1">
                        Emergencias 24/7
                    </h1>

                    <div className="flex items-center gap-2 text-xs text-rose-100 font-bold mb-3">
                        <MapPin className="w-3.5 h-3.5 text-yellow-300" />
                        <span>Mostrando números para: <span className="underline decoration-yellow-300 font-black">{userCity}, {userState}</span></span>
                    </div>

                    {/* SOS Fast Call Pill */}
                    <div className="p-3.5 bg-white/15 border border-white/25 rounded-2xl flex items-center justify-between gap-3 shadow-inner">
                        <div className="flex items-center gap-2.5">
                            <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center text-rose-600 font-black shrink-0 shadow-md">
                                <Phone className="w-5 h-5 animate-bounce" />
                            </div>
                            <div>
                                <div className="text-[10px] font-black text-rose-200 uppercase tracking-wider">
                                    Línea Gratuita Nacional
                                </div>
                                <div className="text-base font-black text-white leading-none">
                                    VEN 911 Directo
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={() => handleCall('911')}
                            className="bg-white hover:bg-rose-50 active:scale-95 text-rose-700 font-black text-xs px-4 py-2.5 rounded-xl shadow-lg transition-all flex items-center gap-1.5"
                        >
                            <span>Llamar 911</span>
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Zone Filter & Search Bar */}
            <div className="sticky top-0 z-30 bg-slate-50/95 backdrop-blur-md px-5 pt-3 pb-2 space-y-2.5 border-b border-slate-200/60 shadow-sm">
                {/* Zone Toggle Pill (Local vs Nacional) */}
                <div className="flex items-center gap-1.5 p-1 bg-slate-200/70 rounded-2xl text-[11px] font-black">
                    <button
                        onClick={() => {
                            vibrate(20);
                            setZoneFilter('todos');
                        }}
                        className={`flex-1 py-1.5 rounded-xl text-center transition-all ${
                            zoneFilter === 'todos' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                        }`}
                    >
                        Todos ({allServices.length})
                    </button>
                    <button
                        onClick={() => {
                            vibrate(20);
                            setZoneFilter('local');
                        }}
                        className={`flex-1 py-1.5 rounded-xl text-center transition-all ${
                            zoneFilter === 'local' ? 'bg-rose-600 text-white shadow-sm' : 'text-slate-600'
                        }`}
                    >
                        📍 {userCity}
                    </button>
                    <button
                        onClick={() => {
                            vibrate(20);
                            setZoneFilter('nacional');
                        }}
                        className={`flex-1 py-1.5 rounded-xl text-center transition-all ${
                            zoneFilter === 'nacional' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                        }`}
                    >
                        🇻🇪 Nacionales
                    </button>
                </div>

                {/* Search Box */}
                <div className="relative">
                    <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={`Buscar en ${userCity} (policía, bomberos, hospital, grúa)...`}
                        className="w-full bg-white border border-slate-200 pl-10 pr-4 py-2.5 rounded-2xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-rose-500/40 focus:border-rose-500 transition-all"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold p-1"
                        >
                            ✕
                        </button>
                    )}
                </div>

                {/* Category Pills */}
                <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-1">
                    {categories.map((cat) => {
                        const isSelected = selectedCategory === cat.id;
                        return (
                            <button
                                key={cat.id}
                                onClick={() => {
                                    vibrate(20);
                                    setSelectedCategory(cat.id);
                                }}
                                className={`px-3 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-wider shrink-0 transition-all flex items-center gap-1.5 shadow-sm active:scale-95 ${
                                    isSelected
                                        ? 'bg-slate-900 text-white shadow-md'
                                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                                }`}
                            >
                                <span>{cat.label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Services List */}
            <div className="px-5 pt-3 space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-slate-500 px-1">
                    <span>{filteredServices.length} contactos de emergencia</span>
                    <span className="text-[10px] text-rose-600 font-black uppercase">
                        Zona: {zoneFilter === 'local' ? userCity : zoneFilter === 'nacional' ? 'Venezuela' : 'Total'}
                    </span>
                </div>

                {filteredServices.length === 0 ? (
                    <div className="bg-white rounded-3xl p-8 border border-slate-200 text-center shadow-sm space-y-2 mt-4">
                        <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto" />
                        <h3 className="text-sm font-black text-slate-800">No encontramos servicios con este filtro</h3>
                        <p className="text-xs text-slate-500 leading-relaxed max-w-xs mx-auto">
                            Prueba cambiando el filtro de zona o el término de búsqueda.
                        </p>
                    </div>
                ) : (
                    filteredServices.map((item) => {
                        const isEmergency = item.category === 'emergencias' || item.priority;

                        return (
                            <div
                                key={item.id}
                                className={`bg-white rounded-3xl p-4 border transition-all shadow-sm hover:shadow-md relative overflow-hidden ${
                                    isEmergency 
                                        ? 'border-rose-200 ring-1 ring-rose-200/50' 
                                        : 'border-slate-200/80'
                                }`}
                            >
                                <div className="flex items-start gap-3">
                                    <div
                                        className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-sm ${
                                            item.category === 'emergencias'
                                                ? 'bg-rose-50 text-rose-600 border border-rose-200'
                                                : item.category === 'salud' || item.category === 'prehospitalaria'
                                                ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                                                : item.category === 'vial'
                                                ? 'bg-amber-50 text-amber-600 border border-amber-200'
                                                : 'bg-indigo-50 text-indigo-600 border border-indigo-200'
                                        }`}
                                    >
                                        {item.category === 'emergencias' ? (
                                            <Flame className="w-6 h-6" />
                                        ) : item.category === 'prehospitalaria' ? (
                                            <Ambulance className="w-6 h-6" />
                                        ) : item.category === 'salud' ? (
                                            <HeartPulse className="w-6 h-6" />
                                        ) : item.category === 'vial' ? (
                                            <Car className="w-6 h-6" />
                                        ) : (
                                            <Wrench className="w-6 h-6" />
                                        )}
                                    </div>

                                    <div className="flex-1 min-w-0 pr-2">
                                        <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                                            <span className="text-[10px] font-black text-rose-600 uppercase tracking-wider">
                                                {item.scope === 'local' ? `📍 ${item.city || userCity}` : item.scope === 'estado' ? `🏛️ ${item.state || userState}` : '🇻🇪 Nacional'}
                                            </span>
                                            {item.badgeText && (
                                                <span className="text-[9px] font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full">
                                                    {item.badgeText}
                                                </span>
                                            )}
                                        </div>

                                        <h3 className="text-sm font-black text-slate-900 leading-tight">
                                            {item.name}
                                        </h3>

                                        <p className="text-xs text-slate-500 font-medium leading-relaxed mt-1">
                                            {item.description}
                                        </p>

                                        {item.address && (
                                            <div className="flex items-center gap-1 text-[11px] text-slate-400 mt-1.5 font-medium">
                                                <MapPin className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                                                <span className="truncate">{item.address}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Action Buttons */}
                                <div className="mt-3.5 pt-3 border-t border-slate-100 flex items-center gap-2">
                                    <button
                                        onClick={() => handleCall(item.phone)}
                                        className="flex-1 py-2.5 px-3 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-black text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
                                    >
                                        <Phone className="w-3.5 h-3.5 text-yellow-300" />
                                        <span>Llamar: {item.phone}</span>
                                    </button>

                                    {item.whatsapp && (
                                        <button
                                            onClick={() => handleWhatsApp(item.whatsapp!, item.name)}
                                            className="p-2.5 bg-emerald-50 hover:bg-emerald-100 active:scale-95 text-emerald-600 rounded-xl border border-emerald-200 transition-all flex items-center justify-center shrink-0 shadow-sm"
                                            title="Enviar WhatsApp"
                                        >
                                            <MessageCircle className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
