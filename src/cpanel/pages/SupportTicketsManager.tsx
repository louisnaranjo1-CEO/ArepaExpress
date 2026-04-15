import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, serverTimestamp, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { MessageSquareWarning, Search, Filter, Clock, CheckCircle, AlertCircle, User, Phone, Mail, Send, X, Settings } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';

interface SupportTicket {
    id: string;
    userId: string;
    userName: string;
    userEmail: string;
    userPhone: string;
    title: string;
    description: string;
    status: 'open' | 'closed';
    createdAt: any;
    adminResponse?: string;
}

export default function SupportTicketsManager() {
    const [tickets, setTickets] = useState<SupportTicket[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed'>('all');
    
    const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
    const [adminResponse, setAdminResponse] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [supportPhone, setSupportPhone] = useState('');
    const [savingSettings, setSavingSettings] = useState(false);

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const settingsDoc = await getDoc(doc(db, 'settings', 'customer_service'));
                if (settingsDoc.exists()) {
                    setSupportPhone(settingsDoc.data().supportPhone || '');
                }
            } catch (error) {
                console.error("Error fetching settings:", error);
            }
        };
        fetchSettings();
    }, []);

    const handleSaveSettings = async () => {
        if (!supportPhone.trim()) {
            toast.error('Ingresa un número de soporte');
            return;
        }
        setSavingSettings(true);
        try {
            await setDoc(doc(db, 'settings', 'customer_service'), {
                supportPhone: supportPhone,
                updatedAt: serverTimestamp()
            }, { merge: true });
            toast.success('Configuración guardada correctamente');
        } catch (error) {
            console.error("Error saving settings:", error);
            toast.error('Error al guardar la configuración');
        } finally {
            setSavingSettings(false);
        }
    };


    useEffect(() => {
        const q = query(
            collection(db, 'support_tickets'),
            orderBy('createdAt', 'desc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedTickets = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as SupportTicket[];
            setTickets(fetchedTickets);
            setLoading(false);
            
            // Update selected ticket if it's currently open
            if (selectedTicket) {
                const updated = fetchedTickets.find(t => t.id === selectedTicket.id);
                if (updated) setSelectedTicket(updated);
            }
        });

        return () => unsubscribe();
    }, [selectedTicket]);

    const filteredTickets = tickets.filter(ticket => {
        const matchesSearch = 
            ticket.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            ticket.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            ticket.userEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
            ticket.id.toLowerCase().includes(searchTerm.toLowerCase());
            
        const matchesStatus = statusFilter === 'all' || ticket.status === statusFilter;

        return matchesSearch && matchesStatus;
    });

    const handleRespondAndClose = async (ticketId: string) => {
        if (!adminResponse.trim()) {
            toast.error('Por favor escribe una respuesta');
            return;
        }

        setIsSubmitting(true);
        try {
            const ticketRef = doc(db, 'support_tickets', ticketId);
            await updateDoc(ticketRef, {
                status: 'closed',
                adminResponse: adminResponse,
                updatedAt: serverTimestamp()
            });
            
            toast.success('Ticket respondido y cerrado correctamente');
            setSelectedTicket(null);
            setAdminResponse('');
        } catch (error) {
            console.error("Error updating ticket:", error);
            toast.error('Error al actualizar el ticket');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-black text-slate-900 flex items-center gap-3">
                        <MessageSquareWarning className="w-8 h-8 text-slate-900" />
                        Reportes de Fallas
                    </h2>
                    <p className="text-slate-500 font-medium mt-1">
                        Gestiona los tickets de soporte técnico de los usuarios
                    </p>
                </div>
            </div>

            {/* Support Config Section */}
            <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-2xl bg-slate-900 flex items-center justify-center">
                        <Settings className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h3 className="font-black text-slate-900 leading-tight">Configuración de Soporte</h3>
                        <p className="text-xs text-slate-500 font-medium">Este número aparecerá en locales suspendidos</p>
                    </div>
                </div>

                <div className="flex flex-col md:flex-row gap-4 items-end">
                    <div className="flex-1 w-full space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">WhatsApp de Soporte (con código de país)</label>
                        <div className="relative">
                            <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                            <input
                                type="text"
                                placeholder="+584120000000"
                                value={supportPhone}
                                onChange={(e) => setSupportPhone(e.target.value)}
                                className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all outline-none font-bold text-slate-700"
                            />
                        </div>
                    </div>
                    <button
                        onClick={handleSaveSettings}
                        disabled={savingSettings}
                        className="w-full md:w-auto px-8 py-3.5 bg-primary hover:bg-primary/90 text-slate-900 font-black rounded-2xl transition-all shadow-lg shadow-primary/20 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {savingSettings ? (
                            <div className="w-5 h-5 border-2 border-slate-900 border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                            <>
                                <CheckCircle className="w-5 h-5" />
                                Guardar Cambios
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-200 flex flex-col md:flex-row gap-4">
                <div className="flex-1 relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Buscar por usuario, correo, título o ID..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all outline-none font-medium"
                    />
                </div>
                <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0">
                    <button
                        onClick={() => setStatusFilter('all')}
                        className={`px-4 py-3 rounded-2xl font-bold whitespace-nowrap transition-colors ${
                            statusFilter === 'all' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                    >
                        Todos
                    </button>
                    <button
                        onClick={() => setStatusFilter('open')}
                        className={`px-4 py-3 rounded-2xl font-bold whitespace-nowrap transition-colors flex items-center gap-2 ${
                            statusFilter === 'open' ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                    >
                        <AlertCircle className="w-4 h-4" />
                        Abiertos
                    </button>
                    <button
                        onClick={() => setStatusFilter('closed')}
                        className={`px-4 py-3 rounded-2xl font-bold whitespace-nowrap transition-colors flex items-center gap-2 ${
                            statusFilter === 'closed' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                    >
                        <CheckCircle className="w-4 h-4" />
                        Resueltos
                    </button>
                </div>
            </div>

            {/* Tickets Grid */}
            {loading ? (
                <div className="flex justify-center py-12">
                    <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                </div>
            ) : filteredTickets.length > 0 ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {filteredTickets.map((ticket) => (
                        <div 
                            key={ticket.id}
                            onClick={() => {
                                setSelectedTicket(ticket);
                                setAdminResponse(ticket.adminResponse || '');
                            }}
                            className={`bg-white p-5 rounded-3xl border-2 cursor-pointer transition-all hover:shadow-md ${
                                selectedTicket?.id === ticket.id ? 'border-primary' : 'border-slate-100 hover:border-slate-300'
                            }`}
                        >
                            <div className="flex justify-between items-start mb-3">
                                <div>
                                    <h3 className="font-bold text-slate-900 text-lg leading-tight line-clamp-1">{ticket.title}</h3>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">ID: {ticket.id}</p>
                                </div>
                                <span className={`px-3 py-1 rounded-xl text-xs font-black uppercase tracking-wider whitespace-nowrap ml-4 ${
                                    ticket.status === 'open' ? 'bg-orange-100 text-orange-600' : 'bg-green-100 text-green-600'
                                }`}>
                                    {ticket.status === 'open' ? 'Abierto' : 'Resuelto'}
                                </span>
                            </div>

                            <div className="flex items-center gap-2 mb-3">
                                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                                    <User className="w-4 h-4 text-slate-500" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-sm font-bold text-slate-700 truncate">{ticket.userName}</p>
                                    <p className="text-xs text-slate-500 truncate">{ticket.userEmail}</p>
                                </div>
                            </div>
                            
                            <p className="text-sm text-slate-600 line-clamp-2 bg-slate-50 p-3 rounded-xl mb-3">
                                {ticket.description}
                            </p>

                            <div className="flex items-center justify-between text-xs font-medium text-slate-400">
                                <div className="flex items-center gap-1">
                                    <Clock className="w-3.5 h-3.5" />
                                    <span>{ticket.createdAt?.toDate ? ticket.createdAt.toDate().toLocaleString() : 'Reciente'}</span>
                                </div>
                                {ticket.status === 'closed' && (
                                    <span className="text-slate-900 font-bold">Ver respuesta &rarr;</span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="bg-white rounded-3xl p-12 text-center border border-slate-100 shadow-sm">
                    <MessageSquareWarning className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                    <h3 className="text-xl font-black text-slate-700">No hay tickets encontrados</h3>
                    <p className="text-slate-500 mt-2">Prueba cambiando los filtros de búsqueda.</p>
                </div>
            )}

            {/* Ticket Detail Modal */}
            <AnimatePresence>
                {selectedTicket && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-white rounded-[40px] w-full max-w-2xl shadow-2xl overflow-hidden my-auto"
                        >
                            <div className="p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100">
                                <div>
                                    <h3 className="text-2xl font-black text-slate-900 leading-tight">Ticket #{selectedTicket.id.slice(0, 8)}</h3>
                                    <span className={`inline-block mt-2 px-3 py-1 rounded-xl text-xs font-black uppercase tracking-wider ${
                                        selectedTicket.status === 'open' ? 'bg-orange-100 text-orange-600' : 'bg-green-100 text-green-600'
                                    }`}>
                                        {selectedTicket.status === 'open' ? 'Estado: Abierto' : 'Estado: Resuelto'}
                                    </span>
                                </div>
                                <button
                                    onClick={() => setSelectedTicket(null)}
                                    className="p-3 hover:bg-slate-100 rounded-2xl transition-colors self-start"
                                >
                                    <X className="w-6 h-6 text-slate-400" />
                                </button>
                            </div>

                            <div className="p-6 md:p-8 space-y-6">
                                {/* Datos del Usuario */}
                                <div>
                                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Datos del Usuario</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl">
                                            <User className="w-5 h-5 text-slate-400" />
                                            <span className="font-bold text-slate-700">{selectedTicket.userName}</span>
                                        </div>
                                        <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl">
                                            <Mail className="w-5 h-5 text-slate-400" />
                                            <span className="font-bold text-slate-700">{selectedTicket.userEmail || 'N/A'}</span>
                                        </div>
                                        <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl">
                                            <Phone className="w-5 h-5 text-slate-400" />
                                            <span className="font-bold text-slate-700">{selectedTicket.userPhone || 'N/A'}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Reporte */}
                                <div>
                                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Detalles del Reporte</h4>
                                    <div className="bg-red-50 p-5 rounded-2xl border border-red-100">
                                        <h5 className="font-black text-red-900 text-lg mb-2">{selectedTicket.title}</h5>
                                        <p className="text-red-800 whitespace-pre-wrap">{selectedTicket.description}</p>
                                        <p className="text-xs text-red-600 font-bold mt-4">
                                            Enviado el {selectedTicket.createdAt?.toDate ? selectedTicket.createdAt.toDate().toLocaleString() : 'Reciente'}
                                        </p>
                                    </div>
                                </div>

                                {/* Respuesta */}
                                <div>
                                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Respuesta del Administrador</h4>
                                    {selectedTicket.status === 'closed' ? (
                                        <div className="bg-green-50/50 border border-green-200 p-5 rounded-2xl">
                                            <p className="text-green-900 whitespace-pre-wrap font-medium">{selectedTicket.adminResponse}</p>
                                            <div className="flex items-center gap-2 mt-4 text-green-700">
                                                <CheckCircle className="w-4 h-4" />
                                                <span className="text-xs font-bold uppercase tracking-wider">Caso Cerrado</span>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            <textarea
                                                value={adminResponse}
                                                onChange={(e) => setAdminResponse(e.target.value)}
                                                placeholder="Escribe la respuesta o solución que le llegará al usuario..."
                                                className="w-full h-32 p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all resize-none outline-none text-slate-700 font-medium"
                                            />
                                            <button
                                                onClick={() => handleRespondAndClose(selectedTicket.id)}
                                                disabled={isSubmitting || !adminResponse.trim()}
                                                className="w-full bg-primary hover:bg-primary-dark text-slate-900 font-black py-4 rounded-2xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {isSubmitting ? (
                                                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                                ) : (
                                                    <>
                                                        <Send className="w-5 h-5" />
                                                        Responder y Cerrar Comanda
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
