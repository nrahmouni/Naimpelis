import crypto from 'crypto';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { ENV } from '../../config/env.ts';
import { crc32 } from './androidBinaryXmlAndArsc.ts';

export interface CertMaterial {
  keyPem: string;
  certDer: Buffer;
  certPemPath: string;
  keyPemPath: string;
}

export interface ZipInputFile {
  name: string;
  data: Buffer;
  store?: boolean;
  align4?: boolean;
}

let cachedCertMaterial: CertMaterial | null = null;

export function ensureSigningCert(): CertMaterial {
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
      '/CN=NAIMCINE/O=NAIMCINE Media/C=ES',
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

function sha256Base64(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('base64');
}

export function buildManifestAndCertSf(files: { name: string; data: Buffer }[]): {
  manifestMf: Buffer;
  certSf: Buffer;
} {
  const mfLines = [
    'Manifest-Version: 1.0',
    'Created-By: NAIMCINE Build Engine 3.1',
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
    'Created-By: NAIMCINE Build Engine 3.1',
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

export function buildPkcs7CertRsa(certSf: Buffer, cert: CertMaterial): Buffer {
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

  const sizeOfBlockValue = pairBlock.length + 8 + 16;

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

export function assembleSignedApk(files: ZipInputFile[], cert: CertMaterial): Buffer {
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
    lfh.writeUInt16LE(20, 4);
    lfh.writeUInt16LE(0, 6);
    lfh.writeUInt16LE(method, 8);
    lfh.writeUInt16LE(0, 10);
    lfh.writeUInt16LE(0x5421, 12);
    lfh.writeUInt32LE(crc, 14);
    lfh.writeUInt32LE(compData.length, 18);
    lfh.writeUInt32LE(f.data.length, 22);
    lfh.writeUInt16LE(nameBuf.length, 26);
    lfh.writeUInt16LE(extraLen, 28);
    nameBuf.copy(lfh, 30);
    if (extraLen >= 4) {
      const extraOff = 30 + nameBuf.length;
      lfh.writeUInt16LE(0xd935, extraOff);
      lfh.writeUInt16LE(extraLen - 4, extraOff + 2);
    }

    const localOffset = cursor;
    localParts.push(lfh, compData);
    cursor += lfh.length + compData.length;

    const cdh = Buffer.alloc(46 + nameBuf.length);
    cdh.writeUInt32LE(0x02014b50, 0);
    cdh.writeUInt16LE(20, 4);
    cdh.writeUInt16LE(20, 6);
    cdh.writeUInt16LE(0, 8);
    cdh.writeUInt16LE(method, 10);
    cdh.writeUInt16LE(0, 12);
    cdh.writeUInt16LE(0x5421, 14);
    cdh.writeUInt32LE(crc, 16);
    cdh.writeUInt32LE(compData.length, 20);
    cdh.writeUInt32LE(f.data.length, 24);
    cdh.writeUInt16LE(nameBuf.length, 28);
    cdh.writeUInt16LE(0, 30);
    cdh.writeUInt16LE(0, 32);
    cdh.writeUInt16LE(0, 34);
    cdh.writeUInt16LE(0, 36);
    cdh.writeUInt32LE(0, 38);
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
