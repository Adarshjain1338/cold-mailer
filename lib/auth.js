const { getAdminClient } = require("./supabase");

async function requireAuth(req, res) {
  const auth = req.headers["authorization"];
  if (!auth || !auth.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized." });
    return null;
  }

  const token = auth.slice(7);
  const supabase = getAdminClient();

  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    res.status(401).json({ error: "Session expired. Please log in again." });
    return null;
  }

  // Fetch role from user_settings
  const { data: settings } = await supabase
    .from("user_settings")
    .select("role")
    .eq("user_id", user.id)
    .single();

  return {
    id: user.id,
    email: user.email,
    role: settings?.role || "user",
  };
}

async function requireAdmin(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return null;
  if (user.role !== "admin") {
    res.status(403).json({ error: "Admin access required." });
    return null;
  }
  return user;
}

module.exports = { requireAuth, requireAdmin };