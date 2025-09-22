const jwt = require("jsonwebtoken");
const User = require("../models/User");

const authenticateToken = async (req, res, next) => {
	try {
		// First check Authorization header
		const authHeader = req.headers["authorization"];
		let token = authHeader && authHeader.split(" ")[1]; // "Bearer TOKEN"

		// If not in header, check path param
		if (!token && req.params.token) {
			token = req.params.token;
		}

		// If still not found, return error
		if (!token) {
			return res.status(401).json({
				success: false,
				message: "Access token is required",
			});
		}

		// Verify token
		const decoded = jwt.verify(token, process.env.JWT_SECRET);

		// Check if user still exists
		const user = await User.findById(decoded.userId);
		if (!user) {
			return res.status(401).json({
				success: false,
				message: "User no longer exists",
			});
		}

		req.user = user;
		next();
	} catch (error) {
		if (error.name === "JsonWebTokenError") {
			return res.status(401).json({ success: false, message: "Invalid token" });
		} else if (error.name === "TokenExpiredError") {
			return res.status(401).json({ success: false, message: "Token expired" });
		}

		console.error("Auth middleware error:", error);
		return res
			.status(500)
			.json({ success: false, message: "Internal server error" });
	}
};

const generateToken = (userId) => {
	return jwt.sign({ userId }, process.env.JWT_SECRET);
};

module.exports = { authenticateToken, generateToken };
