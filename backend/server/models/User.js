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

module.exports = mongoose.model('User', userSchema);
