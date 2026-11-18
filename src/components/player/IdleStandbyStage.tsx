import React from 'react';
import { ArrowLeft, Film, Sparkles, Trophy, Tv, Youtube } from 'lucide-react';
import type { AppLanguage } from '../../types';
import { UI_COPY, pickLang } from '../../utils/i18n';
import {
  RiffanExitFullscreenIcon,
  RiffanFullscreenIcon,
  RiffanLiveIcon,
  RiffanWarningIcon,
} from '../ui/RiffanIcons';

interface IdleStandbyStageProps {
  lang: AppLanguage;
  isTvMode: boolean;
  isFullscreen: boolean;
  roomCode?: string;
  roomDisplayName?: string;
  participantCount: number;
  extractionError?: string | null;
  onToggleFullscreen: (e?: React.MouseEvent) => void;
  onExitTvMode?: () => void;
  onOpenCatalogSection?: (section: 'movies' | 'series' | 'anime' | 'tdt' | 'sports' | 'youtube') => void;
}

export const IdleStandbyStage: React.FC<IdleStandbyStageProps> = ({
  lang,
  isTvMode,
  isFullscreen,
  roomCode,
  roomDisplayName,
  participantCount,
  extractionError,
  onToggleFullscreen,
  onExitTvMode,
  onOpenCatalogSection,
}) => {
  const t = UI_COPY[lang];

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center p-5 sm:p-8 text-center bg-gradient-to-b from-[#18181B] via-[#0E0E10] to-[#09090B]">
      {isTvMode && (
        <div className="mb-4 px-4 py-1.5 rounded-full bg-[#00F593]/15 border border-[#00F593]/40 text-xs sm:text-sm font-semibold text-[#00F593] flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#00F593]" />
          <span>
            {pickLang(lang, {
              es: `${roomDisplayName || `Sala ${(roomCode || '').toUpperCase()}`} · ${participantCount} ${participantCount === 1 ? 'conectado' : 'conectados'}`,
              ca: `${roomDisplayName || `Sala ${(roomCode || '').toUpperCase()}`} · ${participantCount} ${participantCount === 1 ? 'connectat' : 'connectats'}`,
              en: `${roomDisplayName || `Room ${(roomCode || '').toUpperCase()}`} · ${participantCount} connected`,
            })}
          </span>
        </div>
      )}
      <div className="w-12 h-12 rounded-2xl bg-[#9146FF]/15 border border-[#9146FF]/35 flex items-center justify-center mb-3 shadow-[0_0_30px_rgba(145,70,255,0.22)]">
        <Tv className="w-6 h-6 text-[#BF94FF]" />
      </div>
      <h3 className="font-display font-semibold text-base sm:text-2xl text-white text-balance">
        {isTvMode
          ? pickLang(lang, {
              es: 'Televisor listo para proyectar en 1080p',
              ca: 'Televisor preparat per projectar en 1080p',
              en: 'TV ready to project in 1080p',
            })
          : t.standbyTitle}
      </h3>
      <p className="text-xs sm:text-base text-zinc-400 max-w-lg mt-1.5">
        {isTvMode
          ? pickLang(lang, {
              es: 'Elige una película, serie, partido en directo o vídeo de YouTube desde tu móvil y empezará aquí automáticamente.',
              ca: 'Tria una pel·lícula, sèrie, partit en directe o vídeo de YouTube des del mòbil i començarà aquí automàticament.',
              en: 'Pick any movie, series, live match, or YouTube video on your phone and it will play here automatically.',
            })
          : t.standbySub}
      </p>
      {isTvMode && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={onToggleFullscreen}
            className="min-h-[46px] px-5 rounded-2xl bg-[#9146FF] hover:bg-[#772CE8] text-xs sm:text-sm font-bold text-white flex items-center gap-2 cursor-pointer transition-colors shadow-[0_12px_30px_rgba(145,70,255,0.35)]"
          >
            {isFullscreen ? (
              <>
                <RiffanExitFullscreenIcon size={16} tone="current" />
                <span>
                  {pickLang(lang, {
                    es: 'Salir Pantalla Completa',
                    ca: 'Sortir Pantalla Completa',
                    en: 'Exit Fullscreen',
                  })}
                </span>
              </>
            ) : (
              <>
                <RiffanFullscreenIcon size={16} tone="current" />
                <span>
                  {pickLang(lang, {
                    es: 'Poner TV en Pantalla Completa',
                    ca: 'Posar TV en Pantalla Completa',
                    en: 'Enter TV Fullscreen',
                  })}
                </span>
              </>
            )}
          </button>

          {onExitTvMode && (
            <button
              type="button"
              onClick={onExitTvMode}
              className="min-h-[46px] px-5 rounded-2xl bg-[#26262C] hover:bg-white/[0.14] border border-white/15 text-xs sm:text-sm font-semibold text-zinc-200 flex items-center gap-2 cursor-pointer transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>
                {pickLang(lang, {
                  es: 'Cambiar código o salir de Modo TV',
                  ca: 'Canviar codi o sortir de Mode TV',
                  en: 'Switch code or exit TV Mode',
                })}
              </span>
            </button>
          )}
        </div>
      )}

      {extractionError && (
        <div className="mt-3 px-3.5 py-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-200 max-w-md flex items-center gap-2">
          <RiffanWarningIcon size={16} animate="always" className="text-rose-400" />
          <span>{extractionError}</span>
        </div>
      )}

      {onOpenCatalogSection && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => onOpenCatalogSection('movies')}
            className="min-h-[44px] px-4 rounded-xl bg-[#9146FF] hover:bg-[#772CE8] text-xs sm:text-sm font-semibold text-white flex items-center gap-2 whitespace-nowrap cursor-pointer transition-colors"
          >
            <Film className="w-4 h-4" />
            <span>{t.tabMovies}</span>
          </button>
          <button
            type="button"
            onClick={() => onOpenCatalogSection('series')}
            className="min-h-[44px] px-4 rounded-xl bg-[#1F1F23] hover:bg-[#26262C] border border-white/10 text-xs sm:text-sm font-medium text-zinc-200 flex items-center gap-2 whitespace-nowrap cursor-pointer transition-colors"
          >
            <Tv className="w-4 h-4 text-[#BF94FF]" />
            <span>{t.tabSeries}</span>
          </button>
          <button
            type="button"
            onClick={() => onOpenCatalogSection('anime')}
            className="min-h-[44px] px-4 rounded-xl bg-[#1F1F23] hover:bg-[#26262C] border border-white/10 text-xs sm:text-sm font-medium text-zinc-200 flex items-center gap-2 whitespace-nowrap cursor-pointer transition-colors"
          >
            <Sparkles className="w-4 h-4 text-[#F47521]" />
            <span>Anime</span>
          </button>
          <button
            type="button"
            onClick={() => onOpenCatalogSection('tdt')}
            className="min-h-[44px] px-4 rounded-xl bg-[#1F1F23] hover:bg-[#26262C] border border-white/10 text-xs sm:text-sm font-medium text-zinc-200 flex items-center gap-2 whitespace-nowrap cursor-pointer transition-colors"
          >
            <RiffanLiveIcon size={16} animate="always" className="text-[#EB0400]" />
            <span>{t.tabTdt}</span>
          </button>
          <button
            type="button"
            onClick={() => onOpenCatalogSection('sports')}
            className="min-h-[44px] px-4 rounded-xl bg-[#1F1F23] hover:bg-[#26262C] border border-white/10 text-xs sm:text-sm font-medium text-zinc-200 flex items-center gap-2 whitespace-nowrap cursor-pointer transition-colors"
          >
            <Trophy className="w-4 h-4 text-amber-400" />
            <span>{t.tabSports}</span>
          </button>
          <button
            type="button"
            onClick={() => onOpenCatalogSection('youtube')}
            className="min-h-[44px] px-4 rounded-xl bg-[#1F1F23] hover:bg-[#26262C] border border-white/10 text-xs sm:text-sm font-medium text-zinc-200 flex items-center gap-2 whitespace-nowrap cursor-pointer transition-colors"
          >
            <Youtube className="w-4 h-4 text-[#EB0400]" />
            <span>YouTube</span>
          </button>
        </div>
      )}
    </div>
  );
};
