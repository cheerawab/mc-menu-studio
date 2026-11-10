// Test helper: a controllable window.matchMedia for jsdom (which has none). Understands the queries the editor uses:
// (min-width / max-width / max-height: Npx), (pointer: coarse), (orientation: landscape | portrait), joined by "and".

export interface MediaEnv {
  width: number;
  height: number;
  coarse: boolean;
}

function evaluate(query: string, env: MediaEnv): boolean {
  return query.split(/\s+and\s+/).every((part) => {
    let m = /\(min-width:\s*([\d.]+)px\)/.exec(part);
    if (m) return env.width >= Number(m[1]);
    m = /\(max-width:\s*([\d.]+)px\)/.exec(part);
    if (m) return env.width <= Number(m[1]);
    m = /\(max-height:\s*([\d.]+)px\)/.exec(part);
    if (m) return env.height <= Number(m[1]);
    if (/\(pointer:\s*coarse\)/.test(part)) return env.coarse;
    if (/\(orientation:\s*landscape\)/.test(part)) return env.width > env.height;
    if (/\(orientation:\s*portrait\)/.test(part)) return env.width <= env.height;
    return false;
  });
}

export function installMatchMedia(initial: MediaEnv) {
  const env = { ...initial };
  const live = new Map<string, Set<() => void>>();
  window.matchMedia = ((query: string) => {
    const listeners = live.get(query) ?? new Set<() => void>();
    live.set(query, listeners);
    return {
      media: query,
      get matches() {
        return evaluate(query, env);
      },
      onchange: null,
      addEventListener: (_type: string, l: () => void) => listeners.add(l),
      removeEventListener: (_type: string, l: () => void) => listeners.delete(l),
      addListener: (l: () => void) => listeners.add(l),
      removeListener: (l: () => void) => listeners.delete(l),
      dispatchEvent: () => true,
    } as unknown as MediaQueryList;
  }) as typeof window.matchMedia;
  return {
    /** Changes the simulated screen and notifies every listener (wrap in act()). */
    set(next: Partial<MediaEnv>) {
      Object.assign(env, next);
      for (const set of live.values()) for (const l of set) l();
    },
    restore() {
      delete (window as { matchMedia?: unknown }).matchMedia;
    },
  };
}
