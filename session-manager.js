(() => {
  const $ = id => document.getElementById(id);
  let activeSession = null;
  let refreshTimer = null;

  function activityModeLabel(mode) {
    if (mode === "element-type") return "要素 → 類型";
    if (mode === "progressive-reveal") return "逐層揭露";
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
        <small>${activityModeLabel(activity.template)} · ${activity.template === "progressive-reveal" ? `${activity.taskCount} 層線索` : `${activity.taskCount} 個任務`}</small>
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
    if (activeSession.activityMode === "progressive-reveal") {
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

  window.ClassroomSessionManager = {refresh, refreshActiveSession};
  refresh();
  clearInterval(refreshTimer);
  refreshTimer = setInterval(() => { if (activeSession) refreshActiveSession(); }, 3000);
})();