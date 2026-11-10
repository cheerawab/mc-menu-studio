// Export resolution (Stage H): tile glyph cells of T x scale texels with JSON height T, the client's float advance,
// the tile table, the 255-texel atlas limit, scale-invariant layout and the canvas guard.
import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { buildExport, ExportError, resolveOptions, type ExportOptions, type ExportPage } from '../export';
import { upscaleImage } from '../export/calibration';
import { bitmapAdvance, defaultTileSize, glyphAdvance, MAX_CELL_TEXELS, TILE_SIZE_BY_SCALE } from '../export/constants';
import { decodePng } from '../export/png';
import { checkExport, exportPagesFromProject } from '../export/project';
import { DEMO_PACK_KB, resolutionLines } from '../export/readme';
import { TileSet } from '../export/tiles';
import { createPage, createProject } from '../model/defaults';
import type { RenderScale } from '../model/types';
import type { CanvasLike, RenderEnv } from '../render/types';
import { TEMPLATES } from '../templates';

const makeEnv = (): RenderEnv => ({ createCanvas: (w, h) => createCanvas(w, h) as unknown as CanvasLike });
const opts = (extra: Partial<ExportOptions> = {}): ExportOptions => ({
  namespace: 'sc', packName: '解析度', mode: 'registry', quickActions: false, afterAction: 'close', ...extra,
});
const dec = (b?: Uint8Array) => new TextDecoder().decode(b);

/** 100x70 page: a gradient block (unique tiles), an opaque block touching x = 99, a 1 px column, three regions. */
function page1x(key = 'p'): ExportPage {
  const W = 100, H = 70;
  const data = new Uint8Array(W * H * 4);
  const set = (x: number, y: number, c: number[]) => data.set(c, (y * W + x) * 4);
  for (let y = 0; y < 40; y++) for (let x = 0; x < 50; x++) set(x, y, [x * 5, y * 6, 90, 255]);
  for (let y = 20; y < 70; y++) for (let x = 60; x < 100; x++) set(x, y, [30, 160, 60, 255]);
  for (let y = 45; y < 60; y++) set(40, y, [255, 255, 255, 200]);
  return {
    key, title: key, footerLabel: '', image: { width: W, height: H, data },
    regions: [
      { x: 0, y: 0, w: 100, h: 70, action: { type: 'command', command: 'list' }, tooltip: '' },
      { x: 5, y: 2, w: 30, h: 3, action: { type: 'copy', text: 'top' }, tooltip: '頂端' },
      { x: 60, y: 20, w: 40, h: 50, action: { type: 'close' }, tooltip: '關閉' },
    ],
  };
}
const atScale = (p: ExportPage, s: number): ExportPage =>
  ({ ...p, image: upscaleImage(p.image, s), width: p.image.width, height: p.image.height });

describe('advance (DECOMPILED fact 2: (int) (0.5 + actualWidth * pixelScale) + 1, float math)', () => {
  it('scale 1 (height == cell): actual width + 1, as verified in the game', () => {
    for (let aw = 0; aw <= 128; aw++) expect(glyphAdvance(aw)).toBe(aw + 1);
    expect(bitmapAdvance(32, 32, 32)).toBe(33);
  });

  it('hand-computed values at 2x, 3x and 4x', () => {
    // 2x, T 32, cell 64, pixelScale 0.5: odd widths are exact halves and round up
    expect([64, 63, 62, 33, 1, 0].map((aw) => bitmapAdvance(aw, 32, 64))).toEqual([33, 33, 32, 18, 2, 1]);
    // 3x, T 24, cell 72, pixelScale = (float) 1/3 = 0.3333333432674408:
    // 72 -> 24.0000007 -> float 24 -> 25; 71 -> 23.67 -> 24 + 1 = 25; 70 -> 23.33 -> 23 + 1 = 24; 1 -> 0.33 -> 0 + 1
    expect(Math.fround(24 / 72)).toBe(0.3333333432674408);
    expect([72, 71, 70, 2, 1].map((aw) => bitmapAdvance(aw, 24, 72))).toEqual([25, 25, 24, 2, 1]);
    // 4x, T 16, cell 64, pixelScale 0.25: 62 -> 15.5 rounds up, 61 -> 15.25 rounds down
    expect([64, 63, 62, 61, 2, 1].map((aw) => bitmapAdvance(aw, 16, 64))).toEqual([17, 17, 17, 16, 2, 1]);
    // glyphAdvance(aw, scale) is the same formula for tile cells of any T
    for (const s of [2, 3, 4]) for (let aw = 0; aw <= 72; aw++) expect(glyphAdvance(aw, s)).toBe(bitmapAdvance(aw, 24, 24 * s));
  });

  it('float, not exact or double arithmetic (cases outside the 1/scale ratios the exporter uses)', () => {
    // 13/22 as a float is 0.59090906; 11 * that = 6.4999995 (float) -> 6 + 1 (exact 6.5 would give 8)
    expect(bitmapAdvance(11, 13, 22)).toBe(7);
    // 15/22 as a float is 0.68181819; 11 * that rounds to exactly 7.5 in float -> 8 + 1 (double-only math gives 8)
    expect(bitmapAdvance(11, 15, 22)).toBe(9);
  });
});

describe('export at 1x-4x', () => {
  it('tile table: 1x 32, 2x 32, 3x 24, 4x 16 px (cells <= 72 texels); an explicit tileSize wins', () => {
    expect([1, 2, 3, 4].map(defaultTileSize)).toEqual([32, 32, 24, 16]);
    for (const s of [1, 2, 3, 4] as const) {
      expect(TILE_SIZE_BY_SCALE[s] * s).toBeLessThanOrEqual(72);
      expect(resolveOptions(opts({ scale: s })).tileSize).toBe(TILE_SIZE_BY_SCALE[s]);
    }
    expect(resolveOptions(opts()).scale).toBe(1);
    expect(resolveOptions(opts({ scale: 3, tileSize: 20 })).tileSize).toBe(20);
    const b = buildExport([atScale(page1x(), 3)], opts({ scale: 3, tileSize: 20 }));
    expect(b.stats).toMatchObject({ scale: 3, tileSize: 20, cellTexels: 60 });
  });

  it('refuses cells above 255 texels (the 256 x 256 atlas limit)', () => {
    expect(MAX_CELL_TEXELS).toBe(255);
    expect(() => buildExport([atScale(page1x(), 2)], opts({ scale: 2, tileSize: 128 }))).toThrow(ExportError);
    expect(() => buildExport([atScale(page1x(), 2)], opts({ scale: 2, tileSize: 128 }))).toThrow(/255/);
    expect(() => buildExport([atScale(page1x(), 4)], opts({ scale: 4, tileSize: 64 }))).toThrow(/256 像素/);
    expect(buildExport([atScale(page1x(), 3)], opts({ scale: 3, tileSize: 85 })).stats.cellTexels).toBe(255);
    expect(() => new TileSet(128, 2)).toThrow(/256 texels/);
  });

  it('sheets: PNG cells of T x scale texels, font height T (GUI px), ascent as at 1x; hit sheets stay 1x', () => {
    for (const s of [1, 2, 3, 4] as const) {
      const b = buildExport([atScale(page1x(), s)], opts({ scale: s }));
      const T = TILE_SIZE_BY_SCALE[s];
      const tiles = b.sheets.filter((x) => x.name.startsWith('tiles_'));
      expect(tiles.length).toBeGreaterThan(0);
      for (const sheet of tiles) {
        const png = decodePng(b.resourcePack.get(`assets/sc/textures/font/${sheet.name}.png`)!);
        expect([png.width, png.height], `${s}x ${sheet.name}`).toEqual([sheet.cols * T * s, sheet.rows * T * s]);
        expect([sheet.cellW, sheet.cellH, sheet.height]).toEqual([T * s, T * s, T]);
      }
      for (const f of b.fonts) {
        const font = JSON.parse(dec(b.resourcePack.get(`assets/sc/font/y${f.offset}.json`)));
        for (const p of font.providers.slice(1)) {
          const sheet = b.sheets.find((x) => p.file === `sc:font/${x.name}.png`)!;
          expect(p.ascent).toBe(7 - f.offset);
          expect(p.height).toBe(sheet.name.startsWith('hit_') ? sheet.cellH : T);
        }
      }
      for (const hit of b.sheets.filter((x) => x.name.startsWith('hit_'))) expect(hit.height).toBe(hit.cellH);
    }
  });

  it('regions, hit boxes, message width and lines are identical at every scale', () => {
    const shape = (s: number) =>
      buildExport([atScale(page1x('a'), s), atScale(page1x('b'), s)], opts({ scale: s as RenderScale })).pages.map((p) => ({
        size: [p.width, p.height], regions: p.regions, hits: p.hits, width: p.layout.messageWidth, lines: p.layout.lines,
      }));
    const one = shape(1);
    expect(one[0].hits.length).toBe(3);
    for (const s of [2, 3, 4]) expect(shape(s), `${s}x`).toEqual(one);
  });

  it('checks that every page image is page px x scale', () => {
    const p = atScale(page1x(), 2);
    expect(() => buildExport([p], opts())).toThrow(/100×70 頁面像素 × 1 倍/);
    expect(() => buildExport([{ ...p, width: 101 }], opts({ scale: 2 }))).toThrow(ExportError);
    const noSize: ExportPage = { ...p };
    delete noSize.width;
    delete noSize.height;
    expect(buildExport([noSize], opts({ scale: 2 })).pages[0].width).toBe(100); // size derived from the image
    const odd = { width: 201, height: 140, data: new Uint8Array(201 * 140 * 4) }; // not a multiple of 2
    expect(() => buildExport([{ ...noSize, image: odd }], opts({ scale: 2 }))).toThrow(/尺寸不正確/);
    expect(() => buildExport([page1x()], opts({ scale: 5 as RenderScale }))).toThrow(/1、2、3 或 4/);
  });

  it('renders projects at their 解析度 and guards the 16,000,000-texel canvas in the export checks', () => {
    const project = TEMPLATES[0].build();
    expect(project.settings.renderScale).toBe(2);
    const [first] = exportPagesFromProject(project, makeEnv());
    expect([first.image.width, first.image.height]).toEqual([first.width! * 2, first.height! * 2]);
    const [one] = exportPagesFromProject(project, makeEnv(), undefined, 1);
    expect([one.image.width, one.width]).toEqual([one.width, project.pages[0].width]);

    const bigPage = createPage({ key: 'big' });
    Object.assign(bigPage, { width: 1012, height: 1000 }); // larger than the editor allows (e.g. a hand-edited file)
    const big = createProject({ pages: [bigPage] });
    const guard = (s: RenderScale) =>
      checkExport({ ...big, settings: { ...big.settings, renderScale: s } }).filter((i) => i.code === 'export-canvas-size');
    expect(guard(4).map((i) => i.severity)).toEqual(['error']);
    expect(guard(4)[0].message).toContain('解析度');
    expect(guard(3)).toEqual([]);
  });

  it('the README states the resolution, the GUI-scale rule and the measured pack sizes', () => {
    const b = buildExport([atScale(page1x(), 3)], opts({ scale: 3 }));
    expect(b.readme).toContain('這次匯出使用 3x');
    expect(b.readme).toContain('圖塊 24 px，字型格 72×72');
    expect(b.readme).toContain('介面大小 2 → 2x、介面大小 3 → 3x、介面大小 4 → 4x 或 2x');
    expect(b.readme).toContain(`1x ${DEMO_PACK_KB[1]} KB`);
    expect(resolutionLines(2, 32).join('\n')).toContain('約 5 倍');
    expect(Object.values(DEMO_PACK_KB).every((kb) => kb > 0)).toBe(true);
  });
});
