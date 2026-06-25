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
app.use("/api/auth",     require("./api/auth"));
app.use("/api/config",   require("./api/config"));
app.use("/api/settings", require("./api/settings"));
app.use("/api/send",     require("./api/send"));
app.use("/api/summary",  require("./api/summary"));
app.use("/api/resume",   require("./api/resume"));
app.use("/api/ai",       require("./api/ai"));
app.use("/api/users",    require("./api/users"));

app.listen(3000, () => {
  console.log("Cold Mailer running at http://localhost:3000");
});