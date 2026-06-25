require("dotenv").config();
const { requireAuth } = require("../lib/auth");

module.exports = async function handler(req, res) {
  const user = requireAuth(req, res);
  if (!user) return;

  if (req.method === "GET") {
    return res.status(200).json({
      gmailUser: process.env.GMAIL_USER || "",
      fromName: process.env.FROM_NAME || "",
      aiEnabled: process.env.AI_ENABLED === "true",
      hasAppPassword: !!process.env.GMAIL_APP_PASSWORD,
      hasGroqKey: !!process.env.GROQ_API_KEY,
    });
  }

  if (req.method === "POST") {
    // On Vercel, env vars are set in dashboard
    // This endpoint is kept for local dev only
    if (process.env.VERCEL) {
      return res.status(200).json({
        message: "On Vercel, update environment variables in the Vercel dashboard.",
        dashboardUrl: "https://vercel.com/dashboard",
      });
    }

    const fs = require("fs");
    const path = require("path");
    const { gmailUser, appPassword, fromName, groqApiKey, aiEnabled } = req.body;

    const envPath = path.join(process.cwd(), ".env");
    let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";

    const updates = {};
    if (gmailUser) updates["GMAIL_USER"] = gmailUser;
    if (appPassword) updates["GMAIL_APP_PASSWORD"] = appPassword;
    if (fromName) updates["FROM_NAME"] = fromName;
    if (groqApiKey) updates["GROQ_API_KEY"] = groqApiKey;
    if (typeof aiEnabled === "boolean") updates["AI_ENABLED"] = aiEnabled.toString();

    for (const [key, value] of Object.entries(updates)) {
      const regex = new RegExp(`^${key}=.*$`, "m");
      const line = `${key}=${value}`;
      if (regex.test(content)) {
        content = content.replace(regex, line);
      } else {
        content += `\n${line}`;
      }
      process.env[key] = value;
    }

    fs.writeFileSync(envPath, content);
    return res.status(200).json({ message: "Settings saved." });
  }

  return res.status(405).json({ error: "Method not allowed." });
};