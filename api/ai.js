require("dotenv").config();
const { requireAuth } = require("../lib/auth");
const { getAdminClient } = require("../lib/supabase");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  const admin = getAdminClient();

  const { data: settings } = await admin
    .from("user_settings")
    .select("ai_enabled, groq_api_key")
    .eq("user_id", user.id)
    .single();

  if (!settings?.ai_enabled) {
    return res.status(403).json({ error: "AI is disabled." });
  }

  if (!settings?.groq_api_key) {
    return res.status(403).json({ error: "No Groq API key configured." });
  }

  const { mode, prompt, body } = req.body;
  let userMessage = "";

  if (mode === "compose") {
    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "Missing or invalid 'prompt'." });
    }
    userMessage = `Write a professional cold email for this purpose: "${prompt}".
Return only the email body, no subject line, no salutation like "Dear Sir".
Start directly. Keep it under 150 words. Conversational, not robotic.`;
  } else if (mode === "improve") {
    if (!body || typeof body !== "string") {
      return res.status(400).json({ error: "Missing or invalid 'body'." });
    }
    userMessage = `Improve this cold email. Make it more professional, concise and compelling.
Return only the improved email body, nothing else. Keep it under 150 words.

Email:
${body}`;
  } else {
    return res.status(400).json({ error: "Invalid mode." });
  }

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.groq_api_key}`,
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || "llama-3.1-8b-instant",
        messages: [{ role: "user", content: userMessage }],
        max_tokens: 300,
        temperature: 0.7,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Groq API error:", response.status, JSON.stringify(data));
      // 401 = bad key, 429 = rate limit, 400 = bad/deprecated model or payload
      return res.status(502).json({
        error: `AI provider error (${response.status}): ${data?.error?.message || "unknown"}`,
      });
    }

    const result = data.choices?.[0]?.message?.content?.trim();
    if (!result) {
      console.error("Groq returned no content:", JSON.stringify(data));
      return res.status(500).json({ error: "AI returned empty response." });
    }

    return res.status(200).json({ result });
  } catch (err) {
    console.error("AI error:", err.message);
    return res.status(500).json({ error: "AI request failed." });
  }
};