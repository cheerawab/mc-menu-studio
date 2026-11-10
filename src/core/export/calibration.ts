// Calibration page for real-game checks (idea of the spike's grid_scene): 256x160, 16 px grid, coloured corner
// squares, centre cross, checker, gradient bar, plus a few test regions (corners, checker, gradient > 128 px).
import type { RgbaImage, ExportPage, ExportRegion } from './types';

export const CALIBRATION_KEY = 'calibration';
export const CALIBRATION_SIZE = { w: 256, h: 160 } as const;

type RGB = readonly [number, number, number];

export function calibrationImage(): { width: number; height: number; data: Uint8Array } {
  const { w: W, h: H } = CALIBRATION_SIZE;
  const data = new Uint8Array(W * H * 4);
  const rect = (x: number, y: number, w: number, h: number, [r, g, b]: RGB) => {
    for (let j = Math.max(0, y); j < Math.min(H, y + h); j++)
      for (let i = Math.max(0, x); i < Math.min(W, x + w); i++) data.set([r, g, b, 255], (j * W + i) * 4);
  };
  rect(0, 0, W, H, [20, 24, 40]);
  for (let x = 0; x < W; x += 16) rect(x, 0, 1, H, [70, 80, 120]);
  for (let y = 0; y < H; y += 16) rect(0, y, W, 1, [70, 80, 120]);
  const white: RGB = [255, 255, 255];
  rect(0, 0, W, 1, white);
  rect(0, H - 1, W, 1, white);
  rect(0, 0, 1, H, white);
  rect(W - 1, 0, 1, H, white);
  rect(1, 1, 8, 8, [255, 0, 0]);
  rect(247, 1, 8, 8, [0, 255, 0]);
  rect(1, 151, 8, 8, [0, 128, 255]);
  rect(247, 151, 8, 8, [255, 255, 0]);
  rect(127, 8, 1, 144, [255, 0, 255]);
  rect(8, 79, 240, 1, [255, 0, 255]);
  for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) if ((i + j) % 2 === 0) rect(100 + i * 2, 100 + j * 2, 2, 2, white);
  for (let x = 0; x < W; x++) rect(x, 140, 1, 6, [x, 255 - x, 128]);
  return { width: W, height: H, data };
}

/** Nearest-neighbour upscale (each pixel becomes scale x scale texels). */
export function upscaleImage(img: RgbaImage, scale: number): RgbaImage {
  if (scale === 1) return img;
  const W = img.width * scale, H = img.height * scale;
  const data = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    const row = Math.floor(y / scale) * img.width;
    for (let x = 0; x < W; x++) {
      const s = (row + Math.floor(x / scale)) * 4;
      data.set(img.data.subarray(s, s + 4), (y * W + x) * 4);
    }
  }
  return { width: W, height: H, data };
}

/**
 * The calibration page. `linkKey` (optional) is the page the bottom-left square opens. At `scale` > 1 the 1x picture
 * is upscaled nearest-neighbour (same grid, same page px), so it checks the tile cells of that export.
 */
export function calibrationPage(linkKey?: string, scale = 1): ExportPage {
  const regions: ExportRegion[] = [
    { x: 1, y: 1, w: 8, h: 8, action: { type: 'copy', text: 'MCMS calibration: top-left' }, tooltip: '左上角 8×8：複製文字' },
    { x: 247, y: 1, w: 8, h: 8, action: { type: 'command', command: 'random value 1..6' }, tooltip: '右上角 8×8：/random value 1..6' },
    {
      x: 1, y: 151, w: 8, h: 8,
      action: linkKey ? { type: 'page', key: linkKey } : { type: 'none' },
      tooltip: linkKey ? `左下角 8×8：開啟頁面 ${linkKey}` : '左下角 8×8',
    },
    { x: 247, y: 151, w: 8, h: 8, action: { type: 'none' }, tooltip: '右下角 8×8：只有提示文字' },
    { x: 100, y: 100, w: 16, h: 16, action: { type: 'close' }, tooltip: '棋盤格 16×16：關閉選單（/dialog clear @s）' },
    { x: 0, y: 140, w: 256, h: 6, action: { type: 'command', command: 'random value 1..100' }, tooltip: '漸層條 256×6：拆成兩個 128×6 點擊區\n/random value 1..100' },
  ];
  const { w, h } = CALIBRATION_SIZE;
  const image = upscaleImage(calibrationImage(), scale);
  return { key: CALIBRATION_KEY, title: '校準頁 calibration', footerLabel: '關閉', image, width: w, height: h, regions };
}
