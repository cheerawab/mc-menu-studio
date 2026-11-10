'use client';
// Layout tiers (single source of truth for the responsive editor):
//   compact  < 900 px wide   phones and portrait tablets: canvas + bottom tab bar + sheets
//   medium   900-1279 px     the desktop three columns with narrower side panels
//   desktop  >= 1280 px      unchanged desktop layout
// Editor computes the tier once (matchMedia) and provides it through LayoutContext; components read useLayout().

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from 'react';

export type LayoutTier = 'compact' | 'medium' | 'desktop';

export const MEDIUM_MIN_WIDTH = 900;
export const DESKTOP_MIN_WIDTH = 1280;

export const MEDIA = {
  medium: `(min-width: ${MEDIUM_MIN_WIDTH}px)`,
  desktop: `(min-width: ${DESKTOP_MIN_WIDTH}px)`,
  coarse: '(pointer: coarse)',
  landscape: '(orientation: landscape)',
} as const;

export function tierForWidth(width: number): LayoutTier {
  return width >= DESKTOP_MIN_WIDTH ? 'desktop' : width >= MEDIUM_MIN_WIDTH ? 'medium' : 'compact';
}

function mediaList(query: string): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  return window.matchMedia(query);
}

/** A media query as a React value; `fallback` on the server and where matchMedia does not exist (jsdom). */
export function useMediaQuery(query: string, fallback: boolean): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = mediaList(query);
      if (!list) return () => {};
      if (typeof list.addEventListener === 'function') {
        list.addEventListener('change', onChange);
        return () => list.removeEventListener('change', onChange);
      }
      list.addListener(onChange); // Safari < 14
      return () => list.removeListener(onChange);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => mediaList(query)?.matches ?? fallback, () => fallback);
}

/** Current tier; 'desktop' on the server and without matchMedia. */
export function useLayoutTier(): LayoutTier {
  const medium = useMediaQuery(MEDIA.medium, true);
  const desktop = useMediaQuery(MEDIA.desktop, true);
  return desktop ? 'desktop' : medium ? 'medium' : 'compact';
}

export interface LayoutInfo {
  tier: LayoutTier;
  /** The primary pointer is a finger: larger resize handles. */
  coarse: boolean;
  /** Wider than tall: compact sheets dock to the right and the tab bar shows icons only. */
  landscape: boolean;
  /** Touch helpers (selection bar, always-visible row buttons, reorder buttons): compact tier or a coarse pointer. */
  touchUi: boolean;
}

export const DESKTOP_LAYOUT: LayoutInfo = { tier: 'desktop', coarse: false, landscape: true, touchUi: false };

export const LayoutContext = createContext<LayoutInfo>(DESKTOP_LAYOUT);

export const useLayout = () => useContext(LayoutContext);

export function useLayoutInfo(): LayoutInfo {
  const tier = useLayoutTier();
  const coarse = useMediaQuery(MEDIA.coarse, false);
  const landscape = useMediaQuery(MEDIA.landscape, true);
  return useMemo(() => ({ tier, coarse, landscape, touchUi: tier === 'compact' || coarse }), [tier, coarse, landscape]);
}
