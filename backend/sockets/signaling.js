const User = require('../models/User');

// Strictly enforced 100-pixel radius threshold for WebRTC offers, answers, and audio mesh
const WEBRTC_PROXIMITY_RADIUS = 100;

// Active avatars in the virtual office space (socketId -> profile)
const activeAvatars = new Map();

// Set of in-range peers per socket for detecting entry and exit transitions
const inRangePeerPairs = new Map();

// Throttle map for updating coordinates in MongoDB
const pendingDbUpdates = new Map();

// Euclidean distance calculation helper
function calculateDistance(locA, locB) {
  if (!locA || !locB || !Array.isArray(locA) || !Array.isArray(locB)) return Infinity;
  const dx = locA[0] - locB[0];
  const dy = locA[1] - locB[1];
  return Math.sqrt(dx * dx + dy * dy);
}

// Flush coordinates to MongoDB periodically (every 2.5 seconds)
setInterval(async () => {
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

module.exports = function initSignalingServer(io) {
  io.on('connection', (socket) => {
    console.log(`[ProxiSpeak Socket] Avatar connected: ${socket.id}`);

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
          joinedAt: new Date()
        };

        activeAvatars.set(socket.id, avatarProfile);

        // 1. Send all existing peers in the space to the newly joined avatar
        const currentPeers = Array.from(activeAvatars.values()).filter(a => a.socketId !== socket.id);
        socket.emit('space-state', {
          self: avatarProfile,
          peers: currentPeers,
          totalOnline: activeAvatars.size,
          webrtcRadiusLimit: WEBRTC_PROXIMITY_RADIUS
        });

        // 2. Broadcast new avatar arrival to all other connected avatars
        socket.broadcast.emit('user-joined', avatarProfile);

        console.log(`[ProxiSpeak] User '${name}' (${role}) joined space at [${location.join(', ')}]. Total: ${activeAvatars.size}`);

        // 3. Evaluate initial proximity with all active avatars upon joining
        const initialInRange = new Set();
        for (const [peerSocketId, peerAvatar] of activeAvatars.entries()) {
          if (peerSocketId === socket.id) continue;
          const distance = calculateDistance(avatarProfile.location, peerAvatar.location);
          if (distance <= WEBRTC_PROXIMITY_RADIUS) {
            initialInRange.add(peerSocketId);
            const peerSet = inRangePeerPairs.get(peerSocketId) || new Set();
            peerSet.add(socket.id);
            inRangePeerPairs.set(peerSocketId, peerSet);

            const gain = Math.max(10, Math.min(100, Math.round((1 - distance / WEBRTC_PROXIMITY_RADIUS) * 100)));
            console.log(`[Proximity on Join] '${name}' joined within 100px of '${peerAvatar.name}' (${distance.toFixed(1)}px). Initializing WebRTC handshake.`);

            // Notify newly joined avatar
            socket.emit('proximity-peer-entered', {
              peer: peerAvatar,
              distance: Math.round(distance),
              maxRadius: WEBRTC_PROXIMITY_RADIUS,
              gain,
              shouldInitiateOffer: socket.id < peerSocketId
            });

            // Notify peer
            io.to(peerSocketId).emit('proximity-peer-entered', {
              peer: avatarProfile,
              distance: Math.round(distance),
              maxRadius: WEBRTC_PROXIMITY_RADIUS,
              gain,
              shouldInitiateOffer: peerSocketId < socket.id
            });
          }
        }
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

      // Broadcast new position to all other avatars in the canvas world
      socket.broadcast.emit('user-moved', {
        socketId: socket.id,
        userId: avatar.userId,
        location: avatar.location,
        direction: avatar.direction,
        isMoving: avatar.isMoving
      });

      // ----------------------------------------------------
      // Real-time Proximity Boundary Transitions (100-pixel radius)
      // ----------------------------------------------------
      const currentInRange = inRangePeerPairs.get(socket.id) || new Set();
      const nextInRange = new Set();

      for (const [peerSocketId, peerAvatar] of activeAvatars.entries()) {
        if (peerSocketId === socket.id) continue;

        const distance = calculateDistance(avatar.location, peerAvatar.location);

        if (distance <= WEBRTC_PROXIMITY_RADIUS) {
          nextInRange.add(peerSocketId);

          // Transition: Peer just ENTERED 100-pixel radius!
          if (!currentInRange.has(peerSocketId)) {
            const gain = Math.max(10, Math.min(100, Math.round((1 - distance / WEBRTC_PROXIMITY_RADIUS) * 100)));
            console.log(`[Proximity Transition] '${peerAvatar.name}' ENTERED 100px radius of '${avatar.name}' (${distance.toFixed(1)}px). WebRTC Offer Allowed.`);

            const peerSet = inRangePeerPairs.get(peerSocketId) || new Set();
            peerSet.add(socket.id);
            inRangePeerPairs.set(peerSocketId, peerSet);

            // Notify moving avatar to initiate or accept offer
            socket.emit('proximity-peer-entered', {
              peer: peerAvatar,
              distance: Math.round(distance),
              maxRadius: WEBRTC_PROXIMITY_RADIUS,
              gain,
              shouldInitiateOffer: socket.id < peerSocketId // deterministic offer initiator to prevent glare
            });

            // Notify target peer
            io.to(peerSocketId).emit('proximity-peer-entered', {
              peer: avatar,
              distance: Math.round(distance),
              maxRadius: WEBRTC_PROXIMITY_RADIUS,
              gain,
              shouldInitiateOffer: peerSocketId < socket.id
            });
          } else {
            // Continuous dynamic audio attenuation update while staying within 100px earshot
            const gain = Math.max(10, Math.min(100, Math.round((1 - distance / WEBRTC_PROXIMITY_RADIUS) * 100)));
            socket.emit('proximity-distance-update', {
              peerSocketId,
              distance: Math.round(distance),
              gain
            });
            io.to(peerSocketId).emit('proximity-distance-update', {
              peerSocketId: socket.id,
              distance: Math.round(distance),
              gain
            });
          }
        } else {
          // Transition: Peer just EXITED 100-pixel radius!
          if (currentInRange.has(peerSocketId)) {
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
      }

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
    });

    // ====================================================
    // 4. WebRTC SIGNALING GATEKEEPER (STRICT 100-PIXEL RADIUS LOGIC)
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
      const gain = Math.max(10, Math.min(100, Math.round((1 - distance / WEBRTC_PROXIMITY_RADIUS) * 100)));
      console.log(`[WebRTC Guard: PERMITTED] Offer from '${sender.name}' to '${target.name}' accepted. Distance ${distance.toFixed(1)}px <= 100px (Gain: ${gain}%).`);

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

      const gain = Math.max(10, Math.min(100, Math.round((1 - distance / WEBRTC_PROXIMITY_RADIUS) * 100)));
      console.log(`[WebRTC Guard: PERMITTED] Answer from '${callee.name}' to '${caller.name}' accepted. Distance ${distance.toFixed(1)}px <= 100px (Gain: ${gain}%).`);

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
      if (distance > WEBRTC_PROXIMITY_RADIUS) {
        // Discard ICE candidate if outside 100px radius
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

        // Remove from other peers' in-range sets
        for (const set of inRangePeerPairs.values()) {
          set.delete(socket.id);
        }

        socket.broadcast.emit('user-left', {
          socketId: socket.id,
          userId: leavingAvatar.userId,
          name: leavingAvatar.name
        });
        console.log(`[ProxiSpeak] User '${leavingAvatar.name}' left. Total online: ${activeAvatars.size}`);
      }
    });
  });

  return {
    getActiveAvatars: () => Array.from(activeAvatars.values()),
    getProximityRadius: () => WEBRTC_PROXIMITY_RADIUS
  };
};
