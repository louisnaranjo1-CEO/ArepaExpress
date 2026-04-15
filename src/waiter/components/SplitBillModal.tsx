import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Users, ListFilter, Plus, Minus, Receipt, CheckCircle } from 'lucide-react';
import { db } from '../../lib/firebase';
import DualPrice from '../../components/DualPrice';
import { collection, addDoc, doc, writeBatch, serverTimestamp, deleteDoc } from 'firebase/firestore';

interface OrderItem {
    id: string;
    name: string;
    price: number;
    quantity: number;
    variant?: any;
    modifiers?: any[];
}

interface SplitBillModalProps {
    isOpen: boolean;
    onClose: () => void;
    table: any;
    activeOrders: any[];
}

export default function SplitBillModal({
    isOpen,
    onClose,
    table,
    activeOrders
}: SplitBillModalProps) {
    const [splitMode, setSplitMode] = useState<'equal' | 'itemized'>('equal');
    const [numParts, setNumParts] = useState(2);
    
    // For itemized
    const [accounts, setAccounts] = useState([{ id: '1', items: [] as any[] }, { id: '2', items: [] as any[] }]);
    const [unassignedItems, setUnassignedItems] = useState<any[]>([]);
    
    const [isProcessing, setIsProcessing] = useState(false);

    // Flatten all items from active orders
    const allItems = useMemo(() => {
        let items: any[] = [];
        activeOrders.forEach(order => {
            order.items.forEach((item: any) => {
                // To make splitting quantities easier, we split items with quantity > 1 into individual items of quantity 1
                for (let i = 0; i < item.quantity; i++) {
                    items.push({
                        ...item,
                        uniqueId: `${order.id}-${item.id}-${i}`,
                        quantity: 1,
                        originalOrderId: order.id
                    });
                }
            });
        });
        return items;
    }, [activeOrders]);

    // Initialize itemized state when opening 
    React.useEffect(() => {
        if (isOpen) {
            setUnassignedItems(allItems);
            setAccounts([{ id: '1', items: [] }, { id: '2', items: [] }]);
            setNumParts(2);
            setSplitMode('equal');
        }
    }, [isOpen, allItems]);

    // Calculate totals
    const grandTotal = (activeOrders || []).reduce((sum, order) => sum + (order?.total || 0), 0);

    const handleConfirmSplit = async () => {
        setIsProcessing(true);
        const restaurantId = localStorage.getItem('waiterRestaurantId');
        if (!restaurantId) {
            setIsProcessing(false);
            return;
        }

        try {
            const batch = writeBatch(db);
            
            // Delete original orders since we are splitting them into new ones
            activeOrders.forEach(order => {
                const orderRef = doc(db, 'orders', order.id);
                // Instead of deleting, we could mark them as 'split' or just delete them to replace with the split parts
                // Deleting is cleaner for the cashier POS to not show duplicates
                batch.delete(orderRef);
            });

            if (splitMode === 'equal') {
                const splitTotal = grandTotal / numParts;
                for (let i = 0; i < numParts; i++) {
                    const newOrderRef = doc(collection(db, 'orders'));
                    batch.set(newOrderRef, {
                        restaurantId,
                        table: `${table.number}-${i + 1}`,
                        status: 'billing', // Send directly to cashier
                        paymentStatus: 'pending',
                        subtotal: splitTotal,
                        total: splitTotal,
                        items: [{
                            id: `split-${i}`,
                            name: `División de Cuenta (${i + 1}/${numParts})`,
                            price: splitTotal,
                            quantity: 1
                        }],
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp(),
                        waiterId: activeOrders[0]?.waiterId || 'unknown',
                        isSplit: true,
                        originalTable: table.number
                    });
                }
            } else {
                // Itemized
                // Ensure all items are assigned, if not assign to account 1? Or throw error
                if (unassignedItems.length > 0) {
                    alert('Debe asignar todos los productos a una cuenta antes de continuar.');
                    setIsProcessing(false);
                    return;
                }

                accounts.forEach((acc, i) => {
                    if (acc.items.length === 0) return; // Skip empty accounts
                    
                    const subtotal = (acc.items || []).reduce((sum, item) => sum + (item?.price || 0), 0);
                    // Add logic to group items back by ID to reduce array size
                    const groupedItems = (acc.items || []).reduce((accArr: any[], currentItem: any) => {
                        const existing = accArr.find(i => i.id === currentItem.id && JSON.stringify(i.variant) === JSON.stringify(currentItem.variant));
                        if (existing) {
                            existing.quantity += 1;
                        } else {
                            accArr.push({ ...currentItem }); // already has quantity 1
                        }
                        return accArr;
                    }, []);

                    const newOrderRef = doc(collection(db, 'orders'));
                    batch.set(newOrderRef, {
                        restaurantId,
                        table: `${table.number}-${i + 1}`,
                        status: 'billing',
                        paymentStatus: 'pending',
                        subtotal: subtotal,
                        total: subtotal,
                        items: groupedItems,
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp(),
                        waiterId: activeOrders[0]?.waiterId || 'unknown',
                        isSplit: true,
                        originalTable: table.number
                    });
                });
            }

            await batch.commit();
            onClose();
        } catch (error) {
            console.error('Error splitting bill:', error);
            alert('Hubo un error al procesar la división de cuenta.');
        } finally {
            setIsProcessing(false);
        }
    };

    const assignItemToAccount = (item: any, accountId: string) => {
        setUnassignedItems(prev => prev.filter(i => i.uniqueId !== item.uniqueId));
        setAccounts(prev => prev.map(acc => {
            if (acc.id === accountId) return { ...acc, items: [...acc.items, item] };
            return acc;
        }));
    };

    const returnItemToUnassigned = (item: any, accountId: string) => {
        setAccounts(prev => prev.map(acc => {
            if (acc.id === accountId) return { ...acc, items: acc.items.filter((i: any) => i.uniqueId !== item.uniqueId) };
            return acc;
        }));
        setUnassignedItems(prev => [...prev, item]);
    };

    const addAccount = () => {
        setAccounts(prev => [...prev, { id: (prev.length + 1).toString(), items: [] }]);
    };

    if (!isOpen || !table || activeOrders.length === 0) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4"
                onClick={onClose}
            >
                <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full max-w-4xl bg-slate-50 rounded-[2.5rem] shadow-2xl relative overflow-hidden flex flex-col h-[90vh]"
                >
                    {/* Header */}
                    <div className="bg-white p-6 border-b border-slate-100 flex justify-between items-center shrink-0">
                        <div>
                            <h2 className="text-2xl font-black text-slate-900">Dividir Cuenta</h2>
                            <div className="flex items-center gap-1.5 text-slate-500 font-medium">
                                <span>Mesa {table.number} - Total:</span>
                                <DualPrice usdAmount={grandTotal} className="text-slate-500 font-medium" showDivider={true} />
                            </div>
                        </div>
                        <button onClick={onClose} className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-200">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Mode Selector */}
                    <div className="p-6 bg-white shrink-0 border-b border-slate-100">
                        <div className="flex bg-slate-100 p-1 rounded-2xl">
                            <button
                                onClick={() => setSplitMode('equal')}
                                className={`flex-1 py-3 px-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                                    splitMode === 'equal' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                                }`}
                            >
                                <Users className="w-5 h-5" />
                                Partes Iguales
                            </button>
                            <button
                                onClick={() => setSplitMode('itemized')}
                                className={`flex-1 py-3 px-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                                    splitMode === 'itemized' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'
                                }`}
                            >
                                <ListFilter className="w-5 h-5" />
                                Por Productos
                            </button>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-hidden flex flex-col">
                        {splitMode === 'equal' ? (
                            <div className="flex-1 flex flex-col items-center justify-center p-8">
                                <h3 className="text-xl font-bold text-slate-700 mb-8">¿En cuántas partes desea dividir la cuenta?</h3>
                                
                                <div className="flex items-center gap-8 mb-12">
                                    <button
                                        onClick={() => setNumParts(Math.max(2, numParts - 1))}
                                        className="w-16 h-16 rounded-2xl bg-white border-2 border-slate-200 text-slate-600 flex items-center justify-center hover:bg-slate-50 hover:border-blue-500 hover:text-blue-500 transition-all active:scale-95"
                                    >
                                        <Minus className="w-8 h-8" />
                                    </button>
                                    
                                    <div className="w-32 h-32 rounded-full bg-blue-50 border-4 border-blue-100 flex flex-col items-center justify-center">
                                        <span className="text-5xl font-black text-blue-600">{numParts}</span>
                                        <span className="text-sm font-bold text-blue-400">partes</span>
                                    </div>
                                    
                                    <button
                                        onClick={() => setNumParts(Math.min(20, numParts + 1))}
                                        className="w-16 h-16 rounded-2xl bg-white border-2 border-slate-200 text-slate-600 flex items-center justify-center hover:bg-slate-50 hover:border-blue-500 hover:text-blue-500 transition-all active:scale-95"
                                    >
                                        <Plus className="w-8 h-8" />
                                    </button>
                                </div>

                                <div className="bg-white p-6 rounded-3xl border-2 border-slate-100 w-full max-w-sm text-center">
                                    <p className="text-slate-500 font-bold mb-2">Cada persona pagará:</p>
                                    <DualPrice 
                                        usdAmount={grandTotal / numParts} 
                                        className="text-4xl font-black text-slate-900" 
                                        usdClassName="text-4xl font-black"
                                        showDivider={true}
                                    />
                                </div>
                            </div>
                        ) : (
                            <div className="flex-1 flex overflow-hidden">
                                {/* Left: Unassigned Items */}
                                <div className="w-1/3 border-r border-slate-200 bg-white flex flex-col">
                                    <div className="p-4 bg-slate-50 border-b border-slate-200">
                                        <h3 className="font-bold text-slate-700 flex justify-between">
                                            <span>Por Asignar</span>
                                            <span className="bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full text-xs">
                                                {unassignedItems.length} items
                                            </span>
                                        </h3>
                                    </div>
                                    <div className="flex-1 overflow-y-auto p-4 space-y-2">
                                        {unassignedItems.map(item => (
                                            <div key={item.uniqueId} className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex flex-col gap-2">
                                                <div className="flex justify-between items-start">
                                                    <span className="font-bold text-slate-800 text-sm">{item.name}</span>
                                                    <DualPrice 
                                                        usdAmount={item.price} 
                                                        className="font-black text-slate-900"
                                                        showDivider={false}
                                                    />
                                                </div>
                                                <div className="flex gap-1 overflow-x-auto hide-scrollbar pb-1">
                                                    {accounts.map(acc => (
                                                        <button
                                                            key={acc.id}
                                                            onClick={() => assignItemToAccount(item, acc.id)}
                                                            className="px-3 py-1.5 bg-white border border-slate-200 hover:border-primary hover:text-primary rounded-lg text-xs font-bold text-slate-600 whitespace-nowrap"
                                                        >
                                                            C{acc.id}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                        {unassignedItems.length === 0 && (
                                            <div className="h-full flex flex-col items-center justify-center text-slate-400 p-4 text-center">
                                                <CheckCircle className="w-12 h-12 text-emerald-400 mb-2" />
                                                <p className="font-bold">Todos los productos asignados</p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Right: Accounts */}
                                <div className="flex-1 overflow-x-auto p-4 flex gap-4 bg-slate-100">
                                    {accounts.map(acc => {
                                        const accTotal = (acc.items || []).reduce((sum, item) => sum + (item?.price || 0), 0);
                                        return (
                                            <div key={acc.id} className="min-w-[280px] w-[280px] bg-white rounded-3xl border border-slate-200 flex flex-col overflow-hidden max-h-full">
                                                <div className="p-4 bg-slate-800 text-white flex justify-between items-center shrink-0">
                                                    <h3 className="font-bold">Cuenta {acc.id}</h3>
                                                    <DualPrice 
                                                        usdAmount={accTotal} 
                                                        className="text-white font-black"
                                                        usdClassName="text-white font-black"
                                                        showDivider={true}
                                                    />
                                                </div>
                                                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                                                    {acc.items.map((item: any) => (
                                                        <div key={item.uniqueId} className="p-2 flex justify-between items-center group bg-slate-50 rounded-lg">
                                                            <div className="flex flex-col truncate pr-2">
                                                                <span className="text-sm font-bold text-slate-800 truncate">{item.name}</span>
                                                                <DualPrice 
                                                                    usdAmount={item.price} 
                                                                    className="text-xs text-slate-500"
                                                                    showDivider={false}
                                                                />
                                                            </div>
                                                            <button
                                                                onClick={() => returnItemToUnassigned(item, acc.id)}
                                                                className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 hover:bg-red-100 hover:text-red-500 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                                            >
                                                                <X className="w-3 h-3" />
                                                            </button>
                                                        </div>
                                                    ))}
                                                    {acc.items.length === 0 && (
                                                        <p className="text-xs text-slate-400 text-center mt-4 font-medium italic">Sin productos</p>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                    <button
                                        onClick={addAccount}
                                        className="min-w-[280px] w-[280px] rounded-3xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 hover:text-slate-600 hover:border-slate-400 transition-colors hover:bg-slate-50/50"
                                    >
                                        <Plus className="w-8 h-8 mb-2" />
                                        <span className="font-bold">Agregar Cuenta</span>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="p-6 bg-white border-t border-slate-100 shrink-0">
                        <button
                            onClick={handleConfirmSplit}
                            disabled={isProcessing || (splitMode === 'itemized' && unassignedItems.length > 0)}
                            className={`w-full flex items-center justify-center gap-3 p-5 rounded-[2rem] font-black text-white transition-all text-lg
                                ${isProcessing || (splitMode === 'itemized' && unassignedItems.length > 0)
                                    ? 'bg-slate-300 cursor-not-allowed'
                                    : 'bg-emerald-500 hover:bg-emerald-600 hover:scale-[1.01] active:scale-[0.99] shadow-xl shadow-emerald-500/20'
                                }`}
                        >
                            {isProcessing ? (
                                <div className="w-6 h-6 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                                <>
                                    <Receipt className="w-6 h-6" />
                                    Confirmar y Enviar a Caja
                                </>
                            )}
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
