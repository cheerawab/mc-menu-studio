// The one place that moves the canvas view over time: eased tweens (zoom buttons, keys, fit, settle after a gesture),
// smooth wheel zoom, and pinch updates coalesced to one store update per animation frame. Frames are only requested
// while there is work; a new tween, wheel event or cancel() continues from the view on screen (no jump).
import { useEffect, useState } from 'react';
import type { Pt, ViewXform } from '@/core/gestures';
import {
  approachZoom, clampZoom, easeOutCubic, interpolateView, isWholeZoom, restView, sameView, SETTLE_MS, settleZoom,
  WHEEL_IDLE_MS, zoomViewAround,
} from '@/core/viewAnimation';
import { editor } from '../state/store';

export interface AnimatorHost {
  getView(): ViewXform;
  setView(v: ViewXform): void;
  /** Milliseconds (performance.now in the browser). */
  now(): number;
  requestFrame(cb: () => void): number;
  cancelFrame(id: number): void;
  setTimer(cb: () => void, ms: number): number;
  clearTimer(id: number): void;
  /** prefers-reduced-motion: targets are applied at once. */
  reducedMotion(): boolean;
}

const pick = (v: ViewXform): ViewXform => ({ zoom: v.zoom, panX: v.panX, panY: v.panY });

export class ViewAnimator {
  private frame: number | null = null;
  private tween: { from: ViewXform; to: ViewXform; t0: number; ms: number } | null = null;
  /** Wheel zoom: eases toward `zoom` around the stage point `anchor`. */
  private smooth: { zoom: number; anchor: Pt; last: number } | null = null;
  /** Pinch: the latest view, applied on the next frame. */
  private pending: ViewXform | null = null;
  private idleTimer: number | null = null;
  private wheelAnchor: Pt = { x: 0, y: 0 };

  constructor(private readonly host: AnimatorHost) {}

  /** True while a frame is requested (tween, wheel smoothing or a coalesced pinch update). */
  get running(): boolean {
    return this.frame !== null;
  }

  /** Where the view is heading: the end of the running tween / wheel zoom, else the current view. */
  target(): ViewXform {
    if (this.tween) return this.tween.to;
    const v = this.pending ?? pick(this.host.getView());
    return this.smooth ? zoomViewAround(v, this.smooth.zoom, this.smooth.anchor) : v;
  }

  /** Eases (ease-out) from the current view to `to` in `ms`; at once when ms <= 0 or with reduced motion. */
  animateTo(to: ViewXform, ms: number): void {
    this.stop();
    const from = pick(this.host.getView());
    if (ms <= 0 || this.host.reducedMotion() || sameView(from, to)) {
      if (!sameView(from, to, 0)) this.host.setView(pick(to));
      return;
    }
    this.tween = { from, to: pick(to), t0: this.host.now(), ms };
    this.schedule();
  }

  /**
   * Wheel zoom: multiplies the target zoom by `factor` around the stage point `anchor` and eases toward it (a running
   * tween stops where it is); after WHEEL_IDLE_MS without wheel events it settles like a pinch.
   */
  zoomBy(factor: number, anchor: Pt): void {
    const zoom = clampZoom(this.target().zoom * factor);
    this.flushPending();
    this.tween = null;
    this.wheelAnchor = anchor;
    if (this.host.reducedMotion()) {
      this.smooth = null;
      this.host.setView(zoomViewAround(pick(this.host.getView()), zoom, anchor));
    } else {
      this.smooth = { zoom, anchor, last: this.smooth?.last ?? this.host.now() };
      this.schedule();
    }
    this.clearIdle();
    this.idleTimer = this.host.setTimer(() => {
      this.idleTimer = null;
      this.settle(this.wheelAnchor);
    }, WHEEL_IDLE_MS);
  }

  /** Pinch: shows `view` on the next animation frame (many calls in one frame make one store update). */
  follow(view: ViewXform): void {
    this.tween = null;
    this.smooth = null;
    this.clearIdle();
    this.pending = pick(view);
    this.schedule();
  }

  /**
   * End of a pinch or wheel zoom: back inside the zoom limits and onto a whole zoom when it is within 5 % of one
   * (pan rounded), keeping the page point under `anchor` still; other zooms stay as they are.
   */
  settle(anchor: Pt, ms = SETTLE_MS): void {
    this.flushPending();
    this.clearIdle();
    const z = settleZoom(this.target().zoom);
    if (this.smooth && z === this.smooth.zoom && !isWholeZoom(z)) return; // the wheel smoothing ends there anyway
    this.animateTo(restView(zoomViewAround(pick(this.host.getView()), z, anchor)), ms);
  }

  /** Stops where the view is now (a waiting pinch update is applied first). */
  cancel(): void {
    this.stop();
  }

  /** Jumps to where the running animation was heading. */
  finish(): void {
    const to = this.tween || this.smooth ? this.target() : null;
    this.stop();
    if (to) this.host.setView(to);
  }

  dispose(): void {
    this.stop();
  }

  private stop() {
    this.flushPending();
    this.tween = null;
    this.smooth = null;
    this.clearIdle();
    if (this.frame !== null) {
      this.host.cancelFrame(this.frame);
      this.frame = null;
    }
  }

  private flushPending() {
    const v = this.pending;
    this.pending = null;
    if (v && !sameView(pick(this.host.getView()), v, 0)) this.host.setView(v);
  }

  private clearIdle() {
    if (this.idleTimer !== null) this.host.clearTimer(this.idleTimer);
    this.idleTimer = null;
  }

  private schedule() {
    if (this.frame === null) this.frame = this.host.requestFrame(this.tick);
  }

  private tick = () => {
    this.frame = null;
    if (this.pending) {
      this.flushPending();
      return;
    }
    const now = this.host.now();
    if (this.tween) {
      const { from, to, t0, ms } = this.tween;
      const p = (now - t0) / ms;
      if (p >= 1) this.tween = null;
      this.host.setView(p >= 1 ? to : interpolateView(from, to, easeOutCubic(p)));
      if (this.tween) this.schedule();
      return;
    }
    const s = this.smooth;
    if (!s) return;
    const cur = pick(this.host.getView());
    let z = approachZoom(cur.zoom, s.zoom, now - s.last);
    s.last = now;
    const done = Math.abs(Math.log(z / s.zoom)) < 1e-3;
    if (done) {
      z = s.zoom;
      this.smooth = null;
    }
    this.host.setView(zoomViewAround(cur, z, s.anchor));
    if (!done) this.schedule();
  };
}

const browserHost: AnimatorHost = {
  getView: () => editor().view,
  setView: (v) => editor().setView(v),
  now: () => performance.now(),
  requestFrame: (cb) => window.requestAnimationFrame(cb),
  cancelFrame: (id) => window.cancelAnimationFrame(id),
  setTimer: (cb, ms) => window.setTimeout(cb, ms),
  clearTimer: (id) => window.clearTimeout(id),
  reducedMotion: () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
};

/** One ViewAnimator per canvas, stopped on unmount (and usable again after a StrictMode remount). */
export function useViewAnimator(host: AnimatorHost = browserHost): ViewAnimator {
  const [anim] = useState(() => new ViewAnimator(host));
  useEffect(() => () => anim.dispose(), [anim]);
  return anim;
}
