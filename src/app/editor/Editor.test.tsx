// @vitest-environment jsdom
// Smoke test: mounts the whole editor in jsdom (no real canvas) and walks through the main flows,
// so runtime errors and render loops in the UI are caught without a browser.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { TEMPLATES } from '@/core/templates';
import { createEditorStore, editor, setEditorStore } from '../state/store';

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement['getContext'];
  HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,';
  Element.prototype.setPointerCapture = () => {};
  if (!window.requestAnimationFrame) window.requestAnimationFrame = (cb) => window.setTimeout(() => cb(0), 0);
  if (!window.cancelAnimationFrame) window.cancelAnimationFrame = (id) => window.clearTimeout(id);
});

afterAll(() => {
  cleanup();
  setEditorStore(null);
});

describe('Editor UI', () => {
  it('mounts and supports the main flows without errors', async () => {
    const errors = vi.spyOn(console, 'error');
    setEditorStore(createEditorStore(TEMPLATES[0].build()));
    const { default: Editor } = await import('./Editor');
    render(<Editor />);
    expect(screen.getByText('選單工坊')).toBeTruthy();

    // palette adds an element and the inspector shows its fields
    const before = editor().project.pages[0].elements.length;
    fireEvent.click(screen.getByTitle(/^按鈕：/));
    expect(editor().project.pages[0].elements.length).toBe(before + 1);
    const text = screen.getByRole('textbox', { name: '按鈕文字' }) as HTMLInputElement;
    fireEvent.change(text, { target: { value: '開始遊戲' } });
    expect(editor().project.pages[0].elements.at(-1)).toMatchObject({ type: 'button', text: '開始遊戲' });

    // action editor
    fireEvent.change(screen.getByRole('combobox', { name: '點擊動作' }), { target: { value: 'command' } });
    expect(screen.getByText('指令是空的。')).toBeTruthy();

    // keyboard: nudge, undo, delete
    const x0 = editor().project.pages[0].elements.at(-1)!.x;
    fireEvent.keyDown(window, { key: 'ArrowRight', shiftKey: true });
    expect(editor().project.pages[0].elements.at(-1)!.x).toBe(x0 + 8);
    fireEvent.keyDown(window, { key: 'z', metaKey: true });
    expect(editor().project.pages[0].elements.at(-1)!.x).toBe(x0);
    fireEvent.keyDown(window, { key: 'Delete' });
    expect(editor().project.pages[0].elements.length).toBe(before);

    // every element type renders its inspector
    for (const label of ['面板', '文字', '圖片', '圖示', '形狀', '進度條', '分隔線', '物品格']) {
      fireEvent.click(screen.getByTitle(new RegExp(`^${label}：`)));
      expect(screen.getByRole('textbox', { name: '元件名稱' })).toBeTruthy();
    }
    fireEvent.keyDown(window, { key: 'a', metaKey: true });
    expect(screen.getByText(/已選取 \d+ 個元件/)).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });

    // tabs
    fireEvent.click(screen.getByRole('tab', { name: /檢查/ }));
    expect(screen.getByText('靜態匯出的限制')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /連結/ }));
    expect(screen.getAllByText('入口').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('tab', { name: /屬性/ }));
    expect(screen.getByRole('textbox', { name: '命名空間' })).toBeTruthy();

    // pages
    fireEvent.click(screen.getByLabelText('新增頁面'));
    expect(editor().project.pages).toHaveLength(3);

    // in-game preview
    fireEvent.click(screen.getByRole('radio', { name: /遊戲預覽/ }));
    expect(screen.getByRole('status').textContent).toMatch(/可完整顯示|高度不足|寬度超出/);
    fireEvent.click(screen.getByRole('radio', { name: /編輯/ }));

    // templates dialog + confirm
    fireEvent.click(screen.getByRole('button', { name: /範本/ }));
    expect(screen.getByRole('dialog', { name: '範本庫' })).toBeTruthy();
    fireEvent.click(screen.getByText('快速選單'));
    fireEvent.click(screen.getByRole('button', { name: '套用範本' }));
    expect(editor().project.skinId).toBe('holo');

    // export dialog: mode switch, explanations, checks; jsdom has no 2D canvas, so the build reports an error
    fireEvent.click(screen.getByRole('button', { name: /匯出/ }));
    expect(screen.getByRole('dialog', { name: /匯出到 Minecraft/ })).toBeTruthy();
    expect(screen.getAllByText(/實驗性設定/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('radio', { name: /函數內嵌/ }));
    expect(screen.getByText('函數內嵌模式無法綁定 G 鍵。')).toBeTruthy();
    expect(await screen.findByText(/無法匯出/, {}, { timeout: 3000 })).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: '伺服器' }));
    expect(screen.getByText(/server.properties/)).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: /資料包對話框/ }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: /匯出到 Minecraft/ })).toBeNull();

    expect(errors).not.toHaveBeenCalled();
  });
});
