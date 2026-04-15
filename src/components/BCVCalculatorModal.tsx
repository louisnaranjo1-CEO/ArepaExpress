import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ArrowRightLeft, DollarSign } from 'lucide-react';
import { vibrate } from '../utils/haptics';

interface BCVCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  bcvRate: number;
}

export default function BCVCalculatorModal({ isOpen, onClose, bcvRate }: BCVCalculatorModalProps) {
  const [usdAmount, setUsdAmount] = useState<string>('1');
  const [bsAmount, setBsAmount] = useState<string>('');
  const [isUsdToBs, setIsUsdToBs] = useState(true);

  // Initial calculation
  useEffect(() => {
    if (bcvRate > 0 && isOpen) {
      if (isUsdToBs) {
        setBsAmount((Number(usdAmount) * bcvRate).toFixed(2));
      } else {
        setUsdAmount((Number(bsAmount) / bcvRate).toFixed(2));
      }
    }
  }, [isOpen, bcvRate]);

  const handleUsdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setUsdAmount(val);
    setIsUsdToBs(true);
    if (val === '') {
      setBsAmount('');
    } else {
      setBsAmount((Number(val) * bcvRate).toFixed(2));
    }
  };

  const handleBsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setBsAmount(val);
    setIsUsdToBs(false);
    if (val === '') {
      setUsdAmount('');
    } else {
      setUsdAmount((Number(val) / bcvRate).toFixed(2));
    }
  };

  const handleSwap = () => {
    vibrate(20);
    setIsUsdToBs(!isUsdToBs);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-md bg-white rounded-[32px] p-6 shadow-2xl overflow-hidden"
          >
            <div className="absolute top-0 left-0 right-0 h-32 bg-primary/10 rounded-t-[32px] z-0" />
            
            <button
              onClick={onClose}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center bg-white rounded-full text-slate-500 hover:bg-slate-100 transition-colors z-20 shadow-sm"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="relative z-10 flex flex-col items-center mb-6 pt-4">
              <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20 mb-4 border border-primary/20">
                <DollarSign className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-2xl font-black text-slate-900 text-center leading-tight">Calculadora BCV</h2>
              <p className="text-sm font-bold text-slate-600 mt-2 bg-slate-100 px-3 py-1 rounded-full">
                Tasa Referencial: {bcvRate.toFixed(2)} Bs
              </p>
            </div>

            <div className="relative z-10 bg-slate-50 rounded-2xl p-4 border border-slate-100 mb-6">
              <div className={`transition-all duration-300 ${!isUsdToBs ? 'order-last mt-4' : 'mb-4'}`}>
                <label className="block text-[11px] font-black uppercase tracking-widest text-slate-500 mb-2">
                  Dólares (USD)
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium">$</span>
                  <input
                    type="number"
                    value={usdAmount}
                    onChange={handleUsdChange}
                    className="w-full bg-white border-2 border-slate-200 rounded-xl py-3 pl-10 pr-4 font-bold text-slate-900 focus:border-primary focus:outline-none transition-colors"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div className="flex items-center justify-center my-[-10px] relative z-20">
                <button
                  onClick={handleSwap}
                  className="w-10 h-10 bg-primary/10 hover:bg-primary/20 text-primary rounded-full flex items-center justify-center transition-colors active:scale-95"
                >
                  <ArrowRightLeft className="w-4 h-4" />
                </button>
              </div>

              <div className={`transition-all duration-300 ${!isUsdToBs ? 'mb-4' : 'mt-4'}`}>
                <label className="block text-[11px] font-black uppercase tracking-widest text-slate-500 mb-2">
                  Bolívares (Bs)
                </label>
                <div className="relative">
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium">Bs</span>
                  <input
                    type="number"
                    value={bsAmount}
                    onChange={handleBsChange}
                    className="w-full bg-white border-2 border-slate-200 rounded-xl py-3 pl-4 pr-12 font-bold text-slate-900 focus:border-primary focus:outline-none transition-colors"
                    placeholder="0.00"
                  />
                </div>
              </div>
            </div>

            <div className="relative z-10 bg-emerald-50 border border-emerald-100 rounded-2xl p-4">
              <p className="text-xs font-bold text-emerald-800 text-center leading-relaxed">
                "Todos precios en esta plataforma son cobrados por sus proveedor a tasa del BCV en 'Un 2x3'."
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
