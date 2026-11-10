// Render scale ("解析度"): texels per page px. Page layout stays in page px (= GUI px in the game); a higher scale only
// gives the pictures scale x scale more texels. Pure helpers shared by the renderer, the exporter and the editor.
import type { RenderScale } from '../model/types';

export const RENDER_SCALES: readonly RenderScale[] = [1, 2, 3, 4];

export function isRenderScale(v: unknown): v is RenderScale {
  return v === 1 || v === 2 || v === 3 || v === 4;
}

/** Throws unless `v` is 1, 2, 3 or 4 (render options are checked, not clamped). */
export function checkRenderScale(v: number): RenderScale {
  if (!isRenderScale(v)) throw new Error(`render scale must be 1, 2, 3 or 4, got ${v}`);
  return v;
}

/**
 * Largest canvas (width x height in texels) we allocate for one page. iOS Safari refuses canvases above 16,777,216 px
 * (4096 x 4096); 16,000,000 keeps a margin. A 1000 x 600 page (the editor's maximum) at 4x is 9,600,000.
 */
export const MAX_CANVAS_PIXELS = 16_000_000;

/** Texels of a w x h page rendered at `scale`. */
export const canvasPixels = (w: number, h: number, scale: number): number => w * scale * (h * scale);

export const fitsCanvas = (w: number, h: number, scale: number): boolean => canvasPixels(w, h, scale) <= MAX_CANVAS_PIXELS;

/** The largest scale <= `scale` whose canvas fits MAX_CANVAS_PIXELS (1 when not even 1x fits). Display only. */
export function fitScale(w: number, h: number, scale: RenderScale): RenderScale {
  for (let s = scale; s > 1; s--) if (fitsCanvas(w, h, s)) return s as RenderScale;
  return 1;
}
