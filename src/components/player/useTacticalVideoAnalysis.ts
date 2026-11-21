import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import type { AppLanguage, FootballMatchDetails, VideoState } from '../../types';
import { studioFetch } from '../../utils/studioApi';
import { pickLang } from '../../utils/i18n';
import {
  buildMomentumTimeline,
  computeMatchTiltPct,
  deriveDangerZone,
  derivePhaseFromPitch,
  projectLiveLineupsToPitch,
} from './tacticalPitchEngine';
import type {
  MomentumTimelineSample,
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

const OPTICAL_SAMPLE_INTERVAL_MS = 1600;
const GEMINI_ENRICH_INTERVAL_MS = 12_000;
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

function extractPossPct(details?: FootballMatchDetails | null): number {
  const stats = details?.statsByPeriod?.all?.length ? details.statsByPeriod.all : details?.stats || [];
  for (const s of stats) {
    if (/pos(es|ses)i[oó]n|possession/i.test(String(s.label || ''))) {
      const h = parseFloat(String(s.homeValue || '').replace(/[^\d.]/g, ''));
      const a = parseFloat(String(s.awayValue || '').replace(/[^\d.]/g, ''));
      if (Number.isFinite(h) && Number.isFinite(a) && h + a > 0) {
        return Math.max(15, Math.min(85, Math.round((h / (h + a)) * 100)));
      }
    }
  }
  return 50;
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
  const momentumSamplesRef = useRef<MomentumTimelineSample[]>([]);
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
        homeLogo: matchContext.homeLogo ?? matchContext.details?.homeLogo,
        awayLogo: matchContext.awayLogo ?? matchContext.details?.awayLogo,
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
      homeLogo: undefined,
      awayLogo: undefined,
      homeScore: '-',
      awayScore: '-',
      statusLabel: videoState.isLive ? 'EN VIVO' : '',
      competition: parsed.competition || '',
    };
  }, [matchContext, videoState.title, videoState.subtitle, videoState.isLive]);

  const appendMomentumSample = useCallback(
    (tiltSigned: number) => {
      const clamped = Math.max(-100, Math.min(100, Math.round(tiltSigned)));
      const nowLabel =
        resolvedTeams.statusLabel && /\d+/.test(resolvedTeams.statusLabel)
          ? resolvedTeams.statusLabel
          : new Date().toLocaleTimeString([], { minute: '2-digit', second: '2-digit' });
      const prev = momentumSamplesRef.current;
      momentumSamplesRef.current = [
        ...prev.slice(-19),
        { id: `rt-${Date.now()}-${prev.length}`, label: nowLabel, value: clamped },
      ];
    },
    [resolvedTeams.statusLabel]
  );

  const buildBaselineAnalysis = useCallback((): TacticalVisionAnalysis => {
    const details = matchContext?.details;
    const mom = details?.momentum || [];
    const lastMom = mom.length > 0 ? mom[mom.length - 1].value : 0;
    const homePct = extractPossPct(details);
    const attackDir: 'home' | 'away' | 'neutral' =
      lastMom > 8 ? 'home' : lastMom < -8 ? 'away' : homePct > 54 ? 'home' : homePct < 46 ? 'away' : 'neutral';
    const intensity = Math.min(88, Math.max(30, Math.round(Math.abs(lastMom) + 25)));
    const ballX = attackDir === 'home' ? 680 : attackDir === 'away' ? 320 : 500;
    const ballY = 500;
    const players = projectLiveLineupsToPitch({
      homeTeam: resolvedTeams.homeTeam,
      awayTeam: resolvedTeams.awayTeam,
      homeLineup: details?.homeLineup,
      awayLineup: details?.awayLineup,
      ballX,
      ballY,
      possessionTeam: attackDir === 'neutral' ? 'contested' : attackDir,
      attackDirection: attackDir,
      attackIntensity: intensity,
    });
    const { homeTiltPct, awayTiltPct } = computeMatchTiltPct({
      homePossessionPct: homePct,
      attackDirection: attackDir,
      attackIntensity: intensity,
      details,
    });

    return {
      engineMode: 'optical_local',
      isMatchPitchVisible: false,
      cameraAngle: 'wide_tactical',
      homeKitColor: details?.homeColor || '#00F593',
      awayKitColor: details?.awayColor || '#9146FF',
      ballZone: { x: ballX, y: ballY },
      attackDirection: attackDir,
      attackIntensity: intensity,
      dangerZone: deriveDangerZone(ballX),
      phaseType: derivePhaseFromPitch(ballX, attackDir, intensity),
      homeTiltPct,
      awayTiltPct,
      laneActivity: { leftPct: 33, centerPct: 34, rightPct: 33 },
      possession: {
        team: attackDir === 'neutral' ? 'contested' : attackDir,
        homePct,
        awayPct: 100 - homePct,
        zoneLabel: pickLang(lang, { es: 'Campo completo 11v11', ca: 'Camp complet 11v11', en: 'Full 11v11 Pitch' }),
        summary: pickLang(lang, {
          es: 'Alineaciones 11v11 activas · Calibrando ritmo de juego.',
          ca: 'Alineacions 11v11 actives · Calibrant ritme de joc.',
          en: '11v11 lineups active · Calibrating live flow.',
        }),
      },
      players,
      passingLines: [],
      attacks: [],
      attacksSummary: {
        homeAttacks: opticalMemoryRef.current.homeAttacksCount,
        awayAttacks: opticalMemoryRef.current.awayAttacksCount,
        homeDangerousAttacks: opticalMemoryRef.current.homeDangerousCount,
        awayDangerousAttacks: opticalMemoryRef.current.awayDangerousCount,
        phaseLabel: pickLang(lang, { es: 'Alineación en vivo', ca: 'Alineació en directe', en: 'Live Lineups' }),
      },
      momentumHistory: buildMomentumTimeline(details, momentumSamplesRef.current),
      tacticalNote: pickLang(lang, {
        es: 'Pizarra en directo sincronizada con alineaciones y estadísticas.',
        ca: 'Pissarra en directe sincronitzada amb alineacions i estadístiques.',
        en: 'Live tactical board synced with lineups and match telemetry.',
      }),
    };
  }, [matchContext?.details, resolvedTeams.homeTeam, resolvedTeams.awayTeam, lang]);

  const enrichAnalysisWithPitch = useCallback(
    (raw: TacticalVisionAnalysis): TacticalVisionAnalysis => {
      const details = matchContext?.details;
      const ballX = raw.ballZone?.x ?? opticalMemoryRef.current.smoothBallX;
      const ballY = raw.ballZone?.y ?? opticalMemoryRef.current.smoothBallY;

      // Temporal smoothing on Gemini frames so markers glide like broadcast graphics
      const smoothX = Math.round(opticalMemoryRef.current.smoothBallX * 0.45 + ballX * 0.55);
      const smoothY = Math.round(opticalMemoryRef.current.smoothBallY * 0.45 + ballY * 0.55);
      opticalMemoryRef.current.smoothBallX = smoothX;
      opticalMemoryRef.current.smoothBallY = smoothY;

      const dir =
        raw.attackDirection ||
        (raw.possession.team === 'home' || raw.possession.team === 'away' ? raw.possession.team : 'neutral');
      const intensity = raw.attackIntensity ?? 48;
      const signedTilt = dir === 'home' ? intensity : dir === 'away' ? -intensity : (raw.possession.homePct - 50) * 1.4;
      appendMomentumSample(signedTilt);

      const players =
        raw.players && raw.players.length >= 18
          ? raw.players
          : projectLiveLineupsToPitch({
              homeTeam: resolvedTeams.homeTeam,
              awayTeam: resolvedTeams.awayTeam,
              homeLineup: details?.homeLineup,
              awayLineup: details?.awayLineup,
              ballX: smoothX,
              ballY: smoothY,
              possessionTeam: raw.possession.team,
              attackDirection: dir,
              attackIntensity: intensity,
              homeLineHeight: raw.homeLineHeight,
              awayLineHeight: raw.awayLineHeight,
            });

      const { homeTiltPct, awayTiltPct } = computeMatchTiltPct({
        homePossessionPct: raw.possession.homePct,
        attackDirection: dir,
        attackIntensity: intensity,
        details,
      });

      return {
        ...raw,
        ballZone: { x: smoothX, y: smoothY },
        attackDirection: dir,
        attackIntensity: intensity,
        dangerZone: raw.dangerZone || deriveDangerZone(smoothX),
        phaseType: raw.phaseType || derivePhaseFromPitch(smoothX, dir, intensity),
        homeTiltPct: raw.homeTiltPct ?? homeTiltPct,
        awayTiltPct: raw.awayTiltPct ?? awayTiltPct,
        players,
        momentumHistory: buildMomentumTimeline(details, momentumSamplesRef.current),
      };
    },
    [matchContext?.details, resolvedTeams.homeTeam, resolvedTeams.awayTeam, appendMomentumSample]
  );

  const runOpticalFrameStep = useCallback(
    async (liveStats: OpticalStatItem[]): Promise<boolean> => {
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
        details: matchContext?.details,
        liveStats,
        memory: opticalMemoryRef.current,
      });

      if (!optResult.ok) {
        if (optResult.reason === 'cors_blocked') {
          setCaptureStatus('cors_blocked');
          // Keep full 11v11 tactical board & match data alive smoothly even if video pixel read is CORS-locked!
          setAnalysis((prev) => prev || buildBaselineAnalysis());
          setErrorMsg(null);
        } else {
          setCaptureStatus('waiting_frame');
          setAnalysis((prev) => prev || buildBaselineAnalysis());
        }
        return false;
      }

      setCaptureStatus('ready');
      setErrorMsg(null);
      setAnalysis(enrichAnalysisWithPitch(optResult.analysis));
      setLastUpdatedAt(Date.now());
      return true;
    },
    [
      videoState.mode,
      videoRef,
      cloudFrame,
      lang,
      resolvedTeams.homeTeam,
      resolvedTeams.awayTeam,
      matchContext?.details,
      buildBaselineAnalysis,
      enrichAnalysisWithPitch,
    ]
  );

  const analyzeCurrentFrame = useCallback(
    async (forceGemini = false) => {
      if (!enabled) return;

      if (videoState.mode !== 'hls' && videoState.mode !== 'direct' && !(videoState.mode === 'cloud' && cloudFrame)) {
        setCaptureStatus('unsupported_mode');
        setAnalysis((prev) => prev || buildBaselineAnalysis());
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
      const geminiFreshlyApplied = now - lastGeminiSuccessAtRef.current < 8000;

      if (inGeminiCooldown || !geminiFreshlyApplied) {
        await runOpticalFrameStep(liveStats);
      }

      if (inGeminiCooldown) return;
      if (!forceGemini && now - lastGeminiAttemptAtRef.current < GEMINI_ENRICH_INTERVAL_MS) {
        return;
      }
      if (inFlightRef.current) return;

      let frameDataUrl: string | undefined;
      if (videoState.mode === 'hls' || videoState.mode === 'direct') {
        const cap = captureVideoFrameDataUrl(videoRef.current);
        if (!cap.ok || !cap.dataUrl) return;
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
            homeColor: details?.homeColor,
            awayColor: details?.awayColor,
            homeRoster,
            awayRoster,
            liveStats,
            lang,
          }),
        });

        if (ctrl.signal.aborted) return;

        if (resp?.fallbackSuggested || resp?.engineMode === 'use_local_optical') {
          geminiCooldownUntilRef.current = Date.now() + (resp.retryAfterMs || 65_000);
          await runOpticalFrameStep(liveStats);
          return;
        }

        if (resp?.analysis) {
          lastGeminiSuccessAtRef.current = Date.now();
          setCaptureStatus('ready');
          setAnalysis(enrichAnalysisWithPitch({ ...resp.analysis, engineMode: 'gemini' }));
          setLastUpdatedAt(resp.analyzedAt || Date.now());
          setErrorMsg(null);
        }
      } catch {
        if (ctrl.signal.aborted) return;
        geminiCooldownUntilRef.current = Date.now() + 65_000;
        await runOpticalFrameStep(liveStats);
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
      buildBaselineAnalysis,
      enrichAnalysisWithPitch,
      runOpticalFrameStep,
    ]
  );

  // Immediately show 11v11 tactical baseline when enabled or match details update
  useEffect(() => {
    if (!enabled) return;
    setAnalysis((prev) => (prev ? enrichAnalysisWithPitch(prev) : buildBaselineAnalysis()));
  }, [enabled, matchContext?.details, buildBaselineAnalysis, enrichAnalysisWithPitch]);

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
    }, 220);

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

  useEffect(() => {
    opticalMemoryRef.current = createOpticalTrackerMemory();
    momentumSamplesRef.current = [];
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
