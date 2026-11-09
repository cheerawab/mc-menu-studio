// Project -> exporter input: renders every page with the shared renderer (browser canvas or @napi-rs/canvas),
// resolves page links to keys, and collects the export checks shown before downloading.
import { effectiveFooterLabel } from '../model/defaults';
import type { Action, Page, Project } from '../model/types';
import { cleanCommand, validateProject, type Issue, type ValidateOptions } from '../model/validate';
import { renderPageToCanvas } from '../render/renderPage';
import type { Ctx2D, RenderEnv } from '../render/types';
import { MAX_PICTURE_WIDTH } from './constants';
import type { ExportAction, ExportPage } from './types';

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

/** Renders all pages of a project for export. `keyOf` lets callers rename page keys (links follow). */
export function exportPagesFromProject(project: Project, env: RenderEnv, keyOf: KeyOf = (p) => p.key): ExportPage[] {
  return project.pages.map((page) => {
    const { canvas, result } = renderPageToCanvas(page, project, env, { placeholders: false });
    const ctx = canvas.getContext('2d') as Ctx2D;
    const img = ctx.getImageData(0, 0, page.width, page.height);
    return {
      key: keyOf(page),
      title: page.title,
      footerLabel: effectiveFooterLabel(page, project),
      image: { width: page.width, height: page.height, data: img.data },
      regions: result.regions.map((r) => ({
        x: r.x, y: r.y, w: r.w, h: r.h,
        action: resolveAction(r.action, project, keyOf),
        tooltip: r.tooltip,
      })),
    };
  });
}

/**
 * Checks shown in the export dialog: the editor's project validation plus export-only rules. Any `error` blocks the
 * download.
 */
export function checkExport(project: Project, opts: ValidateOptions = {}): Issue[] {
  const issues = validateProject(project, opts);
  if (project.namespace === 'minecraft')
    issues.unshift({ severity: 'error', code: 'export-namespace-minecraft', message: '匯出時命名空間不能是 minecraft（會蓋掉遊戲內建的檔案），請改成自己的名稱。' });
  for (const page of project.pages)
    if (page.width > MAX_PICTURE_WIDTH)
      issues.unshift({ severity: 'error', code: 'export-width', pageId: page.id, message: `頁面「${page.title || page.key}」寬度超過遊戲上限 ${MAX_PICTURE_WIDTH} px。` });
  const hasClose = project.pages.some((p) => p.elements.some((el) => 'action' in el && !el.hidden && el.action.type === 'close'));
  if (hasClose)
    issues.push({ severity: 'info', code: 'export-close', message: '「關閉選單」動作會執行 /dialog clear @s，需要指令權限（單人需開啟作弊）；玩家也可以按 Esc 或下方按鈕關閉。' });
  return issues;
}
