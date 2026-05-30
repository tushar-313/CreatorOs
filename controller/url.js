const shortid = require('shortid');
const Url = require('../model/url');
const { isValidUrl } = require('../utils/validators');

function deriveTitle(redirectUrl, fallback) {
    if (fallback) return fallback;
    try {
        const parsed = new URL(redirectUrl);
        const slug = parsed.pathname.split('/').filter(Boolean).pop();
        if (slug) {
            return slug.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        }
        return parsed.hostname.replace('www.', '');
    } catch (_) {
        return 'Untitled Link';
    }
}

function formatClicks(count) {
    if (count >= 1000) {
        return `${(count / 1000).toFixed(1).replace(/\.0$/, '')}k`;
    }
    return String(count);
}

function serializeLink(entry, hostBase) {
    const linkedAt = entry.linkedAt || entry.createdAt?.[0]?.timeStamp || new Date();
    return {
        shortId: entry.shortId,
        redirectUrl: entry.redirectUrl,
        title: entry.title || deriveTitle(entry.redirectUrl),
        tag: entry.tag || 'active',
        totalClicks: entry.totalClicks || 0,
        clicksLabel: formatClicks(entry.totalClicks || 0),
        shortUrl: `${hostBase}/u/${entry.shortId}`,
        linkedAt: linkedAt,
        linkedAtLabel: new Date(linkedAt).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        }),
    };
}

async function handleGenerateShortUrl(req, res) {
    const { redirectUrl, title, customSlug, tag } = req.body;

    if (!redirectUrl || !isValidUrl(redirectUrl)) {
        return res.status(400).json({ error: 'A valid HTTP or HTTPS URL is required.' });
    }

    let shortId = shortid();
    if (customSlug) {
        const slug = String(customSlug).trim().toLowerCase();
        if (!/^[a-z0-9-_]{3,32}$/.test(slug)) {
            return res.status(400).json({ error: 'Custom slug must be 3–32 characters (letters, numbers, - or _).' });
        }
        const existing = await Url.findOne({ shortId: slug });
        if (existing) {
            return res.status(409).json({ error: 'That slug is already taken. Try another.' });
        }
        shortId = slug;
    } else {
        const existing = await Url.findOne({ shortId });
        if (existing) {
            shortId = shortid();
        }
    }

    const allowedTags = ['active', 'social', 'campaign', 'general'];
    const linkTag = allowedTags.includes(tag) ? tag : 'active';

    const entry = await Url.create({
        shortId,
        redirectUrl,
        userId: req.user?.id || null,
        title: deriveTitle(redirectUrl, title?.trim()),
        tag: linkTag,
        linkedAt: new Date(),
    });

    const hostBase = `${req.protocol}://${req.get('host')}`;

    return res.status(201).json({
        message: 'Link created successfully',
        link: serializeLink(entry, hostBase),
    });
}

async function handleListUserLinks(req, res) {
    const hostBase = `${req.protocol}://${req.get('host')}`;
    const userId = req.user?.id;

    const entries = await Url.listForUser(userId, 100);

    const links = entries.map((entry) => serializeLink(entry, hostBase));
    const totalClicks = links.reduce((sum, link) => sum + link.totalClicks, 0);
    const topLink = links.reduce(
        (best, link) => (link.totalClicks > (best?.totalClicks || 0) ? link : best),
        null
    );

    return res.json({
        links,
        stats: {
            totalLinks: links.length,
            totalClicks,
            totalClicksLabel: formatClicks(totalClicks),
            topLinkTitle: topLink?.title || '—',
            topLinkClicks: topLink?.clicksLabel || '0',
        },
        domain: hostBase.replace(/^https?:\/\//, ''),
    });
}

async function handleGetAnalytics(req, res) {
    const shortId = req.params.shortId;
    const entry = await Url.findOne({ shortId });
    if (!entry) {
        return res.status(404).json({ error: 'Short URL not found' });
    }
    return res.json({
        totalClicks: entry.totalClicks,
        analytics: entry.createdAt,
    });
}

module.exports = {
    handleGenerateShortUrl,
    handleListUserLinks,
    handleGetAnalytics,
    serializeLink,
    formatClicks,
};
