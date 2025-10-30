const { Worker, QueueEvents, JobsOptions } = require("bullmq");
const Message = require("../models/Message");
const Chat = require("../models/Chat");
const { io } = require("../server");
const { client, messageQueue } = require("./messageQueue");

// Ensure a queue events to observe failures etc.
const queueEvents = new QueueEvents("message-delivery", { connection: client });
queueEvents.on("failed", ({ jobId, failedReason }) => {
	console.error(`Message job ${jobId} failed:`, failedReason);
});
queueEvents.on("completed", ({ jobId }) => {
	// noop for now
});

// Worker to deliver messages
const worker = new Worker(
	"message-delivery",
	async (job) => {
		const { messageId } = job.data;

		const message = await Message.findById(messageId)
			.populate("sender", "username profilePicture")
			.populate("replyTo", "content type sender");

		if (!message || message.isDeleted) {
			return;
		}

		const chat = await Chat.findById(message.chat);
		if (!chat) return;

		// Emit to all chat participants except the sender
		const participants = chat.participants || [];
		const payload = {
			_id: message._id,
			chat: message.chat,
			sender: message.sender,
			type: message.type,
			content: message.content,
			replyTo: message.replyTo,
			createdAt: message.createdAt,
		};

		for (const p of participants) {
			const userId = p.user?.toString();
			if (!userId) continue;
			// Join pattern in socketHandler should put sockets in a room per userId
			// So we emit to that user room
			io.to(`user:${userId}`).emit("message:new", payload);
		}

		return true;
	},
	{ connection: client }
);

worker.on("failed", (job, err) => {
	console.error("Worker failed for job", job?.id, err?.message);
});

module.exports = worker;
