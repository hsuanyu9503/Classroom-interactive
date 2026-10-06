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
let deliberationPollTimer = null;
let deliberationSelectedChoice = "";
let deliberationSelectedReasons = new Set();
let deliberationReasonOtherSelected = false;
let deliberationReasonOtherText = "";
let deliberationDraftStage = 0;
let deliberationState = null;
let deliberationLocalResponses = [];
let sessionRealtime = null;
let openStats = {initial:[], final:[], initial_total:0, final_total:0, changed_count:0, unchanged_count:0};

// V2.15.2：依據與分類的判斷依據在學生進入頁面時隨機排列。
// 同一頁面生命週期內以快取固定順序，避免同步重繪或第二次判斷時選項位置跳動。
const evidenceOrderCache = new Map();

const el = (id) => document.getElementById(id);

function randomUnit() {
  if (globalThis.crypto?.getRandomValues) {
    const buffer = new Uint32Array(1);
    globalThis.crypto.getRandomValues(buffer);
    return buffer[0] / 0x100000000;
  }
  return Math.random();
}

function shuffledCopy(items) {
  const copy = [...(items || [])];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(randomUnit() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function studentEvidenceOrder(cacheKey, items) {
  const source = Array.isArray(items) ? items : [];
  const signature = source.map(item => item?.i || "").join("|");
  const key = `${cacheKey}:${signature}`;

  if (!evidenceOrderCache.has(key)) {
    evidenceOrderCache.set(key, shuffledCopy(source).map(item => item?.i || ""));
  }

  const byId = new Map(source.map(item => [item?.i || "", item]));
  const ordered = evidenceOrderCache.get(key)
    .map(id => byId.get(id))
    .filter(Boolean);

  // 若資料在同一頁面生命週期中被更新，仍補上新加入的項目。
  const orderedIds = new Set(ordered.map(item => item?.i || ""));
  source.forEach(item => {
    if (!orderedIds.has(item?.i || "")) ordered.push(item);
  });
  return ordered;
}

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

  if (raw?.m === "layered-deliberation" && raw.d) {
    return {
      title:raw.t||"",
      subtitle:raw.s||"",
      template:"layered-deliberation",
      deliberation:{
        sourceNote:raw.d.src||"",
        fixedQuestion:raw.d.q||"",
        chartType:raw.d.chart === "pie" ? "pie" : "bar",
        reasonMode:(raw.d.req?.rm === "choices" || raw.d.req?.reasonMode === "choices") ? "choices" : "text",
        reasonChoices:Array.isArray(raw.d.req?.rc)
          ? raw.d.req.rc
          : Array.isArray(raw.d.req?.reasonChoices) ? raw.d.req.reasonChoices : [],
        reasonRequired:raw.d.req?.reason !== false,
        needToKnowRequired:Boolean(raw.d.req?.need),
        options:Array.isArray(raw.d.o)?raw.d.o:[],
        layers:Array.isArray(raw.d.l)?raw.d.l:[],
        reflection:raw.d.r||{}
      }
    };
  }

  if (raw?.m === "open-classification" && raw.o) {
    return {
      title:raw.t||"",
      subtitle:raw.s||"",
      template:"open-classification",
      openClassification:{
        work:{name:raw.o.w?.n||"未命名材料",showName:raw.o.w?.sh!==false,intro:raw.o.w?.i||"",image:raw.o.w?.img||""},
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
        work:{name:raw.g.w?.n||"未命名材料",showName:raw.g.w?.sh!==false,intro:raw.g.w?.i||"",image:raw.g.w?.img||""},
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
          name: task.w?.n || "未命名材料",
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
  } else if (activity?.template === "layered-deliberation") {
    syncDeliberationState(false);
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
        clearInterval(deliberationPollTimer);
        return;
      }
      if (activity?.template === "progressive-reveal") {
        startProgressivePolling(status === "connected" ? 12000 : 1800);
      } else if (activity?.template === "open-classification") {
        startOpenPolling(status === "connected" ? 12000 : 1800);
      } else if (activity?.template === "layered-deliberation") {
        startDeliberationPolling(status === "connected" ? 12000 : 1800);
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
  badge.textContent = `📡 已加入課堂 · ${context.studentCode}`;
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
          : activity?.template === "layered-deliberation"
            ? Boolean(activity.deliberation?.fixedQuestion)
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
  if (activity.template === "layered-deliberation") return 1;
  return activity.cases.length;
}

function currentTask() {
  if (activity.template === "element-type") return activity.tasks[currentCaseIndex];
  if (activity.template === "progressive-reveal") return activity.progressive;
  if (activity.template === "open-classification") return activity.openClassification;
  if (activity.template === "layered-deliberation") return activity.deliberation;
  return activity.cases[currentCaseIndex];
}

function resetPanels() {
  el("missionCard").classList.remove("hidden");
  el("interactionArea").classList.add("hidden");
  el("elementTypeInteraction").classList.add("hidden");
  el("progressiveInteraction").classList.add("hidden");
  el("openClassificationInteraction").classList.add("hidden");
  el("deliberationInteraction").classList.add("hidden");
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
  } else if (activity.template === "layered-deliberation") {
    renderDeliberationTask();
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
    img.alt = name ? `${name} 材料圖片` : "材料圖片";
    media.classList.remove("hidden");
  } else {
    img.removeAttribute("src");
    media.classList.add("hidden");
  }
}


const DELIBERATION_LABELS = {
  A:"完全不能接受",
  B:"不太能接受",
  C:"大致能接受",
  D:"完全能接受",
  U:"資訊不足，暫不判斷"
};

function deliberationOwnResponse(stage) {
  return (deliberationState?.responses || deliberationLocalResponses || []).find(
    item=>item.mode==="layered-deliberation" && item.stage_key===`layer-${stage}`
  ) || null;
}

function deliberationPostResponse(stage) {
  return (deliberationState?.responses || deliberationLocalResponses || []).find(
    item=>item.mode==="layered-deliberation" && item.stage_key===`layer-${stage}-post`
  ) || null;
}

function renderDeliberationTask() {
  clearInterval(deliberationPollTimer);
  el("studentCaseIndex").textContent="逐層思辨";
  el("studentCaseTitle").textContent=activity.title || "逐層思辨";
  renderWorkMedia("", "");
  el("studentCaseIntro").textContent=activity.deliberation?.sourceNote || "";
  el("studentCaseIntro").classList.toggle("hidden",!activity.deliberation?.sourceNote);
  el("studentCasePrompt").textContent="每一層只根據目前已公開資訊作答；沒有標準答案，也不計分。";
  el("deliberationInteraction").classList.remove("hidden");

  if (isSessionPlay()) {
    syncDeliberationState(true);
  } else {
    const layers=activity.deliberation?.layers || [];
    deliberationState={
      current_stage:1,
      stage_count:layers.length || 1,
      round_state:"open",
      status:"active",
      responses:deliberationLocalResponses,
      deliberation:{
        source_note:activity.deliberation?.sourceNote || "",
        fixed_question:activity.deliberation?.fixedQuestion || "",
        options:activity.deliberation?.options || [],
        released_layers:layers.slice(0,1),
        distribution:[],
        anonymous_reasons:[],
        reflection:null
      }
    };
    renderDeliberationState();
  }
}

function normalizeDeliberationOptions(options) {
  const list=Array.isArray(options)&&options.length ? options : Object.entries(DELIBERATION_LABELS).map(([i,l])=>({i,l}));
  return list.map(item=>({id:item.i || item.id,label:item.l || item.label || DELIBERATION_LABELS[item.i] || item.i}));
}

function normalizeDeliberationReasonChoices(choices) {
  const list=Array.isArray(choices) ? choices : [];
  return list.map((item,index)=>({
    id:String(item?.i ?? item?.id ?? `reason-${index+1}`),
    label:String(item?.l ?? item?.label ?? "").trim()
  })).filter(item=>item.id && item.label);
}

function deliberationReasonMode() {
  return activity?.deliberation?.reasonMode === "choices" ? "choices" : "text";
}

function deliberationReasonChoices() {
  return normalizeDeliberationReasonChoices(activity?.deliberation?.reasonChoices);
}

function renderDeliberationReasonControls({own=null,stageChanged=false,round="open"}={}) {
  const mode=deliberationReasonMode();
  const required=activity?.deliberation?.reasonRequired !== false;
  const locked=Boolean(own) || round!=="open";
  const textField=el("deliberationReasonTextField");
  const choiceField=el("deliberationReasonChoiceField");
  const textInput=el("deliberationReasonInput");
  const grid=el("deliberationReasonChoiceGrid");
  const otherCheck=el("deliberationReasonOtherCheck");
  const otherInput=el("deliberationReasonOtherInput");

  textField?.classList.toggle("hidden",mode!=="text");
  choiceField?.classList.toggle("hidden",mode!=="choices");
  if (el("deliberationReasonRequirement")) el("deliberationReasonRequirement").textContent=required ? "必填" : "選填";
  if (el("deliberationReasonChoiceRequirement")) el("deliberationReasonChoiceRequirement").textContent=required ? "必填" : "選填";

  if (mode==="text") {
    if (textInput) textInput.disabled=locked;
    return;
  }

  if (grid) {
    grid.innerHTML="";
    deliberationReasonChoices().forEach(choice=>{
      const label=document.createElement("label");
      label.className="deliberation-reason-choice";
      const input=document.createElement("input");
      input.type="checkbox";
      input.value=choice.id;
      input.checked=deliberationSelectedReasons.has(choice.id);
      input.disabled=locked;
      const span=document.createElement("span");
      span.textContent=choice.label;
      input.addEventListener("change",()=>{
        if (input.checked) deliberationSelectedReasons.add(choice.id);
        else deliberationSelectedReasons.delete(choice.id);
        label.classList.toggle("selected",input.checked);
      });
      label.classList.toggle("selected",input.checked);
      label.append(input,span);
      grid.appendChild(label);
    });
  }

  if (otherCheck) {
    otherCheck.checked=deliberationReasonOtherSelected;
    otherCheck.disabled=locked;
    otherCheck.onchange=()=>{
      deliberationReasonOtherSelected=otherCheck.checked;
      if (!otherCheck.checked) {
        deliberationReasonOtherText="";
        if (otherInput) otherInput.value="";
      }
      otherCheck.closest(".deliberation-reason-choice")?.classList.toggle("selected",otherCheck.checked);
      otherInput?.classList.toggle("hidden",!otherCheck.checked);
      if (otherInput) otherInput.disabled=locked || !otherCheck.checked;
      if (otherCheck.checked && !locked) otherInput?.focus();
    };
    otherCheck.closest(".deliberation-reason-choice")?.classList.toggle("selected",otherCheck.checked);
  }
  if (otherInput) {
    otherInput.value=deliberationReasonOtherText;
    otherInput.classList.toggle("hidden",!deliberationReasonOtherSelected);
    otherInput.disabled=locked || !deliberationReasonOtherSelected;
    otherInput.oninput=()=>{
      deliberationReasonOtherText=otherInput.value;
    };
  }
}

function buildDeliberationReasonPayload() {
  const mode=deliberationReasonMode();
  if (mode==="text") {
    return {
      mode,
      reason:el("deliberationReasonInput").value.trim(),
      reasonSelections:[],
      reasonOther:""
    };
  }

  const choices=deliberationReasonChoices();
  const selectedIds=[...deliberationSelectedReasons];
  const selectedLabels=selectedIds
    .map(id=>choices.find(choice=>choice.id===id)?.label || "")
    .filter(Boolean);
  const other=deliberationReasonOtherSelected ? deliberationReasonOtherText.trim() : "";
  const parts=[...selectedLabels];
  if (other) parts.push(`其他：${other}`);
  return {
    mode,
    reason:parts.join("、"),
    reasonSelections:selectedIds,
    reasonOther:other
  };
}

function renderDeliberationDistribution(list, distribution, chartType = null, options = null) {
  list.innerHTML="";
  const normalized=normalizeDeliberationOptions(
    options || deliberationState?.deliberation?.options || activity?.deliberation?.options
  );
  const counts=new Map(normalized.map(option=>[option.id,0]));
  (distribution || []).forEach(item=>{
    const id=String(item.id || "");
    if (counts.has(id)) counts.set(id,Number(item.count)||0);
  });
  const total=[...counts.values()].reduce((a,b)=>a+b,0);
  if (!total) {
    list.innerHTML='<div class="empty-v15">目前沒有可顯示的全班結果。</div>';
    return;
  }
  const type=chartType || activity?.deliberation?.chartType || "bar";
  list.classList.toggle("answer-chart-pie-mode",type==="pie");
  const palette=["#3b6fb6","#e38b2c","#2f8f66","#8a5db7","#d65b5b","#2b9cb3","#c59a2b","#c35a8a","#61758a","#8a6846"];
  if (type === "pie") {
    let cursor=0;
    const slices=[];
    normalized.forEach((option,index)=>{
      const count=counts.get(option.id)||0;
      const start=cursor;
      cursor += count/total*100;
      slices.push(`${palette[index%palette.length]} ${start}% ${cursor}%`);
    });
    const wrap=document.createElement("div");wrap.className="answer-pie-layout";
    const pie=document.createElement("div");pie.className="answer-pie";
    pie.style.background=`conic-gradient(${slices.join(",")})`;
    pie.innerHTML=`<div><strong>${total}</strong><span>份回答</span></div>`;
    const legend=document.createElement("div");legend.className="answer-pie-legend";
    normalized.forEach((option,index)=>{
      const count=counts.get(option.id)||0;
      const item=document.createElement("div");
      item.innerHTML=`<i style="--legend-color:${palette[index%palette.length]}"></i><span><b>${escapeHtml(option.id)}</b> ${escapeHtml(option.label)}</span><strong>${count}</strong><small>${Math.round(count/total*100)}%</small>`;
      legend.appendChild(item);
    });
    wrap.append(pie,legend);list.appendChild(wrap);return;
  }
  const max=Math.max(...counts.values(),1);
  normalized.forEach((option,index)=>{
    const count=counts.get(option.id)||0;
    const row=document.createElement("div");
    row.className="stage-distribution-row answer-bar-row";
    const pct=Math.round(count/total*100);
    const color=palette[index%palette.length];
    row.innerHTML=`<span><b>${escapeHtml(option.id)}</b> ${escapeHtml(option.label)}</span><div><i style="width:${count?Math.max(6,(count/max)*100):0}%;background:${color}"></i></div><strong>${count}<small>${pct}%</small></strong>`;
    list.appendChild(row);
  });
}

function renderDeliberationHistory() {
  const panel=el("deliberationHistoryPanel");
  const list=el("deliberationHistoryList");
  const stageCount=Number(deliberationState?.stage_count)||1;
  const responses=(deliberationState?.responses || deliberationLocalResponses || [])
    .filter(item=>item.mode==="layered-deliberation" && /^layer-\d+$/.test(item.stage_key || ""));
  if (!responses.length) {
    panel.classList.add("hidden");
    return;
  }
  panel.classList.remove("hidden");
  list.innerHTML="";
  let previous="";
  for (let stage=1;stage<=stageCount;stage++) {
    const r=responses.find(item=>item.stage_key===`layer-${stage}`);
    if (!r) continue;
    const changed=previous && previous!==r.selected_type;
    const row=document.createElement("div");
    row.className=`deliberation-history-row ${changed?"changed":""}`;
    const option=normalizeDeliberationOptions(deliberationState?.deliberation?.options || activity?.deliberation?.options).find(item=>item.id===r.selected_type);
    row.innerHTML=`<span>第 ${stage} 層</span><strong>${escapeHtml(r.selected_type || "—")} ${escapeHtml(option?.label || DELIBERATION_LABELS[r.selected_type] || "")}</strong><small>${changed?"改變":"維持／起始"}</small>`;
    list.appendChild(row);
    previous=r.selected_type || previous;
  }
}

function renderDeliberationReflection() {
  const box=el("deliberationReflectionPanel");
  const reflection=deliberationState?.deliberation?.reflection;
  const finalReady=Number(deliberationState?.current_stage)===Number(deliberationState?.stage_count)
    && deliberationState?.round_state==="published" && reflection;
  box.classList.toggle("hidden",!finalReady);
  if (!finalReady) return;

  el("deliberationReflectionKeyLabel").textContent=reflection.k || "哪一層最影響你？為什麼？";
  el("deliberationReflectionValueLabel").textContent=reflection.v || "你得知了新事實、修正了假設，還是重新衡量某個價值？";
  el("deliberationReflectionActionLabel").textContent=reflection.a || "如果你是當事人，會怎麼回應？";
  el("deliberationReflectionExtensionLabel").textContent=reflection.e || "假設情境延伸";
  const existing=(deliberationState.responses || []).find(item=>item.stage_key==="reflection");
  if (existing) {
    const payload=existing.payload || {};
    el("deliberationReflectionKeyInput").value=payload.key || "";
    el("deliberationReflectionValueInput").value=payload.value || "";
    el("deliberationReflectionActionInput").value=payload.action || "";
    el("deliberationReflectionExtensionInput").value=payload.extension || "";
    el("submitDeliberationReflectionBtn").disabled=true;
    el("deliberationReflectionStatus").textContent="✓ 最後反思已提交";
  } else {
    el("submitDeliberationReflectionBtn").disabled=false;
    el("deliberationReflectionStatus").textContent="個人反思預設不公開給全班。";
  }
}

function renderDeliberationState() {
  if (!deliberationState) return;
  const d=deliberationState.deliberation || {};
  const stage=Math.max(1,Number(deliberationState.current_stage)||1);
  const total=Math.max(stage,Number(deliberationState.stage_count)||1);
  const round=deliberationState.round_state || "open";
  const layers=Array.isArray(d.released_layers) ? d.released_layers : [];
  const current=layers[stage-1] || layers.at(-1) || {};
  const own=deliberationOwnResponse(stage);
  const stageChanged=deliberationDraftStage!==stage;

  // Session 會定期同步教師狀態；同步不能清掉學生尚未送出的草稿。
  // 只有真正切換到另一層時才清空新一層的未提交內容。
  if (own) {
    deliberationSelectedChoice=own.selected_type || "";
    el("deliberationReasonInput").value=own.payload?.reason || "";
    deliberationSelectedReasons=new Set(Array.isArray(own.payload?.reasonSelections) ? own.payload.reasonSelections.map(String) : []);
    deliberationReasonOtherText=String(own.payload?.reasonOther || "");
    deliberationReasonOtherSelected=Boolean(deliberationReasonOtherText);
    el("deliberationNeedInput").value=own.payload?.needToKnow || "";
  } else if (stageChanged) {
    deliberationSelectedChoice="";
    deliberationSelectedReasons=new Set();
    deliberationReasonOtherSelected=false;
    deliberationReasonOtherText="";
    el("deliberationReasonInput").value="";
    el("deliberationNeedInput").value="";
  }
  deliberationDraftStage=stage;

  el("deliberationStageKicker").textContent=`第 ${stage} 層 / ${total}`;
  el("caseCounter").textContent=`${stage} / ${total}`;
  updateProgress(((stage-1)/Math.max(1,total))*100);
  el("deliberationFixedQuestionText").textContent=d.fixed_question || activity.deliberation?.fixedQuestion || "就目前資訊，你怎麼判斷？";
  el("deliberationLayerQuestionText").textContent=current.q || "";
  el("lockBadge").textContent=round==="open" ? "作答中" : round==="locked" ? "已鎖定" : "已公布";

  const released=el("deliberationReleasedLayers");
  released.innerHTML="";
  layers.forEach((layer,index)=>{
    const card=document.createElement("article");
    card.className=`deliberation-released-layer ${index===stage-1?"current":""}`;
    const tag=document.createElement("span");tag.textContent=`第 ${index+1} 層`;
    const title=document.createElement("strong");title.textContent=layer.t || `第 ${index+1} 層`;
    const body=document.createElement("p");body.textContent=layer.c || "";
    card.append(tag,title,body);
    released.appendChild(card);
  });

  const reasonRequired=activity?.deliberation?.reasonRequired !== false;
  const needRequired=Boolean(activity?.deliberation?.needToKnowRequired);
  el("deliberationNeedRequirement").textContent=needRequired ? "必填" : "選填";
  renderDeliberationReasonControls({own,stageChanged,round});

  const grid=el("deliberationChoiceGrid");
  grid.innerHTML="";
  normalizeDeliberationOptions(d.options || activity.deliberation?.options).forEach(option=>{
    const button=document.createElement("button");
    button.type="button";
    button.className="deliberation-choice";
    button.dataset.id=option.id;
    button.innerHTML=`<b>${escapeHtml(option.id)}</b><span>${escapeHtml(option.label)}</span>`;
    button.classList.toggle("selected",deliberationSelectedChoice===option.id || (!deliberationSelectedChoice && own?.selected_type===option.id));
    button.disabled=Boolean(own) || round!=="open";
    button.addEventListener("click",()=>{
      deliberationSelectedChoice=option.id;
      grid.querySelectorAll(".deliberation-choice").forEach(item=>item.classList.toggle("selected",item.dataset.id===option.id));
    });
    grid.appendChild(button);
  });

  el("deliberationAnswerPanel").classList.toggle("hidden",Boolean(own) || round!=="open");
  el("deliberationWaitingPanel").classList.toggle("hidden",round==="published");
  if (own && round!=="published") {
    el("deliberationWaitingTitle").textContent="這一層已提交";
    el("deliberationWaitingText").textContent=round==="locked" ? "老師已結束本層作答，等待公布全班結果。" : "答案已保存，等待老師結束作答。";
  } else if (!own && round==="locked") {
    el("deliberationWaitingTitle").textContent="本層作答已結束";
    el("deliberationWaitingText").textContent="這一層目前不能再提交，請等待老師公布結果。";
  } else if (!own && round==="open") {
    el("deliberationWaitingPanel").classList.add("hidden");
  }

  const published=round==="published";
  el("deliberationPublishedPanel").classList.toggle("hidden",!published);
  if (published) {
    renderDeliberationDistribution(
      el("deliberationStudentDistribution"),
      d.distribution || [],
      activity?.deliberation?.chartType || "bar",
      d.options || activity?.deliberation?.options
    );
    const reasons=el("deliberationStudentReasons");reasons.innerHTML="";
    const reasonItems=Array.isArray(d.anonymous_reasons)?d.anonymous_reasons:[];
    if (!reasonItems.length) reasons.innerHTML='<div class="empty-v15">目前沒有匿名理由。</div>';
    else reasonItems.forEach(item=>{
      const card=document.createElement("div");card.className="deliberation-reason-item";
      const reason=document.createElement("p");reason.textContent=item.reason || "";
      card.appendChild(reason);
      if (item.needToKnow) {
        const need=document.createElement("small");need.textContent=`還想知道：${item.needToKnow}`;card.appendChild(need);
      }
      reasons.appendChild(card);
    });
    const post=deliberationPostResponse(stage);
    el("deliberationPostNoteInput").value=post?.payload?.note || "";
    el("deliberationPostNoteInput").disabled=Boolean(post);
    el("submitDeliberationPostNoteBtn").disabled=Boolean(post);
    el("submitDeliberationPostNoteBtn").textContent=post ? "✓ 補記已儲存" : "儲存討論後補記";

    const previewNext=!isSessionPlay() && stage<total;
    el("deliberationPreviewNextBtn").classList.toggle("hidden",!previewNext);
  }

  renderDeliberationHistory();
  renderDeliberationReflection();
}

async function submitDeliberationAnswer() {
  const stage=Math.max(1,Number(deliberationState?.current_stage)||1);
  const choice=deliberationSelectedChoice;
  const reasonData=buildDeliberationReasonPayload();
  const reason=reasonData.reason;
  const needToKnow=el("deliberationNeedInput").value.trim();
  if (!choice) { showToast("請先選擇你的判斷"); return; }

  if (reasonData.mode==="choices") {
    const hasPreset=reasonData.reasonSelections.length>0;
    const hasOther=deliberationReasonOtherSelected;
    if (activity?.deliberation?.reasonRequired !== false && !hasPreset && !hasOther) {
      showToast("請至少勾選一個理由，或選擇「其他」");
      return;
    }
    if (hasOther && !reasonData.reasonOther) {
      showToast("請填寫「其他」理由");
      return;
    }
  } else if (activity?.deliberation?.reasonRequired !== false && !reason) {
    showToast("請填寫本層最影響你的理由");
    return;
  }

  if (activity?.deliberation?.needToKnowRequired && !needToKnow) { showToast("請填寫你還需要知道什麼"); return; }

  const payload={
    reason,
    needToKnow,
    reasonMode:reasonData.mode,
    reasonSelections:reasonData.reasonSelections,
    reasonOther:reasonData.reasonOther
  };

  if (isSessionPlay()) {
    try {
      await window.ClassroomSessionAPI.submitResponse({
        taskIndex:0, stageKey:`layer-${stage}`, mode:"layered-deliberation",
        selectedType:choice, payload
      });
      await syncDeliberationState(false);
      showToast("本層判斷已提交");
    } catch (error) {
      showToast(error.message || "提交失敗");
    }
    return;
  }

  deliberationLocalResponses=deliberationLocalResponses.filter(item=>item.stage_key!==`layer-${stage}`);
  deliberationLocalResponses.push({
    mode:"layered-deliberation",stage_key:`layer-${stage}`,selected_type:choice,
    payload,submitted_at:new Date().toISOString()
  });
  deliberationState.responses=deliberationLocalResponses;
  deliberationState.round_state="published";
  deliberationState.deliberation.distribution=[{id:choice,count:1}];
  deliberationState.deliberation.anonymous_reasons=[{reason,needToKnow}];
  if (stage===deliberationState.stage_count) deliberationState.deliberation.reflection=activity.deliberation?.reflection || {};
  renderDeliberationState();
}

async function submitDeliberationPostNote() {
  const note=el("deliberationPostNoteInput").value.trim();
  if (!note) { showToast("沒有補充內容"); return; }
  const stage=Math.max(1,Number(deliberationState?.current_stage)||1);
  if (isSessionPlay()) {
    try {
      await window.ClassroomSessionAPI.submitResponse({
        taskIndex:0,stageKey:`layer-${stage}-post`,mode:"layered-deliberation",
        payload:{note}
      });
      await syncDeliberationState(false);
      showToast("討論後補記已保存");
    } catch (error) { showToast(error.message || "補記保存失敗"); }
  } else {
    deliberationLocalResponses.push({mode:"layered-deliberation",stage_key:`layer-${stage}-post`,selected_type:"",payload:{note},submitted_at:new Date().toISOString()});
    deliberationState.responses=deliberationLocalResponses;
    renderDeliberationState();
  }
}

async function submitDeliberationReflection() {
  const payload={
    key:el("deliberationReflectionKeyInput").value.trim(),
    value:el("deliberationReflectionValueInput").value.trim(),
    action:el("deliberationReflectionActionInput").value.trim(),
    extension:el("deliberationReflectionExtensionInput").value.trim()
  };
  if (!payload.key || !payload.value || !payload.action) {
    showToast("請至少完成前三項反思");
    return;
  }
  if (isSessionPlay()) {
    try {
      await window.ClassroomSessionAPI.submitResponse({
        taskIndex:0,stageKey:"reflection",mode:"layered-deliberation",payload
      });
      await syncDeliberationState(false);
      showToast("最後反思已提交");
    } catch (error) { showToast(error.message || "反思提交失敗"); }
  } else {
    deliberationLocalResponses.push({mode:"layered-deliberation",stage_key:"reflection",selected_type:"",payload,submitted_at:new Date().toISOString()});
    deliberationState.responses=deliberationLocalResponses;
    renderDeliberationState();
  }
}

function previewNextDeliberationLayer() {
  if (isSessionPlay() || !deliberationState) return;
  const next=Math.min(Number(deliberationState.current_stage)+1,Number(deliberationState.stage_count));
  if (next===deliberationState.current_stage) return;
  deliberationState.current_stage=next;
  deliberationState.round_state="open";
  deliberationState.deliberation.released_layers=(activity.deliberation?.layers || []).slice(0,next);
  deliberationState.deliberation.distribution=[];
  deliberationState.deliberation.anonymous_reasons=[];
  deliberationState.deliberation.reflection=null;
  deliberationSelectedChoice="";
  deliberationSelectedReasons=new Set();
  deliberationReasonOtherSelected=false;
  deliberationReasonOtherText="";
  renderDeliberationState();
}

async function syncDeliberationState(initial=false) {
  if (!isSessionPlay()) return;
  try {
    const state=await window.ClassroomSessionAPI.studentState();
    deliberationState=state;
    if (state.status==="closed") setStudentRealtimeStatus("closed");
    renderDeliberationState();
    if (initial) startDeliberationPolling(1800);
  } catch (error) {
    console.warn("逐層思辨同步失敗",error);
  }
}

function startDeliberationPolling(interval=1800) {
  clearInterval(deliberationPollTimer);
  if (!isSessionPlay()) return;
  deliberationPollTimer=setInterval(()=>syncDeliberationState(false),interval);
}

function renderProgressiveTask() {
  const task = activity.progressive;
  clearInterval(progressivePollTimer);
  const displayName = task.work.showName ? task.work.name : "未命名材料";
  el("studentCaseTitle").textContent = displayName;
  renderWorkMedia(task.work.image, displayName);
  const intro = el("studentCaseIntro");
  intro.textContent = task.work.intro || "";
  intro.classList.toggle("hidden", !task.work.intro);
  el("studentCasePrompt").textContent = task.prompt || "每獲得一項新資訊，就重新判斷目前最合理的答案或分類。";
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
      typeName:response.payload?.selectedTypeName || type?.n || "未命名分類",
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
  el("progressiveStageKicker").textContent = `資訊 ${stageNumber} / ${task.clues.length}`;
  el("caseCounter").textContent = `${stageNumber} / ${task.clues.length}`;
  const progress = (stageNumber / task.clues.length) * 100;
  el("progressBar").style.width = `${progress}%`;
  el("progressText").textContent = `${Math.round(progress)}%`;
  el("lockBadge").textContent = `資訊 ${stageNumber}`;
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
    showToast("請先選擇目前最合理的分類或答案");
    return;
  }
  const type = task.types.find(item => item.i === progressiveSelectedType);
  const entry = {
    stage:progressiveStageIndex + 1,
    typeId:progressiveSelectedType,
    typeName:type?.n || "未命名分類",
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
    el("progressiveWaitingText").textContent = "所有資訊都已公開，來看看你的判斷歷程。";
    el("selfNextClueBtn").textContent = "查看判斷歷程";
    el("selfNextClueBtn").classList.remove("hidden");
    el("selfNextClueBtn").onclick = showProgressiveResult;
    updateProgress(((progressiveStageIndex + 1) / task.clues.length) * 100);
    return;
  }
  if (isSessionPlay()) {
    el("progressiveWaitingText").textContent = "等待老師公開下一項資訊…";
    el("selfNextClueBtn").classList.add("hidden");
    startProgressivePolling();
  } else {
    el("progressiveWaitingText").textContent = "這一層已記錄；準備好後可以繼續。";
    el("selfNextClueBtn").textContent = "公開下一項資訊 →";
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
    console.warn("同步資訊階段失敗", error);
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
    row.innerHTML = `<span class="history-stage">資訊 ${entry.stage}</span><span class="history-answer">${escapeHtml(entry.typeName)}</span><span class="history-change">${index===0?"第一次判斷":changed?"↗ 改變判斷":"→ 保留判斷"}</span>`;
    list.appendChild(row);
  });
  const ref = activity.progressive.types.find(type => type.i === activity.progressive.referenceTypeId);
  const refBox = el("progressiveReferenceResult");
  if (ref) {
    refBox.innerHTML = `<span class="summary-label">教師參考分類</span><strong>${escapeHtml(ref.ic||"◼")} ${escapeHtml(ref.n)}</strong><p>這是課堂的參考方向；更重要的是回頭說明哪一項資訊支持你的判斷。</p>`;
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
    selectedTypeName:response.payload?.selectedTypeName || openTypeById(response.selected_type)?.n || "未命名分類",
    elementNames:Array.isArray(response.payload?.elementNames) ? response.payload.elementNames : [],
    changeReason:response.payload?.changeReason || "",
    changed:Boolean(response.payload?.changed)
  };
}

function renderOpenClassificationTask() {
  clearInterval(openPollTimer);
  const task = activity.openClassification;
  const displayName = task.work.showName ? task.work.name : "未命名材料";
  el("studentCaseTitle").textContent = displayName;
  renderWorkMedia(task.work.image, displayName);
  const intro = el("studentCaseIntro");
  intro.textContent = task.work.intro || "";
  intro.classList.toggle("hidden", !task.work.intro);
  el("studentCasePrompt").textContent = task.prompt || "選出目前最合理的分類，並用至少兩個材料特徵、證據或資訊支持你的判斷。";
  el("studentCaseIndex").textContent = "依據與分類";
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
    : "選出目前最合理的分類，並用材料中的依據支持你的判斷。";
  el("openClassificationSyncBadge").textContent = isSessionPlay() ? "📡 教師同步" : "個人預覽";
  el("openEvidenceRequirement").textContent = `至少選 ${task.minEvidence} 個`;
  el("openSubmissionHint").textContent = isRejudge ? "重新確認依據、分類與改變原因後再提交。" : "準備好後送出你的初次判斷。";
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
      <strong>${escapeHtml(type?.ic||"◼")} ${escapeHtml(type?.n||openInitialResponse.selectedTypeName||"未命名分類")}</strong>
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
  studentEvidenceOrder("open-classification", activity.openClassification.elements).forEach(element => {
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
    showToast(`至少選 ${task.minEvidence} 個判斷依據`);
    return;
  }
  if (!openSelectedType) {
    showToast("請先選擇目前最合理的分類");
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
    selectedTypeName:type?.n || "未命名分類",
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
  card.innerHTML = `<span class="result-type-icon">${escapeHtml(type?.ic||"◼")}</span><strong>${escapeHtml(type?.n||response?.selectedTypeName||"未命名分類")}</strong>`;
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
    item.innerHTML = `<span>${escapeHtml(row.name||"未命名分類")}</span><div><i style="width:${Math.max(8,((Number(row.count)||0)/max)*100)}%"></i></div><strong>${Number(row.count)||0}</strong>`;
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
    "你為什麼選這個分類？和同學比較看看：你們用了哪些相同或不同的判斷依據？";
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
    console.warn("取得分類統計失敗", error);
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
    console.warn("同步再次判斷階段失敗", error);
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
  container.innerHTML = `<span class="result-type-icon">${escapeHtml(type?.ic||"◼")}</span><strong>${escapeHtml(type?.n||response?.selectedTypeName||"未命名分類")}</strong>`;
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

  const displayName = task.work.showName ? task.work.name : "未命名材料";
  el("studentCaseTitle").textContent = displayName;
  renderWorkMedia(task.work.image, displayName);

  const intro = el("studentCaseIntro");
  intro.textContent = task.work.intro || "";
  intro.classList.toggle("hidden", !task.work.intro);

  el("studentCasePrompt").textContent = task.prompt ||
    "先找出材料中的重要依據，再根據這些資訊判斷最合理的分類。";
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

  studentEvidenceOrder(`element-type-${currentCaseIndex}`, task.elements).forEach(element => {
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
  el("elementSelectionStatus").textContent = `已選 ${count} 個依據 · 至少選 ${min} 個`;
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
    showToast(`至少選 ${task.minElements} 個判斷依據才能進入下一步`);
    return;
  }

  el("elementStepPanel").classList.add("hidden");
  el("typeStepPanel").classList.remove("hidden");
  el("lockBadge").textContent = "進行分類";

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
    showToast("請先選擇一個你認為最合理的分類");
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
    ? "你先從材料找到關鍵依據，再用這些資訊完成分類。"
    : "分類不是只看最後選了哪一類，也要一起比較你用了哪些特徵、證據或資訊作為依據。";

  renderPillCloud("studentElementResult",
    task.elements.filter(element => modeASelectedElements.has(element.i)).map(element => element.n)
  );
  renderPillCloud("referenceElementResult",
    task.elements.filter(element => task.correctElementIds.includes(element.i)).map(element => element.n)
  );

  renderResultType("studentTypeResult", task.types.find(type => type.i === modeASelectedType));
  renderResultType("referenceTypeResult", task.types.find(type => type.i === task.correctTypeId));

  const elementNames = task.elements
    .filter(element => modeASelectedElements.has(element.i))
    .map(element => element.n);
  const selectedTypeName = task.types.find(type => type.i === modeASelectedType)?.n || modeASelectedType;

  recordSessionResponse("element-type", {
    selectedElements: studentElements,
    selectedType: modeASelectedType,
    payload: {
      elementNames,
      selectedTypeName,
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
    <strong>${escapeHtml(type.n || "未命名分類")}</strong>
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
      ? "選出你認為符合這份材料／情境的特徵或標籤，可以複選。"
      : "選出最符合這份材料／情境的項目。"
  );
  el("lockBadge").textContent = "思考中";
  el("interactionArea").classList.remove("hidden");

  renderCards(c.cards || []);
  updateEmptyHint();

  const poolSection = document.querySelector("#cardPool")?.closest("section");
  const answerSection = document.querySelector("#answerZone")?.closest("section");
  if (poolSection) {
    poolSection.querySelector(".mini-heading span").textContent = isOpenMode ? "可選標籤" : "可選項目";
    poolSection.querySelector(".mini-heading small").textContent = isOpenMode
      ? "可選一個或多個你認為符合的標籤"
      : "點一下或拖曳到右側";
  }
  if (answerSection) {
    answerSection.querySelector(".mini-heading span").textContent = isOpenMode ? "我的選擇" : "我的判斷";
    answerSection.querySelector(".mini-heading small").textContent = isOpenMode
      ? "沒有唯一答案，準備說明你的理由"
      : "放入最符合材料的項目";
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
    ? "把你認為符合這份材料的特徵或標籤放到這裡"
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
    el("feedbackTitle").textContent = "抓到關鍵項目了！";
    el("feedbackText").textContent = `你選出的 ${correctChosen} 個項目，正好都是本題的重要依據。`;
  } else {
    el("feedbackIcon").textContent = "🔎";
    el("feedbackTitle").textContent = "再多想一步也沒關係";
    const extra = chosen.length - correctChosen;
    el("feedbackText").textContent =
      `你選對 ${correctChosen} 個關鍵項目；另外還有 ${missed} 個重要依據沒有選到${extra > 0 ? `，並混入了 ${extra} 個干擾項目` : ""}。先看看揭示結果，再回頭比較哪些資訊真正影響判斷。`;
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
    "你為什麼會選這些特徵或標籤？和同學比較看看：你們用了哪些相同或不同的依據？";

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
  if (activity.template === "layered-deliberation") {
    completeText.textContent =
      "你完成了逐層思辨。這個活動不評分，也不要求你改變立場；重點是看見哪些新資訊、假設與價值影響了自己的判斷。";
  } else if (activity.template === "progressive-reveal") {
    completeText.textContent =
      "你完成了逐步判斷。回頭看看自己的答案在哪一項資訊後改變，並用材料內容說明理由。";
  } else if (activity.template === "open-classification") {
    completeText.textContent =
      "你完成了討論後再判斷。比較初次與最終判斷：答案可以改，也可以不改，重點是能用依據說明自己的選擇。";
  } else if (activity.template === "element-type") {
    completeText.textContent =
      "你完成了「先找依據，再進行分類」的練習。重要的不只是答案，而是能用材料內容說明自己的判斷。";
  } else if (activity.template === "open-tags") {
    completeText.textContent =
      "你已經完成所有關卡。比較彼此的選擇與理由，看看同一份材料為什麼可能支持不同觀點。";
  } else {
    completeText.textContent =
      "你已經完成所有關卡。現在回頭看看：哪些資訊或依據最影響你的判斷？";
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
  clearInterval(deliberationPollTimer);
  deliberationSelectedChoice="";
  deliberationSelectedReasons=new Set();
  deliberationReasonOtherSelected=false;
  deliberationReasonOtherText="";
  deliberationState=null;
  deliberationLocalResponses=[];
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
el("submitDeliberationBtn")?.addEventListener("click",submitDeliberationAnswer);
el("submitDeliberationPostNoteBtn")?.addEventListener("click",submitDeliberationPostNote);
el("submitDeliberationReflectionBtn")?.addEventListener("click",submitDeliberationReflection);
el("deliberationPreviewNextBtn")?.addEventListener("click",previewNextDeliberationLayer);
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
  clearInterval(deliberationPollTimer);
  stopStudentRealtime();
});

loadFromUrl();
