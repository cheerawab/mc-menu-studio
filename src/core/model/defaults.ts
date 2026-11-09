import { newId } from './ids';
import type {
  Action,
  Element,
  ElementType,
  InteractiveElement,
  Page,
  Project,
  ProjectSettings,
  SkinId,
} from './types';

export const PAGE_LIMITS = {
  minW: 16,
  minH: 16,
  maxW: 1000,
  maxH: 600,
  defaultW: 320,
  defaultH: 200,
} as const;

export const DEFAULT_FONT_STACK = '"PingFang TC", "Noto Sans TC", "Microsoft JhengHei", "Heiti TC", sans-serif';

/** Default label of the dialog's footer button. */
export const DEFAULT_FOOTER_LABEL = '關閉';

export const SKIN_IDS: readonly SkinId[] = ['vanilla', 'dark', 'holo', 'parchment'];

export const ELEMENT_TYPES: readonly ElementType[] = [
  'panel', 'button', 'label', 'image', 'icon', 'shape', 'bar', 'divider', 'slotgrid',
];

/** zh-TW display names of element types. */
export const ELEMENT_LABELS: Record<ElementType, string> = {
  panel: '面板',
  button: '按鈕',
  label: '文字',
  image: '圖片',
  bar: '進度條',
  shape: '形狀',
  divider: '分隔線',
  slotgrid: '物品格',
  icon: '圖示',
};

const INTERACTIVE = new Set<ElementType>(['button', 'label', 'image', 'shape', 'icon']);

export function isInteractiveType(t: ElementType): boolean {
  return INTERACTIVE.has(t);
}

export function isInteractive(el: Element): el is InteractiveElement {
  return INTERACTIVE.has(el.type);
}

export const NO_ACTION: Action = { type: 'none' };

export function defaultSettings(): ProjectSettings {
  return { fontFamily: DEFAULT_FONT_STACK, accent: null, footerLabel: DEFAULT_FOOTER_LABEL };
}

type ElementOf<T extends ElementType> = Extract<Element, { type: T }>;
export type ElementProps<T extends ElementType> = Partial<Omit<ElementOf<T>, 'type'>>;

function base(name: string, w: number, h: number) {
  return { id: newId(), name, x: 0, y: 0, w, h, locked: false, hidden: false, opacity: 1 };
}

function defaults(type: ElementType): Element {
  const name = ELEMENT_LABELS[type];
  switch (type) {
    case 'panel':
      return { ...base(name, 160, 100), type, variant: 'raised', fill: null, border: null };
    case 'button':
      return {
        ...base(name, 96, 20), type, text: '按鈕', fontSize: 12, bold: false, textColor: null,
        variant: 'default', fill: null, icon: null, action: { type: 'none' }, tooltip: '',
      };
    case 'label':
      return {
        ...base(name, 120, 16), type, text: '文字內容', fontSize: 12, lineHeight: 1.35, bold: false,
        shadow: false, color: null, align: 'left', vAlign: 'top', wrap: true, pixelate: 'auto',
        fontFamily: '', action: { type: 'none' }, tooltip: '',
      };
    case 'image':
      return {
        ...base(name, 64, 64), type, assetId: null, fit: 'contain', scale: 1, smoothing: false,
        action: { type: 'none' }, tooltip: '',
      };
    case 'bar':
      return { ...base(name, 100, 8), type, value: 60, color: null, trackColor: null, segments: 0, text: '' };
    case 'shape':
      return {
        ...base(name, 64, 40), type, shape: 'rounded', radius: 4, fill: '#4f8cff', gradient: null,
        stroke: null, strokeWidth: 1, action: { type: 'none' }, tooltip: '',
      };
    case 'divider':
      return { ...base(name, 120, 2), type, orientation: 'horizontal', style: 'skin', color: null, thickness: 1 };
    case 'slotgrid':
      return { ...base(name, 72, 36), type, cols: 4, rows: 2, slotSize: 18, gap: 0 };
    case 'icon':
      return {
        ...base(name, 16, 16), type, icon: 'heart', scale: 1, tint: null, action: { type: 'none' }, tooltip: '',
      };
  }
}

export function createElement<T extends ElementType>(type: T, props: ElementProps<T> = {}): ElementOf<T> {
  const el = { ...defaults(type), ...props, type } as ElementOf<T>;
  if (!props.id) el.id = newId();
  return normalizeElement(el);
}

const int = (v: number, fallback = 0) => (Number.isFinite(v) ? Math.round(v) : fallback);
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Enforces integer geometry, sane ranges and derived sizes. Returns a new object when something changed. */
export function normalizeElement<T extends Element>(input: T): T {
  const el = { ...input };
  el.x = int(el.x);
  el.y = int(el.y);
  el.w = Math.max(1, int(el.w, 1));
  el.h = Math.max(1, int(el.h, 1));
  el.opacity = clamp(Number.isFinite(el.opacity) ? el.opacity : 1, 0, 1);
  switch (el.type) {
    case 'slotgrid': {
      el.cols = clamp(int(el.cols, 1), 1, 40);
      el.rows = clamp(int(el.rows, 1), 1, 30);
      el.slotSize = clamp(int(el.slotSize, 18), 8, 64);
      el.gap = clamp(int(el.gap, 0), 0, 64);
      el.w = el.cols * el.slotSize + (el.cols - 1) * el.gap;
      el.h = el.rows * el.slotSize + (el.rows - 1) * el.gap;
      break;
    }
    case 'icon': {
      el.scale = clamp(int(el.scale, 1), 1, 8);
      el.w = 16 * el.scale;
      el.h = 16 * el.scale;
      break;
    }
    case 'button':
    case 'label':
      el.fontSize = clamp(int(el.fontSize, 12), 6, 72);
      if (el.type === 'label') el.lineHeight = clamp(Number(el.lineHeight) || 1.35, 0.8, 3);
      break;
    case 'bar':
      el.value = clamp(Number.isFinite(el.value) ? el.value : 0, 0, 100);
      el.segments = clamp(int(el.segments, 0), 0, 50);
      break;
    case 'shape':
      el.radius = clamp(int(el.radius, 0), 0, 64);
      el.strokeWidth = clamp(int(el.strokeWidth, 1), 1, 16);
      break;
    case 'divider':
      el.thickness = clamp(int(el.thickness, 1), 1, 16);
      break;
    case 'image':
      el.scale = clamp(int(el.scale, 1), 1, 16);
      break;
  }
  return el;
}

export function createPage(props: Partial<Page> = {}): Page {
  return {
    id: newId(),
    key: 'main',
    title: '選單',
    width: PAGE_LIMITS.defaultW,
    height: PAGE_LIMITS.defaultH,
    bgColor: null,
    footerLabel: null,
    elements: [],
    ...props,
  };
}

/** Footer button label used for a page: its override, else the project default, else "關閉". */
export function effectiveFooterLabel(page: Page, project: Project): string {
  return (page.footerLabel ?? project.settings.footerLabel).replace(/\s+/g, ' ').trim() || DEFAULT_FOOTER_LABEL;
}

export function createProject(props: Partial<Project> = {}): Project {
  const pages = props.pages && props.pages.length ? props.pages : [createPage()];
  return {
    version: 1,
    id: newId(),
    name: '未命名選單',
    namespace: 'menu',
    skinId: 'dark',
    assets: {},
    settings: defaultSettings(),
    ...props,
    pages,
  };
}
