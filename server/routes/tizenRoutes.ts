import fs from 'fs';
import path from 'path';
import type express from 'express';
import { generateTizenConfigXml } from '../../src/utils/tizenConfigGenerator.ts';

const MAX_MANIFEST_FILES = 240;
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
      'tv/tv-state-i18n.js',
      'tv/tv-hub-pairing.js',
      'tv/tv-player-engine.js',
      'tv/tv-nav-voice.js',
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
