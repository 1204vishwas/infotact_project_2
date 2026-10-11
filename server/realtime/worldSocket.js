const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const { JWT_SECRET } = require('../middleware/auth');
const {
  OFFICE_BOUNDS,
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
        io.emit('world:player-left', { id: existing.id });
      }

      players.set(socket.id, player);

      // Full snapshot to the newcomer (including their own resolved id).
      socket.emit('world:state', {
        bounds: OFFICE_BOUNDS,
        selfId: player.id,
        players: listPlayers()
      });

      // Tell everyone else a new colleague walked in.
      socket.broadcast.emit('world:player-joined', toPublicPlayer(player));
      io.emit('world:presence', { count: players.size });

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

      persistPosition(player);
    });

    // Lightweight status flips (idle / in-meeting / mic muted cosmetics).
    socket.on('world:status', (payload = {}) => {
      const player = players.get(socket.id);
      if (!player) return;
      player.status = payload.status || player.status;
      io.emit('world:player-status', { id: player.id, status: player.status });
    });

    socket.on('world:leave', () => {
      const player = players.get(socket.id);
      if (!player) return;
      players.delete(socket.id);
      lastPersistAt.delete(player.id);
      io.emit('world:player-left', { id: player.id });
      io.emit('world:presence', { count: players.size });
    });

    socket.on('disconnect', () => {
      const player = players.get(socket.id);
      if (!player) return;
      players.delete(socket.id);
      lastPersistAt.delete(player.id);
      io.emit('world:player-left', { id: player.id });
      io.emit('world:presence', { count: players.size });
    });
  });

  return io;
}

module.exports = initWorldSocket;
