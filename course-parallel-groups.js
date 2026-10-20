/* V2.36.0 — Pure Course parallel-group metadata helpers. No network, no student identifiers. */
(()=>{
  "use strict";
  const ref = v => String(v ?? "").trim();
  const normalize = groups => (Array.isArray(groups) ? groups : []).map(g=>({
    id:ref(g?.id), title:ref(g?.title)||"平行活動群組",
    nodeRefs:[...new Set((Array.isArray(g?.nodeRefs)?g.nodeRefs:[]).map(ref).filter(Boolean))]
  })).filter(g=>g.id);
  function validate(groups,nodes){
    const allowed=new Set((nodes||[]).filter(n=>n.type==="activity").map(n=>ref(n.id)));
    const used=new Set(), ids=new Set();
    for(const g of normalize(groups)){
      if(ids.has(g.id)) throw new Error("平行活動群組 ID 重複");
      ids.add(g.id);
      if(g.nodeRefs.length<2) throw new Error(`「${g.title}」至少需選擇兩個活動節點`);
      for(const id of g.nodeRefs){
        if(!allowed.has(id)) throw new Error(`「${g.title}」包含已刪除或非活動的節點，請重新選擇`);
        if(used.has(id)) throw new Error("同一活動節點不能同時加入兩個平行群組");
        used.add(id);
      }
    }
    return normalize(groups);
  }
  function findForNode(groups,nodeRef){return normalize(groups).find(g=>g.nodeRefs.includes(ref(nodeRef)))||null;}
  const API={normalize,validate,findForNode};
  if(typeof module!=="undefined" && module.exports)module.exports=API;
  if(typeof window!=="undefined")window.ClassroomParallelGroups=API;
})();
