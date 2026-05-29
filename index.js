require("dotenv").config({ path: ".env.local" });
const cookieParser = require("cookie-parser");
const express = require('express');
const passport = require("passport");
const path = require('path');

// Validate required environment variables
const requiredEnvVars = [
    { name: 'MONGODB_URI', description: 'MongoDB connection string' },
    { name: 'JWT_SECRET', description: 'Secret key for JWT token signing' },
];

const missingVars = requiredEnvVars.filter((v) => !process.env[v.name]);

if (missingVars.length > 0) {
    console.warn('\n⚠️ Missing environment variables for full production mode:');
    missingVars.forEach((v) => {
        console.warn(`   - ${v.name} (${v.description})`);
    });
    console.warn('\n📋 The app will start in local mock mode.');
    console.warn('   To use a real database, copy .env.example to .env.local and fill in the values.\n');
}

const app = express();

const connectDB = require("./connect");
const authRoutes = require("./routes/auth");
const collaborationRoutes = require('./routes/collaboration');
const analyticsRoutes = require("./routes/analytics");
const { acceptInvite, acceptInviteFromDashboard } = require('./controller/collaborationController');

connectDB();
require("./workers/analyticsRefreshWorker");
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(passport.initialize());

app.set("view engine", "ejs");
app.set('views', path.join(__dirname, 'view'));

const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15,
    message: 'Too many login attempts, please try again later.'
});
app.post('/login', loginLimiter);

const uploadLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    message: { error: 'Upload limit reached, please try again later.' }
});

const urlShortenerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 30,
    message: 'Too many URLs generated, please try again later.'
});

app.use("/", authRoutes);

const protect = require("./middleware/auth");
const { preventContributorWrites } = require("./middleware/auth");

const fs = require('fs');
app.use(express.static(path.join(__dirname, 'public')));
const shortid = require('shortid');
const multer = require('multer');
const services = require('./services.config');
const User = require('./model/user');
const Invite = require('./model/invite');

const port = process.env.PORT || 3000;
const urlRoutes = require('./routes/url');

const suggestionRoutes = require('./routes/suggestionRoutes');
// ... after your other app.use() lines:
app.use('/suggestions', protect, suggestionRoutes);
app.use('/services/creator-crm', protect, collaborationRoutes);
app.post('/dashboard/accept-invite', protect, preventContributorWrites, acceptInviteFromDashboard);
app.get('/invites/accept/:token', acceptInvite);
const Url = require('./model/url');

app.use('/url', urlRoutes);
app.use("/api/analytics", protect, analyticsRoutes);
const settingsRoutes = require('./routes/settings');
app.use('/api/settings', protect, settingsRoutes);

const uploadDir = "/tmp";

const storage = multer.diskStorage({
    destination: function (req, file, cb) { cb(null, "/tmp"); },
    filename: function (req, file, cb) { cb(null, Date.now() + '-' + file.originalname); }
});
const upload = multer({ storage: storage, limits: { fileSize: 50 * 1024 * 1024 } });

function findServiceByKey(key) {
    return services.find((service) => service.key === key);
}

function buildShortenerViewModel(req, shortId = null, error = null) {
    return {
        service: findServiceByKey('url-shortener'),
        shortUrl: shortId ? `${req.protocol}://${req.get('host')}/u/${shortId}` : null,
        error,
    };
}

function buildAccountViewModel(userDoc, fallbackUser) {
    const name = userDoc?.name || fallbackUser?.name || 'Creator';
    const initials = name
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0].toUpperCase())
        .join('') || 'CR';

    const passwordChangedAt = userDoc?.passwordChangedAt || userDoc?.updatedAt || null;
    let passwordAgeDays = null;
    if (passwordChangedAt) {
        passwordAgeDays = Math.max(
            0,
            Math.floor((Date.now() - new Date(passwordChangedAt).getTime()) / (1000 * 60 * 60 * 24))
        );
    }

    const sub = userDoc?.subscription || {};
    const nextInvoice = sub.nextInvoiceDate
        ? new Date(sub.nextInvoiceDate)
        : (() => {
            const d = new Date();
            d.setMonth(d.getMonth() + 1);
            d.setDate(24);
            return d;
        })();

    return {
        id: fallbackUser.id,
        name,
        email: userDoc?.email || fallbackUser?.email || '',
        alias: userDoc?.alias || '',
        bio: userDoc?.bio || '',
        twoFactorEnabled: userDoc?.twoFactorEnabled || false,
        preferences: userDoc?.preferences || {
            appearanceMode: 'light',
            interfaceDensity: 'tactile',
            motionEffects: true,
            soundCues: false,
            autoSaveLinks: true
        },
        passwordAgeDays,
        billing: {
            planName: sub.planName || 'Pro Individual',
            priceMonthly: sub.priceMonthly ?? 29,
            nextInvoiceLabel: nextInvoice.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
            }),
            estimatedTotal: `$${(sub.priceMonthly ?? 29).toFixed(2)} USD`,
            cardBrand: sub.cardBrand || 'VISA',
            cardLast4: sub.cardLast4 || '4242',
            invoices: [
                { date: 'Sep 24, 2023', invoiceId: '#INV-88219', amount: '$29.00', status: 'PAID' },
                { date: 'Aug 24, 2023', invoiceId: '#INV-87112', amount: '$29.00', status: 'PAID' },
            ],
        },
        initials,
    };
}

function isGuestContributor(user) {
    return user?.role === 'guest_contributor';
}

function buildEmptyInviteSummary() {
    return {
        total: 0,
        pending: 0,
        accepted: 0,
        expired: 0,
    };
}

app.get("/dashboard", protect, async (req, res) => {
    const userDoc = isGuestContributor(req.user)
        ? null
        : await User.findById(req.user.id)
            .select('name email alias bio twoFactorEnabled preferences passwordChangedAt updatedAt subscription')
            .lean();
    
    const inviteSummary = isGuestContributor(req.user)
        ? buildEmptyInviteSummary()
        : await Promise.all([
            Invite.countDocuments({ inviter: req.user.id, status: 'pending' }),
            Invite.countDocuments({ inviter: req.user.id, status: 'accepted' }),
            Invite.countDocuments({ inviter: req.user.id, status: 'expired' })
        ]).then(([pending, accepted, expired]) => ({
            total: pending + accepted + expired,
            pending,
            accepted,
            expired,
        }));
    
    res.render("dashboard", {
        user: buildAccountViewModel(userDoc, req.user),
        services,
        inviteSummary,
        inviteAcceptMessage: null,
        inviteAcceptError: null,
    });
});

app.get("/settings", protect, async (req, res) => {
    const userDoc = isGuestContributor(req.user)
        ? null
        : await User.findById(req.user.id)
            .select('name email alias bio twoFactorEnabled preferences passwordChangedAt updatedAt subscription')
            .lean();

    res.render("settings", {
        user: buildAccountViewModel(userDoc, req.user),
        isGuestContributor: isGuestContributor(req.user),
    });
});

app.get("/profile", protect, async (req, res) => {
    const userDoc = isGuestContributor(req.user)
        ? null
        : await User.findById(req.user.id).select('name email').lean();

    res.render("profile", { user: buildAccountViewModel(userDoc, req.user) });
});

// Service hub landing page
app.get('/', (req, res) => {
    res.render('services-hub', { services });
});

// Optional convenience route
app.get('/services', (req, res) => {
    res.redirect('/');
});

// Protected service pages
app.get('/services/:serviceKey', protect, (req, res) => {
    const service = findServiceByKey(req.params.serviceKey);

    if (!service) {
        return res.status(404).render('coming-soon', {
            service: {
                name: 'Unknown service',
                description: 'This service does not exist in the current module registry.',
                status: 'coming_soon',
            },
        });
    }

    if (service.status !== 'available') {
        return res.render('coming-soon', { service });
    }

    if (service.key === 'url-shortener') {
        return res.render('home', buildShortenerViewModel(req));
    }

    if (service.key === 'suggestion-tool') {
        return res.redirect('/suggestions');
    }

    if (service.key === 'creator-crm') {
        return res.redirect('/services/creator-crm');
    }

    if (service.key === 'file-upload') {
        return res.render('file-upload');
    }

    return res.render('coming-soon', { service });
});

const { isValidUrl } = require('./utils/validators');

// URL shortener submit flow (dedicated service route)
app.post('/services/url-shortener/shorten', protect, preventContributorWrites, urlShortenerLimiter, async (req, res) => {
    const { redirectUrl } = req.body;
    if (!redirectUrl || !isValidUrl(redirectUrl)) {
        return res.render('home', buildShortenerViewModel(req, null, 'Please enter a valid HTTP or HTTPS URL.'));
    }

    try {
        const shortId = shortid();

        await Url.create({
            shortId,
            redirectUrl,
        });

        return res.render('home', buildShortenerViewModel(req, shortId));
    } catch (err) {
        // Log the actual error to the server console for debugging
        console.error('Error creating short URL:', err);
        return res.render('home', buildShortenerViewModel(req, null, 'An unexpected error occurred.'));
    }
});

// File upload endpoint
app.post('/services/file-upload/upload', protect, preventContributorWrites, uploadLimiter, upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    return res.json({
        filename: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
        path: req.file.filename,
    });
});

// Redirect for generated short URLs
app.get('/u/:shortId', async (req, res) => {
    const shortId = req.params.shortId;

    const entry = await Url.findOne({ shortId });

    if (entry) {
        // Update analytics
        entry.totalClicks++;
        entry.createdAt.push({ timeStamp: new Date() });
        await entry.save();
        return res.redirect(entry.redirectUrl);
    } else {
        return res.status(404).send('URL not found');
    }
});

// Centralized error handler
const errorHandler = require('./middleware/errorHandler');
app.use(errorHandler);

if (require.main === module) {
    app.listen(port, () => {
        console.log(`Server is running on http://localhost:${port}`);
    });
}

module.exports = app;
