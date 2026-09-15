import React, { useEffect, useRef } from 'react';

interface RainOverlayProps {
    isActive: boolean;
    intensity?: 'light' | 'moderate' | 'heavy';
}

export default function RainOverlay({ isActive, intensity = 'moderate' }: RainOverlayProps) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
        if (!isActive) return;
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationFrameId: number;
        let width = (canvas.width = canvas.parentElement?.clientWidth || window.innerWidth);
        let height = (canvas.height = canvas.parentElement?.clientHeight || window.innerHeight);

        const handleResize = () => {
            if (!canvas) return;
            width = canvas.width = canvas.parentElement?.clientWidth || window.innerWidth;
            height = canvas.height = canvas.parentElement?.clientHeight || window.innerHeight;
        };

        window.addEventListener('resize', handleResize);

        // Configuración según intensidad
        const dropCount = intensity === 'light' ? 60 : intensity === 'moderate' ? 110 : 180;
        const drops: {
            x: number;
            y: number;
            l: number;
            xs: number;
            ys: number;
            opacity: number;
        }[] = [];

        for (let i = 0; i < dropCount; i++) {
            drops.push({
                x: Math.random() * width,
                y: Math.random() * height,
                l: Math.random() * 12 + 10,       // Longitud de la gota
                xs: -1.5 - Math.random() * 1.5,    // Inclinación hacia la izquierda por viento
                ys: Math.random() * 10 + 14,      // Velocidad vertical
                opacity: Math.random() * 0.4 + 0.25 // Transparencia suave
            });
        }

        // Ondas / salpicaduras en el suelo
        const splashes: { x: number; y: number; r: number; maxR: number; opacity: number }[] = [];

        const render = () => {
            ctx.clearRect(0, 0, width, height);

            // Dibujar gotas
            ctx.lineWidth = 1.2;
            ctx.lineCap = 'round';

            for (let i = 0; i < drops.length; i++) {
                const d = drops[i];
                ctx.beginPath();
                ctx.moveTo(d.x, d.y);
                ctx.lineTo(d.x + d.xs * 1.2, d.y + d.l);
                ctx.strokeStyle = `rgba(186, 220, 255, ${d.opacity})`;
                ctx.stroke();

                d.x += d.xs;
                d.y += d.ys;

                // Si llega al final o sale de la pantalla, reiniciar arriba
                if (d.y > height) {
                    // Ocasional salpicadura
                    if (Math.random() > 0.65 && splashes.length < 30) {
                        splashes.push({
                            x: d.x,
                            y: height - Math.random() * 30,
                            r: 1,
                            maxR: Math.random() * 5 + 3,
                            opacity: 0.5
                        });
                    }

                    d.y = -20;
                    d.x = Math.random() * (width + 100);
                }
                if (d.x < -20) {
                    d.x = width + 20;
                }
            }

            // Dibujar salpicaduras
            for (let s = splashes.length - 1; s >= 0; s--) {
                const sp = splashes[s];
                ctx.beginPath();
                ctx.ellipse(sp.x, sp.y, sp.r, sp.r * 0.4, 0, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(195, 225, 255, ${sp.opacity})`;
                ctx.lineWidth = 0.9;
                ctx.stroke();

                sp.r += 0.4;
                sp.opacity -= 0.035;

                if (sp.opacity <= 0 || sp.r >= sp.maxR) {
                    splashes.splice(s, 1);
                }
            }

            animationFrameId = requestAnimationFrame(render);
        };

        render();

        return () => {
            window.removeEventListener('resize', handleResize);
            cancelAnimationFrame(animationFrameId);
        };
    }, [isActive, intensity]);

    if (!isActive) return null;

    return (
        <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden select-none">
            {/* Atmósfera sutil de lluvia / nubosidad */}
            <div className="absolute inset-0 bg-gradient-to-b from-blue-950/15 via-transparent to-blue-950/25 pointer-events-none" />

            {/* Canvas de lluvia cayendo en tiempo real */}
            <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full pointer-events-none"
            />
        </div>
    );
}
