import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { checkDeviceAuthorization } from '../lib/adminSecurity';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import CpanelLayout from './components/CpanelLayout';
import Login from './pages/Login';
import DeviceChallengeModal from './components/DeviceChallengeModal';

import Dashboard from './pages/Dashboard';
import RestaurantsManager from './pages/RestaurantsManager';
import RestaurantProfile from './pages/RestaurantProfile';
import BusinessVerifications from './pages/BusinessVerifications';
import UsersManager from './pages/UsersManager';
import BannersManager from './pages/BannersManager';
import CategoriesManager from './pages/CategoriesManager';
import DeliveryManagement from './pages/DeliveryManagement';
import AppOrders from './pages/AppOrders';
import FinancesManager from './pages/FinancesManager';
import LiquidationsManager from './pages/LiquidationsManager';
import TransportRequests from './pages/TransportRequests';
import IconsManager from './pages/IconsManager';
import FidelizationManager from './pages/FidelizationManager';
import RafflesManager from './pages/RafflesManager';
import SupportTicketsManager from './pages/SupportTicketsManager';
import MarketingManager from './pages/MarketingManager';
import PilotAchievements from './pages/PilotAchievements';
import DesignManager from './pages/DesignManager';

export default function CpanelApp() {
    const isDevAdminPath = window.location.pathname.startsWith('/cpanel');
    const isCpanelSubdomain = window.location.hostname.startsWith('cpanel.');
    const basename = isDevAdminPath && !isCpanelSubdomain ? '/cpanel' : '/';

    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isDeviceAuthorized, setIsDeviceAuthorized] = useState(false);
    const [currentAdminUser, setCurrentAdminUser] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);

    const verifyAdminAccess = async (user: any) => {
        if (!user) {
            setIsAuthenticated(false);
            setIsDeviceAuthorized(false);
            setCurrentAdminUser(null);
            setIsLoading(false);
            return;
        }

        try {
            // Si es el correo maestro louisnaranjo1@gmail.com, conceder admin de inmediato
            const isMasterSuperAdmin = user.email === 'louisnaranjo1@gmail.com';

            let isAdmin = isMasterSuperAdmin;
            if (!isAdmin) {
                // Verificar rol de administrador con timeout defensivo de 3.5 segundos
                const profilePromise = supabase
                    .from('profiles')
                    .select('role')
                    .eq('id', user.id)
                    .maybeSingle();

                const timeoutPromise = new Promise<{ data: any }>((resolve) => 
                    setTimeout(() => resolve({ data: null }), 3500)
                );

                const { data: profile } = await Promise.race([profilePromise, timeoutPromise]);
                isAdmin = profile?.role === 'admin';
            }

            if (!isAdmin) {
                console.warn("Usuario no tiene rol admin:", user.email);
                await supabase.auth.signOut().catch(() => {});
                setIsAuthenticated(false);
                setIsDeviceAuthorized(false);
                setCurrentAdminUser(null);
                setIsLoading(false);
                return;
            }

            // Verificar autorización del dispositivo con timeout de 3.5s
            const authDevicePromise = checkDeviceAuthorization(user.id);
            const authTimeout = new Promise<boolean>((resolve) => 
                setTimeout(() => resolve(false), 3500)
            );
            const isTrusted = await Promise.race([authDevicePromise, authTimeout]);

            setCurrentAdminUser(user);
            setIsAuthenticated(true);
            setIsDeviceAuthorized(isTrusted);
        } catch (err) {
            console.error("Error verificando acceso administrativo:", err);
            setIsAuthenticated(false);
            setIsDeviceAuthorized(false);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        let isMounted = true;

        // Temporizador de seguridad máximo de 6 segundos para evitar bloqueo permanente en pantalla de carga
        const safetyTimeout = setTimeout(() => {
            if (isMounted) {
                console.warn("Tiempo de espera límite alcanzado para carga de Super Panel. Desbloqueando interfaz.");
                setIsLoading(false);
            }
        }, 6000);

        const fetchInitialSession = async () => {
            try {
                const sessionPromise = supabase.auth.getSession();
                const timeoutPromise = new Promise<any>((resolve) => 
                    setTimeout(() => resolve({ data: { session: null } }), 4500)
                );
                const { data } = await Promise.race([sessionPromise, timeoutPromise]);
                if (isMounted) {
                    await verifyAdminAccess(data?.session?.user ?? null);
                }
            } catch (err) {
                console.error("Error obteniendo sesión inicial:", err);
                if (isMounted) setIsLoading(false);
            }
        };

        fetchInitialSession();

        const { data: authListener } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                if (!isMounted) return;
                if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
                    await verifyAdminAccess(session?.user ?? null);
                } else if (event === 'SIGNED_OUT') {
                    setIsAuthenticated(false);
                    setIsDeviceAuthorized(false);
                    setCurrentAdminUser(null);
                    setIsLoading(false);
                }
            }
        );

        return () => {
            isMounted = false;
            clearTimeout(safetyTimeout);
            authListener.subscription.unsubscribe();
        };
    }, []);

    const handleLogin = async (email: string, pass: string): Promise<boolean> => {
        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password: pass,
            });

            if (error) {
                if (error.message.includes("Invalid login credentials")) {
                    throw new Error("Credenciales incorrectas. Si tu cuenta se creó con Google, pulsa el botón 'Iniciar Sesión con Google'.");
                }
                throw error;
            }

            if (data.user) {
                await verifyAdminAccess(data.user);
                return true;
            }

            throw new Error("No se pudo iniciar sesión.");
        } catch (err: any) {
            throw new Error(err.message || "Credenciales de administrador inválidas");
        }
    };

    const handleGoogleLogin = async () => {
        const redirectUrl = window.location.href.split('#')[0].split('?')[0];
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: redirectUrl
            }
        });
        if (error) throw error;
    };

    const logout = async () => {
        try {
            await supabase.auth.signOut();
        } catch (e) {
            console.warn(e);
        }
        setIsAuthenticated(false);
        setIsDeviceAuthorized(false);
        setCurrentAdminUser(null);
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-slate-400 font-black uppercase tracking-widest text-xs">Cargando Super Panel...</p>
                </div>
            </div>
        );
    }

    // Paso 1: Si no está autenticado, mostrar login
    if (!isAuthenticated) {
        return <Login onLogin={handleLogin} onGoogleLogin={handleGoogleLogin} />;
    }

    // Paso 2: Si está autenticado pero el dispositivo NO está autorizado, mostrar bloqueo de dispositivo
    if (isAuthenticated && !isDeviceAuthorized) {
        return (
            <DeviceChallengeModal
                user={currentAdminUser}
                onAuthorized={() => setIsDeviceAuthorized(true)}
                onLogout={logout}
            />
        );
    }

    // Paso 3: Dispositivo autorizado -> Permitir acceso al panel completo
    return (
        <Router basename={basename}>
            <CpanelLayout onLogout={logout} adminUser={currentAdminUser}>
                <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/restaurants" element={<RestaurantsManager />} />
                    <Route path="/restaurants/:id" element={<RestaurantProfile />} />
                    <Route path="/verifications" element={<BusinessVerifications />} />
                    <Route path="/users" element={<UsersManager />} />
                    <Route path="/banners" element={<BannersManager />} />
                    <Route path="/design" element={<DesignManager />} />
                    <Route path="/categories" element={<CategoriesManager />} />
                    <Route path="/delivery" element={<DeliveryManagement />} />
                    <Route path="/app-orders" element={<AppOrders />} />
                    <Route path="/transports" element={<TransportRequests />} />
                    <Route path="/finances" element={<FinancesManager />} />
                    <Route path="/liquidations" element={<LiquidationsManager />} />
                    <Route path="/fidelization" element={<FidelizationManager />} />
                    <Route path="/raffles" element={<RafflesManager />} />
                    <Route path="/achievements" element={<PilotAchievements />} />
                    <Route path="/marketing" element={<MarketingManager />} />
                    <Route path="/icons" element={<IconsManager />} />
                    <Route path="/support" element={<SupportTicketsManager />} />
                </Routes>
            </CpanelLayout>
        </Router>
    );
}
