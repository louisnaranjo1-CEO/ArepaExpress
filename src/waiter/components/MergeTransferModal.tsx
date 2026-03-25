import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, GitMerge, ArrowRightLeft } from 'lucide-react';

interface MergeTransferModalProps {
    isOpen: boolean;
    onClose: () => void;
    mode: 'merge' | 'transfer';
    currentTable: any;
    tables: any[]; // Expects tables with derivedStatus
    onConfirm: (targetTableNumber: string) => Promise<void>;
}

export default function MergeTransferModal({
    isOpen,
    onClose,
    mode,
    currentTable,
    tables,
    onConfirm
}: MergeTransferModalProps) {
    const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    if (!isOpen || !currentTable) return null;

    // Filter tables based on mode
    const availableTargets = tables.filter(t => {
        if (t.number === currentTable.number) return false;
        if (mode === 'merge') {
            // merge into occupied or billing tables
            return t.derivedStatus === 'occupied' || t.derivedStatus === 'billing';
        } else {
            // transfer to available tables
            return t.derivedStatus === 'available';
        }
    });

    const handleConfirm = async () => {
        if (!selectedTarget) return;
        setIsProcessing(true);
        try {
            await onConfirm(selectedTarget);
            onClose();
        } catch (error) {
            console.error('Error processing table action:', error);
        } finally {
            setIsProcessing(false);
        }
    };

    const isMerge = mode === 'merge';

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[110] flex items-end justify-center sm:items-center bg-slate-900/60 backdrop-blur-sm p-4 sm:p-6"
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
                    <div className="flex justify-between items-center mb-6 shrink-0 border-b border-slate-100 pb-4">
                        <div className="flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${isMerge ? 'bg-purple-100 text-purple-600' : 'bg-amber-100 text-amber-600'}`}>
                                {isMerge ? <GitMerge className="w-6 h-6 transform -rotate-90" /> : <ArrowRightLeft className="w-6 h-6" />}
                            </div>
                            <div>
                                <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">
                                    {isMerge ? 'Unir Mesas' : 'Transferir Mesa'}
                                </h2>
                                <p className="text-xs font-bold text-slate-500">
                                    Mesa actual: <span className="text-slate-900 bg-slate-100 px-2 py-0.5 rounded-full">{currentTable.number}</span>
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="w-10 h-10 bg-slate-100/80 rounded-full flex items-center justify-center hover:bg-slate-200 transition-colors shrink-0 text-slate-500"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="mb-4">
                        <h3 className="text-sm font-bold text-slate-700 mb-3">
                            {isMerge ? 'Seleccione la mesa destino para unir (Mesa Ocupada)' : 'Seleccione la mesa destino (Mesa Libre)'}
                        </h3>
                        
                        {availableTargets.length === 0 ? (
                            <div className="p-4 bg-slate-50 rounded-2xl text-center">
                                <p className="text-sm text-slate-500 font-medium">No hay mesas {isMerge ? 'ocupadas' : 'libres'} disponibles.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-[50vh] overflow-y-auto pr-2 hide-scrollbar">
                                {availableTargets.map((table) => (
                                    <button
                                        key={table.id}
                                        onClick={() => setSelectedTarget(table.number)}
                                        className={`w-full aspect-square rounded-2xl flex flex-col items-center justify-center transition-all border-2
                                            ${selectedTarget === table.number 
                                                ? (isMerge ? 'bg-purple-50 border-purple-500 text-purple-700' : 'bg-amber-50 border-amber-500 text-amber-700') 
                                                : 'bg-white border-slate-100 text-slate-600 hover:border-slate-300'
                                            }`}
                                    >
                                        <span className="text-lg font-black">{table.number}</span>
                                        {table.name && <span className="text-[10px] font-bold text-slate-400 truncate w-full px-1 text-center">{table.name}</span>}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <button
                        onClick={handleConfirm}
                        disabled={!selectedTarget || isProcessing}
                        className={`mt-auto w-full flex items-center justify-center gap-3 p-5 text-white rounded-[2rem] font-black transition-all
                            ${!selectedTarget || isProcessing 
                                ? 'bg-slate-300 cursor-not-allowed' 
                                : isMerge ? 'bg-purple-600 hover:bg-purple-700 hover:scale-[1.02] active:scale-[0.98]' : 'bg-amber-500 hover:bg-amber-600 hover:scale-[1.02] active:scale-[0.98]'
                            }`}
                    >
                        {isProcessing ? (
                            <div className="w-6 h-6 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                            isMerge ? 'Confirmar Unión' : 'Confirmar Transferencia'
                        )}
                    </button>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
