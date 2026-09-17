import React, { useState, useEffect } from 'react';
import { DeliveryDriver } from '../../lib/delivery-service';
import { driversApi } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { Truck, CheckCircle2, XCircle, FileText, User, DollarSign, ExternalLink, Plus, Trash2, Clock, Sun, Moon, Activity, MapPin, Map as MapIcon, Navigation, Search, CloudRain, Zap, Sparkles, Sliders, Bike, Car, ShieldCheck, Check, RefreshCw, Shield, CreditCard, Building2, Phone, Package } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleMap, useJsApiLoader, Marker, InfoWindow } from '@react-google-maps/api';
import DualPrice from '../../components/DualPrice';
import { useCurrency } from '../../context/CurrencyContext';
import { DEFAULT_PRICING_SETTINGS, calculateDynamicFare, SmartPricingSettings } from '../../lib/pricing';
import { getWeatherByCoordinates, WeatherInfo } from '../../lib/weather';

export default function DeliveryManagement() {
    const { bcvRate } = useCurrency();
    const [drivers, setDrivers] = useState<DeliveryDriver[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'requests' | 'active' | 'verifications' | 'finances' | 'history'>('requests');
    const [verifyingOrders, setVerifyingOrders] = useState<any[]>([]);
    const [completedOrders, setCompletedOrders] = useState<any[]>([]);
    const [historySearchTerm, setHistorySearchTerm] = useState('');
    const [loadingHistory, setLoadingHistory] = useState(false);

    useEffect(() => {
        if (activeTab === 'history') {
            setLoadingHistory(true);
            const fetchHistory = async () => {
                const { data, error } = await supabase
                    .from('orders')
                    .select('*')
                    .eq('status', 'completed')
                    .order('created_at', { ascending: false })
                    .limit(100);
                if (!error && data) {
                    setCompletedOrders(data.map(d => ({
                        ...d,
                        createdAt: d.created_at,
                        deliveryDriverId: d.delivery_driver_id || d.deliveryDriverId,
                        deliveryFee: d.delivery_fee || d.deliveryFee,
                        driverPayout: d.driver_payout || d.driverPayout,
                        deliveryPaid: d.delivery_paid !== undefined ? d.delivery_paid : d.deliveryPaid
                    })));
                }
                setLoadingHistory(false);
            };
            fetchHistory();
            const ch = supabase.channel('completed_orders_history')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
                    fetchHistory();
                })
                .subscribe();
            return () => {
                supabase.removeChannel(ch);
            };
        }
    }, [activeTab]);

    const formatDuration = (seconds: number) => {
        if (!seconds && seconds !== 0) return '--';
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}m ${s}s`;
    };
    const [selectedDriver, setSelectedDriver] = useState<DeliveryDriver | null>(null);
    const [selectedDriverFinance, setSelectedDriverFinance] = useState<DeliveryDriver | null>(null);
    const [driverPendingBalance, setDriverPendingBalance] = useState({ total: 0, count: 0 });
    const [payingDriver, setPayingDriver] = useState(false);
    const [updateRequests, setUpdateRequests] = useState<any[]>([]);
    const [settings, setSettings] = useState<any>({
        ...DEFAULT_PRICING_SETTINGS,
        dayShift: {
            start: "08:00",
            end: "20:00",
            driverRates: [{ from: 0, to: 2, price: 1.5 }],
            clientRates: [{ from: 0, to: 2, price: 2.5 }]
        },
        nightShift: {
            start: "20:01",
            end: "07:59",
            driverRates: [{ from: 0, to: 2, price: 2.0 }],
            clientRates: [{ from: 0, to: 2, price: 3.5 }]
        },
        transportRates: {
            moto: [{ from: 0, to: 2, clientPrice: 1.8, driverPrice: 1.5 }],
            carro: [{ from: 0, to: 2, clientPrice: 3.0, driverPrice: 2.5 }],
            ejecutivo: [{ from: 0, to: 2, clientPrice: 5.0, driverPrice: 4.0 }]
        },
        deliveryRadius: 15,
        whatsappMessageTemplate: `👋 ¡Hola *{RestaurantName}*!
Soy *{UserName}* y vengo desde la app con Deliexpress 🚀. Mi identificación es *{Cedula}* y requiero el siguiente pedido:

🛒 *Detalles del Pedido:*
{OrderItems}

🛵 *Delivery:* \${DeliveryFee}
💰 *Total:* \${Total}

📍 Adjunto mi ubicación para la entrega y mi número de contacto por si requieren llamar.

🗺️ *Ubicación:* {LocationText}
📱 *Mi número:* {UserPhone}

{OrderNotes}

_Enviado desde Deliexpress App_`
    });
    const [savingSettings, setSavingSettings] = useState(false);

    // Comisiones Fijas por Categoría Un 2x3
    const [categoryCommissions, setCategoryCommissions] = useState({
        mototaxi: 0.50,
        taxi: 0.80,
        confort: 1.20,
        delivery: 0.50,
        mandao: 0.70
    });

    // Datos Oficiales Pago Móvil Un 2x3 para Liquidaciones
    const [un2x3PagoMovil, setUn2x3PagoMovil] = useState({
        bank: 'Banesco (0134)',
        phone: '04141234567',
        idf: 'J-50123456-7',
        name: 'Un 2x3 Inversiones C.A.'
    });

    const [showFleetMap, setShowFleetMap] = useState(false);
    const [mapCenter, setMapCenter] = useState({ lat: 10.4806, lng: -66.9036 }); // Caracas
    const [activeMarker, setActiveMarker] = useState<string | null>(null);
    const [cityWeather, setCityWeather] = useState<WeatherInfo | null>(null);

    useEffect(() => {
        getWeatherByCoordinates(mapCenter.lat, mapCenter.lng)
            .then(w => setCityWeather(w))
            .catch(err => console.error("Error fetching city weather in admin:", err));
    }, [mapCenter]);

    const { isLoaded } = useJsApiLoader({
        id: 'google-map-script',
        googleMapsApiKey: "AIzaSyAT2_wZfYTBGDR7gEpLXRzG-BUQ9Cbu0aQ",
        libraries: ['places', 'geometry'] as any
    });

    useEffect(() => {
        const fetchDrivers = async () => {
            try {
                const data = await driversApi.getAllDrivers();
                setDrivers(data as unknown as DeliveryDriver[]);
                setLoading(false);
            } catch (err) {
                console.error("Error fetching drivers", err);
                setLoading(false);
            }
        };

        fetchDrivers();

        const driversChannel = supabase.channel('public:drivers')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, () => {
                fetchDrivers();
            })
            .subscribe();

        const fetchUpdates = async () => {
            const { data } = await supabase
                .from('delivery_update_requests')
                .select('*')
                .eq('status', 'pending');
            if (data) {
                setUpdateRequests(data.map(d => ({
                    ...d,
                    driverId: d.driver_id || d.driverId,
                    driverName: d.driver_name || d.driverName,
                    newData: d.new_data || d.newData
                })));
            }
        };
        fetchUpdates();

        const fetchVerifications = async () => {
            const { data } = await supabase
                .from('orders')
                .select('*')
                .eq('status', 'verificando_pago_delivery');
            if (data) {
                setVerifyingOrders(data);
            }
        };
        fetchVerifications();

        const fetchSettings = async () => {
            const { data } = await supabase
                .from('app_settings')
                .select('*')
                .eq('id', 'delivery_settings')
                .maybeSingle();
            if (data) {
                const sData = data.data || data.value || data;
                setSettings((prev: any) => ({
                    ...prev,
                    ...sData,
                    pricingModel: sData.pricingModel || 'smart',
                    delivery: sData.delivery || prev.delivery || DEFAULT_PRICING_SETTINGS.delivery,
                    transport: sData.transport || prev.transport || DEFAULT_PRICING_SETTINGS.transport,
                    dynamicFactors: sData.dynamicFactors || prev.dynamicFactors || DEFAULT_PRICING_SETTINGS.dynamicFactors,
                    transportRates: sData.transportRates || prev.transportRates
                }));
            }

            const { data: commData } = await supabase
                .from('app_settings')
                .select('*')
                .eq('id', 'commission_settings')
                .maybeSingle();
            if (commData) {
                const cVal = commData.data || commData.value || commData;
                if (cVal.commissions) {
                    setCategoryCommissions(prev => ({
                        ...prev,
                        ...cVal.commissions
                    }));
                }
                const pm = cVal.pago_movil || cVal.pagoMovil;
                if (pm) {
                    setUn2x3PagoMovil({
                        bank: pm.bank || 'Banesco (0134)',
                        phone: pm.phone || '04141234567',
                        idf: pm.id_number || pm.idf || 'J-50123456-7',
                        name: pm.account_name || pm.name || 'Un 2x3 Inversiones C.A.'
                    });
                }
            }
        };
        fetchSettings();

        const subChannel = supabase.channel('admin_delivery_mgmt')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_update_requests' }, () => fetchUpdates())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => fetchVerifications())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings' }, () => fetchSettings())
            .subscribe();

        return () => {
            supabase.removeChannel(driversChannel);
            supabase.removeChannel(subChannel);
        };
    }, []);

    const pendingDrivers = drivers.filter(d => d.status === 'pending');
    const activeDrivers = drivers.filter(d => d.status === 'active');

    const handleUpdateStatus = async (id: string, status: 'active' | 'rejected' | 'inactive') => {
        const message = status === 'rejected'
            ? "¿Estás seguro de RECHAZAR este piloto? Se eliminarán permanentemente todos sus documentos y deberá registrarse de nuevo desde cero."
            : `¿Estás seguro de mover este piloto al estado: ${status === 'active' ? 'Activo' : 'Inactivo'}?`;

        if (!window.confirm(message)) return;

        try {
            if (status === 'rejected') {
                const driver = drivers.find(d => d.id === id);

                // 1. Borrar todos los archivos de la carpeta en Storage
                try {
                    const { data: storageFiles } = await supabase.storage
                        .from('documents')
                        .list(`delivery_docs/${id}`);

                    if (storageFiles && storageFiles.length > 0) {
                        const filePaths = storageFiles.map(f => `delivery_docs/${id}/${f.name}`);
                        await supabase.storage.from('documents').remove(filePaths);
                    }
                } catch (listErr) {
                    console.warn("Error listando carpeta de documentos:", listErr);
                }

                // 2. Borrar por URLs específicas si estuvieran en documents o store_assets
                if (driver && driver.documents) {
                    const urls = [
                        driver.documents.selfieUrl,
                        driver.documents.vehicleUrl,
                        (driver.documents as any).vehicleImageUrl,
                        driver.documents.licenseUrl
                    ].filter(Boolean);

                    for (const url of urls) {
                        try {
                            if (url.includes('/documents/')) {
                                const path = url.split('/documents/')[1];
                                if (path) await supabase.storage.from('documents').remove([path]);
                            } else if (url.includes('/store_assets/')) {
                                const path = url.split('/store_assets/')[1];
                                if (path) await supabase.storage.from('store_assets').remove([path]);
                            }
                        } catch (err) {
                            console.error("Error deleting file during rejection:", url, err);
                        }
                    }
                }

                // 3. Eliminar solicitudes de actualización y registro del driver
                await supabase.from('delivery_update_requests').delete().eq('driver_id', id);
                await supabase.from('drivers').delete().eq('id', id);

                // Actualizar estado local inmediatamente
                setDrivers(prev => prev.filter(d => d.id !== id));
                alert("Piloto rechazado. Se eliminaron permanentemente todas sus imágenes, documentos y solicitudes.");
            } else {
                const driver = drivers.find(d => d.id === id);
                if (status === 'active' && driver) {
                    const targetRole = (driver.vehicleType === 'carro' || driver.vehicleType === 'ejecutivo') ? 'conductor' : 'aliado';
                    const { data: userProf } = await supabase.from('profiles').select('role').eq('id', id).maybeSingle();
                    if (userProf?.role !== 'admin') {
                        await supabase.from('profiles').update({ role: targetRole }).eq('id', id);
                    }
                }

                await driversApi.updateStatus(id, status === 'active', status === 'active' ? 'active' : 'offline');
                // Actualizar status en tabla drivers
                await supabase.from('drivers').update({ status }).eq('id', id);

                setDrivers(prev => prev.map(d => d.id === id ? { ...d, status, isOnline: status === 'active' } : d));
                alert(status === 'active' ? "¡Piloto aprobado con éxito!" : "Piloto desactivado.");
            }
            setSelectedDriver(null);
        } catch (error) {
            console.error("Error updating driver status:", error);
            alert("Error al actualizar estado");
        }
    };

    const handleUpdateAvailability = async (id: string, availability: 'active' | 'busy' | 'offline') => {
        const labels = { active: 'Activo', busy: 'Ocupado', offline: 'No disponible' };
        if (!window.confirm(`¿Cambiar estado del piloto a ${labels[availability]}?`)) return;

        try {
            await driversApi.updateStatus(id, availability !== 'offline', availability);
        } catch (error) {
            console.error("Error updating availability:", error);
            alert("Error al actualizar disponibilidad");
        }
    };

    const handleApproveUpdateRequest = async (request: any) => {
        if (!window.confirm(`¿Aprobar actualización de datos para ${request.driverName}?`)) return;
        try {
            const driverUpdate: any = {};
            if (request.newData?.cedula) driverUpdate.cedula = request.newData.cedula;
            if (request.newData?.vehicleType) driverUpdate.vehicle_type = request.newData.vehicleType;
            if (request.newData?.vehiclePlate) driverUpdate.vehicle_plate = request.newData.vehiclePlate;
            if (request.newData?.documents) driverUpdate.documents = request.newData.documents;

            if (Object.keys(driverUpdate).length > 0) {
                await supabase.from('drivers').update(driverUpdate).eq('id', request.driverId);
            }

            await supabase.from('delivery_update_requests').update({ status: 'approved' }).eq('id', request.id);
            alert('Datos actualizados correctamente.');
        } catch (error) {
            console.error(error);
            alert('Error al aprobar la actualización.');
        }
    };

    const handleRejectUpdateRequest = async (requestId: string) => {
        if (!window.confirm('¿Rechazar esta solicitud de actualización?')) return;
        try {
            await supabase.from('delivery_update_requests').update({ status: 'rejected' }).eq('id', requestId);
        } catch (error) {
            console.error(error);
        }
    };

    const handleApproveDeliveryPayment = async (orderId: string) => {
        if (!window.confirm('¿Aprobar el pago de este delivery? La orden pasará a estado de búsqueda de piloto.')) return;
        try {
            await supabase.from('orders').update({
                status: 'buscando_piloto',
                delivery_payment_status: 'approved',
                deliveryPaymentStatus: 'approved'
            }).eq('id', orderId);
            alert('Pago aprobado. Buscando pilotos.');
        } catch (error) {
            console.error('Error processing delivery payment', error);
            alert('Error al aprobar el pago.');
        }
    };

    const handleRejectDeliveryPayment = async (orderId: string) => {
        if (!window.confirm('¿Rechazar este pago? La orden regresará a estado de pago pendiente.')) return;
        try {
            await supabase.from('orders').update({
                status: 'pendiente_pago',
                delivery_payment_status: 'rejected',
                deliveryPaymentStatus: 'rejected',
                delivery_payment_ref: null,
                deliveryPaymentRef: null,
                delivery_payment_image: null,
                deliveryPaymentImage: null
            }).eq('id', orderId);
            alert('Pago rechazado.');
        } catch (error) {
            console.error('Error rejecting delivery payment', error);
            alert('Error al rechazar el pago.');
        }
    };

    const handleOpenFinanceModal = async (driver: DeliveryDriver) => {
        setSelectedDriverFinance(driver);
        setDriverPendingBalance({ total: 0, count: 0 }); // Reset while loading

        try {
            const { data: snapshot } = await supabase
                .from('orders')
                .select('*')
                .eq('delivery_driver_id', driver.id)
                .eq('status', 'completed');

            const pending = (snapshot || []).filter(doc => !doc.delivery_paid && !doc.deliveryPaid);

            const total = pending.reduce((sum: number, doc: any) => {
                return sum + (doc.driver_payout || doc.driverPayout || ((doc.delivery_fee || doc.deliveryFee) ? (doc.delivery_fee || doc.deliveryFee) * 0.8 : 0));
            }, 0);
            setDriverPendingBalance({ total, count: pending.length });
        } catch (error) {
            console.error("Error fetching driver balance:", error);
        }
    };

    const handlePayDriver = async () => {
        if (!selectedDriverFinance) return;
        if (!window.confirm(`¿Confirmas el pago de $${driverPendingBalance.total.toFixed(2)} (${(driverPendingBalance.total * bcvRate).toFixed(2)} Bs) al repartidor ${selectedDriverFinance.fullName}?`)) return;

        setPayingDriver(true);
        try {
            await supabase
                .from('orders')
                .update({ delivery_paid: true, deliveryPaid: true })
                .eq('delivery_driver_id', selectedDriverFinance.id)
                .eq('status', 'completed');

            alert('¡Pago registrado con éxito! El historial del piloto ha sido actualizado.');
            setSelectedDriverFinance(null);
        } catch (error) {
            console.error("Error paying driver:", error);
            alert("Error al registrar el pago.");
        } finally {
            setPayingDriver(false);
        }
    };

    const handleSaveSettings = async () => {
        setSavingSettings(true);
        try {
            const smartTransport = settings.transport || DEFAULT_PRICING_SETTINGS.transport;
            const updatedTransportRates = {
                moto: [
                    { from: 0, to: smartTransport.moto?.baseKm || 2, clientPrice: smartTransport.moto?.baseFare || 1.8, driverPrice: Number(((smartTransport.moto?.baseFare || 1.8) * ((smartTransport.moto?.driverCutPercent || 85) / 100)).toFixed(2)) },
                    { from: smartTransport.moto?.baseKm || 2, to: 0, clientPrice: smartTransport.moto?.pricePerKm || 0.5, driverPrice: Number(((smartTransport.moto?.pricePerKm || 0.5) * ((smartTransport.moto?.driverCutPercent || 85) / 100)).toFixed(2)) }
                ],
                carro: [
                    { from: 0, to: smartTransport.carro?.baseKm || 2, clientPrice: smartTransport.carro?.baseFare || 3.0, driverPrice: Number(((smartTransport.carro?.baseFare || 3.0) * ((smartTransport.carro?.driverCutPercent || 85) / 100)).toFixed(2)) },
                    { from: smartTransport.carro?.baseKm || 2, to: 0, clientPrice: smartTransport.carro?.pricePerKm || 0.8, driverPrice: Number(((smartTransport.carro?.pricePerKm || 0.8) * ((smartTransport.carro?.driverCutPercent || 85) / 100)).toFixed(2)) }
                ],
                ejecutivo: [
                    { from: 0, to: smartTransport.ejecutivo?.baseKm || 2, clientPrice: smartTransport.ejecutivo?.baseFare || 5.0, driverPrice: Number(((smartTransport.ejecutivo?.baseFare || 5.0) * ((smartTransport.ejecutivo?.driverCutPercent || 85) / 100)).toFixed(2)) },
                    { from: smartTransport.ejecutivo?.baseKm || 2, to: 0, clientPrice: smartTransport.ejecutivo?.pricePerKm || 1.2, driverPrice: Number(((smartTransport.ejecutivo?.pricePerKm || 1.2) * ((smartTransport.ejecutivo?.driverCutPercent || 85) / 100)).toFixed(2)) }
                ]
            };

            const payloadToSave = {
                ...settings,
                pricingModel: 'smart',
                transportRates: updatedTransportRates
            };

            const { error } = await supabase
                .from('app_settings')
                .upsert({
                    id: 'delivery_settings',
                    data: payloadToSave,
                    updated_at: new Date().toISOString()
                });
            if (error) throw error;

            // Guardar Comisiones Un 2x3 y Pago Móvil Receptor
            const { error: commErr } = await supabase
                .from('app_settings')
                .upsert({
                    id: 'commission_settings',
                    data: {
                        commissions: categoryCommissions,
                        pagoMovil: {
                            bank: un2x3PagoMovil.bank,
                            phone: un2x3PagoMovil.phone,
                            idf: un2x3PagoMovil.idf,
                            name: un2x3PagoMovil.name
                        },
                        pago_movil: {
                            bank: un2x3PagoMovil.bank,
                            phone: un2x3PagoMovil.phone,
                            id_number: un2x3PagoMovil.idf,
                            account_name: un2x3PagoMovil.name
                        }
                    },
                    updated_at: new Date().toISOString()
                });
            if (commErr) throw commErr;

            alert('¡Configuraciones de tarifas y comisiones Un 2x3 guardadas correctamente en Supabase!');
        } catch (error) {
            console.error("Error saving settings:", error);
            alert("Error al guardar configuraciones.");
        } finally {
            setSavingSettings(false);
        }
    };


    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="space-y-8 pb-20">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-slate-900">Delivery Express</h1>
                    <p className="text-slate-500 font-medium">Gestión administrativa de la flota de pilotos.</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={() => setShowFleetMap(true)}
                        className="bg-primary text-slate-900 px-6 py-3 rounded-2xl font-black text-sm flex items-center gap-2 shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                    >
                        <MapIcon className="w-5 h-5" />
                        Ver Mapa de Flota
                    </button>
                </div>
            </div>

            {/* TABS */}
            <div className="flex bg-slate-100 p-1 rounded-2xl w-max relative z-0 overflow-x-auto hide-scrollbar">
                {(['requests', 'active', 'verifications', 'finances', 'history'] as const).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`relative px-6 py-2.5 rounded-xl font-black text-sm transition-all z-10 whitespace-nowrap ${activeTab === tab ? 'text-slate-900' : 'text-slate-500 hover:text-slate-700'
                            }`}
                    >
                        {activeTab === tab && (
                            <motion.div
                                layoutId="delivery-tab-bg"
                                className="absolute inset-0 bg-white rounded-xl -z-10 shadow-sm"
                                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                            />
                        )}
                        {tab === 'requests' ? `Nuevas Solicitudes (${pendingDrivers.length})`
                            : tab === 'active' ? `Pilotos Activos (${activeDrivers.length})`
                                : tab === 'verifications' ? `Pagos Delivery (${verifyingOrders.length})`
                                    : tab === 'finances' ? 'Finanzas y Tarifas'
                                        : 'Auditoría de Entregas'}
                    </button>
                ))}
            </div>

            {/* TAB: REQUESTS */}
            {activeTab === 'requests' && (
                <div className="space-y-8">
                    {/* Actualizaciones de Datos */}
                    {updateRequests.length > 0 && (
                        <div>
                            <h3 className="text-xl font-black text-slate-800 mb-4">Actualizaciones de Datos ({updateRequests.length})</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {updateRequests.map(req => (
                                    <div key={req.id} className="bg-amber-50 rounded-[24px] border border-amber-200 overflow-hidden shadow-sm">
                                        <div className="p-5 border-b border-amber-200/50">
                                            <h3 className="font-bold text-slate-900 leading-tight mb-3">{req.driverName}</h3>
                                            <div className="space-y-4 text-sm bg-white p-3 rounded-xl border border-amber-100">
                                                <div className="space-y-2">
                                                    <p className="flex justify-between"><span className="text-slate-500 font-medium">Cédula:</span> <span className="font-bold text-slate-800">{req.newData.cedula}</span></p>
                                                    <p className="flex justify-between"><span className="text-slate-500 font-medium">Vehículo:</span> <span className="font-bold text-slate-800 capitalize">{req.newData.vehicleType}</span></p>
                                                    <p className="flex justify-between"><span className="text-slate-500 font-medium">Placa:</span> <span className="font-bold text-slate-800 uppercase">{req.newData.vehiclePlate}</span></p>
                                                </div>
                                                
                                                {/* Images Section */}
                                                {req.newData.documents && (
                                                    <div className="grid grid-cols-3 gap-2 pt-3 border-t border-amber-100/50">
                                                        {req.newData.documents.selfieUrl && (
                                                            <div className="flex flex-col items-center">
                                                                <span className="text-[9px] font-bold text-slate-400 uppercase mb-1">Selfie</span>
                                                                <a href={req.newData.documents.selfieUrl} target="_blank" rel="noreferrer" className="relative group block">
                                                                    <img 
                                                                        src={req.newData.documents.selfieUrl} 
                                                                        alt="Selfie" 
                                                                        className="w-16 h-16 object-cover rounded-xl border border-slate-200"
                                                                        onError={(e) => {
                                                                            (e.target as HTMLImageElement).src = 'https://via.placeholder.com/150?text=Error';
                                                                        }}
                                                                    />
                                                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded-xl">
                                                                        <ExternalLink className="text-white w-4 h-4" />
                                                                    </div>
                                                                </a>
                                                            </div>
                                                        )}
                                                        {req.newData.documents.licenseUrl && (
                                                            <div className="flex flex-col items-center">
                                                                <span className="text-[9px] font-bold text-slate-400 uppercase mb-1">Licencia</span>
                                                                <a href={req.newData.documents.licenseUrl} target="_blank" rel="noreferrer" className="relative group block">
                                                                    <img 
                                                                        src={req.newData.documents.licenseUrl} 
                                                                        alt="Licencia" 
                                                                        className="w-16 h-16 object-cover rounded-xl border border-slate-200"
                                                                        onError={(e) => {
                                                                            (e.target as HTMLImageElement).src = 'https://via.placeholder.com/150?text=Error';
                                                                        }}
                                                                    />
                                                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded-xl">
                                                                        <ExternalLink className="text-white w-4 h-4" />
                                                                    </div>
                                                                </a>
                                                            </div>
                                                        )}
                                                        {(req.newData.documents.vehicleUrl || req.newData.documents.vehicleImageUrl) && (
                                                            <div className="flex flex-col items-center">
                                                                <span className="text-[9px] font-bold text-slate-400 uppercase mb-1">Vehículo</span>
                                                                <a href={req.newData.documents.vehicleUrl || req.newData.documents.vehicleImageUrl} target="_blank" rel="noreferrer" className="relative group block">
                                                                    <img 
                                                                        src={req.newData.documents.vehicleUrl || req.newData.documents.vehicleImageUrl} 
                                                                        alt="Vehículo" 
                                                                        className="w-16 h-16 object-cover rounded-xl border border-slate-200"
                                                                        onError={(e) => {
                                                                            (e.target as HTMLImageElement).src = 'https://via.placeholder.com/150?text=Error';
                                                                        }}
                                                                    />
                                                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded-xl">
                                                                        <ExternalLink className="text-white w-4 h-4" />
                                                                    </div>
                                                                </a>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="p-4 grid grid-cols-2 gap-3">
                                            <button
                                                onClick={() => handleRejectUpdateRequest(req.id)}
                                                className="bg-white border-2 border-red-100 text-red-600 font-bold py-2 rounded-xl text-sm"
                                            >
                                                Rechazar
                                            </button>
                                            <button
                                                onClick={() => handleApproveUpdateRequest(req)}
                                                className="bg-emerald-500 text-white font-bold py-2 rounded-xl text-sm"
                                            >
                                                Aprobar
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Nuevos Pilotos */}
                    <div>
                        <h3 className="text-xl font-black text-slate-800 mb-4">Nuevos Pilotos ({pendingDrivers.length})</h3>
                        {pendingDrivers.length === 0 ? (
                            <div className="text-center py-20 bg-white rounded-[32px] border border-slate-100 shadow-sm">
                                <div className="w-20 h-20 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <CheckCircle2 className="w-10 h-10" />
                                </div>
                                <h3 className="text-xl font-black text-slate-900">Al Día</h3>
                                <p className="text-slate-500">No hay solicitudes de pilotos pendientes por revisar.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {pendingDrivers.map(driver => (
                                    <div key={driver.id} className="bg-white rounded-[24px] border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-all">
                                        <div className="p-5 border-b border-slate-100">
                                            <div className="flex items-center gap-4 mb-4">
                                                <a href={driver.documents.selfieUrl} target="_blank" rel="noreferrer" className="relative group">
                                                    <img 
                                                       src={driver.documents.selfieUrl} 
                                                       alt="Selfie" 
                                                       className="w-16 h-16 rounded-full object-cover bg-slate-100 border border-slate-200 shadow-sm"
                                                       onError={(e) => {
                                                           (e.target as HTMLImageElement).src = 'https://via.placeholder.com/150?text=Error';
                                                       }}
                                                    />
                                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded-full">
                                                        <ExternalLink className="text-white w-4 h-4" />
                                                    </div>
                                                </a>
                                                <div>
                                                    <h3 className="font-bold text-slate-900 leading-tight">{driver.fullName}</h3>
                                                    <p className="text-xs text-slate-500">
                                                        {driver.phone} • {driver.age} años {driver.birthdate ? `(🎂 ${driver.birthdate})` : ''}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2 text-xs">
                                                <div className="bg-slate-50 p-2 rounded-lg">
                                                    <span className="text-slate-400 font-bold uppercase tracking-wider block mb-0.5">Cédula / RIF</span>
                                                    <span className="font-bold text-slate-700">{driver.cedula} {driver.rif ? `• ${driver.rif}` : ''}</span>
                                                </div>
                                                <div className="bg-slate-50 p-2 rounded-lg">
                                                    <span className="text-slate-400 font-bold uppercase tracking-wider block mb-0.5">Vehículo</span>
                                                    <span className="font-bold text-slate-700 capitalize">
                                                        {driver.vehicleType} {driver.vehicleBrand ? `(${driver.vehicleBrand} ${driver.vehicleModel || ''} ${driver.vehicleYear || ''})` : ''}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="p-4 bg-slate-50 grid grid-cols-2 gap-3">
                                            <button
                                                onClick={() => setSelectedDriver(driver)}
                                                className="col-span-2 bg-white border border-slate-200 text-slate-700 font-bold py-2 rounded-xl text-sm"
                                            >
                                                Revisar Documentos
                                            </button>
                                            <button
                                                onClick={() => handleUpdateStatus(driver.id, 'rejected')}
                                                className="bg-red-100 text-red-600 font-bold py-2 rounded-xl text-sm"
                                            >
                                                Rechazar
                                            </button>
                                            <button
                                                onClick={() => handleUpdateStatus(driver.id, 'active')}
                                                className="bg-emerald-500 text-white font-bold py-2 rounded-xl text-sm"
                                            >
                                                Aprobar Piloto
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* TAB: VERIFICATIONS */}
            {activeTab === 'verifications' && (
                <div className="space-y-6">
                    <div className="flex items-center gap-3 mb-6">
                        <DollarSign className="w-6 h-6 text-emerald-500" />
                        <h2 className="text-xl font-black text-slate-800">Verificación de Pagos de Delivery</h2>
                    </div>

                    {verifyingOrders.length === 0 ? (
                        <div className="text-center py-20 bg-white rounded-3xl border border-slate-100 shadow-sm">
                            <CheckCircle2 className="w-16 h-16 mx-auto text-emerald-200 mb-4" />
                            <h3 className="text-xl font-bold text-slate-800 mb-2">Todo al día</h3>
                            <p className="text-slate-500">No hay pagos pendientes de verificación en este momento.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {verifyingOrders.map(order => (
                                <div key={order.id} className="bg-white rounded-3xl p-6 border flex flex-col justify-between border-slate-100 relative overflow-hidden shadow-sm group">
                                    <div className="mb-4">
                                        <div className="flex justify-between items-start mb-2">
                                            <h3 className="font-bold text-slate-900 line-clamp-1">{order.userName}</h3>
                                            <span className="text-xs font-bold bg-amber-100 text-amber-700 px-2 py-1 rounded-full uppercase">Pte. Verificación</span>
                                        </div>
                                        <p className="text-xs text-slate-500 font-medium">#{order.id.slice(-5).toUpperCase()} • {order.restaurantName}</p>
                                        
                                        <div className="mt-4 p-3 bg-slate-50 rounded-xl space-y-2 text-sm border border-slate-100">
                                            <div className="flex justify-between">
                                                <span className="text-slate-500 font-medium">Delivery:</span>
                                                <span className="font-bold text-slate-800">${(order.deliveryFee || 0).toFixed(2)} | {((order.deliveryFee || 0) * bcvRate).toFixed(2)} Bs</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-slate-500 font-medium">Referencia:</span>
                                                <span className="font-bold text-slate-800">{order.deliveryPaymentRef || 'N/A'}</span>
                                            </div>
                                        </div>

                                        {order.deliveryPaymentImage && (
                                            <div className="mt-4 w-full h-32 rounded-xl overflow-hidden shadow-sm border border-slate-200 relative group cursor-pointer" onClick={() => window.open(order.deliveryPaymentImage, '_blank')}>
                                                <img src={order.deliveryPaymentImage} className="w-full h-full object-cover transition-transform group-hover:scale-105" alt="Capture" />
                                                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                                    <span className="text-white text-xs font-bold bg-black/50 px-2 py-1 rounded-lg backdrop-blur-sm shadow-lg">Ver Capture</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex gap-2 mt-4">
                                        <button 
                                            onClick={() => handleRejectDeliveryPayment(order.id)}
                                            className="flex-1 bg-red-50 text-red-600 hover:bg-red-100 font-bold py-2.5 rounded-xl transition-colors text-sm flex justify-center items-center gap-1"
                                        >
                                            <XCircle className="w-4 h-4" /> Rechazar
                                        </button>
                                        <button 
                                            onClick={() => handleApproveDeliveryPayment(order.id)}
                                            className="flex-1 bg-emerald-500 text-white hover:bg-emerald-600 font-bold py-2.5 rounded-xl shadow-lg shadow-emerald-500/30 transition-colors text-sm flex justify-center items-center gap-1"
                                        >
                                            <CheckCircle2 className="w-4 h-4" /> Aprobar
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* TAB: ACTIVE */}
            {activeTab === 'active' && (
                <div className="bg-white border border-slate-200 rounded-[32px] overflow-hidden shadow-sm">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                                <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-widest pt-5 pl-6">Piloto</th>
                                <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-widest pt-5">Contacto</th>
                                <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-widest pt-5">Vehículo</th>
                                <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-widest pt-5">Estado</th>
                                <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-widest pt-5 pr-6 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {activeDrivers.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="p-8 text-center text-slate-500 font-medium pb-10">No hay pilotos activos actualmente.</td>
                                </tr>
                            ) : (
                                activeDrivers.map(driver => (
                                    <tr key={driver.id} className="border-b border-slate-100 last:border-none hover:bg-slate-50/50 transition-colors group">
                                        <td className="p-4 pl-6">
                                            <div className="flex items-center gap-3">
                                                <div className="relative group">
                                                    <a href={driver.documents.selfieUrl} target="_blank" rel="noreferrer" className="block">
                                                        <img 
                                                            src={driver.documents.selfieUrl} 
                                                            alt="Pic" 
                                                            className="w-10 h-10 rounded-full object-cover border border-slate-200" 
                                                            onError={(e) => {
                                                                (e.target as HTMLImageElement).src = 'https://via.placeholder.com/150?text=Error';
                                                            }}
                                                        />
                                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded-full">
                                                            <ExternalLink className="text-white w-2 h-2" />
                                                        </div>
                                                    </a>
                                                    {driver.isOnline && (
                                                        <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full"></div>
                                                    )}
                                                </div>
                                                <div>
                                                    <p className="font-bold text-slate-900">{driver.fullName}</p>
                                                    <p className="text-xs text-slate-500">ID: {driver.id.slice(0, 5)}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <p className="font-bold text-slate-700">{driver.phone}</p>
                                            <p className="text-xs text-slate-500">{driver.email}</p>
                                        </td>
                                        <td className="p-4">
                                            <p className="font-bold text-slate-700 capitalize">{driver.vehicleType}</p>
                                            <p className="text-xs text-slate-500 uppercase">{driver.vehiclePlate || 'N/A'}</p>
                                        </td>
                                        <td className="p-4">
                                            <div className="flex bg-slate-100 p-1 rounded-xl w-fit">
                                                <button
                                                    onClick={() => handleUpdateAvailability(driver.id, 'active')}
                                                    className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${(!driver.availability || driver.availability === 'active') && driver.isOnline
                                                        ? 'bg-emerald-500 text-white shadow-sm'
                                                        : 'text-slate-400 hover:text-slate-600'
                                                        }`}
                                                >
                                                    Activo
                                                </button>
                                                <button
                                                    onClick={() => handleUpdateAvailability(driver.id, 'busy')}
                                                    className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${driver.availability === 'busy'
                                                        ? 'bg-amber-500 text-white shadow-sm'
                                                        : 'text-slate-400 hover:text-slate-600'
                                                        }`}
                                                >
                                                    Ocupado
                                                </button>
                                                <button
                                                    onClick={() => handleUpdateAvailability(driver.id, 'offline')}
                                                    className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${driver.availability === 'offline' || !driver.isOnline
                                                        ? 'bg-slate-500 text-white shadow-sm'
                                                        : 'text-slate-400 hover:text-slate-600'
                                                        }`}
                                                >
                                                    No Disp.
                                                </button>
                                            </div>
                                        </td>
                                        <td className="p-4 pr-6 text-right space-x-3">
                                            {driver.homeLocation?.coords && (
                                                <button
                                                    onClick={() => {
                                                        if (driver.homeLocation?.coords) {
                                                            setMapCenter(driver.homeLocation.coords);
                                                            setActiveMarker(driver.id);
                                                            setShowFleetMap(true);
                                                        }
                                                    }}
                                                    className="text-emerald-600 text-xs font-bold hover:underline"
                                                >
                                                    Ver Mapa
                                                </button>
                                            )}
                                            <button
                                                onClick={() => handleOpenFinanceModal(driver)}
                                                className="text-slate-700 hover:text-slate-900 text-xs font-bold hover:underline opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                Finanzas
                                            </button>
                                            <button
                                                onClick={() => handleUpdateStatus(driver.id, 'inactive')}
                                                className="text-red-500 text-xs font-bold hover:underline opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                Desactivar
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* TAB: FINANCES */}
            {activeTab === 'finances' && (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
                    {/* ========================================================= */}
                    {/* SECCIÓN 1: GESTIÓN DE COMISIONES FIJAS POR CATEGORÍA */}
                    {/* ========================================================= */}
                    <div className="bg-white p-6 md:p-8 rounded-[32px] border border-slate-200 shadow-sm space-y-6">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <span className="px-3 py-1 bg-primary/20 text-slate-900 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 border border-primary/30">
                                        <Shield className="w-3.5 h-3.5 text-primary" />
                                        Tarifa Plana por Carrera
                                    </span>
                                    <span className="px-2.5 py-0.5 bg-emerald-50 text-emerald-700 rounded-full text-[10px] font-bold border border-emerald-200">
                                        Autonomía de Tarifas
                                    </span>
                                </div>
                                <h3 className="text-xl font-black text-slate-900 tracking-tight">Comisiones de Plataforma Un 2x3</h3>
                                <p className="text-xs text-slate-500 max-w-2xl font-medium leading-relaxed">
                                    Monto fijo exacto en dólares ($ USD) que se debita automáticamente del saldo y acumula a la deuda del conductor por cada servicio completado, sin importar el monto que el conductor cobre al usuario.
                                </p>
                            </div>
                            <button
                                onClick={handleSaveSettings}
                                disabled={savingSettings}
                                className="px-6 py-3 bg-primary text-slate-900 font-black rounded-2xl text-xs flex items-center gap-2 shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-98 transition-all shrink-0"
                            >
                                <Check className="w-4 h-4" />
                                {savingSettings ? 'Guardando...' : 'Guardar Comisiones'}
                            </button>
                        </div>

                        {/* 5 Categories Cards */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                            {/* Mototaxi */}
                            <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200/80 space-y-3 hover:border-amber-400 transition-colors">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center font-black">
                                        <Bike className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h4 className="font-black text-slate-900 text-xs uppercase tracking-wide">Mototaxi</h4>
                                        <p className="text-[10px] text-slate-400 font-bold">1 Pasajero</p>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Comisión Fija ($)</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-2.5 text-slate-400 font-bold text-xs">$</span>
                                        <input
                                            type="number"
                                            step="0.05"
                                            min="0"
                                            value={categoryCommissions.mototaxi}
                                            onChange={(e) => setCategoryCommissions(prev => ({ ...prev, mototaxi: parseFloat(e.target.value) || 0 }))}
                                            className="w-full bg-white border border-slate-200 pl-7 pr-3 py-2 rounded-xl text-sm font-black text-slate-800 outline-none focus:ring-2 focus:ring-amber-500/20"
                                        />
                                    </div>
                                    {bcvRate > 0 && (
                                        <p className="text-[10px] text-slate-400 font-medium mt-1">
                                            ≈ {(categoryCommissions.mototaxi * bcvRate).toFixed(2)} Bs
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Taxi Driver */}
                            <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200/80 space-y-3 hover:border-indigo-400 transition-colors">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center font-black">
                                        <Car className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h4 className="font-black text-slate-900 text-xs uppercase tracking-wide">Taxi Driver</h4>
                                        <p className="text-[10px] text-slate-400 font-bold">Carro Estándar</p>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Comisión Fija ($)</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-2.5 text-slate-400 font-bold text-xs">$</span>
                                        <input
                                            type="number"
                                            step="0.05"
                                            min="0"
                                            value={categoryCommissions.taxi}
                                            onChange={(e) => setCategoryCommissions(prev => ({ ...prev, taxi: parseFloat(e.target.value) || 0 }))}
                                            className="w-full bg-white border border-slate-200 pl-7 pr-3 py-2 rounded-xl text-sm font-black text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20"
                                        />
                                    </div>
                                    {bcvRate > 0 && (
                                        <p className="text-[10px] text-slate-400 font-medium mt-1">
                                            ≈ {(categoryCommissions.taxi * bcvRate).toFixed(2)} Bs
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Carro Confort */}
                            <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200/80 space-y-3 hover:border-purple-400 transition-colors">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-600 flex items-center justify-center font-black">
                                        <Sparkles className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h4 className="font-black text-slate-900 text-xs uppercase tracking-wide">Carro Confort</h4>
                                        <p className="text-[10px] text-slate-400 font-bold">A/C • Maletero</p>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Comisión Fija ($)</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-2.5 text-slate-400 font-bold text-xs">$</span>
                                        <input
                                            type="number"
                                            step="0.05"
                                            min="0"
                                            value={categoryCommissions.confort}
                                            onChange={(e) => setCategoryCommissions(prev => ({ ...prev, confort: parseFloat(e.target.value) || 0 }))}
                                            className="w-full bg-white border border-slate-200 pl-7 pr-3 py-2 rounded-xl text-sm font-black text-slate-800 outline-none focus:ring-2 focus:ring-purple-500/20"
                                        />
                                    </div>
                                    {bcvRate > 0 && (
                                        <p className="text-[10px] text-slate-400 font-medium mt-1">
                                            ≈ {(categoryCommissions.confort * bcvRate).toFixed(2)} Bs
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Envíos / Delivery */}
                            <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200/80 space-y-3 hover:border-emerald-400 transition-colors">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-black">
                                        <Package className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h4 className="font-black text-slate-900 text-xs uppercase tracking-wide">Envíos / Delivery</h4>
                                        <p className="text-[10px] text-slate-400 font-bold">Paquetes / Pedidos</p>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Comisión Fija ($)</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-2.5 text-slate-400 font-bold text-xs">$</span>
                                        <input
                                            type="number"
                                            step="0.05"
                                            min="0"
                                            value={categoryCommissions.delivery}
                                            onChange={(e) => setCategoryCommissions(prev => ({ ...prev, delivery: parseFloat(e.target.value) || 0 }))}
                                            className="w-full bg-white border border-slate-200 pl-7 pr-3 py-2 rounded-xl text-sm font-black text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500/20"
                                        />
                                    </div>
                                    {bcvRate > 0 && (
                                        <p className="text-[10px] text-slate-400 font-medium mt-1">
                                            ≈ {(categoryCommissions.delivery * bcvRate).toFixed(2)} Bs
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Muchacho e' Mandado */}
                            <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200/80 space-y-3 hover:border-amber-500 transition-colors">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-700 flex items-center justify-center font-black">
                                        <Zap className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h4 className="font-black text-slate-900 text-xs uppercase tracking-wide">e' Mandado</h4>
                                        <p className="text-[10px] text-slate-400 font-bold">Diligencias / Bidding</p>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Comisión Fija ($)</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-2.5 text-slate-400 font-bold text-xs">$</span>
                                        <input
                                            type="number"
                                            step="0.05"
                                            min="0"
                                            value={categoryCommissions.mandao}
                                            onChange={(e) => setCategoryCommissions(prev => ({ ...prev, mandao: parseFloat(e.target.value) || 0 }))}
                                            className="w-full bg-white border border-slate-200 pl-7 pr-3 py-2 rounded-xl text-sm font-black text-slate-800 outline-none focus:ring-2 focus:ring-amber-500/20"
                                        />
                                    </div>
                                    {bcvRate > 0 && (
                                        <p className="text-[10px] text-slate-400 font-medium mt-1">
                                            ≈ {(categoryCommissions.mandao * bcvRate).toFixed(2)} Bs
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ========================================================= */}
                    {/* SECCIÓN 2: DATOS OFICIALES PAGO MÓVIL RECEPTOR UN 2X3 */}
                    {/* ========================================================= */}
                    <div className="bg-white p-6 md:p-8 rounded-[32px] border border-slate-200 shadow-sm space-y-6">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <span className="px-3 py-1 bg-amber-500/10 text-amber-700 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 border border-amber-500/30">
                                        <CreditCard className="w-3.5 h-3.5 text-amber-500" />
                                        Cobro de Comisiones
                                    </span>
                                    <span className="px-2.5 py-0.5 bg-blue-50 text-blue-700 rounded-full text-[10px] font-bold border border-blue-200">
                                        Visible para Pilotos
                                    </span>
                                </div>
                                <h3 className="text-xl font-black text-slate-900 tracking-tight">Cuenta Oficial Pago Móvil Un 2x3</h3>
                                <p className="text-xs text-slate-500 max-w-2xl font-medium leading-relaxed">
                                    Datos bancarios oficiales donde los conductores transfieren en Bolívares (a tasa BCV) para liquidar sus comisiones adeudadas.
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div>
                                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Banco Receptor</label>
                                <div className="relative">
                                    <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                                    <input
                                        type="text"
                                        value={un2x3PagoMovil.bank}
                                        onChange={(e) => setUn2x3PagoMovil(prev => ({ ...prev, bank: e.target.value }))}
                                        placeholder="Ej: Banesco (0134)"
                                        className="w-full bg-slate-50 border border-slate-200 pl-9 pr-3 py-2.5 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-primary/20"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Teléfono Pago Móvil</label>
                                <div className="relative">
                                    <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                                    <input
                                        type="text"
                                        value={un2x3PagoMovil.phone}
                                        onChange={(e) => setUn2x3PagoMovil(prev => ({ ...prev, phone: e.target.value }))}
                                        placeholder="Ej: 04141234567"
                                        className="w-full bg-slate-50 border border-slate-200 pl-9 pr-3 py-2.5 rounded-xl text-xs font-mono font-bold text-slate-800 outline-none focus:ring-2 focus:ring-primary/20"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Cédula o RIF</label>
                                <div className="relative">
                                    <Shield className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                                    <input
                                        type="text"
                                        value={un2x3PagoMovil.idf}
                                        onChange={(e) => setUn2x3PagoMovil(prev => ({ ...prev, idf: e.target.value }))}
                                        placeholder="Ej: J-50123456-7"
                                        className="w-full bg-slate-50 border border-slate-200 pl-9 pr-3 py-2.5 rounded-xl text-xs font-mono font-bold text-slate-800 outline-none focus:ring-2 focus:ring-primary/20"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Titular de la Cuenta</label>
                                <div className="relative">
                                    <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                                    <input
                                        type="text"
                                        value={un2x3PagoMovil.name}
                                        onChange={(e) => setUn2x3PagoMovil(prev => ({ ...prev, name: e.target.value }))}
                                        placeholder="Ej: Un 2x3 Inversiones C.A."
                                        className="w-full bg-slate-50 border border-slate-200 pl-9 pr-3 py-2.5 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-primary/20"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* ========================================================= */}
                        {/* SECCIÓN 3: MONITOR DE CLIMA OPERATIVO (EN TIEMPO REAL) */}
                        {/* ========================================================= */}
                        <div className="lg:col-span-2 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 md:p-8 rounded-[32px] text-white shadow-xl shadow-indigo-950/20 border border-indigo-900/50">
                            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
                                <div className="space-y-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="px-3 py-1 bg-sky-400/20 text-sky-300 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 border border-sky-400/30">
                                            <CloudRain className="w-3.5 h-3.5 text-sky-400" />
                                            Radar Meteorológico en Vivo
                                        </span>
                                        <span className="px-2.5 py-0.5 bg-emerald-500/20 text-emerald-300 rounded-full text-[10px] font-bold border border-emerald-500/30">
                                            Tarifas Fijas Transparentes
                                        </span>
                                    </div>
                                    <h3 className="text-2xl font-black tracking-tight text-white">Monitor de Clima Operativo</h3>
                                    <p className="text-xs text-slate-300 max-w-xl font-medium leading-relaxed">
                                        Visualización del clima en tiempo real para conocimiento operativo del equipo. <strong className="text-white">Ni el clima ni el tráfico alteran las tarifas ni generan recargos dinámicos</strong>, garantizando precios transparentes para clientes y conductores.
                                    </p>
                                </div>

                                {/* Live Operational City Weather Card */}
                                {cityWeather ? (
                                    <div className="flex items-center gap-4 bg-white/10 px-5 py-3.5 rounded-2xl border border-white/15 text-white backdrop-blur-md shadow-lg">
                                        <span className="text-3xl select-none">{cityWeather.conditionEmoji}</span>
                                        <div>
                                            <div className="font-black text-base flex items-center gap-2">
                                                <span>{cityWeather.temperature}°C</span>
                                                <span className="text-white/40">•</span>
                                                <span>{cityWeather.conditionText}</span>
                                            </div>
                                            <div className="text-xs text-slate-300 font-medium flex items-center gap-3 mt-0.5">
                                                <span>🌧️ Prob. Lluvia: <strong className="text-sky-300">{cityWeather.rainProbability}%</strong></span>
                                                <span>💨 Viento: {cityWeather.windSpeed} km/h</span>
                                                {cityWeather.isRaining && (
                                                    <span className="bg-blue-500/40 text-blue-200 px-2 py-0.5 rounded text-[10px] font-black animate-pulse">
                                                        Lluvia actual
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-xs text-slate-400 italic bg-white/5 px-4 py-3 rounded-xl border border-white/10">
                                        Cargando datos meteorológicos...
                                    </div>
                                )}
                            </div>
                        </div>


                        {/* WhatsApp Template Editor */}
                        <div className="lg:col-span-2 bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm space-y-6">
                            <div className="flex items-center gap-4 border-b border-slate-100 pb-6">
                                <div className="w-12 h-12 bg-green-50 text-green-600 rounded-2xl flex items-center justify-center">
                                    <FileText className="w-6 h-6" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-black text-slate-900 tracking-tight">Plantilla de WhatsApp</h3>
                                    <p className="text-xs font-medium text-slate-500">Configura el mensaje que se enviará al confirmar un pedido.</p>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                    <p className="text-xs font-bold text-slate-600 mb-2 uppercase tracking-wide">Variables Disponibles:</p>
                                    <div className="flex flex-wrap gap-2 text-[10px] font-medium text-slate-500">
                                        <span className="bg-white px-2 py-1 rounded border border-slate-200">{"{OrderId}"}</span>
                                        <span className="bg-white px-2 py-1 rounded border border-slate-200">{"{RestaurantName}"}</span>
                                        <span className="bg-white px-2 py-1 rounded border border-slate-200">{"{UserName}"}</span>
                                        <span className="bg-white px-2 py-1 rounded border border-slate-200">{"{Cedula}"}</span>
                                        <span className="bg-white px-2 py-1 rounded border border-slate-200">{"{UserPhone}"}</span>
                                        <span className="bg-white px-2 py-1 rounded border border-slate-200">{"{OrderItems}"}</span>
                                        <span className="bg-white px-2 py-1 rounded border border-slate-200">{"{DeliveryFee}"}</span>
                                        <span className="bg-white px-2 py-1 rounded border border-slate-200">{"{Total}"}</span>
                                        <span className="bg-white px-2 py-1 rounded border border-slate-200">{"{LocationText}"}</span>
                                        <span className="bg-white px-2 py-1 rounded border border-slate-200">{"{OrderNotes}"}</span>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-black text-slate-700 uppercase mb-2 ml-1">Mensaje</label>
                                    <textarea
                                        value={settings.whatsappMessageTemplate}
                                        onChange={(e) => setSettings({ ...settings, whatsappMessageTemplate: e.target.value })}
                                        rows={10}
                                        className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-2xl text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-primary/20 whitespace-pre-wrap"
                                        placeholder="Escribe la plantilla del mensaje de WhatsApp aquí..."
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="lg:col-span-2">
                            <button
                                onClick={handleSaveSettings}
                                disabled={savingSettings}
                                className="w-full bg-primary text-slate-900 font-black py-4 rounded-2xl shadow-lg shadow-primary/20 active:scale-[0.98] transition-all disabled:opacity-50"
                            >
                                {savingSettings ? 'Guardando...' : 'Guardar Todas las Configuraciones'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Document Review Modal */}
            <AnimatePresence>
                {selectedDriver && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                    >
                        <motion.div
                            initial={{ scale: 0.95, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.95, y: 20 }}
                            className="bg-white w-full max-w-2xl rounded-[32px] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
                        >
                            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                                <div>
                                    <h3 className="text-xl font-black text-slate-900">Revisión de Documentos</h3>
                                    <p className="text-sm font-medium text-slate-500">{selectedDriver.fullName}</p>
                                </div>
                                <button onClick={() => setSelectedDriver(null)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
                                    <XCircle className="w-6 h-6" />
                                </button>
                            </div>

                            <div className="p-6 overflow-y-auto space-y-6">
                                {/* Ficha de Auditoría del Piloto */}
                                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                                    <h4 className="text-xs font-black text-slate-500 uppercase tracking-wider">Ficha de Registro y Auditoría</h4>
                                    
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                                        <div className="bg-white p-2.5 rounded-xl border border-slate-100 shadow-xs">
                                            <span className="text-slate-400 font-bold block mb-0.5">Cédula</span>
                                            <span className="font-bold text-slate-800">{selectedDriver.cedula}</span>
                                        </div>
                                        <div className="bg-white p-2.5 rounded-xl border border-slate-100 shadow-xs">
                                            <span className="text-slate-400 font-bold block mb-0.5">RIF</span>
                                            <span className="font-bold text-slate-800">{selectedDriver.rif || 'No especificado'}</span>
                                        </div>
                                        <div className="bg-white p-2.5 rounded-xl border border-slate-100 shadow-xs">
                                            <span className="text-slate-400 font-bold block mb-0.5">Teléfono Móvil</span>
                                            <span className="font-bold text-slate-800">{selectedDriver.phone}</span>
                                        </div>
                                        <div className="bg-white p-2.5 rounded-xl border border-slate-100 shadow-xs">
                                            <span className="text-slate-400 font-bold block mb-0.5">Cumpleaños / Edad</span>
                                            <span className="font-bold text-slate-800">
                                                {selectedDriver.birthdate ? `🎂 ${selectedDriver.birthdate}` : ''} ({selectedDriver.age} años)
                                            </span>
                                        </div>
                                        <div className="bg-white p-2.5 rounded-xl border border-slate-100 shadow-xs">
                                            <span className="text-slate-400 font-bold block mb-0.5">Vehículo Registrado</span>
                                            <span className="font-bold text-slate-800 capitalize">
                                                {selectedDriver.vehicleType} {selectedDriver.vehicleBrand ? `• ${selectedDriver.vehicleBrand} ${selectedDriver.vehicleModel || ''}` : ''}
                                            </span>
                                        </div>
                                        <div className="bg-white p-2.5 rounded-xl border border-slate-100 shadow-xs">
                                            <span className="text-slate-400 font-bold block mb-0.5">Año y Placa</span>
                                            <span className="font-bold text-slate-800">
                                                {selectedDriver.vehicleYear ? `${selectedDriver.vehicleYear} • ` : ''}{selectedDriver.vehiclePlate || 'N/A'}
                                            </span>
                                        </div>
                                        <div className="bg-white p-2.5 rounded-xl border border-slate-100 shadow-xs">
                                            <span className="text-slate-400 font-bold block mb-0.5">Color y Clima</span>
                                            <span className="font-bold text-slate-800 flex items-center gap-2">
                                                <span>{selectedDriver.vehicleColor || 'No especificado'}</span>
                                                {selectedDriver.vehicleType === 'carro' && (
                                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-black ${
                                                        selectedDriver.hasAc ? 'bg-cyan-100 text-cyan-700' : 'bg-slate-100 text-slate-500'
                                                    }`}>
                                                        {selectedDriver.hasAc ? '❄️ Con A/C' : 'Sin A/C'}
                                                    </span>
                                                )}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Declaración de Propiedad */}
                                    <div className="bg-emerald-50 border border-emerald-100 text-emerald-800 text-xs px-3 py-2 rounded-xl flex items-center gap-2">
                                        <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                                        <span className="font-medium">
                                            {selectedDriver.isVehicleOwner 
                                                ? 'Declaración jurada: Propietario o legalmente autorizado para conducir este vehículo.' 
                                                : 'Vehículo en trámite de propiedad.'}
                                        </span>
                                    </div>

                                    {/* Dirección Base Registrada */}
                                    {(selectedDriver.registeredHomeAddress || selectedDriver.homeLocation) && (
                                        <div className="bg-white p-3 rounded-xl border border-slate-200 text-xs space-y-1">
                                            <div className="flex items-center justify-between">
                                                <span className="text-slate-400 font-bold uppercase tracking-wider">Dirección Base Permanente</span>
                                                {selectedDriver.homeLocation?.coords && (
                                                    <a 
                                                        href={`https://www.google.com/maps?q=${selectedDriver.homeLocation.coords.lat},${selectedDriver.homeLocation.coords.lng}`}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="text-indigo-600 hover:text-indigo-700 font-bold flex items-center gap-1"
                                                    >
                                                        <MapPin className="w-3.5 h-3.5" /> Ver en Mapa
                                                    </a>
                                                )}
                                            </div>
                                            <p className="font-bold text-slate-800">
                                                {selectedDriver.homeLocation?.city || selectedDriver.registeredHomeAddress?.city}, {selectedDriver.homeLocation?.state || selectedDriver.registeredHomeAddress?.state}
                                            </p>
                                            {selectedDriver.homeLocation?.name && (
                                                <p className="text-slate-600 font-medium">Lugar: {selectedDriver.homeLocation.name}</p>
                                            )}
                                            {selectedDriver.homeLocation?.reference && (
                                                <p className="text-slate-500 font-medium">Ref: {selectedDriver.homeLocation.reference}</p>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <h4 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2"><User className="w-4 h-4 text-slate-400" /> Selfie y Rostro</h4>
                                    <a href={selectedDriver.documents.selfieUrl} target="_blank" rel="noreferrer" className="block relative group rounded-2xl overflow-hidden border border-slate-200 aspect-video bg-slate-100">
                                        <img 
                                            src={selectedDriver.documents.selfieUrl} 
                                            alt="Selfie" 
                                            className="w-full h-full object-cover" 
                                            onError={(e) => {
                                                (e.target as HTMLImageElement).src = 'https://via.placeholder.com/150?text=Error';
                                            }}
                                        />
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                            <div className="bg-white/20 backdrop-blur-md p-2 rounded-full border border-white/30">
                                                <ExternalLink className="text-white w-5 h-5" />
                                            </div>
                                        </div>
                                    </a>
                                </div>
                                <div>
                                    <h4 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2"><Truck className="w-4 h-4 text-slate-400" /> Vehículo (Placa: {selectedDriver.vehiclePlate})</h4>
                                    <a href={selectedDriver.documents.vehicleUrl || (selectedDriver.documents as any).vehicleImageUrl} target="_blank" rel="noreferrer" className="block relative group rounded-2xl overflow-hidden border border-slate-200 aspect-video bg-slate-100">
                                        <img 
                                            src={selectedDriver.documents.vehicleUrl || (selectedDriver.documents as any).vehicleImageUrl} 
                                            alt="Vehicle" 
                                            className="w-full h-full object-cover" 
                                            onError={(e) => {
                                                (e.target as HTMLImageElement).src = 'https://via.placeholder.com/150?text=Error';
                                            }}
                                        />
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                            <div className="bg-white/20 backdrop-blur-md p-2 rounded-full border border-white/30">
                                                <ExternalLink className="text-white w-5 h-5" />
                                            </div>
                                        </div>
                                    </a>
                                </div>
                                <div>
                                    <h4 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2"><FileText className="w-4 h-4 text-slate-400" /> Licencia / Documento Legal</h4>
                                    <a href={selectedDriver.documents.licenseUrl} target="_blank" rel="noreferrer" className="block relative group rounded-2xl overflow-hidden border border-slate-200 aspect-video bg-slate-100">
                                        <img 
                                            src={selectedDriver.documents.licenseUrl} 
                                            alt="License" 
                                            className="w-full h-full object-cover" 
                                            onError={(e) => {
                                                (e.target as HTMLImageElement).src = 'https://via.placeholder.com/150?text=Error';
                                            }}
                                        />
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                            <div className="bg-white/20 backdrop-blur-md p-2 rounded-full border border-white/30">
                                                <ExternalLink className="text-white w-5 h-5" />
                                            </div>
                                        </div>
                                    </a>
                                </div>
                            </div>

                            <div className="p-6 border-t border-slate-100 bg-slate-50 flex gap-3">
                                <button
                                    onClick={() => handleUpdateStatus(selectedDriver.id, 'rejected')}
                                    className="flex-1 bg-white border-2 border-red-100 text-red-600 font-black py-4 rounded-2xl hover:bg-red-50 active:scale-95 transition-all"
                                >
                                    Rechazar Documentos
                                </button>
                                <button
                                    onClick={() => handleUpdateStatus(selectedDriver.id, 'active')}
                                    className="flex-1 bg-emerald-500 text-white font-black py-4 rounded-2xl shadow-lg shadow-emerald-500/20 active:scale-95 transition-all"
                                >
                                    Aprobar Piloto
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}

                {/* Finance Modal */}
                {selectedDriverFinance && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                    >
                        <motion.div
                            initial={{ scale: 0.95, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.95, y: 20 }}
                            className="bg-white w-full max-w-md rounded-[32px] shadow-2xl overflow-hidden"
                        >
                            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                                <div>
                                    <h3 className="text-xl font-black text-slate-900">Pago a Repartidor</h3>
                                    <p className="text-sm font-medium text-slate-500">{selectedDriverFinance.fullName}</p>
                                </div>
                                <button onClick={() => setSelectedDriverFinance(null)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
                                    <XCircle className="w-6 h-6" />
                                </button>
                            </div>

                            <div className="p-8 text-center space-y-4">
                                <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mx-auto text-primary">
                                    <DollarSign className="w-10 h-10" />
                                </div>
                                <div>
                                    <p className="text-slate-500 font-medium uppercase tracking-widest text-xs mb-1">Deuda Pendiente</p>
                                    <DualPrice usdAmount={driverPendingBalance.total} usdClassName="text-5xl font-black text-slate-900 tracking-tighter" showDivider={false} className="flex flex-col" />
                                    <p className="text-sm text-slate-500 mt-2 font-medium">Correspondiente a {driverPendingBalance.count} pedidos sin liquidar.</p>
                                </div>
                            </div>

                            <div className="p-6 bg-slate-50 border-t border-slate-100 space-y-3">
                                <button
                                    onClick={handlePayDriver}
                                    disabled={driverPendingBalance.count === 0 || payingDriver}
                                    className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-black py-4 rounded-2xl shadow-lg shadow-emerald-500/20 active:scale-95 transition-all disabled:opacity-50 disabled:active:scale-100 disabled:shadow-none"
                                >
                                    {payingDriver ? 'Procesando...' : 'Marcar Saldo como Pagado'}
                                </button>
                                <button
                                    onClick={() => setSelectedDriverFinance(null)}
                                    className="w-full bg-white border-2 border-slate-200 text-slate-600 font-bold py-3.5 rounded-2xl hover:bg-slate-50 transition-colors"
                                >
                                    Cancelar
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}

                {/* Fleet Map Modal */}
                {showFleetMap && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-[100]"
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            className="bg-white w-full max-w-5xl h-[85vh] rounded-[40px] overflow-hidden flex flex-col shadow-2xl"
                        >
                            <div className="p-6 flex items-center justify-between border-b border-slate-100">
                                <div>
                                    <h2 className="text-2xl font-black text-slate-900 flex items-center gap-3">
                                        <MapIcon className="w-6 h-6 text-primary" />
                                        Mapa de Flota de Pilotos
                                    </h2>
                                    <p className="text-sm font-bold text-slate-500 uppercase tracking-widest mt-1">
                                        Visualización de ubicaciones base ({activeDrivers.filter(d => d.homeLocation?.coords).length} pilotos con GPS)
                                    </p>
                                </div>
                                <button
                                    onClick={() => {
                                        setShowFleetMap(false);
                                        setActiveMarker(null);
                                    }}
                                    className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                                >
                                    <XCircle className="w-6 h-6" />
                                </button>
                            </div>

                            <div className="flex-1 relative bg-slate-100">
                                {isLoaded ? (
                                    <GoogleMap
                                        mapContainerStyle={{ width: '100%', height: '100%' }}
                                        center={mapCenter}
                                        zoom={12}
                                        options={{
                                            styles: [
                                                {
                                                    "featureType": "poi",
                                                    "stylers": [{ "visibility": "off" }]
                                                }
                                            ],
                                            disableDefaultUI: false,
                                            zoomControl: true,
                                            streetViewControl: false,
                                        }}
                                    >
                                        {activeDrivers.filter(d => d.homeLocation?.coords).map(driver => (
                                            <Marker
                                                key={driver.id}
                                                position={driver.homeLocation!.coords!}
                                                onClick={() => setActiveMarker(driver.id)}
                                                icon={{
                                                    url: driver.vehicleType === 'moto' 
                                                        ? 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png'
                                                        : 'https://maps.google.com/mapfiles/ms/icons/red-dot.png',
                                                }}
                                            >
                                                {activeMarker === driver.id ? (
                                                    <InfoWindow onCloseClick={() => setActiveMarker(null)}>
                                                        <div className="p-3 min-w-[200px]">
                                                            <div className="flex items-center gap-3 mb-3">
                                                                <img src={driver.documents.selfieUrl} alt="" className="w-12 h-12 rounded-full object-cover" />
                                                                <div>
                                                                    <p className="font-black text-slate-900 leading-none">{driver.fullName}</p>
                                                                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-1">{driver.vehicleType} • {driver.vehiclePlate}</p>
                                                                </div>
                                                            </div>
                                                            <div className="space-y-1.5 border-t border-slate-100 pt-3">
                                                                <p className="text-xs font-bold text-slate-700 flex items-center gap-2">
                                                                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                                                                    {driver.homeLocation?.city}, {driver.homeLocation?.state}
                                                                </p>
                                                                <p className="text-xs font-bold text-slate-600 flex items-center gap-2">
                                                                    <Activity className="w-3.5 h-3.5 text-slate-400" />
                                                                    Estado: <span className={driver.isOnline ? 'text-emerald-600' : 'text-slate-400'}>{driver.isOnline ? 'Online' : 'Offline'}</span>
                                                                </p>
                                                            </div>
                                                            <div className="mt-4 flex gap-2">
                                                                <a 
                                                                    href={`https://www.google.com/maps/dir/?api=1&destination=${driver.homeLocation?.coords?.lat},${driver.homeLocation?.coords?.lng}`}
                                                                    target="_blank"
                                                                    rel="noreferrer"
                                                                    className="flex-1 bg-primary text-slate-900 text-[10px] font-black uppercase py-2 px-3 rounded-lg text-center shadow-lg shadow-primary/20"
                                                                >
                                                                    Cómo llegar
                                                                </a>
                                                            </div>
                                                        </div>
                                                    </InfoWindow>
                                                ) : null}
                                            </Marker>
                                        ))}
                                    </GoogleMap>
                                ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center gap-3">
                                        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                                        <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Cargando Mapa...</p>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
            {/* TAB: HISTORY */}
            {activeTab === 'history' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                    <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm">
                        <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-8">
                            <div>
                                <h3 className="text-xl font-black text-slate-800">Auditoría de Desempeño</h3>
                                <p className="text-sm font-medium text-slate-500">Analiza el tiempo de respuesta y entrega de los pilotos.</p>
                            </div>
                            <div className="relative w-full md:w-80">
                                <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="Buscar piloto por nombre..."
                                    value={historySearchTerm}
                                    onChange={(e) => setHistorySearchTerm(e.target.value)}
                                    className="w-full bg-slate-50 border-none pl-12 pr-4 py-3 rounded-2xl focus:ring-2 focus:ring-primary font-medium"
                                />
                            </div>
                        </div>

                        {loadingHistory ? (
                            <div className="py-20 flex flex-col items-center gap-4">
                                <Activity className="w-12 h-12 text-primary animate-pulse" />
                                <p className="font-bold text-slate-400 capitalize tracking-widest text-xs">Cargando historial...</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full border-separate border-spacing-y-2">
                                    <thead>
                                        <tr className="text-slate-400 text-xs font-black uppercase tracking-widest">
                                            <th className="px-4 py-2 text-left">Pedido</th>
                                            <th className="px-4 py-2 text-left">Piloto</th>
                                            <th className="px-4 py-2 text-left">Origen/Destino</th>
                                            <th className="px-4 py-2 text-center">Duración Total</th>
                                            <th className="px-4 py-2 text-right">Fecha</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {completedOrders
                                            .filter(o => 
                                                !historySearchTerm || 
                                                o.driverName?.toLowerCase().includes(historySearchTerm.toLowerCase())
                                            )
                                            .map((order) => (
                                            <tr key={order.id} className="group hover:bg-slate-50 transition-colors">
                                                <td className="px-4 py-4 rounded-l-2xl border-y border-l border-slate-100 bg-white">
                                                    <div className="flex flex-col">
                                                        <span className="font-black text-slate-900 group-hover:text-primary transition-colors">#{order.id.slice(-6).toUpperCase()}</span>
                                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                                                            {order.restaurantName || 'Tienda'}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-4 border-y border-slate-100 bg-white">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                                                            {order.driverName?.charAt(0) || '?'}
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className="font-bold text-slate-800 text-sm">{order.driverName || 'N/A'}</span>
                                                            <span className="text-[10px] text-slate-400 font-medium">Piloto</span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-4 border-y border-slate-100 bg-white">
                                                    <div className="flex flex-col max-w-[200px]">
                                                        <div className="flex items-center gap-1 text-xs font-bold text-slate-600 truncate">
                                                            <MapPin className="w-3 h-3 shrink-0" />
                                                            {order.restaurantName || 'Pickup'}
                                                        </div>
                                                        <div className="flex items-center gap-1 text-[10px] text-slate-400 truncate mt-1">
                                                            <Navigation className="w-3 h-3 shrink-0" />
                                                            {order.clientAddress || 'S/D'}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-4 border-y border-slate-100 bg-white text-center">
                                                    {order.totalServiceDuration !== undefined ? (
                                                        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-700 rounded-lg border border-amber-100 font-black text-sm">
                                                            <Clock className="w-3.5 h-3.5" />
                                                            {formatDuration(order.totalServiceDuration)}
                                                        </div>
                                                    ) : (
                                                        <span className="text-slate-300 font-bold text-xs uppercase italic">No registrado</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-4 rounded-r-2xl border-y border-r border-slate-100 bg-white text-right">
                                                    <span className="text-xs font-bold text-slate-500">
                                                        {order.createdAt?.toDate?.().toLocaleDateString('es-VE')}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>

                                {completedOrders.length === 0 && !loadingHistory && (
                                    <div className="py-12 text-center bg-slate-50 rounded-3xl mt-4 border-2 border-dashed border-slate-200">
                                        <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                                        <h4 className="font-bold text-slate-600">Sin registros de entrega</h4>
                                        <p className="text-sm text-slate-400">Cuando se completen pedidos, verás las métricas aquí.</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
