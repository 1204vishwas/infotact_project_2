const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const spatialRoutes = require('./routes/spatial');
const initSignalingServer = require('./sockets/signaling');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/proxify';

// Setup Socket.io for Real-time Avatar Movement & WebRTC Signaling
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors({
  origin: '*',
  credentials: true
}));
app.use(express.json());

// Mount API Routes
app.use('/api/auth', authRoutes);
app.use('/api/spatial', spatialRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'Connected to MongoDB (proxify)' : 'Standalone / In-Memory Mode';
  res.json({
    status: 'online',
    project: 'ProxiSpeak: Geospatial Proximity Audio Ecosystem (Week 1)',
    organization: 'Infotact Solutions',
    database: dbStatus,
    modules: {
      signaling: 'Socket.io WebSocket Active',
      geospatial: 'MongoDB 2D Index ($near & $geoWithin)',
      worldRendering: 'React Canvas Layer'
    },
    timestamp: new Date().toISOString()
  });
});

// Initialize WebSocket Signaling & Avatar Movement System
const signalingService = initSignalingServer(io);

// Connect to MongoDB
mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log(`[ProxiSpeak] Successfully connected to MongoDB at ${MONGODB_URI}`);
  })
  .catch((err) => {
    console.warn(`[ProxiSpeak] MongoDB connection warning: ${err.message}`);
    console.log('[ProxiSpeak] Running with in-memory fallback enabled.');
  });

// Start HTTP + WebSocket Server
server.listen(PORT, () => {
  console.log(`[ProxiSpeak Week 1 Server] HTTP & Socket.io running on http://localhost:${PORT}`);
});
