/**
 * @module tizenWgtBuilder
 * @description In-browser Samsung Smart TV (.wgt) ZIP packager using JSZip.
 * Bundles HTML/CSS/JS assets, valid Tizen TV config.xml, and binary PNG icon.png.
 */
import { generateTizenConfigXml, normalizeTizenPackageId } from './tizenConfigGenerator';

export type TizenPackageMode = 'full_bundle' | 'hosted_launcher';

export interface BuildTizenWgtOptions {
  appName?: string;
  packageId?: string;
  version?: string;
  targetOrigin?: string;
  packageMode?: TizenPackageMode;
  onProgress?: (stepLabel: string, progressPct: number) => void;
}

export interface BuildTizenWgtResult {
  blob: Blob;
  bytes: Uint8Array;
  filename: string;
  packageId: string;
  appName: string;
  configXml: string;
  fileCount: number;
  byteSize: number;
  usedFallbackCanvasIcon: boolean;
  mode: TizenPackageMode;
  sourceKind: 'dist' | 'hybrid-fallback' | 'hosted-launcher';
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function hasPngSignature(bytes: Uint8Array): boolean {
  if (bytes.length < 8) return false;
  for (let i = 0; i < PNG_MAGIC.length; i++) {
    if (bytes[i] !== PNG_MAGIC[i]) return false;
  }
  return true;
}

/**
 * Generates an ES5-compatible Samsung Tizen runtime shim injected before other scripts
 * so file:// widgets map API requests safely to targetOrigin and register hardware remote keys.
 */
export function buildTizenRuntimeShimScript(targetOrigin: string): string {
  const safeOrigin = String(targetOrigin || 'https://riffan.ai.studio').replace(/\/+$/, '');
  return [
    '<script>',
    '(function(){',
    '  window.__RIFFAN_TIZEN_WIDGET__ = true;',
    `  window.__RIFFAN_API_ORIGIN__ = ${JSON.stringify(safeOrigin)};`,
    '  if (window.location && window.location.protocol === "file:" && typeof window.fetch === "function") {',
    '    var origFetch = window.fetch;',
    '    window.fetch = function(input, init) {',
    '      if (typeof input === "string" && input.charAt(0) === "/") {',
    `        input = ${JSON.stringify(safeOrigin)} + input;`,
    '      }',
    '      return origFetch.call(this, input, init);',
    '    };',
    '  }',
    '  try {',
    '    if (window.tizen && window.tizen.tvinputdevice && window.tizen.tvinputdevice.registerKeyBatch) {',
    '      window.tizen.tvinputdevice.registerKeyBatch([',
    '        "MediaPlayPause","MediaPlay","MediaPause","MediaStop",',
    '        "MediaRewind","MediaFastForward","ChannelUp","ChannelDown"',
    '      ]);',
    '    }',
    '  } catch (e) {}',
    '})();',
    '</script>',
  ].join('\n');
}

/**
 * Rewrites root-relative asset URLs (/assets/..., /tv/..., /icon.svg...) to relative (./...)
 * so Tizen TV widgets running from file:// resolve bundled assets locally without 404.
 */
export function rewriteHtmlForTizenFileProtocol(html: string, targetOrigin: string): string {
  let out = String(html || '');
  out = out
    .replace(/(href|src)=(["'])\/assets\//gi, '$1=$2./assets/')
    .replace(/(href|src)=(["'])\/tv\//gi, '$1=$2./tv/')
    .replace(/(href|src)=(["'])\/vendor\//gi, '$1=$2./vendor/')
    .replace(
      /(href|src)=(["'])\/(favicon[^"']*|apple-touch-icon\.png|icon\.svg|pwa-[^"']*|music-[^"']*|logo-[^"']*|manifest\.webmanifest)(["'])/gi,
      '$1=$2./$3$4'
    );

  // Strip PWA Vite module scripts that do not exist under file:// Tizen widgets
  out = out.replace(/<script[^>]*src=["']\.?\/registerSW\.js["'][^>]*><\/script>/gi, '');

  const shim = buildTizenRuntimeShimScript(targetOrigin);
  if (out.includes('<head>')) {
    out = out.replace('<head>', `<head>\n${shim}`);
  } else if (out.includes('</head>')) {
    out = out.replace('</head>', `${shim}\n</head>`);
  } else {
    out = `${shim}\n${out}`;
  }
  return out;
}

/**
 * Generates a lightweight standalone 10-foot Tizen TV HTML launcher (ES5 safe)
 * that redirects cleanly into the live hosted RiffanTV experience with remote control shim.
 */
export function buildHostedTizenLauncherHtml(appName: string, targetOrigin: string): string {
  const safeOrigin = String(targetOrigin || 'https://riffan.ai.studio').replace(/\/+$/, '');
  const launchUrl = `${safeOrigin}/?tizen=1&tv=1`;
  const tvReceiverUrl = `${safeOrigin}/tv`;
  const escapedName = appName.replace(/[<>&"]/g, '');

  return [
    '<!DOCTYPE html>',
    '<html lang="es">',
    '<head>',
    '  <meta charset="UTF-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    `  <title>${escapedName} — Samsung Smart TV</title>`,
    buildTizenRuntimeShimScript(safeOrigin),
    '  <style>',
    '    html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #000000; color: #ffffff; font-family: Arial, Helvetica, sans-serif; overflow: hidden; }',
    '    .wrap { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; text-align: center; padding: 48px; box-sizing: border-box; }',
    '    .mark { width: 96px; height: 96px; border-radius: 24px; background: #7C3AED; display: flex; align-items: center; justify-content: center; font-size: 46px; font-weight: 900; margin-bottom: 28px; box-shadow: 0 24px 64px rgba(124,58,237,0.45); }',
    '    h1 { font-size: 40px; margin: 0 0 12px; letter-spacing: -0.02em; }',
    '    p { font-size: 20px; color: #a1a1aa; margin: 0 0 36px; max-width: 720px; }',
    '    .actions { display: flex; gap: 20px; }',
    '    button { min-width: 260px; height: 64px; font-size: 20px; font-weight: 700; border-radius: 16px; border: 2px solid rgba(255,255,255,0.2); background: #14141c; color: #fff; cursor: pointer; }',
    '    button.primary { background: #7C3AED; border-color: #A78BFA; }',
    '    button:focus { outline: 3px solid #ffffff; transform: scale(1.04); }',
    '  </style>',
    '</head>',
    '<body>',
    '  <div class="wrap">',
    '    <div class="mark">R</div>',
    `    <h1>${escapedName}</h1>`,
    '    <p id="status-msg">Conectando con tu servidor Samsung Smart TV...</p>',
    '    <div class="actions">',
    '      <button id="btn-app" class="primary" tabindex="0">Abrir RiffanTV (10-Foot)</button>',
    '      <button id="btn-tv" tabindex="0">Abrir Receptor Directo (/tv)</button>',
    '    </div>',
    '  </div>',
    '  <script>',
    '    (function(){',
    `      var appUrl = ${JSON.stringify(launchUrl)};`,
    `      var tvUrl = ${JSON.stringify(tvReceiverUrl)};`,
    '      var btnApp = document.getElementById("btn-app");',
    '      var btnTv = document.getElementById("btn-tv");',
    '      if (btnApp) { btnApp.onclick = function(){ window.location.replace(appUrl); }; }',
    '      if (btnTv) { btnTv.onclick = function(){ window.location.replace(tvUrl); }; }',
    '      if (btnApp && btnApp.focus) { btnApp.focus(); }',
    '      document.addEventListener("keydown", function(e){',
    '        var code = e.keyCode || e.which;',
    '        if (code === 10009) {',
    '          try { window.tizen && window.tizen.application && window.tizen.application.getCurrentApplication().exit(); } catch (err) {}',
    '        } else if (code === 37 || code === 39) {',
    '          if (document.activeElement === btnApp && btnTv) btnTv.focus();',
    '          else if (btnApp) btnApp.focus();',
    '        }',
    '      });',
    '      setTimeout(function(){ window.location.replace(appUrl); }, 900);',
    '    })();',
    '  </script>',
    '</body>',
    '</html>',
  ].join('\n');
}

// Fallback minimal valid 1x1 dark purple PNG (base64 decoded cleanly without Canvas/DOM if running in Node)
const MINIMAL_FALLBACK_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAALElEQVQYV2N8//79fwYGBgZGRkZGBhQAF0NWDWQ2VjV4Q0NDBY4U7hSgAwAA3h0M7M7uU2QAAAAASUVORK5CYII=';

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
 * Generates a crisp 512x512 PNG icon via HTML Canvas 2D when physical asset isn't fetched.
 */
export async function createCanvasTizenIconPng(appName = 'RiffanTV'): Promise<Uint8Array> {
  if (typeof document === 'undefined') {
    return decodeBase64Bytes(MINIMAL_FALLBACK_PNG_B64);
  }
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (!ctx) return decodeBase64Bytes(MINIMAL_FALLBACK_PNG_B64);

    // Pure Obsidian Background + subtle purple glow
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, 512, 512);

    const grad = ctx.createRadialGradient(256, 210, 24, 256, 256, 260);
    grad.addColorStop(0, 'rgba(124, 58, 237, 0.52)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);

    // Inner emblem plate
    ctx.fillStyle = '#12101B';
    ctx.strokeStyle = 'rgba(167, 139, 250, 0.55)';
    ctx.lineWidth = 10;
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(72, 72, 368, 368, 84);
    } else {
      ctx.rect(72, 72, 368, 368);
    }
    ctx.fill();
    ctx.stroke();

    // Monogram letter
    const letter = (appName.trim()[0] || 'R').toUpperCase();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '900 220px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, 256, 268);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/png');
    });
    if (blob) {
      const buf = new Uint8Array(await blob.arrayBuffer());
      if (hasPngSignature(buf)) return buf;
    }
  } catch {
    // ignore headless/mock canvas failures
  }
  return decodeBase64Bytes(MINIMAL_FALLBACK_PNG_B64);
}

async function resolveValidIconPng(appName: string): Promise<{
  bytes: Uint8Array;
  usedFallbackCanvas: boolean;
}> {
  if (typeof fetch === 'function' && typeof window !== 'undefined') {
    for (const candidate of ['/pwa-512x512.png', '/pwa-192x192.png']) {
      try {
        const res = await fetch(candidate, { cache: 'force-cache' });
        if (res.ok) {
          const bytes = new Uint8Array(await res.arrayBuffer());
          if (hasPngSignature(bytes)) {
            return { bytes, usedFallbackCanvas: false };
          }
        }
      } catch {
        // try next icon candidate
      }
    }
  }
  const canvasBytes = await createCanvasTizenIconPng(appName);
  return { bytes: canvasBytes, usedFallbackCanvas: true };
}

/**
 * Packages the complete Samsung Smart TV `.wgt` archive directly in the browser using JSZip.
 */
export async function buildTizenWgtArchive(
  options: BuildTizenWgtOptions = {}
): Promise<BuildTizenWgtResult> {
  const packageId = normalizeTizenPackageId(options.packageId);
  const appName = (options.appName || 'RiffanTV').trim().slice(0, 48) || 'RiffanTV';
  const version = options.version || '1.0.0';
  const mode: TizenPackageMode = options.packageMode || 'full_bundle';
  const defaultOrigin =
    typeof window !== 'undefined' && window.location?.origin?.startsWith('http')
      ? window.location.origin
      : 'https://riffan.ai.studio';
  const targetOrigin = (options.targetOrigin || defaultOrigin).replace(/\/+$/, '');
  const onProgress = options.onProgress;

  onProgress?.('Inicializando empaquetador JSZip...', 8);
  const JSZipMod = await import('jszip');
  const JSZip = JSZipMod.default || JSZipMod;
  const zip = new JSZip();

  onProgress?.('Generando manifiesto config.xml...', 18);
  const configXml = generateTizenConfigXml({
    packageId,
    appName,
    version,
    contentSrc: 'index.html',
    iconSrc: 'icon.png',
    requiredVersion: '4.0',
    disableScreenSaver: true,
  });
  zip.file('config.xml', configXml);

  onProgress?.('Preparando icono PNG de Smart Hub...', 30);
  const { bytes: iconBytes, usedFallbackCanvas } = await resolveValidIconPng(appName);
  zip.file('icon.png', iconBytes);

  let fileCount = 2; // config.xml + icon.png
  let sourceKind: BuildTizenWgtResult['sourceKind'] = 'hosted-launcher';

  if (mode === 'hosted_launcher') {
    onProgress?.('Generando lanzador ligero 10-Foot...', 65);
    zip.file('index.html', buildHostedTizenLauncherHtml(appName, targetOrigin));
    fileCount += 1;
    sourceKind = 'hosted-launcher';
  } else {
    let bundledFromDist = false;

    if (typeof fetch === 'function' && typeof window !== 'undefined') {
      try {
        onProgress?.('Consultando manifiesto de assets compilados...', 42);
        const manifestRes = await fetch('/api/tv/tizen-wgt-manifest');
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
                  zip.file('index.html', rewriteHtmlForTizenFileProtocol(rawHtml, targetOrigin));
                } else {
                  const arrBuf = await fileRes.arrayBuffer();
                  zip.file(relPath, new Uint8Array(arrBuf));
                }
                fileCount += 1;
              } catch {
                // skip transient asset failure
              } finally {
                done += 1;
                const pct = 45 + Math.round((done / Math.max(1, total)) * 45);
                onProgress?.(`Empaquetando ${relPath} (${done}/${total})...`, pct);
              }
            }
            bundledFromDist = true;
          }
        }
      } catch {
        // fallback cleanly to live DOM / hybrid shell
      }
    }

    if (!bundledFromDist) {
      sourceKind = 'hybrid-fallback';
      onProgress?.('Capturando recursos y receptores Tizen locales...', 55);

      // Bundle live stylesheet/module tags if available on page alongside TV receiver scripts
      let capturedHtml = '';
      if (typeof document !== 'undefined' && typeof fetch === 'function') {
        const docClone = document.documentElement.cloneNode(true) as HTMLElement;
        const assetHrefs = new Set<string>();
        docClone.querySelectorAll('link[href], script[src]').forEach((node) => {
          const attr = node.tagName === 'LINK' ? 'href' : 'src';
          const val = node.getAttribute(attr) || '';
          if (val.startsWith('/assets/') || val.startsWith('/vendor/') || val.startsWith('/tv/')) {
            assetHrefs.add(val.split('?')[0]);
          }
        });

        for (const assetUrl of assetHrefs) {
          try {
            const r = await fetch(assetUrl);
            if (r.ok) {
              const rel = assetUrl.replace(/^\/+/, '');
              zip.file(rel, new Uint8Array(await r.arrayBuffer()));
              fileCount += 1;
            }
          } catch {
            // ignore missing dev asset
          }
        }

        const rootNode = docClone.querySelector('#root');
        if (rootNode) {
          rootNode.innerHTML = '';
        }
        if (docClone.querySelector('script[src*="/assets/"]')) {
          capturedHtml = rewriteHtmlForTizenFileProtocol(
            `<!doctype html>\n${docClone.outerHTML}`,
            targetOrigin
          );
        }
      }

      // Also include local offline-ready /tv receiver assets if reachable
      if (typeof fetch === 'function' && typeof window !== 'undefined') {
        const extraAssets = [
          'tv-receiver.html',
          'tv/tv-base.css',
          'tv/tv-state-i18n.js',
          'tv/tv-hub-pairing.js',
          'tv/tv-player-engine.js',
          'tv/tv-nav-voice.js',
          'vendor/hls.min.js',
        ];
        for (const rel of extraAssets) {
          try {
            const r = await fetch(`/${rel}`);
            if (r.ok) {
              zip.file(rel, new Uint8Array(await r.arrayBuffer()));
              fileCount += 1;
            }
          } catch {
            // optional offline receiver files
          }
        }
      }

      zip.file(
        'index.html',
        capturedHtml || buildHostedTizenLauncherHtml(appName, targetOrigin)
      );
      fileCount += 1;
    }
  }

  onProgress?.('Comprimiendo paquete Samsung TV (.wgt)...', 94);
  const rawBytes = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  const bytes = new Uint8Array(rawBytes);
  const blob = new Blob([bytes], { type: 'application/x-widget' });

  const slug = appName.replace(/[^A-Za-z0-9_-]/g, '') || 'RiffanTV';
  const filename = `${slug}-${packageId}.wgt`;
  onProgress?.('Paquete .wgt listo', 100);

  return {
    blob,
    bytes,
    filename,
    packageId,
    appName,
    configXml,
    fileCount,
    byteSize: bytes.byteLength,
    usedFallbackCanvasIcon: usedFallbackCanvas,
    mode,
    sourceKind,
  };
}

export function triggerWgtBrowserDownload(blob: Blob, filename: string): void {
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
