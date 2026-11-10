// @vitest-environment jsdom
// Layout tiers: pure width mapping and the matchMedia-based hooks (jsdom has no matchMedia: mocked).
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { installMatchMedia } from './mediaMock';
import { tierForWidth, useLayoutInfo, useLayoutTier } from './layoutTier';

function TierProbe() {
  const info = useLayoutInfo();
  const tier = useLayoutTier();
  return <div data-testid="probe">{`${tier}|${info.coarse}|${info.landscape}|${info.touchUi}`}</div>;
}

const probe = () => screen.getByTestId('probe').textContent;

afterEach(() => cleanup());

describe('layout tiers', () => {
  it('maps widths to tiers at 900 and 1280 px', () => {
    expect(tierForWidth(320)).toBe('compact');
    expect(tierForWidth(899)).toBe('compact');
    expect(tierForWidth(900)).toBe('medium');
    expect(tierForWidth(1279)).toBe('medium');
    expect(tierForWidth(1280)).toBe('desktop');
    expect(tierForWidth(2560)).toBe('desktop');
  });

  it('falls back to desktop without matchMedia (server render, jsdom)', () => {
    expect(typeof window.matchMedia).toBe('undefined');
    render(<TierProbe />);
    expect(probe()).toBe('desktop|false|true|false');
  });

  it('follows matchMedia changes (phone portrait, rotate, tablet, desktop)', () => {
    const media = installMatchMedia({ width: 390, height: 844, coarse: true });
    try {
      render(<TierProbe />);
      expect(probe()).toBe('compact|true|false|true');
      act(() => media.set({ width: 844, height: 390 }));
      expect(probe()).toBe('compact|true|true|true');
      act(() => media.set({ width: 1024, height: 768 }));
      expect(probe()).toBe('medium|true|true|true');
      act(() => media.set({ width: 1440, height: 900, coarse: false }));
      expect(probe()).toBe('desktop|false|true|false');
      act(() => media.set({ width: 1000, height: 800, coarse: false }));
      expect(probe()).toBe('medium|false|true|false');
    } finally {
      media.restore();
    }
  });
});
