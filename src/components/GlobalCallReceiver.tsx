import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import InAppCall from './InAppCall';
import { sendAppNotification } from '../services/nativeNotificationService';
import { vibrate } from '../utils/haptics';

interface IncomingCallState {
    requestId: string;
    remoteId: string;
    remoteDisplayName: string;
    remotePhotoUrl?: string;
    offer: any;
}

export default function GlobalCallReceiver() {
    const { user } = useAuth();
    const location = useLocation();
    const [incomingCall, setIncomingCall] = useState<IncomingCallState | null>(null);

    // If already on the dedicated tracking screen, let TransportTracker handle calls
    const isTrackingScreen = location.pathname.startsWith('/taxi/track');

    useEffect(() => {
        const userId = user?.id || (user as any)?.uid;
        if (!userId) return;

        const handleOfferSignal = async (payload: any) => {
            if (isTrackingScreen) return;
            if (payload?.type === 'offer' && payload.offer && payload.from !== userId) {
                const reqId = payload.requestId || localStorage.getItem('active_transport_req_id');
                if (!reqId) return;

                let driverName = payload.callerName || 'Conductor';
                let driverPhoto = payload.callerPhoto || '';

                if (!payload.callerName) {
                    try {
                        const { data } = await supabase
                            .from('transport_requests')
                            .select('driver_id, driver:driver_id(full_name, documents)')
                            .eq('id', reqId)
                            .maybeSingle();

                        if (data?.driver) {
                            driverName = (data.driver as any).full_name || 'Conductor';
                            driverPhoto = (data.driver as any).documents?.selfieUrl || '';
                        }
                    } catch (e) {
                        console.warn("Could not fetch caller details:", e);
                    }
                }

                vibrate([500, 250, 500, 250, 500]);
                sendAppNotification({
                    title: `📞 Llamada de ${driverName}`,
                    body: 'Llamada entrante de tu servicio de transporte. Toca para contestar.',
                    soundType: 'client'
                });

                setIncomingCall({
                    requestId: reqId,
                    remoteId: payload.from,
                    remoteDisplayName: driverName,
                    remotePhotoUrl: driverPhoto,
                    offer: payload.offer
                });
            } else if (payload?.type === 'status' && (payload.status === 'ended' || payload.status === 'rejected')) {
                setIncomingCall(null);
            }
        };

        const userChannel = supabase.channel(user_call_, {
            config: { broadcast: { self: false } }
        });

        userChannel
            .on('broadcast', { event: 'signal' }, ({ payload }) => {
                handleOfferSignal(payload);
            })
            .subscribe();

        const activeReqId = localStorage.getItem('active_transport_req_id');
        let requestChannel: any = null;
        if (activeReqId) {
            requestChannel = supabase.channel(call_, {
                config: { broadcast: { self: false } }
            });
            requestChannel
                .on('broadcast', { event: 'signal' }, ({ payload }) => {
                    handleOfferSignal(payload);
                })
                .subscribe();
        }

        return () => {
            supabase.removeChannel(userChannel);
            if (requestChannel) {
                supabase.removeChannel(requestChannel);
            }
        };
    }, [user?.id, (user as any)?.uid, isTrackingScreen]);

    if (!incomingCall || isTrackingScreen) return null;

    return (
        <InAppCall
            requestId={incomingCall.requestId}
            myId={user?.id || (user as any)?.uid || 'client'}
            remoteId={incomingCall.remoteId}
            remoteDisplayName={incomingCall.remoteDisplayName}
            remotePhotoUrl={incomingCall.remotePhotoUrl}
            role="receiver"
            initialOffer={incomingCall.offer}
            onClose={() => setIncomingCall(null)}
        />
    );
}
