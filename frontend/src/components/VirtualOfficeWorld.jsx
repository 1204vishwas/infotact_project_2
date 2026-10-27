import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Navigation,
  Users,
  Compass,
  Radio,
  Sparkles,
  MousePointer,
  Keyboard,
  Maximize2,
  Minimize2,
  RotateCcw,
  ExternalLink,
  ShieldAlert,
  Headphones,
  Layers,
  ShieldCheck,
  Activity,
  X,
  CheckCircle2
} from 'lucide-react';

export default function VirtualOfficeWorld({ user, onBackToDashboard, showToast }) {
  const canvasRef = useRef(null);
  const socketRef = useRef(null);

  // Canvas dimensions
  const WORLD_WIDTH = 960;
  const WORLD_HEIGHT = 640;

  // Local avatar state
  const [coords, setCoords] = useState({ x: 480, y: 320 });
  const [currentZone, setCurrentZone] = useState('Central Office');
  const [earshotRadius, setEarshotRadius] = useState(100); // 100-pixel WebRTC proximity radius constraint
  const [micMuted, setMicMuted] = useState(false);
  const [onlineCount, setOnlineCount] = useState(1);
  const [peersInEarshot, setPeersInEarshot] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('connecting'); // 'connected' | 'connecting' | 'offline'
  const [proximityGroups, setProximityGroups] = useState([]);
  const [isGroupsModalOpen, setIsGroupsModalOpen] = useState(false);
  const [recentWebRTCAlert, setRecentWebRTCAlert] = useState(null);

  // Refs for animation loop & physics to avoid stale closures
  const posRef = useRef({ x: 480, y: 320, vx: 0, vy: 0, targetX: null, targetY: null });
  const keysRef = useRef({ w: false, a: false, s: false, d: false, ArrowUp: false, ArrowLeft: false, ArrowDown: false, ArrowRight: false });
  const peersRef = useRef(new Map()); // socketId -> { name, role, avatarColor, x, y, targetX, targetY, micMuted }
  const lastEmitTime = useRef(0);
  const reticleRef = useRef(null); // click target visual ripple { x, y, opacity, size }

  // Office World Zones
  const zones = [
    {
      id: 'audio-lab',
      name: 'Spatial Audio Lab',
      x: 30,
      y: 30,
      width: 420,
      height: 260,
      bg: 'rgba(99, 102, 241, 0.08)',
      border: 'rgba(99, 102, 241, 0.3)',
      tagColor: '#818cf8',
      icon: '🎧'
    },
    {
      id: 'engineering-bay',
      name: 'Core WebRTC Bay',
      x: 510,
      y: 30,
      width: 420,
      height: 260,
      bg: 'rgba(16, 185, 129, 0.08)',
      border: 'rgba(16, 185, 129, 0.3)',
      tagColor: '#34d399',
      icon: '💻'
    },
    {
      id: 'product-hub',
      name: 'Product & Design Hub',
      x: 30,
      y: 350,
      width: 420,
      height: 260,
      bg: 'rgba(245, 158, 11, 0.08)',
      border: 'rgba(245, 158, 11, 0.3)',
      tagColor: '#fbbf24',
      icon: '💡'
    },
    {
      id: 'lounge-pantry',
      name: 'Breakout Lounge & Water Cooler',
      x: 510,
      y: 350,
      width: 420,
      height: 260,
      bg: 'rgba(236, 72, 153, 0.08)',
      border: 'rgba(236, 72, 153, 0.3)',
      tagColor: '#f472b6',
      icon: '☕'
    }
  ];

  // Office Desks & Obstacles with collision bounds
  const obstacles = [
    // Audio Lab Consoles
    { x: 100, y: 90, width: 110, height: 50, label: '3D Mixing Station', color: '#1e293b' },
    { x: 270, y: 90, width: 110, height: 50, label: 'Audio DSP Rack', color: '#1e293b' },
    // Engineering Desks
    { x: 570, y: 90, width: 120, height: 50, label: 'WebRTC Cluster A', color: '#1e293b' },
    { x: 750, y: 90, width: 120, height: 50, label: 'WebSocket Cluster B', color: '#1e293b' },
    { x: 570, y: 190, width: 120, height: 50, label: 'Canvas Rendering Dev', color: '#1e293b' },
    { x: 750, y: 190, width: 120, height: 50, label: 'MongoDB Geospatial', color: '#1e293b' },
    // Product Conference Table
    { x: 130, y: 440, width: 180, height: 70, label: 'Sprint Roadmap Island', color: '#1e293b' },
    // Lounge Coffee Bar & Couches
    { x: 670, y: 440, width: 160, height: 60, label: 'Infotact Coffee Bar', color: '#1e293b' }
  ];

  // Detect current zone based on coordinates
  const getZoneAt = (x, y) => {
    for (const z of zones) {
      if (x >= z.x && x <= z.x + z.width && y >= z.y && y <= z.y + z.height) {
        return `${z.icon} ${z.name}`;
      }
    }
    return '🏢 Central Concourse';
  };

  // ====================================================
  // 1. SETUP SOCKET.IO WEBSOCKET CONNECTION
  // ====================================================
  useEffect(() => {
    const socket = io('/', {
      transports: ['websocket', 'polling']
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnectionStatus('connected');
      console.log('[ProxiSpeak Client] Connected to signaling server:', socket.id);

      // Join space with current user profile
      const initialLocation = [posRef.current.x, posRef.current.y];
      socket.emit('join-space', {
        id: user?.id || user?._id,
        name: user?.name || 'ProxiSpeak Member',
        username: user?.username || 'user',
        role: user?.role || 'Developer',
        avatarColor: user?.avatarColor || '#6366f1',
        location: initialLocation
      });
    });

    socket.on('connect_error', () => {
      setConnectionStatus('offline');
    });

    socket.on('disconnect', () => {
      setConnectionStatus('offline');
    });

    // Receive existing peer avatars in the office space
    socket.on('space-state', (data) => {
      const { peers, totalOnline } = data;
      setOnlineCount(totalOnline || 1);
      const newMap = new Map();
      peers.forEach((p) => {
        newMap.set(p.socketId, {
          socketId: p.socketId,
          userId: p.userId,
          name: p.name,
          role: p.role,
          avatarColor: p.avatarColor,
          x: p.location[0],
          y: p.location[1],
          targetX: p.location[0],
          targetY: p.location[1],
          micMuted: p.micMuted
        });
      });
      peersRef.current = newMap;
    });

    // Remote peer joined space
    socket.on('user-joined', (p) => {
      peersRef.current.set(p.socketId, {
        socketId: p.socketId,
        userId: p.userId,
        name: p.name,
        role: p.role,
        avatarColor: p.avatarColor,
        x: p.location[0],
        y: p.location[1],
        targetX: p.location[0],
        targetY: p.location[1],
        micMuted: p.micMuted
      });
      setOnlineCount(peersRef.current.size + 1);
      showToast(`${p.name} joined the virtual office!`, 'info');
    });

    // Remote peer moved (update target position for smooth interpolation)
    socket.on('user-moved', (movement) => {
      const peer = peersRef.current.get(movement.socketId);
      if (peer) {
        peer.targetX = movement.location[0];
        peer.targetY = movement.location[1];
      }
    });

    // Remote peer audio changed
    socket.on('user-audio-changed', (change) => {
      const peer = peersRef.current.get(change.socketId);
      if (peer) {
        peer.micMuted = change.micMuted;
      }
    });

    // Remote peer left
    socket.on('user-left', (leaving) => {
      peersRef.current.delete(leaving.socketId);
      setOnlineCount(peersRef.current.size + 1);
      showToast(`${leaving.name || 'A teammate'} left the office.`, 'info');
    });

    // ====================================================
    // WebRTC 100-PIXEL PROXIMITY GATEKEEPER & SIGNALING EVENTS
    // ====================================================
    // Peer entered 100-pixel radius (Server permitted WebRTC offer)
    socket.on('proximity-peer-entered', ({ peer, distance, maxRadius, gain, shouldInitiateOffer }) => {
      console.log(`[WebRTC Proximity] '${peer.name}' entered 100px earshot (${distance}px). Should offer: ${shouldInitiateOffer}`);
      setRecentWebRTCAlert({
        type: 'entered',
        peerName: peer.name,
        distance,
        gain,
        timestamp: Date.now()
      });
      showToast(`🎧 ${peer.name} entered 100px earshot (${distance}px)! WebRTC audio active (${gain}% gain).`, 'success');

      // Deterministic handshake trigger: only one peer initiates to prevent signaling glare
      if (shouldInitiateOffer) {
        socket.emit('webrtc-offer', {
          targetSocketId: peer.socketId,
          offer: {
            type: 'offer',
            sdp: `v=0\r\no=ProxiSpeak ${Date.now()} 2 IN IP4 127.0.0.1\r\ns=SpatialAudioMesh\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=rtpmap:111 opus/48000/2`
          }
        });
      }
    });

    // Peer moved outside 100-pixel radius (Server closes WebRTC audio channel)
    socket.on('proximity-peer-left', ({ peerName, distance, maxRadius }) => {
      console.log(`[WebRTC Proximity] '${peerName}' left 100px earshot (${distance}px).`);
      setRecentWebRTCAlert({
        type: 'left',
        peerName,
        distance,
        timestamp: Date.now()
      });
      showToast(`🔇 ${peerName} moved beyond 100px radius (${distance}px). WebRTC audio disconnected.`, 'info');
    });

    // Received WebRTC Offer (Verified by server within 100-pixel radius)
    socket.on('webrtc-offer', ({ callerSocketId, callerUser, offer, proximity }) => {
      console.log(`[WebRTC Proximity] Received verified offer from ${callerUser?.name} (${proximity.distance}px <= 100px).`);
      // Reply with WebRTC answer through backend proximity gatekeeper
      socket.emit('webrtc-answer', {
        targetSocketId: callerSocketId,
        answer: {
          type: 'answer',
          sdp: `v=0\r\no=ProxiSpeak ${Date.now()} 2 IN IP4 127.0.0.1\r\ns=SpatialAudioMeshAnswer\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=rtpmap:111 opus/48000/2`
        }
      });
    });

    // Received WebRTC Answer (Verified by server within 100-pixel radius)
    socket.on('webrtc-answer', ({ calleeSocketId, calleeUser, answer, proximity }) => {
      console.log(`[WebRTC Proximity] WebRTC audio mesh handshake completed with ${calleeUser?.name} (${proximity.distance}px).`);
    });

    // WebRTC Signal Rejected: Peer is beyond 100-pixel radius
    socket.on('webrtc-signal-rejected', ({ type, targetName, distance, maxRadius, message }) => {
      console.warn(`[WebRTC Proximity Guard] Rejected: ${message}`);
      setRecentWebRTCAlert({
        type: 'blocked',
        peerName: targetName,
        distance,
        timestamp: Date.now()
      });
      showToast(`🚫 WebRTC ${type.toUpperCase()} Blocked: ${targetName} is ${distance}px away (Exceeds ${maxRadius}px limit).`, 'error');
    });

    // MongoDB $near query grouping update
    socket.on('proximity-groups-updated', (groupsData) => {
      if (groupsData && groupsData.clusters) {
        setProximityGroups(groupsData.clusters);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [user]);

  // ====================================================
  // 2. KEYBOARD CONTROLS (WASD & ARROWS)
  // ====================================================
  useEffect(() => {
    const handleKeyDown = (e) => {
      const key = e.key;
      if (['w', 'a', 's', 'd', 'W', 'A', 'S', 'D', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'].includes(key)) {
        // Prevent page scrolling on arrow keys
        e.preventDefault();
        keysRef.current[key.toLowerCase()] = true;
        // Keyboard overrides mouse target
        posRef.current.targetX = null;
        posRef.current.targetY = null;
        reticleRef.current = null;
      }
    };

    const handleKeyUp = (e) => {
      const key = e.key;
      if (['w', 'a', 's', 'd', 'W', 'A', 'S', 'D', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'].includes(key)) {
        keysRef.current[key.toLowerCase()] = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // ====================================================
  // 3. MOUSE CLICK-TO-MOVE CONTROLS
  // ====================================================
  const handleCanvasClick = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const clickX = Math.round((e.clientX - rect.left) * scaleX);
    const clickY = Math.round((e.clientY - rect.top) * scaleY);

    // Set target waypoint for smooth walking
    posRef.current.targetX = clickX;
    posRef.current.targetY = clickY;

    // Visual ripple effect at clicked coordinates
    reticleRef.current = {
      x: clickX,
      y: clickY,
      radius: 6,
      maxRadius: 24,
      opacity: 1
    };
  };

  // Toggle mic mute state and broadcast
  const handleToggleMic = () => {
    const newMuted = !micMuted;
    setMicMuted(newMuted);
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('audio-state-change', {
        micMuted: newMuted,
        deafened: false
      });
    }
    showToast(newMuted ? 'Microphone muted' : 'Microphone unmuted (Earshot broadcasting active)', 'info');
  };

  // Spawn local simulation peer for testing proximity (in-range or out-of-range)
  const handleSpawnTestPeer = (forceOutOfRange = false) => {
    const fakeId = `test_bot_${Date.now()}`;
    const botColors = ['#f43f5e', '#06b6d4', '#10b981', '#f59e0b', '#8b5cf6'];
    const botColor = botColors[Math.floor(Math.random() * botColors.length)];

    // If forceOutOfRange is true, spawn at 180px away (beyond 100px limit)
    // Otherwise spawn within 65-85px (inside 100px limit)
    const distanceOffset = forceOutOfRange ? 160 : 70;
    const randomAngle = Math.random() * Math.PI * 2;
    const randomX = Math.round(posRef.current.x + Math.cos(randomAngle) * distanceOffset);
    const randomY = Math.round(posRef.current.y + Math.sin(randomAngle) * distanceOffset);

    const botName = forceOutOfRange
      ? `Out-of-Range Peer #${peersRef.current.size + 1}`
      : `Nearby Colleague #${peersRef.current.size + 1}`;

    peersRef.current.set(fakeId, {
      socketId: fakeId,
      userId: fakeId,
      name: botName,
      role: forceOutOfRange ? 'Product Lead' : 'Audio Engineer',
      avatarColor: botColor,
      x: randomX,
      y: randomY,
      targetX: randomX,
      targetY: randomY,
      micMuted: false
    });
    setOnlineCount(peersRef.current.size + 1);

    if (forceOutOfRange) {
      showToast(`Spawned out-of-range peer (~160px). WebRTC offers will be blocked by backend gatekeeper!`, 'info');
    } else {
      showToast(`Spawned peer in earshot (~70px)! WebRTC offers permitted (100px limit).`, 'success');
      // Test sending offer to this newly spawned peer to demonstrate gatekeeper
      if (socketRef.current && socketRef.current.connected) {
        socketRef.current.emit('webrtc-offer', {
          targetSocketId: fakeId,
          offer: { type: 'offer', sdp: 'v=0...' }
        });
      }
    }
  };

  // Test sending a WebRTC offer through backend gatekeeper
  const handleTestWebRTCOffer = (targetSocketId) => {
    if (!socketRef.current || !socketRef.current.connected) return;
    const target = peersRef.current.get(targetSocketId);
    showToast(`Transmitting WebRTC offer to ${target?.name || 'peer'} through backend gatekeeper...`, 'info');
    socketRef.current.emit('webrtc-offer', {
      targetSocketId,
      offer: {
        type: 'offer',
        sdp: `v=0\r\no=ProxiSpeakTest ${Date.now()} 2 IN IP4 127.0.0.1\r\ns=SpatialAudio\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111`
      }
    });
  };

  // Fetch MongoDB $near proximity groups
  const handleOpenProximityGroups = async () => {
    try {
      const res = await fetch('/api/spatial/groups?radius=100');
      const data = await res.json();
      if (data.success) {
        setProximityGroups(data.clusters || []);
      }
    } catch (e) {
      if (socketRef.current) socketRef.current.emit('get-proximity-groups');
    }
    setIsGroupsModalOpen(true);
  };

  // Reset avatar position
  const handleResetPosition = () => {
    posRef.current.x = 480;
    posRef.current.y = 320;
    posRef.current.vx = 0;
    posRef.current.vy = 0;
    posRef.current.targetX = null;
    posRef.current.targetY = null;
    setCoords({ x: 480, y: 320 });
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('avatar-move', { x: 480, y: 320, isMoving: false });
    }
  };

  // ====================================================
  // 4. HIGH-PERFORMANCE 60 FPS CANVAS RENDERING LOOP
  // ====================================================
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationFrameId;
    let time = 0;

    const render = () => {
      time += 0.03;
      ctx.clearRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

      // --- A. DRAW OFFICE FLOOR & GRID ---
      ctx.fillStyle = '#0a0f1d';
      ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

      // Grid lines
      ctx.strokeStyle = '#131b2e';
      ctx.lineWidth = 1;
      const gridSize = 40;
      for (let x = 0; x < WORLD_WIDTH; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, WORLD_HEIGHT);
        ctx.stroke();
      }
      for (let y = 0; y < WORLD_HEIGHT; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(WORLD_WIDTH, y);
        ctx.stroke();
      }

      // --- B. DRAW OFFICE ZONES ---
      zones.forEach((z) => {
        ctx.fillStyle = z.bg;
        ctx.fillRect(z.x, z.y, z.width, z.height);

        ctx.strokeStyle = z.border;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 6]);
        ctx.strokeRect(z.x, z.y, z.width, z.height);
        ctx.setLineDash([]);

        // Zone header tag
        ctx.fillStyle = z.tagColor;
        ctx.font = 'bold 12px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`${z.icon} ${z.name.toUpperCase()}`, z.x + 14, z.y + 24);
      });

      // --- C. DRAW CENTRAL CONFERENCE CIRCLE ---
      const centerX = WORLD_WIDTH / 2;
      const centerY = WORLD_HEIGHT / 2;
      ctx.beginPath();
      ctx.arc(centerX, centerY, 48, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(30, 41, 59, 0.6)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.4)';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Main Round Table', centerX, centerY + 4);

      // --- D. DRAW DESKS & OBSTACLES ---
      obstacles.forEach((obs) => {
        // Drop shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.fillRect(obs.x + 3, obs.y + 3, obs.width, obs.height);

        // Desk body
        ctx.fillStyle = obs.color;
        ctx.fillRect(obs.x, obs.y, obs.width, obs.height);

        // Border
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(obs.x, obs.y, obs.width, obs.height);

        // Desk label
        ctx.fillStyle = '#cbd5e1';
        ctx.font = '10px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(obs.label, obs.x + obs.width / 2, obs.y + obs.height / 2 + 3);
      });

      // --- E. UPDATE LOCAL AVATAR PHYSICS ---
      const pos = posRef.current;
      const keys = keysRef.current;
      const ACCELERATION = 0.85;
      const FRICTION = 0.82;
      const MAX_SPEED = 4.2;

      let ax = 0;
      let ay = 0;

      // Keyboard input calculation
      if (keys.w || keys.arrowup) ay -= 1;
      if (keys.s || keys.arrowdown) ay += 1;
      if (keys.a || keys.arrowleft) ax -= 1;
      if (keys.d || keys.arrowright) ax += 1;

      // Normalize diagonal keyboard velocity
      if (ax !== 0 && ay !== 0) {
        ax *= 0.7071;
        ay *= 0.7071;
      }

      // Mouse waypoint navigation
      if (pos.targetX !== null && pos.targetY !== null && ax === 0 && ay === 0) {
        const dx = pos.targetX - pos.x;
        const dy = pos.targetY - pos.y;
        const distToTarget = Math.sqrt(dx * dx + dy * dy);

        if (distToTarget > 4) {
          ax = (dx / distToTarget);
          ay = (dy / distToTarget);
        } else {
          // Arrived at target
          pos.targetX = null;
          pos.targetY = null;
          reticleRef.current = null;
        }
      }

      // Apply acceleration & damping
      pos.vx = (pos.vx + ax * ACCELERATION) * FRICTION;
      pos.vy = (pos.vy + ay * ACCELERATION) * FRICTION;

      // Clamp speed
      const speed = Math.sqrt(pos.vx * pos.vx + pos.vy * pos.vy);
      if (speed > MAX_SPEED) {
        pos.vx = (pos.vx / speed) * MAX_SPEED;
        pos.vy = (pos.vy / speed) * MAX_SPEED;
      }

      // Next position candidate
      let nextX = pos.x + pos.vx;
      let nextY = pos.y + pos.vy;

      // Boundary collision (world edges)
      const AVATAR_RADIUS = 16;
      nextX = Math.max(AVATAR_RADIUS + 8, Math.min(WORLD_WIDTH - AVATAR_RADIUS - 8, nextX));
      nextY = Math.max(AVATAR_RADIUS + 8, Math.min(WORLD_HEIGHT - AVATAR_RADIUS - 8, nextY));

      // Obstacle collision resolution (soft pushout)
      obstacles.forEach((obs) => {
        const closestX = Math.max(obs.x, Math.min(nextX, obs.x + obs.width));
        const closestY = Math.max(obs.y, Math.min(nextY, obs.y + obs.height));
        const distX = nextX - closestX;
        const distY = nextY - closestY;
        const dist = Math.sqrt(distX * distX + distY * distY);

        if (dist < AVATAR_RADIUS) {
          const overlap = AVATAR_RADIUS - dist;
          if (dist > 0) {
            nextX += (distX / dist) * overlap;
            nextY += (distY / dist) * overlap;
          } else {
            nextX += overlap;
          }
        }
      });

      pos.x = nextX;
      pos.y = nextY;

      // Update state for UI display
      setCoords({ x: Math.round(pos.x), y: Math.round(pos.y) });
      setCurrentZone(getZoneAt(pos.x, pos.y));

      // --- F. BROADCAST MOVEMENT VIA WEBSOCKET (Throttled ~35ms) ---
      const isMoving = Math.abs(pos.vx) > 0.1 || Math.abs(pos.vy) > 0.1;
      const now = performance.now();
      if ((isMoving || (pos.targetX === null && lastEmitTime.current !== 0)) && now - lastEmitTime.current > 35) {
        if (socketRef.current && socketRef.current.connected) {
          socketRef.current.emit('avatar-move', {
            x: pos.x,
            y: pos.y,
            isMoving
          });
        }
        lastEmitTime.current = isMoving ? now : 0;
      }

      // --- G. DRAW MOUSE TARGET RIPPLE IF ACTIVE ---
      if (reticleRef.current) {
        const ret = reticleRef.current;
        ret.radius += 0.5;
        ret.opacity -= 0.025;
        if (ret.opacity > 0) {
          ctx.beginPath();
          ctx.arc(ret.x, ret.y, ret.radius, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(56, 189, 248, ${ret.opacity})`;
          ctx.lineWidth = 2;
          ctx.stroke();

          // Target center dot
          ctx.beginPath();
          ctx.arc(ret.x, ret.y, 2.5, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(56, 189, 248, ${ret.opacity})`;
          ctx.fill();
        } else {
          reticleRef.current = null;
        }
      }

      // --- H. CALCULATE EARSHOT PROXIMITY TO REMOTE PEERS ---
      const activePeersInRadius = [];
      const peers = peersRef.current;

      peers.forEach((peer) => {
        // Smooth linear interpolation (lerp) for remote peer movement
        peer.x += (peer.targetX - peer.x) * 0.22;
        peer.y += (peer.targetY - peer.y) * 0.22;

        const dx = peer.x - pos.x;
        const dy = peer.y - pos.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance <= earshotRadius) {
          const gain = Math.round((1 - distance / earshotRadius) * 100);
          activePeersInRadius.push({
            name: peer.name,
            role: peer.role,
            distance: Math.round(distance),
            gain: Math.max(10, Math.min(100, gain))
          });

          // Draw active sound wave connection line between peers
          ctx.beginPath();
          ctx.moveTo(pos.x, pos.y);
          ctx.lineTo(peer.x, peer.y);
          ctx.strokeStyle = `rgba(16, 185, 129, ${0.35 + (gain / 100) * 0.45})`;
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 4]);
          ctx.stroke();
          ctx.setLineDash([]);

          // Animated acoustic pulse ring at midpoint
          const midX = (pos.x + peer.x) / 2;
          const midY = (pos.y + peer.y) / 2;
          const waveRadius = (time * 18) % 28;
          ctx.beginPath();
          ctx.arc(midX, midY, waveRadius, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(56, 189, 248, ${0.6 - waveRadius / 28})`;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      });

      setPeersInEarshot(activePeersInRadius);

      // --- I. DRAW USER'S EARSHOT PROXIMITY RADIUS ---
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, earshotRadius, 0, Math.PI * 2);
      ctx.strokeStyle = activePeersInRadius.length > 0 ? 'rgba(16, 185, 129, 0.45)' : 'rgba(99, 102, 241, 0.25)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 5]);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = activePeersInRadius.length > 0 ? 'rgba(16, 185, 129, 0.05)' : 'rgba(99, 102, 241, 0.03)';
      ctx.fill();

      // --- J. DRAW REMOTE PEER AVATARS ---
      peers.forEach((peer) => {
        // Shadow
        ctx.beginPath();
        ctx.arc(peer.x + 2, peer.y + 2, AVATAR_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fill();

        // Avatar body
        ctx.beginPath();
        ctx.arc(peer.x, peer.y, AVATAR_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = peer.avatarColor || '#10b981';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Initial letter
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText((peer.name || 'U').charAt(0).toUpperCase(), peer.x, peer.y + 4);

        // Name tag & role
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 10px "Plus Jakarta Sans", sans-serif';
        ctx.fillText(peer.name.split(' ')[0], peer.x, peer.y + 28);

        ctx.fillStyle = '#94a3b8';
        ctx.font = '9px "Plus Jakarta Sans", sans-serif';
        ctx.fillText(peer.role || 'Member', peer.x, peer.y + 39);
      });

      // --- K. DRAW LOCAL USER AVATAR ---
      // Outer pulse ring
      const pulse = 3 * Math.sin(time * 3);
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, AVATAR_RADIUS + 3 + pulse, 0, Math.PI * 2);
      ctx.strokeStyle = `${user?.avatarColor || '#6366f1'}66`;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Shadow
      ctx.beginPath();
      ctx.arc(pos.x + 2, pos.y + 2, AVATAR_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.fill();

      // Body circle
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, AVATAR_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = user?.avatarColor || '#6366f1';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Initial
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 13px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText((user?.name || 'You').charAt(0).toUpperCase(), pos.x, pos.y + 4.5);

      // Name & role above avatar
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(user?.name ? user.name.split(' ')[0] : 'You', pos.x, pos.y - 25);

      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 9px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(`YOU (${user?.role || 'Developer'})`, pos.x, pos.y - 14);

      // Microphone status icon indicator
      if (micMuted) {
        ctx.beginPath();
        ctx.arc(pos.x + 12, pos.y - 12, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#f43f5e';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [earshotRadius, micMuted, user]);

  return (
    <div className="w-full max-w-6xl mx-auto flex flex-col gap-4">
      {/* Top HUD Bar */}
      <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-3 sm:p-4 shadow-xl backdrop-blur-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        {/* Left: Office & Zone Info */}
        <div className="flex items-center space-x-3 w-full md:w-auto min-w-0">
          <div className="p-2 sm:p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 shrink-0">
            <Radio className="w-4 h-4 sm:w-5 sm:h-5 animate-pulse" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <h2 className="text-sm sm:text-base font-extrabold text-white truncate">ProxiSpeak Virtual Office</h2>
              <span className="text-[9px] sm:text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 whitespace-nowrap">
                Week 1: Canvas & WebSockets
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] sm:text-xs text-slate-400 mt-0.5">
              <span className="text-emerald-400 font-medium">{currentZone}</span>
              <span>•</span>
              <span className="font-mono text-slate-400">
                Coordinates: [{coords.x}, {coords.y}]
              </span>
            </div>
          </div>
        </div>

        {/* Center & Right Actions Container */}
        <div className="flex flex-wrap items-center justify-between md:justify-end gap-2.5 w-full md:w-auto pt-2 md:pt-0 border-t md:border-t-0 border-slate-800/60">
          {/* Live Connection & Online Count */}
          <div className="flex items-center gap-2">
            <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-xl bg-slate-950/80 border border-slate-800 text-[11px] sm:text-xs">
              <span className={`w-2 h-2 rounded-full ${connectionStatus === 'connected' ? 'bg-emerald-400 shadow-sm shadow-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
              <span className="text-slate-300">
                {connectionStatus === 'connected' ? 'Online' : 'Connecting...'}
              </span>
            </div>

            <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-xl bg-slate-950/80 border border-slate-800 text-[11px] sm:text-xs">
              <Users className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span className="text-slate-300 font-mono font-medium">
                {onlineCount} {onlineCount === 1 ? 'Avatar' : 'Avatars'}
              </span>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={handleOpenProximityGroups}
              className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-cyan-600/80 hover:bg-cyan-600 border border-cyan-500/40 text-white text-[11px] sm:text-xs font-semibold flex items-center space-x-1.5 shadow-md shadow-cyan-600/20 cursor-pointer transition-all"
              title="View MongoDB $near proximity audio pod groupings"
            >
              <Layers className="w-3.5 h-3.5 text-cyan-200" />
              <span>$near Groups</span>
            </button>

            <button
              type="button"
              onClick={() => handleSpawnTestPeer(false)}
              className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-indigo-600/80 hover:bg-indigo-600 border border-indigo-500/40 text-white text-[11px] sm:text-xs font-semibold flex items-center space-x-1.5 shadow-md shadow-indigo-600/20 cursor-pointer transition-all"
              title="Spawn test avatar within 100px earshot (Permits WebRTC offers)"
            >
              <Sparkles className="w-3.5 h-3.5 text-cyan-300" />
              <span>Spawn Near (~70px)</span>
            </button>

            <button
              type="button"
              onClick={() => handleSpawnTestPeer(true)}
              className="px-2 sm:px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-950/40 text-slate-300 hover:text-rose-300 border border-slate-700 hover:border-rose-500/40 text-[11px] sm:text-xs font-medium cursor-pointer transition-all"
              title="Spawn test avatar outside 100px earshot (Demonstrates server gatekeeper blocking offers)"
            >
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
              <span>Spawn Far (>100px)</span>
            </button>

            <button
              type="button"
              onClick={handleResetPosition}
              className="p-1.5 sm:p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 cursor-pointer transition-colors"
              title="Center Avatar"
            >
              <RotateCcw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>

            <button
              type="button"
              onClick={onBackToDashboard}
              className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white border border-slate-700 text-[11px] sm:text-xs font-medium cursor-pointer transition-colors"
            >
              Profile
            </button>
          </div>
        </div>
      </div>

      {/* Main 2D Canvas Container */}
      <div className="relative rounded-2xl sm:rounded-3xl overflow-hidden border border-slate-800/90 shadow-2xl bg-slate-950 group">
        <canvas
          ref={canvasRef}
          width={WORLD_WIDTH}
          height={WORLD_HEIGHT}
          onClick={handleCanvasClick}
          className="w-full h-auto block cursor-crosshair"
        />

        {/* Floating Proximity Radar Status Pill (Top Left Inside Canvas) */}
        <div className="absolute top-2.5 left-2.5 sm:top-4 sm:left-4 flex flex-col gap-1.5 sm:gap-2 pointer-events-none max-w-[calc(100%-1.5rem)] sm:max-w-xs">
          <div className="bg-slate-900/90 backdrop-blur-md px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl border border-slate-800 text-xs shadow-xl flex items-center space-x-2">
            <Compass className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-cyan-400 animate-spin shrink-0" />
            <div className="min-w-0">
              <span className="text-slate-200 font-bold block text-[10px] sm:text-[11px] leading-tight">
                2D HTML5 Canvas World
              </span>
              <span className="text-[9px] sm:text-[10px] text-cyan-300 font-mono truncate block">
                WebRTC Gatekeeper: 100px Radius Limit
              </span>
            </div>
          </div>

          {/* Active Earshot Card if peers are nearby */}
          {peersInEarshot.length > 0 ? (
            <div className="bg-emerald-950/90 backdrop-blur-md px-2.5 sm:px-3.5 py-2 sm:py-2.5 rounded-xl border border-emerald-500/40 text-xs shadow-xl animate-fadeIn pointer-events-auto">
              <div className="flex items-center space-x-1.5 sm:space-x-2 text-emerald-400 font-bold mb-1 text-[11px] sm:text-xs">
                <Volume2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-bounce shrink-0" />
                <span>Within 100px Earshot ({peersInEarshot.length})</span>
              </div>
              {peersInEarshot.map((peer, idx) => (
                <div key={idx} className="text-[10px] sm:text-[11px] text-emerald-200/90 font-mono flex items-center justify-between gap-2 py-0.5">
                  <span className="truncate">{peer.name}:</span>
                  <div className="flex items-center space-x-1.5 shrink-0">
                    <span className="text-emerald-400 font-bold">{peer.gain}% ({peer.distance}px)</span>
                    {peer.socketId && (
                      <button
                        type="button"
                        onClick={() => handleTestWebRTCOffer(peer.socketId)}
                        className="px-1.5 py-0.5 rounded bg-emerald-900/80 hover:bg-emerald-800 text-[9px] text-emerald-200 border border-emerald-600/40 cursor-pointer"
                        title="Test WebRTC offer delivery through backend"
                      >
                        Signal
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-slate-900/80 backdrop-blur-md px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg border border-slate-800 text-[10px] sm:text-[11px] text-slate-400 font-mono">
              🎧 No colleagues within 100px earshot
            </div>
          )}
        </div>

        {/* Floating Controls Overlay (Bottom Right Inside Canvas) */}
        <div className="absolute bottom-2.5 right-2.5 sm:bottom-4 sm:right-4 flex flex-wrap items-center gap-2 bg-slate-900/90 backdrop-blur-md px-2.5 sm:px-4 py-1.5 sm:py-2.5 rounded-xl sm:rounded-2xl border border-slate-800 shadow-xl max-w-[calc(100%-1.5rem)]">
          {/* Mic Toggle Button */}
          <button
            type="button"
            onClick={handleToggleMic}
            className={`p-1.5 sm:p-2 rounded-xl border cursor-pointer transition-all flex items-center space-x-1.5 ${
              micMuted
                ? 'bg-rose-950/60 border-rose-500/50 text-rose-300 hover:bg-rose-900/60'
                : 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300 hover:bg-emerald-900/60'
            }`}
          >
            {micMuted ? <MicOff className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Mic className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
            <span className="text-[11px] sm:text-xs font-semibold">{micMuted ? 'Muted' : 'Speaking'}</span>
          </button>

          {/* WebRTC Limit Badge */}
          <div className="flex items-center space-x-1.5 border-l border-slate-800 pl-2 text-[10px] text-slate-400 font-mono">
            <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
            <span>Limit: <strong className="text-white">100px</strong></span>
          </div>
        </div>
      </div>

      {/* Movement Instructions & Multi-Tab Testing Pill */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Navigation Instructions */}
        <div className="p-3.5 rounded-2xl bg-slate-900/70 border border-slate-800/80 flex items-center space-x-3 text-xs text-slate-300">
          <div className="p-2 rounded-xl bg-slate-800 text-cyan-400 shrink-0">
            <Keyboard className="w-4 h-4" />
          </div>
          <div>
            <span className="font-semibold text-white block">100-Pixel WebRTC Audio Mesh:</span>
            <span className="text-slate-400 text-[11px]">
              The Node.js server strictly verifies distance before routing WebRTC offers & answers. Walk within <strong className="text-cyan-300">100 pixels</strong> of a teammate to open bidirectional audio!
            </span>
          </div>
        </div>

        {/* Multi-Tab Testing Tip */}
        <div className="p-3.5 rounded-2xl bg-slate-900/70 border border-slate-800/80 flex items-center space-x-3 text-xs text-slate-300">
          <div className="p-2 rounded-xl bg-slate-800 text-indigo-400 shrink-0">
            <ExternalLink className="w-4 h-4" />
          </div>
          <div className="flex-1">
            <span className="font-semibold text-white block">Real-time Multi-Client Testing:</span>
            <span className="text-slate-400 text-[11px]">
              Open a second browser tab at <code className="text-indigo-300 font-mono">http://localhost:3000</code> to watch both avatars move, enter the 100px radius, and connect audio!
            </span>
          </div>
        </div>
      </div>

      {/* ====================================================
          5. MONGODB $near PROXIMITY GROUPS MODAL
         ==================================================== */}
      {isGroupsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">MongoDB $near Proximity Groups</h3>
                  <p className="text-[11px] text-slate-400">
                    Iterative 2D geospatial clusters within 100-pixel radius limit
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsGroupsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="my-4 max-h-80 overflow-y-auto space-y-3 pr-1">
              {proximityGroups.length > 0 ? (
                proximityGroups.map((group, idx) => (
                  <div key={idx} className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-cyan-400" />
                        {group.name}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                        WebRTC Mesh Permitted (100px)
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-400 flex items-center justify-between">
                      <span>Centroid: [{group.center.join(', ')}]</span>
                      <span>Members: {group.memberCount} avatars</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      {group.members.map((member, mIdx) => (
                        <div key={mIdx} className="flex items-center space-x-2 p-2 rounded-xl bg-slate-900 border border-slate-800/80 text-[11px]">
                          <span
                            className="w-3 h-3 rounded-full shrink-0"
                            style={{ backgroundColor: member.avatarColor || '#6366f1' }}
                          />
                          <div className="min-w-0 flex-1 truncate">
                            <span className="text-slate-200 font-semibold block truncate">{member.name}</span>
                            <span className="text-[10px] text-slate-400 truncate block">
                              {member.isPodLeader ? 'Pod Leader' : `${member.distanceToLead}px from lead`}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-6 text-center rounded-2xl bg-slate-950/60 border border-slate-800 text-slate-400 text-xs">
                  <Activity className="w-8 h-8 text-cyan-400/50 mx-auto mb-2 animate-pulse" />
                  <p className="font-semibold text-slate-300">No active proximity groups formed yet</p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Spawn a nearby peer or move within 100 pixels of a teammate to form an audio pod!
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-400 text-[11px]">
                Threshold: <strong className="text-cyan-300 font-mono">100px radius</strong>
              </span>
              <button
                type="button"
                onClick={handleOpenProximityGroups}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl text-xs transition-colors cursor-pointer"
              >
                Refresh Groups
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
