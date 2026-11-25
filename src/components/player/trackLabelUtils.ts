import type { AppLanguage, StreamTrack } from '../../types';
import { unwrapEmbedUrl } from './embedWindowUtils';

const KNOWN_HOST_LABELS: Array<[RegExp, string]> = [
  [/vidfast/i, 'VidFast'],
  [/vidrock/i, 'VidRock'],
  [/vidsrc|vidsrccc/i, 'VidSrc'],
  [/vidlink/i, 'VidLink'],
  [/embed69/i, 'Embed69'],
  [/vidhide|dhtpre|peymin/i, 'VidHide'],
  [/voe\.sx|voe/i, 'VOE'],
  [/streamwish|wish/i, 'StreamWish'],
  [/filemoon/i, 'FileMoon'],
  [/ok\.ru|okru/i, 'OK.ru'],
  [/dood|d000d/i, 'Dood'],
  [/mixdrop/i, 'MixDrop'],
  [/mega\.nz/i, 'Mega'],
];

function compactQualityBadge(rawQuality?: string, rawLabel?: string): string {
  const hay = `${rawQuality || ''} ${rawLabel || ''}`.toUpperCase();
  if (/\b(?:4K|UHD|2160P?)\b/.test(hay)) return '4K';
  if (/\b(?:1080P?|FHD)\b/.test(hay)) return '1080p';
  if (/\b(?:720P?|HD)\b/.test(hay)) return 'HD';
  if (/\b(?:480P?|SD)\b/.test(hay)) return 'SD';
  return '';
}

export function extractDistinguishingTrackName(
  track: {
    label?: string;
    sourceUrl?: string;
    resolvedStreamUrl?: string;
    resolverType?: string;
    providerName?: string;
    quality?: string;
  },
  idx: number,
  lang: AppLanguage
): string {
  if (track.resolverType === 'youtube') {
    const cleaned = (track.label || '').replace(/\s*\([^)]*\)/g, '').trim();
    if (cleaned) return cleaned;
  }

  const qTag = compactQualityBadge(track.quality, track.label);
  const explicitProvider = String(track.providerName || '').trim();
  if (explicitProvider) {
    const cleanProv = explicitProvider.length > 14 ? explicitProvider.slice(0, 14) : explicitProvider;
    return qTag ? `${cleanProv} · ${qTag}` : cleanProv;
  }

  const rawLabel = (track.label || '').trim();
  const parts = rawLabel
    .split('·')
    .map((p) => p.trim())
    .filter(Boolean);

  const genericFirst =
    /^(servidor\s*web|embed|web|stream|mirror|enlace|opci[oó]n|castellano|latino|english|vose|es|lat|en|fr|pt|it|de|ar|cat)$/i;
  let candidate = '';
  if (parts.length >= 2) {
    candidate = genericFirst.test(parts[0]) ? parts.slice(1).join(' · ') : parts[0];
  } else if (parts.length === 1 && !genericFirst.test(parts[0])) {
    candidate = parts[0];
  }

  const unwrapped = unwrapEmbedUrl(track.sourceUrl || track.resolvedStreamUrl || '');
  for (const [rx, pretty] of KNOWN_HOST_LABELS) {
    if (rx.test(candidate) || rx.test(rawLabel) || rx.test(unwrapped)) {
      const langPrefix = /\bVOSE\b/i.test(rawLabel)
        ? 'VOSE '
        : /\bLAT\b/i.test(rawLabel)
        ? 'LAT '
        : '';
      candidate = `${langPrefix}${pretty}`.trim();
      break;
    }
  }

  if (!candidate || /^servidor\s*web$/i.test(candidate)) {
    try {
      const host = new URL(unwrapped).hostname.replace(/^www\./, '').split('.')[0];
      if (host && host.length >= 2 && host !== 'localhost') {
        candidate = host.charAt(0).toUpperCase() + host.slice(1, 12);
      }
    } catch {
      // ignore invalid url
    }
  }

  if (!candidate) {
    const prefix =
      lang === 'zh'
        ? '线路'
        : lang === 'ca'
        ? 'Servidor'
        : lang === 'en'
        ? 'Server'
        : 'Servidor';
    candidate = qTag ? `${prefix} ${idx + 1} · ${qTag}` : `${prefix} ${idx + 1}`;
  } else if (qTag && !candidate.toUpperCase().includes(qTag.toUpperCase())) {
    const combined = `${candidate} · ${qTag}`;
    if (combined.length <= 22) {
      candidate = combined;
    }
  }

  return candidate.length > 22 ? `${candidate.slice(0, 21)}…` : candidate;
}

export function formatUniqueTrackChipLabels(
  tracks: Array<{
    label?: string;
    sourceUrl?: string;
    resolvedStreamUrl?: string;
    resolverType?: string;
    providerName?: string;
    quality?: string;
  }>,
  lang: AppLanguage
): string[] {
  const raw = tracks.map((tr, idx) => extractDistinguishingTrackName(tr, idx, lang));
  const totals = new Map<string, number>();
  for (const name of raw) {
    totals.set(name, (totals.get(name) || 0) + 1);
  }
  const seen = new Map<string, number>();
  return raw.map((name) => {
    const count = totals.get(name) || 1;
    if (count <= 1) return name;
    const nextIdx = (seen.get(name) || 0) + 1;
    seen.set(name, nextIdx);
    return `${name} #${nextIdx}`;
  });
}

export type CanonicalTrackLang =
  | 'ES'
  | 'CAT'
  | 'LAT'
  | 'VOSE'
  | 'EN'
  | 'FR'
  | 'PT'
  | 'IT'
  | 'DE'
  | 'AR';

export function resolveTrackLang(
  tr?: StreamTrack | null,
  contextMeta?: { subtitle?: string; title?: string; fallbackLang?: string }
): CanonicalTrackLang {
  const raw = String(tr?.lang || contextMeta?.fallbackLang || '').toUpperCase();
  if (!tr && !raw && !contextMeta?.subtitle && !contextMeta?.title) return 'ES';
  if (raw === 'CAT' || raw === 'CA' || raw.includes('CATAL') || raw.includes('VALENCI')) {
    return 'CAT';
  }
  const label = `${tr?.label || ''} ${tr?.langLabel || ''} ${contextMeta?.subtitle || ''} ${contextMeta?.title || ''}`.toLowerCase();
  if (
    label.includes('català') ||
    label.includes('catala') ||
    label.includes('[cat]') ||
    label.includes('(cat)') ||
    label.includes('3cat') ||
    label.includes('sx3') ||
    label.includes('3xl') ||
    label.includes('k3')
  ) {
    return 'CAT';
  }
  if (raw === 'LAT' || raw.includes('LATIN') || label.includes('latino') || label.includes('latina')) {
    return 'LAT';
  }
  if (raw === 'VOSE' || raw.includes('SUB') || label.includes('vose') || label.includes('subtitul')) {
    return 'VOSE';
  }
  if (
    raw === 'EN' ||
    raw.includes('ENG') ||
    label.includes('english') ||
    label.includes('inglés') ||
    label.includes('ingles')
  ) {
    return 'EN';
  }
  if (raw === 'FR' || label.includes('français') || label.includes('francés') || label.includes('french')) {
    return 'FR';
  }
  if (raw === 'PT' || raw === 'BR' || label.includes('portugu') || label.includes('brasil')) {
    return 'PT';
  }
  if (raw === 'IT' || label.includes('italiano') || label.includes('italian')) {
    return 'IT';
  }
  if (raw === 'DE' || raw === 'GER' || label.includes('deutsch') || label.includes('alemán')) {
    return 'DE';
  }
  if (raw === 'AR' || raw === 'ARB' || label.includes('árabe') || label.includes('arabic')) {
    return 'AR';
  }
  return 'ES';
}
