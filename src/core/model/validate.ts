// Project validation for the 檢查 panel. Messages are user-facing (zh-TW).
import { DEFAULT_FOOTER_LABEL, ELEMENT_LABELS, isInteractive, PAGE_LIMITS } from './defaults';
import { KEY_RE } from './ids';
import type { Action, Element, Id, Page, Project } from './types';

export type Severity = 'error' | 'warning' | 'info';

export interface Issue {
  severity: Severity;
  code: string;
  message: string;
  pageId?: Id;
  elementId?: Id;
}

export const NAMESPACE_RE = KEY_RE;

/** Commands that run_command cannot execute from a click (chat-signing commands). */
const CHAT_COMMANDS = new Set(['say', 'tell', 'msg', 'w', 'me', 'teammsg', 'tm']);
export const MAX_COMMAND_LENGTH = 256;

export interface ActionProblem {
  severity: Severity;
  code: string;
  message: string;
}

/** Normalises user input for a command: trims and removes one leading slash. */
export function cleanCommand(input: string): string {
  return input.trim().replace(/^\//, '');
}

export function validateAction(action: Action, project: Project, ownPageId?: Id): ActionProblem | null {
  switch (action.type) {
    case 'none':
    case 'close':
      return null;
    case 'page': {
      if (!action.pageId) return { severity: 'error', code: 'page-empty', message: '尚未選擇要開啟的頁面。' };
      if (!project.pages.some((p) => p.id === action.pageId))
        return { severity: 'error', code: 'page-dangling', message: '連結的頁面已不存在。' };
      if (action.pageId === ownPageId)
        return { severity: 'warning', code: 'page-self', message: '連到目前這一頁，點了畫面不會改變。' };
      return null;
    }
    case 'command': {
      const cmd = cleanCommand(action.command);
      if (!cmd) return { severity: 'error', code: 'command-empty', message: '指令是空的。' };
      if (/[\r\n]/.test(action.command))
        return { severity: 'error', code: 'command-newline', message: '指令不能包含換行。' };
      const head = cmd.split(/\s+/)[0].toLowerCase().replace(/^minecraft:/, '');
      if (CHAT_COMMANDS.has(head))
        return {
          severity: 'warning',
          code: 'command-chat',
          message: `「/${head}」屬於聊天指令，從選單點擊時遊戲不會執行。`,
        };
      if (cmd.length > MAX_COMMAND_LENGTH)
        return { severity: 'warning', code: 'command-long', message: `指令超過 ${MAX_COMMAND_LENGTH} 個字元，可能無法執行。` };
      return null;
    }
    case 'url': {
      const url = action.url.trim();
      if (!url) return { severity: 'error', code: 'url-empty', message: '網址是空的。' };
      if (!/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(url))
        return { severity: 'error', code: 'url-invalid', message: '網址必須以 http:// 或 https:// 開頭。' };
      return null;
    }
    case 'copy':
      if (!action.text) return { severity: 'warning', code: 'copy-empty', message: '要複製的文字是空的。' };
      return null;
  }
}

/**
 * Rough width of a label in the game's default font (CJK/full-width glyphs ~9 px, others ~6 px). [TEST] estimate,
 * only used to warn about footer labels that may not fit the 150 px footer button.
 */
export function estimateGameTextWidth(s: string): number {
  let w = 0;
  for (const ch of s) w += ch.codePointAt(0)! >= 0x2e80 ? 9 : 6;
  return w;
}
export const FOOTER_LABEL_MAX_WIDTH = 140;

function elementLabel(el: Element) {
  return el.name || ELEMENT_LABELS[el.type];
}

export interface ValidateOptions {
  /** Optional extra page check (e.g. "does not fit the chosen window"); return a message or null. */
  fitCheck?: (page: Page) => string | null;
}

export function validateProject(project: Project, opts: ValidateOptions = {}): Issue[] {
  const issues: Issue[] = [];
  const add = (i: Issue) => issues.push(i);

  if (!NAMESPACE_RE.test(project.namespace))
    add({ severity: 'error', code: 'namespace', message: `命名空間「${project.namespace}」只能使用小寫英文字母、數字與底線。` });
  else if (project.namespace === 'minecraft')
    add({ severity: 'warning', code: 'namespace-minecraft', message: '命名空間不建議使用 minecraft，請改成自己的名稱。' });

  if (!project.pages.length) add({ severity: 'error', code: 'no-pages', message: '專案至少需要一個頁面。' });

  const footer = project.settings.footerLabel.trim();
  if (!footer)
    add({ severity: 'warning', code: 'footer-empty', message: `下方按鈕的預設文字是空的，匯出時會使用「${DEFAULT_FOOTER_LABEL}」。` });
  else if (estimateGameTextWidth(footer) > FOOTER_LABEL_MAX_WIDTH)
    add({ severity: 'warning', code: 'footer-long', message: `下方按鈕的預設文字「${footer}」太長，可能超出遊戲按鈕的寬度。` });

  const keyCount = new Map<string, number>();
  for (const p of project.pages) keyCount.set(p.key, (keyCount.get(p.key) ?? 0) + 1);

  const linkedTo = new Set<Id>();
  for (const page of project.pages)
    for (const el of page.elements)
      if (isInteractive(el) && el.action.type === 'page' && el.action.pageId !== page.id) linkedTo.add(el.action.pageId);

  project.pages.forEach((page, index) => {
    const pageId = page.id;
    const where = `「${page.title || page.key}」`;
    if (!KEY_RE.test(page.key))
      add({ severity: 'error', code: 'page-key', pageId, message: `頁面${where}的檔名「${page.key}」只能使用小寫英文字母、數字與底線。` });
    if ((keyCount.get(page.key) ?? 0) > 1)
      add({ severity: 'error', code: 'page-key-dup', pageId, message: `頁面檔名「${page.key}」重複了，每頁都需要不同的檔名。` });
    if (!page.title.trim())
      add({ severity: 'warning', code: 'page-title', pageId, message: `頁面「${page.key}」沒有標題，遊戲的標題列會是空的。` });
    if (page.width > PAGE_LIMITS.maxW || page.height > PAGE_LIMITS.maxH)
      add({
        severity: 'error', code: 'page-size', pageId,
        message: `頁面${where}尺寸 ${page.width}×${page.height} 超過上限 ${PAGE_LIMITS.maxW}×${PAGE_LIMITS.maxH}。`,
      });
    if (page.width < PAGE_LIMITS.minW || page.height < PAGE_LIMITS.minH)
      add({ severity: 'error', code: 'page-small', pageId, message: `頁面${where}太小（至少 ${PAGE_LIMITS.minW}×${PAGE_LIMITS.minH}）。` });
    if (index > 0 && !linkedTo.has(page.id))
      add({ severity: 'info', code: 'page-unreachable', pageId, message: `沒有按鈕連到頁面${where}，玩家只能用指令開啟它。` });
    if (page.footerLabel !== null && estimateGameTextWidth(page.footerLabel.trim()) > FOOTER_LABEL_MAX_WIDTH)
      add({ severity: 'warning', code: 'footer-long', pageId, message: `頁面${where}的下方按鈕文字「${page.footerLabel.trim()}」太長，可能超出遊戲按鈕的寬度。` });
    const fit = opts.fitCheck?.(page);
    if (fit) add({ severity: 'warning', code: 'page-fit', pageId, message: `頁面${where}：${fit}` });

    for (const el of page.elements) {
      const elementId = el.id;
      const name = `${where}的「${elementLabel(el)}」`;
      const inside = el.x < page.width && el.y < page.height && el.x + el.w > 0 && el.y + el.h > 0;
      if (!inside)
        add({ severity: 'warning', code: 'el-outside', pageId, elementId, message: `${name}完全在頁面外，不會顯示。` });
      else if (el.x < 0 || el.y < 0 || el.x + el.w > page.width || el.y + el.h > page.height)
        add({ severity: 'info', code: 'el-clipped', pageId, elementId, message: `${name}超出頁面邊界，超出的部分會被裁掉。` });
      if (el.type === 'image') {
        if (!el.assetId) add({ severity: 'warning', code: 'image-empty', pageId, elementId, message: `${name}還沒有選擇圖片。` });
        else if (!project.assets[el.assetId])
          add({ severity: 'error', code: 'image-missing', pageId, elementId, message: `${name}使用的圖片素材已不存在。` });
      }
      if (isInteractive(el)) {
        const problem = validateAction(el.action, project, page.id);
        if (problem) add({ ...problem, pageId, elementId, message: `${name}：${problem.message}` });
        if (el.hidden && el.action.type !== 'none')
          add({ severity: 'info', code: 'el-hidden-action', pageId, elementId, message: `${name}已隱藏，它的點擊動作不會匯出。` });
      }
    }
  });
  const order: Record<Severity, number> = { error: 0, warning: 1, info: 2 };
  return issues.sort((a, b) => order[a.severity] - order[b.severity]);
}

export function countIssues(issues: Issue[]): Record<Severity, number> {
  const c: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
  for (const i of issues) c[i.severity]++;
  return c;
}
