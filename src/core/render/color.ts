// Colour helpers. Colours are stored as hex strings (#rgb, #rgba, #rrggbb, #rrggbbaa).

export interface RGBA {
  r: number;
  g: number;
  b: number;
  /** 0..1 */
  a: number;
}

const HEX_RE = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export function isHexColor(s: string): boolean {
  return HEX_RE.test(s.trim());
}

const parseCache = new Map<string, RGBA>();

export function parseColor(input: string): RGBA {
  const hit = parseCache.get(input);
  if (hit) return hit;
  let out: RGBA = { r: 0, g: 0, b: 0, a: 1 };
  const s = input.trim();
  const m = HEX_RE.exec(s);
  if (m) {
    let h = m[1];
    if (h.length <= 4) h = h.split('').map((c) => c + c).join('');
    out = {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
    };
  } else {
    const rgb = /^rgba?\(([^)]+)\)$/i.exec(s);
    if (rgb) {
      const [r, g, b, a] = rgb[1].split(/[\s,/]+/).map(Number);
      out = { r: r || 0, g: g || 0, b: b || 0, a: Number.isFinite(a) ? a : 1 };
    } else if (s === 'transparent') out = { r: 0, g: 0, b: 0, a: 0 };
  }
  if (parseCache.size > 4000) parseCache.clear();
  parseCache.set(input, out);
  return out;
}

const to2 = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');

export function toHex(c: RGBA, withAlpha = c.a < 1): string {
  return `#${to2(c.r)}${to2(c.g)}${to2(c.b)}${withAlpha ? to2(c.a * 255) : ''}`;
}

/** CSS string accepted by every canvas implementation. */
export function css(color: string): string {
  const c = parseColor(color);
  if (c.a >= 1) return toHex(c, false);
  return `rgba(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)},${+c.a.toFixed(4)})`;
}

export function mix(a: string, b: string, t: number): string {
  const x = parseColor(a), y = parseColor(b);
  return toHex({
    r: x.r + (y.r - x.r) * t,
    g: x.g + (y.g - x.g) * t,
    b: x.b + (y.b - x.b) * t,
    a: x.a + (y.a - x.a) * t,
  });
}

/** Mixes the rgb part towards white, keeping alpha. */
export function lighten(c: string, t: number): string {
  const x = parseColor(c);
  return toHex({ r: x.r + (255 - x.r) * t, g: x.g + (255 - x.g) * t, b: x.b + (255 - x.b) * t, a: x.a });
}

/** Mixes the rgb part towards black, keeping alpha. */
export function darken(c: string, t: number): string {
  const x = parseColor(c);
  return toHex({ r: x.r * (1 - t), g: x.g * (1 - t), b: x.b * (1 - t), a: x.a });
}

export function withAlpha(c: string, a: number): string {
  const x = parseColor(c);
  return toHex({ ...x, a: Math.max(0, Math.min(1, a)) }, true);
}

/** Relative luminance 0..1 (sRGB approximation). */
export function luminance(c: string): number {
  const { r, g, b } = parseColor(c);
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** Readable text colour (light or dark) on top of `bg`. */
export function readableOn(bg: string, light = '#ffffff', dark = '#14161b'): string {
  return luminance(bg) > 0.42 ? dark : light;
}
