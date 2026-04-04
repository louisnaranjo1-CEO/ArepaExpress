import React, { useRef, useState } from 'react';
import { X, Download, Printer, Loader2 } from 'lucide-react';
import * as htmlToImage from 'html-to-image';

interface OrderItem {
    id?: string;
    name: string;
    quantity: number;
    price: number;
    notes?: string;
}

interface ComandaOrder {
    id: string;
    userName?: string;
    items: OrderItem[];
    total: number;
    createdAt?: any;
    orderNote?: string;
    deliveryAddress?: string;
    waiterName?: string;
    tableNumber?: string;
    paymentMethod?: string;
}

interface ComandaPreviewProps {
    order: ComandaOrder;
    restaurantName: string;
    onClose: () => void;
    onPrint: (order: ComandaOrder) => Promise<void>;
}

export default function ComandaPreview({ order, restaurantName, onClose, onPrint }: ComandaPreviewProps) {
    const comandaRef = useRef<HTMLDivElement>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    const handleDownloadAndPrint = async () => {
        setIsProcessing(true);
        try {
            // Generar imagen JPG de la comanda
            if (comandaRef.current) {
                const dataUrl = await htmlToImage.toJpeg(comandaRef.current, { quality: 0.95, backgroundColor: '#ffffff' });
                const link = document.createElement('a');
                link.download = `Comanda_${order.id}_${Date.now()}.jpg`;
                link.href = dataUrl;
                link.click();
            }

            // Realizar impresiones físicas
            await onPrint(order);
            onClose();
        } catch (error) {
            console.error('Error generando comanda', error);
            alert('Error generando comanda visual');
        } finally {
            setIsProcessing(false);
        }
    };

    const dateStr = order.createdAt?.toDate ? order.createdAt.toDate().toLocaleString() : new Date().toLocaleString();

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm px-4">
            <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden flex flex-col max-h-[90vh] shadow-2xl animate-in zoom-in-95 duration-200">
                <div className="flex justify-between items-center p-4 border-b border-slate-100 shrink-0">
                    <h3 className="font-black text-slate-800">Vista Previa Comanda</h3>
                    <button onClick={onClose} disabled={isProcessing} className="text-slate-400 hover:text-slate-600">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 bg-slate-50 flex justify-center">
                    {/* Visual Receipt Element to be captured */}
                    <div ref={comandaRef} className="bg-white p-6 shadow-sm border border-slate-200 w-full font-mono text-sm leading-tight text-black relative">
                        <div className="text-center mb-6">
                            <h2 className="text-xl font-black uppercase mb-1">{restaurantName || 'UN 2X3'}</h2>
                            <p className="text-xs">Comanda General del Pedido</p>
                            <p className="text-xs mt-2 border-b border-dashed border-gray-300 pb-2">Fecha: {dateStr}</p>
                        </div>
                        
                        <div className="mb-4">
                            <p><strong>Pedido ID:</strong> {order.id.slice(-6).toUpperCase()}</p>
                            <p><strong>Cliente:</strong> {order.userName || 'Consumidor Final'}</p>
                            {order.waiterName && <p><strong>Mesero:</strong> {order.waiterName}</p>}
                            {order.tableNumber && <p><strong>Mesa:</strong> {order.tableNumber}</p>}
                            {order.deliveryAddress && order.deliveryAddress !== 'Consumo Local' && <p><strong>Dirección:</strong> {order.deliveryAddress}</p>}
                            {order.paymentMethod && <p><strong>Pago:</strong> {order.paymentMethod}</p>}
                        </div>

                        <div className="border-t border-b border-dashed border-gray-300 py-3 mb-4 flex flex-col gap-2">
                            {order.items.map((item, idx) => (
                                <div key={idx} className="flex flex-col">
                                    <div className="flex justify-between font-bold">
                                        <span>{item.quantity}x {item.name}</span>
                                        <span>${(item.price * item.quantity).toFixed(2)}</span>
                                    </div>
                                    {item.notes && <span className="text-xs text-gray-600 italic ml-4">- {item.notes}</span>}
                                </div>
                            ))}
                        </div>

                        {order.orderNote && (
                            <div className="mb-4 bg-gray-100 p-2 rounded">
                                <p className="font-bold text-xs">Nota General:</p>
                                <p className="text-xs text-gray-700">{order.orderNote}</p>
                            </div>
                        )}

                        <div className="text-right">
                            <p className="text-lg font-black mt-2">TOTAL: ${order.total.toFixed(2)}</p>
                        </div>
                        
                        <div className="mt-8 text-center text-xs text-gray-500">
                            *** CONTROL INTERNO ***
                        </div>
                    </div>
                </div>

                <div className="p-4 border-t border-slate-100 bg-white shrink-0">
                    <button
                        onClick={handleDownloadAndPrint}
                        disabled={isProcessing}
                        className="w-full bg-primary text-white py-4 rounded-2xl font-black shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Download className="w-5 h-5" /> Descargar y Ejecutar Impresoras</>}
                    </button>
                </div>
            </div>
        </div>
    );
}
