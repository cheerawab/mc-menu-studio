// "原版風格": grey bevelled panels and buttons in the spirit of the vanilla game UI (drawn procedurally).
import { darken, lighten, luminance } from '../render/color';
import { bevel, fill, fillShape } from '../render/pixel';
import { barFillWidth, forSegments, type Skin } from './types';

const PANEL = '#c6c6c6';
const OUTLINE = '#000000';

export const vanillaSkin: Skin = {
  id: 'vanilla',
  name: '原版風格',
  description: '熟悉的灰色立體邊框，和遊戲內建介面無縫融合。',
  accent: '#4f9a3a',
  swatches: ['#c6c6c6', '#8b8b8b', '#373737', '#4f9a3a'],
  text: { color: '#404040', muted: '#6b6b6b' },

  drawPanel(ctx, { x, y, w, h }, o) {
    if (o.variant === 'inset') {
      fill(ctx, x, y, w, h, o.fill ?? '#8b8b8b');
      bevel(ctx, x, y, w, h, o.border ?? '#373737', '#ffffff', 1);
      return;
    }
    if (o.variant === 'flat') {
      fill(ctx, x, y, w, h, o.border ?? '#555555');
      fill(ctx, x + 1, y + 1, w - 2, h - 2, o.fill ?? PANEL);
      return;
    }
    const base = o.fill ?? PANEL;
    const hi = o.fill ? lighten(base, 0.55) : '#ffffff';
    const lo = o.fill ? darken(base, 0.45) : '#555555';
    fillShape(ctx, x, y, w, h, { kind: 'round', r: 2 }, o.border ?? OUTLINE);
    fill(ctx, x + 1, y + 1, w - 2, h - 2, base);
    const t = Math.min(w, h) >= 12 ? 2 : 1;
    fill(ctx, x + 1, y + 1, w - 2 - t, t, hi);
    fill(ctx, x + 1, y + 1 + t, t, h - 2 - 2 * t, hi);
    fill(ctx, x + 1 + t, y + h - 1 - t, w - 2 - t, t, lo);
    fill(ctx, x + w - 1 - t, y + 1 + t, t, h - 2 - 2 * t, lo);
  },

  drawButton(ctx, { x, y, w, h }, o, k) {
    let base: string;
    let text = '#ffffff';
    let shadow: string | null = null;
    switch (o.variant) {
      case 'primary': base = o.fill ?? k.accent; break;
      case 'danger': base = o.fill ?? '#b23a3a'; break;
      case 'disabled': base = o.fill ?? '#2f2f2f'; text = '#a0a0a0'; break;
      default: base = o.fill ?? '#737373';
    }
    if (o.variant !== 'disabled') {
      if (luminance(base) > 0.55) text = '#202020';
      else shadow = darken(base, 0.7);
    }
    fill(ctx, x, y, w, h, OUTLINE);
    fill(ctx, x + 1, y + 1, w - 2, h - 2, base);
    fill(ctx, x + 1, y + 1, w - 2, 1, lighten(base, 0.35));
    fill(ctx, x + 1, y + 2, 1, h - 5, lighten(base, 0.2));
    fill(ctx, x + w - 2, y + 2, 1, h - 5, darken(base, 0.18));
    fill(ctx, x + 1, y + h - 3, w - 2, 2, darken(base, 0.38));
    return { text, shadow, face: { x: x + 1, y: y + 1, w: w - 2, h: h - 4 } };
  },

  drawSlot(ctx, { x, y, w, h }) {
    fill(ctx, x, y, w, h, '#8b8b8b');
    bevel(ctx, x, y, w, h, '#373737', '#ffffff', 1);
  },

  drawBar(ctx, { x, y, w, h }, o, k) {
    const color = o.color ?? lighten(k.accent, 0.25);
    fill(ctx, x, y, w, h, OUTLINE);
    fill(ctx, x + 1, y + 1, w - 2, h - 2, o.trackColor ?? '#2b2b2b');
    const iw = w - 2, ih = h - 2;
    const fw = barFillWidth(iw, o.value);
    forSegments(iw, o.segments, (a, b) => {
      const e = Math.min(b, fw);
      if (e <= a) return;
      fill(ctx, x + 1 + a, y + 1, e - a, ih, color);
      if (ih >= 3) {
        fill(ctx, x + 1 + a, y + 1, e - a, 1, lighten(color, 0.45));
        fill(ctx, x + 1 + a, y + h - 2, e - a, 1, darken(color, 0.3));
      }
    });
    return { text: '#ffffff', shadow: '#3f3f3f' };
  },

  drawDivider(ctx, { x, y, w, h }, orientation, t) {
    if (orientation === 'horizontal') {
      const yy = y + Math.floor((h - 2 * t) / 2);
      fill(ctx, x, yy, w, t, '#555555');
      fill(ctx, x, yy + t, w, t, '#ffffff');
    } else {
      const xx = x + Math.floor((w - 2 * t) / 2);
      fill(ctx, xx, y, t, h, '#555555');
      fill(ctx, xx + t, y, t, h, '#ffffff');
    }
  },
};
