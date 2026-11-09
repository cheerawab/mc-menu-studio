// Pure, immutable project operations. Every function returns a new Project (or the same one if nothing changed).
import { createPage, isInteractive, normalizeElement } from './defaults';
import { newId, uniqueKey, uniqueName } from './ids';
import type { Element, Id, Page, Project } from './types';

export function getPage(project: Project, pageId: Id): Page | undefined {
  return project.pages.find((p) => p.id === pageId);
}

export function updatePage(project: Project, pageId: Id, fn: (page: Page) => Page): Project {
  let changed = false;
  const pages = project.pages.map((p) => {
    if (p.id !== pageId) return p;
    const next = fn(p);
    if (next !== p) changed = true;
    return next;
  });
  return changed ? { ...project, pages } : project;
}

export function addElements(project: Project, pageId: Id, els: Element[], index?: number): Project {
  return updatePage(project, pageId, (page) => {
    const elements = [...page.elements];
    const at = index === undefined ? elements.length : Math.max(0, Math.min(elements.length, index));
    elements.splice(at, 0, ...els.map((e) => normalizeElement(e)));
    return { ...page, elements };
  });
}

export type ElementPatch = Partial<Element> | ((el: Element) => Partial<Element>);

export function updateElements(project: Project, pageId: Id, ids: Id[], patch: ElementPatch): Project {
  const set = new Set(ids);
  return updatePage(project, pageId, (page) => {
    let changed = false;
    const elements = page.elements.map((el) => {
      if (!set.has(el.id)) return el;
      const p = typeof patch === 'function' ? patch(el) : patch;
      const next = normalizeElement({ ...el, ...p, id: el.id, type: el.type } as Element);
      if (shallowEqual(next, el)) return el;
      changed = true;
      return next;
    });
    return changed ? { ...page, elements } : page;
  });
}

function shallowEqual(a: object, b: object): boolean {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  for (const k of ka) {
    if ((a as Record<string, unknown>)[k] !== (b as Record<string, unknown>)[k]) return false;
  }
  return true;
}

export function removeElements(project: Project, pageId: Id, ids: Id[]): Project {
  const set = new Set(ids);
  return updatePage(project, pageId, (page) => {
    const elements = page.elements.filter((e) => !set.has(e.id));
    return elements.length === page.elements.length ? page : { ...page, elements };
  });
}

/** Deep-ish copy with fresh ids, offset by (dx, dy). Names get a "副本" suffix when requested. */
export function cloneElements(els: Element[], dx = 0, dy = 0, rename = false): Element[] {
  return els.map((e) => {
    const copy = JSON.parse(JSON.stringify(e)) as Element;
    copy.id = newId();
    copy.x += dx;
    copy.y += dy;
    if (rename) copy.name = `${e.name} 副本`;
    return copy;
  });
}

/** Duplicates the given elements right above the top-most original. Returns the new ids. */
export function duplicateElements(
  project: Project,
  pageId: Id,
  ids: Id[],
  offset = 8,
): { project: Project; ids: Id[] } {
  const page = getPage(project, pageId);
  if (!page) return { project, ids: [] };
  const set = new Set(ids);
  const originals = page.elements.filter((e) => set.has(e.id));
  if (!originals.length) return { project, ids: [] };
  const copies = cloneElements(originals, offset, offset, true);
  const lastIndex = Math.max(...originals.map((o) => page.elements.indexOf(o)));
  return { project: addElements(project, pageId, copies, lastIndex + 1), ids: copies.map((c) => c.id) };
}

export type ZMove = 'up' | 'down' | 'top' | 'bottom';

export function moveElementsZ(project: Project, pageId: Id, ids: Id[], dir: ZMove): Project {
  const set = new Set(ids);
  return updatePage(project, pageId, (page) => {
    const els = [...page.elements];
    if (dir === 'top' || dir === 'bottom') {
      const picked = els.filter((e) => set.has(e.id));
      const rest = els.filter((e) => !set.has(e.id));
      const elements = dir === 'top' ? [...rest, ...picked] : [...picked, ...rest];
      return sameOrder(elements, page.elements) ? page : { ...page, elements };
    }
    if (dir === 'up') {
      for (let i = els.length - 2; i >= 0; i--) {
        if (set.has(els[i].id) && !set.has(els[i + 1].id)) [els[i], els[i + 1]] = [els[i + 1], els[i]];
      }
    } else {
      for (let i = 1; i < els.length; i++) {
        if (set.has(els[i].id) && !set.has(els[i - 1].id)) [els[i], els[i - 1]] = [els[i - 1], els[i]];
      }
    }
    return sameOrder(els, page.elements) ? page : { ...page, elements: els };
  });
}

/** Moves one element to a new index in the paint order (0 = bottom). */
export function reorderElement(project: Project, pageId: Id, id: Id, toIndex: number): Project {
  return updatePage(project, pageId, (page) => {
    const from = page.elements.findIndex((e) => e.id === id);
    if (from < 0) return page;
    const els = [...page.elements];
    const [el] = els.splice(from, 1);
    const to = Math.max(0, Math.min(els.length, toIndex));
    els.splice(to, 0, el);
    return sameOrder(els, page.elements) ? page : { ...page, elements: els };
  });
}

function sameOrder(a: Element[], b: Element[]) {
  return a.length === b.length && a.every((e, i) => e === b[i]);
}

export function addPage(project: Project, props: Partial<Page> = {}, index?: number): { project: Project; pageId: Id } {
  const keys = project.pages.map((p) => p.key);
  const titles = project.pages.map((p) => p.title);
  const page = createPage({
    key: uniqueKey(props.key ?? `page_${project.pages.length + 1}`, keys),
    title: props.title ?? uniqueName('新頁面', titles),
    ...props,
  });
  page.key = uniqueKey(page.key, keys);
  const pages = [...project.pages];
  pages.splice(index === undefined ? pages.length : index, 0, page);
  return { project: { ...project, pages }, pageId: page.id };
}

export function duplicatePage(project: Project, pageId: Id): { project: Project; pageId: Id } {
  const idx = project.pages.findIndex((p) => p.id === pageId);
  if (idx < 0) return { project, pageId };
  const src = project.pages[idx];
  const copy: Page = {
    ...src,
    id: newId(),
    key: uniqueKey(`${src.key}_copy`, project.pages.map((p) => p.key)),
    title: `${src.title} 副本`,
    elements: cloneElements(src.elements),
  };
  const pages = [...project.pages];
  pages.splice(idx + 1, 0, copy);
  return { project: { ...project, pages }, pageId: copy.id };
}

/** Removes a page (never the last one). Links that pointed to it stay and show up in 檢查. */
export function removePage(project: Project, pageId: Id): Project {
  if (project.pages.length <= 1) return project;
  const pages = project.pages.filter((p) => p.id !== pageId);
  return pages.length === project.pages.length ? project : { ...project, pages };
}

export function movePage(project: Project, pageId: Id, toIndex: number): Project {
  const from = project.pages.findIndex((p) => p.id === pageId);
  if (from < 0) return project;
  const pages = [...project.pages];
  const [p] = pages.splice(from, 1);
  pages.splice(Math.max(0, Math.min(pages.length, toIndex)), 0, p);
  return pages.every((x, i) => x === project.pages[i]) ? project : { ...project, pages };
}

export interface PageLink {
  fromPageId: Id;
  elementId: Id;
  elementName: string;
  toPageId: Id;
}

export function collectLinks(project: Project): PageLink[] {
  const out: PageLink[] = [];
  for (const page of project.pages) {
    for (const el of page.elements) {
      if (isInteractive(el) && el.action.type === 'page') {
        out.push({ fromPageId: page.id, elementId: el.id, elementName: el.name, toPageId: el.action.pageId });
      }
    }
  }
  return out;
}

export function usedAssetIds(project: Project): Set<Id> {
  const used = new Set<Id>();
  for (const p of project.pages) for (const e of p.elements) if (e.type === 'image' && e.assetId) used.add(e.assetId);
  return used;
}

export function removeUnusedAssets(project: Project): Project {
  const used = usedAssetIds(project);
  const ids = Object.keys(project.assets);
  if (ids.every((id) => used.has(id))) return project;
  const assets: Project['assets'] = {};
  for (const id of ids) if (used.has(id)) assets[id] = project.assets[id];
  return { ...project, assets };
}

/** Approximate byte size of all embedded assets (data URLs are ASCII). */
export function assetBytes(project: Project): number {
  let n = 0;
  for (const a of Object.values(project.assets)) n += a.dataUrl.length;
  return n;
}
