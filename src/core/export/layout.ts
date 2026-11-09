// Turns placed tiles + hit glyphs into the run list of the picture's first text line (port of the spike's
// build_page "compose first line" step). Every client-metric number comes from constants.ts.
import {
  BASELINE,
  LINE_HEIGHT,
  MAX_CELL,
  SPACE_BITS,
  SPACE_NEG_BASE,
  SPACE_POS_BASE,
  WIDGET_PADDING,
  WIDTH_MARGIN,
} from './constants';

/** Space-font characters that move the cursor by `dx`: binary decomposition, largest power first, all one sign
 * (so the running advance moves monotonically and never overshoots the target). */
export function spaceChars(dx: number): string {
  if (!Number.isInteger(dx)) throw new Error(`space move must be an integer, got ${dx}`);
  if (dx === 0) return '';
  const n = Math.abs(dx);
  if (n >= 2 ** SPACE_BITS) throw new Error(`space move too long: ${dx}`);
  const base = dx > 0 ? SPACE_POS_BASE : SPACE_NEG_BASE;
  let s = '';
  for (let k = SPACE_BITS - 1; k >= 0; k--) if (n & (1 << k)) s += String.fromCharCode(base + k);
  return s;
}

/** Advance of a space-font character, or null when `cp` is not one. */
export function spaceAdvance(cp: number): number | null {
  if (cp >= SPACE_POS_BASE && cp < SPACE_POS_BASE + SPACE_BITS) return 2 ** (cp - SPACE_POS_BASE);
  if (cp >= SPACE_NEG_BASE && cp < SPACE_NEG_BASE + SPACE_BITS) return -(2 ** (cp - SPACE_NEG_BASE));
  return null;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function cuts(start: number, len: number): [number, number][] {
  const n = Math.ceil(len / MAX_CELL);
  const base = Math.floor(len / n), extra = len % n;
  const out: [number, number][] = [];
  for (let i = 0, p = start; i < n; i++) {
    const l = base + (i < extra ? 1 : 0);
    out.push([p, l]);
    p += l;
  }
  return out;
}

/**
 * Splits a hit region into glyph cells of at most MAX_CELL per side (balanced sizes). A glyph must reach the
 * baseline (`ascent <= height`, DECOMPILED §11), so a cell that would end above y = BASELINE is extended down to it:
 * `extended` reports that the clickable box is then taller than the region.
 */
export function splitRegion(r: Box): { pieces: Box[]; extended: boolean } {
  const pieces: Box[] = [];
  let extended = false;
  for (const [y, h] of cuts(r.y, r.h)) {
    for (const [x, w] of cuts(r.x, r.w)) {
      let hh = h;
      if (y + hh < BASELINE) {
        hh = BASELINE - y;
        extended = true;
      }
      pieces.push({ x, y, w, h: hh });
    }
  }
  return { pieces, extended };
}

/** A glyph to place on the first line: top-left in page pixels, its code point and its advance. */
export interface Placement {
  x: number;
  y: number;
  cp: number;
  advance: number;
}

export interface HitPlacement extends Placement {
  /** Index of the region (in the page's region list) whose events this glyph carries. */
  region: number;
}

/** `font` is 'space' or the vertical offset N of font `y<N>`. Only hit runs have `region`. */
export interface Run {
  font: 'space' | number;
  text: string;
  region?: number;
}

export interface PageLayout {
  runs: Run[];
  /** Empty lines after the first one (ceil(H / 9)). */
  lines: number;
  /** plain_message.width = W + 8 + 4 (VERIFIED wrap rule). */
  messageWidth: number;
  /** Largest running advance on the first line (must stay <= messageWidth - 8). */
  peak: number;
  /** Vertical offsets N used (sorted). */
  offsets: number[];
}

/** Walks the runs like the client's line splitter: returns the peak and final running advance. */
export function measureRuns(runs: Run[], advanceOf: (cp: number) => number): { peak: number; end: number } {
  let cursor = 0, peak = 0;
  for (const r of runs) {
    for (const ch of r.text) {
      const cp = ch.codePointAt(0)!;
      cursor += spaceAdvance(cp) ?? advanceOf(cp);
      if (cursor > peak) peak = cursor;
    }
  }
  return { peak, end: cursor };
}

/**
 * Composes the first line: tiles (paint order), then hit glyphs (z-order, after every visual so the last glyph
 * under the cursor wins), then a final move to exactly x = W. Moves before tiles live inside the tile's `y<N>` run
 * (every y-font carries the space provider); moves before hit glyphs go into separate space-font runs, so click and
 * hover events sit on glyph-only runs. Neighbouring non-interactive runs with the same font are merged.
 */
export function composePage(W: number, H: number, tiles: Placement[], hits: HitPlacement[]): PageLayout {
  const runs: Run[] = [];
  const push = (font: Run['font'], text: string, region?: number) => {
    if (!text) return;
    const last = runs[runs.length - 1];
    if (region === undefined && last && last.region === undefined && last.font === font) last.text += text;
    else runs.push(region === undefined ? { font, text } : { font, text, region });
  };
  const advances = new Map<number, number>();
  const offsets = new Set<number>();
  let cursor = 0;
  for (const t of tiles) {
    push(t.y, spaceChars(t.x - cursor) + String.fromCodePoint(t.cp));
    cursor = t.x + t.advance;
    advances.set(t.cp, t.advance);
    offsets.add(t.y);
  }
  for (const h of hits) {
    push('space', spaceChars(h.x - cursor));
    push(h.y, String.fromCodePoint(h.cp), h.region);
    cursor = h.x + h.advance;
    advances.set(h.cp, h.advance);
    offsets.add(h.y);
  }
  push('space', spaceChars(W - cursor));

  const messageWidth = W + WIDGET_PADDING + WIDTH_MARGIN;
  const { peak, end } = measureRuns(runs, (cp) => {
    const a = advances.get(cp);
    if (a === undefined) throw new Error(`unknown glyph U+${cp.toString(16)}`);
    return a;
  });
  if (end !== W) throw new Error(`first line ends at ${end}, expected ${W}`);
  if (peak > messageWidth - WIDGET_PADDING) throw new Error(`wrap rule violated: running advance ${peak} > ${messageWidth - WIDGET_PADDING}`);
  return {
    runs,
    lines: Math.ceil(H / LINE_HEIGHT),
    messageWidth,
    peak,
    offsets: [...offsets].sort((a, b) => a - b),
  };
}
