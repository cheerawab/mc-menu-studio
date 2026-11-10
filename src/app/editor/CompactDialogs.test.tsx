// @vitest-environment jsdom
// Compact layout details: dialogs as bottom sheets, toasts, the game preview on touch (tap = click, long press =
// tooltip), the viewport export and the shell CSS.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { LONG_PRESS_MS } from '@/core/gestures';
import { TEMPLATES } from '@/core/templates';
import { viewport } from '../layout';
import { resetMobile } from '../state/mobile';
import { createEditorStore, editor, setEditorStore } from '../state/store';
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
  setEditorStore(createEditorStore(TEMPLATES[0].build()));
});

afterEach(() => {
  cleanup();
  media.restore();
});

afterAll(() => setEditorStore(null));

async function mount() {
  const { default: Editor } = await import('./Editor');
  render(<Editor />);
}

function touch(type: 'pointerDown' | 'pointerUp', x: number, y: number, target: Element) {
  fireEvent[type](target, { pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, button: 0 });
}

describe('compact dialogs', () => {
  it('open from the bottom with a 44 px close button; the backdrop closes only on a full tap', async () => {
    await mount();
    fireEvent.click(screen.getByRole('button', { name: '匯出' }));
    const dlg = screen.getByRole('dialog', { name: /匯出到 Minecraft/ });
    expect(dlg.className).toContain('w-full');
    expect(dlg.className).toContain('sheet-max-h');
    expect(within(dlg).getByRole('button', { name: '關閉' }).className).toContain('h-11 w-11');
    expect(within(dlg).getByRole('button', { name: /全部下載/ }).className).toContain('h-11');
    const backdrop = dlg.parentElement!;
    fireEvent.pointerDown(backdrop);
    fireEvent.click(dlg); // pointer came up inside the dialog
    expect(screen.getByRole('dialog', { name: /匯出到 Minecraft/ })).toBeTruthy();
    fireEvent.pointerDown(dlg);
    fireEvent.click(backdrop); // went down inside (e.g. selecting text), came up outside
    expect(screen.getByRole('dialog', { name: /匯出到 Minecraft/ })).toBeTruthy();
    fireEvent.pointerDown(backdrop);
    fireEvent.click(backdrop);
    expect(screen.queryByRole('dialog', { name: /匯出到 Minecraft/ })).toBeNull();
  });

  it('confirm buttons share the width; templates are one column', async () => {
    await mount();
    fireEvent.click(screen.getByRole('button', { name: '更多選項' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /新專案/ }));
    const confirm = screen.getByRole('dialog', { name: '建立新專案' });
    const cancel = within(confirm).getByRole('button', { name: '取消' });
    expect(cancel.parentElement!.className).toContain('grid-cols-2');
    fireEvent.click(cancel);
    expect(screen.queryByRole('dialog', { name: '建立新專案' })).toBeNull();
    act(() => editor().openDialog('templates'));
    const grid = within(screen.getByRole('dialog', { name: '範本庫' })).getByText('快速選單').closest('button')!.parentElement!;
    expect(grid.className).toContain('grid-cols-1');
  });

  it('toasts appear under the top bar', async () => {
    await mount();
    act(() => editor().toast('info', '測試通知'));
    expect(screen.getByText('測試通知').closest('[aria-live]')!.className).toContain('toast-top');
  });
});

describe('game preview on touch', () => {
  it('tap runs the click, long press shows the tooltip until the next tap', async () => {
    await mount();
    fireEvent.click(screen.getByRole('radio', { name: '遊戲預覽' }));
    expect(screen.getByRole('combobox', { name: '遊戲視窗大小' })).toBeTruthy(); // not in the compact top bar
    expect(screen.getByText(/長按可看提示文字/)).toBeTruthy();
    const canvas = screen.getByRole('img', { name: /遊戲內預覽/ });
    // 1920x1080 at GUI 3 -> a 640 x 360 GUI; the 340 x 210 page starts at GUI (150, 67). Client px = GUI px here.
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 640, height: 360, right: 640, bottom: 360, x: 0, y: 0, toJSON: () => ({}) });
    const survival = { x: 150 + 22 + 40, y: 67 + 138 + 9 }; // the 生存模式 button (command, with a tooltip)

    touch('pointerDown', survival.x, survival.y, canvas);
    touch('pointerUp', survival.x, survival.y, canvas);
    fireEvent.click(canvas, { clientX: survival.x, clientY: survival.y }); // the click a tap produces: ignored
    expect(editor().toasts.map((t) => t.message)).toEqual(['模擬執行指令：/gamemode survival']);

    touch('pointerDown', survival.x, survival.y, canvas);
    await act(() => new Promise((r) => setTimeout(r, LONG_PRESS_MS + 60)));
    expect(screen.getByRole('tooltip').textContent).toBe('切換成生存模式');
    touch('pointerUp', survival.x, survival.y, canvas);
    expect(editor().toasts).toHaveLength(1); // a long press does not click
    expect(screen.getByRole('tooltip')).toBeTruthy();
    fireEvent.pointerDown(document.body, { pointerType: 'touch' });
    expect(screen.queryByRole('tooltip')).toBeNull();

    // the 伺服器規則 button opens the second page
    touch('pointerDown', 150 + 12 + 52, 67 + 174 + 12, canvas);
    touch('pointerUp', 150 + 12 + 52, 67 + 174 + 12, canvas);
    expect(editor().pageId).toBe(editor().project.pages[1].id);
  });
});

describe('viewport and shell CSS', () => {
  it('exports a phone-ready viewport', () => {
    expect(viewport).toMatchObject({ width: 'device-width', initialScale: 1, viewportFit: 'cover', interactiveWidget: 'resizes-content' });
    expect(viewport).not.toHaveProperty('maximumScale'); // pinch-zoom of the page stays allowed
  });

  it('uses the dynamic viewport height, safe areas and reduced motion', () => {
    const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8'); // vitest runs in the repo root
    expect(css).toMatch(/\.app-shell \{[^}]*height: 100dvh/);
    expect(css).toMatch(/overscroll-behavior: none/);
    expect(css).toMatch(/env\(safe-area-inset-bottom\)/);
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{\s*\.animate-sheet \{\s*animation: none/);
    expect(css).toMatch(/\[data-layout="compact"\] :is\(input[^{]*\{\s*font-size: 16px/);
  });
});
