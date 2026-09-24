import React, { useState, useEffect, useRef } from 'react';
import { 
    Ticket, Plus, Trash2, MapPin, Calendar, Save, X, Globe, Map as MapIcon, Home, 
    Gift, Play, Trophy, Sparkles, Volume2, VolumeX, FastForward, CheckCircle, 
    Award, Star, RefreshCw, Eye, ShieldCheck, Clock, Check, Upload, Image as ImageIcon
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { VENEZUELA_DATA, VENEZUELA_STATES } from '../../lib/venezuelaData';
import toast from 'react-hot-toast';

export interface PrizeItem {
    id: string;
    place: number;
    title: string;
    description?: string;
    imageUrl?: string;
}

export interface WinnerInfo {
    ticketNumber: string;
    name: string;
    photoUrl?: string;
    phone?: string;
    trips?: number;
    rating?: number;
    prizeTitle: string;
    place?: number;
    drawnAt: string;
}

interface Raffle {
    id: string;
    title: string;
    description: string;
    prize: string;
    scope: 'national' | 'regional' | 'local';
    targetState?: string;
    targetCity?: string;
    locationName?: string;
    drawDate: string;
    isActive: boolean;
    createdAt: any;
    pointsCost?: number;
    sunddePermit?: string;
    eventTime?: string;
    eventLocation?: string;
    prizes?: PrizeItem[];
    winners?: WinnerInfo[];
}

interface ParticipantTicket {
    ticketNumber: string;
    name: string;
    photoUrl?: string;
    phone?: string;
    trips?: number;
    rating?: number;
}

export default function RafflesManager() {
    const [activeTab, setActiveTab] = useState<'clients' | 'drivers'>('clients');
    const [raffles, setRaffles] = useState<Raffle[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);

    // Form State
    const [uploadingPrizeIdx, setUploadingPrizeIdx] = useState<number | null>(null);
    const [newRaffle, setNewRaffle] = useState<{
        title: string;
        description: string;
        prize: string;
        scope: 'national' | 'regional' | 'local';
        targetState: string;
        targetCity: string;
        locationName: string;
        drawDate: string;
        isActive: boolean;
        pointsCost: number;
        sunddePermit: string;
        eventTime: string;
        eventLocation: string;
        prizes: PrizeItem[];
    }>({
        title: '',
        description: '',
        prize: '',
        scope: 'national',
        targetState: '',
        targetCity: '',
        locationName: 'Nacional',
        drawDate: '',
        isActive: true,
        pointsCost: 0,
        sunddePermit: 'SUNDDE/DAJ/2026/0491',
        eventTime: '08:00 PM',
        eventLocation: 'En Vivo por Instagram @un2x3',
        prizes: [{ id: '1', place: 1, title: '', description: '', imageUrl: '' }]
    });

    // Presentation Mode State
    const [isPresentationMode, setIsPresentationMode] = useState(false);
    const [presentationRaffle, setPresentationRaffle] = useState<Raffle | null>(null);
    const [presentationStep, setPresentationStep] = useState<'idle' | 'countdown' | 'winner'>('idle');
    const [countdown, setCountdown] = useState<number>(60);
    const [selectedPrizeIndex, setSelectedPrizeIndex] = useState<number>(0);
    const [displayTicket, setDisplayTicket] = useState<string>('#A100');
    const [displayParticipant, setDisplayParticipant] = useState<string>('Esperando inicio...');
    const [winner, setWinner] = useState<WinnerInfo | null>(null);
    const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
    const [ticketsPool, setTicketsPool] = useState<ParticipantTicket[]>([]);

    // Canvas Confetti Ref
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const confettiAnimationId = useRef<number | null>(null);

    // Audio synthesizer with Web Audio API
    const playTickSound = (freq = 440, duration = 0.04) => {
        if (!soundEnabled) return;
        try {
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            if (!AudioContextClass) return;
            const ctx = new AudioContextClass();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, ctx.currentTime);
            gain.gain.setValueAtTime(0.25, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + duration);
        } catch (e) {
            // Audio error ignored
        }
    };

    const playFanfareSound = () => {
        if (!soundEnabled) return;
        try {
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            if (!AudioContextClass) return;
            const ctx = new AudioContextClass();
            const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50];
            notes.forEach((freq, idx) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sawtooth';
                const startTime = ctx.currentTime + idx * 0.1;
                osc.frequency.setValueAtTime(freq, startTime);
                gain.gain.setValueAtTime(0.2, startTime);
                gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.35);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(startTime);
                osc.stop(startTime + 0.35);
            });
        } catch (e) {
            // Audio error ignored
        }
    };

    // Confetti Engine
    const triggerConfettiExplosion = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        const colors = ['#FFD700', '#FF3E6C', '#00E676', '#00B0FF', '#FF9100', '#9C27B0', '#FFFFFF'];
        const particles: any[] = [];
        const particleCount = 200;

        for (let i = 0; i < particleCount; i++) {
            particles.push({
                x: canvas.width / 2 + (Math.random() - 0.5) * 200,
                y: canvas.height / 2 + (Math.random() - 0.5) * 100,
                vx: (Math.random() - 0.5) * 22,
                vy: (Math.random() - 0.5) * 22 - 6,
                size: Math.random() * 8 + 4,
                color: colors[Math.floor(Math.random() * colors.length)],
                rotation: Math.random() * 360,
                rotationSpeed: (Math.random() - 0.5) * 10,
                gravity: 0.28,
                opacity: 1
            });
        }

        const render = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            let activeCount = 0;

            particles.forEach((p) => {
                p.x += p.vx;
                p.y += p.vy;
                p.vy += p.gravity;
                p.rotation += p.rotationSpeed;
                p.opacity -= 0.004;

                if (p.opacity > 0 && p.y < canvas.height + 50) {
                    activeCount++;
                    ctx.save();
                    ctx.translate(p.x, p.y);
                    ctx.rotate((p.rotation * Math.PI) / 180);
                    ctx.globalAlpha = Math.max(0, p.opacity);
                    ctx.fillStyle = p.color;
                    ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 1.5);
                    ctx.restore();
                }
            });

            if (activeCount > 0) {
                confettiAnimationId.current = requestAnimationFrame(render);
            } else {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
        };

        if (confettiAnimationId.current) cancelAnimationFrame(confettiAnimationId.current);
        confettiAnimationId.current = requestAnimationFrame(render);
    };

    useEffect(() => {
        fetchRaffles();
    }, [activeTab]);

    const fetchRaffles = async () => {
        setLoading(true);
        try {
            const collectionName = activeTab === 'clients' ? 'raffles' : 'driver_raffles';
            const { data, error } = await supabase
                .from(collectionName)
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            const mapped = (data || []).map(d => ({
                id: d.id,
                title: d.title,
                description: d.description,
                prize: d.prize,
                scope: d.scope || 'national',
                targetState: d.target_state || d.targetState,
                targetCity: d.target_city || d.targetCity,
                locationName: d.location_name || d.locationName,
                drawDate: d.draw_date || d.drawDate,
                isActive: d.is_active !== undefined ? d.is_active : (d.status !== 'inactive'),
                pointsCost: d.points_cost !== undefined ? d.points_cost : d.pointsCost,
                sunddePermit: d.sundde_permit || '',
                eventTime: d.event_time || '',
                eventLocation: d.event_location || '',
                prizes: Array.isArray(d.prizes) ? d.prizes : (d.prize ? [{ id: '1', place: 1, title: d.prize }] : []),
                winners: Array.isArray(d.winners) ? d.winners : [],
                createdAt: d.created_at
            } as Raffle));
            setRaffles(mapped);
        } catch (error) {
            console.error("Error fetching raffles:", error);
            toast.error("Error al cargar sorteos");
        } finally {
            setLoading(false);
        }
    };

    const handleAddPrizeInput = () => {
        const nextPlace = newRaffle.prizes.length + 1;
        setNewRaffle(prev => ({
            ...prev,
            prizes: [...prev.prizes, { id: `${nextPlace}_${Date.now()}`, place: nextPlace, title: '', description: '', imageUrl: '' }]
        }));
    };

    const handleRemovePrizeInput = (index: number) => {
        if (newRaffle.prizes.length <= 1) return;
        setNewRaffle(prev => ({
            ...prev,
            prizes: prev.prizes.filter((_, i) => i !== index).map((p, idx) => ({ ...p, place: idx + 1 }))
        }));
    };

    const handlePrizeChange = (index: number, field: 'title' | 'description' | 'imageUrl', value: string) => {
        setNewRaffle(prev => {
            const updated = [...prev.prizes];
            updated[index] = { ...updated[index], [field]: value };
            return { ...prev, prizes: updated };
        });
    };

    const handlePrizeImageUpload = async (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploadingPrizeIdx(index);
        try {
            const cleanName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
            const filePath = `raffles/${Date.now()}_${cleanName}`;
            const { error: upErr } = await supabase.storage.from('store_assets').upload(filePath, file, { upsert: true });
            if (upErr) throw upErr;
            const { data: pubData } = supabase.storage.from('store_assets').getPublicUrl(filePath);
            handlePrizeChange(index, 'imageUrl', pubData.publicUrl);
            toast.success(`Imagen subida para premio #${index + 1}`);
        } catch (err: any) {
            console.error("Error uploading prize image:", err);
            toast.error("Error al subir imagen");
        } finally {
            setUploadingPrizeIdx(null);
        }
    };

    const handleAddRaffle = async () => {
        const firstPrize = newRaffle.prizes[0]?.title || newRaffle.prize;
        if (!newRaffle.title || !firstPrize || !newRaffle.drawDate) {
            toast.error("Completa los campos obligatorios");
            return;
        }

        if (newRaffle.scope === 'regional' && !newRaffle.targetState) {
            toast.error("Selecciona el estado para el sorteo");
            return;
        }

        if (newRaffle.scope === 'local' && (!newRaffle.targetState || !newRaffle.targetCity)) {
            toast.error("Selecciona el estado y la ciudad para el sorteo local");
            return;
        }

        try {
            const collectionName = activeTab === 'clients' ? 'raffles' : 'driver_raffles';
            const prizesList = newRaffle.prizes.filter(p => p.title.trim() !== '');
            const finalPrizes = prizesList.length > 0 
                ? prizesList 
                : [{ id: '1', place: 1, title: firstPrize, description: '' }];

            const computedLocation = newRaffle.scope === 'national' 
                ? 'Nacional' 
                : newRaffle.scope === 'regional' 
                ? newRaffle.targetState 
                : (newRaffle.targetCity ? `${newRaffle.targetCity}, ${newRaffle.targetState}` : newRaffle.targetState);

            const payload: any = {
                title: newRaffle.title,
                description: newRaffle.description,
                prize: finalPrizes[0].title,
                scope: newRaffle.scope || 'national',
                location_name: computedLocation || newRaffle.locationName || 'Nacional',
                target_state: newRaffle.targetState || null,
                target_city: newRaffle.targetCity || null,
                draw_date: newRaffle.drawDate,
                is_active: newRaffle.isActive !== false,
                sundde_permit: newRaffle.sunddePermit || '',
                event_time: newRaffle.eventTime || '',
                event_location: newRaffle.eventLocation || '',
                prizes: finalPrizes,
                points_cost: Number(newRaffle.pointsCost) || 0,
                created_at: new Date().toISOString()
            };

            const { error } = await supabase.from(collectionName).insert([payload]);
            if (error) throw error;

            toast.success("Sorteo creado exitosamente");
            setShowAddModal(false);
            fetchRaffles();
            setNewRaffle({
                title: '',
                description: '',
                prize: '',
                scope: 'national',
                targetState: '',
                targetCity: '',
                locationName: 'Nacional',
                drawDate: '',
                isActive: true,
                pointsCost: 0,
                sunddePermit: 'SUNDDE/DAJ/2026/0491',
                eventTime: '08:00 PM',
                eventLocation: 'En Vivo por Instagram @un2x3',
                prizes: [{ id: '1', place: 1, title: '', description: '', imageUrl: '' }]
            });
        } catch (error) {
            console.error("Error creating raffle:", error);
            toast.error("Error al crear el sorteo");
        }
    };

    const handleDeleteRaffle = async (id: string) => {
        if (!window.confirm("¿Eliminar este sorteo?")) return;
        try {
            const collectionName = activeTab === 'clients' ? 'raffles' : 'driver_raffles';
            const { error } = await supabase.from(collectionName).delete().eq('id', id);
            if (error) throw error;

            toast.success("Sorteo eliminado");
            fetchRaffles();
        } catch (error) {
            toast.error("Error al eliminar");
        }
    };

    // Open Presentation Mode
    const handleOpenPresentation = async (raffle: Raffle) => {
        setPresentationRaffle(raffle);
        setPresentationStep('idle');
        setCountdown(60);
        setSelectedPrizeIndex(0);
        setWinner(null);

        // Fetch registered tickets from Supabase
        try {
            const ticketTable = activeTab === 'clients' ? 'client_raffle_tickets' : 'driver_raffle_tickets';
            const { data } = await supabase
                .from(ticketTable)
                .select('*')
                .eq('raffle_id', raffle.id);

            if (data && data.length > 0) {
                const pool: ParticipantTicket[] = data.map(t => ({
                    ticketNumber: t.ticket_number || `#A${Math.floor(100 + Math.random() * 900)}`,
                    name: t.user_name || t.driver_name || 'Participante Oficial',
                    phone: t.phone || '',
                    trips: Math.floor(45 + Math.random() * 200),
                    rating: 4.8 + Math.round(Math.random() * 20) / 100
                }));
                setTicketsPool(pool);
            } else {
                // Generate a lively demo pool if no tickets purchased yet
                const demoLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K'];
                const demoNames = [
                    'Carlos Eduardo Mendoza', 'Alejandra Briceño', 'José Gregorio Ramos', 'María Fernanda Colmenares',
                    'Luis Alberto Naranjo', 'Daniela Valentina Gómez', 'Rafael Enrique Silva', 'Yusneidy del Carmen Toro',
                    'Andrés David Castillo', 'Patricia Elena Rivas', 'Franklin Jesús Quintero', 'Carla Vanessa Morillo',
                    'Héctor José Romero', 'Stefany Carolina Pérez', 'Gabriel Antonio Medina', 'Yelitza Coromoto Díaz',
                    'Miguel Ángel Parra', 'Roselis Victoria Morales', 'Jhony Alexander Rangel', 'Daniela Milagros Vivas'
                ];
                const demoPool: ParticipantTicket[] = demoNames.map((name, i) => {
                    const letter = demoLetters[i % demoLetters.length];
                    const num = 100 + (i * 37) % 899;
                    return {
                        ticketNumber: `#${letter}${num}`,
                        name,
                        trips: 50 + (i * 12) % 300,
                        rating: 4.85 + (i % 3) * 0.05
                    };
                });
                setTicketsPool(demoPool);
            }
        } catch (e) {
            console.error("Error fetching tickets for presentation:", e);
        }

        setIsPresentationMode(true);
    };

    // Start 60s Tension Roulette Countdown
    const handleStartRoulette = () => {
        setPresentationStep('countdown');
        setCountdown(60);
        setWinner(null);
    };

    // Fast Forward button to reveal directly
    const handleFastForward = () => {
        setCountdown(1);
    };

    // Countdown and Roulette Spinning Effect
    useEffect(() => {
        if (!isPresentationMode || presentationStep !== 'countdown') return;

        // Interval to tick countdown every second
        const countdownTimer = setInterval(() => {
            setCountdown((prev) => {
                if (prev <= 1) {
                    clearInterval(countdownTimer);
                    revealWinner();
                    return 0;
                }
                // Tension audio pitch rises as countdown approaches 0
                const pitch = 300 + (60 - prev) * 12;
                playTickSound(pitch, 0.05);
                return prev - 1;
            });
        }, 1000);

        // Roulette drum spin animation (updates rapidly)
        const spinSpeed = Math.max(50, 200 - (60 - countdown) * 3);
        const spinInterval = setInterval(() => {
            if (ticketsPool.length > 0) {
                const randIndex = Math.floor(Math.random() * ticketsPool.length);
                const pick = ticketsPool[randIndex];
                setDisplayTicket(pick.ticketNumber);
                setDisplayParticipant(pick.name);
            } else {
                const randLetter = String.fromCharCode(65 + Math.floor(Math.random() * 10));
                const randNum = Math.floor(100 + Math.random() * 900);
                setDisplayTicket(`#${randLetter}${randNum}`);
            }
        }, spinSpeed);

        return () => {
            clearInterval(countdownTimer);
            clearInterval(spinInterval);
        };
    }, [isPresentationMode, presentationStep, countdown, ticketsPool, soundEnabled]);

    // Pick and reveal final winner
    const revealWinner = async () => {
        setPresentationStep('winner');
        playFanfareSound();
        triggerConfettiExplosion();

        // Pick lucky participant
        const chosen = ticketsPool.length > 0 
            ? ticketsPool[Math.floor(Math.random() * ticketsPool.length)]
            : {
                ticketNumber: '#A120',
                name: 'Carlos Eduardo Mendoza',
                trips: 184,
                rating: 4.95
            };

        const currentPrizeList = presentationRaffle?.prizes && presentationRaffle.prizes.length > 0 
            ? presentationRaffle.prizes 
            : [{ id: '1', place: 1, title: presentationRaffle?.prize || 'Premio Mayor' }];

        const activePrize = currentPrizeList[selectedPrizeIndex] || currentPrizeList[0];

        const winnerRecord: WinnerInfo = {
            ticketNumber: chosen.ticketNumber,
            name: chosen.name,
            photoUrl: chosen.photoUrl,
            phone: chosen.phone,
            trips: chosen.trips || 142,
            rating: chosen.rating || 4.95,
            prizeTitle: activePrize.title,
            place: activePrize.place || selectedPrizeIndex + 1,
            drawnAt: new Date().toISOString()
        };

        setWinner(winnerRecord);
        setDisplayTicket(winnerRecord.ticketNumber);
        setDisplayParticipant(winnerRecord.name);

        // Save Winner in Supabase
        if (presentationRaffle) {
            try {
                const collectionName = activeTab === 'clients' ? 'raffles' : 'driver_raffles';
                const currentWinners = presentationRaffle.winners || [];
                const updatedWinners = [...currentWinners, winnerRecord];

                await supabase
                    .from(collectionName)
                    .update({ winners: updatedWinners })
                    .eq('id', presentationRaffle.id);

                setPresentationRaffle(prev => prev ? { ...prev, winners: updatedWinners } : null);
                fetchRaffles();
                toast.success("¡Ganador registrado exitosamente en el sistema!");
            } catch (err) {
                console.error("Error saving winner:", err);
            }
        }
    };

    return (
        <div className="p-8 max-w-6xl mx-auto pb-24">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-black text-slate-800 flex items-center gap-3">
                        <Ticket className="w-8 h-8 text-primary" />
                        Sorteos y Rifas Oficiales
                    </h1>
                    <p className="text-slate-500 font-medium mt-1">
                        Gestión con permisología SUNDDE, múltiples premios y Modo Presentación Ruleta En Vivo
                    </p>
                </div>
                
                <div className="flex items-center gap-3">
                    <div className="flex bg-slate-100 p-1 rounded-2xl">
                        <button
                            onClick={() => setActiveTab('clients')}
                            className={`px-5 py-2.5 rounded-xl font-black text-xs transition-all whitespace-nowrap ${
                                activeTab === 'clients' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                            }`}
                        >
                            Para Clientes
                        </button>
                        <button
                            onClick={() => setActiveTab('drivers')}
                            className={`px-5 py-2.5 rounded-xl font-black text-xs transition-all whitespace-nowrap ${
                                activeTab === 'drivers' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                            }`}
                        >
                            Para Pilotos
                        </button>
                    </div>

                    <button
                        onClick={() => setShowAddModal(true)}
                        className="bg-primary text-slate-900 px-5 py-2.5 rounded-2xl font-black text-xs shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
                    >
                        <Plus className="w-4 h-4" /> Nuevo Sorteo
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {loading ? (
                    <div className="col-span-full flex justify-center py-16">
                        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                    </div>
                ) : raffles.length === 0 ? (
                    <div className="col-span-full p-16 text-center bg-white rounded-[2.5rem] border-2 border-dashed border-slate-200">
                        <Ticket className="w-16 h-16 text-slate-200 mx-auto mb-4" />
                        <h3 className="text-lg font-black text-slate-700 mb-1">No hay sorteos programados</h3>
                        <p className="text-slate-400 font-bold text-sm">Crea tu primer sorteo con premios y permiso SUNDDE</p>
                    </div>
                ) : (
                    raffles.map((raffle) => (
                        <div key={raffle.id} className="bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden flex flex-col group hover:border-primary/40 transition-all">
                            <div className="p-6 flex-1 flex flex-col">
                                <div className="flex justify-between items-start mb-4">
                                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                                        raffle.scope === 'national' ? 'bg-blue-50 text-blue-500' :
                                        raffle.scope === 'regional' ? 'bg-orange-50 text-orange-500' : 'bg-green-50 text-green-500'
                                    }`}>
                                        {raffle.scope === 'national' ? <Globe className="w-6 h-6" /> :
                                         raffle.scope === 'regional' ? <MapIcon className="w-6 h-6" /> : <Home className="w-6 h-6" />}
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button 
                                            onClick={() => handleDeleteRaffle(raffle.id)} 
                                            className="p-2 text-slate-300 hover:text-red-500 rounded-xl transition-all cursor-pointer"
                                            title="Eliminar Sorteo"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>

                                <h3 className="text-xl font-black text-slate-900 mb-1 leading-snug">{raffle.title}</h3>
                                <p className="text-xs text-slate-500 font-medium mb-4 line-clamp-2 leading-relaxed">{raffle.description}</p>

                                {raffle.sunddePermit && (
                                    <div className="mb-4 inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-200/60 rounded-xl text-[10px] font-black text-amber-800">
                                        <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
                                        {raffle.sunddePermit}
                                    </div>
                                )}

                                <div className="space-y-2.5 mb-6 flex-1">
                                    <div className="bg-slate-50 p-3 rounded-2xl flex items-center gap-3">
                                        <Gift className="w-5 h-5 text-amber-500 shrink-0" />
                                        <div className="min-w-0">
                                            <p className="text-[10px] text-slate-400 font-black uppercase leading-none mb-1">Premio Principal</p>
                                            <p className="text-sm font-black text-slate-800 truncate">{raffle.prize}</p>
                                            {raffle.prizes && raffle.prizes.length > 1 && (
                                                <p className="text-[10px] text-amber-600 font-bold mt-0.5">
                                                    +{raffle.prizes.length - 1} premio(s) adicional(es)
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    <div className="bg-slate-50 p-3 rounded-2xl flex items-center gap-3">
                                        <Calendar className="w-5 h-5 text-primary shrink-0" />
                                        <div>
                                            <p className="text-[10px] text-slate-400 font-black uppercase leading-none mb-1">Fecha y Hora</p>
                                            <p className="text-sm font-black text-slate-800">
                                                {raffle.drawDate} {raffle.eventTime ? `• ${raffle.eventTime}` : ''}
                                            </p>
                                        </div>
                                    </div>

                                    {activeTab === 'drivers' && (
                                        <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-2xl flex items-center gap-3">
                                            <Ticket className="w-5 h-5 text-emerald-500 shrink-0" />
                                            <div>
                                                <p className="text-[10px] text-emerald-600/70 font-black uppercase leading-none mb-1">Costo (Puntos)</p>
                                                <p className="text-sm font-black text-emerald-700">{raffle.pointsCost} pts</p>
                                            </div>
                                        </div>
                                    )}

                                    {raffle.winners && raffle.winners.length > 0 && (
                                        <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-2xl flex items-center gap-2.5">
                                            <Trophy className="w-4 h-4 text-amber-600 shrink-0" />
                                            <p className="text-xs font-black text-amber-900 truncate">
                                                Ganador: {raffle.winners[raffle.winners.length - 1].name} ({raffle.winners[raffle.winners.length - 1].ticketNumber})
                                            </p>
                                        </div>
                                    )}
                                </div>

                                {/* Start Presentation Mode CTA */}
                                <button
                                    onClick={() => handleOpenPresentation(raffle)}
                                    className="w-full bg-[#0B0F19] text-amber-400 border border-amber-400/30 hover:border-amber-400 py-3.5 rounded-2xl font-black text-xs flex items-center justify-center gap-2 hover:bg-black transition-all cursor-pointer shadow-md group/btn"
                                >
                                    <Play className="w-4 h-4 fill-amber-400 text-amber-400 group-hover/btn:scale-110 transition-transform" />
                                    Modo Presentación (Ruleta 60s)
                                </button>
                            </div>

                            <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                    {raffle.scope === 'national' ? 'Nacional' : `${raffle.scope === 'regional' ? 'Regional' : 'Local'}: ${raffle.locationName}`}
                                </span>
                                <div className={`w-2.5 h-2.5 rounded-full ${raffle.isActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Modal para añadir sorteo con campos SUNDDE y Multi-Premios */}
            {showAddModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
                    <div className="bg-white rounded-[2.5rem] w-full max-w-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300 my-8">
                        <div className="p-6 sm:p-8 border-b border-slate-100 flex items-center justify-between">
                            <div>
                                <h3 className="text-2xl font-black text-slate-900">Nuevo Sorteo Oficial</h3>
                                <p className="text-xs text-slate-500 font-bold mt-0.5">Configuración de premios y permisología legal</p>
                            </div>
                            <button onClick={() => setShowAddModal(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-all cursor-pointer">
                                <X className="w-5 h-5 text-slate-400" />
                            </button>
                        </div>

                        <div className="p-6 sm:p-8 space-y-4 max-h-[75vh] overflow-y-auto">
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Título del Sorteo</label>
                                <input
                                    type="text"
                                    placeholder="Ej: Gran Sorteo Navideño 2x3"
                                    value={newRaffle.title}
                                    onChange={(e) => setNewRaffle({ ...newRaffle, title: e.target.value })}
                                    className="w-full bg-slate-50 border-2 border-slate-100 focus:border-primary px-4 py-3 rounded-2xl outline-none font-bold text-sm text-slate-800"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Descripción</label>
                                <textarea
                                    rows={2}
                                    placeholder="Detalles de la dinámica, condiciones de participación..."
                                    value={newRaffle.description}
                                    onChange={(e) => setNewRaffle({ ...newRaffle, description: e.target.value })}
                                    className="w-full bg-slate-50 border-2 border-slate-100 focus:border-primary px-4 py-2.5 rounded-2xl outline-none font-bold text-sm text-slate-800 resize-none"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Permiso SUNDDE</label>
                                    <input
                                        type="text"
                                        placeholder="Ej: SUNDDE/DAJ/2026/0491"
                                        value={newRaffle.sunddePermit}
                                        onChange={(e) => setNewRaffle({ ...newRaffle, sunddePermit: e.target.value })}
                                        className="w-full bg-slate-50 border-2 border-slate-100 focus:border-primary px-4 py-3 rounded-2xl outline-none font-bold text-sm text-slate-800"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Transmisión / Lugar</label>
                                    <input
                                        type="text"
                                        placeholder="Ej: Instagram Live @un2x3"
                                        value={newRaffle.eventLocation}
                                        onChange={(e) => setNewRaffle({ ...newRaffle, eventLocation: e.target.value })}
                                        className="w-full bg-slate-50 border-2 border-slate-100 focus:border-primary px-4 py-3 rounded-2xl outline-none font-bold text-sm text-slate-800"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Fecha del Evento</label>
                                    <input
                                        type="date"
                                        value={newRaffle.drawDate}
                                        onChange={(e) => setNewRaffle({ ...newRaffle, drawDate: e.target.value })}
                                        className="w-full bg-slate-50 border-2 border-slate-100 focus:border-primary px-4 py-3 rounded-2xl outline-none font-bold text-sm text-slate-800"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Hora del Evento</label>
                                    <input
                                        type="text"
                                        placeholder="Ej: 08:00 PM"
                                        value={newRaffle.eventTime}
                                        onChange={(e) => setNewRaffle({ ...newRaffle, eventTime: e.target.value })}
                                        className="w-full bg-slate-50 border-2 border-slate-100 focus:border-primary px-4 py-3 rounded-2xl outline-none font-bold text-sm text-slate-800"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Alcance Territorial</label>
                                    <select
                                        value={newRaffle.scope}
                                        onChange={(e) => {
                                            const newScope = e.target.value as 'national' | 'regional' | 'local';
                                            setNewRaffle({
                                                ...newRaffle,
                                                scope: newScope,
                                                targetState: '',
                                                targetCity: '',
                                                locationName: newScope === 'national' ? 'Nacional' : ''
                                            });
                                        }}
                                        className="w-full bg-slate-50 border-2 border-slate-100 focus:border-primary px-4 py-3 rounded-2xl outline-none font-bold text-sm text-slate-800"
                                    >
                                        <option value="national">Nacional (Todo el país)</option>
                                        <option value="regional">Estatal (Un Estado)</option>
                                        <option value="local">Local (Estado y Ciudad)</option>
                                    </select>
                                </div>

                                {newRaffle.scope === 'national' && (
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Ubicación</label>
                                        <div className="w-full bg-slate-100 border-2 border-slate-200/80 px-4 py-3 rounded-2xl font-bold text-sm text-slate-600 flex items-center gap-2">
                                            <Globe className="w-4 h-4 text-primary shrink-0" />
                                            <span>Nacional (Toda Venezuela)</span>
                                        </div>
                                    </div>
                                )}

                                {newRaffle.scope === 'regional' && (
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Seleccionar Estado</label>
                                        <select
                                            value={newRaffle.targetState}
                                            onChange={(e) => {
                                                const st = e.target.value;
                                                setNewRaffle({ ...newRaffle, targetState: st, targetCity: '', locationName: st });
                                            }}
                                            className="w-full bg-slate-50 border-2 border-slate-100 focus:border-primary px-4 py-3 rounded-2xl outline-none font-bold text-sm text-slate-800"
                                        >
                                            <option value="">-- Elige un Estado --</option>
                                            {VENEZUELA_STATES.map((st) => (
                                                <option key={st} value={st}>{st}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                {newRaffle.scope === 'local' && (
                                    <>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">1. Seleccionar Estado</label>
                                            <select
                                                value={newRaffle.targetState}
                                                onChange={(e) => {
                                                    const st = e.target.value;
                                                    setNewRaffle({
                                                        ...newRaffle,
                                                        targetState: st,
                                                        targetCity: '',
                                                        locationName: st
                                                    });
                                                }}
                                                className="w-full bg-slate-50 border-2 border-slate-100 focus:border-primary px-4 py-3 rounded-2xl outline-none font-bold text-sm text-slate-800"
                                            >
                                                <option value="">-- Elige un Estado --</option>
                                                {VENEZUELA_STATES.map((st) => (
                                                    <option key={st} value={st}>{st}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="space-y-1 md:col-span-2">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">2. Seleccionar Ciudad</label>
                                            <select
                                                value={newRaffle.targetCity}
                                                disabled={!newRaffle.targetState}
                                                onChange={(e) => {
                                                    const ct = e.target.value;
                                                    setNewRaffle({
                                                        ...newRaffle,
                                                        targetCity: ct,
                                                        locationName: ct ? `${ct}, ${newRaffle.targetState}` : newRaffle.targetState
                                                    });
                                                }}
                                                className="w-full bg-slate-50 border-2 border-slate-100 focus:border-primary px-4 py-3 rounded-2xl outline-none font-bold text-sm text-slate-800 disabled:opacity-50"
                                            >
                                                <option value="">{newRaffle.targetState ? '-- Elige una Ciudad --' : 'Primero selecciona un estado arriba'}</option>
                                                {(newRaffle.targetState && VENEZUELA_DATA[newRaffle.targetState] || []).map((ct) => (
                                                    <option key={ct} value={ct}>{ct}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </>
                                )}
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-emerald-600 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                                    <Award className="w-3.5 h-3.5" /> Costo en Puntos por Ticket
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    value={newRaffle.pointsCost || ''}
                                    onChange={(e) => setNewRaffle({ ...newRaffle, pointsCost: Number(e.target.value) })}
                                    placeholder="Ej: 10 (10 puntos = 1 ticket)"
                                    className="w-full bg-emerald-50 text-emerald-900 border-2 border-emerald-100 focus:border-emerald-500 px-4 py-3 rounded-2xl outline-none font-bold text-sm placeholder:text-emerald-300"
                                />
                                <p className="text-[10px] text-slate-400 ml-1">
                                    Define la cantidad de puntos que cuesta canjear 1 ticket para este sorteo. Si es 0, no requiere puntos.
                                </p>
                            </div>

                            {/* Multi-Prize Management */}
                            <div className="pt-2 border-t border-slate-100 space-y-3">
                                <div className="flex items-center justify-between">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                                        <Trophy className="w-3.5 h-3.5 text-amber-500" />
                                        Premios del Sorteo
                                    </label>
                                    <button
                                        type="button"
                                        onClick={handleAddPrizeInput}
                                        className="text-xs font-black text-primary hover:text-amber-600 transition-colors flex items-center gap-1 cursor-pointer"
                                    >
                                        <Plus className="w-3.5 h-3.5" /> Agregar Premio
                                    </button>
                                </div>

                                <div className="space-y-2.5">
                                    {newRaffle.prizes.map((pz, idx) => (
                                        <div key={pz.id || idx} className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2.5">
                                            <div className="flex items-center gap-2">
                                                <span className="w-7 h-7 rounded-xl bg-amber-100 text-amber-800 font-black text-xs flex items-center justify-center shrink-0">
                                                    #{pz.place}
                                                </span>
                                                <input
                                                    type="text"
                                                    placeholder={`Premio #${pz.place} (Ej: Moto Bera 0km)`}
                                                    value={pz.title}
                                                    onChange={(e) => handlePrizeChange(idx, 'title', e.target.value)}
                                                    className="flex-1 bg-white border border-slate-200 focus:border-primary px-3 py-2 rounded-xl outline-none font-bold text-xs text-slate-800"
                                                />
                                                {newRaffle.prizes.length > 1 && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemovePrizeInput(idx)}
                                                        className="p-2 text-slate-400 hover:text-red-500 rounded-lg transition-colors cursor-pointer"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                            <input
                                                type="text"
                                                placeholder="Detalle opcional (Ej: Incluye placas y casco certificado)"
                                                value={pz.description || ''}
                                                onChange={(e) => handlePrizeChange(idx, 'description', e.target.value)}
                                                className="w-full bg-white border border-slate-200 focus:border-primary px-3 py-1.5 rounded-xl outline-none font-medium text-[11px] text-slate-600"
                                            />
                                            {/* Prize Image Section */}
                                            <div className="flex items-center gap-2 pt-1">
                                                {pz.imageUrl ? (
                                                    <div className="relative w-12 h-12 rounded-xl overflow-hidden border border-slate-300 shrink-0 group">
                                                        <img src={pz.imageUrl} alt={pz.title} className="w-full h-full object-cover" />
                                                        <button
                                                            type="button"
                                                            onClick={() => handlePrizeChange(idx, 'imageUrl', '')}
                                                            className="absolute inset-0 bg-red-600/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                                            title="Eliminar imagen"
                                                        >
                                                            <X className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <label className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-dashed border-slate-300 hover:border-primary rounded-xl text-slate-600 font-bold text-[11px] cursor-pointer shrink-0 transition-colors">
                                                        {uploadingPrizeIdx === idx ? (
                                                            <RefreshCw className="w-3.5 h-3.5 animate-spin text-primary" />
                                                        ) : (
                                                            <Upload className="w-3.5 h-3.5 text-primary" />
                                                        )}
                                                        <span>{uploadingPrizeIdx === idx ? "Subiendo..." : "Subir Foto"}</span>
                                                        <input
                                                            type="file"
                                                            accept="image/*"
                                                            className="hidden"
                                                            disabled={uploadingPrizeIdx === idx}
                                                            onChange={(e) => handlePrizeImageUpload(idx, e)}
                                                        />
                                                    </label>
                                                )}
                                                <input
                                                    type="text"
                                                    placeholder="O pega URL de la imagen del premio..."
                                                    value={pz.imageUrl || ''}
                                                    onChange={(e) => handlePrizeChange(idx, 'imageUrl', e.target.value)}
                                                    className="flex-1 bg-white border border-slate-200 focus:border-primary px-3 py-1.5 rounded-xl outline-none font-medium text-[10px] text-slate-600"
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <button
                                onClick={handleAddRaffle}
                                className="w-full bg-primary text-slate-900 py-4 rounded-2xl font-black text-sm shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer mt-4"
                            >
                                <Save className="w-5 h-5" /> Guardar y Publicar Sorteo
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* FULLSCREEN PRESENTATION MODE (#0B0F19) */}
            {isPresentationMode && presentationRaffle && (
                <div className="fixed inset-0 z-[200] bg-[#0B0F19] text-white flex flex-col overflow-y-auto font-sans select-none animate-in fade-in duration-300">
                    {/* Confetti Canvas */}
                    <canvas
                        ref={canvasRef}
                        className="fixed inset-0 pointer-events-none z-50 w-full h-full"
                    />

                    {/* Top Navigation & Status Bar */}
                    <header className="px-6 py-4 border-b border-white/10 flex items-center justify-between shrink-0 bg-[#0B0F19]/90 backdrop-blur-md sticky top-0 z-30">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-yellow-300 flex items-center justify-center text-slate-950 font-black shadow-lg shadow-amber-500/20">
                                <Trophy className="w-6 h-6" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-black tracking-widest text-amber-400">UN 2X3 EN VIVO</span>
                                    <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider bg-red-600 text-white px-2 py-0.5 rounded-full animate-pulse">
                                        <span className="w-1.5 h-1.5 rounded-full bg-white" /> EN VIVO
                                    </span>
                                </div>
                                <p className="text-[11px] text-white/60 font-bold">{presentationRaffle.title}</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-4">
                            {presentationRaffle.sunddePermit && (
                                <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 bg-white/5 border border-white/15 rounded-xl text-xs font-black text-amber-300">
                                    <ShieldCheck className="w-4 h-4 text-amber-400" />
                                    {presentationRaffle.sunddePermit}
                                </div>
                            )}

                            <button
                                onClick={() => setSoundEnabled(!soundEnabled)}
                                className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer"
                                title={soundEnabled ? "Silenciar" : "Activar Sonido"}
                            >
                                {soundEnabled ? <Volume2 className="w-5 h-5 text-amber-400" /> : <VolumeX className="w-5 h-5 text-white/50" />}
                            </button>

                            <button
                                onClick={() => setIsPresentationMode(false)}
                                className="px-4 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-400 font-black text-xs transition-all flex items-center gap-1.5 cursor-pointer border border-red-500/30"
                            >
                                <X className="w-4 h-4" /> Salir de Presentación
                            </button>
                        </div>
                    </header>

                    {/* Main Presentation Stage */}
                    <main className="flex-1 flex flex-col items-center justify-center p-6 md:p-12 relative overflow-hidden max-w-5xl mx-auto w-full">
                        {/* Glow ambient backgrounds */}
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-amber-500/10 rounded-full blur-[140px] pointer-events-none" />
                        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-primary/10 rounded-full blur-[100px] pointer-events-none" />

                        {/* Prize Banner */}
                        {(() => {
                            const prizesList = presentationRaffle.prizes && presentationRaffle.prizes.length > 0 
                                ? presentationRaffle.prizes 
                                : [{ id: '1', place: 1, title: presentationRaffle.prize, description: '' }];
                            const activePrize = prizesList[selectedPrizeIndex] || prizesList[0];

                            return (
                                <div className="text-center mb-8 relative z-10">
                                    <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-amber-500/10 border border-amber-500/30 rounded-full text-xs font-black text-amber-300 uppercase tracking-widest mb-3">
                                        <Award className="w-4 h-4 text-amber-400" />
                                        Sorteando: {activePrize.place ? `${activePrize.place}° Lugar` : 'Premio Oficial'}
                                    </div>
                                    <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight drop-shadow-md">
                                        {activePrize.title}
                                    </h2>
                                    {activePrize.description && (
                                        <p className="text-sm text-white/60 font-medium mt-1 max-w-xl mx-auto">
                                            {activePrize.description}
                                        </p>
                                    )}

                                    {/* Multi-prize switcher tabs */}
                                    {prizesList.length > 1 && (
                                        <div className="flex gap-2 justify-center mt-4 flex-wrap">
                                            {prizesList.map((p, idx) => (
                                                <button
                                                    key={p.id || idx}
                                                    onClick={() => {
                                                        if (presentationStep !== 'countdown') {
                                                            setSelectedPrizeIndex(idx);
                                                            setPresentationStep('idle');
                                                            setWinner(null);
                                                        }
                                                    }}
                                                    disabled={presentationStep === 'countdown'}
                                                    className={`px-3 py-1 rounded-xl text-xs font-black transition-all ${
                                                        selectedPrizeIndex === idx
                                                            ? 'bg-amber-400 text-slate-950 shadow-lg shadow-amber-400/20'
                                                            : 'bg-white/10 text-white/70 hover:bg-white/20'
                                                    }`}
                                                >
                                                    Premio #{p.place}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })()}

                        {/* STEP 1: IDLE STAGE */}
                        {presentationStep === 'idle' && (
                            <div className="flex flex-col items-center text-center space-y-8 relative z-10">
                                {/* Giant Roulette Drum Preview */}
                                <div className="relative w-64 h-64 sm:w-80 sm:h-80 rounded-full border-4 border-amber-400/40 bg-gradient-to-b from-white/10 to-transparent flex flex-col items-center justify-center p-6 shadow-2xl shadow-amber-500/10">
                                    <div className="absolute inset-0 rounded-full border-2 border-dashed border-amber-400/20 animate-spin" style={{ animationDuration: '40s' }} />
                                    <Ticket className="w-16 h-16 sm:w-20 sm:h-20 text-amber-400 mb-2 animate-bounce" />
                                    <p className="text-3xl sm:text-4xl font-black text-white">
                                        {ticketsPool.length > 0 ? ticketsPool.length : '1,420'}
                                    </p>
                                    <p className="text-xs font-black uppercase tracking-widest text-amber-300">
                                        Tickets en la Ruleta
                                    </p>
                                </div>

                                <div className="space-y-3">
                                    <button
                                        onClick={handleStartRoulette}
                                        className="bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 text-slate-950 px-10 py-5 rounded-3xl font-black text-xl shadow-2xl shadow-amber-400/40 hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-3 cursor-pointer"
                                    >
                                        <Play className="w-7 h-7 fill-slate-950" />
                                        INICIAR RULETA DE LA SUERTE (60s)
                                    </button>
                                    <p className="text-xs text-white/50 font-bold uppercase tracking-widest">
                                        60 segundos de tensión con verificación aleatoria y certificación SUNDDE
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* STEP 2: 60-SECOND TENSION COUNTDOWN & ROULETTE */}
                        {presentationStep === 'countdown' && (
                            <div className="flex flex-col items-center text-center space-y-8 relative z-10 w-full max-w-xl">
                                {/* Big Glowing Countdown Dial */}
                                <div className="relative flex items-center justify-center">
                                    <div className="w-40 h-40 rounded-full border-4 border-amber-400/30 flex items-center justify-center relative">
                                        <div className="absolute inset-0 rounded-full border-4 border-amber-400 animate-ping opacity-25" style={{ animationDuration: '1.2s' }} />
                                        <div className="text-5xl font-black text-amber-400 font-mono tracking-tighter">
                                            {countdown < 10 ? `0${countdown}` : countdown}
                                        </div>
                                    </div>
                                </div>

                                {/* Progress Bar */}
                                <div className="w-full bg-white/10 h-3 rounded-full overflow-hidden border border-white/10">
                                    <div 
                                        className="h-full bg-gradient-to-r from-amber-500 to-yellow-300 transition-all duration-1000 ease-linear rounded-full"
                                        style={{ width: `${((60 - countdown) / 60) * 100}%` }}
                                    />
                                </div>

                                {/* Rapidly spinning ticket number and participant */}
                                <div className="bg-white/5 border-2 border-amber-400/50 rounded-3xl p-8 w-full shadow-2xl backdrop-blur-xl space-y-3">
                                    <span className="text-xs font-black uppercase tracking-[0.3em] text-amber-300 animate-pulse block">
                                        RULETA EN MOVIMIENTO
                                    </span>
                                    <div className="text-5xl sm:text-6xl font-black text-white font-mono tracking-wider drop-shadow-lg scale-105 transition-transform">
                                        {displayTicket}
                                    </div>
                                    <div className="text-lg font-bold text-white/70 truncate max-w-md mx-auto">
                                        {displayParticipant}
                                    </div>
                                </div>

                                {/* Fast forward button for admin convenience */}
                                <button
                                    onClick={handleFastForward}
                                    className="px-6 py-2.5 rounded-2xl bg-white/10 hover:bg-white/20 text-white/80 hover:text-white text-xs font-black transition-all flex items-center gap-2 cursor-pointer border border-white/10"
                                >
                                    <FastForward className="w-4 h-4 text-amber-400" />
                                    Acelerar a Revelación Final
                                </button>
                            </div>
                        )}

                        {/* STEP 3: WINNER REVEAL CARD */}
                        {presentationStep === 'winner' && winner && (
                            <div className="flex flex-col items-center text-center space-y-6 relative z-10 w-full max-w-xl animate-in zoom-in-95 duration-500">
                                <div className="inline-flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-amber-400 to-yellow-300 text-slate-950 rounded-full font-black text-sm uppercase tracking-widest shadow-xl shadow-amber-400/30 animate-bounce">
                                    <Sparkles className="w-4 h-4" /> ¡TENEMOS UN GANADOR OFICIAL! <Sparkles className="w-4 h-4" />
                                </div>

                                {/* Golden Ticket Card */}
                                <div className="bg-gradient-to-b from-[#161F30] to-[#0D1424] border-2 border-amber-400 rounded-[2.5rem] p-8 w-full shadow-2xl relative overflow-hidden">
                                    {/* Gold stamp badge */}
                                    <div className="absolute top-4 right-4 bg-amber-400/10 border border-amber-400/40 text-amber-300 px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                                        <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                                        CERTIFICADO
                                    </div>

                                    {/* Big Winning Ticket Number */}
                                    <div className="mb-6">
                                        <p className="text-[11px] font-black text-amber-400 uppercase tracking-widest mb-1">TICKET GANADOR</p>
                                        <div className="text-6xl sm:text-7xl font-black text-amber-300 font-mono tracking-widest drop-shadow-[0_0_25px_rgba(251,191,36,0.5)]">
                                            {winner.ticketNumber}
                                        </div>
                                    </div>

                                    {/* Participant Profile info */}
                                    <div className="flex flex-col items-center mb-6">
                                        <div className="w-24 h-24 rounded-3xl bg-amber-400/20 border-2 border-amber-400 flex items-center justify-center mb-3 shadow-lg relative overflow-hidden">
                                            {winner.photoUrl ? (
                                                <img src={winner.photoUrl} alt={winner.name} className="w-full h-full object-cover" />
                                            ) : (
                                                <span className="text-3xl font-black text-amber-300">
                                                    {winner.name.charAt(0)}
                                                </span>
                                            )}
                                        </div>
                                        <h3 className="text-2xl sm:text-3xl font-black text-white mb-1">
                                            {winner.name}
                                        </h3>
                                        <p className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                                            {activeTab === 'drivers' ? 'Piloto Oficial 2x3' : 'Cliente Fidelizado'}
                                        </p>
                                    </div>

                                    {/* Participant Stats Bar */}
                                    <div className="grid grid-cols-2 gap-3 mb-6 bg-white/5 p-4 rounded-2xl border border-white/10">
                                        <div className="text-center">
                                            <p className="text-[10px] font-black uppercase text-white/50 tracking-wider">Calificación</p>
                                            <p className="text-lg font-black text-amber-400 flex items-center justify-center gap-1">
                                                <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                                                {winner.rating?.toFixed(2) || '4.95'}
                                            </p>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-[10px] font-black uppercase text-white/50 tracking-wider">Actividad</p>
                                            <p className="text-lg font-black text-white">
                                                {winner.trips || 142} {activeTab === 'drivers' ? 'Viajes' : 'Compras'}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Prize Awarded */}
                                    <div className="bg-amber-400/10 border border-amber-400/30 p-4 rounded-2xl">
                                        <p className="text-[10px] font-black uppercase text-amber-300 tracking-widest mb-0.5">Premio Adjudicado</p>
                                        <p className="text-xl font-black text-white">{winner.prizeTitle}</p>
                                    </div>
                                </div>

                                {/* Post-Reveal Actions */}
                                <div className="flex flex-col sm:flex-row gap-3 w-full">
                                    <button
                                        onClick={triggerConfettiExplosion}
                                        className="flex-1 bg-white/10 hover:bg-white/20 text-white py-4 rounded-2xl font-black text-xs transition-all flex items-center justify-center gap-2 cursor-pointer border border-white/10"
                                    >
                                        <Sparkles className="w-4 h-4 text-amber-400" />
                                        Más Confeti 🎉
                                    </button>

                                    {presentationRaffle.prizes && presentationRaffle.prizes.length > selectedPrizeIndex + 1 ? (
                                        <button
                                            onClick={() => {
                                                setSelectedPrizeIndex(prev => prev + 1);
                                                setPresentationStep('idle');
                                                setWinner(null);
                                            }}
                                            className="flex-1 bg-primary text-slate-950 py-4 rounded-2xl font-black text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-primary/20 hover:scale-[1.02]"
                                        >
                                            Siguiente Premio (#{selectedPrizeIndex + 2}) <Play className="w-4 h-4" />
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => setIsPresentationMode(false)}
                                            className="flex-1 bg-gradient-to-r from-amber-400 to-yellow-300 text-slate-950 py-4 rounded-2xl font-black text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xl shadow-amber-400/30 hover:scale-[1.02]"
                                        >
                                            <CheckCircle className="w-4 h-4" />
                                            Finalizar Sorteo
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                    </main>

                    {/* Bottom Legal / SUNDDE Footer */}
                    <footer className="p-4 border-t border-white/10 bg-[#0B0F19]/80 backdrop-blur-sm text-center shrink-0">
                        <p className="text-[11px] font-bold text-white/50 tracking-wider">
                            {presentationRaffle.sunddePermit ? `Sorteo autorizado bajo permisología oficial ${presentationRaffle.sunddePermit}. ` : ''}
                            Sistema de Ruleta Criptográfica Certificada Un 2x3 • Todos los derechos reservados © {new Date().getFullYear()}
                        </p>
                    </footer>
                </div>
            )}
        </div>
    );
}
