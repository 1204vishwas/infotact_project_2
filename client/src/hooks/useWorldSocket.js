import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const DEFAULT_BOUNDS = { width: 1200, height: 720, padding: 48 };
const DEFAULT_EARSHOT = 150;

// Normalize the many shapes `user.location` can take (Mongo array, fallback
// object, persisted JSON string) into a plain {x, y} pair.
function resolveSpawn(user) {
  const loc = user && user.location;
  if (Array.isArray(loc) && loc.length >= 2) {
    return { x: Number(loc[0]) || 250, y: Number(loc[1]) || 250 };
  }
  if (loc && Array.isArray(loc.coordinates) && loc.coordinates.length >= 2) {
    return { x: Number(loc.coordinates[0]) || 250, y: Number(loc.coordinates[1]) || 250 };
  }
  return { x: 600, y: 360 };
}

/**
 * useWorldSocket
 * Manages the realtime coordinate-broadcasting channel for a single avatar.
 * - Joins the 2D office over Socket.io (JWT authenticated when available).
 * - Tracks peers in a ref for 60fps canvas rendering.
 * - Exposes a throttled `peers` state (~5Hz) for HUD / member lists.
 * - Broadcasts this avatar's coordinates via `sendMove(x, y)`.
 */
export default function useWorldSocket({ user, token }) {
  const socketRef = useRef(null);
  const peersRef = useRef(new Map());
  const selfIdRef = useRef(null);

  const [status, setStatus] = useState('connecting'); // connecting | connected | offline
  const [selfId, setSelfId] = useState(null);
  const [bounds, setBounds] = useState(DEFAULT_BOUNDS);
  const [peers, setPeers] = useState([]);
  const [onlineCount, setOnlineCount] = useState(1);

  const spawn = useMemo(() => resolveSpawn(user), [user]);

  useEffect(() => {
    if (!user) return undefined;

    const socket = io({
      auth: { token: token || undefined },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1500
    });
    socketRef.current = socket;

    const commitPeers = () => setPeers(Array.from(peersRef.current.values()));

    const handleConnect = () => {
      setStatus('connected');
      socket.emit('world:join', {
        id: user.id,
        name: user.name,
        username: user.username,
        role: user.role,
        department: user.department,
        avatarColor: user.avatarColor || '#6366f1',
        avatarIcon: user.avatarIcon,
        x: spawn.x,
        y: spawn.y
      });
    };

    const handleConnectError = () => setStatus('offline');

    const handleState = (data) => {
      if (data.bounds) setBounds({ ...DEFAULT_BOUNDS, ...data.bounds });
      selfIdRef.current = data.selfId;
      setSelfId(data.selfId);
      peersRef.current.clear();
      (data.players || [])
        .filter((p) => p.id !== data.selfId)
        .forEach((p) => peersRef.current.set(p.id, p));
      commitPeers();
    };

    const handleJoined = (player) => {
      if (player.id === selfIdRef.current) return;
      peersRef.current.set(player.id, player);
      commitPeers();
    };

    const handleMoved = ({ id, x, y }) => {
      const existing = peersRef.current.get(id);
      if (existing) {
        existing.x = x;
        existing.y = y;
      }
    };

    const handleLeft = ({ id }) => {
      peersRef.current.delete(id);
      commitPeers();
    };

    const handleStatus = ({ id, status: nextStatus }) => {
      const existing = peersRef.current.get(id);
      if (existing) existing.status = nextStatus;
    };

    const handlePresence = ({ count }) => setOnlineCount(Math.max(1, count || 1));

    socket.on('connect', handleConnect);
    socket.on('connect_error', handleConnectError);
    socket.on('disconnect', () => setStatus('offline'));
    socket.on('world:state', handleState);
    socket.on('world:player-joined', handleJoined);
    socket.on('world:player-moved', handleMoved);
    socket.on('world:player-left', handleLeft);
    socket.on('world:player-status', handleStatus);
    socket.on('world:presence', handlePresence);

    // Throttled HUD sync — the canvas reads peersRef directly at 60fps.
    const hudTimer = setInterval(commitPeers, 200);

    return () => {
      clearInterval(hudTimer);
      socket.emit('world:leave');
      socket.off();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user, token, spawn]);

  const sendMove = useCallback((x, y) => {
    const socket = socketRef.current;
    if (socket && socket.connected) {
      socket.emit('world:move', { x, y });
    }
  }, []);

  const setMuted = useCallback((muted) => {
    const socket = socketRef.current;
    if (socket && socket.connected) {
      socket.emit('world:status', { status: muted ? 'in-meeting' : 'online' });
    }
  }, []);

  return {
    socketRef,
    peersRef,
    selfIdRef,
    status,
    selfId,
    bounds,
    peers,
    onlineCount,
    earshotRadius: DEFAULT_EARSHOT,
    sendMove,
    setMuted
  };
}
