require("dotenv").config();
const { requireAuth } = require("../lib/auth");
const { getAdminClient } = require("../lib/supabase");
const { UTApi } = require("uploadthing/server");

function getUTApi() {
  return new UTApi({ token: process.env.UPLOADTHING_TOKEN });
}

module.exports = async function handler(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  const { action, scope, templateId, fileBase64, fileName, mimeType, fileSize } = req.body || {};
  const admin = getAdminClient();

  // ── GET ──
  if (action === "get") {
    let query = admin
      .from("resumes")
      .select("id, file_key, file_name, file_url, file_size, scope, template_id")
      .eq("user_id", user.id)
      .eq("scope", scope);

    if (scope === "template" && templateId) {
      query = query.eq("template_id", templateId);
    } else {
      query = query.is("template_id", null);
    }

    const { data, error } = await query.single();

    if (error && error.code !== "PGRST116") {
      return res.status(500).json({ error: error.message });
    }

    if (!data) return res.status(200).json(null);

    return res.status(200).json({
      id: data.id,
      key: data.file_key,
      name: data.file_name,
      url: data.file_url,
      size: data.file_size,
    });
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

    // Check resume limit (max 5 per user)
    const { count } = await admin
      .from("resumes")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);

    // Check duplicate
    let dupQuery = admin
      .from("resumes")
      .select("id, file_name, file_size")
      .eq("user_id", user.id)
      .eq("scope", scope);

    if (scope === "template" && templateId) {
      dupQuery = dupQuery.eq("template_id", templateId);
    } else {
      dupQuery = dupQuery.is("template_id", null);
    }

    const { data: existing } = await dupQuery.single();

    if (
      existing &&
      existing.file_name === fileName &&
      existing.file_size === fileSize
    ) {
      return res.status(409).json({ error: "This file is already uploaded." });
    }

    // Check limit only for new uploads (not replacements)
    if (!existing && count >= 5) {
      return res.status(400).json({ error: "Maximum 5 resumes allowed." });
    }

    try {
      const utapi = getUTApi();

      // Delete old file from Uploadthing if replacing
      if (existing?.file_key) {
        await utapi.deleteFiles([existing.file_key]).catch(() => {});
      }

      // Upload to Uploadthing
      const buffer = Buffer.from(fileBase64, "base64");
      const file = new File([buffer], fileName, { type: mimeType });
      const response = await utapi.uploadFiles([file]);

      if (!response?.[0]?.data) {
        const errMsg = response?.[0]?.error?.message || "Upload failed.";
        return res.status(500).json({ error: errMsg });
      }

      const uploaded = {
        key: response[0].data.key,
        name: response[0].data.name,
        url: response[0].data.ufsUrl || response[0].data.url,
        size: fileSize || null,
      };

      // Upsert in Supabase
      if (existing) {
        await admin
          .from("resumes")
          .update({
            file_key: uploaded.key,
            file_name: uploaded.name,
            file_url: uploaded.url,
            file_size: uploaded.size,
          })
          .eq("id", existing.id);
      } else {
        await admin.from("resumes").insert({
          user_id: user.id,
          template_id: scope === "template" ? templateId : null,
          scope,
          file_key: uploaded.key,
          file_name: uploaded.name,
          file_url: uploaded.url,
          file_size: uploaded.size,
        });
      }

      return res.status(200).json(uploaded);
    } catch (e) {
      console.error("Resume upload error:", e.message);
      return res.status(500).json({ error: "Upload failed: " + e.message });
    }
  }

  // ── DELETE ──
  if (action === "delete") {
    try {
      let query = admin
        .from("resumes")
        .select("id, file_key")
        .eq("user_id", user.id)
        .eq("scope", scope);

      if (scope === "template" && templateId) {
        query = query.eq("template_id", templateId);
      } else {
        query = query.is("template_id", null);
      }

      const { data: existing } = await query.single();

      if (existing) {
        const utapi = getUTApi();
        await utapi.deleteFiles([existing.file_key]).catch(() => {});
        await admin.from("resumes").delete().eq("id", existing.id);
      }

      return res.status(200).json({ message: "Deleted." });
    } catch (e) {
      console.error("Resume delete error:", e.message);
      return res.status(500).json({ error: "Delete failed." });
    }
  }

  return res.status(400).json({ error: "Invalid action." });
};