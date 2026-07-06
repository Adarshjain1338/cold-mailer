require("dotenv").config();
const { requireAuth } = require("../lib/auth");
const { getAdminClient } = require("../lib/supabase");

// Convert Asia/Kolkata time to UTC ISO string
// date: "2026-07-06", time: "14:30" (optional, defaults to "11:00")
function convertToUTC(date, time = "11:00") {
  const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

  if (!dateRegex.test(date)) {
    throw new Error("Invalid date format. Use YYYY-MM-DD");
  }

  if (!timeRegex.test(time)) {
    throw new Error("Invalid time format. Use HH:mm");
  }

  // Create a date string in ISO format (treating as local time first)
  const dateTimeStr = `${date}T${time}:00`;
  const localDate = new Date(dateTimeStr);

  if (isNaN(localDate.getTime())) {
    throw new Error("Invalid date or time");
  }

  // Asia/Kolkata is UTC+5:30
  // To convert from IST to UTC, subtract 5 hours 30 minutes
  const istOffset = 5.5 * 60 * 60 * 1000; // 5:30 in milliseconds
  const utcDate = new Date(localDate.getTime() - istOffset);

  return utcDate.toISOString();
}

// Validate email addresses
function validateEmails(emailStr) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const recipients = emailStr
    .split(",")
    .map((e) => e.trim())
    .filter((e) => e.length > 0);

  if (recipients.length === 0) {
    throw new Error("At least one email address is required");
  }

  const invalid = recipients.find((e) => !emailRegex.test(e));
  if (invalid) {
    throw new Error(`Invalid email address: ${invalid}`);
  }

  return recipients;
}

module.exports = async function handler(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return;

  const admin = getAdminClient();

  // GET — list scheduled emails
  if (req.method === "GET") {
    try {
      const { data, error } = await admin
        .from("scheduled_emails")
        .select("id, to_addresses, subject, scheduled_at, status, created_at")
        .eq("user_id", user.id)
        .in("status", ["pending", "failed"])
        .order("scheduled_at", { ascending: true });

      if (error) throw error;
      return res.status(200).json(data || []);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // POST — create scheduled email
  if (req.method === "POST") {
    try {
      const {
        to,
        subject,
        body,
        date,
        time,
        attachmentUrl,
        attachmentName,
      } = req.body;

      // Validation
      if (!to || !subject || !body || !date) {
        return res.status(400).json({
          error: "to, subject, body, and date are required. time is optional (defaults to 11:00 IST).",
        });
      }

      // Validate and parse emails
      const recipients = validateEmails(to);

      // Convert to UTC (defaults to 11:00 if time not provided)
      const scheduledAtUTC = convertToUTC(date, time || "11:00");

      // Validate it's a future date
      if (new Date(scheduledAtUTC) <= new Date()) {
        return res.status(400).json({
          error: "Scheduled time must be in the future",
        });
      }

      // Insert into database
      const { data, error } = await admin
        .from("scheduled_emails")
        .insert({
          user_id: user.id,
          to_addresses: recipients,
          subject,
          body,
          scheduled_at: scheduledAtUTC,
          attachment_url: attachmentUrl || null,
          attachment_name: attachmentName || null,
        })
        .select()
        .single();

      if (error) throw error;

      return res.status(201).json({
        message: "Email scheduled successfully",
        email: data,
      });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  // DELETE — cancel scheduled email
  if (req.method === "DELETE") {
    try {
      const { id } = req.body;
      if (!id) {
        return res.status(400).json({ error: "Email ID is required" });
      }

      const { error } = await admin
        .from("scheduled_emails")
        .update({ status: "cancelled" })
        .eq("id", id)
        .eq("user_id", user.id)
        .eq("status", "pending");

      if (error) throw error;

      return res.status(200).json({ message: "Email scheduled cancelled" });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
};