// PoC (not part of the product): can the Dialog + resource-pack picture technique carry an "SAO-style" menu?
// Two pages drawn with plain canvas vector code (scripts/sao-art.ts), handed to the real exporter (same buildExport as
// the editor). Writes exports/sao-poc/previews/*.png and exports/sao-poc/functions/{resourcepack,datapack,autotest}.zip.
//   npx tsx scripts/sao-poc.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildExport, zipExport } from '../src/core/export';
import type { ExportPage, ExportRegion } from '../src/core/export/types';
import { circleRegions, saoItems, saoStatus, type Built } from './sao-art';

const W = 340, H = 210;
const OUT = 'exports/sao-poc';

function toPage(key: string, title: string, built: Built): ExportPage {
  const img = built.canvas.getContext('2d').getImageData(0, 0, W, H);
  // circle buttons come last = on top (z-order: later wins clicks)
  const circles = circleRegions(
    1,
    (id): ExportRegion['action'] =>
      id === 'status' ? { type: 'page', key: 'sao_status' } : id === 'items' ? { type: 'page', key: 'sao_items' }
        : id === 'equip' ? { type: 'command', command: 'time set day' } : id === 'gear' ? { type: 'command', command: 'weather clear' } : { type: 'none' },
    (id, label) => (id === 'equip' ? '裝備（示範：把時間設為白天）' : id === 'gear' ? '設定（示範：放晴）' : label),
  );
  return { key, title, footerLabel: '登出', image: { width: W, height: H, data: img.data }, regions: [...built.regions, ...circles] };
}

async function main() {
  const items = saoItems(W, H, 1), status = saoStatus(W, H, 1);
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
  if (build.triggers) for (const t of build.triggers.actions) console.log(`trigger ${t.id} ${t.kind} ${t.command}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
