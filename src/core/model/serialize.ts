// JSON (de)serialisation with defensive normalisation, so hand-edited or older files still load.
import { createElement, createPage, createProject, defaultSettings, ELEMENT_TYPES, PAGE_LIMITS, SKIN_IDS, clamp } from './defaults';
import { newId } from './ids';
import { ICON_IDS } from './types';
import type { Action, Asset, Element, ElementType, Page, Project, SkinId } from './types';

export const PROJECT_FORMAT = 'mc-menu-studio';
export const CURRENT_VERSION = 1;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, d: string) => (typeof v === 'string' ? v : d);
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** Allowed values for string-enum fields, keyed by "type.field". */
const ENUMS: Record<string, readonly string[]> = {
  'panel.variant': ['raised', 'inset', 'flat'],
  'button.variant': ['default', 'primary', 'danger', 'disabled'],
  'button.icon': ICON_IDS,
  'label.align': ['left', 'center', 'right'],
  'label.vAlign': ['top', 'middle', 'bottom'],
  'label.pixelate': ['auto', 'on', 'off'],
  'image.fit': ['stretch', 'contain', 'cover', 'original'],
  'shape.shape': ['rect', 'rounded', 'ellipse'],
  'divider.orientation': ['horizontal', 'vertical'],
  'divider.style': ['skin', 'solid', 'dashed', 'dotted'],
  'icon.icon': ICON_IDS,
};

export function normalizeAction(raw: unknown): Action {
  if (!isObj(raw)) return { type: 'none' };
  switch (raw.type) {
    case 'page':
      return { type: 'page', pageId: str(raw.pageId, '') };
    case 'command':
      return { type: 'command', command: str(raw.command, '') };
    case 'url':
      return { type: 'url', url: str(raw.url, '') };
    case 'copy':
      return { type: 'copy', text: str(raw.text, '') };
    case 'close':
      return { type: 'close' };
    default:
      return { type: 'none' };
  }
}

function normalizeElementJson(raw: unknown, warnings: string[]): Element | null {
  if (!isObj(raw) || !ELEMENT_TYPES.includes(raw.type as ElementType)) {
    warnings.push('略過一個無法辨識的元件。');
    return null;
  }
  const type = raw.type as ElementType;
  const def = createElement(type) as unknown as Obj;
  const out: Obj = { ...def };
  for (const [k, dv] of Object.entries(def)) {
    if (k === 'type' || !(k in raw)) continue;
    const v = raw[k];
    if (k === 'action') out.action = normalizeAction(v);
    else if (k === 'gradient') {
      out.gradient = isObj(v) && typeof v.to === 'string'
        ? { to: v.to, direction: v.direction === 'horizontal' ? 'horizontal' : 'vertical' }
        : null;
    } else if (ENUMS[`${type}.${k}`]) {
      const allowed = ENUMS[`${type}.${k}`];
      if (typeof v === 'string' && allowed.includes(v)) out[k] = v;
      else if (v === null && dv === null) out[k] = null;
    } else if (dv === null) {
      if (v === null || typeof v === 'string') out[k] = v;
    } else if (typeof v === typeof dv) out[k] = v;
  }
  return createElement(type, out as never);
}

function normalizePage(raw: unknown, warnings: string[], index: number): Page {
  const r = isObj(raw) ? raw : {};
  const els = Array.isArray(r.elements) ? r.elements : [];
  return createPage({
    id: str(r.id, '') || newId(),
    key: str(r.key, `page_${index + 1}`),
    title: str(r.title, '選單'),
    width: clamp(Math.round(num(r.width, PAGE_LIMITS.defaultW)), 1, 4096),
    height: clamp(Math.round(num(r.height, PAGE_LIMITS.defaultH)), 1, 4096),
    bgColor: typeof r.bgColor === 'string' ? r.bgColor : null,
    footerLabel: typeof r.footerLabel === 'string' && r.footerLabel.trim() ? r.footerLabel : null,
    elements: els.map((e) => normalizeElementJson(e, warnings)).filter((e): e is Element => e !== null),
  });
}

function normalizeAsset(id: string, raw: unknown): Asset | null {
  if (!isObj(raw) || typeof raw.dataUrl !== 'string' || !raw.dataUrl.startsWith('data:image/')) return null;
  return {
    id,
    name: str(raw.name, 'image'),
    mime: str(raw.mime, raw.dataUrl.slice(5, raw.dataUrl.indexOf(';')) || 'image/png'),
    dataUrl: raw.dataUrl,
    w: Math.max(1, Math.round(num(raw.w, 1))),
    h: Math.max(1, Math.round(num(raw.h, 1))),
  };
}

/** Upgrades older JSON shapes. Version 1 is the first one; the hook exists for later stages. */
function migrate(raw: Obj): Obj {
  const v = num(raw.version, 1);
  if (v > CURRENT_VERSION) throw new Error(`這個專案來自較新的版本（v${v}），請更新選單工坊後再開啟。`);
  return { ...raw, version: CURRENT_VERSION };
}

export interface LoadResult {
  project: Project;
  warnings: string[];
}

/** Accepts a parsed JSON value (a project or `{format, project}`) and returns a valid Project. Throws on garbage. */
export function normalizeProject(input: unknown): LoadResult {
  const warnings: string[] = [];
  let raw = input;
  if (isObj(raw) && raw.format === PROJECT_FORMAT && isObj(raw.project)) raw = raw.project;
  if (!isObj(raw) || !Array.isArray(raw.pages)) throw new Error('檔案格式不正確：找不到頁面資料。');
  const r = migrate(raw);
  const pages = (r.pages as unknown[]).map((p, i) => normalizePage(p, warnings, i));
  if (!pages.length) throw new Error('專案裡沒有任何頁面。');

  // Ids must be unique across the project; regenerate collisions.
  const seen = new Set<string>();
  for (const page of pages) {
    if (seen.has(page.id)) page.id = newId();
    seen.add(page.id);
    for (const el of page.elements) {
      if (seen.has(el.id)) el.id = newId();
      seen.add(el.id);
    }
  }

  const assets: Record<string, Asset> = {};
  if (isObj(r.assets)) {
    for (const [id, a] of Object.entries(r.assets)) {
      const asset = normalizeAsset(id, a);
      if (asset) assets[id] = asset;
      else warnings.push(`圖片素材「${id}」格式不正確，已略過。`);
    }
  }
  const s = isObj(r.settings) ? r.settings : {};
  const settings = { ...defaultSettings() };
  if (typeof s.fontFamily === 'string' && s.fontFamily.trim()) settings.fontFamily = s.fontFamily;
  if (typeof s.accent === 'string') settings.accent = s.accent;
  if (typeof s.footerLabel === 'string') settings.footerLabel = s.footerLabel;

  const project = createProject({
    id: str(r.id, '') || newId(),
    name: str(r.name, '未命名選單'),
    namespace: str(r.namespace, 'menu'),
    skinId: SKIN_IDS.includes(r.skinId as SkinId) ? (r.skinId as SkinId) : 'dark',
    pages,
    assets,
    settings,
  });
  return { project, warnings };
}

export function parseProjectJson(text: string): LoadResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('無法解析 JSON：檔案可能已損毀。');
  }
  return normalizeProject(data);
}

export function serializeProject(project: Project, pretty = true): string {
  return JSON.stringify({ format: PROJECT_FORMAT, version: CURRENT_VERSION, project }, null, pretty ? 2 : 0);
}
