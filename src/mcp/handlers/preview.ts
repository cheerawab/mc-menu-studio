// Group F (previews, "the agent's eyes"): thin wrappers over render/renderPage.ts, export/png.ts and
// game/chrome.ts. The only MCP-specific code here is picking a default output path and writing the PNG to disk.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { encodePng } from '../../core/export/png';
import { drawGameMock, fitProblem, gameLayout, previewDensity, type WindowPreset } from '../../core/game/chrome';
import { effectiveFooterLabel } from '../../core/model/defaults';
import type { Page, Project, RenderScale } from '../../core/model/types';
import { renderPageToCanvas } from '../../core/render/renderPage';
import { fitScale } from '../../core/render/scale';
import type { RenderEnv } from '../../core/render/types';

export interface PngOutput {
  png: Uint8Array;
  width: number;
  height: number;
}

/** Renders a page exactly like the editor's edit view (placeholders for missing images, project's 解析度 by default). */
export function renderPagePreview(project: Project, page: Page, env: RenderEnv, scale?: RenderScale): PngOutput {
  const s = scale ?? project.settings.renderScale;
  const { canvas } = renderPageToCanvas(page, project, env, { scale: s });
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas is not available');
  const width = page.width * s, height = page.height * s;
  const img = ctx.getImageData(0, 0, width, height);
  return { png: encodePng(width, height, img.data), width, height };
}

export interface GameMockResult extends PngOutput {
  fits: boolean;
  fitsWidth: boolean;
  fitsHeight: boolean;
  /** zh-TW fit warning, or null when the page fits (game/chrome.ts fitProblem). */
  warning: string | null;
}

/** Renders the vanilla dialog mock exactly like the editor's GamePreview.tsx. */
export function renderGameMockPreview(project: Project, page: Page, env: RenderEnv, win: WindowPreset, guiScale: number): GameMockResult {
  const L = gameLayout(win.w, win.h, guiScale, page.width, page.height);
  const renderScale = fitScale(page.width, page.height, project.settings.renderScale);
  const density = previewDensity(renderScale, guiScale);
  const { canvas: pageCanvas } = renderPageToCanvas(page, project, env, { placeholders: false, scale: renderScale });
  const canvas = env.createCanvas(L.guiW * density, L.guiH * density);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas is not available');
  ctx.scale(density, density);
  drawGameMock(ctx, env, L, {
    title: page.title,
    page: pageCanvas,
    fontFamily: project.settings.fontFamily,
    footerLabel: effectiveFooterLabel(page, project),
  });
  const width = L.guiW * density, height = L.guiH * density;
  const img = ctx.getImageData(0, 0, width, height);
  return {
    png: encodePng(width, height, img.data),
    width,
    height,
    fits: L.fitsWidth && L.fitsHeight,
    fitsWidth: L.fitsWidth,
    fitsHeight: L.fitsHeight,
    warning: fitProblem(win, guiScale, page),
  };
}

/** Writes a PNG to disk (creating parent directories) and returns the absolute path. */
export function writePng(path: string, png: Uint8Array): string {
  const abs = resolve(path);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, png);
  return abs;
}

/** Default location for a page's preview PNG, next to the project file (MCP_PLAN.md §7: write-to-path by default). */
export function defaultPreviewPath(projectPath: string, pageKey: string, suffix: string): string {
  return join(dirname(projectPath), 'previews', `${pageKey}${suffix}`);
}

export function toBase64(png: Uint8Array): string {
  return Buffer.from(png).toString('base64');
}
