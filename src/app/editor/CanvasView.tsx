'use client';

import { Grid3x3, Maximize, Minus, MousePointerClick, Plus, ZoomIn, ZoomOut } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent, type PointerEvent as ReactPointerEvent } from 'react';
import {
  bbox, fitZoom, HANDLES, hitTest, MAX_ZOOM, MIN_ZOOM, rectFromPoints, rectPatchFor, rectsIntersect, resizeRect,
  snapMoveDelta, SNAP_STEPS, type Handle, type SnapStep,
} from '@/core/geometry';
import {
  isDoubleTap, isTap, keepInView, midpoint, panBy, pinchView, TAP_SLOP, visibleHandles, type PinchStart, type Pt,
  type TapRecord,
} from '@/core/gestures';
import { createElement } from '@/core/model/defaults';
import { addElements, updateElements } from '@/core/model/ops';
import type { ElementType, Id, Rect } from '@/core/model/types';
import { computeRegions, renderPage } from '@/core/render/renderPage';
import { fitScale } from '@/core/render/scale';
import type { Ctx2D } from '@/core/render/types';
import {
  clampZoom, crispAt, FIT_MS, ladderStep, PINCH_OVERSHOOT, restView, STEP_MS, wheelZoomFactor, ZOOM_EPS, zoomViewAround,
} from '@/core/viewAnimation';
import { renderEnv, useImagesVersion } from '../state/images';
import { mobile } from '../state/mobile';
import { fileToAsset } from '../state/persistence';
import { currentPage, editor, useEditor } from '../state/store';
import { addElementOfType } from './elementMeta';
import { useLayout } from './layoutTier';
import { DND_ELEMENT } from './LeftPanel';
import { AlignButtons, ZOrderEndButtons } from './TouchControls';
import { cx, IconButton, Segmented } from './ui';
import { useViewAnimator } from './useViewAnimator';

const RULER = 20;
/** Margin around a page that fits at a whole zoom; smaller margin for the 100 % / fractional fit (compact, others). */
const FIT_MARGIN = 48;
const FIT_MIN_MARGIN_COMPACT = 12;
const FIT_MIN_MARGIN = 24;

// Mouse / pen: drag = move / resize / marquee, middle button or Space = pan.
// Touch: one finger drags elements and handles or pans on empty space (tap = select / deselect, double tap on empty
// space = fit); two fingers pinch-zoom and pan. A second finger drops a drag in progress (no history entry).
type MoveGesture = {
  kind: 'move'; sx: number; sy: number; ids: Id[]; origin: Rect[]; started: boolean; clicked: Id;
  /** Screen px the pointer must travel before the drag starts. */
  slop: number;
  /** What a tap (no drag) does: keep only the tapped element, toggle it (多選), or nothing (it was just added). */
  onTap: 'collapse' | 'toggle' | 'none';
};
type ResizeGesture = { kind: 'resize'; sx: number; sy: number; id: Id; handle: Handle; origin: Rect; started: boolean; slop: number };
type Gesture =
  /** `tap`: a touch on empty space that has not left the tap slop yet (lifting it deselects). */
  | { kind: 'pan'; sx: number; sy: number; panX: number; panY: number; tap?: boolean }
  | MoveGesture
  | ResizeGesture
  | { kind: 'marquee'; px: number; py: number; base: Id[] }
  | { kind: 'pinch'; ids: [number, number]; start: PinchStart }
  /** Touch: ignore the remaining fingers until all are lifted. */
  | { kind: 'wait' };

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
    const len = isMajor ? 9 : (major / 2) % minor === 0 && p % (major / 2) === 0 ? 6 : 3;
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

/** Compact tier: floating zoom buttons instead of the toolbar (for users who do not pinch). */
type ZoomFn = (dir: 1 | -1) => void;

/** Zoom readout: a whole percent (0.47 -> 47 %, never 47.00000000000001 %). */
const percent = (zoom: number) => `${Math.round(zoom * 100)}%`;

function ZoomControls({ onFit, onZoom }: { onFit: () => void; onZoom: ZoomFn }) {
  const zoom = useEditor((s) => s.view.zoom);
  return (
    <div role="toolbar" aria-label="縮放" className="absolute top-7 right-2 z-20 flex items-center rounded-xl border border-ink-700 bg-ink-900/90 p-0.5 shadow-lg shadow-black/40 backdrop-blur">
      <IconButton size="lg" label="縮小" disabled={zoom <= MIN_ZOOM + ZOOM_EPS} onClick={() => onZoom(-1)}>
        <Minus size={18} />
      </IconButton>
      <span className="w-12 text-center font-mono text-[13px] text-fg-muted tabular-nums" aria-live="polite">{percent(zoom)}</span>
      <IconButton size="lg" label="放大" disabled={zoom >= MAX_ZOOM - ZOOM_EPS} onClick={() => onZoom(1)}>
        <Plus size={18} />
      </IconButton>
      <IconButton size="lg" label="符合視窗" onClick={onFit}>
        <Maximize size={17} />
      </IconButton>
    </div>
  );
}

function Toolbar({ onFit, onZoom, scroll = false }: { onFit: () => void; onZoom: ZoomFn; scroll?: boolean }) {
  const view = useEditor((s) => s.view);
  const nSel = useEditor((s) => s.selection.length);
  const page = useEditor(currentPage);
  const sep = <div className="mx-1 h-4 w-px shrink-0 bg-line" />;
  return (
    // medium tier: the toolbar is wider than the canvas column, so it scrolls sideways
    <div className={cx('flex h-10 shrink-0 items-center gap-0.5 border-b border-line bg-ink-900 px-2', scroll && 'overflow-x-auto overflow-y-hidden')} role="toolbar" aria-label="畫布工具列">
      <IconButton label="縮小（-）" onClick={() => onZoom(-1)} disabled={view.zoom <= MIN_ZOOM + ZOOM_EPS}>
        <ZoomOut size={15} />
      </IconButton>
      <span className="w-11 shrink-0 text-center font-mono text-[12px] text-fg-muted tabular-nums" aria-live="polite">{percent(view.zoom)}</span>
      <IconButton label="放大（+）" onClick={() => onZoom(1)} disabled={view.zoom >= MAX_ZOOM - ZOOM_EPS}>
        <ZoomIn size={15} />
      </IconButton>
      <IconButton label="符合視窗（0）" onClick={onFit}>
        <Maximize size={14} />
      </IconButton>
      {sep}
      <IconButton label="顯示格線" active={view.showGrid} onClick={() => editor().setView({ showGrid: !view.showGrid })}>
        <Grid3x3 size={15} />
      </IconButton>
      <span className="ml-1 mr-1 shrink-0 text-[11.5px] text-fg-dim">吸附</span>
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
        <AlignButtons nSel={nSel} />
      </div>
      {sep}
      <ZOrderEndButtons nSel={nSel} keys />
      <div className="ml-auto shrink-0 pr-1 pl-2 font-mono text-[11.5px] whitespace-nowrap text-fg-dim tabular-nums">
        {page.width} × {page.height}
      </div>
    </div>
  );
}

export default function CanvasView() {
  const { tier, coarse } = useLayout();
  const compact = tier === 'compact';
  const page = useEditor(currentPage);
  const project = useEditor((s) => s.project);
  // the page bitmap is rendered at the project's 解析度 (lowered for display only when the canvas would be too big)
  const scale = fitScale(page.width, page.height, project.settings.renderScale);
  const selection = useEditor((s) => s.selection);
  const view = useEditor((s) => s.view);
  const imagesVersion = useImagesVersion(project.assets);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rulerH = useRef<HTMLCanvasElement>(null);
  const rulerV = useRef<HTMLCanvasElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const anim = useViewAnimator();
  const fittedFor = useRef<string | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [hoverId, setHoverId] = useState<Id | null>(null);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const [panning, setPanning] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  /** Active touch points (stage px) by pointer id. */
  const touches = useRef(new Map<number, Pt>());
  const lastTap = useRef<TapRecord | null>(null);
  const lastPointerType = useRef('mouse');
  const prevSize = useRef<{ w: number; h: number } | null>(null);
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

  /** 符合視窗 / the 0 key / double tap on empty space: eased; a page switch and the first layout: at once. */
  const fit = useCallback((animated = true) => {
    const p = currentPage(editor());
    const el = stageRef.current;
    if (!el) return;
    const w = el.clientWidth, h = el.clientHeight;
    const z = fitZoom(w, h, p.width, p.height, FIT_MARGIN, compact ? FIT_MIN_MARGIN_COMPACT : FIT_MIN_MARGIN);
    anim.animateTo({ zoom: z, panX: Math.round((w - p.width * z) / 2), panY: Math.round((h - p.height * z) / 2) }, animated ? FIT_MS : 0);
  }, [anim, compact]);

  /** Zoom buttons and the = + - keys: the next ladder stop (from where a running zoom is heading), eased, around the
   * centre of the stage. */
  const zoomStep = useCallback((dir: 1 | -1) => {
    const el = stageRef.current;
    const goal = anim.target();
    const z = clampZoom(ladderStep(goal.zoom, dir));
    if (!el || Math.abs(z - goal.zoom) < ZOOM_EPS) return;
    const centre = { x: el.clientWidth / 2, y: el.clientHeight / 2 };
    anim.animateTo(restView(zoomViewAround(goal, z, centre)), STEP_MS);
  }, [anim]);

  // fit when the page changes or the viewport is first measured
  useEffect(() => {
    if (!size) return;
    if (fittedFor.current === page.id) return;
    fittedFor.current = page.id;
    fit(false);
  }, [page.id, size, fit]);

  // compact: when a sheet opens or closes the stage changes size; keep the view centre and the selection in sight
  useEffect(() => {
    if (!size) return;
    const prev = prevSize.current;
    prevSize.current = size;
    if (!compact || !prev || fittedFor.current === null || (prev.w === size.w && prev.h === size.h)) return;
    anim.finish(); // a running zoom ends where it was heading, then moves with the stage
    const s = editor();
    const box = bbox(currentPage(s).elements.filter((e) => s.selection.includes(e.id)));
    s.setView(keepInView(s.view, prev, size, box));
  }, [size, compact, anim]);

  // render the page bitmap
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const raf = requestAnimationFrame(() => {
      if (c.width !== page.width * scale) c.width = page.width * scale;
      if (c.height !== page.height * scale) c.height = page.height * scale;
      renderPage(ctx as unknown as Ctx2D, page, project, renderEnv(project.assets), { scale });
    });
    return () => cancelAnimationFrame(raf);
  }, [page, project, imagesVersion, scale]);

  const selectedEls = page.elements.filter((e) => selection.includes(e.id));
  const selBox = bbox(selectedEls);

  // rulers
  useEffect(() => {
    if (!size) return;
    drawRuler(rulerH.current, 'h', size.w, panX, zoom, page.width, selBox ? [selBox.x, selBox.x + selBox.w] : null, cursor?.x ?? null);
    drawRuler(rulerV.current, 'v', size.h, panY, zoom, page.height, selBox ? [selBox.y, selBox.y + selBox.h] : null, cursor?.y ?? null);
  }, [size, panX, panY, zoom, page.width, page.height, selBox?.x, selBox?.y, selBox?.w, selBox?.h, cursor?.x, cursor?.y]); // eslint-disable-line react-hooks/exhaustive-deps

  // wheel zoom (non-passive so we can prevent page scroll): continuous and eased around the cursor (ViewAnimator)
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.shiftKey || e.altKey) {
        anim.cancel();
        const v = editor().view;
        editor().setView({ panX: v.panX - (e.deltaX || e.deltaY), panY: v.panY - (e.shiftKey ? 0 : e.deltaY) });
        return;
      }
      const f = wheelZoomFactor(e.deltaY, e.deltaMode, e.ctrlKey);
      if (f === 1) return;
      const r = el.getBoundingClientRect();
      anim.zoomBy(f, { x: e.clientX - r.left, y: e.clientY - r.top });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [anim]);

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
      else if (e.key === '=' || e.key === '+' || e.key === '-') zoomStep(e.key === '-' ? -1 : 1);
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
  }, [fit, zoomStep]);

  const toPage = (clientX: number, clientY: number) => {
    const r = stageRef.current!.getBoundingClientRect();
    const v = editor().view;
    return { x: (clientX - r.left - v.panX) / v.zoom, y: (clientY - r.top - v.panY) / v.zoom };
  };

  const stagePt = (clientX: number, clientY: number): Pt => {
    const r = stageRef.current!.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  };

  /** Applies a move / resize drag (shared by mouse and touch). */
  const dragTo = (g: MoveGesture | ResizeGesture, clientX: number, clientY: number, shift: boolean) => {
    const s = editor();
    const z = s.view.zoom;
    if (!g.started) {
      if (Math.hypot(clientX - g.sx, clientY - g.sy) < g.slop || (g.kind === 'move' && !g.ids.length)) return;
      g.started = true;
      s.beginGesture();
    }
    if (g.kind === 'move') {
      let dx = (clientX - g.sx) / z, dy = (clientY - g.sy) / z;
      if (shift) {
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
    const el = currentPage(s).elements.find((x) => x.id === g.id);
    if (!el) return;
    const r = resizeRect(g.origin, g.handle, (clientX - g.sx) / z, (clientY - g.sy) / z, {
      snap: s.view.snap,
      keepAspect: shift || el.type === 'image',
    });
    const patch = rectPatchFor(el, r, g.handle);
    s.updateGesture((base) => updateElements(base, s.pageId, [g.id], patch));
  };

  // ---- touch

  const touchDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const pts = touches.current;
    if (e.isPrimary) pts.clear(); // first finger of a new touch sequence: forget points whose pointerup got lost
    pts.set(e.pointerId, stagePt(e.clientX, e.clientY));
    const s = editor();
    const g = gesture.current;
    if (pts.size === 2) {
      // second finger: pinch-zoom / two-finger pan; a move or resize in progress is dropped without a history entry
      if (g && (g.kind === 'move' || g.kind === 'resize') && g.started) s.cancelGesture();
      const [ia, ib] = [...pts.keys()];
      const v = s.view;
      gesture.current = { kind: 'pinch', ids: [ia, ib], start: { a: pts.get(ia)!, b: pts.get(ib)!, zoom: v.zoom, panX: v.panX, panY: v.panY } };
      lastTap.current = null;
      setCursor(null);
      return;
    }
    if (pts.size > 2) return;
    const pg = currentPage(s);
    const handle = (e.target as HTMLElement).dataset.handle as Handle | undefined;
    if (handle && s.selection.length === 1) {
      const el = pg.elements.find((x) => x.id === s.selection[0]);
      if (el && !el.locked) {
        gesture.current = { kind: 'resize', sx: e.clientX, sy: e.clientY, id: el.id, handle, origin: { x: el.x, y: el.y, w: el.w, h: el.h }, started: false, slop: TAP_SLOP };
        return;
      }
    }
    const p = toPage(e.clientX, e.clientY);
    const hit = hitTest(pg.elements, p.x, p.y);
    if (!hit) {
      gesture.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, panX: s.view.panX, panY: s.view.panY, tap: true };
      return;
    }
    let ids = s.selection;
    let onTap: MoveGesture['onTap'] = 'collapse';
    if (mobile().multiSelect) {
      // 多選: a tap on a selected element removes it; an unselected one is added at once; a drag moves them all
      if (ids.includes(hit.id)) onTap = 'toggle';
      else {
        ids = [...ids, hit.id];
        s.select(ids);
        onTap = 'none';
      }
    } else if (!ids.includes(hit.id)) {
      ids = [hit.id];
      s.select(ids);
    }
    const els = pg.elements.filter((x) => ids.includes(x.id) && !x.locked);
    gesture.current = {
      kind: 'move', sx: e.clientX, sy: e.clientY, ids: els.map((x) => x.id), origin: els.map((x) => ({ x: x.x, y: x.y, w: x.w, h: x.h })),
      started: false, clicked: hit.id, slop: TAP_SLOP, onTap,
    };
  };

  const touchMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const pts = touches.current;
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, stagePt(e.clientX, e.clientY));
    const g = gesture.current;
    if (!g) return;
    const s = editor();
    if (g.kind === 'pinch') {
      // the zoom follows the fingers (a little past the limits, springing back on release); one store update per frame
      const a = pts.get(g.ids[0]), b = pts.get(g.ids[1]);
      if (a && b) anim.follow(pinchView(g.start, a, b, MIN_ZOOM, MAX_ZOOM, PINCH_OVERSHOOT));
      return;
    }
    if (g.kind === 'pan') {
      const from = { x: g.sx, y: g.sy }, to = { x: e.clientX, y: e.clientY };
      if (g.tap && !isTap(from, to)) g.tap = false;
      s.setView(panBy(g.panX, g.panY, from, to));
      return;
    }
    if (g.kind === 'move' || g.kind === 'resize') {
      const p = toPage(e.clientX, e.clientY);
      setCursor({ x: Math.floor(p.x), y: Math.floor(p.y) });
      dragTo(g, e.clientX, e.clientY, false);
    }
  };

  const touchUp = (e: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const pts = touches.current;
    if (!pts.has(e.pointerId)) return;
    const g = gesture.current;
    if (g?.kind === 'pinch') {
      // the pinch ends with the first finger that lifts: settle (whole zoom nearby, inside the limits) around the
      // fingers' last midpoint
      const a = pts.get(g.ids[0]), b = pts.get(g.ids[1]);
      anim.settle(a && b ? midpoint(a, b) : stagePt(e.clientX, e.clientY));
    }
    pts.delete(e.pointerId);
    if (!g) return;
    if (g.kind === 'pinch' || g.kind === 'wait') {
      gesture.current = pts.size ? { kind: 'wait' } : null;
      return;
    }
    gesture.current = null;
    setCursor(null);
    const s = editor();
    if ((g.kind === 'move' || g.kind === 'resize') && g.started) {
      s.endGesture();
      lastTap.current = null;
      return;
    }
    if (cancelled || g.kind === 'resize' || g.kind === 'marquee' || (g.kind === 'pan' && !g.tap)) {
      lastTap.current = null;
      return;
    }
    // a tap
    const rec: TapRecord = { t: e.timeStamp, x: e.clientX, y: e.clientY, key: g.kind === 'move' ? g.clicked : 'empty' };
    const double = (g.kind === 'pan' || g.onTap === 'collapse') && isDoubleTap(lastTap.current, rec);
    lastTap.current = double ? null : rec;
    if (g.kind === 'pan') {
      if (double) fit();
      else s.select([]);
      return;
    }
    if (double) {
      // like a double click: edit the element's text in 屬性
      s.select([g.clicked]);
      s.requestTextFocus();
    } else if (g.onTap === 'toggle') s.toggleSelect(g.clicked);
    else if (g.onTap === 'collapse' && s.selection.length > 1) s.select([g.clicked]);
  };

  // ---- pointer events (touch is handled above; mouse and pen below)

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    lastPointerType.current = e.pointerType;
    anim.cancel(); // a running zoom stops where it is; the new gesture starts from the view on screen
    if (e.pointerType === 'touch') {
      touchDown(e);
      return;
    }
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
        gesture.current = { kind: 'resize', sx: e.clientX, sy: e.clientY, id: el.id, handle, origin: { x: el.x, y: el.y, w: el.w, h: el.h }, started: false, slop: 0 };
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
      gesture.current = {
        kind: 'move', sx: e.clientX, sy: e.clientY, ids: els.map((x) => x.id), origin: els.map((x) => ({ x: x.x, y: x.y, w: x.w, h: x.h })),
        started: false, clicked: hit.id, slop: 3, onTap: 'collapse',
      };
      return;
    }
    if (!additive) s.select([]);
    gesture.current = { kind: 'marquee', px: p.x, py: p.y, base: additive ? s.selection : [] };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') {
      touchMove(e);
      return;
    }
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
    switch (g.kind) {
      case 'pan':
        s.setView({ panX: g.panX + e.clientX - g.sx, panY: g.panY + e.clientY - g.sy });
        return;
      case 'move':
      case 'resize':
        dragTo(g, e.clientX, e.clientY, e.shiftKey);
        return;
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

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') {
      touchUp(e, e.type === 'pointercancel');
      return;
    }
    const g = gesture.current;
    gesture.current = null;
    setMarquee(null);
    setPanning(false);
    if (g && (g.kind === 'move' || g.kind === 'resize') && g.started) editor().endGesture();
    // a plain click on one element of a multi-selection selects just that element
    else if (g?.kind === 'move' && editor().selection.length > 1) editor().select([g.clicked]);
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
  const regions = useMemo(() => (view.showRegions ? computeRegions(page) : []), [view.showRegions, page]);
  // nearest-neighbour while texels are magnified on the device, the browser's smooth scaling when they shrink
  const crisp = crispAt(zoom, window.devicePixelRatio || 1, scale);
  const single = selectedEls.length === 1 ? selectedEls[0] : null;
  const hoverEl = hoverId && !selection.includes(hoverId) ? page.elements.find((x) => x.id === hoverId) : undefined;
  const cursorStyle = panning ? 'grabbing' : spaceDown ? 'grab' : hoverEl || (hoverId && selection.includes(hoverId)) ? 'move' : 'default';

  return (
    <div className="flex h-full flex-col">
      {!compact && <Toolbar onFit={() => fit()} onZoom={zoomStep} scroll={tier === 'medium'} />}
      <div className="relative min-h-0 flex-1">
        {compact && <ZoomControls onFit={() => fit()} onZoom={zoomStep} />}
        <div className="absolute top-0 left-0 z-20 flex h-5 w-5 items-center justify-center border-r border-b border-line bg-ink-900 font-mono text-[8px] text-fg-dim">px</div>
        <canvas ref={rulerH} className="absolute top-0 right-0 left-5 z-10 h-5" style={{ width: size ? size.w : undefined }} aria-hidden />
        <canvas ref={rulerV} className="absolute top-5 bottom-0 left-0 z-10 w-5" style={{ height: size ? size.h : undefined }} aria-hidden />
        <div
          ref={stageRef}
          data-stage
          className={cx('stage-bg no-callout absolute top-5 right-0 bottom-0 left-5 touch-none overflow-hidden select-none', dropActive && 'ring-2 ring-accent/60 ring-inset')}
          style={{ cursor: cursorStyle }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={() => {
            setHoverId(null);
            setCursor(null);
          }}
          onContextMenu={(e) => {
            // a long press must not open the browser's image / selection menu
            if (lastPointerType.current === 'touch') e.preventDefault();
          }}
          onDoubleClick={(e) => {
            if (lastPointerType.current === 'touch') return; // double taps are detected in touchUp
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
              width={page.width * scale}
              height={page.height * scale}
              className={cx('absolute inset-0', crisp && 'pixelated')}
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
                {(coarse ? visibleHandles(single.w * zoom, single.h * zoom) : HANDLES).map((h) => {
                  const pos = handlePos(h, single.w * zoom, single.h * zoom);
                  // coarse pointers: 28 px hit area (TOUCH_HANDLE_HIT) around a 12 px visible square
                  return coarse ? (
                    <div
                      key={h}
                      data-handle={h}
                      className="absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
                      style={{ left: pos.x, top: pos.y, cursor: HANDLE_CURSOR[h] }}
                    >
                      <span className="pointer-events-none h-3 w-3 rounded-[3px] border-2 border-accent bg-ink-950" />
                    </div>
                  ) : (
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
            <div className="pointer-events-none absolute inset-x-0 bottom-8 px-4 text-center text-[12.5px] text-fg-dim">
              {compact ? '點下方的「元件」把元件加入頁面。' : '從左側點選或拖曳元件到頁面上，也可以直接把圖片檔拖進來。'}
            </div>
          )}
          {!compact && (
            <div className="pointer-events-none absolute right-2 bottom-2 rounded-md bg-ink-900/85 px-2 py-1 font-mono text-[11px] text-fg-dim tabular-nums">
              {cursor ? `x ${cursor.x}  y ${cursor.y}` : '　'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
