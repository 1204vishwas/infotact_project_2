const http = require('http');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const worldRoutes = require('./routes/world');
const initWorldSocket = require('./realtime/worldSocket');

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/proxispeak';
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

// Health check endpoint
app.get('/api/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'Connected to MongoDB' : 'Standalone / In-Memory Mode';
  res.json({
    status: 'online',
    project: 'ProxiSpeak: Geospatial Proximity Audio Ecosystem',
    organization: 'Infotact Solutions',
    database: dbStatus,
    redis: REDIS_URL ? 'configured' : 'disabled',
    timestamp: new Date().toISOString()
  });
});

// Connect to MongoDB
mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log([ProxiSpeak] Successfully connected to MongoDB at );
  })
  .catch((err) => {
    console.warn([ProxiSpeak] MongoDB connection warning: );
    console.log('[ProxiSpeak] Running with in-memory fallback enabled for smooth operation.');
  });

// Create the HTTP server and attach the realtime coordinate-broadcasting layer
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

async function setupRedisAdapter() {
  if (!REDIS_URL) {
    return;
  }
  try {
    const pubClient = createClient({ url: REDIS_URL });
    const subClient = pubClient.duplicate();
    await Promise.all([pubClient.connect(), subClient.connect()]);
    io.adapter(createAdapter(pubClient, subClient));
    console.log('[ProxiSpeak] Redis Pub/Sub adapter enabled for Socket.io scaling');
  } catch (err) {
    console.warn('[ProxiSpeak] Redis adapter setup failed, falling back to in-memory adapter:', err.message);
  }
}

setupRedisAdapter().finally(() => {
  initWorldSocket(io);

  httpServer.listen(PORT, () => {
    console.log([ProxiSpeak Auth Server] Running on http://localhost:);
    console.log([ProxiSpeak Realtime] Socket.io world broadcasting active on ws://localhost:);
  });
});
