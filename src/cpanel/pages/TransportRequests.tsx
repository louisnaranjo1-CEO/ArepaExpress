import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Car, Bike, Clock, CheckCircle2, XCircle, Search, Calendar, DollarSign, MapPin, User, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';

export default function TransportRequests() {
    const [requests, setRequests] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all'); // all, verifying_payment, finding_driver, in_progress, completed, cancelled
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        const q = query(
            collection(db, 'transport_requests'),
            orderBy('createdAt', 'desc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const reqsData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setRequests(reqsData);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const handleVerifyPayment = async (id: string, isApproved: boolean) => {
        try {
            await updateDoc(doc(db, 'transport_requests', id), {
                status: isApproved ? 'searching' : 'cancelled'
            });
            toast.success(isApproved ? 'Pago verificado. Buscando conductor...' : 'Solicitud cancelada');
        } catch (error) {
            console.error("Error updating status:", error);
            toast.error("Hubo un error al actualizar la solicitud");
        }
    };

    const handleDelete = async (id: string) => {
        if (window.confirm("¿Estás seguro de que deseas eliminar este registro histórico?")) {
            try {
                await deleteDoc(doc(db, 'transport_requests', id));
                toast.success('Registro eliminado');
            } catch (error) {
                console.error("Error deleting record:", error);
                toast.error("Error al eliminar el registro");
            }
        }
    };

    const filteredRequests = requests.filter(req => {
        if (filter !== 'all' && req.status !== filter) return false;

        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            return (
                req.userName?.toLowerCase().includes(term) ||
                req.userPhone?.toLowerCase().includes(term) ||
                req.id.toLowerCase().includes(term)
            );
        }
        return true;
    });

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'verifying_payment': return <span className="bg-amber-100 text-amber-800 px-3 py-1 rounded-full text-xs font-bold animate-pulse">Pagado (Por Verificar)</span>;
            case 'searching': return <span className="bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full text-xs font-bold">Buscando Conductor</span>;
            case 'accepted': return <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-xs font-bold">Conductor Asignado</span>;
            case 'in_progress': return <span className="bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full text-xs font-bold">En Viaje</span>;
            case 'completed': return <span className="bg-slate-100 text-slate-800 px-3 py-1 rounded-full text-xs font-bold">Completado</span>;
            case 'cancelled': return <span className="bg-red-100 text-red-800 px-3 py-1 rounded-full text-xs font-bold">Cancelado</span>;
            default: return <span className="bg-slate-100 text-slate-800 px-3 py-1 rounded-full text-xs font-bold uppercase">{status}</span>;
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
                <div>
                    <h1 className="text-2xl font-black text-slate-900">Gestión de Taxis (Viajes)</h1>
                    <p className="text-slate-500 font-medium mt-1">Supervisa y aprueba solicitudes de transporte.</p>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-center">
                <div className="relative w-full md:w-96">
                    <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Buscar por ID, nombre o teléfono..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-slate-50 border-none pl-12 pr-4 py-3 rounded-2xl focus:ring-2 focus:ring-indigo-600 font-medium"
                    />
                </div>
                <div className="flex gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0 hide-scrollbar">
                    {['all', 'verifying_payment', 'searching', 'in_progress', 'completed'].map(f => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`px-4 py-2 rounded-xl font-bold whitespace-nowrap transition-all ${filter === f ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                        >
                            {f === 'all' ? 'Todos' :
                                f === 'verifying_payment' ? 'Por Verificar' :
                                    f === 'searching' ? 'Buscando' :
                                        f === 'in_progress' ? 'En Curso' : 'Completados'}
                        </button>
                    ))}
                </div>
            </div>

            {/* List */}
            <div className="space-y-4">
                {filteredRequests.length === 0 ? (
                    <div className="bg-white rounded-3xl p-12 text-center border border-slate-200">
                        <Car className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                        <h3 className="text-xl font-bold text-slate-900">No hay viajes</h3>
                        <p className="text-slate-500 mt-2">No se encontraron solicitudes con los filtros actuales.</p>
                    </div>
                ) : (
                    filteredRequests.map((req) => (
                        <div key={req.id} className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm transition-all hover:shadow-md">

                            <div className="flex flex-col md:flex-row justify-between gap-6 mb-6">
                                {/* User & Type Info */}
                                <div className="flex items-start gap-4">
                                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${req.vehicleType === 'moto' ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-700'}`}>
                                        {req.vehicleType === 'moto' ? <Bike className="w-6 h-6" /> : <Car className="w-6 h-6" />}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="font-black text-slate-900 text-lg uppercase">
                                                ID: {req.id.slice(0, 6)}
                                            </span>
                                            {getStatusBadge(req.status)}
                                        </div>
                                        <div className="flex items-center gap-3 text-sm font-medium text-slate-500">
                                            <span className="flex items-center gap-1"><User className="w-4 h-4" /> {req.userName}</span>
                                            <span className="flex items-center gap-1"><Calendar className="w-4 h-4" /> {req.createdAt?.toDate().toLocaleString()}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Financial Info */}
                                <div className="bg-slate-100/50 rounded-2xl p-4 md:text-right min-w-[240px] border border-slate-100 flex flex-col justify-center">
                                    <div className="grid grid-cols-2 gap-4 md:grid-cols-1 md:gap-2">
                                        <div>
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Costo Cliente</p>
                                            <p className="text-xl font-black text-emerald-600">${parseFloat(req.clientTotal || req.price || 0).toFixed(2)}</p>
                                        </div>
                                        <div className="border-l md:border-l-0 md:border-t border-slate-200 pl-4 md:pl-0 md:pt-2">
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Pago a Taxi</p>
                                            <p className="text-lg font-black text-indigo-600">${parseFloat(req.driverPayout || req.price || 0).toFixed(2)}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 mt-3 md:justify-end text-[10px] font-bold">
                                        <span className="bg-white px-2 py-1 rounded shadow-sm text-slate-600 border border-slate-200 flex items-center gap-1">
                                            <DollarSign className="w-3 h-3 text-emerald-500" /> {req.paymentMethod === 'pagoMovil' ? 'Pago Móvil' : req.paymentMethod === 'cash' ? 'Efectivo' : req.paymentMethod}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Locations Layout */}
                            <div className="grid md:grid-cols-2 gap-4 mb-6">
                                <div className="flex gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-100 relative overflow-hidden">
                                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-slate-400"></div>
                                    <MapPin className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-xs font-bold text-slate-400 uppercase mb-1">Punto de Origen</p>
                                        <p className="font-bold text-slate-700 text-sm">{req.origin?.address}</p>
                                    </div>
                                </div>
                                <div className="flex gap-3 bg-indigo-50 p-4 rounded-2xl border border-indigo-100 relative overflow-hidden">
                                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500"></div>
                                    <MapPin className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-xs font-bold text-indigo-400 uppercase mb-1">Destino</p>
                                        <p className="font-bold text-indigo-900 text-sm">{req.destination?.address}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Payment Verification Action Area */}
                            {req.status === 'verifying_payment' && req.paymentMethod !== 'cash' && (
                                <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
                                    <div className="flex items-center gap-3 w-full">
                                        <div className="w-10 h-10 bg-amber-200 rounded-full flex items-center justify-center shrink-0 text-amber-700">
                                            <ShieldCheck className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p className="font-bold text-amber-900">Verificación de Pago Requerida</p>
                                            <p className="text-sm text-amber-700 font-medium">Ref: <span className="font-black">{req.paymentRef || 'No adjunta'}</span></p>
                                        </div>
                                    </div>

                                    <div className="flex gap-2 w-full md:w-auto">
                                        <button
                                            onClick={() => handleVerifyPayment(req.id, false)}
                                            className="flex-1 md:flex-none px-4 py-2 bg-white text-red-600 font-bold rounded-xl border border-red-200 hover:bg-red-50 transition-colors"
                                        >
                                            Rechazar
                                        </button>
                                        <button
                                            onClick={() => handleVerifyPayment(req.id, true)}
                                            className="flex-1 md:flex-none px-6 py-2 bg-amber-500 text-white font-black rounded-xl hover:bg-amber-600 transition-colors shadow-lg shadow-amber-500/20"
                                        >
                                            Aprobar Pago
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Cash Payment Verification Action Area */}
                            {req.status === 'verifying_payment' && req.paymentMethod === 'cash' && (
                                <div className="bg-emerald-50 border-2 border-emerald-200 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
                                    <div className="flex items-center gap-3 w-full">
                                        <div className="w-10 h-10 bg-emerald-200 rounded-full flex items-center justify-center shrink-0 text-emerald-700">
                                            <DollarSign className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p className="font-bold text-emerald-900">Pago en Efectivo (Al chofer)</p>
                                            <p className="text-sm text-emerald-700 font-medium">Se debe cobrar al finalizar el viaje.</p>
                                        </div>
                                    </div>

                                    <div className="flex gap-2 w-full md:w-auto">
                                        <button
                                            onClick={() => handleVerifyPayment(req.id, false)}
                                            className="flex-1 md:flex-none px-4 py-2 bg-white text-red-600 font-bold rounded-xl border border-red-200 hover:bg-red-50 transition-colors"
                                        >
                                            Rechazar
                                        </button>
                                        <button
                                            onClick={() => handleVerifyPayment(req.id, true)}
                                            className="flex-1 md:flex-none px-6 py-2 bg-emerald-500 text-white font-black rounded-xl hover:bg-emerald-600 transition-colors shadow-lg shadow-emerald-500/20"
                                        >
                                            Aprobar Vehículo
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Footer Actions (Delete old records) */}
                            {(req.status === 'completed' || req.status === 'cancelled') && (
                                <div className="mt-4 pt-4 border-t border-slate-100 flex justify-end">
                                    <button
                                        onClick={() => handleDelete(req.id)}
                                        className="text-xs font-bold text-red-500 hover:text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
                                    >
                                        Eliminar Registro
                                    </button>
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
