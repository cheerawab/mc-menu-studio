// Node RenderEnv for the MCP server: same pattern as scripts/demo-export.ts.
import { createCanvas } from '@napi-rs/canvas';
import type { CanvasLike, RenderEnv } from '../core/render/types';

export function createRenderEnv(): RenderEnv {
  return { createCanvas: (w, h) => createCanvas(w, h) as unknown as CanvasLike };
}
