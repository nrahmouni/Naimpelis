import type { TrackRecord } from '../extractors/httpHelpers.ts';
import type { TrackHealthInfo } from '../services/channelHealthMonitor.ts';

export interface RankCandidateTracksInput {
  allDiscovered: TrackRecord[];
  preferLang: string;
  preferQualityFirst?: boolean;
  isVestLink: boolean;
  hasExplicitMovidyUrl: boolean;
  hasExplicitGnulaUrl: boolean;
  healthMap: Record<string, TrackHealthInfo>;
}

export interface RankCandidateTracksOutput {
  orderedTracks: TrackRecord[];
  getLangScore: (trackLang: string) => number;
  sourcePriority: (tr: TrackRecord) => number;
  getTrackHealthScore: (tr: TrackRecord) => number;
}

export type RankCandidateTracksFn = (input: RankCandidateTracksInput) => RankCandidateTracksOutput;

export function normalizeTrackLangCode(raw?: string): string {
  const s = String(raw || '').trim().toUpperCase();
  if (!s) return 'ES';
  if (s === 'CAST' || s === 'ESP' || s === 'SPA' || s === 'ES') return 'ES';
  if (s === 'LAT' || s === 'LA' || s === 'MX' || s.includes('LATIN')) return 'LAT';
  if (s === 'VOSE' || s.includes('SUB')) return 'VOSE';
  if (s === 'ENG' || s === 'EN') return 'EN';
  if (s === 'CAT' || s === 'CA') return 'CAT';
  if (s === 'ARB' || s === 'AR') return 'AR';
  if (s === 'FRE' || s === 'FR') return 'FR';
  if (s === 'POR' || s === 'BR' || s === 'PT') return 'PT';
  if (s === 'ITA' || s === 'IT') return 'IT';
  if (s === 'GER' || s === 'DE') return 'DE';
  return s;
}

export function getStreamQualityRank(q?: string, label?: string): number {
  const s = `${q || ''} ${label || ''}`.replace(/⁴ᴷ|⁴ᵏ/g, ' 4k ').toLowerCase();
  const isHevc = /\b(?:hevc|h\.?265|x265)\b/.test(s);
  if (/\b(?:4k|uhd|2160p?|dolby\s*vision|remux)\b/.test(s)) return isHevc ? 0.5 : 0;
  if (/\b(?:1080p?|fhd|full\s*hd|blu-?ray|bdrip)\b/.test(s)) return isHevc ? 1.5 : 1;
  if (/\b(?:720p?|web-?dl|hd)\b/.test(s)) return 2;
  if (/\b(?:576p?|480p?|dvdrip)\b/.test(s)) return 3;
  if (/\b(?:380p?|360p?|288p?|sd|lq)\b/.test(s)) return 4;
  return 2;
}

export function rankCandidateTracks({
  allDiscovered,
  preferLang,
  preferQualityFirst = false,
  isVestLink,
  hasExplicitMovidyUrl,
  hasExplicitGnulaUrl,
  healthMap,
}: RankCandidateTracksInput): RankCandidateTracksOutput {
  const normalizedPref = String(preferLang || 'ES').trim().toUpperCase();
  const qualityOnlyMode = preferQualityFirst || normalizedPref === 'QUALITY' || normalizedPref === 'BEST';

  const getLangScore = (trackLang: string): number => {
    const tl = normalizeTrackLangCode(trackLang);
    if (normalizedPref === 'QUALITY' || normalizedPref === 'BEST') {
      if (tl === 'ES') return 1;
      if (tl === 'LAT') return 2;
      if (tl === 'VOSE') return 3;
      if (tl === 'EN') return 4;
      if (tl === 'CAT') return 5;
      return 6;
    }
    if (normalizedPref === 'EN') {
      if (tl === 'EN') return 1;
      if (tl === 'VOSE') return 2;
      if (tl === 'ES') return 3;
      if (tl === 'LAT') return 4;
      return 6;
    }
    if (normalizedPref === 'LAT') {
      if (tl === 'LAT') return 1;
      if (tl === 'ES') return 2;
      if (tl === 'VOSE') return 3;
      if (tl === 'EN') return 4;
      return 6;
    }
    if (normalizedPref === 'VOSE') {
      if (tl === 'VOSE') return 1;
      if (tl === 'EN') return 2;
      if (tl === 'ES') return 3;
      if (tl === 'LAT') return 4;
      return 6;
    }
    if (['CAT', 'AR', 'FR', 'PT', 'IT', 'DE'].includes(normalizedPref)) {
      if (tl === normalizedPref) return 1;
      if (tl === 'ES') return 2;
      if (tl === 'EN') return 3;
      if (tl === 'VOSE') return 4;
      return 6;
    }
    // Default Castellano ES first
    if (tl === 'ES') return 1;
    if (tl === 'LAT') return 2;
    if (tl === 'VOSE') return 3;
    if (tl === 'EN') return 4;
    if (tl === 'CAT') return 5;
    return 6;
  };

  const qualityRank = (q?: string, label?: string): number => getStreamQualityRank(q, label);

  const resolverPriority = (tr: TrackRecord): number => {
    const rt = tr.resolverType;
    if (isVestLink && rt === 'vest_hls') return 0;
    if (
      rt === 'direct_mp4' &&
      (tr.id.startsWith('cm-lqsa-') ||
        tr.id.startsWith('ia-') ||
        tr.id.startsWith('archive-') ||
        tr.id.startsWith('xtream-'))
    ) {
      return 1;
    }
    if (rt === 'direct_hls' && qualityRank(tr.quality, tr.label) >= 3) {
      return 2;
    }
    if (
      rt === 'vest_hls' ||
      rt === 'direct_hls' ||
      rt === 'vidhide_hls' ||
      rt === 'movidy_embed' ||
      rt === 'bingetrix_en'
    ) {
      return 1;
    }
    if (rt === 'direct_mp4') return 2;
    if (rt === 'embed_sniff') return 3;
    if (rt === 'web_embed') return 4;
    return 5;
  };

  const sourcePriority = (tr: TrackRecord): number => {
    if (isVestLink && tr.resolverType === 'vest_hls') return 0;
    if (!hasExplicitMovidyUrl && hasExplicitGnulaUrl && tr.id.startsWith('gnula-')) return 0;
    if (tr.id.startsWith('cm-lqsa-') && tr.resolverType === 'direct_mp4') return 0;
    if (tr.id.startsWith('xtream-')) return 1;
    if (tr.id.startsWith('movidy-') || tr.resolverType === 'movidy_embed') return 1;
    if (tr.id.startsWith('gnula-')) return 2;
    if (tr.id.startsWith('ia-')) return 2;
    if (tr.id.startsWith('dm-') || tr.id.startsWith('seriesmetro-')) return 2;
    if (tr.id.startsWith('archive-')) return 3;
    if (tr.id.startsWith('cm-lqsa-')) return 3;
    if (
      tr.id.startsWith('clipbox-') ||
      tr.id.startsWith('vidbolt-') ||
      tr.id.startsWith('bingetrix-') ||
      tr.id.startsWith('2embed-') ||
      tr.id.startsWith('vidbuzz-') ||
      tr.resolverType === 'bingetrix_en'
    ) {
      return 3;
    }
    return 4;
  };

  const healthStatusRank = (status?: string): number => {
    if (status === 'up') return 0;
    if (status === 'unknown' || !status) return 1;
    if (status === 'degraded') return 2;
    return 3;
  };

  const getEffectiveDownPenalty = (tr: TrackRecord): number => {
    const key = String(tr.resolvedStreamUrl || tr.sourceUrl || '').trim();
    const info = (key && healthMap[key]) || healthMap[String(tr.sourceUrl || '').trim()];
    if (!info) return 0;
    if (info.status === 'down') return 2;
    if ((info.qoeFailures || 0) >= 2) return 1;
    return 0;
  };

  const getTrackHealthScore = (tr: TrackRecord): number => {
    const key = String(tr.resolvedStreamUrl || tr.sourceUrl || '').trim();
    const info = (key && healthMap[key]) || healthMap[String(tr.sourceUrl || '').trim()];
    if (!info) return 100;
    const statusBase = healthStatusRank(info.status) * 1000;
    const qoePenalty =
      (info.qoeFailures || 0) * 80 +
      (info.qoeRebuffers || 0) * 15 +
      (info.failCount || 0) * 50;
    const latencyScore = Math.min(400, Math.round((info.latencyMs || 150) / 10));
    return statusBase + qoePenalty + latencyScore;
  };

  const orderedTracks: TrackRecord[] = [...allDiscovered].sort((a, b) => {
    if (!qualityOnlyMode) {
      const lDiff = getLangScore(a.lang) - getLangScore(b.lang);
      if (lDiff !== 0) return lDiff;
    }
    const aIsWeb = a.resolverType === 'web_embed' || a.resolverType === 'embed_sniff';
    const bIsWeb = b.resolverType === 'web_embed' || b.resolverType === 'embed_sniff';
    if (aIsWeb !== bIsWeb) {
      return aIsWeb ? 1 : -1;
    }
    const dDiff = getEffectiveDownPenalty(a) - getEffectiveDownPenalty(b);
    if (dDiff !== 0) return dDiff;

    // Best quality (4K UHD > 1080p FHD > HD > 480p > SD) ALWAYS outranks legacy 720p/SD mirrors
    const qDiff = qualityRank(a.quality, a.label) - qualityRank(b.quality, b.label);
    if (qDiff !== 0) return qDiff;

    if (qualityOnlyMode) {
      const lDiff = getLangScore(a.lang) - getLangScore(b.lang);
      if (lDiff !== 0) return lDiff;
    }

    const rDiff = resolverPriority(a) - resolverPriority(b);
    if (rDiff !== 0) return rDiff;
    const sDiff = sourcePriority(a) - sourcePriority(b);
    if (sDiff !== 0) return sDiff;
    return getTrackHealthScore(a) - getTrackHealthScore(b);
  });

  return { orderedTracks, getLangScore, sourcePriority, getTrackHealthScore };
}
