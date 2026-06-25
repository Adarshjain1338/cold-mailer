require("dotenv").config();
const { requireAuth } = require("../lib/auth");
const { createUser, listUsers, deleteUser } = require("../lib/users");

module.exports = async function handler(req, res) {
  const user = requireAuth(req, res);
  if (!user) return;

  if (user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required." });
  }

  if (req.method === "GET") {
    return res.status(200).json(listUsers());
  }

  if (req.method === "POST") {
    const { username, password, role } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required." });
    }
    if (role && !["admin", "user"].includes(role)) {
      return res.status(400).json({ error: "Role must be admin or user." });
    }
    try {
      const created = await createUser(username, password, role || "user");
      return res.status(201).json(created);
    } catch (e) {
      return res.status(409).json({ error: e.message });
    }
  }

  if (req.method === "DELETE") {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: "User ID required." });
    deleteUser(id);
    return res.status(200).json({ message: "User deleted." });
  }

  return res.status(405).json({ error: "Method not allowed." });
};
