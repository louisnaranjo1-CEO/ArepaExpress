import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ExternalLink, ShieldCheck } from 'lucide-react';

interface DemoAlertModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const DemoAlertModal: React.FC<DemoAlertModalProps> = ({ isOpen, onClose }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
          />
          
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative w-full max-w-sm bg-white rounded-[40px] p-8 shadow-2xl overflow-hidden border border-slate-100"
          >
            {/* Background Accent */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full -mr-16 -mt-16 blur-3xl text-primary" />
            
            <div className="flex flex-col items-center text-center">
              {/* Circular Logo Container */}
              <div className="w-24 h-24 rounded-full bg-slate-50 p-1 shadow-inner border border-slate-100 mb-6 relative group">
                <div className="absolute inset-0 rounded-full border-4 border-primary/20 animate-pulse group-hover:border-primary/40 transition-colors" />
                <img 
                  src="https://firebasestorage.googleapis.com/v0/b/arepa-express-ve-2026.firebasestorage.app/o/logos%20un%202x3.jpg?alt=media" 
                  alt="Un 2x3"
                  className="w-full h-full rounded-full object-cover transition-transform duration-700 group-hover:scale-110"
                />
              </div>
              
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-50 text-amber-600 rounded-full mb-4 border border-amber-100">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span className="text-[10px] font-black uppercase tracking-wider">Modo Demostración</span>
              </div>
              
              <h3 className="text-2xl font-black text-slate-900 mb-4 leading-tight">
                Versión Demo
              </h3>
              
              <p className="text-slate-500 font-bold text-sm leading-relaxed mb-8">
                Estas en la version demo, accede a la aplicacion oficial para abrir sesion o registrarte.
              </p>
              
              <div className="w-full space-y-3">
                <button
                  onClick={() => window.open('https://app.deliexpress.app', '_blank')}
                  className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 shadow-xl shadow-slate-900/20 active:scale-95 transition-all group"
                >
                  <ExternalLink className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                  Ir a la App Oficial
                </button>
                
                <button
                  onClick={onClose}
                  className="w-full bg-slate-50 text-slate-500 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] active:scale-95 transition-all hover:bg-slate-100"
                >
                  Seguir Explorando
                </button>
              </div>
            </div>
            
            <button 
              onClick={onClose}
              className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default DemoAlertModal;
