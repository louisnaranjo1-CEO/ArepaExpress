import React, { useState } from 'react';
import { CloudRain, Wind, Droplets, Thermometer, Moon, Sun, X, Info, Sparkles } from 'lucide-react';
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

            {/* 2. Detailed Weather Popover Modal */}
            {isDetailsOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in select-none">
                    <div className="relative w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-5">
                        {/* Header */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className={`w-9 h-9 rounded-2xl flex items-center justify-center text-lg ${
                                    isRainingNow ? 'bg-blue-100 dark:bg-blue-950 text-blue-600' : 'bg-amber-100 dark:bg-amber-950 text-amber-600'
                                }`}>
                                    {weather.conditionEmoji}
                                </div>
                                <div>
                                    <h3 className="text-sm font-black text-slate-900 dark:text-white">
                                        Clima en tu Ubicación
                                    </h3>
                                    <p className="text-[11px] text-slate-400 font-medium">
                                        Actualizado: {weather.updatedAt}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsDetailsOpen(false)}
                                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-white flex items-center justify-center transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Big Condition Banner */}
                        <div className={`p-4 rounded-2xl border ${
                            isRainingNow
                                ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900/50'
                                : 'bg-slate-50 dark:bg-slate-800/40 border-slate-100 dark:border-slate-800'
                        }`}>
                            <div className="flex items-baseline justify-between">
                                <div>
                                    <p className="text-2xl font-black text-slate-900 dark:text-white">
                                        {weather.temperature}°C
                                    </p>
                                    <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
                                        {weather.conditionText}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                                        Sensación Térmica
                                    </p>
                                    <p className="text-sm font-black text-slate-700 dark:text-slate-200">
                                        {weather.apparentTemperature}°C
                                    </p>
                                </div>
                            </div>

                            {/* Rain probability bar */}
                            <div className="mt-3 space-y-1">
                                <div className="flex justify-between text-[10px] font-bold">
                                    <span className="text-slate-500">Probabilidad de Lluvia</span>
                                    <span className={weather.rainProbability > 50 ? 'text-blue-600 dark:text-blue-400 font-black' : 'text-slate-600'}>
                                        {weather.rainProbability}%
                                    </span>
                                </div>
                                <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all duration-500 ${
                                            weather.rainProbability > 60
                                                ? 'bg-blue-600'
                                                : weather.rainProbability > 30
                                                ? 'bg-amber-500'
                                                : 'bg-emerald-500'
                                        }`}
                                        style={{ width: `${Math.max(5, weather.rainProbability)}%` }}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Grid Details */}
                        <div className="grid grid-cols-2 gap-2.5 text-xs">
                            <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-2xl border border-slate-100 dark:border-slate-800 flex items-center gap-2.5">
                                <Droplets className="w-4 h-4 text-blue-500 shrink-0" />
                                <div>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase">Humedad</p>
                                    <p className="font-black text-slate-800 dark:text-slate-100">{weather.humidity}%</p>
                                </div>
                            </div>
                            <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-2xl border border-slate-100 dark:border-slate-800 flex items-center gap-2.5">
                                <Wind className="w-4 h-4 text-teal-500 shrink-0" />
                                <div>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase">Viento</p>
                                    <p className="font-black text-slate-800 dark:text-slate-100">{weather.windSpeed} km/h</p>
                                </div>
                            </div>
                            <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-2xl border border-slate-100 dark:border-slate-800 flex items-center gap-2.5">
                                {isNight ? (
                                    <Moon className="w-4 h-4 text-indigo-500 shrink-0" />
                                ) : (
                                    <Sun className="w-4 h-4 text-amber-500 shrink-0" />
                                )}
                                <div>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase">Ciclo Horario</p>
                                    <p className="font-black text-slate-800 dark:text-slate-100">
                                        {isNight ? 'Modo Noche (7pm-6am)' : 'Modo Diurno'}
                                    </p>
                                </div>
                            </div>
                            <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-2xl border border-slate-100 dark:border-slate-800 flex items-center gap-2.5">
                                <CloudRain className="w-4 h-4 text-sky-500 shrink-0" />
                                <div>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase">Precipitación</p>
                                    <p className="font-black text-slate-800 dark:text-slate-100">{weather.precipitationMm} mm</p>
                                </div>
                            </div>
                        </div>

                        {/* Informative Note */}
                        <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-2xl border border-amber-200/60 dark:border-amber-900/40 flex items-start gap-2 text-[11px] text-amber-900 dark:text-amber-200">
                            <Info className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                            <p>
                                {isRainingNow
                                    ? '🌧️ Está lloviendo en tu ubicación. El mapa activa la animación de lluvia y se compensa justamente el esfuerzo de los conductores.'
                                    : '☀️ Clima óptimo para solicitar viajes y entregas express sin retrasos.'}
                            </p>
                        </div>

                        {/* Test rain animation trigger if available */}
                        {onToggleTestRain && (
                            <button
                                type="button"
                                onClick={onToggleTestRain}
                                className={`w-full py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 border ${
                                    testRainActive
                                        ? 'bg-blue-500 text-white border-blue-600'
                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                                }`}
                            >
                                <CloudRain className="w-3.5 h-3.5" />
                                <span>{testRainActive ? 'Desactivar simulación de lluvia' : 'Probar animación de lluvia en el mapa'}</span>
                            </button>
                        )}

                        <button
                            onClick={() => setIsDetailsOpen(false)}
                            className="w-full py-3 bg-primary text-slate-950 rounded-2xl font-black text-xs uppercase tracking-wider shadow-lg active:scale-95 transition-transform"
                        >
                            Entendido
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
