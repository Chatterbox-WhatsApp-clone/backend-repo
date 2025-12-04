const express = require("express");
const { body, validationResult } = require("express-validator");
const mongoose = require("mongoose");
const Chat = require("../models/Chat");
const User = require("../models/User");
const Message = require("../models/Message");
const router = express.Router();

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
router.get("/search", async (req, res) => {
	try {
		const { query, type, limit = 20 } = req.query;
		const userId = req.user._id;

		if (!query || query.trim().length === 0) {
			return res.status(400).json({
				success: false,
				message: "Search query is required",
			});
		}

		// Build search query
		let searchQuery = {
			"participants.user": userId,
			"participants.isActive": true,
			isActive: true,
		};

		// Filter by chat type if specified
		if (type && ["private", "group"].includes(type)) {
			searchQuery.type = type;
		}

		// Get user's chats
		const userChats = await Chat.find(searchQuery)
			.populate(
				"participants.user",
				"username profilePicture isOnline lastSeen"
			)
			.populate("lastMessage.message")
			.populate("lastMessage.sender", "username profilePicture");

		// Filter chats based on search criteria
		const searchTerm = query.toLowerCase().trim();
		const filteredChats = userChats.filter((chat) => {
			// Search in participant names (for private chats)
			if (chat.type === "private") {
				const otherParticipant = chat.participants.find(
					(p) => p.user._id.toString() !== userId.toString()
				);
				if (
					otherParticipant &&
					otherParticipant.user.username.toLowerCase().includes(searchTerm)
				) {
					return true;
				}
			}

			// Search in group name (for group chats)
			if (
				chat.type === "group" &&
				chat.name &&
				chat.name.toLowerCase().includes(searchTerm)
			) {
				return true;
			}

			// Search in last message content
			if (chat.lastMessage && chat.lastMessage.message) {
				const message = chat.lastMessage.message;
				if (
					message.type === "text" &&
					message.content.text &&
					message.content.text.toLowerCase().includes(searchTerm)
				) {
					return true;
				}
				// Search in media file names
				if (
					message.type !== "text" &&
					message.content.media &&
					message.content.media.filename &&
					message.content.media.filename.toLowerCase().includes(searchTerm)
				) {
					return true;
				}
			}

			// Search in chat description (for group chats)
			if (
				chat.type === "group" &&
				chat.description &&
				chat.description.toLowerCase().includes(searchTerm)
			) {
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
			resultsCount: limitedChats.length,
		});
	} catch (error) {
		console.error("Search chats error:", error);
		res.status(500).json({
			success: false,
			message: "Internal server error",
		});
	}
});

// Helper function to calculate relevance score
function getRelevanceScore(chat, searchTerm, userId) {
	let score = 0;
	const term = searchTerm.toLowerCase();

	// Exact matches get highest score
	if (chat.type === "private") {
		const otherParticipant = chat.participants.find(
			(p) => p.user._id.toString() !== userId.toString()
		);
		if (otherParticipant) {
			if (otherParticipant.user.username.toLowerCase() === term) {
				score += 100;
			} else if (
				otherParticipant.user.username.toLowerCase().startsWith(term)
			) {
				score += 50;
			} else if (otherParticipant.user.username.toLowerCase().includes(term)) {
				score += 25;
			}
		}
	}

	if (chat.type === "group") {
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
		if (message.type === "text" && message.content.text) {
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
		const hoursSinceLastMessage =
			(Date.now() - chat.lastMessage.timestamp) / (1000 * 60 * 60);
		if (hoursSinceLastMessage < 1) score += 15;
		else if (hoursSinceLastMessage < 24) score += 10;
		else if (hoursSinceLastMessage < 168) score += 5; // 1 week
	}

	return score;
}

/**
 * @swagger
 * /api/chats/unread:
 *   get:
 *     summary: Get all unread messages for the authenticated user
 *     tags:
 *       - Chats
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of unread messages grouped by chat
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 totalUnread:
 *                   type: number
 *                   description: Total unread messages across all chats
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       chatId:
 *                         type: string
 *                         description: ID of the chat
 *                       unreadCount:
 *                         type: number
 *                         description: Number of unread messages in this chat
 *                       messages:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             _id:
 *                               type: string
 *                               description: Message ID
 *                             content:
 *                               type: string
 *                             type:
 *                               type: string
 *                               enum: [text, image, audio, video]
 *                             sender:
 *                               type: object
 *                               properties:
 *                                 username:
 *                                   type: string
 *                                 fullName:
 *                                   type: string
 *                                 profilePicture:
 *                                   type: string
 *                             createdAt:
 *                               type: string
 *                               format: date-time
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/unread", async (req, res) => {
	try {
		const userId = req.user._id;

		// 1️⃣ Find all chats where user has unread messages
		const chatsWithUnread = await Chat.find({
			type: "private",
			"participants.user": userId,
			isActive: true,
			[`unreadCount.${userId}`]: { $gt: 0 }, // unread > 0
		});

		if (!chatsWithUnread.length) {
			return res.json({
				success: true,
				data: [],
				totalUnread: 0,
			});
		}

		// 2️⃣ For each chat, fetch unread messages
		const unreadMessages = await Promise.all(
			chatsWithUnread.map(async (chat) => {
				// unread count for this chat
				const unreadCount = chat.unreadCount.get(userId.toString()) || 0;

				// get unread messages from Message model
				const messages = await Message.find({
					chat: chat._id,
					readBy: { $ne: userId }, // user hasn’t read
					sender: { $ne: userId }, // exclude user's own messages
				})
					.sort({ createdAt: -1 })
					.populate("sender", "username fullName profilePicture");

				return {
					chatId: chat._id,
					unreadCount,
					messages,
				};
			})
		);

		// 3️⃣ Sum total unread across all chats
		const totalUnread = unreadMessages.reduce(
			(total, chat) => total + chat.unreadCount,
			0
		);

		return res.json({
			success: true,
			data: unreadMessages,
			totalUnread,
		});
	} catch (error) {
		console.error("Fetch unread messages error:", error);
		res.status(500).json({
			success: false,
			message: "Internal server error",
		});
	}
});

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
router.get("/", async (req, res) => {
	try {
		const { page = 1, limit = 20 } = req.query;
		const userId = req.user._id;

		// Fetch current user with blockedUsers and contacts
		const currentUser = await User.findById(userId).select("blockedUsers contacts");

		// Fetch all chats for the user
		const chats = await Chat.find({
			type: "private",
			"participants.user": userId,
			"participants.isActive": true,
			isActive: true,
		})
			.populate(
				"participants.user",
				"username fullName profilePicture isOnline lastSeen isActive isDeleted"
			)
			.populate("favorites.user", "_id")
			.sort({ updatedAt: -1 });

		const chatList = await Promise.all(
			chats.map(async (chat) => {
				// Find the other participant
				const otherParticipant = chat.participants.find(
					(p) => p.user && String(p.user._id) !== String(userId)
				);

				// If no valid other participant → drop chat
				if (!otherParticipant || !otherParticipant.user) return null;

				const otherUser = otherParticipant.user;

				// ❌ Remove if other user is deleted or inactive
				if (otherUser.isDeleted === true) return null;
				if (otherUser.isActive === false) return null;

				// Check if this chat is favourited by current user
				const isFavourite = chat.favorites.some(
					(f) => String(f.user?._id || f.user) === String(userId)
				);

				// 🚫 BLOCK: Check if current user has blocked the other user
				// 🚫 BLOCK: Check if current user has blocked the other user
				const isBlocked = currentUser.blockedUsers?.some(
					(blockedId) => String(blockedId) === String(otherUser._id)
				);

				// ⭐ Fetch last visible message
				// If blocked: hide all messages for the blocker
				// If not blocked: show messages not deleted
				let lastMessage = null;
				if (isBlocked) {
					// BLOCK: Messages hidden only for the blocker
					lastMessage = null;
				} else {
					// Normal: Fetch last visible (not deleted) message
					lastMessage = await Message.findOne({
						chat: chat._id,
						isDeleted: { $ne: true },
					})
						.sort({ createdAt: -1 })
						.populate("sender", "username fullName profilePicture");
				}

				const unreadCount = isBlocked
					? 0
					: chat.unreadCount?.get(userId.toString()) || 0;

				return {
					chatId: chat._id,
					user: otherUser,

					lastMessage: lastMessage
						? {
								_id: lastMessage._id,
								content: lastMessage.content,
								type: lastMessage.type,
								sender: lastMessage.sender,
								createdAt: lastMessage.createdAt,
						  }
						: null,

					lastMessageTime: lastMessage ? lastMessage.createdAt : null,

					unreadCount,
					isFavourite,
					isBlocked, // 🚫 Return blocked status
					isActive: chat.isActive,
					createdAt: chat.createdAt,
					updatedAt: chat.updatedAt,
				};
			})
		);

		// Remove nulls + removed/deleted users
		const filteredChats = chatList.filter(Boolean);

		// Sort by most recent chat
		filteredChats.sort((a, b) => {
			const aTime = a.lastMessageTime
				? new Date(a.lastMessageTime).getTime()
				: 0;
			const bTime = b.lastMessageTime
				? new Date(b.lastMessageTime).getTime()
				: 0;
			return bTime - aTime;
		});

		// Pagination
		const paginatedChats = filteredChats.slice(
			(page - 1) * limit,
			page * limit
		);

		res.json({
			success: true,
			data: paginatedChats,
			pagination: {
				currentPage: parseInt(page),
				totalPages: Math.ceil(filteredChats.length / limit),
				totalChats: filteredChats.length,
				hasNextPage: page * limit < filteredChats.length,
				hasPrevPage: page > 1,
			},
		});
	} catch (error) {
		console.error("Get chats error:", error);
		res
			.status(500)
			.json({ success: false, message: "Internal server error" });
	}
});


/**
 * @swagger
 * /api/chats/favorite:
 *   get:
 *     summary: Get all favourite chats
 *     tags:
 *       - Chats
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of all favorites chats by chat
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       chatId:
 *                         type: string
 *                         description: ID of the chat
 *                       unreadCount:
 *                         type: number
 *                         description: Number of unread messages in this chat
 *                       messages:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             _id:
 *                               type: string
 *                               description: Message ID
 *                             content:
 *                               type: string
 *                             type:
 *                               type: string
 *                               enum: [text, image, audio, video]
 *                             sender:
 *                               type: object
 *                               properties:
 *                                 username:
 *                                   type: string
 *                                 fullName:
 *                                   type: string
 *                                 profilePicture:
 *                                   type: string
 *                             createdAt:
 *                               type: string
 *                               format: date-time
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/favorite", async (req, res) => {
	try {
		const userId = req.user._id;

		const favoriteChats = await Chat.find({
			"favorites.user": userId,
			isActive: true,
		})
			.populate(
				"participants.user",
				"username fullName profilePicture isOnline lastSeen"
			)
			.sort({ updatedAt: -1 });

		const data = await Promise.all(
			favoriteChats.map(async (chat) => {
				// Fetch real last message
				const lastMessage = await Message.findOne({ chat: chat._id })
					.sort({ createdAt: -1 })
					.populate("sender", "username fullName profilePicture");

				// Find other participant (not the requesting user)
				const otherParticipant = chat.participants.find(
					(p) => p.user._id.toString() !== userId.toString()
				);

				return {
					chatId: chat._id,
					user: otherParticipant ? otherParticipant.user : null,
					lastMessage: lastMessage
						? {
							_id: lastMessage._id,
							content: lastMessage.content,
							type: lastMessage.type,
							sender: lastMessage.sender,
							createdAt: lastMessage.createdAt,
							status: lastMessage.status,
						}
						: null,
				};
			})
		);

		return res.json({
			success: true,
			data: data,
		});
	} catch (error) {
		console.error("Fetch favorite chats error:", error);
		res.status(500).json({
			success: false,
			message: "Internal server error",
		});
	}
});

/**
 * @swagger
 * /api/chats/favorite:
 *   post:
 *     summary: Add a chat to favorites
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
 *             properties:
 *               chatId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Chat favorited
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post("/favorite", async (req, res) => {
	try {
		const userId = req.user._id;
		const { chatId } = req.body;

		const chat = await Chat.findById(chatId);

		if (!chat) {
			return res
				.status(404)
				.json({ success: false, message: "Chat not found" });
		}

		// Check if already liked
		const alreadyFavorite = chat.favorites.some(
			(fav) => fav.user.toString() === userId.toString()
		);

		if (alreadyFavorite) {
			return res.json({ success: true, message: "Already favorited" });
		}

		chat.favorites.push({ user: userId });
		await chat.save();

		res.json({ success: true, message: "Chat favorited" });
	} catch (err) {
		console.log("Favorite error:", err);
		res.status(500).json({ success: false, error: "Failed to favorite chat" });
	}
});

/**
 * @swagger
 * /api/chats/favorite/{chatId}:
 *   delete:
 *     summary: Get all favourite chats
 *     tags:
 *       - Chats
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of all favorites chats by chat
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 totalUnread:
 *                   type: number
 *                   description: Total unread messages across all chats
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       chatId:
 *                         type: string
 *                         description: ID of the chat
 *                       unreadCount:
 *                         type: number
 *                         description: Number of unread messages in this chat
 *                       messages:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             _id:
 *                               type: string
 *                               description: Message ID
 *                             content:
 *                               type: string
 *                             type:
 *                               type: string
 *                               enum: [text, image, audio, video]
 *                             sender:
 *                               type: object
 *                               properties:
 *                                 username:
 *                                   type: string
 *                                 fullName:
 *                                   type: string
 *                                 profilePicture:
 *                                   type: string
 *                             createdAt:
 *                               type: string
 *                               format: date-time
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.delete("/favorite/:chatId", async (req, res) => {
	try {
		const userId = req.user._id;
		const { chatId } = req.params;

		const chat = await Chat.findById(chatId);

		if (!chat) {
			return res
				.status(404)
				.json({ success: false, message: "Chat not found" });
		}

		chat.favorites = chat.favorites.filter(
			(fav) => fav.user.toString() !== userId.toString()
		);

		await chat.save();

		res.json({ success: true, message: "Chat removed from favorites" });
	} catch (err) {
		console.log("Unfavorite error:", err);
		res
			.status(500)
			.json({ success: false, error: "Failed to remove favorite" });
	}
});

/**
 * @swagger
 * /api/chats/delete/{chatId}:
 *   delete:
 *     summary: Delete (archive) a chat
 *     tags:
 *       - Chats
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
 *         description: Chat deleted
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.delete("/chats/delete/:chatId", async (req, res) => {
	try {
		const { chatId } = req.params;
		const userId = req.user._id;

		// Remove authenticated user from participants
		await Chat.findByIdAndUpdate(chatId, {
			$pull: { participants: { user: userId } },
		});

		return res.status(200).json({
			success: true,
			message: "Chat removed for user",
		});
	} catch (error) {
		console.error("Error deleting chat:", error);
		return res.status(500).json({
			success: false,
			message: "Internal server error",
		});
	}
});


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
router.post(
	"/",
	[
		body("type")
			.isIn(["private", "group"])
			.withMessage("Chat type must be private or group"),
		body("participants")
			.isArray({ min: 1 })
			.withMessage("At least one participant is required"),
		body("participants.*.userId")
			.isMongoId()
			.withMessage("Valid user ID is required for each participant"),
		body("name")
			.optional()
			.isLength({ min: 1, max: 100 })
			.withMessage("Group name must be between 1 and 100 characters"),
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

			const { type, participants, name, description } = req.body;
			const creatorId = req.user._id;

			// Validate participants
			const participantIds = participants.map((p) => p.userId);

			// Check if all participants exist
			const users = await User.find({ _id: { $in: participantIds } });
			if (users.length !== participantIds.length) {
				return res.status(400).json({
					success: false,
					message: "One or more participants not found",
				});
			}

			// For private chats, ensure only 2 participants
			if (type === "private" && participantIds.length !== 2) {
				return res.status(400).json({
					success: false,
					message: "Private chats must have exactly 2 participants",
				});
			}

			// For group chats, ensure creator is included
			if (type === "group" && !participantIds.includes(creatorId.toString())) {
				participantIds.push(creatorId.toString());
			}

			let chat;

			// For private chats, use deterministic ID
			if (type === "private") {
				if (participantIds.length !== 2) {
					return res.status(400).json({
						success: false,
						message: "Private chats must have exactly 2 participants",
					});
				}

				// Generate deterministic chat ID
				const chatId = Chat.generatePrivateChatId(
					participantIds[0],
					participantIds[1]
				);

				// Check if chat already exists
				chat = await Chat.findById(chatId);

				if (chat) {
					// Populate and return existing chat
					await chat.populate(
						"participants.user",
						"username profilePicture isOnline lastSeen"
					);
					return res.status(200).json({
						success: true,
						message: "Chat already exists",
						data: chat,
					});
				}

				// Create new private chat with deterministic ID
				chat = await Chat.create({
					_id: chatId,
					type: "private",
					participants: participantIds.map((userId) => ({
						user: userId,
						role: "participant",
						isActive: true,
						joinedAt: new Date(),
					})),
					unreadCount: new Map(),
				});
			} else {
				// For group chats, generate a unique ID
				const groupChatId = new mongoose.Types.ObjectId().toString();

				chat = await Chat.create({
					_id: groupChatId,
					type: "group",
					name: name,
					description: description,
					participants: participantIds.map((userId) => ({
						user: userId,
						role: userId === creatorId.toString() ? "admin" : "member",
						isActive: true,
						joinedAt: new Date(),
					})),
					createdBy: creatorId,
				});
			}

			// Populate chat with user details
			await chat.populate(
				"participants.user",
				"username profilePicture isOnline lastSeen"
			);
			await chat.populate("createdBy", "username profilePicture");

			res.status(201).json({
				success: true,
				message: "Chat created successfully",
				data: chat,
			});
		} catch (error) {
			console.error("Create chat error:", error);
			res.status(500).json({
				success: false,
				message: "Internal server error",
			});
		}
	}
);

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
router.get("/:chatId", async (req, res) => {
	try {
		const { chatId } = req.params;
		const userId = req.user._id;

		const chat = await Chat.findOne({
			_id: chatId,
			"participants.user": userId,
			"participants.isActive": true,
			isActive: true,
		})
			.populate(
				"participants.user",
				"username profilePicture isOnline lastSeen"
			)
			.populate("lastMessage.message")
			.populate("lastMessage.sender", "username profilePicture")
			.populate("createdBy", "username profilePicture");

		if (!chat) {
			return res.status(404).json({
				success: false,
				message: "Chat not found or access denied",
			});
		}

		res.json({
			success: true,
			data: chat,
		});
	} catch (error) {
		console.error("Get chat error:", error);
		res.status(500).json({
			success: false,
			message: "Internal server error",
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
router.post("/:chatId/read", async (req, res) => {
	try {
		const { chatId } = req.params;
		const userId = req.user._id;

		const chat = await Chat.findOne({
			_id: chatId,
			"participants.user": userId,
			"participants.isActive": true,
			isActive: true,
		});

		if (!chat) {
			return res.status(404).json({
				success: false,
				message: "Chat not found or access denied",
			});
		}

		// Reset unread count for this user
		chat.resetUnreadCount(userId);
		await chat.save();

		res.json({
			success: true,
			message: "Chat marked as read",
			data: {
				chatId,
				unreadCount: 0,
			},
		});
	} catch (error) {
		console.error("Mark chat read error:", error);
		res.status(500).json({
			success: false,
			message: "Internal server error",
		});
	}
});

module.exports = router;
