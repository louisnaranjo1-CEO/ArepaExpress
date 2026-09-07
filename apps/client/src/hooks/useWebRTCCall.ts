import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export type CallStatus = 'idle' | 'calling' | 'ringing' | 'connected' | 'ended';

// Google's free public STUN servers (no cost)
const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
    ],
};

interface UseWebRTCCallOptions {
    requestId: string;
    myId: string;       // userId or driverId
    remoteId: string;   // the other party's id
    role: 'caller' | 'receiver';
    onCallEnded?: () => void;
}

export function useWebRTCCall({ requestId, myId, remoteId, role, onCallEnded }: UseWebRTCCallOptions) {
    const [callStatus, setCallStatus] = useState<CallStatus>('idle');
    const [duration, setDuration] = useState(0);

    const pcRef = useRef<RTCPeerConnection | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
    const timerRef = useRef<any>(null);
    const channelRef = useRef<any>(null);

    // Cleanup everything
    const cleanup = useCallback(async () => {
        if (timerRef.current) clearInterval(timerRef.current);
        if (pcRef.current) {
            pcRef.current.close();
            pcRef.current = null;
        }
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop());
            localStreamRef.current = null;
        }
        if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = null;
        }
        setCallStatus('ended');
        setDuration(0);
        onCallEnded?.();
    }, [onCallEnded]);

    // Start duration timer when connected
    const startTimer = useCallback(() => {
        timerRef.current = setInterval(() => {
            setDuration(d => d + 1);
        }, 1000);
    }, []);

    // Create RTCPeerConnection and attach tracks
    const createPC = useCallback(async (): Promise<RTCPeerConnection> => {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        localStreamRef.current = stream;

        const pc = new RTCPeerConnection(ICE_SERVERS);
        pcRef.current = pc;

        // Add local audio track
        stream.getTracks().forEach(track => pc.addTrack(track, stream));

        // When remote audio arrives, play it
        pc.ontrack = (event) => {
            if (!remoteAudioRef.current) {
                remoteAudioRef.current = new Audio();
                remoteAudioRef.current.autoplay = true;
            }
            remoteAudioRef.current.srcObject = event.streams[0];
        };

        pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'connected') {
                setCallStatus('connected');
                startTimer();
            }
            if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
                cleanup();
            }
        };

        return pc;
    }, [cleanup, startTimer]);

    useEffect(() => {
        if (!requestId) return;

        const channel = supabase.channel(`call_${requestId}`, {
            config: { broadcast: { self: false } }
        });

        channel
            .on('broadcast', { event: 'signal' }, async ({ payload }) => {
                if (!payload || payload.from === myId) return;

                if (payload.type === 'offer' && role === 'receiver') {
                    setCallStatus('ringing');
                    (channelRef.current as any)._pendingOffer = payload.offer;
                } else if (payload.type === 'answer' && role === 'caller') {
                    if (pcRef.current && !pcRef.current.remoteDescription) {
                        await pcRef.current.setRemoteDescription(new RTCSessionDescription(payload.answer));
                    }
                } else if (payload.type === 'candidate') {
                    if (pcRef.current && payload.candidate) {
                        pcRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate)).catch(() => {});
                    }
                } else if (payload.type === 'status') {
                    if (payload.status === 'ended') {
                        cleanup();
                    } else if (payload.status === 'calling' && role === 'receiver') {
                        setCallStatus('ringing');
                    }
                }
            })
            .subscribe();

        channelRef.current = channel;

        return () => {
            supabase.removeChannel(channel);
        };
    }, [requestId, myId, role, cleanup]);

    /** CALLER: start the call */
    const startCall = useCallback(async () => {
        setCallStatus('calling');
        const pc = await createPC();

        // Broadcast ICE candidates as they are generated
        pc.onicecandidate = (event) => {
            if (event.candidate && channelRef.current) {
                channelRef.current.send({
                    type: 'broadcast',
                    event: 'signal',
                    payload: { type: 'candidate', candidate: event.candidate.toJSON(), from: myId }
                });
            }
        };

        // Create SDP offer
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        if (channelRef.current) {
            channelRef.current.send({
                type: 'broadcast',
                event: 'signal',
                payload: {
                    type: 'offer',
                    offer: { type: offer.type, sdp: offer.sdp },
                    from: myId
                }
            });
        }
    }, [createPC, myId]);

    /** RECEIVER: answer the call */
    const answerCall = useCallback(async () => {
        setCallStatus('connected');
        const pc = await createPC();

        // Broadcast ICE candidates
        pc.onicecandidate = (event) => {
            if (event.candidate && channelRef.current) {
                channelRef.current.send({
                    type: 'broadcast',
                    event: 'signal',
                    payload: { type: 'candidate', candidate: event.candidate.toJSON(), from: myId }
                });
            }
        };

        const pendingOffer = (channelRef.current as any)?._pendingOffer;
        if (pendingOffer) {
            await pc.setRemoteDescription(new RTCSessionDescription(pendingOffer));
        }

        // Create & send answer
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        if (channelRef.current) {
            channelRef.current.send({
                type: 'broadcast',
                event: 'signal',
                payload: {
                    type: 'answer',
                    answer: { type: answer.type, sdp: answer.sdp },
                    from: myId
                }
            });
        }

        startTimer();
    }, [createPC, myId, startTimer]);

    /** Hang up from either side */
    const hangUp = useCallback(async () => {
        if (channelRef.current) {
            channelRef.current.send({
                type: 'broadcast',
                event: 'signal',
                payload: { type: 'status', status: 'ended', from: myId }
            });
        }
        await cleanup();
    }, [cleanup, myId]);

    return { callStatus, duration, startCall, answerCall, hangUp };
}
