// Minimal 2D context surface used by the renderer, so that the browser's CanvasRenderingContext2D
// and @napi-rs/canvas (Node) both fit without importing either.
import type { Region } from '../model/types';

export interface ImageDataLike {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

export interface Ctx2D {
  fillStyle: string | object;
  strokeStyle: string | object;
  globalAlpha: number;
  imageSmoothingEnabled: boolean;
  font: string;
  textAlign: string;
  textBaseline: string;
  save(): void;
  restore(): void;
  /** Multiplies the current transform (renderPage uses it to draw page px at `scale` texels each). */
  scale(x: number, y: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  rect(x: number, y: number, w: number, h: number): void;
  clip(): void;
  fillText(text: string, x: number, y: number): void;
  measureText(text: string): { width: number };
  drawImage(image: object, dx: number, dy: number): void;
  drawImage(image: object, dx: number, dy: number, dw: number, dh: number): void;
  drawImage(image: object, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number): void;
  getImageData(sx: number, sy: number, sw: number, sh: number): ImageDataLike;
  putImageData(data: ImageDataLike, dx: number, dy: number): void;
  createImageData(w: number, h: number): ImageDataLike;
}

export interface CanvasLike {
  width: number;
  height: number;
  getContext(type: '2d'): Ctx2D | null;
}

/** Image sources must expose their natural size. */
export interface ImageLike {
  width: number;
  height: number;
}

export interface RenderEnv {
  /** Creates a scratch canvas (DOM canvas in the browser, @napi-rs/canvas in Node). */
  createCanvas(w: number, h: number): CanvasLike;
  /** Decoded project assets by asset id. Missing entries draw a placeholder (editor) or nothing (export). */
  images?: ReadonlyMap<string, ImageLike>;
}

export interface RenderOptions {
  /** Draw placeholders for images without a loaded asset (editor only). Default true. */
  placeholders?: boolean;
  /** Clear the canvas area of the page first. Default true. */
  clear?: boolean;
  /**
   * Texels per page px (1-4, default 1). `renderPage` multiplies the context's transform by it, so every element is
   * still drawn in page px; the target must be `page.width * scale` x `page.height * scale` texels.
   */
  scale?: number;
}

export interface RenderResult {
  width: number;
  height: number;
  regions: Region[];
}
