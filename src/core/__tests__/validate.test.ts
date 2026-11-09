import { describe, expect, it } from 'vitest';
import { createElement, createPage, createProject } from '../model/defaults';
import { cleanCommand, estimateGameTextWidth, validateAction, validateProject } from '../model/validate';

const base = () => {
  const a = createPage({ key: 'a', title: 'A' });
  const b = createPage({ key: 'b', title: 'B' });
  return createProject({ namespace: 'demo', pages: [a, b] });
};

describe('validateAction', () => {
  const p = base();
  it('accepts valid actions', () => {
    expect(validateAction({ type: 'none' }, p)).toBeNull();
    expect(validateAction({ type: 'close' }, p)).toBeNull();
    expect(validateAction({ type: 'command', command: 'time set day' }, p)).toBeNull();
    expect(validateAction({ type: 'url', url: 'https://example.com/x?y=1' }, p)).toBeNull();
    expect(validateAction({ type: 'page', pageId: p.pages[1].id }, p, p.pages[0].id)).toBeNull();
  });
  it('flags empty and invalid actions', () => {
    expect(validateAction({ type: 'command', command: '  / ' }, p)?.code).toBe('command-empty');
    expect(validateAction({ type: 'command', command: 'say hi' }, p)?.severity).toBe('warning');
    expect(validateAction({ type: 'command', command: 'a\nb' }, p)?.code).toBe('command-newline');
    expect(validateAction({ type: 'url', url: 'ftp://x' }, p)?.code).toBe('url-invalid');
    expect(validateAction({ type: 'url', url: '' }, p)?.code).toBe('url-empty');
    expect(validateAction({ type: 'page', pageId: '' }, p)?.code).toBe('page-empty');
    expect(validateAction({ type: 'page', pageId: 'gone' }, p)?.code).toBe('page-dangling');
    expect(validateAction({ type: 'page', pageId: p.pages[0].id }, p, p.pages[0].id)?.code).toBe('page-self');
    expect(validateAction({ type: 'copy', text: '' }, p)?.severity).toBe('warning');
  });
  it('cleans commands', () => {
    expect(cleanCommand('  /time set day ')).toBe('time set day');
  });
});

describe('validateProject', () => {
  it('passes a clean project', () => {
    const p = base();
    p.pages[0].elements.push(createElement('button', { action: { type: 'page', pageId: p.pages[1].id } }));
    expect(validateProject(p).filter((i) => i.severity !== 'info')).toEqual([]);
  });
  it('finds namespace, key, size and link problems', () => {
    const p = base();
    p.namespace = 'Bad-NS';
    p.pages[1].key = 'a';
    p.pages[0].width = 1200;
    p.pages[0].elements.push(
      createElement('button', { action: { type: 'page', pageId: 'deleted' } }),
      createElement('button', { action: { type: 'command', command: '' } }),
      createElement('label', { x: 5000 }),
      createElement('image', {}),
    );
    const codes = validateProject(p).map((i) => i.code);
    for (const c of ['namespace', 'page-key-dup', 'page-size', 'page-dangling', 'command-empty', 'el-outside', 'image-empty'])
      expect(codes).toContain(c);
    const sev = validateProject(p).map((i) => i.severity);
    expect(sev.indexOf('warning')).toBeGreaterThan(sev.lastIndexOf('error'));
  });
  it('reports unreachable pages and fit problems', () => {
    const p = base();
    const issues = validateProject(p, { fitCheck: () => '放不下' });
    expect(issues.some((i) => i.code === 'page-unreachable' && i.pageId === p.pages[1].id)).toBe(true);
    expect(issues.filter((i) => i.code === 'page-fit')).toHaveLength(2);
  });
  it('warns about empty or too long footer labels', () => {
    const p = base();
    expect(validateProject(p).some((i) => i.code.startsWith('footer'))).toBe(false);
    p.settings.footerLabel = ' ';
    expect(validateProject(p).find((i) => i.code === 'footer-empty')?.severity).toBe('warning');
    p.settings.footerLabel = '關閉';
    p.pages[1].footerLabel = '這是一段非常非常非常非常長的按鈕文字';
    const long = validateProject(p).filter((i) => i.code === 'footer-long');
    expect(long.map((i) => i.pageId)).toEqual([p.pages[1].id]);
    expect(estimateGameTextWidth('關閉')).toBe(18);
    expect(estimateGameTextWidth('OK')).toBe(12);
  });
});
