const { Server } = require("socket.io");
const { createAdapter } = require("@socket.io/redis-adapter");
const redis = require("redis");
const ChatMessage = require("../model/chatModel"); // ✅ Path sahi karo
const User = require("../model/userModel"); // ✅ Add this if needed

let io;

const getConversationId = (userId1, userId2) => {
    return [userId1.toString(), userId2.toString()].sort().join('_');
};

const initIo = async (server) => {
    io = new Server(server, {
        cors: {
            origin: "*",
            credentials: true
        },
        pingTimeout: 60000,
        pingInterval: 25000
    });

    const pubClient = redis.createClient({
        url: process.env.REDIS_URL
    });
    const subClient = pubClient.duplicate();
    await Promise.all([pubClient.connect(), subClient.connect()]);

    io.adapter(createAdapter(pubClient, subClient));

    // Store online users
    const onlineUsers = new Map();
    const userSockets = new Map();

    io.on("connection", (socket) => {
        console.log("A user connected: " + socket.id);

        socket.on("authenticate", async (userId) => {
            socket.userId = userId;
            
            if (!userSockets.has(userId)) {
                userSockets.set(userId, new Set());
            }
            userSockets.get(userId).add(socket.id);
            
            if (!onlineUsers.has(userId)) {
                onlineUsers.set(userId, true);
                io.emit("user-online", { userId, status: true });
            }
            
            console.log(`User ${userId} authenticated with socket ${socket.id}`);
        });

        socket.on("join-personal-chat", async (otherUserId) => {
            const conversationId = getConversationId(socket.userId, otherUserId);
            socket.join(`chat_${conversationId}`);
            console.log(`User ${socket.userId} joined personal chat: ${conversationId}`);
            
            if (socket.userId) {
                await ChatMessage.updateMany(
                    {
                        conversationId,
                        receiver: socket.userId,
                        readBy: { $ne: socket.userId }
                    },
                    {
                        $addToSet: { readBy: socket.userId }
                    }
                );
                
                socket.to(`chat_${conversationId}`).emit("messages-read", {
                    userId: socket.userId,
                    conversationId
                });
            }
        });

        socket.on("joinGroup", (groupId) => {
            socket.join(`group_${groupId}`);
            console.log(`User ${socket.userId} joined group_${groupId}`);
        });

        socket.on("send-private-message", async (data, callback) => {
            try {
                const { receiverId, message, fileInfo } = data;
                const conversationId = getConversationId(socket.userId, receiverId);
                
                const messageData = {
                    conversationId,
                    sender: socket.userId,
                    receiver: receiverId,
                    message: message || '',
                    fileUrl: fileInfo?.url || null,
                    fileType: fileInfo?.type || null,
                    fileName: fileInfo?.name || null,
                    readBy: [socket.userId]
                };
                
                const chatMessage = new ChatMessage(messageData);
                await chatMessage.save();
                
                const populatedMessage = await ChatMessage.findById(chatMessage._id)
                    .populate('sender', 'name email userId')
                    .populate('receiver', 'name email userId');
                
                const receiverOnline = onlineUsers.has(receiverId);
                
                if (receiverOnline) {
                    io.to(`chat_${conversationId}`).emit("new-private-message", populatedMessage);
                }
                
                socket.emit("message-sent", populatedMessage);
                
                if (callback) callback({ success: true, message: populatedMessage });
            } catch (error) {
                console.error("Error sending private message:", error);
                if (callback) callback({ success: false, error: error.message });
            }
        });

        socket.on("send-group-message", async (data, callback) => {
            try {
                const { groupId, message, fileInfo } = data;
                
                const messageData = {
                    groupId,
                    sender: socket.userId,
                    message: message || '',
                    fileUrl: fileInfo?.url || null,
                    fileType: fileInfo?.type || null,
                    fileName: fileInfo?.name || null,
                    readBy: [socket.userId]
                };
                
                const chatMessage = new ChatMessage(messageData);
                await chatMessage.save();
                
                const populatedMessage = await ChatMessage.findById(chatMessage._id)
                    .populate('sender', 'name email userId')
                    .populate('readBy', 'name email');
                
                io.to(`group_${groupId}`).emit("new-group-message", populatedMessage);
                
                if (callback) callback({ success: true, message: populatedMessage });
            } catch (error) {
                console.error("Error sending group message:", error);
                if (callback) callback({ success: false, error: error.message });
            }
        });

        socket.on("typing", ({ chatId, chatType, receiverId }) => {
            if (chatType === 'private' && receiverId) {
                const conversationId = getConversationId(socket.userId, receiverId);
                socket.to(`chat_${conversationId}`).emit("user-typing", {
                    userId: socket.userId,
                    isTyping: true
                });
            } else if (chatType === 'group') {
                socket.to(`group_${chatId}`).emit("user-typing", {
                    userId: socket.userId,
                    isTyping: true
                });
            }
        });

        socket.on("stop-typing", ({ chatId, chatType, receiverId }) => {
            if (chatType === 'private' && receiverId) {
                const conversationId = getConversationId(socket.userId, receiverId);
                socket.to(`chat_${conversationId}`).emit("user-typing", {
                    userId: socket.userId,
                    isTyping: false
                });
            } else if (chatType === 'group') {
                socket.to(`group_${chatId}`).emit("user-typing", {
                    userId: socket.userId,
                    isTyping: false
                });
            }
        });

        socket.on("disconnect", () => {
            console.log("A user disconnected: " + socket.id);
            
            if (socket.userId && userSockets.has(socket.userId)) {
                userSockets.get(socket.userId).delete(socket.id);
                
                if (userSockets.get(socket.userId).size === 0) {
                    userSockets.delete(socket.userId);
                    onlineUsers.delete(socket.userId);
                    io.emit("user-online", { userId: socket.userId, status: false });
                    console.log(`User ${socket.userId} is now offline`);
                }
            }
        });
    });
    
    return io;
};

const emitToUser = (userId, event, data) => {
    io.to(`user_${userId}`).emit(event, data);
};

const emitToGroup = (groupId, event, data) => {
    io.to(`group_${groupId}`).emit(event, data);
};

const emitToConversation = (userId1, userId2, event, data) => {
    const conversationId = getConversationId(userId1, userId2);
    io.to(`chat_${conversationId}`).emit(event, data);
};

module.exports = {
    initIo,
    emitToUser,
    emitToGroup,
    emitToConversation,
    getConversationId
};