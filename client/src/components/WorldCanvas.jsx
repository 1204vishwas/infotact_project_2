import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Compass,
  Keyboard,
  MapPin,
  Mic,
  MicOff,
  MousePointer2,
  Navigation,
  Radio,
  Users,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff
} from 'lucide-react';
import useWorldSocket from '../hooks/useWorldSocket';

// ---------------------------------------------------------------------------
// World configuration — must mirror server/realtime/worldState.js OFFICE_BOUNDS
// ---------------------------------------------------------------------------
const OFFICE = { width: 1200, height: 720, padding: 48 };
const EARSHOT_RADIUS = 150; // 100-150px proximity "earshot" from the spec
const MAX_SPEED = 300; // px / second
const ACCELERATION = 2600; // px / second^2
const GRID_SIZE = 40;

// Static office zones (carpet + label) and desk furniture.
const ZONES = [
  { x: 60, y: 60, w: 340, h: 250, label: 'Developer Bay', rgb: '16,185,129' },
  { x: 440, y: 60, w: 320, h: 210, label: 'Spatial Audio Lab', rgb: '99,102,241' },
  { x: 800, y: 60, w: 340, h: 250, label: 'Product Pods', rgb: '245,158,11' },
  { x: 60, y: 350, w: 470, h: 310, label: 'Collaboration Hall', rgb: '6,182,212' },
  { x: 580, y: 350, w: 180, h: 310, label: 'Hallway', rgb: '100,116,139' },
  { x: 800, y: 350, w: 340, h: 310, label: 'Lounge & Coffee', rgb: '139,92,246' }
];

const DESKS = [
  { x: 100, y: 110, w: 80, h: 46 },
  { x: 210, y: 110, w: 80, h: 46 },
  { x: 100, y: 220, w: 80, h: 46 },
  { x: 210, y: 220, w: 80, h: 46 },
  { x: 480, y: 110, w: 110, h: 50 },
  { x: 620, y: 110, w: 110, h: 50 },
  { x: 840, y: 110, w: 80, h: 46 },
  { x: 950, y: 110, w: 80, h: 46 },
  { x: 840, y: 220, w: 80, h: 46 },
  { x: 950, y: 220, w: 80, h: 46 },
  { x: 100, y: 400, w: 120, h: 56 },
  { x: 260, y: 400, w: 120, h: 56 },
  { x: 840, y: 420, w: 120, h: 56 },
  { x: 1000, y: 420, w: 110, h: 56 }
];

// Demo colleagues used only while the realtime backend is unreachable so the
// canvas still demonstrates proximity behaviour offline.
const OFFLINE_BOTS = [
  { id: 'bot_aris', name: 'Dr. Aris Thorne', role: 'Audio Engineer', avatarColor: '#6366f1', home: { x: 600, y: 170 }, phase: 0.0, radius: 60 },
  { id: 'bot_priya', name: 'Priya Sharma', role: 'Developer', avatarColor: '#10b981', home: { x: 230, y: 185 }, phase: 2.1, radius: 45 },
  { id: 'bot_rohan', name: 'Rohan Mehta', role: 'Product Manager', avatarColor: '#f59e0b', home: { x: 920, y: 500 }, phase: 4.2, radius: 55 }
];

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

export default function WorldCanvas({ user, token, showToast }) {
  const canvasRef = useRef(null);
  const { peersRef, status, peers, onlineCount, sendMove, setMuted } = useWorldSocket({ user, token });

  const statusRef = useRef(status);
  const mutedRef = useRef(false);

  const [muted, setMutedState] = useState(false);
  const [hud, setHud] = useState({ x: 600, y: 360, inEarshot: false, gain: 0, speed: 0 });
  const [nearby, setNearby] = useState([]);

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

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const toggleMic = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMutedState(next);
    setMuted(next);
    if (showToast) showToast(next ? 'Microphone muted across earshot.' : 'Microphone live — broadcasting spatially.', next ? 'info' : 'success');
  }, [setMuted, showToast]);

  // -------------------------------------------------------------------------
  // Input handlers — keyboard (WASD / arrows) + mouse/pointer click-to-move
  // -------------------------------------------------------------------------
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

  // -------------------------------------------------------------------------
  // Animation + rendering loop (imperative canvas, reads refs at 60fps)
  // -------------------------------------------------------------------------
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
      const bg = ctx.createLinearGradient(0, 0, OFFICE.width, OFFICE.height);
      bg.addColorStop(0, '#0b1120');
      bg.addColorStop(1, '#0f172a');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, OFFICE.width, OFFICE.height);

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
        ctx.strokeStyle = `rgba(${z.rgb},0.25)`;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 6]);
        drawRoundRect(z.x, z.y, z.w, z.h, 16);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = `rgba(${z.rgb},0.55)`;
        ctx.font = 'bold 13px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(z.label.toUpperCase(), z.x + 14, z.y + 24);
      });
    };

    const drawFurniture = () => {
      DESKS.forEach((d) => {
        ctx.fillStyle = 'rgba(30,41,59,0.85)';
        ctx.strokeStyle = 'rgba(71,85,105,0.7)';
        ctx.lineWidth = 1;
        drawRoundRect(d.x, d.y, d.w, d.h, 8);
        ctx.fill();
        ctx.stroke();

        // Monitor / desk highlight
        ctx.fillStyle = 'rgba(56,189,248,0.16)';
        drawRoundRect(d.x + 12, d.y + 10, d.w - 24, 6, 3);
        ctx.fill();
      });

      // Office perimeter walls
      ctx.strokeStyle = 'rgba(148,163,184,0.35)';
      ctx.lineWidth = 4;
      drawRoundRect(6, 6, OFFICE.width - 12, OFFICE.height - 12, 20);
      ctx.stroke();
    };

    const drawAvatar = (a, isSelf) => {
      const radius = isSelf ? 18 : 15;
      const color = a.avatarColor || '#6366f1';

      if (a.status === 'in-meeting') {
        ctx.beginPath();
        ctx.arc(a.x, a.y, radius + 4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(244,63,94,0.18)';
        ctx.fill();
      }

      // Soft glow halo
      const glow = ctx.createRadialGradient(a.x, a.y, 2, a.x, a.y, radius * 2.4);
      glow.addColorStop(0, hexToRgba(color, 0.5));
      glow.addColorStop(1, hexToRgba(color, 0));
      ctx.beginPath();
      ctx.arc(a.x, a.y, radius * 2.4, 0, Math.PI * 2);
      ctx.fillStyle = glow;
      ctx.fill();

      // Body
      ctx.beginPath();
      ctx.arc(a.x, a.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = isSelf ? 3 : 2;
      ctx.strokeStyle = isSelf ? '#f8fafc' : 'rgba(248,250,252,0.75)';
      ctx.stroke();

      // Initial
      ctx.fillStyle = '#0b1120';
      ctx.font = `bold ${isSelf ? 14 : 12}px "Plus Jakarta Sans", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText((a.name || '?').charAt(0).toUpperCase(), a.x, a.y + 1);

      // Direction pointer for the local avatar
      if (isSelf && (Math.abs(a.vx || 0) > 8 || Math.abs(a.vy || 0) > 8)) {
        const fx = a.x + Math.cos(a.facing) * (radius + 7);
        const fy = a.y + Math.sin(a.facing) * (radius + 7);
        ctx.beginPath();
        ctx.arc(fx, fy, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = '#e2e8f0';
        ctx.fill();
      }

      // Name plate
      const label = isSelf ? `${a.name || 'You'} (you)` : a.name || 'Colleague';
      ctx.font = 'bold 12px "Plus Jakarta Sans", sans-serif';
      ctx.textBaseline = 'alphabetic';
      const textWidth = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(2,6,23,0.78)';
      drawRoundRect(a.x - textWidth / 2 - 7, a.y + radius + 7, textWidth + 14, 18, 6);
      ctx.fill();
      ctx.fillStyle = isSelf ? '#f8fafc' : '#cbd5e1';
      ctx.fillText(label, a.x, a.y + radius + 20);

      // Role tag
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

      // ----- gather all remote avatars -----
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

      // Earshot radius around the local avatar
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
        setHud({
          x: Math.round(self.x),
          y: Math.round(self.y),
          speed: Math.round(speed),
          gain: ranked.length && ranked[0].inEarshot ? ranked[0].gain : 0,
          inEarshot: ranked.some((p) => p.inEarshot)
        });
      }

      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [peersRef, sendMove, user]);

  const connectionLabel = useMemo(() => {
    if (status === 'connected') return 'Realtime Sync Live';
    if (status === 'connecting') return 'Connecting to World...';
    return 'Offline · Local Simulation';
  }, [status]);

  const earshotPeers = nearby.filter((p) => p.inEarshot);

  return (
    <div className="w-full grid grid-cols-1 xl:grid-cols-12 gap-5">
      {/* ----------------------------- WORLD ----------------------------- */}
      <div className="xl:col-span-8 relative bg-slate-900/80 rounded-2xl border border-slate-800 p-4 shadow-2xl backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800/80">
          <div className="flex items-center space-x-2">
            <Activity className="w-4 h-4 text-cyan-400 animate-pulse" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Infotact Virtual Office · Canvas World
            </h3>
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

        <div className="relative mt-3 rounded-xl overflow-hidden border border-slate-800 bg-slate-950/90 shadow-inner">
          <canvas
            ref={canvasRef}
            width={OFFICE.width}
            height={OFFICE.height}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            className="w-full h-auto block cursor-crosshair touch-none select-none"
          />

          {/* Live coordinate overlay */}
          <div className="absolute top-2 left-2 text-[10px] font-mono text-slate-300 bg-slate-900/90 px-2 py-1 rounded border border-slate-800 flex items-center space-x-1.5 backdrop-blur-sm">
            <Navigation className="w-3 h-3 text-indigo-400" />
            <span>
              [{hud.x}, {hud.y}]
            </span>
            <span className="text-slate-500">·</span>
            <span>{hud.speed} px/s</span>
          </div>

          {/* Controls hint */}
          <div className="absolute top-2 right-2 text-[10px] text-slate-400 bg-slate-900/90 px-2.5 py-1.5 rounded-lg border border-slate-800 backdrop-blur-sm flex items-center gap-3">
            <span className="flex items-center gap-1">
              <Keyboard className="w-3 h-3 text-cyan-400" /> WASD / Arrows
            </span>
            <span className="flex items-center gap-1">
              <MousePointer2 className="w-3 h-3 text-cyan-400" /> Click to walk
            </span>
          </div>

          {/* Earshot / audio gain indicator */}
          <div className="absolute bottom-2 left-2 flex items-center space-x-2 bg-slate-900/95 px-2.5 py-1.5 rounded-lg border border-slate-800 backdrop-blur-sm">
            {hud.inEarshot ? (
              <>
                <Volume2 className="w-3.5 h-3.5 text-emerald-400 animate-bounce" />
                <div className="flex flex-col">
                  <span className="text-[10px] text-emerald-400 font-semibold leading-none">
                    Earshot Active ({earshotPeers.length} nearby)
                  </span>
                  <span className="text-[9px] text-slate-400 font-mono">Proximity Gain: {hud.gain}%</span>
                </div>
              </>
            ) : (
              <>
                <VolumeX className="w-3.5 h-3.5 text-slate-500" />
                <div className="flex flex-col">
                  <span className="text-[10px] text-slate-400 font-medium leading-none">Out of Earshot</span>
                  <span className="text-[9px] text-slate-500 font-mono">Proximity Gain: 0%</span>
                </div>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={toggleMic}
            className={`absolute bottom-2 right-2 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10px] font-semibold backdrop-blur-sm transition-colors cursor-pointer ${
              muted
                ? 'bg-rose-950/80 border-rose-600/60 text-rose-300'
                : 'bg-emerald-950/80 border-emerald-600/60 text-emerald-300'
            }`}
          >
            {muted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
            {muted ? 'Muted' : 'Live'}
          </button>
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
            <span className="text-slate-500 block">Broadcast</span>
            <span className={`font-mono text-sm ${status === 'connected' ? 'text-emerald-300' : 'text-amber-300'}`}>
              {status === 'connected' ? 'Streaming' : 'Local'}
            </span>
          </div>
        </div>
      </div>

      {/* --------------------------- SIDEBAR ---------------------------- */}
      <div className="xl:col-span-4 space-y-4">
        <div className="bg-slate-900/80 rounded-2xl border border-slate-800 p-5 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 mb-4">
            <div className="flex items-center space-x-2">
              <Compass className="w-4 h-4 text-indigo-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">Colleagues Nearby</h3>
            </div>
            <span className="text-[10px] font-mono text-slate-500">{peers.length + (status === 'offline' ? OFFLINE_BOTS.length : 0)} in world</span>
          </div>

          {nearby.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">
              No colleagues in the office yet. Move around or invite your team to join the world.
            </p>
          ) : (
            <ul className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
              {nearby.map((p) => (
                <li
                  key={p.id}
                  className={`flex items-center justify-between p-2.5 rounded-xl border transition-colors ${
                    p.inEarshot ? 'bg-emerald-950/30 border-emerald-600/40' : 'bg-slate-950/60 border-slate-800'
                  }`}
                >
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <span
                      className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-bold text-slate-950"
                      style={{ backgroundColor: p.avatarColor }}
                    >
                      {(p.name || '?').charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-200 truncate">{p.name}</p>
                      <p className="text-[10px] text-slate-500 truncate">
                        {p.role} · {p.distance}px
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {p.inEarshot ? (
                      <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                        <Volume2 className="w-3 h-3" />
                        {p.gain}%
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono text-slate-600">muted</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-slate-900/80 rounded-2xl border border-slate-800 p-5 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center space-x-2 pb-3 border-b border-slate-800/80 mb-4">
            <Radio className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">Coordinate Broadcasting</h3>
          </div>
          <ul className="space-y-2 text-[11px] text-slate-400">
            <li className="flex items-start gap-2">
              <MapPin className="w-3.5 h-3.5 text-indigo-400 mt-0.5 shrink-0" />
              Movement is broadcast to the Socket.io world layer &amp; persisted to the MongoDB <code className="text-cyan-400 font-mono">2d</code> geospatial index.
            </li>
            <li className="flex items-start gap-2">
              <Volume2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
              Entering the {EARSHOT_RADIUS}px earshot crossfades peer audio via the Web Audio API.
            </li>
            <li className="flex items-start gap-2">
              <Keyboard className="w-3.5 h-3.5 text-cyan-400 mt-0.5 shrink-0" />
              Hold <span className="text-slate-200 font-mono">WASD</span>/arrows for fluid movement, or click anywhere on the floor to walk over.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
