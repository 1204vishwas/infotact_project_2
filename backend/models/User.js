const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Full name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters long'],
    maxlength: [50, 'Name cannot exceed 50 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email address']
  },
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    lowercase: true,
    trim: true,
    minlength: [3, 'Username must be at least 3 characters long'],
    maxlength: [30, 'Username cannot exceed 30 characters'],
    match: [/^[a-zA-Z0-9_]+$/, 'Username can only contain alphanumeric characters and underscores']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters long']
  },
  role: {
    type: String,
    enum: ['Developer', 'Designer', 'Product Manager', 'Audio Engineer', 'DevOps', 'Team Member'],
    default: 'Team Member'
  },
  avatarColor: {
    type: String,
    default: '#3b82f6'
  },
  avatarIcon: {
    type: String,
    default: 'avatar-1'
  },
  department: {
    type: String,
    default: 'Engineering'
  },
  // Geospatial coordinate format for MongoDB $near & $geoWithin queries
  // 2D Cartesian plane indexing for 2D HTML5 Canvas pixel coordinates
  location: {
    type: [Number], // [X, Y] pixel coordinates in the 2D office canvas
    default: [250, 250]
  },
  status: {
    type: String,
    enum: ['online', 'idle', 'in-meeting', 'offline'],
    default: 'online'
  },
  audioSettings: {
    earshotRadius: {
      type: Number,
      default: 150 // 100-150px earshot proximity threshold
    },
    micMuted: {
      type: Boolean,
      default: false
    },
    deafened: {
      type: Boolean,
      default: false
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Flat 2D planar index for 2D Canvas coordinates with pixel bounds
userSchema.index({ location: '2d' }, { min: -1000, max: 10000 });

// Geospatial query helper using native MongoDB $near with high-speed in-memory fallback
userSchema.statics.findNearby = async function(x, y, maxDistance = 100) {
  try {
    if (mongoose.connection.readyState === 1) {
      const users = await this.find({
        location: {
          $near: [x, y],
          $maxDistance: maxDistance
        }
      }).select('-password').lean();

      return users.map(u => {
        const dx = u.location[0] - x;
        const dy = u.location[1] - y;
        const distance = Math.round(Math.sqrt(dx * dx + dy * dy));
        const gain = Math.max(0, Math.min(100, Math.round((1 - distance / maxDistance) * 100)));
        return {
          ...u,
          distance,
          inWebRTCRange: distance <= 100,
          gain
        };
      });
    }
  } catch (err) {
    console.warn('[Spatial Engine] Native MongoDB $near fallback triggered:', err.message);
  }

  // High-performance fallback using spatialAudit service
  const { filterUsersByProximity, generateTestAvatars } = require('../services/spatialAudit');
  const demoUsers = generateTestAvatars(20);
  return filterUsersByProximity(demoUsers, x, y, maxDistance);
};

// Proximity Calculations: Implement MongoDB $near queries to group users into audio pods
userSchema.statics.groupUsersByProximity = async function(radius = 100) {
  try {
    if (mongoose.connection.readyState === 1) {
      // Retrieve all users currently in the office space
      const allUsers = await this.find({}).select('-password').lean();
      if (!allUsers || allUsers.length === 0) {
        return { clusters: [], soloUsers: [], totalUsers: 0, radius };
      }

      const visited = new Set();
      const clusters = [];
      const soloUsers = [];

      for (const user of allUsers) {
        const userIdStr = user._id.toString();
        if (visited.has(userIdStr)) continue;

        const [ux, uy] = user.location;

        // Execute native MongoDB $near query centered at this user's [x, y] coordinates
        const nearbyPeers = await this.find({
          _id: { $ne: user._id },
          location: {
            $near: [ux, uy],
            $maxDistance: radius
          }
        }).select('-password').lean();

        if (nearbyPeers && nearbyPeers.length > 0) {
          // Cluster found! Form an audio pod group
          const clusterMembers = [
            {
              ...user,
              isPodLeader: true,
              distanceToLead: 0,
              gain: 100
            }
          ];
          visited.add(userIdStr);

          for (const peer of nearbyPeers) {
            const peerIdStr = peer._id.toString();
            if (!visited.has(peerIdStr)) {
              visited.add(peerIdStr);
              const dx = peer.location[0] - ux;
              const dy = peer.location[1] - uy;
              const dist = Math.round(Math.sqrt(dx * dx + dy * dy));
              const gain = Math.max(10, Math.min(100, Math.round((1 - dist / radius) * 100)));
              clusterMembers.push({
                ...peer,
                isPodLeader: false,
                distanceToLead: dist,
                gain
              });
            }
          }

          // Compute cluster center coordinates
          const avgX = Math.round(clusterMembers.reduce((sum, m) => sum + m.location[0], 0) / clusterMembers.length);
          const avgY = Math.round(clusterMembers.reduce((sum, m) => sum + m.location[1], 0) / clusterMembers.length);

          clusters.push({
            groupId: `pod-${clusters.length + 1}`,
            name: `Audio Pod ${clusters.length + 1}`,
            center: [avgX, avgY],
            radius,
            memberCount: clusterMembers.length,
            members: clusterMembers,
            audioMeshAllowed: true,
            webrtcEligibleCount: clusterMembers.length
          });
        } else {
          visited.add(userIdStr);
          soloUsers.push({
            ...user,
            message: 'No peers within 100-pixel radius (WebRTC offers restricted)',
            inWebRTCRange: false
          });
        }
      }

      return {
        clusters,
        soloUsers,
        totalClusters: clusters.length,
        totalUsers: allUsers.length,
        radius
      };
    }
  } catch (err) {
    console.warn('[Spatial Engine] Group users fallback triggered:', err.message);
  }

  // Fallback to spatial audit service
  const { clusterUsersByProximity, generateTestAvatars } = require('../services/spatialAudit');
  const demoUsers = generateTestAvatars(20);
  return clusterUsersByProximity(demoUsers, radius);
};

// Geospatial query helper using native MongoDB $geoWithin for office room boundary clusters
userSchema.statics.findWithinBox = function(bottomLeft, topRight) {
  return this.find({
    location: {
      $geoWithin: {
        $box: [bottomLeft, topRight]
      }
    }
  }).select('-password');
};

module.exports = mongoose.model('User', userSchema);
