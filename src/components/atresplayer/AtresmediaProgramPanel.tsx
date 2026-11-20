import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, Play, Radio, Search, Tv } from 'lucide-react';
import type { AppLanguage, YouTubeSearchItem } from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import { useBackInterceptor } from '../../lib/backInterceptor';

export interface AtresmediaCatalogItemUi {
  id: string;
  formatId: string;
  title: string;
  channelId: string;
  channelName: string;
  category: 'concursos' | 'entretenimiento' | 'series' | 'actualidad';
  kind: 'program' | 'series';
  genre: string;
  description: string;
  claim?: string;
  imageUrl: string;
  logoUrl?: string;
  tmdbId?: number;
  featured?: boolean;
}

export interface AtresmediaPlayableEpisodeUi {
  id: string;
  source: 'dailymotion' | 'youtube';
  videoId: string;
  title: string;
  channel: string;
  duration: string;
  durationSec: number;
  thumbnail: string;
  quality: string;
}

export interface AtresmediaOfficialEpisodeUi {
  id: string;
  title: string;
  subTitle: string;
  description: string;
  thumbnail: string;
  visibility: string;
  url: string;
}

interface AtresmediaProgramPanelProps {
  lang: AppLanguage;
  program: AtresmediaCatalogItemUi;
  onBack: () => void;
  onPlayYouTubeVideo: (item: YouTubeSearchItem) => void;
  onPlayCustomUrl: (
    url: string,
    meta?: { title?: string; subtitle?: string; poster?: string }
  ) => void;
}

export const AtresmediaProgramPanel: React.FC<AtresmediaProgramPanelProps> = ({
  lang,
  program,
  onBack,
  onPlayYouTubeVideo,
  onPlayCustomUrl,
}) => {
  const [loading, setLoading] = useState(true);
  const [playable, setPlayable] = useState<AtresmediaPlayableEpisodeUi[]>([]);
  const [officialEpisodes, setOfficialEpisodes] = useState<AtresmediaOfficialEpisodeUi[]>([]);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [failedImgs, setFailedImgs] = useState<Record<string, boolean>>({});
  const [chapterQuery, setChapterQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'dailymotion' | 'youtube'>('all');

  useBackInterceptor(true, 'atresmedia-program-detail-back', onBack, { priority: 6 });

  useEffect(() => {
    let active = true;
    setLoading(true);
    setResolveError(null);
    setPlayable([]);
    setOfficialEpisodes([]);
    setChapterQuery('');
    setSourceFilter('all');

    const url = `/api/atresmedia/program/${encodeURIComponent(
      program.formatId
    )}?title=${encodeURIComponent(program.title)}`;

    fetch(url)
      .then((r) => r.json())
      .then((json) => {
        if (!active) return;
        if (json?.success) {
          setPlayable(Array.isArray(json.playablePrograms) ? json.playablePrograms : []);
          setOfficialEpisodes(Array.isArray(json.officialEpisodes) ? json.officialEpisodes : []);
        }
      })
      .catch(() => {
        if (!active) return;
        setResolveError(
          pickLang(lang, {
            es: 'No pudimos cargar los episodios de este programa.',
            ca: 'No hem pogut carregar els episodis d’aquest programa.',
            en: 'Could not load episodes for this program.',
          })
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [program.formatId, program.title, lang]);

  const filteredPlayable = useMemo(() => {
    const q = chapterQuery.trim().toLowerCase();
    return playable.filter((ep) => {
      if (sourceFilter !== 'all' && ep.source !== sourceFilter) return false;
      if (!q) return true;
      return `${ep.title} ${ep.channel}`.toLowerCase().includes(q);
    });
  }, [playable, chapterQuery, sourceFilter]);

  const filteredOfficial = useMemo(() => {
    const q = chapterQuery.trim().toLowerCase();
    if (!q) return officialEpisodes;
    return officialEpisodes.filter((ep) =>
      `${ep.title} ${ep.subTitle} ${ep.description}`.toLowerCase().includes(q)
    );
  }, [officialEpisodes, chapterQuery]);

  const handlePlayPlayable = async (item: AtresmediaPlayableEpisodeUi) => {
    triggerHaptic('light');
    setResolveError(null);
    if (item.source === 'youtube') {
      onPlayYouTubeVideo({
        id: item.id,
        videoId: item.videoId,
        title: item.title,
        channel: `${program.channelName} · ${item.channel}`,
        duration: item.duration || 'HD',
        views: '',
        thumbnail: item.thumbnail || program.imageUrl,
        url: `https://www.youtube.com/watch?v=${item.videoId}`,
      });
      return;
    }

    setResolvingId(item.id);
    try {
      const qs = new URLSearchParams({
        source: 'dailymotion',
        id: item.videoId,
        programTitle: program.title,
        episodeTitle: item.title,
      });
      const res = await fetch(`/api/atresmedia/play-video?${qs.toString()}`);
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success && data?.streamUrl) {
        onPlayCustomUrl(data.streamUrl, {
          title: item.title,
          subtitle: `${program.title} · ${program.channelName} · HLS 1080p`,
          poster: item.thumbnail || program.imageUrl,
        });
      } else {
        setResolveError(data?.error || 'Este vídeo ya no está activo. Prueba otro de la lista.');
      }
    } catch {
      setResolveError('Error al conectar con el stream del programa.');
    } finally {
      setResolvingId(null);
    }
  };

  const handlePlayOfficialEpisode = async (ep: AtresmediaOfficialEpisodeUi) => {
    triggerHaptic('light');
    setResolveError(null);
    setResolvingId(ep.id);
    try {
      const qs = new URLSearchParams({
        programTitle: program.title,
        episodeTitle: ep.title,
      });
      const res = await fetch(`/api/atresmedia/play-video?${qs.toString()}`);
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success || !data?.streamUrl) {
        setResolveError(
          data?.error || 'No se encontró una emisión completa para esta fecha. Prueba otro programa.'
        );
        return;
      }

      if (data.mode === 'youtube') {
        onPlayYouTubeVideo({
          id: `a3-ep-${ep.id}`,
          videoId: data.streamUrl,
          title: `${program.title} · ${ep.title}`,
          channel: program.channelName,
          duration: 'HD',
          views: '',
          thumbnail: ep.thumbnail || data.thumbnail || program.imageUrl,
          url: `https://www.youtube.com/watch?v=${data.streamUrl}`,
        });
      } else {
        onPlayCustomUrl(data.streamUrl, {
          title: `${program.title} · ${ep.title}`,
          subtitle: data.subtitle || `${program.channelName} · HLS 1080p`,
          poster: ep.thumbnail || data.thumbnail || program.imageUrl,
        });
      }
    } catch {
      setResolveError('No pudimos iniciar la reproducción de este programa.');
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <div className="w-full space-y-6">
      {/* HERO HEADER WITH BACK BUTTON */}
      <div className="relative rounded-[24px] overflow-hidden bg-[#0D0D12] border border-white/[0.08]">
        {program.imageUrl && !failedImgs[program.id] && (
          <img
            src={program.imageUrl}
            alt={program.title}
            referrerPolicy="no-referrer"
            onError={() => setFailedImgs((prev) => ({ ...prev, [program.id]: true }))}
            className="absolute inset-0 w-full h-full object-cover opacity-35"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#000000] via-[#000000]/75 to-transparent" />

        <div className="relative z-10 p-5 sm:p-7 flex flex-col gap-5">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onBack();
              }}
              className="min-h-11 px-4 rounded-xl bg-black/70 hover:bg-white/[0.12] border border-white/[0.12] text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-2 cursor-pointer transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>
                {pickLang(lang, {
                  es: 'Volver a Atresmedia',
                  ca: 'Tornar a Atresmedia',
                  en: 'Back to Atresmedia',
                })}
              </span>
            </button>

            <span className="text-xs font-medium text-zinc-300">
              {program.channelName} · {program.genre}
            </span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pt-4">
            <div className="space-y-2 max-w-2xl">
              {program.logoUrl ? (
                <img
                  src={program.logoUrl}
                  alt={program.title}
                  referrerPolicy="no-referrer"
                  className="h-12 sm:h-16 w-auto max-w-[260px] object-contain"
                />
              ) : (
                <h1 className="font-display font-bold text-2xl sm:text-3xl text-white tracking-tight">
                  {program.title}
                </h1>
              )}
              <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed line-clamp-3">
                {program.description}
              </p>
            </div>

            {playable[0] && (
              <button
                type="button"
                disabled={resolvingId === playable[0].id}
                onClick={() => void handlePlayPlayable(playable[0])}
                className="min-h-11 px-5 rounded-xl bg-[#FF5E1A] hover:bg-[#EA580C] text-white text-sm font-bold inline-flex items-center justify-center gap-2 cursor-pointer shadow-[0_10px_28px_rgba(255,94,26,0.35)] shrink-0 transition-all active:scale-95 disabled:opacity-60"
              >
                {resolvingId === playable[0].id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 fill-current" />
                )}
                <span>
                  {pickLang(lang, {
                    es: 'Ver programa completo',
                    ca: 'Veure programa complet',
                    en: 'Watch full program',
                  })}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>

      {resolveError && (
        <div
          role="alert"
          className="rounded-2xl bg-[#190D0D] border border-red-500/30 px-4 py-3 text-xs sm:text-sm text-red-200"
        >
          {resolveError}
        </div>
      )}

      {!loading && (playable.length > 0 || officialEpisodes.length > 0) && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={chapterQuery}
              onChange={(e) => setChapterQuery(e.target.value)}
              placeholder={`Buscar capítulos de ${program.title} (fecha, rosco, programa)...`}
              className="w-full min-h-11 pl-10 pr-4 rounded-xl bg-[#0D0D12] border border-white/[0.1] focus:border-[#FF5E1A]/70 outline-none text-xs sm:text-sm text-white placeholder:text-zinc-500"
            />
          </div>

          {playable.length > 0 && (
            <div className="flex items-center gap-1 p-1 rounded-xl bg-[#0D0D12] border border-white/[0.08] self-start sm:self-auto">
              {(
                [
                  { id: 'all', label: 'Todos' },
                  { id: 'dailymotion', label: 'HLS 1080p' },
                  { id: 'youtube', label: 'YouTube HD' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSourceFilter(tab.id)}
                  className={`min-h-9 px-3 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                    sourceFilter === tab.id
                      ? 'bg-[#FF5E1A] text-white'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* PLAYABLE FULL PROGRAMS SECTION */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display font-bold text-base sm:text-lg text-white tracking-tight flex items-center gap-2">
            <Radio className="w-4 h-4 text-[#FF5E1A]" />
            <span>
              {pickLang(lang, {
                es: 'Programas Completos Disponibles',
                ca: 'Programes Complets Disponibles',
                en: 'Available Full Programs',
              })}
            </span>
          </h2>
          {!loading && (
            <span className="text-xs text-zinc-400 tabular-nums">
              {filteredPlayable.length} {filteredPlayable.length === 1 ? 'capítulo' : 'capítulos'}
            </span>
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div
                key={idx}
                className="aspect-video rounded-2xl bg-[#0D0D12] border border-white/[0.06] animate-pulse"
              />
            ))}
          </div>
        ) : filteredPlayable.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredPlayable.map((ep) => {
              const isBusy = resolvingId === ep.id;
              return (
                <button
                  key={ep.id}
                  type="button"
                  disabled={isBusy}
                  onClick={() => void handlePlayPlayable(ep)}
                  className="group text-left rounded-2xl bg-[#0D0D12] hover:bg-[#14141C] border border-white/[0.08] hover:border-[#FF5E1A]/60 overflow-hidden cursor-pointer transition-all flex flex-col disabled:opacity-60"
                >
                  <div className="relative aspect-video w-full bg-[#14141C] overflow-hidden">
                    {ep.thumbnail && !failedImgs[ep.id] ? (
                      <img
                        src={ep.thumbnail}
                        alt={ep.title}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        onError={() => setFailedImgs((p) => ({ ...p, [ep.id]: true }))}
                        className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#FF5E1A]/20 to-[#0D0D12]">
                        <Tv className="w-8 h-8 text-[#FF5E1A]/60" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                    <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between text-[11px] font-semibold text-white tabular-nums">
                      <span>{ep.quality}</span>
                      <span>{ep.duration}</span>
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="w-12 h-12 rounded-full bg-[#FF5E1A] text-white flex items-center justify-center shadow-lg">
                        {isBusy ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <Play className="w-5 h-5 fill-current ml-0.5" />
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="p-3.5 space-y-1 flex-1 flex flex-col justify-between">
                    <h3 className="text-sm font-semibold text-white line-clamp-2 group-hover:text-[#FF8A4C] transition-colors">
                      {ep.title}
                    </h3>
                    <p className="text-xs text-zinc-400 truncate">
                      {ep.channel} · {ep.source === 'dailymotion' ? 'Stream HLS' : 'YouTube HD'}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl bg-[#0D0D12] border border-white/[0.08] p-5 text-xs sm:text-sm text-zinc-400">
            Selecciona cualquiera de los programas emitidos abajo para buscar y reproducir su emisión disponible.
          </div>
        )}
      </section>

      {/* OFFICIAL RECENT BROADCAST EPISODES FROM ATRESPLAYER */}
      {filteredOfficial.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display font-bold text-base sm:text-lg text-white tracking-tight flex items-center gap-2">
              <Tv className="w-4 h-4 text-[#FF5E1A]" />
              <span>Últimos Programas Emitidos · {program.channelName}</span>
            </h2>
            <span className="text-xs text-zinc-400 tabular-nums">
              {filteredOfficial.length} emisiones
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredOfficial.map((ep) => {
              const isBusy = resolvingId === ep.id;
              return (
                <button
                  key={ep.id}
                  type="button"
                  disabled={isBusy}
                  onClick={() => void handlePlayOfficialEpisode(ep)}
                  className="group text-left rounded-2xl bg-[#0D0D12] hover:bg-[#14141C] border border-white/[0.08] hover:border-[#FF5E1A]/50 overflow-hidden cursor-pointer transition-all flex flex-col disabled:opacity-60"
                >
                  <div className="relative aspect-video w-full bg-[#14141C] overflow-hidden">
                    {ep.thumbnail && !failedImgs[`off-${ep.id}`] ? (
                      <img
                        src={ep.thumbnail}
                        alt={ep.title}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        onError={() => setFailedImgs((p) => ({ ...p, [`off-${ep.id}`]: true }))}
                        className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#FF5E1A]/20 to-[#0D0D12]">
                        <Tv className="w-7 h-7 text-[#FF5E1A]/60" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="w-11 h-11 rounded-full bg-[#FF5E1A] text-white flex items-center justify-center shadow-lg">
                        {isBusy ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <Play className="w-5 h-5 fill-current ml-0.5" />
                        )}
                      </span>
                    </div>
                  </div>
                  <div className="p-3.5 space-y-1">
                    <h3 className="text-sm font-semibold text-white line-clamp-1 group-hover:text-[#FF8A4C] transition-colors">
                      {ep.title}
                    </h3>
                    <p className="text-xs text-zinc-400 line-clamp-2">
                      {ep.description || `${ep.subTitle} · Emisión oficial`}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
};
