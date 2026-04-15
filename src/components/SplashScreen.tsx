import React, { useEffect, useState } from 'react';

interface SplashScreenProps {
  onComplete: () => void;
}

export default function SplashScreen({ onComplete }: SplashScreenProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [isFadingOut, setIsFadingOut] = useState(false);

  useEffect(() => {
    // Show splash for 2.5 seconds, then start fade out
    const timer = setTimeout(() => {
      setIsFadingOut(true);
      // Wait for fade out animation to finish
      setTimeout(() => {
        setIsVisible(false);
        onComplete();
      }, 500); // Duration of the fade-out animation
    }, 2500);

    return () => clearTimeout(timer);
  }, [onComplete]);

  if (!isVisible) return null;

  return (
    <div 
      className={`fixed inset-0 z-[9999] flex items-center justify-center bg-[#FFFF00] transition-opacity duration-500 ease-in-out ${
        isFadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      <div className="relative flex flex-col items-center">
        {/* Animated circle pulse behind logo */}
        <div className="absolute inset-0 w-48 h-48 bg-white/20 rounded-full blur-2xl animate-pulse scale-150" />
        
        {/* Logo Container */}
        <div className="relative w-64 h-64 flex items-center justify-center p-6 animate-scale-in">
          <img 
            src="https://firebasestorage.googleapis.com/v0/b/arepa-express-ve-2026.firebasestorage.app/o/logo%20principal.png?alt=media&token=c1438ea3-f244-4bc9-9e94-cd67d0b252d4" 
            alt="Arepa Express Official Logo" 
            className="w-full h-full object-contain filter drop-shadow-xl"
          />
        </div>
      </div>

      <style>{`
        @keyframes loading {
          0% { width: 0%; }
          100% { width: 100%; }
        }
      `}</style>
    </div>
  );
}
