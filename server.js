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

// ── API ROUTES (all consolidated into single function) ──
app.use("/api", require("./api/index"));

app.listen(3000, () => {
  console.log("Cold Mailer running at http://localhost:3000");
});