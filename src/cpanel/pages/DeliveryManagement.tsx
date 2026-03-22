import React, { useState, useEffect } from 'react';
import { collection, query, getDocs, doc, updateDoc, onSnapshot, where, writeBatch, setDoc, deleteDoc } from 'firebase/firestore';
import { db, storage } from '../../lib/firebase';
import { ref, deleteObject } from 'firebase/storage';
import { DeliveryDriver } from '../../lib/delivery-service';
import { Truck, CheckCircle2, XCircle, FileText, User, DollarSign, ExternalLink, Plus, Trash2, Clock, Sun, Moon, Activity } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function DeliveryManagement() {
    const [drivers, setDrivers] = useState<DeliveryDriver[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'requests' | 'active' | 'finances'>('requests');
    const [selectedDriver, setSelectedDriver] = useState<DeliveryDriver | null>(null);
    const [selectedDriverFinance, setSelectedDriverFinance] = useState<DeliveryDriver | null>(null);
    const [driverPendingBalance, setDriverPendingBalance] = useState({ total: 0, count: 0 });
    const [payingDriver, setPayingDriver] = useState(false);
    const [updateRequests, setUpdateRequests] = useState<any[]>([]);
    const [settings, setSettings] = useState<any>({
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
            moto: [{ from: 0, to: 2, clientPrice: 1.5, driverPrice: 1.0 }],
            carro: [{ from: 0, to: 2, clientPrice: 3.0, driverPrice: 2.0 }],
            ejecutivo: [{ from: 0, to: 2, clientPrice: 7.0, driverPrice: 5.0 }]
        },
        whatsappMessageTemplate: `👋 ¡Hola *{RestaurantName}*!
Soy *{UserName}* y vengo desde la app en un 2x3 🚀. Mi identificación es *{Cedula}* y requiero el siguiente pedido:

🛒 *Detalles del Pedido:*
{OrderItems}

🛵 *Delivery:* \${DeliveryFee}
💰 *Total:* \${Total}

📍 Adjunto mi ubicación para la entrega y mi número de contacto por si requieren llamar.

🗺️ *Ubicación:* {LocationText}
📱 *Mi número:* {UserPhone}

{OrderNotes}

_Enviado desde Deli Express App_`
    });
    const [activeShift, setActiveShift] = useState<'day' | 'night'>('day');
    const [savingSettings, setSavingSettings] = useState(false);

    useEffect(() => {
        const q = query(collection(db, 'delivery_drivers'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as DeliveryDriver[];
            setDrivers(data);
            setLoading(false);
        });

        const qUpdates = query(collection(db, 'delivery_update_requests'), where('status', '==', 'pending'));
        const unsubscribeUpdates = onSnapshot(qUpdates, (snapshot) => {
            const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            setUpdateRequests(data);
        });

        const qSettings = doc(db, 'delivery_settings', 'settings');
        const unsubscribeSettings = onSnapshot(qSettings, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setSettings((prev: any) => ({
                    ...prev,
                    ...data,
                    transportRates: data.transportRates || prev.transportRates
                }));
            }
        });

        return () => {
            unsubscribe();
            unsubscribeUpdates();
            unsubscribeSettings();
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
                if (driver && driver.documents) {
                    const urls = [
                        driver.documents.selfieUrl,
                        driver.documents.vehicleUrl,
                        (driver.documents as any).vehicleImageUrl, // Checking both for consistency
                        driver.documents.licenseUrl
                    ].filter(Boolean);

                    for (const url of urls) {
                        try {
                            const fileRef = ref(storage, url);
                            await deleteObject(fileRef);
                        } catch (err) {
                            console.error("Error deleting file during rejection:", url, err);
                        }
                    }
                }

                // Delete update requests for this driver
                const qUpdates = query(collection(db, 'delivery_update_requests'), where('driverId', '==', id));
                const updateSnaps = await getDocs(qUpdates);
                for (const docUpd of updateSnaps.docs) {
                    // Try to delete files in update request too if they exist
                    const updData = docUpd.data();
                    if (updData.newData && updData.newData.documents) {
                        const updUrls = [
                            updData.newData.documents.selfieUrl,
                            updData.newData.documents.vehicleUrl,
                            updData.newData.documents.licenseUrl
                        ].filter(Boolean);
                        for (const u of updUrls) {
                            try { await deleteObject(ref(storage, u)); } catch (e) { }
                        }
                    }
                    await deleteDoc(docUpd.ref);
                }

                await deleteDoc(doc(db, 'delivery_drivers', id));
                alert("Piloto rechazado. Se eliminó el perfil, solicitudes de actualización y documentos correctamente.");
            } else {
                await updateDoc(doc(db, 'delivery_drivers', id), { status });
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
            await updateDoc(doc(db, 'delivery_drivers', id), {
                availability,
                isOnline: availability !== 'offline'
            });
        } catch (error) {
            console.error("Error updating availability:", error);
            alert("Error al actualizar disponibilidad");
        }
    };

    const handleApproveUpdateRequest = async (request: any) => {
        if (!window.confirm(`¿Aprobar actualización de datos para ${request.driverName}?`)) return;
        try {
            const batch = writeBatch(db);
            const driverRef = doc(db, 'delivery_drivers', request.driverId);
            
            const driverUpdate: any = {};
            if (request.newData.cedula) driverUpdate.cedula = request.newData.cedula;
            if (request.newData.vehicleType) driverUpdate.vehicleType = request.newData.vehicleType;
            if (request.newData.vehiclePlate) driverUpdate.vehiclePlate = request.newData.vehiclePlate;
            if (request.newData.documents) driverUpdate.documents = request.newData.documents;

            if (Object.keys(driverUpdate).length > 0) {
                batch.update(driverRef, driverUpdate);
            }

            const requestRef = doc(db, 'delivery_update_requests', request.id);
            batch.update(requestRef, { status: 'approved' });

            await batch.commit();
            alert('Datos actualizados correctamente.');
        } catch (error) {
            console.error(error);
            alert('Error al aprobar la actualización.');
        }
    };

    const handleRejectUpdateRequest = async (requestId: string) => {
        if (!window.confirm('¿Rechazar esta solicitud de actualización?')) return;
        try {
            await updateDoc(doc(db, 'delivery_update_requests', requestId), { status: 'rejected' });
        } catch (error) {
            console.error(error);
        }
    };

    const handleOpenFinanceModal = async (driver: DeliveryDriver) => {
        setSelectedDriverFinance(driver);
        setDriverPendingBalance({ total: 0, count: 0 }); // Reset while loading

        try {
            const q = query(
                collection(db, 'orders'),
                where('deliveryDriverId', '==', driver.id),
                where('status', '==', 'completed')
            );
            const snapshot = await getDocs(q);
            const pending = snapshot.docs.filter(doc => !doc.data().deliveryPaid);

            const total = pending.reduce((sum, doc) => {
                const data = doc.data();
                return sum + (data.driverPayout || (data.deliveryFee ? data.deliveryFee * 0.8 : 0));
            }, 0);
            setDriverPendingBalance({ total, count: pending.length });
        } catch (error) {
            console.error("Error fetching driver balance:", error);
        }
    };

    const handlePayDriver = async () => {
        if (!selectedDriverFinance || driverPendingBalance.count === 0) return;

        if (!window.confirm(`¿Confirmas el pago de $${driverPendingBalance.total.toFixed(2)} al repartidor ${selectedDriverFinance.fullName}?`)) return;

        setPayingDriver(true);
        try {
            // Find all pending orders for this driver again just to be safe
            const q = query(
                collection(db, 'orders'),
                where('deliveryDriverId', '==', selectedDriverFinance.id),
                where('status', '==', 'completed')
            );
            const snapshot = await getDocs(q);
            const pendingDocs = snapshot.docs.filter(doc => !doc.data().deliveryPaid);

            const batch = writeBatch(db);
            pendingDocs.forEach(d => {
                batch.update(d.ref, { deliveryPaid: true });
            });

            await batch.commit();
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
            await setDoc(doc(db, 'delivery_settings', 'settings'), settings, { merge: true });
            alert('Configuraciones guardadas correctamente.');
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
                <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
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
            </div>

            {/* TABS */}
            <div className="flex bg-slate-100 p-1 rounded-2xl w-max relative z-0">
                {(['requests', 'active', 'finances'] as const).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`relative px-6 py-2.5 rounded-xl font-bold text-sm transition-all z-10 ${activeTab === tab ? 'text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
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
                                : 'Finanzas y Tarifas'}
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
                                                                <a href={req.newData.documents.selfieUrl} target="_blank" rel="noreferrer">
                                                                    <img src={req.newData.documents.selfieUrl} alt="Selfie" className="w-16 h-16 object-cover rounded-xl border border-slate-200" />
                                                                </a>
                                                            </div>
                                                        )}
                                                        {req.newData.documents.licenseUrl && (
                                                            <div className="flex flex-col items-center">
                                                                <span className="text-[9px] font-bold text-slate-400 uppercase mb-1">Licencia</span>
                                                                <a href={req.newData.documents.licenseUrl} target="_blank" rel="noreferrer">
                                                                    <img src={req.newData.documents.licenseUrl} alt="Licencia" className="w-16 h-16 object-cover rounded-xl border border-slate-200" />
                                                                </a>
                                                            </div>
                                                        )}
                                                        {req.newData.documents.vehicleUrl && (
                                                            <div className="flex flex-col items-center">
                                                                <span className="text-[9px] font-bold text-slate-400 uppercase mb-1">Vehículo</span>
                                                                <a href={req.newData.documents.vehicleUrl} target="_blank" rel="noreferrer">
                                                                    <img src={req.newData.documents.vehicleUrl} alt="Vehículo" className="w-16 h-16 object-cover rounded-xl border border-slate-200" />
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
                                                <img src={driver.documents.selfieUrl} alt="Selfie" className="w-16 h-16 rounded-full object-cover bg-slate-100" />
                                                <div>
                                                    <h3 className="font-bold text-slate-900 leading-tight">{driver.fullName}</h3>
                                                    <p className="text-xs text-slate-500">{driver.phone} • {driver.age} años</p>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2 text-xs">
                                                <div className="bg-slate-50 p-2 rounded-lg">
                                                    <span className="text-slate-400 font-bold uppercase tracking-wider block mb-0.5">Cédula</span>
                                                    <span className="font-bold text-slate-700">{driver.cedula}</span>
                                                </div>
                                                <div className="bg-slate-50 p-2 rounded-lg">
                                                    <span className="text-slate-400 font-bold uppercase tracking-wider block mb-0.5">Vehículo</span>
                                                    <span className="font-bold text-slate-700 capitalize">{driver.vehicleType}</span>
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
                                                <div className="relative">
                                                    <img src={driver.documents.selfieUrl} alt="Pic" className="w-10 h-10 rounded-full object-cover" />
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
                                            <button
                                                onClick={() => handleOpenFinanceModal(driver)}
                                                className="text-indigo-600 text-xs font-bold hover:underline opacity-0 group-hover:opacity-100 transition-opacity"
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
                    {/* Shift Selector */}
                    <div className="bg-white p-2 rounded-2xl border border-slate-200 w-fit flex gap-1">
                        <button
                            onClick={() => setActiveShift('day')}
                            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-black text-sm transition-all ${activeShift === 'day' ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20' : 'text-slate-400 hover:bg-slate-50'}`}
                        >
                            <Sun className="w-4 h-4" /> Horario Diurno
                        </button>
                        <button
                            onClick={() => setActiveShift('night')}
                            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-black text-sm transition-all ${activeShift === 'night' ? 'bg-indigo-950 text-white shadow-lg shadow-indigo-950/20' : 'text-slate-400 hover:bg-slate-50'}`}
                        >
                            <Moon className="w-4 h-4" /> Horario Nocturno
                        </button>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* Time Configuration */}
                        <div className="lg:col-span-2 bg-slate-50 p-6 rounded-[2rem] border border-slate-100 flex flex-col md:flex-row gap-6 items-center">
                            <div className="flex items-center gap-3">
                                <Clock className="w-6 h-6 text-slate-400" />
                                <h4 className="font-black text-slate-700 uppercase tracking-widest text-xs">Ajustes del Horario</h4>
                            </div>
                            <div className="flex items-center gap-4 flex-1">
                                <div className="flex-1">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-1 ml-1">Inicio</label>
                                    <input
                                        type="time"
                                        value={activeShift === 'day' ? settings.dayShift.start : settings.nightShift.start}
                                        onChange={(e) => {
                                            const key = activeShift === 'day' ? 'dayShift' : 'nightShift';
                                            setSettings({ ...settings, [key]: { ...settings[key], start: e.target.value } });
                                        }}
                                        className="w-full bg-white border border-slate-200 px-4 py-2.5 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20"
                                    />
                                </div>
                                <div className="flex-1">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-1 ml-1">Fin</label>
                                    <input
                                        type="time"
                                        value={activeShift === 'day' ? settings.dayShift.end : settings.nightShift.end}
                                        onChange={(e) => {
                                            const key = activeShift === 'day' ? 'dayShift' : 'nightShift';
                                            setSettings({ ...settings, [key]: { ...settings[key], end: e.target.value } });
                                        }}
                                        className="w-full bg-white border border-slate-200 px-4 py-2.5 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Pilot Rates Editor */}
                        <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm space-y-6">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center">
                                        <Truck className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-black text-slate-900 tracking-tight">Costo Repartidor</h3>
                                        <p className="text-xs font-medium text-slate-500">¿Cuánto gana el piloto?</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => {
                                        const key = activeShift === 'day' ? 'dayShift' : 'nightShift';
                                        const newRates = [...settings[key].driverRates, { from: 0, to: 0, price: 0 }];
                                        setSettings({ ...settings, [key]: { ...settings[key], driverRates: newRates } });
                                    }}
                                    className="bg-indigo-50 text-indigo-600 p-2.5 rounded-xl hover:bg-indigo-100 transition-colors"
                                >
                                    <Plus className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="space-y-3">
                                <div className="grid grid-cols-12 gap-3 px-2">
                                    <div className="col-span-4 text-[10px] font-black text-slate-400 uppercase">Desde (km)</div>
                                    <div className="col-span-4 text-[10px] font-black text-slate-400 uppercase">Hasta (km)</div>
                                    <div className="col-span-3 text-[10px] font-black text-slate-400 uppercase">A Pagar ($)</div>
                                </div>
                                {(activeShift === 'day' ? settings.dayShift.driverRates : settings.nightShift.driverRates).map((rate: any, idx: number) => (
                                    <div key={idx} className="grid grid-cols-12 gap-3 items-center group">
                                        <div className="col-span-4">
                                            <input
                                                type="number" step="0.1"
                                                value={rate.from}
                                                onChange={(e) => {
                                                    const key = activeShift === 'day' ? 'dayShift' : 'nightShift';
                                                    const newRates = [...settings[key].driverRates];
                                                    newRates[idx].from = parseFloat(e.target.value) || 0;
                                                    setSettings({ ...settings, [key]: { ...settings[key], driverRates: newRates } });
                                                }}
                                                className="w-full bg-slate-50 border border-slate-100 px-3 py-2.5 rounded-xl font-bold text-slate-700"
                                            />
                                        </div>
                                        <div className="col-span-4">
                                            <input
                                                type="number" step="0.1"
                                                value={rate.to}
                                                onChange={(e) => {
                                                    const key = activeShift === 'day' ? 'dayShift' : 'nightShift';
                                                    const newRates = [...settings[key].driverRates];
                                                    newRates[idx].to = parseFloat(e.target.value) || 0;
                                                    setSettings({ ...settings, [key]: { ...settings[key], driverRates: newRates } });
                                                }}
                                                className="w-full bg-slate-50 border border-slate-100 px-3 py-2.5 rounded-xl font-bold text-slate-700"
                                            />
                                        </div>
                                        <div className="col-span-3">
                                            <input
                                                type="number" step="0.1"
                                                value={rate.price}
                                                onChange={(e) => {
                                                    const key = activeShift === 'day' ? 'dayShift' : 'nightShift';
                                                    const newRates = [...settings[key].driverRates];
                                                    newRates[idx].price = parseFloat(e.target.value) || 0;
                                                    setSettings({ ...settings, [key]: { ...settings[key], driverRates: newRates } });
                                                }}
                                                className="w-full bg-slate-50 border border-slate-100 px-3 py-2.5 rounded-xl font-bold text-indigo-600"
                                            />
                                        </div>
                                        <div className="col-span-1">
                                            <button
                                                onClick={() => {
                                                    const key = activeShift === 'day' ? 'dayShift' : 'nightShift';
                                                    const newRates = settings[key].driverRates.filter((_: any, i: number) => i !== idx);
                                                    setSettings({ ...settings, [key]: { ...settings[key], driverRates: newRates } });
                                                }}
                                                className="text-slate-200 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Client Rates Editor */}
                        <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm space-y-6">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center">
                                        <DollarSign className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-black text-slate-900 tracking-tight">Costo Cliente</h3>
                                        <p className="text-xs font-medium text-slate-500">¿Cuánto paga el usuario?</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => {
                                        const key = activeShift === 'day' ? 'dayShift' : 'nightShift';
                                        const newRates = [...settings[key].clientRates, { from: 0, to: 0, price: 0 }];
                                        setSettings({ ...settings, [key]: { ...settings[key], clientRates: newRates } });
                                    }}
                                    className="bg-emerald-50 text-emerald-600 p-2.5 rounded-xl hover:bg-emerald-100 transition-colors"
                                >
                                    <Plus className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="space-y-3">
                                <div className="grid grid-cols-12 gap-3 px-2">
                                    <div className="col-span-4 text-[10px] font-black text-slate-400 uppercase">Desde (km)</div>
                                    <div className="col-span-4 text-[10px] font-black text-slate-400 uppercase">Hasta (km)</div>
                                    <div className="col-span-3 text-[10px] font-black text-slate-400 uppercase">A Cobrar ($)</div>
                                </div>
                                {(activeShift === 'day' ? settings.dayShift.clientRates : settings.nightShift.clientRates).map((rate: any, idx: number) => (
                                    <div key={idx} className="grid grid-cols-12 gap-3 items-center group">
                                        <div className="col-span-4">
                                            <input
                                                type="number" step="0.1"
                                                value={rate.from}
                                                onChange={(e) => {
                                                    const key = activeShift === 'day' ? 'dayShift' : 'nightShift';
                                                    const newRates = [...settings[key].clientRates];
                                                    newRates[idx].from = parseFloat(e.target.value) || 0;
                                                    setSettings({ ...settings, [key]: { ...settings[key], clientRates: newRates } });
                                                }}
                                                className="w-full bg-slate-50 border border-slate-100 px-3 py-2.5 rounded-xl font-bold text-slate-700"
                                            />
                                        </div>
                                        <div className="col-span-4">
                                            <input
                                                type="number" step="0.1"
                                                value={rate.to}
                                                onChange={(e) => {
                                                    const key = activeShift === 'day' ? 'dayShift' : 'nightShift';
                                                    const newRates = [...settings[key].clientRates];
                                                    newRates[idx].to = parseFloat(e.target.value) || 0;
                                                    setSettings({ ...settings, [key]: { ...settings[key], clientRates: newRates } });
                                                }}
                                                className="w-full bg-slate-50 border border-slate-100 px-3 py-2.5 rounded-xl font-bold text-slate-700"
                                            />
                                        </div>
                                        <div className="col-span-3">
                                            <input
                                                type="number" step="0.1"
                                                value={rate.price}
                                                onChange={(e) => {
                                                    const key = activeShift === 'day' ? 'dayShift' : 'nightShift';
                                                    const newRates = [...settings[key].clientRates];
                                                    newRates[idx].price = parseFloat(e.target.value) || 0;
                                                    setSettings({ ...settings, [key]: { ...settings[key], clientRates: newRates } });
                                                }}
                                                className="w-full bg-slate-50 border border-slate-100 px-3 py-2.5 rounded-xl font-bold text-emerald-600"
                                            />
                                        </div>
                                        <div className="col-span-1">
                                            <button
                                                onClick={() => {
                                                    const key = activeShift === 'day' ? 'dayShift' : 'nightShift';
                                                    const newRates = settings[key].clientRates.filter((_: any, i: number) => i !== idx);
                                                    setSettings({ ...settings, [key]: { ...settings[key], clientRates: newRates } });
                                                }}
                                                className="text-slate-200 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Transport Rates Editor (Moto, Car, Exec) */}
                        <div className="lg:col-span-2 bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm space-y-8">
                            <div className="flex items-center gap-4 border-b border-slate-100 pb-6">
                                <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center">
                                    <Activity className="w-6 h-6" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-black text-slate-900 tracking-tight">Tarifas de Taxis (Auto & Moto)</h3>
                                    <p className="text-xs font-medium text-slate-500">Configuración global de precios por distancia</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                                {(['moto', 'carro', 'ejecutivo'] as const).map((type) => (
                                    <div key={type} className="space-y-4">
                                        <div className="flex items-center justify-between">
                                            <h4 className="font-black text-slate-700 uppercase tracking-wider text-[10px]">
                                                {type === 'carro' ? 'Taxi Standard' : type === 'ejecutivo' ? 'Taxi Ejecutivo' : 'Moto Taxi'}
                                            </h4>
                                            <button
                                                onClick={() => {
                                                    const newRates = [...settings.transportRates[type], { from: 0, to: 0, price: 0 }];
                                                    setSettings({
                                                        ...settings,
                                                        transportRates: { ...settings.transportRates, [type]: newRates }
                                                    });
                                                }}
                                                className="text-indigo-600 hover:bg-slate-50 p-1 rounded-lg transition-colors"
                                            >
                                                <Plus className="w-4 h-4" />
                                            </button>
                                        </div>

                                        <div className="space-y-4">
                                            <div className="grid grid-cols-12 gap-1 px-1 text-center">
                                                <div className="col-span-2 text-[8px] font-black text-slate-400 uppercase">Desde</div>
                                                <div className="col-span-2 text-[8px] font-black text-slate-400 uppercase">Hasta</div>
                                                <div className="col-span-3 text-[8px] font-black text-slate-400 uppercase">C. Cliente</div>
                                                <div className="col-span-4 text-[8px] font-black text-slate-400 uppercase">C. Taxi</div>
                                            </div>
                                            {settings.transportRates[type].map((rate: any, idx: number) => (
                                                <div key={idx} className="grid grid-cols-12 gap-2 items-center group/range bg-white p-1 rounded-xl border border-slate-50 shadow-sm">
                                                    <div className="col-span-2">
                                                        <input
                                                            type="number" step="0.1"
                                                            value={rate.from}
                                                            onChange={(e) => {
                                                                const newRates = [...settings.transportRates[type]];
                                                                newRates[idx].from = parseFloat(e.target.value) || 0;
                                                                setSettings({ ...settings, transportRates: { ...settings.transportRates, [type]: newRates } });
                                                            }}
                                                            className="w-full bg-slate-50 border-none rounded-lg px-2 py-1 text-[10px] font-bold text-center"
                                                        />
                                                    </div>
                                                    <div className="col-span-2">
                                                        <input
                                                            type="number" step="0.1"
                                                            value={rate.to || 0}
                                                            onChange={(e) => {
                                                                const newRates = [...settings.transportRates[type]];
                                                                newRates[idx].to = parseFloat(e.target.value) || 0;
                                                                setSettings({ ...settings, transportRates: { ...settings.transportRates, [type]: newRates } });
                                                            }}
                                                            className="w-full bg-slate-50 border-none rounded-lg px-2 py-1 text-[10px] font-bold text-center"
                                                        />
                                                    </div>
                                                    <div className="col-span-3">
                                                        <input
                                                            type="number" step="0.5"
                                                            value={rate.clientPrice || rate.price}
                                                            onChange={(e) => {
                                                                const newRates = [...settings.transportRates[type]];
                                                                newRates[idx].clientPrice = parseFloat(e.target.value) || 0;
                                                                setSettings({ ...settings, transportRates: { ...settings.transportRates, [type]: newRates } });
                                                            }}
                                                            placeholder="C. Cliente"
                                                            className="w-full bg-emerald-50 border-none rounded-lg px-2 py-1 text-[10px] font-black text-emerald-600 text-center"
                                                        />
                                                    </div>
                                                    <div className="col-span-4">
                                                        <input
                                                            type="number" step="0.5"
                                                            value={rate.driverPrice || rate.price}
                                                            onChange={(e) => {
                                                                const newRates = [...settings.transportRates[type]];
                                                                newRates[idx].driverPrice = parseFloat(e.target.value) || 0;
                                                                setSettings({ ...settings, transportRates: { ...settings.transportRates, [type]: newRates } });
                                                            }}
                                                            placeholder="C. Taxi"
                                                            className="w-full bg-indigo-50 border-none rounded-lg px-2 py-1 text-[10px] font-black text-indigo-600 text-center"
                                                        />
                                                    </div>
                                                    <div className="col-span-1">
                                                        <button
                                                            onClick={() => {
                                                                const newRates = settings.transportRates[type].filter((_: any, i: number) => i !== idx);
                                                                setSettings({ ...settings, transportRates: { ...settings.transportRates, [type]: newRates } });
                                                            }}
                                                            className="text-slate-200 hover:text-red-500 opacity-0 group-hover/range:opacity-100 transition-colors"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
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
                                        className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-2xl text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20 whitespace-pre-wrap"
                                        placeholder="Escribe la plantilla del mensaje de WhatsApp aquí..."
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="lg:col-span-2">
                            <button
                                onClick={handleSaveSettings}
                                disabled={savingSettings}
                                className="w-full bg-indigo-600 text-white font-black py-4 rounded-2xl shadow-lg shadow-indigo-600/20 active:scale-[0.98] transition-all disabled:opacity-50"
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
                                <div>
                                    <h4 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2"><User className="w-4 h-4 text-slate-400" /> Selfie y Rostro</h4>
                                    <a href={selectedDriver.documents.selfieUrl} target="_blank" rel="noreferrer" className="block relative group rounded-2xl overflow-hidden border border-slate-200 aspect-video bg-slate-100">
                                        <img src={selectedDriver.documents.selfieUrl} alt="Selfie" className="w-full h-full object-cover" />
                                        <div className="absolute inset-0 bg-slate-900/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                            <ExternalLink className="text-white w-8 h-8" />
                                        </div>
                                    </a>
                                </div>
                                <div>
                                    <h4 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2"><Truck className="w-4 h-4 text-slate-400" /> Vehículo (Placa: {selectedDriver.vehiclePlate})</h4>
                                    <a href={selectedDriver.documents.vehicleUrl || (selectedDriver.documents as any).vehicleImageUrl} target="_blank" rel="noreferrer" className="block relative group rounded-2xl overflow-hidden border border-slate-200 aspect-video bg-slate-100">
                                        <img src={selectedDriver.documents.vehicleUrl || (selectedDriver.documents as any).vehicleImageUrl} alt="Vehicle" className="w-full h-full object-cover" />
                                        <div className="absolute inset-0 bg-slate-900/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                            <ExternalLink className="text-white w-8 h-8" />
                                        </div>
                                    </a>
                                </div>
                                <div>
                                    <h4 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2"><FileText className="w-4 h-4 text-slate-400" /> Licencia / Documento Legal</h4>
                                    <a href={selectedDriver.documents.licenseUrl} target="_blank" rel="noreferrer" className="block relative group rounded-2xl overflow-hidden border border-slate-200 aspect-video bg-slate-100">
                                        <img src={selectedDriver.documents.licenseUrl} alt="License" className="w-full h-full object-cover" />
                                        <div className="absolute inset-0 bg-slate-900/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                            <ExternalLink className="text-white w-8 h-8" />
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
                                <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mx-auto text-indigo-600">
                                    <DollarSign className="w-10 h-10" />
                                </div>
                                <div>
                                    <p className="text-slate-500 font-medium uppercase tracking-widest text-xs mb-1">Deuda Pendiente</p>
                                    <h4 className="text-5xl font-black text-slate-900 tracking-tighter">${driverPendingBalance.total.toFixed(2)}</h4>
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
            </AnimatePresence>
        </div>
    );
}
