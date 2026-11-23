import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { ENV } from '../config/env.ts';

let cachedSignature = '';
let cachedAt = 0;
const CACHE_TTL_MS = 2_000;

/**
 * Computes a short, deterministic fingerprint from the TV receiver HTML/assets
 * and app release version so Samsung Tizen & Smart TV browsers automatically
 * bust caches and live-update whenever any TV asset or server release changes.
 */
export function getTvBuildSignature(rootDir: string): string {
  const now = Date.now();
  if (cachedSignature && now - cachedAt < CACHE_TTL_MS) {
    return cachedSignature;
  }

  const hash = crypto.createHash('sha1');
  hash.update(String(ENV.appVersionName || '3.3.0'));

  const candidatePaths: string[] = [];
  const publicDir = path.resolve(rootDir, 'public');
  const distDir = path.resolve(rootDir, 'dist');
  const baseDir = fs.existsSync(path.join(publicDir, 'tv-receiver.html')) ? publicDir : distDir;

  const htmlFile = path.join(baseDir, 'tv-receiver.html');
  if (fs.existsSync(htmlFile)) {
    candidatePaths.push(htmlFile);
  }

  const tvDir = path.join(baseDir, 'tv');
  if (fs.existsSync(tvDir)) {
    try {
      const files = fs.readdirSync(tvDir).sort();
      for (const f of files) {
        candidatePaths.push(path.join(tvDir, f));
      }
    } catch {
      // ignore directory read error
    }
  }

  const vendorRacingBundle = path.join(baseDir, 'vendor', 'riffan-racing-3d.iife.js');
  if (fs.existsSync(vendorRacingBundle)) {
    candidatePaths.push(vendorRacingBundle);
  }

  for (const srvFile of [
    path.resolve(rootDir, 'server', 'routes', 'proxies', 'dvbCodecProbe.ts'),
    path.resolve(rootDir, 'server', 'routes', 'proxies', 'dvbTranscoder.ts'),
    path.resolve(rootDir, 'server', 'services', 'belix', 'belixProxyHelpers.ts'),
    path.resolve(rootDir, 'server', 'data', 'tdtNationalAndPayChannels.ts'),
    path.resolve(rootDir, 'server', 'routes', 'streamExtractHelpers', 'directCasesHandler.ts'),
    path.resolve(rootDir, 'server', 'services', 'spainVpnGatewayService.ts'),
    path.resolve(rootDir, 'server', 'services', 'urbanVpnService.ts'),
    path.resolve(rootDir, 'src', 'App.tsx'),
    path.resolve(rootDir, 'src', 'main.tsx'),
    path.resolve(rootDir, 'dist', 'index.html'),
  ]) {
    if (fs.existsSync(srvFile)) {
      candidatePaths.push(srvFile);
    }
  }

  for (const fp of candidatePaths) {
    try {
      const st = fs.statSync(fp);
      hash.update(`|${path.basename(fp)}:${st.size}:${Math.round(st.mtimeMs)}`);
    } catch {
      // ignore stat failure
    }
  }

  cachedSignature = hash.digest('hex').slice(0, 12);
  cachedAt = now;
  return cachedSignature;
}
