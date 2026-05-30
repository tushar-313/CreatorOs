const express = require('express');
const router = express.Router();
const {
    handleGenerateShortUrl,
    handleListUserLinks,
    handleGetAnalytics,
} = require('../controller/url');
const protect = require('../middleware/auth');
const { preventContributorWrites } = require('../middleware/auth');

router.get('/', protect, handleListUserLinks);
router.post('/', protect, preventContributorWrites, handleGenerateShortUrl);
router.get('/analytics/:shortId', handleGetAnalytics);

module.exports = router;
