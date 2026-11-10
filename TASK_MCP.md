# TASK_MCP — 為 MC Menu Studio 加上 MCP（Agent 操作）能力

你是 Claude Code。先完整讀：`BRIEF.md`、`CLAUDE.md`、`AGENTS.md`、`docs/TECHNIQUE.md`、`MCP_PLAN.md`（設計全在那）。本檔是任務書與硬規則。

## 已由 orchestrator 驗證的事實（直接用，不要重新摸索）

- 分支已建好：`feat/mcp-server`（你在這分支上施作）。`npm ci` 已跑過，baseline **193 tests 全綠**、typecheck 綠、build 可過。你改動後必須維持全綠。
- 依賴已裝好並在 `package.json`：`@modelcontextprotocol/sdk@1.32.2`、`zod@4`。**不要降版或換包。**
- **SDK import 路徑（1.32.2，已實測可用，從專案目錄解析）**：
  ```ts
  import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
  import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
  import { z } from 'zod';
  ```
  高階 API 用 `McpServer`（`Server` 已 deprecated）。MCP client（給 smoke test 用）在 `@modelcontextprotocol/sdk/client/index.js` 與 `.../client/stdio.js`。
- 執行器是 `tsx`（已裝）。server 進入點用 `.mts` 或 `.ts` 皆可，照 `scripts/demo-export.ts` 的風格（它是現成的 Node 無頭跑 src/core 的範例）。
- **`@napi-rs/canvas` 目前在 devDependencies**，但 MCP server 執行期要渲染預覽/匯出 → 需移到 `dependencies`（渲染/匯出的 Node RenderEnv 寫法照抄 `scripts/demo-export.ts` 第 193 行：`{ createCanvas: (w,h) => createCanvas(w,h) as unknown as CanvasLike }`）。
- zod 版本是 **v4**（注意 v3/v4 API 差異；MCP SDK 內部也用 v4）。

## 目標

實作 `MCP_PLAN.md` §2 的 `src/mcp/` + `scripts/mcp-server.ts`，暴露 §2.3 的全部工具（A~G 共 ~25 支 `mcms.*`），每支**薄包一支 `src/core` 函式**。對照表在 `MCP_PLAN.md` §1。

## 硬規則（違反即退件）

1. **禁止 import `src/app`、React、Next**。`src/mcp` 只能 import `src/core`（與 node 內建、SDK、zod、@napi-rs/canvas）。
2. **MCP 層禁止重寫 render/export/validate 邏輯**——一律呼叫 `src/core` 既有函式。
3. **禁止改 `src/core` 既有公開函式簽名**（只能「新增」export）。若發現 core 有 bug，**停下來在交付報告寫明，不要繞過、不要改斷言迎合**。
4. **禁止改既有測試的斷言/門檻**。既有 193 tests 必須零回歸。
5. **禁止 `git push`、禁止 commit 到 `main`、禁止啟動 Minecraft、禁止對外部網路發請求**。
6. 使用者字串一律**繁體中文**；程式碼與註解英文（照 CLAUDE.md）。core 的 `ExportError`/validation 的 zh-TW 訊息要原樣帶給 agent。
7. commit 在 `feat/mcp-server` 分支，粒度小（照 `MCP_PLAN.md` §8 每階一 commit）；commit message 尾端空一行後加 `Co-authored-by: Claude <noreply@anthropic.com>`。不要設 local git user。
8. 狀態模型照 `MCP_PLAN.md` §2.2：**JSON 檔當真相來源 + 記憶體 handle，每次 mutate 立刻寫回檔案**。預覽圖預設**寫檔回路徑**，加 `inline` 選項才回 base64（§7 風險）。

## 落地順序（每階一 commit，照 MCP_PLAN.md §8）

1. `@napi-rs/canvas` 移到 dependencies；`scripts/mcp-server.ts` 最小骨架（只有 `mcms.project.list_templates`）能起、MCP client 連得上。加 `"mcp": "tsx scripts/mcp-server.ts"` script。Commit。
2. A 組（專案生命週期）+ 檔案真相來源 + 單元測試。Commit。
3. B/C/D 組（頁面/元件/內省，包 ops.ts、geometry.ts、defaults.ts）+ 成對測試（陰性+正面）。Commit。
4. E 組（檢核，包 checkExport/validateProject）+ F 組（預覽 PNG，包 renderPageToCanvas+encodePng、drawGameMock）+ 測試。Commit。
5. G 組（匯出，包 buildExport+zipExport）+ 決定性測試 + `scripts/mcp-smoke.ts` 端到端。Commit。
6. `docs/MCP.md`、`STATUS.md`（新 Stage）、README 補 Agent/MCP 段；lint/typecheck/test/build 全綠。Commit。

## 驗收（必須全綠，照 MCP_PLAN.md §3）

- `npm run lint && npm run typecheck && npm test && npm run build` 全過。
- 新單元測試（放 `src/mcp/__tests__/`，vitest）：
  - create→add page→add element→update→check→export 全鏈路跑完，逐步斷言結構。
  - 每個 tool 的 zod schema：壞輸入 reject（陰性）+ 合法輸入 accept（正面），成對。
  - `export.build` 的 stats 與直接呼叫 `buildExport` **逐欄位相同**（證明沒偷改 core）。
  - 檔案真相來源：mutate 後檔案內容 == `serializeProject(新project)`。
- `scripts/mcp-smoke.ts`：用 MCP client 真起 server 跑「建範本→改一個 label→export.write」，斷言產出 zip 非空、能列出 warnings。
- 決定性：同輸入兩次 `export.write`，zip bytes 相同。

## 多輪自檢（交付條件，不可一次就交）

至少 **3 輪**「讀自己程式碼找 bug → 修 → 重跑測試」直到全綠，每輪把結果寫進 `.logs/mcp_round_<N>.md`。做不到的、沒驗過的，**誠實寫進交付報告，不要假造數據/輸出**。

## 交付形狀

- `feat/mcp-server` 分支上的 commits（不 push）。
- 交付報告列：改了哪些檔（逐檔一句話）、真實測試輸出尾巴、`npm run lint/typecheck/test/build` 四個的實際結果、哪些驗過哪些沒驗、卡住的地方。
- `STATUS.md` + `docs/MCP.md` 更新完成。
