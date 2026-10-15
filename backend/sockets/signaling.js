const User = require('../models/User');

// Active avatars in the virtual office space
const activeAvatars = new Map();

// Throttle map for updating coordinates in MongoDB
const pendingDbUpdates = new Map();

// Flush coordinates to MongoDB periodically (every 3 seconds)
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
      // Ignore if user is a guest/mock session
    }
  }
}, 3000);

module.exports = function initSignalingServer(io) {
  io.on('connection', (socket) => {
    console.log(`[ProxiSpeak Socket] Avatar connected: ${socket.id}`);

    // ====================================================
    // 1. JOIN VIRTUAL OFFICE SPACE
    // ====================================================
    socket.on('join-space', async (userData) => {
      try {
        const userId = userData?.id || userData?._id || `guest_${socket.id.substring(0, 6)}`;
        const name = userData?.name || 'Anonymous Avatar';
        const role = userData?.role || 'Developer';
        const avatarColor = userData?.avatarColor || '#6366f1';
        
        // Spawn coordinate fallback: random point near center [500-700, 350-450]
        const location = Array.isArray(userData?.location)
          ? userData.location
          : (userData?.location?.coordinates || [
              Math.floor(Math.random() * 200) + 500,
              Math.floor(Math.random() * 100) + 350
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
          totalOnline: activeAvatars.size
        });

        // 2. Broadcast new avatar arrival to all other connected avatars
        socket.broadcast.emit('user-joined', avatarProfile);

        console.log(`[ProxiSpeak] User '${name}' (${role}) joined space at [${location.join(', ')}]. Total: ${activeAvatars.size}`);

        // Update MongoDB presence
        if (userData?.id && !userData.id.startsWith('guest_')) {
          pendingDbUpdates.set(userData.id, location);
        }
      } catch (err) {
        console.error('[ProxiSpeak Socket Error on join-space]:', err);
      }
    });

    // ====================================================
    // 2. AVATAR REAL-TIME MOVEMENT & COORDINATE BROADCASTING
    // ====================================================
    socket.on('avatar-move', (movementData) => {
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
    // 4. WebRTC SIGNALING PRIMITIVES (For Earshot Audio Mesh)
    // ====================================================
    // Relay WebRTC Offer to target peer within earshot
    socket.on('webrtc-offer', ({ targetSocketId, offer }) => {
      const sender = activeAvatars.get(socket.id);
      if (targetSocketId && io.sockets.sockets.get(targetSocketId)) {
        io.to(targetSocketId).emit('webrtc-offer', {
          callerSocketId: socket.id,
          callerUser: sender,
          offer
        });
      }
    });

    // Relay WebRTC Answer
    socket.on('webrtc-answer', ({ targetSocketId, answer }) => {
      if (targetSocketId && io.sockets.sockets.get(targetSocketId)) {
        io.to(targetSocketId).emit('webrtc-answer', {
          calleeSocketId: socket.id,
          answer
        });
      }
    });

    // Relay ICE Candidate
    socket.on('webrtc-ice-candidate', ({ targetSocketId, candidate }) => {
      if (targetSocketId && io.sockets.sockets.get(targetSocketId)) {
        io.to(targetSocketId).emit('webrtc-ice-candidate', {
          senderSocketId: socket.id,
          candidate
        });
      }
    });

    // ====================================================
    // 5. DISCONNECT / LEAVE
    // ====================================================
    socket.on('disconnect', async () => {
      const leavingAvatar = activeAvatars.get(socket.id);
      if (leavingAvatar) {
        activeAvatars.delete(socket.id);
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
    getActiveAvatars: () => Array.from(activeAvatars.values())
  };
};
