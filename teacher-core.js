/* V2.7.0 | Teacher Core: workflow + Course/Type/Work libraries */
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
    legacyCourses: "interactive-classroom-v15-courses",
    courses: "interactive-classroom-v2-courses",
    lessons: "interactive-classroom-v2-lessons",
    nodes: "interactive-classroom-v2-nodes",
    types: "interactive-classroom-v15-types",
    works: "interactive-classroom-v15-works",
    activities: "interactive-classroom-v1"
  };

  const $ = (id) => document.getElementById(id);
  const uuid = () => globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const nowIso = () => new Date().toISOString();

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

  const defaultLegacyCourse = {
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

  function readArray(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function load(key, fallback) {
    const existing = readArray(key);
    if (existing.length) return existing;
    localStorage.setItem(key, JSON.stringify(fallback));
    return fallback;
  }

  function save(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function normalizeNodeType(type) {
    if (type === "showcase") return "work-wall";
    if (type === "toolbox") return "type-toolbox";
    if (type === "summary") return "content";
    return ["content","work-wall","type-toolbox","activity"].includes(type) ? type : "content";
  }

  function migrateLegacyNode(raw = {}) {
    const type = normalizeNodeType(raw.type);
    const createdAt = raw.createdAt || nowIso();
    const content = type === "activity"
      ? {activityRef:raw.activityRef || raw.content?.activityRef || ""}
      : type === "work-wall"
        ? {workRefs:Array.isArray(raw.content?.workRefs) ? raw.content.workRefs : []}
        : type === "type-toolbox"
          ? {typeRefs:Array.isArray(raw.content?.typeRefs) ? raw.content.typeRefs : []}
          : {body:raw.content?.body ?? (["summary","content"].includes(raw.type) ? (raw.note || "") : ""), image:raw.content?.image || "", emphasis:raw.content?.emphasis || ""};

    return {
      id:raw.id || uuid(),
      type,
      title:raw.title || "未命名節點",
      subtitle:raw.subtitle || "",
      content,
      settings:raw.settings || {},
      navigation:{
        nextLabel:raw.navigation?.nextLabel || "",
        previousLabel:raw.navigation?.previousLabel || "",
        allowBack:raw.navigation?.allowBack !== false
      },
      teacherNote:raw.teacherNote ?? (["summary","content"].includes(raw.type) ? "" : (raw.note || "")),
      createdAt,
      updatedAt:raw.updatedAt || createdAt
    };
  }

  function migrateLegacyCourses(legacyCourses) {
    const nextCourses = [];
    const nextLessons = [];
    const nextNodes = [];

    (legacyCourses || []).forEach(rawCourse => {
      const lessonRefs = [];
      (rawCourse.lessons || []).forEach(rawLesson => {
        const nodeRefs = [];
        (rawLesson.nodes || []).forEach(rawNode => {
          const node = migrateLegacyNode(rawNode);
          nextNodes.push(node);
          nodeRefs.push(node.id);
        });

        const createdAt = rawLesson.createdAt || nowIso();
        const lesson = {
          id:rawLesson.id || uuid(),
          title:rawLesson.title || "未命名節次",
          shortTitle:rawLesson.shortTitle || rawLesson.title || "",
          goal:rawLesson.goal || "",
          nodeRefs,
          estimatedMinutes:Number(rawLesson.estimatedMinutes) || 40,
          teacherNote:rawLesson.teacherNote || "",
          createdAt,
          updatedAt:rawLesson.updatedAt || createdAt
        };
        nextLessons.push(lesson);
        lessonRefs.push(lesson.id);
      });

      const createdAt = rawCourse.createdAt || nowIso();
      nextCourses.push({
        id:rawCourse.id || uuid(),
        title:rawCourse.title || "未命名課程",
        subtitle:rawCourse.subtitle || "",
        description:rawCourse.description || "",
        lessonRefs,
        cover:{
          icon:rawCourse.cover?.icon || "📚",
          image:rawCourse.cover?.image || ""
        },
        settings:{
          allowStudentNavigation:rawCourse.settings?.allowStudentNavigation !== false,
          showProgress:rawCourse.settings?.showProgress !== false
        },
        createdAt,
        updatedAt:rawCourse.updatedAt || createdAt
      });
    });

    return {courses:nextCourses, lessons:nextLessons, nodes:nextNodes};
  }

  function ensureV2CourseData() {
    let nextCourses = readArray(KEYS.courses);
    let nextLessons = readArray(KEYS.lessons);
    let nextNodes = readArray(KEYS.nodes);

    if (!nextCourses.length) {
      const legacy = readArray(KEYS.legacyCourses);
      const migrated = migrateLegacyCourses(legacy.length ? legacy : [defaultLegacyCourse]);
      nextCourses = migrated.courses;
      nextLessons = migrated.lessons;
      nextNodes = migrated.nodes;
      save(KEYS.courses,nextCourses);
      save(KEYS.lessons,nextLessons);
      save(KEYS.nodes,nextNodes);
    }

    return {courses:nextCourses, lessons:nextLessons, nodes:nextNodes};
  }

  const v2Data = ensureV2CourseData();
  let courses = v2Data.courses;
  let lessons = v2Data.lessons;
  let nodes = v2Data.nodes;
  let types = normalizeTypes(load(KEYS.types, defaultTypes));
  let works = normalizeWorks(load(KEYS.works, defaultWorks));
  save(KEYS.types, types);
  save(KEYS.works, works);

  let currentCourseId = courses[0]?.id || null;
  let currentTypeId = types[0]?.id || null;
  let currentWorkId = works[0]?.id || null;

  const WORKFLOW_KEY = "interactive-classroom-v23-workflow";
  const PREP_VIEW_KEY = "interactive-classroom-v23-prep-view";
  const PREP_VIEWS = ["courses","works","types","activities"];
  let currentWorkflow = localStorage.getItem(WORKFLOW_KEY) === "teach" ? "teach" : "prepare";
  let lastPrepareView = PREP_VIEWS.includes(localStorage.getItem(PREP_VIEW_KEY))
    ? localStorage.getItem(PREP_VIEW_KEY)
    : "courses";

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
    return readArray(KEYS.activities);
  }

  function escapeHtml(text) {
    return String(text ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
  }

  function lessonById(id) { return lessons.find(item => item.id === id); }
  function nodeById(id) { return nodes.find(item => item.id === id); }
  function currentCourse() { return courses.find(c => c.id === currentCourseId); }

  function resolveCourse(course) {
    if (!course) return null;
    return {
      ...course,
      lessons:(course.lessonRefs || []).map(lessonById).filter(Boolean).map(lesson => ({
        ...lesson,
        nodes:(lesson.nodeRefs || []).map(nodeById).filter(Boolean)
      }))
    };
  }

  function scrollTeacherToTop({focusDataManager=false}={}) {
    try { document.activeElement?.blur?.(); } catch {}
    const root = document.documentElement;
    const previousBehavior = root.style.scrollBehavior;
    root.style.scrollBehavior = "auto";
    window.scrollTo({top:0,left:0,behavior:"auto"});
    requestAnimationFrame(()=>{
      window.scrollTo({top:0,left:0,behavior:"auto"});
      root.style.scrollBehavior = previousBehavior;
      if (focusDataManager) $("dataManagementBtn")?.focus?.({preventScroll:true});
    });
  }

  function updateBackToTopVisibility() {
    const button = $("backToTopBtn");
    if (!button) return;
    button.classList.toggle("show", window.scrollY > 520);
  }

  function workflowForView(view) {
    return view === "sessions" ? "teach" : "prepare";
  }

  function activeWorkspaceView() {
    return document.querySelector(".workspace-tab.active")?.dataset.view || "";
  }

  function workflowContext(view = activeWorkspaceView() || "courses") {
    const activities = getActivities();
    const courseNodeCount = nodes.length;
    const clueCount = works.reduce((sum,work)=>sum+(work.clues?.length || 0),0);
    const elementCount = types.reduce((sum,type)=>sum+(type.elements?.length || 0),0);
    const activityModes = new Set(activities.map(item=>item.template || item.mode).filter(Boolean)).size;
    let historyCount = 0;
    try { historyCount = window.ClassroomSessionAPI?.loadTeacherHistory?.().length || 0; } catch {}

    const contexts = {
      courses:{
        kicker:"PREP · COURSE",
        title:"課程編排",
        description:"把 Lesson 與 Node 串成完整教學流程，完成後可預覽、分享或帶入 Session。",
        stats:[
          [courses.length,"課程"],
          [lessons.length,"節次"],
          [courseNodeCount,"教學節點"]
        ]
      },
      works:{
        kicker:"PREP · MATERIAL",
        title:"作品庫",
        description:"集中整理作品介紹、逐層線索與可對應要素，讓不同活動與課程重複引用。",
        stats:[
          [works.length,"作品"],
          [clueCount,"逐層線索"],
          [types.length,"可用類型"]
        ]
      },
      types:{
        kicker:"PREP · TOOLBOX",
        title:"類型工具箱",
        description:"建立共用的小說類型與分類要素；之後只引用，不必在每個活動重複輸入。",
        stats:[
          [types.length,"類型"],
          [elementCount,"分類要素"],
          [works.length,"作品"]
        ]
      },
      activities:{
        kicker:"PREP · ACTIVITY",
        title:"活動模板",
        description:"把教材變成學生可操作的互動任務，再由 Course 的 Activity Node 引用。",
        stats:[
          [activities.length,"活動"],
          [activityModes,"使用模式"],
          [courses.length,"可引用課程"]
        ]
      },
      sessions:{
        kicker:"TEACH · LIVE",
        title:"課堂控制",
        description:"建立 Activity 或 Course Session，控制全班進度、查看匿名統計並同步教師投影。",
        stats:[
          [courses.length,"可上課課程"],
          [activities.length,"可用活動"],
          [historyCount,"Session 紀錄"]
        ]
      }
    };
    return contexts[view] || contexts.courses;
  }

  function updateWorkflowContext(view = activeWorkspaceView() || "courses") {
    const context = workflowContext(view);
    $("workflowContextKicker").textContent = context.kicker;
    $("workflowContextTitle").textContent = context.title;
    $("workflowContextDescription").textContent = context.description;
    $("workflowContextStats").innerHTML = context.stats.map(([value,label])=>`
      <div class="workflow-context-stat">
        <strong>${Number(value) || 0}</strong>
        <span>${escapeHtml(label)}</span>
      </div>`).join("");
  }

  function applyWorkflowShell(workflow) {
    currentWorkflow = workflow === "teach" ? "teach" : "prepare";
    localStorage.setItem(WORKFLOW_KEY,currentWorkflow);
    document.body.dataset.workflow = currentWorkflow;

    $("backToTopBtn")?.addEventListener("click",()=>scrollTeacherToTop({focusDataManager:true}));
  window.addEventListener("scroll",updateBackToTopVisibility,{passive:true});
  updateBackToTopVisibility();

  document.querySelectorAll(".workflow-mode-btn").forEach(btn=>{
      const active = btn.dataset.workflow === currentWorkflow;
      btn.classList.toggle("active",active);
      btn.setAttribute("aria-selected",active ? "true" : "false");
    });
    document.querySelectorAll("[data-workflow-nav]").forEach(nav=>{
      nav.classList.toggle("hidden",nav.dataset.workflowNav !== currentWorkflow);
    });

    if (currentWorkflow === "teach") {
      $("workflowEyebrow").textContent = "TEACH WORKSPACE";
      $("workflowSubtitle").textContent = "建立課堂 Session，控制全班進度與教師投影。";
    } else {
      $("workflowEyebrow").textContent = "PREP WORKSPACE";
      $("workflowSubtitle").textContent = "先整理教材與活動，再把它們編排成完整課程。";
    }
  }

  function openTeachSession(kind,resourceId="") {
    const sessionKind = kind === "course" ? "course" : "activity";
    applyWorkflowShell("teach");
    switchView("sessions",{syncWorkflow:false});

    setTimeout(()=>{
      const radio = $(sessionKind === "course" ? "sessionKindCourse" : "sessionKindActivity");
      if (radio) {
        radio.checked = true;
        radio.dispatchEvent(new Event("change",{bubbles:true}));
      }

      window.ClassroomSessionManager?.refresh?.();

      const select = $(sessionKind === "course" ? "sessionCourseSelect" : "sessionActivitySelect");
      if (select && resourceId && [...select.options].some(option=>option.value === resourceId)) {
        select.value = resourceId;
        select.dispatchEvent(new Event("change",{bubbles:true}));
      }

      document.querySelector(".session-config-card")?.scrollIntoView({behavior:"smooth",block:"start"});
    },0);
  }

  window.TeacherWorkflow = {
    switchView:(...args)=>switchView(...args),
    openTeachSession,
    refreshContext:(...args)=>updateWorkflowContext(...args),
    get workflow(){ return currentWorkflow; },
    get lastPrepareView(){ return lastPrepareView; }
  };

  function saveWorkspaceBeforeLeaving(nextView = "") {
    const activeView = activeWorkspaceView();
    if (!activeView || activeView === nextView) return;

    try {
      if (activeView === "courses") saveCurrentCourse(false);
      else if (activeView === "types") saveCurrentType(false);
      else if (activeView === "works") saveCurrentWork(false);
      else if (activeView === "activities") window.ClassroomActivityEditor?.saveCurrent?.(false);
    } catch (error) {
      console.warn("工作區自動儲存失敗", error);
    }
  }

  function switchView(view,{syncWorkflow=true,preserveScroll=false}={}) {
    if (!["courses","types","works","activities","sessions"].includes(view)) view = "courses";
    const previousView = activeWorkspaceView();
    const viewChanged = previousView && previousView !== view;
    saveWorkspaceBeforeLeaving(view);

    const targetWorkflow = workflowForView(view);
    if (syncWorkflow && targetWorkflow !== currentWorkflow) applyWorkflowShell(targetWorkflow);

    document.querySelectorAll(".workspace-tab").forEach(btn => btn.classList.toggle("active", btn.dataset.view === view));
    document.querySelectorAll(".workspace-view").forEach(section => section.classList.toggle("active", section.dataset.workspaceView === view));

    if (targetWorkflow === "prepare") {
      lastPrepareView = view;
      localStorage.setItem(PREP_VIEW_KEY,view);
    }

    if (view === "courses") refreshCourseActivityRefs();

    if (view === "activities") {
      window.ClassroomActivityEditor?.refreshLibraries?.();
    }

    if (view === "sessions") window.ClassroomSessionManager?.refresh?.();
    updateWorkflowContext(view);

    if (viewChanged && !preserveScroll) {
      scrollTeacherToTop();
    }
  }

  document.querySelectorAll(".workflow-mode-btn").forEach(btn=>{
    btn.addEventListener("click",()=>{
      const workflow = btn.dataset.workflow === "teach" ? "teach" : "prepare";
      applyWorkflowShell(workflow);
      switchView(workflow === "teach" ? "sessions" : lastPrepareView,{syncWorkflow:false});
    });
  });

  document.querySelectorAll(".workspace-tab").forEach(btn => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
    btn.addEventListener("v195-save-current", () => {
      const view = btn.dataset.view;
      try {
        if (view === "courses") saveCurrentCourse(false);
        else if (view === "types") saveCurrentType(false);
        else if (view === "works") saveCurrentWork(false);
      } catch (error) {
        console.warn("教材自動儲存失敗", error);
      }
    });
  });

  ["courseList","workList","typeList","activityList","sessionHistoryList"].forEach(id=>{
    const target = $(id);
    if (!target || typeof MutationObserver !== "function") return;
    new MutationObserver(()=>{
      const view = activeWorkspaceView();
      if (view) updateWorkflowContext(view);
    }).observe(target,{childList:true,subtree:true});
  });

  $("newActivityVisibleBtn")?.addEventListener("click", () => {
    if (typeof createNewActivity === "function") createNewActivity();
  });

  // ---------------- V2 Course / Lesson / Node ----------------
  function renderCourseList() {
    const list = $("courseList");
    list.innerHTML = "";
    courses.forEach(course => {
      const item = document.createElement("div");
      item.className = `v15-list-item ${course.id === currentCourseId ? "active" : ""}`;
      const lessonList = (course.lessonRefs || []).map(lessonById).filter(Boolean);
      const nodeCount = lessonList.reduce((sum, lesson) => sum + (lesson.nodeRefs?.length || 0), 0);
      item.innerHTML = `<strong>${escapeHtml(course.cover?.icon || "📚")} ${escapeHtml(course.title || "未命名課程")}</strong><small>${lessonList.length} 節 · ${nodeCount} 個教學節點</small>`;
      item.addEventListener("click", () => {
        saveCurrentCourse(false);
        currentCourseId = course.id;
        renderCourseList();
        loadCourseEditor(course);
      });
      list.appendChild(item);
    });
  }

  function loadCourseEditor(course) {
    const resolved = resolveCourse(course);
    $("courseTitle").value = resolved?.title || "";
    $("courseSubtitle").value = resolved?.subtitle || "";
    $("courseDescription").value = resolved?.description || "";
    $("courseAllowStudentNavigation").checked = resolved?.settings?.allowStudentNavigation !== false;
    $("courseShowProgress").checked = resolved?.settings?.showProgress !== false;
    $("lessonEditor").innerHTML = "";
    (resolved?.lessons || []).forEach(addLessonCard);
    updateCourseSaveState("saved", "已載入 V2 課程");
  }

  function addLessonCard(data = {id:uuid(),title:"",shortTitle:"",goal:"",estimatedMinutes:40,teacherNote:"",nodes:[]}) {
    const fragment = $("lessonTemplate").content.cloneNode(true);
    const card = fragment.querySelector(".lesson-card");
    card.dataset.id = data.id || uuid();
    card.querySelector(".lesson-title-input").value = data.title || "";
    card.querySelector(".lesson-short-title").value = data.shortTitle || "";
    card.querySelector(".lesson-goal").value = data.goal || "";
    card.querySelector(".lesson-minutes").value = Number(data.estimatedMinutes) || "";
    card.querySelector(".lesson-teacher-note").value = data.teacherNote || "";

    card.querySelector(".lesson-remove").addEventListener("click", () => {
      card.remove();
      refreshLessonNumbers();
      markCourseDirty();
    });
    card.querySelector(".lesson-move-up").addEventListener("click", () => moveElement(card,-1,$("lessonEditor"),refreshLessonNumbers));
    card.querySelector(".lesson-move-down").addEventListener("click", () => moveElement(card,1,$("lessonEditor"),refreshLessonNumbers));
    card.querySelector(".add-node-btn").addEventListener("click", () => {
      addNode(card.querySelector(".lesson-node-list"));
      markCourseDirty();
    });
    card.querySelectorAll("input,textarea").forEach(input => input.addEventListener("input",markCourseDirty));

    $("lessonEditor").appendChild(fragment);
    const inserted = $("lessonEditor").lastElementChild;
    (data.nodes || []).forEach(node => addNode(inserted.querySelector(".lesson-node-list"),node));
    refreshLessonNumbers();
  }

  function populateActivitySelect(select, selected) {
    const activityItems = getActivities();
    select.innerHTML = `<option value="">— 選擇既有活動 —</option>`;
    activityItems.forEach(activity => {
      const option = document.createElement("option");
      option.value = activity.id;
      option.textContent = activity.title || "未命名活動";
      option.selected = activity.id === selected;
      select.appendChild(option);
    });
    if (selected && !activityItems.some(activity => activity.id === selected)) {
      const option = document.createElement("option");
      option.value = selected;
      option.textContent = "⚠ 引用的活動已不存在";
      option.selected = true;
      select.appendChild(option);
    }
  }

  function populateResourceSelect(select,type,selectedRefs=[]) {
    const source = type === "work-wall" ? works : type === "type-toolbox" ? types : [];
    select.innerHTML = "";
    source.forEach(item => {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = type === "type-toolbox" ? `${item.icon || "◼"} ${item.name}` : item.name;
      option.selected = selectedRefs.includes(item.id);
      select.appendChild(option);
    });
  }

  function nodeResourceRefs(nodeData) {
    if (nodeData.type === "work-wall") return nodeData.content?.workRefs || [];
    if (nodeData.type === "type-toolbox") return nodeData.content?.typeRefs || [];
    return [];
  }

  function updateNodeVisibility(node) {
    const type = normalizeNodeType(node.querySelector(".node-type").value);
    const activitySelect = node.querySelector(".node-activity-ref");
    const resourceField = node.querySelector(".node-resource-field");
    const resourceSelect = node.querySelector(".node-resource-refs");
    const bodyField = node.querySelector(".node-body-field");

    activitySelect.classList.toggle("hidden", type !== "activity");
    resourceField.classList.toggle("hidden", !["work-wall","type-toolbox"].includes(type));
    bodyField.classList.toggle("hidden", type !== "content");

    if (type === "work-wall" || type === "type-toolbox") {
      const selected = [...resourceSelect.selectedOptions].map(option => option.value);
      populateResourceSelect(resourceSelect,type,selected);
      node.querySelector(".node-resource-label").textContent = type === "work-wall" ? "引用作品" : "引用類型";
    }
  }

  function addNode(container,data={}) {
    const normalized = migrateLegacyNode(data);
    const fragment = $("nodeTemplate").content.cloneNode(true);
    const node = fragment.querySelector(".lesson-node");
    node.dataset.id = normalized.id || uuid();

    const typeSelect = node.querySelector(".node-type");
    const titleInput = node.querySelector(".node-title");
    const subtitleInput = node.querySelector(".node-subtitle");
    const activitySelect = node.querySelector(".node-activity-ref");
    const resourceSelect = node.querySelector(".node-resource-refs");
    const body = node.querySelector(".node-body");
    const note = node.querySelector(".node-note");
    const previousLabel = node.querySelector(".node-previous-label");
    const nextLabel = node.querySelector(".node-next-label");
    const allowBack = node.querySelector(".node-allow-back");

    typeSelect.value = normalized.type;
    titleInput.value = normalized.title || "";
    subtitleInput.value = normalized.subtitle || "";
    populateActivitySelect(activitySelect,normalized.content?.activityRef || "");
    populateResourceSelect(resourceSelect,normalized.type,nodeResourceRefs(normalized));
    body.value = normalized.content?.body || "";
    note.value = normalized.teacherNote || "";
    previousLabel.value = normalized.navigation?.previousLabel || "";
    nextLabel.value = normalized.navigation?.nextLabel || "";
    allowBack.checked = normalized.navigation?.allowBack !== false;
    updateNodeVisibility(node);

    typeSelect.addEventListener("change", () => {
      const previousType = normalized.type;
      updateNodeVisibility(node);
      markCourseDirty();
    });
    node.querySelectorAll("input,select,textarea").forEach(input => {
      input.addEventListener("input",markCourseDirty);
      input.addEventListener("change",markCourseDirty);
    });
    node.querySelector(".node-remove").addEventListener("click", () => { node.remove(); markCourseDirty(); });
    node.querySelector(".node-up").addEventListener("click", () => moveElement(node,-1,container));
    node.querySelector(".node-down").addEventListener("click", () => moveElement(node,1,container));
    container.appendChild(fragment);
  }

  function refreshCourseActivityRefs() {
    document.querySelectorAll(".lesson-node").forEach(node => {
      const activitySelect = node.querySelector(".node-activity-ref");
      const selectedActivity = activitySelect.value;
      populateActivitySelect(activitySelect,selectedActivity);
      const resource = node.querySelector(".node-resource-refs");
      const selectedResources = [...resource.selectedOptions].map(option => option.value);
      populateResourceSelect(resource,node.querySelector(".node-type").value,selectedResources);
      updateNodeVisibility(node);
    });
  }

  function moveElement(element,delta,parent,callback) {
    const siblings = [...parent.children];
    const index = siblings.indexOf(element);
    const target = siblings[index + delta];
    if (!target) return;
    if (delta < 0) parent.insertBefore(element,target);
    else parent.insertBefore(target,element);
    callback?.();
    markCourseDirty();
  }

  function refreshLessonNumbers() {
    [...$("lessonEditor").children].forEach((card,index) => {
      card.querySelector(".lesson-number").textContent = `第 ${index + 1} 節`;
    });
  }

  function readNodeEditor(node) {
    const type = normalizeNodeType(node.querySelector(".node-type").value);
    const selectedRefs = [...node.querySelector(".node-resource-refs").selectedOptions].map(option => option.value);
    const existing = nodeById(node.dataset.id);
    let content = {};
    if (type === "activity") content = {activityRef:node.querySelector(".node-activity-ref").value};
    else if (type === "work-wall") content = {workRefs:selectedRefs};
    else if (type === "type-toolbox") content = {typeRefs:selectedRefs};
    else content = {body:node.querySelector(".node-body").value.trim(),image:"",emphasis:""};

    return {
      id:node.dataset.id || uuid(),
      type,
      title:node.querySelector(".node-title").value.trim() || "未命名節點",
      subtitle:node.querySelector(".node-subtitle").value.trim(),
      content,
      settings:existing?.settings || {},
      navigation:{
        previousLabel:node.querySelector(".node-previous-label").value.trim(),
        nextLabel:node.querySelector(".node-next-label").value.trim(),
        allowBack:node.querySelector(".node-allow-back").checked
      },
      teacherNote:node.querySelector(".node-note").value.trim(),
      createdAt:existing?.createdAt || nowIso(),
      updatedAt:nowIso()
    };
  }

  function readCourseEditor() {
    const oldCourse = currentCourse();
    const nextLessons = [];
    const nextNodes = [];

    [...$("lessonEditor").querySelectorAll(".lesson-card")].forEach(card => {
      const oldLesson = lessonById(card.dataset.id);
      const lessonNodes = [...card.querySelectorAll(".lesson-node")].map(node => readNodeEditor(node));
      nextNodes.push(...lessonNodes);
      nextLessons.push({
        id:card.dataset.id || uuid(),
        title:card.querySelector(".lesson-title-input").value.trim() || "未命名節次",
        shortTitle:card.querySelector(".lesson-short-title").value.trim(),
        goal:card.querySelector(".lesson-goal").value.trim(),
        nodeRefs:lessonNodes.map(node => node.id),
        estimatedMinutes:Math.max(1,Number(card.querySelector(".lesson-minutes").value) || 40),
        teacherNote:card.querySelector(".lesson-teacher-note").value.trim(),
        createdAt:oldLesson?.createdAt || nowIso(),
        updatedAt:nowIso()
      });
    });

    const course = {
      id:currentCourseId || uuid(),
      title:$("courseTitle").value.trim() || "未命名課程",
      subtitle:$("courseSubtitle").value.trim(),
      description:$("courseDescription").value.trim(),
      lessonRefs:nextLessons.map(lesson => lesson.id),
      cover:oldCourse?.cover || {icon:"📚",image:""},
      settings:{
        allowStudentNavigation:true,
        showProgress:$("courseShowProgress").checked
      },
      createdAt:oldCourse?.createdAt || nowIso(),
      updatedAt:nowIso()
    };

    return {course,lessons:nextLessons,nodes:nextNodes};
  }

  function upsertById(collection,items) {
    const map = new Map(collection.map(item => [item.id,item]));
    items.forEach(item => map.set(item.id,item));
    return [...map.values()];
  }

  function saveCurrentCourse(showMessage=true) {
    if (!currentCourseId) return;
    const oldCourse = currentCourse();
    const oldLessonIds = new Set(oldCourse?.lessonRefs || []);
    const oldNodeIds = new Set(
      [...oldLessonIds].flatMap(id => lessonById(id)?.nodeRefs || [])
    );

    const data = readCourseEditor();
    const keepLessonIds = new Set(data.lessons.map(item => item.id));
    const keepNodeIds = new Set(data.nodes.map(item => item.id));

    lessons = lessons.filter(item => !oldLessonIds.has(item.id) || keepLessonIds.has(item.id));
    nodes = nodes.filter(item => !oldNodeIds.has(item.id) || keepNodeIds.has(item.id));
    lessons = upsertById(lessons,data.lessons);
    nodes = upsertById(nodes,data.nodes);
    courses = upsertById(courses,[data.course]);
    currentCourseId = data.course.id;

    save(KEYS.courses,courses);
    save(KEYS.lessons,lessons);
    save(KEYS.nodes,nodes);
    renderCourseList();
    updateCourseSaveState("saved",showMessage ? "V2 課程已儲存" : "已同步");
    return data.course;
  }

  function markCourseDirty() {
    updateCourseSaveState("dirty","有尚未儲存的變更");
  }

  function updateCourseSaveState(state,text) {
    const wrap = $("courseSaveState")?.parentElement;
    wrap?.classList.remove("dirty","saved");
    wrap?.classList.add(state);
    if ($("courseSaveState")) $("courseSaveState").textContent = text;
  }

  ["courseTitle","courseSubtitle","courseDescription"].forEach(id => $(id)?.addEventListener("input",markCourseDirty));
  ["courseAllowStudentNavigation","courseShowProgress"].forEach(id => $(id)?.addEventListener("change",markCourseDirty));

  $("addLessonBtn").addEventListener("click", () => {
    addLessonCard();
    markCourseDirty();
  });
  $("saveCourseBtn").addEventListener("click", () => saveCurrentCourse(true));
  $("startCourseSessionBtn")?.addEventListener("click",async()=>{
    saveCurrentCourse(false);
    try {
      await buildCourseSnapshot(currentCourseId);
      openTeachSession("course",currentCourseId);
    } catch (error) {
      showMiniToast(error.message || "這門課還沒準備好進入 Session");
    }
  });

  $("newCourseBtn").addEventListener("click", () => {
    saveCurrentCourse(false);
    const createdAt = nowIso();
    const course = {
      id:uuid(),title:"未命名課程",subtitle:"",description:"",
      lessonRefs:[],cover:{icon:"📚",image:""},
      settings:{allowStudentNavigation:true,showProgress:true},
      createdAt,updatedAt:createdAt
    };
    courses.unshift(course);
    currentCourseId = course.id;
    save(KEYS.courses,courses);
    renderCourseList();
    loadCourseEditor(course);
  });

  $("duplicateCourseBtn").addEventListener("click", () => {
    saveCurrentCourse(false);
    const source = resolveCourse(currentCourse());
    if (!source) return;
    const lessonIdMap = new Map();
    const nodeIdMap = new Map();
    source.lessons.forEach(lesson => {
      lessonIdMap.set(lesson.id,uuid());
      lesson.nodes.forEach(node => nodeIdMap.set(node.id,uuid()));
    });

    const copiedNodes = source.lessons.flatMap(lesson => lesson.nodes.map(node => ({
      ...structuredClone(node),
      id:nodeIdMap.get(node.id),
      createdAt:nowIso(),
      updatedAt:nowIso()
    })));
    const copiedLessons = source.lessons.map(lesson => ({
      ...structuredClone(lesson),
      id:lessonIdMap.get(lesson.id),
      nodeRefs:lesson.nodes.map(node => nodeIdMap.get(node.id)),
      createdAt:nowIso(),
      updatedAt:nowIso()
    }));
    const copiedCourse = {
      ...structuredClone(currentCourse()),
      id:uuid(),
      title:`${source.title}－副本`,
      lessonRefs:source.lessons.map(lesson => lessonIdMap.get(lesson.id)),
      createdAt:nowIso(),
      updatedAt:nowIso()
    };
    nodes.push(...copiedNodes);
    lessons.push(...copiedLessons);
    courses.unshift(copiedCourse);
    currentCourseId = copiedCourse.id;
    save(KEYS.nodes,nodes);save(KEYS.lessons,lessons);save(KEYS.courses,courses);
    renderCourseList();
    loadCourseEditor(copiedCourse);
  });

  $("deleteCourseBtn").addEventListener("click", () => {
    if (!confirm("確定要刪除這個課程架構嗎？")) return;
    const target = currentCourse();
    const lessonIds = new Set(target?.lessonRefs || []);
    const nodeIds = new Set([...lessonIds].flatMap(id => lessonById(id)?.nodeRefs || []));
    courses = courses.filter(course => course.id !== currentCourseId);
    lessons = lessons.filter(lesson => !lessonIds.has(lesson.id));
    nodes = nodes.filter(node => !nodeIds.has(node.id));

    if (!courses.length) {
      const createdAt = nowIso();
      courses = [{
        id:uuid(),title:"未命名課程",subtitle:"",description:"",lessonRefs:[],
        cover:{icon:"📚",image:""},
        settings:{allowStudentNavigation:true,showProgress:true},
        createdAt,updatedAt:createdAt
      }];
    }

    currentCourseId = courses[0].id;
    save(KEYS.courses,courses);save(KEYS.lessons,lessons);save(KEYS.nodes,nodes);
    renderCourseList();
    loadCourseEditor(currentCourse());
  });

  async function gzipCourseBytes(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  function courseBytesToBase64Url(bytes) {
    let binary = "";
    bytes.forEach(byte => binary += String.fromCharCode(byte));
    return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
  }

  async function encodeCourseSnapshot(snapshot) {
    const raw = new TextEncoder().encode(JSON.stringify(snapshot));
    if (typeof CompressionStream === "function") {
      try {
        const zipped = await gzipCourseBytes(raw);
        if (zipped.length < raw.length) return `z.${courseBytesToBase64Url(zipped)}`;
      } catch (error) {
        console.warn("課程快照壓縮失敗，改用未壓縮格式",error);
      }
    }
    return `u.${courseBytesToBase64Url(raw)}`;
  }

  function courseBase64UrlToBytes(text) {
    const normalized = text.replace(/-/g,"+").replace(/_/g,"/");
    const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
    const binary = atob(padded);
    return Uint8Array.from(binary,ch => ch.charCodeAt(0));
  }

  async function decodeCourseSnapshot(encoded) {
    if (!encoded || !encoded.includes(".")) throw new Error("課程快照格式不正確");
    const prefix = encoded.slice(0,2);
    const payload = encoded.slice(2);
    let bytes = courseBase64UrlToBytes(payload);

    if (prefix === "z.") {
      if (typeof DecompressionStream !== "function") throw new Error("目前瀏覽器無法解壓縮課程快照");
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
      bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    } else if (prefix !== "u.") {
      throw new Error("未知的課程快照格式");
    }

    const snapshot = JSON.parse(new TextDecoder().decode(bytes));
    if (snapshot?.schema !== "classroom-course-snapshot") throw new Error("不是有效的完整課程快照");
    return snapshot;
  }

  async function buildCourseSnapshot(courseId=currentCourseId) {
    if (courseId === currentCourseId) saveCurrentCourse(false);
    const course = courses.find(item => item.id === courseId);
    const resolved = resolveCourse(course);
    if (!resolved) throw new Error("找不到指定課程");
    if (!resolved.lessons.length) throw new Error("課程至少需要一個節次");
    if (!resolved.lessons.some(lesson => lesson.nodes.length)) throw new Error("課程至少需要一個教學節點");

    const workIds = new Set();
    const typeIds = new Set();
    const activityIds = new Set();

    resolved.lessons.forEach(lesson => lesson.nodes.forEach(node => {
      if (node.type === "work-wall") {
        const refs = node.content?.workRefs?.length ? node.content.workRefs : works.map(work => work.id);
        refs.forEach(id => workIds.add(id));
      } else if (node.type === "type-toolbox") {
        const refs = node.content?.typeRefs?.length ? node.content.typeRefs : types.map(type => type.id);
        refs.forEach(id => typeIds.add(id));
      } else if (node.type === "activity") {
        if (!node.content?.activityRef) throw new Error(`活動節點「${node.title}」尚未選擇活動`);
        activityIds.add(node.content.activityRef);
      }
    }));

    const activitySnapshots = [];
    for (const id of activityIds) {
      const snap = await window.ClassroomActivityAPI?.buildSessionSnapshot?.(id);
      if (!snap) throw new Error("活動模組尚未載入");
      activitySnapshots.push({
        id:snap.id,title:snap.title,subtitle:snap.subtitle,
        template:snap.template,stageCount:snap.stageCount,encoded:snap.encoded
      });
    }

    return {
      schema:"classroom-course-snapshot",
      version:1,
      createdAt:nowIso(),
      course:{
        id:course.id,title:course.title,subtitle:course.subtitle,description:course.description,
        lessonRefs:[...course.lessonRefs],cover:course.cover,
        settings:course.settings
      },
      lessons:resolved.lessons.map(lesson => ({
        id:lesson.id,title:lesson.title,shortTitle:lesson.shortTitle,goal:lesson.goal,
        nodeRefs:[...lesson.nodeRefs],estimatedMinutes:lesson.estimatedMinutes
      })),
      nodes:resolved.lessons.flatMap(lesson => lesson.nodes.map(node => ({
        id:node.id,type:node.type,title:node.title,subtitle:node.subtitle,
        content:structuredClone(node.content || {}),
        settings:structuredClone(node.settings || {}),
        navigation:structuredClone(node.navigation || {allowBack:true})
      }))),
      resources:{
        works:works.filter(work => workIds.has(work.id)).map(work => ({
          id:work.id,name:work.name,image:work.image || "",showName:work.showName !== false,intro:work.intro || ""
        })),
        types:types.filter(type => typeIds.has(type.id)).map(type => ({
          id:type.id,name:type.name,icon:type.icon || "◼",color:type.color || "#667085",
          description:type.description || "",elements:(type.elements || []).map(element => ({id:element.id,name:element.name}))
        })),
        activities:activitySnapshots
      }
    };
  }

  async function buildCourseShareUrl(courseId=currentCourseId) {
    const snapshot = await buildCourseSnapshot(courseId);
    const encoded = await encodeCourseSnapshot(snapshot);
    const url = new URL("course.html",window.location.href);
    url.hash = `data=${encoded}`;
    return url.toString();
  }

  async function previewCourse() {
    try {
      const url = await buildCourseShareUrl();
      window.open(url,"_blank","noopener");
    } catch (error) {
      showMiniToast(error.message || "無法預覽課程");
    }
  }

  async function shareCourse() {
    try {
      const course = currentCourse();
      const url = await buildCourseShareUrl();
      const dialog = $("courseShareDialog");
      const qr = $("courseQrcode");
      const notice = $("courseQrNotice");
      $("shareCourseName").textContent = course?.title || "完整課程";
      $("courseShareUrl").value = url;
      $("openCourseLink").href = url;
      qr.innerHTML = "";
      notice.classList.add("hidden");
      notice.textContent = "";

      const originWarning = typeof getShareOriginWarning === "function" ? getShareOriginWarning() : "";
      if (originWarning) {
        qr.innerHTML = `<div class="qr-environment-warning"><span>⚠️</span><strong>目前網址不能跨裝置掃描</strong></div>`;
        notice.textContent = originWarning;
        notice.classList.remove("hidden");
      } else if (url.length > 1100) {
        qr.innerHTML = `<div class="qr-environment-warning"><span>📚</span><strong>完整課程資料較多</strong></div>`;
        notice.textContent = `課程連結 ${url.length} 字元，為避免高密度 QR 掃描失敗，本版只提供連結。V2 後續 Course Session 會改用短加入碼。`;
        notice.classList.remove("hidden");
      } else if (window.QRCode) {
        const size = url.length <= 700 ? 400 : 640;
        new QRCode(qr,{text:url,width:size,height:size,correctLevel:QRCode.CorrectLevel.L});
        notice.textContent = `課程 QR 已產生 · ${url.length} 字元`;
        notice.classList.remove("hidden");
      }
      dialog.showModal();
    } catch (error) {
      showMiniToast(error.message || "無法分享課程");
    }
  }

  $("previewCourseBtn")?.addEventListener("click",previewCourse);
  $("shareCourseBtn")?.addEventListener("click",shareCourse);
  $("copyCourseUrlBtn")?.addEventListener("click",async () => {
    const input = $("courseShareUrl");
    try { await navigator.clipboard.writeText(input.value); }
    catch { input.select();document.execCommand("copy"); }
    showMiniToast("課程連結已複製");
  });

  window.ClassroomCourseAPI = {
    list:() => courses.map(course => ({
      id:course.id,title:course.title,subtitle:course.subtitle,
      lessonCount:course.lessonRefs?.length || 0
    })),
    buildSnapshot:buildCourseSnapshot,
    encodeSnapshot:encodeCourseSnapshot,
    decodeSnapshot:decodeCourseSnapshot,
    buildShareUrl:buildCourseShareUrl,
    resolve:courseId => resolveCourse(courses.find(course => course.id === courseId))
  };

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

  window.addEventListener("beforeunload", () => {
    const activeView = document.querySelector(".workspace-tab.active")?.dataset.view || "";
    try {
      if (activeView === "courses") saveCurrentCourse(false);
      else if (activeView === "types") saveCurrentType(false);
      else if (activeView === "works") saveCurrentWork(false);
      else if (activeView === "activities") window.ClassroomActivityEditor?.saveCurrent?.(false);
    } catch {}
  });

  // Initial rendering
  renderCourseList(); loadCourseEditor(currentCourse());
  renderTypeList(); loadTypeEditor(types.find(t=>t.id===currentTypeId));
  renderWorkList(); loadWorkEditor(works.find(w=>w.id===currentWorkId));

  applyWorkflowShell(currentWorkflow);
  switchView(currentWorkflow === "teach" ? "sessions" : lastPrepareView,{syncWorkflow:false});
})();

