import React from 'react';
import { Clock } from 'lucide-react';

export default function PendingApproval() {
    return (
        <div className="min-h-[100dvh] bg-slate-50 flex flex-col justify-center items-center p-6 text-center">
            <div className="w-24 h-24 bg-orange-100 text-orange-500 rounded-full flex items-center justify-center mb-6 animate-pulse">
                <Clock className="w-12 h-12" />
            </div>

            <h1 className="text-3xl font-black text-slate-800 mb-4">En Revisión</h1>

            <p className="text-slate-500 font-medium mb-8 max-w-sm">
                Hemos recibido tu solicitud. Nuestro equipo administrativo verificará tus documentos y te avisaremos cuando estés listo para empezar a generar ganancias.
            </p>

            <div className="bg-white p-6 rounded-3xl border border-slate-200 w-full max-w-sm">
                <h3 className="font-bold text-slate-800 mb-2 text-sm uppercase tracking-wider">Próximos Pasos</h3>
                <ul className="text-left space-y-3">
                    <li className="flex gap-3 text-slate-500 text-sm font-medium">
                        <span className="w-5 h-5 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center font-bold shrink-0">1</span>
                        Completaste tu perfil
                    </li>
                    <li className="flex gap-3 text-indigo-600 text-sm font-bold">
                        <span className="w-5 h-5 bg-indigo-100 rounded-full flex items-center justify-center shrink-0">2</span>
                        Revisión de seguridad activa
                    </li>
                    <li className="flex gap-3 text-slate-400 text-sm font-medium">
                        <span className="w-5 h-5 bg-slate-100 rounded-full flex items-center justify-center font-bold shrink-0">3</span>
                        Empieza a rodar
                    </li>
                </ul>
            </div>

            <button
                onClick={() => window.location.reload()}
                className="mt-8 text-indigo-600 font-bold hover:underline"
            >
                Actualizar Estado
            </button>
        </div>
    );
}
