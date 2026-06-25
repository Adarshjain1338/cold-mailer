// ── AUTH GUARD ──
const token = localStorage.getItem("cm_token");
if (!token) window.location.href = "/login";

function authHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${localStorage.getItem("cm_token")}`,
  };
}

function handleUnauth(res) {
  if (res.status === 401) {
    localStorage.removeItem("cm_token");
    window.location.href = "/login";
    return true;
  }
  return false;
}

// ── STATE ──
let templates = JSON.parse(localStorage.getItem("cm_templates") || "[]");
let history = JSON.parse(localStorage.getItem("cm_history") || "[]");
let globalSignature = localStorage.getItem("cm_signature") || "";
let globalResume = null;
let activeTemplateId = null;
let editingId = null;
let tplResumeOverride = null;

// ── INIT ──
document.addEventListener("DOMContentLoaded", async () => {
  await loadGlobalResume();
  renderTemplates();
  updateResumeBanner();
  await checkAiAvailability();
  setupSidebar();
  setupSendButton();
  setupTemplateModal();
  setupGlobalResumeModal();
  setupHistoryModal();
  setupSignatureModal();
  setupSettingsModal();
  setupAiToggle();
  setupAiButtons();
  setupLogout();
});

// ── SIDEBAR ──
function setupSidebar() {
  document.getElementById("btnToggleSidebar").addEventListener("click", () => {
    document.getElementById("sidebar").classList.toggle("collapsed");
    document.getElementById("main").classList.toggle("expanded");
  });
}

// ── LOGOUT ──
function setupLogout() {
  document.getElementById("btnLogout").addEventListener("click", () => {
    if (!confirm("Sign out?")) return;
    localStorage.removeItem("cm_token");
    window.location.href = "/login";
  });
}

// ── AI AVAILABILITY ──
async function checkAiAvailability() {
  try {
    const res = await fetch("/api/config", { headers: authHeaders() });
    if (handleUnauth(res)) return;
    const data = await res.json();
    if (data.aiAvailable) {
      document.getElementById("aiToggleWrap").style.display = "flex";
    }
  } catch (e) {}
}

// ── AI TOGGLE ──
function setupAiToggle() {
  document.getElementById("aiToggle").addEventListener("change", (e) => {
    document.getElementById("aiBar").style.display = e.target.checked
      ? "flex"
      : "none";
  });
}

// ── AI BUTTONS ──
function setupAiButtons() {
  document.getElementById("btnAiCompose").addEventListener("click", aiCompose);
  document.getElementById("btnAiImprove").addEventListener("click", aiImprove);
}

async function aiCompose() {
  const prompt = document.getElementById("aiPrompt").value.trim();
  if (!prompt) {
    showToast("Describe the email purpose first.", "error");
    return;
  }
  setAiLoading(true);
  try {
    const res = await fetch("/api/ai", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ mode: "compose", prompt }),
    });
    if (handleUnauth(res)) return;
    const data = await res.json();
    if (res.ok) {
      document.getElementById("body").value = data.result;
      showToast("Email composed.", "success");
    } else {
      showToast(data.error || "AI failed.", "error");
    }
  } catch (e) {
    showToast("Network error.", "error");
  } finally {
    setAiLoading(false);
  }
}

async function aiImprove() {
  const body = document.getElementById("body").value.trim();
  if (!body) {
    showToast("Write something first, then improve it.", "error");
    return;
  }
  setAiLoading(true);
  try {
    const res = await fetch("/api/ai", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ mode: "improve", body }),
    });
    if (handleUnauth(res)) return;
    const data = await res.json();
    if (res.ok) {
      document.getElementById("body").value = data.result;
      showToast("Email improved.", "success");
    } else {
      showToast(data.error || "AI failed.", "error");
    }
  } catch (e) {
    showToast("Network error.", "error");
  } finally {
    setAiLoading(false);
  }
}

function setAiLoading(loading) {
  document.getElementById("btnAiCompose").disabled = loading;
  document.getElementById("btnAiImprove").disabled = loading;
  document.getElementById("btnAiCompose").textContent = loading ? "..." : "Compose";
  document.getElementById("btnAiImprove").textContent = loading ? "..." : "Improve";
}

// ── TEMPLATES ──
function renderTemplates() {
  const list = document.getElementById("templateList");
  if (templates.length === 0) {
    list.innerHTML = `<div class="template-empty">No templates yet.<br/>Click + New to create one.</div>`;
    return;
  }
  list.innerHTML = templates
    .map(
      (t) => `
      <div class="template-item ${t.id === activeTemplateId ? "active" : ""}" data-id="${t.id}">
        <span class="template-name" title="${escHtml(t.name)}">${escHtml(t.name)}</span>
        <div class="template-actions">
          <button class="btn-tpl-edit" data-id="${t.id}">Edit</button>
          <button class="btn-tpl-delete" data-id="${t.id}">Delete</button>
        </div>
      </div>`
    )
    .join("");

  list.querySelectorAll(".template-item").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (e.target.closest(".template-actions")) return;
      loadTemplate(el.dataset.id);
    });
  });

  list.querySelectorAll(".btn-tpl-edit").forEach((btn) => {
    btn.addEventListener("click", () => openEditTemplate(btn.dataset.id));
  });

  list.querySelectorAll(".btn-tpl-delete").forEach((btn) => {
    btn.addEventListener("click", () => deleteTemplate(btn.dataset.id));
  });
}

async function loadTemplate(id) {
  const tpl = templates.find((t) => t.id === id);
  if (!tpl) return;
  document.getElementById("subject").value = tpl.subject;
  document.getElementById("body").value = tpl.body;
  document.getElementById("to").focus();
  activeTemplateId = id;
  renderTemplates();
  await updateResumeBanner();
  showToast("Template loaded.", "success");
}

// ── RESUME BANNER ──
async function updateResumeBanner() {
  const banner = document.getElementById("resumeBanner");
  const bannerName = document.getElementById("resumeBannerName");
  const bannerTag = document.getElementById("resumeBannerTag");

  if (activeTemplateId) {
    try {
      const res = await fetch("/api/resume", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ action: "get", scope: "template", templateId: activeTemplateId }),
      });
      const data = await res.json();
      if (data?.name) {
        banner.style.display = "flex";
        bannerName.textContent = data.name;
        bannerTag.textContent = "Template override";
        return;
      }
    } catch (e) {}
  }

  if (globalResume?.name) {
    banner.style.display = "flex";
    bannerName.textContent = globalResume.name;
    bannerTag.textContent = "Global";
    return;
  }

  banner.style.display = "none";
}

// ── GLOBAL RESUME ──
async function loadGlobalResume() {
  try {
    const res = await fetch("/api/resume", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ action: "get", scope: "global" }),
    });
    globalResume = await res.json();
  } catch (e) {
    globalResume = null;
  }
}

function setupGlobalResumeModal() {
  document.getElementById("btnGlobalResume").addEventListener("click", openGlobalResumeModal);
  document.getElementById("globalResumeClose").addEventListener("click", closeGlobalResumeModal);
  document.getElementById("globalResumeCancel").addEventListener("click", closeGlobalResumeModal);

  document.getElementById("globalResumeModal").addEventListener("click", (e) => {
    if (e.target === document.getElementById("globalResumeModal")) closeGlobalResumeModal();
  });

  document.getElementById("globalResumeUploadBtn").addEventListener("click", () => {
    document.getElementById("globalResumeInput").click();
  });

  document.getElementById("globalResumeInput").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    await uploadResume(file, "global", null);
    e.target.value = "";
  });

  document.getElementById("globalResumeDeleteBtn").addEventListener("click", async () => {
    if (!confirm("Remove global resume?")) return;
    await fetch("/api/resume", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ action: "delete", scope: "global" }),
    });
    globalResume = null;
    renderGlobalResumeModal();
    await updateResumeBanner();
    showToast("Global resume removed.", "error");
  });
}

async function uploadResume(file, scope, templateId) {
  const base64 = await fileToBase64(file);
  try {
    const res = await fetch("/api/resume", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        action: "upload",
        scope,
        templateId,
        fileBase64: base64,
        fileName: file.name,
        mimeType: file.type,
      }),
    });
    if (handleUnauth(res)) return null;
    const data = await res.json();
    if (res.ok) {
      if (scope === "global") {
        globalResume = data;
        renderGlobalResumeModal();
      } else {
        tplResumeOverride = data;
        document.getElementById("tplResumeCurrentName").textContent = data.name;
        document.getElementById("tplResumeDeleteBtn").style.display = "inline-block";
      }
      await updateResumeBanner();
      showToast("Resume uploaded.", "success");
      return data;
    } else {
      showToast(data.error || "Upload failed.", "error");
      return null;
    }
  } catch (e) {
    showToast("Upload failed.", "error");
    return null;
  }
}

function openGlobalResumeModal() {
  renderGlobalResumeModal();
  document.getElementById("globalResumeModal").classList.add("open");
}

function closeGlobalResumeModal() {
  document.getElementById("globalResumeModal").classList.remove("open");
}

function renderGlobalResumeModal() {
  const nameEl = document.getElementById("globalResumeCurrentName");
  const deleteBtn = document.getElementById("globalResumeDeleteBtn");
  if (globalResume?.name) {
    nameEl.textContent = globalResume.name;
    deleteBtn.style.display = "inline-block";
  } else {
    nameEl.textContent = "None uploaded";
    deleteBtn.style.display = "none";
  }
}

// ── TEMPLATE MODAL ──
function setupTemplateModal() {
  document.getElementById("btnAddTemplate").addEventListener("click", openAddTemplate);
  document.getElementById("modalClose").addEventListener("click", closeTemplateModal);
  document.getElementById("modalCancel").addEventListener("click", closeTemplateModal);
  document.getElementById("modalSave").addEventListener("click", saveTemplate);

  document.getElementById("templateModal").addEventListener("click", (e) => {
    if (e.target === document.getElementById("templateModal")) closeTemplateModal();
  });

  document.getElementById("tplResumeUploadBtn").addEventListener("click", () => {
    document.getElementById("tplResumeInput").click();
  });

  document.getElementById("tplResumeInput").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (editingId) {
      await uploadResume(file, "template", editingId);
    } else {
      tplResumeOverride = { pendingFile: file };
      document.getElementById("tplResumeCurrentName").textContent = file.name;
      document.getElementById("tplResumeDeleteBtn").style.display = "inline-block";
    }
    e.target.value = "";
  });

  document.getElementById("tplResumeDeleteBtn").addEventListener("click", async () => {
    if (!confirm("Remove resume override for this template?")) return;
    if (editingId) {
      await fetch("/api/resume", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ action: "delete", scope: "template", templateId: editingId }),
      });
    }
    tplResumeOverride = null;
    document.getElementById("tplResumeCurrentName").textContent = "No override set";
    document.getElementById("tplResumeDeleteBtn").style.display = "none";
  });
}

function openAddTemplate() {
  editingId = null;
  tplResumeOverride = null;
  document.getElementById("modalTitle").textContent = "New Template";
  document.getElementById("tplName").value = "";
  document.getElementById("tplSubject").value = "";
  document.getElementById("tplBody").value = "";
  document.getElementById("tplSignature").value = "";
  document.getElementById("tplResumeCurrentName").textContent = "No override set";
  document.getElementById("tplResumeDeleteBtn").style.display = "none";
  document.getElementById("templateModal").classList.add("open");
  document.getElementById("tplName").focus();
}

async function openEditTemplate(id) {
  const tpl = templates.find((t) => t.id === id);
  if (!tpl) return;
  editingId = id;
  tplResumeOverride = null;
  document.getElementById("modalTitle").textContent = "Edit Template";
  document.getElementById("tplName").value = tpl.name;
  document.getElementById("tplSubject").value = tpl.subject;
  document.getElementById("tplBody").value = tpl.body;
  document.getElementById("tplSignature").value = tpl.signature || "";

  try {
    const res = await fetch("/api/resume", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ action: "get", scope: "template", templateId: id }),
    });
    const data = await res.json();
    if (data?.name) {
      tplResumeOverride = data;
      document.getElementById("tplResumeCurrentName").textContent = data.name;
      document.getElementById("tplResumeDeleteBtn").style.display = "inline-block";
    } else {
      document.getElementById("tplResumeCurrentName").textContent = "No override set";
      document.getElementById("tplResumeDeleteBtn").style.display = "none";
    }
  } catch (e) {
    document.getElementById("tplResumeCurrentName").textContent = "No override set";
    document.getElementById("tplResumeDeleteBtn").style.display = "none";
  }

  document.getElementById("templateModal").classList.add("open");
  document.getElementById("tplName").focus();
}

function closeTemplateModal() {
  document.getElementById("templateModal").classList.remove("open");
  editingId = null;
  tplResumeOverride = null;
}

async function saveTemplate() {
  const name = document.getElementById("tplName").value.trim();
  const subject = document.getElementById("tplSubject").value.trim();
  const body = document.getElementById("tplBody").value.trim();
  const signature = document.getElementById("tplSignature").value.trim();

  if (!name || !subject || !body) {
    showToast("Name, subject and body are required.", "error");
    return;
  }

  let savedId = editingId;

  if (editingId) {
    templates = templates.map((t) =>
      t.id === editingId ? { ...t, name, subject, body, signature } : t
    );
  } else {
    savedId = Date.now().toString();
    templates.push({ id: savedId, name, subject, body, signature });
  }

  persistTemplates();

  if (tplResumeOverride?.pendingFile) {
    await uploadResume(tplResumeOverride.pendingFile, "template", savedId);
  }

  renderTemplates();
  closeTemplateModal();
  showToast(editingId ? "Template updated." : "Template saved.", "success");
}

function deleteTemplate(id) {
  if (!confirm("Delete this template?")) return;
  templates = templates.filter((t) => t.id !== id);
  if (activeTemplateId === id) {
    activeTemplateId = null;
    updateResumeBanner();
  }
  fetch("/api/resume", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ action: "delete", scope: "template", templateId: id }),
  }).catch(() => {});
  persistTemplates();
  renderTemplates();
  showToast("Template deleted.", "error");
}

function persistTemplates() {
  localStorage.setItem("cm_templates", JSON.stringify(templates));
}

// ── HISTORY MODAL ──
function setupHistoryModal() {
  document.getElementById("btnHistory").addEventListener("click", openHistory);
  document.getElementById("historyClose").addEventListener("click", closeHistory);
  document.getElementById("historyClear").addEventListener("click", clearHistory);
  document.getElementById("btnSendSummary").addEventListener("click", sendDailySummary);

  document.getElementById("historyModal").addEventListener("click", (e) => {
    if (e.target === document.getElementById("historyModal")) closeHistory();
  });
}

function openHistory() {
  renderHistory();
  document.getElementById("historyModal").classList.add("open");
}

function closeHistory() {
  document.getElementById("historyModal").classList.remove("open");
}

function renderHistory() {
  const list = document.getElementById("historyList");
  if (history.length === 0) {
    list.innerHTML = `<div class="history-empty">No emails sent yet.</div>`;
    return;
  }
  list.innerHTML = [...history]
    .reverse()
    .map(
      (h) => `
      <div class="history-item">
        <span class="history-to">${escHtml(h.to)}</span>
        <span class="history-subject">${escHtml(h.subject)}</span>
        <span class="history-template">${escHtml(h.template || "No template")}</span>
        <span class="history-date">${escHtml(h.date)}</span>
      </div>`
    )
    .join("");
}

function addToHistory(to, subject) {
  const tpl = templates.find((t) => t.id === activeTemplateId);
  history.push({
    to,
    subject,
    template: tpl ? tpl.name : "No template",
    date: new Date().toLocaleString(),
  });
  localStorage.setItem("cm_history", JSON.stringify(history));
}

function clearHistory() {
  if (!confirm("Clear all send history?")) return;
  history = [];
  localStorage.setItem("cm_history", JSON.stringify(history));
  renderHistory();
}

async function sendDailySummary() {
  const today = new Date().toLocaleDateString();
  const todayEntries = history.filter((h) => h.date.includes(today));

  if (todayEntries.length === 0) {
    showToast("No emails sent today.", "error");
    return;
  }

  const btn = document.getElementById("btnSendSummary");
  btn.disabled = true;
  btn.textContent = "Sending...";

  try {
    const res = await fetch("/api/summary", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ entries: todayEntries }),
    });
    if (handleUnauth(res)) return;
    const data = await res.json();
    if (res.ok) {
      showToast("Summary sent to your inbox.", "success");
    } else {
      showToast(data.error || "Failed to send summary.", "error");
    }
  } catch (e) {
    showToast("Network error.", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Email Me Today's Summary";
  }
}

// ── SIGNATURE MODAL ──
function setupSignatureModal() {
  document.getElementById("btnSignature").addEventListener("click", openSignature);
  document.getElementById("signatureClose").addEventListener("click", closeSignature);
  document.getElementById("signatureCancel").addEventListener("click", closeSignature);
  document.getElementById("signatureSave").addEventListener("click", saveSignature);

  document.getElementById("signatureModal").addEventListener("click", (e) => {
    if (e.target === document.getElementById("signatureModal")) closeSignature();
  });
}

function openSignature() {
  document.getElementById("signatureText").value = globalSignature;
  document.getElementById("signatureModal").classList.add("open");
}

function closeSignature() {
  document.getElementById("signatureModal").classList.remove("open");
}

function saveSignature() {
  globalSignature = document.getElementById("signatureText").value.trim();
  localStorage.setItem("cm_signature", globalSignature);
  closeSignature();
  showToast("Signature saved.", "success");
}

// ── SETTINGS MODAL ──
function setupSettingsModal() {
  document.getElementById("btnSettings").addEventListener("click", openSettings);
  document.getElementById("settingsClose").addEventListener("click", closeSettings);
  document.getElementById("settingsCancel").addEventListener("click", closeSettings);
  document.getElementById("settingsSave").addEventListener("click", saveSettings);

  document.getElementById("settingsModal").addEventListener("click", (e) => {
    if (e.target === document.getElementById("settingsModal")) closeSettings();
  });

  // Password visibility toggle
  document.getElementById("settingsTogglePass").addEventListener("click", () => {
    const input = document.getElementById("settingsAppPassword");
    const isPass = input.type === "password";
    input.type = isPass ? "text" : "password";
    document.getElementById("settingsIconShow").style.display = isPass ? "none" : "block";
    document.getElementById("settingsIconHide").style.display = isPass ? "block" : "none";
  });
}

async function openSettings() {
  try {
    const res = await fetch("/api/settings", { headers: authHeaders() });
    if (handleUnauth(res)) return;
    const data = await res.json();
    document.getElementById("settingsFromName").value = data.fromName || "";
    document.getElementById("settingsGmailUser").value = data.gmailUser || "";
    document.getElementById("settingsAppPassword").value = "";
    document.getElementById("settingsGroqKey").value = "";
    document.getElementById("settingsAiEnabled").checked = data.aiEnabled || false;
  } catch (e) {
    showToast("Failed to load settings.", "error");
    return;
  }
  document.getElementById("settingsModal").classList.add("open");
}

function closeSettings() {
  document.getElementById("settingsModal").classList.remove("open");
}

async function saveSettings() {
  const fromName = document.getElementById("settingsFromName").value.trim();
  const gmailUser = document.getElementById("settingsGmailUser").value.trim();
  const appPassword = document.getElementById("settingsAppPassword").value.trim();
  const groqApiKey = document.getElementById("settingsGroqKey").value.trim();
  const aiEnabled = document.getElementById("settingsAiEnabled").checked;

  if (!fromName || !gmailUser) {
    showToast("Sender name and Gmail address are required.", "error");
    return;
  }

  const btn = document.getElementById("settingsSave");
  btn.disabled = true;
  btn.textContent = "Saving...";

  try {
    const payload = { fromName, gmailUser, aiEnabled };
    if (appPassword) payload.appPassword = appPassword;
    if (groqApiKey) payload.groqApiKey = groqApiKey;

    const res = await fetch("/api/settings", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });
    if (handleUnauth(res)) return;
    const data = await res.json();
    if (res.ok) {
      showToast("Settings saved.", "success");
      closeSettings();
      await checkAiAvailability();
    } else {
      showToast(data.error || "Failed to save settings.", "error");
    }
  } catch (e) {
    showToast("Network error.", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Save Settings";
  }
}

// ── SEND MAIL ──
function setupSendButton() {
  document.getElementById("sendBtn").addEventListener("click", sendMail);
}

async function sendMail() {
  const to = document.getElementById("to").value.trim();
  const subject = document.getElementById("subject").value.trim();
  let body = document.getElementById("body").value.trim();
  const btn = document.getElementById("sendBtn");
  const btnText = document.getElementById("btnText");

  if (!to || !subject || !body) {
    showToast("All fields are required.", "error");
    return;
  }

  const recipients = to.split(",").map((e) => e.trim()).filter((e) => e.length > 0);
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const invalid = recipients.find((e) => !emailRegex.test(e));
  if (invalid) {
    showToast(`Invalid email: ${invalid}`, "error");
    return;
  }

  // Resolve signature
  const activeTpl = templates.find((t) => t.id === activeTemplateId);
  const sig = activeTpl?.signature || globalSignature;
  if (sig) body = body + "\n\n-- \n" + sig;

  // Resolve attachment
  let attachmentUrl = null;
  let attachmentName = null;

  if (activeTemplateId) {
    try {
      const res = await fetch("/api/resume", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ action: "get", scope: "template", templateId: activeTemplateId }),
      });
      const data = await res.json();
      if (data?.url) {
        attachmentUrl = data.url;
        attachmentName = data.name;
      }
    } catch (e) {}
  }

  if (!attachmentUrl && globalResume?.url) {
    attachmentUrl = globalResume.url;
    attachmentName = globalResume.name;
  }

  btn.disabled = true;
  btnText.textContent = "Sending...";

  try {
    const res = await fetch("/api/send", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ to, subject, body, attachmentUrl, attachmentName }),
    });
    if (handleUnauth(res)) return;
    const data = await res.json();

    if (res.ok || res.status === 207) {
      addToHistory(to, subject);
      showToast(data.message, "success");
      document.getElementById("to").value = "";
      document.getElementById("subject").value = "";
      document.getElementById("body").value = "";
      activeTemplateId = null;
      renderTemplates();
      await updateResumeBanner();
    } else {
      showToast(data.error || "Something went wrong.", "error");
    }
  } catch (e) {
    showToast("Network error. Try again.", "error");
  } finally {
    btn.disabled = false;
    btnText.textContent = "Send";
  }
}

// ── UTILS ──
function showToast(message, type) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.className = `toast ${type}`;
  setTimeout(() => {
    toast.className = "toast hidden";
  }, 4000);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}