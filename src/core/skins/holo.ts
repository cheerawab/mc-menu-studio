// "全息投影": translucent cyan glass, chamfered corners, thin glowing outline and bright corner brackets.
import { darken, lighten, withAlpha } from '../render/color';
import { fadedLine, fill, fillRows, fillShape, gradientShape, ringRows, rowSpans, strokeShape, type Corner } from '../render/pixel';
import type { Ctx2D } from '../render/types';
import { barFillWidth, forSegments, type Skin } from './types';

const GLASS = '#06202bd1';
const TEXT = '#c8faff';
const chamfer = (r: number): Corner => ({ kind: 'chamfer', r: Math.max(0, r) });

/** Bright L-shaped brackets on the corners of a shape outline. */
function brackets(ctx: Ctx2D, x: number, y: number, w: number, h: number, corner: Corner, len: number, color: string) {
  const rows = ringRows(w, h, corner, 1);
  const picked = rows.map((segs, j) => {
    if (j >= len && j < h - len) return [];
    const out: [number, number][] = [];
    for (const [a, b] of segs) {
      if (a < len) out.push([a, Math.min(b, len)]);
      if (b > w - len) out.push([Math.max(a, w - len), b]);
    }
    return out;
  });
  fillRows(ctx, x, y, picked, color);
}

/** Glowing outline: faint outer ring, bright line, faint inner ring. */
function glowFrame(ctx: Ctx2D, x: number, y: number, w: number, h: number, c: number, color: string, strength = 1) {
  strokeShape(ctx, x, y, w, h, chamfer(c), withAlpha(color, Math.max(0.1, 0.26 * strength)));
  strokeShape(ctx, x + 1, y + 1, w - 2, h - 2, chamfer(c - 1), withAlpha(color, 0.92 * strength));
  strokeShape(ctx, x + 2, y + 2, w - 4, h - 4, chamfer(c - 2), withAlpha(color, Math.max(0.1, 0.16 * strength)));
}

export const holoSkin: Skin = {
  id: 'holo',
  name: '全息投影',
  description: '半透明青色玻璃與發光細框，科幻 HUD 質感。',
  accent: '#5ff3ff',
  swatches: ['#06202b', '#0e4a5c', '#5ff3ff', '#e6fdff'],
  text: { color: TEXT, muted: '#6fcfdc' },

  drawPanel(ctx, { x, y, w, h }, o, k) {
    const a = o.border ?? k.accent;
    if (o.variant === 'inset') {
      fillShape(ctx, x, y, w, h, chamfer(2), o.fill ?? '#02121a99');
      strokeShape(ctx, x, y, w, h, chamfer(2), withAlpha(a, 0.45));
      return;
    }
    if (o.variant === 'flat') {
      fillShape(ctx, x, y, w, h, chamfer(3), o.fill ?? GLASS);
      strokeShape(ctx, x, y, w, h, chamfer(3), withAlpha(a, 0.5));
      return;
    }
    const c = Math.min(5, Math.floor(Math.min(w, h) / 4));
    fillShape(ctx, x, y, w, h, chamfer(c), o.fill ?? GLASS);
    const spans = rowSpans(w - 4, h - 4, chamfer(c - 2));
    for (let j = 1; j < spans.length; j += 3) {
      const s = spans[j];
      if (s) fill(ctx, x + 2 + s[0], y + 2 + j, s[1] - s[0], 1, withAlpha(a, 0.1));
    }
    glowFrame(ctx, x, y, w, h, c, a);
    const len = Math.max(3, Math.min(10, Math.floor(Math.min(w, h) / 5)));
    brackets(ctx, x + 1, y + 1, w - 2, h - 2, chamfer(c - 1), len, lighten(a, 0.7));
    if (w >= 60) fadedLine(ctx, x + Math.floor(w / 4), y + 3, Math.floor(w / 2), 1, withAlpha(a, 0.35));
  },

  drawButton(ctx, { x, y, w, h }, o, k) {
    const accent = o.variant === 'danger' ? '#ff4d6d' : k.accent;
    const c = Math.min(3, Math.floor(h / 4));
    const inner = { x: x + 1, y: y + 1, w: w - 2, h: h - 2 };
    if (o.variant === 'primary') {
      const base = o.fill ?? accent;
      strokeShape(ctx, x, y, w, h, chamfer(c), withAlpha(base, 0.35));
      gradientShape(ctx, inner.x, inner.y, inner.w, inner.h, chamfer(c - 1), lighten(base, 0.3), base, 'vertical');
      brackets(ctx, inner.x, inner.y, inner.w, inner.h, chamfer(c - 1), 3, lighten(base, 0.75));
      return { text: darken(base, 0.82), shadow: null, face: inner };
    }
    const disabled = o.variant === 'disabled';
    const base = o.fill ?? accent;
    gradientShape(ctx, x + 1, y + 1, w - 2, h - 2, chamfer(c - 1),
      withAlpha(base, disabled ? 0.12 : 0.26), withAlpha(base, disabled ? 0.1 : 0.12), 'vertical');
    glowFrame(ctx, x, y, w, h, c, base, disabled ? 0.35 : 1);
    if (!disabled) brackets(ctx, inner.x, inner.y, inner.w, inner.h, chamfer(c - 1), 3, lighten(base, 0.7));
    return {
      text: disabled ? withAlpha(TEXT, 0.4) : o.variant === 'danger' ? '#ffe3e8' : '#e6fdff',
      shadow: null,
      face: inner,
    };
  },

  drawSlot(ctx, { x, y, w, h }, k) {
    fillShape(ctx, x, y, w, h, chamfer(2), '#03141c99');
    strokeShape(ctx, x, y, w, h, chamfer(2), withAlpha(k.accent, 0.5));
    const b = lighten(k.accent, 0.6);
    fill(ctx, x + 1, y + 1, 1, 1, b);
    fill(ctx, x + w - 2, y + 1, 1, 1, b);
    fill(ctx, x + 1, y + h - 2, 1, 1, b);
    fill(ctx, x + w - 2, y + h - 2, 1, 1, b);
  },

  drawBar(ctx, { x, y, w, h }, o, k) {
    const color = o.color ?? k.accent;
    fill(ctx, x, y, w, h, o.trackColor ?? '#03141ccc');
    strokeShape(ctx, x, y, w, h, chamfer(0), withAlpha(color, 0.55));
    const iw = w - 4, ih = h - 4;
    const fw = barFillWidth(iw, o.value);
    forSegments(iw, o.segments, (a, b) => {
      const e = Math.min(b, fw);
      if (e <= a) return;
      fill(ctx, x + 2 + a, y + 2, e - a, ih, color);
      fill(ctx, x + 2 + a, y + 2, e - a, 1, lighten(color, 0.6));
    });
    return { text: '#e6fdff', shadow: '#00303a' };
  },

  drawDivider(ctx, { x, y, w, h }, orientation, t, k) {
    if (orientation === 'horizontal') {
      const yy = y + Math.floor((h - t) / 2);
      fadedLine(ctx, x, yy, w, t, withAlpha(k.accent, 0.9));
      const dash = Math.min(12, Math.floor(w / 6));
      fill(ctx, x + Math.floor((w - dash) / 2), yy, dash, t, lighten(k.accent, 0.7));
    } else {
      const xx = x + Math.floor((w - t) / 2);
      fill(ctx, xx, y, t, h, withAlpha(k.accent, 0.6));
    }
  },
};
