// Exporter input/output types. The exporter consumes already rendered pages (RGBA + regions), so the same code
// serves the browser (DOM canvas), Node (@napi-rs/canvas) and synthetic test pictures.
import type { RenderScale } from '../model/types';

export type ExportMode = 'registry' | 'functions';
export type AfterAction = 'close' | 'none';
/**
 * How command-like actions run (docs/VERIFIED.md §13). `trigger`: the button runs `trigger <obj> set <id>` (no
 * permission, no confirm screen) and the data pack's tick function runs the real command as the player. `direct`: the
 * button sends the command itself (Stage B behaviour).
 */
export type CommandMode = 'trigger' | 'direct';

/** A model action with page links already resolved to page keys. */
export type ExportAction =
  | { type: 'none' }
  | { type: 'page'; key: string }
  | { type: 'command'; command: string }
  | { type: 'url'; url: string }
  | { type: 'copy'; text: string }
  | { type: 'close' };

export interface RgbaImage {
  width: number;
  height: number;
  /** Straight (not premultiplied) RGBA, row-major, width * height * 4 bytes. */
  data: Uint8Array | Uint8ClampedArray;
}

/** Interactive rectangle in page pixels. Order = z-order (later wins clicks). */
export interface ExportRegion {
  x: number;
  y: number;
  w: number;
  h: number;
  action: ExportAction;
  tooltip: string;
}

export interface ExportPage {
  /** Dialog / function file name, [a-z0-9_]+ */
  key: string;
  title: string;
  footerLabel: string;
  /** The picture in texels: page px x the export's `scale` on both axes. */
  image: RgbaImage;
  /** Page size in page px (= GUI px). Omitted = image size / scale. The exporter checks image = size x scale. */
  width?: number;
  height?: number;
  /** In page px. */
  regions: ExportRegion[];
}

export interface ExportOptions {
  /** Minecraft namespace, [a-z0-9_]+ */
  namespace: string;
  /** Human-readable name, used in pack descriptions and the README. */
  packName: string;
  mode: ExportMode;
  /** registry mode only: bind the first page to the quick-actions key (G). */
  quickActions: boolean;
  afterAction: AfterAction;
  /**
   * `trigger` (what the export dialog and the CLI default to) or `direct`. Omitted = `direct`, so callers written
   * before trigger mode existed keep their exact output.
   */
  commandMode?: CommandMode;
  /**
   * Texels per page px of every page image (1-4, default 1 so callers written before Stage H keep their exact
   * output). Tile glyph cells get T x scale texels with JSON `height` T; hit glyphs stay 1x.
   */
  scale?: RenderScale;
  /** Tile size in GUI px (default by scale: 1x 32, 2x 32, 3x 24, 4x 16); `tileSize * scale` must be <= 255. */
  tileSize?: number;
  /** Also build the auto-test data pack (Hermes). */
  autotest?: boolean;
}

export type FileMap = Map<string, Uint8Array>;

/** Actions that get a trigger id: commands, close and (functions mode only) page navigation. */
export type TriggerKind = 'command' | 'close' | 'page';

/** One row of the trigger id table ("按鈕編號對照"). */
export interface TriggerAction {
  /** >= 1, the value the button sets: `trigger <objective> set <id>`. */
  id: number;
  kind: TriggerKind;
  /** What `trigger_tick` runs as the player: the user's command (no leading slash), `dialog clear @s` or `function <ns>:show_<key>`. */
  command: string;
  /** Navigation only: the target page key. */
  target?: string;
  /** Key of the first page (export order) whose buttons use it; for a close id used only by the footer: the first page. */
  firstPage: string;
  /** Used only by the footer buttons (`after_action: none` gives the footer the close action). */
  footerOnly: boolean;
}

export interface TriggerTable {
  /** Scoreboard objective of type `trigger`: `mcms_<namespace>`. */
  objective: string;
  /** Ordered by id (1, 2, 3, ...). */
  actions: TriggerAction[];
}

export interface ExportWarning {
  code: string;
  /** zh-TW, user facing. */
  message: string;
  pageKey?: string;
}

export interface ExportStats {
  pages: number;
  /** Render scale (texels per GUI px) of the tile glyphs. */
  scale: number;
  /** Tile size in GUI px. */
  tileSize: number;
  /** Texels per side of a tile glyph cell (tileSize * scale). */
  cellTexels: number;
  /** Tiles drawn (after skipping empty ones), over all pages. */
  tilesPlaced: number;
  /** Fully transparent tiles that were skipped. */
  tilesEmpty: number;
  /** Distinct tile bitmaps (= tile glyphs). */
  tilesUnique: number;
  regions: number;
  /** Hit glyphs placed (regions larger than 128 px are split). */
  hitGlyphs: number;
  /** Distinct hit glyph sizes (one tiny sheet each). */
  hitSizes: number;
  /** PNG sheets in the resource pack. */
  sheets: number;
  /** Private-use code points used. */
  glyphs: number;
  /** `y<N>` fonts. */
  fonts: number;
  /** Largest vertical offset N used. */
  maxOffset: number;
  /** Text components over all pages. */
  components: number;
}
