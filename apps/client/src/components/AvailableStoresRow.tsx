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
    <section className="px-4 mt-2 mb-1">
      <div className="bg-white rounded-3xl p-3.5 shadow-xs border border-slate-100">
        {/* Header link */}
        <button
          onClick={() => {
            vibrate(15);
            navigate('/search');
          }}
          className="w-full flex items-center justify-between group text-left mb-2.5"
        >
          <div className="flex items-center gap-2">
            <h3 className="text-sm md:text-base font-extrabold text-slate-900 tracking-tight group-hover:text-primary transition-colors">
              Tiendas en tu zona
            </h3>
          </div>
          <div className="flex items-center gap-1 text-slate-400 group-hover:text-primary text-xs font-bold transition-all">
            <span>Ver todas</span>
            <ChevronRight className="w-4 h-4" />
          </div>
        </button>

        {/* Horizontal scroll of store logos */}
        <div className="flex items-center gap-2.5 overflow-x-auto hide-scrollbar pb-0.5 pt-0.5 -mx-0.5 px-0.5">
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
                <div className="w-16 h-16 sm:w-18 sm:h-18 rounded-2xl bg-slate-100 border border-slate-200/90 shadow-2xs group-hover:shadow-md group-hover:border-primary group-active:scale-95 transition-all duration-200 overflow-hidden relative flex items-center justify-center p-0">
                  {logo ? (
                    <img
                      src={logo}
                      alt={restaurant.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-slate-950 font-black text-xs shadow-inner">
                      {restaurant.name?.slice(0, 2).toUpperCase() || <Store className="w-6 h-6 text-slate-900" />}
                    </div>
                  )}
                </div>
                <span className="text-[10px] font-bold text-slate-700 group-hover:text-slate-900 max-w-[68px] truncate text-center leading-tight">
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
