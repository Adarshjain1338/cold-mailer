require("dotenv").config();
const { requireAuth } = require("../lib/auth");
const { getAdminClient } = require("../lib/supabase");

module.exports = async function handler(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return;

  const admin = getAdminClient();

  // GET all templates
  if (req.method === "GET") {
    const { data, error } = await admin
      .from("templates")
      .select("id, name, subject, body, signature, created_at")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data || []);
  }

  // POST — create template
  if (req.method === "POST") {
    const { name, subject, body, signature } = req.body;
    if (!name || !subject || !body) {
      return res.status(400).json({ error: "Name, subject and body are required." });
    }

    const { data, error } = await admin
      .from("templates")
      .insert({ user_id: user.id, name, subject, body, signature: signature || null })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  // PUT — update template
  if (req.method === "PUT") {
    const { id, name, subject, body, signature } = req.body;
    if (!id || !name || !subject || !body) {
      return res.status(400).json({ error: "ID, name, subject and body are required." });
    }

    const { data, error } = await admin
      .from("templates")
      .update({ name, subject, body, signature: signature || null })
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  // DELETE — soft delete
  if (req.method === "DELETE") {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: "Template ID required." });

    const { error } = await admin
      .from("templates")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ message: "Template deleted." });
  }

  return res.status(405).json({ error: "Method not allowed." });
};