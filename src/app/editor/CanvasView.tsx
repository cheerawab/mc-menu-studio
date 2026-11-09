'use client';

import {
  AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignHorizontalDistributeCenter,
  AlignStartHorizontal, AlignStartVertical, AlignVerticalDistributeCenter, ArrowDownToLine, ArrowUpToLine, Grid3x3,
  Maximize, MousePointerClick, ZoomIn, ZoomOut,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type DragEvent as ReactDragEvent, type PointerEvent as ReactPointerEvent } from 'react';
import {
  bbox, fitZoom, HANDLES, hitTest, MAX_ZOOM, MIN_ZOOM, rectFromPoints, rectPatchFor, rectsIntersect, resizeRect,
  snapMoveDelta, SNAP_STEPS, zoomAround, type Handle, type SnapStep,
} from '@/core/geometry';
import { createElement } from '@/core/model/defaults';
import { addElements, updateElements } from '@/core/model/ops';
import type { ElementType, Id, Rect } from '@/core/model/types';
import { computeRegions, renderPage } from '@/core/render/renderPage';
import type { Ctx2D } from '@/core/render/types';
import { renderEnv, useImagesVersion } from '../state/images';
import { fileToAsset } from '../state/persistence';
import { currentPage, editor, useEditor } from '../state/store';
import { addElementOfType } from './elementMeta';
import { DND_ELEMENT } from './LeftPanel';
import { cx, IconButton, Segmented } from './ui';

const RULER = 20;

type Gesture =
  | { kind: 'pan'; sx: number; sy: number; panX: number; panY: number }
  | { kind: 'move'; sx: number; sy: number; ids: Id[]; origin: Rect[]; started: boolean }
  | { kind: 'resize'; sx: number; sy: number; id: Id; handle: Handle; origin: Rect; started: boolean }
  | { kind: 'marquee'; px: number; py: number; base: Id[] };

const HANDLE_CURSOR: Record<Handle, string> = {
  n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', ne: 'nesw-resize', sw: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize',
};

function handlePos(h: Handle, w: number, hgt: number) {
  const x = h.includes('w') ? 0 : h.includes('e') ? w : w / 2;
  const y = h.includes('n') ? 0 : h.includes('s') ? hgt : hgt / 2;
  return { x, y };
}

function drawRuler(
  canvas: HTMLCanvasElement | null, orient: 'h' | 'v', length: number, offset: number, zoom: number,
  pageLen: number, hl: [number, number] | null, cursor: number | null,
) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const W = orient === 'h' ? length : RULER, H = orient === 'h' ? RULER : length;
  canvas.width = Math.max(1, Math.round(W * dpr));
  canvas.height = Math.max(1, Math.round(H * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#111318';
  ctx.fillRect(0, 0, W, H);
  const band = (a: number, b: number, color: string) => {
    ctx.fillStyle = color;
    if (orient === 'h') ctx.fillRect(a, 0, b - a, RULER);
    else ctx.fillRect(0, a, RULER, b - a);
  };
  band(offset, offset + pageLen * zoom, '#191c23');
  if (hl) band(offset + hl[0] * zoom, offset + hl[1] * zoom, 'rgba(79,209,139,0.22)');
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
  const minor = steps.find((s) => s * zoom >= 6) ?? 1000;
  const major = steps.find((s) => s * zoom >= 48 && s % minor === 0) ?? 1000;
  const start = Math.floor(-offset / zoom / minor) * minor;
  const end = (length - offset) / zoom;
  ctx.font = '9px ui-monospace, Menlo, monospace';
  ctx.textBaseline = 'top';
  for (let p = start; p <= end; p += minor) {
    const pos = Math.round(offset + p * zoom) + 0.5;
    const isMajor = p % major === 0;
    const len = isMajor ? 9 : p % (minor * 5) === 0 ? 6 : 3;
    ctx.strokeStyle = isMajor ? '#59606e' : '#363b46';
    ctx.beginPath();
    if (orient === 'h') {
      ctx.moveTo(pos, RULER);
      ctx.lineTo(pos, RULER - len);
    } else {
      ctx.moveTo(RULER, pos);
      ctx.lineTo(RULER - len, pos);
    }
    ctx.stroke();
    if (isMajor) {
      ctx.fillStyle = '#7b8291';
      if (orient === 'h') ctx.fillText(String(p), pos + 3, 2);
      else {
        ctx.save();
        ctx.translate(2, pos + 3);
        ctx.rotate(Math.PI / 2);
        ctx.translate(0, -9);
        ctx.fillText(String(p), 0, 0);
        ctx.restore();
      }
    }
  }
  if (cursor !== null) band(offset + cursor * zoom, offset + cursor * zoom + 1, '#4fd18b');
  ctx.fillStyle = '#23272f';
  if (orient === 'h') ctx.fillRect(0, RULER - 1, W, 1);
  else ctx.fillRect(RULER - 1, 0, 1, H);
}

function Toolbar({ onFit }: { onFit: () => void }) {
  const view = useEditor((s) => s.view);
  const nSel = useEditor((s) => s.selection.length);
  const page = useEditor(currentPage);
  const zoomBy = (d: number) => {
    const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom + d));
    if (z === view.zoom) return;
    const el = document.querySelector('[data-stage]');
    const r = el?.getBoundingClientRect();
    const cxp = r ? r.width / 2 : 0, cyp = r ? r.height / 2 : 0;
    editor().setView({ zoom: z, ...zoomAround(view.panX, view.panY, cxp, cyp, view.zoom, z) });
  };
  const sep = <div className="mx-1 h-4 w-px bg-line" />;
  return (
    <div className="flex h-10 shrink-0 items-center gap-0.5 border-b border-line bg-ink-900 px-2" role="toolbar" aria-label="畫布工具列">
      <IconButton label="縮小（-）" onClick={() => zoomBy(-1)} disabled={view.zoom <= MIN_ZOOM}>
        <ZoomOut size={15} />
      </IconButton>
      <span className="w-11 text-center font-mono text-[12px] text-fg-muted tabular-nums" aria-live="polite">{view.zoom * 100}%</span>
      <IconButton label="放大（+）" onClick={() => zoomBy(1)} disabled={view.zoom >= MAX_ZOOM}>
        <ZoomIn size={15} />
      </IconButton>
      <IconButton label="符合視窗（0）" onClick={onFit}>
        <Maximize size={14} />
      </IconButton>
      {sep}
      <IconButton label="顯示格線" active={view.showGrid} onClick={() => editor().setView({ showGrid: !view.showGrid })}>
        <Grid3x3 size={15} />
      </IconButton>
      <span className="ml-1 mr-1 text-[11.5px] text-fg-dim">吸附</span>
      <Segmented<SnapStep>
        label="吸附間距"
        size="sm"
        value={view.snap}
        onChange={(v) => editor().setView({ snap: v })}
        options={SNAP_STEPS.map((s) => ({ value: s, label: `${s}`, title: `${s} 像素` }))}
      />
      {sep}
      <IconButton label="顯示點擊區域" active={view.showRegions} onClick={() => editor().setView({ showRegions: !view.showRegions })}>
        <MousePointerClick size={15} />
      </IconButton>
      {sep}
      <div className="flex items-center" aria-label="對齊">
        <IconButton label={nSel > 1 ? '靠左對齊' : '對齊頁面左緣'} disabled={!nSel} onClick={() => editor().align('left')}><AlignStartVertical size={15} /></IconButton>
        <IconButton label={nSel > 1 ? '水平置中' : '頁面水平置中'} disabled={!nSel} onClick={() => editor().align('hcenter')}><AlignCenterVertical size={15} /></IconButton>
        <IconButton label={nSel > 1 ? '靠右對齊' : '對齊頁面右緣'} disabled={!nSel} onClick={() => editor().align('right')}><AlignEndVertical size={15} /></IconButton>
        <IconButton label={nSel > 1 ? '靠上對齊' : '對齊頁面上緣'} disabled={!nSel} onClick={() => editor().align('top')}><AlignStartHorizontal size={15} /></IconButton>
        <IconButton label={nSel > 1 ? '垂直置中' : '頁面垂直置中'} disabled={!nSel} onClick={() => editor().align('vmiddle')}><AlignCenterHorizontal size={15} /></IconButton>
        <IconButton label={nSel > 1 ? '靠下對齊' : '對齊頁面下緣'} disabled={!nSel} onClick={() => editor().align('bottom')}><AlignEndHorizontal size={15} /></IconButton>
        <IconButton label="水平平均分布（至少 3 個）" disabled={nSel < 3} onClick={() => editor().distribute('h')}><AlignHorizontalDistributeCenter size={15} /></IconButton>
        <IconButton label="垂直平均分布（至少 3 個）" disabled={nSel < 3} onClick={() => editor().distribute('v')}><AlignVerticalDistributeCenter size={15} /></IconButton>
      </div>
      {sep}
      <IconButton label="移到最上層（Shift+]）" disabled={!nSel} onClick={() => editor().zOrder('top')}><ArrowUpToLine size={15} /></IconButton>
      <IconButton label="移到最下層（Shift+[）" disabled={!nSel} onClick={() => editor().zOrder('bottom')}><ArrowDownToLine size={15} /></IconButton>
      <div className="ml-auto pr-1 font-mono text-[11.5px] text-fg-dim tabular-nums">
        {page.width} × {page.height}
      </div>
    </div>
  );
}

export default function CanvasView() {
  const page = useEditor(currentPage);
  const project = useEditor((s) => s.project);
  const selection = useEditor((s) => s.selection);
  const view = useEditor((s) => s.view);
  const imagesVersion = useImagesVersion(project.assets);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rulerH = useRef<HTMLCanvasElement>(null);
  const rulerV = useRef<HTMLCanvasElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const wheelAcc = useRef(0);
  const fittedFor = useRef<string | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [hoverId, setHoverId] = useState<Id | null>(null);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const [panning, setPanning] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const { zoom, panX, panY } = view;

  // viewport size
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fit = useCallback(() => {
    const s = editor();
    const p = currentPage(s);
    const el = stageRef.current;
    if (!el) return;
    const w = el.clientWidth, h = el.clientHeight;
    const z = fitZoom(w, h, p.width, p.height);
    s.setView({ zoom: z, panX: Math.round((w - p.width * z) / 2), panY: Math.round((h - p.height * z) / 2) });
  }, []);

  // fit when the page changes or the viewport is first measured
  useEffect(() => {
    if (!size) return;
    if (fittedFor.current === page.id) return;
    fittedFor.current = page.id;
    fit();
  }, [page.id, size, fit]);

  // render the page bitmap
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const raf = requestAnimationFrame(() => {
      if (c.width !== page.width) c.width = page.width;
      if (c.height !== page.height) c.height = page.height;
      renderPage(ctx as unknown as Ctx2D, page, project, renderEnv(project.assets));
    });
    return () => cancelAnimationFrame(raf);
  }, [page, project, imagesVersion]);

  const selectedEls = page.elements.filter((e) => selection.includes(e.id));
  const selBox = bbox(selectedEls);

  // rulers
  useEffect(() => {
    if (!size) return;
    drawRuler(rulerH.current, 'h', size.w, panX, zoom, page.width, selBox ? [selBox.x, selBox.x + selBox.w] : null, cursor?.x ?? null);
    drawRuler(rulerV.current, 'v', size.h, panY, zoom, page.height, selBox ? [selBox.y, selBox.y + selBox.h] : null, cursor?.y ?? null);
  }, [size, panX, panY, zoom, page.width, page.height, selBox?.x, selBox?.y, selBox?.w, selBox?.h, cursor?.x, cursor?.y]); // eslint-disable-line react-hooks/exhaustive-deps

  // wheel zoom (non-passive so we can prevent page scroll)
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = editor().view;
      if (e.shiftKey || e.altKey) {
        editor().setView({ panX: v.panX - (e.deltaX || e.deltaY), panY: v.panY - (e.shiftKey ? 0 : e.deltaY) });
        return;
      }
      wheelAcc.current += e.deltaY;
      const threshold = e.ctrlKey ? 12 : 60;
      if (Math.abs(wheelAcc.current) < threshold) return;
      const dir = wheelAcc.current > 0 ? -1 : 1;
      wheelAcc.current = 0;
      const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom + dir));
      if (z === v.zoom) return;
      const r = el.getBoundingClientRect();
      editor().setView({ zoom: z, ...zoomAround(v.panX, v.panY, e.clientX - r.left, e.clientY - r.top, v.zoom, z) });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // space = temporary pan tool; 0 / - / = zoom shortcuts
  useEffect(() => {
    const typing = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
    };
    const down = (e: KeyboardEvent) => {
      if (typing(e.target) || e.metaKey || e.ctrlKey) return;
      if (e.code === 'Space') {
        e.preventDefault();
        setSpaceDown(true);
      } else if (e.key === '0') fit();
      else if (e.key === '=' || e.key === '+' || e.key === '-') {
        const v = editor().view;
        const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom + (e.key === '-' ? -1 : 1)));
        const el = stageRef.current;
        if (z !== v.zoom && el) editor().setView({ zoom: z, ...zoomAround(v.panX, v.panY, el.clientWidth / 2, el.clientHeight / 2, v.zoom, z) });
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceDown(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [fit]);

  const toPage = (clientX: number, clientY: number) => {
    const r = stageRef.current!.getBoundingClientRect();
    const v = editor().view;
    return { x: (clientX - r.left - v.panX) / v.zoom, y: (clientY - r.top - v.panY) / v.zoom };
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button === 2) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const s = editor();
    if (e.button === 1 || spaceDown) {
      e.preventDefault();
      gesture.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, panX: s.view.panX, panY: s.view.panY };
      setPanning(true);
      return;
    }
    const handle = (e.target as HTMLElement).dataset.handle as Handle | undefined;
    const pg = currentPage(s);
    if (handle && s.selection.length === 1) {
      const el = pg.elements.find((x) => x.id === s.selection[0]);
      if (el && !el.locked) {
        gesture.current = { kind: 'resize', sx: e.clientX, sy: e.clientY, id: el.id, handle, origin: { x: el.x, y: el.y, w: el.w, h: el.h }, started: false };
        return;
      }
    }
    const p = toPage(e.clientX, e.clientY);
    const hit = hitTest(pg.elements, p.x, p.y);
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    if (hit) {
      if (additive) {
        s.toggleSelect(hit.id);
        return;
      }
      let ids = s.selection;
      if (!ids.includes(hit.id)) {
        ids = [hit.id];
        s.select(ids);
      }
      const els = pg.elements.filter((x) => ids.includes(x.id) && !x.locked);
      gesture.current = { kind: 'move', sx: e.clientX, sy: e.clientY, ids: els.map((x) => x.id), origin: els.map((x) => ({ x: x.x, y: x.y, w: x.w, h: x.h })), started: false };
      return;
    }
    if (!additive) s.select([]);
    gesture.current = { kind: 'marquee', px: p.x, py: p.y, base: additive ? s.selection : [] };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    const s = editor();
    const p = toPage(e.clientX, e.clientY);
    setCursor({ x: Math.floor(p.x), y: Math.floor(p.y) });
    if (!g) {
      const pg = currentPage(s);
      const hit = spaceDown ? null : hitTest(pg.elements, p.x, p.y);
      setHoverId(hit?.id ?? null);
      return;
    }
    const z = s.view.zoom;
    switch (g.kind) {
      case 'pan':
        s.setView({ panX: g.panX + e.clientX - g.sx, panY: g.panY + e.clientY - g.sy });
        return;
      case 'move': {
        let dx = (e.clientX - g.sx) / z, dy = (e.clientY - g.sy) / z;
        if (!g.started) {
          if (Math.hypot(e.clientX - g.sx, e.clientY - g.sy) < 3 || !g.ids.length) return;
          g.started = true;
          s.beginGesture();
        }
        if (e.shiftKey) {
          if (Math.abs(dx) > Math.abs(dy)) dy = 0;
          else dx = 0;
        }
        const d = snapMoveDelta(g.origin, dx, dy, s.view.snap);
        const byId = new Map(g.ids.map((id, i) => [id, g.origin[i]]));
        s.updateGesture((base) => updateElements(base, s.pageId, g.ids, (el) => {
          const o = byId.get(el.id)!;
          return { x: o.x + d.dx, y: o.y + d.dy };
        }));
        return;
      }
      case 'resize': {
        if (!g.started) {
          g.started = true;
          s.beginGesture();
        }
        const el = currentPage(s).elements.find((x) => x.id === g.id);
        if (!el) return;
        const r = resizeRect(g.origin, g.handle, (e.clientX - g.sx) / z, (e.clientY - g.sy) / z, {
          snap: s.view.snap,
          keepAspect: e.shiftKey || el.type === 'image',
        });
        const patch = rectPatchFor(el, r, g.handle);
        s.updateGesture((base) => updateElements(base, s.pageId, [g.id], patch));
        return;
      }
      case 'marquee': {
        const r = rectFromPoints(g.px, g.py, p.x, p.y);
        setMarquee(r);
        const pg = currentPage(s);
        const ids = pg.elements.filter((x) => !x.hidden && !x.locked && rectsIntersect(x, r)).map((x) => x.id);
        s.select([...new Set([...g.base, ...ids])]);
        return;
      }
    }
  };

  const onPointerUp = () => {
    const g = gesture.current;
    gesture.current = null;
    setMarquee(null);
    setPanning(false);
    if (g && (g.kind === 'move' || g.kind === 'resize') && g.started) editor().endGesture();
  };

  const onDrop = async (e: ReactDragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDropActive(false);
    const p = toPage(e.clientX, e.clientY);
    const t = e.dataTransfer.getData(DND_ELEMENT) as ElementType;
    if (t) {
      addElementOfType(t, p);
      return;
    }
    const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith('image/'));
    for (const f of files) {
      try {
        const s = editor();
        const { asset, note } = await fileToAsset(f, s.project);
        const pg = currentPage(s);
        const k = Math.min(1, pg.width / asset.w, pg.height / asset.h);
        const w = Math.max(1, Math.round(asset.w * k)), h = Math.max(1, Math.round(asset.h * k));
        const el = createElement('image', { name: asset.name.replace(/\.[a-z0-9]+$/i, '') || '圖片', assetId: asset.id, w, h, x: Math.round(p.x - w / 2), y: Math.round(p.y - h / 2), fit: 'stretch' });
        s.commit((proj) => addElements({ ...proj, assets: { ...proj.assets, [asset.id]: asset } }, s.pageId, [el]), { select: [el.id] });
        if (note) s.toast('info', note);
      } catch (err) {
        editor().toast('error', err instanceof Error ? err.message : '無法加入圖片。');
      }
    }
  };

  const W = page.width * zoom, H = page.height * zoom;
  const gridStep = view.snap > 1 ? view.snap : 8;
  const showGrid = view.showGrid && gridStep * zoom >= 6;
  const regions = view.showRegions ? computeRegions(page) : [];
  const single = selectedEls.length === 1 ? selectedEls[0] : null;
  const hoverEl = hoverId && !selection.includes(hoverId) ? page.elements.find((x) => x.id === hoverId) : undefined;
  const cursorStyle = panning ? 'grabbing' : spaceDown ? 'grab' : hoverEl || (hoverId && selection.includes(hoverId)) ? 'move' : 'default';

  return (
    <div className="flex h-full flex-col">
      <Toolbar onFit={fit} />
      <div className="relative min-h-0 flex-1">
        <div className="absolute top-0 left-0 z-20 flex h-5 w-5 items-center justify-center border-r border-b border-line bg-ink-900 font-mono text-[8px] text-fg-dim">px</div>
        <canvas ref={rulerH} className="absolute top-0 right-0 left-5 z-10 h-5" style={{ width: size ? size.w : undefined }} aria-hidden />
        <canvas ref={rulerV} className="absolute top-5 bottom-0 left-0 z-10 w-5" style={{ height: size ? size.h : undefined }} aria-hidden />
        <div
          ref={stageRef}
          data-stage
          className={cx('stage-bg absolute top-5 right-0 bottom-0 left-5 touch-none overflow-hidden select-none', dropActive && 'ring-2 ring-accent/60 ring-inset')}
          style={{ cursor: cursorStyle }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={() => {
            setHoverId(null);
            setCursor(null);
          }}
          onDoubleClick={(e) => {
            const p = toPage(e.clientX, e.clientY);
            const hit = hitTest(page.elements, p.x, p.y);
            if (hit) {
              editor().select([hit.id]);
              editor().requestTextFocus();
            }
          }}
          onDragOver={(e) => {
            const types = [...e.dataTransfer.types];
            if (types.includes(DND_ELEMENT) || types.includes('Files')) {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
              setDropActive(true);
            }
          }}
          onDragLeave={() => setDropActive(false)}
          onDrop={(e) => void onDrop(e)}
        >
          <div className="absolute top-0 left-0" style={{ transform: `translate(${panX}px, ${panY}px)`, width: W, height: H }}>
            <div className="checker absolute inset-0 shadow-[0_0_0_1px_#2c313b,0_12px_40px_rgba(0,0,0,0.45)]" />
            <canvas
              ref={canvasRef}
              width={page.width}
              height={page.height}
              className="pixelated absolute inset-0"
              style={{ width: W, height: H }}
              role="img"
              aria-label={`頁面「${page.title}」預覽`}
            />
            {showGrid && (
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  backgroundImage:
                    'linear-gradient(to right, rgba(255,255,255,0.07) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.07) 1px, transparent 1px)',
                  backgroundSize: `${gridStep * zoom}px ${gridStep * zoom}px`,
                }}
              />
            )}
            {regions.map((r) => (
              <div
                key={r.elementId}
                className="pointer-events-none absolute border border-dashed border-info/80 bg-info/15"
                style={{ left: r.x * zoom, top: r.y * zoom, width: r.w * zoom, height: r.h * zoom }}
              />
            ))}
            {hoverEl && (
              <div
                className="pointer-events-none absolute outline-1 outline-accent/60 outline-dashed"
                style={{ left: hoverEl.x * zoom, top: hoverEl.y * zoom, width: hoverEl.w * zoom, height: hoverEl.h * zoom }}
              />
            )}
            {selectedEls.map((el) => (
              <div
                key={el.id}
                className={cx('pointer-events-none absolute outline-1 outline-accent', el.locked ? 'outline-dashed' : 'outline-solid')}
                style={{ left: el.x * zoom, top: el.y * zoom, width: el.w * zoom, height: el.h * zoom }}
              />
            ))}
            {selectedEls.length > 1 && selBox && (
              <div
                className="pointer-events-none absolute outline-1 outline-accent/50 outline-dashed"
                style={{ left: selBox.x * zoom - 2, top: selBox.y * zoom - 2, width: selBox.w * zoom + 4, height: selBox.h * zoom + 4 }}
              />
            )}
            {single && !single.locked && (
              <div className="absolute" style={{ left: single.x * zoom, top: single.y * zoom, width: single.w * zoom, height: single.h * zoom }}>
                {HANDLES.map((h) => {
                  const pos = handlePos(h, single.w * zoom, single.h * zoom);
                  return (
                    <div
                      key={h}
                      data-handle={h}
                      className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-[2px] border border-accent bg-ink-950"
                      style={{ left: pos.x, top: pos.y, cursor: HANDLE_CURSOR[h] }}
                    />
                  );
                })}
                <div className="pointer-events-none absolute left-1/2 mt-1.5 -translate-x-1/2 rounded bg-accent px-1.5 py-px font-mono text-[10px] whitespace-nowrap text-accent-ink tabular-nums" style={{ top: single.h * zoom }}>
                  {single.w} × {single.h}
                </div>
              </div>
            )}
            {marquee && (
              <div
                className="pointer-events-none absolute border border-accent/70 bg-accent/10"
                style={{ left: marquee.x * zoom, top: marquee.y * zoom, width: marquee.w * zoom, height: marquee.h * zoom }}
              />
            )}
          </div>
          {!page.elements.length && (
            <div className="pointer-events-none absolute inset-x-0 bottom-8 text-center text-[12.5px] text-fg-dim">
              從左側點選或拖曳元件到頁面上，也可以直接把圖片檔拖進來。
            </div>
          )}
          <div className="pointer-events-none absolute right-2 bottom-2 rounded-md bg-ink-900/85 px-2 py-1 font-mono text-[11px] text-fg-dim tabular-nums">
            {cursor ? `x ${cursor.x}  y ${cursor.y}` : '　'}
          </div>
        </div>
      </div>
    </div>
  );
}
