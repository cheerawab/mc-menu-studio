// Snapshot-based undo/redo. Values are immutable, so snapshots share structure and are cheap.

export const HISTORY_LIMIT = 200;
export const COALESCE_MS = 1000;

export interface History<T> {
  past: T[];
  future: T[];
  /** Key of the last recorded change; consecutive changes with the same key (within COALESCE_MS) merge. */
  lastKey: string | null;
  lastTime: number;
}

export function emptyHistory<T>(): History<T> {
  return { past: [], future: [], lastKey: null, lastTime: 0 };
}

export interface RecordOptions {
  key?: string | null;
  now?: number;
  limit?: number;
}

/** Records `prev` (the value before a change) as an undo step. */
export function record<T>(h: History<T>, prev: T, opts: RecordOptions = {}): History<T> {
  const now = opts.now ?? Date.now();
  const key = opts.key ?? null;
  if (key !== null && key === h.lastKey && now - h.lastTime < COALESCE_MS && h.past.length) {
    return { ...h, future: [], lastTime: now };
  }
  const limit = opts.limit ?? HISTORY_LIMIT;
  const past = h.past.length >= limit ? [...h.past.slice(h.past.length - limit + 1), prev] : [...h.past, prev];
  return { past, future: [], lastKey: key, lastTime: now };
}

export function undo<T>(h: History<T>, current: T): { history: History<T>; value: T } | null {
  if (!h.past.length) return null;
  const value = h.past[h.past.length - 1];
  return {
    value,
    history: { past: h.past.slice(0, -1), future: [current, ...h.future], lastKey: null, lastTime: 0 },
  };
}

export function redo<T>(h: History<T>, current: T): { history: History<T>; value: T } | null {
  if (!h.future.length) return null;
  const [value, ...future] = h.future;
  return { value, history: { past: [...h.past, current], future, lastKey: null, lastTime: 0 } };
}
