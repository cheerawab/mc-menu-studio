// Editor store (zustand vanilla, so it is testable in Node). React binding: useEditor().
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { alignRects, bbox, distributeRects, type AlignMode, type SnapStep } from '@/core/geometry';
import type { GuiScale } from '@/core/game/chrome';
import { emptyHistory, record, redo as redoH, undo as undoH, type History } from '@/core/history';
import {
  addElements, addPage as addPageOp, cloneElements, duplicateElements, duplicatePage as duplicatePageOp, getPage,
  moveElementsZ, movePage as movePageOp, removeElements, removePage, reorderElement, updateElements, updatePage,
  type ElementPatch, type ZMove,
} from '@/core/model/ops';
import type { Element, Id, Page, Project } from '@/core/model/types';

export type Mode = 'edit' | 'game';
export type RightTab = 'inspect' | 'links' | 'issues';

export interface ViewState {
  zoom: number;
  panX: number;
  panY: number;
  showGrid: boolean;
  snap: SnapStep;
  showRegions: boolean;
  mode: Mode;
  guiScale: GuiScale;
  windowId: string;
}

export interface Toast {
  id: number;
  kind: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
}

export interface EditorState {
  project: Project;
  history: History<Project>;
  pageId: Id;
  selection: Id[];
  clipboard: Element[] | null;
  view: ViewState;
  toasts: Toast[];
  confirm: ConfirmRequest | null;
  dialog: 'templates' | 'export' | null;
  rightTab: RightTab;
  /** Incremented to ask the inspector to focus the text field of the selected element. */
  focusTextNonce: number;
  /** Project snapshot taken at the start of a drag gesture. */
  gestureBase: Project | null;
}

export interface EditorActions {
  commit(fn: (p: Project) => Project, opts?: { key?: string; select?: Id[] }): void;
  beginGesture(): void;
  updateGesture(fn: (base: Project) => Project): void;
  endGesture(): void;
  /** Drops a drag in progress: back to the snapshot from beginGesture, no history entry. */
  cancelGesture(): void;
  undo(): void;
  redo(): void;
  loadProject(p: Project): void;
  setPage(id: Id): void;
  select(ids: Id[]): void;
  toggleSelect(id: Id): void;
  selectAll(): void;
  addElement(el: Element): void;
  updateElement(id: Id, patch: ElementPatch, key?: string): void;
  updateSelected(patch: ElementPatch, key?: string): void;
  deleteSelected(): void;
  duplicateSelected(): void;
  copy(): void;
  cut(): void;
  paste(): void;
  nudge(dx: number, dy: number): void;
  align(mode: AlignMode): void;
  distribute(axis: 'h' | 'v'): void;
  zOrder(dir: ZMove): void;
  reorderLayer(id: Id, toIndex: number): void;
  addPage(): void;
  duplicatePage(id: Id): void;
  deletePage(id: Id): void;
  movePage(id: Id, toIndex: number): void;
  updatePage(id: Id, patch: Partial<Page>, key?: string): void;
  setView(patch: Partial<ViewState>): void;
  toast(kind: Toast['kind'], message: string): void;
  dismissToast(id: number): void;
  askConfirm(req: ConfirmRequest): void;
  closeConfirm(): void;
  openDialog(d: EditorState['dialog']): void;
  setRightTab(t: RightTab): void;
  requestTextFocus(): void;
}

export type EditorStore = StoreApi<EditorState & EditorActions>;

export const DEFAULT_VIEW: ViewState = {
  zoom: 2,
  panX: 0,
  panY: 0,
  showGrid: true,
  snap: 1,
  showRegions: false,
  mode: 'edit',
  guiScale: 3,
  windowId: '1920x1080',
};

let toastSeq = 1;

export function createEditorStore(project: Project, view: Partial<ViewState> = {}): EditorStore {
  return createStore<EditorState & EditorActions>()((set, get) => {
    /** Keeps only ids that exist on the current page. */
    const validSelection = (p: Project, pageId: Id, ids: Id[]) => {
      const page = getPage(p, pageId);
      if (!page) return [];
      const have = new Set(page.elements.map((e) => e.id));
      return ids.filter((id) => have.has(id));
    };
    const ensurePage = (p: Project, pageId: Id) => (getPage(p, pageId) ? pageId : p.pages[0].id);
    const selected = () => {
      const s = get();
      const page = getPage(s.project, s.pageId);
      const ids = new Set(s.selection);
      return page ? page.elements.filter((e) => ids.has(e.id)) : [];
    };
    const restore = (value: Project, history: History<Project>) => {
      const s = get();
      const pageId = ensurePage(value, s.pageId);
      set({ project: value, history, pageId, selection: validSelection(value, pageId, s.selection) });
    };

    return {
      project,
      history: emptyHistory<Project>(),
      pageId: project.pages[0].id,
      selection: [],
      clipboard: null,
      view: { ...DEFAULT_VIEW, ...view, mode: 'edit' },
      toasts: [],
      confirm: null,
      dialog: null,
      rightTab: 'inspect',
      focusTextNonce: 0,
      gestureBase: null,

      commit(fn, opts = {}) {
        const s = get();
        if (s.gestureBase) return;
        const next = fn(s.project);
        if (next === s.project) return;
        const pageId = ensurePage(next, s.pageId);
        set({
          project: next,
          history: record(s.history, s.project, { key: opts.key ?? null }),
          pageId,
          selection: validSelection(next, pageId, opts.select ?? s.selection),
        });
      },
      beginGesture() {
        set({ gestureBase: get().project });
      },
      updateGesture(fn) {
        const s = get();
        if (!s.gestureBase) return;
        set({ project: fn(s.gestureBase) });
      },
      endGesture() {
        const s = get();
        if (!s.gestureBase) return;
        if (s.gestureBase !== s.project) set({ history: record(s.history, s.gestureBase), gestureBase: null });
        else set({ gestureBase: null });
      },
      cancelGesture() {
        const s = get();
        if (!s.gestureBase) return;
        const pageId = ensurePage(s.gestureBase, s.pageId);
        set({ project: s.gestureBase, gestureBase: null, pageId, selection: validSelection(s.gestureBase, pageId, s.selection) });
      },
      undo() {
        const s = get();
        if (s.gestureBase) return;
        const u = undoH(s.history, s.project);
        if (u) restore(u.value, u.history);
      },
      redo() {
        const s = get();
        if (s.gestureBase) return;
        const r = redoH(s.history, s.project);
        if (r) restore(r.value, r.history);
      },
      loadProject(p) {
        set({ project: p, history: emptyHistory(), pageId: p.pages[0].id, selection: [], gestureBase: null });
      },
      setPage(id) {
        if (getPage(get().project, id)) set({ pageId: id, selection: [] });
      },
      select(ids) {
        const s = get();
        set({ selection: validSelection(s.project, s.pageId, ids) });
      },
      toggleSelect(id) {
        const s = get();
        set({ selection: s.selection.includes(id) ? s.selection.filter((x) => x !== id) : [...s.selection, id] });
      },
      selectAll() {
        const page = getPage(get().project, get().pageId);
        if (page) set({ selection: page.elements.filter((e) => !e.locked && !e.hidden).map((e) => e.id) });
      },
      addElement(el) {
        get().commit((p) => addElements(p, get().pageId, [el]), { select: [el.id] });
      },
      updateElement(id, patch, key) {
        get().commit((p) => updateElements(p, get().pageId, [id], patch), { key });
      },
      updateSelected(patch, key) {
        const ids = get().selection;
        if (ids.length) get().commit((p) => updateElements(p, get().pageId, ids, patch), { key });
      },
      deleteSelected() {
        const ids = selected().filter((e) => !e.locked).map((e) => e.id);
        if (ids.length) get().commit((p) => removeElements(p, get().pageId, ids), { select: [] });
      },
      duplicateSelected() {
        const ids = get().selection;
        if (!ids.length) return;
        const r = duplicateElements(get().project, get().pageId, ids);
        get().commit(() => r.project, { select: r.ids });
      },
      copy() {
        const els = selected();
        if (els.length) set({ clipboard: cloneElements(els) });
      },
      cut() {
        get().copy();
        get().deleteSelected();
      },
      paste() {
        const clip = get().clipboard;
        if (!clip?.length) return;
        const copies = cloneElements(clip, 8, 8);
        get().commit((p) => addElements(p, get().pageId, copies), { select: copies.map((c) => c.id) });
        set({ clipboard: cloneElements(copies) });
      },
      nudge(dx, dy) {
        const ids = selected().filter((e) => !e.locked).map((e) => e.id);
        if (ids.length) get().commit((p) => updateElements(p, get().pageId, ids, (e) => ({ x: e.x + dx, y: e.y + dy })), { key: 'nudge' });
      },
      align(mode) {
        const els = selected().filter((e) => !e.locked);
        if (!els.length) return;
        const page = getPage(get().project, get().pageId)!;
        const target = els.length === 1 ? { x: 0, y: 0, w: page.width, h: page.height } : bbox(els)!;
        const pos = alignRects(els, mode, target);
        const byId = new Map(els.map((e, i) => [e.id, pos[i]]));
        get().commit((p) => updateElements(p, get().pageId, [...byId.keys()], (e) => byId.get(e.id)!));
      },
      distribute(axis) {
        const els = selected().filter((e) => !e.locked);
        if (els.length < 3) return;
        const pos = distributeRects(els, axis);
        const byId = new Map(els.map((e, i) => [e.id, pos[i]]));
        get().commit((p) => updateElements(p, get().pageId, [...byId.keys()], (e) => byId.get(e.id)!));
      },
      zOrder(dir) {
        const ids = get().selection;
        if (ids.length) get().commit((p) => moveElementsZ(p, get().pageId, ids, dir));
      },
      reorderLayer(id, toIndex) {
        get().commit((p) => reorderElement(p, get().pageId, id, toIndex));
      },
      addPage() {
        const s = get();
        const page = getPage(s.project, s.pageId);
        const r = addPageOp(s.project, { width: page?.width, height: page?.height });
        get().commit(() => r.project);
        set({ pageId: r.pageId, selection: [] });
      },
      duplicatePage(id) {
        const r = duplicatePageOp(get().project, id);
        get().commit(() => r.project);
        set({ pageId: r.pageId, selection: [] });
      },
      deletePage(id) {
        const s = get();
        if (s.project.pages.length <= 1) return;
        const idx = s.project.pages.findIndex((p) => p.id === id);
        const next = removePage(s.project, id);
        const pageId = s.pageId === id ? next.pages[Math.max(0, idx - 1)].id : s.pageId;
        set({ pageId });
        get().commit(() => next, { select: [] });
      },
      movePage(id, toIndex) {
        get().commit((p) => movePageOp(p, id, toIndex));
      },
      updatePage(id, patch, key) {
        get().commit((p) => updatePage(p, id, (pg) => {
          const next = { ...pg, ...patch };
          return (Object.keys(patch) as (keyof Page)[]).every((k) => pg[k] === next[k]) ? pg : next;
        }), { key });
      },
      setView(patch) {
        set({ view: { ...get().view, ...patch } });
      },
      toast(kind, message) {
        const id = toastSeq++;
        set({ toasts: [...get().toasts.slice(-3), { id, kind, message }] });
      },
      dismissToast(id) {
        set({ toasts: get().toasts.filter((t) => t.id !== id) });
      },
      askConfirm(req) {
        set({ confirm: req });
      },
      closeConfirm() {
        set({ confirm: null });
      },
      openDialog(d) {
        set({ dialog: d });
      },
      setRightTab(t) {
        set({ rightTab: t });
      },
      requestTextFocus() {
        set({ focusTextNonce: get().focusTextNonce + 1, rightTab: 'inspect' });
      },
    };
  });
}

let storeRef: EditorStore | null = null;
let storeFactory: (() => EditorStore) | null = null;

/** Registers how to build the app-wide store lazily (persistence provides the initial project). */
export function setStoreFactory(factory: () => EditorStore) {
  storeFactory = factory;
}

export function getEditorStore(): EditorStore {
  if (!storeRef) {
    if (!storeFactory) throw new Error('editor store factory not set');
    storeRef = storeFactory();
  }
  return storeRef;
}

/** For tests: replace the app-wide store. */
export function setEditorStore(store: EditorStore | null) {
  storeRef = store;
}

export function useEditor<T>(selector: (s: EditorState & EditorActions) => T): T {
  return useStore(getEditorStore(), selector);
}

export const editor = () => getEditorStore().getState();

/** Current page (falls back to the first page). */
export function currentPage(s: Pick<EditorState, 'project' | 'pageId'>): Page {
  return getPage(s.project, s.pageId) ?? s.project.pages[0];
}
