// Smooth-zoom math for the editor canvas (no DOM): the zoom ladder of the +/- buttons, settling on whole zoom levels,
// the rubber band of a pinch beyond the limits, easing, view interpolation, the wheel zoom factor and the smoothing of
// wheel zoom. A view { zoom, panX, panY } draws page point p at stage px (pan + p * zoom).
import { MAX_ZOOM, MIN_ZOOM, zoomAround } from './geometry';
import type { Pt, ViewXform } from './gestures';

/** Stops of the zoom buttons and the + / - keys (readout: 25 %, 33 %, 50 %, 67 %, 100 % ... 800 %). */
export const ZOOM_LADDER: readonly number[] = [0.25, 1 / 3, 0.5, 2 / 3, 1, 1.5, 2, 3, 4, 5, 6, 8];
/** Zooms closer than this count as equal (ladder steps, disabled zoom buttons). */
export const ZOOM_EPS = 1e-3;
/** After a pinch or wheel zoom, a zoom within this fraction of a whole number >= 1 settles on it (square pixels). */
export const SETTLE_TOLERANCE = 0.05;
/** While the fingers are down a pinch may stretch this fraction beyond MIN_ZOOM / MAX_ZOOM; it springs back on release. */
export const PINCH_OVERSHOOT = 0.1;

/** Animation lengths (ms): settle after a gesture, one ladder step, fit to the window. */
export const SETTLE_MS = 120;
export const STEP_MS = 180;
export const FIT_MS = 220;
/** Wheel zoom eases toward its target with this time constant (ms) and settles after this long without wheel events. */
export const WHEEL_TAU_MS = 70;
export const WHEEL_IDLE_MS = 150;
/** One mouse-wheel notch zooms by this factor. */
export const WHEEL_NOTCH = 1.2;
/** A pixel-mode wheel event with |deltaY| at least this large is a mouse-wheel notch. */
export const WHEEL_NOTCH_DELTA = 50;
/** ctrl + wheel is a trackpad pinch (Chrome, Edge, Firefox): zoom by exp(-deltaY * k) follows the fingers. */
export const WHEEL_PINCH_K = 0.01;
/** Other small wheel deltas (two-finger scroll, smooth wheels): 100 px of scrolling is about one notch. */
export const WHEEL_SCROLL_K = 0.002;

export const clampZoom = (z: number, min = MIN_ZOOM, max = MAX_ZOOM) => Math.min(max, Math.max(min, z));

/** Whole zoom levels >= 1: every page pixel is a whole number of screen pixels. */
export function isWholeZoom(z: number): boolean {
  const n = Math.round(z);
  return n >= 1 && Math.abs(z - n) < 1e-9;
}

/** The next ladder stop above (dir 1) or below (dir -1) `zoom`; at the ends the zoom stays. */
export function ladderStep(zoom: number, dir: 1 | -1, ladder: readonly number[] = ZOOM_LADDER): number {
  if (dir > 0) return ladder.find((s) => s > zoom + ZOOM_EPS) ?? Math.max(zoom, ladder[ladder.length - 1]);
  for (let i = ladder.length - 1; i >= 0; i--) if (ladder[i] < zoom - ZOOM_EPS) return ladder[i];
  return Math.min(zoom, ladder[0]);
}

/** Where a pinch or wheel zoom comes to rest: inside the limits, and on the nearest whole zoom >= 1 within `tol` of it. */
export function settleZoom(zoom: number, tol = SETTLE_TOLERANCE, min = MIN_ZOOM, max = MAX_ZOOM): number {
  const z = clampZoom(zoom, min, max);
  const n = Math.round(z);
  return n >= 1 && Math.abs(z - n) <= tol * n ? clampZoom(n, min, max) : z;
}

/**
 * Clamps a zoom to [min, max]; with `overshoot` > 0 it stretches past a limit with growing resistance instead (in log
 * scale, slope 1 at the limit), never reaching max * (1 + overshoot) or min / (1 + overshoot).
 */
export function rubberBand(z: number, min = MIN_ZOOM, max = MAX_ZOOM, overshoot = 0): number {
  if (z >= min && z <= max) return z;
  if (!(overshoot > 0)) return clampZoom(z, min, max);
  const lim = Math.log1p(overshoot);
  const damp = (o: number) => lim * (1 - lim / (o + lim)); // o in [0, inf] -> [0, lim)
  return z > max ? max * Math.exp(damp(Math.log(z / max))) : min / Math.exp(damp(Math.log(min / Math.max(z, 0))));
}

export function easeOutCubic(t: number): number {
  const u = 1 - Math.min(1, Math.max(0, t));
  return 1 - u * u * u;
}

/**
 * The view at progress e (0..1) from `from` to `to`. The zoom changes geometrically (even speed for the eye) and the
 * pan keeps one stage point still: the fixed point of the change, i.e. the anchor of a zoom made with zoomAround; with
 * equal zooms the pan moves in a straight line. e <= 0 gives `from`, e >= 1 exactly `to`.
 */
export function interpolateView(from: ViewXform, to: ViewXform, e: number): ViewXform {
  if (e <= 0) return { zoom: from.zoom, panX: from.panX, panY: from.panY };
  if (e >= 1) return { zoom: to.zoom, panX: to.panX, panY: to.panY };
  const r = to.zoom / from.zoom;
  const same = Math.abs(1 - r) < 1e-9;
  const zoom = same ? from.zoom + (to.zoom - from.zoom) * e : from.zoom * Math.pow(r, e);
  // pan = from.pan + (to.pan - from.pan) * f with f = (z0 - z) / (z0 - z1): every frame is a zoom around the fixed point
  const f = same ? e : (1 - Math.pow(r, e)) / (1 - r);
  return { zoom, panX: from.panX + (to.panX - from.panX) * f, panY: from.panY + (to.panY - from.panY) * f };
}

/** The view at `zoom` that keeps the page point under the stage point `anchor` where it is (pan not rounded). */
export function zoomViewAround(view: ViewXform, zoom: number, anchor: Pt): ViewXform {
  return { zoom, ...zoomAround(view.panX, view.panY, anchor.x, anchor.y, view.zoom, zoom) };
}

/** A view at rest: at a whole zoom the pan is rounded to whole stage px, so page pixels stay sharp. */
export function restView(v: ViewXform): ViewXform {
  if (!isWholeZoom(v.zoom)) return { zoom: v.zoom, panX: v.panX, panY: v.panY };
  return { zoom: Math.round(v.zoom), panX: Math.round(v.panX) + 0, panY: Math.round(v.panY) + 0 };
}

export function sameView(a: ViewXform, b: ViewXform, eps = 1e-6): boolean {
  return Math.abs(a.zoom - b.zoom) <= eps && Math.abs(a.panX - b.panX) <= eps && Math.abs(a.panY - b.panY) <= eps;
}

/**
 * Zoom factor of one wheel event (negative deltaY zooms in). A mouse-wheel notch (line / page mode, or |deltaY| >=
 * WHEEL_NOTCH_DELTA) is WHEEL_NOTCH; ctrl + small deltas (trackpad pinch) exp(-deltaY * WHEEL_PINCH_K); other small
 * deltas exp(-deltaY * WHEEL_SCROLL_K). One event never zooms more than one notch.
 */
export function wheelZoomFactor(deltaY: number, deltaMode = 0, ctrlKey = false): number {
  if (!deltaY) return 1;
  const notch = Math.log(WHEEL_NOTCH);
  const step = deltaMode !== 0 || Math.abs(deltaY) >= WHEEL_NOTCH_DELTA
    ? notch
    : Math.min(notch, Math.abs(deltaY) * (ctrlKey ? WHEEL_PINCH_K : WHEEL_SCROLL_K));
  return Math.exp(deltaY < 0 ? step : -step);
}

/**
 * Wheel smoothing: after dt ms the zoom has covered 1 - exp(-dt / tau) of its way to `target`, measured in log scale
 * (so zooming in and out feel alike). Never passes the target.
 */
export function approachZoom(cur: number, target: number, dt: number, tau = WHEEL_TAU_MS): number {
  if (!(dt > 0) || cur === target) return cur;
  return target * Math.pow(cur / target, Math.exp(-dt / tau));
}

/**
 * Nearest-neighbour scaling while every texel of the page bitmap covers at least one device pixel: zoom x
 * devicePixelRatio >= scale, where `scale` = texels per page px (the project's 解析度). E.g. 1x at 50 % on a 2x screen,
 * 2x at 100 % on a 2x screen or at 200 % on a 1x screen. Below that the bitmap really shrinks on the device and the
 * browser's smooth scaling looks better (a 2x page at 100 % on a 1x screen shows anti-aliased text, not dropped texels).
 */
export const crispAt = (zoom: number, dpr = 1, scale = 1) => (zoom * dpr) / scale >= 1 - 1e-9;
