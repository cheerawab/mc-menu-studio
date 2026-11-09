// Built-in 16x16 pixel icons, authored as tiny character bitmaps (original artwork for this project).
// Legend: '.' transparent, '#' main colour (auto-shaded: light on top/left edges, dark on bottom/right),
// 'o' outline, other lowercase letters = palette colours (outlined automatically when on the silhouette
// edge), UPPERCASE letters = palette colours that are never outlined (rays, drops, highlights).
// Tinting replaces the m/l/d family (main/light/dark).
import type { IconId } from '../model/types';
import { css, darken, lighten } from './color';
import type { Ctx2D } from './types';

type Rows = string[];
interface IconDef {
  rows: Rows;
  palette: Record<string, string>;
}

const N = 16;

function gen(fn: (x: number, y: number, dx: number, dy: number, r: number) => string): Rows {
  const rows: Rows = [];
  for (let y = 0; y < N; y++) {
    let s = '';
    for (let x = 0; x < N; x++) {
      const dx = x - 7.5, dy = y - 7.5;
      s += fn(x, y, dx, dy, Math.hypot(dx, dy));
    }
    rows.push(s);
  }
  return rows;
}
const mirrorX = (rows: Rows) => rows.map((r) => [...r].reverse().join(''));
const mirrorY = (rows: Rows) => [...rows].reverse();
const transpose = (rows: Rows) => Array.from({ length: N }, (_, x) => rows.map((r) => r[x] ?? '.').join(''));

const ARROW_RIGHT: Rows = [
  '................',
  '................',
  '........#.......',
  '........##......',
  '........###.....',
  '........####....',
  '.############...',
  '.#############..',
  '.#############..',
  '.############...',
  '........####....',
  '........###.....',
  '........##......',
  '........#.......',
  '................',
  '................',
];
const ARROW_DOWN = transpose(ARROW_RIGHT);
const ARROW_PALETTE = { m: '#f2f4f8', l: '#ffffff', d: '#b6bfcc', o: '#1c2230' };

const DEFS: Record<IconId, IconDef> = {
  heart: {
    rows: [
      '................',
      '................',
      '...###....###...',
      '..#####..#####..',
      '.##w###########.',
      '.##############.',
      '.##############.',
      '.##############.',
      '..############..',
      '...##########...',
      '....########....',
      '.....######.....',
      '......####......',
      '.......##.......',
      '................',
      '................',
    ],
    palette: { m: '#e83b4f', l: '#ff8d9b', d: '#a5192d', w: '#ffffff', o: '#3b0a12' },
  },
  star: {
    rows: [
      '................',
      '.......##.......',
      '......####......',
      '.....######.....',
      '################',
      '################',
      '.##############.',
      '..############..',
      '...##########...',
      '...##########...',
      '..############..',
      '..#####..#####..',
      '.#####....#####.',
      '.####......####.',
      '.###........###.',
      '................',
    ],
    palette: { m: '#ffcc33', l: '#fff0a0', d: '#e09000', o: '#5c3b00' },
  },
  sword: {
    rows: [
      '................',
      '.............ooo',
      '............olwo',
      '...........olwmo',
      '..........olwmo.',
      '.........olwmo..',
      '........olwmo...',
      '.......olwmo....',
      '..oo..olwmo.....',
      '..ogoolwmo......',
      '...oggwmo.......',
      '....oggo........',
      '...obbogo.......',
      '..obbo.oo.......',
      '.obbo...........',
      '.ooo............',
    ],
    palette: { l: '#d9f7fb', w: '#ffffff', m: '#5fd0dc', d: '#2f8f99', g: '#e3b23c', b: '#6b4423', o: '#1d1d26' },
  },
  pickaxe: {
    rows: [
      '................',
      '................',
      '.....oooooo.....',
      '....ollllllo....',
      '.....oommmmdo...',
      '........oommdo..',
      '.......oaoomdo..',
      '......oaoo.omdo.',
      '.....oaoo..omdo.',
      '....oaoo....odo.',
      '...oaoo.....odo.',
      '..oaoo.......oo.',
      '.oaoo...........',
      '.ooo............',
      '................',
      '................',
    ],
    palette: { l: '#c9f3f6', m: '#4cc9d6', d: '#2a8a96', a: '#9a6a3a', o: '#1d1d26' },
  },
  bag: {
    rows: [
      '................',
      '................',
      '......####......',
      '.....#aaaa#.....',
      '......#aa#......',
      '....########....',
      '...##########...',
      '..############..',
      '..##bbbbbbbb##..',
      '.######aa######.',
      '.##############.',
      '.##############.',
      '.##############.',
      '..############..',
      '...##########...',
      '................',
    ],
    palette: { m: '#a8692f', l: '#cf9354', d: '#7a4518', b: '#5e3313', a: '#f0c75e', o: '#2b1a0e' },
  },
  gear: {
    rows: gen((_x, _y, dx, dy, r) => {
      if (r <= 1.9) return '.';
      const seg = ((Math.atan2(dy, dx) / (Math.PI / 4) + 0.5) % 1 + 1) % 1;
      const tooth = seg > 0.22 && seg < 0.78;
      return r <= (tooth ? 7.7 : 6.1) ? '#' : '.';
    }),
    palette: { m: '#9aa4b2', l: '#d4dae3', d: '#5d6675', o: '#1f242d' },
  },
  home: {
    rows: [
      '................',
      '.......##.......',
      '......#aa#.##...',
      '.....#aaaa###...',
      '....#aaaaaa##...',
      '...#aaaaaaaa#...',
      '..#aaaaaaaaaa#..',
      '.#aaaaaaaaaaaa#.',
      'eeeeeeeeeeeeeeee',
      '..############..',
      '..##ww####bb##..',
      '..##ww####bb##..',
      '..########bb##..',
      '..########bb##..',
      '..############..',
      '................',
    ],
    palette: {
      m: '#e8d6a8', l: '#fff3d6', d: '#b89c6a', a: '#c8423a', e: '#7d2a22', w: '#ffe680', b: '#7a4a24', o: '#2a1a14',
    },
  },
  map: {
    rows: [
      '................',
      '................',
      '.##############.',
      '.####b####b####.',
      '.#aa#b####b####.',
      '.###ab####b####.',
      '.####baa##b####.',
      '.####b##a#b####.',
      '.####b###abx#x#.',
      '.####b####b#x##.',
      '.####b####bx#x#.',
      '.####b####b####.',
      '.####b####b####.',
      '.##############.',
      '................',
      '................',
    ],
    palette: { m: '#efe3c0', l: '#fff7df', d: '#c9b585', b: '#bca878', a: '#a0522d', x: '#d0352f', o: '#3a2c18' },
  },
  coin: {
    rows: gen((_x, _y, dx, dy, r) => {
      if (r > 7.3) return '.';
      if (r > 4.2 && r < 5.2) return 'b';
      if (Math.abs(dx) < 1 && Math.abs(dy) < 2.6) return 'b';
      return '#';
    }),
    palette: { m: '#f6c945', l: '#fff0a8', d: '#cc8e16', b: '#b07a10', o: '#5a3a00' },
  },
  check: {
    rows: [
      '................',
      '................',
      '................',
      '............####',
      '...........#####',
      '..........#####.',
      '.##......#####..',
      '.###....#####...',
      '.####..#####....',
      '..#########.....',
      '...#######......',
      '....#####.......',
      '.....###........',
      '................',
      '................',
      '................',
    ],
    palette: { m: '#3ccf6e', l: '#8ff0ad', d: '#1f8f45', o: '#0d3b1e' },
  },
  cross: {
    rows: [
      '................',
      '................',
      '................',
      '..###......###..',
      '..####....####..',
      '...####..####...',
      '....########....',
      '.....######.....',
      '.....######.....',
      '....########....',
      '...####..####...',
      '..####....####..',
      '..###......###..',
      '................',
      '................',
      '................',
    ],
    palette: { m: '#ef4444', l: '#ff9b9b', d: '#b91c1c', o: '#3f0b0b' },
  },
  arrow_right: { rows: ARROW_RIGHT, palette: ARROW_PALETTE },
  arrow_left: { rows: mirrorX(ARROW_RIGHT), palette: ARROW_PALETTE },
  arrow_down: { rows: ARROW_DOWN, palette: ARROW_PALETTE },
  arrow_up: { rows: mirrorY(ARROW_DOWN), palette: ARROW_PALETTE },
  lock: {
    rows: [
      '....########....',
      '...#ssssssss#...',
      '..#ssssssssss#..',
      '..#sss....sss#..',
      '..#ss#....#ss#..',
      '..#ss#....#ss#..',
      '.##############.',
      '.##############.',
      '.##############.',
      '.######kk######.',
      '.######kk######.',
      '.#######k######.',
      '.#######k######.',
      '.##############.',
      '.##############.',
      '................',
    ],
    palette: { m: '#f2c94c', l: '#ffe9a3', d: '#c08a1a', s: '#c9d1db', k: '#2a1f0a', o: '#2a2a35' },
  },
  sun: {
    rows: gen((_x, _y, dx, dy, r) => {
      if (r <= 4.6) return '#';
      if (r >= 6 && r <= 7.9) {
        const a = Math.atan2(dy, dx);
        const k = Math.round(a / (Math.PI / 4));
        if (Math.abs(a - (k * Math.PI) / 4) * r < 0.85) return 'R';
      }
      return '.';
    }),
    palette: { m: '#ffd23f', l: '#fff3a6', d: '#f29e1f', R: '#ffb21f', o: '#7a4300' },
  },
  moon: {
    rows: gen((x, y) => (Math.hypot(x - 7.5, y - 7.5) <= 6.8 && Math.hypot(x - 10.8, y - 5.2) > 5.6 ? '#' : '.')),
    palette: { m: '#f3eec2', l: '#ffffff', d: '#c9c28a', o: '#3a3658' },
  },
  rain: {
    rows: gen((x, y) => {
      const inC = (cx: number, cy: number, r: number) => Math.hypot(x - cx, y - cy) <= r;
      if (inC(5, 7, 3.3) || inC(9.2, 5.6, 3.9) || inC(12.4, 8.2, 2.7) || (x >= 2 && x <= 13 && y >= 7 && y <= 10))
        return '#';
      const drops = [[4, 12], [4, 13], [8, 13], [8, 14], [12, 12], [12, 13]];
      return drops.some(([a, b]) => a === x && b === y) ? 'B' : '.';
    }),
    palette: { m: '#e9eef5', l: '#ffffff', d: '#a9b5c6', B: '#4aa3ff', o: '#34404f' },
  },
  chest: {
    rows: [
      '................',
      '................',
      '..############..',
      '..############..',
      '..############..',
      '..############..',
      '..bbbbbaabbbbb..',
      '..#####aa#####..',
      '..############..',
      '..############..',
      '..############..',
      '..############..',
      '..############..',
      '..############..',
      '................',
      '................',
    ],
    palette: { m: '#b07a3c', l: '#d6a160', d: '#7c4f22', b: '#4d2f14', a: '#f2c94c', o: '#2b1a0e' },
  },
  book: {
    rows: [
      '................',
      '................',
      '...###########..',
      '..##b#########..',
      '..##b#aaaaaa##..',
      '..##b#########..',
      '..##b#aaaa####..',
      '..##b#########..',
      '..##b#########..',
      '..##b#########..',
      '..##b#########..',
      '..##b#########..',
      '..##bWWWWWWWWW#.',
      '...############.',
      '................',
      '................',
    ],
    palette: { m: '#3f6fd8', l: '#6f97ee', d: '#2a4ea3', b: '#1d3473', a: '#f2d16b', W: '#f6f1e3', o: '#141a33' },
  },
  potion: {
    rows: [
      '................',
      '......cccc......',
      '......cccc......',
      '......gggg......',
      '......gggg......',
      '.....gggggg.....',
      '....gggggggg....',
      '...gggggggggg...',
      '..g##########g..',
      '..#W##########..',
      '..#W##########..',
      '..############..',
      '..############..',
      '...##########...',
      '....########....',
      '................',
    ],
    palette: { c: '#8a5a2b', g: '#d7eef5', m: '#e0459c', l: '#ff8fcc', d: '#a52a72', W: '#ffffff', o: '#2a1630' },
  },
  chat: {
    rows: [
      '................',
      '................',
      '..############..',
      '.##############.',
      '.##############.',
      '.##kk##kk##kk##.',
      '.##kk##kk##kk##.',
      '.##############.',
      '.##############.',
      '..############..',
      '..####..........',
      '..###...........',
      '..##............',
      '................',
      '................',
      '................',
    ],
    palette: { m: '#f2f4f8', l: '#ffffff', d: '#c3c9d6', k: '#3d4a63', o: '#1c2433' },
  },
  globe: {
    rows: gen((_x, _y, dx, dy, r) => {
      if (r > 7.3) return '.';
      const lat = Math.abs(Math.abs(dy) - 2.5) < 0.5;
      const ex = 3.2 * Math.sqrt(Math.max(0, 1 - (dy * dy) / (7.3 * 7.3)));
      const lon = Math.abs(Math.abs(dx) - ex) < 0.5;
      return lat || lon ? 'b' : '#';
    }),
    palette: { m: '#4aa3e8', l: '#8fd0ff', d: '#2a6fb0', b: '#1b4f86', o: '#0f2742' },
  },
  clock: {
    rows: gen((x, y, _dx, _dy, r) => {
      if (r > 7.3) return '.';
      if (r > 5.6) return '#';
      if (x === 7 && y >= 3 && y <= 8) return 'k';
      if (y === 8 && x >= 7 && x <= 11) return 'k';
      return 'F';
    }),
    palette: { m: '#4f8cff', l: '#9cc0ff', d: '#2a5bc2', F: '#f4f6fa', k: '#1d2433', o: '#14213d' },
  },
  info: {
    rows: gen((x, y, _dx, _dy, r) => {
      if (r > 7.3) return '.';
      const stem = x === 7 || x === 8;
      if (stem && (y === 3 || y === 4)) return 'W';
      if (stem && y >= 6 && y <= 11) return 'W';
      if ((y === 11 && (x === 6 || x === 9)) || (y === 6 && x === 6)) return 'W';
      return '#';
    }),
    palette: { m: '#3b82f6', l: '#7fb0ff', d: '#1e4fb8', W: '#ffffff', o: '#0f1f45' },
  },
  trophy: {
    rows: [
      '................',
      '..############..',
      '.o############o.',
      'o.o##########o.o',
      'o.o##########o.o',
      '.o.o########o.o.',
      '..oo########oo..',
      '.....######.....',
      '......####......',
      '......####......',
      '......####......',
      '.....######.....',
      '....########....',
      '....########....',
      '................',
      '................',
    ],
    palette: { m: '#f5c542', l: '#ffe9a0', d: '#c98a12', o: '#5a3a00' },
  },
  shield: {
    rows: [
      '................',
      '..############..',
      '..#####aa#####..',
      '..#####aa#####..',
      '..##aaaaaaaa##..',
      '..##aaaaaaaa##..',
      '..#####aa#####..',
      '..#####aa#####..',
      '...####aa####...',
      '...####aa####...',
      '....###aa###....',
      '.....##aa##.....',
      '......#aa#......',
      '.......##.......',
      '................',
      '................',
    ],
    palette: { m: '#3b6fd1', l: '#6b95ea', d: '#22489a', a: '#f2c94c', o: '#14213d' },
  },
};

export const ICON_LABELS: Record<IconId, string> = {
  heart: '愛心', star: '星星', sword: '劍', pickaxe: '鎬', bag: '背包', gear: '齒輪', home: '房子', map: '地圖',
  coin: '金幣', check: '勾選', cross: '叉叉', arrow_left: '左箭頭', arrow_right: '右箭頭', arrow_up: '上箭頭',
  arrow_down: '下箭頭', lock: '鎖', sun: '太陽', moon: '月亮', rain: '下雨', chest: '寶箱', book: '書本',
  potion: '藥水', chat: '對話', globe: '地球', clock: '時鐘', info: '資訊', trophy: '獎盃', shield: '盾牌',
};

const isUpper = (c: string) => c >= 'A' && c <= 'Z';

/** Applies auto-outline and auto-shading. Returns 16 rows of palette letters. */
export function processIcon(rows: Rows): string[][] {
  const g = Array.from({ length: N }, (_, y) => Array.from({ length: N }, (_, x) => rows[y]?.[x] ?? '.'));
  const filled = (x: number, y: number) => x >= 0 && y >= 0 && x < N && y < N && g[y][x] !== '.';
  const out = g.map((r) => [...r]);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const c = g[y][x];
      if (c === '.' || c === 'o' || isUpper(c)) continue;
      if (!filled(x - 1, y) || !filled(x + 1, y) || !filled(x, y - 1) || !filled(x, y + 1)) out[y][x] = 'o';
    }
  const isO = (x: number, y: number) => x >= 0 && y >= 0 && x < N && y < N && out[y][x] === 'o';
  const shaded = out.map((r) => [...r]);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      if (out[y][x] !== '#') continue;
      if (isO(x, y - 1) || isO(x - 1, y)) shaded[y][x] = 'l';
      else if (isO(x, y + 1) || isO(x + 1, y)) shaded[y][x] = 'd';
      else shaded[y][x] = 'm';
    }
  return shaded;
}

const processed = new Map<IconId, string[][]>();
const colourCache = new Map<string, (string | null)[][]>();

/** 16x16 grid of CSS colours (null = transparent) for an icon, optionally tinted. */
export function iconPixels(id: IconId, tint: string | null = null): (string | null)[][] {
  const key = `${id}|${tint ?? ''}`;
  const hit = colourCache.get(key);
  if (hit) return hit;
  const def = DEFS[id] ?? DEFS.star;
  let grid = processed.get(id);
  if (!grid) {
    grid = processIcon(def.rows);
    processed.set(id, grid);
  }
  const pal: Record<string, string> = { o: '#1b1b24', ...def.palette };
  if (tint) {
    pal.m = tint;
    pal.l = lighten(tint, 0.45);
    pal.d = darken(tint, 0.35);
  }
  const out = grid.map((row) => row.map((c) => (c === '.' ? null : css(pal[c] ?? pal.m ?? '#ff00ff'))));
  colourCache.set(key, out);
  return out;
}

export function drawIcon(ctx: Ctx2D, id: IconId, x: number, y: number, scale = 1, tint: string | null = null): void {
  const px = iconPixels(id, tint);
  for (let j = 0; j < N; j++) {
    const row = px[j];
    let i = 0;
    while (i < N) {
      const c = row[i];
      let k = i + 1;
      while (k < N && row[k] === c) k++;
      if (c) {
        ctx.fillStyle = c;
        ctx.fillRect(x + i * scale, y + j * scale, (k - i) * scale, scale);
      }
      i = k;
    }
  }
}
