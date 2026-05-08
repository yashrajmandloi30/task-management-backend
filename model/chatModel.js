const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
  groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    default: null
  },
  conversationId: {
    type: String,
    index: true
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  receiver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  message: {
    type: String,
    required: function() {
      return !this.fileUrl;
    },
  },
  fileUrl: {
    type: String,
  },
  fileType: {
    type: String,
    enum: ['image', 'video', 'document', null],
    default: null,
  },
  fileName: {
    type: String,
  },
  readBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  deletedFor: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
}, {
  timestamps: true,
});

chatMessageSchema.index({ conversationId: 1, createdAt: -1 });
chatMessageSchema.index({ groupId: 1, createdAt: -1 });
chatMessageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 });

module.exports = mongoose.model('ChatMessage', chatMessageSchema);