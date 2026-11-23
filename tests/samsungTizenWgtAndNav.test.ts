import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { parseAppRoute } from '../src/shared/dedicatedRoutes';
import {
  generateTizenConfigXml,
  normalizeTizenPackageId,
  normalizeTizenVersion,
} from '../src/utils/tizenConfigGenerator';
import {
  buildHostedTizenLauncherHtml,
  buildTizenWgtArchive,
  hasPngSignature,
  rewriteHtmlForTizenFileProtocol,
} from '../src/utils/tizenWgtBuilder';
import { mapKeyboardEventToTvAction } from '../src/utils/tvSpatialNav';

const ROOT = process.cwd();

describe('Samsung Smart TV (Tizen .wgt) Architecture, Navigation & Packager', () => {
  it('validates canonical root config.xml and generates compliant Tizen config.xml manifests', () => {
    const rootCfg = fs.readFileSync(path.join(ROOT, 'config.xml'), 'utf8');
    expect(rootCfg).toContain('http://tizen.org/ns/widgets');
    expect(rootCfg).toContain('<tizen:profile name="tv-samsung"/>');
    expect(rootCfg).toContain('<access origin="*" subdomains="true"/>');
    expect(rootCfg).toContain('http://tizen.org/privilege/internet');
    expect(rootCfg).toContain('http://tizen.org/privilege/tv.inputdevice');
    expect(rootCfg).toContain('screen-orientation="landscape"');

    expect(normalizeTizenPackageId('my-app-99')).toBe('myapp99Rif');
    expect(normalizeTizenVersion('2.4')).toBe('2.4.0');

    const customXml = generateTizenConfigXml({
      packageId: 'CustomId99',
      appName: 'Riffan LivingRoom',
      version: '1.2.3',
    });
    expect(customXml).toContain('<tizen:application id="CustomId99.RiffanTV" package="CustomId99"');
    expect(customXml).toContain('<name>Riffan LivingRoom</name>');
    expect(customXml).toContain('version="1.2.3"');
    expect(customXml).toContain('http://tizen.org/metadata/app/screensaver');
  });

  it('rewrites root asset URLs for Tizen file:// protocol and injects API origin shim', () => {
    const rawHtml =
      '<html><head><link rel="stylesheet" href="/assets/main.css" /><script type="module" src="/assets/app.js"></script><script src="./registerSW.js"></script></head><body></body></html>';
    const rewritten = rewriteHtmlForTizenFileProtocol(rawHtml, 'https://riffan.example.tv');
    expect(rewritten).toContain('href="./assets/main.css"');
    expect(rewritten).toContain('src="./assets/app.js"');
    expect(rewritten).not.toContain('registerSW.js');
    expect(rewritten).toContain('window.__RIFFAN_TIZEN_WIDGET__ = true;');
    expect(rewritten).toContain('https://riffan.example.tv');

    const launcher = buildHostedTizenLauncherHtml('RiffanTV', 'https://riffan.example.tv/');
    expect(launcher).toContain('https://riffan.example.tv/?tizen=1&tv=1');
    expect(launcher).toContain('code === 10009');
  });

  it('builds a valid compressed .wgt archive containing config.xml, index.html, and real PNG icon.png', async () => {
    const archive = await buildTizenWgtArchive({
      appName: 'RiffanTV Test',
      packageId: 'TizenTst01',
      version: '1.0.5',
      packageMode: 'hosted_launcher',
      targetOrigin: 'https://riffan.ai.studio',
    });

    expect(archive.filename).toBe('RiffanTVTest-TizenTst01.wgt');
    expect(archive.fileCount).toBeGreaterThanOrEqual(3);
    expect(archive.byteSize).toBeGreaterThan(200);

    const parsedZip = await JSZip.loadAsync(archive.bytes);
    const configEntry = parsedZip.file('config.xml');
    const indexEntry = parsedZip.file('index.html');
    const cssEntry = parsedZip.file('app.css');
    const jsEntry = parsedZip.file('main.js');
    const iconEntry = parsedZip.file('icon.png');

    expect(configEntry).not.toBeNull();
    expect(indexEntry).not.toBeNull();
    expect(cssEntry).not.toBeNull();
    expect(jsEntry).not.toBeNull();
    expect(iconEntry).not.toBeNull();

    const extractedXml = await configEntry!.async('string');
    const extractedHtml = await indexEntry!.async('string');
    const extractedJs = await jsEntry!.async('string');
    const extractedPng = await iconEntry!.async('uint8array');

    expect(extractedXml).toContain('TizenTst01.RiffanTV');
    expect(extractedHtml).toContain('RiffanTV Test');
    expect(extractedHtml).toContain('href="app.css"');
    expect(extractedHtml).toContain('src="main.js"');
    expect(extractedJs).toContain('https://riffan.ai.studio/tv');
    expect(hasPngSignature(extractedPng)).toBe(true);
  });

  it('parses /samsung and ?samsung=1 as the dedicated Samsung TV system route', () => {
    expect(parseAppRoute('/samsung')).toEqual({
      kind: 'system',
      systemType: 'samsung',
      roomId: undefined,
    });
    expect(parseAppRoute('/', '?samsung=1&room=sala42')).toEqual({
      kind: 'system',
      systemType: 'samsung',
      roomId: 'sala42',
    });
  });

  it('maps Samsung Tizen remote keyCodes and D-Pad keys accurately', () => {
    expect(mapKeyboardEventToTvAction({ key: 'ArrowUp', keyCode: 38 })).toBe('UP');
    expect(mapKeyboardEventToTvAction({ key: 'ArrowDown', keyCode: 40 })).toBe('DOWN');
    expect(mapKeyboardEventToTvAction({ key: 'ArrowLeft', keyCode: 37 })).toBe('LEFT');
    expect(mapKeyboardEventToTvAction({ key: 'ArrowRight', keyCode: 39 })).toBe('RIGHT');
    expect(mapKeyboardEventToTvAction({ key: '', keyCode: 23 })).toBe('SELECT');
    expect(mapKeyboardEventToTvAction({ key: '', keyCode: 10009 })).toBe('BACK');
    expect(mapKeyboardEventToTvAction({ key: '', keyCode: 10252 })).toBe('PLAY_PAUSE');
    expect(mapKeyboardEventToTvAction({ key: '', keyCode: 415 })).toBe('PLAY');
    expect(mapKeyboardEventToTvAction({ key: 'MediaPause', keyCode: 19 })).toBe('PAUSE');
    expect(mapKeyboardEventToTvAction({ key: '', keyCode: 413 })).toBe('STOP');
    expect(mapKeyboardEventToTvAction({ key: '', keyCode: 412 })).toBe('RW');
    expect(mapKeyboardEventToTvAction({ key: '', keyCode: 417 })).toBe('FF');
    expect(mapKeyboardEventToTvAction({ key: '', keyCode: 427 })).toBe('CH_UP');
    expect(mapKeyboardEventToTvAction({ key: '', keyCode: 428 })).toBe('CH_DOWN');
  });

  it('includes cloud auto-signing GitHub Actions workflow for .wgt builds', () => {
    const workflowPath = path.join(ROOT, '.github', 'workflows', 'build-tizen-wgt.yml');
    expect(fs.existsSync(workflowPath)).toBe(true);
    const yml = fs.readFileSync(workflowPath, 'utf8');
    expect(yml).toContain('--legacy-peer-deps');
    expect(yml).toContain('npx vite build --base=./');
    expect(yml).toContain('registerSW');
    expect(yml).toContain('tizen package -t wgt');
    expect(yml).toContain('actions/upload-artifact@v4');
  });
});
