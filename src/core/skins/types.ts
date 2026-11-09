import type { ButtonVariant, PanelVariant, Rect, SkinId } from '../model/types';
import type { Ctx2D } from '../render/types';

export interface SkinKit {
  /** Effective accent colour (project override or the skin default). */
  accent: string;
}

export interface PanelOpts {
  variant: PanelVariant;
  fill: string | null;
  border: string | null;
}

export interface ButtonOpts {
  variant: ButtonVariant;
  fill: string | null;
}

export interface ButtonLook {
  /** Default text colour on this button. */
  text: string;
  /** Text shadow colour, or null for none. */
  shadow: string | null;
  /** Area the content (icon + text) is centred in. */
  face: Rect;
}

export interface BarOpts {
  value: number;
  color: string | null;
  trackColor: string | null;
  segments: number;
}

export interface Skin {
  id: SkinId;
  /** zh-TW display name */
  name: string;
  /** zh-TW one-line description */
  description: string;
  accent: string;
  /** Colours for the skin picker preview. */
  swatches: string[];
  text: {
    /** Default label colour (on a raised panel). */
    color: string;
    /** Secondary text colour (dividers, hints). */
    muted: string;
  };
  drawPanel(ctx: Ctx2D, r: Rect, o: PanelOpts, k: SkinKit): void;
  drawButton(ctx: Ctx2D, r: Rect, o: ButtonOpts, k: SkinKit): ButtonLook;
  drawSlot(ctx: Ctx2D, r: Rect, k: SkinKit): void;
  drawBar(ctx: Ctx2D, r: Rect, o: BarOpts, k: SkinKit): { text: string; shadow: string | null };
  drawDivider(ctx: Ctx2D, r: Rect, orientation: 'horizontal' | 'vertical', thickness: number, k: SkinKit): void;
}

/** Inner fill width of a progress bar. */
export function barFillWidth(innerW: number, value: number): number {
  return Math.round((innerW * Math.max(0, Math.min(100, value))) / 100);
}

/** Calls fn(x0, x1) for each segment of an inner bar of width w split into n segments with 1 px gaps. */
export function forSegments(w: number, n: number, fn: (x0: number, x1: number) => void): void {
  if (n <= 1) {
    fn(0, w);
    return;
  }
  for (let i = 0; i < n; i++) {
    const x0 = Math.round((i * (w + 1)) / n);
    const x1 = Math.round(((i + 1) * (w + 1)) / n) - 1;
    if (x1 > x0) fn(x0, x1);
  }
}
