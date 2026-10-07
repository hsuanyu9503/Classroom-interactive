(() => {
  const ActivityModules = window.ClassroomActivityModules;
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

  function removeTeacherHistory(sessionId) {
    const cleanId = String(sessionId || "").trim();
    if (!cleanId) return;
    saveTeacherHistory(loadTeacherHistory().filter(item => item.id !== cleanId));
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

  async function createSession({
    title,
    activityEncoded,
    activityMode,
    stageCount=1,
    shellEncoded="",
    deliberationData=null
  }) {
    const code = randomCode();
    const teacherToken = randomToken();
    const totalStages = Math.max(1, Number(stageCount) || 1);

    if (ActivityModules?.get?.(activityMode)?.requiresCloud && !isCloudConfigured()) {
      throw new Error(`${ActivityModules.modeLabel(activityMode)}正式 Session 必須先完成 Supabase 雲端設定，才能確保未公開資訊不會傳到學生端`);
    }

    if (isCloudConfigured()) {
      let result;
      const customCreate = ActivityModules?.invoke?.("session", activityMode, "createCloud", {
        code, teacherToken, title, activityEncoded, activityMode, totalStages, shellEncoded, deliberationData
      });
      if (customCreate !== undefined) {
        result = await customCreate;
      } else {
        result = await rpc("create_classroom_session", {
          p_code: code,
          p_teacher_token: teacherToken,
          p_title: title,
          p_activity_encoded: activityEncoded,
          p_activity_mode: activityMode || "",
          p_stage_count: totalStages
        });
      }
      const id = typeof result === "string" ? result : (result?.id || result?.session_id || result);
      const session = {
        id, code, title, teacherToken, mode:"cloud", sessionKind:"activity",
        activityMode: activityMode || "",
        stageCount: totalStages,
        currentStage: 1,
        roundState: ActivityModules?.get?.(activityMode)?.initialRoundState || "",
        createdAt:new Date().toISOString()
      };
      rememberTeacherSession(session);
      return session;
    }

    const sessions = loadLocalSessions();
    const id = crypto?.randomUUID?.() || `local-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;
    const session = {
      id, code, title, teacherToken, mode:"local", sessionKind:"activity",
      activityMode: activityMode || "",
      activityEncoded,
      stageCount: totalStages,
      currentStage: 1,
      roundState: ActivityModules?.get?.(activityMode)?.initialRoundState || "",
      status:"active",
      createdAt:new Date().toISOString(),
      participants:[],
      responses:[],
      liveStanceEvents:[],
      liveStanceCheckpoints:[],
      questionWallPosts:[],
      questionWallVotes:[],
      questionWallReplies:[],
      sessionGroups:[],
      sessionGroupMembers:[],
      groupConsensusSubmissions:[]
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
        roundState:ActivityModules?.get?.(activityMode)?.initialRoundState || "",
        createdAt:new Date().toISOString()
      };
      rememberTeacherSession(session);
      return session;
    }

    const sessions = loadLocalSessions();
    const id = crypto?.randomUUID?.() || `local-course-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;
    const session = {
      id,code,title,teacherToken,mode:"local",sessionKind:"course",
      courseId:courseId || "",
      courseEncoded,
      currentNodeRef,
      revision:1,
      activityMode:activityMode || "",
      stageCount:Math.max(1,Number(stageCount)||1),
      currentStage:1,
      roundState:ActivityModules?.get?.(activityMode)?.initialRoundState || "",
      status:"active",
      createdAt:new Date().toISOString(),
      participants:[],
      responses:[],
      progress:[],
      liveStanceEvents:[],
      liveStanceCheckpoints:[],
      questionWallPosts:[],
      questionWallVotes:[],
      questionWallReplies:[],
      sessionGroups:[],
      sessionGroupMembers:[],
      groupConsensusSubmissions:[]
    };
    sessions.unshift(session);
    saveLocalSessions(sessions);
    rememberTeacherSession(session);
    return session;
  }

  async function joinSession(code, studentCode, cloudConfig = null) {
    const cleanCode = String(code || "").trim().toUpperCase();
    const cleanStudent = String(studentCode || "").trim();
    if (!cleanCode || !cleanStudent) throw new Error("請輸入課堂代碼與座號、姓名或暱稱");

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
        id:crypto?.randomUUID?.() || `p-${Date.now()}-${Math.random().toString(36).slice(2,10)}`,
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
    if (mode === "group-consensus" && session.activityMode === "group-consensus") {
      if (stageKey !== "individual") throw new Error("小組共識的個人階段資料格式不正確");
      if (Number(session.currentStage || 1) !== 1) throw new Error("個人判斷階段已結束");
    }
    if (mode === "live-stance" && session.activityMode === "live-stance" && (session.roundState || "open") !== "open") {
      throw new Error("老師目前已鎖定表態");
    }
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
    if (mode === "live-stance" && stageKey === "final") {
      const previous = index >= 0 ? String(session.responses[index]?.selectedType || "") : "";
      const next = String(selectedType || "");
      if (next && next !== previous) {
        session.liveStanceEvents = Array.isArray(session.liveStanceEvents) ? session.liveStanceEvents : [];
        session.liveStanceEvents.push({
          id:crypto?.randomUUID?.() || `lse-${Date.now()}-${session.liveStanceEvents.length+1}`,
          participantId:context.participantId,
          studentCode:context.studentCode,
          side:next,
          previousSide:previous || "",
          payload:{...(payload || {})},
          createdAt:new Date().toISOString()
        });
      }
    }
    if (index >= 0) session.responses[index] = record;
    else session.responses.push(record);
    saveLocalSessions(sessions);
    return {ok:true};
  }

  async function submitQuestionWallPost(text, maxPosts = 3) {
    const context=getParticipantContext();
    if(!context) throw new Error("尚未加入課堂 Session");
    const clean=String(text||"").trim();
    if(!clean) throw new Error("問題內容不能空白");
    if(clean.length>500) throw new Error("單則問題最多 500 字");
    const limit=Math.max(1,Math.min(5,Math.round(Number(maxPosts)||3)));
    if(context.mode==="cloud") {
      const result=await rpc("submit_question_wall_post",{
        p_session_id:context.sessionId,
        p_participant_token:context.participantToken,
        p_text:clean,
        p_node_ref:context.currentNodeRef || null,
        p_max_posts:limit
      },context.cloudConfig);
      publishRealtime(context.sessionId,"question-wall",context.cloudConfig);
      return typeof result==="string"?{id:result}:result;
    }
    const sessions=loadLocalSessions();
    const session=sessions.find(item=>item.id===context.sessionId);
    if(!session||session.status!=="active") throw new Error("Session 已結束或不存在");
    const participant=session.participants.find(item=>item.id===context.participantId&&item.participantToken===context.participantToken);
    if(!participant) throw new Error("學生加入憑證已失效");
    session.questionWallPosts=Array.isArray(session.questionWallPosts)?session.questionWallPosts:[];
    session.questionWallVotes=Array.isArray(session.questionWallVotes)?session.questionWallVotes:[];
    session.questionWallReplies=Array.isArray(session.questionWallReplies)?session.questionWallReplies:[];
    const nodeRef=context.currentNodeRef||"";
    const ownCount=session.questionWallPosts.filter(post=>post.participantId===participant.id&&(post.nodeRef||"")===nodeRef).length;
    if(ownCount>=limit) throw new Error(`每人最多提出 ${limit} 個問題`);
    const post={id:crypto?.randomUUID?.()||`qwp-${Date.now()}-${Math.random().toString(36).slice(2,10)}`,participantId:participant.id,studentCode:participant.studentCode,nodeRef,text:clean,createdAt:new Date().toISOString()};
    session.questionWallPosts.push(post);saveLocalSessions(sessions);return {id:post.id};
  }

  async function toggleQuestionWallVote(postId) {
    const context=getParticipantContext();
    if(!context) throw new Error("尚未加入課堂 Session");
    const cleanId=String(postId||"").trim();if(!cleanId)throw new Error("找不到這則提問");
    if(context.mode==="cloud") {
      const result=await rpc("toggle_question_wall_vote",{p_session_id:context.sessionId,p_participant_token:context.participantToken,p_post_id:cleanId},context.cloudConfig);
      publishRealtime(context.sessionId,"question-wall-vote",context.cloudConfig);
      return result;
    }
    const sessions=loadLocalSessions();const session=sessions.find(item=>item.id===context.sessionId);
    if(!session||session.status!=="active")throw new Error("Session 已結束或不存在");
    const participant=session.participants.find(item=>item.id===context.participantId&&item.participantToken===context.participantToken);
    if(!participant)throw new Error("學生加入憑證已失效");
    session.questionWallPosts=Array.isArray(session.questionWallPosts)?session.questionWallPosts:[];session.questionWallVotes=Array.isArray(session.questionWallVotes)?session.questionWallVotes:[];
    const post=session.questionWallPosts.find(item=>item.id===cleanId);if(!post)throw new Error("找不到這則提問");
    if(post.participantId===participant.id)throw new Error("不能對自己的提問按 ＋1");
    const index=session.questionWallVotes.findIndex(v=>v.postId===cleanId&&v.participantId===participant.id);
    let voted=true;if(index>=0){session.questionWallVotes.splice(index,1);voted=false;}else session.questionWallVotes.push({postId:cleanId,participantId:participant.id,createdAt:new Date().toISOString()});
    saveLocalSessions(sessions);return {voted};
  }

  async function submitQuestionWallReply(postId, text, maxLength = 140) {
    const context=getParticipantContext();
    if(!context) throw new Error("尚未加入課堂 Session");
    const cleanId=String(postId||"").trim();
    const clean=String(text||"").trim();
    const limit=Math.max(30,Math.min(300,Math.round(Number(maxLength)||140)));
    if(!cleanId) throw new Error("找不到這則提問");
    if(!clean) throw new Error("回應內容不能空白");
    if(clean.length>limit) throw new Error(`回應最多 ${limit} 字`);
    if(context.mode==="cloud") {
      const result=await rpc("submit_question_wall_reply",{p_session_id:context.sessionId,p_participant_token:context.participantToken,p_post_id:cleanId,p_text:clean,p_max_length:limit},context.cloudConfig);
      publishRealtime(context.sessionId,"question-wall-reply",context.cloudConfig);
      return result;
    }
    const sessions=loadLocalSessions();const session=sessions.find(item=>item.id===context.sessionId);
    if(!session||session.status!=="active") throw new Error("Session 已結束或不存在");
    const participant=session.participants.find(item=>item.id===context.participantId&&item.participantToken===context.participantToken);
    if(!participant) throw new Error("學生加入憑證已失效");
    session.questionWallPosts=Array.isArray(session.questionWallPosts)?session.questionWallPosts:[];
    session.questionWallReplies=Array.isArray(session.questionWallReplies)?session.questionWallReplies:[];
    const post=session.questionWallPosts.find(item=>item.id===cleanId);if(!post) throw new Error("找不到這則提問");
    if(post.participantId===participant.id) throw new Error("不能回應自己的提問");
    let reply=session.questionWallReplies.find(item=>item.postId===cleanId&&item.participantId===participant.id);
    if(reply){reply.text=clean;reply.updatedAt=new Date().toISOString();}
    else {reply={id:crypto?.randomUUID?.()||`qwr-${Date.now()}-${Math.random().toString(36).slice(2,10)}`,postId:cleanId,participantId:participant.id,studentCode:participant.studentCode,text:clean,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};session.questionWallReplies.push(reply);}
    saveLocalSessions(sessions);return {id:reply.id,updated_at:reply.updatedAt};
  }

  async function deleteQuestionWallReply(sessionMeta, replyId) {
    if(!sessionMeta?.id||!sessionMeta?.teacherToken)throw new Error("Session 資料不完整");
    const cleanId=String(replyId||"").trim();if(!cleanId)throw new Error("找不到這則回應");
    if(sessionMeta.mode==="cloud") {
      await rpc("delete_question_wall_reply",{p_session_id:sessionMeta.id,p_teacher_token:sessionMeta.teacherToken,p_reply_id:cleanId});
      publishRealtime(sessionMeta.id,"question-wall-reply-delete");return true;
    }
    const sessions=loadLocalSessions();const session=sessions.find(item=>item.id===sessionMeta.id&&item.teacherToken===sessionMeta.teacherToken);
    if(!session)throw new Error("找不到本機 Session");
    session.questionWallReplies=Array.isArray(session.questionWallReplies)?session.questionWallReplies:[];
    const before=session.questionWallReplies.length;session.questionWallReplies=session.questionWallReplies.filter(reply=>reply.id!==cleanId);
    if(session.questionWallReplies.length===before)throw new Error("找不到這則回應");
    saveLocalSessions(sessions);return true;
  }

  async function deleteQuestionWallPost(sessionMeta, postId) {
    if(!sessionMeta?.id||!sessionMeta?.teacherToken)throw new Error("Session 資料不完整");
    const cleanId=String(postId||"").trim();if(!cleanId)throw new Error("找不到這則提問");
    if(sessionMeta.mode==="cloud") {
      await rpc("delete_question_wall_post",{p_session_id:sessionMeta.id,p_teacher_token:sessionMeta.teacherToken,p_post_id:cleanId});
      publishRealtime(sessionMeta.id,"question-wall-delete");return true;
    }
    const sessions=loadLocalSessions();const session=sessions.find(item=>item.id===sessionMeta.id&&item.teacherToken===sessionMeta.teacherToken);
    if(!session)throw new Error("找不到本機 Session");
    session.questionWallPosts=Array.isArray(session.questionWallPosts)?session.questionWallPosts:[];session.questionWallVotes=Array.isArray(session.questionWallVotes)?session.questionWallVotes:[];session.questionWallReplies=Array.isArray(session.questionWallReplies)?session.questionWallReplies:[];
    session.questionWallPosts=session.questionWallPosts.filter(post=>post.id!==cleanId);session.questionWallVotes=session.questionWallVotes.filter(v=>v.postId!==cleanId);session.questionWallReplies=session.questionWallReplies.filter(r=>r.postId!==cleanId);
    saveLocalSessions(sessions);return true;
  }

  async function assignSessionGroups(sessionMeta, groupSize = 4) {
    if(!sessionMeta?.id||!sessionMeta?.teacherToken)throw new Error("Session 資料不完整");
    const size=Math.max(2,Math.min(6,Math.round(Number(groupSize)||4)));
    if(sessionMeta.mode==="cloud") {
      const result=await rpc("assign_session_groups",{p_session_id:sessionMeta.id,p_teacher_token:sessionMeta.teacherToken,p_group_size:size});
      publishRealtime(sessionMeta.id,"group-assignment");return result;
    }
    const sessions=loadLocalSessions();const session=sessions.find(item=>item.id===sessionMeta.id&&item.teacherToken===sessionMeta.teacherToken);
    if(!session||session.status!=="active")throw new Error("找不到進行中的本機 Session");
    const participants=[...(session.participants||[])];if(participants.length<2)throw new Error("至少需要 2 位學生才能分組");
    for(let i=participants.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[participants[i],participants[j]]=[participants[j],participants[i]];}
    // 「每組約 N 人」而不是硬性上限：若照 ceil 分組會產生單人組，寧可讓部分小組多 1 人。
    const groupCount=Math.max(1,Math.min(Math.ceil(participants.length/size),Math.floor(participants.length/2)));
    session.sessionGroups=Array.from({length:groupCount},(_,index)=>({id:crypto?.randomUUID?.()||`grp-${Date.now()}-${index}-${Math.random().toString(36).slice(2,8)}`,groupIndex:index+1,label:`第 ${index+1} 組`,createdAt:new Date().toISOString()}));
    session.sessionGroupMembers=[];participants.forEach((participant,index)=>{const group=session.sessionGroups[index%groupCount];session.sessionGroupMembers.push({groupId:group.id,participantId:participant.id,createdAt:new Date().toISOString()});});
    session.groupConsensusSubmissions=[];saveLocalSessions(sessions);return {group_count:groupCount,participant_count:participants.length};
  }

  async function submitGroupConsensus({selectedType="",payload={},nodeRef=""}={}) {
    const context=getParticipantContext();if(!context)throw new Error("尚未加入課堂 Session");const choice=String(selectedType||"").trim();if(!choice)throw new Error("請先選擇小組共識答案");
    if(context.mode==="cloud") {
      const result=await rpc("submit_group_consensus",{p_session_id:context.sessionId,p_participant_token:context.participantToken,p_selected_type:choice,p_payload:payload||{},p_node_ref:nodeRef||context.currentNodeRef||null},context.cloudConfig);
      publishRealtime(context.sessionId,"group-consensus",context.cloudConfig);return result;
    }
    const sessions=loadLocalSessions();const session=sessions.find(item=>item.id===context.sessionId);if(!session||session.status!=="active")throw new Error("Session 已結束或不存在");
    if(session.activityMode!=="group-consensus"||Number(session.currentStage||1)<2)throw new Error("小組共識尚未開放");
    const participant=session.participants.find(item=>item.id===context.participantId&&item.participantToken===context.participantToken);if(!participant)throw new Error("學生加入憑證已失效");
    const member=(session.sessionGroupMembers||[]).find(item=>item.participantId===participant.id);if(!member)throw new Error("你目前尚未被分組");
    session.groupConsensusSubmissions=Array.isArray(session.groupConsensusSubmissions)?session.groupConsensusSubmissions:[];const ref=context.sessionKind==="course"?(nodeRef||context.currentNodeRef||""):"";
    let row=session.groupConsensusSubmissions.find(item=>item.groupId===member.groupId&&(item.nodeRef||"")===ref);
    if(row){row.selectedType=choice;row.payload={...(payload||{})};row.submittedBy=participant.id;row.updatedAt=new Date().toISOString();}
    else{row={id:crypto?.randomUUID?.()||`gcs-${Date.now()}-${Math.random().toString(36).slice(2,9)}`,groupId:member.groupId,nodeRef:ref,selectedType:choice,payload:{...(payload||{})},submittedBy:participant.id,submittedAt:new Date().toISOString(),updatedAt:new Date().toISOString()};session.groupConsensusSubmissions.push(row);}
    saveLocalSessions(sessions);return {id:row.id,updated_at:row.updatedAt};
  }

  function validateTeacherHandoffPackage(payload) {
    if (!payload || payload.schema !== "classroom-teacher-handoff" || Number(payload.version) !== 1) {
      throw new Error("這不是有效的教師 Session 接手檔");
    }
    const session = payload.session || {};
    const cloud = payload.cloud || {};
    if (!session.id || !session.teacherToken || !cloud.url || !cloud.key) {
      throw new Error("教師接手檔內容不完整");
    }
    if (String(cloud.key).startsWith("sb_secret_")) {
      throw new Error("接手檔包含不可使用的 Supabase secret key");
    }
    if (!/^https:\/\/.+\.supabase\.co$/i.test(String(cloud.url).replace(/\/+$/,""))) {
      throw new Error("教師接手檔中的 Supabase Project URL 無效");
    }
    return {
      schema:"classroom-teacher-handoff",
      version:1,
      appVersion:String(payload.appVersion || ""),
      exportedAt:payload.exportedAt || "",
      cloud:{url:String(cloud.url).trim().replace(/\/+$/,""),key:String(cloud.key).trim()},
      session:{
        id:String(session.id).trim(), code:String(session.code || "").trim(),
        title:String(session.title || "課堂 Session").trim(), teacherToken:String(session.teacherToken).trim(),
        sessionKind:session.sessionKind === "course" ? "course" : "activity",
        activityMode:String(session.activityMode || ""), courseId:String(session.courseId || "")
      }
    };
  }

  async function createTeacherHandoff(sessionMeta) {
    if (!sessionMeta?.id || !sessionMeta?.teacherToken) throw new Error("Session 資料不完整");
    if (sessionMeta.mode !== "cloud") throw new Error("只有 Supabase 雲端 Session 可以跨裝置接手");
    const snapshot = await teacherSnapshot(sessionMeta);
    if ((snapshot?.status || sessionMeta.status || "") !== "active") throw new Error("只有進行中的雲端 Session 可以建立教師接手檔");
    const config = getConfig();
    if (!config?.url || !config?.key) throw new Error("找不到目前的 Supabase 雲端設定");
    return {
      schema:"classroom-teacher-handoff", version:1, appVersion:"2.26.1", exportedAt:new Date().toISOString(),
      warning:"此檔案可轉移教師 Session 控制權，請勿傳給學生或公開分享。",
      cloud:{url:config.url,key:config.key},
      session:{
        id:sessionMeta.id, code:sessionMeta.code || snapshot?.code || "", title:sessionMeta.title || snapshot?.title || "課堂 Session",
        teacherToken:sessionMeta.teacherToken, sessionKind:snapshot?.session_kind || sessionMeta.sessionKind || "activity",
        activityMode:snapshot?.activity_mode ?? sessionMeta.activityMode ?? "", courseId:snapshot?.course_id || sessionMeta.courseId || ""
      }
    };
  }

  async function claimTeacherHandoff(payload) {
    const handoff = validateTeacherHandoffPackage(payload);
    const newTeacherToken = randomToken();
    const claimed = await rpc("claim_classroom_session", {
      p_session_id:handoff.session.id,
      p_teacher_token:handoff.session.teacherToken,
      p_new_teacher_token:newTeacherToken
    }, handoff.cloud);
    const claimMeta = typeof claimed === "string" ? JSON.parse(claimed) : (claimed || {});
    const sessionMeta = {
      id:handoff.session.id, code:claimMeta.code || handoff.session.code, title:claimMeta.title || handoff.session.title,
      teacherToken:newTeacherToken, mode:"cloud",
      sessionKind:claimMeta.session_kind || handoff.session.sessionKind || "activity",
      activityMode:claimMeta.activity_mode ?? handoff.session.activityMode ?? "",
      stageCount:Number(claimMeta.stage_count || 1), courseId:claimMeta.course_id || handoff.session.courseId || "",
      courseEncoded:claimMeta.course_encoded || "", currentNodeRef:claimMeta.current_node_ref || "",
      revision:Number(claimMeta.revision || 1), status:claimMeta.status || "active",
      createdAt:claimMeta.created_at || new Date().toISOString()
    };
    // token 已在伺服器完成輪替後，先把新控制憑證落地保存。
    // 即使下一個 snapshot 請求剛好斷線，也不會遺失新的 teacherToken。
    saveConfig(handoff.cloud.url,handoff.cloud.key);
    rememberTeacherSession(sessionMeta,claimMeta);

    let snapshot = null;
    let snapshotWarning = "";
    try {
      snapshot = await teacherSnapshot(sessionMeta);
      rememberTeacherSession(sessionMeta,snapshot);
    } catch (error) {
      snapshotWarning = error.message || "已接手控制權，但暫時無法同步 Session 資料";
    }
    return {sessionMeta,snapshot,snapshotWarning};
  }

  async function teacherSnapshot(sessionMeta) {
    if (!sessionMeta?.id || !sessionMeta?.teacherToken) throw new Error("Session 資料不完整");

    if (sessionMeta.mode === "cloud") {
      const result = await rpc("get_teacher_session", {
        p_session_id: sessionMeta.id,
        p_teacher_token: sessionMeta.teacherToken
      });
      const snapshot = typeof result === "string" ? JSON.parse(result) : (result || {});
      if ((snapshot?.activity_mode || sessionMeta.activityMode) === "live-stance") {
        try {
          const historyResult = await rpc("get_live_stance_history", {
            p_session_id:sessionMeta.id,
            p_teacher_token:sessionMeta.teacherToken
          });
          const history = typeof historyResult === "string" ? JSON.parse(historyResult) : (historyResult || {});
          snapshot.live_stance_events = Array.isArray(history.live_stance_events) ? history.live_stance_events : [];
          snapshot.live_stance_checkpoints = Array.isArray(history.live_stance_checkpoints) ? history.live_stance_checkpoints : [];
        } catch (error) {
          console.warn("無法取得即時立場歷程",error);
          snapshot.live_stance_events = [];
          snapshot.live_stance_checkpoints = [];
        }
      }
      return snapshot;
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
      round_state:session.roundState || "",
      participant_count:session.participants.length,
      response_count:session.activityMode === "question-wall" ? (session.questionWallPosts || []).length + (session.questionWallReplies || []).length : session.activityMode === "group-consensus" ? session.responses.length + (session.groupConsensusSubmissions || []).length : session.responses.length,
      responses:session.responses.map(r => ({
        participant_id:r.participantId, student_code:r.studentCode, node_ref:r.nodeRef || "", task_index:r.taskIndex,
        stage_key:r.stageKey, mode:r.mode, selected_type:r.selectedType, selected_elements:r.selectedElements,
        payload:r.payload, submitted_at:r.submittedAt
      })),
      live_stance_events:(session.liveStanceEvents || []).map(event => ({
        id:event.id, participant_id:event.participantId, student_code:event.studentCode, side:event.side,
        previous_side:event.previousSide || "", payload:event.payload || {}, created_at:event.createdAt
      })),
      live_stance_checkpoints:(session.liveStanceCheckpoints || []).map(item => ({
        id:item.id, label:item.label, snapshot:item.snapshot || {}, created_at:item.createdAt
      })),
      question_wall_posts:(session.questionWallPosts || [])
        .filter(post => (session.sessionKind !== "course" || (post.nodeRef || "") === (session.currentNodeRef || "")))
        .map(post => ({
          id:post.id, participant_id:post.participantId, student_code:post.studentCode, node_ref:post.nodeRef || "",
          text:post.text, vote_count:(session.questionWallVotes || []).filter(v=>v.postId===post.id).length,
          replies:(session.questionWallReplies || []).filter(r=>r.postId===post.id).map(r=>({id:r.id,participant_id:r.participantId,student_code:r.studentCode,text:r.text,created_at:r.createdAt,updated_at:r.updatedAt||r.createdAt})),
          reply_count:(session.questionWallReplies || []).filter(r=>r.postId===post.id).length, created_at:post.createdAt
        })),
      groups:(session.sessionGroups || []).map(group=>({
        id:group.id,group_index:group.groupIndex,label:group.label,
        members:(session.sessionGroupMembers || []).filter(member=>member.groupId===group.id).map(member=>{const p=session.participants.find(item=>item.id===member.participantId);return {participant_id:member.participantId,student_code:p?.studentCode||""};})
      })),
      group_submissions:(session.groupConsensusSubmissions || []).map(row=>{const submitter=session.participants.find(item=>item.id===row.submittedBy);return {id:row.id,group_id:row.groupId,node_ref:row.nodeRef||"",selected_type:row.selectedType,payload:row.payload||{},submitted_by:row.submittedBy,submitted_by_code:submitter?.studentCode||"",submitted_at:row.submittedAt,updated_at:row.updatedAt||row.submittedAt};}),
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
        response_count:session.activityMode === "question-wall"
          ? (session.questionWallPosts || []).filter(post => post.participantId === p.id).length + (session.questionWallReplies || []).filter(reply => reply.participantId === p.id).length
          : session.responses.filter(r => r.participantId === p.id).length,
        last_submitted_at:session.activityMode === "question-wall"
          ? [...(session.questionWallPosts || []).filter(post=>post.participantId===p.id).map(post=>post.createdAt),...(session.questionWallReplies || []).filter(reply=>reply.participantId===p.id).map(reply=>reply.updatedAt||reply.createdAt)].sort().at(-1) || null
          : session.responses.filter(r => r.participantId === p.id).map(r => r.submittedAt).sort().at(-1) || null
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

  async function setDeliberationReasonVisibility(sessionMeta,responseId,hidden) {
    if (!sessionMeta?.id || !sessionMeta?.teacherToken) throw new Error("Session 資料不完整");
    if (sessionMeta.activityMode !== "layered-deliberation") throw new Error("目前不是逐層思辨 Session");
    if (sessionMeta.mode !== "cloud") throw new Error("匿名理由審核需要 Supabase 雲端 Session");
    const cleanId=String(responseId || "").trim();
    if (!cleanId) throw new Error("找不到這筆匿名理由");
    const result=await rpc("set_deliberation_reason_visibility",{
      p_session_id:sessionMeta.id,
      p_teacher_token:sessionMeta.teacherToken,
      p_response_id:cleanId,
      p_hidden:Boolean(hidden)
    });
    publishRealtime(sessionMeta.id,"reason-visibility");
    return result;
  }

  async function setDeliberationState(sessionMeta,{stage=null,roundState=null}={}) {
    if (!sessionMeta?.id || !sessionMeta?.teacherToken) throw new Error("Session 資料不完整");
    if (sessionMeta.activityMode !== "layered-deliberation") throw new Error("目前不是逐層思辨 Session");
    if (sessionMeta.mode !== "cloud") throw new Error("逐層思辨狀態控制需要 Supabase 雲端 Session");

    const result = await rpc("set_deliberation_round", {
      p_session_id:sessionMeta.id,
      p_teacher_token:sessionMeta.teacherToken,
      p_stage:stage == null ? Number(sessionMeta.currentStage || 1) : Number(stage),
      p_round_state:roundState || sessionMeta.roundState || "open"
    });
    const data=typeof result === "string" ? JSON.parse(result) : (result || {});
    sessionMeta.currentStage=Number(data.current_stage || stage || sessionMeta.currentStage || 1);
    sessionMeta.stageCount=Number(data.stage_count || sessionMeta.stageCount || 1);
    sessionMeta.roundState=data.round_state || roundState || sessionMeta.roundState || "open";
    rememberTeacherSession(sessionMeta,data);
    publishRealtime(sessionMeta.id,"stage");
    return data;
  }

  async function setLiveStanceState(sessionMeta, roundState = "open") {
    if (!sessionMeta?.id || !sessionMeta?.teacherToken) throw new Error("Session 資料不完整");
    if (sessionMeta.activityMode !== "live-stance") throw new Error("目前不是即時立場拉鋸 Session");
    const target = roundState === "locked" ? "locked" : "open";

    if (sessionMeta.mode === "cloud") {
      const result = await rpc("set_live_stance_state", {
        p_session_id:sessionMeta.id,
        p_teacher_token:sessionMeta.teacherToken,
        p_round_state:target
      });
      const data=typeof result === "string" ? JSON.parse(result) : (result || {});
      sessionMeta.roundState=data.round_state || target;
      rememberTeacherSession(sessionMeta,data);
      publishRealtime(sessionMeta.id,"live-stance-state");
      return data;
    }

    const sessions=loadLocalSessions();
    const session=sessions.find(item=>item.id===sessionMeta.id && item.teacherToken===sessionMeta.teacherToken);
    if(!session) throw new Error("找不到本機 Session");
    if(session.status!=="active") throw new Error("Session 已結束");
    if(session.activityMode!=="live-stance") throw new Error("目前不是即時立場拉鋸 Session");
    session.roundState=target;
    sessionMeta.roundState=target;
    saveLocalSessions(sessions);
    rememberTeacherSession(sessionMeta);
    return {round_state:target};
  }

  async function createLiveStanceCheckpoint(sessionMeta,label="") {
    if (!sessionMeta?.id || !sessionMeta?.teacherToken) throw new Error("Session 資料不完整");
    if (sessionMeta.activityMode !== "live-stance") throw new Error("目前不是即時立場拉鋸 Session");
    const cleanLabel=String(label || "").trim().slice(0,120);

    if (sessionMeta.mode === "cloud") {
      const result=await rpc("create_live_stance_checkpoint",{
        p_session_id:sessionMeta.id,
        p_teacher_token:sessionMeta.teacherToken,
        p_label:cleanLabel || null
      });
      publishRealtime(sessionMeta.id,"live-stance-checkpoint");
      return typeof result === "string" ? JSON.parse(result) : result;
    }

    const sessions=loadLocalSessions();
    const session=sessions.find(item=>item.id===sessionMeta.id && item.teacherToken===sessionMeta.teacherToken);
    if(!session) throw new Error("找不到本機 Session");
    if(session.status!=="active") throw new Error("Session 已結束");
    const rows=(session.responses || []).filter(item=>item.mode==="live-stance" && item.stageKey==="final");
    const counts={left:0,right:0,undecided:0};
    rows.forEach(row=>{const side=String(row.selectedType || "");if(side in counts)counts[side]++;});
    session.liveStanceCheckpoints=Array.isArray(session.liveStanceCheckpoints)?session.liveStanceCheckpoints:[];
    const checkpoint={
      id:crypto?.randomUUID?.() || `lsc-${Date.now()}-${session.liveStanceCheckpoints.length+1}`,
      label:cleanLabel || `節點 ${session.liveStanceCheckpoints.length+1}`,
      snapshot:{...counts,answered:counts.left+counts.right+counts.undecided,total:(session.participants || []).length,round_state:session.roundState || "open"},
      createdAt:new Date().toISOString()
    };
    session.liveStanceCheckpoints.push(checkpoint);
    saveLocalSessions(sessions);
    return {id:checkpoint.id,label:checkpoint.label,snapshot:checkpoint.snapshot,created_at:checkpoint.createdAt};
  }

  async function deleteLiveStanceCheckpoint(sessionMeta,checkpointId) {
    if (!sessionMeta?.id || !sessionMeta?.teacherToken) throw new Error("Session 資料不完整");
    if (sessionMeta.activityMode !== "live-stance") throw new Error("目前不是即時立場拉鋸 Session");
    const cleanId=String(checkpointId || "").trim();
    if(!cleanId) throw new Error("找不到節點紀錄");
    if(sessionMeta.mode==="cloud") {
      const result=await rpc("delete_live_stance_checkpoint",{
        p_session_id:sessionMeta.id,
        p_teacher_token:sessionMeta.teacherToken,
        p_checkpoint_id:cleanId
      });
      publishRealtime(sessionMeta.id,"live-stance-checkpoint");
      return result;
    }
    const sessions=loadLocalSessions();
    const session=sessions.find(item=>item.id===sessionMeta.id && item.teacherToken===sessionMeta.teacherToken);
    if(!session) throw new Error("找不到本機 Session");
    session.liveStanceCheckpoints=(session.liveStanceCheckpoints || []).filter(item=>item.id!==cleanId);
    saveLocalSessions(sessions);
    return true;
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
    session.roundState = ActivityModules?.get?.(activityMode)?.initialRoundState || "";
    sessionMeta.currentNodeRef = nodeRef;
    sessionMeta.revision = session.revision;
    sessionMeta.currentStage = 1;
    sessionMeta.stageCount = totalStages;
    sessionMeta.activityMode = activityMode || "";
    sessionMeta.roundState = session.roundState;
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

  async function deleteSession(sessionMeta) {
    if (!sessionMeta?.id || !sessionMeta?.teacherToken) throw new Error("Session 資料不完整");
    if ((sessionMeta.status || "") !== "closed") throw new Error("請先結束 Session，再進行刪除");

    if (sessionMeta.mode === "cloud") {
      await rpc("delete_classroom_session", {
        p_session_id:sessionMeta.id,
        p_teacher_token:sessionMeta.teacherToken
      });
      removeTeacherHistory(sessionMeta.id);
      return true;
    }

    const sessions = loadLocalSessions();
    const index = sessions.findIndex(item =>
      item.id === sessionMeta.id && item.teacherToken === sessionMeta.teacherToken
    );
    if (index < 0) {
      // 舊 History 可能已沒有本機 Session 實體；仍允許清除歷史項目。
      removeTeacherHistory(sessionMeta.id);
      return true;
    }
    if ((sessions[index].status || "active") !== "closed") {
      throw new Error("請先結束 Session，再進行刪除");
    }

    sessions.splice(index,1);
    saveLocalSessions(sessions);
    removeTeacherHistory(sessionMeta.id);
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
      .filter(r => r.participantId === participant.id && Boolean(ActivityModules?.get?.(r.mode)?.realtimeStudent))
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
      round_state:session.roundState || "",
      progress:ownProgress,
      responses:ownResponses,
      question_wall_posts:(session.questionWallPosts || [])
        .filter(post => session.sessionKind !== "course" || (post.nodeRef || "") === (session.currentNodeRef || ""))
        .map(post => ({
          id:post.id,
          text:post.text,
          vote_count:(session.questionWallVotes || []).filter(v=>v.postId===post.id).length,
          voted_by_me:(session.questionWallVotes || []).some(v=>v.postId===post.id && v.participantId===participant.id),
          is_own:post.participantId===participant.id,
          replies:(session.questionWallReplies || []).filter(r=>r.postId===post.id).map(r=>({id:r.id,text:r.text,is_own:r.participantId===participant.id,created_at:r.createdAt,updated_at:r.updatedAt||r.createdAt})),
          reply_count:(session.questionWallReplies || []).filter(r=>r.postId===post.id).length,
          created_at:post.createdAt
        })),
      group_consensus:session.activityMode==="group-consensus" ? (()=>{
        const member=(session.sessionGroupMembers||[]).find(item=>item.participantId===participant.id);if(!member)return {group:null,submission:null};const group=(session.sessionGroups||[]).find(item=>item.id===member.groupId);const members=(session.sessionGroupMembers||[]).filter(item=>item.groupId===member.groupId).map(item=>{const p=session.participants.find(x=>x.id===item.participantId);return {participant_id:item.participantId,student_code:p?.studentCode||""};});const submission=(session.groupConsensusSubmissions||[]).find(item=>item.groupId===member.groupId&&(session.sessionKind!=="course"||(item.nodeRef||"")===(session.currentNodeRef||"")));return {group:group?{id:group.id,label:group.label,group_index:group.groupIndex,members,member_count:members.length}:null,submission:submission?{id:submission.id,selected_type:submission.selectedType,payload:submission.payload||{},updated_at:submission.updatedAt||submission.submittedAt}:null};
      })() : null,
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

  function registerSessionActivityModules() {
    ActivityModules?.registerHooks?.("session", "layered-deliberation", {
      createCloud:async ({code,teacherToken,title,totalStages,shellEncoded,deliberationData}) => {
        if (!shellEncoded || !deliberationData) throw new Error("逐層思辨 Session 資料不完整");
        return rpc("create_deliberation_session", {
          p_code:code,
          p_teacher_token:teacherToken,
          p_title:title,
          p_activity_shell_encoded:shellEncoded,
          p_deliberation_data:deliberationData,
          p_stage_count:totalStages
        });
      }
    });
  }

  registerSessionActivityModules();

  window.ClassroomSessionAPI = {
    getConfig, saveConfig, clearConfig, isCloudConfigured, testCloudConfig,
    createSession, createCourseSession, joinSession, submitResponse, submitQuestionWallPost, toggleQuestionWallVote, submitQuestionWallReply, deleteQuestionWallReply, deleteQuestionWallPost, assignSessionGroups, submitGroupConsensus, teacherSnapshot, setStage, setDeliberationState, setLiveStanceState, createLiveStanceCheckpoint, deleteLiveStanceCheckpoint, setDeliberationReasonVisibility,
    setCourseNode, submitCourseProgress, closeSession, deleteSession, studentState, buildJoinUrl,
    createTeacherHandoff, claimTeacherHandoff, validateTeacherHandoffPackage,
    loadTeacherHistory, updateTeacherHistory, removeTeacherHistory,
    getParticipantContext, updateParticipantContext, configFromUrlFragment,
    publishRealtime, subscribeRealtime
  };
})();