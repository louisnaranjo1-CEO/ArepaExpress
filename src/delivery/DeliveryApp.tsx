import React, { useState } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import DeliveryLayout from './components/DeliveryLayout';
import Login from './pages/Login';
import Onboarding from './pages/Onboarding';
import OrdersRadar from './pages/OrdersRadar';
import Earnings from './pages/Earnings';
import DriverProfile from './pages/DriverProfile';
import PendingApproval from './pages/PendingApproval';

export default function DeliveryApp() {
    const { user, profile } = useAuth();
    const isDeliveryPath = window.location.pathname.startsWith('/delivery');

    // Muestra un layout sin Sidebars/Header genéricos cuando se visita /delivery
    if (isDeliveryPath) {
        document.body.className = 'bg-slate-50'; // Forzar fondo gris claro
    }

    if (!user) {
        return (
            <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="*" element={<Navigate to="/delivery/login" replace />} />
            </Routes>
        );
    }

    // Si ya existe registro de Delivery, verificar estado
    if (profile?.role === 'delivery') {
        const status = profile?.deliveryStatus; // Asumiremos que cargaremos el status en el perfil global o onSnapshot

        // Si está pendiente de aprobación
        if (status === 'pending') {
            return (
                <Routes>
                    <Route path="/pending" element={<PendingApproval />} />
                    <Route path="*" element={<Navigate to="/delivery/pending" replace />} />
                </Routes>
            );
        }

        // Si está activo
        return (
            <DeliveryLayout>
                <Routes>
                    <Route path="/radar" element={<OrdersRadar />} />
                    <Route path="/earnings" element={<Earnings />} />
                    <Route path="/profile" element={<DriverProfile />} />
                    <Route path="*" element={<Navigate to="/delivery/radar" replace />} />
                </Routes>
            </DeliveryLayout>
        );
    }

    // Si es un user autenticado pero no tiene perfil de delivery aún
    return (
        <Routes>
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="*" element={<Navigate to="/delivery/onboarding" replace />} />
        </Routes>
    );
}
