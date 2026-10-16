import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Shield, Lock, MapPin, Eye, FileText, CheckCircle2, Trash2 } from 'lucide-react';

export interface PrivacyPolicyModalProps {
    isOpen: boolean;
    onClose: () => void;
    appName?: string;
}

export const PrivacyPolicyModal: React.FC<PrivacyPolicyModalProps> = ({
    isOpen,
    onClose,
    appName = 'Un 2x3'
}) => {
    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm overflow-hidden">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="bg-white rounded-[32px] w-full max-w-2xl max-h-[90vh] shadow-2xl flex flex-col overflow-hidden border border-slate-100"
                    >
                        {/* Header */}
                        <div className="p-5 sm:p-6 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-primary backdrop-blur-md">
                                    <Shield className="w-5 h-5 text-amber-400" />
                                </div>
                                <div>
                                    <h2 className="text-base sm:text-lg font-black tracking-tight leading-tight">
                                        Política de Privacidad y Términos
                                    </h2>
                                    <p className="text-[11px] text-slate-300 font-medium">
                                        {appName} • Cumplimiento Google Play & Protección de Datos
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={onClose}
                                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all active:scale-95"
                                aria-label="Cerrar modal"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Content Body */}
                        <div className="p-6 overflow-y-auto space-y-6 text-slate-700 text-xs sm:text-sm leading-relaxed">
                            {/* Intro */}
                            <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200/60 flex items-start gap-3">
                                <Lock className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                                <div className="text-amber-900 text-xs leading-relaxed">
                                    <p className="font-bold mb-1">Tu privacidad es nuestra prioridad</p>
                                    En <span className="font-bold">{appName}</span> protegemos tus datos personales conforme a los más altos estándares y directrices del Programa de Desarrolladores de Google Play. Esta política detalla qué información recopilamos, cómo la utilizamos y cómo puedes solicitar la eliminación permanente de tus datos.
                                </div>
                            </div>

                            {/* Section 1 */}
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 text-slate-900 font-black text-sm">
                                    <FileText className="w-4 h-4 text-primary" />
                                    <h3>1. Información que recopilamos</h3>
                                </div>
                                <p className="text-slate-600">
                                    Para ofrecer nuestros servicios de delivery de comida, compras y viajes compartidos, recolectamos:
                                </p>
                                <ul className="list-disc pl-5 space-y-1 text-slate-600">
                                    <li><strong className="text-slate-800">Datos de Cuenta:</strong> Nombre completo, número telefónico, correo electrónico y credenciales de autenticación segura.</li>
                                    <li><strong className="text-slate-800">Direcciones y Destinos:</strong> Direcciones de entrega guardadas y coordenadas de origen/destino seleccionadas voluntariamente.</li>
                                    <li><strong className="text-slate-800">Historial Transaccional:</strong> Pedidos realizados, solicitudes de viajes, comprobantes de pago adjuntados y valoraciones.</li>
                                </ul>
                            </div>

                            {/* Section 2 */}
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 text-slate-900 font-black text-sm">
                                    <MapPin className="w-4 h-4 text-emerald-600" />
                                    <h3>2. Datos de Ubicación y GPS (Primer y Segundo Plano)</h3>
                                </div>
                                <p className="text-slate-600">
                                    <span className="font-semibold text-slate-800">{appName}</span> accede a datos de ubicación precisa de tu dispositivo:
                                </p>
                                <div className="space-y-2 bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
                                    <div className="flex items-start gap-2 text-xs">
                                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                                        <div>
                                            <strong className="text-slate-800">Para Clientes:</strong> Se utiliza la ubicación precisa mientras la app está abierta o en uso para autocompletar la dirección de entrega, ubicar comercios cercanos y estimar la tarifa de transporte.
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-2 text-xs">
                                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                                        <div>
                                            <strong className="text-slate-800">Para Conductores y Repartidores:</strong> Se recopilan datos de ubicación en primer plano y en segundo plano (incluso cuando la app está cerrada o no está en pantalla) mientras el conductor esté marcado como «Disponible» o «En viaje», para permitir la asignación óptima de carreras, seguimiento en tiempo real de seguridad por el pasajero y cálculo de rutas.
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Section 3 */}
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 text-slate-900 font-black text-sm">
                                    <Eye className="w-4 h-4 text-indigo-600" />
                                    <h3>3. Permisos de Cámara, Almacenamiento y Notificaciones</h3>
                                </div>
                                <ul className="list-disc pl-5 space-y-1 text-slate-600">
                                    <li><strong className="text-slate-800">Cámara / Fotos:</strong> Solicitado únicamente cuando decides subir tu foto de perfil o adjuntar un comprobante de pago móvil/transferencia.</li>
                                    <li><strong className="text-slate-800">Notificaciones Push:</strong> Utilizadas para avisarte sobre el estado de tu pedido, la llegada del conductor o promociones especiales. Puedes desactivarlas en cualquier momento en los ajustes del sistema.</li>
                                </ul>
                            </div>

                            {/* Section 4 */}
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 text-rose-700 font-black text-sm">
                                    <Trash2 className="w-4 h-4 text-rose-600" />
                                    <h3>4. Eliminación Definitiva de Cuenta y Datos (Google Play Compliance)</h3>
                                </div>
                                <p className="text-slate-600 leading-relaxed">
                                    De conformidad con la política de eliminación de cuentas de Google Play, cualquier usuario tiene el derecho inalienable de eliminar su cuenta y todos los datos asociados de forma permanente:
                                </p>
                                <div className="bg-rose-50 border border-rose-200/80 p-4 rounded-2xl text-xs space-y-2 text-rose-900">
                                    <p>
                                        • <span className="font-bold">Dentro de la App:</span> Ve a tu Perfil &gt; Editar Perfil o al pie de página &gt; haz clic en <span className="font-bold text-rose-600">«Eliminar mi cuenta»</span> &gt; confirma escribiendo la palabra «ELIMINAR».
                                    </p>
                                    <p>
                                        • <span className="font-bold">Efecto Inmediato:</span> Se cancelan tus credenciales de inicio de sesión, se revoca el acceso a la plataforma, se anonimizan tus datos personales y se marca la cuenta como eliminada definitivamente en la base de datos.
                                    </p>
                                    <p>
                                        • <span className="font-bold">Solicitud Web / Soporte:</span> También puedes solicitar la eliminación escribiendo a nuestro canal de soporte en <span className="font-semibold underline">soporte@un2x3.com</span> o a través de nuestro soporte de WhatsApp oficial.
                                    </p>
                                </div>
                            </div>

                            {/* Section 5 */}
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 text-slate-900 font-black text-sm">
                                    <Shield className="w-4 h-4 text-emerald-600" />
                                    <h3>5. Seguridad y Terceros</h3>
                                </div>
                                <p className="text-slate-600">
                                    No vendemos ni comercializamos tus datos con terceros. La información solo se comparte con los actores estrictamente necesarios para cumplir con el servicio (ej. conductor asignado a tu carrera para recoger el servicio). Todos los datos se transmiten mediante protocolos cifrados SSL/TLS.
                                </p>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-100 flex items-center justify-between shrink-0">
                            <span className="text-[11px] text-slate-400 font-semibold">
                                Actualizado: Octubre 2026
                            </span>
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-all active:scale-95 shadow-md shadow-slate-900/10"
                            >
                                Entendido
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default PrivacyPolicyModal;
