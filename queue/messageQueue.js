const { Queue } = require("bullmq");
const {createClient} = require("redis")

// Provide BullMQ with a node-redis compatible connection options object
const client = createClient({
	username: "default",
	password: process.env.REDIS_PASSWORD,
	socket: {
		host: process.env.REDIS_HOST,
		port: process.env.REDIS_PORT,
	},
});

// Create the BullMQ queue (BullMQ manages the Redis connections internally)
const messageQueue = new Queue("message-delivery", {
	connection: client,
	defaultJobOptions: {
		attempts: 5,
		backoff: { type: "exponential", delay: 1000 },
		removeOnComplete: true,
		removeOnFail: true,
	},
});

module.exports = { messageQueue, client };
