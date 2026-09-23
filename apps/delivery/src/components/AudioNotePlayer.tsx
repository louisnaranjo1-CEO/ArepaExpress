import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2, RotateCcw } from 'lucide-react';

interface AudioNotePlayerProps {
    src: string;
    className?: string;
}

export const AudioNotePlayer: React.FC<AudioNotePlayerProps> = ({ src, className = '' }) => {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [playbackRate, setPlaybackRate] = useState(1);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const audio = new Audio(src);
        audioRef.current = audio;

        const onLoadedMetadata = () => {
            if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
                setDuration(audio.duration);
            }
            setIsLoading(false);
        };

        const onDurationChange = () => {
            if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
                setDuration(audio.duration);
            }
        };

        const onTimeUpdate = () => {
            setCurrentTime(audio.currentTime);
            // Fix for WebM duration: if duration is Infinity or NaN, dynamically update with max currentTime seen
            if (!isFinite(audio.duration) || isNaN(audio.duration)) {
                setDuration(prev => Math.max(prev, audio.currentTime));
            }
        };

        const onEnded = () => {
            setIsPlaying(false);
            setCurrentTime(0);
        };

        const onError = () => {
            setIsLoading(false);
            setIsPlaying(false);
        };

        audio.addEventListener('loadedmetadata', onLoadedMetadata);
        audio.addEventListener('durationchange', onDurationChange);
        audio.addEventListener('timeupdate', onTimeUpdate);
        audio.addEventListener('ended', onEnded);
        audio.addEventListener('error', onError);

        // Preload metadata
        audio.preload = 'metadata';

        return () => {
            audio.pause();
            audio.removeEventListener('loadedmetadata', onLoadedMetadata);
            audio.removeEventListener('durationchange', onDurationChange);
            audio.removeEventListener('timeupdate', onTimeUpdate);
            audio.removeEventListener('ended', onEnded);
            audio.removeEventListener('error', onError);
            audioRef.current = null;
        };
    }, [src]);

    const togglePlay = () => {
        const audio = audioRef.current;
        if (!audio) return;

        if (isPlaying) {
            audio.pause();
            setIsPlaying(false);
        } else {
            audio.playbackRate = playbackRate;
            audio.play().then(() => {
                setIsPlaying(true);
            }).catch(err => {
                console.error("Audio playback error:", err);
                setIsPlaying(false);
            });
        }
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        const audio = audioRef.current;
        if (!audio) return;
        const newTime = parseFloat(e.target.value);
        audio.currentTime = newTime;
        setCurrentTime(newTime);
    };

    const toggleSpeed = () => {
        const audio = audioRef.current;
        const nextRate = playbackRate === 1 ? 1.5 : playbackRate === 1.5 ? 2 : 1;
        setPlaybackRate(nextRate);
        if (audio) {
            audio.playbackRate = nextRate;
        }
    };

    const formatTime = (secs: number) => {
        if (!isFinite(secs) || isNaN(secs) || secs < 0) return '0:00';
        const mins = Math.floor(secs / 60);
        const remainingSecs = Math.floor(secs % 60);
        return `${mins}:${remainingSecs < 10 ? '0' : ''}${remainingSecs}`;
    };

    const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

    return (
        <div className={`flex flex-col bg-slate-900/90 text-white rounded-2xl p-3 shadow-lg border border-slate-700/60 backdrop-blur-md ${className}`}>
            <div className="flex items-center gap-3">
                {/* Play/Pause Button */}
                <button
                    type="button"
                    onClick={togglePlay}
                    disabled={isLoading}
                    className="w-10 h-10 rounded-full bg-amber-400 hover:bg-amber-300 text-slate-950 flex items-center justify-center shrink-0 shadow-md active:scale-95 transition-all disabled:opacity-50"
                    aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
                >
                    {isPlaying ? (
                        <Pause className="w-5 h-5 fill-slate-950 text-slate-950" />
                    ) : (
                        <Play className="w-5 h-5 fill-slate-950 text-slate-950 ml-0.5" />
                    )}
                </button>

                {/* Animated Bars & Progress Bar */}
                <div className="flex-1 flex flex-col justify-center">
                    <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5">
                            <Volume2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <span className="text-[10px] font-black uppercase text-amber-400 tracking-wider">
                                Nota de Voz de la Orden
                            </span>
                        </div>
                        {/* Audio animated waveform bars */}
                        <div className="flex items-center gap-0.5 h-3">
                            {[0.4, 0.9, 0.6, 1, 0.5, 0.8, 0.3].map((height, idx) => (
                                <div
                                    key={idx}
                                    className={`w-0.5 rounded-full bg-amber-400 transition-all duration-150 ${
                                        isPlaying ? 'animate-pulse' : 'opacity-40'
                                    }`}
                                    style={{
                                        height: isPlaying ? `${Math.max(20, height * 100)}%` : '30%',
                                        animationDelay: `${idx * 80}ms`
                                    }}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Progress Slider */}
                    <input
                        type="range"
                        min="0"
                        max={duration > 0 ? duration : 100}
                        step="0.1"
                        value={currentTime}
                        onChange={handleSeek}
                        className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-400 focus:outline-none"
                    />

                    {/* Timers & Speed Toggle */}
                    <div className="flex items-center justify-between text-[11px] font-medium text-slate-400 mt-1">
                        <span>{formatTime(currentTime)}</span>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={toggleSpeed}
                                className="px-1.5 py-0.5 rounded text-[10px] font-black bg-slate-800 text-amber-300 hover:bg-slate-700 transition-colors"
                            >
                                {playbackRate}x
                            </button>
                            <span>{duration > 0 ? formatTime(duration) : '--:--'}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AudioNotePlayer;
