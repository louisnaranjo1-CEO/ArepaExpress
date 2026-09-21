import React from 'react';
import { ChevronRight, Store } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { vibrate } from '../utils/haptics';

interface StoreItem {
  id: string;
  name: string;
  logoUrl?: string;
  image?: string;
  category?: string;
  distance?: string;
}

interface AvailableStoresRowProps {
  restaurants: StoreItem[];
  cityName?: string;
}

export default function AvailableStoresRow({ restaurants, cityName }: AvailableStoresRowProps) {
  const navigate = useNavigate();

  if (!restaurants || restaurants.length === 0) {
    return null;
  }

  return (
    <section className="px-5 mt-4 mb-2">
      <div className="bg-white rounded-3xl p-4 shadow-[0_2px_15px_-4px_rgba(0,0,0,0.06)] border border-slate-100">
        {/* Header link */}
        <button
          onClick={() => {
            vibrate(15);
            navigate('/search');
          }}
          className="w-full flex items-center justify-between group text-left mb-3.5"
        >
          <div className="flex items-center gap-2">
            <h3 className="text-sm md:text-base font-extrabold text-slate-900 tracking-tight group-hover:text-amber-600 transition-colors">
              Ver todas las tiendas disponibles
            </h3>
          </div>
          <div className="w-7 h-7 rounded-full bg-slate-50 group-hover:bg-amber-50 group-hover:text-amber-600 flex items-center justify-center text-slate-500 transition-all">
            <ChevronRight className="w-4 h-4" />
          </div>
        </button>

        {/* Horizontal scroll of store logos */}
        <div className="flex items-center gap-3 overflow-x-auto hide-scrollbar pb-1 pt-0.5 -mx-1 px-1">
          {restaurants.map((restaurant) => {
            const logo = restaurant.logoUrl || restaurant.image;
            return (
              <button
                key={restaurant.id}
                onClick={() => {
                  vibrate(20);
                  navigate(`/restaurant/${restaurant.id}`);
                }}
                className="flex flex-col items-center gap-1 shrink-0 group focus:outline-none"
                title={restaurant.name}
              >
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white border border-slate-100 shadow-sm group-hover:shadow-md group-hover:border-amber-400/50 group-active:scale-95 transition-all duration-200 p-2 flex items-center justify-center overflow-hidden relative">
                  {logo ? (
                    <img
                      src={logo}
                      alt={restaurant.name}
                      className="w-full h-full object-contain filter group-hover:contrast-105"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl flex items-center justify-center text-white font-black text-xs shadow-inner">
                      {restaurant.name?.slice(0, 2).toUpperCase() || <Store className="w-5 h-5 text-white" />}
                    </div>
                  )}
                </div>
                <span className="text-[10px] font-bold text-slate-600 group-hover:text-slate-900 max-w-[64px] truncate text-center leading-tight">
                  {restaurant.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
