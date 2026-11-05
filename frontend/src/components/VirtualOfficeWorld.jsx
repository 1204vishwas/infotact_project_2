import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  CheckCircle2,
  Sliders,
  AlertCircle,
  Play,
  Square,
  Wrench,
  Building2,
  Save,
  Database
} from 'lucide-react';

import { WebRTCAudioManager } from '../utils/webrtcManager';
import { checkSoundOcclusion } from '../utils/audioAttenuation';
import AudioWaveformVisualizer from './AudioWaveformVisualizer';
import SpatialAuditModal from './SpatialAuditModal';
import AudioCheckModal from './AudioCheckModal';
import RoomLayoutModal from './RoomLayoutModal';
import MySQLStatusModal from './MySQLStatusModal';
import Spatial3DAudioModal from './Spatial3DAudioModal';

// Default Office Obstacles with Sound-Blocking Barriers
const DEFAULT_OBSTACLES = [
  // --- SOUND-BLOCKING FURNITURE OBSTACLES (blocksSound: true) ---
  {
    id: 'acoustic-wall-central',
    label: 'Acoustic Soundproof Wall',
    type: 'acoustic-wall',
    x: 468,
    y: 50,
    width: 24,
    height: 220,
    color: '#312e81',
    blocksSound: true,
    soundReduction: 1.0,
    soundReductionDb: 45
  },
  {
    id: 'booth-audio-lab',
    label: 'Sound Isolation Booth',
    type: 'sound-booth',
    x: 270,
    y: 80,
    width: 140,
    height: 90,
    color: '#064e3b',
    blocksSound: true,
    soundReduction: 1.0,
    soundReductionDb: 50
  },
  {
    id: 'glass-partition-lounge',
    label: 'Soundproof Glass Partition',
    type: 'glass-partition',
    x: 468,
    y: 370,
    width: 24,
    height: 220,
    color: '#0369a1',
    blocksSound: true,
    soundReduction: 1.0,
    soundReductionDb: 40
  },

  // --- OPEN FURNITURE / NON-BLOCKING (blocksSound: false) ---
  {
    id: 'desk-dev-1',
    label: 'WebRTC Cluster Pod 1',
    type: 'desk',
    x: 550,
    y: 80,
    width: 140,
    height: 60,
    color: '#1e293b',
    blocksSound: false
  },
  {
    id: 'desk-dev-2',
    label: 'WebSocket Cluster Pod 2',
    type: 'desk',
    x: 740,
    y: 80,
    width: 140,
    height: 60,
    color: '#1e293b',
    blocksSound: false
  },
  {
    id: 'desk-dev-3',
    label: 'Frontend Mesh Station',
    type: 'desk',
    x: 550,
    y: 190,
    width: 140,
    height: 60,
    color: '#1e293b',
    blocksSound: false
  },
  {
    id: 'desk-dev-4',
    label: 'Node Gateway Station',
    type: 'desk',
    x: 740,
    y: 190,
    width: 140,
    height: 60,
    color: '#1e293b',
    blocksSound: false
  },
  {
    id: 'audio-console-1',
    label: 'Audio DSP Mixing Board',
    type: 'console',
    x: 70,
    y: 90,
    width: 150,
    height: 60,
    color: '#1e293b',
    blocksSound: false
  },
  {
    id: 'product-island',
    label: 'UX Wireframe Island',
    type: 'table',
    x: 80,
    y: 440,
    width: 180,
    height: 70,
    color: '#1e293b',
    blocksSound: false
  },
  {
    id: 'lounge-island',
    label: 'Pantry Island & Water Cooler',
    type: 'table',
    x: 640,
    y: 440,
    width: 160,
    height: 70,
    color: '#1e293b',
    blocksSound: false
  }
];

export default function VirtualOfficeWorld({ user, onBackToDashboard, showToast }) {
  const canvasRef = useRef(null);
  const socketRef = useRef(null);
  const webrtcManagerRef = useRef(null);

  // Canvas dimensions
  const WORLD_WIDTH = 960;
  const WORLD_HEIGHT = 640;

  // Local avatar state
  const [coords, setCoords] = useState({ x: 480, y: 320 });
  const [currentZone, setCurrentZone] = useState('Central Office');
  const [earshotRadius, setEarshotRadius] = useState(100); // 100-pixel WebRTC proximity radius constraint
  const [micMuted, setMicMuted] = useState(false);
  const [isMicActive, setIsMicActive] = useState(false);
  const [micPermissionState, setMicPermissionState] = useState('prompt'); // 'prompt' | 'granted' | 'denied'
  const [onlineCount, setOnlineCount] = useState(1);
  const [peersInEarshot, setPeersInEarshot] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('connecting'); // 'connected' | 'connecting' | 'offline'
  const [proximityGroups, setProximityGroups] = useState([]);
  const [isGroupsModalOpen, setIsGroupsModalOpen] = useState(false);
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false);
  const [isSpatialAuditOpen, setIsSpatialAuditOpen] = useState(false);
  const [isAudioCheckOpen, setIsAudioCheckOpen] = useState(false);
  const [isRoomManagerOpen, setIsRoomManagerOpen] = useState(false);
  const [isMySQLModalOpen, setIsMySQLModalOpen] = useState(false);
  const [mySQLStatus, setMySQLStatus] = useState({ connected: false, port: 3306 });
  const [isSavingRoom, setIsSavingRoom] = useState(false);
  const [roomSource, setRoomSource] = useState('mongodb');
  const [officeName, setOfficeName] = useState('ProxiSpeak Headquarters');

  // Room Persistence & Obstacles state
  const [obstacles, setObstacles] = useState(DEFAULT_OBSTACLES);
  const obstaclesRef = useRef(DEFAULT_OBSTACLES);
  const [clusterInfo, setClusterInfo] = useState({
    clusterMode: 'in-memory-broker',
    nodeInstanceId: 'local',
    maxMeshPeers: 6,
    hysteresisRadius: 115
  });
  const [recentWebRTCAlert, setRecentWebRTCAlert] = useState(null);
  const [peerConnectionStates, setPeerConnectionStates] = useState({});
  const [botAudioActive, setBotAudioActive] = useState(false);

  // 3D Spatial Audio & Stereo Separation controls
  const [stereoSeparation, setStereoSeparation] = useState(1.0); // 0.0 (Mono) to 1.5 (Wide)
  const [panningMode, setPanningMode] = useState('hrtf'); // 'hrtf' (binaural 3D) | 'stereo'
  const [isSpatial3DModalOpen, setIsSpatial3DModalOpen] = useState(false);

  // 60 FPS Performance telemetry state
  const [fpsMetric, setFpsMetric] = useState({ fps: 60, frameTime: 16.6, jitter: 0.1 });

  // Audio simulation oscillator for bot test
  const botOscillatorRef = useRef(null);

  // Refs for animation loop, 60 FPS regulation & audio to avoid stale closures
  const posRef = useRef({ x: 480, y: 320, vx: 0, vy: 0, targetX: null, targetY: null });
  const keysRef = useRef({ w: false, a: false, s: false, d: false, ArrowUp: false, ArrowLeft: false, ArrowDown: false, ArrowRight: false });
  const peersRef = useRef(new Map()); // socketId -> { name, role, avatarColor, x, y, targetX, targetY, micMuted, isBot }
  const lastEmitTime = useRef(0);
  const reticleRef = useRef(null); // click target visual ripple { x, y, opacity, size }

  // 60 FPS steady timing refs & offscreen canvas
  const bgCanvasRef = useRef(null);
  const lastFrameTimeRef = useRef(performance.now());
  const fpsRef = useRef({ fps: 60, frameTime: 16.6, count: 0, lastCheck: performance.now() });
  const lastUiThrottleRef = useRef(0);
  const peersInEarshotRef = useRef([]);

  // Reactive state refs to eliminate loop teardowns
  const micMutedRef = useRef(false);
  const isMicActiveRef = useRef(false);
  const botAudioActiveRef = useRef(false);
  const earshotRadiusRef = useRef(100);
  const peerConnectionStatesRef = useRef({});
  const userRef = useRef(user);
  const stereoSeparationRef = useRef(1.0);
  const panningModeRef = useRef('hrtf');

  useEffect(() => { micMutedRef.current = micMuted; }, [micMuted]);
  useEffect(() => { isMicActiveRef.current = isMicActive; }, [isMicActive]);
  useEffect(() => { botAudioActiveRef.current = botAudioActive; }, [botAudioActive]);
  useEffect(() => { earshotRadiusRef.current = earshotRadius; }, [earshotRadius]);
  useEffect(() => { peerConnectionStatesRef.current = peerConnectionStates; }, [peerConnectionStates]);
  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => {
    stereoSeparationRef.current = stereoSeparation;
    if (webrtcManagerRef.current) {
      webrtcManagerRef.current.setStereoSeparation(stereoSeparation);
    }
  }, [stereoSeparation]);
  useEffect(() => {
    panningModeRef.current = panningMode;
    if (webrtcManagerRef.current) {
      webrtcManagerRef.current.setPanningMode(panningMode);
    }
  }, [panningMode]);

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
      icon: 'AUDIO'
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
      icon: 'RTC'
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
      icon: 'DESIGN'
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
      icon: 'LOUNGE'
    }
  ];

  // Load office room layout and obstacles from MongoDB
  useEffect(() => {
    fetch('/api/spatial/room')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.office) {
          if (Array.isArray(data.office.obstacles) && data.office.obstacles.length > 0) {
            setObstacles(data.office.obstacles);
            obstaclesRef.current = data.office.obstacles;
          }
          if (data.office.name) setOfficeName(data.office.name);
          setRoomSource(data.source || 'mongodb');
          console.log(`[VirtualOfficeWorld] Loaded office layout from ${data.source}: ${data.office.obstacles?.length} obstacles`);
        }
      })
      .catch((err) => console.warn('[Room Persistence] Fetch error:', err));
  }, []);

  // Poll MySQL connection status on port 3306
  useEffect(() => {
    const checkMySQL = () => {
      fetch('/api/mysql/status')
        .then((r) => r.json())
        .then((data) => {
          if (data.success && data.data) {
            setMySQLStatus(data.data);
          }
        })
        .catch(() => {});
    };
    checkMySQL();
    const interval = setInterval(checkMySQL, 15000);
    return () => clearInterval(interval);
  }, []);

  // Update obstacles state & ref synchronously
  const handleUpdateObstacles = (newObstacles) => {
    setObstacles(newObstacles);
    obstaclesRef.current = newObstacles;
  };

  // Save room layout & sound-blocking obstacles to MongoDB
  const handleSaveLayoutToMongo = async () => {
    setIsSavingRoom(true);
    try {
      const res = await fetch('/api/spatial/room', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: officeName,
          cluster: 'proxify',
          dimensions: { width: WORLD_WIDTH, height: WORLD_HEIGHT },
          zones,
          obstacles
        })
      });
      const data = await res.json();
      if (data.success) {
        setRoomSource(data.source || 'mongodb');
        if (socketRef.current && socketRef.current.connected) {
          socketRef.current.emit('save-room-layout', {
            name: officeName,
            cluster: 'proxify',
            dimensions: { width: WORLD_WIDTH, height: WORLD_HEIGHT },
            zones,
            obstacles
          });
        }
        showToast(`Office layout & ${obstacles.length} furniture obstacles saved into MongoDB!`, 'success');
      } else {
        showToast(`Failed to save layout: ${data.message}`, 'error');
      }
    } catch (err) {
      showToast(`Error saving to MongoDB: ${err.message}`, 'error');
    } finally {
      setIsSavingRoom(false);
    }
  };

  // Reset room layout to defaults in MongoDB
  const handleResetLayout = async () => {
    try {
      const res = await fetch('/api/spatial/room/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cluster: 'proxify' })
      });
      const data = await res.json();
      if (data.success && data.office) {
        const restored = data.office.obstacles || DEFAULT_OBSTACLES;
        setObstacles(restored);
        obstaclesRef.current = restored;
        setRoomSource(data.source || 'mongodb');
        if (socketRef.current && socketRef.current.connected) {
          socketRef.current.emit('reset-room-layout');
        }
        showToast('Office layout and obstacles reset to factory defaults in MongoDB.', 'success');
      }
    } catch (err) {
      showToast(`Error resetting layout: ${err.message}`, 'error');
    }
  };

  // Helper: Find current office zone
  const getZoneAt = (x, y) => {
    for (const z of zones) {
      if (x >= z.x && x <= z.x + z.width && y >= z.y && y <= z.y + z.height) {
        return z.name;
      }
    }
    return 'Central Concourse';
  };

  // ====================================================
  // 1. INITIALIZE WEBRTC AUDIO MANAGER & MICROPHONE
  // ====================================================
  useEffect(() => {
    const manager = new WebRTCAudioManager({
      onConnectionStateChange: (peerId, state) => {
        setPeerConnectionStates((prev) => ({ ...prev, [peerId]: state }));
      },
      showToast
    });
    webrtcManagerRef.current = manager;

    // Check if browser permission was already granted previously
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'microphone' }).then((status) => {
        setMicPermissionState(status.state);
        if (status.state === 'granted') {
          manager.initMicrophone().then((stream) => {
            if (stream) {
              setIsMicActive(true);
              setMicPermissionState('granted');
            }
          });
        }
        status.onchange = () => {
          setMicPermissionState(status.state);
        };
      }).catch(() => {});
    }

    return () => {
      manager.destroy();
      stopBotAudio();
    };
  }, []);

  const handleInitMicrophone = async () => {
    if (!webrtcManagerRef.current) return;
    const stream = await webrtcManagerRef.current.initMicrophone();
    if (stream) {
      setIsMicActive(true);
      setMicPermissionState('granted');
      setMicMuted(false);
      if (socketRef.current && socketRef.current.connected) {
        socketRef.current.emit('audio-state-change', { micMuted: false, deafened: false });
      }
    } else {
      setMicPermissionState('denied');
    }
  };

  // Toggle mic mute state and broadcast
  const handleToggleMic = () => {
    if (!webrtcManagerRef.current) return;
    if (!isMicActive) {
      handleInitMicrophone();
      return;
    }

    const newMuted = !micMuted;
    webrtcManagerRef.current.setMuted(newMuted);
    setMicMuted(newMuted);

    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('audio-state-change', {
        micMuted: newMuted,
        deafened: false
      });
    }
    showToast(newMuted ? 'Microphone muted' : 'Microphone unmuted (Earshot broadcasting active)', 'info');
  };

  // ====================================================
  // 2. SOCKET.IO CONNECTION & WEBRTC SIGNALING HANDSHAKE
  // ====================================================
  useEffect(() => {
    const socket = io('/', {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnectionStatus('connected');
      console.log('[ProxiSpeak Socket] Connected to signaling server with id:', socket.id);

      // Join the Virtual Office Space
      socket.emit('join-space', {
        id: user?.id || user?._id,
        name: user?.name,
        username: user?.username,
        role: user?.role,
        avatarColor: user?.avatarColor,
        location: [posRef.current.x, posRef.current.y]
      });

      showToast('Connected to ProxiSpeak Virtual Office!', 'success');
    });

    socket.on('disconnect', () => {
      setConnectionStatus('offline');
      console.log('[ProxiSpeak Socket] Disconnected from server');
    });

    // Receive space state (initial active peers & MongoDB room layout)
    socket.on('space-state', ({ self, peers: existingPeers, totalOnline, clusterMode, nodeInstanceId, maxMeshPeers, hysteresisRadiusLimit, obstacles: roomObs }) => {
      setOnlineCount(totalOnline || 1);
      if (Array.isArray(roomObs) && roomObs.length > 0) {
        setObstacles(roomObs);
        obstaclesRef.current = roomObs;
      }
      if (clusterMode || nodeInstanceId) {
        setClusterInfo({
          clusterMode: clusterMode || 'in-memory-broker',
          nodeInstanceId: nodeInstanceId || 'local',
          maxMeshPeers: maxMeshPeers || 6,
          hysteresisRadius: hysteresisRadiusLimit || 115
        });
      }
      const newPeers = new Map();
      if (Array.isArray(existingPeers)) {
        existingPeers.forEach((p) => {
          newPeers.set(p.socketId, {
            socketId: p.socketId,
            userId: p.userId,
            name: p.name,
            role: p.role,
            avatarColor: p.avatarColor,
            x: p.location[0],
            y: p.location[1],
            targetX: p.location[0],
            targetY: p.location[1],
            micMuted: p.micMuted,
            isBot: false
          });
        });
      }
      peersRef.current = newPeers;
    });

    // Real-time Room Layout sync from MongoDB across all connected tabs
    socket.on('room-layout-updated', ({ office, source }) => {
      if (office && Array.isArray(office.obstacles)) {
        setObstacles(office.obstacles);
        obstaclesRef.current = office.obstacles;
        setRoomSource(source || 'mongodb');
        showToast(`Office layout updated in MongoDB (${office.obstacles.length} obstacles)`, 'info');
      }
    });

    // Remote peer joined
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
        micMuted: p.micMuted,
        isBot: false
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
      if (webrtcManagerRef.current) {
        webrtcManagerRef.current.closePeerConnection(leaving.socketId);
      }
      setPeerConnectionStates((prev) => {
        const next = { ...prev };
        delete next[leaving.socketId];
        return next;
      });
      setOnlineCount(peersRef.current.size + 1);
      showToast(`${leaving.name || 'A teammate'} left the office.`, 'info');
    });

    // ====================================================
    // 3. WebRTC 100-PIXEL PROXIMITY GATEKEEPER & SIGNALING EVENTS
    // ====================================================

    // Peer entered 100-pixel radius (Server permitted WebRTC offer)
    socket.on('proximity-peer-entered', async ({ peer, distance, maxRadius, gain, isCulled, shouldInitiateOffer }) => {
      console.log(`[WebRTC Proximity] '${peer.name}' entered 100px earshot (${distance}px). Should offer: ${shouldInitiateOffer}, Culled: ${isCulled}`);
      setRecentWebRTCAlert({
        type: 'entered',
        peerName: peer.name,
        distance,
        gain: isCulled ? 0 : gain,
        isCulled,
        timestamp: Date.now()
      });

      if (isCulled) {
        showToast(`${peer.name} is in earshot (${distance}px), but audio is culled to standby (max 6 peer limit).`, 'info');
      } else {
        showToast(`${peer.name} entered 100px earshot (${distance}px)! WebRTC audio active (${gain}% gain).`, 'success');
      }

      if (webrtcManagerRef.current) {
        const myX = posRef.current.x;
        const myY = posRef.current.y;
        const peerX = peer.location ? peer.location[0] : (peer.x || 0);
        const peerY = peer.location ? peer.location[1] : (peer.y || 0);
        const deltaX = peerX - myX;
        const deltaY = peerY - myY;
        webrtcManagerRef.current.setListenerPosition(myX, myY, 0);
        webrtcManagerRef.current.setPeerDistance(peer.socketId, distance, maxRadius, deltaX, deltaY, isCulled, 115);

        // Initialize RTCPeerConnection for both caller & callee to ensure readiness for ICE & tracks
        webrtcManagerRef.current.createPeerConnection(peer.socketId, {
          onIceCandidate: (candidate) => {
            socket.emit('webrtc-ice-candidate', {
              targetSocketId: peer.socketId,
              candidate
            });
          },
          onConnectionStateChange: (state) => {
            setPeerConnectionStates((prev) => ({ ...prev, [peer.socketId]: state }));
          }
        });

        // Deterministic handshake trigger: only one peer initiates to prevent signaling glare
        if (shouldInitiateOffer) {
          try {
            const offer = await webrtcManagerRef.current.createOffer(peer.socketId);
            socket.emit('webrtc-offer', {
              targetSocketId: peer.socketId,
              offer
            });
            console.log(`[WebRTC Proximity] Dispatched verified offer to ${peer.name}`);
          } catch (err) {
            console.error('[WebRTC Proximity] Failed to initiate offer:', err);
          }
        }
      }
    });

    // Proximity continuous dynamic distance & audio gain update
    socket.on('proximity-distance-update', ({ peerSocketId, distance, gain, isCulled }) => {
      if (webrtcManagerRef.current) {
        const peerAvatar = peersRef.current.get(peerSocketId);
        const myX = posRef.current.x;
        const myY = posRef.current.y;
        const peerX = peerAvatar ? (peerAvatar.x || peerAvatar.location?.[0] || 0) : 0;
        const peerY = peerAvatar ? (peerAvatar.y || peerAvatar.location?.[1] || 0) : 0;
        const deltaX = peerX - myX;
        const deltaY = peerY - myY;
        webrtcManagerRef.current.setListenerPosition(myX, myY, 0);
        webrtcManagerRef.current.setPeerDistance(peerSocketId, distance, 100, deltaX, deltaY, isCulled, 115);
      }
    });

    // Peer moved outside 100-pixel radius (Server closes WebRTC audio channel)
    socket.on('proximity-peer-left', ({ peerSocketId, peerName, distance, maxRadius }) => {
      console.log(`[WebRTC Proximity] '${peerName}' left 100px earshot (${distance}px). WebRTC disconnected.`);
      setRecentWebRTCAlert({
        type: 'left',
        peerName,
        distance,
        timestamp: Date.now()
      });
      showToast(`${peerName} moved beyond 100px radius (${distance}px). WebRTC audio disconnected.`, 'info');

      if (webrtcManagerRef.current) {
        webrtcManagerRef.current.closePeerConnection(peerSocketId);
      }
      setPeerConnectionStates((prev) => {
        const next = { ...prev };
        delete next[peerSocketId];
        return next;
      });
    });

    // Received WebRTC Offer (Verified by server within 100-pixel radius)
    socket.on('webrtc-offer', async ({ callerSocketId, callerUser, offer, proximity }) => {
      console.log(`[WebRTC Proximity] Received verified offer from ${callerUser?.name} (${proximity?.distance}px <= 100px).`);

      if (webrtcManagerRef.current) {
        try {
          webrtcManagerRef.current.createPeerConnection(callerSocketId, {
            onIceCandidate: (candidate) => {
              socket.emit('webrtc-ice-candidate', {
                targetSocketId: callerSocketId,
                candidate
              });
            },
            onConnectionStateChange: (state) => {
              setPeerConnectionStates((prev) => ({ ...prev, [callerSocketId]: state }));
            }
          });

          webrtcManagerRef.current.setPeerDistance(callerSocketId, proximity?.distance || 50, 100);

          const answer = await webrtcManagerRef.current.handleOffer(callerSocketId, offer);
          socket.emit('webrtc-answer', {
            targetSocketId: callerSocketId,
            answer
          });
          console.log(`[WebRTC Proximity] Replied with verified answer to ${callerUser?.name}`);
        } catch (err) {
          console.error('[WebRTC Proximity] Failed to handle offer:', err);
        }
      }
    });

    // Received WebRTC Answer (Verified by server within 100-pixel radius)
    socket.on('webrtc-answer', async ({ calleeSocketId, calleeUser, answer, proximity }) => {
      console.log(`[WebRTC Proximity] WebRTC audio mesh handshake completed with ${calleeUser?.name} (${proximity?.distance}px).`);

      if (webrtcManagerRef.current) {
        try {
          await webrtcManagerRef.current.handleAnswer(calleeSocketId, answer);
          if (proximity?.distance) {
            webrtcManagerRef.current.setPeerDistance(calleeSocketId, proximity.distance, 100);
          }
          showToast(`Connected live audio with ${calleeUser?.name}!`, 'success');
        } catch (err) {
          console.error('[WebRTC Proximity] Failed to handle answer:', err);
        }
      }
    });

    // Received WebRTC ICE Candidate (Verified by server within 100-pixel radius)
    socket.on('webrtc-ice-candidate', async ({ senderSocketId, candidate }) => {
      if (webrtcManagerRef.current) {
        try {
          await webrtcManagerRef.current.handleIceCandidate(senderSocketId, candidate);
        } catch (err) {
          console.error('[WebRTC Proximity] Failed to handle ICE candidate:', err);
        }
      }
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
      showToast(`WebRTC ${type.toUpperCase()} Blocked: ${targetName} is ${distance}px away (Exceeds ${maxRadius}px limit).`, 'error');
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
  // 4. KEYBOARD CONTROLS (WASD & ARROWS)
  // ====================================================
  useEffect(() => {
    const handleKeyDown = (e) => {
      const key = e.key;
      if (['w', 'a', 's', 'd', 'W', 'A', 'S', 'D', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'].includes(key)) {
        e.preventDefault();
        keysRef.current[key.toLowerCase()] = true;
        posRef.current.targetX = null;
        posRef.current.targetY = null;
        reticleRef.current = null;
      }
    };

    const handleKeyUp = (e) => {
      const key = e.key;
      if (['w', 'a', 's', 'd', 'W', 'A', 'S', 'D', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'].includes(key)) {
        e.preventDefault();
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
  // 5. MOUSE CLICK-TO-MOVE WAYPOINT NAVIGATION
  // ====================================================
  const handleCanvasClick = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Resume AudioContext if user clicks on canvas (browser autoplay policy)
    if (webrtcManagerRef.current) {
      webrtcManagerRef.current.getAudioContext();
    }

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const clickX = Math.round((e.clientX - rect.left) * scaleX);
    const clickY = Math.round((e.clientY - rect.top) * scaleY);

    posRef.current.targetX = clickX;
    posRef.current.targetY = clickY;

    reticleRef.current = {
      x: clickX,
      y: clickY,
      radius: 6,
      maxRadius: 24,
      opacity: 1
    };
  };

  // ====================================================
  // 6. TEST BOT SPAWNER & SYNTHETIC AUDIO SIMULATION
  // ====================================================
  const handleSpawnTestPeer = (forceOutOfRange = false) => {
    const fakeId = `test_bot_${Date.now()}`;
    const botColors = ['#f43f5e', '#06b6d4', '#10b981', '#f59e0b', '#8b5cf6'];
    const botColor = botColors[Math.floor(Math.random() * botColors.length)];

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
      micMuted: false,
      isBot: true
    });
    setOnlineCount(peersRef.current.size + 1);

    if (forceOutOfRange) {
      showToast(`Spawned out-of-range peer (~160px). WebRTC offers will be blocked by backend gatekeeper!`, 'info');
    } else {
      showToast(`Spawned peer in earshot (~70px)! WebRTC offers permitted (100px limit).`, 'success');
      // Set test connected state for simulation
      setPeerConnectionStates((prev) => ({ ...prev, [fakeId]: 'connected' }));
    }
  };

  // Toggle synthetic audio tone from bot to test spatial audio attenuation
  const toggleBotAudio = () => {
    if (botAudioActive) {
      stopBotAudio();
      setBotAudioActive(false);
      showToast('Bot spatial audio simulation stopped.', 'info');
    } else {
      startBotAudio();
      setBotAudioActive(true);
      showToast('Bot synthesizer voice active! Walk near/away from colleague to test volume attenuation.', 'success');
    }
  };

  const startBotAudio = () => {
    try {
      const audioCtx = webrtcManagerRef.current?.getAudioContext();
      if (!audioCtx) return;

      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, audioCtx.currentTime); // 440 Hz A tone
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);

      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();

      botOscillatorRef.current = { osc, gain };
    } catch (e) {
      console.warn('Bot audio error:', e);
    }
  };

  const stopBotAudio = () => {
    if (botOscillatorRef.current) {
      try {
        botOscillatorRef.current.osc.stop();
        botOscillatorRef.current.osc.disconnect();
      } catch (e) {}
      botOscillatorRef.current = null;
    }
  };

  // Test sending a real WebRTC offer through backend gatekeeper
  const handleTestWebRTCOffer = async (targetSocketId) => {
    if (!socketRef.current || !socketRef.current.connected) return;
    const target = peersRef.current.get(targetSocketId);
    showToast(`Transmitting WebRTC offer to ${target?.name || 'peer'} through backend gatekeeper...`, 'info');

    if (webrtcManagerRef.current) {
      try {
        webrtcManagerRef.current.createPeerConnection(targetSocketId, {
          onIceCandidate: (candidate) => {
            socketRef.current.emit('webrtc-ice-candidate', {
              targetSocketId,
              candidate
            });
          },
          onConnectionStateChange: (state) => {
            setPeerConnectionStates((prev) => ({ ...prev, [targetSocketId]: state }));
          }
        });

        const offer = await webrtcManagerRef.current.createOffer(targetSocketId);
        socketRef.current.emit('webrtc-offer', {
          targetSocketId,
          offer
        });
      } catch (e) {
        console.warn('Failed real offer creation; sending diagnostic test offer:', e);
        socketRef.current.emit('webrtc-offer', {
          targetSocketId,
          offer: {
            type: 'offer',
            sdp: `v=0\r\no=ProxiSpeakTest ${Date.now()} 2 IN IP4 127.0.0.1\r\ns=SpatialAudio\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111`
          }
        });
      }
    }
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

  // Quick repositioning helper for Audio Check verification (<100px vs >100px)
  const handleMoveToDistance = (desiredDistance) => {
    const peers = Array.from(peersRef.current.values());
    if (peers.length === 0) {
      showToast('No peer avatars currently active in room.', 'info');
      return;
    }
    const targetPeer = peers[0];
    const targetX = targetPeer.x || targetPeer.targetX || 480;
    const targetY = targetPeer.y || targetPeer.targetY || 320;
    const angle = Math.atan2(posRef.current.y - targetY, posRef.current.x - targetX) || 0;
    const newX = Math.round(targetX + Math.cos(angle) * desiredDistance);
    const newY = Math.round(targetY + Math.sin(angle) * desiredDistance);

    posRef.current.x = newX;
    posRef.current.y = newY;
    posRef.current.vx = 0;
    posRef.current.vy = 0;
    posRef.current.targetX = null;
    posRef.current.targetY = null;
    setCoords({ x: newX, y: newY });

    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('avatar-move', { x: newX, y: newY, isMoving: false });
    }
    showToast(`Avatar stepped to ~${desiredDistance}px from ${targetPeer.name}.`, 'info');
  };

  // ====================================================
  // 7. PRE-RENDER STATIC WORLD BACKGROUND (OFFSCREEN CANVAS)
  // ====================================================
  useEffect(() => {
    const bgCanvas = document.createElement('canvas');
    bgCanvas.width = WORLD_WIDTH;
    bgCanvas.height = WORLD_HEIGHT;
    const bgCtx = bgCanvas.getContext('2d');

    // 1. Office floor
    bgCtx.fillStyle = '#0a0f1d';
    bgCtx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    // 2. High-performance static grid lines
    bgCtx.strokeStyle = '#131b2e';
    bgCtx.lineWidth = 1;
    const gridSize = 40;
    bgCtx.beginPath();
    for (let x = 0; x < WORLD_WIDTH; x += gridSize) {
      bgCtx.moveTo(x, 0);
      bgCtx.lineTo(x, WORLD_HEIGHT);
    }
    for (let y = 0; y < WORLD_HEIGHT; y += gridSize) {
      bgCtx.moveTo(0, y);
      bgCtx.lineTo(WORLD_WIDTH, y);
    }
    bgCtx.stroke();

    // 3. Office zones
    zones.forEach((z) => {
      bgCtx.fillStyle = z.bg;
      bgCtx.fillRect(z.x, z.y, z.width, z.height);

      bgCtx.strokeStyle = z.border;
      bgCtx.lineWidth = 1.5;
      bgCtx.setLineDash([6, 6]);
      bgCtx.strokeRect(z.x, z.y, z.width, z.height);
      bgCtx.setLineDash([]);

      // Zone header tag
      bgCtx.fillStyle = z.tagColor;
      bgCtx.font = 'bold 12px "Plus Jakarta Sans", sans-serif';
      bgCtx.textAlign = 'left';
      bgCtx.fillText(`${z.icon} ${z.name.toUpperCase()}`, z.x + 14, z.y + 24);
    });

    // 4. Central conference circle
    const centerX = WORLD_WIDTH / 2;
    const centerY = WORLD_HEIGHT / 2;
    bgCtx.beginPath();
    bgCtx.arc(centerX, centerY, 48, 0, Math.PI * 2);
    bgCtx.fillStyle = 'rgba(30, 41, 59, 0.6)';
    bgCtx.fill();
    bgCtx.strokeStyle = 'rgba(99, 102, 241, 0.4)';
    bgCtx.lineWidth = 2;
    bgCtx.stroke();

    bgCtx.fillStyle = '#94a3b8';
    bgCtx.font = '10px "Plus Jakarta Sans", sans-serif';
    bgCtx.textAlign = 'center';
    bgCtx.fillText('Main Round Table', centerX, centerY + 4);

    bgCanvasRef.current = bgCanvas;
  }, []);

  // ====================================================
  // 8. STEADY 60 FPS CANVAS RENDERING & 3D AUDIO LOOP
  // ====================================================
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationFrameId;
    let time = 0;

    const render = (now) => {
      animationFrameId = requestAnimationFrame(render);

      // Delta-time normalization: guarantees locked 60 FPS physics regardless of monitor refresh rate
      const deltaMs = now - lastFrameTimeRef.current;
      lastFrameTimeRef.current = now;
      const dt = Math.min(deltaMs / 1000, 0.1);
      const timeScale = dt * 60; // 1.0 at 60 FPS
      time += 0.03 * timeScale;

      // Real-time FPS & frame jitter telemetry
      fpsRef.current.count++;
      if (now - fpsRef.current.lastCheck >= 500) {
        const elapsed = (now - fpsRef.current.lastCheck) / 1000;
        const curFps = Math.round(fpsRef.current.count / elapsed);
        const frameTime = Number(deltaMs.toFixed(1));
        const jitter = Number(Math.abs(frameTime - 16.6).toFixed(1));
        setFpsMetric({ fps: Math.min(60, curFps), frameTime, jitter });
        fpsRef.current.count = 0;
        fpsRef.current.lastCheck = now;
      }

      ctx.clearRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

      // --- A. FAST DRAW PRE-RENDERED BACKGROUND ---
      if (bgCanvasRef.current) {
        ctx.drawImage(bgCanvasRef.current, 0, 0);
      } else {
        ctx.fillStyle = '#0a0f1d';
        ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
      }

      // --- B. DRAW DESKS & OBSTACLES (INCLUDING SOUNDPROOF WALLS & BOOTHS) ---
      obstaclesRef.current.forEach((obs) => {
        // Shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.fillRect(obs.x + 3, obs.y + 3, obs.width, obs.height);

        if (obs.blocksSound) {
          // --- SOUNDPROOF ACOUSTIC BARRIER (blocksSound: true) ---
          ctx.fillStyle = obs.color || '#312e81';
          ctx.fillRect(obs.x, obs.y, obs.width, obs.height);

          // Acoustic sound-dampening diagonal hatching
          ctx.save();
          ctx.beginPath();
          ctx.rect(obs.x, obs.y, obs.width, obs.height);
          ctx.clip();
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
          ctx.lineWidth = 2;
          const stripeStep = 12;
          ctx.beginPath();
          for (let sx = obs.x - obs.height; sx < obs.x + obs.width; sx += stripeStep) {
            ctx.moveTo(sx, obs.y + obs.height);
            ctx.lineTo(sx + obs.height, obs.y);
          }
          ctx.stroke();
          ctx.restore();

          // Acoustic barrier glowing border
          ctx.strokeStyle = '#818cf8';
          ctx.lineWidth = 2;
          ctx.strokeRect(obs.x, obs.y, obs.width, obs.height);

          // Obstacle label
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 9px "Plus Jakarta Sans", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(obs.label, obs.x + obs.width / 2, obs.y + obs.height / 2 - 3);

          // Soundproof tag
          ctx.fillStyle = '#f87171';
          ctx.font = 'bold 8px "Plus Jakarta Sans", sans-serif';
          ctx.fillText('🔇 SOUNDPROOF', obs.x + obs.width / 2, obs.y + obs.height / 2 + 8);
        } else {
          // --- OPEN COLLABORATION FURNITURE (DESKS / TABLES) ---
          ctx.fillStyle = obs.color || '#1e293b';
          ctx.fillRect(obs.x, obs.y, obs.width, obs.height);

          ctx.strokeStyle = '#334155';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(obs.x, obs.y, obs.width, obs.height);

          ctx.fillStyle = '#cbd5e1';
          ctx.font = '10px "Plus Jakarta Sans", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(obs.label, obs.x + obs.width / 2, obs.y + obs.height / 2 + 3);
        }
      });

      // --- C. UPDATE LOCAL AVATAR PHYSICS (DELTA-TIME SCALED) ---
      const pos = posRef.current;
      const keys = keysRef.current;
      const ACCELERATION = 0.85;
      const FRICTION = 0.82;
      const MAX_SPEED = 4.2;

      let ax = 0;
      let ay = 0;

      if (keys.w || keys.arrowup) ay -= 1;
      if (keys.s || keys.arrowdown) ay += 1;
      if (keys.a || keys.arrowleft) ax -= 1;
      if (keys.d || keys.arrowright) ax += 1;

      if (ax !== 0 && ay !== 0) {
        ax *= 0.7071;
        ay *= 0.7071;
      }

      if (pos.targetX !== null && pos.targetY !== null && ax === 0 && ay === 0) {
        const dx = pos.targetX - pos.x;
        const dy = pos.targetY - pos.y;
        const distToTarget = Math.hypot(dx, dy);

        if (distToTarget > 4) {
          ax = dx / distToTarget;
          ay = dy / distToTarget;
        } else {
          pos.targetX = null;
          pos.targetY = null;
          reticleRef.current = null;
        }
      }

      pos.vx = (pos.vx + ax * ACCELERATION * timeScale) * Math.pow(FRICTION, timeScale);
      pos.vy = (pos.vy + ay * ACCELERATION * timeScale) * Math.pow(FRICTION, timeScale);

      const speed = Math.hypot(pos.vx, pos.vy);
      if (speed > MAX_SPEED) {
        pos.vx = (pos.vx / speed) * MAX_SPEED;
        pos.vy = (pos.vy / speed) * MAX_SPEED;
      }

      let nextX = pos.x + pos.vx;
      let nextY = pos.y + pos.vy;

      const AVATAR_RADIUS = 16;
      nextX = Math.max(AVATAR_RADIUS + 8, Math.min(WORLD_WIDTH - AVATAR_RADIUS - 8, nextX));
      nextY = Math.max(AVATAR_RADIUS + 8, Math.min(WORLD_HEIGHT - AVATAR_RADIUS - 8, nextY));

      obstaclesRef.current.forEach((obs) => {
        const closestX = Math.max(obs.x, Math.min(nextX, obs.x + obs.width));
        const closestY = Math.max(obs.y, Math.min(nextY, obs.y + obs.height));
        const distX = nextX - closestX;
        const distY = nextY - closestY;
        const dist = Math.hypot(distX, distY);

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

      // Throttle React state updates to 10 FPS (100ms) to ensure Canvas RAF maintains steady 60 FPS
      if (now - lastUiThrottleRef.current > 100) {
        setCoords({ x: Math.round(pos.x), y: Math.round(pos.y) });
        setCurrentZone(getZoneAt(pos.x, pos.y));
        lastUiThrottleRef.current = now;
      }

      // Update 3D Audio listener position in Web Audio API
      if (webrtcManagerRef.current) {
        webrtcManagerRef.current.setListenerPosition(pos.x, pos.y, 0);
      }

      // Broadcast position update
      const isMoving = Math.abs(pos.vx) > 0.1 || Math.abs(pos.vy) > 0.1;
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

      // Draw mouse target ripple
      if (reticleRef.current) {
        const ret = reticleRef.current;
        ret.radius += 0.5 * timeScale;
        ret.opacity -= 0.025 * timeScale;
        if (ret.opacity > 0) {
          ctx.beginPath();
          ctx.arc(ret.x, ret.y, ret.radius, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(56, 189, 248, ${ret.opacity})`;
          ctx.lineWidth = 2;
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(ret.x, ret.y, 2.5, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(56, 189, 248, ${ret.opacity})`;
          ctx.fill();
        } else {
          reticleRef.current = null;
        }
      }

      // Fetch live audio levels
      const localAudioLevel = webrtcManagerRef.current?.getLocalAudioLevel() || 0;
      const isLocalSpeaking = localAudioLevel > 0.05 && !micMutedRef.current;

      // --- D. 3D SPATIAL AUDIO PANNING & WEBRTC STEREO SEPARATION BEAMS ---
      const activePeersInRadius = [];
      const peers = peersRef.current;

      peers.forEach((peer) => {
        // Delta-time independent smooth lerp
        const lerpFactor = 1 - Math.pow(1 - 0.22, timeScale);
        peer.x += (peer.targetX - peer.x) * lerpFactor;
        peer.y += (peer.targetY - peer.y) * lerpFactor;

        const dx = peer.x - pos.x;
        const dy = peer.y - pos.y;
        const distance = Math.hypot(dx, dy);

        // Check line-of-sight sound occlusion against obstacles with blocksSound: true
        const occlusion = checkSoundOcclusion([pos.x, pos.y], [peer.x, peer.y], obstaclesRef.current);
        const isSoundBlocked = occlusion.isBlocked;

        // Update WebRTC 3D volume attenuation based on 3D distance, stereo separation, & sound blockage
        let attenuation = null;
        if (webrtcManagerRef.current) {
          if (!peer.isBot) {
            attenuation = webrtcManagerRef.current.setPeerDistance(
              peer.socketId,
              distance,
              earshotRadiusRef.current,
              dx,
              dy,
              false,
              115,
              isSoundBlocked,
              0
            );
          } else {
            attenuation = webrtcManagerRef.current.calculateAttenuation(distance, {
              maxRadius: earshotRadiusRef.current,
              deltaX: dx,
              deltaY: dy,
              deltaZ: 0,
              isCulled: isSoundBlocked,
              stereoSeparation: stereoSeparationRef.current
            });
          }
        }

        // Adjust bot synthesizer gain dynamically based on distance & occlusion
        if (peer.isBot && botOscillatorRef.current) {
          const botGain = attenuation && distance <= earshotRadiusRef.current && !isSoundBlocked ? attenuation.gain * 0.08 : 0;
          botOscillatorRef.current.gain.gain.setValueAtTime(botGain, webrtcManagerRef.current?.getAudioContext()?.currentTime || 0);
        }

        if (distance <= earshotRadiusRef.current) {
          const baseGain = attenuation ? attenuation.gainPercent : Math.max(10, Math.min(100, Math.round((1 - distance / earshotRadiusRef.current) * 100)));
          const effectiveGain = isSoundBlocked ? 0 : baseGain;
          const peerAudioLvl = webrtcManagerRef.current?.getPeerAudioLevel(peer.socketId) || (peer.isBot && botAudioActiveRef.current && !isSoundBlocked ? 0.35 : 0);

          activePeersInRadius.push({
            socketId: peer.socketId,
            name: peer.name,
            role: peer.role,
            distance: Math.round(distance),
            gain: effectiveGain,
            isSoundBlocked,
            blockingObstacle: occlusion.blockingObstacle?.label || null,
            decibels: isSoundBlocked ? -Infinity : attenuation?.decibels,
            filterFreq: attenuation?.filterFreq,
            pan: attenuation?.pan,
            spatial3D: attenuation?.spatial3D,
            audioLevel: peerAudioLvl,
            isSpeaking: peerAudioLvl > 0.05 && !peer.micMuted && !isSoundBlocked,
            connectionState: peerConnectionStatesRef.current[peer.socketId] || (peer.isBot ? 'connected' : 'connecting')
          });

          if (isSoundBlocked) {
            // --- DRAW SOUND-OCCLUDED BEAM (BLOCKED BY ACOUSTIC OBSTACLE) ---
            ctx.beginPath();
            ctx.setLineDash([5, 5]);
            ctx.moveTo(pos.x, pos.y);
            ctx.lineTo(peer.x, peer.y);
            ctx.strokeStyle = 'rgba(244, 63, 94, 0.7)';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.setLineDash([]);

            // Acoustic absorption ripple at obstacle impact point
            if (occlusion.blockingObstacle?.hitPoint) {
              const hit = occlusion.blockingObstacle.hitPoint;
              const ripR = (time * 16) % 18;
              ctx.beginPath();
              ctx.arc(hit.x, hit.y, ripR, 0, Math.PI * 2);
              ctx.strokeStyle = `rgba(244, 63, 94, ${0.8 - ripR / 18})`;
              ctx.lineWidth = 1.5;
              ctx.stroke();
            }

            // Midpoint blocked sound badge
            const midX = (pos.x + peer.x) / 2;
            const midY = (pos.y + peer.y) / 2;
            ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
            ctx.beginPath();
            ctx.roundRect(midX - 70, midY - 12, 140, 24, 6);
            ctx.fill();
            ctx.strokeStyle = 'rgba(244, 63, 94, 0.6)';
            ctx.lineWidth = 1;
            ctx.stroke();

            ctx.fillStyle = '#f87171';
            ctx.font = 'bold 9px "Plus Jakarta Sans", sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`🔇 BLOCKED: ${occlusion.blockingObstacle?.label || 'Acoustic Wall'}`, midX, midY + 4);
          } else {
            // --- DYNAMIC WEBRTC ACOUSTIC SINE WAVE BEAM WITH 3D STEREO SEPARATION ---
            const normalX = -dy / distance;
            const normalY = dx / distance;
            const segments = 32;

            ctx.beginPath();
            for (let s = 0; s <= segments; s++) {
              const t = s / segments;
              const px = pos.x + dx * t;
              const py = pos.y + dy * t;

              // Amplitude increases when either peer or user speaks
              const waveAmp = (4 + 10 * (localAudioLevel + peerAudioLvl)) * Math.sin(t * Math.PI);
              const waveOffset = Math.sin(t * 14 - time * 6) * waveAmp;

              const wx = px + normalX * waveOffset;
              const wy = py + normalY * waveOffset;

              if (s === 0) ctx.moveTo(wx, wy);
              else ctx.lineTo(wx, wy);
            }

            const beamGrad = ctx.createLinearGradient(pos.x, pos.y, peer.x, peer.y);
            beamGrad.addColorStop(0, `rgba(56, 189, 248, ${0.4 + (effectiveGain / 100) * 0.5})`);
            beamGrad.addColorStop(0.5, `rgba(99, 102, 241, ${0.5 + (effectiveGain / 100) * 0.5})`);
            beamGrad.addColorStop(1, `rgba(16, 185, 129, ${0.4 + (effectiveGain / 100) * 0.5})`);

            ctx.strokeStyle = beamGrad;
            ctx.lineWidth = 2.5;
            ctx.stroke();

            // Midpoint audio wave pulse circle
            const midX = (pos.x + peer.x) / 2;
            const midY = (pos.y + peer.y) / 2;
            const pulseRadius = (time * 18) % 24;

            ctx.beginPath();
            ctx.arc(midX, midY, pulseRadius, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(56, 189, 248, ${0.7 - pulseRadius / 24})`;
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // 3D Audio Stereo Separation Badge at midpoint
            const panVal = attenuation?.pan !== undefined ? attenuation.pan : 0;
            const panStr = panVal > 0.05 ? `+${panVal} R` : panVal < -0.05 ? `${panVal} L` : '3D CTR';
            const badgeText = `GAIN: ${effectiveGain}% • ${panStr} (${Math.round(distance)}px)`;

            ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
            ctx.beginPath();
            ctx.roundRect(midX - 66, midY - 11, 132, 22, 6);
            ctx.fill();
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
            ctx.lineWidth = 1;
            ctx.stroke();

            ctx.fillStyle = '#38bdf8';
            ctx.font = 'bold 9px "Plus Jakarta Sans", sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(badgeText, midX, midY + 4);
          }
        }
      });

      // Throttle peersInEarshot update to prevent React render spikes
      if (activePeersInRadius.length !== peersInEarshotRef.current.length || now - lastUiThrottleRef.current > 100) {
        setPeersInEarshot(activePeersInRadius);
        peersInEarshotRef.current = activePeersInRadius;
      }

      // --- E. DRAW EARSHOT PROXIMITY RADIUS ---
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, earshotRadiusRef.current, 0, Math.PI * 2);
      ctx.strokeStyle = activePeersInRadius.length > 0 ? 'rgba(16, 185, 129, 0.5)' : 'rgba(99, 102, 241, 0.25)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 5]);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = activePeersInRadius.length > 0 ? 'rgba(16, 185, 129, 0.06)' : 'rgba(99, 102, 241, 0.03)';
      ctx.fill();

      // --- F. DRAW REMOTE PEER AVATARS ---
      peers.forEach((peer) => {
        const peerAudioLvl = webrtcManagerRef.current?.getPeerAudioLevel(peer.socketId) || (peer.isBot && botAudioActiveRef.current ? 0.35 : 0);
        const isPeerSpeaking = peerAudioLvl > 0.05 && !peer.micMuted;
        const isConnected = peerConnectionStatesRef.current[peer.socketId] === 'connected' || (peer.isBot && botAudioActiveRef.current);

        // Acoustic speech ripples when peer speaks
        if (isPeerSpeaking) {
          for (let r = 1; r <= 2; r++) {
            const rippleR = AVATAR_RADIUS + ((time * 22 + r * 12) % 24);
            const rippleAlpha = Math.max(0, 0.6 - (rippleR - AVATAR_RADIUS) / 24);
            ctx.beginPath();
            ctx.arc(peer.x, peer.y, rippleR, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(52, 211, 153, ${rippleAlpha})`;
            ctx.lineWidth = 2;
            ctx.stroke();
          }
        }

        // Shadow
        ctx.beginPath();
        ctx.arc(peer.x + 2, peer.y + 2, AVATAR_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fill();

        // Body
        ctx.beginPath();
        ctx.arc(peer.x, peer.y, AVATAR_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = peer.avatarColor || '#10b981';
        ctx.fill();
        ctx.strokeStyle = isPeerSpeaking ? '#34d399' : '#ffffff';
        ctx.lineWidth = isPeerSpeaking ? 3 : 2;
        ctx.stroke();

        // Initial letter
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText((peer.name || 'U').charAt(0).toUpperCase(), peer.x, peer.y + 4);

        // Animated speech equalizer icon above avatar if speaking
        if (isPeerSpeaking) {
          const eqX = peer.x - 8;
          const eqY = peer.y - 24;
          for (let b = 0; b < 3; b++) {
            const barH = 4 + Math.abs(Math.sin(time * 8 + b * 2)) * 8;
            ctx.fillStyle = '#34d399';
            ctx.fillRect(eqX + b * 6, eqY - barH, 4, barH);
          }
        }

        // WebRTC audio mesh badge
        if (isConnected) {
          ctx.beginPath();
          ctx.arc(peer.x + 13, peer.y - 12, 5, 0, Math.PI * 2);
          ctx.fillStyle = '#10b981';
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        // Name tag & role
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 10px "Plus Jakarta Sans", sans-serif';
        ctx.fillText(peer.name.split(' ')[0], peer.x, peer.y + 28);

        ctx.fillStyle = '#94a3b8';
        ctx.font = '9px "Plus Jakarta Sans", sans-serif';
        ctx.fillText(peer.role || 'Member', peer.x, peer.y + 39);
      });

      // --- G. DRAW LOCAL USER AVATAR ---
      // Voice acoustic emission ripples
      if (isLocalSpeaking) {
        for (let r = 1; r <= 3; r++) {
          const rippleR = AVATAR_RADIUS + ((time * 26 + r * 14) % 32);
          const rippleAlpha = Math.max(0, 0.7 - (rippleR - AVATAR_RADIUS) / 32);
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, rippleR, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(56, 189, 248, ${rippleAlpha})`;
          ctx.lineWidth = 2.5;
          ctx.stroke();
        }
      } else {
        const pulse = 3 * Math.sin(time * 3);
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, AVATAR_RADIUS + 3 + pulse, 0, Math.PI * 2);
        ctx.strokeStyle = `${userRef.current?.avatarColor || '#6366f1'}66`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Shadow
      ctx.beginPath();
      ctx.arc(pos.x + 2, pos.y + 2, AVATAR_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.fill();

      // Body circle
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, AVATAR_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = userRef.current?.avatarColor || '#6366f1';
      ctx.fill();
      ctx.strokeStyle = isLocalSpeaking ? '#38bdf8' : '#ffffff';
      ctx.lineWidth = isLocalSpeaking ? 3 : 2.5;
      ctx.stroke();

      // Initial
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 13px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText((userRef.current?.name || 'You').charAt(0).toUpperCase(), pos.x, pos.y + 4.5);

      // Name & role above avatar
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(userRef.current?.name ? userRef.current.name.split(' ')[0] : 'You', pos.x, pos.y - 25);

      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 9px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(`YOU (${userRef.current?.role || 'Developer'})`, pos.x, pos.y - 14);

      // Microphone status icon indicator
      if (micMutedRef.current || !isMicActiveRef.current) {
        ctx.beginPath();
        ctx.arc(pos.x + 12, pos.y - 12, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#f43f5e';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();
      } else if (isMicActiveRef.current) {
        ctx.beginPath();
        ctx.arc(pos.x + 12, pos.y - 12, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#10b981';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // --- H. STEADY 60 FPS PERFORMANCE & 3D AUDIO OVERLAY PILL ---
      ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
      ctx.beginPath();
      ctx.roundRect(WORLD_WIDTH - 250, 16, 234, 28, 8);
      ctx.fill();
      ctx.strokeStyle = fpsMetric.fps >= 58 ? 'rgba(16, 185, 129, 0.5)' : 'rgba(245, 158, 11, 0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(WORLD_WIDTH - 238, 30, 4, 0, Math.PI * 2);
      ctx.fillStyle = fpsMetric.fps >= 58 ? '#10b981' : '#f59e0b';
      ctx.fill();

      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 10px "Plus Jakarta Sans", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(
        `${fpsMetric.fps}.0 FPS (${fpsMetric.frameTime}ms) • 3D PAN`,
        WORLD_WIDTH - 228,
        33.5
      );
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

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
              <span className="text-[9px] sm:text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 whitespace-nowrap">
                Week 2: WebRTC Audio Mesh
              </span>
              <span className="text-[9px] sm:text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 flex items-center gap-1 whitespace-nowrap">
                <Database className="w-2.5 h-2.5" />
                MongoDB: {obstacles.length} Obstacles ({obstacles.filter((o) => o.blocksSound).length} 🔇)
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
              onClick={() => setIsMySQLModalOpen(true)}
              className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-cyan-700/80 hover:bg-cyan-600 border border-cyan-500/40 text-white text-[11px] sm:text-xs font-semibold flex items-center space-x-1.5 shadow-md shadow-cyan-600/20 cursor-pointer transition-all"
              title="Connect & Inspect MySQL Database on localhost:3306"
            >
              <Database className="w-3.5 h-3.5 text-cyan-200" />
              <span>MySQL :3306 {mySQLStatus?.connected ? '🟢' : '🟡'}</span>
            </button>

            <button
              type="button"
              onClick={() => setIsRoomManagerOpen(true)}
              className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-violet-600/80 hover:bg-violet-600 border border-violet-500/40 text-white text-[11px] sm:text-xs font-semibold flex items-center space-x-1.5 shadow-md shadow-violet-600/20 cursor-pointer transition-all"
              title="Save & Manage Office Layout and Sound-Blocking Obstacles in MongoDB"
            >
              <Building2 className="w-3.5 h-3.5 text-violet-200" />
              <span>Room & Obstacles ({obstacles.filter((o) => o.blocksSound).length} 🔇)</span>
            </button>

            <button
              type="button"
              onClick={() => setIsAudioCheckOpen(true)}
              className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 border border-cyan-400/50 text-white text-[11px] sm:text-xs font-bold flex items-center space-x-1.5 shadow-md shadow-cyan-600/30 cursor-pointer transition-all animate-pulse"
              title="Demonstrate two browsers establishing WebRTC audio connection via signaling server"
            >
              <Headphones className="w-3.5 h-3.5 text-cyan-200" />
              <span>Audio Check (2-Browser P2P)</span>
            </button>

            <button
              type="button"
              onClick={() => setIsSpatial3DModalOpen(true)}
              className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 border border-purple-400/50 text-white text-[11px] sm:text-xs font-bold flex items-center space-x-1.5 shadow-md shadow-purple-600/30 cursor-pointer transition-all"
              title="Configure 3D Spatial Audio & Stereo Separation Width"
            >
              <Sliders className="w-3.5 h-3.5 text-purple-200" />
              <span>3D Audio ({Math.round(stereoSeparation * 100)}% Stereo)</span>
            </button>

            <button
              type="button"
              onClick={() => setIsSpatialAuditOpen(true)}
              className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-emerald-600/80 hover:bg-emerald-600 border border-emerald-500/40 text-white text-[11px] sm:text-xs font-semibold flex items-center space-x-1.5 shadow-md shadow-emerald-600/20 cursor-pointer transition-all"
              title="Run Mid-Project Review Spatial Audit (< 20ms Verification)"
            >
              <Activity className="w-3.5 h-3.5 text-emerald-200" />
              <span>Spatial Audit (&lt;20ms)</span>
            </button>

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
              <span>Spawn Far (&gt;100px)</span>
            </button>

            <button
              type="button"
              onClick={() => setIsDiagnosticsOpen(true)}
              className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-cyan-300 border border-slate-700 text-[11px] sm:text-xs font-medium flex items-center space-x-1 cursor-pointer transition-colors"
              title="Open WebRTC Audio Diagnostics"
            >
              <Wrench className="w-3.5 h-3.5" />
              <span>Diagnostics</span>
            </button>

            <button
              type="button"
              onClick={handleResetPosition}
              className="p-1.5 sm:p-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white border border-slate-700 cursor-pointer transition-colors"
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

      {/* Microphone Permission Banner if not yet active */}
      {!isMicActive && (
        <div className="bg-gradient-to-r from-indigo-950/90 via-slate-900 to-indigo-950/90 border border-indigo-500/40 rounded-2xl p-3 sm:p-4 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-3 animate-fadeIn">
          <div className="flex items-center space-x-3 text-center sm:text-left">
            <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-300 shrink-0">
              <Headphones className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-white">
                WebRTC Peer-to-Peer Spatial Audio Ready
              </h3>
              <p className="text-[11px] text-slate-300">
                Grant microphone access using <code className="text-cyan-300 font-mono">getUserMedia</code> to automatically talk with teammates whenever you step within 100 pixels!
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleInitMicrophone}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center space-x-2 shadow-lg shadow-indigo-600/30 cursor-pointer transition-all shrink-0"
          >
            <Mic className="w-4 h-4 text-cyan-300" />
            <span>Enable Microphone</span>
          </button>
        </div>
      )}

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
                WebRTC Mesh Gatekeeper: 100px Limit
              </span>
            </div>
          </div>

          {/* Active Earshot Card if peers are nearby */}
          {peersInEarshot.length > 0 ? (
            <div className="bg-emerald-950/90 backdrop-blur-md px-2.5 sm:px-3.5 py-2 sm:py-2.5 rounded-xl border border-emerald-500/40 text-xs shadow-xl animate-fadeIn pointer-events-auto">
              <div className="flex items-center space-x-1.5 sm:space-x-2 text-emerald-400 font-bold mb-1 text-[11px] sm:text-xs">
                <Volume2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-bounce shrink-0" />
                <span>In 100px Earshot ({peersInEarshot.length})</span>
              </div>
              {peersInEarshot.map((peer, idx) => (
                <div key={idx} className="text-[10px] sm:text-[11px] text-emerald-200/90 font-mono flex items-center justify-between gap-2 py-0.5">
                  <span className="truncate">{peer.name}:</span>
                  <div className="flex items-center space-x-1.5 shrink-0">
                    {peer.isSoundBlocked ? (
                      <span className="text-rose-400 font-bold text-[10px]">
                        🔇 BLOCKED ({peer.blockingObstacle || 'Wall'})
                      </span>
                    ) : (
                      <>
                        <span className="text-emerald-400 font-bold">{peer.gain}% ({peer.distance}px)</span>
                        {peer.pan !== undefined && (
                          <span className="text-[9px] px-1 py-0.5 rounded font-mono bg-purple-900/60 text-purple-200 border border-purple-500/30">
                            {peer.pan > 0.05 ? `+${peer.pan} R` : peer.pan < -0.05 ? `${peer.pan} L` : '3D CTR'}
                          </span>
                        )}
                      </>
                    )}
                    <span className={`text-[9px] px-1 py-0.5 rounded font-mono ${peer.isSoundBlocked ? 'bg-rose-950/80 text-rose-300 border border-rose-500/30' : 'bg-emerald-900/80 text-emerald-300'}`}>
                      {peer.isSoundBlocked ? 'Sound Muted' : peer.connectionState === 'connected' ? 'Live Audio' : 'Connecting'}
                    </span>
                    {peer.socketId && (
                      <button
                        type="button"
                        onClick={() => handleTestWebRTCOffer(peer.socketId)}
                        className="px-1.5 py-0.5 rounded bg-indigo-900/80 hover:bg-indigo-800 text-[9px] text-indigo-200 border border-indigo-600/40 cursor-pointer"
                        title="Dispatch WebRTC offer through backend"
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
              Walk within 100px of a teammate to chat
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
              micMuted || !isMicActive
                ? 'bg-rose-950/60 border-rose-500/50 text-rose-300 hover:bg-rose-900/60'
                : 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300 hover:bg-emerald-900/60'
            }`}
          >
            {micMuted || !isMicActive ? <MicOff className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Mic className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
            <span className="text-[11px] sm:text-xs font-semibold">
              {!isMicActive ? 'Mic Inactive' : micMuted ? 'Muted' : 'Speaking'}
            </span>
          </button>

          {/* Bot Audio Simulation Toggle (For single-browser testing) */}
          <button
            type="button"
            onClick={toggleBotAudio}
            className={`p-1.5 sm:p-2 rounded-xl border cursor-pointer transition-all flex items-center space-x-1.5 ${
              botAudioActive
                ? 'bg-indigo-950/70 border-indigo-500/50 text-indigo-300 animate-pulse'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
            }`}
            title="Toggle synthetic voice tone on spawned bot to test spatial distance attenuation"
          >
            <Headphones className="w-3.5 h-3.5" />
            <span className="text-[11px] sm:text-xs font-medium">
              {botAudioActive ? 'Bot Audio ON' : 'Bot Audio'}
            </span>
          </button>

          {/* WebRTC Limit Badge */}
          <div className="flex items-center space-x-1.5 border-l border-slate-800 pl-2 text-[10px] text-slate-400 font-mono">
            <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
            <span>Limit: <strong className="text-white">100px</strong></span>
          </div>
        </div>
      </div>

      {/* HTML5 Canvas Real-Time WebRTC Audio Waveform Visualizer */}
      <AudioWaveformVisualizer
        webrtcManager={webrtcManagerRef.current}
        isMicActive={isMicActive}
        isMicMuted={micMuted}
        onToggleMic={handleToggleMic}
        onInitMic={handleInitMicrophone}
        connectedPeersCount={peersInEarshot.length}
      />

      {/* Instructions & Multi-Client Testing Pill */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Navigation Instructions */}
        <div className="p-3.5 rounded-2xl bg-slate-900/70 border border-slate-800/80 flex items-center space-x-3 text-xs text-slate-300">
          <div className="p-2 rounded-xl bg-slate-800 text-cyan-400 shrink-0">
            <Keyboard className="w-4 h-4" />
          </div>
          <div>
            <span className="font-semibold text-white block">100-Pixel WebRTC Audio Mesh:</span>
            <span className="text-slate-400 text-[11px]">
              The Node.js server strictly verifies distance before routing WebRTC offers & answers. Walk within <strong className="text-cyan-300">100 pixels</strong> of a teammate to open bidirectional Opus audio!
            </span>
          </div>
        </div>

        {/* Multi-Tab Testing Tip */}
        <div className="p-3.5 rounded-2xl bg-slate-900/70 border border-slate-800/80 flex items-center space-x-3 text-xs text-slate-300">
          <div className="p-2 rounded-xl bg-slate-800 text-indigo-400 shrink-0">
            <ExternalLink className="w-4 h-4" />
          </div>
          <div className="flex-1">
            <span className="font-semibold text-white block">Dual-Browser Tab Testing:</span>
            <span className="text-slate-400 text-[11px]">
              Open a second browser tab at <code className="text-indigo-300 font-mono">http://localhost:3000</code> to watch both avatars move, enter the 100px radius, and connect two-way peer audio!
            </span>
          </div>
        </div>
      </div>

      {/* ====================================================
          8. MONGODB $near PROXIMITY GROUPS MODAL
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

      {/* ====================================================
          9. WEBRTC DIAGNOSTICS & AUDIO MESH MODAL
         ==================================================== */}
      {isDiagnosticsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                  <Wrench className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">WebRTC Audio Mesh Diagnostics</h3>
                  <p className="text-[11px] text-slate-400">
                    Peer-to-peer audio connection parameters & STUN diagnostics
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsDiagnosticsOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Diagnostics Stats */}
            <div className="my-4 space-y-3">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Local Media</span>
                  <span className="text-white font-bold block mt-1">
                    {isMicActive ? (micMuted ? 'Muted' : 'Live Stream') : 'Not Initialized'}
                  </span>
                  <span className="text-[10px] text-cyan-400 font-mono">getUserMedia Opus 48kHz</span>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Proximity Gatekeeper</span>
                  <span className="text-emerald-400 font-bold block mt-1">Strict 100px Radius</span>
                  <span className="text-[10px] text-slate-400 font-mono">Server Enforced</span>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider block">STUN Servers</span>
                  <span className="text-indigo-300 font-mono text-[11px] block mt-1 truncate">
                    stun.l.google.com:19302
                  </span>
                  <span className="text-[10px] text-emerald-400 font-mono">NAT Traversal Ready</span>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Active P2P Meshes</span>
                  <span className="text-white font-bold block mt-1">
                    {peersInEarshot.length} {peersInEarshot.length === 1 ? 'Peer' : 'Peers'} in Range
                  </span>
                  <span className="text-[10px] text-cyan-400 font-mono">
                    Dynamic Gain Attenuation
                  </span>
                </div>
              </div>

              {/* Connected Peers Table */}
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <h4 className="text-[11px] font-bold text-slate-300 mb-2">Connected Peers & Gain Attenuation:</h4>
                {peersInEarshot.length > 0 ? (
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                    {peersInEarshot.map((peer, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-slate-900 border border-slate-800/80 text-xs">
                        <div className="flex items-center space-x-2">
                          <span className={`w-2 h-2 rounded-full ${peer.connectionState === 'connected' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                          <span className="text-white font-medium">{peer.name}</span>
                        </div>
                        <div className="flex items-center space-x-2 font-mono text-[11px]">
                          <span className="text-cyan-300">{peer.distance}px</span>
                          <span className="text-emerald-400 font-bold">{peer.gain}% Gain</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-500 italic py-2 text-center">
                    No peer avatars within 100px earshot. Spawn a near peer or open a second browser window to inspect.
                  </p>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-400 text-[11px]">
                Web Audio API Attenuation: <strong className="text-cyan-300">Active</strong>
              </span>
              <button
                type="button"
                onClick={() => setIsDiagnosticsOpen(false)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-750 text-white font-semibold rounded-xl text-xs transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================
          10. SPATIAL AUDIT & LATENCY BENCHMARK MODAL (< 20ms SLA)
         ==================================================== */}
      <SpatialAuditModal
        isOpen={isSpatialAuditOpen}
        onClose={() => setIsSpatialAuditOpen(false)}
      />

      {/* ====================================================
          11. AUDIO CHECK: TWO-BROWSER WEBRTC AUDIO INSPECTOR
         ==================================================== */}
      <AudioCheckModal
        isOpen={isAudioCheckOpen}
        onClose={() => setIsAudioCheckOpen(false)}
        webrtcManager={webrtcManagerRef.current}
        socket={socketRef.current}
        selfAvatar={{ x: coords.x, y: coords.y, name: user?.name, socketId: socketRef.current?.id }}
        peers={peersRef.current}
        peerConnectionStates={peerConnectionStates}
        onMoveToDistance={handleMoveToDistance}
        showToast={showToast}
        clusterInfo={clusterInfo}
      />

      {/* ====================================================
          12. ROOM PERSISTENCE & SOUND-BLOCKING OBSTACLES (MONGODB)
         ==================================================== */}
      <RoomLayoutModal
        isOpen={isRoomManagerOpen}
        onClose={() => setIsRoomManagerOpen(false)}
        obstacles={obstacles}
        onUpdateObstacles={handleUpdateObstacles}
        onSaveToMongo={handleSaveLayoutToMongo}
        onResetLayout={handleResetLayout}
        roomSource={roomSource}
        isSaving={isSavingRoom}
        showToast={showToast}
      />

      {/* ====================================================
          13. MYSQL DATABASE MANAGER (LOCALHOST:3306)
         ==================================================== */}
      <MySQLStatusModal
        isOpen={isMySQLModalOpen}
        onClose={() => {
          setIsMySQLModalOpen(false);
          fetch('/api/mysql/status')
            .then((r) => r.json())
            .then((data) => data.success && setMySQLStatus(data.data))
            .catch(() => {});
        }}
      />

      {/* ====================================================
          14. 3D SPATIAL AUDIO & STEREO SEPARATION MODAL
         ==================================================== */}
      <Spatial3DAudioModal
        isOpen={isSpatial3DModalOpen}
        onClose={() => setIsSpatial3DModalOpen(false)}
        stereoSeparation={stereoSeparation}
        onChangeStereoSeparation={setStereoSeparation}
        panningMode={panningMode}
        onChangePanningMode={setPanningMode}
        peersInEarshot={peersInEarshot}
        fpsMetric={fpsMetric}
        webrtcManager={webrtcManagerRef.current}
      />
    </div>
  );
}
