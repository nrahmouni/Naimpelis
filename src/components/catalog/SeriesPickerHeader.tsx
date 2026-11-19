import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Heart,
  Play,
  RefreshCw,
  Share2,
  X,
} from 'lucide-react';
import type {
  AppLanguage,
  CatalogMovie,
  TvEpisodeItem,
  TvSeriesDetails,
  WatchHistoryItem,
} from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import { shareDedicatedLink } from '../../utils/shareDedicatedLink';
import { PosterImage } from '../ui/PosterImage';
import { RiffanSpinner } from '../ui/RiffanIcons';
import {
  FlagBadgeSvg,
  LANGUAGE_LABELS,
  normalizeLangCode,
} from '../ui/LanguageBadge';

interface SeriesPickerHeaderProps {
  lang: AppLanguage;
  shareRoomId?: string;
  selectedSeries: TvSeriesDetails;
  seriesModalLang: string;
  forceSpanishSeriesActive: boolean;
  loadingSeriesDetails: boolean;
  probingSeriesLangs: boolean;
  seriesBookmarkPayload: CatalogMovie;
  seriesSaved: boolean;
  selectedSeriesHistory?: WatchHistoryItem;
  allSeasonEpisodes: TvEpisodeItem[];
  episodeSortDesc: boolean;
  onToggleSortDesc: () => void;
  onBack: () => void;
  onCloseAll: () => void;
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
  shareRoomId,
  selectedSeries,
  seriesModalLang,
  forceSpanishSeriesActive,
  loadingSeriesDetails,
  probingSeriesLangs,
  seriesBookmarkPayload,
  seriesSaved,
  selectedSeriesHistory,
  allSeasonEpisodes,
  episodeSortDesc,
  onToggleSortDesc,
  onBack,
  onCloseAll,
  onSeriesModalLangChange,
  onOpenSeriesDetails,
  onToggleBookmark,
  onReplayHistoryItem,
  onPlaySeriesEpisode,
}) => {
  const [synopsisExpanded, setSynopsisExpanded] = useState(false);
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [seasonMenuOpen, setSeasonMenuOpen] = useState(false);

  const langMenuRef = useRef<HTMLDivElement | null>(null);
  const seasonMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSynopsisExpanded(false);
    setLangMenuOpen(false);
    setSeasonMenuOpen(false);
  }, [selectedSeries.tmdbId]);

  useEffect(() => {
    setSeasonMenuOpen(false);
  }, [selectedSeries.activeSeason]);

  useEffect(() => {
    if (!langMenuOpen && !seasonMenuOpen) return undefined;
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (langMenuOpen && langMenuRef.current && !langMenuRef.current.contains(target)) {
        setLangMenuOpen(false);
      }
      if (seasonMenuOpen && seasonMenuRef.current && !seasonMenuRef.current.contains(target)) {
        setSeasonMenuOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLangMenuOpen(false);
        setSeasonMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [langMenuOpen, seasonMenuOpen]);

  const sortedSeasons = useMemo(() => {
    return [...(selectedSeries.seasons || [])].sort(
      (a, b) => a.seasonNumber - b.seasonNumber
    );
  }, [selectedSeries.seasons]);

  const currentSeasonIdx = sortedSeasons.findIndex(
    (s) => s.seasonNumber === selectedSeries.activeSeason
  );
  const prevSeason = currentSeasonIdx > 0 ? sortedSeasons[currentSeasonIdx - 1] : null;
  const nextSeason =
    currentSeasonIdx >= 0 && currentSeasonIdx < sortedSeasons.length - 1
      ? sortedSeasons[currentSeasonIdx + 1]
      : null;

  const activeSeasonSummary = sortedSeasons.find(
    (s) => s.seasonNumber === selectedSeries.activeSeason
  );
  const activeSeasonEpCount =
    allSeasonEpisodes.length > 0
      ? allSeasonEpisodes.length
      : activeSeasonSummary?.episodeCount || 0;

  const availableLangs = useMemo(() => {
    const raw =
      Array.isArray(selectedSeries.availableLanguages) &&
      selectedSeries.availableLanguages.length > 0
        ? selectedSeries.availableLanguages
        : (['ES', 'LAT', 'VOSE', 'EN'] as const);
    return Array.from(new Set(raw.map((c) => normalizeLangCode(c))));
  }, [selectedSeries.availableLanguages]);

  const activeNormLang = normalizeLangCode(seriesModalLang);
  const activeLangMeta = LANGUAGE_LABELS[activeNormLang];

  const hasHistory = Boolean(
    selectedSeriesHistory?.season && selectedSeriesHistory?.episode
  );
  const historyMatchesActiveSeason = Boolean(
    hasHistory && selectedSeriesHistory?.season === selectedSeries.activeSeason
  );
  const showSeparateResumeShortcut = Boolean(
    hasHistory && !historyMatchesActiveSeason && allSeasonEpisodes.length > 0
  );

  const heroImage = selectedSeries.backdrop || selectedSeries.poster;
  const overviewText = (selectedSeries.overview || '').trim();
  const isLongOverview = overviewText.length > 105;

  return (
    <div className="relative bg-[#090A10] shrink-0">
      {/* 1. COMPACT STREAMING HERO WITH BACKDROP + SCRIM */}
      <div className="relative w-full overflow-hidden">
        {heroImage && (
          <div className="absolute inset-0 pointer-events-none">
            <PosterImage
              src={heroImage}
              alt={selectedSeries.title}
              aspect="none"
              priority
              className="w-full h-full"
              imgClassName="w-full h-full object-cover object-center opacity-55 sm:opacity-65 scale-[1.03]"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#090A10] via-[#090A10]/72 to-black/55" />
            <div className="hidden sm:block absolute inset-0 bg-gradient-to-r from-[#090A10]/85 via-transparent to-[#090A10]/40" />
          </div>
        )}

        {/* Top Chrome: Back (<-) Left + Discrete Save / Share / Close Right */}
        <div className="relative z-10 px-3 pt-2.5 sm:px-5 sm:pt-3.5 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onBack();
            }}
            aria-label={pickLang(lang, {
              es: 'Volver atrás',
              ca: 'Tornar enrere',
              en: 'Go back',
            })}
            className="w-10 h-10 rounded-full bg-black/55 hover:bg-black/80 backdrop-blur-md border border-white/15 text-white flex items-center justify-center shrink-0 cursor-pointer active:scale-95 transition-all"
          >
            <ArrowLeft className="w-4.5 h-4.5" />
          </button>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={(e) => onToggleBookmark(seriesBookmarkPayload, e)}
              aria-label={
                seriesSaved
                  ? pickLang(lang, { es: 'Quitar de guardadas', ca: 'Treure de desades', en: 'Remove from saved' })
                  : pickLang(lang, { es: 'Guardar serie', ca: 'Desar sèrie', en: 'Save series' })
              }
              title={
                seriesSaved
                  ? pickLang(lang, { es: 'Guardada', ca: 'Desada', en: 'Saved' })
                  : pickLang(lang, { es: 'Guardar', ca: 'Desar', en: 'Save' })
              }
              className={`w-10 h-10 rounded-full backdrop-blur-md border flex items-center justify-center shrink-0 cursor-pointer active:scale-95 transition-all ${
                seriesSaved
                  ? 'bg-rose-500/25 border-rose-400/50 text-rose-400'
                  : 'bg-black/55 hover:bg-black/80 border-white/15 text-white'
              }`}
            >
              <Heart className={`w-4 h-4 ${seriesSaved ? 'fill-current' : ''}`} />
            </button>

            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                void shareDedicatedLink({
                  target: {
                    kind: 'series',
                    tmdbId: selectedSeries.tmdbId,
                    title: selectedSeries.title,
                    season: selectedSeries.activeSeason,
                  },
                  roomId: shareRoomId,
                  title: selectedSeries.title,
                });
              }}
              aria-label={pickLang(lang, { es: 'Compartir serie', ca: 'Compartir sèrie', en: 'Share series' })}
              title={pickLang(lang, { es: 'Compartir', ca: 'Compartir', en: 'Share' })}
              className="w-10 h-10 rounded-full bg-black/55 hover:bg-black/80 backdrop-blur-md border border-white/15 text-white flex items-center justify-center shrink-0 cursor-pointer active:scale-95 transition-all"
            >
              <Share2 className="w-4 h-4 text-[#D8B4FE]" />
            </button>

            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onCloseAll();
              }}
              aria-label={pickLang(lang, { es: 'Cerrar', ca: 'Tancar', en: 'Close' })}
              className="w-10 h-10 rounded-full bg-black/55 hover:bg-black/80 backdrop-blur-md border border-white/15 text-white flex items-center justify-center shrink-0 cursor-pointer active:scale-95 transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Hero Metadata + Title */}
        <div className="relative z-10 px-3.5 pt-4 pb-2 sm:px-6 sm:pt-7 sm:pb-2.5 space-y-1">
          <div className="text-[11px] sm:text-xs text-zinc-300 flex items-center flex-wrap gap-x-1.5 gap-y-0.5 tabular-nums">
            <span className="text-[#BF94FF] font-semibold">
              {pickLang(lang, { es: 'Serie TV', ca: 'Sèrie TV', en: 'TV Series' })}
            </span>
            {selectedSeries.year && (
              <>
                <span aria-hidden="true" className="text-zinc-500">·</span>
                <span className="text-zinc-200">{selectedSeries.year}</span>
              </>
            )}
            {selectedSeries.rating && (
              <>
                <span aria-hidden="true" className="text-zinc-500">·</span>
                <span className="text-amber-300 font-mono font-semibold">
                  ★ {selectedSeries.rating}
                </span>
              </>
            )}
            <span aria-hidden="true" className="text-zinc-500">·</span>
            <span className="text-zinc-200">
              {sortedSeasons.length}{' '}
              {sortedSeasons.length === 1
                ? pickLang(lang, { es: 'temporada', ca: 'temporada', en: 'season' })
                : pickLang(lang, { es: 'temporadas', ca: 'temporades', en: 'seasons' })}
            </span>
          </div>

          <h3 className="font-display font-extrabold text-xl sm:text-3xl text-white leading-tight tracking-tight text-balance drop-shadow-[0_2px_10px_rgba(0,0,0,0.85)]">
            {selectedSeries.title}
          </h3>
        </div>
      </div>

      {/* 2. COLLAPSIBLE SYNOPSIS */}
      {overviewText && (
        <div className="px-3.5 pb-2 sm:px-6 sm:pb-2.5">
          <p
            className={`text-xs text-zinc-300/90 leading-relaxed ${
              synopsisExpanded ? '' : 'line-clamp-2'
            }`}
          >
            {overviewText}
          </p>
          {isLongOverview && (
            <button
              type="button"
              onClick={() => setSynopsisExpanded((v) => !v)}
              className="mt-0.5 text-[11px] font-semibold text-[#C4A7FF] hover:text-white cursor-pointer"
            >
              {synopsisExpanded
                ? pickLang(lang, { es: 'Ver menos', ca: 'Veure menys', en: 'Show less' })
                : pickLang(lang, { es: 'Leer sinopsis completa', ca: 'Llegir sinopsi completa', en: 'Read more' })}
            </button>
          )}
        </div>
      )}

      {/* 3. PRIMARY PLAY CTA + COMPACT LANGUAGE POPOVER (WITH FORCE CASTILIAN INSIDE) */}
      <div className="px-3.5 pb-2.5 sm:px-6 sm:pb-3 flex items-center gap-2">
        {historyMatchesActiveSeason && selectedSeriesHistory ? (
          <button
            type="button"
            onClick={() => {
              triggerHaptic('success');
              onReplayHistoryItem(selectedSeriesHistory, false);
            }}
            className="flex-1 sm:flex-initial min-h-[44px] px-4 sm:px-5 rounded-xl bg-[#9146FF] hover:bg-[#7C2AE8] text-xs sm:text-sm font-bold text-white flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer active:scale-[0.98] transition-all shadow-[0_8px_24px_rgba(145,70,255,0.34)]"
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
            }}
            className="flex-1 sm:flex-initial min-h-[44px] px-4 sm:px-5 rounded-xl bg-[#9146FF] hover:bg-[#7C2AE8] text-xs sm:text-sm font-bold text-white flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer active:scale-[0.98] transition-all shadow-[0_8px_24px_rgba(145,70,255,0.34)]"
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
        ) : hasHistory && selectedSeriesHistory ? (
          <button
            type="button"
            onClick={() => {
              triggerHaptic('success');
              onReplayHistoryItem(selectedSeriesHistory, false);
            }}
            className="flex-1 sm:flex-initial min-h-[44px] px-4 sm:px-5 rounded-xl bg-[#9146FF] hover:bg-[#7C2AE8] text-xs sm:text-sm font-bold text-white flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer active:scale-[0.98] transition-all shadow-[0_8px_24px_rgba(145,70,255,0.34)]"
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
        ) : null}

        {showSeparateResumeShortcut && selectedSeriesHistory && (
          <button
            type="button"
            onClick={() => {
              triggerHaptic('success');
              onReplayHistoryItem(selectedSeriesHistory, false);
            }}
            title={pickLang(lang, {
              es: `Reanudar donde lo dejaste (T${selectedSeriesHistory.season} Cap. ${selectedSeriesHistory.episode})`,
              ca: `Reprendre on ho vas deixar (T${selectedSeriesHistory.season} Cap. ${selectedSeriesHistory.episode})`,
              en: `Resume where you left off (S${selectedSeriesHistory.season} Ep ${selectedSeriesHistory.episode})`,
            })}
            className="min-h-[44px] px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/12 text-xs font-semibold text-zinc-200 flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors tabular-nums"
          >
            <Play className="w-3 h-3 text-[#BF94FF] fill-current shrink-0" />
            <span>
              T{selectedSeriesHistory.season}·E{selectedSeriesHistory.episode}
            </span>
          </button>
        )}

        {/* Compact Language Chip with Integrated "Force Spanish" Popover */}
        <div ref={langMenuRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setLangMenuOpen((v) => !v);
            }}
            aria-haspopup="listbox"
            aria-expanded={langMenuOpen}
            aria-label={pickLang(lang, {
              es: `Idioma de audio: ${activeLangMeta.title}`,
              ca: `Idioma d'àudio: ${activeLangMeta.title}`,
              en: `Audio language: ${activeLangMeta.title}`,
            })}
            className={`min-h-[44px] px-3 rounded-xl border text-xs font-bold flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${
              forceSpanishSeriesActive
                ? 'bg-[#9146FF]/18 hover:bg-[#9146FF]/28 border-[#BF94FF]/55 text-white'
                : 'bg-white/[0.06] hover:bg-white/[0.12] border-white/12 text-white'
            }`}
          >
            <FlagBadgeSvg code={activeLangMeta.flag} className="w-4.5 h-3 shrink-0" />
            <span>{activeLangMeta.short}</span>
            {probingSeriesLangs ? (
              <RiffanSpinner size={13} className="shrink-0" />
            ) : (
              <ChevronDown
                className={`w-3.5 h-3.5 text-zinc-400 transition-transform ${
                  langMenuOpen ? 'rotate-180 text-[#BF94FF]' : ''
                }`}
              />
            )}
          </button>

          {langMenuOpen && (
            <div
              role="listbox"
              className="absolute right-0 mt-2 z-[120] w-60 rounded-2xl bg-[#10121E]/98 backdrop-blur-2xl border border-white/15 p-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.9)] space-y-1"
            >
              <div className="px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-zinc-400">
                {pickLang(lang, {
                  es: 'Idioma de reproducción',
                  ca: 'Idioma de reproducció',
                  en: 'Playback audio',
                })}
              </div>

              <div className="space-y-0.5">
                {availableLangs.map((code) => {
                  const meta = LANGUAGE_LABELS[code];
                  const isSelected = code === activeNormLang;
                  return (
                    <button
                      key={code}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        triggerHaptic('light');
                        onSeriesModalLangChange(code);
                        setLangMenuOpen(false);
                      }}
                      className={`w-full min-h-[38px] px-2.5 py-1.5 rounded-xl flex items-center justify-between gap-2 text-left text-xs font-semibold cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-[#9146FF]/25 text-white border border-[#9146FF]/45'
                          : 'text-zinc-200 hover:bg-white/[0.08]'
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <FlagBadgeSvg code={meta.flag} className="w-4.5 h-3 shrink-0" />
                        <span className="truncate">{meta.title}</span>
                      </span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-[#BF94FF] shrink-0" />}
                    </button>
                  );
                })}
              </div>

              <div className="border-t border-white/[0.08] pt-1">
                <button
                  type="button"
                  disabled={probingSeriesLangs}
                  onClick={() => {
                    triggerHaptic('medium');
                    setLangMenuOpen(false);
                    onOpenSeriesDetails(
                      selectedSeries.tmdbId,
                      selectedSeries.activeSeason,
                      selectedSeries,
                      true
                    );
                  }}
                  className="w-full min-h-[38px] px-2.5 py-1.5 rounded-xl bg-white/[0.05] hover:bg-[#9146FF]/20 text-left text-xs font-semibold text-[#E9D5FF] flex items-center gap-2 cursor-pointer transition-colors disabled:opacity-60"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 text-[#BF94FF] shrink-0 ${
                      probingSeriesLangs ? 'animate-spin' : ''
                    }`}
                  />
                  <span className="truncate">
                    {pickLang(lang, {
                      es: 'Forzar búsqueda en Castellano',
                      ca: 'Forçar cerca en Castellà',
                      en: 'Force Spanish (ES) search',
                    })}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 4. SINGLE-LINE COMPACT SEASON SWITCHER + EPISODE SORT BAR */}
      <div className="px-3.5 py-2 sm:px-6 bg-[#0C0E16] border-t border-b border-white/[0.07] flex items-center justify-between gap-2">
        <div ref={seasonMenuRef} className="relative flex items-center gap-1 min-w-0">
          {sortedSeasons.length > 1 ? (
            <>
              <button
                type="button"
                disabled={!prevSeason || loadingSeriesDetails}
                onClick={() => {
                  if (!prevSeason) return;
                  triggerHaptic('light');
                  onOpenSeriesDetails(selectedSeries.tmdbId, prevSeason.seasonNumber);
                }}
                aria-label={pickLang(lang, {
                  es: 'Temporada anterior',
                  ca: 'Temporada anterior',
                  en: 'Previous season',
                })}
                className="w-9 h-9 rounded-xl bg-white/[0.05] hover:bg-white/[0.12] disabled:opacity-30 disabled:pointer-events-none border border-white/10 text-zinc-200 flex items-center justify-center shrink-0 cursor-pointer transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setSeasonMenuOpen((v) => !v);
                }}
                aria-haspopup="listbox"
                aria-expanded={seasonMenuOpen}
                className="min-h-[38px] px-3 rounded-xl bg-white/[0.07] hover:bg-white/[0.12] border border-white/12 text-xs sm:text-sm font-bold text-white flex items-center gap-2 whitespace-nowrap cursor-pointer transition-colors min-w-0"
              >
                <span className="truncate tabular-nums">
                  {pickLang(lang, {
                    es: `Temporada ${selectedSeries.activeSeason}`,
                    ca: `Temporada ${selectedSeries.activeSeason}`,
                    en: `Season ${selectedSeries.activeSeason}`,
                  })}
                  {activeSeasonEpCount > 0 ? ` · ${activeSeasonEpCount} cap.` : ''}
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-[#BF94FF] shrink-0 transition-transform ${
                    seasonMenuOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              <button
                type="button"
                disabled={!nextSeason || loadingSeriesDetails}
                onClick={() => {
                  if (!nextSeason) return;
                  triggerHaptic('light');
                  onOpenSeriesDetails(selectedSeries.tmdbId, nextSeason.seasonNumber);
                }}
                aria-label={pickLang(lang, {
                  es: 'Siguiente temporada',
                  ca: 'Següent temporada',
                  en: 'Next season',
                })}
                className="w-9 h-9 rounded-xl bg-white/[0.05] hover:bg-white/[0.12] disabled:opacity-30 disabled:pointer-events-none border border-white/10 text-zinc-200 flex items-center justify-center shrink-0 cursor-pointer transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              {seasonMenuOpen && (
                <div
                  role="listbox"
                  className="absolute left-0 top-full mt-1.5 z-[120] w-64 max-w-[82vw] max-h-64 overflow-y-auto custom-scrollbar rounded-2xl bg-[#10121E]/98 backdrop-blur-2xl border border-white/15 p-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.92)] space-y-0.5"
                >
                  {sortedSeasons.map((s) => {
                    const isActive = s.seasonNumber === selectedSeries.activeSeason;
                    return (
                      <button
                        key={s.seasonNumber}
                        type="button"
                        role="option"
                        aria-selected={isActive}
                        onClick={() => {
                          setSeasonMenuOpen(false);
                          if (s.seasonNumber === selectedSeries.activeSeason && !loadingSeriesDetails) {
                            return;
                          }
                          triggerHaptic('light');
                          onOpenSeriesDetails(selectedSeries.tmdbId, s.seasonNumber);
                        }}
                        className={`w-full min-h-[40px] px-3 py-2 rounded-xl flex items-center justify-between gap-2 text-left text-xs font-semibold cursor-pointer transition-colors tabular-nums ${
                          isActive
                            ? 'bg-[#9146FF] text-white font-bold shadow-sm'
                            : 'text-zinc-200 hover:bg-white/[0.08]'
                        }`}
                      >
                        <span>
                          {pickLang(lang, {
                            es: `Temporada ${s.seasonNumber}`,
                            ca: `Temporada ${s.seasonNumber}`,
                            en: `Season ${s.seasonNumber}`,
                          })}
                        </span>
                        <span className="flex items-center gap-1.5 text-[11px] opacity-85 shrink-0">
                          {s.episodeCount > 0 && <span>{s.episodeCount} cap.</span>}
                          {isActive && <Check className="w-3.5 h-3.5 shrink-0" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <span className="text-xs sm:text-sm font-bold text-white tabular-nums">
              {pickLang(lang, {
                es: `Temporada ${selectedSeries.activeSeason}`,
                ca: `Temporada ${selectedSeries.activeSeason}`,
                en: `Season ${selectedSeries.activeSeason}`,
              })}
              {activeSeasonEpCount > 0 ? ` · ${activeSeasonEpCount} cap.` : ''}
            </span>
          )}
        </div>

        {!loadingSeriesDetails && allSeasonEpisodes.length > 4 && (
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onToggleSortDesc();
            }}
            className="min-h-[38px] px-2.5 sm:px-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-[11px] sm:text-xs font-semibold text-zinc-200 flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
            title={
              episodeSortDesc
                ? pickLang(lang, {
                    es: 'Ordenado de últimos a primeros',
                    ca: 'Ordenat dels últims als primers',
                    en: 'Sorted newest first',
                  })
                : pickLang(lang, {
                    es: 'Ordenado del capítulo 1 al final',
                    ca: 'Ordenat del capítol 1 al final',
                    en: 'Sorted episode 1 to end',
                  })
            }
          >
            <ArrowUpDown className="w-3.5 h-3.5 text-[#BF94FF] shrink-0" />
            <span className="tabular-nums">
              {episodeSortDesc
                ? pickLang(lang, {
                    es: `${allSeasonEpisodes.length} → 1`,
                    ca: `${allSeasonEpisodes.length} → 1`,
                    en: `${allSeasonEpisodes.length} → 1`,
                  })
                : `1 → ${allSeasonEpisodes.length}`}
            </span>
          </button>
        )}
      </div>
    </div>
  );
};
