// socketHandler.js
const path = require("path");
const fs = require("fs");
const jwt = require("jsonwebtoken");

const User = require("../models/User");
const Chat = require("../models/Chat");
const Message = require("../models/Message");
const callHandlerFactory = require("./callHandler"); // your call handler module (re-used)

const socketHandler = (io) => {
	const userSockets = new Map(); // userId -> socketId
	const userChats = new Map(); // userId -> Set(chatId)
	const callHandler = callHandlerFactory(io);

	const joinUserChats = async (socket, userId) => {
		try {
			const chats = await Chat.find({
				"participants.user": userId,
				"participants.isActive": true,
				isActive: true,
			}).select("_id");

			userChats.set(userId, new Set());
			chats.forEach((c) => {
				const id = c._id.toString();
				socket.join(id);
				userChats.get(userId).add(id);
			});
		} catch (err) {
			console.error("joinUserChats error:", err);
		}
	};

	const saveMediaFile = (filename, base64Buffer) => {
		try {
			const uploadsPath = path.join(__dirname, "..", "uploads");
			if (!fs.existsSync(uploadsPath))
				fs.mkdirSync(uploadsPath, { recursive: true });
			const safeName = filename.replace(/[^a-zA-Z0-9_\-\.]/g, "_");
			const filePath = path.join(uploadsPath, safeName);
			fs.writeFileSync(filePath, Buffer.from(base64Buffer, "base64"));
			return `/uploads/${safeName}`;
		} catch (err) {
			console.error("saveMediaFile error:", err);
			return null;
		}
	};

	io.on("connection", (socket) => {
		console.log("🔌 Socket connected:", socket.id);

		// -------------------------- AUTHENTICATION --------------------------
		socket.on("authenticate", async ({ userId, token }) => {
			try {
				if (!token)
					return socket.emit("authentication_error", {
						message: "Token required",
					});

				let decoded;
				try {
					decoded = jwt.verify(token, process.env.JWT_SECRET);
				} catch (err) {
					return socket.emit("authentication_error", {
						message: "Invalid token",
					});
				}

				if (!decoded || decoded.userId !== userId)
					return socket.emit("authentication_error", {
						message: "Token user mismatch",
					});

				socket.userId = userId;
				userSockets.set(userId, socket.id);

				await User.findByIdAndUpdate(userId, {
					isOnline: true,
					lastSeen: new Date(),
				});
				await joinUserChats(socket, userId);

				socket.broadcast.emit("user_online", { userId });
				socket.emit("authenticated", { success: true });
				console.log(`✅ Socket authenticated for user ${userId}`);
			} catch (err) {
				console.error("authenticate error:", err);
				socket.emit("authentication_error", {
					message: "Authentication failed",
				});
			}
		});

		// -------------------------- JOIN / LEAVE CHAT --------------------------
		socket.on("join_chat", async ({ chatId }) => {
			if (!socket.userId)
				return socket.emit("join_error", { message: "Not authenticated" });
			if (!chatId) return;
			socket.join(chatId);
			if (!userChats.has(socket.userId))
				userChats.set(socket.userId, new Set());
			userChats.get(socket.userId).add(chatId);
			console.log(`👥 ${socket.userId} joined chat ${chatId}`);
		});

		socket.on("leave_chat", ({ chatId }) => {
			if (!socket.userId || !chatId) return;
			socket.leave(chatId);
			if (userChats.has(socket.userId))
				userChats.get(socket.userId).delete(chatId);
			console.log(`👋 ${socket.userId} left chat ${chatId}`);
		});

		// -------------------------- SEND MESSAGE --------------------------
		socket.on("send_message", async (data) => {
			try {
				const senderId = socket.userId;
				if (!senderId)
					return socket.emit("message_error", { message: "Not authenticated" });

				let { chatId, content, type = "text", media, receiverId } = data;
				const mongoose = require("mongoose");
				const isValidObjectId = (id) =>
					mongoose.Types.ObjectId.isValid(id || "");
				let chat =
					chatId && isValidObjectId(chatId)
						? await Chat.findById(chatId)
						: null;

				if (!chat) {
					if (!receiverId)
						return socket.emit("message_error", {
							message: "Chat not found & receiverId missing",
						});
					chat = await Chat.findOne({
						isActive: true,
						participants: {
							$all: [
								{ $elemMatch: { user: senderId, isActive: true } },
								{ $elemMatch: { user: receiverId, isActive: true } },
							],
						},
					});
					if (!chat) {
						chat = new Chat({
							participants: [
								{ user: senderId, isActive: true },
								{ user: receiverId, isActive: true },
							],
							isActive: true,
						});
						await chat.save();
					}
					chatId = chat._id.toString();
				}

				if (
					!chat.participants.some(
						(p) => p.user.toString() === senderId && p.isActive
					)
				)
					return socket.emit("message_error", {
						message: "Not a participant of this chat",
					});

				const messageData = {
					chat: chatId,
					sender: senderId,
					type,
					content: {},
					createdAt: new Date(),
				};

				if (type === "text") messageData.content.text = content;
				if (media && media.filename && media.base64) {
					const mediaUrl = saveMediaFile(media.filename, media.base64);
					messageData.content.media = {
						url: mediaUrl,
						filename: media.filename,
						mimeType: media.mimeType || "",
						size: media.size || 0,
					};
				}

				const message = new Message(messageData);
				await message.save();
				await message.populate("sender", "username profilePicture");

				chat.lastMessage = message._id;
				chat.updatedAt = new Date();
				await chat.save();

				socket.to(chatId).emit("new_message", { chatId, message });
				socket.emit("message_sent", { chatId, message });
				console.log(`💬 [${chatId}] ${senderId} -> saved & emitted`);
			} catch (err) {
				console.error("send_message error:", err);
				socket.emit("message_error", { message: "Failed to send message" });
			}
		});

		// -------------------------- MESSAGE DELIVERED --------------------------
		socket.on("message_delivered", async ({ messageId }) => {
			try {
				const userId = socket.userId;
				if (!userId) return;

				const message = await Message.findById(messageId).select("sender chat");
				if (!message) return;

				await Message.findByIdAndUpdate(messageId, {
					$addToSet: { deliveredTo: userId },
				});
				const senderSocketId = userSockets.get(message.sender.toString());
				if (senderSocketId)
					io.to(senderSocketId).emit("message_delivered", {
						messageId,
						deliveredTo: [userId],
					});
			} catch (err) {
				console.error("message_delivered handler error:", err);
			}
		});

		// -------------------------- MESSAGE READ --------------------------
		socket.on("message_read", async ({ messageId }) => {
			try {
				const userId = socket.userId;
				if (!userId) return;

				const message = await Message.findById(messageId).select("sender chat");
				if (!message) return;

				await Message.findByIdAndUpdate(messageId, {
					$addToSet: { readBy: { user: userId, at: new Date() } },
				});
				const senderSocketId = userSockets.get(message.sender.toString());
				if (senderSocketId)
					io.to(senderSocketId).emit("message_read", {
						messageId,
						readBy: userId,
						readAt: new Date(),
					});
			} catch (err) {
				console.error("message_read handler error:", err);
			}
		});

		// -------------------------- TYPING INDICATORS --------------------------
		socket.on("typing_start", ({ chatId }) => {
			if (!socket.userId || !chatId) return;
			socket
				.to(chatId)
				.emit("user_typing", { userId: socket.userId, chatId, isTyping: true });
		});

		socket.on("typing_stop", ({ chatId }) => {
			if (!socket.userId || !chatId) return;
			socket.to(chatId).emit("user_typing", {
				userId: socket.userId,
				chatId,
				isTyping: false,
			});
		});

		// -------------------------- DISCONNECT --------------------------
		socket.on("disconnect", async () => {
			try {
				const userId = socket.userId;
				if (userId) {
					userSockets.delete(userId);
					userChats.delete(userId);
					await User.findByIdAndUpdate(userId, {
						isOnline: false,
						lastSeen: new Date(),
					});
					socket.broadcast.emit("user_offline", { userId });
				}
				console.log("🔌 Socket disconnected:", socket.id);
			} catch (err) {
				console.error("disconnect handler error:", err);
			}
		});
	});

	return {
		getUserSockets: () => userSockets,
		getUserChats: () => userChats,
		getCallHandler: () => callHandler,
	};
};

module.exports = socketHandler;
