// Default ProxiSpeak office layout shared by the REST API, the acoustic
// occlusion engine, and the MongoDB seed path. Coordinates are expressed in
// the same pixel space as the React canvas (960 x 640).
const DEFAULT_OFFICE_DIMENSIONS = Object.freeze({ width: 960, height: 640 });

const DEFAULT_OFFICE_ZONES = Object.freeze([
  {
    id: 'audio-lab',
    name: 'Spatial Audio Lab',
    type: 'audio-lab',
    bounds: { x: 30, y: 30, width: 420, height: 260 },
    color: 'rgba(99, 102, 241, 0.12)',
    description: '3D Stereo Panning & Acoustic Testing Chamber'
  },
  {
    id: 'engineering-bay',
    name: 'Core WebRTC Bay',
    type: 'engineering',
    bounds: { x: 510, y: 30, width: 420, height: 260 },
    color: 'rgba(16, 185, 129, 0.12)',
    description: 'Real-time WebSocket & Canvas Layer Devs'
  },
  {
    id: 'product-hub',
    name: 'Product & Design Hub',
    type: 'product-hub',
    bounds: { x: 30, y: 350, width: 420, height: 260 },
    color: 'rgba(245, 158, 11, 0.12)',
    description: 'UI/UX Wireframes & Virtual Office Strategy'
  },
  {
    id: 'lounge-pantry',
    name: 'Breakout Lounge & Water Cooler',
    type: 'breakout-lounge',
    bounds: { x: 510, y: 350, width: 420, height: 260 },
    color: 'rgba(236, 72, 153, 0.12)',
    description: 'Casual Water Cooler Chat & Coffee Station'
  }
]);

// Furniture footprints. `blocksSound` is the Week 4 acoustic-occlusion flag:
// when the line of sight between two avatars crosses one of these rectangles
// the distant voice is attenuated (muffled) instead of being relayed cleanly.
const DEFAULT_OFFICE_OBSTACLES = Object.freeze([
  { id: 'webrtc-pod-1', type: 'desk', x: 550, y: 80, width: 140, height: 60, label: 'WebRTC Cluster Pod 1', blocksSound: true },
  { id: 'webrtc-pod-2', type: 'desk', x: 740, y: 80, width: 140, height: 60, label: 'WebSocket Cluster Pod 2', blocksSound: true },
  { id: 'webrtc-pod-3', type: 'desk', x: 550, y: 190, width: 140, height: 60, label: 'Frontend Mesh Station', blocksSound: true },
  { id: 'webrtc-pod-4', type: 'desk', x: 740, y: 190, width: 140, height: 60, label: 'Node Gateway Station', blocksSound: true },
  { id: 'audio-console-1', type: 'console', x: 70, y: 90, width: 150, height: 60, label: 'Audio DSP Mixing Board', blocksSound: true },
  { id: 'audio-console-2', type: 'console', x: 260, y: 90, width: 140, height: 60, label: 'Acoustic Synthesizer Rack', blocksSound: true },
  { id: 'product-island', type: 'table', x: 80, y: 440, width: 180, height: 70, label: 'UX Wireframe Island', blocksSound: true },
  { id: 'pantry-island', type: 'table', x: 640, y: 440, width: 160, height: 70, label: 'Pantry Island & Water Cooler', blocksSound: true }
]);

const DEFAULT_OFFICE_LAYOUT = Object.freeze({
  name: 'ProxiSpeak Infotact Main Office',
  cluster: 'proxify',
  dimensions: DEFAULT_OFFICE_DIMENSIONS,
  zones: DEFAULT_OFFICE_ZONES,
  obstacles: DEFAULT_OFFICE_OBSTACLES,
  spawnPoint: [480, 320],
  isActive: true
});

function cloneLayout(layout = DEFAULT_OFFICE_LAYOUT) {
  return JSON.parse(JSON.stringify(layout));
}

module.exports = {
  DEFAULT_OFFICE_DIMENSIONS,
  DEFAULT_OFFICE_ZONES,
  DEFAULT_OFFICE_OBSTACLES,
  DEFAULT_OFFICE_LAYOUT,
  cloneLayout
};
