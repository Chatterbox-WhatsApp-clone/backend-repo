const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  // Basic message info
  chat: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Chat',
    required: true
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Message content
  type: {
    type: String,
    enum: ['text', 'image', 'video', 'audio', 'document', 'location', 'contact', 'sticker'],
    default: 'text'
  },
  content: {
    text: String,
    media: {
      url: String,
      filename: String,
      mimeType: String,
      size: Number
    },
    location: {
      latitude: Number,
      longitude: Number,
      address: String
    },
    contact: {
      name: String,
      phone: String,
      email: String
    }
  },
  
  // Message status tracking
  status: {
    type: String,
    enum: ['sending', 'sent', 'delivered', 'read'],
    default: 'sending'
  },
  
  // Delivery tracking
  deliveredTo: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    deliveredAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Read tracking
  readBy: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    readAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Reply functionality
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },
  
  // Forward functionality
  forwardedFrom: {
    message: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message'
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    forwardedAt: {
      type: Date,
      default: Date.now
    }
  },
  
  // Message metadata
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedBy: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    deletedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Reactions
  reactions: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    emoji: {
      type: String,
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Timestamps
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

// Indexes for better performance
messageSchema.index({ chat: 1, createdAt: -1 });
messageSchema.index({ sender: 1, createdAt: -1 });
messageSchema.index({ 'readBy.user': 1 });
messageSchema.index({ 'deliveredTo.user': 1 });

// Virtual for message age
messageSchema.virtual('age').get(function() {
  const now = new Date();
  const diffMs = now - this.createdAt;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return this.createdAt.toLocaleDateString();
});

// Methods
messageSchema.methods.markAsDelivered = function(userId) {
  // Check if already delivered to this user
  const alreadyDelivered = this.deliveredTo.some(d => 
    d.user.toString() === userId.toString()
  );
  
  if (!alreadyDelivered) {
    this.deliveredTo.push({
      user: userId,
      deliveredAt: new Date()
    });
    
    // Update status to delivered if this is the first delivery
    if (this.status === 'sent') {
      this.status = 'delivered';
    }
  }
  
  return this.save();
};

messageSchema.methods.markAsRead = function(userId) {
  // Check if already read by this user
  const alreadyRead = this.readBy.some(r => 
    r.user.toString() === userId.toString()
  );
  
  if (!alreadyRead) {
    this.readBy.push({
      user: userId,
      readAt: new Date()
    });
    
    // Update status to read
    this.status = 'read';
  }
  
  return this.save();
};

messageSchema.methods.addReaction = function(userId, emoji) {
  // Remove existing reaction from this user
  this.reactions = this.reactions.filter(r => 
    r.user.toString() !== userId.toString()
  );
  
  // Add new reaction
  this.reactions.push({
    user: userId,
    emoji: emoji
  });
  
  return this.save();
};

messageSchema.methods.removeReaction = function(userId) {
  this.reactions = this.reactions.filter(r => 
    r.user.toString() !== userId.toString()
  );
  return this.save();
};

messageSchema.methods.softDelete = function(userId) {
  if (!this.isDeleted) {
    this.isDeleted = true;
    this.deletedBy.push({
      user: userId,
      deletedAt: new Date()
    });
  }
  return this.save();
};

messageSchema.methods.editMessage = function(newContent) {
  this.content = { ...this.content, ...newContent };
  this.updatedAt = new Date();
  return this.save();
};

// Static methods
messageSchema.statics.getUnreadCount = function(chatId, userId) {
  return this.countDocuments({
    chat: chatId,
    sender: { $ne: userId },
    'readBy.user': { $ne: userId },
    isDeleted: false
  });
};

messageSchema.statics.markChatAsRead = function(chatId, userId) {
  return this.updateMany(
    {
      chat: chatId,
      sender: { $ne: userId },
      'readBy.user': { $ne: userId },
      isDeleted: false
    },
    {
      $push: {
        readBy: {
          user: userId,
          readAt: new Date()
        }
      }
    }
  );
};

// Pre-save middleware
messageSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  
  // Auto-set status to 'sent' when message is created
  if (this.isNew && this.status === 'sending') {
    this.status = 'sent';
  }
  
  next();
});

module.exports = mongoose.model('Message', messageSchema); 