(() => {
  const $ = id => document.getElementById(id);
  const query = new URLSearchParams(location.search);
  const code = (query.get("code") || "").toUpperCase();
  if (code) $("joinCode").value = code;

  const cloud = window.ClassroomSessionAPI.configFromUrlFragment();
  $("joinModeNotice").innerHTML = cloud
    ? "<strong>☁️ 已連線到課堂雲端 Session</strong><span>你的作答會傳回老師的課堂控制台。</span>"
    : "<strong>🧪 本機測試 Session</strong><span>沒有雲端設定時，只能在建立 Session 的同一個瀏覽器測試。</span>";

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
      const play = new URL("play.html", location.href);
      play.hash = `data=${context.activityEncoded}&session=1`;
      location.href = play.toString();
    } catch (error) {
      errorBox.textContent = error.message || "加入課堂失敗";
      errorBox.classList.remove("hidden");
    } finally {
      button.disabled = false;
      button.textContent = "加入課堂";
    }
  });
})();