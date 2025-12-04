const express = require("express");
const { body, validationResult } = require("express-validator");
const Message = require("../models/Message");
const Chat = require("../models/Chat");
const { authenticateToken } = require("../middleware/auth");
const {
	uploadImage,
	uploadVideo,
	uploadAudio,
	uploadDocument,
	handleUploadError,
} = require("../middleware/upload");
const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");

const router = express.Router();

/**
 * @swagger
 * /api/chats/get-or-create:
 *   post:
 *     summary: Get or create a 1:1 chat with a friend
 *     tags:
 *       - Chats
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - friendId
 *             properties:
 *               friendId:
 *                 type: string
 *                 description: The user ID of the friend you want to chat with
 *     responses:
 *       200:
 *         description: Chat exists or was created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     chatId:
 *                       type: string
 *                       description: The ID of the 1:1 chat
 *                       example: "64f123abc456def789012345"
 *       400:
 *         description: friendId not provided
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "friendId required"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Internal server error"
 */
// Get or create a 1:1 chat with a friend
router.post("/get-or-create", async (req, res) => {
	try {
		const currentUserId = req.user._id;
		const { friendId } = req.body;

		if (!friendId) {
			return res
				.status(400)
				.json({ success: false, message: "friendId required" });
		}

		// Generate deterministic chat ID for private chat
		const chatId = Chat.generatePrivateChatId(currentUserId, friendId);

		// Check if chat already exists
		let chat = await Chat.findById(chatId);

		if (!chat) {
			// Create new private chat with deterministic ID
			chat = await Chat.create({
				_id: chatId,
				type: "private",
				participants: [
					{ user: currentUserId, isActive: true },
					{ user: friendId, isActive: true },
				],
				unreadCount: new Map(),
			});
		}

		res.json({ success: true, data: { chatId: chat._id } });
	} catch (error) {
		console.error("Get or create chat error:", error);
		res.status(500).json({ success: false, message: "Internal server error" });
	}
});


/**
 * @swagger
 * /api/messages/star:
 *   post:
 *     summary: Star a message in a chat
 *     tags:
 *       - Messages
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               messageId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Message Starred
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post("/star", authenticateToken, async (req, res) => {
	try {
		const { messageId } = req.body;
		const userId = req.user._id;

		const msg = await Message.findById(messageId);
		if (!msg) {
			return res.status(404).json({ error: "Message not found" });
		}

		// Star the message
		await msg.starMessage(userId);

		// Populate related fields before returning
		const populatedMsg = await Message.findById(messageId)
			.populate("sender", "username fullName profilePicture")
			.populate({
				path: "chat",
				populate: {
					path: "participants.user",
					select: "username fullName phoneNumber profilePicture",
				},
			});

		res.json({ success: true, data: populatedMsg });
	} catch (err) {
		console.error("Star message error:", err);
		res.status(500).json({ error: "Failed to star message" });
	}
});


/**
 * @swagger
 * /messages/starred
 *   get:
 *     summary: Get Starred Messages
 *     tags:
 *       - Messages
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: messageId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: All Starred messages
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/starred", authenticateToken, async (req, res) => {
	try {
		const userId = new mongoose.Types.ObjectId(req.user._id);

		const starredMessages = await Message.find({
			starredBy: { $elemMatch: { user: userId } },
		})
			.populate({
				path: "chat",
				populate: {
					path: "participants.user",
					select: "username fullName phoneNumber profilePicture",
				},
			})
			.populate("sender", "username fullName profilePicture")
			.sort({ createdAt: -1 });

		// ⭐ FIX: filter out items with no chat
		const filtered = starredMessages.filter(
			(msg) => msg.chat && msg.chat.participants
		);

		const result = filtered.map((msg) => {
			const chat = msg.chat;

			// get the other user safely
			const otherUser = chat.participants.find(
				(p) => p.user && p.user._id.toString() !== userId.toString()
			)?.user;

			return {
				_id: msg._id,
				chatId: chat._id,
				user: otherUser
					? {
							_id: otherUser._id,
							username: otherUser.username,
							fullName: otherUser.fullName,
							phoneNumber: otherUser.phoneNumber,
							profilePicture: otherUser.profilePicture,
					  }
					: null,
				content: msg.content,
				type: msg.type,
				sender: msg.sender,
				createdAt: msg.createdAt,
			};
		});

		return res.json({
			success: true,
			data: result,
		});
	} catch (err) {
		console.error("Starred fetch error:", err);
		return res.status(500).json({
			success: false,
			error: "Failed to fetch starred messages",
		});
	}
});




/**
 * @swagger
 * /api/messages/{chatId}:
 *   get:
 *     summary: Get all messages in a chat
 *     tags:
 *       - Messages
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chatId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of messages
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Chat not found
 *       500:
 *         description: Internal server error
 */

router.get("/:chatId", async (req, res) => {
	try {
		const { chatId } = req.params;
		const { page = 1, limit = 50 } = req.query;

		// Resolve chatId (ObjectId or u1_u2 composite)
		let resolvedChatId = null;

		if (mongoose.Types.ObjectId.isValid(chatId)) {
			resolvedChatId = chatId;
		} else if (typeof chatId === "string" && chatId.includes("_")) {
			const [u1, u2] = chatId.split("_");
			if (
				mongoose.Types.ObjectId.isValid(u1 || "") &&
				mongoose.Types.ObjectId.isValid(u2 || "")
			) {
				resolvedChatId = Chat.generatePrivateChatId(u1, u2);
			}
		}

		if (!resolvedChatId) {
			return res
				.status(400)
				.json({ success: false, message: "Invalid chatId" });
		}

		// 🚀 FIXED: Match only the logged-in user's participant object
		const chat = await Chat.findOne({
			_id: resolvedChatId,
			isActive: true,
			participants: {
				$elemMatch: {
					user: req.user._id,
					isActive: true, // only require YOU to be active
				},
			},
		});

		if (!chat) {
			return res
				.status(404)
				.json({ success: false, message: "Chat not found" });
		}

		// Fetch messages
		const messages = await Message.find({
			chat: resolvedChatId,
			isDeleted: false,
		})
			.populate("sender", "username profilePicture")
			.sort({ createdAt: -1 })
			.limit(parseInt(limit))
			.skip((page - 1) * limit);

		// Mark unread messages as read
		const unreadMessages = messages.filter(
			(msg) =>
				!msg.readBy.some(
					(read) => read.user.toString() === req.user._id.toString()
				)
		);

		if (unreadMessages.length) {
			await Promise.all(
				unreadMessages.map((msg) => msg.markAsRead(req.user._id))
			);

			chat.resetUnreadCount(req.user._id);
			await chat.save();
		}

		// Response
		res.json({
			success: true,
			data: messages.reverse(), // chronological order
			pagination: {
				currentPage: parseInt(page),
				totalPages: Math.ceil(messages.length / limit),
				totalMessages: messages.length,
			},
		});
	} catch (err) {
		console.error("Get messages error:", err);
		res.status(500).json({ success: false, message: "Internal server error" });
	}
});

/**
 * @swagger
 * /api/messages/clear/{chatId}:
 *   delete:
 *     summary: Clear all messages in a chat
 *     tags:
 *       - Messages
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: chatId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: All messages cleared
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.delete("/clear/:chatId", async (req, res) => {
	try {
		const { chatId } = req.params;

		const id = new mongoose.Types.ObjectId(chatId);

		const result = await Message.deleteMany({
			$or: [{ chat: id }, { "chat._id": id }],
		});

		return res.status(200).json({
			success: true,
			deleted: result.deletedCount,
			message: "Messages cleared",
		});
	} catch (error) {
		console.error("Error clearing messages:", error);
		return res.status(500).json({
			success: false,
			message: "Internal server error",
		});
	}
});



/**
 * @swagger
 * /api/messages/unstar:
 *   post:
 *     summary: Unstar a message
 *     tags:
 *       - Messages
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               messageId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Message Unstarred
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post("/unstar", authenticateToken, async (req, res) => {
	try {
		const { messageId } = req.body;
		const userId = req.user._id;

		const msg = await Message.findById(messageId);
		if (!msg) {
			return res.status(404).json({ error: "Message not found" });
		}

		await msg.unstarMessage(userId);

		res.json({ success: true, data: msg });
	} catch (err) {
		console.error("Unstar message error:", err);
		res.status(500).json({ error: "Failed to unstar message" });
	}
});

/**
 * @swagger
 * /api/messages/{chatId}:
 *   post:
 *     summary: Send a new message to a chat
 *     tags:
 *       - Messages
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               chatId:
 *                 type: string
 *               content:
 *                 type: string
 *     responses:
 *       201:
 *         description: Message sent
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post("/:chatId", async (req, res) => {
	try {
		const { chatId } = req.params;
		const { content } = req.body; // content should be the string input

		if (!content || content.trim().length === 0) {
			return res.status(400).json({
				success: false,
				message: "Content is required",
			});
		}

		// Check if user is participant
		const chat = await Chat.findOne({
			_id: chatId,
			"participants.user": req.user._id,
			"participants.isActive": true,
			isActive: true,
		});

		if (!chat) {
			return res.status(404).json({
				success: false,
				message: "Chat not found",
			});
		}

		// Create message: content is always an object with `text`
		const message = new Message({
			chat: chatId,
			sender: req.user._id,
			type: "text",
			content: { text: content.trim() },
		});

		await message.save();

		// Update last message preview
		const preview = content.trim().substring(0, 100);
		chat.updateLastMessage(message, req.user, preview);
		chat.incrementUnreadCount(req.user._id);
		await chat.save();

		// Respond with populated message
		await message.populate("sender", "username profilePicture");
		res.status(201).json({
			success: true,
			message: "Message sent successfully",
			data: message,
		});
	} catch (err) {
		console.error(err);
		res.status(500).json({ success: false, message: "Internal server error" });
	}
});


/**
 * @swagger
 * /api/messages/{chatId}/upload-image:
 *   post:
 *     summary: Upload and send an image message
 *     tags:
 *       - Messages
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chatId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the chat
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *               replyTo:
 *                 type: string
 *                 description: Message ID being replied to
 *     responses:
 *       201:
 *         description: Image message sent
 *       400:
 *         description: Image file required
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Chat not found
 *       500:
 *         description: Internal server error
 */
router.post(
	"/:chatId/upload-image",
	uploadImage.single("image"),
	handleUploadError,
	async (req, res) => {
		try {
			const { chatId } = req.params;
			const { replyTo } = req.body;

			if (!req.file) {
				return res.status(400).json({
					success: false,
					message: "Image file is required",
				});
			}

			// Check if user is participant in the chat
			const chat = await Chat.findOne({
				_id: chatId,
				"participants.user": req.user._id,
				"participants.isActive": true,
				isActive: true,
			});

			if (!chat) {
				return res.status(404).json({
					success: false,
					message: "Chat not found",
				});
			}

			// Create image message
			const message = new Message({
				chat: chatId,
				sender: req.user._id,
				type: "image",
				content: {
					media: {
						url: `/uploads/${req.file.filename}`,
						filename: req.file.originalname,
						mimeType: req.file.mimetype,
						size: req.file.size,
					},
				},
				replyTo,
			});

			await message.save();

			// Update chat's last message
			chat.updateLastMessage(message, req.user, "📷 Image");
			chat.incrementUnreadCount(req.user._id);
			await chat.save();

			// Populate message for response
			await message.populate("sender", "username profilePicture");
			if (replyTo) {
				await message.populate("replyTo", "content type sender");
			}

			res.status(201).json({
				success: true,
				message: "Image message sent successfully",
				data: message,
			});
		} catch (error) {
			console.error("Upload image error:", error);
			res.status(500).json({
				success: false,
				message: "Internal server error",
			});
		}
	}
);

/**
 * @swagger
 * /api/messages/{chatId}/upload-video:
 *   post:
 *     summary: Upload and send a video message
 *     tags:
 *       - Messages
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chatId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the chat
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               video:
 *                 type: string
 *                 format: binary
 *               replyTo:
 *                 type: string
 *                 description: Message ID being replied to
 *     responses:
 *       201:
 *         description: Video message sent
 *       400:
 *         description: Video file required
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Chat not found
 *       500:
 *         description: Internal server error
 */
router.post(
	"/:chatId/upload-video",
	uploadVideo.single("video"),
	handleUploadError,
	async (req, res) => {
		try {
			const { chatId } = req.params;
			const { replyTo } = req.body;

			if (!req.file) {
				return res.status(400).json({
					success: false,
					message: "Video file is required",
				});
			}

			// Check if user is participant in the chat
			const chat = await Chat.findOne({
				_id: chatId,
				"participants.user": req.user._id,
				"participants.isActive": true,
				isActive: true,
			});

			if (!chat) {
				return res.status(404).json({
					success: false,
					message: "Chat not found",
				});
			}

			// Create video message
			const message = new Message({
				chat: chatId,
				sender: req.user._id,
				type: "video",
				content: {
					media: {
						url: `/uploads/${req.file.filename}`,
						filename: req.file.originalname,
						mimeType: req.file.mimetype,
						size: req.file.size,
					},
				},
				replyTo,
			});

			await message.save();

			// Update chat's last message
			chat.updateLastMessage(message, req.user, "🎥 Video");
			chat.incrementUnreadCount(req.user._id);
			await chat.save();

			// Populate message for response
			await message.populate("sender", "username profilePicture");
			if (replyTo) {
				await message.populate("replyTo", "content type sender");
			}

			res.status(201).json({
				success: true,
				message: "Video message sent successfully",
				data: message,
			});
		} catch (error) {
			console.error("Upload video error:", error);
			res.status(500).json({
				success: false,
				message: "Internal server error",
			});
		}
	}
);

// @route   POST /api/messages/:chatId/upload-audio
// @desc    Upload and send an audio message
// @access  Private
/**
 * @swagger
 * /api/messages/{chatId}/upload-audio:
 *   post:
 *     summary: Upload and send an audio message
 *     tags:
 *       - Messages
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chatId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the chat
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               audio:
 *                 type: string
 *                 format: binary
 *               replyTo:
 *                 type: string
 *                 description: Message ID being replied to
 *     responses:
 *       201:
 *         description: Audio message sent
 *       400:
 *         description: Audio file required
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Chat not found
 *       500:
 *         description: Internal server error
 */
router.post(
	"/:chatId/upload-audio",
	uploadAudio.single("audio"),
	handleUploadError,
	async (req, res) => {
		try {
			const { chatId } = req.params;
			const { replyTo } = req.body;

			if (!req.file) {
				return res.status(400).json({
					success: false,
					message: "Audio file is required",
				});
			}

			// Check if user is participant in the chat
			const chat = await Chat.findOne({
				_id: chatId,
				"participants.user": req.user._id,
				"participants.isActive": true,
				isActive: true,
			});

			if (!chat) {
				return res.status(404).json({
					success: false,
					message: "Chat not found",
				});
			}

			// Create audio message
			const message = new Message({
				chat: chatId,
				sender: req.user._id,
				type: "audio",
				content: {
					media: {
						url: `/uploads/${req.file.filename}`,
						filename: req.file.originalname,
						mimeType: req.file.mimetype,
						size: req.file.size,
					},
				},
				replyTo,
			});

			await message.save();

			// Update chat's last message
			chat.updateLastMessage(message, req.user, "🎵 Audio");
			chat.incrementUnreadCount(req.user._id);
			await chat.save();

			// Populate message for response
			await message.populate("sender", "username profilePicture");
			if (replyTo) {
				await message.populate("replyTo", "content type sender");
			}

			res.status(201).json({
				success: true,
				message: "Audio message sent successfully",
				data: message,
			});
		} catch (error) {
			console.error("Upload audio error:", error);
			res.status(500).json({
				success: false,
				message: "Internal server error",
			});
		}
	}
);

// @route   POST /api/messages/:chatId/upload-document
// @desc    Upload and send a document message
// @access  Private
/**
 * @swagger
 * /api/messages/{chatId}/upload-document:
 *   post:
 *     summary: Upload and send a document message
 *     tags:
 *       - Messages
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chatId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the chat
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               document:
 *                 type: string
 *                 format: binary
 *               replyTo:
 *                 type: string
 *                 description: Message ID being replied to
 *     responses:
 *       201:
 *         description: Document message sent
 *       400:
 *         description: Document file required
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Chat not found
 *       500:
 *         description: Internal server error
 */
router.post(
	"/:chatId/upload-document",
	uploadDocument.single("document"),
	handleUploadError,
	async (req, res) => {
		try {
			const { chatId } = req.params;
			const { replyTo } = req.body;

			if (!req.file) {
				return res.status(400).json({
					success: false,
					message: "Document file is required",
				});
			}

			// Check if user is participant in the chat
			const chat = await Chat.findOne({
				_id: chatId,
				"participants.user": req.user._id,
				"participants.isActive": true,
				isActive: true,
			});

			if (!chat) {
				return res.status(404).json({
					success: false,
					message: "Chat not found",
				});
			}

			// Create document message
			const message = new Message({
				chat: chatId,
				sender: req.user._id,
				type: "document",
				content: {
					media: {
						url: `/uploads/${req.file.filename}`,
						filename: req.file.originalname,
						mimeType: req.file.mimetype,
						size: req.file.size,
					},
				},
				replyTo,
			});

			await message.save();

			// Update chat's last message
			chat.updateLastMessage(message, req.user, "📄 Document");
			chat.incrementUnreadCount(req.user._id);
			await chat.save();

			// Populate message for response
			await message.populate("sender", "username profilePicture");
			if (replyTo) {
				await message.populate("replyTo", "content type sender");
			}

			res.status(201).json({
				success: true,
				message: "Document message sent successfully",
				data: message,
			});
		} catch (error) {
			console.error("Upload document error:", error);
			res.status(500).json({
				success: false,
				message: "Internal server error",
			});
		}
	}
);

/**
 * @swagger
 * /api/messages/{messageId}:
 *   put:
 *     summary: Edit a message
 *     tags:
 *       - Messages
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: messageId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the message to edit
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               content:
 *                 type: object
 *     responses:
 *       200:
 *         description: Message edited successfully
 *       400:
 *         description: Invalid input or too old to edit
 *       404:
 *         description: Message not found or unauthorized
 *       500:
 *         description: Internal server error
 */
router.put(
	"/:messageId",
	[body("content").isObject().withMessage("Content object is required")],
	async (req, res) => {
		try {
			const errors = validationResult(req);
			if (!errors.isEmpty()) {
				return res.status(400).json({
					success: false,
					errors: errors.array(),
				});
			}

			const { messageId } = req.params;
			const { content } = req.body;

			const message = await Message.findOne({
				_id: messageId,
				sender: req.user._id,
				isDeleted: false,
			});

			if (!message) {
				return res.status(404).json({
					success: false,
					message: "Message not found or you cannot edit it",
				});
			}

			// Check if message is too old to edit (e.g., 15 minutes)
			const editTimeLimit = 15 * 60 * 1000; // 15 minutes in milliseconds
			if (Date.now() - message.createdAt.getTime() > editTimeLimit) {
				return res.status(400).json({
					success: false,
					message: "Message is too old to edit",
				});
			}

			// Edit message
			message.editMessage(content);
			await message.save();

			// Update chat's last message if this was the last message
			const chat = await Chat.findById(message.chat);
			if (chat && chat.lastMessage.message.toString() === messageId) {
				const preview =
					message.type === "text"
						? content.text.substring(0, 100)
						: `📎 ${message.type}`;
				chat.updateLastMessage(message, req.user, preview);
				await chat.save();
			}

			// Populate message for response
			await message.populate("sender", "username profilePicture");

			res.json({
				success: true,
				message: "Message edited successfully",
				data: message,
			});
		} catch (error) {
			console.error("Edit message error:", error);
			res.status(500).json({
				success: false,
				message: "Internal server error",
			});
		}
	}
);

// @route   DELETE /api/messages/:messageId
// @desc    Delete a message
// @access  Private
/**
 * @swagger
 * /api/messages/{messageId}:
 *   delete:
 *     summary: Delete a message
 *     tags:
 *       - Messages
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: messageId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the message to delete
 *     responses:
 *       200:
 *         description: Message deleted successfully
 *       400:
 *         description: Message too old to delete
 *       404:
 *         description: Message not found or unauthorized
 *       500:
 *         description: Internal server error
 */
router.delete("/:messageId", async (req, res) => {
	try {
		const { messageId } = req.params;

		const message = await Message.findOne({
			_id: messageId,
			sender: req.user._id,
			isDeleted: false,
		});

		if (!message) {
			return res.status(404).json({
				success: false,
				message: "Message not found or you cannot delete it",
			});
		}

		// hard delete (must NOT call save() internally)
		message.hardDelete(req.user._id);
		await message.save();

		res.json({
			success: true,
			message: "Message deleted successfully",
		});
	} catch (error) {
		console.error("Delete message error:", error);
		res.status(500).json({
			success: false,
			message: "Internal server error",
		});
	}
});


module.exports = router;
