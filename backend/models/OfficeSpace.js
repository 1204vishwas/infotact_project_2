const mongoose = require('mongoose');

// MongoDB Schema for 2D Virtual Office Layout & Obstacles
// Week 1: Basic MongoDB geospatial schemas & room persistence
const officeSpaceSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    default: 'ProxiSpeak Headquarters'
  },
  cluster: {
    type: String,
    default: 'proxify'
  },
  dimensions: {
    width: { type: Number, default: 1200 },
    height: { type: Number, default: 800 }
  },
  zones: [
    {
      id: String,
      name: String,
      type: { type: String, enum: ['audio-lab', 'engineering', 'product-hub', 'breakout-lounge', 'conference'] },
      bounds: {
        x: Number,
        y: Number,
        width: Number,
        height: Number
      },
      color: String,
      description: String
    }
  ],
  obstacles: [
    {
      id: String,
      type: { type: String, default: 'desk' },
      x: Number,
      y: Number,
      width: Number,
      height: Number,
      blocksSound: { type: Boolean, default: false }
    }
  ],
  spawnPoint: {
    type: [Number], // [x, y]
    default: [600, 400]
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('OfficeSpace', officeSpaceSchema);
