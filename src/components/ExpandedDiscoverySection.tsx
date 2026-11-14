import React, { useCallback, useEffect, useState } from 'react';
import {
  ChevronRight,
  Compass,
  Film,
  Heart,
  Loader2,
  Play,
  Plus,
  Radio,
  Sparkles,
  Star,
  Tv,
} from 'lucide-react';
import type { AppLanguage, CatalogMovie, RoomQueueItem } from '../types';
import { triggerHaptic } from '../utils/haptics';
import { pickLang } from '../utils/i18n';
import { PosterImage } from './ui/PosterImage';
import { VirtualizedPosterGrid } from './VirtualizedPosterGrid';
import cosmosBannerImg from '../assets/images/documentary_cosmos_banner_1794673308607.jpg';

interface CatalogGenreItem {
  id: number;
  slug: string;
  es: string;
  ca: string;
  en: string;
  mediaType: 'movie' | 'tv' | 'both';
}

interface EditorialCollection {
  id: string;
  titleEs: string;
  titleCa: string;
  titleEn: string;
  subtitleEs: string;
  subtitleCa: string;
  subtitleEn: string;
  mediaType: 'movie' | 'tv';
  items: CatalogMovie[];
}

interface FastChannelItem {
  id: string;
  name: string;
  category: 'cinema' | 'sports' | 'documentary' | 'music' | 'anime' | 'news';
  descriptionEs: string;
  descriptionCa: string;
  descriptionEn: string;
  streamUrl: string;
  mode: 'hls' | 'youtube';
  youtubeId?: string;
  quality: string;
  tone: string;
  mark: string;
}

const DISCOVERY_PROVIDERS = [
  { id: 'all', es: 'Todas', ca: 'Totes', en: 'All' },
  { id: 'netflix', es: 'Netflix', ca: 'Netflix', en: 'Netflix' },
  { id: 'hbomax', es: 'HBO Max', ca: 'HBO Max', en: 'HBO Max' },
  { id: 'disney', es: 'Disney+', ca: 'Disney+', en: 'Disney+' },
  { id: 'prime', es: 'Prime Video', ca: 'Prime Video', en: 'Prime Video' },
  { id: 'apple', es: 'Apple TV+', ca: 'Apple TV+', en: 'Apple TV+' },
  { id: 'movistar', es: 'Movistar+', ca: 'Movistar+', en: 'Movistar+' },
  { id: 'filmin', es: 'Filmin', ca: 'Filmin', en: 'Filmin' },
  { id: 'crunchyroll', es: 'Crunchyroll', ca: 'Crunchyroll', en: 'Crunchyroll' },
  { id: 'skyshowtime', es: 'SkyShowtime', ca: 'SkyShowtime', en: 'SkyShowtime' },
] as const;

interface ExpandedDiscoverySectionProps {
  lang: AppLanguage;
  onSelectItem: (item: CatalogMovie) => void;
  onPlayFastChannel: (channel: FastChannelItem) => void;
  onAddToQueue: (item: Omit<RoomQueueItem, 'id' | 'addedBy'>) => void;
  isBookmarked: (item: CatalogMovie) => boolean;
  onToggleBookmark: (item: CatalogMovie) => void;
}

export const ExpandedDiscoverySection: React.FC<ExpandedDiscoverySectionProps> = ({
  lang,
  onSelectItem,
  onPlayFastChannel,
  onAddToQueue,
  isBookmarked,
  onToggleBookmark,
}) => {
  const [collections, setCollections] = useState<EditorialCollection[]>([]);
  const [genres, setGenres] = useState<CatalogGenreItem[]>([]);
  const [fastChannels, setFastChannels] = useState<FastChannelItem[]>([]);
  const [loadingCollections, setLoadingCollections] = useState(true);

  const [mediaType, setMediaType] = useState<'movie' | 'tv'>('movie');
  const [selectedGenreId, setSelectedGenreId] = useState<number>(28);
  const [selectedProvider, setSelectedProvider] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'popularity.desc' | 'vote_average.desc' | 'primary_release_date.desc'>(
    'popularity.desc'
  );
  const [discoverItems, setDiscoverItems] = useState<CatalogMovie[]>([]);
  const [discoverPage, setDiscoverPage] = useState(1);
  const [hasMoreDiscover, setHasMoreDiscover] = useState(false);
  const [loadingDiscover, setLoadingDiscover] = useState(false);

  const [fastCategory, setFastCategory] = useState<string>('all');
  const [bannerImgBroken, setBannerImgBroken] = useState(false);

  useEffect(() => {
    let active = true;
    setLoadingCollections(true);
    Promise.all([
      fetch(`/api/catalog/collections?lang=${encodeURIComponent(lang)}`).then((r) => r.json()),
      fetch('/api/catalog/fast-channels').then((r) => r.json()),
    ])
      .then(([colData, fastData]) => {
        if (!active) return;
        if (Array.isArray(colData?.collections)) {
          setCollections(colData.collections);
        }
        if (Array.isArray(colData?.genres)) {
          setGenres(colData.genres);
        }
        if (Array.isArray(fastData?.channels)) {
          setFastChannels(fastData.channels);
        }
      })
      .catch(() => {
        // Silent fallback if upstream TMDB is momentarily busy
      })
      .finally(() => {
        if (active) setLoadingCollections(false);
      });

    return () => {
      active = false;
    };
  }, [lang]);

  const fetchDiscoveryGrid = useCallback(
    async (pageNum: number, append: boolean) => {
      setLoadingDiscover(true);
      try {
        const effectiveSort =
          mediaType === 'tv' && sortBy === 'primary_release_date.desc'
            ? 'first_air_date.desc'
            : sortBy;
        const params = new URLSearchParams({
          mediaType,
          genreId: String(selectedGenreId),
          provider: selectedProvider,
          sort: effectiveSort,
          lang,
          page: String(pageNum),
        });
        const resp = await fetch(`/api/catalog/discover?${params.toString()}`);
        const data = await resp.json();
        if (Array.isArray(data?.items)) {
          setDiscoverItems((prev) => (append ? [...prev, ...data.items] : data.items));
          setHasMoreDiscover(Boolean(data.hasMore));
          setDiscoverPage(pageNum);
        }
      } catch {
        if (!append) setDiscoverItems([]);
      } finally {
        setLoadingDiscover(false);
      }
    },
    [lang, mediaType, selectedGenreId, selectedProvider, sortBy]
  );

  useEffect(() => {
    fetchDiscoveryGrid(1, false);
  }, [fetchDiscoveryGrid]);

  const visibleFastChannels =
    fastCategory === 'all'
      ? fastChannels
      : fastChannels.filter((c) => c.category === fastCategory);

  const visibleGenres = genres.filter(
    (g) => g.mediaType === 'both' || g.mediaType === mediaType
  );

  const getLocalizedGenreLabel = (g: CatalogGenreItem) =>
    pickLang(lang, { es: g.es, ca: g.ca, en: g.en });

  const mediaTypeBadgeLabel =
    mediaType === 'tv'
      ? pickLang(lang, { es: 'Serie', ca: 'Sèrie', en: 'Series' })
      : pickLang(lang, { es: 'Película', ca: 'Pel·lícula', en: 'Movie' });

  return (
    <div className="space-y-10 pt-2">
      {/* ================================================================== */}
      {/* 1. 24/7 FAST THEMATIC CHANNELS & DOCUMENTARY ORBIT BANNER          */}
      {/* ================================================================== */}
      {fastChannels.length > 0 && (
        <section className="space-y-4">
          <div className="relative rounded-3xl overflow-hidden nc-specular-surface border border-white/[0.1] shadow-2xl">
            <div className="absolute inset-0">
              {!bannerImgBroken && (
                <img
                  src={cosmosBannerImg}
                  alt=""
                  aria-hidden="true"
                  referrerPolicy="no-referrer"
                  onError={() => setBannerImgBroken(true)}
                  className="w-full h-full object-cover object-center opacity-35"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-r from-[#0B0B0E] via-[#0B0B0E]/85 to-transparent" />
              <div className="nc-aurora-ambient" />
            </div>

            <div className="relative z-10 p-5 sm:p-7 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-1.5 max-w-2xl">
                <p className="text-xs font-mono uppercase tracking-[0.16em] text-[#BF94FF]">
                  {pickLang(lang, {
                    es: 'EMISIÓN CONTINUA 24/7 · SIN ANUNCIOS',
                    ca: 'EMISSIÓ CONTINUA 24/7 · SENSE REGISTRE',
                    en: '24/7 LIVE FAST CHANNELS · INSTANT SYNC',
                  })}
                </p>
                <h3 className="font-display font-bold text-xl sm:text-2xl text-white tracking-tight">
                  {pickLang(lang, {
                    es: 'Canales Temáticos 24/7, Documentales y Directos',
                    ca: 'Canals Temàtics FAST, Documentals i Música',
                    en: 'Thematic FAST Channels, Documentaries & Live Radio',
                  })}
                </h3>
                <p className="text-xs sm:text-sm text-zinc-300">
                  {pickLang(lang, {
                    es: 'Noticias 24h, Teledeporte, NASA Live desde la órbita, SX3 Anime, DW Documental y música ambiental en un clic.',
                    ca: 'Notícies 24h, Teledeporte, NASA Live des de l’òrbita, SX3 Anime, DW Documental i música ambiental en un clic.',
                    en: 'Live 24h news, sports, NASA Earth orbit feed, anime and investigative documentaries with 1-click room sync.',
                  })}
                </p>
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
                {[
                  { id: 'all', es: 'Todos', ca: 'Tots', en: 'All' },
                  { id: 'sports', es: 'Deportes', ca: 'Esports', en: 'Sports' },
                  { id: 'documentary', es: 'Docs & Ciencia', ca: 'Docs i Ciència', en: 'Docs' },
                  { id: 'news', es: 'Noticias', ca: 'Notícies', en: 'News' },
                  { id: 'anime', es: 'Anime', ca: 'Anime', en: 'Anime' },
                  { id: 'music', es: 'Música', ca: 'Música', en: 'Music' },
                ].map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setFastCategory(cat.id);
                    }}
                    className={`min-h-11 px-3.5 rounded-2xl text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-all active:scale-95 ${
                      fastCategory === cat.id
                        ? 'bg-gradient-to-b from-[#9E5CFF] to-[#772CE8] text-white shadow-[0_6px_18px_rgba(145,70,255,0.34)]'
                        : 'bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-[#EFEFF1] hover:text-white'
                    }`}
                  >
                    {pickLang(lang, cat)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {visibleFastChannels.map((ch) => (
              <button
                key={ch.id}
                type="button"
                onClick={() => {
                  triggerHaptic('success');
                  onPlayFastChannel(ch);
                }}
                className="group nc-card-sheen nc-specular-surface p-4 rounded-2xl border border-white/[0.08] hover:border-[#9146FF]/55 hover:-translate-y-0.5 text-left flex items-start gap-3.5 cursor-pointer transition-all duration-200 active:scale-[0.98]"
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center font-display font-black text-xs text-white shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]"
                  style={{ backgroundColor: ch.tone }}
                >
                  {ch.mark}
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="font-display font-bold text-sm text-white truncate group-hover:text-[#BF94FF] transition-colors">
                      {ch.name}
                    </h4>
                    <Play className="w-3.5 h-3.5 text-[#ADADB8] group-hover:text-white shrink-0" />
                  </div>
                  <p className="text-xs text-[#ADADB8] line-clamp-2 leading-relaxed">
                    {pickLang(lang, {
                      es: ch.descriptionEs,
                      ca: ch.descriptionCa,
                      en: ch.descriptionEn,
                    })}
                  </p>
                  <div className="text-[11px] font-mono text-[#ADADB8] pt-0.5 flex items-center gap-1.5">
                    <span className="inline-flex items-end gap-[2px] h-2.5 shrink-0" aria-hidden="true">
                      <span className="w-[2px] h-full rounded-full bg-[#EB0400] nc-eq-bar-1" />
                      <span className="w-[2px] h-full rounded-full bg-[#EB0400] nc-eq-bar-2" />
                      <span className="w-[2px] h-full rounded-full bg-[#EB0400] nc-eq-bar-3" />
                    </span>
                    <Radio className="w-3 h-3 text-[#EB0400]" />
                    <span>
                      {pickLang(lang, { es: 'EN VIVO', ca: 'EN DIRECTE', en: 'LIVE' })} · {ch.quality}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ================================================================== */}
      {/* 2. EDITORIAL COLLECTIONS RAILS (Top 10, Gems, Sci-Fi, Binge, Docs) */}
      {/* ================================================================== */}
      {loadingCollections ? (
        <div className="py-8 flex items-center justify-center gap-2 text-xs text-[#ADADB8]">
          <Loader2 className="w-4 h-4 animate-spin text-[#9146FF]" />
          <span>
            {pickLang(lang, {
              es: 'Cargando colecciones editoriales...',
              ca: 'Carregant col·leccions editorials...',
              en: 'Loading editorial collections...',
            })}
          </span>
        </div>
      ) : (
        collections.map((col, colIndex) => {
          const title = pickLang(lang, {
            es: col.titleEs,
            ca: col.titleCa,
            en: col.titleEn,
          });
          const subtitle = pickLang(lang, {
            es: col.subtitleEs,
            ca: col.subtitleCa,
            en: col.subtitleEn,
          });

          return (
            <section key={col.id} className="space-y-3">
              <div className="flex items-end justify-between gap-4 px-0.5">
                <div>
                  <h3 className="font-display font-bold text-base sm:text-lg text-white tracking-tight">
                    {title}
                  </h3>
                  <p className="text-xs text-zinc-400">{subtitle}</p>
                </div>
                <span className="text-xs font-mono text-zinc-500 tabular-nums shrink-0">
                  {col.items.length}{' '}
                  {pickLang(lang, { es: 'títulos', ca: 'títols', en: 'titles' })}
                </span>
              </div>

              <div className="flex items-stretch gap-3 sm:gap-4 overflow-x-auto no-scrollbar pb-2">
                {col.items.map((item, idx) => {
                  const key = `${col.id}-${item.id}`;
                  const bookmarked = isBookmarked(item);
                  const showRank = colIndex === 0 && idx < 10;

                  return (
                    <div
                      key={key}
                      className="group relative w-[148px] sm:w-[172px] shrink-0 flex flex-col gap-2"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          onSelectItem({ ...item, mediaType: col.mediaType });
                        }}
                        aria-label={item.title}
                        className="absolute inset-0 z-0 rounded-2xl cursor-pointer focus-visible:outline-2 focus-visible:outline-[#9146FF]"
                      />

                      <div className="relative z-[1] pointer-events-none nc-card-sheen aspect-[2/3] rounded-2xl overflow-hidden bg-[#121218] border border-white/[0.09] group-hover:border-[#9146FF]/55 transition-all duration-200 group-hover:-translate-y-1 shadow-[0_14px_30px_rgba(0,0,0,0.6)]">
                        <PosterImage
                          src={item.poster}
                          alt={item.title}
                          aspect="none"
                          className="w-full h-full"
                          imgClassName="object-cover sm:group-hover:scale-105 transition-transform duration-300"
                          fallbackTitle={item.title}
                        />

                        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent opacity-80 group-hover:opacity-95 transition-opacity" />

                        {showRank && (
                          <span className="absolute bottom-2 left-2.5 font-display font-black text-3xl leading-none text-white/95 drop-shadow-[0_4px_12px_rgba(0,0,0,0.95)] tabular-nums">
                            {idx + 1}
                          </span>
                        )}

                        <div className="absolute top-2 right-2 z-10 pointer-events-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              triggerHaptic('light');
                              onToggleBookmark({ ...item, mediaType: col.mediaType });
                            }}
                            aria-label={pickLang(lang, {
                              es: 'Guardar en Mi Lista',
                              ca: 'Desar a La Meva Llista',
                              en: 'Save to My List',
                            })}
                            className={`w-9 h-9 rounded-full flex items-center justify-center backdrop-blur-md cursor-pointer transition-colors ${
                              bookmarked
                                ? 'bg-[#9146FF] text-white'
                                : 'bg-black/65 hover:bg-black/85 text-white'
                            }`}
                          >
                            <Heart className={`w-3.5 h-3.5 ${bookmarked ? 'fill-current' : ''}`} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              triggerHaptic('light');
                              onAddToQueue({
                                kind: col.mediaType,
                                title: item.title,
                                subtitle: `${item.year || 'HD'} · ★ ${item.rating || '7.5'}`,
                                poster: item.poster,
                                tmdbId: item.tmdbId,
                                preferLang: lang === 'en' ? 'EN' : 'ES',
                              });
                            }}
                            aria-label={pickLang(lang, {
                              es: 'Añadir a la cola',
                              ca: 'Afegir a la cua',
                              en: 'Add to queue',
                            })}
                            className="w-9 h-9 rounded-full bg-black/65 hover:bg-black/85 text-white flex items-center justify-center backdrop-blur-md cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="relative z-[1] pointer-events-none px-0.5 space-y-0.5">
                        <h4 className="font-display font-semibold text-xs text-white line-clamp-1">
                          {item.title}
                        </h4>
                        <p className="text-[11px] text-zinc-400 tabular-nums line-clamp-1">
                          {item.year || 'HD'} · ★ {item.rating || '7.5'}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })
      )}

      {/* ================================================================== */}
      {/* 3. MULTI-FILTER CATALOG EXPLORER (14 Genres · 10 Platforms · Sort) */}
      {/* ================================================================== */}
      <section className="space-y-4 p-4 sm:p-6 rounded-3xl nc-specular-surface border border-white/[0.1] shadow-2xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-white">
              <Compass className="w-5 h-5 text-[#BF94FF]" />
              <h3 className="font-display font-bold text-lg sm:text-xl tracking-tight">
                {pickLang(lang, {
                  es: 'Explorador Expandido por Géneros y Plataformas',
                  ca: 'Explorador Complet per Gèneres i Plataformes',
                  en: 'Expanded Genre & Streaming Platform Explorer',
                })}
              </h3>
            </div>
            <p className="text-xs text-[#ADADB8]">
              {pickLang(lang, {
                es: 'Combina formato, 14 géneros y catálogos de Filmin, Crunchyroll, Netflix, Max, Disney+ y más.',
                ca: 'Combina format, 14 gèneres i catàlegs de Filmin, Crunchyroll, Netflix, Max, Disney+ i més.',
                en: 'Combine format, 14 genres, and streaming catalogs including Filmin, Crunchyroll, Netflix, Max, Disney+, and Apple TV+.',
              })}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <div className="inline-flex items-center p-1 rounded-2xl bg-white/[0.04] border border-white/[0.08]">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setMediaType('movie');
                }}
                className={`min-h-10 px-3.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
                  mediaType === 'movie'
                    ? 'bg-gradient-to-b from-[#9E5CFF] to-[#772CE8] text-white shadow-sm'
                    : 'text-zinc-300 hover:text-white'
                }`}
              >
                <Film className="w-3.5 h-3.5" />
                <span>{pickLang(lang, { es: 'Películas', ca: 'Pel·lícules', en: 'Movies' })}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setMediaType('tv');
                }}
                className={`min-h-10 px-3.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
                  mediaType === 'tv'
                    ? 'bg-gradient-to-b from-[#9E5CFF] to-[#772CE8] text-white shadow-sm'
                    : 'text-zinc-300 hover:text-white'
                }`}
              >
                <Tv className="w-3.5 h-3.5" />
                <span>{pickLang(lang, { es: 'Series', ca: 'Sèries', en: 'Series' })}</span>
              </button>
            </div>

            <select
              aria-label={pickLang(lang, {
                es: 'Ordenar catálogo',
                ca: 'Ordenar catàleg',
                en: 'Sort catalog',
              })}
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="min-h-11 px-3.5 rounded-2xl bg-white/[0.05] border border-white/[0.1] text-xs font-semibold text-[#EFEFF1] outline-none cursor-pointer"
            >
              <option value="popularity.desc" className="bg-[#141418]">
                {pickLang(lang, { es: 'Más Populares', ca: 'Més Populars', en: 'Most Popular' })}
              </option>
              <option value="vote_average.desc" className="bg-[#141418]">
                {pickLang(lang, { es: 'Mejor Valoradas', ca: 'Més Ben Valorades', en: 'Top Rated' })}
              </option>
              <option value="primary_release_date.desc" className="bg-[#141418]">
                {pickLang(lang, { es: 'Más Recientes', ca: 'Més Recents', en: 'Newest Releases' })}
              </option>
            </select>
          </div>
        </div>

        {/* Genre Bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
          {visibleGenres.map((genre) => {
            const active = genre.id === selectedGenreId;
            return (
              <button
                key={genre.id}
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setSelectedGenreId(genre.id);
                }}
                className={`min-h-10 px-3.5 rounded-2xl text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-all active:scale-95 ${
                  active
                    ? 'bg-gradient-to-b from-[#9E5CFF] to-[#772CE8] text-white shadow-[0_4px_14px_rgba(145,70,255,0.34)]'
                    : 'bg-white/[0.05] hover:bg-white/[0.11] border border-white/[0.07] text-[#EFEFF1] hover:text-white'
                }`}
              >
                {getLocalizedGenreLabel(genre)}
              </button>
            );
          })}
        </div>

        {/* Platform Filter Row */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-2 border-b border-white/[0.06]">
          {DISCOVERY_PROVIDERS.map((prov) => {
            const active = prov.id === selectedProvider;
            return (
              <button
                key={prov.id}
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setSelectedProvider(prov.id);
                }}
                className={`min-h-9 px-3.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-all ${
                  active
                    ? 'bg-[#9146FF]/22 border border-[#9146FF]/55 text-white'
                    : 'text-[#ADADB8] hover:text-white hover:bg-white/[0.05]'
                }`}
              >
                {pickLang(lang, prov)}
              </button>
            );
          })}
        </div>

        {/* Results Grid */}
        {loadingDiscover && discoverItems.length === 0 ? (
          <div className="py-12 flex items-center justify-center gap-2 text-xs text-[#ADADB8]">
            <Loader2 className="w-5 h-5 animate-spin text-[#9146FF]" />
            <span>
              {pickLang(lang, {
                es: 'Explorando catálogo...',
                ca: 'Explorant catàleg...',
                en: 'Discovering titles...',
              })}
            </span>
          </div>
        ) : discoverItems.length === 0 ? (
          <div className="py-10 text-center space-y-2">
            <Sparkles className="w-6 h-6 text-zinc-500 mx-auto" />
            <p className="text-xs text-zinc-400">
              {pickLang(lang, {
                es: 'No hay títulos para esta combinación exacta de género y plataforma. Prueba con otra plataforma.',
                ca: 'No hi ha títols per a aquesta combinació exacta de gènere i plataforma. Prova amb una altra plataforma.',
                en: 'No titles match this exact genre and platform filter.',
              })}
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            <VirtualizedPosterGrid
              items={discoverItems}
              variant="poster"
              gapPx={14}
              getKey={(item) => `exp-${mediaType}-${item.id}`}
              renderItem={(item) => (
                <div className="group relative flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      onSelectItem({ ...item, mediaType });
                    }}
                    aria-label={item.title}
                    className="absolute inset-0 z-0 rounded-2xl cursor-pointer focus-visible:outline-2 focus-visible:outline-[#9146FF]"
                  />

                  <div className="relative z-[1] pointer-events-none nc-card-sheen aspect-[2/3] rounded-2xl overflow-hidden bg-[#121218] border border-white/[0.09] group-hover:border-[#9146FF]/55 transition-all duration-200 group-hover:-translate-y-1 shadow-[0_12px_28px_rgba(0,0,0,0.55)]">
                    <PosterImage
                      src={item.poster}
                      alt={item.title}
                      aspect="none"
                      className="w-full h-full"
                      imgClassName="object-cover sm:group-hover:scale-105 transition-transform duration-300"
                      fallbackTitle={item.title}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                    <span className="absolute bottom-2 right-2 text-[11px] font-mono font-semibold text-amber-300 flex items-center gap-0.5 tabular-nums">
                      <Star className="w-3 h-3 fill-current" />
                      {item.rating || '7.5'}
                    </span>
                  </div>

                  <div className="relative z-[1] pointer-events-none px-0.5">
                    <h4 className="font-display font-semibold text-xs text-white line-clamp-1 group-hover:text-[#BF94FF] transition-colors">
                      {item.title}
                    </h4>
                    <p className="text-[11px] text-zinc-400 tabular-nums">
                      {item.year || 'HD'} · {mediaTypeBadgeLabel}
                    </p>
                  </div>
                </div>
              )}
            />

            {hasMoreDiscover && (
              <div className="flex justify-center pt-1">
                <button
                  type="button"
                  disabled={loadingDiscover}
                  onClick={() => fetchDiscoveryGrid(discoverPage + 1, true)}
                  className="min-h-11 px-6 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-bold text-white flex items-center gap-2 cursor-pointer disabled:opacity-50 transition-colors"
                >
                  {loadingDiscover ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                  <span>
                    {pickLang(lang, {
                      es: 'Cargar más títulos',
                      ca: 'Carregar més títols',
                      en: 'Load more titles',
                    })}
                  </span>
                </button>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
};

