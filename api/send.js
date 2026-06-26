require("dotenv").config();
const { requireAuth } = require("../lib/auth");
const { getAdminClient } = require("../lib/supabase");
const nodemailer = require("nodemailer");
const https = require("https");

function fetchAttachment(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve(Buffer.concat(chunks)));
      response.on("error", reject);
    });
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  const { to, subject, body, attachmentUrl, attachmentName } = req.body;

  if (!to || !subject || !body) {
    return res.status(400).json({ error: "All fields are required." });
  }

  const admin = getAdminClient();

  // Get user's Gmail settings
  const { data: settings } = await admin
    .from("user_settings")
    .select("gmail_user, gmail_app_password, from_name")
    .eq("user_id", user.id)
    .single();

  if (!settings?.gmail_user || !settings?.gmail_app_password) {
    return res.status(400).json({
      error: "Gmail not configured. Please set up your email settings first.",
      needsSetup: true,
    });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const recipients = to
    .split(",")
    .map((e) => e.trim())
    .filter((e) => e.length > 0);

  const invalid = recipients.find((e) => !emailRegex.test(e));
  if (invalid) {
    return res.status(400).json({ error: `Invalid email address: ${invalid}` });
  }

  // Build attachment
  const attachments = [];
  if (attachmentUrl && attachmentName) {
    try {
      const buffer = await fetchAttachment(attachmentUrl);
      attachments.push({ filename: attachmentName, content: buffer });
    } catch (e) {
      console.error("Attachment fetch error:", e.message);
    }
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: settings.gmail_user,
      pass: settings.gmail_app_password,
    },
  });

  const failed = [];

  for (const recipient of recipients) {
    try {
      await transporter.sendMail({
        from: `"${settings.from_name || settings.gmail_user}" <${settings.gmail_user}>`,
        to: recipient,
        subject,
        text: body,
        attachments,
      });
    } catch (err) {
      console.error(`Failed to send to ${recipient}:`, err.message);
      failed.push(recipient);
    }
  }

  // Save to email_history
  const status =
    failed.length === 0
      ? "sent"
      : failed.length === recipients.length
      ? "failed"
      : "partial";

  await admin.from("email_history").insert({
    user_id: user.id,
    recipients,
    subject,
    status,
    error_message: failed.length > 0 ? `Failed: ${failed.join(", ")}` : null,
  });

  if (failed.length === recipients.length) {
    return res.status(500).json({ error: "Failed to send to all recipients." });
  }

  if (failed.length > 0) {
    return res.status(207).json({
      message: `Sent to ${recipients.length - failed.length} recipient(s). Failed: ${failed.join(", ")}`,
    });
  }

  return res.status(200).json({
    message: `Sent to ${recipients.length} recipient(s).`,
  });
};