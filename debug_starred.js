const mongoose = require("mongoose");
const Message = require("./models/Message");
require("dotenv").config();

async function debugStarred() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/whatsapp-clone");
        console.log("Connected to DB");

        const messages = await Message.find({ "starredBy.0": { $exists: true } }).lean();
        console.log(`Found ${messages.length} messages with stars.`);

        messages.forEach(msg => {
            console.log(`Message ID: ${msg._id}`);
            console.log("StarredBy:", JSON.stringify(msg.starredBy, null, 2));
        });

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

debugStarred();
