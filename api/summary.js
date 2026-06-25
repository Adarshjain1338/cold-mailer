require("dotenv").config();
const { requireAuth } = require("../lib/auth");
const { createTransporter } = require("../lib/mailer");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  const user = requireAuth(req, res);
  if (!user) return;

  const { entries } = req.body;

  if (!entries || entries.length === 0) {
    return res.status(400).json({ error: "No history entries provided." });
  }

  const rows = entries
    .map(
      (e, i) =>
        `${i + 1}. To: ${e.to}\n   Subject: ${e.subject}\n   Template: ${e.template}\n   Time: ${e.date}`
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
    const transporter = createTransporter();
    await transporter.sendMail({
      from: `"${process.env.FROM_NAME}" <${process.env.GMAIL_USER}>`,
      to: process.env.GMAIL_USER,
      subject: `Cold Mail Summary — ${new Date().toLocaleDateString()}`,
      text: summaryBody,
    });

    return res.status(200).json({ message: "Summary sent to your inbox." });
  } catch (err) {
    console.error("Summary error:", err.message);
    return res.status(500).json({ error: "Failed to send summary." });
  }
};