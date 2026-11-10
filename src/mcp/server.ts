// Wires every mcms.* tool onto an McpServer. Each tool is a thin wrapper over a handler in
// src/mcp/handlers/*.ts, which in turn only calls src/core functions. No render/export/validate logic lives here.
// Stage 1: only the project-template listing tool, to prove the server boots and an MCP client can connect.
// More groups (A-G, see MCP_PLAN.md §2.3) are added in the following stages.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { listTemplates } from './handlers/project';
import { jsonResult } from './result';

export function createServer(): McpServer {
  const server = new McpServer({ name: 'mc-menu-studio', version: '0.1.0' });

  server.tool('mcms.project.list_templates', '列出所有內建範本。', {}, async () => jsonResult(listTemplates()));

  return server;
}
