require("dotenv").config();
const { requireAuth } = require("../lib/auth");
const { UTApi } = require("uploadthing/server");
const fs = require("fs");
const path = require("path");

const STORE_PATH = path.join(process.cwd(), "resume-store.json");

function getUTApi() {
  return new UTApi({ token: process.env.UPLOADTHING_TOKEN });
}

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

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  const { action, scope, templateId, fileBase64, fileName, mimeType } = req.body || {};
  const store = readStore();

  // ── GET ──
  if (action === "get") {
    if (scope === "global") {
      return res.status(200).json(store.global || null);
    }
    if (scope === "template" && templateId) {
      return res.status(200).json(store.templates[templateId] || null);
    }
    return res.status(400).json({ error: "Invalid scope." });
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
      const utapi = getUTApi();

      // Delete old file if exists
      if (scope === "global" && store.global?.key) {
        await utapi.deleteFiles([store.global.key]).catch(() => {});
      }
      if (scope === "template" && templateId && store.templates[templateId]?.key) {
        await utapi.deleteFiles([store.templates[templateId].key]).catch(() => {});
      }

      // Upload new file
      const buffer = Buffer.from(fileBase64, "base64");
      const file = new File([buffer], fileName, { type: mimeType });
      const response = await utapi.uploadFiles([file]);

      if (!response?.[0]?.data) {
        const errMsg = response?.[0]?.error?.message || "Upload failed.";
        console.error("UT upload error:", errMsg);
        return res.status(500).json({ error: errMsg });
      }

      const uploaded = {
        key: response[0].data.key,
        name: response[0].data.name,
        url: response[0].data.ufsUrl || response[0].data.url,
      };

      if (scope === "global") {
        store.global = uploaded;
      } else if (scope === "template" && templateId) {
        store.templates[templateId] = uploaded;
      }

      writeStore(store);
      return res.status(200).json(uploaded);
    } catch (e) {
      console.error("Resume upload error:", e.message);
      return res.status(500).json({ error: "Upload failed: " + e.message });
    }
  }

  // ── DELETE ──
  if (action === "delete") {
    try {
      const utapi = getUTApi();

      if (scope === "global" && store.global?.key) {
        await utapi.deleteFiles([store.global.key]).catch(() => {});
        store.global = null;
      } else if (scope === "template" && templateId && store.templates[templateId]?.key) {
        await utapi.deleteFiles([store.templates[templateId].key]).catch(() => {});
        delete store.templates[templateId];
      }

      writeStore(store);
      return res.status(200).json({ message: "Deleted." });
    } catch (e) {
      console.error("Resume delete error:", e.message);
      return res.status(500).json({ error: "Delete failed." });
    }
  }

  return res.status(400).json({ error: "Invalid action." });
};