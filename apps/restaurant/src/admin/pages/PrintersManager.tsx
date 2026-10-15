import React, { useState, useEffect, useCallback } from 'react';
import { Printer, Plus, Search, Trash2, Edit2, Check, X, Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { requestUsbDevice } from '../../lib/usb-printer';

// @ts-nocheck
// WebUSB Types (basic polyfill for TS)
declare global {
    interface Navigator {
        usb?: {
            requestDevice(options: { filters: any[] }): Promise<any>;
            getDevices(): Promise<any[]>;
        };
    }
}

interface Station {
    id: string;
    name: string;
    categories: string[];
    isActive: boolean;
    createdAt: any;
    vendorId?: number;
    productId?: number;
    printerName?: string;
}

export default function PrintersManager() {
    const { user, userData } = useAuth();
    const rid = userData?.managedRestaurantId || user?.uid;
    const [stations, setStations] = useState<Station[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingStation, setEditingStation] = useState<Station | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const [formData, setFormData] = useState({
        name: '',
        categories: [] as string[],
        isActive: true,
        vendorId: undefined as number | undefined,
        productId: undefined as number | undefined,
        printerName: ''
    });

    const fetchStations = useCallback(async () => {
        if (!rid) return;
        setLoading(true);
        try {
            const { data } = await supabase
                .from('printers')
                .select('*')
                .eq('restaurant_id', rid)
                .order('created_at', { ascending: false });

            if (data) {
                setStations(data.map((p: any) => ({
                    id: p.id,
                    name: p.name,
                    categories: p.categories || [],
                    isActive: p.is_active ?? true,
                    vendorId: p.vendor_id,
                    productId: p.product_id,
                    printerName: p.printer_name || '',
                    createdAt: p.created_at
                })));
            }
        } catch (err) {
            console.error("Error fetching printers:", err);
        } finally {
            setLoading(false);
        }
    }, [rid]);

    useEffect(() => {
        if (!user || !rid) return;
        fetchStations();

        const channel = supabase
            .channel(`printers_${rid}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'printers', filter: `restaurant_id=eq.${rid}` }, () => {
                fetchStations();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user, rid, fetchStations]);

    const handleOpenModal = (station?: Station) => {
        if (station) {
            setEditingStation(station);
            setFormData({
                name: station.name,
                categories: station.categories || [],
                isActive: station.isActive,
                vendorId: station.vendorId,
                productId: station.productId,
                printerName: station.printerName || ''
            });
        } else {
            setEditingStation(null);
            setFormData({
                name: '',
                categories: [],
                isActive: true,
                vendorId: undefined,
                productId: undefined,
                printerName: ''
            });
        }
        setIsModalOpen(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !formData.name.trim() || !rid) return;

        setSubmitting(true);
        try {
            const printerPayload: any = {
                restaurant_id: rid,
                name: formData.name.trim(),
                categories: formData.categories || [],
                is_active: formData.isActive,
                vendor_id: formData.vendorId || null,
                product_id: formData.productId || null,
                printer_name: formData.printerName || '',
                updated_at: new Date().toISOString()
            };

            if (editingStation) {
                const { error: updErr } = await supabase
                    .from('printers')
                    .update(printerPayload)
                    .eq('id', editingStation.id);
                if (updErr) throw updErr;
            } else {
                printerPayload.created_at = new Date().toISOString();
                const { error: insErr } = await supabase
                    .from('printers')
                    .insert(printerPayload);
                if (insErr) throw insErr;
            }
            setIsModalOpen(false);
            fetchStations();
        } catch (error) {
            console.error("Error saving station:", error);
            alert("Error al guardar la estación");
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!user || !rid || !window.confirm('¿Estás seguro de eliminar esta estación?')) return;

        try {
            const { error } = await supabase.from('printers').delete().eq('id', id);
            if (error) throw error;
            fetchStations();
        } catch (error) {
            console.error("Error deleting station:", error);
            alert("Error al eliminar la estación");
        }
    };

    const filteredStations = stations.filter(s =>
        s.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px]">
                <Loader2 className="w-10 h-10 text-slate-900 animate-spin" />
                <p className="mt-4 text-slate-500 font-bold">Cargando estaciones...</p>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto space-y-8">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                        <Printer className="w-8 h-8 text-primary" />
                        Estaciones de Impresión Térmica POS
                    </h1>
                    <p className="text-slate-500 font-medium mt-1">
                        Diseñado para <strong>Impresoras Térmicas POS de Tickets, Facturas Rápidas y Comandas</strong> (papel de 58mm y 80mm con protocolo ESC/POS por Bluetooth, USB o Red Wi-Fi/IP).
                    </p>
                </div>
                <button
                    onClick={() => handleOpenModal()}
                    className="flex items-center justify-center gap-2 bg-primary text-slate-900 px-6 py-3 rounded-2xl font-bold shadow-lg shadow-primary/30 hover:scale-105 transition-transform active:scale-95 shrink-0"
                >
                    <Plus className="w-5 h-5" />
                    Nueva Estación
                </button>
            </div>

            {/* Banner Informativo de Compatibilidad de Hardware POS */}
            <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 text-white rounded-3xl p-6 md:p-7 shadow-xl border border-slate-800 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-80 h-80 bg-primary/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>
                <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                    <div className="space-y-2 max-w-2xl">
                        <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary/20 text-primary border border-primary/30 rounded-full text-xs font-black uppercase tracking-wider">
                            ⚡ Protocolo ESC/POS Estándar Industrial
                        </div>
                        <h2 className="text-xl md:text-2xl font-black tracking-tight text-white">
                            Automatización de Tickets de Cocina y Barra
                        </h2>
                        <p className="text-slate-300 text-sm leading-relaxed">
                            Conecta tus impresoras de rollo continuo térmico para imprimir comandas al instante al recibir pedidos de la App, dividir platos por áreas de preparación y despachar facturas de caja sin demoras.
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 w-full md:w-auto shrink-0">
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-3.5 flex flex-col">
                            <span className="text-[10px] font-black uppercase text-amber-400 tracking-wider">Papel Rollo</span>
                            <span className="text-base font-black text-white mt-0.5">58mm & 80mm</span>
                            <span className="text-[10px] text-slate-400">Tickets y comandas</span>
                        </div>
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-3.5 flex flex-col">
                            <span className="text-[10px] font-black uppercase text-emerald-400 tracking-wider">Conectividad</span>
                            <span className="text-base font-black text-white mt-0.5">USB / BT / Wi-Fi</span>
                            <span className="text-[10px] text-slate-400">ESC/POS & Red IP</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Search and Filters */}
            <div className="bg-white p-4 rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-100 flex items-center gap-4">
                <div className="flex-1 relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Buscar estación por nombre (Cocina, Barra, Parrilla)..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-12 pr-4 py-3 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-primary/20 font-medium"
                    />
                </div>
            </div>

            {/* Stations List */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredStations.map((station) => (
                    <div
                        key={station.id}
                        className="bg-white p-6 rounded-[2.5rem] shadow-xl shadow-slate-200/40 border border-slate-100 group hover:border-primary/20 transition-all flex flex-col justify-between"
                    >
                        <div>
                            <div className="flex items-start justify-between mb-4">
                                <div className="p-3 bg-slate-50 rounded-2xl group-hover:bg-primary/10 transition-colors">
                                    <Printer className="w-6 h-6 text-slate-400 group-hover:text-slate-900 transition-colors" />
                                </div>
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => handleOpenModal(station)}
                                        className="p-2 text-slate-400 hover:text-slate-900 hover:bg-primary/5 rounded-xl transition-all"
                                        title="Editar Estación"
                                    >
                                        <Edit2 className="w-5 h-5" />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(station.id)}
                                        className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                                        title="Eliminar Estación"
                                    >
                                        <Trash2 className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>

                            <h3 className="text-xl font-black text-slate-800 mb-2">{station.name}</h3>

                            <div className="flex flex-wrap gap-1.5 mb-4">
                                <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-black uppercase tracking-wider">
                                    Rollo Térmico 80/58mm
                                </span>
                                <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-black uppercase tracking-wider">
                                    ESC/POS
                                </span>
                            </div>

                            {/* Categorías asignadas */}
                            {station.categories && station.categories.length > 0 && (
                                <div className="mb-4">
                                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider mb-1.5">Categorías Asignadas:</p>
                                    <div className="flex flex-wrap gap-1">
                                        {station.categories.map((c: string) => (
                                            <span key={c} className="px-2 py-0.5 bg-primary/10 text-slate-800 rounded-md text-[11px] font-bold">
                                                {c}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div>
                            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                                <span className={`px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest ${station.isActive ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                                    {station.isActive ? 'Estación Activa' : 'Inactiva'}
                                </span>
                            </div>

                            {station.printerName && (
                                <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                                    <span className="text-xs font-bold text-slate-500 truncate" title={station.printerName}>
                                        Hardware: {station.printerName}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                ))}

                {filteredStations.length === 0 && (
                    <div className="col-span-full py-12 flex flex-col items-center justify-center bg-slate-50 rounded-[3rem] border-2 border-dashed border-slate-200">
                        <Printer className="w-12 h-12 text-slate-300 mb-4" />
                        <p className="text-slate-500 font-bold text-center px-4">
                            {searchTerm ? 'No se encontraron estaciones para tu búsqueda' : 'No hay estaciones configuradas aún. ¡Crea la primera!'}
                        </p>
                    </div>
                )}
            </div>

            {/* Modal for Add/Edit */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
                        <div className="p-8">
                            <div className="flex items-center justify-between mb-8">
                                <h2 className="text-2xl font-black text-slate-900">
                                    {editingStation ? 'Editar Estación' : 'Nueva Estación'}
                                </h2>
                                <button
                                    onClick={() => setIsModalOpen(false)}
                                    className="p-2 hover:bg-slate-100 rounded-2xl transition-all"
                                >
                                    <X className="w-6 h-6 text-slate-400" />
                                </button>
                            </div>

                            <form onSubmit={handleSubmit} className="space-y-6">
                                <div className="space-y-2">
                                    <label className="text-sm font-black text-slate-500 uppercase tracking-widest ml-1">Nombre de la Estación</label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        placeholder="Ej: Cocina Principal, Barra de Bebidas..."
                                        className="w-full px-6 py-4 bg-slate-50 border-none rounded-[1.5rem] focus:ring-4 focus:ring-primary/10 font-bold text-lg"
                                    />
                                </div>

                                <div className="space-y-3">
                                    <label className="text-sm font-black text-slate-500 uppercase tracking-widest ml-1">Categorías Asignadas</label>
                                    <div className="grid grid-cols-2 gap-2 bg-slate-50 p-4 rounded-[1.5rem] max-h-[200px] overflow-y-auto hide-scrollbar border-2 border-transparent focus-within:border-primary/10 transition-all">
                                        {['Arepas', 'Burgers', 'Sushi', 'Pizzas', 'Bebidas', 'Postres', 'Desayunos', 'Almuerzos', 'Cenas', 'Snacks', 'Jugos Naturales', 'Promociones', 'Combos'].map(cat => (
                                            <button
                                                key={cat}
                                                type="button"
                                                onClick={() => {
                                                    const exists = formData.categories.includes(cat);
                                                    setFormData({
                                                        ...formData,
                                                        categories: exists
                                                            ? formData.categories.filter(c => c !== cat)
                                                            : [...formData.categories, cat]
                                                    });
                                                }}
                                                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all ${formData.categories.includes(cat)
                                                        ? 'bg-primary text-slate-900 shadow-lg shadow-primary/20'
                                                        : 'bg-white text-slate-500 border border-slate-100'
                                                    }`}
                                            >
                                                {cat}
                                                {formData.categories.includes(cat) && <Check className="w-3 h-3" />}
                                            </button>
                                        ))}
                                    </div>
                                    <p className="text-[10px] text-slate-400 font-medium px-2 italic">
                                        * Los productos de estas categorías se enviarán automáticamente a esta estación.
                                    </p>
                                </div>

                                <div className="space-y-3">
                                    <label className="text-sm font-black text-slate-500 uppercase tracking-widest ml-1">Formato de Papel Térmico</label>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="p-3 bg-slate-50 border-2 border-primary/40 rounded-2xl flex flex-col">
                                            <span className="text-xs font-black text-slate-800">Rollo 80mm</span>
                                            <span className="text-[10px] text-slate-500">Recomendado para comandas completas de cocina y barra</span>
                                        </div>
                                        <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col">
                                            <span className="text-xs font-black text-slate-800">Rollo 58mm</span>
                                            <span className="text-[10px] text-slate-500">Tickets compactos y facturación rápida de mostrador</span>
                                        </div>
                                    </div>
                                    <p className="text-[10px] text-slate-400 font-medium px-1 italic">
                                        * Compatible con comandos ESC/POS universales (Epson, Xprinter, Star Micronics, POS-58, POS-80, Bixolon, etc.).
                                    </p>
                                </div>

                                <div className="space-y-3">
                                    <label className="text-sm font-black text-slate-500 uppercase tracking-widest ml-1">Conexión de Hardware POS (Opcional)</label>
                                    <div className="bg-slate-50 p-4 rounded-[1.5rem] border-2 border-slate-100 flex flex-col gap-3">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <Printer className="w-5 h-5 text-slate-400" />
                                                <span className="font-bold text-slate-700">Impresora USB Directa</span>
                                            </div>
                                            {formData.vendorId ? (
                                                <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-black rounded-xl flex items-center gap-1">
                                                    <Check className="w-3 h-3" /> Vinculada
                                                </span>
                                            ) : (
                                                <span className="px-3 py-1 bg-slate-200 text-slate-500 text-xs font-black rounded-xl">
                                                    No Vinculada
                                                </span>
                                            )}
                                        </div>

                                        {formData.printerName && (
                                            <p className="text-sm font-medium text-slate-600 truncate bg-white p-2 rounded-xl border border-slate-100">
                                                {formData.printerName}
                                            </p>
                                        )}

                                        <button
                                            type="button"
                                            onClick={async () => {
                                                const device = await requestUsbDevice();
                                                if (device) {
                                                    setFormData({
                                                        ...formData,
                                                        vendorId: device.vendorId,
                                                        productId: device.productId,
                                                        printerName: device.name
                                                    });
                                                }
                                            }}
                                            className="w-full mt-2 bg-white border-2 border-primary/20 text-slate-900 hover:bg-primary hover:text-slate-900 transition-colors py-3 rounded-xl font-bold flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                                        >
                                            <AlertCircle className="w-4 h-4" />
                                            {formData.vendorId ? 'Cambiar Impresora USB' : 'Vincular Impresora USB'}
                                        </button>
                                        <div className="p-2.5 bg-blue-50/60 rounded-xl border border-blue-100 text-[11px] text-slate-600 leading-snug">
                                            <strong>Nota para Bluetooth o Red Wi-Fi/IP:</strong> Si tu impresora está conectada por Bluetooth o red local en el equipo POS, la app imprimirá automáticamente mediante el diálogo ESC/POS del sistema operativo.
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-[1.5rem]">
                                    <input
                                        type="checkbox"
                                        id="isActive"
                                        checked={formData.isActive}
                                        onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                                        className="w-5 h-5 rounded-lg border-slate-300 text-slate-900 focus:ring-primary/20"
                                    />
                                    <label htmlFor="isActive" className="text-sm font-bold text-slate-700">La estación está operativa</label>
                                </div>

                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="w-full bg-primary text-slate-900 py-4 rounded-[1.5rem] font-black text-lg shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-2"
                                >
                                    {submitting ? (
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                    ) : (
                                        <Check className="w-5 h-5" />
                                    )}
                                    {editingStation ? 'Guardar Cambios' : 'Crear Estación'}
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
