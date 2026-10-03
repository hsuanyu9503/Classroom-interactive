const el = (id) => document.getElementById(id);

let activity = null;
let currentCaseIndex = 0;
let selected = new Set();
let draggedCard = null;

function decodeActivity(encoded) {
  const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(normalized + padding);
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  const json = new TextDecoder().decode(bytes);
  const raw = JSON.parse(json);

  // V1.1 compact share format. Legacy full-format links are still supported.
  if (raw && Array.isArray(raw.c)) {
    return {
      title: raw.t || "課堂活動",
      subtitle: raw.s || "",
      template: "drag-reveal",
      cases: raw.c.map((c) => ({
        title: c.t || "",
        prompt: c.p || "",
        cards: Array.isArray(c.a) ? c.a : [],
        correctCards: Array.isArray(c.o)
          ? c.o.map(index => c.a?.[index]).filter(Boolean)
          : [],
        revealTitle: c.r || "",
        keywords: Array.isArray(c.k) ? c.k : [],
        revealDescription: c.d || ""
      }))
    };
  }

  return raw;
}

function loadFromUrl() {
  try {
    const hash = window.location.hash.replace(/^#/, "");
    const params = new URLSearchParams(hash);
    const data = params.get("data");
    if (!data) throw new Error("missing-data");

    activity = decodeActivity(data);
    if (!activity || !Array.isArray(activity.cases) || !activity.cases.length) {
      throw new Error("invalid-activity");
    }

    el("loadingState").classList.add("hidden");
    el("activityState").classList.remove("hidden");
    el("studentTitle").textContent = activity.title || "課堂活動";
    el("studentSubtitle").textContent = activity.subtitle || "";
    renderCase();
  } catch (error) {
    console.error(error);
    el("loadingState").classList.add("hidden");
    el("errorState").classList.remove("hidden");
  }
}

function renderCase() {
  const c = activity.cases[currentCaseIndex];
  selected = new Set();

  el("studentCaseIndex").textContent = `CASE ${String(currentCaseIndex + 1).padStart(2, "0")}`;
  el("studentCaseTitle").textContent = c.title;
  el("studentCasePrompt").textContent = c.prompt || "選出最能代表這個作品／情境的字卡。";
  el("caseCounter").textContent = `${currentCaseIndex + 1} / ${activity.cases.length}`;
  el("lockBadge").textContent = "分析中";

  const progress = (currentCaseIndex / activity.cases.length) * 100;
  el("progressBar").style.width = `${progress}%`;
  el("progressText").textContent = `${Math.round(progress)}%`;

  el("missionCard").classList.remove("hidden");
  el("interactionArea").classList.remove("hidden");
  el("feedbackPanel").classList.add("hidden");
  el("revealPanel").classList.add("hidden");
  el("completePanel").classList.add("hidden");

  renderCards(c.cards || []);
  updateEmptyHint();

  el("revealTitle").textContent = c.revealTitle || "";
  el("revealDescription").textContent = c.revealDescription || "";
  el("nextCaseBtn").textContent = currentCaseIndex === activity.cases.length - 1
    ? "完成活動"
    : "下一關";

  el("keywordCloud").innerHTML = "";
  (c.keywords || []).forEach(keyword => {
    const pill = document.createElement("span");
    pill.className = "keyword-pill";
    pill.textContent = keyword;
    el("keywordCloud").appendChild(pill);
  });
}

function renderCards(cards) {
  const pool = el("cardPool");
  const answer = el("answerZone");
  pool.innerHTML = "";
  answer.innerHTML = '<div id="emptyHint" class="empty-hint">把你選中的字卡放到這裡</div>';

  cards.forEach((text, index) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "drag-card";
    card.textContent = text;
    card.dataset.value = text;
    card.dataset.cardId = String(index);
    card.draggable = true;

    card.addEventListener("click", () => toggleCard(card));
    card.addEventListener("dragstart", () => {
      draggedCard = card;
      setTimeout(() => card.style.opacity = ".45", 0);
    });
    card.addEventListener("dragend", () => {
      card.style.opacity = "1";
      draggedCard = null;
      document.querySelectorAll(".drop-zone").forEach(z => z.classList.remove("drag-over"));
    });

    pool.appendChild(card);
  });

  setupDropZone(pool, false);
  setupDropZone(answer, true);
}

function setupDropZone(zone, isAnswerZone) {
  zone.addEventListener("dragover", (e) => {
    e.preventDefault();
    zone.classList.add("drag-over");
  });

  zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));

  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("drag-over");
    if (!draggedCard) return;

    zone.appendChild(draggedCard);
    draggedCard.classList.toggle("selected", isAnswerZone);

    const value = draggedCard.dataset.value;
    if (isAnswerZone) selected.add(value);
    else selected.delete(value);

    updateEmptyHint();
  });
}

function toggleCard(card) {
  const inAnswer = card.parentElement?.id === "answerZone";
  if (inAnswer) {
    el("cardPool").appendChild(card);
    card.classList.remove("selected");
    selected.delete(card.dataset.value);
  } else {
    el("answerZone").appendChild(card);
    card.classList.add("selected");
    selected.add(card.dataset.value);
  }
  updateEmptyHint();
}

function updateEmptyHint() {
  const hint = el("emptyHint");
  if (!hint) return;
  hint.style.display = selected.size ? "none" : "grid";
}

function arraysEqualAsSets(a, b) {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every(x => setB.has(x));
}

function submitCase() {
  const c = activity.cases[currentCaseIndex];
  const chosen = [...selected];
  const correct = c.correctCards || [];

  if (!chosen.length) {
    showToast("先選幾張你認為最重要的字卡");
    return;
  }

  const exact = arraysEqualAsSets(chosen, correct);
  const correctChosen = chosen.filter(x => correct.includes(x)).length;
  const missed = correct.filter(x => !selected.has(x)).length;

  el("interactionArea").classList.add("hidden");
  el("feedbackPanel").classList.remove("hidden");
  el("lockBadge").textContent = "已提交";

  if (exact) {
    el("feedbackIcon").textContent = "🎯";
    el("feedbackTitle").textContent = "抓到核心線索了！";
    el("feedbackText").textContent = `你選出的 ${correctChosen} 張字卡，正好都是這個故事最重要的元素。`;
  } else {
    el("feedbackIcon").textContent = "🔎";
    el("feedbackTitle").textContent = "再多想一步也沒關係";
    const extra = chosen.length - correctChosen;
    el("feedbackText").textContent =
      `你抓到 ${correctChosen} 張核心字卡；另外還有 ${missed} 張核心線索沒有選到${extra > 0 ? `，並混入了 ${extra} 張干擾字卡` : ""}。先看看揭密，再回頭比較哪些元素真正推動故事。`;
  }
}

function revealCase() {
  el("feedbackPanel").classList.add("hidden");
  el("revealPanel").classList.remove("hidden");
  el("lockBadge").textContent = "已揭密";
}

function nextCase() {
  if (currentCaseIndex < activity.cases.length - 1) {
    currentCaseIndex += 1;
    renderCase();
    window.scrollTo({ top: 0, behavior: "smooth" });
  } else {
    showComplete();
  }
}

function showComplete() {
  el("missionCard").classList.add("hidden");
  el("interactionArea").classList.add("hidden");
  el("feedbackPanel").classList.add("hidden");
  el("revealPanel").classList.add("hidden");
  el("completePanel").classList.remove("hidden");
  el("lockBadge").textContent = "完成";
  el("progressBar").style.width = "100%";
  el("progressText").textContent = "100%";
}

function resetCurrentCase() {
  renderCase();
}

function restart() {
  currentCaseIndex = 0;
  renderCase();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

let toastTimer = null;
function showToast(message) {
  const toast = el("studentToast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 1800);
}

el("submitCaseBtn").addEventListener("click", submitCase);
el("revealBtn").addEventListener("click", revealCase);
el("nextCaseBtn").addEventListener("click", nextCase);
el("resetCaseBtn").addEventListener("click", resetCurrentCase);
el("restartBtn").addEventListener("click", restart);

loadFromUrl();
