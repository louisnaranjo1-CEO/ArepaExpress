import React, { useState, useEffect, useMemo } from 'react';
import { X, SlidersHorizontal, Trash2, ArrowLeft } from 'lucide-react';
import { Category } from '../pages/Search';

export interface FilterState {
    category: string | null;
    sector: string | null;
    minPrice: number | '';
    maxPrice: number | '';
    onlyPromotions: boolean;
}

interface FilterModalProps {
    isOpen: boolean;
    onClose: () => void;
    onApply: (filters: FilterState) => void;
    initialFilters: FilterState;
    categories: Category[];
}

export default function FilterModal({ isOpen, onClose, onApply, initialFilters, categories }: FilterModalProps) {
    const [filters, setFilters] = useState<FilterState>(initialFilters);
    const [view, setView] = useState<'sectors' | 'subcategories'>('sectors');

    useEffect(() => {
        if (isOpen) {
            setFilters(initialFilters);
            // If a sector is already selected, maybe start in subcategories view?
            // Actually, let's start in sectors view unless they want to specifically pick subcats
            setView(initialFilters.sector ? 'subcategories' : 'sectors');
        }
    }, [isOpen, initialFilters]);

    const sectors = useMemo(() => categories.filter(c => !c.parentId), [categories]);
    const subCategories = useMemo(() =>
        filters.sector ? categories.filter(c => c.parentId === filters.sector) : [],
        [categories, filters.sector]);

    if (!isOpen) return null;

    const handleApply = () => {
        onApply(filters);
        onClose();
    };

    const handleClear = () => {
        const clearedFilters: FilterState = {
            category: null,
            sector: null,
            minPrice: '',
            maxPrice: '',
            onlyPromotions: false
        };
        setFilters(clearedFilters);
        setView('sectors');
    };

    const handleSectorClick = (sectorId: string) => {
        if (filters.sector === sectorId) {
            setFilters(prev => ({ ...prev, sector: null, category: null }));
        } else {
            setFilters(prev => ({ ...prev, sector: sectorId, category: null }));
            setView('subcategories');
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex flex-col justify-end md:justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300 md:p-4">
            {/* Modal Body */}
            <div className="bg-white rounded-t-[40px] md:rounded-3xl w-full max-w-md mx-auto max-h-[90vh] overflow-hidden flex flex-col relative animate-in slide-in-from-bottom-[100%] md:slide-in-from-bottom-10 duration-500 shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between px-6 pl-8 py-5 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                        {view === 'subcategories' && filters.sector && (
                            <button
                                onClick={() => setView('sectors')}
                                className="p-2 hover:bg-slate-50 rounded-full transition-colors -ml-2"
                            >
                                <ArrowLeft className="w-5 h-5 text-slate-500" />
                            </button>
                        )}
                        <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                            <SlidersHorizontal className="w-5 h-5 text-slate-900" />
                            Filtros
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 bg-slate-50 text-slate-500 rounded-full hover:bg-slate-100 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="px-6 py-6 pb-24 overflow-y-auto hide-scrollbar space-y-8 flex-1">

                    {/* Categories / Sectors */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">
                                {view === 'sectors' ? 'Sector de Negocio' : 'Subcategoría'}
                            </h3>
                            {filters.sector && view === 'sectors' && (
                                <button
                                    onClick={() => setView('subcategories')}
                                    className="text-[10px] font-black text-slate-900 uppercase tracking-widest"
                                >
                                    Ver Subcategorías
                                </button>
                            )}
                        </div>

                        {view === 'sectors' ? (
                            <div className="flex flex-wrap gap-2">
                                {sectors.map((cat) => (
                                    <button
                                        key={cat.id}
                                        onClick={() => handleSectorClick(cat.id)}
                                        className={`px-4 py-2.5 rounded-2xl text-sm font-bold transition-all border ${filters.sector === cat.id
                                            ? 'bg-primary border-primary text-slate-900 shadow-md shadow-primary/20'
                                            : 'bg-white border-slate-200 text-slate-600 hover:border-primary/50'
                                            }`}
                                    >
                                        {cat.name}
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div className="flex flex-wrap gap-2">
                                {subCategories.length > 0 ? (
                                    subCategories.map((cat) => (
                                        <button
                                            key={cat.id}
                                            onClick={() => setFilters(prev => ({ ...prev, category: prev.category === cat.name ? null : cat.name }))}
                                            className={`px-4 py-2.5 rounded-2xl text-sm font-bold transition-all border ${filters.category === cat.name
                                                ? 'bg-primary border-primary text-slate-900 shadow-md shadow-primary/20'
                                                : 'bg-white border-slate-200 text-slate-600 hover:border-primary/50'
                                                }`}
                                        >
                                            {cat.name}
                                        </button>
                                    ))
                                ) : (
                                    <p className="text-sm text-slate-400 font-medium italic">No hay subcategorías en este sector.</p>
                                )}
                            </div>
                        )}
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
                <div className="sticky bottom-0 left-0 w-full p-6 bg-white border-t border-slate-100 flex gap-3 z-10">
                    <button
                        onClick={handleClear}
                        className="flex-1 py-4 rounded-2xl font-black text-slate-500 bg-slate-100 hover:bg-slate-200 transition-colors flex justify-center items-center gap-2"
                    >
                        <Trash2 className="w-5 h-5" />
                        Limpiar
                    </button>
                    <button
                        onClick={handleApply}
                        className="flex-[2] py-4 rounded-2xl font-black text-slate-900 bg-primary hover:bg-orange-600 transition-colors shadow-lg shadow-orange-500/30"
                    >
                        Aplicar Filtros
                    </button>
                </div>
            </div>
        </div>
    );
}
