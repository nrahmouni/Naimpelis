import crypto from 'crypto';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { ENV, ROOT_DIR } from '../config/env.ts';
import { LruTtlCache } from '../utils/lruCache.ts';

export type ApkFlavor = 'mobile' | 'tv';

interface CertMaterial {
  keyPem: string;
  certDer: Buffer;
  certPemPath: string;
  keyPemPath: string;
}

let cachedCertMaterial: CertMaterial | null = null;
const APK_CACHE_TTL_MS = 30 * 60 * 1000;
const generatedApkCache = new LruTtlCache<string, Buffer>(16, APK_CACHE_TTL_MS);

function ensureSigningCert(): CertMaterial {
  if (cachedCertMaterial) return cachedCertMaterial;
  const certDir = '/tmp/naimcine-apk-signing';
  fs.mkdirSync(certDir, { recursive: true });
  const keyPemPath = path.join(certDir, 'naimcine-release.key.pem');
  const certPemPath = path.join(certDir, 'naimcine-release.cert.pem');
  const certDerPath = path.join(certDir, 'naimcine-release.cert.der');

  if (!fs.existsSync(keyPemPath) || !fs.existsSync(certPemPath) || !fs.existsSync(certDerPath)) {
    execFileSync('openssl', [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      keyPemPath,
      '-out',
      certPemPath,
      '-days',
      '9125',
      '-sha256',
      '-subj',
      '/CN=NAIM CINE/O=NAIM CINE Media/C=ES',
    ]);
    execFileSync('openssl', [
      'x509',
      '-in',
      certPemPath,
      '-outform',
      'DER',
      '-out',
      certDerPath,
    ]);
  }

  cachedCertMaterial = {
    keyPem: fs.readFileSync(keyPemPath, 'utf8'),
    certDer: fs.readFileSync(certDerPath),
    certPemPath,
    keyPemPath,
  };
  return cachedCertMaterial;
}

export function getApkSigningCertSha256(): string {
  try {
    const cert = ensureSigningCert();
    const hex = crypto.createHash('sha256').update(cert.certDer).digest('hex').toUpperCase();
    return hex.match(/.{2}/g)?.join(':') || ENV.androidCertSha256;
  } catch {
    return ENV.androidCertSha256;
  }
}

// ============================================================================
// CRC32 & ADLER32 HELPERS
// ============================================================================
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

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(buf: Buffer): number {
  let s1 = 1;
  let s2 = 0;
  const MOD = 65521;
  for (let i = 0; i < buf.length; i++) {
    s1 = (s1 + buf[i]) % MOD;
    s2 = (s2 + s1) % MOD;
  }
  return ((s2 << 16) | s1) >>> 0;
}

function pad4(buf: Buffer): Buffer {
  const rem = buf.length % 4;
  if (rem === 0) return buf;
  return Buffer.concat([buf, Buffer.alloc(4 - rem, 0)]);
}

function writeUleb128(val: number): Buffer {
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
            0, // placeholder, wait: UTF-16BE style high|0x80 for big strings, unused here (<32k)
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

function buildBinaryAndroidManifest(flavor: ApkFlavor): Buffer {
  const pkgName = flavor === 'tv' ? ENV.androidTvPkg : ENV.androidMobilePkg;
  const versionCode = flavor === 'tv' ? ENV.appVersionCodeTv : ENV.appVersionCodeMobile;
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
  ];

  if (flavor === 'tv') {
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

  if (flavor === 'tv') {
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
      value: 0x01030007, // @android:style/Theme.Black.NoTitleBar.Fullscreen
    },
    { ns: ANDROID_NS, name: 'label', resourceId: 0x01010001, type: 'ref', value: 0x7f010000 },
    { ns: ANDROID_NS, name: 'icon', resourceId: 0x01010002, type: 'ref', value: 0x7f020000 },
    { ns: ANDROID_NS, name: 'hardwareAccelerated', resourceId: 0x010102d3, type: 'bool', value: true },
    { ns: ANDROID_NS, name: 'usesCleartextTraffic', resourceId: 0x010104ec, type: 'bool', value: true },
  ];
  if (flavor === 'tv') {
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
            value: 0x0fb0, // orientation|screenSize|screenLayout|keyboardHidden|keyboard|navigation|uiMode
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

  // Collect resource-mapped attribute names first (sorted by resourceId)
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

  // ResXMLTree_resourceMap chunk (0x0180)
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
    b.writeUInt32LE(1, 8); // lineNumber
    b.writeInt32LE(-1, 12); // comment
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
    sb.writeInt32LE(-1, 16); // ns
    sb.writeUInt32LE(strIndex.get(node.tag)!, 20);
    sb.writeUInt16LE(0x0014, 24); // attributeStart
    sb.writeUInt16LE(0x0014, 26); // attributeSize (20)
    sb.writeUInt16LE(sortedAttrs.length, 28);
    sb.writeUInt16LE(0, 30); // idIndex
    sb.writeUInt16LE(0, 32); // classIndex
    sb.writeUInt16LE(0, 34); // styleIndex

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
        dataType = 0x03; // TYPE_STRING
        dataVal = sIdx;
      } else if (a.type === 'ref') {
        dataType = 0x01; // TYPE_REFERENCE
        dataVal = Number(a.value) >>> 0;
      } else if (a.type === 'int_dec') {
        dataType = 0x10; // TYPE_INT_DEC
        dataVal = Number(a.value) >>> 0;
      } else if (a.type === 'int_hex') {
        dataType = 0x11; // TYPE_INT_HEX
        dataVal = Number(a.value) >>> 0;
      } else if (a.type === 'bool') {
        dataType = 0x12; // TYPE_INT_BOOLEAN
        dataVal = a.value ? 0xffffffff : 0x00000000;
      }

      sb.writeInt32LE(rawVal, off + 8);
      sb.writeUInt16LE(8, off + 12); // TypedValue.size
      sb.writeUInt8(0, off + 14); // res0
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
function buildResourcesArsc(flavor: ApkFlavor): Buffer {
  const pkgName = flavor === 'tv' ? 'com.naimcine.tv' : 'com.naimcine.mobile';
  const appLabel = flavor === 'tv' ? 'NAIM CINE TV' : 'NAIM CINE';
  const iconResPath = 'res/mipmap-xxxhdpi-v4/ic_launcher.png';

  // Global string pool: [0] = icon path, [1] = app name
  const globalPool = buildResStringPoolUtf16([iconResPath, appLabel]);
  const typeStrings = buildResStringPoolUtf16(['string', 'mipmap']);
  const keyStrings = buildResStringPoolUtf16(['app_name', 'ic_launcher']);

  const buildSingleEntryTypePair = (typeId: number, keyIdx: number, globalStrIdx: number) => {
    // ResTable_typeSpec (16 + 4 = 20 bytes)
    const spec = Buffer.alloc(20);
    spec.writeUInt16LE(0x0202, 0); // RES_TABLE_TYPE_SPEC_TYPE
    spec.writeUInt16LE(16, 2);
    spec.writeUInt32LE(20, 4);
    spec.writeUInt8(typeId, 8);
    spec.writeUInt8(0, 9);
    spec.writeUInt16LE(0, 10);
    spec.writeUInt32LE(1, 12); // entryCount
    spec.writeUInt32LE(0, 16); // flags for entry 0

    // ResTable_type: header = 84 bytes (20 + 64 ResTable_config), 1 offset (4 bytes), 1 ResTable_entry (8 bytes) + Res_value (8 bytes)
    const configSize = 64;
    const typeHeaderSize = 20 + configSize; // 84
    const entriesStart = typeHeaderSize + 4; // 88
    const entrySize = 16; // ResTable_entry (8) + Res_value (8)
    const typeTotalSize = entriesStart + entrySize;

    const rtype = Buffer.alloc(typeTotalSize);
    rtype.writeUInt16LE(0x0201, 0); // RES_TABLE_TYPE_TYPE
    rtype.writeUInt16LE(typeHeaderSize, 2);
    rtype.writeUInt32LE(typeTotalSize, 4);
    rtype.writeUInt8(typeId, 8);
    rtype.writeUInt8(0, 9);
    rtype.writeUInt16LE(0, 10);
    rtype.writeUInt32LE(1, 12); // entryCount
    rtype.writeUInt32LE(entriesStart, 16);
    rtype.writeUInt32LE(configSize, 20); // ResTable_config.size = 64
    rtype.writeUInt32LE(0, typeHeaderSize); // offset of entry 0 = 0
    // ResTable_entry at entriesStart
    rtype.writeUInt16LE(8, entriesStart); // size = 8
    rtype.writeUInt16LE(0, entriesStart + 2); // flags = 0
    rtype.writeUInt32LE(keyIdx, entriesStart + 4); // key string index
    // Res_value
    rtype.writeUInt16LE(8, entriesStart + 8); // size
    rtype.writeUInt8(0, entriesStart + 10); // res0
    rtype.writeUInt8(0x03, entriesStart + 11); // TYPE_STRING
    rtype.writeUInt32LE(globalStrIdx, entriesStart + 12);

    return Buffer.concat([spec, rtype]);
  };

  const stringTypeBlock = buildSingleEntryTypePair(1, 0, 1); // 0x7f010000 -> appLabel
  const mipmapTypeBlock = buildSingleEntryTypePair(2, 1, 0); // 0x7f020000 -> iconResPath

  const pkgHeaderSize = 288;
  const typeStringsOff = pkgHeaderSize;
  const keyStringsOff = typeStringsOff + typeStrings.length;
  const pkgBody = Buffer.concat([typeStrings, keyStrings, stringTypeBlock, mipmapTypeBlock]);
  const pkgTotalSize = pkgHeaderSize + pkgBody.length;

  const pkgHeader = Buffer.alloc(pkgHeaderSize);
  pkgHeader.writeUInt16LE(0x0200, 0); // RES_TABLE_PACKAGE_TYPE
  pkgHeader.writeUInt16LE(pkgHeaderSize, 2);
  pkgHeader.writeUInt32LE(pkgTotalSize, 4);
  pkgHeader.writeUInt32LE(0x7f, 8); // package id
  Buffer.from(pkgName.slice(0, 127), 'utf16le').copy(pkgHeader, 12);
  pkgHeader.writeUInt32LE(typeStringsOff, 268);
  pkgHeader.writeUInt32LE(2, 272); // lastPublicType
  pkgHeader.writeUInt32LE(keyStringsOff, 276);
  pkgHeader.writeUInt32LE(2, 280); // lastPublicKey
  pkgHeader.writeUInt32LE(0, 284); // typeIdOffset

  const pkgChunk = Buffer.concat([pkgHeader, pkgBody]);

  const tableHeaderSize = 12;
  const tableTotalSize = tableHeaderSize + globalPool.length + pkgChunk.length;
  const tableHeader = Buffer.alloc(tableHeaderSize);
  tableHeader.writeUInt16LE(0x0002, 0); // RES_TABLE_TYPE
  tableHeader.writeUInt16LE(tableHeaderSize, 2);
  tableHeader.writeUInt32LE(tableTotalSize, 4);
  tableHeader.writeUInt32LE(1, 8); // packageCount

  return Buffer.concat([tableHeader, globalPool, pkgChunk]);
}

// ============================================================================
// MINIMAL SPEC-COMPLIANT DALVIK classes.dex BUILDER (v035)
// ============================================================================
interface MethodRefSpec {
  cls: string;
  name: string;
  ret: string;
  params: string[];
}

function buildWebViewMainActivityDex(launchUrl: string): Buffer {
  const MAIN_CLS = 'Lcom/naimcine/app/MainActivity;';
  const SUPER_CLS = 'Landroid/app/Activity;';

  const methodSpecs: MethodRefSpec[] = [
    { cls: SUPER_CLS, name: '<init>', ret: 'V', params: [] },
    { cls: SUPER_CLS, name: 'onCreate', ret: 'V', params: ['Landroid/os/Bundle;'] },
    { cls: SUPER_CLS, name: 'getWindow', ret: 'Landroid/view/Window;', params: [] },
    { cls: SUPER_CLS, name: 'setContentView', ret: 'V', params: ['Landroid/view/View;'] },
    { cls: 'Landroid/view/Window;', name: 'setStatusBarColor', ret: 'V', params: ['I'] },
    { cls: 'Landroid/view/Window;', name: 'setNavigationBarColor', ret: 'V', params: ['I'] },
    { cls: 'Landroid/webkit/WebView;', name: '<init>', ret: 'V', params: ['Landroid/content/Context;'] },
    { cls: 'Landroid/webkit/WebView;', name: 'setBackgroundColor', ret: 'V', params: ['I'] },
    { cls: 'Landroid/webkit/WebView;', name: 'getSettings', ret: 'Landroid/webkit/WebSettings;', params: [] },
    { cls: 'Landroid/webkit/WebView;', name: 'setWebViewClient', ret: 'V', params: ['Landroid/webkit/WebViewClient;'] },
    { cls: 'Landroid/webkit/WebView;', name: 'setWebChromeClient', ret: 'V', params: ['Landroid/webkit/WebChromeClient;'] },
    { cls: 'Landroid/webkit/WebView;', name: 'loadUrl', ret: 'V', params: ['Ljava/lang/String;'] },
    { cls: 'Landroid/webkit/WebSettings;', name: 'setJavaScriptEnabled', ret: 'V', params: ['Z'] },
    { cls: 'Landroid/webkit/WebSettings;', name: 'setDomStorageEnabled', ret: 'V', params: ['Z'] },
    { cls: 'Landroid/webkit/WebSettings;', name: 'setDatabaseEnabled', ret: 'V', params: ['Z'] },
    { cls: 'Landroid/webkit/WebSettings;', name: 'setUseWideViewPort', ret: 'V', params: ['Z'] },
    { cls: 'Landroid/webkit/WebSettings;', name: 'setLoadWithOverviewMode', ret: 'V', params: ['Z'] },
    { cls: 'Landroid/webkit/WebSettings;', name: 'setMediaPlaybackRequiresUserGesture', ret: 'V', params: ['Z'] },
    { cls: 'Landroid/webkit/WebSettings;', name: 'setMixedContentMode', ret: 'V', params: ['I'] },
    { cls: 'Landroid/webkit/WebViewClient;', name: '<init>', ret: 'V', params: [] },
    { cls: 'Landroid/webkit/WebChromeClient;', name: '<init>', ret: 'V', params: [] },
    { cls: MAIN_CLS, name: '<init>', ret: 'V', params: [] },
    { cls: MAIN_CLS, name: 'onCreate', ret: 'V', params: ['Landroid/os/Bundle;'] },
  ];

  const typeSet = new Set<string>([MAIN_CLS, SUPER_CLS]);
  const stringSet = new Set<string>([launchUrl]);

  const protoShorty = (ret: string, params: string[]) => {
    const ch = (t: string) => (t.length === 1 ? t : 'L');
    return ch(ret) + params.map(ch).join('');
  };

  for (const m of methodSpecs) {
    typeSet.add(m.cls);
    typeSet.add(m.ret);
    stringSet.add(m.cls);
    stringSet.add(m.ret);
    stringSet.add(m.name);
    stringSet.add(protoShorty(m.ret, m.params));
    for (const p of m.params) {
      typeSet.add(p);
      stringSet.add(p);
    }
  }
  typeSet.forEach((t) => stringSet.add(t));

  // Sort strings strictly by UTF-8 byte order (unsigned byte comparison = Buffer.compare)
  const strings = Array.from(stringSet).sort((a, b) =>
    Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'))
  );
  const strIdx = new Map<string, number>();
  strings.forEach((s, i) => strIdx.set(s, i));

  // Sort types by descriptor string index
  const types = Array.from(typeSet).sort((a, b) => strIdx.get(a)! - strIdx.get(b)!);
  const typeIdx = new Map<string, number>();
  types.forEach((t, i) => typeIdx.set(t, i));

  // Collect & sort unique protos
  const protoMap = new Map<string, { shorty: string; ret: string; params: string[] }>();
  for (const m of methodSpecs) {
    const key = `${m.ret}(${m.params.join(',')})`;
    if (!protoMap.has(key)) {
      protoMap.set(key, { shorty: protoShorty(m.ret, m.params), ret: m.ret, params: m.params });
    }
  }
  const protos = Array.from(protoMap.entries())
    .sort(([, a], [, b]) => {
      const rDiff = typeIdx.get(a.ret)! - typeIdx.get(b.ret)!;
      if (rDiff !== 0) return rDiff;
      const minLen = Math.min(a.params.length, b.params.length);
      for (let i = 0; i < minLen; i++) {
        const pDiff = typeIdx.get(a.params[i])! - typeIdx.get(b.params[i])!;
        if (pDiff !== 0) return pDiff;
      }
      return a.params.length - b.params.length;
    })
    .map(([key, val]) => ({ key, ...val }));
  const protoIdx = new Map<string, number>();
  protos.forEach((p, i) => protoIdx.set(p.key, i));

  // Sort methods by (class_idx, name_idx, proto_idx)
  const methods = [...methodSpecs].sort((a, b) => {
    const cDiff = typeIdx.get(a.cls)! - typeIdx.get(b.cls)!;
    if (cDiff !== 0) return cDiff;
    const nDiff = strIdx.get(a.name)! - strIdx.get(b.name)!;
    if (nDiff !== 0) return nDiff;
    const pa = protoIdx.get(`${a.ret}(${a.params.join(',')})`)!;
    const pb = protoIdx.get(`${b.ret}(${b.params.join(',')})`)!;
    return pa - pb;
  });
  const mId = (cls: string, name: string, ret: string, params: string[] = []): number => {
    const pKey = `${ret}(${params.join(',')})`;
    const found = methods.findIndex(
      (m) => m.cls === cls && m.name === name && `${m.ret}(${m.params.join(',')})` === pKey
    );
    if (found < 0) throw new Error(`Missing DEX method ${cls}.${name}${pKey}`);
    return found;
  };

  // Assemble Dalvik bytecode
  const emitU16 = (arr: number[], val: number) => {
    arr.push(val & 0xffff);
  };
  const invoke35c = (arr: number[], opcode: number, methodIndex: number, regs: number[]) => {
    const count = regs.length;
    const reg4 = regs[4] ?? 0;
    emitU16(arr, (opcode & 0xff) | (count << 12) | (reg4 << 8));
    emitU16(arr, methodIndex);
    const r0 = regs[0] ?? 0;
    const r1 = regs[1] ?? 0;
    const r2 = regs[2] ?? 0;
    const r3 = regs[3] ?? 0;
    emitU16(arr, r0 | (r1 << 4) | (r2 << 8) | (r3 << 12));
  };

  // Method 1: MainActivity.<init>()V
  const initInsns: number[] = [];
  invoke35c(initInsns, 0x70, mId(SUPER_CLS, '<init>', 'V'), [0]); // invoke-direct {p0}, Activity.<init>()
  emitU16(initInsns, 0x000e); // return-void

  // Method 2: MainActivity.onCreate(Bundle)V
  // registers_size = 6 (locals v0..v3, params v4=this, v5=savedInstanceState), ins_size = 2, outs_size = 2
  const onCreateInsns: number[] = [];
  invoke35c(onCreateInsns, 0x6f, mId(SUPER_CLS, 'onCreate', 'V', ['Landroid/os/Bundle;']), [4, 5]);
  // v0 = new WebView(this)
  emitU16(onCreateInsns, 0x0022); // new-instance v0
  emitU16(onCreateInsns, typeIdx.get('Landroid/webkit/WebView;')!);
  invoke35c(onCreateInsns, 0x70, mId('Landroid/webkit/WebView;', '<init>', 'V', ['Landroid/content/Context;']), [0, 4]);
  // v1 = 0xFF0E0E10 (obsidian background)
  emitU16(onCreateInsns, 0x0114); // const v1, #int
  emitU16(onCreateInsns, 0x0e10);
  emitU16(onCreateInsns, 0xff0e);
  invoke35c(onCreateInsns, 0x6e, mId('Landroid/webkit/WebView;', 'setBackgroundColor', 'V', ['I']), [0, 1]);
  // window = this.getWindow(); window.setStatusBarColor(v1); window.setNavigationBarColor(v1);
  invoke35c(onCreateInsns, 0x6e, mId(SUPER_CLS, 'getWindow', 'Landroid/view/Window;'), [4]);
  emitU16(onCreateInsns, 0x020c); // move-result-object v2
  invoke35c(onCreateInsns, 0x6e, mId('Landroid/view/Window;', 'setStatusBarColor', 'V', ['I']), [2, 1]);
  invoke35c(onCreateInsns, 0x6e, mId('Landroid/view/Window;', 'setNavigationBarColor', 'V', ['I']), [2, 1]);
  // v2 = webView.getSettings()
  invoke35c(onCreateInsns, 0x6e, mId('Landroid/webkit/WebView;', 'getSettings', 'Landroid/webkit/WebSettings;'), [0]);
  emitU16(onCreateInsns, 0x020c); // move-result-object v2
  emitU16(onCreateInsns, 0x1312); // const/4 v3, 1
  emitU16(onCreateInsns, 0x0112); // const/4 v1, 0
  invoke35c(onCreateInsns, 0x6e, mId('Landroid/webkit/WebSettings;', 'setJavaScriptEnabled', 'V', ['Z']), [2, 3]);
  invoke35c(onCreateInsns, 0x6e, mId('Landroid/webkit/WebSettings;', 'setDomStorageEnabled', 'V', ['Z']), [2, 3]);
  invoke35c(onCreateInsns, 0x6e, mId('Landroid/webkit/WebSettings;', 'setDatabaseEnabled', 'V', ['Z']), [2, 3]);
  invoke35c(onCreateInsns, 0x6e, mId('Landroid/webkit/WebSettings;', 'setUseWideViewPort', 'V', ['Z']), [2, 3]);
  invoke35c(onCreateInsns, 0x6e, mId('Landroid/webkit/WebSettings;', 'setLoadWithOverviewMode', 'V', ['Z']), [2, 3]);
  invoke35c(onCreateInsns, 0x6e, mId('Landroid/webkit/WebSettings;', 'setMediaPlaybackRequiresUserGesture', 'V', ['Z']), [2, 1]);
  invoke35c(onCreateInsns, 0x6e, mId('Landroid/webkit/WebSettings;', 'setMixedContentMode', 'V', ['I']), [2, 1]);
  // webView.setWebViewClient(new WebViewClient())
  emitU16(onCreateInsns, 0x0222); // new-instance v2
  emitU16(onCreateInsns, typeIdx.get('Landroid/webkit/WebViewClient;')!);
  invoke35c(onCreateInsns, 0x70, mId('Landroid/webkit/WebViewClient;', '<init>', 'V'), [2]);
  invoke35c(onCreateInsns, 0x6e, mId('Landroid/webkit/WebView;', 'setWebViewClient', 'V', ['Landroid/webkit/WebViewClient;']), [0, 2]);
  // webView.setWebChromeClient(new WebChromeClient())
  emitU16(onCreateInsns, 0x0222); // new-instance v2
  emitU16(onCreateInsns, typeIdx.get('Landroid/webkit/WebChromeClient;')!);
  invoke35c(onCreateInsns, 0x70, mId('Landroid/webkit/WebChromeClient;', '<init>', 'V'), [2]);
  invoke35c(onCreateInsns, 0x6e, mId('Landroid/webkit/WebView;', 'setWebChromeClient', 'V', ['Landroid/webkit/WebChromeClient;']), [0, 2]);
  // webView.loadUrl(launchUrl)
  emitU16(onCreateInsns, 0x021a); // const-string v2, idx
  emitU16(onCreateInsns, strIdx.get(launchUrl)!);
  invoke35c(onCreateInsns, 0x6e, mId('Landroid/webkit/WebView;', 'loadUrl', 'V', ['Ljava/lang/String;']), [0, 2]);
  // this.setContentView(webView)
  invoke35c(onCreateInsns, 0x6e, mId(SUPER_CLS, 'setContentView', 'V', ['Landroid/view/View;']), [4, 0]);
  emitU16(onCreateInsns, 0x000e); // return-void

  const makeCodeItem = (regs: number, ins: number, outs: number, insns: number[]): Buffer => {
    const b = Buffer.alloc(16 + insns.length * 2);
    b.writeUInt16LE(regs, 0);
    b.writeUInt16LE(ins, 2);
    b.writeUInt16LE(outs, 4);
    b.writeUInt16LE(0, 6); // tries_size
    b.writeUInt32LE(0, 8); // debug_info_off
    b.writeUInt32LE(insns.length, 12);
    insns.forEach((u, i) => b.writeUInt16LE(u, 16 + i * 2));
    return pad4(b);
  };

  const initCodeItem = makeCodeItem(1, 1, 1, initInsns);
  const onCreateCodeItem = makeCodeItem(6, 2, 2, onCreateInsns);

  // Compute exact section layout
  const HEADER_SIZE = 0x70; // 112 bytes
  const stringIdsOff = HEADER_SIZE;
  const stringIdsSize = strings.length * 4;
  const typeIdsOff = stringIdsOff + stringIdsSize;
  const typeIdsSize = types.length * 4;
  const protoIdsOff = typeIdsOff + typeIdsSize;
  const protoIdsSize = protos.length * 12;
  const methodIdsOff = protoIdsOff + protoIdsSize;
  const methodIdsSize = methods.length * 8;
  const classDefsOff = methodIdsOff + methodIdsSize;
  const classDefsSize = 32; // 1 class_def_item

  let cursor = classDefsOff + classDefsSize; // start of data section (already 4-byte aligned!)

  // 1. Type lists (for protos with params)
  const protoParamListOff = new Map<string, number>();
  const dataChunks: Buffer[] = [];
  const pushDataAligned4 = (buf: Buffer): number => {
    const off = cursor;
    const padded = pad4(buf);
    dataChunks.push(padded);
    cursor += padded.length;
    return off;
  };
  const pushDataRaw = (buf: Buffer): number => {
    const off = cursor;
    dataChunks.push(buf);
    cursor += buf.length;
    return off;
  };

  for (const p of protos) {
    if (p.params.length === 0) {
      protoParamListOff.set(p.key, 0);
      continue;
    }
    const tl = Buffer.alloc(4 + p.params.length * 2);
    tl.writeUInt32LE(p.params.length, 0);
    p.params.forEach((pt, idx) => tl.writeUInt16LE(typeIdx.get(pt)!, 4 + idx * 2));
    protoParamListOff.set(p.key, pushDataAligned4(tl));
  }

  // 2. code_items (must be 4-byte aligned)
  const initCodeOff = pushDataAligned4(initCodeItem);
  const onCreateCodeOff = pushDataAligned4(onCreateCodeItem);

  // 3. string_data_items (byte aligned)
  const stringDataOffsets: number[] = [];
  for (const s of strings) {
    const utf8 = Buffer.from(s, 'utf8');
    const item = Buffer.concat([writeUleb128(s.length), utf8, Buffer.from([0x00])]);
    stringDataOffsets.push(pushDataRaw(item));
  }

  // 4. class_data_item (0 static fields, 0 instance fields, 2 direct methods, 0 virtual methods)
  const mInitIdx = mId(MAIN_CLS, '<init>', 'V');
  const mOnCreateIdx = mId(MAIN_CLS, 'onCreate', 'V', ['Landroid/os/Bundle;']);
  const classDataBuf = Buffer.concat([
    writeUleb128(0), // static_fields_size
    writeUleb128(0), // instance_fields_size
    writeUleb128(2), // direct_methods_size
    writeUleb128(0), // virtual_methods_size
    // direct method 0: <init>
    writeUleb128(mInitIdx),
    writeUleb128(0x10001), // ACC_PUBLIC | ACC_CONSTRUCTOR
    writeUleb128(initCodeOff),
    // direct method 1: onCreate (still direct or virtual? Wait: overridden protected method onCreate is VIRTUAL method in Dalvik!)
  ]);
  void classDataBuf;

  // CRITICAL DEX RULE: Overridden non-private methods (onCreate) MUST go in virtual_methods, NOT direct_methods!
  const classDataFixed = Buffer.concat([
    writeUleb128(0), // static_fields_size
    writeUleb128(0), // instance_fields_size
    writeUleb128(1), // direct_methods_size (<init>)
    writeUleb128(1), // virtual_methods_size (onCreate)
    // direct_method[0]: <init>
    writeUleb128(mInitIdx),
    writeUleb128(0x10001), // ACC_PUBLIC | ACC_CONSTRUCTOR
    writeUleb128(initCodeOff),
    // virtual_method[0]: onCreate
    writeUleb128(mOnCreateIdx),
    writeUleb128(0x0004), // ACC_PROTECTED
    writeUleb128(onCreateCodeOff),
  ]);
  const classDataOff = pushDataRaw(classDataFixed);

  // Pad to 4 bytes before map_list
  const preMapRem = cursor % 4;
  if (preMapRem !== 0) {
    const pad = Buffer.alloc(4 - preMapRem, 0);
    dataChunks.push(pad);
    cursor += pad.length;
  }

  const mapOff = cursor;
  const mapItems: { type: number; size: number; off: number }[] = [
    { type: 0x0000, size: 1, off: 0 }, // header_item
    { type: 0x0001, size: strings.length, off: stringIdsOff },
    { type: 0x0002, size: types.length, off: typeIdsOff },
    { type: 0x0003, size: protos.length, off: protoIdsOff },
    { type: 0x0005, size: methods.length, off: methodIdsOff },
    { type: 0x0006, size: 1, off: classDefsOff },
    { type: 0x1001, size: Array.from(protoParamListOff.values()).filter((v) => v > 0).length, off: Array.from(protoParamListOff.values()).find((v) => v > 0) || 0 },
    { type: 0x2000, size: 1, off: classDataOff },
    { type: 0x2001, size: 2, off: initCodeOff },
    { type: 0x2002, size: strings.length, off: stringDataOffsets[0] },
    { type: 0x1000, size: 1, off: mapOff },
  ]
    .filter((it) => it.size > 0)
    .sort((a, b) => a.off - b.off);

  const mapBuf = Buffer.alloc(4 + mapItems.length * 12);
  mapBuf.writeUInt32LE(mapItems.length, 0);
  mapItems.forEach((it, idx) => {
    const o = 4 + idx * 12;
    mapBuf.writeUInt16LE(it.type, o);
    mapBuf.writeUInt16LE(0, o + 2);
    mapBuf.writeUInt32LE(it.size, o + 4);
    mapBuf.writeUInt32LE(it.off, o + 8);
  });
  dataChunks.push(mapBuf);
  cursor += mapBuf.length;

  const fileSize = cursor;
  const dataOff = classDefsOff + classDefsSize;
  const dataSize = fileSize - dataOff;

  const dex = Buffer.alloc(fileSize);

  // Header
  Buffer.from('dex\n035\0', 'ascii').copy(dex, 0);
  dex.writeUInt32LE(fileSize, 32);
  dex.writeUInt32LE(HEADER_SIZE, 36);
  dex.writeUInt32LE(0x12345678, 40); // ENDIAN_CONSTANT
  dex.writeUInt32LE(0, 44); // link_size
  dex.writeUInt32LE(0, 48); // link_off
  dex.writeUInt32LE(mapOff, 52);
  dex.writeUInt32LE(strings.length, 56);
  dex.writeUInt32LE(stringIdsOff, 60);
  dex.writeUInt32LE(types.length, 64);
  dex.writeUInt32LE(typeIdsOff, 68);
  dex.writeUInt32LE(protos.length, 72);
  dex.writeUInt32LE(protoIdsOff, 76);
  dex.writeUInt32LE(0, 80); // field_ids_size
  dex.writeUInt32LE(0, 84); // field_ids_off
  dex.writeUInt32LE(methods.length, 88);
  dex.writeUInt32LE(methodIdsOff, 92);
  dex.writeUInt32LE(1, 96); // class_defs_size
  dex.writeUInt32LE(classDefsOff, 100);
  dex.writeUInt32LE(dataSize, 104);
  dex.writeUInt32LE(dataOff, 108);

  // string_ids
  stringDataOffsets.forEach((off, i) => dex.writeUInt32LE(off, stringIdsOff + i * 4));
  // type_ids
  types.forEach((t, i) => dex.writeUInt32LE(strIdx.get(t)!, typeIdsOff + i * 4));
  // proto_ids
  protos.forEach((p, i) => {
    const o = protoIdsOff + i * 12;
    dex.writeUInt32LE(strIdx.get(p.shorty)!, o);
    dex.writeUInt32LE(typeIdx.get(p.ret)!, o + 4);
    dex.writeUInt32LE(protoParamListOff.get(p.key) || 0, o + 8);
  });
  // method_ids
  methods.forEach((m, i) => {
    const o = methodIdsOff + i * 8;
    dex.writeUInt16LE(typeIdx.get(m.cls)!, o);
    dex.writeUInt16LE(protoIdx.get(`${m.ret}(${m.params.join(',')})`)!, o + 2);
    dex.writeUInt32LE(strIdx.get(m.name)!, o + 4);
  });
  // class_defs
  dex.writeUInt32LE(typeIdx.get(MAIN_CLS)!, classDefsOff); // class_idx
  dex.writeUInt32LE(0x0001, classDefsOff + 4); // ACC_PUBLIC
  dex.writeUInt32LE(typeIdx.get(SUPER_CLS)!, classDefsOff + 8); // superclass_idx
  dex.writeUInt32LE(0, classDefsOff + 12); // interfaces_off
  dex.writeUInt32LE(0xffffffff, classDefsOff + 16); // NO_INDEX source_file_idx
  dex.writeUInt32LE(0, classDefsOff + 20); // annotations_off
  dex.writeUInt32LE(classDataOff, classDefsOff + 24);
  dex.writeUInt32LE(0, classDefsOff + 28); // static_values_off

  Buffer.concat(dataChunks).copy(dex, dataOff);

  // Stamp SHA-1 signature (bytes 32..EOF -> stored at 12..31) and Adler32 (bytes 12..EOF -> stored at 8..11)
  const sha1 = crypto.createHash('sha1').update(dex.subarray(32)).digest();
  sha1.copy(dex, 12);
  dex.writeUInt32LE(adler32(dex.subarray(12)), 8);

  return dex;
}

// ============================================================================
// JAR v1 SIGNATURE + APK SIGNATURE SCHEME v2 + ZIP ASSEMBLER
// ============================================================================
interface ZipInputFile {
  name: string;
  data: Buffer;
  store?: boolean;
  align4?: boolean;
}

function sha256Base64(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('base64');
}

function buildManifestAndCertSf(files: { name: string; data: Buffer }[]): {
  manifestMf: Buffer;
  certSf: Buffer;
} {
  const mfLines = [
    'Manifest-Version: 1.0',
    'Created-By: NAIM CINE Build Engine 2.4',
    '',
  ];

  const sectionStrings: string[] = [];
  for (const f of files) {
    const sec = `Name: ${f.name}\r\nSHA-256-Digest: ${sha256Base64(f.data)}\r\n\r\n`;
    sectionStrings.push(sec);
    mfLines.push(`Name: ${f.name}`);
    mfLines.push(`SHA-256-Digest: ${sha256Base64(f.data)}`);
    mfLines.push('');
  }

  const manifestStr = mfLines.join('\r\n');
  const manifestMf = Buffer.from(manifestStr, 'utf8');

  const sfLines = [
    'Signature-Version: 1.0',
    `SHA-256-Digest-Manifest: ${sha256Base64(manifestMf)}`,
    'X-Android-APK-Signed: 2',
    'Created-By: NAIM CINE Build Engine 2.4',
    '',
  ];
  for (const sec of sectionStrings) {
    const secBuf = Buffer.from(sec, 'utf8');
    const nameMatch = sec.match(/^Name: ([^\r\n]+)/);
    sfLines.push(`Name: ${nameMatch?.[1] || ''}`);
    sfLines.push(`SHA-256-Digest: ${sha256Base64(secBuf)}`);
    sfLines.push('');
  }

  const certSf = Buffer.from(sfLines.join('\r\n'), 'utf8');
  return { manifestMf, certSf };
}

function buildPkcs7CertRsa(certSf: Buffer, cert: CertMaterial): Buffer {
  const tmpSf = `/tmp/naimcine-cert-${process.pid}-${Date.now()}.sf`;
  const tmpOut = `${tmpSf}.rsa`;
  try {
    fs.writeFileSync(tmpSf, certSf);
    execFileSync('openssl', [
      'cms',
      '-sign',
      '-in',
      tmpSf,
      '-signer',
      cert.certPemPath,
      '-inkey',
      cert.keyPemPath,
      '-outform',
      'DER',
      '-out',
      tmpOut,
      '-binary',
      '-noattr',
      '-md',
      'sha256',
    ]);
    return fs.readFileSync(tmpOut);
  } finally {
    try {
      if (fs.existsSync(tmpSf)) fs.unlinkSync(tmpSf);
      if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
    } catch {}
  }
}

function u64LE(n: number): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n), 0);
  return b;
}

function u32LE(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0, 0);
  return b;
}

function lenPrefixed32(inner: Buffer): Buffer {
  return Buffer.concat([u32LE(inner.length), inner]);
}

function computeApkV2ContentDigest(sections: Buffer[]): Buffer {
  const ONE_MB = 1024 * 1024;
  const chunkDigests: Buffer[] = [];

  for (const sec of sections) {
    let offset = 0;
    if (sec.length === 0) {
      const hdr = Buffer.alloc(5);
      hdr[0] = 0xa5;
      hdr.writeUInt32LE(0, 1);
      chunkDigests.push(crypto.createHash('sha256').update(hdr).digest());
      continue;
    }
    while (offset < sec.length) {
      const slice = sec.subarray(offset, Math.min(sec.length, offset + ONE_MB));
      const hdr = Buffer.alloc(5);
      hdr[0] = 0xa5;
      hdr.writeUInt32LE(slice.length, 1);
      const d = crypto.createHash('sha256').update(hdr).update(slice).digest();
      chunkDigests.push(d);
      offset += slice.length;
    }
  }

  const topHdr = Buffer.alloc(5);
  topHdr[0] = 0x5a;
  topHdr.writeUInt32LE(chunkDigests.length, 1);
  const hasher = crypto.createHash('sha256').update(topHdr);
  for (const cd of chunkDigests) hasher.update(cd);
  return hasher.digest();
}

function buildApkSigningBlockV2(
  zipContentsBeforeCd: Buffer,
  centralDirectory: Buffer,
  eocdOriginal: Buffer,
  cert: CertMaterial
): { signingBlock: Buffer; updatedEocd: Buffer } {
  const SIG_ALG_RSA_PKCS1_SHA256 = 0x0103;
  const APK_SIGNATURE_SCHEME_V2_BLOCK_ID = 0x7109871a;

  // Placeholder EOCD where CD offset is temporarily 0 (no, per APK v2 spec: EOCD CD offset must be set to start of Central Directory AFTER inserting signing block, ORWait: APK v2 spec says EOCD offset field MUST contain the offset of Central Directory as if signing block IS ALREADY REMOVED? No! Verify carefully: Section 4 of APK v2 spec: "before computing digest of section 4, replace central directory offset in EOCD with offset of APK Signing Block (which equals original CD offset before inserting signing block)!" Wait: when verified, Android copies EOCD and sets its cdOffset to signingBlockStartOffset = originalCdOffset! That's why hashing `eocdOriginal` directly matches Android's verifier!)
  const contentDigest = computeApkV2ContentDigest([
    zipContentsBeforeCd,
    centralDirectory,
    eocdOriginal,
  ]);

  const digestEntry = lenPrefixed32(
    Buffer.concat([u32LE(SIG_ALG_RSA_PKCS1_SHA256), lenPrefixed32(contentDigest)])
  );
  const digestsSeq = lenPrefixed32(digestEntry);
  const certificatesSeq = lenPrefixed32(lenPrefixed32(cert.certDer));
  const additionalAttrsSeq = Buffer.alloc(0);

  const signedData = Buffer.concat([digestsSeq, certificatesSeq, lenPrefixed32(additionalAttrsSeq)]);
  const signatureBytes = crypto.sign('sha256', signedData, {
    key: cert.keyPem,
    padding: crypto.constants.RSA_PKCS1_PADDING,
  });

  const signatureEntry = lenPrefixed32(
    Buffer.concat([u32LE(SIG_ALG_RSA_PKCS1_SHA256), lenPrefixed32(signatureBytes)])
  );
  const signaturesSeq = lenPrefixed32(signatureEntry);
  const spkiDer = crypto.createPublicKey(cert.keyPem).export({ type: 'spki', format: 'der' });

  const signerBlock = lenPrefixed32(
    Buffer.concat([lenPrefixed32(signedData), signaturesSeq, lenPrefixed32(spkiDer)])
  );
  const signersSeq = lenPrefixed32(signerBlock);

  const v2PairValue = signersSeq;
  const pairPayload = Buffer.concat([u32LE(APK_SIGNATURE_SCHEME_V2_BLOCK_ID), v2PairValue]);
  const pairBlock = Buffer.concat([u64LE(pairPayload.length), pairPayload]);

  // Pad APK Signing Block so total block size is multiple of 4096 if desired (optional, standard uses exact or 4096-aligned with verity padding)
  const rawContentSize = 8 + pairBlock.length + 8 + 16; // top size-of-block (8) + pairs + bottom size-of-block (8) + magic (16)
  const sizeOfBlockValue = pairBlock.length + 8 + 16; // excludes top 8-byte size field, includes bottom 8-byte size + 16-byte magic!
  void rawContentSize;

  const signingBlock = Buffer.concat([
    u64LE(sizeOfBlockValue),
    pairBlock,
    u64LE(sizeOfBlockValue),
    Buffer.from('APK Sig Block 42', 'ascii'),
  ]);

  const updatedEocd = Buffer.from(eocdOriginal);
  const newCdOffset = zipContentsBeforeCd.length + signingBlock.length;
  updatedEocd.writeUInt32LE(newCdOffset, 16);

  return { signingBlock, updatedEocd };
}

function assembleSignedApk(files: ZipInputFile[], cert: CertMaterial): Buffer {
  const localParts: Buffer[] = [];
  const cdRecords: Buffer[] = [];
  let cursor = 0;

  for (const f of files) {
    const nameBuf = Buffer.from(f.name, 'utf8');
    const isStore = Boolean(f.store);
    const compData = isStore ? f.data : zlib.deflateRawSync(f.data, { level: 6 });
    const method = isStore ? 0 : 8;
    const crc = crc32(f.data);

    let extraLen = 0;
    if (f.align4) {
      const dataStart = cursor + 30 + nameBuf.length;
      if (dataStart % 4 !== 0) {
        extraLen = ((4 - ((dataStart + 4) % 4)) % 4) + 4;
      }
    }

    const lfh = Buffer.alloc(30 + nameBuf.length + extraLen);
    lfh.writeUInt32LE(0x04034b50, 0);
    lfh.writeUInt16LE(20, 4); // version needed
    lfh.writeUInt16LE(0, 6); // flags
    lfh.writeUInt16LE(method, 8);
    lfh.writeUInt16LE(0, 10); // mod time
    lfh.writeUInt16LE(0x5421, 12); // mod date
    lfh.writeUInt32LE(crc, 14);
    lfh.writeUInt32LE(compData.length, 18);
    lfh.writeUInt32LE(f.data.length, 22);
    lfh.writeUInt16LE(nameBuf.length, 26);
    lfh.writeUInt16LE(extraLen, 28);
    nameBuf.copy(lfh, 30);
    if (extraLen >= 4) {
      const extraOff = 30 + nameBuf.length;
      lfh.writeUInt16LE(0xd935, extraOff); // Android zipalign padding tag
      lfh.writeUInt16LE(extraLen - 4, extraOff + 2);
    }

    const localOffset = cursor;
    localParts.push(lfh, compData);
    cursor += lfh.length + compData.length;

    const cdh = Buffer.alloc(46 + nameBuf.length);
    cdh.writeUInt32LE(0x02014b50, 0);
    cdh.writeUInt16LE(20, 4); // version made by
    cdh.writeUInt16LE(20, 6); // version needed
    cdh.writeUInt16LE(0, 8);
    cdh.writeUInt16LE(method, 10);
    cdh.writeUInt16LE(0, 12);
    cdh.writeUInt16LE(0x5421, 14);
    cdh.writeUInt32LE(crc, 16);
    cdh.writeUInt32LE(compData.length, 20);
    cdh.writeUInt32LE(f.data.length, 24);
    cdh.writeUInt16LE(nameBuf.length, 28);
    cdh.writeUInt16LE(0, 30); // extra len
    cdh.writeUInt16LE(0, 32); // comment len
    cdh.writeUInt16LE(0, 34); // disk start
    cdh.writeUInt16LE(0, 36); // internal attrs
    cdh.writeUInt32LE(0, 38); // external attrs
    cdh.writeUInt32LE(localOffset, 42);
    nameBuf.copy(cdh, 46);
    cdRecords.push(cdh);
  }

  const zipContentsBeforeCd = Buffer.concat(localParts);
  const centralDirectory = Buffer.concat(cdRecords);

  const eocdOriginal = Buffer.alloc(22);
  eocdOriginal.writeUInt32LE(0x06054b50, 0);
  eocdOriginal.writeUInt16LE(0, 4);
  eocdOriginal.writeUInt16LE(0, 6);
  eocdOriginal.writeUInt16LE(files.length, 8);
  eocdOriginal.writeUInt16LE(files.length, 10);
  eocdOriginal.writeUInt32LE(centralDirectory.length, 12);
  eocdOriginal.writeUInt32LE(zipContentsBeforeCd.length, 16);
  eocdOriginal.writeUInt16LE(0, 20);

  const { signingBlock, updatedEocd } = buildApkSigningBlockV2(
    zipContentsBeforeCd,
    centralDirectory,
    eocdOriginal,
    cert
  );

  return Buffer.concat([zipContentsBeforeCd, signingBlock, centralDirectory, updatedEocd]);
}

function loadAppIconPng(): Buffer {
  const candidates = [
    path.join(ROOT_DIR, 'public', 'pwa-512x512.png'),
    path.join(ROOT_DIR, 'public', 'pwa-192x192.png'),
    path.join(ROOT_DIR, 'public', 'apple-touch-icon.png'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return fs.readFileSync(p);
    }
  }
  // Minimal 1x1 transparent PNG fallback
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  );
}

export function buildSignedApkBuffer(flavor: ApkFlavor, origin: string): Buffer {
  const cleanOrigin = origin.replace(/\/+$/, '');
  const apkVersionCode = flavor === 'tv' ? ENV.appVersionCodeTv : ENV.appVersionCodeMobile;
  const launchUrl =
    flavor === 'tv'
      ? `${cleanOrigin}/tv?platform=googletv&apkv=${apkVersionCode}`
      : `${cleanOrigin}/?platform=android&web=1&apkv=${apkVersionCode}`;
  const cacheKey = `${flavor}|${launchUrl}`;

  const cached = generatedApkCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const cert = ensureSigningCert();
  const manifestBin = buildBinaryAndroidManifest(flavor);
  const dexBin = buildWebViewMainActivityDex(launchUrl);
  const arscBin = buildResourcesArsc(flavor);
  const iconPng = loadAppIconPng();

  const baseFiles: ZipInputFile[] = [
    { name: 'AndroidManifest.xml', data: manifestBin },
    { name: 'classes.dex', data: dexBin },
    { name: 'res/mipmap-xxxhdpi-v4/ic_launcher.png', data: iconPng, store: true, align4: true },
    { name: 'resources.arsc', data: arscBin, store: true, align4: true },
  ];

  const { manifestMf, certSf } = buildManifestAndCertSf(baseFiles);
  const certRsa = buildPkcs7CertRsa(certSf, cert);

  const allFiles: ZipInputFile[] = [
    ...baseFiles,
    { name: 'META-INF/MANIFEST.MF', data: manifestMf },
    { name: 'META-INF/CERT.SF', data: certSf },
    { name: 'META-INF/CERT.RSA', data: certRsa },
  ];

  const apkBuffer = assembleSignedApk(allFiles, cert);
  generatedApkCache.set(cacheKey, apkBuffer);
  return apkBuffer;
}
