import type { TrackRecord } from '../extractors/httpHelpers.ts';
import type { TrackHealthInfo } from '../services/channelHealthMonitor.ts';

export interface RankCandidateTracksInput {
  allDiscovered: TrackRecord[];
  preferLang: string;
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

export function rankCandidateTracks({
  allDiscovered,
  preferLang,
  isVestLink,
  hasExplicitMovidyUrl,
  hasExplicitGnulaUrl,
  healthMap,
}: RankCandidateTracksInput): RankCandidateTracksOutput {
  const getLangScore = (trackLang: string): number => {
    const tl = String(trackLang || '').toUpperCase();
    if (preferLang === 'EN') {
      if (tl === 'EN') return 1;
      if (tl === 'VOSE') return 2;
      if (tl === 'ES') return 3;
      if (tl === 'LAT') return 4;
      return 5;
    }
    if (preferLang === 'LAT') {
      if (tl === 'LAT') return 1;
      if (tl === 'ES') return 2;
      if (tl === 'VOSE') return 3;
      if (tl === 'EN') return 4;
      return 5;
    }
    if (preferLang === 'VOSE') {
      if (tl === 'VOSE') return 1;
      if (tl === 'EN') return 2;
      if (tl === 'ES') return 3;
      if (tl === 'LAT') return 4;
      return 5;
    }
    if (tl === 'ES') return 1;
    if (tl === 'LAT') return 2;
    if (tl === 'VOSE') return 3;
    if (tl === 'EN') return 4;
    return 5;
  };

  const qualityRank = (q?: string): number => {
    const s = String(q || '').toLowerCase();
    if (s.includes('4k') || s.includes('2160')) return 0;
    if (s.includes('1080')) return 1;
    if (s.includes('720') || s === 'hd') return 2;
    if (s.includes('480')) return 3;
    if (s.includes('380') || s.includes('360') || s.includes('288')) return 4;
    return 2;
  };

  const resolverPriority = (tr: TrackRecord): number => {
    const rt = tr.resolverType;
    if (isVestLink && rt === 'vest_hls') return 0;
    if (
      rt === 'direct_mp4' &&
      (tr.id.startsWith('cm-lqsa-') || tr.id.startsWith('ia-') || tr.id.startsWith('archive-'))
    ) {
      return 1;
    }
    if (rt === 'direct_hls' && qualityRank(tr.quality) >= 3) {
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
      tr.id.startsWith('vidrock-') ||
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
    const lDiff = getLangScore(a.lang) - getLangScore(b.lang);
    if (lDiff !== 0) return lDiff;
    const aIsWeb = a.resolverType === 'web_embed' || a.resolverType === 'embed_sniff';
    const bIsWeb = b.resolverType === 'web_embed' || b.resolverType === 'embed_sniff';
    if (aIsWeb !== bIsWeb) {
      return aIsWeb ? 1 : -1;
    }
    const dDiff = getEffectiveDownPenalty(a) - getEffectiveDownPenalty(b);
    if (dDiff !== 0) return dDiff;
    const rDiff = resolverPriority(a) - resolverPriority(b);
    if (rDiff !== 0) return rDiff;
    const sDiff = sourcePriority(a) - sourcePriority(b);
    if (sDiff !== 0) return sDiff;
    const qDiff = qualityRank(a.quality) - qualityRank(b.quality);
    if (qDiff !== 0) return qDiff;
    return getTrackHealthScore(a) - getTrackHealthScore(b);
  });

  return { orderedTracks, getLangScore, sourcePriority, getTrackHealthScore };
}
