const http = require('http');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { Server } = require('socket.io');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const worldRoutes = require('./routes/world');
const initWorldSocket = require('./realtime/worldSocket');

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/proxispeak';

// Middleware
app.use(cors({
  origin: '*', // Allow frontend Vite app
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
    timestamp: new Date().toISOString()
  });
});

// Connect to MongoDB
mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log(`[ProxiSpeak] Successfully connected to MongoDB at ${MONGODB_URI}`);
  })
  .catch((err) => {
    console.warn(`[ProxiSpeak] MongoDB connection warning: ${err.message}`);
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
initWorldSocket(io);

httpServer.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[ProxiSpeak] Port ${PORT} is already in use. Try: PORT=${Number(PORT) + 1} npm start`);
    process.exit(1);
  }
  throw err;
});

httpServer.listen(PORT, () => {
  console.log(`[ProxiSpeak Auth Server] Running on http://localhost:${PORT}`);
  console.log(`[ProxiSpeak Realtime] Socket.io world broadcasting active on ws://localhost:${PORT}`);
});
