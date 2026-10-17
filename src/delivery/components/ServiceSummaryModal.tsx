import React from 'react';
import { 
    X, 
    Car, 
    Bike, 
    Package, 
    ShoppingBag, 
    User, 
    Phone, 
    MapPin, 
    Navigation, 
    DollarSign, 
    Clock, 
    ShieldCheck, 
    CheckCircle2, 
    FileText,
    ExternalLink
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ServiceSummaryModalProps {
    isOpen: boolean;
    onClose: () => void;
    serviceData: any;
    bcvRate?: number;
}

export default function ServiceSummaryModal({
    isOpen,
    onClose,
    serviceData,
    bcvRate = 1
}: ServiceSummaryModalProps) {
    if (!isOpen || !serviceData) return null;

    const isOrder = serviceData.type === 'order' || Boolean(serviceData.restaurant_id || serviceData.restaurantId);
    const clientName = serviceData.user_name || serviceData.userName || serviceData.passenger_name || (isOrder ? 'Cliente' : 'Pasajero');
    const clientPhone = serviceData.user_phone || serviceData.userPhone || serviceData.passenger_phone || serviceData.client_phone;
    const clientCedula = serviceData.user_cedula || serviceData.userCedula || serviceData.client_dni;

    const originAddr = serviceData.origin?.address || serviceData.origin_address || serviceData.restaurant_name || serviceData.restaurantName || (serviceData.origin?.lat ? `Lat: ${Number(serviceData.origin.lat).toFixed(4)}, Lng: ${Number(serviceData.origin.lng).toFixed(4)}` : 'Ubicación de partida');
    const destAddr = serviceData.destination?.address || serviceData.destination_address || serviceData.delivery_address || (serviceData.destination?.lat ? `Lat: ${Number(serviceData.destination.lat).toFixed(4)}, Lng: ${Number(serviceData.destination.lng).toFixed(4)}` : 'Punto de entrega / destino');

    const totalUSD = Number(serviceData.total || serviceData.price || serviceData.fare || 0);
    const effectiveRate = bcvRate > 1 ? bcvRate : (Number(serviceData.exchange_rate) || 1);
    const totalBs = (totalUSD * effectiveRate).toFixed(2);
    const driverPayout = Number(serviceData.driver_payout || (totalUSD * 0.85)).toFixed(2);
    const commission = Number(serviceData.commission_amount || (totalUSD * 0.15)).toFixed(2);

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'accepted':
                return { label: 'En camino a recoger', bg: 'bg-amber-100 text-amber-900 border-amber-300' };
            case 'arriving':
                return { label: 'Esperando en el punto', bg: 'bg-blue-100 text-blue-900 border-blue-300' };
            case 'in_progress':
            case 'en_camino':
            case 'in_transit':
                return { label: 'En viaje / En tránsito', bg: 'bg-emerald-100 text-emerald-900 border-emerald-300' };
            case 'completed':
            case 'delivered':
                return { label: 'Completado', bg: 'bg-green-100 text-green-900 border-green-300' };
            default:
                return { label: status || 'Activo', bg: 'bg-slate-100 text-slate-800 border-slate-300' };
        }
    };

    const statusBadge = getStatusBadge(serviceData.status);

    const getServiceIcon = () => {
        if (isOrder) return <ShoppingBag className="w-5 h-5 text-amber-600" />;
        if (serviceData.type === 'package_delivery' || serviceData.service_category === 'delivery_envios') return <Package className="w-5 h-5 text-blue-600" />;
        if (serviceData.vehicle_type === 'moto') return <Bike className="w-5 h-5 text-amber-600" />;
        return <Car className="w-5 h-5 text-amber-600" />;
    };

    const getCategoryName = () => {
        if (isOrder) return 'Entrega de Restaurante / Comercio';
        if (serviceData.service_category === 'delivery_envios' || serviceData.type === 'package_delivery') return 'Encomienda / Paquetería';
        if (serviceData.vehicle_type === 'moto') return 'Mototaxi Exprés';
        if (serviceData.service_category === 'carro_confort') return 'Carro Confort (≥ 2016 con A/A)';
        return 'Taxi Económico';
    };

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
                <motion.div 
                    initial={{ opacity: 0, y: 50, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 50, scale: 0.95 }}
                    className="w-full sm:max-w-lg bg-white rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden max-h-[90vh] flex flex-col"
                >
                    {/* Header */}
                    <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 text-white px-6 py-4 flex items-center justify-between border-b border-slate-800 shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center font-black shadow-md">
                                {getServiceIcon()}
                            </div>
                            <div>
                                <h3 className="text-base font-black text-white leading-tight">
                                    Resumen del Servicio
                                </h3>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                    {getCategoryName()}
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 active:scale-90 text-white flex items-center justify-center transition-all"
                            title="Cerrar resumen"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Scrollable Body */}
                    <div className="p-6 space-y-5 overflow-y-auto min-h-0 flex-1">
                        {/* Estado Actual */}
                        <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-200">
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                Estado Actual
                            </span>
                            <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider border ${statusBadge.bg}`}>
                                {statusBadge.label}
                            </span>
                        </div>

                        {/* Pasajero / Cliente */}
                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                                    <User className="w-4 h-4 text-amber-500" />
                                    {isOrder ? 'Cliente del Pedido' : 'Pasajero'}
                                </span>
                                {clientCedula && (
                                    <span className="text-xs font-bold text-slate-500 bg-white px-2.5 py-0.5 rounded-lg border border-slate-200">
                                        C.I: {clientCedula}
                                    </span>
                                )}
                            </div>

                            <div className="flex items-center justify-between">
                                <h4 className="text-base font-black text-slate-900 truncate">
                                    {clientName}
                                </h4>
                                {clientPhone && (
                                    <a
                                        href={`tel:${clientPhone}`}
                                        className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-sm transition-all"
                                    >
                                        <Phone className="w-3.5 h-3.5" />
                                        <span>Llamar</span>
                                    </a>
                                )}
                            </div>
                        </div>

                        {/* Recorrido */}
                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-3">
                            <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                                <Navigation className="w-4 h-4 text-blue-500" />
                                Ruta del Servicio
                            </span>

                            <div className="space-y-3 text-xs">
                                <div className="flex items-start gap-2.5">
                                    <span className="w-3 h-3 rounded-full bg-emerald-500 shrink-0 mt-0.5 ring-4 ring-emerald-100" />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[10px] font-black uppercase text-emerald-700">Punto de Recogida</p>
                                        <p className="font-bold text-slate-800 leading-snug">{originAddr}</p>
                                    </div>
                                </div>

                                <div className="ml-1.5 pl-3 border-l-2 border-dashed border-slate-300 py-0.5" />

                                <div className="flex items-start gap-2.5">
                                    <span className="w-3 h-3 rounded-full bg-red-500 shrink-0 mt-0.5 ring-4 ring-red-100" />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[10px] font-black uppercase text-red-700">Punto de Destino</p>
                                        <p className="font-bold text-slate-800 leading-snug">{destAddr}</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Finanzas del Servicio */}
                        <div className="bg-gradient-to-br from-slate-900 to-slate-950 text-white p-4 rounded-2xl border border-slate-800 shadow-md space-y-3">
                            <span className="text-[11px] font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                                <DollarSign className="w-4 h-4 text-amber-400" />
                                Desglose de Pago
                            </span>

                            <div className="flex items-baseline justify-between border-b border-white/10 pb-2.5">
                                <span className="text-sm font-bold text-slate-300">Tarifa del Viaje:</span>
                                <div className="text-right">
                                    <span className="text-xl font-black text-amber-400 leading-none">
                                        ${totalUSD.toFixed(2)} USD
                                    </span>
                                    <span className="block text-xs font-bold text-emerald-400 mt-0.5">
                                        ~{totalBs} Bs
                                    </span>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                                <div className="bg-white/5 p-2 rounded-xl">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Método de Pago</span>
                                    <span className="font-black text-white capitalize mt-0.5 block">
                                        {serviceData.payment_method === 'cash_usd' ? 'Efectivo USD' : 
                                         serviceData.payment_method === 'cash_ves' ? 'Efectivo Bolívares' : 
                                         serviceData.payment_method === 'pago_movil' ? 'Pago Móvil' : 
                                         serviceData.payment_method || 'A convenir'}
                                    </span>
                                </div>
                                <div className="bg-white/5 p-2 rounded-xl">
                                    <span className="text-[10px] font-bold text-emerald-400 uppercase block">Ganancia Conductor</span>
                                    <span className="font-black text-emerald-300 mt-0.5 block">
                                        ${driverPayout} USD
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Notas si existen */}
                        {serviceData.notes && (
                            <div className="bg-amber-50 border border-amber-200 p-3 rounded-2xl text-xs space-y-1">
                                <span className="text-[10px] font-black uppercase tracking-wider text-amber-900 flex items-center gap-1">
                                    <FileText className="w-3.5 h-3.5" /> Notas del Cliente:
                                </span>
                                <p className="font-semibold text-slate-800">{serviceData.notes}</p>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="p-4 bg-slate-50 border-t border-slate-200 shrink-0">
                        <button
                            type="button"
                            onClick={onClose}
                            className="w-full py-3.5 bg-slate-950 hover:bg-slate-900 active:scale-98 text-amber-400 rounded-2xl font-black text-xs uppercase tracking-wider shadow-lg transition-all"
                        >
                            Volver a la Navegación en Vivo
                        </button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
