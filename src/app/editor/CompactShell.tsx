'use client';
// Compact layout (phones, portrait tablets): full-width canvas, a bottom tab bar and one sheet at a time.
// The sheets reuse the desktop panel contents (Palette, Pages, Layers, Inspector, LinkMap, IssuesPanel).
// Portrait: the sheet sits under the canvas (about half the height). Landscape: it docks on the right so the canvas
// keeps its height. Either way it is part of the layout, not an overlay, so the selected element stays visible.

import { Ellipsis, Files, Layers as LayersIcon, ListChecks, Plus, Shapes, SlidersHorizontal, Workflow, X, type LucideIcon } from 'lucide-react';
import { countIssues } from '@/core/model/validate';
import { mobile, useMobile, type SheetId } from '../state/mobile';
import { currentPage, editor, useEditor } from '../state/store';
import CanvasView from './CanvasView';
import GamePreview from './GamePreview';
import Inspector from './Inspector';
import { useLayout } from './layoutTier';
import { Layers, Pages, Palette } from './LeftPanel';
import { IssuesPanel, LinkMap, useIssues } from './RightPanel';
import { SelectionBar } from './TouchControls';
import { cx, IconButton, Segmented } from './ui';

const TABS: { id: SheetId; label: string; icon: LucideIcon }[] = [
  { id: 'elements', label: '元件', icon: Shapes },
  { id: 'pages', label: '頁面', icon: Files },
  { id: 'layers', label: '圖層', icon: LayersIcon },
  { id: 'inspect', label: '屬性', icon: SlidersHorizontal },
  { id: 'more', label: '更多', icon: Ellipsis },
];

function useProblemCount() {
  const c = countIssues(useIssues());
  return { count: c.error + c.warning, error: c.error > 0 };
}

function MorePanel() {
  const tab = useEditor((s) => s.rightTab);
  const issues = useIssues();
  const c = countIssues(issues);
  const sub = tab === 'issues' ? 'issues' : 'links';
  return (
    <div>
      <div className="sticky top-0 z-10 border-b border-line bg-ink-900 px-3 py-2">
        <Segmented<'links' | 'issues'>
          label="連結或檢查"
          size="lg"
          value={sub}
          onChange={(v) => editor().setRightTab(v)}
          options={[
            { value: 'links', label: <><Workflow size={16} /> 連結</> },
            { value: 'issues', label: <><ListChecks size={16} /> 檢查{c.error + c.warning > 0 && `（${c.error + c.warning}）`}</> },
          ]}
        />
      </div>
      {sub === 'links' ? <LinkMap /> : <IssuesPanel issues={issues} />}
    </div>
  );
}

function SheetHeaderExtra({ id }: { id: SheetId }) {
  const count = useEditor((s) => currentPage(s).elements.length);
  if (id === 'pages')
    return (
      <IconButton size="lg" label="新增頁面" onClick={() => editor().addPage()}>
        <Plus size={20} />
      </IconButton>
    );
  if (id === 'layers') return <span className="pr-2 text-[13px] text-fg-dim">{count} 個元件</span>;
  return null;
}

function SheetBody({ id }: { id: SheetId }) {
  switch (id) {
    case 'elements':
      // adding closes the sheet so the new (selected) element is visible with the selection bar
      return <div className="p-3"><Palette onAdd={() => mobile().openSheet(null)} /></div>;
    case 'pages':
      return <div className="p-2"><Pages /></div>;
    case 'layers':
      return <div className="p-2"><Layers /></div>;
    case 'inspect':
      return <Inspector />;
    case 'more':
      return <MorePanel />;
  }
}

function Sheet({ id }: { id: SheetId }) {
  const { landscape } = useLayout();
  const tab = TABS.find((t) => t.id === id)!;
  const title = tab.label;
  return (
    <section
      id={`sheet-${id}`}
      role="dialog"
      aria-label={title}
      className={cx(
        'animate-sheet flex min-h-0 min-w-0 shrink-0 grow-0 flex-col bg-ink-900',
        landscape ? 'basis-[min(380px,50%)] border-l border-line' : 'basis-1/2 border-t border-line',
      )}
    >
      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-line pr-1 pl-4">
        <h2 className="min-w-0 flex-1 truncate text-[15px] font-semibold">{title}</h2>
        <SheetHeaderExtra id={id} />
        <IconButton size="lg" label="關閉面板" onClick={() => mobile().openSheet(null)}>
          <X size={20} />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <SheetBody id={id} />
      </div>
    </section>
  );
}

function TabBar() {
  const { landscape } = useLayout();
  const sheet = useMobile((s) => s.sheet);
  const problems = useProblemCount();
  return (
    <nav aria-label="面板" className="safe-bottom safe-x shrink-0 border-t border-line bg-ink-900">
      <div role="tablist" aria-label="面板" className="flex">
        {TABS.map((t) => {
          const selected = sheet === t.id;
          const badge = t.id === 'more' && problems.count > 0;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={selected}
              aria-controls={selected ? `sheet-${t.id}` : undefined}
              aria-label={landscape ? t.label : undefined}
              title={t.label}
              onClick={() => mobile().toggleSheet(t.id)}
              className={cx(
                'relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[12px] transition-colors',
                landscape ? 'h-11' : 'h-14',
                selected ? 'text-accent' : 'text-fg-muted hover:text-fg',
              )}
            >
              {selected && <span className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-accent" aria-hidden />}
              <span className="relative">
                <t.icon size={landscape ? 20 : 21} />
                {badge && (
                  <span
                    className={cx(
                      'absolute -top-1.5 -right-2.5 min-w-4 rounded-full px-1 text-center text-[10px] leading-4 font-semibold',
                      problems.error ? 'bg-danger text-white' : 'bg-warn text-ink-950',
                    )}
                  >
                    {problems.count}
                  </span>
                )}
              </span>
              {!landscape && <span>{t.label}</span>}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/** Everything below the top bar in the compact layout. */
export default function CompactBody() {
  const { landscape } = useLayout();
  const mode = useEditor((s) => s.view.mode);
  const sheet = useMobile((s) => s.sheet);
  return (
    <>
      <div className={cx('safe-x flex min-h-0 flex-1', landscape ? 'flex-row' : 'flex-col')}>
        <main className="relative min-h-0 min-w-0 flex-1" aria-label={mode === 'edit' ? '編輯畫布' : '遊戲內預覽'}>
          {mode === 'edit' ? <CanvasView /> : <GamePreview />}
          {/* the bar would cover a small canvas; while a sheet is open the sheet has the same actions */}
          {mode === 'edit' && !sheet && <SelectionBar />}
        </main>
        {sheet && <Sheet id={sheet} />}
      </div>
      <TabBar />
    </>
  );
}
