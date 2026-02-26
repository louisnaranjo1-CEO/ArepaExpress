import { MapPin, ChevronDown, Bell, Search, SlidersHorizontal, Utensils, Star, Heart, Clock, Sandwich, Soup } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Home() {
  return (
    <div className="relative flex h-full w-full flex-col overflow-x-hidden bg-white">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur-md px-5 pt-6 pb-2">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <MapPin className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Ubicación actual</p>
              <div className="flex items-center gap-1 cursor-pointer group">
                <h2 className="text-slate-900 text-lg font-bold leading-tight group-hover:text-primary transition-colors">Caracas, VE</h2>
                <ChevronDown className="w-4 h-4 text-primary font-bold" />
              </div>
            </div>
          </div>
          <button className="relative p-2 text-slate-900 hover:bg-slate-100 rounded-full transition-colors">
            <Bell className="w-6 h-6" />
            <span className="absolute top-2 right-2 h-2.5 w-2.5 rounded-full bg-accent border-2 border-white"></span>
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative group">
          <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
            <Search className="w-5 h-5 text-slate-400 group-focus-within:text-primary transition-colors" />
          </div>
          <input
            type="text"
            className="block w-full p-4 pl-12 text-sm text-slate-900 border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-primary focus:border-primary shadow-sm outline-none"
            placeholder="Buscar arepas, sushi, hamburguesas..."
          />
          <div className="absolute inset-y-0 right-0 flex items-center pr-3">
            <button className="p-2 text-slate-400 hover:text-primary transition-colors">
              <SlidersHorizontal className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Categories */}
      <section className="mt-4 pl-5">
        <h2 className="text-slate-900 text-lg font-bold mb-4 flex items-center gap-2">
          ¿Qué se te antoja? <span className="text-xl">😋</span>
        </h2>
        <div className="flex gap-4 overflow-x-auto hide-scrollbar pr-5 pb-2">
          {/* Category 1 */}
          <Link to="/" className="flex flex-col items-center gap-2 group min-w-[72px]">
            <div className="h-[72px] w-[72px] rounded-full bg-highlight/20 border-2 border-highlight/30 p-1 group-hover:scale-105 transition-transform duration-300 overflow-hidden relative">
              <div
                className="w-full h-full rounded-full bg-cover bg-center"
                style={{ backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuD4M0ISb-R2XmvPGIdl1ZSQfhmw1tHe_l3Po_cL4gNIFYTv8ObaxgwRQAi8e_NqMD5gf07JkHPsj1u95lTxWqT-ZtK-Uj8CZFlZGbLGP0Ai5CVFbcCJi53t13c__ql1EN195NUaHYgevN3K7BqbtczRu14KnpWEZTk8ecNrBSwI7h5iVs451FsTPF1Z9VDMUWVAZdlMNS3fSXCmq1ZrEBYECPBj-erbRniMF5nowgNESfGw1vpDbUOLKadABWuLGAuEhjGlpjgKjR0')" }}
              ></div>
            </div>
            <span className="text-xs font-medium text-slate-700 group-hover:text-primary transition-colors">Arepas</span>
          </Link>
          {/* Category 2 */}
          <Link to="/" className="flex flex-col items-center gap-2 group min-w-[72px]">
            <div className="h-[72px] w-[72px] rounded-full bg-secondary/10 border-2 border-secondary/20 p-1 group-hover:scale-105 transition-transform duration-300 overflow-hidden relative">
              <div
                className="w-full h-full rounded-full bg-cover bg-center"
                style={{ backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuAB6sh2rLq7JrD1tHqN-O4msTKnLlO6DEnd2Vub95rWa7ia7VEhuz3VyiM7n5TJrPSvhS8bSmgKuCQOVXUPAWDeDwbjWoIqyYF2AI2xaFV_fNOXK_0_a-y7uyyetaQpKIeI1PeUCewYrfIKcapHPGCTuJNnKN87684-oQ3HwwiV80IhXpC5JCQ07V-WMfJRuhNeyw2w39wZib2dJB-TRqMll3OJZhLFIwiGRTc-875TUs_zX5DsU-tMkDTYHGCSIFGAbqiDBqdqeYA')" }}
              ></div>
            </div>
            <span className="text-xs font-medium text-slate-700 group-hover:text-primary transition-colors">Pabellón</span>
          </Link>
          {/* Category 3 */}
          <Link to="/" className="flex flex-col items-center gap-2 group min-w-[72px]">
            <div className="h-[72px] w-[72px] rounded-full bg-accent/10 border-2 border-accent/20 p-1 group-hover:scale-105 transition-transform duration-300 overflow-hidden relative">
              <div
                className="w-full h-full rounded-full bg-cover bg-center"
                style={{ backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuBT0R2NWGVp6EJ5pXiDA5gVsOuN0YJr0UEXXzUT8yeRJHQRI7iOQMvRLI5-_EwlUygs5v2voDgYSQIziSgUrUExG_28S6muAQ7PQzBe0XxzhS-t_hzTz4rx0XSedFIzM_yoW6ZClgra37Q_baaUiJxx8swGYhlzKg2EtZMjK29drcQhIIR1bQX4ai7FxrD4rgZm9ZeDyizset30XD_vnuvWrHZD38b-quPwcHai78Vo1vxohbQTO6qsW9RBk54AgjZXHtNZ-d5ywLA')" }}
              ></div>
            </div>
            <span className="text-xs font-medium text-slate-700 group-hover:text-primary transition-colors">Burgers</span>
          </Link>
          {/* Category 4 */}
          <Link to="/" className="flex flex-col items-center gap-2 group min-w-[72px]">
            <div className="h-[72px] w-[72px] rounded-full bg-primary/10 border-2 border-primary/20 p-1 group-hover:scale-105 transition-transform duration-300 overflow-hidden relative">
              <div
                className="w-full h-full rounded-full bg-cover bg-center"
                style={{ backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuCVINqp8VU97p3pTqCrSHzbz-g-G4dsUexWr62uAASwUwF5we9dZXJeOxT5cEi-Htd-cLmQ6pIZm2oM67mltSV6wuaJFmy-J4d6zUmoG6atFRUzxttqGYBDQbe3heq8kilPt6UiwSFeQUPjqYcjHzWzfu7AclzFpkEqjun0V7ejMW4R09-jWUotQKA6lvkIinik-sy6eUXfPhjZ-MylskbXp-8PopUFRcqznbMYpDSM6l8SGi6x-wyOnPaZRoPIz5IV53BYeyKPFBU')" }}
              ></div>
            </div>
            <span className="text-xs font-medium text-slate-700 group-hover:text-primary transition-colors">Sushi</span>
          </Link>
          {/* Category 5 */}
          <Link to="/" className="flex flex-col items-center gap-2 group min-w-[72px]">
            <div className="h-[72px] w-[72px] rounded-full bg-slate-100 border-2 border-slate-200 p-1 group-hover:scale-105 transition-transform duration-300 overflow-hidden relative flex items-center justify-center">
              <div className="w-full h-full rounded-full bg-white flex items-center justify-center text-slate-400">
                <Utensils className="w-6 h-6" />
              </div>
            </div>
            <span className="text-xs font-medium text-slate-700 group-hover:text-primary transition-colors">Ver todo</span>
          </Link>
        </div>
      </section>

      {/* Main Content: Restaurants */}
      <main className="flex-1 px-5 pt-6 pb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-slate-900 text-xl font-bold">Cerca de ti</h2>
          <Link to="/" className="text-primary text-sm font-semibold hover:underline">Ver todos</Link>
        </div>
        <div className="flex flex-col gap-6">
          {/* Restaurant Card 1 */}
          <Link to="/restaurant" className="group relative flex flex-col gap-3">
            <div className="relative w-full aspect-[16/10] overflow-hidden rounded-xl shadow-sm">
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent z-10"></div>
              <div className="absolute top-3 left-3 z-20 bg-white/90 backdrop-blur-sm px-2.5 py-1 rounded-full flex items-center gap-1 shadow-sm">
                <Star className="w-4 h-4 text-highlight fill-highlight" />
                <span className="text-xs font-bold text-slate-900">4.8</span>
                <span className="text-[10px] text-slate-500">(120+)</span>
              </div>
              <div className="absolute top-3 right-3 z-20 bg-white p-1.5 rounded-full shadow-sm cursor-pointer hover:scale-110 transition-transform">
                <Heart className="w-5 h-5 text-slate-400 hover:text-accent hover:fill-accent transition-colors" />
              </div>
              <div
                className="w-full h-full bg-cover bg-center group-hover:scale-105 transition-transform duration-500 ease-out"
                style={{ backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuAYZJDONql4yc1fzFb-GJxq7JU8JpLtsjAN2xHktJKS7fZ0kxInpm6Zm7TfEol26Ndi7IvcI--ZKKNxyt77c1q8_ehnOvkAlTGkKOeHkN8HES3ilsSnRb7Vg_XJvETQObbOkUGuTqeaOz3HTNqGPuXZggoBVcwJS-ARvrvFJSnququw-V2l6ZWVewrZyujnT19FcAqmiYHRaPIY1xsN3uvaOsQgWgejBJH1aisZZZ6lAaFYCqV2K-ygtj02Ieq9Q1x4EBAm1e2mqK4')" }}
              ></div>
              <div className="absolute bottom-3 left-3 z-20 flex gap-2">
                <span className="bg-primary text-white text-[10px] font-bold px-2 py-1 rounded-lg">Envío Gratis</span>
                <span className="bg-white/90 backdrop-blur-md text-slate-900 text-[10px] font-bold px-2 py-1 rounded-lg flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> 20-30 min
                </span>
              </div>
            </div>
            <div className="px-1">
              <h3 className="text-lg font-bold text-slate-900 leading-tight mb-1">Arepa Factory El Rosal</h3>
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Sandwich className="w-4 h-4 text-primary" />
                <span>Comida Venezolana</span>
                <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                <span>$$</span>
                <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                <span>1.2 km</span>
              </div>
            </div>
          </Link>

          {/* Restaurant Card 2 */}
          <Link to="/restaurant" className="group relative flex flex-col gap-3">
            <div className="relative w-full aspect-[16/10] overflow-hidden rounded-xl shadow-sm">
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent z-10"></div>
              <div className="absolute top-3 left-3 z-20 bg-white/90 backdrop-blur-sm px-2.5 py-1 rounded-full flex items-center gap-1 shadow-sm">
                <Star className="w-4 h-4 text-highlight fill-highlight" />
                <span className="text-xs font-bold text-slate-900">4.5</span>
                <span className="text-[10px] text-slate-500">(85)</span>
              </div>
              <div className="absolute top-3 right-3 z-20 bg-white p-1.5 rounded-full shadow-sm cursor-pointer hover:scale-110 transition-transform">
                <Heart className="w-5 h-5 text-slate-400 hover:text-accent hover:fill-accent transition-colors" />
              </div>
              <div
                className="w-full h-full bg-cover bg-center group-hover:scale-105 transition-transform duration-500 ease-out"
                style={{ backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuBY7q5j-BtYp3_qjdJoW5WPQM2x6R6iKFDDAsSL61WkcjYBlM1i4VVDFTw8cggdwbjDg978wTBwhqrsKNAZo18r9SWr3Nzi-Ygqi5tIemMQ_GwSpXjuNNfOAIY0HyCcoEEOhdg_sLqA8x819DMR1_lCKIKd93JYGSFiKW893qrl6kWItN9gq2WGl_y66i4YozzNMhKz6byQC-43RlvkZGHN8_olG29jjksWixQ3WP42IWM8Tn7WgvshkRsKHkjF2zPDcdv-Y7hBVbY')" }}
              ></div>
              <div className="absolute bottom-3 left-3 z-20 flex gap-2">
                <span className="bg-secondary text-white text-[10px] font-bold px-2 py-1 rounded-lg">Promo 2x1</span>
                <span className="bg-white/90 backdrop-blur-md text-slate-900 text-[10px] font-bold px-2 py-1 rounded-lg flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> 35-45 min
                </span>
              </div>
            </div>
            <div className="px-1">
              <h3 className="text-lg font-bold text-slate-900 leading-tight mb-1">Sushi Express Caracas</h3>
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Soup className="w-4 h-4 text-primary" />
                <span>Japonesa • Sushi</span>
                <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                <span>$$$</span>
                <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                <span>2.4 km</span>
              </div>
            </div>
          </Link>

          {/* Restaurant Card 3 */}
          <Link to="/restaurant" className="group relative flex flex-col gap-3">
            <div className="relative w-full aspect-[16/10] overflow-hidden rounded-xl shadow-sm">
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent z-10"></div>
              <div className="absolute top-3 left-3 z-20 bg-white/90 backdrop-blur-sm px-2.5 py-1 rounded-full flex items-center gap-1 shadow-sm">
                <Star className="w-4 h-4 text-highlight fill-highlight" />
                <span className="text-xs font-bold text-slate-900">4.9</span>
                <span className="text-[10px] text-slate-500">(200+)</span>
              </div>
              <div className="absolute top-3 right-3 z-20 bg-white p-1.5 rounded-full shadow-sm cursor-pointer hover:scale-110 transition-transform">
                <Heart className="w-5 h-5 text-accent fill-accent" />
              </div>
              <div
                className="w-full h-full bg-cover bg-center group-hover:scale-105 transition-transform duration-500 ease-out"
                style={{ backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuBlFIXb4JqfUJCUxGztx0I9kzquuOByYqgG4aos_f_TO7GfcNLHUQJTEQcfVDj3lNMh8sXypw9UrGrLkdtIMNKUuqRV5FtYTiGJ_plQvlbgc7CkRNUp1WEuCJX31IIjjwk9La4IMMRG_EcyNkuz8h_RAqGa8cipk3J-O_UHIyY9S1FaWYKHRTZQx72DDFb-gfSUUO5sU8AKssR0vyIw2yau3LzTU1HYSUd_iy8ld56MOnTpbJ5DafeEHgJIJkulESNpWLvhrXwQ0zs')" }}
              ></div>
              <div className="absolute bottom-3 left-3 z-20 flex gap-2">
                <span className="bg-white/90 backdrop-blur-md text-slate-900 text-[10px] font-bold px-2 py-1 rounded-lg flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> 15-25 min
                </span>
              </div>
            </div>
            <div className="px-1">
              <h3 className="text-lg font-bold text-slate-900 leading-tight mb-1">Burger Shack Las Mercedes</h3>
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Utensils className="w-4 h-4 text-primary" />
                <span>Americana • Burgers</span>
                <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                <span>$$</span>
                <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                <span>0.8 km</span>
              </div>
            </div>
          </Link>
        </div>
      </main>
    </div>
  );
}
