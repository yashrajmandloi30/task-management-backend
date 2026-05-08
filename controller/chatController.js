const ChatMessage = require('../model/chatModel');
const Group = require('../model/groupModel');
const User = require('../model/userModel');
const { emitToGroup, emitToUser } = require('../config/socket');
const apiResponse = require('../config/apiResponse');
const fs = require('fs');
const path = require('path');

// Helper function to get conversation ID for personal chat
const getConversationId = (userId1, userId2) => {
  return [userId1.toString(), userId2.toString()].sort().join('_');
};

// ==================== GET PERSONAL MESSAGES ====================
const getPersonalMessages = async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    const conversationId = getConversationId(req.user._id, userId);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const messages = await ChatMessage.find({
      conversationId,
      createdAt: { $gte: thirtyDaysAgo },
      deletedFor: { $ne: req.user._id }
    })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate('sender', 'name email userId')
      .populate('receiver', 'name email userId');

    const total = await ChatMessage.countDocuments({
      conversationId,
      createdAt: { $gte: thirtyDaysAgo },
      deletedFor: { $ne: req.user._id }
    });

    // Mark messages as read
    await ChatMessage.updateMany(
      {
        conversationId,
        receiver: req.user._id,
        readBy: { $ne: req.user._id }
      },
      {
        $addToSet: { readBy: req.user._id }
      }
    );

    res.json(apiResponse(true, 'Messages fetched', {
      messages: messages.reverse(),
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
      conversationId
    }));
  } catch (error) {
    console.error(error);
    res.status(500).json(apiResponse(false, error.message));
  }
};

// ==================== GET GROUP MESSAGES ====================
const getGroupMessages = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    const group = await Group.findOne({
      _id: groupId,
      'participants.user': req.user._id,
    });

    if (!group) {
      return res.status(403).json(apiResponse(false, 'Not authorized to view these messages'));
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const messages = await ChatMessage.find({
      groupId,
      createdAt: { $gte: thirtyDaysAgo },
      deletedFor: { $ne: req.user._id }
    })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate('sender', 'name email userId')
      .populate('readBy', 'name email');

    const total = await ChatMessage.countDocuments({
      groupId,
      createdAt: { $gte: thirtyDaysAgo },
      deletedFor: { $ne: req.user._id }
    });

    res.json(apiResponse(true, 'Messages fetched', {
      messages: messages.reverse(),
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
    }));
  } catch (error) {
    console.error(error);
    res.status(500).json(apiResponse(false, error.message));
  }
};

// ==================== SEND PERSONAL MESSAGE ====================
const sendPersonalMessage = async (req, res) => {
  try {
    const { receiverId, message } = req.body;
    const conversationId = getConversationId(req.user._id, receiverId);

    let fileUrl = null;
    let fileType = null;
    let fileName = null;

    if (req.file) {
      fileUrl = `/uploads/${req.file.filename}`;
      fileName = req.file.originalname;
      
      if (req.file.mimetype.startsWith('image/')) {
        fileType = 'image';
      } else if (req.file.mimetype.startsWith('video/')) {
        fileType = 'video';
      } else {
        fileType = 'document';
      }
    }

    const chatMessage = await ChatMessage.create({
      conversationId,
      sender: req.user._id,
      receiver: receiverId,
      message: message || '',
      fileUrl,
      fileType,
      fileName,
      readBy: [req.user._id],
    });

    const populatedMessage = await ChatMessage.findById(chatMessage._id)
      .populate('sender', 'name email userId')
      .populate('receiver', 'name email userId');

    emitToUser(receiverId, 'new-private-message', populatedMessage);
    emitToUser(req.user._id, 'message-sent', populatedMessage);

    res.status(201).json(apiResponse(true, 'Message sent', populatedMessage));
  } catch (error) {
    console.error(error);
    res.status(500).json(apiResponse(false, error.message));
  }
};

// ==================== SEND GROUP MESSAGE ====================
const sendGroupMessage = async (req, res) => {
  try {
    const { groupId, message } = req.body;

    const group = await Group.findOne({
      _id: groupId,
      'participants.user': req.user._id,
    });

    if (!group) {
      return res.status(403).json(apiResponse(false, 'Not authorized to send messages'));
    }

    let fileUrl = null;
    let fileType = null;
    let fileName = null;

    if (req.file) {
      fileUrl = `/uploads/${req.file.filename}`;
      fileName = req.file.originalname;
      
      if (req.file.mimetype.startsWith('image/')) {
        fileType = 'image';
      } else if (req.file.mimetype.startsWith('video/')) {
        fileType = 'video';
      } else {
        fileType = 'document';
      }
    }

    const chatMessage = await ChatMessage.create({
      groupId,
      sender: req.user._id,
      message: message || '',
      fileUrl,
      fileType,
      fileName,
      readBy: [req.user._id],
    });

    const populatedMessage = await ChatMessage.findById(chatMessage._id)
      .populate('sender', 'name email userId')
      .populate('readBy', 'name email');

    emitToGroup(groupId, 'new-group-message', populatedMessage);

    res.status(201).json(apiResponse(true, 'Message sent', populatedMessage));
  } catch (error) {
    console.error(error);
    res.status(500).json(apiResponse(false, error.message));
  }
};

// ==================== UNIFIED SEND MESSAGE ====================
const sendMessage = async (req, res) => {
  try {
    const { groupId, receiverId, message } = req.body;
    
    let chatMessage = null;

    if (groupId) {
      // Group message
      const group = await Group.findOne({
        _id: groupId,
        'participants.user': req.user._id,
      });

      if (!group) {
        return res.status(403).json(apiResponse(false, 'Not authorized to send messages in this group'));
      }

      let fileUrl = null;
      let fileType = null;
      let fileName = null;

      if (req.file) {
        fileUrl = `/uploads/${req.file.filename}`;
        fileName = req.file.originalname;
        
        if (req.file.mimetype.startsWith('image/')) {
          fileType = 'image';
        } else if (req.file.mimetype.startsWith('video/')) {
          fileType = 'video';
        } else {
          fileType = 'document';
        }
      }

      chatMessage = await ChatMessage.create({
        groupId,
        sender: req.user._id,
        message: message || '',
        fileUrl,
        fileType,
        fileName,
        readBy: [req.user._id],
      });

      const populatedMessage = await ChatMessage.findById(chatMessage._id)
        .populate('sender', 'name email userId')
        .populate('readBy', 'name email');

      emitToGroup(groupId, 'new-group-message', populatedMessage);
      
      return res.status(201).json(apiResponse(true, 'Message sent', populatedMessage));
      
    } else if (receiverId) {
      // Personal message
      const conversationId = getConversationId(req.user._id, receiverId);

      let fileUrl = null;
      let fileType = null;
      let fileName = null;

      if (req.file) {
        fileUrl = `/uploads/${req.file.filename}`;
        fileName = req.file.originalname;
        
        if (req.file.mimetype.startsWith('image/')) {
          fileType = 'image';
        } else if (req.file.mimetype.startsWith('video/')) {
          fileType = 'video';
        } else {
          fileType = 'document';
        }
      }

      chatMessage = await ChatMessage.create({
        conversationId,
        sender: req.user._id,
        receiver: receiverId,
        message: message || '',
        fileUrl,
        fileType,
        fileName,
        readBy: [req.user._id],
      });

      const populatedMessage = await ChatMessage.findById(chatMessage._id)
        .populate('sender', 'name email userId')
        .populate('receiver', 'name email userId');

      emitToUser(receiverId, 'new-private-message', populatedMessage);
      emitToUser(req.user._id, 'message-sent', populatedMessage);
      
      return res.status(201).json(apiResponse(true, 'Message sent', populatedMessage));
      
    } else {
      return res.status(400).json(apiResponse(false, 'Either groupId or receiverId is required'));
    }
  } catch (error) {
    console.error(error);
    res.status(500).json(apiResponse(false, error.message));
  }
};

// ==================== MARK MESSAGES AS READ ====================
const markAsRead = async (req, res) => {
  try {
    const { groupId, receiverId } = req.body;
    
    if (groupId) {
      // Mark group messages as read
      await ChatMessage.updateMany(
        {
          groupId,
          readBy: { $ne: req.user._id },
        },
        {
          $addToSet: { readBy: req.user._id },
        }
      );
    } else if (receiverId) {
      // Mark personal messages as read
      const conversationId = getConversationId(req.user._id, receiverId);
      await ChatMessage.updateMany(
        {
          conversationId,
          receiver: req.user._id,
          readBy: { $ne: req.user._id },
        },
        {
          $addToSet: { readBy: req.user._id },
        }
      );
    }

    res.json(apiResponse(true, 'Messages marked as read'));
  } catch (error) {
    console.error(error);
    res.status(500).json(apiResponse(false, error.message));
  }
};

// ==================== DELETE MESSAGE ====================
const deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;

    const message = await ChatMessage.findById(messageId);

    if (!message) {
      return res.status(404).json(apiResponse(false, 'Message not found'));
    }

    await ChatMessage.findByIdAndUpdate(messageId, {
      $addToSet: { deletedFor: req.user._id }
    });

    let shouldHardDelete = false;
    
    if (message.groupId) {
      const group = await Group.findById(message.groupId);
      const participantCount = group.participants.length;
      const updatedMessage = await ChatMessage.findById(messageId);
      if (updatedMessage.deletedFor.length >= participantCount) {
        shouldHardDelete = true;
      }
    } else if (message.conversationId) {
      if (message.deletedFor.length >= 2) {
        shouldHardDelete = true;
      }
    }

    if (shouldHardDelete) {
      if (message.fileUrl) {
        const filePath = path.join(__dirname, '..', message.fileUrl);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
      await message.deleteOne();
    }

    if (message.groupId) {
      emitToGroup(message.groupId, 'message-deleted', { messageId, userId: req.user._id });
    } else if (message.receiver) {
      emitToUser(message.receiver, 'message-deleted', { messageId, userId: req.user._id });
      emitToUser(message.sender, 'message-deleted', { messageId, userId: req.user._id });
    }

    res.json(apiResponse(true, 'Message deleted'));
  } catch (error) {
    console.error(error);
    res.status(500).json(apiResponse(false, error.message));
  }
};

// ==================== GET CONVERSATIONS LIST ====================
const getConversations = async (req, res) => {
  try {
    const personalMessages = await ChatMessage.aggregate([
      {
        $match: {
          $or: [
            { sender: req.user._id },
            { receiver: req.user._id }
          ],
          groupId: null,
          deletedFor: { $ne: req.user._id }
        }
      },
      {
        $sort: { createdAt: -1 }
      },
      {
        $group: {
          _id: '$conversationId',
          lastMessage: { $first: '$$ROOT' },
          unreadCount: {
            $sum: {
              $cond: [
                { 
                  $and: [
                    { $eq: ['$receiver', req.user._id] },
                    { $not: { $in: [req.user._id, '$readBy'] } }
                  ] 
                },
                1,
                0
              ]
            }
          }
        }
      }
    ]);

    const conversations = await Promise.all(personalMessages.map(async (conv) => {
      const otherUserId = conv._id
        .split('_')
        .find(id => id !== req.user._id.toString());
      
      const otherUser = await User.findById(otherUserId).select('name email userId');
      
      return {
        ...conv,
        otherUser,
        lastMessage: conv.lastMessage
      };
    }));

    const groups = await Group.find({
      'participants.user': req.user._id
    }).populate('participants.user', 'name email');

    res.json(apiResponse(true, 'Conversations fetched', {
      personalConversations: conversations,
      groups
    }));
  } catch (error) {
    console.error(error);
    res.status(500).json(apiResponse(false, error.message));
  }
};

// ==================== FINAL EXPORTS ====================
module.exports = {
  getPersonalMessages,
  getGroupMessages,
  sendPersonalMessage,
  sendGroupMessage,
  sendMessage,
  markAsRead,
  deleteMessage,
  getConversations,
};