import React, { useEffect, useState } from 'react';
import { UN2X3_LOGO } from '../lib/env';

interface SplashScreenProps {
  onComplete: () => void;
  isAuthLoading: boolean;
}

export default function SplashScreen({ onComplete, isAuthLoading }: SplashScreenProps) {
  const [timerDone, setTimerDone] = useState(false);
  const [isFadingOut, setIsFadingOut] = useState(false);

  useEffect(() => {
    // Branding time: 2.5 seconds minimum
    const timer = setTimeout(() => {
      setTimerDone(true);
    }, 2500);

    return () => clearTimeout(timer);
  }, []);

  // Sync completion with Auth and Timer
  useEffect(() => {
    if (timerDone && !isAuthLoading) {
      setIsFadingOut(true);
      const fadeTimer = setTimeout(() => {
        onComplete();
      }, 500);
      return () => clearTimeout(fadeTimer);
    }
  }, [timerDone, isAuthLoading, onComplete]);

  return (
    <div 
      className={`fixed inset-0 z-[9999] flex items-center justify-center bg-white transition-opacity duration-500 ${isFadingOut ? 'opacity-0' : 'opacity-100'}`}
    >
      <div className="relative flex flex-col items-center">
        {/* Subtle Background Pulse with pure CSS */}
        <div className="absolute inset-0 w-48 h-48 bg-white/30 rounded-full blur-3xl animate-pulse" />
        
        {/* Logo Container with CSS animation from index.css */}
        <div className="relative w-64 h-64 flex items-center justify-center p-6 animate-scale-in">
          <img 
            src={UN2X3_LOGO} 
            alt="Arepa Express Official Logo" 
            className="w-full h-full object-contain filter drop-shadow-xl"
          />
        </div>

        {/* System Loading Indicator */}
        {(isAuthLoading) && (
          <div className="mt-8 flex flex-col items-center gap-2">
            <div className="w-8 h-8 border-4 border-black/10 border-t-black rounded-full animate-spin" />
            <p className="text-black/60 text-[10px] font-black uppercase tracking-[0.2em] animate-pulse">
                Sincronizando Sistema...
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
