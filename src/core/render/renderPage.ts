// Page renderer: draws a page into any Canvas-2D-compatible context and returns its click regions.
import { clipRect } from '../geometry';
import { isInteractive } from '../model/defaults';
import type { Page, Project, Region } from '../model/types';
import { getSkin, skinKit } from '../skins';
import { drawElement, type DrawContext } from './elements';
import { fill } from './pixel';
import { checkRenderScale } from './scale';
import type { CanvasLike, Ctx2D, RenderEnv, RenderOptions, RenderResult } from './types';

/**
 * Interactive regions in page pixels, in paint order (later = on top, wins clicks).
 * Hidden elements are skipped; rects are clipped to the page.
 */
export function computeRegions(page: Page): Region[] {
  const out: Region[] = [];
  for (const el of page.elements) {
    if (el.hidden || !isInteractive(el)) continue;
    if (el.action.type === 'none' && !el.tooltip.trim()) continue;
    const r = clipRect(el, page.width, page.height);
    if (!r) continue;
    out.push({ elementId: el.id, ...r, action: el.action, tooltip: el.tooltip });
  }
  return out;
}

/**
 * Draws a page in page px. With `opts.scale` = s > 1 the context's transform is multiplied by s first (restored at the
 * end), so the target canvas must be s times the page size: shapes, skins and icons become s x s blocks, images are
 * sampled at the higher resolution and text is rasterised at s times its font size (see drawText).
 */
export function renderPage(
  ctx: Ctx2D,
  page: Page,
  project: Project,
  env: RenderEnv,
  opts: RenderOptions = {},
): RenderResult {
  const { placeholders = true, clear = true } = opts;
  const scale = checkRenderScale(opts.scale ?? 1);
  const skin = getSkin(project.skinId);
  const dc: DrawContext = { skin, kit: skinKit(skin, project.settings.accent), env, project, placeholders, scale };
  ctx.save();
  if (scale !== 1) ctx.scale(scale, scale);
  if (clear) ctx.clearRect(0, 0, page.width, page.height);
  ctx.beginPath();
  ctx.rect(0, 0, page.width, page.height);
  ctx.clip();
  if (page.bgColor) fill(ctx, 0, 0, page.width, page.height, page.bgColor);
  for (const el of page.elements) {
    if (el.hidden || el.opacity <= 0) continue;
    ctx.save();
    ctx.beginPath();
    ctx.rect(el.x, el.y, el.w, el.h);
    ctx.clip();
    ctx.globalAlpha = el.opacity;
    drawElement(ctx, el, dc);
    ctx.restore();
  }
  ctx.restore();
  return { width: page.width, height: page.height, regions: computeRegions(page) };
}

/** Renders a page into a fresh canvas of the page size times `opts.scale` (default 1). */
export function renderPageToCanvas(
  page: Page,
  project: Project,
  env: RenderEnv,
  opts: RenderOptions = {},
): { canvas: CanvasLike; result: RenderResult } {
  const scale = checkRenderScale(opts.scale ?? 1);
  const canvas = env.createCanvas(page.width * scale, page.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas is not available');
  return { canvas, result: renderPage(ctx, page, project, env, opts) };
}
