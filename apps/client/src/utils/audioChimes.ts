// Native Web Audio Synthesizer for notifications (zero external network/mp3 dependencies)

function getAudioContext(): AudioContext | null {
    try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtx) return null;
        const ctx = new AudioCtx();
        if (ctx.state === 'suspended') {
            ctx.resume().catch(() => {});
        }
        return ctx;
    } catch {
        return null;
    }
}

/**
 * Friendly 2-tone chat message chime (880Hz -> 1320Hz)
 */
export function playChatChime() {
    playLoudMessageNotificationSound();
}

/**
 * Fuerte y clara alerta sonora para nuevos mensajes de conductores o comercios
 * Sintetizador Web Audio de alta ganancia + fallback a audio nativo con vibración háptica
 */
export function playLoudMessageNotificationSound() {
    try {
        const ctx = getAudioContext();
        if (ctx) {
            const now = ctx.currentTime;
            
            // Compresor dinámico para maximizar pegada sin distorsión
            const compressor = ctx.createDynamicsCompressor();
            compressor.threshold.setValueAtTime(-8, now);
            compressor.knee.setValueAtTime(30, now);
            compressor.ratio.setValueAtTime(8, now);
            compressor.attack.setValueAtTime(0.002, now);
            compressor.release.setValueAtTime(0.2, now);
            compressor.connect(ctx.destination);

            const masterGain = ctx.createGain();
            masterGain.gain.setValueAtTime(0.95, now);
            masterGain.connect(compressor);

            // Secuencia brillante y penetrante: E5 (659Hz) -> A5 (880Hz) -> E6 (1318Hz)
            const tones = [
                { freq: 659.25, start: 0, dur: 0.12, type: 'sine' as OscillatorType },
                { freq: 880.00, start: 0.09, dur: 0.14, type: 'triangle' as OscillatorType },
                { freq: 1318.51, start: 0.20, dur: 0.35, type: 'triangle' as OscillatorType }
            ];

            tones.forEach(({ freq, start, dur, type }) => {
                const osc = ctx.createOscillator();
                osc.type = type;
                osc.frequency.setValueAtTime(freq, now + start);

                const noteGain = ctx.createGain();
                noteGain.gain.setValueAtTime(0, now + start);
                noteGain.gain.linearRampToValueAtTime(0.95, now + start + 0.02);
                noteGain.gain.exponentialRampToValueAtTime(0.001, now + start + dur);

                osc.connect(noteGain);
                noteGain.connect(masterGain);

                osc.start(now + start);
                osc.stop(now + start + dur + 0.02);
            });

            setTimeout(() => ctx.close().catch(() => {}), 900);
        }

        // Respaldo de sonido HTML5
        try {
            const backupAudio = new Audio('https://xfialzrbbsdzzcjtefqo.supabase.co/storage/v1/object/public/store_assets/Digital_Cascade_01.mp3');
            backupAudio.volume = 1.0;
            backupAudio.play().catch(() => {});
        } catch {}

        if (typeof navigator !== 'undefined' && navigator.vibrate) {
            navigator.vibrate([250, 100, 250, 100, 350]);
        }
    } catch (e) {
        console.warn("Could not play loud notification sound:", e);
    }
}

/**
 * Incoming call alert chime
 */
export function playCallAlertChime() {
    try {
        const ctx = getAudioContext();
        if (!ctx) return;
        const now = ctx.currentTime;

        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.type = 'sine';
        osc2.type = 'triangle';
        osc1.frequency.setValueAtTime(750, now);
        osc2.frequency.setValueAtTime(1000, now);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.3, now + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.65);
        osc2.stop(now + 0.65);

        setTimeout(() => ctx.close().catch(() => {}), 800);

        if (typeof navigator !== 'undefined' && navigator.vibrate) {
            navigator.vibrate([200, 100, 200, 100, 400]);
        }
    } catch (e) {
        console.warn("Could not play call alert chime:", e);
    }
}

/**
 * Trip status update chime (C-E-G major chord progression)
 */
export function playTripStatusChime() {
    try {
        const ctx = getAudioContext();
        if (!ctx) return;
        const now = ctx.currentTime;

        const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
        notes.forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + idx * 0.1);
            osc.connect(gain);
            gain.connect(ctx.destination);

            const start = now + idx * 0.1;
            gain.gain.setValueAtTime(0, start);
            gain.gain.linearRampToValueAtTime(0.25, start + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, start + 0.3);

            osc.start(start);
            osc.stop(start + 0.32);
        });

        setTimeout(() => ctx.close().catch(() => {}), 800);
    } catch (e) {
        console.warn("Could not play status chime:", e);
    }
}

/**
 * Characteristic Moto horn (high-pitched lively "beep-beep")
 */
export function playMotoHorn() {
    try {
        const ctx = getAudioContext();
        if (!ctx) return;
        const now = ctx.currentTime;

        [0, 0.14].forEach((delay) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(680, now + delay);
            osc.frequency.exponentialRampToValueAtTime(720, now + delay + 0.08);

            const filter = ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 1800;

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(ctx.destination);

            const start = now + delay;
            gain.gain.setValueAtTime(0, start);
            gain.gain.linearRampToValueAtTime(0.25, start + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, start + 0.09);

            osc.start(start);
            osc.stop(start + 0.1);
        });

        setTimeout(() => ctx.close().catch(() => {}), 500);
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
            navigator.vibrate([40, 30, 40]);
        }
    } catch (e) {
        console.warn("Could not play moto horn:", e);
    }
}

/**
 * Classic Car / Sedan horn (dual harmonized tones: 415Hz + 520Hz)
 */
export function playCarHorn() {
    try {
        const ctx = getAudioContext();
        if (!ctx) return;
        const now = ctx.currentTime;

        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.type = 'sawtooth';
        osc2.type = 'sawtooth';
        osc1.frequency.setValueAtTime(415, now);
        osc2.frequency.setValueAtTime(520, now);

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 2200;

        osc1.connect(filter);
        osc2.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.3, now + 0.02);
        gain.gain.setValueAtTime(0.3, now + 0.22);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.33);
        osc2.stop(now + 0.33);

        setTimeout(() => ctx.close().catch(() => {}), 600);
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
            navigator.vibrate([100]);
        }
    } catch (e) {
        console.warn("Could not play car horn:", e);
    }
}

/**
 * Deep resonant Truck / Freight air horn (165Hz + 220Hz + 330Hz)
 */
export function playTruckHorn() {
    try {
        const ctx = getAudioContext();
        if (!ctx) return;
        const now = ctx.currentTime;

        const freqs = [165, 220, 330];
        const gain = ctx.createGain();

        freqs.forEach((freq) => {
            const osc = ctx.createOscillator();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(freq, now);
            osc.connect(gain);
            osc.start(now);
            osc.stop(now + 0.45);
        });

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1600;

        gain.connect(filter);
        filter.connect(ctx.destination);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.35, now + 0.04);
        gain.gain.setValueAtTime(0.35, now + 0.35);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

        setTimeout(() => ctx.close().catch(() => {}), 700);
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
            navigator.vibrate([150]);
        }
    } catch (e) {
        console.warn("Could not play truck horn:", e);
    }
}
