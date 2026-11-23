import fs from 'fs';
import path from 'path';
import type express from 'express';
import { ENV } from '../config/env.ts';
import { resolveSafePublicOrigin } from '../utils/ssrfGuard.ts';
import {
  PUBLISHED_RIFFAN_ORIGIN,
  generateWebOsAppInfoJson,
  isEphemeralPreviewHost,
  normalizeWebOsAppId,
  normalizeWebOsVersion,
  type WebOsTargetTier,
} from '../../src/utils/webosConfigGenerator.ts';
import { packWebOsIpkBinary, type IpkInputFile } from '../../src/utils/debianIpkPacker.ts';
import {
  buildUniversalWebOsLauncherAssets,
  rewriteHtmlForWebOsFileProtocol,
} from '../../src/utils/webosIpkBuilder.ts';

const MAX_MANIFEST_FILES = 240;
const SKIP_EXTS = new Set(['.apk', '.wgt', '.ipk', '.map', '.ipa', '.aab']);
const SKIP_FILES = new Set(['sw.js', 'config.xml', 'appinfo.json', 'registerSW.js']);

function walkSafeDistFiles(baseDir: string, currentDir: string, out: string[]): void {
  if (out.length >= MAX_MANIFEST_FILES) return;
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(currentDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (out.length >= MAX_MANIFEST_FILES) break;
    const fullPath = path.join(currentDir, entry.name);
    const rel = path.relative(baseDir, fullPath).replace(/\\/g, '/');
    if (entry.isDirectory()) {
      if (rel === 'assets/aistudio' || rel.startsWith('.')) continue;
      walkSafeDistFiles(baseDir, fullPath, out);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (SKIP_EXTS.has(ext) || SKIP_FILES.has(entry.name) || entry.name.startsWith('workbox-')) {
        continue;
      }
      out.push(rel);
    }
  }
}

function parseTargetTier(raw: unknown): WebOsTargetTier {
  const s = String(raw || '').trim().toLowerCase();
  if (s === 'legacy' || s === 'old') return 'legacy';
  if (s === 'modern' || s === 'new') return 'modern';
  return 'universal';
}

export function registerWebOsRoutes(app: express.Express, rootDir: string): void {
  app.get('/api/tv/webos-manifest', (_req, res) => {
    const distDir = path.resolve(rootDir, 'dist');
    const distIndex = path.join(distDir, 'index.html');
    const files: string[] = [];

    if (fs.existsSync(distIndex)) {
      walkSafeDistFiles(distDir, distDir, files);
      res.setHeader('Cache-Control', 'no-cache');
      return res.json({
        ok: true,
        mode: 'dist',
        files,
        appName: 'RiffanTV',
        defaultAppId: 'com.riffantv.webos',
      });
    }

    const publicDir = path.resolve(rootDir, 'public');
    const candidatePublic = [
      'pwa-192x192.png',
      'pwa-512x512.png',
      'icon.svg',
      'tv-receiver.html',
      'tv/tv-base.css',
      'tv/tv-modals.css',
      'tv/tv-player.css',
      'tv/tv-games.css',
      'tv/tv-i18n.js',
      'tv/tv-state.js',
      'tv/tv-player-core.js',
      'tv/tv-player-modes.js',
      'tv/tv-hub.js',
      'tv/tv-games.js',
      'tv/tv-games-soccer.js',
      'tv/tv-games-racing.js',
      'tv/tv-games-gyro.js',
      'tv/tv-nav-voice.js',
      'vendor/hls.min.js',
      'vendor/riffan-racing-3d.iife.js',
    ];
    for (const rel of candidatePublic) {
      if (fs.existsSync(path.join(publicDir, rel))) {
        files.push(rel);
      }
    }

    res.setHeader('Cache-Control', 'no-cache');
    return res.json({
      ok: true,
      mode: 'public-fallback',
      files,
      appName: 'RiffanTV',
      defaultAppId: 'com.riffantv.webos',
    });
  });

  app.get('/api/tv/webos-appinfo.json', (req, res) => {
    const appId = typeof req.query.appId === 'string' ? req.query.appId : undefined;
    const appName = typeof req.query.appName === 'string' ? req.query.appName : undefined;
    const version = typeof req.query.version === 'string' ? req.query.version : undefined;
    const targetTier = parseTargetTier(req.query.tier);
    const json = generateWebOsAppInfoJson({ appId, appName, version, targetTier });
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="appinfo.json"');
    res.setHeader('Cache-Control', 'no-cache');
    return res.send(json);
  });

  app.get(['/api/tv/download-ipk', '/tvlg.ipk'], async (req, res) => {
    try {
      const appId = normalizeWebOsAppId(
        typeof req.query.appId === 'string' ? req.query.appId : undefined
      );
      const appName =
        typeof req.query.appName === 'string' && req.query.appName.trim()
          ? req.query.appName.trim().slice(0, 48)
          : 'RiffanTV';
      const version = normalizeWebOsVersion(
        typeof req.query.version === 'string' ? req.query.version : undefined
      );
      const targetTier = parseTargetTier(req.query.tier);
      const format = String(req.query.format || 'ipk').toLowerCase() === 'zip' ? 'zip' : 'ipk';

      const rawReqHost = String(req.headers['x-forwarded-host'] || req.get('host') || '')
        .split(',')[0]
        .trim()
        .split(':')[0]
        .toLowerCase();
      const isDevHost = isEphemeralPreviewHost(rawReqHost);
      const explicitOrigin = String(req.query.origin || '').trim();
      const publishedFallback = ENV.publicDomain
        ? `https://${ENV.publicDomain}`
        : PUBLISHED_RIFFAN_ORIGIN;
      let safeExplicitOrigin = '';
      if (explicitOrigin) {
        const probe = resolveSafePublicOrigin(
          { queryOrigin: explicitOrigin },
          ENV.publicDomain || 'riffan.ai.studio'
        );
        if (probe === explicitOrigin.replace(/\/+$/, '')) {
          safeExplicitOrigin = probe;
        }
      }
      const targetOrigin = resolveSafePublicOrigin(
        {
          queryOrigin: safeExplicitOrigin || (isDevHost ? publishedFallback : ''),
          forwardedProto: String(req.headers['x-forwarded-proto'] || ''),
          forwardedHost: String(req.headers['x-forwarded-host'] || ''),
          hostHeader: String(req.get('host') || ''),
          protocol: req.protocol,
        },
        ENV.publicDomain || 'riffan.ai.studio'
      );

      const files: IpkInputFile[] = [];
      const appInfoJson = generateWebOsAppInfoJson({ appId, appName, version, targetTier });
      files.push({ relPath: 'appinfo.json', bytes: Buffer.from(appInfoJson, 'utf8') });

      const publicDir = path.resolve(rootDir, 'public');
      const iconPath192 = path.join(publicDir, 'pwa-192x192.png');
      const iconPath512 = path.join(publicDir, 'pwa-512x512.png');
      if (fs.existsSync(iconPath192)) {
        files.push({ relPath: 'icon.png', bytes: fs.readFileSync(iconPath192) });
      }
      if (fs.existsSync(iconPath512)) {
        files.push({ relPath: 'largeIcon.png', bytes: fs.readFileSync(iconPath512) });
      } else if (fs.existsSync(iconPath192)) {
        files.push({ relPath: 'largeIcon.png', bytes: fs.readFileSync(iconPath192) });
      }

      const distDir = path.resolve(rootDir, 'dist');
      const distIndex = path.join(distDir, 'index.html');

      if (fs.existsSync(distIndex) && req.query.mode === 'bundle') {
        const distFiles: string[] = [];
        walkSafeDistFiles(distDir, distDir, distFiles);
        for (const rel of distFiles) {
          const fullPath = path.join(distDir, rel);
          if (rel === 'index.html') {
            const rawHtml = fs.readFileSync(fullPath, 'utf8');
            files.push({
              relPath: 'index.html',
              bytes: Buffer.from(
                rewriteHtmlForWebOsFileProtocol(rawHtml, targetOrigin, targetTier),
                'utf8'
              ),
            });
          } else if (fs.existsSync(fullPath)) {
            files.push({ relPath: rel, bytes: fs.readFileSync(fullPath) });
          }
        }
      } else {
        const launcher = buildUniversalWebOsLauncherAssets(appName, targetOrigin, targetTier);
        files.push({ relPath: 'index.html', bytes: Buffer.from(launcher.indexHtml, 'utf8') });
        files.push({ relPath: 'app.css', bytes: Buffer.from(launcher.appCss, 'utf8') });
        files.push({ relPath: 'main.js', bytes: Buffer.from(launcher.mainJs, 'utf8') });
        files.push({ relPath: 'webOSTV.js', bytes: Buffer.from(launcher.webOsStubJs, 'utf8') });
      }

      if (format === 'zip') {
        const JSZipMod = await import('jszip');
        const JSZip = JSZipMod.default || JSZipMod;
        const zip = new JSZip();
        for (const f of files) {
          zip.file(f.relPath, f.bytes);
        }
        const buf = await zip.generateAsync({
          type: 'nodebuffer',
          compression: 'DEFLATE',
          compressionOptions: { level: 6 },
        });
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${appId}_${version}_${targetTier}.zip"`
        );
        res.setHeader('Cache-Control', 'no-cache');
        return res.send(buf);
      }

      const ipkBytes = await packWebOsIpkBinary({
        appId,
        appName,
        version,
        files,
      });

      res.setHeader('Content-Type', 'application/vnd.debian.binary-package');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${appId}_${version}_${targetTier}.ipk"`
      );
      res.setHeader('Cache-Control', 'no-cache');
      return res.send(Buffer.from(ipkBytes));
    } catch (err) {
      return res.status(500).json({ ok: false, error: String(err) });
    }
  });

  app.get('/api/tv/webos-workflow.yml', (_req, res) => {
    const workflowPath = path.resolve(rootDir, '.github', 'workflows', 'build-webos-ipk.yml');
    if (!fs.existsSync(workflowPath)) {
      return res.status(404).json({ ok: false, error: 'Workflow file not found' });
    }
    res.setHeader('Content-Type', 'text/yaml; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    return res.sendFile(workflowPath);
  });
}
