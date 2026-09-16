import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { CloudRain, Wind, Droplets, Moon, Sun, X, Info } from 'lucide-react';
import { WeatherInfo } from '../lib/weather';

interface WeatherWidgetProps {
    weather: WeatherInfo | null;
    isNight: boolean;
    onToggleTestRain?: () => void;
    testRainActive?: boolean;
}

export default function WeatherWidget({
    weather,
    isNight,
    onToggleTestRain,
    testRainActive = false
}: WeatherWidgetProps) {
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);

    if (!weather) return null;

    const isRainingNow = weather.isRaining || testRainActive;

    const modalContent = isDetailsOpen && typeof document !== 'undefined' ? createPortal(
        <div 
            className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150 select-none"
            onClick={() => setIsDetailsOpen(false)}
        >
            <div 
                className="relative w-full max-w-[340px] bg-slate-900/95 text-white rounded-[28px] p-4 shadow-2xl border border-slate-800 animate-in zoom-in-95 duration-150 backdrop-blur-xl flex flex-col gap-3"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between pb-2 border-b border-white/10">
                    <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-base ${
                            isRainingNow ? 'bg-blue-500/20 text-blue-400' : 'bg-amber-500/20 text-amber-400'
                        }`}>
                            {weather.conditionEmoji}
                        </div>
                        <div>
                            <h3 className="text-xs font-black uppercase tracking-wider text-white">
                                Clima en tu Ubicación
                            </h3>
                            <p className="text-[10px] text-slate-400 font-medium">
                                Actualizado: {weather.updatedAt}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={() => setIsDetailsOpen(false)}
                        className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
                        title="Cerrar"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Minimal Temperature & Rain Banner */}
                <div className={`p-3.5 rounded-2xl border ${
                    isRainingNow
                        ? 'bg-blue-950/40 border-blue-800/60 text-white'
                        : 'bg-white/[0.04] border-white/[0.08]'
                }`}>
                    <div className="flex items-baseline justify-between">
                        <div>
                            <span className="text-3xl font-black tracking-tight text-white leading-none">
                                {weather.temperature}°C
                            </span>
                            <p className="text-xs font-bold text-slate-300 mt-1 capitalize">
                                {weather.conditionText}
                            </p>
                        </div>
                        <div className="text-right">
                            <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                                Sensación
                            </p>
                            <p className="text-sm font-black text-amber-400">
                                {weather.apparentTemperature}°C
                            </p>
                            <span className="text-[10px] font-bold text-sky-400 flex items-center justify-end gap-1 mt-0.5">
                                <CloudRain className="w-3 h-3" />
                                {isRainingNow ? 'Lloviendo' : `${weather.rainProbability}%`}
                            </span>
                        </div>
                    </div>

                    {/* Compact rain bar */}
                    <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden mt-2.5">
                        <div
                            className={`h-full rounded-full transition-all duration-500 ${
                                weather.rainProbability > 60
                                    ? 'bg-blue-500'
                                    : weather.rainProbability > 30
                                    ? 'bg-amber-500'
                                    : 'bg-emerald-500'
                            }`}
                            style={{ width: `${Math.max(6, weather.rainProbability)}%` }}
                        />
                    </div>
                </div>

                {/* Minimal Metrics Grid (2x2) */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-white/[0.04] border border-white/[0.08] p-2.5 rounded-xl flex items-center gap-2">
                        <Droplets className="w-4 h-4 text-blue-400 shrink-0" />
                        <div className="min-w-0">
                            <p className="text-[9px] text-slate-400 font-bold uppercase truncate">Humedad</p>
                            <p className="font-black text-slate-100 text-xs">{weather.humidity}%</p>
                        </div>
                    </div>
                    <div className="bg-white/[0.04] border border-white/[0.08] p-2.5 rounded-xl flex items-center gap-2">
                        <Wind className="w-4 h-4 text-teal-400 shrink-0" />
                        <div className="min-w-0">
                            <p className="text-[9px] text-slate-400 font-bold uppercase truncate">Viento</p>
                            <p className="font-black text-slate-100 text-xs">{weather.windSpeed} km/h</p>
                        </div>
                    </div>
                    <div className="bg-white/[0.04] border border-white/[0.08] p-2.5 rounded-xl flex items-center gap-2">
                        {isNight ? (
                            <Moon className="w-4 h-4 text-indigo-400 shrink-0" />
                        ) : (
                            <Sun className="w-4 h-4 text-amber-400 shrink-0" />
                        )}
                        <div className="min-w-0">
                            <p className="text-[9px] text-slate-400 font-bold uppercase truncate">Horario</p>
                            <p className="font-black text-slate-100 text-xs">{isNight ? 'Noche' : 'Día'}</p>
                        </div>
                    </div>
                    <div className="bg-white/[0.04] border border-white/[0.08] p-2.5 rounded-xl flex items-center gap-2">
                        <CloudRain className="w-4 h-4 text-sky-400 shrink-0" />
                        <div className="min-w-0">
                            <p className="text-[9px] text-slate-400 font-bold uppercase truncate">Lluvia</p>
                            <p className="font-black text-slate-100 text-xs">{weather.precipitationMm} mm</p>
                        </div>
                    </div>
                </div>

                {/* Minimal Informative Note */}
                <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center gap-2 text-[11px] text-amber-200/90 leading-snug">
                    <Info className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                    <p className="line-clamp-2">
                        {isRainingNow
                            ? 'Está lloviendo. Tarifa adaptada para compensar a los conductores.'
                            : 'Clima favorable para viajes y entregas rápidas sin demoras.'}
                    </p>
                </div>

                {/* Rain simulation trigger if provided */}
                {onToggleTestRain && (
                    <button
                        type="button"
                        onClick={onToggleTestRain}
                        className={`w-full py-1.5 rounded-lg text-[10px] font-bold transition-all flex items-center justify-center gap-1.5 border ${
                            testRainActive
                                ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                                : 'bg-white/5 text-slate-400 border-white/10 hover:text-slate-200'
                        }`}
                    >
                        <CloudRain className="w-3 h-3" />
                        <span>{testRainActive ? 'Desactivar simulación lluvia' : 'Simular lluvia'}</span>
                    </button>
                )}

                {/* Bottom Action Button */}
                <button
                    onClick={() => setIsDetailsOpen(false)}
                    className="w-full py-2.5 bg-primary text-slate-950 rounded-xl font-black text-xs uppercase tracking-wider shadow-lg active:scale-95 transition-transform mt-1"
                >
                    Entendido
                </button>
            </div>
        </div>,
        document.body
    ) : null;

    return (
        <>
            {/* 1. Floating Weather Pill Button */}
            <button
                type="button"
                onClick={() => setIsDetailsOpen(true)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full backdrop-blur-md shadow-lg transition-all active:scale-95 border ${
                    isRainingNow
                        ? 'bg-blue-600/90 text-white border-blue-400/50 animate-pulse'
                        : isNight
                        ? 'bg-slate-900/85 text-slate-100 border-slate-700/60 hover:bg-slate-900'
                        : 'bg-white/90 text-slate-800 border-slate-200/80 hover:bg-white'
                }`}
                title="Ver estado del clima en tu ubicación"
            >
                <span className="text-sm select-none">{weather.conditionEmoji}</span>
                <span className="text-xs font-black tracking-tight">{weather.temperature}°C</span>
                <div className="w-1 h-1 rounded-full bg-current opacity-40" />
                <span className="text-[10px] font-bold opacity-90 flex items-center gap-0.5">
                    <CloudRain className="w-2.5 h-2.5 inline" />
                    {isRainingNow ? 'Lloviendo' : `${weather.rainProbability}%`}
                </span>
                {isNight && (
                    <Moon className="w-2.5 h-2.5 text-indigo-300 ml-0.5" />
                )}
            </button>

            {/* 2. Modal Portaled to document.body */}
            {modalContent}
        </>
    );
}
