// Draws one element. All drawing stays inside the element's rect (the caller clips to it).
import type { Element, LabelElement, Project } from '../model/types';
import type { Skin, SkinKit } from '../skins/types';
import { darken } from './color';
import { drawIcon } from './icons';
import { fill, fillShape, gradientShape, SQUARE, strokeShape, type Corner } from './pixel';
import { drawText, measureTextWidth, PIXELATE_AUTO_MAX, type TextStyle } from './text';
import type { Ctx2D, RenderEnv } from './types';

export interface DrawContext {
  skin: Skin;
  kit: SkinKit;
  env: RenderEnv;
  project: Project;
  placeholders: boolean;
}

/** Minecraft-style shadow: the text colour at 25% brightness. */
export function shadowOf(color: string): string {
  return darken(color, 0.75);
}

export function labelStyle(el: LabelElement, dc: DrawContext): TextStyle {
  const color = el.color ?? dc.skin.text.color;
  return {
    fontSize: el.fontSize,
    bold: el.bold,
    family: el.fontFamily || dc.project.settings.fontFamily,
    color,
    shadow: el.shadow ? shadowOf(color) : null,
    align: el.align,
    vAlign: el.vAlign,
    lineHeight: el.lineHeight,
    wrap: el.wrap,
    pixelate: el.pixelate === 'on' || (el.pixelate === 'auto' && el.fontSize <= PIXELATE_AUTO_MAX),
  };
}

function drawPlaceholder(ctx: Ctx2D, x: number, y: number, w: number, h: number) {
  for (let j = 0; j < h; j += 4)
    for (let i = (j / 4) % 2 ? 4 : 0; i < w; i += 8) fill(ctx, x + i, y + j, Math.min(4, w - i), Math.min(4, h - j), '#80808033');
  strokeShape(ctx, x, y, w, h, SQUARE, '#9aa3b2aa');
  if (w >= 20 && h >= 16) {
    const cx = x + Math.floor(w / 2), cy = y + Math.floor(h / 2);
    for (let i = 0; i < 5; i++) fill(ctx, cx - 6 + i, cy + 4 - i, 1, i + 1, '#9aa3b2');
    for (let i = 0; i < 4; i++) fill(ctx, cx - 1 + i, cy + 4 - i, 1, i + 1, '#9aa3b2');
    for (let i = 0; i < 4; i++) fill(ctx, cx + 3 + i, cy + 1 + i, 1, 4 - i, '#9aa3b2');
    fill(ctx, cx + 2, cy - 5, 3, 3, '#9aa3b2');
  }
}

export function drawElement(ctx: Ctx2D, el: Element, dc: DrawContext): void {
  const { x, y, w, h } = el;
  const { skin, kit, env } = dc;
  switch (el.type) {
    case 'panel':
      skin.drawPanel(ctx, el, { variant: el.variant, fill: el.fill, border: el.border }, kit);
      return;

    case 'button': {
      const look = skin.drawButton(ctx, el, { variant: el.variant, fill: el.fill }, kit);
      const color = el.textColor ?? look.text;
      const shadow = look.shadow ? (el.textColor ? shadowOf(color) : look.shadow) : null;
      const family = dc.project.settings.fontFamily;
      const text = el.text.replace(/\n/g, ' ');
      const tw = text.trim() ? measureTextWidth(env, text, el.fontSize, el.bold, family) + (shadow ? 1 : 0) : 0;
      const f = look.face;
      const showIcon = el.icon !== null && f.h >= 16;
      const gap = showIcon && tw ? 4 : 0;
      const total = (showIcon ? 16 : 0) + gap + tw;
      let cx = f.x + Math.max(0, Math.floor((f.w - total) / 2));
      if (showIcon && el.icon) {
        drawIcon(ctx, el.icon, cx, f.y + Math.floor((f.h - 16) / 2), 1, null);
        cx += 16 + gap;
      }
      if (tw)
        drawText(ctx, env, { x: cx, y: f.y, w: Math.max(1, Math.min(tw + 1, f.x + f.w - cx)), h: f.h }, text, {
          fontSize: el.fontSize, bold: el.bold, family, color, shadow, align: 'left', vAlign: 'middle',
          lineHeight: 1.2, wrap: false, pixelate: el.fontSize <= PIXELATE_AUTO_MAX,
        });
      return;
    }

    case 'label':
      drawText(ctx, env, el, el.text, labelStyle(el, dc));
      return;

    case 'image': {
      const img = el.assetId ? env.images?.get(el.assetId) : undefined;
      if (!img || !img.width || !img.height) {
        if (dc.placeholders) drawPlaceholder(ctx, x, y, w, h);
        return;
      }
      ctx.imageSmoothingEnabled = el.smoothing;
      const iw = img.width, ih = img.height;
      if (el.fit === 'stretch') {
        ctx.drawImage(img, x, y, w, h);
        return;
      }
      let s: number;
      if (el.fit === 'original') s = el.scale;
      else if (el.fit === 'contain') s = Math.min(w / iw, h / ih);
      else s = Math.max(w / iw, h / ih);
      const dw = Math.max(1, Math.round(iw * s)), dh = Math.max(1, Math.round(ih * s));
      ctx.drawImage(img, x + Math.floor((w - dw) / 2), y + Math.floor((h - dh) / 2), dw, dh);
      return;
    }

    case 'bar': {
      const look = skin.drawBar(ctx, el, { value: el.value, color: el.color, trackColor: el.trackColor, segments: el.segments }, kit);
      if (el.text.trim() && h >= 10) {
        const size = Math.max(8, Math.min(14, h - 2));
        drawText(ctx, env, el, el.text, {
          fontSize: size, bold: false, family: dc.project.settings.fontFamily, color: look.text, shadow: look.shadow,
          align: 'center', vAlign: 'middle', lineHeight: 1.1, wrap: false, pixelate: size <= PIXELATE_AUTO_MAX,
        });
      }
      return;
    }

    case 'shape': {
      const corner: Corner =
        el.shape === 'ellipse' ? { kind: 'ellipse' } : el.shape === 'rounded' ? { kind: 'round', r: el.radius } : SQUARE;
      if (el.gradient) gradientShape(ctx, x, y, w, h, corner, el.fill, el.gradient.to, el.gradient.direction);
      else fillShape(ctx, x, y, w, h, corner, el.fill);
      if (el.stroke) strokeShape(ctx, x, y, w, h, corner, el.stroke, el.strokeWidth);
      return;
    }

    case 'divider': {
      const t = el.thickness;
      if (el.style === 'skin' && !el.color) {
        skin.drawDivider(ctx, el, el.orientation, t, kit);
        return;
      }
      const color = el.color ?? skin.text.muted;
      const horiz = el.orientation === 'horizontal';
      const len = horiz ? w : h;
      const [on, period] = el.style === 'dashed' ? [4 * t, 6 * t] : el.style === 'dotted' ? [t, 2 * t] : [len, len];
      const off = horiz ? y + Math.floor((h - t) / 2) : x + Math.floor((w - t) / 2);
      for (let i = 0; i < len; i += period) {
        const l = Math.min(on, len - i);
        if (horiz) fill(ctx, x + i, off, l, t, color);
        else fill(ctx, off, y + i, t, l, color);
      }
      return;
    }

    case 'slotgrid':
      for (let r = 0; r < el.rows; r++)
        for (let c = 0; c < el.cols; c++)
          skin.drawSlot(ctx, { x: x + c * (el.slotSize + el.gap), y: y + r * (el.slotSize + el.gap), w: el.slotSize, h: el.slotSize }, kit);
      return;

    case 'icon':
      drawIcon(ctx, el.icon, x, y, el.scale, el.tint);
      return;
  }
}

