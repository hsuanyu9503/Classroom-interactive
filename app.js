const STORAGE_KEY = "interactive-classroom-v1";
let activities = [];
let currentId = null;
let toastTimer = null;

const el = (id) => document.getElementById(id);

const activityTitle = el("activityTitle");
const activitySubtitle = el("activitySubtitle");
const caseEditor = el("caseEditor");
const activityList = el("activityList");
const caseTemplate = el("caseTemplate");
const shareDialog = el("shareDialog");
const shareUrlInput = el("shareUrl");
const qrcodeEl = el("qrcode");
const qrNotice = el("qrNotice");
const QR_SAFE_MAX_LENGTH = 2800;

function createId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `act-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function cloneData(value) {
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

const defaultActivity = {
  id: createId(),
  title: "故事鑑定所",
  subtitle: "從作品元素找出故事類型的祕密",
  template: "drag-reveal",
  cases: [
    {
      title: "名偵探柯南",
      prompt: "哪些元素最能代表這個故事？",
      cards: ["蒐集線索", "解開謎團", "找出犯人", "使用魔法", "前往異世界"],
      correctCards: ["蒐集線索", "解開謎團", "找出犯人"],
      revealTitle: "推理小說",
      keywords: ["謎團", "線索", "推理", "真相"],
      revealDescription: "故事通常以謎團為核心，角色透過線索與推理逐步找出真相。"
    }
  ]
};

function showToast(message) {
  const toast = el("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 1800);
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(activities));
}

function loadActivities() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    activities = Array.isArray(saved) ? saved : [];
  } catch {
    activities = [];
  }

  if (!activities.length) {
    activities = [cloneData(defaultActivity)];
    persist();
  }

  currentId = activities[0].id;
  renderLibrary();
  loadIntoEditor(activities[0]);
}

function newBlankActivity() {
  return {
    id: createId(),
    title: "未命名活動",
    subtitle: "",
    template: "drag-reveal",
    cases: [
      {
        title: "",
        prompt: "",
        cards: [],
        correctCards: [],
        revealTitle: "",
        keywords: [],
        revealDescription: ""
      }
    ]
  };
}

function renderLibrary() {
  activityList.innerHTML = "";

  activities.forEach((activity) => {
    const item = document.createElement("div");
    item.className = `activity-item ${activity.id === currentId ? "active" : ""}`;
    item.innerHTML = `
      <strong>${escapeHtml(activity.title || "未命名活動")}</strong>
      <small>${activity.cases?.length || 0} 個關卡 · 拖曳揭密</small>
    `;
    item.addEventListener("click", () => {
      saveCurrent(false);
      currentId = activity.id;
      renderLibrary();
      loadIntoEditor(activity);
    });
    activityList.appendChild(item);
  });
}

function addCardRow(caseCard, text = "", isCorrect = false) {
  const list = caseCard.querySelector(".card-editor-list");
  const row = document.createElement("div");
  row.className = "card-editor-row";

  const input = document.createElement("input");
  input.type = "text";
  input.className = "card-text";
  input.placeholder = "輸入字卡內容";
  input.value = text;

  const correctLabel = document.createElement("label");
  correctLabel.className = "correct-toggle";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "card-correct-toggle";
  checkbox.checked = isCorrect;
  const correctText = document.createElement("span");
  correctText.textContent = "正確";
  correctLabel.append(checkbox, correctText);

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "icon-btn remove-card";
  removeButton.title = "刪除字卡";
  removeButton.setAttribute("aria-label", "刪除字卡");
  removeButton.textContent = "×";

  removeButton.addEventListener("click", () => {
    row.remove();
    if (!list.children.length) addCardRow(caseCard);
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addCardRow(caseCard);
      const rows = list.querySelectorAll(".card-text");
      rows[rows.length - 1]?.focus();
    }
  });

  row.append(input, correctLabel, removeButton);
  list.appendChild(row);
}

function addCase(caseData = {}) {
  const fragment = caseTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".case-card");

  card.querySelector(".case-title").value = caseData.title || "";
  card.querySelector(".case-prompt").value = caseData.prompt || "";
  card.querySelector(".case-reveal-title").value = caseData.revealTitle || "";
  card.querySelector(".case-keywords").value = (caseData.keywords || []).join("、");
  card.querySelector(".case-reveal-desc").value = caseData.revealDescription || "";

  const cards = Array.isArray(caseData.cards) ? caseData.cards : [];
  const correctCards = new Set(caseData.correctCards || []);
  if (cards.length) {
    cards.forEach((text) => addCardRow(card, text, correctCards.has(text)));
  } else {
    addCardRow(card);
  }

  card.querySelector(".add-card-btn").addEventListener("click", () => {
    addCardRow(card);
    const rows = card.querySelectorAll(".card-text");
    rows[rows.length - 1]?.focus();
  });

  card.querySelector(".remove-case").addEventListener("click", () => {
    if (caseEditor.children.length <= 1) {
      showToast("至少要保留一個關卡");
      return;
    }
    card.remove();
    refreshCaseNumbers();
  });

  caseEditor.appendChild(fragment);
  refreshCaseNumbers();
}

function refreshCaseNumbers() {
  [...caseEditor.querySelectorAll(".case-card")].forEach((card, index) => {
    card.querySelector(".case-index").textContent = `CASE ${String(index + 1).padStart(2, "0")}`;
  });
}

function loadIntoEditor(activity) {
  activityTitle.value = activity.title || "";
  activitySubtitle.value = activity.subtitle || "";
  caseEditor.innerHTML = "";

  const cases = activity.cases?.length ? activity.cases : newBlankActivity().cases;
  cases.forEach(addCase);
}

function readEditor() {
  const cases = [...caseEditor.querySelectorAll(".case-card")].map((card) => {
    const rows = [...card.querySelectorAll(".card-editor-row")];
    const cards = [];
    const correctCards = [];

    rows.forEach((row) => {
      const text = row.querySelector(".card-text").value.trim();
      if (!text) return;
      cards.push(text);
      if (row.querySelector(".card-correct-toggle").checked) correctCards.push(text);
    });

    return {
      title: card.querySelector(".case-title").value.trim(),
      prompt: card.querySelector(".case-prompt").value.trim(),
      cards,
      correctCards,
      revealTitle: card.querySelector(".case-reveal-title").value.trim(),
      keywords: splitKeywords(card.querySelector(".case-keywords").value),
      revealDescription: card.querySelector(".case-reveal-desc").value.trim()
    };
  });

  return {
    id: currentId || createId(),
    title: activityTitle.value.trim() || "未命名活動",
    subtitle: activitySubtitle.value.trim(),
    template: "drag-reveal",
    cases
  };
}

function splitKeywords(value) {
  return value
    .split(/[、,，]/)
    .map(v => v.trim())
    .filter(Boolean);
}

function validateActivity(activity) {
  if (!activity.cases.length) return "至少需要一個關卡";

  for (let i = 0; i < activity.cases.length; i++) {
    const c = activity.cases[i];
    if (!c.title) return `第 ${i + 1} 關尚未填寫作品／情境名稱`;
    if (!c.cards.length) return `第 ${i + 1} 關尚未填寫字卡`;
    if (!c.correctCards.length) return `第 ${i + 1} 關尚未填寫正確字卡`;
    if (!c.revealTitle) return `第 ${i + 1} 關尚未填寫揭露標題`;

    if (new Set(c.cards).size !== c.cards.length) {
      return `第 ${i + 1} 關有重複的字卡文字，請讓每張字卡內容保持唯一`;
    }
    if (new Set(c.correctCards).size !== c.correctCards.length) {
      return `第 ${i + 1} 關的正確字卡有重複內容`;
    }

    const missing = c.correctCards.filter(x => !c.cards.includes(x));
    if (missing.length) {
      return `第 ${i + 1} 關的正確字卡「${missing[0]}」不在字卡清單裡`;
    }
  }

  return "";
}

function saveCurrent(showMessage = true) {
  const activity = readEditor();
  const index = activities.findIndex(a => a.id === activity.id);

  if (index >= 0) activities[index] = activity;
  else activities.push(activity);

  currentId = activity.id;
  persist();
  renderLibrary();
  if (showMessage) showToast("活動已儲存");
  return activity;
}

function encodeActivity(activity) {
  const compact = {
    t: activity.title,
    s: activity.subtitle,
    c: activity.cases.map((c) => ({
      t: c.title,
      p: c.prompt,
      a: c.cards,
      o: c.correctCards.map(card => c.cards.indexOf(card)),
      r: c.revealTitle,
      k: c.keywords,
      d: c.revealDescription
    }))
  };

  const json = JSON.stringify(compact);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  bytes.forEach(b => binary += String.fromCharCode(b));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function buildShareUrl(activity) {
  const encoded = encodeActivity(activity);
  const path = new URL("play.html", window.location.href);
  path.hash = `data=${encoded}`;
  return path.toString();
}

function previewOrShare(openPreview = false) {
  const activity = saveCurrent(false);
  const validation = validateActivity(activity);

  if (validation) {
    showToast(validation);
    return;
  }

  const url = buildShareUrl(activity);

  if (openPreview) {
    window.open(url, "_blank", "noopener");
    return;
  }

  el("shareActivityName").textContent = activity.title;
  shareUrlInput.value = url;
  el("openStudentLink").href = url;
  qrcodeEl.innerHTML = "";
  qrNotice.classList.add("hidden");
  qrNotice.textContent = "";

  if (url.length > QR_SAFE_MAX_LENGTH) {
    qrcodeEl.innerHTML = "<p class='subtle'>活動內容較多，已超過第一版 QR Code 的安全容量。</p>";
    qrNotice.textContent = "學生連結仍可使用；建議先精簡文字或拆成兩個活動。後續升級活動代碼後即可解除這個限制。";
    qrNotice.classList.remove("hidden");
  } else if (window.QRCode) {
    try {
      new QRCode(qrcodeEl, {
        text: url,
        width: 200,
        height: 200,
        correctLevel: QRCode.CorrectLevel.L
      });
    } catch (error) {
      console.error("QR Code 產生失敗", error);
      qrcodeEl.innerHTML = "<p class='subtle'>QR Code 產生失敗，請使用下方學生連結。</p>";
      qrNotice.textContent = "如果活動內容較多，可先精簡文字後再試一次。";
      qrNotice.classList.remove("hidden");
    }
  } else {
    qrcodeEl.innerHTML = "<p class='subtle'>QR Code 元件尚未載入，仍可使用下方連結。</p>";
    qrNotice.textContent = "請確認網路連線後重新整理；學生連結本身不受影響。";
    qrNotice.classList.remove("hidden");
  }

  shareDialog.showModal();
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[ch]);
}

el("newActivityBtn").addEventListener("click", () => {
  saveCurrent(false);
  const activity = newBlankActivity();
  activities.unshift(activity);
  currentId = activity.id;
  persist();
  renderLibrary();
  loadIntoEditor(activity);
  showToast("已建立新活動");
});

el("addCaseBtn").addEventListener("click", () => addCase());

el("saveBtn").addEventListener("click", () => saveCurrent(true));

el("duplicateBtn").addEventListener("click", () => {
  const source = saveCurrent(false);
  const copy = cloneData(source);
  copy.id = createId();
  copy.title = `${source.title}－副本`;
  activities.unshift(copy);
  currentId = copy.id;
  persist();
  renderLibrary();
  loadIntoEditor(copy);
  showToast("活動已複製");
});

el("deleteBtn").addEventListener("click", () => {
  if (!currentId) return;
  if (!confirm("確定要刪除這個活動嗎？")) return;

  activities = activities.filter(a => a.id !== currentId);

  if (!activities.length) {
    activities = [newBlankActivity()];
  }

  currentId = activities[0].id;
  persist();
  renderLibrary();
  loadIntoEditor(activities[0]);
  showToast("活動已刪除");
});

el("previewBtn").addEventListener("click", () => previewOrShare(true));
el("shareBtn").addEventListener("click", () => previewOrShare(false));

el("copyUrlBtn").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(shareUrlInput.value);
    showToast("連結已複製");
  } catch {
    shareUrlInput.select();
    document.execCommand("copy");
    showToast("連結已複製");
  }
});

loadActivities();
