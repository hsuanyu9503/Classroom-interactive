/* V2.7.2 | Teacher Session / History / Summary / Presentation */
/* ----- Classroom Session Manager V2.4 ----- */
(() => {
  const $ = id => document.getElementById(id);
  let activeSession = null;
  let refreshTimer = null;
  let sessionRealtime = null;
  let realtimeRefreshTimer = null;
  let activeCourseSnapshot = null;
  let latestTeacherSnapshot = null;
  let presentationWindow = null;
  let presentationChannel = null;
  let presentationChannelSessionId = "";
  let presentationView = "content";

  function setTeacherRealtimeStatus(status, detail = "") {
    const badge = $("sessionRealtimeStatus");
    if (!badge) return;
    badge.className = "realtime-status";

    if (!activeSession || activeSession.mode !== "cloud") {
      badge.classList.add("local");
      badge.textContent = "🧪 本機同步";
      badge.title = "";
      return;
    }

    if (status === "connected") {
      badge.classList.add("live");
      badge.textContent = "⚡ Realtime 即時同步";
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
  }

  function scheduleTeacherPolling(intervalMs = 3000) {
    clearInterval(refreshTimer);
    if (!activeSession || activeSession.status === "closed") return;
    refreshTimer = setInterval(()=>{
      const active = document.querySelector('[data-workspace-view="sessions"]')?.classList.contains("active");
      if (activeSession && active && activeSession.status !== "closed") refreshActiveSession(true);
    },Math.max(2200,Number(intervalMs)||3000));
  }

  function stopSessionRealtime() {
    clearTimeout(realtimeRefreshTimer);
    realtimeRefreshTimer = null;
    try { sessionRealtime?.close?.(); } catch {}
    sessionRealtime = null;
  }

  function queueRealtimeTeacherRefresh() {
    clearTimeout(realtimeRefreshTimer);
    realtimeRefreshTimer = setTimeout(()=>{
      const active = document.querySelector('[data-workspace-view="sessions"]')?.classList.contains("active");
      if (activeSession && active && activeSession.status !== "closed") refreshActiveSession(true);
    },80);
  }

  function startSessionRealtime() {
    stopSessionRealtime();

    if (!activeSession || activeSession.status === "closed") {
      setTeacherRealtimeStatus("closed");
      clearInterval(refreshTimer);
      return;
    }

    if (activeSession.mode !== "cloud" || !window.ClassroomSessionAPI?.subscribeRealtime) {
      setTeacherRealtimeStatus("local");
      scheduleTeacherPolling(3000);
      return;
    }

    sessionRealtime = window.ClassroomSessionAPI.subscribeRealtime(activeSession.id,{
      onEvent:queueRealtimeTeacherRefresh,
      onStatus:(status,detail)=>{
        setTeacherRealtimeStatus(status,detail);
        scheduleTeacherPolling(status === "connected" ? 12000 : 3000);
      }
    });
  }

  function presentationChannelName(sessionId) {
    return `classroom-course-presentation:${sessionId}`;
  }

  function presentationStorageKey(sessionId) {
    return `classroom-course-presentation-state:${sessionId}`;
  }

  function updatePresentationControls() {
    const contentBtn = $("presentationContentBtn");
    const resultsBtn = $("presentationResultsBtn");
    if (contentBtn) contentBtn.classList.toggle("active",presentationView === "content");
    if (resultsBtn) resultsBtn.classList.toggle("active",presentationView === "results");

    const state = $("presentationSyncState");
    if (!state) return;
    const live = Boolean(presentationWindow && !presentationWindow.closed);
    state.classList.toggle("live",live);
    state.textContent = live
      ? `● 投影同步中 · ${presentationView === "results" ? "全班結果" : "教材畫面"}`
      : (presentationWindow?.closed ? "投影視窗已關閉" : "尚未開啟投影");
  }

  function ensurePresentationChannel() {
    if (!activeSession?.id || activeSession.sessionKind !== "course") return null;
    if (presentationChannel && presentationChannelSessionId === activeSession.id) return presentationChannel;

    try { presentationChannel?.close?.(); } catch {}
    presentationChannel = null;
    presentationChannelSessionId = activeSession.id;

    if (typeof BroadcastChannel === "function") {
      presentationChannel = new BroadcastChannel(presentationChannelName(activeSession.id));
      presentationChannel.addEventListener("message",event=>{
        if (event.data?.type === "classroom:presentation-ready") {
          publishPresentationState();
        }
      });
    }
    return presentationChannel;
  }

  function currentCourseResponses(snapshot) {
    const all = snapshot?.responses || [];
    if (activeSession?.sessionKind !== "course") return all;
    return all.filter(item => item.node_ref === activeSession.currentNodeRef);
  }

  function buildPresentationSummary(snapshot) {
    const participants = Number(snapshot?.participant_count || 0);
    const progress = snapshot?.progress || [];
    const responses = currentCourseResponses(snapshot);
    const completedCount = new Set(
      progress
        .filter(item => item.node_ref === activeSession.currentNodeRef && item.status === "completed")
        .map(item => item.participant_id)
    ).size;

    let relevant = responses;
    let phaseLabel = "節點完成進度";
    if (activeSession.activityMode === "progressive-reveal") {
      const stage = Math.max(1,Number(activeSession.currentStage)||1);
      relevant = responses.filter(item => item.mode === "progressive-reveal" && item.stage_key === `clue-${stage}`);
      phaseLabel = `線索 ${stage} / ${Math.max(1,Number(activeSession.stageCount)||1)}`;
    } else if (activeSession.activityMode === "open-classification") {
      const finalPhase = Number(activeSession.currentStage || 1) >= 2;
      const key = finalPhase ? "final" : "initial";
      relevant = responses.filter(item => item.mode === "open-classification" && item.stage_key === key);
      phaseLabel = finalPhase ? "重新判斷" : "初次判斷";
    } else if (activeSession.activityMode) {
      phaseLabel = activityModeLabel(activeSession.activityMode);
    }

    const submittedCount = new Set(relevant.map(item=>item.participant_id)).size;
    const counts = new Map();
    relevant.forEach(item=>{
      const name = item.payload?.selectedTypeName || item.selected_type || "";
      if (!name) return;
      counts.set(name,(counts.get(name)||0)+1);
    });
    const distribution = [...counts.entries()]
      .map(([name,count])=>({name,count}))
      .sort((a,b)=>b.count-a.count || a.name.localeCompare(b.name,"zh-Hant"));

    const showChangeSummary = activeSession.activityMode === "open-classification"
      && Number(activeSession.currentStage || 1) >= 2;
    const finalResponses = showChangeSummary
      ? responses.filter(item => item.mode === "open-classification" && item.stage_key === "final")
      : [];
    const changedCount = finalResponses.filter(item=>Boolean(item.payload?.changed)).length;
    const unchangedCount = finalResponses.length - changedCount;

    return {
      participantCount:participants,
      completedCount,
      submittedCount,
      phaseLabel,
      distribution,
      changedCount,
      unchangedCount
    };
  }

  async function buildPresentationPayload(snapshot = latestTeacherSnapshot) {
    if (!activeSession || activeSession.sessionKind !== "course") return null;
    const course = await ensureActiveCourseSnapshot();
    const steps = flattenCourseSnapshot(course);
    const current = steps.find(step=>step.node.id === activeSession.currentNodeRef) || steps[0];
    return {
      type:"classroom:presentation-state",
      sessionId:activeSession.id,
      revision:Number(activeSession.revision || 1),
      status:activeSession.status || "active",
      view:presentationView,
      currentNodeRef:activeSession.currentNodeRef || current?.node?.id || "",
      lessonTitle:current?.lesson?.shortTitle || current?.lesson?.title || "",
      nodeTitle:current?.node?.title || "",
      nodeType:current?.node?.type || "content",
      activityMode:activeSession.activityMode || "",
      currentStage:Number(activeSession.currentStage || 1),
      stageCount:Number(activeSession.stageCount || 1),
      summary:buildPresentationSummary(snapshot || {})
    };
  }

  async function publishPresentationState(snapshot = latestTeacherSnapshot) {
    if (!activeSession || activeSession.sessionKind !== "course") return;
    try {
      const payload = await buildPresentationPayload(snapshot);
      if (!payload) return;
      ensurePresentationChannel()?.postMessage(payload);
      try {
        localStorage.setItem(presentationStorageKey(activeSession.id),JSON.stringify(payload));
      } catch {}
      updatePresentationControls();
    } catch (error) {
      console.warn("投影同步失敗",error);
    }
  }

  function setPresentationView(view) {
    presentationView = view === "results" ? "results" : "content";
    updatePresentationControls();
    publishPresentationState();
  }

  function activityModeLabel(mode) {
    if (mode === "element-type") return "要素 → 類型";
    if (mode === "progressive-reveal") return "逐層揭露";
    if (mode === "open-classification") return "開放分類";
    if (mode === "open-tags") return "開放式討論";
    if (!mode) return "—";
    return "探索式揭密";
  }

  function sessionKind() {
    return document.querySelector('input[name="sessionKind"]:checked')?.value || "activity";
  }

  function applySessionKindUI() {
    const kind = sessionKind();
    document.querySelectorAll(".session-kind-option").forEach(label => {
      label.classList.toggle("active", label.querySelector("input")?.checked);
    });
    $("sessionActivityField")?.classList.toggle("hidden",kind !== "activity");
    $("sessionActivityPreview")?.classList.toggle("hidden",kind !== "activity");
    $("sessionCourseField")?.classList.toggle("hidden",kind !== "course");
    $("sessionCoursePreview")?.classList.toggle("hidden",kind !== "course");
    if (kind === "course") renderCoursePreview();
    else renderActivityPreview();
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
    if (sessionKind() === "activity") renderActivityPreview();
  }

  function refreshCourseOptions() {
    const select = $("sessionCourseSelect");
    const api = window.ClassroomCourseAPI;
    if (!select || !api) return;
    const current = select.value;
    const courses = api.list();
    select.innerHTML = '<option value="">— 選擇完整課程 —</option>';
    courses.forEach(course => {
      const option = document.createElement("option");
      option.value = course.id;
      option.textContent = `${course.title}｜${course.lessonCount} 節`;
      select.appendChild(option);
    });
    if (courses.some(course => course.id === current)) select.value = current;
    else if (courses[0]) select.value = courses[0].id;
    if (sessionKind() === "course") renderCoursePreview();
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
      </div>`;
    if (!$("sessionTitleInput").value.trim() || $("sessionTitleInput").dataset.autoTitle === "1") {
      $("sessionTitleInput").value = activity.title;
      $("sessionTitleInput").dataset.autoTitle = "1";
    }
  }

  function renderCoursePreview() {
    const select = $("sessionCourseSelect");
    const preview = $("sessionCoursePreview");
    const api = window.ClassroomCourseAPI;
    if (!select || !preview || !api) return;
    const course = api.list().find(item => item.id === select.value);
    if (!course) {
      preview.innerHTML = '<div class="empty-v15">目前沒有可以開啟 Session 的完整課程。</div>';
      return;
    }
    const resolved = api.resolve(course.id);
    const nodeCount = (resolved?.lessons || []).reduce((sum,lesson)=>sum+(lesson.nodes?.length||0),0);
    preview.innerHTML = `
      <div class="session-preview-icon">📚</div>
      <div>
        <strong>${escapeHtml(course.title)}</strong>
        <p>${escapeHtml(course.subtitle || "完整課程")}</p>
        <small>${course.lessonCount} 節 · ${nodeCount} 個教學節點 · 老師同步控制進度</small>
      </div>`;
    if (!$("sessionTitleInput").value.trim() || $("sessionTitleInput").dataset.autoTitle === "1") {
      $("sessionTitleInput").value = course.title;
      $("sessionTitleInput").dataset.autoTitle = "1";
    }
  }

  function prepareSessionSelection(kind, resourceId = "") {
    const sessionKind = kind === "course" ? "course" : "activity";
    const radio = $(sessionKind === "course" ? "sessionKindCourse" : "sessionKindActivity");
    if (radio) {
      radio.checked = true;
      radio.dispatchEvent(new Event("change",{bubbles:true}));
    }
    const select = $(sessionKind === "course" ? "sessionCourseSelect" : "sessionActivitySelect");
    if (select && resourceId && [...select.options].some(option=>option.value === resourceId)) {
      select.value = resourceId;
      select.dispatchEvent(new Event("change",{bubbles:true}));
    }
    document.querySelector(".session-config-card")?.scrollIntoView({behavior:"smooth",block:"start"});
  }

  async function openHistorySession(item) {
    if (!item) return;
    activeSession = {...item};
    activeCourseSnapshot = null;
    try {
      await renderActiveSession();
      $("activeSessionCard")?.scrollIntoView({behavior:"smooth",block:"start"});
    } catch (error) {
      showSessionToast(error.message || "無法開啟這筆 Session");
    }
  }

  async function renderTeachHome() {
    const courseList = $("teachReadyCourseList");
    const activityList = $("teachReadyActivityList");
    if (!courseList || !activityList) return;

    const courses = window.ClassroomCourseAPI?.list?.() || [];
    const activities = window.ClassroomActivityAPI?.list?.() || [];
    const history = window.ClassroomSessionAPI?.loadTeacherHistory?.() || [];
    const activeHistory = history.filter(item => item.status === "active");

    $("teachHistorySessionCount").textContent = String(history.length);
    $("teachActiveSessionCount").textContent = String(activeHistory.length);

    const latestActive = activeHistory[0];
    const continueCard = $("teachContinueCard");
    if (latestActive) {
      continueCard.classList.remove("hidden");
      $("teachContinueTitle").textContent = latestActive.title || "最近的課堂";
      $("teachContinueMeta").textContent = `${latestActive.sessionKind === "course" ? "完整課程" : "單一活動"} · ${latestActive.mode === "cloud" ? "雲端" : "本機"} · ${formatTime(latestActive.createdAt)}`;
      $("continueLatestSessionBtn").onclick = ()=>openHistorySession(latestActive);
    } else {
      continueCard.classList.add("hidden");
    }

    const courseResults = await Promise.all(courses.map(async course=>{
      try {
        const snapshot = await window.ClassroomCourseAPI.buildSnapshot(course.id);
        return {course,ready:true,nodeCount:snapshot.nodes?.length || 0};
      } catch (error) {
        return {course,ready:false,reason:error.message || "尚未完成設定"};
      }
    }));
    const readyCourseCount = courseResults.filter(item=>item.ready).length;
    $("teachReadyCourseCount").textContent = String(readyCourseCount);
    courseList.innerHTML = courseResults.length ? "" : '<div class="teach-ready-empty">還沒有課程。先到「備課 → 課程編排」建立第一門課。</div>';
    courseResults.slice(0,8).forEach(({course,ready,nodeCount,reason})=>{
      const row=document.createElement("div");
      row.className=`teach-ready-item ${ready ? "" : "unready"}`;
      row.innerHTML=`
        <div><strong>${escapeHtml(course.title || "未命名課程")}</strong><small>${ready ? `${course.lessonCount || 0} 節 · ${nodeCount} 個 Node · 可建立 Course Session` : `尚未就緒 · ${escapeHtml(reason)}`}</small></div>
        <button class="btn ${ready ? "btn-teach" : "btn-secondary"}" type="button" ${ready ? "" : "disabled"}>${ready ? "準備上課" : "尚未完成"}</button>`;
      if (ready) row.querySelector("button").addEventListener("click",()=>prepareSessionSelection("course",course.id));
      courseList.appendChild(row);
    });

    const activityResults = await Promise.all(activities.map(async activity=>{
      try {
        await window.ClassroomActivityAPI.buildSessionSnapshot(activity.id);
        return {activity,ready:true};
      } catch (error) {
        return {activity,ready:false,reason:error.message || "尚未完成設定"};
      }
    }));
    const readyActivityCount = activityResults.filter(item=>item.ready).length;
    $("teachReadyActivityCount").textContent = String(readyActivityCount);
    activityList.innerHTML = activityResults.length ? "" : '<div class="teach-ready-empty">還沒有活動。先到「備課 → 活動模板」建立互動任務。</div>';
    activityResults.slice(0,8).forEach(({activity,ready,reason})=>{
      const row=document.createElement("div");
      row.className=`teach-ready-item ${ready ? "" : "unready"}`;
      const legacy = activity.template === "open-tags" ? " · 舊版相容" : "";
      row.innerHTML=`
        <div><strong>${escapeHtml(activity.title || "未命名活動")}</strong><small>${ready ? `${activityModeLabel(activity.template)} · ${activity.taskCount || 0} 個任務${legacy}` : `尚未就緒 · ${escapeHtml(reason)}`}</small></div>
        <button class="btn ${ready ? "btn-teach" : "btn-secondary"}" type="button" ${ready ? "" : "disabled"}>${ready ? "準備上課" : "尚未完成"}</button>`;
      if (ready) row.querySelector("button").addEventListener("click",()=>prepareSessionSelection("activity",activity.id));
      activityList.appendChild(row);
    });
  }

  function renderCloudState() {
    const api = window.ClassroomSessionAPI;
    const configured = api?.isCloudConfigured?.();
    const badge = $("cloudModeBadge");
    badge.className = `cloud-mode-badge ${configured ? "cloud" : "local"}`;
    badge.textContent = configured ? "☁️ 雲端 Session" : "本機測試模式";
    $("cloudSettingsSummary").textContent = configured ? "Supabase 已設定" : "尚未設定 Supabase";
    $("sessionCreateHint").textContent = configured
      ? "學生可從不同裝置加入；完整課程 Session 會同步老師目前的 Node。"
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
      const config = api.saveConfig($("supabaseUrlInput").value,$("supabaseKeyInput").value);
      const ok = await api.testCloudConfig(config.url,config.key);
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

  function flattenCourseSnapshot(snapshot) {
    if (!snapshot) return [];
    const lessonMap = new Map((snapshot.lessons || []).map(item=>[item.id,item]));
    const nodeMap = new Map((snapshot.nodes || []).map(item=>[item.id,item]));
    const steps = [];
    (snapshot.course?.lessonRefs || []).forEach((lessonRef,lessonIndex)=>{
      const lesson = lessonMap.get(lessonRef);
      if (!lesson) return;
      (lesson.nodeRefs || []).forEach((nodeRef,nodeIndex)=>{
        const node = nodeMap.get(nodeRef);
        if (node) steps.push({lesson,node,lessonIndex,nodeIndex});
      });
    });
    return steps;
  }

  function courseNodeRuntimeMeta(snapshot,node) {
    if (!node || node.type !== "activity") return {activityMode:"",stageCount:1};
    const activity = (snapshot.resources?.activities || []).find(item=>item.id === node.content?.activityRef);
    return {
      activityMode:activity?.template || "",
      stageCount:Math.max(1,Number(activity?.stageCount)||1)
    };
  }

  async function createSession() {
    const kind = sessionKind();
    const button = $("createSessionBtn");
    button.disabled = true;
    button.textContent = "建立中…";
    try {
      if (kind === "course") {
        const courseId = $("sessionCourseSelect").value;
        if (!courseId) throw new Error("請先選擇一門完整課程");
        const snapshot = await window.ClassroomCourseAPI.buildSnapshot(courseId);
        const encoded = await window.ClassroomCourseAPI.encodeSnapshot(snapshot);
        const steps = flattenCourseSnapshot(snapshot);
        if (!steps.length) throw new Error("這門課還沒有可執行的教學節點");
        const first = steps[0];
        const runtime = courseNodeRuntimeMeta(snapshot,first.node);
        const title = $("sessionTitleInput").value.trim() || snapshot.course.title || "完整課程";
        const session = await window.ClassroomSessionAPI.createCourseSession({
          title,
          courseEncoded:encoded,
          courseId:snapshot.course.id,
          currentNodeRef:first.node.id,
          activityMode:runtime.activityMode,
          stageCount:runtime.stageCount
        });
        session.courseSnapshot = snapshot;
        activeSession = session;
        activeCourseSnapshot = snapshot;
      } else {
        const activityId = $("sessionActivitySelect").value;
        if (!activityId) throw new Error("請先選擇一個活動");
        const snapshot = await window.ClassroomActivityAPI.buildSessionSnapshot(activityId);
        const title = $("sessionTitleInput").value.trim() || snapshot.title;
        activeSession = await window.ClassroomSessionAPI.createSession({
          title,
          activityEncoded:snapshot.encoded,
          activityMode:snapshot.template,
          stageCount:snapshot.stageCount || 1
        });
        activeCourseSnapshot = null;
      }
      await renderActiveSession();
      renderHistory();
    } catch (error) {
      showSessionToast(error.message || "建立 Session 失敗");
    } finally {
      button.disabled = false;
      button.textContent = "＋ 建立課堂 Session";
    }
  }

  async function ensureActiveCourseSnapshot() {
    if (activeSession?.sessionKind !== "course") return null;
    if (activeCourseSnapshot) return activeCourseSnapshot;
    if (activeSession.courseSnapshot) {
      activeCourseSnapshot = activeSession.courseSnapshot;
      return activeCourseSnapshot;
    }
    if (activeSession.courseEncoded) {
      activeCourseSnapshot = await window.ClassroomCourseAPI.decodeSnapshot(activeSession.courseEncoded);
      return activeCourseSnapshot;
    }
    return null;
  }

  async function renderActiveSession() {
    if (!activeSession) return;
    clearInterval(refreshTimer);
    stopSessionRealtime();
    $("activeSessionCard").classList.remove("hidden");
    $("activeSessionTitle").textContent = activeSession.title;
    $("activeSessionCode").textContent = activeSession.code;
    $("activeSessionMode").textContent = activeSession.mode === "cloud" ? "☁️ 雲端 Session" : "🧪 本機測試 Session";
    $("sessionActivityMode").textContent = activeSession.sessionKind === "course"
      ? "📚 完整課程"
      : activityModeLabel(activeSession.activityMode);

    $("courseSessionControl").classList.toggle("hidden",activeSession.sessionKind !== "course");
    $("progressiveSessionControl").classList.toggle("hidden",activeSession.activityMode !== "progressive-reveal");
    $("openClassificationSessionControl").classList.toggle("hidden",activeSession.activityMode !== "open-classification");

    let joinUrl = "";
    let joinUrlError = "";
    try {
      joinUrl = window.ClassroomSessionAPI.buildJoinUrl(activeSession);
    } catch (error) {
      console.warn("Session 加入網址建立失敗",error);
      joinUrlError = error.message || "無法建立加入網址";
    }
    $("sessionJoinUrl").value = joinUrl;

    const qr = $("sessionQrCode");
    const qrNotice = $("sessionQrNotice");
    const joinHelp = $("sessionJoinHelp");
    qr.innerHTML = "";
    qr.classList.remove("session-qr-cloud","session-qr-local");
    const sessionOriginWarning = typeof getShareOriginWarning === "function" ? getShareOriginWarning() : "";

    if (joinUrlError && activeSession.mode === "cloud") {
      qr.classList.add("session-qr-local");
      qr.innerHTML = `<div class="session-local-qr-warning"><span>⚠️</span><strong>加入網址建立失敗</strong><small>請從 GitHub Pages 正式網址開啟教師端</small></div>`;
      qrNotice.textContent = joinUrlError;
    } else if (activeSession.mode !== "cloud") {
      qr.classList.add("session-qr-local");
      qr.innerHTML = `<div class="session-local-qr-warning"><span>🧪</span><strong>本機測試模式</strong><small>跨裝置 QR 尚未啟用</small></div>`;
      qrNotice.textContent = "本機 Session 只存在這個瀏覽器中；完成 Supabase 設定後才可讓學生手機掃碼加入。";
      if (joinHelp) joinHelp.textContent = "本機模式僅供同一瀏覽器驗證流程；正式上課請先完成 Supabase 雲端設定。";
    } else if (sessionOriginWarning) {
      qr.classList.add("session-qr-local");
      qr.innerHTML = `<div class="session-local-qr-warning"><span>⚠️</span><strong>目前網址不能跨裝置掃描</strong><small>請從 GitHub Pages 開啟教師端</small></div>`;
      qrNotice.textContent = sessionOriginWarning;
    } else if (joinUrl.length > QR_SAFE_MAX_LENGTH) {
      qr.classList.add("session-qr-local");
      qr.innerHTML = `<div class="session-local-qr-warning"><span>🔗</span><strong>加入網址過長</strong><small>請使用複製連結</small></div>`;
      qrNotice.textContent = `加入網址 ${joinUrl.length} 字元，超過教室掃碼建議上限。`;
    } else if (window.QRCode) {
      const size = typeof getQrRenderSize === "function" ? getQrRenderSize(joinUrl.length) : 400;
      qr.classList.add("session-qr-cloud");
      new QRCode(qr,{text:joinUrl,width:size,height:size,correctLevel:QRCode.CorrectLevel.L});
      qrNotice.textContent = `${typeof getQrQualityLabel === "function" ? getQrQualityLabel(joinUrl.length) : "學生掃碼後輸入座號即可加入。"} · 加入網址 ${joinUrl.length} 字元`;
      if (joinHelp) joinHelp.textContent = activeSession.sessionKind === "course"
        ? "學生只需要加入一次；之後完整課程會跟著老師目前的教學節點同步。"
        : "學生可掃描 QR Code，或開啟加入連結後輸入這組課堂代碼。";
    }

    await refreshActiveSession();
    startSessionRealtime();
  }

  async function refreshActiveSession(silent=false) {
    if (!activeSession) return;
    const button = $("refreshSessionBtn");
    if (!silent) button.disabled = true;
    try {
      const snapshot = await window.ClassroomSessionAPI.teacherSnapshot(activeSession);
      activeSession.status = snapshot.status || activeSession.status || "active";
      activeSession.sessionKind = snapshot.session_kind || activeSession.sessionKind || "activity";
      activeSession.activityMode = snapshot.activity_mode ?? activeSession.activityMode ?? "";
      activeSession.currentStage = snapshot.current_stage || 1;
      activeSession.stageCount = snapshot.stage_count || 1;
      activeSession.currentNodeRef = snapshot.current_node_ref || activeSession.currentNodeRef || "";
      activeSession.revision = snapshot.revision || activeSession.revision || 1;
      activeSession.courseEncoded = snapshot.course_encoded || activeSession.courseEncoded || "";
      activeSession.courseId = snapshot.course_id || activeSession.courseId || "";

      $("sessionParticipantCount").textContent = snapshot.participant_count ?? 0;
      $("sessionResponseCount").textContent = snapshot.response_count ?? 0;
      $("activeSessionStatus").textContent = activeSession.status === "active" ? "進行中" : "已結束";
      $("activeSessionStatus").classList.toggle("active",activeSession.status === "active");
      $("closeSessionBtn").disabled = activeSession.status === "closed";
      $("sessionActivityMode").textContent = activeSession.sessionKind === "course"
        ? "📚 完整課程"
        : activityModeLabel(activeSession.activityMode);

      latestTeacherSnapshot = snapshot;
      window.ClassroomSessionAPI.updateTeacherHistory?.(activeSession,snapshot);
      renderParticipants(snapshot.participants || [],snapshot.responses || [],snapshot.progress || []);
      await renderCourseControl(snapshot);
      renderProgressiveControl(snapshot);
      renderOpenClassificationControl(snapshot);
      await renderSessionSummary(snapshot);
      await publishPresentationState(snapshot);
      renderHistory();
      await renderTeachHome();

      if (activeSession.status === "closed") {
        clearInterval(refreshTimer);
        stopSessionRealtime();
        setTeacherRealtimeStatus("closed");
      }
    } catch (error) {
      showSessionToast(error.message || "更新 Session 失敗");
    } finally {
      if (!silent) button.disabled = false;
    }
  }

  function renderParticipants(participants,responses=[],progress=[]) {
    const list = $("sessionParticipantList");
    list.innerHTML = "";
    if (!participants.length) {
      list.innerHTML = '<div class="empty-v15">還沒有學生加入。</div>';
      return;
    }

    participants.slice()
      .sort((a,b)=>String(a.student_code).localeCompare(String(b.student_code),"zh-Hant",{numeric:true}))
      .forEach(participant=>{
        const row = document.createElement("div");
        row.className = "session-participant-row";
        if (activeSession?.sessionKind === "course") {
          const currentDone = progress.some(item =>
            item.participant_id === participant.id &&
            item.node_ref === activeSession.currentNodeRef &&
            item.status === "completed"
          );
          const completedTotal = new Set(
            progress.filter(item=>item.participant_id === participant.id && item.status === "completed")
              .map(item=>item.node_ref)
          ).size;
          row.innerHTML = `
            <div class="participant-seat">${escapeHtml(participant.student_code)}</div>
            <div class="participant-main">
              <strong>${currentDone ? "✓ 已完成目前步驟" : "進行中"}</strong>
              <small>加入：${formatTime(participant.joined_at)} · 已完成 ${completedTotal} 個節點</small>
            </div>
            <span class="participant-response-count">${currentDone ? "✓" : "…"}</span>`;
        } else {
          row.innerHTML = `
            <div class="participant-seat">${escapeHtml(participant.student_code)}</div>
            <div class="participant-main">
              <strong>${Number(participant.response_count || 0) > 0 ? "已作答" : "已加入"}</strong>
              <small>${participant.last_submitted_at ? `最後作答：${formatTime(participant.last_submitted_at)}` : `加入：${formatTime(participant.joined_at)}`}</small>
              ${activeSession?.activityMode === "progressive-reveal" ? `<div class="participant-judgement-history">${buildParticipantHistory(participant.id,responses)}</div>` : ""}
              ${activeSession?.activityMode === "open-classification" ? `<div class="participant-judgement-history">${buildOpenParticipantHistory(participant.id,responses)}</div>` : ""}
            </div>
            <span class="participant-response-count">${participant.response_count || 0} 筆</span>`;
        }
        list.appendChild(row);
      });
  }

  async function renderCourseControl(snapshot) {
    const panel = $("courseSessionControl");
    if (!panel || activeSession?.sessionKind !== "course") {
      panel?.classList.add("hidden");
      return;
    }
    panel.classList.remove("hidden");

    const course = await ensureActiveCourseSnapshot();
    const steps = flattenCourseSnapshot(course);
    const index = Math.max(0,steps.findIndex(step=>step.node.id === activeSession.currentNodeRef));
    const step = steps[index];
    if (!step) {
      $("courseSessionNodeTitle").textContent = "找不到目前教學節點";
      return;
    }

    const runtime = courseNodeRuntimeMeta(course,step.node);
    if (activeSession.activityMode !== runtime.activityMode || activeSession.stageCount !== runtime.stageCount) {
      activeSession.activityMode = runtime.activityMode;
      activeSession.stageCount = runtime.stageCount;
    }

    $("courseSessionNodeBadge").textContent = `${index+1} / ${steps.length}`;
    $("courseSessionNodeTitle").textContent = step.node.title || "未命名節點";
    $("courseSessionLessonTitle").textContent = `${step.lesson.shortTitle || step.lesson.title || `第 ${step.lessonIndex+1} 節`}`;
    $("courseSessionNodeMeta").textContent = `${nodeTypeLabel(step.node.type)} · revision ${activeSession.revision || 1}`;

    const completed = (snapshot.progress || []).filter(item =>
      item.node_ref === step.node.id && item.status === "completed"
    );
    const uniqueCompleted = new Set(completed.map(item=>item.participant_id)).size;
    const total = Number(snapshot.participant_count || 0);
    $("courseNodeCompletedCount").textContent = uniqueCompleted;
    $("courseNodeParticipantCount").textContent = total;
    $("courseNodeProgressBar").style.width = `${total ? Math.round((uniqueCompleted/total)*100) : 0}%`;
    $("courseNodeProgressText").textContent = total
      ? `目前 ${uniqueCompleted} / ${total} 位學生完成這一步。`
      : "還沒有學生加入。";

    $("previousCourseNodeBtn").disabled = index <= 0 || activeSession.status === "closed";
    $("nextCourseNodeBtn").disabled = index >= steps.length-1 || activeSession.status === "closed";
    $("nextCourseNodeBtn").textContent = index >= steps.length-1 ? "已到課程最後一步" : "下一步 →";
    $("openCoursePresentationBtn").disabled = activeSession.status === "closed";
    $("presentationContentBtn").disabled = activeSession.status === "closed";
    $("presentationResultsBtn").disabled = activeSession.status === "closed";
    updatePresentationControls();

    $("progressiveSessionControl").classList.toggle("hidden",activeSession.activityMode !== "progressive-reveal");
    $("openClassificationSessionControl").classList.toggle("hidden",activeSession.activityMode !== "open-classification");
  }

  function nodeTypeLabel(type) {
    if (type === "work-wall") return "作品牆";
    if (type === "type-toolbox") return "類型工具箱";
    if (type === "activity") return "互動活動";
    return "教學內容";
  }

  async function changeCourseNode(delta) {
    if (!activeSession || activeSession.sessionKind !== "course" || activeSession.status === "closed") return;
    try {
      const course = await ensureActiveCourseSnapshot();
      const steps = flattenCourseSnapshot(course);
      const currentIndex = steps.findIndex(step=>step.node.id === activeSession.currentNodeRef);
      const targetIndex = Math.max(0,Math.min((currentIndex < 0 ? 0 : currentIndex)+delta,steps.length-1));
      if (targetIndex === currentIndex || !steps[targetIndex]) return;
      const target = steps[targetIndex];
      const runtime = courseNodeRuntimeMeta(course,target.node);
      await window.ClassroomSessionAPI.setCourseNode(activeSession,target.node.id,runtime);
      await refreshActiveSession();
    } catch (error) {
      showSessionToast(error.message || "切換課程節點失敗");
    }
  }

  async function openCoursePresentation() {
    if (!activeSession || activeSession.sessionKind !== "course") return;
    try {
      if (!activeSession.courseEncoded) {
        const snapshot = await ensureActiveCourseSnapshot();
        activeSession.courseEncoded = await window.ClassroomCourseAPI.encodeSnapshot(snapshot);
      }
      ensurePresentationChannel();

      let url;
      try { url = new URL("course.html",window.location.href); }
      catch { url = new URL("course.html",document.baseURI); }
      url.hash = `data=${activeSession.courseEncoded}&present=1&presentationSession=${encodeURIComponent(activeSession.id)}&node=${encodeURIComponent(activeSession.currentNodeRef || "")}&view=${presentationView}`;

      if (presentationWindow && !presentationWindow.closed) {
        presentationWindow.location.href = url.toString();
        presentationWindow.focus();
      } else {
        presentationWindow = window.open(url.toString(),"classroom-course-presentation");
        if (!presentationWindow) throw new Error("瀏覽器阻擋了投影視窗，請允許彈出式視窗。");
      }

      updatePresentationControls();
      setTimeout(()=>publishPresentationState(),180);
    } catch (error) {
      showSessionToast(error.message || "無法開啟教師展示畫面");
    }
  }

  async function closeActiveSession() {
    if (!activeSession || activeSession.status === "closed") return;
    if (!confirm("確定要結束這個 Session 嗎？結束後學生不能再加入或提交新的作答。")) return;
    try {
      await window.ClassroomSessionAPI.closeSession(activeSession);
      await refreshActiveSession();
      renderHistory();
      showSessionToast("Session 已結束");
    } catch (error) {
      showSessionToast(error.message || "結束 Session 失敗");
    }
  }

  function stageNumberFromKey(key) {
    const match = String(key || "").match(/^clue-(\d+)$/);
    return match ? Number(match[1]) : null;
  }

  function buildParticipantHistory(participantId,responses) {
    const rows = responses
      .filter(r=>r.participant_id===participantId && r.mode==="progressive-reveal")
      .map(r=>({stage:stageNumberFromKey(r.stage_key),name:r.payload?.selectedTypeName || r.selected_type || "—"}))
      .filter(r=>r.stage).sort((a,b)=>a.stage-b.stage);
    if (!rows.length) return "尚未提交逐層判斷";
    return rows.map(row=>`<span>第${row.stage}層 ${escapeHtml(row.name)}</span>`).join('<span class="history-arrow">→</span>');
  }

  function buildOpenParticipantHistory(participantId,responses) {
    const initial = responses.find(r=>r.participant_id===participantId && r.mode==="open-classification" && r.stage_key==="initial");
    const final = responses.find(r=>r.participant_id===participantId && r.mode==="open-classification" && r.stage_key==="final");
    if (!initial) return "尚未提交初次判斷";
    const initialName = initial.payload?.selectedTypeName || initial.selected_type || "—";
    if (!final) return `<span>初次 ${escapeHtml(initialName)}</span><span class="history-arrow">→</span><span>等待重新判斷</span>`;
    const finalName = final.payload?.selectedTypeName || final.selected_type || "—";
    const reason = final.payload?.changeReason || "";
    return `<span>初次 ${escapeHtml(initialName)}</span><span class="history-arrow">→</span><span>最終 ${escapeHtml(finalName)}</span>${reason ? `<span class="open-history-reason">${escapeHtml(reason)}</span>` : ""}`;
  }

  function renderProgressiveControl(snapshot) {
    const panel = $("progressiveSessionControl");
    if (!panel || activeSession?.activityMode !== "progressive-reveal" || activeSession.status === "closed") {
      panel?.classList.add("hidden");
      return;
    }
    panel.classList.remove("hidden");
    const stage = snapshot.current_stage || 1;
    const total = snapshot.stage_count || activeSession.stageCount || 1;
    $("progressiveStageBadge").textContent = `線索 ${stage} / ${total}`;
    $("teacherCurrentClueText").textContent = `目前已公開到第 ${stage} 層線索`;
    const currentResponses = (snapshot.responses || []).filter(r=>
      r.mode==="progressive-reveal" &&
      stageNumberFromKey(r.stage_key)===stage &&
      (activeSession.sessionKind !== "course" || !r.node_ref || r.node_ref === activeSession.currentNodeRef)
    );
    $("teacherStageSubmissionText").textContent = `本層已提交 ${currentResponses.length} / ${snapshot.participant_count || 0}`;
    $("previousStageBtn").disabled = stage <= 1;
    $("nextStageBtn").disabled = stage >= total;
    $("nextStageBtn").textContent = stage >= total ? "已公開全部線索" : "公開下一條線索 →";

    const counts = new Map();
    currentResponses.forEach(r=>{
      const name = r.payload?.selectedTypeName || r.selected_type || "未命名類型";
      counts.set(name,(counts.get(name)||0)+1);
    });
    const list = $("teacherStageDistribution");
    list.innerHTML = "";
    if (!counts.size) {
      list.innerHTML = '<div class="empty-v15">這一層還沒有學生提交。</div>';
      return;
    }
    const max = Math.max(...counts.values());
    [...counts.entries()].sort((a,b)=>b[1]-a[1]).forEach(([name,count])=>{
      const row=document.createElement("div");
      row.className="stage-distribution-row";
      row.innerHTML=`<span>${escapeHtml(name)}</span><div><i style="width:${Math.max(8,(count/max)*100)}%"></i></div><strong>${count}</strong>`;
      list.appendChild(row);
    });
  }

  function renderOpenDistribution(list,responses) {
    list.innerHTML="";
    const counts=new Map();
    responses.forEach(r=>{
      const name=r.payload?.selectedTypeName || r.selected_type || "未命名類型";
      counts.set(name,(counts.get(name)||0)+1);
    });
    if (!counts.size) {
      list.innerHTML='<div class="empty-v15">這個階段還沒有學生提交。</div>';
      return;
    }
    const max=Math.max(...counts.values());
    [...counts.entries()].sort((a,b)=>b[1]-a[1]).forEach(([name,count])=>{
      const row=document.createElement("div");
      row.className="stage-distribution-row";
      row.innerHTML=`<span>${escapeHtml(name)}</span><div><i style="width:${Math.max(8,(count/max)*100)}%"></i></div><strong>${count}</strong>`;
      list.appendChild(row);
    });
  }

  function renderOpenClassificationControl(snapshot) {
    const panel=$("openClassificationSessionControl");
    if (!panel || activeSession?.activityMode !== "open-classification" || activeSession.status === "closed") {
      panel?.classList.add("hidden");
      return;
    }
    panel.classList.remove("hidden");
    const stage=Math.max(1,Math.min(Number(snapshot.current_stage)||1,Number(snapshot.stage_count)||1));
    const isRejudge=stage>=2;
    const stageKey=isRejudge?"final":"initial";
    const responses=(snapshot.responses||[]).filter(r=>
      r.mode==="open-classification" &&
      (activeSession.sessionKind !== "course" || !r.node_ref || r.node_ref === activeSession.currentNodeRef)
    );
    const current=responses.filter(r=>r.stage_key===stageKey);
    $("openClassificationPhaseBadge").textContent=isRejudge?"重新判斷":"初次判斷";
    $("openClassificationPhaseText").textContent=isRejudge
      ?"全班討論後，學生正在進行最終判斷"
      :"學生正在進行初次判斷";
    $("openClassificationSubmissionText").textContent=`本階段已提交 ${current.length} / ${snapshot.participant_count || 0}`;
    $("openPreviousPhaseBtn").disabled=stage<=1;
    $("openNextPhaseBtn").disabled=stage>=(snapshot.stage_count||1);
    $("openNextPhaseBtn").textContent=stage>=(snapshot.stage_count||1)
      ?((snapshot.stage_count||1)>1?"已開放重新判斷":"本活動只有一次判斷")
      :"開放重新判斷 →";
    renderOpenDistribution($("openClassificationDistribution"),current);

    const finals=responses.filter(r=>r.stage_key==="final");
    const summary=$("openChangeSummary");
    if (isRejudge && finals.length) {
      const changed=finals.filter(r=>Boolean(r.payload?.changed)).length;
      $("openChangedCount").textContent=changed;
      $("openUnchangedCount").textContent=finals.length-changed;
      summary.classList.remove("hidden");
    } else summary.classList.add("hidden");
  }

  async function changeOpenPhase(delta) {
    if (!activeSession || activeSession.activityMode !== "open-classification") return;
    const target=Math.max(1,Math.min((activeSession.currentStage||1)+delta,activeSession.stageCount||1));
    try {
      await window.ClassroomSessionAPI.setStage(activeSession,target);
      await refreshActiveSession();
    } catch (error) {
      showSessionToast(error.message || "更新開放分類階段失敗");
    }
  }

  async function changeStage(delta) {
    if (!activeSession || activeSession.activityMode !== "progressive-reveal") return;
    const target=Math.max(1,Math.min((activeSession.currentStage||1)+delta,activeSession.stageCount||1));
    try {
      await window.ClassroomSessionAPI.setStage(activeSession,target);
      await refreshActiveSession();
    } catch (error) {
      showSessionToast(error.message || "更新線索階段失敗");
    }
  }

  async function renderSessionSummary(snapshot) {
    const card=$("sessionSummaryCard");
    if (!card || !activeSession || !snapshot || snapshot.status !== "closed") {
      card?.classList.add("hidden");
      return;
    }

    card.classList.remove("hidden");
    $("sessionSummaryTitle").textContent = `${activeSession.title || "課堂 Session"}｜課後摘要`;
    $("sessionSummarySubtitle").textContent = `${activeSession.sessionKind === "course" ? "完整課程" : activityModeLabel(activeSession.activityMode)} · ${formatTime(activeSession.createdAt)}`;
    $("sessionSummaryStatus").textContent = "已結束";
    $("summaryParticipantCount").textContent = String(snapshot.participant_count || 0);
    $("summaryResponseCount").textContent = String(snapshot.response_count || 0);

    const participants = Number(snapshot.participant_count || 0);
    const details = $("sessionSummaryDetails");
    details.innerHTML = "";

    if (activeSession.sessionKind === "course") {
      const course = await ensureActiveCourseSnapshot();
      const steps = flattenCourseSnapshot(course);
      const progress = snapshot.progress || [];
      const completedPairs = new Set(progress.filter(item=>item.status === "completed").map(item=>`${item.participant_id}:${item.node_ref}`));
      const possible = participants * steps.length;
      const overall = possible ? Math.round((completedPairs.size / possible) * 100) : 0;
      $("summaryCompletionRate").textContent = participants ? `${overall}%` : "—";

      const section=document.createElement("section");
      section.className="summary-section";
      section.innerHTML=`<div class="summary-section-head"><strong>各教學節點完成率</strong><span>${steps.length} 個 Node</span></div><div class="summary-node-list"></div>`;
      const list=section.querySelector(".summary-node-list");
      steps.forEach((step,index)=>{
        const count=new Set(progress.filter(item=>item.node_ref===step.node.id && item.status==="completed").map(item=>item.participant_id)).size;
        const pct=participants ? Math.round((count/participants)*100) : 0;
        const responseCount=new Set((snapshot.responses || []).filter(item=>item.node_ref===step.node.id).map(item=>item.participant_id)).size;
        const row=document.createElement("div");
        row.className="summary-node-row";
        row.innerHTML=`<div class="summary-node-main"><strong>${index+1}. ${escapeHtml(step.node.title || "未命名節點")}</strong><small>${escapeHtml(step.lesson.shortTitle || step.lesson.title || "")} · ${nodeTypeLabel(step.node.type)}${step.node.type === "activity" ? ` · ${responseCount} 人提交` : ""}</small></div><div class="summary-progress-track"><i style="width:${pct}%"></i></div><b>${count} / ${participants}</b>`;
        list.appendChild(row);
      });
      details.appendChild(section);
    } else {
      const responses=snapshot.responses || [];
      const responders=new Set(responses.map(item=>item.participant_id)).size;
      const overall=participants ? Math.round((responders/participants)*100) : 0;
      $("summaryCompletionRate").textContent = participants ? `${overall}%` : "—";
    }

    const responses=snapshot.responses || [];
    const finalLike = responses.filter(item=>item.stage_key === "final").length ? responses.filter(item=>item.stage_key === "final") : responses;
    const counts=new Map();
    finalLike.forEach(item=>{
      const name=item.payload?.selectedTypeName || item.selected_type || "";
      if (name) counts.set(name,(counts.get(name)||0)+1);
    });
    if (counts.size) {
      const section=document.createElement("section");
      section.className="summary-section";
      const total=[...counts.values()].reduce((a,b)=>a+b,0);
      section.innerHTML=`<div class="summary-section-head"><strong>主要作答分布</strong><span>${total} 筆</span></div><div class="summary-distribution-list"></div>`;
      const list=section.querySelector(".summary-distribution-list");
      const max=Math.max(...counts.values(),1);
      [...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8).forEach(([name,count])=>{
        const row=document.createElement("div");
        row.className="summary-distribution-row";
        row.innerHTML=`<span>${escapeHtml(name)}</span><div class="summary-progress-track"><i style="width:${Math.max(5,(count/max)*100)}%"></i></div><b>${count}</b>`;
        list.appendChild(row);
      });
      details.appendChild(section);
    }

    if (!details.children.length) details.innerHTML='<div class="empty-v15">這次 Session 沒有足夠資料產生更多摘要。</div>';
  }

  function renderHistory() {
    const list=$("sessionHistoryList");
    const history=window.ClassroomSessionAPI.loadTeacherHistory();
    list.innerHTML="";
    if (!history.length) {
      list.innerHTML='<div class="empty-v15">還沒有建立過課堂 Session。</div>';
      return;
    }
    history.forEach(item=>{
      const row=document.createElement("button");
      row.type="button";
      row.className="session-history-item";
      const status=item.status || "unknown";
      const actionLabel = status === "closed" ? "看摘要 →" : status === "active" ? "繼續 →" : "查看 →";
      const statusClass = status === "closed" ? "closed" : status === "active" ? "active" : "";
      row.innerHTML=`
        <span class="history-code">${escapeHtml(item.code)}</span>
        <span class="history-main">
          <strong>${item.sessionKind==="course"?"📚 ":"🧩 "}${escapeHtml(item.title)}</strong>
          <small>${item.mode==="cloud"?"雲端":"本機"} · ${item.sessionKind==="course"?"完整課程":"單一活動"} · ${item.participantCount || 0} 人 · ${item.responseCount || 0} 筆作答 · ${formatTime(item.createdAt)}</small>
        </span>
        <span class="history-status ${statusClass}">${actionLabel}</span>`;
      row.addEventListener("click",()=>openHistorySession(item));
      list.appendChild(row);
    });
  }

  function formatTime(value) {
    if (!value) return "—";
    try {
      return new Intl.DateTimeFormat("zh-TW",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"}).format(new Date(value));
    } catch { return value; }
  }

  function escapeHtml(text) {
    return String(text ?? "").replace(/[&<>"']/g,ch=>({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    })[ch]);
  }

  let toastTimer=null;
  function showSessionToast(message) {
    const toast=$("toast");
    if (!toast) return;
    toast.textContent=message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer=setTimeout(()=>toast.classList.remove("show"),1800);
  }

  async function copyJoinUrl() {
    const value=$("sessionJoinUrl").value;
    try { await navigator.clipboard.writeText(value); }
    catch { $("sessionJoinUrl").select();document.execCommand("copy"); }
    showSessionToast("學生加入連結已複製");
  }

  function refresh() {
    refreshActivityOptions();
    refreshCourseOptions();
    applySessionKindUI();
    renderCloudState();
    renderHistory();
    renderTeachHome();
    if (activeSession) refreshActiveSession();
  }

  $("openSessionSetupBtn")?.addEventListener("click",()=>document.querySelector(".session-config-card")?.scrollIntoView({behavior:"smooth",block:"start"}));
  $("goCoursePrepBtn")?.addEventListener("click",()=>window.TeacherWorkflow?.switchView?.("courses"));
  $("goActivityPrepBtn")?.addEventListener("click",()=>window.TeacherWorkflow?.switchView?.("activities"));

  document.querySelectorAll('input[name="sessionKind"]').forEach(input=>input.addEventListener("change",applySessionKindUI));
  $("sessionActivitySelect")?.addEventListener("change",renderActivityPreview);
  $("sessionCourseSelect")?.addEventListener("change",renderCoursePreview);
  $("sessionTitleInput")?.addEventListener("input",()=>{$("sessionTitleInput").dataset.autoTitle="0";});
  $("saveCloudConfigBtn")?.addEventListener("click",saveCloudConfig);
  $("clearCloudConfigBtn")?.addEventListener("click",clearCloudConfig);
  $("createSessionBtn")?.addEventListener("click",createSession);
  $("refreshSessionBtn")?.addEventListener("click",()=>refreshActiveSession());
  $("copySessionUrlBtn")?.addEventListener("click",copyJoinUrl);
  $("closeSessionBtn")?.addEventListener("click",closeActiveSession);
  $("previousCourseNodeBtn")?.addEventListener("click",()=>changeCourseNode(-1));
  $("nextCourseNodeBtn")?.addEventListener("click",()=>changeCourseNode(1));
  $("openCoursePresentationBtn")?.addEventListener("click",openCoursePresentation);
  $("presentationContentBtn")?.addEventListener("click",()=>setPresentationView("content"));
  $("presentationResultsBtn")?.addEventListener("click",()=>setPresentationView("results"));
  $("previousStageBtn")?.addEventListener("click",()=>changeStage(-1));
  $("nextStageBtn")?.addEventListener("click",()=>changeStage(1));
  $("openPreviousPhaseBtn")?.addEventListener("click",()=>changeOpenPhase(-1));
  $("openNextPhaseBtn")?.addEventListener("click",()=>changeOpenPhase(1));

  window.addEventListener("beforeunload",()=>{
    clearInterval(refreshTimer);
    stopSessionRealtime();
  });

  window.ClassroomSessionManager={refresh,refreshActiveSession};
  refresh();
})();
