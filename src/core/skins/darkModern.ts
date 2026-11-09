// "暗色現代": flat dark surfaces, rounded corners, soft drop shadow and an accent colour.
import { darken, lighten, readableOn, withAlpha } from '../render/color';
import { fill, fillShape, gradientShape, rowSpans, type Corner } from '../render/pixel';
import { barFillWidth, forSegments, type Skin } from './types';

const SURFACE = '#1d2027';
const BORDER = '#343a47';
const INSET = '#14161b';
const TEXT = '#e9ecf2';

const round = (r: number): Corner => ({ kind: 'round', r });

/** 1 px highlight on the first row of a rounded shape. */
function topHighlight(ctx: Parameters<Skin['drawPanel']>[0], x: number, y: number, w: number, h: number, r: number, color: string) {
  const s = rowSpans(w, h, round(r))[0];
  if (s) fill(ctx, x + s[0], y, s[1] - s[0], 1, color);
}

export const darkModernSkin: Skin = {
  id: 'dark',
  name: '暗色現代',
  description: '扁平深色、圓角與強調色，乾淨俐落。',
  accent: '#5b8cff',
  swatches: ['#1d2027', '#343a47', '#e9ecf2', '#5b8cff'],
  text: { color: TEXT, muted: '#9aa3b2' },

  drawPanel(ctx, { x, y, w, h }, o) {
    const base = o.fill ?? SURFACE;
    if (o.variant === 'inset') {
      fillShape(ctx, x, y, w, h, round(5), o.border ?? '#2a2f3a');
      fillShape(ctx, x + 1, y + 1, w - 2, h - 2, round(4), o.fill ?? INSET);
      return;
    }
    if (o.variant === 'flat') {
      fillShape(ctx, x, y, w, h, round(6), o.border ?? base);
      if (o.border) fillShape(ctx, x + 1, y + 1, w - 2, h - 2, round(5), base);
      return;
    }
    const sh = Math.min(3, Math.floor(h / 8));
    if (sh > 0) {
      fillShape(ctx, x, y + sh, w, h - sh, round(6), '#00000033');
      fillShape(ctx, x + 1, y + sh, w - 2, h - sh, round(6), '#00000026');
    }
    fillShape(ctx, x, y, w, h - sh, round(6), o.border ?? BORDER);
    fillShape(ctx, x + 1, y + 1, w - 2, h - sh - 2, round(5), base);
    topHighlight(ctx, x + 1, y + 1, w - 2, h - sh - 2, 5, withAlpha(lighten(base, 0.6), 0.1));
  },

  drawButton(ctx, { x, y, w, h }, o, k) {
    let base: string, border: string, text: string;
    switch (o.variant) {
      case 'primary':
        base = o.fill ?? k.accent; border = darken(base, 0.22); text = readableOn(base, '#ffffff', '#0f1115');
        break;
      case 'danger':
        base = o.fill ?? '#e5484d'; border = darken(base, 0.22); text = '#ffffff';
        break;
      case 'disabled':
        base = o.fill ?? '#21242c'; border = '#2a2f3a'; text = '#5d6576';
        break;
      default:
        base = o.fill ?? '#2b303b'; border = '#3d4454'; text = readableOn(base, TEXT, '#0f1115');
    }
    const r = Math.min(4, Math.floor(h / 2));
    fillShape(ctx, x, y + 1, w, h - 1, round(r), '#00000059');
    fillShape(ctx, x, y, w, h - 1, round(r), border);
    if (o.variant === 'disabled') fillShape(ctx, x + 1, y + 1, w - 2, h - 3, round(r - 1), base);
    else gradientShape(ctx, x + 1, y + 1, w - 2, h - 3, round(r - 1), lighten(base, 0.07), darken(base, 0.04), 'vertical');
    topHighlight(ctx, x + 1, y + 1, w - 2, h - 3, r - 1, withAlpha('#ffffff', o.variant === 'disabled' ? 0.03 : 0.14));
    return { text, shadow: null, face: { x: x + 1, y: y + 1, w: w - 2, h: h - 3 } };
  },

  drawSlot(ctx, { x, y, w, h }) {
    fillShape(ctx, x, y, w, h, round(3), '#2e3440');
    fillShape(ctx, x + 1, y + 1, w - 2, h - 2, round(2), INSET);
    fill(ctx, x + 2, y + 1, w - 4, 1, '#0b0c0f');
  },

  drawBar(ctx, { x, y, w, h }, o, k) {
    const r = Math.floor(h / 2);
    const color = o.color ?? k.accent;
    fillShape(ctx, x, y, w, h, round(r), '#2e3440');
    fillShape(ctx, x + 1, y + 1, w - 2, h - 2, round(r - 1), o.trackColor ?? INSET);
    const iw = w - 2, ih = h - 2;
    const fw = barFillWidth(iw, o.value);
    forSegments(iw, o.segments, (a, b) => {
      const e = Math.min(b, fw);
      if (e <= a) return;
      const seg = o.segments > 1 ? round(Math.min(1, r - 1)) : round(r - 1);
      gradientShape(ctx, x + 1 + a, y + 1, e - a, ih, seg, lighten(color, 0.18), color, 'vertical');
    });
    return { text: readableOn(color, '#ffffff', '#0f1115'), shadow: null };
  },

  drawDivider(ctx, { x, y, w, h }, orientation, t) {
    if (orientation === 'horizontal') fill(ctx, x, y + Math.floor((h - t) / 2), w, t, BORDER);
    else fill(ctx, x + Math.floor((w - t) / 2), y, t, h, BORDER);
  },
};
