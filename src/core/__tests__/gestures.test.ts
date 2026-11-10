import { describe, expect, it } from 'vitest';
import {
  DOUBLE_TAP_MS, isDoubleTap, isTap, keepInView, panBy, pinchView, pinchZoom, TAP_SLOP, TOUCH_HANDLE_HIT, visibleHandles,
} from '../gestures';
import { HANDLES, MAX_ZOOM, MIN_ZOOM } from '../geometry';

describe('tap and double tap', () => {
  it('tells taps from drags by the slop', () => {
    expect(isTap({ x: 10, y: 10 }, { x: 10 + TAP_SLOP, y: 10 })).toBe(true);
    expect(isTap({ x: 10, y: 10 }, { x: 16, y: 16 })).toBe(false); // 8.5 px
  });

  it('needs the same target, a short pause and a small distance', () => {
    const a = { t: 1000, x: 50, y: 50, key: 'empty' };
    expect(isDoubleTap(null, a)).toBe(false);
    expect(isDoubleTap(a, { ...a, t: 1000 + DOUBLE_TAP_MS, x: 60 })).toBe(true);
    expect(isDoubleTap(a, { ...a, t: 1000 + DOUBLE_TAP_MS + 1 })).toBe(false);
    expect(isDoubleTap(a, { ...a, t: 1100, x: 90 })).toBe(false);
    expect(isDoubleTap(a, { ...a, t: 1100, key: 'el-1' })).toBe(false);
    expect(isDoubleTap(a, { ...a, t: 900 })).toBe(false);
  });
});

describe('pinch', () => {
  it('zooms in whole steps and clamps', () => {
    expect(pinchZoom(2, 100, 200)).toBe(4);
    expect(pinchZoom(2, 100, 120)).toBe(2); // 2.4 rounds back to 2
    expect(pinchZoom(2, 100, 130)).toBe(3);
    expect(pinchZoom(4, 100, 1000)).toBe(MAX_ZOOM);
    expect(pinchZoom(2, 100, 10)).toBe(MIN_ZOOM);
    expect(pinchZoom(3, 0, 50)).toBe(3);
  });

  it('keeps the page point under the fingers and pans with two fingers', () => {
    const start = { a: { x: 100, y: 100 }, b: { x: 200, y: 100 }, zoom: 1, panX: 0, panY: 0 };
    // spread to twice the distance around the same midpoint: page point (150, 100) stays at (150, 100)
    expect(pinchView(start, { x: 50, y: 100 }, { x: 250, y: 100 })).toEqual({ zoom: 2, panX: -150, panY: -100 });
    // same distance, both fingers 30 px right and 20 px down: pure pan
    expect(pinchView(start, { x: 130, y: 120 }, { x: 230, y: 120 })).toEqual({ zoom: 1, panX: 30, panY: 20 });
    // zoom and move at once
    expect(pinchView(start, { x: 100, y: 100 }, { x: 300, y: 100 })).toEqual({ zoom: 2, panX: -100, panY: -100 });
  });

  it('pans by the finger delta with whole pixels', () => {
    expect(panBy(10, 20, { x: 0.4, y: 0 }, { x: 5.9, y: -3.2 })).toEqual({ panX: 16, panY: 17 });
    expect(panBy(0, 0, { x: 1, y: 1 }, { x: 0.8, y: 0.8 })).toEqual({ panX: 0, panY: 0 });
  });
});

describe('touch resize handles', () => {
  it('shows all eight on large elements', () => {
    expect(visibleHandles(200, 120)).toEqual([...HANDLES]);
  });
  it('drops edge handles that would overlap the corners', () => {
    expect(visibleHandles(TOUCH_HANDLE_HIT * 2 - 1, 200)).toEqual(['nw', 'ne', 'e', 'se', 'sw', 'w']);
    expect(visibleHandles(200, 40)).toEqual(['nw', 'n', 'ne', 'se', 's', 'sw']);
  });
  it('keeps only the bottom-right corner on tiny elements', () => {
    expect(visibleHandles(20, 200)).toEqual(['se']);
    expect(visibleHandles(12, 12)).toEqual(['se']);
  });
});

describe('keepInView', () => {
  const view = { zoom: 2, panX: 40, panY: 60 };
  it('keeps the view centre when the stage shrinks and grows', () => {
    expect(keepInView(view, { w: 390, h: 600 }, { w: 390, h: 300 }, null)).toEqual({ panX: 40, panY: -90 });
    expect(keepInView(view, { w: 390, h: 300 }, { w: 390, h: 600 }, null)).toEqual({ panX: 40, panY: 210 });
  });
  it('brings the selection back into the smaller stage', () => {
    // after the centre shift (panY -90) the box (page y 200..230) is at screen y 310..370, below the 300 px stage:
    // the view moves up until the box ends 8 px above the bottom edge
    const r = keepInView(view, { w: 390, h: 600 }, { w: 390, h: 300 }, { x: 10, y: 200, w: 20, h: 30 });
    expect(r.panX).toBe(40);
    expect(r.panY + (200 + 30) * 2).toBe(300 - 8);
  });
  it('leaves a selection that cannot fit', () => {
    expect(keepInView(view, { w: 390, h: 600 }, { w: 390, h: 300 }, { x: 0, y: 0, w: 10, h: 400 })).toEqual({ panX: 40, panY: -90 });
  });
});
