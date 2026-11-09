'use client';

import { CircleCheck, CircleX, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { autoGuiScale, drawGameMock, drawWorld, gameLayout, WINDOW_PRESETS, type GuiScale } from '@/core/game/chrome';
import { effectiveFooterLabel } from '@/core/model/defaults';
import { containsPoint } from '@/core/geometry';
import { cleanCommand } from '@/core/model/validate';
import type { Region } from '@/core/model/types';
import { computeRegions, renderPageToCanvas } from '@/core/render/renderPage';
import type { Ctx2D } from '@/core/render/types';
import { renderEnv, useImagesVersion } from '../state/images';
import { currentPage, editor, useEditor } from '../state/store';
import { Button, cx } from './ui';

export default function GamePreview() {
  const page = useEditor(currentPage);
  const project = useEditor((s) => s.project);
  const guiScale = useEditor((s) => s.view.guiScale);
  const windowId = useEditor((s) => s.view.windowId);
  const win = WINDOW_PRESETS.find((w) => w.id === windowId) ?? WINDOW_PRESETS[1];
  const L = useMemo(() => gameLayout(win.w, win.h, guiScale, page.width, page.height), [win.w, win.h, guiScale, page.width, page.height]);
  const regions = useMemo(() => computeRegions(page), [page]);
  const imagesVersion = useImagesVersion(project.assets);
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [host, setHost] = useState({ w: 800, h: 500 });
  const [closed, setClosed] = useState(false);
  const [hover, setHover] = useState<{ region: Region | null; x: number; y: number } | null>(null);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const measure = () => setHost({ w: el.clientWidth, h: el.clientHeight });
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const c = canvasRef.current;
    const ctx = c?.getContext('2d') as unknown as Ctx2D | null;
    if (!c || !ctx) return;
    c.width = L.guiW;
    c.height = L.guiH;
    const env = renderEnv(project.assets);
    if (closed) {
      drawWorld(ctx, L.guiW, L.guiH);
      return;
    }
    const { canvas } = renderPageToCanvas(page, project, env, { placeholders: false });
    drawGameMock(ctx, env, L, { title: page.title, page: canvas, fontFamily: project.settings.fontFamily, footerLabel: effectiveFooterLabel(page, project) });
  }, [L, page, project, closed, imagesVersion]);

  const pad = 24;
  const k = Math.min((host.w - pad * 2) / win.w, (host.h - pad * 2) / win.h);
  const cssW = Math.max(1, Math.floor(L.guiW * guiScale * k)), cssH = Math.max(1, Math.floor(L.guiH * guiScale * k));

  const toGui = (e: ReactMouseEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { gx: ((e.clientX - r.left) / r.width) * L.guiW, gy: ((e.clientY - r.top) / r.height) * L.guiH };
  };
  const regionAt = (gx: number, gy: number): Region | null => {
    if (gy < L.body.y || gy >= L.body.y + L.body.h) return null;
    const px = gx - L.page.x, py = gy - L.page.y;
    for (let i = regions.length - 1; i >= 0; i--) if (containsPoint(regions[i], px, py)) return regions[i];
    return null;
  };
  const footerRect = L.footerButton;

  const onClick = (e: ReactMouseEvent) => {
    if (closed) return;
    const { gx, gy } = toGui(e);
    if (containsPoint(footerRect, gx, gy)) {
      setClosed(true);
      return;
    }
    const r = regionAt(gx, gy);
    if (!r) return;
    const s = editor();
    const a = r.action;
    switch (a.type) {
      case 'page': {
        const target = s.project.pages.find((p) => p.id === a.pageId);
        if (target) s.setPage(target.id);
        else s.toast('error', '這個按鈕連到的頁面不存在。');
        break;
      }
      case 'command':
        s.toast('info', `模擬執行指令：/${cleanCommand(a.command)}`);
        break;
      case 'url':
        s.toast('info', `遊戲會先詢問玩家是否開啟：${a.url}`);
        break;
      case 'copy':
        s.toast('info', `已複製到玩家的剪貼簿：${a.text}`);
        break;
      case 'close':
        setClosed(true);
        break;
      case 'none':
        break;
    }
  };

  const scales: GuiScale[] = [1, 2, 3, 4];
  const auto = autoGuiScale(win.w, win.h);
  const fits = L.fitsWidth && L.fitsHeight;
  const bodyAvail = L.widgetSpace;
  const pointer = hover?.region && hover.region.action.type !== 'none';

  return (
    <div className="flex h-full flex-col bg-[#07080a]">
      <div className="flex h-10 shrink-0 items-center gap-3 border-b border-line bg-ink-900 px-3 text-[12px]">
        <span
          className={cx(
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-medium',
            fits ? 'bg-accent/15 text-accent' : 'bg-danger/15 text-danger',
          )}
          role="status"
        >
          {fits ? <CircleCheck size={13} /> : <CircleX size={13} />}
          {fits ? '可完整顯示' : !L.fitsWidth ? '寬度超出視窗' : '高度不足，玩家需要捲動'}
        </span>
        <span className="text-fg-muted">
          {win.w}×{win.h}・GUI {guiScale} → 介面 {L.guiW}×{L.guiH}
        </span>
        <span className="text-fg-dim">
          內容區約 {bodyAvail} px 高，此頁需要 {L.widget.h} px
        </span>
        <div className="ml-auto flex items-center gap-1 text-fg-dim" aria-label="各 GUI 比例是否放得下">
          {scales.map((sc) => {
            const l = gameLayout(win.w, win.h, sc, page.width, page.height);
            const ok = l.fitsWidth && l.fitsHeight;
            return (
              <button
                key={sc}
                type="button"
                onClick={() => editor().setView({ guiScale: sc })}
                title={`GUI ${sc}${sc === auto ? '（自動）' : ''}：${ok ? '放得下' : '放不下'}`}
                className={cx(
                  'inline-flex h-6 items-center gap-1 rounded px-1.5 font-mono text-[11px]',
                  sc === guiScale ? 'bg-ink-700 text-fg' : 'hover:bg-ink-800',
                )}
              >
                {sc}
                <span className={ok ? 'text-accent' : 'text-danger'}>{ok ? '✓' : '✗'}</span>
              </button>
            );
          })}
          <span className="ml-1 text-[11px]">自動＝{auto}</span>
        </div>
      </div>
      <div ref={hostRef} className="relative min-h-0 flex-1 overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative" style={{ width: cssW, height: cssH }}>
            <canvas
              ref={canvasRef}
              className="pixelated block rounded-sm shadow-[0_0_0_1px_#262a33,0_20px_60px_rgba(0,0,0,0.6)]"
              style={{ width: cssW, height: cssH, cursor: pointer ? 'pointer' : 'default' }}
              role="img"
              aria-label={`遊戲內預覽：${page.title}`}
              onClick={onClick}
              onPointerMove={(e) => {
                const { gx, gy } = toGui(e);
                const r = closed ? null : regionAt(gx, gy);
                const rect = canvasRef.current!.getBoundingClientRect();
                setHover({ region: r, x: e.clientX - rect.left, y: e.clientY - rect.top });
              }}
              onPointerLeave={() => setHover(null)}
            />
            {hover?.region?.tooltip.trim() && (
              <div
                className="pointer-events-none absolute z-10 max-w-64 rounded-[3px] border-2 px-2 py-1 text-[12.5px] leading-snug whitespace-pre-line text-white"
                style={{
                  left: Math.min(hover.x + 14, cssW - 120),
                  top: Math.max(0, hover.y - 18),
                  background: 'rgba(16,0,16,0.94)',
                  borderColor: '#2d0a63',
                  boxShadow: 'inset 0 0 0 1px #5000a0',
                  textShadow: '1px 1px 0 #3e3e3e',
                }}
              >
                {hover.region.tooltip}
              </div>
            )}
            {closed && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/40 text-white">
                <p className="text-[13px]">選單已關閉，回到遊戲畫面。</p>
                <Button variant="primary" size="sm" onClick={() => setClosed(false)}>
                  <RotateCcw size={13} /> 重新開啟
                </Button>
              </div>
            )}
          </div>
        </div>
        <p className="pointer-events-none absolute right-3 bottom-2 left-3 text-center text-[11.5px] text-fg-dim">
          點擊預覽中的按鈕可模擬動作，滑鼠停留可看提示文字。對話框外框（標題列、底部按鈕）的尺寸是估計值，實際以遊戲畫面為準。
        </p>
      </div>
    </div>
  );
}
