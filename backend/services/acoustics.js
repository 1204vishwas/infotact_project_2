// Acoustic occlusion engine for ProxiSpeak.
//
// Furniture with `blocksSound: true` is persisted in MongoDB as part of the
// office layout. This module answers a single question for any two avatars:
// "Does the straight line between them cross a sound-blocking obstacle?" The
// caller then attenuates the remote voice (or reports the blocker to clients).
//
// The active layout is cached for a few seconds because proximity checks run
// several times per second per moving avatar and should never hit MongoDB on
// every position frame.

const mongoose = require('mongoose');
const OfficeSpace = require('../models/OfficeSpace');
const { DEFAULT_OFFICE_OBSTACLES } = require('../realtime/officeDefaults');

const CACHE_TTL_MS = 5000;
const MIN_TRANSMISSION = 0.08;

let cachedObstacles = null;
let cachedAt = 0;

function toPoint(value) {
  if (Array.isArray(value)) return { x: Number(value[0]) || 0, y: Number(value[1]) || 0 };
  if (value && typeof value === 'object') {
    return { x: Number(value.x) || 0, y: Number(value.y) || 0 };
  }
  return { x: 0, y: 0 };
}

function pointInsideRect(point, rect) {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

// Liang-Barsky clipping: returns true when the segment enters the rectangle.
function segmentIntersectsRect(from, to, rect) {
  const xMin = rect.x;
  const xMax = rect.x + rect.width;
  const yMin = rect.y;
  const yMax = rect.y + rect.height;

  // Endpoints inside (or touching) the rectangle always count as intersecting.
  if (pointInsideRect(from, rect) || pointInsideRect(to, rect)) return true;

  let t0 = 0;
  let t1 = 1;
  const dx = to.x - from.x;
  const dy = to.y - from.y;

  const clip = (p, q) => {
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };

  return (
    clip(-dx, from.x - xMin) &&
    clip(dx, xMax - from.x) &&
    clip(-dy, from.y - yMin) &&
    clip(dy, yMax - from.y) &&
    t0 <= t1
  );
}

function normalizeObstacle(obstacle) {
  if (!obstacle) return null;
  const width = Number(obstacle.width);
  const height = Number(obstacle.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  return {
    id: obstacle.id || '',
    label: obstacle.label || obstacle.type || 'Furniture',
    type: obstacle.type || 'desk',
    x: Number(obstacle.x) || 0,
    y: Number(obstacle.y) || 0,
    width,
    height,
    blocksSound: obstacle.blocksSound !== false,
    acousticTransmission: Number.isFinite(Number(obstacle.acousticTransmission))
      ? Math.max(0, Math.min(1, Number(obstacle.acousticTransmission)))
      : 0.35
  };
}

function findSoundBlockers(fromValue, toValue, obstacles = DEFAULT_OFFICE_OBSTACLES) {
  const from = toPoint(fromValue);
  const to = toPoint(toValue);
  const blockers = [];

  for (const raw of obstacles || []) {
    const obstacle = normalizeObstacle(raw);
    if (!obstacle || !obstacle.blocksSound) continue;
    // Do not muffle an avatar standing on/inside its own furniture.
    if (pointInsideRect(from, obstacle) || pointInsideRect(to, obstacle)) continue;
    if (segmentIntersectsRect(from, to, obstacle)) {
      blockers.push(obstacle);
    }
  }

  return blockers;
}

function occlusionFactor(blockers) {
  if (!Array.isArray(blockers) || blockers.length === 0) return 1;
  let factor = 1;
  for (const blocker of blockers) {
    const transmission = Number.isFinite(blocker.acousticTransmission)
      ? blocker.acousticTransmission
      : 0.35;
    factor *= transmission;
  }
  return Math.max(MIN_TRANSMISSION, factor);
}

async function getActiveObstacles(force = false) {
  const now = Date.now();
  if (!force && cachedObstacles && now - cachedAt < CACHE_TTL_MS) {
    return cachedObstacles;
  }

  if (mongoose.connection.readyState === 1) {
    try {
      const office = await OfficeSpace.findOne({ cluster: 'proxify', isActive: true })
        .sort({ updatedAt: -1 })
        .lean();
      if (office && Array.isArray(office.obstacles) && office.obstacles.length > 0) {
        cachedObstacles = office.obstacles;
        cachedAt = now;
        return cachedObstacles;
      }
    } catch (err) {
      // Fall back to the built-in layout below.
    }
  }

  cachedObstacles = DEFAULT_OFFICE_OBSTACLES;
  cachedAt = now;
  return cachedObstacles;
}

function invalidateOfficeCache() {
  cachedObstacles = null;
  cachedAt = 0;
}

async function computeAcousticState(fromValue, toValue, options = {}) {
  const radius = Number.isFinite(Number(options.radius)) ? Number(options.radius) : 100;
  const obstacles = options.obstacles || (await getActiveObstacles());
  const from = toPoint(fromValue);
  const to = toPoint(toValue);

  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const blockers = findSoundBlockers(from, to, obstacles);
  const occlusion = occlusionFactor(blockers);
  const inRange = distance <= radius;
  const distanceGain = inRange
    ? Math.max(10, Math.min(100, Math.round((1 - distance / radius) * 100)))
    : 0;
  const effectiveGain = inRange ? Math.max(4, Math.round(distanceGain * occlusion)) : 0;

  return {
    distance: Math.round(distance * 10) / 10,
    radius,
    inRange,
    distanceGain,
    occlusion: Math.round(occlusion * 1000) / 1000,
    effectiveGain,
    occluded: blockers.length > 0,
    blockers: blockers.map((b) => ({ id: b.id, label: b.label, type: b.type }))
  };
}

module.exports = {
  toPoint,
  pointInsideRect,
  segmentIntersectsRect,
  findSoundBlockers,
  occlusionFactor,
  getActiveObstacles,
  invalidateOfficeCache,
  computeAcousticState,
  MIN_TRANSMISSION
};
