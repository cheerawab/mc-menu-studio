// @vitest-environment jsdom
// The export dialog end to end in a DOM: builds the packs (pictures rendered by @napi-rs/canvas instead of the
// browser canvas), shows the statistics, switches modes and downloads real zips.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import JSZip from 'jszip';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { TEMPLATES } from '@/core/templates';
import { createEditorStore, editor, setEditorStore } from '../state/store';

vi.mock('../state/images', async () => {
  const { createCanvas } = await import('@napi-rs/canvas');
  return {
    renderEnv: () => ({ createCanvas: (w: number, h: number) => createCanvas(w, h) }),
    whenImagesReady: () => Promise.resolve(),
  };
});

afterAll(() => {
  cleanup();
  setEditorStore(null);
});

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
});
