// Crisp, integer-only drawing primitives. Everything is made of fillRect calls, so the output is identical
// wherever the same canvas implementation runs, and edges never get anti-aliased.
import { css, mix, parseColor, withAlpha } from './color';
import type { Ctx2D } from './types';

export type Span = [number, number] | null;
export type CornerKind = 'square' | 'round' | 'chamfer' | 'ellipse';
export interface Corner {
  kind: CornerKind;
  r?: number;
}

export const SQUARE: Corner = { kind: 'square' };

export function fill(ctx: Ctx2D, x: number, y: number, w: number, h: number, color: string): void {
  if (w <= 0 || h <= 0) return;
  ctx.fillStyle = css(color);
  ctx.fillRect(x, y, w, h);
}

/** Per-row horizontal inset of a corner of radius r (row 0 = outermost row). */
export function cornerInsets(kind: CornerKind, r: number): number[] {
  if (kind === 'square' || kind === 'ellipse' || r <= 0) return [];
  if (kind === 'chamfer') return Array.from({ length: r }, (_, i) => r - i);
  if (r === 1) return [1];
  return Array.from({ length: r }, (_, i) => {
    const dy = r - i - 0.5;
    return Math.max(0, Math.ceil(r - Math.sqrt(r * r - dy * dy) - 0.2));
  });
}

/** Horizontal span [x0, x1) of each row of a shape of size w x h (relative coordinates). */
export function rowSpans(w: number, h: number, corner: Corner): Span[] {
  const spans: Span[] = new Array(Math.max(0, h)).fill(null);
  if (w <= 0 || h <= 0) return spans;
  if (corner.kind === 'ellipse') {
    const rx = w / 2, ry = h / 2;
    for (let j = 0; j < h; j++) {
      const dy = (j + 0.5 - ry) / ry;
      const t = 1 - dy * dy;
      if (t <= 0) continue;
      const dx = Math.sqrt(t) * rx;
      const x0 = Math.round(rx - dx), x1 = Math.round(rx + dx);
      if (x1 > x0) spans[j] = [x0, x1];
    }
    return spans;
  }
  const r = Math.min(corner.r ?? 0, Math.floor(Math.min(w, h) / 2));
  const ins = cornerInsets(corner.kind, r);
  for (let j = 0; j < h; j++) {
    const a = j < ins.length ? ins[j] : 0;
    const b = h - 1 - j < ins.length ? ins[h - 1 - j] : 0;
    const inset = Math.max(a, b);
    if (inset * 2 < w) spans[j] = [inset, w - inset];
  }
  return spans;
}

type Segs = [number, number][];

function sameSegs(a: Segs, b: Segs): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i][0] !== b[i][0] || a[i][1] !== b[i][1]) return false;
  return true;
}

/** Fills row segments, merging identical consecutive rows into single rects. */
export function fillRows(ctx: Ctx2D, x: number, y: number, rows: Segs[], color: string): void {
  ctx.fillStyle = css(color);
  let start = 0;
  for (let j = 1; j <= rows.length; j++) {
    if (j < rows.length && sameSegs(rows[j], rows[start])) continue;
    for (const [a, b] of rows[start]) if (b > a) ctx.fillRect(x + a, y + start, b - a, j - start);
    start = j;
  }
}

export function fillShape(ctx: Ctx2D, x: number, y: number, w: number, h: number, corner: Corner, color: string): void {
  if (w <= 0 || h <= 0) return;
  fillRows(ctx, x, y, rowSpans(w, h, corner).map((s) => (s ? [s] : [])), color);
}

/** Ring of thickness t following the shape outline. */
export function ringRows(w: number, h: number, corner: Corner, t: number): Segs[] {
  const outer = rowSpans(w, h, corner);
  const innerCorner: Corner = corner.kind === 'ellipse' ? corner : { kind: corner.kind, r: Math.max(0, (corner.r ?? 0) - t) };
  const iw = w - 2 * t, ih = h - 2 * t;
  const inner = iw > 0 && ih > 0 ? rowSpans(iw, ih, innerCorner) : [];
  const rows: Segs[] = [];
  for (let j = 0; j < h; j++) {
    const o = outer[j];
    if (!o) {
      rows.push([]);
      continue;
    }
    const ij = j - t;
    const i = ij >= 0 && ij < ih ? inner[ij] : null;
    if (!i) {
      rows.push([o]);
      continue;
    }
    const segs: Segs = [];
    const ix0 = i[0] + t, ix1 = i[1] + t;
    if (ix0 > o[0]) segs.push([o[0], ix0]);
    if (o[1] > ix1) segs.push([ix1, o[1]]);
    rows.push(segs);
  }
  return rows;
}

export function strokeShape(
  ctx: Ctx2D, x: number, y: number, w: number, h: number, corner: Corner, color: string, t = 1,
): void {
  if (w <= 0 || h <= 0 || t <= 0) return;
  fillRows(ctx, x, y, ringRows(w, h, corner, t), color);
}

/** Linear gradient inside a shape, quantised per row (vertical) or per column (horizontal). */
export function gradientShape(
  ctx: Ctx2D, x: number, y: number, w: number, h: number, corner: Corner,
  from: string, to: string, direction: 'vertical' | 'horizontal',
): void {
  if (w <= 0 || h <= 0) return;
  const spans = rowSpans(w, h, corner);
  if (direction === 'vertical') {
    for (let j = 0; j < h; j++) {
      const s = spans[j];
      if (s) fill(ctx, x + s[0], y + j, s[1] - s[0], 1, mix(from, to, h > 1 ? j / (h - 1) : 0));
    }
    return;
  }
  for (let c = 0; c < w; c++) {
    let top = -1, bottom = -1;
    for (let j = 0; j < h; j++) {
      const s = spans[j];
      if (s && c >= s[0] && c < s[1]) {
        if (top < 0) top = j;
        bottom = j;
      }
    }
    if (top >= 0) fill(ctx, x + c, y + top, 1, bottom - top + 1, mix(from, to, w > 1 ? c / (w - 1) : 0));
  }
}

/** Classic 3D bevel: `hi` on top/left, `lo` on bottom/right, t pixels thick, inside the rect. */
export function bevel(ctx: Ctx2D, x: number, y: number, w: number, h: number, hi: string, lo: string, t = 1): void {
  fill(ctx, x, y, w - t, t, hi);
  fill(ctx, x, y + t, t, h - 2 * t, hi);
  fill(ctx, x + t, y + h - t, w - t, t, lo);
  fill(ctx, x + w - t, y + t, t, h - 2 * t, lo);
}

/** Deterministic hash noise in [0, 1). */
export function hash2(x: number, y: number, seed = 0): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Sprinkles single pixels of `color` over a shape with the given density (0..1). */
export function speckle(
  ctx: Ctx2D, x: number, y: number, w: number, h: number, corner: Corner,
  color: string, density: number, seed: number,
): void {
  const spans = rowSpans(w, h, corner);
  ctx.fillStyle = css(color);
  for (let j = 0; j < h; j++) {
    const s = spans[j];
    if (!s) continue;
    for (let i = s[0]; i < s[1]; i++) if (hash2(i, j, seed) < density) ctx.fillRect(x + i, y + j, 1, 1);
  }
}

/** Horizontal line whose alpha fades towards both ends (used by sci-fi skins). */
export function fadedLine(ctx: Ctx2D, x: number, y: number, w: number, h: number, color: string, steps = 8): void {
  if (w <= 0) return;
  const base = parseColor(color).a;
  const seg = Math.max(1, Math.ceil(w / (steps * 2)));
  for (let i = 0; i < w; i += seg) {
    const c = (i + seg / 2) / w;
    const a = Math.max(0.12, 1 - Math.abs(c - 0.5) * 2);
    fill(ctx, x + i, y, Math.min(seg, w - i), h, withAlpha(color, base * a));
  }
}
