require("dotenv").config();
const { requireAuth } = require("../lib/auth");
const { getAdminClient } = require("../lib/supabase");

function replaceDynamicTokens(body, tokens) {
  let result = body;
  for (const [key, value] of Object.entries(tokens)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value || "");
  }
  return result;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  const { email, name, company, role, body, useAI } = req.body;
  if (!body) return res.status(400).json({ error: "Body is required." });

  const tokens = { name: name || "", company: company || "", role: role || "", email: email || "" };
  let personalizedBody = replaceDynamicTokens(body, tokens);

  if (useAI) {
    const admin = getAdminClient();
    const { data: settings } = await admin
      .from("user_settings")
      .select("groq_api_key, ai_enabled")
      .eq("user_id", user.id)
      .single();

    if (!settings?.ai_enabled || !settings?.groq_api_key) {
      return res.status(200).json({ body: personalizedBody, aiUsed: false, reason: "AI not enabled." });
    }

    const userPrompt = `Personalize this cold email for the recipient.
Recipient name: ${name || "there"}
Company: ${company || "their company"}
Role: ${role || "professional"}

Email:
${personalizedBody}

Return only the improved email body. Keep it under 200 words. No greetings or sign-offs.`;

    try {
      const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${settings.groq_api_key}`,
        },
        body: JSON.stringify({
          model: "llama3-8b-8192",
          messages: [{ role: "user", content: userPrompt }],
          max_tokens: 400,
          temperature: 0.7,
        }),
      });

      const groqData = await groqRes.json();
      const result = groqData.choices?.[0]?.message?.content?.trim();
      if (result) return res.status(200).json({ body: result, aiUsed: true });
    } catch (e) {
      console.error("Groq personalize error:", e.message);
    }
  }

  return res.status(200).json({ body: personalizedBody, aiUsed: false });
};
