'use client';

import { useEffect } from 'react';
import { installAppStore } from '../state/persistence';
import { editor, useEditor } from '../state/store';
import CanvasView from './CanvasView';
import { ConfirmDialog, Toasts } from './Overlays';
import GamePreview from './GamePreview';
import LeftPanel from './LeftPanel';
import RightPanel from './RightPanel';
import TemplatesDialog from './TemplatesDialog';
import TopBar from './TopBar';

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

export default function Editor() {
  const mode = useEditor((s) => s.view.mode);
  useShortcuts();
  return (
    <div className="flex h-screen min-w-[1280px] flex-col overflow-hidden bg-ink-950 text-fg">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <LeftPanel />
        <main className="relative min-w-0 flex-1 border-x border-line" aria-label={mode === 'edit' ? '編輯畫布' : '遊戲內預覽'}>
          {mode === 'edit' ? <CanvasView /> : <GamePreview />}
        </main>
        <RightPanel />
      </div>
      <TemplatesDialog />
      <ConfirmDialog />
      <Toasts />
    </div>
  );
}
