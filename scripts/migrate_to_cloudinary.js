const mongoose = require("mongoose");
const cloudinary = require("../Cloudinary"); // Adjust path if needed
const User = require("../models/User");
const Message = require("../models/Message");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log("✅ Connected to MongoDB");
    } catch (error) {
        console.error("❌ MongoDB connection error:", error);
        process.exit(1);
    }
};

const uploadToCloudinary = async (filePath) => {
    try {
        // Resolve absolute path. Assumes path in DB is like "/uploads/filename" or "uploads/filename"
        const cleanPath = filePath.startsWith("/") ? filePath.slice(1) : filePath;
        const localPath = path.join(__dirname, "../", cleanPath);

        if (!fs.existsSync(localPath)) {
            console.warn(`⚠️ File not found locally: ${localPath}`);
            return null;
        }

        const result = await cloudinary.uploader.upload(localPath, {
            folder: "migrated_uploads",
        });
        return result.secure_url;
    } catch (error) {
        console.error(`❌ Upload failed for ${filePath}:`, error.message);
        return null;
    }
};

const migrateUsers = async () => {
    console.log("🔄 Starting User migration...");
    const users = await User.find({
        $or: [
            { profilePicture: { $regex: /uploads/ } },
            { backgroundImage: { $regex: /uploads/ } }
        ]
    });

    for (const user of users) {
        let updated = false;
        if (user.profilePicture && user.profilePicture.includes("uploads")) {
            const newUrl = await uploadToCloudinary(user.profilePicture);
            if (newUrl) {
                user.profilePicture = newUrl;
                updated = true;
                console.log(`✅ Migrated profilePicture for user ${user.username}`);
            }
        }
        if (user.backgroundImage && user.backgroundImage.includes("uploads")) {
            const newUrl = await uploadToCloudinary(user.backgroundImage);
            if (newUrl) {
                user.backgroundImage = newUrl;
                updated = true;
                console.log(`✅ Migrated backgroundImage for user ${user.username}`);
            }
        }
        if (updated) await user.save();
    }
    console.log("✅ User migration complete.");
};

const migrateMessages = async () => {
    console.log("🔄 Starting Message migration...");
    // Find messages where content.media.url contains "uploads"
    const messages = await Message.find({
        "content.media.url": { $regex: /uploads/ }
    });

    for (const msg of messages) {
        if (msg.content?.media?.url) {
            const newUrl = await uploadToCloudinary(msg.content.media.url);
            if (newUrl) {
                msg.content.media.url = newUrl;
                await msg.save();
                console.log(`✅ Migrated message ${msg._id}`);
            }
        }
    }
    console.log("✅ Message migration complete.");
};

const runMigration = async () => {
    await connectDB();
    await migrateUsers();
    await migrateMessages();
    console.log("🎉 All migrations finished. You can now delete the local uploads folder.");
    mongoose.connection.close();
};

runMigration();
