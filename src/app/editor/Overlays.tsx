'use client';

import { CircleCheck, CircleExclamationPoint, Info, TriangleExclamationPoint, X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { editor, useEditor, type Toast } from '../state/store';
import { useLayout } from './layoutTier';
import { Button, cx, IconButton } from './ui';

const TOAST_ICON = { info: Info, success: CircleCheck, warning: TriangleExclamationPoint, error: CircleExclamationPoint };
const TOAST_CLS = { info: 'text-info', success: 'text-accent', warning: 'text-warn', error: 'text-danger' };

function ToastItem({ t }: { t: Toast }) {
  useEffect(() => {
    const ms = t.kind === 'error' ? 7000 : 3800;
    const id = setTimeout(() => editor().dismissToast(t.id), ms);
    return () => clearTimeout(id);
  }, [t.id, t.kind]);
  const Icon = TOAST_ICON[t.kind];
  return (
    <div role={t.kind === 'error' ? 'alert' : 'status'} className="animate-toast pointer-events-auto flex max-w-[520px] items-start gap-2.5 rounded-lg border border-ink-700 bg-ink-850/95 py-2 pr-1.5 pl-3 text-[12.5px] shadow-xl shadow-black/40 backdrop-blur">
      <Icon size={15} className={cx('mt-0.5 shrink-0', TOAST_CLS[t.kind])} />
      <span className="flex-1 leading-relaxed text-fg">{t.message}</span>
      <IconButton label="關閉通知" size="sm" onClick={() => editor().dismissToast(t.id)}>
        <X size={13} />
      </IconButton>
    </div>
  );
}

export function Toasts() {
  const toasts = useEditor((s) => s.toasts);
  // compact: under the top bar, so they do not cover the tab bar and the selection bar
  const compact = useLayout().tier === 'compact';
  return (
    <div
      className={cx('pointer-events-none fixed inset-x-0 z-50 flex flex-col items-center gap-2', compact ? 'toast-top px-2' : 'bottom-5')}
      aria-live="polite"
    >
      {toasts.map((t) => <ToastItem key={t.id} t={t} />)}
    </div>
  );
}

/**
 * Dialog. Desktop / medium: centred window. Compact: a sheet from the bottom edge, full width, at most the screen
 * height (long dialogs are nearly full height, short ones like confirmations stay short); the content scrolls.
 * The backdrop closes it when a pointer goes down and comes up on the backdrop itself (closing on the click, not on
 * pointerdown, so the tap cannot land on the editor underneath).
 */
export function Modal({ title, onClose, children, width = 440 }: { title: string; onClose: () => void; children: ReactNode; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const downOnBackdrop = useRef(false);
  const compact = useLayout().tier === 'compact';
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>('[data-autofocus]') ?? ref.current?.querySelector<HTMLElement>('button');
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div
      className={cx('fixed inset-0 z-40 flex justify-center bg-black/55', compact ? 'items-end' : 'items-center p-6 backdrop-blur-[2px]')}
      onPointerDown={(e) => {
        downOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && downOnBackdrop.current) onClose();
        downOnBackdrop.current = false;
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal
        aria-label={title}
        className={cx(
          'flex flex-col bg-ink-900 shadow-2xl shadow-black/60',
          compact ? 'animate-sheet safe-bottom safe-x sheet-max-h w-full rounded-t-xl border-t border-ink-700' : 'max-h-full rounded-xl border border-ink-700',
        )}
        style={compact ? undefined : { width }}
      >
        <div className={cx('flex shrink-0 items-center justify-between border-b border-line', compact ? 'min-h-12 gap-2 pr-1 pl-4' : 'px-4 py-3')}>
          <h2 className={cx('font-semibold', compact ? 'text-[16px]' : 'text-[14px]')}>{title}</h2>
          <IconButton label="關閉" size={compact ? 'lg' : 'sm'} onClick={onClose}>
            <X size={compact ? 20 : 15} />
          </IconButton>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog() {
  const req = useEditor((s) => s.confirm);
  const compact = useLayout().tier === 'compact';
  if (!req) return null;
  const close = () => editor().closeConfirm();
  return (
    <Modal title={req.title} onClose={close}>
      <p className="min-h-0 overflow-y-auto px-4 py-4 text-[13px] leading-relaxed text-fg-muted">{req.message}</p>
      <div className={cx('border-t border-line px-4 py-3', compact ? 'grid grid-cols-2 gap-2' : 'flex justify-end gap-2')}>
        <Button variant="ghost" onClick={close}>取消</Button>
        <Button
          data-autofocus
          variant={req.danger ? 'danger' : 'primary'}
          onClick={() => {
            close();
            req.onConfirm();
          }}
        >
          {req.confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
