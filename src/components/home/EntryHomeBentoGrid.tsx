import React from 'react';
import { motion } from 'motion/react';
import {
  ChevronRight,
  Database,
  Layers,
  Pause,
  Play,
  Radio,
  Server,
  Trophy,
  Tv,
} from 'lucide-react';
import type { AppLanguage, CatalogMovie } from '../../types';
import type { PrimaryWorldId } from '../../store/useAppStore';
import { useMusicStore } from '../../store/useMusicStore';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import {
  RiffanChannelsIcon,
  RiffanDiceIcon,
  RiffanFootballIcon,
  RiffanMoviesIcon,
  RiffanUsersIcon,
} from '../ui/RiffanIcons';
import { RiffanMusicLogo } from '../music/RiffanMusicLogo';
import { CoverArt } from '../music/CoverArt';

interface EntryHomeBentoGridProps {
  lang: AppLanguage;
  sessionMode?: 'solo' | 'party';
  lastUsedWorld: PrimaryWorldId | null;
  heroPosters?: CatalogMovie[];
  featuredChannels?: Array<{ id: string; mark: string; tone: string }>;
  liveMatchesCount: number;
  featuredLiveMatch: string | null;
  roomParticipantsCount: number;
  onPreloadWorld?: (world: PrimaryWorldId) => void;
  onCardClick: (worldId: PrimaryWorldId, e?: React.MouseEvent<HTMLButtonElement>) => void;
}

export const EntryHomeBentoGrid: React.FC<EntryHomeBentoGridProps> = ({
  lang,
  sessionMode = 'party',
  lastUsedWorld,
  liveMatchesCount,
  featuredLiveMatch,
  roomParticipantsCount,
  onPreloadWorld,
  onCardClick,
}) => {
  const currentTrack = useMusicStore((s) => s.currentTrack);
  const activeRadio = useMusicStore((s) => s.activeRadio);
  const isPlaying = useMusicStore((s) => s.isPlaying);
  const likedCount = useMusicStore((s) => s.likedTracks.length);
  const togglePlayPause = useMusicStore((s) => s.togglePlayPause);

  const primaryTiles: Array<{
    id: PrimaryWorldId;
    title: string;
    subtitle: string;
    icon: React.ReactNode;
    accentBorder: string;
    highlightBadge?: string;
  }> = [
    {
      id: 'cine',
      title: pickLang(lang, { es: 'Cine y Series', ca: 'Cine i Sèries', en: 'Movies & Series' }),
      subtitle: pickLang(lang, {
        es: 'Películas, series y anime 4K',
        ca: 'Pel·lícules, sèries i anime 4K',
        en: 'Movies, series & anime 4K',
      }),
      icon: (
        <span className="w-11 h-11 rounded-xl bg-[#7C3AED]/15 border border-[#7C3AED]/30 flex items-center justify-center text-[#A78BFA] shrink-0">
          <RiffanMoviesIcon size={20} animate="hover" />
        </span>
      ),
      accentBorder: 'hover:border-[#7C3AED]/60',
    },
    {
      id: 'music',
      title: 'Riffan Music',
      subtitle:
        likedCount > 0
          ? pickLang(lang, {
              es: `Hi-Fi, letras · ${likedCount} favoritas`,
              ca: `Hi-Fi, lletres · ${likedCount} preferides`,
              en: `Hi-Fi, lyrics · ${likedCount} liked`,
            })
          : pickLang(lang, {
              es: 'Música Hi-Fi, letras y radios',
              ca: 'Música Hi-Fi, lletres i ràdios',
              en: 'Hi-Fi music, lyrics & radios',
            }),
      icon: <RiffanMusicLogo variant="mark" size={44} frameStyle="obsidian" />,
      accentBorder: 'hover:border-[#3B82F6]/65 border-[#3B82F6]/25',
    },
    {
      id: 'tv',
      title: pickLang(lang, { es: 'TV en Directo', ca: 'TV en Directe', en: 'Live TV' }),
      subtitle: pickLang(lang, {
        es: 'TDT España y canales 24/7',
        ca: 'TDT Espanya i canals 24/7',
        en: 'Spanish DTT & 24/7 channels',
      }),
      icon: (
        <span className="w-11 h-11 rounded-xl bg-sky-500/15 border border-sky-400/30 flex items-center justify-center text-sky-400 shrink-0">
          <RiffanChannelsIcon size={20} animate="hover" />
        </span>
      ),
      accentBorder: 'hover:border-sky-400/55',
    },
    {
      id: 'futbol',
      title: pickLang(lang, { es: 'Fútbol', ca: 'Futbol', en: 'Football', rif: 'Lkurat' }),
      subtitle:
        liveMatchesCount > 0
          ? featuredLiveMatch ||
            pickLang(lang, {
              es: `${liveMatchesCount} en directo`,
              ca: `${liveMatchesCount} en directe`,
              en: `${liveMatchesCount} live`,
              rif: `${liveMatchesCount} direkt`,
            })
          : featuredLiveMatch ||
            pickLang(lang, {
              es: 'Barça y Real Madrid · Agenda',
              ca: 'Barça i Real Madrid · Agenda',
              en: 'Barça & Real Madrid · Schedule',
              rif: 'Barça d Real Madrid · Ahil',
            }),
      icon: (
        <span className="w-11 h-11 rounded-xl bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center text-emerald-400 shrink-0">
          <RiffanFootballIcon size={20} animate="hover" />
        </span>
      ),
      accentBorder: 'hover:border-emerald-400/55',
      highlightBadge:
        liveMatchesCount > 0
          ? pickLang(lang, {
              es: `${liveMatchesCount} en vivo`,
              ca: `${liveMatchesCount} en directe`,
              en: `${liveMatchesCount} live`,
              rif: `${liveMatchesCount} direkt`,
            })
          : undefined,
    },
    {
      id: 'sala',
      title: pickLang(lang, { es: 'Sala con Amigos', ca: 'Sala amb Amics', en: 'Watch Party' }),
      subtitle:
        sessionMode === 'solo'
          ? pickLang(lang, {
              es: 'Crea una sala para ver juntos',
              ca: 'Crea una sala per veure junts',
              en: 'Watch together in sync',
            })
          : pickLang(lang, {
              es: `${roomParticipantsCount > 0 ? roomParticipantsCount : 1} en sala · Chat y voz`,
              ca: `${roomParticipantsCount > 0 ? roomParticipantsCount : 1} a la sala · Xat i veu`,
              en: `${roomParticipantsCount > 0 ? roomParticipantsCount : 1} in room · Chat & voice`,
            }),
      icon: (
        <span className="w-11 h-11 rounded-xl bg-[#7C3AED]/15 border border-[#7C3AED]/30 flex items-center justify-center text-[#A78BFA] shrink-0">
          <RiffanUsersIcon size={19} animate="hover" />
        </span>
      ),
      accentBorder: 'hover:border-[#7C3AED]/60',
    },
    {
      id: 'juegos',
      title: pickLang(lang, { es: 'Juegos', ca: 'Jocs', en: 'Games' }),
      subtitle: pickLang(lang, {
        es: 'Billar, Parchís, UNO y Pinturillo',
        ca: 'Billar, Parxís, UNO i Pinturillo',
        en: 'Pool, Parchís, UNO & Pictionary',
      }),
      icon: (
        <span className="w-11 h-11 rounded-xl bg-fuchsia-500/15 border border-fuchsia-400/30 flex items-center justify-center text-fuchsia-300 shrink-0">
          <RiffanDiceIcon size={20} animate="hover" />
        </span>
      ),
      accentBorder: 'hover:border-fuchsia-400/55',
    },
  ];

  const platformTiles: Array<{
    id: PrimaryWorldId;
    title: string;
    subtitle: string;
    icon: React.ReactNode;
    accentBorder: string;
  }> = [
    {
      id: 'movistardazn',
      title: 'DAZN & Movistar+',
      subtitle: pickLang(lang, {
        es: 'Deporte en vivo y Originales M+',
        ca: 'Esport en directe i Originals M+',
        en: 'Live sports & M+ Originals',
      }),
      icon: (
        <span className="w-10 h-10 rounded-xl bg-[#00A9E0]/15 border border-[#00A9E0]/30 flex items-center justify-center text-[#38BDF8] shrink-0">
          <Trophy className="w-4.5 h-4.5" />
        </span>
      ),
      accentBorder: 'hover:border-[#00A9E0]/60',
    },
    {
      id: 'atresplayer',
      title: 'Atresmedia',
      subtitle: pickLang(lang, {
        es: 'Antena 3, laSexta y programas',
        ca: 'Antena 3, laSexta i programes',
        en: 'Antena 3, laSexta & shows',
      }),
      icon: (
        <span className="w-10 h-10 rounded-xl bg-[#FF5E1A]/15 border border-[#FF5E1A]/30 flex items-center justify-center text-[#FF7A3D] shrink-0">
          <Tv className="w-4.5 h-4.5" />
        </span>
      ),
      accentBorder: 'hover:border-[#FF5E1A]/60',
    },
    {
      id: 'clipbox',
      title: 'ClipBox',
      subtitle: pickLang(lang, {
        es: 'Cine, anime y subtítulos',
        ca: 'Cinema, anime i subtítols',
        en: 'Cinema, anime & subtitles',
      }),
      icon: (
        <span className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-400/30 flex items-center justify-center text-cyan-300 shrink-0">
          <Database className="w-4.5 h-4.5" />
        </span>
      ),
      accentBorder: 'hover:border-cyan-400/55',
    },
    {
      id: 'rbtv',
      title: 'RBTV+',
      subtitle: pickLang(lang, {
        es: 'Canales deportivos',
        ca: 'Canals esportius',
        en: 'Sports channels',
      }),
      icon: (
        <span className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-400/30 flex items-center justify-center text-amber-300 shrink-0">
          <Radio className="w-4.5 h-4.5" />
        </span>
      ),
      accentBorder: 'hover:border-amber-400/55',
    },
    {
      id: 'belix',
      title: 'Belix TV',
      subtitle: pickLang(lang, {
        es: 'Parrilla y directos',
        ca: 'Graella i directes',
        en: 'Lineup & live feeds',
      }),
      icon: (
        <span className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-400/30 flex items-center justify-center text-rose-300 shrink-0">
          <Server className="w-4.5 h-4.5" />
        </span>
      ),
      accentBorder: 'hover:border-rose-400/55',
    },
    {
      id: 'providers',
      title: pickLang(lang, {
        es: 'Catálogo Total',
        ca: 'Catàleg Total',
        en: 'Full Catalog',
      }),
      subtitle: 'VOD 4K · 2M2H · Adtupac · Ultra VIP · Sult-Vo',
      icon: (
        <span className="w-10 h-10 rounded-xl bg-[#7C3AED]/15 border border-[#7C3AED]/30 flex items-center justify-center text-[#A78BFA] shrink-0">
          <Layers className="w-4.5 h-4.5" />
        </span>
      ),
      accentBorder: 'hover:border-[#7C3AED]/60',
    },
  ];

  const activeTitle = activeRadio ? activeRadio.name : currentTrack?.title || '';
  const activeSubtitle = activeRadio
    ? `${activeRadio.country} · FM 24/7`
    : currentTrack?.artist.name || '';
  const activeCover = activeRadio
    ? activeRadio.favicon
    : currentTrack?.album.coverXl || currentTrack?.album.cover || '';

  return (
    <div className="space-y-5">
      {/* ACTIVE RIFFAN MUSIC 1-ROW CARD (WHEN A TRACK OR RADIO IS LOADED) */}
      {(currentTrack || activeRadio) && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.14 }}
          className="flex items-center justify-between gap-3 p-2.5 sm:p-3 rounded-2xl bg-gradient-to-r from-[#0C1426] via-[#0D0D12] to-[#120D1F] border border-[#3B82F6]/35 shadow-[0_12px_32px_rgba(0,0,0,0.45)]"
        >
          <button
            type="button"
            onClick={(e) => onCardClick('music', e)}
            onPointerEnter={() => onPreloadWorld?.('music')}
            className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer group"
          >
            <CoverArt
              src={activeCover}
              alt={activeTitle}
              fallbackLabel={activeSubtitle || activeTitle}
              className="w-12 h-12 rounded-xl object-cover shrink-0 border border-white/10"
            />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold text-[#60A5FA] leading-tight">
                {pickLang(lang, {
                  es: 'Escuchando ahora · Riffan Music',
                  ca: 'Escoltant ara · Riffan Music',
                  en: 'Listening now · Riffan Music',
                })}
              </p>
              <p className="text-sm font-bold text-white truncate mt-0.5">{activeTitle}</p>
              <p className="text-xs text-zinc-400 truncate">{activeSubtitle}</p>
            </div>
          </button>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                togglePlayPause();
              }}
              aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
              className="w-11 h-11 rounded-full bg-gradient-to-br from-[#2563EB] to-[#3B82F6] text-white flex items-center justify-center cursor-pointer active:scale-95 transition-transform shadow-md"
            >
              {isPlaying ? (
                <Pause className="w-4.5 h-4.5 fill-current" />
              ) : (
                <Play className="w-4.5 h-4.5 fill-current ml-0.5" />
              )}
            </button>
            <button
              type="button"
              onClick={(e) => onCardClick('music', e)}
              className="hidden sm:inline-flex min-h-11 px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-xs font-semibold text-zinc-100 items-center gap-1 cursor-pointer transition-colors"
            >
              <span>
                {pickLang(lang, {
                  es: 'Abrir Riffan Music',
                  ca: 'Obrir Riffan Music',
                  en: 'Open Riffan Music',
                })}
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
            </button>
          </div>
        </motion.div>
      )}

      {/* SECTION 1: COMPACT SPOTIFY-STYLE 2-COL QUICK ACCESS TILES */}
      <section aria-label="Accesos principales">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
          {primaryTiles.map((tile, idx) => {
            const isRecent = lastUsedWorld === tile.id;
            return (
              <motion.button
                key={tile.id}
                type="button"
                data-tv-focusable="true"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.14, delay: idx * 0.02 }}
                whileTap={{ scale: 0.97 }}
                onPointerEnter={() => onPreloadWorld?.(tile.id)}
                onTouchStart={() => onPreloadWorld?.(tile.id)}
                onClick={(e) => onCardClick(tile.id, e)}
                className={`group flex items-center gap-3 min-h-[68px] px-3 py-2.5 rounded-2xl bg-[#0D0D12] hover:bg-[#14141C] border border-white/[0.08] ${tile.accentBorder} text-left cursor-pointer transition-all duration-150 tv-focus-ring`}
              >
                {tile.icon}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="font-display font-bold text-sm sm:text-[15px] text-white truncate leading-snug">
                      {tile.title}
                    </h2>
                    {tile.highlightBadge ? (
                      <span className="text-[11px] font-bold text-[#FF6B6B] shrink-0 tabular-nums">
                        {tile.highlightBadge}
                      </span>
                    ) : isRecent ? (
                      <span className="text-[11px] font-semibold text-[#A78BFA] shrink-0">
                        {pickLang(lang, { es: 'Reciente', ca: 'Recent', en: 'Recent' })}
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs text-zinc-400 truncate mt-0.5">{tile.subtitle}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-300 shrink-0 transition-colors" />
              </motion.button>
            );
          })}
        </div>
      </section>

      {/* SECTION 2: CANALES Y PLATAFORMAS */}
      <section className="space-y-2.5">
        <h2 className="font-display font-semibold text-xs sm:text-sm text-zinc-400 px-0.5">
          {pickLang(lang, {
            es: 'Canales y Plataformas',
            ca: 'Canals i Plataformes',
            en: 'Channels & Platforms',
          })}
        </h2>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {platformTiles.map((tile) => (
            <button
              key={tile.id}
              type="button"
              data-tv-focusable="true"
              onPointerEnter={() => onPreloadWorld?.(tile.id)}
              onTouchStart={() => onPreloadWorld?.(tile.id)}
              onClick={(e) => onCardClick(tile.id, e)}
              className={`group flex items-center gap-2.5 min-h-[60px] p-2.5 rounded-2xl bg-[#0D0D12] hover:bg-[#14141C] border border-white/[0.07] ${tile.accentBorder} text-left cursor-pointer active:scale-97 transition-all tv-focus-ring`}
            >
              {tile.icon}
              <div className="min-w-0 flex-1">
                <p className="font-display font-bold text-xs sm:text-[13px] text-white truncate">
                  {tile.title}
                </p>
                <p className="text-[11px] text-zinc-400 truncate mt-0.5">{tile.subtitle}</p>
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
};
