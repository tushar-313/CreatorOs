const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
    {
        name: {
        type: String,
        required: true,
        },

        email: {
        type: String,
        required: true,
        unique: true,
        },

        password: {
        type: String,
        required: true,
        },
    },
    {
        timestamps: true,
    }
);

const MongooseUserModel = mongoose.model("User", userSchema);

// In-memory mock storage
const mockUsers = [];

class MockUserModel {
    constructor(data) {
        this._id = data._id || 'mock-user-id-' + Math.random().toString(36).substr(2, 9);
        this.name = data.name;
        this.email = data.email;
        this.password = data.password;
        this.createdAt = new Date();
        this.updatedAt = new Date();
    }

    async save() {
        const existing = mockUsers.find(u => u.email === this.email);
        if (existing) {
            Object.assign(existing, this);
        } else {
            mockUsers.push(this);
        }
        return this;
    }

    static async findOne(query) {
        let found = null;
        if (query.email) {
            found = mockUsers.find(u => u.email === query.email);
        }
        return found ? new MockUserModel(found) : null;
    }

    static async create(data) {
        const user = new MockUserModel(data);
        await user.save();
        return user;
    }

    static findById(id) {
        const found = mockUsers.find(u => u._id === id || u.id === id);
        const result = found ? new MockUserModel(found) : null;
        
        return {
            select: function() {
                return {
                    lean: function() {
                        return result;
                    },
                    then: function(resolve) {
                        resolve(result);
                    }
                };
            },
            lean: function() {
                return result;
            },
            then: function(resolve) {
                resolve(result);
            }
        };
    }
}

// Pre-seed the test user in Mock DB so login works immediately
(async () => {
    const hashed = await bcrypt.hash("Password123!", 10);
    mockUsers.push({
        _id: "mock-test-user-id",
        name: "Test User",
        email: "test@local",
        password: hashed,
        createdAt: new Date(),
        updatedAt: new Date()
    });
})();

module.exports = new Proxy({}, {
    get(target, prop) {
        if (process.env.USE_MOCK_DB === "true") {
            return MockUserModel[prop] || MockUserModel;
        }
        return MongooseUserModel[prop];
    },
    construct(target, args) {
        if (process.env.USE_MOCK_DB === "true") {
            return new MockUserModel(...args);
        }
        return new MongooseUserModel(...args);
    }
});