// @vitest-environment jsdom
// The compact (phone) layout in jsdom with a mocked matchMedia: tab bar, sheets, top bar and its ⋯ menu.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { TEMPLATES } from '@/core/templates';
import { mobile, resetMobile } from '../state/mobile';
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

async function mountEditor() {
  const { default: Editor } = await import('./Editor');
  return render(<Editor />);
}

const sheet = (name: string) => screen.queryByRole('dialog', { name });

describe('compact layout', () => {
  it('renders the phone shell instead of the side panels', async () => {
    const errors = vi.spyOn(console, 'error');
    const { container } = await mountEditor();
    expect(container.querySelector('[data-layout]')?.getAttribute('data-layout')).toBe('compact');
    const tabs = within(screen.getByRole('tablist', { name: '面板' })).getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['元件', '頁面', '圖層', '屬性', expect.stringContaining('更多')]);
    expect(tabs.every((t) => t.getAttribute('aria-selected') === 'false')).toBe(true);
    // no desktop columns
    expect(screen.queryByLabelText('元件、頁面與圖層')).toBeNull();
    expect(screen.queryByLabelText('屬性面板')).toBeNull();
    // top bar: icon-only mode switch, undo / redo, export, overflow menu
    expect(screen.getByRole('radio', { name: '編輯' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('button', { name: '復原' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '匯出' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '更多選項' })).toBeTruthy();
    expect(errors).not.toHaveBeenCalled();
  });

  it('opens one sheet per tab and closes it by the tab, the close button and Escape', async () => {
    await mountEditor();
    const tab = (name: string) => screen.getByRole('tab', { name: new RegExp(name) });

    fireEvent.click(tab('圖層'));
    expect(sheet('圖層')).toBeTruthy();
    expect(tab('圖層').getAttribute('aria-selected')).toBe('true');
    expect(tab('圖層').getAttribute('aria-controls')).toBe('sheet-layers');
    fireEvent.click(tab('圖層'));
    expect(sheet('圖層')).toBeNull();

    fireEvent.click(tab('頁面'));
    expect(within(sheet('頁面')!).getByRole('list', { name: '頁面列表' })).toBeTruthy();
    fireEvent.click(tab('屬性')); // switching tabs replaces the sheet
    expect(sheet('頁面')).toBeNull();
    expect(within(sheet('屬性')!).getByRole('textbox', { name: '命名空間' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '關閉面板' }));
    expect(sheet('屬性')).toBeNull();

    fireEvent.click(tab('更多'));
    expect(within(sheet('更多')!).getAllByText('入口').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('radio', { name: /檢查/ }));
    expect(screen.getByText('靜態匯出的限制')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(sheet('更多')).toBeNull();
  });

  it('adds an element from the 元件 sheet and closes the sheet', async () => {
    await mountEditor();
    fireEvent.click(screen.getByRole('tab', { name: '元件' }));
    const before = editor().project.pages[0].elements.length;
    fireEvent.click(within(sheet('元件')!).getByTitle(/^按鈕：/));
    expect(editor().project.pages[0].elements.length).toBe(before + 1);
    expect(editor().selection).toHaveLength(1);
    expect(sheet('元件')).toBeNull();
    // the new element is selected, so the selection bar is up
    expect(screen.getByRole('toolbar', { name: '選取工具列' })).toBeTruthy();
  });

  it('switches to 屬性 when the text of an element is requested (Enter / double tap)', async () => {
    await mountEditor();
    const el = editor().project.pages[0].elements.find((e) => e.type === 'button')!;
    act(() => editor().select([el.id]));
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(sheet('屬性')).toBeTruthy();
    expect(mobile().sheet).toBe('inspect');
  });

  it('the ⋯ menu has the template and file items and the canvas view toggles', async () => {
    await mountEditor();
    fireEvent.click(screen.getByRole('button', { name: '更多選項' }));
    const menu = screen.getByRole('menu', { name: '更多選項' });
    for (const name of ['範本庫…', '新專案', '匯入專案 JSON…', '匯出專案 JSON']) expect(within(menu).getByRole('menuitem', { name: new RegExp(name) })).toBeTruthy();
    const grid = within(menu).getByRole('menuitemcheckbox', { name: /顯示格線/ });
    const was = editor().view.showGrid;
    fireEvent.click(grid);
    expect(editor().view.showGrid).toBe(!was);
    fireEvent.click(within(menu).getByRole('radio', { name: '8 像素' }));
    expect(editor().view.snap).toBe(8);
    // outside pointerdown closes it
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu', { name: '更多選項' })).toBeNull();
    // the template item opens the template dialog
    fireEvent.click(screen.getByRole('button', { name: '更多選項' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /範本庫/ }));
    expect(screen.getByRole('dialog', { name: '範本庫' })).toBeTruthy();
  });

  it('switches layout when the screen grows past 900 px and back', async () => {
    const { container } = await mountEditor();
    fireEvent.click(screen.getByRole('tab', { name: '圖層' }));
    act(() => media.set({ width: 1024, height: 768, coarse: false }));
    expect(container.querySelector('[data-layout]')?.getAttribute('data-layout')).toBe('medium');
    expect(screen.queryByRole('tablist', { name: '面板' })).toBeNull();
    expect(screen.getByLabelText('元件、頁面與圖層')).toBeTruthy();
    expect(mobile().sheet).toBeNull();
    act(() => media.set({ width: 1440, height: 900 }));
    expect(container.querySelector('[data-layout]')?.getAttribute('data-layout')).toBe('desktop');
    act(() => media.set({ width: 844, height: 390, coarse: true }));
    expect(container.querySelector('[data-layout]')?.getAttribute('data-layout')).toBe('compact');
    // landscape phone: icon-only tabs keep their names
    expect(screen.getByRole('tab', { name: '元件' }).textContent).toBe('');
  });
});
