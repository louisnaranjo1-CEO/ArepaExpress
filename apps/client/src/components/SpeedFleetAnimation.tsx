import React, { useState, useRef, useEffect } from 'react';
import { vibrate } from '../utils/haptics';
import { playMotoHorn, playCarHorn, playTruckHorn } from '../utils/audioChimes';

type VehicleKey = 'truck' | 'suv' | 'taxi' | 'moto' | 'delivery';

const VEHICLE_DATA: Record<VehicleKey, { title: string; emoji: string; phrases: string[] }> = {
  truck: {
    title: "Camión Flete 2x3",
    emoji: "🚛",
    phrases: [
      "¡Flete pesado en un 2x3!",
      "¡Mudanzas y cajas van seguras conmigo!",
      "¡Fuerza y capacidad para tu carga!",
      "¡Si cabe en tu casa, cabe en mi camión!",
      "¡Puntualidad de carga garantizada!"
    ]
  },
  suv: {
    title: "Camioneta Confort",
    emoji: "🚙",
    phrases: [
      "¡Full aire acondicionado y confort!",
      "¡Viaja como un rey con full espacio!",
      "¡Cero calor, aquí se viaja congelado!",
      "¡Suavidad y estilo en cada bache!",
      "¡Pide Confort y llega descansado!"
    ]
  },
  taxi: {
    title: "Carro Taxi Express",
    emoji: "🚕",
    phrases: [
      "¡Yaaa voooooy volando por ti!",
      "¡El taxi más rápido de la ciudad!",
      "¡Puntualidad en un 2x3, sin vueltas!",
      "¡Dime a dónde y arrancamos de una!",
      "¡Tu transporte confiable a cualquier hora!"
    ]
  },
  moto: {
    title: "Mototaxi Express",
    emoji: "🏍️",
    phrases: [
      "¡Esquivamos todas las colas de la ciudad!",
      "¡Agárrate duro que vamos en un 2x3!",
      "¡Casco puesto y directo a tu destino!",
      "¡El transporte más veloz y económico!",
      "¡Llegas en 5 minutos garantizado!"
    ]
  },
  delivery: {
    title: "Repartidor Express",
    emoji: "🛵",
    phrases: [
      "¡Tu comida llega calientita y directa!",
      "¡Tu encomienda en minutos, sin escalas!",
      "¡Con el morral puesto listo para volar!",
      "¡Entrega rápida y sin mordiscos a la arepa!",
      "¡En un 2x3 en la puerta de tu casa!"
    ]
  }
};

interface BubbleState {
  phrase: string;
  emoji: string;
  title: string;
  id: number;
}

export default function SpeedFleetAnimation() {
  const [jumpingVehicle, setJumpingVehicle] = useState<VehicleKey | null>(null);
  const [activeBubble, setActiveBubble] = useState<BubbleState | null>(null);
  const bubbleTimerRef = useRef<any>(null);
  const jumpTimerRef = useRef<any>(null);

  const handleVehicleClick = (vehicleKey: VehicleKey) => {
    try {
      vibrate([30, 20, 40]);
    } catch (e) {}

    // Play characteristic vehicle horn sound
    if (vehicleKey === 'moto' || vehicleKey === 'delivery') {
      playMotoHorn();
    } else if (vehicleKey === 'truck') {
      playTruckHorn();
    } else {
      playCarHorn();
    }

    // Trigger dynamic vehicle hop/jump animation
    setJumpingVehicle(vehicleKey);
    if (jumpTimerRef.current) clearTimeout(jumpTimerRef.current);
    jumpTimerRef.current = setTimeout(() => {
      setJumpingVehicle(null);
    }, 550);

    // Pick dynamic phrase for this specific vehicle
    const vInfo = VEHICLE_DATA[vehicleKey];
    const available = vInfo.phrases.filter(p => p !== activeBubble?.phrase);
    const randomPhrase = available[Math.floor(Math.random() * available.length)] || vInfo.phrases[0];

    setActiveBubble({
      phrase: randomPhrase,
      emoji: vInfo.emoji,
      title: vInfo.title,
      id: Date.now()
    });

    if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current);
    bubbleTimerRef.current = setTimeout(() => {
      setActiveBubble(null);
    }, 3800);
  };

  useEffect(() => {
    return () => {
      if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current);
      if (jumpTimerRef.current) clearTimeout(jumpTimerRef.current);
    };
  }, []);

  return (
    <div className="relative w-full max-w-lg mx-auto h-28 sm:h-32 overflow-visible select-none flex flex-col justify-end">
      {/* Dynamic CSS animations embedded */}
      <style>{`
        @keyframes roadDash {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes windStreak {
          0% { transform: translateX(120%); opacity: 0; }
          20% { opacity: 0.8; }
          80% { opacity: 0.8; }
          100% { transform: translateX(-120%); opacity: 0; }
        }
        @keyframes vehicleVibe1 {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-1.5px) rotate(-0.3deg); }
        }
        @keyframes vehicleVibe2 {
          0%, 100% { transform: translateY(-0.5px) rotate(0.2deg); }
          50% { transform: translateY(1px) rotate(-0.2deg); }
        }
        @keyframes vehicleVibe3 {
          0%, 100% { transform: translateY(0.5px); }
          50% { transform: translateY(-1px); }
        }
        @keyframes vehicleJumpUp {
          0% { transform: translateY(0px) scale(1); }
          25% { transform: translateY(-24px) scale(1.1) rotate(-3deg); }
          50% { transform: translateY(-30px) scale(1.06) rotate(2deg); }
          75% { transform: translateY(3px) scale(0.95) rotate(0deg); }
          88% { transform: translateY(-4px) scale(1.02); }
          100% { transform: translateY(0px) scale(1) rotate(0deg); }
        }
        .anim-jumping {
          animation: vehicleJumpUp 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
        }
        @keyframes wheelSpin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes headlightBeam {
          0%, 100% { opacity: 0.75; }
          50% { opacity: 0.95; }
        }
        .anim-road {
          animation: roadDash 0.35s linear infinite;
        }
        .anim-wind-fast {
          animation: windStreak 0.5s linear infinite;
        }
        .anim-wind-mid {
          animation: windStreak 0.8s linear infinite;
        }
        .anim-vibe-1 {
          animation: vehicleVibe1 0.22s ease-in-out infinite;
        }
        .anim-vibe-2 {
          animation: vehicleVibe2 0.28s ease-in-out infinite;
        }
        .anim-vibe-3 {
          animation: vehicleVibe3 0.18s ease-in-out infinite;
        }
        .anim-wheel {
          transform-origin: center;
          animation: wheelSpin 0.2s linear infinite;
        }
        .anim-headlight {
          animation: headlightBeam 1.5s ease-in-out infinite;
        }
      `}</style>

      {/* Floating Dialogue Speech Bubble - Always Centered Within Screen Bounds */}
      {activeBubble && (
        <div
          key={activeBubble.id}
          className="absolute -top-1 left-1/2 -translate-x-1/2 z-30 pointer-events-none w-full max-w-[92vw] sm:max-w-md px-2 flex justify-center animate-in zoom-in-95 fade-in duration-200"
        >
          <div className="relative bg-slate-950/95 text-yellow-300 font-black text-xs sm:text-sm px-4 py-2 rounded-2xl shadow-2xl border-2 border-yellow-400 flex items-center gap-2.5 tracking-tight backdrop-blur-md">
            <span className="text-xl animate-bounce shrink-0">{activeBubble.emoji}</span>
            <div className="flex flex-col text-left">
              <span className="text-[9px] uppercase tracking-wider text-amber-400 font-black leading-none">
                {activeBubble.title}
              </span>
              <span className="text-white font-extrabold text-[11px] sm:text-xs leading-snug mt-0.5">
                "{activeBubble.phrase}"
              </span>
            </div>
            {/* Downward triangle arrow in center */}
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-0 h-0 border-x-[6px] border-x-transparent border-t-[8px] border-t-yellow-400"></div>
          </div>
        </div>
      )}

      {/* Wind & Speed Lines in Background */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-2 w-24 h-[1.5px] bg-gradient-to-l from-white/60 via-amber-300/40 to-transparent rounded-full anim-wind-fast" style={{ animationDelay: '0s' }}></div>
        <div className="absolute top-8 w-36 h-[1px] bg-gradient-to-l from-white/70 via-cyan-300/30 to-transparent rounded-full anim-wind-mid" style={{ animationDelay: '0.2s' }}></div>
        <div className="absolute top-14 w-20 h-[1.5px] bg-gradient-to-l from-white/50 to-transparent rounded-full anim-wind-fast" style={{ animationDelay: '0.4s' }}></div>
        <div className="absolute top-20 w-44 h-[1px] bg-gradient-to-l from-amber-400/60 to-transparent rounded-full anim-wind-mid" style={{ animationDelay: '0.1s' }}></div>
      </div>

      {/* SVG Canvas with 5 vehicles */}
      <svg
        viewBox="0 0 620 160"
        className="relative z-10 w-full h-auto overflow-visible"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          {/* Headlight gradients */}
          <linearGradient id="headlightGlow" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#FEF08A" stopOpacity="0.85" />
            <stop offset="50%" stopColor="#FEF08A" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#FEF08A" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="chromeWheel" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#64748B" />
            <stop offset="50%" stopColor="#CBD5E1" />
            <stop offset="100%" stopColor="#334155" />
          </linearGradient>
          <linearGradient id="truckBody" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#334155" />
            <stop offset="100%" stopColor="#475569" />
          </linearGradient>
          <linearGradient id="suvBody" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#0284C7" />
            <stop offset="100%" stopColor="#38BDF8" />
          </linearGradient>
          <linearGradient id="taxiBody" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#EAB308" />
            <stop offset="100%" stopColor="#FACC15" />
          </linearGradient>
          <linearGradient id="moto2Body" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#DC2626" />
            <stop offset="100%" stopColor="#EF4444" />
          </linearGradient>
          <linearGradient id="deliveryBody" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#EA580C" />
            <stop offset="100%" stopColor="#F97316" />
          </linearGradient>
        </defs>

        {/* ---------------------------------------------------- */}
        {/* VEHICLE 1: CAMIÓN FLETE (Back left, largest, solid) */}
        {/* ---------------------------------------------------- */}
        <g 
          className={`${jumpingVehicle === 'truck' ? 'anim-jumping' : 'anim-vibe-2'} cursor-pointer transition-transform active:scale-95`} 
          style={{ transformOrigin: '70px 115px' }}
          onClick={() => handleVehicleClick('truck')}
        >
          {/* Cargo Box */}
          <rect x="5" y="46" width="92" height="66" rx="4" fill="url(#truckBody)" stroke="#1E293B" strokeWidth="2" />
          {/* Cargo rib lines */}
          <line x1="28" y1="48" x2="28" y2="110" stroke="#1E293B" strokeWidth="1.5" opacity="0.6" />
          <line x1="52" y1="48" x2="52" y2="110" stroke="#1E293B" strokeWidth="1.5" opacity="0.6" />
          <line x1="76" y1="48" x2="76" y2="110" stroke="#1E293B" strokeWidth="1.5" opacity="0.6" />
          <rect x="18" y="62" width="65" height="15" rx="3" fill="#0F172A" opacity="0.75" />
          <text x="50" y="73" fill="#F8FAFC" fontSize="8" fontWeight="900" textAnchor="middle" letterSpacing="1">FLETE 2X3</text>

          {/* Cabin */}
          <path d="M97 68 L114 68 L126 84 L128 112 L97 112 Z" fill="#F8FAFC" stroke="#1E293B" strokeWidth="2" />
          {/* Cabin Windshield */}
          <path d="M102 72 L113 72 L121 84 L102 84 Z" fill="#0284C7" opacity="0.8" />
          {/* Exhaust Stack */}
          <rect x="94" y="38" width="4" height="26" rx="1.5" fill="#94A3B8" stroke="#1E293B" strokeWidth="1" />
          {/* Exhaust smoke puff */}
          <circle cx="94" cy="34" r="3" fill="#E2E8F0" opacity="0.3" />
          <circle cx="90" cy="30" r="5" fill="#E2E8F0" opacity="0.2" />

          {/* Headlight beam */}
          <polygon points="128,95 240,85 240,125 128,105" fill="url(#headlightGlow)" className="anim-headlight" opacity="0.35" />
          <circle cx="127" cy="98" r="3" fill="#FEF08A" />

          {/* Truck Wheels */}
          <g>
            <circle cx="28" cy="116" r="11" fill="#0F172A" />
            <circle cx="28" cy="116" r="6" fill="url(#chromeWheel)" />
            <circle cx="50" cy="116" r="11" fill="#0F172A" />
            <circle cx="50" cy="116" r="6" fill="url(#chromeWheel)" />
            <circle cx="114" cy="116" r="11" fill="#0F172A" />
            <circle cx="114" cy="116" r="6" fill="url(#chromeWheel)" />
          </g>
        </g>

        {/* ---------------------------------------------------- */}
        {/* VEHICLE 2: CAMIONETA TAXI (SUV / Pickup Taxi, Mid-lane) */}
        {/* ---------------------------------------------------- */}
        <g 
          className={`${jumpingVehicle === 'suv' ? 'anim-jumping' : 'anim-vibe-1'} cursor-pointer transition-transform active:scale-95`} 
          style={{ transformOrigin: '195px 120px' }}
          onClick={() => handleVehicleClick('suv')}
        >
          {/* Headlight beam */}
          <polygon points="256,102 380,88 380,132 256,112" fill="url(#headlightGlow)" className="anim-headlight" opacity="0.45" />

          {/* Chassis / Body */}
          <path
            d="M145 106 L150 94 L170 82 L212 82 L234 94 L256 97 L258 114 L145 114 Z"
            fill="url(#suvBody)"
            stroke="#0F172A"
            strokeWidth="2"
          />
          {/* Windows */}
          <path d="M173 86 L195 86 L195 96 L164 96 Z" fill="#0F172A" opacity="0.75" />
          <path d="M199 86 L216 86 L228 96 L199 96 Z" fill="#0F172A" opacity="0.75" />
          
          {/* Taxi Roof Sign on SUV */}
          <rect x="185" y="74" width="22" height="7" rx="2" fill="#FACC15" stroke="#0F172A" strokeWidth="1.5" />
          <text x="196" y="80" fill="#0F172A" fontSize="5.5" fontWeight="900" textAnchor="middle">CONFORT</text>

          {/* Side Checker Taxi Stripe */}
          <path d="M152 101 L252 101" stroke="#FACC15" strokeWidth="3" strokeDasharray="4 4" />

          {/* Front headlight bulb */}
          <circle cx="255" cy="103" r="2.5" fill="#FEF08A" />

          {/* SUV Wheels */}
          <circle cx="172" cy="117" r="10" fill="#0F172A" />
          <circle cx="172" cy="117" r="5" fill="url(#chromeWheel)" />
          <circle cx="236" cy="117" r="10" fill="#0F172A" />
          <circle cx="236" cy="117" r="5" fill="url(#chromeWheel)" />
        </g>

        {/* ---------------------------------------------------- */}
        {/* VEHICLE 3: CARRO TAXI (Sedan Taxi, Center Stage)     */}
        {/* ---------------------------------------------------- */}
        <g 
          className={`${jumpingVehicle === 'taxi' ? 'anim-jumping' : 'anim-vibe-3'} cursor-pointer transition-transform active:scale-95`} 
          style={{ transformOrigin: '320px 122px' }}
          onClick={() => handleVehicleClick('taxi')}
        >
          {/* Headlight beam */}
          <polygon points="378,106 500,92 500,136 378,116" fill="url(#headlightGlow)" className="anim-headlight" opacity="0.55" />

          {/* Taxi Sedan Body */}
          <path
            d="M272 110 L282 98 L308 89 L344 89 L362 98 L378 101 L380 118 L272 118 Z"
            fill="url(#taxiBody)"
            stroke="#0F172A"
            strokeWidth="2"
          />
          {/* Sedan Windows */}
          <path d="M298 93 L324 93 L324 102 L288 102 Z" fill="#1E293B" opacity="0.8" />
          <path d="M328 93 L346 93 L357 102 L328 102 Z" fill="#1E293B" opacity="0.8" />

          {/* Illuminated TAXI Roof Cap */}
          <polygon points="314,88 338,88 334,81 318,81" fill="#FFFFFF" stroke="#0F172A" strokeWidth="1.5" />
          <rect x="318" y="82" width="16" height="5" fill="#F59E0B" rx="1" />
          <text x="326" y="86.5" fill="#000000" fontSize="4.5" fontWeight="900" textAnchor="middle">TAXI</text>

          {/* Checkerboard side pattern */}
          <path d="M280 106 L372 106" stroke="#0F172A" strokeWidth="3" strokeDasharray="3.5 3.5" />

          {/* Front Light */}
          <circle cx="377" cy="107" r="2.5" fill="#FEF08A" />

          {/* Wheels */}
          <circle cx="298" cy="120" r="9" fill="#0F172A" />
          <circle cx="298" cy="120" r="4.5" fill="url(#chromeWheel)" />
          <circle cx="358" cy="120" r="9" fill="#0F172A" />
          <circle cx="358" cy="120" r="4.5" fill="url(#chromeWheel)" />
        </g>

        {/* ---------------------------------------------------- */}
        {/* VEHICLE 4: MOTO CON PASAJERO (Conductor y Pasajero) */}
        {/* ---------------------------------------------------- */}
        <g 
          className={`${jumpingVehicle === 'moto' ? 'anim-jumping' : 'anim-vibe-1'} cursor-pointer transition-transform active:scale-95`} 
          style={{ transformOrigin: '425px 120px' }}
          onClick={() => handleVehicleClick('moto')}
        >
          {/* Headlight beam */}
          <polygon points="458,110 540,98 540,135 458,118" fill="url(#headlightGlow)" className="anim-headlight" opacity="0.5" />

          {/* Passenger Figure (Back Rider with Helmet) */}
          <g>
            <circle cx="408" cy="85" r="5" fill="#2563EB" stroke="#0F172A" strokeWidth="1.5" />
            <path d="M410 84 Q413 85 411 87" stroke="#93C5FD" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M407 90 L411 100 L418 106" stroke="#1E293B" strokeWidth="3.5" strokeLinecap="round" fill="none" />
            <path d="M410 93 L421 95" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round" fill="none" />
            <path d="M412 101 L416 114" stroke="#0F172A" strokeWidth="2" strokeLinecap="round" />
          </g>

          {/* Driver Figure (Front Rider with Helmet) */}
          <g>
            <circle cx="427" cy="83" r="5.5" fill="#DC2626" stroke="#0F172A" strokeWidth="1.5" />
            <path d="M429 82 Q433 84 430 86" stroke="#FEF08A" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M426 88 L430 98 L435 107" stroke="#DC2626" strokeWidth="4" strokeLinecap="round" fill="none" />
            <path d="M428 92 L440 98" stroke="#0F172A" strokeWidth="2.5" strokeLinecap="round" fill="none" />
            <path d="M431 101 L436 115" stroke="#0F172A" strokeWidth="2.5" strokeLinecap="round" />
          </g>

          {/* Motorcycle Frame & Fuel Tank */}
          <path d="M398 114 L415 106 L434 104 L448 99 L458 108 L446 116 L418 116 Z" fill="url(#moto2Body)" stroke="#0F172A" strokeWidth="1.5" />
          {/* Seat Cushion */}
          <path d="M402 104 L432 101" stroke="#0F172A" strokeWidth="4" strokeLinecap="round" />
          {/* Handlebar & Front Fork */}
          <line x1="440" y1="96" x2="452" y2="120" stroke="#0F172A" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="437" y1="96" x2="444" y2="96" stroke="#CBD5E1" strokeWidth="2" strokeLinecap="round" />
          {/* Exhaust Pipe */}
          <path d="M414 116 L435 116 L440 114" stroke="#94A3B8" strokeWidth="2.5" strokeLinecap="round" fill="none" />

          {/* Front Headlight */}
          <circle cx="456" cy="107" r="2.5" fill="#FEF08A" />

          {/* Motorcycle Wheels */}
          <circle cx="398" cy="122" r="7.5" fill="#0F172A" />
          <circle cx="398" cy="122" r="3.5" fill="url(#chromeWheel)" />
          <circle cx="448" cy="122" r="7.5" fill="#0F172A" />
          <circle cx="448" cy="122" r="3.5" fill="url(#chromeWheel)" />
        </g>

        {/* ---------------------------------------------------- */}
        {/* VEHICLE 5: MOTO DELIVERY (Repartidor con Morral)     */}
        {/* ---------------------------------------------------- */}
        <g 
          className={`${jumpingVehicle === 'delivery' ? 'anim-jumping' : 'anim-vibe-2'} cursor-pointer transition-transform active:scale-95`} 
          style={{ transformOrigin: '530px 120px' }}
          onClick={() => handleVehicleClick('delivery')}
        >
          {/* Delivery Headlight beam cutting forward */}
          <polygon points="562,110 630,96 630,138 562,118" fill="url(#headlightGlow)" className="anim-headlight" opacity="0.75" />

          {/* Delivery Courier Square Thermal Box / Backpack on Back */}
          <rect x="492" y="74" width="22" height="22" rx="3" fill="url(#deliveryBody)" stroke="#0F172A" strokeWidth="2" />
          {/* Thermal Box Reflective Stripe */}
          <rect x="494" y="89" width="18" height="3" rx="1" fill="#FFFFFF" opacity="0.9" />
          {/* 2x3 Branding Circle & Text */}
          <circle cx="503" cy="82" r="4.5" fill="#FFFFFF" />
          <text x="503" y="84.5" fill="#EA580C" fontSize="5" fontWeight="900" textAnchor="middle">2x3</text>

          {/* Courier Driver with Full Helmet */}
          <g>
            <circle cx="522" cy="82" r="5.5" fill="#0F172A" stroke="#EA580C" strokeWidth="1.5" />
            <path d="M524 81 Q528 82 525 85" stroke="#38BDF8" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M514 88 L526 95 L538 103" stroke="#EA580C" strokeWidth="4" strokeLinecap="round" fill="none" />
            <path d="M524 99 L530 114 L536 116" stroke="#0F172A" strokeWidth="2.5" strokeLinecap="round" fill="none" />
            <path d="M526 93 L542 99" stroke="#0F172A" strokeWidth="2.5" strokeLinecap="round" fill="none" />
          </g>

          {/* Moto Delivery Frame & Fuel Tank */}
          <path d="M504 116 L524 110 L544 104 L558 103 L556 112 L544 116 Z" fill="url(#deliveryBody)" stroke="#0F172A" strokeWidth="1.5" />
          {/* Fork & Handlebars */}
          <line x1="544" y1="97" x2="554" y2="120" stroke="#0F172A" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="557" cy="107" r="3" fill="#FEF08A" />

          {/* Spoke Wheels with fast blur effect */}
          <circle cx="502" cy="122" r="7.5" fill="#0F172A" />
          <circle cx="502" cy="122" r="3.5" fill="url(#chromeWheel)" />
          <circle cx="552" cy="122" r="7.5" fill="#0F172A" />
          <circle cx="552" cy="122" r="3.5" fill="url(#chromeWheel)" />
        </g>

        {/* ---------------------------------------------------- */}
        {/* ROAD SURFACE & SPEED DASHES                          */}
        {/* ---------------------------------------------------- */}
        <g>
          {/* Road Asphalt Top Edge */}
          <line x1="0" y1="129" x2="620" y2="129" stroke="#334155" strokeWidth="2" opacity="0.8" />
          
          {/* Moving Dashed Road Lines in Loop */}
          <g className="anim-road">
            <line x1="0" y1="135" x2="1240" y2="135" stroke="#FACC15" strokeWidth="2.5" strokeDasharray="30 25" opacity="0.85" />
            <line x1="0" y1="144" x2="1240" y2="144" stroke="#FFFFFF" strokeWidth="1.5" strokeDasharray="15 35" opacity="0.4" />
          </g>
        </g>
      </svg>
    </div>
  );
}
