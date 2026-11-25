/**
 * @module src/services/xtreamVaultConfig
 * @description Client-side private vault (_app_vault_cfg in Base64) and import.meta.env.VITE_*
 * collector. Never logs, returns, or renders plaintext usernames, passwords, or server URLs.
 */

export const XTREAM_VAULT_STORAGE_KEY = '_app_vault_cfg';

export interface MaskedVaultSummary {
  hasVault: boolean;
  hasViteEnv: boolean;
  configuredCount: number;
  configuredNames: string[];
  maskedDots: string;
}

const VITE_XTREAM_KEY_MAP = [
  ['XTREAM_SERVER_URL', 'VITE_XTREAM_SERVER_URL'],
  ['XTREAM_ACCOUNTS_JSON', 'VITE_XTREAM_ACCOUNTS_JSON'],
  ['VOD4K_SERVER_URL', 'VITE_VOD4K_SERVER_URL'],
  ['VOD4K_USERNAME', 'VITE_VOD4K_USERNAME'],
  ['VOD4K_PASSWORD', 'VITE_VOD4K_PASSWORD'],
  ['EXTRA_PROVIDERS_JSON', 'VITE_EXTRA_PROVIDERS_JSON'],
  ['DANA4K_SERVER_URL', 'VITE_DANA4K_SERVER_URL'],
  ['DANA4K_ACCOUNTS_JSON', 'VITE_DANA4K_ACCOUNTS_JSON'],
  ['DANA4K_USERNAME', 'VITE_DANA4K_USERNAME'],
  ['DANA4K_PASSWORD', 'VITE_DANA4K_PASSWORD'],
  ['ACTIVE_CDNS_SERVER_URL', 'VITE_ACTIVE_CDNS_SERVER_URL'],
  ['ACTIVE_CDNS_USERNAME', 'VITE_ACTIVE_CDNS_USERNAME'],
  ['ACTIVE_CDNS_PASSWORD', 'VITE_ACTIVE_CDNS_PASSWORD'],
  ['OCTOPUS_SERVER_URL', 'VITE_OCTOPUS_SERVER_URL'],
  ['OCTOPUS_USERNAME', 'VITE_OCTOPUS_USERNAME'],
  ['OCTOPUS_PASSWORD', 'VITE_OCTOPUS_PASSWORD'],
] as const;

export function encodeVaultBase64(plainText: string): string {
  const bytes = new TextEncoder().encode(plainText);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function decodeVaultBase64(b64: string): string {
  const binary = atob(b64.trim());
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

function getViteEnvObject(): Record<string, string> {
  const metaEnv =
    (typeof import.meta !== 'undefined' &&
      (import.meta as unknown as { env?: Record<string, unknown> }).env) ||
    {};
  const out: Record<string, string> = {};
  for (const [stdKey, viteKey] of VITE_XTREAM_KEY_MAP) {
    const val = metaEnv[viteKey];
    if (typeof val === 'string' && val.trim().length > 0) {
      out[stdKey] = val;
    }
  }
  return out;
}

export function readStoredVaultBase64(): string {
  if (typeof window === 'undefined' || !window.localStorage) return '';
  try {
    return String(window.localStorage.getItem(XTREAM_VAULT_STORAGE_KEY) || '').trim();
  } catch {
    return '';
  }
}

function inspectConfiguredNames(obj: Record<string, unknown>): string[] {
  const names = new Set<string>();
  const has = (k: string) => {
    const v = obj[k] ?? obj[`VITE_${k}`];
    if (typeof v === 'string') return v.trim().length > 0;
    if (Array.isArray(v)) return v.length > 0;
    return Boolean(v);
  };

  if (has('XTREAM_ACCOUNTS_JSON') || obj.primary || obj.sharkpro) names.add('Principal');
  if ((has('VOD4K_USERNAME') && has('VOD4K_PASSWORD')) || obj.vod4k) names.add('VOD 4K');
  if (has('DANA4K_ACCOUNTS_JSON') || (has('DANA4K_USERNAME') && has('DANA4K_PASSWORD')) || obj.dana4k) {
    names.add('Dana 4K');
  }
  if ((has('ACTIVE_CDNS_USERNAME') && has('ACTIVE_CDNS_PASSWORD')) || obj.activecdns) {
    names.add('Active CDNS');
  }
  if ((has('OCTOPUS_USERNAME') && has('OCTOPUS_PASSWORD')) || obj.octopus || obj.octopustv) {
    names.add('Octopus TV');
  }

  const extraRaw = obj.EXTRA_PROVIDERS_JSON ?? obj.VITE_EXTRA_PROVIDERS_JSON;
  let extraArr: unknown[] = [];
  if (Array.isArray(extraRaw)) extraArr = extraRaw;
  else if (typeof extraRaw === 'string' && extraRaw.trim()) {
    try {
      const p = JSON.parse(extraRaw) as unknown;
      if (Array.isArray(p)) extraArr = p;
    } catch {
      // ignore
    }
  }
  for (const item of extraArr) {
    if (item && typeof item === 'object') {
      const r = item as Record<string, unknown>;
      const label = String(r.name || r.id || '').trim();
      const hasAcc =
        (Array.isArray(r.accounts) && r.accounts.length > 0) ||
        Boolean(r.user || r.username);
      if (label && hasAcc) names.add(label);
    }
  }

  if (obj['24tv']) names.add('24TV');
  if (obj['2m2h']) names.add('2M2H');

  if (Array.isArray(obj.providers)) {
    for (const item of obj.providers) {
      if (item && typeof item === 'object') {
        const r = item as Record<string, unknown>;
        const label = String(r.name || r.id || '').trim();
        if (label) names.add(label);
      }
    }
  }

  return Array.from(names);
}

export function getMaskedVaultSummary(): MaskedVaultSummary {
  const viteObj = getViteEnvObject();
  const viteNames = inspectConfiguredNames(viteObj);
  const b64 = readStoredVaultBase64();

  let vaultNames: string[] = [];
  if (b64) {
    try {
      const parsed = JSON.parse(decodeVaultBase64(b64)) as unknown;
      if (Array.isArray(parsed)) {
        vaultNames = inspectConfiguredNames({ EXTRA_PROVIDERS_JSON: parsed });
      } else if (parsed && typeof parsed === 'object') {
        vaultNames = inspectConfiguredNames(parsed as Record<string, unknown>);
      }
    } catch {
      vaultNames = [];
    }
  }

  const combined = Array.from(new Set([...vaultNames, ...viteNames]));
  return {
    hasVault: b64.length > 0,
    hasViteEnv: Object.keys(viteObj).length > 0,
    configuredCount: combined.length,
    configuredNames: combined,
    maskedDots: '••••••••',
  };
}

let lastSyncedFingerprint = '';
let inflightVaultSync: Promise<boolean> | null = null;

export async function ensureVaultSyncedWithBackend(force = false): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  const vaultB64 = readStoredVaultBase64();
  const viteObj = getViteEnvObject();
  const viteEnvB64 = Object.keys(viteObj).length > 0 ? encodeVaultBase64(JSON.stringify(viteObj)) : '';

  if (!vaultB64 && !viteEnvB64) {
    return false;
  }

  const fp = `${vaultB64.length}:${vaultB64.slice(0, 12)}:${viteEnvB64.length}:${viteEnvB64.slice(0, 12)}`;
  if (!force && lastSyncedFingerprint === fp) {
    return true;
  }
  if (!force && inflightVaultSync) {
    return inflightVaultSync;
  }

  const run = async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/xtream/vault/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          ...(vaultB64 ? { vaultB64 } : {}),
          ...(viteEnvB64 ? { viteEnvB64 } : {}),
          autoSync: true,
        }),
      });
      if (res.ok) {
        lastSyncedFingerprint = fp;
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const task = run().finally(() => {
    if (inflightVaultSync === task) inflightVaultSync = null;
  });
  inflightVaultSync = task;
  return task;
}

export async function savePrivateVaultJson(rawInput: string): Promise<{
  ok: boolean;
  configuredNames?: string[];
  error?: string;
}> {
  const trimmed = String(rawInput || '').trim();
  if (!trimmed) {
    return { ok: false, error: 'Pega un bloque JSON válido antes de guardar.' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, error: 'El texto pegado no es un JSON válido.' };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'El JSON debe ser un objeto o array de proveedores.' };
  }

  const names = Array.isArray(parsed)
    ? inspectConfiguredNames({ EXTRA_PROVIDERS_JSON: parsed })
    : inspectConfiguredNames(parsed as Record<string, unknown>);

  const canonicalJson = JSON.stringify(parsed);
  const b64 = encodeVaultBase64(canonicalJson);

  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(XTREAM_VAULT_STORAGE_KEY, b64);
  }

  lastSyncedFingerprint = '';
  const viteObj = getViteEnvObject();
  const viteEnvB64 = Object.keys(viteObj).length > 0 ? encodeVaultBase64(JSON.stringify(viteObj)) : '';

  try {
    const res = await fetch('/api/xtream/vault/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({
        vaultB64: b64,
        ...(viteEnvB64 ? { viteEnvB64 } : {}),
        autoSync: true,
      }),
    });
    const json = (await res.json().catch(() => null)) as {
      success?: boolean;
      error?: string;
    } | null;

    if (!res.ok || !json?.success) {
      return {
        ok: false,
        error: json?.error || 'No se pudo validar la bóveda privada en el servidor.',
      };
    }

    lastSyncedFingerprint = `${b64.length}:${b64.slice(0, 12)}:${viteEnvB64.length}:${viteEnvB64.slice(0, 12)}`;
    return {
      ok: true,
      configuredNames: names,
    };
  } catch {
    return {
      ok: false,
      error: 'Error de red sincronizando la bóveda privada.',
    };
  }
}

export async function clearPrivateVault(): Promise<void> {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.removeItem(XTREAM_VAULT_STORAGE_KEY);
  }
  lastSyncedFingerprint = '';
  try {
    await fetch('/api/xtream/vault/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ clear: true }),
    });
  } catch {
    // ignore
  }
}
