# 課堂互動工具 V2.35.12｜逐層思辨單選理由

## 新增功能

- 「逐層思辨 → 作答與統計設定 → 理由作答方式」現在可選 **自由填寫／多選預設理由／單選預設理由**。
- 各情境層的「本層作答設定」新增「本層理由作答方式」，可沿用共用設定，或指定自由填寫、多選、單選；原先的理由「沿用／必填／不顯示」獨立保留。
- 預設理由清單由活動共用設定管理；若只有某一層使用單選或多選，編輯器仍會開放預設理由設定（1–12 項）。
- 單選模式使用圓形單選按鈕，同一時間只能選一個預設理由，或選擇「其他」並輸入文字；選擇新選項會取消原選擇。
- 理由不顯示時完全不提供理由欄位，亦不送出上一層的理由。學生作答仍以原本的 `reason`, `reasonSelections`, `reasonOther`, `reasonMode` 格式保存，教師理由檢視、統計及 Course 節點維持相容。
- 舊的複選理由教材維持複選，不會自動改為單選。調整了手機版「預設理由」設定區按鈕的排版。

## 部署

本次只更新前端網頁與樣式，**無須新增 Supabase SQL**（前提是先前 V2.35.0、V2.35.6、V2.35.8、V2.35.9、V2.35.10 的必要 SQL 已部署）。將 Lite 版本完整替換至 GitHub Pages 即可。

注意：單選數量在學生端 UI 與提交前驗證，沿用 Supabase 既有的理由非空驗證；現有資料庫函式尚未針對 `reasonMode: "single"` 額外限制 `reasonSelections` 數量，因此應視為前端操作規則，而不是已實作的伺服器端防繞過限制。

## QA

- `node --check *.js` 語法檢查、既有 Session／Course／平行活動與逐層思辨測試。
- `node tests/deliberation-single-reason.test.cjs`
- `python tests/test_editor_single_reason_browser.py`
- `python tests/test_single_reason_browser.py`
- 390px、1024px 教師編輯器與學生單選／多選／隱藏／文字切換、重新載入、提交資料測試。
- 正式 Supabase Realtime 多人端到端及 iPad Safari 實機效能未在此環境直接驗證。
