const User = require('../models/User');
const { RedisMeshAdapterService } = require('../services/redisAdapter');
const { calculateAttenuation, ATTENUATION_MODELS } = require('../services/attenuationService');

// ====================================================
// WEBRTC MESH & PROXIMITY SCALING PARAMETERS
// ====================================================
// Strictly enforced 100-pixel earshot threshold for WebRTC offers, answers, and audio mesh
const WEBRTC_PROXIMITY_RADIUS = 100;

// Boundary hysteresis buffer (115px) to prevent connection churn ("mesh thrashing")
const WEBRTC_DISCONNECT_RADIUS = 115;

// Maximum active audio mesh peer connections per avatar (Human ear Cocktail Party limit)
const MAX_MESH_PEERS = 6;

// Euclidean distance calculation helper
function calculateDistance(locA, locB) {
  if (!locA || !locB || !Array.isArray(locA) || !Array.isArray(locB)) return Infinity;
  const dx = locA[0] - locB[0];
  const dy = locA[1] - locB[1];
  return Math.sqrt(dx * dx + dy * dy);
}

// Dynamic distance attenuation formula using backend attenuation service
function calculateGain(distance, maxRadius = WEBRTC_PROXIMITY_RADIUS) {
  const result = calculateAttenuation(distance, { maxRadius, hysteresisRadius: WEBRTC_DISCONNECT_RADIUS });
  return result.gainPercent;
}

module.exports = function initSignalingServer(io, options = {}) {
  // Active avatars across the space (socketId -> profile)
  // Synchronized across multiple Node instances via Redis Pub/Sub
  const activeAvatars = new Map();

  // Set of in-range peers per local socket for detecting entry and exit transitions
  const inRangePeerPairs = new Map();

  // Throttle map for updating coordinates in MongoDB
  const pendingDbUpdates = new Map();

  // Last movement timestamp cache for throttling distance updates (30Hz rate-limit)
  const lastMoveTimestamps = new Map();

  // Initialize Redis Pub/Sub scaling adapter
  const redisService = options.redisService || new RedisMeshAdapterService();
  const initPromise = redisService.initialize(io, options).catch((err) => {
    console.warn('[ProxiSpeak Signaling] Redis init warning:', err.message);
  });

  // Listen for cross-node mesh state sync events via Redis Pub/Sub
  redisService.onMeshSync((action, data) => {
    switch (action) {
      case 'AVATAR_JOINED': {
        const peer = data;
        if (peer && peer.socketId) {
          activeAvatars.set(peer.socketId, peer);
          console.log(`[ProxiSpeak Cluster Sync] Remote avatar '${peer.name}' registered on node ${redisService.nodeInstanceId}`);

          // Synchronize in-range peer tracking for sockets hosted on this local node
          for (const [localSocketId, localAvatar] of activeAvatars.entries()) {
            if (localSocketId === peer.socketId) continue;
            const localSocket = io.sockets.sockets ? io.sockets.sockets.get(localSocketId) : null;
            if (localSocket) {
              const distance = calculateDistance(localAvatar.location, peer.location);
              if (distance <= WEBRTC_PROXIMITY_RADIUS) {
                const inRangeSet = inRangePeerPairs.get(localSocketId) || new Set();
                inRangeSet.add(peer.socketId);
                inRangePeerPairs.set(localSocketId, inRangeSet);
              }
            }
          }
        }
        break;
      }
      case 'AVATAR_MOVED': {
        const { socketId, location, direction, isMoving } = data;
        const avatar = activeAvatars.get(socketId);
        if (avatar) {
          avatar.location = location;
          if (direction) avatar.direction = direction;
          avatar.isMoving = !!isMoving;

          // Synchronize in-range tracking for sockets on this node relative to moved remote avatar
          for (const [localSocketId, localAvatar] of activeAvatars.entries()) {
            if (localSocketId === socketId) continue;
            const localSocket = io.sockets.sockets ? io.sockets.sockets.get(localSocketId) : null;
            if (localSocket) {
              const distance = calculateDistance(localAvatar.location, avatar.location);
              const inRangeSet = inRangePeerPairs.get(localSocketId) || new Set();
              if (distance <= WEBRTC_PROXIMITY_RADIUS) {
                inRangeSet.add(socketId);
              } else if (distance > WEBRTC_DISCONNECT_RADIUS) {
                inRangeSet.delete(socketId);
              }
              inRangePeerPairs.set(localSocketId, inRangeSet);
            }
          }
        }
        break;
      }
      case 'AVATAR_AUDIO': {
        const { socketId, micMuted, deafened } = data;
        const avatar = activeAvatars.get(socketId);
        if (avatar) {
          avatar.micMuted = !!micMuted;
          avatar.deafened = !!deafened;
        }
        break;
      }
      case 'AVATAR_LEFT': {
        const { socketId } = data;
        if (socketId) {
          activeAvatars.delete(socketId);
          inRangePeerPairs.delete(socketId);
          for (const set of inRangePeerPairs.values()) {
            set.delete(socketId);
          }
        }
        break;
      }
      default:
        break;
    }
  });

  // Periodically flush coordinates to MongoDB (every 2.5 seconds)
  const dbInterval = setInterval(async () => {
    if (pendingDbUpdates.size === 0) return;

    const updates = Array.from(pendingDbUpdates.entries());
    pendingDbUpdates.clear();

    for (const [userId, location] of updates) {
      try {
        await User.findByIdAndUpdate(userId, {
          location,
          status: 'online',
          updatedAt: new Date()
        });
      } catch (err) {
        // Ignore if user is a guest session
      }
    }
  }, 2500);

  // Clean teardown if server is closed
  if (io.httpServer) {
    io.httpServer.once('close', () => {
      clearInterval(dbInterval);
      redisService.close().catch(() => {});
    });
  }

  // ====================================================
  // SOCKET CONNECTION HANDLER
  // ====================================================
  io.on('connection', (socket) => {
    console.log(`[ProxiSpeak Socket] Avatar connected: ${socket.id} (Node: ${redisService.nodeInstanceId})`);

    // Initialize in-range tracking set for this socket
    inRangePeerPairs.set(socket.id, new Set());

    // ====================================================
    // 1. JOIN VIRTUAL OFFICE SPACE
    // ====================================================
    socket.on('join-space', async (userData) => {
      try {
        const userId = userData?.id || userData?._id || `guest_${socket.id.substring(0, 6)}`;
        const name = userData?.name || 'Anonymous Avatar';
        const role = userData?.role || 'Developer';
        const avatarColor = userData?.avatarColor || '#6366f1';

        // Spawn coordinate fallback
        const location = Array.isArray(userData?.location)
          ? userData.location
          : (userData?.location?.coordinates || [
              Math.floor(Math.random() * 200) + 400,
              Math.floor(Math.random() * 100) + 250
            ]);

        const avatarProfile = {
          socketId: socket.id,
          userId,
          name,
          username: userData?.username || name.toLowerCase().replace(/\s+/g, '_'),
          role,
          avatarColor,
          location,
          micMuted: false,
          deafened: false,
          joinedAt: new Date(),
          nodeInstanceId: redisService.nodeInstanceId
        };

        activeAvatars.set(socket.id, avatarProfile);

        // Synchronize new avatar across all Node instances via Redis Pub/Sub & Redis Hash
        await redisService.persistAvatar(socket.id, avatarProfile);
        await redisService.publishMeshSync('AVATAR_JOINED', avatarProfile);

        // 1. Send all existing peers across the entire cluster to the newly joined avatar
        const currentPeers = Array.from(activeAvatars.values()).filter((a) => a.socketId !== socket.id);
        socket.emit('space-state', {
          self: avatarProfile,
          peers: currentPeers,
          totalOnline: activeAvatars.size,
          webrtcRadiusLimit: WEBRTC_PROXIMITY_RADIUS,
          hysteresisRadiusLimit: WEBRTC_DISCONNECT_RADIUS,
          maxMeshPeers: MAX_MESH_PEERS,
          nodeInstanceId: redisService.nodeInstanceId,
          clusterMode: redisService.mode
        });

        // 2. Broadcast new avatar arrival to all other connected avatars across all nodes
        // (Socket.io Redis adapter relays broadcast across all cluster instances)
        socket.broadcast.emit('user-joined', avatarProfile);

        console.log(`[ProxiSpeak] User '${name}' (${role}) joined space at [${location.join(', ')}]. Total cluster avatars: ${activeAvatars.size}`);

        // 3. Evaluate initial proximity with all cluster avatars upon joining
        const initialInRange = new Set();
        const candidatePeers = [];

        for (const [peerSocketId, peerAvatar] of activeAvatars.entries()) {
          if (peerSocketId === socket.id) continue;
          const distance = calculateDistance(avatarProfile.location, peerAvatar.location);
          if (distance <= WEBRTC_PROXIMITY_RADIUS) {
            candidatePeers.push({ peerSocketId, peerAvatar, distance });
          }
        }

        // Sort candidates by distance for density culling (closest K peers get active WebRTC)
        candidatePeers.sort((a, b) => a.distance - b.distance);

        candidatePeers.forEach(({ peerSocketId, peerAvatar, distance }, index) => {
          const isCulled = index >= MAX_MESH_PEERS;
          initialInRange.add(peerSocketId);

          const peerSet = inRangePeerPairs.get(peerSocketId) || new Set();
          peerSet.add(socket.id);
          inRangePeerPairs.set(peerSocketId, peerSet);

          const gain = calculateGain(distance, WEBRTC_PROXIMITY_RADIUS);
          console.log(`[Proximity on Join] '${name}' joined within 100px of '${peerAvatar.name}' (${distance.toFixed(1)}px). WebRTC Offer Allowed.`);

          // Notify newly joined avatar
          socket.emit('proximity-peer-entered', {
            peer: peerAvatar,
            distance: Math.round(distance),
            maxRadius: WEBRTC_PROXIMITY_RADIUS,
            gain,
            isCulled,
            shouldInitiateOffer: socket.id < peerSocketId // deterministic offer initiator
          });

          // Notify peer (routed by Socket.io Redis adapter if on a remote node)
          io.to(peerSocketId).emit('proximity-peer-entered', {
            peer: avatarProfile,
            distance: Math.round(distance),
            maxRadius: WEBRTC_PROXIMITY_RADIUS,
            gain,
            isCulled,
            shouldInitiateOffer: peerSocketId < socket.id
          });
        });

        inRangePeerPairs.set(socket.id, initialInRange);

        // Update MongoDB presence
        if (userData?.id && !userData.id.startsWith('guest_')) {
          pendingDbUpdates.set(userData.id, location);
        }
      } catch (err) {
        console.error('[ProxiSpeak Socket Error on join-space]:', err);
      }
    });

    // ====================================================
    // 2. AVATAR REAL-TIME MOVEMENT & PROXIMITY CALCULATIONS
    // ====================================================
    socket.on('avatar-move', async (movementData) => {
      const avatar = activeAvatars.get(socket.id);
      if (!avatar) return;

      const { x, y, direction, isMoving } = movementData;
      if (typeof x !== 'number' || typeof y !== 'number') return;

      // Update in-memory coordinates
      avatar.location = [Math.round(x), Math.round(y)];
      avatar.direction = direction || avatar.direction;
      avatar.isMoving = !!isMoving;

      // Rate-limit movement broadcast over Redis Pub/Sub (max 30Hz / 33ms)
      const now = Date.now();
      const lastMove = lastMoveTimestamps.get(socket.id) || 0;
      if (now - lastMove > 33 || !isMoving) {
        lastMoveTimestamps.set(socket.id, now);

        // Broadcast new position across cluster (Socket.io Redis adapter distributes)
        socket.broadcast.emit('user-moved', {
          socketId: socket.id,
          userId: avatar.userId,
          location: avatar.location,
          direction: avatar.direction,
          isMoving: avatar.isMoving
        });

        // Sync coordinates across Node instances
        redisService.publishMeshSync('AVATAR_MOVED', {
          socketId: socket.id,
          location: avatar.location,
          direction: avatar.direction,
          isMoving: avatar.isMoving
        });
      }

      // ----------------------------------------------------
      // Real-time Proximity Transitions with Hysteresis & Culling
      // ----------------------------------------------------
      const currentInRange = inRangePeerPairs.get(socket.id) || new Set();
      const nextInRange = new Set();
      const activeCandidates = [];

      for (const [peerSocketId, peerAvatar] of activeAvatars.entries()) {
        if (peerSocketId === socket.id) continue;

        const distance = calculateDistance(avatar.location, peerAvatar.location);

        // HYSTERESIS CHECK:
        // Connect if distance <= 100px.
        // Maintain connection if already connected and distance <= 115px.
        // Tear down only when distance > 115px.
        const wasInRange = currentInRange.has(peerSocketId);
        const threshold = wasInRange ? WEBRTC_DISCONNECT_RADIUS : WEBRTC_PROXIMITY_RADIUS;

        if (distance <= threshold) {
          nextInRange.add(peerSocketId);
          activeCandidates.push({ peerSocketId, peerAvatar, distance, wasInRange });
        } else if (wasInRange) {
          // Transition: Peer EXITED the hysteresis boundary (> 115px)
          console.log(`[Proximity Transition] '${peerAvatar.name}' EXITED 100px radius of '${avatar.name}' (${distance.toFixed(1)}px). Closing WebRTC audio.`);

          const peerSet = inRangePeerPairs.get(peerSocketId) || new Set();
          peerSet.delete(socket.id);
          inRangePeerPairs.set(peerSocketId, peerSet);

          socket.emit('proximity-peer-left', {
            peerSocketId,
            peerName: peerAvatar.name,
            distance: Math.round(distance),
            maxRadius: WEBRTC_PROXIMITY_RADIUS
          });

          io.to(peerSocketId).emit('proximity-peer-left', {
            peerSocketId: socket.id,
            peerName: avatar.name,
            distance: Math.round(distance),
            maxRadius: WEBRTC_PROXIMITY_RADIUS
          });
        }
      }

      // Density Culling: Sort candidates by distance
      activeCandidates.sort((a, b) => a.distance - b.distance);

      activeCandidates.forEach(({ peerSocketId, peerAvatar, distance, wasInRange }, rank) => {
        const isCulled = rank >= MAX_MESH_PEERS;
        const gain = calculateGain(distance, WEBRTC_PROXIMITY_RADIUS);

        if (!wasInRange) {
          // Transition: Peer just ENTERED 100px earshot!
          console.log(`[Proximity Transition] '${peerAvatar.name}' ENTERED 100px radius of '${avatar.name}' (${distance.toFixed(1)}px). WebRTC Offer Allowed.`);

          const peerSet = inRangePeerPairs.get(peerSocketId) || new Set();
          peerSet.add(socket.id);
          inRangePeerPairs.set(peerSocketId, peerSet);

          socket.emit('proximity-peer-entered', {
            peer: peerAvatar,
            distance: Math.round(distance),
            maxRadius: WEBRTC_PROXIMITY_RADIUS,
            gain,
            isCulled,
            shouldInitiateOffer: socket.id < peerSocketId
          });

          io.to(peerSocketId).emit('proximity-peer-entered', {
            peer: avatar,
            distance: Math.round(distance),
            maxRadius: WEBRTC_PROXIMITY_RADIUS,
            gain,
            isCulled,
            shouldInitiateOffer: peerSocketId < socket.id
          });
        } else {
          // Dynamic continuous audio distance attenuation update
          socket.emit('proximity-distance-update', {
            peerSocketId,
            distance: Math.round(distance),
            gain,
            isCulled
          });

          io.to(peerSocketId).emit('proximity-distance-update', {
            peerSocketId: socket.id,
            distance: Math.round(distance),
            gain,
            isCulled
          });
        }
      });

      inRangePeerPairs.set(socket.id, nextInRange);

      // Queue database persistence
      if (avatar.userId && !avatar.userId.startsWith('guest_')) {
        pendingDbUpdates.set(avatar.userId, avatar.location);
      }
    });

    // ====================================================
    // 3. AUDIO STATE CHANGE (Mic Mute / Deafened)
    // ====================================================
    socket.on('audio-state-change', (audioState) => {
      const avatar = activeAvatars.get(socket.id);
      if (!avatar) return;

      avatar.micMuted = !!audioState.micMuted;
      avatar.deafened = !!audioState.deafened;

      socket.broadcast.emit('user-audio-changed', {
        socketId: socket.id,
        userId: avatar.userId,
        micMuted: avatar.micMuted,
        deafened: avatar.deafened
      });

      redisService.publishMeshSync('AVATAR_AUDIO', {
        socketId: socket.id,
        micMuted: avatar.micMuted,
        deafened: avatar.deafened
      });
    });

    // ====================================================
    // 4. WebRTC SIGNALING GATEKEEPER (100-PIXEL RADIUS & REDIS RELAY)
    // ====================================================

    // Relay WebRTC Offer — ONLY allowed if within 100-pixel radius
    socket.on('webrtc-offer', ({ targetSocketId, offer }) => {
      const sender = activeAvatars.get(socket.id);
      const target = activeAvatars.get(targetSocketId);

      if (!sender || !target) {
        socket.emit('webrtc-signal-error', {
          message: 'Target peer avatar is no longer active in the space.'
        });
        return;
      }

      const distance = calculateDistance(sender.location, target.location);

      // --- STRICT PROXIMITY CHECK: EXCLUDE PEERS BEYOND 100 PIXELS ---
      if (distance > WEBRTC_PROXIMITY_RADIUS) {
        console.warn(`[WebRTC Guard: BLOCKED] Offer from '${sender.name}' to '${target.name}' rejected. Distance ${distance.toFixed(1)}px exceeds ${WEBRTC_PROXIMITY_RADIUS}px limit.`);

        socket.emit('webrtc-signal-rejected', {
          type: 'offer',
          targetSocketId,
          targetName: target.name,
          distance: Math.round(distance),
          maxRadius: WEBRTC_PROXIMITY_RADIUS,
          reason: 'OUT_OF_PROXIMITY_RANGE',
          message: `WebRTC Offer Blocked: Peer '${target.name}' is ${Math.round(distance)}px away, exceeding the 100-pixel earshot limit.`
        });
        return;
      }

      // Proximity verified: Distance is <= 100px
      const gain = calculateGain(distance, WEBRTC_PROXIMITY_RADIUS);
      console.log(`[WebRTC Guard: PERMITTED] Offer from '${sender.name}' to '${target.name}' accepted. Distance ${distance.toFixed(1)}px <= 100px (Gain: ${gain}%).`);

      // Routed via Socket.io Redis adapter if target is on a different Node instance
      io.to(targetSocketId).emit('webrtc-offer', {
        callerSocketId: socket.id,
        callerUser: sender,
        offer,
        proximity: {
          distance: Math.round(distance),
          maxRadius: WEBRTC_PROXIMITY_RADIUS,
          gain,
          inRange: true
        }
      });
    });

    // Relay WebRTC Answer — ONLY allowed if within 100-pixel radius
    socket.on('webrtc-answer', ({ targetSocketId, answer }) => {
      const callee = activeAvatars.get(socket.id);
      const caller = activeAvatars.get(targetSocketId);

      if (!callee || !caller) {
        socket.emit('webrtc-signal-error', {
          message: 'Caller avatar is no longer active in the space.'
        });
        return;
      }

      const distance = calculateDistance(callee.location, caller.location);

      // --- STRICT PROXIMITY CHECK: EXCLUDE PEERS BEYOND 100 PIXELS ---
      if (distance > WEBRTC_PROXIMITY_RADIUS) {
        console.warn(`[WebRTC Guard: BLOCKED] Answer from '${callee.name}' to '${caller.name}' rejected. Distance ${distance.toFixed(1)}px exceeds ${WEBRTC_PROXIMITY_RADIUS}px limit.`);

        socket.emit('webrtc-signal-rejected', {
          type: 'answer',
          targetSocketId,
          targetName: caller.name,
          distance: Math.round(distance),
          maxRadius: WEBRTC_PROXIMITY_RADIUS,
          reason: 'OUT_OF_PROXIMITY_RANGE',
          message: `WebRTC Answer Blocked: Caller '${caller.name}' is ${Math.round(distance)}px away, exceeding the 100-pixel earshot limit.`
        });
        return;
      }

      const gain = calculateGain(distance, WEBRTC_PROXIMITY_RADIUS);
      console.log(`[WebRTC Guard: PERMITTED] Answer from '${callee.name}' to '${caller.name}' accepted. Distance ${distance.toFixed(1)}px <= 100px (Gain: ${gain}%).`);

      // Routed via Socket.io Redis adapter across cluster
      io.to(targetSocketId).emit('webrtc-answer', {
        calleeSocketId: socket.id,
        calleeUser: callee,
        answer,
        proximity: {
          distance: Math.round(distance),
          maxRadius: WEBRTC_PROXIMITY_RADIUS,
          gain,
          inRange: true
        }
      });
    });

    // Relay ICE Candidate — ONLY allowed if within 100-pixel radius
    socket.on('webrtc-ice-candidate', ({ targetSocketId, candidate }) => {
      const sender = activeAvatars.get(socket.id);
      const target = activeAvatars.get(targetSocketId);

      if (!sender || !target) return;

      const distance = calculateDistance(sender.location, target.location);
      if (distance > WEBRTC_DISCONNECT_RADIUS) {
        // Discard ICE candidate if outside proximity range
        return;
      }

      io.to(targetSocketId).emit('webrtc-ice-candidate', {
        senderSocketId: socket.id,
        candidate,
        distance: Math.round(distance)
      });
    });

    // ====================================================
    // 5. QUERY PROXIMITY GROUPS VIA MONGODB $near
    // ====================================================
    socket.on('get-proximity-groups', async () => {
      try {
        const groups = await User.groupUsersByProximity(WEBRTC_PROXIMITY_RADIUS);
        socket.emit('proximity-groups-updated', groups);
      } catch (err) {
        console.error('[ProxiSpeak Socket Error on get-proximity-groups]:', err);
      }
    });

    // ====================================================
    // 6. DISCONNECT / LEAVE
    // ====================================================
    socket.on('disconnect', async () => {
      const leavingAvatar = activeAvatars.get(socket.id);
      if (leavingAvatar) {
        activeAvatars.delete(socket.id);
        inRangePeerPairs.delete(socket.id);
        lastMoveTimestamps.delete(socket.id);

        // Remove from other peers' in-range sets
        for (const set of inRangePeerPairs.values()) {
          set.delete(socket.id);
        }

        // Broadcast to cluster via Socket.io Redis adapter
        socket.broadcast.emit('user-left', {
          socketId: socket.id,
          userId: leavingAvatar.userId,
          name: leavingAvatar.name
        });

        // Sync departure across Node instances
        await redisService.removeAvatar(socket.id);
        await redisService.publishMeshSync('AVATAR_LEFT', { socketId: socket.id });

        console.log(`[ProxiSpeak] User '${leavingAvatar.name}' left. Total online cluster avatars: ${activeAvatars.size}`);
      }
    });
  });

  return {
    getActiveAvatars: () => Array.from(activeAvatars.values()),
    getProximityRadius: () => WEBRTC_PROXIMITY_RADIUS,
    getDisconnectRadius: () => WEBRTC_DISCONNECT_RADIUS,
    getMaxMeshPeers: () => MAX_MESH_PEERS,
    getRedisService: () => redisService,
    getNodeInstanceId: () => redisService.nodeInstanceId,
    ready: initPromise
  };
};
