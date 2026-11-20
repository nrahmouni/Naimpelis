import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, Play, Radio, Search, Tv } from 'lucide-react';
import type { AppLanguage, SpanishTdtChannel, YouTubeSearchItem } from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import { useBackInterceptor } from '../../lib/backInterceptor';
import heroStadiumImg from '../../assets/images/movistar_dazn_hero_stadium_1795215099890.jpg';
import f1NightImg from '../../assets/images/dazn_motor_f1_night_1795215098633.jpg';
import basketballArenaImg from '../../assets/images/movistar_arena_basketball_1795215098968.jpg';
import originalsCinemaImg from '../../assets/images/movistar_originals_cinema_1795215099033.jpg';

export interface MovistarDaznCatalogItemUi {
  id: string;
  programId: string;
  title: string;
  operator: 'movistar' | 'dazn' | 'both';
  channelId: string;
  channelName: string;
  category: 'futbol' | 'motor' | 'deportes' | 'entretenimiento' | 'series';
  kind: 'program' | 'series';
  genre: string;
  description: string;
  claim?: string;
  imageUrl: string;
  themeKey: 'stadium' | 'motor' | 'basketball' | 'cinema';
  tmdbId?: number;
  featured?: boolean;
  liveTdtId?: string;
}

export interface MovistarDaznPlayableUi {
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

export interface MovistarDaznLiveChannelRef {
  id: string;
  name: string;
  dial: number;
  nowTitle: string;
  tdtChannel: SpanishTdtChannel;
}

interface MovistarDaznProgramPanelProps {
  lang: AppLanguage;
  program: MovistarDaznCatalogItemUi;
  onBack: () => void;
  onPlayTdtChannel: (
    channel: SpanishTdtChannel,
    signalIndex?: number,
    liveProgramHint?: string
  ) => void;
  onPlayYouTubeVideo: (item: YouTubeSearchItem) => void;
  onPlayCustomUrl: (
    url: string,
    meta?: { title?: string; subtitle?: string; poster?: string }
  ) => void;
}

export function resolveThemeArtwork(themeKey: MovistarDaznCatalogItemUi['themeKey']): string {
  switch (themeKey) {
    case 'motor':
      return f1NightImg;
    case 'basketball':
      return basketballArenaImg;
    case 'cinema':
      return originalsCinemaImg;
    case 'stadium':
    default:
      return heroStadiumImg;
  }
}

export const MovistarDaznProgramPanel: React.FC<MovistarDaznProgramPanelProps> = ({
  lang,
  program,
  onBack,
  onPlayTdtChannel,
  onPlayYouTubeVideo,
  onPlayCustomUrl,
}) => {
  const [loading, setLoading] = useState(true);
  const [playable, setPlayable] = useState<MovistarDaznPlayableUi[]>([]);
  const [relatedChannel, setRelatedChannel] = useState<MovistarDaznLiveChannelRef | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [failedImgs, setFailedImgs] = useState<Record<string, boolean>>({});
  const [chapterQuery, setChapterQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'dailymotion' | 'youtube'>('all');

  useBackInterceptor(true, 'movistar-dazn-program-back', onBack, { priority: 6 });

  const fallbackArt = resolveThemeArtwork(program.themeKey);
  const heroArt = program.imageUrl || fallbackArt;
  const isDazn = program.operator === 'dazn';
  const accentText = isDazn ? 'text-[#D4FF00]' : 'text-[#38BDF8]';
  const accentBtn = isDazn
    ? 'bg-[#D4FF00] hover:bg-[#E2FF4D] text-[#050608]'
    : 'bg-[#00A9E0] hover:bg-[#22B8EB] text-white';

  useEffect(() => {
    let active = true;
    setLoading(true);
    setResolveError(null);
    setPlayable([]);
    setRelatedChannel(null);
    setChapterQuery('');
    setSourceFilter('all');

    const url = `/api/movistar-dazn/program/${encodeURIComponent(
      program.programId
    )}?title=${encodeURIComponent(program.title)}`;

    fetch(url)
      .then((r) => r.json())
      .then((json) => {
        if (!active) return;
        if (json?.success) {
          setPlayable(Array.isArray(json.playablePrograms) ? json.playablePrograms : []);
          if (json.relatedChannel?.tdtChannel) {
            setRelatedChannel(json.relatedChannel);
          }
        }
      })
      .catch(() => {
        if (!active) return;
        setResolveError(
          pickLang(lang, {
            es: 'No pudimos cargar los programas de este canal.',
            ca: 'No hem pogut carregar els programes d’aquest canal.',
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
  }, [program.programId, program.title, lang]);

  const filteredPlayable = useMemo(() => {
    const q = chapterQuery.trim().toLowerCase();
    return playable.filter((ep) => {
      if (sourceFilter !== 'all' && ep.source !== sourceFilter) return false;
      if (!q) return true;
      return `${ep.title} ${ep.channel}`.toLowerCase().includes(q);
    });
  }, [playable, chapterQuery, sourceFilter]);

  const handlePlayPlayable = async (item: MovistarDaznPlayableUi) => {
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
        thumbnail: item.thumbnail || heroArt,
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
      const res = await fetch(`/api/movistar-dazn/play-video?${qs.toString()}`);
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success && data?.streamUrl) {
        onPlayCustomUrl(data.streamUrl, {
          title: item.title,
          subtitle: `${program.title} · ${program.channelName} · HLS 1080p`,
          poster: item.thumbnail || heroArt,
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

  return (
    <div className="w-full space-y-6">
      {/* HERO HEADER */}
      <div className="relative rounded-[24px] overflow-hidden bg-[#0D0D12] border border-white/[0.08]">
        <img
          src={failedImgs[program.id] ? fallbackArt : heroArt}
          alt={program.title}
          referrerPolicy="no-referrer"
          onError={() => setFailedImgs((prev) => ({ ...prev, [program.id]: true }))}
          className="absolute inset-0 w-full h-full object-cover opacity-40"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#000000] via-[#000000]/80 to-black/30" />

        <div className="relative z-10 p-5 sm:p-7 flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onBack();
              }}
              className="min-h-11 px-4 rounded-xl bg-black/70 hover:bg-white/[0.12] border border-white/[0.12] text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-2 cursor-pointer transition-colors whitespace-nowrap"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Volver a DAZN &amp; Movistar+</span>
            </button>

            <span className="text-xs font-medium text-zinc-300">
              {program.channelName} · {program.genre}
            </span>
          </div>

          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5 pt-4">
            <div className="space-y-2 max-w-2xl">
              <div className={`text-xs font-semibold ${accentText}`}>
                {program.operator === 'dazn'
                  ? 'DAZN España'
                  : program.operator === 'movistar'
                  ? 'Movistar Plus+'
                  : 'DAZN & Movistar Plus+'}{' '}
                · {program.genre}
              </div>
              <h1 className="font-display font-bold text-2xl sm:text-4xl text-white tracking-tight text-balance">
                {program.title}
              </h1>
              <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed line-clamp-3">
                {program.description}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0">
              {playable[0] && (
                <button
                  type="button"
                  disabled={resolvingId === playable[0].id}
                  onClick={() => void handlePlayPlayable(playable[0])}
                  className={`min-h-11 px-5 rounded-xl text-sm font-bold inline-flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95 disabled:opacity-60 whitespace-nowrap ${accentBtn}`}
                >
                  {resolvingId === playable[0].id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4 fill-current" />
                  )}
                  <span>Ver emisión destacada</span>
                </button>
              )}

              {relatedChannel && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    onPlayTdtChannel(relatedChannel.tdtChannel, 0, relatedChannel.nowTitle);
                  }}
                  className="min-h-11 px-4 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.12] text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-2 cursor-pointer transition-colors whitespace-nowrap"
                >
                  <Radio className="w-4 h-4 text-[#00A9E0]" />
                  <span>Directo {relatedChannel.name}</span>
                </button>
              )}
            </div>
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

      {!loading && playable.length > 0 && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={chapterQuery}
              onChange={(e) => setChapterQuery(e.target.value)}
              placeholder={`Buscar en ${program.title} (jornada, carrera, entrevista)...`}
              className="w-full min-h-11 pl-10 pr-4 rounded-xl bg-[#0D0D12] border border-white/[0.1] focus:border-[#00A9E0]/70 outline-none text-xs sm:text-sm text-white placeholder:text-zinc-500"
            />
          </div>

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
                    ? 'bg-[#00A9E0] text-white'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display font-bold text-base sm:text-lg text-white tracking-tight flex items-center gap-2">
            <Tv className="w-4 h-4 text-[#00A9E0]" />
            <span>Programas y Emisiones Disponibles</span>
          </h2>
          {!loading && (
            <span className="text-xs text-zinc-400 tabular-nums">
              {filteredPlayable.length} {filteredPlayable.length === 1 ? 'vídeo' : 'vídeos'}
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
                  className="group text-left rounded-2xl bg-[#0D0D12] hover:bg-[#14141C] border border-white/[0.08] hover:border-[#00A9E0]/60 overflow-hidden cursor-pointer transition-all flex flex-col disabled:opacity-60"
                >
                  <div className="relative aspect-video w-full bg-[#14141C] overflow-hidden">
                    <img
                      src={ep.thumbnail && !failedImgs[ep.id] ? ep.thumbnail : fallbackArt}
                      alt={ep.title}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      onError={() => setFailedImgs((p) => ({ ...p, [ep.id]: true }))}
                      className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent" />
                    <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between text-[11px] font-semibold text-white tabular-nums">
                      <span>{ep.quality}</span>
                      <span>{ep.duration}</span>
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="w-12 h-12 rounded-full bg-[#00A9E0] text-white flex items-center justify-center shadow-lg">
                        {isBusy ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <Play className="w-5 h-5 fill-current ml-0.5" />
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="p-3.5 space-y-1 flex-1 flex flex-col justify-between">
                    <h3 className="text-sm font-semibold text-white line-clamp-2 group-hover:text-[#38BDF8] transition-colors">
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
          <div className="rounded-2xl bg-[#0D0D12] border border-white/[0.08] p-6 text-xs sm:text-sm text-zinc-400">
            No hay emisiones coincidentes con tu filtro. Prueba otra búsqueda o abre el canal en directo arriba.
          </div>
        )}
      </section>
    </div>
  );
};
