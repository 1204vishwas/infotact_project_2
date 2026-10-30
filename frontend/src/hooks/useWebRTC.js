import { useCallback, useEffect, useRef, useState } from "react";

const CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" }
  ]
};

// 100px proximity "earshot" — the single source of truth for when a
// peer-to-peer audio link is allowed to exist. Must match WorldCanvas.
export const EARSHOT = 100;

// Normalised RMS above which a microphone is considered "actively speaking".
export const SPEAKING_THRESHOLD = 0.08;

// Dynamic proximity attenuation is deliberately a smooth cosine curve:
//   gain(d) = MAX_GAIN * 0.5 * (1 + cos(pi * d / EARSHOT))   for 0 <= d < 100
//   gain(d) = 0                                              for d >= 100
// It is 1.0 at the avatar, 0.5 at 50px, 0 at the earshot edge, and has zero
// slope at both endpoints, so there is no click when someone walks in or out.
// Tune maxGain/smoothing here without touching the audio graph lifecycle.
export const ATTENUATION = Object.freeze({
  maxGain: 1.0,
  smoothingTimeConstant: 0.12,
  closeGraceMs: 2500,
  reconnectBackoffMs: 2000,
  offerRetryMs: 5000
});

export function attenuationGain(distance, radius = EARSHOT, maxGain = ATTENUATION.maxGain) {
  if (!Number.isFinite(distance) || distance <= 0) return maxGain;
  if (!Number.isFinite(radius) || radius <= 0 || distance >= radius) return 0;
  const normalised = Math.max(0, Math.min(1, distance / radius));
  return maxGain * 0.5 * (1 + Math.cos(Math.PI * normalised));
}

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
 * Real peer-to-peer audio over WebRTC, negotiated through the Socket.io
 * signaling relay (world:offer / world:answer / world:ice-candidate).
 *
 * Design notes (why it is built this way):
 * - Only colleagues within EARSHOT (100px) get a peer connection.
 * - Exactly ONE side (the lexicographically smaller user id) is the
 *   "initiator" and creates the SDP offer. The other side only answers. This
 *   removes offer glare entirely — the previous implementation had both sides
 *   offer simultaneously, and the polite peer's implicit rollback left it with
 *   zero ICE candidates, so ICE never connected.
 * - An audio transceiver is created with direction "sendrecv" up front, so the
 *   local microphone is attached later with replaceTrack() — no renegotiation
 *   is ever required.
 * - Each remote stream has exactly one Web Audio graph:
 *     MediaStreamAudioSourceNode -> GainNode -> AnalyserNode -> destination
 *   The GainNode is the only volume control (no <audio>.volume conflict).
 *   Proximity updates retarget that gain with setTargetAtTime(); the graph is
 *   never rebuilt for movement.
 * - Diagnostics report the REAL state (mic track, ICE/connection state, remote
 *   track received, AudioContext state, measured gain) rather than optimistic
 *   UI flags.
 */
export default function useWebRTC({ enabled, selfId, peers, localStream, socketRef }) {
  const [connections, setConnections] = useState([]);
  const [selfLevel, setSelfLevel] = useState(0);
  const [audioReady, setAudioReady] = useState(false);
  const [pcDebug, setPcDebug] = useState('pcs=0');
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const [diagnostics, setDiagnostics] = useState(() => ({
    mic: { granted: false, captured: false, trackState: 'none', enabled: false, muted: true, label: '' },
    audioContext: 'none',
    peers: []
  }));

  const pcsRef = useRef(new Map());          // peerId -> RTCPeerConnection
  const sendStreamRef = useRef(null);        // stable outgoing MediaStream (carries msid)
  if (sendStreamRef.current === null && typeof MediaStream !== "undefined") {
    sendStreamRef.current = new MediaStream();
  }
  const lastSeenRef = useRef(new Map());      // peerId -> timestamp (teardown hysteresis)
  const retryAfterRef = useRef(new Map());    // peerId -> failed-connection backoff timestamp
  const audioGraphsRef = useRef(new Map());   // peerId -> { source, gain, analyser, data, stream, targetGain }
  const pendingIceRef = useRef(new Map());   // peerId -> RTCIceCandidateInit[]
  const peerInfoRef = useRef(new Map());     // peerId -> { distance }
  const outgoingTrackRef = useRef(null);     // current local microphone track
  const localAnalyserRef = useRef(null);     // { analyser, data } for the mic meter
  const audioCtxRef = useRef(null);
  const levelsRef = useRef(new Map());       // participant id -> 0..1 level
  const selfLevelRef = useRef(0);
  const signalRef = useRef({ offerTx: 0, offerRx: 0, answerTx: 0, answerRx: 0, iceTx: 0, iceRx: 0 });
  const playbackBlockedRef = useRef(false);

  const getAudioContext = useCallback(() => {
    if (typeof window === "undefined") return null;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = new AudioCtx();
      audioCtxRef.current.onstatechange = () => {
        const running = !!audioCtxRef.current && audioCtxRef.current.state === "running";
        setAudioReady(running);
        if (running) {
          playbackBlockedRef.current = false;
          setPlaybackBlocked(false);
        } else if (audioGraphsRef.current.size > 0) {
          playbackBlockedRef.current = true;
          setPlaybackBlocked(true);
        }
      };
    }
    if (audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume().catch(() => {});
    }
    setAudioReady(audioCtxRef.current.state === "running");
    return audioCtxRef.current;
  }, []);

  const markPlaybackBlocked = useCallback((blocked) => {
    playbackBlockedRef.current = blocked;
    setPlaybackBlocked(blocked);
  }, []);

  const detachRemoteAudio = useCallback((peerId) => {
    const entry = audioGraphsRef.current.get(peerId);
    if (entry) {
      try { entry.source.disconnect(); } catch (e) { /* noop */ }
      try { entry.gain.disconnect(); } catch (e) { /* noop */ }
      try { entry.analyser.disconnect(); } catch (e) { /* noop */ }
    }
    audioGraphsRef.current.delete(peerId);
    levelsRef.current.delete(peerId);
  }, []);

  const applyRemoteGain = useCallback((peerId, distance) => {
    const entry = audioGraphsRef.current.get(peerId);
    if (!entry) return;

    const known = peerInfoRef.current.get(peerId);
    const effectiveDistance = typeof distance === "number" && Number.isFinite(distance)
      ? distance
      : (known && typeof known.distance === "number" ? known.distance : 0);
    const target = attenuationGain(effectiveDistance, EARSHOT, ATTENUATION.maxGain);
    entry.targetGain = target;

    const ctx = audioCtxRef.current;
    if (!ctx || ctx.state === "closed") return;
    const now = ctx.currentTime;
    const param = entry.gain.gain;
    try {
      if (typeof param.cancelScheduledValues === "function") {
        param.cancelScheduledValues(now);
      }
      if (typeof param.setTargetAtTime === "function") {
        param.setTargetAtTime(target, now, ATTENUATION.smoothingTimeConstant);
      } else {
        param.setValueAtTime(target, now);
      }
    } catch (e) {
      // AudioParam may be disconnected during teardown.
    }
  }, []);

  // Build exactly one Web Audio graph per remote stream. The remote stream is
  // played only through ctx.destination; there is no hidden <audio> fallback,
  // so movement never creates a second playback path or volume control.
  const attachRemoteAudio = useCallback(
    (peerId, stream) => {
      if (!stream) return;
      const ctx = getAudioContext();
      if (!ctx) {
        markPlaybackBlocked(true);
        return;
      }

      const existing = audioGraphsRef.current.get(peerId);
      if (existing && existing.stream === stream) {
        applyRemoteGain(peerId);
        return;
      }

      detachRemoteAudio(peerId);
      try {
        const source = ctx.createMediaStreamSource(stream);
        const gain = ctx.createGain();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;

        const known = peerInfoRef.current.get(peerId);
        const initialDistance = known && typeof known.distance === "number" ? known.distance : 0;
        const target = attenuationGain(initialDistance, EARSHOT, ATTENUATION.maxGain);

        const now = ctx.currentTime;
        gain.gain.setValueAtTime(0, now);
        gain.gain.setTargetAtTime(target, now + 0.02, ATTENUATION.smoothingTimeConstant);

        source.connect(gain);
        gain.connect(analyser);
        analyser.connect(ctx.destination);

        audioGraphsRef.current.set(peerId, {
          source,
          gain,
          analyser,
          data: new Uint8Array(analyser.fftSize),
          stream,
          targetGain: target
        });

        if (ctx.state === "suspended") {
          ctx.resume()
            .then(() => markPlaybackBlocked(false))
            .catch(() => markPlaybackBlocked(true));
        } else {
          markPlaybackBlocked(false);
        }
        setAudioReady(ctx.state === "running");
      } catch (err) {
        console.warn("[rtc] failed to attach remote audio graph:", err);
        markPlaybackBlocked(true);
      }
    },
    [applyRemoteGain, detachRemoteAudio, getAudioContext, markPlaybackBlocked]
  );

  const teardown = useCallback((peerId) => {
    const pc = pcsRef.current.get(peerId);
    if (pc) {
      pc._closed = true;
      if (pc._offerRetryTimer) {
        clearTimeout(pc._offerRetryTimer);
        pc._offerRetryTimer = null;
      }
      pc.onicecandidate = null;
      pc.onconnectionstatechange = null;
      pc.oniceconnectionstatechange = null;
      pc.ontrack = null;
      try { pc.close(); } catch (e) { /* noop */ }
    }
    pcsRef.current.delete(peerId);
    pendingIceRef.current.delete(peerId);
    peerInfoRef.current.delete(peerId);
    detachRemoteAudio(peerId);

    setConnections((prev) => prev.filter((c) => c.peerId !== peerId));
  }, [detachRemoteAudio]);

  const teardownAll = useCallback(() => {
    Array.from(pcsRef.current.keys()).forEach(teardown);
    lastSeenRef.current.clear();
    retryAfterRef.current.clear();
    setConnections([]);
  }, [teardown]);

  const emit = useCallback(
    (event, payload) => {
      const socket = socketRef.current;
      if (socket && socket.connected) {
        socket.emit(event, payload);
        return true;
      }
      console.warn(`[rtc] socket offline — dropped ${event} for`, payload && payload.target);
      return false;
    },
    [socketRef]
  );

  const createPeerConnection = useCallback(
    (peerId) => {
      if (pcsRef.current.has(peerId)) return pcsRef.current.get(peerId);
      if (!enabled || !selfId) return null;

      const pc = new RTCPeerConnection(CONFIG);
      pc._peerId = peerId;
      pc._closed = false;
      pc._createdAt = Date.now();
      pc._offerRetryTimer = null;
      // Deterministic offerer: smaller id initiates. Removes offer glare.
      pc._initiator = String(selfId) < String(peerId);
      pcsRef.current.set(peerId, pc);
      pendingIceRef.current.set(peerId, []);
      peerInfoRef.current.set(peerId, peerInfoRef.current.get(peerId) || { distance: undefined });

      console.log('[rtc] create pc', peerId, 'selfId', selfId, 'initiator', pc._initiator);

      // The INITIATOR creates the single sendrecv audio transceiver and offers.
      // The ANSWERER creates no transceiver of its own — it adopts the one
      // carried by the incoming offer. This guarantees exactly one m-line, so
      // both peers end up with a symmetric sendrecv link (each hears the other).
      if (pc._initiator) {
        const track = outgoingTrackRef.current;
        if (track && sendStreamRef.current && !sendStreamRef.current.getTracks().includes(track)) {
          sendStreamRef.current.addTrack(track);
        }
        const transceiver = pc.addTransceiver(track || "audio", {
          direction: "sendrecv",
          streams: sendStreamRef.current ? [sendStreamRef.current] : []
        });
        pc._audioTransceiver = transceiver;
      }

      pc.onicecandidate = ({ candidate }) => {
        if (!candidate || pc._closed || pcsRef.current.get(peerId) !== pc) return;
        if (emit("world:ice-candidate", { target: peerId, candidate })) {
          signalRef.current.iceTx += 1;
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc._closed || pcsRef.current.get(peerId) !== pc) return;
        const state = pc.connectionState;
        setConnections((prev) =>
          prev.map((c) => (c.peerId === peerId ? { ...c, state } : c))
        );
        if (state === "connected") {
          retryAfterRef.current.delete(peerId);
          return;
        }
        if (state === "failed" || state === "closed") {
          console.warn("[rtc] connection state", state, "— recycling", peerId);
          if (state === "failed") {
            retryAfterRef.current.set(peerId, Date.now() + ATTENUATION.reconnectBackoffMs);
          }
          teardown(peerId);
        }
      };

      pc.ontrack = (event) => {
        if (pc._closed || pcsRef.current.get(peerId) !== pc) return;
        const track = event.track;
        if (!track || track.kind !== "audio") return;

        // Prefer the SDP msid stream. If the remote used a bare transceiver
        // there is no msid, so keep one stream per connection and add the
        // track ourselves. Reusing pc._remoteStream is important: a second
        // ontrack must not rebuild the Web Audio graph.
        let stream = (event.streams && event.streams[0]) || pc._remoteStream || null;
        if (!stream) stream = new MediaStream();
        if (!stream.getTracks().includes(track)) stream.addTrack(track);
        pc._remoteStream = stream;

        track.addEventListener("ended", () => {
          if (pcsRef.current.get(peerId) === pc) teardown(peerId);
        }, { once: true });

        console.log('[rtc] ontrack from', peerId, 'tracks', stream.getAudioTracks().length);
        setConnections((prev) => {
          const exists = prev.find((c) => c.peerId === peerId);
          if (exists) {
            return prev.map((c) => (c.peerId === peerId ? { ...c, remoteStream: stream } : c));
          }
          return [...prev, { peerId, remoteStream: stream, pc, state: pc.connectionState }];
        });
        attachRemoteAudio(peerId, stream);
      };

      if (pc._initiator) {
        (async () => {
          try {
            await pc.setLocalDescription();
            if (pc._closed || pcsRef.current.get(peerId) !== pc) return;
            if (emit("world:offer", { target: peerId, offer: pc.localDescription })) {
              signalRef.current.offerTx += 1;
            }
            // If no answer completes, recycle once rather than leaving a
            // permanently stuck have-local-offer connection.
            pc._offerRetryTimer = setTimeout(() => {
              pc._offerRetryTimer = null;
              if (pc._closed || pcsRef.current.get(peerId) !== pc) return;
              if (pc.signalingState === "have-local-offer") {
                console.warn("[rtc] offer timed out, recycling", peerId);
                retryAfterRef.current.set(peerId, Date.now() + 750);
                teardown(peerId);
              }
            }, ATTENUATION.offerRetryMs);
          } catch (err) {
            console.error("[rtc] failed to create offer:", err);
          }
        })();
      }

      return pc;
    },
    [enabled, selfId, emit, attachRemoteAudio, teardown]
  );

  const flushPendingIce = useCallback(async (peerId, pc) => {
    const list = pendingIceRef.current.get(peerId) || [];
    for (const candidate of list) {
      try { await pc.addIceCandidate(candidate); } catch (e) { /* noop */ }
    }
    pendingIceRef.current.set(peerId, []);
  }, []);

  const handleOffer = useCallback(
    async (from, offer) => {
      if (!offer) return;
      const pc = createPeerConnection(from);
      if (!pc) return;
      try {
        // If a previous negotiation is still in flight, roll back cleanly
        // before applying the fresh offer.
        if (pc.signalingState !== "stable") {
          await pc.setRemoteDescription({ type: "rollback" });
        }
        await pc.setRemoteDescription(offer);

        // Adopt the audio transceiver created by the remote offer and attach
        // our own microphone to it so the answer is sendrecv (we talk back).
        const transceiver = pc.getTransceivers().find(
          (t) => t.receiver && t.receiver.track && t.receiver.track.kind === "audio"
        );
        if (transceiver) {
          pc._audioTransceiver = transceiver;
          const track = outgoingTrackRef.current;
          if (track) {
            if (sendStreamRef.current && !sendStreamRef.current.getTracks().includes(track)) {
              sendStreamRef.current.addTrack(track);
            }
            try { await transceiver.sender.replaceTrack(track); } catch (e) { /* noop */ }
          }
          if (!String(transceiver.direction).includes("send")) {
            transceiver.direction = "sendrecv";
          }
        }

        await flushPendingIce(from, pc);
        await pc.setLocalDescription();
        if (emit("world:answer", { target: from, answer: pc.localDescription })) {
          signalRef.current.answerTx += 1;
        }
      } catch (err) {
        console.error("[rtc] failed to handle offer from", from, err);
      }
    },
    [createPeerConnection, flushPendingIce, emit]
  );

  const handleAnswer = useCallback(
    async (from, answer) => {
      if (!answer) return;
      const pc = pcsRef.current.get(from);
      if (!pc) return;
      try {
        await pc.setRemoteDescription(answer);
        await flushPendingIce(from, pc);
      } catch (err) {
        console.error("[rtc] failed to handle answer from", from, err);
      }
    },
    [flushPendingIce]
  );

  const handleIceCandidate = useCallback(async (from, candidate) => {
    if (!candidate) return;
    const pc = pcsRef.current.get(from);
    if (!pc || !pc.remoteDescription) {
      const list = pendingIceRef.current.get(from) || [];
      list.push(candidate);
      pendingIceRef.current.set(from, list);
      return;
    }
    try {
      await pc.addIceCandidate(candidate);
    } catch (err) {
      console.warn("[rtc] failed to add ICE candidate from", from, err);
    }
  }, []);

  // ---- Signaling subscription --------------------------------------------
  useEffect(() => {
    if (!enabled || !selfId) return undefined;
    const socket = socketRef.current;
    if (!socket) return undefined;

    const onOffer = ({ from, offer }) => { signalRef.current.offerRx += 1; handleOffer(from, offer); };
    const onAnswer = ({ from, answer }) => { signalRef.current.answerRx += 1; handleAnswer(from, answer); };
    const onIce = ({ from, candidate }) => { signalRef.current.iceRx += 1; handleIceCandidate(from, candidate); };

    socket.on("world:offer", onOffer);
    socket.on("world:answer", onAnswer);
    socket.on("world:ice-candidate", onIce);

    return () => {
      socket.off("world:offer", onOffer);
      socket.off("world:answer", onAnswer);
      socket.off("world:ice-candidate", onIce);
    };
  }, [enabled, selfId, socketRef, handleOffer, handleAnswer, handleIceCandidate]);

  // ---- Open / close peer connections as colleagues enter earshot ----------
  useEffect(() => {
    if (!enabled || !selfId) {
      teardownAll();
      return;
    }

    const nearby = new Map();
    peers.forEach((peer) => {
      if (!peer || peer.id === selfId) return;
      if (String(peer.id).startsWith("bot_")) return; // never negotiate with demo bots
      const within = peer.distance === undefined || peer.distance <= EARSHOT;
      if (within) nearby.set(peer.id, peer);
      peerInfoRef.current.set(peer.id, { distance: peer.distance });
    });

    // Hysteresis: keep an existing link for a short grace period when a peer
    // briefly drops out of `nearby` (HUD re-ranking / a stale position frame).
    // Without this the pc is torn down and rebuilt on every flicker, which
    // churns transceivers and can strand a half-negotiated connection.
    Array.from(pcsRef.current.keys()).forEach((peerId) => {
      if (nearby.has(peerId)) {
        lastSeenRef.current.set(peerId, Date.now());
        return;
      }
      const seen = lastSeenRef.current.get(peerId) || 0;
      if (Date.now() - seen > ATTENUATION.closeGraceMs) {
        lastSeenRef.current.delete(peerId);
        teardown(peerId);
      }
    });

    nearby.forEach((peer) => {
      lastSeenRef.current.set(peer.id, Date.now());
      if (pcsRef.current.has(peer.id)) return;
      const retryAt = retryAfterRef.current.get(peer.id) || 0;
      if (Date.now() < retryAt) return;
      createPeerConnection(peer.id);
    });

    // Retarget only the GainNode; never rebuild the graph for movement.
    // This includes peers in the teardown grace window, whose gain must reach
    // exactly zero as soon as they leave the radius.
    peerInfoRef.current.forEach((info, peerId) => {
      applyRemoteGain(peerId, info.distance);
    });
  }, [enabled, selfId, peers, createPeerConnection, teardown, teardownAll, applyRemoteGain]);

  // A failed pc is removed immediately; this retries it after the backoff even
  // if no new proximity frame arrives to re-run the effect above.
  useEffect(() => {
    if (!enabled || !selfId) return undefined;
    const retry = () => {
      const now = Date.now();
      retryAfterRef.current.forEach((retryAt, peerId) => {
        if (now < retryAt || pcsRef.current.has(peerId)) return;
        retryAfterRef.current.delete(peerId);
        const info = peerInfoRef.current.get(peerId);
        const within = info && (info.distance === undefined || info.distance <= EARSHOT);
        if (within) createPeerConnection(peerId);
      });
    };
    const id = setInterval(retry, 500);
    return () => clearInterval(id);
  }, [enabled, selfId, createPeerConnection]);

  // ---- Keep the outgoing sender pointed at the live microphone ------------
  useEffect(() => {
    const track = localStream && localStream.getAudioTracks().length
      ? localStream.getAudioTracks()[0]
      : null;
    outgoingTrackRef.current = track;
    if (track && sendStreamRef.current && !sendStreamRef.current.getTracks().includes(track)) {
      sendStreamRef.current.addTrack(track);
    }
    pcsRef.current.forEach((pc) => {
      const transceiver = pc._audioTransceiver;
      if (transceiver && transceiver.sender && track) {
        transceiver.sender.replaceTrack(track).catch(() => {});
      }
    });
    if (track) getAudioContext();
  }, [localStream, getAudioContext]);

  // ---- Microphone input meter (analysis only — never routed to speakers) --
  useEffect(() => {
    if (!localStream) {
      localAnalyserRef.current = null;
      return undefined;
    }
    const ctx = getAudioContext();
    if (!ctx) return undefined;
    let source = null;
    let analyser = null;
    let sink = null;
    try {
      source = ctx.createMediaStreamSource(localStream);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      sink = ctx.createMediaStreamDestination();
      source.connect(analyser);
      analyser.connect(sink);
      localAnalyserRef.current = { analyser, data: new Uint8Array(analyser.fftSize) };
    } catch (err) {
      localAnalyserRef.current = null;
    }
    return () => {
      localAnalyserRef.current = null;
      try { source && source.disconnect(); } catch (e) { /* noop */ }
      try { analyser && analyser.disconnect(); } catch (e) { /* noop */ }
      try { sink && sink.disconnect(); } catch (e) { /* noop */ }
    };
  }, [localStream, getAudioContext]);

  // ---- Sample all microphones ~11Hz and publish levels --------------------
  useEffect(() => {
    const id = setInterval(() => {
      const local = readLevel(localAnalyserRef.current);
      selfLevelRef.current = local;
      if (selfId) levelsRef.current.set(selfId, local);
      setSelfLevel((prev) => (Math.abs(prev - local) > 0.03 ? local : prev));

      audioGraphsRef.current.forEach((entry, peerId) => {
        levelsRef.current.set(peerId, readLevel(entry));
      });
    }, 90);
    return () => clearInterval(id);
  }, [selfId]);

  // ---- Explicitly unlock audio playback (user gesture) --------------------
  const resumeAudio = useCallback(() => {
    const ctx = getAudioContext();
    const sync = () => setAudioReady(ctx ? ctx.state === "running" : false);
    if (ctx && ctx.state === "suspended") {
      ctx.resume()
        .then(() => { sync(); markPlaybackBlocked(false); })
        .catch(() => { sync(); markPlaybackBlocked(true); });
    } else {
      sync();
      if (ctx && ctx.state === "running") markPlaybackBlocked(false);
    }
  }, [getAudioContext, markPlaybackBlocked]);

  // Resume on the first user gesture anywhere in the tab.
  useEffect(() => {
    const resume = () => getAudioContext();
    window.addEventListener("pointerdown", resume);
    window.addEventListener("keydown", resume);
    return () => {
      window.removeEventListener("pointerdown", resume);
      window.removeEventListener("keydown", resume);
    };
  }, [getAudioContext]);

  // ---- Test tone: temporarily replace the outgoing track with a beep ------
  const playTestTone = useCallback(() => {
    const ctx = getAudioContext();
    if (!ctx) return false;
    const dest = ctx.createMediaStreamDestination();
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
    const toneTrack = dest.stream.getAudioTracks()[0];
    const micTrack = outgoingTrackRef.current;
    let used = false;
    pcsRef.current.forEach((pc) => {
      const sender = pc._audioTransceiver && pc._audioTransceiver.sender;
      if (sender && toneTrack) {
        sender.replaceTrack(toneTrack).catch(() => {});
        used = true;
      }
    });
    if (!used) return false;
    osc.start(now);
    osc.stop(now + 1.4);
    osc.onended = () => {
      pcsRef.current.forEach((pc) => {
        const sender = pc._audioTransceiver && pc._audioTransceiver.sender;
        if (sender && micTrack) sender.replaceTrack(micTrack).catch(() => {});
      });
      try { osc.disconnect(); } catch (e) { /* noop */ }
      try { tone.disconnect(); } catch (e) { /* noop */ }
    };
    return true;
  }, [getAudioContext]);

  // ---- Tear everything down on unmount ------------------------------------
  useEffect(
    () => () => {
      teardownAll();
      if (audioCtxRef.current) {
        try { audioCtxRef.current.close(); } catch (e) { /* noop */ }
        audioCtxRef.current = null;
      }
    },
    [teardownAll]
  );

  // ---- Honest diagnostics -------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const pcs = Array.from(pcsRef.current.entries());
      const s = signalRef.current;
      const info = pcs
        .map(([pid, pc]) => `${String(pid).slice(-4)}:${pc.connectionState}/${pc.iceConnectionState}/${pc.signalingState}`)
        .join(' ') || 'none';
      if (!cancelled) {
        setPcDebug(`pcs=${pcs.length} tx(o${s.offerTx}a${s.answerTx}i${s.iceTx}) rx(o${s.offerRx}a${s.answerRx}i${s.iceRx}) [${info}]`);
      }

      const track = outgoingTrackRef.current;
      const mic = track
        ? { granted: true, captured: true, trackState: track.readyState, enabled: track.enabled, muted: track.muted, label: track.label }
        : { granted: false, captured: false, trackState: 'none', enabled: false, muted: true, label: '' };

      const peerDiag = await Promise.all(pcs.map(async ([pid, pc]) => {
        const graph = audioGraphsRef.current.get(pid);
        const meta = peerInfoRef.current.get(pid) || {};
        let bytesReceived = null;
        try {
          const stats = await pc.getStats();
          stats.forEach((r) => {
            if (r.type === 'inbound-rtp' && r.kind === 'audio') bytesReceived = r.bytesReceived;
          });
        } catch (e) { /* noop */ }
        const ctx = audioCtxRef.current;
        return {
          peerId: pid,
          distance: typeof meta.distance === 'number' ? meta.distance : null,
          connectionState: pc.connectionState,
          iceConnectionState: pc.iceConnectionState,
          signalingState: pc.signalingState,
          remoteTrack: !!graph && !!graph.stream,
          playing: !!graph && !!ctx && ctx.state === 'running',
          targetGain: graph ? Number(graph.targetGain.toFixed(3)) : null,
          gain: graph ? Number(graph.gain.gain.value.toFixed(3)) : null,
          remoteLevel: graph ? Number(readLevel(graph).toFixed(3)) : 0,
          bytesReceived
        };
      }));

      if (!cancelled) {
        setDiagnostics({
          mic,
          audioContext: audioCtxRef.current ? audioCtxRef.current.state : 'none',
          peers: peerDiag
        });
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Test/automation hook: expose the true state on window.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    window.__proxispeakRtc = {
      snapshot: () => ({
        selfId,
        audioContext: audioCtxRef.current ? audioCtxRef.current.state : 'none',
        audioReady,
        playbackBlocked,
        signals: { ...signalRef.current },
        peers: Array.from(pcsRef.current.entries()).map(([peerId, pc]) => {
          const graph = audioGraphsRef.current.get(peerId);
          return {
            peerId,
            connectionState: pc.connectionState,
            iceConnectionState: pc.iceConnectionState,
            signalingState: pc.signalingState,
            hasRemoteStream: !!graph && !!graph.stream,
            targetGain: graph ? Number(graph.targetGain.toFixed(3)) : null,
            gain: graph ? Number(graph.gain.gain.value.toFixed(3)) : null
          };
        }),
        graphs: Array.from(audioGraphsRef.current.entries()).map(([peerId, graph]) => ({
          peerId,
          targetGain: Number(graph.targetGain.toFixed(3)),
          gain: Number(graph.gain.gain.value.toFixed(3)),
          hasStream: !!graph.stream
        }))
      })
    };
    return () => { delete window.__proxispeakRtc; };
  }, [selfId, audioReady, playbackBlocked]);

  return {
    connections,
    selfLevel,
    selfLevelRef,
    levelsRef,
    playTestTone,
    audioReady,
    resumeAudio,
    pcDebug,
    playbackBlocked,
    diagnostics
  };
}
