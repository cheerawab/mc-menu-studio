// @vitest-environment jsdom
// The export dialog end to end in a DOM: builds the packs (pictures rendered by @napi-rs/canvas instead of the
// browser canvas), shows the statistics, switches modes and downloads real zips.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import JSZip from 'jszip';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { TEMPLATES } from '@/core/templates';
import { createEditorStore, editor, setEditorStore } from '../state/store';

vi.mock('../state/images', async () => {
  const { createCanvas } = await import('@napi-rs/canvas');
  return {
    renderEnv: () => ({ createCanvas: (w: number, h: number) => createCanvas(w, h) }),
    whenImagesReady: () => Promise.resolve(),
  };
});

afterEach(() => cleanup());
afterAll(() => setEditorStore(null));

describe('ExportDialog', () => {
  it('builds, explains and downloads both modes', async () => {
    const errors = vi.spyOn(console, 'error');
    const blobs: Blob[] = [];
    URL.createObjectURL = vi.fn((b: Blob) => (blobs.push(b), 'blob:mock'));
    URL.revokeObjectURL = vi.fn();
    HTMLAnchorElement.prototype.click = vi.fn();
    window.localStorage.removeItem('mc-menu-studio:export:v1');
    setEditorStore(createEditorStore(TEMPLATES[0].build()));
    editor().openDialog('export');
    const { default: ExportDialog } = await import('./ExportDialog');
    render(<ExportDialog />);

    const dataBtn = () => screen.getByRole('button', { name: '資料包' }) as HTMLButtonElement;
    const files = async (i: number) => Object.keys((await JSZip.loadAsync(await blobs[i].arrayBuffer())).files);
    await waitFor(() => expect(dataBtn().disabled).toBe(false), { timeout: 5000 });
    expect(screen.getAllByText(/KB$/).length).toBe(2);
    expect(screen.getByText('沒有錯誤或警告。')).toBeTruthy();

    fireEvent.click(dataBtn());
    await waitFor(() => expect(blobs).toHaveLength(1));
    expect(await files(0)).toEqual(expect.arrayContaining(['data/lobby/dialog/lobby.json', 'data/lobby/dialog/rules.json', 'data/minecraft/tags/dialog/quick_actions.json']));

    fireEvent.click(screen.getByRole('radio', { name: /函數內嵌/ }));
    expect(dataBtn().disabled).toBe(true);
    await waitFor(() => expect(dataBtn().disabled).toBe(false), { timeout: 5000 });
    expect(screen.getAllByText(/\/function lobby:show_lobby/).length).toBeGreaterThan(0);
    fireEvent.click(dataBtn());
    await waitFor(() => expect(blobs).toHaveLength(2));
    expect(await files(1)).toEqual(expect.arrayContaining(['data/lobby/function/show_lobby.mcfunction', 'data/lobby/function/show_rules.mcfunction']));

    fireEvent.click(screen.getByRole('button', { name: /全部下載/ }));
    await waitFor(() => expect(blobs).toHaveLength(3));
    expect((await files(2)).sort()).toEqual(['README_zh-TW.txt', 'lobby_datapack.zip', 'lobby_resourcepack.zip']);
    expect(JSON.parse(window.localStorage.getItem('mc-menu-studio:export:v1')!).mode).toBe('functions');
    expect(errors).not.toHaveBeenCalled();
  });

  it('explains the command modes (default /trigger), counts command actions and switches the data pack', async () => {
    const errors = vi.spyOn(console, 'error');
    const blobs: Blob[] = [];
    URL.createObjectURL = vi.fn((b: Blob) => (blobs.push(b), 'blob:mock'));
    window.localStorage.removeItem('mc-menu-studio:export:v1');
    setEditorStore(createEditorStore(TEMPLATES[0].build()));
    editor().openDialog('export');
    const { default: ExportDialog } = await import('./ExportDialog');
    render(<ExportDialog />);

    const group = screen.getByRole('radiogroup', { name: '指令執行方式' });
    const [trig, direct] = within(group).getAllByRole('radio');
    expect(trig.textContent).toContain('/trigger（建議）');
    expect(trig.getAttribute('aria-checked')).toBe('true');
    expect(trig.textContent).toContain('/trigger mcms_lobby set <編號>');
    expect(direct.textContent).toContain('確認指令執行');
    expect(screen.getByText(/這個專案有/).textContent).toMatch(/這個專案有 [1-9]\d* 個指令動作/);
    expect(screen.getByText(/任何玩家都能輸入 \/trigger mcms_lobby set/)).toBeTruthy(); // checks entry
    expect(screen.getByText('沒有錯誤或警告。')).toBeTruthy();
    // footer behaviour texts follow the decompiled semantics
    const after = screen.getByRole('combobox', { name: '點擊選單後' }) as HTMLSelectElement;
    expect([...after.options].map((o) => o.textContent)).toEqual(['點擊後關閉（建議）', '保持開啟']);

    const dataBtn = () => screen.getByRole('button', { name: '資料包' }) as HTMLButtonElement;
    const files = async (i: number) => Object.keys((await JSZip.loadAsync(await blobs[i].arrayBuffer())).files);
    await waitFor(() => expect(dataBtn().disabled).toBe(false), { timeout: 5000 });
    expect(screen.getByText(/匯出後共 \d+ 個編號/)).toBeTruthy();
    fireEvent.click(dataBtn());
    await waitFor(() => expect(blobs).toHaveLength(1));
    expect(await files(0)).toEqual(expect.arrayContaining([
      'data/lobby/function/trigger_load.mcfunction', 'data/lobby/function/trigger_tick.mcfunction',
      'data/minecraft/tags/function/load.json', 'data/minecraft/tags/function/tick.json',
    ]));

    fireEvent.click(direct);
    expect(direct.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText(/直接執行：\d+ 個指令動作/)).toBeTruthy(); // the warning replaces the info entry
    expect(screen.queryByText(/任何玩家都能輸入/)).toBeNull();
    await waitFor(() => expect(dataBtn().disabled).toBe(false), { timeout: 5000 });
    fireEvent.click(dataBtn());
    await waitFor(() => expect(blobs).toHaveLength(2));
    expect((await files(1)).some((f) => f.includes('trigger') || f.includes('tags/function'))).toBe(false);
    expect(JSON.parse(window.localStorage.getItem('mc-menu-studio:export:v1')!).commandMode).toBe('direct');
    expect(errors).not.toHaveBeenCalled();
  });
});
