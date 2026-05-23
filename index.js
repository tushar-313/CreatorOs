require("dotenv").config();
const cookieParser = require("cookie-parser");
const express = require('express');

const app = express();

const connectDB = require("./conect");
const authRoutes = require("./routes/auth");

connectDB();
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.set("view engine", "ejs");
app.use("/", authRoutes);

const protect = require("./middleware/auth");

const path = require('path');
const fs = require('fs');
const shortid = require('shortid');
const multer = require('multer');
const services = require('./services.config');
const User = require('./model/user');

const port = 3000;
const urlRoutes = require('./routes/url');

// In-memory "database" to store URLs.
// Note: This data will be lost when the server restarts.
const urlDatabase = new Map();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'view'));

app.use('/url', urlRoutes);

// Multer config for file uploads
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: function (req, file, cb) { cb(null, uploadDir); },
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
    const name = userDoc?.name || 'Creator';
    const initials = name
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0].toUpperCase())
        .join('') || 'CR';

    return {
        id: fallbackUser.id,
        name,
        email: userDoc?.email || '',
        initials,
    };
}

app.get("/dashboard", protect, async (req, res) => {
    const userDoc = await User.findById(req.user.id).select('name email').lean();

    res.render("dashboard", {
        user: buildAccountViewModel(userDoc, req.user),
        services,
    });
});

app.get("/profile", protect, async (req, res) => {
    const userDoc = await User.findById(req.user.id).select('name email').lean();

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

    if (service.key === 'file-upload') {
        return res.render('file-upload');
    }

    return res.render('coming-soon', { service });
});

// URL shortener submit flow (dedicated service route)
app.post('/services/url-shortener/shorten', protect, async (req, res) => {
    const { redirectUrl } = req.body;
    if (!redirectUrl) {
        return res.render('home', buildShortenerViewModel(req, null, 'Please enter a URL.'));
    }

    try {
        const shortId = shortid();

        // Store the new link in our in-memory database
        urlDatabase.set(shortId, {
            redirectUrl,
            totalClicks: 0,
            createdAt: [],
        });

        return res.render('home', buildShortenerViewModel(req, shortId));
    } catch (err) {
        // Log the actual error to the server console for debugging
        console.error('Error creating short URL:', err);
        return res.render('home', buildShortenerViewModel(req, null, 'An unexpected error occurred.'));
    }
});

// File upload endpoint
app.post('/services/file-upload/upload', protect, upload.single('file'), (req, res) => {
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

    // Find the entry in our in-memory database
    const entry = urlDatabase.get(shortId);

    if (entry) {
        // Update analytics
        entry.totalClicks++;
        entry.createdAt.push({ timeStamp: new Date() });
        return res.redirect(entry.redirectUrl);
    } else {
        return res.status(404).send('URL not found');
    }
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
