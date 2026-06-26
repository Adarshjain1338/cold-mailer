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

  // GET
  if (action === "get") {
    let query = admin
      .from("resumes")
      .select("id,file_key,file_name,file_url,file_size,scope,template_id")
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

    if (!data) {
      return res.status(200).json(null);
    }

    return res.status(200).json({
      id: data.id,
      key: data.file_key,
      name: data.file_name,
      url: data.file_url,
      size: data.file_size,
    });
  }

  // UPLOAD
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
      let query = admin
        .from("resumes")
        .select("*")
        .eq("user_id", user.id)
        .eq("scope", scope);

      if (scope === "template" && templateId) {
        query = query.eq("template_id", templateId);
      } else {
        query = query.is("template_id", null);
      }

      const { data: existing } = await query.single();

      const utapi = getUTApi();

      if (existing?.file_key) {
        await utapi.deleteFiles([existing.file_key]).catch(() => {});
      }

      const buffer = Buffer.from(fileBase64, "base64");
      const file = new File([buffer], fileName, { type: mimeType });

      const response = await utapi.uploadFiles([file]);

      if (!response?.[0]?.data) {
        return res.status(500).json({ error: "Upload failed." });
      }

      const uploaded = {
        key: response[0].data.key,
        name: response[0].data.name,
        url: response[0].data.ufsUrl || response[0].data.url,
        size: fileSize || null,
      };

      if (existing) {
        const { error } = await admin
          .from("resumes")
          .update({
            file_key: uploaded.key,
            file_name: uploaded.name,
            file_url: uploaded.url,
            file_size: uploaded.size,
          })
          .eq("id", existing.id);

        if (error) {
          return res.status(500).json({ error: error.message });
        }
      } else {
        const { error } = await admin
          .from("resumes")
          .insert({
            user_id: user.id,
            template_id: scope === "template" ? templateId : null,
            scope,
            file_key: uploaded.key,
            file_name: uploaded.name,
            file_url: uploaded.url,
            file_size: uploaded.size,
          });

        if (error) {
          return res.status(500).json({ error: error.message });
        }
      }

      return res.status(200).json(uploaded);
    } catch (e) {
      console.error("Resume upload error:", e);
      return res.status(500).json({
        error: "Upload failed: " + e.message,
      });
    }
  }

  // DELETE
  if (action === "delete") {
    try {
      let query = admin
        .from("resumes")
        .select("*")
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

        if (existing.file_key) {
          await utapi.deleteFiles([existing.file_key]).catch(() => {});
        }

        await admin
          .from("resumes")
          .delete()
          .eq("id", existing.id);
      }

      return res.status(200).json({
        message: "Deleted.",
      });
    } catch (e) {
      return res.status(500).json({
        error: "Delete failed.",
      });
    }
  }

  return res.status(400).json({
    error: "Invalid action.",
  });
};