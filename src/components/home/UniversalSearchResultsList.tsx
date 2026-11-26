import React from 'react';
import { ArrowUpRight, Film, Music2, Pause, Play, Radio, Tv } from 'lucide-react';
import type {
  AppLanguage,
  CatalogMovie,
  SpanishTdtChannel,
  SportsMatch,
} from '../../types';
import type { MusicArtistRef, MusicRadioStation, MusicTrack } from '../../types/music';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import { PosterImage } from '../ui/PosterImage';
import { LanguageBadge } from '../ui/LanguageBadge';
import { ChannelLogoBadge } from '../ui/ChannelLogoBadge';
import { RiffanDiceIcon, RiffanFootballIcon } from '../ui/RiffanIcons';
import { useMusicStore } from '../../store/useMusicStore';
import { CoverArt } from '../music/CoverArt';
import { formatMusicTime } from '../music/SpotifyPlayerBar';
import type { HallmarkGameItem, SearchCategoryFilter } from './homeSearchTypes';

const FOUR_K_FEATURED_TMDB_IDS = [
  693134, 872585, 157336, 361743, 414906, 335984, 569094, 76600, 558449, 155,
  27205, 299534, 533535,
];

export interface UniversalMusicMatches {
  tracks: MusicTrack[];
  artists: MusicArtistRef[];
  radios: MusicRadioStation[];
}

interface UniversalSearchResultsListProps {
  lang: AppLanguage;
  cleanQuery: string;
  activeCategory: SearchCategoryFilter;
  matchedMusic?: UniversalMusicMatches;
  matchedSports: SportsMatch[];
  matchedTdt: SpanishTdtChannel[];
  matchedGames: HallmarkGameItem[];
  matchedMovies: CatalogMovie[];
  matchedSeries: CatalogMovie[];
  onDismissSearch: () => void;
  onBeforeDirectPlay?: () => void;
  onOpenMusicWorld?: () => void;
  onPlayMatch: (match: SportsMatch) => void;
  onPlayChannel: (channel: SpanishTdtChannel) => void;
  onSelectGame: (gameId: string) => void;
  onOpenMovieDetails: (movie: CatalogMovie) => void;
  onOpenSeriesPage: (series: CatalogMovie) => void;
}

export const UniversalSearchResultsList: React.FC<UniversalSearchResultsListProps> = ({
  lang,
  cleanQuery,
  activeCategory,
  matchedMusic,
  matchedSports,
  matchedTdt,
  matchedGames,
  matchedMovies,
  matchedSeries,
  onDismissSearch,
  onBeforeDirectPlay,
  onOpenMusicWorld,
  onPlayMatch,
  onPlayChannel,
  onSelectGame,
  onOpenMovieDetails,
  onOpenSeriesPage,
}) => {
  const currentTrackId = useMusicStore((s) => s.currentTrack?.id);
  const activeRadioId = useMusicStore((s) => s.activeRadio?.id);
  const isMusicPlaying = useMusicStore((s) => s.isPlaying);

  const hasMusicHits = Boolean(
    matchedMusic &&
      (matchedMusic.tracks.length > 0 ||
        matchedMusic.artists.length > 0 ||
        matchedMusic.radios.length > 0)
  );

  return (
    <div className="space-y-5 pb-8 pb-safe">
      {/* SECTION: RIFFAN MUSIC */}
      {(activeCategory === 'all' || activeCategory === 'music') && hasMusicHits && matchedMusic && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#60A5FA]">
              <Music2 className="w-3.5 h-3.5" />
              <span>
                {pickLang(lang, {
                  es: 'Riffan Music · Canciones, Artistas y Radios',
                  ca: 'Riffan Music · Cançons, Artistes i Ràdios',
                  en: 'Riffan Music · Songs, Artists & Radios',
                })}
              </span>
            </div>

            {onOpenMusicWorld && (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  const mStore = useMusicStore.getState();
                  if (cleanQuery.length >= 2) {
                    mStore.setMusicSearchQuery(cleanQuery);
                    mStore.setMusicSearchFilter('all');
                    mStore.clearMusicDetailStack();
                    mStore.setMusicNavTab('search');
                  }
                  onDismissSearch();
                  onOpenMusicWorld();
                }}
                className="min-h-8 px-2.5 rounded-xl bg-[#3B82F6]/15 hover:bg-[#3B82F6]/28 border border-[#3B82F6]/35 text-[11px] font-bold text-[#93C5FD] inline-flex items-center gap-1 cursor-pointer transition-colors"
              >
                <span>
                  {pickLang(lang, {
                    es: 'Abrir en Riffan Music',
                    ca: 'Obrir a Riffan Music',
                    en: 'Open in Riffan Music',
                  })}
                </span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {matchedMusic.artists.length > 0 && (
            <div className="flex items-center gap-2.5 overflow-x-auto no-scrollbar pb-1">
              {matchedMusic.artists.slice(0, 6).map((artist) => (
                <button
                  key={artist.id}
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    const mStore = useMusicStore.getState();
                    mStore.setMusicSearchQuery(artist.name);
                    mStore.setMusicSearchFilter('artists');
                    mStore.clearMusicDetailStack();
                    if (/^\d+$/.test(artist.id)) {
                      mStore.pushMusicDetail({
                        kind: 'artist',
                        id: artist.id,
                        artist,
                        topTracks: [],
                        albums: [],
                        related: [],
                        loading: true,
                      });
                    } else {
                      mStore.setMusicNavTab('search');
                    }
                    onDismissSearch();
                    onOpenMusicWorld?.();
                  }}
                  className="shrink-0 min-h-11 px-3 py-2 rounded-2xl bg-[#0D0D12] hover:bg-[#14141C] border border-white/[0.08] hover:border-[#3B82F6]/50 flex items-center gap-2.5 cursor-pointer transition-all"
                >
                  <CoverArt
                    src={artist.picture}
                    alt={artist.name}
                    fallbackLabel={artist.name}
                    className="w-8 h-8 rounded-full object-cover shrink-0"
                  />
                  <div className="text-left min-w-0">
                    <p className="text-xs font-bold text-white truncate max-w-[140px]">
                      {artist.name}
                    </p>
                    <p className="text-[10px] text-zinc-400">
                      {pickLang(lang, { es: 'Artista', ca: 'Artista', en: 'Artist' })}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {matchedMusic.tracks.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {matchedMusic.tracks.slice(0, 8).map((track) => {
                const isActive = currentTrackId === track.id;
                return (
                  <button
                    key={track.id}
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      onBeforeDirectPlay?.();
                      const mStore = useMusicStore.getState();
                      if (isActive) {
                        mStore.togglePlayPause();
                      } else {
                        mStore.playTrack(track, matchedMusic.tracks);
                      }
                    }}
                    className={`flex items-center justify-between gap-3 p-2.5 rounded-2xl border text-left cursor-pointer transition-all active:scale-95 ${
                      isActive
                        ? 'bg-[#3B82F6]/16 border-[#3B82F6]/60'
                        : 'bg-[#0D0D12] hover:bg-[#14141C] border-white/[0.08] hover:border-[#3B82F6]/45'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <CoverArt
                        src={track.album.cover}
                        alt={track.title}
                        fallbackLabel={track.artist.name}
                        className="w-11 h-11 rounded-xl object-cover shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-xs font-bold truncate ${
                            isActive ? 'text-[#60A5FA]' : 'text-white'
                          }`}
                        >
                          {track.title}
                        </p>
                        <p className="text-[11px] text-zinc-400 truncate mt-0.5 tabular-nums">
                          {track.artist.name}
                          {track.durationSec > 0 ? ` · ${formatMusicTime(track.durationSec)}` : ''}
                        </p>
                      </div>
                    </div>

                    <span className="w-9 h-9 rounded-full bg-gradient-to-br from-[#2563EB] to-[#3B82F6] text-white flex items-center justify-center shrink-0">
                      {isActive && isMusicPlaying ? (
                        <Pause className="w-4 h-4 fill-current" />
                      ) : (
                        <Play className="w-4 h-4 fill-current ml-0.5" />
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {matchedMusic.radios.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {matchedMusic.radios.slice(0, 4).map((station) => {
                const isActive = activeRadioId === station.id;
                return (
                  <button
                    key={station.id}
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      onBeforeDirectPlay?.();
                      const mStore = useMusicStore.getState();
                      if (isActive) mStore.togglePlayPause();
                      else mStore.playRadio(station);
                    }}
                    className={`flex items-center justify-between gap-3 p-2.5 rounded-2xl border text-left cursor-pointer transition-all ${
                      isActive
                        ? 'bg-[#3B82F6]/16 border-[#3B82F6]/60'
                        : 'bg-[#0D0D12] hover:bg-[#14141C] border-white/[0.08] hover:border-[#3B82F6]/45'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className="w-10 h-10 rounded-xl bg-[#3B82F6]/15 border border-[#3B82F6]/30 flex items-center justify-center shrink-0 text-[#60A5FA]">
                        <Radio className="w-4 h-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-white truncate">{station.name}</p>
                        <p className="text-[11px] text-zinc-400 truncate">
                          {station.country} · FM 24/7
                        </p>
                      </div>
                    </div>
                    <span className="w-9 h-9 rounded-full bg-white/[0.08] text-white flex items-center justify-center shrink-0">
                      {isActive && isMusicPlaying ? (
                        <Pause className="w-3.5 h-3.5 fill-current" />
                      ) : (
                        <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {matchedSports.map((match) => (
                <button
                  key={match.id}
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    onBeforeDirectPlay?.();
                    onPlayMatch(match);
                  }}
                  className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-[#0D0D12] hover:bg-[#14141C] border border-white/[0.08] hover:border-[#00F593]/50 text-left cursor-pointer transition-all active:scale-95"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-400 font-medium">
                      <span>{match.competition}</span>
                      <span aria-hidden="true">·</span>
                      <span className="text-zinc-300 tabular-nums">{match.time}</span>
                    </div>
                    <p className="text-xs font-bold text-white leading-snug">
                      {match.title}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {match.isLive && (
                      <span className="px-2 py-0.5 rounded-full bg-[#EB0400] text-white text-[10px] font-bold uppercase tracking-wider">
                        LIVE
                      </span>
                    )}
                    <span className="w-9 h-9 rounded-xl bg-white/[0.06] flex items-center justify-center text-white">
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

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {matchedTdt.map((ch) => (
              <button
                key={ch.id}
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  onBeforeDirectPlay?.();
                  onPlayChannel(ch);
                }}
                className="flex items-center gap-2.5 p-3 rounded-2xl bg-[#0D0D12] hover:bg-[#14141C] border border-white/[0.08] hover:border-sky-400/50 text-left cursor-pointer transition-all active:scale-95"
              >
                <ChannelLogoBadge channel={ch} size="sm" />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white leading-snug truncate">{ch.name}</p>
                  <p className="text-[10px] text-zinc-400 truncate">
                    {ch.dial > 0 ? `Dial ${ch.dial}` : ch.network || 'Señal Rápida'}
                  </p>
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {matchedGames.map((game) => (
                <button
                  key={game.id}
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    onBeforeDirectPlay?.();
                    onDismissSearch();
                    onSelectGame(game.id);
                  }}
                  className="flex items-center justify-between gap-2.5 p-3.5 rounded-2xl bg-[#0D0D12] hover:bg-[#14141C] border border-white/[0.08] hover:border-[#7C3AED]/60 text-left cursor-pointer transition-all active:scale-95"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-2xl shrink-0">{game.icon}</span>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white leading-snug">{game.title}</p>
                      <p className="text-[11px] text-zinc-400 leading-snug mt-0.5">{game.desc}</p>
                    </div>
                  </div>
                  <span className="px-3 py-1.5 rounded-xl bg-[#7C3AED]/20 text-[#C4A7FF] text-[11px] font-bold shrink-0">
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

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {matchedMovies.map((movie) => (
                <button
                  key={movie.id || movie.tmdbId}
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    onOpenMovieDetails(movie);
                  }}
                  className="group rounded-2xl overflow-hidden bg-[#0D0D12] hover:bg-[#14141C] border border-white/[0.08] hover:border-[#7C3AED]/60 text-left cursor-pointer transition-all active:scale-95 flex flex-col"
                >
                  <div className="relative aspect-[2/3] w-full bg-[#000000]">
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
                  <div className="p-2.5 min-w-0">
                    <p className="text-xs font-bold text-white leading-snug group-hover:text-[#D8B4FE]">
                      {movie.title}
                    </p>
                    <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 mt-1">
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

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {matchedSeries.map((s) => (
                <button
                  key={s.id || s.tmdbId}
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    onOpenSeriesPage(s);
                  }}
                  className="group rounded-2xl overflow-hidden bg-[#0D0D12] hover:bg-[#14141C] border border-white/[0.08] hover:border-[#7C3AED]/60 text-left cursor-pointer transition-all active:scale-95 flex flex-col"
                >
                  <div className="relative aspect-[2/3] w-full bg-[#000000]">
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
                  <div className="p-2.5 min-w-0">
                    <p className="text-xs font-bold text-white leading-snug group-hover:text-[#D8B4FE]">
                      {s.title}
                    </p>
                    <p className="text-[10px] text-zinc-400 mt-1">
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
};
