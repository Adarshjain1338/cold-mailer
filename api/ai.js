// api/ai.js
require("dotenv").config();
const { requireAuth } = require("../lib/auth");
const { getAdminClient } = require("../lib/supabase");

const SYSTEM_PROMPT = `You are an expert cold email copywriter.


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

    userMessage = `Write a professional cold email for:

${prompt.trim()}

Return ONLY the email body.`;
  } else if (mode === "improve") {
    if (!body || typeof body !== "string" || !body.trim()) {
      return res.status(400).json({ error: "Missing or invalid 'body'." });
    }

    userMessage = `Improve this cold email:

${body.trim()}

Return ONLY the improved email body.`;
  } else {
    return res.status(400).json({ error: "Invalid mode." });
  }

  try {

    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${settings.groq_api_key}`,
        },
        body: JSON.stringify({

          // If this still fails, replace with a single user message
          messages: [
            {
              role: "user",
              content: SYSTEM_PROMPT,
            },
            {
              role: "user",
              content: userMessage,
            },
          ],

          temperature: 0.7,
          max_tokens: 300,
        }),
      }
    );

    const data = await response.json();

    console.log("========== GROQ RESPONSE ==========");
    console.log(JSON.stringify(data, null, 2));
    console.log("===================================");

    if (!response.ok) {
      return res.status(502).json({
        error:
          data?.error?.message ||
          `Groq returned HTTP ${response.status}`,
      });
    }

    const choice = data?.choices?.[0];

    console.log("Finish Reason:", choice?.finish_reason);
    console.log("Message:", JSON.stringify(choice?.message, null, 2));

    // Support multiple response formats
    let result =
      choice?.message?.content ??
      choice?.text ??
      "";

    if (Array.isArray(result)) {
      result = result
        .map((x) => x.text || x.content || "")
        .join("");
    }

    result = String(result).trim();

    if (!result) {
      console.error("No content returned from Groq.");
      return res.status(500).json({
        error: "AI returned empty response.",
        finish_reason: choice?.finish_reason,
        raw: choice,
      });
    }

    return res.status(200).json({
      result,
    });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      error: err.message,
    });
  }
}