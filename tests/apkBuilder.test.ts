import crypto from 'crypto';
import zlib from 'zlib';
import { describe, expect, it } from 'vitest';
import { buildSignedApkBuffer } from '../server/services/apkBuilderService';

function parseZipEntries(buf: Buffer) {
  let eocdOff = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65560); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocdOff = i;
      break;
    }
  }
  expect(eocdOff).toBeGreaterThan(0);

  const cdCount = buf.readUInt16LE(eocdOff + 10);
  const cdOffset = buf.readUInt32LE(eocdOff + 16);
  const entries = new Map<
    string,
    {
      compression: number;
      compressedSize: number;
      uncompressedSize: number;
      crc32: number;
      localHeaderOffset: number;
      dataOffset: number;
      data: Buffer;
    }
  >();

  let pos = cdOffset;
  for (let idx = 0; idx < cdCount; idx++) {
    expect(buf.readUInt32LE(pos)).toBe(0x02014b50);
    const compression = buf.readUInt16LE(pos + 10);
    const crc32 = buf.readUInt32LE(pos + 16);
    const compressedSize = buf.readUInt32LE(pos + 20);
    const uncompressedSize = buf.readUInt32LE(pos + 24);
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    const localHeaderOffset = buf.readUInt32LE(pos + 42);
    const name = buf.subarray(pos + 46, pos + 46 + nameLen).toString('utf8');

    expect(buf.readUInt32LE(localHeaderOffset)).toBe(0x04034b50);
    const lNameLen = buf.readUInt16LE(localHeaderOffset + 26);
    const lExtraLen = buf.readUInt16LE(localHeaderOffset + 28);
    const dataOffset = localHeaderOffset + 30 + lNameLen + lExtraLen;
    const rawSlice = buf.subarray(dataOffset, dataOffset + compressedSize);
    const data = compression === 0 ? rawSlice : zlib.inflateRawSync(rawSlice);
    expect(data.length).toBe(uncompressedSize);

    entries.set(name, {
      compression,
      compressedSize,
      uncompressedSize,
      crc32,
      localHeaderOffset,
      dataOffset,
      data,
    });

    pos += 46 + nameLen + extraLen + commentLen;
  }

  return { entries, cdOffset, eocdOff };
}

describe('Signed Android APK Builder Service', () => {
  it('builds a valid signed mobile APK with APKv2 block, 4-byte aligned resources.arsc, and valid DEX', () => {
    const mobileApk = buildSignedApkBuffer('mobile', 'https://naimcine.example.app');
    expect(mobileApk.length).toBeGreaterThan(10_000);

    const { entries, cdOffset } = parseZipEntries(mobileApk);
    expect(entries.has('AndroidManifest.xml')).toBe(true);
    expect(entries.has('classes.dex')).toBe(true);
    expect(entries.has('resources.arsc')).toBe(true);
    expect(entries.has('res/mipmap-xxxhdpi-v4/ic_launcher.png')).toBe(true);
    expect(entries.has('META-INF/MANIFEST.MF')).toBe(true);
    expect(entries.has('META-INF/CERT.SF')).toBe(true);
    expect(entries.has('META-INF/CERT.RSA')).toBe(true);

    // resources.arsc must be STORED and 4-byte aligned for Android R+
    const arsc = entries.get('resources.arsc')!;
    expect(arsc.compression).toBe(0);
    expect(arsc.dataOffset % 4).toBe(0);

    // APK Signature Scheme v2 magic right before Central Directory
    const magic = mobileApk.subarray(cdOffset - 16, cdOffset).toString('ascii');
    expect(magic).toBe('APK Sig Block 42');

    // DEX header checksums + launch URL inside string table
    const dex = entries.get('classes.dex')!.data;
    expect(dex.subarray(0, 8).toString('ascii')).toBe('dex\n035\0');
    const sha1 = crypto.createHash('sha1').update(dex.subarray(32)).digest();
    expect(dex.subarray(12, 32).equals(sha1)).toBe(true);
    expect(dex.toString('utf8')).toContain('https://naimcine.example.app/?platform=android&web=1');
  });

  it('builds a valid signed Google TV APK targeting /tv with Leanback launcher', () => {
    const tvApk = buildSignedApkBuffer('tv', 'https://naimcine.example.app');
    expect(tvApk.length).toBeGreaterThan(10_000);

    const { entries } = parseZipEntries(tvApk);
    const dex = entries.get('classes.dex')!.data;
    expect(dex.toString('utf8')).toContain('https://naimcine.example.app/tv');

    const manifestTxt = entries.get('AndroidManifest.xml')!.data.toString('utf16le');
    expect(manifestTxt).toContain('com.naimcine.tv');
    expect(manifestTxt).toContain('LEANBACK_LAUNCHER');
  });
});
