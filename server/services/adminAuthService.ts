import crypto from 'crypto';
import fs from 'fs';
import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import type express from 'express';
import firebaseConfig from '../../firebase-applet-config.json' with { type: 'json' };
import { logger } from '../utils/logger.ts';
import { isDistributedStoreEnabled, loadDistributedKey, saveDistributedKey } from './distributedStore.ts';

const CLAIMED_ADMIN_PATH = '/tmp/riffan-admin-claim-v1.json';
const SESSION_SECRET =
  String(process.env.ADMIN_SESSION_SECRET || '').trim() ||
  crypto.randomBytes(32).toString('hex');

const DEFAULT_ADMIN_EMAILS = ['felipeallouch@gmail.com'];

interface ClaimedAdminRecord {
  salt: string;
  hash: string;
  claimedBy: string;
  claimedAt: number;
}

let inMemoryClaim: ClaimedAdminRecord | null = null;
let claimLoadedFromStore = false;

export interface AdminSessionClaims {
  sub: string;
  email: string;
  method: 'firebase-google' | 'env-passcode' | 'claimed-passcode';
  iat: number;
  exp: number;
}

function getAllowedAdminEmails(): Set<string> {
  const envList = String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return new Set(envList.length > 0 ? envList : DEFAULT_ADMIN_EMAILS);
}

function ensureFirebaseAuthVerifier() {
  const projectId = String(firebaseConfig?.projectId || '').trim();
  if (!projectId || projectId === 'remixed-project-id') {
    throw new Error('Firebase projectId is not configured');
  }
  const app = getApps().length ? getApp() : initializeApp({ projectId });
  return getAuth(app);
}

async function loadClaimedAdminRecord(): Promise<ClaimedAdminRecord | null> {
  if (inMemoryClaim) return inMemoryClaim;
  if (!claimLoadedFromStore) {
    claimLoadedFromStore = true;
    try {
      if (fs.existsSync(CLAIMED_ADMIN_PATH)) {
        const raw = await fs.promises.readFile(CLAIMED_ADMIN_PATH, 'utf8');
        const parsed = JSON.parse(raw) as Partial<ClaimedAdminRecord>;
        if (parsed?.salt && parsed?.hash) {
          inMemoryClaim = {
            salt: parsed.salt,
            hash: parsed.hash,
            claimedBy: parsed.claimedBy || 'admin',
            claimedAt: Number(parsed.claimedAt) || Date.now(),
          };
          return inMemoryClaim;
        }
      }
    } catch {
      // ignore invalid claim cache
    }
    if (isDistributedStoreEnabled()) {
      const remote = await loadDistributedKey<ClaimedAdminRecord>('admin:claimed-cred');
      if (remote?.salt && remote?.hash) {
        inMemoryClaim = remote;
      }
    }
  }
  return inMemoryClaim;
}

function hashPasscodeScrypt(passcode: string, saltHex?: string): { salt: string; hash: string } {
  const salt = saltHex || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(passcode, salt, 64).toString('hex');
  return { salt, hash: derived };
}

function constantTimeStringMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export async function getAdminAuthStatus() {
  const envPasscode = String(process.env.ADMIN_PASSCODE || '').trim();
  const claimed = await loadClaimedAdminRecord();
  return {
    firebaseGoogleEnabled: true,
    passcodeConfiguredByEnv: Boolean(envPasscode),
    firstRunClaimRequired: !envPasscode && !claimed,
    passcodeClaimed: Boolean(envPasscode || claimed),
    allowedAdminCount: getAllowedAdminEmails().size,
  };
}

export async function claimInitialAdminPasscode(
  passcode: string,
  label = 'admin'
): Promise<{ ok: true; token: string; claims: AdminSessionClaims } | { ok: false; error: string; status: number }> {
  const envPasscode = String(process.env.ADMIN_PASSCODE || '').trim();
  if (envPasscode) {
    return { ok: false, error: 'Admin passcode ya está configurado por entorno.', status: 409 };
  }
  const existing = await loadClaimedAdminRecord();
  if (existing) {
    return { ok: false, error: 'El acceso admin ya ha sido reclamado previamente.', status: 409 };
  }
  const clean = String(passcode || '').trim();
  if (clean.length < 8 || clean.length > 128) {
    return { ok: false, error: 'La clave debe tener entre 8 y 128 caracteres.', status: 400 };
  }
  const { salt, hash } = hashPasscodeScrypt(clean);
  const record: ClaimedAdminRecord = {
    salt,
    hash,
    claimedBy: String(label || 'admin').slice(0, 60),
    claimedAt: Date.now(),
  };
  inMemoryClaim = record;
  try {
    await fs.promises.writeFile(CLAIMED_ADMIN_PATH, JSON.stringify(record), 'utf8');
  } catch {
    // non-fatal if /tmp read-only
  }
  if (isDistributedStoreEnabled()) {
    void saveDistributedKey('admin:claimed-cred', record, 365 * 86400).catch(() => {});
  }
  const claims: AdminSessionClaims = {
    sub: 'admin-claimed',
    email: record.claimedBy,
    method: 'claimed-passcode',
    iat: Date.now(),
    exp: Date.now() + 12 * 60 * 60 * 1000,
  };
  return { ok: true, token: signAdminSessionToken(claims), claims };
}

export async function verifyAdminPasscode(
  passcode: string
): Promise<{ ok: true; token: string; claims: AdminSessionClaims } | { ok: false; error: string; status: number }> {
  const clean = String(passcode || '').trim();
  if (!clean) {
    return { ok: false, error: 'Introduce la clave de administrador.', status: 400 };
  }

  const envPasscode = String(process.env.ADMIN_PASSCODE || '').trim();
  if (envPasscode) {
    if (!constantTimeStringMatch(clean, envPasscode)) {
      return { ok: false, error: 'Clave de administrador incorrecta.', status: 401 };
    }
    const claims: AdminSessionClaims = {
      sub: 'admin-env',
      email: Array.from(getAllowedAdminEmails())[0] || 'admin@riffantv',
      method: 'env-passcode',
      iat: Date.now(),
      exp: Date.now() + 12 * 60 * 60 * 1000,
    };
    return { ok: true, token: signAdminSessionToken(claims), claims };
  }

  const claimed = await loadClaimedAdminRecord();
  if (!claimed) {
    return {
      ok: false,
      error: 'Aún no se ha configurado clave de administrador inicial.',
      status: 428,
    };
  }
  const { hash } = hashPasscodeScrypt(clean, claimed.salt);
  if (!constantTimeStringMatch(hash, claimed.hash)) {
    return { ok: false, error: 'Clave de administrador incorrecta.', status: 401 };
  }
  const claims: AdminSessionClaims = {
    sub: 'admin-claimed',
    email: claimed.claimedBy,
    method: 'claimed-passcode',
    iat: Date.now(),
    exp: Date.now() + 12 * 60 * 60 * 1000,
  };
  return { ok: true, token: signAdminSessionToken(claims), claims };
}

export async function verifyFirebaseAdminIdToken(
  idToken: string
): Promise<{ ok: true; token: string; claims: AdminSessionClaims } | { ok: false; error: string; status: number }> {
  const cleanToken = String(idToken || '').trim();
  if (!cleanToken) {
    return { ok: false, error: 'Token de sesión Google vacío.', status: 401 };
  }
  try {
    const authVerifier = ensureFirebaseAuthVerifier();
    const decoded = await authVerifier.verifyIdToken(cleanToken);
    const email = String(decoded.email || '').trim().toLowerCase();
    if (!email || decoded.email_verified !== true) {
      return { ok: false, error: 'La cuenta de Google debe tener email verificado.', status: 403 };
    }
    if (!getAllowedAdminEmails().has(email)) {
      return { ok: false, error: 'Cuenta sin permisos de administrador en RiffanTV.', status: 403 };
    }
    const claims: AdminSessionClaims = {
      sub: decoded.uid,
      email,
      method: 'firebase-google',
      iat: Date.now(),
      exp: Date.now() + 12 * 60 * 60 * 1000,
    };
    return { ok: true, token: signAdminSessionToken(claims), claims };
  } catch (err) {
    logger.warn({ err }, 'admin_firebase_id_token_rejected');
    return { ok: false, error: 'Sesión de Firebase inválida o caducada.', status: 401 };
  }
}

export function signAdminSessionToken(claims: AdminSessionClaims): string {
  const payloadB64 = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payloadB64)
    .digest('base64url');
  return `${payloadB64}.${sig}`;
}

export function verifyAdminSessionToken(token: string): AdminSessionClaims | null {
  const parts = String(token || '').trim().split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return null;

  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payloadB64)
    .digest('base64url');
  if (!constantTimeStringMatch(sigB64, expectedSig)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as AdminSessionClaims;
    if (!parsed || typeof parsed.exp !== 'number' || Date.now() > parsed.exp) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function requireAdminRequest(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): Promise<void> {
  const authHeader = String(req.headers.authorization || '').trim();
  const bearer = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
  if (!bearer) {
    res.status(401).json({ ok: false, error: 'Autenticación de administrador requerida.' });
    return;
  }

  const sessionClaims = verifyAdminSessionToken(bearer);
  if (sessionClaims) {
    (req as express.Request & { adminClaims?: AdminSessionClaims }).adminClaims = sessionClaims;
    next();
    return;
  }

  // Also allow direct Firebase ID token as Bearer on API calls
  const firebaseRes = await verifyFirebaseAdminIdToken(bearer);
  if (firebaseRes.ok) {
    (req as express.Request & { adminClaims?: AdminSessionClaims }).adminClaims = firebaseRes.claims;
    next();
    return;
  }

  res.status(401).json({ ok: false, error: 'Token de administrador inválido o caducado.' });
}
