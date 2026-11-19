import React from 'react';
import { RefreshCw, Trophy, Youtube } from 'lucide-react';
import type { CatalogMovie } from '../../types';
import { triggerHaptic } from '../../utils/haptics';
import { playKidsSound } from './kidsAudioEngine';
import type { KidsUiCopy } from './kidsI18n';
import { KidsSquishButton } from './KidsPrimitives';
import { KidsVocabSvg } from './KidsSvgArt';
import type { YouTubePlayerInstance } from '../player/playerTypes';

let ytApiPromise: Promise<void> | null = null;
export function loadYouTubeIframeApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  if (ytApiPromise) return ytApiPromise;

  ytApiPromise = new Promise<void>((resolve) => {
    const prevReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prevReady?.();
      resolve();
    };
    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      tag.async = true;
      document.head.appendChild(tag);
    }
    window.setTimeout(resolve, 4500);
  });
  return ytApiPromise;
}

export function extractYouTubeVideoId(item: CatalogMovie): string {
  if (item.bingetrixUrl && /^[a-zA-Z0-9_-]{8,16}$/.test(item.bingetrixUrl)) {
    return item.bingetrixUrl;
  }
  if (item.id.startsWith('yt-')) {
    return item.id.slice(3);
  }
  return '';
}

export function formatSec(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '0:00';
  const total = Math.floor(sec);
  const mins = Math.floor(total / 60);
  const rem = total % 60;
  return `${mins}:${rem < 10 ? '0' : ''}${rem}`;
}

export interface KidsMagicPausePayload {
  word: string;
  targetId: string;
  choices: Array<{ id: string; iconId: string; label: string }>;
}

interface KidsPlayerStageOverlaysProps {
  t: KidsUiCopy;
  streamError: string | null;
  isEnded: boolean;
  magicPauseData: KidsMagicPausePayload | null;
  suggestions: CatalogMovie[];
  soundEnabled: boolean;
  ytPlayerRef: React.MutableRefObject<YouTubePlayerInstance | null>;
  onRetryStream: () => void;
  onReplayEnded: () => void;
  onClose: () => void;
  onSelectItem?: (nextItem: CatalogMovie) => void;
  onMagicAnswer: (choiceId: string, targetId: string) => void;
  onDismissMagicPause: () => void;
}

export const KidsPlayerStageOverlays: React.FC<KidsPlayerStageOverlaysProps> = ({
  t,
  streamError,
  isEnded,
  magicPauseData,
  suggestions,
  soundEnabled,
  ytPlayerRef,
  onRetryStream,
  onReplayEnded,
  onClose,
  onSelectItem,
  onMagicAnswer,
  onDismissMagicPause,
}) => (
  <>
    {streamError && (
      <div className="absolute inset-0 z-30 bg-[#0F1636]/95 flex flex-col items-center justify-center p-6 text-center gap-4">
        <Youtube className="w-12 h-12 text-rose-400" />
        <p className="font-display font-bold text-base sm:text-lg text-white max-w-md">
          {streamError}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <KidsSquishButton
            onClick={onRetryStream}
            className="px-5 rounded-2xl bg-amber-400 border-b-4 border-amber-600 text-slate-950 font-black text-sm flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            <span>{t.gameRetryBtn}</span>
          </KidsSquishButton>
          <KidsSquishButton
            onClick={onClose}
            className="px-5 rounded-2xl bg-white/15 border-b-4 border-black/40 text-white font-black text-sm"
          >
            {t.theaterBackToKids}
          </KidsSquishButton>
        </div>
      </div>
    )}

    {isEnded && (
      <div className="absolute inset-0 z-30 bg-[#0D1433]/92 backdrop-blur-md flex flex-col items-center justify-center p-5 text-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-amber-400/20 border border-amber-300/40 flex items-center justify-center">
          <Trophy className="w-9 h-9 text-amber-300" />
        </div>
        <h3 className="font-display font-black text-2xl sm:text-3xl text-amber-300">
          {t.theaterEarnedFiveStars}
        </h3>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <KidsSquishButton
            onClick={() => {
              onReplayEnded();
              ytPlayerRef.current?.seekTo?.(0, true);
              ytPlayerRef.current?.playVideo();
            }}
            className="px-5 rounded-2xl bg-sky-400 border-b-4 border-sky-600 text-slate-950 font-black text-sm flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            <span>{t.gameRetryBtn}</span>
          </KidsSquishButton>
          <KidsSquishButton
            onClick={onClose}
            className="px-5 rounded-2xl bg-white/15 border-b-4 border-black/40 text-white font-black text-sm"
          >
            {t.theaterBackToKids}
          </KidsSquishButton>
        </div>

        {suggestions.length > 0 && onSelectItem && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 w-full max-w-2xl pt-2">
            {suggestions.map((next) => (
              <button
                key={next.id}
                type="button"
                data-tv-focusable="true"
                onClick={() => {
                  triggerHaptic('medium');
                  onSelectItem(next);
                }}
                className="rounded-2xl bg-[#1A2552] hover:bg-[#253470] border-2 border-[#364994] p-2 text-start flex items-center gap-2.5 cursor-pointer transition-colors"
              >
                {next.poster && (
                  <img
                    src={next.poster}
                    alt={next.title}
                    referrerPolicy="no-referrer"
                    className="w-20 h-12 rounded-xl object-cover shrink-0 bg-black"
                  />
                )}
                <span className="font-display font-bold text-xs text-white line-clamp-2">
                  {next.title}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    )}

    {magicPauseData && (
      <div className="absolute inset-0 z-40 bg-[#0B112B]/95 backdrop-blur-md flex flex-col items-center justify-center p-5 text-center gap-4">
        <span className="px-3 py-1 rounded-full bg-indigo-500/25 border border-indigo-300/40 text-indigo-200 text-xs font-black uppercase">
          Pausa Mágica Educativa · +3 Estrellas
        </span>
        <h3 className="font-display font-black text-2xl sm:text-3xl text-amber-300">
          ¿Cuál es &ldquo;{magicPauseData.word}&rdquo;?
        </h3>
        <div className="grid grid-cols-3 gap-3 max-w-md w-full">
          {magicPauseData.choices.map((ch) => (
            <button
              key={ch.id}
              type="button"
              data-tv-focusable="true"
              onClick={() => {
                if (ch.id === magicPauseData.targetId) {
                  playKidsSound('levelUp', soundEnabled, true);
                } else {
                  playKidsSound('error', soundEnabled, false);
                }
                onMagicAnswer(ch.id, magicPauseData.targetId);
              }}
              className="p-3 rounded-2xl bg-[#182352] hover:bg-[#233270] border-2 border-white/15 flex flex-col items-center gap-1.5 cursor-pointer"
            >
              <KidsVocabSvg iconId={ch.iconId} size={52} />
              <span className="text-xs font-black text-white">{ch.label}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onDismissMagicPause}
          className="text-xs font-bold text-sky-300 hover:underline cursor-pointer"
        >
          Continuar vídeo
        </button>
      </div>
    )}
  </>
);
