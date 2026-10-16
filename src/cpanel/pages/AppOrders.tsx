import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { ShoppingBag, Clock, MapPin, Truck, Check, X, ShieldAlert, Phone, MessageCircle, Store as StoreIcon, Award, Eye, CheckCircle2, User } from 'lucide-react';
import DualPrice from '../../components/DualPrice';
import OrderChatWindow from '../../components/chat/OrderChatWindow';
import toast from 'react-hot-toast';

export default function AppOrders() {
    const [orders, setOrders] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedOrderForChat, setSelectedOrderForChat] = useState<any | null>(null);
    const [selectedReceipt, setSelectedReceipt] = useState<string | null>(null);
    const [approvingId, setApprovingId] = useState<string | null>(null);

    const fetchOrders = async () => {
        try {
            const { data, error } = await supabase
                .from('orders')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(100);

            if (error) throw error;
            if (data) {
                const userIds = Array.from(new Set(data.map((d: any) => d.user_id).filter(Boolean)));
                const restIds = Array.from(new Set(data.map((d: any) => d.restaurant_id || d.restaurantId).filter(Boolean)));
                const driverIds = Array.from(new Set(data.map((d: any) => d.driver_id || d.delivery_driver_id || d.driverId || d.deliveryDriverId).filter(Boolean)));

                let profilesMap: Record<string, any> = {};
                if (userIds.length > 0) {
                    const { data: profs } = await supabase
                        .from('profiles')
                        .select('id, photo_url, avatar_url, full_name')
                        .in('id', userIds);
                    if (profs) {
                        profs.forEach((p: any) => {
                            profilesMap[p.id] = p;
                        });
                    }
                }

                let comerciosMap: Record<string, any> = {};
                if (restIds.length > 0) {
                    const { data: coms } = await supabase
                        .from('comercios')
                        .select('id, name, logo_url, image_url, image')
                        .in('id', restIds);
                    if (coms) {
                        coms.forEach((c: any) => {
                            comerciosMap[c.id] = c;
                        });
                    }
                }

                let driversMap: Record<string, any> = {};
                if (driverIds.length > 0) {
                    const { data: drvs } = await supabase
                        .from('drivers')
                        .select('id, full_name, photo_url, documents')
                        .in('id', driverIds);
                    if (drvs) {
                        drvs.forEach((drv: any) => {
                            driversMap[drv.id] = drv;
                        });
                    }

                    const missingDrvs = driverIds.filter((id: string) => !driversMap[id]);
                    if (missingDrvs.length > 0) {
                        const { data: drvProfs } = await supabase
                            .from('profiles')
                            .select('id, full_name, photo_url, avatar_url')
                            .in('id', missingDrvs);
                        if (drvProfs) {
                            drvProfs.forEach((dp: any) => {
                                driversMap[dp.id] = { id: dp.id, full_name: dp.full_name, photo_url: dp.photo_url || dp.avatar_url };
                            });
                        }
                    }
                }

                setOrders(data.map((d: any) => {
                    const cDate = d.created_at ? new Date(d.created_at) : new Date();
                    const prof = profilesMap[d.user_id];
                    const userPhoto = d.user_photo || prof?.photo_url || prof?.avatar_url || null;

                    const rId = d.restaurant_id || d.restaurantId;
                    const rest = comerciosMap[rId];
                    const restaurantLogo = d.restaurant_logo || d.restaurantLogo || rest?.logo_url || rest?.image_url || rest?.image || null;

                    const drvId = d.driver_id || d.delivery_driver_id || d.driverId || d.deliveryDriverId;
                    const drv = driversMap[drvId];
                    const driverPhoto = d.driver_photo || d.driverPhoto || drv?.photo_url || drv?.documents?.selfie_url || drv?.documents?.selfie || drv?.documents?.photo_url || null;
                    const driverName = d.driver_name || d.driverName || drv?.full_name || null;

                    return {
                        id: d.id,
                        userName: d.user_name || d.userName || prof?.full_name,
                        userPhoto,
                        user_photo: userPhoto,
                        restaurantName: d.restaurant_name || d.restaurantName || rest?.name,
                        restaurantLogo,
                        restaurantId: rId,
                        driverId: drvId,
                        driverName,
                        driverPhoto,
                        deliveryMethod: d.delivery_method || d.deliveryMethod,
                        deliveryAddress: d.delivery_address || d.deliveryAddress,
                        phone: d.user_phone || d.phone,
                        status: d.status,
                        total: d.total,
                        commissionAmount: d.commission_amount || d.commissionAmount || 0,
                        whatsappOrder: d.whatsapp_order || d.whatsappOrder || false,
                        paymentMethod: d.payment_method || d.paymentMethod,
                        paymentStatus: d.payment_status || d.paymentStatus,
                        paymentProofUrl: d.payment_proof_url || d.paymentProofUrl || d.delivery_payment_receipt || d.deliveryPaymentReceipt,
                        paymentReference: d.payment_reference || d.paymentReference,
                        pointsCredited: d.points_credited || d.pointsCredited || false,
                        createdAt: {
                            toDate: () => cDate
                        },
                        ...d
                    };
                }));
            }
        } catch (err) {
            console.error("Error fetching app orders:", err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchOrders();

        const channel = supabase
            .channel('cpanel_app_orders')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
                fetchOrders();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const handleVerifyPagoMovil = async (orderId: string, userName: string) => {
        setApprovingId(orderId);
        try {
            const { data, error } = await supabase.rpc('verify_pago_movil_points', {
                p_order_id: orderId
            });

            if (error) throw error;

            if (data && data.success === false) {
                toast.error(data.message || "Error al verificar");
                return;
            }

            toast.success(`Pago Móvil verificado y ${data.points_credited || 0} puntos otorgados a ${userName}`);
            fetchOrders();
        } catch (err: any) {
            console.error("Error verifying pago movil:", err);
            toast.error("Error: " + (err.message || ""));
        } finally {
            setApprovingId(null);
        }
    };

    const getStatusBadge = (status: string, paymentStatus?: string, whatsappOrder?: boolean) => {
        if (paymentStatus === 'pending_verification') {
            return <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 animate-pulse flex items-center gap-1 shrink-0"><ShieldAlert className="w-3 h-3" /> PAGO MÓVIL POR VERIFICAR</span>;
        }

        if (whatsappOrder && (status === 'completed' || status === 'delivered' || status === 'COMPLETED')) {
            return <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 flex items-center gap-1 shrink-0"><CheckCircle2 className="w-3 h-3" /> VENTA WHATSAPP CONFIRMADA</span>;
        }

        const norm = (status || '').toUpperCase().trim();
        const statuses: Record<string, { label: string, color: string }> = {
            'CANCELLED_BY_CLIENT': { label: 'CANCELADO POR CLIENTE', color: 'bg-red-100 text-red-700' },
            'CANCELLED': { label: 'CANCELADO', color: 'bg-red-100 text-red-700' },
            'CANCELED': { label: 'CANCELADO', color: 'bg-red-100 text-red-700' },
            'REJECTED': { label: 'RECHAZADO', color: 'bg-red-100 text-red-700' },
            'PENDING': { label: 'PENDIENTE', color: 'bg-yellow-100 text-yellow-700' },
            'PENDIENTE': { label: 'PENDIENTE', color: 'bg-yellow-100 text-yellow-700' },
            'PENDIENTE_PAGO': { label: 'PENDIENTE DE PAGO', color: 'bg-yellow-100 text-yellow-700' },
            'WHATSAPP_CONTACTED': { label: 'EN WHATSAPP (15M)', color: 'bg-blue-100 text-blue-700' },
            'VERIFICANDO_PAGO_DELIVERY': { label: 'VERIFICANDO PAGO ENVÍO', color: 'bg-purple-100 text-purple-700' },
            'SEARCHING': { label: 'BUSCANDO CONDUCTOR', color: 'bg-indigo-100 text-indigo-700' },
            'BUSCANDO_PILOTO': { label: 'BUSCANDO CONDUCTOR', color: 'bg-indigo-100 text-indigo-700' },
            'ACCEPTED': { label: 'ACEPTADO', color: 'bg-blue-100 text-blue-700' },
            'PREPARING': { label: 'PREPARÁNDOSE', color: 'bg-blue-100 text-blue-700' },
            'DELIVERING': { label: 'EN CAMINO', color: 'bg-orange-100 text-orange-700' },
            'IN_PROGRESS': { label: 'EN CURSO', color: 'bg-emerald-100 text-emerald-700' },
            'COMPLETED': { label: 'COMPLETADO', color: 'bg-emerald-100 text-emerald-700' },
            'DELIVERED': { label: 'COMPLETADO', color: 'bg-emerald-100 text-emerald-700' },
        };
        const current = statuses[norm] || { label: norm.replace(/_/g, ' ') || 'DESCONOCIDO', color: 'bg-slate-100 text-slate-700' };
        return <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider shrink-0 ${current.color}`}>{current.label}</span>;
    };

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            <div className="flex items-center justify-between mb-2">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-black text-slate-900 mb-1 sm:mb-2">Pedidos y Ventas de la App</h1>
                    <p className="text-slate-500 font-medium text-xs sm:text-sm">Monitorea pedidos en vivo, ventas por WhatsApp y verifica comprobantes de Pago Móvil.</p>
                </div>
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center py-20">
                    <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                </div>
            ) : orders.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-[32px] border-2 border-slate-100">
                    <ShoppingBag className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                    <p className="text-xl font-bold text-slate-400">No hay pedidos recientes</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {orders.map(order => {
                        const isPendingPagoMovil = order.paymentStatus === 'pending_verification';
                        const receiptUrl = order.paymentProofUrl;

                        return (
                            <div key={order.id} className="bg-white rounded-[28px] sm:rounded-[32px] p-5 sm:p-6 shadow-sm border border-slate-100 relative group hover:border-primary/30 transition-all overflow-hidden flex flex-col h-full">
                                <div className="flex justify-between items-start gap-2 mb-4 relative z-10">
                                    <div className="flex items-center gap-3 min-w-0">
                                        {order.userPhoto ? (
                                            <img 
                                                src={order.userPhoto} 
                                                alt={order.userName || 'Cliente'} 
                                                className="w-11 h-11 rounded-full object-cover border-2 border-primary/30 shadow-xs shrink-0"
                                                onError={(e) => {
                                                    (e.currentTarget as HTMLElement).style.display = 'none';
                                                    (e.currentTarget.nextElementSibling as HTMLElement)?.classList.remove('hidden');
                                                }}
                                            />
                                        ) : null}
                                        <div className={`w-11 h-11 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-white font-black text-xs shrink-0 ${order.userPhoto ? 'hidden' : ''}`}>
                                            {order.userName ? order.userName.slice(0, 2).toUpperCase() : <User className="w-5 h-5 text-slate-400" />}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-xs font-black text-slate-400">#{order.id.slice(0, 8).toUpperCase()}</p>
                                            <p className="text-base sm:text-lg font-black text-slate-900 truncate">{order.userName || 'Cliente'}</p>
                                        </div>
                                    </div>
                                    {getStatusBadge(order.status, order.paymentStatus, order.whatsappOrder)}
                                </div>

                                <div className="space-y-2.5 mb-5 relative z-10 flex-1">
                                    {/* Negocio / Comercio */}
                                    <div className="flex items-center gap-2.5 p-2 bg-slate-50 rounded-2xl border border-slate-100">
                                        {order.restaurantLogo ? (
                                            <img 
                                                src={order.restaurantLogo} 
                                                alt={order.restaurantName || 'Comercio'} 
                                                className="w-9 h-9 rounded-xl object-cover border border-slate-200 shrink-0 bg-white"
                                                onError={(e) => {
                                                    (e.currentTarget as HTMLElement).style.display = 'none';
                                                    (e.currentTarget.nextElementSibling as HTMLElement)?.classList.remove('hidden');
                                                }}
                                            />
                                        ) : null}
                                        <div className={`w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 ${order.restaurantLogo ? 'hidden' : ''}`}>
                                            <StoreIcon className="w-4 h-4" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Comercio</span>
                                            <span className="font-bold text-sm text-slate-900 truncate block">{order.restaurantName || 'Restaurante'}</span>
                                        </div>
                                    </div>

                                    {/* Conductor asignado */}
                                    {(order.driverName || order.driverPhoto || order.driverId) && (
                                        <div className="flex items-center gap-2.5 p-2 bg-blue-50/70 rounded-2xl border border-blue-100">
                                            {order.driverPhoto ? (
                                                <img 
                                                    src={order.driverPhoto} 
                                                    alt={order.driverName || 'Conductor'} 
                                                    className="w-9 h-9 rounded-full object-cover border-2 border-blue-200 shrink-0 bg-white"
                                                    onError={(e) => {
                                                        (e.currentTarget as HTMLElement).style.display = 'none';
                                                        (e.currentTarget.nextElementSibling as HTMLElement)?.classList.remove('hidden');
                                                    }}
                                                />
                                            ) : null}
                                            <div className={`w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 font-black text-xs ${order.driverPhoto ? 'hidden' : ''}`}>
                                                <Truck className="w-4 h-4" />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider block">Conductor / Delivery</span>
                                                <span className="font-bold text-sm text-slate-900 truncate block">{order.driverName || 'Asignado'}</span>
                                            </div>
                                        </div>
                                    )}
                                    
                                    {order.deliveryAddress && (
                                        <div className="flex items-start gap-3 text-slate-600">
                                            <MapPin className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                                            <span className="text-xs">{order.deliveryAddress}</span>
                                        </div>
                                    )}
                                    
                                    {order.phone && (
                                        <div className="flex items-center gap-3 text-slate-600">
                                            <Phone className="w-5 h-5 text-slate-400 shrink-0" />
                                            <span className="text-xs font-bold">{order.phone}</span>
                                        </div>
                                    )}

                                    {order.paymentMethod && (
                                        <div className="flex items-center gap-2 pt-1">
                                            <span className="text-[10px] font-black uppercase text-slate-400">Método:</span>
                                            <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-lg">
                                                {order.paymentMethod === 'pago_movil' ? 'Pago Móvil' :
                                                 order.paymentMethod === 'efectivo_bs' ? 'Efectivo Bs' :
                                                 order.paymentMethod === 'divisa' ? 'Divisa Física' :
                                                 order.paymentMethod === 'punto_venta' ? 'Punto de Venta' : order.paymentMethod}
                                            </span>
                                            {order.paymentReference && (
                                                <span className="text-[10px] text-slate-400 font-mono">Ref: {order.paymentReference}</span>
                                            )}
                                        </div>
                                    )}

                                    {order.commissionAmount > 0 && (
                                        <div className="p-2.5 bg-emerald-50 text-emerald-800 rounded-xl flex items-center justify-between text-xs font-bold">
                                            <span>Comisión App:</span>
                                            <span>${Number(order.commissionAmount).toFixed(2)} USD</span>
                                        </div>
                                    )}

                                    <div className="flex items-center gap-3 text-slate-400 pt-1">
                                        <Clock className="w-4 h-4" />
                                        <span className="text-[11px] font-medium">
                                            {order.createdAt?.toDate ? order.createdAt.toDate().toLocaleString('es-VE') : 'Reciente'}
                                        </span>
                                    </div>
                                </div>

                                <div className="pt-4 border-t border-slate-100 flex flex-col gap-3 mt-auto">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Venta</p>
                                            <p className="text-xl font-black text-slate-900">
                                                <DualPrice usdAmount={order.total || 0} />
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {receiptUrl && (
                                                <button
                                                    onClick={() => setSelectedReceipt(receiptUrl)}
                                                    className="px-3 py-2 bg-purple-50 text-purple-700 font-bold rounded-xl text-xs flex items-center gap-1.5 hover:bg-purple-100 transition-colors"
                                                >
                                                    <Eye className="w-3.5 h-3.5" />
                                                    Comprobante
                                                </button>
                                            )}
                                            <button 
                                                onClick={() => setSelectedOrderForChat(order)}
                                                className="p-2.5 bg-slate-900 text-white font-bold rounded-xl text-xs hover:bg-slate-800 transition-colors"
                                                title="Abrir Chat"
                                            >
                                                <MessageCircle className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Action to approve Pago Móvil and credit points */}
                                    {isPendingPagoMovil && (
                                        <button
                                            onClick={() => handleVerifyPagoMovil(order.id, order.userName || 'Cliente')}
                                            disabled={approvingId === order.id}
                                            className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
                                        >
                                            <Award className="w-4 h-4" />
                                            {approvingId === order.id ? 'Aprobando...' : 'Aprobar Pago Móvil y Asignar Puntos'}
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Receipt Modal */}
            {selectedReceipt && (
                <div className="fixed inset-0 z-[140] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
                    <div className="bg-white rounded-[32px] max-w-lg w-full p-6 relative flex flex-col items-center">
                        <button
                            onClick={() => setSelectedReceipt(null)}
                            className="absolute top-4 right-4 p-2 rounded-full hover:bg-slate-100 text-slate-500"
                        >
                            <X className="w-5 h-5" />
                        </button>
                        <h3 className="font-black text-lg text-slate-900 mb-4">Comprobante de Pago Móvil</h3>
                        <div className="max-h-[70vh] overflow-y-auto rounded-2xl w-full border border-slate-100 mb-4">
                            <img src={selectedReceipt} alt="Comprobante" className="w-full object-contain" />
                        </div>
                        <a
                            href={selectedReceipt}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-6 py-2.5 bg-primary text-slate-950 font-black text-xs rounded-xl uppercase tracking-wider"
                        >
                            Abrir Imagen en Pantalla Completa
                        </a>
                    </div>
                </div>
            )}

            {/* Chat Modal */}
            {selectedOrderForChat && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setSelectedOrderForChat(null)}></div>
                    <div className="relative w-full max-w-2xl bg-white rounded-[32px] overflow-hidden shadow-2xl h-[80vh] flex flex-col">
                        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                            <div>
                                <h3 className="font-black text-slate-900">Chat con {selectedOrderForChat.userName}</h3>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Pedido #{selectedOrderForChat.id.slice(0, 8).toUpperCase()}</p>
                            </div>
                            <button onClick={() => setSelectedOrderForChat(null)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                                <X className="w-5 h-5 text-slate-500" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-hidden">
                            <OrderChatWindow 
                                orderId={selectedOrderForChat.id} 
                                currentUserId="admin" 
                                currentUserName="Soporte Un 2x3" 
                                currentUserRole="admin" 
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
