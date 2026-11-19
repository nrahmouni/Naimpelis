import React from 'react';
import { Heart, Play, RefreshCw, X } from 'lucide-react';
import type {
  AppLanguage,
  CatalogMovie,
  TvEpisodeItem,
  TvSeriesDetails,
  WatchHistoryItem,
} from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import { FlagBadgeSvg, MediaLanguageSelector } from '../ui/LanguageBadge';

interface SeriesPickerHeaderProps {
  lang: AppLanguage;
  selectedSeries: TvSeriesDetails;
  seriesModalLang: string;
  forceSpanishSeriesActive: boolean;
  loadingSeriesDetails: boolean;
  probingSeriesLangs: boolean;
  seriesBookmarkPayload: CatalogMovie;
  seriesSaved: boolean;
  selectedSeriesHistory?: WatchHistoryItem;
  allSeasonEpisodes: TvEpisodeItem[];
  onClose: () => void;
  onSeriesModalLangChange: (code: string) => void;
  onOpenSeriesDetails: (
    tmdbId: number,
    seasonNum: number,
    seedShow?: Partial<CatalogMovie>,
    forceSpanishProbe?: boolean
  ) => void;
  onToggleBookmark: (item: CatalogMovie, e: React.MouseEvent) => void;
  onReplayHistoryItem: (item: WatchHistoryItem, forceRestart?: boolean) => void;
  onPlaySeriesEpisode: (
    series: TvSeriesDetails,
    episode: TvEpisodeItem,
    preferLang: string,
    opts?: { forceSpanish?: boolean }
  ) => void;
}

export const SeriesPickerHeader: React.FC<SeriesPickerHeaderProps> = ({
  lang,
  selectedSeries,
  seriesModalLang,
  forceSpanishSeriesActive,
  loadingSeriesDetails,
  probingSeriesLangs,
  seriesBookmarkPayload,
  seriesSaved,
  selectedSeriesHistory,
  allSeasonEpisodes,
  onClose,
  onSeriesModalLangChange,
  onOpenSeriesDetails,
  onToggleBookmark,
  onReplayHistoryItem,
  onPlaySeriesEpisode,
}) => (
  <div className="relative px-3.5 py-3 sm:px-6 sm:py-4 bg-gradient-to-b from-[#131522] to-[#090A10] border-b border-white/[0.08] space-y-2.5 sm:space-y-3 shrink-0">
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1 overflow-x-auto no-scrollbar">
        <button
          type="button"
          onClick={(e) => onToggleBookmark(seriesBookmarkPayload, e)}
          className="min-h-[40px] px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs font-semibold text-white flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
        >
          <Heart
            className={`w-3.5 h-3.5 shrink-0 ${
              seriesSaved ? 'fill-current text-[#E11D48]' : 'text-zinc-300'
            }`}
          />
          <span>
            {seriesSaved
              ? pickLang(lang, { es: 'Guardada', ca: 'Desada', en: 'Saved' })
              : pickLang(lang, { es: 'Guardar', ca: 'Desar', en: 'Save' })}
          </span>
        </button>

        <MediaLanguageSelector
          labelPrefix={pickLang(lang, { es: 'Idioma:', ca: 'Idioma:', en: 'Language:' })}
          selectedLang={seriesModalLang}
          availableLangs={
            Array.isArray(selectedSeries.availableLanguages) &&
            selectedSeries.availableLanguages.length > 0
              ? selectedSeries.availableLanguages
              : ['ES', 'LAT', 'VOSE', 'EN']
          }
          onSelectLang={(code) => {
            triggerHaptic('light');
            onSeriesModalLangChange(code);
          }}
          probing={probingSeriesLangs}
          size="sm"
        />

        <button
          type="button"
          disabled={probingSeriesLangs}
          onClick={() => {
            triggerHaptic('medium');
            onOpenSeriesDetails(
              selectedSeries.tmdbId,
              selectedSeries.activeSeason,
              selectedSeries,
              true
            );
          }}
          className={`min-h-[40px] px-3 rounded-xl border text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors disabled:opacity-60 ${
            forceSpanishSeriesActive
              ? 'bg-[#9146FF]/25 border-[#BF94FF]/60 text-white'
              : 'bg-white/[0.06] hover:bg-white/[0.12] border-[#BF94FF]/35 text-[#EFEFF1]'
          }`}
        >
          <RefreshCw
            className={`w-3.5 h-3.5 shrink-0 text-[#BF94FF] ${
              probingSeriesLangs ? 'animate-spin' : ''
            }`}
          />
          <FlagBadgeSvg code="es" className="w-4 h-2.5 shrink-0" />
          <span>
            {pickLang(lang, {
              es: 'Forzar Castellano',
              ca: 'Forçar Castellà',
              en: 'Force Spanish (ES)',
            })}
          </span>
        </button>
      </div>

      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar serie"
        className="min-h-[40px] min-w-[40px] rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-white flex items-center justify-center shrink-0 cursor-pointer transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>

    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="text-[11px] sm:text-xs text-zinc-400 flex items-center gap-1.5 whitespace-nowrap overflow-hidden">
          <span className="text-[#BF94FF] font-semibold">
            {pickLang(lang, { es: 'Serie TV', ca: 'Sèrie TV', en: 'TV Series' })}
          </span>
          <span aria-hidden="true">·</span>
          <span className="text-zinc-200 tabular-nums">{selectedSeries.year}</span>
          {selectedSeries.rating && (
            <>
              <span aria-hidden="true">·</span>
              <span className="text-zinc-200 font-mono font-semibold tabular-nums">
                ★ {selectedSeries.rating}
              </span>
            </>
          )}
          <span aria-hidden="true">·</span>
          <span className="tabular-nums text-zinc-200 truncate">
            {selectedSeries.seasons.length}{' '}
            {selectedSeries.seasons.length === 1
              ? pickLang(lang, { es: 'Temporada', ca: 'Temporada', en: 'Season' })
              : pickLang(lang, { es: 'Temporadas', ca: 'Temporades', en: 'Seasons' })}
          </span>
        </div>
        <h3 className="font-display font-bold text-lg sm:text-2xl text-white leading-snug line-clamp-1 sm:line-clamp-2 text-balance">
          {selectedSeries.title}
        </h3>
        {selectedSeries.overview && (
          <p className="hidden sm:block text-xs text-zinc-400 line-clamp-1">
            {selectedSeries.overview}
          </p>
        )}
      </div>

      {selectedSeriesHistory?.season && selectedSeriesHistory?.episode ? (
        <button
          type="button"
          onClick={() => {
            triggerHaptic('success');
            onReplayHistoryItem(selectedSeriesHistory, false);
            onClose();
          }}
          className="min-h-[44px] px-3.5 sm:px-4 rounded-2xl bg-[#9146FF] hover:bg-[#7C2AE8] text-xs font-bold text-white flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors shadow-lg shadow-[#9146FF]/25"
        >
          <Play className="w-4 h-4 fill-current shrink-0" />
          <span className="tabular-nums">
            {pickLang(lang, {
              es: `Seguir T${selectedSeriesHistory.season} · Cap. ${selectedSeriesHistory.episode}`,
              ca: `Seguir T${selectedSeriesHistory.season} · Cap. ${selectedSeriesHistory.episode}`,
              en: `Resume S${selectedSeriesHistory.season} · Ep ${selectedSeriesHistory.episode}`,
            })}
          </span>
        </button>
      ) : allSeasonEpisodes.length > 0 ? (
        <button
          type="button"
          onClick={() => {
            triggerHaptic('success');
            onPlaySeriesEpisode(
              selectedSeries,
              allSeasonEpisodes[0],
              forceSpanishSeriesActive ? 'ES' : seriesModalLang,
              forceSpanishSeriesActive ? { forceSpanish: true } : undefined
            );
            onClose();
          }}
          className="min-h-[44px] px-3.5 sm:px-4 rounded-2xl bg-[#9146FF] hover:bg-[#7C2AE8] text-xs font-bold text-white flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors shadow-lg shadow-[#9146FF]/25"
        >
          <Play className="w-4 h-4 fill-current shrink-0" />
          <span className="tabular-nums">
            {pickLang(lang, {
              es: `Ver T${selectedSeries.activeSeason} · Cap. ${allSeasonEpisodes[0].episodeNumber}`,
              ca: `Veure T${selectedSeries.activeSeason} · Cap. ${allSeasonEpisodes[0].episodeNumber}`,
              en: `Play S${selectedSeries.activeSeason} · Ep ${allSeasonEpisodes[0].episodeNumber}`,
            })}
          </span>
        </button>
      ) : null}
    </div>

    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pt-0.5">
      {selectedSeries.seasons.map((s) => {
        const isActiveSeason = selectedSeries.activeSeason === s.seasonNumber;
        return (
          <button
            key={s.seasonNumber}
            type="button"
            onClick={() => {
              if (s.seasonNumber === selectedSeries.activeSeason && !loadingSeriesDetails) {
                return;
              }
              triggerHaptic('light');
              onOpenSeriesDetails(selectedSeries.tmdbId, s.seasonNumber);
            }}
            className={`min-h-[40px] px-3.5 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors border ${
              isActiveSeason
                ? 'bg-[#9146FF] text-white border-[#9146FF] shadow-[0_4px_16px_rgba(145,70,255,0.35)]'
                : 'bg-white/[0.05] hover:bg-white/[0.11] text-zinc-200 border-white/[0.1]'
            }`}
          >
            <span className="tabular-nums">
              {pickLang(lang, {
                es: `Temporada ${s.seasonNumber}`,
                ca: `Temporada ${s.seasonNumber}`,
                en: `Season ${s.seasonNumber}`,
              })}
            </span>
            {s.episodeCount > 0 && (
              <span
                className={`text-[11px] font-normal tabular-nums ${
                  isActiveSeason ? 'text-purple-200' : 'text-zinc-400'
                }`}
              >
                · {s.episodeCount} cap.
              </span>
            )}
          </button>
        );
      })}
    </div>
  </div>
);
