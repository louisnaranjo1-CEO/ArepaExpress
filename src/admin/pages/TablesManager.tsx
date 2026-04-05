import React, { useState, useEffect } from 'react';
import { collection, query, getDocs, doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { LayoutGrid, Plus, Edit2, Trash2, X, Users as UsersIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Table {
    id: string;
    number: string;
    capacity: number;
    status: 'available' | 'occupied' | 'calling' | 'billing';
    createdAt?: any;
}

export default function TablesManager() {
    const { user } = useAuth();
    const [tables, setTables] = useState<Table[]>([]);
    const [loading, setLoading] = useState(true);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingTable, setEditingTable] = useState<Table | null>(null);
    const [saving, setSaving] = useState(false);

    // Form states
    const [number, setNumber] = useState('');
    const [capacity, setCapacity] = useState(4);

    useEffect(() => {
        if (user) {
            fetchTables();
        }
    }, [user]);

    const fetchTables = async () => {
        if (!user) return;
        setLoading(true);
        try {
            const q = query(collection(db, 'restaurants', user.uid, 'tables'));
            const snapshot = await getDocs(q);
            const data = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Table[];

            // Sort by table number (numeric sort if possible)
            data.sort((a, b) => {
                const numA = parseInt(a.number, 10);
                const numB = parseInt(b.number, 10);
                if (!isNaN(numA) && !isNaN(numB)) {
                    return numA - numB;
                }
                return a.number.localeCompare(b.number);
            });

            setTables(data);
        } catch (error) {
            console.error("Error fetching tables:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenForm = (table?: Table) => {
        if (table) {
            setEditingTable(table);
            setNumber(table.number);
            setCapacity(table.capacity || 4);
        } else {
            setEditingTable(null);
            setNumber('');
            setCapacity(4);
        }
        setIsFormOpen(true);
    };

    const handleCloseForm = () => {
        setIsFormOpen(false);
        setEditingTable(null);
    };

    const handleSaveTable = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !number.trim()) return;

        setSaving(true);
        try {
            const tableId = editingTable ? editingTable.id : Date.now().toString();
            const tableRef = doc(db, 'restaurants', user.uid, 'tables', tableId);

            const tableData: any = {
                number: number.trim(),
                capacity: Number(capacity),
                updatedAt: serverTimestamp()
            };

            if (!editingTable) {
                tableData.createdAt = serverTimestamp();
                tableData.status = 'available'; // Default status
            }

            await setDoc(tableRef, tableData, { merge: true });

            await fetchTables();
            handleCloseForm();
        } catch (error) {
            console.error("Error saving table:", error);
            alert("No se pudo guardar la mesa.");
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteTable = async (tableId: string) => {
        if (!user || !window.confirm('¿Estás seguro de que deseas eliminar esta mesa?')) return;

        try {
            await deleteDoc(doc(db, 'restaurants', user.uid, 'tables', tableId));
            await fetchTables();
        } catch (error) {
            console.error("Error deleting table:", error);
            alert("No se pudo eliminar la mesa.");
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                        <LayoutGrid className="w-6 h-6 text-slate-900" />
                        Gestión de Mesas
                    </h1>
                    <p className="text-slate-500 font-medium">Administra las mesas físicas de tu restaurante</p>
                </div>
                <button
                    onClick={() => handleOpenForm()}
                    className="bg-primary text-slate-900 px-5 py-3 rounded-2xl font-bold inline-flex items-center gap-2 hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
                >
                    <Plus className="w-5 h-5" />
                    Nueva Mesa
                </button>
            </div>

            <div className="bg-white rounded-[32px] shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                        <LayoutGrid className="w-5 h-5 text-primary" />
                        Mesas Registradas ({tables.length})
                    </h2>
                </div>

                {tables.length > 0 ? (
                    <div className="p-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {tables.map((table) => (
                            <div key={table.id} className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col justify-between group hover:border-primary/50 transition-colors relative overflow-hidden">
                                {/* Decorator line */}
                                <div className="absolute top-0 left-0 w-1 h-full bg-slate-200 group-hover:bg-primary transition-colors"></div>

                                <div className="pl-3 mb-4">
                                    <div className="flex items-center justify-between">
                                        <h3 className="font-black text-2xl text-slate-800">Mesa {table.number}</h3>
                                        <div className="flex items-center gap-1 text-slate-400">
                                            <UsersIcon className="w-4 h-4" />
                                            <span className="text-sm font-bold">{table.capacity}</span>
                                        </div>
                                    </div>
                                    <div className="mt-2 inline-flex items-center px-2 py-1 rounded-lg text-xs font-bold bg-white border border-slate-200 text-slate-500">
                                        <span className={`w-2 h-2 rounded-full mr-1.5 ${table.status === 'available' ? 'bg-emerald-500' :
                                                table.status === 'occupied' ? 'bg-amber-500' :
                                                    table.status === 'calling' ? 'bg-rose-500' :
                                                        table.status === 'billing' ? 'bg-primary' : 'bg-slate-400'
                                            }`}></span>
                                        {table.status === 'available' ? 'Disponible' :
                                            table.status === 'occupied' ? 'Ocupada' :
                                                table.status === 'calling' ? 'Llamando' :
                                                    table.status === 'billing' ? 'Cobrando' : 'Desconocido'}
                                    </div>
                                </div>

                                <div className="pl-3 flex items-center justify-end gap-2 pt-3 border-t border-slate-200/60 mt-auto">
                                    <button
                                        onClick={() => handleOpenForm(table)}
                                        className="p-2 text-slate-400 hover:text-primary hover:bg-indigo-50 rounded-xl transition-all"
                                    >
                                        <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => handleDeleteTable(table.id)}
                                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="p-12 text-center text-slate-500">
                        <LayoutGrid className="w-12 h-12 mx-auto text-slate-300 mb-4" />
                        <p className="text-lg font-bold text-slate-600">No hay mesas registradas</p>
                        <p className="text-sm mt-1">Registra tus mesas para que los meseros puedan tomar pedidos.</p>
                    </div>
                )}
            </div>

            {/* Form Modal */}
            <AnimatePresence>
                {isFormOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-white rounded-3xl shadow-xl w-full max-w-sm overflow-hidden"
                        >
                            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                                <h3 className="text-lg font-black text-slate-900">
                                    {editingTable ? 'Editar Mesa' : 'Nueva Mesa'}
                                </h3>
                                <button
                                    onClick={handleCloseForm}
                                    className="p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-600 rounded-xl transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <form onSubmit={handleSaveTable} className="p-6 space-y-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Identificador / Número</label>
                                    <input
                                        type="text"
                                        required
                                        value={number}
                                        onChange={(e) => setNumber(e.target.value)}
                                        placeholder="Ej: 1, 2, Terraza A"
                                        className="w-full bg-slate-50 border-2 border-slate-100 focus:border-primary px-4 py-3 rounded-2xl outline-none font-bold text-slate-700 transition-colors"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Capacidad (Personas)</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="50"
                                        required
                                        value={capacity}
                                        onChange={(e) => setCapacity(Number(e.target.value))}
                                        className="w-full bg-slate-50 border-2 border-slate-100 focus:border-primary px-4 py-3 rounded-2xl outline-none font-bold text-slate-700 transition-colors"
                                    />
                                </div>

                                <div className="pt-2">
                                    <button
                                        type="submit"
                                        disabled={saving}
                                        className="w-full bg-primary text-slate-900 py-4 rounded-xl font-bold hover:bg-primary/90 transition-colors disabled:opacity-70 shadow-lg shadow-primary/20"
                                    >
                                        {saving ? 'Guardando...' : 'Guardar Mesa'}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
