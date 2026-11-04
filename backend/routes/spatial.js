const express = require('express');
const router = express.Router();
const User = require('../models/User');
const OfficeSpace = require('../models/OfficeSpace');
const { DEFAULT_OFFICE_ZONES, DEFAULT_OBSTACLES, checkSoundOcclusion } = OfficeSpace;
const { runSpatialAudit, filterUsersByProximity, clusterUsersByProximity, generateTestAvatars } = require('../services/spatialAudit');

// ====================================================
// 1. GET /api/spatial/room — Office World Metadata & Obstacles from MongoDB
// ====================================================
router.get('/room', async (req, res) => {
  try {
    const cluster = req.query.cluster || 'proxify';
    const { office, source } = await OfficeSpace.getOfficeLayout(cluster);

    const soundBlockingCount = (office.obstacles || []).filter(o => o.blocksSound).length;

    res.json({
      success: true,
      source,
      milestone: 'Room Persistence: Saved in MongoDB (proxify cluster)',
      office: {
        name: office.name,
        cluster: office.cluster,
        dimensions: office.dimensions,
        zones: office.zones,
        obstacles: office.obstacles,
        spawnPoint: office.spawnPoint,
        metadata: {
          totalObstacles: (office.obstacles || []).length,
          soundBlockingCount,
          soundPermittedCount: (office.obstacles || []).length - soundBlockingCount,
          version: office.metadata?.version || 1
        },
        updatedAt: office.updatedAt
      }
    });
  } catch (err) {
    console.error('Error fetching office layout:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch office space layout.',
      error: err.message
    });
  }
});

// ====================================================
// 2. POST & PUT /api/spatial/room — Save Office Layout & Obstacles to MongoDB
// ====================================================
const handleSaveRoom = async (req, res) => {
  try {
    const cluster = req.body.cluster || req.query.cluster || 'proxify';
    const { name, dimensions, zones, obstacles, spawnPoint } = req.body;

    if (obstacles && !Array.isArray(obstacles)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payload: obstacles must be an array.'
      });
    }

    const result = await OfficeSpace.saveOfficeLayout(cluster, {
      name,
      dimensions,
      zones,
      obstacles,
      spawnPoint
    });

    const soundBlockingCount = (result.office.obstacles || []).filter(o => o.blocksSound).length;

    res.json({
      success: true,
      message: 'Office layout and sound-blocking furniture obstacles saved into MongoDB successfully.',
      source: result.source,
      office: result.office,
      stats: {
        totalObstacles: (result.office.obstacles || []).length,
        soundBlockingObstacles: soundBlockingCount,
        openFurnitureObstacles: (result.office.obstacles || []).length - soundBlockingCount
      }
    });
  } catch (err) {
    console.error('Error saving office layout to MongoDB:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to persist office layout into MongoDB.',
      error: err.message
    });
  }
};

router.post('/room', handleSaveRoom);
router.put('/room', handleSaveRoom);

// ====================================================
// 3. POST /api/spatial/room/obstacle — Add New Furniture Obstacle to MongoDB
// ====================================================
router.post('/room/obstacle', async (req, res) => {
  try {
    const cluster = req.body.cluster || 'proxify';
    const newObstacle = req.body.obstacle || req.body;

    if (!newObstacle.label || typeof newObstacle.x !== 'number' || typeof newObstacle.y !== 'number') {
      return res.status(400).json({
        success: false,
        message: 'Obstacle requires label, x, y, width, and height.'
      });
    }

    const { office } = await OfficeSpace.getOfficeLayout(cluster);
    const obstacles = office.obstacles || [];

    const preparedObstacle = {
      id: newObstacle.id || `obs_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      label: newObstacle.label,
      type: newObstacle.type || 'desk',
      x: Number(newObstacle.x),
      y: Number(newObstacle.y),
      width: Number(newObstacle.width) || 120,
      height: Number(newObstacle.height) || 60,
      color: newObstacle.color || (newObstacle.blocksSound ? '#312e81' : '#1e293b'),
      blocksSound: Boolean(newObstacle.blocksSound),
      soundReduction: typeof newObstacle.soundReduction === 'number' ? newObstacle.soundReduction : (newObstacle.blocksSound ? 1.0 : 0.0),
      soundReductionDb: typeof newObstacle.soundReductionDb === 'number' ? newObstacle.soundReductionDb : (newObstacle.blocksSound ? 45 : 0),
      material: newObstacle.material || (newObstacle.blocksSound ? 'acoustic-foam' : 'wood-steel')
    };

    obstacles.push(preparedObstacle);
    const saveResult = await OfficeSpace.saveOfficeLayout(cluster, { ...office, obstacles });

    res.json({
      success: true,
      message: `Obstacle '${preparedObstacle.label}' added and persisted into MongoDB.`,
      obstacle: preparedObstacle,
      totalObstacles: saveResult.office.obstacles.length,
      source: saveResult.source
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to add obstacle to MongoDB.', error: err.message });
  }
});

// ====================================================
// 4. PUT /api/spatial/room/obstacle/:id — Update Obstacle (Toggle blocksSound) in MongoDB
// ====================================================
router.put('/room/obstacle/:id', async (req, res) => {
  try {
    const obstacleId = req.params.id;
    const cluster = req.body.cluster || 'proxify';
    const updates = req.body;

    const { office } = await OfficeSpace.getOfficeLayout(cluster);
    const obstacles = office.obstacles || [];

    const index = obstacles.findIndex(o => o.id === obstacleId);
    if (index === -1) {
      return res.status(404).json({ success: false, message: `Obstacle with id '${obstacleId}' not found.` });
    }

    // Merge updates
    const existing = obstacles[index];
    const updatedObs = {
      ...existing,
      ...updates,
      id: existing.id,
      blocksSound: updates.blocksSound !== undefined ? Boolean(updates.blocksSound) : existing.blocksSound,
      color: updates.color || (updates.blocksSound ? '#312e81' : existing.color)
    };

    obstacles[index] = updatedObs;
    const saveResult = await OfficeSpace.saveOfficeLayout(cluster, { ...office, obstacles });

    res.json({
      success: true,
      message: `Obstacle '${updatedObs.label}' updated in MongoDB. blocksSound = ${updatedObs.blocksSound}`,
      obstacle: updatedObs,
      source: saveResult.source
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update obstacle in MongoDB.', error: err.message });
  }
});

// ====================================================
// 5. DELETE /api/spatial/room/obstacle/:id — Delete Obstacle from MongoDB
// ====================================================
router.delete('/room/obstacle/:id', async (req, res) => {
  try {
    const obstacleId = req.params.id;
    const cluster = req.query.cluster || 'proxify';

    const { office } = await OfficeSpace.getOfficeLayout(cluster);
    const currentObstacles = office.obstacles || [];
    const remaining = currentObstacles.filter(o => o.id !== obstacleId);

    if (currentObstacles.length === remaining.length) {
      return res.status(404).json({ success: false, message: `Obstacle with id '${obstacleId}' not found.` });
    }

    const saveResult = await OfficeSpace.saveOfficeLayout(cluster, { ...office, obstacles: remaining });

    res.json({
      success: true,
      message: `Obstacle '${obstacleId}' deleted from MongoDB.`,
      remainingCount: remaining.length,
      source: saveResult.source
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete obstacle.', error: err.message });
  }
});

// ====================================================
// 6. POST /api/spatial/room/reset — Reset Office Layout to Defaults in MongoDB
// ====================================================
router.post('/room/reset', async (req, res) => {
  try {
    const cluster = req.body.cluster || 'proxify';
    const result = await OfficeSpace.resetToDefault(cluster);

    res.json({
      success: true,
      message: 'Office layout and sound-blocking obstacles reset to defaults in MongoDB.',
      source: result.source,
      office: result.office
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to reset office layout.', error: err.message });
  }
});

// ====================================================
// 7. POST /api/spatial/verify-audio-path — WebRTC Distance & Sound-Blocking Raycast
// ====================================================
router.post('/verify-audio-path', async (req, res) => {
  try {
    const { fromCoords, toCoords, maxRadius = 100, cluster = 'proxify' } = req.body;

    if (!fromCoords || !toCoords || !Array.isArray(fromCoords) || !Array.isArray(toCoords)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide fromCoords [x, y] and toCoords [x, y].'
      });
    }

    // 1. Distance check
    const dx = fromCoords[0] - toCoords[0];
    const dy = fromCoords[1] - toCoords[1];
    const distance = Math.round(Math.sqrt(dx * dx + dy * dy));
    const inRange = distance <= maxRadius;

    // 2. Fetch obstacles from MongoDB layout
    const { office } = await OfficeSpace.getOfficeLayout(cluster);
    const obstacles = office.obstacles || [];

    // 3. Line-of-sight sound occlusion test against obstacles with blocksSound: true
    const occlusion = checkSoundOcclusion(fromCoords, toCoords, obstacles);

    const baseGain = inRange ? Math.max(10, Math.min(100, Math.round((1 - distance / maxRadius) * 100))) : 0;
    const effectiveGain = (inRange && !occlusion.isBlocked) ? baseGain : 0;
    const audioPermitted = inRange && !occlusion.isBlocked;

    res.json({
      success: true,
      fromCoords,
      toCoords,
      distance,
      maxRadius,
      inRange,
      isSoundBlocked: occlusion.isBlocked,
      blockingObstacle: occlusion.blockingObstacle ? {
        id: occlusion.blockingObstacle.id,
        label: occlusion.blockingObstacle.label,
        type: occlusion.blockingObstacle.type,
        hitPoint: occlusion.blockingObstacle.hitPoint
      } : null,
      blockReason: occlusion.isBlocked ? `Sound wave blocked by '${occlusion.blockingObstacle?.label}'` : 'Clear line-of-sight',
      baseGain,
      effectiveGain,
      webrtcOfferPermitted: audioPermitted,
      status: audioPermitted ? 'PERMITTED' : (occlusion.isBlocked ? 'BLOCKED_BY_OBSTACLE' : 'OUT_OF_RANGE')
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to verify audio path.', error: err.message });
  }
});

// ====================================================
// 8. GET /api/spatial/nearby — High-Performance Geospatial Proximity Query (< 20ms)
// ====================================================
router.get('/nearby', async (req, res) => {
  const startTime = process.hrtime.bigint();
  try {
    const x = parseFloat(req.query.x);
    const y = parseFloat(req.query.y);
    const radius = parseFloat(req.query.radius) || 100;

    if (isNaN(x) || isNaN(y)) {
      return res.status(400).json({ success: false, message: 'Invalid coordinates x and y.' });
    }

    const nearbyUsers = await User.findNearby(x, y, radius);
    const endTime = process.hrtime.bigint();
    const executionTimeMs = Math.round((Number(endTime - startTime) / 1_000_000) * 1000) / 1000;

    res.json({
      success: true,
      query: { x, y, radius },
      webrtcThreshold: 100,
      totalFound: nearbyUsers.length,
      users: nearbyUsers,
      performance: {
        executionTimeMs,
        slaTargetMs: 20.0,
        status: executionTimeMs < 20.0 ? 'PASSED' : 'EXCEEDED',
        headroomPercent: Math.round(((20.0 - executionTimeMs) / 20.0) * 1000) / 10
      }
    });
  } catch (err) {
    console.error('Geospatial query error:', err);
    res.status(500).json({ success: false, message: 'Failed to execute geospatial proximity query.' });
  }
});

// ====================================================
// 9. GET /api/spatial/groups — Group Users Using Iterative Audio Pod Clustering (< 20ms)
// ====================================================
router.get('/groups', async (req, res) => {
  const startTime = process.hrtime.bigint();
  try {
    const radius = parseFloat(req.query.radius) || 100;
    const groupingResult = await User.groupUsersByProximity(radius);

    const endTime = process.hrtime.bigint();
    const executionTimeMs = Math.round((Number(endTime - startTime) / 1_000_000) * 1000) / 1000;

    res.json({
      success: true,
      description: 'Proximity groupings generated via iterative 2D planar index & Euclidean centroid engine',
      webrtcRadiusLimit: radius,
      ...groupingResult,
      performance: {
        executionTimeMs,
        slaTargetMs: 20.0,
        status: executionTimeMs < 20.0 ? 'PASSED' : 'EXCEEDED',
        headroomPercent: Math.round(((20.0 - executionTimeMs) / 20.0) * 1000) / 10
      }
    });
  } catch (err) {
    console.error('Geospatial grouping error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to execute MongoDB $near user grouping query.'
    });
  }
});

// ====================================================
// 10. POST /api/spatial/verify-proximity — WebRTC Proximity Gatekeeper
// ====================================================
router.post('/verify-proximity', async (req, res) => {
  try {
    const { fromCoords, toCoords, maxRadius = 100, checkOcclusion = false } = req.body;

    if (!fromCoords || !toCoords || !Array.isArray(fromCoords) || !Array.isArray(toCoords)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide fromCoords [x, y] and toCoords [x, y].'
      });
    }

    const dx = fromCoords[0] - toCoords[0];
    const dy = fromCoords[1] - toCoords[1];
    const distance = Math.round(Math.sqrt(dx * dx + dy * dy));
    const inRange = distance <= maxRadius;

    let isSoundBlocked = false;
    let blockingObstacle = null;

    if (checkOcclusion) {
      const { office } = await OfficeSpace.getOfficeLayout();
      const occlusion = checkSoundOcclusion(fromCoords, toCoords, office.obstacles || []);
      isSoundBlocked = occlusion.isBlocked;
      blockingObstacle = occlusion.blockingObstacle;
    }

    const gain = inRange && !isSoundBlocked
      ? Math.max(10, Math.min(100, Math.round((1 - distance / maxRadius) * 100)))
      : 0;

    const permitted = inRange && !isSoundBlocked;

    res.json({
      success: true,
      fromCoords,
      toCoords,
      distance,
      maxRadius,
      inRange,
      isSoundBlocked,
      blockingObstacle: blockingObstacle?.label || null,
      gain,
      webrtcOfferPermitted: permitted,
      status: permitted ? 'ALLOWED' : (isSoundBlocked ? 'BLOCKED_BY_SOUNDPROOF_OBSTACLE' : 'OUT_OF_RANGE')
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to verify proximity.' });
  }
});

// ====================================================
// 11. GET /api/spatial/audit — Mid-Project Review Spatial Audit Engine (< 20ms Verification)
// ====================================================
router.get('/audit', (req, res) => {
  try {
    const userCount = parseInt(req.query.userCount) || 50;
    const iterations = parseInt(req.query.iterations) || 100;
    const radius = parseFloat(req.query.radius) || 100;

    const auditResults = runSpatialAudit({ userCount, iterations, radius });

    res.json({
      success: true,
      milestone: 'Mid-Project Review: Spatial Audit (<20ms SLA)',
      ...auditResults
    });
  } catch (err) {
    console.error('Spatial audit error:', err);
    res.status(500).json({ success: false, message: `Spatial audit execution error: ${err.message}` });
  }
});

// ====================================================
// 12. POST /api/spatial/audit/custom — Custom Scalability Stress Audit
// ====================================================
router.post('/audit/custom', (req, res) => {
  try {
    const { userCount = 100, iterations = 100, radius = 100 } = req.body;
    const auditResults = runSpatialAudit({ userCount, iterations, radius });

    res.json({
      success: true,
      ...auditResults
    });
  } catch (err) {
    res.status(500).json({ success: false, message: `Custom spatial audit error: ${err.message}` });
  }
});

module.exports = router;
