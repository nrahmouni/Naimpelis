import fs from 'fs';
import path from 'path';
import vm from 'vm';
import zlib from 'zlib';
import { describe, expect, it } from 'vitest';
import { buildSignedApkBuffer } from '../server/services/apkBuilderService';
import { CLIENT_APK_VERSION_CODE, CLIENT_APP_VERSION } from '../src/utils/versionSync';
import { ENV } from '../server/config/env';

function readDexFromApk(apkBuf: Buffer): string {
  let eocdOff = -1;
  for (let i = apkBuf.length - 22; i >= Math.max(0, apkBuf.length - 65560); i--) {
    if (apkBuf.readUInt32LE(i) === 0x06054b50) {
      eocdOff = i;
      break;
    }
  }
  if (eocdOff < 0) throw new Error('EOCD not found');
  const cdCount = apkBuf.readUInt16LE(eocdOff + 10);
  let pos = apkBuf.readUInt32LE(eocdOff + 16);

  for (let idx = 0; idx < cdCount; idx++) {
    const compression = apkBuf.readUInt16LE(pos + 10);
    const compressedSize = apkBuf.readUInt32LE(pos + 20);
    const nameLen = apkBuf.readUInt16LE(pos + 28);
    const extraLen = apkBuf.readUInt16LE(pos + 30);
    const commentLen = apkBuf.readUInt16LE(pos + 32);
    const localHeaderOffset = apkBuf.readUInt32LE(pos + 42);
    const name = apkBuf.subarray(pos + 46, pos + 46 + nameLen).toString('utf8');

    if (name === 'classes.dex') {
      const lNameLen = apkBuf.readUInt16LE(localHeaderOffset + 26);
      const lExtraLen = apkBuf.readUInt16LE(localHeaderOffset + 28);
      const dataOffset = localHeaderOffset + 30 + lNameLen + lExtraLen;
      const raw = apkBuf.subarray(dataOffset, dataOffset + compressedSize);
      const data = compression === 0 ? raw : zlib.inflateRawSync(raw);
      return data.toString('utf8');
    }
    pos += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error('classes.dex not found in APK');
}

describe('Cross-Platform Version Control & Google TV 10-Foot UI', () => {
  it('keeps client version synced with server ENV release metadata', () => {
    expect(CLIENT_APP_VERSION).toBe(ENV.appVersionName);
    expect(CLIENT_APK_VERSION_CODE).toBe(ENV.appVersionCodeMobile);
    expect(ENV.appVersionCodeTv).toBeGreaterThanOrEqual(302);
  });

  it('embeds apkv query version tracking into signed Mobile & Google TV APKs', () => {
    const mobileDex = readDexFromApk(buildSignedApkBuffer('mobile', 'https://naimcine.example.app'));
    const tvDex = readDexFromApk(buildSignedApkBuffer('tv', 'https://naimcine.example.app'));

    expect(mobileDex).toContain(
      `https://naimcine.example.app/?platform=android&web=1&apkv=${ENV.appVersionCodeMobile}`
    );
    expect(tvDex).toContain(
      `https://naimcine.example.app/tv?platform=googletv&apkv=${ENV.appVersionCodeTv}`
    );
  });

  it('serves valid ES5 JavaScript in public/tv-receiver.html with D-Pad Hub + World TV merge + OTA sync', () => {
    const publicDir = path.resolve(process.cwd(), 'public');
    const htmlPath = path.join(publicDir, 'tv-receiver.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    const scriptMatches = Array.from(html.matchAll(/<script\s+src="(\/tv\/[^"]+\.js)"\s*><\/script>/gi));
    expect(scriptMatches.length).toBeGreaterThanOrEqual(5);

    const jsSources = scriptMatches.map((m) => {
      const scriptFile = path.join(publicDir, m[1].replace(/^\//, ''));
      const code = fs.readFileSync(scriptFile, 'utf8');
      expect(() => new vm.Script(code)).not.toThrow();
      return code;
    });

    const combined = `${html}\n${jsSources.join('\n')}`;
    expect(combined).toContain('id="tv-hub-screen"');
    expect(combined).toContain('id="pairing-screen"');
    expect(combined).toContain('id="tv-series-modal"');
    expect(combined).toContain('/api/app/latest?platform=tv');
    expect(combined).toContain('/api/catalog/latest-releases');
    expect(combined).toContain('/api/catalog/world-tv');
    expect(combined).toContain('/api/catalog/tv/');
    expect(combined).toContain('moveFocusDirection');
    expect(combined).toContain('is-smart-tv');
    expect(combined).toContain('createDocumentFragment');
    expect(combined).toContain('updateTdtEpgCardsInPlace');
    expect(combined).toContain('liveSyncDurationCount: isLive ? (isDvbLive ? 1 : 2) : 3');
  });
});
