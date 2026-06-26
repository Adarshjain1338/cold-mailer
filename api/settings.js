require("dotenv").config();
const { requireAuth } = require("../lib/auth");
const { getAdminClient } = require("../lib/supabase");

module.exports = async function handler(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return;

  const admin = getAdminClient();

  if (req.method === "GET") {
    const { data, error } = await admin
      .from("user_settings")
      .select("from_name, gmail_user, gmail_app_password, groq_api_key, ai_enabled")
      .eq("user_id", user.id)
      .single();

    if (error && error.code !== "PGRST116") {
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({
      fromName: data?.from_name || "",
      gmailUser: data?.gmail_user || "",
      aiEnabled: data?.ai_enabled || false,
      hasAppPassword: !!data?.gmail_app_password,
      hasGroqKey: !!data?.groq_api_key,
      needsSetup: !data?.gmail_app_password || !data?.gmail_user,
    });
  }

  if (req.method === "POST") {
    const { fromName, gmailUser, appPassword, groqApiKey, aiEnabled } = req.body;

    if (!fromName || !gmailUser) {
      return res.status(400).json({ error: "Sender name and Gmail address are required." });
    }

    const updates = {
      from_name: fromName,
      gmail_user: gmailUser,
      ai_enabled: typeof aiEnabled === "boolean" ? aiEnabled : false,
      updated_at: new Date().toISOString(),
    };

    if (appPassword) updates.gmail_app_password = appPassword;
    if (groqApiKey) updates.groq_api_key = groqApiKey;

    const { error } = await admin
      .from("user_settings")
      .upsert({ user_id: user.id, ...updates }, { onConflict: "user_id" });

    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({ message: "Settings saved." });
  }

  return res.status(405).json({ error: "Method not allowed." });
};