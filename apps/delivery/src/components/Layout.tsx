import { Outlet, useLocation } from 'react-router-dom';
import BottomNav from './BottomNav';

export default function Layout() {
  const location = useLocation();
  const showBottomNav = location.pathname === '/' || location.pathname === '/cart';

  return (
    <div className="h-screen bg-slate-100 flex justify-center overflow-hidden">
      <div className="w-full max-w-md bg-white shadow-2xl h-full flex flex-col relative">
        <div className="flex-1 overflow-y-auto hide-scrollbar">
          <Outlet />
        </div>
        {showBottomNav && <BottomNav />}
      </div>
    </div>
  );
}
