import mongoose from "mongoose";

const ConnectDB = async () => {
	try {
		await mongoose.connect(process.env.MONGO_URI, {
			useNewUrlParser: true,
			useUnifiedTopology: true,
			maxPoolSize: 10,
			serverSelectionTimeoutMS: 5000,
		});

		console.log("✅ MongoDB connected");
	} catch (error) {
		console.error("❌ MongoDB connection error:", error);
		setTimeout(ConnectDB, 5000); // retry if it fails
	}
};

mongoose.connection.on("disconnected", () => {
	console.log("⚠️ MongoDB disconnected — reconnecting...");
	ConnectDB();
});

export default ConnectDB;
