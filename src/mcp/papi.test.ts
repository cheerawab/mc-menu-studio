import { describe, expect, it } from 'vitest';
import { createElement, createPage, createProject } from '../core/model/defaults';
import {
  detectPlaceholders,
  fillPlaceholders,
  hasPlaceholders,
  placeholderExportWarning,
  sampleFor,
  samplePlaceholders,
} from './papi';

function projectWith(opts: { title?: string; buttonText?: string; tooltip?: string }) {
  const el = createElement('button', {
    text: opts.buttonText ?? '按鈕',
    tooltip: opts.tooltip ?? '',
  });
  const page = createPage({ key: 'main', title: opts.title ?? '選單', elements: [el] });
  return createProject({ name: '測試', pages: [page] });
}

describe('sampleFor', () => {
  it('returns exact sample values for known tokens', () => {
    expect(sampleFor('player_name')).toBe('Steve');
    expect(sampleFor('playerpoints_points')).toBe('1,234');
  });
  it('falls back to the first-group prefix', () => {
    expect(sampleFor('player_level_custom')).toBe('Steve'); // player -> Steve
  });
  it('falls back to a generic label for unknown tokens', () => {
    expect(sampleFor('totally_unknown_thing')).toBe('範例');
  });
});

describe('fillPlaceholders', () => {
  it('replaces tokens and leaves other text intact', () => {
    expect(fillPlaceholders('你好 %player_name%！')).toBe('你好 Steve！');
  });
  it('handles hyphenated zMenu globals', () => {
    expect(fillPlaceholders('%page%/%max-page%')).toBe('1/3');
  });
  it('does not eat a bare percent', () => {
    expect(fillPlaceholders('100% 完成')).toBe('100% 完成');
  });
});

describe('detectPlaceholders / hasPlaceholders', () => {
  it('finds placeholders across title, text and tooltip', () => {
    const p = projectWith({ title: '%page%', buttonText: '餘額 %vault_eco_balance%', tooltip: '點數 %playerpoints_points%' });
    expect(hasPlaceholders(p)).toBe(true);
    const tokens = new Set(detectPlaceholders(p).map((h) => h.token));
    expect(tokens).toEqual(new Set(['page', 'vault_eco_balance', 'playerpoints_points']));
  });
  it('reports false when there are none', () => {
    const p = projectWith({ title: '純文字', buttonText: '沒有佔位符' });
    expect(hasPlaceholders(p)).toBe(false);
    expect(detectPlaceholders(p)).toHaveLength(0);
    expect(placeholderExportWarning(p)).toBeNull();
  });
});

describe('samplePlaceholders', () => {
  it('returns a clone with sample values, never mutating the original', () => {
    const p = projectWith({ buttonText: '餘額 %vault_eco_balance%' });
    const original = (p.pages[0].elements[0] as { text: string }).text;
    const sampled = samplePlaceholders(p);
    expect((sampled.pages[0].elements[0] as { text: string }).text).toBe('餘額 12,345');
    // original untouched so export keeps the real token
    expect((p.pages[0].elements[0] as { text: string }).text).toBe(original);
  });
});

describe('placeholderExportWarning', () => {
  it('lists the distinct tokens in a zh-TW warning', () => {
    const p = projectWith({ buttonText: '%player_name% %playerpoints_points%' });
    const w = placeholderExportWarning(p)!;
    expect(w).toContain('%player_name%');
    expect(w).toContain('%playerpoints_points%');
    expect(w).toContain('PAPI');
  });
});
