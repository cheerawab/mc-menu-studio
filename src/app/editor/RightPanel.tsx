'use client';

import {
  ArrowRight, CircleCheck, CircleExclamationPoint, ClipboardCopy, ExternalLink, Info, ListChecks, LogOut, SlidersHorizontal,
  Terminal, TriangleExclamationPoint, Workflow,
} from 'lucide-react';
import { useMemo } from 'react';
import { fitProblem, WINDOW_PRESETS } from '@/core/game/chrome';
import { isInteractive } from '@/core/model/defaults';
import type { Action, Id, Page } from '@/core/model/types';
import { countIssues, validateProject, type Issue } from '@/core/model/validate';
import { editor, useEditor } from '../state/store';
import Inspector from './Inspector';
import { cx } from './ui';

function useIssues(): Issue[] {
  const project = useEditor((s) => s.project);
  const guiScale = useEditor((s) => s.view.guiScale);
  const windowId = useEditor((s) => s.view.windowId);
  return useMemo(() => {
    const win = WINDOW_PRESETS.find((w) => w.id === windowId) ?? WINDOW_PRESETS[1];
    return validateProject(project, { fitCheck: (page: Page) => fitProblem(win, guiScale, page) });
  }, [project, guiScale, windowId]);
}

function goTo(pageId?: Id, elementId?: Id) {
  const s = editor();
  if (pageId) s.setPage(pageId);
  if (elementId) s.select([elementId]);
}

function actionSummary(a: Action, pages: Page[]): { icon: typeof Terminal; text: string } {
  switch (a.type) {
    case 'page': {
      const t = pages.find((p) => p.id === a.pageId);
      return { icon: ArrowRight, text: t ? `開啟「${t.title || t.key}」` : '連到已刪除的頁面' };
    }
    case 'command':
      return { icon: Terminal, text: `/${a.command || '（空白指令）'}` };
    case 'url':
      return { icon: ExternalLink, text: a.url };
    case 'copy':
      return { icon: ClipboardCopy, text: `複製「${a.text}」` };
    case 'close':
      return { icon: LogOut, text: '關閉選單' };
    default:
      return { icon: Info, text: '只有提示文字' };
  }
}

function LinkMap() {
  const project = useEditor((s) => s.project);
  const current = useEditor((s) => s.pageId);
  const incoming = new Map<Id, number>();
  for (const p of project.pages)
    for (const e of p.elements)
      if (isInteractive(e) && e.action.type === 'page' && e.action.pageId !== p.id) incoming.set(e.action.pageId, (incoming.get(e.action.pageId) ?? 0) + 1);
  return (
    <div className="flex flex-col gap-2 p-3">
      <p className="text-[11.5px] leading-relaxed text-fg-dim">每個頁面上可點擊的元件與它們的動作。點一下即可跳到該元件。</p>
      {project.pages.map((p, i) => {
        const items = p.elements.filter((e) => isInteractive(e) && (e.action.type !== 'none' || e.tooltip.trim()));
        return (
          <div key={p.id} className={cx('rounded-lg border bg-ink-850', p.id === current ? 'border-accent/50' : 'border-ink-700')}>
            <button type="button" onClick={() => goTo(p.id)} className="flex w-full items-center gap-2 border-b border-line px-2.5 py-2 text-left">
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{p.title || '（無標題）'}</span>
              {i === 0 && <span className="rounded bg-accent/15 px-1.5 text-[10.5px] text-accent">入口</span>}
              <span className="font-mono text-[10.5px] text-fg-dim">{p.key}</span>
            </button>
            <div className="px-1 py-1">
              {items.length === 0 && <p className="px-1.5 py-1 text-[11.5px] text-fg-dim">沒有可點擊的元件</p>}
              {items.map((e) => {
                if (!isInteractive(e)) return null;
                const { icon: Icon, text } = actionSummary(e.action, project.pages);
                const broken = e.action.type === 'page' && !project.pages.some((x) => x.id === (e.action as { pageId: Id }).pageId);
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => goTo(p.id, e.id)}
                    className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-[11.5px] hover:bg-ink-750"
                  >
                    <span className="w-20 shrink-0 truncate text-fg-muted">{e.name}</span>
                    <Icon size={12} className={cx('shrink-0', broken ? 'text-danger' : e.action.type === 'page' ? 'text-accent' : 'text-fg-dim')} />
                    <span className={cx('min-w-0 flex-1 truncate', broken ? 'text-danger' : 'text-fg')}>{text}</span>
                  </button>
                );
              })}
            </div>
            <div className="border-t border-line px-2.5 py-1.5 text-[10.5px] text-fg-dim">
              {incoming.get(p.id) ? `有 ${incoming.get(p.id)} 個按鈕連到這頁` : i === 0 ? '從指令或快捷鍵開啟' : '沒有按鈕連到這頁'}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const SEV = {
  error: { icon: CircleExclamationPoint, cls: 'text-danger', label: '錯誤' },
  warning: { icon: TriangleExclamationPoint, cls: 'text-warn', label: '警告' },
  info: { icon: Info, cls: 'text-info', label: '提示' },
} as const;

function IssuesPanel({ issues }: { issues: Issue[] }) {
  const c = countIssues(issues);
  return (
    <div className="flex flex-col gap-3 p-3">
      {c.error + c.warning === 0 ? (
        <div className="flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2.5 text-[12.5px] text-accent">
          <CircleCheck size={16} /> 沒有發現錯誤或警告，可以準備匯出。
        </div>
      ) : (
        <div className="flex gap-2 text-[12px]">
          <span className="rounded-md bg-danger/12 px-2 py-1 text-danger">錯誤 {c.error}</span>
          <span className="rounded-md bg-warn/12 px-2 py-1 text-warn">警告 {c.warning}</span>
          <span className="rounded-md bg-info/12 px-2 py-1 text-info">提示 {c.info}</span>
        </div>
      )}
      <ul className="flex flex-col gap-1">
        {issues.map((i, k) => {
          const s = SEV[i.severity];
          return (
            <li key={`${i.code}-${i.elementId ?? i.pageId ?? ''}-${k}`}>
              <button
                type="button"
                onClick={() => goTo(i.pageId, i.elementId)}
                className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-[12px] leading-snug hover:bg-ink-800"
              >
                <s.icon size={14} className={cx('mt-px shrink-0', s.cls)} aria-label={s.label} />
                <span className="text-fg">{i.message}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="rounded-lg border border-ink-700 bg-ink-850 p-3 text-[11.5px] leading-relaxed text-fg-muted">
        <div className="mb-1.5 font-medium text-fg">靜態匯出的限制</div>
        <ul className="list-disc space-y-1 pl-4">
          <li>按鈕在遊戲中沒有滑過或按下的變化，只能顯示提示文字。</li>
          <li>畫面內容是固定圖片：沒有即時數值、輸入框或動畫，畫面內也不能捲動。</li>
          <li>「執行指令」以玩家身分執行：單人遊戲需開啟作弊；伺服器上只能執行玩家有權限的指令。</li>
          <li>對話框標題列與底部按鈕由遊戲繪製，無法移除；玩家永遠可以按 Esc 關閉。</li>
          <li>玩家若沒有載入資源包，只會看到亂碼方塊，請在說明中提醒玩家。</li>
        </ul>
      </div>
    </div>
  );
}

export default function RightPanel() {
  const tab = useEditor((s) => s.rightTab);
  const issues = useIssues();
  const c = countIssues(issues);
  const tabs = [
    { id: 'inspect' as const, label: '屬性', icon: SlidersHorizontal },
    { id: 'links' as const, label: '連結', icon: Workflow },
    { id: 'issues' as const, label: '檢查', icon: ListChecks },
  ];
  return (
    <aside className="flex w-[304px] shrink-0 flex-col bg-ink-900" aria-label="屬性面板">
      <div role="tablist" aria-label="右側面板" className="flex h-10 shrink-0 items-end gap-1 border-b border-line px-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => editor().setRightTab(t.id)}
            className={cx(
              '-mb-px flex h-9 items-center gap-1.5 border-b-2 px-2.5 text-[12.5px] transition-colors',
              tab === t.id ? 'border-accent text-fg' : 'border-transparent text-fg-muted hover:text-fg',
            )}
          >
            <t.icon size={14} />
            {t.label}
            {t.id === 'issues' && c.error + c.warning > 0 && (
              <span className={cx('rounded-full px-1.5 text-[10.5px] font-semibold', c.error ? 'bg-danger text-white' : 'bg-warn text-ink-950')}>
                {c.error + c.warning}
              </span>
            )}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'inspect' && <Inspector />}
        {tab === 'links' && <LinkMap />}
        {tab === 'issues' && <IssuesPanel issues={issues} />}
      </div>
    </aside>
  );
}
