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
    const radius = parseFloat(req.query.radius) || 150;

    if (isNaN(x) || isNaN(y)) {
      return res.status(400).json({ success: false, message: 'Invalid coordinates x and y.' });
    }

    // Native MongoDB $near query using the 2D planar index
    const nearbyUsers = await User.findNearby(x, y, radius);

    res.json({
      success: true,
      query: { x, y, radius },
      totalFound: nearbyUsers.length,
      users: nearbyUsers
    });
  } catch (err) {
    console.error('Geospatial query error:', err);
    res.status(500).json({ success: false, message: 'Failed to execute geospatial proximity query.' });
  }
});

module.exports = router;
