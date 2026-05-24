const express = require("express");
const router = express.Router();

const { signup, login, loginAsContributor } = require("../controller/auth");
const { signupValidator, loginValidator } = require("../middleware/validateAuth");

router.get("/signup", (req, res) => {
    res.render("signup");
});

router.get("/login", (req, res) => {
    res.render("login");
});

router.post("/signup", signupValidator, signup);

router.post("/login", loginValidator, login);

router.post("/login/contributor", loginAsContributor);

router.get("/logout", (req, res) => {
    res.clearCookie("token");
    res.redirect("/login");
});

module.exports = router;
