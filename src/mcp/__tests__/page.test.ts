import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createProject } from '../../core/model/defaults';
import { addPageHandler, duplicatePageHandler, movePageHandler, removePageHandler, updatePageHandler } from '../handlers/page';
import { ProjectStore } from '../state';

function freshHandle(): { store: ProjectStore; handle: string } {
  const store = new ProjectStore();
  const path = join(mkdtempSync(join(tmpdir(), 'mcms-page-')), 'p.mcms.json');
  const { handle } = store.create(createProject(), path);
  return { store, handle };
}

describe('mcms.page.add', () => {
  it('adds a page with a unique key and title', () => {
    const { store, handle } = freshHandle();
    const { pageId, project } = addPageHandler(store, handle, { title: '第二頁' });
    expect(project.pages).toHaveLength(2);
    expect(project.pages[1].id).toBe(pageId);
    expect(project.pages[1].title).toBe('第二頁');
  });
});

describe('mcms.page.update', () => {
  it('merges the patch into the page and leaves elements untouched', () => {
    const { store, handle } = freshHandle();
    const pageId = store.get(handle).pages[0].id;
    const before = store.get(handle).pages[0].elements;
    const { project } = updatePageHandler(store, handle, pageId, { title: '改標題', width: 400 });
    expect(project.pages[0]).toMatchObject({ title: '改標題', width: 400 });
    expect(project.pages[0].elements).toBe(before);
  });

  it('throws a zh-TW error for an unknown pageId and does not touch the file', () => {
    const { store, handle } = freshHandle();
    const before = store.get(handle);
    expect(() => updatePageHandler(store, handle, 'missing', { title: 'x' })).toThrow(/找不到頁面/);
    expect(store.get(handle)).toBe(before);
  });
});

describe('mcms.page.remove', () => {
  it('removes a page but refuses to remove the last one', () => {
    const { store, handle } = freshHandle();
    const { pageId: second } = addPageHandler(store, handle, {});
    const { project } = removePageHandler(store, handle, second);
    expect(project.pages).toHaveLength(1);
    expect(() => removePageHandler(store, handle, project.pages[0].id)).toThrow(/無法刪除唯一的頁面/);
  });
});

describe('mcms.page.duplicate / move', () => {
  it('duplicates a page right after the original and can reorder pages', () => {
    const { store, handle } = freshHandle();
    const firstId = store.get(handle).pages[0].id;
    const { pageId: dupId, project } = duplicatePageHandler(store, handle, firstId);
    expect(project.pages.map((p) => p.id)).toEqual([firstId, dupId]);
    const moved = movePageHandler(store, handle, dupId, 0).project;
    expect(moved.pages.map((p) => p.id)).toEqual([dupId, firstId]);
  });
});
