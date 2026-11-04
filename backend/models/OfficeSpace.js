const mongoose = require('mongoose');

// ====================================================
// DEFAULT OFFICE SPACE PRESETS & SOUND-BLOCKING OBSTACLES
// ====================================================

const DEFAULT_OFFICE_ZONES = [
  {
    id: 'audio-lab',
    name: 'Spatial Audio Lab',
    type: 'audio-lab',
    x: 30,
    y: 30,
    width: 420,
    height: 260,
    bg: 'rgba(99, 102, 241, 0.08)',
    border: 'rgba(99, 102, 241, 0.3)',
    tagColor: '#818cf8',
    icon: 'AUDIO',
    description: '3D Stereo Panning & Acoustic Testing Chamber'
  },
  {
    id: 'engineering-bay',
    name: 'Core WebRTC Bay',
    type: 'engineering',
    x: 510,
    y: 30,
    width: 420,
    height: 260,
    bg: 'rgba(16, 185, 129, 0.08)',
    border: 'rgba(16, 185, 129, 0.3)',
    tagColor: '#34d399',
    icon: 'RTC',
    description: 'Real-time WebSocket & Mesh Signaling Bay'
  },
  {
    id: 'product-hub',
    name: 'Product & Design Hub',
    type: 'product-hub',
    x: 30,
    y: 350,
    width: 420,
    height: 260,
    bg: 'rgba(245, 158, 11, 0.08)',
    border: 'rgba(245, 158, 11, 0.3)',
    tagColor: '#fbbf24',
    icon: 'DESIGN',
    description: 'UI/UX Wireframes & Virtual Office Strategy'
  },
  {
    id: 'lounge-pantry',
    name: 'Breakout Lounge & Water Cooler',
    type: 'breakout-lounge',
    x: 510,
    y: 350,
    width: 420,
    height: 260,
    bg: 'rgba(236, 72, 153, 0.08)',
    border: 'rgba(236, 72, 153, 0.3)',
    tagColor: '#f472b6',
    icon: 'LOUNGE',
    description: 'Casual Water Cooler Chat & Coffee Station'
  }
];

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
    soundReductionDb: 45,
    material: 'acoustic-foam'
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
    soundReductionDb: 50,
    material: 'acoustic-foam'
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
    soundReductionDb: 40,
    material: 'tempered-glass'
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
    blocksSound: false,
    soundReduction: 0.0,
    soundReductionDb: 0,
    material: 'wood-steel'
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
    blocksSound: false,
    soundReduction: 0.0,
    soundReductionDb: 0,
    material: 'wood-steel'
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
    blocksSound: false,
    soundReduction: 0.0,
    soundReductionDb: 0,
    material: 'wood-steel'
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
    blocksSound: false,
    soundReduction: 0.0,
    soundReductionDb: 0,
    material: 'wood-steel'
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
    blocksSound: false,
    soundReduction: 0.0,
    soundReductionDb: 0,
    material: 'electronics-rack'
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
    blocksSound: false,
    soundReduction: 0.0,
    soundReductionDb: 0,
    material: 'whiteboard-table'
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
    blocksSound: false,
    soundReduction: 0.0,
    soundReductionDb: 0,
    material: 'marble-table'
  }
];

// In-memory cache fallback for standalone execution
let inMemoryOfficeStore = {
  name: 'ProxiSpeak Headquarters',
  cluster: 'proxify',
  dimensions: { width: 960, height: 640 },
  zones: JSON.parse(JSON.stringify(DEFAULT_OFFICE_ZONES)),
  obstacles: JSON.parse(JSON.stringify(DEFAULT_OBSTACLES)),
  spawnPoint: [480, 320],
  updatedAt: new Date(),
  createdAt: new Date()
};

// ====================================================
// 2D LINE-OF-SIGHT SOUND OCCLUSION RAYCASTING ALGORITHM
// (Liang-Barsky Line Segment vs AABB Box Intersection)
// ====================================================
function lineIntersectsBox(x1, y1, x2, y2, box) {
  const xMin = box.x;
  const xMax = box.x + box.width;
  const yMin = box.y;
  const yMax = box.y + box.height;

  // Check if either endpoint is inside the box
  if ((x1 >= xMin && x1 <= xMax && y1 >= yMin && y1 <= yMax) ||
      (x2 >= xMin && x2 <= xMax && y2 >= yMin && y2 <= yMax)) {
    return {
      intersects: true,
      t: 0,
      intersectionPoint: { x: x1, y: y1 }
    };
  }

  const dx = x2 - x1;
  const dy = y2 - y1;

  const p = [-dx, dx, -dy, dy];
  const q = [x1 - xMin, xMax - x1, y1 - yMin, yMax - y1];

  let u1 = 0;
  let u2 = 1;

  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return { intersects: false };
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) {
        if (t > u2) return { intersects: false };
        if (t > u1) u1 = t;
      } else {
        if (t < u1) return { intersects: false };
        if (t < u2) u2 = t;
      }
    }
  }

  if (u1 <= u2) {
    const hitX = Math.round((x1 + u1 * dx) * 10) / 10;
    const hitY = Math.round((y1 + u1 * dy) * 10) / 10;
    return {
      intersects: true,
      t: u1,
      intersectionPoint: { x: hitX, y: hitY }
    };
  }

  return { intersects: false };
}

/**
 * Checks if direct sound propagation path between Point A and Point B
 * is occluded or blocked by any furniture obstacle with blocksSound: true.
 */
function checkSoundOcclusion(locA, locB, obstacles = []) {
  if (!locA || !locB || !Array.isArray(locA) || !Array.isArray(locB)) {
    return { isBlocked: false, blockingObstacles: [], blockingObstacle: null };
  }

  const x1 = locA[0];
  const y1 = locA[1];
  const x2 = locB[0];
  const y2 = locB[1];

  const blockingObstacles = [];
  let firstIntersection = null;

  for (const obs of obstacles) {
    if (!obs || !obs.blocksSound) continue;

    const hit = lineIntersectsBox(x1, y1, x2, y2, obs);
    if (hit.intersects) {
      blockingObstacles.push({
        ...obs,
        hitPoint: hit.intersectionPoint,
        hitT: hit.t
      });
      if (!firstIntersection || hit.t < firstIntersection.hitT) {
        firstIntersection = { ...obs, hitPoint: hit.intersectionPoint, hitT: hit.t };
      }
    }
  }

  const isBlocked = blockingObstacles.length > 0;
  return {
    isBlocked,
    blockingObstacle: firstIntersection,
    blockingObstacles,
    blockCount: blockingObstacles.length,
    reason: isBlocked ? `Sound blocked by '${firstIntersection.label}'` : 'Clear line of sight'
  };
}

// ====================================================
// MONGOOSE SCHEMA DEFINITION
// ====================================================
const obstacleSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true
  },
  label: {
    type: String,
    required: true,
    default: 'Office Obstacle'
  },
  type: {
    type: String,
    default: 'desk'
  },
  x: {
    type: Number,
    required: true
  },
  y: {
    type: Number,
    required: true
  },
  width: {
    type: Number,
    required: true
  },
  height: {
    type: Number,
    required: true
  },
  color: {
    type: String,
    default: '#1e293b'
  },
  blocksSound: {
    type: Boolean,
    default: false,
    index: true
  },
  soundReduction: {
    type: Number,
    default: 1.0,
    min: 0,
    max: 1
  },
  soundReductionDb: {
    type: Number,
    default: 40
  },
  material: {
    type: String,
    default: 'wood-steel'
  }
}, { _id: false });

const zoneSchema = new mongoose.Schema({
  id: String,
  name: String,
  type: String,
  x: Number,
  y: Number,
  width: Number,
  height: Number,
  bounds: {
    x: Number,
    y: Number,
    width: Number,
    height: Number
  },
  bg: String,
  border: String,
  tagColor: String,
  icon: String,
  description: String
}, { _id: false });

const officeSpaceSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    default: 'ProxiSpeak Headquarters'
  },
  cluster: {
    type: String,
    default: 'proxify',
    unique: true,
    index: true
  },
  dimensions: {
    width: { type: Number, default: 960 },
    height: { type: Number, default: 640 }
  },
  zones: [zoneSchema],
  obstacles: [obstacleSchema],
  spawnPoint: {
    type: [Number], // [x, y]
    default: [480, 320]
  },
  metadata: {
    soundBlockingObstacleCount: { type: Number, default: 0 },
    totalObstacles: { type: Number, default: 0 },
    version: { type: Number, default: 1 }
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Update metadata & timestamp prior to save
officeSpaceSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  if (Array.isArray(this.obstacles)) {
    this.metadata.totalObstacles = this.obstacles.length;
    this.metadata.soundBlockingObstacleCount = this.obstacles.filter(o => o.blocksSound).length;
  }
  next();
});

// ====================================================
// STATIC METHODS FOR ROOM PERSISTENCE & SOUND OCCLUSION
// ====================================================

/**
 * Retrieves the persisted office layout and furniture obstacles from MongoDB.
 * Creates default record if none exists.
 */
officeSpaceSchema.statics.getOfficeLayout = async function(cluster = 'proxify') {
  try {
    if (mongoose.connection.readyState === 1) {
      let office = await this.findOne({ cluster });
      if (!office) {
        office = await this.create({
          name: 'ProxiSpeak Infotact Main Office',
          cluster,
          dimensions: { width: 960, height: 640 },
          zones: DEFAULT_OFFICE_ZONES,
          obstacles: DEFAULT_OBSTACLES,
          spawnPoint: [480, 320],
          metadata: {
            soundBlockingObstacleCount: DEFAULT_OBSTACLES.filter(o => o.blocksSound).length,
            totalObstacles: DEFAULT_OBSTACLES.length,
            version: 1
          }
        });
      }
      return { office: office.toObject ? office.toObject() : office, source: 'mongodb' };
    }
  } catch (err) {
    console.warn('[Room Persistence] MongoDB getOfficeLayout fallback:', err.message);
  }

  // Fallback to in-memory store
  return { office: inMemoryOfficeStore, source: 'in-memory' };
};

/**
 * Saves/updates office layout and furniture obstacles into MongoDB.
 */
officeSpaceSchema.statics.saveOfficeLayout = async function(cluster = 'proxify', layoutData = {}) {
  const sanitizedObstacles = (layoutData.obstacles || DEFAULT_OBSTACLES).map(obs => ({
    id: obs.id || `obs_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    label: obs.label || 'Office Obstacle',
    type: obs.type || 'desk',
    x: Number(obs.x) || 0,
    y: Number(obs.y) || 0,
    width: Number(obs.width) || 100,
    height: Number(obs.height) || 50,
    color: obs.color || (obs.blocksSound ? '#312e81' : '#1e293b'),
    blocksSound: Boolean(obs.blocksSound),
    soundReduction: typeof obs.soundReduction === 'number' ? obs.soundReduction : (obs.blocksSound ? 1.0 : 0.0),
    soundReductionDb: typeof obs.soundReductionDb === 'number' ? obs.soundReductionDb : (obs.blocksSound ? 45 : 0),
    material: obs.material || (obs.blocksSound ? 'acoustic-foam' : 'wood-steel')
  }));

  const payload = {
    name: layoutData.name || inMemoryOfficeStore.name,
    cluster,
    dimensions: layoutData.dimensions || inMemoryOfficeStore.dimensions,
    zones: layoutData.zones || inMemoryOfficeStore.zones,
    obstacles: sanitizedObstacles,
    spawnPoint: layoutData.spawnPoint || inMemoryOfficeStore.spawnPoint,
    metadata: {
      soundBlockingObstacleCount: sanitizedObstacles.filter(o => o.blocksSound).length,
      totalObstacles: sanitizedObstacles.length,
      version: (inMemoryOfficeStore.metadata?.version || 1) + 1
    },
    updatedAt: new Date()
  };

  // Update in-memory fallback store
  inMemoryOfficeStore = { ...inMemoryOfficeStore, ...payload };

  try {
    if (mongoose.connection.readyState === 1) {
      const updated = await this.findOneAndUpdate(
        { cluster },
        { $set: payload },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ).lean();
      return { success: true, office: updated, source: 'mongodb' };
    }
  } catch (err) {
    console.warn('[Room Persistence] MongoDB saveOfficeLayout fallback:', err.message);
  }

  return { success: true, office: inMemoryOfficeStore, source: 'in-memory' };
};

/**
 * Resets office layout and obstacles in MongoDB back to defaults.
 */
officeSpaceSchema.statics.resetToDefault = async function(cluster = 'proxify') {
  inMemoryOfficeStore = {
    name: 'ProxiSpeak Headquarters',
    cluster,
    dimensions: { width: 960, height: 640 },
    zones: JSON.parse(JSON.stringify(DEFAULT_OFFICE_ZONES)),
    obstacles: JSON.parse(JSON.stringify(DEFAULT_OBSTACLES)),
    spawnPoint: [480, 320],
    metadata: {
      soundBlockingObstacleCount: DEFAULT_OBSTACLES.filter(o => o.blocksSound).length,
      totalObstacles: DEFAULT_OBSTACLES.length,
      version: 1
    },
    updatedAt: new Date(),
    createdAt: new Date()
  };

  try {
    if (mongoose.connection.readyState === 1) {
      const reset = await this.findOneAndUpdate(
        { cluster },
        { $set: inMemoryOfficeStore },
        { upsert: true, new: true }
      ).lean();
      return { success: true, office: reset, source: 'mongodb' };
    }
  } catch (err) {
    console.warn('[Room Persistence] MongoDB resetToDefault fallback:', err.message);
  }

  return { success: true, office: inMemoryOfficeStore, source: 'in-memory' };
};

// Export static occlusion helpers on schema
officeSpaceSchema.statics.lineIntersectsBox = lineIntersectsBox;
officeSpaceSchema.statics.checkSoundOcclusion = checkSoundOcclusion;

const OfficeSpace = mongoose.model('OfficeSpace', officeSpaceSchema);

module.exports = OfficeSpace;
module.exports.DEFAULT_OFFICE_ZONES = DEFAULT_OFFICE_ZONES;
module.exports.DEFAULT_OBSTACLES = DEFAULT_OBSTACLES;
module.exports.lineIntersectsBox = lineIntersectsBox;
module.exports.checkSoundOcclusion = checkSoundOcclusion;
