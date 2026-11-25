import express from 'express';
import { LruTtlCache } from '../utils/lruCache.ts';
import { logger } from '../utils/logger.ts';
import type { TrackHealthInfo } from '../services/channelHealthMonitor.ts';
import { type ExtractedStreamResult, type TrackRecord } from '../extractors/httpHelpers.ts';
import { handleDirectExtractCases } from './streamExtractHelpers/directCasesHandler.ts';
import { handleCatalogMediaExtract } from './streamExtractHelpers/catalogMediaExtractor.ts';
import {
  formatExtractResponseForClient,
  handleExternalSportsExtract,
} from './streamExtractHelpers/externalSportsExtractor.ts';
import {
  raceFastLiveTracks,
  type FastLiveTrackCandidate,
} from '../services/liveFastResolver.ts';

const extractionCache = new LruTtlCache<string, ExtractedStreamResult>(400, 15 * 60 * 1000);

type CoalescedExtractOutcome =
  | { ok: true; payload: ExtractedStreamResult }
  | { ok: false; status: number; body: Record<string, any> };

const inFlightExtractMap = new Map<string, Promise<CoalescedExtractOutcome>>();

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

export function registerStreamExtractRoute(
  app: express.Express,
  deps: {
    getPublicOrigin: (r: express.Request) => string;
    rankCandidateTracks: RankCandidateTracksFn;
  }
) {
  const formatResp = (req: express.Request, payload: ExtractedStreamResult) =>
    formatExtractResponseForClient(req, payload, deps.getPublicOrigin);

  const resolveBelixSessionKey = (req: express.Request): string => {
    const belixSidMatch = String(req.headers.cookie || '').match(/(?:^|;\s*)belix_sid=([^;]+)/);
    return (
      String(req.headers['x-belix-session'] || '').trim() ||
      (belixSidMatch ? decodeURIComponent(belixSidMatch[1].trim()) : '') ||
      'default'
    );
  };

  app.post('/api/live/fast-resolve', async (req, res) => {
    try {
      const body = (req.body || {}) as {
        channelId?: string;
        title?: string;
        titleHint?: string;
        broadcasters?: string[];
        competition?: string;
        preferLang?: string;
        preferQualityFirst?: boolean;
        tracks?: FastLiveTrackCandidate[];
      };
      const tracks = Array.isArray(body.tracks) ? body.tracks : [];
      if (tracks.length === 0) {
        return res.status(400).json({ success: false, ok: false, error: 'Sin señales para resolver.' });
      }
      const resolvedTitleHint = String(body.title || body.titleHint || '').trim() || undefined;
      const outcome = await raceFastLiveTracks(tracks, {
        channelId: body.channelId ? String(body.channelId) : undefined,
        titleHint: resolvedTitleHint,
        broadcasters: Array.isArray(body.broadcasters) ? body.broadcasters : undefined,
        competition: body.competition ? String(body.competition) : undefined,
        preferLang: body.preferLang ? String(body.preferLang) : 'ES',
        preferQualityFirst: Boolean(body.preferQualityFirst),
        publicOrigin: deps.getPublicOrigin(req),
        belixSessionKey: resolveBelixSessionKey(req),
      });
      return res.json({
        success: outcome.ok,
        ...outcome,
      });
    } catch (err) {
      logger.warn({ err }, 'live_fast_resolve_error');
      return res.status(502).json({ success: false, ok: false, error: 'Error resolviendo directo.' });
    }
  });

  app.post('/api/live/prewarm', (req, res) => {
    try {
      const body = (req.body || {}) as {
        channelId?: string;
        title?: string;
        titleHint?: string;
        preferLang?: string;
        preferQualityFirst?: boolean;
        tracks?: FastLiveTrackCandidate[];
      };
      const tracks = Array.isArray(body.tracks) ? body.tracks.slice(0, 3) : [];
      if (tracks.length > 0) {
        const resolvedTitleHint = String(body.title || body.titleHint || '').trim() || undefined;
        void raceFastLiveTracks(tracks, {
          channelId: body.channelId ? String(body.channelId) : undefined,
          titleHint: resolvedTitleHint,
          preferLang: body.preferLang ? String(body.preferLang) : 'ES',
          preferQualityFirst: Boolean(body.preferQualityFirst),
          publicOrigin: deps.getPublicOrigin(req),
          belixSessionKey: resolveBelixSessionKey(req),
          timeoutMs: 2200,
        }).catch(() => undefined);
      }
      return res.json({ ok: true });
    } catch {
      return res.json({ ok: false });
    }
  });

  app.get('/api/extract/stream', async (req, res) => {
    const rawInput = String(req.query.url || '').trim();
    const movidyUrlParam = String(req.query.movidyUrl || '').trim();
    const gnulaUrlParam = String(req.query.gnulaUrl || '').trim();
    const vestUrlParam = String(req.query.vestUrl || '').trim();
    const resolverType = String(req.query.resolverType || '').trim();
    const preferLang = String(req.query.preferLang || req.query.lang || 'ES').toUpperCase();
    const preferQualityFirst =
      String(req.query.qualityFirst || req.query.preferQuality || '').trim() === '1' ||
      preferLang === 'QUALITY' ||
      preferLang === 'BEST';
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
    const channelLabelParam = String(req.query.channelLabel || '').trim();

    if (!rawInput && !movidyUrlParam && !gnulaUrlParam && !vestUrlParam && !titleHint && !tmdbIdParam) {
      return res.status(400).json({ success: false, error: 'Falta el enlace o título del contenido.' });
    }

    const cacheKey = `v4|${mediaTypeParam}|${tmdbIdParam}|${yearParam}|${seasonParam || ''}|${episodeParam || ''}|${resolverType}|${preferLang}|${preferQualityFirst ? 'qf1' : 'qf0'}|${isSandboxedFrame ? 'sb1' : 'sb0'}|${directOnly ? 'do1' : 'do0'}|${rawInput}|${movidyUrlParam}|${gnulaUrlParam}|${vestUrlParam}|${titleHint}${channelLabelParam ? `|cl:${channelLabelParam}` : ''}`;
    const cached = !forceExtract ? extractionCache.get(cacheKey) : undefined;
    if (cached && cached.expiresAt > Date.now()) {
      return res.json(formatResp(req, cached));
    }

    const belixSessionKey = resolveBelixSessionKey(req);

    const coalesceKey = `${belixSessionKey}|${cacheKey}`;
    if (!forceExtract) {
      const existingInFlight = inFlightExtractMap.get(coalesceKey);
      if (existingInFlight) {
        const joinedOutcome = await existingInFlight;
        if (joinedOutcome.ok) {
          return res.json(formatResp(req, joinedOutcome.payload));
        }
        return res.status(joinedOutcome.status).json(joinedOutcome.body);
      }
    }

    const runExtraction = async (): Promise<CoalescedExtractOutcome> => {
      let outcome: CoalescedExtractOutcome | null = null;
      const setCache = (k: string, val: ExtractedStreamResult) => extractionCache.set(k, val);
      const sendOk = (payload: ExtractedStreamResult): express.Response => {
        outcome = { ok: true, payload };
        return null as unknown as express.Response;
      };
      const sendErr = (status: number, error: string): express.Response => {
        outcome = { ok: false, status, body: { success: false, error } };
        return null as unknown as express.Response;
      };
      const sendJsonStatus = (status: number, body: Record<string, any>): express.Response => {
        outcome = { ok: false, status, body };
        return null as unknown as express.Response;
      };

      try {
        await handleDirectExtractCases({
          rawInput,
          resolverType,
          preferLang,
          titleHint,
          isSandboxedFrame,
          belixSessionKey,
          cacheKey,
          setCache,
          sendOk,
          sendErr,
        });
        if (outcome) return outcome;

        await handleCatalogMediaExtract({
          rawInput,
          movidyUrlParam,
          gnulaUrlParam,
          vestUrlParam,
          resolverType,
          preferLang,
          preferQualityFirst,
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
          sendUnavailable: sendJsonStatus,
        });
        if (outcome) return outcome;

        if (rawInput) {
          await handleExternalSportsExtract({
            rawInput,
            resolverType,
            preferLang,
            titleHint,
            channelLabel: channelLabelParam,
            cacheKey,
            setCache,
            sendOk,
            sendJsonStatus,
          });
          if (outcome) return outcome;
        }

        return {
          ok: false,
          status: 404,
          body: {
            success: false,
            canUseCloudBrowser: false,
            error: 'No se encontró ninguna señal estable para reproducir dentro de la app.',
          },
        };
      } catch (err) {
        logger.error({ err, tmdbIdParam, mediaTypeParam, titleHint }, 'extract_stream_error');
        return {
          ok: false,
          status: 502,
          body: {
            success: false,
            canUseCloudBrowser: false,
            error: 'Esta señal no responde de forma estable en este momento.',
          },
        };
      }
    };

    const extractPromise = runExtraction();
    if (!forceExtract) {
      inFlightExtractMap.set(coalesceKey, extractPromise);
    }
    try {
      const finalOutcome = await extractPromise;
      if (finalOutcome.ok) {
        return res.json(formatResp(req, finalOutcome.payload));
      }
      return res.status(finalOutcome.status).json(finalOutcome.body);
    } finally {
      if (!forceExtract && inFlightExtractMap.get(coalesceKey) === extractPromise) {
        inFlightExtractMap.delete(coalesceKey);
      }
    }
  });
}
