// Pure touch-gesture math for the editor canvas (no DOM): tap / double-tap detection, pinch zoom + two-finger pan,
// the resize handles that stay usable for a finger, and keeping the selection visible when the stage is resized.
// Points are CSS pixels relative to the stage element.
import { HANDLES, MAX_ZOOM, MIN_ZOOM, type Handle } from './geometry';
import type { Rect } from './model/types';

export interface Pt {
  x: number;
  y: number;
}

/** A touch may move this far (CSS px) and still count as a tap. */
export const TAP_SLOP = 8;
/** Two taps closer than this in time (ms) and space (CSS px) form a double tap. */
export const DOUBLE_TAP_MS = 300;
export const DOUBLE_TAP_DIST = 24;
/** Press-and-hold time (ms) that shows a tooltip in the game preview. */
export const LONG_PRESS_MS = 400;
/** Finger-sized hit area (CSS px, independent of zoom) of a resize handle on coarse pointers. */
export const TOUCH_HANDLE_HIT = 28;

// `+ 0` turns -0 into 0 (Math.round(-0.4) is -0).
const round = (v: number) => Math.round(v) + 0;

export const distance = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);
export const midpoint = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** True when a touch that went down at `from` and up at `to` is a tap rather than a drag. */
export const isTap = (from: Pt, to: Pt, slop = TAP_SLOP) => distance(from, to) <= slop;

export interface TapRecord extends Pt {
  /** Event time in ms. */
  t: number;
  /** What was tapped (an element id, or 'empty'); a double tap needs the same target twice. */
  key: string;
}

export function isDoubleTap(prev: TapRecord | null, next: TapRecord, ms = DOUBLE_TAP_MS, dist = DOUBLE_TAP_DIST): boolean {
  if (!prev || prev.key !== next.key) return false;
  const dt = next.t - prev.t;
  return dt >= 0 && dt <= ms && distance(prev, next) <= dist;
}

export interface ViewXform {
  zoom: number;
  panX: number;
  panY: number;
}

export interface PinchStart extends ViewXform {
  /** The two finger positions when the second finger landed. */
  a: Pt;
  b: Pt;
}

/** Whole-number zoom after a pinch from finger distance d0 to d1 (the editor keeps pixels square). */
export function pinchZoom(z0: number, d0: number, d1: number, min = MIN_ZOOM, max = MAX_ZOOM): number {
  const scale = d0 > 0 ? d1 / d0 : 1;
  return Math.min(max, Math.max(min, Math.round(z0 * scale)));
}

/**
 * View for a two-finger gesture: zoom by the change of the finger distance and pan so that the page point that was
 * under the starting midpoint stays under the current midpoint (pinch and two-finger pan in one formula).
 */
export function pinchView(start: PinchStart, a: Pt, b: Pt, min = MIN_ZOOM, max = MAX_ZOOM): ViewXform {
  const zoom = pinchZoom(start.zoom, distance(start.a, start.b), distance(a, b), min, max);
  const m0 = midpoint(start.a, start.b);
  const m1 = midpoint(a, b);
  const px = (m0.x - start.panX) / start.zoom;
  const py = (m0.y - start.panY) / start.zoom;
  return { zoom, panX: round(m1.x - px * zoom), panY: round(m1.y - py * zoom) };
}

/** Pan after a one-finger drag from `from` to `to`. */
export function panBy(panX: number, panY: number, from: Pt, to: Pt): { panX: number; panY: number } {
  return { panX: round(panX + to.x - from.x), panY: round(panY + to.y - from.y) };
}

/**
 * Resize handles that can be shown for an element of w x h screen px when every handle gets a `hit` px square hit
 * area: an edge handle needs room between its two corners, and a tiny element only keeps the bottom-right corner.
 */
export function visibleHandles(w: number, h: number, hit = TOUCH_HANDLE_HIT): Handle[] {
  if (w < hit || h < hit) return ['se'];
  return HANDLES.filter((hd) => {
    if (hd === 'n' || hd === 's') return w >= hit * 2;
    if (hd === 'e' || hd === 'w') return h >= hit * 2;
    return true;
  });
}

/**
 * Pan after the stage changed from `prev` to `next` (e.g. a bottom sheet opened): the view centre stays put, then the
 * view moves just enough to keep `box` (page px, usually the selection) inside the stage, if it fits at all.
 */
export function keepInView(
  view: ViewXform,
  prev: { w: number; h: number },
  next: { w: number; h: number },
  box: Rect | null,
  margin = 8,
): { panX: number; panY: number } {
  let panX = view.panX + (next.w - prev.w) / 2;
  let panY = view.panY + (next.h - prev.h) / 2;
  if (box) {
    const clampAxis = (pan: number, start: number, size: number, stage: number) => {
      const a = pan + start * view.zoom;
      const b = a + size * view.zoom;
      if (b - a > stage - margin * 2) return pan;
      if (a < margin) return pan + (margin - a);
      if (b > stage - margin) return pan - (b - (stage - margin));
      return pan;
    };
    panX = clampAxis(panX, box.x, box.w, next.w);
    panY = clampAxis(panY, box.y, box.h, next.h);
  }
  return { panX: round(panX), panY: round(panY) };
}
