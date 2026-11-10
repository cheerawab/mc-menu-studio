// Render scale (Stage H): pages drawn at 1-4 texels per page px. Layout stays in page px; shapes, skins and icons become
// scale x scale blocks; text is rasterised at font size x scale (pixelated text at 1x, scaled up nearest).
import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { createElement, createPage, createProject } from '../model/defaults';
import type { Element, LabelElement, SkinId } from '../model/types';
import { labelStyle, type DrawContext } from '../render/elements';
import { renderPageToCanvas } from '../render/renderPage';
import { canvasPixels, fitScale, fitsCanvas, isRenderScale, MAX_CANVAS_PIXELS } from '../render/scale';
import { autoPixelate, layoutText, textCacheKey, textRasterScale, type TextStyle } from '../render/text';
import type { CanvasLike, Ctx2D, ImageLike, RenderEnv } from '../render/types';
import { getSkin, skinKit } from '../skins';

const makeEnv = (images?: Map<string, ImageLike>): RenderEnv => ({
  createCanvas: (w, h) => createCanvas(w, h) as unknown as CanvasLike,
  ...(images ? { images } : {}),
});

function render(elements: Element[], w: number, h: number, scale: number, opts: { skinId?: SkinId; env?: RenderEnv; bg?: string } = {}) {
  const page = createPage({ width: w, height: h, elements, bgColor: opts.bg ?? null });
  const project = createProject({ pages: [page], skinId: opts.skinId ?? 'dark' });
  const { canvas } = renderPageToCanvas(page, project, opts.env ?? makeEnv(), { scale, placeholders: false });
  expect([canvas.width, canvas.height]).toEqual([w * scale, h * scale]);
  return (canvas.getContext('2d') as Ctx2D).getImageData(0, 0, w * scale, h * scale).data;
}

/** Nearest-neighbour upscale of a w x h RGBA picture by s. */
function upscale(d: ArrayLike<number>, w: number, h: number, s: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * s * h * s * 4);
  for (let y = 0; y < h * s; y++)
    for (let x = 0; x < w * s; x++) {
      const src = ((Math.floor(y / s) * w + Math.floor(x / s)) * 4), dst = (y * w * s + x) * 4;
      for (let c = 0; c < 4; c++) out[dst + c] = d[src + c];
    }
  return out;
}

const same = (a: ArrayLike<number>, b: ArrayLike<number>) => Buffer.from(a as Uint8ClampedArray).equals(Buffer.from(b as Uint8ClampedArray));

const fnv = (b: ArrayLike<number>) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < b.length; i++) {
    h ^= b[i];
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
};

/** Rows [start, end) that hold any pixel with alpha > 0. */
function inkBands(d: ArrayLike<number>, w: number, h: number): [number, number][] {
  const bands: [number, number][] = [];
  let start = -1;
  for (let y = 0; y <= h; y++) {
    let ink = false;
    if (y < h) for (let x = 0; x < w && !ink; x++) ink = d[(y * w + x) * 4 + 3] > 0;
    if (ink && start < 0) start = y;
    if (!ink && start >= 0) {
      bands.push([start, y]);
      start = -1;
    }
  }
  return bands;
}

/** Text-free page: skin panel and button, shapes (rounded + stroke, gradient ellipse, translucent rect), icon, slots, bar, divider. */
const blocks = (): Element[] => [
  createElement('panel', { x: 2, y: 2, w: 116, h: 76 }),
  createElement('button', { x: 8, y: 8, w: 40, h: 20, text: '', icon: null }),
  createElement('shape', { x: 52, y: 8, w: 30, h: 20, shape: 'rounded', radius: 6, fill: '#3366ccc0', stroke: '#ffffff', strokeWidth: 1 }),
  createElement('shape', { x: 86, y: 8, w: 26, h: 26, shape: 'ellipse', fill: '#ff8800', gradient: { to: '#00ff88', direction: 'vertical' } }),
  createElement('icon', { x: 8, y: 34, icon: 'sword', scale: 2, tint: null }),
  createElement('slotgrid', { x: 44, y: 34, rows: 1, cols: 3, slotSize: 18, gap: 2 }),
  createElement('bar', { x: 8, y: 68, w: 100, h: 6, value: 60, text: '' }),
  createElement('divider', { x: 8, y: 60, w: 100, h: 4, style: 'dashed', thickness: 1, color: '#ffffff' }),
  createElement('shape', { x: 60, y: 40, w: 40, h: 16, shape: 'rect', fill: '#ff0000', opacity: 0.5 }),
];

/** FNV-1a of `blocks()` at 1x, 120x80, bg #202030, rendered by the code of commit d39d556 (before Stage H). */
const BLOCKS_1X: Record<SkinId, string> = { vanilla: 'fabd3657', dark: 'a2c55dcd', holo: '4e04cc5d', parchment: 'cf918e33' };

const label = (props: Partial<LabelElement>): Element =>
  createElement('label', { x: 0, y: 0, w: 80, h: 70, fontSize: 12, color: '#ffffff', ...props });
const LONG = '選單工坊的文字在遊戲裡應該要清楚可讀';

describe('render scale', () => {
  it('allocates page px x scale texels and rejects other scales', () => {
    for (const s of [1, 2, 3, 4]) render([], 10, 6, s);
    const page = createPage({ width: 10, height: 6 });
    const project = createProject({ pages: [page] });
    for (const bad of [0, 5, 1.5]) expect(() => renderPageToCanvas(page, project, makeEnv(), { scale: bad })).toThrow(/render scale/);
  });

  it('text-free pages: 1x pixels unchanged since d39d556, 2x-4x are exact nearest-neighbour blocks of 1x', () => {
    for (const skinId of ['vanilla', 'dark', 'holo', 'parchment'] as const) {
      const one = render(blocks(), 120, 80, 1, { skinId, bg: '#202030' });
      expect(fnv(one), skinId).toBe(BLOCKS_1X[skinId]);
      for (const s of [2, 3, 4]) expect(same(render(blocks(), 120, 80, s, { skinId, bg: '#202030' }), upscale(one, 120, 80, s)), `${skinId} ${s}x`).toBe(true);
    }
  });

  it('images honour their smoothing flag at the higher resolution', () => {
    const img = createCanvas(2, 1);
    const c = img.getContext('2d');
    c.fillStyle = '#ff0000';
    c.fillRect(0, 0, 1, 1);
    c.fillStyle = '#0000ff';
    c.fillRect(1, 0, 1, 1);
    const env = makeEnv(new Map([['a', img as unknown as ImageLike]]));
    const el = (smoothing: boolean) => createElement('image', { x: 0, y: 0, w: 8, h: 4, assetId: 'a', fit: 'stretch', smoothing });
    const colours = (d: Uint8ClampedArray) => new Set(Array.from({ length: d.length / 4 }, (_, i) => d.slice(i * 4, i * 4 + 3).join(',')));
    const crisp = render([el(false)], 8, 4, 2, { env });
    expect([...colours(crisp)].sort()).toEqual(['0,0,255', '255,0,0']);
    expect(colours(render([el(true)], 8, 4, 2, { env })).size).toBeGreaterThan(2);
  });

  it('a label at 2x and 3x has scale times the texels and the same line breaks as at 1x', () => {
    const env = makeEnv(); // shared on purpose: the 1x bitmap in the cache must not be reused at 2x
    const el = label({ text: LONG, lineHeight: 1.6, pixelate: 'off' });
    const one = inkBands(render([el], 80, 70, 1, { env }), 80, 70);
    expect(one.length).toBe(3);
    for (const s of [2, 3]) {
      const d = render([el], 80, 70, s, { env });
      const bands = inkBands(d, 80 * s, 70 * s);
      expect(bands.length, `${s}x`).toBe(one.length);
      bands.forEach(([a, b], i) => expect(Math.abs((a + b) / 2 - ((one[i][0] + one[i][1]) / 2) * s), `${s}x line ${i}`).toBeLessThanOrEqual(s));
      // real detail at the higher resolution, not a blown-up 1x bitmap
      expect(same(d, upscale(render([el], 80, 70, 1, { env }), 80, 70, s))).toBe(false);
    }
  });

  it('layoutText works in page px from the 1x measure (wrap, alignment, vertical middle, shadow column)', () => {
    const st: TextStyle = {
      fontSize: 10, bold: false, family: '', color: '#fff', shadow: '#000', align: 'right', vAlign: 'middle', lineHeight: 1.2, wrap: true, pixelate: false,
    };
    const measure = (t: string) => [...t].length * 10;
    const lines = layoutText(measure, '一二三四五六七', 51, 40, st);
    expect(lines).toEqual([
      { text: '一二三四五', x: 0, y: 7 + 6 },
      { text: '六七', x: 30, y: 7 + 12 + 6 },
    ]);
    expect(layoutText(measure, '一二', 51, 40, { ...st, align: 'center', vAlign: 'top', shadow: null })).toEqual([{ text: '一二', x: 15, y: 6 }]);
  });

  it('pixelate: "on" keeps the 1x retro look at every scale, "auto" only at 1x, "off" never', () => {
    expect([autoPixelate(12, 1), autoPixelate(13, 1), autoPixelate(14, 1), autoPixelate(12, 2), autoPixelate(8, 4)]).toEqual([true, true, false, false, false]);
    const dc = (scale: number): DrawContext => {
      const skin = getSkin('dark');
      return { skin, kit: skinKit(skin, null), env: makeEnv(), project: createProject(), placeholders: false, scale };
    };
    const px = (mode: 'auto' | 'on' | 'off', scale: number, fontSize = 12) =>
      labelStyle(createElement('label', { pixelate: mode, fontSize }) as LabelElement, dc(scale)).pixelate;
    expect([px('auto', 1), px('auto', 2), px('auto', 3, 10), px('auto', 1, 16)]).toEqual([true, false, false, false]);
    expect([px('on', 1), px('on', 4), px('off', 1), px('off', 2)]).toEqual([true, true, false, false]);

    const on = label({ text: '像素風 Pixel', pixelate: 'on', shadow: true });
    const one = render([on], 80, 70, 1);
    for (const s of [2, 3]) expect(same(render([on], 80, 70, s), upscale(one, 80, 70, s)), `on ${s}x`).toBe(true);
    const alphas = (d: Uint8ClampedArray) => new Set(Array.from({ length: d.length / 4 }, (_, i) => d[i * 4 + 3]));
    const auto = label({ text: '自動 Auto', pixelate: 'auto' });
    expect([...alphas(render([auto], 80, 70, 1))].sort((a, b) => a - b)).toEqual([0, 255]);
    expect(alphas(render([auto], 80, 70, 2)).size).toBeGreaterThan(2); // anti-aliased at 2x
  });

  it('the shadow is offset by one page px = scale texels', () => {
    for (const s of [1, 2, 3]) {
      const plain = render([label({ text: '陰影 Shadow', pixelate: 'off', wrap: false })], 80, 70, s);
      const shadowed = render([label({ text: '陰影 Shadow', pixelate: 'off', wrap: false, shadow: true })], 80, 70, s);
      const W = 80 * s, H = 70 * s;
      const a = (d: Uint8ClampedArray, x: number, y: number) => (x < 0 || y < 0 ? 0 : d[(y * W + x) * 4 + 3]);
      let wrong = 0, shadowOnly = 0;
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const expectInk = a(plain, x, y) > 0 || a(plain, x - s, y - s) > 0;
          if ((a(shadowed, x, y) > 0) !== expectInk) wrong++;
          if (!a(plain, x, y) && a(shadowed, x, y)) shadowOnly++;
        }
      expect(wrong, `${s}x`).toBe(0);
      expect(shadowOnly, `${s}x`).toBeGreaterThan(0);
    }
  });

  it('the text cache key includes the raster scale (1 for pixelated text)', () => {
    const st: TextStyle = {
      fontSize: 12, bold: false, family: '', color: '#fff', shadow: null, align: 'left', vAlign: 'top', lineHeight: 1.2, wrap: true, pixelate: false,
    };
    expect(textRasterScale(st, 3)).toBe(3);
    expect(textRasterScale({ ...st, pixelate: true }, 3)).toBe(1);
    expect(textCacheKey('a', 10, 10, st, 1)).not.toBe(textCacheKey('a', 10, 10, st, 2));
    expect(textCacheKey('a', 10, 10, st, 2)).toBe(textCacheKey('a', 10, 10, { ...st }, 2));
  });

  it('canvas size guard: 16,000,000 texels per page, display fallback to the largest scale that fits', () => {
    expect(MAX_CANVAS_PIXELS).toBe(16_000_000);
    expect(canvasPixels(1000, 600, 4)).toBe(9_600_000);
    expect(fitsCanvas(1000, 600, 4)).toBe(true);
    expect(fitsCanvas(1012, 1000, 4)).toBe(false); // 16,192,000
    expect(fitScale(1012, 1000, 4)).toBe(3);
    expect(fitScale(1000, 600, 4)).toBe(4);
    expect(fitScale(5000, 4000, 2)).toBe(1);
    expect([0, 1, 2, 3, 4, 5, 2.5, '2'].map(isRenderScale)).toEqual([false, true, true, true, true, false, false, false]);
  });
});
