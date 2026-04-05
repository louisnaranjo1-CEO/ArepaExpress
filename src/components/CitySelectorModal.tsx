import React, { useState, useEffect } from 'react';
import { X, MapPin } from 'lucide-react';
import { VENEZUELA_DATA, VENEZUELA_STATES } from '../lib/venezuelaData';

interface CitySelectorModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (state: string, city: string) => void;
    initialState: string;
    initialCity: string;
}

export default function CitySelectorModal({ isOpen, onClose, onSelect, initialState, initialCity }: CitySelectorModalProps) {
    const [selectedState, setSelectedState] = useState(initialState);
    const [selectedCity, setSelectedCity] = useState(initialCity);

    useEffect(() => {
        if (isOpen) {
            setSelectedState(initialState);
            setSelectedCity(initialCity);
        }
    }, [isOpen, initialState, initialCity]);

    if (!isOpen) return null;

    const handleApply = () => {
        if (selectedState && selectedCity) {
            onSelect(selectedState, selectedCity);
            onClose();
        }
    };

    return (
        <div className="absolute inset-0 z-[100] flex flex-col justify-end md:justify-center p-0 md:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-white rounded-t-[40px] md:rounded-2xl w-full max-w-md mx-auto max-h-[90vh] md:max-h-[85vh] overflow-hidden flex flex-col animate-in slide-in-from-bottom-[100%] duration-500 relative">
                {/* Header */}
                <div className="flex items-center justify-between px-6 pl-8 py-5 border-b border-slate-100">
                    <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                        <MapPin className="w-5 h-5 text-slate-900" />
                        Selecciona tu ciudad
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 bg-slate-50 text-slate-500 rounded-full hover:bg-slate-100 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="px-6 py-6 pb-24 overflow-y-auto hide-scrollbar space-y-6 flex-1">
                    <div className="space-y-4">
                        <div className="space-y-1">
                            <label className="text-sm font-black text-slate-900 uppercase tracking-widest ml-1">Estado</label>
                            <select
                                value={selectedState}
                                onChange={(e) => {
                                    const newState = e.target.value;
                                    setSelectedState(newState);
                                    if (VENEZUELA_DATA[newState] && VENEZUELA_DATA[newState].length > 0) {
                                        setSelectedCity(VENEZUELA_DATA[newState][0]);
                                    } else {
                                        setSelectedCity('');
                                    }
                                }}
                                className="w-full bg-slate-50 border border-slate-200 p-4 rounded-2xl outline-none focus:border-primary focus:bg-white font-bold text-slate-700 text-sm transition-colors"
                            >
                                <option value="">Selecciona un Estado</option>
                                {VENEZUELA_STATES.map(s => (
                                    <option key={s} value={s}>{s}</option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-1">
                            <label className="text-sm font-black text-slate-900 uppercase tracking-widest ml-1">Ciudad</label>
                            <select
                                value={selectedCity}
                                onChange={(e) => setSelectedCity(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 p-4 rounded-2xl outline-none focus:border-primary focus:bg-white font-bold text-slate-700 text-sm transition-colors"
                                disabled={!selectedState}
                            >
                                <option value="">Selecciona una Ciudad</option>
                                {selectedState && VENEZUELA_DATA[selectedState]?.map(c => (
                                    <option key={c} value={c}>{c}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                {/* Footer fixed */}
                <div className="absolute bottom-0 left-0 w-full p-6 bg-white border-t border-slate-100 flex gap-3">
                    <button
                        onClick={handleApply}
                        disabled={!selectedState || !selectedCity}
                        className="w-full py-4 rounded-2xl font-black text-slate-900 bg-primary hover:bg-orange-600 transition-colors shadow-lg shadow-orange-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Confirmar Ubicación
                    </button>
                </div>
            </div>
        </div>
    );
}
