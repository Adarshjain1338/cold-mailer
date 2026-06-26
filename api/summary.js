require("dotenv").config();
const { requireAuth } = require("../lib/auth");
const { getAdminClient } = require("../lib/supabase");
const nodemailer = require("nodemailer");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  const admin = getAdminClient();

  // Get user settings
  const { data: settings } = await admin
    .from("user_settings")
    .select("gmail_user, gmail_app_password, from_name")
    .eq("user_id", user.id)
    .single();

  if (!settings?.gmail_user || !settings?.gmail_app_password) {
    return res.status(400).json({ error: "Gmail not configured." });
  }

  // Get today's history from Supabase
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data: entries, error } = await admin
    .from("email_history")
    .select("recipients, subject, status, sent_at")
    .eq("user_id", user.id)
    .gte("sent_at", today.toISOString())
    .order("sent_at", { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  if (!entries || entries.length === 0) {
    return res.status(400).json({ error: "No emails sent today." });
  }

  const rows = entries
    .map(
      (e, i) =>
        `${i + 1}. To: ${e.recipients.join(", ")}\n   Subject: ${e.subject}\n   Status: ${e.status}\n   Time: ${new Date(e.sent_at).toLocaleString()}`
    )
    .join("\n\n");

  const summaryBody = [
    `Daily Cold Mail Summary`,
    `${"─".repeat(36)}`,
    `Date: ${new Date().toLocaleDateString()}`,
    `Total sent: ${entries.length}`,
    ``,
    rows,
  ].join("\n");

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: settings.gmail_user,
        pass: settings.gmail_app_password,
      },
    });

    await transporter.sendMail({
      from: `"${settings.from_name || settings.gmail_user}" <${settings.gmail_user}>`,
      to: settings.gmail_user,
      subject: `Cold Mail Summary — ${new Date().toLocaleDateString()}`,
      text: summaryBody,
    });

    return res.status(200).json({ message: "Summary sent to your inbox." });
  } catch (err) {
    console.error("Summary error:", err.message);
    return res.status(500).json({ error: "Failed to send summary." });
  }
};