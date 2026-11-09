// Small data-URL previews of the built-in icons for pickers.
import type { IconId } from '@/core/model/types';
import { drawIcon } from '@/core/render/icons';
import type { Ctx2D } from '@/core/render/types';

const cache = new Map<string, string>();
const EMPTY = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

export function iconDataUrl(id: IconId, tint: string | null = null): string {
  const key = `${id}|${tint ?? ''}`;
  const hit = cache.get(key);
  if (hit) return hit;
  if (typeof document === 'undefined') return EMPTY;
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 16;
  const ctx = c.getContext('2d');
  if (!ctx) return EMPTY;
  drawIcon(ctx as unknown as Ctx2D, id, 0, 0, 1, tint);
  const url = c.toDataURL('image/png');
  cache.set(key, url);
  return url;
}
