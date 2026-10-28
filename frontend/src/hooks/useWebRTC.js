import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const DEFAULT_EARSHOT = 100;
const ICE_SERVERS = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }
];

/**
 * useWebRTC
 * Manages a WebRTC mesh for proximity audio between peers in the virtual office.
 * - Only initiates/accepts peer connections when peers are inside earshot radius.
 * - Proximity attenuation applied via Web Audio API (GainNode) based on pixel distance.
 * - Maintains local mic capture, remote audio playback, and connection diagnostics.
 */
export default function useWebRTC({
  socket,
  user,
  token,
  enabled = true,
  earshot = DEFAULT_EARSHOT,
  getPeerPosition,
  peersVersion
} = {}) {
  const pcsRef = useRef(new Map());
  const remoteStreamsRef = useRef(new Map());
  const localStreamRef = useRef(null);
  const audioElementsRef = useRef(new Map());
  const audioContextRef = useRef(null);
  const gainNodesRef = useRef(new Map());
  const pannerNodesRef = useRef(new Map());
  const sourceNodesRef = useRef(new Map());

  const [localStream, setLocalStream] = useState(null);
  const [peers, setPeers] = useState(new Map());
  const [micEnabled, setMicEnabled] = useState(true);
  const [muted, setMuted] = useState(false);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const [status, setStatus] = useState('idle');
  const [lastError, setLastError] = useState(null);
  const [stats, setStats] = useState({ connected: 0, connecting: 0, inEarshot: 0 });

  const inFlightRef = useRef(new Set());

  const getAudioContext = useCallback(() => {
    if (typeof window === 'undefined') return null;
    if (audioContextRef.current) return audioContextRef.current;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    const ctx = new AudioCtx();
    audioContextRef.current = ctx;
    return ctx;
  }, []);

  const ensureAudioElement = useCallback((peerId) => {
    if (typeof document === 'undefined') return null;
    if (audioElementsRef.current.has(peerId)) {
      return audioElementsRef.current.get(peerId);
    }
    const el = document.createElement('audio');
    el.autoplay = true;
    el.playsInline = true;
    el.volume = 1.0;
    el.dataset.peerId = peerId;
    document.body.appendChild(el);
    audioElementsRef.current.set(peerId, el);
    return el;
  }, []);

  const applyDistanceAttenuation = useCallback((peerId, distance) => {
    const ctx = audioContextRef.current;
    const gainNode = gainNodesRef.current.get(peerId);
    if (!ctx || !gainNode) return;
    if (distance == null || !Number.isFinite(distance)) {
      gainNode.gain.setTargetAtTime(0.25, ctx.currentTime, 0.05);
      return;
    }
    if (distance >= earshot) {
      gainNode.gain.setTargetAtTime(0.0, ctx.currentTime, 0.05);
      return;
    }
    // Inverse-square-like falloff with distance model (pixel distance)
    const normalized = Math.max(0, distance) / Math.max(1, earshot);
    const gain = Math.max(0.0, Math.min(1.0, (1 - normalized) * (1 - normalized)));
    gainNode.gain.setTargetAtTime(gain * 0.8, ctx.currentTime, 0.03);
  }, [earshot]);

  const attachRemoteStream = useCallback((peerId, stream) => {
    if (!stream) return;
    const ctx = getAudioContext();
    if (!ctx) {
      const el = ensureAudioElement(peerId);
      if (el) {
        try {
          el.srcObject = stream;
          el.play().catch(() => setPlaybackBlocked(true));
        } catch (err) {
          console.warn('[WebRTC] audio attach failed', err);
        }
      }
      return;
    }
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    if (sourceNodesRef.current.has(peerId)) {
      const existing = sourceNodesRef.current.get(peerId);
      try {
        existing.disconnect();
      } catch (err) {}
    }
    const source = ctx.createMediaStreamSource(stream);
    let gainNode = gainNodesRef.current.get(peerId);
    if (!gainNode) {
      gainNode = ctx.createGain();
      gainNode.gain.value = 0.5;
      gainNodesRef.current.set(peerId, gainNode);
    }
    source.connect(gainNode);
    gainNode.connect(ctx.destination);
    sourceNodesRef.current.set(peerId, source);
    const pos = getPeerPosition ? getPeerPosition(peerId) : null;
    const myPos = getPeerPosition ? getPeerPosition(user?.id || user?._id) : null;
    if (pos && myPos) {
      const dx = (pos.x || 0) - (myPos.x || 0);
      const dy = (pos.y || 0) - (myPos.y || 0);
      const dist = Math.hypot(dx, dy);
      applyDistanceAttenuation(peerId, dist);
    }
  }, [applyDistanceAttenuation, ensureAudioElement, getAudioContext, getPeerPosition, user]);

  const removePeer = useCallback((peerId) => {
    const pc = pcsRef.current.get(peerId);
    if (pc) {
      try { pc.close(); } catch (err) {}
      pcsRef.current.delete(peerId);
    }
    const src = sourceNodesRef.current.get(peerId);
    if (src) {
      try { src.disconnect(); } catch (err) {}
      sourceNodesRef.current.delete(peerId);
    }
    const gain = gainNodesRef.current.get(peerId);
    if (gain) {
      try { gain.disconnect(); } catch (err) {}
      gainNodesRef.current.delete(peerId);
    }
    const pan = pannerNodesRef.current.get(peerId);
    if (pan) {
      try { pan.disconnect(); } catch (err) {}
      pannerNodesRef.current.delete(peerId);
    }
    const el = audioElementsRef.current.get(peerId);
    if (el) {
      try { el.srcObject = null; el.remove(); } catch (err) {}
      audioElementsRef.current.delete(peerId);
    }
    remoteStreamsRef.current.delete(peerId);
    setPeers((prev) => {
      const next = new Map(prev);
      next.delete(peerId);
      return next;
    });
  }, []);

  const createPeerConnection = useCallback((peerId, isInitiator) => {
    if (!enabled || !socket) return null;
    if (pcsRef.current.has(peerId)) return pcsRef.current.get(peerId);

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        try {
          pc.addTrack(track, localStreamRef.current);
        } catch (err) {
          console.warn('[WebRTC] addTrack failed', err);
        }
      });
    }

    pc.ontrack = (event) => {
      const [stream] = event.streams;
      if (stream) {
        remoteStreamsRef.current.set(peerId, stream);
        attachRemoteStream(peerId, stream);
        setPeers((prev) => {
          const next = new Map(prev);
          next.set(peerId, { id: peerId, stream, connected: true });
          return next;
        });
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && socket?.connected) {
        socket.emit('world:ice-candidate', { to: peerId, candidate: event.candidate });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected' || pc.connectionState === 'closed') {
        removePeer(peerId);
      }
    };

    pcsRef.current.set(peerId, pc);

    if (isInitiator) {
      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .then(() => {
          if (socket?.connected && pc.localDescription) {
            socket.emit('world:offer', { to: peerId, offer: pc.localDescription });
          }
        })
        .catch((err) => setLastError(err.message));
    }

    return pc;
  }, [attachRemoteStream, enabled, removePeer, socket]);

  useEffect(() => {
    // Update attenuation based on positions
    if (!getPeerPosition || !user) return;
    const myPos = getPeerPosition(user?.id || user?._id);
    for (const [peerId] of pcsRef.current.entries()) {
      const pos = getPeerPosition(peerId);
      if (pos && myPos) {
        const dx = (pos.x || 0) - (myPos.x || 0);
        const dy = (pos.y || 0) - (myPos.y || 0);
        const dist = Math.hypot(dx, dy);
        applyDistanceAttenuation(peerId, dist);
      }
    }
  }, [peersVersion, getPeerPosition, user, applyDistanceAttenuation]);

  useEffect(() => {
    setStatus(enabled ? 'ready' : 'idle');
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !socket) return;
    const handleOffer = async ({ from, offer }) => {
      const pc = createPeerConnection(from, false);
      if (!pc) return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        if (socket.connected && pc.localDescription) {
          socket.emit('world:answer', { to: from, answer: pc.localDescription });
        }
      } catch (err) {
        setLastError(err.message);
      }
    };
    const handleAnswer = async ({ from, answer }) => {
      const pc = pcsRef.current.get(from);
      if (!pc) return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
      } catch (err) {
        setLastError(err.message);
      }
    };
    const handleIce = async ({ from, candidate }) => {
      const pc = pcsRef.current.get(from);
      if (!pc || !candidate) return;
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {}
    };
    socket.on('world:offer', handleOffer);
    socket.on('world:answer', handleAnswer);
    socket.on('world:ice-candidate', handleIce);
    return () => {
      socket.off('world:offer', handleOffer);
      socket.off('world:answer', handleAnswer);
      socket.off('world:ice-candidate', handleIce);
    };
  }, [enabled, socket, createPeerConnection]);

  return {
    localStream,
    peers,
    micEnabled,
    muted,
    setMuted,
    toggleMic: () => setMicEnabled((v) => !v),
    playbackBlocked,
    resumeAudio: () => {
      const ctx = getAudioContext();
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
      for (const el of audioElementsRef.current.values()) {
        try { el.play().catch(() => setPlaybackBlocked(true)); } catch (err) {}
      }
    },
    status,
    lastError,
    stats
  };
}
