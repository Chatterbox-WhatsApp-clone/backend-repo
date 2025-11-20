const express = require("express");
const { body, validationResult } = require("express-validator");
const Message = require("../models/Message");
const Chat = require("../models/Chat");
const {
	uploadImage,
	uploadVideo,
	uploadAudio,
	uploadDocument,
	handleUploadError,
} = require("../middleware/upload");
const path = require("path");
const fs = require("fs");

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

		let chat = await Chat.findOne({
			isGroupChat: false,
			"participants.user": { $all: [currentUserId, friendId] },
		});

		if (!chat) {
			chat = await Chat.create({
				isGroupChat: false,
				participants: [
					{ user: currentUserId, isActive: true },
					{ user: friendId, isActive: true },
				],
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

		// Check if user is participant in the chat
		const chat = await Chat.findOne({
			_id: chatId, // ObjectId is fine here
			"participants.user": req.user._id,
		});

		if (!chat) {
			return res.status(404).json({
				success: false,
				message: "Chat not found",
			});
		}

		// Get messages
		const messages = await Message.find({
			chat: chatId,
			isDeleted: false,
		})
			.populate("sender", "username profilePicture")
			.sort({ createdAt: -1 })
			.limit(limit * 1)
			.skip((page - 1) * limit);

		// Mark messages as read
		const unreadMessages = messages.filter(
			(msg) =>
				!msg.readBy.some(
					(read) => read.user.toString() === req.user._id.toString()
				)
		);

		if (unreadMessages.length > 0) {
			await Promise.all(
				unreadMessages.map((msg) => msg.markAsRead(req.user._id))
			);

			// Update chat unread count
			chat.resetUnreadCount(req.user._id);
			await chat.save();
		}

		res.json({
			success: true,
			data: messages.reverse(), // Return in chronological order
			pagination: {
				currentPage: parseInt(page),
				totalPages: Math.ceil(messages.length / limit),
				totalMessages: messages.length,
			},
		});
	} catch (error) {
		console.error("Get messages error:", error);
		res.status(500).json({
			success: false,
			message: "Internal server error",
		});
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
// @route   POST /api/messages
// @desc    Send a new message
// @access  Private
router.post(
	"/:chatId",
	[
		body("type")
			.isIn([
				"text",
				"image",
				"video",
				"audio",
				"document",
				"location",
				"contact",
				"sticker",
			])
			.withMessage("Invalid message type"),
		body("content.text")
			.optional()
			.isLength({ max: 4000 })
			.withMessage("Text message cannot exceed 4000 characters"),
	],
	async (req, res) => {
		try {
			const errors = validationResult(req);
			if (!errors.isEmpty()) {
				return res.status(400).json({
					success: false,
					errors: errors.array(),
				});
			}

			const { chatId } = req.params;
			const { type, content, replyTo } = req.body;

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

			// Validate content based on type
			if (
				type === "text" &&
				(!content.text || content.text.trim().length === 0)
			) {
				return res.status(400).json({
					success: false,
					message: "Text content is required for text messages",
				});
			}

			// Create message
			const message = new Message({
				chat: chatId,
				sender: req.user._id,
				type,
				content,
				replyTo,
			});

			await message.save();

			// Update chat's last message
			const preview =
				type === "text" ? content.text.substring(0, 100) : `📎 ${type}`;
			chat.updateLastMessage(message, req.user, preview);
			chat.incrementUnreadCount(req.user._id);
			await chat.save();

			// Enqueue delivery job
			try {
				const { messageQueue } = require("../queue/messageQueue");
				await messageQueue.add(
					"deliver",
					{ messageId: message._id.toString() },
					{
						jobId: `message:${message._id.toString()}`,
					}
				);
			} catch (e) {
				console.error("Failed to enqueue message delivery job", e);
			}

			// Populate message for response
			await message.populate("sender", "username profilePicture");
			if (replyTo) {
				await message.populate("replyTo", "content type sender");
			}

			res.status(201).json({
				success: true,
				message: "Message sent successfully",
				data: message,
			});
		} catch (error) {
			console.error("Send message error:", error);
			res.status(500).json({
				success: false,
				message: "Internal server error",
			});
		}
	}
);

// @route   POST /api/messages/:chatId/upload-image
// @desc    Upload and send an image message
// @access  Private
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

// @route   POST /api/messages/:chatId/upload-video
// @desc    Upload and send a video message
// @access  Private
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

// @route   PUT /api/messages/:messageId
// @desc    Edit a message
// @access  Private
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

		// Check if message is too old to delete (e.g., 1 hour)
		const deleteTimeLimit = 60 * 60 * 1000; // 1 hour in milliseconds
		if (Date.now() - message.createdAt.getTime() > deleteTimeLimit) {
			return res.status(400).json({
				success: false,
				message: "Message is too old to delete",
			});
		}

		// Soft delete message
		message.softDelete(req.user._id);
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
