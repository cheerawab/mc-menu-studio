// Wires every mcms.* tool onto an McpServer. Each tool is a thin zod-validated wrapper over a handler in
// src/mcp/handlers/*.ts, which in turn only calls src/core functions. No render/export/validate logic lives here.
// Stage 5: group G (export) completes the tool set (A-G, MCP_PLAN.md §2.3/§8).
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getPage } from '../core/model/ops';
import type { RenderEnv } from '../core/render/types';
import { checkProjectHandler } from './handlers/check';
import {
  addElementHandler, alignElementsHandler, distributeElementsHandler, duplicateElementHandler, moveElementZHandler,
  removeElementHandler, updateElementHandler,
} from './handlers/element';
import { createRenderEnv } from './env';
import { buildProjectExport, writeProjectExport } from './handlers/export';
import { elementTypesInfo, iconsInfo, skinsInfo } from './handlers/introspect';
import {
  addPageHandler, duplicatePageHandler, movePageHandler, pageNotFoundMessage, removePageHandler, updatePageHandler,
} from './handlers/page';
import { defaultPreviewPath, renderGameMockPreview, renderPagePreview, toBase64, writePng } from './handlers/preview';
import { createProjectHandle, getProjectHandle, listTemplates, openProjectHandle, saveProjectHandle } from './handlers/project';
import { imageResult, jsonResult } from './result';
import {
  checkOptionsShape, elementPropsSchema, elementTypeSchema, exportOptionsShape, handleSchema, idSchema, idsSchema,
  pagePropsSchema, renderScaleSchema, skinIdSchema, windowDimSchema,
} from './schemas';
import { ProjectStore } from './state';

const alignModeSchema = z.enum(['left', 'hcenter', 'right', 'top', 'vmiddle', 'bottom']);
const zMoveSchema = z.enum(['up', 'down', 'top', 'bottom']);
const axisSchema = z.enum(['h', 'v']);
const guiScaleSchema = renderScaleSchema;

function requirePageOf(store: ProjectStore, handle: string, pageId: string) {
  const page = getPage(store.get(handle), pageId);
  if (!page) throw new Error(pageNotFoundMessage(pageId));
  return page;
}

export function createServer(store: ProjectStore = new ProjectStore(), env: RenderEnv = createRenderEnv()): McpServer {
  const server = new McpServer({ name: 'mc-menu-studio', version: '0.1.0' });

  // A. project lifecycle ---------------------------------------------------------------------------------------
  server.tool('mcms.project.list_templates', '列出所有內建範本。', {}, async () => jsonResult(listTemplates()));

  server.tool(
    'mcms.project.create',
    '建立一個新專案（空白或範本），寫入一份 *.mcms.json 當作真相來源，回傳 handle。',
    {
      name: z.string().optional(),
      namespace: z.string().optional(),
      skinId: skinIdSchema.optional(),
      fromTemplate: z.string().optional(),
      path: z.string().optional(),
    },
    async (args) => jsonResult(createProjectHandle(store, args)),
  );

  server.tool(
    'mcms.project.open',
    '開啟一份既有的 *.mcms.json 專案檔，回傳 handle。',
    { path: z.string().min(1) },
    async ({ path }) => jsonResult(openProjectHandle(store, path)),
  );

  server.tool(
    'mcms.project.save',
    '把目前的專案狀態寫到檔案（預設寫回原路徑）。',
    { handle: handleSchema, path: z.string().optional() },
    async ({ handle, path }) => jsonResult(saveProjectHandle(store, handle, path)),
  );

  server.tool(
    'mcms.project.get',
    '取得 handle 目前的完整專案狀態，讓 agent 重新對齊。',
    { handle: handleSchema },
    async ({ handle }) => jsonResult(getProjectHandle(store, handle)),
  );

  // B. page editing ---------------------------------------------------------------------------------------------
  server.tool(
    'mcms.page.add',
    '新增一頁。',
    { handle: handleSchema, ...pagePropsSchema.shape, index: z.number().int().nonnegative().optional() },
    async ({ handle, index, ...props }) => jsonResult(addPageHandler(store, handle, props, index)),
  );

  server.tool(
    'mcms.page.update',
    '更新一頁的屬性（檔名、標題、尺寸、背景色、下方按鈕文字）。',
    { handle: handleSchema, pageId: idSchema, patch: pagePropsSchema },
    async ({ handle, pageId, patch }) => jsonResult(updatePageHandler(store, handle, pageId, patch)),
  );

  server.tool(
    'mcms.page.remove',
    '刪除一頁（不能刪除最後一頁）。',
    { handle: handleSchema, pageId: idSchema },
    async ({ handle, pageId }) => jsonResult(removePageHandler(store, handle, pageId)),
  );

  server.tool(
    'mcms.page.duplicate',
    '複製一頁（含所有元件）。',
    { handle: handleSchema, pageId: idSchema },
    async ({ handle, pageId }) => jsonResult(duplicatePageHandler(store, handle, pageId)),
  );

  server.tool(
    'mcms.page.move',
    '搬動一頁到新的順序位置。',
    { handle: handleSchema, pageId: idSchema, toIndex: z.number().int().nonnegative() },
    async ({ handle, pageId, toIndex }) => jsonResult(movePageHandler(store, handle, pageId, toIndex)),
  );

  // C. element editing --------------------------------------------------------------------------------------------
  server.tool(
    'mcms.element.add',
    '在一頁裡新增一個元件。',
    {
      handle: handleSchema, pageId: idSchema, type: elementTypeSchema, props: elementPropsSchema.optional(),
      index: z.number().int().nonnegative().optional(),
    },
    async ({ handle, pageId, type, props, index }) => jsonResult(addElementHandler(store, handle, pageId, type, props ?? {}, index)),
  );

  server.tool(
    'mcms.element.update',
    '更新一個或多個元件的屬性。',
    { handle: handleSchema, pageId: idSchema, ids: idsSchema, patch: elementPropsSchema },
    async ({ handle, pageId, ids, patch }) => jsonResult(updateElementHandler(store, handle, pageId, ids, patch)),
  );

  server.tool(
    'mcms.element.remove',
    '刪除一個或多個元件。',
    { handle: handleSchema, pageId: idSchema, ids: idsSchema },
    async ({ handle, pageId, ids }) => jsonResult(removeElementHandler(store, handle, pageId, ids)),
  );

  server.tool(
    'mcms.element.move_z',
    '調整一個或多個元件的疊放順序（上一層/下一層/最上層/最下層）。',
    { handle: handleSchema, pageId: idSchema, ids: idsSchema, dir: zMoveSchema },
    async ({ handle, pageId, ids, dir }) => jsonResult(moveElementZHandler(store, handle, pageId, ids, dir)),
  );

  server.tool(
    'mcms.element.duplicate',
    '複製一個或多個元件（預設位移 8 px）。',
    { handle: handleSchema, pageId: idSchema, ids: idsSchema, offset: z.number().optional() },
    async ({ handle, pageId, ids, offset }) => jsonResult(duplicateElementHandler(store, handle, pageId, ids, offset)),
  );

  server.tool(
    'mcms.element.align',
    '把多個元件對齊（靠左/水平居中/靠右/靠上/垂直居中/靠下）。',
    { handle: handleSchema, pageId: idSchema, ids: idsSchema, mode: alignModeSchema },
    async ({ handle, pageId, ids, mode }) => jsonResult(alignElementsHandler(store, handle, pageId, ids, mode)),
  );

  server.tool(
    'mcms.element.distribute',
    '把多個元件沿一個軸等距分布（至少 3 個元件才有效果）。',
    { handle: handleSchema, pageId: idSchema, ids: idsSchema, axis: axisSchema },
    async ({ handle, pageId, ids, axis }) => jsonResult(distributeElementsHandler(store, handle, pageId, ids, axis)),
  );

  // D. introspection ----------------------------------------------------------------------------------------------
  server.tool('mcms.schema.element_types', '列出每種元件類型的欄位與預設值。', {}, async () => jsonResult(elementTypesInfo()));
  server.tool('mcms.schema.icons', '列出所有內建圖示 id 與中文標籤。', {}, async () => jsonResult(iconsInfo()));
  server.tool('mcms.schema.skins', '列出所有內建美術風格（skin）。', {}, async () => jsonResult(skinsInfo()));

  // E. checks -------------------------------------------------------------------------------------------------
  server.tool(
    'mcms.check.project',
    '執行專案檢查（含匯出前檢查），error 等級的問題會擋下匯出。',
    { handle: handleSchema, ...checkOptionsShape },
    async ({ handle, mode, commandMode }) => jsonResult(checkProjectHandler(store.get(handle), { mode, commandMode })),
  );

  // F. previews -------------------------------------------------------------------------------------------------
  server.tool(
    'mcms.preview.page',
    '把一頁渲染成 PNG（和編輯器畫面一致）。預設寫檔回路徑；inline=true 時改回傳 base64 圖片。',
    {
      handle: handleSchema, pageId: idSchema, scale: renderScaleSchema.optional(), inline: z.boolean().optional(),
      outPath: z.string().optional(),
    },
    async ({ handle, pageId, scale, inline, outPath }) => {
      const project = store.get(handle);
      const page = requirePageOf(store, handle, pageId);
      const out = renderPagePreview(project, page, env, scale);
      if (inline) return imageResult(toBase64(out.png), 'image/png', { width: out.width, height: out.height });
      const path = writePng(outPath ?? defaultPreviewPath(store.path(handle), page.key, '.png'), out.png);
      return jsonResult({ path, width: out.width, height: out.height });
    },
  );

  server.tool(
    'mcms.preview.game_mock',
    '把一頁渲染成遊戲 Dialog 畫面的模擬截圖（含是否放得下的判定）。預設寫檔回路徑；inline=true 時改回傳 base64 圖片。',
    {
      handle: handleSchema, pageId: idSchema, winW: windowDimSchema, winH: windowDimSchema,
      guiScale: guiScaleSchema, inline: z.boolean().optional(), outPath: z.string().optional(),
    },
    async ({ handle, pageId, winW, winH, guiScale, inline, outPath }) => {
      const project = store.get(handle);
      const page = requirePageOf(store, handle, pageId);
      const win = { id: 'custom', label: `${winW}x${winH}`, w: winW, h: winH };
      const out = renderGameMockPreview(project, page, env, win, guiScale);
      const meta = { width: out.width, height: out.height, fits: out.fits, fitsWidth: out.fitsWidth, fitsHeight: out.fitsHeight, warning: out.warning };
      if (inline) return imageResult(toBase64(out.png), 'image/png', meta);
      const path = writePng(outPath ?? defaultPreviewPath(store.path(handle), page.key, '.mock.png'), out.png);
      return jsonResult({ path, ...meta });
    },
  );

  // G. export ---------------------------------------------------------------------------------------------------
  server.tool(
    'mcms.export.build',
    '在記憶體裡建置匯出結果（不寫檔），回傳統計數字與警告，讓 agent 先檢查再決定是否真的匯出。',
    { handle: handleSchema, options: z.object(exportOptionsShape).partial().optional() },
    async ({ handle, options }) => {
      const build = buildProjectExport(store.get(handle), env, options ?? {});
      return jsonResult({ stats: build.stats, warnings: build.warnings });
    },
  );

  server.tool(
    'mcms.export.write',
    '匯出 resourcepack.zip / datapack.zip / README_zh-TW.txt（+ 可選 autotest.zip）到指定資料夾。',
    { handle: handleSchema, options: z.object(exportOptionsShape).partial().optional(), outDir: z.string().min(1) },
    async ({ handle, options, outDir }) => {
      const build = buildProjectExport(store.get(handle), env, options ?? {});
      const files = await writeProjectExport(build, outDir);
      return jsonResult({ files, stats: build.stats, warnings: build.warnings });
    },
  );

  return server;
}
