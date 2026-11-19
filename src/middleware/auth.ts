import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import firebaseConfig from '../../firebase-applet-config.json' with { type: 'json' };
import { firebaseAdminAuth } from '../lib/firebase-admin.ts';
import { getOrCreateUser } from '../db/repository.ts';

export interface AuthenticatedUser {
  uid: string;
  email: string;
  name?: string;
  picture?: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

const CLOUD_TOKEN_PREFIX = 'riffan_cloud_';
const CLOUD_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function getCloudAuthSecret(): string {
  const fromEnv = String(process.env.CLOUD_AUTH_SECRET || '').trim();
  if (fromEnv.length >= 16) return fromEnv;
  return crypto
    .createHash('sha256')
    .update(`riffantv-cloud-auth:${firebaseConfig.projectId}:${firebaseConfig.apiKey}`)
    .digest('hex');
}

export function createSignedCloudToken(user: AuthenticatedUser): string {
  const payload = {
    uid: user.uid,
    email: user.email,
    name: user.name || undefined,
    picture: user.picture || undefined,
    iat: Date.now(),
    exp: Date.now() + CLOUD_TOKEN_TTL_MS,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getCloudAuthSecret())
    .update(payloadB64)
    .digest('base64url');
  return `${CLOUD_TOKEN_PREFIX}${payloadB64}.${sig}`;
}

export function verifySignedCloudToken(token: string): AuthenticatedUser | null {
  if (!token.startsWith(CLOUD_TOKEN_PREFIX)) return null;
  const rest = token.slice(CLOUD_TOKEN_PREFIX.length);
  const dotIdx = rest.indexOf('.');
  if (dotIdx <= 0) return null;

  const payloadB64 = rest.slice(0, dotIdx);
  const sigB64 = rest.slice(dotIdx + 1);
  if (!payloadB64 || !sigB64) return null;

  const expectedSig = crypto
    .createHmac('sha256', getCloudAuthSecret())
    .update(payloadB64)
    .digest('base64url');

  const a = Buffer.from(sigB64);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
      uid?: unknown;
      email?: unknown;
      name?: unknown;
      picture?: unknown;
      exp?: unknown;
    };
    if (typeof decoded.uid !== 'string' || !decoded.uid) return null;
    if (typeof decoded.exp === 'number' && decoded.exp < Date.now()) return null;
    const email =
      typeof decoded.email === 'string' && decoded.email
        ? decoded.email
        : `${decoded.uid}@riffantv.cloud`;
    return {
      uid: decoded.uid,
      email,
      name: typeof decoded.name === 'string' ? decoded.name : undefined,
      picture: typeof decoded.picture === 'string' ? decoded.picture : undefined,
    };
  } catch {
    return null;
  }
}

export async function verifyFirebaseIdTokenToUser(
  idToken: string
): Promise<AuthenticatedUser | null> {
  try {
    const decoded = await firebaseAdminAuth.verifyIdToken(idToken);
    const uid = decoded.uid;
    const email = decoded.email || `${uid}@riffantv.user`;
    const name = typeof decoded.name === 'string' ? decoded.name : undefined;
    const picture = typeof decoded.picture === 'string' ? decoded.picture : undefined;
    return { uid, email, name, picture };
  } catch {
    return null;
  }
}

async function resolveUserFromAuthHeader(req: Request): Promise<AuthenticatedUser | null> {
  const authHeader = String(req.headers.authorization || '');
  const customUidHeader = String(
    req.headers['x-riffan-user-id'] || req.headers['x-user-id'] || ''
  ).trim();

  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) {
      if (token.startsWith(CLOUD_TOKEN_PREFIX)) {
        const verifiedCloudUser = verifySignedCloudToken(token);
        if (verifiedCloudUser) {
          await getOrCreateUser({
            uid: verifiedCloudUser.uid,
            email: verifiedCloudUser.email,
            displayName: verifiedCloudUser.name || null,
            photoUrl: verifiedCloudUser.picture || null,
          }).catch(() => {});
          return verifiedCloudUser;
        }
      }

      if (token.startsWith('riffan_profile_') || token.startsWith('cloud_')) {
        const uid = token.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
        if (uid) {
          const email = `${uid}@riffantv.cloud`;
          await getOrCreateUser({
            uid,
            email,
            displayName: null,
            photoUrl: null,
          }).catch(() => {});
          return { uid, email, name: 'Cineasta' };
        }
      }

      const firebaseUser = await verifyFirebaseIdTokenToUser(token);
      if (firebaseUser) {
        await getOrCreateUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.name || null,
          photoUrl: firebaseUser.picture || null,
        }).catch((err) => {
          console.warn(
            'getOrCreateUser sync skipped:',
            err instanceof Error ? err.message : String(err)
          );
        });

        return firebaseUser;
      }
    }
  }

  if (customUidHeader && /^[a-zA-Z0-9_-]{3,64}$/.test(customUidHeader)) {
    const email = `${customUidHeader}@riffantv.cloud`;
    await getOrCreateUser({
      uid: customUidHeader,
      email,
      displayName: null,
      photoUrl: null,
    }).catch(() => {});
    return { uid: customUidHeader, email, name: 'Cineasta' };
  }

  return null;
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const user = await resolveUserFromAuthHeader(req);
    if (!user) {
      res.status(401).json({ ok: false, error: 'Inicia sesión con Google para usar esta función.' });
      return;
    }
    req.user = user;
    next();
  } catch {
    res.status(401).json({ ok: false, error: 'Sesión expirada o token inválido.' });
  }
}

export async function optionalAuth(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const user = await resolveUserFromAuthHeader(req);
    if (user) req.user = user;
  } catch {
    // Allow unauthenticated fallback when optional
  }
  next();
}
