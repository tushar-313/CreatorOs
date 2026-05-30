const mongoose = require("mongoose");

const urlSchema = new mongoose.Schema({
    shortId: {
        type: String,
        required: true,
        unique: true,
    },

    redirectUrl: {
        type: String,
        required: true,
    },

    userId: {
        type: String,
        index: true,
    },

    title: {
        type: String,
    },

    tag: {
        type: String,
        enum: ["active", "social", "campaign", "general"],
        default: "active",
    },

    totalClicks: {
        type: Number,
        default: 0,
    },

    linkedAt: {
        type: Date,
        default: Date.now,
    },

    createdAt: [
        {
            timeStamp: {
                type: Date,
                default: Date.now,
            },
        },
    ],

    visitHistory: [
        {
            timestamp: {
                type: Date,
                default: Date.now,
            },
        },
    ],
});

const MongooseUrlModel =
    mongoose.models.Url || mongoose.model("Url", urlSchema);

const mockUrls = [];

class MockUrlModel {
    constructor(data) {
        this.shortId = data.shortId;
        this.redirectUrl = data.redirectUrl;
        this.userId = data.userId || null;
        this.title = data.title || "";
        this.tag = data.tag || "active";
        this.totalClicks = data.totalClicks || 0;
        this.linkedAt = data.linkedAt || new Date();
        this.createdAt = data.createdAt || [];
        this.visitHistory = data.visitHistory || [];
    }

    async save() {
        const existing = mockUrls.find((u) => u.shortId === this.shortId);

        if (existing) {
            Object.assign(existing, this);
        } else {
            mockUrls.push(this);
        }

        return this;
    }

    static async create(data) {
        const url = new MockUrlModel(data);
        await url.save();
        return url;
    }

    static async findOne(query) {
        const found = mockUrls.find((u) => {
            if (query.shortId && u.shortId !== query.shortId) return false;
            if (query.userId && u.userId !== query.userId) return false;
            return true;
        });

        return found ? new MockUrlModel(found) : null;
    }

    static async find(query = {}, options = {}) {
        let results = mockUrls.filter((u) => {
            if (query.userId && u.userId !== query.userId) return false;
            return true;
        });

        if (options.sort?.linkedAt === -1) {
            results.sort((a, b) => new Date(b.linkedAt) - new Date(a.linkedAt));
        }

        if (options.limit) {
            results = results.slice(0, options.limit);
        }

        return results.map((r) => ({ ...r }));
    }

    static async countDocuments(query = {}) {
        const results = await MockUrlModel.find(query);
        return results.length;
    }
}

function getActiveUrlModel() {
    return process.env.USE_MOCK_DB === "true" ? MockUrlModel : MongooseUrlModel;
}

function UrlModel(data) {
    const Active = getActiveUrlModel();
    return new Active(data);
}

UrlModel.create = (...args) => getActiveUrlModel().create(...args);
UrlModel.findOne = (...args) => getActiveUrlModel().findOne(...args);
UrlModel.find = (...args) => getActiveUrlModel().find(...args);
UrlModel.countDocuments = (...args) => getActiveUrlModel().countDocuments(...args);

UrlModel.listForUser = async (userId, limit = 100) => {
    if (process.env.USE_MOCK_DB === "true") {
        return MockUrlModel.find({ userId }, { sort: { linkedAt: -1 }, limit });
    }
    return MongooseUrlModel.find({ userId })
        .sort({ linkedAt: -1 })
        .limit(limit)
        .lean();
};

module.exports = UrlModel;
