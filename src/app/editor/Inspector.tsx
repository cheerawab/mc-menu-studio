'use client';

import { Copy, ImageUp, Trash, ArrowUp, ArrowDown } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { DEFAULT_FONT_STACK, DEFAULT_FOOTER_LABEL, ELEMENT_LABELS, isInteractive, PAGE_LIMITS } from '@/core/model/defaults';
import { slugify } from '@/core/model/ids';
import { assetBytes, removeUnusedAssets, usedAssetIds } from '@/core/model/ops';
import { ICON_IDS, type Action, type Element, type IconId, type InteractiveElement, type Page } from '@/core/model/types';
import { cleanCommand, validateAction } from '@/core/model/validate';
import { ICON_LABELS } from '@/core/render/icons';
import { getSkin, SKIN_LIST } from '@/core/skins';
import { fileToAsset, IMAGE_ACCEPT } from '../state/persistence';
import { currentPage, editor, useEditor } from '../state/store';
import { ELEMENT_ICON } from './elementMeta';
import { iconDataUrl } from './iconImages';
import { useLayout } from './layoutTier';
import { Button, ColorInput, cx, Field, IconButton, NumberInput, Section, Segmented, Select, TextArea, TextInput, Toggle } from './ui';

type Patch = Partial<Element>;

function useSetter(el: Element) {
  return (patch: Patch, key?: string) =>
    editor().updateElement(el.id, patch, key ?? `${Object.keys(patch).join(',')}:${el.id}`);
}

const grid2 = 'grid grid-cols-2 gap-x-2 gap-y-2.5';

/** Last "focus the text field" request that was served (survives inspector remounts). */
let handledFocusNonce = 0;

/* ------------------------------------------------------------------ action */

const ACTION_OPTIONS: { value: Action['type']; label: string }[] = [
  { value: 'none', label: '無動作' },
  { value: 'page', label: '開啟頁面' },
  { value: 'command', label: '執行指令' },
  { value: 'url', label: '開啟網址' },
  { value: 'copy', label: '複製文字到剪貼簿' },
  { value: 'close', label: '關閉選單' },
];

function ActionEditor({ el }: { el: InteractiveElement }) {
  const project = useEditor((s) => s.project);
  const pageId = useEditor((s) => s.pageId);
  const set = useSetter(el);
  const a = el.action;
  const problem = validateAction(a, project, pageId);
  const change = (type: Action['type']) => {
    const other = project.pages.find((p) => p.id !== pageId) ?? project.pages[0];
    const next: Action =
      type === 'page' ? { type, pageId: other.id } : type === 'command' ? { type, command: '' } : type === 'url' ? { type, url: 'https://' }
        : type === 'copy' ? { type, text: '' } : { type } as Action;
    set({ action: next } as Patch, `action-type:${el.id}`);
  };
  return (
    <div className="flex flex-col gap-2.5">
      <Field label="點擊後">
        <Select ariaLabel="點擊動作" value={a.type} onChange={change} options={ACTION_OPTIONS} />
      </Field>
      {a.type === 'page' && (
        <Field label="目標頁面">
          <Select
            ariaLabel="目標頁面"
            value={a.pageId}
            onChange={(id) => set({ action: { type: 'page', pageId: id } } as Patch)}
            options={[
              ...(project.pages.some((p) => p.id === a.pageId) ? [] : [{ value: a.pageId, label: '（頁面已刪除）' }]),
              ...project.pages.map((p) => ({ value: p.id, label: `${p.title || '無標題'}（${p.key}）` })),
            ]}
          />
        </Field>
      )}
      {a.type === 'command' && (
        <Field label="指令" hint="以玩家身分執行，需要對應權限；不需要輸入開頭的 /。">
          <div className="flex items-center rounded-md border border-ink-700 bg-ink-850 focus-within:border-accent">
            <span className="pl-2 font-mono text-[12px] text-fg-dim">/</span>
            <input
              aria-label="指令"
              className="h-7 min-w-0 flex-1 bg-transparent px-1 font-mono text-[12px] text-fg outline-none placeholder:text-fg-dim"
              placeholder="time set day"
              spellCheck={false}
              value={a.command}
              onChange={(e) => set({ action: { type: 'command', command: e.target.value.replace(/^\//, '') } } as Patch)}
              onBlur={() => set({ action: { type: 'command', command: cleanCommand(a.command) } } as Patch)}
            />
          </div>
        </Field>
      )}
      {a.type === 'url' && (
        <Field label="網址" hint="玩家點擊時，遊戲會先跳出確認視窗。">
          <TextInput ariaLabel="網址" mono value={a.url} onChange={(v) => set({ action: { type: 'url', url: v } } as Patch)} />
        </Field>
      )}
      {a.type === 'copy' && (
        <Field label="要複製的文字">
          <TextInput ariaLabel="要複製的文字" value={a.text} onChange={(v) => set({ action: { type: 'copy', text: v } } as Patch)} />
        </Field>
      )}
      {problem && (
        <p className={cx('rounded-md px-2 py-1.5 text-[11.5px] leading-snug', problem.severity === 'error' ? 'bg-danger/10 text-danger' : 'bg-warn/10 text-warn')}>
          {problem.message}
        </p>
      )}
      <Field label="滑鼠提示（選填）">
        <TextArea
          aria-label="滑鼠提示"
          rows={2}
          className="min-h-12"
          placeholder="玩家把游標停在上面時顯示的文字"
          value={el.tooltip}
          onChange={(e) => set({ tooltip: e.target.value })}
        />
      </Field>
    </div>
  );
}

/* ------------------------------------------------------------------ pickers */

function IconPicker({ value, onChange, tint, allowNone }: { value: IconId | null; onChange: (v: IconId | null) => void; tint?: string | null; allowNone?: boolean }) {
  return (
    <div className="grid grid-cols-7 gap-1" role="radiogroup" aria-label="選擇圖示">
      {allowNone && (
        <button
          type="button"
          role="radio"
          aria-checked={value === null}
          title="不使用圖示"
          onClick={() => onChange(null)}
          className={cx('flex h-8 items-center justify-center rounded-md border text-[10.5px] text-fg-dim', value === null ? 'border-accent bg-accent/10' : 'border-ink-700 hover:border-ink-500')}
        >
          無
        </button>
      )}
      {ICON_IDS.map((id) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={value === id}
          title={ICON_LABELS[id]}
          aria-label={ICON_LABELS[id]}
          onClick={() => onChange(id)}
          className={cx('flex h-8 items-center justify-center rounded-md border bg-ink-850', value === id ? 'border-accent bg-accent/10' : 'border-ink-700 hover:border-ink-500')}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={iconDataUrl(id, tint ?? null)} alt="" width={16} height={16} className="pixelated" />
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ element */

function ImageFields({ el }: { el: Extract<Element, { type: 'image' }> }) {
  const assets = useEditor((s) => s.project.assets);
  const set = useSetter(el);
  const fileRef = useRef<HTMLInputElement>(null);
  const asset = el.assetId ? assets[el.assetId] : undefined;
  const upload = async (file: File | undefined) => {
    if (!file) return;
    try {
      const s = editor();
      const { asset: a, note } = await fileToAsset(file, s.project);
      const first = !el.assetId;
      s.commit((p) => {
        const withAsset = { ...p, assets: { ...p.assets, [a.id]: a } };
        const page = withAsset.pages.find((pg) => pg.id === s.pageId);
        if (!page) return withAsset;
        return {
          ...withAsset,
          pages: withAsset.pages.map((pg) => pg.id !== page.id ? pg : {
            ...pg,
            elements: pg.elements.map((x) => x.id !== el.id ? x : { ...x, assetId: a.id, ...(first ? { w: Math.min(a.w, pg.width), h: Math.min(a.h, pg.height) } : {}) } as Element),
          }),
        };
      });
      if (note) s.toast('info', note);
    } catch (err) {
      editor().toast('error', err instanceof Error ? err.message : '上傳失敗。');
    }
  };
  const list = Object.values(assets);
  return (
    <Section title="圖片">
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2 rounded-md border border-ink-700 bg-ink-850 p-2">
          <div className="checker flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {asset ? <img src={asset.dataUrl} alt="" className={cx('max-h-full max-w-full', !el.smoothing && 'pixelated')} /> : <ImageUp size={18} className="text-fg-dim" />}
          </div>
          <div className="min-w-0 flex-1 text-[11.5px]">
            <div className="truncate text-fg">{asset ? asset.name : '尚未選擇圖片'}</div>
            <div className="text-fg-dim">{asset ? `${asset.w} × ${asset.h} 像素` : 'PNG、JPG、WebP，最大 2 MB'}</div>
          </div>
        </div>
        <input ref={fileRef} type="file" accept={IMAGE_ACCEPT} className="hidden" tabIndex={-1} aria-hidden onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ''; }} />
        <Button size="sm" onClick={() => fileRef.current?.click()}>
          <ImageUp size={14} /> {asset ? '更換圖片' : '上傳圖片'}
        </Button>
        {list.length > 1 && (
          <Field label="或使用專案內的圖片">
            <Select
              ariaLabel="選擇已上傳的圖片"
              value={el.assetId ?? ''}
              onChange={(v) => set({ assetId: v || null } as Patch)}
              options={[{ value: '', label: '（無）' }, ...list.map((a) => ({ value: a.id, label: `${a.name}（${a.w}×${a.h}）` }))]}
            />
          </Field>
        )}
        <div className={grid2}>
          <Field label="縮放方式">
            <Select
              ariaLabel="縮放方式"
              value={el.fit}
              onChange={(v) => set({ fit: v } as Patch)}
              options={[
                { value: 'stretch', label: '拉伸填滿' },
                { value: 'contain', label: '等比容納' },
                { value: 'cover', label: '等比裁切' },
                { value: 'original', label: '原始尺寸' },
              ]}
            />
          </Field>
          <Field label="取樣">
            <Segmented
              label="取樣方式"
              size="sm"
              value={el.smoothing ? 'smooth' : 'nearest'}
              onChange={(v) => set({ smoothing: v === 'smooth' } as Patch)}
              options={[{ value: 'nearest', label: '像素' }, { value: 'smooth', label: '平滑' }]}
            />
          </Field>
          {el.fit === 'original' && (
            <Field label="倍率">
              <NumberInput ariaLabel="倍率" value={el.scale} min={1} max={16} suffix="×" onChange={(v) => set({ scale: v } as Patch)} />
            </Field>
          )}
        </div>
        {asset && (
          <div className="flex items-center gap-1.5">
            <span className="text-[11.5px] text-fg-dim">套用原始比例</span>
            {[1, 2, 3].map((k) => (
              <Button key={k} size="sm" variant="ghost" onClick={() => set({ w: asset.w * k, h: asset.h * k })}>
                ×{k}
              </Button>
            ))}
          </div>
        )}
      </div>
    </Section>
  );
}

function TypeFields({ el }: { el: Element }) {
  const set = useSetter(el);
  const skin = getSkin(useEditor((s) => s.project.skinId));
  const nonce = useEditor((s) => s.focusTextNonce);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const inputRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (nonce <= handledFocusNonce) return;
    handledFocusNonce = nonce;
    const t = textRef.current ?? inputRef.current?.querySelector('input');
    t?.focus();
    t?.select();
  }, [nonce]);

  switch (el.type) {
    case 'panel':
      return (
        <Section title="面板">
          <div className={grid2}>
            <Field label="樣式" wide>
              <Segmented label="面板樣式" value={el.variant} onChange={(v) => set({ variant: v } as Patch)}
                options={[{ value: 'raised', label: '凸起' }, { value: 'inset', label: '凹陷' }, { value: 'flat', label: '平面' }]} />
            </Field>
            <Field label="填色" wide><ColorInput ariaLabel="填色" value={el.fill} fallback={skin.swatches[0]} onChange={(v) => set({ fill: v } as Patch)} /></Field>
            <Field label="邊框色" wide><ColorInput ariaLabel="邊框色" value={el.border} onChange={(v) => set({ border: v } as Patch)} /></Field>
          </div>
        </Section>
      );
    case 'button':
      return (
        <Section title="按鈕">
          <div className={grid2}>
            <Field label="文字" wide>
              <div ref={inputRef}><TextInput ariaLabel="按鈕文字" value={el.text} onChange={(v) => set({ text: v } as Patch)} /></div>
            </Field>
            <Field label="字級"><NumberInput ariaLabel="字級" value={el.fontSize} min={6} max={72} suffix="px" onChange={(v) => set({ fontSize: v } as Patch)} /></Field>
            <Field label="樣式">
              <Select ariaLabel="按鈕樣式" value={el.variant} onChange={(v) => set({ variant: v } as Patch)}
                options={[{ value: 'default', label: '一般' }, { value: 'primary', label: '主要（強調色）' }, { value: 'danger', label: '危險' }, { value: 'disabled', label: '停用外觀' }]} />
            </Field>
            <div className="col-span-2"><Toggle label="粗體" checked={el.bold} onChange={(v) => set({ bold: v } as Patch)} /></div>
            <Field label="文字顏色" wide><ColorInput ariaLabel="文字顏色" value={el.textColor} onChange={(v) => set({ textColor: v } as Patch)} /></Field>
            <Field label="底色" wide><ColorInput ariaLabel="按鈕底色" value={el.fill} onChange={(v) => set({ fill: v } as Patch)} /></Field>
            <Field label="圖示（按鈕高度需 ≥ 20）" wide>
              <IconPicker allowNone value={el.icon} onChange={(v) => set({ icon: v } as Patch)} />
            </Field>
          </div>
        </Section>
      );
    case 'label':
      return (
        <Section title="文字">
          <div className={grid2}>
            <Field label="內容（可換行）" wide>
              <TextArea ref={textRef} aria-label="文字內容" rows={3} value={el.text} onChange={(e) => set({ text: e.target.value } as Patch)} />
            </Field>
            <Field label="字級"><NumberInput ariaLabel="字級" value={el.fontSize} min={6} max={72} suffix="px" onChange={(v) => set({ fontSize: v } as Patch)} /></Field>
            <Field label="行高"><NumberInput ariaLabel="行高" value={el.lineHeight} min={0.8} max={3} step={0.05} suffix="倍" onChange={(v) => set({ lineHeight: v } as Patch)} /></Field>
            <Field label="顏色" wide><ColorInput ariaLabel="文字顏色" value={el.color} fallback={skin.text.color} onChange={(v) => set({ color: v } as Patch)} /></Field>
            <Field label="水平對齊">
              <Segmented label="水平對齊" size="sm" value={el.align} onChange={(v) => set({ align: v } as Patch)}
                options={[{ value: 'left', label: '左' }, { value: 'center', label: '中' }, { value: 'right', label: '右' }]} />
            </Field>
            <Field label="垂直對齊">
              <Segmented label="垂直對齊" size="sm" value={el.vAlign} onChange={(v) => set({ vAlign: v } as Patch)}
                options={[{ value: 'top', label: '上' }, { value: 'middle', label: '中' }, { value: 'bottom', label: '下' }]} />
            </Field>
            <div className="col-span-2 flex flex-wrap gap-x-4 gap-y-2">
              <Toggle label="粗體" checked={el.bold} onChange={(v) => set({ bold: v } as Patch)} />
              <Toggle label="陰影" checked={el.shadow} onChange={(v) => set({ shadow: v } as Patch)} />
              <Toggle label="自動換行" checked={el.wrap} onChange={(v) => set({ wrap: v } as Patch)} />
            </div>
            <Field label="像素化" wide hint="把文字邊緣變成銳利像素。自動：13px 以下開啟。">
              <Segmented label="像素化" size="sm" value={el.pixelate} onChange={(v) => set({ pixelate: v } as Patch)}
                options={[{ value: 'auto', label: '自動' }, { value: 'on', label: '開' }, { value: 'off', label: '關' }]} />
            </Field>
            <Field label="字型（選填）" wide>
              <TextInput ariaLabel="字型" value={el.fontFamily} placeholder="使用專案預設字型" onChange={(v) => set({ fontFamily: v } as Patch)} />
            </Field>
          </div>
        </Section>
      );
    case 'image':
      return <ImageFields el={el} />;
    case 'bar':
      return (
        <Section title="進度條">
          <div className={grid2}>
            <Field label={`數值：${Math.round(el.value)}%`} wide>
              <input type="range" aria-label="數值" min={0} max={100} value={el.value} className="w-full accent-[var(--color-accent)]" onChange={(e) => set({ value: Number(e.target.value) } as Patch)} />
            </Field>
            <Field label="分段數（0 = 連續）"><NumberInput ariaLabel="分段數" value={el.segments} min={0} max={50} onChange={(v) => set({ segments: v } as Patch)} /></Field>
            <Field label="標籤文字"><TextInput ariaLabel="標籤文字" value={el.text} placeholder="例如 72%" onChange={(v) => set({ text: v } as Patch)} /></Field>
            <Field label="填色" wide><ColorInput ariaLabel="填色" value={el.color} onChange={(v) => set({ color: v } as Patch)} /></Field>
            <Field label="底色" wide><ColorInput ariaLabel="底色" value={el.trackColor} onChange={(v) => set({ trackColor: v } as Patch)} /></Field>
          </div>
        </Section>
      );
    case 'shape':
      return (
        <Section title="形狀">
          <div className={grid2}>
            <Field label="形狀" wide>
              <Segmented label="形狀" value={el.shape} onChange={(v) => set({ shape: v } as Patch)}
                options={[{ value: 'rect', label: '矩形' }, { value: 'rounded', label: '圓角' }, { value: 'ellipse', label: '橢圓' }]} />
            </Field>
            {el.shape === 'rounded' && (
              <Field label="圓角半徑"><NumberInput ariaLabel="圓角半徑" value={el.radius} min={0} max={64} suffix="px" onChange={(v) => set({ radius: v } as Patch)} /></Field>
            )}
            <Field label="填色" wide><ColorInput ariaLabel="填色" allowNull={false} value={el.fill} onChange={(v) => v && set({ fill: v } as Patch)} /></Field>
            <div className="col-span-2">
              <Toggle label="漸層" checked={!!el.gradient} onChange={(v) => set({ gradient: v ? { to: '#000000', direction: 'vertical' } : null } as Patch)} />
            </div>
            {el.gradient && (
              <>
                <Field label="漸層終點色" wide>
                  <ColorInput ariaLabel="漸層終點色" allowNull={false} value={el.gradient.to} onChange={(v) => v && set({ gradient: { ...el.gradient!, to: v } } as Patch)} />
                </Field>
                <Field label="方向" wide>
                  <Segmented label="漸層方向" size="sm" value={el.gradient.direction} onChange={(v) => set({ gradient: { ...el.gradient!, direction: v } } as Patch)}
                    options={[{ value: 'vertical', label: '上 → 下' }, { value: 'horizontal', label: '左 → 右' }]} />
                </Field>
              </>
            )}
            <Field label="邊框（留空 = 無邊框）" wide><ColorInput ariaLabel="邊框色" value={el.stroke} onChange={(v) => set({ stroke: v } as Patch)} /></Field>
            {el.stroke && <Field label="邊框粗細"><NumberInput ariaLabel="邊框粗細" value={el.strokeWidth} min={1} max={16} suffix="px" onChange={(v) => set({ strokeWidth: v } as Patch)} /></Field>}
          </div>
        </Section>
      );
    case 'divider':
      return (
        <Section title="分隔線">
          <div className={grid2}>
            <Field label="方向" wide>
              <Segmented label="方向" value={el.orientation}
                onChange={(v) => v !== el.orientation && set({ orientation: v, w: el.h, h: el.w } as Patch)}
                options={[{ value: 'horizontal', label: '水平' }, { value: 'vertical', label: '垂直' }]} />
            </Field>
            <Field label="樣式">
              <Select ariaLabel="線條樣式" value={el.style} onChange={(v) => set({ style: v } as Patch)}
                options={[{ value: 'skin', label: '主題樣式' }, { value: 'solid', label: '實線' }, { value: 'dashed', label: '虛線' }, { value: 'dotted', label: '點線' }]} />
            </Field>
            <Field label="粗細"><NumberInput ariaLabel="粗細" value={el.thickness} min={1} max={16} suffix="px" onChange={(v) => set({ thickness: v } as Patch)} /></Field>
            <Field label="顏色" wide><ColorInput ariaLabel="線條顏色" value={el.color} fallback={skin.text.muted} onChange={(v) => set({ color: v } as Patch)} /></Field>
          </div>
        </Section>
      );
    case 'slotgrid':
      return (
        <Section title="物品格">
          <div className={grid2}>
            <Field label="欄數"><NumberInput ariaLabel="欄數" value={el.cols} min={1} max={40} onChange={(v) => set({ cols: v } as Patch)} /></Field>
            <Field label="列數"><NumberInput ariaLabel="列數" value={el.rows} min={1} max={30} onChange={(v) => set({ rows: v } as Patch)} /></Field>
            <Field label="格子大小"><NumberInput ariaLabel="格子大小" value={el.slotSize} min={8} max={64} suffix="px" onChange={(v) => set({ slotSize: v } as Patch)} /></Field>
            <Field label="間距"><NumberInput ariaLabel="間距" value={el.gap} min={0} max={64} suffix="px" onChange={(v) => set({ gap: v } as Patch)} /></Field>
          </div>
        </Section>
      );
    case 'icon':
      return (
        <Section title="圖示">
          <div className="flex flex-col gap-2.5">
            <IconPicker value={el.icon} tint={el.tint} onChange={(v) => v && set({ icon: v } as Patch)} />
            <div className={grid2}>
              <Field label="倍率">
                <Segmented label="倍率" size="sm" value={Math.min(el.scale, 4)} onChange={(v) => set({ scale: v } as Patch)}
                  options={[1, 2, 3, 4].map((k) => ({ value: k, label: `${k}×` }))} />
              </Field>
              <Field label="尺寸"><div className="flex h-7 items-center font-mono text-[12px] text-fg-muted">{el.w} × {el.h}</div></Field>
              <Field label="染色（留空 = 原色）" wide><ColorInput ariaLabel="染色" value={el.tint} onChange={(v) => set({ tint: v } as Patch)} /></Field>
            </div>
          </div>
        </Section>
      );
  }
}

function ElementInspector({ el }: { el: Element }) {
  const set = useSetter(el);
  const Icon = ELEMENT_ICON[el.type];
  const derived = el.type === 'slotgrid' || el.type === 'icon';
  return (
    <div>
      <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent/12 text-accent"><Icon size={15} /></span>
        <div className="min-w-0 flex-1">
          <input
            aria-label="元件名稱"
            className="h-6 w-full rounded border border-transparent bg-transparent px-1 text-[13px] font-medium text-fg hover:border-ink-700 focus:border-accent focus:outline-none"
            value={el.name}
            onChange={(e) => set({ name: e.target.value })}
          />
          <div className="px-1 text-[11px] text-fg-dim">{ELEMENT_LABELS[el.type]}</div>
        </div>
        <IconButton label="複製一份（⌘D）" size="sm" onClick={() => editor().duplicateSelected()}><Copy size={14} /></IconButton>
        <IconButton label="上移一層（]）" size="sm" onClick={() => editor().zOrder('up')}><ArrowUp size={14} /></IconButton>
        <IconButton label="下移一層（[）" size="sm" onClick={() => editor().zOrder('down')}><ArrowDown size={14} /></IconButton>
        <IconButton label="刪除（Delete）" size="sm" onClick={() => editor().deleteSelected()} disabled={el.locked}><Trash size={14} /></IconButton>
      </div>
      <Section title="位置與大小">
        <div className="grid grid-cols-4 gap-1.5">
          {(['x', 'y', 'w', 'h'] as const).map((k) => (
            <Field key={k} label={k.toUpperCase()}>
              <NumberInput
                ariaLabel={{ x: 'X 座標', y: 'Y 座標', w: '寬度', h: '高度' }[k]}
                value={el[k]}
                min={k === 'w' || k === 'h' ? 1 : -2000}
                max={4000}
                disabled={el.locked || (derived && (k === 'w' || k === 'h'))}
                onChange={(v) => set({ [k]: v } as Patch)}
              />
            </Field>
          ))}
        </div>
        <div className="mt-2.5 flex items-center gap-3">
          <span className="w-12 text-[11.5px] text-fg-dim">不透明度</span>
          <input type="range" aria-label="不透明度" min={0} max={100} value={Math.round(el.opacity * 100)} className="min-w-0 flex-1 accent-[var(--color-accent)]" onChange={(e) => set({ opacity: Number(e.target.value) / 100 })} />
          <span className="w-9 text-right font-mono text-[11.5px] text-fg-muted">{Math.round(el.opacity * 100)}%</span>
        </div>
        <div className="mt-2.5 flex gap-4">
          <Toggle label="隱藏" checked={el.hidden} onChange={(v) => set({ hidden: v })} />
          <Toggle label="鎖定" checked={el.locked} onChange={(v) => set({ locked: v })} />
        </div>
      </Section>
      <TypeFields el={el} />
      {isInteractive(el) && (
        <Section title="互動">
          <ActionEditor el={el} />
        </Section>
      )}
    </div>
  );
}

function MultiInspector({ count }: { count: number }) {
  return (
    <div>
      <div className="border-b border-line px-3 py-3 text-[13px] font-medium">已選取 {count} 個元件</div>
      <Section title="整批操作">
        <div className="flex flex-col gap-2 text-[12px] text-fg-muted">
          <p>用上方工具列對齊或平均分布，方向鍵一次移動 1 像素（加 Shift 為 8 像素）。</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => editor().duplicateSelected()}><Copy size={13} /> 複製</Button>
            <Button size="sm" variant="danger" onClick={() => editor().deleteSelected()}><Trash size={13} /> 刪除</Button>
          </div>
        </div>
      </Section>
    </div>
  );
}

/* ------------------------------------------------------------------ page & project */

function SkinPicker() {
  const skinId = useEditor((s) => s.project.skinId);
  return (
    <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="外觀主題">
      {SKIN_LIST.map((sk) => (
        <button
          key={sk.id}
          type="button"
          role="radio"
          aria-checked={sk.id === skinId}
          title={sk.description}
          onClick={() => editor().commit((p) => (p.skinId === sk.id ? p : { ...p, skinId: sk.id }))}
          className={cx('flex flex-col gap-1.5 rounded-md border p-2 text-left transition-colors', sk.id === skinId ? 'border-accent bg-accent/8' : 'border-ink-700 bg-ink-850 hover:border-ink-500')}
        >
          <div className="flex h-3 overflow-hidden rounded-sm">
            {sk.swatches.map((c) => <span key={c} className="flex-1" style={{ background: c }} />)}
          </div>
          <span className="text-[12px] text-fg">{sk.name}</span>
        </button>
      ))}
    </div>
  );
}

function PageInspector({ page }: { page: Page }) {
  const project = useEditor((s) => s.project);
  const skin = getSkin(project.skinId);
  const set = (patch: Partial<Page>, key?: string) => editor().updatePage(page.id, patch, key ?? `page-${Object.keys(patch).join(',')}:${page.id}`);
  const setProject = (fn: (p: typeof project) => typeof project, key: string) => editor().commit(fn, { key });
  const bytes = assetBytes(project);
  const nAssets = Object.keys(project.assets).length;
  const unused = nAssets - usedAssetIds(project).size;
  const { touchUi } = useLayout();
  return (
    <div>
      <Section title="頁面">
        <div className={grid2}>
          <Field label="標題（顯示在遊戲視窗頂端）" wide>
            <TextInput ariaLabel="頁面標題" value={page.title} onChange={(v) => set({ title: v })} />
          </Field>
          <Field label="檔名" wide hint={<>開啟指令：<code className="font-mono text-fg-muted">/dialog show @s {project.namespace}:{page.key}</code></>}>
            <TextInput ariaLabel="頁面檔名" mono value={page.key} onChange={(v) => set({ key: v.toLowerCase().replace(/[^a-z0-9_]/g, '_') })} onCommit={() => set({ key: slugify(page.key, 'page') })} />
          </Field>
          <Field label="寬度"><NumberInput ariaLabel="頁面寬度" value={page.width} min={PAGE_LIMITS.minW} max={PAGE_LIMITS.maxW} suffix="px" onChange={(v) => set({ width: v })} /></Field>
          <Field label="高度"><NumberInput ariaLabel="頁面高度" value={page.height} min={PAGE_LIMITS.minH} max={PAGE_LIMITS.maxH} suffix="px" onChange={(v) => set({ height: v })} /></Field>
          <div className="col-span-2 flex flex-wrap gap-1">
            {[[256, 160], [320, 200], [384, 240], [480, 270]].map(([w, h]) => (
              <Button key={`${w}x${h}`} size="sm" variant="ghost" className="font-mono text-[11px]" onClick={() => set({ width: w, height: h }, 'page-size-preset')}>
                {w}×{h}
              </Button>
            ))}
          </div>
          <Field label="背景色（留空 = 透明）" wide>
            <ColorInput ariaLabel="頁面背景色" value={page.bgColor} onChange={(v) => set({ bgColor: v })} />
          </Field>
          <Field label="下方按鈕文字（此頁）" wide hint="遊戲對話框底部的按鈕。留空 = 使用專案預設。">
            <TextInput
              ariaLabel="此頁的下方按鈕文字"
              value={page.footerLabel ?? ''}
              placeholder={project.settings.footerLabel || DEFAULT_FOOTER_LABEL}
              onChange={(v) => set({ footerLabel: v.trim() ? v : null })}
            />
          </Field>
        </div>
      </Section>
      <Section title="專案">
        <div className="flex flex-col gap-2.5">
          <Field label="命名空間" hint="資料包與資源包使用的名稱，只能用小寫英文、數字與底線。">
            <TextInput ariaLabel="命名空間" mono value={project.namespace} onChange={(v) => setProject((p) => ({ ...p, namespace: v.toLowerCase().replace(/[^a-z0-9_]/g, '_') }), 'namespace')} />
          </Field>
          <Field label="下方按鈕文字（預設）" hint="每個頁面底部那顆遊戲按鈕的文字，可在各頁覆寫。">
            <TextInput
              ariaLabel="下方按鈕文字預設值"
              value={project.settings.footerLabel}
              placeholder={DEFAULT_FOOTER_LABEL}
              onChange={(v) => setProject((p) => ({ ...p, settings: { ...p.settings, footerLabel: v } }), 'footer-label')}
            />
          </Field>
          <Field label="外觀主題">
            <SkinPicker />
          </Field>
          <Field label="強調色（主要按鈕、進度條）">
            <ColorInput ariaLabel="強調色" value={project.settings.accent} fallback={skin.accent} onChange={(v) => setProject((p) => ({ ...p, settings: { ...p.settings, accent: v } }), 'accent')} />
          </Field>
          <Field label="預設字型" hint="CSS 字型清單，會依序尋找電腦上已安裝的字型。">
            <div className="flex gap-1">
              <TextInput ariaLabel="預設字型" value={project.settings.fontFamily} onChange={(v) => setProject((p) => ({ ...p, settings: { ...p.settings, fontFamily: v } }), 'font')} />
              <Button size="sm" variant="ghost" title="還原預設字型" onClick={() => setProject((p) => ({ ...p, settings: { ...p.settings, fontFamily: DEFAULT_FONT_STACK } }), 'font-reset')}>還原</Button>
            </div>
          </Field>
          <div className="flex items-center justify-between rounded-md border border-ink-700 bg-ink-850 px-2.5 py-2 text-[11.5px]">
            <span className="text-fg-muted">圖片素材 {nAssets} 個・約 {(bytes / 1024).toFixed(0)} KB</span>
            <Button size="sm" variant="ghost" disabled={!unused} onClick={() => editor().commit(removeUnusedAssets)}>
              清除未使用（{unused}）
            </Button>
          </div>
        </div>
      </Section>
      {touchUi && (
        <Section title="觸控操作">
          <ul className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11.5px] text-fg-dim">
            {[
              ['一指拖曳元件', '移動（也可以拖曳四周的控點改變大小）'], ['一指拖曳空白處', '平移畫布'], ['兩指開合', '縮放'],
              ['兩指拖曳', '平移畫布'], ['點兩下空白處', '符合視窗'], ['點兩下元件', '編輯文字'],
              ['選取工具列', '逐格移動、複製、刪除、圖層順序、多選'], ['遊戲預覽', '點一下模擬點擊，長按看提示文字'],
            ].map(([k, v]) => (
              <li key={k} className="contents">
                <span className="text-fg-muted">{k}</span>
                <span>{v}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {!touchUi && <Section title="快速鍵">
        <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11.5px] text-fg-dim">
          {[
            ['方向鍵', '移動 1 px（Shift 8 px）'], ['空白鍵＋拖曳', '平移畫布'], ['滾輪', '縮放'], ['⌘/Ctrl＋Z', '復原'],
            ['⌘/Ctrl＋D', '複製一份'], ['⌘/Ctrl＋C / V', '複製 / 貼上'], ['Delete', '刪除'], ['Shift＋點擊', '加選'],
            ['[ / ]', '下移 / 上移圖層'], ['0', '符合視窗'],
          ].map(([k, v]) => (
            <li key={k} className="contents">
              <span className="font-mono text-fg-muted">{k}</span>
              <span>{v}</span>
            </li>
          ))}
        </ul>
      </Section>}
    </div>
  );
}

export default function Inspector() {
  const page = useEditor(currentPage);
  const selection = useEditor((s) => s.selection);
  const els = page.elements.filter((e) => selection.includes(e.id));
  let body: ReactNode;
  if (!els.length) body = <PageInspector page={page} />;
  else if (els.length > 1) body = <MultiInspector count={els.length} />;
  else body = <ElementInspector key={els[0].id} el={els[0]} />;
  return <div className="pb-6">{body}</div>;
}
