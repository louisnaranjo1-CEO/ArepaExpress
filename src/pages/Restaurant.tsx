import { ArrowLeft, Search, Heart, Star, Clock, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Restaurant() {
  return (
    <div className="relative w-full bg-background-light group/design-root overflow-x-hidden flex flex-col">
      {/* Hero Image & Navigation */}
      <div className="relative w-full h-64 md:h-80 shrink-0">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: 'linear-gradient(180deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0) 40%, rgba(0,0,0,0.6) 100%), url("https://lh3.googleusercontent.com/aida-public/AB6AXuBVj9A2SrTWa77CSptRVKpMD8ME0URYJwjQtA37ZU7AdFDIbYLxHXTkuQpkgWItCTkNK3xrSwk-61uVYx38gNOI_BzIQeP-fC4LcuQ5X2fIPgxcsxou1WURzcbjX8APtsvFSDLS1cLfAin8L6k1pu-xT08RdjS-KJ40u0R4aeUgCSkGejZYo8-EyGxR3s4dpkZj8r5Ho1mQkm5HC4IR7GRZfdIcQD_ah1Nw0Se2ehWm3xS9aOlLvATBOCA_xKxW7-N8ajCLjwal9Zk")'
          }}
        ></div>
        
        {/* Nav Icons */}
        <div className="absolute top-0 left-0 w-full p-4 pt-12 flex justify-between items-center z-10">
          <Link to="/" className="flex items-center justify-center w-10 h-10 rounded-full bg-white/20 backdrop-blur-md text-white hover:bg-white/30 transition-colors">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div className="flex gap-3">
            <button className="flex items-center justify-center w-10 h-10 rounded-full bg-white/20 backdrop-blur-md text-white hover:bg-white/30 transition-colors">
              <Search className="w-5 h-5" />
            </button>
            <button className="flex items-center justify-center w-10 h-10 rounded-full bg-white/20 backdrop-blur-md text-white hover:bg-white/30 transition-colors">
              <Heart className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Restaurant Title overlay */}
        <div className="absolute bottom-0 left-0 w-full p-5 text-white">
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight leading-tight drop-shadow-md">La Arepa Dorada</h1>
        </div>
      </div>

      {/* Restaurant Info */}
      <div className="px-5 py-4 bg-background-light -mt-4 rounded-t-3xl relative z-20 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-primary text-sm font-bold">
              <Star className="w-5 h-5 fill-primary" />
              <span>4.8</span>
              <span className="text-slate-500 font-normal">(200+ reseñas)</span>
            </div>
            <div className="flex items-center gap-1 text-slate-500 text-sm">
              <Clock className="w-4 h-4" />
              <span>15-25 min</span>
            </div>
          </div>
          <p className="text-slate-600 text-sm leading-relaxed">
            Venezolana • Arepas • Cachapas • $$
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span className="px-3 py-1 bg-primary/10 text-primary text-xs font-bold rounded-full">Envío Gratis</span>
            <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full">Promo 2x1</span>
          </div>
        </div>
      </div>

      {/* Recommended Section (Horizontal Scroll) */}
      <div className="mt-2">
        <div className="flex items-center justify-between px-5 mb-3">
          <h3 className="text-lg font-bold text-slate-900">Recomendados</h3>
          <button className="text-primary text-sm font-semibold hover:underline">Ver todo</button>
        </div>
        <div className="flex overflow-x-auto gap-4 px-5 pb-4 hide-scrollbar snap-x">
          {/* Card 1 */}
          <div className="flex-none w-60 snap-center">
            <div className="relative h-36 w-full rounded-xl overflow-hidden mb-3">
              <div className="absolute top-2 right-2 bg-white rounded-full p-1 shadow-sm z-10">
                <Heart className="w-4 h-4 text-primary fill-primary" />
              </div>
              <div
                className="bg-cover bg-center h-full w-full transform hover:scale-105 transition-transform duration-300"
                style={{ backgroundImage: 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuACRkOwNvN9RPa4cnHXCQnniZ3I6fg5AoSrgczcPzzuaK5VzHZPn35tifhpdrrXaxtqVBVKDrrtrY4Wc-hO62caNVRD_nBrFtJEzRBvN9RLQW0h92oZupwRJ-F3EliE3I7f1Yvt-R2h3fQ5YfUWsDB5rRGTH46I3gzPcBwXHNtoIPcT1GlJzkirlndrfPtzfpbGhw-0lGopXCW8RI383Y-04VT3Q7YukCUeKpvlXPnJ_OCK9fMhRlQ9Dle4vej0tHxOVZ6B3v28a84")' }}
              ></div>
            </div>
            <h4 className="font-bold text-slate-900 truncate">Reina Pepiada</h4>
            <p className="text-xs text-slate-500 line-clamp-1">Pollo, aguacate y mayonesa</p>
            <div className="flex items-center justify-between mt-2">
              <span className="font-bold text-slate-900">$5.50</span>
              <button className="bg-primary text-white w-8 h-8 flex items-center justify-center rounded-full shadow-lg shadow-primary/30">
                <Plus className="w-4 h-4 font-bold" />
              </button>
            </div>
          </div>
          {/* Card 2 */}
          <div className="flex-none w-60 snap-center">
            <div className="relative h-36 w-full rounded-xl overflow-hidden mb-3">
              <div className="absolute top-2 right-2 bg-white rounded-full p-1 shadow-sm z-10">
                <Heart className="w-4 h-4 text-slate-300" />
              </div>
              <div
                className="bg-cover bg-center h-full w-full transform hover:scale-105 transition-transform duration-300"
                style={{ backgroundImage: 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuB3inqyk3DHOdTyqDL6BDKrkbKdTdUu0Wke0rZE9Dv-klRPZIKOAuoa3wrOsqw3g6BL80-90ey17XqN7dnxw5KIGhnBtXwMb-kSzO_se4gmqbuITLE0zNimVTExK8B-1cveIodRzl1B4_JE3qLdwOR0WYV6Mj5GcPJQVcmRYxIbmtGTAXl2drEF3z06VnSAz1dJhEmeXoHXD1UHFXpfYeSr5INgWbJ7NupM0EmNzrnmKZ5l6l9tzHNOHeKdEN3WQzd7w5ZX1MaZXc8")' }}
              ></div>
            </div>
            <h4 className="font-bold text-slate-900 truncate">Cachapa con Queso</h4>
            <p className="text-xs text-slate-500 line-clamp-1">Maíz tierno con queso de mano</p>
            <div className="flex items-center justify-between mt-2">
              <span className="font-bold text-slate-900">$8.00</span>
              <button className="bg-primary text-white w-8 h-8 flex items-center justify-center rounded-full shadow-lg shadow-primary/30">
                <Plus className="w-4 h-4 font-bold" />
              </button>
            </div>
          </div>
          {/* Card 3 */}
          <div className="flex-none w-60 snap-center">
            <div className="relative h-36 w-full rounded-xl overflow-hidden mb-3">
              <div className="absolute top-2 right-2 bg-white rounded-full p-1 shadow-sm z-10">
                <Heart className="w-4 h-4 text-slate-300" />
              </div>
              <div
                className="bg-cover bg-center h-full w-full transform hover:scale-105 transition-transform duration-300"
                style={{ backgroundImage: 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuAb1jGCEOghVenL10G-lC_AaaTP9QSzKOWRx0BIaOu9Lqic_ufJgVTMPgyiyfGPAc3nVXR9oxUsiQyixjb29R5U83a-0K6GVCwX4NQhb8r0ophfrG3a_Lk7w6hQHLgSVdfO47sqsPnteI4KkrjBOvMhcbVK0px3ZdmPIQkbZctc35tN15uzbhZ-BD8spBOX_aptAoJQfWseLjf34m8D7yzrMC2MJLgreSw6biCh0XJH_8ch0KZktP_zv-CXP4w2o7e0-L89dHKndBA")' }}
              ></div>
            </div>
            <h4 className="font-bold text-slate-900 truncate">Ración de Tequeños (6)</h4>
            <p className="text-xs text-slate-500 line-clamp-1">Dedos de queso con salsa</p>
            <div className="flex items-center justify-between mt-2">
              <span className="font-bold text-slate-900">$4.50</span>
              <button className="bg-primary text-white w-8 h-8 flex items-center justify-center rounded-full shadow-lg shadow-primary/30">
                <Plus className="w-4 h-4 font-bold" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Categories Tabs */}
      <div className="sticky top-0 z-40 bg-background-light/95 backdrop-blur-sm border-b border-slate-200 pb-2 pt-2">
        <div className="flex overflow-x-auto gap-2 px-5 hide-scrollbar">
          <button className="px-5 py-2.5 bg-primary text-white rounded-full text-sm font-bold whitespace-nowrap shadow-md shadow-primary/20">
            Arepas
          </button>
          <button className="px-5 py-2.5 bg-white text-slate-600 rounded-full text-sm font-semibold whitespace-nowrap border border-slate-100">
            Entradas
          </button>
          <button className="px-5 py-2.5 bg-white text-slate-600 rounded-full text-sm font-semibold whitespace-nowrap border border-slate-100">
            Platos Principales
          </button>
          <button className="px-5 py-2.5 bg-white text-slate-600 rounded-full text-sm font-semibold whitespace-nowrap border border-slate-100">
            Bebidas
          </button>
          <button className="px-5 py-2.5 bg-white text-slate-600 rounded-full text-sm font-semibold whitespace-nowrap border border-slate-100">
            Postres
          </button>
        </div>
      </div>

      {/* Menu List */}
      <div className="px-5 pb-28 flex-1">
        {/* Category Header */}
        <div className="pt-6 pb-4">
          <h2 className="text-xl font-bold text-slate-900">Arepas Clásicas</h2>
        </div>

        {/* List Item 1 */}
        <div className="flex gap-4 py-4 border-b border-slate-100 group">
          <div className="flex-1 flex flex-col justify-between">
            <div>
              <h3 className="font-bold text-slate-900 text-base mb-1">Pelúa</h3>
              <p className="text-sm text-slate-500 line-clamp-2">Carne mechada jugosa con queso amarillo rallado.</p>
            </div>
            <div className="flex items-center gap-3 mt-3">
              <span className="font-bold text-slate-900 text-base">$6.00</span>
              <span className="text-xs text-slate-400 font-medium">Bs. 216,00</span>
            </div>
          </div>
          <div className="relative shrink-0 w-24 h-24 sm:w-28 sm:h-28">
            <div
              className="w-full h-full rounded-xl bg-cover bg-center"
              style={{ backgroundImage: 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuBhuulea-C3o-F4Xnaxb_05Snqa3rwgyZhWNpqOJdjrt7qJJI_70oxAGspHNwnbVFqCCP8VruBKSoXr5oomACzzeTNkjAyvqvBxSmlM2ACGdJQ_4cfPFjbBOxcf_IElYj59UwbzlazUG56qj0EErTdRnjrua_EL1GlFLphqVez15RMUk7ytZCg1B-ObQm89f_3dwu35wTjpaGgz58EOt1gDKhAwXqRHKpoNAHNPmbMWN4nZUiJbEabOIdaDULypQO9-nh4AccRwu4c")' }}
            ></div>
            <button className="absolute -bottom-2 -right-2 w-8 h-8 bg-white border-2 border-slate-50 rounded-full flex items-center justify-center text-primary shadow-sm hover:scale-110 transition-transform">
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* List Item 2 */}
        <div className="flex gap-4 py-4 border-b border-slate-100 group">
          <div className="flex-1 flex flex-col justify-between">
            <div>
              <h3 className="font-bold text-slate-900 text-base mb-1">Sifrina</h3>
              <p className="text-sm text-slate-500 line-clamp-2">La combinación perfecta de Reina Pepiada con queso amarillo rallado extra.</p>
            </div>
            <div className="flex items-center gap-3 mt-3">
              <span className="font-bold text-slate-900 text-base">$6.50</span>
              <span className="text-xs text-slate-400 font-medium">Bs. 234,00</span>
            </div>
          </div>
          <div className="relative shrink-0 w-24 h-24 sm:w-28 sm:h-28">
            <div
              className="w-full h-full rounded-xl bg-cover bg-center"
              style={{ backgroundImage: 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuC35wCjpUD4O5sXcTZYd9b2rsdsI9thXi2Coi549zUoFgeuI5Fymf6CMo8TtrrOyUFpwVojZq_SagDPBJG0ell_IC4N11lOqSx6gv6IH4qpPK0xZoPiclY5ZajDow14K5q-I9yHwcxvBCkcHic0aCnz5BYPJZuR9yAECTVcRycg7nXs0KTLb910dA3MPUvFl6pY9mdamPmIt63egY-fsi2MroSb4YxobcFzWBd030zU5mxJ1D5h9TTsfre7v8wEQcv5MhaKozTGxzY")' }}
            ></div>
            <button className="absolute -bottom-2 -right-2 w-8 h-8 bg-white border-2 border-slate-50 rounded-full flex items-center justify-center text-primary shadow-sm hover:scale-110 transition-transform">
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* List Item 3 */}
        <div className="flex gap-4 py-4 border-b border-slate-100 group">
          <div className="flex-1 flex flex-col justify-between">
            <div>
              <h3 className="font-bold text-slate-900 text-base mb-1">Dominó</h3>
              <p className="text-sm text-slate-500 line-clamp-2">Caraotas negras refritas con queso blanco duro rallado.</p>
            </div>
            <div className="flex items-center gap-3 mt-3">
              <span className="font-bold text-slate-900 text-base">$5.00</span>
              <span className="text-xs text-slate-400 font-medium">Bs. 180,00</span>
            </div>
          </div>
          <div className="relative shrink-0 w-24 h-24 sm:w-28 sm:h-28">
            <div
              className="w-full h-full rounded-xl bg-cover bg-center"
              style={{ backgroundImage: 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuBkLXwRAax1jtULkpNJ16KzST7yMDx-Qltk3PKMRrjELaYcKUMn1OM4DPjIFV9l8fUXGztD08Cp3CXirnaTjuCuxrlZ0Y0JS7Tkbpx99P5f6qmrr6ULEFyEv2gjvhq5_XaNjnIBhBj1ZRHp3knxMz1iTMmtrPbjTtbMle4znYpFCX7oG7Vl3L_M2NcMMANkMrWX1BXowm2q3nwd1xHaVpgCDETg1UzTfjDs__I2lMph0-tSWiINWHG0NAwy_bv6L8qeRdTwSAJ_bUw")' }}
            ></div>
            <button className="absolute -bottom-2 -right-2 w-8 h-8 bg-white border-2 border-slate-50 rounded-full flex items-center justify-center text-primary shadow-sm hover:scale-110 transition-transform">
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Category Header 2 */}
        <div className="pt-8 pb-4">
          <h2 className="text-xl font-bold text-slate-900">Bebidas</h2>
        </div>

        {/* List Item 4 */}
        <div className="flex gap-4 py-4 border-b border-slate-100 group">
          <div className="flex-1 flex flex-col justify-between">
            <div>
              <h3 className="font-bold text-slate-900 text-base mb-1">Papelón con Limón</h3>
              <p className="text-sm text-slate-500 line-clamp-2">Refrescante bebida tradicional de caña de azúcar.</p>
            </div>
            <div className="flex items-center gap-3 mt-3">
              <span className="font-bold text-slate-900 text-base">$2.50</span>
              <span className="text-xs text-slate-400 font-medium">Bs. 90,00</span>
            </div>
          </div>
          <div className="relative shrink-0 w-24 h-24 sm:w-28 sm:h-28">
            <div
              className="w-full h-full rounded-xl bg-cover bg-center"
              style={{ backgroundImage: 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuB8VcTPpfcmfIF74wYTgOHK8K31DRXaZIf76TK8bG-Zcks2T9SbIDYedSL7bq66B4IyzEDcMgTGPLt2F05XvNQq75AssMfyX6z0g2Qto6Bc-M2x75wzHOKhY-uJYPG9gGvupXkVhwvWS_zdRkFf4hQavQtPjMLs7ex8GY9g8ZEWL42J_PPpAfUATiVxrxrLUuOnoG8g8VEyCTWxqYqiSxXLivIc0MAwNbb7ItvS90cSV_-YvxQwj7JBj2807BzuSWWo0QWnJVPuLXE")' }}
            ></div>
            <button className="absolute -bottom-2 -right-2 w-8 h-8 bg-white border-2 border-slate-50 rounded-full flex items-center justify-center text-primary shadow-sm hover:scale-110 transition-transform">
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Floating Cart Button */}
      <div className="sticky bottom-6 left-1/2 transform -translate-x-1/2 w-full px-5 max-w-md z-50 mt-4">
        <Link to="/cart" className="w-full bg-primary hover:bg-orange-600 text-white rounded-xl p-4 shadow-xl shadow-orange-500/30 flex items-center justify-between transition-colors">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 px-2 py-1 rounded text-sm font-bold">2</div>
            <span className="font-bold text-base">Ver orden</span>
          </div>
          <span className="font-bold text-lg">$11.50</span>
        </Link>
      </div>
    </div>
  );
}
