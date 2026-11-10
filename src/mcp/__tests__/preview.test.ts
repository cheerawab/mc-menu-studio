import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodePng } from '../../core/export/png';
import { createProject } from '../../core/model/defaults';
import { createRenderEnv } from '../env';
import { defaultPreviewPath, renderGameMockPreview, renderPagePreview, toBase64, writePng } from '../handlers/preview';

const env = createRenderEnv();

describe('mcms.preview.page', () => {
  it('renders a decodable PNG at the requested scale', () => {
    const project = createProject();
    const page = project.pages[0];
    const out = renderPagePreview(project, page, env, 1);
    expect(out.width).toBe(page.width);
    expect(out.height).toBe(page.height);
    const decoded = decodePng(out.png);
    expect(decoded.width).toBe(page.width);
    expect(decoded.height).toBe(page.height);
  });

  it('defaults to the project 解析度 when no scale is given', () => {
    const project = createProject();
    const page = project.pages[0];
    const out = renderPagePreview(project, page, env);
    expect(out.width).toBe(page.width * project.settings.renderScale);
  });

  it('writes the PNG to disk and round-trips the same bytes', () => {
    const project = createProject();
    const page = project.pages[0];
    const out = renderPagePreview(project, page, env, 1);
    const dir = mkdtempSync(join(tmpdir(), 'mcms-preview-'));
    const path = writePng(join(dir, 'page.png'), out.png);
    expect(readFileSync(path)).toEqual(Buffer.from(out.png));
  });

  it('base64-encodes for the inline option', () => {
    const png = new Uint8Array([1, 2, 3]);
    expect(Buffer.from(toBase64(png), 'base64')).toEqual(Buffer.from(png));
  });
});

describe('mcms.preview.game_mock', () => {
  it('reports fits=true for a page that fits a large window, false for one that does not', () => {
    const project = createProject();
    const page = project.pages[0]; // 320x200
    const big = renderGameMockPreview(project, page, env, { id: 'big', label: 'big', w: 1920, h: 1080 }, 2);
    expect(big.fits).toBe(true);
    expect(big.warning).toBeNull();

    const tiny = renderGameMockPreview(project, page, env, { id: 'tiny', label: 'tiny', w: 320, h: 240 }, 4);
    expect(tiny.fits).toBe(false);
    expect(typeof tiny.warning).toBe('string');
    expect(tiny.warning!.length).toBeGreaterThan(0);
  });

  it('produces a decodable PNG of the window size', () => {
    const project = createProject();
    const page = project.pages[0];
    const win = { id: 'w', label: 'w', w: 1280, h: 720 };
    const out = renderGameMockPreview(project, page, env, win, 2);
    const decoded = decodePng(out.png);
    expect(decoded.width).toBe(out.width);
    expect(decoded.height).toBe(out.height);
  });
});

describe('defaultPreviewPath', () => {
  it('places the preview next to the project file under previews/', () => {
    const p = defaultPreviewPath('/tmp/foo/project.mcms.json', 'main', '.png');
    expect(p).toBe(join('/tmp/foo', 'previews', 'main.png'));
  });
});
