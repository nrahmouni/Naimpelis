import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { ROOT_DIR } from '../config/env.ts';
import { LruTtlCache } from '../utils/lruCache.ts';
import { logger } from '../utils/logger.ts';

export interface VerifiedFirebaseUser {
  uid: string;
  email?: string;
  emailVerified: boolean;
  name?: string;
}

const GOOGLE_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

const certsCache = new LruTtlCache<string, Record<string, string>>(4, 3_600_000);
const verifiedTokenCache = new LruTtlCache<string, VerifiedFirebaseUser>(500, 300_000);

function getFirebaseProjectId(): string {
  try {
    const cfgPath = path.join(ROOT_DIR, 'firebase-applet-config.json');
    if (fs.existsSync(cfgPath)) {
      const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf8')) as { projectId?: string };
      if (parsed.projectId) return parsed.projectId;
    }
  } catch {
    // ignore
  }
  return process.env.FIREBASE_PROJECT_ID || 'gen-lang-client-0607587118';
}

function decodeBase64Url(input: string): Buffer {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + '='.repeat(padLen), 'base64');
}

async function fetchGooglePublicCerts(): Promise<Record<string, string>> {
  const cached = certsCache.get('google_x509');
  if (cached) return cached;

  const res = await fetch(GOOGLE_CERTS_URL, {
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch Google public certs: ${res.status}`);
  }
  const json = (await res.json()) as Record<string, string>;
  certsCache.set('google_x509', json);
  return json;
}

/**
 * Verifies a Firebase ID Token (RS256 JWT) against Google's public x509 certificates
 * without requiring a Firebase Admin service account private key.
 */
export async function verifyFirebaseIdToken(
  idToken: string
): Promise<VerifiedFirebaseUser | null> {
  const token = String(idToken || '').trim();
  if (!token || token.length > 4096) return null;

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const cached = verifiedTokenCache.get(tokenHash);
  if (cached) return cached;

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  let header: { alg?: string; kid?: string };
  let payload: {
    iss?: string;
    aud?: string;
    sub?: string;
    user_id?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    exp?: number;
    iat?: number;
    auth_time?: number;
  };

  try {
    header = JSON.parse(decodeBase64Url(parts[0]).toString('utf8'));
    payload = JSON.parse(decodeBase64Url(parts[1]).toString('utf8'));
  } catch {
    return null;
  }

  if (header.alg !== 'RS256' || !header.kid) return null;

  const projectId = getFirebaseProjectId();
  const nowSec = Math.floor(Date.now() / 1000);
  const uid = String(payload.sub || payload.user_id || '').trim();

  if (
    !uid ||
    uid.length > 128 ||
    payload.aud !== projectId ||
    payload.iss !== `https://securetoken.google.com/${projectId}` ||
    typeof payload.exp !== 'number' ||
    payload.exp <= nowSec - 30 ||
    typeof payload.iat !== 'number' ||
    payload.iat > nowSec + 300
  ) {
    return null;
  }

  try {
    let certs = await fetchGooglePublicCerts();
    let pem = certs[header.kid];
    if (!pem) {
      certsCache.delete('google_x509');
      certs = await fetchGooglePublicCerts();
      pem = certs[header.kid];
    }
    if (!pem) return null;

    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(`${parts[0]}.${parts[1]}`);
    verifier.end();
    const signature = decodeBase64Url(parts[2]);
    if (!verifier.verify(pem, signature)) {
      return null;
    }

    const verified: VerifiedFirebaseUser = {
      uid,
      email: typeof payload.email === 'string' ? payload.email : undefined,
      emailVerified: Boolean(payload.email_verified),
      name: typeof payload.name === 'string' ? payload.name : undefined,
    };
    const ttlMs = Math.max(5_000, Math.min(300_000, (payload.exp - nowSec) * 1000));
    verifiedTokenCache.set(tokenHash, verified, ttlMs);
    return verified;
  } catch (err) {
    logger.warn({ err }, 'firebase_id_token_verify_failed');
    return null;
  }
}
