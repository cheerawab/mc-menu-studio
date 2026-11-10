// Group C (element editing): thin wrappers over model/defaults.createElement, model/ops.ts and geometry.ts.
import { createElement } from '../../core/model/defaults';
import {
  addElements, duplicateElements, getPage, moveElementsZ, removeElements, updateElements, type ElementPatch, type ZMove,
} from '../../core/model/ops';
import { alignRects, distributeRects, type AlignMode } from '../../core/geometry';
import type { Element, ElementType, Id, Project } from '../../core/model/types';
import type { ProjectStore } from '../state';
import { pageNotFoundMessage } from './page';

function requirePageElements(project: Project, pageId: Id) {
  const page = getPage(project, pageId);
  if (!page) throw new Error(pageNotFoundMessage(pageId));
  return page.elements;
}

/** Looks up elements by id, in the same order as `ids`. Throws a clear zh-TW error on any miss. */
function findInOrder(project: Project, pageId: Id, ids: Id[]): Element[] {
  const elements = requirePageElements(project, pageId);
  const byId = new Map(elements.map((e) => [e.id, e]));
  return ids.map((id) => {
    const el = byId.get(id);
    if (!el) throw new Error(`頁面「${pageId}」裡找不到元件「${id}」。`);
    return el;
  });
}

export function addElementHandler(
  store: ProjectStore,
  handle: string,
  pageId: Id,
  type: ElementType,
  props: Record<string, unknown> = {},
  index?: number,
) {
  let elementId = '';
  const project = store.mutate(handle, (p) => {
    requirePageElements(p, pageId);
    const el = createElement(type, props as never);
    elementId = el.id;
    return addElements(p, pageId, [el], index);
  });
  return { elementId, project };
}

export function updateElementHandler(store: ProjectStore, handle: string, pageId: Id, ids: Id[], patch: ElementPatch) {
  const project = store.mutate(handle, (p) => {
    findInOrder(p, pageId, ids);
    return updateElements(p, pageId, ids, patch);
  });
  return { project };
}

export function removeElementHandler(store: ProjectStore, handle: string, pageId: Id, ids: Id[]) {
  const project = store.mutate(handle, (p) => {
    findInOrder(p, pageId, ids);
    return removeElements(p, pageId, ids);
  });
  return { project };
}

export function moveElementZHandler(store: ProjectStore, handle: string, pageId: Id, ids: Id[], dir: ZMove) {
  const project = store.mutate(handle, (p) => {
    findInOrder(p, pageId, ids);
    return moveElementsZ(p, pageId, ids, dir);
  });
  return { project };
}

export function duplicateElementHandler(store: ProjectStore, handle: string, pageId: Id, ids: Id[], offset?: number) {
  let newIds: Id[] = [];
  const project = store.mutate(handle, (p) => {
    findInOrder(p, pageId, ids);
    const r = duplicateElements(p, pageId, ids, offset);
    newIds = r.ids;
    return r.project;
  });
  return { ids: newIds, project };
}

export function alignElementsHandler(store: ProjectStore, handle: string, pageId: Id, ids: Id[], mode: AlignMode) {
  const project = store.mutate(handle, (p) => {
    const els = findInOrder(p, pageId, ids);
    const positions = alignRects(els, mode);
    const byId = new Map(ids.map((id, i) => [id, positions[i]]));
    return updateElements(p, pageId, ids, (el) => byId.get(el.id) ?? {});
  });
  return { project };
}

export function distributeElementsHandler(store: ProjectStore, handle: string, pageId: Id, ids: Id[], axis: 'h' | 'v') {
  const project = store.mutate(handle, (p) => {
    const els = findInOrder(p, pageId, ids);
    const positions = distributeRects(els, axis);
    const byId = new Map(ids.map((id, i) => [id, positions[i]]));
    return updateElements(p, pageId, ids, (el) => byId.get(el.id) ?? {});
  });
  return { project };
}
