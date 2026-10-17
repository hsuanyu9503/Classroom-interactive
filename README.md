# 課堂互動工具 V2.35.13｜逐層思辨理由提交修正

## 問題與修正
- 在教師設定第二層「不顯示理由」時，部分 Supabase 專案的舊版 `submit_classroom_response` RPC 仍採用整個活動的 `req.reason`（必填），沒有讀取第二層 `l[1].rr=false`，因此返回 `reason required`。
- 附 `upgrade-v2.35.13-deliberation-reason-check.sql`：恢復以目前層的 `l[N].rr` 優先、否則才使用共用設定的驗證。**未放寬原本必填的驗證，亦不刪改現有作答資料**。
- 學生端收到規則不一致的資料庫錯誤時，顯示說明及操作建議，不再只看到英文 `reason required`；不會假造理由繞過驗證。
- `check-v2.35.13-deliberation-state.sql` 為只讀診斷 SQL，可檢查 RPC 是否使用逐層規則，以及現有 Session 快照各層儲存的理由狀態。

## 必須注意
- **先在 Supabase 備份資料庫並執行 V2.35.13 的 SQL**，再更新 GitHub Pages。
- 請確認先前 V2.35.0／V2.35.6／V2.35.8／V2.35.9／V2.35.10 的必要升級已完成。
- **已建立的 Session 保存建立當時的活動設定快照。** 如果第二層在 Session 建立後才改為「不顯示」，更新 SQL 不會自動修改該 Session；請在儲存活動／課程後建立新 Session 測試。勿為了修正強行修改進行中的作答資料。
- 如果診斷 SQL 顯示目前第二層 `rr=true` 或 `rr` 不存在且共用設定為 `true`，雲端要求理由是符合現有 Session 的設定；需要建立新 Session，而非移除理由檢查。
- 單選與複選理由的基本資料格式 `reason`／`reasonSelections`／`reasonMode` 仍維持不變。

## 驗收
1. 第一層「必填」：空白理由應無法送出，選擇／輸入理由後成功。
2. 第二層「不顯示」：理由欄完全不出現；可只選立場即成功送出。
3. 第三層「單選理由必填」：需選一項理由；換選後只保留最新項目。
4. 在 Course、平行活動 A/B 和一般獨立 Session 各測一次，不要用未重新建立的舊 Session 當作新設定驗收。

正式 Supabase 操作、資料庫升級與手機實機行為需在使用者部署環境驗證；本包只完成靜態與模擬檢查。
