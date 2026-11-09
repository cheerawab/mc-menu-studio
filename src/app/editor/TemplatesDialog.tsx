'use client';

import { FilePlus } from 'lucide-react';
import { useMemo } from 'react';
import { renderPageToCanvas } from '@/core/render/renderPage';
import { getSkin } from '@/core/skins';
import { blankProject, TEMPLATES, type TemplateInfo } from '@/core/templates';
import { renderEnv } from '../state/images';
import { editor, useEditor } from '../state/store';
import { Modal } from './Overlays';

function thumbnail(t: TemplateInfo): string | null {
  try {
    const project = t.build();
    const { canvas } = renderPageToCanvas(project.pages[0], project, renderEnv({}));
    return (canvas as unknown as HTMLCanvasElement).toDataURL('image/png');
  } catch {
    return null;
  }
}

function applyTemplate(t: TemplateInfo | null) {
  const s = editor();
  s.openDialog(null);
  s.askConfirm({
    title: t ? `套用範本「${t.name}」` : '建立空白專案',
    message: '目前的專案會被取代，這個動作無法復原。如需保留，請先從「檔案」選單匯出 JSON。',
    confirmLabel: t ? '套用範本' : '建立空白專案',
    onConfirm: () => {
      editor().loadProject(t ? t.build() : blankProject());
      editor().toast('success', t ? `已套用「${t.name}」範本。` : '已建立空白專案。');
    },
  });
}

export default function TemplatesDialog() {
  const open = useEditor((s) => s.dialog === 'templates');
  const thumbs = useMemo(() => (open ? TEMPLATES.map(thumbnail) : []), [open]);
  if (!open) return null;
  return (
    <Modal title="範本庫" onClose={() => editor().openDialog(null)} width={880}>
      <div className="grid grid-cols-3 gap-3 overflow-y-auto p-4">
        {TEMPLATES.map((t, i) => (
          <button
            key={t.id}
            type="button"
            onClick={() => applyTemplate(t)}
            className="group flex flex-col overflow-hidden rounded-lg border border-ink-700 bg-ink-850 text-left transition-colors hover:border-accent/60"
          >
            <div className="stage-bg flex h-40 items-center justify-center p-3">
              {thumbs[i] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumbs[i]!} alt={`${t.name} 預覽`} className="pixelated max-h-full max-w-full drop-shadow-[0_6px_16px_rgba(0,0,0,0.5)]" />
              ) : (
                <span className="text-[12px] text-fg-dim">無法產生預覽</span>
              )}
            </div>
            <div className="flex flex-col gap-1 border-t border-line p-3">
              <div className="flex items-center justify-between">
                <span className="text-[13.5px] font-semibold group-hover:text-accent">{t.name}</span>
                <span className="rounded bg-ink-700 px-1.5 py-px text-[10.5px] text-fg-muted">{getSkin(t.skinId).name}</span>
              </div>
              <p className="text-[11.5px] leading-relaxed text-fg-dim">{t.description}</p>
            </div>
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-line px-4 py-3">
        <p className="text-[11.5px] text-fg-dim">範本中的指令都是無害的示範（例如 /time set day），請依伺服器需求修改。</p>
        <button type="button" onClick={() => applyTemplate(null)} className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12.5px] text-fg-muted hover:bg-ink-750 hover:text-fg">
          <FilePlus size={14} /> 空白專案
        </button>
      </div>
    </Modal>
  );
}
