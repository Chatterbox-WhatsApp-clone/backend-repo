const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
	{
		username: {
			type: String,
			required: [true, "Username is required"],
			unique: true,
			trim: true,
			minlength: [3, "Username must be at least 3 characters long"],
			maxlength: [20, "Username cannot exceed 20 characters"],
		},

		email: {
			type: String,
			required: [true, "Email is required"],
			unique: true,
			lowercase: true,
			trim: true,
			match: [
				/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
				"Please enter a valid email",
			],
		},

		password: {
			type: String,
			required: [true, "Password is required"],
			minlength: [6, "Password must be at least 6 characters long"],
		},

		profilePicture: { type: String, default: null },

		backgroundImage: {
			type: String,
			default: "",
			trim: true,
		},

		bio: {
			type: String,
			default: "Hey there! I'm using Chatterbox",
			maxlength: [500, "Bio cannot exceed 500 characters"],
		},

		dateJoined: {
			type: String,
			default: () => {
				const now = new Date();
				return now.toLocaleDateString("en-US", {
					year: "numeric",
					month: "long",
					day: "numeric",
				});
			},
		},

		contacts: [
			{ type: mongoose.Schema.Types.ObjectId, ref: "User", default: [] },
		],

		blockedUsers: [
			{ type: mongoose.Schema.Types.ObjectId, ref: "User", default: [] },
		],
		blockedBy: [
			{ type: mongoose.Schema.Types.ObjectId, ref: "User", default: [] },
		],

		status: { type: String, default: "Hey there! I'm using Chatterbox." },

		isOnline: { type: Boolean, default: false },

		lastSeen: { type: Date, default: Date.now },

		phoneNumber: { type: String, default: null },

		isVerified: { type: Boolean, default: false },

		signedUpWithGoogle: { type: Boolean, default: false },

		authProvider: { type: String, default: "email" },

		phoneVerified: { type: Boolean, default: false },
	},
	{ timestamps: true }
);
// Indexes
userSchema.index({ email: 1 });
userSchema.index({ username: 1 });
userSchema.index({ phoneNumber: 1 });

// Hash password before saving
userSchema.pre("save", async function (next) {
	if (!this.isModified("password")) return next();
	try {
		const salt = await bcrypt.genSalt(12);
		this.password = await bcrypt.hash(this.password, salt);
		next();
	} catch (error) {
		next(error);
	}
});

// Compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
	return await bcrypt.compare(candidatePassword, this.password);
};

// Virtuals
userSchema.virtual("totalContacts").get(function () {
	return this.contacts ? this.contacts.length : 0;
});

userSchema.virtual("totalBlocked").get(function () {
	return this.blockedUsers ? this.blockedUsers.length : 0;
});

userSchema.virtual("fullName").get(function () {
	return this.username;
});

// Full profile method
userSchema.methods.getFullProfile = async function () {
	const user = await this.populate([
		{ path: "contacts", select: "username profilePicture" },
		{ path: "blockedUsers", select: "username profilePicture" },
	]);

	return {
		_id: user._id,
		username: user.username,
		email: user.email,
		profilePicture: user.profilePicture,
		backgroundImage: user.backgroundImage,
		bio: user.bio,
		dateJoined: user.dateJoined, // ✅ uses formatted string from DB
		status: user.status,
		isOnline: user.isOnline,
		lastSeen: user.lastSeen,
		phoneNumber: user.phoneNumber,
		isVerified: user.isVerified,
		signedUpWithGoogle: user.signedUpWithGoogle,
		authProvider: user.authProvider,
		phoneVerified: user.phoneVerified,
		createdAt: user.createdAt,
		totalContacts: user.contacts.length,
		contacts: user.contacts,
		totalBlocked: user.blockedUsers.length,
		blockedUsers: user.blockedUsers,
	};
};

// Ensure virtuals are serialized
userSchema.set("toJSON", {
	virtuals: true,
	transform: function (doc, ret) {
		delete ret.verificationToken;
		delete ret.resetPasswordToken;
		delete ret.resetPasswordExpires;
		return ret;
	},
});

// Block / Unblock / Check / Online status methods
userSchema.methods.blockUser = async function (userIdToBlock) {
	const userIdStr = userIdToBlock.toString();

	// Already blocked?
	if (!this.blockedUsers.some((id) => id.toString() === userIdStr)) {
		this.blockedUsers.push(userIdToBlock);

		// Remove from contacts
		this.contacts = this.contacts.filter(
			(contactId) => contactId.toString() !== userIdStr
		);

		// Also update the other user's "blockedBy"
		const targetUser = await this.model("User").findById(userIdToBlock);
		if (targetUser && !targetUser.blockedBy.includes(this._id)) {
			targetUser.blockedBy.push(this._id);

			// Remove current user from their contacts too
			targetUser.contacts = targetUser.contacts.filter(
				(contactId) => contactId.toString() !== this._id.toString()
			);

			await targetUser.save();
		}

		await this.save();
	}

	return this;
};


// Unblock a user
userSchema.methods.unblockUser = async function (userIdToUnblock) {
	const userIdStr = userIdToUnblock.toString();

	this.blockedUsers = this.blockedUsers.filter(
		(id) => id.toString() !== userIdStr
	);

	const targetUser = await this.model("User").findById(userIdToUnblock);
	if (targetUser) {
		targetUser.blockedBy = targetUser.blockedBy.filter(
			(id) => id.toString() !== this._id.toString()
		);
		await targetUser.save();
	}

	await this.save();
	return this;
};


// Check if blocked
userSchema.methods.isBlocked = function (userId) {
	const userIdStr = userId.toString();
	return this.blockedUsers.some((id) => id.toString() === userIdStr);
};

userSchema.methods.setOnline = async function () {
	this.isOnline = true;
	this.lastSeen = new Date();
	await this.save();
};

userSchema.methods.setOffline = async function () {
	this.isOnline = false;
	this.lastSeen = new Date();
	await this.save();
};

module.exports = mongoose.model("User", userSchema);
