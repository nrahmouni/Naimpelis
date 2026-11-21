import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Disc3,
  Heart,
  Home,
  Library,
  ListMusic,
  ListPlus,
  Music2,
  Pause,
  Play,
  Plus,
  Radio,
  Search,
  Shuffle,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import type { AppLanguage } from '../../types';
import type {
  MusicAlbumRef,
  MusicArtistRef,
  MusicGenre,
  MusicPlaylist,
  MusicRadioStation,
  MusicTrack,
} from '../../types/music';
import { useMusicStore } from '../../store/useMusicStore';
import { triggerHaptic } from '../../utils/haptics';
import { useBackInterceptor } from '../../lib/backInterceptor';
import { MusicAudioEngine } from './MusicAudioEngine';
import { SpotifyPlayerBar, formatMusicTime } from './SpotifyPlayerBar';
import { EqAndTimerModal, FullScreenNowPlayingModal } from './FullScreenNowPlayingModal';
import mixHeroCover from '../../assets/images/riffan_music_bento_1795218458890.jpg';
import mixUrbanoCover from '../../assets/images/riffan_mix_urbano_1795218458959.jpg';
import mixElectronicCover from '../../assets/images/riffan_mix_electronic_1795218458940.jpg';

interface RiffanMusicWorldViewProps {
  lang: AppLanguage;
  externalSearchQuery?: string;
}

interface MusicHomeData {
  topTracks: MusicTrack[];
  spainHits: MusicTrack[];
  urbanoMix: MusicTrack[];
  popMix: MusicTrack[];
  electronicMix: MusicTrack[];
  topAlbums: MusicAlbumRef[];
  topArtists: MusicArtistRef[];
  editorialPlaylists: MusicPlaylist[];
  genres: MusicGenre[];
  radios: MusicRadioStation[];
}

type MusicNavTab = 'home' | 'search' | 'library' | 'radios';

type MusicDetailView =
  | { kind: 'album'; id: string; album?: MusicAlbumRef; tracks: MusicTrack[]; loading: boolean }
  | {
      kind: 'artist';
      id: string;
      artist?: MusicArtistRef;
      topTracks: MusicTrack[];
      albums: MusicAlbumRef[];
      related: MusicArtistRef[];
      loading: boolean;
    }
  | { kind: 'playlist'; id: string; playlist?: MusicPlaylist; tracks: MusicTrack[]; loading: boolean }
  | { kind: 'genre'; genre: MusicGenre; artists: MusicArtistRef[]; tracks: MusicTrack[]; loading: boolean }
  | { kind: 'liked' }
  | { kind: 'curated'; title: string; subtitle: string; cover: string; tracks: MusicTrack[] }
  | { kind: 'user_playlist'; playlistId: string };

function getTimeGreeting(): string {
  const hr = new Date().getHours();
  if (hr < 12) return 'Buenos días';
  if (hr < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

const TrackRow: React.FC<{
  track: MusicTrack;
  index: number;
  isActive: boolean;
  isPlaying: boolean;
  isLiked: boolean;
  onPlay: () => void;
  onToggleLike: () => void;
  onAddToQueue: () => void;
  onOpenPlaylistPicker: () => void;
  onOpenArtist?: (artistId: string) => void;
  onOpenAlbum?: (albumId: string) => void;
  extraRightAction?: React.ReactNode;
}> = ({
  track,
  index,
  isActive,
  isPlaying,
  isLiked,
  onPlay,
  onToggleLike,
  onAddToQueue,
  onOpenPlaylistPicker,
  onOpenArtist,
  onOpenAlbum,
  extraRightAction,
}) => (
  <div
    className={`group flex items-center gap-3 px-2.5 sm:px-3.5 py-2 rounded-xl transition-colors ${
      isActive ? 'bg-white/[0.09]' : 'hover:bg-white/[0.05]'
    }`}
  >
    {/* Track # or Play indicator */}
    <button
      type="button"
      onClick={onPlay}
      aria-label={`Reproducir ${track.title}`}
      className="w-7 h-9 flex items-center justify-center shrink-0 cursor-pointer text-xs font-semibold tabular-nums text-zinc-400 group-hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1DB954] rounded-lg"
    >
      {isActive && isPlaying ? (
        <span className="flex items-end gap-[2px] h-3.5">
          <span className="w-[3px] bg-[#1DB954] rounded-full animate-pulse h-full" />
          <span className="w-[3px] bg-[#1DB954] rounded-full animate-pulse h-2/3" />
          <span className="w-[3px] bg-[#1DB954] rounded-full animate-pulse h-4/5" />
        </span>
      ) : (
        <>
          <span className={`group-hover:hidden ${isActive ? 'text-[#1DB954]' : ''}`}>
            {index + 1}
          </span>
          <Play className="w-3.5 h-3.5 fill-current hidden group-hover:block text-white" />
        </>
      )}
    </button>

    {/* Cover + Title + Artist */}
    <button
      type="button"
      onClick={onPlay}
      className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer"
    >
      <div className="w-11 h-11 rounded-lg overflow-hidden bg-[#181B22] border border-white/10 shrink-0 flex items-center justify-center">
        {track.album.cover ? (
          <img
            src={track.album.cover}
            alt={track.title}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
            className="w-full h-full object-cover"
          />
        ) : (
          <Music2 className="w-4 h-4 text-zinc-500" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={`text-sm font-semibold truncate leading-snug ${
            isActive ? 'text-[#1DB954]' : 'text-white'
          }`}
        >
          {track.title}
        </p>
        <div className="flex items-center gap-1.5 text-xs text-zinc-400 truncate mt-0.5">
          {track.explicit && (
            <span className="px-1 rounded bg-zinc-700/80 text-zinc-200 text-[9px] font-bold leading-tight">
              E
            </span>
          )}
          <span
            onClick={(e) => {
              if (onOpenArtist && track.artist.id && !track.artist.id.startsWith('au-')) {
                e.stopPropagation();
                onOpenArtist(track.artist.id);
              }
            }}
            className={onOpenArtist && track.artist.id && !track.artist.id.startsWith('au-') ? 'hover:underline hover:text-white truncate' : 'truncate'}
          >
            {track.artist.name}
          </span>
        </div>
      </div>
    </button>

    {/* Album column desktop */}
    {track.album.title && (
      <button
        type="button"
        onClick={() => {
          if (onOpenAlbum && track.album.id && !track.album.id.startsWith('au-')) {
            onOpenAlbum(track.album.id);
          } else {
            onPlay();
          }
        }}
        className="hidden md:block w-[24%] text-left text-xs text-zinc-400 hover:text-white hover:underline truncate cursor-pointer"
      >
        {track.album.title}
      </button>
    )}

    {/* Quick actions + Duration */}
    <div className="flex items-center gap-1 shrink-0">
      <button
        type="button"
        onClick={onToggleLike}
        aria-label={isLiked ? 'Quitar de favoritos' : 'Guardar en Tus Me Gusta'}
        className={`w-9 h-9 rounded-full flex items-center justify-center cursor-pointer transition-all ${
          isLiked
            ? 'text-[#1DB954]'
            : 'text-zinc-400 opacity-80 sm:opacity-0 sm:group-hover:opacity-100 hover:text-white'
        }`}
      >
        <Heart className={`w-4 h-4 ${isLiked ? 'fill-current' : ''}`} />
      </button>

      <button
        type="button"
        onClick={onAddToQueue}
        title="Añadir a la cola"
        className="hidden sm:flex w-9 h-9 rounded-full items-center justify-center text-zinc-400 opacity-0 group-hover:opacity-100 hover:text-white cursor-pointer transition-opacity"
      >
        <ListPlus className="w-4 h-4" />
      </button>

      <button
        type="button"
        onClick={onOpenPlaylistPicker}
        title="Añadir a playlist"
        className="w-9 h-9 rounded-full flex items-center justify-center text-zinc-400 sm:opacity-0 sm:group-hover:opacity-100 hover:text-white cursor-pointer transition-opacity"
      >
        <Plus className="w-4 h-4" />
      </button>

      {extraRightAction}

      <span className="w-10 text-right text-xs text-zinc-400 tabular-nums">
        {formatMusicTime(track.durationSec)}
      </span>
    </div>
  </div>
);

export const RiffanMusicWorldView: React.FC<RiffanMusicWorldViewProps> = ({
  externalSearchQuery = '',
}) => {
  const [navTab, setNavTab] = useState<MusicNavTab>('home');
  const [detail, setDetail] = useState<MusicDetailView | null>(null);
  const [homeData, setHomeData] = useState<MusicHomeData | null>(null);
  const [homeLoading, setHomeLoading] = useState<boolean>(true);

  const [localSearchQuery, setLocalSearchQuery] = useState<string>(externalSearchQuery);
  const [searchResults, setSearchResults] = useState<{
    tracks: MusicTrack[];
    albums: MusicAlbumRef[];
    artists: MusicArtistRef[];
    playlists: MusicPlaylist[];
    radios: MusicRadioStation[];
  } | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);

  const [playlistPickerTrack, setPlaylistPickerTrack] = useState<MusicTrack | null>(null);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [showCreatePlaylist, setShowCreatePlaylist] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const currentTrack = useMusicStore((s) => s.currentTrack);
  const activeRadio = useMusicStore((s) => s.activeRadio);
  const resolvedPlayback = useMusicStore((s) => s.resolvedPlayback);
  const isPlaying = useMusicStore((s) => s.isPlaying);
  const queue = useMusicStore((s) => s.queue);
  const queueIndex = useMusicStore((s) => s.queueIndex);
  const likedTracks = useMusicStore((s) => s.likedTracks);
  const savedAlbums = useMusicStore((s) => s.savedAlbums);
  const savedPlaylists = useMusicStore((s) => s.savedPlaylists);
  const userPlaylists = useMusicStore((s) => s.userPlaylists);
  const recentTracks = useMusicStore((s) => s.recentTracks);
  const viewMode = useMusicStore((s) => s.viewMode);
  const showNowPlayingModal = useMusicStore((s) => s.showNowPlayingModal);
  const nowPlayingTab = useMusicStore((s) => s.nowPlayingTab);
  const showQueueDrawer = useMusicStore((s) => s.showQueueDrawer);

  const playTrack = useMusicStore((s) => s.playTrack);
  const playRadio = useMusicStore((s) => s.playRadio);
  const togglePlayPause = useMusicStore((s) => s.togglePlayPause);
  const addToQueue = useMusicStore((s) => s.addToQueue);
  const removeFromQueue = useMusicStore((s) => s.removeFromQueue);
  const toggleLikeTrack = useMusicStore((s) => s.toggleLikeTrack);
  const toggleSaveAlbum = useMusicStore((s) => s.toggleSaveAlbum);
  const toggleSavePlaylist = useMusicStore((s) => s.toggleSavePlaylist);
  const createUserPlaylist = useMusicStore((s) => s.createUserPlaylist);
  const deleteUserPlaylist = useMusicStore((s) => s.deleteUserPlaylist);
  const addTrackToUserPlaylist = useMusicStore((s) => s.addTrackToUserPlaylist);
  const removeTrackFromUserPlaylist = useMusicStore((s) => s.removeTrackFromUserPlaylist);
  const setShowQueueDrawer = useMusicStore((s) => s.setShowQueueDrawer);

  const toastTimerRef = useRef<number | null>(null);
  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToastMsg(null), 2400);
  }, []);

  useBackInterceptor(Boolean(detail), 'music-detail-view', () => setDetail(null), { priority: 8 });
  useBackInterceptor(showQueueDrawer, 'music-queue-drawer', () => setShowQueueDrawer(false), { priority: 18 });
  useBackInterceptor(Boolean(playlistPickerTrack), 'music-pl-picker', () => setPlaylistPickerTrack(null), { priority: 22 });

  // Sync top WorldShell search query into Riffan Music search
  useEffect(() => {
    if (externalSearchQuery.trim()) {
      setLocalSearchQuery(externalSearchQuery);
      setNavTab('search');
      setDetail(null);
    }
  }, [externalSearchQuery]);

  // Initial load of Home data
  useEffect(() => {
    let cancelled = false;
    setHomeLoading(true);
    fetch('/api/music/home')
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data?.success) {
          setHomeData({
            topTracks: data.topTracks || [],
            spainHits: data.spainHits || [],
            urbanoMix: data.urbanoMix || [],
            popMix: data.popMix || [],
            electronicMix: data.electronicMix || [],
            topAlbums: data.topAlbums || [],
            topArtists: data.topArtists || [],
            editorialPlaylists: data.editorialPlaylists || [],
            genres: data.genres || [],
            radios: data.radios || [],
          });
        }
        setHomeLoading(false);
      })
      .catch(() => {
        if (!cancelled) setHomeLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Debounced multi-entity search
  useEffect(() => {
    const clean = localSearchQuery.trim();
    if (!clean) {
      setSearchResults(null);
      setSearchLoading(false);
      return;
    }
    let cancelled = false;
    setSearchLoading(true);
    const t = window.setTimeout(() => {
      fetch(`/api/music/search?q=${encodeURIComponent(clean)}`)
        .then((r) => r.json())
        .then((data) => {
          if (cancelled) return;
          if (data?.success) {
            setSearchResults({
              tracks: data.tracks || [],
              albums: data.albums || [],
              artists: data.artists || [],
              playlists: data.playlists || [],
              radios: data.radios || [],
            });
          }
          setSearchLoading(false);
        })
        .catch(() => {
          if (!cancelled) setSearchLoading(false);
        });
    }, 260);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [localSearchQuery]);

  const openAlbumDetail = useCallback(async (albumId: string, previewAlbum?: MusicAlbumRef) => {
    triggerHaptic('light');
    setDetail({ kind: 'album', id: albumId, album: previewAlbum, tracks: [], loading: true });
    try {
      const res = await fetch(`/api/music/album/${encodeURIComponent(albumId)}`);
      const data = await res.json();
      if (data?.success) {
        setDetail({
          kind: 'album',
          id: albumId,
          album: data.album,
          tracks: data.tracks || [],
          loading: false,
        });
      }
    } catch {
      setDetail((prev) => (prev?.kind === 'album' ? { ...prev, loading: false } : prev));
    }
  }, []);

  const openArtistDetail = useCallback(async (artistId: string, previewArtist?: MusicArtistRef) => {
    triggerHaptic('light');
    setDetail({
      kind: 'artist',
      id: artistId,
      artist: previewArtist,
      topTracks: [],
      albums: [],
      related: [],
      loading: true,
    });
    try {
      const res = await fetch(`/api/music/artist/${encodeURIComponent(artistId)}`);
      const data = await res.json();
      if (data?.success) {
        setDetail({
          kind: 'artist',
          id: artistId,
          artist: data.artist,
          topTracks: data.topTracks || [],
          albums: data.albums || [],
          related: data.related || [],
          loading: false,
        });
      }
    } catch {
      setDetail((prev) => (prev?.kind === 'artist' ? { ...prev, loading: false } : prev));
    }
  }, []);

  const openPlaylistDetail = useCallback(async (playlistId: string, previewPlaylist?: MusicPlaylist) => {
    triggerHaptic('light');
    setDetail({ kind: 'playlist', id: playlistId, playlist: previewPlaylist, tracks: [], loading: true });
    try {
      const res = await fetch(`/api/music/playlist/${encodeURIComponent(playlistId)}`);
      const data = await res.json();
      if (data?.success) {
        setDetail({
          kind: 'playlist',
          id: playlistId,
          playlist: data.playlist,
          tracks: data.tracks || [],
          loading: false,
        });
      }
    } catch {
      setDetail((prev) => (prev?.kind === 'playlist' ? { ...prev, loading: false } : prev));
    }
  }, []);

  const openGenreDetail = useCallback(async (genre: MusicGenre) => {
    triggerHaptic('light');
    setDetail({ kind: 'genre', genre, artists: [], tracks: [], loading: true });
    try {
      const res = await fetch(
        `/api/music/genre/${encodeURIComponent(genre.id)}?name=${encodeURIComponent(genre.name)}`
      );
      const data = await res.json();
      if (data?.success) {
        setDetail({
          kind: 'genre',
          genre,
          artists: data.artists || [],
          tracks: data.tracks || [],
          loading: false,
        });
      }
    } catch {
      setDetail((prev) => (prev?.kind === 'genre' ? { ...prev, loading: false } : prev));
    }
  }, []);

  const hasBottomBar = Boolean(currentTrack || activeRadio);
  const greeting = useMemo(() => getTimeGreeting(), []);

  const likedIdSet = useMemo(() => new Set(likedTracks.map((t) => t.id)), [likedTracks]);

  const showYtStage =
    Boolean(showNowPlayingModal && nowPlayingTab === 'video' && (resolvedPlayback?.youtubeMvId || resolvedPlayback?.youtubeVideoId));

  const renderQuickMixes = () => {
    if (!homeData) return null;
    const cards = [
      {
        id: 'liked',
        title: 'Tus Me Gusta',
        cover: mixHeroCover,
        count: `${likedTracks.length} canciones`,
        onClick: () => setDetail({ kind: 'liked' }),
      },
      {
        id: 'spain',
        title: 'Top España & Viral',
        cover: homeData.spainHits[0]?.album.cover || mixUrbanoCover,
        count: `${homeData.spainHits.length} éxitos`,
        onClick: () =>
          setDetail({
            kind: 'curated',
            title: 'Top España & Tendencias',
            subtitle: 'Lo más escuchado en España hoy',
            cover: homeData.spainHits[0]?.album.coverXl || mixUrbanoCover,
            tracks: homeData.spainHits,
          }),
      },
      {
        id: 'global',
        title: 'Top 50 Mundial',
        cover: homeData.topTracks[0]?.album.cover || mixHeroCover,
        count: `${homeData.topTracks.length} temas`,
        onClick: () =>
          setDetail({
            kind: 'curated',
            title: 'Top 50 Mundial',
            subtitle: 'Rankings globales en directo',
            cover: homeData.topTracks[0]?.album.coverXl || mixHeroCover,
            tracks: homeData.topTracks,
          }),
      },
      {
        id: 'urbano',
        title: 'Mix Urbano & Reggaeton',
        cover: mixUrbanoCover,
        count: `${homeData.urbanoMix.length} temas`,
        onClick: () =>
          setDetail({
            kind: 'curated',
            title: 'Mix Urbano & Reggaeton',
            subtitle: 'Perreo, trap y éxitos latinos sin pausa',
            cover: mixUrbanoCover,
            tracks: homeData.urbanoMix,
          }),
      },
      {
        id: 'electronic',
        title: 'Electrónica & Club',
        cover: mixElectronicCover,
        count: `${homeData.electronicMix.length} temas`,
        onClick: () =>
          setDetail({
            kind: 'curated',
            title: 'Electrónica & Club',
            subtitle: 'House, techno y sesiones de festival',
            cover: mixElectronicCover,
            tracks: homeData.electronicMix,
          }),
      },
      {
        id: 'radios',
        title: 'Radios Musicales 24/7',
        cover: mixHeroCover,
        count: `${homeData.radios.length} emisoras`,
        onClick: () => {
          setDetail(null);
          setNavTab('radios');
        },
      },
    ];

    return (
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
        {cards.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={c.onClick}
            className="group flex items-center gap-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.06] overflow-hidden text-left cursor-pointer transition-all pr-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1DB954]"
          >
            <img
              src={c.cover}
              alt={c.title}
              referrerPolicy="no-referrer"
              className="w-14 h-14 sm:w-16 sm:h-16 object-cover shrink-0 bg-[#14171E]"
            />
            <div className="min-w-0 flex-1 py-1">
              <p className="text-xs sm:text-sm font-bold text-white truncate">{c.title}</p>
              <p className="text-[11px] text-zinc-400 truncate mt-0.5 tabular-nums">{c.count}</p>
            </div>
            <span className="hidden sm:flex w-9 h-9 rounded-full bg-[#1DB954] text-[#08090C] items-center justify-center opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100 transition-all shadow-lg shrink-0">
              <Play className="w-4 h-4 fill-current ml-0.5" />
            </span>
          </button>
        ))}
      </div>
    );
  };

  const renderTrackCardsCarousel = (title: string, tracks: MusicTrack[], viewAllTitle?: string) => {
    if (!tracks || tracks.length === 0) return null;
    return (
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-lg sm:text-xl font-bold text-white tracking-tight">
            {title}
          </h2>
          {viewAllTitle && (
            <button
              type="button"
              onClick={() =>
                setDetail({
                  kind: 'curated',
                  title: viewAllTitle,
                  subtitle: `${tracks.length} canciones seleccionadas`,
                  cover: tracks[0]?.album.coverXl || tracks[0]?.album.cover || mixHeroCover,
                  tracks,
                })
              }
              className="text-xs font-semibold text-zinc-400 hover:text-white cursor-pointer whitespace-nowrap"
            >
              Ver todo
            </button>
          )}
        </div>
        <div className="flex gap-3 sm:gap-4 overflow-x-auto pb-2 snap-x">
          {tracks.slice(0, 14).map((t) => {
            const active = currentTrack?.id === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  playTrack(t, tracks);
                }}
                className="group shrink-0 w-[142px] sm:w-[168px] p-2.5 rounded-2xl bg-[#121318] hover:bg-[#1B1D24] border border-white/[0.05] text-left cursor-pointer transition-colors snap-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1DB954]"
              >
                <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-[#181B22] mb-2.5">
                  {t.album.cover ? (
                    <img
                      src={t.album.cover}
                      alt={t.title}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : null}
                  <span
                    className={`absolute right-2 bottom-2 w-10 h-10 rounded-full bg-[#1DB954] text-[#08090C] flex items-center justify-center shadow-[0_8px_20px_rgba(0,0,0,0.6)] transition-all ${
                      active
                        ? 'opacity-100 translate-y-0'
                        : 'opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0'
                    }`}
                  >
                    {active && isPlaying ? (
                      <Pause className="w-4 h-4 fill-current" />
                    ) : (
                      <Play className="w-4 h-4 fill-current ml-0.5" />
                    )}
                  </span>
                </div>
                <p className={`text-sm font-bold truncate ${active ? 'text-[#1DB954]' : 'text-white'}`}>
                  {t.title}
                </p>
                <p className="text-xs text-zinc-400 truncate mt-0.5">{t.artist.name}</p>
              </button>
            );
          })}
        </div>
      </section>
    );
  };

  const renderArtistsCarousel = (title: string, artists: MusicArtistRef[]) => {
    if (!artists || artists.length === 0) return null;
    return (
      <section className="space-y-3">
        <h2 className="font-display text-lg sm:text-xl font-bold text-white tracking-tight">{title}</h2>
        <div className="flex gap-3 sm:gap-4 overflow-x-auto pb-2 snap-x">
          {artists.slice(0, 14).map((art) => (
            <button
              key={art.id}
              type="button"
              onClick={() => openArtistDetail(art.id, art)}
              className="group shrink-0 w-[132px] sm:w-[154px] p-2.5 rounded-2xl bg-[#121318] hover:bg-[#1B1D24] border border-white/[0.05] text-center cursor-pointer transition-colors snap-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1DB954]"
            >
              <div className="aspect-square w-full rounded-full overflow-hidden bg-[#181B22] border border-white/10 mb-2.5 shadow-lg">
                {art.picture ? (
                  <img
                    src={art.picture}
                    alt={art.name}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : null}
              </div>
              <p className="text-sm font-bold text-white truncate">{art.name}</p>
              <p className="text-[11px] text-zinc-400 mt-0.5">Artista</p>
            </button>
          ))}
        </div>
      </section>
    );
  };

  const renderAlbumsCarousel = (title: string, albums: MusicAlbumRef[]) => {
    if (!albums || albums.length === 0) return null;
    return (
      <section className="space-y-3">
        <h2 className="font-display text-lg sm:text-xl font-bold text-white tracking-tight">{title}</h2>
        <div className="flex gap-3 sm:gap-4 overflow-x-auto pb-2 snap-x">
          {albums.slice(0, 14).map((alb) => (
            <button
              key={alb.id}
              type="button"
              onClick={() => openAlbumDetail(alb.id, alb)}
              className="group shrink-0 w-[142px] sm:w-[168px] p-2.5 rounded-2xl bg-[#121318] hover:bg-[#1B1D24] border border-white/[0.05] text-left cursor-pointer transition-colors snap-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1DB954]"
            >
              <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-[#181B22] mb-2.5">
                {alb.cover ? (
                  <img
                    src={alb.cover}
                    alt={alb.title}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : null}
                <span className="absolute right-2 bottom-2 w-10 h-10 rounded-full bg-[#1DB954] text-[#08090C] flex items-center justify-center shadow-lg opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all">
                  <Play className="w-4 h-4 fill-current ml-0.5" />
                </span>
              </div>
              <p className="text-sm font-bold text-white truncate">{alb.title}</p>
              <p className="text-xs text-zinc-400 truncate mt-0.5">
                {alb.artist?.name || (alb.releaseDate ? alb.releaseDate.slice(0, 4) : 'Álbum')}
              </p>
            </button>
          ))}
        </div>
      </section>
    );
  };

  const renderPlaylistsCarousel = (title: string, playlists: MusicPlaylist[]) => {
    if (!playlists || playlists.length === 0) return null;
    return (
      <section className="space-y-3">
        <h2 className="font-display text-lg sm:text-xl font-bold text-white tracking-tight">{title}</h2>
        <div className="flex gap-3 sm:gap-4 overflow-x-auto pb-2 snap-x">
          {playlists.slice(0, 14).map((pl) => (
            <button
              key={pl.id}
              type="button"
              onClick={() => openPlaylistDetail(pl.id, pl)}
              className="group shrink-0 w-[142px] sm:w-[168px] p-2.5 rounded-2xl bg-[#121318] hover:bg-[#1B1D24] border border-white/[0.05] text-left cursor-pointer transition-colors snap-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1DB954]"
            >
              <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-[#181B22] mb-2.5">
                {pl.cover ? (
                  <img
                    src={pl.cover}
                    alt={pl.title}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : null}
                <span className="absolute right-2 bottom-2 w-10 h-10 rounded-full bg-[#1DB954] text-[#08090C] flex items-center justify-center shadow-lg opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all">
                  <Play className="w-4 h-4 fill-current ml-0.5" />
                </span>
              </div>
              <p className="text-sm font-bold text-white truncate">{pl.title}</p>
              <p className="text-xs text-zinc-400 truncate mt-0.5">{pl.creator || 'Editorial'}</p>
            </button>
          ))}
        </div>
      </section>
    );
  };

  const renderTrackList = (tracks: MusicTrack[], userPlId?: string) => (
    <div className="space-y-1">
      {tracks.map((track, idx) => (
        <TrackRow
          key={`${track.id}-${idx}`}
          track={track}
          index={idx}
          isActive={currentTrack?.id === track.id}
          isPlaying={isPlaying}
          isLiked={likedIdSet.has(track.id)}
          onPlay={() => {
            triggerHaptic('light');
            playTrack(track, tracks);
          }}
          onToggleLike={() => {
            triggerHaptic('light');
            toggleLikeTrack(track);
          }}
          onAddToQueue={() => {
            addToQueue(track);
            showToast(`Añadida a la cola: ${track.title}`);
          }}
          onOpenPlaylistPicker={() => setPlaylistPickerTrack(track)}
          onOpenArtist={(aid) => openArtistDetail(aid)}
          onOpenAlbum={(albid) => openAlbumDetail(albid)}
          extraRightAction={
            userPlId ? (
              <button
                type="button"
                onClick={() => removeTrackFromUserPlaylist(userPlId, track.id)}
                title="Quitar de la playlist"
                className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-500 hover:text-red-400 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            ) : undefined
          }
        />
      ))}
    </div>
  );

  const renderDetailView = () => {
    if (!detail) return null;

    if (detail.kind === 'liked') {
      return (
        <div className="space-y-6 animate-fade-in">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDetail(null)}
              className="min-h-10 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-semibold text-zinc-200 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" /> Volver
            </button>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-end gap-5 p-5 sm:p-7 rounded-3xl bg-gradient-to-br from-[#1DB954]/25 via-[#121318] to-[#0A0B0E] border border-white/10">
            <div className="w-36 h-36 sm:w-44 sm:h-44 rounded-2xl bg-gradient-to-br from-[#1DB954] to-[#064E3B] flex items-center justify-center shadow-2xl shrink-0">
              <Heart className="w-16 h-16 text-white fill-current" />
            </div>
            <div className="space-y-2 min-w-0">
              <p className="text-xs font-bold uppercase tracking-wider text-[#1DB954]">Playlist</p>
              <h1 className="font-display text-3xl sm:text-5xl font-black text-white tracking-tight">
                Tus Me Gusta
              </h1>
              <p className="text-sm text-zinc-300 tabular-nums">
                {likedTracks.length} {likedTracks.length === 1 ? 'canción' : 'canciones'} guardadas
              </p>
              {likedTracks.length > 0 && (
                <div className="pt-2 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => playTrack(likedTracks[0], likedTracks)}
                    className="h-12 px-6 rounded-full bg-[#1DB954] hover:scale-105 text-[#08090C] font-bold text-sm inline-flex items-center gap-2 cursor-pointer shadow-lg transition-transform"
                  >
                    <Play className="w-4 h-4 fill-current" /> Reproducir todo
                  </button>
                </div>
              )}
            </div>
          </div>

          {likedTracks.length === 0 ? (
            <div className="py-16 text-center rounded-3xl bg-[#121318] border border-white/[0.06]">
              <Heart className="w-10 h-10 text-zinc-600 mx-auto mb-2" />
              <p className="text-base font-bold text-white">Aún no tienes canciones favoritas</p>
              <p className="text-xs text-zinc-400 mt-1">
                Toca el corazón en cualquier canción para guardarla aquí.
              </p>
            </div>
          ) : (
            renderTrackList(likedTracks)
          )}
        </div>
      );
    }

    if (detail.kind === 'user_playlist') {
      const pl = userPlaylists.find((p) => p.id === detail.playlistId);
      if (!pl) return null;
      return (
        <div className="space-y-6 animate-fade-in">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setDetail(null)}
              className="min-h-10 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-semibold text-zinc-200 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" /> Volver
            </button>
            <button
              type="button"
              onClick={() => {
                deleteUserPlaylist(pl.id);
                setDetail(null);
                showToast('Playlist eliminada');
              }}
              className="min-h-10 px-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-xs font-semibold text-red-400 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" /> Eliminar playlist
            </button>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-end gap-5 p-5 sm:p-7 rounded-3xl bg-gradient-to-br from-[#1DB954]/20 via-[#121318] to-[#0A0B0E] border border-white/10">
            <img
              src={pl.tracks[0]?.album.coverXl || pl.tracks[0]?.album.cover || mixHeroCover}
              alt={pl.name}
              referrerPolicy="no-referrer"
              className="w-36 h-36 sm:w-44 sm:h-44 rounded-2xl object-cover shadow-2xl shrink-0"
            />
            <div className="space-y-2 min-w-0">
              <p className="text-xs font-bold uppercase tracking-wider text-[#1DB954]">Tu Playlist</p>
              <h1 className="font-display text-3xl sm:text-5xl font-black text-white tracking-tight truncate">
                {pl.name}
              </h1>
              <p className="text-sm text-zinc-300 tabular-nums">{pl.tracks.length} canciones</p>
              {pl.tracks.length > 0 && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => playTrack(pl.tracks[0], pl.tracks)}
                    className="h-12 px-6 rounded-full bg-[#1DB954] hover:scale-105 text-[#08090C] font-bold text-sm inline-flex items-center gap-2 cursor-pointer shadow-lg"
                  >
                    <Play className="w-4 h-4 fill-current" /> Reproducir
                  </button>
                </div>
              )}
            </div>
          </div>

          {pl.tracks.length === 0 ? (
            <div className="py-16 text-center rounded-3xl bg-[#121318] border border-white/[0.06]">
              <p className="text-sm text-zinc-400">
                Esta playlist está vacía. Usa el botón + en cualquier tema para añadir canciones.
              </p>
            </div>
          ) : (
            renderTrackList(pl.tracks, pl.id)
          )}
        </div>
      );
    }

    if (detail.kind === 'curated') {
      return (
        <div className="space-y-6 animate-fade-in">
          <button
            type="button"
            onClick={() => setDetail(null)}
            className="min-h-10 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-semibold text-zinc-200 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" /> Volver
          </button>

          <div className="flex flex-col sm:flex-row sm:items-end gap-5 p-5 sm:p-7 rounded-3xl bg-gradient-to-br from-[#1DB954]/20 via-[#121318] to-[#0A0B0E] border border-white/10">
            <img
              src={detail.cover}
              alt={detail.title}
              referrerPolicy="no-referrer"
              className="w-36 h-36 sm:w-44 sm:h-44 rounded-2xl object-cover shadow-2xl shrink-0"
            />
            <div className="space-y-2 min-w-0">
              <p className="text-xs font-bold uppercase tracking-wider text-[#1DB954]">Selección Riffan</p>
              <h1 className="font-display text-3xl sm:text-4xl font-black text-white tracking-tight">
                {detail.title}
              </h1>
              <p className="text-sm text-zinc-300">{detail.subtitle}</p>
              {detail.tracks.length > 0 && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => playTrack(detail.tracks[0], detail.tracks)}
                    className="h-12 px-6 rounded-full bg-[#1DB954] hover:scale-105 text-[#08090C] font-bold text-sm inline-flex items-center gap-2 cursor-pointer shadow-lg"
                  >
                    <Play className="w-4 h-4 fill-current" /> Reproducir lista
                  </button>
                </div>
              )}
            </div>
          </div>

          {renderTrackList(detail.tracks)}
        </div>
      );
    }

    if (detail.kind === 'album') {
      const alb = detail.album;
      const isSaved = savedAlbums.some((a) => a.id === detail.id);
      return (
        <div className="space-y-6 animate-fade-in">
          <button
            type="button"
            onClick={() => setDetail(null)}
            className="min-h-10 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-semibold text-zinc-200 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" /> Volver
          </button>

          <div className="flex flex-col sm:flex-row sm:items-end gap-5 p-5 sm:p-7 rounded-3xl bg-gradient-to-br from-[#1DB954]/18 via-[#121318] to-[#0A0B0E] border border-white/10">
            <div className="w-40 h-40 sm:w-48 sm:h-48 rounded-2xl overflow-hidden bg-[#181B22] shadow-2xl shrink-0">
              {alb?.coverXl || alb?.cover ? (
                <img
                  src={alb.coverXl || alb.cover}
                  alt={alb.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : null}
            </div>
            <div className="space-y-2 min-w-0">
              <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">Álbum</p>
              <h1 className="font-display text-2xl sm:text-4xl font-black text-white tracking-tight">
                {alb?.title || 'Cargando álbum...'}
              </h1>
              <div className="flex flex-wrap items-center gap-1.5 text-sm text-zinc-300">
                {alb?.artist && (
                  <button
                    type="button"
                    onClick={() => openArtistDetail(alb.artist!.id, alb.artist)}
                    className="font-bold text-white hover:underline cursor-pointer"
                  >
                    {alb.artist.name}
                  </button>
                )}
                {alb?.releaseDate && <span>· {alb.releaseDate.slice(0, 4)}</span>}
                {detail.tracks.length > 0 && <span className="tabular-nums">· {detail.tracks.length} temas</span>}
              </div>

              <div className="pt-2 flex flex-wrap items-center gap-2.5">
                {detail.tracks.length > 0 && (
                  <button
                    type="button"
                    onClick={() => playTrack(detail.tracks[0], detail.tracks)}
                    className="h-12 px-6 rounded-full bg-[#1DB954] hover:scale-105 text-[#08090C] font-bold text-sm inline-flex items-center gap-2 cursor-pointer shadow-lg"
                  >
                    <Play className="w-4 h-4 fill-current" /> Reproducir
                  </button>
                )}
                {alb && (
                  <button
                    type="button"
                    onClick={() => {
                      toggleSaveAlbum(alb);
                      showToast(isSaved ? 'Álbum eliminado de tu biblioteca' : 'Álbum guardado');
                    }}
                    className={`h-12 px-5 rounded-full border text-sm font-semibold cursor-pointer transition-colors ${
                      isSaved
                        ? 'bg-white/15 border-[#1DB954] text-[#1DB954]'
                        : 'border-white/20 text-white hover:border-white'
                    }`}
                  >
                    {isSaved ? 'Guardado' : 'Guardar álbum'}
                  </button>
                )}
              </div>
            </div>
          </div>

          {detail.loading ? (
            <div className="py-12 text-center text-sm text-zinc-400">Cargando canciones del álbum...</div>
          ) : (
            renderTrackList(detail.tracks)
          )}
        </div>
      );
    }

    if (detail.kind === 'playlist') {
      const pl = detail.playlist;
      const isSaved = savedPlaylists.some((p) => p.id === detail.id);
      return (
        <div className="space-y-6 animate-fade-in">
          <button
            type="button"
            onClick={() => setDetail(null)}
            className="min-h-10 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-semibold text-zinc-200 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" /> Volver
          </button>

          <div className="flex flex-col sm:flex-row sm:items-end gap-5 p-5 sm:p-7 rounded-3xl bg-gradient-to-br from-[#1DB954]/18 via-[#121318] to-[#0A0B0E] border border-white/10">
            <div className="w-40 h-40 sm:w-48 sm:h-48 rounded-2xl overflow-hidden bg-[#181B22] shadow-2xl shrink-0">
              {pl?.cover ? (
                <img src={pl.cover} alt={pl.title} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
              ) : null}
            </div>
            <div className="space-y-2 min-w-0">
              <p className="text-xs font-bold uppercase tracking-wider text-[#1DB954]">Playlist</p>
              <h1 className="font-display text-2xl sm:text-4xl font-black text-white tracking-tight">
                {pl?.title || 'Cargando...'}
              </h1>
              {pl?.description && <p className="text-xs text-zinc-400 line-clamp-2">{pl.description}</p>}
              <p className="text-xs text-zinc-300 tabular-nums">
                {pl?.creator || 'Editorial'} · {detail.tracks.length} canciones
              </p>

              <div className="pt-2 flex flex-wrap items-center gap-2.5">
                {detail.tracks.length > 0 && (
                  <button
                    type="button"
                    onClick={() => playTrack(detail.tracks[0], detail.tracks)}
                    className="h-12 px-6 rounded-full bg-[#1DB954] hover:scale-105 text-[#08090C] font-bold text-sm inline-flex items-center gap-2 cursor-pointer shadow-lg"
                  >
                    <Play className="w-4 h-4 fill-current" /> Reproducir
                  </button>
                )}
                {pl && (
                  <button
                    type="button"
                    onClick={() => {
                      toggleSavePlaylist(pl);
                      showToast(isSaved ? 'Playlist eliminada' : 'Playlist guardada en Tu Biblioteca');
                    }}
                    className={`h-12 px-5 rounded-full border text-sm font-semibold cursor-pointer ${
                      isSaved
                        ? 'bg-white/15 border-[#1DB954] text-[#1DB954]'
                        : 'border-white/20 text-white hover:border-white'
                    }`}
                  >
                    {isSaved ? 'En tu biblioteca' : 'Guardar playlist'}
                  </button>
                )}
              </div>
            </div>
          </div>

          {detail.loading ? (
            <div className="py-12 text-center text-sm text-zinc-400">Cargando lista de canciones...</div>
          ) : (
            renderTrackList(detail.tracks)
          )}
        </div>
      );
    }

    if (detail.kind === 'genre') {
      return (
        <div className="space-y-6 animate-fade-in">
          <button
            type="button"
            onClick={() => setDetail(null)}
            className="min-h-10 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-semibold text-zinc-200 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" /> Explorar géneros
          </button>

          <div
            className="p-6 sm:p-8 rounded-3xl border border-white/10"
            style={{
              background: `linear-gradient(135deg, ${detail.genre.color}55 0%, #121318 75%)`,
            }}
          >
            <p className="text-xs font-bold uppercase tracking-wider text-white/80">Género Musical</p>
            <h1 className="font-display text-3xl sm:text-5xl font-black text-white mt-1">
              {detail.genre.name}
            </h1>
            {detail.tracks.length > 0 && (
              <button
                type="button"
                onClick={() => playTrack(detail.tracks[0], detail.tracks)}
                className="mt-4 h-11 px-6 rounded-full bg-[#1DB954] text-[#08090C] font-bold text-sm inline-flex items-center gap-2 cursor-pointer shadow-lg"
              >
                <Play className="w-4 h-4 fill-current" /> Reproducir radio de {detail.genre.name}
              </button>
            )}
          </div>

          {detail.loading ? (
            <div className="py-12 text-center text-sm text-zinc-400">Cargando música del género...</div>
          ) : (
            <>
              {renderArtistsCarousel(`Artistas de ${detail.genre.name}`, detail.artists)}
              <section className="space-y-3">
                <h2 className="font-display text-lg font-bold text-white">Éxitos de {detail.genre.name}</h2>
                {renderTrackList(detail.tracks)}
              </section>
            </>
          )}
        </div>
      );
    }

    // Artist detail page
    const art = detail.artist;
    return (
      <div className="space-y-7 animate-fade-in">
        <button
          type="button"
          onClick={() => setDetail(null)}
          className="min-h-10 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-semibold text-zinc-200 inline-flex items-center gap-1.5 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> Volver
        </button>

        <div className="flex flex-col sm:flex-row sm:items-end gap-5 p-5 sm:p-7 rounded-3xl bg-gradient-to-br from-[#1DB954]/20 via-[#121318] to-[#0A0B0E] border border-white/10">
          <div className="w-36 h-36 sm:w-44 sm:h-44 rounded-full overflow-hidden bg-[#181B22] border-2 border-white/15 shadow-2xl shrink-0">
            {art?.picture ? (
              <img src={art.picture} alt={art.name} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
            ) : null}
          </div>
          <div className="space-y-2 min-w-0">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1DB954]">
              <UserCheck className="w-4 h-4" /> Artista verificado
            </div>
            <h1 className="font-display text-3xl sm:text-5xl font-black text-white tracking-tight">
              {art?.name || 'Artista'}
            </h1>
            {typeof art?.nbFan === 'number' && art.nbFan > 0 && (
              <p className="text-xs sm:text-sm text-zinc-300 tabular-nums">
                {art.nbFan.toLocaleString('es-ES')} oyentes mensuales
              </p>
            )}
            {detail.topTracks.length > 0 && (
              <div className="pt-2 flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => playTrack(detail.topTracks[0], detail.topTracks)}
                  className="h-12 px-6 rounded-full bg-[#1DB954] hover:scale-105 text-[#08090C] font-bold text-sm inline-flex items-center gap-2 cursor-pointer shadow-lg"
                >
                  <Play className="w-4 h-4 fill-current" /> Reproducir
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const shuffled = [...detail.topTracks].sort(() => Math.random() - 0.5);
                    playTrack(shuffled[0], shuffled);
                  }}
                  className="h-12 px-5 rounded-full border border-white/20 hover:border-white text-white font-semibold text-sm inline-flex items-center gap-2 cursor-pointer"
                >
                  <Shuffle className="w-4 h-4" /> Aleatorio
                </button>
              </div>
            )}
          </div>
        </div>

        {detail.loading ? (
          <div className="py-12 text-center text-sm text-zinc-400">Cargando discografía y temas...</div>
        ) : (
          <>
            {detail.topTracks.length > 0 && (
              <section className="space-y-3">
                <h2 className="font-display text-lg font-bold text-white">Populares</h2>
                {renderTrackList(detail.topTracks)}
              </section>
            )}
            {renderAlbumsCarousel('Discografía y Lanzamientos', detail.albums)}
            {renderArtistsCarousel('Artistas relacionados', detail.related)}
          </>
        )}
      </div>
    );
  };

  return (
    <div
      className={`min-h-[75vh] w-full flex flex-col lg:flex-row gap-4 lg:gap-5 ${
        hasBottomBar ? 'pb-24 sm:pb-28' : 'pb-6'
      }`}
    >
      {/* Headless Multi-Source Audio + WebAudio EQ Engine */}
      <MusicAudioEngine ytVideoMountId="riffan-music-yt-player" />

      {/* Persistent YouTube Audio / Video Frame (never unmounts while playing) */}
      <div
        className={
          showYtStage
            ? 'fixed z-[55] left-1/2 -translate-x-1/2 top-20 sm:top-24 w-[92vw] max-w-3xl aspect-video rounded-3xl overflow-hidden border border-white/20 shadow-2xl bg-black'
            : 'fixed -top-[9999px] left-0 w-1 h-1 opacity-0 pointer-events-none overflow-hidden'
        }
      >
        <div id="riffan-music-yt-player" className="w-full h-full" />
      </div>

      {/* Desktop Spotify Sidebar */}
      <aside className="hidden lg:flex flex-col w-[264px] shrink-0 gap-3 self-start sticky top-20">
        <div className="rounded-3xl bg-[#101217] border border-white/[0.07] p-3 space-y-1">
          <div className="flex items-center gap-2.5 px-3 py-2 mb-1">
            <span className="w-8 h-8 rounded-full bg-[#1DB954] text-[#08090C] flex items-center justify-center shadow-[0_0_16px_rgba(29,185,84,0.4)]">
              <Disc3 className="w-5 h-5" />
            </span>
            <span className="font-display text-base font-black tracking-tight text-white">
              RIFFAN <span className="text-[#1DB954]">MUSIC</span>
            </span>
          </div>

          {[
            { id: 'home' as const, label: 'Inicio', icon: Home },
            { id: 'search' as const, label: 'Buscar', icon: Search },
            { id: 'library' as const, label: 'Tu Biblioteca', icon: Library },
            { id: 'radios' as const, label: 'Radios 24/7', icon: Radio },
          ].map((item) => {
            const Icon = item.icon;
            const active = navTab === item.id && !detail;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setDetail(null);
                  setNavTab(item.id);
                }}
                className={`w-full min-h-11 px-3.5 rounded-2xl flex items-center gap-3 text-sm font-bold cursor-pointer transition-colors ${
                  active
                    ? 'bg-white/[0.11] text-white'
                    : 'text-zinc-400 hover:text-white hover:bg-white/[0.05]'
                }`}
              >
                <Icon className={`w-5 h-5 ${active ? 'text-[#1DB954]' : ''}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Library Shortcuts */}
        <div className="rounded-3xl bg-[#101217] border border-white/[0.07] p-3 space-y-2.5 max-h-[54vh] overflow-y-auto">
          <div className="flex items-center justify-between px-2 pt-1">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
              Tu Biblioteca
            </span>
            <button
              type="button"
              onClick={() => setShowCreatePlaylist(true)}
              title="Crear playlist"
              className="w-8 h-8 rounded-full hover:bg-white/10 text-zinc-300 hover:text-white flex items-center justify-center cursor-pointer"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setDetail({ kind: 'liked' })}
            className="w-full p-2 rounded-2xl hover:bg-white/[0.06] flex items-center gap-3 text-left cursor-pointer"
          >
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#1DB954] to-[#064E3B] flex items-center justify-center shrink-0">
              <Heart className="w-5 h-5 text-white fill-current" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-white truncate">Tus Me Gusta</p>
              <p className="text-[11px] text-zinc-400 tabular-nums">{likedTracks.length} canciones</p>
            </div>
          </button>

          {userPlaylists.map((pl) => (
            <button
              key={pl.id}
              type="button"
              onClick={() => setDetail({ kind: 'user_playlist', playlistId: pl.id })}
              className="w-full p-2 rounded-2xl hover:bg-white/[0.06] flex items-center gap-3 text-left cursor-pointer"
            >
              <img
                src={pl.tracks[0]?.album.cover || mixHeroCover}
                alt={pl.name}
                referrerPolicy="no-referrer"
                className="w-11 h-11 rounded-xl object-cover shrink-0 bg-[#181B22]"
              />
              <div className="min-w-0">
                <p className="text-sm font-bold text-white truncate">{pl.name}</p>
                <p className="text-[11px] text-zinc-400 tabular-nums">
                  Playlist · {pl.tracks.length}
                </p>
              </div>
            </button>
          ))}

          {savedAlbums.map((alb) => (
            <button
              key={alb.id}
              type="button"
              onClick={() => openAlbumDetail(alb.id, alb)}
              className="w-full p-2 rounded-2xl hover:bg-white/[0.06] flex items-center gap-3 text-left cursor-pointer"
            >
              <img
                src={alb.cover}
                alt={alb.title}
                referrerPolicy="no-referrer"
                className="w-11 h-11 rounded-xl object-cover shrink-0"
              />
              <div className="min-w-0">
                <p className="text-sm font-bold text-white truncate">{alb.title}</p>
                <p className="text-[11px] text-zinc-400 truncate">Álbum · {alb.artist?.name}</p>
              </div>
            </button>
          ))}
        </div>
      </aside>

      {/* Main Spotify Stage */}
      <div className="flex-1 min-w-0 space-y-5">
        {/* Mobile Compact Nav Tabs */}
        <div className="flex lg:hidden items-center gap-2 overflow-x-auto pb-1">
          {[
            { id: 'home' as const, label: 'Inicio', icon: Home },
            { id: 'search' as const, label: 'Buscar', icon: Search },
            { id: 'library' as const, label: 'Biblioteca', icon: Library },
            { id: 'radios' as const, label: 'Radios 24/7', icon: Radio },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = navTab === tab.id && !detail;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setDetail(null);
                  setNavTab(tab.id);
                }}
                className={`min-h-11 px-4 rounded-full text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-[#1DB954] text-[#08090C]'
                    : 'bg-white/[0.07] text-zinc-200 hover:bg-white/[0.12]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Detail View or Active Tab */}
        {detail ? (
          renderDetailView()
        ) : navTab === 'home' ? (
          <div className="space-y-7 animate-fade-in">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h1 className="font-display text-2xl sm:text-3xl font-black text-white tracking-tight">
                  {greeting}
                </h1>
                <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
                  Toda la música del mundo, letras en vivo, videoclips y radios 24/7
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNavTab('search')}
                className="hidden sm:inline-flex h-10 px-4 rounded-full bg-white/[0.08] hover:bg-white/[0.14] text-xs font-semibold text-white items-center gap-2 cursor-pointer"
              >
                <Search className="w-3.5 h-3.5 text-[#1DB954]" /> Buscar canción o artista
              </button>
            </div>

            {homeLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-16 rounded-xl bg-white/[0.05] animate-pulse" />
                ))}
              </div>
            ) : homeData ? (
              <>
                {renderQuickMixes()}
                {renderTrackCardsCarousel('Éxitos en España y Virales', homeData.spainHits, 'Éxitos en España')}
                {renderArtistsCarousel('Artistas del Momento', homeData.topArtists)}
                {renderTrackCardsCarousel('Top 50 Mundial', homeData.topTracks, 'Top 50 Mundial')}
                {renderAlbumsCarousel('Álbumes Destacados', homeData.topAlbums)}
                {renderTrackCardsCarousel('Urbano & Reggaeton', homeData.urbanoMix, 'Urbano & Reggaeton')}
                {renderTrackCardsCarousel('Pop Internacional & Hits', homeData.popMix, 'Pop Internacional')}
                {renderPlaylistsCarousel('Playlists Editoriales', homeData.editorialPlaylists)}
                {renderTrackCardsCarousel('Electrónica & Club Sessions', homeData.electronicMix, 'Electrónica & Club')}
              </>
            ) : (
              <div className="py-16 text-center text-sm text-zinc-400">
                No se pudo cargar el catálogo musical. Revisa tu conexión.
              </div>
            )}
          </div>
        ) : navTab === 'search' ? (
          <div className="space-y-6 animate-fade-in">
            <div className="relative">
              <Search className="w-5 h-5 text-zinc-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={localSearchQuery}
                onChange={(e) => setLocalSearchQuery(e.target.value)}
                placeholder="¿Qué quieres escuchar? Canciones, artistas, álbumes o radios..."
                className="w-full h-12 sm:h-13 pl-12 pr-12 rounded-2xl bg-[#16181F] border border-white/10 focus:border-[#1DB954] text-sm sm:text-base text-white placeholder:text-zinc-500 outline-none transition-colors"
              />
              {localSearchQuery && (
                <button
                  type="button"
                  onClick={() => setLocalSearchQuery('')}
                  aria-label="Limpiar búsqueda"
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {searchLoading ? (
              <div className="py-16 text-center text-sm text-zinc-400">Buscando en todo el catálogo mundial...</div>
            ) : searchResults ? (
              <div className="space-y-7">
                {searchResults.tracks.length === 0 &&
                searchResults.artists.length === 0 &&
                searchResults.albums.length === 0 ? (
                  <div className="py-14 text-center rounded-3xl bg-[#121318] border border-white/[0.06]">
                    <p className="text-base font-bold text-white">
                      No encontramos resultados para “{localSearchQuery}”
                    </p>
                    <p className="text-xs text-zinc-400 mt-1">
                      Prueba con otro artista, tema o género musical.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Spotify Top Result + Top Songs grid */}
                    {searchResults.tracks.length > 0 && (
                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                        <div className="lg:col-span-5 space-y-2.5">
                          <h2 className="font-display text-lg font-bold text-white">Resultado principal</h2>
                          <button
                            type="button"
                            onClick={() => {
                              const top = searchResults.tracks[0];
                              playTrack(top, searchResults.tracks);
                            }}
                            className="group w-full p-5 rounded-3xl bg-[#15171E] hover:bg-[#1E212B] border border-white/[0.07] text-left cursor-pointer transition-all relative overflow-hidden"
                          >
                            <img
                              src={searchResults.tracks[0].album.coverXl || searchResults.tracks[0].album.cover}
                              alt={searchResults.tracks[0].title}
                              referrerPolicy="no-referrer"
                              className="w-24 h-24 rounded-2xl object-cover shadow-xl mb-4"
                            />
                            <h3 className="font-display text-2xl font-black text-white truncate">
                              {searchResults.tracks[0].title}
                            </h3>
                            <p className="text-sm text-zinc-300 mt-1 truncate">
                              Canción · {searchResults.tracks[0].artist.name}
                            </p>
                            <span className="absolute right-5 bottom-5 w-12 h-12 rounded-full bg-[#1DB954] text-[#08090C] flex items-center justify-center shadow-xl group-hover:scale-105 transition-transform">
                              <Play className="w-5 h-5 fill-current ml-0.5" />
                            </span>
                          </button>
                        </div>

                        <div className="lg:col-span-7 space-y-2.5">
                          <h2 className="font-display text-lg font-bold text-white">Canciones</h2>
                          <div className="rounded-2xl bg-[#101217] border border-white/[0.05] p-2">
                            {renderTrackList(searchResults.tracks.slice(0, 6))}
                          </div>
                        </div>
                      </div>
                    )}

                    {renderArtistsCarousel('Artistas', searchResults.artists)}
                    {renderAlbumsCarousel('Álbumes', searchResults.albums)}
                    {renderPlaylistsCarousel('Playlists', searchResults.playlists)}
                    {searchResults.tracks.length > 6 && (
                      <section className="space-y-3">
                        <h2 className="font-display text-lg font-bold text-white">Más resultados</h2>
                        {renderTrackList(searchResults.tracks.slice(6))}
                      </section>
                    )}
                  </>
                )}
              </div>
            ) : (
              <section className="space-y-4">
                <h2 className="font-display text-lg sm:text-xl font-bold text-white">
                  Explorar por géneros
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {(homeData?.genres || []).map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => openGenreDetail(g)}
                      style={{ backgroundColor: g.color }}
                      className="group relative h-28 sm:h-32 rounded-2xl p-4 text-left overflow-hidden cursor-pointer shadow-lg hover:brightness-110 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                    >
                      <span className="relative z-10 font-display text-base sm:text-lg font-extrabold text-white drop-shadow">
                        {g.name}
                      </span>
                      {g.picture && (
                        <img
                          src={g.picture}
                          alt=""
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          className="absolute -right-3 -bottom-2 w-20 h-20 rounded-xl object-cover rotate-[22deg] shadow-2xl group-hover:scale-105 transition-transform"
                        />
                      )}
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>
        ) : navTab === 'radios' ? (
          <div className="space-y-6 animate-fade-in">
            <div>
              <h1 className="font-display text-2xl sm:text-3xl font-black text-white">
                Radios Musicales en Directo 24/7
              </h1>
              <p className="text-xs sm:text-sm text-zinc-400 mt-1">
                Emisoras de España y del mundo en audio directo continuo
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {(homeData?.radios || []).map((station) => {
                const active = activeRadio?.id === station.id;
                return (
                  <button
                    key={station.id}
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      if (active) togglePlayPause();
                      else playRadio(station);
                    }}
                    className={`p-3.5 rounded-2xl border flex items-center gap-3.5 text-left cursor-pointer transition-all ${
                      active
                        ? 'bg-[#1DB954]/15 border-[#1DB954]/60'
                        : 'bg-[#121318] hover:bg-[#191B22] border-white/[0.06]'
                    }`}
                  >
                    <div className="w-14 h-14 rounded-xl overflow-hidden bg-[#1B1E26] border border-white/10 shrink-0 flex items-center justify-center relative">
                      {station.favicon ? (
                        <img
                          src={station.favicon}
                          alt={station.name}
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                          className="w-full h-full object-cover"
                        />
                      ) : null}
                      <Radio className={`w-6 h-6 text-[#1DB954] -z-10`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-bold truncate ${active ? 'text-[#1DB954]' : 'text-white'}`}>
                        {station.name}
                      </p>
                      <p className="text-xs text-zinc-400 truncate mt-0.5">
                        {station.country} · {station.tags.join(' · ')}
                      </p>
                      <p className="text-[11px] text-zinc-500 mt-0.5 tabular-nums">
                        {station.codec || 'MP3'} {station.bitrate ? `${station.bitrate} kbps` : ''}
                      </p>
                    </div>
                    <span className="w-10 h-10 rounded-full bg-[#1DB954] text-[#08090C] flex items-center justify-center shrink-0">
                      {active && isPlaying ? (
                        <Pause className="w-4 h-4 fill-current" />
                      ) : (
                        <Play className="w-4 h-4 fill-current ml-0.5" />
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          /* Tu Biblioteca */
          <div className="space-y-7 animate-fade-in">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h1 className="font-display text-2xl sm:text-3xl font-black text-white">Tu Biblioteca</h1>
                <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
                  Tus canciones favoritas, playlists y álbumes guardados
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreatePlaylist(true)}
                className="h-10 px-4 rounded-full bg-[#1DB954] text-[#08090C] font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Nueva Playlist
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setDetail({ kind: 'liked' })}
                className="p-4 rounded-2xl bg-gradient-to-br from-[#1DB954]/30 to-[#121318] border border-white/10 flex items-center gap-3.5 text-left cursor-pointer hover:border-[#1DB954]/60"
              >
                <div className="w-14 h-14 rounded-xl bg-[#1DB954] flex items-center justify-center shrink-0">
                  <Heart className="w-7 h-7 text-[#08090C] fill-current" />
                </div>
                <div>
                  <p className="text-base font-bold text-white">Tus Me Gusta</p>
                  <p className="text-xs text-zinc-300 tabular-nums">{likedTracks.length} canciones</p>
                </div>
              </button>

              {userPlaylists.map((pl) => (
                <button
                  key={pl.id}
                  type="button"
                  onClick={() => setDetail({ kind: 'user_playlist', playlistId: pl.id })}
                  className="p-4 rounded-2xl bg-[#121318] hover:bg-[#191B22] border border-white/[0.08] flex items-center gap-3.5 text-left cursor-pointer"
                >
                  <img
                    src={pl.tracks[0]?.album.cover || mixHeroCover}
                    alt={pl.name}
                    referrerPolicy="no-referrer"
                    className="w-14 h-14 rounded-xl object-cover shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-base font-bold text-white truncate">{pl.name}</p>
                    <p className="text-xs text-zinc-400 tabular-nums">{pl.tracks.length} canciones</p>
                  </div>
                </button>
              ))}
            </div>

            {savedAlbums.length > 0 && renderAlbumsCarousel('Álbumes guardados', savedAlbums)}
            {savedPlaylists.length > 0 && renderPlaylistsCarousel('Playlists guardadas', savedPlaylists)}

            {recentTracks.length > 0 && (
              <section className="space-y-3">
                <h2 className="font-display text-lg font-bold text-white">Escuchado recientemente</h2>
                {renderTrackList(recentTracks.slice(0, 15))}
              </section>
            )}
          </div>
        )}
      </div>

      {/* Queue Drawer */}
      {showQueueDrawer && (
        <aside className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-sm bg-[#101217]/98 backdrop-blur-2xl border-l border-white/10 p-5 flex flex-col gap-4 shadow-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ListMusic className="w-5 h-5 text-[#1DB954]" />
              <h3 className="font-display text-base font-bold text-white">Cola de reproducción</h3>
            </div>
            <button
              type="button"
              onClick={() => setShowQueueDrawer(false)}
              className="w-9 h-9 rounded-full hover:bg-white/10 text-zinc-300 flex items-center justify-center cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto space-y-1.5">
            {queue.length === 0 ? (
              <p className="text-xs text-zinc-500 py-8 text-center">La cola está vacía.</p>
            ) : (
              queue.map((t, idx) => {
                const active = idx === queueIndex;
                return (
                  <div
                    key={`${t.id}-q-${idx}`}
                    className={`flex items-center gap-2.5 p-2 rounded-xl ${
                      active ? 'bg-[#1DB954]/15 border border-[#1DB954]/40' : 'hover:bg-white/[0.05]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => playTrack(t, queue)}
                      className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer"
                    >
                      <img
                        src={t.album.cover}
                        alt={t.title}
                        referrerPolicy="no-referrer"
                        className="w-10 h-10 rounded-lg object-cover shrink-0"
                      />
                      <div className="min-w-0">
                        <p className={`text-xs font-bold truncate ${active ? 'text-[#1DB954]' : 'text-white'}`}>
                          {t.title}
                        </p>
                        <p className="text-[11px] text-zinc-400 truncate">{t.artist.name}</p>
                      </div>
                    </button>
                    {!active && (
                      <button
                        type="button"
                        onClick={() => removeFromQueue(idx)}
                        className="w-8 h-8 rounded-full text-zinc-500 hover:text-red-400 flex items-center justify-center cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </aside>
      )}

      {/* Create Playlist Modal */}
      {showCreatePlaylist && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setShowCreatePlaylist(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              if (!newPlaylistName.trim()) return;
              const id = createUserPlaylist(newPlaylistName, playlistPickerTrack || undefined);
              setNewPlaylistName('');
              setShowCreatePlaylist(false);
              setPlaylistPickerTrack(null);
              setDetail({ kind: 'user_playlist', playlistId: id });
              showToast('Playlist creada');
            }}
            className="w-full max-w-sm rounded-3xl bg-[#14161D] border border-white/10 p-6 space-y-4 shadow-2xl"
          >
            <h3 className="font-display text-lg font-bold text-white">Nueva Playlist</h3>
            <input
              type="text"
              autoFocus
              value={newPlaylistName}
              onChange={(e) => setNewPlaylistName(e.target.value)}
              placeholder="Ej: Gimnasio, Coche, Chill..."
              className="w-full h-11 px-4 rounded-xl bg-white/[0.06] border border-white/15 focus:border-[#1DB954] text-sm text-white outline-none"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreatePlaylist(false)}
                className="h-10 px-4 rounded-full text-xs font-semibold text-zinc-300 hover:text-white cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="h-10 px-5 rounded-full bg-[#1DB954] text-[#08090C] text-xs font-bold cursor-pointer"
              >
                Crear
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add-to-Playlist Picker Modal */}
      {playlistPickerTrack && !showCreatePlaylist && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setPlaylistPickerTrack(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl bg-[#14161D] border border-white/10 p-5 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-white truncate pr-3">
                Añadir “{playlistPickerTrack.title}”
              </h3>
              <button
                type="button"
                onClick={() => setPlaylistPickerTrack(null)}
                className="w-8 h-8 rounded-full hover:bg-white/10 text-zinc-400 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowCreatePlaylist(true)}
              className="w-full h-11 px-4 rounded-2xl bg-[#1DB954]/15 border border-[#1DB954]/40 text-sm font-bold text-[#1DB954] flex items-center gap-2 cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Crear nueva playlist
            </button>

            <div className="space-y-1.5 max-h-60 overflow-y-auto">
              {userPlaylists.map((pl) => (
                <button
                  key={pl.id}
                  type="button"
                  onClick={() => {
                    addTrackToUserPlaylist(pl.id, playlistPickerTrack);
                    showToast(`Añadida a ${pl.name}`);
                    setPlaylistPickerTrack(null);
                  }}
                  className="w-full p-2.5 rounded-xl hover:bg-white/[0.06] flex items-center justify-between text-left cursor-pointer"
                >
                  <span className="text-sm font-semibold text-white truncate">{pl.name}</span>
                  <span className="text-xs text-zinc-400 tabular-nums">{pl.tracks.length}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Toast Feedback */}
      {toastMsg && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-[#1DB954] text-[#08090C] text-xs font-bold shadow-xl pointer-events-none">
          {toastMsg}
        </div>
      )}

      {/* Persistent Spotify Player Bar, Full Screen Lyrics/NowPlaying Modal & EQ Modal */}
      <SpotifyPlayerBar />
      <FullScreenNowPlayingModal
        onOpenPlaylistPicker={() => {
          if (currentTrack) setPlaylistPickerTrack(currentTrack);
        }}
      />
      <EqAndTimerModal />
    </div>
  );
};
