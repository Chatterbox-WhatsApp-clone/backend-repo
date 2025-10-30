const mongoose = require("mongoose");

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
			maxlength: [50, "Chat name cannot exceed 50 characters"],
		},
		description: {
			type: String,
			trim: true,
			maxlength: [200, "Chat description cannot exceed 200 characters"],
		},
		groupPicture: {
			type: String,
			default: null,
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
				maxlength: [100, "Message preview cannot exceed 100 characters"],
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
	},
	{
		timestamps: true,
	}
);

// Indexes for better query performance
chatSchema.index({ "participants.user": 1 });
chatSchema.index({ type: 1 });
chatSchema.index({ "lastMessage.timestamp": -1 });

// Virtual for participant count
chatSchema.virtual("participantCount").get(function () {
	return this.participants.filter((p) => p.isActive).length;
});

// Method to check if user is participant
chatSchema.methods.isParticipant = function (userId) {
	return this.participants.some(
		(p) => p.user.toString() === userId.toString() && p.isActive
	);
};

// Method to check if user is admin
chatSchema.methods.isAdmin = function (userId) {
	return this.participants.some(
		(p) =>
			p.user.toString() === userId.toString() &&
			p.role === "admin" &&
			p.isActive
	);
};

// Method to add participant
chatSchema.methods.addParticipant = function (userId, role = "participant") {
	if (!this.isParticipant(userId)) {
		this.participants.push({
			user: userId,
			role: role,
			joinedAt: new Date(),
			isActive: true,
		});
	}
};

// Method to remove participant
chatSchema.methods.removeParticipant = function (userId) {
	const participant = this.participants.find(
		(p) => p.user.toString() === userId.toString()
	);
	if (participant) {
		participant.isActive = false;
	}
};

// Method to update last message
chatSchema.methods.updateLastMessage = function (message, sender, preview) {
	this.lastMessage = {
		message: message._id,
		sender: sender._id,
		timestamp: new Date(),
		preview: preview,
	};
};

// Method to increment unread count for all participants except sender
chatSchema.methods.incrementUnreadCount = function (senderId) {
	this.participants.forEach((participant) => {
		if (
			participant.user.toString() !== senderId.toString() &&
			participant.isActive
		) {
			const currentCount =
				this.unreadCount.get(participant.user.toString()) || 0;
			this.unreadCount.set(participant.user.toString(), currentCount + 1);
		}
	});
};

// Method to reset unread count for a user
chatSchema.methods.resetUnreadCount = function (userId) {
	this.unreadCount.set(userId.toString(), 0);
};

// Ensure virtual fields are serialized
chatSchema.set("toJSON", {
	virtuals: true,
});

module.exports = mongoose.model("Chat", chatSchema);
