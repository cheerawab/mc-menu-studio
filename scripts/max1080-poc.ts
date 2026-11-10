// PoC (not part of the product): the largest picture on a 1920x1080 screen with the DEFAULT GUI scale ("auto" = 4 -> GUI 480x270).
//   npx tsx scripts/max1080-poc.ts  ->  exports/size-poc/m1080/functions/{resourcepack,datapack,autotest}.zip + previews
// Layout model (docs/VERIFIED.md s16/s17, minecraft-jar-inspection/references/dialog-layout.md), S = 270, W_gui = 480:
//   width  <= 480 - 32 = 448
//   height: widget = 8 + 9 * lines <= S - 66 = 204  ->  lines <= 21.
//   lines = 1 + ceil(H/9) (+1 if the first line's running advance peaks at W + 1, i.e. an opaque right edge)  ->  H <= 180 as exported today.
//   Dropping one trailing newline (the picture needs ceil(H/9) lines in total) gives H <= 189 = exactly 70% of 270.
// Pages (auto-test order):
//   max_items    SAO page 448x180, exporter output as is            -> predicted: fits, top at 44
//   max_trim     SAO page 448x189, one newline fewer                -> predicted: fits, 70.0% of the height
//   trim_frame   frame page 448x189 (transparent last column), one newline fewer -> predicted: fits
//   over198      frame page 448x198, one newline fewer              -> predicted: scrolls (206 > 204)
//   plain189     frame page 448x189 (transparent last column), NOT trimmed       -> predicted: scrolls (206 > 204)
import { saoItems } from './sao-art';
import { emit, gridPage, saoPage } from './poc-lib';

async function main() {
  const W = 448;
  const a = saoItems(W, 180, 180 / 210);
  const b = saoItems(W, 189, 189 / 210);
  const tf = gridPage('trim_frame', W, 189, `${W}×189`, '1920×1080 自動縮放 (GUI 480×270)：寬 93%、高 70%', { transparentRightCol: true });
  const ov = gridPage('over198', W, 198, `${W}×198`, '再高 9 px：預期出現捲軸', { transparentRightCol: true });
  const pl = gridPage('plain189', W, 189, `${W}×189`, '同尺寸但沒少一行：預期出現捲軸', { transparentRightCol: true });
  await emit(
    'm1080',
    [saoPage('max_items', a, 180 / 210, false), saoPage('max_trim', b, 189 / 210, false), tf.page, ov.page, pl.page],
    [['max_items', a.canvas], ['max_trim', b.canvas], ['trim_frame', tf.canvas], ['over198', ov.canvas], ['plain189', pl.canvas]],
    { trim: ['max_trim', 'trim_frame', 'over198'], interval: 300 },
  );
}

main().catch((e) => { console.error(e); process.exit(1); });
