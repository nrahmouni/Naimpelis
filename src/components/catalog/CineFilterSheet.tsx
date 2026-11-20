import React from 'react';
import type { AppLanguage } from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import { BottomSheet } from '../ui/DesignSystem';
import { FlagBadgeSvg, type FlagCode } from '../ui/LanguageBadge';
import {
  MOVIE_GENRES,
  MOVIE_SORT_OPTIONS,
  SERIES_GENRES,
  SERIES_SORT_OPTIONS,
} from './catalogConstants';

interface CineFilterSheetProps {
  lang: AppLanguage;
  isOpen: boolean;
  onClose: () => void;
  isSeriesTab: boolean;
  effectiveCineCastellano: boolean;
  cineAudioOverride: 'ES' | 'VOSE' | 'EN';
  cineSpecialPortal: 'none' | 'catala';
  currentSort: string;
  currentGenre: string;
  onChangeCineCastellano: (enabled: boolean) => void;
  onChangeCineAudioOverride: (code: 'ES' | 'VOSE' | 'EN') => void;
  onChangeSeriesLangMode: (code: 'ES' | 'LAT' | 'VOSE' | 'EN') => void;
  onChangeCineSpecialPortal: (portal: 'none' | 'catala') => void;
  onChangeMovieSort: (sort: string) => void;
  onResetMoviePage: () => void;
  onChangeMovieGenre: (genre: string) => void;
  onChangeSeriesSort: (sort: string) => void;
  onResetSeriesPage: () => void;
  onChangeSeriesGenre: (genre: string) => void;
}

export const CineFilterSheet: React.FC<CineFilterSheetProps> = ({
  lang,
  isOpen,
  onClose,
  isSeriesTab,
  effectiveCineCastellano,
  cineAudioOverride,
  cineSpecialPortal,
  currentSort,
  currentGenre,
  onChangeCineCastellano,
  onChangeCineAudioOverride,
  onChangeSeriesLangMode,
  onChangeCineSpecialPortal,
  onChangeMovieSort,
  onResetMoviePage,
  onChangeMovieGenre,
  onChangeSeriesSort,
  onResetSeriesPage,
  onChangeSeriesGenre,
}) => {
  const currentSortOptions = isSeriesTab ? SERIES_SORT_OPTIONS : MOVIE_SORT_OPTIONS;
  const currentGenres = isSeriesTab ? SERIES_GENRES : MOVIE_GENRES;

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      lang={lang}
      title={pickLang(lang, { es: 'Filtros de Cine', ca: 'Filtres de Cine', en: 'Cinema Filters' })}
      footer={
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onChangeCineCastellano(true);
              onChangeCineAudioOverride('ES');
              onChangeSeriesLangMode('ES');
              onChangeMovieSort('trending');
              onChangeMovieGenre('');
              onChangeSeriesSort('trending');
              onChangeSeriesGenre('');
              onChangeCineSpecialPortal('none');
            }}
            className="flex-1 min-h-12 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-xs font-bold text-white cursor-pointer active:scale-95 transition-all"
          >
            {pickLang(lang, { es: 'Limpiar', ca: 'Netejar', en: 'Reset' })}
          </button>
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onClose();
            }}
            className="flex-1 min-h-12 rounded-2xl bg-[#7C3AED] hover:bg-[#8B5CF6] text-xs font-bold text-white cursor-pointer active:scale-95 transition-all shadow-[0_8px_24px_rgba(124,58,237,0.35)]"
          >
            {pickLang(lang, { es: 'Aplicar', ca: 'Aplicar', en: 'Apply' })}
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="space-y-2.5">
          <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">
            {pickLang(lang, {
              es: 'Versión Original',
              ca: 'Versió Original',
              en: 'Original Version',
            })}
          </p>
          <div className="flex flex-wrap gap-2">
            {(
              [
                {
                  id: 'VOSE',
                  flagCode: 'vose',
                  label: pickLang(lang, {
                    es: 'VOSE (Subtitulada)',
                    ca: 'VOSE (Subtitulada)',
                    en: 'VOSE (Subtitled)',
                  }),
                },
                { id: 'EN', flagCode: 'uk', label: 'English (VO)' },
              ] as const satisfies readonly { id: 'VOSE' | 'EN'; flagCode: FlagCode; label: string }[]
            ).map((opt) => {
              const active =
                cineSpecialPortal === 'none' &&
                !effectiveCineCastellano &&
                cineAudioOverride === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    onChangeCineSpecialPortal('none');
                    onChangeCineCastellano(false);
                    onChangeCineAudioOverride(opt.id);
                    onChangeSeriesLangMode(opt.id);
                  }}
                  className={`min-h-[44px] px-3.5 rounded-xl text-xs font-semibold border inline-flex items-center gap-2 cursor-pointer active:scale-95 transition-all ${
                    active
                      ? 'bg-[#7C3AED] border-[#7C3AED] text-white shadow-[0_4px_16px_rgba(124,58,237,0.3)]'
                      : 'bg-white/[0.04] border-white/[0.08] text-zinc-200 hover:bg-white/[0.08]'
                  }`}
                >
                  <FlagBadgeSvg code={opt.flagCode} className="w-4 h-2.5 shrink-0" />
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2.5">
          <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">
            {pickLang(lang, { es: 'Doblaje', ca: 'Doblatge', en: 'Dubbing' })}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onChangeCineSpecialPortal('none');
                onChangeCineCastellano(true);
                onChangeCineAudioOverride('ES');
                onChangeSeriesLangMode('ES');
              }}
              className={`min-h-[44px] px-3.5 rounded-xl text-xs font-semibold border inline-flex items-center gap-2 cursor-pointer active:scale-95 transition-all ${
                cineSpecialPortal === 'none' && effectiveCineCastellano
                  ? 'bg-[#7C3AED] border-[#7C3AED] text-white shadow-[0_4px_16px_rgba(124,58,237,0.3)]'
                  : 'bg-white/[0.04] border-white/[0.08] text-zinc-200 hover:bg-white/[0.08]'
              }`}
            >
              <FlagBadgeSvg code="es" className="w-4 h-2.5 shrink-0" />
              <span>Castellano (ES)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onChangeCineSpecialPortal('catala');
                onClose();
              }}
              className={`min-h-[44px] px-3.5 rounded-xl text-xs font-semibold border inline-flex items-center gap-2 cursor-pointer active:scale-95 transition-all ${
                cineSpecialPortal === 'catala'
                  ? 'bg-[#7C3AED] border-[#7C3AED] text-white shadow-[0_4px_16px_rgba(124,58,237,0.3)]'
                  : 'bg-white/[0.04] border-white/[0.08] text-zinc-200 hover:bg-white/[0.08]'
              }`}
            >
              <FlagBadgeSvg code="ca" className="w-4 h-2.5 shrink-0" />
              <span>Català</span>
            </button>
          </div>
        </div>

        <div className="space-y-2.5">
          <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">
            {pickLang(lang, { es: 'Ordenar por', ca: 'Ordenar per', en: 'Sort by' })}
          </p>
          <div className="flex flex-wrap gap-2">
            {currentSortOptions.map((opt) => {
              const active = currentSort === opt.id && cineSpecialPortal === 'none';
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    onChangeCineSpecialPortal('none');
                    if (isSeriesTab) {
                      onChangeSeriesSort(opt.id);
                      onResetSeriesPage();
                    } else {
                      onChangeMovieSort(opt.id);
                      onResetMoviePage();
                    }
                  }}
                  className={`min-h-[44px] px-3.5 rounded-xl text-xs font-semibold border cursor-pointer active:scale-95 transition-all ${
                    active
                      ? 'bg-[#7C3AED] border-[#7C3AED] text-white shadow-[0_4px_16px_rgba(124,58,237,0.3)]'
                      : 'bg-white/[0.04] border-white/[0.08] text-zinc-200 hover:bg-white/[0.08]'
                  }`}
                >
                  {pickLang(lang, opt)}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2.5">
          <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">
            {pickLang(lang, { es: 'Géneros', ca: 'Gèneres', en: 'Genres' })}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onChangeCineSpecialPortal('none');
                if (isSeriesTab) {
                  onChangeSeriesGenre('');
                  onResetSeriesPage();
                } else {
                  onChangeMovieGenre('');
                  onResetMoviePage();
                }
              }}
              className={`min-h-[44px] px-3.5 rounded-xl text-xs font-semibold border cursor-pointer active:scale-95 transition-all ${
                currentGenre === '' && cineSpecialPortal === 'none'
                  ? 'bg-[#7C3AED] border-[#7C3AED] text-white shadow-[0_4px_16px_rgba(124,58,237,0.3)]'
                  : 'bg-white/[0.04] border-white/[0.08] text-zinc-200 hover:bg-white/[0.08]'
              }`}
            >
              {pickLang(lang, { es: 'Todos', ca: 'Tots', en: 'All' })}
            </button>
            {currentGenres.map((gen) => {
              const active = currentGenre === gen.id && cineSpecialPortal === 'none';
              return (
                <button
                  key={gen.id}
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    onChangeCineSpecialPortal('none');
                    const nextVal = currentGenre === gen.id ? '' : gen.id;
                    if (isSeriesTab) {
                      onChangeSeriesGenre(nextVal);
                      onResetSeriesPage();
                    } else {
                      onChangeMovieGenre(nextVal);
                      onResetMoviePage();
                    }
                  }}
                  className={`min-h-[44px] px-3.5 rounded-xl text-xs font-semibold border cursor-pointer active:scale-95 transition-all ${
                    active
                      ? 'bg-[#7C3AED] border-[#7C3AED] text-white shadow-[0_4px_16px_rgba(124,58,237,0.3)]'
                      : 'bg-white/[0.04] border-white/[0.08] text-zinc-200 hover:bg-white/[0.08]'
                  }`}
                >
                  {pickLang(lang, gen)}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </BottomSheet>
  );
};
