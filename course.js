let courseSnapshot = null;
let currentStepIndex = 0;
let flatSteps = [];
let completedActivityNodes = new Set();
let completedCourseNodes = new Set();
let courseSessionMode = false;
let presentationMode = false;
let courseSessionPollTimer = null;
let courseSessionRealtime = null;
let lastCourseRevision = 0;
let presentationSessionId = "";
let presentationChannel = null;
let presentationView = "content";
let presentationSummary = null;
let presentationStatus = "active";

const $ = id => document.getElementById(id);

function hashParams() {
  return new URLSearchParams(window.location.hash.replace(/^#/,""));
}

function participantContext() {
  return window.ClassroomSessionAPI?.getParticipantContext?.() || null;
}

function presentationChannelName(sessionId) {
  return `classroom-course-presentation:${sessionId}`;
}

function presentationStorageKey(sessionId) {
  return `classroom-course-presentation-state:${sessionId}`;
}

function activityTemplateLabel(mode) {
  if (mode === "element-type") return "要素 → 類型";
  if (mode === "progressive-reveal") return "逐層揭露";
  if (mode === "open-classification") return "開放分類";
  if (mode === "open-tags") return "開放式討論";
  return mode ? "探索式揭密" : "互動活動";
}

function setPresentationView(view) {
  presentationView = view === "results" ? "results" : "content";
  if (!presentationMode) return;
  document.body.classList.toggle("presentation-results-view",presentationView === "results");
  document.body.classList.toggle("presentation-content-view",presentationView !== "results");
  $("coursePresentationResults")?.classList.toggle("hidden",presentationView !== "results");
  if ($("coursePresentationViewLabel")) {
    $("coursePresentationViewLabel").textContent = presentationView === "results"
      ? "教師投影 · 全班結果"
      : "教師投影 · 教材畫面";
  }
}

function renderPresentationResults(summary = presentationSummary) {
  if (!presentationMode || !summary) return;

  const step = flatSteps[currentStepIndex];
  const nodeType = step?.node?.type || "content";
  const activityMode = summary.activityMode || "";
  const participantCount = Number(summary.participantCount || 0);
  const completedCount = Number(summary.completedCount || 0);
  const submittedCount = Number(summary.submittedCount || 0);

  $("presentationResultsTitle").textContent = step?.node?.title || "全班結果";
  $("presentationResultsSubtitle").textContent =
    `${step?.lesson?.shortTitle || step?.lesson?.title || ""} · 匿名全班統計`;
  $("presentationResultsPhase").textContent = summary.phaseLabel || "即時";

  const metrics = [];
  metrics.push({
    label:"完成目前步驟",
    value:`${completedCount} / ${participantCount}`,
    note:participantCount ? `${Math.round((completedCount/participantCount)*100)}%` : "尚無學生加入"
  });
  if (nodeType === "activity") {
    metrics.push({
      label:"本階段已提交",
      value:`${submittedCount} / ${participantCount}`,
      note:activityTemplateLabel(activityMode)
    });
  }
  if (activityMode === "open-classification" && Number(summary.changedCount || 0) + Number(summary.unchangedCount || 0) > 0) {
    metrics.push({
      label:"改變判斷",
      value:String(summary.changedCount || 0),
      note:`維持原判斷 ${summary.unchangedCount || 0} 人`
    });
  }

  $("presentationResultMetrics").innerHTML = metrics.map(item=>`
    <article class="presentation-result-metric">
      <span>${escapeHtml(item.label)}</span>
      <strong>${escapeHtml(item.value)}</strong>
      <small>${escapeHtml(item.note)}</small>
    </article>`).join("");

  const distribution = Array.isArray(summary.distribution) ? summary.distribution : [];
  const section = $("presentationDistributionSection");
  const list = $("presentationDistributionList");
  const empty = $("presentationResultsEmpty");

  if (distribution.length) {
    const max = Math.max(...distribution.map(item=>Number(item.count)||0),1);
    list.innerHTML = distribution.map(item=>`
      <div class="presentation-distribution-row">
        <span>${escapeHtml(item.name)}</span>
        <div class="presentation-distribution-bar"><i style="width:${Math.max(5,((Number(item.count)||0)/max)*100)}%"></i></div>
        <strong>${Number(item.count)||0}</strong>
      </div>`).join("");
    $("presentationDistributionTotal").textContent = `共 ${submittedCount} 份提交`;
    section.classList.remove("hidden");
    empty.classList.add("hidden");
  } else {
    list.innerHTML = "";
    section.classList.add("hidden");
    empty.textContent = nodeType === "activity"
      ? (submittedCount ? "目前活動沒有適合公開的分類分布，但提交進度已更新。" : "目前還沒有學生提交這個階段。")
      : "這個節點以完成進度為主，不顯示個別學生資料。";
    empty.classList.remove("hidden");
  }
}

function applyPresentationState(payload) {
  if (!presentationMode || !payload || payload.type !== "classroom:presentation-state") return;
  if (presentationSessionId && payload.sessionId !== presentationSessionId) return;

  presentationStatus = payload.status || "active";
  presentationSummary = {
    ...(payload.summary || {}),
    activityMode:payload.activityMode || ""
  };

  const targetIndex = flatSteps.findIndex(step=>step.node.id === payload.currentNodeRef);
  if (targetIndex >= 0 && targetIndex !== currentStepIndex) {
    currentStepIndex = targetIndex;
  }

  setPresentationView(payload.view);
  renderCurrentStep();
  renderPresentationResults(presentationSummary);

  if ($("coursePresentationSyncLabel")) {
    $("coursePresentationSyncLabel").textContent = presentationStatus === "closed"
      ? "Session 已結束"
      : `已同步 · revision ${payload.revision || 1}`;
  }
}

function startPresentationSync() {
  if (!presentationMode || !presentationSessionId) return;

  try {
    const stored = localStorage.getItem(presentationStorageKey(presentationSessionId));
    if (stored) applyPresentationState(JSON.parse(stored));
  } catch {}

  if (typeof BroadcastChannel === "function") {
    presentationChannel = new BroadcastChannel(presentationChannelName(presentationSessionId));
    presentationChannel.addEventListener("message",event=>applyPresentationState(event.data));
    presentationChannel.postMessage({
      type:"classroom:presentation-ready",
      sessionId:presentationSessionId
    });
  }

  window.addEventListener("storage",event=>{
    if (event.key !== presentationStorageKey(presentationSessionId) || !event.newValue) return;
    try { applyPresentationState(JSON.parse(event.newValue)); } catch {}
  });
}

function base64UrlToBytes(text) {
  const normalized = text.replace(/-/g,"+").replace(/_/g,"/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function decodeCourseSnapshot(value) {
  if (!value || !value.includes(".")) throw new Error("missing-data");
  const [prefix,payload] = [value.slice(0,2),value.slice(2)];
  const bytes = base64UrlToBytes(payload);
  let rawBytes = bytes;

  if (prefix === "z.") {
    if (typeof DecompressionStream !== "function") throw new Error("unsupported-compression");
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    rawBytes = new Uint8Array(await new Response(stream).arrayBuffer());
  } else if (prefix !== "u.") {
    throw new Error("unknown-format");
  }

  const snapshot = JSON.parse(new TextDecoder().decode(rawBytes));
  if (snapshot?.schema !== "classroom-course-snapshot" || !snapshot.course) {
    throw new Error("invalid-course");
  }
  return snapshot;
}

function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, ch => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  })[ch]);
}

function lessonMap() {
  return new Map((courseSnapshot?.lessons || []).map(item => [item.id,item]));
}
function nodeMap() {
  return new Map((courseSnapshot?.nodes || []).map(item => [item.id,item]));
}
function workMap() {
  return new Map((courseSnapshot?.resources?.works || []).map(item => [item.id,item]));
}
function typeMap() {
  return new Map((courseSnapshot?.resources?.types || []).map(item => [item.id,item]));
}
function activityMap() {
  return new Map((courseSnapshot?.resources?.activities || []).map(item => [item.id,item]));
}

function buildFlatSteps() {
  const lessons = lessonMap();
  const nodes = nodeMap();
  flatSteps = [];
  (courseSnapshot.course.lessonRefs || []).forEach((lessonRef,lessonIndex) => {
    const lesson = lessons.get(lessonRef);
    if (!lesson) return;
    (lesson.nodeRefs || []).forEach((nodeRef,nodeIndex) => {
      const node = nodes.get(nodeRef);
      if (!node) return;
      flatSteps.push({lesson,node,lessonIndex,nodeIndex});
    });
  });
}

function nodeTypeLabel(type) {
  if (type === "work-wall") return "WORK WALL";
  if (type === "type-toolbox") return "TYPE TOOLBOX";
  if (type === "activity") return "ACTIVITY";
  return "CONTENT";
}

function renderContentNode(node,container) {
  const body = node.content?.body || "";
  const emphasis = node.content?.emphasis || "";
  const image = node.content?.image || "";

  const wrap = document.createElement("div");
  wrap.className = "course-content-node";
  if (image) {
    const img = document.createElement("img");
    img.className = "course-content-image";
    img.src = image;
    img.alt = "";
    wrap.appendChild(img);
  }
  if (body) {
    const p = document.createElement("div");
    p.className = "course-content-body";
    p.textContent = body;
    wrap.appendChild(p);
  }
  if (emphasis) {
    const strong = document.createElement("div");
    strong.className = "course-content-emphasis";
    strong.textContent = emphasis;
    wrap.appendChild(strong);
  }
  if (!body && !image && !emphasis) {
    wrap.innerHTML = '<p class="subtle">這個內容頁目前沒有額外文字。</p>';
  }
  container.appendChild(wrap);
}

function renderWorkWall(node,container) {
  const map = workMap();
  const refs = node.content?.workRefs?.length ? node.content.workRefs : [...map.keys()];
  const grid = document.createElement("div");
  grid.className = "course-work-grid";

  refs.map(id => map.get(id)).filter(Boolean).forEach(work => {
    const card = document.createElement("article");
    card.className = "course-work-card";
    const image = work.image ? `<div class="course-work-image"><img src="${escapeHtml(work.image)}" alt="" /></div>` : `<div class="course-work-placeholder">📖</div>`;
    card.innerHTML = `
      ${image}
      <div class="course-work-copy">
        ${work.showName !== false ? `<h3>${escapeHtml(work.name)}</h3>` : ""}
        ${work.intro ? `<p>${escapeHtml(work.intro)}</p>` : ""}
      </div>`;
    grid.appendChild(card);
  });

  if (!grid.children.length) grid.innerHTML = '<p class="subtle">目前沒有可顯示的作品。</p>';
  container.appendChild(grid);
}

function renderTypeToolbox(node,container) {
  const map = typeMap();
  const refs = node.content?.typeRefs?.length ? node.content.typeRefs : [...map.keys()];
  const grid = document.createElement("div");
  grid.className = "course-type-grid";

  refs.map(id => map.get(id)).filter(Boolean).forEach(type => {
    const card = document.createElement("article");
    card.className = "course-type-card";
    card.style.setProperty("--type-accent",type.color || "#667085");
    card.innerHTML = `
      <div class="course-type-head">
        <span>${escapeHtml(type.icon || "◼")}</span>
        <h3>${escapeHtml(type.name)}</h3>
      </div>
      ${type.description ? `<p>${escapeHtml(type.description)}</p>` : ""}
      <div class="course-type-elements">
        ${(type.elements || []).map(element => `<span>${escapeHtml(element.name)}</span>`).join("")}
      </div>`;
    grid.appendChild(card);
  });

  if (!grid.children.length) grid.innerHTML = '<p class="subtle">目前沒有可顯示的類型。</p>';
  container.appendChild(grid);
}

function renderActivityNode(node,container) {
  const activity = activityMap().get(node.content?.activityRef);
  if (!activity) {
    container.innerHTML = '<div class="course-inline-error">⚠️ 這個活動已不存在，請通知老師更新課程。</div>';
    return;
  }

  if (presentationMode) {
    const stage = document.createElement("div");
    stage.className = "presentation-activity-stage";
    stage.innerHTML = `
      <div class="presentation-activity-icon">🧩</div>
      <span class="section-kicker">INTERACTIVE ACTIVITY</span>
      <h3>${escapeHtml(activity.title || node.title || "互動活動")}</h3>
      ${activity.subtitle ? `<p>${escapeHtml(activity.subtitle)}</p>` : ""}
      <strong>${escapeHtml(activityTemplateLabel(activity.template))}</strong>
      <small>請同學在自己的裝置完成作答；需要看全班狀況時，老師可切換到「全班結果」。</small>`;
    container.appendChild(stage);
    return;
  }

  const frame = document.createElement("iframe");
  frame.className = "course-activity-frame";
  frame.title = activity.title || "課堂活動";
  frame.dataset.activityId = activity.id;
  frame.src = `play.html#data=${encodeURIComponent(activity.encoded)}&embedded=1${courseSessionMode ? "&session=1" : ""}`;
  frame.setAttribute("loading","eager");
  container.appendChild(frame);
}

function renderLessonIntro(step) {
  const box = $("courseLessonIntro");
  const lesson = step.lesson;
  if (!lesson.goal) {
    box.classList.add("hidden");
    return;
  }
  $("courseLessonTitle").textContent = lesson.title || "";
  $("courseLessonGoal").textContent = lesson.goal || "";
  box.classList.remove("hidden");
}

function renderCurrentStep() {
  const step = flatSteps[currentStepIndex];
  if (!step) {
    showCourseComplete();
    return;
  }

  const {lesson,node} = step;
  $("courseLessonLabel").textContent = lesson.shortTitle || lesson.title || `第 ${step.lessonIndex + 1} 節`;
  $("courseStepCounter").textContent = `${currentStepIndex + 1} / ${flatSteps.length}`;
  $("courseProgressBar").style.width = `${Math.round(((currentStepIndex + 1) / flatSteps.length) * 100)}%`;
  $("courseProgressWrap").classList.toggle("hidden",courseSnapshot.course.settings?.showProgress === false);

  renderLessonIntro(step);
  $("courseNodeKicker").textContent = nodeTypeLabel(node.type);
  $("courseNodeTitle").textContent = node.title || "教學節點";
  $("courseNodeSubtitle").textContent = node.subtitle || "";
  $("courseNodeSubtitle").classList.toggle("hidden",!node.subtitle);

  const content = $("courseNodeContent");
  content.innerHTML = "";

  if (node.type === "work-wall") renderWorkWall(node,content);
  else if (node.type === "type-toolbox") renderTypeToolbox(node,content);
  else if (node.type === "activity") renderActivityNode(node,content);
  else renderContentNode(node,content);

  const isActivity = node.type === "activity";
  const activityDone = completedActivityNodes.has(node.id);
  const courseDone = completedCourseNodes.has(node.id);
  const completed = courseSessionMode ? courseDone : activityDone;

  $("courseNodeStatus").textContent = courseSessionMode
    ? (completed ? "已完成 · 等待老師" : (isActivity ? "進行活動" : "學習中"))
    : (isActivity ? (activityDone ? "已完成" : "進行活動") : "閱讀中");

  const previous = $("coursePrevBtn");
  const next = $("courseNextBtn");
  const wait = $("courseActivityWait");

  if (presentationMode) {
    previous.classList.add("hidden");
    next.classList.add("hidden");
    wait.classList.add("hidden");
  } else if (courseSessionMode) {
    previous.classList.add("hidden");
    next.classList.remove("hidden");
    if (isActivity) {
      next.textContent = completed ? "✓ 活動已完成" : "完成活動後自動回報";
      next.disabled = true;
    } else {
      next.textContent = completed ? "✓ 已完成，等待老師" : "✓ 我完成這一步";
      next.disabled = completed;
    }
    wait.textContent = completed
      ? "已完成這一步，等待老師切換到下一個節點…"
      : (isActivity ? "完成活動後會自動回報老師。" : "完成閱讀／觀察後，按右側按鈕回報老師。");
    wait.classList.remove("hidden");
  } else {
    previous.classList.remove("hidden");
    next.classList.remove("hidden");
    previous.textContent = node.navigation?.previousLabel || "← 上一步";
    next.textContent = node.navigation?.nextLabel || (currentStepIndex === flatSteps.length - 1 ? "完成課程 ✓" : "下一步 →");
    previous.disabled = currentStepIndex === 0 || node.navigation?.allowBack === false;
    next.disabled = isActivity && !activityDone;
    wait.classList.toggle("hidden",!isActivity || activityDone);
  }

  if (presentationMode && presentationSummary) {
    renderPresentationResults(presentationSummary);
  }
  window.scrollTo({top:0,behavior:"auto"});
}

async function markCurrentCourseNodeComplete() {
  const step = flatSteps[currentStepIndex];
  if (!courseSessionMode || !step || completedCourseNodes.has(step.node.id)) return;
  try {
    await window.ClassroomSessionAPI?.submitCourseProgress?.(step.node.id,"completed");
    completedCourseNodes.add(step.node.id);
    renderCurrentStep();
  } catch (error) {
    console.error("課程進度回報失敗",error);
    $("courseActivityWait").textContent = "進度暫時無法回傳，請稍後再試。";
  }
}

async function goNext() {
  const step = flatSteps[currentStepIndex];
  if (!step) return;

  if (courseSessionMode) {
    if (step.node.type !== "activity") await markCurrentCourseNodeComplete();
    return;
  }

  if (step.node.type === "activity" && !completedActivityNodes.has(step.node.id)) return;
  if (currentStepIndex >= flatSteps.length - 1) {
    showCourseComplete();
    return;
  }
  currentStepIndex += 1;
  renderCurrentStep();
}

function goPrevious() {
  if (courseSessionMode || presentationMode) return;
  const step = flatSteps[currentStepIndex];
  if (!step || currentStepIndex === 0 || step.node.navigation?.allowBack === false) return;
  currentStepIndex -= 1;
  renderCurrentStep();
}

async function syncCourseSessionState(initial = false) {
  if (!courseSessionMode || !window.ClassroomSessionAPI?.studentState) return;
  try {
    const state = await window.ClassroomSessionAPI.studentState();
    if (state.session_kind && state.session_kind !== "course") return;

    completedCourseNodes = new Set(
      (state.progress || [])
        .filter(item => item.status === "completed")
        .map(item => item.node_ref)
    );

    const contextPatch = {
      currentNodeRef:state.current_node_ref || "",
      revision:state.revision || lastCourseRevision || 1,
      currentStage:state.current_stage || 1,
      stageCount:state.stage_count || 1
    };
    window.ClassroomSessionAPI.updateParticipantContext?.(contextPatch);

    if (state.status === "closed") {
      clearInterval(courseSessionPollTimer);
      try { courseSessionRealtime?.close?.(); } catch {}
      courseSessionRealtime = null;
      setCourseRealtimeStatus("closed");
      showCourseComplete(true);
      return;
    }

    const targetIndex = flatSteps.findIndex(step => step.node.id === state.current_node_ref);
    const revisionChanged = Number(state.revision || 0) !== Number(lastCourseRevision || 0);
    if (targetIndex >= 0 && (targetIndex !== currentStepIndex || revisionChanged || initial)) {
      currentStepIndex = targetIndex;
      lastCourseRevision = Number(state.revision || 0);
      renderCurrentStep();
    } else {
      renderCurrentStep();
    }
  } catch (error) {
    console.warn("同步完整課程進度失敗",error);
  }
}

function setCourseRealtimeStatus(status, detail = "") {
  const badge = $("courseRealtimeStatus");
  if (!badge || !courseSessionMode) return;
  badge.className = "student-realtime-status";

  const context = participantContext();
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

function startCourseSessionPolling(intervalMs = 2200) {
  clearInterval(courseSessionPollTimer);
  courseSessionPollTimer = setInterval(
    () => syncCourseSessionState(false),
    Math.max(1800,Number(intervalMs)||2200)
  );
}

function stopCourseSessionRealtime() {
  try { courseSessionRealtime?.close?.(); } catch {}
  courseSessionRealtime = null;
}

function startCourseSessionSync() {
  stopCourseSessionRealtime();
  const context = participantContext();

  if (context?.mode !== "cloud" || !window.ClassroomSessionAPI?.subscribeRealtime) {
    setCourseRealtimeStatus("local");
    startCourseSessionPolling(2200);
    return;
  }

  courseSessionRealtime = window.ClassroomSessionAPI.subscribeRealtime(context.sessionId,{
    config:context.cloudConfig,
    onEvent:()=>syncCourseSessionState(false),
    onStatus:(status,detail)=>{
      setCourseRealtimeStatus(status,detail);
      if (status === "closed") {
        clearInterval(courseSessionPollTimer);
        return;
      }
      startCourseSessionPolling(status === "connected" ? 12000 : 2200);
    }
  });
}

function showCourseComplete(sessionClosed = false) {
  $("coursePlayerState").classList.add("hidden");
  $("courseCompleteState").classList.remove("hidden");
  $("courseCompleteText").textContent = sessionClosed
    ? `老師已結束「${courseSnapshot?.course?.title || "這門課"}」的課堂 Session。`
    : `你已完成「${courseSnapshot?.course?.title || "這門課"}」的所有步驟。`;
  $("courseRestartBtn").classList.toggle("hidden",courseSessionMode);
}

function restartCourse() {
  if (courseSessionMode) return;
  currentStepIndex = 0;
  completedActivityNodes.clear();
  $("courseCompleteState").classList.add("hidden");
  $("coursePlayerState").classList.remove("hidden");
  renderCurrentStep();
}

async function loadCourse() {
  try {
    const params = hashParams();
    const data = params.get("data");
    if (!data) throw new Error("missing-data");

    courseSnapshot = await decodeCourseSnapshot(data);
    buildFlatSteps();
    if (!flatSteps.length) throw new Error("empty-course");

    const context = participantContext();
    courseSessionMode = params.get("session") === "1" && context?.sessionKind === "course";
    presentationMode = params.get("present") === "1";

    if (presentationMode) {
      document.body.classList.add("teacher-course-presentation");
      presentationSessionId = params.get("presentationSession") || "";
      presentationView = params.get("view") === "results" ? "results" : "content";
      const requestedNode = params.get("node");
      const requestedIndex = flatSteps.findIndex(step => step.node.id === requestedNode);
      if (requestedIndex >= 0) currentStepIndex = requestedIndex;
      const badge = $("coursePresentationBadge");
      badge?.classList.remove("hidden");
      setPresentationView(presentationView);
    }

    if (courseSessionMode) {
      document.body.classList.add("course-session-player");
      const targetIndex = flatSteps.findIndex(step => step.node.id === context.currentNodeRef);
      if (targetIndex >= 0) currentStepIndex = targetIndex;
      lastCourseRevision = Number(context.revision || 0);
      const badge = $("courseSessionBadge");
      badge.textContent = `📡 已加入完整課程 · ${context.studentCode}`;
      badge.classList.remove("hidden");
    }

    $("coursePlayerTitle").textContent = courseSnapshot.course.title || "完整課程";
    $("coursePlayerSubtitle").textContent = courseSnapshot.course.subtitle || courseSnapshot.course.description || "";
    $("courseCoverIcon").textContent = courseSnapshot.course.cover?.icon || "📚";
    document.title = `${courseSnapshot.course.title || "完整課程"}｜課堂互動工具`;

    $("courseLoadingState").classList.add("hidden");
    $("coursePlayerState").classList.remove("hidden");

    if (courseSessionMode) {
      await syncCourseSessionState(true);
      startCourseSessionSync();
    } else {
      renderCurrentStep();
      if (presentationMode) startPresentationSync();
    }
  } catch (error) {
    console.error("課程載入失敗",error);
    $("courseLoadingState").classList.add("hidden");
    $("courseErrorText").textContent = error.message === "empty-course"
      ? "這門課目前還沒有可播放的教學節點。"
      : "課程資料無法讀取，請重新開啟老師提供的連結。";
    $("courseErrorState").classList.remove("hidden");
  }
}

window.addEventListener("message",event => {
  if (event.data?.type !== "classroom:activity-complete") return;

  const step = flatSteps[currentStepIndex];
  if (!step || step.node.type !== "activity") return;

  const frame = document.querySelector(".course-activity-frame");
  const expectedActivityId = step.node.content?.activityRef || "";
  if (!frame || event.source !== frame.contentWindow) return;
  if (!expectedActivityId || event.data.activityId !== expectedActivityId) return;

  completedActivityNodes.add(step.node.id);
  if (courseSessionMode) {
    markCurrentCourseNodeComplete();
  } else {
    $("courseNodeStatus").textContent = "已完成";
    $("courseActivityWait").classList.add("hidden");
    $("courseNextBtn").disabled = false;
  }
});

$("coursePrevBtn").addEventListener("click",goPrevious);
$("courseNextBtn").addEventListener("click",goNext);
$("courseRestartBtn").addEventListener("click",restartCourse);

window.addEventListener("beforeunload",()=>{
  clearInterval(courseSessionPollTimer);
  stopCourseSessionRealtime();
});

loadCourse();
