require("dotenv").config();
const { getAdminClient } = require("../../lib/supabase");
const nodemailer = require("nodemailer");
const https = require("https");

function fetchAttachment(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (response) => {
            const chunks = [];
            response.on("data", (chunk) => chunks.push(chunk));
            response.on("end", () => resolve(Buffer.concat(chunks)));
            response.on("error", reject);
        });
    });
}

module.exports = async function handler(req, res) {
    // Secure the cron endpoint
    const cronSecret = req.headers["x-cron-secret"];
    const isLocal = !process.env.VERCEL;

    if (!isLocal && cronSecret !== process.env.CRON_SECRET) {
        return res.status(401).json({ error: "Unauthorized." });
    }

    const admin = getAdminClient();
    const now = new Date().toISOString();

    // Fetch all pending emails due now
    const { data: due, error } = await admin
        .from("scheduled_emails")
        .select("*, user_id")
        .eq("status", "pending")
        .lte("scheduled_at", now)
        .limit(50);

    if (error) {
        console.error("Cron fetch error:", error.message);
        return res.status(500).json({ error: error.message });
    }

    if (!due || due.length === 0) {
        return res.status(200).json({ processed: 0 });
    }

    let processed = 0;
    let failed = 0;

    for (const email of due) {
        try {
            // Get user's Gmail settings
            const { data: settings } = await admin
                .from("user_settings")
                .select("gmail_user, gmail_app_password, from_name")
                .eq("user_id", email.user_id)
                .single();

            if (!settings?.gmail_user || !settings?.gmail_app_password) {
                await admin
                    .from("scheduled_emails")
                    .update({ status: "failed", error_message: "Gmail not configured." })
                    .eq("id", email.id);
                failed++;
                continue;
            }

            const transporter = nodemailer.createTransport({
                service: "gmail",
                auth: {
                    user: settings.gmail_user,
                    pass: settings.gmail_app_password,
                },
            });

            // Build attachment
            const attachments = [];
            if (email.attachment_url && email.attachment_name) {
                try {
                    const buffer = await fetchAttachment(email.attachment_url);
                    attachments.push({ filename: email.attachment_name, content: buffer });
                } catch (e) {
                    console.error("Attachment fetch error:", e.message);
                }
            }

            // Send to each recipient individually
            const failedRecipients = [];
            for (const recipient of email.to_addresses) {
                try {
                    await transporter.sendMail({
                        from: `"${settings.from_name || settings.gmail_user}" <${settings.gmail_user}>`,
                        to: recipient,
                        subject: email.subject,
                        text: email.body,
                        attachments,
                    });
                } catch (e) {
                    console.error(`Failed to send to ${recipient}:`, e.message);
                    failedRecipients.push(recipient);
                }
            }

            const status = failedRecipients.length === 0
                ? "sent"
                : failedRecipients.length === email.to_addresses.length
                    ? "failed"
                    : "sent";

            // Update scheduled email status
            await admin
                .from("scheduled_emails")
                .update({
                    status,
                    sent_at: new Date().toISOString(),
                    error_message: failedRecipients.length > 0
                        ? `Failed: ${failedRecipients.join(", ")}`
                        : null,
                })
                .eq("id", email.id);

            // Log to email_history
            await admin.from("email_history").insert({
                user_id: email.user_id,
                recipients: email.to_addresses,
                subject: email.subject,
                status,
                template_id: email.template_id || null,
                error_message: failedRecipients.length > 0
                    ? `Failed: ${failedRecipients.join(", ")}`
                    : null,
            });

            processed++;
        } catch (e) {
            console.error(`Error processing email ${email.id}:`, e.message);
            await admin
                .from("scheduled_emails")
                .update({ status: "failed", error_message: e.message })
                .eq("id", email.id);
            failed++;
        }
    }

    console.log(`Cron: processed=${processed} failed=${failed}`);
    return res.status(200).json({ processed, failed });
};