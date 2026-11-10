// Project -> exporter input: renders every page with the shared renderer (browser canvas or @napi-rs/canvas),
// resolves page links to keys, and collects the export checks shown before downloading.
import { effectiveFooterLabel, isInteractive } from '../model/defaults';
import type { Action, Page, Project, RenderScale } from '../model/types';
import { cleanCommand, validateProject, type Issue, type ValidateOptions } from '../model/validate';
import { renderPageToCanvas } from '../render/renderPage';
import { canvasPixels, fitsCanvas, MAX_CANVAS_PIXELS } from '../render/scale';
import type { Ctx2D, RenderEnv } from '../render/types';
import { MAX_PICTURE_WIDTH } from './constants';
import { commandText } from './dialogs';
import { triggerObjective } from './triggers';
import type { CommandMode, ExportAction, ExportMode, ExportPage } from './types';

export type KeyOf = (page: Page) => string;

export function resolveAction(action: Action, project: Project, keyOf: KeyOf = (p) => p.key): ExportAction {
  switch (action.type) {
    case 'page': {
      const target = project.pages.find((p) => p.id === action.pageId);
      return target ? { type: 'page', key: keyOf(target) } : { type: 'none' };
    }
    case 'command':
      return { type: 'command', command: cleanCommand(action.command) };
    default:
      return action;
  }
}

/**
 * Renders all pages of a project for export at `scale` texels per page px (default: the project's 解析度; pass the
 * same value as ExportOptions.scale). `keyOf` lets callers rename page keys (links follow).
 */
export function exportPagesFromProject(
  project: Project,
  env: RenderEnv,
  keyOf: KeyOf = (p) => p.key,
  scale: RenderScale = project.settings.renderScale,
): ExportPage[] {
  return project.pages.map((page) => {
    const { canvas, result } = renderPageToCanvas(page, project, env, { placeholders: false, scale });
    const ctx = canvas.getContext('2d') as Ctx2D;
    const W = page.width * scale, H = page.height * scale;
    const img = ctx.getImageData(0, 0, W, H);
    return {
      key: keyOf(page),
      title: page.title,
      footerLabel: effectiveFooterLabel(page, project),
      image: { width: W, height: H, data: img.data },
      width: page.width,
      height: page.height,
      regions: result.regions.map((r) => ({
        x: r.x, y: r.y, w: r.w, h: r.h,
        action: resolveAction(r.action, project, keyOf),
        tooltip: r.tooltip,
      })),
    };
  });
}

/**
 * Visible buttons whose action runs a command (what the command mode changes): non-empty commands, close and, in
 * functions mode, page links (they run /function).
 */
export function countCommandActions(project: Project, mode: ExportMode): number {
  let n = 0;
  for (const page of project.pages)
    for (const el of page.elements) {
      if (el.hidden || !isInteractive(el)) continue;
      const a = el.action;
      if ((a.type === 'command' && commandText(cleanCommand(a.command))) || a.type === 'close' || (a.type === 'page' && mode === 'functions')) n++;
    }
  return n;
}

export interface ExportCheckOptions extends ValidateOptions {
  /** Packaging mode (default registry): in functions mode page links run /function too. */
  mode?: ExportMode;
  /** Command mode (default direct, like the exporter core). */
  commandMode?: CommandMode;
}

/**
 * Checks shown in the export dialog: the editor's project validation plus export-only rules. Any `error` blocks the
 * download.
 */
export function checkExport(project: Project, opts: ExportCheckOptions = {}): Issue[] {
  const trigger = opts.commandMode === 'trigger';
  // chat commands (say, tell...) only fail in direct mode (DECOMPILED §13); trigger_tick runs them fine
  const issues = validateProject(project, opts).filter((i) => !(trigger && i.code === 'command-chat'));
  if (project.namespace === 'minecraft')
    issues.unshift({ severity: 'error', code: 'export-namespace-minecraft', message: '匯出時命名空間不能是 minecraft（會蓋掉遊戲內建的檔案），請改成自己的名稱。' });
  const scale = project.settings.renderScale;
  for (const page of project.pages) {
    if (page.width > MAX_PICTURE_WIDTH)
      issues.unshift({ severity: 'error', code: 'export-width', pageId: page.id, message: `頁面「${page.title || page.key}」寬度超過遊戲上限 ${MAX_PICTURE_WIDTH} px。` });
    if (!fitsCanvas(page.width, page.height, scale))
      issues.unshift({
        severity: 'error', code: 'export-canvas-size', pageId: page.id,
        message: `頁面「${page.title || page.key}」在 ${scale}x 解析度下是 ${(canvasPixels(page.width, page.height, scale) / 1e6).toFixed(1)} 百萬像素，` +
          `超過瀏覽器畫布上限（${MAX_CANVAS_PIXELS / 1e6} 百萬像素）。請在「解析度」選擇較低的倍數，或縮小頁面。`,
      });
  }
  const n = countCommandActions(project, opts.mode ?? 'registry');
  if (n && trigger)
    issues.push({
      severity: 'info', code: 'export-trigger',
      message: `/trigger：任何玩家都能輸入 /trigger ${triggerObjective(project.namespace)} set <編號> 執行選單裡的 ${n} 個指令動作（不必開啟選單），請不要放只想給管理員使用的指令。`,
    });
  if (n && !trigger)
    issues.push({
      severity: 'warning', code: 'export-direct',
      message: `直接執行：${n} 個指令動作若需要權限（time、weather、gamemode、give、function、dialog…），每次點擊都會跳出 Minecraft 的「確認指令執行」畫面，一般玩家無法使用。建議改用 /trigger。`,
    });
  const hasClose = project.pages.some((p) => p.elements.some((el) => 'action' in el && !el.hidden && el.action.type === 'close'));
  if (hasClose && !trigger)
    issues.push({ severity: 'info', code: 'export-close', message: '「關閉選單」動作會執行 /dialog clear @s，需要指令權限（會跳出確認畫面）；玩家也可以按 Esc 關閉。' });
  return issues;
}
