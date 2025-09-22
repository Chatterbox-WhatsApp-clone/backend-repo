const User = require('../models/User');
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const callHandler = require('./callHandler');
const jwt = require('jsonwebtoken');

const socketHandler = (io) => {
  // Store user socket mappings
  const userSockets = new Map(); // userId -> socketId
  const userChats = new Map(); // userId -> Set of chatIds

  // Initialize call handler
  const callHandlerInstance = callHandler(io);

  io.on('connection', (socket) => {
    console.log(`🔌 User connected: ${socket.id}`);

    // Authenticate user
    socket.on('authenticate', async (data) => {
      try {
        const { userId, token } = data;
        if (!token) {
          socket.emit('authentication_error', { message: 'Token required' });
          return;
        }
        let decoded;
        try {
          decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (e) {
          socket.emit('authentication_error', { message: 'Invalid token' });
          return;
        }
        if (decoded.userId !== userId) {
          socket.emit('authentication_error', { message: 'Token does not match user' });
          return;
        }
        
        // Store user socket mapping
        userSockets.set(userId, socket.id);
        socket.userId = userId;
        
        console.log(`✅ User authenticated: ${userId}`);
        socket.emit('authenticated', { success: true });
        
        // Update user online status
        await User.findByIdAndUpdate(userId, { 
          isOnline: true, 
          lastSeen: new Date() 
        });
        
        // Get user's chats and join rooms
        const userChatList = await Chat.find({
          'participants.user': userId,
          'participants.isActive': true,
          isActive: true
        });

        userChats.set(userId, new Set());
        userChatList.forEach(chat => {
          socket.join(chat._id.toString());
          userChats.get(userId).add(chat._id.toString());
        });

        // Notify other users
        socket.broadcast.emit('user_online', { userId });
      } catch (error) {
        console.error('Authentication error:', error);
        socket.emit('authentication_error', { message: 'Authentication failed' });
      }
    });

    // Join a chat room
    socket.on('join_chat', (data) => {
      const { chatId } = data;
      const userId = socket.userId;

      if (userId && chatId) {
        socket.join(chatId);
        if (!userChats.has(userId)) {
          userChats.set(userId, new Set());
        }
        userChats.get(userId).add(chatId);
        console.log(`👥 User ${userId} joined chat ${chatId}`);
      }
    });

    // Leave a chat room
    socket.on('leave_chat', (data) => {
      const { chatId } = data;
      const userId = socket.userId;

      if (userId && chatId) {
        socket.leave(chatId);
        if (userChats.has(userId)) {
          userChats.get(userId).delete(chatId);
        }
        console.log(`👋 User ${userId} left chat ${chatId}`);
      }
    });

    // Send a message
    socket.on('send_message', async (data) => {
      try {
        const { chatId, content, type, replyTo } = data;
        const senderId = socket.userId;

        if (!senderId) {
          socket.emit('message_error', { message: 'User not authenticated' });
          return;
        }

        // Verify user is participant in chat
        const chat = await Chat.findOne({
          _id: chatId,
          'participants.user': senderId,
          'participants.isActive': true,
          isActive: true
        });

        if (!chat) {
          socket.emit('message_error', { message: 'Chat not found or access denied' });
          return;
        }

        // Create message
        const message = new Message({
          chat: chatId,
          sender: senderId,
          type: type || 'text',
          content,
          replyTo
        });

        await message.save();
        await message.populate('sender', 'username profilePicture');
        if (replyTo) {
          await message.populate('replyTo', 'content type sender');
        }

        // Update chat's last message
        const preview = type === 'text' ? content.text.substring(0, 100) : `📎 ${type}`;
        chat.updateLastMessage(message, { _id: senderId }, preview);
        chat.incrementUnreadCount(senderId);
        await chat.save();

        // Emit to all users in the chat (except sender)
        socket.to(chatId).emit('new_message', {
          message,
          chatId
        });

        // Emit confirmation to sender
        socket.emit('message_sent', {
          message,
          chatId
        });

        // Mark message as delivered to online participants
        const onlineParticipants = chat.participants
          .filter(p => p.user.toString() !== senderId.toString())
          .map(p => p.user.toString())
          .filter(userId => userSockets.has(userId));

        if (onlineParticipants.length > 0) {
          // Mark as delivered to online users
          await message.markAsDelivered(senderId);
          
          // Notify sender about delivery
          socket.emit('message_delivered', {
            messageId: message._id,
            deliveredTo: onlineParticipants
          });
        }

        console.log(`💬 Message sent in chat ${chatId} by ${senderId}`);
      } catch (error) {
        console.error('Send message error:', error);
        socket.emit('message_error', { message: 'Failed to send message' });
      }
    });

    // Message delivered confirmation
    socket.on('message_delivered', async (data) => {
      try {
        const { messageId } = data;
        const userId = socket.userId;

        if (!userId) return;

        const message = await Message.findById(messageId);
        if (!message) return;

        // Mark message as delivered to this user
        await message.markAsDelivered(userId);

        // Notify sender about delivery
        const senderSocketId = userSockets.get(message.sender.toString());
        if (senderSocketId) {
          io.to(senderSocketId).emit('message_delivered', {
            messageId: message._id,
            deliveredTo: [userId]
          });
        }

        console.log(`📤 Message ${messageId} delivered to ${userId}`);
      } catch (error) {
        console.error('Message delivered error:', error);
      }
    });

    // Message read confirmation
    socket.on('message_read', async (data) => {
      try {
        const { messageId } = data;
        const userId = socket.userId;

        if (!userId) return;

        const message = await Message.findById(messageId);
        if (!message) return;

        // Mark message as read by this user
        await message.markAsRead(userId);

        // Notify sender about read receipt
        const senderSocketId = userSockets.get(message.sender.toString());
        if (senderSocketId) {
          io.to(senderSocketId).emit('message_read', {
            messageId: message._id,
            readBy: userId,
            readAt: new Date()
          });
        }

        console.log(`👁️ Message ${messageId} read by ${userId}`);
      } catch (error) {
        console.error('Message read error:', error);
      }
    });

    // Typing indicators
    socket.on('typing_start', (data) => {
      const { chatId } = data;
      const userId = socket.userId;

      if (userId && chatId) {
        socket.to(chatId).emit('user_typing', {
          userId,
          chatId,
          isTyping: true
        });
      }
    });

    socket.on('typing_stop', (data) => {
      const { chatId } = data;
      const userId = socket.userId;

      if (userId && chatId) {
        socket.to(chatId).emit('user_typing', {
          userId,
          chatId,
          isTyping: false
        });
      }
    });

    // Mark messages as read
    socket.on('mark_read', async (data) => {
      try {
        const { chatId, messageIds } = data;
        const userId = socket.userId;

        if (!userId || !chatId || !messageIds || !Array.isArray(messageIds)) {
          return;
        }

        // Mark messages as read
        await Message.updateMany(
          {
            _id: { $in: messageIds },
            chat: chatId,
            'readBy.user': { $ne: userId }
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

        // Update chat unread count
        const chat = await Chat.findById(chatId);
        if (chat) {
          chat.resetUnreadCount(userId);
          await chat.save();
        }

        // Notify other users in chat
        socket.to(chatId).emit('messages_read', {
          userId,
          chatId,
          messageIds
        });

        // Send read receipts for each message
        messageIds.forEach(messageId => {
          socket.emit('message_read', {
            messageId,
            readBy: userId,
            readAt: new Date()
          });
        });

        console.log(`👁️ Messages marked as read by ${userId} in chat ${chatId}`);
      } catch (error) {
        console.error('Mark read error:', error);
      }
    });

    // Handle disconnection
    socket.on('disconnect', async () => {
      try {
        const userId = socket.userId;
        if (userId) {
          // Remove user socket mapping
          userSockets.delete(userId);
          userChats.delete(userId);

          // Update user offline status
          await User.findByIdAndUpdate(userId, { 
            isOnline: false, 
            lastSeen: new Date() 
          });

          // Notify other users
          socket.broadcast.emit('user_offline', { userId });
        }

        console.log(`🔌 User disconnected: ${socket.id}`);
      } catch (error) {
        console.error('Disconnect handling error:', error);
      }
    });
  });

  return {
    getUserSockets: () => userSockets,
    getUserChats: () => userChats,
    getCallHandler: () => callHandlerInstance
  };
};

module.exports = socketHandler; 