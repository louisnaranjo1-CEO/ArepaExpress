import React, { useEffect, useState } from 'react';
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
    const [incomingCall, setIncomingCall] = useState<IncomingCallState | null>(null);

    useEffect(() => {
        const driverId = user?.id || (user as any)?.uid;
        if (!driverId) return;

        const handleOfferSignal = async (payload: any) => {
            if (payload?.type === 'offer' && payload.offer && payload.from !== driverId) {
                const reqId = payload.requestId || localStorage.getItem('active_transport_req_id');
                if (!reqId) return;

                let clientName = payload.callerName || 'Cliente';
                let clientPhoto = payload.callerPhoto || '';

                if (!payload.callerName) {
                    try {
                        const { data } = await supabase
                            .from('transport_requests')
                            .select('user_name')
                            .eq('id', reqId)
                            .maybeSingle();

                        if (data?.user_name) {
                            clientName = data.user_name;
                        }
                    } catch (e) {
                        console.warn("Could not fetch caller details:", e);
                    }
                }

                vibrate([500, 250, 500, 250, 500]);
                sendAppNotification({
                    title: `📞 Llamada de ${clientName}`,
                    body: 'Llamada entrante del cliente. Toca para contestar.',
                    soundType: 'delivery'
                });

                setIncomingCall({
                    requestId: reqId,
                    remoteId: payload.from,
                    remoteDisplayName: clientName,
                    remotePhotoUrl: clientPhoto,
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

        return () => {
            supabase.removeChannel(userChannel);
        };
    }, [user?.id, (user as any)?.uid]);

    if (!incomingCall) return null;

    return (
        <InAppCall
            requestId={incomingCall.requestId}
            myId={user?.id || (user as any)?.uid || 'driver'}
            remoteId={incomingCall.remoteId}
            remoteDisplayName={incomingCall.remoteDisplayName}
            remotePhotoUrl={incomingCall.remotePhotoUrl}
            role="receiver"
            initialOffer={incomingCall.offer}
            onClose={() => setIncomingCall(null)}
        />
    );
}
