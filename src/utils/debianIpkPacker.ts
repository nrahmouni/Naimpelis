/**
 * @module debianIpkPacker
 * @description Pure TypeScript Debian `ar` + USTAR `.tar` + RFC-1952 `.gz` packager for LG webOS `.ipk` files.
 * Works deterministically in Browser (Chrome/Safari/Firefox), Node.js, and JSDOM without native binaries.
 */

export interface IpkInputFile {
  relPath: string;
  bytes: Uint8Array;
}

const AR_GLOBAL_HEADER = '!<arch>\n';

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32Bytes(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC32_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function encodeUtf8(text: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(text);
  }
  return Uint8Array.from(Buffer.from(text, 'utf8'));
}

function concatUint8Arrays(chunks: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

function writeAsciiFixed(target: Uint8Array, offset: number, value: string, width: number): void {
  const bytes = encodeUtf8(value);
  for (let i = 0; i < width && i < bytes.length; i++) {
    target[offset + i] = bytes[i];
  }
}

function writeOctalField(target: Uint8Array, offset: number, val: number, width: number): void {
  const oct = Math.max(0, Math.floor(val)).toString(8);
  const padded = oct.padStart(width - 1, '0').slice(-(width - 1));
  writeAsciiFixed(target, offset, `${padded}\0`, width);
}

/**
 * Compresses bytes into standard RFC-1952 GZIP format.
 * Uses CompressionStream('gzip') when available in Browser/Node, or a valid uncompressed
 * RFC-1952 DEFLATE store stream fallback so it always succeeds in JSDOM/restricted runtimes.
 */
export async function gzipBytesDeterministic(raw: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream === 'function') {
    try {
      const cs = new CompressionStream('gzip');
      const writer = cs.writable.getWriter();
      const copy = new Uint8Array(raw.byteLength);
      copy.set(raw);
      void writer.write(copy);
      void writer.close();
      const compressed = await new Response(cs.readable).arrayBuffer();
      const out = new Uint8Array(compressed);
      if (out.length >= 10 && out[0] === 0x1f && out[1] === 0x8b) {
        return out;
      }
    } catch {
      // fallback cleanly below
    }
  }

  // Fallback: valid RFC-1952 GZIP wrapping uncompressed DEFLATE blocks (max 65535 bytes/block)
  const blocks: Uint8Array[] = [];
  blocks.push(new Uint8Array([0x1f, 0x8b, 0x08, 0x00, 0, 0, 0, 0, 0x00, 0x03]));

  if (raw.length === 0) {
    blocks.push(new Uint8Array([0x01, 0x00, 0x00, 0xff, 0xff]));
  } else {
    let pos = 0;
    while (pos < raw.length) {
      const chunkLen = Math.min(65535, raw.length - pos);
      const isFinal = pos + chunkLen >= raw.length ? 1 : 0;
      const nlen = (~chunkLen) & 0xffff;
      const hdr = new Uint8Array(5);
      hdr[0] = isFinal;
      hdr[1] = chunkLen & 0xff;
      hdr[2] = (chunkLen >>> 8) & 0xff;
      hdr[3] = nlen & 0xff;
      hdr[4] = (nlen >>> 8) & 0xff;
      blocks.push(hdr);
      blocks.push(raw.subarray(pos, pos + chunkLen));
      pos += chunkLen;
    }
  }

  const trailer = new Uint8Array(8);
  const crc = crc32Bytes(raw);
  const size = raw.length >>> 0;
  trailer[0] = crc & 0xff;
  trailer[1] = (crc >>> 8) & 0xff;
  trailer[2] = (crc >>> 16) & 0xff;
  trailer[3] = (crc >>> 24) & 0xff;
  trailer[4] = size & 0xff;
  trailer[5] = (size >>> 8) & 0xff;
  trailer[6] = (size >>> 16) & 0xff;
  trailer[7] = (size >>> 24) & 0xff;
  blocks.push(trailer);

  return concatUint8Arrays(blocks);
}

interface TarEntry {
  name: string;
  isDir: boolean;
  bytes?: Uint8Array;
  mode?: number;
}

function buildTarHeader(entry: TarEntry, mtimeSec: number): Uint8Array {
  const header = new Uint8Array(512);
  let namePart = entry.name;
  let prefixPart = '';

  if (encodeUtf8(entry.name).length > 99) {
    const slashIdx = entry.name.lastIndexOf('/');
    if (slashIdx > 0 && slashIdx <= 154) {
      prefixPart = entry.name.slice(0, slashIdx);
      namePart = entry.name.slice(slashIdx + 1);
    }
  }

  writeAsciiFixed(header, 0, namePart.slice(0, 99), 100);
  writeOctalField(header, 100, entry.mode ?? (entry.isDir ? 0o755 : 0o644), 8);
  writeOctalField(header, 108, 0, 8);
  writeOctalField(header, 116, 0, 8);
  writeOctalField(header, 124, entry.isDir ? 0 : entry.bytes?.length ?? 0, 12);
  writeOctalField(header, 136, mtimeSec, 12);
  for (let i = 148; i < 156; i++) header[i] = 0x20; // checksum spaces
  header[156] = entry.isDir ? 0x35 : 0x30; // '5' dir or '0' regular file
  writeAsciiFixed(header, 257, 'ustar\0', 6);
  writeAsciiFixed(header, 263, '00', 2);
  if (prefixPart) {
    writeAsciiFixed(header, 345, prefixPart.slice(0, 154), 155);
  }

  let sum = 0;
  for (let i = 0; i < 512; i++) sum += header[i];
  const sumStr = sum.toString(8).padStart(6, '0').slice(-6);
  writeAsciiFixed(header, 148, `${sumStr}\0 `, 8);
  return header;
}

function buildTarArchive(entries: TarEntry[], mtimeSec: number): Uint8Array {
  const blocks: Uint8Array[] = [];
  for (const entry of entries) {
    blocks.push(buildTarHeader(entry, mtimeSec));
    if (!entry.isDir && entry.bytes && entry.bytes.length > 0) {
      blocks.push(entry.bytes);
      const rem = entry.bytes.length % 512;
      if (rem !== 0) {
        blocks.push(new Uint8Array(512 - rem));
      }
    }
  }
  // Two 512-byte EOF zero blocks
  blocks.push(new Uint8Array(1024));
  return concatUint8Arrays(blocks);
}

function buildArMember(name: string, bytes: Uint8Array, mtimeSec: number): Uint8Array {
  const hdr = new Uint8Array(60);
  hdr.fill(0x20);
  writeAsciiFixed(hdr, 0, name.slice(0, 16).padEnd(16, ' '), 16);
  writeAsciiFixed(hdr, 16, String(mtimeSec).padEnd(12, ' '), 12);
  writeAsciiFixed(hdr, 28, '0     ', 6);
  writeAsciiFixed(hdr, 34, '0     ', 6);
  writeAsciiFixed(hdr, 40, '100644  ', 8);
  writeAsciiFixed(hdr, 48, String(bytes.length).padEnd(10, ' '), 10);
  hdr[58] = 0x60; // '`'
  hdr[59] = 0x0a; // '\n'

  const needsPad = bytes.length % 2 === 1;
  return needsPad
    ? concatUint8Arrays([hdr, bytes, new Uint8Array([0x0a])])
    : concatUint8Arrays([hdr, bytes]);
}

export interface PackWebOsIpkOptions {
  appId: string;
  appName: string;
  version: string;
  files: IpkInputFile[];
}

/**
 * Packages an LG webOS `.ipk` binary archive (`!<arch>\n` containing `debian-binary`,
 * `control.tar.gz`, and `data.tar.gz` extracting into `/usr/palm/applications/<appId>/`).
 */
export async function packWebOsIpkBinary(options: PackWebOsIpkOptions): Promise<Uint8Array> {
  const mtimeSec = Math.floor(Date.now() / 1000);
  const cleanTitle = String(options.appName || 'RiffanTV').replace(/[\r\n]/g, ' ').trim();
  const baseAppPath = `./usr/palm/applications/${options.appId}`;

  // 1. debian-binary
  const debianBinaryBytes = encodeUtf8('2.0\n');

  // 2. control.tar.gz
  const controlText = [
    `Package: ${options.appId}`,
    `Version: ${options.version}`,
    'Section: misc',
    'Priority: optional',
    'Architecture: all',
    'Maintainer: RiffanTV <dev@riffan.ai.studio>',
    `Description: ${cleanTitle} Smart TV app for LG webOS`,
    'webOS-Package-Format-Version: 2',
    'Source: riffantv',
    '',
  ].join('\n');

  const controlTar = buildTarArchive(
    [{ name: './control', isDir: false, bytes: encodeUtf8(controlText) }],
    mtimeSec
  );
  const controlTarGz = await gzipBytesDeterministic(controlTar);

  // 3. data.tar.gz
  const dirSet = new Set<string>([
    './usr/',
    './usr/palm/',
    './usr/palm/applications/',
    `${baseAppPath}/`,
  ]);
  const tarEntries: TarEntry[] = [];

  for (const f of options.files) {
    const cleanRel = f.relPath.replace(/^\/+/, '').replace(/\\/g, '/');
    const parts = cleanRel.split('/');
    let cur = baseAppPath;
    for (let i = 0; i < parts.length - 1; i++) {
      cur = `${cur}/${parts[i]}`;
      dirSet.add(`${cur}/`);
    }
  }

  for (const dirPath of Array.from(dirSet)) {
    tarEntries.push({ name: dirPath, isDir: true });
  }
  for (const f of options.files) {
    const cleanRel = f.relPath.replace(/^\/+/, '').replace(/\\/g, '/');
    tarEntries.push({
      name: `${baseAppPath}/${cleanRel}`,
      isDir: false,
      bytes: f.bytes,
    });
  }

  const dataTar = buildTarArchive(tarEntries, mtimeSec);
  const dataTarGz = await gzipBytesDeterministic(dataTar);

  return concatUint8Arrays([
    encodeUtf8(AR_GLOBAL_HEADER),
    buildArMember('debian-binary', debianBinaryBytes, mtimeSec),
    buildArMember('control.tar.gz', controlTarGz, mtimeSec),
    buildArMember('data.tar.gz', dataTarGz, mtimeSec),
  ]);
}
