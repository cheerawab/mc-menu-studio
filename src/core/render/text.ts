// Text layout and drawing. Supports CJK wrapping (character based, with basic kinsoku rules),
// an alpha threshold "pixelate" mode for a crisp pixel look, and a Minecraft-style 1 px drop shadow.
import { DEFAULT_FONT_STACK } from '../model/defaults';
import type { HAlign, Rect, VAlign } from '../model/types';
import { parseColor } from './color';
import type { CanvasLike, Ctx2D, RenderEnv } from './types';

export interface TextStyle {
  fontSize: number;
  bold: boolean;
  /** CSS font-family stack ('' = default stack) */
  family: string;
  color: string;
  /** Shadow colour, drawn 1 px right and down; null = no shadow. */
  shadow: string | null;
  align: HAlign;
  vAlign: VAlign;
  /** Line height as a multiple of fontSize. */
  lineHeight: number;
  wrap: boolean;
  pixelate: boolean;
}

/** Alpha threshold (0..255) used by pixelate mode. Slightly below 50% keeps thin CJK strokes. */
export const PIXELATE_THRESHOLD = 110;
/** "auto" pixelate applies at or below this font size. */
export const PIXELATE_AUTO_MAX = 13;

export function fontString(size: number, bold: boolean, family: string): string {
  return `${bold ? 'bold ' : ''}${size}px ${family.trim() || DEFAULT_FONT_STACK}`;
}

const CJK_RE =
  /[ᄀ-ᇿ⺀-⿿　-〿぀-ヿ㄀-ㇿ㈀-鿿ꥠ-꥿가-힯豈-﫿︐-︟︰-﹏＀-￯]/;
/** Characters that must not start a line (they hang at the end of the previous one). */
const NO_START = new Set([...'，。、；：！？）」』】》〉〕…—～・％,.;:!?)]}%']);
/** Characters that must not end a line (they move to the next one). */
const NO_END = new Set([...'（「『【《〈〔([{']);

/** Splits into whitespace runs, single CJK characters and runs of other characters (words). */
export function tokenize(s: string): string[] {
  const out: string[] = [];
  let word = '';
  const flush = () => {
    if (word) out.push(word);
    word = '';
  };
  for (const ch of s) {
    if (ch === ' ' || ch === '\t' || ch === '　') {
      flush();
      const last = out[out.length - 1];
      if (last !== undefined && /^\s+$/.test(last)) out[out.length - 1] = last + ch;
      else out.push(ch);
    } else if (CJK_RE.test(ch)) {
      flush();
      out.push(ch);
    } else if (NO_START.has(ch) && word === '') {
      out.push(ch);
    } else word += ch;
  }
  flush();
  return out;
}

const isSpace = (t: string) => /^\s+$/.test(t);

/** Greedy line breaking. `measure` returns the advance width of a string. */
export function wrapText(measure: (s: string) => number, text: string, maxW: number, wrap: boolean): string[] {
  const paragraphs = text.replace(/\r\n?/g, '\n').split('\n');
  if (!wrap || maxW <= 0) return paragraphs;
  const lines: string[] = [];
  for (const para of paragraphs) {
    let line = '';
    const pushLong = (tok: string) => {
      for (const ch of tok) {
        if (line && measure(line + ch) > maxW) {
          lines.push(line);
          line = '';
        }
        line += ch;
      }
    };
    for (const tok of tokenize(para)) {
      if (measure(line + tok) <= maxW) {
        line += tok;
        continue;
      }
      if (isSpace(tok)) {
        if (line.trim()) {
          lines.push(line);
          line = '';
        }
        continue;
      }
      if (NO_START.has(tok) && line.trim()) {
        lines.push(line + tok); // hanging punctuation
        line = '';
        continue;
      }
      if (!line.trim()) {
        pushLong(line + tok);
        continue;
      }
      let carry = '';
      const chars = [...line];
      const last = chars[chars.length - 1];
      if (chars.length > 1 && NO_END.has(last)) {
        carry = last;
        line = chars.slice(0, -1).join('');
      }
      lines.push(line.replace(/\s+$/, ''));
      line = '';
      if (measure(carry + tok) > maxW) pushLong(carry + tok);
      else line = carry + tok;
    }
    lines.push(line.replace(/\s+$/, ''));
  }
  return lines;
}

interface Scratch {
  canvas: CanvasLike;
  ctx: Ctx2D;
}
const scratchByEnv = new WeakMap<RenderEnv, Scratch>();

function scratch(env: RenderEnv, w: number, h: number): Scratch {
  let s = scratchByEnv.get(env);
  if (!s || s.canvas.width < w || s.canvas.height < h) {
    const canvas = env.createCanvas(Math.max(w, s?.canvas.width ?? 0, 64), Math.max(h, s?.canvas.height ?? 0, 32));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas is not available');
    s = { canvas, ctx };
    scratchByEnv.set(env, s);
  }
  return s;
}

export function measureTextWidth(env: RenderEnv, text: string, size: number, bold: boolean, family: string): number {
  const { ctx } = scratch(env, 1, 1);
  ctx.font = fontString(size, bold, family);
  return Math.ceil(ctx.measureText(text).width);
}

/**
 * "auto" pixelation: small text (<= PIXELATE_AUTO_MAX px) is thresholded only at scale 1. At a higher scale there are
 * enough texels for smooth, anti-aliased glyphs, which is the point of the higher resolution.
 */
export const autoPixelate = (fontSize: number, scale: number): boolean => scale === 1 && fontSize <= PIXELATE_AUTO_MAX;

/**
 * Texels per page px of a text bitmap. Pixelated text keeps its retro look: rasterised at 1x, thresholded, then scaled
 * up nearest-neighbour by the target's transform (so a pixelated label looks the same at every scale).
 */
export const textRasterScale = (st: TextStyle, scale: number): number => (st.pixelate ? 1 : scale);

/** Cache key of a finished text bitmap: text, box, style and the raster scale. */
export const textCacheKey = (text: string, w: number, h: number, st: TextStyle, rasterScale: number): string =>
  JSON.stringify([text, w, h, st, rasterScale]);

export interface TextLine {
  text: string;
  /** Left edge and vertical middle of the line, in page px relative to the text box. */
  x: number;
  y: number;
}

/**
 * Lays the text out in page px: wrapping, alignment, vertical alignment and line height. `measure` must use the 1x font
 * (size st.fontSize), so line breaks and positions are identical at every render scale.
 */
export function layoutText(measure: (s: string) => number, text: string, w: number, h: number, st: TextStyle): TextLine[] {
  const shadowOff = st.shadow ? 1 : 0;
  const avail = w - shadowOff;
  const lines = wrapText(measure, text, avail, st.wrap);
  const lh = Math.max(1, Math.round(st.fontSize * st.lineHeight));
  const blockH = lines.length * lh;
  let top = 0;
  if (st.vAlign === 'middle') top = Math.floor((h - shadowOff - blockH) / 2);
  else if (st.vAlign === 'bottom') top = h - shadowOff - blockH;
  const out: TextLine[] = [];
  lines.forEach((line, i) => {
    if (!line) return;
    const lw = Math.ceil(measure(line));
    let x = 0;
    if (st.align === 'center') x = Math.floor((avail - lw) / 2);
    else if (st.align === 'right') x = avail - lw;
    out.push({ text: line, x, y: top + i * lh + Math.round(lh / 2) });
  });
  return out;
}

const CACHE_MAX = 300;
/** Texel budget of the bitmap cache per environment (4x text bitmaps are 16 times larger than 1x ones). */
const CACHE_MAX_TEXELS = 6_000_000;
interface TextCache {
  map: Map<string, CanvasLike>;
  texels: number;
}
const cacheByEnv = new WeakMap<RenderEnv, TextCache>();

function remember(cache: TextCache, key: string, bmp: CanvasLike): void {
  const size = bmp.width * bmp.height;
  while (cache.map.size && (cache.map.size >= CACHE_MAX || cache.texels + size > CACHE_MAX_TEXELS)) {
    const [oldKey, old] = cache.map.entries().next().value as [string, CanvasLike];
    cache.map.delete(oldKey);
    cache.texels -= old.width * old.height;
  }
  cache.map.set(key, bmp);
  cache.texels += size;
}

/** Copies a text bitmap of (w * k) x (h * k) texels onto a w x h page-px box: texels map 1:1 at raster scale k. */
function blit(ctx: Ctx2D, bmp: CanvasLike, x: number, y: number, w: number, h: number): void {
  const smooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(bmp, x, y, w, h);
  ctx.imageSmoothingEnabled = smooth;
}

/**
 * Rasterises the laid-out text in white at k times the font size on a scratch canvas, optionally thresholds its alpha,
 * then colours it and composites the shadow (k texels = 1 page px right and down) pixel by pixel, so the result only
 * depends on the canvas text rasteriser. Returns a (w * k) x (h * k) bitmap.
 */
function rasterText(env: RenderEnv, w: number, h: number, text: string, st: TextStyle, k: number): CanvasLike | null {
  const W = w * k, H = h * k;
  const { ctx: s } = scratch(env, W, H);
  s.clearRect(0, 0, W, H);
  s.font = fontString(st.fontSize, st.bold, st.family);
  s.textBaseline = 'middle';
  s.textAlign = 'left';
  s.fillStyle = '#ffffff';
  const lines = layoutText((t) => s.measureText(t).width, text, w, h, st);
  if (k !== 1) s.font = fontString(st.fontSize * k, st.bold, st.family);
  for (const line of lines) s.fillText(line.text, line.x * k, line.y * k);

  const src = s.getImageData(0, 0, W, H).data;
  const out = s.createImageData(W, H);
  const o = out.data;
  const col = parseColor(st.color);
  const sh = st.shadow ? parseColor(st.shadow) : null;
  const thr = st.pixelate ? PIXELATE_THRESHOLD : -1;
  const cov = (p: number) => {
    const a = src[p + 3];
    return thr < 0 ? a / 255 : a >= thr ? 1 : 0;
  };
  const shadowStep = 4 * (W * k + k);
  for (let y = 0, p = 0; y < H; y++) {
    for (let x = 0; x < W; x++, p += 4) {
      const ta = cov(p) * col.a;
      const sa = sh && x >= k && y >= k ? cov(p - shadowStep) * sh.a : 0;
      const a = ta + sa * (1 - ta);
      if (a <= 0) continue;
      const m = sa * (1 - ta);
      o[p] = (col.r * ta + (sh ? sh.r * m : 0)) / a;
      o[p + 1] = (col.g * ta + (sh ? sh.g * m : 0)) / a;
      o[p + 2] = (col.b * ta + (sh ? sh.b * m : 0)) / a;
      o[p + 3] = Math.round(a * 255);
    }
  }
  const finished = env.createCanvas(W, H);
  const fctx = finished.getContext('2d');
  if (!fctx) return null;
  fctx.putImageData(out, 0, 0);
  return finished;
}

/**
 * Draws `text` inside `rect` (page px; the caller clips to it). `scale` = texels per page px of the target (the
 * transform renderPage set up): the layout is computed in page px with 1x metrics, the glyphs are rasterised at
 * font size x scale (1x for pixelated text) and the bitmap is copied with nearest sampling, so texels map 1:1.
 */
export function drawText(ctx: Ctx2D, env: RenderEnv, rect: Rect, text: string, st: TextStyle, scale = 1): void {
  const W = Math.round(rect.w), H = Math.round(rect.h);
  if (!text.trim() || W <= 0 || H <= 0) return;
  const k = textRasterScale(st, scale);
  const key = textCacheKey(text, W, H, st, k);
  let cache = cacheByEnv.get(env);
  if (!cache) cacheByEnv.set(env, (cache = { map: new Map(), texels: 0 }));
  let bmp = cache.map.get(key);
  if (!bmp) {
    const fresh = rasterText(env, W, H, text, st, k);
    if (!fresh) return;
    remember(cache, key, (bmp = fresh));
  }
  blit(ctx, bmp, rect.x, rect.y, W, H);
}
