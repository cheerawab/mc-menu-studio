// README_zh-TW.txt that ships next to the exported zips (and is shown in the export dialog).
import { DATA_PACK_FORMAT, RESOURCE_PACK_FORMAT } from './constants';
import { functionName } from './dialogs';
import type { AfterAction, ExportMode } from './types';

export const MODE_LABELS: Record<ExportMode, string> = {
  registry: '資料包對話框（registry）',
  functions: '函數內嵌（functions）',
};

export interface ReadmeInfo {
  packName: string;
  namespace: string;
  mode: ExportMode;
  quickActions: boolean;
  afterAction: AfterAction;
  pages: { key: string; title: string; footerLabel: string }[];
  files: { resourcePack: string; dataPack: string };
  hasCommands: boolean;
  hasClose: boolean;
}

export function openCommand(ns: string, key: string, mode: ExportMode): string {
  return mode === 'registry' ? `/dialog show @s ${ns}:${key}` : `/function ${ns}:${functionName(key)}`;
}

export function readmeText(i: ReadmeInfo): string {
  const ns = i.namespace;
  const first = i.pages[0];
  const firstCmd = openCommand(ns, first.key, i.mode);
  const reg = i.mode === 'registry';
  const quick = reg && i.quickActions;
  const footer = first.footerLabel || '關閉';
  const L: string[] = [];
  const add = (...lines: string[]) => L.push(...lines);

  add(
    `${i.packName}：Minecraft 選單（選單工坊匯出）`,
    '='.repeat(40),
    `適用版本：Minecraft Java 版 26.3（資源包格式 ${RESOURCE_PACK_FORMAT}、資料包格式 ${DATA_PACK_FORMAT}）`,
    `命名空間：${ns}`,
    `匯出模式：${MODE_LABELS[i.mode]}`,
    '',
    '【檔案】（兩個 zip 檔都不要解壓縮）',
    `- ${i.files.resourcePack}：資源包，內含選單的圖片。每位玩家都必須載入。`,
    `- ${i.files.dataPack}：資料包，內含 ${i.pages.length} 個選單頁面${quick ? '與 G 鍵（快捷動作）設定' : ''}。放進世界的 datapacks 資料夾。`,
    '',
    '【頁面與開啟指令】',
    ...i.pages.map((p) => `- 「${p.title || p.key}」（${p.key}）：${openCommand(ns, p.key, i.mode)}`),
    '',
    '【單人遊戲】',
    `1. 開啟 Minecraft →「選項」→「資源包」→「開啟資源包資料夾」，把 ${i.files.resourcePack} 放進去；回到遊戲把它移到右側並按「完成」。`,
    `2. 建立新世界時，在「資料包」畫面把 ${i.files.dataPack} 拖進視窗；已有的世界請在「選擇世界 → 編輯 → 開啟世界資料夾」，把它放進 datapacks 資料夾。`,
  );
  if (reg) {
    add(
      '3. 開啟世界時，Minecraft 會顯示「使用實驗性設定的世界不受支援」的畫面。這是 Minecraft 對「新增了對話框的資料包」的固定提醒，',
      '   每次開啟這個世界都會出現：選「我知道我在做什麼！」即可進入。（不想看到這個畫面，可以改用「函數內嵌」模式匯出。）',
      `4. 進入世界後${quick ? '按 G 鍵（快捷動作）開啟選單，或' : ''}在聊天欄輸入 ${firstCmd}（輸入指令需要開啟作弊）。`,
    );
  } else {
    add(
      '3. 這個模式不會出現實驗性設定的警告畫面，但世界需要開啟作弊（建立世界時開啟「允許作弊」，或用「對區域網路開放」暫時開啟），',
      '   因為開啟選單和切換頁面都要使用 /function 指令。',
      `4. 進入世界後在聊天欄輸入 ${firstCmd} 開啟選單。`,
    );
  }
  add(
    '5. 換掉資料包後輸入 /reload；換掉資源包後按 F3 + T 重新載入。',
    '',
    '【伺服器】',
    `1. 把 ${i.files.dataPack} 放進伺服器世界資料夾的 datapacks（例如 world/datapacks/），再重新啟動伺服器或執行 /reload。`,
    `2. 把 ${i.files.resourcePack} 上傳到可以直接下載 zip 檔的網址，並在 server.properties 設定：`,
    '     resource-pack=<下載網址>',
    '     resource-pack-sha1=<這個 zip 檔的 SHA-1>',
    '     require-resource-pack=true（建議）',
    '   玩家必須接受伺服器資源包；沒有載入資源包的玩家只會看到一排方框或亂碼。',
  );
  if (reg) {
    add(
      `3. 伺服器不會出現實驗性設定畫面。${quick ? '玩家可以按 G 鍵開啟選單；' : ''}管理員、指令方塊或 NPC 外掛也可以執行`,
      `   /dialog show <玩家> ${ns}:${first.key}。頁面之間的切換（show_dialog）一般玩家也能使用。`,
    );
  } else {
    add('3. 開啟與切換頁面需要 /function 權限（OP 等級 2 以上），一般玩家無法使用；伺服器建議改用「資料包對話框」模式匯出。');
  }
  add(
    '',
    '【限制與注意事項】',
    '- 選單是一張靜態圖片：沒有滑鼠移上去的變化、沒有動畫，也不能輸入文字。',
    '- 已在 Minecraft 26.3 實機確認：圖片的位置與拼接。尚待實機驗證：按鈕點擊、滑鼠提示文字、頁面切換與下方按鈕的實際行為。',
    `- 下方按鈕「${footer}」：${i.afterAction === 'close' ? '按下後關閉選單' : '設定為不動作（選單保持開啟，請用 Esc 關閉）'}（尚待實機驗證）。`,
  );
  if (i.hasCommands)
    add('- 「執行指令」按鈕以玩家身分執行指令：單人遊戲需要開啟作弊才能使用管理指令，伺服器上只能執行玩家有權限的指令；/say、/tell 等聊天指令不會執行。');
  if (i.hasClose) add('- 「關閉選單」按鈕會執行 /dialog clear @s，需要指令權限；玩家隨時可以按 Esc 關閉選單。');
  add(
    '- 圖片裡的文字是用製作者電腦上的字型畫出來的。請確認你有權以這種方式使用並散布該字型；開源字型（例如 Noto Sans TC）最安全。',
    '- 遊戲視窗太小或「介面大小」(GUI scale) 太大時，選單可能需要捲動才看得完整。',
    '',
    '本選單由「選單工坊」(MC Menu Studio) 產生。點陣選單的構想來自開源專案 Glyphwork（MIT 授權）；',
    '選單工坊是獨立實作，沒有使用 Glyphwork 的程式碼或素材。',
    '',
  );
  return L.join('\n');
}
