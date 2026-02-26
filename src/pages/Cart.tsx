import { ArrowLeft, ShoppingCart, MapPin, CreditCard, Trash2, Minus, Plus, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Cart() {
  return (
    <div className="relative flex h-full w-full flex-col overflow-x-hidden bg-background-light group/design-root">
      {/* Background Pattern */}
      <div className="absolute inset-0 food-pattern pointer-events-none z-0"></div>

      {/* Sticky Header */}
      <div className="sticky top-0 z-20 bg-surface-light/80 backdrop-blur-md px-4 pb-2 pt-4 flex items-center justify-between border-b border-neutral-light">
        <Link to="/restaurant" className="text-slate-900 flex size-12 shrink-0 items-center justify-center rounded-full hover:bg-neutral-light transition-colors cursor-pointer">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <h2 className="text-slate-900 text-lg font-bold leading-tight tracking-[-0.015em] flex-1 text-center pr-12">
          Mi Carrito
        </h2>
      </div>

      {/* Progress Steps */}
      <div className="relative z-10 px-6 py-6 w-full">
        <div className="flex items-center justify-between relative">
          {/* Line */}
          <div className="absolute left-0 top-1/2 w-full h-1 bg-neutral-light -z-10 rounded-full"></div>
          
          {/* Step 1: Cart */}
          <div className="flex flex-col items-center gap-2">
            <div className="size-8 rounded-full bg-primary flex items-center justify-center text-white ring-4 ring-background-light">
              <ShoppingCart className="w-4 h-4" />
            </div>
            <span className="text-xs font-semibold text-primary">Carrito</span>
          </div>
          
          {/* Step 2: Address */}
          <div className="flex flex-col items-center gap-2">
            <div className="size-8 rounded-full bg-neutral-light flex items-center justify-center text-slate-400 ring-4 ring-background-light">
              <MapPin className="w-4 h-4" />
            </div>
            <span className="text-xs font-medium text-slate-400">Dirección</span>
          </div>
          
          {/* Step 3: Payment */}
          <div className="flex flex-col items-center gap-2">
            <div className="size-8 rounded-full bg-neutral-light flex items-center justify-center text-slate-400 ring-4 ring-background-light">
              <CreditCard className="w-4 h-4" />
            </div>
            <span className="text-xs font-medium text-slate-400">Pago</span>
          </div>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-6 z-10 space-y-6">
        {/* Delivery Location */}
        <div className="bg-surface-light p-4 rounded-xl shadow-sm border border-neutral-light/50">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider opacity-70">Entrega en</h3>
            <button className="text-primary text-xs font-bold hover:underline">Cambiar</button>
          </div>
          <div className="flex gap-4 items-start">
            <div className="relative w-20 h-20 shrink-0 rounded-lg overflow-hidden bg-neutral-light">
              <div
                className="absolute inset-0 bg-cover bg-center opacity-80"
                style={{ backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuD8yatRRQcmxjAOtEnOyP8_gRaWx6tJ_xdH-k2LqjtvrkbKToEdDFMwhmWPpQjPzPN2KYK2IeT44f5AZSsYtDbRcJ-VqmjOBGJzbEFB98DcpFbNJPg7d9ukrg1NIYAnMrAymyjB0yD3zISMMgG0iP-qrfzzo25U1_Pn3VzqczRRf_-0CmShfJhRiivqWEGRiP2j6OKY7GGy3oqnn-wXCg2X9ryTYKKhMd0gLO-gCWSQToNS6VDClfsbXBdiXQwTTie49ky_rga9aV0')" }}
              ></div>
              <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                <MapPin className="w-6 h-6 text-white drop-shadow-md" />
              </div>
            </div>
            <div className="flex-1 flex flex-col justify-center gap-1">
              <p className="font-bold text-slate-800 text-sm">Casa Principal</p>
              <p className="text-xs text-slate-500 leading-relaxed">Av. Francisco de Miranda, Edificio Torre Europa, Piso 4, Chacao, Caracas.</p>
              <div className="flex items-center gap-1 mt-1 text-primary">
                <Clock className="w-4 h-4" />
                <span className="text-xs font-semibold">15 - 25 min</span>
              </div>
            </div>
          </div>
        </div>

        {/* Cart Items */}
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-slate-900 px-1">Tu Pedido</h3>
          
          {/* Item 1 */}
          <div className="flex items-center gap-4 bg-surface-light p-3 rounded-xl shadow-sm border border-neutral-light/50 hover:border-primary/30 transition-colors">
            <div className="shrink-0 relative">
              <div
                className="bg-center bg-no-repeat bg-cover rounded-lg size-20 shadow-inner"
                style={{ backgroundImage: 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuA_2cpiF57g0RB25aGlTCZ8awT0qdva9fAVyfNXAWx8VOPvPQORPF9sSkgFgprz8UPJyAKyArBfPo6IAv0FvzFMKdqvbPCjjKAgUOQuK15rT8LJGuK0LWVh12_Rqw4PPcrSfyW9Bl_VJ5DcCvBwx_sAceCDXN9mpzcujeUtAYd_nEZZk0G1x-5cUapoPgL9j8uvLzvmBzxPZAaldLJt6kUJ_djcVYASbAE0PlFh_87u1rjDym7RxIhozw2JIDla4WkVkepO6aDKMUg")' }}
              ></div>
            </div>
            <div className="flex flex-col flex-1 gap-1">
              <div className="flex justify-between items-start">
                <p className="text-slate-900 text-base font-bold leading-tight line-clamp-1">Arepa Reina Pepiada</p>
                <button className="text-slate-400 hover:text-red-500 transition-colors">
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
              <p className="text-slate-500 text-xs font-normal line-clamp-2">Extra aguacate, Sin cebolla</p>
              <div className="flex items-center justify-between mt-2">
                <p className="text-primary font-bold text-base">$5.00</p>
                <div className="flex items-center gap-3 bg-neutral-light rounded-full px-2 py-1">
                  <button className="size-6 flex items-center justify-center rounded-full bg-surface-light text-slate-900 shadow-sm hover:scale-110 transition-transform cursor-pointer">
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="text-sm font-bold w-4 text-center">2</span>
                  <button className="size-6 flex items-center justify-center rounded-full bg-primary text-white shadow-sm hover:scale-110 transition-transform cursor-pointer">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Item 2 */}
          <div className="flex items-center gap-4 bg-surface-light p-3 rounded-xl shadow-sm border border-neutral-light/50 hover:border-primary/30 transition-colors">
            <div className="shrink-0">
              <div
                className="bg-center bg-no-repeat bg-cover rounded-lg size-20 shadow-inner"
                style={{ backgroundImage: 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuDAwiNFn7PkXodhxBNA4Tusiy95mILnoDpua_w9Nhdp7n7H63UfBTnCzUnt8FfWyih5UpmfkMa6oWkHkmgpfCLGvvPE68ZvC4ufO90PuMijQJhhniBWIdzk3GoxB7J5-QE5C-WvODakvTSpfWnHO4PgLiB3W32vlx7_sAx1czH7lY_m6LO-3Wmm8J5VrnewGRWnBty6qU95P8jDLRwEsl3X38Z9TDYSm8BSkjG6KlfW8wIdkECCO8c3tcy4oeQJHM42rS2MFnuYWNU")' }}
              ></div>
            </div>
            <div className="flex flex-col flex-1 gap-1">
              <div className="flex justify-between items-start">
                <p className="text-slate-900 text-base font-bold leading-tight line-clamp-1">Cachapa con Queso</p>
                <button className="text-slate-400 hover:text-red-500 transition-colors">
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
              <p className="text-slate-500 text-xs font-normal line-clamp-2">Queso de mano doble</p>
              <div className="flex items-center justify-between mt-2">
                <p className="text-primary font-bold text-base">$8.50</p>
                <div className="flex items-center gap-3 bg-neutral-light rounded-full px-2 py-1">
                  <button className="size-6 flex items-center justify-center rounded-full bg-surface-light text-slate-900 shadow-sm hover:scale-110 transition-transform cursor-pointer">
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="text-sm font-bold w-4 text-center">1</span>
                  <button className="size-6 flex items-center justify-center rounded-full bg-primary text-white shadow-sm hover:scale-110 transition-transform cursor-pointer">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Summary */}
        <div className="bg-surface-light p-5 rounded-2xl shadow-sm space-y-3 mt-4">
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Subtotal</span>
            <span className="font-semibold text-slate-900">$18.50</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Delivery</span>
            <span className="font-semibold text-slate-900">$2.00</span>
          </div>
          <div className="h-px bg-neutral-light w-full my-2"></div>
          <div className="flex justify-between items-end">
            <span className="text-slate-900 font-bold text-lg">Total</span>
            <div className="flex flex-col items-end">
              <span className="text-2xl font-extrabold text-primary">$20.50</span>
              <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Incl. Impuestos</span>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div className="sticky bottom-6 mt-6">
          <button className="w-full bg-primary hover:bg-orange-600 text-white font-bold text-lg py-4 rounded-xl shadow-lg shadow-orange-200 transition-all transform active:scale-95 flex items-center justify-center gap-2 group">
            Confirmar Pedido
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </div>
    </div>
  );
}

// Helper component for Clock icon since it was missing in the import
function Clock(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}
