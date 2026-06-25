require("dotenv").config();
const { signToken } = require("../lib/auth");
const { verifyPassword, createUser, findUser } = require("../lib/users");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required." });
  }

  // Check if this is the admin from .env
  const isEnvAdmin =
    username === process.env.ADMIN_USERNAME &&
    password === process.env.ADMIN_PASSWORD;

  if (isEnvAdmin) {
    // Auto-create admin in users.json if not exists
    const exists = findUser(username);
    if (!exists) {
      await createUser(username, password, "admin").catch(() => {});
    }
    const token = signToken({ username, role: "admin" });
    return res.status(200).json({ token, role: "admin" });
  }

  // Check users.json
  const user = await verifyPassword(username, password);
  if (!user) {
    return res.status(401).json({ error: "Invalid credentials." });
  }

  const token = signToken({ username: user.username, role: user.role });
  return res.status(200).json({ token, role: user.role });
};