(function () {
  const API_BASE = window.location.origin.includes("5000")
    ? "/api"
    : "http://localhost:5000/api";

  // ---------------- State ----------------
  let mode = "login"; // or 'register'
  let token = localStorage.getItem("marginal_token") || null;
  let currentUser = null;
  let documents = []; // [{id, name, word_count, uploaded_at}]
  let activeDoc = null; // full document object {id, name, content, ...}
  let activeMessages = [];

  const $ = (id) => document.getElementById(id);

  function authHeaders() {
    return token ? { Authorization: "Bearer " + token } : {};
  }

  async function api(path, options = {}) {
    const res = await fetch(API_BASE + path, {
      ...options,
      headers: {
        ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
        ...authHeaders(),
        ...(options.headers || {})
      }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || "Request failed");
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ---------------- Auth UI ----------------
  const authScreen = $("authScreen"), workspace = $("workspace");
  const authTitle = $("authTitle"), authSub = $("authSub"), authError = $("authError");
  const nameField = $("nameField"), nameInput = $("nameInput");
  const emailInput = $("emailInput"), passInput = $("passInput");
  const authSubmit = $("authSubmit"), authSwitch = $("authSwitch");
  const topbarRight = $("topbarRight");

  function renderAuthMode() {
    authError.classList.remove("show");
    if (mode === "login") {
      authTitle.textContent = "Welcome back";
      authSub.textContent = "Sign in to open your documents and pick up the conversation.";
      nameField.classList.add("hidden");
      authSubmit.textContent = "Sign in";
      authSwitch.innerHTML = 'New here? <a id="switchToRegister">Create an account</a>';
      $("switchToRegister").onclick = () => { mode = "register"; renderAuthMode(); };
    } else {
      authTitle.textContent = "Create your account";
      authSub.textContent = "Set up an account so your documents and questions are saved.";
      nameField.classList.remove("hidden");
      authSubmit.textContent = "Create account";
      authSwitch.innerHTML = 'Already have an account? <a id="switchToLogin">Sign in</a>';
      $("switchToLogin").onclick = () => { mode = "login"; renderAuthMode(); };
    }
  }
  renderAuthMode();

  function showAuthError(msg) {
    authError.textContent = msg;
    authError.classList.add("show");
  }

  authSubmit.addEventListener("click", async () => {
    const email = emailInput.value.trim().toLowerCase();
    const password = passInput.value;
    const name = nameInput.value.trim();

    if (!email || !password) return showAuthError("Enter an email and password.");

    authSubmit.disabled = true;
    authSubmit.textContent = mode === "login" ? "Signing in…" : "Creating account…";

    try {
      const payload = mode === "register" ? { name, email, password } : { email, password };
      const data = await api(`/auth/${mode}`, { method: "POST", body: JSON.stringify(payload) });
      token = data.token;
      currentUser = data.user;
      localStorage.setItem("marginal_token", token);
      await enterWorkspace();
    } catch (err) {
      showAuthError(err.message || "Something went wrong. Please try again.");
    } finally {
      authSubmit.disabled = false;
      renderAuthMode();
    }
  });

  [emailInput, passInput, nameInput].forEach((el) => {
    el.addEventListener("keydown", (e) => { if (e.key === "Enter") authSubmit.click(); });
  });

  // ---------------- Workspace ----------------
  const docList = $("docList"), uploadZone = $("uploadZone"), fileInput = $("fileInput");
  const readerEmpty = $("readerEmpty"), readerContent = $("readerContent");
  const docTitle = $("docTitle"), docMeta = $("docMeta"), pageContent = $("pageContent");
  const chatLog = $("chatLog"), chatSub = $("chatSub");
  const chatInput = $("chatInput"), sendBtn = $("sendBtn");

  async function enterWorkspace() {
    try {
      const me = await api("/auth/me");
      currentUser = me.user;
    } catch (err) {
      return signOut();
    }
    authScreen.classList.add("hidden");
    workspace.classList.remove("hidden");
    topbarRight.innerHTML = `<span class="who">${escapeHtml(currentUser.name)}</span><button class="btn-ghost-light" id="logoutBtn">Sign out</button>`;
    $("logoutBtn").onclick = signOut;

    await refreshDocList();
  }

  function signOut() {
    token = null; currentUser = null; documents = []; activeDoc = null; activeMessages = [];
    localStorage.removeItem("marginal_token");
    workspace.classList.add("hidden");
    authScreen.classList.remove("hidden");
    emailInput.value = ""; passInput.value = ""; nameInput.value = "";
    mode = "login"; renderAuthMode();
  }

  async function refreshDocList() {
    const data = await api("/documents");
    documents = data.documents;
    renderDocList();
    if (documents.length && !activeDoc) {
      openDoc(documents[0].id);
    } else if (!documents.length) {
      showEmptyReader();
    }
  }

  function renderDocList() {
    docList.innerHTML = "";
    documents.forEach((doc) => {
      const item = document.createElement("div");
      item.className = "doc-item" + (activeDoc && doc.id === activeDoc.id ? " active" : "");
      item.innerHTML = `<span class="dot"></span><span class="name">${escapeHtml(doc.name)}</span><span class="del" title="Delete">✕</span>`;
      item.querySelector(".name").onclick = () => openDoc(doc.id);
      item.querySelector(".dot").onclick = () => openDoc(doc.id);
      item.querySelector(".del").onclick = async (e) => {
        e.stopPropagation();
        if (!confirm(`Delete "${doc.name}"?`)) return;
        await api(`/documents/${doc.id}`, { method: "DELETE" });
        if (activeDoc && activeDoc.id === doc.id) { activeDoc = null; showEmptyReader(); }
        await refreshDocList();
      };
      docList.appendChild(item);
    });
  }

  function showEmptyReader() {
    readerEmpty.classList.remove("hidden");
    readerContent.classList.add("hidden");
    chatInput.disabled = true;
    sendBtn.disabled = true;
    chatSub.textContent = "Open a document to start asking questions";
  }

  async function openDoc(id) {
    const data = await api(`/documents/${id}`);
    activeDoc = data.document;
    activeMessages = data.messages;

    renderDocList();
    readerEmpty.classList.add("hidden");
    readerContent.classList.remove("hidden");
    docTitle.textContent = activeDoc.name;
    docMeta.textContent = `${activeDoc.word_count.toLocaleString()} words · uploaded ${new Date(activeDoc.uploaded_at).toLocaleDateString()}`;
    pageContent.textContent = activeDoc.content || "(No readable text was found in this file.)";
    pageContent.parentElement.scrollTop = 0;

    chatInput.disabled = false;
    sendBtn.disabled = false;
    chatSub.textContent = `Grounded in "${activeDoc.name}"`;
    renderChat();
  }

  function renderChat() {
    chatLog.innerHTML = "";
    if (!activeMessages.length) {
      chatLog.innerHTML = '<div class="chat-empty">Ask something like "Summarize this" or "What does it say about…?"</div>';
      return;
    }
    activeMessages.forEach((m) => {
      const div = document.createElement("div");
      div.className = "msg " + (m.role === "user" ? "user" : "assistant");
      div.innerHTML = `<div class="label">${m.role === "user" ? "You" : "Marginal"}</div><div class="bubble">${escapeHtml(m.content)}</div>`;
      chatLog.appendChild(div);
    });
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  // ---------------- Upload ----------------
  uploadZone.addEventListener("click", () => fileInput.click());
  uploadZone.addEventListener("dragover", (e) => { e.preventDefault(); uploadZone.classList.add("drag"); });
  uploadZone.addEventListener("dragleave", () => uploadZone.classList.remove("drag"));
  uploadZone.addEventListener("drop", (e) => {
    e.preventDefault(); uploadZone.classList.remove("drag");
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener("change", (e) => {
    if (e.target.files.length) handleFile(e.target.files[0]);
    fileInput.value = "";
  });

  const uploadZoneDefault = uploadZone.innerHTML;

  async function handleFile(file) {
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    const isTxt = file.type === "text/plain" || file.name.toLowerCase().endsWith(".txt");
    if (!isPdf && !isTxt) return alert("Please upload a .txt or .pdf file.");

    uploadZone.innerHTML = `<span class="plus">…</span>Reading "${escapeHtml(file.name)}"`;
    try {
      const form = new FormData();
      form.append("file", file);
      const data = await api("/documents", { method: "POST", body: form });
      activeDoc = null;
      await refreshDocList();
      await openDoc(data.document.id);
    } catch (err) {
      alert(err.message || "Could not read that file. Please try another.");
    } finally {
      uploadZone.innerHTML = uploadZoneDefault;
    }
  }

  // ---------------- Chat / Q&A ----------------
  chatInput.addEventListener("input", () => {
    chatInput.style.height = "auto";
    chatInput.style.height = Math.min(chatInput.scrollHeight, 100) + "px";
  });
  chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  sendBtn.addEventListener("click", sendMessage);

  async function sendMessage() {
    const text = chatInput.value.trim();
    if (!text || !activeDoc) return;

    activeMessages.push({ role: "user", content: text });
    chatInput.value = "";
    chatInput.style.height = "auto";
    renderChat();

    sendBtn.disabled = true;
    chatInput.disabled = true;
    const typingDiv = document.createElement("div");
    typingDiv.className = "msg assistant";
    typingDiv.innerHTML = `<div class="label">Marginal</div><div class="bubble"><div class="typing"><span></span><span></span><span></span></div></div>`;
    chatLog.appendChild(typingDiv);
    chatLog.scrollTop = chatLog.scrollHeight;

    try {
      const data = await api(`/documents/${activeDoc.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ question: text })
      });
      activeMessages.push({ role: "assistant", content: data.answer });
    } catch (err) {
      activeMessages.push({ role: "assistant", content: err.message || "I couldn't reach the server just now. Please try again." });
    } finally {
      typingDiv.remove();
      renderChat();
      sendBtn.disabled = false;
      chatInput.disabled = false;
      chatInput.focus();
    }
  }

  // ---------------- Boot ----------------
  (async function boot() {
    if (token) {
      try { await enterWorkspace(); } catch (e) { signOut(); }
    }
  })();
})();
