// Wires every mcms.* tool onto an McpServer. Each tool is a thin zod-validated wrapper over a handler in
// src/mcp/handlers/*.ts, which in turn only calls src/core functions. No render/export/validate logic lives here.
// Stage 3: groups B (pages), C (elements) and D (introspection) join group A. E-G (checks, previews, export)
// follow in the next stages (MCP_PLAN.md §2.3/§8).
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  addElementHandler, alignElementsHandler, distributeElementsHandler, duplicateElementHandler, moveElementZHandler,
  removeElementHandler, updateElementHandler,
} from './handlers/element';
import { elementTypesInfo, iconsInfo, skinsInfo } from './handlers/introspect';
import { addPageHandler, duplicatePageHandler, movePageHandler, removePageHandler, updatePageHandler } from './handlers/page';
import { createProjectHandle, getProjectHandle, listTemplates, openProjectHandle, saveProjectHandle } from './handlers/project';
import { jsonResult } from './result';
import { elementPropsSchema, elementTypeSchema, handleSchema, idSchema, idsSchema, pagePropsSchema, skinIdSchema } from './schemas';
import { ProjectStore } from './state';

const alignModeSchema = z.enum(['left', 'hcenter', 'right', 'top', 'vmiddle', 'bottom']);
const zMoveSchema = z.enum(['up', 'down', 'top', 'bottom']);
const axisSchema = z.enum(['h', 'v']);

export function createServer(store: ProjectStore = new ProjectStore()): McpServer {
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

  return server;
}
