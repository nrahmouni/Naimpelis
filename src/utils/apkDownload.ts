import { triggerHaptic } from './haptics';

export interface ApkDownloadResult {
  ok: boolean;
  bytes?: number;
  error?: string;
}

/**
 * Reliable Android APK downloader for both standard mobile browsers and
 * embedded iframe previews where plain anchor navigation may be restricted.
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
    if (!response.ok || contentType.includes('application/json')) {
      let errMsg = `HTTP ${response.status}`;
      try {
        const json = await response.json();
        if (json?.error) errMsg = String(json.error);
      } catch {
        // ignore JSON parse error
      }
      return { ok: false, error: errMsg };
    }

    const blob = await response.blob();
    if (!blob || blob.size < 1024) {
      return { ok: false, error: 'APK vacío o corrupto' };
    }

    const apkBlob =
      blob.type === 'application/vnd.android.package-archive'
        ? blob
        : new Blob([blob], { type: 'application/vnd.android.package-archive' });

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

    return { ok: true, bytes: apkBlob.size };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Error de red al descargar APK',
    };
  }
}
