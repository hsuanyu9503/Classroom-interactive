# 課堂互動工具 V2.35.10｜Course 平行活動資料保護修正版

由 V2.35.9 進行完整回歸檢查，修補平行活動暫停或結算後仍可能透過 DELETE 改動資料的 SQL 觸發器漏洞。

## 部署方式
1. 備份 Supabase 資料庫。
2. 確定先前已套用 V2.35.0、V2.35.6、V2.35.8 與 V2.35.9 的 SQL 升級。
3. 在 SQL Editor 執行 `upgrade-v2.35.10-course-parallel-write-guards.sql`（此檔隨開發版提供，正式 Lite 只含前端）。
4. 將 Lite ZIP 中的網站執行檔上傳 GitHub Pages，重新整理教師與學生端。
5. 用新 Course Session 測試 A → B → 結算 B → 返回 A → 獨立結算 A。

## 檢查摘要
- JavaScript 語法與現有測試（Session 17、Course 12、平行活動 8、選擇歷程 9、逐層自訂設定 11）通過。
- 新增兩名學生在同一 Course 的 A/B 分別提交、結算及舊節點寫入限制測試。
- Chromium 靜態版面量測涵蓋 320、390、768、1024、1280px，平行活動控制區未發現水平溢出。
- SQL 針對 10 張表的 INSERT/UPDATE/DELETE 執行節點及結算檢查；不刪除或重建作答資料。
- **限制**：未連線使用者正式 Supabase，SQL 僅作靜態檢查，尚未完成真正的 Realtime 三端驗收。

## 相容性
網站程式碼與 V2.35.9 相同，只有可見版本號更新。原有拉鋸動畫、選擇歷程與逐層獨立選項均保留。
