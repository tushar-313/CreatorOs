function wantsHtml(req) {
    return req.accepts('html') !== false;
}

module.exports = { wantsHtml };