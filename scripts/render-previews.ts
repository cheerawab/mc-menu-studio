// Renders every template page, the icon set and an in-game mock to PNG files in exports/previews/
// (headless, @napi-rs/canvas). Used to eyeball skins without a browser: `npm run preview:skins`.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createCanvas } from '@napi-rs/canvas';
import { drawGameMock, gameLayout } from '../src/core/game/chrome';
import { ICON_IDS } from '../src/core/model/types';
import { drawIcon } from '../src/core/render/icons';
import { renderPageToCanvas } from '../src/core/render/renderPage';
import type { CanvasLike, Ctx2D, RenderEnv } from '../src/core/render/types';
import { TEMPLATES } from '../src/core/templates';

const OUT = 'exports/previews';
mkdirSync(OUT, { recursive: true });
const env: RenderEnv = { createCanvas: (w, h) => createCanvas(w, h) as unknown as CanvasLike };

function save(name: string, canvas: CanvasLike) {
  writeFileSync(`${OUT}/${name}.png`, (canvas as unknown as { toBuffer(m: string): Buffer }).toBuffer('image/png'));
}

function scaled(src: CanvasLike, s: number, bg = '#3a3d45'): CanvasLike {
  const c = env.createCanvas(src.width * s, src.height * s);
  const ctx = c.getContext('2d') as Ctx2D;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0, src.width * s, src.height * s);
  return c;
}

// Contact sheet of all template pages at 2x
const pages = TEMPLATES.flatMap((t) => {
  const project = t.build();
  return project.pages.map((p) => ({ project, page: p, name: `${t.id}-${p.key}` }));
});
const cols = 2, cellW = 360, cellH = 230;
const sheet = env.createCanvas(cols * cellW, Math.ceil(pages.length / cols) * cellH);
const sctx = sheet.getContext('2d') as Ctx2D;
sctx.fillStyle = '#5b6170';
sctx.fillRect(0, 0, sheet.width, sheet.height);
pages.forEach(({ project, page, name }, i) => {
  const { canvas } = renderPageToCanvas(page, project, env, { placeholders: true });
  save(name, scaled(canvas, 2));
  sctx.drawImage(canvas, (i % cols) * cellW + 10, Math.floor(i / cols) * cellH + 10);
});
save('_sheet', scaled(sheet, 2, '#5b6170'));

// Icons at 4x
const ic = env.createCanvas(7 * 20, 4 * 20);
const ictx = ic.getContext('2d') as Ctx2D;
ictx.fillStyle = '#8b8b8b';
ictx.fillRect(0, 0, ic.width, ic.height);
ICON_IDS.forEach((id, i) => drawIcon(ictx, id, (i % 7) * 20 + 2, Math.floor(i / 7) * 20 + 2));
save('_icons', scaled(ic, 4, '#8b8b8b'));

// In-game mock: first template at 1920x1080, GUI scale 3
{
  const project = TEMPLATES[0].build();
  const page = project.pages[0];
  const { canvas } = renderPageToCanvas(page, project, env);
  const L = gameLayout(1920, 1080, 3, page.width, page.height);
  const mock = env.createCanvas(L.guiW, L.guiH);
  drawGameMock(mock.getContext('2d') as Ctx2D, env, L, { title: page.title, page: canvas, fontFamily: project.settings.fontFamily });
  save('_game', scaled(mock, 2));
}
console.log(`wrote ${pages.length + 3} previews to ${OUT}/`);
