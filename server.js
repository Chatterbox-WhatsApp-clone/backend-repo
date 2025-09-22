const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

// Swagger imports
const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
	cors: {
		origin: process.env.FRONTEND_URL || "http://localhost:3007",
		methods: ["GET", "POST"],
	},
});

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
	fs.mkdirSync(uploadsDir, { recursive: true });
}

// Import routes
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const chatRoutes = require("./routes/chats");
const messageRoutes = require("./routes/messages");
const callRoutes = require("./routes/calls");
const friendsRoutes = require("./routes/friends");
const voiceNotesRoutes = require("./routes/voicenotes");

// Import middleware
const { authenticateToken } = require("./middleware/auth");
const errorHandler = require("./middleware/errorHandler");

// Import socket handlers
const socketHandler = require("./socket/socketHandler");

// Verify SMTP configuration once at startup (non-blocking)
try {
	const { verifyEmailTransporter } = require("./utils/email");
	verifyEmailTransporter();
} catch (e) {
	console.warn("⚠️  Email module not available or verification failed to run.");
}

// Connect to MongoDB
mongoose
	.connect(
		process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/whatsapp-clone",
		{
			useNewUrlParser: true,
			useUnifiedTopology: true,
		}
	)
	.then(() => console.log("✅ Connected to MongoDB"))
	.catch((err) => console.error("❌ MongoDB connection error:", err));

// Middleware
app.use(helmet());
app.use(
	cors({
		origin: process.env.FRONTEND_URL || "http://localhost:3007",
		credentials: true,
	})
);

// Rate limiting
const limiter = rateLimit({
	windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
	max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
	message: "Too many requests from this IP, please try again later.",
});
app.use("/api/", limiter);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Serve uploaded files statically
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Swagger setup
const PORT = process.env.PORT || 50001;
const swaggerOptions = {
	swaggerDefinition: {
		openapi: "3.0.0",
		info: {
			title: "WhatsApp Clone API",
			version: "1.0.0",
			description: "Backend API documentation for WhatsApp Clone project",
		},
		servers: [
			{
				url: `http://localhost:${PORT}`,
			},
		],
		components: {
			securitySchemes: {
				bearerAuth: {
					type: "http",
					scheme: "bearer",
					bearerFormat: "JWT",
				},
			},
		},
	},
	apis: [
		path.join(__dirname, "/routes/*.js"), // your route files
		__filename, // current file for inline JSDoc comments
	],
};

const swaggerSpecs = swaggerJsdoc(swaggerOptions);
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpecs));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/chats", authenticateToken, chatRoutes);
app.use("/api/messages", authenticateToken, messageRoutes);
app.use("/api/calls", authenticateToken, callRoutes);
app.use("/api/friends", authenticateToken, friendsRoutes);
app.use("/api/voicenotes", voiceNotesRoutes);

// Health check
app.get("/api/health", (req, res) => {
	res.status(200).json({
		status: "OK",
		message: "WhatsApp Clone Backend is running",
		timestamp: new Date().toISOString(),
		database:
			mongoose.connection.readyState === 1 ? "Connected" : "Disconnected",
	});
});

// Socket.IO connection handling
socketHandler(io);

// Error handling middleware
app.use(errorHandler);

// Catch-all for undefined routes
app.use("*", (req, res) => {
	res.status(404).json({ message: "Route not found" });
});

// Graceful shutdown
process.on("SIGTERM", () => {
	console.log("SIGTERM received, shutting down gracefully");
	server.close(() => {
		console.log("Process terminated");
		mongoose.connection.close();
	});
});

if (process.env.NODE_ENV !== 'test') {
	server.listen(PORT, () => {
		console.log(`🚀 Server running on port ${PORT}`);
		console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
		console.log(
			`📱 Frontend URL: ${process.env.FRONTEND_URL || "http://localhost:3007"}`
		);
		console.log(`🔌 Socket.IO enabled for real-time messaging`);
		console.log(`📁 File uploads enabled at /uploads`);
		console.log(`📖 Swagger docs available at /api-docs`);
	});
}

module.exports = { app, server, io };
