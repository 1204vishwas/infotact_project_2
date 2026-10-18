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
 * - Remote audio is attached to a real <audio autoplay> element per peer and
 *   played via element.play(); play() rejections (autoplay policy) are caught
 *   and surfaced. Proximity attenuation uses element.volume. A separate Web
 *   Audio analyser branch drives the "speaking" ring on the canvas.
 * - Diagnostics report the REAL state (mic track, ICE/connection state, remote
 *   track received, playback state) rather than optimistic UI flags.
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
  const audioElsRef = useRef(new Map());     // peerId -> HTMLAudioElement
  const analysersRef = useRef(new Map());    // peerId -> { analyser, data }
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
        }
      };
    }
    if (audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume().catch(() => {});
    }
    setAudioReady(audioCtxRef.current.state === "running");
    return audioCtxRef.current;
  }, []);

  const ensureAudioElement = useCallback((peerId) => {
    if (typeof document === "undefined") return null;
    let el = audioElsRef.current.get(peerId);
    if (!el) {
      el = document.createElement("audio");
      el.autoplay = true;
      el.playsInline = true;
      el.setAttribute("playsinline", "");
      el.muted = false;
      el.style.display = "none";
      el.dataset.peerId = String(peerId);
      document.body.appendChild(el);
      audioElsRef.current.set(peerId, el);
    }
    return el;
  }, []);

  const markPlaybackBlocked = useCallback((blocked) => {
    playbackBlockedRef.current = blocked;
    setPlaybackBlocked(blocked);
  }, []);

  // Attach a received remote stream to a playable <audio> element and tap it
  // with an analyser for the speaking indicator.
  const attachRemoteAudio = useCallback(
    (peerId, stream) => {
      const el = ensureAudioElement(peerId);
      if (el) {
        try {
          el.srcObject = stream;
          el.muted = false;
          const p = el.play();
          if (p && typeof p.catch === "function") {
            p.then(() => markPlaybackBlocked(false)).catch((err) => {
              console.warn("[rtc] remote playback blocked:", err && err.message);
              markPlaybackBlocked(true);
            });
          }
        } catch (err) {
          console.warn("[rtc] failed to start remote playback:", err);
          markPlaybackBlocked(true);
        }
      }

      const ctx = getAudioContext();
      if (!ctx) return;
      const existing = analysersRef.current.get(peerId);
      if (existing && existing.source) {
        try { existing.source.disconnect(); } catch (e) { /* noop */ }
      }
      try {
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        const sink = ctx.createMediaStreamDestination();
        source.connect(analyser);
        analyser.connect(sink); // pulled by a silent sink — analysis only
        analysersRef.current.set(peerId, {
          analyser,
          data: new Uint8Array(analyser.fftSize),
          source,
          sink
        });
      } catch (err) {
        console.warn("[rtc] failed to attach remote analyser:", err);
      }
    },
    [ensureAudioElement, getAudioContext, markPlaybackBlocked]
  );

  const teardown = useCallback((peerId) => {
    const pc = pcsRef.current.get(peerId);
    if (pc) {
      try { pc.close(); } catch (e) { /* noop */ }
    }
    pcsRef.current.delete(peerId);
    pendingIceRef.current.delete(peerId);
    peerInfoRef.current.delete(peerId);

    const entry = analysersRef.current.get(peerId);
    if (entry) {
      try { entry.source && entry.source.disconnect(); } catch (e) { /* noop */ }
      try { entry.sink && entry.sink.disconnect(); } catch (e) { /* noop */ }
    }
    analysersRef.current.delete(peerId);
    levelsRef.current.delete(peerId);

    const el = audioElsRef.current.get(peerId);
    if (el) {
      try { el.pause(); } catch (e) { /* noop */ }
      el.srcObject = null;
      if (el.parentNode) el.parentNode.removeChild(el);
    }
    audioElsRef.current.delete(peerId);

    setConnections((prev) => prev.filter((c) => c.peerId !== peerId));
  }, []);

  const teardownAll = useCallback(() => {
    Array.from(pcsRef.current.keys()).forEach(teardown);
    lastSeenRef.current.clear();
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
        if (candidate) {
          if (emit("world:ice-candidate", { target: peerId, candidate })) {
            signalRef.current.iceTx += 1;
          }
        }
      };

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        setConnections((prev) =>
          prev.map((c) => (c.peerId === peerId ? { ...c, state } : c))
        );
        if (state === "failed") {
          console.warn("[rtc] connection failed, tearing down", peerId);
          teardown(peerId);
        } else if (state === "closed") {
          teardown(peerId);
        }
      };

      pc.ontrack = (event) => {
        const track = event.track;
        const el = ensureAudioElement(peerId);
        // Prefer the stream announced in the SDP (msid). When the remote added
        // a bare transceiver/track there is no msid, so streams[] is empty —
        // we then reuse/create a stream on the audio element and add the track
        // ourselves. Either way the remote track ends up attached and playable.
        let stream = (event.streams && event.streams[0]) || null;
        if (!stream) {
          stream = el && el.srcObject instanceof MediaStream ? el.srcObject : new MediaStream();
        }
        if (track && !stream.getTracks().includes(track)) {
          stream.addTrack(track);
        }
        console.log('[rtc] ontrack from', peerId, 'tracks', stream.getAudioTracks().length, 'kind', track && track.kind);

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
            if (emit("world:offer", { target: peerId, offer: pc.localDescription })) {
              signalRef.current.offerTx += 1;
            }
          } catch (err) {
            console.error("[rtc] failed to create offer:", err);
          }
        })();
      }

      return pc;
    },
    [enabled, selfId, emit, attachRemoteAudio, teardown, ensureAudioElement]
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
      if (Date.now() - seen > 2500) {
        lastSeenRef.current.delete(peerId);
        teardown(peerId);
      }
    });

    nearby.forEach((peer) => {
      lastSeenRef.current.set(peer.id, Date.now());
      if (!pcsRef.current.has(peer.id)) createPeerConnection(peer.id);
    });

    // Proximity attenuation through each playback element's volume.
    nearby.forEach((peer) => {
      const el = audioElsRef.current.get(peer.id);
      if (!el) return;
      const distance = typeof peer.distance === "number" ? peer.distance : 0;
      const proximity = Math.max(0, Math.min(1, 1 - distance / EARSHOT));
      el.volume = Math.max(0.25, 0.4 + 0.6 * proximity);
    });
  }, [enabled, selfId, peers, createPeerConnection, teardown, teardownAll]);

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
    try {
      const source = ctx.createMediaStreamSource(localStream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      const sink = ctx.createMediaStreamDestination();
      source.connect(analyser);
      analyser.connect(sink);
      localAnalyserRef.current = { analyser, data: new Uint8Array(analyser.fftSize) };
    } catch (err) {
      localAnalyserRef.current = null;
    }
    return () => {
      localAnalyserRef.current = null;
    };
  }, [localStream, getAudioContext]);

  // ---- Sample all microphones ~11Hz and publish levels --------------------
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

  // ---- Explicitly unlock audio playback (user gesture) --------------------
  const resumeAudio = useCallback(() => {
    const ctx = getAudioContext();
    let anyPlaying = false;
    audioElsRef.current.forEach((el) => {
      const p = el.play();
      if (p && typeof p.then === "function") {
        p.then(() => { anyPlaying = true; }).catch(() => {});
      }
    });
    const sync = () => setAudioReady(ctx ? ctx.state === "running" : false);
    if (ctx && ctx.state === "suspended") {
      ctx.resume().then(() => { sync(); markPlaybackBlocked(false); }).catch(sync);
    } else {
      sync();
      if (anyPlaying || audioElsRef.current.size === 0) markPlaybackBlocked(false);
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
        const el = audioElsRef.current.get(pid);
        const entry = analysersRef.current.get(pid);
        const meta = peerInfoRef.current.get(pid) || {};
        let bytesReceived = null;
        try {
          const stats = await pc.getStats();
          stats.forEach((r) => {
            if (r.type === 'inbound-rtp' && r.kind === 'audio') bytesReceived = r.bytesReceived;
          });
        } catch (e) { /* noop */ }
        return {
          peerId: pid,
          distance: typeof meta.distance === 'number' ? meta.distance : null,
          connectionState: pc.connectionState,
          iceConnectionState: pc.iceConnectionState,
          signalingState: pc.signalingState,
          remoteTrack: !!el && !!el.srcObject,
          playing: !!el && !el.paused && !el.ended && el.readyState > 2,
          volume: el ? Number(el.volume.toFixed(2)) : null,
          remoteLevel: entry ? Number(readLevel(entry).toFixed(3)) : 0,
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
        signals: { ...signalRef.current },
        peers: Array.from(pcsRef.current.entries()).map(([peerId, pc]) => ({
          peerId,
          connectionState: pc.connectionState,
          iceConnectionState: pc.iceConnectionState,
          signalingState: pc.signalingState,
          hasRemoteStream: !!(audioElsRef.current.get(peerId) && audioElsRef.current.get(peerId).srcObject)
        }))
      })
    };
    return () => { delete window.__proxispeakRtc; };
  }, [selfId]);

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
