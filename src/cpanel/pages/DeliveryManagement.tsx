import React, { useState, useEffect } from 'react';
import { collection, query, getDocs, doc, updateDoc, onSnapshot, where, writeBatch, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { DeliveryDriver } from '../../lib/delivery-service';
import { Truck, CheckCircle2, XCircle, FileText, User, DollarSign, ExternalLink } from 'lucide-react';
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
    const [settings, setSettings] = useState({
        driverBaseFee: 2.00,
        driverPerKmFee: 0.50,
        clientBaseFee: 2.50,
        clientPerKmFee: 0.60
    });
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

        const qSettings = doc(db, 'global_settings', 'delivery');
        const unsubscribeSettings = onSnapshot(qSettings, (docSnap) => {
            if (docSnap.exists()) {
                setSettings(docSnap.data() as any);
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
        if (!window.confirm(`¿Estás seguro de mover este piloto al estado: ${status}?`)) return;
        try {
            await updateDoc(doc(db, 'delivery_drivers', id), { status });
            // Here we could also trigger a push notification to their device if we had FCM implemented
            setSelectedDriver(null);
        } catch (error) {
            console.error("Error updating driver status:", error);
            alert("Error al actualizar estado");
        }
    };

    const handleApproveUpdateRequest = async (request: any) => {
        if (!window.confirm(`¿Aprobar actualización de datos para ${request.driverName}?`)) return;
        try {
            const batch = writeBatch(db);
            const driverRef = doc(db, 'delivery_drivers', request.driverId);
            batch.update(driverRef, {
                cedula: request.newData.cedula,
                vehicleType: request.newData.vehicleType,
                vehiclePlate: request.newData.vehiclePlate
            });

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

            const total = pending.reduce((sum, doc) => sum + (doc.data().deliveryFee || 0), 0);
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
            await setDoc(doc(db, 'global_settings', 'delivery'), settings, { merge: true });
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
                                            <div className="space-y-2 text-sm bg-white p-3 rounded-xl border border-amber-100">
                                                <p className="flex justify-between"><span className="text-slate-500 font-medium">Cédula:</span> <span className="font-bold text-slate-800">{req.newData.cedula}</span></p>
                                                <p className="flex justify-between"><span className="text-slate-500 font-medium">Vehículo:</span> <span className="font-bold text-slate-800 capitalize">{req.newData.vehicleType}</span></p>
                                                <p className="flex justify-between"><span className="text-slate-500 font-medium">Placa:</span> <span className="font-bold text-slate-800 uppercase">{req.newData.vehiclePlate}</span></p>
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
                                            <span className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-widest rounded-full ${driver.isOnline ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                                {driver.isOnline ? 'En Línea' : 'Desconectado'}
                                            </span>
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
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Tarifas de Pilotos */}
                    <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm space-y-6">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center">
                                <Truck className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-slate-900">Tarifas de Pilotos</h3>
                                <p className="text-sm font-medium text-slate-500">Lo que se le paga al repartidor.</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest ml-1 mb-2">Pago Base por Viaje ($)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={settings.driverBaseFee}
                                    onChange={(e) => setSettings({ ...settings, driverBaseFee: parseFloat(e.target.value) || 0 })}
                                    className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-500 px-4 py-3 rounded-2xl outline-none transition-all font-bold text-slate-700"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest ml-1 mb-2">Pago por Kilómetro ($)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={settings.driverPerKmFee}
                                    onChange={(e) => setSettings({ ...settings, driverPerKmFee: parseFloat(e.target.value) || 0 })}
                                    className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-500 px-4 py-3 rounded-2xl outline-none transition-all font-bold text-slate-700"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Tarifas de Clientes */}
                    <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm space-y-6">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center">
                                <DollarSign className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-slate-900">Tarifas de Clientes</h3>
                                <p className="text-sm font-medium text-slate-500">Lo que se le cobra al cliente.</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest ml-1 mb-2">Costo Base de Delivery ($)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={settings.clientBaseFee}
                                    onChange={(e) => setSettings({ ...settings, clientBaseFee: parseFloat(e.target.value) || 0 })}
                                    className="w-full bg-slate-50 border-2 border-transparent focus:border-emerald-500 px-4 py-3 rounded-2xl outline-none transition-all font-bold text-slate-700"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest ml-1 mb-2">Costo por Kilómetro ($)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={settings.clientPerKmFee}
                                    onChange={(e) => setSettings({ ...settings, clientPerKmFee: parseFloat(e.target.value) || 0 })}
                                    className="w-full bg-slate-50 border-2 border-transparent focus:border-emerald-500 px-4 py-3 rounded-2xl outline-none transition-all font-bold text-slate-700"
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
                                    <a href={selectedDriver.documents.vehicleUrl} target="_blank" rel="noreferrer" className="block relative group rounded-2xl overflow-hidden border border-slate-200 aspect-video bg-slate-100">
                                        <img src={selectedDriver.documents.vehicleUrl} alt="Vehicle" className="w-full h-full object-cover" />
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
