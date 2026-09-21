import React from 'react';

export default function SpeedFleetAnimation() {
  return (
    <div className="relative w-full max-w-lg mx-auto h-36 sm:h-40 overflow-hidden select-none pointer-events-none flex flex-col justify-end">
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

      {/* Wind & Speed Lines in Background */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        <div className="absolute top-4 w-24 h-[1.5px] bg-gradient-to-l from-white/60 via-amber-300/40 to-transparent rounded-full anim-wind-fast" style={{ animationDelay: '0s' }}></div>
        <div className="absolute top-10 w-36 h-[1px] bg-gradient-to-l from-white/70 via-cyan-300/30 to-transparent rounded-full anim-wind-mid" style={{ animationDelay: '0.2s' }}></div>
        <div className="absolute top-16 w-20 h-[1.5px] bg-gradient-to-l from-white/50 to-transparent rounded-full anim-wind-fast" style={{ animationDelay: '0.4s' }}></div>
        <div className="absolute top-22 w-44 h-[1px] bg-gradient-to-l from-amber-400/60 to-transparent rounded-full anim-wind-mid" style={{ animationDelay: '0.1s' }}></div>
        <div className="absolute top-28 w-28 h-[2px] bg-gradient-to-l from-yellow-300/50 to-transparent rounded-full anim-wind-fast" style={{ animationDelay: '0.3s' }}></div>
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
          <linearGradient id="mototaxiBody" x1="0%" y1="0%" x2="100%" y2="0%">
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
        <g className="anim-vibe-2" style={{ transformOrigin: '70px 115px' }}>
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
            {/* Back wheels */}
            <circle cx="28" cy="116" r="11" fill="#0F172A" />
            <circle cx="28" cy="116" r="6" fill="url(#chromeWheel)" />
            <circle cx="50" cy="116" r="11" fill="#0F172A" />
            <circle cx="50" cy="116" r="6" fill="url(#chromeWheel)" />
            {/* Front wheel */}
            <circle cx="114" cy="116" r="11" fill="#0F172A" />
            <circle cx="114" cy="116" r="6" fill="url(#chromeWheel)" />
          </g>
        </g>

        {/* ---------------------------------------------------- */}
        {/* VEHICLE 2: CAMIONETA TAXI (SUV / Pickup Taxi, Mid-lane) */}
        {/* ---------------------------------------------------- */}
        <g className="anim-vibe-1" style={{ transformOrigin: '195px 120px' }}>
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
          <text x="196" y="80" fill="#0F172A" fontSize="5.5" fontWeight="900" textAnchor="middle">TAXI</text>

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
        <g className="anim-vibe-3" style={{ transformOrigin: '320px 122px' }}>
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
        {/* VEHICLE 4: MOTOTAXI (Passenger & Driver with Canopy) */}
        {/* ---------------------------------------------------- */}
        <g className="anim-vibe-1" style={{ transformOrigin: '425px 120px' }}>
          {/* Mototaxi Canopy & Frame */}
          <path d="M394 84 Q414 74 438 84" stroke="#DC2626" strokeWidth="3.5" strokeLinecap="round" fill="none" />
          <line x1="395" y1="85" x2="397" y2="114" stroke="#1E293B" strokeWidth="2" />
          <line x1="436" y1="85" x2="433" y2="108" stroke="#1E293B" strokeWidth="2" />

          {/* Driver figure */}
          <circle cx="426" cy="92" r="4" fill="#FBBF24" stroke="#0F172A" strokeWidth="1.5" />
          <path d="M424 96 L421 108 L428 114" stroke="#1E293B" strokeWidth="2.5" strokeLinecap="round" fill="none" />

          {/* Passenger figure */}
          <circle cx="406" cy="94" r="4" fill="#60A5FA" stroke="#0F172A" strokeWidth="1.5" />
          <path d="M405 98 L405 109 L412 114" stroke="#1E293B" strokeWidth="2.5" strokeLinecap="round" fill="none" />

          {/* Mototaxi Chassis */}
          <path d="M392 114 L440 114 L444 104 L432 104 Z" fill="url(#mototaxiBody)" stroke="#0F172A" strokeWidth="1.5" />

          {/* Taxi Plate badge */}
          <rect x="408" y="103" width="16" height="6" rx="1.5" fill="#FACC15" stroke="#0F172A" strokeWidth="1" />
          <text x="416" y="108" fill="#0F172A" fontSize="4" fontWeight="900" textAnchor="middle">MOTO</text>

          {/* Mototaxi Wheels */}
          <circle cx="398" cy="122" r="7.5" fill="#0F172A" />
          <circle cx="398" cy="122" r="3.5" fill="url(#chromeWheel)" />
          <circle cx="438" cy="122" r="7.5" fill="#0F172A" />
          <circle cx="438" cy="122" r="3.5" fill="url(#chromeWheel)" />
        </g>

        {/* ---------------------------------------------------- */}
        {/* VEHICLE 5: MOTO DELIVERY (Agile front leader with box) */}
        {/* ---------------------------------------------------- */}
        <g className="anim-vibe-2" style={{ transformOrigin: '530px 120px' }}>
          {/* Delivery Headlight beam cutting forward */}
          <polygon points="562,110 630,96 630,138 562,118" fill="url(#headlightGlow)" className="anim-headlight" opacity="0.75" />

          {/* Delivery Courier Backpack / Thermal Box with 2X3 branding */}
          <rect x="480" y="85" width="22" height="22" rx="4" fill="url(#deliveryBody)" stroke="#0F172A" strokeWidth="2" />
          <circle cx="491" cy="94" r="5" fill="#FFFFFF" />
          <text x="491" y="96.5" fill="#EA580C" fontSize="5.5" fontWeight="900" textAnchor="middle">2x3</text>
          <rect x="483" y="102" width="16" height="2" fill="#FFFFFF" opacity="0.8" />

          {/* Driver leaning aggressively forward */}
          <circle cx="510" cy="91" r="4.5" fill="#0F172A" />
          {/* Driver helmet visor */}
          <path d="M512 90 Q515 91 513 93" stroke="#38BDF8" strokeWidth="1.5" strokeLinecap="round" />
          {/* Rider body & arms reaching handlebar */}
          <path d="M504 97 L516 102 L528 107" stroke="#EA580C" strokeWidth="3.5" strokeLinecap="round" fill="none" />
          <path d="M512 102 L518 114 L525 116" stroke="#0F172A" strokeWidth="2.5" strokeLinecap="round" fill="none" />

          {/* Moto Delivery Frame */}
          <path d="M492 118 L516 112 L538 112 L556 106 L548 118 Z" fill="url(#deliveryBody)" stroke="#0F172A" strokeWidth="1.5" />
          {/* Fork & Handlebar */}
          <line x1="538" y1="104" x2="550" y2="122" stroke="#0F172A" strokeWidth="2" strokeLinecap="round" />
          <circle cx="557" cy="110" r="2.5" fill="#FEF08A" />

          {/* Spoke Wheels with fast blur effect */}
          <circle cx="490" cy="122" r="8" fill="#0F172A" />
          <circle cx="490" cy="122" r="4" fill="url(#chromeWheel)" />
          <circle cx="550" cy="122" r="8" fill="#0F172A" />
          <circle cx="550" cy="122" r="4" fill="url(#chromeWheel)" />
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
