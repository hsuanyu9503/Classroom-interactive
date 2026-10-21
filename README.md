# Classroom Interactive v2.36.6｜即時立場拉鋸動畫更新

**以 v2.36.5 QA1 為唯一基礎。** 保留教師清新教育風格、學生活潑 UI、深色統計與霓虹投影。

本版僅優化投影中心節點與動畫效能：桌機 38px（較先前 50px 減少約 24%）、平板 34px、手機 30px；節點採用綠→白→紅漸層。
拉鋸由原有 RAF 阻尼動畫改為透過 `translate3d` / `scaleX` 呈現，比例仍隨原始投票結果變動。

- **網站上線：** 將 GitHub ZIP 解壓縮，所有檔案放在 repository 根目錄（含新 `live-stance-v2.36.6.css`）。
- **既有正式 Supabase：** 不需要執行 SQL，不得執行 `sql/NEW-PROJECT-ONLY-*`。
- **版本確認：** 教師頁面右上方應顯示 `V2.36.6`；瀏覽器應載入 `?v=2.36.6-motion`。
- **測試：** 參閱 `tests/QA-V2.36.6-MOTION.md`。

---

# Classroom Interactive v2.36.5 — 視覺系統整合版

> 基底為使用者確認保留的 **v2.36.4 NEON-QA-FIXED**，**不是**已取消的 STYLE-REFINED 版本。

## 視覺方向

- 教師端：清新教育工具（A）— 薰衣草紫、薄荷綠、天空藍，柔和背景、卡片、清楚的操作狀態。**保留備課／上課及所有既有工作流程**。
- 學生端：簡明、活潑、好觸控 — 清楚任務說明、圓角選項、選取回饋、進度卡片及大尺寸操作按鈕。
- 統計投影：沉浸式深色科技感（C）— 深藍背景、清晰統計數字與對比。
- 即時立場拉鋸：**保留 v2.36.4 NEON-QA-FIXED 原有投影效果**（綠紅色帶、圓形節點、字體與動畫）沒有採用已取消版本的加粗及縮小調整。

## 技術變更範圍

- 新增 `theme-v2.36.5.css`，五個 HTML 頁面的樣式表最後載入此檔。
- 五頁靜態資源快取參數改為 `?v=2.36.5-pastel-immersive`。
- `index.html` 工作台版號及 `release-center.js`、`activity-editor.js`、`session-api.js` 中的 `appVersion` 改為 `2.36.5`。
- 既有活動 JavaScript、同步與 Course Node 程式、Supabase SQL、RPC、RLS 均**無功能性修改**。
- **不要將設計概念圖視為已新增的功能**：本次沒有建立新的首頁儀表板、出勤管理、通知中心、可愛角色或登入系統。

## 正式部署與回退

1. 在 GitHub Pages Repository 根目錄更新 **GITHUB ZIP** 的 24 個必要檔案加上 README（共 25 項），其中新增 `theme-v2.36.5.css`。
2. 不要執行任何 SQL；現有 Supabase 直接沿用。
3. 更新後強制重新整理，教師工作台應顯示 `V2.36.5`，HTML 應載入 `theme-v2.36.5.css?v=2.36.5-pastel-immersive`。
4. 回退時用 `Classroom-Interactive-v2.36.4-NEON-QA-FIXED-GITHUB.zip` 覆蓋同一 Repository，並**刪除或停用** `theme-v2.36.5.css` 的引用，確認 `V2.36.4`。

## 檢查範圍

13 項既有 Node.js 測試；3 種尺寸的教師、學生、加入頁面離線 Chromium CSS 版面測試；一般統計投影深色配色；即時拉鋸投影關鍵 CSS computed-style 與 v2.36.4 比對。

**注意：**離線畫面夾具以模擬文字、票數與選項呈現，並非連上真實 Supabase；使用前仍建議測試課堂 Session、教師／學生同步、平板 Safari 與實際投影機。

## SQL

`sql/` 的新專案 SQL 僅適用空白測試資料庫，正式資料庫不執行；`sql-history/` 是歷史參考資料。

## v2.36.5 QA1 視覺校對修正
修正逐層思辨投影頁淺色標題背景與白字對比不足問題；資源快取版本更新為 `2.36.5-pastel-immersive-qa1`。其餘程式與 SQL 不變。詳見 `tests/QA-V2.36.5-SECOND-PASS-QA1.md`。
