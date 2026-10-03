
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
