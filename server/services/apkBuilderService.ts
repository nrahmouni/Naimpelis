import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { ENV, ROOT_DIR } from '../config/env.ts';
import { LruTtlCache } from '../utils/lruCache.ts';
import {
  type ApkFlavor,
  buildBinaryAndroidManifest,
  buildResourcesArsc,
  crc32,
} from './apkHelpers/androidBinaryXmlAndArsc.ts';
import { buildWebViewMainActivityDex } from './apkHelpers/dexWebViewBuilder.ts';
import {
  type ZipInputFile,
  assembleSignedApk,
  buildManifestAndCertSf,
  buildPkcs7CertRsa,
  ensureSigningCert,
  getApkSigningCertSha256,
} from './apkHelpers/apkSignerAndZip.ts';

export type { ApkFlavor };
export { getApkSigningCertSha256 };

const APK_CACHE_TTL_MS = 30 * 60 * 1000;
const generatedApkCache = new LruTtlCache<string, Buffer>(16, APK_CACHE_TTL_MS);

function encodeRgbaPng(width: number, height: number, drawPixel: (x: number, y: number) => [number, number, number, number]): Buffer {
  const rowSize = 1 + width * 4;
  const raw = Buffer.alloc(rowSize * height);
  for (let y = 0; y < height; y++) {
    const rowOff = y * rowSize;
    raw[rowOff] = 0; // filter type 0
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = drawPixel(x, y);
      const pxOff = rowOff + 1 + x * 4;
      raw[pxOff] = r & 0xff;
      raw[pxOff + 1] = g & 0xff;
      raw[pxOff + 2] = b & 0xff;
      raw[pxOff + 3] = a & 0xff;
    }
  }

  const makeChunk = (type: string, data: Buffer): Buffer => {
    const typeBuf = Buffer.from(type, 'ascii');
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(data.length, 0);
    const crcInput = Buffer.concat([typeBuf, data]);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(crcInput) >>> 0, 0);
    return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const compressed = zlib.deflateSync(raw, { level: 6 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

function buildMusicIconPng(): Buffer {
  const size = 192;
  return encodeRgbaPng(size, size, (x, y) => {
    const t = (x + y) / (size * 2);
    // Deep Riffan Music cobalt blue -> electric sky gradient background
    let r = Math.round(12 + 25 * t);
    let g = Math.round(18 + 75 * t);
    let b = Math.round(38 + 185 * t);

    const cx = size / 2;
    const cy = size / 2;
    const dx = x - cx;
    const dy = y - cy;
    const dist = Math.hypot(dx, dy);

    // Outer circular ring & equalizer soundwave bars
    if (dist < 68 && dist > 60) {
      return [255, 255, 255, 235];
    }
    const barOffsets = [-34, -17, 0, 17, 34];
    const barHeights = [22, 38, 50, 34, 20];
    for (let i = 0; i < barOffsets.length; i++) {
      if (Math.abs(dx - barOffsets[i]) <= 5 && Math.abs(dy) <= barHeights[i] / 2) {
        r = 255;
        g = 255;
        b = 255;
      }
    }
    return [r, g, b, 255];
  });
}

function buildTvBannerPng(): Buffer {
  // Standard Android TV Leanback xhdpi banner dimensions: 320x180 (16:9)
  const w = 320;
  const h = 180;
  return encodeRgbaPng(w, h, (x, y) => {
    const nx = x / w;
    const ny = y / h;
    // Obsidian cinema canvas + subtle violet/blue radial spotlight
    const spot = Math.max(0, 1 - Math.hypot((nx - 0.5) * 1.4, (ny - 0.5) * 1.4));
    let r = Math.round(10 + spot * 36);
    let g = Math.round(12 + spot * 28);
    let b = Math.round(22 + spot * 92);

    // Subtle crisp frame border (4px inset)
    if (x >= 4 && x < w - 4 && y >= 4 && y < h - 4 && (x < 7 || x >= w - 7 || y < 7 || y >= h - 7)) {
      return [96, 165, 250, 220];
    }

    // Centered TV play emblem & geometric "TV" block bars
    const dx = x - 160;
    const dy = y - 90;
    // Rounded studio badge on the left
    const badgeDist = Math.hypot(x - 104, dy);
    if (badgeDist <= 34) {
      // Play triangle inside circular badge
      const tx = x - 97;
      if (tx >= -8 && tx <= 18 && Math.abs(dy) <= (18 - tx) * 0.72) {
        return [255, 255, 255, 255];
      }
      return [59, 130, 246, 255];
    }

    // Stylized geometric wordmark bars on right ("RIFFAN TV")
    const bars: Array<[number, number, number, number, [number, number, number]]> = [
      [154, 162, 68, 112, [255, 255, 255]],
      [162, 184, 68, 76, [255, 255, 255]],
      [162, 182, 86, 94, [255, 255, 255]],
      [178, 186, 76, 86, [255, 255, 255]],
      [174, 186, 94, 112, [255, 255, 255]],
      // T bar
      [198, 232, 68, 76, [96, 165, 250]],
      [211, 219, 76, 112, [96, 165, 250]],
      // V stroke blocks
      [240, 248, 68, 96, [167, 139, 250]],
      [248, 256, 96, 112, [167, 139, 250]],
      [256, 264, 68, 96, [167, 139, 250]],
    ];
    for (const [x0, x1, y0, y1, col] of bars) {
      if (x >= x0 && x <= x1 && y >= y0 && y <= y1) {
        r = col[0];
        g = col[1];
        b = col[2];
        break;
      }
    }
    return [r, g, b, 255];
  });
}

function loadAppIconPng(flavor: ApkFlavor): Buffer {
  if (flavor === 'music') {
    for (const p of [
      path.join(ROOT_DIR, 'public', 'music-pwa-512x512.png'),
      path.join(ROOT_DIR, 'public', 'music-pwa-192x192.png'),
      path.join(ROOT_DIR, 'public', 'music-apple-touch-icon.png'),
    ]) {
      if (fs.existsSync(p)) {
        return fs.readFileSync(p);
      }
    }
    return buildMusicIconPng();
  }
  for (const p of [
    path.join(ROOT_DIR, 'public', 'pwa-512x512.png'),
    path.join(ROOT_DIR, 'public', 'pwa-192x192.png'),
    path.join(ROOT_DIR, 'public', 'apple-touch-icon.png'),
  ]) {
    if (fs.existsSync(p)) {
      return fs.readFileSync(p);
    }
  }
  return buildMusicIconPng();
}

export function buildSignedApkBuffer(flavor: ApkFlavor, origin: string): Buffer {
  const cleanOrigin = origin.replace(/\/+$/, '');
  const apkVersionCode =
    flavor === 'tv'
      ? ENV.appVersionCodeTv
      : flavor === 'music'
        ? ENV.appVersionCodeMusic
        : ENV.appVersionCodeMobile;
  const launchUrl =
    flavor === 'tv'
      ? `${cleanOrigin}/tv?platform=googletv&apkv=${apkVersionCode}`
      : flavor === 'music'
        ? `${cleanOrigin}/musica?platform=android-music&web=1&apkv=${apkVersionCode}`
        : `${cleanOrigin}/?platform=android&web=1&apkv=${apkVersionCode}`;
  const cacheKey = `${flavor}|${launchUrl}|v2`;

  const cached = generatedApkCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const cert = ensureSigningCert();
  const manifestBin = buildBinaryAndroidManifest(flavor);
  const dexBin = buildWebViewMainActivityDex(launchUrl);
  const arscBin = buildResourcesArsc(flavor);
  const iconPng = loadAppIconPng(flavor);

  const baseFiles: ZipInputFile[] = [
    { name: 'AndroidManifest.xml', data: manifestBin },
    { name: 'classes.dex', data: dexBin },
    { name: 'res/mipmap-xxxhdpi-v4/ic_launcher.png', data: iconPng, store: true, align4: true },
    ...(flavor === 'tv'
      ? [{ name: 'res/drawable-xhdpi-v4/tv_banner.png', data: buildTvBannerPng(), store: true, align4: true }]
      : []),
    { name: 'resources.arsc', data: arscBin, store: true, align4: true },
  ];

  const { manifestMf, certSf } = buildManifestAndCertSf(baseFiles);
  const certRsa = buildPkcs7CertRsa(certSf, cert);

  const allFiles: ZipInputFile[] = [
    ...baseFiles,
    { name: 'META-INF/MANIFEST.MF', data: manifestMf },
    { name: 'META-INF/CERT.SF', data: certSf },
    { name: 'META-INF/CERT.RSA', data: certRsa },
  ];

  const apkBuffer = assembleSignedApk(allFiles, cert);
  generatedApkCache.set(cacheKey, apkBuffer);
  return apkBuffer;
}
