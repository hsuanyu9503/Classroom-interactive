(() => {
  const $=id=>document.getElementById(id);
  const params=new URLSearchParams(location.hash.replace(/^#/,""));
  const sessionId=params.get("session") || "";
  const storageKey=`classroom-deliberation-presentation-state:${sessionId}`;
  const channelName=`classroom-deliberation-presentation:${sessionId}`;
  const labels={A:"完全不能接受",B:"不太能接受",C:"大致能接受",D:"完全能接受",U:"資訊不足，暫不判斷"};

  function renderDistribution(counts={}) {
    const list=$("dpDistribution");
    list.innerHTML="";
    const values=["A","B","C","D","U"].map(id=>[id,Number(counts[id])||0]);
    const max=Math.max(...values.map(([,count])=>count),1);
    values.forEach(([id,count])=>{
      const row=document.createElement("div");
      row.className="stage-distribution-row";
      const label=document.createElement("span");
      label.textContent=`${id} ${labels[id]}`;
      const bar=document.createElement("div");
      const fill=document.createElement("i");
      fill.style.width=`${count?Math.max(8,(count/max)*100):0}%`;
      bar.appendChild(fill);
      const strong=document.createElement("strong");strong.textContent=count;
      row.append(label,bar,strong);
      list.appendChild(row);
    });
  }

  function render(state) {
    if (!state || state.schema!=="classroom-deliberation-presentation") return;
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
      renderDistribution(state.distribution || {});
      const reasons=$("dpReasons");reasons.innerHTML="";
      const items=Array.isArray(state.reasons)?state.reasons:[];
      if (!items.length) reasons.innerHTML='<div class="empty-v15">目前沒有匿名理由。</div>';
      else items.forEach(text=>{
        const div=document.createElement("div");div.className="deliberation-reason-item";div.textContent=text;reasons.appendChild(div);
      });
    }
  }

  try {
    const saved=JSON.parse(localStorage.getItem(storageKey)||"null");
    if (saved) render(saved);
  } catch {}

  if (typeof BroadcastChannel==="function" && sessionId) {
    const channel=new BroadcastChannel(channelName);
    channel.addEventListener("message",event=>render(event.data));
    window.addEventListener("beforeunload",()=>channel.close());
  }

  window.addEventListener("storage",event=>{
    if (event.key!==storageKey || !event.newValue) return;
    try { render(JSON.parse(event.newValue)); } catch {}
  });
})();
