/**
 * @module tizenConfigGenerator
 * @description Pure generator and validator for Samsung Smart TV (Tizen Web App) config.xml manifests.
 * Follows W3C Widget + Samsung Tizen TV (`tv-samsung` profile) XML specifications.
 */

export interface TizenConfigOptions {
  /** Exact 10-character alphanumeric Tizen package ID (default: RiffanTv01) */
  packageId?: string;
  /** Application binary/class suffix inside <tizen:application> (default: RiffanTV) */
  appSuffix?: string;
  /** Display name on Samsung TV Smart Hub */
  appName?: string;
  /** Semantic widget version (major.minor.patch) */
  version?: string;
  /** Entry point file or URL (default: index.html) */
  contentSrc?: string;
  /** Widget icon path relative to .wgt root (default: icon.png) */
  iconSrc?: string;
  /** Minimum Tizen API version (default: 4.0 for 2018+ Samsung TVs) */
  requiredVersion?: string;
  /** Disable Samsung TV screensaver during playback */
  disableScreenSaver?: boolean;
}

function escapeXml(raw: string): string {
  return String(raw || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Normalizes any string into a valid 10-character Tizen package identifier ([A-Za-z0-9]{10}).
 */
export function normalizeTizenPackageId(raw?: string): string {
  const cleaned = String(raw || '')
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, 10);
  const fallback = 'RiffanTv01';
  if (cleaned.length === 10) return cleaned;
  return (cleaned + fallback).slice(0, 10);
}

/**
 * Normalizes the Tizen application suffix ([A-Za-z][A-Za-z0-9]{1,31}).
 */
export function normalizeTizenAppSuffix(raw?: string): string {
  const cleaned = String(raw || '')
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, 32);
  if (!cleaned || !/^[A-Za-z]/.test(cleaned)) {
    return 'RiffanTV';
  }
  return cleaned;
}

/**
 * Normalizes widget semver string into X.Y.Z format required by Samsung TV packaging tools.
 */
export function normalizeTizenVersion(raw?: string): string {
  const match = String(raw || '').trim().match(/^(\d{1,3})\.(\d{1,3})(?:\.(\d{1,4}))?/);
  if (!match) return '1.0.0';
  return `${Number(match[1])}.${Number(match[2])}.${Number(match[3] || 0)}`;
}

/**
 * Generates a complete, Tizen-compliant `config.xml` string for Samsung Smart TVs.
 */
export function generateTizenConfigXml(options: TizenConfigOptions = {}): string {
  const packageId = normalizeTizenPackageId(options.packageId);
  const appSuffix = normalizeTizenAppSuffix(options.appSuffix);
  const appName = (options.appName || 'RiffanTV').trim().slice(0, 48) || 'RiffanTV';
  const version = normalizeTizenVersion(options.version);
  const contentSrc = (options.contentSrc || 'index.html').trim() || 'index.html';
  const iconSrc = (options.iconSrc || 'icon.png').trim() || 'icon.png';
  const requiredVersion = (options.requiredVersion || '4.0').trim() || '4.0';
  const disableScreenSaver = options.disableScreenSaver !== false;
  const fullAppId = `${packageId}.${appSuffix}`;

  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<widget xmlns="http://www.w3.org/ns/widgets" xmlns:tizen="http://tizen.org/ns/widgets" id="https://riffan.ai.studio/${escapeXml(appSuffix)}" version="${escapeXml(version)}" viewmodes="fullscreen">`,
    `    <access origin="*" subdomains="true"/>`,
    `    <tizen:allow-navigation>*</tizen:allow-navigation>`,
    `    <tizen:application id="${escapeXml(fullAppId)}" package="${escapeXml(packageId)}" required_version="${escapeXml(requiredVersion)}"/>`,
    `    <content src="${escapeXml(contentSrc)}"/>`,
    `    <feature name="http://tizen.org/feature/screen.size.normal.1080.1920"/>`,
    `    <feature name="http://tizen.org/feature/screen.size.all"/>`,
    `    <icon src="${escapeXml(iconSrc)}"/>`,
    `    <tizen:metadata key="http://samsung.com/tv/metadata/prelaunch.support" value="true"/>`,
  ];

  if (disableScreenSaver) {
    lines.push(`    <tizen:metadata key="http://tizen.org/metadata/app/screensaver" value="disable"/>`);
  }

  lines.push(
    `    <name>${escapeXml(appName)}</name>`,
    `    <tizen:privilege name="http://tizen.org/privilege/internet"/>`,
    `    <tizen:privilege name="http://tizen.org/privilege/tv.inputdevice"/>`,
    `    <tizen:privilege name="http://tizen.org/privilege/application.launch"/>`,
    `    <tizen:privilege name="http://tizen.org/privilege/power"/>`,
    `    <tizen:profile name="tv-samsung"/>`,
    `    <tizen:setting screen-orientation="landscape" context-menu="disable" background-support="disable" encryption="disable" install-location="auto" hwkey-event="enable"/>`,
    `</widget>`,
    ''
  );

  return lines.join('\n');
}
