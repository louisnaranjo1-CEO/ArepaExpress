import React, { useState, useEffect } from 'react';
import { Clock, AlertTriangle } from 'lucide-react';
import { motion } from 'motion/react';

interface ServiceTimerProps {
  startTime: any; // Firebase Timestamp or Date
  mode: 'countdown' | 'stopwatch';
  onTimeUpdate?: (seconds: number) => void;
  compact?: boolean;
}

export default function ServiceTimer({ startTime, mode, onTimeUpdate, compact = false }: ServiceTimerProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!startTime) return;

    // Handle both Firebase Timestamp and Date objects
    const start = startTime.toDate ? startTime.toDate().getTime() : new Date(startTime).getTime();
    
    // Initial sync
    const sync = () => {
      const now = Date.now();
      const diff = Math.floor((now - start) / 1000);
      setElapsedSeconds(diff);
      if (onTimeUpdate) onTimeUpdate(diff);
    };
    
    sync();

    const interval = setInterval(sync, 1000);

    return () => clearInterval(interval);
  }, [startTime, onTimeUpdate]);

  const formatTime = (totalSeconds: number) => {
    const isNegative = totalSeconds < 0;
    const absSeconds = Math.abs(totalSeconds);
    const mins = Math.floor(absSeconds / 60);
    const secs = absSeconds % 60;
    return `${isNegative ? '-' : ''}${mins}:${secs.toString().padStart(2, '0')}`;
  };

  let displaySeconds = elapsedSeconds;
  let isLate = false;

  if (mode === 'countdown') {
    const countdownTarget = 15 * 60; // 15 minutes
    displaySeconds = countdownTarget - elapsedSeconds;
    isLate = displaySeconds < 0;
  } else {
    isLate = elapsedSeconds > 60;
  }

  if (compact) {
    return (
      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all duration-300 shadow-sm ${
        isLate 
          ? 'bg-rose-50 border-rose-300 text-rose-700' 
          : 'bg-slate-950 border-slate-800 text-white'
      }`}>
        {isLate ? (
          <AlertTriangle className="w-4 h-4 text-rose-600 animate-bounce shrink-0" />
        ) : (
          <Clock className="w-4 h-4 text-amber-400 animate-pulse shrink-0" />
        )}
        <div className="flex flex-col text-right">
          <span className={`text-[8px] font-black uppercase tracking-wider leading-none ${isLate ? 'text-rose-600' : 'text-amber-400/90'}`}>
            {mode === 'countdown' ? (isLate ? 'TIEMPO EXCEDIDO' : 'TIEMPO PARA LLEGAR') : 'DURACIÓN'}
          </span>
          <span className={`text-sm font-black tabular-nums tracking-tight mt-0.5 leading-none ${isLate ? 'text-rose-700' : 'text-white'}`}>
            {formatTime(displaySeconds)}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center justify-center p-6 rounded-3xl border-2 transition-all duration-500 ${
      isLate 
        ? 'bg-red-500/10 border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.3)]' 
        : 'bg-yellow-500/10 border-yellow-500 shadow-[0_0_20px_rgba(234,179,8,0.2)]'
    }`}>
      <div className="flex items-center gap-3 mb-2">
        {isLate ? (
          <motion.div
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
          >
            <AlertTriangle className="w-6 h-6 text-red-500" />
          </motion.div>
        ) : (
          <Clock className="w-6 h-6 text-yellow-500 animate-pulse" />
        )}
        <span className={`text-sm font-bold uppercase tracking-wider ${isLate ? 'text-red-500' : 'text-yellow-500'}`}>
          {mode === 'countdown' ? (isLate ? 'TIEMPO EXCEDIDO' : 'TIEMPO PARA LLEGAR') : 'DURACIÓN DEL SERVICIO'}
        </span>
      </div>
      
      <div className={`text-6xl font-black tabular-nums tracking-tighter ${isLate ? 'text-red-600' : 'text-slate-900'}`}>
        {formatTime(displaySeconds)}
      </div>

      {isLate && (
        <motion.p 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-red-400 text-xs mt-2 font-medium"
        >
          ¡Llega lo antes posible! El cliente tiene prioridad.
        </motion.p>
      )}
    </div>
  );
}
