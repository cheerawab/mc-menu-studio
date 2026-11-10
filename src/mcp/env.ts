// Node RenderEnv for the MCP server: same pattern as scripts/demo-export.ts.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import type { CanvasLike, RenderEnv } from '../core/render/types';

// Previews are the agent's only visual feedback, and this product's whole point is CJK (繁體中文) menus. Headless
// @napi-rs/canvas does not load the OS font files by default, and the installed CJK family is usually named
// "Noto Sans CJK TC", not the "Noto Sans TC" / "PingFang TC" the default font stack asks for, so every Chinese glyph
// renders as a tofu box. We therefore register an available CJK font file under each family name the default stack
// (model/defaults.ts DEFAULT_FONT_STACK) requests. Best-effort and idempotent: on a box with
// no CJK font installed, rendering still works, just without Chinese glyphs.

// Family names the default stack wants (keep in sync with DEFAULT_FONT_STACK in src/core/model/defaults.ts).
const CJK_STACK_FAMILIES = ['PingFang TC', 'Noto Sans TC', 'Microsoft JhengHei', 'Heiti TC'];

/** Finds an installed Traditional-Chinese-capable font file via fontconfig; null if none / fontconfig absent. */
function findCjkFontFile(): string | null {
  for (const query of ['Noto Sans CJK TC', 'Noto Sans TC', ':lang=zh-tw', ':lang=zh']) {
    try {
      const out = execFileSync('fc-match', ['-f', '%{file}', query], { encoding: 'utf8', timeout: 3000 }).trim();
      if (out && existsSync(out)) return out;
    } catch {
      // fc-match missing or query failed; try the next one
    }
  }
  return null;
}

let fontsLoaded = false;
export function ensureSystemFonts(): void {
  if (fontsLoaded) return;
  fontsLoaded = true;
  try {
    const cjk = findCjkFontFile();
    if (cjk) for (const family of CJK_STACK_FAMILIES) GlobalFonts.registerFromPath(cjk, family);
  } catch {
    // best-effort: previews fall back to whatever families are bundled with @napi-rs/canvas
  }
}

export function createRenderEnv(): RenderEnv {
  ensureSystemFonts();
  return { createCanvas: (w, h) => createCanvas(w, h) as unknown as CanvasLike };
}
