import React, { useState, useMemo } from 'react';
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
    ExternalLink, 
    Clock, 
    AlertTriangle, 
    LifeBuoy, 
    CheckCircle2, 
    Navigation,
    Sparkles,
    ChevronRight
} from 'lucide-react';
import { vibrate } from '../utils/haptics';

interface ServiceItem {
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
}

const SERVICES_DIRECTORY: ServiceItem[] = [
    // 🚨 EMERGENCIAS CENTRALES 24/7
    {
        id: 'ven-911',
        name: 'VEN 911 - Emergencias Nacionales',
        category: 'emergencias',
        categoryLabel: 'Emergencias 24/7',
        description: 'Central integral de atención y despacho inmediato para emergencias médicas, seguridad y rescate.',
        phone: '911',
        is24Hours: true,
        badgeText: 'Línea Gratuita 24h',
        priority: true,
        zone: 'Nivel Nacional y Regional'
    },
    {
        id: 'bomberos-central',
        name: 'Cuerpo de Bomberos',
        category: 'emergencias',
        categoryLabel: 'Emergencias 24/7',
        description: 'Combate de incendios, rescate urbano, contención de fugas de gas y contingencias.',
        phone: '0800-2662376',
        whatsapp: '584120000000',
        address: 'Estación Central de Bomberos',
        is24Hours: true,
        badgeText: 'Rescate Inmediato',
        priority: true,
        zone: 'Toda la Zona'
    },
    {
        id: 'pnb-policia',
        name: 'Policía Nacional / Cuadrantes de Paz',
        category: 'emergencias',
        categoryLabel: 'Emergencias 24/7',
        description: 'Seguridad ciudadana, prevención y patrullaje de respuesta rápida en cuadrantes comunitarios.',
        phone: '0800-7654282',
        is24Hours: true,
        badgeText: 'Seguridad 24h',
        zone: 'Cuadrantes de Paz'
    },
    {
        id: 'transito-terrestre',
        name: 'Tránsito y Asistencia Vial PNB',
        category: 'emergencias',
        categoryLabel: 'Emergencias 24/7',
        description: 'Atención a colisiones, levantamiento de accidentes y control vehicular en arterias viales.',
        phone: '0800-8726748',
        is24Hours: true,
        badgeText: 'Vialidad Activa',
        zone: 'Avenidas y Autopistas'
    },

    // 🚑 PREHOSPITALARIA Y AMBULANCIAS
    {
        id: 'ambulancias-paramedicos',
        name: 'Servicio de Ambulancias Prehospitalarias',
        category: 'prehospitalaria',
        categoryLabel: 'Pre-Hospitalaria',
        description: 'Unidades de soporte vital básico y avanzado, traslado de pacientes críticos con paramédicos certificados.',
        phone: '0414-5550199',
        whatsapp: '584145550199',
        is24Hours: true,
        badgeText: 'Ambulancia Móvil',
        priority: true,
        zone: 'Zona Metropolitana'
    },
    {
        id: 'proteccion-civil',
        name: 'Protección Civil y Administración de Desastres',
        category: 'prehospitalaria',
        categoryLabel: 'Pre-Hospitalaria',
        description: 'Atención prehospitalaria en sitio, evaluación de riesgos estructurales y primeros auxilios.',
        phone: '0800-7248451',
        is24Hours: true,
        badgeText: 'Guardia Permanente',
        zone: 'Regional'
    },

    // 🏥 CLÍNICAS Y SALUD
    {
        id: 'hospital-central',
        name: 'Hospital Central - Emergencia Adultos y Pediátrica',
        category: 'salud',
        categoryLabel: 'Clínicas y Salud',
        description: 'Atención médica general de emergencia, trauma shock, pabellón de urgencia y cuidados intensivos.',
        phone: '0273-5321122',
        address: 'Av. Principal con Calle Hospital',
        is24Hours: true,
        badgeText: 'Emergencia Abierta',
        zone: 'Centro'
    },
    {
        id: 'clinica-urgencias-privada',
        name: 'Centro Médico Quirúrgico / Urgencias',
        category: 'salud',
        categoryLabel: 'Clínicas y Salud',
        description: 'Servicio de laboratorio clínico 24h, rayos X, ecografía de emergencia y hospitalización.',
        phone: '0273-5463321',
        whatsapp: '584245551234',
        address: 'Av. Agustín Codazzi, Edif. Quirúrgico',
        is24Hours: true,
        badgeText: 'Clínica 24h',
        zone: 'Zona Norte'
    },
    {
        id: 'farmacia-turno',
        name: 'Farmacia de Turno Nocturno',
        category: 'salud',
        categoryLabel: 'Clínicas y Salud',
        description: 'Despacho de medicamentos de emergencia, insumos médicos descartables y fórmulas infantiles.',
        phone: '0412-8889911',
        whatsapp: '584128889911',
        address: 'Av. 23 de Enero, Local 4',
        is24Hours: true,
        badgeText: 'Turno 24 Horas',
        zone: 'Avenida Principal'
    },

    // 🚗 AUXILIO VIAL Y GRÚAS
    {
        id: 'gruas-express-24h',
        name: 'Grúas y Remolque Rápido 24H',
        category: 'vial',
        categoryLabel: 'Auxilio Vial',
        description: 'Remolque de vehículos ligeros, camionetas y motos en plataforma. Rescate en carretera.',
        phone: '0424-5112233',
        whatsapp: '584245112233',
        is24Hours: true,
        badgeText: 'Grúa Inmediata',
        zone: 'Radio 50 km'
    },
    {
        id: 'auxilio-baterias-mecanica',
        name: 'Mecánico a Domicilio y Baterías',
        category: 'vial',
        categoryLabel: 'Auxilio Vial',
        description: 'Paso de corriente, diagnóstico computarizado móvil, venta e instalación de baterías a domicilio.',
        phone: '0414-9988776',
        whatsapp: '584149988776',
        is24Hours: false,
        badgeText: '7:00 AM - 10:00 PM',
        zone: 'Toda la ciudad'
    },
    {
        id: 'cauchos-gomeria',
        name: 'Cauchería Móvil / Reparación de Neumáticos',
        category: 'vial',
        categoryLabel: 'Auxilio Vial',
        description: 'Parcheo express en sitio, cambio de repuesto y calibración de aire a domicilio.',
        phone: '0416-7788990',
        whatsapp: '584167788990',
        is24Hours: true,
        badgeText: 'Servicio Móvil',
        zone: 'Urbano'
    },

    // 🛠️ SERVICIOS Y OFICIOS DE EMERGENCIA
    {
        id: 'cerrajeria-24h',
        name: 'Cerrajería Residencial y Automotriz 24H',
        category: 'oficios',
        categoryLabel: 'Servicios del Hogar',
        description: 'Apertura express de puertas trabadas, cerraduras de seguridad, candados y llaves codificadas.',
        phone: '0412-3344556',
        whatsapp: '584123344556',
        is24Hours: true,
        badgeText: 'Cerrajería 24h',
        zone: 'A domicilio'
    },
    {
        id: 'electricista-urgencias',
        name: 'Electricista Certificado - Cortocircuitos',
        category: 'oficios',
        categoryLabel: 'Servicios del Hogar',
        description: 'Reparación de tableros eléctricos, caídas de fase, brequeras quemadas y reconexiones seguras.',
        phone: '0424-6677889',
        whatsapp: '584246677889',
        is24Hours: true,
        badgeText: 'Guardia Eléctrica',
        zone: 'Sector Residencial y Comercial'
    },
    {
        id: 'plomeria-destapes',
        name: 'Plomería y Destape de Tuberías',
        category: 'oficios',
        categoryLabel: 'Servicios del Hogar',
        description: 'Contención de fugas de agua potable, bombas hidroneumáticas, filtraciones y destapes con guaya eléctrica.',
        phone: '0414-2233445',
        whatsapp: '584142233445',
        is24Hours: false,
        badgeText: '6:00 AM - 9:00 PM',
        zone: 'Casco urbano'
    }
];

export default function Services() {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string>('todos');

    const categories = [
        { id: 'todos', label: 'Todos', icon: Sparkles },
        { id: 'emergencias', label: '🚨 Emergencias 24/7', icon: ShieldAlert },
        { id: 'salud', label: '🏥 Clínicas & Salud', icon: HeartPulse },
        { id: 'prehospitalaria', label: '🚑 Pre-Hospitalaria', icon: Ambulance },
        { id: 'vial', label: '🚗 Auxilio Vial', icon: Car },
        { id: 'oficios', label: '🛠️ Servicios Técnicos', icon: Wrench },
    ];

    const filteredServices = useMemo(() => {
        return SERVICES_DIRECTORY.filter((item) => {
            const matchesCategory = selectedCategory === 'todos' || item.category === selectedCategory;
            const q = searchQuery.toLowerCase().trim();
            const matchesQuery = !q || 
                item.name.toLowerCase().includes(q) || 
                item.description.toLowerCase().includes(q) || 
                item.categoryLabel.toLowerCase().includes(q) ||
                (item.zone && item.zone.toLowerCase().includes(q));

            return matchesCategory && matchesQuery;
        });
    }, [selectedCategory, searchQuery]);

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
            <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white px-5 pt-8 pb-6 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
                <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center ring-1 ring-rose-500/40">
                            <LifeBuoy className="w-5 h-5 animate-pulse" />
                        </div>
                        <span className="text-[11px] font-black uppercase tracking-widest text-rose-400">
                            Asistencia & Servicios de la Zona
                        </span>
                    </div>
                    <h1 className="text-2xl font-black tracking-tight text-white mb-1">
                        Servicios y Emergencias
                    </h1>
                    <p className="text-xs text-slate-300 font-medium leading-relaxed max-w-sm">
                        Directorio de respuesta inmediata: ambulancias, bomberos, clínicas, auxilio vial y oficios a tu disposición.
                    </p>

                    {/* SOS Fast Call Pill */}
                    <div className="mt-4 p-3 bg-rose-600/30 border border-rose-500/40 rounded-2xl flex items-center justify-between gap-3 shadow-inner">
                        <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-xl bg-rose-600 flex items-center justify-center text-white font-black shrink-0 shadow-md">
                                <Phone className="w-4 h-4 animate-bounce" />
                            </div>
                            <div>
                                <div className="text-[10px] font-bold text-rose-300 uppercase tracking-wider">
                                    Línea de Emergencia 911
                                </div>
                                <div className="text-sm font-black text-white leading-none">
                                    Llamada Inmediata Gratuita
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={() => handleCall('911')}
                            className="bg-rose-500 hover:bg-rose-600 active:scale-95 text-white font-black text-xs px-4 py-2 rounded-xl shadow-lg transition-all flex items-center gap-1.5"
                        >
                            <span>Llamar</span>
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Sticky Search & Category Bar */}
            <div className="sticky top-0 z-30 bg-slate-50/95 backdrop-blur-md px-5 pt-4 pb-2 space-y-3 border-b border-slate-200/60 shadow-sm">
                {/* Search Box */}
                <div className="relative">
                    <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Buscar clínica, grúa, cerrajero, policía..."
                        className="w-full bg-white border border-slate-200 pl-10 pr-4 py-2.5 rounded-2xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
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

                {/* Category Pills Slider */}
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
            <div className="px-5 pt-4 space-y-3.5">
                <div className="flex items-center justify-between text-xs font-bold text-slate-500 px-1">
                    <span>{filteredServices.length} servicios disponibles</span>
                    {searchQuery && <span>Filtro: "{searchQuery}"</span>}
                </div>

                {filteredServices.length === 0 ? (
                    <div className="bg-white rounded-3xl p-8 border border-slate-200 text-center shadow-sm space-y-2 mt-4">
                        <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto" />
                        <h3 className="text-sm font-black text-slate-800">No encontramos coincidencias</h3>
                        <p className="text-xs text-slate-500 leading-relaxed max-w-xs mx-auto">
                            Prueba buscando con palabras como "grúa", "médico", "fuego", "policía" o "batería".
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
                                {isEmergency && (
                                    <div className="absolute top-0 right-0 bg-rose-500 text-white text-[9px] font-black uppercase px-3 py-0.5 rounded-bl-xl shadow-sm tracking-wider">
                                        Prioridad
                                    </div>
                                )}

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

                                    <div className="flex-1 min-w-0 pr-8">
                                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                                {item.categoryLabel}
                                            </span>
                                            {item.badgeText && (
                                                <span
                                                    className={`text-[9px] font-black px-2 py-0.5 rounded-full ${
                                                        item.is24Hours
                                                            ? 'bg-emerald-100 text-emerald-800'
                                                            : 'bg-slate-100 text-slate-700'
                                                    }`}
                                                >
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
                                            <div className="flex items-center gap-1 text-[11px] text-slate-400 mt-2 font-medium">
                                                <MapPin className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                                                <span className="truncate">{item.address}</span>
                                            </div>
                                        )}

                                        {item.zone && (
                                            <div className="text-[10px] font-bold text-indigo-600 mt-1">
                                                📍 Cobertura: {item.zone}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Action Buttons */}
                                <div className="mt-3.5 pt-3 border-t border-slate-100 flex items-center gap-2">
                                    <button
                                        onClick={() => handleCall(item.phone)}
                                        className="flex-1 py-2.5 px-3 bg-slate-900 hover:bg-slate-800 active:scale-95 text-white font-black text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
                                    >
                                        <Phone className="w-3.5 h-3.5 text-primary" />
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
