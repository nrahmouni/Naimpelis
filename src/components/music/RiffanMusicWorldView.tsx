import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Download,
  Headphones,
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
  Sliders,
  Sparkles,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import type { AppLanguage } from '../../types';
import type {
  MusicAlbumRef,
  MusicArtistRef,
  MusicGenre,
  MusicHomePayload,
  MusicPlaylist,
  MusicRadioStation,
  MusicTrack,
} from '../../types/music';
import { useMusicStore } from '../../store/useMusicStore';
import { triggerHaptic } from '../../utils/haptics';
import { useBackInterceptor } from '../../lib/backInterceptor';
import { MusicAudioEngine, triggerTrackMp3Download } from './MusicAudioEngine';
import { SpotifyPlayerBar, formatMusicTime } from './SpotifyPlayerBar';
import { EqAndTimerModal, FullScreenNowPlayingModal } from './FullScreenNowPlayingModal';
import { HorizontalRail } from './HorizontalRail';
import { MUSIC_I18N, type MusicCopy } from './musicI18n';

import spatialHeroCover from '../../assets/images/music_spatial_hero_1795220135333.jpg';
import chillLofiCover from '../../assets/images/music_chill_lofi_1795220135922.jpg';
import rockArenaCover from '../../assets/images/music_rock_arena_1795220136170.jpg';
import acousticSoulCover from '../../assets/images/music_acoustic_soul_1795220138262.jpg';
import mixHeroCover from '../../assets/images/riffan_music_bento_1795218458890.jpg';
import mixUrbanoCover from '../../assets/images/riffan_mix_urbano_1795218458959.jpg';
import mixElectronicCover from '../../assets/images/riffan_mix_electronic_1795218458940.jpg';

interface RiffanMusicWorldViewProps {
  lang: AppLanguage;
  externalSearchQuery?: string;
}

type MusicNavTab = 'home' | 'search' | 'library' | 'radios';

type HomeMoodFilterId =
  | 'all'
  | 'youtube_music'
  | 'spotify'
  | 'morocco'
  | 'arab'
  | 'africa'
  | 'russia'
  | 'romania'
  | 'china'
  | 'usa'
  | 'latin'
  | 'spain'
  | 'urbano'
  | 'pop'
  | 'electronic'
  | 'rock'
  | 'chill'
  | 'flamenco'
  | 'rnb'
  | 'soundtrack'
  | 'classics'
  | 'audius';

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

interface RadioFilterSpec {
  id: string;
  mode: 'country' | 'tag';
  value: string;
  labelKey: keyof MusicCopy;
}

const RADIO_FILTERS: RadioFilterSpec[] = [
  { id: 'all', mode: 'country', value: 'ALL', labelKey: 'radioAll' },
  { id: 'es', mode: 'country', value: 'ES', labelKey: 'radioSpain' },
  { id: 'ma', mode: 'country', value: 'MA', labelKey: 'radioMorocco' },
  { id: 'arab', mode: 'country', value: 'ARAB', labelKey: 'radioArab' },
  { id: 'africa', mode: 'country', value: 'AFRICA', labelKey: 'radioAfrica' },
  { id: 'ru', mode: 'country', value: 'RU', labelKey: 'radioRussia' },
  { id: 'ro', mode: 'country', value: 'RO', labelKey: 'radioRomania' },
  { id: 'cn', mode: 'country', value: 'CN', labelKey: 'radioChina' },
  { id: 'us', mode: 'country', value: 'US', labelKey: 'radioUsa' },
  { id: 'latin', mode: 'country', value: 'LATIN', labelKey: 'radioLatin' },
  { id: 'pop', mode: 'tag', value: 'pop', labelKey: 'radioPop' },
  { id: 'electronic', mode: 'tag', value: 'electronic', labelKey: 'radioElectronic' },
  { id: 'rock', mode: 'tag', value: 'rock', labelKey: 'radioRock' },
  { id: 'lofi', mode: 'tag', value: 'lofi', labelKey: 'radioLofi' },
  { id: 'jazz', mode: 'tag', value: 'jazz', labelKey: 'radioJazz' },
];

function getTimeGreeting(m: MusicCopy): string {
  const hr = new Date().getHours();
  if (hr < 12) return m.goodMorning;
  if (hr < 20) return m.goodAfternoon;
  return m.goodEvening;
}

function isOpenableArtistId(id?: string): boolean {
  return Boolean(id && /^\d+$/.test(id));
}

function isOpenableAlbumId(id?: string): boolean {
  return Boolean(
    id && (/^\d+$/.test(id) || id.startsWith('ytm-MPREb_') || id.startsWith('it-alb-'))
  );
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
  onDownloadMp3?: () => void;
  onOpenSettings?: () => void;
  onOpenArtist?: (artistId: string) => void;
  onOpenAlbum?: (albumId: string) => void;
  extraRightAction?: React.ReactNode;
  copy: MusicCopy;
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
  onDownloadMp3,
  onOpenSettings,
  onOpenArtist,
  onOpenAlbum,
  extraRightAction,
  copy,
}) => (
  <div
    className={`group flex items-center gap-2 sm:gap-3 px-2 sm:px-3.5 py-2 rounded-xl transition-colors ${
      isActive ? 'bg-[#10B981]/14 border border-[#10B981]/30' : 'hover:bg-white/[0.05]'
    }`}
  >
    <button
      type="button"
      onClick={onPlay}
      aria-label={`${copy.playNow} ${track.title}`}
      className="hidden sm:flex w-7 h-9 items-center justify-center shrink-0 cursor-pointer text-xs font-semibold tabular-nums text-zinc-400 group-hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#10B981] rounded-lg"
    >
      {isActive && isPlaying ? (
        <span className="flex items-end gap-[2px] h-3.5" aria-hidden="true">
          <span className="w-[3px] bg-[#10B981] rounded-full h-full" />
          <span className="w-[3px] bg-[#22D3EE] rounded-full h-2/3" />
          <span className="w-[3px] bg-[#6EE7B7] rounded-full h-4/5" />
        </span>
      ) : (
        <>
          <span className={`group-hover:hidden ${isActive ? 'text-[#34D399]' : ''}`}>
            {index + 1}
          </span>
          <Play className="w-3.5 h-3.5 fill-current hidden group-hover:block text-white" />
        </>
      )}
    </button>

    <button
      type="button"
      onClick={onPlay}
      className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1 text-left cursor-pointer"
    >
      <div className="w-11 h-11 rounded-lg overflow-hidden bg-[#0E1522] border border-white/10 shrink-0 flex items-center justify-center">
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
            isActive ? 'text-[#34D399]' : 'text-white'
          }`}
        >
          {track.title}
        </p>
        <div className="flex items-center gap-1.5 text-xs text-zinc-400 truncate mt-0.5">
          {track.explicit && (
            <span className="px-1 rounded bg-white/15 text-zinc-200 text-[9px] font-bold leading-tight">
              E
            </span>
          )}
          <span
            onClick={(e) => {
              if (onOpenArtist && isOpenableArtistId(track.artist.id)) {
                e.stopPropagation();
                onOpenArtist(track.artist.id);
              }
            }}
            className={
              onOpenArtist && isOpenableArtistId(track.artist.id)
                ? 'hover:underline hover:text-white truncate'
                : 'truncate'
            }
          >
            {track.artist.name}
          </span>
        </div>
      </div>
    </button>

    {track.album.title && (
      <button
        type="button"
        onClick={() => {
          if (onOpenAlbum && isOpenableAlbumId(track.album.id)) {
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

    <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
      <button
        type="button"
        onClick={onToggleLike}
        aria-label={isLiked ? copy.likeRemove : copy.likeAdd}
        className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center cursor-pointer transition-all ${
          isLiked
            ? 'text-[#34D399]'
            : 'text-zinc-400 opacity-85 sm:opacity-0 sm:group-hover:opacity-100 hover:text-white'
        }`}
      >
        <Heart className={`w-4 h-4 ${isLiked ? 'fill-current' : ''}`} />
      </button>

      {onDownloadMp3 && (
        <button
          type="button"
          onClick={onDownloadMp3}
          title={copy.downloadMp3Btn}
          aria-label={copy.downloadMp3Btn}
          className="flex w-7 h-7 sm:w-9 sm:h-9 rounded-full items-center justify-center text-zinc-400 sm:opacity-0 sm:group-hover:opacity-100 hover:text-[#34D399] cursor-pointer transition-opacity"
        >
          <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </button>
      )}

      {onOpenSettings && (
        <button
          type="button"
          onClick={onOpenSettings}
          title={copy.studioTitle}
          aria-label={copy.studioTitle}
          className="flex w-7 h-7 sm:w-9 sm:h-9 rounded-full items-center justify-center text-zinc-400 sm:opacity-0 sm:group-hover:opacity-100 hover:text-[#22D3EE] cursor-pointer transition-opacity"
        >
          <Sliders className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </button>
      )}

      <button
        type="button"
        onClick={onAddToQueue}
        title={copy.addToQueue}
        className="hidden sm:flex w-9 h-9 rounded-full items-center justify-center text-zinc-400 opacity-0 group-hover:opacity-100 hover:text-white cursor-pointer transition-opacity"
      >
        <ListPlus className="w-4 h-4" />
      </button>

      <button
        type="button"
        onClick={onOpenPlaylistPicker}
        title={copy.addToPlaylist}
        className="hidden sm:flex w-9 h-9 rounded-full items-center justify-center text-zinc-400 opacity-0 group-hover:opacity-100 hover:text-white cursor-pointer transition-opacity"
      >
        <Plus className="w-4 h-4" />
      </button>

      {extraRightAction}

      <span className="w-9 sm:w-10 text-right text-[11px] sm:text-xs text-zinc-400 tabular-nums">
        {formatMusicTime(track.durationSec)}
      </span>
    </div>
  </div>
);

export const RiffanMusicWorldView: React.FC<RiffanMusicWorldViewProps> = ({
  externalSearchQuery = '',
}) => {
  const [navTab, setNavTab] = useState<MusicNavTab>('home');
  const [activeMood, setActiveMood] = useState<HomeMoodFilterId>('all');
  const [detail, setDetail] = useState<MusicDetailView | null>(null);
  const [homeData, setHomeData] = useState<MusicHomePayload | null>(null);
  const [homeLoading, setHomeLoading] = useState<boolean>(true);

  const [radioFilterId, setRadioFilterId] = useState<string>('all');
  const [filteredRadios, setFilteredRadios] = useState<MusicRadioStation[] | null>(null);
  const [radiosLoading, setRadiosLoading] = useState(false);

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
  const isPlaying = useMusicStore((s) => s.isPlaying);
  const queue = useMusicStore((s) => s.queue);
  const queueIndex = useMusicStore((s) => s.queueIndex);
  const likedTracks = useMusicStore((s) => s.likedTracks);
  const savedAlbums = useMusicStore((s) => s.savedAlbums);
  const savedPlaylists = useMusicStore((s) => s.savedPlaylists);
  const userPlaylists = useMusicStore((s) => s.userPlaylists);
  const recentTracks = useMusicStore((s) => s.recentTracks);
  const showQueueDrawer = useMusicStore((s) => s.showQueueDrawer);
  const musicLang = useMusicStore((s) => s.musicLang);
  const spatial8dEnabled = useMusicStore((s) => s.spatial8dEnabled);
  const toggleSpatial8d = useMusicStore((s) => s.toggleSpatial8d);
  const m = MUSIC_I18N[musicLang];

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
  const setShowEqModal = useMusicStore((s) => s.setShowEqModal);

  const toastTimerRef = useRef<number | null>(null);
  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToastMsg(null), 2400);
  }, []);

  useBackInterceptor(Boolean(detail), 'music-detail-view', () => setDetail(null), { priority: 8 });
  useBackInterceptor(showQueueDrawer, 'music-queue-drawer', () => setShowQueueDrawer(false), { priority: 18 });
  useBackInterceptor(Boolean(playlistPickerTrack), 'music-pl-picker', () => setPlaylistPickerTrack(null), {
    priority: 22,
  });

  useEffect(() => {
    if (externalSearchQuery.trim()) {
      setLocalSearchQuery(externalSearchQuery);
      setNavTab('search');
      setDetail(null);
    }
  }, [externalSearchQuery]);

  // Initial load of expanded Global + Platform Home data
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
            youtubeMusicHits: data.youtubeMusicHits || [],
            youtubeMusicAlbums: data.youtubeMusicAlbums || [],
            spotifyHits: data.spotifyHits || [],
            spotifyAlbums: data.spotifyAlbums || [],
            spainHits: data.spainHits || [],
            moroccoMix: data.moroccoMix || [],
            arabMix: data.arabMix || [],
            africaMix: data.africaMix || [],
            russiaMix: data.russiaMix || [],
            romaniaMix: data.romaniaMix || [],
            chinaMix: data.chinaMix || [],
            usaMix: data.usaMix || [],
            urbanoMix: data.urbanoMix || [],
            popMix: data.popMix || [],
            electronicMix: data.electronicMix || [],
            rockIndieMix: data.rockIndieMix || [],
            latinSalsaMix: data.latinSalsaMix || [],
            rnbSoulMix: data.rnbSoulMix || [],
            chillLofiMix: data.chillLofiMix || [],
            flamencoAcousticMix: data.flamencoAcousticMix || [],
            soundtrackMix: data.soundtrackMix || [],
            classicsMix: data.classicsMix || [],
            audiusTrending: data.audiusTrending || [],
            topAlbums: data.topAlbums || [],
            newReleases: data.newReleases || [],
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

  // Load filtered radios by country group or music tag
  useEffect(() => {
    if (radioFilterId === 'all') {
      setFilteredRadios(null);
      setRadiosLoading(false);
      return;
    }
    const spec = RADIO_FILTERS.find((r) => r.id === radioFilterId);
    if (!spec) return;
    let cancelled = false;
    setRadiosLoading(true);
    const qs =
      spec.mode === 'country'
        ? `country=${encodeURIComponent(spec.value)}`
        : `tag=${encodeURIComponent(spec.value)}`;
    fetch(`/api/music/radios?${qs}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data?.success) {
          setFilteredRadios(data.radios || []);
        }
        setRadiosLoading(false);
      })
      .catch(() => {
        if (!cancelled) setRadiosLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [radioFilterId]);

  // Debounced search
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
  const greeting = useMemo(() => getTimeGreeting(m), [m]);
  const likedIdSet = useMemo(() => new Set(likedTracks.map((t) => t.id)), [likedTracks]);

  // Dynamic Hero spotlight track (follows active track if playing, else top hit)
  const heroSpotlightTrack = useMemo(() => {
    if (currentTrack) return currentTrack;
    if (homeData?.youtubeMusicHits?.[0]) return homeData.youtubeMusicHits[0];
    if (homeData?.spotifyHits?.[0]) return homeData.spotifyHits[0];
    if (homeData?.spainHits?.[0]) return homeData.spainHits[0];
    if (homeData?.topTracks?.[0]) return homeData.topTracks[0];
    return null;
  }, [currentTrack, homeData]);

  const heroPool = useMemo(() => {
    if (!homeData) return [];
    const merged = [
      ...homeData.youtubeMusicHits,
      ...homeData.spotifyHits,
      ...homeData.spainHits,
      ...homeData.moroccoMix,
      ...homeData.africaMix,
      ...homeData.arabMix,
      ...homeData.usaMix,
      ...homeData.topTracks,
    ];
    const seen = new Set<string>();
    return merged.filter((t) => {
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });
  }, [homeData]);

  const moodFilters = useMemo<Array<{ id: HomeMoodFilterId; label: string }>>(
    () => [
      { id: 'all', label: m.moodAll },
      { id: 'youtube_music', label: m.moodYtm },
      { id: 'spotify', label: m.moodSpotify },
      { id: 'morocco', label: m.moodMorocco },
      { id: 'arab', label: m.moodArab },
      { id: 'africa', label: m.moodAfrica },
      { id: 'russia', label: m.moodRussia },
      { id: 'romania', label: m.moodRomania },
      { id: 'china', label: m.moodChina },
      { id: 'usa', label: m.moodUsa },
      { id: 'latin', label: m.moodLatin },
      { id: 'spain', label: m.moodSpain },
      { id: 'urbano', label: m.moodUrbano },
      { id: 'pop', label: m.moodPop },
      { id: 'electronic', label: m.moodElectronic },
      { id: 'rock', label: m.moodRock },
      { id: 'chill', label: m.moodChill },
      { id: 'flamenco', label: m.moodFlamenco },
      { id: 'rnb', label: m.moodRnb },
      { id: 'soundtrack', label: m.moodSoundtrack },
      { id: 'classics', label: m.moodClassics },
      { id: 'audius', label: m.moodAudius },
    ],
    [m]
  );

  const activeMoodSelection = useMemo(() => {
    if (!homeData || activeMood === 'all') return null;
    const map: Record<Exclude<HomeMoodFilterId, 'all'>, { title: string; subtitle: string; tracks: MusicTrack[]; cover: string }> = {
      youtube_music: {
        title: m.secYtmHits,
        subtitle: 'YouTube Music Charts · MV & Official Audio',
        tracks: homeData.youtubeMusicHits,
        cover: homeData.youtubeMusicHits[0]?.album.coverXl || spatialHeroCover,
      },
      spotify: {
        title: m.secSpotifyHits,
        subtitle: 'Global Top 50 · Today’s Top Hits · Viral 50',
        tracks: homeData.spotifyHits,
        cover: homeData.spotifyHits[0]?.album.coverXl || mixHeroCover,
      },
      morocco: {
        title: m.secMorocco,
        subtitle: 'ElGrandeToto · Saad Lamjarred · Manal · Tagne · Dystinct · Cheb Khaled',
        tracks: homeData.moroccoMix,
        cover: homeData.moroccoMix[0]?.album.coverXl || mixUrbanoCover,
      },
      arab: {
        title: m.secArab,
        subtitle: 'Amr Diab · Nancy Ajram · Wegz · Tamer Hosny · Sherine · Elissa',
        tracks: homeData.arabMix,
        cover: homeData.arabMix[0]?.album.coverXl || acousticSoulCover,
      },
      africa: {
        title: m.secAfrica,
        subtitle: 'Burna Boy · Wizkid · Tyla · Rema · Ayra Starr · Diamond Platnumz · Fally Ipupa',
        tracks: homeData.africaMix,
        cover: homeData.africaMix[0]?.album.coverXl || mixUrbanoCover,
      },
      russia: {
        title: m.secRussia,
        subtitle: 'Macan · Anna Asti · Miyagi & Andy Panda · Jony · Xcho · Zivert',
        tracks: homeData.russiaMix,
        cover: homeData.russiaMix[0]?.album.coverXl || mixElectronicCover,
      },
      romania: {
        title: m.secRomania,
        subtitle: "Inna · Carla's Dreams · Smiley · Delia · Theo Rose · Tzanca Uraganu",
        tracks: homeData.romaniaMix,
        cover: homeData.romaniaMix[0]?.album.coverXl || mixElectronicCover,
      },
      china: {
        title: m.secChina,
        subtitle: 'Jay Chou · G.E.M. · Eason Chan · JJ Lin · Joker Xue · Jackson Wang',
        tracks: homeData.chinaMix,
        cover: homeData.chinaMix[0]?.album.coverXl || spatialHeroCover,
      },
      usa: {
        title: m.secUsa,
        subtitle: 'Kendrick Lamar · SZA · Sabrina Carpenter · The Weeknd · Billie Eilish',
        tracks: homeData.usaMix,
        cover: homeData.usaMix[0]?.album.coverXl || rockArenaCover,
      },
      spain: {
        title: m.secSpainHits,
        subtitle: 'Quevedo · Rosalía · Aitana · Saiko · Bad Bunny',
        tracks: homeData.spainHits,
        cover: homeData.spainHits[0]?.album.coverXl || mixUrbanoCover,
      },
      urbano: {
        title: m.secUrbano,
        subtitle: 'Trap · Reggaeton · Urban Charts',
        tracks: homeData.urbanoMix,
        cover: mixUrbanoCover,
      },
      pop: {
        title: m.secPop,
        subtitle: 'Global Pop · Dance Pop',
        tracks: homeData.popMix,
        cover: homeData.popMix[0]?.album.coverXl || spatialHeroCover,
      },
      electronic: {
        title: m.secElectronic,
        subtitle: 'House · Techno · Clubbing',
        tracks: homeData.electronicMix,
        cover: mixElectronicCover,
      },
      rock: {
        title: m.secRock,
        subtitle: 'Rock · Indie · Alternative',
        tracks: homeData.rockIndieMix,
        cover: rockArenaCover,
      },
      chill: {
        title: m.secChill,
        subtitle: 'Lo-Fi Beats · Ambient · Focus',
        tracks: homeData.chillLofiMix,
        cover: chillLofiCover,
      },
      flamenco: {
        title: m.secFlamenco,
        subtitle: 'Flamenco · Acoustic Guitar',
        tracks: homeData.flamencoAcousticMix,
        cover: acousticSoulCover,
      },
      latin: {
        title: m.secLatin,
        subtitle: 'Salsa · Bachata · Reggaeton · Corridos',
        tracks: homeData.latinSalsaMix,
        cover: homeData.latinSalsaMix[0]?.album.coverXl || mixUrbanoCover,
      },
      rnb: {
        title: m.secRnb,
        subtitle: 'R&B · Neo Soul · Groove',
        tracks: homeData.rnbSoulMix,
        cover: homeData.rnbSoulMix[0]?.album.coverXl || acousticSoulCover,
      },
      soundtrack: {
        title: m.secSoundtrack,
        subtitle: 'Cinema · Series · Anime OST',
        tracks: homeData.soundtrackMix,
        cover: homeData.soundtrackMix[0]?.album.coverXl || spatialHeroCover,
      },
      classics: {
        title: m.secClassics,
        subtitle: '80s · 90s · Legends',
        tracks: homeData.classicsMix,
        cover: homeData.classicsMix[0]?.album.coverXl || rockArenaCover,
      },
      audius: {
        title: m.secAudius,
        subtitle: 'Audius Hi-Fi Independent',
        tracks: homeData.audiusTrending,
        cover: homeData.audiusTrending[0]?.album.coverXl || mixElectronicCover,
      },
    };
    return map[activeMood];
  }, [activeMood, homeData, m]);

  const renderQuickMixes = () => {
    if (!homeData) return null;
    const cards = [
      {
        id: 'liked',
        title: m.likedSongs,
        cover: mixHeroCover,
        count: `${likedTracks.length} ${m.songsCount}`,
        onClick: () => setDetail({ kind: 'liked' }),
      },
      {
        id: 'ytm',
        title: m.moodYtm,
        cover: homeData.youtubeMusicHits[0]?.album.cover || spatialHeroCover,
        count: `${homeData.youtubeMusicHits.length} hits`,
        onClick: () =>
          setDetail({
            kind: 'curated',
            title: m.secYtmHits,
            subtitle: 'YouTube Music · Official Audio & MV',
            cover: homeData.youtubeMusicHits[0]?.album.coverXl || spatialHeroCover,
            tracks: homeData.youtubeMusicHits,
          }),
      },
      {
        id: 'spotify',
        title: m.moodSpotify,
        cover: homeData.spotifyHits[0]?.album.cover || mixUrbanoCover,
        count: `${homeData.spotifyHits.length} charts`,
        onClick: () =>
          setDetail({
            kind: 'curated',
            title: m.secSpotifyHits,
            subtitle: 'Spotify Global Top 50 · Viral 50',
            cover: homeData.spotifyHits[0]?.album.coverXl || mixUrbanoCover,
            tracks: homeData.spotifyHits,
          }),
      },
      {
        id: 'morocco',
        title: m.moodMorocco,
        cover: homeData.moroccoMix[0]?.album.cover || mixUrbanoCover,
        count: `${homeData.moroccoMix.length} ${m.songsCount}`,
        onClick: () =>
          setDetail({
            kind: 'curated',
            title: m.secMorocco,
            subtitle: 'ElGrandeToto · Saad Lamjarred · Manal · Dystinct',
            cover: homeData.moroccoMix[0]?.album.coverXl || mixUrbanoCover,
            tracks: homeData.moroccoMix,
          }),
      },
      {
        id: 'africa',
        title: m.moodAfrica,
        cover: homeData.africaMix[0]?.album.cover || mixElectronicCover,
        count: `${homeData.africaMix.length} ${m.songsCount}`,
        onClick: () =>
          setDetail({
            kind: 'curated',
            title: m.secAfrica,
            subtitle: 'Burna Boy · Wizkid · Tyla · Rema · Amapiano',
            cover: homeData.africaMix[0]?.album.coverXl || mixElectronicCover,
            tracks: homeData.africaMix,
          }),
      },
      {
        id: 'arab',
        title: m.moodArab,
        cover: homeData.arabMix[0]?.album.cover || acousticSoulCover,
        count: `${homeData.arabMix.length} ${m.songsCount}`,
        onClick: () =>
          setDetail({
            kind: 'curated',
            title: m.secArab,
            subtitle: 'Amr Diab · Nancy Ajram · Wegz · Sherine',
            cover: homeData.arabMix[0]?.album.coverXl || acousticSoulCover,
            tracks: homeData.arabMix,
          }),
      },
      {
        id: 'russia',
        title: m.moodRussia,
        cover: homeData.russiaMix[0]?.album.cover || chillLofiCover,
        count: `${homeData.russiaMix.length} ${m.songsCount}`,
        onClick: () =>
          setDetail({
            kind: 'curated',
            title: m.secRussia,
            subtitle: 'Macan · Anna Asti · Miyagi · Jony',
            cover: homeData.russiaMix[0]?.album.coverXl || chillLofiCover,
            tracks: homeData.russiaMix,
          }),
      },
      {
        id: 'radios',
        title: m.navRadios,
        cover: rockArenaCover,
        count: `${homeData.radios.length}+ FM`,
        onClick: () => {
          setDetail(null);
          setNavTab('radios');
        },
      },
    ];

    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3">
        {cards.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={c.onClick}
            className="group flex items-center gap-3 rounded-2xl bg-white/[0.05] hover:bg-[#10B981]/14 border border-white/[0.07] hover:border-[#10B981]/35 overflow-hidden text-left cursor-pointer transition-all pr-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#10B981]"
          >
            <img
              src={c.cover}
              alt={c.title}
              referrerPolicy="no-referrer"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
              className="w-14 h-14 sm:w-16 sm:h-16 object-cover shrink-0 bg-[#0B111C]"
            />
            <div className="min-w-0 flex-1 py-1">
              <p className="text-xs sm:text-sm font-bold text-white truncate">{c.title}</p>
              <p className="text-[11px] text-zinc-400 truncate mt-0.5 tabular-nums">{c.count}</p>
            </div>
            <span className="hidden sm:flex w-9 h-9 rounded-full bg-gradient-to-br from-[#10B981] to-[#22D3EE] text-[#03130E] items-center justify-center opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100 transition-all shadow-[0_6px_18px_rgba(16,185,129,0.4)] shrink-0">
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
      <HorizontalRail
        title={title}
        rightSlot={
          viewAllTitle ? (
            <button
              type="button"
              onClick={() =>
                setDetail({
                  kind: 'curated',
                  title: viewAllTitle,
                  subtitle: `${tracks.length} ${m.selectedSongs}`,
                  cover: tracks[0]?.album.coverXl || tracks[0]?.album.cover || spatialHeroCover,
                  tracks,
                })
              }
              className="text-xs font-semibold text-[#34D399] hover:text-[#6EE7B7] cursor-pointer whitespace-nowrap"
            >
              {m.viewAll}
            </button>
          ) : undefined
        }
      >
        {tracks.slice(0, 18).map((t) => {
          const active = currentTrack?.id === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                triggerHaptic('light');
                playTrack(t, tracks);
              }}
              className="group shrink-0 w-[144px] sm:w-[172px] p-2.5 rounded-2xl bg-[#0B1018]/90 hover:bg-[#121A26] border border-white/[0.06] hover:border-[#10B981]/35 text-left cursor-pointer transition-all duration-200 hover:-translate-y-0.5 snap-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#10B981]"
            >
              <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-[#0F1724] mb-2.5">
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
                  className={`absolute right-2 bottom-2 w-10 h-10 rounded-full bg-gradient-to-br from-[#10B981] to-[#22D3EE] text-[#03130E] flex items-center justify-center shadow-[0_8px_22px_rgba(16,185,129,0.45)] transition-all ${
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
              <p className={`text-sm font-bold truncate ${active ? 'text-[#34D399]' : 'text-white'}`}>
                {t.title}
              </p>
              <p className="text-xs text-zinc-400 truncate mt-0.5">{t.artist.name}</p>
            </button>
          );
        })}
      </HorizontalRail>
    );
  };

  const renderArtistsCarousel = (title: string, artists: MusicArtistRef[]) => {
    if (!artists || artists.length === 0) return null;
    return (
      <HorizontalRail title={title}>
        {artists.slice(0, 16).map((art) => (
          <button
            key={art.id}
            type="button"
            onClick={() => openArtistDetail(art.id, art)}
            className="group shrink-0 w-[132px] sm:w-[156px] p-2.5 rounded-2xl bg-[#0B1018]/90 hover:bg-[#121A26] border border-white/[0.06] hover:border-[#10B981]/35 text-center cursor-pointer transition-all hover:-translate-y-0.5 snap-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#10B981]"
          >
            <div className="aspect-square w-full rounded-full overflow-hidden bg-[#0F1724] border border-white/12 group-hover:border-[#34D399]/55 mb-2.5 shadow-lg transition-colors">
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
            <p className="text-[11px] text-zinc-400 mt-0.5">{m.artistRole}</p>
          </button>
        ))}
      </HorizontalRail>
    );
  };

  const renderAlbumsCarousel = (title: string, albums: MusicAlbumRef[]) => {
    if (!albums || albums.length === 0) return null;
    return (
      <HorizontalRail title={title}>
        {albums.slice(0, 18).map((alb) => (
          <button
            key={alb.id}
            type="button"
            onClick={() => openAlbumDetail(alb.id, alb)}
            className="group shrink-0 w-[144px] sm:w-[172px] p-2.5 rounded-2xl bg-[#0B1018]/90 hover:bg-[#121A26] border border-white/[0.06] hover:border-[#10B981]/35 text-left cursor-pointer transition-all hover:-translate-y-0.5 snap-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#10B981]"
          >
            <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-[#0F1724] mb-2.5">
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
              <span className="absolute right-2 bottom-2 w-10 h-10 rounded-full bg-gradient-to-br from-[#10B981] to-[#22D3EE] text-[#03130E] flex items-center justify-center shadow-lg opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all">
                <Play className="w-4 h-4 fill-current ml-0.5" />
              </span>
            </div>
            <p className="text-sm font-bold text-white truncate">{alb.title}</p>
            <p className="text-xs text-zinc-400 truncate mt-0.5">
              {alb.artist?.name || (alb.releaseDate ? alb.releaseDate.slice(0, 4) : m.albumLabel)}
            </p>
          </button>
        ))}
      </HorizontalRail>
    );
  };

  const renderPlaylistsCarousel = (title: string, playlists: MusicPlaylist[]) => {
    if (!playlists || playlists.length === 0) return null;
    return (
      <HorizontalRail title={title}>
        {playlists.slice(0, 16).map((pl) => (
          <button
            key={pl.id}
            type="button"
            onClick={() => openPlaylistDetail(pl.id, pl)}
            className="group shrink-0 w-[144px] sm:w-[172px] p-2.5 rounded-2xl bg-[#0B1018]/90 hover:bg-[#121A26] border border-white/[0.06] hover:border-[#10B981]/35 text-left cursor-pointer transition-all hover:-translate-y-0.5 snap-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#10B981]"
          >
            <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-[#0F1724] mb-2.5">
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
              <span className="absolute right-2 bottom-2 w-10 h-10 rounded-full bg-gradient-to-br from-[#10B981] to-[#22D3EE] text-[#03130E] flex items-center justify-center shadow-lg opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all">
                <Play className="w-4 h-4 fill-current ml-0.5" />
              </span>
            </div>
            <p className="text-sm font-bold text-white truncate">{pl.title}</p>
            <p className="text-xs text-zinc-400 truncate mt-0.5">{pl.creator || 'Editorial'}</p>
          </button>
        ))}
      </HorizontalRail>
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
          copy={m}
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
            showToast(`${m.addedToQueue}: ${track.title}`);
          }}
          onOpenPlaylistPicker={() => setPlaylistPickerTrack(track)}
          onDownloadMp3={() => {
            triggerHaptic('medium');
            triggerTrackMp3Download(track);
            showToast(m.downloadingToast);
          }}
          onOpenSettings={() => {
            triggerHaptic('light');
            if (currentTrack?.id !== track.id) {
              playTrack(track, tracks);
            }
            setShowEqModal(true);
          }}
          onOpenArtist={(aid) => openArtistDetail(aid)}
          onOpenAlbum={(albid) => openAlbumDetail(albid)}
          extraRightAction={
            userPlId ? (
              <button
                type="button"
                onClick={() => removeTrackFromUserPlaylist(userPlId, track.id)}
                title={m.removeFromPlaylist}
                className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-500 hover:text-rose-400 cursor-pointer"
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
          <button
            type="button"
            onClick={() => setDetail(null)}
            className="min-h-10 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-semibold text-zinc-200 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" /> {m.back}
          </button>
          <div className="flex flex-col sm:flex-row sm:items-end gap-5 p-5 sm:p-7 rounded-3xl bg-gradient-to-br from-[#10B981]/20 via-[#0B121D] to-[#05080D] border border-[#10B981]/22">
            <div className="w-36 h-36 sm:w-44 sm:h-44 rounded-2xl bg-gradient-to-br from-[#10B981] via-[#14B8A6] to-[#22D3EE] flex items-center justify-center shadow-2xl shrink-0">
              <Heart className="w-16 h-16 text-[#03130E] fill-current" />
            </div>
            <div className="space-y-2 min-w-0">
              <p className="text-xs font-bold uppercase tracking-wider text-[#34D399]">{m.playlistLabel}</p>
              <h1 className="font-display text-3xl sm:text-5xl font-black text-white tracking-tight">
                {m.likedSongs}
              </h1>
              <p className="text-sm text-zinc-300 tabular-nums">
                {likedTracks.length} {likedTracks.length === 1 ? m.songSingular : m.songsCount}
              </p>
              {likedTracks.length > 0 && (
                <div className="pt-2 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => playTrack(likedTracks[0], likedTracks)}
                    className="h-12 px-6 rounded-full bg-gradient-to-r from-[#10B981] to-[#22D3EE] hover:scale-105 text-[#03130E] font-bold text-sm inline-flex items-center gap-2 cursor-pointer shadow-[0_8px_24px_rgba(16,185,129,0.35)] transition-transform"
                  >
                    <Play className="w-4 h-4 fill-current" /> {m.playAll}
                  </button>
                </div>
              )}
            </div>
          </div>

          {likedTracks.length === 0 ? (
            <div className="py-16 text-center rounded-3xl bg-[#0B1018] border border-white/[0.06]">
              <Heart className="w-10 h-10 text-zinc-600 mx-auto mb-2" />
              <p className="text-base font-bold text-white">{m.noLikedTitle}</p>
              <p className="text-xs text-zinc-400 mt-1">{m.noLikedSub}</p>
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
              <ArrowLeft className="w-4 h-4" /> {m.back}
            </button>
            <button
              type="button"
              onClick={() => {
                deleteUserPlaylist(pl.id);
                setDetail(null);
                showToast(m.playlistDeleted);
              }}
              className="min-h-10 px-3 rounded-xl bg-rose-500/12 hover:bg-rose-500/22 text-xs font-semibold text-rose-300 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" /> {m.deletePlaylist}
            </button>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-end gap-5 p-5 sm:p-7 rounded-3xl bg-gradient-to-br from-[#10B981]/18 via-[#0B121D] to-[#05080D] border border-[#10B981]/22">
            <img
              src={pl.tracks[0]?.album.coverXl || pl.tracks[0]?.album.cover || mixHeroCover}
              alt={pl.name}
              referrerPolicy="no-referrer"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
              className="w-36 h-36 sm:w-44 sm:h-44 rounded-2xl object-cover shadow-2xl shrink-0"
            />
            <div className="space-y-2 min-w-0">
              <p className="text-xs font-bold uppercase tracking-wider text-[#34D399]">{m.yourPlaylist}</p>
              <h1 className="font-display text-3xl sm:text-5xl font-black text-white tracking-tight truncate">
                {pl.name}
              </h1>
              <p className="text-sm text-zinc-300 tabular-nums">
                {pl.tracks.length} {pl.tracks.length === 1 ? m.songSingular : m.songsCount}
              </p>
              {pl.tracks.length > 0 && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => playTrack(pl.tracks[0], pl.tracks)}
                    className="h-12 px-6 rounded-full bg-gradient-to-r from-[#10B981] to-[#22D3EE] hover:scale-105 text-[#03130E] font-bold text-sm inline-flex items-center gap-2 cursor-pointer shadow-lg"
                  >
                    <Play className="w-4 h-4 fill-current" /> {m.playNow}
                  </button>
                </div>
              )}
            </div>
          </div>

          {pl.tracks.length === 0 ? (
            <div className="py-16 text-center rounded-3xl bg-[#0B1018] border border-white/[0.06]">
              <p className="text-sm text-zinc-400">{m.emptyPlaylistSub}</p>
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
            <ArrowLeft className="w-4 h-4" /> {m.back}
          </button>

          <div className="flex flex-col sm:flex-row sm:items-end gap-5 p-5 sm:p-7 rounded-3xl bg-gradient-to-br from-[#10B981]/18 via-[#0B121D] to-[#05080D] border border-[#10B981]/22">
            <img
              src={detail.cover}
              alt={detail.title}
              referrerPolicy="no-referrer"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
              className="w-36 h-36 sm:w-44 sm:h-44 rounded-2xl object-cover shadow-2xl shrink-0"
            />
            <div className="space-y-2 min-w-0">
              <p className="text-xs font-bold uppercase tracking-wider text-[#34D399]">
                {m.curatedSelection}
              </p>
              <h1 className="font-display text-3xl sm:text-4xl font-black text-white tracking-tight">
                {detail.title}
              </h1>
              <p className="text-sm text-zinc-300">{detail.subtitle}</p>
              {detail.tracks.length > 0 && (
                <div className="pt-2 flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => playTrack(detail.tracks[0], detail.tracks)}
                    className="h-12 px-6 rounded-full bg-gradient-to-r from-[#10B981] to-[#22D3EE] hover:scale-105 text-[#03130E] font-bold text-sm inline-flex items-center gap-2 cursor-pointer shadow-lg transition-transform"
                  >
                    <Play className="w-4 h-4 fill-current" /> {m.playList}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const shuffled = [...detail.tracks].sort(() => Math.random() - 0.5);
                      playTrack(shuffled[0], shuffled);
                    }}
                    className="h-12 px-5 rounded-full border border-white/20 hover:border-[#34D399] text-white font-semibold text-sm inline-flex items-center gap-2 cursor-pointer"
                  >
                    <Shuffle className="w-4 h-4" /> {m.shuffle}
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
            <ArrowLeft className="w-4 h-4" /> {m.back}
          </button>

          <div className="flex flex-col sm:flex-row sm:items-end gap-5 p-5 sm:p-7 rounded-3xl bg-gradient-to-br from-[#10B981]/18 via-[#0B121D] to-[#05080D] border border-[#10B981]/22">
            <div className="w-40 h-40 sm:w-48 sm:h-48 rounded-2xl overflow-hidden bg-[#0F1724] shadow-2xl shrink-0">
              {alb?.coverXl || alb?.cover ? (
                <img
                  src={alb.coverXl || alb.cover}
                  alt={alb.title}
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                  className="w-full h-full object-cover"
                />
              ) : null}
            </div>
            <div className="space-y-2 min-w-0">
              <p className="text-xs font-bold uppercase tracking-wider text-[#34D399]">{m.albumLabel}</p>
              <h1 className="font-display text-2xl sm:text-4xl font-black text-white tracking-tight">
                {alb?.title || m.loadingAlbum}
              </h1>
              <div className="flex flex-wrap items-center gap-1.5 text-sm text-zinc-300">
                {alb?.artist && (
                  <button
                    type="button"
                    onClick={() => {
                      if (isOpenableArtistId(alb.artist?.id)) {
                        openArtistDetail(alb.artist!.id, alb.artist);
                      }
                    }}
                    className={`font-bold text-white ${
                      isOpenableArtistId(alb.artist?.id) ? 'hover:underline cursor-pointer' : ''
                    }`}
                  >
                    {alb.artist.name}
                  </button>
                )}
                {alb?.releaseDate && <span>· {alb.releaseDate.slice(0, 4)}</span>}
                {detail.tracks.length > 0 && (
                  <span className="tabular-nums">
                    · {detail.tracks.length} {detail.tracks.length === 1 ? m.songSingular : m.songsCount}
                  </span>
                )}
              </div>

              <div className="pt-2 flex flex-wrap items-center gap-2.5">
                {detail.tracks.length > 0 && (
                  <button
                    type="button"
                    onClick={() => playTrack(detail.tracks[0], detail.tracks)}
                    className="h-12 px-6 rounded-full bg-gradient-to-r from-[#10B981] to-[#22D3EE] hover:scale-105 text-[#03130E] font-bold text-sm inline-flex items-center gap-2 cursor-pointer shadow-lg transition-transform"
                  >
                    <Play className="w-4 h-4 fill-current" /> {m.playNow}
                  </button>
                )}
                {alb && (
                  <button
                    type="button"
                    onClick={() => {
                      toggleSaveAlbum(alb);
                      showToast(isSaved ? m.albumRemoved : m.albumSaved);
                    }}
                    className={`h-12 px-5 rounded-full border text-sm font-semibold cursor-pointer transition-colors ${
                      isSaved
                        ? 'bg-[#10B981]/15 border-[#10B981] text-[#6EE7B7]'
                        : 'border-white/20 text-white hover:border-white'
                    }`}
                  >
                    {isSaved ? m.saved : m.saveAlbum}
                  </button>
                )}
              </div>
            </div>
          </div>

          {detail.loading ? (
            <div className="py-12 text-center text-sm text-zinc-400">{m.loadingAlbum}</div>
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
            <ArrowLeft className="w-4 h-4" /> {m.back}
          </button>

          <div className="flex flex-col sm:flex-row sm:items-end gap-5 p-5 sm:p-7 rounded-3xl bg-gradient-to-br from-[#10B981]/18 via-[#0B121D] to-[#05080D] border border-[#10B981]/22">
            <div className="w-40 h-40 sm:w-48 sm:h-48 rounded-2xl overflow-hidden bg-[#0F1724] shadow-2xl shrink-0">
              {pl?.cover ? (
                <img
                  src={pl.cover}
                  alt={pl.title}
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                  className="w-full h-full object-cover"
                />
              ) : null}
            </div>
            <div className="space-y-2 min-w-0">
              <p className="text-xs font-bold uppercase tracking-wider text-[#34D399]">{m.playlistLabel}</p>
              <h1 className="font-display text-2xl sm:text-4xl font-black text-white tracking-tight">
                {pl?.title || m.loadingPlaylist}
              </h1>
              {pl?.description && <p className="text-xs text-zinc-400 line-clamp-2">{pl.description}</p>}
              <p className="text-xs text-zinc-300 tabular-nums">
                {pl?.creator || 'Editorial'} · {detail.tracks.length} {m.songsCount}
              </p>

              <div className="pt-2 flex flex-wrap items-center gap-2.5">
                {detail.tracks.length > 0 && (
                  <button
                    type="button"
                    onClick={() => playTrack(detail.tracks[0], detail.tracks)}
                    className="h-12 px-6 rounded-full bg-gradient-to-r from-[#10B981] to-[#22D3EE] hover:scale-105 text-[#03130E] font-bold text-sm inline-flex items-center gap-2 cursor-pointer shadow-lg"
                  >
                    <Play className="w-4 h-4 fill-current" /> {m.playNow}
                  </button>
                )}
                {pl && (
                  <button
                    type="button"
                    onClick={() => {
                      toggleSavePlaylist(pl);
                      showToast(isSaved ? m.playlistRemoved : m.playlistSaved);
                    }}
                    className={`h-12 px-5 rounded-full border text-sm font-semibold cursor-pointer ${
                      isSaved
                        ? 'bg-[#10B981]/15 border-[#10B981] text-[#6EE7B7]'
                        : 'border-white/20 text-white hover:border-white'
                    }`}
                  >
                    {isSaved ? m.inLibrary : m.savePlaylist}
                  </button>
                )}
              </div>
            </div>
          </div>

          {detail.loading ? (
            <div className="py-12 text-center text-sm text-zinc-400">{m.loadingPlaylist}</div>
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
            <ArrowLeft className="w-4 h-4" /> {m.exploreGenres}
          </button>

          <div
            className="p-6 sm:p-8 rounded-3xl border border-white/10"
            style={{
              background: `linear-gradient(135deg, ${detail.genre.color}66 0%, #0B1018 75%)`,
            }}
          >
            <p className="text-xs font-bold uppercase tracking-wider text-white/80">{m.musicGenre}</p>
            <h1 className="font-display text-3xl sm:text-5xl font-black text-white mt-1">
              {detail.genre.name}
            </h1>
            {detail.tracks.length > 0 && (
              <button
                type="button"
                onClick={() => playTrack(detail.tracks[0], detail.tracks)}
                className="mt-4 h-11 px-6 rounded-full bg-gradient-to-r from-[#10B981] to-[#22D3EE] text-[#03130E] font-bold text-sm inline-flex items-center gap-2 cursor-pointer shadow-lg"
              >
                <Play className="w-4 h-4 fill-current" /> {m.playGenreRadio} {detail.genre.name}
              </button>
            )}
          </div>

          {detail.loading ? (
            <div className="py-12 text-center text-sm text-zinc-400">{m.loadingGenre}</div>
          ) : (
            <>
              {renderArtistsCarousel(`${m.artistsOf} ${detail.genre.name}`, detail.artists)}
              <section className="space-y-3">
                <h2 className="font-display text-lg font-bold text-white">
                  {m.hitsOf} {detail.genre.name}
                </h2>
                {renderTrackList(detail.tracks)}
              </section>
            </>
          )}
        </div>
      );
    }

    const art = detail.artist;
    const numLocale =
      musicLang === 'en'
        ? 'en-US'
        : musicLang === 'fr'
        ? 'fr-FR'
        : musicLang === 'zh'
        ? 'zh-CN'
        : musicLang === 'ca'
        ? 'ca-ES'
        : 'es-ES';

    return (
      <div className="space-y-7 animate-fade-in">
        <button
          type="button"
          onClick={() => setDetail(null)}
          className="min-h-10 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-semibold text-zinc-200 inline-flex items-center gap-1.5 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> {m.back}
        </button>

        <div className="flex flex-col sm:flex-row sm:items-end gap-5 p-5 sm:p-7 rounded-3xl bg-gradient-to-br from-[#10B981]/18 via-[#0B121D] to-[#05080D] border border-[#10B981]/22">
          <div className="w-36 h-36 sm:w-44 sm:h-44 rounded-full overflow-hidden bg-[#0F1724] border-2 border-[#10B981]/35 shadow-2xl shrink-0">
            {art?.picture ? (
              <img
                src={art.picture}
                alt={art.name}
                referrerPolicy="no-referrer"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
                className="w-full h-full object-cover"
              />
            ) : null}
          </div>
          <div className="space-y-2 min-w-0">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#34D399]">
              <UserCheck className="w-4 h-4" /> {m.artistVerified}
            </div>
            <h1 className="font-display text-3xl sm:text-5xl font-black text-white tracking-tight">
              {art?.name || m.artistRole}
            </h1>
            {typeof art?.nbFan === 'number' && art.nbFan > 0 && (
              <p className="text-xs sm:text-sm text-zinc-300 tabular-nums">
                {art.nbFan.toLocaleString(numLocale)} {m.monthlyListeners}
              </p>
            )}
            {detail.topTracks.length > 0 && (
              <div className="pt-2 flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => playTrack(detail.topTracks[0], detail.topTracks)}
                  className="h-12 px-6 rounded-full bg-gradient-to-r from-[#10B981] to-[#22D3EE] hover:scale-105 text-[#03130E] font-bold text-sm inline-flex items-center gap-2 cursor-pointer shadow-lg"
                >
                  <Play className="w-4 h-4 fill-current" /> {m.playNow}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const shuffled = [...detail.topTracks].sort(() => Math.random() - 0.5);
                    playTrack(shuffled[0], shuffled);
                  }}
                  className="h-12 px-5 rounded-full border border-white/20 hover:border-white text-white font-semibold text-sm inline-flex items-center gap-2 cursor-pointer"
                >
                  <Shuffle className="w-4 h-4" /> {m.shuffle}
                </button>
              </div>
            )}
          </div>
        </div>

        {detail.loading ? (
          <div className="py-12 text-center text-sm text-zinc-400">{m.loadingArtist}</div>
        ) : (
          <>
            {detail.topTracks.length > 0 && (
              <section className="space-y-3">
                <h2 className="font-display text-lg font-bold text-white">{m.popular}</h2>
                {renderTrackList(detail.topTracks)}
              </section>
            )}
            {renderAlbumsCarousel(m.discography, detail.albums)}
            {renderArtistsCarousel(m.relatedArtists, detail.related)}
          </>
        )}
      </div>
    );
  };

  const radiosToDisplay = radioFilterId !== 'all' ? filteredRadios ?? [] : homeData?.radios ?? [];

  return (
    <div
      className={`min-h-screen w-full bg-[#05080D] flex flex-col lg:flex-row gap-4 lg:gap-6 px-3 sm:px-6 lg:px-8 pt-3 sm:pt-5 ${
        hasBottomBar ? 'pb-28 sm:pb-32' : 'pb-10'
      }`}
    >
      {/* Headless Pure Non-YouTube Audio + WebAudio 8D / Pro Studio DSP Engine */}
      <MusicAudioEngine />

      {/* Desktop Sonic Studio Sidebar */}
      <aside className="hidden lg:flex flex-col w-[264px] shrink-0 gap-3 self-start sticky top-12">
        <div className="rounded-3xl bg-[#0B1018]/92 border border-[#10B981]/20 p-3 space-y-1 shadow-[0_14px_40px_rgba(0,0,0,0.45)]">
          {[
            { id: 'home' as const, label: m.navHome, icon: Home },
            { id: 'search' as const, label: m.navExploreLong, icon: Search },
            { id: 'library' as const, label: m.navLibrary, icon: Library },
            { id: 'radios' as const, label: m.navRadios, icon: Radio },
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
                className={`w-full min-h-11 px-3.5 rounded-2xl flex items-center gap-3 text-sm font-bold cursor-pointer transition-all ${
                  active
                    ? 'bg-gradient-to-r from-[#10B981]/20 to-[#22D3EE]/10 text-white border border-[#10B981]/35'
                    : 'text-zinc-400 hover:text-white hover:bg-white/[0.05]'
                }`}
              >
                <Icon className={`w-5 h-5 ${active ? 'text-[#34D399]' : ''}`} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Library Shortcuts */}
        <div className="rounded-3xl bg-[#0B1018]/92 border border-white/[0.07] p-3 space-y-2 max-h-[44vh] overflow-y-auto no-scrollbar">
          <div className="flex items-center justify-between px-2 pt-1">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
              {m.navLibrary}
            </span>
            <button
              type="button"
              onClick={() => setShowCreatePlaylist(true)}
              title={m.newPlaylist}
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
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#10B981] via-[#14B8A6] to-[#22D3EE] flex items-center justify-center shrink-0">
              <Heart className="w-5 h-5 text-[#03130E] fill-current" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-white truncate">{m.likedSongs}</p>
              <p className="text-[11px] text-zinc-400 tabular-nums">
                {likedTracks.length} {m.songsCount}
              </p>
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
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
                className="w-11 h-11 rounded-xl object-cover shrink-0 bg-[#0F1724]"
              />
              <div className="min-w-0">
                <p className="text-sm font-bold text-white truncate">{pl.name}</p>
                <p className="text-[11px] text-zinc-400 tabular-nums">
                  {m.playlistLabel} · {pl.tracks.length}
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
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
                className="w-11 h-11 rounded-xl object-cover shrink-0"
              />
              <div className="min-w-0">
                <p className="text-sm font-bold text-white truncate">{alb.title}</p>
                <p className="text-[11px] text-zinc-400 truncate">
                  {m.albumLabel} · {alb.artist?.name}
                </p>
              </div>
            </button>
          ))}
        </div>

        {/* Direct APK & PWA Install Card */}
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent('riffan:open-install'))}
          className="rounded-2xl bg-gradient-to-r from-[#10B981]/14 via-[#0B121D] to-[#22D3EE]/12 hover:from-[#10B981]/24 hover:to-[#22D3EE]/20 border border-[#10B981]/25 p-3 flex items-center gap-3 text-left cursor-pointer transition-all"
        >
          <span className="w-9 h-9 rounded-xl bg-[#10B981]/18 text-[#34D399] flex items-center justify-center shrink-0">
            <Download className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold text-white truncate">{m.installAppTitle}</p>
            <p className="text-[11px] text-zinc-400 truncate">{m.installAppSub}</p>
          </div>
        </button>
      </aside>

      {/* Main Immersive Sonic Stage */}
      <div className="flex-1 min-w-0 space-y-6">
        {/* Mobile Compact 4-Column Navigation Bar (Zero clipping on 360px screens) */}
        <nav className="grid grid-cols-4 gap-1.5 lg:hidden" aria-label={m.playerRegionAria}>
          {[
            { id: 'home' as const, label: m.navHome, icon: Home },
            { id: 'search' as const, label: m.navExplore, icon: Search },
            { id: 'library' as const, label: m.navLibrary, icon: Library },
            { id: 'radios' as const, label: m.navRadios, icon: Radio },
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
                className={`min-h-10 px-1.5 rounded-full text-[11px] font-bold inline-flex items-center justify-center gap-1 cursor-pointer transition-all min-w-0 ${
                  active
                    ? 'bg-gradient-to-r from-[#10B981] to-[#22D3EE] text-[#03130E] shadow-[0_6px_18px_rgba(16,185,129,0.35)]'
                    : 'bg-white/[0.07] text-zinc-200 hover:bg-white/[0.12]'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Detail View or Active Tab */}
        {detail ? (
          renderDetailView()
        ) : navTab === 'home' ? (
          <div className="space-y-7 animate-fade-in">
            {/* SPATIAL FULL-BLEED HERO STAGE */}
            <section className="relative rounded-[28px] overflow-hidden border border-[#10B981]/22 bg-[#0A111B] min-h-[240px] sm:min-h-[296px] flex items-end p-5 sm:p-8 shadow-[0_24px_64px_rgba(0,0,0,0.68)]">
              <img
                src={
                  heroSpotlightTrack?.album.coverXl ||
                  heroSpotlightTrack?.album.cover ||
                  spatialHeroCover
                }
                alt=""
                referrerPolicy="no-referrer"
                onError={(e) => {
                  e.currentTarget.src = spatialHeroCover;
                }}
                className="absolute inset-0 w-full h-full object-cover opacity-50 scale-105 blur-[2px] transition-all duration-700 pointer-events-none select-none"
              />
              <div
                aria-hidden="true"
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    'radial-gradient(ellipse 80% 70% at 85% 20%, rgba(16,185,129,0.26), transparent 60%), radial-gradient(ellipse 65% 60% at 20% 90%, rgba(34,211,238,0.16), transparent 55%), linear-gradient(95deg, rgba(5,8,13,0.96) 0%, rgba(5,8,13,0.82) 55%, rgba(5,8,13,0.45) 100%)',
                }}
              />

              <div className="relative z-10 w-full flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-3 max-w-2xl">
                  <p className="text-xs font-bold uppercase tracking-widest text-[#34D399]">
                    {greeting} · {m.spatialAudioLabel} ·{' '}
                    {currentTrack ? m.playingNow : m.worldTrending}
                  </p>
                  <h1 className="font-display text-3xl sm:text-5xl font-black text-white tracking-tight leading-[1.05]">
                    {heroSpotlightTrack ? heroSpotlightTrack.title : 'Riffan Music'}
                  </h1>
                  <p className="text-sm sm:text-base text-zinc-200/90 leading-snug tabular-nums">
                    {heroSpotlightTrack
                      ? `${heroSpotlightTrack.artist.name}${
                          heroSpotlightTrack.album.title ? ` · ${heroSpotlightTrack.album.title}` : ''
                        }${
                          heroSpotlightTrack.durationSec > 0
                            ? ` · ${formatMusicTime(heroSpotlightTrack.durationSec)}`
                            : ''
                        }`
                      : m.heroFallbackSub}
                  </p>

                  <div className="pt-1 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('medium');
                        if (currentTrack && heroSpotlightTrack?.id === currentTrack.id) {
                          togglePlayPause();
                        } else if (heroSpotlightTrack) {
                          playTrack(heroSpotlightTrack, heroPool.length > 0 ? heroPool : [heroSpotlightTrack]);
                        }
                      }}
                      className="h-11 sm:h-12 px-6 rounded-full bg-gradient-to-r from-[#10B981] via-[#14B8A6] to-[#22D3EE] hover:scale-[1.03] text-[#03130E] font-bold text-sm inline-flex items-center justify-center gap-2 cursor-pointer shadow-[0_10px_28px_rgba(16,185,129,0.4)] transition-transform whitespace-nowrap"
                    >
                      {currentTrack && heroSpotlightTrack?.id === currentTrack.id && isPlaying ? (
                        <>
                          <Pause className="w-4 h-4 fill-current" /> {m.pause}
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4 fill-current ml-0.5" /> {m.playNow}
                        </>
                      )}
                    </button>

                    <div className="grid grid-cols-3 sm:flex items-center gap-1.5 sm:gap-2">
                      {heroPool.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            triggerHaptic('light');
                            const shuffled = [...heroPool].sort(() => Math.random() - 0.5);
                            playTrack(shuffled[0], shuffled);
                          }}
                          className="h-10 sm:h-12 px-2.5 sm:px-5 rounded-full bg-white/[0.1] hover:bg-white/[0.18] border border-white/15 text-white font-semibold text-[11px] sm:text-sm inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors min-w-0"
                        >
                          <Shuffle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#22D3EE] shrink-0" />
                          <span className="truncate">{m.shuffleMix}</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic('medium');
                          toggleSpatial8d();
                        }}
                        aria-pressed={spatial8dEnabled}
                        className={`h-10 sm:h-12 px-2.5 sm:px-4 rounded-full font-bold text-[11px] sm:text-sm inline-flex items-center justify-center gap-1.5 cursor-pointer transition-all min-w-0 ${
                          spatial8dEnabled
                            ? 'bg-gradient-to-r from-[#10B981] to-[#22D3EE] text-[#03130E] shadow-[0_8px_24px_rgba(16,185,129,0.42)]'
                            : 'bg-white/[0.06] hover:bg-white/[0.14] border border-white/10 text-zinc-200 hover:text-white'
                        }`}
                      >
                        <Headphones className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 ${spatial8dEnabled ? 'text-[#03130E]' : 'text-[#22D3EE]'}`} />
                        <span className="truncate">{m.spatial8dBtn}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setNavTab('radios')}
                        className="h-10 sm:h-12 px-2.5 sm:px-4 rounded-full bg-white/[0.06] hover:bg-white/[0.14] border border-white/10 text-zinc-200 hover:text-white font-semibold text-[11px] sm:text-sm inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors min-w-0"
                      >
                        <Radio className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#34D399] shrink-0" />
                        <span className="truncate">{m.radios247}</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Floating Spotlight Cover Card on Desktop */}
                {heroSpotlightTrack?.album.coverXl && (
                  <div className="hidden md:flex items-center gap-4 shrink-0">
                    <div className="relative w-36 h-36 lg:w-44 lg:h-44 rounded-2xl overflow-hidden border border-white/20 shadow-[0_22px_50px_rgba(0,0,0,0.85)] rotate-2 hover:rotate-0 transition-transform duration-500">
                      <img
                        src={heroSpotlightTrack.album.coverXl}
                        alt={heroSpotlightTrack.title}
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* INTERACTIVE GLOBAL REGION, PLATFORM & MOOD STRIP */}
            <HorizontalRail compact gapClassName="gap-2">
              {moodFilters.map((mood) => {
                const selected = activeMood === mood.id;
                return (
                  <button
                    key={mood.id}
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setActiveMood(mood.id);
                    }}
                    className={`min-h-10 px-4 rounded-full text-xs font-bold cursor-pointer transition-all whitespace-nowrap shrink-0 snap-start ${
                      selected
                        ? 'bg-gradient-to-r from-[#10B981] to-[#22D3EE] text-[#03130E] shadow-[0_6px_18px_rgba(16,185,129,0.32)]'
                        : 'bg-white/[0.06] hover:bg-white/[0.12] text-zinc-200 border border-white/[0.06]'
                    }`}
                  >
                    {mood.label}
                  </button>
                );
              })}
            </HorizontalRail>

            {homeLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-16 rounded-2xl bg-white/[0.05] border border-white/[0.04]" />
                ))}
              </div>
            ) : homeData ? (
              activeMoodSelection ? (
                <section className="space-y-5 animate-fade-in">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-3xl bg-gradient-to-r from-[#10B981]/18 via-[#0B121D] to-[#0A1018] border border-[#10B981]/25">
                    <div className="flex items-center gap-4 min-w-0">
                      <img
                        src={activeMoodSelection.cover}
                        alt={activeMoodSelection.title}
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                        className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover shrink-0 shadow-lg"
                      />
                      <div className="min-w-0">
                        <h2 className="font-display text-xl sm:text-2xl font-black text-white truncate">
                          {activeMoodSelection.title}
                        </h2>
                        <p className="text-xs sm:text-sm text-zinc-300 truncate">
                          {activeMoodSelection.subtitle}
                        </p>
                      </div>
                    </div>
                    {activeMoodSelection.tracks.length > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          playTrack(activeMoodSelection.tracks[0], activeMoodSelection.tracks)
                        }
                        className="h-11 px-5 rounded-full bg-gradient-to-r from-[#10B981] to-[#22D3EE] text-[#03130E] font-bold text-xs inline-flex items-center gap-2 cursor-pointer shrink-0 shadow-lg whitespace-nowrap"
                      >
                        <Play className="w-4 h-4 fill-current" /> {m.playSelection}
                      </button>
                    )}
                  </div>
                  {renderTrackList(activeMoodSelection.tracks)}
                </section>
              ) : (
                <>
                  {renderQuickMixes()}
                  {renderTrackCardsCarousel(m.secYtmHits, homeData.youtubeMusicHits, m.secYtmHits)}
                  {renderAlbumsCarousel(m.secYtmAlbums, homeData.youtubeMusicAlbums)}
                  {renderTrackCardsCarousel(m.secSpotifyHits, homeData.spotifyHits, m.secSpotifyHits)}
                  {renderAlbumsCarousel(m.secSpotifyAlbums, homeData.spotifyAlbums)}
                  {renderTrackCardsCarousel(m.secSpainHits, homeData.spainHits, m.secSpainHits)}
                  {renderTrackCardsCarousel(m.secMorocco, homeData.moroccoMix, m.secMorocco)}
                  {renderTrackCardsCarousel(m.secArab, homeData.arabMix, m.secArab)}
                  {renderTrackCardsCarousel(m.secAfrica, homeData.africaMix, m.secAfrica)}
                  {renderTrackCardsCarousel(m.secRussia, homeData.russiaMix, m.secRussia)}
                  {renderTrackCardsCarousel(m.secRomania, homeData.romaniaMix, m.secRomania)}
                  {renderTrackCardsCarousel(m.secChina, homeData.chinaMix, m.secChina)}
                  {renderTrackCardsCarousel(m.secUsa, homeData.usaMix, m.secUsa)}
                  {renderTrackCardsCarousel(m.secLatin, homeData.latinSalsaMix, m.secLatin)}
                  {renderAlbumsCarousel(m.secNewReleases, homeData.newReleases)}
                  {renderArtistsCarousel(m.secTopArtists, homeData.topArtists)}
                  {renderTrackCardsCarousel(m.secTop50, homeData.topTracks, m.secTop50)}
                  {renderTrackCardsCarousel(m.secUrbano, homeData.urbanoMix, m.secUrbano)}
                  {renderTrackCardsCarousel(m.secPop, homeData.popMix, m.secPop)}
                  {renderTrackCardsCarousel(m.secChill, homeData.chillLofiMix, m.secChill)}
                  {renderTrackCardsCarousel(m.secRock, homeData.rockIndieMix, m.secRock)}
                  {renderTrackCardsCarousel(m.secFlamenco, homeData.flamencoAcousticMix, m.secFlamenco)}
                  {renderTrackCardsCarousel(m.secAudius, homeData.audiusTrending, m.secAudius)}
                  {renderTrackCardsCarousel(m.secRnb, homeData.rnbSoulMix, m.secRnb)}
                  {renderTrackCardsCarousel(m.secSoundtrack, homeData.soundtrackMix, m.secSoundtrack)}
                  {renderTrackCardsCarousel(m.secClassics, homeData.classicsMix, m.secClassics)}
                  {renderAlbumsCarousel(m.secTopAlbums, homeData.topAlbums)}
                  {renderPlaylistsCarousel(m.secEditorialPlaylists, homeData.editorialPlaylists)}
                  {renderTrackCardsCarousel(m.secElectronic, homeData.electronicMix, m.secElectronic)}
                </>
              )
            ) : (
              <div className="py-16 text-center text-sm text-zinc-400">{m.catalogLoadError}</div>
            )}
          </div>
        ) : navTab === 'search' ? (
          <div className="space-y-6 animate-fade-in">
            <div className="relative">
              <Search className="w-5 h-5 text-[#34D399] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={localSearchQuery}
                onChange={(e) => setLocalSearchQuery(e.target.value)}
                placeholder={m.searchPlaceholder}
                className="w-full h-12 sm:h-13 pl-12 pr-12 rounded-2xl bg-[#0B1018] border border-white/12 focus:border-[#10B981] text-sm sm:text-base text-white placeholder:text-zinc-500 outline-none transition-colors"
              />
              {localSearchQuery && (
                <button
                  type="button"
                  onClick={() => setLocalSearchQuery('')}
                  aria-label={m.clearSearch}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {searchLoading ? (
              <div className="py-16 text-center text-sm text-zinc-400">{m.searchingWorld}</div>
            ) : searchResults ? (
              <div className="space-y-7">
                {searchResults.tracks.length === 0 &&
                searchResults.artists.length === 0 &&
                searchResults.albums.length === 0 &&
                searchResults.radios.length === 0 ? (
                  <div className="py-14 text-center rounded-3xl bg-[#0B1018] border border-white/[0.06]">
                    <p className="text-base font-bold text-white">
                      {m.noResultsTitle} “{localSearchQuery}”
                    </p>
                    <p className="text-xs text-zinc-400 mt-1">{m.noResultsSub}</p>
                  </div>
                ) : (
                  <>
                    {searchResults.tracks.length > 0 && (
                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                        <div className="lg:col-span-5 space-y-2.5">
                          <h2 className="font-display text-lg font-bold text-white">{m.topResult}</h2>
                          <button
                            type="button"
                            onClick={() => {
                              const top = searchResults.tracks[0];
                              playTrack(top, searchResults.tracks);
                            }}
                            className="group w-full p-5 rounded-3xl bg-gradient-to-br from-[#10B981]/18 via-[#0C141F] to-[#070B12] hover:border-[#10B981]/45 border border-white/[0.08] text-left cursor-pointer transition-all relative overflow-hidden"
                          >
                            <img
                              src={searchResults.tracks[0].album.coverXl || searchResults.tracks[0].album.cover}
                              alt={searchResults.tracks[0].title}
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                              }}
                              className="w-24 h-24 rounded-2xl object-cover shadow-xl mb-4"
                            />
                            <h3 className="font-display text-2xl font-black text-white truncate">
                              {searchResults.tracks[0].title}
                            </h3>
                            <p className="text-sm text-zinc-300 mt-1 truncate">
                              {m.songSingular} · {searchResults.tracks[0].artist.name}
                            </p>
                            <span className="absolute right-5 bottom-5 w-12 h-12 rounded-full bg-gradient-to-br from-[#10B981] to-[#22D3EE] text-[#03130E] flex items-center justify-center shadow-[0_8px_24px_rgba(16,185,129,0.4)] group-hover:scale-105 transition-transform">
                              <Play className="w-5 h-5 fill-current ml-0.5" />
                            </span>
                          </button>
                        </div>

                        <div className="lg:col-span-7 space-y-2.5">
                          <h2 className="font-display text-lg font-bold text-white">{m.songsSection}</h2>
                          <div className="rounded-2xl bg-[#0B1018] border border-white/[0.06] p-2">
                            {renderTrackList(searchResults.tracks.slice(0, 6))}
                          </div>
                        </div>
                      </div>
                    )}

                    {renderArtistsCarousel(m.artistsSection, searchResults.artists)}
                    {renderAlbumsCarousel(m.albumsSection, searchResults.albums)}
                    {renderPlaylistsCarousel(m.playlistsSection, searchResults.playlists)}

                    {searchResults.radios.length > 0 && (
                      <section className="space-y-3">
                        <h2 className="font-display text-lg font-bold text-white">{m.navRadios}</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {searchResults.radios.slice(0, 9).map((station) => {
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
                                className={`p-3 rounded-2xl border flex items-center gap-3 text-left cursor-pointer transition-all ${
                                  active
                                    ? 'bg-[#10B981]/16 border-[#10B981]/60'
                                    : 'bg-[#0B1018] hover:bg-[#121A26] border-white/[0.06]'
                                }`}
                              >
                                <div className="w-12 h-12 rounded-xl overflow-hidden bg-[#101826] border border-white/10 shrink-0 flex items-center justify-center">
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
                                  ) : (
                                    <Radio className="w-5 h-5 text-[#22D3EE]" />
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className={`text-sm font-bold truncate ${active ? 'text-[#34D399]' : 'text-white'}`}>
                                    {station.name}
                                  </p>
                                  <p className="text-xs text-zinc-400 truncate">{station.country}</p>
                                </div>
                                <span className="w-9 h-9 rounded-full bg-gradient-to-br from-[#10B981] to-[#22D3EE] text-[#03130E] flex items-center justify-center shrink-0">
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
                      </section>
                    )}

                    {searchResults.tracks.length > 6 && (
                      <section className="space-y-3">
                        <h2 className="font-display text-lg font-bold text-white">{m.moreResults}</h2>
                        {renderTrackList(searchResults.tracks.slice(6))}
                      </section>
                    )}
                  </>
                )}
              </div>
            ) : (
              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-[#22D3EE]" />
                  <h2 className="font-display text-lg sm:text-xl font-bold text-white">
                    {m.exploreByGenre}
                  </h2>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {(homeData?.genres || []).map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => openGenreDetail(g)}
                      style={{
                        background: `linear-gradient(135deg, ${g.color} 0%, #09111B 115%)`,
                      }}
                      className="group relative h-28 sm:h-32 rounded-2xl p-4 text-left overflow-hidden cursor-pointer border border-white/10 shadow-lg hover:brightness-110 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#10B981]"
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
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
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
              <h1 className="font-display text-2xl sm:text-3xl font-black text-white">{m.radiosTitle}</h1>
              <p className="text-xs sm:text-sm text-zinc-400 mt-1">{m.radiosSub}</p>
            </div>

            <HorizontalRail compact gapClassName="gap-2">
              {RADIO_FILTERS.map((rt) => {
                const selected = radioFilterId === rt.id;
                return (
                  <button
                    key={rt.id}
                    type="button"
                    onClick={() => setRadioFilterId(rt.id)}
                    className={`min-h-10 px-4 rounded-full text-xs font-bold cursor-pointer transition-all whitespace-nowrap shrink-0 snap-start ${
                      selected
                        ? 'bg-gradient-to-r from-[#10B981] to-[#22D3EE] text-[#03130E] shadow-[0_6px_18px_rgba(16,185,129,0.32)]'
                        : 'bg-white/[0.07] hover:bg-white/[0.12] text-zinc-200'
                    }`}
                  >
                    {m[rt.labelKey]}
                  </button>
                );
              })}
            </HorizontalRail>

            {radiosLoading ? (
              <div className="py-12 text-center text-sm text-zinc-400">{m.tuningRadios}</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {radiosToDisplay.map((station) => {
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
                          ? 'bg-[#10B981]/16 border-[#10B981]/60'
                          : 'bg-[#0B1018] hover:bg-[#121A26] border-white/[0.06]'
                      }`}
                    >
                      <div className="w-14 h-14 rounded-xl overflow-hidden bg-[#101826] border border-white/10 shrink-0 flex items-center justify-center relative">
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
                        <Radio className="w-6 h-6 text-[#22D3EE] -z-10" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-bold truncate ${active ? 'text-[#34D399]' : 'text-white'}`}>
                          {station.name}
                        </p>
                        <p className="text-xs text-zinc-400 truncate mt-0.5">
                          {station.country} · {station.tags.join(' · ')}
                        </p>
                        <p className="text-[11px] text-zinc-500 mt-0.5 tabular-nums">
                          {station.codec || 'MP3'} {station.bitrate ? `${station.bitrate} kbps` : ''}
                        </p>
                      </div>
                      <span className="w-10 h-10 rounded-full bg-gradient-to-br from-[#10B981] to-[#22D3EE] text-[#03130E] flex items-center justify-center shrink-0 shadow-[0_6px_16px_rgba(16,185,129,0.32)]">
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
            )}
          </div>
        ) : (
          <div className="space-y-7 animate-fade-in">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h1 className="font-display text-2xl sm:text-3xl font-black text-white">{m.libraryTitle}</h1>
                <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">{m.librarySub}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreatePlaylist(true)}
                className="h-10 px-4 rounded-full bg-gradient-to-r from-[#10B981] to-[#22D3EE] text-[#03130E] font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-4 h-4" /> {m.newPlaylist}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setDetail({ kind: 'liked' })}
                className="p-4 rounded-2xl bg-gradient-to-br from-[#10B981]/22 to-[#0B121D] border border-[#10B981]/25 flex items-center gap-3.5 text-left cursor-pointer hover:border-[#10B981]/60"
              >
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#10B981] via-[#14B8A6] to-[#22D3EE] flex items-center justify-center shrink-0">
                  <Heart className="w-7 h-7 text-[#03130E] fill-current" />
                </div>
                <div>
                  <p className="text-base font-bold text-white">{m.likedSongs}</p>
                  <p className="text-xs text-zinc-300 tabular-nums">
                    {likedTracks.length} {m.songsCount}
                  </p>
                </div>
              </button>

              {userPlaylists.map((pl) => (
                <button
                  key={pl.id}
                  type="button"
                  onClick={() => setDetail({ kind: 'user_playlist', playlistId: pl.id })}
                  className="p-4 rounded-2xl bg-[#0B1018] hover:bg-[#121A26] border border-white/[0.08] flex items-center gap-3.5 text-left cursor-pointer"
                >
                  <img
                    src={pl.tracks[0]?.album.cover || mixHeroCover}
                    alt={pl.name}
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                    className="w-14 h-14 rounded-xl object-cover shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-base font-bold text-white truncate">{pl.name}</p>
                    <p className="text-xs text-zinc-400 tabular-nums">
                      {pl.tracks.length} {m.songsCount}
                    </p>
                  </div>
                </button>
              ))}
            </div>

            {savedAlbums.length > 0 && renderAlbumsCarousel(m.savedAlbumsTitle, savedAlbums)}
            {savedPlaylists.length > 0 && renderPlaylistsCarousel(m.savedPlaylistsTitle, savedPlaylists)}

            {recentTracks.length > 0 && (
              <section className="space-y-3">
                <h2 className="font-display text-lg font-bold text-white">{m.recentlyPlayed}</h2>
                {renderTrackList(recentTracks.slice(0, 15))}
              </section>
            )}
          </div>
        )}
      </div>

      {/* Queue Drawer */}
      {showQueueDrawer && (
        <aside className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-sm bg-[#070C14]/98 backdrop-blur-2xl border-l border-[#10B981]/20 p-5 flex flex-col gap-4 shadow-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ListMusic className="w-5 h-5 text-[#34D399]" />
              <h3 className="font-display text-base font-bold text-white">{m.queueTitle}</h3>
            </div>
            <button
              type="button"
              onClick={() => setShowQueueDrawer(false)}
              className="w-10 h-10 rounded-full hover:bg-white/10 text-zinc-300 flex items-center justify-center cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto space-y-1.5 no-scrollbar">
            {queue.length === 0 ? (
              <p className="text-xs text-zinc-500 py-8 text-center">{m.queueEmpty}</p>
            ) : (
              queue.map((t, idx) => {
                const active = idx === queueIndex;
                return (
                  <div
                    key={`${t.id}-q-${idx}`}
                    className={`flex items-center gap-2.5 p-2 rounded-xl ${
                      active ? 'bg-[#10B981]/16 border border-[#10B981]/40' : 'hover:bg-white/[0.05]'
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
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                        className="w-10 h-10 rounded-lg object-cover shrink-0"
                      />
                      <div className="min-w-0">
                        <p className={`text-xs font-bold truncate ${active ? 'text-[#34D399]' : 'text-white'}`}>
                          {t.title}
                        </p>
                        <p className="text-[11px] text-zinc-400 truncate">{t.artist.name}</p>
                      </div>
                    </button>
                    {!active && (
                      <button
                        type="button"
                        onClick={() => removeFromQueue(idx)}
                        className="w-8 h-8 rounded-full text-zinc-500 hover:text-rose-400 flex items-center justify-center cursor-pointer"
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
              showToast(m.playlistCreated);
            }}
            className="w-full max-w-sm rounded-3xl bg-[#090F18] border border-[#10B981]/25 p-6 space-y-4 shadow-2xl"
          >
            <h3 className="font-display text-lg font-bold text-white">{m.createPlaylistTitle}</h3>
            <input
              type="text"
              autoFocus
              value={newPlaylistName}
              onChange={(e) => setNewPlaylistName(e.target.value)}
              placeholder={m.createPlaylistPlaceholder}
              className="w-full h-11 px-4 rounded-xl bg-white/[0.06] border border-white/15 focus:border-[#10B981] text-sm text-white outline-none"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreatePlaylist(false)}
                className="h-10 px-4 rounded-full text-xs font-semibold text-zinc-300 hover:text-white cursor-pointer"
              >
                {m.cancel}
              </button>
              <button
                type="submit"
                className="h-10 px-5 rounded-full bg-gradient-to-r from-[#10B981] to-[#22D3EE] text-[#03130E] text-xs font-bold cursor-pointer"
              >
                {m.create}
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
            className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl bg-[#090F18] border border-[#10B981]/25 p-5 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-white truncate pr-3">
                {m.addTrackPrefix} “{playlistPickerTrack.title}”
              </h3>
              <button
                type="button"
                onClick={() => setPlaylistPickerTrack(null)}
                className="w-9 h-9 rounded-full hover:bg-white/10 text-zinc-400 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowCreatePlaylist(true)}
              className="w-full h-11 px-4 rounded-2xl bg-[#10B981]/15 border border-[#10B981]/40 text-sm font-bold text-[#6EE7B7] flex items-center gap-2 cursor-pointer"
            >
              <Plus className="w-4 h-4" /> {m.createNewPlaylistBtn}
            </button>

            <div className="space-y-1.5 max-h-60 overflow-y-auto no-scrollbar">
              {userPlaylists.map((pl) => (
                <button
                  key={pl.id}
                  type="button"
                  onClick={() => {
                    addTrackToUserPlaylist(pl.id, playlistPickerTrack);
                    showToast(`${m.addedToPlaylist} ${pl.name}`);
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
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-gradient-to-r from-[#10B981] to-[#22D3EE] text-[#03130E] text-xs font-bold shadow-[0_8px_24px_rgba(16,185,129,0.42)] pointer-events-none">
          {toastMsg}
        </div>
      )}

      {/* Persistent Sonic Player Bar, Full Screen Lyrics/NowPlaying Modal & EQ Modal */}
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
