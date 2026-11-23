/**
 * @module webosConfigGenerator
 * @description Pure generator and validator for LG webOS Smart TV `appinfo.json` manifests.
 * Supports legacy LG TVs (webOS 3.0 - 5.0, Chromium 38 - 68) and modern LG TVs (webOS 6.0 - 24+, Chromium 79+).
 */

export const PUBLISHED_RIFFAN_ORIGIN = 'https://riffan.ai.studio';

export function isEphemeralPreviewHost(hostname?: string): boolean {
  const host = String(hostname || '').trim().toLowerCase();
  if (!host) return true;
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host.startsWith('ais-dev-') ||
    host.startsWith('ais-pre-') ||
    host.endsWith('.run.app')
  );
}

export function resolvePublishedRiffanOrigin(rawOrigin?: string): string {
  const candidate = String(rawOrigin || '').trim().replace(/\/+$/, '');
  if (!candidate) {
    if (typeof window !== 'undefined' && window.location?.origin?.startsWith('http')) {
      return isEphemeralPreviewHost(window.location.hostname)
        ? PUBLISHED_RIFFAN_ORIGIN
        : window.location.origin.replace(/\/+$/, '');
    }
    return PUBLISHED_RIFFAN_ORIGIN;
  }
  try {
    const parsed = new URL(candidate);
    if (isEphemeralPreviewHost(parsed.hostname)) {
      return PUBLISHED_RIFFAN_ORIGIN;
    }
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return PUBLISHED_RIFFAN_ORIGIN;
  }
}

export type WebOsTargetTier = 'universal' | 'legacy' | 'modern';

export interface WebOsAppInfoOptions {
  /** Reverse-DNS LG webOS app ID ([a-z0-9][a-z0-9.-]*, default: com.riffantv.webos) */
  appId?: string;
  /** Semantic version X.Y.Z required by ares-package / LG Seller Lounge */
  version?: string;
  /** Display title shown in LG Launcher / Home Deck */
  appName?: string;
  /** Publisher / vendor string */
  vendor?: string;
  /** Entry HTML file (default: index.html) */
  mainFile?: string;
  /** Small 80x80 icon filename (default: icon.png) */
  iconFile?: string;
  /** Large 130x130+ icon filename (default: largeIcon.png) */
  largeIconFile?: string;
  /** Target compatibility profile across old & new LG webOS releases */
  targetTier?: WebOsTargetTier;
}

export interface WebOsCompatibilityRow {
  era: string;
  webOsVersions: string;
  chromiumEngine: string;
  recommendedTier: WebOsTargetTier;
  installMethod: string;
  notes: string;
}

export const WEBOS_COMPATIBILITY_MATRIX: WebOsCompatibilityRow[] = [
  {
    era: 'LG Antiguas (2016 – 2018)',
    webOsVersions: 'webOS 3.0 / 3.5 / 4.0',
    chromiumEngine: 'Chromium 38 – 53 (ES5)',
    recommendedTier: 'legacy',
    installMethod: 'Developer Mode / Homebrew / .ipk Universal ES5',
    notes: 'Motor estricto ES5 sin módulos ES6 ni Fetch; usa XHR + flex con prefijo -webkit-.',
  },
  {
    era: 'LG Intermedias (2019 – 2020)',
    webOsVersions: 'webOS 4.5 / 5.0',
    chromiumEngine: 'Chromium 53 – 68',
    recommendedTier: 'universal',
    installMethod: 'Developer Mode + webOS Dev Manager / .ipk Universal',
    notes: 'Soporta lanzador universal ligero (~70 KB) con Magic Remote 461 y TLS estándar.',
  },
  {
    era: 'LG Nuevas OLED / QNED (2021 – 2025+)',
    webOsVersions: 'webOS 6.0 / 22 / 23 / 24+',
    chromiumEngine: 'Chromium 79 – 120+ (ES2020)',
    recommendedTier: 'modern',
    installMethod: 'webOS Dev Manager / ares-install / .ipk Offline o Universal',
    notes: 'Compatible tanto con Universal (.ipk ligero) como con Paquete Offline SPA completo.',
  },
];

/**
 * Normalizes any string into a valid lowercase reverse-DNS LG webOS App ID.
 * LG `ares-package` rejects uppercase letters, underscores, or spaces.
 */
export function normalizeWebOsAppId(raw?: string): string {
  const cleaned = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-')
    .replace(/[^a-z0-9.-]/g, '')
    .replace(/\.{2,}/g, '.')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, 64);

  if (!cleaned || cleaned.length < 3 || !cleaned.includes('.')) {
    if (!cleaned) return 'com.riffantv.webos';
    const compact = cleaned.replace(/\./g, '').slice(0, 24) || 'riffantv';
    return `com.${compact}.webos`;
  }
  return cleaned;
}

/**
 * Normalizes LG webOS version string into X.Y.Z format (default: 1.0.0).
 */
export function normalizeWebOsVersion(raw?: string): string {
  const match = String(raw || '').trim().match(/^(\d{1,3})\.(\d{1,3})(?:\.(\d{1,4}))?/);
  if (!match) return '1.0.0';
  return `${Number(match[1])}.${Number(match[2])}.${Number(match[3] || 0)}`;
}

/**
 * Builds the canonical LG webOS `appinfo.json` object compatible with webOS 3.0 through webOS 24+.
 */
export function buildWebOsAppInfoObject(options: WebOsAppInfoOptions = {}): Record<string, unknown> {
  const id = normalizeWebOsAppId(options.appId);
  const version = normalizeWebOsVersion(options.version);
  const title = (options.appName || 'RiffanTV').trim().slice(0, 48) || 'RiffanTV';
  const vendor = (options.vendor || 'RiffanTV').trim().slice(0, 48) || 'RiffanTV';
  const main = (options.mainFile || 'index.html').trim() || 'index.html';
  const icon = (options.iconFile || 'icon.png').trim() || 'icon.png';
  const largeIcon = (options.largeIconFile || 'largeIcon.png').trim() || 'largeIcon.png';
  const tier: WebOsTargetTier = options.targetTier || 'universal';

  const manifest: Record<string, unknown> = {
    id,
    version,
    vendor,
    type: 'web',
    main,
    title,
    icon,
    largeIcon,
    bgColor: '#000000',
    iconColor: '#7C3AED',
    splashBackground: icon,
    transparent: false,
    disableBackHistoryAPI: true,
    handlesRelaunch: true,
    resolution: '1920x1080',
    supportMouse: true,
    enableKeyboard: true,
    uiRevision: 2,
    requiredPermissions: ['time.query', 'activity.operation', 'application.operation'],
  };

  if (tier === 'modern') {
    manifest.allowVideoOnMiniView = true;
    manifest.supportsAudioGuidance = true;
  }

  return manifest;
}

export function generateWebOsAppInfoJson(options: WebOsAppInfoOptions = {}): string {
  return `${JSON.stringify(buildWebOsAppInfoObject(options), null, 2)}\n`;
}
