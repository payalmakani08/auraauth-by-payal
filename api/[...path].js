
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const app = express();

app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(express.json({ limit: "10kb" }));
app.use(cookieParser());

const JWT_SECRET = process.env.JWT_SECRET;
const MONGODB_URI = process.env.MONGODB_URI;
const COOKIE_NAME = "auraauth_token";
const TOKEN_LIFETIME = "2h";

let cachedConnection = null;

async function connectDB() {
  if (mongoose.connection.readyState === 1) return;

  if (!MONGODB_URI) throw new Error("MONGODB_URI is not configured.");
  if (cachedConnection) {
    await cachedConnection;
    return;
  }

  cachedConnection = mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 8000
  });

  try {
    await cachedConnection;
  } catch (error) {
    cachedConnection = null;
    throw error;
  }
}

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 60 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false }
}, { timestamps: true });

const User = mongoose.models.User || mongoose.model("User", userSchema);

function publicUser(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    createdAt: user.createdAt
  };
}

function issueToken(user) {
  if (!JWT_SECRET || JWT_SECRET.length < 32) {
    throw new Error("JWT_SECRET must be configured with at least 32 characters.");
  }

  return jwt.sign(
    { sub: user._id.toString() },
    JWT_SECRET,
    { expiresIn: TOKEN_LIFETIME, issuer: "auraauth-by-payal", audience: "auraauth-users" }
  );
}

function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 2 * 60 * 60 * 1000
  });
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/"
  });
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, message: "Too many attempts. Please try again later." }
});

async function requireAuth(req, res, next) {
  try {
    const token = req.cookies[COOKIE_NAME];

    if (!token) {
      return res.status(401).json({ success: false, message: "Please log in to continue." });
    }

    const payload = jwt.verify(token, JWT_SECRET, {
      issuer: "auraauth-by-payal",
      audience: "auraauth-users"
    });

    await connectDB();
    const user = await User.findById(payload.sub);

    if (!user) {
      clearAuthCookie(res);
      return res.status(401).json({ success: false, message: "Session is no longer valid." });
    }

    req.user = user;
    next();
  } catch (error) {
    clearAuthCookie(res);
    return res.status(401).json({ success: false, message: "Your session has expired. Please log in again." });
  }
}

app.get("/api/health", async (req, res) => {
  try {
    await connectDB();
    res.json({ success: true, message: "AuraAuth API and database are connected." });
  } catch (error) {
    res.status(503).json({ success: false, message: "Database connection is unavailable. Check deployment settings." });
  }
});

app.post("/api/auth/register", authLimiter, async (req, res) => {
  try {
    await connectDB();

    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body.password === "string" ? req.body.password : "";

    if (name.length < 2 || name.length > 60) {
      return res.status(400).json({ success: false, message: "Name must contain 2–60 characters." });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return res.status(400).json({ success: false, message: "Enter a valid email address." });
    }

    if (password.length < 10 || password.length > 72) {
      return res.status(400).json({ success: false, message: "Password must be 10–72 characters long." });
    }

    if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
      return res.status(400).json({ success: false, message: "Use uppercase, lowercase and at least one number." });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ success: false, message: "An account with this email already exists." });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ name, email, passwordHash });

    setAuthCookie(res, issueToken(user));
    return res.status(201).json({ success: true, data: { user: publicUser(user) }, message: "Your account has been created!" });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: "An account with this email already exists." });
    }
    console.error("Registration error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to create account. Please try again." });
  }
});

app.post("/api/auth/login", authLimiter, async (req, res) => {
  try {
    await connectDB();

    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body.password === "string" ? req.body.password : "";

    if (!email || !password || password.length > 72) {
      return res.status(400).json({ success: false, message: "Enter your email and password." });
    }

    const user = await User.findOne({ email }).select("+passwordHash");
    const valid = user && await bcrypt.compare(password, user.passwordHash);

    if (!valid) {
      return res.status(401).json({ success: false, message: "Incorrect email or password." });
    }

    setAuthCookie(res, issueToken(user));
    return res.json({ success: true, data: { user: publicUser(user) }, message: "Welcome back!" });
  } catch (error) {
    console.error("Login error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to log in right now." });
  }
});

app.post("/api/auth/logout", (req, res) => {
  clearAuthCookie(res);
  res.json({ success: true, message: "You have been logged out." });
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ success: true, data: { user: publicUser(req.user) } });
});

app.use("/api", (req, res) => {
  res.status(404).json({ success: false, message: "API endpoint not found." });
});

app.use((err, req, res, next) => {
  console.error("Request error:", err.message);
  res.status(400).json({ success: false, message: "Invalid request." });
});

module.exports = app;
