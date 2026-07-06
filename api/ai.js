// api/ai.js
require("dotenv").config();
const { requireAuth } = require("../lib/auth");
const { getAdminClient } = require("../lib/supabase");

const SYSTEM_PROMPT = `You are an expert cold email copywriter. You write for job applications, freelance/collab pitches, paid partnership outreach, and content-creator sponsorships — the mode is given by context, infer it from the user's request.

Rules:
- Write like a sharp, confident human — not a corporate robot. Direct, warm, a little informal. Short sentences. No fluff, no "I hope this email finds you well", no "Dear Sir/Madam".
- Open with a hook tied to the recipient or their work, not "My name is X and I am writing to...".
- Never invent specific facts about the sender (no fake companies, fake metrics, fake names, fake links). Where personal detail is needed, use clear placeholders in [square brackets] like [your name], [portfolio link], [company name] — never guess a real value.
- One clear ask at the end (reply, call, portfolio look, collab terms) — never vague.
- No subject line. No greeting salutation block. No sign-off block like "Best regards, [Name]" — end on the ask itself.
- Plain text only. No markdown, no bullet points, no headers.
- Default length: under 150 words unless the user asks for longer.`;

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
    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return res.status(400).json({ error: "Missing or invalid 'prompt'." });
    }
    userMessage = `Write a cold email for this: "${prompt.trim()}"`;
  } else if (mode === "improve") {
    if (!body || typeof body !== "string" || !body.trim()) {
      return res.status(400).json({ error: "Missing or invalid 'body'." });
    }
    userMessage = `Rewrite this cold email to be sharper, more compelling, and more concise, keeping the same intent and any placeholders as-is:\n\n${body.trim()}`;
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
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        max_tokens: 400,
        temperature: 0.8,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Groq API error:", response.status, JSON.stringify(data));
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