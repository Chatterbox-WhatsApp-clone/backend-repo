const express = require('express');
const { body, validationResult } = require('express-validator');
const Chat = require('../models/Chat');
const User = require('../models/User');
const Message = require('../models/Message');
const router = express.Router();

/**
 * @swagger
 * /api/chats:
 *   get:
 *     summary: Get all chats for the user
 *     tags:
 *       - Chats
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of chats
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
// @route   GET /api/chats
// @desc    Get all chats for the user
// @access  Private
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, type } = req.query;
    const userId = req.user._id;

    let query = {
      'participants.user': userId,
      'participants.isActive': true,
      isActive: true
    };

    // Filter by chat type if specified
    if (type && ['private', 'group'].includes(type)) {
      query.type = type;
    }

    const chats = await Chat.find(query)
      .populate('participants.user', 'username profilePicture isOnline lastSeen')
      .populate('lastMessage.message')
      .populate('lastMessage.sender', 'username profilePicture')
      .sort({ 'lastMessage.timestamp': -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    // Get total count for pagination
    const total = await Chat.countDocuments(query);

    res.json({
      success: true,
      data: chats,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalChats: total,
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    console.error('Get chats error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   GET /api/chats/search
// @desc    Search through user's chats
// @access  Private
/**
 * @swagger
 * /api/chats/search:
 *   get:
 *     summary: Search chats by participant, group name, last message, or description
 *     tags:
 *       - Chats
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: query
 *         required: true
 *         schema:
 *           type: string
 *         description: Search term
 *       - in: query
 *         name: type
 *         required: false
 *         schema:
 *           type: string
 *           enum: [private, group]
 *         description: Filter by chat type
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *         description: Limit the number of chats returned (default 20)
 *     responses:
 *       200:
 *         description: List of matching chats
 *       400:
 *         description: Search query missing or invalid
 *       500:
 *         description: Internal server error
 */
router.get('/search', async (req, res) => {
  try {
    const { query, type, limit = 20 } = req.query;
    const userId = req.user._id;

    if (!query || query.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required'
      });
    }

    // Build search query
    let searchQuery = {
      'participants.user': userId,
      'participants.isActive': true,
      isActive: true
    };

    // Filter by chat type if specified
    if (type && ['private', 'group'].includes(type)) {
      searchQuery.type = type;
    }

    // Get user's chats
    const userChats = await Chat.find(searchQuery)
      .populate('participants.user', 'username profilePicture isOnline lastSeen')
      .populate('lastMessage.message')
      .populate('lastMessage.sender', 'username profilePicture');

    // Filter chats based on search criteria
    const searchTerm = query.toLowerCase().trim();
    const filteredChats = userChats.filter(chat => {
      // Search in participant names (for private chats)
      if (chat.type === 'private') {
        const otherParticipant = chat.participants.find(p => 
          p.user._id.toString() !== userId.toString()
        );
        if (otherParticipant && otherParticipant.user.username.toLowerCase().includes(searchTerm)) {
          return true;
        }
      }

      // Search in group name (for group chats)
      if (chat.type === 'group' && chat.name && chat.name.toLowerCase().includes(searchTerm)) {
        return true;
      }

      // Search in last message content
      if (chat.lastMessage && chat.lastMessage.message) {
        const message = chat.lastMessage.message;
        if (message.type === 'text' && message.content.text && 
            message.content.text.toLowerCase().includes(searchTerm)) {
          return true;
        }
        // Search in media file names
        if (message.type !== 'text' && message.content.media && 
            message.content.media.filename && 
            message.content.media.filename.toLowerCase().includes(searchTerm)) {
          return true;
        }
      }

      // Search in chat description (for group chats)
      if (chat.type === 'group' && chat.description && 
          chat.description.toLowerCase().includes(searchTerm)) {
        return true;
      }

      return false;
    });

    // Sort by relevance (exact matches first, then partial matches)
    const sortedChats = filteredChats.sort((a, b) => {
      const aScore = getRelevanceScore(a, searchTerm, userId);
      const bScore = getRelevanceScore(b, searchTerm, userId);
      return bScore - aScore;
    });

    // Apply limit
    const limitedChats = sortedChats.slice(0, parseInt(limit));

    res.json({
      success: true,
      data: limitedChats,
      totalFound: filteredChats.length,
      searchQuery: query,
      resultsCount: limitedChats.length
    });
  } catch (error) {
    console.error('Search chats error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Helper function to calculate relevance score
function getRelevanceScore(chat, searchTerm, userId) {
  let score = 0;
  const term = searchTerm.toLowerCase();

  // Exact matches get highest score
  if (chat.type === 'private') {
    const otherParticipant = chat.participants.find(p => 
      p.user._id.toString() !== userId.toString()
    );
    if (otherParticipant) {
      if (otherParticipant.user.username.toLowerCase() === term) {
        score += 100;
      } else if (otherParticipant.user.username.toLowerCase().startsWith(term)) {
        score += 50;
      } else if (otherParticipant.user.username.toLowerCase().includes(term)) {
        score += 25;
      }
    }
  }

  if (chat.type === 'group') {
    if (chat.name && chat.name.toLowerCase() === term) {
      score += 100;
    } else if (chat.name && chat.name.toLowerCase().startsWith(term)) {
      score += 50;
    } else if (chat.name && chat.name.toLowerCase().includes(term)) {
      score += 25;
    }
  }

  // Last message relevance
  if (chat.lastMessage && chat.lastMessage.message) {
    const message = chat.lastMessage.message;
    if (message.type === 'text' && message.content.text) {
      const text = message.content.text.toLowerCase();
      if (text === term) {
        score += 30;
      } else if (text.startsWith(term)) {
        score += 20;
      } else if (text.includes(term)) {
        score += 10;
      }
    }
  }

  // Recent activity bonus
  if (chat.lastMessage && chat.lastMessage.timestamp) {
    const hoursSinceLastMessage = (Date.now() - chat.lastMessage.timestamp) / (1000 * 60 * 60);
    if (hoursSinceLastMessage < 1) score += 15;
    else if (hoursSinceLastMessage < 24) score += 10;
    else if (hoursSinceLastMessage < 168) score += 5; // 1 week
  }

  return score;
}

/**
 * @swagger
 * /api/chats:
 *   post:
 *     summary: Create a new chat
 *     tags:
 *       - Chats
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               participants:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Chat created
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
// @route   POST /api/chats
// @desc    Create a new chat
// @access  Private
router.post('/', [
  body('type')
    .isIn(['private', 'group'])
    .withMessage('Chat type must be private or group'),
  body('participants')
    .isArray({ min: 1 })
    .withMessage('At least one participant is required'),
  body('participants.*.userId')
    .isMongoId()
    .withMessage('Valid user ID is required for each participant'),
  body('name')
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('Group name must be between 1 and 100 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { type, participants, name, description } = req.body;
    const creatorId = req.user._id;

    // Validate participants
    const participantIds = participants.map(p => p.userId);
    
    // Check if all participants exist
    const users = await User.find({ _id: { $in: participantIds } });
    if (users.length !== participantIds.length) {
      return res.status(400).json({
        success: false,
        message: 'One or more participants not found'
      });
    }

    // For private chats, ensure only 2 participants
    if (type === 'private' && participantIds.length !== 2) {
      return res.status(400).json({
        success: false,
        message: 'Private chats must have exactly 2 participants'
      });
    }

    // For group chats, ensure creator is included
    if (type === 'group' && !participantIds.includes(creatorId.toString())) {
      participantIds.push(creatorId.toString());
    }

    // Check if private chat already exists
    if (type === 'private') {
      const existingChat = await Chat.findOne({
        type: 'private',
        'participants.user': { $all: participantIds },
        'participants.isActive': true,
        isActive: true
      });

      if (existingChat) {
        return res.status(400).json({
          success: false,
          message: 'Private chat already exists with these participants'
        });
      }
    }

    // Create chat
    const chat = new Chat({
      type,
      name: type === 'group' ? name : undefined,
      description: type === 'group' ? description : undefined,
      participants: participantIds.map(userId => ({
        user: userId,
        role: userId === creatorId.toString() ? 'admin' : 'member',
        isActive: true,
        joinedAt: new Date()
      })),
      createdBy: creatorId
    });

    await chat.save();

    // Populate chat with user details
    await chat.populate('participants.user', 'username profilePicture isOnline lastSeen');
    await chat.populate('createdBy', 'username profilePicture');

    res.status(201).json({
      success: true,
      message: 'Chat created successfully',
      data: chat
    });
  } catch (error) {
    console.error('Create chat error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * @swagger
 * /api/chats/{chatId}:
 *   get:
 *     summary: Get details of a specific chat
 *     tags:
 *       - Chats
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chatId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the chat
 *     responses:
 *       200:
 *         description: Chat details
 *       404:
 *         description: Chat not found or access denied
 *       500:
 *         description: Internal server error
 */
router.get('/:chatId', async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user._id;

    const chat = await Chat.findOne({
      _id: chatId,
      'participants.user': userId,
      'participants.isActive': true,
      isActive: true
    })
    .populate('participants.user', 'username profilePicture isOnline lastSeen')
    .populate('lastMessage.message')
    .populate('lastMessage.sender', 'username profilePicture')
    .populate('createdBy', 'username profilePicture');

    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found or access denied'
      });
    }

    res.json({
      success: true,
      data: chat
    });
  } catch (error) {
    console.error('Get chat error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// @route   POST /api/chats/:chatId/read
// @desc    Mark chat as read
// @access  Private
/**
 * @swagger
 * /api/chats/{chatId}/read:
 *   post:
 *     summary: Mark all messages in a chat as read
 *     tags:
 *       - Chats
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chatId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the chat to mark as read
 *     responses:
 *       200:
 *         description: Chat marked as read
 *       404:
 *         description: Chat not found or access denied
 *       500:
 *         description: Internal server error
 */
router.post('/:chatId/read', async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user._id;

    const chat = await Chat.findOne({
      _id: chatId,
      'participants.user': userId,
      'participants.isActive': true,
      isActive: true
    });

    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found or access denied'
      });
    }

    // Reset unread count for this user
    chat.resetUnreadCount(userId);
    await chat.save();

    res.json({
      success: true,
      message: 'Chat marked as read',
      data: {
        chatId,
        unreadCount: 0
      }
    });
  } catch (error) {
    console.error('Mark chat read error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

module.exports = router;