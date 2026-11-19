import type express from 'express';
import fs from 'fs';
import path from 'path';
import { logger } from '../../utils/logger.ts';
import { buildSignedApkBuffer, type ApkFlavor } from '../../services/apkBuilderService.ts';

export function sendApkPackageResponse(
  req: express.Request,
  res: express.Response,
  opts: {
    rootDir: string;
    variant: ApkFlavor;
    filename: string;
    candidateFilenames: string[];
    errorMessage: string;
    logKey: string;
    getPublicOrigin: (r: express.Request) => string;
  }
) {
  const candidates: string[] = [];
  for (const name of opts.candidateFilenames) {
    candidates.push(path.resolve(opts.rootDir, 'public', name));
    candidates.push(path.resolve(opts.rootDir, 'dist', name));
  }
  const target = candidates.find((p) => fs.existsSync(p));
  res.setHeader('Content-Type', 'application/vnd.android.package-archive');
  res.setHeader('Content-Disposition', `attachment; filename="${opts.filename}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  if (target) {
    return res.sendFile(target);
  }
  try {
    const apkBuf = buildSignedApkBuffer(opts.variant, opts.getPublicOrigin(req));
    res.setHeader('Content-Length', String(apkBuf.length));
    return res.send(apkBuf);
  } catch (err) {
    logger.error({ err }, opts.logKey);
    return res.status(500).json({ error: opts.errorMessage });
  }
}
