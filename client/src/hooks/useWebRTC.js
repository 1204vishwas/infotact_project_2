import { useCallback, useEffect, useRef, useState } from "react";

const CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" }
  ]
};

// Must match the 100px WebRTC proximity threshold used by the world.
const EARSHOT = 100;

// Normalised RMS above which a microphone is considered "actively speaking".
export const SPEAKING_THRESHOLD = 0.08;

// Read a time-domain analyser and return a 0..1 loudness estimate.
function readLevel(entry) {
  if (!entry) return 0;
  const { analyser, data } = entry;
  analyser.getByteTimeDomainData(data);
  let sum = 0;
  for (let i = 0; i < data.length; i += 1) {
    const sample = (data[i] - 128) / 128;
    sum += sample * sample;
  }
  const rms = Math.sqrt(sum / data.length);
  return Math.min(1, rms * 4.5);
}

/**
 * useWebRTC
 * Full peer-to-peer audio over WebRTC, negotiated through the Socket.io
 * signaling relay (world:offer / world:answer / world:ice-candidate).
 *
 * - Only colleagues within EARSHOT (100px) are connected.
 * - Uses the "perfect negotiation" pattern so simultaneous offers resolve
 *   deterministically and renegotiation (e.g. mic arriving late) is safe.
 * - Remote audio is routed through a per-peer GainNode so volume falls off
 *   with distance (proximity "spatial" audio).
 * - Exposes per-peer mic levels so the UI can show "speaking" indicators.
 */
export default function useWebRTC({ enabled, selfId, peers, localStream, socketRef }) {
  const [connections, setConnections] = useState([]);
  const [selfLevel, setSelfLevel] = useState(0);
  const [audioReady, setAudioReady] = useState(false);
  const [pcDebug, setPcDebug] = useState('pcs=0');
  const signalRef = useRef({ offerTx: 0, offerRx: 0, answerTx: 0, answerRx: 0, iceTx: 0, iceRx: 0 });
  const connectionsRef = useRef(new Map()); // peerId -> RTCPeerConnection
  const pendingIceRef = useRef(new Map()); // peerId -> RTCIceCandidateInit[]
  const gainNodesRef = useRef(new Map()); // peerId -> GainNode
  const analysersRef = useRef(new Map()); // peerId -> { analyser, data }
  const localAnalyserRef = useRef(null); // { analyser, data }
  const micSourceRef = useRef(null); // MediaStreamAudioSourceNode of the local mic
  const mixDestRef = useRef(null); // MediaStreamAudioDestinationNode (outgoing mix)
  const audioCtxRef = useRef(null);
  // Latest 0..1 level per participant id (including self) for the canvas.
  const levelsRef = useRef(new Map());
  const selfLevelRef = useRef(0);

  const getAudioContext = useCallback(() => {
    if (typeof window === "undefined") return null;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = new AudioCtx();
      audioCtxRef.current.onstatechange = () => {
        setAudioReady(!!audioCtxRef.current && audioCtxRef.current.state === "running");
      };
    }
    if (audioCtxRef.current.state === "suspended") {
      audioCtxRef.current
        .resume()
        .then(() => setAudioReady(audioCtxRef.current ? audioCtxRef.current.state === "running" : false))
        .catch(() => {});
    } else {
      setAudioReady(audioCtxRef.current.state === "running");
    }
    return audioCtxRef.current;
  }, []);

  // Explicitly unlock audio playback — call from a click handler on the
  // "Tap for audio" prompt when AudioContext was blocked by autoplay policy.
  const resumeAudio = useCallback(() => {
    const ctx = getAudioContext();
    const sync = () => setAudioReady(ctx ? ctx.state === "running" : false);
    if (ctx && ctx.state === "suspended") {
      ctx.resume().then(sync).catch(sync);
    } else {
      sync();
    }
  }, [getAudioContext]);

  // The track we actually transmit: the mixed destination (mic + test tone)
  // when available, otherwise the raw microphone track.
  const getOutgoingTrack = useCallback(() => {
    const dest = mixDestRef.current;
    const mixed = dest && dest.stream.getAudioTracks()[0];
    if (mixed) return { track: mixed, stream: dest.stream };
    const mic = localStream && localStream.getAudioTracks()[0];
    if (mic) return { track: mic, stream: localStream };
    return null;
  }, [localStream]);

  // Route an incoming remote stream through a gain node so we can attenuate
  // it by proximity before it reaches the speakers, and tap it with an
  // analyser for the speaking indicator.
  const attachRemoteAudio = useCallback(
    (peerId, stream) => {
      const ctx = getAudioContext();
      if (!ctx) return;
      const existing = gainNodesRef.current.get(peerId);
      if (existing) {
        try {
          existing.disconnect();
        } catch (e) {
          /* noop */
        }
      }
      try {
        const source = ctx.createMediaStreamSource(stream);
        const gain = ctx.createGain();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        gain.gain.value = 1;
        source.connect(gain);
        gain.connect(analyser);
        analyser.connect(ctx.destination);
        gainNodesRef.current.set(peerId, gain);
        analysersRef.current.set(peerId, { analyser, data: new Uint8Array(analyser.fftSize) });
      } catch (e) {
        console.warn("Failed to attach remote audio:", e);
      }
    },
    [getAudioContext]
  );

  const teardown = useCallback((peerId) => {
    const pc = connectionsRef.current.get(peerId);
    if (pc) {
      try {
        pc.close();
      } catch (e) {
        /* noop */
      }
    }
    connectionsRef.current.delete(peerId);
    pendingIceRef.current.delete(peerId);
    const gain = gainNodesRef.current.get(peerId);
    if (gain) {
      try {
        gain.disconnect();
      } catch (e) {
        /* noop */
      }
      gainNodesRef.current.delete(peerId);
    }
    analysersRef.current.delete(peerId);
    levelsRef.current.delete(peerId);
    setConnections((prev) => prev.filter((c) => c.peerId !== peerId));
  }, []);

  const createPeerConnection = useCallback(
    (peerId) => {
      if (connectionsRef.current.has(peerId)) return connectionsRef.current.get(peerId);

      const pc = new RTCPeerConnection(CONFIG);
      pc._peerId = peerId;
      console.log('[rtc] create pc for peer', peerId, 'selfId', selfId, 'polite', String(selfId) > String(peerId));
      // Perfect negotiation: the peer with the lexicographically larger id
      // is "polite" and yields on an offer collision.
      pc._polite = String(selfId) > String(peerId);
      pc._makingOffer = false;
      pc._ignoreOffer = false;
      pc._isSettingRemoteAnswerPending = false;
      connectionsRef.current.set(peerId, pc);
      pendingIceRef.current.set(peerId, []);

      const socket = socketRef.current;

      pc.onnegotiationneeded = async () => {
        try {
          pc._makingOffer = true;
          await pc.setLocalDescription();
          if (socket && socket.connected) {
            signalRef.current.offerTx += 1;
            socket.emit("world:offer", { target: peerId, offer: pc.localDescription });
          }
        } catch (err) {
          console.error("Offer negotiation failed:", err);
        } finally {
          pc._makingOffer = false;
        }
      };

      pc.onicecandidate = ({ candidate }) => {
        if (candidate && socket && socket.connected) {
          signalRef.current.iceTx += 1;
          socket.emit("world:ice-candidate", { target: peerId, candidate });
        }
      };

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        setConnections((prev) =>
          prev.map((c) => (c.peerId === peerId ? { ...c, state } : c))
        );
        if (state === "failed" || state === "closed") teardown(peerId);
      };

      pc.ontrack = ({ streams }) => {
        const stream = streams[0];
        console.log('[rtc] ontrack from', peerId, 'audioTracks', stream ? stream.getAudioTracks().length : 0);
        if (!stream) return;
        setConnections((prev) => {
          const exists = prev.find((c) => c.peerId === peerId);
          if (exists) {
            return prev.map((c) => (c.peerId === peerId ? { ...c, remoteStream: stream } : c));
          }
          return [...prev, { peerId, remoteStream: stream, pc }];
        });
        attachRemoteAudio(peerId, stream);
      };

      const outgoing = getOutgoingTrack();
      if (outgoing) {
        pc.addTrack(outgoing.track, outgoing.stream);
      } else {
        // No microphone yet — still negotiate so we can receive their audio.
        pc.addTransceiver("audio", { direction: "recvonly" });
      }

      return pc;
    },
    [selfId, socketRef, attachRemoteAudio, getOutgoingTrack, teardown]
  );

  const flushPendingIce = useCallback(async (peerId, pc) => {
    const list = pendingIceRef.current.get(peerId) || [];
    for (const candidate of list) {
      try {
        await pc.addIceCandidate(candidate);
      } catch (e) {
        /* noop */
      }
    }
    pendingIceRef.current.set(peerId, []);
  }, []);

  const handleDescription = useCallback(
    async (from, description) => {
      if (!description) return;
      const pc = createPeerConnection(from);
      const socket = socketRef.current;

      const readyForOffer =
        !pc._makingOffer && (pc.signalingState === "stable" || pc._isSettingRemoteAnswerPending);
      const offerCollision = description.type === "offer" && !readyForOffer;

      pc._ignoreOffer = !pc._polite && offerCollision;
      if (pc._ignoreOffer) return;

      try {
        pc._isSettingRemoteAnswerPending = description.type === "answer";
        await pc.setRemoteDescription(description);
        pc._isSettingRemoteAnswerPending = false;
        await flushPendingIce(from, pc);
        if (description.type === "offer") {
          await pc.setLocalDescription();
          if (socket && socket.connected) {
            signalRef.current.answerTx += 1;
            socket.emit("world:answer", { target: from, answer: pc.localDescription });
          }
        }
      } catch (err) {
        console.error("Failed to apply remote description:", err);
      }
    },
    [createPeerConnection, flushPendingIce, socketRef]
  );

  const handleIceCandidate = useCallback(async (from, candidate) => {
    if (!candidate) return;
    const pc = connectionsRef.current.get(from);
    if (!pc || !pc.remoteDescription) {
      const list = pendingIceRef.current.get(from) || [];
      list.push(candidate);
      pendingIceRef.current.set(from, list);
      return;
    }
    try {
      await pc.addIceCandidate(candidate);
    } catch (err) {
      if (!pc._ignoreOffer) console.warn("Failed to add ICE candidate:", err);
    }
  }, []);

  // Subscribe to the signaling relay once the socket + identity are ready.
  useEffect(() => {
    if (!enabled || !selfId) return undefined;
    const socket = socketRef.current;
    if (!socket) return undefined;

    const onOffer = ({ from, offer }) => { signalRef.current.offerRx += 1; handleDescription(from, offer); };
    const onAnswer = ({ from, answer }) => { signalRef.current.answerRx += 1; handleDescription(from, answer); };
    const onIce = ({ from, candidate }) => { signalRef.current.iceRx += 1; handleIceCandidate(from, candidate); };

    socket.on("world:offer", onOffer);
    socket.on("world:answer", onAnswer);
    socket.on("world:ice-candidate", onIce);

    return () => {
      socket.off("world:offer", onOffer);
      socket.off("world:answer", onAnswer);
      socket.off("world:ice-candidate", onIce);
    };
  }, [enabled, selfId, socketRef, handleDescription, handleIceCandidate]);

  // Open / close peer connections as colleagues walk in and out of earshot.
  useEffect(() => {
    if (!enabled || !selfId) {
      Array.from(connectionsRef.current.keys()).forEach(teardown);
      setConnections([]);
      return;
    }

    peers.forEach((peer) => {
      if (peer.id === selfId) return;
      const withinEarshot = peer.distance === undefined || peer.distance <= EARSHOT;
      if (withinEarshot) createPeerConnection(peer.id);
    });

    Array.from(connectionsRef.current.keys()).forEach((peerId) => {
      const stillNearby = peers.some(
        (p) => p.id === peerId && (p.distance === undefined || p.distance <= EARSHOT)
      );
      if (!stillNearby) teardown(peerId);
    });
  }, [enabled, selfId, peers, createPeerConnection, teardown]);

  // Build the outgoing audio mix (microphone + optional test tone) once the
  // mic arrives, and repoint any already-connected peers at it. Because the
  // tone is generated digitally it survives echo-cancellation, so this works
  // even when both clients run in tabs of the same machine.
  useEffect(() => {
    if (!localStream) {
      micSourceRef.current = null;
      mixDestRef.current = null;
      return undefined;
    }
    const ctx = getAudioContext();
    if (!ctx) return undefined;

    let source;
    let dest;
    try {
      source = ctx.createMediaStreamSource(localStream);
      dest = ctx.createMediaStreamDestination();
      source.connect(dest);
    } catch (e) {
      micSourceRef.current = null;
      mixDestRef.current = null;
      return undefined;
    }

    micSourceRef.current = source;
    mixDestRef.current = dest;

    const outgoingTrack = dest.stream.getAudioTracks()[0];
    connectionsRef.current.forEach((pc) => {
      const sender = pc.getSenders().find((s) => s.track && s.track.kind === "audio");
      if (sender && outgoingTrack) {
        sender.replaceTrack(outgoingTrack).catch(() => {});
      } else if (outgoingTrack) {
        try {
          pc.addTrack(outgoingTrack, dest.stream);
        } catch (e) {
          /* noop */
        }
      }
    });

    return () => {
      try {
        source.disconnect();
      } catch (e) {
        /* noop */
      }
      try {
        dest.disconnect();
      } catch (e) {
        /* noop */
      }
      micSourceRef.current = null;
      mixDestRef.current = null;
    };
  }, [localStream, getAudioContext]);

  // Inject a short beep into the outgoing WebRTC mix so a remote peer can prove
  // its playback path. Returns false if the mic/mix isn't ready yet.
  const playTestTone = useCallback(() => {
    const ctx = getAudioContext();
    const dest = mixDestRef.current;
    if (!ctx || !dest) return false;

    const osc = ctx.createOscillator();
    const tone = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 440;
    const now = ctx.currentTime;
    tone.gain.setValueAtTime(0, now);
    tone.gain.linearRampToValueAtTime(0.5, now + 0.04);
    tone.gain.setValueAtTime(0.5, now + 0.9);
    tone.gain.linearRampToValueAtTime(0, now + 1.3);
    osc.connect(tone);
    tone.connect(dest);
    osc.start(now);
    osc.stop(now + 1.4);
    osc.onended = () => {
      try {
        osc.disconnect();
      } catch (e) {
        /* noop */
      }
      try {
        tone.disconnect();
      } catch (e) {
        /* noop */
      }
    };
    return true;
  }, [getAudioContext]);

  // Tap the local microphone with an analyser so we can render an input meter.
  useEffect(() => {
    if (!localStream) {
      localAnalyserRef.current = null;
      return undefined;
    }
    const ctx = getAudioContext();
    if (!ctx) return undefined;
    try {
      const source = ctx.createMediaStreamSource(localStream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser); // analysis only — never routed to destination
      localAnalyserRef.current = { analyser, data: new Uint8Array(analyser.fftSize) };
    } catch (e) {
      localAnalyserRef.current = null;
    }
    return () => {
      localAnalyserRef.current = null;
    };
  }, [localStream, getAudioContext]);

  // Sample all microphones ~11Hz and publish the levels.
  useEffect(() => {
    const id = setInterval(() => {
      const local = readLevel(localAnalyserRef.current);
      selfLevelRef.current = local;
      if (selfId) levelsRef.current.set(selfId, local);
      setSelfLevel((prev) => (Math.abs(prev - local) > 0.03 ? local : prev));

      analysersRef.current.forEach((entry, peerId) => {
        levelsRef.current.set(peerId, readLevel(entry));
      });
    }, 90);
    return () => clearInterval(id);
  }, [selfId]);

  // Scale each remote peer's volume by distance for proximity "spatial" audio.
  // A 0.3 floor keeps a connected colleague audible even near the 100px edge.
  useEffect(() => {
    peers.forEach((peer) => {
      const gain = gainNodesRef.current.get(peer.id);
      if (!gain) return;
      const distance = typeof peer.distance === "number" ? peer.distance : EARSHOT;
      const proximity = Math.max(0, Math.min(1, 1 - distance / EARSHOT));
      const value = 0.3 + 0.7 * proximity;
      try {
        gain.gain.value = value;
      } catch (e) {
        /* noop */
      }
    });
  }, [peers]);

  // Browsers keep AudioContext suspended until a user gesture — resume early.
  useEffect(() => {
    const resume = () => getAudioContext();
    window.addEventListener("pointerdown", resume);
    window.addEventListener("keydown", resume);
    return () => {
      window.removeEventListener("pointerdown", resume);
      window.removeEventListener("keydown", resume);
    };
  }, [getAudioContext]);

  // Tear everything down when the world canvas unmounts.
  useEffect(
    () => () => {
      Array.from(connectionsRef.current.keys()).forEach(teardown);
      if (audioCtxRef.current) {
        try {
          audioCtxRef.current.close();
        } catch (e) {
          /* noop */
        }
        audioCtxRef.current = null;
      }
    },
    [teardown]
  );

  // Diagnostics: expose peer-connection + signaling state so the UI can show
  // exactly where a handshake stalls.
  useEffect(() => {
    const id = setInterval(() => {
      const pcs = Array.from(connectionsRef.current.entries());
      const s = signalRef.current;
      const info = pcs
        .map(([pid, pc]) => `${String(pid).slice(-4)}:${pc.connectionState}/${pc.iceConnectionState}/${pc.signalingState}`)
        .join(' ') || 'none';
      setPcDebug(`pcs=${pcs.length} tx(o${s.offerTx}a${s.answerTx}i${s.iceTx}) rx(o${s.offerRx}a${s.answerRx}i${s.iceRx}) [${info}]`);
    }, 700);
    return () => clearInterval(id);
  }, []);

  return { connections, selfLevel, selfLevelRef, levelsRef, playTestTone, audioReady, resumeAudio, pcDebug };
}
