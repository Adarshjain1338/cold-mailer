require("dotenv").config();
const { requireAuth } = require("../lib/auth");
const { getAdminClient } = require("../lib/supabase");

module.exports = async function handler(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return;

  const admin = getAdminClient();

  // GET — list scheduled emails
  if (req.method === "GET") {
    const { data, error } = await admin
      .from("scheduled_emails")
      .select("id, to_addresses, subject, scheduled_at, status, created_at, template_id")
      .eq("user_id", user.id)
      .in("status", ["pending", "failed"])
      .order("scheduled_at", { ascending: true });

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data || []);
  }

  // POST — create scheduled email
  if (req.method === "POST") {
    const {
      to, subject, body,
      scheduledAt, attachmentUrl,
      attachmentName, templateId,
    } = req.body;

    if (!to || !subject || !body || !scheduledAt) {
      return res.status(400).json({ error: "to, subject, body and scheduledAt are required." });
    }

    const recipients = to
      .split(",")
      .map((e) => e.trim())
      .filter((e) => e.length > 0);

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalid = recipients.find((e) => !emailRegex.test(e));
    if (invalid) {
      return res.status(400).json({ error: `Invalid email: ${invalid}` });
    }

    const scheduled = new Date(scheduledAt);
    if (isNaN(scheduled.getTime()) || scheduled <= new Date()) {
      return res.status(400).json({ error: "scheduledAt must be a future date." });
    }

    const { data, error } = await admin
      .from("scheduled_emails")
      .insert({
        user_id: user.id,
        to_addresses: recipients,
        subject,
        body,
        scheduled_at: scheduled.toISOString(),
        attachment_url: attachmentUrl || null,
        attachment_name: attachmentName || null,
        template_id: templateId || null,
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  // DELETE — cancel scheduled email
  if (req.method === "DELETE") {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: "ID required." });

    const { error } = await admin
      .from("scheduled_emails")
      .update({ status: "cancelled" })
      .eq("id", id)
      .eq("user_id", user.id)
      .eq("status", "pending");

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ message: "Scheduled email cancelled." });
  }

  return res.status(405).json({ error: "Method not allowed." });
};