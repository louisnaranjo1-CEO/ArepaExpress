import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { ShoppingBag, Clock, MapPin, Truck, Check, X, ShieldAlert, Phone, MessageCircle, Store as StoreIcon, Award, Eye, CheckCircle2 } from 'lucide-react';
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
                setOrders(data.map((d: any) => {
                    const cDate = d.created_at ? new Date(d.created_at) : new Date();
                    return {
                        id: d.id,
                        userName: d.user_name || d.userName,
                        restaurantName: d.restaurant_name || d.restaurantName,
                        restaurantId: d.restaurant_id || d.restaurantId,
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
            return <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-amber-100 text-amber-800 animate-pulse flex items-center gap-1"><ShieldAlert className="w-3 h-3" /> Pago Móvil por Verificar</span>;
        }

        if (whatsappOrder && status === 'completed') {
            return <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-emerald-100 text-emerald-800 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Venta WhatsApp Confirmada</span>;
        }

        const statuses: Record<string, { label: string, color: string }> = {
            'pending': { label: 'Pendiente/Chat', color: 'bg-yellow-100 text-yellow-700' },
            'pendiente_pago': { label: 'Pendiente/Chat', color: 'bg-yellow-100 text-yellow-700' },
            'whatsapp_contacted': { label: 'En WhatsApp (Pendiente 15m)', color: 'bg-blue-100 text-blue-700' },
            'verificando_pago_delivery': { label: 'Verificando Pago Envío', color: 'bg-purple-100 text-purple-700' },
            'preparing': { label: 'Preparándose', color: 'bg-blue-100 text-blue-700' },
            'delivering': { label: 'En Camino', color: 'bg-orange-100 text-orange-700' },
            'delivered': { label: 'Entregado', color: 'bg-green-100 text-green-700' },
            'completed': { label: 'Completado', color: 'bg-green-100 text-green-700' },
            'cancelled': { label: 'Cancelado', color: 'bg-red-100 text-red-700' },
            'rejected': { label: 'Rechazado', color: 'bg-red-100 text-red-700' },
        };
        const current = statuses[status] || { label: status, color: 'bg-slate-100 text-slate-700' };
        return <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest ${current.color}`}>{current.label}</span>;
    };

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            <div className="flex items-center justify-between mb-2">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 mb-2">Pedidos y Ventas de la App</h1>
                    <p className="text-slate-500 font-medium">Monitorea pedidos en vivo, ventas por WhatsApp y verifica comprobantes de Pago Móvil.</p>
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
                            <div key={order.id} className="bg-white rounded-[32px] p-6 shadow-sm border border-slate-100 relative group hover:border-primary/30 transition-all overflow-hidden flex flex-col h-full">
                                <div className="flex justify-between items-start mb-4 relative z-10">
                                    <div>
                                        <p className="text-sm font-black text-slate-400">#{order.id.slice(0, 8).toUpperCase()}</p>
                                        <p className="text-lg font-black text-slate-900">{order.userName || 'Cliente'}</p>
                                    </div>
                                    {getStatusBadge(order.status, order.paymentStatus, order.whatsappOrder)}
                                </div>

                                <div className="space-y-2.5 mb-6 relative z-10 flex-1">
                                    <div className="flex items-center gap-3 text-slate-600">
                                        <StoreIcon className="w-5 h-5 text-slate-400 shrink-0" />
                                        <span className="font-bold text-sm truncate">{order.restaurantName || 'Restaurante'}</span>
                                    </div>
                                    
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
