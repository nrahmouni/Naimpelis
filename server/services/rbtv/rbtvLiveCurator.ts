/**
 * @module server/services/rbtv/rbtvLiveCurator
 * @description Filters RBTV+ sports multiplexes, live matches, and 24/7 channels strictly
 * to stable, directly playable native streams (zero external-window/WebView portals or broken hosts).
 */
import { channelHealthMonitor } from '../channelHealthMonitor.ts';
import { getPermanent247SportsMatches } from '../../routes/sportsHelpers/sportsChannels247.ts';
import { getCachedFootballBoardSnapshot, getCachedSportsMatches } from '../../routes/sports.ts';
import type { TrackRecord } from '../../extractors/httpHelpers.ts';

const DISALLOWED_HOST_OR_URL_RE =
  /(?:^|[./])(rbtv77\.com|wv11\.hkkmwtotalwypubook\.cfd|hkkmwtotalwypubook\.cfd|cdn\.stmify\.com|playouts\.now\.amagi\.tv)(?:[/:?]|$)/i;

export function isDisallowedRbtvTrack(track: Partial<TrackRecord> | null | undefined): boolean {
  if (!track) return true;
  const rt = String(track.resolverType || '').toLowerCase();
  if (rt === 'web_embed' || rt === 'cloud_browser' || rt === 'youtube') {
    return true;
  }
  const sourceUrl = String(track.sourceUrl || '').trim();
  if (!sourceUrl) return true;
  if (DISALLOWED_HOST_OR_URL_RE.test(sourceUrl)) {
    return true;
  }
  const health = channelHealthMonitor.getTrackHealth(sourceUrl);
  if (health?.status === 'down' && (health.failCount || 0) >= 1) {
    return true;
  }
  return false;
}

export function curateSportsTracks(tracks: TrackRecord[] | undefined): TrackRecord[] {
  if (!Array.isArray(tracks)) return [];
  const filtered = tracks.filter((t) => !isDisallowedRbtvTrack(t));
  return channelHealthMonitor.prioritizeTracks(filtered);
}

function makeShortMark(label: string): string {
  const clean = String(label || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();
  return clean.slice(0, 4) || 'RBTV';
}

function pickSportTone(sport: string, label: string): string {
  const txt = `${sport} ${label}`.toLowerCase();
  if (txt.includes('f1') || txt.includes('motor')) return '#F59E0B';
  if (txt.includes('dazn')) return '#06B6D4';
  if (txt.includes('movistar') || txt.includes('laliga') || txt.includes('champions')) return '#0EA5E9';
  if (txt.includes('bein')) return '#7C3AED';
  if (txt.includes('espn') || txt.includes('tnt')) return '#EF4444';
  return '#10B981';
}

export function getCuratedRbtvChannels() {
  const permanent = getPermanent247SportsMatches();
  const curated: Array<{
    id: string;
    dial: number;
    name: string;
    shortMark: string;
    brandTone: string;
    network: string;
    category: 'rbtv_sports';
    sourceHub: 'rbtv';
    quality: string;
    logoUrl?: string;
    countryCode?: string;
    description: string;
    channels: TrackRecord[];
  }> = [];

  const seenUrls = new Set<string>();
  for (const mux of permanent) {
    const cleanTracks = curateSportsTracks(mux.channels as TrackRecord[]);
    for (const tr of cleanTracks) {
      const urlKey = String(tr.sourceUrl || '').trim();
      if (!urlKey || seenUrls.has(urlKey)) continue;
      seenUrls.add(urlKey);
      curated.push({
        id: `rbtv-${tr.id || curated.length + 1}`,
        dial: 900 + curated.length,
        name: tr.label.replace(/\s*\(Satélite\)/i, '').trim(),
        shortMark: makeShortMark(tr.label),
        brandTone: pickSportTone(mux.sport || '', tr.label),
        network: mux.competition || 'RBTV+ Deportes 24/7',
        category: 'rbtv_sports',
        sourceHub: 'rbtv',
        quality: tr.quality || '1080p HD',
        description: `RBTV+ Estable · ${mux.competition || 'Deportes en Directo'}`,
        channels: [tr],
      });
    }
  }

  return channelHealthMonitor.prioritizeChannels(curated);
}

export function getCuratedRbtvOverviewData() {
  const board = getCachedFootballBoardSnapshot();
  const cachedSports = getCachedSportsMatches();
  const permanent247 = getPermanent247SportsMatches();

  const rawMatches = [...(board?.matches || []), ...cachedSports];
  const dedupedMatches: typeof rawMatches = [];
  const seenMatchIds = new Set<string>();

  for (const m of rawMatches) {
    if (!m?.id || seenMatchIds.has(m.id)) continue;
    const curatedTracks = curateSportsTracks(m.channels as TrackRecord[]);
    if (curatedTracks.length === 0) continue;
    seenMatchIds.add(m.id);
    dedupedMatches.push({
      ...m,
      channels: curatedTracks,
    });
    if (dedupedMatches.length >= 32) break;
  }

  const sports247Channels = permanent247
    .map((mux) => ({
      ...mux,
      channels: curateSportsTracks(mux.channels as TrackRecord[]),
    }))
    .filter((mux) => mux.channels.length > 0);

  const curatedChannels = getCuratedRbtvChannels();

  return {
    liveMatches: dedupedMatches,
    sports247Channels,
    curatedChannels,
  };
}
