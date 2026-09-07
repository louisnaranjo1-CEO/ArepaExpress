import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Handshake, AlertTriangle, Plus, Search, CheckCircle, Clock, X, Save, TrendingUp, Users } from 'lucide-react';
import { db } from '../../lib/firebase';
import { collection, doc, query, onSnapshot, addDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';

interface Installment {
    amount: number;
    dueDate: number;
    status: 'pending' | 'paid' | 'defaulted';
}

interface Credit {
    id: string;
    userEmail: string;
    totalAmount: number;
    initialPayment: number;
    status: 'active' | 'completed' | 'defaulted';
    installments: Installment[];
    createdAt: number;
}

export default function ResuelveManager() {
    const { user, userData } = useAuth();
    const rid = userData?.managedRestaurantId || user?.uid;
    const [credits, setCredits] = useState<Credit[]>([]);
    const [isAdding, setIsAdding] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    
    // Form States
    const [userEmail, setUserEmail] = useState('');
    const [totalAmount, setTotalAmount] = useState('');
    const [initialPayment, setInitialPayment] = useState('');
    const [numInstallments, setNumInstallments] = useState('2');
    
    // Stats
    const totalReceivable = credits.filter(c => c.status !== 'completed').reduce((acc, curr) => {
       const pending = curr.installments.filter(i => i.status !== 'paid').reduce((a, b) => a + b.amount, 0);
       return acc + pending;
    }, 0);

    const activeUsers = new Set(credits.filter(c => c.status !== 'completed').map(c => c.userEmail)).size;

    useEffect(() => {
        if (!rid) return;
        const q = query(collection(db, 'restaurants', rid, 'credits'));
        const unsub = onSnapshot(q, (snap) => {
            const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Credit));
            setCredits(data.sort((a,b) => b.createdAt - a.createdAt));
        });
        return () => unsub();
    }, [rid]);

    const handleCreateCredit = async (e: React.FormEvent) => {
        e.preventDefault();
        if(!user) return;
        
        try {
            const tAmount = parseFloat(totalAmount);
            const initPayment = parseFloat(initialPayment);
            const nInstallments = parseInt(numInstallments);
            
            if(tAmount <= 0) return alert('El monto debe ser a favor del restaurante.');
            
            const remaining = tAmount - initPayment;
            const installmentAmount = remaining / nInstallments;
            
            const installments: Installment[] = [];
            const currentDate = new Date();
            
            for(let i=1; i<=nInstallments; i++) {
                // Add 15 days per installment
                const dueDate = new Date(currentDate.getTime() + (15 * 24 * 60 * 60 * 1000 * i));
                installments.push({
                    amount: installmentAmount,
                    dueDate: dueDate.getTime(),
                    status: 'pending'
                });
            }

            const newCredit = {
                userEmail,
                totalAmount: tAmount,
                initialPayment: initPayment,
                installments,
                status: 'active',
                createdAt: Date.now()
            };

            await addDoc(collection(db, 'restaurants', rid, 'credits'), newCredit);
            setIsAdding(false);
            
            // Reset
            setUserEmail('');
            setTotalAmount('');
            setInitialPayment('');
            setNumInstallments('2');
            
        } catch (error) {
            console.error("Error creating credit:", error);
            alert("Error al otorgar crédito.");
        }
    };

    const markInstallmentPaid = async (creditId: string, installmentIndex: number) => {
        if(!rid) return;
        try {
            const credit = credits.find(c => c.id === creditId);
            if(!credit) return;

            const updatedInstallments = [...credit.installments];
            updatedInstallments[installmentIndex].status = 'paid';
            
            const allPaid = updatedInstallments.every(i => i.status === 'paid');
            const newStatus = allPaid ? 'completed' : 'active';

            await updateDoc(doc(db, 'restaurants', rid, 'credits', creditId), {
                installments: updatedInstallments,
                status: newStatus
            });
        } catch (error) {
            console.error("Error updating installment", error);
        }
    };

    const filtered = credits.filter(c => c.userEmail.toLowerCase().includes(searchTerm.toLowerCase()));

    return (
        <div className="space-y-6">
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                        <Handshake className="w-8 h-8 text-primary" />
                        Créditos "2x3 Resuelve"
                    </h1>
                    <p className="text-sm font-bold text-slate-500">Gestiona las ventas a crédito de tu negocio</p>
                </div>
                <button
                    onClick={() => setIsAdding(true)}
                    className="flex items-center gap-2 px-5 py-3 bg-primary text-slate-900 rounded-xl font-black shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all"
                >
                    <Plus className="w-5 h-5" />
                    <span>Fiar Mercancía</span>
                </button>
            </header>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-6 rounded-[24px] border border-slate-100 shadow-[0_2__10px_-3px_rgba(0,0,0,0.1)] flex items-center gap-4">
                    <div className="w-14 h-14 bg-emerald-50 text-emerald-500 rounded-2xl flex items-center justify-center">
                        <TrendingUp className="w-7 h-7" />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Por Cobrar</p>
                        <p className="text-2xl font-black text-slate-900">${totalReceivable.toFixed(2)}</p>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-[24px] border border-slate-100 shadow-[0_2__10px_-3px_rgba(0,0,0,0.1)] flex items-center gap-4">
                    <div className="w-14 h-14 bg-blue-50 text-blue-500 rounded-2xl flex items-center justify-center">
                        <Users className="w-7 h-7" />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Clientes Activos</p>
                        <p className="text-2xl font-black text-slate-900">{activeUsers}</p>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-[24px] border border-slate-100 shadow-[0_2__10px_-3px_rgba(0,0,0,0.1)] flex items-center gap-4">
                    <div className="w-14 h-14 bg-amber-50 text-amber-500 rounded-2xl flex items-center justify-center">
                        <AlertTriangle className="w-7 h-7" />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Vencidos</p>
                        <p className="text-2xl font-black text-slate-900">{credits.filter(c => c.status === 'defaulted').length}</p>
                    </div>
                </div>
            </div>

            {/* List */}
            <div className="bg-white rounded-[32px] p-6 shadow-xl shadow-slate-200/50 border border-slate-100">
                <div className="flex gap-4 mb-6">
                    <div className="flex-1 relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Buscar cliente por correo o teléfono..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-transparent focus:border-primary rounded-2xl font-bold text-slate-700 outline-none transition-all"
                        />
                    </div>
                </div>

                <div className="space-y-4">
                    {filtered.length === 0 ? (
                        <div className="text-center py-12 text-slate-500">
                            No hay créditos registrados.
                        </div>
                    ) : (
                        filtered.map(credit => (
                            <div key={credit.id} className="border-2 border-slate-100 rounded-2xl p-4 md:p-6 group hover:border-primary/30 transition-all flex flex-col md:flex-row gap-6">
                                <div className="flex-1 border-b md:border-b-0 md:border-r border-slate-100 pb-4 md:pb-0 md:pr-6">
                                    <h3 className="text-lg font-black text-slate-900 truncate" title={credit.userEmail}>{credit.userEmail}</h3>
                                    <div className="flex items-center gap-4 mt-2 mb-4">
                                        <div>
                                            <p className="text-[10px] uppercase font-black text-slate-400">Total Venta</p>
                                            <p className="text-sm font-black text-slate-900">${credit.totalAmount.toFixed(2)}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] uppercase font-black text-slate-400">Inicial</p>
                                            <p className="text-sm font-black text-emerald-600">${credit.initialPayment.toFixed(2)}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] uppercase font-black text-slate-400">Estado</p>
                                            <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                                                credit.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                                                credit.status === 'defaulted' ? 'bg-red-100 text-red-700' :
                                                'bg-amber-100 text-amber-700'
                                            }`}>
                                                {credit.status === 'completed' ? 'Pagado' : credit.status === 'defaulted' ? 'Atrasado' : 'Activo'}
                                            </span>
                                        </div>
                                    </div>
                                    <p className="text-xs font-bold text-slate-400">
                                        Otorgado: {new Date(credit.createdAt).toLocaleDateString()}
                                    </p>
                                </div>
                                <div className="flex-1 flex flex-col justify-center">
                                    <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">Cuotas ({credit.installments.length})</h4>
                                    <div className="space-y-2">
                                        {credit.installments.map((inst, idx) => (
                                            <div key={idx} className={`flex items-center justify-between p-3 rounded-xl border ${inst.status === 'paid' ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-100'}`}>
                                                <div className="flex items-center gap-3">
                                                    {inst.status === 'paid' ? (
                                                        <CheckCircle className="w-5 h-5 text-emerald-500" />
                                                    ) : (
                                                        <Clock className="w-5 h-5 text-amber-500" />
                                                    )}
                                                    <div>
                                                        <p className={`text-sm font-black ${inst.status === 'paid' ? 'text-emerald-700' : 'text-slate-900'}`}>${inst.amount.toFixed(2)}</p>
                                                        <p className={`text-[10px] font-bold ${inst.status === 'paid' ? 'text-emerald-600/70' : 'text-slate-500'}`}>
                                                            Vence: {new Date(inst.dueDate).toLocaleDateString()}
                                                        </p>
                                                    </div>
                                                </div>
                                                {inst.status !== 'paid' && (
                                                    <button
                                                        onClick={() => markInstallmentPaid(credit.id, idx)}
                                                        className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 font-bold text-xs rounded-lg shadow-sm hover:bg-slate-100 transition-colors"
                                                    >
                                                        Marcar Pagada
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Modal de Agregar */}
            {isAdding && (
                <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-white rounded-[32px] p-6 max-w-md w-full shadow-2xl overflow-y-auto max-h-[90vh]"
                    >
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-black text-slate-900">Otorgar Crédito</h2>
                            <button onClick={() => setIsAdding(false)} className="p-2 bg-slate-100 text-slate-500 rounded-full hover:bg-slate-200">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleCreateCredit} className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-xs font-black text-slate-500 uppercase">Correo de usuario Un 2x3</label>
                                <input
                                    type="email"
                                    required
                                    value={userEmail}
                                    onChange={(e) => setUserEmail(e.target.value)}
                                    placeholder="ejemplo@correo.com"
                                    className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 focus:border-primary focus:bg-white rounded-xl outline-none transition-all font-bold text-slate-700"
                                />
                                <p className="text-[10px] text-slate-400 font-bold">* El usuario debe estar registrado en el app.</p>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4 mt-2">
                                <div className="space-y-1">
                                    <label className="text-xs font-black text-slate-500 uppercase">Monto Total</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                                        <input
                                            type="number"
                                            required min="0" step="0.01"
                                            value={totalAmount}
                                            onChange={(e) => setTotalAmount(e.target.value)}
                                            className="w-full pl-8 pr-4 py-3 bg-slate-50 border-2 border-slate-100 focus:border-primary focus:bg-white rounded-xl outline-none transition-all font-bold text-slate-700"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-black text-slate-500 uppercase">Pago Inicial</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                                        <input
                                            type="number"
                                            required min="0" step="0.01"
                                            value={initialPayment}
                                            onChange={(e) => setInitialPayment(e.target.value)}
                                            className="w-full pl-8 pr-4 py-3 bg-slate-50 border-2 border-slate-100 focus:border-primary focus:bg-white rounded-xl outline-none transition-all font-bold text-slate-700"
                                        />
                                    </div>
                                </div>
                            </div>
                            
                            <div className="space-y-1">
                                <label className="text-xs font-black text-slate-500 uppercase">Número de Cuotas Restantes</label>
                                <select
                                    value={numInstallments}
                                    onChange={(e) => setNumInstallments(e.target.value)}
                                    className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 focus:border-primary focus:bg-white rounded-xl outline-none transition-all font-bold text-slate-700"
                                >
                                    {[1,2,3,4,5,6].map(n => (
                                        <option key={n} value={n}>{n} {n === 1 ? 'Cuota' : 'Cuotas'} (cada 15 días)</option>
                                    ))}
                                </select>
                            </div>

                            <button
                                type="submit"
                                className="w-full mt-6 py-4 bg-primary text-slate-900 rounded-2xl font-black shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex justify-center items-center gap-2"
                            >
                                <Save className="w-5 h-5" />
                                Guardar Crédito (Fiar)
                            </button>
                        </form>
                    </motion.div>
                </div>
            )}
        </div>
    );
}
