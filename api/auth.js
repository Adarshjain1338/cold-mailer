require("dotenv").config();
const { getAdminClient, getAuthClient } = require("../lib/supabase");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required." });
  }

  try {
    const supabase = getAuthClient();
    const admin = getAdminClient();

    // Sign in with email (username is email)
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: username,
      password,
    });

    if (authError || !authData?.session) {
      return res.status(401).json({ error: "Invalid credentials." });
    }

    const userId = authData.user.id;
    const token = authData.session.access_token;

    // Get or create user_settings row
    let { data: settings } = await admin
      .from("user_settings")
      .select("role, gmail_user, gmail_app_password")
      .eq("user_id", userId)
      .single();

    if (!settings) {
      // First login — create settings row
      const { data: newSettings } = await admin
        .from("user_settings")
        .insert({ user_id: userId, role: "user" })
        .select()
        .single();
      settings = newSettings;
    }

    // Prompt if app password not set
    const needsSetup = !settings?.gmail_app_password || !settings?.gmail_user;

    return res.status(200).json({
      token,
      role: settings?.role || "user",
      needsSetup,
    });
  } catch (e) {
    console.error("Auth error:", e.message);
    return res.status(500).json({ error: "Login failed." });
  }
};