// @vitest-environment jsdom
// Touch on the canvas (simulated pointer events, pointerType "touch"), the selection bar, the floating zoom buttons
// and the touch reorder buttons, in the compact layout (mocked matchMedia: 390 x 844, coarse pointer).
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { visibleHandles } from '@/core/gestures';
import type { Element as El, Id } from '@/core/model/types';
import { TEMPLATES } from '@/core/templates';
import { mobile, resetMobile } from '../state/mobile';
import { createEditorStore, currentPage, editor, setEditorStore } from '../state/store';
import { installMatchMedia } from './mediaMock';

let media: ReturnType<typeof installMatchMedia>;

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement['getContext'];
  HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,';
  Element.prototype.setPointerCapture = () => {};
  if (!window.requestAnimationFrame) window.requestAnimationFrame = (cb) => window.setTimeout(() => cb(0), 0);
  if (!window.cancelAnimationFrame) window.cancelAnimationFrame = (id) => window.clearTimeout(id);
});

beforeEach(() => {
  media = installMatchMedia({ width: 390, height: 844, coarse: true });
  resetMobile();
  setEditorStore(createEditorStore(TEMPLATES[0].build())); // "lobby": 340 x 210, buttons at (22,138) and (130,138)
});

afterEach(() => {
  cleanup();
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
    expect(editor().view.zoom).toBe(1); // fitZoom of a 0 x 0 jsdom stage clamps to MIN_ZOOM
    expect(editor().view.panX).toBe(-170);
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

  it('pinch zoom follows the fingers around their midpoint', async () => {
    await mount();
    touch('pointerDown', 1, 100, 400);
    touch('pointerDown', 2, 200, 400);
    touch('pointerMove', 2, 300, 400);
    // page point (150, 400) under the start midpoint is now under the new midpoint (200, 400)
    expect(editor().view).toMatchObject({ zoom: 2, panX: -100, panY: -400 });
    touch('pointerMove', 2, 220, 400); // fingers back to 120 px apart: 1.2x
    expect(editor().view.zoom).toBeCloseTo(1.2, 12);
    touch('pointerUp', 1, 100, 400);
    touch('pointerUp', 2, 220, 400);
    expect(editor().selection).toEqual([]);
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

  it('floating zoom buttons replace the toolbar in compact', async () => {
    await mount();
    expect(screen.queryByRole('toolbar', { name: '畫布工具列' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '放大' }));
    expect(editor().view.zoom).toBe(2);
    fireEvent.click(screen.getByRole('button', { name: '縮小' }));
    expect(editor().view.zoom).toBe(1);
    act(() => editor().setView({ zoom: 5 }));
    fireEvent.click(screen.getByRole('button', { name: '符合視窗' }));
    expect(editor().view.zoom).toBe(1);
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
