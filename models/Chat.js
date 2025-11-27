const mongoose = require("mongoose");
const crypto = require("crypto");

const chatSchema = new mongoose.Schema(
	{
		type: {
			type: String,
			enum: ["private", "group"],
			default: "private",
			required: true,
		},

		participants: [
			{
				user: {
					type: mongoose.Schema.Types.ObjectId,
					ref: "User",
					required: true,
				},
				role: {
					type: String,
					enum: ["admin", "member", "participant"],
					default: "participant",
				},
				joinedAt: {
					type: Date,
					default: Date.now,
				},
				isActive: {
					type: Boolean,
					default: true,
				},
			},
		],

		name: {
			type: String,
			trim: true,
			maxlength: 50,
		},

		description: {
			type: String,
			trim: true,
			maxlength: 200,
		},

		groupPicture: {
			type: String,
			default: null,
		},

		createdBy: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
		},

		lastMessage: {
			message: {
				type: mongoose.Schema.Types.ObjectId,
				ref: "Message",
			},
			sender: {
				type: mongoose.Schema.Types.ObjectId,
				ref: "User",
			},
			timestamp: {
				type: Date,
				default: Date.now,
			},
			preview: {
				type: String,
				maxlength: 100,
			},
		},

		unreadCount: {
			type: Map,
			of: Number,
			default: new Map(),
		},

		isActive: {
			type: Boolean,
			default: true,
		},

		settings: {
			onlyAdminsCanSendMessages: {
				type: Boolean,
				default: false,
			},
			onlyAdminsCanEditInfo: {
				type: Boolean,
				default: false,
			},
		},

		pinnedMessages: [
			{
				message: {
					type: mongoose.Schema.Types.ObjectId,
					ref: "Message",
				},
				pinnedBy: {
					type: mongoose.Schema.Types.ObjectId,
					ref: "User",
				},
				pinnedAt: {
					type: Date,
					default: Date.now,
				},
			},
		],

		// ⭐️ FAVORITE CHATS (WHATSAPP STYLE)
		favorites: [
			{
				user: {
					type: mongoose.Schema.Types.ObjectId,
					ref: "User",
					required: true,
				},
				addedAt: {
					type: Date,
					default: Date.now,
				},
			},
		],
	},
	{ timestamps: true }
);

// Indexes
chatSchema.index({ "participants.user": 1 });
chatSchema.index({ type: 1 });
chatSchema.index({ "lastMessage.timestamp": -1 });
chatSchema.index({ "favorites.user": 1 }); // ⭐️ fast favorite lookup

// Virtual for active participants
chatSchema.virtual("participantCount").get(function () {
	return this.participants.filter((p) => p.isActive).length;
});

// Instance methods
chatSchema.methods.isParticipant = function (userId) {
	return this.participants.some(
		(p) => p.user.toString() === userId.toString() && p.isActive
	);
};

chatSchema.methods.addParticipant = function (userId, role = "participant") {
	if (!this.isParticipant(userId)) {
		this.participants.push({
			user: userId,
			role,
			joinedAt: new Date(),
			isActive: true,
		});
	}
};

chatSchema.methods.resetUnreadCount = function (userId) {
	this.unreadCount.set(userId.toString(), 0);
};

// Update last message helper
chatSchema.methods.updateLastMessage = function (message, sender, preview) {
	this.lastMessage = {
		message: message._id,
		sender: sender._id ? sender._id : sender,
		timestamp: new Date(),
		preview:
			preview ||
			(message.type === "text"
				? message.content?.text?.slice(0, 100)
				: `📎 ${message.type}`),
	};
	this.updatedAt = new Date();
};

// Increment unread count
chatSchema.methods.incrementUnreadCount = function (senderId) {
	if (!this.unreadCount) {
		this.unreadCount = new Map();
	}

	this.participants.forEach((p) => {
		const uid = p.user.toString();
		if (uid !== senderId.toString() && p.isActive) {
			const current = this.unreadCount.get(uid) || 0;
			this.unreadCount.set(uid, current + 1);
		}
	});
};

// Deterministic ObjectId for private chats
chatSchema.statics.generatePrivateChatId = function (userId1, userId2) {
	const [a, b] = [userId1.toString(), userId2.toString()].sort();
	const hex = crypto
		.createHash("sha1")
		.update(`${a}:${b}`)
		.digest("hex")
		.slice(0, 24);
	return new mongoose.Types.ObjectId(hex);
};

// Serialize virtuals
chatSchema.set("toJSON", { virtuals: true });

module.exports = mongoose.model("Chat", chatSchema);
