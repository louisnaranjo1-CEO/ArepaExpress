import React, { useState, useEffect, useRef } from 'react';
import { 
    Volume2, 
    VolumeX, 
    Play, 
    Square, 
    UploadCloud, 
    RotateCcw, 
    Bell, 
    RefreshCw, 
    CheckCircle2, 
    Flame, 
    MessageSquare, 
    LifeBuoy, 
    Megaphone, 
    Clock, 
    Truck, 
    Car, 
    DollarSign, 
    Store, 
    ShieldCheck, 
    Sliders, 
    Sparkles,
    Music,
    AlertCircle,
    Check
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { soundEngine, AppSoundSetting, SoundCategory, SoundEventKey, DefaultTone } from '../../lib/soundEngine';
import toast from 'react-hot-toast';

const AVAILABLE_TONES: { id: DefaultTone; label: string; desc: string }[] = [
    { id: 'alert_loop', label: 'Alerta Continua (Doble Pulso)', desc: 'Beep dual de alta atención para órdenes y viajes' },
    { id: 'sos_siren', label: 'Sirena SOS (Emergencia)', desc: 'Sirena oscilante modulada para auxilio y pánico' },
    { id: 'chat_pop', label: 'Pop de Burbuja (Chat)', desc: 'Tono ágil y limpio para mensajes instantáneos' },
    { id: 'ticket_bell', label: 'Campana Cristalina (Soporte)', desc: 'Campanilla de doble armónico para reportes' },
    { id: 'push_chime', label: 'Chime de Notificación (Push)', desc: 'Doble nota ascendente armónica y suave' },
    { id: 'cycle_accept', label: 'Ciclo: Aceptación / Cocina', desc: 'Acorde suave y cálido de confirmación' },
    { id: 'cycle_ready', label: 'Ciclo: Pedido Listo', desc: 'Arpegio de 3 notas de aviso de despacho' },
    { id: 'cycle_driver', label: 'Ciclo: Conductor Asignado', desc: 'Chime de enlace de piloto o repartidor' },
    { id: 'cycle_transit', label: 'Ciclo: En Camino / Tránsito', desc: 'Tono armónico de vehículo en marcha' },
    { id: 'cycle_arrived', label: 'Ciclo: Llegó a Destino', desc: 'Aviso sonoro de vehículo en puerta' },
    { id: 'done_success', label: 'Terminado: Éxito / Entrega', desc: 'Arpegio mayor triunfal de servicio finalizado' },
    { id: 'done_cash', label: 'Terminado: Caja / Pago Aprobado', desc: 'Campanilla metálica estilo caja registradora' },
];

export default function SoundsManager() {
    const [settings, setSettings] = useState<AppSoundSetting[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [activeTab, setActiveTab] = useState<SoundCategory>('notification');
    const [playingEventKey, setPlayingEventKey] = useState<string | null>(null);
    const [uploadingKey, setUploadingKey] = useState<string | null>(null);
    const [isRealtimeConnected, setIsRealtimeConnected] = useState<boolean>(true);

    const fileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

    // Cargar configuraciones al montar
    useEffect(() => {
        loadSettings();

        // Suscripción Realtime a cambios locales o de otros administradores
        const channel = supabase
            .channel('sounds_manager_ui_sync')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'app_sound_settings' },
                () => {
                    loadSettings(false);
                }
            )
            .subscribe((status) => {
                setIsRealtimeConnected(status === 'SUBSCRIBED');
            });

        return () => {
            supabase.removeChannel(channel);
            soundEngine.stopAllLoops();
        };
    }, []);

    const loadSettings = async (showLoading: boolean = true) => {
        if (showLoading) setLoading(true);
        try {
            const { data, error } = await supabase
                .from('app_sound_settings')
                .select('*')
                .order('category')
                .order('event_key');

            if (error) throw error;
            if (data) {
                setSettings(data as AppSoundSetting[]);
            }
        } catch (err: any) {
            console.error('Error cargando configuraciones de sonido:', err);
            toast.error('No se pudieron cargar los sonidos: ' + (err.message || 'Error de base de datos'));
        } finally {
            if (showLoading) setLoading(false);
        }
    };

    // Actualizar campo de configuración con guardado inmediato en Supabase
    const handleUpdateField = async (
        eventKey: string,
        updates: Partial<AppSoundSetting>,
        successMessage?: string
    ) => {
        // Actualización optimista en memoria
        setSettings((prev) =>
            prev.map((item) => (item.event_key === eventKey ? { ...item, ...updates } : item))
        );

        try {
            const { error } = await supabase
                .from('app_sound_settings')
                .update({
                    ...updates,
                    updated_at: new Date().toISOString()
                })
                .eq('event_key', eventKey);

            if (error) throw error;

            if (successMessage) {
                toast.success(successMessage);
            }

            // Sincronizar el motor local de audio
            await soundEngine.refreshSettings();
        } catch (err: any) {
            console.error(`Error actualizando ${eventKey}:`, err);
            toast.error('Error al guardar: ' + (err.message || 'Error de base de datos'));
            // Revertir a datos de base de datos
            loadSettings(false);
        }
    };

    // Subida de archivo de audio personalizado a Supabase Storage
    const handleFileUpload = async (eventKey: string, file: File) => {
        if (!file) return;

        // Validar tamaño máximo: 2MB
        const maxSizeBytes = 2 * 1024 * 1024;
        if (file.size > maxSizeBytes) {
            toast.error('El archivo es demasiado grande. El límite máximo es de 2 MB.');
            return;
        }

        // Validar extensión
        const allowedExtensions = ['mp3', 'wav', 'ogg', 'm4a', 'webm'];
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        if (!allowedExtensions.includes(ext)) {
            toast.error('Formato no soportado. Usa archivos .mp3, .wav, .ogg o .m4a');
            return;
        }

        setUploadingKey(eventKey);
        const toastId = toast.loading('Subiendo archivo de audio...');

        try {
            const fileName = `custom/${eventKey}_${Date.now()}.${ext}`;

            // Subir al bucket 'system-sounds'
            const { error: uploadError } = await supabase.storage
                .from('system-sounds')
                .upload(fileName, file, {
                    cacheControl: '3600',
                    upsert: true
                });

            if (uploadError) throw uploadError;

            // Obtener la URL pública
            const { data: urlData } = supabase.storage
                .from('system-sounds')
                .getPublicUrl(fileName);

            const publicUrl = urlData.publicUrl;

            // Actualizar la tabla app_sound_settings
            await handleUpdateField(
                eventKey,
                { audio_url: publicUrl },
                '¡Audio personalizado guardado y activado!'
            );

            toast.success('Sonido personalizado listo para usar', { id: toastId });
        } catch (err: any) {
            console.error('Error subiendo audio:', err);
            toast.error('Error subiendo audio: ' + (err.message || 'Error de red'), { id: toastId });
        } finally {
            setUploadingKey(null);
            // Limpiar input file
            if (fileInputRefs.current[eventKey]) {
                fileInputRefs.current[eventKey]!.value = '';
            }
        }
    };

    // Restaurar a tono sintetizado de respaldo (limpiar audio_url)
    const handleRestoreDefault = async (eventKey: string) => {
        if (!window.confirm('¿Deseas restaurar este evento a su tono nativo del sistema?')) {
            return;
        }

        await handleUpdateField(
            eventKey,
            { audio_url: null },
            'Restaurado al tono nativo del sistema'
        );
    };

    // Previsualizar sonido en vivo
    const handlePreviewSound = async (setting: AppSoundSetting) => {
        if (playingEventKey === setting.event_key) {
            // Si ya está sonando, detener
            soundEngine.stop(setting.event_key);
            soundEngine.stopAllLoops();
            setPlayingEventKey(null);
            return;
        }

        setPlayingEventKey(setting.event_key);
        try {
            await soundEngine.previewSetting(setting);
            // Si no es un bucle continuo largo, auto-apagar el estado de 'playing' tras 2.2 segundos
            setTimeout(() => {
                setPlayingEventKey((current) => (current === setting.event_key ? null : current));
            }, 2200);
        } catch (e) {
            console.warn('Error en preview de sonido:', e);
            setPlayingEventKey(null);
        }
    };

    // Detener todas las alarmas activas
    const handleStopAll = () => {
        soundEngine.stopAllLoops();
        setPlayingEventKey(null);
        toast('Todos los sonidos y loops han sido detenidos', { icon: '🔇' });
    };

    // Filtrar por categoría actual
    const filteredSettings = settings.filter((s) => s.category === activeTab);

    // Contadores por categoría
    const notifCount = settings.filter((s) => s.category === 'notification').length;
    const cycleCount = settings.filter((s) => s.category === 'cycle_update').length;
    const doneCount = settings.filter((s) => s.category === 'process_completed').length;

    // Obtener ícono temático según el evento
    const getEventIcon = (eventKey: string) => {
        if (eventKey.includes('order')) return Store;
        if (eventKey.includes('chat')) return MessageSquare;
        if (eventKey.includes('emergency') || eventKey.includes('sos')) return Flame;
        if (eventKey.includes('support')) return LifeBuoy;
        if (eventKey.includes('push')) return Megaphone;
        if (eventKey.includes('driver')) return Truck;
        if (eventKey.includes('ride')) return Car;
        if (eventKey.includes('payment') || eventKey.includes('cashier')) return DollarSign;
        return Bell;
    };

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-16 animate-in fade-in duration-300">
            {/* Header del Centro de Sonidos */}
            <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 rounded-[2.5rem] p-6 lg:p-8 text-white shadow-xl relative overflow-hidden border border-slate-700/50">
                <div className="absolute right-0 top-0 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>

                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="space-y-2">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-2xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary shadow-lg shadow-primary/20">
                                <Volume2 className="w-6 h-6" />
                            </div>
                            <div>
                                <h1 className="text-2xl lg:text-3xl font-black tracking-tight">Centro de Sonidos y Alertas Acústicas</h1>
                                <p className="text-xs lg:text-sm text-slate-300 font-medium">
                                    Control global en tiempo real de timbres, alertas continuas, sintetizador y audio personalizado.
                                </p>
                            </div>
                        </div>

                        {/* Indicadores de estado */}
                        <div className="flex flex-wrap items-center gap-2 pt-2">
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                <span className={`w-2 h-2 rounded-full ${isRealtimeConnected ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'}`}></span>
                                {isRealtimeConnected ? 'Supabase Realtime Conectado' : 'Conectando Realtime...'}
                            </span>
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black bg-white/10 text-slate-200 border border-white/10">
                                <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                                {settings.length} Eventos Acústicos Registrados
                            </span>
                        </div>
                    </div>

                    {/* Botones de acción superior */}
                    <div className="flex items-center gap-3 shrink-0">
                        <button
                            onClick={handleStopAll}
                            className="flex items-center gap-2 px-4 py-3 bg-red-500/20 hover:bg-red-500/30 text-red-300 hover:text-white rounded-2xl text-xs font-black transition-all border border-red-500/30 active:scale-95 shadow-sm"
                            title="Detener de inmediato todos los sonidos y bucles activos"
                        >
                            <VolumeX className="w-4 h-4 text-red-400" />
                            <span>Detener Sonidos Activos</span>
                        </button>

                        <button
                            onClick={() => loadSettings(true)}
                            className="p-3 bg-white/10 hover:bg-white/20 text-white rounded-2xl transition-all border border-white/10 active:scale-95"
                            title="Recargar configuración desde Supabase"
                        >
                            <RefreshCw className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Pestañas de Categoría */}
            <div className="flex items-center gap-2 p-1.5 bg-slate-200/70 rounded-2xl overflow-x-auto custom-scrollbar border border-slate-300/60 shadow-xs">
                <button
                    onClick={() => setActiveTab('notification')}
                    className={`flex items-center gap-2 px-5 py-3 rounded-xl font-black text-xs transition-all shrink-0 ${
                        activeTab === 'notification'
                            ? 'bg-white text-slate-900 shadow-md shadow-slate-900/5'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                    }`}
                >
                    <Bell className="w-4 h-4 text-amber-500" />
                    <span>1. Notificaciones</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] ${
                        activeTab === 'notification' ? 'bg-amber-100 text-amber-800' : 'bg-slate-300 text-slate-700'
                    }`}>
                        {notifCount}
                    </span>
                </button>

                <button
                    onClick={() => setActiveTab('cycle_update')}
                    className={`flex items-center gap-2 px-5 py-3 rounded-xl font-black text-xs transition-all shrink-0 ${
                        activeTab === 'cycle_update'
                            ? 'bg-white text-slate-900 shadow-md shadow-slate-900/5'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                    }`}
                >
                    <RefreshCw className="w-4 h-4 text-blue-500" />
                    <span>2. Actualizaciones de Ciclos</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] ${
                        activeTab === 'cycle_update' ? 'bg-blue-100 text-blue-800' : 'bg-slate-300 text-slate-700'
                    }`}>
                        {cycleCount}
                    </span>
                </button>

                <button
                    onClick={() => setActiveTab('process_completed')}
                    className={`flex items-center gap-2 px-5 py-3 rounded-xl font-black text-xs transition-all shrink-0 ${
                        activeTab === 'process_completed'
                            ? 'bg-white text-slate-900 shadow-md shadow-slate-900/5'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                    }`}
                >
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <span>3. Procesos Terminados</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] ${
                        activeTab === 'process_completed' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-300 text-slate-700'
                    }`}>
                        {doneCount}
                    </span>
                </button>
            </div>

            {/* Listado de Tarjetas */}
            {loading ? (
                <div className="flex flex-col items-center justify-center p-16 bg-white rounded-[2rem] border border-slate-200 shadow-xs">
                    <RefreshCw className="w-8 h-8 text-primary animate-spin mb-3" />
                    <p className="text-sm font-bold text-slate-500">Cargando eventos de audio desde Supabase...</p>
                </div>
            ) : filteredSettings.length === 0 ? (
                <div className="text-center p-16 bg-white rounded-[2rem] border border-slate-200">
                    <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <h3 className="font-black text-slate-700">No hay sonidos configurados en esta categoría</h3>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    {filteredSettings.map((setting) => {
                        const IconComponent = getEventIcon(setting.event_key);
                        const isPlaying = playingEventKey === setting.event_key;
                        const isUploading = uploadingKey === setting.event_key;
                        const hasCustomAudio = Boolean(setting.audio_url && setting.audio_url.trim() !== '');

                        return (
                            <div
                                key={setting.id || setting.event_key}
                                className={`rounded-[2rem] p-5 lg:p-6 transition-all border ${
                                    setting.is_enabled
                                        ? 'bg-white border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300'
                                        : 'bg-slate-50/80 border-slate-200/60 opacity-75'
                                }`}
                            >
                                {/* Encabezado de la Tarjeta */}
                                <div className="flex items-start justify-between gap-4 mb-4">
                                    <div className="flex items-start gap-3.5">
                                        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border ${
                                            setting.is_enabled
                                                ? 'bg-primary/10 text-slate-900 border-primary/20'
                                                : 'bg-slate-200 text-slate-400 border-slate-300'
                                        }`}>
                                            <IconComponent className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h3 className="text-base font-black text-slate-900 leading-tight">
                                                    {setting.label}
                                                </h3>
                                                {setting.is_loop && (
                                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-50 text-rose-600 border border-rose-200 animate-pulse">
                                                        Bucle Continuo
                                                    </span>
                                                )}
                                            </div>
                                            <span className="font-mono text-[11px] font-bold text-slate-400">
                                                {setting.event_key}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Switch Activo / Inactivo */}
                                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                                        <input
                                            type="checkbox"
                                            checked={setting.is_enabled}
                                            onChange={(e) =>
                                                handleUpdateField(
                                                    setting.event_key,
                                                    { is_enabled: e.target.checked },
                                                    e.target.checked ? 'Sonido activado' : 'Sonido silenciado'
                                                )
                                            }
                                            className="sr-only peer"
                                        />
                                        <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                                    </label>
                                </div>

                                {/* Descripción */}
                                <p className="text-xs text-slate-500 mb-5 leading-relaxed">
                                    {setting.description || 'Dispara una alerta sonora durante este ciclo de la plataforma.'}
                                </p>

                                {/* Badge de Estado del Audio Actual */}
                                <div className="mb-5 p-3 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                                            hasCustomAudio ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-700'
                                        }`}>
                                            <Music className="w-4 h-4" />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-1.5">
                                                <span className={`text-[11px] font-black px-2 py-0.5 rounded-full ${
                                                    hasCustomAudio
                                                        ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                                                        : 'bg-slate-200 text-slate-800 border border-slate-300'
                                                }`}>
                                                    {hasCustomAudio ? 'Audio Personalizado (Storage)' : 'Tono Sintetizado Nativo'}
                                                </span>
                                            </div>
                                            <p className="text-[11px] font-bold text-slate-500 truncate mt-0.5">
                                                {hasCustomAudio
                                                    ? setting.audio_url?.split('/').pop() || 'Archivo remoto cargado'
                                                    : `Sintetizador: ${setting.default_tone}`}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Si tiene custom audio, botón para restaurar al default */}
                                    {hasCustomAudio && (
                                        <button
                                            onClick={() => handleRestoreDefault(setting.event_key)}
                                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                                            title="Eliminar audio personalizado y volver al tono sintetizado"
                                        >
                                            <RotateCcw className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>

                                {/* Controles: Volumen y Modo Bucle */}
                                <div className="space-y-4 mb-5 pt-1 border-t border-slate-100">
                                    {/* Slider de Volumen */}
                                    <div>
                                        <div className="flex items-center justify-between text-xs font-bold text-slate-700 mb-1.5">
                                            <span className="flex items-center gap-1.5">
                                                <Sliders className="w-3.5 h-3.5 text-slate-400" />
                                                Volumen de Reproducción
                                            </span>
                                            <span className="font-mono font-black text-slate-900">
                                                {Math.round((setting.volume ?? 1.0) * 100)}%
                                            </span>
                                        </div>
                                        <input
                                            type="range"
                                            min="0"
                                            max="1"
                                            step="0.05"
                                            value={setting.volume ?? 1.0}
                                            onChange={(e) => {
                                                const newVol = parseFloat(e.target.value);
                                                setSettings((prev) =>
                                                    prev.map((item) =>
                                                        item.event_key === setting.event_key
                                                            ? { ...item, volume: newVol }
                                                            : item
                                                    )
                                                );
                                            }}
                                            onMouseUp={(e) => {
                                                const newVol = parseFloat((e.target as HTMLInputElement).value);
                                                handleUpdateField(setting.event_key, { volume: newVol });
                                            }}
                                            onTouchEnd={(e) => {
                                                const newVol = parseFloat((e.target as HTMLInputElement).value);
                                                handleUpdateField(setting.event_key, { volume: newVol });
                                            }}
                                            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-primary"
                                        />
                                    </div>

                                    {/* Switch Modo Bucle (Repetir continuamente) */}
                                    <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50/70 border border-slate-200/60">
                                        <div className="pr-3">
                                            <span className="text-xs font-black text-slate-800 block leading-tight">
                                                Repetir en Bucle Continuo
                                            </span>
                                            <span className="text-[11px] text-slate-400 font-medium leading-tight">
                                                El sonido se repetirá periódicamente hasta que el personal atienda el pedido o alerta.
                                            </span>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer shrink-0">
                                            <input
                                                type="checkbox"
                                                checked={setting.is_loop}
                                                onChange={(e) =>
                                                    handleUpdateField(
                                                        setting.event_key,
                                                        { is_loop: e.target.checked },
                                                        e.target.checked ? 'Repetición en bucle activada' : 'Repetición desactivada'
                                                    )
                                                }
                                                className="sr-only peer"
                                            />
                                            <div className="w-10 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                                        </label>
                                    </div>

                                    {/* Selector de Tono Sintetizado de Respaldo */}
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 mb-1.5">
                                            Tono Sintetizado de Respaldo
                                        </label>
                                        <select
                                            value={setting.default_tone}
                                            onChange={(e) =>
                                                handleUpdateField(
                                                    setting.event_key,
                                                    { default_tone: e.target.value as DefaultTone },
                                                    'Tono de respaldo actualizado'
                                                )
                                            }
                                            className="w-full text-xs font-bold bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                                        >
                                            {AVAILABLE_TONES.map((tone) => (
                                                <option key={tone.id} value={tone.id}>
                                                    {tone.label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {/* Botones de Acción: Probar y Subir Sonido */}
                                <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                                    {/* Botón Probar Sonido */}
                                    <button
                                        onClick={() => handlePreviewSound(setting)}
                                        className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-black transition-all active:scale-95 ${
                                            isPlaying
                                                ? 'bg-rose-500 text-white shadow-md shadow-rose-500/20'
                                                : 'bg-slate-900 text-white hover:bg-slate-800 shadow-md shadow-slate-900/10'
                                        }`}
                                    >
                                        {isPlaying ? (
                                            <>
                                                <Square className="w-3.5 h-3.5 fill-current" />
                                                <span>Detener Prueba</span>
                                            </>
                                        ) : (
                                            <>
                                                <Play className="w-3.5 h-3.5 fill-current" />
                                                <span>Probar Sonido</span>
                                            </>
                                        )}
                                    </button>

                                    {/* Input file oculto */}
                                    <input
                                        type="file"
                                        ref={(el) => (fileInputRefs.current[setting.event_key] = el)}
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) handleFileUpload(setting.event_key, file);
                                        }}
                                        accept=".mp3,.wav,.ogg,.m4a,audio/*"
                                        className="hidden"
                                    />

                                    {/* Botón Subir Archivo */}
                                    <button
                                        disabled={isUploading}
                                        onClick={() => fileInputRefs.current[setting.event_key]?.click()}
                                        className="flex items-center justify-center gap-2 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-black transition-all border border-slate-200 active:scale-95 disabled:opacity-50"
                                        title="Subir un archivo MP3, WAV o OGG (máx 2MB)"
                                    >
                                        {isUploading ? (
                                            <RefreshCw className="w-4 h-4 animate-spin text-primary" />
                                        ) : (
                                            <UploadCloud className="w-4 h-4 text-slate-600" />
                                        )}
                                        <span className="hidden sm:inline">
                                            {isUploading ? 'Subiendo...' : 'Subir Sonido'}
                                        </span>
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
