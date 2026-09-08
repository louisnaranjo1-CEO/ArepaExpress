import React, { useState } from 'react';
import {
    ShieldCheck,
    ShieldAlert,
    X,
    Upload,
    Camera,
    Image as ImageIcon,
    MapPin,
    Phone,
    Instagram,
    Clock,
    Truck,
    Lock,
    AlertCircle,
    CheckCircle2,
    Loader2,
    Info,
    Store
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface VerificationModalProps {
    isOpen: boolean;
    onClose: () => void;
    restaurantId: string;
    initialData: {
        name: string;
        rifPrefix: 'J' | 'V' | 'G' | 'E' | 'C';
        rifNumber: string;
        instagram: string;
        tiktok: string;
        address: string;
        addressReference: string;
        workingHoursSummary?: string;
        whatsappNumber: string;
        requiresDelivery: boolean;
        existingRifUrl?: string;
    };
    onSuccess: (updated: {
        verificationStatus: 'pending';
        name: string;
        rif: string;
        instagram: string;
        tiktok: string;
        addressReference: string;
        whatsapp: string;
        requiresDelivery: boolean;
        rifPhotoUrl: string;
    }) => void;
}

export default function VerificationModal({
    isOpen,
    onClose,
    restaurantId,
    initialData,
    onSuccess
}: VerificationModalProps) {
    if (!isOpen) return null;

    const [businessName, setBusinessName] = useState(initialData.name || '');
    const [rifPrefix, setRifPrefix] = useState<'J' | 'V' | 'G' | 'E' | 'C'>(initialData.rifPrefix || 'J');
    const [rifNumber, setRifNumber] = useState(initialData.rifNumber || '');
    const [rifFile, setRifFile] = useState<File | null>(null);
    const [rifPreviewUrl, setRifPreviewUrl] = useState<string | null>(initialData.existingRifUrl || null);
    
    // Social
    const [instagramUser, setInstagramUser] = useState(initialData.instagram || '');
    const [tiktokUser, setTiktokUser] = useState(initialData.tiktok || '');
    
    // Address & reference
    const [address, setAddress] = useState(initialData.address || '');
    const [addressReference, setAddressReference] = useState(initialData.addressReference || '');
    
    // Contact & Logistics
    const [whatsapp, setWhatsapp] = useState(initialData.whatsappNumber || '');
    const [hoursText, setHoursText] = useState(initialData.workingHoursSummary || 'Lunes a Domingo: 08:00 AM - 10:00 PM');
    const [requiresDelivery, setRequiresDelivery] = useState(initialData.requiresDelivery ?? true);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setRifFile(file);
            setRifPreviewUrl(URL.createObjectURL(file));
        }
    };

    const handleWhatsappInput = (val: string) => {
        const digits = val.replace(/\D/g, '');
        let clean = digits;
        if (clean.startsWith('58') && clean.length > 10) {
            clean = clean.slice(2);
        } else if (clean.startsWith('0')) {
            clean = clean.slice(1);
        }
        setWhatsapp(clean.slice(0, 10));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg(null);

        if (!businessName.trim()) {
            setErrorMsg("Por favor indica el nombre de tu negocio.");
            return;
        }

        if (!rifNumber.trim()) {
            setErrorMsg("Por favor escribe el número de RIF de tu negocio.");
            return;
        }

        if (!rifFile && !rifPreviewUrl) {
            setErrorMsg("Debes subir la foto o comprobante del RIF emitido por el SENIAT.");
            return;
        }

        if (!instagramUser.trim()) {
            setErrorMsg("El perfil de Instagram es obligatorio para la verificación.");
            return;
        }

        if (!address.trim()) {
            setErrorMsg("Por favor indica la dirección completa de tu local o establecimiento.");
            return;
        }

        if (!addressReference.trim()) {
            setErrorMsg("El punto de referencia visual es obligatorio (ej: local color azul justo al frente de la parada de autobuses).");
            return;
        }

        const cleanWa = whatsapp.replace(/\D/g, '');
        if (cleanWa.length < 10) {
            setErrorMsg("El número de WhatsApp debe tener 10 dígitos locales (ej: 4121234567).");
            return;
        }

        setIsSubmitting(true);
        try {
            let uploadedRifUrl = rifPreviewUrl || '';

            // Subir imagen del RIF si se seleccionó archivo nuevo
            if (rifFile) {
                const ext = rifFile.name.split('.').pop() || 'jpg';
                const path = `${restaurantId}/rif_document_${Date.now()}.${ext}`;
                const { error: uploadError } = await supabase.storage
                    .from('store_assets')
                    .upload(path, rifFile, { upsert: true });

                if (uploadError) throw uploadError;

                const { data: urlData } = supabase.storage
                    .from('store_assets')
                    .getPublicUrl(path);

                uploadedRifUrl = urlData.publicUrl;
            }

            const formattedRif = `${rifPrefix}-${rifNumber.trim()}`;
            const formattedWhatsapp = `+58${cleanWa}`;

            const verificationPayload = {
                businessName: businessName.trim(),
                rifNumber: formattedRif,
                rifPhotoUrl: uploadedRifUrl,
                instagram: instagramUser.trim(),
                tiktok: tiktokUser.trim(),
                address: address.trim(),
                addressReference: addressReference.trim(),
                workingHours: hoursText.trim(),
                whatsapp: formattedWhatsapp,
                requiresDelivery: requiresDelivery,
                submittedAt: new Date().toISOString()
            };

            const { error: dbError } = await supabase
                .from('comercios')
                .update({
                    name: businessName.trim(),
                    rif: formattedRif,
                    whatsapp: formattedWhatsapp,
                    instagram: instagramUser.trim(),
                    tiktok: tiktokUser.trim(),
                    address_reference: addressReference.trim(),
                    verification_status: 'pending',
                    verification_data: verificationPayload,
                    rejection_reason: null,
                    updated_at: new Date().toISOString()
                })
                .eq('id', restaurantId);

            if (dbError) throw dbError;

            onSuccess({
                verificationStatus: 'pending',
                name: businessName.trim(),
                rif: formattedRif,
                instagram: instagramUser.trim(),
                tiktok: tiktokUser.trim(),
                addressReference: addressReference.trim(),
                whatsapp: cleanWa,
                requiresDelivery: requiresDelivery,
                rifPhotoUrl: uploadedRifUrl
            });

            onClose();
        } catch (err: any) {
            console.error("Error enviando verificación:", err);
            setErrorMsg(err.message || "Error al enviar la solicitud de verificación.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-[36px] max-w-2xl w-full my-8 shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92vh]">
                {/* Modal Header */}
                <div className="p-6 md:p-8 bg-slate-900 text-white flex items-start justify-between relative shrink-0">
                    <div className="flex items-start gap-4">
                        <div className="p-3.5 bg-primary text-slate-950 rounded-2xl shadow-lg shadow-primary/20 shrink-0 mt-0.5">
                            <ShieldCheck className="w-7 h-7" />
                        </div>
                        <div>
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-primary/20 text-primary text-[11px] font-black uppercase tracking-wider mb-1">
                                Verificación Oficial
                            </div>
                            <h2 className="text-xl md:text-2xl font-black leading-tight text-white">
                                Verificar mi Negocio
                            </h2>
                            <p className="text-slate-400 text-xs md:text-sm font-medium mt-1">
                                Completa la información de tu comercio para auditar tu cuenta y activar la visibilidad en la app.
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-colors cursor-pointer"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Modal Scrollable Body */}
                <form onSubmit={handleSubmit} className="p-6 md:p-8 space-y-6 overflow-y-auto flex-1 custom-scrollbar">
                    {/* Error Banner */}
                    {errorMsg && (
                        <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-2xl flex items-start gap-3 text-xs font-bold animate-in slide-in-from-top-2">
                            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
                            <span>{errorMsg}</span>
                        </div>
                    )}

                    {/* Legal & Public Notices */}
                    <div className="space-y-3">
                        {/* 1. Public Info Reminder */}
                        <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-2xl flex items-start gap-3 text-xs">
                            <Info className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                            <div>
                                <h4 className="font-black text-amber-900">Recordatorio de Visibilidad Pública:</h4>
                                <p className="font-semibold text-amber-800 mt-0.5 leading-relaxed">
                                    Tu dirección física, punto de referencia visual, redes sociales y número de WhatsApp se mostrarán de forma pública en tu perfil para que los clientes puedan encontrarte y contactarte directamente.
                                </p>
                            </div>
                        </div>

                        {/* 2. Unmodifiable Fields Warning */}
                        <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl flex items-start gap-3 text-xs">
                            <Lock className="w-5 h-5 text-slate-700 shrink-0 mt-0.5" />
                            <div>
                                <h4 className="font-black text-slate-900">Campos protegidos tras la aprobación:</h4>
                                <p className="font-medium text-slate-600 mt-0.5 leading-relaxed">
                                    Una vez que la administración apruebe tu verificación, el <strong>RIF</strong> y el <strong>Nombre del Negocio</strong> quedarán bloqueados y no podrán ser alterados sin solicitud de soporte formal.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Section 1: Business Name & RIF */}
                    <div className="space-y-4 pt-2">
                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                            <Store className="w-4 h-4 text-primary" />
                            1. Identificación Comercial y Fiscal
                        </h3>

                        {/* Business Name */}
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-700">Nombre Comercial del Negocio *</label>
                            <input
                                type="text"
                                value={businessName}
                                onChange={(e) => setBusinessName(e.target.value)}
                                placeholder="Ej: Arepa Express Gourmet"
                                className="w-full bg-slate-50 border border-slate-200 focus:border-primary focus:bg-white p-3.5 rounded-2xl outline-none font-bold text-sm text-slate-800 transition-all"
                            />
                        </div>

                        {/* RIF Number */}
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-700">Número de RIF *</label>
                            <div className="flex bg-slate-50 border border-slate-200 focus-within:border-primary focus-within:bg-white rounded-2xl overflow-hidden transition-all">
                                <select
                                    value={rifPrefix}
                                    onChange={(e) => setRifPrefix(e.target.value as any)}
                                    className="bg-slate-100 border-r border-slate-200 px-3.5 py-3 font-black text-slate-800 text-sm outline-none cursor-pointer"
                                >
                                    <option value="J">J (Jurídico)</option>
                                    <option value="V">V (Venezolano)</option>
                                    <option value="G">G (Gubernamental)</option>
                                    <option value="E">E (Extranjero)</option>
                                    <option value="C">C (Comunal)</option>
                                </select>
                                <input
                                    type="text"
                                    value={rifNumber}
                                    onChange={(e) => setRifNumber(e.target.value.replace(/[^0-9-]/g, ''))}
                                    placeholder="12345678-9"
                                    className="w-full bg-transparent p-3.5 outline-none font-bold text-slate-800 text-sm"
                                />
                            </div>
                        </div>

                        {/* RIF Photo Upload */}
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-700">
                                Foto o Comprobante del RIF SENIAT *
                            </label>
                            <div className="border-2 border-dashed border-slate-200 hover:border-primary/60 bg-slate-50/50 rounded-2xl p-4 transition-all flex flex-col items-center justify-center text-center relative group">
                                <input
                                    type="file"
                                    accept="image/*,.pdf"
                                    onChange={handleFileChange}
                                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                />
                                {rifPreviewUrl ? (
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="w-28 h-28 rounded-xl overflow-hidden border border-slate-200 bg-white p-1">
                                            <img
                                                src={rifPreviewUrl}
                                                alt="RIF Document"
                                                className="w-full h-full object-contain"
                                            />
                                        </div>
                                        <p className="text-xs font-bold text-primary flex items-center gap-1">
                                            <Camera className="w-3.5 h-3.5" /> Cambiar fotografía
                                        </p>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center gap-2 py-4">
                                        <div className="p-3 bg-white rounded-2xl shadow-sm text-slate-400 group-hover:text-primary transition-colors">
                                            <Upload className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <p className="text-xs font-black text-slate-700">
                                                Haz clic para subir la foto del RIF
                                            </p>
                                            <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                                                Asegúrate de que los datos y el número de RIF sean legibles (JPG, PNG).
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Section 2: Social Networks */}
                    <div className="space-y-4 pt-2 border-t border-slate-100">
                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                            <Instagram className="w-4 h-4 text-pink-500" />
                            2. Redes Sociales
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Instagram */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-700">
                                    Instagram de tu Negocio *
                                </label>
                                <div className="flex items-center bg-slate-50 border border-slate-200 focus-within:border-primary focus-within:bg-white rounded-2xl overflow-hidden transition-all">
                                    <span className="px-3.5 py-3 text-slate-400 font-black text-sm">@</span>
                                    <input
                                        type="text"
                                        value={instagramUser}
                                        onChange={(e) => setInstagramUser(e.target.value.replace(/^@/, ''))}
                                        placeholder="mi_negocio_vzla"
                                        className="w-full bg-transparent p-3 outline-none font-bold text-slate-800 text-sm"
                                    />
                                </div>
                            </div>

                            {/* TikTok */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-700">
                                    TikTok (Opcional)
                                </label>
                                <div className="flex items-center bg-slate-50 border border-slate-200 focus-within:border-primary focus-within:bg-white rounded-2xl overflow-hidden transition-all">
                                    <span className="px-3.5 py-3 text-slate-400 font-black text-sm">@</span>
                                    <input
                                        type="text"
                                        value={tiktokUser}
                                        onChange={(e) => setTiktokUser(e.target.value.replace(/^@/, ''))}
                                        placeholder="mi_negocio_tiktok"
                                        className="w-full bg-transparent p-3 outline-none font-bold text-slate-800 text-sm"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Section 3: Physical Address & Visual Reference */}
                    <div className="space-y-4 pt-2 border-t border-slate-100">
                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-emerald-500" />
                            3. Ubicación y Punto de Referencia Visual
                        </h3>

                        {/* Complete Address */}
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-700">Dirección Completa *</label>
                            <input
                                type="text"
                                value={address}
                                onChange={(e) => setAddress(e.target.value)}
                                placeholder="Calle, avenida, centro comercial, número de local..."
                                className="w-full bg-slate-50 border border-slate-200 focus:border-primary focus:bg-white p-3.5 rounded-2xl outline-none font-bold text-sm text-slate-800 transition-all"
                            />
                        </div>

                        {/* Visual Reference with Example */}
                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                                <label className="text-xs font-bold text-slate-700">
                                    Punto de Referencia Visual Descriptivo *
                                </label>
                                <span className="text-[10px] font-black text-amber-600 uppercase">Requerido</span>
                            </div>
                            <textarea
                                value={addressReference}
                                onChange={(e) => setAddressReference(e.target.value)}
                                rows={2}
                                placeholder="EJEMPLO: local color azul justo al frente de la parada de autobuses"
                                className="w-full bg-slate-50 border border-slate-200 focus:border-primary focus:bg-white p-3.5 rounded-2xl outline-none font-bold text-sm text-slate-800 transition-all resize-none"
                            />
                            <p className="text-[11px] text-slate-400 font-medium">
                                Describe el color del local, carteles, esquinas o sitios conocidos frente o al lado para que repartidores y clientes lleguen fácilmente.
                            </p>
                        </div>
                    </div>

                    {/* Section 4: Operating Hours & WhatsApp */}
                    <div className="space-y-4 pt-2 border-t border-slate-100">
                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                            <Clock className="w-4 h-4 text-amber-500" />
                            4. Horario y Contacto de Pedidos
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Operating Hours */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-700">
                                    Horario de Atención al Cliente *
                                </label>
                                <input
                                    type="text"
                                    value={hoursText}
                                    onChange={(e) => setHoursText(e.target.value)}
                                    placeholder="Ej: Lun a Sáb 8:00 AM - 9:00 PM"
                                    className="w-full bg-slate-50 border border-slate-200 focus:border-primary focus:bg-white p-3.5 rounded-2xl outline-none font-bold text-sm text-slate-800 transition-all"
                                />
                            </div>

                            {/* WhatsApp for orders */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-700">
                                    WhatsApp para Recibir Pedidos *
                                </label>
                                <div className="flex bg-slate-50 border border-slate-200 focus-within:border-primary focus-within:bg-white rounded-2xl overflow-hidden transition-all">
                                    <div className="flex items-center gap-1 px-3.5 py-3 bg-slate-100 border-r border-slate-200 text-slate-800 font-black text-xs select-none">
                                        <span>🇻🇪</span>
                                        <span>+58</span>
                                    </div>
                                    <input
                                        type="tel"
                                        value={whatsapp}
                                        onChange={(e) => handleWhatsappInput(e.target.value)}
                                        maxLength={10}
                                        placeholder="412 1234567"
                                        className="w-full bg-transparent p-3.5 outline-none font-bold text-slate-800 text-sm"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Section 5: Delivery Requirement Question */}
                    <div className="space-y-3 pt-2 border-t border-slate-100">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                                <Truck className="w-4 h-4 text-primary" />
                                5. ¿Tu pedido requiere servicio de delivery?
                            </h3>
                            <span className="text-[11px] font-bold text-slate-400">(Modificable luego)</span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <button
                                type="button"
                                onClick={() => setRequiresDelivery(true)}
                                className={`p-4 rounded-2xl border text-left flex items-start gap-3 transition-all cursor-pointer ${requiresDelivery
                                    ? 'bg-amber-500/10 border-amber-500 text-amber-950 font-black ring-2 ring-amber-500/20'
                                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                                }`}
                            >
                                <div className={`p-2 rounded-xl shrink-0 ${requiresDelivery ? 'bg-amber-500 text-slate-950' : 'bg-slate-200 text-slate-500'}`}>
                                    <Truck className="w-5 h-5" />
                                </div>
                                <div>
                                    <div className="font-bold text-sm">Sí, requiero delivery</div>
                                    <div className="text-[11px] text-slate-500 font-medium mt-0.5">
                                        Para enviar pedidos a domicilio con repartidores o flota propia.
                                    </div>
                                </div>
                            </button>

                            <button
                                type="button"
                                onClick={() => setRequiresDelivery(false)}
                                className={`p-4 rounded-2xl border text-left flex items-start gap-3 transition-all cursor-pointer ${!requiresDelivery
                                    ? 'bg-slate-900 border-slate-900 text-white font-black ring-2 ring-slate-900/20'
                                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                                }`}
                            >
                                <div className={`p-2 rounded-xl shrink-0 ${!requiresDelivery ? 'bg-white text-slate-950' : 'bg-slate-200 text-slate-500'}`}>
                                    <Store className="w-5 h-5" />
                                </div>
                                <div>
                                    <div className="font-bold text-sm">No, solo retiro en local</div>
                                    <div className="text-[11px] opacity-70 font-medium mt-0.5">
                                        Los clientes consumen en tu local o pasan a retirar personalmente.
                                    </div>
                                </div>
                            </button>
                        </div>
                        <p className="text-[11px] text-slate-400 font-medium ml-1">
                            * Nota: Puedes cambiar este parámetro en cualquier momento desde la configuración de logística de tu perfil.
                        </p>
                    </div>

                    {/* Modal Footer Buttons */}
                    <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isSubmitting}
                            className="px-6 py-3.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="px-8 py-3.5 rounded-2xl bg-primary hover:bg-primary/90 text-slate-950 font-black text-xs shadow-xl shadow-primary/20 flex items-center gap-2 transition-all cursor-pointer"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    <span>Enviando Recaudos...</span>
                                </>
                            ) : (
                                <>
                                    <ShieldCheck className="w-4 h-4" />
                                    <span>Enviar Solicitud de Verificación</span>
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
