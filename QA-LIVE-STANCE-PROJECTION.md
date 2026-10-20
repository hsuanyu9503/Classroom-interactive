# Classroom Interactive v2.36.1 — 即時立場拉鋸投影樣式更新／QA 紀錄

日期：2026-10-20

## 更新範圍

- 唯一更動的應用程式檔案：`app.css`。
- 教師端即時立場拉鋸投影 `#liveStanceProjectionBoard`、完整課程簡報 `#presentationLiveStanceBoard` 的 CSS 視覺樣式更新。
- 以提供的參考圖為方向，採用深色舞台、淺色大面板、綠／紅立場圓形票數、清晰百分比和灰色滑軌。
- 針對平板直向與手機尺寸修復數字／滑軌重疊與畫面裁切。
- 不修改 JavaScript、即時資料同步、作答邏輯、資料庫、SQL、RPC。
- 原版 CSS 與新增的投影樣式均保留；非投影的拉鋸小面板沿用原有樣式。

## 自動檢查實際執行結果

- ZIP 壓縮檔結構：無 CRC/結構異常。
- 15 個 JavaScript 檔案：`node --check` 全部通過。
- `app.css`：tinycss2 解析，未發現頂層 CSS 語法錯誤。
- Node.js 回歸測試：`node --test tests/*.test.cjs` 共 12 個 test file，12/12 通過。
- Chromium 靜態投影樣板排版實測：1920×1080、1365×768、1024×768、820×1180、390×844、320×640 均通過左右分數、百分比、滑軌、待定提示的重疊／可見性檢查。
- `live-stance-motion.js` 在 Chromium 真實執行：位移動畫、重複相同目標不重啟、`prefers-reduced-motion` 立即更新，均通過。
- 完整課程簡報容器樣板的 820px 寬度檢查通過。
- 與原始 v2.36.1 壓縮檔逐檔比對：只有 `app.css` 改變（另新增本 QA 紀錄）。

## 測試限制

- 瀏覽器排版使用與應用程式一致的 DOM 結構和正式 CSS 的離線樣板，未連接 Supabase，也未經實際學生手機＋教師投影雙裝置測試。
- Node.js 回歸測試涵蓋專案原有的模擬資料情境，不能取代實際 Supabase Realtime 的多裝置驗收。
- 正式部署請先用 GitHub Pages 測試網址確認瀏覽器快取更新，並用投影機、平板確認實際字體與比例。

## 使用說明

取代部署中的前端檔案即可。本次更新不需任何 SQL，也不需執行資料庫 Migration。
