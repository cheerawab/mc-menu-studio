// Glyph sheets: PNG grids of equal cells + the `chars` rows of a bitmap font provider, and code point allocation.
import { GLYPH_RANGES, HIT_ALPHA, SHEET_COLUMNS, SHEET_MAX_ROWS, SPACE_BLOCK_END } from './constants';
import { encodePng } from './png';

export interface Sheet {
  /** Texture name: assets/<ns>/textures/font/<name>.png */
  name: string;
  cellW: number;
  cellH: number;
  cols: number;
  rows: number;
  /** `chars` rows (equal length in code points, padded with U+0000). */
  chars: string[];
  /** Code points of the real glyphs, in grid order. */
  codepoints: number[];
  png: Uint8Array;
}

/** Hands out private-use code points: U+E100.. (never the U+E000..U+E02F space block), then supplementary PUA-A. */
export class CodepointAllocator {
  private range = 0;
  private next = GLYPH_RANGES[0][0];
  count = 0;

  take(): number {
    while (this.range < GLYPH_RANGES.length && this.next > GLYPH_RANGES[this.range][1]) {
      this.range++;
      if (this.range < GLYPH_RANGES.length) this.next = GLYPH_RANGES[this.range][0];
    }
    if (this.range >= GLYPH_RANGES.length) throw new Error('too many glyphs: private-use code points exhausted');
    const cp = this.next++;
    if (cp <= SPACE_BLOCK_END) throw new Error('glyph code point inside the space block');
    this.count++;
    return cp;
  }

  /** True once a code point outside the Basic Multilingual Plane was handed out. */
  get usesSupplementary(): boolean {
    return this.range > 0;
  }
}

export interface Cell {
  pixels: Uint8Array;
  cp: number;
}

/**
 * Packs equal-size cells into sheets of at most SHEET_COLUMNS x SHEET_MAX_ROWS. Returns the sheets and, for every
 * input cell, the index of the sheet that holds it.
 */
export function packSheets(prefix: string, cells: Cell[], cellW: number, cellH: number): { sheets: Sheet[]; sheetOf: number[] } {
  const perSheet = SHEET_COLUMNS * SHEET_MAX_ROWS;
  const sheets: Sheet[] = [];
  const sheetOf: number[] = [];
  for (let start = 0, s = 0; start < cells.length; start += perSheet, s++) {
    const group = cells.slice(start, start + perSheet);
    const cols = Math.min(SHEET_COLUMNS, group.length);
    const rows = Math.ceil(group.length / cols);
    const W = cols * cellW, H = rows * cellH;
    const rgba = new Uint8Array(W * H * 4);
    const chars: string[] = [];
    for (let r = 0; r < rows; r++) {
      let line = '';
      for (let c = 0; c < cols; c++) {
        const cell = group[r * cols + c];
        if (!cell) {
          line += '\u0000';
          continue;
        }
        line += String.fromCodePoint(cell.cp);
        for (let j = 0; j < cellH; j++) {
          const src = j * cellW * 4;
          rgba.set(cell.pixels.subarray(src, src + cellW * 4), ((r * cellH + j) * W + c * cellW) * 4);
        }
      }
      chars.push(line);
    }
    group.forEach(() => sheetOf.push(s));
    sheets.push({
      name: `${prefix}_${s}`,
      cellW,
      cellH,
      cols,
      rows,
      chars,
      codepoints: group.map((c) => c.cp),
      png: encodePng(W, H, rgba),
    });
  }
  return { sheets, sheetOf };
}

/** Pixels of an invisible hit glyph: every pixel alpha = HIT_ALPHA (1/255), so the client box is the full cell. */
export function hitPixels(w: number, h: number): Uint8Array {
  const px = new Uint8Array(w * h * 4);
  for (let i = 3; i < px.length; i += 4) px[i] = HIT_ALPHA;
  return px;
}

/** One single-cell sheet per hit glyph size. */
export function hitSheet(w: number, h: number, cp: number): Sheet {
  return {
    name: `hit_${w}x${h}`,
    cellW: w,
    cellH: h,
    cols: 1,
    rows: 1,
    chars: [String.fromCodePoint(cp)],
    codepoints: [cp],
    png: encodePng(w, h, hitPixels(w, h)),
  };
}
