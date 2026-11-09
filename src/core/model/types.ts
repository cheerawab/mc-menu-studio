// Core data model. Pure TypeScript, no React/DOM.

export type Id = string;

export type SkinId = 'vanilla' | 'dark' | 'holo' | 'parchment';

export type Action =
  | { type: 'none' }
  | { type: 'page'; pageId: Id }
  | { type: 'command'; command: string }
  | { type: 'url'; url: string }
  | { type: 'copy'; text: string }
  | { type: 'close' };

export type ActionType = Action['type'];

export interface Asset {
  id: Id;
  name: string;
  mime: string;
  dataUrl: string;
  w: number;
  h: number;
}

export interface ProjectSettings {
  /** CSS font-family stack used for all text unless an element overrides it. */
  fontFamily: string;
  /** Accent colour override for the skin (null = skin default). */
  accent: string | null;
  /** Label of the dialog's footer button (the game's `notice` action), default "關閉". Pages may override it. */
  footerLabel: string;
}

export interface Project {
  version: 1;
  id: Id;
  name: string;
  /** Minecraft namespace for the export, [a-z0-9_]+ */
  namespace: string;
  skinId: SkinId;
  pages: Page[];
  assets: Record<Id, Asset>;
  settings: ProjectSettings;
}

export interface Page {
  id: Id;
  /** File name of the dialog, [a-z0-9_]+ */
  key: string;
  /** Dialog title shown by the game in the header. */
  title: string;
  width: number;
  height: number;
  /** Background fill of the page bitmap; null = transparent. */
  bgColor: string | null;
  /** Footer button label for this page; null = use the project default (settings.footerLabel). */
  footerLabel: string | null;
  /** Bottom to top (paint order). */
  elements: Element[];
}

export interface BaseElement {
  id: Id;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  locked: boolean;
  hidden: boolean;
  /** 0..1 */
  opacity: number;
}

export interface Interactive {
  action: Action;
  tooltip: string;
}

export type PanelVariant = 'raised' | 'inset' | 'flat';
export interface PanelElement extends BaseElement {
  type: 'panel';
  variant: PanelVariant;
  fill: string | null;
  border: string | null;
}

export type ButtonVariant = 'default' | 'primary' | 'danger' | 'disabled';
export interface ButtonElement extends BaseElement, Interactive {
  type: 'button';
  text: string;
  fontSize: number;
  bold: boolean;
  textColor: string | null;
  variant: ButtonVariant;
  fill: string | null;
  icon: IconId | null;
}

export type HAlign = 'left' | 'center' | 'right';
export type VAlign = 'top' | 'middle' | 'bottom';
export type PixelateMode = 'auto' | 'on' | 'off';
export interface LabelElement extends BaseElement, Interactive {
  type: 'label';
  text: string;
  fontSize: number;
  /** multiplier of fontSize */
  lineHeight: number;
  bold: boolean;
  shadow: boolean;
  color: string | null;
  align: HAlign;
  vAlign: VAlign;
  wrap: boolean;
  pixelate: PixelateMode;
  /** CSS font-family override; empty = project default */
  fontFamily: string;
}

export type ImageFit = 'stretch' | 'contain' | 'cover' | 'original';
export interface ImageElement extends BaseElement, Interactive {
  type: 'image';
  assetId: Id | null;
  fit: ImageFit;
  /** integer scale used by fit = 'original' */
  scale: number;
  smoothing: boolean;
}

export interface BarElement extends BaseElement {
  type: 'bar';
  /** 0..100 */
  value: number;
  color: string | null;
  trackColor: string | null;
  /** 0 = continuous */
  segments: number;
  text: string;
}

export type ShapeKind = 'rect' | 'rounded' | 'ellipse';
export interface ShapeElement extends BaseElement, Interactive {
  type: 'shape';
  shape: ShapeKind;
  radius: number;
  fill: string;
  gradient: { to: string; direction: 'vertical' | 'horizontal' } | null;
  stroke: string | null;
  strokeWidth: number;
}

export type DividerStyle = 'skin' | 'solid' | 'dashed' | 'dotted';
export interface DividerElement extends BaseElement {
  type: 'divider';
  orientation: 'horizontal' | 'vertical';
  style: DividerStyle;
  color: string | null;
  thickness: number;
}

export interface SlotGridElement extends BaseElement {
  type: 'slotgrid';
  cols: number;
  rows: number;
  slotSize: number;
  gap: number;
}

export interface IconElement extends BaseElement, Interactive {
  type: 'icon';
  icon: IconId;
  scale: number;
  tint: string | null;
}

export type Element =
  | PanelElement
  | ButtonElement
  | LabelElement
  | ImageElement
  | BarElement
  | ShapeElement
  | DividerElement
  | SlotGridElement
  | IconElement;

export type ElementType = Element['type'];
export type InteractiveElement = Extract<Element, Interactive>;

export const ICON_IDS = [
  'heart', 'star', 'sword', 'pickaxe', 'bag', 'gear', 'home', 'map', 'coin', 'check', 'cross',
  'arrow_left', 'arrow_right', 'arrow_up', 'arrow_down', 'lock', 'sun', 'moon', 'rain', 'chest',
  'book', 'potion', 'chat', 'globe', 'clock', 'info', 'trophy', 'shield',
] as const;
export type IconId = (typeof ICON_IDS)[number];

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Interactive area in page pixels, in z-order (later = on top). */
export interface Region extends Rect {
  elementId: Id;
  action: Action;
  tooltip: string;
}
