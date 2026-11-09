import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { buildExport, ExportError, zipExport, type ExportBuild, type ExportMode, type ExportOptions, type ExportPage } from '../export';
import { CALIBRATION_KEY, calibrationPage } from '../export/calibration';
import { demoOptions, demoPages } from '../export/demo';
import { clickEvent, hoverEvent } from '../export/dialogs';
import type { CanvasLike, RenderEnv } from '../render/types';
import { loadFonts, normalised, simulatePage } from './helpers/clientSim';

const makeEnv = (): RenderEnv => ({ createCanvas: (w, h) => createCanvas(w, h) as unknown as CanvasLike });
const MODES: ExportMode[] = ['registry', 'functions'];
const opts = (mode: ExportMode, extra: Partial<ExportOptions> = {}): ExportOptions => ({
  namespace: 'gold', packName: '黃金測試', mode, quickActions: true, afterAction: 'close', ...extra,
});
const dec = (b?: Uint8Array) => new TextDecoder().decode(b);

function painter(w: number, h: number) {
  const data = new Uint8Array(w * h * 4);
  const set = (x: number, y: number, c: readonly number[]) => data.set(c, (y * w + x) * 4);
  const rect = (x: number, y: number, rw: number, rh: number, c: readonly number[]) => {
    for (let j = y; j < y + rh; j++) for (let i = x; i < x + rw; i++) set(i, j, c);
  };
  return { set, rect, image: { width: w, height: h, data } };
}

const SOLID = [40, 90, 200, 255];

/** 300x150: opaque tiles (advance 33), identical tiles, empty tiles with RGB garbage under alpha 0, a 5 px wide tile,
 * a tile whose only pixel is in its last column, an edge tile opaque up to x = W (peak W + 1), translucent pixels;
 * regions: page-wide background (split 3x2), overlaps, a 300 px strip (split 3), a top-band region (extended),
 * hover-only, page link, an event-less region (skipped) and one clipped by the page edge. */
function menuPage(): ExportPage {
  const W = 300, H = 150;
  const p = painter(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < 160; x++) p.set(x, y, [x & 255, (y * 2) & 255, (x * y) & 255, 255]);
  p.rect(160, 0, 64, 64, SOLID);
  for (let x = 224; x < W; x += 3) p.set(x, 5, [200, 10, 10, 0]);
  p.rect(224, 32, 5, 32, [250, 250, 250, 255]);
  p.set(287, 40, [255, 0, 0, 255]);
  p.rect(288, 32, 12, 32, [0, 200, 0, 255]);
  for (let y = 64; y < H; y++) for (let x = 160; x < W; x++) p.set(x, y, [x & 255, 255 - (y & 255), 90, (x + y * 3) % 256]);
  return {
    key: 'menu', title: '選單 "測試"', footerLabel: '關閉', image: p.image,
    regions: [
      { x: 0, y: 0, w: 300, h: 150, action: { type: 'command', command: 'list' }, tooltip: '' },
      { x: 10, y: 30, w: 60, h: 24, action: { type: 'command', command: 'time set day' }, tooltip: '白天' },
      { x: 20, y: 35, w: 20, h: 10, action: { type: 'url', url: 'https://example.com/?q="x"' }, tooltip: '' },
      { x: 0, y: 120, w: 300, h: 20, action: { type: 'command', command: 'weather clear' }, tooltip: '' },
      { x: 50, y: 0, w: 30, h: 4, action: { type: 'copy', text: 'top "band" \\ copy' }, tooltip: 'top band' },
      { x: 200, y: 70, w: 40, h: 40, action: { type: 'none' }, tooltip: '只有提示\n第二行' },
      { x: 150, y: 60, w: 50, h: 30, action: { type: 'page', key: 'second' }, tooltip: '下一頁' },
      { x: 5, y: 5, w: 10, h: 10, action: { type: 'none' }, tooltip: '  ' },
      { x: 280, y: 140, w: 40, h: 30, action: { type: 'close' }, tooltip: 'close' },
    ],
  };
}

function secondPage(): ExportPage {
  const p = painter(120, 60);
  p.rect(0, 0, 120, 60, [60, 20, 80, 255]);
  p.rect(32, 0, 64, 32, SOLID); // the same tile bitmap as on the menu page
  return { key: 'second', title: 'Page 2', footerLabel: '返回', image: p.image, regions: [{ x: 10, y: 34, w: 100, h: 20, action: { type: 'page', key: 'menu' }, tooltip: '返回' }] };
}

function blankPage(key = 'blank'): ExportPage {
  const p = painter(64, 64);
  for (let i = 0; i < 32; i++) {
    p.set(i, i, [255, 255, 255, 255]);
    p.set(32 + i, 32 + i, [255, 128, 0, 200]);
  }
  return { key, title: '', footerLabel: '', image: p.image, regions: [] };
}

interface Active {
  x0: number; y0: number; x1: number; y1: number;
  click?: string; hover?: string;
}

/** Regions the client should see: clipped, event-less ones dropped, and extended to the baseline (y = 7) if shorter. */
function activeRegions(page: ExportPage, build: ExportBuild): Active[] {
  const { namespace: ns, mode } = build.options;
  const W = page.image.width, H = page.image.height;
  const out: Active[] = [];
  for (const r of page.regions) {
    const x0 = Math.max(0, r.x), y0 = Math.max(0, r.y), x1 = Math.min(W, r.x + r.w), y1 = Math.min(H, r.y + r.h);
    if (x1 <= x0 || y1 <= y0) continue;
    const c = clickEvent(r.action, ns, mode), hv = hoverEvent(r.tooltip);
    if (!c && !hv) continue;
    out.push({ x0, y0, x1, y1: Math.max(y1, 7), click: c ? JSON.stringify(c) : undefined, hover: hv ? JSON.stringify(hv) : undefined });
  }
  return out;
}

/** Golden check of one page: decode the generated files like the client and compare with the source. */
function assertPage(build: ExportBuild, page: ExportPage) {
  const W = page.image.width, H = page.image.height;
  const sim = simulatePage(build, page.key, W, H);
  const where = `page ${page.key} (${build.options.mode})`;
  expect(sim.messageWidth, where).toBe(W + 12);
  expect([sim.badStyle, sim.badEventRuns, sim.offLine, sim.outside, sim.overlaps], where).toEqual([0, 0, 0, 0, 0]);
  expect(sim.endOfLine, where).toBe(W);
  expect(sim.peak, where).toBeLessThanOrEqual(W + 4);
  expect(sim.newlines, where).toBe(Math.ceil(H / 9));
  // every tile lands at its source position, pixel for pixel
  expect(Buffer.from(sim.canvas).equals(Buffer.from(normalised(page.image.data))), `${where}: pixels`).toBe(true);

  // every hit glyph box is <= 128 px, and per event the union of boxes equals the union of the regions
  const active = activeRegions(page, build);
  const hitKey = (h: { click?: unknown; hover?: unknown }) => `${JSON.stringify(h.click)}|${JSON.stringify(h.hover)}`;
  const regKey = (a: Active) => `${a.click}|${a.hover}`;
  const Hm = Math.max(H, 7);
  const mask = () => new Uint8Array(W * Hm);
  const fill = (m: Uint8Array, x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) m[y * W + x] = 1;
  };
  let area = 0;
  for (const h of sim.hits) {
    expect(h.w <= 128 && h.h <= 128, `${where}: box size`).toBe(true);
    expect(h.x >= 0 && h.y >= 0 && h.x + h.w <= W && h.y + h.h <= Hm, `${where}: box inside`).toBe(true);
    area += h.w * h.h;
  }
  expect(area, `${where}: hit area`).toBe(active.reduce((n, a) => n + (a.x1 - a.x0) * (a.y1 - a.y0), 0));
  for (const key of new Set(active.map(regKey))) {
    const want = mask(), got = mask();
    for (const a of active) if (regKey(a) === key) fill(want, a.x0, a.y0, a.x1, a.y1);
    for (const h of sim.hits) if (hitKey(h) === key) fill(got, h.x, h.y, h.x + h.w, h.y + h.h);
    expect(Buffer.from(got).equals(Buffer.from(want)), `${where}: boxes of ${key}`).toBe(true);
  }
  // z-order: the last glyph in text order under the cursor wins (DECOMPILED §10) == the topmost region
  const boxes: Active[] = sim.hits.map((h) => ({
    x0: h.x, y0: h.y, x1: h.x + h.w, y1: h.y + h.h,
    click: h.click === undefined ? undefined : JSON.stringify(h.click),
    hover: h.hover === undefined ? undefined : JSON.stringify(h.hover),
  }));
  const top = (list: Active[], kind: 'click' | 'hover', x: number, y: number) => {
    for (let i = list.length - 1; i >= 0; i--) {
      const a = list[i];
      if (a[kind] !== undefined && x >= a.x0 && x < a.x1 && y >= a.y0 && y < a.y1) return a[kind];
    }
    return undefined;
  };
  let mismatches = 0;
  for (let y = 0; y < Hm; y += 2)
    for (let x = 0; x < W; x += 2)
      for (const kind of ['click', 'hover'] as const) if (top(boxes, kind, x, y) !== top(active, kind, x, y)) mismatches++;
  expect(mismatches, `${where}: z-order mismatches`).toBe(0);
}

describe('exporter golden client simulation', () => {
  it.each(MODES)('synthetic pages land pixel-exactly with exact hit boxes (%s)', (mode) => {
    const pages = [menuPage(), secondPage(), blankPage()];
    const build = buildExport(pages, opts(mode));
    for (const p of pages) assertPage(build, p);
    expect(build.stats.regions).toBe(9);
    expect(build.stats.hitGlyphs).toBe(6 + 1 + 1 + 3 + 1 + 1 + 1 + 1 + 1);
    expect(build.stats.tilesUnique).toBeLessThan(build.stats.tilesPlaced);
    expect(build.warnings.map((w) => w.code)).toEqual(['hit-extended']);
    // navigation events per mode
    const nav = JSON.stringify(build.pages[0].dialog);
    expect(nav).toContain(mode === 'registry' ? '"show_dialog","dialog":"gold:second"' : '"command":"function gold:show_second"');
  });

  it('calibration page: grid, corners and a 256 px region split into two 128 px boxes', () => {
    const page = calibrationPage('menu');
    const build = buildExport([page, menuPage(), secondPage()], opts('functions'));
    assertPage(build, page);
    const cal = build.pages[0];
    expect(cal.key).toBe(CALIBRATION_KEY);
    expect(cal.hits.filter((h) => h.box.y === 140).map((h) => h.box.w)).toEqual([128, 128]);
    expect(cal.layout.offsets).toEqual([0, 1, 32, 64, 96, 100, 128, 140, 151]);
  });

  it('every template page rendered by the shared renderer survives the round trip (both modes)', () => {
    const pages = demoPages(makeEnv());
    expect(pages.map((p) => p.key)).toEqual([
      'calibration', 'lobby', 'lobby_rules', 'rules', 'rules_welcome', 'shop', 'quick', 'settings', 'notice',
    ]);
    for (const mode of MODES) {
      const build = buildExport(pages, demoOptions(mode));
      for (const p of pages) assertPage(build, p);
      expect(build.warnings).toEqual([]);
    }
  });
});

describe('exporter output', () => {
  it('writes registry and functions data packs and an identical resource pack for both', () => {
    const pages = [menuPage(), secondPage()];
    const reg = buildExport(pages, opts('registry'));
    const fn = buildExport(pages, opts('functions', { quickActions: true }));
    expect([...reg.dataPack.keys()].sort()).toEqual([
      'data/gold/dialog/menu.json', 'data/gold/dialog/second.json', 'data/minecraft/tags/dialog/quick_actions.json', 'pack.mcmeta',
    ]);
    expect(JSON.parse(dec(reg.dataPack.get('data/minecraft/tags/dialog/quick_actions.json')))).toEqual({ values: ['gold:menu'] });
    expect([...fn.dataPack.keys()].sort()).toEqual(['data/gold/function/show_menu.mcfunction', 'data/gold/function/show_second.mcfunction', 'pack.mcmeta']);
    expect(fn.options.quickActions).toBe(false);
    expect(buildExport(pages, opts('registry', { quickActions: false })).dataPack.has('data/minecraft/tags/dialog/quick_actions.json')).toBe(false);
    expect([...reg.resourcePack.keys()]).toEqual([...fn.resourcePack.keys()]);
    for (const [k, v] of reg.resourcePack) expect(Buffer.from(v).equals(Buffer.from(fn.resourcePack.get(k)!)), k).toBe(true);

    expect(JSON.parse(dec(reg.resourcePack.get('pack.mcmeta'))).pack).toMatchObject({ min_format: 97, max_format: 97 });
    expect(JSON.parse(dec(reg.dataPack.get('pack.mcmeta'))).pack).toMatchObject({ min_format: 121, max_format: 121 });
    const dialog = JSON.parse(dec(reg.dataPack.get('data/gold/dialog/second.json')));
    expect(dialog).toMatchObject({
      type: 'minecraft:notice', title: { text: 'Page 2' }, can_close_with_escape: true, pause: false, after_action: 'close',
      action: { label: { text: '返回' }, width: 150 },
    });
    expect(dialog.body[0]).toMatchObject({ type: 'minecraft:plain_message', width: 132 });

    // fonts: space provider first everywhere, glyph code points never in the space block, only used offsets
    const fonts = loadFonts(reg);
    const yFonts = [...fonts.keys()].filter((k) => k !== 'gold:space');
    expect(yFonts.map((k) => Number(k.slice('gold:y'.length))).sort((a, b) => a - b)).toEqual(reg.fonts.map((f) => f.offset));
    for (const k of yFonts) {
      const font = JSON.parse(dec(reg.resourcePack.get(`assets/gold/font/${k.slice(5)}.json`)));
      expect(font.providers[0].type).toBe('space');
      for (const [cp, g] of fonts.get(k)!) if (g.kind === 'bitmap') expect(cp).toBeGreaterThanOrEqual(0xe100);
    }
  });

  it('is byte-reproducible: same input twice => identical zips (fresh renderers)', async () => {
    const zips = async () => {
      const pages = [...demoPages(makeEnv()), menuPage(), secondPage()];
      return zipExport(buildExport(pages, { ...demoOptions('registry', true) }));
    };
    const [a, b] = [await zips(), await zips()];
    expect(Buffer.from(a.resourcePack).equals(Buffer.from(b.resourcePack))).toBe(true);
    expect(Buffer.from(a.dataPack).equals(Buffer.from(b.dataPack))).toBe(true);
    expect(a.autotest && b.autotest && Buffer.from(a.autotest).equals(Buffer.from(b.autotest))).toBe(true);
  });

  it('handles one page without regions', () => {
    const page = blankPage('only');
    const build = buildExport([page], opts('registry'));
    assertPage(build, page);
    expect(build.stats).toMatchObject({ pages: 1, regions: 0, hitGlyphs: 0, tilesPlaced: 2, tilesEmpty: 2 });
    expect(build.pages[0].footerLabel).toBe('關閉');
    expect(build.readme).toContain('/dialog show @s gold:only');
  });

  it('handles many linked pages', () => {
    const pages: ExportPage[] = Array.from({ length: 24 }, (_, k) => {
      const p = painter(64 + k, 40);
      p.rect(0, 0, 64 + k, 40, [k * 10, 255 - k * 10, 77, 255]);
      p.rect(k, 3, 9, 9, [255, 255, 255, 255]);
      return {
        key: `p${k}`, title: `第 ${k} 頁`, footerLabel: '關閉', image: p.image,
        regions: [
          { x: 2, y: 20, w: 20, h: 12, action: { type: 'page', key: `p${(k + 1) % 24}` }, tooltip: '下一頁' },
          { x: 30, y: 20, w: 20, h: 12, action: { type: 'page', key: `p${(k + 23) % 24}` }, tooltip: '上一頁' },
        ],
      };
    });
    for (const mode of MODES) {
      const build = buildExport(pages, opts(mode));
      for (const p of pages) assertPage(build, p);
      expect(build.dataPack.size).toBe(mode === 'registry' ? 24 + 2 : 24 + 1);
      expect(build.stats.hitSizes).toBe(1);
    }
  });

  it('rejects input the game cannot load', () => {
    const ok = [menuPage(), secondPage()];
    expect(() => buildExport(ok, opts('registry', { namespace: 'Bad-NS' }))).toThrow(ExportError);
    expect(() => buildExport(ok, opts('registry', { namespace: 'minecraft' }))).toThrow(/minecraft/);
    expect(() => buildExport([menuPage()], opts('registry'))).toThrow(/second/);
    expect(() => buildExport([secondPage(), { ...secondPage(), regions: [] }], opts('registry'))).toThrow(/重複/);
    const wide = painter(1013, 16);
    expect(() => buildExport([{ ...blankPage(), image: wide.image }], opts('registry'))).toThrow(/1012/);
    expect(() => buildExport([], opts('registry'))).toThrow(ExportError);
  });
});
