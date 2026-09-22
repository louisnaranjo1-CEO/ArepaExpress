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
    try {
        const ctx = getAudioContext();
        if (!ctx) return;
        const now = ctx.currentTime;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.frequency.setValueAtTime(880, now);
        osc.frequency.setValueAtTime(1320, now + 0.1);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.28, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

        osc.start(now);
        osc.stop(now + 0.36);

        setTimeout(() => ctx.close().catch(() => {}), 500);

        if (typeof navigator !== 'undefined' && navigator.vibrate) {
            navigator.vibrate([80, 40, 80]);
        }
    } catch (e) {
        console.warn("Could not play chat chime:", e);
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
