'use client';

import { Copy, Eye, EyeOff, FileText, Link2, Lock, LockOpen, Plus, Trash } from 'lucide-react';
import { useState, type DragEvent } from 'react';
import { ELEMENT_LABELS, ELEMENT_TYPES, isInteractive } from '@/core/model/defaults';
import { collectLinks } from '@/core/model/ops';
import type { Element, Id } from '@/core/model/types';
import { currentPage, editor, useEditor } from '../state/store';
import { addElementOfType, ELEMENT_HINT, ELEMENT_ICON } from './elementMeta';
import { cx, IconButton } from './ui';

export const DND_ELEMENT = 'application/x-mcms-element';

function Palette() {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {ELEMENT_TYPES.map((t) => {
        const Icon = ELEMENT_ICON[t];
        return (
          <button
            key={t}
            type="button"
            draggable
            title={`${ELEMENT_LABELS[t]}：${ELEMENT_HINT[t]}（點一下加入，或拖到畫布上）`}
            onDragStart={(e) => {
              e.dataTransfer.setData(DND_ELEMENT, t);
              e.dataTransfer.effectAllowed = 'copy';
            }}
            onClick={() => addElementOfType(t)}
            className="group flex h-[52px] flex-col items-center justify-center gap-1 rounded-md border border-ink-700 bg-ink-850 text-fg-muted transition-colors hover:border-accent/50 hover:bg-ink-800 hover:text-fg active:scale-[0.98]"
          >
            <Icon size={16} className="text-fg-muted group-hover:text-accent" />
            <span className="text-[11.5px]">{ELEMENT_LABELS[t]}</span>
          </button>
        );
      })}
    </div>
  );
}

function InlineRename({ value, onDone }: { value: string; onDone: (v: string | null) => void }) {
  const [v, setV] = useState(value);
  return (
    <input
      autoFocus
      aria-label="重新命名"
      className="h-6 w-full min-w-0 rounded border border-accent bg-ink-850 px-1.5 text-[12.5px] text-fg outline-none"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={() => onDone(v.trim() || null)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onDone(v.trim() || null);
        if (e.key === 'Escape') onDone(null);
        e.stopPropagation();
      }}
    />
  );
}

/** Shared drag-to-reorder state for list rows. */
function useReorder(onMove: (fromId: Id, toIndex: number) => void) {
  const [drag, setDrag] = useState<{ id: Id; over: number | null } | null>(null);
  return {
    drag,
    rowProps: (id: Id, index: number) => ({
      draggable: true,
      onDragStart: (e: DragEvent) => {
        e.dataTransfer.setData('text/plain', id);
        e.dataTransfer.effectAllowed = 'move';
        setDrag({ id, over: null });
      },
      onDragOver: (e: DragEvent) => {
        if (!drag) return;
        e.preventDefault();
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const over = e.clientY < r.top + r.height / 2 ? index : index + 1;
        if (drag.over !== over) setDrag({ ...drag, over });
      },
      onDrop: (e: DragEvent) => {
        e.preventDefault();
        if (drag && drag.over !== null) onMove(drag.id, drag.over);
        setDrag(null);
      },
      onDragEnd: () => setDrag(null),
    }),
  };
}

function Pages() {
  const pages = useEditor((s) => s.project.pages);
  const pageId = useEditor((s) => s.pageId);
  const project = useEditor((s) => s.project);
  const [renaming, setRenaming] = useState<Id | null>(null);
  const linksIn = new Map<Id, number>();
  for (const l of collectLinks(project)) if (l.fromPageId !== l.toPageId) linksIn.set(l.toPageId, (linksIn.get(l.toPageId) ?? 0) + 1);
  const { drag, rowProps } = useReorder((id, to) => {
    const from = pages.findIndex((p) => p.id === id);
    editor().movePage(id, to > from ? to - 1 : to);
  });

  return (
    <ul className="flex flex-col gap-0.5" aria-label="頁面列表">
      {pages.map((p, i) => (
        <li
          key={p.id}
          {...rowProps(p.id, i)}
          className={cx(
            'group relative flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-[12.5px]',
            p.id === pageId ? 'bg-ink-700 text-fg' : 'text-fg-muted hover:bg-ink-800 hover:text-fg',
            drag?.over === i && 'shadow-[inset_0_2px_0_var(--color-accent)]',
            drag?.over === i + 1 && i === pages.length - 1 && 'shadow-[inset_0_-2px_0_var(--color-accent)]',
          )}
          onClick={() => editor().setPage(p.id)}
          onDoubleClick={() => setRenaming(p.id)}
          aria-current={p.id === pageId ? 'page' : undefined}
        >
          <FileText size={14} className={p.id === pageId ? 'text-accent' : 'text-fg-dim'} />
          {renaming === p.id ? (
            <InlineRename
              value={p.title}
              onDone={(v) => {
                if (v) editor().updatePage(p.id, { title: v });
                setRenaming(null);
              }}
            />
          ) : (
            <>
              <span className="min-w-0 flex-1 truncate">{p.title || '（無標題）'}</span>
              <span className="font-mono text-[10.5px] text-fg-dim group-hover:hidden">{p.key}</span>
              {(linksIn.get(p.id) ?? 0) > 0 && (
                <span title={`有 ${linksIn.get(p.id)} 個按鈕連到這頁`} className="flex items-center gap-0.5 text-[10.5px] text-fg-dim group-hover:hidden">
                  <Link2 size={11} />
                  {linksIn.get(p.id)}
                </span>
              )}
              <span className="hidden items-center group-hover:flex">
                <IconButton label="複製頁面" size="xs" onClick={(e) => { e.stopPropagation(); editor().duplicatePage(p.id); }}>
                  <Copy size={12} />
                </IconButton>
                <IconButton
                  label="刪除頁面"
                  size="xs"
                  disabled={pages.length <= 1}
                  onClick={(e) => {
                    e.stopPropagation();
                    editor().askConfirm({
                      title: '刪除頁面',
                      message: `確定要刪除「${p.title || p.key}」嗎？連到這頁的按鈕會出現在「檢查」清單中。可以用復原找回。`,
                      confirmLabel: '刪除',
                      danger: true,
                      onConfirm: () => editor().deletePage(p.id),
                    });
                  }}
                >
                  <Trash size={12} />
                </IconButton>
              </span>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

function LayerRow({ el, selected, index, rowProps, dropLine }: {
  el: Element;
  selected: boolean;
  index: number;
  rowProps: ReturnType<ReturnType<typeof useReorder>['rowProps']>;
  dropLine: 'top' | 'bottom' | null;
}) {
  const [renaming, setRenaming] = useState(false);
  const Icon = ELEMENT_ICON[el.type];
  const action = isInteractive(el) && el.action.type !== 'none';
  return (
    <li
      {...rowProps}
      data-index={index}
      className={cx(
        'group flex h-7 cursor-pointer items-center gap-1.5 rounded-md pr-1 pl-2 text-[12.5px]',
        selected ? 'bg-accent/15 text-fg' : 'text-fg-muted hover:bg-ink-800 hover:text-fg',
        el.hidden && 'opacity-50',
        dropLine === 'top' && 'shadow-[inset_0_2px_0_var(--color-accent)]',
        dropLine === 'bottom' && 'shadow-[inset_0_-2px_0_var(--color-accent)]',
      )}
      onClick={(e) => (e.shiftKey || e.metaKey || e.ctrlKey ? editor().toggleSelect(el.id) : editor().select([el.id]))}
      onDoubleClick={() => setRenaming(true)}
      aria-selected={selected}
      role="option"
    >
      <Icon size={13} className={selected ? 'text-accent' : 'text-fg-dim'} />
      {renaming ? (
        <InlineRename
          value={el.name}
          onDone={(v) => {
            if (v) editor().updateElement(el.id, { name: v });
            setRenaming(false);
          }}
        />
      ) : (
        <span className="min-w-0 flex-1 truncate">{el.name}</span>
      )}
      {action && <Link2 size={11} className="shrink-0 text-accent/80" aria-label="有點擊動作" />}
      <IconButton
        label={el.hidden ? '顯示' : '隱藏'}
        size="xs"
        className={cx(!el.hidden && 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100')}
        onClick={(e) => { e.stopPropagation(); editor().updateElement(el.id, { hidden: !el.hidden }); }}
      >
        {el.hidden ? <EyeOff size={12} /> : <Eye size={12} />}
      </IconButton>
      <IconButton
        label={el.locked ? '解除鎖定' : '鎖定'}
        size="xs"
        className={cx(!el.locked && 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100')}
        onClick={(e) => { e.stopPropagation(); editor().updateElement(el.id, { locked: !el.locked }); }}
      >
        {el.locked ? <Lock size={12} /> : <LockOpen size={12} />}
      </IconButton>
    </li>
  );
}

function Layers() {
  const page = useEditor(currentPage);
  const selection = useEditor((s) => s.selection);
  const sel = new Set(selection);
  const top = [...page.elements].reverse();
  const { drag, rowProps } = useReorder((id, toRow) => {
    // rows are top-most first; convert the drop row to a paint-order index
    const n = page.elements.length;
    const from = page.elements.findIndex((e) => e.id === id);
    const fromRow = n - 1 - from;
    const row = toRow > fromRow ? toRow - 1 : toRow;
    editor().reorderLayer(id, n - 1 - row);
  });
  if (!top.length)
    return <p className="px-2 py-6 text-center text-[12px] leading-relaxed text-fg-dim">這一頁還沒有元件。<br />從上方點選或拖曳元件到畫布。</p>;
  return (
    <ul role="listbox" aria-label="圖層" aria-multiselectable className="flex flex-col gap-px">
      {top.map((el, i) => (
        <LayerRow
          key={el.id}
          el={el}
          index={i}
          selected={sel.has(el.id)}
          rowProps={rowProps(el.id, i)}
          dropLine={drag?.over === i ? 'top' : drag?.over === i + 1 && i === top.length - 1 ? 'bottom' : null}
        />
      ))}
    </ul>
  );
}

export default function LeftPanel() {
  const count = useEditor((s) => currentPage(s).elements.length);
  return (
    <aside className="flex w-[244px] shrink-0 flex-col bg-ink-900" aria-label="元件、頁面與圖層">
      <div className="border-b border-line p-3">
        <h2 className="mb-2.5 text-[11.5px] font-semibold tracking-wide text-fg-muted">元件</h2>
        <Palette />
      </div>
      <div className="flex max-h-[34%] min-h-[96px] flex-col border-b border-line">
        <div className="flex items-center justify-between px-3 pt-3 pb-1.5">
          <h2 className="text-[11.5px] font-semibold tracking-wide text-fg-muted">頁面</h2>
          <IconButton label="新增頁面" size="sm" onClick={() => editor().addPage()}>
            <Plus size={14} />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          <Pages />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between px-3 pt-3 pb-1.5">
          <h2 className="text-[11.5px] font-semibold tracking-wide text-fg-muted">圖層</h2>
          <span className="text-[11px] text-fg-dim">{count} 個元件</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          <Layers />
        </div>
      </div>
    </aside>
  );
}
