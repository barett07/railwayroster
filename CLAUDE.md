# CLAUDE.md — railwayroster

**彰化機務段輪班查詢系統** — 供單位約 120 名司機員查詢當月及次月工作班表。屬於未來工會網站的輪班查詢模組,目前獨立部署。

- 一般同仁:輸入員工編號 → 查詢個人班表 → 訂閱手機行事曆
- 管理員(Stan):`?admin=1` + 密碼 → 上傳公司月班表 Excel → 存入 Supabase

## 架構速覽

- 前端:單一 `index.html`(HTML + CSS + JS inline,無 build tool),GitHub Pages 部署
- 後端:Supabase 專案 `pgvrnhzbxgwcqbzeanai`(與 railwayshift **分開**)
- 資料表:`workers`、`shifts`、`monthly_schedules`;Edge Function:`admin-write`(寫入)、`calendar`(iCal)
- 個人臨時修改只存 localStorage(`rr_temp_overrides`),不進資料庫

## 先讀這些

- **`NOTES.md`** — 所有技術細節:資料表 schema、狀態變數、資料流(getDayInfo / codeToInfo)、tempOverrides、班卡與月曆規則、上傳流程、iCal、UI 行動裝置規範、資安架構、踩坑記錄。**動任何功能前先查對應段落。**

## ⚠️ 紅線(不知道就會犯錯,細節在 NOTES.md)

1. **innerHTML 中所有來自 Supabase 的文字必須套 `escapeHtml()`**
2. **寫入一律走 Edge Function `admin-write`**(RLS:anon 只能 SELECT);**部署一律用 `./deploy.sh`**(verify_jwt 已寫死在 `supabase/config.toml`,腳本含部署後自動驗證),避免用 MCP 部署(verify_jwt 預設 true 會被靜默重置)
3. **upsert 前 client 端先去重**:PostgREST `merge-duplicates` 不處理同批次內的重複行,會 500
4. **`is_overnight` 欄位不可信**,跨日判斷用 `endTime <= startTime`
5. CSS 行動裝置規範:input 字體 ≥ 16px、觸控目標 ≥ 40px、新增 `:hover` 必須同步加 `@media (hover: none)` reset 行、圖示按鈕加 `aria-label`
6. iCal 有 `TZID` 就必須有 `VTIMEZONE` 區塊,結尾要補 `\r\n`

## ✅ 改完自檢(交付前逐條確認)

- 改了 CSS?→ 新增的 `:hover` 都加進 reset 區塊了;input 字體 ≥ 16px;觸控目標 ≥ 40px;圖示按鈕有 `aria-label`
- 改了 innerHTML?→ Supabase 來的文字都套了 `escapeHtml()`
- 改了上傳流程?→ upsert 前有 client 端去重
- 改了 Edge Function?→ 用 `./deploy.sh` 部署且驗證全綠
- 在本地實際開啟頁面看過改動,不是只看程式碼

## 開發規則

- **寫任何程式碼前**,先與 Stan 討論方向並獲得確認,等 Stan 說「開始生成」再動手
- 傾向修改現有檔案,不新增;不加非必要的 error handling、fallback 或 future-proof 設計
- 沒有 build tool、沒有 npm,直接改 index.html 後 push

## 發布流程(三步驟,不可跳過)

1. **網頁預覽確認** — 先讓 Stan 在瀏覽器中預覽變更
2. **git commit** — Stan 確認沒問題後才 `git add` + `git commit`
3. **git push** — Stan 明確說「推上去」才執行
