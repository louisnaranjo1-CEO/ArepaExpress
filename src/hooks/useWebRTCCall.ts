import { useEffect, useRef, useState, useCallback } from 'react';
import { rtdb } from '../lib/firebase';
import {
    ref as rtdbRef,
    set,
    onValue,
    push,
    remove,
    get,
} from 'firebase/database';

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
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const callNodeRef = useRef(rtdbRef(rtdb, `calls/${requestId}`));

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
        // Remove RTDB node so no stale data remains
        try { await remove(callNodeRef.current); } catch { /* ignore */ }
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

    /** CALLER: start the call */
    const startCall = useCallback(async () => {
        setCallStatus('calling');
        const pc = await createPC();

        // Write ICE candidates as they are generated
        pc.onicecandidate = async (event) => {
            if (event.candidate) {
                await push(rtdbRef(rtdb, `calls/${requestId}/offerCandidates`), event.candidate.toJSON());
            }
        };

        // Create SDP offer
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        // Write offer + status + who is calling
        await set(callNodeRef.current, {
            offer: { type: offer.type, sdp: offer.sdp },
            status: 'calling',
            initiatorId: myId,
        });

        // Listen for answer
        const answerUnsub = onValue(rtdbRef(rtdb, `calls/${requestId}/answer`), async (snap) => {
            if (snap.exists() && !pc.remoteDescription) {
                const answer = snap.val();
                await pc.setRemoteDescription(new RTCSessionDescription(answer));
            }
        });

        // Listen for remote ICE candidates
        const remCandUnsub = onValue(rtdbRef(rtdb, `calls/${requestId}/answerCandidates`), (snap) => {
            if (snap.exists()) {
                snap.forEach((child) => {
                    pc.addIceCandidate(new RTCIceCandidate(child.val())).catch(() => { });
                });
            }
        });

        // Store unsubscribers for cleanup
        (pc as any)._unsubscribers = [answerUnsub, remCandUnsub];
    }, [createPC, myId, requestId]);

    /** RECEIVER: answer the call */
    const answerCall = useCallback(async () => {
        setCallStatus('connected');
        const pc = await createPC();

        // Write ICE candidates
        pc.onicecandidate = async (event) => {
            if (event.candidate) {
                await push(rtdbRef(rtdb, `calls/${requestId}/answerCandidates`), event.candidate.toJSON());
            }
        };

        // Get the existing offer
        const offerSnap = await get(rtdbRef(rtdb, `calls/${requestId}/offer`));
        if (!offerSnap.exists()) return;
        const offerData = offerSnap.val();
        await pc.setRemoteDescription(new RTCSessionDescription(offerData));

        // Listen for remote ICE candidates
        const remCandUnsub = onValue(rtdbRef(rtdb, `calls/${requestId}/offerCandidates`), (snap) => {
            if (snap.exists()) {
                snap.forEach((child) => {
                    pc.addIceCandidate(new RTCIceCandidate(child.val())).catch(() => { });
                });
            }
        });

        // Create & write answer
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await set(rtdbRef(rtdb, `calls/${requestId}/answer`), {
            type: answer.type,
            sdp: answer.sdp,
        });
        await set(rtdbRef(rtdb, `calls/${requestId}/status`), 'connected');

        startTimer();
        (pc as any)._unsubscribers = [remCandUnsub];
    }, [createPC, requestId, startTimer]);

    /** Hang up from either side */
    const hangUp = useCallback(async () => {
        await set(rtdbRef(rtdb, `calls/${requestId}/status`), 'ended');
        await cleanup();
    }, [cleanup, requestId]);

    // Listen for the other party hanging up or calling
    useEffect(() => {
        const unsub = onValue(rtdbRef(rtdb, `calls/${requestId}/status`), (snap) => {
            if (!snap.exists()) return;
            const status = snap.val();
            if (status === 'ended' && callStatus !== 'idle') {
                cleanup();
            }
            if (status === 'calling' && role === 'receiver' && callStatus === 'idle') {
                setCallStatus('ringing');
            }
        });
        return () => unsub();
    }, [requestId, callStatus, role, cleanup]);

    return { callStatus, duration, startCall, answerCall, hangUp };
}
