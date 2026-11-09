'use client';

import {
  ChevronDown, Download, FilePlus, FileUp, Gamepad2, LayoutTemplate, Package, PenLine, Redo2, Undo2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { autoGuiScale, WINDOW_PRESETS, type GuiScale } from '@/core/game/chrome';
import { parseProjectJson } from '@/core/model/serialize';
import { blankProject } from '@/core/templates';
import { exportProjectJson } from '../state/persistence';
import { editor, useEditor } from '../state/store';
import { Button, cx, IconButton, Segmented, Select } from './ui';

function Logo() {
  return (
    <div className="flex items-center gap-2.5 pr-1">
      <div className="grid h-6 w-6 grid-cols-2 gap-[2px] rounded-[5px] bg-ink-800 p-[3px]" aria-hidden>
        <span className="rounded-[2px] bg-accent" />
        <span className="rounded-[2px] bg-accent/45" />
        <span className="rounded-[2px] bg-accent/45" />
        <span className="rounded-[2px] bg-accent" />
      </div>
      <div className="leading-none">
        <div className="text-[13.5px] font-semibold tracking-wide">選單工坊</div>
        <div className="mt-0.5 font-mono text-[9.5px] tracking-wider text-fg-dim">MC MENU STUDIO</div>
      </div>
    </div>
  );
}

function FileMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const { project, warnings } = parseProjectJson(await file.text());
      editor().askConfirm({
        title: '匯入專案',
        message: `要用「${project.name}」（${project.pages.length} 個頁面）取代目前的專案嗎？目前的內容無法復原，建議先匯出備份。`,
        confirmLabel: '匯入並取代',
        onConfirm: () => {
          editor().loadProject(project);
          editor().toast('success', `已匯入「${project.name}」。`);
          for (const w of warnings) editor().toast('warning', w);
        },
      });
    } catch (e) {
      editor().toast('error', e instanceof Error ? e.message : '匯入失敗。');
    }
  };

  const item = 'flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[12.5px] text-fg hover:bg-ink-700';
  return (
    <div ref={ref} className="relative">
      <Button variant="ghost" size="sm" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        檔案 <ChevronDown size={13} />
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        aria-hidden
        tabIndex={-1}
        onChange={(e) => {
          void onImport(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {open && (
        <div role="menu" className="absolute top-full right-0 z-40 mt-1 w-52 rounded-lg border border-ink-700 bg-ink-850 p-1 shadow-2xl shadow-black/50">
          <button
            role="menuitem"
            type="button"
            className={item}
            onClick={() => {
              setOpen(false);
              editor().askConfirm({
                title: '建立新專案',
                message: '目前的專案會被空白專案取代，這個動作無法復原。如需保留，請先匯出 JSON。',
                confirmLabel: '建立新專案',
                danger: true,
                onConfirm: () => editor().loadProject(blankProject()),
              });
            }}
          >
            <FilePlus size={14} /> 新專案
          </button>
          <button role="menuitem" type="button" className={item} onClick={() => { setOpen(false); editor().openDialog('templates'); }}>
            <LayoutTemplate size={14} /> 從範本開始…
          </button>
          <div className="my-1 h-px bg-line" />
          <button role="menuitem" type="button" className={item} onClick={() => { setOpen(false); fileRef.current?.click(); }}>
            <FileUp size={14} /> 匯入專案 JSON…
          </button>
          <button
            role="menuitem"
            type="button"
            className={item}
            onClick={() => {
              setOpen(false);
              exportProjectJson(editor().project);
              editor().toast('success', '已下載專案 JSON。');
            }}
          >
            <Download size={14} /> 匯出專案 JSON
          </button>
        </div>
      )}
    </div>
  );
}

export default function TopBar() {
  const name = useEditor((s) => s.project.name);
  const canUndo = useEditor((s) => s.history.past.length > 0);
  const canRedo = useEditor((s) => s.history.future.length > 0);
  const mode = useEditor((s) => s.view.mode);
  const guiScale = useEditor((s) => s.view.guiScale);
  const windowId = useEditor((s) => s.view.windowId);
  const win = WINDOW_PRESETS.find((w) => w.id === windowId) ?? WINDOW_PRESETS[1];
  const auto = autoGuiScale(win.w, win.h);
  const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);
  const mod = isMac ? '⌘' : 'Ctrl+';

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-ink-900 px-3">
      <Logo />
      <div className="h-5 w-px bg-line" />
      <input
        aria-label="專案名稱"
        className="h-7 w-44 min-w-0 rounded-md border border-transparent bg-transparent px-2 text-[13px] font-medium text-fg hover:border-ink-700 focus:border-accent focus:bg-ink-850 focus:outline-none"
        value={name}
        maxLength={60}
        onChange={(e) => editor().commit((p) => ({ ...p, name: e.target.value }), { key: 'project-name' })}
      />
      <div className="flex items-center">
        <IconButton label={`復原（${mod}Z）`} disabled={!canUndo} onClick={() => editor().undo()}>
          <Undo2 size={16} />
        </IconButton>
        <IconButton label={`重做（${isMac ? '⇧⌘Z' : 'Ctrl+Y'}）`} disabled={!canRedo} onClick={() => editor().redo()}>
          <Redo2 size={16} />
        </IconButton>
      </div>

      <div className="mx-auto flex items-center gap-3">
        <Segmented
          label="檢視模式"
          value={mode}
          onChange={(m) => editor().setView({ mode: m })}
          options={[
            { value: 'edit', label: <><PenLine size={13} /> 編輯</> },
            { value: 'game', label: <><Gamepad2 size={13} /> 遊戲預覽</> },
          ]}
        />
        <div className="flex items-center gap-1.5" title="遊戲內的「介面大小」(GUI scale)">
          <span className="text-[11.5px] text-fg-dim">GUI</span>
          <Segmented<GuiScale>
            label="GUI 比例"
            size="sm"
            value={guiScale}
            onChange={(v) => editor().setView({ guiScale: v })}
            options={([1, 2, 3, 4] as GuiScale[]).map((v) => ({
              value: v,
              label: `${v}`,
              title: v === auto ? `${v}（此解析度的「自動」）` : `${v}`,
            }))}
          />
        </div>
        <div className="w-32">
          <Select
            ariaLabel="遊戲視窗大小"
            value={win.id}
            onChange={(id) => editor().setView({ windowId: id })}
            options={WINDOW_PRESETS.map((w) => ({ value: w.id, label: w.label }))}
          />
        </div>
      </div>

      <Button variant="ghost" size="sm" onClick={() => editor().openDialog('templates')}>
        <LayoutTemplate size={14} /> 範本
      </Button>
      <FileMenu />
      <span title="匯出資源包與資料包：第二階段（Stage B）推出" className="inline-flex">
        <Button variant="primary" size="sm" disabled aria-disabled className={cx('pointer-events-none')}>
          <Package size={14} /> 匯出
        </Button>
      </span>
    </header>
  );
}
