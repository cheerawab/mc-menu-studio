# 選單工坊 MC Menu Studio

用拖拉的方式設計 Minecraft Java 版（26.3 / 1.21.6 以上）的自訂選單，匯出成「資源包 + 資料包」，
在原版的 Dialog（對話框）畫面裡顯示像素精準、可以點擊的介面，不需要任何模組或外掛。
介面全繁體中文，選單內容完整支援中文字。

> A no-code web editor for pixel-positioned, clickable menus inside the vanilla Minecraft Dialog screen.
> The whole UI is Traditional Chinese.

## 目前進度

- **第一階段（已完成）**：編輯器、渲染器、4 種外觀主題、6 個範本、自動儲存與 JSON 匯入／匯出。
- **第二階段（已完成）**：匯出資源包與資料包（瀏覽器內直接產生 zip，也可用指令列匯出）。
- **第三階段（已完成）**：`/trigger` 指令執行方式，一般玩家也能按選單按鈕，不會出現 Minecraft 的「確認指令」畫面。
- 圖片的位置與拼接已在 Minecraft Java 版 26.3 實機確認；**按鈕點擊、滑鼠提示文字與 /trigger 的實際執行尚待實機驗證**。

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
| `npm run demo:export -- --mode both --autotest` | 在 Node 中匯出示範選單（所有範本＋校準頁）到 `exports/demo/`；`--mode registry\|functions\|both`、`--commands trigger\|direct`（預設 trigger）、`--out <資料夾>`、`--autotest`（自動輪播測試用資料包；trigger 模式另外自動按三個按鈕） |

## 匯出到 Minecraft

1. 在編輯器右上角按「匯出」。
2. 選擇匯出模式：
   - **資料包對話框（registry）**：適合伺服器。頁面登錄在資料包裡，按鈕用 `show_dialog` 切換頁面，一般玩家也能使用，
     還能綁定 G 鍵（快捷動作）。單人遊戲每次開啟世界時，Minecraft 會先顯示「實驗性設定」警告畫面
     （選「我知道我在做什麼！」即可）；伺服器不會出現。
   - **函數內嵌（functions）**：適合單人遊戲與地圖。每個頁面是一個函數（`/function <命名空間>:show_<頁面>`），
     不會出現實驗性設定警告；但開啟與切換頁面需要指令權限（單人需開啟作弊、伺服器需 OP）。
3. 選擇指令執行方式（「執行指令」、「關閉選單」以及函數內嵌模式的切換頁面都算「指令動作」）：
   - **/trigger（建議）**：按鈕只送出 `/trigger mcms_<命名空間> set <編號>`（不需要權限），資料包裡每個 tick 執行的
     `trigger_tick` 函數再以玩家身分、用函數權限執行真正的指令。一般玩家也能使用，也不會跳出確認畫面。
     要注意：任何玩家都能自己輸入 `/trigger mcms_<命名空間> set <編號>` 執行選單裡的動作（不必開啟選單），
     所以不要放只想給管理員使用的指令；編號對照表在 `README_zh-TW.txt`。函數執行的指令不會把回饋訊息
     （例如 `/random value` 的結果）顯示給玩家；所有指令寫在同一個函數檔裡，只要一個指令打錯，所有按鈕都會失效。
   - **直接執行**：按鈕直接送出指令本身，玩家需要對應的權限；需要權限的指令（time、weather、gamemode、give、
     function、dialog…）每次點擊都會跳出 Minecraft 的「確認指令執行」畫面，一般玩家無法使用。
4. 「點擊選單後」：**點擊後關閉**（預設）＝點任何按鈕或底部按鈕後選單關閉，切換頁面會直接開啟下一頁；
   **保持開啟**＝點按鈕後選單不關閉，底部按鈕負責關閉（Esc 也可以）。
5. 「檢查」沒有錯誤後即可下載：資源包、資料包，或「全部下載」（兩個 zip 加上 `README_zh-TW.txt` 安裝說明）。
   兩個 zip 都不要解壓縮：資源包放進 `resourcepacks/`，資料包放進世界的 `datapacks/`。伺服器需要透過
   `server.properties` 的 `resource-pack` 讓玩家下載資源包，玩家必須接受資源包。

限制：選單是一張靜態圖片，沒有滑鼠移上去的變化、沒有動畫，也不能輸入文字。圖片裡的文字是用你電腦上的字型畫出來的，
請確認你有權以這種方式使用並散布該字型；開源字型（例如 Noto Sans TC）最安全。

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
- 匯出器：把每頁切成 32 px 圖塊（重複的只存一次）、打包成點陣字型圖集，用空白字型精準定位，點擊區域是隱形字元；
  指令可用 `/trigger` 或直接執行；產生的 zip 每次都位元組一致。說明見 [`docs/VERIFIED.md`](docs/VERIFIED.md)。

## 致謝

本專案的點子來自開源外掛 [Glyphwork](https://github.com/flyingfinger1/Glyphwork)（作者 flyingfinger1，MIT 授權）：利用 Dialog 的 `plain_message`、
點陣字型與空白字型，在原版畫面中畫出可點擊的介面。**選單工坊是獨立實作**（包含匯出器），沒有使用 Glyphwork 的任何程式碼、
主題或素材；圖示、外觀主題與範本皆為本專案原創。

Minecraft 是 Mojang Studios 的商標。本專案與 Mojang Studios 及 Microsoft 沒有任何關係。

## 授權

MIT，見 [`LICENSE`](LICENSE)。
