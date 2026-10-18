// Shared in-memory state for the ProxiSpeak 2D virtual office.
// Coordinates are plain [X, Y] pixel positions on the React Canvas world,
// which map 1:1 onto the MongoDB `2d` planar geospatial index on the User model.

const OFFICE_BOUNDS = Object.freeze({
  width: 1200,
  height: 720,
  padding: 48 // keeps avatars inside the visible office floor
});

// socketId -> live player record
const players = new Map();

const clamp = (value, min, max) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return min;
  return Math.min(Math.max(num, min), max);
};

// Clamp any incoming coordinate to the office floor so malicious/glitchy
// clients cannot drive avatars outside the rendered world.
function sanitizePosition(x, y) {
  return {
    x: Math.round(clamp(x, OFFICE_BOUNDS.padding, OFFICE_BOUNDS.width - OFFICE_BOUNDS.padding)),
    y: Math.round(clamp(y, OFFICE_BOUNDS.padding, OFFICE_BOUNDS.height - OFFICE_BOUNDS.padding))
  };
}

// Strip internal fields before broadcasting a player to other clients.
function toPublicPlayer(player) {
  return {
    id: player.id,
    name: player.name,
    username: player.username,
    role: player.role,
    department: player.department,
    avatarColor: player.avatarColor,
    avatarIcon: player.avatarIcon,
    status: player.status,
    x: player.x,
    y: player.y
  };
}

function listPlayers() {
  return Array.from(players.values()).map(toPublicPlayer);
}

function getPlayerByUserId(userId) {
  for (const player of players.values()) {
    if (player.id === userId) return player;
  }
  return null;
}

module.exports = {
  OFFICE_BOUNDS,
  players,
  clamp,
  sanitizePosition,
  toPublicPlayer,
  listPlayers,
  getPlayerByUserId
};
