// @vitest-environment jsdom
// The export dialog end to end in a DOM: builds the packs (pictures rendered by @napi-rs/canvas instead of the
// browser canvas), shows the statistics, switches modes and downloads real zips.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import JSZip from 'jszip';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { createElement, createPage, createProject } from '@/core/model/defaults';
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

/** The "lobby" template at 1x: the mode tests rebuild several times, 1x keeps that cheap on a busy machine. */
const lobbyAt1x = () => {
  const p = TEMPLATES[0].build();
  return { ...p, settings: { ...p.settings, renderScale: 1 as const } };
};
/** One small page: cheap builds at every 解析度. */
const smallProject = () =>
  createProject({
    name: '小選單', namespace: 'small',
    pages: [createPage({ key: 'main', width: 96, height: 48, elements: [createElement('label', { x: 4, y: 4, w: 88, h: 20, text: '解析度測試' })] })],
  });
afterAll(() => setEditorStore(null));

describe('ExportDialog', () => {
  it('builds, explains and downloads both modes', async () => {
    const errors = vi.spyOn(console, 'error');
    const blobs: Blob[] = [];
    URL.createObjectURL = vi.fn((b: Blob) => (blobs.push(b), 'blob:mock'));
    URL.revokeObjectURL = vi.fn();
    HTMLAnchorElement.prototype.click = vi.fn();
    window.localStorage.removeItem('mc-menu-studio:export:v1');
    setEditorStore(createEditorStore(lobbyAt1x()));
    editor().openDialog('export');
    const { default: ExportDialog } = await import('./ExportDialog');
    render(<ExportDialog />);

    const dataBtn = () => screen.getByRole('button', { name: '資料包' }) as HTMLButtonElement;
    const files = async (i: number) => Object.keys((await JSZip.loadAsync(await blobs[i].arrayBuffer())).files);
    await waitFor(() => expect(dataBtn().disabled).toBe(false), { timeout: 20000 });
    expect(screen.getAllByText(/KB$/).length).toBe(2);
    expect(screen.getByText('沒有錯誤或警告。')).toBeTruthy();

    fireEvent.click(dataBtn());
    await waitFor(() => expect(blobs).toHaveLength(1));
    expect(await files(0)).toEqual(expect.arrayContaining(['data/lobby/dialog/lobby.json', 'data/lobby/dialog/rules.json', 'data/minecraft/tags/dialog/quick_actions.json']));

    fireEvent.click(screen.getByRole('radio', { name: /函數內嵌/ }));
    expect(dataBtn().disabled).toBe(true);
    await waitFor(() => expect(dataBtn().disabled).toBe(false), { timeout: 20000 });
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

  it('解析度: the segmented control sets the project setting and the build follows (stats row)', async () => {
    const errors = vi.spyOn(console, 'error');
    window.localStorage.removeItem('mc-menu-studio:export:v1');
    setEditorStore(createEditorStore(smallProject()));
    editor().openDialog('export');
    const { default: ExportDialog } = await import('./ExportDialog');
    render(<ExportDialog />);
    const group = screen.getByRole('radiogroup', { name: '解析度' });
    const options = within(group).getAllByRole('radio');
    expect(options.map((o) => o.textContent)).toEqual(['1x像素風', '2x建議', '3x', '4x最清楚']);
    expect(options[1].getAttribute('aria-checked')).toBe('true'); // default 2x
    expect(options[0].getAttribute('title')).toBe('1x：像素風、檔案最小');
    const stat = () => screen.getByText('解析度（圖塊、字型格）').nextSibling?.textContent;
    const dataBtn = () => screen.getByRole('button', { name: '資料包' }) as HTMLButtonElement;
    await waitFor(() => expect(dataBtn().disabled).toBe(false), { timeout: 20000 });
    expect(stat()).toBe('2x・32 px・64×64');

    fireEvent.click(options[3]);
    expect(editor().project.settings.renderScale).toBe(4);
    expect(within(group).getAllByRole('radio')[3].getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText(/4x：最清楚、檔案最大/)).toBeTruthy();
    await waitFor(() => expect(stat()).toBe('4x・16 px・64×64'), { timeout: 20000 });
    fireEvent.click(options[0]);
    expect(editor().project.settings.renderScale).toBe(1);
    await waitFor(() => expect(stat()).toBe('1x・32 px・32×32'), { timeout: 20000 });
    expect(errors).not.toHaveBeenCalled();
  });

  it('explains the command modes (default /trigger), counts command actions and switches the data pack', async () => {
    const errors = vi.spyOn(console, 'error');
    const blobs: Blob[] = [];
    URL.createObjectURL = vi.fn((b: Blob) => (blobs.push(b), 'blob:mock'));
    window.localStorage.removeItem('mc-menu-studio:export:v1');
    setEditorStore(createEditorStore(lobbyAt1x()));
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
    await waitFor(() => expect(dataBtn().disabled).toBe(false), { timeout: 20000 });
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
    await waitFor(() => expect(dataBtn().disabled).toBe(false), { timeout: 20000 });
    fireEvent.click(dataBtn());
    await waitFor(() => expect(blobs).toHaveLength(2));
    expect((await files(1)).some((f) => f.includes('trigger') || f.includes('tags/function'))).toBe(false);
    expect(JSON.parse(window.localStorage.getItem('mc-menu-studio:export:v1')!).commandMode).toBe('direct');
    expect(errors).not.toHaveBeenCalled();
  });
});
