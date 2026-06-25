require("dotenv").config();
const { requireAuth } = require("../lib/auth");
const { UTApi } = require("uploadthing/server");

function getUTApi() {
  return new UTApi({ apiKey: process.env.UPLOADTHING_SECRET });
}

// Key naming convention:
// global resume   → key stored in env or looked up by name prefix "global_"
// template resume → looked up by name prefix "tpl_{id}_"

function buildFileName(scope, templateId, originalName) {
  const ext = originalName.split(".").pop();
  if (scope === "global") return `global_resume.${ext}`;
  return `tpl_${templateId}_resume.${ext}`;
}

module.exports = async function handler(req, res) {
  const user = requireAuth(req, res);
  if (!user) return;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  const { action, scope, templateId, fileBase64, fileName, mimeType } = req.body || {};
  const utapi = getUTApi();

  // ── GET ──
  if (action === "get") {
    try {
      const prefix = scope === "global" ? "global_resume" : `tpl_${templateId}_resume`;
      const { files } = await utapi.listFiles();
      const match = files.find((f) => f.name.startsWith(prefix));
      if (!match) return res.status(200).json(null);
      return res.status(200).json({
        key: match.key,
        name: match.name,
        url: `https://utfs.io/f/${match.key}`,
      });
    } catch (e) {
      console.error("Resume get error:", e.message);
      return res.status(500).json({ error: "Failed to fetch resume." });
    }
  }

  // ── UPLOAD ──
  if (action === "upload") {
    if (!fileBase64 || !fileName || !mimeType) {
      return res.status(400).json({ error: "File data missing." });
    }

    const allowed = [".pdf", ".doc", ".docx"];
    const ext = "." + fileName.split(".").pop().toLowerCase();
    if (!allowed.includes(ext)) {
      return res.status(400).json({ error: "Only PDF, DOC, DOCX allowed." });
    }

    try {
      // Delete existing first
      const prefix = scope === "global" ? "global_resume" : `tpl_${templateId}_resume`;
      const { files } = await utapi.listFiles();
      const existing = files.find((f) => f.name.startsWith(prefix));
      if (existing) await utapi.deleteFiles(existing.key).catch(() => {});

      // Upload new
      const safeName = buildFileName(scope, templateId, fileName);
      const buffer = Buffer.from(fileBase64, "base64");
      const file = new File([buffer], safeName, { type: mimeType });
      const result = await utapi.uploadFiles(file);

      if (result.error) throw new Error(result.error.message);

      return res.status(200).json({
        key: result.data.key,
        name: result.data.name,
        url: `https://utfs.io/f/${result.data.key}`,
      });
    } catch (e) {
      console.error("Resume upload error:", e.message);
      return res.status(500).json({ error: "Upload failed." });
    }
  }

  // ── DELETE ──
  if (action === "delete") {
    try {
      const prefix = scope === "global" ? "global_resume" : `tpl_${templateId}_resume`;
      const { files } = await utapi.listFiles();
      const existing = files.find((f) => f.name.startsWith(prefix));
      if (existing) await utapi.deleteFiles(existing.key);
      return res.status(200).json({ message: "Deleted." });
    } catch (e) {
      console.error("Resume delete error:", e.message);
      return res.status(500).json({ error: "Delete failed." });
    }
  }

  return res.status(400).json({ error: "Invalid action." });
};