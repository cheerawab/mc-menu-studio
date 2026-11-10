'use client';

// The project's export resolution (解析度, ProjectSettings.renderScale). Used in the export dialog and in
// 屬性 → 專案; changing it re-renders the canvas and the game preview (they read the same setting).
import type { RenderScale } from '@/core/model/types';
import { RENDER_SCALES } from '@/core/render/scale';
import { editor, useEditor } from '../state/store';
import { Segmented } from './ui';

export const RENDER_SCALE_INFO: Record<RenderScale, { tag: string; title: string; hint: string }> = {
  1: { tag: '像素風', title: '1x：像素風、檔案最小', hint: '1x：像素風、檔案最小，小字會變成鋸齒狀的像素字。' },
  2: { tag: '建議', title: '2x：建議', hint: '2x（建議）：介面大小 2 或 4 時最清楚，介面大小 3 也不會少掉像素。' },
  3: { tag: '', title: '3x', hint: '3x：介面大小 3 時最清楚；介面大小 1、2 的玩家會看到鋸齒。' },
  4: { tag: '最清楚', title: '4x：最清楚、檔案最大', hint: '4x：最清楚、檔案最大（介面大小 4）；介面大小 1-3 的玩家會看到鋸齒。' },
};

export const RENDER_SCALE_RULE = '「遊戲介面大小 ÷ 解析度」是整數時最清楚；解析度越高，資源包越大。';

export default function RenderScalePicker({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const value = useEditor((s) => s.project.settings.renderScale);
  const set = (v: RenderScale) => editor().commit((p) => ({ ...p, settings: { ...p.settings, renderScale: v } }), { key: 'render-scale' });
  return (
    <div className="flex flex-col gap-1.5">
      <Segmented<RenderScale>
        label="解析度"
        size={size}
        value={value}
        onChange={set}
        options={RENDER_SCALES.map((s) => ({
          value: s,
          title: RENDER_SCALE_INFO[s].title,
          label: (
            <span className="inline-flex items-baseline gap-1">
              <span className="font-mono">{s}x</span>
              {RENDER_SCALE_INFO[s].tag && <span className="text-[10.5px] font-normal opacity-75">{RENDER_SCALE_INFO[s].tag}</span>}
            </span>
          ),
        }))}
      />
      <p className="text-[11px] leading-snug text-fg-dim">
        {RENDER_SCALE_INFO[value].hint}
        {RENDER_SCALE_RULE}
      </p>
    </div>
  );
}
