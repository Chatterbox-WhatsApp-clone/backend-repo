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
		profilePicture: {
			type: String,
			default: null,
		},
		status: {
			type: String,
			default: "Hey there. I'm using chatterbox!",
			maxlength: [100, "Status cannot exceed 100 characters"],
		},
		isActive: { type: Boolean, default: true },
		isOnline: { type: Boolean, default: false },
		lastSeen: { type: Date, default: Date.now },
		phoneNumber: {
			type: String,
			unique: true,
			sparse: true,
			match: [/^\+?[\d\s-()]+$/, "Please enter a valid phone number"],
		},
		contacts: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
		blockedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
		isVerified: { type: Boolean, default: false },
		verificationToken: String,
		resetPasswordToken: String,
		resetPasswordExpires: Date,
		signedUpWithGoogle: { type: Boolean, default: false },
		authProvider: { type: String, enum: ["local", "google"], default: "local" },
		phoneVerified: { type: Boolean, default: false },
		phoneVerificationCode: String,
		phoneVerificationExpires: Date,
	},
	{
		timestamps: true,
	}
);

// Indexes for better performance
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

// Virtuals for counts
userSchema.virtual("totalContacts").get(function () {
	return this.contacts ? this.contacts.length : 0;
});

userSchema.virtual("totalBlocked").get(function () {
	return this.blockedUsers ? this.blockedUsers.length : 0;
});

// Method to get public profile with counts and populated lists
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

// Virtual for full name
userSchema.virtual("fullName").get(function () {
	return this.username;
});

// Ensure virtual fields are serialized
userSchema.set("toJSON", {
	virtuals: true,
	transform: function (doc, ret) {
		delete ret.verificationToken;
		delete ret.resetPasswordToken;
		delete ret.resetPasswordExpires;
		return ret;
	},
});

module.exports = mongoose.model("User", userSchema);

// Block a user
userSchema.methods.blockUser = async function (userIdToBlock) {
	if (!this.blockedUsers.includes(userIdToBlock)) {
		this.blockedUsers.push(userIdToBlock);
		// also remove them from contacts if present
		this.contacts = this.contacts.filter(
			(contactId) => contactId.toString() !== userIdToBlock.toString()
		);
		await this.save();
	}
	return this;
};

// Unblock a user
userSchema.methods.unblockUser = async function (userIdToUnblock) {
	this.blockedUsers = this.blockedUsers.filter(
		(id) => id.toString() !== userIdToUnblock.toString()
	);
	await this.save();
	return this;
};

// Check if a user is blocked
userSchema.methods.isBlocked = function (userId) {
	return this.blockedUsers.some((id) => id.toString() === userId.toString());
};

// Mark user as online
userSchema.methods.setOnline = async function () {
	this.isOnline = true;
	this.lastSeen = new Date();
	await this.save();
};

// Mark user as offline
userSchema.methods.setOffline = async function () {
	this.isOnline = false;
	this.lastSeen = new Date();
	await this.save();
};
