import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Coffee,
  Keyboard,
  Mic,
  MicOff,
  MousePointer2,
  Navigation,
  Palette,
  Radio,
  Users,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff
} from 'lucide-react';
import useWorldSocket from '../hooks/useWorldSocket';
import useWebRTC, { SPEAKING_THRESHOLD, EARSHOT } from '../hooks/useWebRTC';

// ---------------------------------------------------------------------------
// World configuration — must mirror server/realtime/worldState.js OFFICE_BOUNDS
// ---------------------------------------------------------------------------
const OFFICE = { width: 1200, height: 720, padding: 48 };
// Single source of truth — mirrors useWebRTC's EARSHOT so the drawn circle,
// the "in earshot" HUD, and the actual P2P connection threshold always agree.
const EARSHOT_RADIUS = EARSHOT;
const MAX_SPEED = 300; // px / second
const ACCELERATION = 2600; // px / second^2
const GRID_SIZE = 40;

// Original ProxiSpeak office layout — four quadrants around the central
// corridor. Accent colors mirror the original screenshot.
const ZONES = [
  { id: 'spatial', label: 'Spatial Audio Lab', icon: 'volume', x: 60, y: 60, w: 520, h: 270, rgb: '99,102,241' },
  { id: 'webrtc', label: 'Core WebRTC Bay', icon: 'radio', x: 620, y: 60, w: 520, h: 270, rgb: '6,182,212' },
  { id: 'design', label: 'Product & Design Hub', icon: 'palette', x: 60, y: 380, w: 520, h: 280, rgb: '139,92,246' },
  { id: 'lounge', label: 'Breakout Lounge & Water Cooler', icon: 'coffee', x: 620, y: 380, w: 520, h: 280, rgb: '245,158,11' }
];

// Rectangular / circular furniture placed inside the four zones.
const FURNITURE = [
  // Spatial Audio Lab — mixing consoles & listening table
  { x: 105, y: 115, w: 118, h: 56, rgb: '99,102,241' },
  { x: 285, y: 115, w: 118, h: 56, rgb: '99,102,241' },
  { x: 105, y: 230, w: 118, h: 56, rgb: '99,102,241' },
  { x: 285, y: 230, w: 118, h: 56, rgb: '99,102,241' },
  { x: 470, y: 175, r: 42, shape: 'circle', rgb: '99,102,241' },

  // Core WebRTC Bay — server rack + engineer desks
  { x: 655, y: 100, w: 62, h: 130, shape: 'rack', rgb: '6,182,212' },
  { x: 790, y: 115, w: 118, h: 56, rgb: '6,182,212' },
  { x: 972, y: 115, w: 118, h: 56, rgb: '6,182,212' },
  { x: 790, y: 230, w: 118, h: 56, rgb: '6,182,212' },
  { x: 972, y: 230, w: 118, h: 56, rgb: '6,182,212' },

  // Product & Design Hub — whiteboard, desks & brainstorm table
  { x: 85, y: 405, w: 210, h: 34, shape: 'board', rgb: '139,92,246' },
  { x: 115, y: 492, w: 118, h: 56, rgb: '139,92,246' },
  { x: 295, y: 492, w: 118, h: 56, rgb: '139,92,246' },
  { x: 470, y: 580, r: 36, shape: 'circle', rgb: '139,92,246' },

  // Breakout Lounge & Water Cooler — lounge table, sofas, coolers
  { x: 700, y: 440, r: 36, shape: 'circle', rgb: '245,158,11' },
  { x: 690, y: 558, w: 132, h: 30, shape: 'sofa', rgb: '245,158,11' },
  { x: 882, y: 558, w: 132, h: 30, shape: 'sofa', rgb: '245,158,11' },
  { x: 1030, y: 420, r: 15, shape: 'water', rgb: '245,158,11' },
  { x: 1085, y: 585, r: 13, shape: 'water', rgb: '245,158,11' }
];

// Demo colleagues used only while the realtime backend is unreachable so the
// canvas still demonstrates proximity behaviour offline.
const OFFLINE_BOTS = [
  { id: 'bot_aris', name: 'Dr. Aris Thorne', role: 'Audio Engineer', avatarColor: '#6366f1', home: { x: 330, y: 175 }, phase: 0.0, radius: 50 },
  { id: 'bot_priya', name: 'Priya Sharma', role: 'Developer', avatarColor: '#10b981', home: { x: 860, y: 540 }, phase: 2.1, radius: 45 },
  { id: 'bot_rohan', name: 'Rohan Mehta', role: 'Product Manager', avatarColor: '#f59e0b', home: { x: 200, y: 500 }, phase: 4.2, radius: 55 }
];

const ZONE_ICONS = { volume: Volume2, radio: Radio, palette: Palette, coffee: Coffee };

const clamp = (v, min, max) => Math.min(Math.max(v, min), max);
const lerp = (a, b, t) => a + (b - a) * t;
const hexToRgba = (hex, alpha) => {
  const clean = String(hex || '#6366f1').replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const num = parseInt(full, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r},${g},${b},${alpha})`;
};

function resolveSpawn(user) {
  const loc = user && user.location;
  if (Array.isArray(loc) && loc.length >= 2) {
    return { x: Number(loc[0]) || 600, y: Number(loc[1]) || 360 };
  }
  if (loc && Array.isArray(loc.coordinates) && loc.coordinates.length >= 2) {
    return { x: Number(loc.coordinates[0]) || 600, y: Number(loc.coordinates[1]) || 360 };
  }
  return { x: 600, y: 360 };
}

const roleAbbrev = (role) => {
  const map = {
    Developer: 'DEV',
    'Audio Engineer': 'AUD',
    'Product Manager': 'PM',
    Designer: 'DSG',
    DevOps: 'OPS'
  };
  return map[role] || 'TEAM';
};

export default function WorldCanvas({ user, token, showToast, onStatusChange }) {
  const canvasRef = useRef(null);
  const { peersRef, status, peers, selfId, socketRef, onlineCount, proximityGroups, sendMove, setMuted } = useWorldSocket({ user, token });

  const [muted, setMutedState] = useState(false);
  const [hud, setHud] = useState({ x: 600, y: 360, inEarshot: false, gain: 0, speed: 0 });
  const [nearby, setNearby] = useState([]);
  const [localStream, setLocalStream] = useState(null);

  // WebRTC — only negotiate with real colleagues within EARSHOT (100px). The
  // hook also drops offline bots, so the "live P2P link" count is honest.
  const {
    selfLevel,
    selfLevelRef,
    levelsRef,
    playTestTone,
    audioReady,
    resumeAudio,
    pcDebug,
    playbackBlocked,
    diagnostics
  } = useWebRTC({
    enabled: status === 'connected',
    selfId,
    peers: nearby,
    localStream,
    socketRef
  });

  const statusRef = useRef(status);
  const mutedRef = useRef(false);

  const simRef = useRef({
    pos: resolveSpawn(user),
    vel: { x: 0, y: 0 },
    target: null,
    keys: new Set(),
    facing: -Math.PI / 2,
    lastSent: { x: -1, y: -1, t: 0 },
    lastHud: 0,
    clock: 0
  });

  // Surface the realtime connection state up to the header indicators.
  useEffect(() => {
    statusRef.current = status;
    onStatusChange?.(status);
  }, [status, onStatusChange]);

  const handleTestTone = useCallback(() => {
    const linkCount = diagnostics.peers.length;
    if (!linkCount) {
      if (showToast) showToast(`No P2P link yet — move within ${EARSHOT}px of a colleague first.`, 'info');
      return;
    }
    const sent = playTestTone();
    if (sent) {
      if (showToast) {
        showToast(
          `Test tone sent to ${linkCount} colleague${linkCount !== 1 ? 's' : ''} — listen on the other tab.`,
          'success'
        );
      }
    } else if (showToast) {
      showToast('Microphone not ready — allow mic access first.', 'error');
    }
  }, [diagnostics.peers.length, playTestTone, showToast]);

  const toggleMic = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMutedState(next);
    setMuted(next);
    if (showToast) showToast(next ? 'Microphone muted across earshot.' : 'Microphone live — broadcasting spatially.', next ? 'info' : 'success');
  }, [setMuted, showToast]);

  // Initialize WebRTC audio with getUserMedia.
  //
  // React StrictMode intentionally mounts effects twice in development. If we
  // naively call getUserMedia in both runs we end up with TWO live microphone
  // streams — one of which is orphaned and never stopped (holding the mic
  // indicator on and leaking a track). We guard each run with its own
  // `cancelled` flag: any stream that resolves after its effect was cleaned up
  // is stopped immediately, so exactly one live stream survives.
  useEffect(() => {
    let cancelled = false;
    let acquired = null;
    const initMic = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        acquired = stream;
        console.log('[mic] got user media, tracks:', stream.getAudioTracks().length);
        setLocalStream(stream);
      } catch (err) {
        console.warn('Failed to get user media:', err);
      }
    };
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      initMic();
    }
    return () => {
      cancelled = true;
      if (acquired) acquired.getTracks().forEach((t) => t.stop());
      setLocalStream(null);
    };
  }, []);

  // Actually silence the outgoing microphone when muted (not just the cosmetic
  // status flip). Tracks are disabled rather than stopped so unmuting resumes
  // the same media without re-negotiating the peer connection.
  useEffect(() => {
    if (!localStream) return;
    localStream.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
  }, [localStream, muted]);

  // --------------------------- Input handlers -----------------------------
  useEffect(() => {
    const sim = simRef.current;
    const validKeys = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'];

    const onKeyDown = (e) => {
      const key = e.key.toLowerCase();
      if (validKeys.includes(key)) {
        sim.keys.add(key);
        if (key.startsWith('arrow')) e.preventDefault();
      }
    };
    const onKeyUp = (e) => {
      sim.keys.delete(e.key.toLowerCase());
    };
    const onBlur = () => sim.keys.clear();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  const pointerToWorld = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * OFFICE.width;
    const y = ((e.clientY - rect.top) / rect.height) * OFFICE.height;
    return {
      x: clamp(x, OFFICE.padding, OFFICE.width - OFFICE.padding),
      y: clamp(y, OFFICE.padding, OFFICE.height - OFFICE.padding)
    };
  }, []);

  const handlePointerDown = useCallback(
    (e) => {
      const world = pointerToWorld(e);
      if (!world) return;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      simRef.current.target = world;
      simRef.current.keys.clear();
    },
    [pointerToWorld]
  );

  const handlePointerMove = useCallback(
    (e) => {
      if (e.buttons !== 1) return;
      const world = pointerToWorld(e);
      if (world) simRef.current.target = world;
    },
    [pointerToWorld]
  );

  // --------------------------- Render loop --------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');

    let raf = 0;
    let last = performance.now();

    const drawRoundRect = (x, y, w, h, r) => {
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(x, y, w, h, r);
      } else {
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
      }
    };

    const drawFloor = () => {
      // Dark navy office floor (original design background).
      const bg = ctx.createLinearGradient(0, 0, OFFICE.width, OFFICE.height);
      bg.addColorStop(0, '#0b1120');
      bg.addColorStop(1, '#0f172a');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, OFFICE.width, OFFICE.height);

      // Subtle square grid.
      ctx.strokeStyle = 'rgba(30,41,59,0.9)';
      ctx.lineWidth = 1;
      for (let x = 0; x <= OFFICE.width; x += GRID_SIZE) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, OFFICE.height);
        ctx.stroke();
      }
      for (let y = 0; y <= OFFICE.height; y += GRID_SIZE) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(OFFICE.width, y);
        ctx.stroke();
      }
    };

    const drawZones = () => {
      ZONES.forEach((z) => {
        ctx.fillStyle = `rgba(${z.rgb},0.05)`;
        ctx.strokeStyle = `rgba(${z.rgb},0.35)`;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([7, 7]);
        drawRoundRect(z.x, z.y, z.w, z.h, 16);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);
      });
    };

    const drawFurniture = () => {
      FURNITURE.forEach((d) => {
        if (d.shape === 'circle') {
          const glow = ctx.createRadialGradient(d.x, d.y, 2, d.x, d.y, d.r);
          glow.addColorStop(0, `rgba(${d.rgb},0.22)`);
          glow.addColorStop(1, `rgba(${d.rgb},0)`);
          ctx.beginPath();
          ctx.arc(d.x, d.y, d.r + 10, 0, Math.PI * 2);
          ctx.fillStyle = glow;
          ctx.fill();

          ctx.beginPath();
          ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(30,41,59,0.85)';
          ctx.fill();
          ctx.strokeStyle = `rgba(${d.rgb},0.45)`;
          ctx.lineWidth = 1.5;
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(d.x, d.y, d.r * 0.35, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${d.rgb},0.18)`;
          ctx.fill();
          return;
        }

        if (d.shape === 'water') {
          ctx.beginPath();
          ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${d.rgb},0.2)`;
          ctx.fill();
          ctx.strokeStyle = `rgba(${d.rgb},0.7)`;
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(d.x, d.y, Math.max(3, d.r * 0.3), 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${d.rgb},0.9)`;
          ctx.fill();
          return;
        }

        if (d.shape === 'rack') {
          ctx.fillStyle = 'rgba(15,23,42,0.95)';
          ctx.strokeStyle = `rgba(${d.rgb},0.6)`;
          ctx.lineWidth = 1.5;
          drawRoundRect(d.x, d.y, d.w, d.h, 6);
          ctx.fill();
          ctx.stroke();
          for (let i = 0; i < 4; i += 1) {
            ctx.fillStyle = `rgba(${d.rgb},${0.4 + i * 0.12})`;
            ctx.fillRect(d.x + 6, d.y + 10 + i * 28, d.w - 12, 12);
          }
          return;
        }

        if (d.shape === 'board') {
          ctx.fillStyle = 'rgba(30,41,59,0.7)';
          ctx.strokeStyle = `rgba(${d.rgb},0.5)`;
          ctx.lineWidth = 1.5;
          drawRoundRect(d.x, d.y, d.w, d.h, 8);
          ctx.fill();
          ctx.stroke();
          ctx.strokeStyle = `rgba(${d.rgb},0.25)`;
          ctx.beginPath();
          ctx.moveTo(d.x + 14, d.y + d.h / 2);
          ctx.lineTo(d.x + d.w - 14, d.y + d.h / 2);
          ctx.stroke();
          return;
        }

        if (d.shape === 'sofa') {
          ctx.fillStyle = 'rgba(51,65,85,0.9)';
          ctx.strokeStyle = `rgba(${d.rgb},0.5)`;
          ctx.lineWidth = 1.5;
          drawRoundRect(d.x, d.y, d.w, d.h, 9);
          ctx.fill();
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(d.x + 12, d.y + d.h / 2, 6, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${d.rgb},0.5)`;
          ctx.fill();
          ctx.beginPath();
          ctx.arc(d.x + d.w - 12, d.y + d.h / 2, 6, 0, Math.PI * 2);
          ctx.fill();
          return;
        }

        // Standard rectangular desk with a glowing monitor bar.
        ctx.fillStyle = 'rgba(30,41,59,0.85)';
        ctx.strokeStyle = 'rgba(71,85,105,0.7)';
        ctx.lineWidth = 1;
        drawRoundRect(d.x, d.y, d.w, d.h, 8);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = `rgba(${d.rgb},0.18)`;
        drawRoundRect(d.x + 12, d.y + 10, d.w - 24, 6, 3);
        ctx.fill();
      });

      // Office perimeter walls.
      ctx.strokeStyle = 'rgba(148,163,184,0.35)';
      ctx.lineWidth = 4;
      drawRoundRect(6, 6, OFFICE.width - 12, OFFICE.height - 12, 20);
      ctx.stroke();
    };

    const drawAvatar = (a, isSelf) => {
      const radius = isSelf ? 18 : 15;
      const color = a.avatarColor || '#6366f1';

      // Green pulsing ring while this participant's microphone is active.
      const level = isSelf ? selfLevelRef.current : levelsRef.current.get(a.id) || 0;
      if (level > SPEAKING_THRESHOLD) {
        const speakWave = Math.sin(simRef.current.clock * 6);
        ctx.beginPath();
        ctx.arc(a.x, a.y, radius + 6 + speakWave * 2, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(16,185,129,${0.55 + 0.35 * speakWave})`;
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }

      if (a.status === 'in-meeting') {
        ctx.beginPath();
        ctx.arc(a.x, a.y, radius + 4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(244,63,94,0.18)';
        ctx.fill();
      }

      // Soft glow halo.
      const glow = ctx.createRadialGradient(a.x, a.y, 2, a.x, a.y, radius * 2.4);
      glow.addColorStop(0, hexToRgba(color, 0.5));
      glow.addColorStop(1, hexToRgba(color, 0));
      ctx.beginPath();
      ctx.arc(a.x, a.y, radius * 2.4, 0, Math.PI * 2);
      ctx.fillStyle = glow;
      ctx.fill();

      // Body.
      ctx.beginPath();
      ctx.arc(a.x, a.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = isSelf ? 3 : 2;
      ctx.strokeStyle = isSelf ? '#f8fafc' : 'rgba(248,250,252,0.75)';
      ctx.stroke();

      // Initial.
      ctx.fillStyle = '#0b1120';
      ctx.font = `bold ${isSelf ? 14 : 12}px "Plus Jakarta Sans", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText((a.name || '?').charAt(0).toUpperCase(), a.x, a.y + 1);

      // Direction pointer for the local avatar.
      if (isSelf && (Math.abs(a.vx || 0) > 8 || Math.abs(a.vy || 0) > 8)) {
        const fx = a.x + Math.cos(a.facing) * (radius + 7);
        const fy = a.y + Math.sin(a.facing) * (radius + 7);
        ctx.beginPath();
        ctx.arc(fx, fy, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = '#e2e8f0';
        ctx.fill();
      }

      // Name plate.
      const label = isSelf ? `${a.name || 'You'} (you)` : a.name || 'Colleague';
      ctx.font = 'bold 12px "Plus Jakarta Sans", sans-serif';
      ctx.textBaseline = 'alphabetic';
      const textWidth = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(2,6,23,0.78)';
      drawRoundRect(a.x - textWidth / 2 - 7, a.y + radius + 7, textWidth + 14, 18, 6);
      ctx.fill();
      ctx.fillStyle = isSelf ? '#f8fafc' : '#cbd5e1';
      ctx.fillText(label, a.x, a.y + radius + 20);

      // Role tag.
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.fillStyle = hexToRgba(color, 0.95);
      ctx.fillText(roleAbbrev(a.role), a.x, a.y - radius - 8);
    };

    const drawConnections = (self, others) => {
      others.forEach((p) => {
        const dist = Math.hypot(p.x - self.x, p.y - self.y);
        if (dist > EARSHOT_RADIUS) return;
        const gain = clamp((1 - dist / EARSHOT_RADIUS) * 100, 0, 100);

        ctx.beginPath();
        ctx.moveTo(self.x, self.y);
        ctx.lineTo(p.x, p.y);
        ctx.strokeStyle = `rgba(16,185,129,${0.25 + (gain / 100) * 0.55})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.setLineDash([]);

        const midX = (self.x + p.x) / 2;
        const midY = (self.y + p.y) / 2;
        const phase = (simRef.current.clock * 2) % 1;
        ctx.beginPath();
        ctx.arc(midX, midY, phase * 22, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(56,189,248,${0.7 * (1 - phase)})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });
    };

    const render = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      simRef.current.clock += dt;

      const sim = simRef.current;

      // ----- gather remote avatars (real peers only) -----
      // Do NOT inject OFFLINE_BOTS when status is 'connecting' or 'connected'; that hides real users.
      const remote = Array.from(peersRef.current.values()).map((p) => ({ ...p }));

      if (statusRef.current === 'offline') {
        OFFLINE_BOTS.forEach((b) => {
          const t = sim.clock * 0.5 + b.phase;
          remote.push({
            id: b.id,
            name: b.name,
            role: b.role,
            avatarColor: b.avatarColor,
            status: 'online',
            x: clamp(b.home.x + Math.cos(t) * b.radius, OFFICE.padding, OFFICE.width - OFFICE.padding),
            y: clamp(b.home.y + Math.sin(t * 1.3) * b.radius * 0.7, OFFICE.padding, OFFICE.height - OFFICE.padding)
          });
        });
      }

      // ----- input -> velocity (smooth acceleration) -----
      const k = sim.keys;
      let ix = 0;
      let iy = 0;
      if (k.has('w') || k.has('arrowup')) iy -= 1;
      if (k.has('s') || k.has('arrowdown')) iy += 1;
      if (k.has('a') || k.has('arrowleft')) ix -= 1;
      if (k.has('d') || k.has('arrowright')) ix += 1;
      const keyboardActive = ix !== 0 || iy !== 0;

      if (keyboardActive) {
        const len = Math.hypot(ix, iy) || 1;
        ix /= len;
        iy /= len;
        sim.target = null;
        sim.vel.x += ix * ACCELERATION * dt;
        sim.vel.y += iy * ACCELERATION * dt;
        const speed = Math.hypot(sim.vel.x, sim.vel.y);
        if (speed > MAX_SPEED) {
          sim.vel.x = (sim.vel.x / speed) * MAX_SPEED;
          sim.vel.y = (sim.vel.y / speed) * MAX_SPEED;
        }
      } else if (sim.target) {
        const dx = sim.target.x - sim.pos.x;
        const dy = sim.target.y - sim.pos.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 5) {
          sim.target = null;
          sim.vel.x *= 0.5;
          sim.vel.y *= 0.5;
        } else {
          const desired = Math.min(MAX_SPEED, dist * 3.6);
          const ux = dx / dist;
          const uy = dy / dist;
          const smooth = 1 - Math.pow(0.00005, dt);
          sim.vel.x = lerp(sim.vel.x, ux * desired, smooth);
          sim.vel.y = lerp(sim.vel.y, uy * desired, smooth);
        }
      } else {
        const friction = Math.pow(0.0018, dt);
        sim.vel.x *= friction;
        sim.vel.y *= friction;
        if (Math.abs(sim.vel.x) < 0.6) sim.vel.x = 0;
        if (Math.abs(sim.vel.y) < 0.6) sim.vel.y = 0;
      }

      // ----- integrate + clamp to office -----
      sim.pos.x = clamp(sim.pos.x + sim.vel.x * dt, OFFICE.padding, OFFICE.width - OFFICE.padding);
      sim.pos.y = clamp(sim.pos.y + sim.vel.y * dt, OFFICE.padding, OFFICE.height - OFFICE.padding);

      const speed = Math.hypot(sim.vel.x, sim.vel.y);
      if (speed > 8) sim.facing = Math.atan2(sim.vel.y, sim.vel.x);

      const self = {
        id: (user && user.id) || 'self',
        name: user && user.name ? user.name : 'You',
        role: user && user.role,
        avatarColor: (user && user.avatarColor) || '#6366f1',
        status: mutedRef.current ? 'in-meeting' : 'online',
        x: sim.pos.x,
        y: sim.pos.y,
        vx: sim.vel.x,
        vy: sim.vel.y,
        facing: sim.facing
      };

      // ----- draw scene -----
      drawFloor();
      drawZones();
      drawFurniture();

      // Earshot radius around the local avatar (dashed circle).
      const pulse = 3 * Math.sin(sim.clock * 2.4);
      ctx.beginPath();
      ctx.arc(self.x, self.y, EARSHOT_RADIUS + pulse, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(99,102,241,0.45)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 6]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(99,102,241,0.06)';
      ctx.fill();

      drawConnections(self, remote);
      remote.forEach((p) => drawAvatar(p, false));
      drawAvatar(self, true);

      // ----- broadcast coordinates (throttled) -----
      const nowMs = now;
      const movedDist = Math.hypot(sim.pos.x - sim.lastSent.x, sim.pos.y - sim.lastSent.y);
      if ((nowMs - sim.lastSent.t > 90 && movedDist > 1.5) || nowMs - sim.lastSent.t > 1200) {
        sendMove(Math.round(sim.pos.x), Math.round(sim.pos.y));
        sim.lastSent = { x: sim.pos.x, y: sim.pos.y, t: nowMs };
      }

      // ----- HUD sync (throttled ~6Hz) -----
      if (nowMs - sim.lastHud > 160) {
        sim.lastHud = nowMs;

        const ranked = remote
          .map((p) => {
            const dist = Math.round(Math.hypot(p.x - self.x, p.y - self.y));
            const inEarshot = dist <= EARSHOT_RADIUS;
            const gain = inEarshot ? clamp(Math.round((1 - dist / EARSHOT_RADIUS) * 100), 8, 100) : 0;
            return { ...p, distance: dist, inEarshot, gain };
          })
          .sort((a, b) => a.distance - b.distance);

        setNearby(ranked);
        const nearestInEarshot = ranked.find((p) => p.inEarshot);
        setHud({
          x: Math.round(self.x),
          y: Math.round(self.y),
          speed: Math.round(speed),
          gain: nearestInEarshot ? nearestInEarshot.gain : 0,
          inEarshot: Boolean(nearestInEarshot)
        });
      }

      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [peersRef, sendMove, user, levelsRef, selfLevelRef]);

  const connectionLabel = useMemo(() => {
    if (status === 'connected') return 'Signaling Online';
    if (status === 'connecting') return 'Connecting…';
    return 'Offline · Local Sim';
  }, [status]);

  const earshotPeers = nearby.filter((p) => p.inEarshot);
  const nearby100 = nearby.filter((p) => p.distance <= EARSHOT);
  const speakingSelf = !muted && selfLevel > SPEAKING_THRESHOLD;

  // Honest, real-state indicators (no optimistic flags):
  //  - micCaptured   : we actually captured a live microphone track
  //  - liveLinks     : peer connections whose RTC state is truly "connected"
  //  - remoteAudible : a received remote track is playing AND carries energy
  const micCaptured = diagnostics.mic.captured;
  const liveLinks = diagnostics.peers.filter((p) => p.connectionState === 'connected').length;
  const connectingLinks = diagnostics.peers.filter((p) => p.connectionState !== 'connected').length;
  const remoteAudible = diagnostics.peers.some((p) => p.playing && p.remoteLevel > SPEAKING_THRESHOLD);

  return (
    <div className="w-full space-y-4">
      <div className="relative bg-slate-900/60 rounded-2xl border border-slate-800/80 p-3 sm:p-4 shadow-2xl backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
          <div className="flex items-center space-x-2">
            <Activity className="w-4 h-4 text-cyan-400 animate-pulse" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">Infotact Virtual Office · 2D Canvas World</h3>
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            <span className="flex items-center gap-1.5 font-mono px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300">
              <Users className="w-3 h-3 text-violet-400" />
              {onlineCount} online
            </span>
            <span
              className={`flex items-center gap-1.5 font-mono px-2 py-0.5 rounded border ${
                status === 'connected'
                  ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-300'
                  : status === 'connecting'
                  ? 'bg-amber-950/60 border-amber-700/60 text-amber-300'
                  : 'bg-slate-950 border-slate-700 text-slate-400'
              }`}
            >
              {status === 'offline' ? <WifiOff className="w-3 h-3" /> : <Wifi className="w-3 h-3" />}
              {connectionLabel}
            </span>
          </div>
        </div>

        <div className="relative rounded-xl overflow-hidden border border-slate-800 bg-slate-950/90 shadow-inner">
          <canvas
            ref={canvasRef}
            width={OFFICE.width}
            height={OFFICE.height}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            className="w-full h-auto block cursor-crosshair touch-none select-none"
          />

          {/* Zone headings — crisp React overlay mapped onto the world grid */}
          {ZONES.map((z) => {
            const Icon = ZONE_ICONS[z.icon] || Radio;
            return (
              <div
                key={z.id}
                className="absolute flex items-center gap-1.5 pointer-events-none"
                style={{ left: `${(z.x / OFFICE.width) * 100}%`, top: `${(z.y / OFFICE.height) * 100}%` }}
              >
                <span
                  className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-950/85 border backdrop-blur-sm"
                  style={{ borderColor: `rgba(${z.rgb},0.45)` }}
                >
                  <Icon className="w-3 h-3" style={{ color: `rgb(${z.rgb})` }} />
                  <span
                    className="font-bold text-[10px] sm:text-xs uppercase tracking-wide"
                    style={{ color: `rgb(${z.rgb})` }}
                  >
                    {z.label}
                  </span>
                </span>
              </div>
            );
          })}

          {/* Live coordinate overlay */}
          <div className="absolute top-2 left-2 text-[10px] font-mono text-slate-300 bg-slate-900/90 px-2 py-1 rounded border border-slate-800 flex items-center space-x-1.5 backdrop-blur-sm">
            <Navigation className="w-3 h-3 text-indigo-400" />
            <span>
              [{hud.x}, {hud.y}]
            </span>
            <span className="text-slate-500">·</span>
            <span>{hud.speed} px/s</span>
          </div>

          {/* WebRTC handshake diagnostics */}
          <div className="absolute top-10 left-2 text-[9px] font-mono text-amber-300 bg-slate-900/90 px-2 py-1 rounded border border-slate-800 backdrop-blur-sm max-w-[520px] truncate">
            RTC {pcDebug}
          </div>

          {/* Controls hint */}
          <div className="absolute top-2 right-2 text-[10px] text-slate-400 bg-slate-900/90 px-2.5 py-1.5 rounded-lg border border-slate-800 backdrop-blur-sm flex items-center gap-3">
            <span className="flex items-center gap-1">
              <Keyboard className="w-3 h-3 text-cyan-400" /> WASD / Arrows
            </span>
            <span className="flex items-center gap-1 hidden sm:flex">
              <MousePointer2 className="w-3 h-3 text-cyan-400" /> Click to walk
            </span>
          </div>

          {/* Colleagues in earshot — compact overlay */}
          <div className="absolute bottom-2 left-2 flex items-center space-x-2 bg-slate-900/95 px-2.5 py-1.5 rounded-lg border border-slate-800 backdrop-blur-sm">
            {hud.inEarshot ? (
              <>
                <Volume2 className="w-3.5 h-3.5 text-emerald-400 animate-bounce" />
                <div className="flex flex-col">
                  <span className="text-[10px] text-emerald-400 font-semibold leading-none">
                    {earshotPeers.length} colleague{earshotPeers.length !== 1 ? 's' : ''} in earshot
                  </span>
                  <span className="text-[9px] text-slate-400 font-mono mt-0.5">Proximity Gain: {hud.gain}%</span>
                </div>
              </>
            ) : (
              <>
                <VolumeX className="w-3.5 h-3.5 text-slate-500" />
                <div className="flex flex-col">
                  <span className="text-[10px] text-slate-400 font-medium leading-none">Out of Earshot</span>
                  <span className="text-[9px] text-slate-500 font-mono mt-0.5">Walk closer to talk</span>
                </div>
              </>
            )}
          </div>

          {/* Proximity groups (users within 100px) */}
          {nearby100.length > 0 && (
            <div className="absolute bottom-2 left-2 ml-[220px] flex items-center space-x-2 bg-slate-900/95 px-2.5 py-1.5 rounded-lg border border-slate-800 backdrop-blur-sm">
              <Radio className={`w-3.5 h-3.5 ${liveLinks > 0 ? 'text-cyan-400' : 'text-slate-500'}`} />
              <div className="flex flex-col">
                <span className="text-[10px] text-cyan-400 font-semibold leading-none">
                  {nearby100.length} user{nearby100.length !== 1 ? 's' : ''} within {EARSHOT}px
                </span>
                <span className={`text-[9px] mt-0.5 ${liveLinks > 0 ? 'text-emerald-300' : 'text-amber-300'}`}>
                  {liveLinks > 0
                    ? `${liveLinks} connected P2P audio link${liveLinks !== 1 ? 's' : ''}`
                    : connectingLinks > 0
                    ? 'WebRTC P2P connecting…'
                    : 'No P2P link yet'}
                </span>
              </div>
            </div>
          )}

          {/* Mic level meter + toggle */}
          <div className="absolute bottom-2 right-2 flex items-center gap-2">
            <div
              className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border backdrop-blur-sm text-[8px] font-semibold ${
                remoteAudible
                  ? 'bg-emerald-950/80 border-emerald-700/60 text-emerald-300'
                  : liveLinks > 0
                  ? 'bg-slate-900/95 border-slate-800 text-slate-300'
                  : 'bg-slate-900/95 border-slate-800 text-slate-500'
              }`}
              title="Whether audio received from nearby colleagues is actually playing"
            >
              <Volume2 className="w-3 h-3" />
              {remoteAudible ? 'HEARING' : liveLinks > 0 ? 'LINK UP' : 'NO REMOTE'}
            </div>
            <button
              type="button"
              onClick={resumeAudio}
              className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border backdrop-blur-sm text-[8px] font-semibold ${
                playbackBlocked
                  ? 'bg-rose-500/90 border-rose-400 text-slate-900 animate-pulse'
                  : audioReady
                  ? 'bg-slate-900/95 border-slate-800 text-emerald-400'
                  : 'bg-amber-500/90 border-amber-400 text-slate-900 animate-pulse'
              }`}
              title={
                playbackBlocked
                  ? 'Browser blocked playback — click to allow sound'
                  : audioReady
                  ? 'Audio output context running'
                  : 'Click to allow this tab to play sound'
              }
            >
              {playbackBlocked ? <VolumeX className="w-3 h-3" /> : audioReady ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
              {playbackBlocked ? 'BLOCKED · TAP' : audioReady ? 'OUTPUT OK' : 'TAP FOR AUDIO'}
            </button>
            <div
              className="flex items-center gap-1.5 bg-slate-900/95 px-2 py-1.5 rounded-lg border border-slate-800 backdrop-blur-sm"
              title={`Your microphone input level${micCaptured ? (muted ? ' — muted' : '') : ' — microphone not captured'}`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  !micCaptured ? 'bg-rose-500' : muted ? 'bg-amber-400' : speakingSelf ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'
                }`}
              />
              <div className="w-16 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-emerald-300 transition-[width] duration-75"
                  style={{ width: `${Math.round(selfLevel * 100)}%` }}
                />
              </div>
              <span className={`text-[9px] font-mono w-8 text-right ${!micCaptured ? 'text-rose-400' : 'text-slate-400'}`}>
                {!micCaptured ? 'NO MIC' : muted ? 'MUTE' : speakingSelf ? 'TALK' : 'IDLE'}
              </span>
            </div>
            <button
              type="button"
              onClick={handleTestTone}
              title="Send a test beep through the WebRTC link"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10px] font-semibold backdrop-blur-sm transition-colors cursor-pointer bg-cyan-950/70 border-cyan-700/60 text-cyan-300 hover:bg-cyan-900/70"
            >
              <Volume2 className="w-3.5 h-3.5" />
              Test
            </button>
            <button
              type="button"
              onClick={toggleMic}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10px] font-semibold backdrop-blur-sm transition-colors cursor-pointer ${
                muted
                  ? 'bg-rose-950/80 border-rose-600/60 text-rose-300'
                  : 'bg-emerald-950/80 border-emerald-600/60 text-emerald-300'
              }`}
            >
              {muted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
              {muted ? 'Muted' : 'Live'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 text-[10px]">
          <div className="p-2 rounded-lg bg-slate-950/70 border border-slate-800">
            <span className="text-slate-500 block">X Position</span>
            <span className="font-mono text-cyan-300 text-sm">{hud.x}px</span>
          </div>
          <div className="p-2 rounded-lg bg-slate-950/70 border border-slate-800">
            <span className="text-slate-500 block">Y Position</span>
            <span className="font-mono text-cyan-300 text-sm">{hud.y}px</span>
          </div>
          <div className="p-2 rounded-lg bg-slate-950/70 border border-slate-800">
            <span className="text-slate-500 block">Earshot Radius</span>
            <span className="font-mono text-indigo-300 text-sm">{EARSHOT_RADIUS}px</span>
          </div>
          <div className="p-2 rounded-lg bg-slate-950/70 border border-slate-800">
            <span className="text-slate-500 block">WebRTC Proximity</span>
            <span className="font-mono text-sm text-cyan-300">100px threshold</span>
          </div>
        </div>
      </div>
    </div>
  );
}