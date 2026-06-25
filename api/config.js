require("dotenv").config();
const { requireAuth } = require("../lib/auth");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  const user = requireAuth(req, res);
  if (!user) return;

  return res.status(200).json({
    aiAvailable: process.env.AI_ENABLED === "true" && !!process.env.GROQ_API_KEY,
    fromName: process.env.FROM_NAME || "",
    gmailUser: process.env.GMAIL_USER || "",
  });
};