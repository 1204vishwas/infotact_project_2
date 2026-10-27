const express = require('express');
const router = express.Router();
const User = require('../models/User');
const OfficeSpace = require('../models/OfficeSpace');

// Default Office Zones for ProxiSpeak 2D World
const DEFAULT_OFFICE_ZONES = [
  {
    id: 'zone-audio',
    name: 'Spatial Audio Lab',
    type: 'audio-lab',
    bounds: { x: 40, y: 40, width: 340, height: 260 },
    color: 'rgba(99, 102, 241, 0.12)',
    description: '3D Stereo Panning & Acoustic Testing Chamber'
  },
  {
    id: 'zone-engineering',
    name: 'Core WebRTC Bay',
    type: 'engineering',
    bounds: { x: 420, y: 40, width: 440, height: 260 },
    color: 'rgba(16, 185, 129, 0.12)',
    description: 'Real-time WebSocket & Canvas Layer Devs'
  },
  {
    id: 'zone-product',
    name: 'Product & Design Hub',
    type: 'product-hub',
    bounds: { x: 40, y: 340, width: 340, height: 280 },
    color: 'rgba(245, 158, 11, 0.12)',
    description: 'UI/UX Wireframes & Virtual Office Strategy'
  },
  {
    id: 'zone-lounge',
    name: 'Breakout Lounge & Pantry',
    type: 'breakout-lounge',
    bounds: { x: 420, y: 340, width: 440, height: 280 },
    color: 'rgba(236, 72, 153, 0.12)',
    description: 'Casual Water Cooler Chat & Coffee Station'
  }
];

// Default Office Obstacles (Desks, Tables, Walls)
const DEFAULT_OBSTACLES = [
  // Engineering Desks
  { id: 'desk-1', type: 'desk', x: 480, y: 100, width: 120, height: 50, label: 'Dev Desk 1' },
  { id: 'desk-2', type: 'desk', x: 680, y: 100, width: 120, height: 50, label: 'Dev Desk 2' },
  { id: 'desk-3', type: 'desk', x: 480, y: 200, width: 120, height: 50, label: 'Dev Desk 3' },
  { id: 'desk-4', type: 'desk', x: 680, y: 200, width: 120, height: 50, label: 'Dev Desk 4' },
  // Audio Lab Consoles
  { id: 'audio-console-1', type: 'console', x: 90, y: 110, width: 110, height: 60, label: 'Mixing Console' },
  { id: 'audio-console-2', type: 'console', x: 230, y: 110, width: 110, height: 60, label: 'Synthesizer Desk' },
  // Lounge Coffee Table & Couch
  { id: 'lounge-table', type: 'table', x: 580, y: 440, width: 140, height: 60, label: 'Coffee Table' },
  // Product Whiteboard
  { id: 'product-table', type: 'table', x: 120, y: 450, width: 160, height: 60, label: 'Design Island' }
];

// ====================================================
// 1. GET /api/spatial/room — Office World Metadata
// ====================================================
router.get('/room', async (req, res) => {
  try {
    let office = await OfficeSpace.findOne({ cluster: 'proxify' });
    if (!office) {
      office = await OfficeSpace.create({
        name: 'ProxiSpeak Infotact Main Office',
        cluster: 'proxify',
        dimensions: { width: 900, height: 660 },
        zones: DEFAULT_OFFICE_ZONES,
        obstacles: DEFAULT_OBSTACLES,
        spawnPoint: [450, 320]
      });
    }

    res.json({
      success: true,
      office: {
        name: office.name,
        dimensions: office.dimensions,
        zones: office.zones,
        obstacles: office.obstacles,
        spawnPoint: office.spawnPoint
      }
    });
  } catch (err) {
    // Return default static structure if DB error
    res.json({
      success: true,
      office: {
        name: 'ProxiSpeak Headquarters',
        dimensions: { width: 900, height: 660 },
        zones: DEFAULT_OFFICE_ZONES,
        obstacles: DEFAULT_OBSTACLES,
        spawnPoint: [450, 320]
      }
    });
  }
});

// ====================================================
// 2. GET /api/spatial/nearby — MongoDB $near Geospatial Query
// ====================================================
router.get('/nearby', async (req, res) => {
  try {
    const x = parseFloat(req.query.x);
    const y = parseFloat(req.query.y);
    const radius = parseFloat(req.query.radius) || 100; // Default to 100-pixel WebRTC earshot radius

    if (isNaN(x) || isNaN(y)) {
      return res.status(400).json({ success: false, message: 'Invalid coordinates x and y.' });
    }

    // Native MongoDB $near query using the 2D planar index
    const nearbyUsers = await User.findNearby(x, y, radius);

    res.json({
      success: true,
      query: { x, y, radius },
      webrtcThreshold: 100,
      totalFound: nearbyUsers.length,
      users: nearbyUsers
    });
  } catch (err) {
    console.error('Geospatial query error:', err);
    res.status(500).json({ success: false, message: 'Failed to execute geospatial proximity query.' });
  }
});

// ====================================================
// 3. GET /api/spatial/groups — Group Users Using MongoDB $near
// ====================================================
router.get('/groups', async (req, res) => {
  try {
    const radius = parseFloat(req.query.radius) || 100; // 100-pixel radius threshold

    const groupingResult = await User.groupUsersByProximity(radius);

    res.json({
      success: true,
      description: 'Proximity groupings generated via iterative MongoDB $near queries on 2D planar index',
      webrtcRadiusLimit: radius,
      ...groupingResult
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
// 4. POST /api/spatial/verify-proximity — WebRTC Proximity Gatekeeper
// ====================================================
router.post('/verify-proximity', async (req, res) => {
  try {
    const { fromCoords, toCoords, maxRadius = 100 } = req.body;

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
    const gain = inRange ? Math.max(10, Math.min(100, Math.round((1 - distance / maxRadius) * 100))) : 0;

    res.json({
      success: true,
      fromCoords,
      toCoords,
      distance,
      maxRadius,
      inRange,
      gain,
      webrtcOfferPermitted: inRange,
      status: inRange ? 'ALLOWED' : 'BLOCKED'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to verify proximity.' });
  }
});

module.exports = router;
