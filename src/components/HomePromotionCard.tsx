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
  const activeCards = (cards || []).filter(c => c.isActive !== false);

  if (activeCards.length === 0 && (!showDisclaimer || !disclaimerText)) {
    return null;
  }

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
    <section className={`px-5 ${activeCards.length > 0 ? 'mt-6 mb-4' : 'mt-2 mb-4'}`}>
      {/* Cards Row / Carousel */}
      {activeCards.length > 0 && (
        <div className="flex gap-4 overflow-x-auto hide-scrollbar pb-2 pt-1 -mx-1 px-1 snap-x snap-mandatory">
        {activeCards.map((card, idx) => (
          <div
            key={card.id || idx}
            onClick={() => handleCardClick(card)}
            style={{ backgroundColor: card.bgColor || '#FEF9C3' }}
            className="w-[280px] sm:w-[320px] shrink-0 rounded-3xl border border-amber-200/80 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.06)] flex flex-col relative overflow-hidden group cursor-pointer active:scale-[0.98] transition-all snap-start"
          >
            {/* Parte Superior: Única zona libre de la imagen */}
            <div className="p-6 pb-4 relative z-10 space-y-1.5">
              <h3 className="text-2xl font-black text-slate-900 tracking-tight leading-tight">
                {card.title}
              </h3>
              {card.subtitle && (
                <p className="text-sm font-semibold text-slate-700 leading-snug">
                  {card.subtitle}
                </p>
              )}
            </div>

            {/* Parte Inferior: Imagen rellenando todo el cuadro sin márgenes */}
            <div className="w-full flex-1 relative p-0 m-0 min-h-[220px]">
              {card.imageUrl ? (
                <img
                  src={card.imageUrl}
                  alt={card.title}
                  className="w-full h-full object-cover block group-hover:scale-105 transition-transform duration-300"
                />
              ) : (
                /* Fallback SVG ilustrativo */
                <div className="w-full h-full flex items-center justify-center p-4">
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

                    {/* Character 1 */}
                    <g className="transition-transform group-hover:-translate-y-1 duration-300">
                      <path
                        d="M85 85 C95 85 102 93 100 105 C98 115 88 118 78 112 C72 108 72 95 80 88 C82 86 85 85 85 85 Z"
                        fill="#FFFFFF"
                        stroke="#1E293B"
                        strokeWidth="2.5"
                      />
                      <circle cx="88" cy="98" r="1.5" fill="#1E293B" />
                      <path d="M84 104 Q90 108 94 102" stroke="#1E293B" strokeWidth="2" fill="none" strokeLinecap="round" />
                      <path
                        d="M82 114 C90 120 95 135 90 150 C80 155 72 145 74 130 Z"
                        fill="#FFFFFF"
                        stroke="#1E293B"
                        strokeWidth="2.5"
                      />
                      <path
                        d="M74 148 L65 175 C60 178 72 182 75 175 L82 152 Z"
                        fill="#FFFFFF"
                        stroke="#1E293B"
                        strokeWidth="2.5"
                      />
                      <path
                        d="M90 148 L115 142 C120 145 118 152 110 150 L95 158 Z"
                        fill="#FFFFFF"
                        stroke="#1E293B"
                        strokeWidth="2.5"
                      />
                      <path
                        d="M88 122 Q115 105 145 102"
                        stroke="#1E293B"
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        fill="none"
                      />
                    </g>

                    {/* Character 2 */}
                    <g className="transition-transform group-hover:translate-x-0.5 duration-300">
                      <path
                        d="M205 50 C215 50 225 60 220 75 C215 85 200 88 190 80 C182 72 185 58 198 52 C200 51 205 50 205 50 Z"
                        fill="#FFFFFF"
                        stroke="#1E293B"
                        strokeWidth="2.5"
                      />
                      <circle cx="198" cy="65" r="1.5" fill="#1E293B" />
                      <path d="M192 72 Q198 76 204 70" stroke="#1E293B" strokeWidth="2" fill="none" strokeLinecap="round" />
                      <path
                        d="M195 82 C185 95 180 115 200 125 C215 120 225 100 215 82 Z"
                        fill="#FFFFFF"
                        stroke="#1E293B"
                        strokeWidth="2.5"
                      />
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
                      <path
                        d="M192 92 Q165 98 145 102"
                        stroke="#1E293B"
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        fill="none"
                      />
                    </g>

                    <circle cx="145" cy="102" r="5" fill="#FFFFFF" stroke="#1E293B" strokeWidth="2.5" />
                  </svg>
                </div>
              )}

              {/* Degradado inferior para contraste óptimo */}
              <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/40 via-black/10 to-transparent pointer-events-none" />

              {/* Conoce más badge visible al 100% sin recortarse */}
              <div className="absolute bottom-4 left-5 right-5 z-20 flex items-center justify-between pointer-events-none">
                <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/95 text-slate-900 text-xs font-black tracking-wide uppercase shadow-lg backdrop-blur-sm border border-black/5 group-hover:bg-white transition-all">
                  <span>Conoce más</span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-900 group-hover:translate-x-1 transition-transform" />
                </span>
                <div className="w-8 h-8 rounded-full bg-white/95 text-slate-900 shadow-lg backdrop-blur-sm flex items-center justify-center border border-black/5 group-hover:scale-110 transition-transform">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      )}

      {/* SUDEBAN Legal Disclaimer directly beneath the card */}
      {showDisclaimer && disclaimerText && (
        <div className={`${activeCards.length > 0 ? 'mt-4' : 'mt-1'} px-1`}>
          <p className="text-[11px] sm:text-xs text-slate-500 text-justify sm:text-left leading-relaxed font-normal">
            {disclaimerText}
          </p>
        </div>
      )}
    </section>
  );
}
