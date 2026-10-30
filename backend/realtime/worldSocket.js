const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const { JWT_SECRET } = require('../middleware/auth');
const {
  OFFICE_BOUNDS,
  HEARING_RADIUS,
  players,
  sanitizePosition,
  toPublicPlayer,
  listPlayers,
  getPlayerByUserId
} = require('./worldState');

// Throttle DB writes per player so that 30-60Hz client movement does not
// hammer MongoDB. The in-memory roster is the source of truth in real time.
const lastPersistAt = new Map();
const PERSIST_INTERVAL_MS = 2500;

// A server-approved offer opens a short authorization window for that exact
// pair. The answer and trickle ICE can then finish even if an avatar drifts
// during setup. Proximity is always re-checked against the authoritative
// roster coordinates; payload-supplied positions are never used.
const SIGNAL_AUTH_TTL_MS = 30000;
const signalAuth = new Map();

function pairKey(a, b) {
  return JSON.stringify([String(a), String(b)].sort());
}

// Short non-identifying reference for logs (no names, emails, or tokens).
function idRef(id) {
  return String(id || 'unknown').slice(-6);
}

function distanceBetween(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pruneExpiredAuth(now = Date.now()) {
  for (const [key, entry] of signalAuth) {
    if (entry.expiresAt <= now) signalAuth.delete(key);
  }
}

function authorizePair(a, b) {
  pruneExpiredAuth();
  signalAuth.set(pairKey(a, b), {
    members: [String(a), String(b)],
    expiresAt: Date.now() + SIGNAL_AUTH_TTL_MS
  });
}

function getPairAuth(a, b) {
  return signalAuth.get(pairKey(a, b)) || null;
}

function revokePairsFor(userId) {
  const id = String(userId);
  for (const [key, entry] of signalAuth) {
    if (entry.members.includes(id)) signalAuth.delete(key);
  }
}

function rejectSignal(event, reason, details = {}) {
  console.warn(`[${event}] rejected: ${reason}`, details);
}

function persistPosition(player) {
  if (mongoose.connection.readyState !== 1) return;
  const now = Date.now();
  const last = lastPersistAt.get(player.id) || 0;
  if (now - last < PERSIST_INTERVAL_MS) return;
  lastPersistAt.set(player.id, now);

  // Only persist records backed by a real Mongo ObjectId.
  if (!mongoose.Types.ObjectId.isValid(player.id)) return;

  User.findByIdAndUpdate(player.id, {
    $set: { 'location.0': player.x, 'location.1': player.y, status: 'online' }
  }).catch(() => {
    /* Non-fatal: realtime roster already holds the latest coordinates. */
  });
}

function initWorldSocket(io) {
  // Authenticate every socket using the same JWT issued by the auth module.
  // Guests (offline/local demo tokens) are still allowed into the world so the
  // canvas remains fully testable without a running database.
  io.use((socket, next) => {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    socket.data.user = null;

    if (token && !String(token).startsWith('local_jwt_token')) {
      try {
        socket.data.user = jwt.verify(token, JWT_SECRET);
      } catch (err) {
        socket.data.user = null;
      }
    }
    next();
  });

  io.on('connection', (socket) => {
    // -------------------------------------------------------------------
    // world:join — register the avatar into the office and hydrate the client
    // -------------------------------------------------------------------
    socket.on('world:join', (profile = {}) => {
      if (players.has(socket.id)) return;

      const spawn = sanitizePosition(
        profile.x != null ? profile.x : Math.random() * OFFICE_BOUNDS.width,
        profile.y != null ? profile.y : Math.random() * OFFICE_BOUNDS.height
      );

      const player = {
        id: (socket.data.user && socket.data.user.id) || profile.id || socket.id,
        socketId: socket.id,
        name: profile.name || 'Anonymous Colleague',
        username: profile.username || 'guest',
        role: profile.role || 'Team Member',
        department: profile.department || 'Engineering',
        avatarColor: profile.avatarColor || '#6366f1',
        avatarIcon: profile.avatarIcon || 'user',
        status: profile.status || 'online',
        x: spawn.x,
        y: spawn.y,
        joinedAt: Date.now()
      };

      // Enforce ONE avatar per user. A tab refresh, React StrictMode double
      // mount, or a reconnect race can otherwise leave a ghost socket for the
      // same account — inflating the presence count while the map de-dupes it
      // back to a single drawn avatar ("3 online, 2 visible").
      const existing = getPlayerByUserId(player.id);
      if (existing) {
        players.delete(existing.socketId);
        lastPersistAt.delete(existing.id);
        revokePairsFor(existing.id);
        io.emit('world:player-left', { id: existing.id });
      }

      players.set(socket.id, player);

      // Full snapshot to the newcomer (including their own resolved id).
      socket.emit('world:state', {
        bounds: OFFICE_BOUNDS,
        selfId: player.id,
        players: listPlayers()
      });

      // Notify all clients about proximity groups (users within earshot)
      io.emit('world:proximity-update', {
        timestamp: Date.now(),
        players: listPlayers()
      });

      // Tell everyone else a new colleague walked in.
      socket.broadcast.emit('world:player-joined', toPublicPlayer(player));
      io.emit('world:presence', { count: players.size });
      io.emit('world:proximity-update', {
        timestamp: Date.now(),
        players: listPlayers()
      });

      persistPosition(player);
    });

    // -------------------------------------------------------------------
    // world:move — high-frequency coordinate broadcast from the mover
    // -------------------------------------------------------------------
    socket.on('world:move', (payload = {}) => {
      const player = players.get(socket.id);
      if (!player) return;

      const next = sanitizePosition(payload.x, payload.y);
      if (next.x === player.x && next.y === player.y) return;

      player.x = next.x;
      player.y = next.y;
      player.updatedAt = Date.now();

      socket.broadcast.emit('world:player-moved', {
        id: player.id,
        x: player.x,
        y: player.y
      });

      // Emit proximity update after movement to allow clients to form groups
      io.emit('world:proximity-update', {
        timestamp: Date.now(),
        players: listPlayers()
      });

      persistPosition(player);
    });

    // Lightweight status flips (idle / in-meeting / mic muted cosmetics).
    socket.on('world:status', (payload = {}) => {
      const player = players.get(socket.id);
      if (!player) return;
      player.status = payload.status || player.status;
      io.emit('world:player-status', { id: player.id, status: player.status });
    });

    // -------------------------------------------------------------------
    // WebRTC signaling relay — brokers the SDP/ICE handshake between two
    // colleagues. The server never inspects media; it only forwards the
    // offer/answer/candidate payloads to an authorized nearby peer.
    //
    // Authority comes from the in-memory roster (player.x / player.y), which
    // is updated by sanitized `world:move` events — never from signaling
    // payload coordinates. An accepted offer authorizes the pair for a short
    // grace window so answer/ICE can finish while avatars are moving.
    // -------------------------------------------------------------------
    socket.on('world:offer', (payload = {}) => {
      const player = players.get(socket.id);
      if (!player) {
        rejectSignal('world:offer', 'sender socket has no registered player', { socket: idRef(socket.id) });
        return;
      }
      if (!payload.offer) {
        rejectSignal('world:offer', 'payload has no offer', { from: idRef(player.id) });
        return;
      }
      const target = getPlayerByUserId(payload.target);
      if (!target || target.socketId === socket.id) {
        rejectSignal('world:offer', 'target not found', {
          from: idRef(player.id),
          target: idRef(payload.target)
        });
        return;
      }

      const distance = distanceBetween(player, target);
      if (distance > HEARING_RADIUS) {
        rejectSignal('world:offer', 'target outside hearing radius', {
          from: idRef(player.id),
          target: idRef(target.id),
          distance: Math.round(distance)
        });
        return;
      }

      authorizePair(player.id, target.id);
      io.to(target.socketId).emit('world:offer', { from: player.id, offer: payload.offer });
    });

    socket.on('world:answer', (payload = {}) => {
      const player = players.get(socket.id);
      if (!player) {
        rejectSignal('world:answer', 'sender socket has no registered player', { socket: idRef(socket.id) });
        return;
      }
      if (!payload.answer) {
        rejectSignal('world:answer', 'payload has no answer', { from: idRef(player.id) });
        return;
      }
      const target = getPlayerByUserId(payload.target);
      if (!target || target.socketId === socket.id) {
        rejectSignal('world:answer', 'target not found', {
          from: idRef(player.id),
          target: idRef(payload.target)
        });
        return;
      }

      const auth = getPairAuth(player.id, target.id);
      if (!auth) {
        rejectSignal('world:answer', 'no accepted nearby offer for pair', {
          from: idRef(player.id),
          target: idRef(target.id)
        });
        return;
      }

      const within = distanceBetween(player, target) <= HEARING_RADIUS;
      if (!within && Date.now() > auth.expiresAt) {
        signalAuth.delete(pairKey(player.id, target.id));
        rejectSignal('world:answer', 'outside hearing radius and grace window expired', {
          from: idRef(player.id),
          target: idRef(target.id)
        });
        return;
      }

      io.to(target.socketId).emit('world:answer', { from: player.id, answer: payload.answer });
    });

    socket.on('world:ice-candidate', (payload = {}) => {
      const player = players.get(socket.id);
      if (!player) {
        rejectSignal('world:ice-candidate', 'sender socket has no registered player', { socket: idRef(socket.id) });
        return;
      }
      if (!payload.candidate) return;
      const target = getPlayerByUserId(payload.target);
      if (!target || target.socketId === socket.id) {
        rejectSignal('world:ice-candidate', 'target not found', {
          from: idRef(player.id),
          target: idRef(payload.target)
        });
        return;
      }

      const auth = getPairAuth(player.id, target.id);
      if (!auth) {
        rejectSignal('world:ice-candidate', 'no accepted nearby offer for pair', {
          from: idRef(player.id),
          target: idRef(target.id)
        });
        return;
      }

      const within = distanceBetween(player, target) <= HEARING_RADIUS;
      if (!within && Date.now() > auth.expiresAt) {
        signalAuth.delete(pairKey(player.id, target.id));
        rejectSignal('world:ice-candidate', 'outside hearing radius and grace window expired', {
          from: idRef(player.id),
          target: idRef(target.id)
        });
        return;
      }

      io.to(target.socketId).emit('world:ice-candidate', { from: player.id, candidate: payload.candidate });
    });

    socket.on('world:leave', () => {
      const player = players.get(socket.id);
      if (!player) return;
      players.delete(socket.id);
      lastPersistAt.delete(player.id);
      revokePairsFor(player.id);
      io.emit('world:player-left', { id: player.id });
      io.emit('world:presence', { count: players.size });
      io.emit('world:proximity-update', {
        timestamp: Date.now(),
        players: listPlayers()
      });
    });

    socket.on('disconnect', () => {
      const player = players.get(socket.id);
      if (!player) return;
      players.delete(socket.id);
      lastPersistAt.delete(player.id);
      revokePairsFor(player.id);
      io.emit('world:player-left', { id: player.id });
      io.emit('world:presence', { count: players.size });
      io.emit('world:proximity-update', {
        timestamp: Date.now(),
        players: listPlayers()
      });
    });
  });

  return io;
}

module.exports = initWorldSocket;
