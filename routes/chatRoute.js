const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/authMiddleware');
const upload = require('../config/multer');

// Import all controller functions
const {
  getGroupMessages,
  getPersonalMessages,
  sendMessage,
  markAsRead,
  deleteMessage,
  getConversations,
} = require('../controller/chatController');

// Group chat routes
router.get('/group/:groupId', authMiddleware, getGroupMessages);

// Personal chat routes
router.get('/personal/:userId', authMiddleware, getPersonalMessages);
router.get('/conversations', authMiddleware, getConversations);

// Unified send message
router.post('/', authMiddleware, upload.single('file'), sendMessage);

// Mark messages as read
router.put('/read', authMiddleware, markAsRead);

// Delete message
router.delete('/:messageId', authMiddleware, deleteMessage);

module.exports = router;