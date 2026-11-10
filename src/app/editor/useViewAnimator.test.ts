// ViewAnimator with a hand-driven clock: frames every 16 ms, timers, no DOM.
import { describe, expect, it } from 'vitest';
import type { ViewXform } from '@/core/gestures';
import { SETTLE_MS, STEP_MS, WHEEL_IDLE_MS } from '@/core/viewAnimation';
import { ViewAnimator, type AnimatorHost } from './useViewAnimator';

function setup(view: ViewXform = { zoom: 1, panX: 0, panY: 0 }, reduced = false) {
  let t = 0, nextId = 1;
  const frames = new Map<number, () => void>();
  const timers = new Map<number, { cb: () => void; at: number }>();
  const state = { view: { ...view }, sets: 0 };
  const host: AnimatorHost = {
    getView: () => state.view,
    setView: (v) => {
      state.view = { ...v };
      state.sets++;
    },
    now: () => t,
    requestFrame: (cb) => {
      frames.set(nextId, cb);
      return nextId++;
    },
    cancelFrame: (id) => frames.delete(id),
    setTimer: (cb, ms) => {
      timers.set(nextId, { cb, at: t + ms });
      return nextId++;
    },
    clearTimer: (id) => timers.delete(id),
    reducedMotion: () => reduced,
  };
  /** One 16 ms frame: due timers, then the requested frame callbacks. */
  const step = () => {
    t += 16;
    for (const [id, tm] of [...timers]) {
      if (tm.at > t) continue;
      timers.delete(id);
      tm.cb();
    }
    const cbs = [...frames.values()];
    frames.clear();
    cbs.forEach((cb) => cb());
  };
  const run = (ms: number) => {
    for (let e = 0; e < ms; e += 16) step();
  };
  return { anim: new ViewAnimator(host), state, step, run, waiting: () => frames.size + timers.size };
}

describe('ViewAnimator', () => {
  it('eases to the target, ends exactly on it and then stops asking for frames', () => {
    const { anim, state, step, run, waiting } = setup({ zoom: 1, panX: 10, panY: 20 });
    const to = { zoom: 3, panX: -40.5, panY: 7 };
    anim.animateTo(to, STEP_MS);
    const zs: number[] = [];
    while (anim.running) {
      step();
      zs.push(state.view.zoom);
    }
    expect(state.view).toEqual(to);
    expect(zs.length).toBeGreaterThan(8); // about STEP_MS / 16 frames
    zs.slice(1).forEach((z, i) => expect(z).toBeGreaterThan(zs[i]));
    expect(zs[0] - 1).toBeGreaterThan(zs[zs.length - 1] - zs[zs.length - 2]); // ease-out: big steps first
    run(200);
    expect(waiting()).toBe(0);
  });

  it('coalesces pinch updates to one store update per frame', () => {
    const { anim, state, step, run, waiting } = setup();
    anim.follow({ zoom: 1.1, panX: 1, panY: 1 });
    anim.follow({ zoom: 1.2, panX: 2, panY: 2 });
    anim.follow({ zoom: 1.3, panX: 3, panY: 3 });
    expect(state.sets).toBe(0);
    step();
    expect(state.sets).toBe(1);
    expect(state.view).toEqual({ zoom: 1.3, panX: 3, panY: 3 });
    expect(waiting()).toBe(0);
    anim.follow({ zoom: 2.97, panX: 0.4, panY: 0 });
    anim.settle({ x: 0, y: 0 }); // applies the waiting update first, then eases to 300 %
    expect(state.view.zoom).toBe(2.97);
    run(SETTLE_MS + 16);
    expect(state.view).toEqual({ zoom: 3, panX: 0, panY: 0 });
  });

  it('wheel: accumulates notches, eases around the anchor, settles after the idle time, then stops', () => {
    const { anim, state, step, run, waiting } = setup({ zoom: 2, panX: 0, panY: 0 });
    const anchor = { x: 100, y: 60 };
    anim.zoomBy(1.2, anchor);
    anim.zoomBy(1.2, anchor);
    expect(anim.target().zoom).toBeCloseTo(2.88, 12);
    step();
    expect(state.view.zoom).toBeGreaterThan(2);
    expect(state.view.zoom).toBeLessThan(2.88);
    expect(state.view.panX + 50 * state.view.zoom).toBeCloseTo(100, 9); // page point (50, 30) stays put
    run(WHEEL_IDLE_MS + SETTLE_MS + 400);
    expect(state.view).toEqual({ zoom: 3, panX: -50, panY: -30 }); // 2.88 is within 5 % of 3
    expect(waiting()).toBe(0);
  });

  it('cancel stops where it is, finish jumps to the target, dispose leaves nothing scheduled', () => {
    const { anim, state, step, run, waiting } = setup();
    anim.animateTo({ zoom: 4, panX: 0, panY: 0 }, STEP_MS);
    step();
    step();
    anim.cancel();
    const z = state.view.zoom;
    run(STEP_MS);
    expect(state.view.zoom).toBe(z);
    expect(waiting()).toBe(0);
    anim.animateTo({ zoom: 4, panX: 0, panY: 0 }, STEP_MS);
    step();
    anim.finish();
    expect(state.view.zoom).toBe(4);
    anim.zoomBy(0.5, { x: 0, y: 0 });
    expect(waiting()).toBe(2); // a frame and the idle timer
    anim.dispose();
    expect(waiting()).toBe(0);
    anim.animateTo({ zoom: 1, panX: 0, panY: 0 }, STEP_MS); // still usable (React StrictMode remounts)
    run(STEP_MS + 16);
    expect(state.view.zoom).toBe(1);
  });

  it('applies targets at once with reduced motion', () => {
    const { anim, state, run, waiting } = setup({ zoom: 1, panX: 0, panY: 0 }, true);
    anim.animateTo({ zoom: 2, panX: 5, panY: 5 }, STEP_MS);
    expect(state.view).toEqual({ zoom: 2, panX: 5, panY: 5 });
    anim.zoomBy(1.45, { x: 0, y: 0 });
    expect(state.view.zoom).toBeCloseTo(2.9, 12);
    expect(waiting()).toBe(1); // only the idle timer
    run(WHEEL_IDLE_MS + 16);
    expect(state.view.zoom).toBe(3);
    expect(waiting()).toBe(0);
  });
});
