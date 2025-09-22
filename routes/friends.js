const express = require("express");
const router = express.Router();
const User = require("../models/User");
const FriendRequest = require("../models/FriendRequest");
const authenticateToken = require("../middleware/authenticateToken");

/**
 * @swagger
 * /api/friends:
 *   get:
 *     summary: Get all users except self, friends, and pending requests
 *     tags:
 *       - Users
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
 *         description: List of users with pagination
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
 *         description: Unauthorized - token missing or invalid
 *       500:
 *         description: Internal server error
 */
router.get("/", authenticateToken, async (req, res) => {
	try {
		const { page = 1, limit = 20 } = req.query;

		const pageInt = parseInt(page);
		const limitInt = parseInt(limit);

		// Find all friend requests (pending or accepted) involving this user
		const requests = await FriendRequest.find({
			$or: [{ sender: req.user._id }, { receiver: req.user._id }],
			status: { $in: ["pending", "accepted"] },
		});

		// Collect user IDs that should be excluded (already friends or pending)
		const blockedUserIds = requests.map((r) =>
			r.sender.toString() === req.user._id.toString() ? r.receiver : r.sender
		);

		// Also exclude the logged-in user
		blockedUserIds.push(req.user._id);

		// Fetch users excluding those blocked IDs
		const users = await User.find({
			_id: { $nin: blockedUserIds },
			isActive: true,
		})
			.skip((pageInt - 1) * limitInt)
			.limit(limitInt);

		const total = await User.countDocuments({
			_id: { $nin: blockedUserIds },
			isActive: true,
		});

		res.json({
			success: true,
			data: users,
			pagination: {
				currentPage: pageInt,
				totalPages: Math.ceil(total / limitInt),
				totalUsers: total,
				hasNextPage: pageInt * limitInt < total,
				hasPrevPage: pageInt > 1,
			},
		});
	} catch (error) {
		console.error("Get users error:", error);
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
router.post("/request", authenticateToken, async (req, res) => {
	const { receiverId } = req.body;
	if (!receiverId) {
		return res
			.status(400)
			.json({ success: false, message: "receiverId is required" });
	}
	if (receiverId === req.user._id.toString()) {
		return res.status(400).json({
			success: false,
			message: "Cannot send friend request to yourself",
		});
	}
	const existing = await FriendRequest.findOne({
		sender: req.user._id,
		receiver: receiverId,
		status: "pending",
	});
	if (existing) {
		return res
			.status(400)
			.json({ success: false, message: "Friend request already sent" });
	}
	const alreadyFriends = await FriendRequest.findOne({
		$or: [
			{ sender: req.user._id, receiver: receiverId, status: "accepted" },
			{ sender: receiverId, receiver: req.user._id, status: "accepted" },
		],
	});
	if (alreadyFriends) {
		return res.status(400).json({ success: false, message: "Already friends" });
	}
	const reqDoc = await FriendRequest.create({
		sender: req.user._id,
		receiver: receiverId,
	});
	res
		.status(201)
		.json({ success: true, message: "Friend request sent", request: reqDoc });
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
	request.status = "accepted";
	await request.save();
	res.json({ success: true, message: "Friend request accepted", request });
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
	const { friendId } = req.params;
	const userId = req.user._id;

	const friendship = await FriendRequest.findOneAndDelete({
		$or: [
			{ sender: userId, receiver: friendId, status: "accepted" },
			{ sender: friendId, receiver: userId, status: "accepted" },
		],
	});

	if (!friendship) {
		return res
			.status(404)
			.json({ success: false, message: "Friendship not found" });
	}

	res.json({ success: true, message: "Unfriended successfully" });
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
	// Friend requests where current user is the receiver & status is pending
	const requests = await FriendRequest.find({
		receiver: req.user._id,
		status: "pending",
	})
		.populate("sender", "username profilePicture")
		.sort({ createdAt: -1 });
	res.json({ requests });
});

/**
 * @swagger
 * /api/friends:
 *   get:
 *     summary: Get your accepted friends
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
router.get("/", authenticateToken, async (req, res) => {
	// Friends: requests where user is sender or receiver and status is accepted
	const requests = await FriendRequest.find({
		$or: [
			{ sender: req.user._id, status: "accepted" },
			{ receiver: req.user._id, status: "accepted" },
		],
	});
	// Find friend user ids
	const friendIds = requests.map((r) =>
		r.sender.toString() === req.user._id.toString() ? r.receiver : r.sender
	);
	const friends = await User.find({ _id: { $in: friendIds } }).select(
		"username profilePicture"
	);
	res.json({ friends });
});

module.exports = router;
