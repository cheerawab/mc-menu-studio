// PoC (not part of the product): how big can a Dialog picture be, and what happens at GUI sizes where it does not fit?
//   npx tsx scripts/size-poc.ts   ->  exports/size-poc/{s480,s270}/functions/{resourcepack,datapack,autotest}.zip + previews
// s480: SAO-style menu at 597x336 = 70% x 70% of a 853x480 GUI (1280x720 window at GUI scale 3)
// s270: test pages around the scroll threshold of a 480x270 GUI (1080p, GUI scale "auto" = 4) + the 340x210 SAO page + a too-wide page
import { saoItems, saoStatus } from './sao-art';
import { emit, gridPage, saoPage } from './poc-lib';

async function main() {
  // --- s480: 70% x 70% of 853x480 -------------------------------------------------------------------------------
  {
    const K = 1.6, WC = 597, HC = 336;
    const items = saoItems(WC, HC, K), status = saoStatus(WC, HC, K);
    await emit('s480', [saoPage('sao_items', items, K, true), saoPage('sao_status', status, K, true)], [['sao_items', items.canvas], ['sao_status', status.canvas]]);
  }
  // --- s270: around the scroll threshold of a 480x270 GUI ---------------------------------------------------------
  {
    const a = gridPage('fit180', 336, 180, '336×180', '70% 寬 × 67% 高 (480×270)');
    const b = gridPage('over189', 336, 189, '336×189', '70% × 70% (480×270)');
    const items = saoItems(340, 210, 1);
    const w = gridPage('wide520', 520, 100, '520×100', '比 480 寬的畫面還寬');
    await emit('s270', [a.page, b.page, saoPage('sao_items', items, 1, false), w.page],
      [['fit180', a.canvas], ['over189', b.canvas], ['sao_items', items.canvas], ['wide520', w.canvas]]);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
