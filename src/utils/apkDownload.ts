import { triggerHaptic } from './haptics';
import { isInsideNestedIframe } from '../components/player/PreviewAutoEscapeBanner';

export interface ApkDownloadResult {
  ok: boolean;
  bytes?: number;
  error?: string;
}

/**
 * Reliable Android APK downloader:
 * - On standard Android/Google TV browsers (outside nested iframes), verifies the APK
 *   endpoint first and then uses a direct attachment navigation so Chrome / Android
 *   DownloadManager passes the real HTTP response directly to Android PackageInstaller
 *   (avoiding Chrome blob: URL rename / parse errors).
 * - Inside embedded preview iframes, downloads via fetch, verifies ZIP/APK PK magic bytes,
 *   and triggers a blob download.
 */
export async function triggerApkDownload(
  apkPath: string,
  filename: string
): Promise<ApkDownloadResult> {
  triggerHaptic('success');

  try {
    const response = await fetch(apkPath, {
      method: 'GET',
      headers: {
        Accept: 'application/vnd.android.package-archive, application/octet-stream, */*',
      },
      cache: 'no-store',
    });

    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (!response.ok || contentType.includes('application/json') || contentType.includes('text/html')) {
      let errMsg = `HTTP ${response.status}`;
      try {
        if (contentType.includes('application/json')) {
          const json = await response.json();
          if (json?.error) errMsg = String(json.error);
        } else if (contentType.includes('text/html')) {
          errMsg = 'El servidor devolvió HTML en lugar de un archivo APK válido';
        }
      } catch {
        // ignore parse error
      }
      return { ok: false, error: errMsg };
    }

    const buf = await response.arrayBuffer();
    if (!buf || buf.byteLength < 1024) {
      return { ok: false, error: 'APK vacío o corrupto' };
    }

    const header = new Uint8Array(buf, 0, 4);
    const isZipApk =
      header[0] === 0x50 &&
      header[1] === 0x4b &&
      (header[2] === 0x03 || header[2] === 0x05);
    if (!isZipApk) {
      return { ok: false, error: 'Formato de paquete APK inválido' };
    }

    if (!isInsideNestedIframe() && typeof window !== 'undefined') {
      const link = document.createElement('a');
      link.href = apkPath;
      link.download = filename;
      link.rel = 'noopener noreferrer';
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return { ok: true, bytes: buf.byteLength };
    }

    const apkBlob = new Blob([buf], { type: 'application/vnd.android.package-archive' });
    const objectUrl = URL.createObjectURL(apkBlob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    link.rel = 'noopener noreferrer';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => {
      try {
        URL.revokeObjectURL(objectUrl);
      } catch {
        // ignore
      }
    }, 15_000);

    return { ok: true, bytes: buf.byteLength };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Error de red al descargar APK',
    };
  }
}
