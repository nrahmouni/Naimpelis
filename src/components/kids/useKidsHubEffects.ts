import { useEffect, type MutableRefObject } from 'react';
import type { KidsProgressState } from './kidsData';

export function useKidsHubEffects(params: {
  isTvActive: boolean;
  bedtimeMode: boolean;
  lullabyPlaying: boolean;
  lullabyIntervalRef: MutableRefObject<number | null>;
  exitPromptSeq: number;
  timerMinutes?: number | null;
  timerStartedAt?: number | null;
  tickActiveMinute: () => void;
  setIsOffline: (v: boolean) => void;
  setRemainingMins: (v: number | null) => void;
  openPinModal: (intent?: 'exit' | 'parent_settings' | 'cast_tv') => void;
  onUpdatePrefs?: (patch: Partial<KidsProgressState['parentPrefs']>) => void;
}) {
  const {
    isTvActive,
    bedtimeMode,
    lullabyPlaying,
    lullabyIntervalRef,
    exitPromptSeq,
    timerMinutes,
    timerStartedAt,
    tickActiveMinute,
    setIsOffline,
    setRemainingMins,
    openPinModal,
  } = params;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onOnline = () => setIsOffline(false);
    const onOffline = () => setIsOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [setIsOffline]);

  useEffect(() => {
    if (isTvActive && typeof document !== 'undefined') {
      document.documentElement.classList.add('tv-dpad-active', 'is-google-tv');
    }
  }, [isTvActive]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        tickActiveMinute();
      }
    }, 60_000);
    return () => window.clearInterval(id);
  }, [tickActiveMinute]);

  useEffect(() => {
    if (!bedtimeMode || !lullabyPlaying || typeof window === 'undefined') {
      if (lullabyIntervalRef.current) {
        window.clearInterval(lullabyIntervalRef.current);
        lullabyIntervalRef.current = null;
      }
      return;
    }

    const notes = [392.0, 440.0, 493.88, 392.0, 329.63, 293.66];
    let step = 0;
    let ctx: AudioContext | null = null;
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AC) ctx = new AC();
    } catch {
      ctx = null;
    }

    const playSoftNote = () => {
      if (!ctx) return;
      try {
        if (ctx.state === 'suspended') void ctx.resume();
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(notes[step % notes.length], now);
        step += 1;
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.045, now + 0.08);
        gain.gain.exponentialRampToValueAtTime(0.0005, now + 0.85);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.9);
      } catch {
        // ignore WebAudio restrictions
      }
    };

    playSoftNote();
    lullabyIntervalRef.current = window.setInterval(playSoftNote, 950);

    return () => {
      if (lullabyIntervalRef.current) {
        window.clearInterval(lullabyIntervalRef.current);
        lullabyIntervalRef.current = null;
      }
      if (ctx) {
        void ctx.close().catch(() => {});
      }
    };
  }, [bedtimeMode, lullabyPlaying, lullabyIntervalRef]);

  useEffect(() => {
    if (exitPromptSeq > 0) {
      openPinModal('exit');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exitPromptSeq]);

  useEffect(() => {
    if (!timerMinutes || !timerStartedAt) {
      setRemainingMins(null);
      return;
    }
    const update = () => {
      const elapsedMs = Date.now() - timerStartedAt;
      const left = Math.max(0, Math.ceil((timerMinutes * 60_000 - elapsedMs) / 60_000));
      setRemainingMins(left);
    };
    update();
    const id = window.setInterval(update, 15_000);
    return () => window.clearInterval(id);
  }, [timerMinutes, timerStartedAt, setRemainingMins]);
}
