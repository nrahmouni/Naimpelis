import React, { useEffect, useRef } from 'react';
import { socketService } from '../services/socket';
import { playCinemaSound } from '../utils/haptics';
import { pickLang } from '../utils/i18n';
import type {
  AppLanguage,
  Participant,
  TvRemoteCommandType,
  VideoState,
} from '../types';

interface UseTvRoomPollingOptions {
  inRoom: boolean;
  isTvMode: boolean;
  roomId: string;
  roomName: string;
  lang: AppLanguage;
  profileId: string;
  profileName: string;
  tvAuthToken: string;
  sessionPinMap: Record<string, string>;
  setRoomName: React.Dispatch<React.SetStateAction<string>>;
  setParticipants: React.Dispatch<React.SetStateAction<Participant[]>>;
  setVideoState: React.Dispatch<React.SetStateAction<VideoState>>;
  setPinPromptState: React.Dispatch<
    React.SetStateAction<{
      open: boolean;
      roomName: string;
      invalidAttempt: boolean;
    }>
  >;
  setTvClaimStatus: React.Dispatch<
    React.SetStateAction<{
      type: 'success' | 'error';
      message: string;
    } | null>
  >;
  tvClaimTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
}

export function useTvRoomPolling({
  inRoom,
  isTvMode,
  roomId,
  roomName,
  lang,
  profileId,
  profileName,
  tvAuthToken,
  sessionPinMap,
  setRoomName,
  setParticipants,
  setVideoState,
  setPinPromptState,
  setTvClaimStatus,
  tvClaimTimerRef,
}: UseTvRoomPollingOptions) {
  const lastTvRemoteSeqRef = useRef<number>(0);

  // HTTP Polling Sync Fallback when running in Smart TV Mode (Samsung Tizen / LG webOS)
  // Guarantees room playback + remote control work 100% even if TV browser blocks WebSockets
  useEffect(() => {
    if (!inRoom || !isTvMode || !roomId) return;
    let cancelled = false;

    const pollRoomForTv = async () => {
      if (cancelled || socketService.isConnected()) return;
      try {
        const params = new URLSearchParams({
          tv: '1',
          tvId: `${profileId}-tv`,
          tvName: profileName || 'Samsung Smart TV',
        });
        if (tvAuthToken) params.set('tvAuthToken', tvAuthToken);
        const savedPin = sessionPinMap[roomId.toLowerCase()];
        if (savedPin) params.set('pin', savedPin);

        const res = await fetch(
          `/api/rooms/${encodeURIComponent(roomId)}?${params.toString()}`
        );
        if (res.status === 403) {
          const errData = await res.json().catch(() => ({}));
          if (!cancelled && errData?.hasPin) {
            setPinPromptState({
              open: true,
              roomName: errData.roomName || `Sala ${roomId.toUpperCase()}`,
              invalidAttempt: false,
            });
          }
          return;
        }
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;

        if (data?.name) setRoomName(data.name);
        if (Array.isArray(data?.participants)) setParticipants(data.participants);

        if (data?.videoState) {
          setVideoState((prev) => {
            const rawNext = data.videoState as VideoState;
            const offsetMs = socketService.serverClockOffsetMs || 0;
            const next: VideoState =
              Number.isFinite(rawNext.lastUpdated) && rawNext.lastUpdated > 0 && Math.abs(offsetMs) >= 150
                ? { ...rawNext, lastUpdated: rawNext.lastUpdated - offsetMs }
                : rawNext;
            const urlChanged = next.url !== prev.url || next.mode !== prev.mode;
            const playChanged = next.isPlaying !== prev.isPlaying;
            const trackChanged = next.activeTrackIndex !== prev.activeTrackIndex;
            const now = Date.now();
            const prevElapsed =
              prev.isPlaying && !prev.isLive && prev.lastUpdated > 0
                ? Math.max(0, (now - prev.lastUpdated) / 1000)
                : 0;
            const nextElapsed =
              next.isPlaying && !next.isLive && next.lastUpdated > 0
                ? Math.max(0, (now - next.lastUpdated) / 1000)
                : 0;
            const prevExpected = (prev.currentTime || 0) + prevElapsed;
            const nextExpected = (next.currentTime || 0) + nextElapsed;
            const timeDrift = !next.isLive && Math.abs(nextExpected - prevExpected) > 3.5;

            if (urlChanged || playChanged || trackChanged || timeDrift) {
              return next;
            }
            return prev;
          });
        }

        if (
          data?.lastTvRemoteCommand &&
          typeof data.lastTvRemoteCommand.seq === 'number' &&
          data.lastTvRemoteCommand.seq > lastTvRemoteSeqRef.current
        ) {
          const isInitialSync = lastTvRemoteSeqRef.current === 0;
          lastTvRemoteSeqRef.current = data.lastTvRemoteCommand.seq;
          if (!isInitialSync && Date.now() - Number(data.lastTvRemoteCommand.ts || 0) < 8000) {
            socketService.emitLocal({
              type: 'TV_REMOTE_COMMAND',
              payload: data.lastTvRemoteCommand,
            });
          }
        }
      } catch {
        // ignore transient network error
      }
    };

    pollRoomForTv();
    const interval = setInterval(pollRoomForTv, 2200);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [
    inRoom,
    isTvMode,
    roomId,
    profileId,
    profileName,
    tvAuthToken,
    sessionPinMap,
    setRoomName,
    setParticipants,
    setVideoState,
    setPinPromptState,
  ]);

  const handleClaimTvCode = async (fourDigitCode: string) => {
    setTvClaimStatus(null);
    if (tvClaimTimerRef.current) clearTimeout(tvClaimTimerRef.current);

    try {
      const res = await fetch('/api/tv/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: fourDigitCode,
          roomId,
          roomName: roomName || `Sala ${roomId.toUpperCase()}`,
          claimedBy: profileName,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        playCinemaSound('join');
        setTvClaimStatus({
          type: 'success',
          message: pickLang(lang, {
            es: '✓ Smart TV vinculada y proyectando en esta sala',
            ca: '✓ Smart TV vinculada i projectant en aquesta sala',
            en: '✓ Smart TV paired and projecting in this room',
          }),
        });
      } else {
        setTvClaimStatus({
          type: 'error',
          message:
            data?.error ||
            pickLang(lang, {
              es: 'Código de TV no encontrado o caducado.',
              ca: 'Codi de TV no trobat o caducat.',
              en: 'TV code not found or expired.',
            }),
        });
      }
      tvClaimTimerRef.current = setTimeout(() => {
        setTvClaimStatus(null);
      }, 5000);
    } catch {
      // Fallback to WebSocket claim if fetch failed
      socketService.claimTvPairingCode(
        fourDigitCode,
        roomName || `Sala ${roomId.toUpperCase()}`,
        profileName
      );
    }
  };

  const handleSendTvRemoteCommand = (cmd: TvRemoteCommandType) => {
    if (socketService.isConnected()) {
      socketService.sendTvRemoteCommand(cmd, profileName);
    } else {
      fetch('/api/tv/remote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId,
          command: cmd,
          senderName: profileName,
          userId: profileId,
        }),
      }).catch(() => {});
    }
  };

  return {
    handleClaimTvCode,
    handleSendTvRemoteCommand,
  };
}
