const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../config/db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

const EMAIL_RE = /^\S+@\S+\.\S+$/;

function signToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "7d" });
}

// POST /api/auth/register
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ error: "Enter a valid email address." });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters." });
    }

    const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email.toLowerCase());
    if (existing) {
      return res.status(409).json({ error: "An account with that email already exists." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const info = db
      .prepare("INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)")
      .run(name?.trim() || email.split("@")[0], email.toLowerCase(), passwordHash);

    const token = signToken(info.lastInsertRowid);
    res.status(201).json({
      token,
      user: { id: info.lastInsertRowid, name: name?.trim() || email.split("@")[0], email: email.toLowerCase() }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not create account. Please try again." });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase());
    if (!user) {
      return res.status(401).json({ error: "Incorrect email or password." });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: "Incorrect email or password." });
    }

    const token = signToken(user.id);
    res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not sign in. Please try again." });
  }
});

// GET /api/auth/me
router.get("/me", requireAuth, (req, res) => {
  const user = db.prepare("SELECT id, name, email FROM users WHERE id = ?").get(req.userId);
  if (!user) return res.status(404).json({ error: "User not found." });
  res.json({ user });
});

module.exports = router;
