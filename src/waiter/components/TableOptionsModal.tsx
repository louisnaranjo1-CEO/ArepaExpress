import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, GitMerge, ArrowRightLeft, SplitSquareHorizontal, Receipt, Store } from 'lucide-react';

interface TableOptionsModalProps {
    isOpen: boolean;
    onClose: () => void;
    table: any;
    activeOrders: any[];
    onAddOrder: () => void;
    onJoinTable: () => void;
    onTransferTable: () => void;
    onSplitBill: () => void;
    onCheckout: () => void;
}

export default function TableOptionsModal({
    isOpen,
    onClose,
    table,
    activeOrders,
    onAddOrder,
    onJoinTable,
    onTransferTable,
    onSplitBill,
    onCheckout
}: TableOptionsModalProps) {
    if (!isOpen || !table) return null;

    // Consolidate items from all orders
    const consolidatedItems = activeOrders.reduce((acc: any[], order: any) => {
        (order.items || []).forEach((item: any) => {
            // Using name + variant name to distinguish items
            const itemKey = `${item.productId}-${item.name}`;
            const existing = acc.find(i => `${i.productId}-${i.name}` === itemKey);
            
            if (existing) {
                existing.quantity += item.quantity;
            } else {
                acc.push({ ...item });
            }
        });
        return acc;
    }, []);

    const subtotal = consolidatedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center bg-slate-900/60 backdrop-blur-sm p-4 sm:p-6"
                onClick={onClose}
            >
                <motion.div
                    initial={{ y: "100%", opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: "100%", opacity: 0 }}
                    transition={{ type: "spring", damping: 25, stiffness: 200 }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl p-6 sm:p-8 relative overflow-hidden flex flex-col max-h-[90vh]"
                >
                    {/* Header */}
                    <div className="flex justify-between items-center mb-6 shrink-0">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center border-2 border-slate-50">
                                <span className="text-xl font-black text-slate-800">{table.number}</span>
                            </div>
                            <div>
                                <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Opciones de Mesa</h2>
                                <p className="text-xs font-bold text-slate-400">Seleccione una acción para la mesa</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="w-10 h-10 bg-slate-100/80 rounded-full flex items-center justify-center hover:bg-slate-200 transition-colors shrink-0 text-slate-500"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Order Summary (If occupied) */}
                    {consolidatedItems.length > 0 && (
                        <div className="mb-6 bg-slate-50/80 rounded-3xl border border-slate-100 p-4 max-h-48 overflow-y-auto hide-scrollbar shrink-0">
                            <div className="flex items-center justify-between mb-3 px-1">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Resumen de Consumo</span>
                                <span className="text-[10px] font-black text-slate-900 bg-primary/10 px-2 py-0.5 rounded-full">{consolidatedItems.length} items</span>
                            </div>
                            <div className="space-y-2">
                                {consolidatedItems.map((item, idx) => (
                                    <div key={idx} className="flex justify-between items-center bg-white p-2.5 rounded-xl border border-slate-100/50 shadow-sm">
                                        <div className="flex items-center gap-2">
                                            <div className="w-6 h-6 flex items-center justify-center bg-slate-100 rounded text-[10px] font-black text-slate-600">
                                                {item.quantity}
                                            </div>
                                            <span className="text-xs font-bold text-slate-700 w-32 truncate">{item.name}</span>
                                        </div>
                                        <span className="text-xs font-black text-slate-900">${(item.price * item.quantity).toFixed(2)}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="mt-4 pt-3 border-t border-slate-200 flex justify-between items-center px-1">
                                <span className="text-sm font-black text-slate-800">Total Acumulado</span>
                                <span className="text-lg font-black text-slate-900">${subtotal.toFixed(2)}</span>
                            </div>
                        </div>
                    )}

                    {/* Options Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 overflow-y-auto hide-scrollbar mb-4">
                        <button
                            onClick={onAddOrder}
                            className="flex flex-col items-center justify-center p-5 bg-white border-2 border-slate-100 rounded-3xl hover:border-primary hover:shadow-lg hover:shadow-primary/10 transition-all group"
                        >
                            <div className="w-12 h-12 bg-slate-50 text-slate-400 rounded-2xl flex items-center justify-center mb-3 group-hover:bg-primary group-hover:text-slate-900 transition-colors">
                                <Plus className="w-6 h-6" />
                            </div>
                            <span className="text-sm font-black text-slate-700 group-hover:text-slate-900 transition-colors text-center leading-tight">Agregar Pedido</span>
                        </button>

                        <button
                            onClick={onTransferTable}
                            className="flex flex-col items-center justify-center p-5 bg-white border-2 border-slate-100 rounded-3xl hover:border-amber-500 hover:shadow-lg hover:shadow-amber-500/10 transition-all group"
                        >
                            <div className="w-12 h-12 bg-slate-50 text-slate-400 rounded-2xl flex items-center justify-center mb-3 group-hover:bg-amber-500 group-hover:text-white transition-colors">
                                <ArrowRightLeft className="w-6 h-6" />
                            </div>
                            <span className="text-sm font-black text-slate-700 group-hover:text-amber-500 transition-colors text-center leading-tight">Transferir Mesa</span>
                        </button>

                        <button
                            onClick={onJoinTable}
                            className="flex flex-col items-center justify-center p-5 bg-white border-2 border-slate-100 rounded-3xl hover:border-purple-500 hover:shadow-lg hover:shadow-purple-500/10 transition-all group"
                        >
                            <div className="w-12 h-12 bg-slate-50 text-slate-400 rounded-2xl flex items-center justify-center mb-3 group-hover:bg-purple-500 group-hover:text-white transition-colors">
                                <GitMerge className="w-6 h-6 transform -rotate-90" />
                            </div>
                            <span className="text-sm font-black text-slate-700 group-hover:text-purple-500 transition-colors text-center leading-tight">Unir Mesas</span>
                        </button>

                        <button
                            onClick={onSplitBill}
                            className="flex flex-col items-center justify-center p-5 bg-white border-2 border-slate-100 rounded-3xl hover:border-blue-500 hover:shadow-lg hover:shadow-blue-500/10 transition-all group"
                        >
                            <div className="w-12 h-12 bg-slate-50 text-slate-400 rounded-2xl flex items-center justify-center mb-3 group-hover:bg-blue-500 group-hover:text-white transition-colors">
                                <SplitSquareHorizontal className="w-6 h-6 transform rotate-90" />
                            </div>
                            <span className="text-sm font-black text-slate-700 group-hover:text-blue-500 transition-colors text-center leading-tight">Dividir Cuenta</span>
                        </button>
                    </div>

                    <button
                        onClick={onCheckout}
                        className="w-full flex items-center justify-center gap-3 p-5 bg-slate-900 text-white rounded-[2rem] hover:scale-[1.02] active:scale-[0.98] transition-all font-black shrink-0 shadow-xl shadow-slate-900/20"
                    >
                        <Receipt className="w-6 h-6 text-emerald-400" />
                        Pedir Cuenta {subtotal > 0 && `($${subtotal.toFixed(2)})`}
                    </button>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
