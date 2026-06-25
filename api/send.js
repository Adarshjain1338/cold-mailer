require("dotenv").config();
const { requireAuth } = require("../lib/auth");
const { createTransporter } = require("../lib/mailer");
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

  const user = requireAuth(req, res);
  if (!user) return;

  const { to, subject, body, attachmentUrl, attachmentName } = req.body;

  if (!to || !subject || !body) {
    return res.status(400).json({ error: "All fields are required." });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // Parse recipients — send individually
  const recipients = to
    .split(",")
    .map((e) => e.trim())
    .filter((e) => e.length > 0);

  const invalid = recipients.find((e) => !emailRegex.test(e));
  if (invalid) {
    return res.status(400).json({ error: `Invalid email address: ${invalid}` });
  }

  // Build attachment if provided
  const attachments = [];
  if (attachmentUrl && attachmentName) {
    try {
      const buffer = await fetchAttachment(attachmentUrl);
      attachments.push({ filename: attachmentName, content: buffer });
    } catch (e) {
      console.error("Attachment fetch error:", e.message);
    }
  }

  const transporter = createTransporter();
  const failed = [];

  for (const recipient of recipients) {
    try {
      await transporter.sendMail({
        from: `"${process.env.FROM_NAME}" <${process.env.GMAIL_USER}>`,
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