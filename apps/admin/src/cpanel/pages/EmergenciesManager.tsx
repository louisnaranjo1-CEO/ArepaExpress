import React, { useState, useEffect, useMemo } from 'react';
import { 
    ShieldAlert, 
    Plus, 
    Search, 
    Phone, 
    MessageCircle, 
    MapPin, 
    Clock, 
    Star, 
    Edit, 
    Trash2, 
    Check, 
    X, 
    Globe, 
    Building2, 
    Home, 
    Ambulance, 
    HeartPulse, 
    Wrench, 
    Car, 
    Flame,
    Filter,
    AlertCircle
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';

export interface EmergencyServiceItem {
    id?: string;
    name: string;
    category: 'emergencias' | 'prehospitalaria' | 'salud' | 'vial' | 'oficios' | 'apoyo';
    category_label?: string;
    description: string;
    phone: string;
    whatsapp?: string;
    address?: string;
    is_24_hours: boolean;
    badge_text?: string;
    zone?: string;
    priority: boolean;
    scope: 'nacional' | 'estado' | 'local';
    city?: string;
    state?: string;
    is_active: boolean;
    created_at?: string;
    updated_at?: string;
}

const CATEGORIES = [
    { id: 'emergencias', label: 'Emergencias 24/7', icon: Flame, color: 'text-rose-500 bg-rose-50 border-rose-200' },
    { id: 'prehospitalaria', label: 'Pre-Hospitalaria', icon: Ambulance, color: 'text-red-500 bg-red-50 border-red-200' },
    { id: 'salud', label: 'Clínicas y Salud', icon: HeartPulse, color: 'text-emerald-500 bg-emerald-50 border-emerald-200' },
    { id: 'vial', label: 'Auxilio Vial', icon: Car, color: 'text-amber-500 bg-amber-50 border-amber-200' },
    { id: 'oficios', label: 'Servicios del Hogar', icon: Wrench, color: 'text-blue-500 bg-blue-50 border-blue-200' },
    { id: 'apoyo', label: 'Apoyo y Denuncias', icon: ShieldAlert, color: 'text-purple-500 bg-purple-50 border-purple-200' },
];

const INITIAL_FORM: EmergencyServiceItem = {
    name: '',
    category: 'emergencias',
    category_label: 'Emergencias 24/7',
    description: '',
    phone: '',
    whatsapp: '',
    address: '',
    is_24_hours: true,
    badge_text: '',
    zone: '',
    priority: false,
    scope: 'local',
    city: 'Calabozo',
    state: 'Guárico',
    is_active: true
};

export default function EmergenciesManager() {
    const [services, setServices] = useState<EmergencyServiceItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedScope, setSelectedScope] = useState<'todos' | 'nacional' | 'estado' | 'local'>('todos');
    const [selectedCategory, setSelectedCategory] = useState<string>('todos');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingService, setEditingService] = useState<EmergencyServiceItem | null>(null);
    const [formData, setFormData] = useState<EmergencyServiceItem>(INITIAL_FORM);
    const [saving, setSaving] = useState(false);

    // Fetch emergency services
    const fetchServices = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('emergency_services')
                .select('*')
                .order('priority', { ascending: false })
                .order('created_at', { ascending: false });

            if (error) throw error;
            setServices(data || []);
        } catch (error) {
            console.error('Error fetching emergency services:', error);
            toast.error('Error al cargar servicios de emergencia');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchServices();

        // Realtime subscription
        const channel = supabase
            .channel('cpanel_emergencies')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'emergency_services' }, () => {
                fetchServices();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const openCreateModal = () => {
        setEditingService(null);
        setFormData(INITIAL_FORM);
        setIsModalOpen(true);
    };

    const openEditModal = (item: EmergencyServiceItem) => {
        setEditingService(item);
        setFormData({
            ...item,
            category_label: item.category_label || CATEGORIES.find(c => c.id === item.category)?.label || 'Emergencias 24/7'
        });
        setIsModalOpen(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name.trim() || !formData.phone.trim()) {
            toast.error('Nombre y teléfono son obligatorios');
            return;
        }

        const cat = CATEGORIES.find(c => c.id === formData.category);
        const payload = {
            name: formData.name.trim(),
            category: formData.category,
            category_label: cat?.label || formData.category_label || 'Emergencias 24/7',
            description: formData.description?.trim() || '',
            phone: formData.phone.trim(),
            whatsapp: formData.whatsapp?.trim() || null,
            address: formData.address?.trim() || null,
            is_24_hours: formData.is_24_hours,
            badge_text: formData.badge_text?.trim() || null,
            zone: formData.zone?.trim() || (formData.scope === 'nacional' ? 'Nivel Nacional' : formData.city || formData.state || 'Local'),
            priority: formData.priority,
            scope: formData.scope,
            city: formData.scope === 'local' ? (formData.city?.trim() || 'Calabozo') : null,
            state: formData.scope !== 'nacional' ? (formData.state?.trim() || 'Guárico') : null,
            is_active: formData.is_active,
            updated_at: new Date().toISOString()
        };

        setSaving(true);
        try {
            if (editingService?.id) {
                const { error } = await supabase
                    .from('emergency_services')
                    .update(payload)
                    .eq('id', editingService.id);
                if (error) throw error;
                toast.success('Servicio de emergencia actualizado');
            } else {
                const { error } = await supabase
                    .from('emergency_services')
                    .insert([{ ...payload, created_at: new Date().toISOString() }]);
                if (error) throw error;
                toast.success('Nuevo servicio de emergencia registrado');
            }
            setIsModalOpen(false);
            fetchServices();
        } catch (error) {
            console.error('Error saving emergency service:', error);
            toast.error('No se pudo guardar el servicio');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string, name: string) => {
        if (!window.confirm(`¿Estás seguro de eliminar "${name}" del directorio de emergencias?`)) {
            return;
        }

        try {
            const { error } = await supabase
                .from('emergency_services')
                .delete()
                .eq('id', id);

            if (error) throw error;
            toast.success('Servicio eliminado exitosamente');
            fetchServices();
        } catch (error) {
            console.error('Error deleting service:', error);
            toast.error('Error al eliminar el servicio');
        }
    };

    const toggleStatus = async (item: EmergencyServiceItem) => {
        try {
            const newStatus = !item.is_active;
            const { error } = await supabase
                .from('emergency_services')
                .update({ is_active: newStatus, updated_at: new Date().toISOString() })
                .eq('id', item.id);

            if (error) throw error;
            toast.success(newStatus ? 'Servicio activado' : 'Servicio desactivado');
            setServices(prev => prev.map(s => s.id === item.id ? { ...s, is_active: newStatus } : s));
        } catch (error) {
            console.error('Error toggling status:', error);
            toast.error('Error al cambiar el estado');
        }
    };

    const togglePriority = async (item: EmergencyServiceItem) => {
        try {
            const newPriority = !item.priority;
            const { error } = await supabase
                .from('emergency_services')
                .update({ priority: newPriority, updated_at: new Date().toISOString() })
                .eq('id', item.id);

            if (error) throw error;
            toast.success(newPriority ? 'Marcado como prioritario' : 'Prioridad retirada');
            setServices(prev => prev.map(s => s.id === item.id ? { ...s, priority: newPriority } : s));
        } catch (error) {
            console.error('Error toggling priority:', error);
            toast.error('Error al actualizar prioridad');
        }
    };

    // Filter services
    const filteredServices = useMemo(() => {
        return services.filter(item => {
            const matchesSearch = 
                item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                item.phone.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
                (item.city && item.city.toLowerCase().includes(searchQuery.toLowerCase())) ||
                (item.state && item.state.toLowerCase().includes(searchQuery.toLowerCase())) ||
                (item.zone && item.zone.toLowerCase().includes(searchQuery.toLowerCase()));

            const matchesScope = selectedScope === 'todos' || item.scope === selectedScope;
            const matchesCategory = selectedCategory === 'todos' || item.category === selectedCategory;

            return matchesSearch && matchesScope && matchesCategory;
        });
    }, [services, searchQuery, selectedScope, selectedCategory]);

    return (
        <div className="p-8 max-w-7xl mx-auto pb-24">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-rose-500 text-white flex items-center justify-center shadow-lg shadow-rose-500/30">
                            <ShieldAlert className="w-6 h-6" />
                        </div>
                        Directorio de Emergencias 24/7
                    </h1>
                    <p className="text-slate-500 font-medium text-sm mt-1">
                        Gestiona los números de auxilio, ambulancias, cuerpos policiales y clínicas que ven los usuarios clientes.
                    </p>
                </div>

                <button
                    onClick={openCreateModal}
                    className="bg-primary hover:bg-primary/90 text-slate-900 px-6 py-3.5 rounded-2xl font-black text-xs shadow-xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-2 cursor-pointer shrink-0"
                >
                    <Plus className="w-4 h-4" />
                    Nuevo Servicio de Emergencia
                </button>
            </div>

            {/* Scope Tabs & Search Controls */}
            <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm mb-6 space-y-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* Scope Selector */}
                    <div className="flex bg-slate-100 p-1 rounded-2xl overflow-x-auto hide-scrollbar">
                        <button
                            onClick={() => setSelectedScope('todos')}
                            className={`px-4 py-2 rounded-xl text-xs font-black transition-all whitespace-nowrap cursor-pointer ${
                                selectedScope === 'todos' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
                            }`}
                        >
                            Todos ({services.length})
                        </button>
                        <button
                            onClick={() => setSelectedScope('nacional')}
                            className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                                selectedScope === 'nacional' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-900'
                            }`}
                        >
                            <Globe className="w-3.5 h-3.5" />
                            Nacionales ({services.filter(s => s.scope === 'nacional').length})
                        </button>
                        <button
                            onClick={() => setSelectedScope('estado')}
                            className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                                selectedScope === 'estado' ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500 hover:text-slate-900'
                            }`}
                        >
                            <Building2 className="w-3.5 h-3.5" />
                            Estatales ({services.filter(s => s.scope === 'estado').length})
                        </button>
                        <button
                            onClick={() => setSelectedScope('local')}
                            className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                                selectedScope === 'local' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-900'
                            }`}
                        >
                            <Home className="w-3.5 h-3.5" />
                            Locales ({services.filter(s => s.scope === 'local').length})
                        </button>
                    </div>

                    {/* Search Bar */}
                    <div className="relative flex-1 max-w-md">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                            type="text"
                            placeholder="Buscar por nombre, teléfono, ciudad o zona..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 pl-10 pr-4 py-2.5 rounded-2xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                        />
                    </div>
                </div>

                {/* Category Pills */}
                <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar pt-2 border-t border-slate-100">
                    <button
                        onClick={() => setSelectedCategory('todos')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                            selectedCategory === 'todos' ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                        }`}
                    >
                        Todas las Categorías
                    </button>
                    {CATEGORIES.map(cat => {
                        const Icon = cat.icon;
                        const isSel = selectedCategory === cat.id;
                        return (
                            <button
                                key={cat.id}
                                onClick={() => setSelectedCategory(cat.id)}
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
                                    isSel ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                                }`}
                            >
                                <Icon className="w-3.5 h-3.5" />
                                {cat.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Services Grid */}
            {loading ? (
                <div className="flex justify-center py-20">
                    <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                </div>
            ) : filteredServices.length === 0 ? (
                <div className="p-16 text-center bg-white rounded-[2.5rem] border-2 border-dashed border-slate-200">
                    <ShieldAlert className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                    <h3 className="text-lg font-black text-slate-800 mb-1">No se encontraron servicios</h3>
                    <p className="text-slate-400 font-medium text-sm">
                        {searchQuery ? 'Prueba con otros términos de búsqueda.' : 'Crea tu primer servicio de emergencia para la app.'}
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredServices.map(item => {
                        const cat = CATEGORIES.find(c => c.id === item.category) || CATEGORIES[0];
                        const CatIcon = cat.icon;

                        return (
                            <div
                                key={item.id}
                                className={`bg-white rounded-[2rem] p-6 border transition-all shadow-sm flex flex-col justify-between ${
                                    item.is_active ? 'border-slate-100 hover:shadow-xl hover:border-primary/40' : 'border-slate-200 opacity-60 bg-slate-50/50'
                                }`}
                            >
                                <div>
                                    {/* Top badges */}
                                    <div className="flex items-center justify-between gap-2 mb-3">
                                        <div className="flex items-center gap-2">
                                            <span className={`px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1 border ${
                                                item.scope === 'nacional' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                                item.scope === 'estado' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                                                'bg-emerald-50 text-emerald-700 border-emerald-200'
                                            }`}>
                                                {item.scope === 'nacional' ? <Globe className="w-3 h-3" /> :
                                                 item.scope === 'estado' ? <Building2 className="w-3 h-3" /> :
                                                 <Home className="w-3 h-3" />}
                                                {item.scope.toUpperCase()}
                                            </span>

                                            {item.is_24_hours && (
                                                <span className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 text-[10px] font-black flex items-center gap-1">
                                                    <Clock className="w-3 h-3" /> 24H
                                                </span>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-1">
                                            <button
                                                type="button"
                                                onClick={() => togglePriority(item)}
                                                className={`p-1.5 rounded-xl transition-colors cursor-pointer ${
                                                    item.priority ? 'bg-amber-100 text-amber-600' : 'text-slate-300 hover:text-amber-500'
                                                }`}
                                                title={item.priority ? 'Quitar de destacados' : 'Destacar arriba'}
                                            >
                                                <Star className={`w-4 h-4 ${item.priority ? 'fill-amber-500' : ''}`} />
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => openEditModal(item)}
                                                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                                                title="Editar servicio"
                                            >
                                                <Edit className="w-4 h-4" />
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => item.id && handleDelete(item.id, item.name)}
                                                className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                                                title="Eliminar servicio"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Category tag */}
                                    <div className="inline-flex items-center gap-1.5 text-[11px] font-black text-slate-500 mb-1">
                                        <CatIcon className="w-3.5 h-3.5 text-primary" />
                                        <span>{item.category_label || cat.label}</span>
                                        {item.badge_text && (
                                            <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/50">
                                                {item.badge_text}
                                            </span>
                                        )}
                                    </div>

                                    <h3 className="text-base font-black text-slate-900 leading-snug mb-1.5">
                                        {item.name}
                                    </h3>

                                    <p className="text-xs text-slate-500 line-clamp-2 font-medium mb-4">
                                        {item.description || 'Sin descripción adicional.'}
                                    </p>

                                    {/* Zone & Location info */}
                                    <div className="space-y-1 mb-4 text-xs font-semibold text-slate-600">
                                        <div className="flex items-center gap-1.5">
                                            <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                            <span className="truncate">
                                                {item.scope === 'nacional' ? 'Todo el territorio nacional' :
                                                 item.city ? `${item.city}, ${item.state || 'Guárico'}` :
                                                 item.state ? `Estado ${item.state}` : item.zone || 'Cobertura Local'}
                                            </span>
                                        </div>
                                        {item.address && (
                                            <p className="text-[11px] text-slate-400 pl-5 truncate">
                                                {item.address}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {/* Contact actions & active toggle */}
                                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                        <a
                                            href={`tel:${item.phone}`}
                                            className="px-3 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-black flex items-center gap-1.5 hover:bg-slate-800 transition-colors"
                                        >
                                            <Phone className="w-3 h-3 text-primary" />
                                            <span>{item.phone}</span>
                                        </a>

                                        {item.whatsapp && (
                                            <a
                                                href={`https://wa.me/${item.whatsapp}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="p-2 rounded-xl bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors"
                                                title="WhatsApp"
                                            >
                                                <MessageCircle className="w-3.5 h-3.5" />
                                            </a>
                                        )}
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => toggleStatus(item)}
                                        className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase transition-all cursor-pointer ${
                                            item.is_active 
                                                ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200' 
                                                : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                                        }`}
                                    >
                                        {item.is_active ? 'Activo' : 'Pausado'}
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Create / Edit Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
                    <div className="bg-white rounded-[2.5rem] w-full max-w-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300 my-8">
                        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                            <div>
                                <h3 className="text-xl font-black text-slate-900">
                                    {editingService ? 'Editar Servicio de Emergencia' : 'Nuevo Contacto de Emergencia'}
                                </h3>
                                <p className="text-xs text-slate-500 font-bold mt-0.5">
                                    Información que aparecerá de inmediato en la app del cliente
                                </p>
                            </div>
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="p-2 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                            >
                                <X className="w-5 h-5 text-slate-400" />
                            </button>
                        </div>

                        <form onSubmit={handleSave} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
                            {/* Nombre del Servicio */}
                            <div>
                                <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1.5">
                                    Nombre del Servicio *
                                </label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Ej: Hospital Dr. Rafael Urdaneta Delgado"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-2xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary"
                                />
                            </div>

                            {/* Categoría y Alcance */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1.5">
                                        Categoría
                                    </label>
                                    <select
                                        value={formData.category}
                                        onChange={(e) => {
                                            const catId = e.target.value as any;
                                            const cat = CATEGORIES.find(c => c.id === catId);
                                            setFormData({ 
                                                ...formData, 
                                                category: catId,
                                                category_label: cat?.label || 'Emergencias 24/7'
                                            });
                                        }}
                                        className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-2xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary"
                                    >
                                        {CATEGORIES.map(c => (
                                            <option key={c.id} value={c.id}>{c.label}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1.5">
                                        Alcance Geográfico *
                                    </label>
                                    <select
                                        value={formData.scope}
                                        onChange={(e) => setFormData({ ...formData, scope: e.target.value as any })}
                                        className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-2xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary"
                                    >
                                        <option value="nacional">🇻🇪 Nacional (Para todo el país)</option>
                                        <option value="estado">🗺️ Estadal (Guárico / Regional)</option>
                                        <option value="local">📍 Local (Solo para la ciudad)</option>
                                    </select>
                                </div>
                            </div>

                            {/* Estado y Ciudad (si es local o estadal) */}
                            {formData.scope !== 'nacional' && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-2xl bg-amber-50/50 border border-amber-100">
                                    <div>
                                        <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wider mb-1">
                                            Estado
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="Ej: Guárico"
                                            value={formData.state || ''}
                                            onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                                            className="w-full bg-white border border-slate-200 px-3 py-2 rounded-xl text-xs font-bold text-slate-800"
                                        />
                                    </div>

                                    {formData.scope === 'local' && (
                                        <div>
                                            <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wider mb-1">
                                                Ciudad / Municipio
                                            </label>
                                            <input
                                                type="text"
                                                placeholder="Ej: Calabozo"
                                                value={formData.city || ''}
                                                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                                                className="w-full bg-white border border-slate-200 px-3 py-2 rounded-xl text-xs font-bold text-slate-800"
                                            />
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Teléfono & WhatsApp */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1.5">
                                        Teléfono de Llamada *
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="Ej: 911 o 0246-8712345"
                                        value={formData.phone}
                                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                        className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-2xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1.5">
                                        WhatsApp (Opcional)
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="Ej: 584128713333"
                                        value={formData.whatsapp || ''}
                                        onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
                                        className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-2xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary"
                                    />
                                </div>
                            </div>

                            {/* Zona y Placa */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1.5">
                                        Zona / Cobertura
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="Ej: Calabozo Urbano o Troncal 2"
                                        value={formData.zone || ''}
                                        onChange={(e) => setFormData({ ...formData, zone: e.target.value })}
                                        className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-2xl text-xs font-bold text-slate-800"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1.5">
                                        Texto de Placa / Badge
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="Ej: Hospital de Urgencias o Grúas 24h"
                                        value={formData.badge_text || ''}
                                        onChange={(e) => setFormData({ ...formData, badge_text: e.target.value })}
                                        className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-2xl text-xs font-bold text-slate-800"
                                    />
                                </div>
                            </div>

                            {/* Dirección */}
                            <div>
                                <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1.5">
                                    Dirección Física (Opcional)
                                </label>
                                <input
                                    type="text"
                                    placeholder="Ej: Av. Francisco de Miranda, Calabozo"
                                    value={formData.address || ''}
                                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                    className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-2xl text-xs font-bold text-slate-800"
                                />
                            </div>

                            {/* Descripción */}
                            <div>
                                <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1.5">
                                    Descripción o Instrucciones
                                </label>
                                <textarea
                                    rows={2}
                                    placeholder="Breve detalle del servicio para el usuario..."
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    className="w-full bg-slate-50 border border-slate-200 p-3 rounded-2xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary"
                                />
                            </div>

                            {/* Switches */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                                <label className="flex items-center gap-2 p-3 bg-slate-50 rounded-2xl border border-slate-200 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={formData.is_24_hours}
                                        onChange={(e) => setFormData({ ...formData, is_24_hours: e.target.checked })}
                                        className="w-4 h-4 rounded text-primary focus:ring-primary accent-primary"
                                    />
                                    <span className="text-xs font-black text-slate-800">Servicio 24 Horas</span>
                                </label>

                                <label className="flex items-center gap-2 p-3 bg-slate-50 rounded-2xl border border-slate-200 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={formData.priority}
                                        onChange={(e) => setFormData({ ...formData, priority: e.target.checked })}
                                        className="w-4 h-4 rounded text-primary focus:ring-primary accent-primary"
                                    />
                                    <span className="text-xs font-black text-slate-800">Destacar Arriba ⭐</span>
                                </label>

                                <label className="flex items-center gap-2 p-3 bg-slate-50 rounded-2xl border border-slate-200 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={formData.is_active}
                                        onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                                        className="w-4 h-4 rounded text-primary focus:ring-primary accent-primary"
                                    />
                                    <span className="text-xs font-black text-slate-800">Activo en la App</span>
                                </label>
                            </div>

                            {/* Submit */}
                            <div className="pt-4 flex items-center justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-6 py-3 rounded-2xl text-xs font-black text-slate-600 hover:bg-slate-100 transition-all cursor-pointer"
                                >
                                    Cancelar
                                </button>

                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="bg-primary hover:bg-primary/90 text-slate-900 px-8 py-3.5 rounded-2xl font-black text-xs shadow-xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                                >
                                    {saving ? (
                                        <div className="w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin"></div>
                                    ) : (
                                        <>
                                            <Check className="w-4 h-4" />
                                            {editingService ? 'Guardar Cambios' : 'Crear Servicio'}
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
