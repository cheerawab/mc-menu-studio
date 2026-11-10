'use client';

import { CircleCheck, CircleExclamationPoint, Download, FileArchive, Info, LoaderCircle, Server, TriangleExclamationPoint, User } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { fitProblem, WINDOW_PRESETS } from '@/core/game/chrome';
import { buildExport, zipBundle, zipExport, type AfterAction, type CommandMode, type ExportArchives, type ExportBuild, type ExportMode, type ExportOptions } from '@/core/export';
import { checkExport, countCommandActions, exportPagesFromProject } from '@/core/export/project';
import { triggerObjective } from '@/core/export/triggers';
import { openCommand } from '@/core/export/readme';
import { effectiveFooterLabel } from '@/core/model/defaults';
import { countIssues, type Issue } from '@/core/model/validate';
import type { Project } from '@/core/model/types';
import { renderEnv, whenImagesReady } from '../state/images';
import { editor, useEditor } from '../state/store';
import { useLayout } from './layoutTier';
import { Modal } from './Overlays';
import { Button, cx, Field, Section, Segmented, Select, TextInput, Toggle } from './ui';

interface Prefs {
  mode: ExportMode;
  quickActions: boolean;
  afterAction: AfterAction;
  commandMode: CommandMode;
}
const PREFS_KEY = 'mc-menu-studio:export:v1';
const DEFAULT_PREFS: Prefs = { mode: 'registry', quickActions: true, afterAction: 'close', commandMode: 'trigger' };

function loadPrefs(): Prefs {
  try {
    const raw = JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<Prefs>;
    return {
      mode: raw.mode === 'functions' ? 'functions' : 'registry',
      quickActions: raw.quickActions !== false,
      afterAction: raw.afterAction === 'none' ? 'none' : 'close',
      commandMode: raw.commandMode === 'direct' ? 'direct' : 'trigger',
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function savePrefs(p: Prefs) {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* preferences are optional */
  }
}

function download(name: string, bytes: Uint8Array) {
  const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const kb = (n: number) => (n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(2)} MB`);

interface Built {
  project: Project;
  options: ExportOptions;
  build?: ExportBuild;
  zips?: ExportArchives;
  error?: string;
}

const SEVERITY = {
  error: { Icon: CircleExclamationPoint, cls: 'text-danger' },
  warning: { Icon: TriangleExclamationPoint, cls: 'text-warn' },
  info: { Icon: Info, cls: 'text-info' },
} as const;

function IssueRow({ issue }: { issue: Pick<Issue, 'severity' | 'message'> }) {
  const { Icon, cls } = SEVERITY[issue.severity];
  return (
    <li className="flex items-start gap-1.5 text-[12px] leading-relaxed text-fg-muted">
      <Icon size={13} className={cx('mt-[3px] shrink-0', cls)} />
      <span>{issue.message}</span>
    </li>
  );
}

function ModeCard({ active, onClick, title, tag, code, children }: { active: boolean; onClick: () => void; title: string; tag: string; code: string; children: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cx(
        'flex flex-col gap-1.5 rounded-lg border p-3 text-left transition-colors',
        active ? 'border-accent/70 bg-accent/10' : 'border-ink-700 bg-ink-850 hover:border-ink-600',
      )}
    >
      <span className="flex items-center gap-2">
        <span className={cx('h-3 w-3 shrink-0 rounded-full border-2', active ? 'border-accent bg-accent' : 'border-ink-600')} />
        <span className="text-[13px] font-semibold text-fg">{title}</span>
        <span className="rounded bg-ink-700 px-1.5 py-px text-[10.5px] text-fg-muted">{tag}</span>
        <code className="ml-auto font-mono text-[10.5px] text-fg-dim">{code}</code>
      </span>
      <span className="text-[11.5px] leading-relaxed text-fg-dim">{children}</span>
    </button>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-ink-800 py-1 text-[12px] last:border-b-0">
      <span className="text-fg-dim">{label}</span>
      <span className="font-mono text-fg">{value}</span>
    </div>
  );
}

function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="flex flex-col gap-1.5">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2 text-[12px] leading-relaxed text-fg-muted">
          <span className="mt-px flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-ink-700 text-[10.5px] font-semibold text-fg">{i + 1}</span>
          <span>{it}</span>
        </li>
      ))}
    </ol>
  );
}

const Cmd = ({ children }: { children: ReactNode }) => <code className="rounded bg-ink-800 px-1 font-mono text-[11.5px] text-fg">{children}</code>;

function ExportBody() {
  const compact = useLayout().tier === 'compact';
  const project = useEditor((s) => s.project);
  const guiScale = useEditor((s) => s.view.guiScale);
  const windowId = useEditor((s) => s.view.windowId);
  const [prefs, setPrefsState] = useState<Prefs>(loadPrefs);
  const [guide, setGuide] = useState<'single' | 'server'>('single');
  const [built, setBuilt] = useState<Built | null>(null);
  const setPrefs = (patch: Partial<Prefs>) => {
    const next = { ...prefs, ...patch };
    setPrefsState(next);
    savePrefs(next);
  };

  const issues = useMemo(() => {
    const win = WINDOW_PRESETS.find((w) => w.id === windowId) ?? WINDOW_PRESETS[1];
    return checkExport(project, { fitCheck: (page) => fitProblem(win, guiScale, page), mode: prefs.mode, commandMode: prefs.commandMode });
  }, [project, guiScale, windowId, prefs.mode, prefs.commandMode]);
  const counts = countIssues(issues);
  const blocked = counts.error > 0;
  const options = useMemo<ExportOptions>(
    () => ({
      namespace: project.namespace, packName: project.name, mode: prefs.mode, quickActions: prefs.quickActions,
      afterAction: prefs.afterAction, commandMode: prefs.commandMode,
    }),
    [project.namespace, project.name, prefs],
  );

  useEffect(() => {
    if (blocked) return;
    let cancelled = false;
    const id = setTimeout(async () => {
      try {
        await whenImagesReady(project.assets);
        if (cancelled) return;
        const pages = exportPagesFromProject(project, renderEnv(project.assets));
        const build = buildExport(pages, options);
        const zips = await zipExport(build);
        if (!cancelled) setBuilt({ project, options, build, zips });
      } catch (e) {
        if (!cancelled) setBuilt({ project, options, error: e instanceof Error ? e.message : String(e) });
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [project, options, blocked]);

  const current = built && built.project === project && built.options === options ? built : null;
  const ready = !blocked && current?.build && current.zips ? { build: current.build, zips: current.zips } : null;
  const building = !blocked && !current;
  const ns = project.namespace;
  const first = project.pages[0];
  const firstCmd = first ? openCommand(ns, first.key, prefs.mode) : '';
  const reg = prefs.mode === 'registry';
  const trigger = prefs.commandMode === 'trigger';
  const objective = triggerObjective(ns);
  const commandCount = countCommandActions(project, prefs.mode);
  const footer = first ? effectiveFooterLabel(first, project) : '關閉';
  const shown = issues.filter((i) => i.severity !== 'info').slice(0, 6);
  // export-only notes (command mode, close action) are not in the editor's 檢查 tab, so list them here
  const exportNotes = issues.filter((i) => i.severity === 'info' && i.code.startsWith('export-'));
  const names = ready?.build.names ?? { resourcePack: `${ns}_resourcepack.zip`, dataPack: `${ns}_datapack.zip` };

  const single: ReactNode[] = [
    <>開啟 Minecraft →「選項」→「資源包」→「開啟資源包資料夾」，放入 <Cmd>{names.resourcePack}</Cmd>，回到遊戲把它移到右側並按「完成」。</>,
    <>建立新世界時在「資料包」畫面把 <Cmd>{names.dataPack}</Cmd> 拖進視窗；已有的世界請在「選擇世界 → 編輯 → 開啟世界資料夾」放進 datapacks 資料夾。兩個 zip 都不要解壓縮。</>,
    reg ? (
      <>開啟世界時 Minecraft 會顯示「使用實驗性設定的世界不受支援」畫面（資料包新增了對話框就會出現，每次開啟都會出現），選「我知道我在做什麼！」即可進入。</>
    ) : (
      <>這個模式不會出現實驗性設定警告，但世界需要開啟作弊（建立世界時開啟「允許作弊」，或用「對區域網路開放」暫時開啟），因為開啟選單要用 <Cmd>/function</Cmd>。</>
    ),
    reg ? (
      <>{prefs.quickActions ? '按 G 鍵（快捷動作）開啟選單，或' : ''}在聊天欄輸入 <Cmd>{firstCmd}</Cmd>（輸入指令需要開啟作弊）。</>
    ) : (
      <>在聊天欄輸入 <Cmd>{firstCmd}</Cmd> 開啟選單。換掉資料包後輸入 <Cmd>/reload</Cmd>。</>
    ),
  ];
  const server: ReactNode[] = [
    <>把 <Cmd>{names.dataPack}</Cmd> 放進伺服器世界的 datapacks 資料夾（例如 <Cmd>world/datapacks/</Cmd>），再重新啟動伺服器或執行 <Cmd>/reload</Cmd>。</>,
    <>把 <Cmd>{names.resourcePack}</Cmd> 上傳到可直接下載的網址，在 server.properties 設定 <Cmd>resource-pack</Cmd>（網址）、<Cmd>resource-pack-sha1</Cmd>，建議加上 <Cmd>require-resource-pack=true</Cmd>。玩家必須接受資源包，否則選單會變成一排方框。</>,
    reg ? (
      <>伺服器不會出現實驗性設定畫面。{prefs.quickActions ? '玩家可以按 G 鍵開啟選單；' : ''}管理員、指令方塊或 NPC 外掛也可以執行 <Cmd>/dialog show &lt;玩家&gt; {ns}:{first?.key}</Cmd>。頁面切換一般玩家也能使用。</>
    ) : (
      trigger ? (
        <>開啟選單要 <Cmd>/function</Cmd> 權限（OP），或由指令方塊、NPC 外掛替玩家執行；選單裡的按鈕與切換頁面透過 <Cmd>/trigger</Cmd>，一般玩家也能使用。伺服器仍建議用「資料包對話框」模式（可綁定 G 鍵）。</>
      ) : (
        <>開啟與切換頁面都要 <Cmd>/function</Cmd> 權限（OP），一般玩家無法使用。伺服器請改用「資料包對話框」模式，或把指令執行方式改成 /trigger。</>
      )
    ),
  ];

  return (
    <div className="flex min-h-0 flex-col">
      {/* compact: one column (settings, checks + download, install steps) */}
      <div className={compact ? 'flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain' : 'grid min-h-0 flex-1 grid-cols-[1.15fr_1fr] overflow-y-auto'}>
        <div className={compact ? 'border-b border-line' : 'border-r border-line'}>
          <Section title="基本設定">
            <div className={compact ? 'grid grid-cols-1 gap-2.5' : 'grid grid-cols-2 gap-2.5'}>
              <Field label="選單名稱（顯示在遊戲的資源包清單）">
                <TextInput ariaLabel="選單名稱" value={project.name} maxLength={60} onChange={(v) => editor().commit((p) => ({ ...p, name: v }), { key: 'project-name' })} />
              </Field>
              <Field label="命名空間" hint="小寫英文、數字與底線。">
                <TextInput ariaLabel="匯出命名空間" mono value={ns} onChange={(v) => editor().commit((p) => ({ ...p, namespace: v.toLowerCase().replace(/[^a-z0-9_]/g, '_') }), { key: 'namespace' })} />
              </Field>
            </div>
          </Section>
          <Section title="匯出模式">
            <div role="radiogroup" aria-label="匯出模式" className="flex flex-col gap-2">
              <ModeCard active={reg} onClick={() => setPrefs({ mode: 'registry' })} title="資料包對話框" tag="伺服器建議" code="registry">
                頁面登錄在資料包裡，按鈕用 show_dialog 切換頁面，一般玩家也能使用，還能綁定 G 鍵。單人遊戲每次開啟世界時，Minecraft 會先跳出「實驗性設定」警告畫面（選「我知道我在做什麼！」即可）；伺服器不會出現。
              </ModeCard>
              <ModeCard active={!reg} onClick={() => setPrefs({ mode: 'functions' })} title="函數內嵌" tag="單人／地圖" code="functions">
                每個頁面變成一個函數，用 /dialog show 直接顯示，所以單人遊戲不會出現實驗性設定警告。但開啟選單要用 /function（單人需開啟作弊、伺服器需 OP 權限），也不能綁定 G 鍵；切換頁面在 /trigger 模式下一般玩家也能使用，直接執行時同樣需要權限。
              </ModeCard>
            </div>
            <div className="mt-3 flex flex-col gap-2.5">
              {reg ? (
                <Toggle checked={prefs.quickActions} onChange={(v) => setPrefs({ quickActions: v })} label={`按 G 鍵（快捷動作）開啟第一頁「${first?.title || first?.key || ''}」`} />
              ) : (
                <p className="text-[11.5px] text-fg-dim">函數內嵌模式無法綁定 G 鍵。</p>
              )}
              <Field
                label="點擊選單後"
                hint={
                  prefs.afterAction === 'close'
                    ? `點選單裡的任何按鈕（執行指令、複製文字、開啟網址）或底部的「${footer}」按鈕後，選單都會關閉；切換頁面會直接開啟下一頁。點擊尚待實機驗證。`
                    : `點按鈕後選單保持開啟，可以連續操作；底部的「${footer}」按鈕會關閉選單（Esc 也可以）。點擊尚待實機驗證。`
                }
              >
                <Select<AfterAction>
                  ariaLabel="點擊選單後"
                  value={prefs.afterAction}
                  onChange={(v) => setPrefs({ afterAction: v })}
                  options={[
                    { value: 'close', label: '點擊後關閉（建議）' },
                    { value: 'none', label: '保持開啟' },
                  ]}
                />
              </Field>
            </div>
          </Section>
          <Section title="指令執行方式">
            <div role="radiogroup" aria-label="指令執行方式" className="flex flex-col gap-2">
              <ModeCard active={trigger} onClick={() => setPrefs({ commandMode: 'trigger' })} title="/trigger（建議）" tag="一般玩家可用" code="trigger">
                一般玩家也能按按鈕，不會出現 Minecraft 的確認畫面。按鈕只送出 /trigger，資料包裡的函數再以函數權限執行真正的指令，所以任何玩家也能自己輸入 /trigger {objective} set &lt;編號&gt; 執行選單裡的動作。資料包會多兩個函數：trigger_load（載入時建立計分板）與 trigger_tick（每個 tick 執行）。
              </ModeCard>
              <ModeCard active={!trigger} onClick={() => setPrefs({ commandMode: 'direct' })} title="直接執行" tag="需要權限" code="direct">
                按鈕直接送出指令本身，玩家需要對應的權限。需要權限的指令（time、weather、gamemode、give、function、dialog…）每次點擊都會跳出 Minecraft 的「確認指令執行」畫面，一般玩家無法使用。
              </ModeCard>
            </div>
            <p className="mt-2.5 text-[11.5px] leading-relaxed text-fg-dim">
              這個專案有 <span className="font-semibold text-fg">{commandCount}</span> 個指令動作（執行指令、關閉選單{reg ? '' : '、切換頁面'}）
              {trigger && ready?.build.triggers ? `，匯出後共 ${ready.build.triggers.actions.length} 個編號（同樣的動作共用一個編號，對照表在 README_zh-TW.txt）` : ''}。
              {trigger && '函數執行的指令不會把回饋訊息（例如 /random value 的結果）顯示給玩家，需要顯示文字時請用 /tellraw @s。'}
              按鈕點擊<span className="text-warn">尚待實機驗證</span>。
            </p>
          </Section>
        </div>

        <div className="flex flex-col">
          <Section title="檢查">
            <div className="mb-2 flex gap-3 text-[12px]">
              <span className={counts.error ? 'text-danger' : 'text-fg-dim'}>錯誤 {counts.error}</span>
              <span className={counts.warning ? 'text-warn' : 'text-fg-dim'}>警告 {counts.warning}</span>
              <span className="text-fg-dim">提示 {counts.info}</span>
            </div>
            {blocked && (
              <p className="mb-2 rounded-md border border-danger/40 bg-danger/10 px-2.5 py-2 text-[12px] leading-relaxed text-fg">
                有錯誤需要先修正才能匯出。關閉視窗後，可以在右側「檢查」分頁點選問題，直接跳到對應的位置。
              </p>
            )}
            {shown.length > 0 ? (
              <ul className="flex flex-col gap-1">
                {shown.map((i, k) => <IssueRow key={`${i.code}-${k}`} issue={i} />)}
                {issues.length - shown.length - exportNotes.length > 0 && (
                  <li className="text-[11.5px] text-fg-dim">另有 {issues.length - shown.length - exportNotes.length} 項（提示與其他項目請看「檢查」分頁）。</li>
                )}
              </ul>
            ) : (
              <p className="flex items-center gap-1.5 text-[12px] text-fg-muted"><CircleCheck size={13} className="text-accent" /> 沒有錯誤或警告。</p>
            )}
            {exportNotes.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1">
                {exportNotes.map((i, k) => <IssueRow key={`${i.code}-${k}`} issue={i} />)}
              </ul>
            )}
            {ready && ready.build.warnings.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1">
                {ready.build.warnings.map((w, k) => <IssueRow key={k} issue={{ severity: 'warning', message: w.message }} />)}
              </ul>
            )}
          </Section>
          <Section title="統計">
            {building && <p className="flex items-center gap-1.5 text-[12px] text-fg-muted"><LoaderCircle size={13} className="animate-spin" /> 正在產生匯出檔…</p>}
            {current?.error && <p className="text-[12px] leading-relaxed text-danger">無法匯出：{current.error}</p>}
            {blocked && <p className="text-[12px] text-fg-dim">修正錯誤後會自動產生。</p>}
            {ready && (
              <div>
                <Stat label="頁面" value={ready.build.stats.pages} />
                <Stat label={`圖塊（${ready.build.stats.tileSize} px，重複的只存一次）`} value={`${ready.build.stats.tilesPlaced} → ${ready.build.stats.tilesUnique}`} />
                <Stat label="字型圖集 PNG／自訂字元" value={`${ready.build.stats.sheets}／${ready.build.stats.glyphs}`} />
                <Stat label="點擊區域（隱形字元）" value={`${ready.build.stats.regions}（${ready.build.stats.hitGlyphs}）`} />
                <Stat label="資源包" value={kb(ready.zips.resourcePack.length)} />
                <Stat label="資料包" value={kb(ready.zips.dataPack.length)} />
              </div>
            )}
          </Section>
          <Section title="下載">
            <div className="flex flex-col gap-2">
              <Button variant="primary" disabled={!ready} onClick={async () => {
                if (!ready) return;
                download(ready.build.names.bundle, await zipBundle(ready.build, ready.zips));
                editor().toast('success', '已下載：資源包、資料包與安裝說明。');
              }}>
                <FileArchive size={15} /> 全部下載（兩個 zip＋說明）
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button size="sm" disabled={!ready} onClick={() => ready && download(ready.build.names.resourcePack, ready.zips.resourcePack)}>
                  <Download size={13} /> 資源包
                </Button>
                <Button size="sm" disabled={!ready} onClick={() => ready && download(ready.build.names.dataPack, ready.zips.dataPack)}>
                  <Download size={13} /> 資料包
                </Button>
              </div>
              <p className="text-[11px] leading-snug text-fg-dim">「全部下載」裡的兩個 zip 要分別放進遊戲，不要解壓縮；README_zh-TW.txt 是安裝說明。</p>
            </div>
          </Section>
        </div>

        <div className={compact ? 'border-t border-line' : 'col-span-2 border-t border-line'}>
          <Section
            title="安裝步驟"
            actions={
              <Segmented
                label="安裝情境"
                size="sm"
                value={guide}
                onChange={setGuide}
                options={[
                  { value: 'single', label: <><User size={12} /> 單人遊戲</> },
                  { value: 'server', label: <><Server size={12} /> 伺服器</> },
                ]}
              />
            }
          >
            <Steps items={guide === 'single' ? single : server} />
          </Section>
          <Section title="注意事項">
            <ul className="flex list-disc flex-col gap-1 pl-4 text-[11.5px] leading-relaxed text-fg-dim">
              <li>選單是一張靜態圖片：沒有滑鼠移上去的變化、沒有動畫，也不能輸入文字。</li>
              <li>已在 Minecraft 26.3 實機確認：圖片的位置與拼接。<span className="text-warn">尚待實機驗證</span>：按鈕點擊、滑鼠提示文字、頁面切換、底部按鈕與 /trigger 的實際執行。</li>
              {trigger ? (
                <li>「執行指令」與「關閉選單」（<Cmd>/dialog clear @s</Cmd>）透過 <Cmd>/trigger {objective} set &lt;編號&gt;</Cmd> 執行，一般玩家也能使用；所有指令寫在同一個函數檔 trigger_tick 裡，只要一個指令打錯，整個函數就不會載入，所有按鈕都會失效，請先在遊戲裡試過每個指令。</li>
              ) : (
                <li>「執行指令」以玩家身分直接送出；「關閉選單」使用 <Cmd>/dialog clear @s</Cmd>。需要權限的指令每次點擊都會跳出「確認指令執行」畫面，一般玩家無法使用。</li>
              )}
              <li>圖片裡的文字是用你電腦上的字型畫出來的。請確認你有權以這種方式使用並散布該字型；開源字型（例如 Noto Sans TC）最安全。</li>
            </ul>
          </Section>
        </div>
      </div>
    </div>
  );
}

export default function ExportDialog() {
  const open = useEditor((s) => s.dialog === 'export');
  if (!open) return null;
  return (
    <Modal title="匯出到 Minecraft（Java 版 26.3）" onClose={() => editor().openDialog(null)} width={900}>
      <ExportBody />
    </Modal>
  );
}
