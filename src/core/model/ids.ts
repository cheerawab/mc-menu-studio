const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (c?.getRandomValues) return c.getRandomValues(out);
  for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256);
  return out;
}

/** Short random id, e.g. "k3x9q0ab". */
export function newId(len = 10): string {
  const bytes = randomBytes(len);
  let s = '';
  for (let i = 0; i < len; i++) s += ALPHABET[bytes[i] % ALPHABET.length];
  return s;
}

export const KEY_RE = /^[a-z0-9_]+$/;

/** Turns any string into a Minecraft-safe key ([a-z0-9_]). */
export function slugify(input: string, fallback = 'page'): string {
  const s = input
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return s || fallback;
}

/** Returns `base`, or `base_2`, `base_3`... so that it is not in `taken`. */
export function uniqueKey(base: string, taken: Iterable<string>): string {
  const set = new Set(taken);
  if (!set.has(base)) return base;
  const stem = base.replace(/_\d+$/, '') || base;
  for (let i = 2; ; i++) {
    const k = `${stem}_${i}`;
    if (!set.has(k)) return k;
  }
}

/** "按鈕 3" style names: the smallest unused number for this prefix. */
export function uniqueName(prefix: string, taken: Iterable<string>): string {
  const set = new Set(taken);
  for (let i = 1; ; i++) {
    const n = `${prefix} ${i}`;
    if (!set.has(n)) return n;
  }
}
