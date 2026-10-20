(() => {
  const $ = id => document.getElementById(id);
  const query = new URLSearchParams(location.search);
  const code = (query.get("code") || "").toUpperCase();
  if (code) $("joinCode").value = code;

  const cloud = window.ClassroomSessionAPI.configFromUrlFragment();
  const codeField = $("joinCodeField");
  const modeNotice = $("joinModeNotice");

  if (code) {
    document.body.classList.add("qr-join");
    codeField?.classList.add("hidden");
    $("joinEyebrow").textContent = "CLASSROOM INTERACTIVE";
    $("joinTitle").textContent = "輸入暱稱，開始活動";
    $("joinSubtitle").textContent = "填寫老師能辨識的暱稱即可加入。";
  } else {
    $("joinEyebrow").textContent = "CLASSROOM INTERACTIVE";
    $("joinTitle").textContent = "加入今天的課堂活動";
    $("joinSubtitle").textContent = "輸入課堂代碼與暱稱即可加入。";
  }

  if (cloud) {
    modeNotice?.classList.add("hidden");
  } else {
    modeNotice.innerHTML = "<strong>🧪 本機測試模式</strong><span>此連結目前只適合在老師建立 Session 的同一個瀏覽器測試。</span>";
    modeNotice.classList.remove("hidden");
  }

  $("joinForm").addEventListener("submit", async event => {
    event.preventDefault();
    const button = $("joinSubmitBtn");
    const errorBox = $("joinError");
    errorBox.classList.add("hidden");
    button.disabled = true;
    button.textContent = "加入中…";

    try {
      const context = await window.ClassroomSessionAPI.joinSession(
        $("joinCode").value,
        $("studentCode").value,
        cloud
      );
      let target;
      try {
        target = new URL(context.sessionKind === "course" ? "course.html" : "play.html", location.href);
      } catch {
        target = new URL(context.sessionKind === "course" ? "course.html" : "play.html", document.baseURI);
      }
      if (context.sessionKind === "course") {
        target.hash = `data=${context.courseEncoded}&session=1`;
      } else {
        target.hash = `data=${context.activityEncoded}&session=1`;
      }
      location.href = target.toString();
    } catch (error) {
      errorBox.textContent = error.message || "加入課堂失敗";
      errorBox.classList.remove("hidden");
    } finally {
      button.disabled = false;
      button.textContent = "加入課堂";
    }
  });
})();