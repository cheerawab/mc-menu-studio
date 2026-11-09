// Exporter input/output types. The exporter consumes already rendered pages (RGBA + regions), so the same code
// serves the browser (DOM canvas), Node (@napi-rs/canvas) and synthetic test pictures.

export type ExportMode = 'registry' | 'functions';
export type AfterAction = 'close' | 'none';

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
  image: RgbaImage;
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
  /** Tile size in px (default 32). */
  tileSize?: number;
  /** Also build the auto-test data pack (Hermes). */
  autotest?: boolean;
}

export type FileMap = Map<string, Uint8Array>;

export interface ExportWarning {
  code: string;
  /** zh-TW, user facing. */
  message: string;
  pageKey?: string;
}

export interface ExportStats {
  pages: number;
  tileSize: number;
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
