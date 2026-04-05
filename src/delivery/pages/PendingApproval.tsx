import React, { useState } from 'react';
import { Clock, LogOut, AlertCircle, XCircle } from 'lucide-react';
import { logout } from '../../lib/auth-service';
import { doc, deleteDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';

interface PendingApprovalProps {
    status?: 'pending' | 'rejected';
}

export default function PendingApproval({ status = 'pending' }: PendingApprovalProps) {
    const { user } = useAuth();
    const [resetting, setResetting] = useState(false);

    const handleResetApplication = async () => {
        if (!user) return;
        if (!window.confirm('¿Deseas intentar de nuevo? Se borrará tu solicitud anterior para que puedas llenar tus datos actualizados.')) return;

        setResetting(true);
        try {
            await deleteDoc(doc(db, 'delivery_drivers', user.uid));
            // La redirección ocurrirá automáticamente por el listener en DeliveryApp.tsx
            window.location.href = '/delivery/onboarding';
        } catch (error) {
            console.error("Error resetting application:", error);
            alert("Error al reiniciar solicitud");
            setResetting(false);
        }
    };

    const isRejected = status === 'rejected';

    return (
        <div className="min-h-[100dvh] bg-slate-50 flex flex-col p-6">
            <header className="flex justify-end mb-8">
                <button
                    onClick={async () => {
                        await logout();
                        window.location.href = '/delivery/login';
                    }}
                    className="flex items-center gap-2 text-slate-400 hover:text-red-500 transition-colors"
                >
                    <LogOut className="w-5 h-5" />
                    <span className="text-xs font-black uppercase tracking-wider">Cerrar Sesión</span>
                </button>
            </header>

            <div className="flex-1 flex flex-col justify-center items-center text-center">
                <div className={`w-24 h-24 rounded-full flex items-center justify-center mb-6 ${isRejected ? 'bg-red-100 text-red-500' : 'bg-orange-100 text-orange-500 animate-pulse'}`}>
                    {isRejected ? <XCircle className="w-12 h-12" /> : <Clock className="w-12 h-12" />}
                </div>

                <h1 className="text-3xl font-black text-slate-800 mb-4">
                    {isRejected ? 'Solicitud Rechazada' : 'En Revisión'}
                </h1>

                <p className="text-slate-500 font-medium mb-8 max-w-sm">
                    {isRejected ? (
                        "Su solicitud ha sido rechazada. Por favor, inténtalo de nuevo. Recuerda tener tus datos actualizados y aceptar los términos y condiciones de la app."
                    ) : (
                        "Hemos recibido tu solicitud. Nuestro equipo administrativo verificará tus documentos y te avisaremos cuando estés listo para empezar a generar ganancias."
                    )}
                </p>

                {isRejected ? (
                    <button
                        onClick={handleResetApplication}
                        disabled={resetting}
                        className="w-full max-w-sm bg-primary text-slate-900 font-black py-4 rounded-2xl shadow-lg shadow-primary/20 active:scale-95 transition-transform disabled:opacity-50"
                    >
                        {resetting ? 'Reiniciando...' : 'Intentar de Nuevo'}
                    </button>
                ) : (
                    <div className="bg-white p-6 rounded-3xl border border-slate-200 w-full max-w-sm">
                        <h3 className="font-bold text-slate-800 mb-2 text-sm uppercase tracking-wider">Próximos Pasos</h3>
                        <ul className="text-left space-y-3">
                            <li className="flex gap-3 text-slate-500 text-sm font-medium">
                                <span className="w-5 h-5 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center font-bold shrink-0">1</span>
                                Completaste tu perfil
                            </li>
                            <li className="flex gap-3 text-primary text-sm font-bold">
                                <span className="w-5 h-5 bg-indigo-100 rounded-full flex items-center justify-center shrink-0">2</span>
                                Revisión de seguridad activa
                            </li>
                            <li className="flex gap-3 text-slate-400 text-sm font-medium">
                                <span className="w-5 h-5 bg-slate-100 rounded-full flex items-center justify-center font-bold shrink-0">3</span>
                                Empieza a rodar
                            </li>
                        </ul>
                    </div>
                )}

                {!isRejected && (
                    <button
                        onClick={() => window.location.reload()}
                        className="mt-8 text-primary font-bold hover:underline"
                    >
                        Actualizar Estado
                    </button>
                )}
            </div>
        </div>
    );
}

