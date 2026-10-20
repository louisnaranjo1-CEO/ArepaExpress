import { supabase } from './supabase';

/**
 * Categorías de sonido del sistema
 */
export type SoundCategory = 'notification' | 'cycle_update' | 'process_completed';

/**
 * Claves de eventos de sonido del sistema (los 15 base + extensibilidad genérica)
 */
export type SoundEventKey =
    // Categoría 'notification'
    | 'notif_new_order'
    | 'notif_new_chat'
    | 'notif_emergency_sos'
    | 'notif_support_ticket'
    | 'notif_general_push'
    // Categoría 'cycle_update'
    | 'cycle_order_accepted'
    | 'cycle_order_ready'
    | 'cycle_driver_assigned'
    | 'cycle_order_in_transit'
    | 'cycle_driver_arrived'
    | 'cycle_ride_started'
    // Categoría 'process_completed'
    | 'done_order_delivered'
    | 'done_ride_completed'
    | 'done_payment_verified'
    | 'done_cashier_closed'
    // Extensibilidad
    | (string & {});

/**
 * Identificadores de tonos sintetizados de respaldo
 */
export type DefaultTone =
    | 'alert_loop'
    | 'chat_pop'
    | 'sos_siren'
    | 'ticket_bell'
    | 'push_chime'
    | 'cycle_accept'
    | 'cycle_ready'
    | 'cycle_driver'
    | 'cycle_transit'
    | 'cycle_arrived'
    | 'done_success'
    | 'done_cash'
    | (string & {});

/**
 * Roles destinatarios para los eventos de sonido
 */
export type TargetRole = 'admin' | 'cashier' | 'driver' | 'client' | 'all' | (string & {});

/**
 * Espejo exacto de las columnas de la tabla `public.app_sound_settings`
 */
export interface AppSoundSetting {
    id: string;
    event_key: SoundEventKey;
    category: SoundCategory;
    label: string;
    description?: string | null;
    audio_url?: string | null;
    default_tone: DefaultTone;
    volume: number; // 0.0 a 1.0
    is_enabled: boolean;
    is_loop: boolean;
    target_roles: TargetRole[] | string[];
    updated_at?: string;
}

/**
 * Motor Global de Sonidos Dinámicos y Resilientes
 * - Desbloqueo automático de AudioContext (Autoplay Policy en Android WebView y Browsers)
 * - Caché de elementos HTMLAudioElement con preload='auto' para 0ms de latencia
 * - Sintetizador Web Audio API autónomo como fallback instantáneo sin dependencias externas
 * - Sincronización en tiempo real vía Supabase Realtime
 */
class SoundEngine {
    private static instance: SoundEngine | null = null;

    private audioContext: AudioContext | null = null;
    private isAudioUnlocked: boolean = false;
    private isInitialized: boolean = false;
    private initializingPromise: Promise<void> | null = null;

    private settingsMap: Map<string, AppSoundSetting> = new Map();
    private audioCache: Map<string, HTMLAudioElement> = new Map();
    private activeLoopTimers: Map<string, any> = new Map();
    private realtimeChannel: any = null;

    private constructor() {
        if (typeof window !== 'undefined') {
            this.initAutoplayUnlock();
        }
    }

    /**
     * Acceso Singleton
     */
    public static getInstance(): SoundEngine {
        if (!SoundEngine.instance) {
            SoundEngine.instance = new SoundEngine();
        }
        return SoundEngine.instance;
    }

    /**
     * 2. Desbloqueo Automático de Audio (Autoplay Unlock)
     * Registra listeners en window para activar el AudioContext en la primera interacción.
     */
    private initAutoplayUnlock(): void {
        if (typeof window === 'undefined') return;

        const unlockHandler = () => {
            this.unlockAudio();
            if (this.isAudioUnlocked) {
                const events = ['click', 'touchstart', 'touchend', 'keydown', 'pointerdown'];
                events.forEach((evt) => {
                    window.removeEventListener(evt, unlockHandler);
                });
            }
        };

        const events = ['click', 'touchstart', 'touchend', 'keydown', 'pointerdown'];
        events.forEach((evt) => {
            window.addEventListener(evt, unlockHandler, { passive: true });
        });
    }

    /**
     * Reanuda o inicializa el AudioContext global garantizando estado 'running'
     */
    public async unlockAudio(): Promise<boolean> {
        if (typeof window === 'undefined') return false;

        try {
            const ctx = this.getAudioContext();
            if (ctx && ctx.state === 'suspended') {
                await ctx.resume();
            }
            this.isAudioUnlocked = ctx ? ctx.state === 'running' : false;
            return this.isAudioUnlocked;
        } catch (e) {
            console.warn('[SoundEngine] Advertencia al desbloquear AudioContext:', e);
            return false;
        }
    }

    /**
     * Obtiene o instancia el AudioContext único
     */
    private getAudioContext(): AudioContext | null {
        if (typeof window === 'undefined') return null;

        if (!this.audioContext) {
            const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
            if (AudioCtx) {
                this.audioContext = new AudioCtx();
            }
        }
        return this.audioContext;
    }

    /**
     * 3. Inicialización y Precarga en Caché
     * Consulta Supabase, llena el mapa de configuraciones y precarga los archivos de audio
     */
    public async initialize(): Promise<void> {
        if (this.isInitialized) return;
        if (this.initializingPromise) return this.initializingPromise;

        this.initializingPromise = (async () => {
            try {
                await this.refreshSettings();
                this.subscribeToRealtime();
                this.isInitialized = true;
            } catch (error) {
                console.error('[SoundEngine] Error durante la inicialización:', error);
            } finally {
                this.initializingPromise = null;
            }
        })();

        return this.initializingPromise;
    }

    /**
     * Recarga las configuraciones desde la base de datos de Supabase
     */
    public async refreshSettings(): Promise<void> {
        if (!supabase) return;

        try {
            const { data, error } = await supabase
                .from('app_sound_settings')
                .select('*');

            if (error) {
                console.error('[SoundEngine] Error al consultar app_sound_settings:', error);
                return;
            }

            if (data && Array.isArray(data)) {
                this.settingsMap.clear();

                for (const item of data as AppSoundSetting[]) {
                    this.settingsMap.set(item.event_key, item);

                    if (item.audio_url && item.audio_url.trim() !== '' && item.is_enabled) {
                        this.cacheAudioElement(item.event_key, item.audio_url, item.volume, item.is_loop);
                    } else {
                        // Si ya no tiene audio_url o está deshabilitado, limpiar caché
                        const existing = this.audioCache.get(item.event_key);
                        if (existing) {
                            try {
                                existing.pause();
                                existing.src = '';
                            } catch (e) {}
                            this.audioCache.delete(item.event_key);
                        }
                    }
                }
            }
        } catch (err) {
            console.error('[SoundEngine] Excepción en refreshSettings:', err);
        }
    }

    /**
     * Almacena y precarga un elemento HTMLAudioElement para respuesta con 0ms de latencia
     */
    private cacheAudioElement(eventKey: string, audioUrl: string, volume: number, isLoop: boolean): void {
        if (typeof window === 'undefined') return;

        try {
            const clampedVol = Math.max(0, Math.min(1, volume ?? 1.0));
            const existing = this.audioCache.get(eventKey);

            if (existing) {
                if (existing.src === audioUrl) {
                    existing.volume = clampedVol;
                    existing.loop = Boolean(isLoop);
                    return;
                }
                existing.pause();
                existing.src = '';
            }

            const audio = new Audio(audioUrl);
            audio.preload = 'auto';
            audio.volume = clampedVol;
            audio.loop = Boolean(isLoop);
            audio.load();

            this.audioCache.set(eventKey, audio);
        } catch (e) {
            console.warn(`[SoundEngine] No se pudo precargar audio para "${eventKey}":`, e);
        }
    }

    /**
     * 6. Suscripción en Tiempo Real a `app_sound_settings`
     */
    private subscribeToRealtime(): void {
        if (!supabase || typeof window === 'undefined') return;

        if (this.realtimeChannel) {
            supabase.removeChannel(this.realtimeChannel);
            this.realtimeChannel = null;
        }

        this.realtimeChannel = supabase
            .channel('app_sound_settings_realtime_sync')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'app_sound_settings' },
                (payload: any) => {
                    this.handleRealtimePayload(payload);
                }
            )
            .subscribe();
    }

    /**
     * Procesa los eventos Realtime de Supabase en caliente
     */
    private handleRealtimePayload(payload: any): void {
        const { eventType, new: newRecord, old: oldRecord } = payload;

        if (eventType === 'INSERT' || eventType === 'UPDATE') {
            const setting = newRecord as AppSoundSetting;
            if (!setting || !setting.event_key) return;

            this.settingsMap.set(setting.event_key, setting);

            if (!setting.is_enabled) {
                // Detener cualquier sonido en curso si fue apagado
                this.stop(setting.event_key);
            }

            if (setting.audio_url && setting.audio_url.trim() !== '' && setting.is_enabled) {
                this.cacheAudioElement(setting.event_key, setting.audio_url, setting.volume, setting.is_loop);
            } else {
                const existing = this.audioCache.get(setting.event_key);
                if (existing) {
                    try {
                        existing.pause();
                        existing.src = '';
                    } catch (e) {}
                    this.audioCache.delete(setting.event_key);
                }
            }
        } else if (eventType === 'DELETE') {
            const eventKey = oldRecord?.event_key;
            if (eventKey) {
                this.stop(eventKey);
                this.settingsMap.delete(eventKey);
                const existing = this.audioCache.get(eventKey);
                if (existing) {
                    try {
                        existing.pause();
                        existing.src = '';
                    } catch (e) {}
                    this.audioCache.delete(eventKey);
                }
            }
        }
    }

    /**
     * 4. Sintetizador Web Audio API Integrado
     * Genera tonos armónicos de alta fidelidad como respaldo instantáneo
     */
    private playSynthesizedTone(defaultTone: string, volume: number, isLoop: boolean = false, eventKey?: string): void {
        const ctx = this.getAudioContext();
        if (!ctx) return;

        // Limpiar loop previo si ya estaba activo en este eventKey
        if (eventKey && this.activeLoopTimers.has(eventKey)) {
            clearInterval(this.activeLoopTimers.get(eventKey));
            this.activeLoopTimers.delete(eventKey);
        }

        const clampedVol = Math.max(0, Math.min(1, volume ?? 1.0));
        if (clampedVol <= 0) return;

        // Ejecutar el patrón acústico puntual
        this.executeTonePattern(defaultTone, clampedVol);

        // Si es en bucle (is_loop === true), programar su repetición continua
        if (isLoop && eventKey) {
            const intervalMs = this.getLoopIntervalMs(defaultTone);
            const timerId = setInterval(() => {
                this.executeTonePattern(defaultTone, clampedVol);
            }, intervalMs);
            this.activeLoopTimers.set(eventKey, timerId);
        }
    }

    /**
     * Determina el lapso de repetición del loop según el tipo de tono
     */
    private getLoopIntervalMs(defaultTone: string): number {
        switch (defaultTone) {
            case 'sos_siren':
                return 1500;
            case 'alert_loop':
                return 1300;
            default:
                return 1600;
        }
    }

    /**
     * Ejecuta los patrones sonoros según la categoría y el identificador de tono
     */
    private executeTonePattern(defaultTone: string, volume: number): void {
        const ctx = this.getAudioContext();
        if (!ctx) return;

        if (ctx.state === 'suspended') {
            ctx.resume().catch(() => {});
        }

        const now = ctx.currentTime;
        const baseGain = Math.max(0.0001, volume * 0.35);

        switch (defaultTone) {
            // === PATRONES DE ALERTA Y NOTIFICACIÓN ===
            case 'alert_loop': {
                // Doble pulso de alerta llamativo (880Hz -> 1046.5Hz)
                this.playToneSequence(
                    [
                        { freq: 880, dur: 0.12, gap: 0.05, type: 'sine' },
                        { freq: 1046.5, dur: 0.16, gap: 0.0, type: 'sine' }
                    ],
                    baseGain
                );
                break;
            }

            case 'sos_siren': {
                // Sirena modulada de alta emergencia (barrido oscilante continuo)
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();

                osc.type = 'sawtooth';
                gain.gain.setValueAtTime(0.0001, now);
                gain.gain.linearRampToValueAtTime(baseGain * 0.8, now + 0.05);
                gain.gain.setValueAtTime(baseGain * 0.8, now + 0.85);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.1);

                // Modulación de frecuencia en onda de subida y bajada
                osc.frequency.setValueAtTime(650, now);
                osc.frequency.linearRampToValueAtTime(1150, now + 0.3);
                osc.frequency.linearRampToValueAtTime(650, now + 0.6);
                osc.frequency.linearRampToValueAtTime(1150, now + 0.9);
                osc.frequency.linearRampToValueAtTime(650, now + 1.1);

                osc.connect(gain);
                gain.connect(ctx.destination);

                osc.start(now);
                osc.stop(now + 1.15);
                break;
            }

            case 'chat_pop': {
                // Pop de burbuja ascendente y muy ágil (400Hz -> 880Hz en 80ms)
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();

                osc.type = 'sine';
                osc.frequency.setValueAtTime(380, now);
                osc.frequency.exponentialRampToValueAtTime(920, now + 0.08);

                gain.gain.setValueAtTime(0.0001, now);
                gain.gain.linearRampToValueAtTime(baseGain, now + 0.01);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);

                osc.connect(gain);
                gain.connect(ctx.destination);

                osc.start(now);
                osc.stop(now + 0.12);
                break;
            }

            case 'ticket_bell': {
                // Campana cristalina de soporte con resonancia armónica (Mi6 1318Hz + armónico 2637Hz)
                this.playBellTone(1318.5, 2637.0, 0.45, baseGain);
                break;
            }

            case 'push_chime': {
                // Timbre corto de doble nota ascendente (Sol5 784Hz -> Do6 1046.5Hz)
                this.playToneSequence(
                    [
                        { freq: 783.99, dur: 0.09, gap: 0.02, type: 'triangle' },
                        { freq: 1046.5, dur: 0.22, gap: 0.0, type: 'sine' }
                    ],
                    baseGain
                );
                break;
            }

            // === PATRONES DE CICLO (TRANSICIONES Y ESTADOS) ===
            case 'cycle_accept': {
                // Acorde suave de confirmación (Do5 523Hz + Mi5 659Hz)
                this.playHarmonicChord([523.25, 659.25], 0.32, baseGain * 0.9);
                break;
            }

            case 'cycle_ready': {
                // Arpegio de aviso listo (Sol4 392Hz -> Do5 523Hz -> Mi5 659Hz)
                this.playToneSequence(
                    [
                        { freq: 392.0, dur: 0.08, gap: 0.02, type: 'sine' },
                        { freq: 523.25, dur: 0.08, gap: 0.02, type: 'sine' },
                        { freq: 659.25, dur: 0.24, gap: 0.0, type: 'sine' }
                    ],
                    baseGain
                );
                break;
            }

            case 'cycle_driver': {
                // Notificación de conductor asignado (La4 440Hz -> Mi5 659Hz)
                this.playToneSequence(
                    [
                        { freq: 440.0, dur: 0.1, gap: 0.03, type: 'sine' },
                        { freq: 659.25, dur: 0.22, gap: 0.0, type: 'triangle' }
                    ],
                    baseGain
                );
                break;
            }

            case 'cycle_transit': {
                // Acorde en camino / viaje iniciado (Re5 587Hz -> La5 880Hz)
                this.playToneSequence(
                    [
                        { freq: 587.33, dur: 0.1, gap: 0.03, type: 'sine' },
                        { freq: 880.0, dur: 0.25, gap: 0.0, type: 'sine' }
                    ],
                    baseGain
                );
                break;
            }

            case 'cycle_arrived': {
                // Aviso de llegada con timbre brillante (Do5 -> Sol5 -> Do6)
                this.playToneSequence(
                    [
                        { freq: 523.25, dur: 0.1, gap: 0.03, type: 'sine' },
                        { freq: 783.99, dur: 0.1, gap: 0.03, type: 'sine' },
                        { freq: 1046.5, dur: 0.35, gap: 0.0, type: 'sine' }
                    ],
                    baseGain
                );
                break;
            }

            // === PATRONES DE PROCESO TERMINADO ===
            case 'done_success': {
                // Acorde triunfal de 4 notas ascendentes (Do5 -> Mi5 -> Sol5 -> Do6)
                this.playToneSequence(
                    [
                        { freq: 523.25, dur: 0.08, gap: 0.02, type: 'sine' },
                        { freq: 659.25, dur: 0.08, gap: 0.02, type: 'sine' },
                        { freq: 783.99, dur: 0.08, gap: 0.02, type: 'sine' },
                        { freq: 1046.5, dur: 0.38, gap: 0.0, type: 'sine' }
                    ],
                    baseGain
                );
                break;
            }

            case 'done_cash': {
                // Sonido característico de caja registradora / pago aprobado (campanilla metálica con ataque dual)
                this.playCashChime(baseGain);
                break;
            }

            default: {
                // Tono estándar armónico
                this.playToneSequence(
                    [{ freq: 660, dur: 0.2, gap: 0.0, type: 'sine' }],
                    baseGain
                );
                break;
            }
        }
    }

    /**
     * Utilidad para reproducir una secuencia de frecuencias consecutivas
     */
    private playToneSequence(
        notes: Array<{ freq: number; dur: number; gap: number; type: OscillatorType }>,
        targetGain: number
    ): void {
        const ctx = this.getAudioContext();
        if (!ctx) return;

        let offset = ctx.currentTime;

        notes.forEach((note) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = note.type;
            osc.frequency.setValueAtTime(note.freq, offset);

            gain.gain.setValueAtTime(0.0001, offset);
            gain.gain.linearRampToValueAtTime(targetGain, offset + 0.012);
            gain.gain.exponentialRampToValueAtTime(0.0001, offset + note.dur);

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start(offset);
            osc.stop(offset + note.dur + 0.02);

            offset += note.dur + note.gap;
        });
    }

    /**
     * Reproduce un acorde simultáneo de frecuencias
     */
    private playHarmonicChord(frequencies: number[], duration: number, targetGain: number): void {
        const ctx = this.getAudioContext();
        if (!ctx) return;

        const now = ctx.currentTime;
        const singleGain = targetGain / frequencies.length;

        frequencies.forEach((freq) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now);

            gain.gain.setValueAtTime(0.0001, now);
            gain.gain.linearRampToValueAtTime(singleGain, now + 0.015);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start(now);
            osc.stop(now + duration + 0.02);
        });
    }

    /**
     * Simula el timbre de una campana limpia con dos frecuencias resonantes
     */
    private playBellTone(fundamental: number, harmonic: number, duration: number, targetGain: number): void {
        const ctx = this.getAudioContext();
        if (!ctx) return;

        const now = ctx.currentTime;

        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(fundamental, now);

        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(harmonic, now);

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(targetGain, now + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + duration + 0.02);
        osc2.stop(now + duration + 0.02);
    }

    /**
     * Sonido brillante de caja registradora / pago aprobado ("ka-ching")
     */
    private playCashChime(targetGain: number): void {
        const ctx = this.getAudioContext();
        if (!ctx) return;

        const now = ctx.currentTime;

        // Golpe 1 (Ataque metálico inicial a los 0ms)
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain1 = ctx.createGain();

        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(1567.98, now); // Sol6

        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(2093.0, now); // Do7

        gain1.gain.setValueAtTime(0.0001, now);
        gain1.gain.linearRampToValueAtTime(targetGain * 0.8, now + 0.008);
        gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

        osc1.connect(gain1);
        osc2.connect(gain1);
        gain1.connect(ctx.destination);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.2);
        osc2.stop(now + 0.2);

        // Golpe 2 (Campanilla de culminación a los 90ms)
        const t2 = now + 0.09;
        const osc3 = ctx.createOscillator();
        const osc4 = ctx.createOscillator();
        const gain2 = ctx.createGain();

        osc3.type = 'sine';
        osc3.frequency.setValueAtTime(2093.0, t2); // Do7
        osc4.type = 'sine';
        osc4.frequency.setValueAtTime(3135.96, t2); // Sol7 (Armónico superior)

        gain2.gain.setValueAtTime(0.0001, t2);
        gain2.gain.linearRampToValueAtTime(targetGain, t2 + 0.008);
        gain2.gain.exponentialRampToValueAtTime(0.0001, t2 + 0.45);

        osc3.connect(gain2);
        osc4.connect(gain2);
        gain2.connect(ctx.destination);

        osc3.start(t2);
        osc4.start(t2);
        osc3.stop(t2 + 0.48);
        osc4.stop(t2 + 0.48);
    }

    // =========================================================================
    // 5. MÉTODOS PÚBLICOS DEL SINGLETON
    // =========================================================================

    /**
     * Reproduce el sonido asociado a un evento:
     * - Si tiene archivo de audio en Supabase Storage precargado, lo reproduce con 0ms de latencia.
     * - Si no tiene archivo o la reproducción falla por red, ejecuta el sintetizador de respaldo.
     * - Respeta `is_enabled`, `volume` e `is_loop`.
     */
    public async play(eventKey: SoundEventKey): Promise<void> {
        if (!this.isInitialized) {
            await this.initialize();
        }

        const setting = this.settingsMap.get(eventKey);

        // Si el evento está explícitamente deshabilitado, omitir
        if (setting && setting.is_enabled === false) {
            return;
        }

        const volume = setting ? Math.max(0, Math.min(1, setting.volume ?? 1.0)) : 1.0;
        const isLoop = setting ? Boolean(setting.is_loop) : false;
        const defaultTone = setting ? setting.default_tone : 'alert_loop';

        // Intento 1: Reproducir elemento HTMLAudioElement precargado
        const cachedAudio = this.audioCache.get(eventKey);
        if (cachedAudio && setting?.audio_url && setting.audio_url.trim() !== '') {
            try {
                await this.unlockAudio();
                cachedAudio.currentTime = 0;
                cachedAudio.volume = volume;
                cachedAudio.loop = isLoop;
                await cachedAudio.play();
                return;
            } catch (err) {
                console.warn(
                    `[SoundEngine] Falló la reproducción del archivo remoto para "${eventKey}". Conmutando al sintetizador:`,
                    err
                );
            }
        }

        // Intento 2: Sintetizador Web Audio API autónomo
        this.playSynthesizedTone(defaultTone, volume, isLoop, eventKey);
    }

    /**
     * Detiene inmediatamente la reproducción del sonido asociado al evento:
     * - Pausa y reinicia (`currentTime = 0`) el elemento `HTMLAudioElement`.
     * - Limpia cualquier intervalo de repetición en bucle activo.
     */
    public stop(eventKey: SoundEventKey): void {
        // Pausar elemento de audio HTML
        const cachedAudio = this.audioCache.get(eventKey);
        if (cachedAudio) {
            try {
                cachedAudio.pause();
                cachedAudio.currentTime = 0;
            } catch (e) {}
        }

        // Limpiar timer de loop sintetizado
        if (this.activeLoopTimers.has(eventKey)) {
            clearInterval(this.activeLoopTimers.get(eventKey));
            this.activeLoopTimers.delete(eventKey);
        }
    }

    /**
     * Detiene de inmediato TODOS los sonidos en bucle activos en la aplicación.
     * Esencial cuando el cajero o administrador atiende una alerta entrante o emergencia.
     */
    public stopAllLoops(): void {
        // Detener audios en caché que estén en loop o reproduciéndose
        this.audioCache.forEach((audio) => {
            try {
                audio.pause();
                audio.currentTime = 0;
            } catch (e) {}
        });

        // Limpiar todos los intervalos sintetizados
        this.activeLoopTimers.forEach((timerId) => {
            clearInterval(timerId);
        });
        this.activeLoopTimers.clear();
    }

    /**
     * Permite probar en vivo desde el CPanel cualquier audio o tono sintetizado:
     * - Se ejecuta sin importar si el sonido está habilitado o deshabilitado globalmente.
     * - Es de reproducción puntual (no queda en bucle).
     */
    public async previewSetting(setting: Partial<AppSoundSetting>): Promise<void> {
        await this.unlockAudio();

        const volume = Math.max(0, Math.min(1, setting.volume ?? 1.0));
        const defaultTone = setting.default_tone || 'alert_loop';

        // Si se provee una URL de audio válida, intentar reproducirla
        if (setting.audio_url && setting.audio_url.trim() !== '') {
            try {
                const previewAudio = new Audio(setting.audio_url.trim());
                previewAudio.volume = volume;
                previewAudio.loop = false;
                await previewAudio.play();
                return;
            } catch (err) {
                console.warn('[SoundEngine] No se pudo previsualizar la URL de audio. Sonará el tono sintetizado:', err);
            }
        }

        // Respaldo en sintetizador
        this.playSynthesizedTone(defaultTone, volume, false);
    }

    /**
     * Retorna la lista completa de configuraciones en memoria
     */
    public getSettings(): AppSoundSetting[] {
        return Array.from(this.settingsMap.values());
    }

    /**
     * Retorna la configuración de un evento específico
     */
    public getSetting(eventKey: SoundEventKey): AppSoundSetting | undefined {
        return this.settingsMap.get(eventKey);
    }

    /**
     * Indica si el audio ya fue desbloqueado por interacción del usuario
     */
    public isUnlocked(): boolean {
        return this.isAudioUnlocked;
    }
}

/**
 * Instancia Singleton exportada para uso global
 */
export const soundEngine = SoundEngine.getInstance();
