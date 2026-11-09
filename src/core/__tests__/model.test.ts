import { describe, expect, it } from 'vitest';
import { createElement, createPage, createProject, effectiveFooterLabel, normalizeElement } from '../model/defaults';
import { slugify, uniqueKey, uniqueName } from '../model/ids';
import {
  addElements, addPage, collectLinks, duplicateElements, duplicatePage, moveElementsZ, movePage, removePage,
  removeUnusedAssets, reorderElement, updateElements,
} from '../model/ops';
import { normalizeProject, parseProjectJson, serializeProject } from '../model/serialize';
import type { Project } from '../model/types';

function projectWith(n: number): Project {
  const page = createPage({ key: 'main' });
  page.elements = Array.from({ length: n }, (_, i) => createElement('button', { name: `b${i}`, x: i * 10 }));
  return createProject({ pages: [page] });
}

describe('ids', () => {
  it('slugifies to minecraft-safe keys', () => {
    expect(slugify('My Page 2!')).toBe('my_page_2');
    expect(slugify('大廳')).toBe('page');
  });
  it('makes unique keys and names', () => {
    expect(uniqueKey('main', ['main', 'main_2'])).toBe('main_3');
    expect(uniqueKey('x', [])).toBe('x');
    expect(uniqueName('按鈕', ['按鈕 1', '按鈕 2'])).toBe('按鈕 3');
  });
});

describe('element defaults and normalisation', () => {
  it('creates every element type with integer geometry', () => {
    for (const t of ['panel', 'button', 'label', 'image', 'bar', 'shape', 'divider', 'slotgrid', 'icon'] as const) {
      const el = createElement(t, { x: 1.6, y: -2.2 });
      expect(el.type).toBe(t);
      expect(el.x).toBe(2);
      expect(el.y).toBe(-2);
      expect(Number.isInteger(el.w) && Number.isInteger(el.h)).toBe(true);
      expect(el.id).toMatch(/^[0-9a-z]{10}$/);
    }
  });
  it('derives slot grid and icon sizes', () => {
    expect(createElement('slotgrid', { cols: 3, rows: 2, slotSize: 18, gap: 2 })).toMatchObject({ w: 58, h: 38 });
    expect(createElement('icon', { scale: 3 })).toMatchObject({ w: 48, h: 48 });
  });
  it('clamps ranges', () => {
    const b = normalizeElement(createElement('bar', { value: 140, opacity: 3 }));
    expect(b.value).toBe(100);
    expect(b.opacity).toBe(1);
    expect(createElement('button', { w: 0, fontSize: 500 })).toMatchObject({ w: 1, fontSize: 72 });
  });
});

describe('ops', () => {
  it('updates, duplicates and reorders immutably', () => {
    const p = projectWith(3);
    const pageId = p.pages[0].id;
    const [a, b, c] = p.pages[0].elements;
    const p2 = updateElements(p, pageId, [a.id], { x: 99 });
    expect(p2.pages[0].elements[0].x).toBe(99);
    expect(p.pages[0].elements[0].x).toBe(0);
    expect(updateElements(p, pageId, [a.id], { x: a.x })).toBe(p);

    const { project: p3, ids } = duplicateElements(p, pageId, [a.id]);
    expect(p3.pages[0].elements).toHaveLength(4);
    expect(p3.pages[0].elements[1].id).toBe(ids[0]);
    expect(p3.pages[0].elements[1]).toMatchObject({ x: a.x + 8, y: a.y + 8 });

    const top = moveElementsZ(p, pageId, [a.id], 'top');
    expect(top.pages[0].elements.map((e) => e.id)).toEqual([b.id, c.id, a.id]);
    const down = moveElementsZ(p, pageId, [c.id], 'down');
    expect(down.pages[0].elements.map((e) => e.id)).toEqual([a.id, c.id, b.id]);
    expect(moveElementsZ(p, pageId, [a.id], 'bottom')).toBe(p);
    const r = reorderElement(p, pageId, a.id, 2);
    expect(r.pages[0].elements.map((e) => e.id)).toEqual([b.id, c.id, a.id]);
  });

  it('manages pages with unique keys and never removes the last page', () => {
    let p = createProject();
    const first = p.pages[0].id;
    ({ project: p } = addPage(p, { key: 'main' }));
    expect(p.pages.map((x) => x.key)).toEqual(['main', 'main_2']);
    const dup = duplicatePage(p, first);
    expect(dup.project.pages).toHaveLength(3);
    expect(dup.project.pages[1].key).toBe('main_copy');
    expect(removePage(createProject(), createProject().pages[0].id).pages).toHaveLength(1);
    const moved = movePage(dup.project, first, 2);
    expect(moved.pages[2].id).toBe(first);
  });

  it('collects page links and prunes unused assets', () => {
    const p = projectWith(1);
    const target = createPage({ key: 'two' });
    const linked = addElements(
      { ...p, pages: [...p.pages, target], assets: { a1: { id: 'a1', name: 'x', mime: 'image/png', dataUrl: 'data:image/png;base64,AA', w: 1, h: 1 } } },
      p.pages[0].id,
      [createElement('button', { action: { type: 'page', pageId: target.id } })],
    );
    expect(collectLinks(linked)).toHaveLength(1);
    expect(Object.keys(removeUnusedAssets(linked).assets)).toHaveLength(0);
  });
});

describe('serialisation', () => {
  it('round-trips a project', () => {
    const p = projectWith(2);
    const { project, warnings } = parseProjectJson(serializeProject(p));
    expect(warnings).toEqual([]);
    expect(project).toEqual(p);
  });
  it('repairs bad input instead of crashing', () => {
    const { project, warnings } = normalizeProject({
      name: 'x',
      skinId: 'nope',
      pages: [{ key: 'a', elements: [{ type: 'button', variant: 'weird', x: 'str', action: { type: 'page' } }, { type: 'alien' }] }],
    });
    expect(project.skinId).toBe('dark');
    const el = project.pages[0].elements[0];
    expect(el).toMatchObject({ type: 'button', variant: 'default', x: 0, action: { type: 'page', pageId: '' } });
    expect(warnings).toHaveLength(1);
  });
  it('rejects garbage and future versions', () => {
    expect(() => parseProjectJson('{not json')).toThrow();
    expect(() => normalizeProject({ foo: 1 })).toThrow();
    expect(() => normalizeProject({ version: 99, pages: [{}] })).toThrow(/較新的版本/);
  });
  it('adds the footer label fields to older files and keeps them on round trips', () => {
    const old = normalizeProject({ settings: { fontFamily: 'X' }, pages: [{ key: 'a' }] }).project;
    expect(old.settings).toMatchObject({ fontFamily: 'X', footerLabel: '關閉' });
    expect(old.pages[0].footerLabel).toBeNull();
    const p = projectWith(0);
    p.settings.footerLabel = '離開';
    p.pages[0].footerLabel = '返回大廳';
    expect(parseProjectJson(serializeProject(p)).project).toEqual(p);
    const odd = normalizeProject({ settings: { footerLabel: 5 }, pages: [{ key: 'a', footerLabel: '   ' }] }).project;
    expect([odd.settings.footerLabel, odd.pages[0].footerLabel]).toEqual(['關閉', null]);
  });
  it('resolves the footer label: page override, project default, then 關閉', () => {
    const p = projectWith(0);
    const page = p.pages[0];
    expect(effectiveFooterLabel(page, p)).toBe('關閉');
    p.settings.footerLabel = '  離開 ';
    expect(effectiveFooterLabel(page, p)).toBe('離開');
    expect(effectiveFooterLabel({ ...page, footerLabel: '返回\n大廳' }, p)).toBe('返回 大廳');
    p.settings.footerLabel = '';
    expect(effectiveFooterLabel(page, p)).toBe('關閉');
  });
  it('regenerates duplicate ids', () => {
    const raw = { pages: [{ id: 'same', elements: [{ type: 'panel', id: 'same' }] }] };
    const { project } = normalizeProject(raw);
    expect(project.pages[0].elements[0].id).not.toBe(project.pages[0].id);
  });
});
