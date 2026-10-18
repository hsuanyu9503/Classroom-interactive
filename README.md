# Classroom Interactive V2.36.2｜平行活動教師同步修正版

本版以原始 V2.36.1 開發包為基礎，修復 Course 平行活動的教師端資料呈現。未將獨立的 Classification R3 模組併入，不更改既有 Course / Lesson / Node 資料結構。

## 本輪修正
- **逐層思辨作答 0/N**：原本對 Course `node_ref` 的篩選方向有誤，導致合法提交被排除；已改為嚴格匹配目前節點。
- 教師即時分布、理由清單、投影統計與 CSV 匯出都只使用目前的 Course 節點作答，避免兩個逐層活動互相混入。
- 教師學生詳細檢視、信心程度、資訊逐層揭露、開放分類等課程活動也統一使用當前節點隔離。
- 教師 `get_teacher_session` 快照與 `get_course_node_runtime_v2359` 讀取期間，若剛好切換活動且取得不一致的目前活動，會重試完整讀取（最多 3 次），不顯示混合狀態。
- 教師快照 revision 和節點識別雙重保護；統計圖辨識鍵加入 node_ref，防止返回同層時沿用另一活動的投影顯示狀態。
- 修正版 JavaScript 使用版本參數避免網站快取持續載入舊的教師端程式。

## 安裝與相容性
- **只需部署新的 GitHub Pages 網站檔案**（建議使用 lite 版），維持同一 Supabase 專案即可保留既有學生資料。
- **本次沒有 SQL 異動**，不需要重新執行 Supabase setup / unified SQL。使用者提供的 v2.36.1 SQL 已保留原狀，並未重新套用。
- 與 V2.36.1 學生端、既有 Course 活動、非 Course 獨立 Session 的資料結構相容。
- 同步機制依舊是 Realtime 通知加輪詢對帳；未在正式 Supabase 上實測雙裝置連線。

## 本輪驗證
- 原有 11 組 Node 自動測試：全部通過。
- 新增 `tests/course-parallel-teacher-sync-v2362.test.cjs`：檢查跨節點隔離、本層作答人數、統計與理由、投影，以及 Course 快照讀取競態，通過。
- `node --check` 主要 JavaScript 靜態語法：通過。
- `python tests/test_parallel_ui.py`：390 / 768 / 1024 / 1280px 基本排版通過。
- 未測試正式 Supabase Realtime、正式資料庫 RPC 執行與實體雙機同步；部署後仍應依 `tests/QA-V2.36.2.md` 實機驗收。

---

# 課堂互動工具 V2.36.1｜教師／學生同步穩定性修正版

## 重點修正
- 教師端 Session Snapshot 排隊處理，避免 Realtime、輪詢及手動操作的讀取相互搶先、讓舊快照覆蓋新節點。重複背景刷新合併。
- Course 學生端狀態同步合併重疊請求、收到過期 revision 不回退畫面，並提示同步讀取失敗。
- Course 學生雲端同步：`get_student_session_state` + `get_course_node_lifecycle_v2359` 分別讀取時，檢查 node_ref 和 revision 一致；切換期間不一致會重讀（最多 3 次），避免錯誤結算狀態。
- 即時立場學生端同步避免重疊輪詢及未完成的新表態被舊輪詢回應覆蓋。
- Realtime 已連線時，教師端、Course 及學生互動頁的輪詢備援由約 12 秒縮短為約 6 秒；網路異常時改用短間隔輪詢。
- 本機 Course 進度回報新增「實際目前節點」檢查，防止舊畫面向已暫停節點回報完成。

## 資料格式與部署
- 延續 V2.36.0 的八種活動、課程平行群組、每層理由、拉鋸動畫及獨立結算。
- **無資料表、RPC 或 Supabase SQL 異動**。若原資料庫升級已完成，僅需部署新網站檔案。
- 只要安裝新版本，請重新整理教師與學生頁面，以免快取造成前後版本混用。

## 驗證限制
- 自動化測試（含兩名學生、多節點、延遲與不一致 RPC）通過；Chromium 390 / 768 / 1280px 五頁載入未發現水平溢出。
- 未直接連線使用者的正式 Supabase 專案，故**不能據此宣稱真實跨裝置即時同步已驗收通過**。應用正式教師＋兩學生 Session 另行驗收。
