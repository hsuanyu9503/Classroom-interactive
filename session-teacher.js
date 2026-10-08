/* V2.26.2 | Teacher Session + focus mode + group consensus */
/* ----- Classroom Session Manager V2.4 ----- */
(() => {
  const $ = id => document.getElementById(id);
  const ActivityModules = window.ClassroomActivityModules;
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
  let deliberationPresentationWindow = null;
  let deliberationPresentationChannel = null;
  let deliberationPresentationSessionId = "";
  let inspectedParticipantId = "";
  let deliberationReasonIdentityMode = (()=>{
    try { return localStorage.getItem("classroom-deliberation-reason-identity") === "named" ? "named" : "anonymous"; } catch { return "anonymous"; }
  })();
  const liveStatsShown = new Map();
  let openTextIdentityMode = "anonymous";
  let openTextViewMode = "wall";
  let questionWallIdentityMode = "anonymous";
  let questionWallSortMode = "hot";
  const questionWallTeacherExpandedPosts = new Set();
  const LIVE_STATS_PALETTE=["#3b6fb6","#e38b2c","#2f8f66","#8a5db7","#d65b5b","#2b9cb3","#c59a2b","#c35a8a","#61758a","#8a6846"];

  function stableLiveStatColor(value,fallbackIndex=0) {
    const text=String(value ?? "").trim();
    let paletteIndex=Math.abs(Number(fallbackIndex)||0)%LIVE_STATS_PALETTE.length;

    // V2.22.0：顏色只由「選項本身」決定，不再依目前有哪些其他選項動態避色。
    // 這可保證 Realtime 更新、新選項首次出現或學生改答案時，既有選項永遠不換色。
    if (/^\d+$/.test(text)) {
      paletteIndex=Number(text)%LIVE_STATS_PALETTE.length;
    } else if (text) {
      let hash=2166136261;
      for (let i=0;i<text.length;i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash,16777619);
      }
      paletteIndex=(hash>>>0)%LIVE_STATS_PALETTE.length;
    }
    return LIVE_STATS_PALETTE[paletteIndex];
  }

  function collectLiveClassificationEntries(responses=[]) {
    const grouped=new Map();
    responses.forEach(response=>{
      const label=String(response?.payload?.selectedTypeName || response?.selected_type || "未命名分類").trim() || "未命名分類";
      const id=String(response?.selected_type || label).trim() || label;
      const current=grouped.get(id) || {id,label,count:0};
      current.count += 1;
      if ((!current.label || current.label==="未命名分類") && label) current.label=label;
      grouped.set(id,current);
    });
    return [...grouped.values()]
      .sort((a,b)=>a.label.localeCompare(b.label,"zh-Hant") || a.id.localeCompare(b.id,"zh-Hant"))
      .map((item,index)=>({...item,order:index,color:stableLiveStatColor(item.id,index)}));
  }

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

  function closePresentationSync() {
    const sessionId = activeSession?.id || presentationChannelSessionId || "";
    try { presentationChannel?.close?.(); } catch {}
    presentationChannel = null;
    presentationChannelSessionId = "";
    try {
      if (presentationWindow && !presentationWindow.closed) presentationWindow.close?.();
    } catch {}
    presentationWindow = null;
    presentationView = "content";
    if (sessionId) {
      try { localStorage.removeItem(presentationStorageKey(sessionId)); } catch {}
    }
    updatePresentationControls();
  }

  function deliberationPresentationChannelName(sessionId) {
    return `classroom-deliberation-presentation:${sessionId}`;
  }

  function deliberationPresentationStorageKey(sessionId) {
    return `classroom-deliberation-presentation-state:${sessionId}`;
  }

  function closeDeliberationPresentation() {
    const sessionId=activeSession?.id || deliberationPresentationSessionId || "";
    try { deliberationPresentationChannel?.close?.(); } catch {}
    deliberationPresentationChannel=null;
    deliberationPresentationSessionId="";
    try {
      if (deliberationPresentationWindow && !deliberationPresentationWindow.closed) deliberationPresentationWindow.close?.();
    } catch {}
    deliberationPresentationWindow=null;
    if (sessionId) {
      try { localStorage.removeItem(deliberationPresentationStorageKey(sessionId)); } catch {}
    }
  }

  function postDeliberationProjectionControlStatus({requestId="",message="",error=""}={}) {
    if (!deliberationPresentationChannel) return;
    try {
      deliberationPresentationChannel.postMessage({
        schema:"classroom-deliberation-presentation-control-status",
        version:1,
        at:new Date().toISOString(),
        connected:true,
        requestId,
        message,
        error
      });
    } catch {}
  }

  async function previousDeliberationLayer() {
    if (!activeSession || activeSession.activityMode !== "layered-deliberation") return false;
    const current=Math.max(1,Number(activeSession.currentStage)||1);
    const target=Math.max(1,current-1);
    if (target===current) return false;
    try {
      await window.ClassroomSessionAPI.setDeliberationState(activeSession,{stage:target,roundState:"published"});
      await refreshActiveSession();
      return true;
    } catch (error) {
      showSessionToast(error.message || "回到上一層失敗");
      return false;
    }
  }

  async function handleDeliberationProjectionCommand(payload) {
    if (!activeSession || activeSession.activityMode !== "layered-deliberation" || activeSession.status === "closed") {
      postDeliberationProjectionControlStatus({
        requestId:payload?.requestId || "",
        error:"目前沒有可控制的逐層思辨 Session"
      });
      return;
    }
    const command=String(payload?.command || "");
    const requestId=String(payload?.requestId || "");
    try {
      let success=true;
      if (command==="open") success=await setDeliberationRound("open");
      else if (command==="lock") success=await setDeliberationRound("locked");
      else if (command==="publish") success=await setDeliberationRound("published");
      else if (command==="next") success=await nextDeliberationLayer();
      else if (command==="previous") success=await previousDeliberationLayer();
      else if (command==="refresh") await refreshActiveSession(true);
      else throw new Error("不支援的投影控制指令");
      if (success===false) throw new Error("課堂狀態未完成更新");
      postDeliberationProjectionControlStatus({requestId,message:"控制完成"});
      if (latestTeacherSnapshot) publishDeliberationPresentation(latestTeacherSnapshot);
    } catch (error) {
      postDeliberationProjectionControlStatus({
        requestId,
        error:error?.message || "投影控制失敗"
      });
    }
  }

  function bindDeliberationPresentationChannel(channel) {
    if (!channel || channel.__teacherControlBound) return;
    channel.__teacherControlBound=true;
    channel.addEventListener("message",event=>{
      const data=event.data || {};
      if (data.schema!=="classroom-deliberation-presentation-command") return;
      if (data.type==="hello" || data.type==="ping") {
        postDeliberationProjectionControlStatus({message:"教師控制端已連線"});
        if (latestTeacherSnapshot) publishDeliberationPresentation(latestTeacherSnapshot);
        return;
      }
      if (data.type==="command") handleDeliberationProjectionCommand(data);
    });
  }

  function ensureDeliberationPresentationChannel() {
    if (!activeSession?.id || activeSession.activityMode !== "layered-deliberation") return null;
    if (deliberationPresentationChannel && deliberationPresentationSessionId===activeSession.id) return deliberationPresentationChannel;
    try { deliberationPresentationChannel?.close?.(); } catch {}
    deliberationPresentationChannel=null;
    deliberationPresentationSessionId=activeSession.id;
    if (typeof BroadcastChannel==="function") {
      deliberationPresentationChannel=new BroadcastChannel(deliberationPresentationChannelName(activeSession.id));
      bindDeliberationPresentationChannel(deliberationPresentationChannel);
    }
    return deliberationPresentationChannel;
  }

  function buildDeliberationPresentationState(snapshot) {
    const stage=Math.max(1,Number(snapshot?.current_stage)||1);
    const total=Math.max(1,Number(snapshot?.stage_count)||1);
    const data=snapshot?.deliberation_data || {};
    const layers=Array.isArray(data.l)?data.l:[];
    const layer=layers[stage-1] || {};
    const current=(snapshot?.responses || []).filter(r=>r.mode==="layered-deliberation" && r.stage_key===`layer-${stage}`);
    const options=normalizeTeacherDeliberationOptions(data.o);
    const counts=Object.fromEntries(options.map(option=>[option.id,0]));
    current.forEach(r=>{ if (Object.hasOwn(counts,r.selected_type)) counts[r.selected_type]++; });
    const published=(snapshot?.round_state || "")==="published";
    return {
      schema:"classroom-deliberation-presentation",
      version:1,
      at:new Date().toISOString(),
      title:activeSession?.title || snapshot?.title || "逐層思辨",
      stage,total,
      roundState:snapshot?.round_state || "open",
      sourceNote:data.src || "",
      fixedQuestion:data.q || "",
      chartType:data.chart === "pie" ? "pie" : "bar",
      options,
      layer:{title:layer.t || `第 ${stage} 層`,content:layer.c || "",question:layer.q || ""},
      participantCount:Number(snapshot?.participant_count)||0,
      submittedCount:new Set(current.map(r=>r.participant_id)).size,
      published,
      controls:{
        canPrevious:stage>1,
        canOpen:(snapshot?.round_state || "open")!=="open",
        canLock:(snapshot?.round_state || "open")==="open",
        canPublish:(snapshot?.round_state || "open")!=="published",
        canNext:(snapshot?.round_state || "open")==="published" && stage<total
      },
      distribution:published ? counts : null,
      reasons:published ? current.filter(r=>!r.is_hidden).map(r=>String(r.payload?.reason || "").trim()).filter(Boolean) : []
    };
  }

  function publishDeliberationPresentation(snapshot) {
    if (!activeSession || activeSession.activityMode!=="layered-deliberation" || !snapshot) return;
    const state=buildDeliberationPresentationState(snapshot);
    try { localStorage.setItem(deliberationPresentationStorageKey(activeSession.id),JSON.stringify(state)); } catch {}
    try { ensureDeliberationPresentationChannel()?.postMessage(state); } catch {}
  }

  function openDeliberationPresentation() {
    if (!activeSession || activeSession.activityMode!=="layered-deliberation") return;
    ensureDeliberationPresentationChannel();
    try {
      let url;
      try { url=new URL("deliberation-present.html",window.location.href); }
      catch { url=new URL("deliberation-present.html",document.baseURI); }
      url.hash=`session=${encodeURIComponent(activeSession.id)}`;
      deliberationPresentationWindow=window.open(url.toString(),`deliberation-${activeSession.id}`);
      if (!deliberationPresentationWindow) throw new Error("瀏覽器封鎖了投影視窗");
      if (latestTeacherSnapshot) setTimeout(()=>publishDeliberationPresentation(latestTeacherSnapshot),150);
    } catch (error) {
      showSessionToast(error.message || "無法開啟逐層思辨投影");
    }
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
    let phaseLabel = activeSession.activityMode ? activityModeLabel(activeSession.activityMode) : "節點完成進度";
    const phase = ActivityModules?.invoke?.("teacher", activeSession.activityMode, "presentationPhase", {
      responses,
      currentStage:Math.max(1,Number(activeSession.currentStage)||1),
      stageCount:Math.max(1,Number(activeSession.stageCount)||1),
      snapshot
    });
    if (phase) {
      relevant = Array.isArray(phase.responses) ? phase.responses : relevant;
      phaseLabel = phase.label || phaseLabel;
    }

    const submittedCount = new Set(relevant.map(item=>item.participant_id)).size;
    const counts = new Map();
    relevant.forEach(item=>{
      const name = item.payload?.selectedTypeName || item.selected_type || "";
      if (!name) return;
      counts.set(name,(counts.get(name)||0)+1);
    });
    let distribution = [...counts.entries()]
      .map(([name,count])=>({name,count}))
      .sort((a,b)=>b.count-a.count || a.name.localeCompare(b.name,"zh-Hant"));

    const extras = ActivityModules?.invoke?.("teacher", activeSession.activityMode, "presentationExtras", {
      responses,
      currentStage:Math.max(1,Number(activeSession.currentStage)||1),
      snapshot
    }) || {};
    if (extras.suppressDistribution) distribution=[];

    return {
      participantCount:participants,
      completedCount,
      submittedCount,
      phaseLabel,
      distribution,
      changedCount:Number(extras.changedCount || 0),
      unchangedCount:Number(extras.unchangedCount || 0),
      customMetrics:Array.isArray(extras.customMetrics) ? extras.customMetrics : [],
      secondaryList:Array.isArray(extras.secondaryList) ? extras.secondaryList : [],
      textWall:Array.isArray(extras.textWall) ? extras.textWall : [],
      wordCloud:Array.isArray(extras.wordCloud) ? extras.wordCloud : [],
      stanceMap:extras.stanceMap && typeof extras.stanceMap === "object" ? extras.stanceMap : null,
      liveStance:extras.liveStance && typeof extras.liveStance === "object" ? extras.liveStance : null,
      confidence:buildPresentationConfidence(responses,Math.max(1,Number(activeSession.currentStage)||1))
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
    if (!mode) return "—";
    return ActivityModules?.modeLabel?.(mode) || "選擇與揭示";
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
        <small>${activityModeLabel(activity.template)} · ${escapeHtml(ActivityModules?.previewSummary?.(activity) || `${activity.taskCount || 0} 個任務`)}</small>
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

  function openSessionSetup({scroll=true} = {}) {
    const details = $("sessionSetupDetails");
    if (details) details.open = true;
    if (scroll) document.querySelector(".session-config-card")?.scrollIntoView({behavior:"smooth",block:"start"});
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
    openSessionSetup();
  }

  function downloadJsonFile(filename, payload) {
    const blob = new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = filename;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  async function exportTeacherHandoff() {
    if (!activeSession) return;
    const button = $("exportTeacherHandoffBtn");
    if (activeSession.mode !== "cloud" || activeSession.status !== "active") {
      showSessionToast("只有進行中的雲端 Session 可以建立接手檔"); return;
    }
    if (!confirm("要匯出教師接手檔嗎？\\n\\n這個檔案包含目前 Session 的教師控制憑證與 Supabase Publishable key。\\n請只交給你自己的新裝置，不要傳給學生或公開分享。")) return;
    const oldText = button?.textContent || "";
    if (button) { button.disabled=true; button.textContent="建立中…"; }
    try {
      const payload = await window.ClassroomSessionAPI.createTeacherHandoff(activeSession);
      const code = String(activeSession.code || "session").replace(/[^A-Za-z0-9_-]/g,"");
      downloadJsonFile(`classroom-teacher-handoff-${code}.json`,payload);
      showSessionToast("教師接手檔已匯出");
    } catch (error) { showSessionToast(error.message || "無法建立教師接手檔"); }
    finally { if (button) { button.disabled=false; button.textContent=oldText || "🔁 匯出接手檔"; } }
  }

  async function importTeacherHandoffFile(file) {
    const fileInput = $("teacherHandoffFileInput");
    const resetFileInput = () => { if (fileInput) fileInput.value = ""; };
    if (!file) { resetFileInput(); return; }

    let payload;
    try {
      payload = JSON.parse(await file.text());
      window.ClassroomSessionAPI.validateTeacherHandoffPackage(payload);
    } catch (error) {
      showSessionToast(error.message || "教師接手檔格式錯誤");
      resetFileInput();
      return;
    }

    if (!confirm("確定要在這台裝置接手這個 Session 嗎？\n\n接手成功後，Supabase 會立即更換 teacherToken；舊裝置原本的教師控制權會失效。")) {
      resetFileInput();
      return;
    }

    const button=$("importTeacherHandoffBtn"); const oldText=button?.textContent || "";
    if (button) { button.disabled=true; button.textContent="接手中…"; }
    try {
      const result = await window.ClassroomSessionAPI.claimTeacherHandoff(payload);
      clearInterval(refreshTimer); stopSessionRealtime(); closePresentationSync();
      activeSession=result.sessionMeta; activeCourseSnapshot=null;
      renderCloudState(); await renderActiveSession(); renderHistory(); await renderTeachHome();
      $("activeSessionCard")?.scrollIntoView({behavior:"smooth",block:"start"});
      showSessionToast("已接手同一個雲端 Session");
    } catch (error) { showSessionToast(error.message || "教師 Session 接手失敗"); }
    finally {
      if (button) { button.disabled=false; button.textContent=oldText || "匯入教師接手檔"; }
      resetFileInput();
    }
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

  function syncTeachHomeFocusMode({reset=false}={}) {
    const dashboard=$("teachHomeDashboard");
    const toggle=$("toggleTeachHomeFocusBtn");
    if (!dashboard || !toggle) return;
    const focused=Boolean(activeSession && activeSession.status === "active");
    dashboard.classList.toggle("focus-mode",focused);
    toggle.classList.toggle("hidden",!focused);
    if (!focused) {
      dashboard.classList.remove("focus-collapsed");
    } else if (reset) {
      dashboard.classList.add("focus-collapsed");
    }
    const collapsed=dashboard.classList.contains("focus-collapsed");
    const heading=dashboard.querySelector(".teach-home-head h2");
    const description=dashboard.querySelector(".teach-home-head p.subtle");
    if (heading) heading.textContent=focused ? "其他課堂操作" : "今天要上什麼？";
    if (description) description.textContent=focused
      ? "目前有進行中的 Session；需要切換課程或建立另一個 Session 時再展開。"
      : "從準備完成的課程或活動直接開始，也可以繼續最近一次尚未結束的 Session。";
    toggle.setAttribute("aria-expanded",String(focused && !collapsed));
    toggle.textContent=collapsed ? "展開其他課堂操作" : "收合其他課堂操作";
  }

  function toggleTeachHomeFocusMode() {
    const dashboard=$("teachHomeDashboard");
    if (!dashboard?.classList.contains("focus-mode")) return;
    dashboard.classList.toggle("focus-collapsed");
    syncTeachHomeFocusMode();
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
    activityList.innerHTML = activityResults.length ? "" : '<div class="teach-ready-empty">還沒有活動。先到「備課 → 活動模組」建立互動任務。</div>';
    activityResults.slice(0,8).forEach(({activity,ready,reason})=>{
      const row=document.createElement("div");
      row.className=`teach-ready-item ${ready ? "" : "unready"}`;
      const legacy = "";
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
        const blocked = (snapshot.resources?.activities || []).find(item => ActivityModules?.get?.(item.template)?.allowInCourse === false);
        if (blocked) {
          throw new Error(`${activityModeLabel(blocked.template)}為了避免未公開資訊外洩，請使用「單一活動 Session」上課；暫不放入完整 Course Session。`);
        }
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
          stageCount:snapshot.stageCount || 1,
          shellEncoded:snapshot.shellEncoded || "",
          deliberationData:snapshot.deliberationData || null
        });
        activeSession.moduleData=snapshot.moduleData || null;
        activeCourseSnapshot = null;
      }
      await renderActiveSession();
      renderHistory();
      const setupDetails = $("sessionSetupDetails");
      if (setupDetails) setupDetails.open = false;
      $("activeSessionCard")?.scrollIntoView({behavior:"smooth",block:"start"});
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

  function updateActivityModeControls() {
    const activeControl = ActivityModules?.get?.(activeSession?.activityMode)?.teacherControlId || "";
    (ActivityModules?.teacherControlIds?.() || []).forEach(id => {
      $(id)?.classList.toggle("hidden", id !== activeControl);
    });
  }

  async function renderActiveSession() {
    if (!activeSession) return;
    clearInterval(refreshTimer);
    stopSessionRealtime();
    $("activeSessionCard").classList.remove("hidden");
    const sessionWorkspace = document.querySelector(".session-workspace");
    sessionWorkspace?.classList.add("has-active-session");
    sessionWorkspace?.classList.toggle("session-is-closed",activeSession.status === "closed");
    syncTeachHomeFocusMode({reset:activeSession.status === "active"});
    $("activeSessionTitle").textContent = activeSession.title;
    $("activeSessionCode").textContent = activeSession.code;
    $("activeSessionMode").textContent = activeSession.mode === "cloud" ? "☁️ 雲端 Session" : "🧪 本機測試 Session";
    const handoffButton=$("exportTeacherHandoffBtn");
    if (handoffButton) {
      const canHandoff=activeSession.mode === "cloud" && activeSession.status !== "closed";
      handoffButton.classList.toggle("hidden",!canHandoff); handoffButton.disabled=!canHandoff;
    }
    const deliberationExportButton=$("exportDeliberationResultsBtn");
    if (deliberationExportButton) {
      const canExport=activeSession.activityMode === "layered-deliberation";
      deliberationExportButton.classList.toggle("hidden",!canExport);
      deliberationExportButton.disabled=!canExport;
    }
    $("sessionActivityMode").textContent = activeSession.sessionKind === "course"
      ? "📚 完整課程"
      : activityModeLabel(activeSession.activityMode);

    $("courseSessionControl").classList.toggle("hidden",activeSession.sessionKind !== "course");
    updateActivityModeControls();

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
      qrNotice.textContent = `${typeof getQrQualityLabel === "function" ? getQrQualityLabel(joinUrl.length) : "學生掃碼後輸入座號、姓名或暱稱即可加入。"} · 加入網址 ${joinUrl.length} 字元`;
      if (joinHelp) joinHelp.textContent = activeSession.sessionKind === "course"
        ? "學生只需要加入一次；之後完整課程會跟著老師目前的教學節點同步。"
        : "學生可掃描 QR Code，或開啟加入連結後輸入這組課堂代碼。";
    }

    await refreshActiveSession();
    startSessionRealtime();
  }

  async function handleTeacherControlLost() {
    const lostId = activeSession?.id || "";
    clearInterval(refreshTimer);
    stopSessionRealtime();
    closePresentationSync();
    closeDeliberationPresentation();
    if (lostId) window.ClassroomSessionAPI.removeTeacherHistory?.(lostId);
    activeSession = null;
    activeCourseSnapshot = null;
    latestTeacherSnapshot = null;
    $("activeSessionCard")?.classList.add("hidden");
    $("sessionSummaryCard")?.classList.add("hidden");
    document.querySelector(".session-workspace")?.classList.remove("has-active-session","session-is-closed");
    syncTeachHomeFocusMode();
    renderHistory();
    await renderTeachHome();
    showSessionToast("這個 Session 的教師控制權已轉移到其他裝置");
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
      activeSession.roundState = snapshot.round_state || activeSession.roundState || "";
      activeSession.currentNodeRef = snapshot.current_node_ref || activeSession.currentNodeRef || "";
      activeSession.revision = snapshot.revision || activeSession.revision || 1;
      activeSession.courseEncoded = snapshot.course_encoded || activeSession.courseEncoded || "";
      activeSession.courseId = snapshot.course_id || activeSession.courseId || "";

      $("sessionParticipantCount").textContent = snapshot.participant_count ?? 0;
      $("sessionResponseCount").textContent = snapshot.response_count ?? 0;
      document.querySelector(".session-workspace")?.classList.toggle("session-is-closed",activeSession.status === "closed");
      syncTeachHomeFocusMode();
      $("activeSessionStatus").textContent = activeSession.status === "active" ? "進行中" : "已結束";
      $("activeSessionStatus").classList.toggle("active",activeSession.status === "active");
      $("closeSessionBtn").disabled = activeSession.status === "closed";
      if ($("exportTeacherHandoffBtn")) {
        const canHandoff=activeSession.mode === "cloud" && activeSession.status === "active";
        $("exportTeacherHandoffBtn").classList.toggle("hidden",!canHandoff);
        $("exportTeacherHandoffBtn").disabled=!canHandoff;
      }
      if ($("exportDeliberationResultsBtn")) {
        const canExport=activeSession.activityMode === "layered-deliberation";
        $("exportDeliberationResultsBtn").classList.toggle("hidden",!canExport);
        $("exportDeliberationResultsBtn").disabled=!canExport;
      }
      $("sessionActivityMode").textContent = activeSession.sessionKind === "course"
        ? "📚 完整課程"
        : activityModeLabel(activeSession.activityMode);

      latestTeacherSnapshot = snapshot;
      window.ClassroomSessionAPI.updateTeacherHistory?.(activeSession,snapshot);
      renderParticipants(snapshot.participants || [],snapshot.responses || [],snapshot.progress || [],snapshot);
      renderStudentInspector(snapshot);
      await renderCourseControl(snapshot);
      ActivityModules?.invoke?.("teacher", activeSession.activityMode, "renderControl", snapshot);
      renderConfidenceControl(snapshot);
      ActivityModules?.invoke?.("teacher", activeSession.activityMode, "publishSpecialPresentation", snapshot);
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
      const message = error.message || "更新 Session 失敗";
      if (/invalid teacher token|session unavailable or teacher token invalid/i.test(message)) {
        await handleTeacherControlLost();
      } else {
        showSessionToast(message);
      }
    } finally {
      if (!silent) button.disabled = false;
    }
  }

  function renderParticipants(participants,responses=[],progress=[],snapshot=null) {
    const list = $("sessionParticipantList");
    const select = $("studentInspectSelect");
    list.innerHTML = "";
    const sorted=participants.slice().sort((a,b)=>String(a.student_code).localeCompare(String(b.student_code),"zh-Hant",{numeric:true}));

    if (select) {
      const previous=inspectedParticipantId || select.value || "";
      select.innerHTML='<option value="">請選擇學生</option>';
      sorted.forEach(participant=>{
        const option=document.createElement("option");
        option.value=participant.id;
        option.textContent=participant.student_code || "未命名學生";
        select.appendChild(option);
      });
      inspectedParticipantId=sorted.some(p=>p.id===previous) ? previous : "";
      select.value=inspectedParticipantId;
    }

    if (!sorted.length) {
      list.innerHTML = '<div class="empty-v15">還沒有學生加入。</div>';
      inspectedParticipantId="";
      return;
    }

    sorted.forEach(participant=>{
        const row = document.createElement("div");
        row.className = "session-participant-row";
        const inspectButton=`<button class="participant-inspect-btn" type="button" data-participant-id="${escapeHtml(participant.id)}">檢視</button>`;
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
            <div class="participant-row-actions"><span class="participant-response-count">${currentDone ? "✓" : "…"}</span>${inspectButton}</div>`;
        } else {
          row.innerHTML = `
            <div class="participant-seat">${escapeHtml(participant.student_code)}</div>
            <div class="participant-main">
              <strong>${Number(participant.response_count || 0) > 0 ? "已作答" : "已加入"}</strong>
              <small>${participant.last_submitted_at ? `最後作答：${formatTime(participant.last_submitted_at)}` : `加入：${formatTime(participant.joined_at)}`}</small>
              ${(() => {
                const history = ActivityModules?.invoke?.("teacher", activeSession?.activityMode, "participantHistory", participant.id, responses, snapshot) || "";
                return history ? `<div class="participant-judgement-history">${history}</div>` : "";
              })()}
            </div>
            <div class="participant-row-actions"><span class="participant-response-count">${participant.response_count || 0} 筆</span>${inspectButton}</div>`;
        }
        row.querySelector(".participant-inspect-btn")?.addEventListener("click",()=>selectStudentForInspection(participant.id));
        list.appendChild(row);
      });
  }

  function selectStudentForInspection(participantId) {
    inspectedParticipantId=String(participantId || "");
    const select=$("studentInspectSelect");
    if (select) select.value=inspectedParticipantId;
    if (latestTeacherSnapshot) renderStudentInspector(latestTeacherSnapshot);
    $("studentInspectDetail")?.scrollIntoView({behavior:"smooth",block:"nearest"});
  }

  function responseModeLabel(mode) {
    if (!mode) return "作答";
    return ActivityModules?.get?.(mode)?.shortLabel || ActivityModules?.modeLabel?.(mode) || mode;
  }


  function responseStageLabel(response) {
    const key=String(response?.stage_key || "");
    if (key==="initial" && response?.mode === "predict-reveal") return "初次預測";
    if (key==="initial") return "初次判斷";
    if (key==="final" && response?.mode === "predict-reveal") return "再次判斷";
    if (key==="final" && response?.mode === "open-classification") return "最終判斷";
    if (key==="final") return `第 ${Number(response?.task_index || 0)+1} 題`;
    if (key==="reflection") return "課後反思";
    let match=key.match(/^clue-(\d+)$/); if (match) return `第 ${match[1]} 層`;
    match=key.match(/^layer-(\d+)-post$/); if (match) return `第 ${match[1]} 層・討論後補記`;
    match=key.match(/^layer-(\d+)$/); if (match) return `第 ${match[1]} 層`;
    return key && key!=="final" ? key : `第 ${Number(response?.task_index || 0)+1} 題`;
  }

  function responseSelectedTypeLabel(response,snapshot) {
    const code=String(response?.selected_type || "").trim();
    if (!code) return "";
    const customLabel = ActivityModules?.invoke?.("teacher", response?.mode, "selectedTypeLabel", response, snapshot);
    if (customLabel !== undefined) return customLabel;
    return String(response?.payload?.selectedTypeName || code);
  }

  function createInspectorLine(label,content,{html=false}={}) {
    if (content===undefined || content===null || content==="" || (Array.isArray(content)&&!content.length)) return null;
    const row=document.createElement("div");row.className="student-response-detail-line";
    const key=document.createElement("span");key.textContent=label;
    const value=document.createElement("div");
    if (html) value.innerHTML=content; else value.textContent=String(content);
    row.append(key,value);return row;
  }

  function chipListHtml(values) {
    return `<div class="student-response-chip-list">${values.map(value=>`<span class="student-response-chip">${escapeHtml(String(value))}</span>`).join("")}</div>`;
  }

  function renderStudentInspector(snapshot) {
    const detail=$("studentInspectDetail");
    if (!detail) return;
    const participants=snapshot?.participants || [];
    const participant=participants.find(item=>item.id===inspectedParticipantId);
    if (!participant) {
      detail.innerHTML='<div class="empty-v15">選擇一位學生後，即可查看他的作答選項、依據與理由。</div>';
      return;
    }

    const responses=(snapshot?.responses || [])
      .filter(item=>item.participant_id===participant.id)
      .slice().sort((a,b)=>new Date(a.submitted_at||0)-new Date(b.submitted_at||0));
    const questionPosts=activeSession?.activityMode==="question-wall"
      ? (snapshot?.question_wall_posts || []).filter(item=>item.participant_id===participant.id).slice().sort((a,b)=>new Date(a.created_at||0)-new Date(b.created_at||0))
      : [];
    const questionReplies=activeSession?.activityMode==="question-wall"
      ? (snapshot?.question_wall_posts || []).flatMap(post=>(post.replies||[]).filter(reply=>reply.participant_id===participant.id).map(reply=>({...reply,parent_text:post.text||""}))).sort((a,b)=>new Date(a.created_at||0)-new Date(b.created_at||0))
      : [];
    detail.innerHTML="";
    const summary=document.createElement("div");summary.className="student-inspector-summary";
    const recordCount=responses.length+questionPosts.length+questionReplies.length;
    summary.innerHTML=`<strong>${escapeHtml(participant.student_code || "未命名學生")}</strong><span>${recordCount} 筆紀錄</span><span>加入：${escapeHtml(formatTime(participant.joined_at))}</span>`;
    detail.appendChild(summary);

    if (questionPosts.length) {
      questionPosts.forEach((post,index)=>{
        const card=document.createElement("div");card.className="student-response-detail-card";
        card.innerHTML=`<div class="student-response-detail-head"><strong>匿名提問 ${index+1}</strong><small>${escapeHtml(formatTime(post.created_at))}</small></div><div class="student-response-detail-body"><div class="student-response-detail-line"><span>問題</span><div>${escapeHtml(post.text||"")}</div></div><div class="student-response-detail-line"><span>同儕認同</span><div>＋${Math.max(0,Number(post.vote_count)||0)}</div></div></div>`;
        detail.appendChild(card);
      });
    }
    if (questionReplies.length) {
      questionReplies.forEach((reply,index)=>{
        const card=document.createElement("div");card.className="student-response-detail-card";
        card.innerHTML=`<div class="student-response-detail-head"><strong>同儕回應 ${index+1}</strong><small>${escapeHtml(formatTime(reply.updated_at||reply.created_at))}</small></div><div class="student-response-detail-body"><div class="student-response-detail-line"><span>回應的問題</span><div>${escapeHtml(reply.parent_text||"")}</div></div><div class="student-response-detail-line"><span>回應內容</span><div>${escapeHtml(reply.text||"")}</div></div></div>`;
        detail.appendChild(card);
      });
    }

    if (!responses.length && (questionPosts.length || questionReplies.length)) return;

    if (!responses.length) {
      detail.insertAdjacentHTML("beforeend",'<div class="empty-v15">這位學生目前還沒有作答紀錄。</div>');
      return;
    }

    responses.forEach(response=>{
      const card=document.createElement("div");card.className="student-response-detail-card";
      const head=document.createElement("div");head.className="student-response-detail-head";
      head.innerHTML=`<strong>${escapeHtml(responseModeLabel(response.mode))} · ${escapeHtml(responseStageLabel(response))}</strong><small>${escapeHtml(formatTime(response.submitted_at))}</small>`;
      const body=document.createElement("div");body.className="student-response-detail-body";

      const customInspectorFields=ActivityModules?.invoke?.("teacher",response?.mode,"inspectorFields",response,snapshot);
      if (Array.isArray(customInspectorFields)) {
        const rows=customInspectorFields.map(field=>{
          if (!field) return null;
          if (field.kind==="chips") return createInspectorLine(field.label,Array.isArray(field.value)&&field.value.length ? chipListHtml(field.value) : "",{html:true});
          return createInspectorLine(field.label,field.value);
        }).filter(Boolean);
        if(response.payload?.confidence){rows.push(createInspectorLine("信心程度",`${response.payload.confidence.value} / ${response.payload.confidence.pointCount}（${response.payload.confidence.lowLabel || "低"} ～ ${response.payload.confidence.highLabel || "高"}）`));}
        rows.filter(Boolean).forEach(row=>body.appendChild(row));
        if (!rows.filter(Boolean).length) body.innerHTML='<div class="empty-v15">這筆作答沒有可顯示的內容。</div>';
        card.append(head,body);detail.appendChild(card);
        return;
      }

      const selectedType=responseSelectedTypeLabel(response,snapshot);
      const selectedElements=Array.isArray(response.payload?.elementNames) && response.payload.elementNames.length
        ? response.payload.elementNames
        : Array.isArray(response.selected_elements) ? response.selected_elements : [];
      const selectedLabels=Array.isArray(response.payload?.selectedLabels) ? response.payload.selectedLabels : [];
      const selectionRows=[];
      if (response.mode === "open-tags") {
        selectionRows.push(createInspectorLine("選取標籤",selectedLabels.length ? chipListHtml(selectedLabels) : "",{html:true}));
      } else if (response.mode === "drag-reveal") {
        selectionRows.push(createInspectorLine("選取項目",selectedElements.length ? chipListHtml(selectedElements) : "",{html:true}));
      } else {
        selectionRows.push(createInspectorLine("選取依據",selectedElements.length ? chipListHtml(selectedElements) : "",{html:true}));
      }
      const rows=[
        createInspectorLine("選項／分類",selectedType),
        ...selectionRows,
        createInspectorLine("理由",response.payload?.reason ? `<div class="student-response-reason">${escapeHtml(response.payload.reason)}</div>` : "",{html:true}),
        createInspectorLine("改變原因",response.payload?.changeReason ? `<div class="student-response-reason">${escapeHtml(response.payload.changeReason)}</div>` : "",{html:true}),
        createInspectorLine("還想知道",response.payload?.needToKnow),
        createInspectorLine("討論後補記",response.payload?.note),
        createInspectorLine("關鍵理解",response.payload?.key),
        createInspectorLine("價值判斷",response.payload?.value),
        createInspectorLine("行動選擇",response.payload?.action),
        createInspectorLine("延伸思考",response.payload?.extension),
        response.payload?.confidence ? createInspectorLine("信心程度",`${response.payload.confidence.value} / ${response.payload.confidence.pointCount}（${response.payload.confidence.lowLabel || "低"} ～ ${response.payload.confidence.highLabel || "高"}）`) : null
      ].filter(Boolean);
      rows.forEach(row=>body.appendChild(row));
      if (!rows.length) body.innerHTML='<div class="empty-v15">這筆作答沒有額外的選項或理由文字。</div>';
      card.append(head,body);detail.appendChild(card);
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

    updateActivityModeControls();
  }

  function nodeTypeLabel(type) {
    if (type === "work-wall") return "材料牆";
    if (type === "type-toolbox") return "分類工具箱";
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


  const DELIBERATION_OPTION_LABELS = {
    A:"完全不能接受",
    B:"不太能接受",
    C:"大致能接受",
    D:"完全能接受",
    U:"資訊不足，暫不判斷"
  };

  function normalizeTeacherDeliberationOptions(options) {
    const fallback=Object.entries(DELIBERATION_OPTION_LABELS).map(([id,label])=>({id,label}));
    const source=Array.isArray(options)&&options.length ? options : fallback;
    return source.map(item=>({
      id:String(item?.i ?? item?.id ?? "").trim(),
      label:String(item?.l ?? item?.label ?? DELIBERATION_OPTION_LABELS[item?.i] ?? item?.i ?? "").trim()
    })).filter(item=>item.id);
  }

  function deliberationOptionsFromSnapshot(snapshot) {
    return normalizeTeacherDeliberationOptions(snapshot?.deliberation_data?.o);
  }

  function buildDeliberationParticipantHistory(participantId,responses,options=null) {
    const items=(responses || [])
      .filter(r=>r.participant_id===participantId && r.mode==="layered-deliberation" && /^layer-\d+$/.test(r.stage_key || ""))
      .sort((a,b)=>Number(a.stage_key.split("-")[1])-Number(b.stage_key.split("-")[1]));
    if (!items.length) return "";
    return items.map(r=>{
      const stage=Number(r.stage_key.split("-")[1]);
      const label=deliberationOptionLabel(r.selected_type,options) || "未命名選項";
      return `<span class="history-mini-pill">第 ${stage} 層 ${escapeHtml(label)}</span>`;
    }).join("");
  }

  function renderDeliberationDistribution(list,responses,chartType="bar",options=null,{key="deliberation",totalParticipants=0}={}) {
    if (!list) return;
    const normalized=normalizeTeacherDeliberationOptions(options);
    const counts=new Map(normalized.map(option=>[option.id,0]));
    responses.forEach(r=>{
      const id=String(r.selected_type || "");
      if (counts.has(id)) counts.set(id,counts.get(id)+1);
    });
    const entries=normalized.map((option,index)=>({
      id:option.id,
      label:option.label,
      count:counts.get(option.id)||0,
      order:index,
      color:LIVE_STATS_PALETTE[index%LIVE_STATS_PALETTE.length]
    }));
    if (chartType === "pie") {
      renderLivePieStats(list,entries,{key,totalParticipants,emptyText:"本層還沒有學生提交。"});
    } else {
      renderLiveBarStats(list,entries,{key,totalParticipants,emptyText:"本層還沒有學生提交。"});
    }
  }



  function renderDeliberationControl(snapshot) {
    const panel=$("deliberationSessionControl");
    if (!panel || activeSession?.activityMode !== "layered-deliberation" || activeSession.status === "closed") {
      panel?.classList.add("hidden");
      return;
    }
    panel.classList.remove("hidden");

    const stage=Math.max(1,Math.min(Number(snapshot.current_stage)||1,Number(snapshot.stage_count)||1));
    const total=Math.max(1,Number(snapshot.stage_count)||1);
    const state=snapshot.round_state || activeSession.roundState || "open";
    activeSession.roundState=state;

    const data=snapshot.deliberation_data || {};
    const layers=Array.isArray(data.l) ? data.l : [];
    const layer=layers[stage-1] || {};
    $("deliberationStageBadge").textContent=`第 ${stage} 層 / ${total}`;
    $("deliberationTeacherLayerTitle").textContent=layer.t || `第 ${stage} 層`;
    $("deliberationTeacherLayerContent").textContent=layer.c || "—";
    $("deliberationTeacherCoreQuestion").textContent=layer.q || "—";
    $("deliberationTeacherNote").textContent=layer.n || "";
    $("deliberationTeacherNoteWrap").classList.toggle("hidden",!layer.n);

    const current=(snapshot.responses || []).filter(r=>
      r.mode==="layered-deliberation" &&
      r.stage_key===`layer-${stage}` &&
      (!r.node_ref || activeSession.sessionKind !== "course")
    );
    const unique=new Set(current.map(r=>r.participant_id)).size;
    $("deliberationSubmissionText").textContent=`本層已提交 ${unique} / ${snapshot.participant_count || 0}`;
    $("deliberationRoundStateText").textContent=state==="open" ? "🟢 開放作答" : state==="locked" ? "🔒 已結束作答" : "📊 已公布結果";

    $("deliberationOpenBtn").disabled=state==="open";
    $("deliberationLockBtn").disabled=state!=="open";
    $("deliberationPublishBtn").disabled=state==="published";
    $("deliberationNextBtn").disabled=state!=="published" || stage>=total;
    $("deliberationNextBtn").textContent=stage>=total ? "已到最後一層" : "下一層 →";

    renderDeliberationDistribution(
      $("deliberationTeacherDistribution"),
      current,
      data.chart === "pie" ? "pie" : "bar",
      data.o,
      {
        key:`deliberation:${activeSession?.id || "session"}:${stage}`,
        totalParticipants:snapshot.participant_count || 0
      }
    );
    const reasons=$("deliberationTeacherReasons");
    reasons.innerHTML="";
    const reasonItems=current.filter(r=>String(r.payload?.reason || "").trim());
    if (!reasonItems.length) reasons.innerHTML='<div class="empty-v15">本層還沒有可顯示的理由。</div>';
    else reasonItems.forEach(response=>{
      const item=document.createElement("div");
      item.className=`deliberation-reason-item moderation-item${response.is_hidden ? " hidden-from-projection" : ""}`;
      const content=document.createElement("div");
      content.className="moderation-reason-content";
      const text=document.createElement("p");
      text.textContent=String(response.payload?.reason || "").trim();
      content.appendChild(text);
      const meta=document.createElement("small");
      const identity=document.createElement("span");
      identity.className="moderation-reason-identity";
      identity.textContent=deliberationReasonIdentityMode==="named" ? (response.student_code || "未命名學生") : "匿名學生";
      meta.appendChild(identity);
      meta.appendChild(document.createTextNode(response.is_hidden ? "🙈 已隱藏：學生結果與投影不顯示" : "👁 目前會在公布結果中匿名顯示"));
      content.appendChild(meta);
      item.appendChild(content);
      const button=document.createElement("button");
      button.type="button";
      button.className="btn btn-secondary moderation-toggle-btn";
      button.textContent=response.is_hidden ? "👁 恢復顯示" : "🙈 隱藏理由";
      button.disabled=!response.response_id;
      button.addEventListener("click",()=>toggleDeliberationReasonVisibility(response,button));
      item.appendChild(button);
      reasons.appendChild(item);
    });
  }

  async function toggleDeliberationReasonVisibility(response,button=null) {
    if (!activeSession || activeSession.activityMode !== "layered-deliberation") return;
    if (!response?.response_id) {
      showSessionToast("這筆理由缺少回應識別碼，請更新 Supabase SQL");
      return;
    }
    const nextHidden=!Boolean(response.is_hidden);
    const oldText=button?.textContent || "";
    if (button) { button.disabled=true; button.textContent="更新中…"; }
    try {
      await window.ClassroomSessionAPI.setDeliberationReasonVisibility(activeSession,response.response_id,nextHidden);
      await refreshActiveSession(true);
      showSessionToast(nextHidden ? "這則匿名理由已從學生結果與投影隱藏" : "這則匿名理由已恢復公開");
    } catch (error) {
      showSessionToast(error.message || "匿名理由顯示設定失敗");
      if (button) { button.disabled=false; button.textContent=oldText; }
    }
  }

  function csvCell(value) {
    const text=String(value ?? "").replace(/\r?\n/g,"\n");
    return `"${text.replace(/"/g,'""')}"`;
  }

  function deliberationOptionLabel(code,options=null) {
    const id=String(code || "");
    const match=normalizeTeacherDeliberationOptions(options).find(option=>option.id===id);
    return match?.label || DELIBERATION_OPTION_LABELS[id] || "";
  }

  function buildDeliberationCsv(snapshot) {
    const data=snapshot?.deliberation_data || {};
    const layers=Array.isArray(data.l) ? data.l : [];
    const participants=[...(snapshot?.participants || [])].sort((a,b)=>
      String(a.joined_at || "").localeCompare(String(b.joined_at || "")) ||
      String(a.student_code || "").localeCompare(String(b.student_code || ""),"zh-Hant")
    );
    const anonymous=new Map();
    participants.forEach((p,index)=>anonymous.set(p.id,`P${String(index+1).padStart(2,"0")}`));
    (snapshot?.responses || []).forEach(r=>{
      if (!anonymous.has(r.participant_id)) anonymous.set(r.participant_id,`P${String(anonymous.size+1).padStart(2,"0")}`);
    });
    const responses=(snapshot?.responses || []).filter(r=>r.mode === "layered-deliberation");
    const headers=[
      "場次代碼","活動名稱","匿名參與者","層次","層次標題","本層新增資訊","核心提問",
      "選項代碼","選項文字","原始理由","還需要知道什麼","理由公開狀態","討論後補記","原始提交時間",
      "最後反思：關鍵層次","最後反思：事實／假設／價值","最後反思：具體回應","最後反思：審美延伸"
    ];
    const rows=[headers];
    anonymous.forEach((anonId,participantId)=>{
      const reflection=responses.find(r=>r.participant_id===participantId && r.stage_key==="reflection")?.payload || {};
      for (let stage=1;stage<=Math.max(layers.length,Number(snapshot?.stage_count)||0);stage++) {
        const layer=layers[stage-1] || {};
        const original=responses.find(r=>r.participant_id===participantId && r.stage_key===`layer-${stage}`);
        const post=responses.find(r=>r.participant_id===participantId && r.stage_key===`layer-${stage}-post`);
        rows.push([
          activeSession?.code || snapshot?.code || "",
          activeSession?.title || snapshot?.title || "逐層思辨",
          anonId,
          stage,
          layer.t || `第 ${stage} 層`,
          layer.c || "",
          layer.q || "",
          original?.selected_type || "",
          deliberationOptionLabel(original?.selected_type,data.o),
          original?.payload?.reason || "",
          original?.payload?.needToKnow || "",
          original ? (original.is_hidden ? "已隱藏" : "公開") : "",
          post?.payload?.note || "",
          original?.submitted_at || "",
          reflection.key || "",
          reflection.value || "",
          reflection.action || "",
          reflection.extension || ""
        ]);
      }
    });
    return "\ufeff" + rows.map(row=>row.map(csvCell).join(",")).join("\r\n");
  }

  function downloadTextFile(filename,text,type="text/plain;charset=utf-8") {
    const blob=new Blob([text],{type});
    const url=URL.createObjectURL(blob);
    const link=document.createElement("a");
    link.href=url;
    link.download=filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  async function exportDeliberationResults() {
    if (!activeSession || activeSession.activityMode !== "layered-deliberation") return;
    const button=$("exportDeliberationResultsBtn");
    const oldText=button?.textContent || "";
    if (button) { button.disabled=true; button.textContent="整理中…"; }
    try {
      const snapshot=await window.ClassroomSessionAPI.teacherSnapshot(activeSession);
      const responseCount=(snapshot.responses || []).filter(r=>r.mode === "layered-deliberation").length;
      if (!snapshot.participant_count && !responseCount) throw new Error("目前還沒有可匯出的參與或作答資料");
      const csv=buildDeliberationCsv(snapshot);
      const safeCode=String(activeSession.code || "session").replace(/[^A-Za-z0-9_-]/g,"");
      downloadTextFile(`deliberation-results-${safeCode}.csv`,csv,"text/csv;charset=utf-8");
      showSessionToast("已匯出匿名逐層思辨結果 CSV");
    } catch (error) {
      showSessionToast(error.message || "逐層思辨結果匯出失敗");
    } finally {
      if (button) { button.disabled=false; button.textContent=oldText || "⬇ 匯出思辨結果"; }
    }
  }

  async function setDeliberationRound(roundState) {
    if (!activeSession || activeSession.activityMode !== "layered-deliberation") return false;
    try {
      await window.ClassroomSessionAPI.setDeliberationState(activeSession,{
        stage:activeSession.currentStage || 1,
        roundState
      });
      await refreshActiveSession();
      return true;
    } catch (error) {
      showSessionToast(error.message || "更新逐層思辨狀態失敗");
      return false;
    }
  }

  async function nextDeliberationLayer() {
    if (!activeSession || activeSession.activityMode !== "layered-deliberation") return false;
    if (activeSession.roundState !== "published") {
      showSessionToast("請先公布本層結果，再進入下一層");
      return false;
    }
    const target=Math.min((activeSession.currentStage || 1)+1,activeSession.stageCount || 1);
    if (target === activeSession.currentStage) return false;
    try {
      await window.ClassroomSessionAPI.setDeliberationState(activeSession,{stage:target,roundState:"open"});
      await refreshActiveSession();
      return true;
    } catch (error) {
      showSessionToast(error.message || "公開下一層失敗");
      return false;
    }
  }

  function liveStatsIsShown(key) {
    return liveStatsShown.has(key) ? liveStatsShown.get(key) : false;
  }

  function ensureLiveStatsShell(list,key,answered,totalParticipants) {
    list.classList.add("live-stats-list");
    list._liveStatsKey=key;
    let toolbar=list.querySelector(":scope > .live-stats-toolbar");
    if (!toolbar) {
      toolbar=document.createElement("div");
      toolbar.className="live-stats-toolbar";
      toolbar.innerHTML=`
        <div class="live-stats-status"><span class="live-dot"></span><strong>LIVE</strong><span class="live-stats-count"></span></div>
        <button class="btn btn-secondary live-stats-toggle" type="button"></button>`;
      list.prepend(toolbar);
      toolbar.querySelector(".live-stats-toggle").addEventListener("click",()=>{
        const currentKey=list._liveStatsKey || key;
        liveStatsShown.set(currentKey,!liveStatsIsShown(currentKey));
        list._rerenderLiveStats?.();
      });
    }
    toolbar.querySelector(".live-stats-count").textContent=`已回答 ${answered} / ${Number(totalParticipants)||0}`;
    const shown=liveStatsIsShown(key);
    const button=toolbar.querySelector(".live-stats-toggle");
    button.textContent=shown ? "🙈 隱藏結果" : "✨ 公布結果";
    button.classList.toggle("live-stats-reveal",!shown);
    return shown;
  }

  function renderLiveBarStats(list,entries,{key,totalParticipants=0,emptyText="目前還沒有學生提交。"}={}) {
    if (!list) return;
    const normalized=(entries || []).map((entry,index)=>({
      id:String(entry.id ?? entry.label ?? index),
      label:String(entry.label ?? entry.id ?? "未命名選項"),
      count:Math.max(0,Number(entry.count)||0),
      order:Number.isFinite(Number(entry.order)) ? Number(entry.order) : index,
      color:entry.color || stableLiveStatColor(entry.id || entry.label,index)
    }));
    const answered=normalized.reduce((sum,item)=>sum+item.count,0);
    list._rerenderLiveStats=()=>renderLiveBarStats(list,normalized,{key,totalParticipants,emptyText});
    const shown=ensureLiveStatsShell(list,key,answered,totalParticipants);

    let body=list.querySelector(":scope > .live-stats-body");
    if (!body) {
      body=document.createElement("div");
      body.className="live-stats-body";
      list.appendChild(body);
    }
    body.classList.toggle("results-hidden",!shown);

    const oldPositions=new Map();
    body.querySelectorAll(".live-stat-row").forEach(row=>oldPositions.set(row.dataset.statId,row.getBoundingClientRect().top));
    const existing=new Map([...body.querySelectorAll(".live-stat-row")].map(row=>[row.dataset.statId,row]));
    body.querySelector(":scope > .live-stats-empty")?.remove();

    if (!normalized.length || !answered) {
      existing.forEach(row=>row.remove());
      const empty=document.createElement("div");
      empty.className="empty-v15 live-stats-empty";
      empty.textContent=emptyText;
      body.appendChild(empty);
      return;
    }

    const max=Math.max(...normalized.map(item=>item.count),1);
    const sorted=normalized.slice().sort(shown ? ((a,b)=>b.count-a.count || a.order-b.order) : ((a,b)=>a.order-b.order));
    const keep=new Set(sorted.map(item=>item.id));
    existing.forEach((row,id)=>{ if(!keep.has(id)) row.remove(); });

    sorted.forEach(item=>{
      let row=existing.get(item.id);
      const isNew=!row;
      if (!row) {
        row=document.createElement("div");
        row.className="stage-distribution-row answer-bar-row live-stat-row";
        row.dataset.statId=item.id;
        row.innerHTML=`<span class="live-stat-label"></span><div class="live-stat-track"><i></i></div><strong><span class="live-stat-number">0</span><small>0%</small></strong>`;
      }
      const previousCount=Number(row.dataset.count || 0);
      row.dataset.count=String(item.count);
      row.querySelector(".live-stat-label").textContent=item.label;
      const number=row.querySelector(".live-stat-number");
      const pct=Math.round(item.count/answered*100);
      number.textContent=shown ? String(item.count) : "—";
      row.querySelector("strong small").textContent=shown ? `${pct}%` : "隱藏";
      const fill=row.querySelector(".live-stat-track i");
      fill.style.background=item.color;
      const target=shown && item.count ? Math.max(6,(item.count/max)*100) : 0;
      if (isNew || !shown) fill.style.width="0%";
      body.appendChild(row);
      requestAnimationFrame(()=>{ fill.style.width=`${target}%`; });
      if (!isNew && previousCount!==item.count) {
        row.classList.remove("live-stat-updated");
        void row.offsetWidth;
        row.classList.add("live-stat-updated");
        setTimeout(()=>row.classList.remove("live-stat-updated"),520);
      }
    });

    requestAnimationFrame(()=>{
      body.querySelectorAll(".live-stat-row").forEach(row=>{
        const oldTop=oldPositions.get(row.dataset.statId);
        if (oldTop===undefined) return;
        const delta=oldTop-row.getBoundingClientRect().top;
        if (Math.abs(delta)<1) return;
        row.style.transition="none";
        row.style.transform=`translateY(${delta}px)`;
        requestAnimationFrame(()=>{
          row.style.transition="transform .42s cubic-bezier(.2,.8,.2,1), box-shadow .25s ease, background .25s ease";
          row.style.transform="translateY(0)";
        });
      });
    });
  }

  function renderLivePieStats(list,entries,{key,totalParticipants=0,emptyText="目前還沒有學生提交。"}={}) {
    if (!list) return;
    const normalized=(entries || []).map((entry,index)=>({
      id:String(entry.id ?? entry.label ?? index),label:String(entry.label ?? entry.id ?? "未命名選項"),
      count:Math.max(0,Number(entry.count)||0),order:index,color:entry.color || stableLiveStatColor(entry.id || entry.label,index)
    }));
    const answered=normalized.reduce((sum,item)=>sum+item.count,0);
    list._rerenderLiveStats=()=>renderLivePieStats(list,normalized,{key,totalParticipants,emptyText});
    const shown=ensureLiveStatsShell(list,key,answered,totalParticipants);
    let body=list.querySelector(":scope > .live-stats-body");
    if (!body) { body=document.createElement("div");body.className="live-stats-body";list.appendChild(body); }
    body.classList.toggle("results-hidden",!shown);
    body.innerHTML="";
    if (!answered) { body.innerHTML=`<div class="empty-v15 live-stats-empty">${escapeHtml(emptyText)}</div>`;return; }
    let cursor=0;const slices=[];
    normalized.forEach(item=>{const start=cursor;cursor+=item.count/answered*100;slices.push(`${item.color} ${start}% ${cursor}%`);});
    const wrap=document.createElement("div");wrap.className="answer-pie-layout live-pie-layout";
    const pie=document.createElement("div");pie.className="answer-pie live-answer-pie";
    pie.style.background=shown ? `conic-gradient(${slices.join(",")})` : "conic-gradient(#e7eaf0 0 100%)";
    pie.innerHTML=`<div><strong>${shown?answered:"—"}</strong><span>${shown?"份回答":"結果隱藏"}</span></div>`;
    const legend=document.createElement("div");legend.className="answer-pie-legend";
    normalized.slice().sort((a,b)=>b.count-a.count || a.order-b.order).forEach(item=>{
      const pct=Math.round(item.count/answered*100);
      const node=document.createElement("div");
      node.innerHTML=`<i style="--legend-color:${item.color}"></i><span>${escapeHtml(item.label)}</span><strong>${shown?item.count:"—"}</strong><small>${shown?pct+"%":"隱藏"}</small>`;
      legend.appendChild(node);
    });
    wrap.append(pie,legend);body.appendChild(wrap);
    if (shown) { requestAnimationFrame(()=>wrap.classList.add("live-stats-revealed")); }
  }

  function moduleResponses(snapshot,mode) {
    return (snapshot?.responses || []).filter(response=>
      response.mode===mode &&
      response.stage_key==="final" &&
      (activeSession?.sessionKind!=="course" || !response.node_ref || response.node_ref===activeSession.currentNodeRef)
    );
  }

  function liveStanceRows(snapshot) {
    return moduleResponses(snapshot,"live-stance");
  }

  function liveStanceSummaryFromRows(rows,totalParticipants=0) {
    const counts={left:0,right:0,undecided:0};
    rows.forEach(response=>{
      const side=String(response.selected_type || response.payload?.side || "");
      if(side in counts) counts[side] += 1;
    });
    const sample=rows.find(response=>response.payload?.leftLabel || response.payload?.rightLabel)?.payload || {};
    const decided=counts.left+counts.right;
    const answered=counts.left+counts.right+counts.undecided;
    return {
      counts,
      decided,
      answered,
      totalParticipants:Number(totalParticipants)||0,
      leftLabel:sample.leftLabel || "左側立場",
      rightLabel:sample.rightLabel || "右側立場",
      undecidedLabel:sample.undecidedLabel || "還不確定",
      allowUndecided:sample.allowUndecided !== false,
      question:sample.question || ""
    };
  }

  const liveStanceMetricAnimations=new WeakMap();
  const liveStanceBoardMotion=new WeakMap();

  function animateLiveStanceMetric(element,target,{suffix="",empty=false,duration=320}={}) {
    if(!element)return;
    const previousFrame=liveStanceMetricAnimations.get(element);
    if(previousFrame)cancelAnimationFrame(previousFrame);
    if(empty){
      element.textContent="—";
      liveStanceMetricAnimations.delete(element);
      return;
    }
    const next=Number(target)||0;
    if(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches){
      element.textContent=empty?"—":`${Math.round(next)}${suffix}`;
      liveStanceMetricAnimations.delete(element);
      return;
    }
    const parsed=parseFloat(String(element.textContent||"").replace(/[^0-9.-]/g,""));
    const start=Number.isFinite(parsed)?parsed:next;
    if(Math.abs(start-next)<0.01){
      element.textContent=`${Math.round(next)}${suffix}`;
      liveStanceMetricAnimations.delete(element);
      return;
    }
    const started=performance.now();
    const step=now=>{
      const progress=Math.min(1,(now-started)/duration);
      const eased=1-Math.pow(1-progress,3);
      const value=Math.round(start+(next-start)*eased);
      element.textContent=`${value}${suffix}`;
      if(progress<1){
        liveStanceMetricAnimations.set(element,requestAnimationFrame(step));
      }else{
        liveStanceMetricAnimations.delete(element);
      }
    };
    liveStanceMetricAnimations.set(element,requestAnimationFrame(step));
  }

  function ensureLiveStanceBoardStructure(container,summary) {
    const structureKey=summary.allowUndecided ? "with-undecided" : "without-undecided";
    if(container.dataset.liveStanceStructure===structureKey && container.querySelector("[data-live-stance-role='knot']"))return false;
    container.dataset.liveStanceStructure=structureKey;
    container.style.setProperty("--tug-position","50%");
    container.innerHTML=`
      <div class="live-stance-tug-score left">
        <span data-live-stance-role="left-label"></span>
        <strong data-live-stance-role="left-count">0</strong>
        <small data-live-stance-role="left-pct">—</small>
      </div>
      <div class="live-stance-tug-arena" aria-label="左右立場拉鋸">
        <span class="live-stance-center-flag">中心</span>
        <div class="live-stance-rope" aria-hidden="true"></div>
        <div class="live-stance-knot" data-live-stance-role="knot" title="目前拉鋸位置" aria-hidden="true"><span></span></div>
      </div>
      <div class="live-stance-tug-score right">
        <span data-live-stance-role="right-label"></span>
        <strong data-live-stance-role="right-count">0</strong>
        <small data-live-stance-role="right-pct">—</small>
      </div>
      ${summary.allowUndecided ? `<div class="live-stance-undecided-count"><span data-live-stance-role="undecided-label"></span><strong data-live-stance-role="undecided-count">0</strong></div>` : ""}
    `;
    return true;
  }

  function animateLiveStancePosition(container,target) {
    const numericTarget=Number(target);
    const clamped=Math.max(4,Math.min(96,Number.isFinite(numericTarget)?numericTarget:50));
    if(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches){
      container.style.setProperty("--tug-position",`${clamped}%`);
      return;
    }
    let motion=liveStanceBoardMotion.get(container);
    if(!motion){
      const current=parseFloat(container.style.getPropertyValue("--tug-position")) || 50;
      motion={current,target:clamped,last:performance.now(),raf:0};
      liveStanceBoardMotion.set(container,motion);
    }
    motion.target=clamped;
    if(motion.raf)return;
    const tick=now=>{
      const dt=Math.min(48,Math.max(8,now-motion.last||16));
      motion.last=now;
      const alpha=1-Math.exp(-dt/150);
      motion.current += (motion.target-motion.current)*alpha;
      if(Math.abs(motion.target-motion.current)<0.04)motion.current=motion.target;
      container.style.setProperty("--tug-position",`${motion.current.toFixed(3)}%`);
      if(motion.current!==motion.target){
        motion.raf=requestAnimationFrame(tick);
      }else{
        motion.raf=0;
      }
    };
    motion.raf=requestAnimationFrame(tick);
  }

  function renderLiveStanceBoard(container,summary,{large=false}={}) {
    if(!container)return;
    const left=summary.counts.left || 0;
    const right=summary.counts.right || 0;
    const undecided=summary.counts.undecided || 0;
    const decided=Math.max(0,left+right);
    const leftPct=decided ? Math.round(left/decided*100) : 50;
    const rightPct=decided ? 100-leftPct : 50;
    const knot=decided ? right/decided*100 : 50;
    const fresh=ensureLiveStanceBoardStructure(container,summary);
    container.classList.toggle("large",Boolean(large));
    container.querySelector("[data-live-stance-role='left-label']").textContent=summary.leftLabel || "左側立場";
    container.querySelector("[data-live-stance-role='right-label']").textContent=summary.rightLabel || "右側立場";
    const undecidedLabel=container.querySelector("[data-live-stance-role='undecided-label']");
    if(undecidedLabel)undecidedLabel.textContent=summary.undecidedLabel || "還不確定";
    const leftCount=container.querySelector("[data-live-stance-role='left-count']");
    const rightCount=container.querySelector("[data-live-stance-role='right-count']");
    const leftPctEl=container.querySelector("[data-live-stance-role='left-pct']");
    const rightPctEl=container.querySelector("[data-live-stance-role='right-pct']");
    const undecidedCount=container.querySelector("[data-live-stance-role='undecided-count']");
    if(fresh){
      leftCount.textContent=String(left);
      rightCount.textContent=String(right);
      leftPctEl.textContent=decided?`${leftPct}%`:"—";
      rightPctEl.textContent=decided?`${rightPct}%`:"—";
      if(undecidedCount)undecidedCount.textContent=String(undecided);
    }else{
      animateLiveStanceMetric(leftCount,left);
      animateLiveStanceMetric(rightCount,right);
      animateLiveStanceMetric(leftPctEl,leftPct,{suffix:"%",empty:!decided});
      animateLiveStanceMetric(rightPctEl,rightPct,{suffix:"%",empty:!decided});
      if(undecidedCount)animateLiveStanceMetric(undecidedCount,undecided);
    }
    animateLiveStancePosition(container,knot);
  }

  function liveStanceHistoryArrays(snapshot) {
    const events=(Array.isArray(snapshot?.live_stance_events) ? snapshot.live_stance_events : [])
      .slice().sort((a,b)=>new Date(a.created_at||0)-new Date(b.created_at||0));
    const checkpoints=(Array.isArray(snapshot?.live_stance_checkpoints) ? snapshot.live_stance_checkpoints : [])
      .slice().sort((a,b)=>new Date(a.created_at||0)-new Date(b.created_at||0));
    return {events,checkpoints};
  }

  function liveStanceSideLabel(side,payload={}) {
    if(side==="left") return payload?.leftLabel || "左側立場";
    if(side==="right") return payload?.rightLabel || "右側立場";
    if(side==="undecided") return payload?.undecidedLabel || "還不確定";
    return side || "—";
  }

  function liveStanceSideChip(side,label) {
    const safeSide=["left","right","undecided"].includes(side) ? side : "undecided";
    return `<span class="live-stance-side-chip ${safeSide}">${escapeHtml(label || liveStanceSideLabel(side))}</span>`;
  }

  function buildLiveStanceTrend(events) {
    const states=new Map();
    const counts={left:0,right:0,undecided:0};
    return events.map((event,index)=>{
      const participant=String(event.participant_id || event.student_code || index);
      const previous=states.get(participant) || "";
      if(previous && Object.prototype.hasOwnProperty.call(counts,previous)) counts[previous]=Math.max(0,counts[previous]-1);
      const side=String(event.side || "");
      if(Object.prototype.hasOwnProperty.call(counts,side)) counts[side]+=1;
      states.set(participant,side);
      const answered=counts.left+counts.right+counts.undecided;
      return {
        index,
        createdAt:event.created_at || "",
        left:answered ? counts.left/answered*100 : 0,
        right:answered ? counts.right/answered*100 : 0,
        undecided:answered ? counts.undecided/answered*100 : 0,
        counts:{...counts},
        answered
      };
    });
  }

  function renderLiveStanceTrendChart(container,events,checkpoints) {
    if(!container)return;
    if(!events.length){container.innerHTML='<div class="empty-v15">尚未有立場歷程。</div>';return;}
    const points=buildLiveStanceTrend(events);
    const width=1000,height=260,left=38,right=970,top=24,bottom=220;
    const plotW=right-left,plotH=bottom-top;
    const eventTimes=events.map(event=>new Date(event.created_at || 0).getTime());
    const firstTime=eventTimes[0];
    const lastTime=eventTimes.at(-1);
    const xAt=index=>{
      if(points.length<=1)return left+plotW/2;
      const time=eventTimes[index];
      if(Number.isFinite(time) && Number.isFinite(firstTime) && Number.isFinite(lastTime) && lastTime>firstTime) return left+Math.max(0,Math.min(1,(time-firstTime)/(lastTime-firstTime)))*plotW;
      return left+(index/(points.length-1))*plotW;
    };
    const yAt=pct=>bottom-(Math.max(0,Math.min(100,pct))/100)*plotH;
    const poly=key=>points.map((point,index)=>`${xAt(index).toFixed(1)},${yAt(point[key]).toFixed(1)}`).join(" ");
    const checkpointLines=checkpoints.map((checkpoint,index)=>{
      const time=new Date(checkpoint.created_at || 0).getTime();
      let x=left;
      if(Number.isFinite(time) && lastTime>firstTime) x=left+Math.max(0,Math.min(1,(time-firstTime)/(lastTime-firstTime)))*plotW;
      else if(points.length>1){
        const eventIndex=Math.max(0,events.findLastIndex?.(event=>new Date(event.created_at||0).getTime()<=time) ?? 0);
        x=xAt(eventIndex);
      }
      const label=String(checkpoint.label || `節點 ${index+1}`);
      const short=label.length>14 ? `${label.slice(0,13)}…` : label;
      const labelY=index%2 ? 18 : 10;
      return `<line class="live-stance-trend-checkpoint" x1="${x.toFixed(1)}" y1="${top}" x2="${x.toFixed(1)}" y2="${bottom}"/><text class="live-stance-trend-checkpoint-label" x="${Math.min(right-70,Math.max(left,x+5)).toFixed(1)}" y="${labelY}">${escapeHtml(short)}</text>`;
    }).join("");
    const grid=[0,50,100].map(value=>{
      const y=yAt(value);
      return `<line class="live-stance-trend-grid" x1="${left}" y1="${y}" x2="${right}" y2="${y}"/><text class="live-stance-trend-axis-label" x="4" y="${y+4}">${value}%</text>`;
    }).join("");
    container.innerHTML=`
      <svg class="live-stance-trend-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="全班立場變化趨勢">
        ${grid}
        ${checkpointLines}
        <polyline class="live-stance-trend-left" points="${poly("left")}"/>
        <polyline class="live-stance-trend-right" points="${poly("right")}"/>
        <polyline class="live-stance-trend-undecided" points="${poly("undecided")}"/>
      </svg>
      <div class="live-stance-trend-legend">
        <span><i style="--legend-color:#3b82f6"></i>${escapeHtml(liveStanceSideLabel("left",events.at(-1)?.payload||{}))}</span>
        <span><i style="--legend-color:#ef476f"></i>${escapeHtml(liveStanceSideLabel("right",events.at(-1)?.payload||{}))}</span>
        <span><i style="--legend-color:#8b95a5"></i>${escapeHtml(liveStanceSideLabel("undecided",events.at(-1)?.payload||{}))}</span>
      </div>`;
  }

  function renderLiveStanceHistory(snapshot,summary) {
    const {events,checkpoints}=liveStanceHistoryArrays(snapshot);
    const changes=events.filter(event=>event.previous_side && event.previous_side!==event.side);
    const changedStudents=new Set(changes.map(event=>event.participant_id || event.student_code)).size;
    const badge=$("liveStanceHistoryBadge");
    if(badge) badge.textContent=`${changes.length} 次變動`;
    const metrics=$("liveStanceHistoryMetrics");
    if(metrics) metrics.innerHTML=`
      <div class="live-stance-history-metric"><span>累積換邊</span><strong>${changes.length}</strong></div>
      <div class="live-stance-history-metric"><span>曾改變學生</span><strong>${changedStudents}</strong></div>
      <div class="live-stance-history-metric"><span>說明節點</span><strong>${checkpoints.length}</strong></div>`;
    renderLiveStanceTrendChart($("liveStanceTrendChart"),events,checkpoints);

    const checkpointList=$("liveStanceCheckpointList");
    if(checkpointList){
      checkpointList.innerHTML="";
      if(!checkpoints.length) checkpointList.innerHTML='<div class="empty-v15">尚未記錄節點。</div>';
      checkpoints.slice().reverse().forEach(checkpoint=>{
        const snap=checkpoint.snapshot || {};
        const node=document.createElement("div");node.className="live-stance-checkpoint-item";
        node.innerHTML=`<div class="live-stance-checkpoint-item-head"><strong>${escapeHtml(checkpoint.label || "未命名節點")}</strong><span class="live-stance-history-time">${escapeHtml(formatTime(checkpoint.created_at))}</span></div>
          <div class="live-stance-checkpoint-dist"><span class="left">${escapeHtml(summary.leftLabel)} ${Number(snap.left)||0}</span><span class="right">${escapeHtml(summary.rightLabel)} ${Number(snap.right)||0}</span>${summary.allowUndecided?`<span class="undecided">${escapeHtml(summary.undecidedLabel)} ${Number(snap.undecided)||0}</span>`:""}</div>`;
        const head=node.querySelector(".live-stance-checkpoint-item-head");
        const del=document.createElement("button");del.type="button";del.className="live-stance-checkpoint-delete";del.textContent="×";del.title="刪除此節點";
        del.addEventListener("click",()=>removeLiveStanceCheckpoint(checkpoint.id));head?.appendChild(del);
        checkpointList.appendChild(node);
      });
    }

    const eventList=$("liveStanceEventList");
    if(eventList){
      eventList.innerHTML="";
      if(!events.length) eventList.innerHTML='<div class="empty-v15">尚未有立場變動。</div>';
      events.slice(-12).reverse().forEach(event=>{
        const node=document.createElement("div");node.className="live-stance-event-item";
        const side=String(event.side || "");
        const prev=String(event.previous_side || "");
        const currentLabel=liveStanceSideLabel(side,event.payload||{});
        const previousLabel=prev ? liveStanceSideLabel(prev,event.payload||{}) : "開始";
        node.innerHTML=`<div class="live-stance-event-item-head"><strong>${escapeHtml(event.student_code || "學生")}</strong><span class="live-stance-history-time">${escapeHtml(formatTime(event.created_at))}</span></div><div class="live-stance-event-transition">${prev?liveStanceSideChip(prev,previousLabel):'<span class="live-stance-side-chip undecided">開始</span>'}<span class="live-stance-event-arrow">→</span>${liveStanceSideChip(side,currentLabel)}</div>`;
        eventList.appendChild(node);
      });
    }
  }

  async function createLiveStanceCheckpointFromUi() {
    if(!activeSession || activeSession.activityMode!=="live-stance")return;
    const button=$("liveStanceCheckpointBtn"),input=$("liveStanceCheckpointLabel");
    if(button)button.disabled=true;
    try{
      await window.ClassroomSessionAPI.createLiveStanceCheckpoint(activeSession,input?.value || "");
      if(input)input.value="";
      await refreshActiveSession(true);
      showSessionToast("已記錄目前的全班立場節點");
    }catch(error){showSessionToast(error.message || "記錄立場節點失敗");}
    finally{if(button)button.disabled=false;}
  }

  async function removeLiveStanceCheckpoint(checkpointId) {
    if(!activeSession || activeSession.activityMode!=="live-stance")return;
    try{
      await window.ClassroomSessionAPI.deleteLiveStanceCheckpoint(activeSession,checkpointId);
      await refreshActiveSession(true);
      showSessionToast("已刪除立場節點");
    }catch(error){showSessionToast(error.message || "刪除立場節點失敗");}
  }

  function renderLiveStanceControl(snapshot) {
    const panel=$("liveStanceSessionControl");
    if(!panel || activeSession?.activityMode!=="live-stance" || activeSession.status==="closed"){panel?.classList.add("hidden");if(activeSession?.status==="closed")closeLiveStanceProjection();return;}
    panel.classList.remove("hidden");
    const rows=liveStanceRows(snapshot);
    const total=Number(snapshot?.participant_count)||0;
    const summary=liveStanceSummaryFromRows(rows,total);
    const state=snapshot?.round_state || activeSession.roundState || "open";
    activeSession.roundState=state;
    $("liveStanceStateBadge").textContent=state==="locked" ? "🔒 已鎖定" : "⚡ 開放表態";
    $("liveStanceAnsweredText").textContent=`已表態 ${summary.answered} / ${total}`;
    $("liveStanceOpenBtn").disabled=state==="open";
    $("liveStanceLockBtn").disabled=state==="locked";
    renderLiveStanceBoard($("liveStanceTugBoard"),summary);
    renderLiveStanceHistory(snapshot,summary);
    updateLiveStanceProjection(summary,state);
  }

  async function changeLiveStanceState(roundState) {
    if(!activeSession || activeSession.activityMode!=="live-stance" || activeSession.status==="closed")return;
    try{
      await window.ClassroomSessionAPI.setLiveStanceState(activeSession,roundState);
      await refreshActiveSession();
      showSessionToast(roundState==="locked" ? "已鎖定學生表態" : "已重新開放學生表態");
    }catch(error){showSessionToast(error.message || "更新立場拉鋸狀態失敗");}
  }

  function updateLiveStanceProjection(summary=null,state=null) {
    const overlay=$("liveStanceProjectionOverlay");
    if(!overlay || overlay.classList.contains("hidden"))return;
    const rows=liveStanceRows(latestTeacherSnapshot || {});
    const total=Number(latestTeacherSnapshot?.participant_count)||0;
    const data=summary || liveStanceSummaryFromRows(rows,total);
    $("liveStanceProjectionQuestion").textContent=data.question || activeSession?.title || "即時立場拉鋸";
    const latestCheckpoint=(latestTeacherSnapshot?.live_stance_checkpoints || []).slice().sort((a,b)=>new Date(a.created_at||0)-new Date(b.created_at||0)).at(-1);
    $("liveStanceProjectionMeta").textContent=`${state==="locked"?"已鎖定":"即時更新"} · 已表態 ${data.answered} / ${total}${latestCheckpoint?.label?` · ${latestCheckpoint.label}`:""}`;
    renderLiveStanceBoard($("liveStanceProjectionBoard"),data,{large:true});
  }

  function openLiveStanceProjection() {
    const overlay=$("liveStanceProjectionOverlay");
    if(!overlay)return;
    overlay.classList.remove("hidden");
    updateLiveStanceProjection();
    try { overlay.requestFullscreen?.(); } catch {}
  }

  function closeLiveStanceProjection() {
    const overlay=$("liveStanceProjectionOverlay");
    overlay?.classList.add("hidden");
    if(document.fullscreenElement===overlay){
      try { document.exitFullscreen?.(); } catch {}
    }
  }

  function renderScaleControl(snapshot) {
    const panel=$("scaleSessionControl");
    if (!panel || activeSession?.activityMode!=="scale-spectrum" || activeSession.status==="closed") { panel?.classList.add("hidden"); return; }
    panel.classList.remove("hidden");
    const responses=moduleResponses(snapshot,"scale-spectrum");
    const total=Number(snapshot?.participant_count)||0;
    $("scaleAnsweredBadge").textContent=`${new Set(responses.map(r=>r.participant_id)).size} / ${total}`;
    const sample=responses.find(r=>Number(r.payload?.pointCount)>0);
    const count=sample ? Math.max(3,Math.min(10,Number(sample?.payload?.pointCount)||5)) : 0;
    const counts=count ? Array.from({length:count},(_,index)=>({id:String(index+1),label:String(index+1),count:0,order:index})) : [];
    const values=[];
    responses.forEach(response=>{
      const value=Number(response.payload?.value ?? response.selected_type);
      if (!Number.isFinite(value) || value<1 || value>count) return;
      counts[value-1].count++;values.push(value);
    });
    const key=`scale:${activeSession?.id || ""}:${activeSession?.currentNodeRef || "activity"}`;
    renderLiveBarStats($("scaleLiveDistribution"),counts,{key,totalParticipants:total,emptyText:"目前還沒有學生提交量表。"});
    const shown=liveStatsIsShown(key);
    values.sort((a,b)=>a-b);
    const avg=values.length ? values.reduce((sum,value)=>sum+value,0)/values.length : 0;
    const median=values.length ? (values.length%2 ? values[(values.length-1)/2] : (values[values.length/2-1]+values[values.length/2])/2) : 0;
    $("scaleAverageValue").textContent=shown&&values.length ? avg.toFixed(2).replace(/\.00$/,"") : "—";
    $("scaleMedianValue").textContent=shown&&values.length ? String(median) : "—";
    $("scaleEndpointLabels").textContent=sample
      ? `${sample.payload?.leftLabel || "低"} ← 1 ～ ${count} → ${sample.payload?.rightLabel || "高"}`
      : "等待第一份量表作答後顯示量尺設定";
    const list=$("scaleLiveDistribution");
    if (list) list._rerenderLiveStats=()=>renderScaleControl(snapshot);
  }

  function renderRankingControl(snapshot) {
    const panel=$("rankingSessionControl");
    if (!panel || activeSession?.activityMode!=="ranking" || activeSession.status==="closed") { panel?.classList.add("hidden"); return; }
    panel.classList.remove("hidden");
    const responses=moduleResponses(snapshot,"ranking");
    const total=Number(snapshot?.participant_count)||0;
    $("rankingAnsweredBadge").textContent=`${new Set(responses.map(r=>r.participant_id)).size} / ${total}`;
    const firstCounts=new Map();
    const rankTotals=new Map();
    const rankCounts=new Map();
    responses.forEach(response=>{
      const labels=Array.isArray(response.payload?.orderLabels) ? response.payload.orderLabels : [];
      labels.forEach((label,index)=>{
        const name=String(label || "").trim();if(!name)return;
        rankTotals.set(name,(rankTotals.get(name)||0)+(index+1));
        rankCounts.set(name,(rankCounts.get(name)||0)+1);
      });
      const first=String(labels[0] || response.payload?.selectedTypeName || "").trim();
      if(first) firstCounts.set(first,(firstCounts.get(first)||0)+1);
    });
    const labels=[...new Set([...rankTotals.keys(),...firstCounts.keys()])].sort((a,b)=>a.localeCompare(b,"zh-Hant"));
    const entries=labels.map((label,index)=>({id:label,label,count:firstCounts.get(label)||0,order:index}));
    const key=`ranking:${activeSession?.id || ""}:${activeSession?.currentNodeRef || "activity"}`;
    renderLiveBarStats($("rankingFirstDistribution"),entries,{key,totalParticipants:total,emptyText:"目前還沒有學生提交排序。"});
    const shown=liveStatsIsShown(key);
    const averageList=$("rankingAverageList");averageList.innerHTML="";
    if (!labels.length) { averageList.innerHTML='<div class="empty-v15">目前還沒有平均排名資料。</div>'; }
    else {
      labels.map(label=>({label,average:(rankTotals.get(label)||0)/Math.max(1,rankCounts.get(label)||0),first:firstCounts.get(label)||0}))
        .sort(shown
          ? ((a,b)=>a.average-b.average || b.first-a.first || a.label.localeCompare(b.label,"zh-Hant"))
          : ((a,b)=>a.label.localeCompare(b.label,"zh-Hant")))
        .forEach((item,index)=>{
          const row=document.createElement("div");row.className="ranking-average-row";
          row.innerHTML=`<span>${index+1}</span><strong>${escapeHtml(item.label)}</strong><b>${shown?item.average.toFixed(2).replace(/\.00$/,""):"—"}</b>`;
          averageList.appendChild(row);
        });
    }
    const list=$("rankingFirstDistribution");
    if (list) list._rerenderLiveStats=()=>renderRankingControl(snapshot);
  }

  const WORD_CLOUD_STOP_WORDS=new Set(["的","了","是","在","我","有","和","就","也","都","很","不","與","及","或","而","被","把","讓","要","會","可以","因為","所以","如果","一個","這個","那個","覺得","認為"]);
  function tokenizeWordCloud(text) {
    const source=String(text||"").trim();if(!source)return [];
    let tokens=[];
    try {
      if(typeof Intl?.Segmenter==="function"){
        const seg=new Intl.Segmenter("zh-Hant",{granularity:"word"});
        tokens=[...seg.segment(source)].filter(item=>item.isWordLike).map(item=>item.segment);
      }
    } catch {}
    if(!tokens.length) tokens=source.split(/[\s、，。！？；：,.!?;:()（）「」『』【】\[\]{}]+/);
    return tokens.map(token=>token.trim().toLowerCase()).filter(token=>token.length>=2 && token.length<=12 && !WORD_CLOUD_STOP_WORDS.has(token) && !/^\d+$/.test(token));
  }
  function renderTeacherWordCloud(container,responses) {
    const counts=new Map();responses.forEach(response=>tokenizeWordCloud(response.payload?.text).forEach(token=>counts.set(token,(counts.get(token)||0)+1)));
    const words=[...counts.entries()].map(([text,count])=>({text,count})).sort((a,b)=>b.count-a.count || a.text.localeCompare(b.text,"zh-Hant")).slice(0,40);
    container.innerHTML="";if(!words.length){container.innerHTML='<div class="empty-v15">目前還沒有足夠的關鍵詞可建立詞雲。</div>';return;}
    const max=Math.max(...words.map(item=>item.count),1),min=Math.min(...words.map(item=>item.count),1);
    words.forEach((item,index)=>{const span=document.createElement("span");span.className="teacher-word-cloud-item";span.textContent=item.text;span.title=`${item.count} 次`;const ratio=max===min?0.55:(item.count-min)/(max-min);span.style.fontSize=`${Math.round(16+ratio*28)}px`;span.style.setProperty("--word-cloud-color",stableLiveStatColor(item.text,index));container.appendChild(span);});
  }

  function renderOpenTextControl(snapshot) {
    const panel=$("openTextSessionControl");
    if (!panel || activeSession?.activityMode!=="open-text" || activeSession.status==="closed") { panel?.classList.add("hidden"); return; }
    panel.classList.remove("hidden");
    const responses=moduleResponses(snapshot,"open-text").filter(response=>String(response.payload?.text||"").trim());
    const total=Number(snapshot?.participant_count)||0;
    $("openTextAnsweredCount").textContent=`已回答 ${new Set(responses.map(r=>r.participant_id)).size} / ${total}`;
    const wall=$("openTextWall"),cloud=$("openTextWordCloud");
    wall.classList.toggle("hidden",openTextViewMode!=="wall");cloud?.classList.toggle("hidden",openTextViewMode!=="cloud");
    wall.innerHTML="";
    if (!responses.length) { wall.innerHTML='<div class="empty-v15">目前還沒有學生提交文字。</div>'; if(cloud)renderTeacherWordCloud(cloud,[]); return; }
    responses.slice().sort((a,b)=>new Date(b.submitted_at||0)-new Date(a.submitted_at||0)).forEach(response=>{
      const card=document.createElement("article");card.className="open-text-wall-card";
      const identity=openTextIdentityMode==="named" ? (response.student_code || "未命名學生") : "匿名學生";
      card.innerHTML=`<div class="open-text-wall-meta-row"><strong>${escapeHtml(identity)}</strong><small>${escapeHtml(formatTime(response.submitted_at))}</small></div><p>${escapeHtml(response.payload.text)}</p>`;
      wall.appendChild(card);
    });
    if(cloud)renderTeacherWordCloud(cloud,responses);
  }

  function renderQuestionWallControl(snapshot) {
    const panel=$("questionWallSessionControl");
    if(!panel || activeSession?.activityMode!=="question-wall" || activeSession.status==="closed"){panel?.classList.add("hidden");return;}
    panel.classList.remove("hidden");
    const posts=[...(Array.isArray(snapshot?.question_wall_posts)?snapshot.question_wall_posts:[])];
    posts.sort(questionWallSortMode==="new"
      ? ((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0))
      : ((a,b)=>(Number(b.vote_count)||0)-(Number(a.vote_count)||0) || new Date(b.created_at||0)-new Date(a.created_at||0)));
    const totalReplies=posts.reduce((sum,post)=>sum+(Array.isArray(post.replies)?post.replies.length:(Number(post.reply_count)||0)),0);
    $("questionWallPostCount").textContent=`目前 ${posts.length} 則提問 · ${totalReplies} 則回應`;
    const list=$("questionWallTeacherList");list.innerHTML="";
    if(!posts.length){list.innerHTML='<div class="empty-v15">目前還沒有學生提問。</div>';return;}
    posts.forEach((post,index)=>{
      const card=document.createElement("article");card.className="question-wall-card";
      const identity=questionWallIdentityMode==="named" ? (post.student_code||"未命名學生") : "匿名學生";
      const replies=Array.isArray(post.replies)?post.replies:[],expanded=questionWallTeacherExpandedPosts.has(String(post.id||""));
      card.innerHTML=`<div class="question-wall-card-head"><strong>${escapeHtml(identity)} · #${index+1}</strong><small>${escapeHtml(formatTime(post.created_at))}</small></div><p>${escapeHtml(post.text||"")}</p><div class="question-wall-card-footer"><div class="question-wall-card-actions"><span class="question-wall-vote-btn" aria-label="認同數">＋1 <b>${Math.max(0,Number(post.vote_count)||0)}</b></span><button class="question-wall-reply-toggle" type="button" aria-expanded="${expanded}">💬 回應 <b>${replies.length}</b></button></div><button class="question-wall-delete-btn" type="button">刪除提問</button></div><div class="question-wall-replies teacher-replies ${expanded?"":"hidden"}"></div>`;
      card.querySelector(".question-wall-reply-toggle")?.addEventListener("click",()=>{const id=String(post.id||"");if(questionWallTeacherExpandedPosts.has(id))questionWallTeacherExpandedPosts.delete(id);else questionWallTeacherExpandedPosts.add(id);renderQuestionWallControl(snapshot);});
      const replyBox=card.querySelector(".question-wall-replies");
      if(replyBox&&expanded){
        if(!replies.length)replyBox.innerHTML='<div class="question-wall-reply-empty">目前還沒有同儕回應。</div>';
        else replies.slice().sort((a,b)=>new Date(a.created_at||0)-new Date(b.created_at||0)).forEach((reply,replyIndex)=>{
          const row=document.createElement("div");row.className="question-wall-reply teacher-question-wall-reply";
          const replyIdentity=questionWallIdentityMode==="named"?(reply.student_code||"未命名學生"):"匿名同學";
          row.innerHTML=`<div class="question-wall-reply-head"><strong>${escapeHtml(replyIdentity)} · #${replyIndex+1}</strong><small>${escapeHtml(formatTime(reply.updated_at||reply.created_at))}</small></div><p>${escapeHtml(reply.text||"")}</p><div class="question-wall-reply-tools"><button class="question-wall-delete-btn" type="button">刪除回應</button></div>`;
          row.querySelector(".question-wall-delete-btn")?.addEventListener("click",async()=>{
            if(!confirm("確定要移除這則同儕回應嗎？"))return;
            try{await window.ClassroomSessionAPI.deleteQuestionWallReply(activeSession,reply.id);await refreshActiveSession();showSessionToast("回應已移除");}
            catch(error){showSessionToast(error.message||"移除回應失敗");}
          });
          replyBox.appendChild(row);
        });
      }
      card.querySelector(".question-wall-card-footer > .question-wall-delete-btn")?.addEventListener("click",async()=>{
        if(!confirm("確定要從提問牆移除這則問題嗎？相關回應也會一起移除。"))return;
        try{await window.ClassroomSessionAPI.deleteQuestionWallPost(activeSession,post.id);questionWallTeacherExpandedPosts.delete(String(post.id||""));await refreshActiveSession();showSessionToast("提問已移除");}
        catch(error){showSessionToast(error.message||"移除提問失敗");}
      });
      list.appendChild(card);
    });
  }
  function sessionResponsesForMode(snapshot,mode){return (snapshot?.responses||[]).filter(response=>response.mode===mode && (activeSession?.sessionKind!=="course" || !response.node_ref || response.node_ref===activeSession.currentNodeRef));}
  function groupConsensusEntriesFromSnapshot(snapshot,kind="individual") {
    const source=kind==="group"?(snapshot?.group_submissions||[]):sessionResponsesForMode(snapshot,"group-consensus").filter(row=>row.stage_key==="individual");
    const grouped=new Map();
    const configured=Array.isArray(activeSession?.moduleData?.options)?activeSession.moduleData.options:[];
    configured.forEach((option,index)=>grouped.set(String(option.id),{id:String(option.id),label:String(option.label||`選項 ${index+1}`),count:0,order:index}));
    source.forEach((row,index)=>{const id=String(row.selected_type||"");const label=String(row.payload?.selectedTypeName||id||"未命名選項");if(!grouped.has(id))grouped.set(id,{id,label,count:0,order:configured.length+index});grouped.get(id).count++;});
    return [...grouped.values()].sort((a,b)=>a.order-b.order||a.label.localeCompare(b.label,"zh-Hant"));
  }

  async function assignGroupConsensusGroups(){
    if(!activeSession||activeSession.activityMode!=="group-consensus")return;
    const size=Math.max(2,Math.min(6,Math.round(Number($("groupConsensusTeacherGroupSize")?.value)||Number(activeSession?.moduleData?.groupSize)||4)));
    const existing=latestTeacherSnapshot?.groups||[],submissions=latestTeacherSnapshot?.group_submissions||[];
    if((existing.length||submissions.length)&&!confirm("重新分組會清除目前的小組共識結果。確定要重新分組嗎？"))return;
    try{await window.ClassroomSessionAPI.assignSessionGroups(activeSession,size);showSessionToast("已完成自動分組");await refreshActiveSession();}catch(error){showSessionToast(error.message||"自動分組失敗");}
  }

  async function setGroupConsensusPhase(stage){
    if(!activeSession||activeSession.activityMode!=="group-consensus")return;
    try{
      if(stage>=2 && !(latestTeacherSnapshot?.groups||[]).length){await window.ClassroomSessionAPI.assignSessionGroups(activeSession,Math.max(2,Math.min(6,Math.round(Number($("groupConsensusTeacherGroupSize")?.value)||Number(activeSession?.moduleData?.groupSize)||4))));}
      await window.ClassroomSessionAPI.setStage(activeSession,stage>=2?2:1);await refreshActiveSession();
    }catch(error){showSessionToast(error.message||"切換小組共識階段失敗");}
  }

  function renderGroupConsensusControl(snapshot){
    const panel=$("groupConsensusSessionControl");if(!panel||activeSession?.activityMode!=="group-consensus"||activeSession.status==="closed"){panel?.classList.add("hidden");return;}panel.classList.remove("hidden");
    const stage=Math.max(1,Number(snapshot?.current_stage)||1),total=Number(snapshot?.participant_count)||0,groups=Array.isArray(snapshot?.groups)?snapshot.groups:[],submissions=Array.isArray(snapshot?.group_submissions)?snapshot.group_submissions:[];
    $("groupConsensusPhaseBadge").textContent=stage>=2?"小組討論":"個人作答";
    $("groupConsensusIndividualBtn").disabled=stage<2;$("groupConsensusGroupBtn").disabled=stage>=2;
    const sizeInput=$("groupConsensusTeacherGroupSize");if(sizeInput&&!sizeInput.dataset.initialized){sizeInput.value=String(Math.max(2,Math.min(6,Number(activeSession?.moduleData?.groupSize)||4)));sizeInput.dataset.initialized="1";}
    const individual=sessionResponsesForMode(snapshot,"group-consensus").filter(row=>row.stage_key==="individual");
    renderLiveBarStats($("groupConsensusIndividualDistribution"),groupConsensusEntriesFromSnapshot(snapshot,"individual"),{key:`gc-individual:${activeSession.id}`,totalParticipants:total,emptyText:"目前還沒有個人判斷。"});
    renderLiveBarStats($("groupConsensusGroupDistribution"),groupConsensusEntriesFromSnapshot(snapshot,"group"),{key:`gc-group:${activeSession.id}`,totalParticipants:groups.length,emptyText:"目前還沒有小組共識。"});
    const individualDone=new Set(individual.map(row=>row.participant_id)).size;
    $("groupConsensusTeacherHint").textContent=stage>=2
      ? `個人完成 ${individualDone} / ${total} · 小組共識 ${submissions.length} / ${groups.length || 0}${groups.length?"":"（尚未分組）"}`
      : `個人完成 ${individualDone} / ${total} · 小組階段尚未開放`;
    $("groupConsensusGroupMeta").textContent=groups.length?`${groups.length} 組 · ${submissions.length} 組已提交`:`尚未分組 · ${total} 位學生已加入`;
    const list=$("groupConsensusGroupList");list.innerHTML="";
    if(!groups.length){list.innerHTML='<div class="empty-v15">學生加入後，可按「自動分組」建立討論小組。</div>';return;}
    const subByGroup=new Map(submissions.map(row=>[String(row.group_id),row]));
    groups.slice().sort((a,b)=>(Number(a.group_index)||0)-(Number(b.group_index)||0)).forEach(group=>{const submission=subByGroup.get(String(group.id));const card=document.createElement("article");card.className="group-consensus-teacher-group";const members=(group.members||[]).map(member=>member.student_code).filter(Boolean);card.innerHTML=`<div class="group-consensus-teacher-group-head"><div><span class="summary-label">${escapeHtml(group.label||"小組")}</span><strong>${members.map(escapeHtml).join("、")||"尚無組員"}</strong></div><span class="stage-badge">${members.length} 人</span></div>${submission?`<div class="group-consensus-result"><b>${escapeHtml(submission.payload?.selectedTypeName||submission.selected_type||"—")}</b><p>${escapeHtml(submission.payload?.reason||"未填寫共識理由")}</p><small>最後更新：${escapeHtml(submission.submitted_by_code||"組員")} · ${escapeHtml(formatTime(submission.updated_at||submission.submitted_at))}</small></div>`:'<div class="group-consensus-result empty"><span>尚未提交小組共識</span></div>'}`;list.appendChild(card);});
    const indList=$("groupConsensusIndividualDistribution");if(indList)indList._rerenderLiveStats=()=>renderGroupConsensusControl(snapshot);const grpList=$("groupConsensusGroupDistribution");if(grpList)grpList._rerenderLiveStats=()=>renderGroupConsensusControl(snapshot);
  }

  function renderGroupConsensusSessionSummary({snapshot,details,participants}){
    const individuals=sessionResponsesForMode(snapshot,"group-consensus").filter(row=>row.stage_key==="individual"),groups=snapshot?.groups||[],submissions=snapshot?.group_submissions||[];
    const individualCount=new Set(individuals.map(row=>row.participant_id)).size;$("summaryCompletionRate").textContent=participants?`${Math.round((individualCount/participants)*100)}%`:"—";
    const changedGroups=submissions.filter(sub=>{const group=(groups||[]).find(g=>String(g.id)===String(sub.group_id));if(!group)return false;const memberIds=new Set((group.members||[]).map(m=>m.participant_id));const choices=individuals.filter(r=>memberIds.has(r.participant_id)).map(r=>r.selected_type);return choices.length&&choices.some(choice=>choice!==sub.selected_type);}).length;
    const section=document.createElement("section");section.className="summary-section";section.innerHTML=`<div class="summary-section-head"><strong>小組共識摘要</strong><span>${submissions.length} / ${groups.length} 組已提交</span></div><div class="wave-metrics"><div><span>個人完成</span><strong>${individualCount} / ${participants}</strong></div><div><span>已形成共識</span><strong>${submissions.length} 組</strong></div><div><span>討論後出現不同共識</span><strong>${changedGroups} 組</strong></div></div><div class="summary-node-list"></div>`;
    const list=section.querySelector(".summary-node-list");groups.forEach(group=>{const sub=submissions.find(row=>String(row.group_id)===String(group.id));const row=document.createElement("div");row.className="summary-node-row";row.innerHTML=`<div class="summary-node-main"><strong>${escapeHtml(group.label||"小組")}</strong><small>${escapeHtml((group.members||[]).map(m=>m.student_code).join("、"))}</small></div><b>${escapeHtml(sub?.payload?.selectedTypeName||sub?.selected_type||"未提交")}</b>`;list.appendChild(row);});if(!groups.length)list.innerHTML='<div class="empty-v15">這次 Session 尚未建立小組。</div>';details.appendChild(section);return true;
  }

  function renderPredictRevealControl(snapshot) {
    const panel=$("predictRevealSessionControl");if(!panel||activeSession?.activityMode!=="predict-reveal"||activeSession.status==="closed"){panel?.classList.add("hidden");return;}panel.classList.remove("hidden");
    const stage=Math.max(1,Number(activeSession.currentStage)||1),keyName=stage>=2?"final":"initial",responses=sessionResponsesForMode(snapshot,"predict-reveal"),current=responses.filter(r=>r.stage_key===keyName),total=Number(snapshot?.participant_count)||0;
    $("predictPhaseBadge").textContent=stage>=2?"再次判斷":"預測階段";$("predictPhaseText").textContent=stage>=2?"已揭曉資訊，學生正在再次判斷":"學生正在進行初次預測";$("predictAnsweredText").textContent=`本階段已提交 ${new Set(current.map(r=>r.participant_id)).size} / ${total}`;
    $("predictBackBtn").disabled=stage<=1;$("predictRevealBtn").disabled=stage>=2;$("predictRevealBtn").textContent=stage>=2?"已揭曉並開放再次判斷":"揭曉並開放再次判斷 →";
    renderLiveBarStats($("predictLiveDistribution"),collectLiveClassificationEntries(current),{key:`predict:${activeSession?.id||""}:${keyName}`,totalParticipants:total,emptyText:"目前還沒有學生提交。"});
    const finals=responses.filter(r=>r.stage_key==="final"),summary=$("predictChangeSummary");if(stage>=2&&finals.length){const changed=finals.filter(r=>Boolean(r.payload?.changed)).length;$("predictChangedCount").textContent=changed;$("predictUnchangedCount").textContent=finals.length-changed;summary.classList.remove("hidden");}else summary.classList.add("hidden");
  }
  async function changePredictPhase(delta){if(!activeSession||activeSession.activityMode!=="predict-reveal")return;const target=Math.max(1,Math.min((activeSession.currentStage||1)+delta,2));try{await window.ClassroomSessionAPI.setStage(activeSession,target);await refreshActiveSession();}catch(error){showSessionToast(error.message||"更新預測揭曉階段失敗");}}
  function renderStanceMapControl(snapshot){
    const panel=$("stanceMapSessionControl");if(!panel||activeSession?.activityMode!=="stance-map"||activeSession.status==="closed"){panel?.classList.add("hidden");return;}panel.classList.remove("hidden");const responses=moduleResponses(snapshot,"stance-map").filter(r=>Number.isFinite(Number(r.payload?.x))&&Number.isFinite(Number(r.payload?.y))),total=Number(snapshot?.participant_count)||0;$("stanceAnsweredBadge").textContent=`${new Set(responses.map(r=>r.participant_id)).size} / ${total}`;
    const map=$("stanceTeacherMap");map.innerHTML='<i class="stance-cross stance-cross-x"></i><i class="stance-cross stance-cross-y"></i>';responses.forEach((r,index)=>{const point=document.createElement("span");point.className="stance-cloud-point";point.style.left=`${Math.max(0,Math.min(100,Number(r.payload.x)))}%`;point.style.bottom=`${Math.max(0,Math.min(100,Number(r.payload.y)))}%`;point.style.setProperty("--point-color",stableLiveStatColor(r.participant_id||index,index));point.title="匿名學生";map.appendChild(point);});
    const avgX=responses.length?responses.reduce((sum,r)=>sum+Number(r.payload.x),0)/responses.length:0,avgY=responses.length?responses.reduce((sum,r)=>sum+Number(r.payload.y),0)/responses.length:0;$("stanceAverageX").textContent=responses.length?avgX.toFixed(1):"—";$("stanceAverageY").textContent=responses.length?avgY.toFixed(1):"—";const sample=responses[0]?.payload;$("stanceTeacherAxes").textContent=sample?`X：${sample.xLeft||"左"} → ${sample.xRight||"右"}｜Y：${sample.yBottom||"下"} → ${sample.yTop||"上"}`:"等待第一份作答後顯示座標設定";
  }
  function confidenceStageKeyForSession(stageOverride=null){const mode=activeSession?.activityMode,stage=Math.max(1,Number(stageOverride ?? activeSession?.currentStage)||1);if(mode==="progressive-reveal")return `clue-${stage}`;if(mode==="open-classification"||mode==="predict-reveal")return stage>=2?"final":"initial";if(mode==="layered-deliberation")return `layer-${stage}`;return "final";}
  function buildPresentationConfidence(responses,currentStage){
    const stageKey=confidenceStageKeyForSession(currentStage);
    const rows=(responses||[]).filter(r=>r.stage_key===stageKey&&r.payload?.confidence);
    if(!rows.length)return null;
    const sample=rows[0].payload.confidence,count=Math.max(3,Math.min(7,Number(sample.pointCount)||5));
    const distribution=Array.from({length:count},(_,index)=>({name:String(index+1),count:0}));
    const values=[];
    rows.forEach(r=>{const value=Number(r.payload?.confidence?.value);if(Number.isFinite(value)&&value>=1&&value<=count){distribution[value-1].count++;values.push(value);}});
    const average=values.length?values.reduce((sum,value)=>sum+value,0)/values.length:0;
    return {answered:new Set(rows.map(r=>r.participant_id)).size,pointCount:count,average:values.length?average:null,lowLabel:sample.lowLabel||"不太確定",highLabel:sample.highLabel||"非常確定",distribution};
  }
  function renderConfidenceControl(snapshot){
    const panel=$("confidenceSessionControl");if(!panel)return;const stageKey=confidenceStageKeyForSession();const rows=(snapshot?.responses||[]).filter(r=>r.stage_key===stageKey&&r.payload?.confidence&&(activeSession?.sessionKind!=="course"||!r.node_ref||r.node_ref===activeSession.currentNodeRef));if(!rows.length){panel.classList.add("hidden");return;}panel.classList.remove("hidden");const total=Number(snapshot?.participant_count)||0;$("confidenceAnsweredBadge").textContent=`${new Set(rows.map(r=>r.participant_id)).size} / ${total}`;const sample=rows[0].payload.confidence,count=Math.max(3,Math.min(7,Number(sample.pointCount)||5)),entries=Array.from({length:count},(_,i)=>({id:String(i+1),label:String(i+1),count:0,order:i})),values=[];rows.forEach(r=>{const value=Number(r.payload?.confidence?.value);if(Number.isFinite(value)&&value>=1&&value<=count){entries[value-1].count++;values.push(value);}});renderLiveBarStats($("confidenceDistribution"),entries,{key:`confidence:${activeSession?.id||""}:${activeSession?.currentNodeRef||"activity"}:${stageKey}`,totalParticipants:total,emptyText:"目前還沒有信心程度資料。"});const shown=liveStatsIsShown(`confidence:${activeSession?.id||""}:${activeSession?.currentNodeRef||"activity"}:${stageKey}`);const avg=values.length?values.reduce((a,b)=>a+b,0)/values.length:0;$("confidenceAverageValue").textContent=shown&&values.length?avg.toFixed(2).replace(/\.00$/,""):"—";$("confidenceLabels").textContent=`${sample.lowLabel||"不太確定"} ← 1 ～ ${count} → ${sample.highLabel||"非常確定"}`;const list=$("confidenceDistribution");if(list)list._rerenderLiveStats=()=>renderConfidenceControl(snapshot);
  }

  function renderPredictSessionSummary({snapshot,details,participants}) {
    const rows=sessionResponsesForMode(snapshot,"predict-reveal"),initials=rows.filter(r=>r.stage_key==="initial"),finals=rows.filter(r=>r.stage_key==="final"),responders=new Set(finals.map(r=>r.participant_id)).size;$("summaryCompletionRate").textContent=participants?`${Math.round((responders/participants)*100)}%`:"—";const changed=finals.filter(r=>r.payload?.changed).length;const section=document.createElement("section");section.className="summary-section";section.innerHTML=`<div class="summary-section-head"><strong>預測與再次判斷</strong><span>${finals.length} 份最終回答</span></div><div class="wave-metrics"><div><span>改變答案</span><strong>${changed}</strong></div><div><span>維持答案</span><strong>${Math.max(0,finals.length-changed)}</strong></div><div><span>初次預測</span><strong>${initials.length}</strong></div></div>`;details.appendChild(section);return true;
  }
  function renderStanceSessionSummary({snapshot,details,participants}) {
    const rows=moduleResponses(snapshot,"stance-map").filter(r=>Number.isFinite(Number(r.payload?.x))&&Number.isFinite(Number(r.payload?.y))),responders=new Set(rows.map(r=>r.participant_id)).size;$("summaryCompletionRate").textContent=participants?`${Math.round((responders/participants)*100)}%`:"—";const ax=rows.length?rows.reduce((s,r)=>s+Number(r.payload.x),0)/rows.length:0,ay=rows.length?rows.reduce((s,r)=>s+Number(r.payload.y),0)/rows.length:0;const section=document.createElement("section");section.className="summary-section";section.innerHTML=`<div class="summary-section-head"><strong>二維立場摘要</strong><span>${rows.length} 筆</span></div><div class="wave-metrics"><div><span>X 平均</span><strong>${rows.length?ax.toFixed(1):"—"}</strong></div><div><span>Y 平均</span><strong>${rows.length?ay.toFixed(1):"—"}</strong></div></div>`;details.appendChild(section);return true;
  }

  function renderScaleSessionSummary({snapshot,details,participants}) {
    const responses=moduleResponses(snapshot,"scale-spectrum");
    const values=responses.map(r=>Number(r.payload?.value ?? r.selected_type)).filter(Number.isFinite).sort((a,b)=>a-b);
    const responders=new Set(responses.map(r=>r.participant_id)).size;
    $("summaryCompletionRate").textContent=participants ? `${Math.round((responders/participants)*100)}%` : "—";
    const avg=values.length ? values.reduce((a,b)=>a+b,0)/values.length : 0;
    const median=values.length ? (values.length%2 ? values[(values.length-1)/2] : (values[values.length/2-1]+values[values.length/2])/2) : 0;
    const section=document.createElement("section");section.className="summary-section";
    section.innerHTML=`<div class="summary-section-head"><strong>量表摘要</strong><span>${responses.length} 筆</span></div><div class="wave-metrics"><div><span>平均</span><strong>${values.length?avg.toFixed(2).replace(/\.00$/,""):"—"}</strong></div><div><span>中位數</span><strong>${values.length?median:"—"}</strong></div></div>`;
    details.appendChild(section);return true;
  }

  function renderRankingSessionSummary({snapshot,details,participants}) {
    const responses=moduleResponses(snapshot,"ranking");
    const responders=new Set(responses.map(r=>r.participant_id)).size;
    $("summaryCompletionRate").textContent=participants ? `${Math.round((responders/participants)*100)}%` : "—";
    const totals=new Map(),counts=new Map();
    responses.forEach(r=>(r.payload?.orderLabels || []).forEach((label,index)=>{label=String(label||"");if(!label)return;totals.set(label,(totals.get(label)||0)+index+1);counts.set(label,(counts.get(label)||0)+1);}));
    const section=document.createElement("section");section.className="summary-section";
    section.innerHTML=`<div class="summary-section-head"><strong>平均排名</strong><span>${responses.length} 筆</span></div><div class="summary-node-list"></div>`;
    const list=section.querySelector(".summary-node-list");
    [...totals.keys()].map(label=>({label,avg:totals.get(label)/counts.get(label)})).sort((a,b)=>a.avg-b.avg||a.label.localeCompare(b.label,"zh-Hant")).forEach((item,index)=>{
      const row=document.createElement("div");row.className="summary-node-row";row.innerHTML=`<div class="summary-node-main"><strong>${index+1}. ${escapeHtml(item.label)}</strong><small>全班平均順位</small></div><b>${item.avg.toFixed(2).replace(/\.00$/,"")}</b>`;list.appendChild(row);
    });
    if(!list.children.length) list.innerHTML='<div class="empty-v15">沒有足夠的排序資料。</div>';
    details.appendChild(section);return true;
  }

  function renderOpenTextSessionSummary({snapshot,details,participants}) {
    const responses=moduleResponses(snapshot,"open-text").filter(r=>String(r.payload?.text||"").trim());
    const responders=new Set(responses.map(r=>r.participant_id)).size;
    $("summaryCompletionRate").textContent=participants ? `${Math.round((responders/participants)*100)}%` : "—";
    const section=document.createElement("section");section.className="summary-section";
    section.innerHTML=`<div class="summary-section-head"><strong>開放文字摘要</strong><span>${responses.length} 筆</span></div><p class="subtle">文字內容保留在「個別學生檢視」中；課後摘要預設不自動公開學生文字。</p>`;
    details.appendChild(section);return true;
  }

  function renderQuestionWallSessionSummary({snapshot,details,participants}) {
    const posts=Array.isArray(snapshot?.question_wall_posts)?snapshot.question_wall_posts:[];
    const posters=new Set(posts.map(post=>post.participant_id)).size;
    $("summaryCompletionRate").textContent=participants ? `${Math.round((posters/participants)*100)}%` : "—";
    const votes=posts.reduce((sum,post)=>sum+Math.max(0,Number(post.vote_count)||0),0);
    const replies=posts.reduce((sum,post)=>sum+(Array.isArray(post.replies)?post.replies.length:(Number(post.reply_count)||0)),0);
    const hot=posts.slice().sort((a,b)=>(Number(b.vote_count)||0)-(Number(a.vote_count)||0) || new Date(b.created_at||0)-new Date(a.created_at||0)).slice(0,5);
    const section=document.createElement("section");section.className="summary-section";
    section.innerHTML=`<div class="summary-section-head"><strong>匿名提問牆摘要</strong><span>${posts.length} 則 · ${votes} 次 ＋1 · ${replies} 則回應</span></div><div class="summary-node-list"></div>`;
    const list=section.querySelector(".summary-node-list");
    hot.forEach((post,index)=>{const row=document.createElement("div");row.className="summary-node-row";row.innerHTML=`<div class="summary-node-main"><strong>${index+1}. ${escapeHtml(post.text||"")}</strong><small>熱門匿名提問 · ${Array.isArray(post.replies)?post.replies.length:(Number(post.reply_count)||0)} 則回應</small></div><b>＋${Math.max(0,Number(post.vote_count)||0)}</b>`;list.appendChild(row);});
    if(!hot.length)list.innerHTML='<div class="empty-v15">這次 Session 沒有匿名提問。</div>';
    details.appendChild(section);return true;
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
    $("progressiveStageBadge").textContent = `資訊 ${stage} / ${total}`;
    $("teacherCurrentClueText").textContent = `目前已公開到第 ${stage} 項資訊`;
    const currentResponses = (snapshot.responses || []).filter(r=>
      r.mode==="progressive-reveal" &&
      stageNumberFromKey(r.stage_key)===stage &&
      (activeSession.sessionKind !== "course" || !r.node_ref || r.node_ref === activeSession.currentNodeRef)
    );
    $("teacherStageSubmissionText").textContent = `本層已提交 ${currentResponses.length} / ${snapshot.participant_count || 0}`;
    $("previousStageBtn").disabled = stage <= 1;
    $("nextStageBtn").disabled = stage >= total;
    $("nextStageBtn").textContent = stage >= total ? "已公開全部資訊" : "公開下一項資訊 →";

    renderLiveBarStats($("teacherStageDistribution"),collectLiveClassificationEntries(currentResponses),{
      key:`progressive:${activeSession?.id || "session"}:${stage}`,
      totalParticipants:snapshot.participant_count || 0,
      emptyText:"這一層還沒有學生提交。"
    });
  }

  function renderOpenDistribution(list,responses,{key="open",totalParticipants=0}={}) {
    renderLiveBarStats(list,collectLiveClassificationEntries(responses),{
      key,totalParticipants,emptyText:"這個階段還沒有學生提交。"
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
    renderOpenDistribution($("openClassificationDistribution"),current,{
      key:`open-classification:${activeSession?.id || "session"}:${stageKey}`,
      totalParticipants:snapshot.participant_count || 0
    });

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
      showSessionToast(error.message || "更新再次判斷階段失敗");
    }
  }

  async function changeStage(delta) {
    if (!activeSession || activeSession.activityMode !== "progressive-reveal") return;
    const target=Math.max(1,Math.min((activeSession.currentStage||1)+delta,activeSession.stageCount||1));
    try {
      await window.ClassroomSessionAPI.setStage(activeSession,target);
      await refreshActiveSession();
    } catch (error) {
      showSessionToast(error.message || "更新資訊階段失敗");
    }
  }

  function renderDeliberationSessionSummary({snapshot,details,participants}) {
    const responses=(snapshot.responses || []).filter(r=>r.mode==="layered-deliberation" && /^layer-\d+$/.test(r.stage_key || ""));
    const completedByParticipant=new Map();
    responses.forEach(r=>{
      if (!completedByParticipant.has(r.participant_id)) completedByParticipant.set(r.participant_id,new Set());
      completedByParticipant.get(r.participant_id).add(r.stage_key);
    });
    const totalStages=Math.max(1,Number(snapshot.stage_count)||1);
    const completedPairs=[...completedByParticipant.values()].reduce((sum,set)=>sum+set.size,0);
    const possible=participants*totalStages;
    $("summaryCompletionRate").textContent=participants ? `${Math.round((completedPairs/Math.max(1,possible))*100)}%` : "—";
    const section=document.createElement("section");
    section.className="summary-section";
    section.innerHTML=`<div class="summary-section-head"><strong>逐層判斷分布</strong><span>${totalStages} 層</span></div><div class="summary-node-list"></div>`;
    const list=section.querySelector(".summary-node-list");
    const options=deliberationOptionsFromSnapshot(snapshot);
    for (let stage=1;stage<=totalStages;stage++) {
      const current=responses.filter(r=>r.stage_key===`layer-${stage}`);
      const row=document.createElement("div");
      row.className="summary-node-row";
      const counts=Object.fromEntries(options.map(option=>[option.id,0]));
      current.forEach(r=>{ if (Object.hasOwn(counts,r.selected_type)) counts[r.selected_type]++; });
      const summary=options.map(option=>`${option.label} ${counts[option.id] || 0}`).join(" · ");
      row.innerHTML=`<div class="summary-node-main"><strong>第 ${stage} 層</strong><small>${escapeHtml(summary)}</small></div><b>${new Set(current.map(r=>r.participant_id)).size} / ${participants}</b>`;
      list.appendChild(row);
    }
    details.appendChild(section);
    return true;
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
      const handled = await ActivityModules?.invoke?.("teacher", activeSession.activityMode, "renderSummary", {snapshot,details,participants});
      if (handled !== true) {
        const responses=snapshot.responses || [];
        const responders=new Set(responses.map(item=>item.participant_id)).size;
        const overall=participants ? Math.round((responders/participants)*100) : 0;
        $("summaryCompletionRate").textContent = participants ? `${overall}%` : "—";
      }
    }

    const responses=snapshot.responses || [];
    const finalLike = responses.filter(item=>item.stage_key === "final").length ? responses.filter(item=>item.stage_key === "final") : responses;
    const counts=new Map();
    finalLike.forEach(item=>{
      const name=item.payload?.selectedTypeName || item.selected_type || "";
      if (name) counts.set(name,(counts.get(name)||0)+1);
    });
    const suppressGenericDistribution = ActivityModules?.invoke?.("teacher", activeSession.activityMode, "suppressGenericSummaryDistribution") === true;
    if (counts.size && !suppressGenericDistribution) {
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

  async function deleteHistorySession(item, button = null) {
    if (!item?.id) return;
    if ((item.status || "") !== "closed") {
      showSessionToast("進行中的 Session 不能刪除，請先結束");
      return;
    }

    const title = item.title || item.code || "這筆 Session";
    const confirmed = confirm(
      `確定要刪除「${title}」嗎？\n\n` +
      `相關的參與紀錄、學生作答與課程進度也會一併刪除。\n` +
      `此操作無法復原。`
    );
    if (!confirmed) return;

    if (button) {
      button.disabled = true;
      button.textContent = "刪除中…";
    }

    try {
      const deletingActive = activeSession?.id === item.id;
      await window.ClassroomSessionAPI.deleteSession(item);

      if (deletingActive) {
        clearInterval(refreshTimer);
        stopSessionRealtime();
        closePresentationSync();
        closeDeliberationPresentation();
        activeSession = null;
        activeCourseSnapshot = null;
        latestTeacherSnapshot = null;
        $("activeSessionCard")?.classList.add("hidden");
        $("sessionSummaryCard")?.classList.add("hidden");
      }

      renderHistory();
      await renderTeachHome();
      showSessionToast("Session 已刪除");
    } catch (error) {
      showSessionToast(error.message || "刪除 Session 失敗");
      if (button) {
        button.disabled = false;
        button.textContent = "🗑 刪除";
      }
    }
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
      const wrapper=document.createElement("div");
      wrapper.className="session-history-row";

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
      wrapper.appendChild(row);

      if (status === "closed") {
        const deleteButton=document.createElement("button");
        deleteButton.type="button";
        deleteButton.className="history-delete-btn";
        deleteButton.textContent="🗑 刪除";
        deleteButton.setAttribute("aria-label",`刪除 ${item.title || item.code || "Session"}`);
        deleteButton.addEventListener("click",()=>deleteHistorySession(item,deleteButton));
        wrapper.appendChild(deleteButton);
      }

      list.appendChild(wrapper);
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

  function registerTeacherActivityModules() {
    const register = (mode, hooks) => ActivityModules?.registerHooks?.("teacher", mode, hooks);

    register("progressive-reveal", {
      renderControl:renderProgressiveControl,
      participantHistory:(participantId,responses) => buildParticipantHistory(participantId,responses),
      presentationPhase:({responses,currentStage,stageCount}) => ({
        responses:responses.filter(item => item.mode === "progressive-reveal" && item.stage_key === `clue-${currentStage}`),
        label:`資訊 ${currentStage} / ${stageCount}`
      })
    });

    register("open-classification", {
      renderControl:renderOpenClassificationControl,
      participantHistory:(participantId,responses) => buildOpenParticipantHistory(participantId,responses),
      presentationPhase:({responses,currentStage}) => {
        const finalPhase = currentStage >= 2;
        const key = finalPhase ? "final" : "initial";
        return {
          responses:responses.filter(item => item.mode === "open-classification" && item.stage_key === key),
          label:finalPhase ? "重新判斷" : "初次判斷"
        };
      },
      presentationExtras:({responses,currentStage}) => {
        if (currentStage < 2) return {changedCount:0,unchangedCount:0};
        const finalResponses = responses.filter(item => item.mode === "open-classification" && item.stage_key === "final");
        const changedCount = finalResponses.filter(item=>Boolean(item.payload?.changed)).length;
        return {changedCount,unchangedCount:finalResponses.length-changedCount};
      }
    });

    register("scale-spectrum", {
      renderControl:renderScaleControl,
      participantHistory:(participantId,responses) => {
        const response=responses.find(item=>item.participant_id===participantId && item.mode==="scale-spectrum" && item.stage_key==="final");
        return response ? `<span class="judgement-chip">量表 ${escapeHtml(String(response.payload?.value ?? response.selected_type ?? "—"))}</span>` : "";
      },
      inspectorFields:response => [
        {label:"量表位置",value:String(response.payload?.value ?? response.selected_type ?? "")},
        {label:"光譜範圍",value:`${response.payload?.leftLabel || "低"} ～ ${response.payload?.rightLabel || "高"}`}
      ],
      presentationPhase:({responses}) => ({
        responses:responses.filter(item=>item.mode==="scale-spectrum" && item.stage_key==="final"),
        label:"量表分布"
      }),
      presentationExtras:({responses}) => {
        const rows=responses.filter(item=>item.mode==="scale-spectrum" && item.stage_key==="final");
        const values=rows.map(item=>Number(item.payload?.value ?? item.selected_type)).filter(Number.isFinite).sort((a,b)=>a-b);
        if (!values.length) return {customMetrics:[]};
        const average=values.reduce((sum,value)=>sum+value,0)/values.length;
        const median=values.length%2 ? values[(values.length-1)/2] : (values[values.length/2-1]+values[values.length/2])/2;
        const sample=rows.find(item=>Number(item.payload?.pointCount)>0);
        const note=sample ? `${sample.payload?.leftLabel || "低"} ～ ${sample.payload?.rightLabel || "高"}` : "全班量表";
        return {customMetrics:[
          {label:"平均",value:average.toFixed(2).replace(/\.00$/,""),note},
          {label:"中位數",value:String(median),note:`${values.length} 份回答`}
        ]};
      },
      renderSummary:renderScaleSessionSummary,
      suppressGenericSummaryDistribution:() => true
    });

    register("ranking", {
      renderControl:renderRankingControl,
      participantHistory:(participantId,responses) => {
        const response=responses.find(item=>item.participant_id===participantId && item.mode==="ranking" && item.stage_key==="final");
        const first=response?.payload?.orderLabels?.[0];
        return first ? `<span class="judgement-chip">第一順位：${escapeHtml(first)}</span>` : "";
      },
      inspectorFields:response => [
        {label:"排序結果",kind:"chips",value:Array.isArray(response.payload?.orderLabels)?response.payload.orderLabels.map((label,index)=>`${index+1}. ${label}`):[]}
      ],
      presentationPhase:({responses}) => ({
        responses:responses.filter(item=>item.mode==="ranking" && item.stage_key==="final"),
        label:"第一順位"
      }),
      presentationExtras:({responses}) => {
        const totals=new Map(),counts=new Map();
        responses.filter(item=>item.mode==="ranking" && item.stage_key==="final").forEach(item=>{
          (item.payload?.orderLabels || []).forEach((label,index)=>{
            const name=String(label||"").trim();if(!name)return;
            totals.set(name,(totals.get(name)||0)+index+1);counts.set(name,(counts.get(name)||0)+1);
          });
        });
        const secondaryList=[...totals.keys()].map(label=>({label,value:(totals.get(label)/Math.max(1,counts.get(label))).toFixed(2).replace(/\.00$/,""),note:"平均順位"}))
          .sort((a,b)=>Number(a.value)-Number(b.value) || a.label.localeCompare(b.label,"zh-Hant")).slice(0,10);
        return {secondaryList};
      },
      renderSummary:renderRankingSessionSummary,
      suppressGenericSummaryDistribution:() => true
    });

    register("open-text", {
      renderControl:renderOpenTextControl,
      participantHistory:(participantId,responses) => responses.some(item=>item.participant_id===participantId && item.mode==="open-text" && item.stage_key==="final") ? '<span class="judgement-chip">已提交短答</span>' : "",
      inspectorFields:response => [{label:"文字回答",value:response.payload?.text || ""}],
      presentationPhase:({responses}) => ({
        responses:responses.filter(item=>item.mode==="open-text" && item.stage_key==="final" && String(item.payload?.text||"").trim()),
        label:"匿名文字牆"
      }),
      presentationExtras:({responses}) => {
        const rows=responses
          .filter(item=>item.mode==="open-text" && item.stage_key==="final" && String(item.payload?.text||"").trim());
        const counts=new Map();
        rows.forEach(item=>tokenizeWordCloud(item.payload?.text).forEach(token=>counts.set(token,(counts.get(token)||0)+1)));
        const wordCloud=[...counts.entries()]
          .map(([text,count])=>({text,count}))
          .sort((a,b)=>b.count-a.count || a.text.localeCompare(b.text,"zh-Hant"))
          .slice(0,40);
        return {
          textWall:rows.slice().sort((a,b)=>new Date(b.submitted_at||0)-new Date(a.submitted_at||0))
            .slice(0,18).map(item=>({text:String(item.payload.text)})),
          wordCloud
        };
      },
      renderSummary:renderOpenTextSessionSummary,
      suppressGenericSummaryDistribution:() => true
    });

    register("question-wall", {
      renderControl:renderQuestionWallControl,
      participantHistory:(participantId,responses,snapshot)=>{
        const count=(snapshot?.question_wall_posts||[]).filter(post=>post.participant_id===participantId).length;
        return count?`<span class="judgement-chip">匿名提問 ${count} 則</span>`:"";
      },
      renderSummary:renderQuestionWallSessionSummary,
      suppressGenericSummaryDistribution:()=>true
    });

    register("group-consensus", {
      renderControl:renderGroupConsensusControl,
      participantHistory:(participantId,responses,snapshot)=>{const own=responses.find(row=>row.participant_id===participantId&&row.mode==="group-consensus"&&row.stage_key==="individual");const group=(snapshot?.groups||[]).find(g=>(g.members||[]).some(m=>m.participant_id===participantId));const sub=group?(snapshot?.group_submissions||[]).find(row=>String(row.group_id)===String(group.id)):null;return `${own?`<span class="judgement-chip">個人：${escapeHtml(own.payload?.selectedTypeName||own.selected_type||"—")}</span>`:""}${group?`<span class="judgement-chip">${escapeHtml(group.label||"小組")}：${escapeHtml(sub?.payload?.selectedTypeName||sub?.selected_type||"等待共識")}</span>`:""}`;},
      inspectorFields:response=>[{label:"個人判斷",value:response.payload?.selectedTypeName||response.selected_type||""}],
      renderSummary:renderGroupConsensusSessionSummary,
      suppressGenericSummaryDistribution:()=>true
    });

    register("predict-reveal", {
      renderControl:renderPredictRevealControl,
      participantHistory:(participantId,responses)=>{const initial=responses.find(r=>r.participant_id===participantId&&r.mode==="predict-reveal"&&r.stage_key==="initial"),final=responses.find(r=>r.participant_id===participantId&&r.mode==="predict-reveal"&&r.stage_key==="final");if(!initial)return "";const a=initial.payload?.selectedTypeName||initial.selected_type||"—",b=final?.payload?.selectedTypeName||final?.selected_type||"等待再次判斷";return `<span class="judgement-chip">預測 ${escapeHtml(a)} → ${escapeHtml(b)}</span>`;},
      inspectorFields:response=>[{label:response.stage_key==="initial"?"初次預測":"再次判斷",value:response.payload?.selectedTypeName||response.selected_type||""},{label:"是否改變",value:response.stage_key==="final"?(response.payload?.changed?"有改變":"維持原判斷"):""}],
      presentationPhase:({responses,currentStage})=>({responses:responses.filter(r=>r.mode==="predict-reveal"&&r.stage_key===(currentStage>=2?"final":"initial")),label:currentStage>=2?"再次判斷":"初次預測"}),
      presentationExtras:({responses,currentStage})=>{if(currentStage<2)return{};const finals=responses.filter(r=>r.mode==="predict-reveal"&&r.stage_key==="final"),changed=finals.filter(r=>r.payload?.changed).length;return {changedCount:changed,unchangedCount:finals.length-changed};},
      renderSummary:renderPredictSessionSummary
    });
    register("stance-map", {
      renderControl:renderStanceMapControl,
      participantHistory:(participantId,responses)=>{const r=responses.find(x=>x.participant_id===participantId&&x.mode==="stance-map"&&x.stage_key==="final");return r?`<span class="judgement-chip">X ${escapeHtml(r.payload?.x)} · Y ${escapeHtml(r.payload?.y)}</span>`:"";},
      inspectorFields:response=>[{label:"二維位置",value:`X ${response.payload?.x ?? "—"} · Y ${response.payload?.y ?? "—"}`},{label:"X 軸",value:`${response.payload?.xLeft||"左"} ～ ${response.payload?.xRight||"右"}`},{label:"Y 軸",value:`${response.payload?.yBottom||"下"} ～ ${response.payload?.yTop||"上"}`}],
      presentationPhase:({responses})=>({responses:responses.filter(r=>r.mode==="stance-map"&&r.stage_key==="final"&&Number.isFinite(Number(r.payload?.x))&&Number.isFinite(Number(r.payload?.y))),label:"二維立場"}),
      presentationExtras:({responses})=>{
        const rows=responses.filter(r=>r.mode==="stance-map"&&r.stage_key==="final"&&Number.isFinite(Number(r.payload?.x))&&Number.isFinite(Number(r.payload?.y)));
        if(!rows.length)return{customMetrics:[],stanceMap:null,suppressDistribution:true};
        const ax=rows.reduce((s,r)=>s+Number(r.payload.x),0)/rows.length,ay=rows.reduce((s,r)=>s+Number(r.payload.y),0)/rows.length;
        const sample=rows[0]?.payload||{};
        return{
          suppressDistribution:true,
          customMetrics:[{label:"X 平均",value:ax.toFixed(1),note:"二維立場中心"},{label:"Y 平均",value:ay.toFixed(1),note:`${rows.length} 份回答`}],
          stanceMap:{
            points:rows.slice(0,120).map(r=>({x:Number(r.payload.x),y:Number(r.payload.y)})),
            average:{x:ax,y:ay},
            labels:{xLeft:sample.xLeft||"左",xRight:sample.xRight||"右",yBottom:sample.yBottom||"下",yTop:sample.yTop||"上"}
          }
        };
      },
      renderSummary:renderStanceSessionSummary,
      suppressGenericSummaryDistribution:()=>true
    });

    register("live-stance", {
      renderControl:renderLiveStanceControl,
      participantHistory:(participantId,responses)=>{
        const response=responses.find(item=>item.participant_id===participantId && item.mode==="live-stance" && item.stage_key==="final");
        if(!response)return "";
        const label=response.payload?.selectedTypeName || response.selected_type || "—";
        return `<span class="judgement-chip">目前立場：${escapeHtml(label)}</span>`;
      },
      inspectorFields:(response,snapshot)=>{
        const events=(snapshot?.live_stance_events || []).filter(event=>event.participant_id===response.participant_id).sort((a,b)=>new Date(a.created_at||0)-new Date(b.created_at||0));
        const sequence=events.map(event=>liveStanceSideLabel(event.side,event.payload||{}));
        const changes=events.filter(event=>event.previous_side && event.previous_side!==event.side).length;
        return [
          {label:"目前立場",value:response.payload?.selectedTypeName || response.selected_type || ""},
          {label:"已改變立場",value:`${changes || Math.max(0,Number(response.payload?.changeCount)||0)} 次`},
          {label:"立場歷程",value:sequence.length ? sequence.join(" → ") : (response.payload?.selectedTypeName || response.selected_type || "")},
          {label:"首次表態",value:events.length ? formatTime(events[0].created_at) : "—"},
          {label:"最近變動",value:events.length ? formatTime(events.at(-1).created_at) : "—"}
        ];
      },
      presentationPhase:({responses})=>({
        responses:responses.filter(item=>item.mode==="live-stance" && item.stage_key==="final"),
        label:"即時立場拉鋸"
      }),
      presentationExtras:({responses,snapshot})=>{
        const rows=responses.filter(item=>item.mode==="live-stance" && item.stage_key==="final");
        const summary=liveStanceSummaryFromRows(rows,Number(snapshot?.participant_count)||0);
        return {
          suppressDistribution:true,
          liveStance:{
            left:summary.counts.left,
            right:summary.counts.right,
            undecided:summary.counts.undecided,
            leftLabel:summary.leftLabel,
            rightLabel:summary.rightLabel,
            undecidedLabel:summary.undecidedLabel,
            allowUndecided:summary.allowUndecided,
            answered:summary.answered,
            total:Number(snapshot?.participant_count)||0
          }
        };
      }
    });

    register("layered-deliberation", {
      renderControl:renderDeliberationControl,
      publishSpecialPresentation:publishDeliberationPresentation,
      renderSummary:renderDeliberationSessionSummary,
      suppressGenericSummaryDistribution:() => true,
      participantHistory:(participantId,responses,snapshot) => buildDeliberationParticipantHistory(participantId,responses,snapshot?.deliberation_data?.o),
      selectedTypeLabel:(response,snapshot) => deliberationOptionLabel(response?.selected_type,snapshot?.deliberation_data?.o) || "未命名選項"
    });
  }

  registerTeacherActivityModules();

  function refresh() {
    refreshActivityOptions();
    refreshCourseOptions();
    applySessionKindUI();
    renderCloudState();
    renderHistory();
    renderTeachHome();
    if (activeSession) refreshActiveSession();
  }

  $("openSessionSetupBtn")?.addEventListener("click",()=>openSessionSetup());
  $("toggleTeachHomeFocusBtn")?.addEventListener("click",toggleTeachHomeFocusMode);
  $("goCoursePrepBtn")?.addEventListener("click",()=>window.TeacherWorkflow?.switchView?.("courses"));
  $("goActivityPrepBtn")?.addEventListener("click",()=>window.TeacherWorkflow?.switchView?.("activities"));

  $("openTextIdentityMode")?.addEventListener("change",event=>{openTextIdentityMode=event.target.value==="named"?"named":"anonymous";if(latestTeacherSnapshot)renderOpenTextControl(latestTeacherSnapshot);});
  $("openTextViewMode")?.addEventListener("change",event=>{openTextViewMode=event.target.value==="cloud"?"cloud":"wall";if(latestTeacherSnapshot)renderOpenTextControl(latestTeacherSnapshot);});
  $("questionWallIdentityMode")?.addEventListener("change",event=>{questionWallIdentityMode=event.target.value==="named"?"named":"anonymous";if(latestTeacherSnapshot)renderQuestionWallControl(latestTeacherSnapshot);});
  $("questionWallSortMode")?.addEventListener("change",event=>{questionWallSortMode=event.target.value==="new"?"new":"hot";if(latestTeacherSnapshot)renderQuestionWallControl(latestTeacherSnapshot);});
  $("liveStanceOpenBtn")?.addEventListener("click",()=>changeLiveStanceState("open"));
  $("liveStanceLockBtn")?.addEventListener("click",()=>changeLiveStanceState("locked"));
  $("liveStanceProjectionBtn")?.addEventListener("click",openLiveStanceProjection);
  $("liveStanceCheckpointBtn")?.addEventListener("click",createLiveStanceCheckpointFromUi);
  $("liveStanceCheckpointLabel")?.addEventListener("keydown",event=>{if(event.key==="Enter"){event.preventDefault();createLiveStanceCheckpointFromUi();}});
  $("liveStanceProjectionCloseBtn")?.addEventListener("click",closeLiveStanceProjection);
  $("liveStanceProjectionOverlay")?.addEventListener("click",event=>{if(event.target===event.currentTarget)closeLiveStanceProjection();});
  document.addEventListener("fullscreenchange",()=>{
    const overlay=$("liveStanceProjectionOverlay");
    if(overlay && !document.fullscreenElement && !overlay.classList.contains("hidden")) overlay.classList.add("hidden");
  });

  $("predictBackBtn")?.addEventListener("click",()=>changePredictPhase(-1));
  $("predictRevealBtn")?.addEventListener("click",()=>changePredictPhase(1));
  document.querySelectorAll('input[name="sessionKind"]').forEach(input=>input.addEventListener("change",applySessionKindUI));
  $("sessionActivitySelect")?.addEventListener("change",renderActivityPreview);
  $("sessionCourseSelect")?.addEventListener("change",renderCoursePreview);
  $("sessionTitleInput")?.addEventListener("input",()=>{$("sessionTitleInput").dataset.autoTitle="0";});
  $("saveCloudConfigBtn")?.addEventListener("click",saveCloudConfig);
  $("clearCloudConfigBtn")?.addEventListener("click",clearCloudConfig);
  $("importTeacherHandoffBtn")?.addEventListener("click",()=>$("teacherHandoffFileInput")?.click());
  $("teacherHandoffFileInput")?.addEventListener("change",event=>importTeacherHandoffFile(event.target.files?.[0] || null));
  $("exportTeacherHandoffBtn")?.addEventListener("click",exportTeacherHandoff);
  $("exportDeliberationResultsBtn")?.addEventListener("click",exportDeliberationResults);
  $("createSessionBtn")?.addEventListener("click",createSession);
  $("groupConsensusAssignBtn")?.addEventListener("click",assignGroupConsensusGroups);
  $("groupConsensusIndividualBtn")?.addEventListener("click",()=>setGroupConsensusPhase(1));
  $("groupConsensusGroupBtn")?.addEventListener("click",()=>setGroupConsensusPhase(2));
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
  $("deliberationOpenBtn")?.addEventListener("click",()=>setDeliberationRound("open"));
  $("deliberationLockBtn")?.addEventListener("click",()=>setDeliberationRound("locked"));
  $("deliberationPublishBtn")?.addEventListener("click",()=>setDeliberationRound("published"));
  $("openDeliberationPresentationBtn")?.addEventListener("click",openDeliberationPresentation);
  $("deliberationNextBtn")?.addEventListener("click",nextDeliberationLayer);
  $("studentInspectSelect")?.addEventListener("change",event=>{
    inspectedParticipantId=String(event.target.value || "");
    if (latestTeacherSnapshot) renderStudentInspector(latestTeacherSnapshot);
  });
  if ($("deliberationReasonIdentityMode")) {
    $("deliberationReasonIdentityMode").value=deliberationReasonIdentityMode;
    $("deliberationReasonIdentityMode").addEventListener("change",event=>{
      deliberationReasonIdentityMode=event.target.value==="named" ? "named" : "anonymous";
      try { localStorage.setItem("classroom-deliberation-reason-identity",deliberationReasonIdentityMode); } catch {}
      if (latestTeacherSnapshot) renderDeliberationControl(latestTeacherSnapshot);
    });
  }

  window.addEventListener("beforeunload",()=>{
    clearInterval(refreshTimer);
    stopSessionRealtime();
    try { deliberationPresentationChannel?.close?.(); } catch {}
  });

  window.ClassroomSessionManager={refresh,refreshActiveSession};
  refresh();
})();
