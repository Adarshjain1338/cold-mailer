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
let templates = [];
let history = [];
let globalSignature = localStorage.getItem("cm_signature") || "";
let globalResume = null;
let activeTemplateId = null;
let editingId = null;
let tplResumeOverride = null;

// ── INIT ──
document.addEventListener("DOMContentLoaded", async () => {
  showLoader("Loading your workspace...");

  try {
    await Promise.all([
      loadGlobalResume(),
      loadTemplates(),
      checkAiAvailability(),
      checkNeedsSetup(),
    ]);
  } catch (e) {
    console.error("Init error:", e);
  }

  renderTemplates();
  updateResumeBanner();
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
  setupScheduleToggle();
  setupPersonalize();
  hideLoader();
});

// ── LOADER ──
function showLoader(msg) {
  const el = document.getElementById("appLoader");
  if (!el) return;
  el.querySelector(".app-loader-sub").textContent = msg || "";
  el.classList.remove("hidden");
}

function hideLoader() {
  const el = document.getElementById("appLoader");
  if (!el) return;
  el.classList.add("hidden");
  setTimeout(() => { el.style.display = "none"; }, 300);
}

// ── SPINNER HELPER ──
function setButtonLoading(btn, loading, originalText) {
  if (!btn) return;
  if (loading) {
    btn.disabled = true;
    btn.classList.add("btn-loading");
    btn.dataset.originalText = btn.innerHTML;
    const isWhite = btn.classList.contains("btn-send") || btn.classList.contains("btn-send-top") || btn.classList.contains("btn-save");
    btn.innerHTML = `<span class="spinner ${isWhite ? "spinner-white" : "spinner-sm"}" style="vertical-align:middle;margin-right:6px"></span>${originalText || ""}`;
  } else {
    btn.disabled = false;
    btn.classList.remove("btn-loading");
    if (btn.dataset.originalText) {
      btn.innerHTML = btn.dataset.originalText;
    }
  }
}

// ── NEEDS SETUP ──
async function checkNeedsSetup() {
  try {
    const res = await fetch("/api/config", { headers: authHeaders() });
    if (handleUnauth(res)) return;
    const data = await res.json();
    if (data.needsSetup) {
      setTimeout(() => {
        showToast("Configure Gmail settings to start sending.", "error");
        setTimeout(() => openSettings(), 1800);
      }, 600);
    }
  } catch (e) {}
}

// ── LOAD TEMPLATES ──
async function loadTemplates() {
  try {
    const res = await fetch("/api/templates", { headers: authHeaders() });
    if (handleUnauth(res)) return;
    if (res.ok) templates = await res.json();
  } catch (e) {
    console.error("Failed to load templates:", e.message);
  }
}

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
    localStorage.removeItem("cm_signature");
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
    document.getElementById("aiBar").style.display = e.target.checked ? "flex" : "none";
  });
}

// ── AI BUTTONS ──
function setupAiButtons() {
  document.getElementById("btnAiCompose").addEventListener("click", aiCompose);
  document.getElementById("btnAiImprove").addEventListener("click", aiImprove);
}

async function aiCompose() {
  const prompt = document.getElementById("aiPrompt").value.trim();
  if (!prompt) { showToast("Describe the email purpose first.", "error"); return; }
  const btn = document.getElementById("btnAiCompose");
  setButtonLoading(btn, true, "");
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
    setButtonLoading(btn, false);
  }
}

async function aiImprove() {
  const body = document.getElementById("body").value.trim();
  if (!body) { showToast("Write something first.", "error"); return; }
  const btn = document.getElementById("btnAiImprove");
  setButtonLoading(btn, true, "");
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
    setButtonLoading(btn, false);
  }
}

// ── RENDER TEMPLATES ──
function renderTemplates() {
  const list = document.getElementById("templateList");
  if (templates.length === 0) {
    list.innerHTML = `<div class="template-empty">No templates yet.<br/>Click + New to create one.</div>`;
    return;
  }
  list.innerHTML = templates
    .map((t) => `
      <div class="template-item ${t.id === activeTemplateId ? "active" : ""}" data-id="${t.id}">
        <span class="template-name" title="${escHtml(t.name)}">${escHtml(t.name)}</span>
        <div class="template-actions">
          <button class="btn-tpl-edit" data-id="${t.id}">Edit</button>
          <button class="btn-tpl-delete" data-id="${t.id}">Delete</button>
        </div>
      </div>`)
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

function renderTemplatesSkeleton() {
  const list = document.getElementById("templateList");
  list.innerHTML = Array(3).fill(`<div class="skeleton skeleton-item"></div>`).join("");
}

// ── LOAD TEMPLATE INTO FORM ──
async function loadTemplate(id) {
  const tpl = templates.find((t) => t.id === id);
  if (!tpl) return;
  document.getElementById("subject").value = tpl.subject;
  document.getElementById("body").value = tpl.body;
  document.getElementById("to").focus();
  activeTemplateId = id;
  renderTemplates();
  closeMobileSidebar();
  updateResumeBanner();
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
        bannerTag.textContent = "Template";
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
    if (res.ok) globalResume = await res.json();
  } catch (e) { globalResume = null; }
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
    const btn = document.getElementById("globalResumeUploadBtn");
    setButtonLoading(btn, true, "");
    await uploadResume(file, "global", null);
    setButtonLoading(btn, false);
    e.target.value = "";
  });

  document.getElementById("globalResumeDeleteBtn").addEventListener("click", async () => {
    if (!confirm("Remove global resume?")) return;
    const btn = document.getElementById("globalResumeDeleteBtn");
    setButtonLoading(btn, true, "");
    const res = await fetch("/api/resume", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ action: "delete", scope: "global" }),
    });
    if (res.ok) {
      globalResume = null;
      renderGlobalResumeModal();
      await updateResumeBanner();
      showToast("Global resume removed.", "error");
    }
    setButtonLoading(btn, false);
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
        fileSize: file.size,
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
      const btn = document.getElementById("tplResumeUploadBtn");
      setButtonLoading(btn, true, "");
      await uploadResume(file, "template", editingId);
      setButtonLoading(btn, false);
    } else {
      tplResumeOverride = { pendingFile: file };
      document.getElementById("tplResumeCurrentName").textContent = file.name;
      document.getElementById("tplResumeDeleteBtn").style.display = "inline-block";
    }
    e.target.value = "";
  });

  document.getElementById("tplResumeDeleteBtn").addEventListener("click", async () => {
    if (!confirm("Remove resume from this template?")) return;
    const btn = document.getElementById("tplResumeDeleteBtn");
    setButtonLoading(btn, true, "");
    try {
      if (editingId && tplResumeOverride?.key) {
        const res = await fetch("/api/resume", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ action: "delete", scope: "template", templateId: editingId }),
        });
        if (!res.ok) {
          const data = await res.json();
          showToast(data.error || "Failed to remove.", "error");
          return;
        }
      }
      tplResumeOverride = null;
      document.getElementById("tplResumeCurrentName").textContent = "No override set";
      document.getElementById("tplResumeDeleteBtn").style.display = "none";
      await updateResumeBanner();
      showToast("Resume removed.", "error");
    } catch (e) {
      showToast("Network error.", "error");
    } finally {
      setButtonLoading(btn, false);
    }
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
  setTimeout(() => document.getElementById("tplName").focus(), 100);
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
  document.getElementById("tplResumeCurrentName").textContent = "Checking...";
  document.getElementById("templateModal").classList.add("open");

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

  const btn = document.getElementById("modalSave");
  setButtonLoading(btn, true, "");

  try {
    let savedId = editingId;

    if (editingId) {
      const res = await fetch("/api/templates", {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ id: editingId, name, subject, body, signature }),
      });
      if (handleUnauth(res)) return;
      const data = await res.json();
      if (!res.ok) { showToast(data.error || "Failed to save.", "error"); return; }
      templates = templates.map((t) => (t.id === editingId ? data : t));
    } else {
      // Optimistic — add immediately
      const tempId = `temp_${Date.now()}`;
      const optimistic = { id: tempId, name, subject, body, signature };
      templates.unshift(optimistic);
      renderTemplates();

      const res = await fetch("/api/templates", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ name, subject, body, signature }),
      });
      if (handleUnauth(res)) return;
      const data = await res.json();
      if (!res.ok) {
        // Rollback
        templates = templates.filter((t) => t.id !== tempId);
        renderTemplates();
        showToast(data.error || "Failed to save.", "error");
        return;
      }
      savedId = data.id;
      templates = templates.map((t) => (t.id === tempId ? data : t));
    }

    if (tplResumeOverride?.pendingFile) {
      await uploadResume(tplResumeOverride.pendingFile, "template", savedId);
    }

    renderTemplates();
    closeTemplateModal();
    showToast(editingId ? "Template updated." : "Template saved.", "success");
  } catch (e) {
    showToast("Network error.", "error");
  } finally {
    setButtonLoading(btn, false);
  }
}

async function deleteTemplate(id) {
  if (!confirm("Delete this template?")) return;

  // Optimistic remove
  const removed = templates.find((t) => t.id === id);
  templates = templates.filter((t) => t.id !== id);
  if (activeTemplateId === id) { activeTemplateId = null; updateResumeBanner(); }
  renderTemplates();

  const res = await fetch("/api/templates", {
    method: "DELETE",
    headers: authHeaders(),
    body: JSON.stringify({ id }),
  });

  if (handleUnauth(res)) return;

  if (!res.ok) {
    // Rollback
    templates.unshift(removed);
    renderTemplates();
    showToast("Failed to delete template.", "error");
    return;
  }

  fetch("/api/resume", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ action: "delete", scope: "template", templateId: id }),
  }).catch(() => {});

  showToast("Template deleted.", "error");
}

// ── HISTORY ──
function setupHistoryModal() {
  document.getElementById("btnHistory").addEventListener("click", openHistory);
  document.getElementById("historyClose").addEventListener("click", closeHistory);
  document.getElementById("historyClear").addEventListener("click", clearHistory);
  document.getElementById("btnSendSummary").addEventListener("click", sendDailySummary);

  document.getElementById("historyModal").addEventListener("click", (e) => {
    if (e.target === document.getElementById("historyModal")) closeHistory();
  });
}

async function openHistory() {
  document.getElementById("historyModal").classList.add("open");
  const list = document.getElementById("historyList");
  list.innerHTML = Array(3).fill(`<div class="skeleton skeleton-item"></div>`).join("");
  document.getElementById("scheduledList").innerHTML =
    `<div class="skeleton skeleton-item"></div>`;
  await Promise.all([loadHistory(), loadScheduled()]);
}

function closeHistory() {
  document.getElementById("historyModal").classList.remove("open");
}

async function loadHistory() {
  try {
    const res = await fetch("/api/history", { headers: authHeaders() });
    if (handleUnauth(res)) return;
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error("History error:", err);
      history = [];
    } else {
      const data = await res.json();
      history = Array.isArray(data) ? data : [];
    }
  } catch (e) {
    console.error("Failed to load history:", e.message);
    history = [];
  }
  renderHistory();
}

function renderHistory() {
  const list = document.getElementById("historyList");
  if (!list) return;

  if (!history || history.length === 0) {
    list.innerHTML = `<div class="history-empty">No emails sent yet.</div>`;
    return;
  }

  list.innerHTML = history
    .map((h) => {
      const recipients = Array.isArray(h.recipients)
        ? h.recipients.join(", ")
        : h.recipients || "Unknown";
      return `
        <div class="history-item">
          <span class="history-to">${escHtml(recipients)}</span>
          <span class="history-subject">${escHtml(h.subject || "")}</span>
          <span class="history-template">${escHtml(h.status || "")}</span>
          <span class="history-date">${h.sent_at ? new Date(h.sent_at).toLocaleString() : ""}</span>
        </div>`;
    })
    .join("");
}

async function clearHistory() {
  if (!confirm("Clear all send history?")) return;
  const btn = document.getElementById("historyClear");
  setButtonLoading(btn, true, "");
  const res = await fetch("/api/history", {
    method: "DELETE",
    headers: authHeaders(),
    body: JSON.stringify({ all: true }),
  });
  if (res.ok) { history = []; renderHistory(); showToast("History cleared.", "error"); }
  setButtonLoading(btn, false);
}

async function sendDailySummary() {
  const btn = document.getElementById("btnSendSummary");
  setButtonLoading(btn, true, "");
  try {
    const res = await fetch("/api/summary", {
      method: "POST",
      headers: authHeaders(),
    });
    if (handleUnauth(res)) return;
    const data = await res.json();
    showToast(res.ok ? "Summary sent to your inbox." : (data.error || "Failed."), res.ok ? "success" : "error");
  } catch (e) {
    showToast("Network error.", "error");
  } finally {
    setButtonLoading(btn, false);
  }
}

// ── SIGNATURE ──
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

// ── SETTINGS ──
function setupSettingsModal() {
  document.getElementById("btnSettings").addEventListener("click", openSettings);
  document.getElementById("settingsClose").addEventListener("click", closeSettings);
  document.getElementById("settingsCancel").addEventListener("click", closeSettings);
  document.getElementById("settingsSave").addEventListener("click", saveSettings);

  document.getElementById("settingsModal").addEventListener("click", (e) => {
    if (e.target === document.getElementById("settingsModal")) closeSettings();
  });

  document.getElementById("settingsTogglePass").addEventListener("click", () => {
    const input = document.getElementById("settingsAppPassword");
    const isPass = input.type === "password";
    input.type = isPass ? "text" : "password";
    document.getElementById("settingsIconShow").style.display = isPass ? "none" : "block";
    document.getElementById("settingsIconHide").style.display = isPass ? "block" : "none";
  });
}

async function openSettings() {
  document.getElementById("settingsModal").classList.add("open");
  const btn = document.getElementById("settingsSave");
  btn.disabled = true;

  try {
    const res = await fetch("/api/settings", { headers: authHeaders() });
    if (handleUnauth(res)) return;
    const data = await res.json();
    document.getElementById("settingsFromName").value = data.fromName || "";
    document.getElementById("settingsGmailUser").value = data.gmailUser || "";
    document.getElementById("settingsAppPassword").value = "";
    document.getElementById("settingsGroqKey").value = "";
    document.getElementById("settingsAiEnabled").checked = data.aiEnabled || false;

    const warningEl = document.getElementById("settingsSetupWarning");
    if (warningEl) warningEl.style.display = data.needsSetup ? "block" : "none";
  } catch (e) {
    showToast("Failed to load settings.", "error");
  } finally {
    btn.disabled = false;
  }
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

  if (!fromName || !gmailUser) { showToast("Sender name and Gmail address are required.", "error"); return; }
  if (!appPassword) { showToast("App password is required.", "error"); return; }

  const btn = document.getElementById("settingsSave");
  setButtonLoading(btn, true, "");

  try {
    const payload = { fromName, gmailUser, aiEnabled, appPassword };
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
      showToast(data.error || "Failed to save.", "error");
    }
  } catch (e) {
    showToast("Network error.", "error");
  } finally {
    setButtonLoading(btn, false);
  }
}

// ── SEND MAIL ──
function setupSendButton() {
  document.getElementById("sendBtn").addEventListener("click", sendMail);
  document.getElementById("sendBtnTop").addEventListener("click", sendMail);
}

async function sendMail() {
  const to = document.getElementById("to").value.trim();
  const subject = document.getElementById("subject").value.trim();
  let body = document.getElementById("body").value.trim();

  if (!to || !subject || !body) { showToast("All fields are required.", "error"); return; }

  const recipients = to.split(",").map((e) => e.trim()).filter((e) => e.length > 0);
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const invalid = recipients.find((e) => !emailRegex.test(e));
  if (invalid) { showToast(`Invalid email: ${invalid}`, "error"); return; }

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
      if (data?.url) { attachmentUrl = data.url; attachmentName = data.name; }
    } catch (e) {}
  }

  if (!attachmentUrl && globalResume?.url) {
    attachmentUrl = globalResume.url;
    attachmentName = globalResume.name;
  }

  const btnDesktop = document.getElementById("sendBtn");
  const btnMobile = document.getElementById("sendBtnTop");
  setButtonLoading(btnDesktop, true, "");
  setButtonLoading(btnMobile, true, "");

  try {
    // ── SCHEDULED SEND ──
    if (scheduleEnabled) {
      const scheduleDate = document.getElementById("scheduleDate").value;
      const scheduleTime = document.getElementById("scheduleTime").value;

      if (!scheduleDate) {
        showToast("Please select a date to schedule.", "error");
        return;
      }

      const res = await fetch("/api/schedule", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          to,
          subject,
          body,
          date: scheduleDate,
          time: scheduleTime || undefined, // undefined will use default 11:00 on backend
          attachmentUrl,
          attachmentName,
        }),
      });

      if (handleUnauth(res)) return;
      const data = await res.json();

      if (res.ok) {
        const displayTime = scheduleTime || "11:00 (Default)";
        showToast(
          `Email scheduled for ${scheduleDate} at ${displayTime} IST.`,
          "success"
        );
        document.getElementById("to").value = "";
        document.getElementById("subject").value = "";
        document.getElementById("body").value = "";
        document.getElementById("scheduleDate").value = "";
        document.getElementById("scheduleTime").value = "";
        activeTemplateId = null;
        renderTemplates();
        updateResumeBanner();
      } else {
        showToast(data.error || "Failed to schedule.", "error");
      }
      return;
    }

    // ── IMMEDIATE SEND ──
    const res = await fetch("/api/send", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ to, subject, body, attachmentUrl, attachmentName }),
    });
    if (handleUnauth(res)) return;
    const data = await res.json();

    if (data.needsSetup) {
      showToast("Configure Gmail settings first.", "error");
      setTimeout(() => openSettings(), 1000);
      return;
    }

    if (res.ok || res.status === 207) {
      showToast(data.message, "success");
      document.getElementById("to").value = "";
      document.getElementById("subject").value = "";
      document.getElementById("body").value = "";
      activeTemplateId = null;
      renderTemplates();
      updateResumeBanner();
    } else {
      showToast(data.error || "Something went wrong.", "error");
    }
  } catch (e) {
    showToast("Network error. Try again.", "error");
  } finally {
    setButtonLoading(btnDesktop, false);
    setButtonLoading(btnMobile, false);
  }
}

// ── MOBILE NAV ──
function mobileNav(tab) {
  document.querySelectorAll(".bottom-nav-item").forEach((el) => el.classList.remove("active"));
  document.getElementById(`nav${tab.charAt(0).toUpperCase() + tab.slice(1)}`)?.classList.add("active");

  if (tab === "templates") {
    openMobileSidebar();
  } else if (tab === "history") {
    closeMobileSidebar();
    openHistory();
  } else if (tab === "more") {
    closeMobileSidebar();
    openSettings();
  } else {
    closeMobileSidebar();
  }
}

function openMobileSidebar() {
  document.getElementById("sidebar").classList.add("mobile-open");
  document.getElementById("sheetOverlay").classList.add("open");
}

function closeMobileSidebar() {
  document.getElementById("sidebar").classList.remove("mobile-open");
  document.getElementById("sheetOverlay").classList.remove("open");
  const navCompose = document.getElementById("navCompose");
  const navTemplates = document.getElementById("navTemplates");
  if (navCompose) navCompose.classList.add("active");
  if (navTemplates) navTemplates.classList.remove("active");
}

// ── SCHEDULE SEND ──
let scheduleEnabled = false;

function setupScheduleToggle() {
  const btn = document.getElementById("btnScheduleToggle");
  if (!btn) return;
  btn.addEventListener("click", () => {
    scheduleEnabled = !scheduleEnabled;
    btn.classList.toggle("active", scheduleEnabled);
    const field = document.getElementById("scheduleField");
    if (field) field.style.display = scheduleEnabled ? "block" : "none";

    // Set default date to tomorrow (user can adjust)
    if (scheduleEnabled) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dateStr = tomorrow.toISOString().split("T")[0];
      document.getElementById("scheduleDate").value = dateStr;
      document.getElementById("scheduleTime").value = ""; // Empty = uses 11:00 default
    }

    // Update send button label
    const btnTextTop = document.getElementById("btnTextTop");
    const btnText = document.getElementById("btnText");
    if (btnTextTop) btnTextTop.textContent = scheduleEnabled ? "Schedule" : "Send";
    if (btnText) btnText.textContent = scheduleEnabled ? "Schedule" : "Send";
  });
}

async function loadScheduled() {
  try {
    const res = await fetch("/api/schedule", { headers: authHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    renderScheduled(data);
  } catch (e) {}
}

function renderScheduled(items) {
  const list = document.getElementById("scheduledList");
  if (!list) return;
  if (!items || items.length === 0) {
    list.innerHTML = `<div class="history-empty" style="padding:16px">No scheduled emails.</div>`;
    return;
  }
  list.innerHTML = items.map((item) => `
    <div class="scheduled-item">
      <div class="scheduled-item-info">
        <span class="scheduled-item-to">${escHtml(item.to_addresses.join(", "))}</span>
        <span class="scheduled-item-time">${new Date(item.scheduled_at).toLocaleString()}</span>
      </div>
      <span class="scheduled-item-status">${item.status}</span>
      <button class="btn-cancel-scheduled" data-id="${item.id}">Cancel</button>
    </div>`).join("");

  list.querySelectorAll(".btn-cancel-scheduled").forEach((btn) => {
    btn.addEventListener("click", () => cancelScheduled(btn.dataset.id));
  });
}

async function cancelScheduled(id) {
  if (!confirm("Cancel this scheduled email?")) return;
  const res = await fetch("/api/schedule", {
    method: "DELETE",
    headers: authHeaders(),
    body: JSON.stringify({ id }),
  });
  if (res.ok) {
    showToast("Scheduled email cancelled.", "error");
    await loadScheduled();
  }
}

// ── PERSONALIZE ──
function setupPersonalize() {
  const btn = document.getElementById("btnPersonalize");
  if (!btn) return;
  btn.addEventListener("click", personalize);
}

async function personalize() {
  const body = document.getElementById("body").value.trim();
  if (!body) { showToast("Write a message body first.", "error"); return; }

  const name = document.getElementById("recipientName").value.trim();
  const company = document.getElementById("recipientCompany").value.trim();
  const role = document.getElementById("recipientRole").value.trim();
  const email = document.getElementById("to").value.split(",")[0].trim();
  const useAI = document.getElementById("aiToggle")?.checked || false;

  const btn = document.getElementById("btnPersonalize");
  setButtonLoading(btn, true, "");

  try {
    const res = await fetch("/api/personalize", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ email, name, company, role, body, useAI }),
    });
    if (handleUnauth(res)) return;
    const data = await res.json();

    if (res.ok) {
      document.getElementById("body").value = data.body;
      if (data.aiUsed && data.companyContext) {
        showToast("Personalized with company data.", "success");
      } else if (data.aiUsed) {
        showToast("AI personalized your email.", "success");
      } else {
        showToast("Tokens replaced.", "success");
      }
    } else {
      showToast(data.error || "Personalization failed.", "error");
    }
  } catch (e) {
    showToast("Network error.", "error");
  } finally {
    setButtonLoading(btn, false);
  }
}

// ── UTILS ──
function showToast(message, type) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.className = `toast ${type}`;
  setTimeout(() => { toast.className = "toast hidden"; }, 4000);
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