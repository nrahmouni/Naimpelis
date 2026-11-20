import express from 'express';
import { LruTtlCache } from '../utils/lruCache.ts';
import { type ExtractedStreamResult, type TrackRecord } from '../extractors/httpHelpers.ts';
import { handleDirectExtractCases } from './streamExtractHelpers/directCasesHandler.ts';
import { handleCatalogMediaExtract } from './streamExtractHelpers/catalogMediaExtractor.ts';
import {
  formatExtractResponseForClient,
  handleExternalSportsExtract,
} from './streamExtractHelpers/externalSportsExtractor.ts';

const extractionCache = new LruTtlCache<string, ExtractedStreamResult>(400, 15 * 60 * 1000);

export interface RankCandidateTracksInput {
  allDiscovered: TrackRecord[];
  preferLang: string;
  isVestLink: boolean;
  hasExplicitMovidyUrl: boolean;
  hasExplicitGnulaUrl: boolean;
  healthMap: Record<string, any>;
}

export interface RankCandidateTracksOutput {
  orderedTracks: TrackRecord[];
  getLangScore: (trackLang: string) => number;
  sourcePriority: (tr: TrackRecord) => number;
  getTrackHealthScore: (tr: TrackRecord) => number;
}

export type RankCandidateTracksFn = (input: RankCandidateTracksInput) => RankCandidateTracksOutput;

export function registerStreamExtractRoute(
  app: express.Express,
  deps: {
    getPublicOrigin: (r: express.Request) => string;
    rankCandidateTracks: RankCandidateTracksFn;
  }
) {
  const formatResp = (req: express.Request, payload: ExtractedStreamResult) =>
    formatExtractResponseForClient(req, payload, deps.getPublicOrigin);

  app.get('/api/extract/stream', async (req, res) => {
    const rawInput = String(req.query.url || '').trim();
    const movidyUrlParam = String(req.query.movidyUrl || '').trim();
    const gnulaUrlParam = String(req.query.gnulaUrl || '').trim();
    const vestUrlParam = String(req.query.vestUrl || '').trim();
    const resolverType = String(req.query.resolverType || '').trim();
    const preferLang = String(req.query.preferLang || req.query.lang || 'ES').toUpperCase();
    const titleHint = String(req.query.title || '').trim();
    const origTitleHint = String(req.query.origTitle || '').trim();
    const rawYearParam = String(req.query.year || '').trim();
    const yearParam = /^(?:19|20)\d{2}$/.test(rawYearParam) ? rawYearParam : '';
    const mediaTypeParam = String(req.query.mediaType || req.query.type || '').toLowerCase();
    const tmdbIdParam = String(req.query.tmdbId || '').replace(/\D/g, '');
    const seasonParam = parseInt(String(req.query.season || '0'), 10) || undefined;
    const episodeParam = parseInt(String(req.query.episode || '0'), 10) || undefined;
    const episodeTitleHint = String(req.query.episodeTitle || '').trim();
    const isSandboxedFrame = String(req.query.sandboxed || '').trim() === '1';
    const forceExtract = String(req.query.force || req.query.forceSpanish || '') === '1';
    const directOnly = String(req.query.directOnly || '').trim() === '1';

    if (!rawInput && !movidyUrlParam && !gnulaUrlParam && !vestUrlParam && !titleHint && !tmdbIdParam) {
      return res.status(400).json({ success: false, error: 'Falta el enlace o título del contenido.' });
    }

    const cacheKey = `v3|${mediaTypeParam}|${tmdbIdParam}|${yearParam}|${seasonParam || ''}|${episodeParam || ''}|${resolverType}|${preferLang}|${isSandboxedFrame ? 'sb1' : 'sb0'}|${directOnly ? 'do1' : 'do0'}|${rawInput}|${movidyUrlParam}|${gnulaUrlParam}|${vestUrlParam}|${titleHint}`;
    const cached = !forceExtract ? extractionCache.get(cacheKey) : undefined;
    if (cached && cached.expiresAt > Date.now()) {
      return res.json(formatResp(req, cached));
    }

    const setCache = (k: string, val: ExtractedStreamResult) => extractionCache.set(k, val);
    const sendOk = (payload: ExtractedStreamResult) => res.json(formatResp(req, payload));
    const sendErr = (status: number, error: string) => res.status(status).json({ success: false, error });

    try {
      const directResp = await handleDirectExtractCases({
        rawInput,
        resolverType,
        preferLang,
        titleHint,
        isSandboxedFrame,
        cacheKey,
        setCache,
        sendOk,
        sendErr,
      });
      if (directResp) return directResp;

      const mediaResp = await handleCatalogMediaExtract({
        rawInput,
        movidyUrlParam,
        gnulaUrlParam,
        vestUrlParam,
        resolverType,
        preferLang,
        titleHint,
        origTitleHint,
        yearParam,
        mediaTypeParam,
        tmdbIdParam,
        seasonParam,
        episodeParam,
        episodeTitleHint,
        isSandboxedFrame,
        forceExtract,
        directOnly,
        cacheKey,
        rankCandidateTracks: deps.rankCandidateTracks,
        setCache,
        sendOk,
        sendUnavailable: (status, body) => res.status(status).json(body),
      });
      if (mediaResp) return mediaResp;

      if (rawInput) {
        return await handleExternalSportsExtract({
          rawInput,
          resolverType,
          preferLang,
          titleHint,
          cacheKey,
          setCache,
          sendOk,
          sendJsonStatus: (status, body) => res.status(status).json(body),
        });
      }

      return res.status(404).json({
        success: false,
        canUseCloudBrowser: false,
        error: 'No se encontró ninguna señal estable para reproducir dentro de la app.',
      });
    } catch (err) {
      console.error('Extract stream error:', err);
      return res.status(502).json({
        success: false,
        canUseCloudBrowser: false,
        error: 'Esta señal no responde de forma estable en este momento.',
      });
    }
  });
}
