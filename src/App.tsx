import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import Restaurant from './pages/Restaurant';
import Cart from './pages/Cart';
import Search from './pages/Search';
import Favorites from './pages/Favorites';
import Profile from './pages/Profile';
import { AuthProvider } from './context/AuthContext';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="restaurant" element={<Restaurant />} />
            <Route path="cart" element={<Cart />} />
            <Route path="search" element={<Search />} />
            <Route path="favorites" element={<Favorites />} />
            <Route path="profile" element={<Profile />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
