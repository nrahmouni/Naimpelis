import crypto from 'crypto';
import type express from 'express';
import fs from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

function resolveFfmpegBin(): string {
  if (fs.existsSync('/usr/bin/ffmpeg')) {
    return '/usr/bin/ffmpeg';
  }
  try {
    const mod = require('@ffmpeg-installer/ffmpeg') as { path?: string };
    if (mod?.path && fs.existsSync(mod.path)) {
      return mod.path;
    }
  } catch {
    // fallback to PATH
  }
  return 'ffmpeg';
}

export const FFMPEG_BIN: string = resolveFfmpegBin();

function resolveFfprobeBin(): string {
  if (fs.existsSync('/usr/bin/ffprobe')) {
    return '/usr/bin/ffprobe';
  }
  const siblingProbe = FFMPEG_BIN.replace(/ffmpeg(\.exe)?$/i, 'ffprobe$1');
  if (siblingProbe !== FFMPEG_BIN && fs.existsSync(siblingProbe)) {
    return siblingProbe;
  }
  return 'ffprobe';
}

export const FFPROBE_BIN: string = resolveFfprobeBin();

export function getOrCreateRequestId(req: express.Request): string {
  const existing = String(req.headers['x-naim-request-id'] || '').trim();
  if (existing && existing.length <= 64) return existing;
  return crypto.randomUUID();
}

export function applyProxyCorsHeaders(res: express.Response, reqId: string): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader(
    'Access-Control-Expose-Headers',
    'Content-Length, Content-Range, Content-Type, Accept-Ranges, X-Naim-Request-Id'
  );
  res.setHeader('X-Naim-Request-Id', reqId);
}

export function findDisguisedTsOffset(buf: Buffer): number {
  if (!buf || buf.length < 380) return 0;
  // Already starts with MPEG-TS sync byte pattern
  if (buf[0] === 0x47 && buf[188] === 0x47) return 0;
  const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  const isGif = buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38;
  const isJpg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const isBmp = buf[0] === 0x42 && buf[1] === 0x4d;
  if (!isPng && !isGif && !isJpg && !isBmp) return 0;

  const limit = Math.min(buf.length - 376, 4096);
  for (let i = 4; i < limit; i++) {
    if (buf[i] === 0x47 && buf[i + 188] === 0x47 && buf[i + 376] === 0x47) {
      return i;
    }
  }
  return 0;
}
