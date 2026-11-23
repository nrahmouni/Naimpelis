/**
 * @module webosIpkBuilder
 * @description Browser & server LG webOS TV (.ipk + .zip) packager for BOTH legacy (webOS 3.0-5.0, ES5)
 * and modern (webOS 6.0 / 22 / 23 / 24+) LG Smart TVs.
 */
import { packWebOsIpkBinary, type IpkInputFile } from './debianIpkPacker.ts';
import {
  PUBLISHED_RIFFAN_ORIGIN,
  generateWebOsAppInfoJson,
  normalizeWebOsAppId,
  normalizeWebOsVersion,
  resolvePublishedRiffanOrigin,
  type WebOsTargetTier,
} from './webosConfigGenerator.ts';

export type WebOsArchiveFormat = 'ipk' | 'zip';
export type WebOsPackageMode = 'universal_launcher' | 'modern_bundle';

export interface BuildWebOsPackageOptions {
  appName?: string;
  appId?: string;
  version?: string;
  targetOrigin?: string;
  targetTier?: WebOsTargetTier;
  packageMode?: WebOsPackageMode;
  archiveFormat?: WebOsArchiveFormat;
  onProgress?: (stepLabel: string, progressPct: number) => void;
}

export interface BuildWebOsPackageResult {
  blob: Blob;
  bytes: Uint8Array;
  filename: string;
  appId: string;
  appName: string;
  version: string;
  appInfoJson: string;
  targetTier: WebOsTargetTier;
  archiveFormat: WebOsArchiveFormat;
  packageMode: WebOsPackageMode;
  fileCount: number;
  byteSize: number;
  usedFallbackCanvasIcon: boolean;
  sourceKind: 'dist' | 'hybrid-fallback' | 'universal-launcher';
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const MINIMAL_FALLBACK_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAALElEQVQYV2N8//79fwYGBgZGRkZGBhQAF0NWDWQ2VjV4Q0NDBY4U7hSgAwAA3h0M7M7uU2QAAAAASUVORK5CYII=';

export function hasWebOsPngSignature(bytes: Uint8Array): boolean {
  if (bytes.length < 8) return false;
  for (let i = 0; i < PNG_MAGIC.length; i++) {
    if (bytes[i] !== PNG_MAGIC[i]) return false;
  }
  return true;
}

function encodeUtf8(text: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(text);
  }
  return Uint8Array.from(Buffer.from(text, 'utf8'));
}

function decodeBase64Bytes(b64: string): Uint8Array {
  if (typeof atob === 'function') {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  }
  return Uint8Array.from(Buffer.from(b64, 'base64'));
}

/**
 * Generates an ES5-strict LG webOS runtime shim injected into packaged apps so `file://`
 * pages route `/api/*` requests to targetOrigin and map LG Magic Remote Back (keyCode 461).
 */
export function buildWebOsRuntimeShimScript(
  targetOrigin: string,
  targetTier: WebOsTargetTier = 'universal'
): string {
  const safeOrigin = String(targetOrigin || PUBLISHED_RIFFAN_ORIGIN).replace(/\/+$/, '');
  return [
    '<script>',
    '(function(){',
    '  window.__RIFFAN_WEBOS_APP__ = true;',
    `  window.__RIFFAN_WEBOS_TIER__ = ${JSON.stringify(targetTier)};`,
    `  window.__RIFFAN_API_ORIGIN__ = ${JSON.stringify(safeOrigin)};`,
    '  if (window.location && window.location.protocol === "file:") {',
    '    if (typeof window.fetch === "function") {',
    '      var origFetch = window.fetch;',
    '      window.fetch = function(input, init) {',
    '        if (typeof input === "string" && input.charAt(0) === "/") {',
    `          input = ${JSON.stringify(safeOrigin)} + input;`,
    '        }',
    '        return origFetch.call(this, input, init);',
    '      };',
    '    }',
    '    if (typeof window.XMLHttpRequest === "function" && window.XMLHttpRequest.prototype) {',
    '      var origXhrOpen = window.XMLHttpRequest.prototype.open;',
    '      window.XMLHttpRequest.prototype.open = function(method, url) {',
    '        var nextUrl = (typeof url === "string" && url.charAt(0) === "/") ? (' +
      JSON.stringify(safeOrigin) +
      ' + url) : url;',
    '        var args = Array.prototype.slice.call(arguments);',
    '        args[1] = nextUrl;',
    '        return origXhrOpen.apply(this, args);',
    '      };',
    '    }',
    '  }',
    '})();',
    '</script>',
  ].join('\n');
}

/**
 * Rewrites Vite root-relative `/assets/*`, `/tv/*`, `/vendor/*` URLs to `./*` for LG webOS file:// execution.
 */
export function rewriteHtmlForWebOsFileProtocol(
  html: string,
  targetOrigin: string,
  targetTier: WebOsTargetTier = 'universal'
): string {
  let out = String(html || '');
  out = out
    .replace(/(href|src)=(["'])\/assets\//gi, '$1=$2./assets/')
    .replace(/(href|src)=(["'])\/tv\//gi, '$1=$2./tv/')
    .replace(/(href|src)=(["'])\/vendor\//gi, '$1=$2./vendor/')
    .replace(
      /(href|src)=(["'])\/(favicon[^"']*|apple-touch-icon\.png|icon\.svg|pwa-[^"']*|music-[^"']*|logo-[^"']*|manifest\.webmanifest)(["'])/gi,
      '$1=$2./$3$4'
    )
    .replace(/<script[^>]*src=["']\.?\/registerSW\.js["'][^>]*><\/script>/gi, '');

  const shim = buildWebOsRuntimeShimScript(targetOrigin, targetTier);
  if (out.includes('<head>')) {
    out = out.replace('<head>', `<head>\n${shim}`);
  } else if (out.includes('</head>')) {
    out = out.replace('</head>', `${shim}\n</head>`);
  } else {
    out = `${shim}\n${out}`;
  }
  return out;
}

export interface UniversalWebOsLauncherAssets {
  indexHtml: string;
  appCss: string;
  mainJs: string;
  webOsStubJs: string;
}

/**
 * Builds strict ES5 + Chromium 38-compatible launcher assets (`index.html`, `app.css`, `main.js`)
 * that run identically on BOTH older LG TVs (webOS 3.0 - 5.0) and modern LG OLED/QNED TVs (webOS 6 - 24+).
 */
export function buildUniversalWebOsLauncherAssets(
  appName: string,
  targetOrigin: string,
  targetTier: WebOsTargetTier = 'universal'
): UniversalWebOsLauncherAssets {
  const safeOrigin = String(targetOrigin || PUBLISHED_RIFFAN_ORIGIN).replace(/\/+$/, '');
  const tvReceiverUrl = `${safeOrigin}/tvlg`;
  const fullAppUrl = `${safeOrigin}/?webos=1&tv=1&tier=${encodeURIComponent(targetTier)}`;
  const healthUrl = `${safeOrigin}/api/health`;
  const escapedName = appName.replace(/[<>&"]/g, '');

  const appCss = [
    'html, body {',
    '  margin: 0;',
    '  padding: 0;',
    '  width: 100%;',
    '  height: 100%;',
    '  background-color: #000000;',
    '  color: #ffffff;',
    '  font-family: Arial, Helvetica, sans-serif;',
    '  overflow: hidden;',
    '}',
    '.wrap {',
    '  display: -webkit-box;',
    '  display: -webkit-flex;',
    '  display: flex;',
    '  -webkit-box-orient: vertical;',
    '  -webkit-flex-direction: column;',
    '  flex-direction: column;',
    '  -webkit-box-align: center;',
    '  -webkit-align-items: center;',
    '  align-items: center;',
    '  -webkit-box-pack: center;',
    '  -webkit-justify-content: center;',
    '  justify-content: center;',
    '  width: 100%;',
    '  height: 100%;',
    '  text-align: center;',
    '  padding: 48px;',
    '  box-sizing: border-box;',
    '  background: -webkit-radial-gradient(50% 35%, circle, rgba(124, 58, 237, 0.24) 0%, #000000 68%);',
    '  background: radial-gradient(circle at 50% 35%, rgba(124, 58, 237, 0.24) 0%, #000000 68%);',
    '}',
    '.mark {',
    '  width: 108px;',
    '  height: 108px;',
    '  line-height: 108px;',
    '  border-radius: 26px;',
    '  background-color: #7C3AED;',
    '  color: #ffffff;',
    '  font-size: 54px;',
    '  font-weight: 900;',
    '  margin-bottom: 24px;',
    '  box-shadow: 0 20px 60px rgba(124, 58, 237, 0.5);',
    '}',
    'h1 {',
    '  font-size: 42px;',
    '  margin: 0 0 12px 0;',
    '  color: #ffffff;',
    '}',
    '.sub {',
    '  font-size: 18px;',
    '  color: #a1a1aa;',
    '  margin: 0 0 10px 0;',
    '}',
    '#status-msg {',
    '  font-size: 22px;',
    '  color: #c4b5fd;',
    '  margin: 0 0 28px 0;',
    '  max-width: 780px;',
    '}',
    '.actions {',
    '  text-align: center;',
    '}',
    'button {',
    '  min-width: 260px;',
    '  height: 62px;',
    '  margin: 0 10px;',
    '  padding: 0 28px;',
    '  font-size: 20px;',
    '  font-weight: 700;',
    '  border-radius: 14px;',
    '  border: 2px solid rgba(255, 255, 255, 0.25);',
    '  background-color: #14141c;',
    '  color: #ffffff;',
    '  cursor: pointer;',
    '}',
    'button.primary {',
    '  background-color: #7C3AED;',
    '  border-color: #A78BFA;',
    '}',
    'button:focus, button:hover {',
    '  outline: 3px solid #ffffff;',
    '  background-color: #8B5CF6;',
    '}',
  ].join('\n');

  // Safe lightweight stub for webOSTVjs if a standalone offline environment doesn't inject window.webOS
  const webOsStubJs = [
    '(function(){',
    '  if (typeof window.webOS === "undefined") {',
    '    window.webOS = {',
    '      platformBack: function () {',
    '        try {',
    '          if (window.PalmSystem && window.PalmSystem.platformBack) {',
    '            window.PalmSystem.platformBack();',
    '          } else {',
    '            window.close();',
    '          }',
    '        } catch (e) {}',
    '      }',
    '    };',
    '  }',
    '})();',
  ].join('\n');

  // Strict ES5 JavaScript (var / function only — zero let/const/arrow/optional chaining for Chromium 38 webOS 3.0)
  const mainJs = [
    'window.onload = function () {',
    `  var targetTvUrl = ${JSON.stringify(tvReceiverUrl)};`,
    `  var targetAppUrl = ${JSON.stringify(fullAppUrl)};`,
    `  var healthUrl = ${JSON.stringify(healthUrl)};`,
    '  var statusEl = document.getElementById("status-msg");',
    '  var btnTv = document.getElementById("btn-tv");',
    '  var btnApp = document.getElementById("btn-app");',
    '  var attempts = 0;',
    '  var maxAttempts = 4;',
    '  var launched = false;',
    '',
    '  function launchDestination(baseUrl) {',
    '    if (launched) return;',
    '    launched = true;',
    '    var sep = baseUrl.indexOf("?") === -1 ? "?_t=" : "&_t=";',
    '    window.location.replace(baseUrl + sep + (new Date()).getTime());',
    '  }',
    '',
    '  function exitLgWebOs() {',
    '    try {',
    '      if (window.webOS && typeof window.webOS.platformBack === "function") {',
    '        window.webOS.platformBack();',
    '        return;',
    '      }',
    '      if (window.PalmSystem && typeof window.PalmSystem.platformBack === "function") {',
    '        window.PalmSystem.platformBack();',
    '      }',
    '    } catch (e) {}',
    '  }',
    '',
    '  if (btnTv) {',
    '    btnTv.onclick = function () { launchDestination(targetTvUrl); };',
    '    if (btnTv.focus) btnTv.focus();',
    '  }',
    '  if (btnApp) {',
    '    btnApp.onclick = function () { launchDestination(targetAppUrl); };',
    '  }',
    '',
    '  document.addEventListener("keydown", function (e) {',
    '    var code = e.keyCode || e.which;',
    '    if (code === 13 || code === 23) {',
    '      if (document.activeElement === btnApp) launchDestination(targetAppUrl);',
    '      else launchDestination(targetTvUrl);',
    '    } else if (code === 37 || code === 39) {',
    '      if (document.activeElement === btnTv && btnApp && btnApp.focus) btnApp.focus();',
    '      else if (btnTv && btnTv.focus) btnTv.focus();',
    '    } else if (code === 461 || code === 27) {',
    '      if (e.preventDefault) e.preventDefault();',
    '      exitLgWebOs();',
    '    }',
    '  });',
    '',
    '  function probeServer() {',
    '    if (launched) return;',
    '    attempts += 1;',
    '    if (statusEl) {',
    '      statusEl.textContent = attempts === 1 ? "Conectando LG webOS con RiffanTV..." : "Reconectando Wi-Fi LG TV (" + attempts + "/" + maxAttempts + ")...";',
    '    }',
    '    try {',
    '      var xhr = new XMLHttpRequest();',
    '      xhr.open("GET", healthUrl + "?_=" + (new Date()).getTime(), true);',
    '      xhr.timeout = 6000;',
    '      xhr.onreadystatechange = function () {',
    '        if (xhr.readyState !== 4 || launched) return;',
    '        if (xhr.status >= 200 && xhr.status < 400) {',
    '          if (statusEl) statusEl.textContent = "Conectado. Abriendo RiffanTV LG webOS...";',
    '          setTimeout(function () { launchDestination(targetTvUrl); }, 220);',
    '        } else if (attempts < maxAttempts) {',
    '          setTimeout(probeServer, 1400);',
    '        } else {',
    '          if (statusEl) statusEl.textContent = "Pulsa OK en el Magic Remote para abrir RiffanTV.";',
    '        }',
    '      };',
    '      xhr.onerror = function () {',
    '        if (attempts < maxAttempts) setTimeout(probeServer, 1400);',
    '        else if (statusEl) statusEl.textContent = "Sin red en tu LG TV. Revisa el Wi-Fi y pulsa OK.";',
    '      };',
    '      xhr.ontimeout = function () {',
    '        if (attempts < maxAttempts) setTimeout(probeServer, 1200);',
    '        else launchDestination(targetTvUrl);',
    '      };',
    '      xhr.send();',
    '    } catch (err) {',
    '      launchDestination(targetTvUrl);',
    '    }',
    '  }',
    '',
    '  probeServer();',
    '};',
  ].join('\n');

  const indexHtml = [
    '<!DOCTYPE html>',
    '<html lang="es">',
    '<head>',
    '  <meta charset="UTF-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    `  <title>${escapedName} — LG webOS Smart TV</title>`,
    '  <link rel="stylesheet" href="app.css" />',
    '  <script src="webOSTV.js"></script>',
    '  <script src="main.js"></script>',
    '</head>',
    '<body bgcolor="#000000" text="#FFFFFF">',
    '  <div class="wrap">',
    '    <div class="mark">R</div>',
    `    <h1>${escapedName}</h1>`,
    '    <p class="sub">LG webOS Smart TV · Compatible webOS 3.0 – 24+</p>',
    '    <p id="status-msg">Iniciando receptor LG TV...</p>',
    '    <div class="actions">',
    '      <button id="btn-tv" class="primary" tabindex="0">Abrir RiffanTV Smart TV</button>',
    '      <button id="btn-app" tabindex="0">App Web Completa</button>',
    '    </div>',
    '  </div>',
    '</body>',
    '</html>',
  ].join('\n');

  return { indexHtml, appCss, mainJs, webOsStubJs };
}

export async function createCanvasWebOsIconPng(
  appName = 'RiffanTV',
  size = 130
): Promise<Uint8Array> {
  if (typeof document === 'undefined') {
    return decodeBase64Bytes(MINIMAL_FALLBACK_PNG_B64);
  }
  try {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return decodeBase64Bytes(MINIMAL_FALLBACK_PNG_B64);

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, size, size);

    const grad = ctx.createRadialGradient(size / 2, size * 0.42, size * 0.05, size / 2, size / 2, size * 0.5);
    grad.addColorStop(0, 'rgba(124, 58, 237, 0.56)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    const pad = Math.round(size * 0.14);
    const inner = size - pad * 2;
    ctx.fillStyle = '#12101B';
    ctx.strokeStyle = 'rgba(167, 139, 250, 0.6)';
    ctx.lineWidth = Math.max(2, Math.round(size * 0.025));
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(pad, pad, inner, inner, Math.round(size * 0.18));
    } else {
      ctx.rect(pad, pad, inner, inner);
    }
    ctx.fill();
    ctx.stroke();

    const letter = (appName.trim()[0] || 'R').toUpperCase();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `900 ${Math.round(size * 0.44)}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, size / 2, size * 0.52);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/png');
    });
    if (blob) {
      const buf = new Uint8Array(await blob.arrayBuffer());
      if (hasWebOsPngSignature(buf)) return buf;
    }
  } catch {
    // fallback below
  }
  return decodeBase64Bytes(MINIMAL_FALLBACK_PNG_B64);
}

async function resolveWebOsIcons(appName: string): Promise<{
  icon80Bytes: Uint8Array;
  largeIconBytes: Uint8Array;
  usedFallbackCanvas: boolean;
}> {
  let icon80Bytes: Uint8Array | null = null;
  let largeIconBytes: Uint8Array | null = null;

  if (typeof fetch === 'function' && typeof window !== 'undefined') {
    for (const candidate of ['/pwa-192x192.png', '/pwa-512x512.png']) {
      try {
        const res = await fetch(candidate, { cache: 'force-cache' });
        if (res.ok) {
          const bytes = new Uint8Array(await res.arrayBuffer());
          if (hasWebOsPngSignature(bytes)) {
            if (!icon80Bytes) icon80Bytes = bytes;
            largeIconBytes = bytes;
          }
        }
      } catch {
        // try next
      }
    }
  }

  if (icon80Bytes && largeIconBytes) {
    return { icon80Bytes, largeIconBytes, usedFallbackCanvas: false };
  }

  const smallCanvas = icon80Bytes || (await createCanvasWebOsIconPng(appName, 80));
  const largeCanvas = largeIconBytes || (await createCanvasWebOsIconPng(appName, 130));
  return {
    icon80Bytes: smallCanvas,
    largeIconBytes: largeCanvas,
    usedFallbackCanvas: true,
  };
}

/**
 * Packages an LG webOS `.ipk` (or Ares-ready `.zip`) directly in the browser.
 */
export async function buildWebOsPackageArchive(
  options: BuildWebOsPackageOptions = {}
): Promise<BuildWebOsPackageResult> {
  const appId = normalizeWebOsAppId(options.appId);
  const appName = (options.appName || 'RiffanTV').trim().slice(0, 48) || 'RiffanTV';
  const version = normalizeWebOsVersion(options.version);
  const targetTier: WebOsTargetTier = options.targetTier || 'universal';
  const archiveFormat: WebOsArchiveFormat = options.archiveFormat || 'ipk';
  const packageMode: WebOsPackageMode =
    options.packageMode || (targetTier === 'modern' ? 'modern_bundle' : 'universal_launcher');

  const targetOrigin = (options.targetOrigin
    ? String(options.targetOrigin).trim().replace(/\/+$/, '')
    : resolvePublishedRiffanOrigin());
  const onProgress = options.onProgress;

  onProgress?.('Generando manifiesto LG appinfo.json...', 12);
  const appInfoJson = generateWebOsAppInfoJson({
    appId,
    appName,
    version,
    targetTier,
  });

  onProgress?.('Preparando iconos PNG para LG Launcher...', 24);
  const { icon80Bytes, largeIconBytes, usedFallbackCanvas } = await resolveWebOsIcons(appName);

  const files: IpkInputFile[] = [
    { relPath: 'appinfo.json', bytes: encodeUtf8(appInfoJson) },
    { relPath: 'icon.png', bytes: icon80Bytes },
    { relPath: 'largeIcon.png', bytes: largeIconBytes },
  ];

  let sourceKind: BuildWebOsPackageResult['sourceKind'] = 'universal-launcher';

  if (packageMode === 'modern_bundle' && typeof fetch === 'function' && typeof window !== 'undefined') {
    let bundledDist = false;
    try {
      onProgress?.('Consultando manifiesto SPA compilado...', 40);
      const manifestRes = await fetch('/api/tv/webos-manifest');
      if (manifestRes.ok) {
        const manifest = (await manifestRes.json()) as {
          ok?: boolean;
          mode?: string;
          files?: string[];
        };
        if (manifest.ok && manifest.mode === 'dist' && Array.isArray(manifest.files) && manifest.files.includes('index.html')) {
          sourceKind = 'dist';
          const total = manifest.files.length;
          let done = 0;
          for (const relPath of manifest.files) {
            try {
              const fileRes = await fetch(`/${relPath}`);
              if (!fileRes.ok) continue;
              if (relPath === 'index.html') {
                const rawHtml = await fileRes.text();
                files.push({
                  relPath: 'index.html',
                  bytes: encodeUtf8(rewriteHtmlForWebOsFileProtocol(rawHtml, targetOrigin, targetTier)),
                });
              } else {
                files.push({
                  relPath,
                  bytes: new Uint8Array(await fileRes.arrayBuffer()),
                });
              }
            } catch {
              // skip missing optional file
            } finally {
              done += 1;
              const pct = 42 + Math.round((done / Math.max(1, total)) * 42);
              onProgress?.(`Empaquetando ${relPath} (${done}/${total})...`, pct);
            }
          }
          bundledDist = true;
        }
      }
    } catch {
      // fallback cleanly to universal ES5 launcher
    }

    if (!bundledDist) {
      sourceKind = 'hybrid-fallback';
    }
  }

  if (!files.some((f) => f.relPath === 'index.html')) {
    onProgress?.('Generando lanzador ES5 universal (webOS 3.0 – 24+)...', 65);
    const launcher = buildUniversalWebOsLauncherAssets(appName, targetOrigin, targetTier);
    files.push({ relPath: 'index.html', bytes: encodeUtf8(launcher.indexHtml) });
    files.push({ relPath: 'app.css', bytes: encodeUtf8(launcher.appCss) });
    files.push({ relPath: 'main.js', bytes: encodeUtf8(launcher.mainJs) });
    files.push({ relPath: 'webOSTV.js', bytes: encodeUtf8(launcher.webOsStubJs) });
  }

  let bytes: Uint8Array;
  let mimeType = 'application/octet-stream';

  if (archiveFormat === 'zip') {
    onProgress?.('Comprimiendo proyecto webOS (.zip para ares-package)...', 88);
    const JSZipMod = await import('jszip');
    const JSZip = JSZipMod.default || JSZipMod;
    const zip = new JSZip();
    for (const f of files) {
      zip.file(f.relPath, f.bytes);
    }
    const rawZip = await zip.generateAsync({
      type: 'uint8array',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });
    bytes = new Uint8Array(rawZip);
    mimeType = 'application/zip';
  } else {
    onProgress?.('Empaquetando binario Debian LG webOS (.ipk)...', 90);
    const packedIpk = await packWebOsIpkBinary({
      appId,
      appName,
      version,
      files,
    });
    bytes = new Uint8Array(packedIpk);
  }

  const ext = archiveFormat === 'zip' ? 'zip' : 'ipk';
  const filename = `${appId}_${version}_${targetTier}.${ext}`;
  const blobBytes = new Uint8Array(bytes.byteLength);
  blobBytes.set(bytes);
  const blob = new Blob([blobBytes], { type: mimeType });

  onProgress?.(`Paquete .${ext} listo`, 100);

  return {
    blob,
    bytes,
    filename,
    appId,
    appName,
    version,
    appInfoJson,
    targetTier,
    archiveFormat,
    packageMode,
    fileCount: files.length,
    byteSize: bytes.byteLength,
    usedFallbackCanvasIcon: usedFallbackCanvas,
    sourceKind,
  };
}

export function triggerWebOsDownload(blob: Blob, filename: string): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 1500);
}
