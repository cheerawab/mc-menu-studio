// "羊皮紙": aged paper with speckles, dark wood frame, gold rivets, leather buttons.
import { darken, lighten, mix } from '../render/color';
import { bevel, fill, fillShape, SQUARE, speckle, strokeShape, type Corner } from '../render/pixel';
import type { Ctx2D } from '../render/types';
import { barFillWidth, forSegments, type Skin } from './types';

const PAPER = '#ead9b0';
const FRAME = '#4a2c14';
const TRIM = '#b08850';
const GOLD = '#d4a637';
const INK = '#3b2412';
const round = (r: number): Corner => ({ kind: 'round', r });

function paper(ctx: Ctx2D, x: number, y: number, w: number, h: number, base: string) {
  fill(ctx, x, y, w, h, base);
  strokeShape(ctx, x, y, w, h, SQUARE, mix(base, '#9c7440', 0.28));
  if (w > 4 && h > 4) strokeShape(ctx, x + 1, y + 1, w - 2, h - 2, SQUARE, mix(base, '#9c7440', 0.12));
  speckle(ctx, x + 2, y + 2, w - 4, h - 4, SQUARE, darken(base, 0.1), 0.05, 7);
  speckle(ctx, x + 2, y + 2, w - 4, h - 4, SQUARE, lighten(base, 0.4), 0.025, 13);
}

function rivet(ctx: Ctx2D, cx: number, cy: number) {
  fill(ctx, cx - 1, cy - 2, 2, 4, FRAME);
  fill(ctx, cx - 2, cy - 1, 4, 2, FRAME);
  fill(ctx, cx - 1, cy - 1, 2, 2, GOLD);
  fill(ctx, cx - 1, cy - 1, 1, 1, lighten(GOLD, 0.6));
}

export const parchmentSkin: Skin = {
  id: 'parchment',
  name: '羊皮紙',
  description: '泛黃紙張、木框、金色鉚釘與皮革按鈕，奇幻冒險風。',
  accent: '#4e7a3a',
  swatches: ['#ead9b0', '#b08850', '#4a2c14', '#4e7a3a'],
  text: { color: INK, muted: '#7a5a3a' },

  drawPanel(ctx, { x, y, w, h }, o) {
    const base = o.fill ?? PAPER;
    if (o.variant === 'inset') {
      fill(ctx, x, y, w, h, o.border ?? '#8a6436');
      fill(ctx, x + 1, y + 1, w - 2, h - 2, o.fill ?? '#d8bf8c');
      bevel(ctx, x + 1, y + 1, w - 2, h - 2, darken(o.fill ?? '#d8bf8c', 0.16), lighten(o.fill ?? '#d8bf8c', 0.18), 1);
      return;
    }
    if (o.variant === 'flat') {
      fill(ctx, x, y, w, h, o.border ?? '#8a6436');
      paper(ctx, x + 1, y + 1, w - 2, h - 2, base);
      return;
    }
    const frame = o.border ?? FRAME;
    fillShape(ctx, x, y, w, h, round(3), frame);
    fillShape(ctx, x + 1, y + 1, w - 2, h - 2, round(2), lighten(frame, 0.12));
    fill(ctx, x + 2, y + 2, w - 4, h - 4, TRIM);
    paper(ctx, x + 3, y + 3, w - 6, h - 6, base);
    if (w >= 28 && h >= 28) {
      rivet(ctx, x + 4, y + 4);
      rivet(ctx, x + w - 4, y + 4);
      rivet(ctx, x + 4, y + h - 4);
      rivet(ctx, x + w - 4, y + h - 4);
    }
  },

  drawButton(ctx, { x, y, w, h }, o, k) {
    let base: string;
    let text = '#fbefd5';
    switch (o.variant) {
      case 'primary': base = o.fill ?? k.accent; break;
      case 'danger': base = o.fill ?? '#9e2e24'; break;
      case 'disabled': base = o.fill ?? '#a8977a'; text = '#e6dcc6'; break;
      default: base = o.fill ?? '#8a5a32';
    }
    fillShape(ctx, x, y, w, h, round(2), '#2e1a0c');
    fill(ctx, x + 1, y + 1, w - 2, h - 2, base);
    fill(ctx, x + 1, y + 1, w - 2, 1, lighten(base, 0.28));
    fill(ctx, x + 1, y + h - 3, w - 2, 2, darken(base, 0.32));
    if (h >= 16 && w >= 16 && o.variant !== 'disabled') {
      // stitched seam just inside the edge
      const sc = withSeam(base);
      for (let i = x + 3; i < x + w - 3; i += 3) {
        fill(ctx, i, y + 2, 1, 1, sc);
        fill(ctx, i, y + h - 4, 1, 1, sc);
      }
    }
    return {
      text,
      shadow: o.variant === 'disabled' ? null : darken(base, 0.7),
      face: { x: x + 1, y: y + 1, w: w - 2, h: h - 3 },
    };
  },

  drawSlot(ctx, { x, y, w, h }) {
    fillShape(ctx, x, y, w, h, round(2), '#7a5530');
    fill(ctx, x + 1, y + 1, w - 2, h - 2, '#d6bd88');
    fill(ctx, x + 1, y + 1, w - 2, 1, '#b8975e');
    fill(ctx, x + 1, y + 2, 1, h - 3, '#b8975e');
  },

  drawBar(ctx, { x, y, w, h }, o) {
    const color = o.color ?? '#b5452f';
    fillShape(ctx, x, y, w, h, round(2), FRAME);
    fill(ctx, x + 1, y + 1, w - 2, h - 2, o.trackColor ?? '#cdb688');
    const iw = w - 2, ih = h - 2;
    const fw = barFillWidth(iw, o.value);
    forSegments(iw, o.segments, (a, b) => {
      const e = Math.min(b, fw);
      if (e <= a) return;
      fill(ctx, x + 1 + a, y + 1, e - a, ih, color);
      if (ih >= 3) fill(ctx, x + 1 + a, y + 1, e - a, 1, lighten(color, 0.3));
    });
    return { text: '#fbefd5', shadow: '#2e1a0c' };
  },

  drawDivider(ctx, { x, y, w, h }, orientation, t) {
    const line = '#7a5530';
    if (orientation === 'vertical') {
      fill(ctx, x + Math.floor((w - t) / 2), y, t, h, line);
      return;
    }
    const cy = y + Math.floor(h / 2);
    fill(ctx, x, cy - Math.floor(t / 2), w, t, line);
    if (w >= 24 && h >= 5) {
      const cx = x + Math.floor(w / 2);
      for (let i = 0; i < 3; i++) fill(ctx, cx - 3 + i, cy - i, 6 - 2 * i, 1 + 2 * i, FRAME);
      fill(ctx, cx - 1, cy - 1, 2, 2, GOLD);
      fill(ctx, x, cy - 1, 2, 2 + (t > 1 ? 1 : 0), line);
      fill(ctx, x + w - 2, cy - 1, 2, 2 + (t > 1 ? 1 : 0), line);
    }
  },
};

function withSeam(base: string) {
  return mix(base, '#f3dfb5', 0.35);
}
