let activity = null;
let currentCaseIndex = 0;
let selected = new Set();
let draggedCard = null;

let modeASelectedElements = new Set();
let modeASelectedType = "";

let progressiveStageIndex = 0;
let progressiveSelectedType = "";
let progressiveHistory = [];
let progressivePollTimer = null;

let openPhase = 1;
let openSelectedElements = new Set();
let openSelectedType = "";
let openInitialResponse = null;
let openFinalResponse = null;
let openPollTimer = null;
let sessionRealtime = null;
let openStats = {initial:[], final:[], initial_total:0, final_total:0, changed_count:0, unchanged_count:0};

const el = (id) => document.getElementById(id);

function base64UrlToBytes(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - base64.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, ch => ch.charCodeAt(0));
}

async function gunzipBytes(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function decodeActivity(encoded) {
  let bytes;
  if (encoded.startsWith("z.")) {
    bytes = base64UrlToBytes(encoded.slice(2));
    bytes = await gunzipBytes(bytes);
  } else if (encoded.startsWith("u.")) {
    bytes = base64UrlToBytes(encoded.slice(2));
  } else {
    bytes = base64UrlToBytes(encoded);
  }

  const raw = JSON.parse(new TextDecoder().decode(bytes));

  if (raw?.m === "open-classification" && raw.o) {
    return {
      title:raw.t||"",
      subtitle:raw.s||"",
      template:"open-classification",
      openClassification:{
        work:{name:raw.o.w?.n||"未命名作品",showName:raw.o.w?.sh!==false,intro:raw.o.w?.i||"",image:raw.o.w?.img||""},
        prompt:raw.o.p||"",
        elements:Array.isArray(raw.o.e)?raw.o.e:[],
        types:Array.isArray(raw.o.y)?raw.o.y:[],
        minEvidence:Math.max(1,Number(raw.o.min)||2),
        discussionPrompt:raw.o.q||"",
        allowRejudge:raw.o.r!==false
      }
    };
  }

  if (raw?.m === "progressive-reveal" && raw.g) {
    return {
      title:raw.t||"", subtitle:raw.s||"", template:"progressive-reveal",
      progressive:{
        work:{name:raw.g.w?.n||"未命名作品",showName:raw.g.w?.sh!==false,intro:raw.g.w?.i||"",image:raw.g.w?.img||""},
        prompt:raw.g.p||"",
        clues:Array.isArray(raw.g.l)?raw.g.l:[],
        types:Array.isArray(raw.g.y)?raw.g.y:[],
        referenceTypeId:Number.isInteger(raw.g.ry)&&raw.g.ry>=0?raw.g.y?.[raw.g.ry]?.i||"":""
      }
    };
  }

  if (raw?.m === "element-type" && Array.isArray(raw.x)) {
    return {
      title: raw.t || "",
      subtitle: raw.s || "",
      template: "element-type",
      tasks: raw.x.map(task => ({
        work: {
          name: task.w?.n || "未命名作品",
          showName: task.w?.sh !== false,
          intro: task.w?.i || "",
          image: task.w?.img || ""
        },
        prompt: task.p || "",
        elements: Array.isArray(task.e) ? task.e : [],
        correctElementIds: Array.isArray(task.ce)
          ? task.ce.map(index => task.e?.[index]?.i).filter(Boolean)
          : [],
        types: Array.isArray(task.y) ? task.y : [],
        correctTypeId: Number.isInteger(task.cy) && task.cy >= 0
          ? task.y?.[task.cy]?.i || ""
          : "",
        minElements: Math.max(1, Number(task.min) || 1)
      }))
    };
  }

  if (raw?.c && Array.isArray(raw.c)) {
    return {
      title: raw.t || "",
      subtitle: raw.s || "",
      template: raw.m === "open-tags" ? "open-tags" : "drag-reveal",
      cases: raw.c.map(c => ({
        title: c.t || "",
        intro: c.i || "",
        prompt: c.p || "",
        cards: Array.isArray(c.a) ? c.a : [],
        correctCards: Array.isArray(c.o)
          ? c.o.map(index => c.a?.[index]).filter(Boolean)
          : [],
        revealTitle: c.r || "",
        keywords: Array.isArray(c.k) ? c.k : [],
        revealDescription: c.d || "",
        discussionPrompt: c.q || ""
      }))
    };
  }

  return raw;
}

function isSessionPlay() {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return params.get("session") === "1";
}

function setStudentRealtimeStatus(status, detail = "") {
  const badge = el("studentRealtimeStatus");
  if (!badge || !isSessionPlay()) return;
  badge.className = "student-realtime-status";

  const context = window.ClassroomSessionAPI?.getParticipantContext?.();
  if (context?.mode !== "cloud") {
    badge.classList.add("local");
    badge.textContent = "🧪 本機同步";
    badge.classList.remove("hidden");
    return;
  }

  if (status === "connected") {
    badge.classList.add("live");
    badge.textContent = "⚡ 即時同步";
  } else if (status === "connecting") {
    badge.textContent = "⚡ Realtime 連線中";
  } else if (status === "closed") {
    badge.classList.add("closed");
    badge.textContent = "Session 已結束";
  } else {
    badge.classList.add("fallback");
    badge.textContent = "↻ 輪詢備援";
  }
  badge.title = detail || "";
  badge.classList.remove("hidden");
}

function stopStudentRealtime() {
  try { sessionRealtime?.close?.(); } catch {}
  sessionRealtime = null;
}

function refreshStudentRealtimeTarget() {
  if (activity?.template === "progressive-reveal") {
    syncProgressiveStageFromSession(false);
  } else if (activity?.template === "open-classification") {
    syncOpenClassificationState(false);
  }
}

function startStudentRealtimeSync() {
  if (!isSessionPlay()) return;
  stopStudentRealtime();
  const context = window.ClassroomSessionAPI?.getParticipantContext?.();

  if (context?.mode !== "cloud" || !window.ClassroomSessionAPI?.subscribeRealtime) {
    setStudentRealtimeStatus("local");
    return;
  }

  sessionRealtime = window.ClassroomSessionAPI.subscribeRealtime(context.sessionId,{
    config:context.cloudConfig,
    onEvent:refreshStudentRealtimeTarget,
    onStatus:(status,detail)=>{
      setStudentRealtimeStatus(status,detail);
      if (status === "closed") {
        clearInterval(progressivePollTimer);
        clearInterval(openPollTimer);
        return;
      }
      if (activity?.template === "progressive-reveal") {
        startProgressivePolling(status === "connected" ? 12000 : 1800);
      } else if (activity?.template === "open-classification") {
        startOpenPolling(status === "connected" ? 12000 : 1800);
      }
    }
  });
}

function renderSessionBadge() {
  const badge = el("studentSessionBadge");
  if (!badge) return;
  const context = window.ClassroomSessionAPI?.getParticipantContext?.();
  if (!isSessionPlay() || !context) {
    badge.classList.add("hidden");
    return;
  }
  badge.textContent = `📡 已加入課堂 · 座號 ${context.studentCode}`;
  badge.classList.remove("hidden");
}

async function recordSessionResponse(mode, {
  selectedElements = [],
  selectedType = "",
  payload = {},
  stageKey = "final"
} = {}) {
  if (!isSessionPlay()) return;
  try {
    await window.ClassroomSessionAPI?.submitResponse?.({
      taskIndex: currentCaseIndex,
      stageKey,
      mode,
      selectedElements,
      selectedType,
      payload
    });
  } catch (error) {
    console.error("Session 作答紀錄失敗", error);
    showToast("作答已完成，但暫時無法回傳老師端");
  }
}

async function loadFromUrl() {
  try {
    const hash = window.location.hash.replace(/^#/, "");
    const params = new URLSearchParams(hash);
    const data = params.get("data");
    if (!data) throw new Error("missing-data");

    activity = await decodeActivity(data);
    const hasContent = activity?.template === "element-type"
      ? Array.isArray(activity.tasks) && activity.tasks.length
      : activity?.template === "progressive-reveal"
        ? Array.isArray(activity.progressive?.clues) && activity.progressive.clues.length >= 2
        : activity?.template === "open-classification"
          ? Array.isArray(activity.openClassification?.elements) && activity.openClassification.elements.length
            && Array.isArray(activity.openClassification?.types) && activity.openClassification.types.length
          : Array.isArray(activity.cases) && activity.cases.length;
    if (!activity || !hasContent) throw new Error("invalid-activity");

    el("loadingState").classList.add("hidden");
    el("activityState").classList.remove("hidden");
    el("studentTitle").textContent = activity.title || "課堂活動";
    el("studentSubtitle").textContent = activity.subtitle || "";
    renderSessionBadge();
    renderCase();
    startStudentRealtimeSync();
  } catch (error) {
    console.error(error);
    el("loadingState").classList.add("hidden");
    el("errorState").classList.remove("hidden");
  }
}

function totalTasks() {
  if (activity.template === "element-type") return activity.tasks.length;
  if (activity.template === "progressive-reveal") return 1;
  if (activity.template === "open-classification") return 1;
  return activity.cases.length;
}

function currentTask() {
  if (activity.template === "element-type") return activity.tasks[currentCaseIndex];
  if (activity.template === "progressive-reveal") return activity.progressive;
  if (activity.template === "open-classification") return activity.openClassification;
  return activity.cases[currentCaseIndex];
}

function resetPanels() {
  el("missionCard").classList.remove("hidden");
  el("interactionArea").classList.add("hidden");
  el("elementTypeInteraction").classList.add("hidden");
  el("progressiveInteraction").classList.add("hidden");
  el("openClassificationInteraction").classList.add("hidden");
  el("openClassificationWaitingPanel").classList.add("hidden");
  el("openClassificationResultPanel").classList.add("hidden");
  el("feedbackPanel").classList.add("hidden");
  el("revealPanel").classList.add("hidden");
  el("discussionPanel").classList.add("hidden");
  el("elementTypeResultPanel").classList.add("hidden");
  el("progressiveResultPanel").classList.add("hidden");
  el("completePanel").classList.add("hidden");
}

function renderCase() {
  resetPanels();

  const count = totalTasks();
  const progress = (currentCaseIndex / count) * 100;
  el("studentCaseIndex").textContent = `任務 ${String(currentCaseIndex + 1).padStart(2, "0")}`;
  el("caseCounter").textContent = `${currentCaseIndex + 1} / ${count}`;
  el("progressBar").style.width = `${progress}%`;
  el("progressText").textContent = `${Math.round(progress)}%`;

  if (activity.template === "element-type") {
    renderElementTypeTask();
  } else if (activity.template === "progressive-reveal") {
    renderProgressiveTask();
  } else if (activity.template === "open-classification") {
    renderOpenClassificationTask();
  } else {
    renderStandardCase();
  }
}

function updateProgress(value) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  el("progressBar").style.width = `${pct}%`;
  el("progressText").textContent = `${pct}%`;
}

function renderWorkMedia(image, name) {
  const media = el("studentWorkMedia");
  const img = el("studentWorkImage");
  if (image) {
    img.src = image;
    img.alt = name ? `${name} 作品圖片` : "作品圖片";
    media.classList.remove("hidden");
  } else {
    img.removeAttribute("src");
    media.classList.add("hidden");
  }
}

function renderProgressiveTask() {
  const task = activity.progressive;
  clearInterval(progressivePollTimer);
  const displayName = task.work.showName ? task.work.name : "神秘作品";
  el("studentCaseTitle").textContent = displayName;
  renderWorkMedia(task.work.image, displayName);
  const intro = el("studentCaseIntro");
  intro.textContent = task.work.intro || "";
  intro.classList.toggle("hidden", !task.work.intro);
  el("studentCasePrompt").textContent = task.prompt || "每看到一條新線索，就重新判斷這部作品最接近哪一種類型。";
  el("studentCaseIndex").textContent = "逐層鑑定";
  el("progressiveInteraction").classList.remove("hidden");
  progressiveStageIndex = Math.min(progressiveStageIndex, task.clues.length - 1);
  renderProgressiveStage();
  if (isSessionPlay()) syncProgressiveStageFromSession(true);
}

function progressiveHistoryEntry(stage) {
  return progressiveHistory.find(item => item.stage === stage) || null;
}

function latestProgressiveHistoryBefore(stage) {
  return progressiveHistory
    .filter(item => item.stage < stage)
    .sort((a,b) => a.stage - b.stage)
    .at(-1) || null;
}

function hydrateProgressiveHistory(responses = []) {
  const typeMap = new Map((activity?.progressive?.types || []).map(type => [type.i, type]));
  const entries = (responses || []).map(response => {
    const match = String(response.stage_key || "").match(/^clue-(\d+)$/);
    const stage = match ? Number(match[1]) : null;
    if (!stage) return null;
    const type = typeMap.get(response.selected_type);
    return {
      stage,
      typeId:response.selected_type || "",
      typeName:response.payload?.selectedTypeName || type?.n || "未命名類型",
      clueText:activity?.progressive?.clues?.[stage - 1]?.t || response.payload?.clueText || ""
    };
  }).filter(Boolean);

  const byStage = new Map(progressiveHistory.map(entry => [entry.stage, entry]));
  entries.forEach(entry => byStage.set(entry.stage, entry));
  progressiveHistory = [...byStage.values()].sort((a,b) => a.stage - b.stage);
}

function renderProgressiveStage() {
  const task = activity.progressive;
  const stageNumber = progressiveStageIndex + 1;
  const currentAnswer = progressiveHistoryEntry(stageNumber);
  const previousAnswer = latestProgressiveHistoryBefore(stageNumber);
  progressiveSelectedType = currentAnswer?.typeId || previousAnswer?.typeId || "";
  el("progressiveStageKicker").textContent = `線索 ${stageNumber} / ${task.clues.length}`;
  el("caseCounter").textContent = `${stageNumber} / ${task.clues.length}`;
  const progress = (stageNumber / task.clues.length) * 100;
  el("progressBar").style.width = `${progress}%`;
  el("progressText").textContent = `${Math.round(progress)}%`;
  el("lockBadge").textContent = `線索 ${stageNumber}`;
  el("progressiveSyncBadge").textContent = isSessionPlay() ? "📡 教師同步" : "個人預覽";

  const list = el("progressiveClueList");
  list.innerHTML = "";
  task.clues.slice(0, stageNumber).forEach((clue,index) => {
    const item = document.createElement("div");
    item.className = `progressive-clue-card ${index === progressiveStageIndex ? "current" : "past"}`;
    item.innerHTML = `<span>${index+1}</span><p>${escapeHtml(clue.t)}</p>`;
    list.appendChild(item);
  });

  const grid = el("progressiveTypeGrid");
  grid.innerHTML = "";
  task.types.forEach(type => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "student-type-choice";
    button.dataset.id = type.i;
    button.style.setProperty("--type-color", type.c || "#667085");
    button.innerHTML = `<span class="student-type-icon">${escapeHtml(type.ic||"◼")}</span><span><strong>${escapeHtml(type.n)}</strong><small>${escapeHtml(type.d||"")}</small></span>`;
    button.classList.toggle("selected", progressiveSelectedType === type.i);
    button.addEventListener("click", () => {
      progressiveSelectedType = type.i;
      grid.querySelectorAll(".student-type-choice").forEach(item => item.classList.toggle("selected", item.dataset.id === progressiveSelectedType));
    });
    grid.appendChild(button);
  });
  el("progressivePreviousAnswer").textContent = previousAnswer
    ? `上一層：${previousAnswer.typeName}｜你可以保留或修改答案。`
    : currentAnswer
      ? `你先前在這一層選擇：${currentAnswer.typeName}｜可以重新調整。`
      : "這是你的第一次判斷。";
  el("progressiveJudgementPanel").classList.remove("hidden");
  el("progressiveWaitingPanel").classList.add("hidden");
}

async function submitProgressiveJudgement() {
  const task = activity.progressive;
  if (!progressiveSelectedType) {
    showToast("請先選擇目前最符合的小說類型");
    return;
  }
  const type = task.types.find(item => item.i === progressiveSelectedType);
  const entry = {
    stage:progressiveStageIndex + 1,
    typeId:progressiveSelectedType,
    typeName:type?.n || "未命名類型",
    clueText:task.clues[progressiveStageIndex]?.t || ""
  };
  const existing = progressiveHistory.findIndex(item => item.stage === entry.stage);
  if (existing >= 0) progressiveHistory[existing] = entry;
  else progressiveHistory.push(entry);

  await recordSessionResponse("progressive-reveal", {
    selectedType:progressiveSelectedType,
    stageKey:`clue-${entry.stage}`,
    payload:{selectedTypeName:entry.typeName, clueIndex:progressiveStageIndex, clueText:entry.clueText}
  });
  el("progressiveJudgementPanel").classList.add("hidden");
  el("progressiveWaitingPanel").classList.remove("hidden");
  const isFinal = progressiveStageIndex >= task.clues.length - 1;
  if (isFinal) {
    el("progressiveWaitingText").textContent = "所有線索都已完成，來看看你的判斷歷程。";
    el("selfNextClueBtn").textContent = "查看判斷歷程";
    el("selfNextClueBtn").classList.remove("hidden");
    el("selfNextClueBtn").onclick = showProgressiveResult;
    updateProgress(((progressiveStageIndex + 1) / task.clues.length) * 100);
    return;
  }
  if (isSessionPlay()) {
    el("progressiveWaitingText").textContent = "等待老師公開下一條線索…";
    el("selfNextClueBtn").classList.add("hidden");
    startProgressivePolling();
  } else {
    el("progressiveWaitingText").textContent = "這一層已記錄；準備好後可以繼續。";
    el("selfNextClueBtn").textContent = "公開下一條線索 →";
    el("selfNextClueBtn").classList.remove("hidden");
    el("selfNextClueBtn").onclick = () => advanceProgressiveLocal();
  }
}

function advanceProgressiveLocal() {
  if (progressiveStageIndex < activity.progressive.clues.length - 1) {
    progressiveStageIndex += 1;
    renderProgressiveStage();
  }
}

function startProgressivePolling(intervalMs = 1800) {
  clearInterval(progressivePollTimer);
  progressivePollTimer = setInterval(
    () => syncProgressiveStageFromSession(false),
    Math.max(1500,Number(intervalMs)||1800)
  );
}

async function syncProgressiveStageFromSession(initial=false) {
  if (!isSessionPlay() || !window.ClassroomSessionAPI?.studentState) return;
  try {
    const state = await window.ClassroomSessionAPI.studentState();
    if (state.status === "closed") {
      clearInterval(progressivePollTimer);
      setStudentRealtimeStatus("closed");
      stopStudentRealtime();
      showToast("老師已結束這個課堂 Session");
      return;
    }
    hydrateProgressiveHistory(state.responses || []);
    const target = Math.max(0, Math.min((state.current_stage || 1) - 1, activity.progressive.clues.length - 1));
    if (target !== progressiveStageIndex || initial) {
      progressiveStageIndex = target;
      renderProgressiveStage();
    }
    if (!el("progressiveWaitingPanel").classList.contains("hidden") && target === progressiveStageIndex) {
      const submittedCurrent = progressiveHistoryEntry(progressiveStageIndex + 1);
      if (!submittedCurrent) return;
    }
  } catch (error) {
    console.warn("同步線索階段失敗", error);
  }
}

function showProgressiveResult() {
  clearInterval(progressivePollTimer);
  el("progressiveInteraction").classList.add("hidden");
  el("progressiveResultPanel").classList.remove("hidden");
  const list = el("progressiveHistoryList");
  list.innerHTML = "";
  progressiveHistory.slice().sort((a,b)=>a.stage-b.stage).forEach((entry,index,arr) => {
    const changed = index > 0 && arr[index-1].typeId !== entry.typeId;
    const row = document.createElement("div");
    row.className = `progressive-history-row ${changed ? "changed" : ""}`;
    row.innerHTML = `<span class="history-stage">線索 ${entry.stage}</span><span class="history-answer">${escapeHtml(entry.typeName)}</span><span class="history-change">${index===0?"第一次判斷":changed?"↗ 改變判斷":"→ 保留判斷"}</span>`;
    list.appendChild(row);
  });
  const ref = activity.progressive.types.find(type => type.i === activity.progressive.referenceTypeId);
  const refBox = el("progressiveReferenceResult");
  if (ref) {
    refBox.innerHTML = `<span class="summary-label">教師參考分類</span><strong>${escapeHtml(ref.ic||"◼")} ${escapeHtml(ref.n)}</strong><p>這是課堂的參考方向；更重要的是回頭說明哪一條線索支持你的判斷。</p>`;
    refBox.classList.remove("hidden");
  } else refBox.classList.add("hidden");
  updateProgress(100);
}


function openTypeById(id) {
  return activity?.openClassification?.types?.find(type => type.i === id) || null;
}

function openElementById(id) {
  return activity?.openClassification?.elements?.find(element => element.i === id) || null;
}

function openResponseFromState(responses, stageKey) {
  const response = (responses || []).find(item => item.mode === "open-classification" && item.stage_key === stageKey);
  if (!response) return null;
  return {
    selectedType:response.selected_type || "",
    selectedElements:Array.isArray(response.selected_elements) ? response.selected_elements : [],
    selectedTypeName:response.payload?.selectedTypeName || openTypeById(response.selected_type)?.n || "未命名類型",
    elementNames:Array.isArray(response.payload?.elementNames) ? response.payload.elementNames : [],
    changeReason:response.payload?.changeReason || "",
    changed:Boolean(response.payload?.changed)
  };
}

function renderOpenClassificationTask() {
  clearInterval(openPollTimer);
  const task = activity.openClassification;
  const displayName = task.work.showName ? task.work.name : "神秘作品";
  el("studentCaseTitle").textContent = displayName;
  renderWorkMedia(task.work.image, displayName);
  const intro = el("studentCaseIntro");
  intro.textContent = task.work.intro || "";
  intro.classList.toggle("hidden", !task.work.intro);
  el("studentCasePrompt").textContent = task.prompt || "選出最能代表這部作品的主要類型，並用至少兩個故事要素支持你的判斷。";
  el("studentCaseIndex").textContent = "開放分類";
  el("caseCounter").textContent = task.allowRejudge ? `${openPhase} / 2` : "1 / 1";
  updateProgress(task.allowRejudge ? openPhase * 50 : 100);
  el("lockBadge").textContent = openPhase === 1 ? "初次判斷" : "重新判斷";
  if (isSessionPlay()) {
    syncOpenClassificationState(true);
  } else {
    renderOpenClassificationForm();
  }
}

function renderOpenClassificationForm() {
  const task = activity.openClassification;
  el("openClassificationInteraction").classList.remove("hidden");
  el("openClassificationWaitingPanel").classList.add("hidden");
  el("openClassificationResultPanel").classList.add("hidden");

  const isRejudge = openPhase === 2;
  const seed = isRejudge ? (openFinalResponse || openInitialResponse) : openInitialResponse;
  openSelectedElements = new Set(seed?.selectedElements || []);
  openSelectedType = seed?.selectedType || "";

  el("openClassificationPhaseKicker").textContent = isRejudge ? "STEP 2" : "STEP 1";
  el("openClassificationPhaseTitle").textContent = isRejudge ? "聽完同學的理由，再判斷一次" : "先做你的第一次判斷";
  el("openClassificationPhaseHelp").textContent = isRejudge
    ? "你可以保留原本答案，也可以因為新的證據或同學的理由修改判斷。"
    : "選出最能代表作品的主要類型，並用故事要素支持你的判斷。";
  el("openClassificationSyncBadge").textContent = isSessionPlay() ? "📡 教師同步" : "個人預覽";
  el("openEvidenceRequirement").textContent = `至少選 ${task.minEvidence} 個`;
  el("openSubmissionHint").textContent = isRejudge ? "重新確認證據、類型與改變原因後再提交。" : "準備好後送出你的初次判斷。";
  el("submitOpenClassificationBtn").textContent = isRejudge ? "提交最終判斷" : "提交初次判斷";

  renderOpenEvidenceChoices();
  renderOpenTypeChoices();
  updateOpenEvidenceStatus();

  const original = el("openOriginalSummary");
  const reasonBlock = el("openChangeReasonBlock");
  document.querySelectorAll('input[name="openChangeReason"]').forEach(input => {
    input.checked = Boolean(openFinalResponse?.changeReason && input.value === openFinalResponse.changeReason);
  });

  if (isRejudge && openInitialResponse) {
    const type = openTypeById(openInitialResponse.selectedType);
    original.innerHTML = `
      <span class="summary-label">你原本的判斷</span>
      <strong>${escapeHtml(type?.ic||"◼")} ${escapeHtml(type?.n||openInitialResponse.selectedTypeName||"未命名類型")}</strong>
      <div class="keyword-cloud">${openInitialResponse.selectedElements.map(id=>`<span class="keyword-pill">${escapeHtml(openElementById(id)?.n||id)}</span>`).join("")}</div>
    `;
    original.classList.remove("hidden");
    reasonBlock.classList.remove("hidden");
  } else {
    original.classList.add("hidden");
    reasonBlock.classList.add("hidden");
  }
}

function renderOpenEvidenceChoices() {
  const grid = el("openEvidenceGrid");
  grid.innerHTML = "";
  activity.openClassification.elements.forEach(element => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `evidence-choice ${openSelectedElements.has(element.i) ? "selected" : ""}`;
    button.dataset.id = element.i;
    button.innerHTML = `<span class="evidence-type-dot"></span><span class="evidence-text">${escapeHtml(element.n)}</span>`;
    button.addEventListener("click", () => {
      if (openSelectedElements.has(element.i)) openSelectedElements.delete(element.i);
      else openSelectedElements.add(element.i);
      button.classList.toggle("selected", openSelectedElements.has(element.i));
      updateOpenEvidenceStatus();
    });
    grid.appendChild(button);
  });
}

function renderOpenTypeChoices() {
  const grid = el("openTypeGrid");
  grid.innerHTML = "";
  activity.openClassification.types.forEach(type => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `student-type-choice ${openSelectedType === type.i ? "selected" : ""}`;
    button.dataset.id = type.i;
    button.style.setProperty("--type-color", type.c || "#667085");
    button.innerHTML = `<span class="student-type-icon">${escapeHtml(type.ic||"◼")}</span><span><strong>${escapeHtml(type.n)}</strong><small>${escapeHtml(type.d||"")}</small></span>`;
    button.addEventListener("click", () => {
      openSelectedType = type.i;
      grid.querySelectorAll(".student-type-choice").forEach(item => item.classList.toggle("selected", item.dataset.id === openSelectedType));
    });
    grid.appendChild(button);
  });
}

function updateOpenEvidenceStatus() {
  const count = openSelectedElements.size;
  const min = activity.openClassification.minEvidence;
  el("openEvidenceStatus").textContent = `已選 ${count} 個證據 · 至少選 ${min} 個`;
}

function sameStringSet(a, b) {
  const aa = [...(a || [])].sort();
  const bb = [...(b || [])].sort();
  return aa.length === bb.length && aa.every((item,index)=>item===bb[index]);
}

async function submitOpenClassification() {
  const task = activity.openClassification;
  if (openSelectedElements.size < task.minEvidence) {
    showToast(`至少選 ${task.minEvidence} 個故事證據`);
    return;
  }
  if (!openSelectedType) {
    showToast("請先選擇最能代表作品的主要類型");
    return;
  }

  const type = openTypeById(openSelectedType);
  const selectedElements = [...openSelectedElements];
  const elementNames = selectedElements.map(id => openElementById(id)?.n || id);
  const isRejudge = openPhase === 2;
  let changeReason = "";
  let changed = false;

  if (isRejudge) {
    const reasonInput = document.querySelector('input[name="openChangeReason"]:checked');
    if (!reasonInput) {
      showToast("請選擇這次判斷的改變原因");
      return;
    }
    changeReason = reasonInput.value;
    changed = !openInitialResponse
      || openInitialResponse.selectedType !== openSelectedType
      || !sameStringSet(openInitialResponse.selectedElements, selectedElements);

    if (changed && changeReason === "我沒有改變答案") {
      showToast("你的答案有調整，請選擇較符合的改變原因");
      return;
    }
    if (!changed && changeReason !== "我沒有改變答案") {
      showToast("如果答案沒有改變，請選擇「我沒有改變答案」");
      return;
    }
  }

  const response = {
    selectedType:openSelectedType,
    selectedTypeName:type?.n || "未命名類型",
    selectedElements,
    elementNames,
    changeReason,
    changed
  };

  await recordSessionResponse("open-classification", {
    selectedElements,
    selectedType:openSelectedType,
    stageKey:isRejudge ? "final" : "initial",
    payload:{
      selectedTypeName:response.selectedTypeName,
      elementNames,
      changeReason,
      changed
    }
  });

  if (isRejudge) openFinalResponse = response;
  else openInitialResponse = response;

  if (!isRejudge) await refreshOpenStats();

  if (isRejudge || task.allowRejudge === false) {
    if (!isRejudge && task.allowRejudge === false) openFinalResponse = response;
    await refreshOpenStats();
    showOpenClassificationResult();
    return;
  }

  showOpenClassificationWaiting();
}

function renderOpenOwnAnswer(response) {
  const type = openTypeById(response?.selectedType);
  const card = el("openOwnType");
  card.style.setProperty("--result-type-color", type?.c || "#667085");
  card.innerHTML = `<span class="result-type-icon">${escapeHtml(type?.ic||"◼")}</span><strong>${escapeHtml(type?.n||response?.selectedTypeName||"未命名類型")}</strong>`;
  renderPillCloud("openOwnEvidence", (response?.selectedElements || []).map(id => openElementById(id)?.n || id));
}

function renderOpenDistribution(containerId, rows = [], emptyText = "目前還沒有其他學生提交。") {
  const list = el(containerId);
  list.innerHTML = "";
  if (!rows?.length) {
    list.innerHTML = `<div class="empty-v15">${escapeHtml(emptyText)}</div>`;
    return;
  }
  const max = Math.max(...rows.map(row => Number(row.count)||0), 1);
  rows.forEach(row => {
    const item = document.createElement("div");
    item.className = "stage-distribution-row";
    item.innerHTML = `<span>${escapeHtml(row.name||"未命名類型")}</span><div><i style="width:${Math.max(8,((Number(row.count)||0)/max)*100)}%"></i></div><strong>${Number(row.count)||0}</strong>`;
    list.appendChild(item);
  });
}

function showOpenClassificationWaiting() {
  el("openClassificationInteraction").classList.add("hidden");
  el("openClassificationWaitingPanel").classList.remove("hidden");
  el("openClassificationResultPanel").classList.add("hidden");
  el("lockBadge").textContent = "全班比較";
  updateProgress(50);
  renderOpenOwnAnswer(openInitialResponse);
  el("openStudentDiscussionPrompt").textContent = activity.openClassification.discussionPrompt ||
    "你為什麼選這個主要類型？和同學比較看看：你們用了哪些相同或不同的故事證據？";
  renderOpenDistribution("openStudentDistribution", openStats.initial || []);
  if (isSessionPlay()) {
    el("openStageWaitingMessage").textContent = "等待老師開放重新判斷…";
    el("openPreviewRejudgeBtn").classList.add("hidden");
    startOpenPolling();
  } else {
    el("openStageWaitingMessage").textContent = "預覽模式不需要等待老師控制。";
    el("openPreviewRejudgeBtn").classList.remove("hidden");
  }
}

async function refreshOpenStats() {
  if (!isSessionPlay() || !window.ClassroomSessionAPI?.studentState) return;
  try {
    const state = await window.ClassroomSessionAPI.studentState();
    openStats = state.open_stats || openStats;
    openInitialResponse = openResponseFromState(state.responses || [], "initial") || openInitialResponse;
    openFinalResponse = openResponseFromState(state.responses || [], "final") || openFinalResponse;
  } catch (error) {
    console.warn("取得開放分類統計失敗", error);
  }
}

function startOpenPolling(intervalMs = 1800) {
  clearInterval(openPollTimer);
  openPollTimer = setInterval(
    () => syncOpenClassificationState(false),
    Math.max(1500,Number(intervalMs)||1800)
  );
}

async function syncOpenClassificationState(initial=false) {
  if (!isSessionPlay() || !window.ClassroomSessionAPI?.studentState) {
    renderOpenClassificationForm();
    return;
  }
  try {
    const state = await window.ClassroomSessionAPI.studentState();
    if (state.status === "closed") {
      clearInterval(openPollTimer);
      setStudentRealtimeStatus("closed");
      stopStudentRealtime();
      showToast("老師已結束這個課堂 Session");
      return;
    }
    openStats = state.open_stats || openStats;
    openInitialResponse = openResponseFromState(state.responses || [], "initial") || openInitialResponse;
    openFinalResponse = openResponseFromState(state.responses || [], "final") || openFinalResponse;
    const targetPhase = Math.max(1, Math.min(Number(state.current_stage)||1, activity.openClassification.allowRejudge ? 2 : 1));
    openPhase = targetPhase;
    el("caseCounter").textContent = activity.openClassification.allowRejudge ? `${openPhase} / 2` : "1 / 1";
    updateProgress(activity.openClassification.allowRejudge ? openPhase * 50 : 100);

    // 教師目前的 Session 階段優先於學生是否曾經完成 final。
    // 這讓「回到初次判斷」真的能把全班帶回第一階段；再次開放第二階段時，
    // 已完成的學生會恢復最終結果，尚未完成的學生則繼續重新判斷。
    if (openPhase === 1) {
      if (openInitialResponse) {
        showOpenClassificationWaiting();
        renderOpenDistribution("openStudentDistribution", openStats.initial || []);
        return;
      }
      renderOpenClassificationForm();
      return;
    }

    if (openFinalResponse) {
      showOpenClassificationResult();
      return;
    }

    if (openInitialResponse) {
      clearInterval(openPollTimer);
      renderOpenClassificationForm();
      return;
    }

    renderOpenClassificationForm();
  } catch (error) {
    console.warn("同步開放分類階段失敗", error);
    if (initial) renderOpenClassificationForm();
  }
}

function beginOpenPreviewRejudge() {
  openPhase = 2;
  renderOpenClassificationForm();
}

function renderOpenComparisonCard(typeContainerId, evidenceContainerId, response) {
  const type = openTypeById(response?.selectedType);
  const container = el(typeContainerId);
  container.style.setProperty("--result-type-color", type?.c || "#667085");
  container.innerHTML = `<span class="result-type-icon">${escapeHtml(type?.ic||"◼")}</span><strong>${escapeHtml(type?.n||response?.selectedTypeName||"未命名類型")}</strong>`;
  renderPillCloud(evidenceContainerId, (response?.selectedElements || []).map(id=>openElementById(id)?.n||id));
}

function showOpenClassificationResult() {
  clearInterval(openPollTimer);
  el("caseCounter").textContent = activity.openClassification.allowRejudge ? "2 / 2" : "1 / 1";
  el("openClassificationInteraction").classList.add("hidden");
  el("openClassificationWaitingPanel").classList.add("hidden");
  el("openClassificationResultPanel").classList.remove("hidden");
  el("lockBadge").textContent = "完成比較";
  updateProgress(100);

  const initial = openInitialResponse || openFinalResponse;
  const final = openFinalResponse || openInitialResponse;
  renderOpenComparisonCard("openInitialTypeResult","openInitialEvidenceResult",initial);
  renderOpenComparisonCard("openFinalTypeResult","openFinalEvidenceResult",final);

  const changed = final && initial && (
    final.selectedType !== initial.selectedType ||
    !sameStringSet(final.selectedElements, initial.selectedElements)
  );
  el("openFinalReason").textContent = final?.changeReason || (changed ? "有調整判斷" : "我沒有改變答案");

  renderOpenDistribution("openInitialDistributionResult", openStats.initial || []);
  renderOpenDistribution("openFinalDistributionResult", openStats.final || [], activity.openClassification.allowRejudge ? "尚未有最終判斷。" : "本活動未開啟重新判斷。");
}

function renderElementTypeTask() {
  const task = currentTask();
  modeASelectedElements = new Set();
  modeASelectedType = "";

  const displayName = task.work.showName ? task.work.name : "神秘作品";
  el("studentCaseTitle").textContent = displayName;
  renderWorkMedia(task.work.image, displayName);

  const intro = el("studentCaseIntro");
  intro.textContent = task.work.intro || "";
  intro.classList.toggle("hidden", !task.work.intro);

  el("studentCasePrompt").textContent = task.prompt ||
    "先找出故事裡的重要要素，再根據這些證據判斷最符合的小說類型。";
  el("lockBadge").textContent = "找證據";

  el("elementTypeInteraction").classList.remove("hidden");
  el("elementStepPanel").classList.remove("hidden");
  el("typeStepPanel").classList.add("hidden");

  renderModeAElementChoices(task);
  renderModeATypeChoices(task);
  updateModeAElementStatus(task);
}

function renderModeAElementChoices(task) {
  const grid = el("elementChoiceGrid");
  grid.innerHTML = "";

  task.elements.forEach(element => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "evidence-choice";
    button.dataset.id = element.i;
    button.innerHTML = `
      <span class="evidence-type-dot"></span>
      <span class="evidence-text">${escapeHtml(element.n)}</span>
    `;
    button.addEventListener("click", () => {
      if (modeASelectedElements.has(element.i)) {
        modeASelectedElements.delete(element.i);
        button.classList.remove("selected");
      } else {
        modeASelectedElements.add(element.i);
        button.classList.add("selected");
      }
      updateModeAElementStatus(task);
    });
    grid.appendChild(button);
  });
}

function updateModeAElementStatus(task) {
  const count = modeASelectedElements.size;
  const min = task.minElements;
  el("elementSelectionStatus").textContent = `已選 ${count} 個要素 · 至少選 ${min} 個`;
  el("elementToTypeBtn").disabled = count < min;
}

function renderModeATypeChoices(task) {
  const grid = el("typeChoiceGrid");
  grid.innerHTML = "";

  task.types.forEach(type => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "student-type-choice";
    button.dataset.id = type.i;
    button.style.setProperty("--type-color", type.c || "#667085");
    button.innerHTML = `
      <span class="student-type-icon">${escapeHtml(type.ic || "◼")}</span>
      <span>
        <strong>${escapeHtml(type.n)}</strong>
        <small>${escapeHtml(type.d || "")}</small>
      </span>
    `;
    button.addEventListener("click", () => {
      modeASelectedType = type.i;
      grid.querySelectorAll(".student-type-choice").forEach(item =>
        item.classList.toggle("selected", item.dataset.id === modeASelectedType)
      );
    });
    grid.appendChild(button);
  });
}

function goToTypeStep() {
  const task = currentTask();
  if (modeASelectedElements.size < task.minElements) {
    showToast(`至少選 ${task.minElements} 個故事要素才能進入下一步`);
    return;
  }

  el("elementStepPanel").classList.add("hidden");
  el("typeStepPanel").classList.remove("hidden");
  el("lockBadge").textContent = "判斷類型";

  const cloud = el("chosenElementCloud");
  cloud.innerHTML = "";
  task.elements
    .filter(element => modeASelectedElements.has(element.i))
    .forEach(element => cloud.appendChild(createPill(element.n)));
}

function backToElementStep() {
  el("typeStepPanel").classList.add("hidden");
  el("elementStepPanel").classList.remove("hidden");
  el("lockBadge").textContent = "找證據";
}

function markCurrentTaskComplete() {
  const progress = ((currentCaseIndex + 1) / totalTasks()) * 100;
  el("progressBar").style.width = `${progress}%`;
  el("progressText").textContent = `${Math.round(progress)}%`;
}

function submitElementType() {
  const task = currentTask();
  if (!modeASelectedType) {
    showToast("請先選擇一個你認為最符合的小說類型");
    return;
  }

  el("elementTypeInteraction").classList.add("hidden");
  el("progressiveInteraction").classList.add("hidden");
  el("elementTypeResultPanel").classList.remove("hidden");
  el("lockBadge").textContent = "已完成判斷";
  markCurrentTaskComplete();

  const studentElements = [...modeASelectedElements];
  const exactElements = arraysEqualAsSets(studentElements, task.correctElementIds);
  const exactType = modeASelectedType === task.correctTypeId;

  el("elementTypeResultIcon").textContent = exactElements && exactType ? "🎯" : "🔎";
  el("elementTypeResultTitle").textContent = exactElements && exactType
    ? "你的證據和分類都抓得很完整！"
    : "來比較你的判斷和參考答案";
  el("elementTypeResultText").textContent = exactElements && exactType
    ? "你先從故事找到關鍵要素，再用這些證據完成分類。"
    : "分類不是只看最後選了哪一類，也要一起比較你用了哪些故事要素作為證據。";

  renderPillCloud("studentElementResult",
    task.elements.filter(element => modeASelectedElements.has(element.i)).map(element => element.n)
  );
  renderPillCloud("referenceElementResult",
    task.elements.filter(element => task.correctElementIds.includes(element.i)).map(element => element.n)
  );

  renderResultType("studentTypeResult", task.types.find(type => type.i === modeASelectedType));
  renderResultType("referenceTypeResult", task.types.find(type => type.i === task.correctTypeId));

  recordSessionResponse("element-type", {
    selectedElements: studentElements,
    selectedType: modeASelectedType,
    payload: {
      exactElements,
      exactType,
      referenceElementIds: task.correctElementIds,
      referenceTypeId: task.correctTypeId
    }
  });

  el("elementTypeNextBtn").textContent =
    currentCaseIndex === totalTasks() - 1 ? "完成活動" : "下一關";
}

function renderResultType(containerId, type) {
  const container = el(containerId);
  if (!type) {
    container.innerHTML = "<span>尚未設定</span>";
    return;
  }
  container.style.setProperty("--result-type-color", type.c || "#667085");
  container.innerHTML = `
    <span class="result-type-icon">${escapeHtml(type.ic || "◼")}</span>
    <strong>${escapeHtml(type.n || "未命名類型")}</strong>
  `;
}

function renderStandardCase() {
  const c = currentTask();
  selected = new Set();

  el("studentCaseTitle").textContent = c.title;
  renderWorkMedia("", "");

  const intro = el("studentCaseIntro");
  const introText = (c.intro || "").trim();
  intro.textContent = introText;
  intro.classList.toggle("hidden", !introText);

  const isOpenMode = activity.template === "open-tags";
  el("studentCasePrompt").textContent = c.prompt || (
    isOpenMode
      ? "選出你認為符合這個作品／情境的標籤，可以複選。"
      : "選出最能代表這個作品／情境的字卡。"
  );
  el("lockBadge").textContent = "思考中";
  el("interactionArea").classList.remove("hidden");

  renderCards(c.cards || []);
  updateEmptyHint();

  const poolSection = document.querySelector("#cardPool")?.closest("section");
  const answerSection = document.querySelector("#answerZone")?.closest("section");
  if (poolSection) {
    poolSection.querySelector(".mini-heading span").textContent = isOpenMode ? "可選標籤" : "故事線索";
    poolSection.querySelector(".mini-heading small").textContent = isOpenMode
      ? "可選一個或多個你認為符合的標籤"
      : "點一下或拖曳到右側";
  }
  if (answerSection) {
    answerSection.querySelector(".mini-heading span").textContent = isOpenMode ? "我的選擇" : "我的判斷";
    answerSection.querySelector(".mini-heading small").textContent = isOpenMode
      ? "沒有唯一答案，準備說明你的理由"
      : "放入最能代表作品的字卡";
  }
  el("submitCaseBtn").textContent = isOpenMode ? "確認我的選擇" : "送出判斷";

  el("revealTitle").textContent = c.revealTitle || "";
  el("revealDescription").textContent = c.revealDescription || "";
  el("nextCaseBtn").textContent = currentCaseIndex === totalTasks() - 1 ? "完成活動" : "下一關";

  el("keywordCloud").innerHTML = "";
  (c.keywords || []).forEach(keyword => el("keywordCloud").appendChild(createPill(keyword)));
}

function createPill(text) {
  const pill = document.createElement("span");
  pill.className = "keyword-pill";
  pill.textContent = text;
  return pill;
}

function renderPillCloud(id, values) {
  const cloud = el(id);
  cloud.innerHTML = "";
  values.forEach(value => cloud.appendChild(createPill(value)));
}

function renderCards(cards) {
  const pool = el("cardPool");
  const answer = el("answerZone");
  pool.innerHTML = "";
  const emptyText = activity?.template === "open-tags"
    ? "把你認為符合這部作品的標籤放到這裡"
    : "把你選中的字卡放到這裡";
  answer.innerHTML = `<div id="emptyHint" class="empty-hint">${emptyText}</div>`;

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
  zone.ondragover = e => {
    e.preventDefault();
    zone.classList.add("drag-over");
  };
  zone.ondragleave = () => zone.classList.remove("drag-over");
  zone.ondrop = e => {
    e.preventDefault();
    zone.classList.remove("drag-over");
    if (!draggedCard) return;
    zone.appendChild(draggedCard);
    draggedCard.classList.toggle("selected", isAnswerZone);
    const value = draggedCard.dataset.value;
    if (isAnswerZone) selected.add(value);
    else selected.delete(value);
    updateEmptyHint();
  };
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
  if (hint) hint.style.display = selected.size ? "none" : "grid";
}

function arraysEqualAsSets(a, b) {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every(x => setB.has(x));
}

function submitCase() {
  const c = currentTask();
  const chosen = [...selected];

  if (!chosen.length) {
    showToast(activity.template === "open-tags"
      ? "先選至少一個你認為符合的標籤"
      : "先選幾張你認為最重要的字卡");
    return;
  }

  if (activity.template === "open-tags") {
    recordSessionResponse("open-tags", {
      selectedElements: chosen,
      payload: {selectedLabels: chosen}
    });
    showOpenDiscussion(c, chosen);
    return;
  }

  const correct = c.correctCards || [];
  const exact = arraysEqualAsSets(chosen, correct);
  const correctChosen = chosen.filter(x => correct.includes(x)).length;
  const missed = correct.filter(x => !selected.has(x)).length;

  el("interactionArea").classList.add("hidden");
  el("feedbackPanel").classList.remove("hidden");
  el("lockBadge").textContent = "已作答";

  recordSessionResponse("drag-reveal", {
    selectedElements: chosen,
    payload: {
      exact,
      correctChosen,
      missed,
      referenceCards: correct
    }
  });

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

function showOpenDiscussion(c, chosen) {
  el("interactionArea").classList.add("hidden");
  el("discussionPanel").classList.remove("hidden");
  el("lockBadge").textContent = "來討論吧";
  markCurrentTaskComplete();

  const cloud = el("selectedTagCloud");
  cloud.innerHTML = "";
  chosen.forEach(tag => cloud.appendChild(createPill(tag)));

  el("discussionPromptText").textContent =
    (c.discussionPrompt || "").trim() ||
    "你為什麼會選這些標籤？和同學比較看看：你們有哪些相同或不同的判斷？如果只能選一個主要類型，你會留下哪一個？";

  el("discussionNextBtn").textContent =
    currentCaseIndex === totalTasks() - 1 ? "完成活動" : "下一關";
}

function revealCase() {
  el("feedbackPanel").classList.add("hidden");
  el("revealPanel").classList.remove("hidden");
  el("lockBadge").textContent = "已揭曉";
  markCurrentTaskComplete();
}

function nextCase() {
  if (currentCaseIndex < totalTasks() - 1) {
    currentCaseIndex += 1;
    renderCase();
    window.scrollTo({ top: 0, behavior: "smooth" });
  } else {
    showComplete();
  }
}

function showComplete() {
  el("missionCard").classList.add("hidden");
  el("completePanel").classList.remove("hidden");
  el("progressBar").style.width = "100%";
  el("progressText").textContent = "100%";
  notifyCoursePlayerComplete();

  const completeText = el("completeText");
  if (activity.template === "progressive-reveal") {
    completeText.textContent =
      "你完成了逐層判斷。回頭看看自己的答案在哪一條線索後改變，並用作品內容說明理由。";
  } else if (activity.template === "open-classification") {
    completeText.textContent =
      "你完成了開放分類。比較初次與最終判斷：答案可以改，也可以不改，重點是能用故事證據說明自己的選擇。";
  } else if (activity.template === "element-type") {
    completeText.textContent =
      "你完成了「先找要素，再判斷類型」的練習。分類時，重要的不只是答案，而是能用故事內容說明自己的判斷。";
  } else if (activity.template === "open-tags") {
    completeText.textContent =
      "你已經完成所有關卡。比較彼此的選擇與理由，看看同一部作品為什麼可能同時具有多種故事要素。";
  } else {
    completeText.textContent =
      "你已經完成所有關卡。現在回頭看看：不同作品的主要元素，會如何影響我們對故事類型的判斷？";
  }
}

function resetCurrentCase() {
  renderCase();
}

function restart() {
  currentCaseIndex = 0;
  progressiveStageIndex = 0;
  progressiveSelectedType = "";
  progressiveHistory = [];
  clearInterval(progressivePollTimer);
  openPhase = 1;
  openSelectedElements = new Set();
  openSelectedType = "";
  openInitialResponse = null;
  openFinalResponse = null;
  openStats = {initial:[], final:[], initial_total:0, final_total:0, changed_count:0, unchanged_count:0};
  clearInterval(openPollTimer);
  renderCase();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[ch]);
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
el("discussionNextBtn").addEventListener("click", nextCase);
el("resetCaseBtn").addEventListener("click", resetCurrentCase);
el("restartBtn").addEventListener("click", restart);

el("elementToTypeBtn").addEventListener("click", goToTypeStep);
el("typeBackBtn").addEventListener("click", backToElementStep);
el("submitElementTypeBtn").addEventListener("click", submitElementType);
el("submitProgressiveBtn").addEventListener("click", submitProgressiveJudgement);
el("progressiveFinishBtn").addEventListener("click", showComplete);
el("submitOpenClassificationBtn").addEventListener("click", submitOpenClassification);
el("openPreviewRejudgeBtn").addEventListener("click", beginOpenPreviewRejudge);
el("openClassificationFinishBtn").addEventListener("click", showComplete);
el("elementTypeNextBtn").addEventListener("click", nextCase);

function isEmbeddedCourseActivity() {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return params.get("embedded") === "1";
}

function notifyCoursePlayerComplete() {
  if (!isEmbeddedCourseActivity() || window.parent === window) return;
  window.parent.postMessage({
    type:"classroom:activity-complete",
    activityId:activity?.id || "",
    template:activity?.template || ""
  }, "*");
}

if (isEmbeddedCourseActivity()) {
  document.body.classList.add("embedded-activity");
}

window.addEventListener("beforeunload",()=>{
  clearInterval(progressivePollTimer);
  clearInterval(openPollTimer);
  stopStudentRealtime();
});

loadFromUrl();
