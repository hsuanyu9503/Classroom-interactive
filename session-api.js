(() => {
  const CONFIG_KEY = "interactive-classroom-cloud-config";
  const LOCAL_SESSIONS_KEY = "interactive-classroom-local-sessions";
  const TEACHER_HISTORY_KEY = "interactive-classroom-session-history";
  const PARTICIPANT_CONTEXT_KEY = "interactive-classroom-participant-context";

  const textEncoder = new TextEncoder();
  const textDecoder = new TextDecoder();

  function randomToken() {
    if (crypto?.randomUUID) return `${crypto.randomUUID()}-${crypto.randomUUID()}`;
    return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  }

  function randomCode(length = 5) {
    const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return [...bytes].map(value => alphabet[value % alphabet.length]).join("");
  }

  function getConfig() {
    try {
      return JSON.parse(localStorage.getItem(CONFIG_KEY) || "null") || { url:"", key:"" };
    } catch {
      return { url:"", key:"" };
    }
  }

  function saveConfig(url, key) {
    const clean = {
      url: String(url || "").trim().replace(/\/+$/, ""),
      key: String(key || "").trim()
    };
    if (clean.key.startsWith("sb_secret_")) {
      throw new Error("不能在前端使用 Supabase secret key。請改用 Publishable key。");
    }
    localStorage.setItem(CONFIG_KEY, JSON.stringify(clean));
    return clean;
  }

  function clearConfig() {
    localStorage.removeItem(CONFIG_KEY);
  }

  function isCloudConfigured() {
    const config = getConfig();
    return /^https:\/\/.+\.supabase\.co$/i.test(config.url) && config.key.length > 20;
  }

  function encodeCloudConfig(config) {
    const json = JSON.stringify({u:config.url,k:config.key});
    const bytes = textEncoder.encode(json);
    let binary = "";
    bytes.forEach(byte => binary += String.fromCharCode(byte));
    return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
  }

  function decodeCloudConfig(value) {
    try {
      const base64 = value.replace(/-/g,"+").replace(/_/g,"/");
      const padded = base64 + "=".repeat((4 - base64.length % 4) % 4);
      const binary = atob(padded);
      const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
      return JSON.parse(textDecoder.decode(bytes));
    } catch {
      return null;
    }
  }

  function configFromUrlFragment() {
    const raw = new URLSearchParams(location.hash.replace(/^#/,"")).get("cloud");
    if (!raw) return null;
    const decoded = decodeCloudConfig(raw);
    if (!decoded?.u || !decoded?.k || decoded.k.startsWith("sb_secret_")) return null;
    return {url:decoded.u.replace(/\/+$/,""), key:decoded.k};
  }

  async function rpc(name, body, overrideConfig = null) {
    const config = overrideConfig || getConfig();
    if (!config?.url || !config?.key) throw new Error("尚未設定 Supabase");
    const response = await fetch(`${config.url}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        "apikey": config.key,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body || {})
    });

    let payload = null;
    const text = await response.text();
    if (text) {
      try { payload = JSON.parse(text); }
      catch { payload = text; }
    }

    if (!response.ok) {
      const message = payload?.message || payload?.hint || payload?.details || String(payload || response.statusText);
      throw new Error(message);
    }
    return payload;
  }

  async function testCloudConfig(url, key) {
    const config = {url:String(url||"").trim().replace(/\/+$/,""), key:String(key||"").trim()};
    if (config.key.startsWith("sb_secret_")) throw new Error("不能使用 secret key");
    const result = await rpc("classroom_healthcheck", {}, config);
    return result === "ok" || result?.status === "ok" || result === true;
  }

  function loadLocalSessions() {
    try {
      return JSON.parse(localStorage.getItem(LOCAL_SESSIONS_KEY) || "[]") || [];
    } catch {
      return [];
    }
  }

  function saveLocalSessions(sessions) {
    localStorage.setItem(LOCAL_SESSIONS_KEY, JSON.stringify(sessions));
  }

  function loadTeacherHistory() {
    try {
      return JSON.parse(localStorage.getItem(TEACHER_HISTORY_KEY) || "[]") || [];
    } catch {
      return [];
    }
  }

  function saveTeacherHistory(items) {
    localStorage.setItem(TEACHER_HISTORY_KEY, JSON.stringify(items.slice(0, 20)));
  }

  function rememberTeacherSession(session) {
    const history = loadTeacherHistory().filter(item => item.id !== session.id);
    history.unshift({
      id: session.id,
      code: session.code,
      title: session.title,
      teacherToken: session.teacherToken,
      mode: session.mode,
      activityMode: session.activityMode || "",
      stageCount: session.stageCount || 1,
      createdAt: session.createdAt || new Date().toISOString()
    });
    saveTeacherHistory(history);
  }

  async function createSession({title, activityEncoded, activityMode, stageCount=1}) {
    const code = randomCode();
    const teacherToken = randomToken();

    if (isCloudConfigured()) {
      const result = await rpc("create_classroom_session", {
        p_code: code,
        p_teacher_token: teacherToken,
        p_title: title,
        p_activity_encoded: activityEncoded,
        p_activity_mode: activityMode || "",
        p_stage_count: Math.max(1, Number(stageCount) || 1)
      });
      const id = typeof result === "string" ? result : (result?.id || result?.session_id || result);
      const session = {
        id, code, title, teacherToken, mode:"cloud",
        activityMode: activityMode || "",
        stageCount: Math.max(1, Number(stageCount) || 1),
        currentStage: 1,
        createdAt:new Date().toISOString()
      };
      rememberTeacherSession(session);
      return session;
    }

    const sessions = loadLocalSessions();
    const id = crypto?.randomUUID?.() || `local-${Date.now()}`;
    const session = {
      id, code, title, teacherToken, mode:"local",
      activityMode: activityMode || "",
      activityEncoded,
      stageCount: Math.max(1, Number(stageCount) || 1),
      currentStage: 1,
      status:"active",
      createdAt:new Date().toISOString(),
      participants:[],
      responses:[]
    };
    sessions.unshift(session);
    saveLocalSessions(sessions);
    rememberTeacherSession(session);
    return session;
  }

  async function joinSession(code, studentCode, cloudConfig = null) {
    const cleanCode = String(code || "").trim().toUpperCase();
    const cleanStudent = String(studentCode || "").trim();
    if (!cleanCode || !cleanStudent) throw new Error("請輸入課堂代碼與座號");

    const config = cloudConfig || configFromUrlFragment();
    const participantToken = randomToken();

    if (config?.url && config?.key) {
      const result = await rpc("join_classroom_session", {
        p_code: cleanCode,
        p_student_code: cleanStudent,
        p_participant_token: participantToken
      }, config);
      const data = Array.isArray(result) ? result[0] : result;
      if (!data?.session_id || !data?.activity_encoded) throw new Error("無法取得課堂活動");
      const context = {
        mode:"cloud",
        cloudConfig:config,
        sessionId:data.session_id,
        participantId:data.participant_id,
        participantToken,
        studentCode:cleanStudent,
        code:cleanCode,
        title:data.title || "課堂活動",
        activityEncoded:data.activity_encoded,
        activityMode:data.activity_mode || "",
        stageCount:data.stage_count || 1,
        currentStage:data.current_stage || 1
      };
      saveParticipantContext(context);
      return context;
    }

    const sessions = loadLocalSessions();
    const session = sessions.find(item => item.code === cleanCode && item.status === "active");
    if (!session) throw new Error("找不到這個課堂代碼；本機測試 Session 只能在建立它的同一個瀏覽器加入。");

    let participant = session.participants.find(item => item.studentCode === cleanStudent);
    if (!participant) {
      participant = {
        id:crypto?.randomUUID?.() || `p-${Date.now()}`,
        studentCode:cleanStudent,
        participantToken,
        joinedAt:new Date().toISOString()
      };
      session.participants.push(participant);
    } else {
      participant.participantToken = participantToken;
    }
    saveLocalSessions(sessions);

    const context = {
      mode:"local",
      sessionId:session.id,
      participantId:participant.id,
      participantToken,
      studentCode:cleanStudent,
      code:cleanCode,
      title:session.title,
      activityEncoded:session.activityEncoded,
      activityMode:session.activityMode || "",
      stageCount:session.stageCount || 1,
      currentStage:session.currentStage || 1
    };
    saveParticipantContext(context);
    return context;
  }

  function saveParticipantContext(context) {
    sessionStorage.setItem(PARTICIPANT_CONTEXT_KEY, JSON.stringify(context));
  }

  function getParticipantContext() {
    try {
      return JSON.parse(sessionStorage.getItem(PARTICIPANT_CONTEXT_KEY) || "null");
    } catch {
      return null;
    }
  }

  async function submitResponse({taskIndex, stageKey="final", mode, selectedElements=[], selectedType="", payload={}}) {
    const context = getParticipantContext();
    if (!context) return {skipped:true};

    if (context.mode === "cloud") {
      await rpc("submit_classroom_response", {
        p_session_id: context.sessionId,
        p_participant_token: context.participantToken,
        p_task_index: taskIndex,
        p_stage_key: stageKey,
        p_mode: mode,
        p_selected_elements: selectedElements,
        p_selected_type: selectedType || null,
        p_payload: payload
      }, context.cloudConfig);
      return {ok:true};
    }

    const sessions = loadLocalSessions();
    const session = sessions.find(item => item.id === context.sessionId);
    if (!session) throw new Error("本機 Session 已不存在");
    const participant = session.participants.find(item => item.id === context.participantId && item.participantToken === context.participantToken);
    if (!participant) throw new Error("學生加入憑證已失效");

    const key = `${context.participantId}:${taskIndex}:${stageKey}`;
    const record = {
      key,
      participantId:context.participantId,
      studentCode:context.studentCode,
      taskIndex,
      stageKey,
      mode,
      selectedElements,
      selectedType,
      payload,
      submittedAt:new Date().toISOString()
    };
    const index = session.responses.findIndex(item => item.key === key);
    if (index >= 0) session.responses[index] = record;
    else session.responses.push(record);
    saveLocalSessions(sessions);
    return {ok:true};
  }

  async function teacherSnapshot(sessionMeta) {
    if (!sessionMeta?.id || !sessionMeta?.teacherToken) throw new Error("Session 資料不完整");

    if (sessionMeta.mode === "cloud") {
      const result = await rpc("get_teacher_session", {
        p_session_id: sessionMeta.id,
        p_teacher_token: sessionMeta.teacherToken
      });
      return typeof result === "string" ? JSON.parse(result) : result;
    }

    const session = loadLocalSessions().find(item => item.id === sessionMeta.id && item.teacherToken === sessionMeta.teacherToken);
    if (!session) throw new Error("找不到本機 Session");
    return {
      id:session.id,
      code:session.code,
      title:session.title,
      status:session.status,
      activity_mode:session.activityMode,
      current_stage:session.currentStage || 1,
      stage_count:session.stageCount || 1,
      participant_count:session.participants.length,
      response_count:session.responses.length,
      responses:session.responses.map(r => ({
        participant_id:r.participantId, student_code:r.studentCode, task_index:r.taskIndex,
        stage_key:r.stageKey, mode:r.mode, selected_type:r.selectedType, selected_elements:r.selectedElements,
        payload:r.payload, submitted_at:r.submittedAt
      })),
      participants:session.participants.map(p => ({
        id:p.id,
        student_code:p.studentCode,
        joined_at:p.joinedAt,
        response_count:session.responses.filter(r => r.participantId === p.id).length,
        last_submitted_at:session.responses
          .filter(r => r.participantId === p.id)
          .map(r => r.submittedAt)
          .sort()
          .at(-1) || null
      }))
    };
  }

  async function setStage(sessionMeta, stage) {
    const target = Math.max(1, Math.min(Number(stage) || 1, Number(sessionMeta.stageCount) || 1));
    if (sessionMeta.mode === "cloud") {
      const result = await rpc("set_classroom_stage", {
        p_session_id:sessionMeta.id,
        p_teacher_token:sessionMeta.teacherToken,
        p_stage:target
      });
      sessionMeta.currentStage = Number(result) || target;
      return sessionMeta.currentStage;
    }
    const sessions = loadLocalSessions();
    const session = sessions.find(item => item.id === sessionMeta.id && item.teacherToken === sessionMeta.teacherToken);
    if (!session) throw new Error("找不到本機 Session");
    session.currentStage = Math.max(1, Math.min(target, session.stageCount || 1));
    sessionMeta.currentStage = session.currentStage;
    saveLocalSessions(sessions);
    return session.currentStage;
  }

  async function studentState() {
    const context = getParticipantContext();
    if (!context) throw new Error("尚未加入課堂 Session");
    if (context.mode === "cloud") {
      const result = await rpc("get_student_session_state", {
        p_session_id:context.sessionId,
        p_participant_token:context.participantToken
      }, context.cloudConfig);
      return typeof result === "string" ? JSON.parse(result) : result;
    }
    const session = loadLocalSessions().find(item => item.id === context.sessionId);
    if (!session) throw new Error("本機 Session 已不存在");
    const participant = session.participants.find(item => item.id === context.participantId && item.participantToken === context.participantToken);
    if (!participant) throw new Error("學生加入憑證已失效");
    const ownResponses = session.responses
      .filter(r => r.participantId === participant.id && ["progressive-reveal","open-classification"].includes(r.mode))
      .map(r => ({
        stage_key:r.stageKey,
        mode:r.mode,
        selected_type:r.selectedType,
        selected_elements:r.selectedElements,
        payload:r.payload,
        submitted_at:r.submittedAt
      }));

    const openResponses = session.responses.filter(r => r.mode === "open-classification");
    const distribution = stageKey => {
      const counts = new Map();
      openResponses.filter(r => r.stageKey === stageKey).forEach(r => {
        const name = r.payload?.selectedTypeName || r.selectedType || "未命名類型";
        const key = `${r.selectedType || ""}::${name}`;
        const current = counts.get(key) || {id:r.selectedType || "", name, count:0};
        current.count += 1;
        counts.set(key,current);
      });
      return [...counts.values()].sort((a,b)=>b.count-a.count || a.name.localeCompare(b.name,"zh-Hant"));
    };
    const finalResponses = openResponses.filter(r => r.stageKey === "final");
    return {
      current_stage:session.currentStage || 1,
      stage_count:session.stageCount || 1,
      status:session.status,
      responses:ownResponses,
      open_stats:{
        initial:distribution("initial"),
        final:distribution("final"),
        initial_total:openResponses.filter(r=>r.stageKey==="initial").length,
        final_total:finalResponses.length,
        changed_count:finalResponses.filter(r=>Boolean(r.payload?.changed)).length,
        unchanged_count:finalResponses.filter(r=>!r.payload?.changed).length
      }
    };
  }

  function buildJoinUrl(session) {
    const url = new URL("join.html", location.href);
    url.searchParams.set("code", session.code);

    if (session.mode === "cloud") {
      const config = getConfig();
      url.hash = `cloud=${encodeCloudConfig(config)}`;
    }
    return url.toString();
  }

  window.ClassroomSessionAPI = {
    getConfig, saveConfig, clearConfig, isCloudConfigured, testCloudConfig,
    createSession, joinSession, submitResponse, teacherSnapshot, setStage, studentState, buildJoinUrl,
    loadTeacherHistory, getParticipantContext, configFromUrlFragment
  };
})();