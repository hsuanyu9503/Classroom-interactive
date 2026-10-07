/* V2.19.0 | Activity Editor + layered deliberation + custom choices */
/* ----- Activity Template Editor ----- */
const STORAGE_KEY = "interactive-classroom-v1";
const LAST_BACKUP_KEY = "interactive-classroom-last-backup";
const TYPE_STORAGE_KEY = "interactive-classroom-v15-types";
const WORK_STORAGE_KEY = "interactive-classroom-v15-works";

let activities = [];
let currentId = null;
let toastTimer = null;

const el = (id) => document.getElementById(id);
const ActivityModules = window.ClassroomActivityModules;

const activityTitle = el("activityTitle");
const activitySubtitle = el("activitySubtitle");
const caseEditor = el("caseEditor");
const activityList = el("activityList");
const caseTemplate = el("caseTemplate");
const elementTypeTaskTemplate = el("elementTypeTaskTemplate");
const elementTypeTaskEditor = el("elementTypeTaskEditor");
const elementTypeEditorSection = el("elementTypeEditorSection");
const progressiveEditorSection = el("progressiveEditorSection");
const progressiveTaskTemplate = el("progressiveTaskTemplate");
const progressiveTaskEditor = el("progressiveTaskEditor");
const openClassificationEditorSection = el("openClassificationEditorSection");
const openClassificationTaskTemplate = el("openClassificationTaskTemplate");
const openClassificationTaskEditor = el("openClassificationTaskEditor");
const deliberationEditorSection = el("deliberationEditorSection");
const deliberationLayersEditor = el("deliberationLayersEditor");
const deliberationLayerCount = el("deliberationLayerCount");
const decreaseDeliberationLayerBtn = el("decreaseDeliberationLayerBtn");
const increaseDeliberationLayerBtn = el("increaseDeliberationLayerBtn");
const deliberationSourceNote = el("deliberationSourceNote");
const deliberationFixedQuestion = el("deliberationFixedQuestion");
const deliberationOptionsEditor = el("deliberationOptionsEditor");
const addDeliberationOptionBtn = el("addDeliberationOptionBtn");
const deliberationChartType = el("deliberationChartType");
const deliberationReasonMode = el("deliberationReasonMode");
const deliberationReasonChoicesSettings = el("deliberationReasonChoicesSettings");
const deliberationReasonChoicesEditor = el("deliberationReasonChoicesEditor");
const addDeliberationReasonChoiceBtn = el("addDeliberationReasonChoiceBtn");
const deliberationReasonRequired = el("deliberationReasonRequired");
const deliberationNeedRequired = el("deliberationNeedRequired");
const deliberationReflectionKey = el("deliberationReflectionKey");
const deliberationReflectionValue = el("deliberationReflectionValue");
const deliberationReflectionAction = el("deliberationReflectionAction");
const deliberationReflectionExtension = el("deliberationReflectionExtension");
const scaleEditorSection = el("scaleEditorSection");
const scaleQuestion = el("scaleQuestion");
const scalePointCount = el("scalePointCount");
const scaleLeftLabel = el("scaleLeftLabel");
const scaleRightLabel = el("scaleRightLabel");
const rankingEditorSection = el("rankingEditorSection");
const rankingQuestion = el("rankingQuestion");
const rankingItemsEditor = el("rankingItemsEditor");
const addRankingItemBtn = el("addRankingItemBtn");
const openTextEditorSection = el("openTextEditorSection");
const openTextQuestion = el("openTextQuestion");
const openTextPlaceholder = el("openTextPlaceholder");
const openTextMaxLength = el("openTextMaxLength");
const standardTaskToolbar = el("standardTaskToolbar");
const shareDialog = el("shareDialog");
const shareUrlInput = el("shareUrl");
const qrcodeEl = el("qrcode");
const qrNotice = el("qrNotice");
const modeInputs = [...document.querySelectorAll('input[name="activityMode"]')];
const editorPanel = document.querySelector(".editor-panel");
const templateKicker = el("templateKicker");
const templateTitle = el("templateTitle");
const QR_SAFE_MAX_LENGTH = 1100;

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

function readJsonStorage(key, fallback = []) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return Array.isArray(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function getTypeLibrary() {
  return readJsonStorage(TYPE_STORAGE_KEY, []).map(type => ({
    ...type,
    elements: (type.elements || []).map(element =>
      typeof element === "string"
        ? { id: `${type.id}-${element}`, name: element }
        : { id: element.id, name: element.name }
    )
  }));
}

function getWorkLibrary() {
  return readJsonStorage(WORK_STORAGE_KEY, []).map(work => ({
    ...work,
    clues: (work.clues || []).map(clue =>
      typeof clue === "string"
        ? {id:`${work.id}-${clue}`, text:clue}
        : {id:clue.id, text:clue.text}
    )
  }));
}

function getAllLibraryElements() {
  return getTypeLibrary().flatMap(type =>
    (type.elements || []).map(element => ({
      id: element.id,
      name: element.name,
      typeId: type.id,
      typeName: type.name,
      typeIcon: type.icon || "◼",
      typeColor: type.color || "#667085"
    }))
  );
}

function getLibraryElementMap() {
  return new Map(getAllLibraryElements().map(element => [element.id, element]));
}

function getTypeMap() {
  return new Map(getTypeLibrary().map(type => [type.id, type]));
}

function getWorkMap() {
  return new Map(getWorkLibrary().map(work => [work.id, work]));
}

function newModeATask() {
  const works = getWorkLibrary();
  const types = getTypeLibrary();
  const allElements = getAllLibraryElements();
  const firstWork = works[0];
  const initialElements = firstWork?.elementRefs?.length
    ? firstWork.elementRefs.filter(id => allElements.some(element => element.id === id))
    : [];

  return {
    id: createId(),
    workRef: firstWork?.id || "",
    prompt: "",
    elementRefs: initialElements,
    correctElementRefs: firstWork?.elementRefs?.filter(id => initialElements.includes(id)) || [],
    typeRefs: types.map(type => type.id),
    correctTypeRef: "",
    minElements: 2
  };
}

function newProgressiveTask() {
  const works = getWorkLibrary();
  const firstWork = works.find(work => (work.clues || []).length >= 2) || works[0];
  const types = getTypeLibrary();
  return {
    workRef:firstWork?.id || "",
    prompt:"",
    clueRefs:(firstWork?.clues || []).map(clue => clue.id),
    typeRefs:types.map(type => type.id),
    referenceTypeRef:""
  };
}

function newOpenClassificationTask() {
  const works = getWorkLibrary();
  const firstWork = works[0];
  const validElements = new Set(getAllLibraryElements().map(element => element.id));
  const initialElements = (firstWork?.elementRefs || []).filter(id => validElements.has(id));
  return {
    workRef:firstWork?.id || "",
    prompt:"",
    elementRefs:initialElements,
    typeRefs:getTypeLibrary().map(type => type.id),
    minEvidence:2,
    discussionPrompt:"",
    allowRejudge:true
  };
}


function newScaleActivityData() {
  return {question:"",pointCount:5,leftLabel:"完全不同意",rightLabel:"非常同意"};
}

function newRankingActivityData() {
  return {
    question:"",
    items:[
      {id:createId(),label:"選項一"},
      {id:createId(),label:"選項二"},
      {id:createId(),label:"選項三"}
    ]
  };
}

function newOpenTextActivityData() {
  return {question:"",placeholder:"請用一兩句話寫下你的想法",maxLength:240};
}

function normalizeScaleData(data) {
  const base=newScaleActivityData();
  const pointCount=Math.max(3,Math.min(10,Math.round(Number(data?.pointCount)||base.pointCount)));
  return {
    question:String(data?.question || ""),
    pointCount,
    leftLabel:String(data?.leftLabel || base.leftLabel),
    rightLabel:String(data?.rightLabel || base.rightLabel)
  };
}

function normalizeRankingData(data) {
  const source=Array.isArray(data?.items) ? data.items : [];
  const items=source.map((item,index)=>({
    id:String(item?.id || createId()),
    label:String(item?.label || "").trim() || `選項 ${index+1}`
  })).slice(0,10);
  return {question:String(data?.question || ""),items:items.length>=2 ? items : newRankingActivityData().items};
}

function normalizeOpenTextData(data) {
  const base=newOpenTextActivityData();
  return {
    question:String(data?.question || ""),
    placeholder:String(data?.placeholder || base.placeholder),
    maxLength:Math.max(30,Math.min(1000,Math.round(Number(data?.maxLength)||base.maxLength)))
  };
}

function defaultDeliberationLayers() {
  return [
    {id:createId(),title:"① 初始資訊",content:"",question:"根據目前資訊，你的判斷是什麼？",teacherNote:""},
    {id:createId(),title:"② 補充資訊",content:"",question:"這項新資訊有改變你的判斷嗎？為什麼？",teacherNote:""},
    {id:createId(),title:"③ 不同觀點／條件",content:"",question:"加入這項資訊後，你最在意的判斷依據是什麼？",teacherNote:""},
    {id:createId(),title:"④ 最後資訊",content:"",question:"綜合目前所有資訊，你最後的判斷是什麼？",teacherNote:""}
  ];
}


function defaultDeliberationOptions() {
  return [
    {id:"A",label:"非常不同意"},
    {id:"B",label:"比較不同意"},
    {id:"C",label:"比較同意"},
    {id:"D",label:"非常同意"},
    {id:"U",label:"資訊不足，暫不判斷"}
  ];
}

function normalizeDeliberationOptionsData(options) {
  const source=Array.isArray(options) ? options : [];
  const cleaned=[];
  const used=new Set();
  source.forEach((item,index)=>{
    if (cleaned.length>=10) return;
    let id=String(item?.id ?? item?.i ?? "").trim().toUpperCase();
    let label=String(item?.label ?? item?.l ?? "").trim();
    if (!id || used.has(id)) return;
    if (!label) label=`選項 ${index+1}`;
    used.add(id);
    cleaned.push({id,label});
  });
  return cleaned.length>=2 ? cleaned : defaultDeliberationOptions();
}

function nextDeliberationOptionCode() {
  const used=new Set(
    [...(deliberationOptionsEditor?.querySelectorAll(".deliberation-option-row") || [])]
      .map(row=>row.dataset.optionId)
      .filter(Boolean)
  );
  for (let i=0;i<26;i++) {
    const code=String.fromCharCode(65+i);
    if (!used.has(code)) return code;
  }
  let n=1;
  while (used.has(`O${n}`)) n++;
  return `O${n}`;
}

function refreshDeliberationOptionRows() {
  const rows=[...(deliberationOptionsEditor?.querySelectorAll(".deliberation-option-row") || [])];
  rows.forEach((row,index)=>{
    row.querySelector(".deliberation-option-order").textContent=`選項 ${index+1}`;
    const remove=row.querySelector(".deliberation-option-remove");
    if (remove) remove.disabled=rows.length<=2;
  });
  if (addDeliberationOptionBtn) addDeliberationOptionBtn.disabled=rows.length>=10;
}

function addDeliberationOption(option=null) {
  if (!deliberationOptionsEditor) return;
  const count=deliberationOptionsEditor.querySelectorAll(".deliberation-option-row").length;
  if (count>=10) { showToast("逐層思辨最多 10 個選項"); return; }
  const id=String(option?.id || option?.i || nextDeliberationOptionCode()).trim().toUpperCase();
  const label=String(option?.label || option?.l || "").trim();
  const row=document.createElement("div");
  row.className="deliberation-option-row";
  row.dataset.optionId=id;
  row.innerHTML=`
    <span class="deliberation-option-order">選項 ${count+1}</span>
    <input class="deliberation-option-label" type="text" maxlength="80" placeholder="輸入選項內容" value="${escapeHtml(label)}">
    <button class="btn btn-danger-soft deliberation-option-remove" type="button">移除</button>
  `;
  row.querySelector(".deliberation-option-remove").addEventListener("click",()=>{
    if (deliberationOptionsEditor.querySelectorAll(".deliberation-option-row").length<=2) {
      showToast("逐層思辨至少需要 2 個選項");
      return;
    }
    row.remove();
    refreshDeliberationOptionRows();
  });
  deliberationOptionsEditor.appendChild(row);
  refreshDeliberationOptionRows();
}

function readDeliberationOptionsEditor() {
  return [...(deliberationOptionsEditor?.querySelectorAll(".deliberation-option-row") || [])].map(row=>({
    id:String(row.dataset.optionId || "").trim().toUpperCase(),
    label:row.querySelector(".deliberation-option-label")?.value.trim() || ""
  }));
}

function normalizeDeliberationReasonChoicesData(choices) {
  const source=Array.isArray(choices) ? choices : [];
  const cleaned=[];
  const used=new Set();
  source.forEach((item,index)=>{
    if (cleaned.length>=12) return;
    const id=String(item?.id ?? item?.i ?? `reason-${index+1}`).trim() || `reason-${index+1}`;
    const label=String(item?.label ?? item?.l ?? "").trim();
    if (used.has(id)) return;
    used.add(id);
    cleaned.push({id,label});
  });
  return cleaned;
}

function refreshDeliberationReasonChoiceRows() {
  const rows=[...(deliberationReasonChoicesEditor?.querySelectorAll(".deliberation-reason-option-row") || [])];
  rows.forEach((row,index)=>{
    const order=row.querySelector(".deliberation-reason-option-order");
    if (order) order.textContent=`理由 ${index+1}`;
    const remove=row.querySelector(".deliberation-reason-option-remove");
    if (remove) remove.disabled=rows.length<=1;
  });
  if (addDeliberationReasonChoiceBtn) addDeliberationReasonChoiceBtn.disabled=rows.length>=12;
}

function addDeliberationReasonChoice(choice=null) {
  if (!deliberationReasonChoicesEditor) return null;
  const count=deliberationReasonChoicesEditor.querySelectorAll(".deliberation-reason-option-row").length;
  if (count>=12) {
    showToast("預設理由最多 12 個");
    return null;
  }
  const id=String(choice?.id || choice?.i || createId()).trim();
  const label=String(choice?.label || choice?.l || "").trim();
  const row=document.createElement("div");
  row.className="deliberation-reason-option-row";
  row.dataset.reasonId=id;
  row.innerHTML=`
    <span class="deliberation-reason-option-order">理由 ${count+1}</span>
    <input class="deliberation-reason-option-label" type="text" maxlength="120" placeholder="輸入學生可勾選的理由" value="${escapeHtml(label)}">
    <button class="btn btn-danger-soft deliberation-reason-option-remove" type="button">移除</button>
  `;
  row.querySelector(".deliberation-reason-option-remove").addEventListener("click",()=>{
    const rows=deliberationReasonChoicesEditor.querySelectorAll(".deliberation-reason-option-row");
    if (rows.length<=1) {
      showToast("勾選模式至少需要 1 個預設理由");
      return;
    }
    row.remove();
    refreshDeliberationReasonChoiceRows();
  });
  deliberationReasonChoicesEditor.appendChild(row);
  refreshDeliberationReasonChoiceRows();
  return row;
}

function readDeliberationReasonChoicesEditor() {
  return [...(deliberationReasonChoicesEditor?.querySelectorAll(".deliberation-reason-option-row") || [])].map(row=>({
    id:String(row.dataset.reasonId || "").trim(),
    label:row.querySelector(".deliberation-reason-option-label")?.value.trim() || ""
  }));
}

function updateDeliberationReasonModeUi({ensureChoice=true}={}) {
  const choicesMode=deliberationReasonMode?.value === "choices";
  deliberationReasonChoicesSettings?.classList.toggle("hidden",!choicesMode);
  if (choicesMode && ensureChoice && deliberationReasonChoicesEditor && !deliberationReasonChoicesEditor.children.length) {
    addDeliberationReasonChoice();
  }
  refreshDeliberationReasonChoiceRows();
}

function newDeliberationActivityData() {
  return {
    sourceNote:"",
    fixedQuestion:"就目前資訊，你的判斷是什麼？",
    options:defaultDeliberationOptions(),
    chartType:"bar",
    reasonMode:"text",
    reasonChoices:[],
    reasonRequired:true,
    needToKnowRequired:false,
    layers:defaultDeliberationLayers(),
    reflection:{
      key:"哪一層最影響你？為什麼？",
      value:"你得知了新事實、修正了假設，還是重新衡量某個價值？",
      action:"如果你需要做出實際回應，會怎麼做？",
      extension:"還有哪些資訊可能改變你的判斷？你會如何確認？"
    }
  };
}

const defaultActivity = {
  id: createId(),
  title: "示例活動｜關鍵依據判斷",
  subtitle: "先選出重要資訊，再揭示教師整理",
  template: "drag-reveal",
  cases: [
    {
      title: "校園植物觀察",
      intro: "觀察一株校園植物的葉片、莖與生長位置，從提供的特徵中選出最能支持判斷的項目。",
      prompt: "哪些項目是完成判斷時最重要的依據？",
      cards: ["葉片形狀", "葉脈特徵", "生長位置", "花盆顏色", "旁邊是否有人"],
      correctCards: ["葉片形狀", "葉脈特徵", "生長位置"],
      revealTitle: "判斷要看與問題直接相關的特徵",
      keywords: ["觀察", "特徵", "證據", "判斷"],
      revealDescription: "同一份材料裡會有很多資訊；真正有用的是能直接支持問題判斷的特徵與證據。",
      discussionPrompt: ""
    }
  ],
  tasks: [],
  progressive: null,
  openClassification: null,
  deliberation: null
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

  activities = activities.map(activity => {
    const template = ActivityModules?.normalizeMode?.(activity.template) || "drag-reveal";
    const definition = ActivityModules?.get?.(template);
    const normalized = {
      ...activity,
      template,
      cases: [],
      tasks: [],
      progressive: null,
      openClassification: null,
      deliberation: null,
      scale: null,
      ranking: null,
      openText: null
    };

    if (definition?.dataKey === "cases") {
      normalized.cases = Array.isArray(activity.cases) ? activity.cases : [];
    } else if (definition?.dataKey === "tasks") {
      normalized.tasks = Array.isArray(activity.tasks) ? activity.tasks : [];
    } else if (definition?.dataKey === "progressive") {
      normalized.progressive = activity.progressive || null;
    } else if (definition?.dataKey === "openClassification") {
      normalized.openClassification = activity.openClassification || null;
    } else if (definition?.dataKey === "scale") {
      normalized.scale = normalizeScaleData(activity.scale);
    } else if (definition?.dataKey === "ranking") {
      normalized.ranking = normalizeRankingData(activity.ranking);
    } else if (definition?.dataKey === "openText") {
      normalized.openText = normalizeOpenTextData(activity.openText);
    } else if (definition?.dataKey === "deliberation") {
      normalized.deliberation = {
        ...newDeliberationActivityData(),
        ...(activity.deliberation || {}),
        options:normalizeDeliberationOptionsData(activity.deliberation?.options),
        reasonMode:activity.deliberation?.reasonMode === "choices" ? "choices" : "text",
        reasonChoices:normalizeDeliberationReasonChoicesData(activity.deliberation?.reasonChoices)
      };
    }
    return normalized;
  });

  // V1.6.2：移除各模式不會使用的舊資料分支，讓 localStorage 也保持乾淨。
  persist();

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
    cases: [{
      title: "",
      intro: "",
      prompt: "",
      cards: [],
      correctCards: [],
      revealTitle: "",
      keywords: [],
      revealDescription: "",
      discussionPrompt: ""
    }],
    tasks: [],
    progressive: null,
    openClassification: null,
    deliberation: null,
    scale: null,
    ranking: null,
    openText: null
  };
}

function getModeLabel(template) {
  return ActivityModules?.modeLabel?.(template) || "選擇與揭示";
}

function renderLibrary() {
  activityList.innerHTML = "";

  activities.forEach((activity) => {
    const item = document.createElement("div");
    item.className = `activity-item ${activity.id === currentId ? "active" : ""}`;
    const count = ActivityModules?.libraryTaskCount?.(activity) ?? (activity.cases?.length || 0);
    item.innerHTML = `
      <strong>${escapeHtml(activity.title || "未命名活動")}</strong>
      <small>${count} 個任務 · ${getModeLabel(activity.template)}</small>
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

// ---------- 舊兩種活動模板 ----------
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
  applyModeUI(getSelectedMode());
}

function addCase(caseData = {}) {
  const fragment = caseTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".case-card");

  card.querySelector(".case-title").value = caseData.title || "";
  card.querySelector(".case-intro").value = caseData.intro || "";
  card.querySelector(".case-prompt").value = caseData.prompt || "";
  card.querySelector(".case-reveal-title").value = caseData.revealTitle || "";
  card.querySelector(".case-keywords").value = (caseData.keywords || []).join("、");
  card.querySelector(".case-reveal-desc").value = caseData.revealDescription || "";
  card.querySelector(".case-discussion-prompt").value = caseData.discussionPrompt || "";

  const cards = Array.isArray(caseData.cards) ? caseData.cards : [];
  const correctCards = new Set(caseData.correctCards || []);
  if (cards.length) cards.forEach(text => addCardRow(card, text, correctCards.has(text)));
  else addCardRow(card);

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
  applyModeUI(getSelectedMode());
}

function readCases() {
  return [...caseEditor.querySelectorAll(".case-card")].map(card => {
    const rows = [...card.querySelectorAll(".card-editor-row")];
    const cards = [];
    const correctCards = [];
    rows.forEach(row => {
      const text = row.querySelector(".card-text").value.trim();
      if (!text) return;
      cards.push(text);
      if (row.querySelector(".card-correct-toggle").checked) correctCards.push(text);
    });

    return {
      title: card.querySelector(".case-title").value.trim(),
      intro: card.querySelector(".case-intro").value.trim(),
      prompt: card.querySelector(".case-prompt").value.trim(),
      cards,
      correctCards,
      revealTitle: card.querySelector(".case-reveal-title").value.trim(),
      keywords: splitKeywords(card.querySelector(".case-keywords").value),
      revealDescription: card.querySelector(".case-reveal-desc").value.trim(),
      discussionPrompt: card.querySelector(".case-discussion-prompt").value.trim()
    };
  });
}

// ---------- V1.6 要素 → 類型 ----------
function populateWorkSelect(select, selectedId = "") {
  const works = getWorkLibrary();
  select.innerHTML = '<option value="">— 選擇材料庫中的材料 —</option>';
  works.forEach(work => {
    const option = document.createElement("option");
    option.value = work.id;
    option.textContent = work.name || "未命名材料";
    option.selected = work.id === selectedId;
    select.appendChild(option);
  });
  if (selectedId && !works.some(work => work.id === selectedId)) {
    const missing = document.createElement("option");
    missing.value = selectedId;
    missing.textContent = "⚠ 引用的材料已不存在";
    missing.selected = true;
    select.appendChild(missing);
  }
}

function renderModeAWorkPreview(card) {
  const workId = card.querySelector(".mode-a-work-select").value;
  const work = getWorkMap().get(workId);
  const preview = card.querySelector(".mode-a-work-preview");
  if (!work) {
    preview.innerHTML = '<div class="mode-a-missing-data">請先選擇材料；若材料庫是空的，請先到「材料庫」建立材料。</div>';
    return;
  }
  const image = work.image
    ? `<div class="mode-a-preview-image"><img src="${escapeHtml(work.image)}" alt=""></div>`
    : `<div class="mode-a-preview-image placeholder">🎬</div>`;
  preview.innerHTML = `
    ${image}
    <div>
      <span class="section-kicker">引用材料</span>
      <h4>${escapeHtml(work.name || "未命名材料")}</h4>
      <p>${escapeHtml(work.intro || "尚未設定學生版材料介紹。")}</p>
    </div>
  `;
}

function renderModeAElementGrid(card, task) {
  const grid = card.querySelector(".mode-a-element-grid");
  const allElements = getAllLibraryElements();
  const provided = new Set(task.elementRefs || []);
  const correct = new Set(task.correctElementRefs || []);

  grid.innerHTML = "";
  if (!allElements.length) {
    grid.innerHTML = '<div class="mode-a-missing-data">分類工具箱目前沒有判斷依據，請先建立。</div>';
    return;
  }

  allElements.forEach(element => {
    const row = document.createElement("div");
    row.className = "mode-a-element-row";
    row.dataset.elementId = element.id;
    row.innerHTML = `
      <div class="mode-a-element-name">
        <span class="mode-a-type-dot" style="background:${escapeHtml(element.typeColor)}"></span>
        <strong>${escapeHtml(element.name)}</strong>
        <small>${escapeHtml(element.typeIcon)} ${escapeHtml(element.typeName)}</small>
      </div>
      <label class="mini-check">
        <input class="mode-a-element-provided" type="checkbox" ${provided.has(element.id) ? "checked" : ""}>
        <span>提供</span>
      </label>
      <label class="mini-check reference-check">
        <input class="mode-a-element-correct" type="checkbox" ${correct.has(element.id) ? "checked" : ""}>
        <span>參考</span>
      </label>
    `;
    const providedInput = row.querySelector(".mode-a-element-provided");
    const correctInput = row.querySelector(".mode-a-element-correct");
    providedInput.addEventListener("change", () => {
      if (!providedInput.checked) correctInput.checked = false;
    });
    correctInput.addEventListener("change", () => {
      if (correctInput.checked) providedInput.checked = true;
    });
    grid.appendChild(row);
  });
}

function renderModeATypeGrid(card, task) {
  const grid = card.querySelector(".mode-a-type-grid");
  const reference = card.querySelector(".mode-a-reference-type");
  const types = getTypeLibrary();
  const provided = new Set(task.typeRefs || []);

  grid.innerHTML = "";
  reference.innerHTML = '<option value="">— 選擇參考分類 —</option>';

  if (!types.length) {
    grid.innerHTML = '<div class="mode-a-missing-data">分類工具箱目前沒有分類。</div>';
    return;
  }

  types.forEach(type => {
    const label = document.createElement("label");
    label.className = "mode-a-type-option";
    label.innerHTML = `
      <input class="mode-a-type-provided" type="checkbox" value="${escapeHtml(type.id)}" ${provided.has(type.id) ? "checked" : ""}>
      <span class="mode-a-type-icon">${escapeHtml(type.icon || "◼")}</span>
      <span>
        <strong>${escapeHtml(type.name || "未命名分類")}</strong>
        <small>${escapeHtml(type.description || "")}</small>
      </span>
    `;
    grid.appendChild(label);

    const option = document.createElement("option");
    option.value = type.id;
    option.textContent = `${type.icon || "◼"} ${type.name || "未命名分類"}`;
    option.selected = task.correctTypeRef === type.id;
    reference.appendChild(option);
  });
}

function refreshModeAChoices(card, taskOverride = null) {
  const task = taskOverride || readModeATaskCard(card);
  renderModeAWorkPreview(card);
  renderModeAElementGrid(card, task);
  renderModeATypeGrid(card, task);
}

function addModeATask(taskData = null) {
  const task = taskData || newModeATask();
  const fragment = elementTypeTaskTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".element-type-task-card");
  card.dataset.taskId = task.id || createId();

  const workSelect = card.querySelector(".mode-a-work-select");
  populateWorkSelect(workSelect, task.workRef || "");
  card.querySelector(".mode-a-min-elements").value = Math.max(1, Number(task.minElements) || 2);
  card.querySelector(".mode-a-prompt").value = task.prompt || "";

  workSelect.addEventListener("change", () => {
    const work = getWorkMap().get(workSelect.value);
    const snapshot = readModeATaskCard(card);
    snapshot.workRef = workSelect.value;
    if (work?.elementRefs?.length) {
      const valid = new Set(getAllLibraryElements().map(element => element.id));
      const workRefs = work.elementRefs.filter(id => valid.has(id));
      if (workRefs.length && !snapshot.correctElementRefs.length) {
        snapshot.correctElementRefs = workRefs;
        snapshot.elementRefs = [...new Set([...snapshot.elementRefs, ...workRefs])];
      }
    }
    refreshModeAChoices(card, snapshot);
  });

  card.querySelector(".mode-a-select-all-elements").addEventListener("click", () => {
    card.querySelectorAll(".mode-a-element-provided").forEach(input => input.checked = true);
  });
  card.querySelector(".mode-a-select-all-types").addEventListener("click", () => {
    card.querySelectorAll(".mode-a-type-provided").forEach(input => input.checked = true);
  });
  card.querySelector(".mode-a-remove-task").addEventListener("click", () => {
    if (elementTypeTaskEditor.children.length <= 1) {
      showToast("至少要保留一個分類任務");
      return;
    }
    card.remove();
    refreshModeATaskNumbers();
  });

  elementTypeTaskEditor.appendChild(fragment);
  const inserted = elementTypeTaskEditor.lastElementChild;
  refreshModeAChoices(inserted, task);
  refreshModeATaskNumbers();
}

function readModeATaskCard(card) {
  const elementRefs = [];
  const correctElementRefs = [];
  card.querySelectorAll(".mode-a-element-row").forEach(row => {
    const id = row.dataset.elementId;
    if (row.querySelector(".mode-a-element-provided")?.checked) elementRefs.push(id);
    if (row.querySelector(".mode-a-element-correct")?.checked) correctElementRefs.push(id);
  });

  const typeRefs = [...card.querySelectorAll(".mode-a-type-provided:checked")].map(input => input.value);

  return {
    id: card.dataset.taskId || createId(),
    workRef: card.querySelector(".mode-a-work-select").value,
    prompt: card.querySelector(".mode-a-prompt").value.trim(),
    elementRefs,
    correctElementRefs,
    typeRefs,
    correctTypeRef: card.querySelector(".mode-a-reference-type").value,
    minElements: Math.max(1, Number(card.querySelector(".mode-a-min-elements").value) || 1)
  };
}

function readModeATasks() {
  return [...elementTypeTaskEditor.querySelectorAll(".element-type-task-card")].map(readModeATaskCard);
}

function refreshModeATaskNumbers() {
  [...elementTypeTaskEditor.querySelectorAll(".element-type-task-card")].forEach((card, index) => {
    card.querySelector(".mode-a-task-index").textContent = `分類任務 ${String(index + 1).padStart(2, "0")}`;
  });
}

function refreshModeALibraryReferences() {
  const snapshots = readModeATasks();
  elementTypeTaskEditor.innerHTML = "";
  snapshots.forEach(addModeATask);
}

// ---------- V1.8 逐層揭露 ----------
function renderProgressiveWorkPreview() {
  const workId = progressiveTaskEditor.querySelector(".progressive-work-select")?.value;
  const work = getWorkMap().get(workId);
  const preview = progressiveTaskEditor.querySelector(".progressive-work-preview");
  if (!preview) return;
  if (!work) {
    preview.innerHTML = '<div class="mode-a-missing-data">請先選擇一份有逐步資訊的材料。</div>';
    return;
  }
  preview.innerHTML = `
    <div class="mode-a-preview-image ${work.image ? "" : "placeholder"}">${work.image ? `<img src="${escapeHtml(work.image)}" alt="">` : "🪄"}</div>
    <div><span class="section-kicker">引用材料</span><h4>${escapeHtml(work.name || "未命名材料")}</h4><p>${escapeHtml(work.intro || "尚未設定材料介紹。")}</p></div>
  `;
}

function renderProgressiveClues(task) {
  const work = getWorkMap().get(task.workRef);
  const grid = progressiveTaskEditor.querySelector(".progressive-clue-grid");
  if (!grid) return;
  grid.innerHTML = "";
  if (!work?.clues?.length) {
    grid.innerHTML = '<div class="mode-a-missing-data">這份材料還沒有逐步資訊，請先到材料庫新增。</div>';
    return;
  }
  const selected = new Set(task.clueRefs || []);
  work.clues.forEach((clue,index) => {
    const label = document.createElement("label");
    label.className = "progressive-clue-option";
    label.innerHTML = `<input type="checkbox" value="${escapeHtml(clue.id)}" ${selected.has(clue.id) ? "checked" : ""}><span class="clue-order">${index+1}</span><span>${escapeHtml(clue.text)}</span>`;
    grid.appendChild(label);
  });
}

function renderProgressiveTypes(task) {
  const grid = progressiveTaskEditor.querySelector(".progressive-type-grid");
  const reference = progressiveTaskEditor.querySelector(".progressive-reference-type");
  if (!grid || !reference) return;
  const selected = new Set(task.typeRefs || []);
  const types = getTypeLibrary();
  grid.innerHTML = "";
  reference.innerHTML = '<option value="">— 不設定唯一參考分類 —</option>';
  types.forEach(type => {
    const label = document.createElement("label");
    label.className = "mode-a-type-option";
    label.innerHTML = `<input class="progressive-type-provided" type="checkbox" value="${escapeHtml(type.id)}" ${selected.has(type.id)?"checked":""}><span class="mode-a-type-icon">${escapeHtml(type.icon||"◼")}</span><span><strong>${escapeHtml(type.name)}</strong><small>${escapeHtml(type.description||"")}</small></span>`;
    grid.appendChild(label);
    const option = document.createElement("option");
    option.value = type.id;
    option.textContent = `${type.icon||"◼"} ${type.name}`;
    option.selected = task.referenceTypeRef === type.id;
    reference.appendChild(option);
  });
}

function addProgressiveTask(taskData = null) {
  const task = taskData || newProgressiveTask();
  progressiveTaskEditor.innerHTML = "";
  openClassificationTaskEditor.innerHTML = "";
  const fragment = progressiveTaskTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".progressive-task-card");
  const workSelect = card.querySelector(".progressive-work-select");
  populateWorkSelect(workSelect, task.workRef || "");
  card.querySelector(".progressive-prompt").value = task.prompt || "";
  progressiveTaskEditor.appendChild(fragment);

  workSelect.addEventListener("change", () => {
    const work = getWorkMap().get(workSelect.value);
    const current = readProgressiveTask();
    current.workRef = workSelect.value;
    current.clueRefs = (work?.clues || []).map(clue => clue.id);
    renderProgressiveWorkPreview();
    renderProgressiveClues(current);
  });
  progressiveTaskEditor.querySelector(".progressive-select-all-types").addEventListener("click", () => {
    progressiveTaskEditor.querySelectorAll(".progressive-type-provided").forEach(input => input.checked = true);
  });
  renderProgressiveWorkPreview();
  renderProgressiveClues(task);
  renderProgressiveTypes(task);
}

function readProgressiveTask() {
  const card = progressiveTaskEditor.querySelector(".progressive-task-card");
  if (!card) return null;
  return {
    workRef: card.querySelector(".progressive-work-select").value,
    prompt: card.querySelector(".progressive-prompt").value.trim(),
    clueRefs: [...card.querySelectorAll(".progressive-clue-option input:checked")].map(input => input.value),
    typeRefs: [...card.querySelectorAll(".progressive-type-provided:checked")].map(input => input.value),
    referenceTypeRef: card.querySelector(".progressive-reference-type").value
  };
}

function refreshProgressiveLibraryReferences() {
  if (!progressiveTaskEditor.children.length) return;
  const snapshot = readProgressiveTask();
  addProgressiveTask(snapshot);
}


// ---------- V1.9 開放分類 ----------
function renderOpenClassificationWorkPreview() {
  const card = openClassificationTaskEditor.querySelector(".open-classification-task-card");
  if (!card) return;
  const work = getWorkMap().get(card.querySelector(".open-classification-work-select").value);
  const preview = card.querySelector(".open-classification-work-preview");
  if (!work) {
    preview.innerHTML = '<div class="mode-a-missing-data">請先選擇材料。</div>';
    return;
  }
  preview.innerHTML = `
    ${work.image ? `<div class="mode-a-preview-image"><img src="${escapeHtml(work.image)}" alt=""></div>` : `<div class="mode-a-preview-image placeholder">🎬</div>`}
    <div><span class="section-kicker">引用材料</span><h4>${escapeHtml(work.name||"未命名材料")}</h4><p>${escapeHtml(work.intro||"尚未設定學生版材料介紹。")}</p></div>
  `;
}

function renderOpenClassificationElements(task) {
  const card = openClassificationTaskEditor.querySelector(".open-classification-task-card");
  const grid = card?.querySelector(".open-classification-element-grid");
  if (!grid) return;
  const selected = new Set(task.elementRefs || []);
  const elements = getAllLibraryElements();
  grid.innerHTML = "";
  if (!elements.length) {
    grid.innerHTML = '<div class="mode-a-missing-data">分類工具箱目前沒有可使用的判斷依據。</div>';
    return;
  }
  elements.forEach(element => {
    const row = document.createElement("label");
    row.className = "open-editor-evidence-row";
    row.innerHTML = `
      <input class="open-classification-element-provided" type="checkbox" value="${escapeHtml(element.id)}" ${selected.has(element.id)?"checked":""}>
      <span><strong>${escapeHtml(element.name)}</strong><small>${escapeHtml(element.typeIcon)} ${escapeHtml(element.typeName)}</small></span>
    `;
    grid.appendChild(row);
  });
}

function renderOpenClassificationTypes(task) {
  const card = openClassificationTaskEditor.querySelector(".open-classification-task-card");
  const grid = card?.querySelector(".open-classification-type-grid");
  if (!grid) return;
  const selected = new Set(task.typeRefs || []);
  grid.innerHTML = "";
  getTypeLibrary().forEach(type => {
    const label = document.createElement("label");
    label.className = "mode-a-type-option";
    label.innerHTML = `
      <input class="open-classification-type-provided" type="checkbox" value="${escapeHtml(type.id)}" ${selected.has(type.id)?"checked":""}>
      <span class="mode-a-type-icon">${escapeHtml(type.icon||"◼")}</span>
      <span><strong>${escapeHtml(type.name)}</strong><small>${escapeHtml(type.description||"")}</small></span>
    `;
    grid.appendChild(label);
  });
}

function addOpenClassificationTask(taskData = null) {
  const task = taskData || newOpenClassificationTask();
  openClassificationTaskEditor.innerHTML = "";
  const fragment = openClassificationTaskTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".open-classification-task-card");
  const workSelect = card.querySelector(".open-classification-work-select");
  populateWorkSelect(workSelect, task.workRef || "");
  card.querySelector(".open-classification-min-evidence").value = Math.max(1, Number(task.minEvidence)||2);
  card.querySelector(".open-classification-prompt").value = task.prompt || "";
  card.querySelector(".open-classification-discussion-prompt").value = task.discussionPrompt || "";
  card.querySelector(".open-classification-allow-rejudge").checked = task.allowRejudge !== false;
  openClassificationTaskEditor.appendChild(fragment);

  workSelect.addEventListener("change", () => {
    const work = getWorkMap().get(workSelect.value);
    const current = readOpenClassificationTask();
    current.workRef = workSelect.value;
    const valid = new Set(getAllLibraryElements().map(element => element.id));
    current.elementRefs = (work?.elementRefs || []).filter(id => valid.has(id));
    renderOpenClassificationWorkPreview();
    renderOpenClassificationElements(current);
  });
  card.querySelector(".open-classification-select-all-elements").addEventListener("click", () => {
    card.querySelectorAll(".open-classification-element-provided").forEach(input => input.checked = true);
  });
  card.querySelector(".open-classification-select-all-types").addEventListener("click", () => {
    card.querySelectorAll(".open-classification-type-provided").forEach(input => input.checked = true);
  });

  renderOpenClassificationWorkPreview();
  renderOpenClassificationElements(task);
  renderOpenClassificationTypes(task);
}

function readOpenClassificationTask() {
  const card = openClassificationTaskEditor.querySelector(".open-classification-task-card");
  if (!card) return null;
  return {
    workRef:card.querySelector(".open-classification-work-select").value,
    prompt:card.querySelector(".open-classification-prompt").value.trim(),
    elementRefs:[...card.querySelectorAll(".open-classification-element-provided:checked")].map(input=>input.value),
    typeRefs:[...card.querySelectorAll(".open-classification-type-provided:checked")].map(input=>input.value),
    minEvidence:Math.max(1,Number(card.querySelector(".open-classification-min-evidence").value)||2),
    discussionPrompt:card.querySelector(".open-classification-discussion-prompt").value.trim(),
    allowRejudge:card.querySelector(".open-classification-allow-rejudge").checked
  };
}

function refreshOpenClassificationLibraryReferences() {
  if (!openClassificationTaskEditor.children.length) return;
  const snapshot = readOpenClassificationTask();
  addOpenClassificationTask(snapshot);
}


// ---------- 逐層思辨 ----------
const DELIBERATION_MIN_LAYERS = 2;
const DELIBERATION_MAX_LAYERS = 20;

function getDeliberationLayerCount() {
  return deliberationLayersEditor?.querySelectorAll(".deliberation-layer-card").length || 0;
}

function syncDeliberationLayerCountControls() {
  const count=getDeliberationLayerCount();
  if (deliberationLayerCount) deliberationLayerCount.value=String(count);
  if (decreaseDeliberationLayerBtn) decreaseDeliberationLayerBtn.disabled=count<=DELIBERATION_MIN_LAYERS;
  if (increaseDeliberationLayerBtn) increaseDeliberationLayerBtn.disabled=count>=DELIBERATION_MAX_LAYERS;
  const addButton=el("addDeliberationLayerBtn");
  if (addButton) addButton.disabled=count>=DELIBERATION_MAX_LAYERS;
  deliberationLayersEditor?.querySelectorAll(".deliberation-remove-layer").forEach(button=>{
    button.disabled=count<=DELIBERATION_MIN_LAYERS;
  });
}

function setDeliberationLayerCount(value,{confirmTrim=true}={}) {
  const current=getDeliberationLayerCount();
  const requested=Math.round(Number(value));
  const target=Math.max(
    DELIBERATION_MIN_LAYERS,
    Math.min(DELIBERATION_MAX_LAYERS, Number.isFinite(requested) ? requested : current || DELIBERATION_MIN_LAYERS)
  );

  if (target===current) {
    syncDeliberationLayerCountControls();
    return true;
  }

  if (target<current) {
    const removeCount=current-target;
    if (confirmTrim && !confirm(`將刪除最後 ${removeCount} 層情境及其中內容，確定要調整為 ${target} 層嗎？`)) {
      syncDeliberationLayerCountControls();
      return false;
    }
    const cards=[...deliberationLayersEditor.querySelectorAll(".deliberation-layer-card")];
    cards.slice(target).forEach(card=>card.remove());
  } else {
    for (let i=current;i<target;i++) addDeliberationLayer(null,{skipSync:true});
  }

  refreshDeliberationLayerNumbers();
  syncDeliberationLayerCountControls();
  return true;
}

function addDeliberationLayer(layer = null,{skipSync=false}={}) {
  const current=getDeliberationLayerCount();
  if (current>=DELIBERATION_MAX_LAYERS) {
    if (!skipSync) showToast(`逐層思辨最多 ${DELIBERATION_MAX_LAYERS} 層`);
    syncDeliberationLayerCountControls();
    return null;
  }
  const data = layer || {id:createId(),title:`第 ${current + 1} 層`,content:"",question:"",teacherNote:""};
  const card=document.createElement("article");
  card.className="case-card deliberation-layer-card";
  card.dataset.layerId=data.id || createId();
  card.innerHTML=`
    <div class="case-card-header">
      <div><span class="case-index">情境層</span><h3>${escapeHtml(data.title || "未命名層次")}</h3></div>
      <button type="button" class="icon-btn deliberation-remove-layer" aria-label="刪除此層">×</button>
    </div>
    <div class="form-grid two-col">
      <label class="field"><span>層次標題</span><input class="deliberation-layer-title" type="text" value="${escapeHtml(data.title || "")}" /></label>
      <label class="field"><span>核心提問</span><textarea class="deliberation-layer-question" rows="3">${escapeHtml(data.question || "")}</textarea></label>
    </div>
    <label class="field"><span>本層新增資訊</span><textarea class="deliberation-layer-content" rows="4">${escapeHtml(data.content || "")}</textarea></label>
    <label class="field"><span>教師備註 <span class="optional-tag">不送學生端</span></span><textarea class="deliberation-layer-note" rows="3">${escapeHtml(data.teacherNote || "")}</textarea></label>`;
  card.querySelector(".deliberation-layer-title").addEventListener("input",()=>{
    card.querySelector("h3").textContent=card.querySelector(".deliberation-layer-title").value.trim() || "未命名層次";
  });
  card.querySelector(".deliberation-remove-layer").addEventListener("click",()=>{
    if (getDeliberationLayerCount() <= DELIBERATION_MIN_LAYERS) {
      showToast(`逐層思辨至少保留 ${DELIBERATION_MIN_LAYERS} 層`);
      return;
    }
    if (!confirm("確定要刪除這一層情境及其中內容嗎？")) return;
    card.remove();
    refreshDeliberationLayerNumbers();
    syncDeliberationLayerCountControls();
  });
  deliberationLayersEditor.appendChild(card);
  refreshDeliberationLayerNumbers();
  if (!skipSync) syncDeliberationLayerCountControls();
  return card;
}

function refreshDeliberationLayerNumbers() {
  [...deliberationLayersEditor.querySelectorAll(".deliberation-layer-card")].forEach((card,index)=>{
    card.querySelector(".case-index").textContent=`情境層 ${String(index+1).padStart(2,"0")}`;
  });
}

function loadDeliberationEditor(data = null) {
  const d=data || newDeliberationActivityData();
  deliberationSourceNote.value=d.sourceNote || "";
  deliberationFixedQuestion.value=d.fixedQuestion || "";
  if (deliberationOptionsEditor) {
    deliberationOptionsEditor.innerHTML="";
    normalizeDeliberationOptionsData(d.options).forEach(addDeliberationOption);
    refreshDeliberationOptionRows();
  }
  deliberationChartType.value=["bar","pie"].includes(d.chartType) ? d.chartType : "bar";
  if (deliberationReasonMode) deliberationReasonMode.value=d.reasonMode === "choices" ? "choices" : "text";
  if (deliberationReasonChoicesEditor) {
    deliberationReasonChoicesEditor.innerHTML="";
    normalizeDeliberationReasonChoicesData(d.reasonChoices).forEach(addDeliberationReasonChoice);
  }
  updateDeliberationReasonModeUi({ensureChoice:d.reasonMode === "choices"});
  deliberationReasonRequired.checked=d.reasonRequired !== false;
  deliberationNeedRequired.checked=Boolean(d.needToKnowRequired);
  deliberationReflectionKey.value=d.reflection?.key || "";
  deliberationReflectionValue.value=d.reflection?.value || "";
  deliberationReflectionAction.value=d.reflection?.action || "";
  deliberationReflectionExtension.value=d.reflection?.extension || "";
  deliberationLayersEditor.innerHTML="";
  const sourceLayers=(d.layers?.length ? d.layers : defaultDeliberationLayers()).slice(0,DELIBERATION_MAX_LAYERS);
  sourceLayers.forEach(layer=>addDeliberationLayer(layer,{skipSync:true}));
  while (getDeliberationLayerCount()<DELIBERATION_MIN_LAYERS) addDeliberationLayer(null,{skipSync:true});
  refreshDeliberationLayerNumbers();
  syncDeliberationLayerCountControls();
}

function readDeliberationEditor() {
  return {
    sourceNote:deliberationSourceNote.value.trim(),
    fixedQuestion:deliberationFixedQuestion.value.trim(),
    options:readDeliberationOptionsEditor(),
    chartType:deliberationChartType.value === "pie" ? "pie" : "bar",
    reasonMode:deliberationReasonMode?.value === "choices" ? "choices" : "text",
    reasonChoices:readDeliberationReasonChoicesEditor(),
    reasonRequired:Boolean(deliberationReasonRequired.checked),
    needToKnowRequired:Boolean(deliberationNeedRequired.checked),
    layers:[...deliberationLayersEditor.querySelectorAll(".deliberation-layer-card")].map((card,index)=>({
      id:card.dataset.layerId || `layer-${index+1}`,
      title:card.querySelector(".deliberation-layer-title").value.trim(),
      content:card.querySelector(".deliberation-layer-content").value.trim(),
      question:card.querySelector(".deliberation-layer-question").value.trim(),
      teacherNote:card.querySelector(".deliberation-layer-note").value.trim()
    })),
    reflection:{
      key:deliberationReflectionKey.value.trim(), value:deliberationReflectionValue.value.trim(),
      action:deliberationReflectionAction.value.trim(), extension:deliberationReflectionExtension.value.trim()
    }
  };
}

function refreshRankingItemRows() {
  const rows=[...(rankingItemsEditor?.querySelectorAll(".ranking-editor-row") || [])];
  rows.forEach((row,index)=>{
    const label=row.querySelector(".ranking-editor-order");
    if (label) label.textContent=`${index+1}`;
    const remove=row.querySelector(".ranking-editor-remove");
    if (remove) remove.disabled=rows.length<=2;
  });
  if (addRankingItemBtn) addRankingItemBtn.disabled=rows.length>=10;
}

function addRankingEditorItem(item=null) {
  if (!rankingItemsEditor) return;
  const count=rankingItemsEditor.querySelectorAll(".ranking-editor-row").length;
  if (count>=10) { showToast("排序題最多 10 個項目"); return; }
  const row=document.createElement("div");
  row.className="ranking-editor-row";
  row.dataset.itemId=String(item?.id || createId());
  row.innerHTML=`<span class="ranking-editor-order">${count+1}</span><input class="ranking-editor-label" type="text" maxlength="100" placeholder="輸入排序項目" value="${escapeHtml(String(item?.label || ""))}"><button class="btn btn-danger-soft ranking-editor-remove" type="button">移除</button>`;
  row.querySelector(".ranking-editor-remove").addEventListener("click",()=>{
    if (rankingItemsEditor.querySelectorAll(".ranking-editor-row").length<=2) { showToast("排序題至少需要 2 個項目"); return; }
    row.remove();refreshRankingItemRows();
  });
  rankingItemsEditor.appendChild(row);
  refreshRankingItemRows();
}

function loadScaleEditor(data) {
  const value=normalizeScaleData(data);
  scaleQuestion.value=value.question;
  scalePointCount.value=String(value.pointCount);
  scaleLeftLabel.value=value.leftLabel;
  scaleRightLabel.value=value.rightLabel;
}
function readScaleEditor() {
  return normalizeScaleData({question:scaleQuestion.value.trim(),pointCount:scalePointCount.value,leftLabel:scaleLeftLabel.value.trim(),rightLabel:scaleRightLabel.value.trim()});
}
function loadRankingEditor(data) {
  const value=normalizeRankingData(data);
  rankingQuestion.value=value.question;
  rankingItemsEditor.innerHTML="";
  value.items.forEach(addRankingEditorItem);
}
function readRankingEditor() {
  return normalizeRankingData({
    question:rankingQuestion.value.trim(),
    items:[...rankingItemsEditor.querySelectorAll(".ranking-editor-row")].map(row=>({id:row.dataset.itemId,label:row.querySelector(".ranking-editor-label").value.trim()}))
  });
}
function loadOpenTextEditor(data) {
  const value=normalizeOpenTextData(data);
  openTextQuestion.value=value.question;
  openTextPlaceholder.value=value.placeholder;
  openTextMaxLength.value=String(value.maxLength);
}
function readOpenTextEditor() {
  return normalizeOpenTextData({question:openTextQuestion.value.trim(),placeholder:openTextPlaceholder.value.trim(),maxLength:openTextMaxLength.value});
}

// ---------- 模式切換 ----------
function getSelectedMode() {
  return modeInputs.find(input => input.checked)?.value || "drag-reveal";
}

function setSelectedMode(mode) {
  const normalized = ActivityModules?.normalizeMode?.(mode) || "drag-reveal";
  modeInputs.forEach(input => {
    input.checked = input.value === normalized;
  });
  applyModeUI(normalized);
  ensureEditorForMode(normalized);
}

function applyModeUI(mode) {
  const definition = ActivityModules?.get?.(mode);
  const isOpen = mode === "open-tags";
  const editorKind = definition?.editorKind || "standard";
  const isSpecial = editorKind !== "standard";

  ActivityModules?.list?.().forEach(item => {
    if (item.editorClass) editorPanel?.classList.toggle(item.editorClass, item.id === mode);
  });

  if (templateKicker) templateKicker.textContent = definition?.templateKicker || "模板 01";
  if (templateTitle) templateTitle.textContent = definition?.templateTitle || definition?.label || "選擇與揭示";

  standardTaskToolbar?.classList.toggle("hidden", isSpecial);
  caseEditor?.classList.toggle("hidden", isSpecial);
  elementTypeEditorSection?.classList.toggle("hidden", editorKind !== "element-type");
  progressiveEditorSection?.classList.toggle("hidden", editorKind !== "progressive-reveal");
  openClassificationEditorSection?.classList.toggle("hidden", editorKind !== "open-classification");
  deliberationEditorSection?.classList.toggle("hidden", editorKind !== "layered-deliberation");
  scaleEditorSection?.classList.toggle("hidden", editorKind !== "scale-spectrum");
  rankingEditorSection?.classList.toggle("hidden", editorKind !== "ranking");
  openTextEditorSection?.classList.toggle("hidden", editorKind !== "open-text");

  document.querySelectorAll(".card-builder-label").forEach(label => {
    label.textContent = isOpen ? "標籤設定" : "字卡設定";
  });
  document.querySelectorAll(".card-builder-help").forEach(help => {
    help.textContent = isOpen
      ? "輸入可供學生複選的特徵、依據或標籤；此模式沒有唯一答案。按 Enter 可快速新增下一張。"
      : "輸入學生可選擇的項目後，直接勾選「正確」即可設定答案；按 Enter 可快速新增下一張。";
  });
  document.querySelectorAll(".reveal-settings").forEach(section => section.classList.toggle("hidden", isOpen));
  document.querySelectorAll(".discussion-settings").forEach(section => section.classList.toggle("hidden", !isOpen));
  document.querySelectorAll(".correct-toggle").forEach(toggle => toggle.classList.toggle("hidden", isOpen));
}

function refreshCaseNumbers() {
  [...caseEditor.querySelectorAll(".case-card")].forEach((card, index) => {
    card.querySelector(".case-index").textContent = `任務 ${String(index + 1).padStart(2, "0")}`;
  });
}

function ensureEditorForMode(mode) {
  const handled = ActivityModules?.invoke?.("editor", mode, "ensure");
  if (handled !== undefined) return;
  if (!caseEditor.children.length) addCase();
}

function loadIntoEditor(activity) {
  activityTitle.value = activity.title || "";
  activitySubtitle.value = activity.subtitle || "";

  caseEditor.innerHTML = "";
  elementTypeTaskEditor.innerHTML = "";
  progressiveTaskEditor.innerHTML = "";
  openClassificationTaskEditor.innerHTML = "";
  deliberationLayersEditor.innerHTML = "";
  if (rankingItemsEditor) rankingItemsEditor.innerHTML = "";
  if (scaleQuestion) loadScaleEditor(newScaleActivityData());
  if (openTextQuestion) loadOpenTextEditor(newOpenTextActivityData());

  const template = ActivityModules?.normalizeMode?.(activity.template) || "drag-reveal";
  const handled = ActivityModules?.invoke?.("editor", template, "load", activity);
  if (handled === undefined) {
    const cases = activity.cases?.length ? activity.cases : newBlankActivity().cases;
    cases.forEach(addCase);
  }

  setSelectedMode(template);
}

function readEditor() {
  const template = getSelectedMode();
  const base = {
    id: currentId || createId(),
    title: activityTitle.value.trim() || "未命名活動",
    subtitle: activitySubtitle.value.trim(),
    template,
    cases: [],
    tasks: [],
    progressive: null,
    openClassification: null,
    deliberation: null,
    scale: null,
    ranking: null,
    openText: null
  };
  const patch = ActivityModules?.invoke?.("editor", template, "read") || {};
  return {...base, ...patch, template};
}

function splitKeywords(value) {
  return value.split(/[、,，]/).map(v => v.trim()).filter(Boolean);
}

function validateScaleActivity(activity) {
  const data=normalizeScaleData(activity.scale);
  if (!data.question.trim()) return "量表／立場光譜尚未填寫題目";
  if (data.pointCount<3 || data.pointCount>10) return "量表刻度數需介於 3～10";
  if (!data.leftLabel.trim() || !data.rightLabel.trim()) return "量表左右端標籤都需要填寫";
  return "";
}
function validateRankingActivity(activity) {
  const data=normalizeRankingData(activity.ranking);
  if (!data.question.trim()) return "排序題尚未填寫題目";
  if (data.items.length<2) return "排序題至少需要 2 個項目";
  if (data.items.some(item=>!item.label.trim())) return "每個排序項目都需要填寫內容";
  if (new Set(data.items.map(item=>item.label)).size!==data.items.length) return "排序項目不可重複";
  return "";
}
function validateOpenTextActivity(activity) {
  const data=normalizeOpenTextData(activity.openText);
  if (!data.question.trim()) return "開放文字尚未填寫提問";
  return "";
}

function validateDeliberationActivity(activity) {
  const d=activity.deliberation;
  if (!d?.fixedQuestion?.trim()) return "逐層思辨尚未設定固定判斷題";
  if (!Array.isArray(d.options) || d.options.length < 2) return "逐層思辨至少需要 2 個判斷選項";
  if (d.options.length > 10) return "逐層思辨最多只能設定 10 個判斷選項";
  if (d.options.some(option=>!String(option.label || "").trim())) return "逐層思辨的每個判斷選項都需要填寫內容";
  if (new Set(d.options.map(option=>String(option.id || ""))).size !== d.options.length) return "逐層思辨的選項代碼不可重複";
  if (d.reasonMode === "choices") {
    if (!Array.isArray(d.reasonChoices) || d.reasonChoices.length < 1) return "勾選理由模式至少需要 1 個預設理由";
    if (d.reasonChoices.length > 12) return "預設理由最多只能設定 12 個";
    if (d.reasonChoices.some(choice=>!String(choice.label || "").trim())) return "每個預設理由都需要填寫內容";
    if (new Set(d.reasonChoices.map(choice=>String(choice.id || ""))).size !== d.reasonChoices.length) return "預設理由識別碼不可重複";
  }
  if (!Array.isArray(d.layers) || d.layers.length < DELIBERATION_MIN_LAYERS) return `逐層思辨至少需要 ${DELIBERATION_MIN_LAYERS} 層情境`;
  if (d.layers.length > DELIBERATION_MAX_LAYERS) return `逐層思辨最多只能設定 ${DELIBERATION_MAX_LAYERS} 層情境`;
  for (let i=0;i<d.layers.length;i++) {
    const layer=d.layers[i];
    if (!layer.title?.trim()) return `第 ${i+1} 層尚未填寫標題`;
    if (!layer.content?.trim()) return `第 ${i+1} 層尚未填寫新增資訊`;
    if (!layer.question?.trim()) return `第 ${i+1} 層尚未填寫核心提問`;
  }
  return "";
}

function validateOpenClassificationActivity(activity) {
  const task = activity.openClassification;
  const works = getWorkMap();
  const elements = getLibraryElementMap();
  const types = getTypeMap();
  if (!task?.workRef || !works.has(task.workRef)) return "依據與分類尚未選擇有效材料";
  if (!task.elementRefs?.length) return "依據與分類尚未提供判斷依據";
  if (task.elementRefs.length < task.minEvidence) return "可選判斷依據少於最低選擇數";
  if (task.elementRefs.some(id => !elements.has(id))) return "依據與分類引用了已不存在的判斷依據";
  if (!task.typeRefs?.length) return "依據與分類尚未提供可選分類";
  if (task.typeRefs.some(id => !types.has(id))) return "依據與分類引用了已不存在的分類";
  return "";
}

function validateProgressiveActivity(activity) {
  const task = activity.progressive;
  const works = getWorkMap();
  const types = getTypeMap();
  if (!task?.workRef || !works.has(task.workRef)) return "逐步揭露尚未選擇有效材料";
  if (!task.clueRefs || task.clueRefs.length < 2) return "逐步揭露至少需要 2 項資訊";
  const work = works.get(task.workRef);
  const validClues = new Set((work.clues || []).map(clue => clue.id));
  if (task.clueRefs.some(id => !validClues.has(id))) return "逐步揭露引用了已不存在的資訊";
  if (!task.typeRefs?.length) return "逐步揭露尚未提供可選分類";
  if (task.typeRefs.some(id => !types.has(id))) return "逐步揭露引用了已不存在的分類";
  if (task.referenceTypeRef && !task.typeRefs.includes(task.referenceTypeRef)) return "最終參考分類必須同時提供給學生";
  return "";
}

function validateElementTypeActivity(activity) {
  if (!activity.tasks.length) return "至少需要一個分類任務";
  const works = getWorkMap();
  const elements = getLibraryElementMap();
  const types = getTypeMap();
  for (let i = 0; i < activity.tasks.length; i++) {
    const task = activity.tasks[i];
    if (!task.workRef || !works.has(task.workRef)) return `第 ${i + 1} 個分類任務尚未選擇有效材料`;
    if (!task.elementRefs.length) return `第 ${i + 1} 個分類任務尚未提供可選依據`;
    if (task.elementRefs.length < task.minElements) return `第 ${i + 1} 個分類任務提供的依據少於最低選擇數`;
    if (!task.correctElementRefs.length) return `第 ${i + 1} 個分類任務尚未設定參考依據`;
    if (task.correctElementRefs.some(id => !task.elementRefs.includes(id))) return `第 ${i + 1} 個分類任務的參考依據必須同時提供給學生`;
    if (task.elementRefs.some(id => !elements.has(id))) return `第 ${i + 1} 個分類任務引用了已不存在的依據`;
    if (!task.typeRefs.length) return `第 ${i + 1} 個分類任務尚未提供可選分類`;
    if (!task.correctTypeRef) return `第 ${i + 1} 個分類任務尚未設定參考分類`;
    if (!task.typeRefs.includes(task.correctTypeRef)) return `第 ${i + 1} 個分類任務的參考分類必須同時提供給學生`;
    if (task.typeRefs.some(id => !types.has(id))) return `第 ${i + 1} 個分類任務引用了已不存在的分類`;
  }
  return "";
}

function validateStandardActivity(activity) {
  if (!activity.cases.length) return "至少需要一個關卡";
  const isOpen = activity.template === "open-tags";
  for (let i = 0; i < activity.cases.length; i++) {
    const c = activity.cases[i];
    if (!c.title) return `第 ${i + 1} 關尚未填寫材料／情境名稱`;
    if (!c.cards.length) return `第 ${i + 1} 關尚未填寫${isOpen ? "標籤" : "字卡"}`;
    if (!isOpen) {
      if (!c.correctCards.length) return `第 ${i + 1} 關尚未填寫正確字卡`;
      if (!c.revealTitle) return `第 ${i + 1} 關尚未填寫揭露標題`;
    }
    if (new Set(c.cards).size !== c.cards.length) return `第 ${i + 1} 關有重複的${isOpen ? "標籤" : "字卡"}文字，請讓每個內容保持唯一`;
    if (!isOpen) {
      if (new Set(c.correctCards).size !== c.correctCards.length) return `第 ${i + 1} 關的正確字卡有重複內容`;
      const missing = c.correctCards.filter(x => !c.cards.includes(x));
      if (missing.length) return `第 ${i + 1} 關的正確字卡「${missing[0]}」不在字卡清單裡`;
    }
  }
  return "";
}

function validateActivity(activity) {
  return ActivityModules?.invoke?.("editor", activity.template, "validate", activity) ?? validateStandardActivity(activity);
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

// ---------- 分享快照 ----------
function bytesToBase64Url(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function gzipBytes(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function buildElementTypeSnapshot(activity) {
  const workMap = getWorkMap();
  const elementMap = getLibraryElementMap();
  const typeMap = getTypeMap();

  return activity.tasks.map(task => {
    const work = workMap.get(task.workRef);
    const elementOptions = task.elementRefs.map(id => elementMap.get(id)).filter(Boolean);
    const typeOptions = task.typeRefs.map(id => typeMap.get(id)).filter(Boolean);
    return {
      w: {
        n: work?.name || "未命名材料",
        sh: work?.showName !== false,
        i: work?.intro || "",
        img: work?.image || ""
      },
      p: task.prompt,
      e: elementOptions.map((element, index) => ({
        i: String(index),
        n: element.name
      })),
      ce: task.correctElementRefs.map(id => elementOptions.findIndex(element => element.id === id)).filter(index => index >= 0),
      y: typeOptions.map((type, index) => ({
        i: String(index),
        n: type.name,
        ic: type.icon || "◼",
        c: type.color || "#667085",
        d: type.description || ""
      })),
      cy: typeOptions.findIndex(type => type.id === task.correctTypeRef),
      min: task.minElements
    };
  });
}

function buildProgressiveSnapshot(activity) {
  const task = activity.progressive;
  const work = getWorkMap().get(task.workRef);
  const typeMap = getTypeMap();
  const clueMap = new Map((work?.clues || []).map(clue => [clue.id, clue]));
  const types = task.typeRefs.map(id => typeMap.get(id)).filter(Boolean);
  return {
    w:{n:work?.name||"未命名材料",sh:work?.showName!==false,i:work?.intro||"",img:work?.image||""},
    p:task.prompt||"",
    l:task.clueRefs.map(id=>clueMap.get(id)).filter(Boolean).map((clue,index)=>({i:String(index),t:clue.text})),
    y:types.map((type,index)=>({i:String(index),n:type.name,ic:type.icon||"◼",c:type.color||"#667085",d:type.description||""})),
    ry:types.findIndex(type=>type.id===task.referenceTypeRef)
  };
}


function buildOpenClassificationSnapshot(activity) {
  const task = activity.openClassification;
  const work = getWorkMap().get(task.workRef);
  const elementMap = getLibraryElementMap();
  const typeMap = getTypeMap();
  const elements = task.elementRefs.map(id => elementMap.get(id)).filter(Boolean);
  const types = task.typeRefs.map(id => typeMap.get(id)).filter(Boolean);
  return {
    w:{n:work?.name||"未命名材料",sh:work?.showName!==false,i:work?.intro||"",img:work?.image||""},
    p:task.prompt||"",
    e:elements.map((element,index)=>({i:String(index),n:element.name})),
    y:types.map((type,index)=>({i:String(index),n:type.name,ic:type.icon||"◼",c:type.color||"#667085",d:type.description||""})),
    min:Math.max(1,Number(task.minEvidence)||2),
    q:task.discussionPrompt||"",
    r:task.allowRejudge!==false
  };
}


function buildScaleSnapshot(activity) {
  const d=normalizeScaleData(activity.scale);
  return {q:d.question,n:d.pointCount,l:d.leftLabel,r:d.rightLabel};
}
function buildRankingSnapshot(activity) {
  const d=normalizeRankingData(activity.ranking);
  return {q:d.question,i:d.items.map(item=>({i:item.id,l:item.label}))};
}
function buildOpenTextSnapshot(activity) {
  const d=normalizeOpenTextData(activity.openText);
  return {q:d.question,p:d.placeholder,m:d.maxLength};
}

function buildDeliberationSnapshot(activity,{includeLayers=true,includeTeacherNotes=false}={}) {
  const d=activity.deliberation || newDeliberationActivityData();
  return {
    src:d.sourceNote || "",
    q:d.fixedQuestion || "",
    chart:d.chartType === "pie" ? "pie" : "bar",
    req:{
      reason:d.reasonRequired !== false,
      need:Boolean(d.needToKnowRequired),
      rm:d.reasonMode === "choices" ? "choices" : "text",
      rc:(d.reasonMode === "choices" ? (d.reasonChoices || []) : []).map(choice=>({i:choice.id,l:choice.label}))
    },
    o:(d.options || []).map(option=>({i:option.id,l:option.label})),
    l:includeLayers ? (d.layers || []).map((layer,index)=>({
      i:String(index+1), id:layer.id || `layer-${index+1}`, t:layer.title || `第 ${index+1} 層`,
      c:layer.content || "", q:layer.question || "", ...(includeTeacherNotes ? {n:layer.teacherNote || ""} : {})
    })) : [],
    r:{k:d.reflection?.key || "",v:d.reflection?.value || "",a:d.reflection?.action || "",e:d.reflection?.extension || ""}
  };
}

async function encodeCompactActivity(compact) {
  const rawBytes = new TextEncoder().encode(JSON.stringify(compact));
  if (typeof CompressionStream === "function") {
    try {
      const compressed = await gzipBytes(rawBytes);
      if (compressed.length < rawBytes.length) return `z.${bytesToBase64Url(compressed)}`;
    } catch (error) {
      console.warn("活動資料壓縮失敗，改用未壓縮分享格式。", error);
    }
  }
  return `u.${bytesToBase64Url(rawBytes)}`;
}

async function buildDeliberationShellEncoded(activity) {
  return encodeCompactActivity({t:activity.title,s:activity.subtitle,m:"layered-deliberation",d:buildDeliberationSnapshot(activity,{includeLayers:false})});
}

async function encodeActivity(activity) {
  const compact = ActivityModules?.invoke?.("editor", activity.template, "encode", activity) || {
    t: activity.title,
    s: activity.subtitle,
    m: activity.template,
    c: activity.cases.map(c => {
      const isOpen = activity.template === "open-tags";
      return {
        t: c.title,
        i: c.intro,
        p: c.prompt,
        a: c.cards,
        o: isOpen ? [] : c.correctCards.map(card => c.cards.indexOf(card)),
        r: isOpen ? "" : c.revealTitle,
        k: isOpen ? [] : c.keywords,
        d: isOpen ? "" : c.revealDescription,
        q: isOpen ? c.discussionPrompt : ""
      };
    })
  };
  return encodeCompactActivity(compact);
}

async function buildShareUrl(activity) {
  const encoded = await encodeActivity(activity);
  const path = new URL("play.html", window.location.href);
  path.hash = `data=${encoded}`;
  return path.toString();
}

function getQrRenderSize(urlLength) {
  if (urlLength <= 700) return 400;
  return 640;
}

function getQrQualityLabel(urlLength) {
  if (urlLength <= 700) return "掃描品質：佳";
  return "掃描品質：較密，已自動放大；投影時建議維持完整白邊";
}

function getShareOriginWarning() {
  const protocol = window.location.protocol;
  const host = window.location.hostname;

  if (protocol === "file:") {
    return "目前是直接開啟電腦裡的 HTML 檔案（file://）。手機無法存取這個本機路徑；請先把網站開在 GitHub Pages，再從 GitHub Pages 的教師端產生 QR Code。";
  }

  if (["localhost","127.0.0.1","::1"].includes(host)) {
    return "目前網站使用 localhost。QR Code 裡的 localhost 會指向學生自己的裝置，因此無法跨裝置開啟；正式分享請使用 GitHub Pages 網址。";
  }

  if (host === "github.com" || host === "raw.githubusercontent.com") {
    return "目前不是 GitHub Pages 網址。請從 GitHub Pages（通常是 username.github.io/...）開啟教師端後再產生 QR Code。";
  }

  if (!["http:","https:"].includes(protocol)) {
    return "目前網址無法供其他裝置直接存取；請從 GitHub Pages 或其他 HTTPS 網站開啟教師端後再分享。";
  }

  return "";
}

async function previewOrShare(openPreview = false) {
  const activity = saveCurrent(false);
  const validation = validateActivity(activity);
  if (validation) {
    showToast(validation);
    return;
  }

  const originWarning = getShareOriginWarning();
  let url = "";

  try {
    url = await buildShareUrl(activity);
  } catch (error) {
    console.error("分享網址建立失敗", error);
    if (openPreview) {
      showToast("目前頁面網址無法建立學生預覽連結");
      return;
    }
  }

  if (openPreview) {
    if (!url) {
      showToast("目前頁面網址無法建立學生預覽連結");
      return;
    }
    window.open(url, "_blank", "noopener");
    return;
  }

  el("shareActivityName").textContent = activity.title;
  shareUrlInput.value = url;
  el("openStudentLink").href = url;
  qrcodeEl.innerHTML = "";
  qrNotice.classList.add("hidden");
  qrNotice.textContent = "";

  if (originWarning || !url) {
    qrcodeEl.classList.remove("qr-size-medium","qr-size-large");
    qrcodeEl.innerHTML = "<div class='qr-environment-warning'><span>⚠️</span><strong>目前網址不能跨裝置掃描</strong></div>";
    qrNotice.textContent = originWarning || "目前頁面網址無法建立可分享的學生連結；請從 GitHub Pages 或其他 HTTP/HTTPS 網址開啟教師端。";
    qrNotice.classList.remove("hidden");
  } else if (url.length > QR_SAFE_MAX_LENGTH) {
    qrcodeEl.classList.remove("qr-size-medium","qr-size-large");
    qrcodeEl.innerHTML = "<p class='subtle'>活動內容較多，若直接塞進 QR Code 會過度密集而難以掃描。</p>";
    qrNotice.textContent = `目前分享網址 ${url.length} 字元，已超過 1100 字元的教室掃碼建議上限。學生連結仍可使用；請優先改用課堂 Session QR，或精簡材料介紹／圖片網址。`;
    qrNotice.classList.remove("hidden");
  } else if (window.QRCode) {
    try {
      const qrSize = getQrRenderSize(url.length);
      qrcodeEl.classList.toggle("qr-size-medium", qrSize === 640);
      qrcodeEl.classList.remove("qr-size-large");
      new QRCode(qrcodeEl, {
        text: url,
        width: qrSize,
        height: qrSize,
        correctLevel: QRCode.CorrectLevel.L
      });
      qrNotice.textContent = `${getQrQualityLabel(url.length)} · 分享網址 ${url.length} 字元`;
      qrNotice.classList.remove("hidden");
    } catch (error) {
      console.error("QR Code 產生失敗", error);
      qrcodeEl.innerHTML = "<p class='subtle'>QR Code 產生失敗，請使用下方學生連結。</p>";
      qrNotice.textContent = "可改用複製學生連結或課堂 Session QR。";
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
  return String(text ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[ch]);
}

function createNewActivity() {
  saveCurrent(false);
  const activity = newBlankActivity();
  activities.unshift(activity);
  currentId = activity.id;
  persist();
  renderLibrary();
  loadIntoEditor(activity);
  showToast("已建立新活動");
}


function getActivitySummaries() {
  return activities.map(activity => ({
    id: activity.id,
    title: activity.title || "未命名活動",
    subtitle: activity.subtitle || "",
    template: activity.template || "drag-reveal",
    taskCount: ActivityModules?.libraryTaskCount?.(activity) ?? (activity.cases?.length || 0)
  }));
}

async function buildSessionActivitySnapshot(activityId) {
  if (currentId === activityId) saveCurrent(false);

  const activity = activities.find(item => item.id === activityId);
  if (!activity) throw new Error("找不到指定活動");

  const validation = validateActivity(activity);
  if (validation) throw new Error(validation);

  return {
    id: activity.id,
    title: activity.title || "未命名活動",
    subtitle: activity.subtitle || "",
    template: activity.template || "drag-reveal",
    stageCount: ActivityModules?.stageCount?.(activity) || 1,
    encoded: await encodeActivity(activity),
    shellEncoded: await (ActivityModules?.invoke?.("editor", activity.template, "buildShellEncoded", activity) || ""),
    deliberationData: ActivityModules?.invoke?.("editor", activity.template, "teacherData", activity) || null
  };
}


function registerActivityEditorModules() {
  const register = (mode, hooks) => ActivityModules?.registerHooks?.("editor", mode, hooks);

  ["drag-reveal","open-tags"].forEach(mode => register(mode, {
    ensure:() => {
      if (!caseEditor.children.length) addCase();
      return true;
    },
    load:activity => {
      const cases = activity.cases?.length ? activity.cases : newBlankActivity().cases;
      cases.forEach(addCase);
      return true;
    },
    read:() => ({cases:readCases()}),
    validate:validateStandardActivity
  }));

  register("element-type", {
    ensure:() => {
      if (!elementTypeTaskEditor.children.length) addModeATask();
      return true;
    },
    load:activity => {
      const tasks = activity.tasks?.length ? activity.tasks : [newModeATask()];
      tasks.forEach(addModeATask);
      return true;
    },
    read:() => ({tasks:readModeATasks()}),
    validate:validateElementTypeActivity,
    encode:activity => ({t:activity.title,s:activity.subtitle,m:"element-type",x:buildElementTypeSnapshot(activity)})
  });

  register("progressive-reveal", {
    ensure:() => {
      if (!progressiveTaskEditor.children.length) addProgressiveTask();
      return true;
    },
    load:activity => {
      addProgressiveTask(activity.progressive || newProgressiveTask());
      return true;
    },
    read:() => ({progressive:readProgressiveTask()}),
    validate:validateProgressiveActivity,
    encode:activity => ({t:activity.title,s:activity.subtitle,m:"progressive-reveal",g:buildProgressiveSnapshot(activity)})
  });

  register("open-classification", {
    ensure:() => {
      if (!openClassificationTaskEditor.children.length) addOpenClassificationTask();
      return true;
    },
    load:activity => {
      addOpenClassificationTask(activity.openClassification || newOpenClassificationTask());
      return true;
    },
    read:() => ({openClassification:readOpenClassificationTask()}),
    validate:validateOpenClassificationActivity,
    encode:activity => ({t:activity.title,s:activity.subtitle,m:"open-classification",o:buildOpenClassificationSnapshot(activity)})
  });

  register("scale-spectrum", {
    ensure:() => { loadScaleEditor(readScaleEditor?.() || newScaleActivityData()); return true; },
    load:activity => { loadScaleEditor(activity.scale || newScaleActivityData()); return true; },
    read:() => ({scale:readScaleEditor()}),
    validate:validateScaleActivity,
    encode:activity => ({t:activity.title,s:activity.subtitle,m:"scale-spectrum",sc:buildScaleSnapshot(activity)})
  });

  register("ranking", {
    ensure:() => { if (!rankingItemsEditor.children.length) loadRankingEditor(newRankingActivityData()); return true; },
    load:activity => { loadRankingEditor(activity.ranking || newRankingActivityData()); return true; },
    read:() => ({ranking:readRankingEditor()}),
    validate:validateRankingActivity,
    encode:activity => ({t:activity.title,s:activity.subtitle,m:"ranking",rk:buildRankingSnapshot(activity)})
  });

  register("open-text", {
    ensure:() => { loadOpenTextEditor(readOpenTextEditor?.() || newOpenTextActivityData()); return true; },
    load:activity => { loadOpenTextEditor(activity.openText || newOpenTextActivityData()); return true; },
    read:() => ({openText:readOpenTextEditor()}),
    validate:validateOpenTextActivity,
    encode:activity => ({t:activity.title,s:activity.subtitle,m:"open-text",tx:buildOpenTextSnapshot(activity)})
  });

  register("layered-deliberation", {
    ensure:() => {
      if (!deliberationLayersEditor.children.length) loadDeliberationEditor(newDeliberationActivityData());
      return true;
    },
    load:activity => {
      loadDeliberationEditor(activity.deliberation || newDeliberationActivityData());
      return true;
    },
    read:() => ({deliberation:readDeliberationEditor()}),
    validate:validateDeliberationActivity,
    encode:activity => ({t:activity.title,s:activity.subtitle,m:"layered-deliberation",d:buildDeliberationSnapshot(activity,{includeLayers:true})}),
    buildShellEncoded:buildDeliberationShellEncoded,
    teacherData:activity => buildDeliberationSnapshot(activity,{includeLayers:true,includeTeacherNotes:true})
  });
}

registerActivityEditorModules();

window.ClassroomActivityAPI = {
  list: getActivitySummaries,
  buildSessionSnapshot: buildSessionActivitySnapshot
};

window.ClassroomActivityEditor = {
  saveCurrent:(showMessage=false) => currentId ? saveCurrent(showMessage) : null,
  refreshLibraries:() => {
    refreshModeALibraryReferences();
    refreshProgressiveLibraryReferences();
    refreshOpenClassificationLibraryReferences();
    setTimeout(() => window.dispatchEvent(new Event("resize")), 0);
  },
  get currentId(){ return currentId; }
};

// ---------- 事件 ----------
el("addCaseBtn").addEventListener("click", () => addCase());
el("addElementTypeTaskBtn").addEventListener("click", () => addModeATask());
el("addDeliberationLayerBtn")?.addEventListener("click", () => addDeliberationLayer());
decreaseDeliberationLayerBtn?.addEventListener("click", () => setDeliberationLayerCount(getDeliberationLayerCount()-1));
increaseDeliberationLayerBtn?.addEventListener("click", () => setDeliberationLayerCount(getDeliberationLayerCount()+1,{confirmTrim:false}));
deliberationLayerCount?.addEventListener("change", () => setDeliberationLayerCount(deliberationLayerCount.value));
deliberationLayerCount?.addEventListener("keydown", event => {
  if (event.key === "Enter") {
    event.preventDefault();
    setDeliberationLayerCount(deliberationLayerCount.value);
    deliberationLayerCount.blur();
  }
});
addDeliberationOptionBtn?.addEventListener("click", () => addDeliberationOption());
addDeliberationReasonChoiceBtn?.addEventListener("click", () => addDeliberationReasonChoice());
deliberationReasonMode?.addEventListener("change", () => updateDeliberationReasonModeUi({ensureChoice:true}));
addRankingItemBtn?.addEventListener("click",()=>addRankingEditorItem());
el("saveBtn").addEventListener("click", () => saveCurrent(true));

el("duplicateBtn").addEventListener("click", () => {
  const source = saveCurrent(false);
  const copy = cloneData(source);
  copy.id = createId();
  copy.title = `${source.title}－副本`;
  (copy.tasks || []).forEach(task => task.id = createId());
  activities.unshift(copy);
  currentId = copy.id;
  persist();
  renderLibrary();
  loadIntoEditor(copy);
  showToast("活動已複製");
});

el("deleteBtn").addEventListener("click", () => {
  if (!currentId || !confirm("確定要刪除這個活動嗎？")) return;
  activities = activities.filter(a => a.id !== currentId);
  if (!activities.length) activities = [newBlankActivity()];
  currentId = activities[0].id;
  persist();
  renderLibrary();
  loadIntoEditor(activities[0]);
  showToast("活動已刪除");
});

el("previewBtn").addEventListener("click", () => previewOrShare(true));
el("shareBtn").addEventListener("click", () => previewOrShare(false));
el("startActivitySessionBtn")?.addEventListener("click",async()=>{
  if(!currentId) return;
  saveCurrent(false);
  try {
    await window.ClassroomActivityAPI?.buildSessionSnapshot?.(currentId);
    window.TeacherWorkflow?.openTeachSession?.("activity",currentId);
  } catch (error) {
    showToast(error.message || "這個活動還沒準備好進入 Session");
  }
});

modeInputs.forEach(input => {
  input.addEventListener("change", () => {
    if (!input.checked) return;
    applyModeUI(input.value);
    ensureEditorForMode(input.value);
  });
});

el("copyUrlBtn").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(shareUrlInput.value);
  } catch {
    shareUrlInput.select();
    document.execCommand("copy");
  }
  showToast("連結已複製");
});


// ---------- V1.9.5 教材備份 / 還原 ----------
const BACKUP_KEYS = {
  legacyCourses:"interactive-classroom-v15-courses",
  courses:"interactive-classroom-v2-courses",
  lessons:"interactive-classroom-v2-lessons",
  nodes:"interactive-classroom-v2-nodes",
  types:"interactive-classroom-v15-types",
  works:"interactive-classroom-v15-works",
  activities:"interactive-classroom-v1"
};

function readBackupArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function updateBackupSummary() {
  const sets = {
    backupCourseCount:readBackupArray(BACKUP_KEYS.courses).length,
    backupTypeCount:readBackupArray(BACKUP_KEYS.types).length,
    backupWorkCount:readBackupArray(BACKUP_KEYS.works).length,
    backupActivityCount:readBackupArray(BACKUP_KEYS.activities).length
  };
  Object.entries(sets).forEach(([id,count]) => {
    const node = document.getElementById(id);
    if (node) node.textContent = String(count);
  });
}

function openDataManagement() {
  // Clicking the active workspace tab triggers the first module's silent
  // save hook added below without actually leaving the workspace.
  document.querySelector(".workspace-tab.active")?.dispatchEvent(new CustomEvent("v195-save-current"));
  if (document.querySelector(".workspace-tab.active")?.dataset.view === "activities" && currentId) saveCurrent(false);
  updateBackupSummary();
  window.ClassroomReleaseCenter?.refresh?.();
  document.getElementById("dataManagementDialog")?.showModal();
}

function exportTeachingBackup() {
  document.querySelector(".workspace-tab.active")?.dispatchEvent(new CustomEvent("v195-save-current"));
  if (document.querySelector(".workspace-tab.active")?.dataset.view === "activities" && currentId) saveCurrent(false);

  const payload = {
    schema:"classroom-interactive-backup",
    version:2,
    appVersion:"2.19.0",
    exportedAt:new Date().toISOString(),
    data:{
      courses:readBackupArray(BACKUP_KEYS.courses),
      lessons:readBackupArray(BACKUP_KEYS.lessons),
      nodes:readBackupArray(BACKUP_KEYS.nodes),
      types:readBackupArray(BACKUP_KEYS.types),
      works:readBackupArray(BACKUP_KEYS.works),
      activities:readBackupArray(BACKUP_KEYS.activities)
    }
  };

  const blob = new Blob([JSON.stringify(payload,null,2)], {type:"application/json;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0,10);
  a.href = url;
  a.download = `classroom-interactive-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  const backedUpAt = new Date().toISOString();
  localStorage.setItem(LAST_BACKUP_KEY, backedUpAt);
  window.ClassroomReleaseCenter?.refresh?.();
  showToast("教材備份已下載");
}

async function importTeachingBackup(file) {
  if (!file) return;
  let payload;
  try {
    payload = JSON.parse(await file.text());
  } catch {
    showToast("備份檔不是有效的 JSON");
    return;
  }

  const data = payload?.data;
  const commonValid = payload?.schema === "classroom-interactive-backup"
    && data
    && ["courses","types","works","activities"].every(key => Array.isArray(data[key]));
  const isV2 = commonValid && Array.isArray(data.lessons) && Array.isArray(data.nodes);

  if (!commonValid) {
    showToast("備份格式不正確，無法匯入");
    return;
  }

  if (!confirm("匯入會覆蓋目前的課程、分類、材料與活動資料。確定繼續嗎？")) return;

  localStorage.setItem(BACKUP_KEYS.types, JSON.stringify(data.types));
  localStorage.setItem(BACKUP_KEYS.works, JSON.stringify(data.works));
  localStorage.setItem(BACKUP_KEYS.activities, JSON.stringify(data.activities));

  if (isV2) {
    localStorage.setItem(BACKUP_KEYS.courses, JSON.stringify(data.courses));
    localStorage.setItem(BACKUP_KEYS.lessons, JSON.stringify(data.lessons));
    localStorage.setItem(BACKUP_KEYS.nodes, JSON.stringify(data.nodes));
  } else {
    localStorage.setItem(BACKUP_KEYS.legacyCourses, JSON.stringify(data.courses));
    localStorage.removeItem(BACKUP_KEYS.courses);
    localStorage.removeItem(BACKUP_KEYS.lessons);
    localStorage.removeItem(BACKUP_KEYS.nodes);
  }

  location.reload();
}

document.getElementById("dataManagementBtn")?.addEventListener("click", openDataManagement);
document.getElementById("exportBackupBtn")?.addEventListener("click", exportTeachingBackup);
document.getElementById("importBackupBtn")?.addEventListener("click", () => {
  const input = document.getElementById("backupFileInput");
  if (input) {
    input.value = "";
    input.click();
  }
});
document.getElementById("backupFileInput")?.addEventListener("change", event => {
  importTeachingBackup(event.target.files?.[0]);
});

loadActivities();

