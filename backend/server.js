const http = require('http');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const Redis = require('ioredis');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const worldRoutes = require('./routes/world');
const spatialRoutes = require('./routes/spatial');
const initWorldSocket = require('./realtime/worldSocket');
const initSignalingServer = require('./sockets/signaling');

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/proxify';
const REDIS_URL = process.env.REDIS_URL;

// Middleware
app.use(cors({
  origin: '*',
  credentials: true
}));
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/world', worldRoutes);
app.use('/api/spatial', spatialRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'Connected to MongoDB' : 'Standalone / In-Memory Mode';
  res.json({
    status: 'online',
    project: 'ProxiSpeak: Geospatial Proximity Audio Ecosystem',
    organization: 'Infotact Solutions',
    database: dbStatus,
    redis: REDIS_URL ? 'configured' : 'disabled',
    modules: {
      auth: 'JWT Authentication Active',
      world: '2D Canvas World (Socket.io Coordinates)',
      signaling: 'WebRTC Signaling Active',
      spatial: 'MongoDB 2D Geospatial Index ($near & $geoWithin)'
    },
    timestamp: new Date().toISOString()
  });
});

// HTTP + Socket.io server
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Both realtime layers share one Socket.io server:
// - worldSocket: world:* coordinate broadcasting for the 2D canvas world
// - signaling: join-space / avatar-move / webrtc-* for the virtual office
initWorldSocket(io);
initSignalingServer(io);

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function setupRedisAdapter() {
  if (!REDIS_URL) {
    return;
  }

  const options = {
    lazyConnect: true,
    connectTimeout: 2000,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null
  };
  const pubClient = new Redis(REDIS_URL, options);
  const subClient = pubClient.duplicate();
  pubClient.on('error', (err) => console.warn('[ProxiSpeak] Redis pub client error:', err.message));
  subClient.on('error', (err) => console.warn('[ProxiSpeak] Redis sub client error:', err.message));

  try {
    await withTimeout(
      Promise.all([pubClient.connect(), subClient.connect()]),
      3000,
      'Redis connection timed out'
    );
    io.adapter(createAdapter(pubClient, subClient));
    console.log('[ProxiSpeak] Redis Pub/Sub adapter enabled for Socket.io scaling');
  } catch (err) {
    pubClient.disconnect();
    subClient.disconnect();
    console.warn('[ProxiSpeak] Redis adapter setup failed, falling back to in-memory adapter:', err.message);
  }
}

// Connect to MongoDB
mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('[ProxiSpeak] Successfully connected to MongoDB');
  })
  .catch((err) => {
    console.warn(`[ProxiSpeak] MongoDB connection warning: ${err.message}`);
    console.log('[ProxiSpeak] Running with in-memory fallback enabled for smooth operation.');
  });

setupRedisAdapter().finally(() => {
  httpServer.listen(PORT, () => {
    console.log(`[ProxiSpeak Auth Server] Running on http://localhost:${PORT}`);
    console.log(`[ProxiSpeak Realtime] Socket.io world broadcasting active on ws://localhost:${PORT}`);
  });
});
