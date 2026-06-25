const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");

const STORE = path.join(process.cwd(), "users.json");

function readUsers() {
  if (!fs.existsSync(STORE)) return [];
  try {
    return JSON.parse(fs.readFileSync(STORE, "utf8"));
  } catch (e) {
    return [];
  }
}

function writeUsers(users) {
  fs.writeFileSync(STORE, JSON.stringify(users, null, 2));
}

function findUser(username) {
  return readUsers().find((u) => u.username === username) || null;
}

async function createUser(username, password, role = "user") {
  const users = readUsers();
  if (users.find((u) => u.username === username)) {
    throw new Error("Username already exists.");
  }
  const hashed = await bcrypt.hash(password, 10);
  const user = {
    id: Date.now().toString(),
    username,
    password: hashed,
    role,
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  writeUsers(users);
  return { id: user.id, username: user.username, role: user.role };
}

async function verifyPassword(username, password) {
  const user = findUser(username);
  if (!user) return null;
  const match = await bcrypt.compare(password, user.password);
  return match ? user : null;
}

function listUsers() {
  return readUsers().map((u) => ({
    id: u.id,
    username: u.username,
    role: u.role,
    createdAt: u.createdAt,
  }));
}

function deleteUser(id) {
  const users = readUsers().filter((u) => u.id !== id);
  writeUsers(users);
}

module.exports = { findUser, createUser, verifyPassword, listUsers, deleteUser };