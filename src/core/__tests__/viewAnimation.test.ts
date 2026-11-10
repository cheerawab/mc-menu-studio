import { describe, expect, it } from 'vitest';
import { MAX_ZOOM, MIN_ZOOM } from '../geometry';
import {
  approachZoom, crispAt, easeOutCubic, interpolateView, isWholeZoom, ladderStep, restView, rubberBand, settleZoom,
  WHEEL_NOTCH, wheelZoomFactor, ZOOM_LADDER, zoomViewAround,
} from '../viewAnimation';

/** Stage point where page point (px, py) is drawn. */
const screenOf = (v: { zoom: number; panX: number; panY: number }, px: number, py: number) => ({ x: v.panX + px * v.zoom, y: v.panY + py * v.zoom });

describe('zoom ladder', () => {
  it('steps between the stops and stays at the ends', () => {
    expect(ZOOM_LADDER[0]).toBe(MIN_ZOOM);
    expect(ZOOM_LADDER[ZOOM_LADDER.length - 1]).toBe(MAX_ZOOM);
    expect(ladderStep(1, 1)).toBe(1.5);
    expect(ladderStep(1, -1)).toBeCloseTo(2 / 3, 12);
    expect(ladderStep(2, 1)).toBe(3);
    expect(ladderStep(6, 1)).toBe(8);
    expect(ladderStep(MAX_ZOOM, 1)).toBe(MAX_ZOOM);
    expect(ladderStep(MIN_ZOOM, -1)).toBe(MIN_ZOOM);
    expect(ladderStep(0.5, -1)).toBeCloseTo(1 / 3, 12);
  });

  it('goes to the next stop above or below a fractional zoom', () => {
    expect(ladderStep(2.4, 1)).toBe(3);
    expect(ladderStep(2.4, -1)).toBe(2);
    expect(ladderStep(0.72, 1)).toBe(1);
    expect(ladderStep(0.72, -1)).toBeCloseTo(2 / 3, 12);
    expect(ladderStep(7.3, 1)).toBe(8);
    expect(ladderStep(7.3, -1)).toBe(6);
    expect(ladderStep(0.3334, 1)).toBe(0.5); // 33.34 % counts as the 33 % stop
    expect(ladderStep(2.9995, 1)).toBe(4);
  });
});

describe('settle', () => {
  it('snaps to a whole zoom within 5 %, keeps other zooms, clamps', () => {
    expect(settleZoom(2.96)).toBe(3);
    expect(settleZoom(3.14)).toBe(3);
    expect(settleZoom(2.7)).toBe(2.7);
    expect(settleZoom(1.04)).toBe(1);
    expect(settleZoom(0.97)).toBe(1); // just under 100 % comes back to sharp 100 %
    expect(settleZoom(0.94)).toBe(0.94);
    expect(settleZoom(1.5)).toBe(1.5);
    expect(settleZoom(7.7)).toBe(8);
    expect(settleZoom(8.6)).toBe(MAX_ZOOM);
    expect(settleZoom(0.2)).toBe(MIN_ZOOM);
  });

  it('rounds the pan only at whole zooms', () => {
    expect(isWholeZoom(3)).toBe(true);
    expect(isWholeZoom(0.5)).toBe(false);
    expect(restView({ zoom: 3, panX: 10.4, panY: -0.4 })).toEqual({ zoom: 3, panX: 10, panY: 0 });
    expect(restView({ zoom: 2.5, panX: 10.4, panY: -0.4 })).toEqual({ zoom: 2.5, panX: 10.4, panY: -0.4 });
  });

  it('rubber-bands smoothly past the limits', () => {
    expect(rubberBand(3, MIN_ZOOM, MAX_ZOOM, 0.1)).toBe(3);
    expect(rubberBand(20, MIN_ZOOM, MAX_ZOOM)).toBe(MAX_ZOOM); // no overshoot: a plain clamp
    const zs = [8.01, 8.4, 9, 12, 40, 1e6].map((z) => rubberBand(z, MIN_ZOOM, MAX_ZOOM, 0.1));
    zs.forEach((z, i) => {
      expect(z).toBeGreaterThan(i ? zs[i - 1] : MAX_ZOOM);
      expect(z).toBeLessThan(MAX_ZOOM * 1.1);
    });
    expect(rubberBand(8.001, MIN_ZOOM, MAX_ZOOM, 0.1)).toBeCloseTo(8.001, 5); // slope 1 at the limit: no jump
    expect(rubberBand(0, MIN_ZOOM, MAX_ZOOM, 0.1)).toBeCloseTo(MIN_ZOOM / 1.1, 12);
  });
});

describe('easing and interpolation', () => {
  it('eases out from 0 to 1', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(-1)).toBe(0);
    expect(easeOutCubic(2)).toBe(1);
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5); // fast start, slow end
    expect(easeOutCubic(0.6)).toBeGreaterThan(easeOutCubic(0.5));
  });

  it('starts and ends exactly on the views', () => {
    const a = { zoom: 4, panX: 7, panY: 9 }, b = { zoom: 1, panX: -170, panY: -105 };
    expect(interpolateView(a, b, 0)).toEqual(a);
    expect(interpolateView(a, b, 1)).toEqual(b);
    const mid = interpolateView(a, b, 0.5);
    expect(mid.zoom).toBeCloseTo(2, 12); // geometric: halfway between 4 and 1 is 2
  });

  it('keeps the anchor of a zoom still on every frame', () => {
    const from = { zoom: 1.3, panX: 12.5, panY: -40 };
    const anchor = { x: 180, y: 260 };
    const to = zoomViewAround(from, 5, anchor);
    const page = { x: (anchor.x - from.panX) / from.zoom, y: (anchor.y - from.panY) / from.zoom };
    for (const e of [0.1, 0.25, 0.5, 0.8, 0.99]) {
      const v = interpolateView(from, to, e);
      expect(screenOf(v, page.x, page.y).x).toBeCloseTo(anchor.x, 9);
      expect(screenOf(v, page.x, page.y).y).toBeCloseTo(anchor.y, 9);
    }
    // equal zooms: a straight pan
    expect(interpolateView({ zoom: 2, panX: 0, panY: 0 }, { zoom: 2, panX: 100, panY: -50 }, 0.25)).toEqual({ zoom: 2, panX: 25, panY: -12.5 });
  });
});

describe('wheel', () => {
  it('is symmetric and monotonic, one notch at most per event', () => {
    for (const [mode, ctrl] of [[0, true], [0, false], [1, false]] as const) {
      let prev = Infinity;
      for (let d = -300; d <= 300; d += 1) {
        const f = wheelZoomFactor(d, mode, ctrl);
        expect(f).toBeLessThanOrEqual(prev);
        expect(f * wheelZoomFactor(-d, mode, ctrl)).toBeCloseTo(1, 12);
        expect(f).toBeLessThanOrEqual(WHEEL_NOTCH + 1e-12);
        expect(f).toBeGreaterThanOrEqual(1 / WHEEL_NOTCH - 1e-12);
        prev = f;
      }
    }
    expect(wheelZoomFactor(-100)).toBeCloseTo(WHEEL_NOTCH, 12); // mouse notch zooms in by 1.2
    expect(wheelZoomFactor(3, 1)).toBeCloseTo(1 / WHEEL_NOTCH, 12); // Firefox lines
    expect(wheelZoomFactor(-4, 0, true)).toBeCloseTo(Math.exp(0.04), 12); // trackpad pinch
    expect(wheelZoomFactor(0, 0, true)).toBe(1);
  });

  it('eases toward the target without passing it', () => {
    expect(approachZoom(2, 4, 0)).toBe(2);
    const z1 = approachZoom(2, 4, 16);
    const z2 = approachZoom(z1, 4, 16);
    expect(z1).toBeGreaterThan(2);
    expect(z2).toBeGreaterThan(z1);
    expect(z2).toBeLessThan(4);
    expect(approachZoom(4, 2, 70)).toBeCloseTo(2 * Math.pow(2, Math.exp(-1)), 12); // one time constant in log scale
    expect(approachZoom(2, 4, 2000)).toBeCloseTo(4, 9);
  });
});

it('uses nearest-neighbour scaling only while the page is magnified on the device', () => {
  expect(crispAt(1)).toBe(true);
  expect(crispAt(2.5)).toBe(true);
  expect(crispAt(0.72)).toBe(false);
  expect(crispAt(0.72, 3)).toBe(true); // 2.16 device px per page px on a 3x phone screen
  expect(crispAt(0.5, 2)).toBe(true);
  expect(crispAt(0.25, 2)).toBe(false);
  // with a render scale: crisp once a texel covers at least one device pixel (zoom x dpr >= scale)
  expect([crispAt(1, 1, 2), crispAt(1, 2, 2), crispAt(2, 1, 2), crispAt(1.5, 2, 3), crispAt(0.72, 3, 2), crispAt(0.72, 3, 3)]).toEqual([
    false, true, true, true, true, false,
  ]);
  expect(crispAt(1, 1, 1)).toBe(crispAt(1));
});
