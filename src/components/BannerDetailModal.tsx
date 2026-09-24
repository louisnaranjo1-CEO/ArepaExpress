import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Sparkles, CheckCircle2 } from 'lucide-react';

export interface BannerDetailModalProps {
  banner: {
    id?: string;
    title?: string;
    explanation?: string;
    subtitle?: string;
    imageUrl?: string;
    image_url?: string;
  } | null;
  onClose: () => void;
}

export default function BannerDetailModal({ banner, onClose }: BannerDetailModalProps) {
  if (!banner) return null;

  const imageUrl = banner.imageUrl || banner.image_url;
  const title = banner.title || 'Detalles de la Promoción';
  const description = banner.explanation || banner.subtitle || '';

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        />

        {/* Modal Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative w-full max-w-lg bg-white rounded-[2.5rem] shadow-2xl overflow-hidden z-10 max-h-[90vh] flex flex-col border border-slate-100"
        >
          {/* Header Image Area */}
          <div className="relative w-full aspect-[2/1] bg-slate-100 shrink-0 overflow-hidden">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-amber-50">
                <Sparkles className="w-12 h-12 text-primary" />
              </div>
            )}

            {/* Close Button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 w-10 h-10 bg-black/40 hover:bg-black/60 text-white rounded-full flex items-center justify-center backdrop-blur-md transition-all active:scale-95"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content Area */}
          <div className="p-6 md:p-8 overflow-y-auto space-y-4 flex-1">
            <div>
              <div className="flex items-center gap-2 text-primary font-black text-xs uppercase tracking-wider mb-1">
                <Sparkles className="w-4 h-4" />
                Información Oficial
              </div>
              <h2 className="text-2xl font-black text-slate-900 leading-tight">
                {title}
              </h2>
            </div>

            {description ? (
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 text-slate-700 text-sm leading-relaxed whitespace-pre-line font-medium">
                {description}
              </div>
            ) : (
              <p className="text-slate-500 text-sm italic">
                No hay detalles adicionales especificados para esta promoción.
              </p>
            )}

            <div className="pt-2">
              <button
                type="button"
                onClick={onClose}
                className="w-full py-4 bg-primary hover:bg-amber-400 text-slate-900 font-black rounded-2xl shadow-lg shadow-primary/20 flex items-center justify-center gap-2 transition-all active:scale-98"
              >
                <CheckCircle2 className="w-5 h-5" />
                Entendido
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
