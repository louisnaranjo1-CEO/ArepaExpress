import React, { useState, useRef } from 'react';
import { X, CheckCircle2, AlertCircle, UploadCloud, Image as ImageIcon, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { compressImage } from '../utils/mediaCompressor';

interface DeliveryPaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    orderId: string;
    deliveryFee: number;
    bcvRate: number;
    exchangeRate?: number;
    businessName: string;
    onSuccess: () => void;
}

export default function DeliveryPaymentModal({ 
    isOpen, 
    onClose, 
    orderId, 
    deliveryFee, 
    bcvRate, 
    exchangeRate, 
    businessName, 
    onSuccess 
}: DeliveryPaymentModalProps) {
    const [reference, setReference] = useState('');
    const [proofFile, setProofFile] = useState<File | null>(null);
    const [proofPreview, setProofPreview] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const effectiveRate = Number(exchangeRate || bcvRate || 855.66);

    if (!isOpen) return null;

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            setError('Por favor selecciona una imagen válida para el comprobante.');
            return;
        }

        setProofFile(file);
        setError(null);
        const reader = new FileReader();
        reader.onload = () => {
            setProofPreview(reader.result as string);
        };
        reader.readAsDataURL(file);
    };

    const handleRemoveFile = () => {
        setProofFile(null);
        setProofPreview(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!reference.trim() && !proofFile) {
            setError('Por favor, ingresa el número de referencia o adjunta el comprobante.');
            return;
        }

        setIsSubmitting(true);
        setError(null);

        try {
            let proofUrl = '';
            if (proofFile) {
                const compressed = await compressImage(proofFile);
                const ext = proofFile.name.split('.').pop() || 'jpg';
                const filePath = `delivery_proofs/${orderId}_${Date.now()}.${ext}`;
                const { error: upErr } = await supabase.storage.from('store_assets').upload(filePath, compressed, { upsert: true });
                if (!upErr) {
                    const { data } = supabase.storage.from('store_assets').getPublicUrl(filePath);
                    proofUrl = data.publicUrl;
                } else {
                    const { error: upErr2 } = await supabase.storage.from('documents').upload(filePath, compressed, { upsert: true });
                    if (!upErr2) {
                        const { data } = supabase.storage.from('documents').getPublicUrl(filePath);
                        proofUrl = data.publicUrl;
                    }
                }
            }

            const { error: updateError } = await supabase.from('orders').update({
                payment_reference: reference.trim() || null,
                payment_proof_url: proofUrl || null,
                payment_method: 'pago_movil',
                payment_status: 'verifying',
                delivery_payment_ref: reference.trim() || null,
                deliveryPaymentRef: reference.trim() || null,
                delivery_payment_status: 'verifying',
                deliveryPaymentStatus: 'verifying',
                delivery_payment_receipt: proofUrl || null,
                status: 'verificando_pago_delivery',
                updated_at: new Date().toISOString()
            }).eq('id', orderId);

            if (updateError) throw updateError;

            onSuccess();
            onClose();
        } catch (err: any) {
            console.error('Error al enviar pago:', err);
            setError('Ocurrió un error al enviar los datos. Intente de nuevo.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose}></div>
            <div className="relative w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:zoom-in-95">
                
                <div className="absolute top-4 right-4 z-10">
                    <button 
                        type="button"
                        onClick={onClose} 
                        className="w-8 h-8 flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-full transition-colors active:scale-95"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="px-6 py-6 border-b border-slate-100 bg-slate-50 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-5">
                       <CheckCircle2 className="w-24 h-24" />
                    </div>
                    <p className="text-[10px] uppercase font-black tracking-widest text-primary mb-1">Paso 2 / 2</p>
                    <h2 className="text-xl font-black text-slate-900 leading-tight pr-8">Pago de Delivery</h2>
                    <p className="text-sm font-medium text-slate-500 mt-1">Ya le pagaste a <span className="font-bold text-slate-700">{businessName}</span>. Ahora transfiere el costo del delivery a Un 2x3.</p>
                </div>

                <div className="overflow-y-auto flex-1 p-6">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        
                        <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-100 flex items-start gap-3">
                            <span className="text-emerald-500 mt-1"><CheckCircle2 className="w-5 h-5"/></span>
                            <div>
                                <p className="text-sm font-medium text-emerald-800 leading-snug">
                                    Monto a transferir o pago móvil:
                                </p>
                                <p className="text-lg font-black text-emerald-900 mt-1">
                                    ${deliveryFee.toFixed(2)} USD <span className="text-sm opacity-50 font-medium">|</span> {(deliveryFee * effectiveRate).toFixed(2)} Bs
                                </p>
                            </div>
                        </div>

                        {error && (
                            <div className="p-3 bg-red-50 text-red-600 text-xs font-bold rounded-xl flex items-center gap-2">
                                <AlertCircle className="w-4 h-4" />
                                {error}
                            </div>
                        )}

                        <div className="space-y-2">
                            <label className="text-xs font-black text-slate-700 uppercase tracking-wider block">Número de Referencia</label>
                            <input 
                                type="text"
                                value={reference}
                                onChange={(e) => setReference(e.target.value)}
                                placeholder="Ej. 129348120"
                                className="w-full bg-slate-50 border border-slate-200 p-4 rounded-2xl text-sm outline-none focus:border-primary focus:bg-white transition-all font-medium"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-black text-slate-700 uppercase tracking-wider block">
                                Comprobante de Pago (Opcional)
                            </label>
                            {proofPreview ? (
                                <div className="relative rounded-2xl border-2 border-emerald-200 bg-emerald-50/40 p-3 flex items-center gap-3">
                                    <img 
                                        src={proofPreview} 
                                        alt="Vista previa comprobante" 
                                        className="w-14 h-14 object-cover rounded-xl border border-slate-200 bg-white" 
                                    />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-black text-slate-800 truncate">{proofFile?.name}</p>
                                        <p className="text-[10px] font-bold text-emerald-600">Comprobante listo para enviar</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleRemoveFile}
                                        className="p-2 text-rose-500 hover:bg-rose-50 rounded-xl transition-colors"
                                        title="Eliminar captura"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            ) : (
                                <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 hover:border-primary/50 bg-slate-50 hover:bg-slate-100/60 p-4 rounded-2xl cursor-pointer transition-all group">
                                    <UploadCloud className="w-6 h-6 text-slate-400 group-hover:text-primary mb-1 transition-colors" />
                                    <span className="text-xs font-bold text-slate-600 group-hover:text-slate-900">Adjuntar captura del Pago Móvil</span>
                                    <span className="text-[10px] text-slate-400">JPG, PNG o WebP</span>
                                    <input 
                                        ref={fileInputRef}
                                        type="file" 
                                        accept="image/*" 
                                        onChange={handleFileChange} 
                                        className="hidden" 
                                    />
                                </label>
                            )}
                        </div>

                    </form>
                </div>

                <div className="p-6 border-t border-slate-100 bg-white">
                    <button 
                        onClick={handleSubmit}
                        disabled={isSubmitting || (!reference.trim() && !proofFile)}
                        className="w-full bg-primary text-slate-900 py-4 rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-primary/20 hover:scale-[1.01] active:scale-95 transition-all disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
                    >
                        {isSubmitting ? (
                            <>
                                <div className="w-5 h-5 border-2 border-slate-900 border-t-transparent rounded-full animate-spin"></div>
                                Procesando...
                            </>
                        ) : (
                            'Confirmar y Enviar'
                        )}
                    </button>
                </div>

            </div>
        </div>
    );
}
