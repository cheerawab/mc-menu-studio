// Splits page pictures into square tiles, skips empty ones and dedupes identical tiles across all pages.
import { DEFAULT_TILE_SIZE, MAX_CELL, MIN_TILE_SIZE } from './constants';
import type { RgbaImage } from './types';

export interface TileGlyph {
  /** size x size x 4 bytes; fully transparent pixels are normalised to 0,0,0,0. */
  pixels: Uint8Array;
  /** Rightmost column with alpha > 0, + 1 (what the client measures for the advance). */
  actualWidth: number;
}

/** A tile of a page: its top-left corner in page pixels and the index of its (deduped) glyph. */
export interface PlacedTile {
  x: number;
  y: number;
  tile: number;
}

/** Rightmost column (0-based) holding a pixel with alpha > 0, plus 1; 0 when the cell is empty. */
export function actualWidth(pixels: ArrayLike<number>, w: number, h: number): number {
  for (let x = w - 1; x >= 0; x--) for (let y = 0; y < h; y++) if (pixels[(y * w + x) * 4 + 3] > 0) return x + 1;
  return 0;
}

function hashBytes(b: Uint8Array): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < b.length; i++) {
    h ^= b[i];
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function checkTileSize(size: number): void {
  if (!Number.isInteger(size) || size < MIN_TILE_SIZE || size > MAX_CELL)
    throw new Error(`tile size must be an integer ${MIN_TILE_SIZE}..${MAX_CELL}, got ${size}`);
}

/** Collects unique tiles over any number of pictures. Order of `tiles` = order of first appearance (deterministic). */
export class TileSet {
  readonly tiles: TileGlyph[] = [];
  private readonly buckets = new Map<number, number[]>();

  constructor(readonly size = DEFAULT_TILE_SIZE) {
    checkTileSize(size);
  }

  /** Raster order (rows top to bottom, left to right). Partial edge tiles are padded with transparent pixels. */
  add(img: RgbaImage): { placed: PlacedTile[]; empty: number } {
    const S = this.size;
    const { width: W, height: H, data } = img;
    if (data.length !== W * H * 4) throw new Error('picture buffer has the wrong length');
    const placed: PlacedTile[] = [];
    let empty = 0;
    for (let ty = 0; ty < H; ty += S) {
      for (let tx = 0; tx < W; tx += S) {
        const cell = new Uint8Array(S * S * 4);
        let any = false;
        const cw = Math.min(S, W - tx), ch = Math.min(S, H - ty);
        for (let j = 0; j < ch; j++) {
          for (let i = 0; i < cw; i++) {
            const s = ((ty + j) * W + tx + i) * 4;
            if (data[s + 3] === 0) continue;
            const d = (j * S + i) * 4;
            cell[d] = data[s];
            cell[d + 1] = data[s + 1];
            cell[d + 2] = data[s + 2];
            cell[d + 3] = data[s + 3];
            any = true;
          }
        }
        if (!any) {
          empty++;
          continue;
        }
        placed.push({ x: tx, y: ty, tile: this.intern(cell) });
      }
    }
    return { placed, empty };
  }

  private intern(cell: Uint8Array): number {
    const h = hashBytes(cell);
    const bucket = this.buckets.get(h);
    if (bucket) for (const i of bucket) if (sameBytes(this.tiles[i].pixels, cell)) return i;
    const index = this.tiles.length;
    this.tiles.push({ pixels: cell, actualWidth: actualWidth(cell, this.size, this.size) });
    if (bucket) bucket.push(index);
    else this.buckets.set(h, [index]);
    return index;
  }
}
