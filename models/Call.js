const mongoose = require('mongoose');
const crypto = require('crypto');

const callSchema = new mongoose.Schema({
  // Call participants
  caller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  receiver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  linkToken: {
    type: String,
    unique: true,
    index: true
  },

  shareableLink: {
    type: String
  },
  
  // Call details
  type: {
    type: String,
    enum: ['voice', 'video'],
    required: true
  },
  
  status: {
    type: String,
    enum: ['initiating', 'ringing', 'answered', 'ended', 'missed', 'rejected'],
    default: 'initiating'
  },
  
  // Call timing
  startTime: {
    type: Date,
    default: Date.now
  },
  answerTime: {
    type: Date
  },
  endTime: {
    type: Date
  },
  
  duration: {
    type: Number, // in seconds
    default: 0
  },
  
  // WebRTC signaling
  callerOffer: {
    type: Object
  },
  receiverAnswer: {
    type: Object
  },
  iceCandidates: [{
    from: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    candidate: Object,
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Call quality metrics
  quality: {
    audio: {
      type: String,
      enum: ['excellent', 'good', 'fair', 'poor'],
      default: 'good'
    },
    video: {
      type: String,
      enum: ['excellent', 'good', 'fair', 'poor'],
      default: 'good'
    }
  },
  
  // Call settings
  settings: {
    muteAudio: {
      type: Boolean,
      default: false
    },
    muteVideo: {
      type: Boolean,
      default: false
    },
    recordCall: {
      type: Boolean,
      default: false
    }
  },
  
  // Metadata
  notes: {
    type: String,
    maxlength: 500
  },
  
  isActive: {
    type: Boolean,
    default: true
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  },
  
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for better query performance
callSchema.index({ caller: 1, createdAt: -1 });
callSchema.index({ receiver: 1, createdAt: -1 });
callSchema.index({ status: 1 });
callSchema.index({ type: 1 });
callSchema.index({ linkToken: 1 }, { unique: true, sparse: true });

// Virtual for call duration
callSchema.virtual('formattedDuration').get(function() {
  if (!this.duration) return '0s';
  
  const hours = Math.floor(this.duration / 3600);
  const minutes = Math.floor((this.duration % 3600) / 60);
  const seconds = this.duration % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  } else {
    return `${seconds}s`;
  }
});

// Methods
callSchema.methods.answerCall = function() {
  this.status = 'answered';
  this.answerTime = new Date();
  this.updatedAt = new Date();
  return this.save();
};

callSchema.methods.endCall = function() {
  this.status = 'ended';
  this.endTime = new Date();
  
  // Calculate duration if call was answered
  if (this.answerTime) {
    this.duration = Math.floor((this.endTime - this.answerTime) / 1000);
  }
  
  this.updatedAt = new Date();
  return this.save();
};

callSchema.methods.rejectCall = function() {
  this.status = 'rejected';
  this.endTime = new Date();
  this.updatedAt = new Date();
  return this.save();
};

callSchema.methods.missCall = function() {
  this.status = 'missed';
  this.endTime = new Date();
  this.updatedAt = new Date();
  return this.save();
};

callSchema.methods.addIceCandidate = function(userId, candidate) {
  this.iceCandidates.push({
    from: userId,
    candidate: candidate
  });
  return this.save();
};

// Static methods
callSchema.statics.getUserCallHistory = function(userId, limit = 20) {
  return this.find({
    $or: [{ caller: userId }, { receiver: userId }],
    isActive: true
  })
  .populate('caller', 'username profilePicture')
  .populate('receiver', 'username profilePicture')
  .sort({ createdAt: -1 })
  .limit(limit);
};

callSchema.statics.getActiveCall = function(userId) {
  return this.findOne({
    $or: [{ caller: userId }, { receiver: userId }],
    status: { $in: ['initiating', 'ringing', 'answered'] },
    isActive: true
  })
  .populate('caller', 'username profilePicture')
  .populate('receiver', 'username profilePicture');
};

callSchema.statics.getMissedCalls = function(userId, limit = 10) {
  return this.find({
    receiver: userId,
    status: 'missed',
    isActive: true
  })
  .populate('caller', 'username profilePicture')
  .sort({ createdAt: -1 })
  .limit(limit);
};

// Pre-save middleware
callSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

callSchema.pre('validate', function(next) {
  if (!this.linkToken) {
    this.linkToken = crypto.randomBytes(8).toString('hex');
  }

  if (!this.shareableLink) {
    const baseUrl = (process.env.FRONTEND_URL || 'http://localhost:3007').replace(/\/$/, '');
    this.shareableLink = `${baseUrl}/calls/join/${this.linkToken}`;
  }

  next();
});

module.exports = mongoose.model('Call', callSchema); 