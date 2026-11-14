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
  { id: 'all', label: 'Todas' },
  { id: 'netflix', label: 'Netflix' },
  { id: 'hbomax', label: 'HBO Max' },
  { id: 'disney', label: 'Disney+' },
  { id: 'prime', label: 'Prime Video' },
  { id: 'apple', label: 'Apple TV+' },
  { id: 'movistar', label: 'Movistar+' },
  { id: 'filmin', label: 'Filmin' },
  { id: 'crunchyroll', label: 'Crunchyroll' },
  { id: 'skyshowtime', label: 'SkyShowtime' },
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
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});

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
    lang === 'ca' ? g.ca : lang === 'en' ? g.en : g.es;

  return (
    <div className="space-y-10 pt-2">
      {/* ================================================================== */}
      {/* 1. 24/7 FAST THEMATIC CHANNELS & DOCUMENTARY ORBIT BANNER          */}
      {/* ================================================================== */}
      {fastChannels.length > 0 && (
        <section className="space-y-4">
          <div className="relative rounded-3xl overflow-hidden border border-white/[0.08] bg-[#18181B]">
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
              <div className="absolute inset-0 bg-gradient-to-r from-[#0E0E10] via-[#0E0E10]/85 to-transparent" />
            </div>

            <div className="relative z-10 p-5 sm:p-7 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-1.5 max-w-2xl">
                <p className="text-xs font-mono uppercase tracking-[0.16em] text-[#BF94FF]">
                  {lang === 'ca'
                    ? 'EMISSIÓ CONTINUA 24/7 · SENSE REGISTRE'
                    : lang === 'en'
                    ? '24/7 LIVE FAST CHANNELS · INSTANT SYNC'
                    : 'EMISIÓN CONTINUA 24/7 · SIN ANUNCIOS'}
                </p>
                <h3 className="font-display font-bold text-xl sm:text-2xl text-white tracking-tight">
                  {lang === 'ca'
                    ? 'Canals Temàtics FAST, Documentals i Música'
                    : lang === 'en'
                    ? 'Thematic FAST Channels, Documentaries & Live Radio'
                    : 'Canales Temáticos 24/7, Documentales y Directos'}
                </h3>
                <p className="text-xs sm:text-sm text-zinc-300">
                  {lang === 'es'
                    ? 'Noticias 24h, Teledeporte, NASA Live desde la órbita, SX3 Anime, DW Documental y música ambiental en un clic.'
                    : 'Live 24h news, sports, NASA Earth orbit feed, anime and investigative documentaries with 1-click room sync.'}
                </p>
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
                {[
                  { id: 'all', es: 'Todos', en: 'All' },
                  { id: 'sports', es: 'Deportes', en: 'Sports' },
                  { id: 'documentary', es: 'Docs & Ciencia', en: 'Docs' },
                  { id: 'news', es: 'Noticias', en: 'News' },
                  { id: 'anime', es: 'Anime', en: 'Anime' },
                  { id: 'music', es: 'Música', en: 'Music' },
                ].map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setFastCategory(cat.id);
                    }}
                    className={`min-h-10 px-3.5 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                      fastCategory === cat.id
                        ? 'bg-[#9146FF] text-white'
                        : 'bg-[#26262C] hover:bg-white/[0.14] text-[#EFEFF1] hover:text-white'
                    }`}
                  >
                    {lang === 'en' ? cat.en : cat.es}
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
                className="group p-4 rounded-2xl bg-[#18181B] hover:bg-[#1F1F23] border border-white/[0.08] hover:border-[#9146FF]/45 text-left flex items-start gap-3.5 cursor-pointer transition-all"
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center font-display font-black text-xs text-white shrink-0 shadow-inner"
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
                    {lang === 'ca'
                      ? ch.descriptionCa
                      : lang === 'en'
                      ? ch.descriptionEn
                      : ch.descriptionEs}
                  </p>
                  <div className="text-[11px] font-mono text-[#ADADB8] pt-0.5 flex items-center gap-1.5">
                    <Radio className="w-3 h-3 text-[#EB0400]" />
                    <span>EN VIVO · {ch.quality}</span>
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
          <span>{lang === 'es' ? 'Cargando colecciones editoriales...' : 'Loading collections...'}</span>
        </div>
      ) : (
        collections.map((col, colIndex) => {
          const title =
            lang === 'ca' ? col.titleCa : lang === 'en' ? col.titleEn : col.titleEs;
          const subtitle =
            lang === 'ca' ? col.subtitleCa : lang === 'en' ? col.subtitleEn : col.subtitleEs;

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
                  {col.items.length} títulos
                </span>
              </div>

              <div className="flex items-stretch gap-3 sm:gap-4 overflow-x-auto no-scrollbar pb-2">
                {col.items.map((item, idx) => {
                  const key = `${col.id}-${item.id}`;
                  const imgBroken = Boolean(brokenImages[key]);
                  const bookmarked = isBookmarked(item);
                  const showRank = colIndex === 0 && idx < 10;

                  return (
                    <div
                      key={key}
                      className="group w-[148px] sm:w-[172px] shrink-0 flex flex-col gap-2"
                    >
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          triggerHaptic('light');
                          onSelectItem({ ...item, mediaType: col.mediaType });
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            onSelectItem({ ...item, mediaType: col.mediaType });
                          }
                        }}
                        className="relative aspect-[2/3] rounded-2xl overflow-hidden bg-[#12141d] border border-white/[0.08] hover:border-white/30 cursor-pointer transition-transform duration-200 hover:-translate-y-0.5"
                      >
                        {!imgBroken && item.poster ? (
                          <img
                            src={item.poster}
                            alt={item.title}
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            onError={() =>
                              setBrokenImages((prev) => ({ ...prev, [key]: true }))
                            }
                            className="w-full h-full object-cover sm:group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full p-3 flex flex-col items-center justify-center text-center">
                            <Film className="w-6 h-6 text-zinc-500 mb-2" />
                            <span className="text-xs font-semibold text-white line-clamp-2">
                              {item.title}
                            </span>
                          </div>
                        )}

                        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent opacity-80 group-hover:opacity-95 transition-opacity" />

                        {showRank && (
                          <span className="absolute bottom-2 left-2.5 font-display font-black text-3xl leading-none text-white/95 drop-shadow-[0_4px_12px_rgba(0,0,0,0.95)] tabular-nums">
                            {idx + 1}
                          </span>
                        )}

                        <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              triggerHaptic('light');
                              onToggleBookmark({ ...item, mediaType: col.mediaType });
                            }}
                            aria-label="Guardar en Mi Lista"
                            className={`w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-md cursor-pointer transition-colors ${
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
                                preferLang: 'ES',
                              });
                            }}
                            aria-label="Añadir a la cola"
                            className="w-8 h-8 rounded-full bg-black/65 hover:bg-black/85 text-white flex items-center justify-center backdrop-blur-md cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="px-0.5 space-y-0.5">
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
      <section className="space-y-4 p-4 sm:p-6 rounded-3xl bg-[#18181B] border border-white/[0.08]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-white">
              <Compass className="w-5 h-5 text-[#9146FF]" />
              <h3 className="font-display font-bold text-lg sm:text-xl tracking-tight">
                {lang === 'ca'
                  ? 'Explorador Complet per Gèneres i Plataformes'
                  : lang === 'en'
                  ? 'Expanded Genre & Streaming Platform Explorer'
                  : 'Explorador Expandido por Géneros y Plataformas'}
              </h3>
            </div>
            <p className="text-xs text-[#ADADB8]">
              {lang === 'es'
                ? 'Combina formato, 14 géneros y catálogos de Filmin, Crunchyroll, Netflix, Max, Disney+ y más.'
                : 'Combine format, 14 genres, and streaming catalogs including Filmin, Crunchyroll, Netflix, Max, Disney+, and Apple TV+.'}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setMediaType('movie');
              }}
              className={`min-h-10 px-4 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                mediaType === 'movie'
                  ? 'bg-[#9146FF] text-white'
                  : 'bg-[#26262C] hover:bg-white/[0.12] text-[#EFEFF1]'
              }`}
            >
              <Film className="w-3.5 h-3.5" />
              <span>{lang === 'es' ? 'Películas' : 'Movies'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setMediaType('tv');
              }}
              className={`min-h-10 px-4 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                mediaType === 'tv'
                  ? 'bg-[#9146FF] text-white'
                  : 'bg-[#26262C] hover:bg-white/[0.12] text-[#EFEFF1]'
              }`}
            >
              <Tv className="w-3.5 h-3.5" />
              <span>{lang === 'es' ? 'Series' : 'Series'}</span>
            </button>

            <select
              aria-label="Ordenar catálogo"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="min-h-10 px-3 rounded-xl bg-[#26262C] border border-white/[0.1] text-xs font-semibold text-[#EFEFF1] outline-none cursor-pointer"
            >
              <option value="popularity.desc">
                {lang === 'es' ? 'Más Populares' : 'Most Popular'}
              </option>
              <option value="vote_average.desc">
                {lang === 'es' ? 'Mejor Valoradas' : 'Top Rated'}
              </option>
              <option value="primary_release_date.desc">
                {lang === 'es' ? 'Más Recientes' : 'Newest Releases'}
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
                className={`min-h-9 px-3.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  active
                    ? 'bg-[#9146FF] text-white'
                    : 'bg-[#26262C] hover:bg-white/[0.12] text-[#EFEFF1] hover:text-white'
                }`}
              >
                {getLocalizedGenreLabel(genre)}
              </button>
            );
          })}
        </div>

        {/* Platform Filter Row */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 border-b border-white/[0.06]">
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
                className={`min-h-9 px-3 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  active
                    ? 'text-[#BF94FF] border-b-2 border-[#9146FF] bg-[#9146FF]/15'
                    : 'text-[#ADADB8] hover:text-white'
                }`}
              >
                {prov.label}
              </button>
            );
          })}
        </div>

        {/* Results Grid */}
        {loadingDiscover && discoverItems.length === 0 ? (
          <div className="py-12 flex items-center justify-center gap-2 text-xs text-[#ADADB8]">
            <Loader2 className="w-5 h-5 animate-spin text-[#9146FF]" />
            <span>{lang === 'es' ? 'Explorando catálogo...' : 'Discovering titles...'}</span>
          </div>
        ) : discoverItems.length === 0 ? (
          <div className="py-10 text-center space-y-2">
            <Sparkles className="w-6 h-6 text-zinc-500 mx-auto" />
            <p className="text-xs text-zinc-400">
              {lang === 'es'
                ? 'No hay títulos para esta combinación exacta de género y plataforma. Prueba con otra plataforma.'
                : 'No titles match this exact genre and platform filter.'}
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3.5 sm:gap-4">
              {discoverItems.map((item) => {
                const key = `exp-${mediaType}-${item.id}`;
                const imgBroken = Boolean(brokenImages[key]);
                return (
                  <div
                    key={key}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      triggerHaptic('light');
                      onSelectItem({ ...item, mediaType });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        onSelectItem({ ...item, mediaType });
                      }
                    }}
                    className="group flex flex-col gap-2 cursor-pointer"
                  >
                    <div className="relative aspect-[2/3] rounded-2xl overflow-hidden bg-[#12141d] border border-white/[0.08] hover:border-white/30 transition-transform duration-200 hover:-translate-y-0.5">
                      {!imgBroken && item.poster ? (
                        <img
                          src={item.poster}
                          alt={item.title}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          onError={() =>
                            setBrokenImages((prev) => ({ ...prev, [key]: true }))
                          }
                          className="w-full h-full object-cover sm:group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full p-3 flex flex-col items-center justify-center text-center">
                          <Film className="w-6 h-6 text-zinc-500 mb-2" />
                          <span className="text-xs font-semibold text-white line-clamp-2">
                            {item.title}
                          </span>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                      <span className="absolute bottom-2 right-2 text-[11px] font-mono font-semibold text-amber-300 flex items-center gap-0.5 tabular-nums">
                        <Star className="w-3 h-3 fill-current" />
                        {item.rating || '7.5'}
                      </span>
                    </div>

                    <div className="px-0.5">
                      <h4 className="font-display font-semibold text-xs text-white line-clamp-1 group-hover:text-[#BF94FF] transition-colors">
                        {item.title}
                      </h4>
                      <p className="text-[11px] text-zinc-400 tabular-nums">
                        {item.year || 'HD'} · {mediaType === 'tv' ? 'Serie' : 'Película'}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

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
                  <span>{lang === 'es' ? 'Cargar más títulos' : 'Load more titles'}</span>
                </button>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
};
