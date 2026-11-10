'use client';

import {
  Check, ChevronDown, Download, Ellipsis, FilePlus, FileUp, Gamepad2, Grid3x3, LayoutTemplate, MousePointerClick, Package,
  PenLine, Redo2, Undo2,
} from 'lucide-react';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { SNAP_STEPS, type SnapStep } from '@/core/geometry';
import { autoGuiScale, WINDOW_PRESETS, type GuiScale } from '@/core/game/chrome';
import { parseProjectJson } from '@/core/model/serialize';
import { blankProject } from '@/core/templates';
import { exportProjectJson } from '../state/persistence';
import { editor, useEditor } from '../state/store';
import { useLayout } from './layoutTier';
import { Button, cx, IconButton, Segmented, Select } from './ui';

function Logo({ markOnly = false }: { markOnly?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 pr-1">
      <div className="grid h-6 w-6 grid-cols-2 gap-[2px] rounded-[5px] bg-ink-800 p-[3px]" aria-hidden>
        <span className="rounded-[2px] bg-accent" />
        <span className="rounded-[2px] bg-accent/45" />
        <span className="rounded-[2px] bg-accent/45" />
        <span className="rounded-[2px] bg-accent" />
      </div>
      {!markOnly && (
        <div className="leading-none">
          <div className="text-[13.5px] font-semibold tracking-wide">選單工坊</div>
          <div className="mt-0.5 font-mono text-[9.5px] tracking-wider text-fg-dim">MC MENU STUDIO</div>
        </div>
      )}
    </div>
  );
}

// ---- file actions (shared by the desktop 檔案 menu and the compact ⋯ menu)

function confirmNewProject() {
  editor().askConfirm({
    title: '建立新專案',
    message: '目前的專案會被空白專案取代，這個動作無法復原。如需保留，請先匯出 JSON。',
    confirmLabel: '建立新專案',
    danger: true,
    onConfirm: () => editor().loadProject(blankProject()),
  });
}

async function importProjectFile(file: File | undefined) {
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
}

function downloadProjectJson() {
  exportProjectJson(editor().project);
  editor().toast('success', '已下載專案 JSON。');
}

function JsonFileInput({ inputRef }: { inputRef: RefObject<HTMLInputElement | null> }) {
  return (
    <input
      ref={inputRef}
      type="file"
      accept="application/json,.json"
      className="hidden"
      aria-hidden
      tabIndex={-1}
      onChange={(e) => {
        void importProjectFile(e.target.files?.[0]);
        e.target.value = '';
      }}
    />
  );
}

/** Closes a popup menu on Escape or on a pointerdown outside `ref` (mouse, pen and touch alike). */
function useDismiss(open: boolean, ref: RefObject<HTMLElement | null>, setOpen: (v: boolean) => void) {
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [open, ref, setOpen]);
}

function FileMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useDismiss(open, ref, setOpen);

  const item = 'flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[12.5px] text-fg hover:bg-ink-700';
  return (
    <div ref={ref} className="relative">
      <Button variant="ghost" size="sm" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        檔案 <ChevronDown size={13} />
      </Button>
      <JsonFileInput inputRef={fileRef} />
      {open && (
        <div role="menu" className="absolute top-full right-0 z-40 mt-1 w-52 rounded-lg border border-ink-700 bg-ink-850 p-1 shadow-2xl shadow-black/50">
          <button role="menuitem" type="button" className={item} onClick={() => { setOpen(false); confirmNewProject(); }}>
            <FilePlus size={14} /> 新專案
          </button>
          <button role="menuitem" type="button" className={item} onClick={() => { setOpen(false); editor().openDialog('templates'); }}>
            <LayoutTemplate size={14} /> 從範本開始…
          </button>
          <div className="my-1 h-px bg-line" />
          <button role="menuitem" type="button" className={item} onClick={() => { setOpen(false); fileRef.current?.click(); }}>
            <FileUp size={14} /> 匯入專案 JSON…
          </button>
          <button role="menuitem" type="button" className={item} onClick={() => { setOpen(false); downloadProjectJson(); }}>
            <Download size={14} /> 匯出專案 JSON
          </button>
        </div>
      )}
    </div>
  );
}

function ProjectNameInput({ className }: { className: string }) {
  const name = useEditor((s) => s.project.name);
  return (
    <input
      aria-label="專案名稱"
      className={className}
      value={name}
      maxLength={60}
      onChange={(e) => editor().commit((p) => ({ ...p, name: e.target.value }), { key: 'project-name' })}
    />
  );
}

const NAME_CLASS = 'min-w-0 rounded-md border border-transparent bg-transparent px-2 font-medium text-fg hover:border-ink-700 focus:border-accent focus:bg-ink-850 focus:outline-none';

// ---- compact (phones): ⋯ menu with 範本 / 檔案 items and the canvas view toggles

function OverflowMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useDismiss(open, ref, setOpen);
  const mode = useEditor((s) => s.view.mode);
  const showGrid = useEditor((s) => s.view.showGrid);
  const showRegions = useEditor((s) => s.view.showRegions);
  const snap = useEditor((s) => s.view.snap);
  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  const item = 'flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-[15px] text-fg hover:bg-ink-700 active:bg-ink-700';
  const check = (on: boolean) => <Check size={18} className={cx('ml-auto shrink-0 text-accent', !on && 'invisible')} />;
  return (
    <div ref={ref} className="relative">
      <IconButton size="lg" label="更多選項" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Ellipsis size={20} />
      </IconButton>
      <JsonFileInput inputRef={fileRef} />
      {open && (
        <div
          role="menu"
          aria-label="更多選項"
          className="absolute top-full right-0 z-40 mt-1 max-h-[calc(100dvh-64px)] w-[min(18rem,calc(100vw-16px))] overflow-y-auto overscroll-contain rounded-lg border border-ink-700 bg-ink-850 p-1 shadow-2xl shadow-black/50"
        >
          <div className="border-b border-line px-2 pt-1 pb-2 min-[360px]:hidden">
            <ProjectNameInput className="h-10 w-full min-w-0 rounded-md border border-ink-700 bg-ink-900 px-2 font-medium text-fg focus:border-accent focus:outline-none" />
          </div>
          <button role="menuitem" type="button" className={item} onClick={run(() => editor().openDialog('templates'))}>
            <LayoutTemplate size={18} /> 範本庫…
          </button>
          <button role="menuitem" type="button" className={item} onClick={run(confirmNewProject)}>
            <FilePlus size={18} /> 新專案
          </button>
          <button role="menuitem" type="button" className={item} onClick={() => { setOpen(false); fileRef.current?.click(); }}>
            <FileUp size={18} /> 匯入專案 JSON…
          </button>
          <button role="menuitem" type="button" className={item} onClick={run(downloadProjectJson)}>
            <Download size={18} /> 匯出專案 JSON
          </button>
          {mode === 'edit' && (
            <>
              <div className="my-1 h-px bg-line" />
              <div className="px-3 pt-1 pb-0.5 text-[13px] text-fg-dim">畫布</div>
              <button
                role="menuitemcheckbox"
                aria-checked={showGrid}
                type="button"
                className={item}
                onClick={() => editor().setView({ showGrid: !showGrid })}
              >
                <Grid3x3 size={18} /> 顯示格線 {check(showGrid)}
              </button>
              <button
                role="menuitemcheckbox"
                aria-checked={showRegions}
                type="button"
                className={item}
                onClick={() => editor().setView({ showRegions: !showRegions })}
              >
                <MousePointerClick size={18} /> 顯示點擊區域 {check(showRegions)}
              </button>
              <div className="flex min-h-11 items-center justify-between gap-2 px-3 text-[15px]">
                <span>吸附</span>
                <Segmented<SnapStep>
                  label="吸附間距"
                  size="lg"
                  value={snap}
                  onChange={(v) => editor().setView({ snap: v })}
                  options={SNAP_STEPS.map((s) => ({ value: s, label: `${s}`, ariaLabel: `${s} 像素` }))}
                />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function CompactTopBar() {
  const canUndo = useEditor((s) => s.history.past.length > 0);
  const canRedo = useEditor((s) => s.history.future.length > 0);
  const mode = useEditor((s) => s.view.mode);
  return (
    <header className="safe-top safe-x shrink-0 border-b border-line bg-ink-900">
      <div className="flex h-12 items-center gap-1 px-2">
        <ProjectNameInput className={cx(NAME_CLASS, 'hidden h-10 flex-1 min-[360px]:block')} />
        <div className="flex-1 min-[360px]:hidden" />
        <Segmented
          label="檢視模式"
          size="lg"
          value={mode}
          onChange={(m) => editor().setView({ mode: m })}
          options={[
            { value: 'edit', label: <PenLine size={18} />, ariaLabel: '編輯' },
            { value: 'game', label: <Gamepad2 size={18} />, ariaLabel: '遊戲預覽' },
          ]}
        />
        <IconButton size="lg" label="復原" disabled={!canUndo} onClick={() => editor().undo()}>
          <Undo2 size={19} />
        </IconButton>
        <IconButton size="lg" label="重做" disabled={!canRedo} onClick={() => editor().redo()}>
          <Redo2 size={19} />
        </IconButton>
        <Button variant="primary" aria-label="匯出" title="匯出 Minecraft 資源包與資料包" onClick={() => editor().openDialog('export')}>
          <Package size={17} />
          <span className="hidden min-[440px]:inline">匯出</span>
        </Button>
        <OverflowMenu />
      </div>
    </header>
  );
}

// ---- desktop / medium

function WideTopBar({ desktop }: { desktop: boolean }) {
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
      <Logo markOnly={!desktop} />
      <div className="h-5 w-px bg-line" />
      <ProjectNameInput className={cx(NAME_CLASS, 'h-7 text-[13px]', desktop ? 'w-44' : 'w-36')} />
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
        {/* medium tier: the GUI scale and window size live in the game preview's header instead */}
        {desktop && (
          <>
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
          </>
        )}
      </div>

      <Button variant="ghost" size="sm" onClick={() => editor().openDialog('templates')}>
        <LayoutTemplate size={14} /> 範本
      </Button>
      <FileMenu />
      <Button variant="primary" size="sm" title="匯出 Minecraft 資源包與資料包" onClick={() => editor().openDialog('export')}>
        <Package size={14} /> 匯出
      </Button>
    </header>
  );
}

export default function TopBar() {
  const { tier } = useLayout();
  if (tier === 'compact') return <CompactTopBar />;
  return <WideTopBar desktop={tier === 'desktop'} />;
}
