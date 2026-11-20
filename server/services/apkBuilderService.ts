import fs from 'fs';
import path from 'path';
import { ENV, ROOT_DIR } from '../config/env.ts';
import { LruTtlCache } from '../utils/lruCache.ts';
import {
  type ApkFlavor,
  buildBinaryAndroidManifest,
  buildResourcesArsc,
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

function loadAppIconPng(): Buffer {
  const candidates = [
    path.join(ROOT_DIR, 'public', 'pwa-512x512.png'),
    path.join(ROOT_DIR, 'public', 'pwa-192x192.png'),
    path.join(ROOT_DIR, 'public', 'apple-touch-icon.png'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return fs.readFileSync(p);
    }
  }
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  );
}

export function buildSignedApkBuffer(flavor: ApkFlavor, origin: string): Buffer {
  const cleanOrigin = origin.replace(/\/+$/, '');
  const isTv = flavor === 'tv';
  const apkVersionCode = isTv ? ENV.appVersionCodeTv : ENV.appVersionCodeMobile;
  const launchUrl =
    flavor === 'tv'
      ? `${cleanOrigin}/tv?platform=googletv&apkv=${apkVersionCode}`
      : `${cleanOrigin}/?platform=android&web=1&apkv=${apkVersionCode}`;
  const cacheKey = `${flavor}|${launchUrl}`;

  const cached = generatedApkCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const cert = ensureSigningCert();
  const manifestBin = buildBinaryAndroidManifest(flavor);
  const dexBin = buildWebViewMainActivityDex(launchUrl);
  const arscBin = buildResourcesArsc(flavor);
  const iconPng = loadAppIconPng();

  const baseFiles: ZipInputFile[] = [
    { name: 'AndroidManifest.xml', data: manifestBin },
    { name: 'classes.dex', data: dexBin },
    { name: 'res/mipmap-xxxhdpi-v4/ic_launcher.png', data: iconPng, store: true, align4: true },
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
