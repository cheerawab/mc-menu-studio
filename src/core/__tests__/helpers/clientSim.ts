// Test-only "client simulation": reads the GENERATED files (font JSON, sheet PNGs, dialog JSON or the SNBT inside the
// .mcfunction) and lays the text out like the 26.3 client does (docs/VERIFIED.md §1-3, §10-11):
// - glyph advance = (rightmost column with alpha > 0) + 1, + 1; space glyphs advance by their table value
// - the running advance of the line must never exceed plain_message.width - 8 (else the client wraps)
// - a bitmap glyph's top = line top + (7 - ascent); its click box is the full cell
// Nothing here imports the exporter's layout code, so the test checks the output, not the implementation.
import type { ExportBuild } from '@/core/export';
import { decodePng } from '@/core/export/png';

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

/** Minimal SNBT reader for what the exporter writes: quoted strings/keys, ints (+L/d), true/false, lists, compounds. */
export function parseSnbt(src: string): Json {
  let i = 0;
  const ws = () => {
    while (i < src.length && /\s/.test(src[i])) i++;
  };
  const expect = (c: string) => {
    ws();
    if (src[i] !== c) throw new Error(`SNBT: expected ${c} at ${i}, got ${src[i]}`);
    i++;
  };
  const str = (): string => {
    expect('"');
    let out = '';
    for (;;) {
      const c = src[i++];
      if (c === undefined) throw new Error('SNBT: unterminated string');
      if (c === '"') return out;
      if (c === '\\') {
        const e = src[i++];
        out += e === 'n' ? '\n' : e === 'r' ? '\r' : e === 't' ? '\t' : e === '\\' || e === '"' || e === "'" ? e : (() => {
          throw new Error(`SNBT: unknown escape \\${e}`);
        })();
      } else out += c;
    }
  };
  const value = (): Json => {
    ws();
    const c = src[i];
    if (c === '{') {
      i++;
      const o: { [k: string]: Json } = {};
      ws();
      if (src[i] === '}') return i++, o;
      for (;;) {
        ws();
        const k = str();
        expect(':');
        o[k] = value();
        ws();
        if (src[i] === ',') i++;
        else return expect('}'), o;
      }
    }
    if (c === '[') {
      i++;
      const a: Json[] = [];
      ws();
      if (src[i] === ']') return i++, a;
      for (;;) {
        a.push(value());
        ws();
        if (src[i] === ',') i++;
        else return expect(']'), a;
      }
    }
    if (c === '"') return str();
    const m = /^(true|false|-?\d+(?:\.\d+)?[Ldb]?)/.exec(src.slice(i));
    if (!m) throw new Error(`SNBT: unexpected ${c} at ${i}`);
    i += m[0].length;
    if (m[0] === 'true' || m[0] === 'false') return m[0] === 'true';
    return Number(m[0].replace(/[Ldb]$/, ''));
  };
  const v = value();
  ws();
  if (i !== src.length) throw new Error(`SNBT: trailing data at ${i}`);
  return v;
}

interface SpaceGlyph {
  kind: 'space';
  advance: number;
}
interface BitmapGlyph {
  kind: 'bitmap';
  cellW: number;
  cellH: number;
  ascent: number;
  pixels: Uint8Array;
  advance: number;
}
type Glyph = SpaceGlyph | BitmapGlyph;

const text = (b: Uint8Array | undefined, name: string) => {
  if (!b) throw new Error(`missing file ${name}`);
  return new TextDecoder().decode(b);
};

const fontCache = new WeakMap<ExportBuild, Map<string, Map<number, Glyph>>>();

/** Loads every font of the resource pack: font id ("ns:name") -> code point -> glyph (cached per build). */
export function loadFonts(build: ExportBuild): Map<string, Map<number, Glyph>> {
  const cached = fontCache.get(build);
  if (cached) return cached;
  const fonts = new Map<string, Map<number, Glyph>>();
  fontCache.set(build, fonts);
  for (const [path, bytes] of build.resourcePack) {
    const m = /^assets\/([a-z0-9_]+)\/font\/([a-z0-9_]+)\.json$/.exec(path);
    if (!m) continue;
    const def = JSON.parse(text(bytes, path)) as { providers: Record<string, unknown>[] };
    const glyphs = new Map<number, Glyph>();
    for (const p of def.providers) {
      if (p.type === 'space') {
        for (const [ch, adv] of Object.entries(p.advances as Record<string, number>)) glyphs.set(ch.codePointAt(0)!, { kind: 'space', advance: adv });
      } else if (p.type === 'bitmap') {
        const [fns, fpath] = (p.file as string).split(':');
        const png = decodePng(build.resourcePack.get(`assets/${fns}/textures/${fpath}`)!);
        const rows = (p.chars as string[]).map((r) => [...r].map((c) => c.codePointAt(0)!));
        const cols = rows[0].length;
        if (rows.some((r) => r.length !== cols)) throw new Error(`${path}: chars grid is not rectangular`);
        const cellW = png.width / cols, cellH = png.height / rows.length;
        if (!Number.isInteger(cellW) || !Number.isInteger(cellH)) throw new Error(`${path}: png size not a multiple of the grid`);
        if (p.height !== cellH) throw new Error(`${path}: height ${p.height} != cell height ${cellH} (pixelScale must be 1)`);
        const ascent = p.ascent as number;
        if (ascent > cellH) throw new Error(`${path}: ascent ${ascent} > height ${cellH}`);
        rows.forEach((row, r) =>
          row.forEach((cp, c) => {
            if (cp === 0) return;
            const pixels = new Uint8Array(cellW * cellH * 4);
            for (let j = 0; j < cellH; j++) {
              const s = ((r * cellH + j) * png.width + c * cellW) * 4;
              pixels.set(png.data.subarray(s, s + cellW * 4), j * cellW * 4);
            }
            // DECOMPILED §11: getActualGlyphWidth scans columns right to left for any alpha != 0
            let actual = 0;
            for (let x = cellW - 1; x >= 0 && !actual; x--) for (let y = 0; y < cellH; y++) if (pixels[(y * cellW + x) * 4 + 3]) {
              actual = x + 1;
              break;
            }
            if (glyphs.has(cp)) throw new Error(`${path}: code point U+${cp.toString(16)} defined twice`);
            glyphs.set(cp, { kind: 'bitmap', cellW, cellH, ascent, pixels, advance: actual + 1 });
          }),
        );
      } else throw new Error(`${path}: unexpected provider ${String(p.type)}`);
    }
    fonts.set(`${m[1]}:${m[2]}`, glyphs);
  }
  return fonts;
}

/** The dialog of a page, read back from the data pack (JSON in registry mode, SNBT in functions mode). */
export function readDialog(build: ExportBuild, key: string): Record<string, Json> {
  const ns = build.options.namespace;
  if (build.options.mode === 'registry') {
    const p = `data/${ns}/dialog/${key}.json`;
    return JSON.parse(text(build.dataPack.get(p), p));
  }
  const p = `data/${ns}/function/show_${key}.mcfunction`;
  const src = text(build.dataPack.get(p), p);
  const prefix = 'dialog show @s ';
  if (!src.startsWith(prefix) || !src.endsWith('\n') || src.indexOf('\n') !== src.length - 1) throw new Error(`${p}: not a single dialog show line`);
  return parseSnbt(src.slice(prefix.length, -1)) as Record<string, Json>;
}

export interface SimHit {
  x: number;
  y: number;
  w: number;
  h: number;
  click: Json | undefined;
  hover: Json | undefined;
}

export interface SimResult {
  messageWidth: number;
  /** Picture drawn by the visual glyphs, clipped to w x h (anything drawn outside is reported in `outside`). */
  canvas: Uint8Array;
  outside: number;
  overlaps: number;
  hits: SimHit[];
  peak: number;
  /** Running advance when the first "\n" is reached. */
  endOfLine: number;
  newlines: number;
  /** Glyphs placed on a line other than the first. */
  offLine: number;
  /** Runs that carry events but contain a space glyph or more than one glyph. */
  badEventRuns: number;
  /** Runs whose style is not white + shadow_color 0. */
  badStyle: number;
}

/** Lays out one page's dialog like the client and returns what it draws and where its click boxes are. */
export function simulatePage(build: ExportBuild, key: string, w: number, h: number): SimResult {
  const fonts = loadFonts(build);
  const dialog = readDialog(build, key);
  const body = (dialog.body as Json[])[0] as Record<string, Json>;
  if (body.type !== 'minecraft:plain_message') throw new Error('body is not a plain_message');
  const messageWidth = body.width as number;
  const textWidth = messageWidth - 8;
  const contents = body.contents as Json[];
  if (contents[0] !== '') throw new Error('first component must be the neutral root ""');
  const canvas = new Uint8Array(w * h * 4);
  const r: SimResult = {
    messageWidth, canvas, outside: 0, overlaps: 0, hits: [], peak: 0, endOfLine: -1,
    newlines: 0, offLine: 0, badEventRuns: 0, badStyle: 0,
  };
  let cursor = 0, line = 0;
  for (const raw of contents.slice(1)) {
    const comp = raw as Record<string, Json>;
    if (comp.color !== '#ffffff' || comp.shadow_color !== 0) r.badStyle++;
    const font = (comp.font as string | undefined) ?? 'minecraft:default';
    const evented = comp.click_event !== undefined || comp.hover_event !== undefined;
    const cps = [...(comp.text as string)].map((c) => c.codePointAt(0)!);
    if (evented && (cps.length !== 1 || fonts.get(font)?.get(cps[0])?.kind !== 'bitmap')) r.badEventRuns++;
    for (const cp of cps) {
      if (cp === 10) {
        if (line === 0) r.endOfLine = cursor;
        line++;
        r.newlines++;
        cursor = 0;
        continue;
      }
      const g = fonts.get(font)?.get(cp);
      if (!g) throw new Error(`font ${font} has no glyph U+${cp.toString(16)}`);
      if (g.kind === 'bitmap') {
        if (line !== 0) r.offLine++;
        const top = line * 9 + (7 - g.ascent);
        if (evented) {
          r.hits.push({ x: cursor, y: top, w: g.cellW, h: g.cellH, click: comp.click_event, hover: comp.hover_event });
        } else {
          for (let j = 0; j < g.cellH; j++)
            for (let i = 0; i < g.cellW; i++) {
              const s = (j * g.cellW + i) * 4;
              if (!g.pixels[s + 3]) continue;
              const x = cursor + i, y = top + j;
              if (x < 0 || y < 0 || x >= w || y >= h) {
                r.outside++;
                continue;
              }
              const d = (y * w + x) * 4;
              if (canvas[d + 3]) r.overlaps++;
              canvas.set(g.pixels.subarray(s, s + 4), d);
            }
        }
      }
      cursor += g.advance;
      if (line === 0 && cursor > r.peak) r.peak = cursor;
      if (line === 0 && cursor > textWidth) throw new Error(`line wraps: running advance ${cursor} > ${textWidth}`);
    }
  }
  return r;
}

/** Straight RGBA with fully transparent pixels normalised to 0,0,0,0 (what the exporter stores). */
export function normalised(data: ArrayLike<number>): Uint8Array {
  const out = Uint8Array.from(data as ArrayLike<number>);
  for (let i = 0; i < out.length; i += 4) if (out[i + 3] === 0) out[i] = out[i + 1] = out[i + 2] = 0;
  return out;
}
