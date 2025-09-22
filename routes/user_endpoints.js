/**
 * @swagger
 * /api/users/{userId}/friends:
 *   get:
 *     summary: Get friends of a specific user
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: The user ID to get friends for
 *     responses:
 *       200:
 *         description: List of user's friends
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 *       500:
 *         description: Internal server error
 */
// @route   GET /api/users/:userId/friends
// @desc    Get friends of a specific user
// @access  Private
router.get("/:userId/friends", authenticateToken, async (req, res) => {
try {
const { userId } = req.params;

// Validate ObjectId
if (!mongoose.Types.ObjectId.isValid(userId)) {
return res.status(400).json({
success: false,
message: "Invalid user ID format",
});
}

// Check if user exists
const user = await User.findById(userId).select("username");
if (!user) {
return res.status(404).json({
success: false,
message: "User not found",
});
}

// Get friend requests where the user is either sender or receiver and status is accepted
const FriendRequest = require("../models/FriendRequest");
const friendRequests = await FriendRequest.find({
$or: [
{ sender: userId, status: "accepted" },
{ receiver: userId, status: "accepted" },
],
});

// Extract friend IDs (exclude the current user)
const friendIds = friendRequests.map((request) => {
return request.sender.toString() === userId
? request.receiver
: request.sender;
});

// Get friend details with lastSeen and isOnline
const friends = await User.find({ _id: { $in: friendIds } })
.select("username profilePicture status isOnline lastSeen email")
.sort({ isOnline: -1, lastSeen: -1 }); // Online friends first, then by last seen

res.json({
success: true,
data: friends,
});
} catch (error) {
console.error("Get user friends error:", error);
res.status(500).json({
success: false,
message: "Internal server error",
});
}
});

/**
 * @swagger
 * /api/users/search/enhanced:
 *   get:
 *     summary: Enhanced search users by username or email
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 2
 *         description: Search query for username or email
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Maximum number of results
 *     responses:
 *       200:
 *         description: List of matching users
 *       400:
 *         description: Invalid or too-short query
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
// @route   GET /api/users/search/enhanced
// @desc    Enhanced search users by username or email
// @access  Private
router.get("/search/enhanced", authenticateToken, async (req, res) => {
try {
const { q: query, limit = 20 } = req.query;

if (!query || query.trim().length < 2) {
return res.status(400).json({
success: false,
message: "Search query must be at least 2 characters long",
});
}

const searchRegex = new RegExp(query.trim(), "i");
const limitInt = parseInt(limit);

// Search in both username and email fields
const users = await User.find({
$and: [
{
$or: [
{ username: searchRegex },
{ email: searchRegex },
],
},
{ _id: { $ne: req.user._id } }, // Exclude current user
{ isActive: true },
],
})
.select("username email profilePicture status isOnline lastSeen")
.sort({ isOnline: -1, lastSeen: -1 }) // Online users first
.limit(limitInt);

res.json({
success: true,
data: users,
});
} catch (error) {
console.error("Enhanced search users error:", error);
res.status(500).json({
success: false,
message: "Internal server error",
});
}
});
