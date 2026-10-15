const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../models/User');
const { OFFICE_BOUNDS, listPlayers, players } = require('../realtime/worldState');

// ==========================================
// Helper: greedy union-find clustering of users that are within `radius`
// pixels of one another. Used by the geospatial audit endpoints.
// ==========================================
function toPoint(entry) {
  if (Array.isArray(entry.location) && entry.location.length >= 2) {
    return [Number(entry.location[0]), Number(entry.location[1])];
  }
  return [Number(entry.x), Number(entry.y)];
}

function clusterByProximity(users, radius) {
  const parent = users.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a, b) => {
    parent[find(a)] = find(b);
  };

  for (let i = 0; i < users.length; i += 1) {
    const a = toPoint(users[i]);
    for (let j = i + 1; j < users.length; j += 1) {
      const b = toPoint(users[j]);
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) <= radius) union(i, j);
    }
  }

  const buckets = new Map();
  users.forEach((user, i) => {
    const root = find(i);
    if (!buckets.has(root)) buckets.set(root, []);
    buckets.get(root).push(user);
  });

  return Array.from(buckets.values()).map((members, index) => ({
    id: index,
    size: members.length,
    members
  }));
}

// ==========================================
// GET /api/world/bounds
// Exposes the authoritative 2D office dimensions so the canvas layer and the
// geospatial engine always agree on the same coordinate space.
// ==========================================
router.get('/bounds', (req, res) => {
  return res.status(200).json({ success: true, bounds: OFFICE_BOUNDS });
});

// ==========================================
// GET /api/world/online
// Snapshot of colleagues currently occupying the virtual office.
// Useful for initial render before the socket handshake completes.
// ==========================================
router.get('/online', (req, res) => {
  const roster = listPlayers();
  return res.status(200).json({
    success: true,
    count: roster.length,
    bounds: OFFICE_BOUNDS,
    players: roster
  });
});

// ==========================================
// GET /api/world/nearby
// Find users near a point using a MongoDB $near query (2d planar index) and
// cluster the matches into proximity groups. Falls back to an in-memory scan
// when MongoDB is unavailable. Reports `elapsedMs` for the spatial audit.
// ==========================================
router.get('/nearby', async (req, res) => {
  const { x, y, radius = 100 } = req.query;

  if (x == null || y == null) {
    return res.status(400).json({
      success: false,
      message: 'x and y coordinates are required'
    });
  }

  const point = [Number(x), Number(y)];
  const maxDist = Number(radius) || 100;
  const startedAt = process.hrtime.bigint();

  let nearbyUsers = [];
  let source = 'memory';

  if (mongoose.connection.readyState === 1) {
    try {
      // Legacy `2d` index syntax: $near accepts a raw [x, y] coordinate pair
      // and $maxDistance is expressed in the same pixel units as the canvas.
      const docs = await User.find({
        location: { $near: point, $maxDistance: maxDist }
      })
        .select('-password')
        .limit(50)
        .lean();

      nearbyUsers = docs.map((u) => ({
        ...u,
        distance: Math.round(Math.hypot(u.location[0] - point[0], u.location[1] - point[1]))
      }));
      source = 'mongodb';
    } catch (e) {
      // Fall through to the in-memory fallback below.
      nearbyUsers = [];
    }
  }

  if (source !== 'mongodb') {
    for (const player of players.values()) {
      const dist = Math.hypot(player.x - point[0], player.y - point[1]);
      if (dist <= maxDist) {
        nearbyUsers.push({
          id: player.id,
          name: player.name,
          username: player.username,
          role: player.role,
          department: player.department,
          avatarColor: player.avatarColor,
          avatarIcon: player.avatarIcon,
          status: player.status,
          location: [player.x, player.y],
          distance: Math.round(dist)
        });
      }
    }
    nearbyUsers.sort((a, b) => a.distance - b.distance);
  }

  const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
  const groups = clusterByProximity(nearbyUsers, maxDist).filter((g) => g.size > 1);

  return res.status(200).json({
    success: true,
    radius: maxDist,
    source,
    elapsedMs: Number(elapsedMs.toFixed(3)),
    count: nearbyUsers.length,
    groups,
    users: nearbyUsers
  });
});

// ==========================================
// GET /api/world/benchmark
// Spatial audit harness: runs the proximity clustering pipeline repeatedly
// and reports latency statistics to prove sub-20ms geospatial filtering.
// ==========================================
router.get('/benchmark', async (req, res) => {
  const iterations = Math.min(Math.max(Number(req.query.iterations) || 200, 1), 5000);
  const radius = Number(req.query.radius) || 100;
  const roster = listPlayers().map((p) => ({ ...p, location: [p.x, p.y] }));

  const times = [];
  for (let i = 0; i < iterations; i += 1) {
    const t0 = process.hrtime.bigint();
    clusterByProximity(roster, radius);
    times.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }

  let dbQueryMs = null;
  let dbSource = 'memory';
  if (mongoose.connection.readyState === 1 && roster.length > 0) {
    try {
      const t0 = process.hrtime.bigint();
      await User.find({
        location: { $near: [roster[0].location[0], roster[0].location[1]], $maxDistance: radius }
      })
        .select('-password')
        .limit(50)
        .lean();
      dbQueryMs = Number((Number(process.hrtime.bigint() - t0) / 1e6).toFixed(3));
      dbSource = 'mongodb';
    } catch (e) {
      dbQueryMs = null;
    }
  }

  const avgMs = times.reduce((a, b) => a + b, 0) / times.length;
  const maxMs = Math.max(...times);

  return res.status(200).json({
    success: true,
    iterations,
    players: roster.length,
    radius,
    clustering: {
      avgMs: Number(avgMs.toFixed(3)),
      maxMs: Number(maxMs.toFixed(3)),
      under20ms: maxMs < 20
    },
    mongoNearQuery: {
      source: dbSource,
      ms: dbQueryMs,
      under20ms: dbQueryMs != null ? dbQueryMs < 20 : null
    }
  });
});

module.exports = router;
