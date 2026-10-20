import React, { useState, useEffect } from 'react';
import { X, FileText, User, Car, Store, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';

export interface TermsAndConditionsModalProps {
    isOpen: boolean;
    onClose: () => void;
    role: 'client' | 'driver' | 'business';
    appName?: string;
    onAccept?: () => void;
}

export const TermsAndConditionsModal: React.FC<TermsAndConditionsModalProps> = ({
    isOpen,
    onClose,
    role,
    appName = 'Un 2x3',
    onAccept,
}) => {
    const [termsText, setTermsText] = useState<string>('');
    const [updatedAt, setUpdatedAt] = useState<string | null>(null);
    const [loading, setLoading] = useState<boolean>(true);

    useEffect(() => {
        if (!isOpen) return;

        let isMounted = true;
        const fetchTerms = async () => {
            setLoading(true);
            try {
                const { data } = await supabase
                    .from('app_legal_and_share_settings')
                    .select('*')
                    .eq('id', 'current')
                    .maybeSingle();

                if (!isMounted) return;

                if (data) {
                    let text = '';
                    if (role === 'client') text = data.terms_client || '';
                    else if (role === 'driver') text = data.terms_driver || '';
                    else if (role === 'business') text = data.terms_business || '';

                    setTermsText(text);
                    setUpdatedAt(data.updated_at || null);
                }
            } catch (err) {
                console.warn('Error cargando términos y condiciones:', err);
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        fetchTerms();

        return () => {
            isMounted = false;
        };
    }, [isOpen, role]);

    if (!isOpen) return null;

    const roleConfig = {
        client: {
            title: 'Términos y Condiciones para Usuarios',
            badge: 'Clientes',
            icon: User,
            color: 'text-amber-500',
            bg: 'bg-amber-500/10',
            subtitle: 'Condiciones de uso del servicio, pedidos y movilidad',
        },
        driver: {
            title: 'Términos y Condiciones para Conductores',
            badge: 'Conductores y Repartidores',
            icon: Car,
            color: 'text-emerald-500',
            bg: 'bg-emerald-500/10',
            subtitle: 'Acuerdo de servicio para transportistas independientes',
        },
        business: {
            title: 'Términos y Condiciones para Comercios',
            badge: 'Aliados Comerciales',
            icon: Store,
            color: 'text-purple-500',
            bg: 'bg-purple-500/10',
            subtitle: 'Políticas de afiliación, menú y despacho de productos',
        },
    }[role];

    const RoleIcon = roleConfig.icon;

    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-3 sm:p-6">
            <div 
                className="fixed inset-0 bg-slate-900/75 backdrop-blur-sm transition-opacity" 
                onClick={onClose}
            />

            <div className="relative bg-white w-full max-w-2xl max-h-[90vh] flex flex-col rounded-[32px] shadow-2xl overflow-hidden border border-slate-100 animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="p-5 sm:p-6 bg-slate-900 text-white flex items-center justify-between shrink-0 border-b border-slate-800">
                    <div className="flex items-center gap-3.5">
                        <div className={`w-11 h-11 rounded-2xl ${roleConfig.bg} flex items-center justify-center shrink-0 border border-white/10`}>
                            <RoleIcon className={`w-6 h-6 ${roleConfig.color}`} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-base sm:text-lg font-black tracking-tight text-white leading-tight">
                                    {roleConfig.title}
                                </h2>
                            </div>
                            <p className="text-[11px] text-slate-300 font-medium mt-0.5">
                                {appName} • {roleConfig.subtitle}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all active:scale-95 shrink-0"
                        aria-label="Cerrar modal"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 overflow-y-auto flex-1 space-y-4 text-slate-700 text-xs sm:text-sm leading-relaxed">
                    {loading ? (
                        <div className="py-20 flex flex-col items-center justify-center gap-3">
                            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                                Cargando términos oficiales...
                            </p>
                        </div>
                    ) : termsText ? (
                        <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-5 text-slate-700 leading-relaxed whitespace-pre-wrap font-sans text-xs sm:text-sm">
                            {termsText}
                        </div>
                    ) : (
                        <div className="py-12 text-center text-slate-400">
                            <FileText className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                            <p className="font-semibold">No se encontraron términos configurados para este rol.</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3 shrink-0">
                    <span className="text-[11px] font-medium text-slate-400">
                        {updatedAt ? 'Documento oficial vigente' : 'Documento oficial vigente'}
                    </span>
                    <button
                        type="button"
                        onClick={() => {
                            if (onAccept) onAccept();
                            onClose();
                        }}
                        className="px-6 py-2.5 bg-slate-900 text-white hover:bg-black font-bold rounded-xl text-xs sm:text-sm shadow-md transition-all active:scale-95 flex items-center gap-2"
                    >
                        <Check className="w-4 h-4 text-[#FFD700]" />
                        <span>Entendido y Cerrar</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TermsAndConditionsModal;
