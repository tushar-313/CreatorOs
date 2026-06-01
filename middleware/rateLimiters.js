const rateLimit = require('express-rate-limit');
const { wantsHtml } = require('../utils/requestType');
const { buildShortenerViewModel } = require('../utils/viewModels');

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15,
    handler: (req, res) => {
        const message = 'Too many login attempts, please try again later.';
        if (wantsHtml(req)) {
            return res.status(429).render('login', {
                error: message,
                googleAuthConfigured: Boolean(process.env.GOOGLE_CLIENT_ID)
            });
        }
        return res.status(429).json({ success: false, message, error: message });
    }
});

const uploadLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    handler: (req, res) => {
        const message = 'Upload limit reached, please try again later.';
        return res.status(429).json({ success: false, message, error: message });
    }
});

const urlShortenerPageLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 30,
    handler: (req, res) => {
        const message = 'Too many URLs generated, please try again later.';
        return res.status(429).render('home', buildShortenerViewModel(req, null, message));
    }
});

const urlShortenerApiLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 30,
    handler: (req, res) => {
        const message = 'Too many URLs generated, please try again later.';
        return res.status(429).json({ success: false, message, error: message });
    }
});

module.exports = {
    loginLimiter,
    uploadLimiter,
    urlShortenerPageLimiter,
    urlShortenerApiLimiter
};
