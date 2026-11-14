import React, { useEffect, useState } from 'react';
import {
  Compass,
  Film,
  Flame,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Radio,
  Sparkles,
  Tv,
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
  onOpenTvModal: () => void;
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
  onOpenTvModal,
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

  const getCategoryLabel = (cat: FastChannelItem['category']) => {
    const entry = FAST_CATEGORY_LABELS[cat];
    return lang === 'ca' ? entry.ca : lang === 'en' ? entry.en : entry.es;
  };

  return (
    <aside
      aria-label="Navegación de canales en vivo"
      className={`hidden lg:flex flex-col shrink-0 h-full bg-[#18181B] border-r border-white/[0.08] select-none transition-[width] duration-200 ease-out overflow-hidden ${
        collapsed ? 'w-14' : 'w-60'
      }`}
    >
      {/* Rail Header */}
      <div
        className={`h-11 px-3 border-b border-white/[0.06] flex items-center shrink-0 ${
          collapsed ? 'justify-center' : 'justify-between'
        }`}
      >
        {!collapsed && (
          <span className="font-display font-bold text-xs uppercase tracking-[0.12em] text-[#EFEFF1]">
            {lang === 'ca' ? 'Per a tu' : lang === 'en' ? 'For You' : 'Para ti'}
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
          className="w-8 h-8 rounded-lg hover:bg-[#26262C] text-[#ADADB8] hover:text-white flex items-center justify-center cursor-pointer transition-colors"
        >
          {collapsed ? (
            <PanelLeftOpen className="w-4 h-4" />
          ) : (
            <PanelLeftClose className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Scrollable Sections */}
      <div className="flex-1 overflow-y-auto custom-scrollbar py-2.5 space-y-4">
        {/* 1. Canales en Directo (FAST 24/7) */}
        {fastChannels.length > 0 && (
          <section className="space-y-1">
            {!collapsed && (
              <div className="px-3 pb-1 flex items-center justify-between">
                <h2 className="text-[11px] font-bold uppercase tracking-wider text-[#ADADB8]">
                  {lang === 'ca'
                    ? 'Canals en Directe'
                    : lang === 'en'
                    ? 'Live Channels'
                    : 'Canales en Directo'}
                </h2>
                <span className="text-[10px] font-mono text-[#ADADB8] tabular-nums">
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
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 text-left cursor-pointer transition-colors ${
                      collapsed ? 'justify-center' : ''
                    } ${
                      isChannelActive
                        ? 'bg-[#1F1F23] border-l-2 border-[#9146FF]'
                        : 'hover:bg-[#1F1F23] border-l-2 border-transparent'
                    }`}
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center font-display font-bold text-[10px] text-white shrink-0 shadow-sm relative"
                      style={{ backgroundColor: ch.tone || '#9146FF' }}
                    >
                      <span>{ch.mark}</span>
                      {collapsed && (
                        <span
                          aria-hidden="true"
                          className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#EB0400] border-2 border-[#18181B]"
                        />
                      )}
                    </div>

                    {!collapsed && (
                      <>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold text-[#EFEFF1] truncate leading-tight">
                            {ch.name}
                          </div>
                          <div className="text-[11px] text-[#ADADB8] truncate leading-tight mt-0.5">
                            {getCategoryLabel(ch.category)}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="w-2 h-2 rounded-full bg-[#EB0400]" />
                          <span className="text-[10px] font-mono text-[#ADADB8] tabular-nums">
                            {ch.quality}
                          </span>
                        </div>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* 2. Salas Seguidas / Canales Favoritos */}
        {(recentRooms.length > 0 || favoriteChannels.length > 0) && (
          <section className="space-y-1 pt-2 border-t border-white/[0.06]">
            {!collapsed && (
              <div className="px-3 pb-1 flex items-center justify-between">
                <h2 className="text-[11px] font-bold uppercase tracking-wider text-[#ADADB8]">
                  {lang === 'ca'
                    ? 'Sales Seguites'
                    : lang === 'en'
                    ? 'Followed Rooms'
                    : 'Salas Seguidas'}
                </h2>
                <Users className="w-3.5 h-3.5 text-[#ADADB8]" />
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
                    title={`${room.name} (${room.id.toUpperCase()})`}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 text-left cursor-pointer transition-colors ${
                      collapsed ? 'justify-center' : ''
                    } ${
                      isActive
                        ? 'bg-[#1F1F23] border-l-2 border-[#9146FF]'
                        : 'hover:bg-[#1F1F23] border-l-2 border-transparent'
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center font-display font-bold text-[11px] shrink-0 border ${
                        isActive
                          ? 'bg-[#9146FF] text-white border-[#BF94FF]/50'
                          : 'bg-[#26262C] text-[#EFEFF1] border-white/10'
                      }`}
                    >
                      {getMonogramInitials(room.name || room.id)}
                    </div>
                    {!collapsed && (
                      <>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold text-[#EFEFF1] truncate leading-tight">
                            {room.name || `Sala ${room.id.toUpperCase()}`}
                          </div>
                          <div className="text-[11px] font-mono text-[#ADADB8] truncate leading-tight mt-0.5">
                            #{room.id.toUpperCase()}
                          </div>
                        </div>
                        {isActive && (
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#BF94FF] shrink-0">
                            Activa
                          </span>
                        )}
                      </>
                    )}
                  </button>
                );
              })}

              {favoriteChannels.slice(0, 4).map((fav) => (
                <button
                  key={fav.id}
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    onSelectFavoriteChannel(fav);
                  }}
                  title={fav.name}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2 text-left cursor-pointer hover:bg-[#1F1F23] border-l-2 border-transparent transition-colors ${
                    collapsed ? 'justify-center' : ''
                  }`}
                >
                  <div className="w-8 h-8 rounded-lg bg-[#26262C] border border-white/10 flex items-center justify-center text-[#BF94FF] shrink-0">
                    <Play className="w-3.5 h-3.5 fill-current" />
                  </div>
                  {!collapsed && (
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-[#EFEFF1] truncate leading-tight">
                        {fav.name}
                      </div>
                      <div className="text-[11px] text-[#ADADB8] truncate leading-tight mt-0.5">
                        {fav.category || 'Canal Favorito'}
                      </div>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* 3. Directorio */}
        <section className="space-y-1 pt-2 border-t border-white/[0.06]">
          {!collapsed && (
            <div className="px-3 pb-1">
              <h2 className="text-[11px] font-bold uppercase tracking-wider text-[#ADADB8]">
                {lang === 'ca' ? 'Directori' : lang === 'en' ? 'Directory' : 'Directorio'}
              </h2>
            </div>
          )}
          <div className="space-y-0.5">
            {directoryItems.map((item) => {
              const Icon = item.icon;
              const isActive = catalogSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    onChangeCatalogSection(item.id);
                  }}
                  title={item.label}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-left cursor-pointer transition-colors ${
                    collapsed ? 'justify-center px-0' : ''
                  } ${
                    isActive
                      ? 'bg-[#1F1F23] text-[#BF94FF] border-l-2 border-[#9146FF]'
                      : 'text-[#ADADB8] hover:text-white hover:bg-[#1F1F23] border-l-2 border-transparent'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {!collapsed && (
                    <span className="text-xs font-semibold truncate">{item.label}</span>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      </div>

      {/* Bottom Smart TV Quick Action */}
      <div className="p-2 border-t border-white/[0.06] shrink-0">
        <button
          type="button"
          onClick={() => {
            triggerHaptic('light');
            onOpenTvModal();
          }}
          title="Google TV & Smart TV (/tv)"
          className={`w-full min-h-9 px-2.5 rounded-lg bg-[#26262C] hover:bg-[#9146FF]/20 border border-white/[0.08] hover:border-[#9146FF]/50 text-xs font-semibold text-[#EFEFF1] flex items-center gap-2 cursor-pointer transition-colors ${
            collapsed ? 'justify-center px-0' : ''
          }`}
        >
          <Tv className="w-4 h-4 text-[#BF94FF] shrink-0" />
          {!collapsed && <span className="truncate">Google TV · /tv</span>}
        </button>
      </div>
    </aside>
  );
};
