// Wires every mcms.* tool onto an McpServer. Each tool is a thin zod-validated wrapper over a handler in
// src/mcp/handlers/*.ts, which in turn only calls src/core functions. No render/export/validate logic lives here.
// Stage 2: group A (project lifecycle), backed by the file-is-truth ProjectStore. More groups (B-G, see
// MCP_PLAN.md §2.3) are added in the following stages.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createProjectHandle, getProjectHandle, listTemplates, openProjectHandle, saveProjectHandle } from './handlers/project';
import { jsonResult } from './result';
import { handleSchema, skinIdSchema } from './schemas';
import { ProjectStore } from './state';

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

  return server;
}
