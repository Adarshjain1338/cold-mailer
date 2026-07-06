require("dotenv").config();
const express = require("express");
const path = require("path");

const app = express();

app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

// ── PAGE ROUTES ──
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

// ── API ROUTES ──
app.use("/auth",      require("../api/auth"));
app.use("/config",    require("../api/config"));
app.use("/settings",  require("../api/settings"));
app.use("/send",      require("../api/send"));
// app.use("/summary",   require("../api/summary"));
app.use("/resume",    require("../api/resume"));
app.use("/ai",        require("../api/ai"));
app.use("/users",     require("../api/users"));
app.use("/templates", require("../api/templates"));
app.use("/history",   require("../api/history"));
app.use("/schedule",  require("../api/schedule"));
app.use("/cron/process-scheduled", require("../api/cron/process-scheduled"));

app.listen(3000, () => {
  console.log("Cold Mailer running at http://localhost:3000");
});