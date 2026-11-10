// Exporter entry point: rendered pages -> resource pack + data pack (+ auto-test pack) + README_zh-TW.
// Pure TypeScript; runs in Node and in the browser. Pipeline: tiles -> code points -> sheets -> runs -> dialogs -> zips.
import { DEFAULT_FOOTER_LABEL } from '../model/defaults';
import { KEY_RE } from '../model/ids';
import { isRenderScale } from '../render/scale';
import { defaultTileSize, glyphAdvance, MAX_CELL_TEXELS, MAX_PICTURE_WIDTH, MAX_VERIFIED_OFFSET } from './constants';
import { clickEvent, dialogObject, footerCommand, hoverEvent, oneLine, textComponents } from './dialogs';
import { ExportError } from './errors';
import { composePage, splitRegion, type Box, type HitPlacement, type PageLayout, type Placement } from './layout';
import { autotestFiles, autotestTick, dataPackFiles, resourcePackFiles, utf8, zipFiles, type FontPlan } from './pack';
import { MODE_LABELS, readmeText } from './readme';
import { CodepointAllocator, hitSheet, packSheets, type Sheet } from './sheets';
import { TileSet, type PlacedTile } from './tiles';
import { assignTriggers, autotestTriggers, checkTriggerCommands, triggerLookup } from './triggers';
import type { ExportOptions, ExportPage, ExportRegion, ExportStats, ExportWarning, FileMap, TriggerTable } from './types';

export type * from './types';
export { COMMAND_MODE_LABELS, MODE_LABELS } from './readme';
export { ExportError };

export type ResolvedOptions = Required<ExportOptions>;

export interface FileNames {
  resourcePack: string;
  dataPack: string;
  autotest: string;
  bundle: string;
  readme: string;
}

export interface BuiltPage {
  key: string;
  title: string;
  footerLabel: string;
  width: number;
  height: number;
  /** Regions that carry a click and/or hover event, clipped to the page, in z-order. */
  regions: ExportRegion[];
  /** Hit glyph boxes in emission order (regions > 128 px are split; see splitRegion for the baseline rule). */
  hits: { region: number; box: Box }[];
  tiles: number;
  layout: PageLayout;
  components: number;
  dialog: Record<string, unknown>;
}

export interface ExportBuild {
  options: ResolvedOptions;
  names: FileNames;
  pages: BuiltPage[];
  sheets: Sheet[];
  fonts: FontPlan[];
  resourcePack: FileMap;
  dataPack: FileMap;
  autotest: FileMap | null;
  /** Trigger mode: the objective and the id table ("按鈕編號對照"); null in direct mode. */
  triggers: TriggerTable | null;
  readme: string;
  stats: ExportStats;
  warnings: ExportWarning[];
}

export function resolveOptions(o: ExportOptions): ResolvedOptions {
  return {
    namespace: o.namespace,
    packName: oneLine(o.packName) || o.namespace,
    mode: o.mode,
    quickActions: o.mode === 'registry' && o.quickActions,
    afterAction: o.afterAction,
    commandMode: o.commandMode ?? 'direct',
    scale: o.scale ?? 1,
    tileSize: o.tileSize ?? defaultTileSize(o.scale ?? 1),
    autotest: o.autotest ?? false,
  };
}

/** Page size in page px: the explicit size, else the image size / scale. */
export function pageSize(p: ExportPage, scale: number): { w: number; h: number } {
  return { w: p.width ?? p.image.width / scale, h: p.height ?? p.image.height / scale };
}

export function defaultFileNames(ns: string): FileNames {
  return {
    resourcePack: `${ns}_resourcepack.zip`,
    dataPack: `${ns}_datapack.zip`,
    autotest: `${ns}_autotest.zip`,
    bundle: `${ns}_menu_export.zip`,
    readme: 'README_zh-TW.txt',
  };
}

function fail(message: string): never {
  throw new ExportError(message);
}

function validateInput(pages: ExportPage[], o: ResolvedOptions): void {
  if (!isRenderScale(o.scale)) fail(`解析度必須是 1、2、3 或 4 倍（收到 ${String(o.scale)}）。`);
  if (o.tileSize * o.scale > MAX_CELL_TEXELS)
    fail(`圖塊 ${o.tileSize} px × ${o.scale} 倍 = ${o.tileSize * o.scale} 像素，超過遊戲字型圖集的上限 ${MAX_CELL_TEXELS}。請降低解析度或縮小圖塊。`);
  if (!KEY_RE.test(o.namespace)) fail(`命名空間「${o.namespace}」只能使用小寫英文字母、數字與底線。`);
  if (o.namespace === 'minecraft') fail('命名空間不能是 minecraft（會蓋掉遊戲內建的檔案），請改成自己的名稱。');
  if (!pages.length) fail('沒有可以匯出的頁面。');
  const keys = new Set<string>();
  for (const p of pages) {
    if (!KEY_RE.test(p.key)) fail(`頁面檔名「${p.key}」只能使用小寫英文字母、數字與底線。`);
    if (keys.has(p.key)) fail(`頁面檔名「${p.key}」重複了。`);
    keys.add(p.key);
    const { width: IW, height: IH, data } = p.image;
    const { w: W, h: H } = pageSize(p, o.scale);
    if (!Number.isInteger(W) || !Number.isInteger(H) || W < 1 || H < 1) fail(`頁面「${p.key}」的尺寸不正確。`);
    if (IW !== W * o.scale || IH !== H * o.scale)
      fail(`頁面「${p.key}」的圖片是 ${IW}×${IH} 像素，應為 ${W}×${H} 頁面像素 × ${o.scale} 倍 = ${W * o.scale}×${H * o.scale}。`);
    if (W > MAX_PICTURE_WIDTH) fail(`頁面「${p.key}」寬 ${W} px，超過遊戲上限 ${MAX_PICTURE_WIDTH} px。`);
    if (data.length !== IW * IH * 4) fail(`頁面「${p.key}」的圖片資料長度不正確。`);
  }
  for (const p of pages)
    for (const r of p.regions)
      if (r.action.type === 'page' && !keys.has(r.action.key)) fail(`頁面「${p.key}」有按鈕連到不存在的頁面「${r.action.key}」。`);
}

interface Prepared {
  page: ExportPage;
  placed: PlacedTile[];
  regions: ExportRegion[];
  hits: { region: number; box: Box }[];
}

/** Builds every file of the export in memory (synchronous, deterministic). Throws ExportError on invalid input. */
export function buildExport(input: ExportPage[], options: ExportOptions, names?: Partial<FileNames>): ExportBuild {
  const o = resolveOptions(options);
  validateInput(input, o);
  const ns = o.namespace;
  const fileNames = { ...defaultFileNames(ns), ...names };
  const warnings: ExportWarning[] = [];
  const tileSet = new TileSet(o.tileSize, o.scale);
  let tilesEmpty = 0;

  // 1) tiles (deduped over all pages) and hit boxes of the regions that carry events
  const prepared: Prepared[] = input.map((page) => {
    const { placed, empty } = tileSet.add(page.image);
    tilesEmpty += empty;
    const { w: W, h: H } = pageSize(page, o.scale);
    const regions: ExportRegion[] = [];
    const hits: Prepared['hits'] = [];
    let extended = false;
    for (const r of page.regions) {
      const x0 = Math.max(0, Math.round(r.x)), y0 = Math.max(0, Math.round(r.y));
      const x1 = Math.min(W, Math.round(r.x + r.w)), y1 = Math.min(H, Math.round(r.y + r.h));
      if (x1 <= x0 || y1 <= y0) continue;
      if (!clickEvent(r.action, ns, o.mode) && !hoverEvent(r.tooltip)) continue;
      const region: ExportRegion = { ...r, x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
      const index = regions.push(region) - 1;
      const split = splitRegion(region);
      extended ||= split.extended;
      for (const box of split.pieces) hits.push({ region: index, box });
    }
    if (extended)
      warnings.push({
        code: 'hit-extended',
        pageKey: page.key,
        message: `頁面「${page.key}」有點擊區域緊貼頁面頂端（下緣高於 y=7），遊戲裡的可點擊範圍會向下延伸到 y=7。`,
      });
    if (!placed.length)
      warnings.push({ code: 'page-empty', pageKey: page.key, message: `頁面「${page.key}」是全透明的，遊戲裡只會看到空白。` });
    return { page, placed, regions, hits };
  });

  // 1b) trigger mode: ids in order of first appearance (pages, regions in z-order), then the footer close (after_action none)
  const triggers =
    o.commandMode === 'trigger'
      ? assignTriggers(prepared.map((p) => ({ key: p.page.key, regions: p.regions })), ns, o.mode, o.afterAction === 'none')
      : null;
  const ids = triggers ? triggerLookup(triggers, ns, o.mode) : null;
  if (triggers) warnings.push(...checkTriggerCommands(triggers));

  // 2) code points: tile glyphs in first-appearance order, then one glyph per distinct hit size
  const alloc = new CodepointAllocator();
  const tileCp = tileSet.tiles.map(() => alloc.take());
  const hitSizes = new Map<string, { w: number; h: number; cp: number }>();
  for (const p of prepared)
    for (const { box } of p.hits) {
      const k = `${box.w}x${box.h}`;
      if (!hitSizes.has(k)) hitSizes.set(k, { w: box.w, h: box.h, cp: alloc.take() });
    }
  if (alloc.usesSupplementary)
    warnings.push({
      code: 'glyphs-supplementary',
      message: `圖塊很多（共 ${alloc.count} 個字元），超出的部分改用補充私用區字元，這在遊戲中尚待實機驗證。可以減少頁面數量或縮小頁面。`,
    });

  // 3) sheets: tile cells of S * scale texels drawn S GUI px tall (JSON height S); hit glyphs stay 1x
  const S = o.tileSize;
  const { sheets: tileSheets, sheetOf } = packSheets(
    'tiles',
    tileSet.tiles.map((t, i) => ({ pixels: t.pixels, cp: tileCp[i] })),
    tileSet.cell,
    tileSet.cell,
    S,
  );
  const hitSheets = new Map<string, Sheet>();
  for (const [k, s] of hitSizes) hitSheets.set(k, hitSheet(s.w, s.h, s.cp));
  const sheets = [...tileSheets, ...hitSheets.values()];
  const usage = new Map<number, Set<Sheet>>();
  const use = (offset: number, sheet: Sheet) => {
    let set = usage.get(offset);
    if (!set) usage.set(offset, (set = new Set()));
    set.add(sheet);
  };

  // 4) runs, text components and dialogs per page
  const pages: BuiltPage[] = prepared.map(({ page, placed, regions, hits }) => {
    const { w: W, h: H } = pageSize(page, o.scale);
    const tiles: Placement[] = placed.map((t) => {
      use(t.y, tileSheets[sheetOf[t.tile]]);
      return { x: t.x, y: t.y, cp: tileCp[t.tile], advance: glyphAdvance(tileSet.tiles[t.tile].actualWidth, o.scale) };
    });
    const hitGlyphs: HitPlacement[] = hits.map(({ region, box }) => {
      const k = `${box.w}x${box.h}`;
      use(box.y, hitSheets.get(k)!);
      return { x: box.x, y: box.y, cp: hitSizes.get(k)!.cp, advance: glyphAdvance(box.w), region };
    });
    const layout = composePage(W, H, tiles, hitGlyphs);
    const contents = textComponents(layout, regions, ns, o.mode, ids);
    const footerLabel = oneLine(page.footerLabel) || DEFAULT_FOOTER_LABEL;
    const dialog = dialogObject({
      title: page.title, footerLabel, layout, contents, afterAction: o.afterAction, footerCommand: footerCommand(o.afterAction, ids),
    });
    const maxOffset = layout.offsets.length ? layout.offsets[layout.offsets.length - 1] : 0;
    if (maxOffset > MAX_VERIFIED_OFFSET)
      warnings.push({
        code: 'offset-unverified',
        pageKey: page.key,
        message: `頁面「${page.key}」用到 ${maxOffset} px 的垂直位移，實機只驗證到 ${MAX_VERIFIED_OFFSET} px（頁面高度約 300 px 以內）。`,
      });
    return {
      key: page.key, title: page.title, footerLabel, width: W, height: H, regions, hits,
      tiles: placed.length, layout, components: contents.length, dialog,
    };
  });

  // 5) fonts: one per vertical offset, holding only the sheets drawn at that offset
  const fonts: FontPlan[] = [...usage.keys()]
    .sort((a, b) => a - b)
    .map((offset) => ({ offset, sheets: sheets.filter((s) => usage.get(offset)!.has(s)) }));

  // 6) files
  const packName = o.packName;
  const resourcePack = resourcePackFiles(ns, `${packName}（選單工坊・圖片）`, sheets, fonts);
  const dataPack = dataPackFiles(ns, `${packName}（選單工坊・${MODE_LABELS[o.mode]}）`, o.mode, pages, o.quickActions, triggers);
  const keys = pages.map((p) => p.key);
  const autotest = o.autotest
    ? autotestFiles(ns, o.mode, keys, triggers && { objective: triggers.objective, tests: autotestTriggers(triggers, o.mode, autotestTick(keys.length - 1)) })
    : null;
  const allRegions = pages.flatMap((p) => p.regions);
  const readme = readmeText({
    packName,
    namespace: ns,
    mode: o.mode,
    quickActions: o.quickActions,
    afterAction: o.afterAction,
    commandMode: o.commandMode,
    triggers,
    scale: o.scale,
    tileSize: S,
    pages: pages.map((p) => ({ key: p.key, title: p.title, footerLabel: p.footerLabel })),
    files: { resourcePack: fileNames.resourcePack, dataPack: fileNames.dataPack },
    hasCommands: allRegions.some((r) => r.action.type === 'command'),
    hasClose: allRegions.some((r) => r.action.type === 'close'),
  });

  const sum = (f: (p: BuiltPage) => number) => pages.reduce((n, p) => n + f(p), 0);
  const stats: ExportStats = {
    pages: pages.length,
    scale: o.scale,
    tileSize: S,
    cellTexels: tileSet.cell,
    tilesPlaced: sum((p) => p.tiles),
    tilesEmpty,
    tilesUnique: tileSet.tiles.length,
    regions: sum((p) => p.regions.length),
    hitGlyphs: sum((p) => p.hits.length),
    hitSizes: hitSizes.size,
    sheets: sheets.length,
    glyphs: alloc.count,
    fonts: fonts.length,
    maxOffset: fonts.length ? fonts[fonts.length - 1].offset : 0,
    components: sum((p) => p.components),
  };
  return { options: o, names: fileNames, pages, sheets, fonts, resourcePack, dataPack, autotest, triggers, readme, stats, warnings };
}

export interface ExportArchives {
  resourcePack: Uint8Array;
  dataPack: Uint8Array;
  autotest: Uint8Array | null;
}

/** Zips the packs (byte-reproducible). */
export async function zipExport(build: ExportBuild): Promise<ExportArchives> {
  const [resourcePack, dataPack, autotest] = await Promise.all([
    zipFiles(build.resourcePack),
    zipFiles(build.dataPack),
    build.autotest ? zipFiles(build.autotest) : Promise.resolve(null),
  ]);
  return { resourcePack, dataPack, autotest };
}

/** One zip with both packs (stored, not unpacked) and the README, for the "download everything" button. */
export function zipBundle(build: ExportBuild, archives: ExportArchives): Promise<Uint8Array> {
  const files: FileMap = new Map([
    [build.names.resourcePack, archives.resourcePack],
    [build.names.dataPack, archives.dataPack],
    [build.names.readme, utf8(build.readme)],
  ]);
  return zipFiles(files);
}
