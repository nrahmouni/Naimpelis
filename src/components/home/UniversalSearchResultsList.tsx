import React from 'react';
import { Film, Play, Tv } from 'lucide-react';
import type {
  AppLanguage,
  CatalogMovie,
  SpanishTdtChannel,
  SportsMatch,
} from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import { PosterImage } from '../ui/PosterImage';
import { LanguageBadge } from '../ui/LanguageBadge';
import { ChannelLogoBadge } from '../ui/ChannelLogoBadge';
import { RiffanDiceIcon, RiffanFootballIcon } from '../ui/RiffanIcons';
import type { HallmarkGameItem, SearchCategoryFilter } from './homeSearchTypes';

const FOUR_K_FEATURED_TMDB_IDS = [
  693134, 872585, 157336, 361743, 414906, 335984, 569094, 76600, 558449, 155,
  27205, 299534, 533535,
];

interface UniversalSearchResultsListProps {
  lang: AppLanguage;
  activeCategory: SearchCategoryFilter;
  matchedSports: SportsMatch[];
  matchedTdt: SpanishTdtChannel[];
  matchedGames: HallmarkGameItem[];
  matchedMovies: CatalogMovie[];
  matchedSeries: CatalogMovie[];
  onCloseSearch: () => void;
  onPlayMatch: (match: SportsMatch) => void;
  onPlayChannel: (channel: SpanishTdtChannel) => void;
  onSelectGame: (gameId: string) => void;
  onPlayMovie: (movie: CatalogMovie) => void;
  onPlaySeries: (series: CatalogMovie) => void;
}

export const UniversalSearchResultsList: React.FC<UniversalSearchResultsListProps> = ({
  lang,
  activeCategory,
  matchedSports,
  matchedTdt,
  matchedGames,
  matchedMovies,
  matchedSeries,
  onCloseSearch,
  onPlayMatch,
  onPlayChannel,
  onSelectGame,
  onPlayMovie,
  onPlaySeries,
}) => (
  <div className="space-y-4 max-h-[460px] overflow-y-auto no-scrollbar pr-1">
    {/* SECTION: FÚTBOL & DEPORTES */}
    {(activeCategory === 'all' || activeCategory === 'sports') &&
      matchedSports.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-[#00F593]">
            <RiffanFootballIcon size={14} animate="hover" />
            <span>
              {pickLang(lang, {
                es: 'Fútbol y Deportes en Directo',
                ca: 'Futbol i Esports en Directe',
                en: 'Live Football & Sports',
              })}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {matchedSports.map((match) => (
              <button
                key={match.id}
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  onCloseSearch();
                  onPlayMatch(match);
                }}
                className="flex items-center justify-between gap-2.5 p-3 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] hover:border-[#00F593]/50 text-left cursor-pointer transition-all active:scale-[0.98]"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 font-medium">
                    <span className="truncate">{match.competition}</span>
                    <span aria-hidden="true">·</span>
                    <span className="text-zinc-300 tabular-nums">{match.time}</span>
                  </div>
                  <p className="text-xs font-bold text-white leading-snug line-clamp-2">
                    {match.title}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {match.isLive && (
                    <span className="px-2 py-0.5 rounded-full bg-[#EB0400] text-white text-[10px] font-bold uppercase tracking-wider">
                      LIVE
                    </span>
                  )}
                  <span className="w-8 h-8 rounded-xl bg-white/[0.06] flex items-center justify-center text-white">
                    <Play className="w-3.5 h-3.5 fill-current" />
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

    {/* SECTION: CANALES TDT */}
    {(activeCategory === 'all' || activeCategory === 'tv') && matchedTdt.length > 0 && (
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-bold text-sky-400">
          <Tv className="w-3.5 h-3.5" />
          <span>
            {pickLang(lang, {
              es: 'Canales de TV en Directo (TDT)',
              ca: 'Canals de TV en Directe (TDT)',
              en: 'Live TV Channels (DTT)',
            })}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {matchedTdt.map((ch) => (
            <button
              key={ch.id}
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onCloseSearch();
                onPlayChannel(ch);
              }}
              className="flex items-center gap-2 p-2.5 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] hover:border-sky-400/50 text-left cursor-pointer transition-all active:scale-[0.98]"
            >
              <ChannelLogoBadge channel={ch} size="sm" />
              <div className="min-w-0">
                <p className="text-xs font-bold text-white truncate">{ch.name}</p>
                <p className="text-[10px] text-zinc-400">Dial {ch.dial}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    )}

    {/* SECTION: JUEGOS DE SALA */}
    {(activeCategory === 'all' || activeCategory === 'games') &&
      matchedGames.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-fuchsia-400">
            <RiffanDiceIcon size={14} animate="hover" />
            <span>
              {pickLang(lang, {
                es: 'Juegos de Sala',
                ca: 'Jocs de Sala',
                en: 'Room Games',
              })}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {matchedGames.map((game) => (
              <button
                key={game.id}
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  onCloseSearch();
                  onSelectGame(game.id);
                }}
                className="flex items-center justify-between gap-2.5 p-3 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] hover:border-fuchsia-400/50 text-left cursor-pointer transition-all active:scale-[0.98]"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-2xl shrink-0">{game.icon}</span>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white truncate">{game.title}</p>
                    <p className="text-[11px] text-zinc-400 truncate">{game.desc}</p>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-xl bg-fuchsia-500/20 text-fuchsia-300 text-[11px] font-bold shrink-0">
                  {pickLang(lang, { es: 'Jugar', ca: 'Jugar', en: 'Play' })}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

    {/* SECTION: PELÍCULAS */}
    {(activeCategory === 'all' || activeCategory === 'movies') &&
      matchedMovies.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-[#BF94FF]">
            <Film className="w-3.5 h-3.5" />
            <span>
              {pickLang(lang, {
                es: 'Películas',
                ca: 'Pel·lícules',
                en: 'Movies',
              })}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {matchedMovies.map((movie) => (
              <button
                key={movie.id || movie.tmdbId}
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  onCloseSearch();
                  onPlayMovie(movie);
                }}
                className="group rounded-2xl overflow-hidden bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] hover:border-[#9146FF]/50 text-left cursor-pointer transition-all active:scale-[0.98] flex flex-col"
              >
                <div className="relative aspect-[2/3] w-full bg-[#0D0E15]">
                  <PosterImage
                    src={movie.poster}
                    alt={movie.title}
                    aspect="poster"
                    className="w-full h-full"
                    imgClassName="object-cover group-hover:scale-105 transition-transform duration-200"
                    fallbackTitle={movie.title}
                  />
                  {Boolean(
                    movie.is4k ||
                      (movie.tmdbId && FOUR_K_FEATURED_TMDB_IDS.includes(movie.tmdbId))
                  ) && (
                    <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-black/85 backdrop-blur-md border border-amber-400/80 text-[9px] font-black tracking-wider text-amber-300 shadow-sm flex items-center gap-1">
                      <span>4K</span>
                      <span className="text-[8px] text-cyan-300">HDR</span>
                    </span>
                  )}
                  {movie.rating && (
                    <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-md bg-black/75 text-[10px] font-mono font-bold text-amber-300 tabular-nums">
                      ★ {movie.rating}
                    </span>
                  )}
                </div>
                <div className="p-2 min-w-0">
                  <p className="text-xs font-bold text-white truncate group-hover:text-[#D8B4FE]">
                    {movie.title}
                  </p>
                  <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                    <span>{movie.year || 'HD'}</span>
                    {Boolean(movie.is4k) && (
                      <span className="px-1 rounded bg-amber-400/20 text-amber-300 font-mono text-[9px] font-bold">
                        4K
                      </span>
                    )}
                    {movie.languages && movie.languages.length > 0 && (
                      <LanguageBadge code={movie.languages[0]} size="xs" />
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

    {/* SECTION: SERIES */}
    {(activeCategory === 'all' || activeCategory === 'series') &&
      matchedSeries.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-[#D8B4FE]">
            <Tv className="w-3.5 h-3.5" />
            <span>
              {pickLang(lang, {
                es: 'Series de TV',
                ca: 'Sèries de TV',
                en: 'TV Series',
              })}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {matchedSeries.map((s) => (
              <button
                key={s.id || s.tmdbId}
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  onCloseSearch();
                  onPlaySeries(s);
                }}
                className="group rounded-2xl overflow-hidden bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] hover:border-[#9146FF]/50 text-left cursor-pointer transition-all active:scale-[0.98] flex flex-col"
              >
                <div className="relative aspect-[2/3] w-full bg-[#0D0E15]">
                  <PosterImage
                    src={s.poster}
                    alt={s.title}
                    aspect="poster"
                    className="w-full h-full"
                    imgClassName="object-cover group-hover:scale-105 transition-transform duration-200"
                    fallbackTitle={s.title}
                  />
                  {s.rating && (
                    <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-md bg-black/75 text-[10px] font-mono font-bold text-amber-300 tabular-nums">
                      ★ {s.rating}
                    </span>
                  )}
                </div>
                <div className="p-2 min-w-0">
                  <p className="text-xs font-bold text-white truncate group-hover:text-[#D8B4FE]">
                    {s.title}
                  </p>
                  <p className="text-[10px] text-zinc-400">
                    {s.year || 'HD'} · {pickLang(lang, { es: 'Serie', ca: 'Sèrie', en: 'Series' })}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
  </div>
);
