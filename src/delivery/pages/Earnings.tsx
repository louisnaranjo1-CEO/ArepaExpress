import React from 'react';
import { DollarSign, Activity, Calendar, ArrowUpRight } from 'lucide-react';

export default function Earnings() {
    return (
        <div className="space-y-6 animate-fade-in">
            <h2 className="text-2xl font-black text-slate-800 tracking-tight px-2">Mis Ganancias</h2>

            <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-[32px] p-6 text-white shadow-xl shadow-indigo-600/30">
                <p className="text-indigo-100 font-bold mb-1 opacity-80 uppercase tracking-widest text-xs">Balance de Hoy</p>
                <div className="flex items-end gap-2 mb-6">
                    <span className="text-5xl font-black tracking-tighter">$45.00</span>
                    <span className="bg-white/20 px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1 mb-2">
                        <ArrowUpRight className="w-3 h-3" /> 12%
                    </span>
                </div>

                <div className="grid grid-cols-2 gap-4 border-t border-white/20 pt-4">
                    <div>
                        <p className="text-indigo-200 text-xs font-bold uppercase tracking-wider mb-1">Viajes</p>
                        <p className="font-black text-xl">15</p>
                    </div>
                    <div>
                        <p className="text-indigo-200 text-xs font-bold uppercase tracking-wider mb-1">Horas online</p>
                        <p className="font-black text-xl">4.5h</p>
                    </div>
                </div>
            </div>

            <div className="space-y-3">
                <h3 className="font-bold text-slate-800 px-2 text-lg">Historial Reciente</h3>

                {[1, 2, 3].map((i) => (
                    <div key={i} className="bg-white rounded-[24px] p-4 flex items-center justify-between border border-slate-100 shadow-sm">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shrink-0">
                                <DollarSign className="w-6 h-6" />
                            </div>
                            <div>
                                <p className="font-bold text-slate-900 leading-tight">Pedido Cumplido</p>
                                <p className="text-xs font-bold text-slate-400">Hace 2 horas • 3.5 km</p>
                            </div>
                        </div>
                        <span className="font-black text-emerald-600 text-lg">+$3.00</span>
                    </div>
                ))}
            </div>

            <button className="w-full bg-slate-100 text-indigo-600 font-black py-4 rounded-2xl active:scale-95 transition-transform flex justify-center items-center gap-2">
                <Calendar className="w-5 h-5" /> Ver Historial Completo
            </button>
        </div>
    );
}
