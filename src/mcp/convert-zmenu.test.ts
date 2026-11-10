import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { convertAction, convertZMenu, firstColor, stripFormatting } from '../../scripts/convert-zmenu';
import { parseProjectJson } from '../../src/core/model/serialize';

// Real zMenu main.yml exported from 日出伺服器, kept as a fixture so the converter's behaviour is pinned.
const FIXTURE = readFileSync(join(__dirname, 'fixtures', 'zmenu-main.yml'), 'utf8');

describe('zMenu text helpers', () => {
  it('strips legacy & codes and MiniMessage tags', () => {
    expect(stripFormatting('&6&l傳送系統')).toBe('傳送系統');
    expect(stripFormatting('<gradient:red:blue>外部連結</gradient>')).toBe('外部連結');
  });
  it('reads the first legacy colour as hex', () => {
    expect(firstColor('&6黃色')).toBe('#ffaa00');
    expect(firstColor('無色')).toBeNull();
  });
});

describe('convertAction', () => {
  it('maps a player command to a command action, dropping the leading slash', () => {
    expect(convertAction([{ type: 'player command', commands: ['/spawn'] }]).action).toEqual({
      type: 'command',
      command: 'spawn',
    });
  });
  it('approximates a Velocity connect with a /server command', () => {
    expect(convertAction([{ type: 'connect', server: 'waiting' }]).action).toEqual({
      type: 'command',
      command: 'server waiting',
    });
  });
  it('turns a book action with a URL into a url action', () => {
    const a = convertAction([{ type: 'book', lines: { page1: ['<click:open_url:"https://sunrisemc.tw">官網</click>'] } }]);
    expect(a.action).toEqual({ type: 'url', url: 'https://sunrisemc.tw' });
  });
  it('falls back to a none action for unknown types', () => {
    expect(convertAction([{ type: 'nonsense' }]).action).toEqual({ type: 'none' });
    expect(convertAction(undefined).action).toEqual({ type: 'none' });
  });
});

describe('convertZMenu on the real 日出 main.yml', () => {
  it('produces a valid project with one button per zMenu item', () => {
    const res = convertZMenu(FIXTURE, { name: '日出伺服器', namespace: 'sunrise', skin: 'dark' });
    const { project } = parseProjectJson(res.json);
    expect(project.name).toBe('日出伺服器');
    expect(project.namespace).toBe('sunrise');
    expect(project.pages).toHaveLength(1);
    const buttons = project.pages[0].elements.filter((e) => e.type === 'button');
    expect(buttons).toHaveLength(res.buttonCount);
    expect(res.buttonCount).toBe(8);
  });
  it('keeps every button inside the page bounds (no clipping/overflow)', () => {
    const res = convertZMenu(FIXTURE, { skin: 'dark' });
    const { project } = parseProjectJson(res.json);
    const page = project.pages[0];
    for (const el of page.elements) {
      expect(el.x).toBeGreaterThanOrEqual(0);
      expect(el.y).toBeGreaterThanOrEqual(0);
      expect(el.x + el.w).toBeLessThanOrEqual(page.width + 1);
      expect(el.y + el.h).toBeLessThanOrEqual(page.height + 1);
    }
  });
  it('reports degraded actions (connect, book) in notes', () => {
    const res = convertZMenu(FIXTURE, {});
    expect(res.notes.some((n) => n.includes('connect'))).toBe(true);
    expect(res.notes.some((n) => n.includes('book') || n.includes('連結'))).toBe(true);
  });
  it('compacts unused columns so used cells are wider than the raw 9-col grid', () => {
    const compact = convertZMenu(FIXTURE, { compact: true });
    const raw = convertZMenu(FIXTURE, { compact: false });
    const cw = (r: typeof compact) => {
      const { project } = parseProjectJson(r.json);
      return (project.pages[0].elements.find((e) => e.type === 'button')?.w) ?? 0;
    };
    expect(cw(compact)).toBeGreaterThan(cw(raw));
  });
});
