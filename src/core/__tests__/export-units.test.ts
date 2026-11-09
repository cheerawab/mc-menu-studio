import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { GLYPH_RANGES, SPACE_BITS, ZIP_DATE_MS } from '../export/constants';
import { clickEvent, cleanText, functionSource, hoverEvent } from '../export/dialogs';
import { composePage, measureRuns, spaceAdvance, spaceChars, splitRegion } from '../export/layout';
import { asciiJson, autotestFiles, zipFiles } from '../export/pack';
import { decodePng, encodePng } from '../export/png';
import { CodepointAllocator, packSheets } from '../export/sheets';
import { toSnbt } from '../export/snbt';
import { actualWidth, TileSet } from '../export/tiles';
import { parseSnbt } from './helpers/clientSim';

const decodeMove = (s: string) => [...s].reduce((n, c) => n + spaceAdvance(c.codePointAt(0)!)!, 0);

describe('space encoding', () => {
  it('encodes every move exactly, with one sign and the fewest powers of two', () => {
    for (let dx = -1500; dx <= 1500; dx++) {
      const s = spaceChars(dx);
      expect(decodeMove(s)).toBe(dx);
      const signs = new Set([...s].map((c) => Math.sign(spaceAdvance(c.codePointAt(0)!)!)));
      expect(signs.size).toBeLessThanOrEqual(1);
      expect(s.length).toBe(Math.abs(dx).toString(2).replace(/0/g, '').length);
    }
    expect(spaceChars(0)).toBe('');
    expect(spaceChars(-201)).toBe(''); // VERIFIED §2: -128 -64 -8 -1
    expect(() => spaceChars(2 ** SPACE_BITS)).toThrow();
    expect(() => spaceChars(1.5)).toThrow();
  });

  it('only uses U+E000..U+E00A and U+E020..U+E02A', () => {
    const all = new Set([...spaceChars(2047) + spaceChars(-2047)].map((c) => c.codePointAt(0)!));
    for (const cp of all) expect((cp >= 0xe000 && cp <= 0xe00a) || (cp >= 0xe020 && cp <= 0xe02a)).toBe(true);
    expect(spaceAdvance(0xe100)).toBeNull();
  });
});

describe('tiles and sheets', () => {
  const img = (w: number, h: number, f: (x: number, y: number) => number[]) => {
    const data = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(f(x, y), (y * w + x) * 4);
    return { width: w, height: h, data };
  };

  it('skips empty tiles and dedupes identical ones, also across pictures', () => {
    const set = new TileSet(8);
    // 4 solid tiles, 4 empty tiles (with RGB garbage under alpha 0), 1 different tile
    const a = set.add(img(24, 24, (x, y) => (y < 8 ? [10, 20, 30, 255] : y < 16 ? [99, 99, 99, 0] : x < 8 ? [10, 20, 30, 255] : x < 16 ? [0, 0, 0, 0] : [1, 2, 3, 4])));
    expect(a.placed.map((p) => [p.x, p.y, p.tile])).toEqual([[0, 0, 0], [8, 0, 0], [16, 0, 0], [0, 16, 0], [16, 16, 1]]);
    expect(a.empty).toBe(4);
    const b = set.add(img(8, 8, () => [10, 20, 30, 255]));
    expect(b.placed[0].tile).toBe(0);
    expect(set.tiles).toHaveLength(2);
    // alpha-0 pixels are normalised, so garbage RGB under transparency does not break dedupe
    const c = set.add(img(8, 8, (x) => (x < 4 ? [10, 20, 30, 255] : [x * 9, 7, 7, 0])));
    const d = set.add(img(8, 8, (x) => (x < 4 ? [10, 20, 30, 255] : [0, 0, 0, 0])));
    expect(c.placed[0].tile).toBe(d.placed[0].tile);
    expect(set.tiles[c.placed[0].tile].actualWidth).toBe(4);
  });

  it('measures the actual width like the client (rightmost column with alpha > 0)', () => {
    const px = new Uint8Array(4 * 4 * 4);
    expect(actualWidth(px, 4, 4)).toBe(0);
    px[(2 * 4 + 2) * 4 + 3] = 1;
    expect(actualWidth(px, 4, 4)).toBe(3);
  });

  it('packs <= 16 columns, pads the chars grid with U+0000 and never touches the space block', () => {
    const alloc = new CodepointAllocator();
    const cells = Array.from({ length: 20 }, (_, i) => ({ pixels: new Uint8Array(8 * 8 * 4).fill(i + 1), cp: alloc.take() }));
    const { sheets, sheetOf } = packSheets('tiles', cells, 8, 8);
    expect(sheets).toHaveLength(1);
    expect(sheets[0].cols).toBe(16);
    expect(sheets[0].chars.map((r) => [...r].length)).toEqual([16, 16]);
    expect([...sheets[0].chars[1]].slice(4).every((c) => c === '\u0000')).toBe(true);
    expect(sheets[0].codepoints[0]).toBe(0xe100);
    expect(sheetOf.every((s) => s === 0)).toBe(true);
    const png = decodePng(sheets[0].png);
    expect([png.width, png.height]).toEqual([128, 16]);
    expect(png.data[(9 * 128 + 3 * 8) * 4]).toBe(20); // cell 19 (row 1, col 3) is filled with byte 20
    expect(png.data[(9 * 128 + 4 * 8) * 4 + 3]).toBe(0); // padding cell stays transparent
  });

  it('allocates BMP private use first, then supplementary private use', () => {
    const alloc = new CodepointAllocator();
    const n = GLYPH_RANGES[0][1] - GLYPH_RANGES[0][0] + 1;
    let last = 0;
    for (let i = 0; i < n; i++) last = alloc.take();
    expect(last).toBe(0xf8ff);
    expect(alloc.usesSupplementary).toBe(false);
    expect(alloc.take()).toBe(0xf0000);
    expect(alloc.usesSupplementary).toBe(true);
  });
});

describe('png', () => {
  it('round-trips and is deterministic', () => {
    const w = 37, h = 23;
    const data = new Uint8Array(w * h * 4);
    for (let i = 0; i < data.length; i++) data[i] = (i * 7919 + (i >> 5) * 13) & 0xff;
    for (let x = 0; x < w; x++) data.set([x * 6, 100, 200 - x, 255], (5 * w + x) * 4); // smooth row (Sub/Paeth wins)
    const a = encodePng(w, h, data);
    expect(Buffer.from(a).equals(Buffer.from(encodePng(w, h, data)))).toBe(true);
    expect(Array.from(a.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const back = decodePng(a);
    expect([back.width, back.height]).toEqual([w, h]);
    expect(Buffer.from(back.data).equals(Buffer.from(data))).toBe(true);
    expect(() => encodePng(2, 2, new Uint8Array(3))).toThrow();
  });
});

describe('snbt', () => {
  it('quotes keys, escapes quotes/backslashes/newlines and keeps private-use and CJK characters raw', () => {
    expect(toSnbt({ a: 'say "hi" \\ there\nnext' })).toBe('{"a":"say \\"hi\\" \\\\ there\\nnext"}');
    expect(toSnbt('選單')).toBe('"選單"');
    expect(toSnbt('😀')).toBe('"😀"');
    expect(toSnbt({ b: true, c: false, n: 0, m: -3, big: 3000000000, f: 1.5 })).toBe('{"b":true,"c":false,"n":0,"m":-3,"big":3000000000L,"f":1.5d}');
    expect(toSnbt(['', { text: 'x' }, { text: 'y', font: 'a:b' }])).toBe('["",{"text":"x"},{"text":"y","font":"a:b"}]');
    expect(toSnbt({ skip: undefined, keep: 1 })).toBe('{"keep":1}');
    expect(() => toSnbt(null)).toThrow();
    expect(() => toSnbt('bell\u0007')).toThrow();
  });

  it('round-trips a dialog-like structure through an SNBT reader', () => {
    const v = {
      type: 'minecraft:notice',
      title: { text: '標題 "引號" \\ 反斜線' },
      pause: false,
      body: [{ type: 'minecraft:plain_message', width: 212, contents: ['', { text: '', font: 'ns:y0', shadow_color: 0 }, { text: '\n\n' }] }],
    };
    expect(parseSnbt(toSnbt(v))).toEqual(v);
    expect(functionSource(v).startsWith('dialog show @s {"type":"minecraft:notice"')).toBe(true);
    expect(functionSource(v).endsWith('}\n')).toBe(true);
  });

  it('writes JSON with ASCII escapes for private-use characters', () => {
    expect(asciiJson({ t: '選' })).toBe('{"t":"\\ue100\\u9078"}');
    expect(JSON.parse(asciiJson({ t: '😀\u0000' }))).toEqual({ t: '😀\u0000' });
  });
});

describe('events', () => {
  it('maps actions for both modes', () => {
    expect(clickEvent({ type: 'page', key: 'shop' }, 'ns', 'registry')).toEqual({ action: 'show_dialog', dialog: 'ns:shop' });
    expect(clickEvent({ type: 'page', key: 'shop' }, 'ns', 'functions')).toEqual({ action: 'run_command', command: 'function ns:show_shop' });
    expect(clickEvent({ type: 'command', command: ' /time set day ' }, 'ns', 'registry')).toEqual({ action: 'run_command', command: 'time set day' });
    expect(clickEvent({ type: 'command', command: '  ' }, 'ns', 'registry')).toBeNull();
    expect(clickEvent({ type: 'url', url: 'https://a.b' }, 'ns', 'registry')).toEqual({ action: 'open_url', url: 'https://a.b' });
    expect(clickEvent({ type: 'copy', text: 'x' }, 'ns', 'registry')).toEqual({ action: 'copy_to_clipboard', value: 'x' });
    expect(clickEvent({ type: 'close' }, 'ns', 'functions')).toEqual({ action: 'run_command', command: 'dialog clear @s' });
    expect(clickEvent({ type: 'none' }, 'ns', 'registry')).toBeNull();
    expect(hoverEvent(' 第一行\r\n第二行\t ')).toEqual({ action: 'show_text', value: { text: '第一行\n第二行' } });
    expect(hoverEvent(' \n ')).toBeNull();
    expect(cleanText('a\u0001b\u007fc')).toBe('abc');
  });
});

describe('layout', () => {
  it('splits large regions into balanced <= 128 px cells and extends cells that end above the baseline', () => {
    expect(splitRegion({ x: 0, y: 140, w: 256, h: 6 }).pieces).toEqual([{ x: 0, y: 140, w: 128, h: 6 }, { x: 128, y: 140, w: 128, h: 6 }]);
    const big = splitRegion({ x: 3, y: 10, w: 300, h: 129 });
    expect(big.pieces.map((p) => [p.x, p.y, p.w, p.h])).toEqual([
      [3, 10, 100, 65], [103, 10, 100, 65], [203, 10, 100, 65],
      [3, 75, 100, 64], [103, 75, 100, 64], [203, 75, 100, 64],
    ]);
    expect(big.extended).toBe(false);
    expect(splitRegion({ x: 5, y: 2, w: 10, h: 3 })).toEqual({ pieces: [{ x: 5, y: 2, w: 10, h: 5 }], extended: true });
    expect(splitRegion({ x: 5, y: 0, w: 10, h: 7 }).extended).toBe(false);
  });

  it('keeps events off space runs, ends at exactly W and enforces the wrap rule', () => {
    const tiles = [
      { x: 0, y: 0, cp: 0xe100, advance: 33 },
      { x: 32, y: 0, cp: 0xe101, advance: 9 },
      { x: 0, y: 32, cp: 0xe101, advance: 9 },
    ];
    const L = composePage(40, 40, tiles, [{ x: 4, y: 4, cp: 0xe102, advance: 11, region: 0 }]);
    expect(L.messageWidth).toBe(52);
    expect(L.lines).toBe(5);
    expect(L.offsets).toEqual([0, 4, 32]);
    expect(L.runs.map((r) => [r.font, decodeMove([...r.text].filter((c) => spaceAdvance(c.codePointAt(0)!) !== null).join('')), r.region])).toEqual([
      [0, -1, undefined], // tile, -1, tile (merged)
      [32, -41, undefined],
      ['space', -5, undefined],
      [4, 0, 0], // the hit glyph alone
      ['space', 25, undefined],
    ]);
    const adv = new Map([[0xe100, 33], [0xe101, 9], [0xe102, 11]]);
    expect(measureRuns(L.runs, (cp) => adv.get(cp)!)).toEqual({ peak: 41, end: 40 });
    // a glyph that would push the running advance past W + 4 must be rejected
    expect(() => composePage(10, 9, [{ x: 0, y: 0, cp: 0xe100, advance: 16 }], [])).toThrow(/wrap rule/);
  });
});

describe('pack files and zips', () => {
  it('writes the auto-test schedule for both modes', () => {
    const dec = (b?: Uint8Array) => new TextDecoder().decode(b);
    const reg = dec(autotestFiles('demo', 'registry', ['a', 'b']).get('data/mcms_autotest/function/tick.mcfunction'));
    expect(reg).toContain('scoreboard players add @a mcms_t 1');
    expect(reg).toContain('execute as @a[scores={mcms_t=120}] run say PAGE a');
    expect(reg).toContain('execute as @a[scores={mcms_t=920}] run dialog show @s demo:b');
    expect(reg.indexOf('say PAGE b')).toBeLessThan(reg.indexOf('dialog show @s demo:b'));
    const fn = dec(autotestFiles('demo', 'functions', ['a']).get('data/mcms_autotest/function/tick.mcfunction'));
    expect(fn).toContain('execute as @a[scores={mcms_t=120}] run function demo:show_a');
    expect(fn).toContain('execute as @a[scores={mcms_t=920}] run say AUTOTEST DONE');
    const load = dec(autotestFiles('demo', 'functions', ['a']).get('data/mcms_autotest/function/load.mcfunction'));
    expect(load).toContain('scoreboard objectives add mcms_t dummy');
  });

  it('zips reproducibly with sorted names, directory entries and a fixed date', async () => {
    const files = new Map([
      ['b/x.json', new TextEncoder().encode('{}')],
      ['a.txt', new TextEncoder().encode('hi')],
      ['b/c/y.png', new Uint8Array([1, 2, 3])],
    ]);
    const z1 = await zipFiles(files);
    const z2 = await zipFiles(new Map([...files].reverse()));
    expect(Buffer.from(z1).equals(Buffer.from(z2))).toBe(true);
    const zip = await JSZip.loadAsync(z1);
    const names = Object.keys(zip.files);
    expect(names).toEqual(['a.txt', 'b/', 'b/c/', 'b/c/y.png', 'b/x.json']);
    for (const n of names) expect(zip.files[n].date.getTime()).toBe(ZIP_DATE_MS);
    expect(await zip.file('b/c/y.png')!.async('uint8array')).toEqual(new Uint8Array([1, 2, 3]));
  });
});
