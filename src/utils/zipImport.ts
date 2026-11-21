// Zero-dependency browser ZIP reader for Exportify (.zip) and Google Takeout (.zip) bundles.
// Supports compression methods 0 (STORE) and 8 (DEFLATE via native DecompressionStream).

export interface ExtractedZipTextFile {
  name: string;
  baseName: string;
  ext: string;
  text: string;
}

const SUPPORTED_EXT_RE = /\.(csv|json|m3u|m3u8|txt)$/i;

async function inflateRawBytes(compressed: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Tu navegador no soporta descompresión DEFLATE nativa para ZIP.');
  }
  const copy = new Uint8Array(compressed.byteLength);
  copy.set(compressed);
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([copy.buffer]).stream().pipeThrough(ds);
  const ab = await new Response(stream).arrayBuffer();
  return new Uint8Array(ab);
}

function findEocdOffset(bytes: Uint8Array): number {
  const minOffset = Math.max(0, bytes.length - 65557);
  for (let i = bytes.length - 22; i >= minOffset; i--) {
    if (
      bytes[i] === 0x50 &&
      bytes[i + 1] === 0x4b &&
      bytes[i + 2] === 0x05 &&
      bytes[i + 3] === 0x06
    ) {
      return i;
    }
  }
  return -1;
}

export async function extractTextFilesFromZip(file: File): Promise<ExtractedZipTextFile[]> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const decoder = new TextDecoder('utf-8', { fatal: false });

  const eocdOffset = findEocdOffset(bytes);
  if (eocdOffset < 0) {
    throw new Error('El archivo ZIP no es válido o está corrupto.');
  }

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const cdOffset = view.getUint32(eocdOffset + 16, true);
  if (cdOffset >= bytes.length) {
    throw new Error('Índice central de ZIP inválido.');
  }

  const results: ExtractedZipTextFile[] = [];
  let ptr = cdOffset;

  for (let i = 0; i < totalEntries && ptr + 46 <= bytes.length; i++) {
    const sig = view.getUint32(ptr, true);
    if (sig !== 0x02014b50) break;

    const method = view.getUint16(ptr + 10, true);
    const compSize = view.getUint32(ptr + 20, true);
    const uncompSize = view.getUint32(ptr + 24, true);
    const nameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const localHeaderOffset = view.getUint32(ptr + 42, true);

    const entryName = decoder.decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen));
    ptr += 46 + nameLen + extraLen + commentLen;

    if (!entryName || entryName.endsWith('/') || entryName.startsWith('__MACOSX/')) {
      continue;
    }
    const cleanBase = entryName.split('/').pop() || entryName;
    if (cleanBase.startsWith('.') || !SUPPORTED_EXT_RE.test(cleanBase)) {
      continue;
    }
    if (uncompSize > 12 * 1024 * 1024 || compSize === 0xffffffff) {
      continue;
    }
    if (localHeaderOffset + 30 > bytes.length) continue;
    if (view.getUint32(localHeaderOffset, true) !== 0x04034b50) continue;

    const lhNameLen = view.getUint16(localHeaderOffset + 26, true);
    const lhExtraLen = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + lhNameLen + lhExtraLen;
    const dataEnd = dataStart + compSize;
    if (dataEnd > bytes.length) continue;

    const compressedSlice = bytes.subarray(dataStart, dataEnd);
    let plainBytes: Uint8Array;
    if (method === 0) {
      plainBytes = compressedSlice;
    } else if (method === 8) {
      plainBytes = await inflateRawBytes(compressedSlice);
    } else {
      continue;
    }

    const text = decoder.decode(plainBytes).replace(/^\uFEFF/, '');
    if (text.trim().length > 0) {
      const extMatch = cleanBase.match(/\.([a-z0-9]+)$/i);
      results.push({
        name: entryName,
        baseName: cleanBase,
        ext: extMatch ? extMatch[1].toLowerCase() : '',
        text,
      });
    }
  }

  return results;
}
