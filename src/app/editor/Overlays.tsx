'use client';

import { CircleCheck, CircleExclamationPoint, Info, TriangleExclamationPoint, X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { editor, useEditor, type Toast } from '../state/store';
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
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex flex-col items-center gap-2" aria-live="polite">
      {toasts.map((t) => <ToastItem key={t.id} t={t} />)}
    </div>
  );
}

export function Modal({ title, onClose, children, width = 440 }: { title: string; onClose: () => void; children: ReactNode; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);
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
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/55 p-6 backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal aria-label={title} className="flex max-h-full flex-col rounded-xl border border-ink-700 bg-ink-900 shadow-2xl shadow-black/60" style={{ width }}>
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-[14px] font-semibold">{title}</h2>
          <IconButton label="關閉" size="sm" onClick={onClose}>
            <X size={15} />
          </IconButton>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog() {
  const req = useEditor((s) => s.confirm);
  if (!req) return null;
  const close = () => editor().closeConfirm();
  return (
    <Modal title={req.title} onClose={close}>
      <p className="px-4 py-4 text-[13px] leading-relaxed text-fg-muted">{req.message}</p>
      <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
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
