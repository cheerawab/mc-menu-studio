// Decoded asset images + the shared browser render environment.
import { useEffect, useSyncExternalStore } from 'react';
import type { Asset } from '@/core/model/types';
import type { CanvasLike, ImageLike, RenderEnv } from '@/core/render/types';

interface Entry {
  src: string;
  img: HTMLImageElement;
  ok: boolean;
}

const cache = new Map<string, Entry>();
const listeners = new Set<() => void>();
let version = 0;

function bump() {
  version++;
  listeners.forEach((l) => l());
}

export function ensureImages(assets: Record<string, Asset>) {
  if (typeof Image === 'undefined') return;
  for (const a of Object.values(assets)) {
    const c = cache.get(a.id);
    if (c && c.src === a.dataUrl) continue;
    const entry: Entry = { src: a.dataUrl, img: new Image(), ok: false };
    entry.img.onload = () => {
      entry.ok = true;
      bump();
    };
    entry.img.onerror = bump;
    entry.img.src = a.dataUrl;
    cache.set(a.id, entry);
  }
}

export function loadedImages(assets: Record<string, Asset>): Map<string, ImageLike> {
  const out = new Map<string, ImageLike>();
  for (const id of Object.keys(assets)) {
    const e = cache.get(id);
    if (e?.ok) out.set(id, e.img);
  }
  return out;
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Starts decoding the project's assets; the returned number changes whenever an image finishes loading. */
export function useImagesVersion(assets: Record<string, Asset>): number {
  useEffect(() => ensureImages(assets), [assets]);
  return useSyncExternalStore(subscribe, () => version, () => 0);
}

function makeCanvas(w: number, h: number): CanvasLike {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  return c as unknown as CanvasLike;
}

/** One long-lived environment so the text raster cache survives between renders. */
const sharedEnv: RenderEnv & { images: ReadonlyMap<string, ImageLike> } = { createCanvas: makeCanvas, images: new Map() };

export function renderEnv(assets: Record<string, Asset>): RenderEnv {
  sharedEnv.images = loadedImages(assets);
  return sharedEnv;
}

/** True when the browser can give us a 2D context (false in some test environments). */
export function canvas2dAvailable(): boolean {
  try {
    return typeof document !== 'undefined' && !!document.createElement('canvas').getContext('2d');
  } catch {
    return false;
  }
}
