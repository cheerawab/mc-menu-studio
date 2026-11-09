# 選單工坊 MC Menu Studio

用拖拉的方式設計 Minecraft Java 版（26.3 / 1.21.6 以上）的自訂選單，匯出成「資源包 + 資料包」，
在原版的 Dialog（對話框）畫面裡顯示像素精準、可以點擊的介面，不需要任何模組或外掛。
介面全繁體中文，選單內容完整支援中文字。

> A no-code web editor for pixel-positioned, clickable menus inside the vanilla Minecraft Dialog screen.
> The whole UI is Traditional Chinese.

## 目前進度

- **第一階段（已完成）**：編輯器、渲染器、4 種外觀主題、6 個範本、自動儲存與 JSON 匯入／匯出。
- **第二階段（尚未開始）**：匯出資源包與資料包（目前「匯出」按鈕停用）。

詳細狀態、測試方式與待驗證的假設請見 [`STATUS.md`](STATUS.md)。

## 快速開始

```bash
npm install
npm run dev        # http://localhost:3737
```

其他指令：

| 指令 | 說明 |
| --- | --- |
| `npm run build` | 正式版建置 |
| `npm run lint` / `npm run typecheck` | 程式碼檢查 / 型別檢查 |
| `npm test` | 單元測試（vitest，含渲染決定性與編輯器冒煙測試） |
| `npm run preview:skins` | 在 Node 中把所有範本與圖示輸出成 PNG（`exports/previews/`） |
| `npm run demo:export` | 第二階段才會實作 |

## 功能

- 三欄式編輯器：元件庫／頁面／圖層、可縮放（1–8 倍）與平移的畫布（尺規、格線、吸附、拖曳與縮放控點、
  框選、對齊與平均分布、復原／重做 200 步）、屬性面板（顏色選擇器＋色碼、文字、動作、提示文字、圖片）。
- 元件：面板、按鈕、文字（多行、中文自動換行、像素化）、圖片、圖示（28 個內建 16×16 像素圖示）、形狀、
  進度條、分隔線、物品格。
- 外觀主題：原版風格、暗色現代、全息投影、羊皮紙；可自訂強調色。
- 遊戲內預覽：依 GUI 比例與視窗大小模擬對話框外框，顯示「放得下／需要捲動」，可點擊模擬按鈕動作。
- 頁面連結一覽與「檢查」面板（命名空間、檔名重複、失效連結、空白指令、尺寸過大等）。
- 範本：伺服器大廳、規則同意、商店、快速選單、設定頁、公告。
- 自動儲存到瀏覽器（localStorage），可匯入／匯出專案 JSON；完全離線運作，沒有任何追蹤或統計。

## 致謝

本專案的點子來自開源外掛 [Glyphwork](https://github.com/flyingfinger1/Glyphwork)（作者 flyingfinger1，MIT 授權）：利用 Dialog 的 `plain_message`、
點陣字型與空白字型，在原版畫面中畫出可點擊的介面。**選單工坊是獨立實作**，沒有使用 Glyphwork 的任何程式碼、
主題或素材；圖示、外觀主題與範本皆為本專案原創。

Minecraft 是 Mojang Studios 的商標。本專案與 Mojang Studios 及 Microsoft 沒有任何關係。

## 授權

MIT，見 [`LICENSE`](LICENSE)。
