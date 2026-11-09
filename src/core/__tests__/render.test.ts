import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { drawGameMock, fitProblem, gameLayout, autoGuiScale, widgetHeight, GAME_CHROME, WINDOW_PRESETS } from '../game/chrome';
import { createElement, createPage, createProject } from '../model/defaults';
import { ICON_IDS } from '../model/types';
import type { Element } from '../model/types';
import { validateProject } from '../model/validate';
import { iconPixels, processIcon } from '../render/icons';
import { computeRegions, renderPageToCanvas } from '../render/renderPage';
import { wrapText } from '../render/text';
import type { CanvasLike, Ctx2D, RenderEnv } from '../render/types';
import { SKIN_LIST } from '../skins';
import { TEMPLATES } from '../templates';

const makeEnv = (): RenderEnv => ({ createCanvas: (w, h) => createCanvas(w, h) as unknown as CanvasLike });

function pixels(elements: Element[], w = 40, h = 30, skinId: 'dark' | 'vanilla' = 'dark') {
  const page = createPage({ width: w, height: h, elements });
  const project = createProject({ pages: [page], skinId });
  const { canvas } = renderPageToCanvas(page, project, makeEnv());
  return (canvas.getContext('2d') as Ctx2D).getImageData(0, 0, w, h).data;
}
const px = (d: Uint8ClampedArray, w: number, x: number, y: number) => Array.from(d.slice((y * w + x) * 4, (y * w + x) * 4 + 4));

describe('renderer', () => {
  it('is deterministic for every template page (fresh environments)', () => {
    for (const t of TEMPLATES) {
      const project = t.build();
      for (const page of project.pages) {
        const run = () => {
          const { canvas } = renderPageToCanvas(page, project, makeEnv());
          return Buffer.from((canvas.getContext('2d') as Ctx2D).getImageData(0, 0, page.width, page.height).data);
        };
        const a = run();
        expect(a.equals(run())).toBe(true);
        expect(a.some((v) => v !== 0)).toBe(true);
      }
    }
  });

  it('draws crisp integer shapes', () => {
    const d = pixels([createElement('shape', { x: 2, y: 3, w: 4, h: 5, shape: 'rect', fill: '#ff0000' })], 10, 10);
    expect(px(d, 10, 2, 3)).toEqual([255, 0, 0, 255]);
    expect(px(d, 10, 5, 7)).toEqual([255, 0, 0, 255]);
    expect(px(d, 10, 1, 3)[3]).toBe(0);
    expect(px(d, 10, 6, 7)[3]).toBe(0);
    const r = pixels([createElement('shape', { x: 0, y: 0, w: 20, h: 20, shape: 'rounded', radius: 5, fill: '#00ff00' })], 20, 20);
    expect(px(r, 20, 0, 0)[3]).toBe(0);
    expect(px(r, 20, 10, 10)).toEqual([0, 255, 0, 255]);
  });

  it('skips hidden and fully transparent elements', () => {
    const d = pixels([
      createElement('shape', { x: 0, y: 0, w: 10, h: 10, shape: 'rect', fill: '#ffffff', hidden: true }),
      createElement('shape', { x: 0, y: 0, w: 10, h: 10, shape: 'rect', fill: '#ffffff', opacity: 0 }),
    ], 10, 10);
    expect(d.every((v) => v === 0)).toBe(true);
  });

  it('pixelated text has only fully opaque or fully transparent pixels', () => {
    const d = pixels([createElement('label', { x: 0, y: 0, w: 80, h: 20, text: '測試 ABC', color: '#ffffff', pixelate: 'on' })], 80, 20);
    const alphas = new Set<number>();
    for (let i = 3; i < d.length; i += 4) alphas.add(d[i]);
    expect([...alphas].every((a) => a === 0 || a === 255)).toBe(true);
    expect(alphas.has(255)).toBe(true);
  });

  it('keeps every skin inside the element rect', () => {
    for (const skin of SKIN_LIST) {
      const els: Element[] = [
        createElement('panel', { x: 10, y: 10, w: 60, h: 40 }),
        createElement('button', { x: 10, y: 60, w: 60, h: 20, variant: 'primary' }),
        createElement('slotgrid', { x: 10, y: 90, cols: 2, rows: 1 }),
        createElement('bar', { x: 10, y: 115, w: 60, h: 8 }),
        createElement('divider', { x: 10, y: 130, w: 60, h: 7 }),
      ];
      const page = createPage({ width: 80, height: 140, elements: els });
      const project = createProject({ pages: [page], skinId: skin.id });
      const { canvas } = renderPageToCanvas(page, project, makeEnv());
      const d = (canvas.getContext('2d') as Ctx2D).getImageData(0, 0, 80, 140).data;
      for (let y = 0; y < 140; y++) for (const x of [0, 9, 70, 79]) expect(px(d, 80, x, y)[3]).toBe(0);
    }
  });
});

describe('regions', () => {
  it('lists interactive elements in z-order, clipped, skipping hidden and inert ones', () => {
    const a = createElement('button', { x: 0, y: 0, w: 50, h: 50, action: { type: 'command', command: 'list' } });
    const b = createElement('label', { x: 40, y: 40, w: 100, h: 100, tooltip: '提示' });
    const c = createElement('button', { x: 0, y: 0, w: 10, h: 10, hidden: true, action: { type: 'close' } });
    const d = createElement('icon', { x: 0, y: 0 });
    const panel = createElement('panel', { x: 0, y: 0, w: 100, h: 100 });
    const page = createPage({ width: 100, height: 100, elements: [panel, a, b, c, d] });
    const regions = computeRegions(page);
    expect(regions.map((r) => r.elementId)).toEqual([a.id, b.id]);
    expect(regions[1]).toMatchObject({ x: 40, y: 40, w: 60, h: 60, tooltip: '提示', action: { type: 'none' } });
  });
});

describe('text wrapping', () => {
  const m = (s: string) => [...s].length * 10;
  it('wraps CJK per character with kinsoku rules', () => {
    expect(wrapText(m, '你好世界測試', 30, true)).toEqual(['你好世', '界測試']);
    expect(wrapText(m, '你好，世界', 20, true)).toEqual(['你好，', '世界']);
    expect(wrapText(m, '好「測試」', 20, true)).toEqual(['好', '「測', '試」']);
  });
  it('wraps latin by words and breaks long words', () => {
    expect(wrapText(m, 'hello world foo', 60, true)).toEqual(['hello', 'world', 'foo']);
    expect(wrapText(m, 'abcdefgh', 30, true)).toEqual(['abc', 'def', 'gh']);
    expect(wrapText(m, 'a\nb', 5, false)).toEqual(['a', 'b']);
  });
});

describe('icons, templates and game chrome', () => {
  it('provides at least 16 complete 16x16 icons', () => {
    expect(ICON_IDS.length).toBeGreaterThanOrEqual(16);
    for (const id of ICON_IDS) {
      const g = iconPixels(id);
      expect(g).toHaveLength(16);
      expect(g.every((row) => row.length === 16)).toBe(true);
      expect(g.flat().filter(Boolean).length).toBeGreaterThan(30);
    }
    const p = processIcon(['....', '.##.', '.##.', '....']);
    expect(p[1][1]).toBe('o');
  });

  it('ships at least 6 valid templates covering every skin', () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(6);
    expect(new Set(TEMPLATES.map((t) => t.skinId)).size).toBe(4);
    for (const t of TEMPLATES) {
      const project = t.build();
      expect(project.skinId).toBe(t.skinId);
      const issues = validateProject(project).filter((i) => i.severity !== 'info' || i.code === 'el-clipped');
      expect(issues, `${t.id}: ${issues.map((i) => i.message).join(' / ')}`).toEqual([]);
    }
  });

  it('computes the dialog layout and draws the mock', () => {
    expect(autoGuiScale(1920, 1080)).toBe(4);
    expect(autoGuiScale(1280, 720)).toBe(3);
    const L = gameLayout(1920, 1080, 3, 320, 200);
    expect(L.guiW).toBe(640);
    expect(L.guiH).toBe(360);
    expect(L.fitsWidth).toBe(true);
    expect(L.widget.h).toBe(widgetHeight(200));
    expect(gameLayout(1280, 720, 4, 320, 200).fitsHeight).toBe(false);
    // measured in the real client (VERIFIED §1/§8): 853x480 GUI px at scale 3, picture top 67, footer button 6 px above
    // the bottom, and a 300 px tall picture still fits
    const M = gameLayout(1280, 720, 3, 256, 300);
    expect([M.guiW, M.guiH, M.page.y, M.page.x]).toEqual([426, 240, GAME_CHROME.pictureTop, 85]);
    const T = gameLayout(2560, 1440, 3, 120, 300);
    expect(T.fitsHeight).toBe(true);
    expect(T.footerButton).toEqual({ x: Math.floor((853 - 150) / 2), y: 480 - 6 - 20, w: 150, h: 20 });
    expect(T.widget.w).toBe(120 + 12);
    expect(fitProblem(WINDOW_PRESETS[0], 4, { width: 320, height: 200 })).toMatch(/寬度超出/);
    expect(fitProblem(WINDOW_PRESETS[0], 4, { width: 300, height: 200 })).toMatch(/高度不足/);
    expect(fitProblem(WINDOW_PRESETS[1], 3, { width: 320, height: 200 })).toBeNull();
    const env = makeEnv();
    const c = env.createCanvas(L.guiW, L.guiH);
    drawGameMock(c.getContext('2d') as Ctx2D, env, L, { title: '測試', page: null, fontFamily: '' });
    expect(px((c.getContext('2d') as Ctx2D).getImageData(0, 0, 640, 360).data, 640, 320, 350)[3]).toBe(255);
  });
});
