import React, { useState, useEffect } from 'react';
import { DollarSign, TrendingDown, TrendingUp, Plus, Calendar, Settings, FileText, CheckCircle, Clock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface Expense {
    id: string;
    description: string;
    category: string;
    amount: number;
    paymentMethod: string;
    date: any;
}

interface CashRegister {
    id: string;
    date: any;
    grossIncome: number;
    totalExpenses: number;
    netProfit: number;
    closedBy: string;
}

export default function Finance() {
    const { user, userData } = useAuth();
    const rid = userData?.managedRestaurantId || user?.uid;
    const [loading, setLoading] = useState(true);
    const [grossIncome, setGrossIncome] = useState(0);
    const [totalExpenses, setTotalExpenses] = useState(0);
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [closures, setClosures] = useState<CashRegister[]>([]);
    const [sales, setSales] = useState<any[]>([]);
    const [activeTab, setActiveTab] = useState<'expenses' | 'closures' | 'sales'>('sales');

    // Modal state
    const [showExpenseModal, setShowExpenseModal] = useState(false);
    const [expenseForm, setExpenseForm] = useState({
        description: '',
        category: 'Insumos',
        amount: '',
        paymentMethod: 'Efectivo',
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    const expenseCategories = ['Insumos', 'Nómina', 'Servicios', 'Mantenimiento', 'Marketing', 'Otros'];
    const paymentMethods = ['Efectivo', 'Punto de Venta', 'Transferencia', 'Pago Móvil'];

    useEffect(() => {
        if (!rid) return;
        fetchFinanceData();
    }, [rid]);

    const fetchFinanceData = async () => {
        if (!user) return;
        setLoading(true);
        try {
            // Get today's bounds
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);

            // Fetch successful orders for today
            const { data: ordersData, error: ordersErr } = await supabase
                .from('orders')
                .select('*')
                .eq('restaurant_id', rid)
                .gte('created_at', today.toISOString())
                .lt('created_at', tomorrow.toISOString());

            if (ordersErr) console.error("Error fetching orders:", ordersErr);

            let income = 0;
            const salesList: any[] = [];
            (ordersData || []).forEach(o => {
                const totalNum = Number(o.total || 0);
                income += totalNum;
                salesList.push({
                    id: o.id,
                    ...o,
                    total: totalNum,
                    tip: Number(o.tip || 0),
                    paymentMethod: o.payment_method || o.paymentMethod || 'Pagado',
                    waiterName: o.waiter_name || o.waiterName,
                    createdAt: o.created_at ? new Date(o.created_at) : new Date()
                });
            });
            setGrossIncome(income);
            setSales(salesList.sort((a, b) => (b.createdAt?.getTime?.() || 0) - (a.createdAt?.getTime?.() || 0)));

            // Fetch expenses from Supabase
            const { data: expensesData, error: expErr } = await supabase
                .from('expenses')
                .select('*')
                .eq('restaurant_id', rid)
                .order('date', { ascending: false });

            if (expErr) console.error("Error fetching expenses:", expErr);

            const expensesList: Expense[] = [];
            let todayExp = 0;

            (expensesData || []).forEach(data => {
                const dateObj = data.date ? new Date(data.date) : new Date(data.created_at);
                const amountNum = Number(data.amount || 0);
                expensesList.push({
                    id: data.id,
                    description: data.description,
                    category: data.category,
                    amount: amountNum,
                    paymentMethod: data.payment_method || data.paymentMethod || 'Efectivo',
                    date: dateObj
                });

                // If it's from today, add to todayExp
                if (dateObj >= today && dateObj < tomorrow) {
                    todayExp += amountNum;
                }
            });
            setTotalExpenses(todayExp);
            setExpenses(expensesList);

            // Fetch closures from Supabase
            const { data: closuresData, error: closErr } = await supabase
                .from('cash_registers')
                .select('*')
                .eq('restaurant_id', rid)
                .order('date', { ascending: false });

            if (closErr) console.error("Error fetching closures:", closErr);

            const closuresList: CashRegister[] = (closuresData || []).map(doc => ({
                id: doc.id,
                date: doc.date ? new Date(doc.date) : new Date(doc.created_at),
                grossIncome: Number(doc.gross_income ?? doc.grossIncome ?? 0),
                totalExpenses: Number(doc.total_expenses ?? doc.totalExpenses ?? 0),
                netProfit: Number(doc.net_profit ?? doc.netProfit ?? 0),
                closedBy: doc.closed_by ?? doc.closedBy ?? 'Admin'
            }));
            setClosures(closuresList);

        } catch (error) {
            console.error("Error fetching finance data:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleAddExpense = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!rid) return;

        setIsSubmitting(true);
        try {
            const { error } = await supabase.from('expenses').insert({
                restaurant_id: rid,
                description: expenseForm.description,
                category: expenseForm.category,
                amount: parseFloat(expenseForm.amount),
                payment_method: expenseForm.paymentMethod,
                date: new Date().toISOString()
            });

            if (error) throw error;

            setExpenseForm({ description: '', category: 'Insumos', amount: '', paymentMethod: 'Efectivo' });
            setShowExpenseModal(false);
            fetchFinanceData();
        } catch (error) {
            console.error("Error adding expense:", error);
            alert("Error al registrar el gasto");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCloseRegister = async () => {
        if (!rid) return;
        if (!window.confirm("¿Estás seguro de cerrar la caja de hoy? Esto guardará un registro histórico con el saldo actual.")) return;

        try {
            const { error } = await supabase.from('cash_registers').insert({
                restaurant_id: rid,
                date: new Date().toISOString(),
                gross_income: grossIncome,
                total_expenses: totalExpenses,
                net_profit: grossIncome - totalExpenses,
                closed_by: user.email || 'Admin'
            });

            if (error) throw error;

            alert("Cierre de caja registrado exitosamente");
            fetchFinanceData();
        } catch (error) {
            console.error("Error closing register:", error);
            alert("Error al realizar el cierre de caja");
        }
    };

    const netProfit = grossIncome - totalExpenses;

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px]">
                <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                <p className="mt-4 text-slate-500 font-bold">Cargando datos financieros...</p>
            </div>
        );
    }

    return (
        <div className="space-y-3 sm:space-y-6 animate-in fade-in duration-700 pb-20">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl sm:text-3xl font-black text-slate-900 flex items-center gap-2">
                        <DollarSign className="w-6 h-6 sm:w-8 sm:h-8 text-slate-900" />
                        Finanzas y Caja
                    </h1>
                    <p className="text-xs sm:text-sm text-slate-500 font-medium">Gestiona ingresos, gastos y cierre de caja.</p>
                </div>
                <div className="flex gap-2 shrink-0">
                    <button
                        onClick={() => setShowExpenseModal(true)}
                        className="bg-red-50 text-red-600 px-2.5 py-2 sm:px-5 sm:py-3 rounded-xl sm:rounded-2xl font-black text-xs sm:text-sm hover:bg-red-100 transition-all shadow-xs flex items-center gap-1 sm:gap-2"
                    >
                        <TrendingDown className="w-4 h-4" />
                        <span className="hidden sm:inline">Registrar</span> Gasto
                    </button>
                    <button
                        onClick={handleCloseRegister}
                        className="bg-slate-900 text-white px-2.5 py-2 sm:px-5 sm:py-3 rounded-xl sm:rounded-2xl font-black text-xs sm:text-sm hover:bg-slate-800 transition-all shadow-md flex items-center gap-1 sm:gap-2"
                    >
                        <Calendar className="w-4 h-4" />
                        <span className="hidden sm:inline">Cerrar</span> Caja
                    </button>
                </div>
            </div>

            {/* Compact Integrated Metrics Dashboard */}
            <div className="grid grid-cols-3 gap-2 sm:gap-4 p-3 sm:p-5 bg-white rounded-2xl sm:rounded-3xl border border-slate-100 shadow-sm">
                <div className="flex flex-col justify-between">
                    <div className="flex items-center gap-1 sm:gap-2 mb-1">
                        <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg bg-green-50 text-green-600 flex items-center justify-center shrink-0">
                            <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </div>
                        <span className="text-[9px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider line-clamp-1">Ventas Hoy</span>
                    </div>
                    <p className="text-base sm:text-2xl font-black text-slate-900">${grossIncome.toFixed(2)}</p>
                </div>

                <div className="flex flex-col justify-between border-x border-slate-100 px-2 sm:px-4">
                    <div className="flex items-center gap-1 sm:gap-2 mb-1">
                        <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                            <TrendingDown className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </div>
                        <span className="text-[9px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider line-clamp-1">Gastos Hoy</span>
                    </div>
                    <p className="text-base sm:text-2xl font-black text-slate-900">${totalExpenses.toFixed(2)}</p>
                </div>

                <div className="flex flex-col justify-between pl-1 sm:pl-2">
                    <div className="flex items-center gap-1 sm:gap-2 mb-1">
                        <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center shrink-0">
                            <DollarSign className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </div>
                        <span className="text-[9px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider line-clamp-1">Ganancia</span>
                    </div>
                    <p className="text-base sm:text-2xl font-black text-emerald-600">${netProfit.toFixed(2)}</p>
                </div>
            </div>

            {/* Content Tabs */}
            <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="flex border-b border-slate-100">
                    <button
                        onClick={() => setActiveTab('sales')}
                        className={`flex-1 py-3 sm:py-4 font-black text-xs sm:text-sm uppercase tracking-wider transition-colors ${activeTab === 'sales' ? 'text-slate-900 border-b-2 border-slate-900 bg-slate-50/50' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
                    >
                        Ventas Hoy
                    </button>
                    <button
                        onClick={() => setActiveTab('expenses')}
                        className={`flex-1 py-3 sm:py-4 font-black text-xs sm:text-sm uppercase tracking-wider transition-colors ${activeTab === 'expenses' ? 'text-slate-900 border-b-2 border-slate-900 bg-slate-50/50' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
                    >
                        Gastos
                    </button>
                    <button
                        onClick={() => setActiveTab('closures')}
                        className={`flex-1 py-3 sm:py-4 font-black text-xs sm:text-sm uppercase tracking-wider transition-colors ${activeTab === 'closures' ? 'text-slate-900 border-b-2 border-slate-900 bg-slate-50/50' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
                    >
                        Cierres
                    </button>
                </div>

                <div className="p-3 sm:p-6">
                    {activeTab === 'sales' && (
                        <div className="space-y-4">
                            {sales.length === 0 ? (
                                <div className="text-center py-10 opacity-50">
                                    <DollarSign className="w-12 h-12 mx-auto mb-3 text-slate-400" />
                                    <p className="font-bold text-slate-500">No hay ventas registradas hoy</p>
                                </div>
                            ) : (
                                sales.map(sale => (
                                    <div key={sale.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-slate-50 rounded-2xl gap-4 hover:bg-slate-100 transition-colors">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 bg-white rounded-xl shadow-sm border border-slate-200 flex items-center justify-center text-green-500">
                                                <CheckCircle className="w-6 h-6" />
                                            </div>
                                            <div>
                                                <h4 className="font-black text-slate-800">{sale.userName || 'Anónimo'}</h4>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-md font-bold uppercase tracking-wider">{sale.paymentMethod || 'Pagado'}</span>
                                                    {sale.source === 'waiter' && (
                                                        <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-md font-bold uppercase tracking-wider">
                                                            Mesero: {sale.waiterName || 'Desconocido'}
                                                        </span>
                                                    )}
                                                    <span className="text-xs text-slate-400 font-bold flex items-center gap-1">
                                                        <Clock className="w-3 h-3" />
                                                        {sale.createdAt ? (sale.createdAt.toLocaleTimeString ? sale.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : new Date(sale.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) : ''}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-black text-xl text-green-600">${sale.total.toFixed(2)}</p>
                                            {sale.tip > 0 && (
                                                <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">
                                                    Propina: <span className="text-slate-900">${sale.tip.toFixed(2)}</span>
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                    {activeTab === 'expenses' && (
                        <div className="space-y-4">
                            {expenses.length === 0 ? (
                                <div className="text-center py-10 opacity-50">
                                    <FileText className="w-12 h-12 mx-auto mb-3 text-slate-400" />
                                    <p className="font-bold text-slate-500">No hay gastos registrados</p>
                                </div>
                            ) : (
                                expenses.map(expense => (
                                    <div key={expense.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-slate-50 rounded-2xl gap-4 hover:bg-slate-100 transition-colors">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 bg-white rounded-xl shadow-sm border border-slate-200 flex items-center justify-center text-red-500">
                                                <TrendingDown className="w-6 h-6" />
                                            </div>
                                            <div>
                                                <h4 className="font-black text-slate-800">{expense.description}</h4>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="text-[10px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded-md font-bold uppercase tracking-wider">{expense.category}</span>
                                                    <span className="text-xs text-slate-400 font-bold flex items-center gap-1">
                                                        <Clock className="w-3 h-3" />
                                                        {expense.date ? (expense.date.toLocaleDateString ? expense.date.toLocaleDateString() : new Date(expense.date).toLocaleDateString()) : 'Pendiente'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-black text-xl text-red-600">-${expense.amount.toFixed(2)}</p>
                                            <p className="text-xs text-slate-500 font-bold">{expense.paymentMethod}</p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {activeTab === 'closures' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {closures.length === 0 ? (
                                <div className="col-span-1 text-center py-10 opacity-50">
                                    <Calendar className="w-12 h-12 mx-auto mb-3 text-slate-400" />
                                    <p className="font-bold text-slate-500">No hay cierres de caja registrados</p>
                                </div>
                            ) : (
                                closures.map(closure => (
                                    <div key={closure.id} className="bg-white border-2 border-slate-100 rounded-[25px] p-6 shadow-sm">
                                        <div className="flex justify-between items-start mb-6">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 bg-primary/10 text-slate-900 rounded-xl flex items-center justify-center">
                                                    <Calendar className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <p className="font-black text-slate-800 text-lg">
                                                        {closure.date ? (closure.date.toLocaleDateString ? closure.date.toLocaleDateString() : new Date(closure.date).toLocaleDateString()) : 'Fecha Inválida'}
                                                    </p>
                                                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{closure.closedBy}</p>
                                                </div>
                                            </div>
                                            <span className="bg-green-100 text-green-600 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1">
                                                <CheckCircle className="w-3 h-3" /> Cerrado
                                            </span>
                                        </div>

                                        <div className="space-y-3 bg-slate-50 p-4 rounded-2xl">
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="font-bold text-slate-500">Ventas</span>
                                                <span className="font-black text-slate-900">${closure.grossIncome.toFixed(2)}</span>
                                            </div>
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="font-bold text-slate-500">Gastos</span>
                                                <span className="font-black text-red-500">-${closure.totalExpenses.toFixed(2)}</span>
                                            </div>
                                            <div className="pt-3 mt-3 border-t border-slate-200 flex justify-between items-center">
                                                <span className="font-black text-slate-900">Saldo Neto</span>
                                                <span className="font-black text-slate-900 text-xl">${closure.netProfit.toFixed(2)}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Expense Modal */}
            {showExpenseModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowExpenseModal(false)}></div>
                    <div className="bg-white w-full max-w-md rounded-[40px] shadow-2xl relative z-10 overflow-hidden animate-in zoom-in-95 duration-200 p-8">
                        <h2 className="text-2xl font-black text-slate-900 mb-6 flex items-center gap-2">
                            <TrendingDown className="w-6 h-6 text-red-500" />
                            Registrar Gasto
                        </h2>

                        <form onSubmit={handleAddExpense} className="space-y-5">
                            <div className="space-y-2">
                                <label className="text-xs font-black text-slate-400 uppercase ml-2">Descripción</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Ej: Compra de vegetales"
                                    value={expenseForm.description}
                                    onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                                    className="w-full bg-slate-50 border-2 border-transparent focus:border-red-500 p-4 rounded-2xl outline-none font-bold text-slate-700"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-slate-400 uppercase ml-2">Monto ($)</label>
                                    <input
                                        type="number"
                                        required
                                        step="0.01"
                                        placeholder="0.00"
                                        value={expenseForm.amount}
                                        onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                                        className="w-full bg-slate-50 border-2 border-transparent focus:border-red-500 p-4 rounded-2xl outline-none font-bold text-slate-700"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-slate-400 uppercase ml-2">Categoría</label>
                                    <select
                                        value={expenseForm.category}
                                        onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
                                        className="w-full bg-slate-50 border-2 border-transparent focus:border-red-500 p-4 rounded-2xl outline-none font-bold text-slate-700"
                                    >
                                        {expenseCategories.map(cat => (
                                            <option key={cat} value={cat}>{cat}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-black text-slate-400 uppercase ml-2">Método de Pago</label>
                                <select
                                    value={expenseForm.paymentMethod}
                                    onChange={(e) => setExpenseForm({ ...expenseForm, paymentMethod: e.target.value })}
                                    className="w-full bg-slate-50 border-2 border-transparent focus:border-red-500 p-4 rounded-2xl outline-none font-bold text-slate-700"
                                >
                                    {paymentMethods.map(method => (
                                        <option key={method} value={method}>{method}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex gap-4 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setShowExpenseModal(false)}
                                    className="flex-1 bg-slate-100 text-slate-500 py-4 rounded-2xl font-black hover:bg-slate-200 transition-all"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="flex-1 bg-red-500 text-white py-4 rounded-2xl font-black shadow-lg hover:shadow-red-500/30 transition-all disabled:opacity-50"
                                >
                                    {isSubmitting ? 'Guardando...' : 'Guardar'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
