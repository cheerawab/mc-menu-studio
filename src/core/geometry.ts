// Integer geometry helpers: snapping, moving, resizing, alignment, distribution, hit testing; canvas zoom range and fit.
import { clamp } from './model/defaults';
import type { Element, Rect } from './model/types';

export type SnapStep = 1 | 2 | 4 | 8;
export const SNAP_STEPS: readonly SnapStep[] = [1, 2, 4, 8];
/** Canvas zoom range: 25 % (a page wider than a phone can be seen whole) to 800 %. */
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 8;

export function snapValue(v: number, step: number): number {
  if (step <= 1) return Math.round(v);
  return Math.round(v / step) * step;
}

export function bbox(rects: readonly Rect[]): Rect | null {
  if (!rects.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rects) {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    y1 = Math.max(y1, r.y + r.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function containsPoint(r: Rect, x: number, y: number): boolean {
  return x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
}

/** Clips a rect to [0,0,w,h]; returns null if nothing is left. */
export function clipRect(r: Rect, w: number, h: number): Rect | null {
  const x0 = Math.max(0, r.x), y0 = Math.max(0, r.y);
  const x1 = Math.min(w, r.x + r.w), y1 = Math.min(h, r.y + r.h);
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

/** Normalised rect from two corner points (any order). */
export function rectFromPoints(ax: number, ay: number, bx: number, by: number): Rect {
  return { x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay) };
}

/** Top-most visible element under (x, y). Locked elements are skipped unless includeLocked. */
export function hitTest(elements: readonly Element[], x: number, y: number, includeLocked = false): Element | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if (el.hidden || (el.locked && !includeLocked)) continue;
    if (containsPoint(el, x, y)) return el;
  }
  return null;
}

/**
 * Snapped delta for moving a group: the group's bounding box top-left lands on the snap grid.
 * dx/dy are raw (fractional) page-pixel deltas.
 */
export function snapMoveDelta(rects: readonly Rect[], dx: number, dy: number, step: number): { dx: number; dy: number } {
  const b = bbox(rects);
  if (!b) return { dx: 0, dy: 0 };
  return { dx: snapValue(b.x + dx, step) - b.x, dy: snapValue(b.y + dy, step) - b.y };
}

export type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
export const HANDLES: readonly Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

export interface ResizeOptions {
  snap?: number;
  min?: number;
  keepAspect?: boolean;
}

/** Resizes `orig` by dragging `handle` by (dx, dy). Moved edges snap to the grid; opposite edges stay put. */
export function resizeRect(orig: Rect, handle: Handle, dx: number, dy: number, opts: ResizeOptions = {}): Rect {
  const step = opts.snap ?? 1;
  const min = Math.max(1, opts.min ?? 1);
  let left = orig.x, top = orig.y, right = orig.x + orig.w, bottom = orig.y + orig.h;
  if (handle.includes('w')) left = Math.min(snapValue(left + dx, step), right - min);
  if (handle.includes('e')) right = Math.max(snapValue(right + dx, step), left + min);
  if (handle.includes('n')) top = Math.min(snapValue(top + dy, step), bottom - min);
  if (handle.includes('s')) bottom = Math.max(snapValue(bottom + dy, step), top + min);
  if (opts.keepAspect && handle.length === 2 && orig.w > 0 && orig.h > 0) {
    const ratio = orig.w / orig.h;
    let w = right - left, h = bottom - top;
    if (w / orig.w >= h / orig.h) h = Math.max(min, Math.round(w / ratio));
    else w = Math.max(min, Math.round(h * ratio));
    if (handle.includes('w')) left = right - w; else right = left + w;
    if (handle.includes('n')) top = bottom - h; else bottom = top + h;
  }
  return { x: left, y: top, w: right - left, h: bottom - top };
}

/**
 * Applies a target rect to an element, honouring derived sizes (slot grids snap to whole slots,
 * icons to whole 16 px scales). `handle` tells which edges are anchored.
 */
export function rectPatchFor(el: Element, r: Rect, handle?: Handle): Partial<Element> {
  if (el.type === 'slotgrid') {
    const pitch = el.slotSize + el.gap;
    const cols = clamp(Math.round((r.w + el.gap) / pitch), 1, 40);
    const rows = clamp(Math.round((r.h + el.gap) / pitch), 1, 30);
    const w = cols * pitch - el.gap, h = rows * pitch - el.gap;
    return { ...anchored(r, w, h, handle), cols, rows } as Partial<Element>;
  }
  if (el.type === 'icon') {
    const scale = clamp(Math.round(Math.max(r.w, r.h) / 16), 1, 8);
    return { ...anchored(r, 16 * scale, 16 * scale, handle), scale } as Partial<Element>;
  }
  return { x: r.x, y: r.y, w: r.w, h: r.h };
}

function anchored(r: Rect, w: number, h: number, handle?: Handle) {
  return {
    x: handle?.includes('w') ? r.x + r.w - w : r.x,
    y: handle?.includes('n') ? r.y + r.h - h : r.y,
  };
}

export type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vmiddle' | 'bottom';

/** New top-left positions (same order as input) aligning rects to `target` (default: their bounding box). */
export function alignRects(rects: readonly Rect[], mode: AlignMode, target?: Rect): { x: number; y: number }[] {
  const t = target ?? bbox(rects);
  if (!t) return [];
  return rects.map((r) => {
    switch (mode) {
      case 'left': return { x: t.x, y: r.y };
      case 'hcenter': return { x: Math.round(t.x + (t.w - r.w) / 2), y: r.y };
      case 'right': return { x: t.x + t.w - r.w, y: r.y };
      case 'top': return { x: r.x, y: t.y };
      case 'vmiddle': return { x: r.x, y: Math.round(t.y + (t.h - r.h) / 2) };
      case 'bottom': return { x: r.x, y: t.y + t.h - r.h };
    }
  });
}

/** Equal gaps between rects along an axis; the outer-most two stay where they are. Same order as input. */
export function distributeRects(rects: readonly Rect[], axis: 'h' | 'v'): { x: number; y: number }[] {
  const out = rects.map((r) => ({ x: r.x, y: r.y }));
  if (rects.length < 3) return out;
  const pos = (r: Rect) => (axis === 'h' ? r.x : r.y);
  const size = (r: Rect) => (axis === 'h' ? r.w : r.h);
  const order = rects.map((r, i) => ({ r, i })).sort((a, b) => pos(a.r) - pos(b.r) || a.i - b.i);
  const first = order[0].r, last = order[order.length - 1].r;
  const span = pos(last) + size(last) - pos(first);
  const total = order.reduce((s, o) => s + size(o.r), 0);
  const gap = (span - total) / (order.length - 1);
  let cursor = pos(first);
  order.forEach((o, k) => {
    const p = k === order.length - 1 ? pos(last) : Math.round(cursor);
    if (axis === 'h') out[o.i].x = p; else out[o.i].y = p;
    cursor += size(o.r) + gap;
  });
  return out;
}

/**
 * Zoom that shows a w x h page inside a viewW x viewH stage: the largest whole zoom (1..MAX_ZOOM) that leaves `margin`
 * around the page; a page that does not fit that way at 100 % stays at 100 % if it fits with `minMargin`, otherwise it
 * gets the exact fractional zoom (>= MIN_ZOOM) that leaves `minMargin`. An empty stage gives 1.
 */
export function fitZoom(viewW: number, viewH: number, w: number, h: number, margin = 48, minMargin = 24): number {
  if (!(viewW > 0 && viewH > 0 && w > 0 && h > 0)) return 1;
  const z = Math.floor(Math.min((viewW - margin * 2) / w, (viewH - margin * 2) / h));
  if (z >= 1) return Math.min(z, MAX_ZOOM);
  const tight = Math.min((viewW - minMargin * 2) / w, (viewH - minMargin * 2) / h);
  return tight >= 1 ? 1 : clamp(tight, MIN_ZOOM, 1);
}

/** Pan so that the page point under the stage point (cx, cy) stays put when zooming from z0 to z1 (not rounded). */
export function zoomAround(panX: number, panY: number, cx: number, cy: number, z0: number, z1: number) {
  return { panX: cx - ((cx - panX) * z1) / z0 + 0, panY: cy - ((cy - panY) * z1) / z0 + 0 };
}
