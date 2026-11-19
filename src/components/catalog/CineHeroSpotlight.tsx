import React, { useRef } from 'react';
import { motion } from 'motion/react';
import { Check, Play, Plus } from 'lucide-react';
import type { AppLanguage, CatalogMovie } from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import { RiffanChevronLeftIcon, RiffanChevronRightIcon } from '../ui/RiffanIcons';

interface CineHeroSpotlightProps {
  lang: AppLanguage;
  isSeriesTab: boolean;
  heroSlides: CatalogMovie[];
  heroSlideIndex: number;
  effectiveCineCastellano: boolean;
  cineAudioOverride: 'ES' | 'VOSE' | 'EN';
  onChangeHeroSlideIndex: React.Dispatch<React.SetStateAction<number>>;
  onHeroHoverChange: (hovered: boolean) => void;
  isBookmarked: (item: CatalogMovie) => boolean;
  onToggleBookmark: (item: CatalogMovie, e: React.MouseEvent) => void;
  onOpenPosterItem: (item: CatalogMovie) => void;
  onOpenSeriesDetails: (tmdbId: number, seasonNum: number, seed?: CatalogMovie) => void;
  onPlayMovie: (
    movie: CatalogMovie,
    preferLang: string,
    opts?: { forceSpanish?: boolean }
  ) => void;
}

export const CineHeroSpotlight: React.FC<CineHeroSpotlightProps> = ({
  lang,
  isSeriesTab,
  heroSlides,
  heroSlideIndex,
  effectiveCineCastellano,
  cineAudioOverride,
  onChangeHeroSlideIndex,
  onHeroHoverChange,
  isBookmarked,
  onToggleBookmark,
  onOpenPosterItem,
  onOpenSeriesDetails,
  onPlayMovie,
}) => {
  const heroTouchStartXRef = useRef<number | null>(null);
  const activeHeroIdx = heroSlides.length > 0 ? heroSlideIndex % heroSlides.length : 0;
  const activeHeroSlide = heroSlides[activeHeroIdx] || null;

  if (!activeHeroSlide) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
      onTouchStart={(e) => {
        heroTouchStartXRef.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        if (heroTouchStartXRef.current === null) return;
        const endX = e.changedTouches[0]?.clientX ?? heroTouchStartXRef.current;
        const dx = endX - heroTouchStartXRef.current;
        heroTouchStartXRef.current = null;
        if (Math.abs(dx) > 40 && heroSlides.length > 1) {
          onChangeHeroSlideIndex((prev) =>
            dx < 0
              ? (prev + 1) % heroSlides.length
              : (prev - 1 + heroSlides.length) % heroSlides.length
          );
        }
      }}
      onMouseEnter={() => onHeroHoverChange(true)}
      onMouseLeave={() => onHeroHoverChange(false)}
      className="group relative w-full min-h-[250px] sm:min-h-[310px] aspect-[4/3] sm:aspect-[21/9] rounded-3xl overflow-hidden bg-[#101118] border border-white/[0.1] shadow-[0_22px_54px_rgba(0,0,0,0.6)]"
    >
      <img
        src={activeHeroSlide.backdrop || activeHeroSlide.poster}
        alt={activeHeroSlide.title}
        referrerPolicy="no-referrer"
        className="w-full h-full object-cover object-center sm:group-hover:scale-[1.02] transition-transform duration-700"
      />
      {/* Dual multi-stop scrim guaranteeing crisp text legibility */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#0B0B0F] via-[#0B0B0F]/60 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#0B0B0F]/85 via-[#0B0B0F]/35 to-transparent" />

      {/* Desktop prev/next spotlight arrows */}
      {heroSlides.length > 1 && (
        <>
          <button
            type="button"
            aria-label="Anterior"
            onClick={() =>
              onChangeHeroSlideIndex((prev) => (prev - 1 + heroSlides.length) % heroSlides.length)
            }
            className="hidden sm:flex absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/55 hover:bg-[#9146FF] border border-white/15 items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
          >
            <RiffanChevronLeftIcon size={18} tone="current" animate="none" />
          </button>
          <button
            type="button"
            aria-label="Siguiente"
            onClick={() => onChangeHeroSlideIndex((prev) => (prev + 1) % heroSlides.length)}
            className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/55 hover:bg-[#9146FF] border border-white/15 items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
          >
            <RiffanChevronRightIcon size={18} tone="current" animate="none" />
          </button>
        </>
      )}

      <div className="absolute inset-x-0 bottom-0 p-4 sm:p-7 flex flex-col gap-3 max-w-2xl">
        <button
          type="button"
          onClick={() =>
            onOpenPosterItem({ ...activeHeroSlide, mediaType: isSeriesTab ? 'tv' : 'movie' })
          }
          className="text-left space-y-1.5 cursor-pointer focus:outline-none"
        >
          <p className="text-[11px] font-bold uppercase tracking-widest text-[#D8B4FE]">
            {isSeriesTab
              ? pickLang(lang, { es: 'Serie destacada', ca: 'Sèrie destacada', en: 'Featured series' })
              : pickLang(lang, { es: 'Estreno destacado', ca: 'Estrena destacada', en: 'Featured cinema' })}
          </p>
          <h3 className="font-display font-black text-2xl sm:text-3xl text-white leading-tight line-clamp-2 text-balance">
            {activeHeroSlide.title}
          </h3>
          <p className="text-xs sm:text-sm text-zinc-200 tabular-nums truncate">
            {[
              activeHeroSlide.year,
              activeHeroSlide.rating ? `★ ${activeHeroSlide.rating}` : '',
              ...(Array.isArray(activeHeroSlide.genres)
                ? activeHeroSlide.genres.slice(0, 2)
                : []),
              activeHeroSlide.seasonsCount
                ? `${activeHeroSlide.seasonsCount} ${pickLang(lang, {
                    es: activeHeroSlide.seasonsCount === 1 ? 'Temp.' : 'Temps.',
                    ca: activeHeroSlide.seasonsCount === 1 ? 'Temp.' : 'Temps.',
                    en: activeHeroSlide.seasonsCount === 1 ? 'Season' : 'Seasons',
                  })}`
                : '',
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </button>

        <div className="flex items-center justify-between gap-3 pt-0.5">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('success');
                if (isSeriesTab && activeHeroSlide.tmdbId) {
                  onOpenSeriesDetails(activeHeroSlide.tmdbId, 1, activeHeroSlide);
                } else {
                  onPlayMovie(
                    activeHeroSlide,
                    effectiveCineCastellano ? 'ES' : cineAudioOverride,
                    effectiveCineCastellano ? { forceSpanish: true } : undefined
                  );
                }
              }}
              className="min-h-[44px] px-5 sm:px-6 rounded-2xl bg-[#9146FF] hover:bg-[#7C2AE8] text-xs sm:text-sm font-bold text-white inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer active:scale-95 transition-all shadow-[0_8px_22px_rgba(145,70,255,0.45)]"
            >
              <Play className="w-4 h-4 fill-current shrink-0" />
              <span>
                {isSeriesTab
                  ? pickLang(lang, {
                      es: 'Ver episodios',
                      ca: 'Veure episodis',
                      en: 'Episodes',
                    })
                  : pickLang(lang, {
                      es: 'Reproducir',
                      ca: 'Reproduir',
                      en: 'Play',
                    })}
              </span>
            </button>

            <button
              type="button"
              onClick={(e) =>
                onToggleBookmark(
                  { ...activeHeroSlide, mediaType: isSeriesTab ? 'tv' : 'movie' },
                  e
                )
              }
              aria-label={pickLang(lang, {
                es: 'Mi Lista',
                ca: 'La meva llista',
                en: 'My List',
              })}
              className={`min-h-[44px] min-w-[44px] px-3.5 rounded-2xl border inline-flex items-center justify-center gap-1.5 text-xs font-semibold cursor-pointer active:scale-95 transition-all ${
                isBookmarked(activeHeroSlide)
                  ? 'bg-[#9146FF] border-[#9146FF] text-white'
                  : 'bg-black/55 hover:bg-white/15 border-white/20 text-white'
              }`}
            >
              {isBookmarked(activeHeroSlide) ? (
                <Check className="w-4 h-4 shrink-0" />
              ) : (
                <Plus className="w-4 h-4 shrink-0" />
              )}
              <span className="hidden sm:inline whitespace-nowrap">
                {isBookmarked(activeHeroSlide)
                  ? pickLang(lang, { es: 'Guardada', ca: 'Desada', en: 'Saved' })
                  : pickLang(lang, { es: 'Mi lista', ca: 'La meva llista', en: 'My list' })}
              </span>
            </button>
          </div>

          {heroSlides.length > 1 && (
            <div className="flex items-center gap-1.5">
              {heroSlides.map((s, idx) => {
                const active = idx === activeHeroIdx;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onChangeHeroSlideIndex(idx)}
                    aria-label={`Slide ${idx + 1}`}
                    className={`h-2 rounded-full transition-all cursor-pointer ${
                      active ? 'w-6 bg-[#9146FF]' : 'w-2 bg-white/35 hover:bg-white/60'
                    }`}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};
