/* V2.35.7 — Read-only per-participant, per-layer choice history.
 * No student data writes. The projection payload is anonymized and only includes
 * choices for published layers of the current Course node. */
(() => {
  "use strict";
  const PALETTE=["#315fa7","#ad681c","#117b66","#7854b4","#b84263","#167d9b","#886622","#9d4679","#576a80","#76553a"];
  const FALLBACK=[{id:"A",label:"完全不能接受"},{id:"B",label:"不太能接受"},{id:"C",label:"大致能接受"},{id:"D",label:"完全能接受"},{id:"U",label:"資訊不足，暫不判斷"}];
  function optionsFrom(value) {
    const src=Array.isArray(value)&&value.length?value:FALLBACK;
    return src.map((o,index)=>({id:String(o?.id??o?.i??"").trim(),label:String(o?.label??o?.l??o?.id??o?.i??"").trim(),color:PALETTE[index%PALETTE.length]})).filter(o=>o.id);
  }
  function build(snapshot,{projection=false,named=false}={}) {
    const data=snapshot?.deliberation_data||{};
    const options=optionsFrom(data.o);
    const current=Math.max(1,Number(snapshot?.current_stage)||1);
    const total=Math.max(1,Math.min(20,Number(snapshot?.stage_count)||1));
    const publishedMax=Math.min(total,current-(snapshot?.round_state==="published"?0:1));
    const stageOptions=Array.from({length:total},(_,i)=>optionsFrom(data.l?.[i]?.o || data.o));
    // Projection must not expose future custom options via history payload.
    if(projection) for(let i=publishedMax;i<total;i++) stageOptions[i]=[];
    const nodeRef=String(snapshot?.current_node_ref||"");
    const isCourse=snapshot?.session_kind==="course";
    const responses=(snapshot?.responses||[]).filter(r=>r?.mode==="layered-deliberation" && /^layer-(\d+)$/.test(String(r.stage_key||"")) && (!isCourse||String(r.node_ref||"")===nodeRef));
    const participantMap=new Map();
    (snapshot?.participants||[]).slice().sort((a,b)=>String(a.joined_at||"").localeCompare(String(b.joined_at||""))||String(a.student_code||"").localeCompare(String(b.student_code||""),"zh-Hant")).forEach(p=>{if(p.id&&!participantMap.has(String(p.id)))participantMap.set(String(p.id),String(p.student_code||""));});
    responses.forEach(r=>{const id=String(r.participant_id||"");if(id&&!participantMap.has(id))participantMap.set(id,String(r.student_code||""));});
    const rows=[];
    for (const [id,studentCode] of participantMap) {
      const answers=new Map();
      responses.filter(r=>String(r.participant_id||"")===id).forEach(r=>{
        const layer=Number(String(r.stage_key).match(/^layer-(\d+)$/)?.[1]);
        if(layer>=1&&layer<=total)answers.set(layer,String(r.selected_type||""));
      });
      const seq=[];
      let prev="";
      let prevScale="";
      let changes=0;
      for(let stage=1;stage<=total;stage++) {
        const exposed=stage<=(projection?publishedMax:current);
        const choice=exposed?answers.get(stage)||"":"";
        const choices=stageOptions[stage-1];
        const scale=JSON.stringify(choices.map(o=>o.label));
        const label=choices.find(o=>o.id===choice)?.label || "";
        const changed=Boolean(label&&prev&&scale===prevScale&&label!==prev);
        if(changed)changes++;
        if(label){prev=label;prevScale=scale;}
        seq.push({stage,choice,changed,visible:exposed});
      }
      rows.push({key:`P${String(rows.length+1).padStart(2,"0")}`,label:!projection&&named?studentCode||`學生 ${rows.length+1}`:`P${String(rows.length+1).padStart(2,"0")}`,sequence:seq,changes,answered:seq.filter(c=>c.choice).length});
    }
    const visibleMax=projection?publishedMax:current;
    const stageInfo=Array.from({length:total},(_,i)=>({stage:i+1,visible:i<visibleMax,published:i<publishedMax}));
    const visibleOptions=stageOptions[Math.max(0,Math.min(total,visibleMax)-1)] || [];
    return {version:2,options:visibleOptions,stageOptions,stages:stageInfo,rows,participantCount:rows.length,visibleMax,publishedMax,current,total,projection};
  }
  function el(tag,cls,text) {const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=String(text);return node;}
  function render(container,history) {
    if(!container)return;
    const previousScrollLeft=container.querySelector?.(".dh-scroller")?.scrollLeft||0;
    container.replaceChildren();
    if(!history?.rows?.length){container.append(el("p","dh-empty","目前沒有學生加入，待學生開始作答後即可查看全班歷程。"));return;}
    const intro=el("div","dh-overview");
    const n=history.rows.filter(row=>row.answered>0).length;
    intro.append(el("span","dh-summary",`已作答 ${n} / ${history.participantCount} 人`));
    intro.append(el("span","dh-summary",`目前可查看 ${history.visibleMax} / ${history.total} 層`));
    intro.append(el("span","dh-summary",`曾改變選擇 ${history.rows.filter(row=>row.changes>0).length} 人`));
    container.append(intro);
    const legend=el("div","dh-legend");
    history.options.forEach(o=>{const item=el("span","dh-legend-item");const dot=el("i","dh-dot");dot.style.backgroundColor=o.color;item.append(dot,el("span","",o.label));legend.append(item);});
    container.append(legend);
    const scroll=el("div","dh-scroller");scroll.tabIndex=0;scroll.setAttribute("aria-label","學生逐層選擇歷程，可左右捲動");
    const matrix=el("div","dh-matrix");matrix.style.setProperty("--dh-columns",history.total);
    const head=el("div","dh-row dh-head");head.append(el("div","dh-person","學生"));
    history.stages.forEach(s=>head.append(el("div","dh-stage",`第 ${s.stage} 層${s.visible?"":" 🔒"}`)));
    matrix.append(head);
    history.rows.forEach(row=>{
      const line=el("div","dh-row");
      const name=el("div","dh-person",row.label);
      if(row.changes){const tag=el("span","dh-changed-count",`改變 ${row.changes} 次`);name.append(tag);}
      line.append(name);
      row.sequence.forEach((cell,i)=>{
        const box=el("div",`dh-cell${cell.changed?" dh-shifted":""}${!cell.visible?" dh-locked":""}`);
        const option=(history.stageOptions?.[i] || history.options).find(o=>o.id===cell.choice);
        if(!cell.visible){box.append(el("span","dh-blank","🔒"));}
        else if(option){
          const pill=el("span","dh-pill",option.label);
          pill.style.setProperty("--dh-color",option.color);
          pill.title=`${row.label}：第 ${cell.stage} 層，${option.label}${cell.changed?"（改變選擇）":""}`;
          box.append(pill);
          if(cell.changed)box.append(el("span","dh-shift-mark","↻"));
        } else box.append(el("span","dh-blank","—"));
        if(i>0)box.classList.add("dh-follow");
        line.append(box);
      });
      matrix.append(line);
    });
    scroll.append(matrix);container.append(scroll);
    scroll.scrollLeft=previousScrollLeft;
    container.append(el("p","dh-note",history.projection?"投影使用匿名編號；只顯示已公布層次的選項。上方圖例是最新公布層的選項。":"各格以該層自己的選項文字為準；↻ 只在相鄰可比較題組中標示選擇改變。"));
  }
  window.ClassroomDeliberationHistory={build,render};
})();
