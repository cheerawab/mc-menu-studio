'use client';

import { useEffect } from 'react';
import { mobile } from '../state/mobile';
import { installAppStore } from '../state/persistence';
import { editor, getEditorStore, useEditor } from '../state/store';
import CanvasView from './CanvasView';
import CompactBody from './CompactShell';
import ExportDialog from './ExportDialog';
import { ConfirmDialog, Toasts } from './Overlays';
import GamePreview from './GamePreview';
import { LayoutContext, useLayoutInfo, type LayoutTier } from './layoutTier';
import LeftPanel from './LeftPanel';
import RightPanel from './RightPanel';
import TemplatesDialog from './TemplatesDialog';
import TopBar from './TopBar';
import { SelectionBar } from './TouchControls';

installAppStore();

function isTyping(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = editor();
      if (s.confirm || s.dialog) return;
      if (e.key === 'Escape' && mobile().sheet) {
        mobile().openSheet(null);
        return;
      }
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'z') {
        if (isTyping(e.target)) return;
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if (mod && k === 'y') {
        if (isTyping(e.target)) return;
        e.preventDefault();
        s.redo();
        return;
      }
      if (isTyping(e.target)) return;
      if (s.view.mode !== 'edit') return;
      if (mod && k === 'c') {
        if (window.getSelection()?.toString()) return;
        s.copy();
        return;
      }
      if (mod && k === 'x') {
        s.cut();
        return;
      }
      if (mod && k === 'v') {
        e.preventDefault();
        s.paste();
        return;
      }
      if (mod && k === 'd') {
        e.preventDefault();
        s.duplicateSelected();
        return;
      }
      if (mod && k === 'a') {
        e.preventDefault();
        s.selectAll();
        return;
      }
      if (mod) return;
      const step = e.shiftKey ? 8 : 1;
      switch (e.key) {
        case 'Delete':
        case 'Backspace':
          e.preventDefault();
          s.deleteSelected();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          s.nudge(-step, 0);
          break;
        case 'ArrowRight':
          e.preventDefault();
          s.nudge(step, 0);
          break;
        case 'ArrowUp':
          e.preventDefault();
          s.nudge(0, -step);
          break;
        case 'ArrowDown':
          e.preventDefault();
          s.nudge(0, step);
          break;
        case 'Escape':
          s.select([]);
          break;
        case ']':
          s.zOrder(e.shiftKey ? 'top' : 'up');
          break;
        case '[':
          s.zOrder(e.shiftKey ? 'bottom' : 'down');
          break;
        case '}':
          s.zOrder('top');
          break;
        case '{':
          s.zOrder('bottom');
          break;
        case 'Enter':
          if (s.selection.length === 1) s.requestTextFocus();
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/** Touch-layout housekeeping: sheets only exist in compact, 多選 ends with the selection, Enter / double tap opens 屬性. */
function useTouchSync(tier: LayoutTier, touchUi: boolean) {
  useEffect(() => {
    if (tier !== 'compact') mobile().openSheet(null);
  }, [tier]);
  useEffect(() => {
    if (!touchUi) mobile().setMultiSelect(false);
  }, [touchUi]);
  useEffect(
    () =>
      getEditorStore().subscribe((s, prev) => {
        if (!s.selection.length && prev.selection.length && mobile().multiSelect) mobile().setMultiSelect(false);
        if (tier === 'compact' && s.focusTextNonce !== prev.focusTextNonce) mobile().openSheet('inspect');
      }),
    [tier],
  );
}

export default function Editor() {
  const layout = useLayoutInfo();
  const mode = useEditor((s) => s.view.mode);
  useShortcuts();
  useTouchSync(layout.tier, layout.touchUi);
  return (
    <LayoutContext.Provider value={layout}>
      {/* data-layout is a stable hook for tests: compact (< 900 px) | medium (900-1279 px) | desktop (>= 1280 px) */}
      <div data-layout={layout.tier} className="app-shell flex flex-col overflow-hidden bg-ink-950 text-fg">
        <TopBar />
        {layout.tier === 'compact' ? (
          <CompactBody />
        ) : (
          <div className="flex min-h-0 flex-1">
            <LeftPanel />
            <main className="relative min-w-0 flex-1 border-x border-line" aria-label={mode === 'edit' ? '編輯畫布' : '遊戲內預覽'}>
              {mode === 'edit' ? <CanvasView /> : <GamePreview />}
              {layout.touchUi && mode === 'edit' && <SelectionBar />}
            </main>
            <RightPanel />
          </div>
        )}
        <TemplatesDialog />
        <ExportDialog />
        <ConfirmDialog />
        <Toasts />
      </div>
    </LayoutContext.Provider>
  );
}
