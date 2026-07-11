# NOTES — railwayroster 技術細節與踩坑記錄

## Supabase 資料表

### `workers`
| 欄位 | 型態 | 說明 |
|---|---|---|
| employee_id | text (PK) | 員工編號(如 651692) |
| name | text | 姓名 |

### `shifts`
| 欄位 | 型態 | 說明 |
|---|---|---|
| id | text (PK) | 班次代號(如 `550`、`576V`) |
| name | text | 班次名稱 |
| start_time | text | 上班時間(HH:MM) |
| end_time | text | 下班時間(HH:MM) |
| special_note | text | 備註 |
| is_overnight | boolean | 是否跨日(勿依賴此欄,用時間比較判斷) |

### `monthly_schedules`
| 欄位 | 型態 | 說明 |
|---|---|---|
| year | int | 年 |
| month | int | 月(1–12) |
| employee_id | text (FK → workers) | 員工編號 |
| day | int | 日(1–31) |
| shift_code | text | 班次代號或「休」「例假」「—」等 |

Unique constraint: `(year, month, employee_id, day)`

## 狀態變數(index.html)

```javascript
let employeeId   = '';          // 目前查詢的員工編號(localStorage: 'rr_emp_id')
let employeeName = '';          // 員工姓名(localStorage: 'rr_emp_name')
let shiftsMap    = {};          // id → shift 物件
let monthCache   = {};          // 'YYYY-MM' → { day: shift_code },每月查詢一次後快取
let calY = new Date().getFullYear();
let calM = new Date().getMonth() + 1;
let homeOffset   = 0;           // 首頁相對今天的偏移天數
let tempOverrides = {};         // localStorage: 'rr_temp_overrides'(個人臨時修改)
let _parsedUpload = null;       // 上傳 Excel 解析結果暫存
let _parsedShiftXLSX = null;   // 工作班 Excel 解析暫存
let shiftFilter   = 'all';     // 工作班列表篩選
```

## 資料流

### 查詢流程
1. 使用者輸入員工編號 → 儲存至 localStorage
2. `loadMonth(y, m)` 呼叫 Supabase REST API 撈 `monthly_schedules`,存入 `monthCache['YYYY-MM']`
3. `getDayInfo(ds)` 解析日期:**tempOverrides → monthCache**,無資料回傳 `{ type: 'unknown' }`
4. `codeToInfo(code)` 把班次代號轉成 `{ type, shiftId?, note? }`

### getDayInfo 優先順序
```
tempOverrides[ds]  →(若有)直接回傳,不查 monthCache
  ↓
monthCache['YYYY-MM'][day]  →  codeToInfo(code)
  ↓
{ type: 'unknown' }  →  顯示「資料載入中...」
```

### codeToInfo 規則
| shift_code 值 | type | 說明 |
|---|---|---|
| `休`、`—`、`-` | rest | 休班 |
| `例假` | off | 例假 |
| `特休` | leave | 特休 |
| 其他非空字串 | work | shiftId = code |
| 空字串 | rest | 視為休班 |

## tempOverrides 結構

儲存在 `localStorage['rr_temp_overrides']`(JSON 物件):

```javascript
{
  'YYYY-MM-DD': {
    type: 'work' | 'rest' | 'off' | 'leave',
    shiftId: '550',           // type=work 時
    customStartTime: 'HH:MM', // 選填,覆蓋工作班預設
    customEndTime:  'HH:MM',  // 選填,覆蓋工作班預設
    note: '備註文字',          // 選填
  }
}
```

`getRealDayInfo(ds)` — 不走 tempOverrides,直接查 monthCache,供臨時修改 modal 預填使用。

### 臨時修改操作

- 觸發:首頁日卡右上角「臨時修改」按鈕
- 預填順序:`tempOverrides[ds]` → `getRealDayInfo(ds)` → 空白
- 選擇工作班下拉後,上下班時間欄位自動同步(`tempShiftChange` 函式)
- 已臨時修改的卡片右上角顯示「已臨時修改」(青藍色 `#22d3ee`)
- 清除後恢復顯示原班表資料

## 班卡顯示規則(buildDayCard)

| type | 顯示內容 |
|---|---|
| work | 工作班號 + 上下班時間 + 班卡圖片 |
| rest | 顯示「昨日跨夜工作班」+ 前一天的工作班圖片(若前天為 work) |
| off | 例假 |
| leave | 特休 |
| unknown | 「資料載入中...」 |

休班(rest)的前一天如果不是 work,則顯示空白休班卡。

## 月曆導覽規則

- `calMove(dir)`:前後翻月前先呼叫 `loadMonth`,若該月 monthCache 為空(`{}`)則取消翻頁並顯示 toast
- 點選月曆格子 → `goToDate(ds)` → 切換首頁並跳到該日(`homeOffset` 設定)
- 首頁/月曆的當前位置在切換頁籤時**保留**,只有**再次點同一頁籤**才重置

```
再次點首頁 → homeOffset = 0(回今天)
再次點月曆 → calY/calM 重置為今天所在月份
```

### 月曆今日標示

今日格子的日期數字以橘色實心圓(`--acc`)顯示,不用外框:

```css
.cal-cell.today .cc-day {
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--acc); color: #0a0c10;
  border-radius: 50%; width: 22px; height: 22px;
  font-size: 11px; margin-bottom: 2px;
}
```

## 上傳流程(doUpload)

1. 解析 Excel(`_parsedUpload` 暫存)→ 顯示預覽
2. 確認後執行 doUpload:
   a. **workers upsert**(`resolution=merge-duplicates`)— 注意要先用 Map 去重,同一批次內不能有重複 employee_id
   b. **shifts upsert** — 從解析結果取得本次出現的所有班次
   c. DELETE `monthly_schedules` 該年月
   d. INSERT 所有排班行

**重要**:PostgREST 的 `resolution=merge-duplicates` 只處理與資料庫既有行的衝突,同一批次內重複的行仍會 500 (code:21000)。必須在 client 端去重:

```javascript
const wMap = new Map();
for (const w of workers) {
  if (w.id) wMap.set(String(w.id), { employee_id: String(w.id), name: w.name });
}
const wRows = [...wMap.values()];
```

## iCal 訂閱

- 路徑:`supabase/functions/calendar/index.ts`
- Endpoint:`https://pgvrnhzbxgwcqbzeanai.supabase.co/functions/v1/calendar?id={employeeId}`
- 公開(no JWT),Apple/Google 日曆可直接訂閱
- 涵蓋:今天前 3 個月到後 13 個月的工作日(休假不輸出)
- 提醒:2 小時前(`TRIGGER:-PT2H`)
- 事件名稱格式:`{班次代號} 工作班`
- 跨日判斷:`endTime <= startTime`(不依賴 is_overnight)

### iCal 格式注意事項(踩過的坑)

- **VTIMEZONE 必須附帶**:只要 DTSTART/DTEND 有 `TZID=Asia/Taipei`,iCal 裡就必須有 `BEGIN:VTIMEZONE` 元件,否則 Google Calendar 伺服器拒絕解析,顯示「無法新增日曆,請檢查網址」
- **結尾 CRLF**:`lines.join('\r\n')` 後面要加 `+ '\r\n'`,最後一行才有結尾符
- **Android 訂閱 URL 的 `cid` 必須用 `webcal://`**:`https://calendar.google.com/calendar/r?cid=webcal%3A%2F%2F...`,用 `https://` 在部分 Google Calendar 版本會失敗

## 班卡圖片

- 存放:`images/` 資料夾
- 命名:`{shiftId}.jpeg`(如 `550.jpeg`、`576V.jpeg`)
- 載入失敗自動隱藏(`onerror="this.style.display='none'"`)

## UI/UX 行動裝置規範(重要)

與 railwayshift 保持一致。修改 CSS 前務必遵守,否則 mobile Safari 體驗會嚴重劣化:

### 1. 表單輸入框字體 ≥ 16px
所有 `.fi, .fs, .srch` 字體**必須 ≥ 16px**。iOS Safari 對字體 < 16px 的 input 會自動放大頁面。

### 2. 觸控目標 ≥ 36-40px
按鈕類元素需要 `min-height`:`.nav-tab`、`.btn`、`.btn-sm` ≥ 40px;`.filter-btn` ≥ 36px。

### 3. 鍵盤焦點外框(`:focus-visible`)
全域 `:focus-visible` 規則只在鍵盤導航時顯示橘色外框,不影響滑鼠/觸控 — **不要用 `:focus` 設外框**(會被觸控觸發殘留)。

### 4. 觸控裝置 `:hover` 殘留(最易踩雷)

mobile Safari 點完按鈕後 `:hover` 狀態會「卡住」。修法:CSS 末尾的 `@media (hover: none)` 區塊把所有 `:hover` 規則 reset 到「未 hover」狀態。

**🚨 必讀規則**:
- reset 區塊**必須放在所有 `:hover` 規則之後**(CSS「後者勝出」原則),否則被原本的 `:hover` 規則覆蓋
- **新增任何 `:hover` 規則時**,必須同時在 reset 區塊內加對應的 reset 行(reset 為該元素的「未 hover」狀態值)

### 5. 純圖示按鈕需加 `aria-label`
例:`<button aria-label="上一個月">‹</button>`、`<button aria-label="刪除班次 ${s.name}">🗑</button>`。否則螢幕閱讀器會念出無意義字元。

## 資安架構(重要)

### 管理員模式
- **網址**:`?admin=1`(舊的 `?admin=651692` 已廢棄,無效)
- 頁面載入時立即呼叫 `_initAdminAuth()`,透過後端驗證密碼後才套用 `admin-mode` class
- 密碼存在 `localStorage['rr_write_token']`;驗證失敗或 key 不存在則跳出密碼框(不可關閉)

### 寫入保護
- `shifts`、`workers`、`monthly_schedules` 的 RLS:anon 只能 SELECT,**不能寫入**
- 讀取 policy 每張表**只留一條 `public read`**(涵蓋 anon + authenticated)。2026-07-09 已刪除重複的 `ms_select`、`workers_select`(效能考量,前後實測讀取行為不變)。之後加 policy 前先查 `pg_policies`,避免再出現同 role 同 action 的重複 policy
- 所有寫入走 Edge Function `admin-write`(`adminFetch(action, payload)`),帶 `X-Write-Token` header
- Supabase Secret:`WRITE_SECRET`(與 railwayshift 使用**同一組密碼**)
- 支援的 action:`verify`、`upsert-workers`、`delete-schedules`、`insert-schedules`、`update-shift`、`delete-shift`、`delete-all-shifts`、`upsert-shifts`

### XSS 防護
- `escapeHtml()` 定義在 CONFIG 區塊下方(STATE 上方)
- **buildDayCard 和 renderShifts 中,所有來自 Supabase 的文字欄位都必須套用 `escapeHtml()`**

### 部署 Edge Function
```bash
cd "/Users/stan/Claude Code/railwayroster"
supabase functions deploy admin-write --project-ref pgvrnhzbxgwcqbzeanai
supabase functions deploy calendar --project-ref pgvrnhzbxgwcqbzeanai --no-verify-jwt
```

⚠️ **verify_jwt 陷阱**(stock-tracker 曾因此連續失敗 6 週):`calendar` 必須 `verify_jwt = false`(行事曆訂閱端不帶 JWT)。CLI 部署要帶 `--no-verify-jwt`;用 Supabase MCP `deploy_edge_function` 部署時**預設是 true**,必須明確傳 `verify_jwt: false`,否則會被靜默改回 true、訂閱直接壞掉。

### 其他資料庫記錄
- `rls_auto_enable()`(建表時自動開 RLS 的 event trigger)已於 2026-07-09 收回 anon/authenticated/public 的 EXECUTE 權限(消除 advisor 警告,不影響其運作)
