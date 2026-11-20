import zlib from 'zlib';
import { LruTtlCache } from '../../utils/lruCache.ts';

const iptvPngLogoCache = new LruTtlCache<string, Buffer>(120, 24 * 60 * 60 * 1000);
const PNG_CRC32_TABLE = (() => {
  const tbl = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    tbl[n] = c >>> 0;
  }
  return tbl;
})();

function pngCrc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = PNG_CRC32_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makePngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  const combined = Buffer.concat([typeBuf, data]);
  crcBuf.writeUInt32BE(pngCrc32(combined), 0);
  return Buffer.concat([len, combined, crcBuf]);
}

const MINI_FONT_3X5: Record<string, string[]> = {
  A: ['010', '101', '111', '101', '101'],
  B: ['110', '101', '110', '101', '110'],
  C: ['011', '100', '100', '100', '011'],
  D: ['110', '101', '101', '101', '110'],
  E: ['111', '100', '110', '100', '111'],
  F: ['111', '100', '110', '100', '100'],
  G: ['011', '100', '101', '101', '011'],
  H: ['101', '101', '111', '101', '101'],
  I: ['111', '010', '010', '010', '111'],
  J: ['001', '001', '001', '101', '010'],
  K: ['101', '101', '110', '101', '101'],
  L: ['100', '100', '100', '100', '111'],
  M: ['101', '111', '111', '101', '101'],
  N: ['101', '111', '111', '111', '101'],
  O: ['010', '101', '101', '101', '010'],
  P: ['110', '101', '110', '100', '100'],
  Q: ['010', '101', '101', '111', '011'],
  R: ['110', '101', '110', '101', '101'],
  S: ['011', '100', '010', '001', '110'],
  T: ['111', '010', '010', '010', '010'],
  U: ['101', '101', '101', '101', '111'],
  V: ['101', '101', '101', '101', '010'],
  W: ['101', '101', '111', '111', '101'],
  X: ['101', '101', '010', '101', '101'],
  Y: ['101', '101', '010', '010', '010'],
  Z: ['111', '001', '010', '100', '111'],
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['110', '001', '010', '100', '111'],
  '3': ['110', '001', '010', '001', '110'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '110', '001', '110'],
  '6': ['011', '100', '111', '101', '111'],
  '7': ['111', '001', '010', '010', '010'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '110'],
  '+': ['000', '010', '111', '010', '000'],
  '-': ['000', '000', '111', '000', '000'],
};

export function renderIptvChannelPng(shortMark: string, hexColor: string): Buffer {
  const cleanMark =
    (shortMark || 'TV')
      .toUpperCase()
      .replace(/[^A-Z0-9+-]/g, '')
      .slice(0, 4) || 'TV';
  const cacheKey = `${cleanMark}|${hexColor}`;
  const existing = iptvPngLogoCache.get(cacheKey);
  if (existing) return existing;

  const cleanHex = /^#[0-9a-fA-F]{6}$/.test(hexColor) ? hexColor.slice(1) : 'E11D48';
  const r = parseInt(cleanHex.slice(0, 2), 16);
  const g = parseInt(cleanHex.slice(2, 4), 16);
  const b = parseInt(cleanHex.slice(4, 6), 16);

  const w = 96;
  const h = 96;
  const raw = Buffer.alloc(h * (1 + w * 4));

  for (let y = 0; y < h; y++) {
    const rowOff = y * (1 + w * 4);
    raw[rowOff] = 0;
    for (let x = 0; x < w; x++) {
      const pxOff = rowOff + 1 + x * 4;
      const inInner = x >= 6 && x < w - 6 && y >= 6 && y < h - 6;
      if (!inInner) {
        raw[pxOff] = 10;
        raw[pxOff + 1] = 12;
        raw[pxOff + 2] = 18;
        raw[pxOff + 3] = 255;
      } else {
        const shade = Math.max(0.55, 1 - (y / h) * 0.38);
        raw[pxOff] = Math.round(r * shade);
        raw[pxOff + 1] = Math.round(g * shade);
        raw[pxOff + 2] = Math.round(b * shade);
        raw[pxOff + 3] = 255;
      }
    }
  }

  const scale = cleanMark.length <= 2 ? 5 : cleanMark.length === 3 ? 4 : 3;
  const glyphW = 3 * scale;
  const gap = scale;
  const totalW = cleanMark.length * glyphW + (cleanMark.length - 1) * gap;
  const totalH = 5 * scale;
  const startX = Math.floor((w - totalW) / 2);
  const startY = Math.floor((h - totalH) / 2);

  for (let ci = 0; ci < cleanMark.length; ci++) {
    const glyph = MINI_FONT_3X5[cleanMark[ci]] || MINI_FONT_3X5['T'];
    const gx0 = startX + ci * (glyphW + gap);
    for (let gy = 0; gy < 5; gy++) {
      for (let gx = 0; gx < 3; gx++) {
        if (glyph[gy][gx] !== '1') continue;
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            const px = gx0 + gx * scale + sx;
            const py = startY + gy * scale + sy;
            if (px >= 0 && px < w && py >= 0 && py < h) {
              const pxOff = py * (1 + w * 4) + 1 + px * 4;
              raw[pxOff] = 255;
              raw[pxOff + 1] = 255;
              raw[pxOff + 2] = 255;
              raw[pxOff + 3] = 255;
            }
          }
        }
      }
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const compressed = zlib.deflateSync(raw);
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const png = Buffer.concat([
    sig,
    makePngChunk('IHDR', ihdr),
    makePngChunk('IDAT', compressed),
    makePngChunk('IEND', Buffer.alloc(0)),
  ]);
  iptvPngLogoCache.set(cacheKey, png);
  return png;
}
