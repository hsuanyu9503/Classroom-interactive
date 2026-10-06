(() => {
  const $=id=>document.getElementById(id);
  const params=new URLSearchParams(location.hash.replace(/^#/,""));
  const sessionId=params.get("session") || "";
  const storageKey=`classroom-deliberation-presentation-state:${sessionId}`;
  const channelName=`classroom-deliberation-presentation:${sessionId}`;
  const labels={A:"完全不能接受",B:"不太能接受",C:"大致能接受",D:"完全能接受",U:"資訊不足，暫不判斷"};
  let channel=null;
  let latestState=null;
  let lastTeacherSeen=0;
  let pendingRequestId="";
  let projectionView="overview";

  function normalizeOptions(options) {
    const fallback=Object.entries(labels).map(([id,label])=>({id,label}));
    const source=Array.isArray(options)&&options.length ? options : fallback;
    return source.map(item=>({
      id:String(item?.id ?? item?.i ?? "").trim(),
      label:String(item?.label ?? item?.l ?? labels[item?.id ?? item?.i] ?? "").trim()
    })).filter(item=>item.id);
  }

  function renderDistribution(counts={},chartType="bar",options=null) {
    const list=$("dpDistribution");
    list.innerHTML="";
    const normalized=normalizeOptions(options);
    const values=normalized.map(option=>[option,Number(counts[option.id])||0]);
    const total=values.reduce((sum,[,count])=>sum+count,0);
    if (!total) { list.innerHTML='<div class="empty-v15">目前沒有可顯示的全班結果。</div>'; return; }
    list.classList.toggle("answer-chart-pie-mode",chartType==="pie");
    const palette=["#5b67d8","#7b62d7","#9b68cf","#c06fb7","#76839a","#4f94a8","#d48b49","#4f9b71","#b35b75","#8a6a4d"];
    if (chartType === "pie") {
      let cursor=0;const slices=[];
      values.forEach(([,count],index)=>{const start=cursor;cursor+=count/total*100;slices.push(`${palette[index%palette.length]} ${start}% ${cursor}%`);});
      const wrap=document.createElement("div");wrap.className="answer-pie-layout presentation-pie-layout";
      const pie=document.createElement("div");pie.className="answer-pie";pie.style.background=`conic-gradient(${slices.join(",")})`;pie.innerHTML=`<div><strong>${total}</strong><span>份回答</span></div>`;
      const legend=document.createElement("div");legend.className="answer-pie-legend";
      values.forEach(([option,count],index)=>{
        const item=document.createElement("div");
        const dot=document.createElement("i");
        dot.style.setProperty("--legend-color",palette[index%palette.length]);
        const label=document.createElement("span");
        const code=document.createElement("b");
        code.textContent=option.id;
        label.append(code,document.createTextNode(` ${option.label}`));
        const strong=document.createElement("strong");
        strong.textContent=String(count);
        const pct=document.createElement("small");
        pct.textContent=`${Math.round(count/total*100)}%`;
        item.append(dot,label,strong,pct);
        legend.appendChild(item);
      });
      wrap.append(pie,legend);list.appendChild(wrap);return;
    }
    const max=Math.max(...values.map(([,count])=>count),1);
    values.forEach(([option,count])=>{
      const row=document.createElement("div");row.className="stage-distribution-row answer-bar-row";
      const label=document.createElement("span");label.textContent=`${option.id} ${option.label}`;
      const bar=document.createElement("div");const fill=document.createElement("i");fill.style.width=`${count?Math.max(6,(count/max)*100):0}%`;bar.appendChild(fill);
      const strong=document.createElement("strong");strong.innerHTML=`${count}<small>${Math.round(count/total*100)}%</small>`;
      row.append(label,bar,strong);list.appendChild(row);
    });
  }


  function setProjectionView(view) {
    const published=Boolean(latestState?.published);
    projectionView=view==="content"
      ? "content"
      : view==="results" && published
        ? "results"
        : "overview";
    document.body.classList.toggle("dp-view-content",projectionView==="content");
    document.body.classList.toggle("dp-view-results",projectionView==="results");
    $("dpViewOverviewBtn")?.classList.toggle("active",projectionView==="overview");
    $("dpViewContentBtn")?.classList.toggle("active",projectionView==="content");
    $("dpViewResultsBtn")?.classList.toggle("active",projectionView==="results");
  }

  function teacherConnected() {
    return Boolean(lastTeacherSeen && Date.now()-lastTeacherSeen < 5500);
  }

  function updateControlUi(message="",kind="") {
    const connected=teacherConnected();
    const status=$("dpControlStatus");
    if (status) {
      status.className=`dp-control-status ${kind || (connected ? "online" : "offline")}`;
      status.textContent=kind==="busy"
        ? "🟡 正在執行控制…"
        : kind==="error"
          ? `🔴 ${message || "控制失敗"}`
          : connected
            ? "🟢 已連接教師控制端"
            : "⚪ 僅投影模式";
    }
    const hint=$("dpControlHint");
    if (hint) {
      hint.textContent=kind==="error"
        ? (message || "請回教師端確認 Session 狀態。")
        : connected
          ? (message || "可直接操作課堂流程；權限仍由原教師端執行。")
          : "教師控制端未連線；仍可切換投影畫面與全螢幕。";
    }

    const controls=latestState?.controls || {};
    const sessionButtons=[
      ["dpPreviousBtn","canPrevious"],
      ["dpOpenBtn","canOpen"],
      ["dpLockBtn","canLock"],
      ["dpPublishBtn","canPublish"],
      ["dpNextBtn","canNext"]
    ];
    sessionButtons.forEach(([id,key])=>{
      const button=$(id);
      if (button) button.disabled=!connected || Boolean(pendingRequestId) || !Boolean(controls[key]);
    });
    if ($("dpViewResultsBtn")) $("dpViewResultsBtn").disabled=!latestState?.published;
  }

  function sendCommand(command) {
    if (!channel || !teacherConnected() || pendingRequestId) return;
    const requestId=`${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    pendingRequestId=requestId;
    updateControlUi("正在更新課堂狀態…","busy");
    try {
      channel.postMessage({
        schema:"classroom-deliberation-presentation-command",
        version:1,
        type:"command",
        command,
        requestId,
        at:new Date().toISOString()
      });
    } catch {
      pendingRequestId="";
      updateControlUi("無法送出控制指令","error");
    }
  }

  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.();
      else await document.exitFullscreen?.();
    } catch {}
    const btn=$("dpFullscreenBtn");
    if (btn) btn.textContent=document.fullscreenElement ? "退出全螢幕" : "⛶ 全螢幕";
  }

  function render(state) {
    if (!state || state.schema!=="classroom-deliberation-presentation") return;
    latestState=state;
    $("dpTitle").textContent=state.title || "逐層思辨";
    $("dpSource").textContent=state.sourceNote || "";
    $("dpStage").textContent=`第 ${state.stage || 1} 層 / ${state.total || 1}`;
    $("dpRound").textContent=state.roundState==="open"?"🟢 作答中":state.roundState==="locked"?"🔒 已結束作答":"📊 已公布";
    $("dpLayerTitle").textContent=state.layer?.title || "—";
    $("dpLayerContent").textContent=state.layer?.content || "";
    $("dpLayerQuestion").textContent=state.layer?.question || "";
    $("dpFixedQuestion").textContent=state.fixedQuestion || "";
    $("dpProgress").textContent=`已提交 ${state.submittedCount || 0} / ${state.participantCount || 0}`;

    $("dpWaitingResults").classList.toggle("hidden",Boolean(state.published));
    $("dpPublishedResults").classList.toggle("hidden",!state.published);
    if (state.published) {
      renderDistribution(state.distribution || {},state.chartType || "bar",state.options);
      const reasons=$("dpReasons");reasons.innerHTML="";
      const items=Array.isArray(state.reasons)?state.reasons:[];
      if (!items.length) reasons.innerHTML='<div class="empty-v15">目前沒有匿名理由。</div>';
      else items.forEach(text=>{
        const div=document.createElement("div");div.className="deliberation-reason-item";div.textContent=text;reasons.appendChild(div);
      });
    }
    if (!state.published && projectionView==="results") projectionView="overview";
    setProjectionView(projectionView);
    updateControlUi();
  }

  try {
    const saved=JSON.parse(localStorage.getItem(storageKey)||"null");
    if (saved) render(saved);
  } catch {}

  if (typeof BroadcastChannel==="function" && sessionId) {
    channel=new BroadcastChannel(channelName);
    channel.addEventListener("message",event=>{
      const data=event.data || {};
      if (data.schema==="classroom-deliberation-presentation") {
        lastTeacherSeen=Date.now();
        render(data);
        return;
      }
      if (data.schema==="classroom-deliberation-presentation-control-status") {
        lastTeacherSeen=Date.now();
        if (pendingRequestId && data.requestId===pendingRequestId) pendingRequestId="";
        updateControlUi(data.error || data.message || "",data.error ? "error" : "");
      }
    });
    const ping=()=>{
      try {
        channel.postMessage({
          schema:"classroom-deliberation-presentation-command",
          version:1,
          type:lastTeacherSeen ? "ping" : "hello",
          at:new Date().toISOString()
        });
      } catch {}
    };
    ping();
    const pingTimer=setInterval(()=>{
      ping();
      if (!teacherConnected()) {
        pendingRequestId="";
        updateControlUi();
      }
    },2000);
    window.addEventListener("beforeunload",()=>{
      clearInterval(pingTimer);
      channel?.close?.();
    });
  } else {
    updateControlUi();
  }

  $("dpPreviousBtn")?.addEventListener("click",()=>sendCommand("previous"));
  $("dpOpenBtn")?.addEventListener("click",()=>sendCommand("open"));
  $("dpLockBtn")?.addEventListener("click",()=>sendCommand("lock"));
  $("dpPublishBtn")?.addEventListener("click",()=>sendCommand("publish"));
  $("dpNextBtn")?.addEventListener("click",()=>sendCommand("next"));
  $("dpViewOverviewBtn")?.addEventListener("click",()=>setProjectionView("overview"));
  $("dpViewContentBtn")?.addEventListener("click",()=>setProjectionView("content"));
  $("dpViewResultsBtn")?.addEventListener("click",()=>setProjectionView("results"));
  $("dpFullscreenBtn")?.addEventListener("click",toggleFullscreen);
  document.addEventListener("fullscreenchange",()=>{
    const btn=$("dpFullscreenBtn");
    if (btn) btn.textContent=document.fullscreenElement ? "退出全螢幕" : "⛶ 全螢幕";
  });

  setProjectionView("overview");
  updateControlUi();

  window.addEventListener("storage",event=>{
    if (event.key!==storageKey || !event.newValue) return;
    try { render(JSON.parse(event.newValue)); } catch {}
  });
})();
