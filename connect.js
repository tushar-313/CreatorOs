const mongoose = require("mongoose");

const connectDB = async () => {
    const uri = process.env.MONGODB_URI;
    const isPlaceholder = !uri || uri.includes("<user_name>") || uri.includes("<password>") || uri.includes("7udof89w.mongodb.net");

    // Add safe fallback for JWT_SECRET if missing or using standard placeholder
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.includes("openssl rand")) {
        process.env.JWT_SECRET = "creatoros-local-development-secret-key-123456";
    }

    if (isPlaceholder) {
        console.log("\n==================================================");
        console.log("⚠️  MongoDB URI not configured or using placeholder.");
        console.log("👉 CreatorOS is starting in MOCK DATABASE mode.");
        console.log("👉 Test user credentials: test@local / Password123!");
        console.log("==================================================\n");
        process.env.USE_MOCK_DB = "true";
        return;
    }

    try {
        await mongoose.connect(uri, {
            serverSelectionTimeoutMS: 3000
        });

        console.log("MongoDB Connected Successfully");
    } catch (error) {
        console.log("\n==================================================");
        console.log("MongoDB Connection Error:", error.message);
        console.log("👉 CreatorOS is falling back to MOCK DATABASE mode.");
        console.log("👉 Test user credentials: test@local / Password123!");
        console.log("==================================================\n");
        process.env.USE_MOCK_DB = "true";
    }
};

module.exports = connectDB;