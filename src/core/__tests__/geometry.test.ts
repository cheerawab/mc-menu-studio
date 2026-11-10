import { describe, expect, it } from 'vitest';
import {
  alignRects, bbox, clipRect, distributeRects, fitZoom, hitTest, MAX_ZOOM, MIN_ZOOM, rectPatchFor, resizeRect, snapMoveDelta, snapValue,
  zoomAround,
} from '../geometry';
import { createElement } from '../model/defaults';
import { emptyHistory, record, redo, undo } from '../history';

describe('snapping', () => {
  it('snaps values to steps', () => {
    expect(snapValue(5.4, 1)).toBe(5);
    expect(snapValue(5, 4)).toBe(4);
    expect(snapValue(6, 4)).toBe(8);
    expect(snapValue(-3, 8)).toBe(-0);
  });
  it('snaps a group move so its bbox lands on the grid', () => {
    const rects = [{ x: 3, y: 5, w: 10, h: 10 }, { x: 20, y: 9, w: 4, h: 4 }];
    expect(snapMoveDelta(rects, 6.2, 0.4, 8)).toEqual({ dx: 5, dy: 3 });
    expect(snapMoveDelta(rects, 1.6, -1.4, 1)).toEqual({ dx: 2, dy: -1 });
  });
  it('resizes from any handle, snapping the moved edges', () => {
    const r = { x: 10, y: 10, w: 20, h: 20 };
    expect(resizeRect(r, 'se', 5, 7, { snap: 4 })).toEqual({ x: 10, y: 10, w: 26, h: 26 });
    expect(resizeRect(r, 'nw', -3, 50, { snap: 1 })).toEqual({ x: 7, y: 29, w: 23, h: 1 });
    expect(resizeRect(r, 'e', -100, 0)).toEqual({ x: 10, y: 10, w: 1, h: 20 });
    expect(resizeRect({ x: 0, y: 0, w: 20, h: 10 }, 'se', 20, 0, { keepAspect: true })).toEqual({ x: 0, y: 0, w: 40, h: 20 });
  });
  it('keeps derived sizes for slot grids and icons', () => {
    const grid = createElement('slotgrid', { x: 10, y: 10, cols: 2, rows: 1, slotSize: 18, gap: 0 });
    expect(rectPatchFor(grid, { x: 10, y: 10, w: 75, h: 30 }, 'se')).toMatchObject({ cols: 4, rows: 2 });
    const icon = createElement('icon', { x: 50, y: 50 });
    expect(rectPatchFor(icon, { x: 20, y: 20, w: 46, h: 46 }, 'nw')).toEqual({ x: 18, y: 18, scale: 3 });
  });
});

describe('alignment and distribution', () => {
  const rs = [{ x: 0, y: 0, w: 10, h: 10 }, { x: 30, y: 20, w: 20, h: 6 }, { x: 70, y: 5, w: 10, h: 30 }];
  it('aligns to the selection bbox or a target', () => {
    expect(alignRects(rs, 'left').map((p) => p.x)).toEqual([0, 0, 0]);
    expect(alignRects(rs, 'right').map((p) => p.x)).toEqual([70, 60, 70]);
    expect(alignRects(rs, 'vmiddle').map((p) => p.y)).toEqual([13, 15, 3]);
    expect(alignRects([rs[0]], 'hcenter', { x: 0, y: 0, w: 100, h: 100 })[0]).toEqual({ x: 45, y: 0 });
  });
  it('distributes with equal gaps', () => {
    const uneven = [{ x: 0, y: 0, w: 10, h: 5 }, { x: 50, y: 0, w: 20, h: 5 }, { x: 70, y: 0, w: 10, h: 5 }];
    expect(distributeRects(uneven, 'h').map((p) => p.x)).toEqual([0, 30, 70]);
    expect(distributeRects(rs.slice(0, 2), 'h')).toEqual([{ x: 0, y: 0 }, { x: 30, y: 20 }]);
  });
  it('computes bbox, clipping, hit tests and zoom', () => {
    expect(bbox(rs)).toEqual({ x: 0, y: 0, w: 80, h: 35 });
    expect(clipRect({ x: -5, y: 90, w: 20, h: 20 }, 100, 100)).toEqual({ x: 0, y: 90, w: 15, h: 10 });
    expect(clipRect({ x: 200, y: 0, w: 5, h: 5 }, 100, 100)).toBeNull();
    const a = createElement('panel', { x: 0, y: 0, w: 50, h: 50 });
    const b = createElement('button', { x: 10, y: 10, w: 20, h: 20 });
    expect(hitTest([a, b], 15, 15)?.id).toBe(b.id);
    expect(hitTest([a, { ...b, hidden: true }], 15, 15)?.id).toBe(a.id);
    expect(hitTest([a, { ...b, locked: true }], 15, 15)?.id).toBe(a.id);
    expect(fitZoom(1000, 800, 320, 200)).toBe(2);
    expect(zoomAround(0, 0, 100, 100, 2, 4)).toEqual({ panX: -100, panY: -100 });
    expect(zoomAround(0.5, 0, 101, 0, 2, 3)).toEqual({ panX: -49.75, panY: 0 }); // not rounded
  });
  it('fits a page: whole zooms when they fit, 100 % with a small margin, else the exact fraction', () => {
    expect(fitZoom(872, 790, 340, 210)).toBe(2); // desktop stage, "lobby"
    expect(fitZoom(4000, 4000, 100, 100)).toBe(MAX_ZOOM);
    expect(fitZoom(370, 710, 340, 210, 48, 12)).toBe(1); // phone: no whole zoom with 48 px, but 100 % with 12 px
    expect(fitZoom(370, 710, 480, 270, 48, 12)).toBeCloseTo((370 - 24) / 480, 12); // 72 %: wider than the phone
    expect(fitZoom(824, 260, 480, 270, 48, 12)).toBeCloseTo((260 - 24) / 270, 12); // landscape: height decides
    expect(fitZoom(100, 100, 900, 600)).toBe(MIN_ZOOM);
    expect(fitZoom(0, 0, 340, 210)).toBe(1); // nothing to fit into
  });
});

describe('history', () => {
  it('undoes and redoes, clearing redo on new changes', () => {
    let h = emptyHistory<number>();
    let v = 0;
    for (let i = 1; i <= 150; i++) {
      h = record(h, v, { now: i * 5000 });
      v = i;
    }
    expect(h.past).toHaveLength(150);
    for (let i = 0; i < 120; i++) {
      const u = undo(h, v)!;
      h = u.history;
      v = u.value;
    }
    expect(v).toBe(30);
    const r = redo(h, v)!;
    expect(r.value).toBe(31);
    h = record(r.history, r.value, { now: 1e9 });
    expect(h.future).toHaveLength(0);
  });
  it('coalesces changes with the same key and caps the stack', () => {
    let h = emptyHistory<string>();
    h = record(h, 'a', { key: 'x', now: 1000 });
    h = record(h, 'b', { key: 'x', now: 1500 });
    expect(h.past).toEqual(['a']);
    h = record(h, 'c', { key: 'x', now: 4000 });
    expect(h.past).toEqual(['a', 'c']);
    let big = emptyHistory<number>();
    for (let i = 0; i < 300; i++) big = record(big, i, { now: i * 5000 });
    expect(big.past).toHaveLength(200);
    expect(big.past[0]).toBe(100);
  });
});
