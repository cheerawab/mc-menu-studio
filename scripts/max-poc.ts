// PoC (not part of the product): the largest picture a vanilla Dialog can show without scrolling, in two GUI sizes.
//   npx tsx scripts/max-poc.ts  ->  exports/size-poc/{m853,m1280}/functions/{resourcepack,datapack,autotest}.zip + previews
// GUI px = framebuffer px / GUI scale. A 1280x720-point window on a Retina Mac is 2560x1440 px:
//   m853  = GUI scale 3 -> GUI 853x480.  Limits (decompiled layout code, docs/VERIFIED.md s16): W <= 853 - 32 = 821, H <= 9*floor((480-83)/9) = 396
//   m1280 = GUI scale 2 -> GUI 1280x720. W <= min(1012, 1280-32), H <= 9*floor((720-83)/9) = 630. 1012 = the game's own cap
//           (plain_message width <= 1024) minus the widget padding 8 and the wrap margin 4.
// Each set also holds a frame page of the same size (to measure the extents), a page 9 px taller (expected to scroll) and, for
// m853, a page wider than the screen (expected to be cropped).
import { saoItems, saoStatus } from './sao-art';
import { emit, gridPage, saoPage } from './poc-lib';

async function main() {
  {
    const W = 821, H = 396, k = H / 210;
    const items = saoItems(W, H, k);
    const frame = gridPage('max_frame', W, H, `${W}×${H}`, '853×480 GUI 的不捲動上限：寬 96%、高 82%');
    const over = gridPage('over405', W, H + 9, `${W}×${H + 9}`, '比上限高 9 px：預期出現捲軸');
    const wide = gridPage('wide1012', 1012, 100, '1012×100', '比 853 寬的畫面還寬：預期兩側被裁');
    await emit('m853', [saoPage('max_items', items, k, false), frame.page, over.page, wide.page],
      [['max_items', items.canvas], ['max_frame', frame.canvas], ['over405', over.canvas], ['wide1012', wide.canvas]]);
  }
  {
    const W = 1012, H = 630, k = H / 210;
    const items = saoItems(W, H, k), status = saoStatus(W, H, k);
    const frame = gridPage('max_frame', W, H, `${W}×${H}`, '1280×720 GUI：寬度上限 1012（遊戲欄位上限 1024）、高 87%');
    const over = gridPage('over639', W, H + 9, `${W}×${H + 9}`, '比上限高 9 px：預期出現捲軸');
    // frame page FIRST: in the 853 run the SAO page was first and showed no scrollbar while the same-size frame page (second) did;
    // this order tells "first dialog after loading" apart from "page content".
    await emit('m1280', [frame.page, saoPage('sao_items', items, k, true), saoPage('sao_status', status, k, true), over.page],
      [['max_frame', frame.canvas], ['sao_items', items.canvas], ['sao_status', status.canvas], ['over639', over.canvas]]);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
