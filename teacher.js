/* =========================================================
   Classroom Interactive — Teacher Runtime
   Consolidated in V1.9.2
   Order preserved from previous runtime:
   1) workspace / course / type / work library
   2) activity editor
   3) session manager
   ========================================================= */

/* ----- Workspace, Course, Type & Work Library ----- */
(() => {
  const KEYS = {
    courses: "interactive-classroom-v15-courses",
    types: "interactive-classroom-v15-types",
    works: "interactive-classroom-v15-works",
    activities: "interactive-classroom-v1"
  };

  const $ = (id) => document.getElementById(id);
  const uuid = () => globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const makeElements = (...names) => names.map(name => ({id:uuid(), name}));
  const makeClues = (...texts) => texts.map(text => ({id:uuid(), text}));
  const defaultTypes = [
    {id:uuid(), name:"奇幻", icon:"✨", color:"#7057d9", description:"故事包含現實世界中不存在的規則、力量或生物。", elements:makeElements("非現實世界","魔法","超自然力量","神祕生物")},
    {id:uuid(), name:"偵探", icon:"🔎", color:"#3b82c4", description:"故事以案件或謎題為核心，透過線索與推理逐步找出真相。", elements:makeElements("案件／謎題","線索","觀察分析","推理","找出真相")},
    {id:uuid(), name:"武俠", icon:"⚔️", color:"#b56b35", description:"常以古代江湖為背景，描寫俠客、門派、武功與人物之間的恩怨。", elements:makeElements("古代背景","俠客","門派／師承","武功","恩怨情仇")},
    {id:uuid(), name:"歷史", icon:"🏯", color:"#708456", description:"以真實或可辨識的歷史時代為背景，呈現人物、事件與社會風貌。", elements:makeElements("歷史背景","歷史事件","歷史人物","時代社會風貌")},
    {id:uuid(), name:"冒險", icon:"🧭", color:"#dc8d28", description:"角色為了明確目標踏上旅程，在未知環境中面對危險並克服困難。", elements:makeElements("明確目標","踏上旅程","未知環境","遭遇危險","克服困難")}
  ];

  const defaultWorks = [
    {id:uuid(), name:"葬送的芙莉蓮", image:"", showName:true, intro:"一名長壽的魔法使在昔日冒險結束後，再度踏上旅程，重新理解時間、夥伴與人們留下的記憶。", teacherNote:"可作為多元素作品導入，避免一開始直接給分類答案。", clues:[], elementRefs:[]},
    {id:uuid(), name:"名偵探柯南", image:"", showName:true, intro:"主角經常遇到各種案件，並透過現場線索、人物證詞與推理逐步找出事件真相。", teacherNote:"典型偵探作品，可用於第一節要素辨識。", clues:[], elementRefs:[]},
    {id:uuid(), name:"寶可夢地平線", image:"", showName:true, intro:"年輕主角離開原本熟悉的生活，與夥伴前往不同地區，在旅途中面對未知事件與新的挑戰。", teacherNote:"適合第二節逐層揭露，觀察學生從奇幻轉向冒險的判斷歷程。", clues:makeClues("主角離開原本生活的地方。","主角前往不同地區，認識新的夥伴。","一路遭遇許多未知的困難與危險。","為了完成自己的目標，不斷克服新的挑戰。"), elementRefs:[]},
    {id:uuid(), name:"鬼滅之刃", image:"", showName:true, intro:"主角為了重要的家人踏上旅程，在具有歷史時代感的世界中修行、戰鬥，並遭遇超自然的敵人。", teacherNote:"多類型挑戰；可討論歷史、武俠、奇幻與冒險等元素。", clues:makeClues("日本大正時代背景。","有劍術、師徒與修行。","有鬼與超自然能力。","主角為了妹妹踏上旅程。","一路遭遇敵人與危險。"), elementRefs:[]}
  ];

  const defaultCourse = {
    id: uuid(),
    title: "小說類型大解密",
    subtitle: "從故事要素建立小說分類工具",
    description: "兩節課依序從類型要素的建立，走到典型作品、逐層線索與多類型作品的證據式分類。",
    lessons: [
      {
        id: uuid(), title: "小說類型拆解所",
        nodes: [
          {id:uuid(), type:"showcase", title:"作品有什麼不一樣？", activityRef:"", note:"一次呈現數張動畫／漫畫作品卡，引導學生自由觀察差異。"},
          {id:uuid(), type:"toolbox", title:"五大小說類型工具箱", activityRef:"", note:"依序介紹奇幻、偵探、武俠、歷史、冒險與各自要素。"},
          {id:uuid(), type:"activity", title:"要素辨識練習", activityRef:"", note:"使用「要素 → 類型分類」模式，讓學生先找證據，再完成類型判斷。"},
          {id:uuid(), type:"summary", title:"小說分類三步驟", activityRef:"", note:"看故事 → 找重要要素 → 根據要素判斷類型，並留下下一節伏筆。"}
        ]
      },
      {
        id: uuid(), title: "動畫類型鑑定所",
        nodes: [
          {id:uuid(), type:"activity", title:"字卡快問快答", activityRef:"", note:"用單一要素暖身，帶出不能只靠單一特徵。"},
          {id:uuid(), type:"activity", title:"典型作品分類", activityRef:"", note:"學生先選要素，再選主要類型。"},
          {id:uuid(), type:"activity", title:"逐層公開作品要素", activityRef:"", note:"使用「逐層揭露」模式，由教師同步公開線索並保留每一層的判斷變化。"},
          {id:uuid(), type:"activity", title:"多類型作品挑戰", activityRef:"", note:"引用開放分類模式，比較不同學生的類型與證據。"},
          {id:uuid(), type:"summary", title:"小說分類判斷指南", activityRef:"", note:"以五步驟收束：找要素、對應類型、不看單一要素、找主要特徵、用證據說明。"}
        ]
      }
    ]
  };

  let courses = load(KEYS.courses, [defaultCourse]);
  let types = normalizeTypes(load(KEYS.types, defaultTypes));
  let works = normalizeWorks(load(KEYS.works, defaultWorks));
  save(KEYS.types, types);
  save(KEYS.works, works);
  let currentCourseId = courses[0]?.id || null;
  let currentTypeId = types[0]?.id || null;
  let currentWorkId = works[0]?.id || null;

  function load(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      if (Array.isArray(value) && value.length) return value;
    } catch {}
    localStorage.setItem(key, JSON.stringify(fallback));
    return fallback;
  }
  function save(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

  function normalizeTypes(list) {
    return (list || []).map(type => ({
      ...type,
      elements: (type.elements || []).map(element =>
        typeof element === "string"
          ? {id:uuid(), name:element}
          : {id:element.id || uuid(), name:element.name || ""}
      )
    }));
  }

  function normalizeWorks(list) {
    return (list || []).map(work => ({
      ...work,
      clues: (work.clues || []).map(clue =>
        typeof clue === "string"
          ? {id:uuid(), text:clue}
          : {id:clue.id || uuid(), text:clue.text || ""}
      )
    }));
  }

  function getActivities() {
    try {
      const arr = JSON.parse(localStorage.getItem(KEYS.activities) || "[]");
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  }

  function escapeHtml(text) {
    return String(text ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
  }

  function switchView(view) {
    document.querySelectorAll(".workspace-tab").forEach(btn => btn.classList.toggle("active", btn.dataset.view === view));
    document.querySelectorAll(".workspace-view").forEach(section => section.classList.toggle("active", section.dataset.workspaceView === view));

    if (view === "courses") {
      refreshCourseActivityRefs();
    }

    if (view === "activities") {
      if (typeof refreshModeALibraryReferences === "function") refreshModeALibraryReferences();
      if (typeof refreshProgressiveLibraryReferences === "function") refreshProgressiveLibraryReferences();
      if (typeof refreshOpenClassificationLibraryReferences === "function") refreshOpenClassificationLibraryReferences();
      setTimeout(() => window.dispatchEvent(new Event("resize")), 0);
    }

    if (view === "sessions") {
      window.ClassroomSessionManager?.refresh?.();
    }
  }

  document.querySelectorAll(".workspace-tab").forEach(btn => btn.addEventListener("click", () => switchView(btn.dataset.view)));
  $("newActivityVisibleBtn")?.addEventListener("click", () => {
    if (typeof createNewActivity === "function") {
      createNewActivity();
    }
  });

  // ---------------- Courses ----------------
  function renderCourseList() {
    const list = $("courseList");
    list.innerHTML = "";
    courses.forEach(course => {
      const item = document.createElement("div");
      item.className = `v15-list-item ${course.id === currentCourseId ? "active" : ""}`;
      const nodeCount = (course.lessons || []).reduce((n, l) => n + (l.nodes?.length || 0), 0);
      item.innerHTML = `<strong>${escapeHtml(course.title || "未命名課程")}</strong><small>${course.lessons?.length || 0} 節 · ${nodeCount} 個教學節點</small>`;
      item.addEventListener("click", () => {
        saveCurrentCourse(false);
        currentCourseId = course.id;
        renderCourseList();
        loadCourseEditor(course);
      });
      list.appendChild(item);
    });
  }

  function currentCourse() { return courses.find(c => c.id === currentCourseId); }

  function loadCourseEditor(course) {
    $("courseTitle").value = course?.title || "";
    $("courseSubtitle").value = course?.subtitle || "";
    $("courseDescription").value = course?.description || "";
    $("lessonEditor").innerHTML = "";
    (course?.lessons || []).forEach(addLessonCard);
    updateCourseSaveState("saved", "已載入");
  }

  function addLessonCard(data = {id:uuid(), title:"", nodes:[]}) {
    const fragment = $("lessonTemplate").content.cloneNode(true);
    const card = fragment.querySelector(".lesson-card");
    card.dataset.id = data.id || uuid();
    card.querySelector(".lesson-title-input").value = data.title || "";
    card.querySelector(".lesson-remove").addEventListener("click", () => {
      card.remove(); refreshLessonNumbers(); markCourseDirty();
    });
    card.querySelector(".lesson-move-up").addEventListener("click", () => moveElement(card, -1, $("lessonEditor"), refreshLessonNumbers));
    card.querySelector(".lesson-move-down").addEventListener("click", () => moveElement(card, 1, $("lessonEditor"), refreshLessonNumbers));
    card.querySelector(".add-node-btn").addEventListener("click", () => { addNode(card.querySelector(".lesson-node-list")); markCourseDirty(); });
    card.querySelector(".lesson-title-input").addEventListener("input", markCourseDirty);
    $("lessonEditor").appendChild(fragment);
    const inserted = $("lessonEditor").lastElementChild;
    (data.nodes || []).forEach(node => addNode(inserted.querySelector(".lesson-node-list"), node));
    refreshLessonNumbers();
  }

  function addNode(container, data = {id:uuid(), type:"content", title:"", activityRef:"", note:""}) {
    const fragment = $("nodeTemplate").content.cloneNode(true);
    const node = fragment.querySelector(".lesson-node");
    node.dataset.id = data.id || uuid();
    const typeSelect = node.querySelector(".node-type");
    const titleInput = node.querySelector(".node-title");
    const activitySelect = node.querySelector(".node-activity-ref");
    const note = node.querySelector(".node-note");
    typeSelect.value = data.type || "content";
    titleInput.value = data.title || "";
    note.value = data.note || "";
    populateActivitySelect(activitySelect, data.activityRef || "");
    updateNodeActivityVisibility(node);

    typeSelect.addEventListener("change", () => { updateNodeActivityVisibility(node); markCourseDirty(); });
    [titleInput, activitySelect, note].forEach(input => input.addEventListener("input", markCourseDirty));
    activitySelect.addEventListener("change", markCourseDirty);
    node.querySelector(".node-remove").addEventListener("click", () => { node.remove(); markCourseDirty(); });
    node.querySelector(".node-up").addEventListener("click", () => moveElement(node, -1, container));
    node.querySelector(".node-down").addEventListener("click", () => moveElement(node, 1, container));
    container.appendChild(fragment);
  }

  function populateActivitySelect(select, selected) {
    const activities = getActivities();
    select.innerHTML = `<option value="">— 選擇既有活動 —</option>`;

    activities.forEach(a => {
      const opt = document.createElement("option");
      opt.value = a.id;
      opt.textContent = a.title || "未命名活動";
      if (a.id === selected) opt.selected = true;
      select.appendChild(opt);
    });

    if (selected && !activities.some(a => a.id === selected)) {
      const missing = document.createElement("option");
      missing.value = selected;
      missing.textContent = "⚠ 引用的活動已不存在";
      missing.selected = true;
      select.appendChild(missing);
    }
  }

  function refreshCourseActivityRefs() {
    document.querySelectorAll(".node-activity-ref").forEach(select => {
      const selected = select.value;
      populateActivitySelect(select, selected);
    });
  }

  function updateNodeActivityVisibility(node) {
    node.querySelector(".node-activity-ref").classList.toggle("hidden", node.querySelector(".node-type").value !== "activity");
  }

  function moveElement(el, delta, parent, callback) {
    const siblings = [...parent.children];
    const index = siblings.indexOf(el);
    const target = siblings[index + delta];
    if (!target) return;
    if (delta < 0) parent.insertBefore(el, target);
    else parent.insertBefore(target, el);
    callback?.(); markCourseDirty();
  }

  function refreshLessonNumbers() {
    [...$("lessonEditor").children].forEach((card, i) => card.querySelector(".lesson-number").textContent = `第 ${i + 1} 節`);
  }

  function readCourseEditor() {
    return {
      id: currentCourseId || uuid(),
      title: $("courseTitle").value.trim() || "未命名課程",
      subtitle: $("courseSubtitle").value.trim(),
      description: $("courseDescription").value.trim(),
      lessons: [...$("lessonEditor").querySelectorAll(".lesson-card")].map(card => ({
        id: card.dataset.id || uuid(),
        title: card.querySelector(".lesson-title-input").value.trim() || "未命名節次",
        nodes: [...card.querySelectorAll(".lesson-node")].map(node => ({
          id: node.dataset.id || uuid(),
          type: node.querySelector(".node-type").value,
          title: node.querySelector(".node-title").value.trim() || "未命名節點",
          activityRef: node.querySelector(".node-type").value === "activity" ? node.querySelector(".node-activity-ref").value : "",
          note: node.querySelector(".node-note").value.trim()
        }))
      }))
    };
  }

  function saveCurrentCourse(showMessage = true) {
    if (!currentCourseId) return;
    const data = readCourseEditor();
    const i = courses.findIndex(c => c.id === data.id);
    if (i >= 0) courses[i] = data; else courses.unshift(data);
    save(KEYS.courses, courses);
    renderCourseList();
    updateCourseSaveState("saved", showMessage ? "已儲存" : "已同步");
  }
  function markCourseDirty() { updateCourseSaveState("dirty", "有尚未儲存的變更"); }
  function updateCourseSaveState(state, text) {
    const wrap = $("courseSaveState")?.parentElement;
    wrap?.classList.remove("dirty","saved"); wrap?.classList.add(state);
    if ($("courseSaveState")) $("courseSaveState").textContent = text;
  }

  ["courseTitle","courseSubtitle","courseDescription"].forEach(id => $(id)?.addEventListener("input", markCourseDirty));
  $("addLessonBtn").addEventListener("click", () => { addLessonCard(); markCourseDirty(); });
  $("saveCourseBtn").addEventListener("click", () => saveCurrentCourse(true));
  $("newCourseBtn").addEventListener("click", () => {
    saveCurrentCourse(false);
    const c = {id:uuid(), title:"未命名課程", subtitle:"", description:"", lessons:[]};
    courses.unshift(c); currentCourseId = c.id; save(KEYS.courses, courses); renderCourseList(); loadCourseEditor(c);
  });
  $("duplicateCourseBtn").addEventListener("click", () => {
    const source = readCourseEditor();
    const copy = structuredClone(source); copy.id = uuid(); copy.title += "－副本";
    copy.lessons.forEach(l => { l.id = uuid(); l.nodes.forEach(n => n.id = uuid()); });
    courses.unshift(copy); currentCourseId = copy.id; save(KEYS.courses,courses); renderCourseList(); loadCourseEditor(copy);
  });
  $("deleteCourseBtn").addEventListener("click", () => {
    if (!confirm("確定要刪除這個課程架構嗎？")) return;
    courses = courses.filter(c => c.id !== currentCourseId);
    if (!courses.length) courses = [{id:uuid(), title:"未命名課程", subtitle:"", description:"", lessons:[]}];
    currentCourseId = courses[0].id; save(KEYS.courses,courses); renderCourseList(); loadCourseEditor(courses[0]);
  });

  // ---------------- Type library ----------------
  function renderTypeList() {
    const list = $("typeList"); list.innerHTML = "";
    types.forEach(type => {
      const item = document.createElement("div");
      item.className = `v15-list-item ${type.id === currentTypeId ? "active" : ""}`;
      item.innerHTML = `<strong>${escapeHtml(type.icon || "◼")} ${escapeHtml(type.name || "未命名類型")}</strong><small>${type.elements?.length || 0} 張要素卡</small>`;
      item.addEventListener("click", () => {
        saveCurrentType(false); currentTypeId = type.id; renderTypeList(); loadTypeEditor(type);
      });
      list.appendChild(item);
    });
    const currentWork = works.find(work => work.id === currentWorkId);
    renderWorkElementChoices(currentWork?.elementRefs || []);
  }

  function addSimpleRow(container, value = "", placeholder = "輸入內容") {
    const fragment = $("simpleRowTemplate").content.cloneNode(true);
    const row = fragment.querySelector(".simple-row");
    const input = row.querySelector(".simple-row-input");
    input.value = value; input.placeholder = placeholder;
    row.querySelector(".simple-row-remove").addEventListener("click", () => row.remove());
    container.appendChild(fragment);
  }

  function addTypeElementRow(container, element = {id:uuid(), name:""}) {
    const fragment = $("simpleRowTemplate").content.cloneNode(true);
    const row = fragment.querySelector(".simple-row");
    row.dataset.id = element.id || uuid();
    const input = row.querySelector(".simple-row-input");
    input.value = element.name || "";
    input.placeholder = "例如：魔法";
    row.querySelector(".simple-row-remove").addEventListener("click", () => row.remove());
    container.appendChild(fragment);
  }

  function loadTypeEditor(type) {
    $("typeName").value = type?.name || ""; $("typeIcon").value = type?.icon || "";
    $("typeColor").value = type?.color || "#7057d9"; $("typeDescription").value = type?.description || "";
    $("typeElementList").innerHTML = ""; (type?.elements || []).forEach(e => addTypeElementRow($("typeElementList"), e));
    if (!type?.elements?.length) addTypeElementRow($("typeElementList"));
    updateTypePreview();
  }
  function readTypeEditor() {
    return {
      id:currentTypeId || uuid(),
      name:$("typeName").value.trim() || "未命名類型",
      icon:$("typeIcon").value.trim() || "◼",
      color:$("typeColor").value,
      description:$("typeDescription").value.trim(),
      elements:[...$("typeElementList").querySelectorAll(".simple-row")]
        .map(row => ({id:row.dataset.id || uuid(), name:row.querySelector(".simple-row-input").value.trim()}))
        .filter(element => element.name)
    };
  }
  function saveCurrentType(showMessage = true) {
    if (!currentTypeId) return;
    const data = readTypeEditor(); const i = types.findIndex(t=>t.id===data.id);
    if (i>=0) types[i]=data; else types.unshift(data); save(KEYS.types,types); renderTypeList(); updateTypePreview();
    if (showMessage) showMiniToast("類型工具箱已儲存");
  }
  function updateTypePreview() {
    const name=$("typeName").value.trim()||"類型名稱", icon=$("typeIcon").value.trim()||"◼", color=$("typeColor").value;
    $("typePreview").innerHTML=`<span class="type-preview-chip" style="border-color:${color}55;background:${color}16;color:${color}">${escapeHtml(icon)} ${escapeHtml(name)}</span>`;
  }
  ["typeName","typeIcon","typeColor"].forEach(id => $(id).addEventListener("input", updateTypePreview));
  $("addTypeElementBtn").addEventListener("click",()=>addTypeElementRow($("typeElementList")));
  $("saveTypeBtn").addEventListener("click",()=>saveCurrentType(true));
  $("newTypeBtn").addEventListener("click",()=>{
    saveCurrentType(false); const t={id:uuid(),name:"新類型",icon:"◼",color:"#667085",description:"",elements:[]}; types.unshift(t);currentTypeId=t.id;save(KEYS.types,types);renderTypeList();loadTypeEditor(t);
  });
  $("deleteTypeBtn").addEventListener("click",()=>{
    if(!confirm("確定刪除這個類型與其要素嗎？"))return;
    types=types.filter(t=>t.id!==currentTypeId); if(!types.length) types=[{id:uuid(),name:"新類型",icon:"◼",color:"#667085",description:"",elements:[]}];
    currentTypeId=types[0].id;save(KEYS.types,types);renderTypeList();loadTypeEditor(types[0]);
  });

  // ---------------- Works ----------------
  function allElements() {
    return types.flatMap(type => (type.elements || []).map(element => ({
      id: element.id,
      name: element.name,
      typeId: type.id,
      typeName: type.name,
      icon: type.icon,
      color: type.color
    })));
  }
  function renderWorkList() {
    const list=$("workList");list.innerHTML="";
    works.forEach(work=>{
      const item=document.createElement("div");item.className=`v15-list-item ${work.id===currentWorkId?"active":""}`;
      item.innerHTML=`<strong>${escapeHtml(work.name||"未命名作品")}</strong><small>${work.clues?.length||0} 層線索 · ${work.elementRefs?.length||0} 個對應要素</small>`;
      item.addEventListener("click",()=>{saveCurrentWork(false);currentWorkId=work.id;renderWorkList();loadWorkEditor(work);});
      list.appendChild(item);
    });
  }
  function renderWorkElementChoices(selected=[]) {
    const box=$("workElementChoices"); if(!box) return; box.innerHTML="";
    const elements=allElements();
    if(!elements.length){box.innerHTML='<div class="empty-v15">請先在「類型工具箱」建立分類要素。</div>';return;}
    elements.forEach(e=>{
      const label=document.createElement("label");label.className="element-choice";
      label.innerHTML=`<input type="checkbox" value="${escapeHtml(e.id)}" ${selected.includes(e.id)?"checked":""}><span><strong>${escapeHtml(e.icon)} ${escapeHtml(e.name)}</strong><small>${escapeHtml(e.typeName)}</small></span>`;
      box.appendChild(label);
    });
  }
  function addWorkClueRow(container, clue = {id:uuid(), text:""}) {
    const fragment = $("simpleRowTemplate").content.cloneNode(true);
    const row = fragment.querySelector(".simple-row");
    row.dataset.id = clue.id || uuid();
    const input = row.querySelector(".simple-row-input");
    input.value = clue.text || "";
    input.placeholder = "輸入一層線索";
    row.querySelector(".simple-row-remove").addEventListener("click", () => row.remove());
    container.appendChild(fragment);
  }

  function loadWorkEditor(work) {
    $("workName").value=work?.name||"";$("workImage").value=work?.image||"";$("workShowName").checked=work?.showName!==false;
    $("workIntro").value=work?.intro||"";$("workTeacherNote").value=work?.teacherNote||"";
    $("workClueList").innerHTML="";(work?.clues||[]).forEach(c=>addWorkClueRow($("workClueList"),c));
    if(!work?.clues?.length)addWorkClueRow($("workClueList"));
    renderWorkElementChoices(work?.elementRefs||[]);updateWorkPreview();
  }
  function readWorkEditor() {
    return {
      id:currentWorkId||uuid(),
      name:$("workName").value.trim()||"未命名作品",
      image:$("workImage").value.trim(),
      showName:$("workShowName").checked,
      intro:$("workIntro").value.trim(),
      teacherNote:$("workTeacherNote").value.trim(),
      clues:[...$("workClueList").querySelectorAll(".simple-row")].map(row=>({
        id:row.dataset.id||uuid(),
        text:row.querySelector(".simple-row-input").value.trim()
      })).filter(clue=>clue.text),
      elementRefs:[...$("workElementChoices").querySelectorAll('input[type="checkbox"]:checked')].map(i=>i.value)
    };
  }
  function saveCurrentWork(showMessage=true){
    if(!currentWorkId)return;const data=readWorkEditor(),i=works.findIndex(w=>w.id===data.id);if(i>=0)works[i]=data;else works.unshift(data);
    save(KEYS.works,works);renderWorkList();updateWorkPreview();if(showMessage)showMiniToast("作品資料已儲存");
  }
  function updateWorkPreview(){
    const name=$("workName").value.trim()||"作品預覽",img=$("workImage").value.trim();
    $("workPreview").innerHTML=`<div class="work-preview-thumb">${img?`<img src="${escapeHtml(img)}" alt="">`:"🎬"}</div><div><strong>${escapeHtml(name)}</strong><br><small>${$("workShowName").checked?"學生端顯示名稱":"學生端隱藏名稱"}</small></div>`;
  }
  ["workName","workImage","workShowName"].forEach(id=>$(id).addEventListener("input",updateWorkPreview));
  $("addWorkClueBtn").addEventListener("click",()=>addWorkClueRow($("workClueList")));
  $("saveWorkBtn").addEventListener("click",()=>saveCurrentWork(true));
  $("newWorkBtn").addEventListener("click",()=>{
    saveCurrentWork(false);const w={id:uuid(),name:"新作品",image:"",showName:true,intro:"",teacherNote:"",clues:[],elementRefs:[]};works.unshift(w);currentWorkId=w.id;save(KEYS.works,works);renderWorkList();loadWorkEditor(w);
  });
  $("deleteWorkBtn").addEventListener("click",()=>{
    if(!confirm("確定刪除這筆作品資料嗎？"))return;
    works=works.filter(w=>w.id!==currentWorkId);if(!works.length)works=[{id:uuid(),name:"新作品",image:"",showName:true,intro:"",teacherNote:"",clues:[],elementRefs:[]}];
    currentWorkId=works[0].id;save(KEYS.works,works);renderWorkList();loadWorkEditor(works[0]);
  });

  function showMiniToast(message){const toast=$("toast");if(!toast)return;toast.textContent=message;toast.classList.add("show");setTimeout(()=>toast.classList.remove("show"),1500);}

  // Initial rendering
  renderCourseList(); loadCourseEditor(currentCourse());
  renderTypeList(); loadTypeEditor(types.find(t=>t.id===currentTypeId));
  renderWorkList(); loadWorkEditor(works.find(w=>w.id===currentWorkId));
})();

/* ----- Activity Template Editor ----- */
const STORAGE_KEY = "interactive-classroom-v1";
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
const standardTaskToolbar = el("standardTaskToolbar");
const shareDialog = el("shareDialog");
const shareUrlInput = el("shareUrl");
const qrcodeEl = el("qrcode");
const qrNotice = el("qrNotice");
const modeInputs = [...document.querySelectorAll('input[name="activityMode"]')];
const editorPanel = document.querySelector(".editor-panel");
const templateKicker = el("templateKicker");
const templateTitle = el("templateTitle");
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
  openClassification: null
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
    const allowed = new Set(["drag-reveal","open-tags","element-type","progressive-reveal","open-classification"]);
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
    openClassification: null
  };
}

function getModeLabel(template) {
  if (template === "open-tags") return "開放式標籤討論";
  if (template === "element-type") return "要素 → 類型分類";
  if (template === "progressive-reveal") return "逐層揭露";
  if (template === "open-classification") return "開放分類";
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

// ---------- 模式切換 ----------
function getSelectedMode() {
  return modeInputs.find(input => input.checked)?.value || "drag-reveal";
}

function setSelectedMode(mode) {
  const allowed = new Set(["drag-reveal", "open-tags", "element-type", "progressive-reveal", "open-classification"]);
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

  editorPanel?.classList.toggle("open-tags-mode", isOpen);
  editorPanel?.classList.toggle("element-type-mode", isElementType);
  editorPanel?.classList.toggle("progressive-reveal-mode", isProgressive);
  editorPanel?.classList.toggle("open-classification-mode", isOpenClassification);

  if (templateKicker) {
    templateKicker.textContent = isOpenClassification ? "模板 05" : isProgressive ? "模板 04" : isElementType ? "模板 03" : isOpen ? "模板 02" : "模板 01";
  }
  if (templateTitle) {
    templateTitle.textContent = isOpenClassification
      ? "開放分類"
      : isProgressive ? "逐層揭露"
      : isElementType ? "要素 → 類型分類"
      : isOpen ? "開放式標籤討論" : "探索式拖曳揭密";
  }

  const isSpecial = isElementType || isProgressive || isOpenClassification;
  standardTaskToolbar?.classList.toggle("hidden", isSpecial);
  caseEditor?.classList.toggle("hidden", isSpecial);
  elementTypeEditorSection?.classList.toggle("hidden", !isElementType);
  progressiveEditorSection?.classList.toggle("hidden", !isProgressive);
  openClassificationEditorSection?.classList.toggle("hidden", !isOpenClassification);

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
  if (!caseEditor.children.length) addCase();
}

function loadIntoEditor(activity) {
  activityTitle.value = activity.title || "";
  activitySubtitle.value = activity.subtitle || "";

  caseEditor.innerHTML = "";
  elementTypeTaskEditor.innerHTML = "";
  progressiveTaskEditor.innerHTML = "";

  if (activity.template === "element-type") {
    const tasks = activity.tasks?.length ? activity.tasks : [newModeATask()];
    tasks.forEach(addModeATask);
  } else if (activity.template === "progressive-reveal") {
    addProgressiveTask(activity.progressive || newProgressiveTask());
  } else if (activity.template === "open-classification") {
    addOpenClassificationTask(activity.openClassification || newOpenClassificationTask());
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
    openClassification: template === "open-classification" ? readOpenClassificationTask() : null
  };
}

function splitKeywords(value) {
  return value.split(/[、,，]/).map(v => v.trim()).filter(Boolean);
}

function validateActivity(activity) {
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
      e: elementOptions.map(element => ({
        i: element.id,
        n: element.name
      })),
      ce: task.correctElementRefs.map(id => elementOptions.findIndex(element => element.id === id)).filter(index => index >= 0),
      y: typeOptions.map(type => ({
        i: type.id,
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
    l:task.clueRefs.map(id=>clueMap.get(id)).filter(Boolean).map(clue=>({i:clue.id,t:clue.text})),
    y:types.map(type=>({i:type.id,n:type.name,ic:type.icon||"◼",c:type.color||"#667085",d:type.description||""})),
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
    e:elements.map(element=>({i:element.id,n:element.name})),
    y:types.map(type=>({i:type.id,n:type.name,ic:type.icon||"◼",c:type.color||"#667085",d:type.description||""})),
    min:Math.max(1,Number(task.minEvidence)||2),
    q:task.discussionPrompt||"",
    r:task.allowRejudge!==false
  };
}

async function encodeActivity(activity) {
  let compact;

  if (activity.template === "element-type") {
    compact = {t:activity.title,s:activity.subtitle,m:"element-type",x:buildElementTypeSnapshot(activity)};
  } else if (activity.template === "progressive-reveal") {
    compact = {t:activity.title,s:activity.subtitle,m:"progressive-reveal",g:buildProgressiveSnapshot(activity)};
  } else if (activity.template === "open-classification") {
    compact = {t:activity.title,s:activity.subtitle,m:"open-classification",o:buildOpenClassificationSnapshot(activity)};
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

async function buildShareUrl(activity) {
  const encoded = await encodeActivity(activity);
  const path = new URL("play.html", window.location.href);
  path.hash = `data=${encoded}`;
  return path.toString();
}

async function previewOrShare(openPreview = false) {
  const activity = saveCurrent(false);
  const validation = validateActivity(activity);
  if (validation) {
    showToast(validation);
    return;
  }

  const url = await buildShareUrl(activity);

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
    qrcodeEl.innerHTML = "<p class='subtle'>活動內容較多，已超過目前 QR Code 的安全容量。</p>";
    qrNotice.textContent = "學生連結仍可使用；建議精簡作品介紹或減少一次分享的任務數。";
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
        : 1,
    encoded: await encodeActivity(activity)
  };
}

window.ClassroomActivityAPI = {
  list: getActivitySummaries,
  buildSessionSnapshot: buildSessionActivitySnapshot
};

// ---------- 事件 ----------
el("addCaseBtn").addEventListener("click", () => addCase());
el("addElementTypeTaskBtn").addEventListener("click", () => addModeATask());
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

loadActivities();

/* ----- Classroom Session Manager ----- */
(() => {
  const $ = id => document.getElementById(id);
  let activeSession = null;
  let refreshTimer = null;

  function activityModeLabel(mode) {
    if (mode === "element-type") return "要素 → 類型";
    if (mode === "progressive-reveal") return "逐層揭露";
    if (mode === "open-classification") return "開放分類";
    if (mode === "open-tags") return "開放式討論";
    return "探索式揭密";
  }

  function refreshActivityOptions() {
    const select = $("sessionActivitySelect");
    const api = window.ClassroomActivityAPI;
    if (!select || !api) return;

    const current = select.value;
    const activities = api.list();
    select.innerHTML = '<option value="">— 選擇活動 —</option>';
    activities.forEach(activity => {
      const option = document.createElement("option");
      option.value = activity.id;
      option.textContent = `${activity.title}｜${activityModeLabel(activity.template)}`;
      select.appendChild(option);
    });
    if (activities.some(activity => activity.id === current)) select.value = current;
    else if (activities[0]) select.value = activities[0].id;
    renderActivityPreview();
  }

  function renderActivityPreview() {
    const select = $("sessionActivitySelect");
    const preview = $("sessionActivityPreview");
    const api = window.ClassroomActivityAPI;
    if (!select || !preview || !api) return;

    const activity = api.list().find(item => item.id === select.value);
    if (!activity) {
      preview.innerHTML = '<div class="empty-v15">目前沒有可以開啟 Session 的活動。</div>';
      return;
    }
    preview.innerHTML = `
      <div class="session-preview-icon">🧩</div>
      <div>
        <strong>${escapeHtml(activity.title)}</strong>
        <p>${escapeHtml(activity.subtitle || "沒有副標題")}</p>
        <small>${activityModeLabel(activity.template)} · ${activity.template === "progressive-reveal" ? `${activity.taskCount} 層線索` : activity.template === "open-classification" ? "初次＋重新判斷" : `${activity.taskCount} 個任務`}</small>
      </div>
    `;
    if (!$("sessionTitleInput").value.trim()) $("sessionTitleInput").value = activity.title;
  }

  function renderCloudState() {
    const api = window.ClassroomSessionAPI;
    const configured = api?.isCloudConfigured?.();
    const badge = $("cloudModeBadge");
    badge.className = `cloud-mode-badge ${configured ? "cloud" : "local"}`;
    badge.textContent = configured ? "☁️ 雲端 Session" : "本機測試模式";
    $("cloudSettingsSummary").textContent = configured ? "Supabase 已設定" : "尚未設定 Supabase";
    $("sessionCreateHint").textContent = configured
      ? "學生可從不同裝置加入；作答會寫入雲端 Session。"
      : "本機測試 Session 只能在建立它的同一個瀏覽器加入，適合先驗證流程。";

    const config = api?.getConfig?.() || {};
    $("supabaseUrlInput").value = config.url || "";
    $("supabaseKeyInput").value = config.key || "";
  }

  async function saveCloudConfig() {
    const api = window.ClassroomSessionAPI;
    const result = $("cloudTestResult");
    const button = $("saveCloudConfigBtn");
    button.disabled = true;
    result.textContent = "正在測試連線…";
    try {
      const config = api.saveConfig($("supabaseUrlInput").value, $("supabaseKeyInput").value);
      const ok = await api.testCloudConfig(config.url, config.key);
      if (!ok) throw new Error("Healthcheck 未回傳 ok");
      result.textContent = "✅ 連線成功，可以建立跨裝置 Session。";
      renderCloudState();
    } catch (error) {
      result.textContent = `❌ ${error.message}`;
    } finally {
      button.disabled = false;
    }
  }

  function clearCloudConfig() {
    window.ClassroomSessionAPI.clearConfig();
    $("cloudTestResult").textContent = "已清除雲端設定。";
    renderCloudState();
  }

  async function createSession() {
    const activityId = $("sessionActivitySelect").value;
    if (!activityId) {
      showSessionToast("請先選擇一個活動");
      return;
    }

    const button = $("createSessionBtn");
    button.disabled = true;
    button.textContent = "建立中…";
    try {
      const snapshot = await window.ClassroomActivityAPI.buildSessionSnapshot(activityId);
      const title = $("sessionTitleInput").value.trim() || snapshot.title;
      const session = await window.ClassroomSessionAPI.createSession({
        title,
        activityEncoded:snapshot.encoded,
        activityMode:snapshot.template,
        stageCount:snapshot.stageCount || 1
      });
      activeSession = session;
      await renderActiveSession();
      renderHistory();
    } catch (error) {
      showSessionToast(error.message || "建立 Session 失敗");
    } finally {
      button.disabled = false;
      button.textContent = "＋ 建立課堂 Session";
    }
  }

  async function renderActiveSession() {
    if (!activeSession) return;
    clearInterval(refreshTimer);
    $("activeSessionCard").classList.remove("hidden");
    $("activeSessionTitle").textContent = activeSession.title;
    $("activeSessionCode").textContent = activeSession.code;
    $("activeSessionMode").textContent = activeSession.mode === "cloud" ? "☁️ 雲端 Session" : "🧪 本機測試 Session";
    $("sessionActivityMode").textContent = activityModeLabel(activeSession.activityMode);
    $("progressiveSessionControl").classList.toggle("hidden", activeSession.activityMode !== "progressive-reveal");
    $("openClassificationSessionControl").classList.toggle("hidden", activeSession.activityMode !== "open-classification");

    const joinUrl = window.ClassroomSessionAPI.buildJoinUrl(activeSession);
    $("sessionJoinUrl").value = joinUrl;

    const qr = $("sessionQrCode");
    qr.innerHTML = "";
    if (window.QRCode) {
      try {
        new QRCode(qr, {text:joinUrl,width:190,height:190,correctLevel:QRCode.CorrectLevel.L});
        $("sessionQrNotice").textContent = activeSession.mode === "cloud"
          ? "學生掃碼後輸入座號即可加入。"
          : "本機測試 QR 僅適合在同一瀏覽器驗證流程。";
      } catch {
        $("sessionQrNotice").textContent = "QR Code 產生失敗，請使用左側加入連結。";
      }
    } else {
      $("sessionQrNotice").textContent = "QR Code 元件尚未載入，請使用左側加入連結。";
    }
    await refreshActiveSession();
    if (["progressive-reveal","open-classification"].includes(activeSession.activityMode)) {
      refreshTimer = setInterval(() => refreshActiveSession(true), 2500);
    }
  }

  async function refreshActiveSession(silent = false) {
    if (!activeSession) return;
    const button = $("refreshSessionBtn");
    if (!silent) button.disabled = true;
    try {
      const snapshot = await window.ClassroomSessionAPI.teacherSnapshot(activeSession);
      $("sessionParticipantCount").textContent = snapshot.participant_count ?? 0;
      $("sessionResponseCount").textContent = snapshot.response_count ?? 0;
      $("activeSessionStatus").textContent = snapshot.status === "active" ? "進行中" : snapshot.status || "—";
      activeSession.currentStage = snapshot.current_stage || activeSession.currentStage || 1;
      activeSession.stageCount = snapshot.stage_count || activeSession.stageCount || 1;
      renderParticipants(snapshot.participants || [], snapshot.responses || []);
      renderProgressiveControl(snapshot);
      renderOpenClassificationControl(snapshot);
    } catch (error) {
      showSessionToast(error.message || "更新 Session 失敗");
    } finally {
      if (!silent) button.disabled = false;
    }
  }

  function renderParticipants(participants, responses = []) {
    const list = $("sessionParticipantList");
    list.innerHTML = "";
    if (!participants.length) {
      list.innerHTML = '<div class="empty-v15">還沒有學生加入。</div>';
      return;
    }
    participants
      .slice()
      .sort((a,b) => String(a.student_code).localeCompare(String(b.student_code), "zh-Hant", {numeric:true}))
      .forEach(participant => {
        const row = document.createElement("div");
        row.className = "session-participant-row";
        row.innerHTML = `
          <div class="participant-seat">${escapeHtml(participant.student_code)}</div>
          <div class="participant-main">
            <strong>${Number(participant.response_count || 0) > 0 ? "已作答" : "已加入"}</strong>
            <small>${participant.last_submitted_at ? `最後作答：${formatTime(participant.last_submitted_at)}` : `加入：${formatTime(participant.joined_at)}`}</small>
            ${activeSession?.activityMode === "progressive-reveal" ? `<div class="participant-judgement-history">${buildParticipantHistory(participant.id, responses)}</div>` : ""}
            ${activeSession?.activityMode === "open-classification" ? `<div class="participant-judgement-history">${buildOpenParticipantHistory(participant.id, responses)}</div>` : ""}
          </div>
          <span class="participant-response-count">${participant.response_count || 0} 筆</span>
        `;
        list.appendChild(row);
      });
  }

  function stageNumberFromKey(key) {
    const match = String(key || "").match(/^clue-(\d+)$/);
    return match ? Number(match[1]) : null;
  }

  function buildParticipantHistory(participantId, responses) {
    const rows = responses
      .filter(r => r.participant_id === participantId && r.mode === "progressive-reveal")
      .map(r => ({stage:stageNumberFromKey(r.stage_key), name:r.payload?.selectedTypeName || r.selected_type || "—"}))
      .filter(r => r.stage)
      .sort((a,b)=>a.stage-b.stage);
    if (!rows.length) return "尚未提交逐層判斷";
    return rows.map(row => `<span>第${row.stage}層 ${escapeHtml(row.name)}</span>`).join('<span class="history-arrow">→</span>');
  }

  function buildOpenParticipantHistory(participantId, responses) {
    const initial = responses.find(r => r.participant_id === participantId && r.mode === "open-classification" && r.stage_key === "initial");
    const final = responses.find(r => r.participant_id === participantId && r.mode === "open-classification" && r.stage_key === "final");
    if (!initial) return "尚未提交初次判斷";
    const initialName = initial.payload?.selectedTypeName || initial.selected_type || "—";
    if (!final) return `<span>初次 ${escapeHtml(initialName)}</span><span class="history-arrow">→</span><span>等待重新判斷</span>`;
    const finalName = final.payload?.selectedTypeName || final.selected_type || "—";
    const reason = final.payload?.changeReason || "";
    return `<span>初次 ${escapeHtml(initialName)}</span><span class="history-arrow">→</span><span>最終 ${escapeHtml(finalName)}</span>${reason ? `<span class="open-history-reason">${escapeHtml(reason)}</span>` : ""}`;
  }

  function renderProgressiveControl(snapshot) {
    const panel = $("progressiveSessionControl");
    if (!panel || activeSession?.activityMode !== "progressive-reveal") {
      panel?.classList.add("hidden");
      return;
    }
    panel.classList.remove("hidden");
    const stage = snapshot.current_stage || 1;
    const total = snapshot.stage_count || activeSession.stageCount || 1;
    $("progressiveStageBadge").textContent = `線索 ${stage} / ${total}`;
    $("teacherCurrentClueText").textContent = `目前已公開到第 ${stage} 層線索`;
    const currentResponses = (snapshot.responses || []).filter(r => r.mode === "progressive-reveal" && stageNumberFromKey(r.stage_key) === stage);
    $("teacherStageSubmissionText").textContent = `本層已提交 ${currentResponses.length} / ${snapshot.participant_count || 0}`;
    $("previousStageBtn").disabled = stage <= 1;
    $("nextStageBtn").disabled = stage >= total;
    $("nextStageBtn").textContent = stage >= total ? "已公開全部線索" : "公開下一條線索 →";

    const counts = new Map();
    currentResponses.forEach(r => {
      const name = r.payload?.selectedTypeName || r.selected_type || "未命名類型";
      counts.set(name, (counts.get(name) || 0) + 1);
    });
    const list = $("teacherStageDistribution");
    list.innerHTML = "";
    if (!counts.size) {
      list.innerHTML = '<div class="empty-v15">這一層還沒有學生提交。</div>';
      return;
    }
    const max = Math.max(...counts.values());
    [...counts.entries()].sort((a,b)=>b[1]-a[1]).forEach(([name,count]) => {
      const row = document.createElement("div");
      row.className = "stage-distribution-row";
      row.innerHTML = `<span>${escapeHtml(name)}</span><div><i style="width:${Math.max(8,(count/max)*100)}%"></i></div><strong>${count}</strong>`;
      list.appendChild(row);
    });
  }

  function renderOpenDistribution(list, responses) {
    list.innerHTML = "";
    const counts = new Map();
    responses.forEach(r => {
      const name = r.payload?.selectedTypeName || r.selected_type || "未命名類型";
      counts.set(name, (counts.get(name) || 0) + 1);
    });
    if (!counts.size) {
      list.innerHTML = '<div class="empty-v15">這個階段還沒有學生提交。</div>';
      return;
    }
    const max = Math.max(...counts.values());
    [...counts.entries()].sort((a,b)=>b[1]-a[1]).forEach(([name,count]) => {
      const row = document.createElement("div");
      row.className = "stage-distribution-row";
      row.innerHTML = `<span>${escapeHtml(name)}</span><div><i style="width:${Math.max(8,(count/max)*100)}%"></i></div><strong>${count}</strong>`;
      list.appendChild(row);
    });
  }

  function renderOpenClassificationControl(snapshot) {
    const panel = $("openClassificationSessionControl");
    if (!panel || activeSession?.activityMode !== "open-classification") {
      panel?.classList.add("hidden");
      return;
    }
    panel.classList.remove("hidden");

    const stage = Math.max(1, Math.min(Number(snapshot.current_stage)||1, Number(snapshot.stage_count)||1));
    const isRejudge = stage >= 2;
    const stageKey = isRejudge ? "final" : "initial";
    const responses = (snapshot.responses || []).filter(r => r.mode === "open-classification");
    const current = responses.filter(r => r.stage_key === stageKey);

    $("openClassificationPhaseBadge").textContent = isRejudge ? "重新判斷" : "初次判斷";
    $("openClassificationPhaseText").textContent = isRejudge
      ? "全班討論後，學生正在進行最終判斷"
      : "學生正在進行初次判斷";
    $("openClassificationSubmissionText").textContent = `本階段已提交 ${current.length} / ${snapshot.participant_count || 0}`;

    $("openPreviousPhaseBtn").disabled = stage <= 1;
    $("openNextPhaseBtn").disabled = stage >= (snapshot.stage_count || 1);
    $("openNextPhaseBtn").textContent = stage >= (snapshot.stage_count || 1)
      ? ((snapshot.stage_count || 1) > 1 ? "已開放重新判斷" : "本活動只有一次判斷")
      : "開放重新判斷 →";

    renderOpenDistribution($("openClassificationDistribution"), current);

    const finalResponses = responses.filter(r => r.stage_key === "final");
    const summary = $("openChangeSummary");
    if (isRejudge && finalResponses.length) {
      const changed = finalResponses.filter(r => Boolean(r.payload?.changed)).length;
      $("openChangedCount").textContent = changed;
      $("openUnchangedCount").textContent = finalResponses.length - changed;
      summary.classList.remove("hidden");
    } else {
      summary.classList.add("hidden");
    }
  }

  async function changeOpenPhase(delta) {
    if (!activeSession || activeSession.activityMode !== "open-classification") return;
    const target = Math.max(1, Math.min((activeSession.currentStage || 1) + delta, activeSession.stageCount || 1));
    try {
      await window.ClassroomSessionAPI.setStage(activeSession, target);
      await refreshActiveSession();
    } catch (error) {
      showSessionToast(error.message || "更新開放分類階段失敗");
    }
  }

  async function changeStage(delta) {
    if (!activeSession || activeSession.activityMode !== "progressive-reveal") return;
    const target = Math.max(1, Math.min((activeSession.currentStage || 1) + delta, activeSession.stageCount || 1));
    try {
      await window.ClassroomSessionAPI.setStage(activeSession, target);
      await refreshActiveSession();
    } catch (error) {
      showSessionToast(error.message || "更新線索階段失敗");
    }
  }

  function renderHistory() {
    const list = $("sessionHistoryList");
    const history = window.ClassroomSessionAPI.loadTeacherHistory();
    list.innerHTML = "";
    if (!history.length) {
      list.innerHTML = '<div class="empty-v15">還沒有建立過課堂 Session。</div>';
      return;
    }
    history.forEach(item => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "session-history-item";
      row.innerHTML = `
        <span class="history-code">${escapeHtml(item.code)}</span>
        <span class="history-main">
          <strong>${escapeHtml(item.title)}</strong>
          <small>${item.mode === "cloud" ? "雲端" : "本機"} · ${formatTime(item.createdAt)}</small>
        </span>
        <span>查看 →</span>
      `;
      row.addEventListener("click", async () => {
        activeSession = item;
        await renderActiveSession();
        $("activeSessionCard").scrollIntoView({behavior:"smooth",block:"start"});
      });
      list.appendChild(row);
    });
  }

  function formatTime(value) {
    if (!value) return "—";
    try {
      return new Intl.DateTimeFormat("zh-TW", {
        month:"numeric", day:"numeric", hour:"2-digit", minute:"2-digit"
      }).format(new Date(value));
    } catch {
      return value;
    }
  }

  function escapeHtml(text) {
    return String(text ?? "").replace(/[&<>"']/g, ch => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    })[ch]);
  }

  let toastTimer = null;
  function showSessionToast(message) {
    const toast = $("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 1800);
  }

  async function copyJoinUrl() {
    const value = $("sessionJoinUrl").value;
    try { await navigator.clipboard.writeText(value); }
    catch {
      $("sessionJoinUrl").select();
      document.execCommand("copy");
    }
    showSessionToast("學生加入連結已複製");
  }

  function refresh() {
    refreshActivityOptions();
    renderCloudState();
    renderHistory();
    if (activeSession) refreshActiveSession();
  }

  $("sessionActivitySelect")?.addEventListener("change", renderActivityPreview);
  $("saveCloudConfigBtn")?.addEventListener("click", saveCloudConfig);
  $("clearCloudConfigBtn")?.addEventListener("click", clearCloudConfig);
  $("createSessionBtn")?.addEventListener("click", createSession);
  $("refreshSessionBtn")?.addEventListener("click", refreshActiveSession);
  $("copySessionUrlBtn")?.addEventListener("click", copyJoinUrl);
  $("previousStageBtn")?.addEventListener("click", () => changeStage(-1));
  $("nextStageBtn")?.addEventListener("click", () => changeStage(1));
  $("openPreviousPhaseBtn")?.addEventListener("click", () => changeOpenPhase(-1));
  $("openNextPhaseBtn")?.addEventListener("click", () => changeOpenPhase(1));

  window.ClassroomSessionManager = {refresh, refreshActiveSession};
  refresh();
  clearInterval(refreshTimer);
  refreshTimer = setInterval(() => { if (activeSession) refreshActiveSession(); }, 3000);
})();
