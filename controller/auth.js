const User = require("../model/user");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const CONTRIBUTOR_EMAIL = "contributor@creatoros.local";
const CONTRIBUTOR_NAME = "Contributor";

function wantsHtml(req) {
    const accept = req.headers.accept || '';
    return accept.includes('text/html');
}

function createToken(userId) {
    return jwt.sign(
        {
            id: userId,
        },
        process.env.JWT_SECRET,
        {
            expiresIn: '7d',
        }
    );
}

function setAuthCookie(res, token) {
    res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000,
    });
}

const signup = async (req, res, next) => {
    try {
        const { name, email, password } = req.body || {};

        const existingUser = await User.findOne({ email });

        if (existingUser) {
            if (wantsHtml(req)) {
                return res.status(409).render('signup', { error: 'User already exists' });
            }
            return res.status(409).json({ success: false, message: 'User already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await User.create({
            name,
            email,
            password: hashedPassword,
        });

        if (wantsHtml(req)) return res.redirect('/login');
        return res.status(201).json({ success: true, data: { id: user._id, email: user.email } });
    } catch (error) {
        next(error);
    }
};

const login = async (req, res, next) => {
    try {
        const { email, password } = req.body || {};

        const user = await User.findOne({ email });

        const genericMessage = 'Invalid email or password';

        if (!user) {
            if (wantsHtml(req)) return res.status(401).render('login', { error: genericMessage });
            return res.status(401).json({ success: false, message: genericMessage });
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            if (wantsHtml(req)) return res.status(401).render('login', { error: genericMessage });
            return res.status(401).json({ success: false, message: genericMessage });
        }

        const token = createToken(user._id);

        setAuthCookie(res, token);

        if (wantsHtml(req)) return res.redirect('/dashboard');
        return res.status(200).json({ success: true, message: 'Authenticated' });
    } catch (error) {
        next(error);
    }
};

const loginAsContributor = async (req, res, next) => {
    try {
        let user = await User.findOne({ email: CONTRIBUTOR_EMAIL });

        if (!user) {
            const randomPassword = crypto.randomUUID();
            const hashedPassword = await bcrypt.hash(randomPassword, 10);

            user = await User.create({
                name: CONTRIBUTOR_NAME,
                email: CONTRIBUTOR_EMAIL,
                password: hashedPassword,
            });
        }

        const token = createToken(user._id);

        setAuthCookie(res, token);

        if (wantsHtml(req)) return res.redirect('/dashboard');
        return res.status(200).json({ success: true, message: 'Authenticated as contributor' });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    signup,
    login,
    loginAsContributor,
};
