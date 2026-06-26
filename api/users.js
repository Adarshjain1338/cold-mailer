require("dotenv").config();
const { requireAuth } = require("../lib/auth");
const { getAdminClient } = require("../lib/supabase");

module.exports = async function handler(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return;

  if (user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required." });
  }

  const admin = getAdminClient();

  // List users
  if (req.method === "GET") {
    const { data, error } = await admin
      .from("user_settings")
      .select("user_id, role, created_at")
      .order("created_at", { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    // Get emails from auth
    const { data: authUsers } = await admin.auth.admin.listUsers();
    const emailMap = {};
    authUsers?.users?.forEach((u) => { emailMap[u.id] = u.email; });

    const users = (data || []).map((u) => ({
      id: u.user_id,
      email: emailMap[u.user_id] || "unknown",
      role: u.role,
      createdAt: u.created_at,
    }));

    return res.status(200).json(users);
  }

  // Create user
  if (req.method === "POST") {
    const { email, password, role } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    if (role && !["admin", "user"].includes(role)) {
      return res.status(400).json({ error: "Role must be admin or user." });
    }

    // Create in Supabase Auth
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createError) {
      return res.status(409).json({ error: createError.message });
    }

    // Create settings row with role
    await admin.from("user_settings").insert({
      user_id: created.user.id,
      role: role || "user",
    });

    return res.status(201).json({
      id: created.user.id,
      email: created.user.email,
      role: role || "user",
    });
  }

  // Delete user
  if (req.method === "DELETE") {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: "User ID required." });

    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({ message: "User deleted." });
  }

  return res.status(405).json({ error: "Method not allowed." });
};