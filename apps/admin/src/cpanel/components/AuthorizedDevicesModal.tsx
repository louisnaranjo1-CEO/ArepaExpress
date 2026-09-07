import React, { useState, useEffect } from 'react';
import { Shield, Laptop, Smartphone, Trash2, X, Check, AlertCircle, KeyRound, RefreshCw, Clock } from 'lucide-react';
import { 
    AuthorizedDevice, 
    getAuthorizedDevices, 
    revokeAuthorizedDevice, 
    getAdminDeviceId, 
    updateAdminSecurityPin 
} from '../../lib/adminSecurity';

interface AuthorizedDevicesModalProps {
    isOpen: boolean;
    onClose: () => void;
    userId: string;
}

export default function AuthorizedDevicesModal({ isOpen, onClose, userId }: AuthorizedDevicesModalProps) {
    const [devices, setDevices] = useState<AuthorizedDevice[]>([]);
    const [loading, setLoading] = useState(true);
    const [revokingId, setRevokingId] = useState<string | null>(null);

    // PIN Management State
    const [showChangePin, setShowChangePin] = useState(false);
    const [newPin, setNewPin] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [pinLoading, setPinLoading] = useState(false);
    const [pinMessage, setPinMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    const currentDeviceId = getAdminDeviceId();

    const fetchDevices = async () => {
        setLoading(true);
        const data = await getAuthorizedDevices(userId);
        setDevices(data);
        setLoading(false);
    };

    useEffect(() => {
        if (isOpen && userId) {
            fetchDevices();
        }
    }, [isOpen, userId]);

    if (!isOpen) return null;

    const handleRevoke = async (device: AuthorizedDevice) => {
        const isCurrent = device.device_id === currentDeviceId;
        const confirmMsg = isCurrent 
            ? "¿Seguro que deseas revocar este dispositivo actual? Se cerrará tu sesión de inmediato."
            : `¿Revocar acceso al dispositivo "${device.device_name}"? Ya no podrá entrar al Super Panel.`;

        if (!window.confirm(confirmMsg)) return;

        setRevokingId(device.id);
        const success = await revokeAuthorizedDevice(device.id, device.device_id);
        setRevokingId(null);

        if (success) {
            if (isCurrent) {
                window.location.reload();
            } else {
                setDevices(prev => prev.filter(d => d.id !== device.id));
            }
        } else {
            alert("No se pudo revocar el dispositivo.");
        }
    };

    const handleUpdatePin = async (e: React.FormEvent) => {
        e.preventDefault();
        setPinMessage(null);

        if (newPin.trim().length < 4) {
            setPinMessage({ type: 'error', text: 'El código debe tener al menos 4 caracteres o dígitos.' });
            return;
        }

        if (newPin.trim() !== confirmPin.trim()) {
            setPinMessage({ type: 'error', text: 'Los códigos no coinciden.' });
            return;
        }

        setPinLoading(true);
        const success = await updateAdminSecurityPin(userId, newPin.trim());
        setPinLoading(false);

        if (success) {
            setPinMessage({ type: 'success', text: '¡Código Maestro actualizado exitosamente!' });
            setNewPin('');
            setConfirmPin('');
            setTimeout(() => {
                setShowChangePin(false);
                setPinMessage(null);
            }, 1800);
        } else {
            setPinMessage({ type: 'error', text: 'Error al actualizar el código en el servidor.' });
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-primary/10 text-slate-900 rounded-2xl flex items-center justify-center">
                            <Shield className="w-5 h-5 text-slate-900" />
                        </div>
                        <div>
                            <h3 className="text-lg font-black text-slate-900 leading-tight">Dispositivos Autorizados</h3>
                            <p className="text-xs text-slate-500 font-medium">Equipos con acceso permitido al Super Panel</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-xl transition-all"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 overflow-y-auto space-y-6">
                    {/* Security PIN Section */}
                    <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-amber-100 text-amber-700 rounded-xl">
                                    <KeyRound className="w-4 h-4" />
                                </div>
                                <div>
                                    <p className="text-xs font-black text-slate-900">Código Maestro de Seguridad</p>
                                    <p className="text-[11px] text-slate-500">Usado para autorizar nuevos equipos al instante</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowChangePin(!showChangePin)}
                                className="px-3.5 py-1.5 text-xs font-black text-slate-700 bg-white border border-slate-200 hover:border-primary rounded-xl transition-all shadow-sm"
                            >
                                {showChangePin ? "Cancelar" : "Cambiar Código"}
                            </button>
                        </div>

                        {showChangePin && (
                            <form onSubmit={handleUpdatePin} className="mt-4 pt-4 border-t border-slate-200 space-y-3">
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 ml-1">
                                            Nuevo Código
                                        </label>
                                        <input
                                            type="password"
                                            required
                                            value={newPin}
                                            onChange={(e) => setNewPin(e.target.value)}
                                            placeholder="Mínimo 4 caracteres"
                                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-primary mt-1"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 ml-1">
                                            Confirmar Código
                                        </label>
                                        <input
                                            type="password"
                                            required
                                            value={confirmPin}
                                            onChange={(e) => setConfirmPin(e.target.value)}
                                            placeholder="Repite el código"
                                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-primary mt-1"
                                        />
                                    </div>
                                </div>

                                {pinMessage && (
                                    <p className={`text-xs font-bold flex items-center gap-1.5 ${pinMessage.type === 'success' ? 'text-emerald-600' : 'text-red-500'}`}>
                                        {pinMessage.type === 'success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                                        {pinMessage.text}
                                    </p>
                                )}

                                <button
                                    type="submit"
                                    disabled={pinLoading}
                                    className="w-full bg-primary text-slate-900 font-bold py-2.5 rounded-xl text-xs hover:opacity-90 transition-all shadow-sm flex items-center justify-center gap-2"
                                >
                                    {pinLoading ? "Guardando..." : "Guardar Nuevo Código Maestro"}
                                </button>
                            </form>
                        )}
                    </div>

                    {/* Devices List */}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <h4 className="text-xs font-black uppercase tracking-wider text-slate-400">
                                Equipos con Acceso Activo ({devices.length})
                            </h4>
                            <button
                                onClick={fetchDevices}
                                className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 font-bold"
                            >
                                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                                Actualizar
                            </button>
                        </div>

                        {loading ? (
                            <div className="p-8 text-center text-slate-400 text-xs font-bold">
                                Cargando dispositivos...
                            </div>
                        ) : devices.length === 0 ? (
                            <div className="p-8 text-center text-slate-400 text-xs font-medium border-2 border-dashed border-slate-200 rounded-2xl">
                                No se encontraron dispositivos registrados.
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {devices.map((d) => {
                                    const isCurrent = d.device_id === currentDeviceId;
                                    const isMobile = d.browser_info?.includes('Android') || d.browser_info?.includes('iOS') || d.browser_info?.includes('iPhone');

                                    return (
                                        <div
                                            key={d.id}
                                            className={`p-4 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                                                isCurrent 
                                                    ? 'bg-emerald-50/50 border-emerald-200/80 shadow-sm' 
                                                    : 'bg-white border-slate-200 hover:border-slate-300'
                                            }`}
                                        >
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className={`p-3 rounded-xl shrink-0 ${isCurrent ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                                                    {isMobile ? <Smartphone className="w-5 h-5" /> : <Laptop className="w-5 h-5" />}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <p className="text-sm font-black text-slate-900 truncate">
                                                            {d.device_name}
                                                        </p>
                                                        {isCurrent && (
                                                            <span className="px-2 py-0.5 bg-emerald-600 text-white rounded-full text-[9px] font-black uppercase tracking-wider shrink-0">
                                                                Este Equipo
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-[11px] text-slate-500 font-medium truncate mt-0.5">
                                                        {d.browser_info || "Navegador Web"}
                                                    </p>
                                                    <p className="text-[10px] text-slate-400 flex items-center gap-1 mt-1 font-medium">
                                                        <Clock className="w-3 h-3" />
                                                        Último acceso: {new Date(d.last_active_at).toLocaleString()}
                                                    </p>
                                                </div>
                                            </div>

                                            <button
                                                onClick={() => handleRevoke(d)}
                                                disabled={revokingId === d.id}
                                                className="p-2.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all shrink-0"
                                                title="Revocar acceso a este equipo"
                                            >
                                                {revokingId === d.id ? (
                                                    <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                                                ) : (
                                                    <Trash2 className="w-4 h-4" />
                                                )}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 bg-slate-50 border-t border-slate-100 text-center">
                    <p className="text-[11px] text-slate-400 font-medium">
                        Cualquier equipo desconocido que intente entrar será bloqueado automáticamente.
                    </p>
                </div>
            </div>
        </div>
    );
}
