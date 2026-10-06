/* V2.14.1 | Final Release Center */
(() => {
  const APP_VERSION = "2.14.1";
  const LAST_BACKUP_KEY = "interactive-classroom-last-backup";
  const CHECK_KEY = "interactive-classroom-release-check";
  const $ = id => document.getElementById(id);

  let lastReport = null;
  let running = false;

  function escapeHtml(value = "") {
    return String(value).replace(/[&<>"']/g, char => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[char]));
  }

  function localArray(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(value) ? value : [];
    } catch {
      return null;
    }
  }

  function formatBytes(bytes = 0) {
    const value = Math.max(0,Number(bytes)||0);
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(value < 10*1024 ? 1 : 0)} KB`;
    return `${(value / 1024 / 1024).toFixed(1)} MB`;
  }

  function localStorageBytes() {
    let chars = 0;
    try {
      for (let i=0;i<localStorage.length;i+=1) {
        const key = localStorage.key(i) || "";
        const value = localStorage.getItem(key) || "";
        chars += key.length + value.length;
      }
    } catch {}
    return chars * 2;
  }

  function backupInfo() {
    const raw = localStorage.getItem(LAST_BACKUP_KEY) || "";
    if (!raw) return {status:"warning",label:"尚未備份",text:"這個瀏覽器尚未記錄教材備份時間。正式上課前建議下載一份備份。",iso:"",ageDays:null};
    const time = Date.parse(raw);
    if (!Number.isFinite(time)) return {status:"warning",label:"時間未知",text:"已找到備份紀錄，但時間格式無法判讀，建議重新下載備份。",iso:raw,ageDays:null};
    const ageDays = Math.max(0,(Date.now()-time)/(86400*1000));
    if (ageDays <= 7) return {status:"ok",label:ageDays < 1 ? "今天" : `${Math.floor(ageDays)} 天前`,text:"最近 7 天內已有教材備份。",iso:new Date(time).toISOString(),ageDays};
    return {status:"warning",label:`${Math.floor(ageDays)} 天前`,text:"教材備份已超過 7 天，正式上課前建議重新下載。",iso:new Date(time).toISOString(),ageDays};
  }

  function deploymentInfo() {
    const protocol = location.protocol;
    const hostname = location.hostname || "";
    const isLocal = ["localhost","127.0.0.1",""].includes(hostname) || protocol === "file:";
    const isHttps = protocol === "https:";
    const rawGithub = hostname === "github.com" || hostname.endsWith(".githubusercontent.com");

    if (isHttps && !rawGithub) {
      return {status:"ok",label:"正式網址",text:`目前使用 HTTPS：${location.origin}`};
    }
    if (isLocal) {
      return {status:"warning",label:"本機環境",text:"目前不是正式 HTTPS 網址；本機可測試，但學生跨裝置掃碼應使用 GitHub Pages。"};
    }
    return {status:"warning",label:"非建議網址",text:"目前網址不是建議的 GitHub Pages / HTTPS 正式部署環境。"};
  }

  function renderCheck(item) {
    const icon = item.status === "ok" ? "✓" : item.status === "error" ? "!" : "i";
    return `
      <div class="release-check-item ${item.status}">
        <span class="release-check-icon">${icon}</span>
        <div>
          <strong>${escapeHtml(item.title)} · ${escapeHtml(item.label || "")}</strong>
          <p>${escapeHtml(item.text || "")}</p>
        </div>
      </div>`;
  }

  async function inspectCourses() {
    const api = window.ClassroomCourseAPI;
    const list = api?.list?.() || [];
    let ready = 0;
    const errors = [];
    for (const course of list) {
      try {
        await api.buildSnapshot(course.id);
        ready += 1;
      } catch (error) {
        errors.push({id:course.id,title:course.title || "未命名課程",reason:error.message || "無法建立 Runtime Snapshot"});
      }
    }
    return {total:list.length,ready,errors};
  }

  async function inspectActivities() {
    const api = window.ClassroomActivityAPI;
    const list = api?.list?.() || [];
    let ready = 0;
    const errors = [];
    for (const activity of list) {
      try {
        await api.buildSessionSnapshot(activity.id);
        ready += 1;
      } catch (error) {
        errors.push({id:activity.id,title:activity.title || "未命名活動",reason:error.message || "無法建立 Session Snapshot"});
      }
    }
    return {total:list.length,ready,errors};
  }

  function dataIntegrityInfo() {
    const keys = {
      courses:"interactive-classroom-v2-courses",
      lessons:"interactive-classroom-v2-lessons",
      nodes:"interactive-classroom-v2-nodes",
      types:"interactive-classroom-v15-types",
      works:"interactive-classroom-v15-works",
      activities:"interactive-classroom-v1"
    };
    const broken = [];
    const counts = {};
    Object.entries(keys).forEach(([name,key])=>{
      const data = localArray(key);
      if (data === null) broken.push(name);
      else counts[name] = data.length;
    });
    return {broken,counts};
  }

  async function storageEstimate() {
    const localBytes = localStorageBytes();
    let quota = null;
    let usage = null;
    try {
      const estimate = await navigator.storage?.estimate?.();
      quota = Number.isFinite(estimate?.quota) ? estimate.quota : null;
      usage = Number.isFinite(estimate?.usage) ? estimate.usage : null;
    } catch {}
    return {localBytes,quota,usage};
  }

  async function runCheck({full=false}={}) {
    if (running) return lastReport;
    running = true;

    const button = $("runReleaseCheckBtn");
    const note = $("releaseCheckNote");
    if (button) {
      button.disabled = true;
      button.textContent = full ? "檢查中…" : "更新中…";
    }
    if (note) note.textContent = full ? "正在檢查教材與 Supabase 連線…" : "正在更新本機狀態…";

    const checkedAt = new Date().toISOString();
    const deployment = deploymentInfo();
    const backup = backupInfo();
    const dataIntegrity = dataIntegrityInfo();
    const storage = await storageEstimate();
    const [courses,activities] = await Promise.all([inspectCourses(),inspectActivities()]);

    const qrAvailable = typeof window.QRCode === "function";
    const websocketAvailable = typeof window.WebSocket === "function";
    const sessionApi = window.ClassroomSessionAPI;
    const cloudConfigured = Boolean(sessionApi?.isCloudConfigured?.());
    const config = sessionApi?.getConfig?.() || {};
    let cloudHealth = cloudConfigured ? "not-tested" : "not-configured";
    let cloudError = "";

    if (full && cloudConfigured) {
      try {
        const ok = await sessionApi.testCloudConfig(config.url,config.key);
        cloudHealth = ok ? "ok" : "error";
        if (!ok) cloudError = "Healthcheck 未回傳 ok";
      } catch (error) {
        cloudHealth = "error";
        cloudError = error.message || "Supabase 連線失敗";
      }
    }

    const checks = [];
    checks.push({
      id:"deployment",title:"部署網址",status:deployment.status,label:deployment.label,text:deployment.text
    });
    checks.push({
      id:"data",title:"教材資料",status:dataIntegrity.broken.length ? "error" : "ok",
      label:dataIntegrity.broken.length ? "格式異常" : "格式正常",
      text:dataIntegrity.broken.length
        ? `無法解析：${dataIntegrity.broken.join("、")}。請先匯出可用資料或確認瀏覽器儲存狀態。`
        : "Course、Lesson、Node、類型、作品與活動資料皆可正常解析。"
    });
    checks.push({
      id:"courses",title:"Course Runtime",status:courses.total && courses.ready === courses.total ? "ok" : "warning",
      label:`${courses.ready} / ${courses.total} 可上課`,
      text:courses.errors.length
        ? `${courses.errors.length} 門課程尚未完成設定；上課首頁會自動停用它們。`
        : courses.total ? "所有 Course 都可以建立 Runtime Snapshot。" : "目前尚未建立 Course。"
    });
    checks.push({
      id:"activities",title:"Activity Runtime",status:activities.total && activities.ready === activities.total ? "ok" : "warning",
      label:`${activities.ready} / ${activities.total} 可用`,
      text:activities.errors.length
        ? `${activities.errors.length} 個活動尚未完成設定。`
        : activities.total ? "所有 Activity 都可以建立 Session Snapshot。" : "目前尚未建立 Activity。"
    });
    checks.push({
      id:"qr",title:"QR Code",status:qrAvailable ? "ok" : "error",
      label:qrAvailable ? "可用" : "未載入",
      text:qrAvailable ? "QR Code 函式庫已載入。" : "QR Code 函式庫未載入，分享與 Session QR 會無法產生。"
    });

    if (!cloudConfigured) {
      checks.push({
        id:"cloud",title:"Supabase",status:"warning",label:"尚未設定",
        text:"本機模式可使用；正式跨裝置 Session 前請在「上課」設定 Supabase Project URL 與 Publishable key。"
      });
    } else if (!full) {
      checks.push({
        id:"cloud",title:"Supabase",status:"warning",label:"已設定 · 尚未測試",
        text:"設定格式正常。按「執行完整檢查」可實際呼叫 classroom_healthcheck。"
      });
    } else {
      checks.push({
        id:"cloud",title:"Supabase",status:cloudHealth === "ok" ? "ok" : "error",
        label:cloudHealth === "ok" ? "連線成功" : "連線失敗",
        text:cloudHealth === "ok"
          ? "Healthcheck 成功，可建立跨裝置雲端 Session。"
          : (cloudError || "無法連線到 Supabase。")
      });
    }

    checks.push({
      id:"realtime",title:"Realtime 能力",
      status:websocketAvailable ? (cloudConfigured ? "ok" : "warning") : "warning",
      label:websocketAvailable ? (cloudConfigured ? "可使用" : "瀏覽器支援") : "無 WebSocket",
      text:websocketAvailable
        ? (cloudConfigured ? "瀏覽器支援 WebSocket；實際 Realtime 失敗時仍會自動退回 polling。" : "瀏覽器支援 WebSocket；設定 Supabase 後即可使用 Realtime。")
        : "瀏覽器沒有 WebSocket；Session 仍可使用 polling 備援。"
    });
    checks.push({
      id:"backup",title:"教材備份",status:backup.status,label:backup.label,text:backup.text
    });

    const errorCount = checks.filter(item=>item.status==="error").length;
    const warningCount = checks.filter(item=>item.status==="warning").length;
    const overall = errorCount ? "error" : warningCount ? "warning" : "ready";

    const report = {
      schema:"classroom-interactive-diagnostic",
      version:1,
      appVersion:APP_VERSION,
      checkedAt,
      mode:full ? "full" : "quick",
      overall,
      summary:{errors:errorCount,warnings:warningCount},
      environment:{
        protocol:location.protocol,
        hostname:location.hostname || "",
        origin:location.origin === "null" ? "" : location.origin,
        viewport:{width:innerWidth,height:innerHeight},
        userAgent:navigator.userAgent,
        qrAvailable,
        websocketAvailable
      },
      cloud:{
        configured:cloudConfigured,
        host:cloudConfigured ? (()=>{try{return new URL(config.url).host}catch{return ""}})() : "",
        health:cloudHealth
      },
      content:{
        counts:dataIntegrity.counts,
        courses:{total:courses.total,ready:courses.ready,invalid:courses.errors.map(item=>({title:item.title,reason:item.reason}))},
        activities:{total:activities.total,ready:activities.ready,invalid:activities.errors.map(item=>({title:item.title,reason:item.reason}))}
      },
      backup:{lastBackupAt:backup.iso,ageDays:backup.ageDays},
      storage,
      checks:checks.map(({id,title,status,label,text})=>({id,title,status,label,text}))
    };

    lastReport = report;
    try { localStorage.setItem(CHECK_KEY,JSON.stringify({checkedAt,overall,errorCount,warningCount})); } catch {}
    render(report);
    running = false;

    if (button) {
      button.disabled = false;
      button.textContent = "✓ 執行完整檢查";
    }
    if (note) {
      note.textContent = full
        ? `完整檢查完成：${errorCount} 個錯誤、${warningCount} 個提醒。`
        : "快速檢查完成；完整 Supabase 連線測試需按「執行完整檢查」。";
    }
    return report;
  }

  function render(report) {
    if (!report) return;
    const badge = $("releaseOverallBadge");
    if (badge) {
      badge.className = `release-overall-badge ${report.overall}`;
      if (report.overall === "ready") badge.textContent = "✓ 正式上課就緒";
      else if (report.overall === "error") badge.textContent = `! ${report.summary.errors} 個錯誤`;
      else badge.textContent = `i ${report.summary.warnings} 個提醒`;
    }

    if ($("releaseReadyCourseCount")) $("releaseReadyCourseCount").textContent = `${report.content.courses.ready} / ${report.content.courses.total}`;
    if ($("releaseReadyActivityCount")) $("releaseReadyActivityCount").textContent = `${report.content.activities.ready} / ${report.content.activities.total}`;

    const backup = backupInfo();
    if ($("releaseLastBackup")) $("releaseLastBackup").textContent = backup.label;
    if ($("lastBackupHint")) $("lastBackupHint").textContent = backup.iso
      ? `最後備份：${new Date(backup.iso).toLocaleString("zh-TW")}`
      : "尚未記錄備份時間";

    if ($("releaseStorageUsage")) $("releaseStorageUsage").textContent = formatBytes(report.storage.localBytes);
    if ($("releaseCheckList")) $("releaseCheckList").innerHTML = report.checks.map(renderCheck).join("");
  }

  async function refresh() {
    return runCheck({full:false});
  }

  async function fullCheck() {
    return runCheck({full:true});
  }

  async function downloadDiagnostic() {
    const report = lastReport || await refresh();
    if (!report) return;

    const safeReport = JSON.parse(JSON.stringify(report));
    const blob = new Blob([JSON.stringify(safeReport,null,2)],{type:"application/json;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `classroom-interactive-diagnostic-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  $("runReleaseCheckBtn")?.addEventListener("click",fullCheck);
  $("downloadDiagnosticBtn")?.addEventListener("click",downloadDiagnostic);

  window.ClassroomReleaseCenter = {
    refresh,
    fullCheck,
    downloadDiagnostic,
    get lastReport(){ return lastReport; }
  };

  // Quick local-only check after all teacher modules are ready.
  setTimeout(refresh,0);
})();