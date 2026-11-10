// Group B (page editing): thin wrappers over model/ops.ts. Existence checks live here (ops.ts is immutable and
// silently no-ops on an unknown pageId; the MCP layer must turn that into a clear zh-TW error instead).
import { addPage, duplicatePage, getPage, movePage, removePage } from '../../core/model/ops';
import type { Id, Page, Project } from '../../core/model/types';
import type { ProjectStore } from '../state';

export function pageNotFoundMessage(pageId: Id): string {
  return `找不到頁面「${pageId}」。`;
}

function requirePage(project: Project, pageId: Id): Page {
  const page = getPage(project, pageId);
  if (!page) throw new Error(pageNotFoundMessage(pageId));
  return page;
}

export interface PageProps {
  key?: string;
  title?: string;
  width?: number;
  height?: number;
  bgColor?: string | null;
  footerLabel?: string | null;
}

export function addPageHandler(store: ProjectStore, handle: string, props: PageProps, index?: number) {
  let pageId = '';
  const project = store.mutate(handle, (p) => {
    const r = addPage(p, props, index);
    pageId = r.pageId;
    return r.project;
  });
  return { pageId, project };
}

export function updatePageHandler(store: ProjectStore, handle: string, pageId: Id, patch: PageProps) {
  const project = store.mutate(handle, (p) => {
    requirePage(p, pageId);
    return { ...p, pages: p.pages.map((pg) => (pg.id === pageId ? { ...pg, ...patch } : pg)) };
  });
  return { project };
}

export function removePageHandler(store: ProjectStore, handle: string, pageId: Id) {
  const project = store.mutate(handle, (p) => {
    requirePage(p, pageId);
    if (p.pages.length <= 1) throw new Error('無法刪除唯一的頁面：專案至少需要一頁。');
    return removePage(p, pageId);
  });
  return { project };
}

export function duplicatePageHandler(store: ProjectStore, handle: string, pageId: Id) {
  let newPageId = '';
  const project = store.mutate(handle, (p) => {
    requirePage(p, pageId);
    const r = duplicatePage(p, pageId);
    newPageId = r.pageId;
    return r.project;
  });
  return { pageId: newPageId, project };
}

export function movePageHandler(store: ProjectStore, handle: string, pageId: Id, toIndex: number) {
  const project = store.mutate(handle, (p) => {
    requirePage(p, pageId);
    return movePage(p, pageId, toIndex);
  });
  return { project };
}
