import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { UN2X3_LOGO } from '../lib/env';
import { useBranding } from '../context/BrandingContext';

export interface SplashScreenProps {
  onComplete?: () => void;
  onFinish?: () => void;
  isAuthLoading?: boolean;
}

export default function SplashScreen({ onComplete, onFinish, isAuthLoading = false }: SplashScreenProps) {
  const { branding } = useBranding();
  const [timerDone, setTimerDone] = useState(false);
  const [isFadingOut, setIsFadingOut] = useState(false);

  // Cache instantáneo de localStorage para carga en 0ms y evitar parpadeo blanco
  const cached = useMemo(() => {
    try {
      const raw = localStorage.getItem('un2x3_app_branding_cache');
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return null;
  }, []);

  const activeBg = branding.splash_bg_color || cached?.splash_bg_color || '#FFD100';
  const activeAnim = branding.splash_animation || cached?.splash_animation || 'snap-pulse';
  const activeTagline = branding.splash_tagline ?? cached?.splash_tagline ?? '¡En un 2x3 lo tienes!';
  const activeDuration = branding.splash_duration_ms 
    ? Number(branding.splash_duration_ms) 
    : (cached?.splash_duration_ms ? Number(cached.splash_duration_ms) : 1250);

  const splashLogo = branding.splash_screen_logo || cached?.splash_screen_logo || branding.app_client_logo || cached?.app_client_logo || UN2X3_LOGO;

  const isDark = activeBg === '#0F172A' || activeBg === '#000000';
  const textColor = branding.splash_text_color || cached?.splash_text_color || (isDark ? '#FFFFFF' : '#0F172A');

  const handleFinish = useCallback(() => {
    setIsFadingOut(true);
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(15);
      }
    } catch (e) {}
    const fadeTimer = setTimeout(() => {
      if (onFinish) onFinish();
      if (onComplete) onComplete();
    }, 400);
    return () => clearTimeout(fadeTimer);
  }, [onFinish, onComplete]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setTimerDone(true);
    }, activeDuration);

    // Failsafe de seguridad absoluto: el splash NUNCA bloqueará al usuario
    const failsafe = setTimeout(() => {
      handleFinish();
    }, Math.max(activeDuration + 1200, 3200));

    return () => {
      clearTimeout(timer);
      clearTimeout(failsafe);
    };
  }, [activeDuration, handleFinish]);

  // Salida fluida con scale(1.08) + opacity 0 e impacto háptico ligero
  useEffect(() => {
    if (timerDone && !isAuthLoading) {
      handleFinish();
    }
  }, [timerDone, isAuthLoading, handleFinish]);

  return (
    <div 
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center p-6 select-none overflow-hidden"
      style={{ 
        backgroundColor: activeBg,
        transform: isFadingOut ? 'scale(1.08)' : 'scale(1)',
        opacity: isFadingOut ? 0 : 1,
        transition: 'opacity 400ms cubic-bezier(0.4, 0, 0.2, 1), transform 400ms cubic-bezier(0.4, 0, 0.2, 1)',
        pointerEvents: isFadingOut ? 'none' : 'auto'
      }}
    >
      <style>{`
        @keyframes splash-anim-snap-pulse {
          0% { transform: scale(0.65); opacity: 0; filter: brightness(1.2); }
          45% { transform: scale(1.06); opacity: 1; filter: brightness(1.05); }
          70% { transform: scale(0.97); opacity: 1; }
          100% { transform: scale(1); opacity: 1; filter: brightness(1); }
        }
        @keyframes splash-anim-speed-zoom {
          0% { transform: scale(0.25) translateY(30px); opacity: 0; filter: blur(12px); }
          60% { transform: scale(1.04) translateY(-4px); opacity: 1; filter: blur(0px); }
          85% { transform: scale(0.98) translateY(0); opacity: 1; }
          100% { transform: scale(1) translateY(0); opacity: 1; filter: blur(0px); }
        }
        @keyframes splash-anim-minimal-fade {
          0% { opacity: 0; transform: scale(0.94); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes splash-anim-tagline {
          0% { opacity: 0; transform: translateY(10px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className="relative flex flex-col items-center justify-center max-w-sm w-full">
        {/* Halo resplandeciente sutil */}
        <div 
          className="absolute inset-0 w-64 h-64 mx-auto rounded-full blur-3xl opacity-30 animate-pulse pointer-events-none" 
          style={{ backgroundColor: isDark ? 'rgba(255, 209, 0, 0.2)' : 'rgba(255, 255, 255, 0.6)' }}
        />
        
        {/* Contenedor del Logo con la animación seleccionada */}
        <div 
          className="relative w-64 h-56 flex items-center justify-center p-4"
          style={{
            animation: activeAnim === 'speed-zoom'
              ? 'splash-anim-speed-zoom 1.1s cubic-bezier(0.16, 1, 0.3, 1) forwards'
              : activeAnim === 'minimal-fade'
              ? 'splash-anim-minimal-fade 1.1s ease-out forwards'
              : 'splash-anim-snap-pulse 1.1s cubic-bezier(0.34, 1.56, 0.64, 1) forwards'
          }}
        >
          <img 
            src={splashLogo} 
            alt={branding.app_client_name || "Un 2x3"} 
            className="max-h-full max-w-full object-contain filter drop-shadow-2xl"
          />
        </div>

        {/* Frase corta inferior (splash_tagline) */}
        {activeTagline && (
          <p 
            className="mt-3 text-sm md:text-base font-black tracking-tight text-center px-4"
            style={{ 
              color: textColor,
              animation: 'splash-anim-tagline 0.8s ease-out 0.25s both'
            }}
          >
            {activeTagline}
          </p>
        )}

        {/* Indicador de sincronización si la autenticación sigue cargando */}
        {isAuthLoading && (
          <div className="mt-8 flex flex-col items-center gap-2 animate-fade-in">
            <div 
              className="w-7 h-7 border-3 rounded-full animate-spin" 
              style={{ 
                borderColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(15,23,42,0.15)',
                borderTopColor: textColor 
              }}
            />
            <p 
              className="text-[10px] font-black uppercase tracking-[0.2em] animate-pulse"
              style={{ color: isDark ? 'rgba(255,255,255,0.7)' : 'rgba(15,23,42,0.6)' }}
            >
              Sincronizando Sistema...
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
