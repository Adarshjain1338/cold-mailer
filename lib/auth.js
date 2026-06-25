const jwt = require("jsonwebtoken");

const SECRET = process.env.JWT_SECRET;
const EXPIRES = "24h";

function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRES });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, SECRET);
  } catch (e) {
    return null;
  }
}

function extractToken(req) {
  const auth = req.headers["authorization"];
  if (!auth || !auth.startsWith("Bearer ")) return null;
  return auth.slice(7);
}

function requireAuth(req, res) {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "Unauthorized." });
    return null;
  }
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "Session expired. Please log in again." });
    return null;
  }
  return payload;
}

function requireAdmin(req, res) {
  const user = requireAuth(req, res);
  if (!user) return null;
  if (user.role !== "admin") {
    res.status(403).json({ error: "Admin access required." });
    return null;
  }
  return user;
}

module.exports = { signToken, verifyToken, extractToken, requireAuth, requireAdmin };