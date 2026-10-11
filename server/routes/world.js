const express = require('express');
const router = express.Router();
const { OFFICE_BOUNDS, listPlayers } = require('../realtime/worldState');

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
  const players = listPlayers();
  return res.status(200).json({
    success: true,
    count: players.length,
    bounds: OFFICE_BOUNDS,
    players
  });
});

module.exports = router;
