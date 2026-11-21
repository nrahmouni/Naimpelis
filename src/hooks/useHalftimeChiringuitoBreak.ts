import { useCallback, useEffect, useRef, useState } from 'react';
import type { FootballMatchDetails, StreamTrack, VideoState } from '../types';
import type { ActiveSportsMatchMeta } from './useLiveSportsMatchDetails';

export interface ChiringuitoCandidateBrief {
  videoId: string;
  title: string;
  url: string;
  thumbnail: string;
  isLive: boolean;
  isInside: boolean;
  channelName?: string;
  viewerText?: string;
}

export interface ChiringuitoResolutionPayload {
  success?: boolean;
  isLiveNow?: boolean;
  sourceKind?: 'youtube_live' | 'youtube_recent' | 'mega_tdt';
  activeStream?: ChiringuitoCandidateBrief | null;
  insideStream?: ChiringuitoCandidateBrief | null;
  mainStream?: ChiringuitoCandidateBrief | null;
  candidates?: ChiringuitoCandidateBrief[];
  megaTdtUrl?: string;
}

export interface HalftimeBreakSnapshot {
  matchVideoState: VideoState;
  chiringuitoStreamKey: string;
  chiringuitoTitle: string;
  homeTeam: string;
  awayTeam: string;
  competition?: string;
  autoReturnEnabled: boolean;
  switchedAt: number;
}

function normStr(val?: string | null): string {
  return String(val || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function isBarcaOrMadridMatch(
  homeTeam?: string,
  awayTeam?: string,
  videoTitle?: string,
  competition?: string
): boolean {
  const compNorm = normStr(competition);
  if (
    /\b(nba|acb|euroliga|euroleague|baloncesto|basketball|futsal|liga\s*f|wchampions|femenin[oa]?|women|femeni)\b/.test(
      compNorm
    )
  ) {
    return false;
  }
  const combined = normStr(`${homeTeam || ''} ${awayTeam || ''} ${videoTitle || ''}`);
  if (!combined) return false;
  if (
    /\b(castilla|atletic|femenin[oa]?|femeni|women|baloncesto|basketball|u19|u21)\b/.test(
      combined
    )
  ) {
    return false;
  }
  return /\b(barcelona|fc barcelona|barca|real madrid|r madrid)\b/.test(combined);
}

export function isHalftimeStatus(statusState?: string, statusLabel?: string): boolean {
  const lbl = normStr(statusLabel);
  if (!lbl) return false;
  if (statusState === 'finished') return false;
  return (
    /^(ht|descanso|half[- ]?time|intermedio|entre ?tiempo|mitad)$/i.test(lbl) ||
    /\b(descanso|half[- ]?time|halftime|entre ?tiempo)\b/i.test(lbl)
  );
}

export function isSecondHalfResumedStatus(
  statusState?: string,
  statusLabel?: string,
  hadHalftime = false
): boolean {
  if (!hadHalftime || statusState !== 'live') return false;
  if (isHalftimeStatus(statusState, statusLabel)) return false;
  const lbl = normStr(statusLabel);
  if (!lbl) return false;
  // Never confuse 1st-half added time (e.g. 45+2') with 2nd half kickoff
  if (/^45\s*\+/.test(lbl)) return false;
  if (/(?:^|\b)(2[aª]?\s*parte|2nd\s*half|segunda\s*parte|2h)(?:\b|$)/i.test(lbl)) return true;
  const minMatch = lbl.match(/^(\d{1,3})\s*(?:'|min|\+)?/);
  if (minMatch) {
    const minute = Number(minMatch[1]);
    return Number.isFinite(minute) && minute >= 46;
  }
  return false;
}

export function useHalftimeChiringuitoBreak(args: {
  videoState: VideoState;
  activeSportsMatch: ActiveSportsMatchMeta | null;
  activeMatchDetails: FootballMatchDetails | null;
  userName: string;
  onSyncAction: (
    action: 'play' | 'pause' | 'seek' | 'change_url',
    patch: Partial<VideoState>
  ) => void;
}) {
  const { videoState, activeSportsMatch, activeMatchDetails, userName, onSyncAction } = args;

  const [snapshot, setSnapshot] = useState<HalftimeBreakSnapshot | null>(null);
  const [liveProbe, setLiveProbe] = useState<ChiringuitoResolutionPayload | null>(null);
  const [isSwitching, setIsSwitching] = useState(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [dismissedHalftimeKey, setDismissedHalftimeKey] = useState<string>('');
  const seenHalftimeForMatchRef = useRef<string>('');
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const homeTeam = activeMatchDetails?.homeTeam || activeSportsMatch?.homeTeam || '';
  const awayTeam = activeMatchDetails?.awayTeam || activeSportsMatch?.awayTeam || '';
  const competition = activeMatchDetails?.tournamentName || activeSportsMatch?.competition || '';
  const statusState = activeMatchDetails?.statusState || activeSportsMatch?.statusState;
  const statusLabel = activeMatchDetails?.statusLabel ?? activeSportsMatch?.statusLabel;
  const homeScore = activeMatchDetails?.homeScore ?? activeSportsMatch?.homeScore ?? '0';
  const awayScore = activeMatchDetails?.awayScore ?? activeSportsMatch?.awayScore ?? '0';

  const isTargetMatch =
    Boolean(activeSportsMatch || snapshot) &&
    isBarcaOrMadridMatch(
      snapshot?.homeTeam || homeTeam,
      snapshot?.awayTeam || awayTeam,
      snapshot?.matchVideoState.title || videoState.title,
      snapshot?.competition || competition
    );

  const matchIdentityKey = `${normStr(homeTeam)}_${normStr(awayTeam)}`;
  const isCurrentlyHalftime = isTargetMatch && isHalftimeStatus(statusState, statusLabel);
  const isWatchingChiringuitoBreak = Boolean(
    snapshot &&
      videoState.mode !== 'idle' &&
      (videoState.url === snapshot.chiringuitoStreamKey ||
        videoState.rawSourceUrl?.startsWith('chiringuito://'))
  );

  const showNotice = useCallback((msg: string) => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    setStatusNotice(msg);
    noticeTimerRef.current = setTimeout(() => setStatusNotice(null), 5000);
  }, []);

  useEffect(() => {
    if (isCurrentlyHalftime && matchIdentityKey) {
      seenHalftimeForMatchRef.current = matchIdentityKey;
    }
  }, [isCurrentlyHalftime, matchIdentityKey]);

  // Pre-resolve Chiringuito Inside live YouTube streams (across all channels) as soon as halftime begins
  useEffect(() => {
    if (!isCurrentlyHalftime || liveProbe) return;
    let cancelled = false;
    const matchQuery = [homeTeam, awayTeam].filter(Boolean).join(' ').trim();
    const qs = matchQuery ? `&match=${encodeURIComponent(matchQuery)}` : '';
    fetch(`/api/sports/chiringuito-live?prefer=inside${qs}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: ChiringuitoResolutionPayload | null) => {
        if (!cancelled && data?.success) setLiveProbe(data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [isCurrentlyHalftime, liveProbe, homeTeam, awayTeam]);

  const returnToSavedMatch = useCallback(
    (reason: 'manual' | 'auto_resume') => {
      if (!snapshot) return;
      const saved = snapshot.matchVideoState;
      setSnapshot(null);
      onSyncAction('change_url', {
        ...saved,
        isPlaying: true,
        lastUpdated: Date.now(),
        updatedBy: userName,
      });
      if (reason === 'auto_resume') {
        showNotice('¡2ª parte iniciada! Volviendo al partido en directo...');
      }
    },
    [snapshot, onSyncAction, userName, showNotice]
  );

  // Clear snapshot if user stops playback or navigates to an unrelated stream
  useEffect(() => {
    if (!snapshot) return;
    if (videoState.mode === 'idle') {
      setSnapshot(null);
      return;
    }
    if (
      videoState.url !== snapshot.chiringuitoStreamKey &&
      videoState.url !== snapshot.matchVideoState.url &&
      !videoState.rawSourceUrl?.startsWith('chiringuito://')
    ) {
      setSnapshot(null);
    }
  }, [snapshot, videoState.mode, videoState.url, videoState.rawSourceUrl]);

  // Automatic return to the match when 2nd half resumes
  useEffect(() => {
    if (!snapshot || !snapshot.autoReturnEnabled || !isWatchingChiringuitoBreak) return;
    const hadHt = seenHalftimeForMatchRef.current === `${normStr(snapshot.homeTeam)}_${normStr(snapshot.awayTeam)}`;
    if (isSecondHalfResumedStatus(statusState, statusLabel, hadHt)) {
      returnToSavedMatch('auto_resume');
    }
  }, [snapshot, isWatchingChiringuitoBreak, statusState, statusLabel, returnToSavedMatch]);

  const refreshChiringuitoProbe = useCallback(async () => {
    const matchQuery = [homeTeam, awayTeam].filter(Boolean).join(' ').trim();
    const qs = matchQuery ? `&match=${encodeURIComponent(matchQuery)}` : '';
    const res = await fetch(`/api/sports/chiringuito-live?prefer=inside&refresh=1${qs}`);
    const payload = (await res.json().catch(() => null)) as ChiringuitoResolutionPayload | null;
    if (payload?.success) setLiveProbe(payload);
    return payload;
  }, [homeTeam, awayTeam]);

  const switchToChiringuitoInside = useCallback(
    async (prefer: 'inside' | 'mega' = 'inside', explicitCandidate?: ChiringuitoCandidateBrief) => {
      if (isSwitching || videoState.mode === 'idle') return;
      setIsSwitching(true);
      try {
        let payload = liveProbe;
        if (prefer === 'inside' && (!payload || !payload.activeStream?.videoId)) {
          payload = await refreshChiringuitoProbe();
        }

        const savedMatchVideo: VideoState = snapshot?.matchVideoState || { ...videoState };
        const pool = (payload?.candidates || []).filter((c) => Boolean(c.videoId));
        const picked =
          explicitCandidate ||
          payload?.activeStream ||
          payload?.insideStream ||
          payload?.mainStream ||
          pool[0] ||
          null;

        const ytCandidates: ChiringuitoCandidateBrief[] = [];
        if (picked?.videoId) ytCandidates.push(picked);
        for (const c of pool) {
          if (c.videoId !== picked?.videoId && ytCandidates.length < 4) {
            ytCandidates.push(c);
          }
        }

        const tracks: StreamTrack[] = [
          ...ytCandidates.map((cand, idx) => ({
            id: `chiringuito-yt-${cand.videoId}`,
            label:
              idx === 0
                ? `${cand.channelName || 'Chiringuito Inside'} · Directo YT${cand.viewerText ? ` (${cand.viewerText})` : ''}`
                : `Señal YT ${idx + 1}: ${cand.channelName || cand.title.slice(0, 26)}`,
            lang: 'ES',
            quality: '1080p',
            sourceUrl: 'chiringuito://inside',
            resolverType: 'youtube' as const,
            resolvedStreamUrl: cand.videoId,
          })),
          {
            id: 'chiringuito-mega-hd',
            label: 'MEGA TV · Señal 1080p HD',
            lang: 'ES',
            quality: '1080p',
            sourceUrl: payload?.megaTdtUrl || '/api/belix/stream/743032.m3u8',
            resolverType: 'direct_hls',
          },
        ];

        let targetMode: VideoState['mode'] = 'youtube';
        let targetUrl = picked?.videoId || '';
        let targetRaw = 'chiringuito://inside';
        let targetTitle = picked?.title
          ? `${picked.channelName ? `${picked.channelName} · ` : ''}${picked.title}`
          : 'Chiringuito Inside · Descanso';

        if (prefer === 'mega' || !targetUrl) {
          const megaSrc = payload?.megaTdtUrl || '/api/belix/stream/743032.m3u8';
          const extRes = await fetch(
            `/api/extract/stream?url=${encodeURIComponent(megaSrc)}&resolverType=direct_hls&title=${encodeURIComponent('El Chiringuito · MEGA HD')}`
          );
          const extData = await extRes.json().catch(() => null);
          if (!extRes.ok || !extData?.success || !extData?.streamUrl) {
            showNotice('Chiringuito Inside y Mega TV no responden ahora mismo.');
            return;
          }
          targetMode = extData.mode || 'hls';
          targetUrl = extData.streamUrl;
          targetRaw = megaSrc;
          targetTitle = 'El Chiringuito de Jugones · MEGA HD';
        }

        setSnapshot({
          matchVideoState: savedMatchVideo,
          chiringuitoStreamKey: targetUrl,
          chiringuitoTitle: targetTitle,
          homeTeam: snapshot?.homeTeam || homeTeam || 'FC Barcelona / Real Madrid',
          awayTeam: snapshot?.awayTeam || awayTeam || 'LaLiga',
          competition: snapshot?.competition || competition,
          autoReturnEnabled: snapshot?.autoReturnEnabled ?? true,
          switchedAt: Date.now(),
        });

        const activeIdx = targetMode === 'youtube' ? 0 : tracks.length - 1;
        onSyncAction('change_url', {
          mode: targetMode,
          url: targetUrl,
          rawSourceUrl: targetRaw,
          title: targetTitle,
          subtitle: `Descanso (${homeTeam} vs ${awayTeam}) · Auto-retorno activo`,
          isLive: true,
          isPlaying: true,
          currentTime: 0,
          tracks,
          activeTrackIndex: activeIdx,
          lastUpdated: Date.now(),
          updatedBy: userName,
        });
      } finally {
        setIsSwitching(false);
      }
    },
    [
      isSwitching,
      videoState,
      liveProbe,
      refreshChiringuitoProbe,
      snapshot,
      homeTeam,
      awayTeam,
      competition,
      onSyncAction,
      userName,
      showNotice,
    ]
  );

  const toggleAutoReturn = useCallback(() => {
    setSnapshot((prev) =>
      prev ? { ...prev, autoReturnEnabled: !prev.autoReturnEnabled } : prev
    );
  }, []);

  const showPrompt =
    isCurrentlyHalftime &&
    !isWatchingChiringuitoBreak &&
    dismissedHalftimeKey !== matchIdentityKey;

  return {
    showPrompt,
    isWatchingChiringuitoBreak,
    isSwitching,
    statusNotice,
    liveProbe,
    snapshot,
    matchSummary: {
      homeTeam: snapshot?.homeTeam || homeTeam,
      awayTeam: snapshot?.awayTeam || awayTeam,
      homeScore,
      awayScore,
      statusLabel: statusLabel || 'Descanso',
    },
    switchToChiringuitoInside,
    refreshChiringuitoProbe,
    returnToSavedMatch: () => returnToSavedMatch('manual'),
    toggleAutoReturn,
    dismissPrompt: () => setDismissedHalftimeKey(matchIdentityKey),
  };
}

export type HalftimeChiringuitoState = ReturnType<typeof useHalftimeChiringuitoBreak>;
