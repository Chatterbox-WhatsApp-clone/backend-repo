const express = require("express");
const router = express.Router();
const User = require("../models/User");
const FriendRequest = require("../models/FriendRequest");
const { authenticateToken } = require("../middleware/auth");
const mongoose = require("mongoose");

const tempUnfriendSchema = new mongoose.Schema({
	user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
	friend: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
	expiresAt: { type: Date, required: true },
});
tempUnfriendSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
module.exports = mongoose.model("TempUnfriend", tempUnfriendSchema);

const TempUnfriend = mongoose.model("TempUnfriend", tempUnfriendSchema);

/**
 * @swagger
 * /api/friends:
 *   get:
 *     summary: Get your accepted friends and Non mutual friends of your friend
 *     tags:
 *       - Friends
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of friends
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 friends:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       username:
 *                         type: string
 *                       profilePicture:
 *                         type: string
 *       401:
 *         description: Unauthorized
 */
// router.get("/", authenticateToken, async (req, res) => {
// 	try {
// 		const userObjectId = new mongoose.Types.ObjectId(req.user._id);

// 		// Temporarily unfriended users
// 		const tempUnfriends = await TempUnfriend.find({
// 			$or: [{ user: userObjectId }, { friend: userObjectId }],
// 		});
// 		const tempUnfriendIds = tempUnfriends.map((t) =>
// 			t.user.toString() === userObjectId.toString()
// 				? t.friend.toString()
// 				: t.user.toString()
// 		);

// 		// All accepted friend requests for the current user
// 		const requests = await FriendRequest.find({
// 			$or: [

// 				{ sender: userObjectId, status: "accepted" },
// 				{ receiver: userObjectId, status: "accepted" },
// 			],
// 		})
// 			.populate("sender", "-password -blockedUsers -signedUpWithGoogle")
// 			.populate("receiver", "-password -blockedUsers -signedUpWithGoogle");

// 		const validRequests = requests.filter((r) => r.sender && r.receiver);

// 		// Current friends IDs (excluding temp unfriends)
// 		const myFriendIds = validRequests.map((r) =>
// 			r.sender._id.toString() === userObjectId.toString()
// 				? r.receiver._id.toString()
// 				: r.sender._id.toString()
// 		);
// 		const filteredFriendIds = myFriendIds.filter(
// 			(id) => !tempUnfriendIds.includes(id)
// 		);

// 		// Build full friend objects with recent + nonmutual per friend
// 		const friends = [];

// 		const oneWeekAgo = new Date();
// 		oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

// 		for (const r of validRequests) {
// 			const isSender = r.sender._id.toString() === userObjectId.toString();
// 			const friend = isSender ? r.receiver : r.sender;

// 			if (!friend || tempUnfriendIds.includes(friend._id.toString())) continue;

// 			// Get that friend's accepted friends
// 			const friendRequests = await FriendRequest.find({
// 				$or: [
// 					{ sender: friend._id, status: "accepted" },
// 					{ receiver: friend._id, status: "accepted" },
// 				],
// 			})
// 				.populate("sender", "username profilePicture _id createdAt")
// 				.populate(
// 					"receiver",
// 					"username profilePicture _id createdAt updatedAt"
// 				);

// 			const nonMutualSet = new Set();
// 			const nonMutualFriends = [];
// 			const recentFriends = [];

// 			for (const fr of friendRequests) {
// 				if (!fr.sender || !fr.receiver) continue;

// 				const isFriendSender =
// 					fr.sender._id.toString() === friend._id.toString();
// 				const innerFriend = isFriendSender ? fr.receiver : fr.sender;
// 				const innerFriendId = innerFriend._id.toString();

// 				// Skip yourself + your current friends
// 				if (
// 					innerFriendId === userObjectId.toString() ||
// 					filteredFriendIds.includes(innerFriendId)
// 				)
// 					continue;

// 				// Non-mutuals
// 				if (!nonMutualSet.has(innerFriendId)) {
// 					nonMutualSet.add(innerFriendId);
// 					nonMutualFriends.push(innerFriend);
// 				}

// 				// Recently added (within 7 days)
// 				if (fr.updatedAt && fr.updatedAt >= oneWeekAgo) {
// 					recentFriends.push(innerFriend);
// 				}
// 			}

// 			friends.push({
// 				...friend.toObject(),
// 				nonMutualFriends,
// 				recentFriends,
// 			});
// 		}

// 		return res.json({
// 			success: true,
// 			friends, // each friend has its own nonMutualFriends and recentFriends
// 		});
// 	} catch (error) {
// 		console.error("Get friends error:", error);
// 		return res
// 			.status(500)
// 			.json({ success: false, message: "Internal server error" });
// 	}
// });
router.get("/", authenticateToken, async (req, res) => {
	try {
		const userObjectId = new mongoose.Types.ObjectId(req.user._id);

		// 1️⃣ Fetch current user and block relationships
		const currentUser = await User.findById(userObjectId)
			.select("blockedUsers blockedBy")
			.lean();

		const blockedIds = [
			...(currentUser.blockedUsers || []),
			...(currentUser.blockedBy || []),
		].map((id) => id.toString());

		// 2️⃣ Temporarily unfriended users
		const tempUnfriends = await TempUnfriend.find({
			$or: [{ user: userObjectId }, { friend: userObjectId }],
		});

		const tempUnfriendIds = tempUnfriends.map((t) =>
			t.user.toString() === userObjectId.toString()
				? t.friend.toString()
				: t.user.toString()
		);

		// 3️⃣ Find all accepted friend requests for this user
		const requests = await FriendRequest.find({
			$or: [
				{ sender: userObjectId, status: "accepted" },
				{ receiver: userObjectId, status: "accepted" },
			],
		})
			.populate(
				"sender",
				"-password -blockedUsers -blockedBy -signedUpWithGoogle"
			)
			.populate(
				"receiver",
				"-password -blockedUsers -blockedBy -signedUpWithGoogle"
			);

		const validRequests = requests.filter((r) => r.sender && r.receiver);

		// 4️⃣ Your friend IDs (excluding blocked or temp unfriended)
		const myFriendIds = validRequests.map((r) =>
			r.sender._id.toString() === userObjectId.toString()
				? r.receiver._id.toString()
				: r.sender._id.toString()
		);

		const filteredFriendIds = myFriendIds.filter(
			(id) => !tempUnfriendIds.includes(id) && !blockedIds.includes(id)
		);

		// 5️⃣ Date limit for recent friends
		const oneWeekAgo = new Date();
		oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

		// 6️⃣ All friend requests (to track pending or accepted)
		const myRequests = await FriendRequest.find({
			$or: [{ sender: userObjectId }, { receiver: userObjectId }],
		});

		const myPendingOrAcceptedIds = new Set(
			myRequests.flatMap((req) => [
				req.sender.toString(),
				req.receiver.toString(),
			])
		);

		const friends = [];

		// 7️⃣ Loop through valid friends
		for (const r of validRequests) {
			if (!r.sender || !r.receiver) continue;

			const isSender = r.sender._id.toString() === userObjectId.toString();
			const friend = isSender ? r.receiver : r.sender;

			// Skip temp unfriended or blocked users
			if (
				tempUnfriendIds.includes(friend._id.toString()) ||
				blockedIds.includes(friend._id.toString())
			)
				continue;

			// 8️⃣ Fetch this friend’s own friends
			const friendRequests = await FriendRequest.find({
				$or: [
					{ sender: friend._id, status: "accepted" },
					{ receiver: friend._id, status: "accepted" },
				],
			})
				.populate("sender", "username profilePicture _id createdAt updatedAt")
				.populate(
					"receiver",
					"username profilePicture _id createdAt updatedAt"
				);

			const nonMutualSet = new Set();
			const nonMutualFriends = [];
			const recentFriends = [];

			for (const fr of friendRequests) {
				if (!fr.sender || !fr.receiver) continue;

				const isFriendSender =
					fr.sender._id.toString() === friend._id.toString();
				const innerFriend = isFriendSender ? fr.receiver : fr.sender;
				const innerFriendId = innerFriend._id.toString();

				// 🚫 Skip yourself, blocked, or current friends
				if (
					innerFriendId === userObjectId.toString() ||
					filteredFriendIds.includes(innerFriendId) ||
					blockedIds.includes(innerFriendId)
				)
					continue;

				// 🚫 Skip users already in pending/accepted state
				if (myPendingOrAcceptedIds.has(innerFriendId)) continue;

				// ✅ Non-mutual friends
				if (!nonMutualSet.has(innerFriendId)) {
					nonMutualSet.add(innerFriendId);
					nonMutualFriends.push({
						...innerFriend.toObject(),
						status: "not_friends",
					});
				}

				// ✅ Recently added (within 7 days)
				if (fr.updatedAt && fr.updatedAt >= oneWeekAgo) {
					recentFriends.push({
						...innerFriend.toObject(),
						status: "accepted",
					});
				}
			}

			friends.push({
				...friend.toObject(),
				status: "accepted",
				nonMutualFriends,
				recentFriends,
			});
		}

		// ✅ Return clean list
		return res.json({
			success: true,
			friends,
		});
	} catch (error) {
		console.error("Friends error:", error);
		return res
			.status(500)
			.json({ success: false, message: "Internal server error" });
	}
});

/**
 * @swagger
 * /api/friends/available:
 *   get:
 *     summary: Get all users excluding self, pending requests, and accepted friends
 *     tags:
 *       - Friends
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of users per page
 *     responses:
 *       200:
 *         description: List of users excluding self, pending, and accepted friends
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                         example: "68c1c2f02d7e5a113d564491"
 *                       username:
 *                         type: string
 *                         example: "willy"
 *                       profilePicture:
 *                         type: string
 *                         example: "/uploads/profilePics/1757978741075-542345073.jpg"
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     currentPage:
 *                       type: integer
 *                       example: 1
 *                     totalPages:
 *                       type: integer
 *                       example: 5
 *                     totalUsers:
 *                       type: integer
 *                       example: 100
 *                     hasNextPage:
 *                       type: boolean
 *                       example: true
 *                     hasPrevPage:
 *                       type: boolean
 *                       example: false
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/available", authenticateToken, async (req, res) => {
	try {
		const { page = 1, limit = 20 } = req.query;
		const pageInt = parseInt(page);
		const limitInt = parseInt(limit);
		const now = new Date();

		// Fetch all friend requests (pending or accepted)
		const requests = await FriendRequest.find({
			$or: [{ sender: req.user._id }, { receiver: req.user._id }],
			status: { $in: ["pending", "accepted"] },
		});

		// Collect IDs to exclude (already friends or pending)
		const excludedUserIds = requests.map((r) =>
			r.sender.toString() === req.user._id.toString() ? r.receiver : r.sender
		);

		// Add self ID
		excludedUserIds.push(req.user._id.toString());

		// Fetch temp-unfriend records that haven't expired
		const tempRemoved = await TempUnfriend.find({
			user: req.user._id,
			expiresAt: { $gt: now },
		}).select("friend");
		const tempRemovedIds = tempRemoved.map((t) => t.friend.toString());

		// Fetch current user's block data
		const currentUser = await User.findById(req.user._id).select(
			"blockedUsers blockedBy"
		);

		const blockedIds = [
			...currentUser.blockedUsers.map((id) => id.toString()),
			...currentUser.blockedBy.map((id) => id.toString()),
		];

		// Combine all excluded IDs
		const finalExcludedIds = [
			...excludedUserIds,
			...tempRemovedIds,
			...blockedIds,
		];

		// Fetch all users excluding self, friends, blocked, and temp-removed
		let users = await User.find({
			_id: { $nin: finalExcludedIds },
			isActive: true,
		}).lean();

		// Attach status: "pending" for requests just sent
		const nowMs = now.getTime();
		const PENDING_TIMEOUT = 30 * 1000; // 30 seconds

		const usersWithStatus = users.map((u) => {
			const request = requests.find(
				(r) =>
					r.sender.toString() === u._id.toString() ||
					r.receiver.toString() === u._id.toString()
			);

			let status = "not sent";

			if (request) {
				if (
					request.status === "pending" &&
					request.sender.toString() === req.user._id.toString()
				) {
					const sentTime = new Date(request.createdAt).getTime();
					if (nowMs - sentTime <= PENDING_TIMEOUT) {
						status = "pending"; // show pending for 30 secs
					} else {
						status = "not sent";
					}
				}
			}

			return { ...u, status };
		});

		// Filter out users whose pending time expired (they are now excluded)
		const filteredUsers = usersWithStatus.filter(
			(u) => u.status !== "pending" || u.status === "not sent"
		);

		// Shuffle the list randomly
		function shuffle(array) {
			const arr = [...array];
			for (let i = arr.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));
				[arr[i], arr[j]] = [arr[j], arr[i]];
			}
			return arr;
		}
		const shuffledUsers = shuffle(filteredUsers);

		// Apply pagination after shuffle
		const start = (pageInt - 1) * limitInt;
		const paginatedUsers = shuffledUsers.slice(start, start + limitInt);

		res.json({
			success: true,
			data: paginatedUsers,
			pagination: {
				currentPage: pageInt,
				totalPages: Math.ceil(shuffledUsers.length / limitInt),
				totalUsers: shuffledUsers.length,
				hasNextPage: pageInt * limitInt < shuffledUsers.length,
				hasPrevPage: pageInt > 1,
			},
		});
	} catch (error) {
		console.error("Get available users error:", error);
		res.status(500).json({
			success: false,
			message: "Internal server error",
		});
	}
});

/**
 * @swagger
 * /api/friends/request:
 *   post:
 *     summary: Send a friend request to another user
 *     tags:
 *       - Friends
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               receiverId:
 *                 type: string
 *                 description: The userId to send a friend request to
 *     responses:
 *       201:
 *         description: Friend request sent
 *       400:
 *         description: Invalid request or already requested
 *       401:
 *         description: Unauthorized
 */
// Send Friend Request
router.post("/request", authenticateToken, async (req, res) => {
	try {
		const { receiverId } = req.body || {};
		if (!receiverId) {
			return res
				.status(400)
				.json({ success: false, message: "receiverId is required" });
		}

		const receiverIdStr = String(receiverId).replace(/[{}]/g, "");
		if (!mongoose.Types.ObjectId.isValid(receiverIdStr)) {
			return res
				.status(400)
				.json({ success: false, message: "Invalid receiverId" });
		}

		if (receiverIdStr === req.user._id.toString()) {
			return res.status(400).json({
				success: false,
				message: "Cannot send friend request to yourself",
			});
		}

		const userObjectId = new mongoose.Types.ObjectId(req.user._id);
		const receiverObjectId = new mongoose.Types.ObjectId(receiverIdStr);

		// Check for existing pending request
		const existing = await FriendRequest.findOne({
			sender: userObjectId,
			receiver: receiverObjectId,
			status: "pending",
		});
		if (existing) {
			return res
				.status(400)
				.json({ success: false, message: "Friend request already sent" });
		}

		// Check if already friends
		const alreadyFriends = await FriendRequest.findOne({
			$or: [
				{
					sender: userObjectId,
					receiver: receiverObjectId,
					status: "accepted",
				},
				{
					sender: receiverObjectId,
					receiver: userObjectId,
					status: "accepted",
				},
			],
		});
		if (alreadyFriends) {
			return res
				.status(400)
				.json({ success: false, message: "Already friends" });
		}

		// Create the friend request immediately
		const reqDoc = await FriendRequest.create({
			sender: userObjectId,
			receiver: receiverObjectId,
			status: "pending", // mark as pending
		});

		// Fetch the receiver's user info and include status
		const receiverUser = await User.findById(receiverObjectId).lean();
		const userWithStatus = {
			...receiverUser,
			status: "pending",
		};

		return res.status(201).json({
			success: true,
			message: "Friend request sent",
			user: userWithStatus, // return full user info with updated status
		});
	} catch (error) {
		console.error("Send friend request error:", error);
		return res
			.status(500)
			.json({ success: false, message: "Internal server error" });
	}
});

/**
 * @swagger
 * /api/friends/accept:
 *   post:
 *     summary: Accept a friend request
 *     tags:
 *       - Friends
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               requestId:
 *                 type: string
 *                 description: The ID of the friend request to accept
 *     responses:
 *       200:
 *         description: Friend request accepted
 *       404:
 *         description: Request not found
 *       400:
 *         description: Invalid action
 *       401:
 *         description: Unauthorized
 */
router.post("/accept", authenticateToken, async (req, res) => {
	try {
		const { requestId } = req.body || {};

		if (!requestId || !mongoose.Types.ObjectId.isValid(String(requestId))) {
			return res.status(400).json({
				success: false,
				message: "Invalid requestId",
			});
		}

		const request = await FriendRequest.findById(requestId);
		if (!request || request.receiver.toString() !== req.user._id.toString()) {
			return res.status(404).json({
				success: false,
				message: "Request not found or not yours",
			});
		}

		if (request.status !== "pending") {
			return res.status(400).json({
				success: false,
				message: "Request is not pending",
			});
		}

		// ✅ Mark as accepted
		request.status = "accepted";
		request.friendsSince = new Date();
		await request.save();

		// ✅ Add each user to each other's contacts (without overwriting)
		await Promise.all([
			User.updateOne(
				{ _id: request.sender },
				{ $addToSet: { contacts: request.receiver } }
			),
			User.updateOne(
				{ _id: request.receiver },
				{ $addToSet: { contacts: request.sender } }
			),
		]);

		return res.json({
			success: true,
			message: "Friend request accepted and contacts updated",
			request,
		});
	} catch (error) {
		console.error("Accept friend request error:", error);
		return res
			.status(500)
			.json({ success: false, message: "Internal server error" });
	}
});

/**
 * @swagger
 * /api/friends/reject:
 *   post:
 *     summary: Reject a friend request
 *     tags:
 *       - Friends
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               requestId:
 *                 type: string
 *                 description: The ID of the friend request to reject
 *     responses:
 *       200:
 *         description: Friend request rejected
 *       404:
 *         description: Request not found
 *       400:
 *         description: Invalid action
 *       401:
 *         description: Unauthorized
 */
router.post("/reject", authenticateToken, async (req, res) => {
	try {
		const { requestId } = req.body;
		const request = await FriendRequest.findById(requestId);

		if (!request || request.receiver.toString() !== req.user._id.toString()) {
			return res
				.status(404)
				.json({ success: false, message: "Request not found or not yours" });
		}

		if (request.status !== "pending") {
			return res
				.status(400)
				.json({ success: false, message: "Request is not pending" });
		}

		request.status = "rejected";
		await request.save();

		res.json({ success: true, message: "Friend request rejected", request });
	} catch (error) {
		console.error("Reject friend request error:", error);
		res.status(500).json({ success: false, message: "Internal server error" });
	}
});

/**
 * @swagger
 * /friends/search:
 *   get:
 *     summary: Search friends by name
 *     description: Returns a list of friends that match the search query
 *     tags: [Friends]
 *     parameters:
 *       - in: query
 *         name: name
 *         schema:
 *           type: string
 *         required: true
 *         description: Name of the friend to search for
 *     responses:
 *       200:
 *         description: List of matching friends
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 friends:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       email:
 *                         type: string
 *       400:
 *         description: Name query is required
 *       500:
 *         description: Server error
 */
router.get("/search", authenticateToken, async (req, res) => {
	try {
		const userId = req.user._id;
		const { name } = req.query;

		if (!name) {
			return res
				.status(400)
				.json({ success: false, message: "Name query is required" });
		}

		// 1️⃣ Find all accepted friends of the user
		const friends = await FriendRequest.find({
			status: "accepted",
			$or: [{ sender: userId }, { receiver: userId }],
		});

		const friendIds = friends.map((f) =>
			f.sender.toString() === userId.toString() ? f.receiver : f.sender
		);

		// 2️⃣ Get blocked users
		const currentUser = await User.findById(userId).select("blockedUsers");
		const blockedUserIds =
			currentUser?.blockedUsers?.map((id) => id.toString()) || [];

		// 3️⃣ Create one regex to match the full string (case-insensitive)
		const regex = new RegExp(name, "i");

		// 4️⃣ Find friends whose name OR username contains the search string
		const matchedFriends = await User.find({
			_id: {
				$in: friendIds.filter((id) => !blockedUserIds.includes(id.toString())),
			},
			$or: [{ name: regex }, { username: regex }],
		}).select("-password -tokens -__v -blockedUsers -blockedBy");

		if (!matchedFriends.length) {
			return res.status(200).json({
				success: true,
				friends: [],
				message: "No friends found matching your search.",
			});
		}

		res.status(200).json({
			success: true,
			friends: matchedFriends,
			message: "Matching friends found.",
		});
	} catch (err) {
		console.error("Friend search error:", err);
		res.status(500).json({ success: false, message: "Server error" });
	}
});

/**
 * @swagger
 * /api/friends/requests:
 *   get:
 *     summary: Get pending friend requests for the current user
 *     tags:
 *       - Friends
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of pending friend requests
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 requests:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       sender:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                           username:
 *                             type: string
 *                           profilePicture:
 *                             type: string
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       status:
 *                         type: string
 *       401:
 *         description: Unauthorized
 */
router.get("/requests", authenticateToken, async (req, res) => {
	try {
		const userObjectId = new mongoose.Types.ObjectId(req.user._id);
		const requests = await FriendRequest.find({
			receiver: userObjectId,
			status: "pending",
		})
			.populate("sender", "username profilePicture")
			.sort({ createdAt: -1 });
		return res.json({ success: true, requests });
	} catch (error) {
		console.error("Get pending requests error:", error);
		return res
			.status(500)
			.json({ success: false, message: "Internal server error" });
	}
});

/**
 * @swagger
 * /api/friends/online:
 *   get:
 *     summary: Get online friends
 *     tags:
 *       - Friends
 *     description: Returns a list of friends who are currently online, excluding the requesting user.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of currently online friends
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       username:
 *                         type: string
 *                       profilePicture:
 *                         type: string
 *                       status:
 *                         type: string
 *                       lastSeen:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/online", authenticateToken, async (req, res) => {
	try {
		const currentUserId = req.user._id;

		const friendships = await FriendRequest.find({
			status: "accepted",
			$or: [{ sender: currentUserId }, { receiver: currentUserId }],
		});

		const friendIds = friendships.map((f) =>
			f.sender.toString() === currentUserId.toString() ? f.receiver : f.sender
		);

		const oneMinuteAgo = new Date(Date.now() - 60 * 1000);

		const onlineFriends = await User.find({
			_id: { $in: friendIds },
			isOnline: true,
			lastSeen: { $gte: oneMinuteAgo },
		})
			.lean()
			.limit(50);

		res.json({
			success: true,
			data: Array.isArray(onlineFriends) ? onlineFriends : [],
			message:
				onlineFriends.length > 0
					? "Online friends fetched successfully."
					: "None of your friends are online right now.",
		});
	} catch (error) {
		console.error("Get online friends error:", error);
		res.status(500).json({ success: false, message: "Internal server error" });
	}
});

/**
 * @swagger
 * /api/friends/cancel:
 *   post:
 *     summary: Cancel an outgoing friend request
 *     tags:
 *       - Friends
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - receiverId
 *             properties:
 *               receiverId:
 *                 type: string
 *                 description: The userId you sent a request to
 *     responses:
 *       200:
 *         description: Request canceled
 *       400:
 *         description: Invalid input
 *       404:
 *         description: Pending request not found
 *       401:
 *         description: Unauthorized
 */
router.post("/cancel", authenticateToken, async (req, res) => {
	try {
		const { receiverId } = req.body || {};
		if (!receiverId) {
			return res
				.status(400)
				.json({ success: false, message: "receiverId is required" });
		}

		const userObjectId = new mongoose.Types.ObjectId(req.user._id);
		const receiverIdStr = String(receiverId).replace(/[{}]/g, "");
		if (!mongoose.Types.ObjectId.isValid(receiverIdStr)) {
			return res
				.status(400)
				.json({ success: false, message: "Invalid receiverId" });
		}
		const receiverObjectId = new mongoose.Types.ObjectId(receiverIdStr);

		// Delete the *pending* request you (the sender) made to that receiver
		const deleted = await FriendRequest.findOneAndDelete({
			sender: userObjectId,
			receiver: receiverObjectId,
			status: "pending",
		});

		if (!deleted) {
			// Check if maybe it's already accepted (they're friends)
			const existing = await FriendRequest.findOne({
				$or: [
					{ sender: userObjectId, receiver: receiverObjectId },
					{ sender: receiverObjectId, receiver: userObjectId },
				],
			});

			let status = "not sent";
			if (existing) {
				if (existing.status === "accepted") {
					status = "friends";
				} else if (
					existing.status === "pending" &&
					existing.sender.toString() === userObjectId.toString()
				) {
					status = "pending"; // I sent
				} else if (
					existing.status === "pending" &&
					existing.receiver.toString() === userObjectId.toString()
				) {
					status = "received"; // They sent me
				}
			}

			return res.status(404).json({
				success: false,
				message: "Pending friend request not found for this user",
				status,
			});
		}

		// After cancellation, status should always be "not sent"
		return res.json({
			success: true,
			message: "Friend request canceled",
			status: "not sent",
		});
	} catch (error) {
		console.error("Cancel friend request error:", error);
		return res
			.status(500)
			.json({ success: false, message: "Internal server error" });
	}
});

/**
 * @swagger
 * /api/friends/sent:
 *   get:
 *     summary: Get friend requests the current user has sent
 *     tags:
 *       - Friends
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of sent friend requests
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 requests:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       receiver:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                           username:
 *                             type: string
 *                           profilePicture:
 *                             type: string
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       status:
 *                         type: string
 *       401:
 *         description: Unauthorized
 */

router.get("/sent", authenticateToken, async (req, res) => {
	try {
		const now = new Date();
		const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24 hours ago

		const requests = await FriendRequest.find({
			sender: req.user._id,
			$or: [
				// Always include pending requests
				{ status: "pending" },

				// Include accepted requests but only if accepted < 24 hours ago
				{
					status: "accepted",
					updatedAt: { $gte: cutoff },
				},
			],
		})
			.populate("receiver", "username profilePicture")
			.sort({ createdAt: -1 });

		res.json({ requests });
	} catch (error) {
		console.error("Error fetching sent requests:", error);
		res.status(500).json({ success: false, message: "Internal server error" });
	}
});

/**
 * @swagger
 * /api/friends/unfriend/{friendId}:
 *   delete:
 *     summary: Unfriend a user
 *     description: Removes an existing friendship between the authenticated user and the specified friend. The user will no longer appear in the friends list, but messaging is still possible.
 *     tags:
 *       - Friends
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: friendId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the friend to remove
 *     responses:
 *       200:
 *         description: Successfully unfriended the user
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Unfriended successfully
 *       404:
 *         description: Friendship not found
 *       401:
 *         description: Unauthorized
 */

router.delete("/unfriend/:friendId", authenticateToken, async (req, res) => {
	try {
		const { friendId } = req.params;
		const userId = req.user._id;

		if (!mongoose.Types.ObjectId.isValid(friendId)) {
			return res.status(400).json({
				success: false,
				message: "Invalid friendId",
			});
		}

		// Delete ALL friend requests between both users, no matter the status
		const deleted = await FriendRequest.deleteMany({
			$or: [
				{ sender: userId, receiver: friendId },
				{ sender: friendId, receiver: userId },
			],
		});

		if (deleted.deletedCount === 0) {
			return res.status(404).json({
				success: false,
				message: "No friendship found between users",
			});
		}

		return res.json({
			success: true,
			message: "Friendship fully removed",
		});
	} catch (error) {
		console.error("🔥 Unfriend error:", error);
		return res.status(500).json({
			success: false,
			message: "Server error while removing friend",
		});
	}
});

/**
 * @swagger
 * /api/friends/unfriend-temp/{friendId}:
 *   delete:
 *     summary: "Immediately unfriend a user and block re-adding for 7 days"
 *     description: >
 *       This endpoint removes a friend from the authenticated user's friends list immediately.
 *       The removed user cannot be re-added for 7 days.
 *     tags:
 *       - Friends
 *     security:
 *       - bearerAuth: []  # assumes you use JWT
 *     parameters:
 *       - in: path
 *         name: friendId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the friend to remove.
 *     responses:
 *       200:
 *         description: Successfully unfriended and blocked for 7 days
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Unfriended successfully. User cannot be re-added for 7 days."
 *       404:
 *         description: Friendship not found
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
 *                   example: "Friendship not found"
 *       500:
 *         description: Server error
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
 *                   example: "Server error"
 */
router.delete(
	"/unfriend-temp/:friendId",
	authenticateToken,
	async (req, res) => {
		try {
			const { friendId } = req.params;

			if (!mongoose.Types.ObjectId.isValid(friendId)) {
				console.log("Invalid friendId:", friendId);
				return res
					.status(400)
					.json({ success: false, message: "Invalid friendId" });
			}

			const friendObjectId = new mongoose.Types.ObjectId(friendId);
			const currentUserObjectId = new mongoose.Types.ObjectId(req.user._id);

			// Step: create temp unfriend entry (10 days)
			const expiresAt = new Date();
			expiresAt.setDate(expiresAt.getDate() + 10);

			const existing = await TempUnfriend.findOne({
				user: currentUserObjectId,
				friend: friendObjectId,
			});

			if (existing) {
				return res.status(400).json({
					success: false,
					message: "User already temporarily removed",
				});
			}

			await TempUnfriend.create({
				user: currentUserObjectId,
				friend: friendObjectId,
				expiresAt,
			});

			return res.json({
				success: true,
				message:
					"User removed from available friends list temporarily (10 days)",
			});
		} catch (error) {
			console.error("Unfriend-temp error:", error);
			return res.status(500).json({ success: false, message: "Server error" });
		}
	}
);

module.exports = router;
