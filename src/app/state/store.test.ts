import { describe, expect, it } from 'vitest';
import { createElement, createPage, createProject } from '@/core/model/defaults';
import { updateElements } from '@/core/model/ops';
import { TEMPLATES } from '@/core/templates';
import { loadInitial, PROJECT_KEY, startAutosave } from './persistence';
import { createEditorStore, currentPage } from './store';

function fresh() {
  return createEditorStore(createProject({ pages: [createPage({ key: 'main' })] }));
}

describe('editor store', () => {
  it('supports more than 100 undo/redo steps', () => {
    const store = fresh();
    const s = () => store.getState();
    const el = createElement('button', { x: 0 });
    s().addElement(el);
    for (let i = 1; i <= 120; i++) s().updateElement(el.id, { x: i });
    expect(currentPage(s()).elements[0].x).toBe(120);
    for (let i = 0; i < 110; i++) s().undo();
    expect(currentPage(s()).elements[0].x).toBe(10);
    for (let i = 0; i < 5; i++) s().redo();
    expect(currentPage(s()).elements[0].x).toBe(15);
    s().updateElement(el.id, { y: 3 });
    expect(s().history.future).toHaveLength(0);
  });

  it('coalesces typing with a key and records drags as one step', () => {
    const store = fresh();
    const s = () => store.getState();
    const el = createElement('label');
    s().addElement(el);
    const before = s().history.past.length;
    for (const t of ['a', 'ab', 'abc']) s().updateElement(el.id, { text: t } as never, 'text');
    expect(s().history.past.length).toBe(before + 1);

    s().beginGesture();
    for (let i = 1; i <= 30; i++) s().updateGesture((base) => updateElements(base, s().pageId, [el.id], { x: i }));
    s().endGesture();
    expect(s().history.past.length).toBe(before + 2);
    s().undo();
    expect(currentPage(s()).elements[0].x).toBe(0);
  });

  it('copies, pastes with an offset, duplicates and deletes', () => {
    const store = fresh();
    const s = () => store.getState();
    const el = createElement('panel', { x: 10, y: 10 });
    s().addElement(el);
    s().copy();
    s().paste();
    s().paste();
    const els = currentPage(s()).elements;
    expect(els.map((e) => e.x)).toEqual([10, 18, 26]);
    expect(s().selection).toEqual([els[2].id]);
    s().duplicateSelected();
    expect(currentPage(s()).elements).toHaveLength(4);
    s().selectAll();
    s().deleteSelected();
    expect(currentPage(s()).elements).toHaveLength(0);
    s().undo();
    expect(currentPage(s()).elements).toHaveLength(4);
  });

  it('nudges, aligns and keeps locked elements in place', () => {
    const store = fresh();
    const s = () => store.getState();
    const a = createElement('button', { x: 5, y: 5 });
    const b = createElement('button', { x: 40, y: 30, locked: true });
    s().addElement(a);
    s().addElement(b);
    s().select([a.id, b.id]);
    s().nudge(8, 0);
    expect(currentPage(s()).elements.map((e) => e.x)).toEqual([13, 40]);
    s().select([a.id]);
    s().align('right');
    expect(currentPage(s()).elements[0].x).toBe(320 - a.w);
  });

  it('manages pages and keeps a valid current page after undo', () => {
    const store = fresh();
    const s = () => store.getState();
    s().addPage();
    expect(s().project.pages).toHaveLength(2);
    const second = s().pageId;
    expect(second).toBe(s().project.pages[1].id);
    s().deletePage(second);
    expect(s().project.pages).toHaveLength(1);
    expect(s().pageId).toBe(s().project.pages[0].id);
    s().undo();
    expect(s().project.pages).toHaveLength(2);
    s().deletePage(s().project.pages[0].id);
    s().deletePage(s().project.pages[0].id);
    expect(s().project.pages).toHaveLength(1);
  });
});

describe('persistence', () => {
  function memoryStorage(): Storage {
    const m = new Map<string, string>();
    return {
      get length() { return m.size; },
      clear: () => m.clear(),
      getItem: (k) => m.get(k) ?? null,
      key: (i) => [...m.keys()][i] ?? null,
      removeItem: (k) => void m.delete(k),
      setItem: (k, v) => void m.set(k, String(v)),
    };
  }

  it('loads the sample on first visit and the saved project afterwards', async () => {
    const storage = memoryStorage();
    const first = loadInitial(storage);
    expect(first.project.name).toBe(TEMPLATES[0].build().name);
    const store = createEditorStore(first.project);
    const stop = startAutosave(store, storage, 1);
    store.getState().commit((p) => ({ ...p, name: '我的選單' }));
    await new Promise((r) => setTimeout(r, 20));
    stop();
    expect(storage.getItem(PROJECT_KEY)).toContain('我的選單');
    expect(loadInitial(storage).project.name).toBe('我的選單');
  });

  it('falls back to the sample when saved data is corrupt and reports quota errors', async () => {
    const storage = memoryStorage();
    storage.setItem(PROJECT_KEY, '{broken');
    const r = loadInitial(storage);
    expect(r.messages[0].kind).toBe('error');
    const full = { ...memoryStorage(), setItem: () => { throw new Error('QuotaExceededError'); } } as Storage;
    const store = createEditorStore(r.project);
    const stop = startAutosave(store, full, 1);
    store.getState().commit((p) => ({ ...p, name: 'x' }));
    await new Promise((res) => setTimeout(res, 20));
    stop();
    expect(store.getState().toasts.some((t) => t.kind === 'error')).toBe(true);
  });
});
