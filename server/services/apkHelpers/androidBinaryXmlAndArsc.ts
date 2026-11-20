import { ENV } from '../../config/env.ts';

export type ApkFlavor = 'mobile' | 'tv';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

export function adler32(buf: Buffer): number {
  let s1 = 1;
  let s2 = 0;
  const MOD = 65521;
  for (let i = 0; i < buf.length; i++) {
    s1 = (s1 + buf[i]) % MOD;
    s2 = (s2 + s1) % MOD;
  }
  return ((s2 << 16) | s1) >>> 0;
}

export function pad4(buf: Buffer): Buffer {
  const rem = buf.length % 4;
  if (rem === 0) return buf;
  return Buffer.concat([buf, Buffer.alloc(4 - rem, 0)]);
}

export function writeUleb128(val: number): Buffer {
  const bytes: number[] = [];
  let v = val >>> 0;
  do {
    let b = v & 0x7f;
    v >>>= 7;
    if (v !== 0) b |= 0x80;
    bytes.push(b);
  } while (v !== 0);
  return Buffer.from(bytes);
}

// ============================================================================
// ANDROID RES STRING POOL (UTF-16LE)
// ============================================================================
function buildResStringPoolUtf16(strings: string[]): Buffer {
  const count = strings.length;
  const offsets: number[] = [];
  const dataChunks: Buffer[] = [];
  let cursor = 0;

  for (const s of strings) {
    offsets.push(cursor);
    const utf16 = Buffer.from(s, 'utf16le');
    const charLen = s.length;
    const lenPrefix =
      charLen > 0x7fff
        ? Buffer.from([
            ((charLen >> 16) & 0x7f) | 0x80,
            (charLen >> 8) & 0xff,
            charLen & 0xff,
            0,
          ])
        : (() => {
            const b = Buffer.alloc(2);
            b.writeUInt16LE(charLen, 0);
            return b;
          })();
    const entry = Buffer.concat([lenPrefix, utf16, Buffer.from([0x00, 0x00])]);
    dataChunks.push(entry);
    cursor += entry.length;
  }

  const rawStringsData = pad4(Buffer.concat(dataChunks));
  const headerSize = 28;
  const offsetsSize = count * 4;
  const stringsStart = headerSize + offsetsSize;
  const totalSize = stringsStart + rawStringsData.length;

  const out = Buffer.alloc(totalSize);
  out.writeUInt16LE(0x0001, 0); // RES_STRING_POOL_TYPE
  out.writeUInt16LE(headerSize, 2);
  out.writeUInt32LE(totalSize, 4);
  out.writeUInt32LE(count, 8);
  out.writeUInt32LE(0, 12); // styleCount
  out.writeUInt32LE(0, 16); // flags (UTF-16LE)
  out.writeUInt32LE(stringsStart, 20);
  out.writeUInt32LE(0, 24); // stylesStart

  for (let i = 0; i < count; i++) {
    out.writeUInt32LE(offsets[i], headerSize + i * 4);
  }
  rawStringsData.copy(out, stringsStart);
  return out;
}

// ============================================================================
// BINARY AndroidManifest.xml (AXML) GENERATOR
// ============================================================================
interface AxmlAttrSpec {
  ns: string | null;
  name: string;
  resourceId?: number;
  type: 'string' | 'ref' | 'int_dec' | 'int_hex' | 'bool';
  value: string | number | boolean;
}

interface AxmlNode {
  tag: string;
  attrs: AxmlAttrSpec[];
  children?: AxmlNode[];
}

const ANDROID_NS = 'http://schemas.android.com/apk/res/android';

export function buildBinaryAndroidManifest(flavor: ApkFlavor): Buffer {
  const isTv = flavor === 'tv';
  const pkgName = flavor === 'tv' ? ENV.androidTvPkg : ENV.androidMobilePkg;
  const versionCode = isTv ? ENV.appVersionCodeTv : ENV.appVersionCodeMobile;
  const versionName = ENV.appVersionName;

  const manifestChildren: AxmlNode[] = [
    {
      tag: 'uses-sdk',
      attrs: [
        { ns: ANDROID_NS, name: 'minSdkVersion', resourceId: 0x0101020c, type: 'int_dec', value: 24 },
        { ns: ANDROID_NS, name: 'targetSdkVersion', resourceId: 0x01010270, type: 'int_dec', value: 34 },
      ],
    },
    {
      tag: 'uses-permission',
      attrs: [
        {
          ns: ANDROID_NS,
          name: 'name',
          resourceId: 0x01010003,
          type: 'string',
          value: 'android.permission.INTERNET',
        },
      ],
    },
    {
      tag: 'uses-permission',
      attrs: [
        {
          ns: ANDROID_NS,
          name: 'name',
          resourceId: 0x01010003,
          type: 'string',
          value: 'android.permission.ACCESS_NETWORK_STATE',
        },
      ],
    },
    {
      tag: 'uses-permission',
      attrs: [
        {
          ns: ANDROID_NS,
          name: 'name',
          resourceId: 0x01010003,
          type: 'string',
          value: 'android.permission.RECORD_AUDIO',
        },
      ],
    },
    {
      tag: 'uses-permission',
      attrs: [
        {
          ns: ANDROID_NS,
          name: 'name',
          resourceId: 0x01010003,
          type: 'string',
          value: 'android.permission.MODIFY_AUDIO_SETTINGS',
        },
      ],
    },
    {
      tag: 'uses-permission',
      attrs: [
        {
          ns: ANDROID_NS,
          name: 'name',
          resourceId: 0x01010003,
          type: 'string',
          value: 'android.permission.BLUETOOTH',
        },
      ],
    },
    {
      tag: 'uses-feature',
      attrs: [
        {
          ns: ANDROID_NS,
          name: 'name',
          resourceId: 0x01010003,
          type: 'string',
          value: 'android.hardware.touchscreen',
        },
        { ns: ANDROID_NS, name: 'required', resourceId: 0x0101028e, type: 'bool', value: false },
      ],
    },
    {
      tag: 'uses-feature',
      attrs: [
        {
          ns: ANDROID_NS,
          name: 'name',
          resourceId: 0x01010003,
          type: 'string',
          value: 'android.hardware.microphone',
        },
        { ns: ANDROID_NS, name: 'required', resourceId: 0x0101028e, type: 'bool', value: false },
      ],
    },
  ];

  if (isTv) {
    manifestChildren.push({
      tag: 'uses-feature',
      attrs: [
        {
          ns: ANDROID_NS,
          name: 'name',
          resourceId: 0x01010003,
          type: 'string',
          value: 'android.software.leanback',
        },
        { ns: ANDROID_NS, name: 'required', resourceId: 0x0101028e, type: 'bool', value: false },
      ],
    });
  }

  const launcherCategories: AxmlNode[] = [
    {
      tag: 'action',
      attrs: [
        {
          ns: ANDROID_NS,
          name: 'name',
          resourceId: 0x01010003,
          type: 'string',
          value: 'android.intent.action.MAIN',
        },
      ],
    },
    {
      tag: 'category',
      attrs: [
        {
          ns: ANDROID_NS,
          name: 'name',
          resourceId: 0x01010003,
          type: 'string',
          value: 'android.intent.category.LAUNCHER',
        },
      ],
    },
  ];

  if (isTv) {
    launcherCategories.push({
      tag: 'category',
      attrs: [
        {
          ns: ANDROID_NS,
          name: 'name',
          resourceId: 0x01010003,
          type: 'string',
          value: 'android.intent.category.LEANBACK_LAUNCHER',
        },
      ],
    });
  }

  const appAttrs: AxmlAttrSpec[] = [
    {
      ns: ANDROID_NS,
      name: 'theme',
      resourceId: 0x01010000,
      type: 'ref',
      value: 0x01030007,
    },
    { ns: ANDROID_NS, name: 'label', resourceId: 0x01010001, type: 'ref', value: 0x7f010000 },
    { ns: ANDROID_NS, name: 'icon', resourceId: 0x01010002, type: 'ref', value: 0x7f020000 },
    { ns: ANDROID_NS, name: 'hardwareAccelerated', resourceId: 0x010102d3, type: 'bool', value: true },
    { ns: ANDROID_NS, name: 'usesCleartextTraffic', resourceId: 0x010104ec, type: 'bool', value: true },
  ];
  if (isTv) {
    appAttrs.push({
      ns: ANDROID_NS,
      name: 'banner',
      resourceId: 0x010103f2,
      type: 'ref',
      value: 0x7f020000,
    });
  }

  manifestChildren.push({
    tag: 'application',
    attrs: appAttrs,
    children: [
      {
        tag: 'activity',
        attrs: [
          {
            ns: ANDROID_NS,
            name: 'name',
            resourceId: 0x01010003,
            type: 'string',
            value: 'com.naimcine.app.MainActivity',
          },
          { ns: ANDROID_NS, name: 'exported', resourceId: 0x01010010, type: 'bool', value: true },
          {
            ns: ANDROID_NS,
            name: 'configChanges',
            resourceId: 0x0101001f,
            type: 'int_hex',
            value: 0x0fb0,
          },
        ],
        children: [
          {
            tag: 'intent-filter',
            attrs: [],
            children: launcherCategories,
          },
        ],
      },
    ],
  });

  const root: AxmlNode = {
    tag: 'manifest',
    attrs: [
      { ns: ANDROID_NS, name: 'versionCode', resourceId: 0x0101021b, type: 'int_dec', value: versionCode },
      { ns: ANDROID_NS, name: 'versionName', resourceId: 0x0101021c, type: 'string', value: versionName },
      { ns: null, name: 'package', type: 'string', value: pkgName },
    ],
    children: manifestChildren,
  };

  const attrResourceMap = new Map<string, number>();
  const otherStrings = new Set<string>(['android', ANDROID_NS]);

  const walkCollect = (node: AxmlNode) => {
    otherStrings.add(node.tag);
    for (const a of node.attrs) {
      if (a.resourceId !== undefined) {
        attrResourceMap.set(a.name, a.resourceId);
      } else {
        otherStrings.add(a.name);
      }
      if (a.type === 'string') {
        otherStrings.add(String(a.value));
      }
      if (a.ns) otherStrings.add(a.ns);
    }
    for (const child of node.children || []) walkCollect(child);
  };
  walkCollect(root);

  const sortedResAttrs = Array.from(attrResourceMap.entries()).sort((a, b) => a[1] - b[1]);
  const resAttrNames = sortedResAttrs.map(([name]) => name);
  const resAttrIds = sortedResAttrs.map(([, id]) => id);

  const remaining = Array.from(otherStrings).filter((s) => !attrResourceMap.has(s));
  const allStrings = [...resAttrNames, ...remaining];
  const strIndex = new Map<string, number>();
  allStrings.forEach((s, i) => strIndex.set(s, i));

  const poolChunk = buildResStringPoolUtf16(allStrings);

  const resMapChunk = Buffer.alloc(8 + resAttrIds.length * 4);
  resMapChunk.writeUInt16LE(0x0180, 0);
  resMapChunk.writeUInt16LE(8, 2);
  resMapChunk.writeUInt32LE(resMapChunk.length, 4);
  resAttrIds.forEach((id, i) => resMapChunk.writeUInt32LE(id, 8 + i * 4));

  const chunks: Buffer[] = [poolChunk, resMapChunk];

  const makeNsChunk = (type: number) => {
    const b = Buffer.alloc(24);
    b.writeUInt16LE(type, 0);
    b.writeUInt16LE(16, 2);
    b.writeUInt32LE(24, 4);
    b.writeUInt32LE(1, 8);
    b.writeInt32LE(-1, 12);
    b.writeUInt32LE(strIndex.get('android')!, 16);
    b.writeUInt32LE(strIndex.get(ANDROID_NS)!, 20);
    return b;
  };

  chunks.push(makeNsChunk(0x0100)); // START_NAMESPACE

  let lineNo = 2;
  const emitNode = (node: AxmlNode) => {
    const sortedAttrs = [...node.attrs].sort((a, b) => {
      const ra = a.resourceId ?? 0xffffffff;
      const rb = b.resourceId ?? 0xffffffff;
      return ra - rb;
    });

    const startSize = 36 + sortedAttrs.length * 20;
    const sb = Buffer.alloc(startSize);
    sb.writeUInt16LE(0x0102, 0); // START_TAG
    sb.writeUInt16LE(16, 2);
    sb.writeUInt32LE(startSize, 4);
    sb.writeUInt32LE(lineNo++, 8);
    sb.writeInt32LE(-1, 12);
    sb.writeInt32LE(-1, 16);
    sb.writeUInt32LE(strIndex.get(node.tag)!, 20);
    sb.writeUInt16LE(0x0014, 24);
    sb.writeUInt16LE(0x0014, 26);
    sb.writeUInt16LE(sortedAttrs.length, 28);
    sb.writeUInt16LE(0, 30);
    sb.writeUInt16LE(0, 32);
    sb.writeUInt16LE(0, 34);

    sortedAttrs.forEach((a, idx) => {
      const off = 36 + idx * 20;
      sb.writeInt32LE(a.ns ? strIndex.get(a.ns)! : -1, off);
      sb.writeUInt32LE(strIndex.get(a.name)!, off + 4);
      let rawVal = -1;
      let dataType = 0x03;
      let dataVal = 0;

      if (a.type === 'string') {
        const sIdx = strIndex.get(String(a.value))!;
        rawVal = sIdx;
        dataType = 0x03;
        dataVal = sIdx;
      } else if (a.type === 'ref') {
        dataType = 0x01;
        dataVal = Number(a.value) >>> 0;
      } else if (a.type === 'int_dec') {
        dataType = 0x10;
        dataVal = Number(a.value) >>> 0;
      } else if (a.type === 'int_hex') {
        dataType = 0x11;
        dataVal = Number(a.value) >>> 0;
      } else if (a.type === 'bool') {
        dataType = 0x12;
        dataVal = a.value ? 0xffffffff : 0x00000000;
      }

      sb.writeInt32LE(rawVal, off + 8);
      sb.writeUInt16LE(8, off + 12);
      sb.writeUInt8(0, off + 14);
      sb.writeUInt8(dataType, off + 15);
      sb.writeUInt32LE(dataVal >>> 0, off + 16);
    });

    chunks.push(sb);
    for (const child of node.children || []) emitNode(child);

    const eb = Buffer.alloc(24);
    eb.writeUInt16LE(0x0103, 0); // END_TAG
    eb.writeUInt16LE(16, 2);
    eb.writeUInt32LE(24, 4);
    eb.writeUInt32LE(lineNo++, 8);
    eb.writeInt32LE(-1, 12);
    eb.writeInt32LE(-1, 16);
    eb.writeUInt32LE(strIndex.get(node.tag)!, 20);
    chunks.push(eb);
  };

  emitNode(root);
  chunks.push(makeNsChunk(0x0101)); // END_NAMESPACE

  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(8);
  header.writeUInt16LE(0x0003, 0); // RES_XML_TYPE
  header.writeUInt16LE(8, 2);
  header.writeUInt32LE(8 + body.length, 4);
  return Buffer.concat([header, body]);
}

// ============================================================================
// BINARY resources.arsc GENERATOR
// ============================================================================
export function buildResourcesArsc(flavor: ApkFlavor): Buffer {
  const pkgName = flavor === 'tv' ? ENV.androidTvPkg : ENV.androidMobilePkg;
  const appLabel = flavor === 'tv' ? 'RiffanTV TV' : 'RiffanTV';
  const iconResPath = 'res/mipmap-xxxhdpi-v4/ic_launcher.png';

  const globalPool = buildResStringPoolUtf16([iconResPath, appLabel]);
  const typeStrings = buildResStringPoolUtf16(['string', 'mipmap']);
  const keyStrings = buildResStringPoolUtf16(['app_name', 'ic_launcher']);

  const buildSingleEntryTypePair = (typeId: number, keyIdx: number, globalStrIdx: number) => {
    const spec = Buffer.alloc(20);
    spec.writeUInt16LE(0x0202, 0);
    spec.writeUInt16LE(16, 2);
    spec.writeUInt32LE(20, 4);
    spec.writeUInt8(typeId, 8);
    spec.writeUInt8(0, 9);
    spec.writeUInt16LE(0, 10);
    spec.writeUInt32LE(1, 12);
    spec.writeUInt32LE(0, 16);

    const configSize = 64;
    const typeHeaderSize = 20 + configSize;
    const entriesStart = typeHeaderSize + 4;
    const entrySize = 16;
    const typeTotalSize = entriesStart + entrySize;

    const rtype = Buffer.alloc(typeTotalSize);
    rtype.writeUInt16LE(0x0201, 0);
    rtype.writeUInt16LE(typeHeaderSize, 2);
    rtype.writeUInt32LE(typeTotalSize, 4);
    rtype.writeUInt8(typeId, 8);
    rtype.writeUInt8(0, 9);
    rtype.writeUInt16LE(0, 10);
    rtype.writeUInt32LE(1, 12);
    rtype.writeUInt32LE(entriesStart, 16);
    rtype.writeUInt32LE(configSize, 20);
    rtype.writeUInt32LE(0, typeHeaderSize);
    rtype.writeUInt16LE(8, entriesStart);
    rtype.writeUInt16LE(0, entriesStart + 2);
    rtype.writeUInt32LE(keyIdx, entriesStart + 4);
    rtype.writeUInt16LE(8, entriesStart + 8);
    rtype.writeUInt8(0, entriesStart + 10);
    rtype.writeUInt8(0x03, entriesStart + 11);
    rtype.writeUInt32LE(globalStrIdx, entriesStart + 12);

    return Buffer.concat([spec, rtype]);
  };

  const stringTypeBlock = buildSingleEntryTypePair(1, 0, 1);
  const mipmapTypeBlock = buildSingleEntryTypePair(2, 1, 0);

  const pkgHeaderSize = 288;
  const typeStringsOff = pkgHeaderSize;
  const keyStringsOff = typeStringsOff + typeStrings.length;
  const pkgBody = Buffer.concat([typeStrings, keyStrings, stringTypeBlock, mipmapTypeBlock]);
  const pkgTotalSize = pkgHeaderSize + pkgBody.length;

  const pkgHeader = Buffer.alloc(pkgHeaderSize);
  pkgHeader.writeUInt16LE(0x0200, 0);
  pkgHeader.writeUInt16LE(pkgHeaderSize, 2);
  pkgHeader.writeUInt32LE(pkgTotalSize, 4);
  pkgHeader.writeUInt32LE(0x7f, 8);
  Buffer.from(pkgName.slice(0, 127), 'utf16le').copy(pkgHeader, 12);
  pkgHeader.writeUInt32LE(typeStringsOff, 268);
  pkgHeader.writeUInt32LE(2, 272);
  pkgHeader.writeUInt32LE(keyStringsOff, 276);
  pkgHeader.writeUInt32LE(2, 280);
  pkgHeader.writeUInt32LE(0, 284);

  const pkgChunk = Buffer.concat([pkgHeader, pkgBody]);

  const tableHeaderSize = 12;
  const tableTotalSize = tableHeaderSize + globalPool.length + pkgChunk.length;
  const tableHeader = Buffer.alloc(tableHeaderSize);
  tableHeader.writeUInt16LE(0x0002, 0);
  tableHeader.writeUInt16LE(tableHeaderSize, 2);
  tableHeader.writeUInt32LE(tableTotalSize, 4);
  tableHeader.writeUInt32LE(1, 8);

  return Buffer.concat([tableHeader, globalPool, pkgChunk]);
}
