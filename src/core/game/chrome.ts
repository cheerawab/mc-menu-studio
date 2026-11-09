// In-game mock preview of the vanilla Dialog screen. All metrics live in ONE object so they can be calibrated from
// real screenshots. Units are GUI pixels (screen pixels / GUI scale).
// MEASURED = docs/VERIFIED.md §1/§8 (real 26.3 client, GUI scale 3, 1280x720 window = 853x480 GUI px);
// everything else is an estimate.
import { WIDGET_PADDING, WIDTH_MARGIN } from '../export/constants';
import type { Rect } from '../model/types';
import { mix } from '../render/color';
import { fill, hash2 } from '../render/pixel';
import { drawText, measureTextWidth } from '../render/text';
import type { Ctx2D, ImageLike, RenderEnv } from '../render/types';
import { vanillaSkin } from '../skins/vanilla';

export const GAME_CHROME = {
  /** MEASURED: top edge of the picture, from the window top (same for 100/160/300 px tall pictures). */
  pictureTop: 67,
  /** MEASURED: footer button ~150x20 (150 = JAR default width of a notice action). */
  footerButton: { w: 150, h: 20 },
  /** MEASURED: the footer button ends ~6 px above the window bottom. */
  footerButtonBottom: 6,
  /** MEASURED: title baseline ~16 px below the window top; the title is centred. */
  titleBaseline: 16,
  /** Estimate: header area (title + warning button) height; only used for the separator line and scroll clipping. */
  headerHeight: 33,
  /** Estimate: footer area height (the body scrolls above it). */
  footerHeight: 33,
  /** Estimate: space kept between the body content and the footer. */
  bodyBottomPadding: 4,
  /** FocusableTextWidget padding per side [GW: 4]; the picture starts this far inside the widget. */
  textPadding: 4,
  /** VERIFIED §3: one text line is 9 px. */
  lineHeight: 9,
  /** Mock only: title font size (the game uses its 8 px font; CJK glyphs come from unifont). */
  titleFontSize: 10,
  titleColor: '#ffffff',
  /** Estimate: warning icon button next to the title [JAR: exists]. */
  warningButtonSize: 20,
  titleWarningGap: 6,
  /** Default footer label (projects can change it). */
  footerLabel: '關閉',
  /** Mock only: dim layer over the (blurred) world. */
  dimColor: '#08080ca8',
  /** Mock only: header/footer separator lines (dark then light). */
  separator: ['#00000066', '#ffffff24'] as const,
  /** Mock only: scrollbar drawn when the body is taller than the window. */
  scrollbarWidth: 6,
};

export type GuiScale = 1 | 2 | 3 | 4;

export interface WindowPreset {
  id: string;
  label: string;
  w: number;
  h: number;
}

export const WINDOW_PRESETS: WindowPreset[] = [
  { id: '1280x720', label: '1280 × 720', w: 1280, h: 720 },
  { id: '1920x1080', label: '1920 × 1080', w: 1920, h: 1080 },
  { id: '2560x1440', label: '2560 × 1440', w: 2560, h: 1440 },
];

/** The game's "auto" GUI scale: largest scale that keeps at least 320 x 240 GUI pixels. */
export function autoGuiScale(winW: number, winH: number): number {
  let s = 1;
  while (winW / (s + 1) >= 320 && winH / (s + 1) >= 240) s++;
  return s;
}

export interface GameLayout {
  guiW: number;
  guiH: number;
  header: Rect;
  footer: Rect;
  /** Scrollable area between header and footer. */
  body: Rect;
  /** Where the page bitmap is drawn (may extend below the body when it needs scrolling). */
  page: Rect;
  /** Size of the text widget that holds the page (width = plain_message.width = W + 12). */
  widget: { w: number; h: number };
  /** Height available for the widget before it needs scrolling. */
  widgetSpace: number;
  footerButton: Rect;
  fitsWidth: boolean;
  fitsHeight: boolean;
}

/** Height of the plain_message widget for a page of height h (first line + ceil(h/9) empty lines + padding). */
export function widgetHeight(pageH: number): number {
  const C = GAME_CHROME;
  return 2 * C.textPadding + C.lineHeight * (1 + Math.ceil(pageH / C.lineHeight));
}

export function gameLayout(winW: number, winH: number, scale: number, pageW: number, pageH: number): GameLayout {
  const C = GAME_CHROME;
  const guiW = Math.floor(winW / scale), guiH = Math.floor(winH / scale);
  const header = { x: 0, y: 0, w: guiW, h: C.headerHeight };
  const footer = { x: 0, y: guiH - C.footerHeight, w: guiW, h: C.footerHeight };
  const body = { x: 0, y: header.h, w: guiW, h: Math.max(0, footer.y - header.h) };
  const widget = { w: pageW + WIDGET_PADDING + WIDTH_MARGIN, h: widgetHeight(pageH) };
  const widgetSpace = Math.max(0, footer.y - C.bodyBottomPadding - (C.pictureTop - C.textPadding));
  // The picture is centred horizontally and starts at the measured top (it scrolls with the body when too tall).
  const page = { x: Math.floor((guiW - pageW) / 2), y: C.pictureTop, w: pageW, h: pageH };
  const fb = C.footerButton;
  const footerButton = { x: Math.floor((guiW - fb.w) / 2), y: guiH - C.footerButtonBottom - fb.h, w: fb.w, h: fb.h };
  return {
    guiW, guiH, header, footer, body, page, widget, widgetSpace, footerButton,
    fitsWidth: widget.w <= guiW,
    fitsHeight: widget.h <= widgetSpace,
  };
}

/** zh-TW fit warning for the checks, or null when the page fits the window at that GUI scale. */
export function fitProblem(win: WindowPreset, guiScale: number, page: { width: number; height: number }): string | null {
  const L = gameLayout(win.w, win.h, guiScale, page.width, page.height);
  if (!L.fitsWidth) return `在 ${win.label}、GUI ${guiScale} 下寬度超出視窗。`;
  if (!L.fitsHeight) return `在 ${win.label}、GUI ${guiScale} 下高度不足，玩家需要捲動才看得到全部。`;
  return null;
}

/** Stylised blocky landscape standing in for the blurred world behind the dialog. */
export function drawWorld(ctx: Ctx2D, w: number, h: number, seed = 3): void {
  const horizon = Math.floor(h * 0.52);
  for (let y = 0; y < horizon; y += 2) fill(ctx, 0, y, w, 2, mix('#5f97e8', '#cfe2fb', y / horizon));
  const B = 16;
  const cols = Math.ceil(w / B) + 1;
  const height = (c: number) => {
    const a = hash2(Math.floor(c / 4), 0, seed), b = hash2(Math.floor(c / 4) + 1, 0, seed);
    const t = (c % 4) / 4;
    return Math.round((a * (1 - t) + b * t) * 3 + hash2(c, 1, seed) * 0.8);
  };
  for (let c = 0; c < cols; c++) {
    const x = c * B;
    const top = horizon + height(c) * B - B;
    if (hash2(c, 7, seed) < 0.16 && c % 3 === 1) {
      fill(ctx, x + 6, top - 3 * B + 8, 4, 3 * B - 8, '#6b4a2b');
      fill(ctx, x - B + 4, top - 4 * B + 4, 3 * B - 8, 2 * B - 4, '#3f7d2e');
      fill(ctx, x - B + 8, top - 4 * B, 3 * B - 16, 8, '#4f9638');
    }
    fill(ctx, x, top, B, 4, '#6fb043');
    fill(ctx, x, top + 4, B, B - 4, '#5d9b3a');
    for (let y = top + B, r = 0; y < h; y += B, r++) {
      const stone = r > 1 && hash2(c, r, seed + 1) < 0.55;
      fill(ctx, x, y, B, B, stone ? (hash2(c, r, 9) < 0.5 ? '#7d7d80' : '#727276') : hash2(c, r, 5) < 0.5 ? '#86603d' : '#7b5634');
    }
  }
  fill(ctx, 0, 0, w, h, GAME_CHROME.dimColor);
}

function warningButton(ctx: Ctx2D, x: number, y: number, s: number) {
  vanillaSkin.drawButton(ctx, { x, y, w: s, h: s }, { variant: 'default', fill: null }, { accent: '#4f9a3a' });
  const cx = x + Math.floor(s / 2), top = y + 4;
  for (let i = 0; i < 9; i++) fill(ctx, cx - 1 - Math.floor(i / 2), top + i, 2 + 2 * Math.floor(i / 2), 1, '#f6c445');
  fill(ctx, cx - 1, top + 2, 2, 4, '#3a2a00');
  fill(ctx, cx - 1, top + 7, 2, 1, '#3a2a00');
}

export interface MockOptions {
  title: string;
  page: ImageLike | null;
  footerLabel?: string;
  fontFamily: string;
}

/** Draws the whole dialog screen in GUI pixels into a guiW x guiH context. */
export function drawGameMock(ctx: Ctx2D, env: RenderEnv, L: GameLayout, o: MockOptions): void {
  const C = GAME_CHROME;
  ctx.save();
  ctx.clearRect(0, 0, L.guiW, L.guiH);
  drawWorld(ctx, L.guiW, L.guiH);

  // body (page bitmap, clipped to the scrollable area)
  if (o.page) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(L.body.x, L.body.y, L.body.w, L.body.h);
    ctx.clip();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(o.page, L.page.x, L.page.y);
    ctx.restore();
  }
  if (!L.fitsHeight && L.body.h > 8) {
    const sx = L.guiW - C.scrollbarWidth - 2;
    fill(ctx, sx, L.body.y + 2, C.scrollbarWidth, L.body.h - 4, '#00000080');
    const content = C.pictureTop - C.textPadding - L.body.y + L.widget.h + C.bodyBottomPadding;
    const thumb = Math.max(8, Math.floor(((L.body.h - 4) * L.body.h) / Math.max(content, L.body.h)));
    fill(ctx, sx, L.body.y + 2, C.scrollbarWidth, thumb, '#c0c0c0');
    fill(ctx, sx + C.scrollbarWidth - 1, L.body.y + 2, 1, thumb, '#7f7f7f');
  }

  // separators
  fill(ctx, 0, L.header.h - 2, L.guiW, 1, C.separator[0]);
  fill(ctx, 0, L.header.h - 1, L.guiW, 1, C.separator[1]);
  fill(ctx, 0, L.footer.y, L.guiW, 1, C.separator[0]);
  fill(ctx, 0, L.footer.y + 1, L.guiW, 1, C.separator[1]);

  // header: title + warning icon button, centred together
  const title = o.title.trim() || ' ';
  const fs = C.titleFontSize;
  const tStyle = {
    fontSize: fs, bold: false, family: o.fontFamily, color: C.titleColor, shadow: '#3f3f3f',
    align: 'left' as const, vAlign: 'middle' as const, lineHeight: 1.2, wrap: false, pixelate: true,
  };
  const ws = C.warningButtonSize;
  const tw = Math.max(1, Math.min(L.guiW - ws - 20, measureTextWidth(env, title, fs, false, o.fontFamily) + 2));
  const total = tw + C.titleWarningGap + ws;
  const tx = Math.floor((L.guiW - total) / 2);
  // centre the title line so that its baseline lands near the measured titleBaseline
  const ty = Math.max(0, C.titleBaseline - 4 - Math.floor(ws / 2));
  drawText(ctx, env, { x: tx, y: ty, w: tw, h: ws }, title, { ...tStyle, align: 'right' });
  warningButton(ctx, tx + tw + C.titleWarningGap, ty, ws);

  // footer button
  const look = vanillaSkin.drawButton(ctx, L.footerButton, { variant: 'default', fill: null }, { accent: '#4f9a3a' });
  drawText(ctx, env, look.face, o.footerLabel ?? C.footerLabel, { ...tStyle, align: 'center', color: '#ffffff', shadow: look.shadow });
  ctx.restore();
}
