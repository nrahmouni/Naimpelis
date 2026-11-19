import React from 'react';
import { Film, Heart, Play, Star, Trophy, Tv } from 'lucide-react';
import type {
  AppLanguage,
  CatalogMovie,
  FavoriteChannelItem,
} from '../../types';
import { triggerHaptic } from '../../utils/haptics';
import { pickLang } from '../../utils/i18n';
import { PosterImage } from '../ui/PosterImage';

interface ProfileSavedTabProps {
  lang: AppLanguage;
  watchlist: CatalogMovie[];
  favoriteChannels: FavoriteChannelItem[];
  favFilter: 'all' | 'tv' | 'movie' | 'channels';
  setFavFilter: (filter: 'all' | 'tv' | 'movie' | 'channels') => void;
  onPlayCatalogItem: (item: CatalogMovie) => void;
  onToggleCatalogFavorite: (item: CatalogMovie) => void;
  onPlayFavoriteChannel: (ch: FavoriteChannelItem) => void;
  onRemoveFavoriteChannel: (ch: FavoriteChannelItem) => void;
  onClose: () => void;
}

export const ProfileSavedTab: React.FC<ProfileSavedTabProps> = ({
  lang,
  watchlist,
  favoriteChannels,
  favFilter,
  setFavFilter,
  onPlayCatalogItem,
  onToggleCatalogFavorite,
  onPlayFavoriteChannel,
  onRemoveFavoriteChannel,
  onClose,
}) => {
  const filteredWatchlist = watchlist.filter((item) => {
    if (favFilter === 'channels') return false;
    if (favFilter === 'all') return true;
    const type = item.mediaType === 'tv' ? 'tv' : 'movie';
    return type === favFilter;
  });
  const totalSavedCount = watchlist.length + favoriteChannels.length;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
        {(
          [
            {
              id: 'all',
              label: pickLang(lang, {
                es: `Todo (${totalSavedCount})`,
                ca: `Tot (${totalSavedCount})`,
                en: `All (${totalSavedCount})`,
              }),
            },
            {
              id: 'movie',
              label: pickLang(lang, {
                es: `Películas (${watchlist.filter((w) => w.mediaType !== 'tv').length})`,
                ca: `Pel·lícules (${watchlist.filter((w) => w.mediaType !== 'tv').length})`,
                en: `Movies (${watchlist.filter((w) => w.mediaType !== 'tv').length})`,
              }),
            },
            {
              id: 'tv',
              label: pickLang(lang, {
                es: `Series (${watchlist.filter((w) => w.mediaType === 'tv').length})`,
                ca: `Sèries (${watchlist.filter((w) => w.mediaType === 'tv').length})`,
                en: `Series (${watchlist.filter((w) => w.mediaType === 'tv').length})`,
              }),
            },
            {
              id: 'channels',
              label: pickLang(lang, {
                es: `Canales TV (${favoriteChannels.length})`,
                ca: `Canals TV (${favoriteChannels.length})`,
                en: `Channels (${favoriteChannels.length})`,
              }),
            },
          ] as const
        ).map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFavFilter(f.id)}
            className={`min-h-9 px-3.5 rounded-full text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-all ${
              favFilter === f.id
                ? 'bg-[#9146FF] text-white shadow-sm'
                : 'bg-[#1F1F23] hover:bg-[#26262C] border border-white/[0.08] text-zinc-300'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Saved Live Sports Channels Section */}
      {(favFilter === 'all' || favFilter === 'channels') &&
        favoriteChannels.length > 0 && (
          <div className="space-y-2.5">
            {favFilter === 'all' && (
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                <Trophy className="w-3.5 h-3.5 text-amber-400" />
                <span>
                  {pickLang(lang, {
                    es: `Canales y Partidos Guardados (${favoriteChannels.length})`,
                    ca: `Canals i Partits Desats (${favoriteChannels.length})`,
                    en: `Saved Channels & Matches (${favoriteChannels.length})`,
                  })}
                </span>
              </h4>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {favoriteChannels.map((ch) => (
                <div
                  key={ch.favId}
                  className="rounded-2xl bg-white/[0.04] border border-white/[0.08] hover:border-[#9146FF]/40 p-3.5 flex items-center justify-between gap-3 transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('success');
                      onPlayFavoriteChannel(ch);
                      onClose();
                    }}
                    className="flex items-center gap-3 flex-1 min-w-0 text-left cursor-pointer"
                  >
                    <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                      <Trophy className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs sm:text-sm font-semibold text-white truncate">
                        {ch.channelLabel}
                      </div>
                      <div className="text-[11px] text-zinc-400 truncate">
                        {ch.competition} · {ch.title}
                      </div>
                    </div>
                  </button>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('success');
                        onPlayFavoriteChannel(ch);
                        onClose();
                      }}
                      className="min-h-9 px-3 rounded-xl bg-[#9146FF] hover:bg-[#772CE8] text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer"
                    >
                      <Play className="w-3 h-3 fill-current" />
                      <span>
                        {pickLang(lang, { es: 'Ver', ca: 'Veure', en: 'Watch' })}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        onRemoveFavoriteChannel(ch);
                      }}
                      title={pickLang(lang, {
                        es: 'Quitar canal favorito',
                        ca: 'Treure canal favorit',
                        en: 'Remove favorite channel',
                      })}
                      aria-label={pickLang(lang, {
                        es: 'Quitar canal favorito',
                        ca: 'Treure canal favorit',
                        en: 'Remove favorite channel',
                      })}
                      className="w-9 h-9 rounded-xl bg-white/[0.04] hover:bg-rose-500/20 text-amber-400 hover:text-rose-300 flex items-center justify-center cursor-pointer transition-colors"
                    >
                      <Star className="w-4 h-4 fill-current" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      {/* Saved Movies & TV Series Grid */}
      {favFilter !== 'channels' && filteredWatchlist.length > 0 && (
        <div className="space-y-2.5">
          {favFilter === 'all' && favoriteChannels.length > 0 && (
            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
              <Film className="w-3.5 h-3.5 text-[#9146FF]" />
              <span>
                {pickLang(lang, {
                  es: `Películas y Series en Mi Lista (${filteredWatchlist.length})`,
                  ca: `Pel·lícules i Sèries a La meva llista (${filteredWatchlist.length})`,
                  en: `Movies & Series in My List (${filteredWatchlist.length})`,
                })}
              </span>
            </h4>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            {filteredWatchlist.map((item) => {
              const isSeries = item.mediaType === 'tv';
              return (
                <div
                  key={`${item.mediaType || 'movie'}-${item.tmdbId || item.id}`}
                  className="group relative rounded-2xl overflow-hidden bg-white/[0.04] nc-card-sheen border border-white/[0.08] hover:border-[#9146FF]/50 flex flex-col transition-all"
                >
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      onPlayCatalogItem(item);
                      onClose();
                    }}
                    aria-label={item.title}
                    className="relative aspect-[2/3] w-full overflow-hidden bg-[#26262C] text-left cursor-pointer"
                  >
                    <PosterImage
                      src={item.poster}
                      alt={item.title}
                      aspect="none"
                      className="w-full h-full"
                      imgClassName="group-hover:scale-105 transition-transform duration-300"
                      fallbackIcon={
                        isSeries ? (
                          <Tv className="w-7 h-7 text-zinc-600" />
                        ) : (
                          <Film className="w-7 h-7 text-zinc-600" />
                        )
                      }
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent flex flex-col justify-end p-3">
                      <div className="text-[10px] text-zinc-300">
                        {isSeries
                          ? pickLang(lang, {
                              es: 'Serie TV',
                              ca: 'Sèrie TV',
                              en: 'TV Series',
                            })
                          : pickLang(lang, {
                              es: 'Película',
                              ca: 'Pel·lícula',
                              en: 'Movie',
                            })}
                        {item.year ? ` · ${item.year}` : ''}
                      </div>
                      <div className="font-display font-semibold text-xs sm:text-sm text-white line-clamp-2 mt-0.5">
                        {item.title}
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      onToggleCatalogFavorite(item);
                    }}
                    title={pickLang(lang, {
                      es: 'Quitar de favoritos',
                      ca: 'Treure de favorits',
                      en: 'Remove favorite',
                    })}
                    aria-label={pickLang(lang, {
                      es: 'Quitar de favoritos',
                      ca: 'Treure de favorits',
                      en: 'Remove favorite',
                    })}
                    className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/70 hover:bg-[#9146FF] flex items-center justify-center text-[#BF94FF] hover:text-white cursor-pointer transition-colors"
                  >
                    <Heart className="w-3.5 h-3.5 fill-current" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state */}
      {((favFilter === 'channels' && favoriteChannels.length === 0) ||
        (favFilter !== 'channels' &&
          filteredWatchlist.length === 0 &&
          (favFilter !== 'all' || favoriteChannels.length === 0))) && (
        <p className="py-12 text-center text-sm text-zinc-400">
          {pickLang(lang, {
            es: 'No tienes elementos guardados.',
            ca: 'No tens elements desats.',
            en: 'No saved items.',
          })}
        </p>
      )}
    </div>
  );
};
