// @vitest-environment jsdom
// The game preview at every 解析度: the page is rendered at the project's scale and drawn into a backing canvas of
// GUI px x min(scale, GUI scale) (the game cannot show more texels than screen pixels). Canvas = @napi-rs/canvas.
import { createCanvas, type SKRSContext2D } from '@napi-rs/canvas';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { gameLayout, previewDensity } from '@/core/game/chrome';
import type { RenderScale } from '@/core/model/types';
import { TEMPLATES } from '@/core/templates';
import { createEditorStore, editor, setEditorStore } from '../state/store';

vi.mock('../state/images', async () => {
  const { createCanvas: make } = await import('@napi-rs/canvas');
  return {
    renderEnv: () => ({ createCanvas: (w: number, h: number) => make(w, h) }),
    whenImagesReady: () => Promise.resolve(),
    useImagesVersion: () => 0,
  };
});

const contexts = new WeakMap<HTMLCanvasElement, SKRSContext2D>();
beforeAll(() => {
  // one large real 2D context per element (its size does not follow the element; only drawing is checked)
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) {
    let ctx = contexts.get(this);
    if (!ctx) contexts.set(this, (ctx = createCanvas(2000, 1200).getContext('2d')));
    return ctx;
  } as unknown as HTMLCanvasElement['getContext'];
});
afterEach(() => cleanup());
afterAll(() => setEditorStore(null));

describe('GamePreview', () => {
  it('preview density = render scale, at most the GUI scale', () => {
    expect([1, 2, 3, 4].map((s) => previewDensity(s, 3))).toEqual([1, 2, 3, 3]);
    expect(previewDensity(4, 4)).toBe(4);
    expect(previewDensity(2, 1)).toBe(1);
  });

  it('renders at 解析度 1-4 without errors; backing canvas = GUI px x min(解析度, GUI scale)', async () => {
    const errors = vi.spyOn(console, 'error');
    setEditorStore(createEditorStore(TEMPLATES[0].build()));
    act(() => editor().setView({ guiScale: 3, windowId: '1920x1080' }));
    const { default: GamePreview } = await import('./GamePreview');
    render(<GamePreview />);
    const canvas = screen.getByRole('img', { name: /遊戲內預覽/ }) as HTMLCanvasElement;
    const page = editor().project.pages[0];
    const L = gameLayout(1920, 1080, 3, page.width, page.height);
    const draw = vi.spyOn(contexts.get(canvas)!, 'drawImage');
    for (const s of [1, 2, 3, 4] as RenderScale[]) {
      draw.mockClear();
      act(() => editor().commit((p) => ({ ...p, settings: { ...p.settings, renderScale: s } })));
      const d = Math.min(s, 3);
      expect([canvas.width, canvas.height], `${s}x`).toEqual([L.guiW * d, L.guiH * d]);
      // the page bitmap (page px x s texels) is drawn nearest at its GUI position and size
      const pageDraw = draw.mock.calls.find((c) => (c as unknown[]).length === 5 && (c[0] as { width: number }).width === page.width * s);
      expect(pageDraw?.slice(1), `${s}x`).toEqual([L.page.x, L.page.y, page.width, page.height]);
      expect(screen.getByText(new RegExp(`解析度 ${s}x`)).textContent, `${s}x`).toContain(s > 3 ? '略過部分像素' : `${s}x`);
    }
    expect(errors).not.toHaveBeenCalled();
  });
});
