// Shared helpers of the size PoC scripts (not part of the product).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createCanvas, type Canvas } from '@napi-rs/canvas';
import { buildExport, zipExport } from '../src/core/export';
import type { ExportPage, ExportRegion } from '../src/core/export/types';
import { circleRegions, type Built } from './sao-art';

export const OUT = 'exports/size-poc';
const FONT = '"PingFang TC", "Noto Sans TC", "Heiti TC", sans-serif';

export function saoPage(key: string, built: Built, k: number, links: boolean): ExportPage {
  const ctx = built.canvas.getContext('2d');
  const { width: w, height: h } = built.canvas;
  const img = ctx.getImageData(0, 0, w, h);
  const circles = circleRegions(
    k,
    (id): ExportRegion['action'] => (links && (id === 'status' || id === 'items') ? { type: 'page', key: id === 'status' ? 'sao_status' : 'sao_items' } : { type: 'none' }),
    (_id, label) => label,
  );
  return { key, title: '系統選單', footerLabel: '登出', image: { width: w, height: h, data: img.data }, regions: [...built.regions, ...circles] };
}

/** Plain test page: 1 px white frame, 16 px grid, coloured corner squares, ruler ticks, big label. Regions: one tooltip box in the middle. */
export function gridPage(key: string, w: number, h: number, label: string, sub: string): { page: ExportPage; canvas: Canvas } {
  const canvas = createCanvas(w, h), ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(14,18,28,0.82)'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  for (let x = 16; x < w; x += 16) ctx.fillRect(x, 0, 1, h);
  for (let y = 16; y < h; y += 16) ctx.fillRect(0, y, w, 1);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, 1); ctx.fillRect(0, h - 1, w, 1); ctx.fillRect(0, 0, 1, h); ctx.fillRect(w - 1, 0, 1, h);
  const sq = 7, cols = ['#ff4d4d', '#4dff88', '#4da6ff', '#ffd24d'];
  [[2, 2], [w - 2 - sq, 2], [2, h - 2 - sq], [w - 2 - sq, h - 2 - sq]].forEach(([x, y], i) => { ctx.fillStyle = cols[i]; ctx.fillRect(x, y, sq, sq); });
  ctx.fillStyle = '#ffffff';
  for (let x = 50; x < w; x += 50) ctx.fillRect(x, 1, 1, x % 100 === 0 ? 8 : 5);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff'; ctx.font = `bold ${Math.min(30, Math.floor(h / 4))}px ${FONT}`; ctx.fillText(label, w / 2, h / 2 - 10);
  ctx.fillStyle = '#b9c2d3'; ctx.font = `12px ${FONT}`; ctx.fillText(sub, w / 2, h / 2 + 14);
  const img = ctx.getImageData(0, 0, w, h);
  const mid: ExportRegion = { x: Math.floor(w / 2) - 40, y: Math.floor(h / 2) - 20, w: 80, h: 40, action: { type: 'none' }, tooltip: `${label}（頁面中央）` };
  return { page: { key, title: label, footerLabel: '關閉', image: { width: w, height: h, data: img.data }, regions: [mid] }, canvas };
}

export async function emit(name: string, pages: ExportPage[], previews: [string, Canvas][]) {
  const base = join(OUT, name);
  mkdirSync(join(base, 'previews'), { recursive: true });
  for (const [n, c] of previews) writeFileSync(join(base, 'previews', `${n}.png`), c.toBuffer('image/png'));
  const build = buildExport(pages, {
    namespace: 'size_poc', packName: `Size PoC ${name}`, mode: 'functions', quickActions: false,
    afterAction: 'close', autotest: true, commandMode: 'trigger',
  }, { resourcePack: 'resourcepack.zip', dataPack: 'datapack.zip', autotest: 'autotest.zip' });
  const zips = await zipExport(build);
  const dir = join(base, 'functions');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'resourcepack.zip'), zips.resourcePack);
  writeFileSync(join(dir, 'datapack.zip'), zips.dataPack);
  if (zips.autotest) writeFileSync(join(dir, 'autotest.zip'), zips.autotest);
  console.log(name, pages.map((p) => `${p.key} ${p.image.width}x${p.image.height}`).join(', '));
  console.log(' ', JSON.stringify(build.stats));
  console.log(`  resourcepack.zip ${(zips.resourcePack.length / 1024).toFixed(0)} KB, datapack.zip ${(zips.dataPack.length / 1024).toFixed(1)} KB`);
  for (const w of build.warnings) console.log('  !', w.message);
}

