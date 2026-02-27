import React, { useState } from 'react';
import { Bell, Search, Menu, Plus, ChevronDown, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import WaiterLayout from '../components/WaiterLayout';
import { motion, AnimatePresence } from 'framer-motion';

interface Table {
    id: string;
    number: string;
    status: 'available' | 'occupied' | 'calling' | 'billing';
    timeLabel: string;
}

export default function WaiterDashboard() {
    const [activeFilter, setActiveFilter] = useState('Todos');

    // Mock data based on the provided UI image
    const tables: Table[] = [
        { id: '1', number: '04', status: 'calling', timeLabel: 'Hace 2 min' },
        { id: '2', number: '01', status: 'occupied', timeLabel: 'Orden hace 15m' },
        { id: '3', number: '03', status: 'billing', timeLabel: 'Esperando cuenta (5m)' },
        { id: '4', number: '02', status: 'available', timeLabel: 'Libre hace 45m' },
        { id: '5', number: '05', status: 'available', timeLabel: 'Libre hace 10m' },
        { id: '6', number: '06', status: 'available', timeLabel: 'Libre hace 1h' },
    ];

    const filters = [
        { name: 'Todos', color: 'bg-primary' },
        { name: 'Disponible', color: 'bg-emerald-500' },
        { name: 'Ocupado', color: 'bg-amber-500' },
        { name: 'Llamando', color: 'bg-rose-500' },
    ];

    return (
        <WaiterLayout>
            {/* Header */}
            <header className="px-5 py-6 flex items-center justify-between sticky top-0 bg-slate-50/80 backdrop-blur-md z-40">
                <div className="flex items-center gap-4">
                    <button className="p-2 rounded-xl bg-white shadow-sm border border-slate-100">
                        <Menu className="w-6 h-6 text-slate-700" />
                    </button>
                    <h1 className="text-xl font-black text-slate-800 tracking-tight">Tablero de Mesero</h1>
                </div>
                <div className="relative">
                    <button className="p-2.5 rounded-full bg-orange-50 text-orange-600 shadow-sm border border-orange-100 relative">
                        <Bell className="w-6 h-6" />
                        <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-rose-500 rounded-full border-2 border-white ring-2 ring-rose-500/20"></span>
                    </button>
                </div>
            </header>

            <main className="px-5 space-y-8">
                {/* Waiter Profile Panel */}
                <section className="bg-white p-5 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 flex items-center justify-between group cursor-pointer active:scale-[0.98] transition-all">
                    <div className="flex items-center gap-4">
                        <div className="relative">
                            <img
                                src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=200&auto=format&fit=crop"
                                alt="Juan Pérez"
                                className="w-16 h-16 rounded-full object-cover border-4 border-slate-50"
                            />
                            <div className="absolute bottom-0 right-0 w-4 h-4 bg-emerald-500 rounded-full border-2 border-white"></div>
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-lg font-black text-slate-800">Juan Pérez</h2>
                                <ChevronDown className="w-4 h-4 text-slate-400" />
                            </div>
                            <div className="flex items-center gap-3 mt-1">
                                <span className="flex items-center gap-1.5 text-[10px] font-black text-emerald-600 uppercase tracking-widest bg-emerald-50 px-2 py-0.5 rounded-full">
                                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                                    Activo
                                </span>
                                <span className="text-xs font-bold text-slate-400">Turno: Tarde</span>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Assigned Tables Section */}
                <section className="space-y-6">
                    <h3 className="text-xl font-black text-slate-900 ml-1">Mesas Asignadas</h3>

                    {/* Filters Horizontal Scroll */}
                    <div className="flex gap-3 overflow-x-auto hide-scrollbar pb-2 -mx-5 px-5">
                        {filters.map((filter) => (
                            <button
                                key={filter.name}
                                onClick={() => setActiveFilter(filter.name)}
                                className={`flex items-center gap-2 px-6 py-2.5 rounded-2xl whitespace-nowrap transition-all duration-300 font-black text-sm ${activeFilter === filter.name
                                    ? `${filter.name === 'Todos' ? 'bg-primary shadow-primary/30' : filter.color + ' shadow-slate-200'} text-white shadow-lg scale-105`
                                    : 'bg-white text-slate-500 border border-slate-100'
                                    }`}
                            >
                                {filter.name !== 'Todos' && (
                                    <div className={`w-2 h-2 rounded-full ${filter.color.replace('bg-', 'bg-')}`}></div>
                                )}
                                {filter.name}
                            </button>
                        ))}
                    </div>

                    {/* Tables Grid */}
                    <div className="grid grid-cols-2 gap-4">
                        {tables.map((table) => (
                            <div key={table.id}>
                                <TableCard table={table} />
                            </div>
                        ))}
                    </div>
                </section>
            </main>

            {/* Floating Action Button */}
            <button className="fixed bottom-24 right-5 w-16 h-16 bg-primary rounded-full shadow-2xl shadow-primary/40 flex items-center justify-center text-white active:scale-95 transition-transform z-40 border-4 border-white">
                <Plus className="w-8 h-8" />
            </button>
        </WaiterLayout>
    );
}

function TableCard({ table }: { table: Table }) {
    const getStatusStyles = () => {
        switch (table.status) {
            case 'calling':
                return {
                    bg: 'bg-rose-50/50',
                    border: 'border-rose-100',
                    text: 'text-rose-600',
                    badge: 'bg-rose-100',
                    btn: 'bg-rose-500 text-white shadow-rose-500/20',
                    title: 'Llamando',
                    icon: <Bell className="w-5 h-5 animate-bounce" />,
                    accent: 'ring-rose-500'
                };
            case 'occupied':
                return {
                    bg: 'bg-white',
                    border: 'border-slate-100',
                    text: 'text-amber-600',
                    badge: 'bg-amber-100',
                    btn: 'bg-slate-50 text-slate-600 border border-slate-100',
                    title: 'Ocupado',
                    icon: null,
                    accent: 'ring-amber-500'
                };
            case 'billing':
                return {
                    bg: 'bg-white',
                    border: 'border-slate-100',
                    text: 'text-amber-600',
                    badge: 'bg-amber-100',
                    btn: 'bg-slate-50 text-slate-600 border border-slate-100',
                    title: 'Ocupado',
                    icon: null,
                    accent: 'ring-blue-500'
                };
            default:
                return {
                    bg: 'bg-white',
                    border: 'border-slate-100',
                    text: 'text-emerald-600',
                    badge: 'bg-emerald-100',
                    btn: 'bg-slate-50 text-slate-600 border border-slate-100',
                    title: 'Disponible',
                    icon: null,
                    accent: 'ring-emerald-500'
                };
        }
    };

    const styles = getStatusStyles();
    const btnLabel = table.status === 'calling' ? 'Atender' : table.status === 'occupied' ? 'Ver Orden' : table.status === 'billing' ? 'Cobrar' : 'Asignar';

    return (
        <motion.div
            whileTap={{ scale: 0.97 }}
            className={`${styles.bg} ${styles.border} border-2 p-5 rounded-[2.5rem] flex flex-col items-center gap-3 relative overflow-hidden shadow-sm group`}
        >
            {table.status === 'calling' && (
                <div className="absolute top-3 right-3 text-rose-400">
                    <Bell className="w-6 h-6 animate-pulse" />
                </div>
            )}

            <div className={`w-14 h-14 rounded-full flex items-center justify-center border-2 border-slate-50 shadow-inner bg-slate-50/50`}>
                <span className="text-2xl font-black text-rose-500">{table.number}</span>
            </div>

            <div className="text-center space-y-0.5">
                <p className={`text-sm font-black ${styles.text}`}>{styles.title}</p>
                <p className="text-[10px] font-bold text-slate-400 italic">{table.timeLabel}</p>
            </div>

            <button className={`w-full py-2.5 rounded-2xl text-xs font-black transition-all ${styles.btn} shadow-lg mt-1 group-hover:scale-105`}>
                {btnLabel}
            </button>
        </motion.div>
    );
}
