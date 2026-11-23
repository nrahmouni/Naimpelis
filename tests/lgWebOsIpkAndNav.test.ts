import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { parseAppRoute } from '../src/shared/dedicatedRoutes';
import {
  PUBLISHED_RIFFAN_ORIGIN,
  WEBOS_COMPATIBILITY_MATRIX,
  generateWebOsAppInfoJson,
  normalizeWebOsAppId,
  normalizeWebOsVersion,
  resolvePublishedRiffanOrigin,
} from '../src/utils/webosConfigGenerator';
import {
  buildUniversalWebOsLauncherAssets,
  buildWebOsPackageArchive,
  hasWebOsPngSignature,
  rewriteHtmlForWebOsFileProtocol,
} from '../src/utils/webosIpkBuilder';
import { mapKeyboardEventToTvAction } from '../src/utils/tvSpatialNav';

const ROOT = process.cwd();

function parseArArchive(bytes: Uint8Array): Map<string, Uint8Array> {
  const magic = Buffer.from(bytes.subarray(0, 8)).toString('ascii');
  expect(magic).toBe('!<arch>\n');

  const members = new Map<string, Uint8Array>();
  let offset = 8;
  while (offset + 60 <= bytes.length) {
    const header = bytes.subarray(offset, offset + 60);
    const name = Buffer.from(header.subarray(0, 16)).toString('ascii').trim().replace(/\/$/, '');
    const sizeStr = Buffer.from(header.subarray(48, 58)).toString('ascii').trim();
    const size = Number.parseInt(sizeStr, 10);
    expect(Number.isFinite(size) && size >= 0).toBe(true);
    const dataStart = offset + 60;
    const dataEnd = dataStart + size;
    members.set(name, bytes.subarray(dataStart, dataEnd));
    offset = dataEnd + (size % 2 === 1 ? 1 : 0);
  }
  return members;
}

function parseTarEntries(tarBytes: Uint8Array): Map<string, Uint8Array> {
  const entries = new Map<string, Uint8Array>();
  let offset = 0;
  while (offset + 512 <= tarBytes.length) {
    const header = tarBytes.subarray(offset, offset + 512);
    const isZeroBlock = header.every((b) => b === 0);
    if (isZeroBlock) break;

    const rawName = Buffer.from(header.subarray(0, 100)).toString('utf8').replace(/\0.*$/, '');
    const rawPrefix = Buffer.from(header.subarray(345, 500)).toString('utf8').replace(/\0.*$/, '');
    const fullName = rawPrefix ? `${rawPrefix}/${rawName}` : rawName;
    const sizeOct = Buffer.from(header.subarray(124, 136)).toString('ascii').replace(/\0.*$/, '').trim();
    const size = sizeOct ? Number.parseInt(sizeOct, 8) : 0;
    const typeFlag = header[156];

    const dataStart = offset + 512;
    const dataEnd = dataStart + size;
    if (typeFlag !== 0x35) {
      entries.set(fullName, tarBytes.subarray(dataStart, dataEnd));
    } else {
      entries.set(fullName, new Uint8Array(0));
    }

    const paddedSize = Math.ceil(size / 512) * 512;
    offset = dataStart + paddedSize;
  }
  return entries;
}

describe('LG webOS Smart TV (.ipk) Architecture, Legacy/Modern Tiers, Navigation & Packager', () => {
  it('validates canonical root appinfo.json and generates compliant webOS manifests for old & new TVs', () => {
    const rootAppInfoRaw = fs.readFileSync(path.join(ROOT, 'appinfo.json'), 'utf8');
    const rootAppInfo = JSON.parse(rootAppInfoRaw) as Record<string, unknown>;

    expect(rootAppInfo.id).toBe('com.riffantv.webos');
    expect(rootAppInfo.type).toBe('web');
    expect(rootAppInfo.main).toBe('index.html');
    expect(rootAppInfo.disableBackHistoryAPI).toBe(true);
    expect(rootAppInfo.handlesRelaunch).toBe(true);
    expect(rootAppInfo.supportMouse).toBe(true);

    expect(normalizeWebOsAppId('Riffan Living_Room!!')).toBe('com.riffanliving-room.webos');
    expect(normalizeWebOsAppId('Org.Custom_TV.App')).toBe('org.custom-tv.app');
    expect(normalizeWebOsVersion('3.5')).toBe('3.5.0');

    expect(WEBOS_COMPATIBILITY_MATRIX.length).toBeGreaterThanOrEqual(3);
    expect(WEBOS_COMPATIBILITY_MATRIX.some((r) => r.webOsVersions.includes('3.0'))).toBe(true);
    expect(WEBOS_COMPATIBILITY_MATRIX.some((r) => r.webOsVersions.includes('24+'))).toBe(true);

    const legacyJson = JSON.parse(
      generateWebOsAppInfoJson({ appId: 'org.test.tv', version: '2.1', targetTier: 'legacy' })
    ) as Record<string, unknown>;
    expect(legacyJson.id).toBe('org.test.tv');
    expect(legacyJson.allowVideoOnMiniView).toBeUndefined();

    const modernJson = JSON.parse(
      generateWebOsAppInfoJson({ appId: 'org.test.tv', version: '2.1', targetTier: 'modern' })
    ) as Record<string, unknown>;
    expect(modernJson.allowVideoOnMiniView).toBe(true);
    expect(modernJson.supportsAudioGuidance).toBe(true);
  });

  it('generates strict ES5 launcher JS compatible with legacy webOS 3.0-5.0 Chromium and rewrites file:// HTML cleanly', () => {
    const launcher = buildUniversalWebOsLauncherAssets(
      'RiffanTV LG',
      'https://riffan.example.tv/',
      'legacy'
    );

    expect(() => new vm.Script(launcher.mainJs)).not.toThrow();
    expect(() => new vm.Script(launcher.webOsStubJs)).not.toThrow();

    expect(launcher.mainJs).not.toMatch(/\b(const|let)\s+/);
    expect(launcher.mainJs).not.toContain('=>');
    expect(launcher.mainJs).not.toContain('?.');
    expect(launcher.mainJs).toContain('XMLHttpRequest');
    expect(launcher.mainJs).toContain('code === 461');
    expect(launcher.mainJs).toContain('webOS.platformBack');
    expect(launcher.mainJs).toContain('https://riffan.example.tv/tvlg');
    expect(launcher.appCss).toContain('-webkit-flex');

    expect(
      resolvePublishedRiffanOrigin('https://ais-pre-7irzrnjaiycjocsssifa7h-664579900625.europe-west3.run.app')
    ).toBe(PUBLISHED_RIFFAN_ORIGIN);
    expect(resolvePublishedRiffanOrigin('https://riffan.ai.studio')).toBe(PUBLISHED_RIFFAN_ORIGIN);

    const rawHtml =
      '<html><head><link rel="stylesheet" href="/assets/app.css" /><script type="module" src="/assets/main.js"></script><script src="./registerSW.js"></script></head><body></body></html>';
    const rewritten = rewriteHtmlForWebOsFileProtocol(rawHtml, 'https://riffan.example.tv', 'modern');
    expect(rewritten).toContain('href="./assets/app.css"');
    expect(rewritten).toContain('src="./assets/main.js"');
    expect(rewritten).not.toContain('registerSW.js');
    expect(rewritten).toContain('window.__RIFFAN_WEBOS_APP__ = true;');
    expect(rewritten).toContain('https://riffan.example.tv');
  });

  it('builds a real Debian ar + tar.gz LG webOS .ipk archive extractable into /usr/palm/applications/<appId>/', async () => {
    const result = await buildWebOsPackageArchive({
      appName: 'RiffanTV LG',
      appId: 'com.riffantv.lgtest',
      version: '1.2.3',
      targetTier: 'universal',
      archiveFormat: 'ipk',
      targetOrigin: 'https://riffan.ai.studio',
    });

    expect(result.filename).toBe('com.riffantv.lgtest_1.2.3_universal.ipk');
    expect(result.archiveFormat).toBe('ipk');
    expect(result.byteSize).toBeGreaterThan(500);

    const arMembers = parseArArchive(result.bytes);
    expect(arMembers.has('debian-binary')).toBe(true);
    expect(arMembers.has('control.tar.gz')).toBe(true);
    expect(arMembers.has('data.tar.gz')).toBe(true);

    expect(Buffer.from(arMembers.get('debian-binary')!).toString('utf8')).toBe('2.0\n');

    const controlTar = zlib.gunzipSync(arMembers.get('control.tar.gz')!);
    const controlEntries = parseTarEntries(new Uint8Array(controlTar));
    expect(controlEntries.has('./control')).toBe(true);
    const controlTxt = Buffer.from(controlEntries.get('./control')!).toString('utf8');
    expect(controlTxt).toContain('Package: com.riffantv.lgtest');
    expect(controlTxt).toContain('Version: 1.2.3');
    expect(controlTxt).toContain('webOS-Package-Format-Version: 2');

    const dataTar = zlib.gunzipSync(arMembers.get('data.tar.gz')!);
    const dataEntries = parseTarEntries(new Uint8Array(dataTar));
    const appBase = './usr/palm/applications/com.riffantv.lgtest';

    expect(dataEntries.has(`${appBase}/appinfo.json`)).toBe(true);
    expect(dataEntries.has(`${appBase}/index.html`)).toBe(true);
    expect(dataEntries.has(`${appBase}/app.css`)).toBe(true);
    expect(dataEntries.has(`${appBase}/main.js`)).toBe(true);
    expect(dataEntries.has(`${appBase}/webOSTV.js`)).toBe(true);
    expect(dataEntries.has(`${appBase}/icon.png`)).toBe(true);
    expect(dataEntries.has(`${appBase}/largeIcon.png`)).toBe(true);

    const appInfoParsed = JSON.parse(
      Buffer.from(dataEntries.get(`${appBase}/appinfo.json`)!).toString('utf8')
    ) as Record<string, unknown>;
    expect(appInfoParsed.id).toBe('com.riffantv.lgtest');
    expect(appInfoParsed.disableBackHistoryAPI).toBe(true);

    expect(hasWebOsPngSignature(dataEntries.get(`${appBase}/icon.png`)!)).toBe(true);
    expect(hasWebOsPngSignature(dataEntries.get(`${appBase}/largeIcon.png`)!)).toBe(true);
  });

  it('builds a valid Ares-ready .zip archive for legacy LG webOS TVs', async () => {
    const zipResult = await buildWebOsPackageArchive({
      appName: 'RiffanTV Legacy',
      appId: 'com.riffantv.legacy',
      version: '1.0.1',
      targetTier: 'legacy',
      archiveFormat: 'zip',
      targetOrigin: 'https://riffan.ai.studio',
    });

    expect(zipResult.filename).toBe('com.riffantv.legacy_1.0.1_legacy.zip');
    const parsedZip = await JSZip.loadAsync(zipResult.bytes);
    expect(parsedZip.file('appinfo.json')).not.toBeNull();
    expect(parsedZip.file('index.html')).not.toBeNull();
    expect(parsedZip.file('main.js')).not.toBeNull();
    expect(parsedZip.file('icon.png')).not.toBeNull();
    expect(parsedZip.file('largeIcon.png')).not.toBeNull();
  });

  it('parses /webos, /lg and ?webos=1 as the dedicated LG webOS TV system route', () => {
    expect(parseAppRoute('/webos')).toEqual({
      kind: 'system',
      systemType: 'webos',
      roomId: undefined,
    });
    expect(parseAppRoute('/lg')).toEqual({
      kind: 'system',
      systemType: 'webos',
      roomId: undefined,
    });
    expect(parseAppRoute('/', '?webos=1&room=sala42')).toEqual({
      kind: 'system',
      systemType: 'webos',
      roomId: 'sala42',
    });
    expect(parseAppRoute('/tvlg')).toEqual({
      kind: 'system',
      systemType: 'tv',
      roomId: undefined,
    });
    expect(parseAppRoute('/lgtv')).toEqual({
      kind: 'system',
      systemType: 'tv',
      roomId: undefined,
    });
  });

  it('maps LG Magic Remote Back (461) and media keys cleanly', () => {
    expect(mapKeyboardEventToTvAction({ key: '', keyCode: 461 })).toBe('BACK');
    expect(mapKeyboardEventToTvAction({ key: '', keyCode: 23 })).toBe('SELECT');
    expect(mapKeyboardEventToTvAction({ key: 'Enter', keyCode: 13 })).toBe('SELECT');
    expect(mapKeyboardEventToTvAction({ key: '', keyCode: 415 })).toBe('PLAY');
    expect(mapKeyboardEventToTvAction({ key: '', keyCode: 413 })).toBe('STOP');
    expect(mapKeyboardEventToTvAction({ key: '', keyCode: 412 })).toBe('RW');
    expect(mapKeyboardEventToTvAction({ key: '', keyCode: 417 })).toBe('FF');
    expect(mapKeyboardEventToTvAction({ key: '', keyCode: 427 })).toBe('CH_UP');
    expect(mapKeyboardEventToTvAction({ key: '', keyCode: 428 })).toBe('CH_DOWN');
  });

  it('parses /public/tv scripts without ES syntax errors and integrates LG webOS runtime hooks', () => {
    const tvScripts = [
      'tv-i18n.js',
      'tv-state.js',
      'tv-player-core.js',
      'tv-player-modes.js',
      'tv-hub.js',
      'tv-nav-voice.js',
    ].map((name) => fs.readFileSync(path.join(ROOT, 'public/tv', name), 'utf8'));

    for (const src of tvScripts) {
      expect(() => new vm.Script(src)).not.toThrow();
    }

    const combined = tvScripts.join('\n');
    expect(combined).toContain('isWebOsDevice');
    expect(combined).toContain('platform=webos');
    expect(combined).toContain('LG webOS');
    expect(combined).toContain('window.webOS.platformBack');
  });

  it('includes GitHub Actions workflow building both Universal (webOS 3-24+) and Modern Offline (.ipk) artifacts', () => {
    const workflowPath = path.join(ROOT, '.github', 'workflows', 'build-webos-ipk.yml');
    expect(fs.existsSync(workflowPath)).toBe(true);
    const yml = fs.readFileSync(workflowPath, 'utf8');
    expect(yml).toContain('async function run()');
    expect(yml).toContain('run().catch(');
    expect(yml).toContain('@webosose/ares-cli');
    expect(yml).toContain('ares-package');
    expect(yml).toContain('webos3-24');
    expect(yml).toContain('webos6-24');
    expect(yml).toContain('actions/upload-artifact@v4');
  });
});
