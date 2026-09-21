import React from 'react';
import { MapPinOff, Navigation, RefreshCw, AlertTriangle, ShieldCheck } from 'lucide-react';
import { UN2X3_LOGO } from '../lib/env';

interface GPSLockScreenProps {
  isChecking: boolean;
  errorMessage?: string;
  onRetry: () => void;
}

export default function GPSLockScreen({ isChecking, errorMessage, onRetry }: GPSLockScreenProps) {
  return (
    <div className="fixed inset-0 z-[9999] bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-5 select-none animate-in fade-in duration-300">
      <div className="w-full max-w-sm bg-slate-900 border border-amber-500/30 rounded-[2.5rem] p-7 shadow-2xl flex flex-col items-center text-center relative overflow-hidden">
        {/* Amber glow background */}
        <div className="absolute top-0 inset-x-0 h-32 bg-gradient-to-b from-amber-500/15 via-transparent to-transparent pointer-events-none"></div>

        {/* Brand logo */}
        <img
          src={UN2X3_LOGO}
          alt="Un 2x3"
          className="h-9 w-auto object-contain mb-6 opacity-90 drop-shadow-[0_0_12px_rgba(245,158,11,0.3)]"
        />

        {/* GPS Off Graphic Icon */}
        <div className="relative mb-6">
          <div className="w-20 h-20 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center shadow-inner relative">
            <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-amber-500 to-yellow-400 flex items-center justify-center text-slate-950 shadow-lg shadow-amber-500/30 animate-pulse">
              <MapPinOff className="w-7 h-7" strokeWidth={2.5} />
            </div>
          </div>
          <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-rose-500 border-2 border-slate-900 flex items-center justify-center text-white">
            <AlertTriangle className="w-3.5 h-3.5" />
          </div>
        </div>

        {/* Text Details */}
        <h2 className="text-xl font-black text-white tracking-tight leading-snug mb-2">
          Ubicación GPS Obligatoria
        </h2>
        
        <p className="text-xs text-slate-400 font-medium leading-relaxed mb-4 px-2">
          Para garantizar tarifas reales de viaje y mostrarte las tiendas activas en tu zona, la aplicación requiere el GPS encendido de tu teléfono.
        </p>

        {errorMessage && (
          <div className="w-full bg-rose-500/10 border border-rose-500/30 rounded-2xl p-3 mb-5 text-left flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-rose-200 font-semibold leading-tight">
              {errorMessage}
            </p>
          </div>
        )}

        {/* Steps info */}
        <div className="w-full bg-slate-800/60 border border-slate-700/50 rounded-2xl p-3.5 mb-6 text-left space-y-2 text-[11px] text-slate-300">
          <div className="flex items-center gap-2 font-bold text-amber-400 text-xs">
            <ShieldCheck className="w-4 h-4" />
            <span>¿Cómo activarlo?</span>
          </div>
          <p className="leading-snug text-slate-400">
            1. Desliza la barra de notificaciones y activa la <strong>Ubicación / GPS</strong>.
          </p>
          <p className="leading-snug text-slate-400">
            2. Permite el acceso cuando la app te lo solicite.
          </p>
        </div>

        {/* Button to retry / activate */}
        <button
          onClick={onRetry}
          disabled={isChecking}
          className="w-full py-4 px-6 bg-gradient-to-r from-amber-400 to-yellow-400 hover:from-amber-500 hover:to-yellow-500 text-slate-950 font-black text-sm uppercase tracking-wider rounded-2xl shadow-xl shadow-amber-400/20 active:scale-95 transition-all flex items-center justify-center gap-2.5 disabled:opacity-50"
        >
          {isChecking ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
              <span>Detectando GPS...</span>
            </>
          ) : (
            <>
              <Navigation className="w-4 h-4 text-slate-950 fill-slate-950" />
              <span>Activar GPS / Reintentar</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
