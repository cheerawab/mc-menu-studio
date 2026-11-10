import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createProject } from '../../core/model/defaults';
import {
  addElementHandler, alignElementsHandler, distributeElementsHandler, duplicateElementHandler, moveElementZHandler,
  removeElementHandler, updateElementHandler,
} from '../handlers/element';
import { ProjectStore } from '../state';

function freshHandle(): { store: ProjectStore; handle: string; pageId: string } {
  const store = new ProjectStore();
  const path = join(mkdtempSync(join(tmpdir(), 'mcms-element-')), 'p.mcms.json');
  const { handle } = store.create(createProject(), path);
  return { store, handle, pageId: store.get(handle).pages[0].id };
}

describe('mcms.element.add', () => {
  it('creates an element of the given type with the given props', () => {
    const { store, handle, pageId } = freshHandle();
    const { elementId, project } = addElementHandler(store, handle, pageId, 'button', { text: '確認', x: 10, y: 20 });
    const el = project.pages[0].elements.find((e) => e.id === elementId);
    expect(el).toMatchObject({ type: 'button', text: '確認', x: 10, y: 20 });
  });

  it('throws a zh-TW error for an unknown pageId', () => {
    const { store, handle } = freshHandle();
    expect(() => addElementHandler(store, handle, 'missing', 'button')).toThrow(/找不到頁面/);
  });
});

describe('mcms.element.update / remove', () => {
  it('updates and then removes an element', () => {
    const { store, handle, pageId } = freshHandle();
    const { elementId } = addElementHandler(store, handle, pageId, 'label', { text: 'hi' });
    const updated = updateElementHandler(store, handle, pageId, [elementId], { text: 'bye' });
    expect(updated.project.pages[0].elements.find((e) => e.id === elementId)).toMatchObject({ text: 'bye' });
    const removed = removeElementHandler(store, handle, pageId, [elementId]);
    expect(removed.project.pages[0].elements.find((e) => e.id === elementId)).toBeUndefined();
  });

  it('throws a zh-TW error when an id does not exist on the page', () => {
    const { store, handle, pageId } = freshHandle();
    expect(() => updateElementHandler(store, handle, pageId, ['missing'], { text: 'x' })).toThrow(/找不到元件/);
  });
});

describe('mcms.element.move_z / duplicate', () => {
  it('reorders z-order and duplicates with an offset', () => {
    const { store, handle, pageId } = freshHandle();
    const a = addElementHandler(store, handle, pageId, 'panel', { x: 0, y: 0 }).elementId;
    const b = addElementHandler(store, handle, pageId, 'panel', { x: 0, y: 0 }).elementId;
    const moved = moveElementZHandler(store, handle, pageId, [a], 'top');
    expect(moved.project.pages[0].elements.map((e) => e.id)).toEqual([b, a]);

    const { ids, project } = duplicateElementHandler(store, handle, pageId, [a], 5);
    const dup = project.pages[0].elements.find((e) => e.id === ids[0])!;
    const original = project.pages[0].elements.find((e) => e.id === a)!;
    expect(dup.x).toBe(original.x + 5);
    expect(dup.y).toBe(original.y + 5);
  });
});

describe('mcms.element.align / distribute', () => {
  it('aligns elements left and distributes them horizontally', () => {
    const { store, handle, pageId } = freshHandle();
    const a = addElementHandler(store, handle, pageId, 'panel', { x: 10, y: 0, w: 20, h: 20 }).elementId;
    const b = addElementHandler(store, handle, pageId, 'panel', { x: 40, y: 0, w: 20, h: 20 }).elementId;
    const aligned = alignElementsHandler(store, handle, pageId, [a, b], 'left');
    const byId = new Map(aligned.project.pages[0].elements.map((e) => [e.id, e]));
    expect(byId.get(a)!.x).toBe(10);
    expect(byId.get(b)!.x).toBe(10);

    const c = addElementHandler(store, handle, pageId, 'panel', { x: 0, y: 0, w: 10, h: 10 }).elementId;
    const d = addElementHandler(store, handle, pageId, 'panel', { x: 50, y: 0, w: 10, h: 10 }).elementId;
    const e = addElementHandler(store, handle, pageId, 'panel', { x: 20, y: 0, w: 10, h: 10 }).elementId;
    const distributed = distributeElementsHandler(store, handle, pageId, [c, d, e], 'h');
    const pos = new Map(distributed.project.pages[0].elements.map((el) => [el.id, el.x]));
    expect(pos.get(c)).toBe(0);
    expect(pos.get(d)).toBe(50);
    expect(pos.get(e)).toBe(25); // equal gaps between the outer two (span 60, 3x10 wide, gap 15 each side)
  });
});
