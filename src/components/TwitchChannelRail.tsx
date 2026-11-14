import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  Compass,
  Film,
  Flame,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Radio,
  Sparkles,
  Trophy,
  Users,
} from 'lucide-react';
import type { AppLanguage, FavoriteChannelItem } from '../types';
import type { RecentRoomEntry } from '../utils/storage';
import type { CatalogSection } from './MediaCatalogHub';
import { triggerHaptic } from '../utils/haptics';
import { getMonogramInitials } from './MobileViewportGuard';

export interface FastChannelItem {
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

interface TwitchChannelRailProps {
  lang: AppLanguage;
  recentRooms: RecentRoomEntry[];
  favoriteChannels: FavoriteChannelItem[];
  activeRoomId: string;
  activeVideoUrl: string;
  catalogSection: CatalogSection;
  onSelectRoom: (roomId: string, roomName?: string) => void;
  onSelectFastChannel: (channel: FastChannelItem) => void;
  onSelectFavoriteChannel: (channel: FavoriteChannelItem) => void;
  onChangeCatalogSection: (section: CatalogSection) => void;
  onOpenTvModal?: () => void;
}

const FAST_CATEGORY_LABELS: Record<FastChannelItem['category'], { es: string; ca: string; en: string }> = {
  cinema: { es: 'Cine 24/7', ca: 'Cinema 24/7', en: 'Cinema 24/7' },
  sports: { es: 'Deportes', ca: 'Esports', en: 'Sports' },
  documentary: { es: 'Documentales', ca: 'Documentals', en: 'Documentary' },
  music: { es: 'Música en vivo', ca: 'Música en directe', en: 'Live Music' },
  anime: { es: 'Anime', ca: 'Anime', en: 'Anime' },
  news: { es: 'Noticias 24h', ca: 'Notícies 24h', en: '24h News' },
};

export const TwitchChannelRail: React.FC<TwitchChannelRailProps> = ({
  lang,
  recentRooms,
  favoriteChannels,
  activeRoomId,
  activeVideoUrl,
  catalogSection,
  onSelectRoom,
  onSelectFastChannel,
  onSelectFavoriteChannel,
  onChangeCatalogSection,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [fastChannels, setFastChannels] = useState<FastChannelItem[]>([]);

  useEffect(() => {
    let mounted = true;
    fetch('/api/catalog/fast-channels')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (mounted && Array.isArray(data?.channels)) {
          setFastChannels(data.channels);
        }
      })
      .catch(() => {
        // Silent network fallback; rail keeps rooms and directory intact
      });
    return () => {
      mounted = false;
    };
  }, []);

  const directoryItems: {
    id: CatalogSection;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    {
      id: 'home',
      label: lang === 'ca' ? 'Explorar' : lang === 'en' ? 'Explore' : 'Explorar',
      icon: Compass,
    },
    {
      id: 'movies',
      label: lang === 'ca' ? 'Pel·lícules' : lang === 'en' ? 'Movies' : 'Películas',
      icon: Film,
    },
    {
      id: 'series',
      label: lang === 'ca' ? 'Sèries' : 'Series',
      icon: Sparkles,
    },
    {
      id: 'anime',
      label: 'Anime',
      icon: Flame,
    },
    {
      id: 'sports',
      label: lang === 'ca' ? 'Futbol' : lang === 'en' ? 'Football' : 'Fútbol',
      icon: Trophy,
    },
    {
      id: 'tdt',
      label: lang === 'ca' ? 'TV en Directe' : lang === 'en' ? 'Live TV' : 'TV Directo',
      icon: Radio,
    },
  ];

  const isDirectorySectionActive = (id: CatalogSection) => {
    if (id === 'movies') return catalogSection === 'movies' || catalogSection === 'vose';
    if (id === 'series') return catalogSection === 'series' || catalogSection === 'castellano';
    if (id === 'anime') return catalogSection === 'anime' || catalogSection === 'catala';
    return catalogSection === id;
  };

  const getCategoryLabel = (cat: FastChannelItem['category']) => {
    const entry = FAST_CATEGORY_LABELS[cat];
    return lang === 'ca' ? entry.ca : lang === 'en' ? entry.en : entry.es;
  };

  return (
    <aside
      aria-label="Directorio principal y canales en vivo"
      className={`hidden lg:flex flex-col shrink-0 h-full bg-[#111115]/95 backdrop-blur-xl border-r border-white/[0.07] select-none transition-[width] duration-200 ease-out overflow-hidden ${
        collapsed ? 'w-[4.25rem]' : 'w-60'
      }`}
    >
      {/* Rail Header */}
      <div
        className={`h-11 px-3 border-b border-white/[0.06] flex items-center shrink-0 ${
          collapsed ? 'justify-center' : 'justify-between'
        }`}
      >
        {!collapsed && (
          <span className="font-display font-bold text-[11px] uppercase tracking-[0.14em] text-zinc-400">
            {lang === 'ca' ? 'Navegació' : lang === 'en' ? 'Browse' : 'Directorio'}
          </span>
        )}
        <button
          type="button"
          onClick={() => {
            triggerHaptic('light');
            setCollapsed((v) => !v);
          }}
          title={collapsed ? 'Expandir barra lateral' : 'Colapsar barra lateral'}
          aria-label={collapsed ? 'Expandir barra lateral' : 'Colapsar barra lateral'}
          className="w-8 h-8 rounded-xl hover:bg-white/[0.08] text-zinc-400 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
        >
          {collapsed ? (
            <PanelLeftOpen className="w-4 h-4" />
          ) : (
            <PanelLeftClose className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Scrollable Sections */}
      <div className="flex-1 overflow-y-auto custom-scrollbar py-2.5 space-y-5">
        {/* 1. Primary Directory (Single Source of Truth on Desktop) */}
        <section className="space-y-1 px-2">
          <div className="space-y-0.5">
            {directoryItems.map((item) => {
              const Icon = item.icon;
              const isActive = isDirectorySectionActive(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    onChangeCatalogSection(item.id);
                  }}
                  title={item.label}
                  className={`relative w-full flex items-center gap-3 min-h-10 rounded-xl text-left cursor-pointer transition-colors ${
                    collapsed ? 'justify-center px-0' : 'px-3'
                  } ${
                    isActive
                      ? 'text-white'
                      : 'text-zinc-400 hover:text-white hover:bg-white/[0.05]'
                  }`}
                >
                  {isActive && (
                    <motion.span
                      layoutId="desktop-rail-directory-pill"
                      transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                      className="absolute inset-0 rounded-xl bg-gradient-to-r from-[#9146FF]/28 via-[#9146FF]/16 to-transparent border border-[#9146FF]/45 shadow-[0_6px_18px_rgba(145,70,255,0.2)]"
                      aria-hidden="true"
                    />
                  )}
                  <Icon
                    className={`relative z-10 w-4 h-4 shrink-0 ${
                      isActive ? 'text-[#C6A2FF]' : ''
                    }`}
                  />
                  {!collapsed && (
                    <span className="relative z-10 text-xs font-semibold truncate">
                      {item.label}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* 2. Canales en Directo (FAST 24/7) */}
        {fastChannels.length > 0 && (
          <section className="space-y-1.5 pt-3 border-t border-white/[0.06] px-2">
            {!collapsed && (
              <div className="px-2 pb-0.5 flex items-center justify-between">
                <h2 className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                  {lang === 'ca'
                    ? 'Canals en Directe'
                    : lang === 'en'
                    ? 'Live Channels'
                    : 'Canales en Directo'}
                </h2>
                <span className="text-[10px] font-mono text-zinc-500 tabular-nums">
                  {fastChannels.length}
                </span>
              </div>
            )}
            <div className="space-y-0.5">
              {fastChannels.map((ch) => {
                const isChannelActive =
                  Boolean(activeVideoUrl) &&
                  (activeVideoUrl === ch.streamUrl ||
                    (ch.youtubeId && activeVideoUrl.includes(ch.youtubeId)));
                return (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      onSelectFastChannel(ch);
                    }}
                    title={`${ch.name} · ${getCategoryLabel(ch.category)} (${ch.quality})`}
                    className={`w-full flex items-center gap-2.5 rounded-xl px-2 py-2 text-left cursor-pointer transition-all ${
                      collapsed ? 'justify-center' : ''
                    } ${
                      isChannelActive
                        ? 'bg-[#9146FF]/18 border border-[#9146FF]/45 shadow-[0_6px_16px_rgba(145,70,255,0.18)]'
                        : 'hover:bg-white/[0.05] border border-transparent'
                    }`}
                  >
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center font-display font-bold text-[10px] text-white shrink-0 shadow-sm relative ring-1 ring-white/15"
                      style={{ backgroundColor: ch.tone || '#9146FF' }}
                    >
                      <span>{ch.mark}</span>
                      {collapsed && (
                        <span
                          aria-hidden="true"
                          className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#EB0400] border-2 border-[#111115]"
                        />
                      )}
                    </div>

                    {!collapsed && (
                      <>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold text-zinc-100 truncate leading-tight">
                            {ch.name}
                          </div>
                          <div className="text-[11px] text-zinc-400 truncate leading-tight mt-0.5">
                            {getCategoryLabel(ch.category)}
                          </div>
                        </div>
                        {isChannelActive ? (
                          <span className="flex items-end gap-0.5 h-3 shrink-0" aria-hidden="true">
                            <span className="w-0.5 h-full rounded-full bg-[#BF94FF] nc-eq-bar-1" />
                            <span className="w-0.5 h-full rounded-full bg-[#BF94FF] nc-eq-bar-2" />
                            <span className="w-0.5 h-full rounded-full bg-[#BF94FF] nc-eq-bar-3" />
                          </span>
                        ) : (
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#EB0400]" />
                            <span className="text-[10px] font-mono text-zinc-400 tabular-nums">
                              {ch.quality}
                            </span>
                          </div>
                        )}
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* 3. Salas Recientes y Canales Favoritos */}
        {(recentRooms.length > 0 || favoriteChannels.length > 0) && (
          <section className="space-y-1.5 pt-3 border-t border-white/[0.06] px-2">
            {!collapsed && (
              <div className="px-2 pb-0.5 flex items-center justify-between">
                <h2 className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                  {lang === 'ca'
                    ? 'Sales i Favorits'
                    : lang === 'en'
                    ? 'Rooms & Favorites'
                    : 'Salas y Favoritos'}
                </h2>
                <Users className="w-3.5 h-3.5 text-zinc-500" />
              </div>
            )}

            <div className="space-y-0.5">
              {recentRooms.slice(0, 4).map((room) => {
                const isActive = room.id === activeRoomId;
                return (
                  <button
                    key={room.id}
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      if (!isActive) onSelectRoom(room.id, room.name);
                    }}
                    title={`${room.name} (#${room.id.toUpperCase()})`}
                    className={`w-full flex items-center gap-2.5 rounded-xl px-2 py-2 text-left cursor-pointer transition-colors ${
                      collapsed ? 'justify-center' : ''
                    } ${
                      isActive
                        ? 'bg-white/[0.08] border border-white/[0.12]'
                        : 'hover:bg-white/[0.05] border border-transparent'
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center font-display font-bold text-[11px] shrink-0 border ${
                        isActive
                          ? 'bg-[#9146FF] text-white border-[#C6A2FF]/60 shadow-[0_0_12px_rgba(145,70,255,0.45)]'
                          : 'bg-white/[0.06] text-zinc-200 border-white/10'
                      }`}
                    >
                      {getMonogramInitials(room.name || room.id)}
                    </div>
                    {!collapsed && (
                      <>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold text-zinc-100 truncate leading-tight">
                            {room.name || `Sala ${room.id.toUpperCase()}`}
                          </div>
                          <div className="text-[11px] font-mono text-zinc-400 truncate leading-tight mt-0.5">
                            #{room.id.toUpperCase()}
                          </div>
                        </div>
                        {isActive && (
                          <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0 shadow-[0_0_8px_#34d399]" />
                        )}
                      </>
                    )}
                  </button>
                );
              })}

              {favoriteChannels.slice(0, 4).map((fav) => (
                <button
                  key={fav.favId}
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    onSelectFavoriteChannel(fav);
                  }}
                  title={fav.title}
                  className={`w-full flex items-center gap-2.5 rounded-xl px-2 py-2 text-left cursor-pointer hover:bg-white/[0.05] border border-transparent transition-colors ${
                    collapsed ? 'justify-center' : ''
                  }`}
                >
                  <div className="w-8 h-8 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center text-[#BF94FF] shrink-0">
                    <Play className="w-3.5 h-3.5 fill-current" />
                  </div>
                  {!collapsed && (
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-zinc-100 truncate leading-tight">
                        {fav.title}
                      </div>
                      <div className="text-[11px] text-zinc-400 truncate leading-tight mt-0.5">
                        {fav.channelLabel || fav.competition || 'Canal Favorito'}
                      </div>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </aside>
  );
};
