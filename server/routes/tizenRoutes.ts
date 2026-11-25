import fs from 'fs';
import path from 'path';
import type express from 'express';
import { ENV } from '../config/env.ts';
import { resolveSafePublicOrigin } from '../utils/ssrfGuard.ts';
import { generateTizenConfigXml } from '../../src/utils/tizenConfigGenerator.ts';

const MAX_MANIFEST_FILES = 400;
const SKIP_EXTS = new Set(['.apk', '.wgt', '.map', '.ipa', '.aab']);
const SKIP_FILES = new Set(['sw.js', 'config.xml', 'registerSW.js']);

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

export function registerTizenRoutes(app: express.Express, rootDir: string): void {
  app.get('/api/tv/tizen-wgt-manifest', (_req, res) => {
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
        defaultPackageId: 'RiffanTv01',
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
      'tv/tv-football.js',
      'tv/tv-game-sprites.js',
      'tv/tv-games.js',
      'tv/tv-games-soccer.js',
      'tv/tv-games-racing.js',
      'tv/tv-games-gyro.js',
      'tv/tv-games-gyroplus.js',
      'tv/tv-games-pingpong.js',
      'tv/tv-games-penalty.js',
      'tv/tv-games-puzzle.js',
      'tv/tv-games-action.js',
      'tv/tv-games-retro.js',
      'tv/tv-games-quiz.js',
      'tv/tv-nav-voice.js',
      'vendor/hls.min.js',
      'vendor/riffan-racing-3d.iife.js',
      'draco/gltf/draco_decoder.js',
      'draco/gltf/draco_decoder.wasm',
      'draco/gltf/draco_wasm_wrapper.js',
    ];
    for (const rel of candidatePublic) {
      if (fs.existsSync(path.join(publicDir, rel))) {
        files.push(rel);
      }
    }
    walkSafeDistFiles(publicDir, path.join(publicDir, 'assets', 'games'), files);

    res.setHeader('Cache-Control', 'no-cache');
    return res.json({
      ok: true,
      mode: 'public-fallback',
      files,
      appName: 'RiffanTV',
      defaultPackageId: 'RiffanTv01',
    });
  });

  app.get('/api/tv/tizen-config.xml', (req, res) => {
    const packageId = typeof req.query.packageId === 'string' ? req.query.packageId : undefined;
    const appName = typeof req.query.appName === 'string' ? req.query.appName : undefined;
    const version = typeof req.query.version === 'string' ? req.query.version : undefined;
    const xml = generateTizenConfigXml({ packageId, appName, version });
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="config.xml"');
    res.setHeader('Cache-Control', 'no-cache');
    return res.send(xml);
  });

  app.get('/api/tv/download-wgt', async (req, res) => {
    try {
      const JSZipMod = await import('jszip');
      const JSZip = JSZipMod.default || JSZipMod;
      const zip = new JSZip();

      const packageId = typeof req.query.packageId === 'string' && req.query.packageId.trim()
        ? req.query.packageId.replace(/[^A-Za-z0-9]/g, '').slice(0, 10).padEnd(10, '0')
        : 'RiffanTv01';
      const appName = typeof req.query.appName === 'string' && req.query.appName.trim()
        ? req.query.appName.trim().slice(0, 48)
        : 'RiffanTV';
      const rawReqHost = String(req.headers['x-forwarded-host'] || req.get('host') || '')
        .split(',')[0]
        .trim()
        .split(':')[0]
        .toLowerCase();
      const isDevHost =
        !rawReqHost ||
        rawReqHost === 'localhost' ||
        rawReqHost === '127.0.0.1' ||
        rawReqHost.startsWith('ais-dev-');
      const explicitOrigin = String(req.query.origin || '').trim();
      const publishedFallback = `https://${ENV.publicDomain || 'riffan.ai.studio'}`;
      let safeExplicitOrigin = '';
      if (explicitOrigin) {
        const probe = resolveSafePublicOrigin({ queryOrigin: explicitOrigin }, ENV.publicDomain || 'riffan.ai.studio');
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

      // 1. config.xml
      const xml = generateTizenConfigXml({
        packageId,
        appName,
        version: '1.0.0',
        contentSrc: 'index.html',
        iconSrc: 'icon.png',
        requiredVersion: '4.0',
        disableScreenSaver: true,
      });
      zip.file('config.xml', xml);

      // 2. icon.png
      const publicDir = path.resolve(rootDir, 'public');
      const iconPath512 = path.join(publicDir, 'pwa-512x512.png');
      const iconPath192 = path.join(publicDir, 'pwa-192x192.png');
      if (fs.existsSync(iconPath512)) {
        zip.file('icon.png', fs.readFileSync(iconPath512));
      } else if (fs.existsSync(iconPath192)) {
        zip.file('icon.png', fs.readFileSync(iconPath192));
      }

      // 3. index.html & assets
      const distDir = path.resolve(rootDir, 'dist');
      const distIndex = path.join(distDir, 'index.html');

      if (fs.existsSync(distIndex) && req.query.mode === 'bundle') {
        const files: string[] = [];
        walkSafeDistFiles(distDir, distDir, files);
        for (const rel of files) {
          const fullPath = path.join(distDir, rel);
          if (rel === 'index.html') {
            let html = fs.readFileSync(fullPath, 'utf8');
            html = html
              .replace(/(href|src)="\/assets\//g, '$1="./assets/')
              .replace(/(href|src)="\/tv\//g, '$1="./tv/')
              .replace(/(href|src)="\/vendor\//g, '$1="./vendor/')
              .replace(/(href|src)="\/(favicon[^"]*|apple-touch-icon\.png|icon\.svg|pwa-[^"]*|music-[^"]*|logo-[^"]*|manifest\.webmanifest)"/g, '$1="./$2"')
              .replace(/<script[^>]*src=["\x27]\.?\/registerSW\.js["\x27][^>]*><\/script>/gi, '');

            const { buildTizenRuntimeShimScript } = await import('../../src/utils/tizenWgtBuilder.ts');
            html = html.replace('<head>', '<head>\n' + buildTizenRuntimeShimScript(targetOrigin));
            zip.file('index.html', html);
          } else if (fs.existsSync(fullPath)) {
            zip.file(rel, fs.readFileSync(fullPath));
          }
        }
      } else {
        const { buildHostedTizenLauncherAssets } = await import('../../src/utils/tizenWgtBuilder.ts');
        const launcherAssets = buildHostedTizenLauncherAssets(appName, targetOrigin);
        zip.file('index.html', launcherAssets.indexHtml);
        zip.file('app.css', launcherAssets.appCss);
        zip.file('main.js', launcherAssets.mainJs);
      }

      const buf = await zip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      });

      res.setHeader('Content-Type', 'application/x-widget');
      res.setHeader('Content-Disposition', `attachment; filename="${appName}-${packageId}.wgt"`);
      res.setHeader('Cache-Control', 'no-cache');
      return res.send(buf);
    } catch (err) {
      return res.status(500).json({ ok: false, error: String(err) });
    }
  });

  app.get('/api/tv/tizen-workflow.yml', (_req, res) => {
    const workflowPath = path.resolve(rootDir, '.github', 'workflows', 'build-tizen-wgt.yml');
    if (!fs.existsSync(workflowPath)) {
      return res.status(404).json({ ok: false, error: 'Workflow file not found' });
    }
    res.setHeader('Content-Type', 'text/yaml; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    return res.sendFile(workflowPath);
  });
}
