'use client';

import { CircleCheck, CircleX, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { autoGuiScale, drawGameMock, drawWorld, gameLayout, WINDOW_PRESETS, type GuiScale } from '@/core/game/chrome';
import { effectiveFooterLabel } from '@/core/model/defaults';
import { containsPoint } from '@/core/geometry';
import { isTap, LONG_PRESS_MS } from '@/core/gestures';
import { cleanCommand } from '@/core/model/validate';
import type { Region } from '@/core/model/types';
import { computeRegions, renderPageToCanvas } from '@/core/render/renderPage';
import type { Ctx2D } from '@/core/render/types';
import { renderEnv, useImagesVersion } from '../state/images';
import { currentPage, editor, useEditor } from '../state/store';
import { useLayout } from './layoutTier';
import { Button, cx, Select } from './ui';

const TIP_CLASS = 'pointer-events-none absolute z-10 max-w-64 rounded-[3px] border-2 px-2 py-1 text-[12.5px] leading-snug whitespace-pre-line text-white';
const TIP_COLORS = { background: 'rgba(16,0,16,0.94)', borderColor: '#2d0a63', boxShadow: 'inset 0 0 0 1px #5000a0', textShadow: '1px 1px 0 #3e3e3e' };

// Touch: a tap on a button runs the simulated click (as in the game); a long press (LONG_PRESS_MS) shows its
// tooltip instead, which stays until the next tap anywhere. Mouse: click and hover as before.
export default function GamePreview() {
  const { tier, coarse } = useLayout();
  const wide = tier === 'desktop';
  const compact = tier === 'compact';
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
  const [pinned, setPinned] = useState<{ text: string; x: number; y: number } | null>(null);
  const press = useRef<{ id: number; sx: number; sy: number; long: boolean; timer: number } | null>(null);
  const lastPointer = useRef('mouse');

  // the pinned (long-press) tooltip goes away with the next pointerdown anywhere
  useEffect(() => {
    if (!pinned) return;
    const clear = () => setPinned(null);
    window.addEventListener('pointerdown', clear);
    return () => window.removeEventListener('pointerdown', clear);
  }, [pinned]);
  useEffect(() => () => window.clearTimeout(press.current?.timer), []);

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

  const pad = compact ? 8 : 24;
  const k = Math.min((host.w - pad * 2) / win.w, (host.h - pad * 2) / win.h);
  const cssW = Math.max(1, Math.floor(L.guiW * guiScale * k)), cssH = Math.max(1, Math.floor(L.guiH * guiScale * k));

  const toGui = (clientX: number, clientY: number) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { gx: ((clientX - r.left) / r.width) * L.guiW, gy: ((clientY - r.top) / r.height) * L.guiH };
  };
  const regionAt = (gx: number, gy: number): Region | null => {
    if (gy < L.body.y || gy >= L.body.y + L.body.h) return null;
    const px = gx - L.page.x, py = gy - L.page.y;
    for (let i = regions.length - 1; i >= 0; i--) if (containsPoint(regions[i], px, py)) return regions[i];
    return null;
  };
  const footerRect = L.footerButton;

  /** The simulated click at a screen point. */
  const activate = (clientX: number, clientY: number) => {
    if (closed) return;
    const { gx, gy } = toGui(clientX, clientY);
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

  const local = (clientX: number, clientY: number) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    lastPointer.current = e.pointerType;
    if (e.pointerType !== 'touch') return;
    window.clearTimeout(press.current?.timer);
    const { gx, gy } = toGui(e.clientX, e.clientY);
    const region = closed ? null : regionAt(gx, gy);
    const at = local(e.clientX, e.clientY);
    const p = { id: e.pointerId, sx: e.clientX, sy: e.clientY, long: false, timer: 0 };
    p.timer = window.setTimeout(() => {
      p.long = true;
      if (region?.tooltip.trim()) setPinned({ text: region.tooltip, x: at.x, y: at.y });
    }, LONG_PRESS_MS);
    press.current = p;
  };
  const endPress = (e: ReactPointerEvent<HTMLCanvasElement>, click: boolean) => {
    const p = press.current;
    if (e.pointerType !== 'touch' || !p || p.id !== e.pointerId) return;
    window.clearTimeout(p.timer);
    press.current = null;
    if (click && !p.long) activate(e.clientX, e.clientY);
  };

  const scales: GuiScale[] = [1, 2, 3, 4];
  const auto = autoGuiScale(win.w, win.h);
  const fits = L.fitsWidth && L.fitsHeight;
  const bodyAvail = L.widgetSpace;
  const pointer = hover?.region && hover.region.action.type !== 'none';

  const statusPill = (
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
  );
  const info = (
    <>
      <span className="text-fg-muted">
        {win.w}×{win.h}・GUI {guiScale} → 介面 {L.guiW}×{L.guiH}
      </span>
      <span className="text-fg-dim">
        內容區約 {bodyAvail} px 高，此頁需要 {L.widget.h} px
      </span>
    </>
  );
  const scaleButtons = (
    <div className={cx('flex items-center gap-1 text-fg-dim', wide && 'ml-auto')} aria-label="各 GUI 比例是否放得下">
      {!wide && <span className="mr-0.5 text-[11px]">GUI</span>}
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
              'inline-flex items-center gap-1 rounded font-mono text-[11px]',
              compact ? 'h-11 min-w-11 justify-center px-2' : 'h-6 px-1.5',
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
  );
  const hint = coarse
    ? '點一下按鈕可模擬動作，長按可看提示文字。對話框外框（標題列、底部按鈕）的尺寸是估計值，實際以遊戲畫面為準。'
    : '點擊預覽中的按鈕可模擬動作，滑鼠停留可看提示文字。對話框外框（標題列、底部按鈕）的尺寸是估計值，實際以遊戲畫面為準。';

  return (
    <div className="flex h-full flex-col bg-[#07080a]">
      {wide ? (
        <div className="flex h-10 shrink-0 items-center gap-3 border-b border-line bg-ink-900 px-3 text-[12px]">
          {statusPill}
          {info}
          {scaleButtons}
        </div>
      ) : (
        // medium / compact: the GUI scale and window size are not in the top bar, so they live here; the row wraps
        <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line bg-ink-900 px-3 py-1.5 text-[12px]">
          {statusPill}
          <div className="w-40">
            <Select
              ariaLabel="遊戲視窗大小"
              value={win.id}
              onChange={(id) => editor().setView({ windowId: id })}
              options={WINDOW_PRESETS.map((w) => ({ value: w.id, label: w.label }))}
            />
          </div>
          {scaleButtons}
          {info}
        </div>
      )}
      <div ref={hostRef} className="relative min-h-0 flex-1 overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative" style={{ width: cssW, height: cssH }}>
            <canvas
              ref={canvasRef}
              className="pixelated no-callout block touch-manipulation rounded-sm shadow-[0_0_0_1px_#262a33,0_20px_60px_rgba(0,0,0,0.6)] select-none"
              style={{ width: cssW, height: cssH, cursor: pointer ? 'pointer' : 'default' }}
              role="img"
              aria-label={`遊戲內預覽：${page.title}`}
              onClick={(e) => {
                if (lastPointer.current !== 'touch') activate(e.clientX, e.clientY); // touch: handled on pointerup
              }}
              onPointerDown={onPointerDown}
              onPointerUp={(e) => endPress(e, true)}
              onPointerCancel={(e) => endPress(e, false)}
              onContextMenu={(e) => {
                if (lastPointer.current === 'touch') e.preventDefault();
              }}
              onPointerMove={(e) => {
                if (e.pointerType === 'touch') {
                  const p = press.current;
                  if (p && p.id === e.pointerId && !isTap({ x: p.sx, y: p.sy }, { x: e.clientX, y: e.clientY })) endPress(e, false);
                  return;
                }
                const { gx, gy } = toGui(e.clientX, e.clientY);
                const r = closed ? null : regionAt(gx, gy);
                const rect = canvasRef.current!.getBoundingClientRect();
                setHover({ region: r, x: e.clientX - rect.left, y: e.clientY - rect.top });
              }}
              onPointerLeave={() => setHover(null)}
            />
            {pinned ? (
              // above the finger (below it near the top edge), kept inside the preview horizontally
              <div
                role="tooltip"
                className={TIP_CLASS}
                style={{
                  left: Math.max(4, Math.min(pinned.x - 120, cssW - 244)),
                  ...(pinned.y > 72 ? { bottom: cssH - pinned.y + 24 } : { top: pinned.y + 28 }),
                  ...TIP_COLORS,
                }}
              >
                {pinned.text}
              </div>
            ) : (
              hover?.region?.tooltip.trim() && (
                <div
                  className={TIP_CLASS}
                  style={{
                    left: Math.min(hover.x + 14, cssW - 120),
                    top: Math.max(0, hover.y - 18),
                    ...TIP_COLORS,
                  }}
                >
                  {hover.region.tooltip}
                </div>
              )
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
        {!compact && <p className="pointer-events-none absolute right-3 bottom-2 left-3 text-center text-[11.5px] text-fg-dim">{hint}</p>}
      </div>
      {compact && <p className="shrink-0 px-3 py-1.5 text-center text-[11.5px] leading-snug text-fg-dim">{hint}</p>}
    </div>
  );
}
