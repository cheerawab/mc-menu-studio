# MC Menu Studio — MCP 代理操作能力 實作計劃（外包 CC 用）

> **狀態**：計劃階段，尚未執行。要開工請說一聲。
> **交付對象**：Claude Code（`claude -p`，Opus 4.8），在 `cheerawab/mc-menu-studio`（private）repo 的新分支上施作。
> **本計劃定位**：這份就是給 CC 的 SPEC + 任務書母本；設計→檢核→測試→交付四段都寫在裡面。

---

## 0. 目標（一句話）

讓一個 AI agent（透過 MCP）能**全程操作** MC Menu Studio：從零建立專案 → 擺放/編輯元件 → 檢核（validate + 匯出前檢查）→ 產生預覽 PNG → 匯出 resourcepack/datapack zip，不需開瀏覽器、不需人手點 UI。

把現有「只有人能用的視覺編輯器」，補上一條「agent 可程式化驅動」的平行通道，**共用同一套 `src/core` 純函式**（同一份真相，兩個前端：React UI ＋ MCP）。

## 1. 為什麼可行（現況盤點，已讀碼確認）

`src/core/` 完全不依賴 React/DOM，Node 端用 `@napi-rs/canvas` 就能跑（`scripts/demo-export.ts`、`scripts/render-previews.ts` 已是現成範例）。agent 要的每個能力都已經是純函式：

| 能力 | 既有函式（直接包，不要重寫） |
|---|---|
| 建專案（空白/範本） | `templates/index.ts` 的 `TEMPLATES[].build()`、`model/defaults.ts` 的 `createProject` |
| 載入/存檔 JSON | `model/serialize.ts`：`parseProjectJson` / `serializeProject` / `normalizeProject` |
| 加頁/改頁/加元件/改元件/刪除/層級 | `model/ops.ts`：`addPage`/`updatePage`/`addElements`/`updateElements`/`removeElements`/`moveElementsZ`/`duplicatePage`… |
| 建元件物件 | `model/defaults.ts` 的 `createElement` |
| 幾何（對齊/吸附/移動） | `core/geometry.ts` |
| 檢核 | `model/validate.ts` 的 `validateProject`、`export/project.ts` 的 `checkExport` |
| 渲染成像素圖＋可點擊區 | `render/renderPage.ts` 的 `renderPageToCanvas`、`exportPagesFromProject` |
| PNG 編碼 | `export/png.ts` 的 `encodePng` |
| 遊戲框/fit 判定 | `game/chrome.ts` 的 `gameLayout`/`fitProblem`/`drawGameMock` |
| 匯出 zip | `export/index.ts` 的 `buildExport` + `zipExport`（+ `zipBundle`） |

**結論：MCP 層是薄 adapter，不是新功能。** 禁止在 MCP 層重寫 render/export 邏輯——一律呼叫 `src/core`。

## 2. 設計（架構）

### 2.1 放哪
- 新增 `src/mcp/`（純 TS，Node-only，可 import `src/core`，**禁止** import `src/app`/React/Next）。
- 新增 `scripts/mcp-server.ts`：MCP server 進入點（stdio transport）。
- `package.json` 加 script：`"mcp": "tsx scripts/mcp-server.ts"`。
- 依賴：`@modelcontextprotocol/sdk`（dependencies）、`@napi-rs/canvas`（已有，dev→若 server 執行期要渲染則移到 dependencies）。

### 2.2 狀態模型（關鍵設計決定）
MCP server 是長命進程，agent 會連續多次呼叫。採**檔案為真相來源 + 記憶體 handle**：

- 每個專案存成一份 `*.mcms.json`（即 `serializeProject` 的輸出）在 agent 指定的工作目錄。
- server 記憶體維護 `openProjects: Map<handle, Project>`，但**每次 mutate 後立刻寫回檔案**（agent 崩潰/重連不丟工作；也讓人能同時在瀏覽器開同一份 JSON）。
- 所有 ops 都是 immutable（回傳新 `Project`），handle 指向最新 snapshot。
- 提供 `session.undo`（保留最近 N 個 snapshot，沿用或簡化 `core/history.ts`）。

> 設計理由寫進 `src/mcp/README.md`：為何選檔案真相來源而非純記憶體 session（可重現、可與 UI 互通、agent 可重連）。

### 2.3 工具清單（MCP tools，名稱 = `mcms.<group>.<verb>`）

每個 tool 的 input/output 都用 zod schema（MCP SDK 要求），薄包一支 core 函式。分組：

**A. 專案生命週期**
- `mcms.project.list_templates` → `TEMPLATES` 的 `{id,name}[]`
- `mcms.project.create` `{name, namespace, skinId, fromTemplate?}` → `{handle, project}`（空白走 `createProject`，範本走 `TEMPLATES[].build()`）
- `mcms.project.open` `{path}` → `{handle, project}`（`parseProjectJson`）
- `mcms.project.save` `{handle, path?}` → `{path}`（`serializeProject`）
- `mcms.project.get` `{handle}` → `{project}`（回目前狀態，給 agent 重新對齊）

**B. 頁面編輯**
- `mcms.page.add` / `mcms.page.update` / `mcms.page.remove` / `mcms.page.duplicate` / `mcms.page.move`（包 `ops.ts`）

**C. 元件編輯**
- `mcms.element.add` `{handle, pageId, element|elementSpec, index?}` → 新元件 id（`createElement` + `addElements`）
- `mcms.element.update` `{handle, pageId, ids[], patch}`（`updateElements`）
- `mcms.element.remove` / `mcms.element.move_z` / `mcms.element.duplicate`
- `mcms.element.align` / `mcms.element.distribute`（包 `geometry.ts`）

**D. 內省（讓 agent 知道能填什麼）**
- `mcms.schema.element_types` → 每種 element 的欄位與預設（從 `defaults.ts` 的 meta 導出）
- `mcms.schema.icons` → `ICON_IDS` + 中文標籤
- `mcms.schema.skins` → skin id/名稱

**E. 檢核**
- `mcms.check.project` `{handle, mode?, commandMode?}` → `checkExport()` 的 `Issue[]`（errors 會擋匯出）

**F. 預覽（agent 的「眼睛」）**
- `mcms.preview.page` `{handle, pageId, scale?}` → PNG（`renderPageToCanvas` → `encodePng`），回 base64 或寫檔回路徑
- `mcms.preview.game_mock` `{handle, pageId, winW, winH, guiScale}` → 遊戲框內的 mock PNG + `fitProblem` 結果（`drawGameMock`/`gameLayout`）

**G. 匯出**
- `mcms.export.build` `{handle, options}` → `ExportStats` + `warnings`（`buildExport`，不寫檔，先給 agent 看統計/警告）
- `mcms.export.write` `{handle, options, outDir}` → 寫出 `resourcepack.zip`/`datapack.zip`/`README_zh-TW.txt`(+autotest)，回檔案路徑（`buildExport`+`zipExport`）

> **預覽是 agent 唯一的視覺回饋**，F 組最關鍵：沒有它 agent 是瞎的。PNG 要能被 Hermes 的 vision 讀。

### 2.4 錯誤處理
- 所有 core 的 `ExportError` / validation issue 轉成 MCP 的結構化錯誤（zh-TW message 原樣帶出，agent 看得懂）。
- 輸入用 zod 擋；handle 不存在、pageId 不存在都回明確錯誤，不要 throw 未捕捉。

## 3. 檢核（Definition of Done 的驗收尺）

CC 必須讓以下**全綠**才算完成，並寫成可重跑腳本 `src/mcp/__tests__/`（vitest）：

1. **既有測試零回歸**：`npm run lint && npm run typecheck && npm test && npm run build` 全過（MCP 不得動到 `src/core`/`src/app` 既有行為）。
2. **單元測試（MCP adapter 層）**：
   - create→add page→add element→update→check→export 全鏈路，用假 RenderEnv（napi canvas）跑完回合，斷言每步 project 結構正確。
   - 每個 tool 的 zod schema reject 壞輸入（陰性）＋ accept 合法輸入（正面）—— 成對。
   - `export.build` 的 stats 與直接呼叫 `buildExport` **逐欄位相同**（證明沒偷改 core 行為）。
   - 檔案真相來源：mutate 後 handle 指向新 snapshot、檔案內容 = `serializeProject(新project)`。
3. **端到端煙測腳本** `scripts/mcp-smoke.ts`：用 MCP client SDK 真的起 server、跑一輪「建範本→改一個 label→匯出」，斷言產出的 zip 非空且 `buildExport` warnings 可列出。
4. **決定性**：同輸入兩次 `export.write` 的 zip bytes 相同（沿用現有 golden 測試精神）。

> **硬規則給 CC**：不得修改驗收腳本的斷言/門檻；不得改 `src/core` 既有公開函式簽名（只能新增）；若發現 core 有 bug 停下來回報，不要繞過。

## 4. 測試（真實遊戲由 Hermes 跑，CC 不碰）

CC 交付後，Hermes（我）負責：
- 用 MCP 驅動 agent 真的做一份選單 → `export.write` → 把兩個 zip 丟進真實 Minecraft 26.3（Prism Launcher）→ 截圖/點擊驗證。
- 這段**不在 CC 範圍**（CLAUDE.md rule 3：CC 永不啟動 Minecraft）。CC 只要保證匯出 bytes 與現有 `demo:export` 同管線即可。

## 5. 交付（CC 的產出形狀）

- 新分支 `feat/mcp-server`，commit 粒度小（每個 tool 組一個 commit），commit message 尾帶 `Co-authored-by: Claude <noreply@anthropic.com>`（CLAUDE.md rule 5）。
- **CC 不得 push、不得 commit 到 main**；交付 = 分支上的 commits + 自測全綠的輸出貼回。
- 更新 `STATUS.md`（新 Stage：MCP server，列能做什麼、怎麼跑、open questions）。
- 新增 `docs/MCP.md`：工具清單、如何在 Claude Code / 其他 MCP client 掛載（`claude mcp add mcms -- npx tsx scripts/mcp-server.ts`）、狀態模型說明。
- README 補一段「Agent / MCP」入口，連到 `docs/MCP.md`。

## 6. 給 CC 的任務書骨架（實際外包時用）

```
讀 BRIEF.md、CLAUDE.md、AGENTS.md、docs/TECHNIQUE.md、本檔（MCP_PLAN.md）全文。
目標：實作 §2 的 src/mcp/ + scripts/mcp-server.ts，暴露 §2.3 全部工具，薄包 src/core。
硬規則：
- 禁止 import src/app/React/Next；MCP 層禁止重寫 render/export 邏輯，一律呼叫 src/core。
- 禁止改 src/core 既有公開函式簽名（只能新增 export）；禁止改既有測試的斷言/門檻。
- 禁止 push、禁止 commit main、禁止啟動 Minecraft、禁止對外部網路發請求。
- 全程繁中使用者字串；程式碼/註解英文（照 CLAUDE.md）。
驗收：§3 全綠（lint/typecheck/test/build + 新單元測試 + mcp-smoke + 決定性）。
多輪自檢：至少 3 輪「讀自己程式碼找 bug→修→重跑測試」直到全綠，每輪寫進 .logs/mcp_round_<N>.md。
做不到的、沒驗過的，誠實寫進交付報告，不要假造數據。
交付：feat/mcp-server 分支 commits + 自測輸出 + STATUS.md/docs/MCP.md 更新。
```

## 7. 風險與未決

- **MCP SDK 版本**：`@modelcontextprotocol/sdk` 需先確認可裝（CC 第一步 `npm i` 驗證，不行就回報換方案）。
- **預覽圖回傳大小**：base64 PNG 可能很大 → 預設寫檔回路徑，只有小圖才 inline；給 `?inline` 選項。
- **@napi-rs/canvas 移到 runtime dependency**：目前是 dev；MCP server 執行期要渲染，需移位（確認 production install 仍帶得到）。
- **並發**：MVP 單一 agent 序列呼叫即可；多 agent 同時改同一 handle 不在 MVP 範圍（檔案真相來源已給了基本保護）。
- **TECHNIQUE.md 的 [GW]/[TEST] 假設**：MCP 不碰這些，沿用 core 既有行為即可。

## 8. 落地順序（CC 分階段，每階一 commit）

1. 裝 MCP SDK + `scripts/mcp-server.ts` 最小骨架（只有 `project.list_templates`）跑得起來、smoke 連得上。Commit。
2. 專案生命週期 A 組 + 檔案真相來源 + 單元測試。Commit。
3. 編輯 B/C/D 組（包 ops/geometry/defaults）+ 成對測試。Commit。
4. 檢核 E 組 + 預覽 F 組（PNG）+ 測試。Commit。
5. 匯出 G 組 + 決定性測試 + mcp-smoke 端到端。Commit。
6. docs/MCP.md、STATUS.md、README 段落；lint/typecheck/test/build 全綠。Commit。
```
```
```
```
