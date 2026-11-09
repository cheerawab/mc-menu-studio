// Synthetic pages for the trigger-mode tests (no fonts involved, so hashes are stable across machines).
import { createHash } from 'node:crypto';
import type { ExportPage, FileMap } from '../../export/types';

function solid(w: number, h: number, rgba: readonly number[]) {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set(rgba, i * 4);
  for (let x = 0; x < w; x++) data.set([255, 255, 255, 255], x * 4); // a white top row, so tiles differ by row
  return { width: w, height: h, data };
}

/** z-order matters: ids are assigned in order of first appearance (pages in order, regions in z-order). */
export function triggerPages(): ExportPage[] {
  return [
    {
      key: 'menu', title: '選單', footerLabel: '關閉', image: solid(96, 64, [30, 60, 90, 255]),
      regions: [
        { x: 0, y: 8, w: 40, h: 12, action: { type: 'command', command: ' /time set day ' }, tooltip: '白天' },
        { x: 0, y: 24, w: 40, h: 12, action: { type: 'command', command: 'weather clear' }, tooltip: '' },
        { x: 44, y: 8, w: 40, h: 12, action: { type: 'page', key: 'second' }, tooltip: '下一頁' },
        { x: 44, y: 24, w: 40, h: 12, action: { type: 'url', url: 'https://example.com/' }, tooltip: '' },
        { x: 0, y: 40, w: 20, h: 12, action: { type: 'copy', text: 'copied' }, tooltip: '' },
        { x: 24, y: 40, w: 20, h: 12, action: { type: 'command', command: 'time set day' }, tooltip: '同一個指令' },
        { x: 48, y: 40, w: 20, h: 12, action: { type: 'close' }, tooltip: '' },
        { x: 72, y: 40, w: 20, h: 12, action: { type: 'command', command: '   ' }, tooltip: '空指令只剩提示' },
        { x: 200, y: 200, w: 10, h: 10, action: { type: 'command', command: 'kill @s' }, tooltip: '' },
      ],
    },
    {
      key: 'second', title: '第二頁', footerLabel: '返回', image: solid(64, 40, [90, 30, 60, 255]),
      regions: [
        { x: 0, y: 8, w: 30, h: 12, action: { type: 'page', key: 'menu' }, tooltip: '' },
        { x: 32, y: 8, w: 30, h: 12, action: { type: 'command', command: 'give @s minecraft:diamond 1' }, tooltip: '' },
        { x: 0, y: 24, w: 30, h: 12, action: { type: 'close' }, tooltip: '' },
        { x: 32, y: 24, w: 30, h: 12, action: { type: 'page', key: 'second' }, tooltip: '' },
      ],
    },
  ];
}

/** SHA-1 over the sorted entries of a file map (name, NUL, bytes). */
export function fileMapHash(files: FileMap): string {
  const h = createHash('sha1');
  for (const name of [...files.keys()].sort()) {
    h.update(name);
    h.update('\0');
    h.update(files.get(name)!);
  }
  return h.digest('hex');
}
