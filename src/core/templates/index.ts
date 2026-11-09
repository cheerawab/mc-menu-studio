// Built-in templates (zh-TW content). Only harmless commands are used.
import { createElement, createPage, createProject, type ElementProps } from '../model/defaults';
import type { Action, Element, IconId, Page, Project, SkinId } from '../model/types';
import { ICON_LABELS } from '../render/icons';

export interface TemplateInfo {
  id: string;
  name: string;
  description: string;
  skinId: SkinId;
  build: () => Project;
}

const cmd = (command: string): Action => ({ type: 'command', command });
const toPage = (p: Page): Action => ({ type: 'page', pageId: p.id });
const CLOSE: Action = { type: 'close' };

const panel = (x: number, y: number, w: number, h: number, p: ElementProps<'panel'> = {}) =>
  createElement('panel', { name: '面板', x, y, w, h, ...p });
const label = (x: number, y: number, w: number, h: number, text: string, p: ElementProps<'label'> = {}) =>
  createElement('label', { name: text.split('\n')[0].slice(0, 12), x, y, w, h, text, ...p });
const button = (x: number, y: number, w: number, h: number, text: string, p: ElementProps<'button'> = {}) =>
  createElement('button', { name: `按鈕：${text}`, x, y, w, h, text, ...p });
const icon = (x: number, y: number, id: IconId, p: ElementProps<'icon'> = {}) =>
  createElement('icon', { name: `圖示：${ICON_LABELS[id]}`, x, y, icon: id, ...p });
const divider = (x: number, y: number, w: number, h = 2, p: ElementProps<'divider'> = {}) =>
  createElement('divider', { name: '分隔線', x, y, w, h, ...p });

function page(key: string, title: string, width: number, height: number, elements: Element[] = []): Page {
  return createPage({ key, title, width, height, elements });
}

function lobby(): Project {
  const main = page('lobby', '星光伺服器', 340, 210);
  const rules = page('rules', '伺服器規則', 340, 210);
  const white = '#ffffff', muted = '#9aa3b2';
  const cards: [string, string, IconId, Action, string][] = [
    ['生存世界', '原汁原味的冒險', 'pickaxe', cmd('gamemode survival'), '切換成生存模式'],
    ['創造世界', '自由建築不設限', 'home', cmd('gamemode creative'), '切換成創造模式'],
    ['小遊戲', '每晚 8 點開戰', 'trophy', cmd('random value 1..6'), '擲骰子決定今晚玩什麼'],
  ];
  main.elements = [
    panel(0, 0, 340, 210, { name: '背景' }),
    icon(14, 13, 'star', { tint: '#34d399' }),
    label(36, 11, 180, 20, '星光伺服器', { fontSize: 16, bold: true, color: white, name: '標題' }),
    label(36, 30, 220, 14, '歡迎回來！選擇想去的世界', { color: muted, name: '副標題' }),
    label(220, 14, 106, 14, '● 線上 128 人', { color: '#34d399', align: 'right', fontSize: 11, name: '線上人數' }),
    divider(12, 50, 316),
    ...cards.flatMap(([name, desc, ic, action, tip], i) => {
      const cx = 12 + i * 108;
      return [
        panel(cx, 58, 100, 104, { variant: 'inset', name: `卡片：${name}` }),
        icon(cx + 34, 66, ic, { scale: 2 }),
        label(cx, 102, 100, 16, name, { align: 'center', fontSize: 13, bold: true, color: white }),
        label(cx, 119, 100, 14, desc, { align: 'center', fontSize: 11, color: muted }),
        button(cx + 10, 138, 80, 18, '前往', { variant: 'primary', action, tooltip: tip, name: `前往：${name}` }),
      ];
    }),
    button(12, 174, 104, 24, '伺服器規則', { icon: 'book', action: toPage(rules), tooltip: '查看伺服器規則' }),
    button(122, 174, 104, 24, 'Discord', {
      icon: 'chat', action: { type: 'url', url: 'https://discord.gg/example' }, tooltip: '在瀏覽器開啟 Discord 邀請連結',
    }),
    button(232, 174, 96, 24, '關閉', { icon: 'cross', action: CLOSE }),
  ];
  rules.elements = [
    panel(0, 0, 340, 210, { name: '背景' }),
    icon(14, 13, 'book'),
    label(36, 12, 200, 18, '伺服器規則', { fontSize: 16, bold: true, color: white, name: '標題' }),
    divider(12, 40, 316),
    panel(12, 50, 316, 114, { variant: 'inset', name: '規則區' }),
    label(
      22, 58, 296, 100,
      '① 尊重每一位玩家，禁止騷擾、歧視與謾罵。\n② 禁止使用外掛、連點程式或任何作弊模組。\n③ 不得破壞、偷竊他人的建築與物品。\n④ 聊天保持友善，請勿洗頻或打廣告。\n⑤ 遇到問題請到 Discord 聯絡管理員。',
      { lineHeight: 1.5, color: '#d5dae3', name: '規則內容' },
    ),
    button(12, 174, 128, 24, '返回大廳', { icon: 'arrow_left', action: toPage(main) }),
    button(232, 174, 96, 24, '關閉', { icon: 'cross', action: CLOSE }),
  ];
  return createProject({
    name: '星光伺服器大廳', namespace: 'lobby', skinId: 'dark', pages: [main, rules],
    settings: { fontFamily: createProject().settings.fontFamily, accent: '#34d399' },
  });
}

function rulesAgree(): Project {
  const rules = page('rules', '伺服器規則', 300, 200);
  const welcome = page('welcome', '歡迎加入', 300, 200);
  rules.elements = [
    panel(0, 0, 300, 200, { name: '背景' }),
    label(10, 8, 280, 16, '請先閱讀並同意伺服器規則', { bold: true, name: '標題' }),
    panel(8, 28, 284, 130, { variant: 'inset', fill: '#2b2b2b', name: '規則區' }),
    label(
      14, 34, 272, 120,
      '1. 尊重所有玩家，禁止騷擾與歧視。\n2. 禁止外掛、連點程式與作弊模組。\n3. 不得破壞或偷竊他人的建築。\n4. 聊天請友善，勿洗頻或打廣告。\n5. 違規者將視情節禁言或封鎖。\n6. 遇到問題請聯絡線上管理員。',
      { lineHeight: 1.45, color: '#e0e0e0', shadow: true, name: '規則內容' },
    ),
    button(8, 166, 140, 24, '我同意', { variant: 'primary', action: toPage(welcome), tooltip: '同意規則並繼續' }),
    button(152, 166, 140, 24, '不同意', { action: CLOSE, tooltip: '關閉選單' }),
  ];
  welcome.elements = [
    panel(0, 0, 300, 200, { name: '背景' }),
    icon(126, 24, 'check', { scale: 3 }),
    label(0, 80, 300, 20, '歡迎加入！', { fontSize: 16, bold: true, align: 'center', name: '標題' }),
    label(20, 106, 260, 40, '感謝你同意伺服器規則。\n祝你在這裡玩得開心！', {
      align: 'center', lineHeight: 1.5, color: '#555555', name: '說明',
    }),
    button(80, 160, 140, 24, '開始冒險', {
      variant: 'primary', icon: 'sun', action: cmd('time set day'), tooltip: '把時間調成白天，出發吧！',
    }),
  ];
  return createProject({ name: '規則同意', namespace: 'rules', skinId: 'vanilla', pages: [rules, welcome] });
}

function shop(): Project {
  const p = page('shop', '雜貨商店', 320, 200);
  const items: [IconId, string, number, string, string | null][] = [
    ['sword', '鑽石劍', 120, 'diamond_sword', null],
    ['pickaxe', '鐵鎬', 80, 'iron_pickaxe', '#c8ced6'],
    ['heart', '金蘋果', 45, 'golden_apple', '#f5c542'],
    ['shield', '盾牌', 60, 'shield', null],
    ['book', '書本', 15, 'book', '#8b5cf6'],
    ['chest', '箱子', 10, 'chest', null],
    ['map', '地圖', 25, 'map', null],
    ['star', '下界之星', 999, 'nether_star', null],
  ];
  const x0 = 41, y0 = 30, pitch = 72;
  p.elements = [
    panel(0, 0, 320, 200, { name: '背景' }),
    icon(10, 7, 'bag'),
    label(30, 8, 120, 16, '雜貨商店', { fontSize: 13, bold: true, name: '標題' }),
    icon(232, 7, 'coin'),
    label(250, 8, 60, 16, '1,280', { name: '餘額' }),
    createElement('slotgrid', { name: '商品格', x: x0, y: y0, cols: 4, rows: 2, slotSize: 22, gap: pitch - 22 }),
    ...items.flatMap(([ic, name, price, item, tint], i) => {
      const sx = x0 + (i % 4) * pitch, sy = y0 + Math.floor(i / 4) * pitch;
      return [
        icon(sx + 3, sy + 3, ic, {
          tint, name: `商品：${name}`, action: cmd(`give @s minecraft:${item}`), tooltip: `${name}\n價格：${price} 金幣\n點擊購買`,
        }),
        label(sx - 25, sy + 24, 72, 14, name, { align: 'center', name: `品名：${name}` }),
        label(sx - 25, sy + 38, 72, 14, `${price} 金幣`, { align: 'center', color: '#7a5c00', name: `價格：${name}` }),
      ];
    }),
    divider(8, 160, 304),
    label(10, 172, 220, 16, '點擊物品購買，游標停留看說明', { color: '#555555', name: '提示' }),
    button(238, 168, 74, 22, '關閉', { action: CLOSE }),
  ];
  return createProject({ name: '雜貨商店', namespace: 'shop', skinId: 'vanilla', pages: [p] });
}

function quickMenu(): Project {
  const p = page('quick', '快速選單', 300, 180);
  const btns: [string, IconId, string, string][] = [
    ['白天', 'clock', 'time set day', '把時間調成白天'],
    ['夜晚', 'moon', 'time set night', '把時間調成夜晚'],
    ['晴天', 'sun', 'weather clear', '天氣轉為晴朗'],
    ['下雨', 'rain', 'weather rain', '天氣轉為下雨'],
    ['創造', 'star', 'gamemode creative', '切換成創造模式'],
    ['生存', 'sword', 'gamemode survival', '切換成生存模式'],
    ['回中心', 'home', 'spreadplayers 0 0 0 1 false @s', '傳送到世界中心 (0, 0) 的地面'],
    ['擲骰子', 'coin', 'random value 1..6', '擲一顆六面骰'],
  ];
  p.elements = [
    panel(0, 0, 300, 180, { name: '背景' }),
    label(14, 10, 120, 18, '快速選單', { fontSize: 14, bold: true, color: '#e6fdff', name: '標題' }),
    label(14, 28, 120, 12, 'QUICK MENU', { fontSize: 10, color: '#5ff3ff', name: '英文標題' }),
    icon(270, 12, 'cross', { tint: '#5ff3ff', action: CLOSE, tooltip: '關閉', name: '關閉' }),
    ...btns.map(([text, ic, command, tip], i) =>
      button(14 + (i % 4) * 70, 50 + Math.floor(i / 4) * 38, 64, 30, text, { icon: ic, action: cmd(command), tooltip: tip }),
    ),
    divider(14, 128, 272),
    label(14, 136, 120, 14, '系統狀態：正常', { fontSize: 11, color: '#6fcfdc', name: '狀態' }),
    createElement('bar', { name: '能量條', x: 14, y: 154, w: 220, h: 10, value: 72, segments: 12 }),
    label(240, 152, 46, 14, '72%', { fontSize: 11, color: '#e6fdff', align: 'right', name: '百分比' }),
  ];
  return createProject({ name: '快速選單', namespace: 'quickmenu', skinId: 'holo', pages: [p] });
}

function settings(): Project {
  const p = page('settings', '遊戲設定', 320, 214);
  const rows: [string, [string, string][], number][] = [
    ['難度', [['和平', 'difficulty peaceful'], ['簡單', 'difficulty easy'], ['普通', 'difficulty normal'], ['困難', 'difficulty hard']], 2],
    ['遊戲模式', [['生存', 'gamemode survival'], ['創造', 'gamemode creative'], ['冒險', 'gamemode adventure'], ['旁觀', 'gamemode spectator']], 0],
    ['時間', [['早晨', 'time set day'], ['中午', 'time set noon'], ['夜晚', 'time set night'], ['午夜', 'time set midnight']], -1],
    ['天氣', [['晴朗', 'weather clear'], ['下雨', 'weather rain'], ['雷雨', 'weather thunder']], -1],
  ];
  p.elements = [
    panel(0, 0, 320, 214, { name: '背景' }),
    icon(14, 12, 'gear'),
    label(36, 12, 160, 18, '遊戲設定', { fontSize: 15, bold: true, color: '#ffffff', name: '標題' }),
    label(14, 34, 292, 14, '點選即可套用（需要管理員權限）', { color: '#9aa3b2', name: '說明' }),
    divider(14, 52, 292),
    ...rows.flatMap(([title, opts, active], r) => {
      const y = 62 + r * 30;
      return [
        label(14, y, 60, 20, title, { vAlign: 'middle', color: '#cdd3dd', name: `項目：${title}` }),
        ...opts.map(([text, command], i) =>
          button(78 + i * 58, y, 54, 20, text, {
            variant: i === active ? 'primary' : 'default', action: cmd(command), tooltip: `/${command}`, name: `${title}：${text}`,
          }),
        ),
      ];
    }),
    divider(14, 182, 292, 2),
    button(226, 188, 80, 20, '完成', { variant: 'primary', icon: 'check', action: CLOSE }),
  ];
  return createProject({
    name: '遊戲設定', namespace: 'settings', skinId: 'dark', pages: [p],
    settings: { fontFamily: createProject().settings.fontFamily, accent: '#8b5cf6' },
  });
}

function notice(): Project {
  const p = page('notice', '最新公告', 300, 210);
  const ink = '#3b2412';
  p.elements = [
    panel(0, 0, 300, 210, { name: '背景' }),
    icon(16, 14, 'book'),
    label(38, 15, 140, 18, '最新公告', { fontSize: 15, bold: true, color: ink, name: '標題' }),
    label(160, 18, 124, 14, '2026 年 11 月 10 日', { fontSize: 11, align: 'right', color: '#7a5a3a', name: '日期' }),
    divider(14, 36, 272, 7),
    label(16, 50, 228, 18, '冬季活動「霜雪祭典」即將開跑！', { fontSize: 13, bold: true, color: '#5a2d0c', name: '重點' }),
    label(
      16, 74, 268, 88,
      '活動期間：12/20（六）至 1/5（一）\n• 每日登入即可領取雪花代幣\n• 雪球大戰每晚 8 點準時開打\n• 冰雕比賽前三名獲得限定稱號',
      { lineHeight: 1.5, color: ink, name: '內容' },
    ),
    createElement('shape', {
      name: '封蠟', x: 252, y: 44, w: 30, h: 30, shape: 'ellipse', fill: '#9e2e24', stroke: '#6b1a14', strokeWidth: 1,
    }),
    icon(259, 51, 'star', { tint: '#e8c26a', name: '封蠟圖案' }),
    button(16, 172, 130, 24, '活動詳情', {
      variant: 'primary', icon: 'globe', action: { type: 'url', url: 'https://example.com/events' }, tooltip: '在瀏覽器開啟活動頁面',
    }),
    button(154, 172, 130, 24, '我知道了', { icon: 'check', action: CLOSE }),
  ];
  return createProject({ name: '最新公告', namespace: 'notice', skinId: 'parchment', pages: [p] });
}

export function blankProject(): Project {
  const p = page('main', '選單', 320, 200, [panel(0, 0, 320, 200, { name: '背景' })]);
  return createProject({ name: '未命名選單', namespace: 'menu', skinId: 'dark', pages: [p] });
}

export const TEMPLATES: TemplateInfo[] = [
  { id: 'lobby', name: '伺服器大廳', description: '三個世界入口、規則頁與 Discord 連結，含兩個互相連結的頁面。', skinId: 'dark', build: lobby },
  { id: 'rules', name: '規則同意', description: '列出伺服器規則，按「我同意」後進入歡迎頁。', skinId: 'vanilla', build: rulesAgree },
  { id: 'shop', name: '商店', description: '物品格搭配價格標籤，點擊物品即可購買（示範用 give 指令）。', skinId: 'vanilla', build: shop },
  { id: 'quick', name: '快速選單', description: '時間、天氣、遊戲模式與回到中心，一鍵切換。', skinId: 'holo', build: quickMenu },
  { id: 'settings', name: '設定頁', description: '難度、遊戲模式、時間與天氣，分組排列的設定畫面。', skinId: 'dark', build: settings },
  { id: 'notice', name: '公告', description: '活動公告搭配封蠟裝飾，可連到活動網頁。', skinId: 'parchment', build: notice },
];

/** Project shown on the very first visit. */
export function sampleProject(): Project {
  return lobby();
}
