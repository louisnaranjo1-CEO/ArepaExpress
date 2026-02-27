import React, { useState, useEffect } from 'react';
import { X, SlidersHorizontal, Trash2 } from 'lucide-react';
import { CATEGORIES } from '../pages/Search'; // We will export this from Search.tsx

export interface FilterState {
    category: string | null;
    minPrice: number | '';
    maxPrice: number | '';
    onlyPromotions: boolean;
}

interface FilterModalProps {
    isOpen: boolean;
    onClose: () => void;
    onApply: (filters: FilterState) => void;
    initialFilters: FilterState;
}

export default function FilterModal({ isOpen, onClose, onApply, initialFilters }: FilterModalProps) {
    const [filters, setFilters] = useState<FilterState>(initialFilters);

    useEffect(() => {
        if (isOpen) {
            setFilters(initialFilters);
        }
    }, [isOpen, initialFilters]);

    if (!isOpen) return null;

    const handleApply = () => {
        onApply(filters);
        onClose();
    };

    const handleClear = () => {
        const clearedFilters: FilterState = {
            category: null,
            minPrice: '',
            maxPrice: '',
            onlyPromotions: false
        };
        setFilters(clearedFilters);
        // We do not auto-apply clear here, wait for apply button
    };

    return (
        <div className="fixed inset-0 z-[100] flex flex-col justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
            {/* Modal Body */}
            <div className="bg-white rounded-t-[40px] w-full max-h-[90vh] overflow-hidden flex flex-col animate-in slide-in-from-bottom-[100%] duration-500">
                {/* Header */}
                <div className="flex items-center justify-between px-6 pl-8 py-5 border-b border-slate-100">
                    <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                        <SlidersHorizontal className="w-5 h-5 text-primary" />
                        Filtros
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 bg-slate-50 text-slate-500 rounded-full hover:bg-slate-100 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="px-6 py-6 pb-24 overflow-y-auto hide-scrollbar space-y-8 flex-1">

                    {/* Categories */}
                    <div className="space-y-3">
                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Categoría</h3>
                        <div className="flex flex-wrap gap-2">
                            {CATEGORIES.map((cat) => (
                                <button
                                    key={cat.id}
                                    onClick={() => setFilters(prev => ({ ...prev, category: prev.category === cat.name ? null : cat.name }))}
                                    className={`px-4 py-2.5 rounded-2xl text-sm font-bold transition-all border ${filters.category === cat.name
                                            ? 'bg-primary border-primary text-white shadow-md shadow-primary/20'
                                            : 'bg-white border-slate-200 text-slate-600 hover:border-primary/50'
                                        }`}
                                >
                                    {cat.shortName}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Price Range */}
                    <div className="space-y-3">
                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Rango de Precio ($)</h3>
                        <div className="flex items-center gap-4">
                            <div className="flex-1 relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                                <input
                                    type="number"
                                    placeholder="Mínimo"
                                    value={filters.minPrice}
                                    onChange={(e) => setFilters(prev => ({ ...prev, minPrice: e.target.value ? parseFloat(e.target.value) : '' }))}
                                    className="w-full bg-slate-50 border border-slate-200 p-4 pl-8 rounded-2xl outline-none focus:border-primary focus:bg-white font-bold text-slate-900 transition-colors"
                                />
                            </div>
                            <span className="text-slate-400 font-bold">-</span>
                            <div className="flex-1 relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                                <input
                                    type="number"
                                    placeholder="Máximo"
                                    value={filters.maxPrice}
                                    onChange={(e) => setFilters(prev => ({ ...prev, maxPrice: e.target.value ? parseFloat(e.target.value) : '' }))}
                                    className="w-full bg-slate-50 border border-slate-200 p-4 pl-8 rounded-2xl outline-none focus:border-primary focus:bg-white font-bold text-slate-900 transition-colors"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Promotions */}
                    <div className="space-y-3 pt-4 border-t border-slate-100">
                        <div
                            className="flex items-center justify-between cursor-pointer group"
                            onClick={() => setFilters(prev => ({ ...prev, onlyPromotions: !prev.onlyPromotions }))}
                        >
                            <div>
                                <h3 className="text-base font-black text-slate-900">Solo Promociones</h3>
                                <p className="text-xs text-slate-500 font-medium mt-0.5">Mostrar locales con ofertas activas</p>
                            </div>
                            <div className={`w-14 h-7 rounded-full relative transition-colors duration-300 ${filters.onlyPromotions ? 'bg-primary' : 'bg-slate-200'}`}>
                                <div className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow-md transition-all duration-300 ${filters.onlyPromotions ? 'left-8' : 'left-1'}`}></div>
                            </div>
                        </div>
                    </div>

                </div>

                {/* Footer fixed */}
                <div className="absolute bottom-0 left-0 w-full p-6 bg-white border-t border-slate-100 flex gap-3">
                    <button
                        onClick={handleClear}
                        className="flex-1 py-4 rounded-2xl font-black text-slate-500 bg-slate-100 hover:bg-slate-200 transition-colors flex justify-center items-center gap-2"
                    >
                        <Trash2 className="w-5 h-5" />
                        Limpiar
                    </button>
                    <button
                        onClick={handleApply}
                        className="flex-[2] py-4 rounded-2xl font-black text-white bg-primary hover:bg-orange-600 transition-colors shadow-lg shadow-orange-500/30"
                    >
                        Aplicar Filtros
                    </button>
                </div>
            </div>
        </div>
    );
}
