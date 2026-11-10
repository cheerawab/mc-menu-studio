// Small CallToolResult builders shared by every tool registration in server.ts.
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export function jsonResult(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data) }] };
}

export function imageResult(base64: string, mimeType: string, meta: unknown): CallToolResult {
  return {
    content: [
      { type: 'image', data: base64, mimeType },
      { type: 'text', text: JSON.stringify(meta) },
    ],
  };
}
