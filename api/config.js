require("dotenv").config();
const { requireAuth } = require("../lib/auth");
const { getAdminClient } = require("../lib/supabase");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  const admin = getAdminClient();

  const { data } = await admin
    .from("user_settings")
    .select("ai_enabled, groq_api_key, gmail_user, gmail_app_password, from_name")
    .eq("user_id", user.id)
    .single();

  return res.status(200).json({
    aiAvailable: data?.ai_enabled === true && !!data?.groq_api_key,
    needsSetup: !data?.gmail_app_password || !data?.gmail_user,
    fromName: data?.from_name || "",
    gmailUser: data?.gmail_user || "",
  });
};