import { Outlet, useLocation } from 'react-router-dom';
import BottomNav from './BottomNav';

export default function Layout() {
  const location = useLocation();
  const showBottomNav = location.pathname === '/' || location.pathname === '/cart';

  return (
    <div className="h-screen bg-white flex flex-col">
      <div className="flex-1 overflow-y-auto hide-scrollbar">
        <Outlet />
      </div>
      {showBottomNav && <BottomNav />}
    </div>
  );
}
