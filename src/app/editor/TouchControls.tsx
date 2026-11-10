'use client';
// Touch replacements for the keyboard shortcuts and the hover-only toolbar: the floating selection bar.

import {
  AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignHorizontalDistributeCenter,
  AlignStartHorizontal, AlignStartVertical, AlignVerticalDistributeCenter, ArrowDown, ArrowDownToLine, ArrowLeft,
  ArrowRight, ArrowUp, ArrowUpToLine, ChevronDown, ChevronUp, Copy, SquareDashedMousePointer, Trash,
} from 'lucide-react';
import { useState } from 'react';
import { mobile, useMobile } from '../state/mobile';
import { editor, useEditor } from '../state/store';
import { IconButton } from './ui';

/** The six align buttons and the two distribute buttons (canvas toolbar and the selection bar's 對齊 row). */
export function AlignButtons({ nSel, size = 'md' }: { nSel: number; size?: 'md' | 'lg' }) {
  const i = size === 'lg' ? 18 : 15;
  return (
    <>
      <IconButton size={size} label={nSel > 1 ? '靠左對齊' : '對齊頁面左緣'} disabled={!nSel} onClick={() => editor().align('left')}><AlignStartVertical size={i} /></IconButton>
      <IconButton size={size} label={nSel > 1 ? '水平置中' : '頁面水平置中'} disabled={!nSel} onClick={() => editor().align('hcenter')}><AlignCenterVertical size={i} /></IconButton>
      <IconButton size={size} label={nSel > 1 ? '靠右對齊' : '對齊頁面右緣'} disabled={!nSel} onClick={() => editor().align('right')}><AlignEndVertical size={i} /></IconButton>
      <IconButton size={size} label={nSel > 1 ? '靠上對齊' : '對齊頁面上緣'} disabled={!nSel} onClick={() => editor().align('top')}><AlignStartHorizontal size={i} /></IconButton>
      <IconButton size={size} label={nSel > 1 ? '垂直置中' : '頁面垂直置中'} disabled={!nSel} onClick={() => editor().align('vmiddle')}><AlignCenterHorizontal size={i} /></IconButton>
      <IconButton size={size} label={nSel > 1 ? '靠下對齊' : '對齊頁面下緣'} disabled={!nSel} onClick={() => editor().align('bottom')}><AlignEndHorizontal size={i} /></IconButton>
      <IconButton size={size} label="水平平均分布（至少 3 個）" disabled={nSel < 3} onClick={() => editor().distribute('h')}><AlignHorizontalDistributeCenter size={i} /></IconButton>
      <IconButton size={size} label="垂直平均分布（至少 3 個）" disabled={nSel < 3} onClick={() => editor().distribute('v')}><AlignVerticalDistributeCenter size={i} /></IconButton>
    </>
  );
}

/** 移到最上層 / 移到最下層. `keys` adds the keyboard shortcut to the label (desktop toolbar). */
export function ZOrderEndButtons({ nSel, size = 'md', keys = false }: { nSel: number; size?: 'md' | 'lg'; keys?: boolean }) {
  const i = size === 'lg' ? 18 : 15;
  return (
    <>
      <IconButton size={size} label={keys ? '移到最上層（Shift+]）' : '移到最上層'} disabled={!nSel} onClick={() => editor().zOrder('top')}><ArrowUpToLine size={i} /></IconButton>
      <IconButton size={size} label={keys ? '移到最下層（Shift+[）' : '移到最下層'} disabled={!nSel} onClick={() => editor().zOrder('bottom')}><ArrowDownToLine size={i} /></IconButton>
    </>
  );
}

const BAR = 'pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-0.5 rounded-xl border border-ink-700 bg-ink-850/95 p-1 shadow-xl shadow-black/40 backdrop-blur';

/**
 * Floating quick actions while something is selected (touch layouts): nudge by 1 / 8 / 16 px, duplicate, delete,
 * one layer up / down, 多選 (tap to add / remove) and an optional row with the align / distribute / z-order buttons.
 * Placed at the bottom of the canvas area; it wraps to two rows on narrow phones.
 */
export function SelectionBar() {
  const n = useEditor((s) => s.selection.length);
  const step = useMobile((s) => s.nudgeStep);
  const multi = useMobile((s) => s.multiSelect);
  const [arrange, setArrange] = useState(false);
  if (!n) return null;
  const nudge = (dx: number, dy: number) => editor().nudge(dx * step, dy * step);
  const sep = <div className="mx-0.5 h-6 w-px shrink-0 bg-line" aria-hidden />;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-2 z-30 flex flex-col items-center gap-1.5 px-2">
      {arrange && (
        <div role="toolbar" aria-label="對齊與排列" className={BAR}>
          <AlignButtons nSel={n} size="lg" />
          <ZOrderEndButtons nSel={n} size="lg" />
        </div>
      )}
      <div role="toolbar" aria-label="選取工具列" className={BAR}>
        <IconButton size="lg" label="多選" title="多選：點元件加入或取消選取" active={multi} onClick={() => mobile().setMultiSelect(!multi)}>
          <SquareDashedMousePointer size={18} />
        </IconButton>
        {sep}
        <IconButton size="lg" label="往左" title={`往左移 ${step} 像素`} onClick={() => nudge(-1, 0)}><ArrowLeft size={18} /></IconButton>
        <IconButton size="lg" label="往上" title={`往上移 ${step} 像素`} onClick={() => nudge(0, -1)}><ArrowUp size={18} /></IconButton>
        <IconButton size="lg" label="往下" title={`往下移 ${step} 像素`} onClick={() => nudge(0, 1)}><ArrowDown size={18} /></IconButton>
        <IconButton size="lg" label="往右" title={`往右移 ${step} 像素`} onClick={() => nudge(1, 0)}><ArrowRight size={18} /></IconButton>
        <button
          type="button"
          aria-label={`移動距離 ${step} 像素`}
          title="點一下切換移動距離：1、8、16 像素"
          onClick={() => mobile().cycleNudgeStep()}
          className="inline-flex h-11 min-w-11 shrink-0 items-center justify-center rounded-md px-1.5 font-mono text-[13px] text-fg-muted tabular-nums hover:bg-ink-750 hover:text-fg"
        >
          {step}px
        </button>
        {sep}
        <IconButton size="lg" label="複製" title="複製一份" onClick={() => editor().duplicateSelected()}><Copy size={18} /></IconButton>
        <IconButton size="lg" label="刪除" onClick={() => editor().deleteSelected()}><Trash size={18} /></IconButton>
        <IconButton size="lg" label="上移" title="上移一層" onClick={() => editor().zOrder('up')}><ChevronUp size={20} /></IconButton>
        <IconButton size="lg" label="下移" title="下移一層" onClick={() => editor().zOrder('down')}><ChevronDown size={20} /></IconButton>
        <IconButton size="lg" label="對齊與排列" active={arrange} onClick={() => setArrange((v) => !v)}><AlignCenterVertical size={18} /></IconButton>
      </div>
    </div>
  );
}
