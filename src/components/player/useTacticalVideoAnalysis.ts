import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import type { AppLanguage, VideoState } from '../../types';
import { studioFetch } from '../../utils/studioApi';
import { pickLang } from '../../utils/i18n';
import type {
  PlayerMatchContext,
  TacticalCaptureStatus,
  TacticalVisionAnalysis,
} from './tacticalVisionTypes';
import {
  analyzeMatchFrameOptically,
  createOpticalTrackerMemory,
  type OpticalRosterItem,
  type OpticalStatItem,
} from './localOpticalTacticalTracker';

const OPTICAL_SAMPLE_INTERVAL_MS = 1800;
const GEMINI_ENRICH_INTERVAL_MS = 14_000;
const MAX_CAPTURE_WIDTH = 768;

export interface CaptureFrameResult {
  ok: boolean;
  dataUrl?: string;
  reason?: 'not_ready' | 'cors_blocked';
}

export function captureVideoFrameDataUrl(
  video: HTMLVideoElement | null,
  maxWidth = MAX_CAPTURE_WIDTH
): CaptureFrameResult {
  if (!video || video.readyState < 2 || video.videoWidth < 64 || video.videoHeight < 64) {
    return { ok: false, reason: 'not_ready' };
  }
  try {
    const scale = Math.min(1, maxWidth / video.videoWidth);
    const width = Math.max(128, Math.round(video.videoWidth * scale));
    const height = Math.max(72, Math.round(video.videoHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { ok: false, reason: 'not_ready' };
    ctx.drawImage(video, 0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.78);
    if (!dataUrl || dataUrl.length < 200) {
      return { ok: false, reason: 'not_ready' };
    }
    return { ok: true, dataUrl };
  } catch {
    return { ok: false, reason: 'cors_blocked' };
  }
}

export function deriveTeamsFromTitle(
  title: string,
  fallbackCompetition?: string
): { homeTeam: string; awayTeam: string; competition?: string } {
  const cleaned = String(title || '').replace(/\s+·\s+.*$/, '').trim();
  const parts = cleaned.split(/\s+(?:vs\.?|v|-)\s+/i);
  if (parts.length >= 2 && parts[0].trim().length >= 2 && parts[1].trim().length >= 2) {
    return {
      homeTeam: parts[0].trim(),
      awayTeam: parts[1].trim(),
      competition: fallbackCompetition,
    };
  }
  return {
    homeTeam: cleaned || 'Local',
    awayTeam: 'Visitante',
    competition: fallbackCompetition,
  };
}

function loadImageElement(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

interface UseTacticalVideoAnalysisOptions {
  enabled: boolean;
  lang: AppLanguage;
  videoState: VideoState;
  videoRef: MutableRefObject<HTMLVideoElement | null>;
  cloudFrame: string | null;
  matchContext?: PlayerMatchContext | null;
}

export function useTacticalVideoAnalysis({
  enabled,
  lang,
  videoState,
  videoRef,
  cloudFrame,
  matchContext,
}: UseTacticalVideoAnalysisOptions) {
  const [analysis, setAnalysis] = useState<TacticalVisionAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [captureStatus, setCaptureStatus] = useState<TacticalCaptureStatus>('idle');
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);

  const inFlightRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const opticalMemoryRef = useRef(createOpticalTrackerMemory());
  const geminiCooldownUntilRef = useRef<number>(0);
  const lastGeminiSuccessAtRef = useRef<number>(0);
  const lastGeminiAttemptAtRef = useRef<number>(0);

  const resolvedTeams = useMemo(() => {
    if (matchContext?.homeTeam && matchContext?.awayTeam) {
      return {
        homeTeam: matchContext.homeTeam,
        awayTeam: matchContext.awayTeam,
        homeShort: matchContext.homeShort,
        awayShort: matchContext.awayShort,
        homeScore: matchContext.homeScore ?? matchContext.details?.homeScore ?? '-',
        awayScore: matchContext.awayScore ?? matchContext.details?.awayScore ?? '-',
        statusLabel: matchContext.statusLabel ?? matchContext.details?.statusLabel ?? '',
        competition: matchContext.details?.tournamentName || matchContext.competition || videoState.subtitle || '',
      };
    }
    const parsed = deriveTeamsFromTitle(videoState.title, videoState.subtitle);
    return {
      homeTeam: parsed.homeTeam,
      awayTeam: parsed.awayTeam,
      homeShort: undefined,
      awayShort: undefined,
      homeScore: '-',
      awayScore: '-',
      statusLabel: '',
      competition: parsed.competition || '',
    };
  }, [matchContext, videoState.title, videoState.subtitle]);

  const runOpticalFrameStep = useCallback(
    async (
      homeRoster: OpticalRosterItem[],
      awayRoster: OpticalRosterItem[],
      liveStats: OpticalStatItem[]
    ): Promise<boolean> => {
      let opticalSource: HTMLVideoElement | HTMLImageElement | null = null;
      if (videoState.mode === 'hls' || videoState.mode === 'direct') {
        opticalSource = videoRef.current;
      } else if (videoState.mode === 'cloud' && cloudFrame) {
        opticalSource = await loadImageElement(cloudFrame);
      }
      if (!opticalSource) return false;

      const optResult = analyzeMatchFrameOptically(opticalSource, {
        lang,
        homeTeam: resolvedTeams.homeTeam,
        awayTeam: resolvedTeams.awayTeam,
        homeRoster,
        awayRoster,
        liveStats,
        memory: opticalMemoryRef.current,
      });

      if (!optResult.ok) {
        if (optResult.reason === 'cors_blocked') {
          setCaptureStatus('cors_blocked');
          setErrorMsg(
            pickLang(lang, {
              es: 'Esta señal externa bloquea la lectura de fotogramas. Cambia a otra señal/canal del partido para activar el tracking en vídeo.',
              ca: 'Aquest senyal extern bloqueja la lectura de fotogrames. Canvia a un altre senyal per activar el tracking.',
              en: 'This external feed blocks video frame capture. Switch to another feed/channel to run live visual tracking.',
            })
          );
        } else {
          setCaptureStatus('waiting_frame');
        }
        return false;
      }

      setCaptureStatus('ready');
      setErrorMsg(null);
      setAnalysis(optResult.analysis);
      setLastUpdatedAt(Date.now());
      return true;
    },
    [videoState.mode, videoRef, cloudFrame, lang, resolvedTeams.homeTeam, resolvedTeams.awayTeam]
  );

  const analyzeCurrentFrame = useCallback(
    async (forceGemini = false) => {
      if (!enabled) return;

      if (videoState.mode !== 'hls' && videoState.mode !== 'direct' && !(videoState.mode === 'cloud' && cloudFrame)) {
        setCaptureStatus('unsupported_mode');
        setErrorMsg(
          pickLang(lang, {
            es: 'El análisis visual en tiempo real requiere reproducción nativa HLS/Directa o Cloud HD.',
            ca: 'L’anàlisi visual en directe requereix reproducció nativa HLS/Directa o Cloud HD.',
            en: 'Live visual tracking requires native HLS/Direct playback or Cloud HD.',
          })
        );
        return;
      }

      const details = matchContext?.details;
      const statsSource = details?.statsByPeriod?.all?.length
        ? details.statsByPeriod.all
        : details?.stats || [];
      const homeRoster: OpticalRosterItem[] = (details?.homeLineup?.starters || []).slice(0, 11).map((p) => ({
        jersey: p.jersey,
        name: p.name,
        shortName: p.shortName,
        position: p.position,
      }));
      const awayRoster: OpticalRosterItem[] = (details?.awayLineup?.starters || []).slice(0, 11).map((p) => ({
        jersey: p.jersey,
        name: p.name,
        shortName: p.shortName,
        position: p.position,
      }));
      const liveStats: OpticalStatItem[] = statsSource.slice(0, 6).map((s) => ({
        label: s.label,
        homeValue: s.homeValue,
        awayValue: s.awayValue,
      }));

      const now = Date.now();
      const inGeminiCooldown = now < geminiCooldownUntilRef.current && !forceGemini;
      const geminiFreshlyApplied = now - lastGeminiSuccessAtRef.current < 8500;

      // Always keep UI snappy with real-time Local Optical CV whenever Gemini is cooling down
      // or hasn't produced a fresh frame recently.
      if (inGeminiCooldown || !geminiFreshlyApplied) {
        const opticalOk = await runOpticalFrameStep(homeRoster, awayRoster, liveStats);
        if (!opticalOk) return;
      }

      // Skip cloud call if in cooldown or called within Gemini pacing window
      if (inGeminiCooldown) return;
      if (!forceGemini && now - lastGeminiAttemptAtRef.current < GEMINI_ENRICH_INTERVAL_MS) {
        return;
      }
      if (inFlightRef.current) return;

      let frameDataUrl: string | undefined;
      if (videoState.mode === 'hls' || videoState.mode === 'direct') {
        const cap = captureVideoFrameDataUrl(videoRef.current);
        if (!cap.ok || !cap.dataUrl) {
          return;
        }
        frameDataUrl = cap.dataUrl;
      } else if (videoState.mode === 'cloud' && cloudFrame) {
        frameDataUrl = cloudFrame;
      }
      if (!frameDataUrl) return;

      lastGeminiAttemptAtRef.current = Date.now();
      inFlightRef.current = true;
      setIsAnalyzing(true);

      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      try {
        const resp = await studioFetch<{
          ok: boolean;
          engineMode?: 'gemini' | 'use_local_optical';
          fallbackSuggested?: boolean;
          retryAfterMs?: number;
          analysis?: TacticalVisionAnalysis;
          analyzedAt?: number;
        }>('/api/ai/tactical-vision', {
          method: 'POST',
          signal: ctrl.signal,
          body: JSON.stringify({
            imageBase64: frameDataUrl,
            homeTeam: resolvedTeams.homeTeam,
            awayTeam: resolvedTeams.awayTeam,
            homeShort: resolvedTeams.homeShort,
            awayShort: resolvedTeams.awayShort,
            homeScore: resolvedTeams.homeScore,
            awayScore: resolvedTeams.awayScore,
            statusLabel: resolvedTeams.statusLabel,
            competition: resolvedTeams.competition,
            homeRoster,
            awayRoster,
            liveStats,
            lang,
          }),
        });

        if (ctrl.signal.aborted) return;

        if (resp?.fallbackSuggested || resp?.engineMode === 'use_local_optical') {
          geminiCooldownUntilRef.current = Date.now() + (resp.retryAfterMs || 65_000);
          await runOpticalFrameStep(homeRoster, awayRoster, liveStats);
          return;
        }

        if (resp?.analysis) {
          lastGeminiSuccessAtRef.current = Date.now();
          setAnalysis({ ...resp.analysis, engineMode: 'gemini' });
          setLastUpdatedAt(resp.analyzedAt || Date.now());
          setErrorMsg(null);
        }
      } catch {
        if (ctrl.signal.aborted) return;
        // Seamless fallback to Local Optical CV on any quota / network / capacity interruption
        geminiCooldownUntilRef.current = Date.now() + 65_000;
        await runOpticalFrameStep(homeRoster, awayRoster, liveStats);
      } finally {
        inFlightRef.current = false;
        if (!ctrl.signal.aborted) {
          setIsAnalyzing(false);
        }
      }
    },
    [
      enabled,
      videoState.mode,
      videoRef,
      cloudFrame,
      lang,
      matchContext?.details,
      resolvedTeams,
      runOpticalFrameStep,
    ]
  );

  useEffect(() => {
    if (!enabled || videoState.mode === 'idle') {
      abortRef.current?.abort();
      inFlightRef.current = false;
      setIsAnalyzing(false);
      if (!enabled) {
        setCaptureStatus('idle');
        setErrorMsg(null);
      }
      return;
    }

    const kickoff = setTimeout(() => {
      void analyzeCurrentFrame(false);
    }, 250);

    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      const v = videoRef.current;
      if ((videoState.mode === 'hls' || videoState.mode === 'direct') && v?.paused) return;
      void analyzeCurrentFrame(false);
    }, OPTICAL_SAMPLE_INTERVAL_MS);

    return () => {
      clearTimeout(kickoff);
      clearInterval(interval);
      abortRef.current?.abort();
      inFlightRef.current = false;
    };
  }, [enabled, videoState.mode, videoState.url, analyzeCurrentFrame, videoRef]);

  // Clear stale frame coordinates when switching stream/channel
  useEffect(() => {
    opticalMemoryRef.current = createOpticalTrackerMemory();
    lastGeminiSuccessAtRef.current = 0;
    lastGeminiAttemptAtRef.current = 0;
    setAnalysis(null);
    setLastUpdatedAt(null);
    setErrorMsg(null);
  }, [videoState.url]);

  const refreshNow = useCallback(() => {
    void analyzeCurrentFrame(true);
  }, [analyzeCurrentFrame]);

  return {
    analysis,
    isAnalyzing,
    errorMsg,
    captureStatus,
    lastUpdatedAt,
    resolvedTeams,
    refreshNow,
  };
}
