import { areTitlesStrictlyEqual } from '../extractors/httpHelpers.ts';
import {
  VEST_MIRROR_ORIGINS,
  type VestDubbingVariant,
  type VestEpisodeEntry,
  type VestParsedDetail,
  type VestQualityItem,
  type VestSubtitleItem,
  type VestTrackRecord,
  buildVestDetailUrl,
  curlPlainGetText,
  decodeVestEncryptedContent,
  inferVestVariantLanguage,
  isVestMirrorUrl,
  mapVestQualityLabel,
  normalizeVestTitle,
  parseVestDetailUrl,
} from './vestHelpers/vestTypesAndUtils.ts';
import {
  findVestSeedWithEpisode,
  registerDiscoveredVestEntry,
} from './vestHelpers/vestSeedsAndRegistry.ts';

export * from './vestHelpers/vestTypesAndUtils.ts';
export * from './vestHelpers/vestSeedsAndRegistry.ts';

const vestDetailCache = new Map<string, { detail: VestParsedDetail; ts: number }>();
const tmdbAbsEpCache = new Map<string, { absEp: number; ts: number }>();

export function parseVestDetailHtml(html: string, sourceUrl: string): VestParsedDetail | null {
  try {
    const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
    if (!match || !match[1]) return null;
    const nextData = JSON.parse(match[1]);
    const pp = nextData?.props?.pageProps;
    if (!pp || !pp.paramIds) return null;

    const parsedUrl = parseVestDetailUrl(sourceUrl);
    const mirrorOrigin = parsedUrl?.origin || VEST_MIRROR_ORIGINS[0];
    const mirrorName = String(pp.vestData?.name || new URL(mirrorOrigin).hostname);
    const category = Number(pp.category ?? 1);
    const mediaType: 'movie' | 'tv' = category === 0 ? 'movie' : 'tv';
    const rawName = String(pp.name || '').trim();
    const cleanTitle = normalizeVestTitle(rawName) || rawName || 'Título';

    const decrypted = pp.encryptedContent
      ? decodeVestEncryptedContent(String(pp.encryptedContent))
      : null;

    const langInfo = inferVestVariantLanguage({
      rawName,
      audioLanguageCode: pp.audioLanguageCode,
      dubMode: pp.dubMode,
      dubLang: pp.dubLang,
      subtitleLang: pp.subtitleLang,
      subtitlesType: pp.subtitlesType,
    });

    const epVoList: any[] = Array.isArray(pp.episodeVo) ? pp.episodeVo : [];
    const decEpList: any[] = Array.isArray(decrypted?.season?.[0]?.episodes)
      ? decrypted!.season[0].episodes
      : [];

    const epVoBySeries = new Map<number, any>();
    for (const ev of epVoList) {
      const no = Number(ev?.seriesNo || 0);
      if (no > 0) epVoBySeries.set(no, ev);
    }

    const totalEpisodes = Math.max(epVoList.length, decEpList.length);
    const episodes: VestEpisodeEntry[] = [];
    const count = Math.max(epVoList.length, decEpList.length);

    for (let i = 0; i < count; i++) {
      const decEp = decEpList[i];
      const epNum = Number(decEp?.title || epVoList[i]?.seriesNo || i + 1);
      const vo = epVoBySeries.get(epNum) || epVoList[i] || {};
      const subs: any[] = Array.isArray(vo?.subtitlingList) ? vo.subtitlingList : [];
      episodes.push({
        id: String(vo?.id || decEp?.id || epNum),
        episodeNumber: epNum,
        title: `Episodio ${epNum}`,
        url:
          decEp?.url ||
          buildVestDetailUrl({
            origin: mirrorOrigin,
            typeSeg: mediaType === 'movie' ? 'movie' : 'drama',
            slug: String(pp.websiteParam || pp.paramIds),
            episodeNum: mediaType === 'tv' ? epNum : undefined,
          }),
        width: decEp?.width,
        height: decEp?.height,
        fileSize: decEp?.fileSize,
        subtitlingList: subs
          .filter((s) => s && s.subtitlingUrl)
          .map((s) => ({
            language: String(s.language || s.languageAbbr || 'Sub'),
            languageAbbr: String(s.languageAbbr || 'es').toLowerCase(),
            subtitlingUrl: String(s.subtitlingUrl),
            translateType: s.translateType,
          })),
      });
    }

    const currentEpisodeNumber =
      Number(pp.currentEpisodeNumber || parsedUrl?.episodeNum || 1) || 1;
    const activeEpObj =
      episodes.find((e) => e.episodeNumber === currentEpisodeNumber) || episodes[0];

    const mediaInfoList: { currentDefinition: string; mediaUrl: string }[] = Array.isArray(
      pp.mediaInfoList
    )
      ? pp.mediaInfoList
          .filter((m: any) => m && m.mediaUrl)
          .map((m: any) => ({
            currentDefinition: String(m.currentDefinition || 'GROOT_SD'),
            mediaUrl: String(m.mediaUrl),
          }))
      : [];

    const decQualities: VestQualityItem[] = Array.isArray(decrypted?.qualityList)
      ? decrypted!.qualityList
          .filter((q: any) => q && q.url)
          .map((q: any) => ({
            qualityCode: String(q.qualityCode || 'GROOT_SD'),
            title: mapVestQualityLabel(q.qualityCode, q.title),
            url: String(q.url),
          }))
      : [];

    const qualityList: VestQualityItem[] =
      decQualities.length > 0
        ? decQualities
        : mediaInfoList.map((m) => ({
            qualityCode: m.currentDefinition,
            title: mapVestQualityLabel(m.currentDefinition),
            url: m.mediaUrl,
          }));

    const dubbingList: VestDubbingVariant[] = (Array.isArray(pp.dubbingList) ? pp.dubbingList : [])
      .filter((d: any) => d && d.paramIds && d.websiteParam)
      .map((d: any) => {
        const dName = String(d.name || cleanTitle);
        const dLang = inferVestVariantLanguage({
          rawName: dName,
          audioLanguageCode: d.audioLanguageCode,
          dubMode: d.dubMode,
          dubLang: d.dubLang,
          subtitleLang: d.subtitleLang,
          subtitlesType: d.subtitlesType,
        });
        return {
          id: String(d.id || ''),
          paramIds: String(d.paramIds),
          name: dName,
          cleanName: normalizeVestTitle(dName) || cleanTitle,
          websiteParam: String(d.websiteParam),
          category: Number(d.category ?? category),
          audioLanguageCode: d.audioLanguageCode || null,
          dubMode: d.dubMode || null,
          dubLang: d.dubLang || null,
          subtitleLang: d.subtitleLang || null,
          subtitlesType: typeof d.subtitlesType === 'number' ? d.subtitlesType : null,
          coverVerticalUrl: String(d.coverVerticalUrl || pp.coverVerticalUrl || ''),
          inferredLang: dLang.inferredLang,
          langLabel: dLang.langLabel,
        };
      });

    const refList = (Array.isArray(pp.refList) ? pp.refList : [])
      .filter((r: any) => r && (r.paramIds || r.websiteParam))
      .map((r: any) => ({
        id: String(r.id || ''),
        paramIds: String(r.paramIds || ''),
        name: String(r.name || ''),
        websiteParam: String(r.websiteParam || r.paramIds || ''),
        category: Number(r.category ?? 1),
        coverVerticalUrl: String(r.coverVerticalUrl || ''),
        score: r.score ? String(r.score) : undefined,
      }));

    const primaryTypeSeg: 'movie' | 'drama' = mediaType === 'movie' ? 'movie' : 'drama';
    const primarySlug = String(pp.websiteParam || pp.paramIds);
    registerDiscoveredVestEntry({
      key: String(pp.paramIds),
      websiteParam: primarySlug,
      mediaType,
      title: cleanTitle,
      originalTitle: cleanTitle,
      year: 'HD',
      rating: pp.score ? Number(pp.score).toFixed(1) : '',
      overview: String(pp.introduction || '').trim(),
      poster: String(pp.coverVerticalUrl || ''),
      backdrop: String(pp.coverHorizontalUrl || pp.coverVerticalUrl || ''),
      vestUrl: buildVestDetailUrl({
        origin: mirrorOrigin,
        typeSeg: primaryTypeSeg,
        slug: primarySlug,
        episodeNum: mediaType === 'tv' ? 1 : undefined,
      }),
      mirrorUrls: VEST_MIRROR_ORIGINS.map((orig) =>
        buildVestDetailUrl({
          origin: orig,
          typeSeg: primaryTypeSeg,
          slug: primarySlug,
          episodeNum: mediaType === 'tv' ? 1 : undefined,
        })
      ),
      languages: [langInfo.inferredLang === 'ES' ? 'Castellano' : langInfo.langLabel],
      episodeCount: totalEpisodes,
      discoveredAt: Date.now(),
    });

    for (const ref of refList) {
      const refType: 'movie' | 'tv' = ref.category === 0 ? 'movie' : 'tv';
      const refTypeSeg: 'movie' | 'drama' = refType === 'movie' ? 'movie' : 'drama';
      const refKey = ref.paramIds || ref.websiteParam.split('-')[0];
      if (!refKey) continue;
      registerDiscoveredVestEntry({
        key: refKey,
        websiteParam: ref.websiteParam,
        mediaType: refType,
        title: normalizeVestTitle(ref.name) || ref.name,
        originalTitle: normalizeVestTitle(ref.name) || ref.name,
        year: 'HD',
        rating: ref.score ? Number(ref.score).toFixed(1) : '',
        overview: '',
        poster: ref.coverVerticalUrl || '',
        backdrop: ref.coverVerticalUrl || '',
        vestUrl: buildVestDetailUrl({
          origin: mirrorOrigin,
          typeSeg: refTypeSeg,
          slug: ref.websiteParam,
          episodeNum: refType === 'tv' ? 1 : undefined,
        }),
        mirrorUrls: VEST_MIRROR_ORIGINS.map((orig) =>
          buildVestDetailUrl({
            origin: orig,
            typeSeg: refTypeSeg,
            slug: ref.websiteParam,
            episodeNum: refType === 'tv' ? 1 : undefined,
          })
        ),
        languages: ['Castellano', 'VOSE'],
        discoveredAt: Date.now(),
      });
    }

    return {
      sourceUrl,
      mirrorOrigin,
      mirrorName,
      id: String(pp.id || ''),
      paramIds: String(pp.paramIds),
      websiteParam: primarySlug,
      mediaType,
      category,
      rawName,
      cleanTitle,
      score: pp.score ? Number(pp.score).toFixed(1) : '',
      tagNameList: Array.isArray(pp.tagNameList) ? pp.tagNameList.map(String) : [],
      coverVerticalUrl: String(pp.coverVerticalUrl || ''),
      coverHorizontalUrl: String(pp.coverHorizontalUrl || ''),
      overview: String(pp.introduction || '').trim(),
      currentEpisodeNumber,
      totalEpisodes,
      audioLanguageCode: pp.audioLanguageCode || null,
      dubMode: pp.dubMode || null,
      dubLang: pp.dubLang || null,
      subtitleLang: pp.subtitleLang || null,
      inferredLang: langInfo.inferredLang,
      mediaInfoList,
      qualityList,
      episodes,
      dubbingList,
      refList,
      currentSubtitles: activeEpObj?.subtitlingList || [],
    };
  } catch {
    return null;
  }
}

export async function fetchVestDetailPage(
  targetUrl: string,
  overrideEpisode?: number
): Promise<VestParsedDetail | null> {
  const parsed = parseVestDetailUrl(targetUrl);
  if (!parsed) return null;

  const targetEp =
    overrideEpisode && overrideEpisode > 0 ? overrideEpisode : parsed.episodeNum;
  const cacheKey = `${parsed.origin}|${parsed.typeSeg}|${parsed.paramId}|${targetEp || 0}`;
  const cached = vestDetailCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < 8 * 60 * 1000) {
    return cached.detail;
  }

  const originsToTry = [
    parsed.origin,
    ...VEST_MIRROR_ORIGINS.filter((o) => o !== parsed.origin),
  ];

  for (const orig of originsToTry) {
    const fetchUrl = buildVestDetailUrl({
      origin: orig,
      locale: parsed.locale || 'es',
      typeSeg: parsed.typeSeg,
      slug: parsed.slug,
      episodeNum: targetEp,
    });
    try {
      const html = await curlPlainGetText(fetchUrl, 9);
      const detail = parseVestDetailHtml(html, fetchUrl);
      if (detail && (detail.qualityList.length > 0 || detail.episodes.length > 0)) {
        vestDetailCache.set(cacheKey, { detail, ts: Date.now() });
        if (vestDetailCache.size > 400) {
          const oldest = vestDetailCache.keys().next().value;
          if (oldest) vestDetailCache.delete(oldest);
        }
        return detail;
      }
    } catch {
      // failover to next mirror
    }
  }

  return null;
}

export async function resolveTmdbAbsoluteEpisodeNumber(
  tmdbId: number,
  season: number,
  episode: number,
  tmdbApiKey: string
): Promise<number> {
  if (season <= 1) return episode;
  const key = `${tmdbId}|${season}|${episode}`;
  const cached = tmdbAbsEpCache.get(key);
  if (cached && Date.now() - cached.ts < 6 * 60 * 60 * 1000) {
    return cached.absEp;
  }

  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${tmdbApiKey}&language=es-ES`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (!res.ok) return episode;
    const json: any = await res.json();
    const seasons: any[] = Array.isArray(json?.seasons) ? json.seasons : [];
    let offset = 0;
    for (const s of seasons) {
      const sNum = Number(s?.season_number || 0);
      if (sNum >= 1 && sNum < season) {
        offset += Number(s?.episode_count || 0);
      }
    }
    const absEp = offset + episode;
    tmdbAbsEpCache.set(key, { absEp, ts: Date.now() });
    return absEp;
  } catch {
    return episode;
  }
}

export async function extractVestStreamsAndSubtitles(opts: {
  vestUrl?: string;
  tmdbId?: string | number | null;
  mediaType?: 'movie' | 'tv';
  yearHint?: string;
  season?: number;
  episode?: number;
  preferLang?: string;
  titleHints?: string[];
  tmdbApiKey: string;
  buildHlsProxyUrl: (rawM3u8Url: string, referer: string) => string;
}): Promise<{
  detail: VestParsedDetail;
  tracks: VestTrackRecord[];
  subtitles: VestSubtitleItem[];
} | null> {
  let targetUrl = String(opts.vestUrl || '').trim();
  let epOverride: number | undefined;

  if (!targetUrl || !isVestMirrorUrl(targetUrl)) {
    const found = findVestSeedWithEpisode({
      tmdbId: opts.tmdbId,
      mediaType: opts.mediaType,
      yearHint: opts.yearHint,
      titleHints: opts.titleHints,
      preferLang: opts.preferLang,
      season: opts.season,
      episode: opts.episode,
    });
    if (!found) return null;
    const { seed, mappedEpisode } = found;
    targetUrl = seed.vestUrl;

    if ((opts.mediaType === 'tv' || seed.mediaType === 'tv') && (opts.episode || opts.season)) {
      if (mappedEpisode && mappedEpisode > 0) {
        epOverride = mappedEpisode;
      } else {
        const season = Math.max(1, opts.season || 1);
        const episode = Math.max(1, opts.episode || 1);
        const tmdbNum = seed.tmdbId || Number(String(opts.tmdbId || '').replace(/\D/g, ''));
        if (tmdbNum && season > 1) {
          epOverride = await resolveTmdbAbsoluteEpisodeNumber(
            tmdbNum,
            season,
            episode,
            opts.tmdbApiKey
          );
        } else {
          epOverride = episode;
        }
      }
    }
  } else if (opts.episode && opts.episode > 0) {
    epOverride = opts.episode;
  }

  const primaryDetail = await fetchVestDetailPage(targetUrl, epOverride);
  if (!primaryDetail) return null;
  if (opts.mediaType && primaryDetail.mediaType !== opts.mediaType) {
    return null;
  }
  const cleanTitleHints = (opts.titleHints || []).map((t) => String(t || '').trim()).filter(Boolean);
  if (cleanTitleHints.length > 0 && !areTitlesStrictlyEqual(primaryDetail.cleanTitle, cleanTitleHints)) {
    return null;
  }

  const tracks: VestTrackRecord[] = [];
  const seenUrls = new Set<string>();
  const mirrorTag = primaryDetail.mirrorName || 'Mirror';

  const appendQualitiesForDetail = (d: VestParsedDetail, variantLabelPrefix: string) => {
    const orderedQuals = [...d.qualityList].sort((a, b) => {
      const score = (q: string) =>
        q.includes('1080') ? 1 : q.includes('720') ? 2 : q.includes('540') ? 3 : 4;
      return score(a.title) - score(b.title);
    });
    for (const q of orderedQuals) {
      if (!q.url || seenUrls.has(q.url)) continue;
      seenUrls.add(q.url);
      const langCode = d.inferredLang === 'OTHER' ? 'ES' : d.inferredLang;
      tracks.push({
        id: `vest-${d.paramIds}-${q.qualityCode.toLowerCase()}-${tracks.length + 1}`,
        label: `${variantLabelPrefix} ${q.title} · ${mirrorTag}`,
        lang: langCode,
        quality: q.title,
        sourceUrl: q.url,
        resolverType: 'vest_hls',
        resolvedStreamUrl: opts.buildHlsProxyUrl(q.url, `${d.mirrorOrigin}/`),
      });
    }
  };

  appendQualitiesForDetail(
    primaryDetail,
    primaryDetail.inferredLang === 'ES'
      ? 'Español Doblado'
      : primaryDetail.inferredLang === 'LAT'
      ? 'Español Latino'
      : primaryDetail.inferredLang === 'EN'
      ? 'English VO'
      : 'Sub Español (VOSE)'
  );

  const targetEpNum = primaryDetail.currentEpisodeNumber || epOverride || 1;
  const candidateVariants = primaryDetail.dubbingList
    .filter(
      (d) =>
        d.paramIds !== primaryDetail.paramIds &&
        (d.inferredLang === 'ES' ||
          d.inferredLang === 'LAT' ||
          d.inferredLang === 'VOSE' ||
          d.inferredLang === 'EN')
    )
    .slice(0, 3);

  const variantDetails = await Promise.all(
    candidateVariants.map((v) => {
      const vUrl = buildVestDetailUrl({
        origin: primaryDetail.mirrorOrigin,
        locale: 'es',
        typeSeg: v.category === 0 ? 'movie' : 'drama',
        slug: v.websiteParam,
        episodeNum: v.category === 0 ? undefined : targetEpNum,
      });
      return fetchVestDetailPage(vUrl, v.category === 0 ? undefined : targetEpNum).catch(() => null);
    })
  );

  for (const vd of variantDetails) {
    if (!vd || vd.qualityList.length === 0) continue;
    if (
      vd.mediaType === 'tv' &&
      vd.totalEpisodes > 0 &&
      targetEpNum > vd.totalEpisodes
    ) {
      continue;
    }
    const prefix =
      vd.inferredLang === 'ES'
        ? 'Español Doblado'
        : vd.inferredLang === 'LAT'
        ? 'Español Latino'
        : vd.inferredLang === 'EN'
        ? 'English VO'
        : 'Sub Español (VOSE)';
    appendQualitiesForDetail(vd, prefix);
  }

  const subMap = new Map<string, VestSubtitleItem>();
  const addSubsFrom = (d: VestParsedDetail | null) => {
    if (!d) return;
    for (const s of d.currentSubtitles) {
      const abbr = (s.languageAbbr || 'sub').toLowerCase();
      if (!s.subtitlingUrl || subMap.has(abbr)) continue;
      const mappedLang =
        abbr === 'es' || abbr === 'spa'
          ? 'ES'
          : abbr === 'en' || abbr === 'eng'
          ? 'EN'
          : abbr.toUpperCase();
      subMap.set(abbr, {
        id: `vest-sub-${d.paramIds}-${abbr}`,
        label: s.language || mappedLang,
        lang: mappedLang,
        url: `/api/subtitles/proxy?url=${encodeURIComponent(s.subtitlingUrl)}`,
      });
    }
  };
  addSubsFrom(primaryDetail);
  for (const vd of variantDetails) addSubsFrom(vd);

  const subtitles = Array.from(subMap.values()).sort((a, b) => {
    const rank = (l: string) => (l === 'ES' ? 1 : l === 'EN' ? 2 : 3);
    return rank(a.lang) - rank(b.lang);
  });

  const pref = String(opts.preferLang || 'ES').toUpperCase();
  const langRank = (l: string) => {
    const u = String(l || '').toUpperCase();
    if (pref === 'ES') return u === 'ES' ? 1 : u === 'LAT' ? 2 : u === 'VOSE' ? 3 : 4;
    if (pref === 'VOSE') return u === 'VOSE' ? 1 : u === 'EN' ? 2 : u === 'ES' ? 3 : 4;
    if (pref === 'LAT') return u === 'LAT' ? 1 : u === 'ES' ? 2 : u === 'VOSE' ? 3 : 4;
    if (pref === 'EN') return u === 'EN' ? 1 : u === 'VOSE' ? 2 : u === 'ES' ? 3 : 4;
    return 5;
  };
  tracks.sort((a, b) => langRank(a.lang) - langRank(b.lang));

  return { detail: primaryDetail, tracks, subtitles };
}
