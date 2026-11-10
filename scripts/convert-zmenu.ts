// Convert a zMenu inventory YAML (格子式 chest GUI) into an MC Menu Studio project JSON (像素定位 Dialog).
//
// zMenu and MC Menu Studio are different paradigms:
//   - zMenu: a chest inventory of `size` slots (multiples of 9). Each item sits in a slot (0..size-1) and carries
//     `material`, `name`, `lore` (legacy & codes) and `actions`.
//   - MC Menu Studio: a page of pixel-positioned elements drawn into the vanilla Dialog screen, with typed Actions.
//
// So this importer maps slot -> pixel (x,y) on a grid, item name/lore -> a button + label, and the zMenu action list
// -> a single MC Menu Studio Action (best-effort; unsupported actions degrade to a command or none and are reported).
//
// Usage:
//   npx tsx scripts/convert-zmenu.ts <input.yml> [--name "顯示名"] [--namespace ns] [--skin dark] [--out project.json]
//
// It never touches the game or the network; it only reads the YAML file and writes a .mcms.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { createElement, createPage, createProject } from '../src/core/model/defaults';
import { serializeProject } from '../src/core/model/serialize';
import type { Action, Element, SkinId } from '../src/core/model/types';
import { SKIN_IDS } from '../src/core/model/defaults';

// ---- zMenu YAML shapes (only the fields we read) ---------------------------------------------------------------

interface ZItem {
  material?: string;
  name?: string;
  lore?: string[];
}
interface ZAction {
  type?: string;
  commands?: string[];
  server?: string;
  // book/open_url actions carry nested `lines`; we extract the first URL we find.
  lines?: Record<string, string[]>;
  url?: string;
}
interface ZButton {
  slot?: number;
  item?: ZItem;
  actions?: ZAction[];
}
interface ZMenu {
  name?: string;
  size?: number;
  items?: Record<string, ZButton>;
}

// ---- Legacy colour code -> hex (Minecraft &0..&f) --------------------------------------------------------------

const LEGACY_HEX: Record<string, string> = {
  '0': '#000000', '1': '#0000aa', '2': '#00aa00', '3': '#00aaaa', '4': '#aa0000', '5': '#aa00aa',
  '6': '#ffaa00', '7': '#aaaaaa', '8': '#555555', '9': '#5555ff', a: '#55ff55', b: '#55ffff',
  c: '#ff5555', d: '#ff55ff', e: '#ffff55', f: '#ffffff',
};

/** Strips legacy & codes (and MiniMessage tags) from a string for display text. */
export function stripFormatting(s: string): string {
  return s
    .replace(/<[^>]+>/g, '') // MiniMessage tags
    .replace(/&[0-9a-fk-or]/gi, '') // legacy & codes
    .replace(/[§][0-9a-fk-or]/gi, '')
    .trim();
}

/** First legacy colour code in a string -> hex, or null. */
export function firstColor(s: string): string | null {
  const m = s.match(/&([0-9a-f])/i);
  return m ? LEGACY_HEX[m[1].toLowerCase()] ?? null : null;
}

/** First URL inside a zMenu book action's lines (MiniMessage `open_url:"..."`), or null. */
function firstUrl(a: ZAction): string | null {
  if (a.url) return a.url;
  if (!a.lines) return null;
  for (const lines of Object.values(a.lines))
    for (const line of lines) {
      const m = line.match(/open_url:"([^"]+)"/);
      if (m) return m[1];
    }
  return null;
}

/** Map one zMenu action list to a single MC Menu Studio Action (best-effort). Returns the action + a note if degraded. */
export function convertAction(actions: ZAction[] | undefined): { action: Action; note?: string } {
  if (!actions || !actions.length) return { action: { type: 'none' } };
  const a = actions[0];
  const type = (a.type ?? '').toLowerCase();
  const extra = actions.length > 1 ? `（原本有 ${actions.length} 個動作，只保留第一個）` : '';
  switch (type) {
    case 'player command':
    case 'console command':
    case 'command': {
      const cmd = (a.commands?.[0] ?? '').replace(/^\//, '');
      return { action: { type: 'command', command: cmd }, note: extra || undefined };
    }
    case 'connect':
      // zMenu Velocity server switch has no Dialog equivalent; approximate with a /server command.
      return {
        action: { type: 'command', command: `server ${a.server ?? ''}`.trim() },
        note: `connect → /server（Dialog 無分流動作，改用指令）${extra}`,
      };
    case 'book': {
      const url = firstUrl(a);
      if (url) return { action: { type: 'url', url }, note: `book → 開啟連結（只取第一個網址）${extra}` };
      return { action: { type: 'none' }, note: `book 動作無法轉換（沒有網址）${extra}` };
    }
    default:
      return { action: { type: 'none' }, note: `未支援的動作類型「${a.type}」，已設為無動作${extra}` };
  }
}

// ---- Slot -> pixel layout --------------------------------------------------------------------------------------

export interface LayoutOpts {
  cols: number;
  rows: number;
  cellW: number;
  cellH: number;
  padX: number;
  padY: number;
  titleH: number;
}

export const DEFAULT_LAYOUT: LayoutOpts = { cols: 9, rows: 0, cellW: 34, cellH: 40, padX: 10, padY: 8, titleH: 26 };

export interface ConvertResult {
  json: string;
  notes: string[];
  pageWidth: number;
  pageHeight: number;
  buttonCount: number;
}

export function convertZMenu(
  yamlText: string,
  opts: { name?: string; namespace?: string; skin?: SkinId; layout?: Partial<LayoutOpts>; compact?: boolean } = {},
): ConvertResult {
  const menu = parseYaml(yamlText) as ZMenu;
  const notes: string[] = [];
  const size = typeof menu.size === 'number' ? menu.size : 36;
  const L = { ...DEFAULT_LAYOUT, ...opts.layout };
  const cols = L.cols;
  const rawRows = L.rows || Math.ceil(size / cols);

  // Compact empty columns/rows (default on): zMenu menus often use only a few of the 9 columns (日出 uses 1,3,5,7),
  // which leaves most of the width empty and narrows every button so text gets clipped. Remap the used columns/rows
  // to sequential positions so each used cell gets more room, keeping their relative order.
  const compact = opts.compact ?? true;
  const btnEntries = Object.entries(menu.items ?? {}).filter(([, b]) => typeof b.slot === 'number');
  const usedCols = [...new Set(btnEntries.map(([, b]) => (b.slot as number) % cols))].sort((a, b) => a - b);
  const usedRows = [...new Set(btnEntries.map(([, b]) => Math.floor((b.slot as number) / cols)))].sort((a, b) => a - b);
  const colIndex = new Map(usedCols.map((c, i) => [c, i]));
  const rowIndex = new Map(usedRows.map((r, i) => [r, i]));
  const gridCols = compact && usedCols.length ? usedCols.length : cols;
  const rows = compact && usedRows.length ? usedRows.length : rawRows;
  const cellW = compact ? Math.min(140, Math.floor((Math.min(1000, 540) - L.padX * 2) / gridCols)) : L.cellW;
  const mapCol = (slotCol: number) => (compact ? colIndex.get(slotCol) ?? slotCol : slotCol);
  const mapRow = (slotRow: number) => (compact ? rowIndex.get(slotRow) ?? slotRow : slotRow);

  const pageWidth = Math.min(1000, L.padX * 2 + gridCols * cellW);
  const pageHeight = Math.min(600, L.titleH + L.padY * 2 + rows * L.cellH);

  const title = menu.name ? stripFormatting(menu.name) : '選單';
  const elements: Element[] = [];

  // Background panel so the dialog has a visible frame.
  elements.push(createElement('panel', { name: '背景', x: 0, y: 0, w: pageWidth, h: pageHeight, variant: 'flat' }));
  // Title label at the top.
  const titleColor = menu.name ? firstColor(menu.name) : null;
  elements.push(
    createElement('label', {
      name: '標題', x: L.padX, y: 6, w: pageWidth - L.padX * 2, h: L.titleH - 6,
      text: title, fontSize: 16, bold: true, align: 'center', color: titleColor, shadow: true,
    }),
  );

  const buttons = Object.entries(menu.items ?? {});
  let buttonCount = 0;
  for (const [key, btn] of buttons) {
    if (typeof btn.slot !== 'number') {
      notes.push(`「${key}」沒有 slot，略過`);
      continue;
    }
    const col = mapCol(btn.slot % cols);
    const row = mapRow(Math.floor(btn.slot / cols));
    const cellX = L.padX + col * cellW;
    const cellY = L.titleH + L.padY + row * L.cellH;
    const name = btn.item?.name ?? key;
    const label = stripFormatting(name);
    const labelColor = firstColor(name);
    const { action, note } = convertAction(btn.actions);
    if (note) notes.push(`「${label || key}」：${note}`);

    // A button holds the item name + its action; the first lore line (if any) becomes the tooltip.
    const tooltip = (btn.item?.lore ?? []).map(stripFormatting).filter(Boolean).join('\n');
    elements.push(
      createElement('button', {
        name: label || key,
        x: cellX + 2, y: cellY, w: cellW - 4, h: L.cellH - 6,
        text: label, fontSize: 11, bold: false, textColor: labelColor,
        variant: 'default', action, tooltip,
      }),
    );
    buttonCount++;
  }

  const page = createPage({ key: 'main', title, width: pageWidth, height: pageHeight, bgColor: '#1b1b1f', elements });
  const project = createProject({
    name: opts.name ?? title,
    namespace: opts.namespace ?? 'menu',
    skinId: opts.skin ?? 'dark',
    pages: [page],
  });

  return { json: serializeProject(project), notes, pageWidth, pageHeight, buttonCount };
}

// ---- CLI -------------------------------------------------------------------------------------------------------

function parseArgs(argv: string[]): { input: string; name?: string; namespace?: string; skin?: string; out?: string } {
  const a: Record<string, string> = {};
  let input = '';
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t.startsWith('--')) a[t.slice(2)] = argv[++i];
    else input = t;
  }
  return { input, ...a };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input) {
    console.error('usage: npx tsx scripts/convert-zmenu.ts <input.yml> [--name N] [--namespace ns] [--skin dark] [--out out.json]');
    process.exit(2);
  }
  const yamlText = readFileSync(args.input, 'utf8');
  const skin = (args.skin && SKIN_IDS.includes(args.skin as SkinId) ? args.skin : 'dark') as SkinId;
  const res = convertZMenu(yamlText, { name: args.name, namespace: args.namespace, skin });
  const out = args.out ?? args.input.replace(/\.ya?ml$/i, '') + '.mcms.json';
  writeFileSync(out, res.json);
  console.log(`converted ${basename(args.input)} -> ${out}`);
  console.log(`  page ${res.pageWidth}x${res.pageHeight}, ${res.buttonCount} buttons`);
  if (res.notes.length) {
    console.log('  notes:');
    for (const n of res.notes) console.log(`   - ${n}`);
  }
}

// Run only as a CLI (not when imported by a test).
if (process.argv[1] && /convert-zmenu\.(ts|mts|js)$/.test(process.argv[1])) main();
