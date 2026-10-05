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


  function realtimeLogicalTopic(sessionId) {
    return `classroom-session-${String(sessionId || "").trim()}`;
  }

  function realtimeSocketUrl(config) {
    const url = new URL(config.url);
    const protocol = url.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${url.host}/realtime/v1/websocket?apikey=${encodeURIComponent(config.key)}&vsn=1.0.0`;
  }

  async function publishRealtime(sessionId, kind = "refresh", overrideConfig = null) {
    const config = overrideConfig || getConfig();
    const cleanId = String(sessionId || "").trim();
    if (!cleanId || !config?.url || !config?.key) return false;

    try {
      const topic = realtimeLogicalTopic(cleanId);
      const response = await fetch(
        `${config.url}/realtime/v1/api/broadcast/${encodeURIComponent(topic)}/events/refresh`,
        {
          method:"POST",
          headers:{
            "apikey":config.key,
            "Content-Type":"application/json"
          },
          body:JSON.stringify({
            kind:String(kind || "refresh"),
            at:Date.now()
          })
        }
      );
      return response.ok;
    } catch (error) {
      console.warn("Realtime 通知送出失敗，將由輪詢補上",error);
      return false;
    }
  }

  function subscribeRealtime(sessionId, {
    config = null,
    onEvent = null,
    onStatus = null,
    reconnectMs = 4000
  } = {}) {
    const cleanId = String(sessionId || "").trim();
    const cloud = config || getConfig();
    let socket = null;
    let heartbeatTimer = null;
    let reconnectTimer = null;
    let stopped = false;
    let joined = false;
    let refCounter = 1;
    let status = "idle";

    const controller = {
      close,
      get status(){ return status; },
      get connected(){ return joined && socket?.readyState === WebSocket.OPEN; }
    };

    function emitStatus(next, detail = "") {
      status = next;
      try { onStatus?.(next, detail, controller); } catch {}
    }

    function clearTimers() {
      clearInterval(heartbeatTimer);
      clearTimeout(reconnectTimer);
      heartbeatTimer = null;
      reconnectTimer = null;
    }

    function nextRef() {
      refCounter += 1;
      return String(refCounter);
    }

    function send(message) {
      if (!socket || socket.readyState !== WebSocket.OPEN) return false;
      socket.send(JSON.stringify(message));
      return true;
    }

    function joinChannel() {
      const joinRef = "1";
      send({
        topic:`realtime:${realtimeLogicalTopic(cleanId)}`,
        event:"phx_join",
        payload:{
          config:{
            broadcast:{ack:false,self:false},
            presence:{enabled:false},
            postgres_changes:[],
            private:false
          }
        },
        ref:joinRef,
        join_ref:joinRef
      });
    }

    function startHeartbeat() {
      clearInterval(heartbeatTimer);
      heartbeatTimer = setInterval(()=>{
        send({
          topic:"phoenix",
          event:"heartbeat",
          payload:{},
          ref:nextRef(),
          join_ref:null
        });
      },20000);
    }

    function scheduleReconnect() {
      if (stopped) return;
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connect,Math.max(1500,Number(reconnectMs)||4000));
    }

    function handleMessage(event) {
      let message;
      try { message = JSON.parse(event.data); }
      catch { return; }

      if (message?.event === "phx_reply" && message?.ref === "1") {
        if (message?.payload?.status === "ok") {
          joined = true;
          emitStatus("connected");
          startHeartbeat();
        } else {
          joined = false;
          emitStatus("error",message?.payload?.response?.reason || "channel join failed");
          try { socket?.close?.(); } catch {}
        }
        return;
      }

      if (message?.event === "broadcast" && message?.payload?.event === "refresh") {
        try { onEvent?.(message.payload.payload || {}); } catch {}
      }
    }

    function connect() {
      if (stopped) return;
      clearTimers();
      joined = false;

      if (!cleanId || !cloud?.url || !cloud?.key || typeof WebSocket !== "function") {
        emitStatus("unavailable");
        return;
      }

      emitStatus("connecting");
      try {
        socket = new WebSocket(realtimeSocketUrl(cloud));
      } catch (error) {
        emitStatus("error",error.message || "websocket unavailable");
        scheduleReconnect();
        return;
      }

      socket.addEventListener("open",joinChannel);
      socket.addEventListener("message",handleMessage);
      socket.addEventListener("error",()=>{
        if (!stopped) emitStatus("error","websocket error");
      });
      socket.addEventListener("close",()=>{
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
        if (stopped) return;
        joined = false;
        emitStatus("disconnected");
        scheduleReconnect();
      });
    }

    function close() {
      stopped = true;
      clearTimers();
      joined = false;
      try {
        if (socket?.readyState === WebSocket.OPEN) {
          send({
            topic:`realtime:${realtimeLogicalTopic(cleanId)}`,
            event:"phx_leave",
            payload:{},
            ref:nextRef(),
            join_ref:"1"
          });
        }
        socket?.close?.();
      } catch {}
      socket = null;
      emitStatus("closed");
    }

    connect();
    return controller;
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

  function rememberTeacherSession(session, snapshot = null) {
    const previous = loadTeacherHistory().find(item => item.id === session.id) || {};
    const history = loadTeacherHistory().filter(item => item.id !== session.id);
    history.unshift({
      id: session.id,
      code: session.code,
      title: session.title,
      teacherToken: session.teacherToken,
      mode: session.mode,
      sessionKind: session.sessionKind || previous.sessionKind || "activity",
      activityMode: session.activityMode || snapshot?.activity_mode || previous.activityMode || "",
      stageCount: session.stageCount || snapshot?.stage_count || previous.stageCount || 1,
      courseId: session.courseId || snapshot?.course_id || previous.courseId || "",
      courseEncoded: session.courseEncoded || snapshot?.course_encoded || previous.courseEncoded || "",
      currentNodeRef: session.currentNodeRef || snapshot?.current_node_ref || previous.currentNodeRef || "",
      revision: session.revision || snapshot?.revision || previous.revision || 1,
      status: snapshot?.status || session.status || previous.status || "active",
      participantCount: Number(snapshot?.participant_count ?? previous.participantCount ?? 0),
      responseCount: Number(snapshot?.response_count ?? previous.responseCount ?? 0),
      lastViewedAt: new Date().toISOString(),
      createdAt: session.createdAt || previous.createdAt || new Date().toISOString()
    });
    saveTeacherHistory(history);
  }

  function updateTeacherHistory(sessionMeta, snapshot = null) {
    if (!sessionMeta?.id) return;
    const history = loadTeacherHistory();
    const index = history.findIndex(item => item.id === sessionMeta.id);
    if (index < 0) {
      rememberTeacherSession(sessionMeta, snapshot);
      return;
    }
    const previous = history[index];
    history[index] = {
      ...previous,
      code: sessionMeta.code || previous.code,
      title: sessionMeta.title || previous.title,
      mode: sessionMeta.mode || previous.mode,
      sessionKind: sessionMeta.sessionKind || snapshot?.session_kind || previous.sessionKind || "activity",
      activityMode: sessionMeta.activityMode || snapshot?.activity_mode || previous.activityMode || "",
      stageCount: sessionMeta.stageCount || snapshot?.stage_count || previous.stageCount || 1,
      courseId: sessionMeta.courseId || snapshot?.course_id || previous.courseId || "",
      courseEncoded: sessionMeta.courseEncoded || snapshot?.course_encoded || previous.courseEncoded || "",
      currentNodeRef: sessionMeta.currentNodeRef || snapshot?.current_node_ref || previous.currentNodeRef || "",
      revision: sessionMeta.revision || snapshot?.revision || previous.revision || 1,
      status: snapshot?.status || sessionMeta.status || previous.status || "active",
      participantCount: Number(snapshot?.participant_count ?? previous.participantCount ?? 0),
      responseCount: Number(snapshot?.response_count ?? previous.responseCount ?? 0),
      lastViewedAt: new Date().toISOString()
    };
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
        id, code, title, teacherToken, mode:"cloud", sessionKind:"activity",
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
      id, code, title, teacherToken, mode:"local", sessionKind:"activity",
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

  async function createCourseSession({
    title,
    courseEncoded,
    courseId = "",
    currentNodeRef,
    activityMode = "",
    stageCount = 1
  }) {
    if (!courseEncoded || !currentNodeRef) throw new Error("完整課程 Session 資料不完整");

    const code = randomCode();
    const teacherToken = randomToken();

    if (isCloudConfigured()) {
      const result = await rpc("create_course_session", {
        p_code:code,
        p_teacher_token:teacherToken,
        p_title:title,
        p_course_encoded:courseEncoded,
        p_course_id:courseId || "",
        p_current_node_ref:currentNodeRef,
        p_activity_mode:activityMode || "",
        p_stage_count:Math.max(1,Number(stageCount)||1)
      });
      const id = typeof result === "string" ? result : (result?.id || result?.session_id || result);
      const session = {
        id,code,title,teacherToken,mode:"cloud",sessionKind:"course",
        courseId:courseId || "",
        courseEncoded,
        currentNodeRef,
        revision:1,
        activityMode:activityMode || "",
        stageCount:Math.max(1,Number(stageCount)||1),
        currentStage:1,
        createdAt:new Date().toISOString()
      };
      rememberTeacherSession(session);
      return session;
    }

    const sessions = loadLocalSessions();
    const id = crypto?.randomUUID?.() || `local-course-${Date.now()}`;
    const session = {
      id,code,title,teacherToken,mode:"local",sessionKind:"course",
      courseId:courseId || "",
      courseEncoded,
      currentNodeRef,
      revision:1,
      activityMode:activityMode || "",
      stageCount:Math.max(1,Number(stageCount)||1),
      currentStage:1,
      status:"active",
      createdAt:new Date().toISOString(),
      participants:[],
      responses:[],
      progress:[]
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
      if (!data?.session_id) throw new Error("無法取得課堂 Session");
      const kind = data.session_kind || "activity";
      if (kind === "course" && !data.course_encoded) throw new Error("無法取得完整課程");
      if (kind !== "course" && !data.activity_encoded) throw new Error("無法取得課堂活動");
      const context = {
        mode:"cloud",
        cloudConfig:config,
        sessionId:data.session_id,
        participantId:data.participant_id,
        participantToken,
        studentCode:cleanStudent,
        code:cleanCode,
        title:data.title || (kind === "course" ? "完整課程" : "課堂活動"),
        sessionKind:kind,
        activityEncoded:data.activity_encoded || "",
        activityMode:data.activity_mode || "",
        stageCount:data.stage_count || 1,
        currentStage:data.current_stage || 1,
        courseEncoded:data.course_encoded || "",
        courseId:data.course_id || "",
        currentNodeRef:data.current_node_ref || "",
        revision:data.revision || 1
      };
      saveParticipantContext(context);
      publishRealtime(context.sessionId,"participant",config);
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
      sessionKind:session.sessionKind || "activity",
      activityEncoded:session.activityEncoded || "",
      activityMode:session.activityMode || "",
      stageCount:session.stageCount || 1,
      currentStage:session.currentStage || 1,
      courseEncoded:session.courseEncoded || "",
      courseId:session.courseId || "",
      currentNodeRef:session.currentNodeRef || "",
      revision:session.revision || 1
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
        p_payload: payload,
        p_node_ref: context.currentNodeRef || null
      }, context.cloudConfig);
      publishRealtime(context.sessionId,"response",context.cloudConfig);
      return {ok:true};
    }

    const sessions = loadLocalSessions();
    const session = sessions.find(item => item.id === context.sessionId);
    if (!session) throw new Error("本機 Session 已不存在");
    if (session.status !== "active") throw new Error("Session 已結束");
    const participant = session.participants.find(item => item.id === context.participantId && item.participantToken === context.participantToken);
    if (!participant) throw new Error("學生加入憑證已失效");

    const key = `${context.participantId}:${context.currentNodeRef || "activity"}:${taskIndex}:${stageKey}`;
    const record = {
      key,
      participantId:context.participantId,
      studentCode:context.studentCode,
      nodeRef:context.currentNodeRef || "",
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
      session_kind:session.sessionKind || "activity",
      course_id:session.courseId || "",
      course_encoded:session.courseEncoded || "",
      current_node_ref:session.currentNodeRef || "",
      revision:session.revision || 1,
      activity_mode:session.activityMode,
      current_stage:session.currentStage || 1,
      stage_count:session.stageCount || 1,
      participant_count:session.participants.length,
      response_count:session.responses.length,
      responses:session.responses.map(r => ({
        participant_id:r.participantId, student_code:r.studentCode, node_ref:r.nodeRef || "", task_index:r.taskIndex,
        stage_key:r.stageKey, mode:r.mode, selected_type:r.selectedType, selected_elements:r.selectedElements,
        payload:r.payload, submitted_at:r.submittedAt
      })),
      progress:(session.progress || []).map(item => ({
        participant_id:item.participantId,
        student_code:item.studentCode,
        node_ref:item.nodeRef,
        status:item.status,
        started_at:item.startedAt || null,
        completed_at:item.completedAt || null
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
      publishRealtime(sessionMeta.id,"stage");
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

  function updateParticipantContext(patch = {}) {
    const context = getParticipantContext();
    if (!context) return null;
    const next = {...context,...patch};
    saveParticipantContext(next);
    return next;
  }

  async function setCourseNode(sessionMeta, nodeRef, {
    activityMode = "",
    stageCount = 1
  } = {}) {
    if (!sessionMeta?.id || !nodeRef) throw new Error("Course Session 節點資料不完整");
    const totalStages = Math.max(1,Number(stageCount)||1);

    if (sessionMeta.mode === "cloud") {
      const result = await rpc("set_course_session_node", {
        p_session_id:sessionMeta.id,
        p_teacher_token:sessionMeta.teacherToken,
        p_node_ref:nodeRef,
        p_activity_mode:activityMode || "",
        p_stage_count:totalStages
      });
      const data = typeof result === "string" ? JSON.parse(result) : result;
      sessionMeta.currentNodeRef = data?.current_node_ref || nodeRef;
      sessionMeta.revision = data?.revision || (sessionMeta.revision || 1) + 1;
      sessionMeta.currentStage = data?.current_stage || 1;
      sessionMeta.stageCount = data?.stage_count || totalStages;
      sessionMeta.activityMode = data?.activity_mode || activityMode || "";
      rememberTeacherSession(sessionMeta);
      publishRealtime(sessionMeta.id,"node");
      return data;
    }

    const sessions = loadLocalSessions();
    const session = sessions.find(item => item.id === sessionMeta.id && item.teacherToken === sessionMeta.teacherToken);
    if (!session || (session.sessionKind || "activity") !== "course") throw new Error("找不到完整課程 Session");
    session.currentNodeRef = nodeRef;
    session.revision = (session.revision || 1) + 1;
    session.currentStage = 1;
    session.stageCount = totalStages;
    session.activityMode = activityMode || "";
    sessionMeta.currentNodeRef = nodeRef;
    sessionMeta.revision = session.revision;
    sessionMeta.currentStage = 1;
    sessionMeta.stageCount = totalStages;
    sessionMeta.activityMode = activityMode || "";
    saveLocalSessions(sessions);
    rememberTeacherSession(sessionMeta);
    return {
      current_node_ref:nodeRef,
      revision:session.revision,
      current_stage:1,
      stage_count:totalStages,
      activity_mode:activityMode || ""
    };
  }

  async function submitCourseProgress(nodeRef, status = "completed") {
    const context = getParticipantContext();
    if (!context || context.sessionKind !== "course") return {skipped:true};
    const cleanNode = String(nodeRef || context.currentNodeRef || "").trim();
    if (!cleanNode) throw new Error("找不到目前課程節點");

    if (context.mode === "cloud") {
      await rpc("set_course_node_progress", {
        p_session_id:context.sessionId,
        p_participant_token:context.participantToken,
        p_node_ref:cleanNode,
        p_status:status
      }, context.cloudConfig);
      publishRealtime(context.sessionId,"progress",context.cloudConfig);
      return {ok:true};
    }

    const sessions = loadLocalSessions();
    const session = sessions.find(item => item.id === context.sessionId);
    if (!session) throw new Error("本機 Session 已不存在");
    if (session.status !== "active") throw new Error("Session 已結束");
    const participant = session.participants.find(item => item.id === context.participantId && item.participantToken === context.participantToken);
    if (!participant) throw new Error("學生加入憑證已失效");

    session.progress ||= [];
    const key = `${context.participantId}:${cleanNode}`;
    const now = new Date().toISOString();
    const existing = session.progress.find(item => item.key === key);
    const record = {
      key,
      participantId:context.participantId,
      studentCode:context.studentCode,
      nodeRef:cleanNode,
      status:status === "in-progress" ? "in-progress" : "completed",
      startedAt:existing?.startedAt || now,
      completedAt:status === "completed" ? now : (existing?.completedAt || null)
    };
    if (existing) Object.assign(existing,record);
    else session.progress.push(record);
    saveLocalSessions(sessions);
    return {ok:true};
  }

  async function closeSession(sessionMeta) {
    if (!sessionMeta?.id || !sessionMeta?.teacherToken) throw new Error("Session 資料不完整");
    if (sessionMeta.mode === "cloud") {
      await rpc("close_classroom_session", {
        p_session_id:sessionMeta.id,
        p_teacher_token:sessionMeta.teacherToken
      });
      sessionMeta.status = "closed";
      rememberTeacherSession(sessionMeta);
      publishRealtime(sessionMeta.id,"closed");
      return true;
    }
    const sessions = loadLocalSessions();
    const session = sessions.find(item => item.id === sessionMeta.id && item.teacherToken === sessionMeta.teacherToken);
    if (!session) throw new Error("找不到本機 Session");
    session.status = "closed";
    sessionMeta.status = "closed";
    saveLocalSessions(sessions);
    rememberTeacherSession(sessionMeta);
    return true;
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
    const ownProgress = (session.progress || [])
      .filter(item => item.participantId === participant.id)
      .map(item => ({
        node_ref:item.nodeRef,
        status:item.status,
        started_at:item.startedAt || null,
        completed_at:item.completedAt || null
      }));

    return {
      session_kind:session.sessionKind || "activity",
      current_node_ref:session.currentNodeRef || "",
      revision:session.revision || 1,
      current_stage:session.currentStage || 1,
      stage_count:session.stageCount || 1,
      status:session.status,
      progress:ownProgress,
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
    let url;
    try {
      url = new URL("join.html", location.href);
    } catch {
      url = new URL("join.html", document.baseURI);
    }
    url.searchParams.set("code", session.code);

    if (session.mode === "cloud") {
      const config = getConfig();
      url.hash = `cloud=${encodeCloudConfig(config)}`;
    }
    return url.toString();
  }

  window.ClassroomSessionAPI = {
    getConfig, saveConfig, clearConfig, isCloudConfigured, testCloudConfig,
    createSession, createCourseSession, joinSession, submitResponse, teacherSnapshot, setStage,
    setCourseNode, submitCourseProgress, closeSession, studentState, buildJoinUrl,
    loadTeacherHistory, updateTeacherHistory, getParticipantContext, updateParticipantContext, configFromUrlFragment,
    publishRealtime, subscribeRealtime
  };
})();