import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Sparkles } from 'lucide-react';
import { vibrate } from '../utils/haptics';

export interface CardBannerItem {
  id?: string;
  title: string;
  subtitle?: string;
  explanation?: string;
  imageUrl?: string;
  linkUrl?: string;
  actionType?: string;
  restaurantId?: string;
  bgColor?: string;
  textColor?: string;
  isActive?: boolean;
  rawBanner?: any;
}

interface HomePromotionCardProps {
  cards?: CardBannerItem[];
  disclaimerText?: string;
  showDisclaimer?: boolean;
  onCardClick?: (card: CardBannerItem) => void;
}

const DEFAULT_DISCLAIMER =
  "Grupo Un 2x3 VE, C.A. (RIF J-cambiar Rif-0) no está autorizado por la Superintendencia de Instituciones del Sector Bancario (SUDEBAN) para intermediar o fungir como pasarela de pagos entre clientes y comercios. Grupo Un 2x3 es un portal que ofrece a los clientes acceder a compras a plazo en comercios afiliados pero son estos últimos quienes otorgan dicho beneficio. Los clientes abonarán o depositarán los pagos o cuotas directamente en las cuentas bancarias de los comercios.";

export default function HomePromotionCard({
  cards,
  disclaimerText = DEFAULT_DISCLAIMER,
  showDisclaimer = true,
  onCardClick,
}: HomePromotionCardProps) {
  const navigate = useNavigate();

  // Active cards
  const activeCards = (cards && cards.length > 0)
    ? cards.filter(c => c.isActive !== false)
    : [
        {
          id: 'default-ally-card',
          title: 'Creemos en tu negocio.',
          subtitle: 'Regístrate como aliado en Un 2x3.',
          linkUrl: '/profile',
          bgColor: '#FEF9C3',
        }
      ];

  const handleCardClick = (card: CardBannerItem) => {
    vibrate(20);
    if (onCardClick) {
      onCardClick(card);
      return;
    }
    const linkUrl = card.linkUrl;
    if (!linkUrl) return;
    if (linkUrl.startsWith('http://') || linkUrl.startsWith('https://')) {
      window.open(linkUrl, '_blank', 'noopener,noreferrer');
    } else {
      navigate(linkUrl);
    }
  };

  return (
    <section className="px-5 mt-6 mb-4">
      {/* Cards Row / Carousel */}
      <div className="flex gap-4 overflow-x-auto hide-scrollbar pb-2 pt-1 -mx-1 px-1 snap-x snap-mandatory">
        {activeCards.map((card, idx) => (
          <div
            key={card.id || idx}
            onClick={() => handleCardClick(card)}
            style={{ backgroundColor: card.bgColor || '#FEF9C3' }}
            className="w-[280px] sm:w-[320px] shrink-0 h-[360px] rounded-[2.25rem] border border-amber-200/80 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.06)] p-6 flex flex-col justify-between relative overflow-hidden group cursor-pointer active:scale-[0.98] transition-all snap-start"
          >
            {/* Top texts */}
            <div className="relative z-10 space-y-1.5">
              <h3 className="text-2xl font-black text-slate-900 tracking-tight leading-tight">
                {card.title}
              </h3>
              {card.subtitle && (
                <p className="text-sm font-semibold text-slate-700 leading-snug">
                  {card.subtitle}
                </p>
              )}
            </div>

            {/* Illustration / Graphic */}
            <div className="relative z-10 w-full flex-1 flex items-center justify-center my-2">
              {card.imageUrl ? (
                <img
                  src={card.imageUrl}
                  alt={card.title}
                  className="max-h-48 w-auto object-contain drop-shadow-sm group-hover:scale-105 transition-transform duration-300"
                />
              ) : (
                /* High fidelity SVG matching Image 2: Two figures helping each other climb yellow block steps */
                <svg
                  viewBox="0 0 320 260"
                  className="w-full h-full max-h-48 drop-shadow-sm group-hover:scale-105 transition-transform duration-300"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  {/* Step 1 */}
                  <rect x="50" y="160" width="55" height="90" rx="3" fill="#FACC15" stroke="#1E293B" strokeWidth="2.5" />
                  {/* Step 2 */}
                  <rect x="115" y="125" width="55" height="125" rx="3" fill="#FACC15" stroke="#1E293B" strokeWidth="2.5" />
                  {/* Step 3 */}
                  <rect x="180" y="90" width="60" height="160" rx="3" fill="#FACC15" stroke="#1E293B" strokeWidth="2.5" />

                  {/* Character 1 (Lower, climbing up from step 1 to 2) */}
                  <g className="transition-transform group-hover:-translate-y-1 duration-300">
                    {/* Head */}
                    <path
                      d="M85 85 C95 85 102 93 100 105 C98 115 88 118 78 112 C72 108 72 95 80 88 C82 86 85 85 85 85 Z"
                      fill="#FFFFFF"
                      stroke="#1E293B"
                      strokeWidth="2.5"
                    />
                    {/* Smile and eye */}
                    <circle cx="88" cy="98" r="1.5" fill="#1E293B" />
                    <path d="M84 104 Q90 108 94 102" stroke="#1E293B" strokeWidth="2" fill="none" strokeLinecap="round" />
                    {/* Torso */}
                    <path
                      d="M82 114 C90 120 95 135 90 150 C80 155 72 145 74 130 Z"
                      fill="#FFFFFF"
                      stroke="#1E293B"
                      strokeWidth="2.5"
                    />
                    {/* Left Leg on Step 1 */}
                    <path
                      d="M74 148 L65 175 C60 178 72 182 75 175 L82 152 Z"
                      fill="#FFFFFF"
                      stroke="#1E293B"
                      strokeWidth="2.5"
                    />
                    {/* Right Leg stepping forward onto Step 2 */}
                    <path
                      d="M90 148 L115 142 C120 145 118 152 110 150 L95 158 Z"
                      fill="#FFFFFF"
                      stroke="#1E293B"
                      strokeWidth="2.5"
                    />
                    {/* Arm reaching up to hold hands */}
                    <path
                      d="M88 122 Q115 105 145 102"
                      stroke="#1E293B"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                      fill="none"
                    />
                  </g>

                  {/* Character 2 (Higher, leaning down from step 3 to pull character 1) */}
                  <g className="transition-transform group-hover:translate-x-0.5 duration-300">
                    {/* Head */}
                    <path
                      d="M205 50 C215 50 225 60 220 75 C215 85 200 88 190 80 C182 72 185 58 198 52 C200 51 205 50 205 50 Z"
                      fill="#FFFFFF"
                      stroke="#1E293B"
                      strokeWidth="2.5"
                    />
                    {/* Smile and eye */}
                    <circle cx="198" cy="65" r="1.5" fill="#1E293B" />
                    <path d="M192 72 Q198 76 204 70" stroke="#1E293B" strokeWidth="2" fill="none" strokeLinecap="round" />
                    {/* Torso leaning forward */}
                    <path
                      d="M195 82 C185 95 180 115 200 125 C215 120 225 100 215 82 Z"
                      fill="#FFFFFF"
                      stroke="#1E293B"
                      strokeWidth="2.5"
                    />
                    {/* Legs standing on step 3 */}
                    <path
                      d="M200 125 L195 155 C190 158 202 162 205 155 L210 125 Z"
                      fill="#FFFFFF"
                      stroke="#1E293B"
                      strokeWidth="2.5"
                    />
                    <path
                      d="M212 125 L218 152 C214 156 226 160 228 153 L222 123 Z"
                      fill="#FFFFFF"
                      stroke="#1E293B"
                      strokeWidth="2.5"
                    />
                    {/* Arm reaching down to clasp hand */}
                    <path
                      d="M192 92 Q165 98 145 102"
                      stroke="#1E293B"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                      fill="none"
                    />
                  </g>

                  {/* Clasping Handshake Detail */}
                  <circle cx="145" cy="102" r="5" fill="#FFFFFF" stroke="#1E293B" strokeWidth="2.5" />
                </svg>
              )}
            </div>

            {/* Bottom link indicator */}
            <div className="relative z-10 flex items-center justify-between pt-1">
              <span className="text-xs font-black text-slate-800 tracking-wide uppercase flex items-center gap-1">
                Conoce más <ArrowRight className="w-3.5 h-3.5 text-slate-900 group-hover:translate-x-1 transition-transform" />
              </span>
              <div className="w-8 h-8 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center text-slate-900 shadow-sm border border-black/5 group-hover:bg-white transition-colors">
                <Sparkles className="w-4 h-4 text-amber-500" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* SUDEBAN Legal Disclaimer directly beneath the card */}
      {showDisclaimer && disclaimerText && (
        <div className="mt-4 px-1">
          <p className="text-[11px] sm:text-xs text-slate-500 text-justify sm:text-left leading-relaxed font-normal">
            {disclaimerText}
          </p>
        </div>
      )}
    </section>
  );
}
