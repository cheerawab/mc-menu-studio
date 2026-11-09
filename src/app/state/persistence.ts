// localStorage autosave, JSON import/export and image upload helpers (browser only).
import { newId } from '@/core/model/ids';
import { assetBytes } from '@/core/model/ops';
import { parseProjectJson, serializeProject } from '@/core/model/serialize';
import type { Asset, Project } from '@/core/model/types';
import { sampleProject } from '@/core/templates';
import { createEditorStore, DEFAULT_VIEW, setStoreFactory, type EditorStore, type ViewState } from './store';

export const PROJECT_KEY = 'mc-menu-studio:project:v1';
export const VIEW_KEY = 'mc-menu-studio:view:v1';
/** Largest accepted upload. Bigger files are rejected with a friendly message. */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
/** Uploaded images larger than this (either side) are scaled down. */
export const MAX_IMAGE_W = 1000;
export const MAX_IMAGE_H = 600;
/** Warn when embedded images get close to the typical 5 MB localStorage quota. */
export const ASSET_WARN_BYTES = 3 * 1024 * 1024;

function pickView(raw: unknown): Partial<ViewState> {
  if (typeof raw !== 'object' || raw === null) return {};
  const r = raw as Record<string, unknown>;
  const out: Partial<ViewState> = {};
  if (typeof r.showGrid === 'boolean') out.showGrid = r.showGrid;
  if (r.snap === 1 || r.snap === 2 || r.snap === 4 || r.snap === 8) out.snap = r.snap;
  if (typeof r.showRegions === 'boolean') out.showRegions = r.showRegions;
  if (r.guiScale === 1 || r.guiScale === 2 || r.guiScale === 3 || r.guiScale === 4) out.guiScale = r.guiScale;
  if (typeof r.windowId === 'string') out.windowId = r.windowId;
  return out;
}

export interface InitialState {
  project: Project;
  view: Partial<ViewState>;
  messages: { kind: 'info' | 'warning' | 'error'; text: string }[];
}

export function loadInitial(storage: Storage | null = safeStorage()): InitialState {
  const messages: InitialState['messages'] = [];
  let view: Partial<ViewState> = {};
  try {
    const v = storage?.getItem(VIEW_KEY);
    if (v) view = pickView(JSON.parse(v));
  } catch {
    /* ignore broken view settings */
  }
  try {
    const raw = storage?.getItem(PROJECT_KEY);
    if (raw) {
      const { project, warnings } = parseProjectJson(raw);
      for (const w of warnings) messages.push({ kind: 'warning', text: w });
      return { project, view, messages };
    }
  } catch {
    messages.push({ kind: 'error', text: '先前自動儲存的專案無法讀取，已改為載入範例專案。' });
  }
  if (!messages.length) messages.push({ kind: 'info', text: '歡迎使用選單工坊！已為你載入範例專案。' });
  return { project: sampleProject(), view, messages };
}

function safeStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** Debounced autosave of the project and view settings. Returns an unsubscribe function. */
export function startAutosave(store: EditorStore, storage: Storage | null = safeStorage(), delay = 600): () => void {
  if (!storage) return () => {};
  let timer: ReturnType<typeof setTimeout> | null = null;
  let failed = false;
  const viewKey = (v: ViewState) => JSON.stringify({ showGrid: v.showGrid, snap: v.snap, showRegions: v.showRegions, guiScale: v.guiScale, windowId: v.windowId });
  let savedProject = store.getState().project;
  let savedView = viewKey(store.getState().view);
  const flush = () => {
    timer = null;
    const s = store.getState();
    try {
      const vk = viewKey(s.view);
      if (s.project !== savedProject) storage.setItem(PROJECT_KEY, serializeProject(s.project, false));
      if (vk !== savedView) storage.setItem(VIEW_KEY, vk);
      savedProject = s.project;
      savedView = vk;
      if (failed) s.toast('success', '自動儲存已恢復。');
      failed = false;
    } catch {
      if (!failed) s.toast('error', '瀏覽器儲存空間不足，自動儲存暫停。請匯出專案 JSON 備份，或移除部分圖片。');
      failed = true;
    }
  };
  // Compare against what was last written (not the previous state), so the end of a drag gesture,
  // which does not change `project` itself, still gets saved.
  const unsub = store.subscribe((s) => {
    if (s.gestureBase) return; // save once the drag ends
    if (s.project === savedProject && viewKey(s.view) === savedView) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, delay);
  });
  const onUnload = () => {
    if (timer) {
      clearTimeout(timer);
      flush();
    }
  };
  if (typeof window !== 'undefined') window.addEventListener('beforeunload', onUnload);
  return () => {
    unsub();
    if (typeof window !== 'undefined') window.removeEventListener('beforeunload', onUnload);
  };
}

/** Wires the app-wide store: initial project from localStorage (or the sample) plus autosave. */
export function installAppStore() {
  setStoreFactory(() => {
    const init = loadInitial();
    const store = createEditorStore(init.project, { ...DEFAULT_VIEW, ...init.view });
    for (const m of init.messages) store.getState().toast(m.kind, m.text);
    startAutosave(store);
    return store;
  });
}

export function downloadText(filename: string, text: string, mime = 'application/json') {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportProjectJson(project: Project) {
  const name = (project.namespace || 'menu').replace(/[^a-z0-9_]/g, '_');
  downloadText(`${name}.mcmenu.json`, serializeProject(project));
}

export function readFileAsText(file: File): Promise<string> {
  return file.text();
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('讀取檔案失敗。'));
    r.readAsDataURL(file);
  });
}

function decode(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('無法解析這張圖片。'));
    img.src = src;
  });
}

const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
export const IMAGE_ACCEPT = ACCEPTED.join(',');

/** Validates and embeds an uploaded image. Large images are scaled down to the max page size. */
export async function fileToAsset(file: File, project: Project): Promise<{ asset: Asset; note?: string }> {
  if (!ACCEPTED.includes(file.type)) throw new Error('只支援 PNG、JPG、WebP 或 GIF 圖片。');
  if (file.size > MAX_IMAGE_BYTES)
    throw new Error(`圖片檔案太大（${(file.size / 1048576).toFixed(1)} MB），上限是 2 MB。請先壓縮或縮小圖片。`);
  let dataUrl = await readAsDataUrl(file);
  let img = await decode(dataUrl);
  let note: string | undefined;
  let w = img.naturalWidth, h = img.naturalHeight;
  if (w > MAX_IMAGE_W || h > MAX_IMAGE_H) {
    const s = Math.min(MAX_IMAGE_W / w, MAX_IMAGE_H / h);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * s));
    c.height = Math.max(1, Math.round(h * s));
    const ctx = c.getContext('2d');
    if (ctx) {
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, c.width, c.height);
      dataUrl = c.toDataURL('image/png');
      img = await decode(dataUrl);
      note = `圖片已自動縮小為 ${c.width}×${c.height}（頁面最大 ${MAX_IMAGE_W}×${MAX_IMAGE_H}）。`;
      w = c.width;
      h = c.height;
    }
  }
  if (assetBytes(project) + dataUrl.length > ASSET_WARN_BYTES)
    note = `${note ? `${note} ` : ''}專案內的圖片總量已偏大，瀏覽器自動儲存可能失敗，建議定期匯出 JSON 備份。`;
  const asset: Asset = { id: newId(), name: file.name.slice(0, 60), mime: dataUrl.slice(5, dataUrl.indexOf(';')), dataUrl, w, h };
  return { asset, note };
}
