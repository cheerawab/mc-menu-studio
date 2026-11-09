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

const CACHE_MAX = 300;
const cacheByEnv = new WeakMap<RenderEnv, Map<string, CanvasLike>>();

/**
 * Draws `text` inside `rect` (clipped to it). The text is rasterised in white on a scratch canvas,
 * its alpha optionally thresholded, then coloured and composited with the shadow pixel by pixel,
 * so the result only depends on the canvas text rasteriser.
 */
export function drawText(ctx: Ctx2D, env: RenderEnv, rect: Rect, text: string, st: TextStyle): void {
  const W = Math.round(rect.w), H = Math.round(rect.h);
  if (!text.trim() || W <= 0 || H <= 0) return;
  const key = JSON.stringify([text, W, H, st]);
  let cache = cacheByEnv.get(env);
  if (!cache) cacheByEnv.set(env, (cache = new Map()));
  const hit = cache.get(key);
  if (hit) {
    ctx.drawImage(hit, rect.x, rect.y);
    return;
  }

  const { ctx: s } = scratch(env, W, H);
  s.clearRect(0, 0, W, H);
  s.font = fontString(st.fontSize, st.bold, st.family);
  s.textBaseline = 'middle';
  s.textAlign = 'left';
  s.fillStyle = '#ffffff';
  const shadowOff = st.shadow ? 1 : 0;
  const avail = W - shadowOff;
  const lines = wrapText((t) => s.measureText(t).width, text, avail, st.wrap);
  const lh = Math.max(1, Math.round(st.fontSize * st.lineHeight));
  const blockH = lines.length * lh;
  let top = 0;
  if (st.vAlign === 'middle') top = Math.floor((H - shadowOff - blockH) / 2);
  else if (st.vAlign === 'bottom') top = H - shadowOff - blockH;
  lines.forEach((line, i) => {
    if (!line) return;
    const w = Math.ceil(s.measureText(line).width);
    let x = 0;
    if (st.align === 'center') x = Math.floor((avail - w) / 2);
    else if (st.align === 'right') x = avail - w;
    s.fillText(line, x, top + i * lh + Math.round(lh / 2));
  });

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
  for (let y = 0, p = 0; y < H; y++) {
    for (let x = 0; x < W; x++, p += 4) {
      const ta = cov(p) * col.a;
      const sa = sh && x > 0 && y > 0 ? cov(p - 4 * W - 4) * sh.a : 0;
      const a = ta + sa * (1 - ta);
      if (a <= 0) continue;
      const k = sa * (1 - ta);
      o[p] = (col.r * ta + (sh ? sh.r * k : 0)) / a;
      o[p + 1] = (col.g * ta + (sh ? sh.g * k : 0)) / a;
      o[p + 2] = (col.b * ta + (sh ? sh.b * k : 0)) / a;
      o[p + 3] = Math.round(a * 255);
    }
  }
  const finished = env.createCanvas(W, H);
  const fctx = finished.getContext('2d');
  if (!fctx) return;
  fctx.putImageData(out, 0, 0);
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(key, finished);
  ctx.drawImage(finished, rect.x, rect.y);
}
