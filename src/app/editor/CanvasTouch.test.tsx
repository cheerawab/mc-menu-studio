// @vitest-environment jsdom
// Touch on the canvas (simulated pointer events, pointerType "touch"), the selection bar, the floating zoom buttons
// and the touch reorder buttons, in the compact layout (mocked matchMedia: 390 x 844, coarse pointer).
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_ZOOM } from '@/core/geometry';
import { visibleHandles } from '@/core/gestures';
import type { Element as El, Id } from '@/core/model/types';
import { TEMPLATES } from '@/core/templates';
import { FIT_MS, SETTLE_MS, STEP_MS, WHEEL_IDLE_MS } from '@/core/viewAnimation';
import { mobile, resetMobile } from '../state/mobile';
import { createEditorStore, currentPage, editor, setEditorStore, type EditorStore } from '../state/store';
import { installMatchMedia } from './mediaMock';

let media: ReturnType<typeof installMatchMedia>;
let store: EditorStore;

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement['getContext'];
  HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,';
  Element.prototype.setPointerCapture = () => {};
  if (!window.requestAnimationFrame) window.requestAnimationFrame = (cb) => window.setTimeout(() => cb(0), 0);
  if (!window.cancelAnimationFrame) window.cancelAnimationFrame = (id) => window.clearTimeout(id);
});

beforeEach(() => {
  vi.useFakeTimers(); // animation frames, performance.now and timers advance only through frames()
  media = installMatchMedia({ width: 390, height: 844, coarse: true });
  resetMobile();
  store = createEditorStore(TEMPLATES[0].build()); // "lobby": 340 x 210, buttons at (22,138) and (130,138)
  setEditorStore(store);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  media.restore();
});

afterAll(() => setEditorStore(null));

async function mount() {
  const { default: Editor } = await import('./Editor');
  render(<Editor />);
  // jsdom has no layout: the stage sits at (0, 0); with zoom 1 and no pan, client px = page px
  act(() => editor().setView({ zoom: 1, panX: 0, panY: 0 }));
}

const stage = () => document.querySelector('[data-stage]') as HTMLElement;
type PtrType = 'pointerDown' | 'pointerMove' | 'pointerUp';
function touch(type: PtrType, id: number, x: number, y: number, target: Element = stage()) {
  fireEvent[type](target, { pointerId: id, pointerType: 'touch', isPrimary: id === 1, clientX: x, clientY: y, button: 0, buttons: type === 'pointerUp' ? 0 : 1 });
}
function tap(x: number, y: number, id = 1) {
  touch('pointerDown', id, x, y);
  touch('pointerUp', id, x, y);
}
const els = () => currentPage(editor()).elements;
const byId = (id: Id) => els().find((e) => e.id === id) as El;
// the two "lobby" buttons (top-most at their centres)
const buttonA = () => els()[10];
const buttonB = () => els()[15];
const centre = (e: El) => ({ x: e.x + e.w / 2, y: e.y + e.h / 2 });
const OUTSIDE = { x: 380, y: 300 }; // empty stage, outside the 340 x 210 page
/** Runs `ms` of fake time: animation frames every 16 ms, timers. */
const frames = (ms = 16) => act(() => {
  vi.advanceTimersByTime(ms);
});
const zoomReadout = () => screen.getByRole('toolbar', { name: '縮放' }).textContent;
const pageCanvas = () => document.querySelector('[data-stage] canvas') as HTMLCanvasElement;

describe('touch on the canvas', () => {
  it('tap selects, tap on empty space deselects, double tap on empty space fits', async () => {
    await mount();
    const a = buttonA();
    tap(centre(a).x, centre(a).y);
    expect(editor().selection).toEqual([a.id]);
    tap(OUTSIDE.x, OUTSIDE.y);
    expect(editor().selection).toEqual([]);

    act(() => editor().setView({ zoom: 4, panX: 7, panY: 9 }));
    tap(-20, -30); // above and left of the page
    tap(-16, -28);
    expect(editor().view.zoom).toBe(4); // eased from the next frame on, no jump
    frames(FIT_MS / 2);
    expect(editor().view.zoom).toBeGreaterThan(1);
    expect(editor().view.zoom).toBeLessThan(4);
    frames(FIT_MS);
    expect(editor().view).toMatchObject({ zoom: 1, panX: -170, panY: -105 }); // a 0 x 0 jsdom stage fits at 100 %
  });

  it('one finger drags an element (one undo step) or pans on empty space', async () => {
    await mount();
    const a = buttonA();
    const c = centre(a);
    const past = editor().history.past.length;
    touch('pointerDown', 1, c.x, c.y);
    touch('pointerMove', 1, c.x + 5, c.y); // inside the tap slop: nothing moves yet
    expect(byId(a.id).x).toBe(a.x);
    touch('pointerMove', 1, c.x + 20, c.y + 10);
    touch('pointerUp', 1, c.x + 20, c.y + 10);
    expect(byId(a.id)).toMatchObject({ x: a.x + 20, y: a.y + 10 });
    expect(editor().history.past.length).toBe(past + 1);

    touch('pointerDown', 1, OUTSIDE.x, OUTSIDE.y);
    touch('pointerMove', 1, OUTSIDE.x - 30, OUTSIDE.y + 12);
    touch('pointerUp', 1, OUTSIDE.x - 30, OUTSIDE.y + 12);
    expect(editor().view).toMatchObject({ zoom: 1, panX: -30, panY: 12 });
    expect(editor().selection).toEqual([a.id]); // a pan is not a tap: the selection stays
  });

  it('a second finger drops the drag without an undo step and starts a pinch', async () => {
    await mount();
    const a = buttonA();
    const c = centre(a);
    const past = editor().history.past.length;
    touch('pointerDown', 1, c.x, c.y);
    touch('pointerMove', 1, c.x + 30, c.y);
    expect(byId(a.id).x).toBe(a.x + 30);
    touch('pointerDown', 2, c.x + 130, c.y);
    expect(byId(a.id).x).toBe(a.x);
    expect(editor().gestureBase).toBeNull();
    touch('pointerUp', 2, c.x + 130, c.y);
    touch('pointerMove', 1, c.x + 60, c.y); // the remaining finger is ignored until it lifts
    touch('pointerUp', 1, c.x + 60, c.y);
    expect(byId(a.id).x).toBe(a.x);
    expect(editor().history.past.length).toBe(past);
  });

  it('pinch zoom follows the fingers (one store update per frame) and settles on a whole zoom', async () => {
    await mount();
    let updates = 0;
    const unsubscribe = store.subscribe((s, prev) => {
      if (s.view !== prev.view) updates++;
    });
    touch('pointerDown', 1, 100, 400);
    touch('pointerDown', 2, 200, 400);
    touch('pointerMove', 2, 250, 400);
    touch('pointerMove', 2, 300, 400);
    expect(editor().view.zoom).toBe(1); // waits for the next animation frame
    frames();
    expect(updates).toBe(1); // two moves, one update
    // page point (150, 400) under the start midpoint is now under the new midpoint (200, 400)
    expect(editor().view).toMatchObject({ zoom: 2, panX: -100, panY: -400 });
    // 40 small moves: a new zoom on every frame instead of whole steps
    const seen = new Set<number>();
    for (let i = 1; i <= 40; i++) {
      touch('pointerMove', 2, 300 + i * 2.4, 400);
      frames();
      seen.add(editor().view.zoom);
    }
    unsubscribe();
    expect(seen.size).toBe(40);
    expect(editor().view.zoom).toBeCloseTo(2.96, 9);
    // lifting a finger: 2.96 is within 5 % of 3, so it eases to 3 around the last midpoint (248, 400)
    touch('pointerUp', 2, 396, 400);
    frames(SETTLE_MS / 2);
    expect(editor().view.zoom).toBeGreaterThan(2.96);
    expect(editor().view.zoom).toBeLessThan(3);
    frames(SETTLE_MS);
    expect(editor().view).toMatchObject({ zoom: 3, panX: -202, panY: -800 }); // 150 * 3 - 202 = 248: still under it
    touch('pointerUp', 1, 100, 400);
    expect(editor().selection).toEqual([]);
    expect(zoomReadout()).toContain('300%');
  });

  it('a pinch keeps a zoom that is not near a whole one, and springs back from past 800 %', async () => {
    await mount();
    touch('pointerDown', 1, 100, 400);
    touch('pointerDown', 2, 200, 400);
    touch('pointerMove', 2, 340, 400); // 2.4x
    frames();
    touch('pointerUp', 2, 340, 400);
    touch('pointerUp', 1, 100, 400);
    frames(SETTLE_MS * 2);
    expect(editor().view.zoom).toBeCloseTo(2.4, 9);
    expect(zoomReadout()).toContain('240%');

    act(() => editor().setView({ zoom: 4 }));
    touch('pointerDown', 1, 100, 400);
    touch('pointerDown', 2, 200, 400);
    touch('pointerMove', 2, 500, 400); // 4x: 1600 % without the limit
    frames();
    expect(editor().view.zoom).toBeGreaterThan(MAX_ZOOM);
    expect(editor().view.zoom).toBeLessThan(MAX_ZOOM * 1.1);
    touch('pointerUp', 2, 500, 400);
    touch('pointerUp', 1, 100, 400);
    frames(SETTLE_MS + 32);
    expect(editor().view.zoom).toBe(MAX_ZOOM);
  });

  it('多選: a tap adds or removes an element', async () => {
    await mount();
    const a = buttonA(), b = buttonB();
    tap(centre(a).x, centre(a).y);
    fireEvent.click(screen.getByRole('button', { name: '多選' }));
    expect(screen.getByRole('button', { name: '多選' }).getAttribute('aria-pressed')).toBe('true');
    tap(centre(b).x, centre(b).y);
    expect(editor().selection).toEqual([a.id, b.id]);
    tap(centre(a).x, centre(a).y);
    expect(editor().selection).toEqual([b.id]);
    tap(centre(b).x, centre(b).y);
    expect(editor().selection).toEqual([]);
    expect(mobile().multiSelect).toBe(false); // ends with the selection
  });

  it('shows finger-sized resize handles and resizes with one finger', async () => {
    await mount();
    const a = buttonA(); // 80 x 18 at zoom 1: too low for the side handles
    act(() => editor().select([a.id]));
    const handles = [...document.querySelectorAll<HTMLElement>('[data-handle]')];
    expect(handles.map((h) => h.dataset.handle)).toEqual(visibleHandles(80, 18));
    expect(handles[0].className).toContain('h-7 w-7');
    act(() => editor().setView({ zoom: 4 })); // 320 x 72: all eight
    const se = document.querySelector('[data-handle="se"]')!;
    expect(document.querySelectorAll('[data-handle]')).toHaveLength(8);
    touch('pointerDown', 1, 400, 100, se);
    touch('pointerMove', 1, 440, 100);
    touch('pointerUp', 1, 440, 100);
    expect(byId(a.id).w).toBe(a.w + 10);
  });

  it('floating zoom buttons step along the zoom ladder, eased', async () => {
    await mount();
    expect(screen.queryByRole('toolbar', { name: '畫布工具列' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '放大' }));
    expect(editor().view.zoom).toBe(1);
    frames(STEP_MS / 2);
    const mid = editor().view.zoom;
    expect(mid).toBeGreaterThan(1);
    expect(mid).toBeLessThan(1.5);
    fireEvent.click(screen.getByRole('button', { name: '放大' })); // while it runs: one stop past 150 %
    frames(STEP_MS + 32);
    expect(editor().view.zoom).toBe(2);
    expect(zoomReadout()).toContain('200%');
    fireEvent.click(screen.getByRole('button', { name: '縮小' }));
    frames(STEP_MS + 32);
    expect(editor().view.zoom).toBe(1.5);
    act(() => editor().setView({ zoom: 5 }));
    fireEvent.click(screen.getByRole('button', { name: '符合視窗' }));
    frames(FIT_MS + 32);
    expect(editor().view).toMatchObject({ zoom: 1, panX: -170, panY: -105 });
  });

  it('= + - keys step the ladder and 0 fits, eased', async () => {
    await mount();
    fireEvent.keyDown(window, { key: '=' });
    frames(STEP_MS + 32);
    expect(editor().view.zoom).toBe(1.5);
    fireEvent.keyDown(window, { key: '-' });
    fireEvent.keyDown(window, { key: '-' }); // two quick presses: two stops
    frames(STEP_MS + 32);
    expect(editor().view.zoom).toBeCloseTo(2 / 3, 12);
    expect(zoomReadout()).toContain('67%');
    fireEvent.keyDown(window, { key: '0' });
    frames(FIT_MS + 32);
    expect(editor().view.zoom).toBe(1);
  });

  it('a pointer-down or a wheel event stops a running zoom where it is', async () => {
    await mount();
    fireEvent.click(screen.getByRole('button', { name: '放大' }));
    frames(48);
    const z = editor().view.zoom;
    expect(z).toBeGreaterThan(1);
    touch('pointerDown', 1, OUTSIDE.x, OUTSIDE.y);
    frames(STEP_MS * 2);
    expect(editor().view.zoom).toBe(z);
    touch('pointerUp', 1, OUTSIDE.x, OUTSIDE.y);

    fireEvent.click(screen.getByRole('button', { name: '放大' }));
    frames(48);
    const z2 = editor().view.zoom;
    fireEvent.wheel(stage(), { deltaY: -100, clientX: 0, clientY: 0 });
    expect(editor().view.zoom).toBe(z2); // continues from here on the next frame
    frames();
    expect(editor().view.zoom).toBeGreaterThan(z2);
  });

  it('applies zoom targets at once with prefers-reduced-motion', async () => {
    media.restore();
    media = installMatchMedia({ width: 390, height: 844, coarse: true, reducedMotion: true });
    await mount();
    fireEvent.click(screen.getByRole('button', { name: '放大' }));
    expect(editor().view.zoom).toBe(1.5);
    tap(-20, -30);
    tap(-16, -28);
    expect(editor().view).toMatchObject({ zoom: 1, panX: -170, panY: -105 });
    fireEvent.wheel(stage(), { deltaY: -100, clientX: 0, clientY: 0 });
    expect(editor().view.zoom).toBeCloseTo(1.2, 9);
  });

  it('renders the page at the project 解析度 (canvas = page px x scale) and is crisp only from zoom x dpr >= scale', async () => {
    await mount();
    const canvas = pageCanvas();
    expect([canvas.width, canvas.height]).toEqual([340 * 2, 210 * 2]); // template default 2x
    expect(parseFloat(canvas.style.width)).toBe(340); // CSS size stays page px x zoom
    expect(canvas.className).not.toContain('pixelated'); // zoom 1 on a 1x screen: 2 texels per device px
    act(() => editor().setView({ zoom: 2 }));
    expect(pageCanvas().className).toContain('pixelated');
    act(() => editor().commit((p) => ({ ...p, settings: { ...p.settings, renderScale: 4 } })));
    expect([pageCanvas().width, pageCanvas().height]).toEqual([340 * 4, 210 * 4]);
    expect(pageCanvas().className).not.toContain('pixelated');
    act(() => editor().setView({ zoom: 4 }));
    expect(pageCanvas().className).toContain('pixelated');
  });

  it('shows a whole percent and scales the page smoothly only below 100 % (1x)', async () => {
    await mount();
    act(() => editor().commit((p) => ({ ...p, settings: { ...p.settings, renderScale: 1 } })));
    expect(pageCanvas().width).toBe(340);
    expect(pageCanvas().className).toContain('pixelated');
    act(() => editor().setView({ zoom: 0.47 })); // 0.47 * 100 = 47.00000000000001
    expect(zoomReadout()).toBe('47%');
    expect(pageCanvas().className).not.toContain('pixelated');
    expect(parseFloat(pageCanvas().style.width)).toBeCloseTo(340 * 0.47, 6); // fractional CSS size, same bitmap
    act(() => media.set({ width: 1440, height: 900, coarse: false }));
    act(() => editor().setView({ zoom: 0.47 }));
    expect(screen.getByRole('toolbar', { name: '畫布工具列' }).textContent).toContain('47%');
  });
});

describe('wheel zoom', () => {
  it('ctrl + wheel (trackpad pinch) zooms continuously around the cursor and settles on a whole zoom', async () => {
    await mount();
    act(() => editor().setView({ zoom: 2, panX: 0, panY: 0 }));
    const seen = new Set<number>();
    for (let i = 0; i < 17; i++) {
      fireEvent.wheel(stage(), { deltaY: -4, ctrlKey: true, clientX: 100, clientY: 50 });
      frames();
      seen.add(editor().view.zoom);
      const v = editor().view; // page point (50, 25) stays under the cursor
      expect(v.panX + 50 * v.zoom).toBeCloseTo(100, 6);
      expect(v.panY + 25 * v.zoom).toBeCloseTo(50, 6);
    }
    expect(seen.size).toBe(17);
    expect(editor().view.zoom).toBeLessThan(2 * Math.exp(0.68)); // eased: still on its way to 3.95
    frames(WHEEL_IDLE_MS + SETTLE_MS + 64);
    expect(editor().view).toMatchObject({ zoom: 4, panX: -100, panY: -50 }); // 3.95 is within 5 % of 4
  });

  it('a mouse-wheel notch zooms 1.2x eased; Shift + wheel pans', async () => {
    await mount();
    fireEvent.wheel(stage(), { deltaY: -100, clientX: 0, clientY: 0 });
    frames();
    expect(editor().view.zoom).toBeGreaterThan(1);
    expect(editor().view.zoom).toBeLessThan(1.2);
    frames(WHEEL_IDLE_MS + 600);
    expect(editor().view.zoom).toBeCloseTo(1.2, 9); // not near a whole zoom: stays
    for (let i = 0; i < 5; i++) fireEvent.wheel(stage(), { deltaY: -100, clientX: 0, clientY: 0 });
    frames(WHEEL_IDLE_MS + 600);
    expect(editor().view.zoom).toBe(3); // 1.2^6 = 2.99 settles on 3
    const { panX, panY } = editor().view;
    fireEvent.wheel(stage(), { deltaY: 30, shiftKey: true });
    expect(editor().view).toMatchObject({ zoom: 3, panX: panX - 30, panY });
  });
});

describe('selection bar', () => {
  it('nudges by the chosen step, duplicates, reorders and deletes', async () => {
    await mount();
    expect(screen.queryByRole('toolbar', { name: '選取工具列' })).toBeNull();
    const a = buttonA();
    act(() => editor().select([a.id]));
    const bar = () => within(screen.getByRole('toolbar', { name: '選取工具列' }));
    fireEvent.click(bar().getByRole('button', { name: '往右' }));
    expect(byId(a.id).x).toBe(a.x + 1);
    fireEvent.click(bar().getByRole('button', { name: '移動距離 1 像素' }));
    fireEvent.click(bar().getByRole('button', { name: '往下' }));
    expect(byId(a.id).y).toBe(a.y + 8);
    fireEvent.click(bar().getByRole('button', { name: '移動距離 8 像素' }));
    fireEvent.click(bar().getByRole('button', { name: '往左' }));
    fireEvent.click(bar().getByRole('button', { name: '往上' }));
    expect(byId(a.id)).toMatchObject({ x: a.x + 1 - 16, y: a.y + 8 - 16 });
    fireEvent.click(bar().getByRole('button', { name: '移動距離 16 像素' }));
    expect(mobile().nudgeStep).toBe(1);

    const n = els().length;
    fireEvent.click(bar().getByRole('button', { name: '複製' }));
    expect(els()).toHaveLength(n + 1);
    const copy = editor().selection[0];
    expect(copy).not.toBe(a.id);
    const at = (id: Id) => els().findIndex((e) => e.id === id);
    act(() => editor().select([a.id]));
    const i = at(a.id);
    fireEvent.click(bar().getByRole('button', { name: '上移' }));
    expect(at(a.id)).toBe(i + 1);
    fireEvent.click(bar().getByRole('button', { name: '下移' }));
    expect(at(a.id)).toBe(i);
    fireEvent.click(bar().getByRole('button', { name: '刪除' }));
    expect(els()).toHaveLength(n);
    expect(els().some((e) => e.id === a.id)).toBe(false);
    expect(screen.queryByRole('toolbar', { name: '選取工具列' })).toBeNull();
  });

  it('opens the align row and hides while a sheet is open', async () => {
    await mount();
    act(() => editor().select([buttonA().id]));
    fireEvent.click(screen.getByRole('button', { name: '對齊與排列' }));
    fireEvent.click(within(screen.getByRole('toolbar', { name: '對齊與排列' })).getByRole('button', { name: '對齊頁面左緣' }));
    expect(byId(buttonA().id).x).toBe(0);
    fireEvent.click(screen.getByRole('tab', { name: '屬性' }));
    expect(screen.queryByRole('toolbar', { name: '選取工具列' })).toBeNull();
    expect(screen.getByRole('textbox', { name: '元件名稱' })).toBeTruthy();
  });
});

describe('touch reorder buttons', () => {
  it('moves the selected layer up and down', async () => {
    await mount();
    const a = buttonA();
    const at = () => els().findIndex((e) => e.id === a.id);
    const i = at();
    act(() => editor().select([a.id]));
    fireEvent.click(screen.getByRole('tab', { name: '圖層' }));
    const sheet = within(screen.getByRole('dialog', { name: '圖層' }));
    fireEvent.click(sheet.getByRole('button', { name: '圖層上移' }));
    expect(at()).toBe(i + 1);
    fireEvent.click(sheet.getByRole('button', { name: '圖層下移' }));
    fireEvent.click(sheet.getByRole('button', { name: '圖層下移' }));
    expect(at()).toBe(i - 1);
    // rows are not HTML5-draggable on touch
    expect(sheet.getAllByRole('option')[0].getAttribute('draggable')).toBeNull();
  });

  it('moves the current page up and down', async () => {
    await mount();
    const [p0, p1] = editor().project.pages;
    fireEvent.click(screen.getByRole('tab', { name: '頁面' }));
    const sheet = within(screen.getByRole('dialog', { name: '頁面' }));
    expect((sheet.getByRole('button', { name: '頁面上移' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(sheet.getByRole('button', { name: '頁面下移' }));
    expect(editor().project.pages.map((p) => p.id)).toEqual([p1.id, p0.id]);
    expect(editor().pageId).toBe(p0.id);
    fireEvent.click(sheet.getByRole('button', { name: '頁面上移' }));
    expect(editor().project.pages.map((p) => p.id)).toEqual([p0.id, p1.id]);
  });

  it('a touch tablet in the medium tier also gets the selection bar', async () => {
    media.set({ width: 1024, height: 768, coarse: true });
    const errors = vi.spyOn(console, 'error');
    await mount();
    expect(document.querySelector('[data-layout]')?.getAttribute('data-layout')).toBe('medium');
    act(() => editor().select([buttonA().id]));
    expect(screen.getByRole('toolbar', { name: '選取工具列' })).toBeTruthy();
    expect(screen.getByRole('toolbar', { name: '畫布工具列' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '圖層上移' })).toBeTruthy();
    expect(errors).not.toHaveBeenCalled();
  });
});
