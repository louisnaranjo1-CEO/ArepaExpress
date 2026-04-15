import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface SplashScreenProps {
  onComplete: () => void;
  isAuthLoading: boolean;
}

export default function SplashScreen({ onComplete, isAuthLoading }: SplashScreenProps) {
  const [timerDone, setTimerDone] = useState(false);

  useEffect(() => {
    // Garantizar al menos 2.5 segundos de Branding
    const timer = setTimeout(() => {
      setTimerDone(true);
    }, 2500);

    return () => clearTimeout(timer);
  }, []);

  // Solo completar cuando se pase el tiempo MINIMO y la autenticación esté lista
  useEffect(() => {
    if (timerDone && !isAuthLoading) {
      onComplete();
    }
  }, [timerDone, isAuthLoading, onComplete]);

  return (
    <motion.div 
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#FFFF00]"
    >
      <div className="relative flex flex-col items-center">
        {/* Animated circle pulse behind logo */}
        <motion.div 
          animate={{ 
            scale: [1, 1.2, 1],
            opacity: [0.2, 0.4, 0.2]
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="absolute inset-0 w-48 h-48 bg-white/20 rounded-full blur-2xl" 
        />
        
        {/* Logo Container */}
        <motion.div 
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="relative w-64 h-64 flex items-center justify-center p-6"
        >
          <img 
            src="https://firebasestorage.googleapis.com/v0/b/arepa-express-ve-2026.firebasestorage.app/o/logo%20principal.png?alt=media&token=c1438ea3-f244-4bc9-9e94-cd67d0b252d4" 
            alt="Arepa Express Official Logo" 
            className="w-full h-full object-contain filter drop-shadow-xl"
          />
        </motion.div>

        {/* Loading Indicator */}
        {(isAuthLoading) && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-8 flex flex-col items-center gap-2"
          >
            <div className="w-8 h-8 border-4 border-black/10 border-t-black rounded-full animate-spin" />
            <p className="text-black/40 text-[10px] font-black uppercase tracking-[0.2em]">Cargando Sistema...</p>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
