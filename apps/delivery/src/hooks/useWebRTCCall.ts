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

/** Web Audio Synthesizer for Ringback and Ringtone without external MP3 dependencies */
class CallAudioEngine {
    private ctx: AudioContext | null = null;
    private timer: any = null;
    private isPlaying = false;

    private getContext(): AudioContext | null {
        try {
            if (!this.ctx || this.ctx.state === 'closed') {
                const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
                if (!AudioContextClass) return null;
                this.ctx = new AudioContextClass();
            }
            if (this.ctx.state === 'suspended') {
                this.ctx.resume().catch(() => {});
            }
            return this.ctx;
        } catch {
            return null;
        }
    }

    /** Caller side: standard telephone ringback tone (440Hz + 480Hz) */
    startRingback() {
        if (this.isPlaying) this.stop();
        this.isPlaying = true;

        const playTone = () => {
            if (!this.isPlaying) return;
            try {
                const ctx = this.getContext();
                if (!ctx) return;
                const now = ctx.currentTime;

                const osc1 = ctx.createOscillator();
                const osc2 = ctx.createOscillator();
                const gain = ctx.createGain();

                osc1.type = 'sine';
                osc2.type = 'sine';
                osc1.frequency.setValueAtTime(440, now);
                osc2.frequency.setValueAtTime(480, now);

                gain.gain.setValueAtTime(0.001, now);
                gain.gain.exponentialRampToValueAtTime(0.15, now + 0.04);
                gain.gain.setValueAtTime(0.15, now + 1.4);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);

                osc1.connect(gain);
                osc2.connect(gain);
                gain.connect(ctx.destination);

                osc1.start(now);
                osc2.start(now);
                osc1.stop(now + 1.5);
                osc2.stop(now + 1.5);
            } catch (e) {
                console.error("Audio error in ringback:", e);
            }
        };

        playTone();
        this.timer = setInterval(playTone, 3500);
    }

    /** Receiver side: melodic electronic ringtone chime */
    startRingtone() {
        if (this.isPlaying) this.stop();
        this.isPlaying = true;

        const playChime = () => {
            if (!this.isPlaying) return;
            try {
                const ctx = this.getContext();
                if (!ctx) return;
                const now = ctx.currentTime;
                // Melodic cheerful sequence: E5 (659), G#5 (830), B5 (987), E6 (1318)
                const notes = [659.25, 830.61, 987.77, 1318.51];
                notes.forEach((freq, idx) => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    const startTime = now + (idx * 0.12);

                    osc.type = 'triangle';
                    osc.frequency.setValueAtTime(freq, startTime);

                    gain.gain.setValueAtTime(0.001, startTime);
                    gain.gain.exponentialRampToValueAtTime(0.2, startTime + 0.03);
                    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.32);

                    osc.connect(gain);
                    gain.connect(ctx.destination);

                    osc.start(startTime);
                    osc.stop(startTime + 0.33);
                });

                if (typeof navigator !== 'undefined' && navigator.vibrate) {
                    navigator.vibrate([200, 100, 200, 100, 300]);
                }
            } catch (e) {
                console.error("Audio error in ringtone:", e);
            }
        };

        playChime();
        this.timer = setInterval(playChime, 2200);
    }

    /** Play call ended beep */
    playEndTone() {
        this.stop();
        try {
            const ctx = this.getContext();
            if (!ctx) return;
            const now = ctx.currentTime;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(480, now);

            gain.gain.setValueAtTime(0.12, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start(now);
            osc.stop(now + 0.23);
        } catch {}
    }

    stop() {
        this.isPlaying = false;
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        if (this.ctx && this.ctx.state !== 'closed') {
            try {
                this.ctx.close().catch(() => {});
            } catch {}
            this.ctx = null;
        }
    }
}

interface UseWebRTCCallOptions {
    requestId: string;
    myId: string;       // userId or driverId
    remoteId: string;   // the other party's id
    role: 'caller' | 'receiver';
    initialOffer?: any;
    onCallEnded?: () => void;
}

export function useWebRTCCall({ requestId, myId, remoteId, role, initialOffer, onCallEnded }: UseWebRTCCallOptions) {
    const [callStatus, setCallStatus] = useState<CallStatus>(() => {
        if (role === 'caller') return 'calling';
        if (initialOffer) return 'ringing';
        return 'idle';
    });
    const [duration, setDuration] = useState(0);

    const pcRef = useRef<RTCPeerConnection | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
    const timerRef = useRef<any>(null);
    const channelRef = useRef<any>(null);
    const pendingOfferRef = useRef<any>(initialOffer || null);
    const audioEngineRef = useRef<CallAudioEngine>(new CallAudioEngine());

    // Audio tones manager based on callStatus
    useEffect(() => {
        const engine = audioEngineRef.current;
        if (callStatus === 'calling') {
            engine.startRingback();
        } else if (callStatus === 'ringing') {
            engine.startRingtone();
        } else if (callStatus === 'connected') {
            engine.stop();
        } else if (callStatus === 'ended') {
            engine.playEndTone();
        }

        return () => {
            if (callStatus !== 'calling' && callStatus !== 'ringing') {
                engine.stop();
            }
        };
    }, [callStatus]);

    // Keep pendingOfferRef in sync if initialOffer arrives or changes
    useEffect(() => {
        if (initialOffer) {
            pendingOfferRef.current = initialOffer;
            if (role === 'receiver') {
                setCallStatus('ringing');
            }
        }
    }, [initialOffer, role]);

    // Cleanup everything
    const cleanup = useCallback(async () => {
        audioEngineRef.current.stop();
        if (timerRef.current) clearInterval(timerRef.current);
        if (pcRef.current) {
            try {
                pcRef.current.close();
            } catch {}
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
            remoteAudioRef.current.play().catch(() => {});
        };

        pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'connected') {
                audioEngineRef.current.stop();
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
                    pendingOfferRef.current = payload.offer;
                    setCallStatus('ringing');
                } else if (payload.type === 'answer' && role === 'caller') {
                    if (pcRef.current && !pcRef.current.remoteDescription) {
                        try {
                            await pcRef.current.setRemoteDescription(new RTCSessionDescription(payload.answer));
                        } catch (err) {
                            console.error("Error setting remote description from answer:", err);
                        }
                    }
                } else if (payload.type === 'candidate') {
                    if (pcRef.current && payload.candidate) {
                        try {
                            await pcRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate));
                        } catch {}
                    }
                } else if (payload.type === 'status') {
                    if (payload.status === 'ended' || payload.status === 'rejected') {
                        audioEngineRef.current.playEndTone();
                        cleanup();
                    } else if (payload.status === 'calling' && role === 'receiver') {
                        setCallStatus('ringing');
                    }
                }
            })
            .subscribe();

        channelRef.current = channel;

        return () => {
            audioEngineRef.current.stop();
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
                    from: myId,
                    requestId: requestId
                }
            });
        }

        if (remoteId) {
            const directChannel = supabase.channel(`user_call_${remoteId}`);
            directChannel.subscribe((subStatus) => {
                if (subStatus === 'SUBSCRIBED') {
                    directChannel.send({
                        type: 'broadcast',
                        event: 'signal',
                        payload: {
                            type: 'offer',
                            offer: { type: offer.type, sdp: offer.sdp },
                            from: myId,
                            requestId: requestId
                        }
                    });
                }
            });
        }
    }, [createPC, myId, requestId, remoteId]);

    /** RECEIVER: answer the call */
    const answerCall = useCallback(async () => {
        audioEngineRef.current.stop();
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

        const offer = pendingOfferRef.current;
        if (offer) {
            try {
                await pc.setRemoteDescription(new RTCSessionDescription(offer));
            } catch (err) {
                console.error("Error setting remote offer in answerCall:", err);
            }
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

    /** Hang up / reject from either side */
    const hangUp = useCallback(async () => {
        audioEngineRef.current.playEndTone();
        if (channelRef.current) {
            channelRef.current.send({
                type: 'broadcast',
                event: 'signal',
                payload: { type: 'status', status: 'ended', from: myId }
            });
        }
        if (remoteId) {
            const directChannel = supabase.channel(`user_call_${remoteId}`);
            directChannel.subscribe((subStatus) => {
                if (subStatus === 'SUBSCRIBED') {
                    directChannel.send({
                        type: 'broadcast',
                        event: 'signal',
                        payload: { type: 'status', status: 'ended', from: myId }
                    });
                }
            });
        }
        await cleanup();
    }, [cleanup, myId, remoteId]);

    const rejectCall = useCallback(async () => {
        audioEngineRef.current.stop();
        if (channelRef.current) {
            channelRef.current.send({
                type: 'broadcast',
                event: 'signal',
                payload: { type: 'status', status: 'rejected', from: myId }
            });
        }
        if (remoteId) {
            const directChannel = supabase.channel(`user_call_${remoteId}`);
            directChannel.subscribe((subStatus) => {
                if (subStatus === 'SUBSCRIBED') {
                    directChannel.send({
                        type: 'broadcast',
                        event: 'signal',
                        payload: { type: 'status', status: 'rejected', from: myId }
                    });
                }
            });
        }
        await cleanup();
    }, [cleanup, myId, remoteId]);

    return { callStatus, duration, startCall, answerCall, hangUp, rejectCall };
}
