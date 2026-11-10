// PoC (not part of the product): can the Dialog + resource-pack picture technique carry an "SAO-style" menu?
// Draws two pages with plain canvas vector code (silver circle icon column, orange selection, translucent panel),
// hands them to the real exporter (same buildExport as the editor) and writes
//   exports/sao-poc/previews/*.png            the source bitmaps
//   exports/sao-poc/functions/{resourcepack,datapack,autotest}.zip
//   npm run poc:sao   (tsx scripts/sao-poc.ts)
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { buildExport, zipExport } from '../src/core/export';
import type { ExportPage, ExportRegion } from '../src/core/export/types';

const W = 340, H = 210;
const OUT = 'exports/sao-poc';
const FONT = '"PingFang TC", "Noto Sans TC", "Heiti TC", sans-serif';

const SILVER = '#eef0f3', SILVER_D = '#c3c7ce', RING = 'rgba(95,100,110,0.95)', ICON = '#4f545c';
const ORANGE = '#f6a31b', ORANGE_L = '#ffc857', ORANGE_D = '#c97800';
const PANEL = 'rgba(244,245,247,0.93)', PANEL_LINE = 'rgba(110,115,125,0.95)';
const TEXT = '#3b3f46', MUTED = '#868b94';

type Ctx = ReturnType<ReturnType<typeof createCanvas>['getContext']>;

function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function text(ctx: Ctx, s: string, x: number, y: number, size: number, color: string, opts: { bold?: boolean; align?: 'left' | 'center' | 'right' } = {}) {
  ctx.font = `${opts.bold ? 'bold ' : ''}${size}px ${FONT}`;
  ctx.textAlign = opts.align ?? 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
}

// ---- icons (line art, centred on cx,cy) ----
type IconFn = (ctx: Ctx, cx: number, cy: number) => void;
const person = (ctx: Ctx, cx: number, cy: number, s = 1) => {
  ctx.beginPath(); ctx.arc(cx, cy - 4.2 * s, 3.4 * s, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(cx, cy + 7.6 * s, 6.8 * s, 5.8 * s, 0, Math.PI, Math.PI * 2); ctx.stroke();
};
const ICONS: Record<string, IconFn> = {
  status: (ctx, cx, cy) => person(ctx, cx, cy),
  items: (ctx, cx, cy) => {
    rr(ctx, cx - 7, cy - 3, 14, 11, 2.2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy - 3, 3.6, Math.PI, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - 7, cy + 1.5); ctx.lineTo(cx + 7, cy + 1.5); ctx.stroke();
  },
  equip: (ctx, cx, cy) => {
    ctx.lineWidth = 2.1; ctx.beginPath(); ctx.moveTo(cx + 7, cy - 7); ctx.lineTo(cx - 3, cy + 3); ctx.stroke();
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(cx - 5.9, cy + 0.1); ctx.lineTo(cx - 0.1, cy + 5.9); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - 3, cy + 3); ctx.lineTo(cx - 6.3, cy + 6.3); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx - 7, cy + 7, 1.1, 0, Math.PI * 2); ctx.stroke();
  },
  party: (ctx, cx, cy) => { person(ctx, cx - 4.2, cy + 0.5, 0.78); person(ctx, cx + 4.6, cy + 0.5, 0.78); },
  mail: (ctx, cx, cy) => {
    rr(ctx, cx - 7.5, cy - 5.2, 15, 10.4, 1.6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - 7.3, cy - 4.6); ctx.lineTo(cx, cy + 1.2); ctx.lineTo(cx + 7.3, cy - 4.6); ctx.stroke();
  },
  gear: (ctx, cx, cy) => {
    ctx.beginPath(); ctx.arc(cx, cy, 2.8, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * 6, cy + Math.sin(a) * 6); ctx.lineTo(cx + Math.cos(a) * 8.6, cy + Math.sin(a) * 8.6); ctx.stroke();
    }
  },
};

const MENU: { id: keyof typeof ICONS; label: string }[] = [
  { id: 'status', label: '狀態' }, { id: 'items', label: '道具' }, { id: 'equip', label: '裝備' },
  { id: 'party', label: '隊伍' }, { id: 'mail', label: '訊息' }, { id: 'gear', label: '設定' },
];
const CX = 30, R = 14, PITCH = 33, Y0 = 20;
const cy = (i: number) => Y0 + i * PITCH;

function circleColumn(ctx: Ctx, selected: number) {
  MENU.forEach((m, i) => {
    const y = cy(i), sel = i === selected;
    // soft shadow ring
    ctx.beginPath(); ctx.arc(CX, y + 0.8, R + 0.6, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fill();
    const g = ctx.createLinearGradient(0, y - R, 0, y + R);
    if (sel) { g.addColorStop(0, ORANGE_L); g.addColorStop(1, ORANGE); } else { g.addColorStop(0, '#ffffff'); g.addColorStop(1, SILVER_D); }
    ctx.beginPath(); ctx.arc(CX, y, R, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = sel ? ORANGE_D : RING; ctx.stroke();
    ctx.beginPath(); ctx.arc(CX, y, R - 1.6, 0, Math.PI * 2); ctx.strokeStyle = sel ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.85)'; ctx.stroke();
    ctx.strokeStyle = sel ? '#ffffff' : ICON; ctx.lineWidth = 1.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ICONS[m.id](ctx, CX, y);
  });
  // pointer notch from the selected circle to the panel
  const y = cy(selected);
  ctx.beginPath(); ctx.moveTo(CX + R + 1, y - 5); ctx.lineTo(CX + R + 8, y); ctx.lineTo(CX + R + 1, y + 5); ctx.closePath();
  ctx.fillStyle = ORANGE; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = ORANGE_D; ctx.stroke();
}

const PX = 58, PY = 6, PW = 276, PH = 198;
function panel(ctx: Ctx, title: string, sub: string, right: string) {
  rr(ctx, PX + 1, PY + 1.5, PW, PH, 7); ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fill();
  rr(ctx, PX, PY, PW, PH, 7); ctx.fillStyle = PANEL; ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = PANEL_LINE; rr(ctx, PX + 0.5, PY + 0.5, PW - 1, PH - 1, 7); ctx.stroke();
  text(ctx, title, PX + 14, PY + 15, 14, TEXT, { bold: true });
  text(ctx, sub, PX + 14 + title.length * 15 + 6, PY + 16, 9, MUTED);
  text(ctx, right, PX + PW - 14, PY + 15, 10, MUTED, { align: 'right' });
  ctx.fillStyle = SILVER_D; ctx.fillRect(PX + 10, PY + 30, PW - 20, 1);
  ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(PX + 10, PY + 31, PW - 20, 1);
}

// small item pictograms for the list
function itemIcon(ctx: Ctx, kind: string, x: number, y: number, sel: boolean) {
  ctx.lineWidth = 1.2; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const stroke = sel ? '#ffffff' : '#555a62';
  if (kind === 'sword') {
    ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 13, y + 3); ctx.lineTo(x + 5, y + 11); ctx.stroke();
    ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(x + 3.5, y + 8.5); ctx.lineTo(x + 8.5, y + 13.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 6.5, y + 11.5); ctx.lineTo(x + 3, y + 15); ctx.stroke();
  } else if (kind === 'crystal' || kind === 'crystal2') {
    ctx.beginPath(); ctx.moveTo(x + 8, y + 1.5); ctx.lineTo(x + 13, y + 8); ctx.lineTo(x + 8, y + 14.5); ctx.lineTo(x + 3, y + 8); ctx.closePath();
    ctx.fillStyle = sel ? 'rgba(255,255,255,0.55)' : kind === 'crystal' ? '#7ccaff' : '#8fe3c6'; ctx.fill();
    ctx.strokeStyle = sel ? '#ffffff' : kind === 'crystal' ? '#2f86c9' : '#2f9a7a'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 3, y + 8); ctx.lineTo(x + 13, y + 8); ctx.stroke();
  } else if (kind === 'bread') {
    ctx.beginPath(); ctx.ellipse(x + 8, y + 9, 6.5, 4.6, 0, 0, Math.PI * 2);
    ctx.fillStyle = sel ? 'rgba(255,255,255,0.55)' : '#e2b06a'; ctx.fill(); ctx.strokeStyle = sel ? '#ffffff' : '#9a6a2e'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 5, y + 7); ctx.lineTo(x + 6.5, y + 11); ctx.moveTo(x + 8.5, y + 6.2); ctx.lineTo(x + 9.5, y + 11.5); ctx.stroke();
  } else {
    rr(ctx, x + 2.5, y + 3.5, 11, 9.5, 3); ctx.fillStyle = sel ? 'rgba(255,255,255,0.55)' : '#c9a778'; ctx.fill();
    ctx.strokeStyle = sel ? '#ffffff' : '#8a6c3f'; ctx.stroke();
  }
}

function itemsPage(): { canvas: ReturnType<typeof createCanvas>; regions: ExportRegion[] } {
  const canvas = createCanvas(W, H), ctx = canvas.getContext('2d');
  circleColumn(ctx, 1);
  panel(ctx, '道具', 'ITEMS', 'Col  2,450');
  const rows: [string, string, string][] = [
    ['sword', '鐵製長劍', '×1'], ['crystal', '治療水晶', '×3'], ['bread', '麵包', '×12'], ['crystal2', '傳送水晶', '×2'], ['hide', '狼皮', '×7'],
  ];
  const regions: ExportRegion[] = [];
  rows.forEach(([kind, name, qty], i) => {
    const x = PX + 10, y = PY + 38 + i * 25, w = PW - 34, h = 23, sel = i === 0;
    if (sel) {
      const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, ORANGE_L); g.addColorStop(1, ORANGE);
      rr(ctx, x, y, w, h, 4); ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = ORANGE_D; ctx.lineWidth = 1; rr(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 4); ctx.stroke();
    } else if (i % 2 === 1) { rr(ctx, x, y, w, h, 4); ctx.fillStyle = 'rgba(0,0,0,0.05)'; ctx.fill(); }
    itemIcon(ctx, kind, x + 6, y + 3, sel);
    text(ctx, name, x + 30, y + h / 2 + 0.5, 12, sel ? '#ffffff' : TEXT, { bold: sel });
    text(ctx, qty, x + w - 10, y + h / 2 + 0.5, 11, sel ? '#ffffff' : MUTED, { align: 'right' });
    regions.push({ x, y, w, h, action: { type: 'none' }, tooltip: `${name} ${qty}` });
  });
  // scrollbar
  ctx.fillStyle = 'rgba(0,0,0,0.10)'; rr(ctx, PX + PW - 17, PY + 38, 5, 123, 2.5); ctx.fill();
  ctx.fillStyle = ORANGE; rr(ctx, PX + PW - 17, PY + 38, 5, 50, 2.5); ctx.fill();
  // capacity
  text(ctx, '背包容量', PX + 14, PY + 175, 10, MUTED);
  text(ctx, '29 / 40', PX + PW - 14, PY + 175, 10, TEXT, { align: 'right' });
  ctx.fillStyle = 'rgba(0,0,0,0.12)'; rr(ctx, PX + 14, PY + 183, PW - 28, 6, 3); ctx.fill();
  const g = ctx.createLinearGradient(PX + 14, 0, PX + 14 + (PW - 28), 0); g.addColorStop(0, ORANGE_L); g.addColorStop(1, ORANGE);
  ctx.fillStyle = g; rr(ctx, PX + 14, PY + 183, Math.round((PW - 28) * 0.725), 6, 3); ctx.fill();
  return { canvas, regions };
}

function statusPage(): { canvas: ReturnType<typeof createCanvas>; regions: ExportRegion[] } {
  const canvas = createCanvas(W, H), ctx = canvas.getContext('2d');
  circleColumn(ctx, 0);
  panel(ctx, '狀態', 'STATUS', 'Col  2,450');
  // portrait
  const px = PX + 14, py = PY + 40;
  const pg = ctx.createLinearGradient(0, py, 0, py + 110); pg.addColorStop(0, '#d9dde3'); pg.addColorStop(1, '#aeb4bd');
  rr(ctx, px, py, 70, 110, 6); ctx.fillStyle = pg; ctx.fill(); ctx.strokeStyle = PANEL_LINE; ctx.lineWidth = 1; rr(ctx, px + 0.5, py + 0.5, 69, 109, 6); ctx.stroke();
  ctx.fillStyle = '#7b818b'; ctx.beginPath(); ctx.arc(px + 35, py + 40, 15, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(px + 35, py + 108, 30, 36, 0, Math.PI, Math.PI * 2); ctx.fill();
  // name / level
  const nx = px + 84;
  text(ctx, '史蒂夫', nx, py + 8, 15, TEXT, { bold: true });
  text(ctx, 'Lv. 12', nx + 122, py + 9, 12, ORANGE_D, { bold: true });
  text(ctx, '劍士  ·  第 1 層', nx, py + 27, 10, MUTED);
  // HP (bar first, value to its right so nothing overlaps)
  text(ctx, 'HP', nx, py + 46, 10, MUTED, { bold: true });
  ctx.fillStyle = 'rgba(0,0,0,0.13)'; rr(ctx, nx + 22, py + 41, 84, 9, 4.5); ctx.fill();
  const hg = ctx.createLinearGradient(0, py + 41, 0, py + 50); hg.addColorStop(0, '#a6f08a'); hg.addColorStop(1, '#4fbf3b');
  ctx.fillStyle = hg; rr(ctx, nx + 22, py + 41, 84, 9, 4.5); ctx.fill();
  ctx.strokeStyle = 'rgba(40,110,30,0.8)'; ctx.lineWidth = 1; rr(ctx, nx + 22.5, py + 41.5, 83, 8, 4); ctx.stroke();
  text(ctx, '1250/1250', nx + 112, py + 46, 10, TEXT);
  // EXP
  text(ctx, 'EXP', nx, py + 64, 10, MUTED, { bold: true });
  ctx.fillStyle = 'rgba(0,0,0,0.13)'; rr(ctx, nx + 28, py + 61, 78, 6, 3); ctx.fill();
  const eg = ctx.createLinearGradient(0, py + 61, 0, py + 67); eg.addColorStop(0, ORANGE_L); eg.addColorStop(1, ORANGE);
  ctx.fillStyle = eg; rr(ctx, nx + 28, py + 61, Math.round(78 * 0.38), 6, 3); ctx.fill();
  text(ctx, '38%', nx + 112, py + 64, 10, TEXT);
  // stats
  const stats: [string, string, number][] = [['力量', 'STR', 24], ['敏捷', 'AGI', 18], ['體力', 'VIT', 20], ['幸運', 'LUK', 7]];
  const regions: ExportRegion[] = [];
  stats.forEach(([zh, en, v], i) => {
    const x = nx + (i % 2) * 86, y = py + 82 + Math.floor(i / 2) * 26;
    rr(ctx, x, y, 80, 22, 4); ctx.fillStyle = 'rgba(0,0,0,0.05)'; ctx.fill();
    text(ctx, zh, x + 7, y + 11.5, 11, TEXT);
    text(ctx, en, x + 31, y + 12, 8, MUTED);
    text(ctx, String(v), x + 73, y + 11.5, 12, TEXT, { bold: true, align: 'right' });
    regions.push({ x, y, w: 80, h: 22, action: { type: 'none' }, tooltip: `${zh} ${en} ${v}` });
  });
  return { canvas, regions };
}

function toPage(key: string, title: string, built: { canvas: ReturnType<typeof createCanvas>; regions: ExportRegion[] }): ExportPage {
  const ctx = built.canvas.getContext('2d');
  const img = ctx.getImageData(0, 0, W, H);
  // circle buttons: bounding boxes (z-order: the shared list rows/stat boxes come first, circles last)
  const circles: ExportRegion[] = MENU.map((m, i) => {
    let action: ExportRegion['action'] = { type: 'none' };
    if (m.id === 'status') action = { type: 'page', key: 'sao_status' };
    else if (m.id === 'items') action = { type: 'page', key: 'sao_items' };
    else if (m.id === 'equip') action = { type: 'command', command: 'time set day' };
    else if (m.id === 'gear') action = { type: 'command', command: 'weather clear' };
    const tip = m.id === 'equip' ? '裝備（示範：把時間設為白天）' : m.id === 'gear' ? '設定（示範：放晴）' : m.label;
    return { x: CX - R, y: cy(i) - R, w: R * 2, h: R * 2, action, tooltip: tip };
  });
  return {
    key, title, footerLabel: '登出',
    image: { width: W, height: H, data: img.data },
    regions: [...built.regions, ...circles],
  };
}

async function main() {
  const items = itemsPage(), status = statusPage();
  mkdirSync(join(OUT, 'previews'), { recursive: true });
  writeFileSync(join(OUT, 'previews', 'sao_items.png'), items.canvas.toBuffer('image/png'));
  writeFileSync(join(OUT, 'previews', 'sao_status.png'), status.canvas.toBuffer('image/png'));
  const pages = [toPage('sao_items', '系統選單', items), toPage('sao_status', '系統選單', status)];
  const build = buildExport(pages, {
    namespace: 'sao_poc', packName: 'SAO 風格選單 PoC', mode: 'functions', quickActions: false,
    afterAction: 'close', autotest: true, commandMode: 'trigger',
  }, { resourcePack: 'resourcepack.zip', dataPack: 'datapack.zip', autotest: 'autotest.zip' });
  const zips = await zipExport(build);
  const dir = join(OUT, 'functions');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'resourcepack.zip'), zips.resourcePack);
  writeFileSync(join(dir, 'datapack.zip'), zips.dataPack);
  if (zips.autotest) writeFileSync(join(dir, 'autotest.zip'), zips.autotest);
  writeFileSync(join(dir, 'README_zh-TW.txt'), build.readme);
  console.log(JSON.stringify(build.stats));
  for (const w of build.warnings) console.log('!', w.message);
  if (build.triggers) for (const a of build.triggers.actions) console.log(`trigger ${a.id} ${a.kind} ${a.command}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
