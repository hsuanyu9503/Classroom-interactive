/* V2.12.0 | Activity Editor + layered deliberation + custom choices */
/* ----- Activity Template Editor ----- */
const STORAGE_KEY = "interactive-classroom-v1";
const LAST_BACKUP_KEY = "interactive-classroom-last-backup";
const TYPE_STORAGE_KEY = "interactive-classroom-v15-types";
const WORK_STORAGE_KEY = "interactive-classroom-v15-works";

let activities = [];
let currentId = null;
let toastTimer = null;

const el = (id) => document.getElementById(id);

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
const deliberationReasonRequired = el("deliberationReasonRequired");
const deliberationNeedRequired = el("deliberationNeedRequired");
const deliberationReflectionKey = el("deliberationReflectionKey");
const deliberationReflectionValue = el("deliberationReflectionValue");
const deliberationReflectionAction = el("deliberationReflectionAction");
const deliberationReflectionExtension = el("deliberationReflectionExtension");
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


function defaultDeliberationLayers() {
  return [
    {id:createId(),title:"① 公開影像",content:"顧客到店購買飲料，店員發布的影片中出現顧客可辨識的臉部。",question:"目前能否判斷影片是否適合繼續公開？還需要知道什麼？",teacherNote:""},
    {id:createId(),title:"② 未被告知或同意",content:"顧客表示，當時完全沒有被告知，也沒有同意被拍攝。",question:"到店消費、被鏡頭拍到，是否足以支持公開影像？",teacherNote:""},
    {id:createId(),title:"③ 經朋友轉傳才知道",content:"顧客七月初到店，直到 7 月 24 日朋友轉傳，才知道自己的影像被公開。",question:"沒有立即反對是否代表接受？你是否曾假設顧客早就知道？",teacherNote:""},
    {id:createId(),title:"④ 要求遮臉",content:"顧客先要求將臉打馬賽克，未立即要求刪除整段影片。",question:"你支持這個要求，是因為尊重選擇，還是因為對發布者影響較小？",teacherNote:""},
    {id:createId(),title:"⑤ 保留的理由",content:"店員表示遮臉需要刪除重發；影片累積許多觀看，對自己很重要，因此希望保留，也表示會尊重顧客決定。",question:"修改成本與觀看利益，應在判斷中占多少分量？理解心情是否等於接受要求？",teacherNote:"店員對平台修改限制的說法應標示為其回覆，不當成已驗證的平台規則。"},
    {id:createId(),title:"⑥ 處理結果",content:"顧客明確要求下架。依其敘述，IG 內容撤下後，Threads 影片仍存在，因此再次要求處理。",question:"表示尊重需要哪些行動？你正在評價最初公開，還是事後處理？",teacherNote:""}
  ];
}


function defaultDeliberationOptions() {
  return [
    {id:"A",label:"完全不能接受"},
    {id:"B",label:"不太能接受"},
    {id:"C",label:"大致能接受"},
    {id:"D",label:"完全能接受"},
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
    <span class="deliberation-option-code">${escapeHtml(id)}</span>
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

function newDeliberationActivityData() {
  return {
    sourceNote:"依當事人貼文敘述整理；店員對平台修改限制的說法屬其回覆，不當成已驗證的平台規則。",
    fixedQuestion:"就目前資訊，你認為這段影片繼續公開，有多能被接受？",
    options:defaultDeliberationOptions(),
    chartType:"bar",
    reasonRequired:true,
    needToKnowRequired:false,
    layers:defaultDeliberationLayers(),
    reflection:{
      key:"哪一層最影響你？為什麼？",
      value:"你得知了新事實、修正了假設，還是重新衡量某個價值？",
      action:"如果你是店員，會如何處理並回覆顧客？",
      extension:"如果影片中的你很好看，大家也都稱讚，是否就足以支持公開？「好看」與「適合公開」之間，還需要哪些理由？"
    }
  };
}

const defaultActivity = {
  id: createId(),
  title: "故事鑑定所",
  subtitle: "從作品元素找出故事類型的祕密",
  template: "drag-reveal",
  cases: [
    {
      title: "名偵探柯南",
      intro: "高中生偵探工藤新一因意外變成小學生模樣，化名江戶川柯南，一邊隱藏身分，一邊運用觀察與推理破解各種案件。",
      prompt: "哪些元素最能代表這個故事？",
      cards: ["蒐集線索", "解開謎團", "找出犯人", "使用魔法", "前往異世界"],
      correctCards: ["蒐集線索", "解開謎團", "找出犯人"],
      revealTitle: "推理小說",
      keywords: ["謎團", "線索", "推理", "真相"],
      revealDescription: "故事通常以謎團為核心，角色透過線索與推理逐步找出真相。",
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
    const allowed = new Set(["drag-reveal","open-tags","element-type","progressive-reveal","open-classification","layered-deliberation"]);
    const template = allowed.has(activity.template) ? activity.template : "drag-reveal";

    return {
      ...activity,
      template,
      cases: ["drag-reveal","open-tags"].includes(template)
        ? (Array.isArray(activity.cases) ? activity.cases : [])
        : [],
      tasks: template === "element-type"
        ? (Array.isArray(activity.tasks) ? activity.tasks : [])
        : [],
      progressive: template === "progressive-reveal"
        ? (activity.progressive || null)
        : null,
      openClassification: template === "open-classification"
        ? (activity.openClassification || null)
        : null,
      deliberation: template === "layered-deliberation"
        ? {
            ...newDeliberationActivityData(),
            ...(activity.deliberation || {}),
            options:normalizeDeliberationOptionsData(activity.deliberation?.options)
          }
        : null
    };
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
    deliberation: null
  };
}

function getModeLabel(template) {
  if (template === "open-tags") return "開放式標籤討論";
  if (template === "element-type") return "要素 → 類型分類";
  if (template === "progressive-reveal") return "逐層揭露";
  if (template === "open-classification") return "開放分類";
  if (template === "layered-deliberation") return "逐層思辨";
  return "探索式揭密";
}

function renderLibrary() {
  activityList.innerHTML = "";

  activities.forEach((activity) => {
    const item = document.createElement("div");
    item.className = `activity-item ${activity.id === currentId ? "active" : ""}`;
    const count = activity.template === "element-type"
      ? activity.tasks?.length || 0
      : activity.template === "progressive-reveal"
        ? activity.progressive?.clueRefs?.length || 0
        : activity.template === "open-classification"
          ? 1
          : activity.template === "layered-deliberation"
            ? (activity.deliberation?.layers?.length || 0)
            : activity.cases?.length || 0;
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
  select.innerHTML = '<option value="">— 選擇作品庫中的作品 —</option>';
  works.forEach(work => {
    const option = document.createElement("option");
    option.value = work.id;
    option.textContent = work.name || "未命名作品";
    option.selected = work.id === selectedId;
    select.appendChild(option);
  });
  if (selectedId && !works.some(work => work.id === selectedId)) {
    const missing = document.createElement("option");
    missing.value = selectedId;
    missing.textContent = "⚠ 引用的作品已不存在";
    missing.selected = true;
    select.appendChild(missing);
  }
}

function renderModeAWorkPreview(card) {
  const workId = card.querySelector(".mode-a-work-select").value;
  const work = getWorkMap().get(workId);
  const preview = card.querySelector(".mode-a-work-preview");
  if (!work) {
    preview.innerHTML = '<div class="mode-a-missing-data">請先選擇作品；若作品庫是空的，請先到「作品庫」建立作品。</div>';
    return;
  }
  const image = work.image
    ? `<div class="mode-a-preview-image"><img src="${escapeHtml(work.image)}" alt=""></div>`
    : `<div class="mode-a-preview-image placeholder">🎬</div>`;
  preview.innerHTML = `
    ${image}
    <div>
      <span class="section-kicker">引用作品</span>
      <h4>${escapeHtml(work.name || "未命名作品")}</h4>
      <p>${escapeHtml(work.intro || "尚未設定學生版作品介紹。")}</p>
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
    grid.innerHTML = '<div class="mode-a-missing-data">類型工具箱目前沒有要素，請先建立分類要素。</div>';
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
  reference.innerHTML = '<option value="">— 選擇參考類型 —</option>';

  if (!types.length) {
    grid.innerHTML = '<div class="mode-a-missing-data">類型工具箱目前沒有類型。</div>';
    return;
  }

  types.forEach(type => {
    const label = document.createElement("label");
    label.className = "mode-a-type-option";
    label.innerHTML = `
      <input class="mode-a-type-provided" type="checkbox" value="${escapeHtml(type.id)}" ${provided.has(type.id) ? "checked" : ""}>
      <span class="mode-a-type-icon">${escapeHtml(type.icon || "◼")}</span>
      <span>
        <strong>${escapeHtml(type.name || "未命名類型")}</strong>
        <small>${escapeHtml(type.description || "")}</small>
      </span>
    `;
    grid.appendChild(label);

    const option = document.createElement("option");
    option.value = type.id;
    option.textContent = `${type.icon || "◼"} ${type.name || "未命名類型"}`;
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
    preview.innerHTML = '<div class="mode-a-missing-data">請先選擇一部有逐層線索的作品。</div>';
    return;
  }
  preview.innerHTML = `
    <div class="mode-a-preview-image ${work.image ? "" : "placeholder"}">${work.image ? `<img src="${escapeHtml(work.image)}" alt="">` : "🪄"}</div>
    <div><span class="section-kicker">引用作品</span><h4>${escapeHtml(work.name || "未命名作品")}</h4><p>${escapeHtml(work.intro || "尚未設定作品介紹。")}</p></div>
  `;
}

function renderProgressiveClues(task) {
  const work = getWorkMap().get(task.workRef);
  const grid = progressiveTaskEditor.querySelector(".progressive-clue-grid");
  if (!grid) return;
  grid.innerHTML = "";
  if (!work?.clues?.length) {
    grid.innerHTML = '<div class="mode-a-missing-data">這部作品還沒有逐層線索，請先到作品庫新增。</div>';
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
  reference.innerHTML = '<option value="">— 不設定唯一參考類型 —</option>';
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
    preview.innerHTML = '<div class="mode-a-missing-data">請先選擇作品。</div>';
    return;
  }
  preview.innerHTML = `
    ${work.image ? `<div class="mode-a-preview-image"><img src="${escapeHtml(work.image)}" alt=""></div>` : `<div class="mode-a-preview-image placeholder">🎬</div>`}
    <div><span class="section-kicker">引用作品</span><h4>${escapeHtml(work.name||"未命名作品")}</h4><p>${escapeHtml(work.intro||"尚未設定學生版作品介紹。")}</p></div>
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
    grid.innerHTML = '<div class="mode-a-missing-data">類型工具箱目前沒有可使用的故事要素。</div>';
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

// ---------- 模式切換 ----------
function getSelectedMode() {
  return modeInputs.find(input => input.checked)?.value || "drag-reveal";
}

function setSelectedMode(mode) {
  const allowed = new Set(["drag-reveal", "open-tags", "element-type", "progressive-reveal", "open-classification", "layered-deliberation"]);
  const normalized = allowed.has(mode) ? mode : "drag-reveal";
  modeInputs.forEach(input => {
    input.checked = input.value === normalized;
  });
  applyModeUI(normalized);
  ensureEditorForMode(normalized);
}

function applyModeUI(mode) {
  const isOpen = mode === "open-tags";
  const isElementType = mode === "element-type";
  const isProgressive = mode === "progressive-reveal";
  const isOpenClassification = mode === "open-classification";
  const isDeliberation = mode === "layered-deliberation";

  editorPanel?.classList.toggle("open-tags-mode", isOpen);
  editorPanel?.classList.toggle("element-type-mode", isElementType);
  editorPanel?.classList.toggle("progressive-reveal-mode", isProgressive);
  editorPanel?.classList.toggle("open-classification-mode", isOpenClassification);
  editorPanel?.classList.toggle("layered-deliberation-mode", isDeliberation);

  if (templateKicker) {
    templateKicker.textContent = isDeliberation ? "模板 06" : isOpenClassification ? "模板 05" : isProgressive ? "模板 04" : isElementType ? "模板 03" : isOpen ? "模板 02" : "模板 01";
  }
  if (templateTitle) {
    templateTitle.textContent = isDeliberation
      ? "逐層思辨"
      : isOpenClassification ? "開放分類"
      : isProgressive ? "逐層揭露"
      : isElementType ? "要素 → 類型分類"
      : isOpen ? "開放式標籤討論" : "探索式拖曳揭密";
  }

  const isSpecial = isElementType || isProgressive || isOpenClassification || isDeliberation;
  standardTaskToolbar?.classList.toggle("hidden", isSpecial);
  caseEditor?.classList.toggle("hidden", isSpecial);
  elementTypeEditorSection?.classList.toggle("hidden", !isElementType);
  progressiveEditorSection?.classList.toggle("hidden", !isProgressive);
  openClassificationEditorSection?.classList.toggle("hidden", !isOpenClassification);
  deliberationEditorSection?.classList.toggle("hidden", !isDeliberation);

  document.querySelectorAll(".card-builder-label").forEach(label => {
    label.textContent = isOpen ? "標籤設定" : "字卡設定";
  });
  document.querySelectorAll(".card-builder-help").forEach(help => {
    help.textContent = isOpen
      ? "輸入可供學生複選的標籤或故事要素；此模式沒有標準答案。按 Enter 可快速新增下一張。"
      : "輸入字卡內容後，直接勾選「正確」即可設定答案；按 Enter 可快速新增下一張字卡。";
  });
  document.querySelectorAll(".reveal-settings").forEach(section => {
    section.classList.toggle("hidden", isOpen);
  });
  document.querySelectorAll(".discussion-settings").forEach(section => {
    section.classList.toggle("hidden", !isOpen);
  });
  document.querySelectorAll(".correct-toggle").forEach(toggle => {
    toggle.classList.toggle("hidden", isOpen);
  });

}

function refreshCaseNumbers() {
  [...caseEditor.querySelectorAll(".case-card")].forEach((card, index) => {
    card.querySelector(".case-index").textContent = `任務 ${String(index + 1).padStart(2, "0")}`;
  });
}

function ensureEditorForMode(mode) {
  if (mode === "element-type") {
    if (!elementTypeTaskEditor.children.length) addModeATask();
    return;
  }
  if (mode === "progressive-reveal") {
    if (!progressiveTaskEditor.children.length) addProgressiveTask();
    return;
  }
  if (mode === "open-classification") {
    if (!openClassificationTaskEditor.children.length) addOpenClassificationTask();
    return;
  }
  if (mode === "layered-deliberation") {
    if (!deliberationLayersEditor.children.length) loadDeliberationEditor(newDeliberationActivityData());
    return;
  }
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

  if (activity.template === "element-type") {
    const tasks = activity.tasks?.length ? activity.tasks : [newModeATask()];
    tasks.forEach(addModeATask);
  } else if (activity.template === "progressive-reveal") {
    addProgressiveTask(activity.progressive || newProgressiveTask());
  } else if (activity.template === "open-classification") {
    addOpenClassificationTask(activity.openClassification || newOpenClassificationTask());
  } else if (activity.template === "layered-deliberation") {
    loadDeliberationEditor(activity.deliberation || newDeliberationActivityData());
  } else {
    const cases = activity.cases?.length ? activity.cases : newBlankActivity().cases;
    cases.forEach(addCase);
  }

  setSelectedMode(activity.template || "drag-reveal");
}

function readEditor() {
  const template = getSelectedMode();

  return {
    id: currentId || createId(),
    title: activityTitle.value.trim() || "未命名活動",
    subtitle: activitySubtitle.value.trim(),
    template,
    cases: ["drag-reveal","open-tags"].includes(template) ? readCases() : [],
    tasks: template === "element-type" ? readModeATasks() : [],
    progressive: template === "progressive-reveal" ? readProgressiveTask() : null,
    openClassification: template === "open-classification" ? readOpenClassificationTask() : null,
    deliberation: template === "layered-deliberation" ? readDeliberationEditor() : null
  };
}

function splitKeywords(value) {
  return value.split(/[、,，]/).map(v => v.trim()).filter(Boolean);
}

function validateActivity(activity) {
  if (activity.template === "layered-deliberation") {
    const d=activity.deliberation;
    if (!d?.fixedQuestion?.trim()) return "逐層思辨尚未設定固定判斷題";
    if (!Array.isArray(d.options) || d.options.length < 2) return "逐層思辨至少需要 2 個判斷選項";
    if (d.options.length > 10) return "逐層思辨最多只能設定 10 個判斷選項";
    if (d.options.some(option=>!String(option.label || "").trim())) return "逐層思辨的每個判斷選項都需要填寫內容";
    if (new Set(d.options.map(option=>String(option.id || ""))).size !== d.options.length) return "逐層思辨的選項代碼不可重複";
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

  if (activity.template === "open-classification") {
    const task = activity.openClassification;
    const works = getWorkMap();
    const elements = getLibraryElementMap();
    const types = getTypeMap();
    if (!task?.workRef || !works.has(task.workRef)) return "開放分類尚未選擇有效作品";
    if (!task.elementRefs?.length) return "開放分類尚未提供故事證據";
    if (task.elementRefs.length < task.minEvidence) return "可選故事證據少於最低選擇數";
    if (task.elementRefs.some(id => !elements.has(id))) return "開放分類引用了已不存在的故事要素";
    if (!task.typeRefs?.length) return "開放分類尚未提供可選類型";
    if (task.typeRefs.some(id => !types.has(id))) return "開放分類引用了已不存在的類型";
    return "";
  }

  if (activity.template === "progressive-reveal") {
    const task = activity.progressive;
    const works = getWorkMap();
    const types = getTypeMap();
    if (!task?.workRef || !works.has(task.workRef)) return "逐層揭露尚未選擇有效作品";
    if (!task.clueRefs || task.clueRefs.length < 2) return "逐層揭露至少需要 2 條線索";
    const work = works.get(task.workRef);
    const validClues = new Set((work.clues || []).map(clue => clue.id));
    if (task.clueRefs.some(id => !validClues.has(id))) return "逐層揭露引用了已不存在的線索";
    if (!task.typeRefs?.length) return "逐層揭露尚未提供可選類型";
    if (task.typeRefs.some(id => !types.has(id))) return "逐層揭露引用了已不存在的類型";
    if (task.referenceTypeRef && !task.typeRefs.includes(task.referenceTypeRef)) return "最終參考類型必須同時提供給學生";
    return "";
  }

  if (activity.template === "element-type") {
    if (!activity.tasks.length) return "至少需要一個分類任務";
    const works = getWorkMap();
    const elements = getLibraryElementMap();
    const types = getTypeMap();

    for (let i = 0; i < activity.tasks.length; i++) {
      const task = activity.tasks[i];
      if (!task.workRef || !works.has(task.workRef)) return `第 ${i + 1} 個分類任務尚未選擇有效作品`;
      if (!task.elementRefs.length) return `第 ${i + 1} 個分類任務尚未提供可選要素`;
      if (task.elementRefs.length < task.minElements) return `第 ${i + 1} 個分類任務提供的要素少於最低選擇數`;
      if (!task.correctElementRefs.length) return `第 ${i + 1} 個分類任務尚未設定參考要素`;
      if (task.correctElementRefs.some(id => !task.elementRefs.includes(id))) return `第 ${i + 1} 個分類任務的參考要素必須同時提供給學生`;
      if (task.elementRefs.some(id => !elements.has(id))) return `第 ${i + 1} 個分類任務引用了已不存在的要素`;
      if (!task.typeRefs.length) return `第 ${i + 1} 個分類任務尚未提供可選類型`;
      if (!task.correctTypeRef) return `第 ${i + 1} 個分類任務尚未設定參考類型`;
      if (!task.typeRefs.includes(task.correctTypeRef)) return `第 ${i + 1} 個分類任務的參考類型必須同時提供給學生`;
      if (task.typeRefs.some(id => !types.has(id))) return `第 ${i + 1} 個分類任務引用了已不存在的類型`;
    }
    return "";
  }

  if (!activity.cases.length) return "至少需要一個關卡";

  for (let i = 0; i < activity.cases.length; i++) {
    const c = activity.cases[i];
    if (!c.title) return `第 ${i + 1} 關尚未填寫作品／情境名稱`;
    if (!c.cards.length) return `第 ${i + 1} 關尚未填寫${activity.template === "open-tags" ? "標籤" : "字卡"}`;

    if (activity.template !== "open-tags") {
      if (!c.correctCards.length) return `第 ${i + 1} 關尚未填寫正確字卡`;
      if (!c.revealTitle) return `第 ${i + 1} 關尚未填寫揭露標題`;
    }

    if (new Set(c.cards).size !== c.cards.length) {
      return `第 ${i + 1} 關有重複的${activity.template === "open-tags" ? "標籤" : "字卡"}文字，請讓每個內容保持唯一`;
    }

    if (activity.template !== "open-tags") {
      if (new Set(c.correctCards).size !== c.correctCards.length) return `第 ${i + 1} 關的正確字卡有重複內容`;
      const missing = c.correctCards.filter(x => !c.cards.includes(x));
      if (missing.length) return `第 ${i + 1} 關的正確字卡「${missing[0]}」不在字卡清單裡`;
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
        n: work?.name || "未命名作品",
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
    w:{n:work?.name||"未命名作品",sh:work?.showName!==false,i:work?.intro||"",img:work?.image||""},
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
    w:{n:work?.name||"未命名作品",sh:work?.showName!==false,i:work?.intro||"",img:work?.image||""},
    p:task.prompt||"",
    e:elements.map((element,index)=>({i:String(index),n:element.name})),
    y:types.map((type,index)=>({i:String(index),n:type.name,ic:type.icon||"◼",c:type.color||"#667085",d:type.description||""})),
    min:Math.max(1,Number(task.minEvidence)||2),
    q:task.discussionPrompt||"",
    r:task.allowRejudge!==false
  };
}


function buildDeliberationSnapshot(activity,{includeLayers=true,includeTeacherNotes=false}={}) {
  const d=activity.deliberation || newDeliberationActivityData();
  return {
    src:d.sourceNote || "",
    q:d.fixedQuestion || "",
    chart:d.chartType === "pie" ? "pie" : "bar",
    req:{reason:d.reasonRequired !== false,need:Boolean(d.needToKnowRequired)},
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
  let compact;

  if (activity.template === "element-type") {
    compact = {t:activity.title,s:activity.subtitle,m:"element-type",x:buildElementTypeSnapshot(activity)};
  } else if (activity.template === "progressive-reveal") {
    compact = {t:activity.title,s:activity.subtitle,m:"progressive-reveal",g:buildProgressiveSnapshot(activity)};
  } else if (activity.template === "open-classification") {
    compact = {t:activity.title,s:activity.subtitle,m:"open-classification",o:buildOpenClassificationSnapshot(activity)};
  } else if (activity.template === "layered-deliberation") {
    compact = {t:activity.title,s:activity.subtitle,m:"layered-deliberation",d:buildDeliberationSnapshot(activity,{includeLayers:true})};
  } else {
    compact = {
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
  }

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
    qrNotice.textContent = `目前分享網址 ${url.length} 字元，已超過 1100 字元的教室掃碼建議上限。學生連結仍可使用；請優先改用課堂 Session QR，或精簡作品介紹／圖片網址。`;
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
    taskCount: activity.template === "element-type"
      ? (activity.tasks?.length || 0)
      : activity.template === "progressive-reveal"
        ? (activity.progressive?.clueRefs?.length || 0)
        : activity.template === "open-classification"
          ? 1
          : activity.template === "layered-deliberation"
            ? (activity.deliberation?.layers?.length || 0)
            : (activity.cases?.length || 0)
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
    stageCount: activity.template === "progressive-reveal"
      ? (activity.progressive?.clueRefs?.length || 1)
      : activity.template === "open-classification" && activity.openClassification?.allowRejudge !== false
        ? 2
        : activity.template === "layered-deliberation"
          ? (activity.deliberation?.layers?.length || 1)
          : 1,
    encoded: await encodeActivity(activity),
    shellEncoded: activity.template === "layered-deliberation" ? await buildDeliberationShellEncoded(activity) : "",
    deliberationData: activity.template === "layered-deliberation"
      ? buildDeliberationSnapshot(activity,{includeLayers:true,includeTeacherNotes:true})
      : null
  };
}

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
    appVersion:"2.12.0",
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

  if (!confirm("匯入會覆蓋目前的課程、類型、作品與活動資料。確定繼續嗎？")) return;

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

