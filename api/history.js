require("dotenv").config();
const { requireAuth } = require("../lib/auth");
const { getAdminClient } = require("../lib/supabase");

module.exports = async function handler(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return;

  const admin = getAdminClient();

  if (req.method === "GET") {
    const { data, error } = await admin
      .from("email_history")
      .select("id, recipients, subject, status, sent_at, template_id")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .order("sent_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("History fetch error:", error.message);
      return res.status(500).json({ error: error.message });
    }

    // Sanitize rows — ensure recipients is always an array
    const sanitized = (data || []).map((h) => ({
      ...h,
      recipients: Array.isArray(h.recipients) ? h.recipients : [h.recipients].filter(Boolean),
    }));

    return res.status(200).json(sanitized);
  }

  if (req.method === "DELETE") {
    const { id, all } = req.body;

    if (all) {
      const { error } = await admin
        .from("email_history")
        .update({ deleted_at: new Date().toISOString() })
        .eq("user_id", user.id);

      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ message: "History cleared." });
    }

    if (!id) return res.status(400).json({ error: "ID required." });

    const { error } = await admin
      .from("email_history")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ message: "Entry deleted." });
  }

  return res.status(405).json({ error: "Method not allowed." });
};