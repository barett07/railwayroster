# CLAUDE.md — railwayroster

## 專案概述

**彰化機務段輪班查詢系統** — 供單位約 120 名司機員查詢當月及次月工作班表。
屬於未來工會網站的輪班查詢模組，目前獨立部署。

## 使用對象

- 一般同仁：輸入員工編號 → 查詢個人班表 → 訂閱手機行事曆
- 管理員（Stan）：上傳公司月班表 Excel → 資料存入 Supabase

## 資料來源

- **月班表**：Stan 從公司取得 Excel 後上傳（格式同 railwayshift 的 parseCheckXLSX）
- **工作班定義**：班次代號 + 時間資料（結構同 railwayshift 的 shifts）

## 顯示規則

- 預設顯示當月班表
- 次月資料要等上傳後才能翻閱，未上傳前不顯示
- 個人 iCal 訂閱連結，依員工編號產生

## 識別方式

同仁輸入員工編號（數字，如 651692）→ 帶出姓名確認 → 顯示班表

## 架構

- 前端：單一 `index.html`（HTML + CSS + JS inline，無 build tool）
- 後端：Supabase（新獨立專案，與 railwayshift 分開）
- 部署：GitHub Pages

## 資料庫規劃（待建）

- `workers`：人員名單（name, employee_id）
- `shifts`：工作班定義（同 railwayshift 結構）
- `monthly_schedules`：每月每人每日班次（year, month, employee_id, day, shift_id）

## 開發順序

1. 建立 Supabase 專案與資料表
2. 管理員上傳 Excel 解析並存入資料庫
3. 前端查詢介面（員工編號輸入 → 顯示班表）
4. iCal 訂閱（Supabase Edge Function）
