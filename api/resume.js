require("dotenv").config();
const { requireAuth } = require("../lib/auth");
const { uploadFile, deleteFile } = require("../lib/uploadthing");
const fs = require("fs");
const path = require("path");

// Local JSON store for resume metadata
const STORE_PATH = path.join(process.cwd(), "resume-store.json");

function readStore() {
  if (!fs.existsSync(STORE_PATH)) return { global: null, templates: {} };
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
  } catch (e) {
    return { global: null, templates: {} };
  }
}

function writeStore(data) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2));
}

module.exports = async function handler(req, res) {
  const user = requireAuth(req, res);
  if (!user) return;

  const { action, scope, templateId, fileBase64, fileName, mimeType } = req.body || {};
  const store = readStore();

  // GET global
  if (req.method === "GET" && req.url.includes("global")) {
    return res.status(200).json(store.global || null);
  }

  // GET template
  if (req.method === "GET" && req.url.includes("template")) {
    const id = req.url.split("/").pop();
    return res.status(200).json(store.templates[id] || null);
  }

  // UPLOAD
  if (req.method === "POST" && action === "upload") {
    if (!fileBase64 || !fileName || !mimeType) {
      return res.status(400).json({ error: "File data missing." });
    }

    const allowed = [".pdf", ".doc", ".docx"];
    const ext = path.extname(fileName).toLowerCase();
    if (!allowed.includes(ext)) {
      return res.status(400).json({ error: "Only PDF, DOC, DOCX allowed." });
    }

    try {
      const buffer = Buffer.from(fileBase64, "base64");
      const uploaded = await uploadFile(buffer, fileName, mimeType);

      if (scope === "global") {
        if (store.global?.key) {
          await deleteFile(store.global.key).catch(() => {});
        }
        store.global = uploaded;
      } else if (scope === "template" && templateId) {
        if (store.templates[templateId]?.key) {
          await deleteFile(store.templates[templateId].key).catch(() => {});
        }
        store.templates[templateId] = uploaded;
      }

      writeStore(store);
      return res.status(200).json(uploaded);
    } catch (e) {
      console.error("Upload error:", e.message);
      return res.status(500).json({ error: "Upload failed." });
    }
  }

  // DELETE
  if (req.method === "POST" && action === "delete") {
    try {
      if (scope === "global" && store.global) {
        await deleteFile(store.global.key).catch(() => {});
        store.global = null;
      } else if (scope === "template" && templateId && store.templates[templateId]) {
        await deleteFile(store.templates[templateId].key).catch(() => {});
        delete store.templates[templateId];
      }
      writeStore(store);
      return res.status(200).json({ message: "Deleted." });
    } catch (e) {
      return res.status(500).json({ error: "Delete failed." });
    }
  }

  return res.status(400).json({ error: "Invalid request." });
};