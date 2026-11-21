import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpDown,
  Car,
  Check,
  Disc3,
  Download,
  FileSpreadsheet,
  FolderDown,
  Grid,
  Headphones,
  Heart,
  Home,
  LayoutList,
  Library,
  ListPlus,
  Loader2,
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
  HomeMoodFilterId,
  MusicAlbumRef,
  MusicArtistRef,
  MusicDetailView,
  MusicGenre,
  MusicHomePayload,
  MusicPlaylist,
  MusicRadioStation,
  MusicSearchFilter,
  MusicTrack,
} from '../../types/music';
import { useMusicStore } from '../../store/useMusicStore';
import { triggerHaptic } from '../../utils/haptics';
import { useBackInterceptor } from '../../lib/backInterceptor';
import { getStoredProfile } from '../../utils/storage';
import { buildExportifyCsvFromTracks } from '../../services/musicImporter';
import {
  removeTrackFromOfflineLibrary,
  saveTrackToOfflineLibrary,
  startDownloadMp3Job,
} from './MusicAudioEngine';
import { formatMusicTime } from './SpotifyPlayerBar';
import { HorizontalRail } from './HorizontalRail';
import { MUSIC_I18N, MUSIC_LANGUAGES, type MusicCopy } from './musicI18n';
import { MUSIC_IMPORT_PROMPT_SEEN_KEY } from './SpotifyYtmImportModal';
import { CoverArt } from './CoverArt';
import { RiffanMusicLogo } from './RiffanMusicLogo';

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

const RADIO_CARD_SURFACES = [
  'from-[#1E293B] via-[#13192B] to-[#0B0F1A]',
  'from-[#2E1A47] via-[#1A1330] to-[#0C0C14]',
  'from-[#132A4A] via-[#0F1E36] to-[#090F1B]',
  'from-[#1B2D38] via-[#121D26] to-[#0A0E14]',
  'from-[#281E42] via-[#171329] to-[#0C0C12]',
  'from-[#1A2639] via-[#111927] to-[#090D15]',
];

function isOpenableArtistId(id?: string): boolean {
  return Boolean(id && /^\d+$/.test(id));
}

function isOpenableAlbumId(id?: string): boolean {
  return Boolean(
    id && (/^\d+$/.test(id) || id.startsWith('ytm-MPREb_') || id.startsWith('it-alb-'))
  );
}

function downloadExportifyCsv(name: string, tracks: MusicTrack[]) {
  const csv = buildExportifyCsvFromTracks(name, tracks);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name.replace(/[^a-zA-Z0-9_-]+/g, '_') || 'riffan_music'}_exportify.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const PlaylistCollageArt: React.FC<{
  tracks: MusicTrack[];
  title: string;
  sizeClassName?: string;
}> = ({ tracks, title, sizeClassName = 'w-12 h-12 rounded-xl' }) => {
  const covers = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const t of tracks) {
      const c = t.album?.cover || '';
      if (c && !seen.has(c)) {
        seen.add(c);
        list.push(c);
        if (list.length >= 4) break;
      }
    }
    return list;
  }, [tracks]);

  if (covers.length >= 4) {
    return (
      <div className={`grid grid-cols-2 grid-rows-2 overflow-hidden bg-[#131318] shrink-0 ${sizeClassName}`}>
        {covers.slice(0, 4).map((src, i) => (
          <CoverArt key={i} src={src} alt={title} fallbackLabel={title} className="w-full h-full object-cover" />
        ))}
      </div>
    );
  }

  return (
    <CoverArt
      src={covers[0] || mixHeroCover}
      alt={title}
      fallbackLabel={title}
      className={`object-cover shrink-0 ${sizeClassName}`}
    />
  );
};

const TrackRow: React.FC<{
  track: MusicTrack;
  index: number;
  isActive: boolean;
  isPlaying: boolean;
  isLiked: boolean;
  isOffline: boolean;
  onPlay: () => void;
  onToggleLike: () => void;
  onAddToQueue: () => void;
  onOpenPlaylistPicker: () => void;
  onDownloadMp3: () => void;
  onToggleOffline: () => void;
  onOpenSettings: () => void;
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
  isOffline,
  onPlay,
  onToggleLike,
  onAddToQueue,
  onOpenPlaylistPicker,
  onDownloadMp3,
  onToggleOffline,
  onOpenSettings,
  onOpenArtist,
  onOpenAlbum,
  extraRightAction,
  copy,
}) => (
  <div
    className={`group flex items-center gap-2 sm:gap-3 px-2 sm:px-3 py-2 rounded-xl transition-colors ${
      isActive ? 'bg-[#3B82F6]/14 border border-[#3B82F6]/30' : 'hover:bg-white/[0.05]'
    }`}
  >
    <button
      type="button"
      onClick={onPlay}
      aria-label={`${copy.playNow} ${track.title}`}
      className="hidden sm:flex w-7 h-10 items-center justify-center shrink-0 cursor-pointer text-xs font-semibold tabular-nums text-zinc-400 group-hover:text-white rounded-lg"
    >
      {isActive && isPlaying ? (
        <span className="flex items-end gap-[2px] h-3.5" aria-hidden="true">
          <span className="w-[3px] bg-[#3B82F6] rounded-full h-full" />
          <span className="w-[3px] bg-[#60A5FA] rounded-full h-2/3" />
          <span className="w-[3px] bg-[#93C5FD] rounded-full h-4/5" />
        </span>
      ) : (
        <>
          <span className={`group-hover:hidden ${isActive ? 'text-[#60A5FA]' : ''}`}>
            {index + 1}
          </span>
          <Play className="w-3.5 h-3.5 fill-current hidden group-hover:block text-white" />
        </>
      )}
    </button>

    <button
      type="button"
      onClick={onPlay}
      className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer min-h-11"
    >
      <div className="w-11 h-11 rounded-lg overflow-hidden bg-[#1B1B22] shrink-0">
        <CoverArt
          src={track.album.cover}
          alt={track.title}
          fallbackLabel={track.artist.name}
          className="w-full h-full object-cover"
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-semibold truncate leading-snug ${isActive ? 'text-[#60A5FA]' : 'text-white'}`}>
          {track.title}
        </p>
        <div className="flex items-center gap-1.5 text-xs text-zinc-400 truncate mt-0.5">
          {track.explicit && (
            <span className="px-1 rounded bg-white/15 text-zinc-200 text-[9px] font-bold leading-tight shrink-0">
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
        className="hidden md:block w-[22%] text-left text-xs text-zinc-400 hover:text-white hover:underline truncate cursor-pointer"
      >
        {track.album.title}
      </button>
    )}

    <div className="flex items-center gap-0.5 shrink-0">
      <button
        type="button"
        onClick={onToggleLike}
        aria-label={isLiked ? copy.likeRemove : copy.likeAdd}
        className={`w-10 h-10 rounded-full flex items-center justify-center cursor-pointer transition-colors ${
          isLiked ? 'text-[#FF2D55]' : 'text-zinc-400 hover:text-white'
        }`}
      >
        <Heart className={`w-4 h-4 ${isLiked ? 'fill-current' : ''}`} />
      </button>

      <button
        type="button"
        onClick={onOpenPlaylistPicker}
        title={copy.addToPlaylist}
        aria-label={copy.addToPlaylist}
        className="w-10 h-10 rounded-full flex items-center justify-center text-zinc-400 hover:text-white cursor-pointer transition-colors"
      >
        <Plus className="w-4 h-4" />
      </button>

      <button
        type="button"
        onClick={onAddToQueue}
        title={copy.addToQueue}
        aria-label={copy.addToQueue}
        className="hidden sm:flex w-9 h-9 rounded-full items-center justify-center text-zinc-400 hover:text-white cursor-pointer"
      >
        <ListPlus className="w-4 h-4" />
      </button>

      <button
        type="button"
        onClick={onToggleOffline}
        title={isOffline ? copy.savedOfflineBadge : copy.saveOfflineBtn}
        aria-label={isOffline ? copy.savedOfflineBadge : copy.saveOfflineBtn}
        className={`hidden sm:flex w-9 h-9 rounded-full items-center justify-center cursor-pointer ${
          isOffline ? 'text-[#60A5FA]' : 'text-zinc-400 hover:text-white'
        }`}
      >
        {isOffline ? <Check className="w-4 h-4" /> : <FolderDown className="w-4 h-4" />}
      </button>

      <button
        type="button"
        onClick={onDownloadMp3}
        title={copy.downloadMp3Btn}
        aria-label={copy.downloadMp3Btn}
        className="hidden md:flex w-9 h-9 rounded-full items-center justify-center text-zinc-400 hover:text-[#60A5FA] cursor-pointer"
      >
        <Download className="w-4 h-4" />
      </button>

      <button
        type="button"
        onClick={onOpenSettings}
        title={copy.studioTitle}
        aria-label={copy.studioTitle}
        className="hidden md:flex w-9 h-9 rounded-full items-center justify-center text-zinc-400 hover:text-[#60A5FA] cursor-pointer"
      >
        <Sliders className="w-4 h-4" />
      </button>

      {extraRightAction}

      <span className="hidden sm:inline w-10 text-right text-xs text-zinc-400 tabular-nums">
        {formatMusicTime(track.durationSec)}
      </span>
    </div>
  </div>
);

export const RiffanMusicWorldView: React.FC<RiffanMusicWorldViewProps> = ({
  externalSearchQuery = '',
}) => {
  const storedProfile = useMemo(() => getStoredProfile(), []);
  const userInitial = (storedProfile.name || 'R').slice(0, 1).toUpperCase();

  const navTab = useMusicStore((s) => s.musicNavTab);
  const setNavTab = useMusicStore((s) => s.setMusicNavTab);
  const activeMood = useMusicStore((s) => s.musicActiveMood);
  const setActiveMood = useMusicStore((s) => s.setMusicActiveMood);
  const detailStack = useMusicStore((s) => s.musicDetailStack);
  const pushMusicDetail = useMusicStore((s) => s.pushMusicDetail);
  const replaceTopMusicDetail = useMusicStore((s) => s.replaceTopMusicDetail);
  const popMusicDetail = useMusicStore((s) => s.popMusicDetail);
  const clearMusicDetailStack = useMusicStore((s) => s.clearMusicDetailStack);
  const searchQuery = useMusicStore((s) => s.musicSearchQuery);
  const setSearchQuery = useMusicStore((s) => s.setMusicSearchQuery);
  const searchFilter = useMusicStore((s) => s.musicSearchFilter);
  const setSearchFilter = useMusicStore((s) => s.setMusicSearchFilter);
  const searchResults = useMusicStore((s) => s.musicSearchResults);
  const setSearchResults = useMusicStore((s) => s.setMusicSearchResults);
  const radioFilterId = useMusicStore((s) => s.musicRadioFilterId);
  const setRadioFilterId = useMusicStore((s) => s.setMusicRadioFilterId);

  const currentTrack = useMusicStore((s) => s.currentTrack);
  const activeRadio = useMusicStore((s) => s.activeRadio);
  const isPlaying = useMusicStore((s) => s.isPlaying);
  const likedTracks = useMusicStore((s) => s.likedTracks);
  const savedAlbums = useMusicStore((s) => s.savedAlbums);
  const savedPlaylists = useMusicStore((s) => s.savedPlaylists);
  const userPlaylists = useMusicStore((s) => s.userPlaylists);
  const recentTracks = useMusicStore((s) => s.recentTracks);
  const searchHistory = useMusicStore((s) => s.searchHistory);
  const offlineTrackIds = useMusicStore((s) => s.offlineTrackIds);
  const listeningStats = useMusicStore((s) => s.listeningStats);
  const tasteProfile = useMusicStore((s) => s.tasteProfile);
  const musicLang = useMusicStore((s) => s.musicLang);
  const setMusicLang = useMusicStore((s) => s.setMusicLang);
  const setPlaylistPickerTrack = useMusicStore((s) => s.setPlaylistPickerTrack);
  const setShowCreatePlaylistModal = useMusicStore((s) => s.setShowCreatePlaylistModal);
  const setShowImportModal = useMusicStore((s) => s.setShowImportModal);
  const setShowEqModal = useMusicStore((s) => s.setShowEqModal);
  const setShowDownloadDrawer = useMusicStore((s) => s.setShowDownloadDrawer);
  const setDriveModeOpen = useMusicStore((s) => s.setDriveModeOpen);
  const showToast = useMusicStore((s) => s.showMusicToast);

  const playTrack = useMusicStore((s) => s.playTrack);
  const playRadio = useMusicStore((s) => s.playRadio);
  const togglePlayPause = useMusicStore((s) => s.togglePlayPause);
  const addToQueue = useMusicStore((s) => s.addToQueue);
  const toggleLikeTrack = useMusicStore((s) => s.toggleLikeTrack);
  const toggleSaveAlbum = useMusicStore((s) => s.toggleSaveAlbum);
  const toggleSavePlaylist = useMusicStore((s) => s.toggleSavePlaylist);
  const deleteUserPlaylist = useMusicStore((s) => s.deleteUserPlaylist);
  const removeTrackFromUserPlaylist = useMusicStore((s) => s.removeTrackFromUserPlaylist);
  const addSearchHistory = useMusicStore((s) => s.addSearchHistory);
  const removeSearchHistory = useMusicStore((s) => s.removeSearchHistory);
  const clearSearchHistory = useMusicStore((s) => s.clearSearchHistory);

  const m = MUSIC_I18N[musicLang];
  const detail: MusicDetailView | null =
    detailStack.length > 0 ? detailStack[detailStack.length - 1] : null;

  const [homeData, setHomeData] = useState<MusicHomePayload | null>(null);
  const [homeLoading, setHomeLoading] = useState<boolean>(true);
  const [filteredRadios, setFilteredRadios] = useState<MusicRadioStation[] | null>(null);
  const [radiosLoading, setRadiosLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [forYouTracks, setForYouTracks] = useState<MusicTrack[]>([]);
  const [profileDrawerOpen, setProfileDrawerOpen] = useState(false);
  const [libraryFilter, setLibraryFilter] = useState<'all' | 'playlists' | 'albums' | 'artists' | 'offline'>('all');
  const [librarySort, setLibrarySort] = useState<'recent' | 'alpha'>('recent');
  const [libraryLayout, setLibraryLayout] = useState<'list' | 'grid'>('list');

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const prevNavTabRef = useRef(navTab);

  useBackInterceptor(profileDrawerOpen, 'music-profile-drawer', () => setProfileDrawerOpen(false), {
    priority: 16,
    lockScroll: true,
  });
  useBackInterceptor(detailStack.length > 0, 'music-detail-stack', () => popMusicDetail(), {
    priority: 8,
  });
  useBackInterceptor(
    navTab !== 'home' && detailStack.length === 0,
    'music-subtab-reset',
    () => setNavTab('home'),
    { priority: 5 }
  );
  useBackInterceptor(
    navTab === 'home' && detailStack.length === 0 && activeMood !== 'all',
    'music-mood-reset',
    () => setActiveMood('all'),
    { priority: 4 }
  );

  // Sync external search query from WorldShell top search
  useEffect(() => {
    const clean = externalSearchQuery.trim();
    if (clean) {
      setSearchQuery(clean);
      clearMusicDetailStack();
      setNavTab('search');
    }
  }, [externalSearchQuery, setSearchQuery, clearMusicDetailStack, setNavTab]);

  // Auto-focus search input when jumping directly to Search
  useEffect(() => {
    if (navTab === 'search' && prevNavTabRef.current !== 'search' && !detail) {
      const raf = window.requestAnimationFrame(() => searchInputRef.current?.focus());
      prevNavTabRef.current = navTab;
      return () => window.cancelAnimationFrame(raf);
    }
    prevNavTabRef.current = navTab;
    return undefined;
  }, [navTab, detail]);

  // First-visit startup prompt to import Spotify / Exportify / YouTube Music
  useEffect(() => {
    if (tasteProfile.importedSources.length > 0) return;
    try {
      if (typeof localStorage !== 'undefined' && localStorage.getItem(MUSIC_IMPORT_PROMPT_SEEN_KEY)) {
        return;
      }
    } catch {
      return;
    }
    const timer = window.setTimeout(() => {
      const st = useMusicStore.getState();
      if (st.tasteProfile.importedSources.length === 0 && !st.showImportModal) {
        st.setShowImportModal(true);
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [tasteProfile.importedSources.length]);

  // Personalized "Para Ti · Según tus gustos" shelf
  const tasteKey = `${tasteProfile.favoriteArtists.slice(0, 4).join('|')}::${tasteProfile.favoriteGenres.slice(0, 3).join('|')}`;
  useEffect(() => {
    const queries = [
      ...tasteProfile.favoriteArtists.slice(0, 3),
      ...tasteProfile.favoriteGenres.slice(0, 2),
    ].filter(Boolean);
    if (queries.length === 0) {
      setForYouTracks([]);
      return;
    }
    let cancelled = false;
    Promise.all(
      queries.map((q) =>
        fetch(`/api/music/search?q=${encodeURIComponent(q)}`)
          .then((r) => r.json())
          .catch(() => null)
      )
    ).then((results) => {
      if (cancelled) return;
      const seen = new Set<string>();
      const combined: MusicTrack[] = [];
      for (const res of results) {
        const list: MusicTrack[] = Array.isArray(res?.tracks) ? res.tracks : [];
        for (const t of list.slice(0, 5)) {
          if (!seen.has(t.id)) {
            seen.add(t.id);
            combined.push(t);
          }
        }
      }
      setForYouTracks(combined.slice(0, 18));
    });
    return () => {
      cancelled = true;
    };
  }, [tasteKey, tasteProfile.favoriteArtists, tasteProfile.favoriteGenres]);

  const loadHomeData = useCallback(() => {
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

  useEffect(() => loadHomeData(), [loadHomeData]);

  // Filtered radios
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
        if (data?.success) setFilteredRadios(data.radios || []);
        setRadiosLoading(false);
      })
      .catch(() => {
        if (!cancelled) setRadiosLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [radioFilterId]);

  // Debounced search stored in useMusicStore
  useEffect(() => {
    const clean = searchQuery.trim();
    if (!clean) {
      setSearchResults(null);
      setSearchLoading(false);
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    setSearchLoading(true);
    const timer = window.setTimeout(() => {
      fetch(`/api/music/search?q=${encodeURIComponent(clean)}`, { signal: controller.signal })
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
          if (!cancelled && !controller.signal.aborted) setSearchLoading(false);
        });
    }, 240);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery, setSearchResults]);

  const openAlbumDetail = useCallback(
    async (albumId: string, previewAlbum?: MusicAlbumRef) => {
      triggerHaptic('light');
      pushMusicDetail({ kind: 'album', id: albumId, album: previewAlbum, tracks: [], loading: true });
      try {
        const res = await fetch(`/api/music/album/${encodeURIComponent(albumId)}`);
        const data = await res.json();
        replaceTopMusicDetail((prev) =>
          prev?.kind === 'album' && prev.id === albumId
            ? {
                kind: 'album',
                id: albumId,
                album: data?.album || previewAlbum,
                tracks: data?.tracks || [],
                loading: false,
              }
            : prev
        );
      } catch {
        replaceTopMusicDetail((prev) =>
          prev?.kind === 'album' && prev.id === albumId ? { ...prev, loading: false } : prev
        );
      }
    },
    [pushMusicDetail, replaceTopMusicDetail]
  );

  const openArtistDetail = useCallback(
    async (artistId: string, previewArtist?: MusicArtistRef) => {
      triggerHaptic('light');
      pushMusicDetail({
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
        replaceTopMusicDetail((prev) =>
          prev?.kind === 'artist' && prev.id === artistId
            ? {
                kind: 'artist',
                id: artistId,
                artist: data?.artist || previewArtist,
                topTracks: data?.topTracks || [],
                albums: data?.albums || [],
                related: data?.related || [],
                loading: false,
              }
            : prev
        );
      } catch {
        replaceTopMusicDetail((prev) =>
          prev?.kind === 'artist' && prev.id === artistId ? { ...prev, loading: false } : prev
        );
      }
    },
    [pushMusicDetail, replaceTopMusicDetail]
  );

  // Hydrate artist/album/playlist details pushed externally (e.g. from UniversalHomeSearch)
  useEffect(() => {
    if (!detail) return;
    if (detail.kind === 'artist' && detail.loading && detail.topTracks.length === 0) {
      fetch(`/api/music/artist/${encodeURIComponent(detail.id)}`)
        .then((r) => r.json())
        .then((data) => {
          replaceTopMusicDetail((prev) =>
            prev?.kind === 'artist' && prev.id === detail.id
              ? {
                  kind: 'artist',
                  id: detail.id,
                  artist: data?.artist || prev.artist,
                  topTracks: data?.topTracks || [],
                  albums: data?.albums || [],
                  related: data?.related || [],
                  loading: false,
                }
              : prev
          );
        })
        .catch(() => {
          replaceTopMusicDetail((prev) =>
            prev?.kind === 'artist' && prev.id === detail.id ? { ...prev, loading: false } : prev
          );
        });
    }
  }, [detail, replaceTopMusicDetail]);

  const openPlaylistDetail = useCallback(
    async (playlistId: string, previewPlaylist?: MusicPlaylist) => {
      triggerHaptic('light');
      pushMusicDetail({
        kind: 'playlist',
        id: playlistId,
        playlist: previewPlaylist,
        tracks: [],
        loading: true,
      });
      try {
        const res = await fetch(`/api/music/playlist/${encodeURIComponent(playlistId)}`);
        const data = await res.json();
        replaceTopMusicDetail((prev) =>
          prev?.kind === 'playlist' && prev.id === playlistId
            ? {
                kind: 'playlist',
                id: playlistId,
                playlist: data?.playlist || previewPlaylist,
                tracks: data?.tracks || [],
                loading: false,
              }
            : prev
        );
      } catch {
        replaceTopMusicDetail((prev) =>
          prev?.kind === 'playlist' && prev.id === playlistId ? { ...prev, loading: false } : prev
        );
      }
    },
    [pushMusicDetail, replaceTopMusicDetail]
  );

  const openGenreDetail = useCallback(
    async (genre: MusicGenre) => {
      triggerHaptic('light');
      pushMusicDetail({ kind: 'genre', genre, artists: [], tracks: [], loading: true });
      try {
        const res = await fetch(
          `/api/music/genre/${encodeURIComponent(genre.id)}?name=${encodeURIComponent(genre.name)}`
        );
        const data = await res.json();
        replaceTopMusicDetail((prev) =>
          prev?.kind === 'genre' && prev.genre.id === genre.id
            ? {
                kind: 'genre',
                genre,
                artists: data?.artists || [],
                tracks: data?.tracks || [],
                loading: false,
              }
            : prev
        );
      } catch {
        replaceTopMusicDetail((prev) =>
          prev?.kind === 'genre' && prev.genre.id === genre.id ? { ...prev, loading: false } : prev
        );
      }
    },
    [pushMusicDetail, replaceTopMusicDetail]
  );

  const startArtistRadio = useCallback(
    async (artist: MusicArtistRef) => {
      triggerHaptic('medium');
      if (isOpenableArtistId(artist.id)) {
        try {
          const res = await fetch(`/api/music/artist/${encodeURIComponent(artist.id)}`);
          const data = await res.json();
          const list: MusicTrack[] = Array.isArray(data?.topTracks) ? data.topTracks : [];
          if (list.length > 0) {
            playTrack(list[0], list);
            showToast(`${m.autoplayBadge} · ${artist.name}`);
            return;
          }
        } catch {
          // fallback to search
        }
      }
      try {
        const res = await fetch(`/api/music/search?q=${encodeURIComponent(artist.name)}`);
        const data = await res.json();
        const list: MusicTrack[] = Array.isArray(data?.tracks) ? data.tracks : [];
        if (list.length > 0) {
          playTrack(list[0], list);
          showToast(`${m.autoplayBadge} · ${artist.name}`);
        }
      } catch {
        // ignore network failures
      }
    },
    [m.autoplayBadge, playTrack, showToast]
  );

  const hasBottomBar = Boolean(currentTrack || activeRadio);
  const likedIdSet = useMemo(() => new Set(likedTracks.map((t) => t.id)), [likedTracks]);
  const offlineIdSet = useMemo(() => new Set(offlineTrackIds), [offlineTrackIds]);

  const offlineTracks = useMemo(() => {
    const map = new Map<string, MusicTrack>();
    for (const t of [...likedTracks, ...recentTracks]) {
      if (offlineIdSet.has(t.id) && !map.has(t.id)) map.set(t.id, t);
    }
    for (const pl of userPlaylists) {
      for (const t of pl.tracks) {
        if (offlineIdSet.has(t.id) && !map.has(t.id)) map.set(t.id, t);
      }
    }
    return Array.from(map.values());
  }, [likedTracks, recentTracks, userPlaylists, offlineIdSet]);

  const topStatArtist = useMemo(() => {
    const entries = Object.values(listeningStats.artistPlayCounts || {});
    if (entries.length === 0) return '—';
    entries.sort((a, b) => b.count - a.count);
    return entries[0].name;
  }, [listeningStats.artistPlayCounts]);

  const moodFilters = useMemo<Array<{ id: HomeMoodFilterId; label: string }>>(
    () => [
      { id: 'all', label: m.moodAll },
      { id: 'youtube_music', label: m.moodYtm },
      { id: 'spotify', label: m.moodSpotify },
      { id: 'spain', label: m.moodSpain },
      { id: 'morocco', label: m.moodMorocco },
      { id: 'arab', label: m.moodArab },
      { id: 'africa', label: m.moodAfrica },
      { id: 'urbano', label: m.moodUrbano },
      { id: 'pop', label: m.moodPop },
      { id: 'chill', label: m.moodChill },
      { id: 'flamenco', label: m.moodFlamenco },
      { id: 'electronic', label: m.moodElectronic },
      { id: 'rock', label: m.moodRock },
      { id: 'latin', label: m.moodLatin },
      { id: 'rnb', label: m.moodRnb },
      { id: 'usa', label: m.moodUsa },
      { id: 'russia', label: m.moodRussia },
      { id: 'romania', label: m.moodRomania },
      { id: 'china', label: m.moodChina },
      { id: 'soundtrack', label: m.moodSoundtrack },
      { id: 'classics', label: m.moodClassics },
      { id: 'audius', label: m.moodAudius },
    ],
    [m]
  );

  const activeMoodSelection = useMemo(() => {
    if (!homeData || activeMood === 'all') return null;
    const map: Record<
      Exclude<HomeMoodFilterId, 'all'>,
      { title: string; subtitle: string; tracks: MusicTrack[]; cover: string }
    > = {
      youtube_music: {
        title: m.secYtmHits,
        subtitle: 'YouTube Music Charts',
        tracks: homeData.youtubeMusicHits,
        cover: homeData.youtubeMusicHits[0]?.album.coverXl || spatialHeroCover,
      },
      spotify: {
        title: m.secSpotifyHits,
        subtitle: 'Global Top 50 · Viral 50',
        tracks: homeData.spotifyHits,
        cover: homeData.spotifyHits[0]?.album.coverXl || mixHeroCover,
      },
      morocco: {
        title: m.secMorocco,
        subtitle: 'ElGrandeToto · Saad Lamjarred · Dystinct',
        tracks: homeData.moroccoMix,
        cover: homeData.moroccoMix[0]?.album.coverXl || mixUrbanoCover,
      },
      arab: {
        title: m.secArab,
        subtitle: 'Amr Diab · Nancy Ajram · Wegz',
        tracks: homeData.arabMix,
        cover: homeData.arabMix[0]?.album.coverXl || acousticSoulCover,
      },
      africa: {
        title: m.secAfrica,
        subtitle: 'Burna Boy · Wizkid · Tyla · Rema',
        tracks: homeData.africaMix,
        cover: homeData.africaMix[0]?.album.coverXl || mixUrbanoCover,
      },
      russia: {
        title: m.secRussia,
        subtitle: 'Macan · Anna Asti · Miyagi',
        tracks: homeData.russiaMix,
        cover: homeData.russiaMix[0]?.album.coverXl || mixElectronicCover,
      },
      romania: {
        title: m.secRomania,
        subtitle: "Inna · Carla's Dreams · Smiley",
        tracks: homeData.romaniaMix,
        cover: homeData.romaniaMix[0]?.album.coverXl || mixElectronicCover,
      },
      china: {
        title: m.secChina,
        subtitle: 'Jay Chou · G.E.M. · Jackson Wang',
        tracks: homeData.chinaMix,
        cover: homeData.chinaMix[0]?.album.coverXl || spatialHeroCover,
      },
      usa: {
        title: m.secUsa,
        subtitle: 'Billboard Hot 100',
        tracks: homeData.usaMix,
        cover: homeData.usaMix[0]?.album.coverXl || rockArenaCover,
      },
      spain: {
        title: m.secSpainHits,
        subtitle: 'Quevedo · Rosalía · Aitana · Bad Bunny',
        tracks: homeData.spainHits,
        cover: homeData.spainHits[0]?.album.coverXl || mixUrbanoCover,
      },
      urbano: {
        title: m.secUrbano,
        subtitle: 'Trap · Reggaeton',
        tracks: homeData.urbanoMix,
        cover: mixUrbanoCover,
      },
      pop: {
        title: m.secPop,
        subtitle: 'Global Pop Hits',
        tracks: homeData.popMix,
        cover: homeData.popMix[0]?.album.coverXl || spatialHeroCover,
      },
      electronic: {
        title: m.secElectronic,
        subtitle: 'House · Techno · Club',
        tracks: homeData.electronicMix,
        cover: mixElectronicCover,
      },
      rock: {
        title: m.secRock,
        subtitle: 'Rock · Indie',
        tracks: homeData.rockIndieMix,
        cover: rockArenaCover,
      },
      chill: {
        title: m.secChill,
        subtitle: 'Lo-Fi Beats · Focus',
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
        subtitle: 'Salsa · Bachata · Reggaeton',
        tracks: homeData.latinSalsaMix,
        cover: homeData.latinSalsaMix[0]?.album.coverXl || mixUrbanoCover,
      },
      rnb: {
        title: m.secRnb,
        subtitle: 'R&B · Neo Soul',
        tracks: homeData.rnbSoulMix,
        cover: homeData.rnbSoulMix[0]?.album.coverXl || acousticSoulCover,
      },
      soundtrack: {
        title: m.secSoundtrack,
        subtitle: 'Cinema · Series OST',
        tracks: homeData.soundtrackMix,
        cover: homeData.soundtrackMix[0]?.album.coverXl || spatialHeroCover,
      },
      classics: {
        title: m.secClassics,
        subtitle: '80s · 90s Legends',
        tracks: homeData.classicsMix,
        cover: homeData.classicsMix[0]?.album.coverXl || rockArenaCover,
      },
      audius: {
        title: m.secAudius,
        subtitle: 'Audius Hi-Fi',
        tracks: homeData.audiusTrending,
        cover: homeData.audiusTrending[0]?.album.coverXl || mixElectronicCover,
      },
    };
    return map[activeMood];
  }, [activeMood, homeData, m]);

  const handleToggleOffline = useCallback(
    async (track: MusicTrack) => {
      triggerHaptic('light');
      if (offlineIdSet.has(track.id)) {
        await removeTrackFromOfflineLibrary(track.id);
        showToast(m.removeOfflineBtn);
      } else {
        showToast(m.downloadingToast);
        const res = await saveTrackToOfflineLibrary(track);
        showToast(res.ok ? m.savedOfflineBadge : res.error || m.catalogLoadError);
      }
    },
    [offlineIdSet, m, showToast]
  );

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
          isOffline={offlineIdSet.has(track.id)}
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
            void startDownloadMp3Job(track);
            showToast(m.downloadingToast);
          }}
          onToggleOffline={() => void handleToggleOffline(track)}
          onOpenSettings={() => {
            triggerHaptic('light');
            if (currentTrack?.id !== track.id) playTrack(track, tracks);
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
                className="w-9 h-9 rounded-full flex items-center justify-center text-zinc-500 hover:text-rose-400 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            ) : undefined
          }
        />
      ))}
    </div>
  );

  // Clean Spotify-style square track shelf (unboxed cover + plain metadata below)
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
                pushMusicDetail({
                  kind: 'curated',
                  title: viewAllTitle,
                  subtitle: `${tracks.length} ${m.selectedSongs}`,
                  cover: tracks[0]?.album.coverXl || tracks[0]?.album.cover || spatialHeroCover,
                  tracks,
                })
              }
              className="text-xs font-semibold text-[#60A5FA] hover:text-white cursor-pointer whitespace-nowrap"
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
              className="group shrink-0 w-[144px] sm:w-[168px] text-left cursor-pointer snap-start focus-visible:outline-none"
            >
              <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-[#131318] mb-2">
                <CoverArt
                  src={t.album.cover}
                  alt={t.title}
                  fallbackLabel={t.artist.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <span
                  className={`absolute right-2 bottom-2 w-10 h-10 rounded-full bg-gradient-to-br from-[#2563EB] to-[#3B82F6] text-white flex items-center justify-center shadow-[0_8px_20px_rgba(37,99,235,0.45)] transition-all ${
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
              <p className={`text-sm font-bold truncate leading-snug ${active ? 'text-[#60A5FA]' : 'text-white'}`}>
                {t.title}
              </p>
              <p className="text-xs text-zinc-400 truncate mt-0.5">{t.artist.name}</p>
            </button>
          );
        })}
      </HorizontalRail>
    );
  };

  // Clean Spotify-style Emisoras populares shelf (Riffan Obsidian/Cobalt/Violet aesthetic)
  const renderEmisorasPopulares = (artists: MusicArtistRef[]) => {
    if (!artists || artists.length < 3) return null;
    const featured = artists.slice(0, 8);
    return (
      <HorizontalRail title="Emisoras populares">
        {featured.map((art, i) => {
          const leftNeighbor = artists[(i + 1) % artists.length];
          const rightNeighbor = artists[(i + 2) % artists.length];
          const cardGradient = RADIO_CARD_SURFACES[i % RADIO_CARD_SURFACES.length];
          const subtitleNames = [art.name, leftNeighbor?.name, rightNeighbor?.name]
            .filter(Boolean)
            .join(', ');

          return (
            <button
              key={`radio-art-${art.id}-${i}`}
              type="button"
              onClick={() => void startArtistRadio(art)}
              className="group shrink-0 w-[156px] sm:w-[176px] text-left cursor-pointer snap-start"
            >
              <div
                className={`relative aspect-square w-full rounded-2xl overflow-hidden bg-gradient-to-br ${cardGradient} border border-white/[0.1] p-3 flex flex-col justify-between mb-2 shadow-lg group-hover:border-[#60A5FA]/50 transition-colors`}
              >
                <div className="flex items-center justify-between">
                  <RiffanMusicLogo variant="mark" size={18} frameStyle="none" />
                  <span className="text-[10px] font-extrabold tracking-widest text-white/80">
                    RADIO
                  </span>
                </div>

                {/* Flanking 3-portrait cluster */}
                <div className="relative flex items-center justify-center my-1">
                  {leftNeighbor && (
                    <div className="w-11 h-11 rounded-full overflow-hidden border border-white/25 -mr-3 opacity-85 bg-[#0C0C0F]">
                      <CoverArt
                        src={leftNeighbor.picture}
                        alt={leftNeighbor.name}
                        fallbackLabel={leftNeighbor.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  <div className="relative z-10 w-16 h-16 sm:w-18 sm:h-18 rounded-full overflow-hidden border-2 border-[#60A5FA]/75 shadow-xl bg-[#0C0C0F] group-hover:scale-105 transition-transform">
                    <CoverArt
                      src={art.picture}
                      alt={art.name}
                      fallbackLabel={art.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  {rightNeighbor && (
                    <div className="w-11 h-11 rounded-full overflow-hidden border border-white/25 -ml-3 opacity-85 bg-[#0C0C0F]">
                      <CoverArt
                        src={rightNeighbor.picture}
                        alt={rightNeighbor.name}
                        fallbackLabel={rightNeighbor.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                </div>

                <p className="font-display text-sm sm:text-base font-black text-white truncate tracking-tight">
                  {art.name}
                </p>
              </div>
              <p className="text-xs text-zinc-400 line-clamp-2 leading-snug">{subtitleNames}</p>
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
            className="group shrink-0 w-[124px] sm:w-[148px] text-center cursor-pointer snap-start"
          >
            <div className="aspect-square w-full rounded-full overflow-hidden bg-[#131318] border border-white/[0.1] group-hover:border-[#60A5FA]/60 mb-2 shadow-lg transition-colors">
              <CoverArt
                src={art.picture}
                alt={art.name}
                fallbackLabel={art.name}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
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
            className="group shrink-0 w-[144px] sm:w-[168px] text-left cursor-pointer snap-start"
          >
            <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-[#131318] mb-2">
              <CoverArt
                src={alb.cover}
                alt={alb.title}
                fallbackLabel={alb.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
              <span className="absolute right-2 bottom-2 w-10 h-10 rounded-full bg-gradient-to-br from-[#2563EB] to-[#3B82F6] text-white flex items-center justify-center shadow-lg opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all">
                <Play className="w-4 h-4 fill-current ml-0.5" />
              </span>
            </div>
            <p className="text-xs text-zinc-400 leading-none mb-1">{m.albumLabel}</p>
            <p className="text-sm font-bold text-white truncate leading-snug">{alb.title}</p>
            <p className="text-xs text-zinc-400 truncate mt-0.5">
              {alb.artist?.name || (alb.releaseDate ? alb.releaseDate.slice(0, 4) : '')}
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
            className="group shrink-0 w-[144px] sm:w-[168px] text-left cursor-pointer snap-start"
          >
            <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-[#131318] mb-2">
              <CoverArt
                src={pl.cover}
                alt={pl.title}
                fallbackLabel={pl.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
              <span className="absolute right-2 bottom-2 w-10 h-10 rounded-full bg-gradient-to-br from-[#2563EB] to-[#3B82F6] text-white flex items-center justify-center shadow-lg opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all">
                <Play className="w-4 h-4 fill-current ml-0.5" />
              </span>
            </div>
            <p className="text-sm font-bold text-white truncate leading-snug">{pl.title}</p>
            <p className="text-xs text-zinc-400 truncate mt-0.5">{pl.creator || 'Editorial'}</p>
          </button>
        ))}
      </HorizontalRail>
    );
  };

  const renderQuickMixes = () => {
    if (!homeData) return null;
    const cards = [
      {
        id: 'liked',
        title: m.likedSongs,
        isHeart: true,
        cover: mixHeroCover,
        onClick: () => pushMusicDetail({ kind: 'liked' }),
      },
      {
        id: 'ytm',
        title: m.moodYtm,
        cover: homeData.youtubeMusicHits[0]?.album.cover || spatialHeroCover,
        onClick: () =>
          pushMusicDetail({
            kind: 'curated',
            title: m.secYtmHits,
            subtitle: 'YouTube Music · Official Audio',
            cover: homeData.youtubeMusicHits[0]?.album.coverXl || spatialHeroCover,
            tracks: homeData.youtubeMusicHits,
          }),
      },
      {
        id: 'spotify',
        title: m.moodSpotify,
        cover: homeData.spotifyHits[0]?.album.cover || mixUrbanoCover,
        onClick: () =>
          pushMusicDetail({
            kind: 'curated',
            title: m.secSpotifyHits,
            subtitle: 'Spotify Global Top 50 · Viral 50',
            cover: homeData.spotifyHits[0]?.album.coverXl || mixUrbanoCover,
            tracks: homeData.spotifyHits,
          }),
      },
      {
        id: 'spain',
        title: m.moodSpain,
        cover: homeData.spainHits[0]?.album.cover || mixUrbanoCover,
        onClick: () =>
          pushMusicDetail({
            kind: 'curated',
            title: m.secSpainHits,
            subtitle: 'Top España',
            cover: homeData.spainHits[0]?.album.coverXl || mixUrbanoCover,
            tracks: homeData.spainHits,
          }),
      },
      {
        id: 'morocco',
        title: m.moodMorocco,
        cover: homeData.moroccoMix[0]?.album.cover || mixUrbanoCover,
        onClick: () =>
          pushMusicDetail({
            kind: 'curated',
            title: m.secMorocco,
            subtitle: 'Marruecos · Raï, Rap & Chaabi',
            cover: homeData.moroccoMix[0]?.album.coverXl || mixUrbanoCover,
            tracks: homeData.moroccoMix,
          }),
      },
      {
        id: 'radios',
        title: m.navRadios,
        cover: rockArenaCover,
        onClick: () => {
          clearMusicDetailStack();
          setNavTab('radios');
        },
      },
    ];

    return (
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
        {cards.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={c.onClick}
            className="group flex items-center gap-2.5 h-14 rounded-xl bg-[#131318] hover:bg-[#1B1B24] border border-white/[0.06] hover:border-[#3B82F6]/35 overflow-hidden text-left cursor-pointer transition-colors pr-2.5"
          >
            {c.isHeart ? (
              <div className="w-14 h-14 bg-gradient-to-br from-[#7C3AED] via-[#3B82F6] to-[#60A5FA] flex items-center justify-center shrink-0">
                <Heart className="w-6 h-6 text-white fill-current" />
              </div>
            ) : (
              <CoverArt
                src={c.cover}
                alt={c.title}
                fallbackLabel={c.title}
                className="w-14 h-14 object-cover shrink-0"
              />
            )}
            <p className="text-xs sm:text-sm font-bold text-white truncate flex-1">{c.title}</p>
          </button>
        ))}
      </div>
    );
  };

  const renderDetailView = () => {
    if (!detail) return null;

    if (detail.kind === 'liked') {
      return (
        <div className="space-y-6 animate-fade-in">
          <button
            type="button"
            onClick={() => popMusicDetail()}
            className="min-h-11 px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-semibold text-zinc-200 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" /> {m.back}
          </button>

          <div className="flex flex-col sm:flex-row sm:items-end gap-5 p-5 sm:p-7 rounded-3xl bg-gradient-to-br from-[#7C3AED]/25 via-[#131318] to-[#000000] border border-[#3B82F6]/22">
            <div className="w-36 h-36 sm:w-44 sm:h-44 rounded-2xl bg-gradient-to-br from-[#7C3AED] via-[#3B82F6] to-[#60A5FA] flex items-center justify-center shadow-2xl shrink-0">
              <Heart className="w-16 h-16 text-white fill-current" />
            </div>
            <div className="space-y-2 min-w-0">
              <p className="text-xs font-bold uppercase tracking-wider text-[#60A5FA]">{m.playlistLabel}</p>
              <h1 className="font-display text-3xl sm:text-5xl font-black text-white tracking-tight">
                {m.likedSongs}
              </h1>
              <p className="text-sm text-zinc-300 tabular-nums">
                {likedTracks.length} {likedTracks.length === 1 ? m.songSingular : m.songsCount}
              </p>
              {likedTracks.length > 0 && (
                <div className="pt-2 flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => playTrack(likedTracks[0], likedTracks)}
                    className="h-11 px-6 rounded-full bg-gradient-to-r from-[#2563EB] to-[#3B82F6] text-white font-bold text-sm inline-flex items-center gap-2 cursor-pointer shadow-lg"
                  >
                    <Play className="w-4 h-4 fill-current" /> {m.playAll}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      downloadExportifyCsv('Canciones_que_te_gustan', likedTracks);
                      showToast('CSV Exportify descargado');
                    }}
                    className="h-11 px-4 rounded-full bg-white/[0.08] hover:bg-white/[0.14] border border-white/15 text-xs font-bold text-white inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-[#60A5FA]" /> Exportar CSV (Exportify)
                  </button>
                </div>
              )}
            </div>
          </div>

          {likedTracks.length === 0 ? (
            <div className="py-16 text-center rounded-3xl bg-[#131318] border border-white/[0.06]">
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
              onClick={() => popMusicDetail()}
              className="min-h-11 px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-semibold text-zinc-200 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" /> {m.back}
            </button>
            <button
              type="button"
              onClick={() => {
                deleteUserPlaylist(pl.id);
                popMusicDetail();
                showToast(m.playlistDeleted);
              }}
              className="min-h-11 px-3.5 rounded-xl bg-rose-500/12 hover:bg-rose-500/22 text-xs font-semibold text-rose-300 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" /> {m.deletePlaylist}
            </button>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-end gap-5 p-5 sm:p-7 rounded-3xl bg-gradient-to-br from-[#3B82F6]/18 via-[#131318] to-[#000000] border border-[#3B82F6]/22">
            <PlaylistCollageArt
              tracks={pl.tracks}
              title={pl.name}
              sizeClassName="w-36 h-36 sm:w-44 sm:h-44 rounded-2xl shadow-2xl"
            />
            <div className="space-y-2 min-w-0">
              <p className="text-xs font-bold uppercase tracking-wider text-[#60A5FA]">{m.yourPlaylist}</p>
              <h1 className="font-display text-3xl sm:text-5xl font-black text-white tracking-tight truncate">
                {pl.name}
              </h1>
              <p className="text-sm text-zinc-300 tabular-nums">
                {pl.tracks.length} {pl.tracks.length === 1 ? m.songSingular : m.songsCount}
              </p>
              {pl.tracks.length > 0 && (
                <div className="pt-2 flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => playTrack(pl.tracks[0], pl.tracks)}
                    className="h-11 px-6 rounded-full bg-gradient-to-r from-[#2563EB] to-[#3B82F6] text-white font-bold text-sm inline-flex items-center gap-2 cursor-pointer shadow-lg"
                  >
                    <Play className="w-4 h-4 fill-current" /> {m.playNow}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      downloadExportifyCsv(pl.name, pl.tracks);
                      showToast('CSV Exportify descargado');
                    }}
                    className="h-11 px-4 rounded-full bg-white/[0.08] hover:bg-white/[0.14] border border-white/15 text-xs font-bold text-white inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-[#60A5FA]" /> Exportar CSV (Exportify)
                  </button>
                </div>
              )}
            </div>
          </div>

          {pl.tracks.length === 0 ? (
            <div className="py-16 text-center rounded-3xl bg-[#131318] border border-white/[0.06]">
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
            onClick={() => popMusicDetail()}
            className="min-h-11 px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-semibold text-zinc-200 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" /> {m.back}
          </button>

          <div className="flex flex-col sm:flex-row sm:items-end gap-5 p-5 sm:p-7 rounded-3xl bg-gradient-to-br from-[#3B82F6]/18 via-[#131318] to-[#000000] border border-[#3B82F6]/22">
            <CoverArt
              src={detail.cover}
              alt={detail.title}
              fallbackLabel={detail.title}
              className="w-36 h-36 sm:w-44 sm:h-44 rounded-2xl object-cover shadow-2xl shrink-0"
            />
            <div className="space-y-2 min-w-0">
              <p className="text-xs font-bold uppercase tracking-wider text-[#60A5FA]">{m.curatedSelection}</p>
              <h1 className="font-display text-3xl sm:text-4xl font-black text-white tracking-tight">
                {detail.title}
              </h1>
              <p className="text-sm text-zinc-300">{detail.subtitle}</p>
              {detail.tracks.length > 0 && (
                <div className="pt-2 flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => playTrack(detail.tracks[0], detail.tracks)}
                    className="h-11 px-6 rounded-full bg-gradient-to-r from-[#2563EB] to-[#3B82F6] text-white font-bold text-sm inline-flex items-center gap-2 cursor-pointer shadow-lg"
                  >
                    <Play className="w-4 h-4 fill-current" /> {m.playList}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const shuffled = [...detail.tracks].sort(() => Math.random() - 0.5);
                      playTrack(shuffled[0], shuffled);
                    }}
                    className="h-11 px-5 rounded-full border border-white/20 hover:border-[#60A5FA] text-white font-semibold text-sm inline-flex items-center gap-2 cursor-pointer"
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
            onClick={() => popMusicDetail()}
            className="min-h-11 px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-semibold text-zinc-200 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" /> {m.back}
          </button>

          <div className="flex flex-col sm:flex-row sm:items-end gap-5 p-5 sm:p-7 rounded-3xl bg-gradient-to-br from-[#3B82F6]/18 via-[#131318] to-[#000000] border border-[#3B82F6]/22">
            <div className="w-40 h-40 sm:w-48 sm:h-48 rounded-2xl overflow-hidden bg-[#1B1B22] shadow-2xl shrink-0">
              <CoverArt
                src={alb?.coverXl || alb?.cover}
                alt={alb?.title || m.albumLabel}
                fallbackLabel={alb?.title || m.albumLabel}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="space-y-2 min-w-0">
              <p className="text-xs font-bold uppercase tracking-wider text-[#60A5FA]">{m.albumLabel}</p>
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
                    className="h-11 px-6 rounded-full bg-gradient-to-r from-[#2563EB] to-[#3B82F6] text-white font-bold text-sm inline-flex items-center gap-2 cursor-pointer shadow-lg"
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
                    className={`h-11 px-5 rounded-full border text-sm font-semibold cursor-pointer transition-colors ${
                      isSaved
                        ? 'bg-[#3B82F6]/15 border-[#3B82F6] text-[#93C5FD]'
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
            onClick={() => popMusicDetail()}
            className="min-h-11 px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-semibold text-zinc-200 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" /> {m.back}
          </button>

          <div className="flex flex-col sm:flex-row sm:items-end gap-5 p-5 sm:p-7 rounded-3xl bg-gradient-to-br from-[#3B82F6]/18 via-[#131318] to-[#000000] border border-[#3B82F6]/22">
            <div className="w-40 h-40 sm:w-48 sm:h-48 rounded-2xl overflow-hidden bg-[#1B1B22] shadow-2xl shrink-0">
              <CoverArt
                src={pl?.cover}
                alt={pl?.title || m.playlistLabel}
                fallbackLabel={pl?.title || m.playlistLabel}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="space-y-2 min-w-0">
              <p className="text-xs font-bold uppercase tracking-wider text-[#60A5FA]">{m.playlistLabel}</p>
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
                    className="h-11 px-6 rounded-full bg-gradient-to-r from-[#2563EB] to-[#3B82F6] text-white font-bold text-sm inline-flex items-center gap-2 cursor-pointer shadow-lg"
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
                    className={`h-11 px-5 rounded-full border text-sm font-semibold cursor-pointer ${
                      isSaved
                        ? 'bg-[#3B82F6]/15 border-[#3B82F6] text-[#93C5FD]'
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
            onClick={() => popMusicDetail()}
            className="min-h-11 px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-semibold text-zinc-200 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" /> {m.exploreGenres}
          </button>

          <div
            className="p-6 sm:p-8 rounded-3xl border border-white/10"
            style={{
              background: `linear-gradient(135deg, ${detail.genre.color}66 0%, #131318 75%)`,
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
                className="mt-4 h-11 px-6 rounded-full bg-gradient-to-r from-[#2563EB] to-[#3B82F6] text-white font-bold text-sm inline-flex items-center gap-2 cursor-pointer shadow-lg"
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
          onClick={() => popMusicDetail()}
          className="min-h-11 px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-semibold text-zinc-200 inline-flex items-center gap-1.5 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> {m.back}
        </button>

        <div className="flex flex-col sm:flex-row sm:items-end gap-5 p-5 sm:p-7 rounded-3xl bg-gradient-to-br from-[#3B82F6]/18 via-[#131318] to-[#000000] border border-[#3B82F6]/22">
          <div className="w-36 h-36 sm:w-44 sm:h-44 rounded-full overflow-hidden bg-[#1B1B22] border-2 border-[#3B82F6]/35 shadow-2xl shrink-0">
            <CoverArt
              src={art?.picture}
              alt={art?.name || m.artistRole}
              fallbackLabel={art?.name || m.artistRole}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="space-y-2 min-w-0">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#60A5FA]">
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
                  className="h-11 px-6 rounded-full bg-gradient-to-r from-[#2563EB] to-[#3B82F6] text-white font-bold text-sm inline-flex items-center gap-2 cursor-pointer shadow-lg"
                >
                  <Play className="w-4 h-4 fill-current" /> {m.playNow}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const shuffled = [...detail.topTracks].sort(() => Math.random() - 0.5);
                    playTrack(shuffled[0], shuffled);
                  }}
                  className="h-11 px-5 rounded-full border border-white/20 hover:border-white text-white font-semibold text-sm inline-flex items-center gap-2 cursor-pointer"
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

  const searchFilterTabs: Array<{ id: MusicSearchFilter; label: string; count?: number }> = [
    { id: 'all', label: 'Todo' },
    { id: 'tracks', label: m.songsSection, count: searchResults?.tracks.length },
    { id: 'artists', label: m.artistsSection, count: searchResults?.artists.length },
    { id: 'albums', label: m.albumsSection, count: searchResults?.albums.length },
    { id: 'playlists', label: m.playlistsSection, count: searchResults?.playlists.length },
    { id: 'radios', label: m.navRadios, count: searchResults?.radios.length },
  ];

  // Sorted library collections
  const sortedUserPlaylists = useMemo(() => {
    const copyList = [...userPlaylists];
    if (librarySort === 'alpha') copyList.sort((a, b) => a.name.localeCompare(b.name));
    return copyList;
  }, [userPlaylists, librarySort]);

  const sortedSavedAlbums = useMemo(() => {
    const copyList = [...savedAlbums];
    if (librarySort === 'alpha') copyList.sort((a, b) => a.title.localeCompare(b.title));
    return copyList;
  }, [savedAlbums, librarySort]);

  const sortedSavedPlaylists = useMemo(() => {
    const copyList = [...savedPlaylists];
    if (librarySort === 'alpha') copyList.sort((a, b) => a.title.localeCompare(b.title));
    return copyList;
  }, [savedPlaylists, librarySort]);

  const libraryArtists = useMemo(() => {
    const list: MusicArtistRef[] = [];
    const seen = new Set<string>();
    for (const t of [...likedTracks, ...recentTracks]) {
      if (t.artist?.name && !seen.has(t.artist.name.toLowerCase())) {
        seen.add(t.artist.name.toLowerCase());
        list.push(t.artist);
      }
    }
    if (librarySort === 'alpha') list.sort((a, b) => a.name.localeCompare(b.name));
    return list.slice(0, 24);
  }, [likedTracks, recentTracks, librarySort]);

  return (
    <div
      className={`min-h-screen w-full bg-[#000000] flex flex-col lg:flex-row gap-4 lg:gap-6 px-3.5 sm:px-6 lg:px-8 pt-3 sm:pt-5 ${
        hasBottomBar ? 'pb-40 sm:pb-44 lg:pb-28' : 'pb-24 lg:pb-12'
      }`}
    >
      {/* Desktop Spotify-inspired Sidebar */}
      <aside className="hidden lg:flex flex-col w-[256px] shrink-0 gap-3 self-start sticky top-12">
        <div className="rounded-2xl bg-[#0D0D12] border border-white/[0.08] p-2.5 space-y-1">
          <div className="px-3 py-2 flex items-center justify-between">
            <RiffanMusicLogo variant="full" size={26} />
          </div>
          {[
            { id: 'home' as const, label: m.navHome, icon: Home },
            { id: 'search' as const, label: 'Buscar', icon: Search },
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
                  clearMusicDetailStack();
                  setNavTab(item.id);
                }}
                className={`w-full min-h-11 px-3.5 rounded-xl flex items-center gap-3 text-sm font-bold cursor-pointer transition-all ${
                  active
                    ? 'bg-gradient-to-r from-[#2563EB]/24 to-[#7C3AED]/14 text-white border border-[#3B82F6]/35'
                    : 'text-zinc-400 hover:text-white hover:bg-white/[0.05]'
                }`}
              >
                <Icon className={`w-5 h-5 ${active ? 'text-[#60A5FA]' : ''}`} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tu Biblioteca Sidebar Shortcuts */}
        <div className="rounded-2xl bg-[#0D0D12] border border-white/[0.08] p-3 space-y-2 max-h-[40vh] overflow-y-auto no-scrollbar">
          <div className="flex items-center justify-between px-1.5 pt-0.5">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
              {m.navLibrary}
            </span>
            <button
              type="button"
              onClick={() => setShowCreatePlaylistModal(true)}
              title={m.newPlaylist}
              aria-label={m.newPlaylist}
              className="w-8 h-8 rounded-full hover:bg-white/10 text-zinc-300 hover:text-white flex items-center justify-center cursor-pointer"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => pushMusicDetail({ kind: 'liked' })}
            className="w-full p-2 rounded-xl hover:bg-white/[0.05] flex items-center gap-3 text-left cursor-pointer"
          >
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#7C3AED] via-[#3B82F6] to-[#60A5FA] flex items-center justify-center shrink-0">
              <Heart className="w-5 h-5 text-white fill-current" />
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
              onClick={() => pushMusicDetail({ kind: 'user_playlist', playlistId: pl.id })}
              className="w-full p-2 rounded-xl hover:bg-white/[0.05] flex items-center gap-3 text-left cursor-pointer"
            >
              <PlaylistCollageArt
                tracks={pl.tracks}
                title={pl.name}
                sizeClassName="w-10 h-10 rounded-lg"
              />
              <div className="min-w-0">
                <p className="text-sm font-bold text-white truncate">{pl.name}</p>
                <p className="text-[11px] text-zinc-400 tabular-nums">
                  {m.playlistLabel} · {pl.tracks.length}
                </p>
              </div>
            </button>
          ))}
        </div>

        {/* Pro Tools & Import Shortcuts */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setShowImportModal(true);
            }}
            className="w-full rounded-2xl bg-[#0D0D12] hover:bg-[#14141C] border border-[#3B82F6]/30 hover:border-[#60A5FA]/55 p-3 flex items-center gap-3 text-left cursor-pointer transition-all"
          >
            <span className="w-9 h-9 rounded-xl bg-[#3B82F6]/18 text-[#60A5FA] flex items-center justify-center shrink-0">
              <Disc3 className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-bold text-white truncate">Spotify / Exportify</p>
              <p className="text-[11px] text-zinc-400 truncate">Importar gustos y CSV</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setShowEqModal(true)}
            className="w-full rounded-2xl bg-[#0D0D12] hover:bg-[#14141C] border border-white/[0.08] p-3 flex items-center gap-3 text-left cursor-pointer transition-all"
          >
            <span className="w-9 h-9 rounded-xl bg-[#7C3AED]/18 text-[#A78BFA] flex items-center justify-center shrink-0">
              <Headphones className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-bold text-white truncate">Estudio 8D &amp; EQ</p>
              <p className="text-[11px] text-zinc-400 truncate">10 bandas · MP3 320k</p>
            </div>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 space-y-5">
        {detail ? (
          renderDetailView()
        ) : navTab === 'home' ? (
          <div className="space-y-6 animate-fade-in">
            {/* Spotify-Style Top Row: Avatar + Interactive Filter Tabs */}
            <div className="flex items-center gap-2.5 overflow-x-auto no-scrollbar pb-0.5">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setProfileDrawerOpen(true);
                }}
                aria-label="Abrir perfil y estudio de audio"
                className="w-11 h-11 rounded-full bg-gradient-to-br from-[#7C3AED] to-[#2563EB] border border-white/20 text-white font-display font-black text-sm flex items-center justify-center shrink-0 cursor-pointer shadow-md active:scale-95 transition-transform"
              >
                {userInitial}
              </button>

              <HorizontalRail compact gapClassName="gap-2" className="flex-1 min-w-0">
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
                          ? 'bg-gradient-to-r from-[#2563EB] to-[#3B82F6] text-white shadow-[0_6px_18px_rgba(37,99,235,0.35)]'
                          : 'bg-[#131318] hover:bg-[#1B1B24] text-zinc-200 border border-white/[0.08]'
                      }`}
                    >
                      {mood.label}
                    </button>
                  );
                })}
              </HorizontalRail>
            </div>

            {/* Instant 1-Tap Search Trigger (Always visible, never buried) */}
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                clearMusicDetailStack();
                setNavTab('search');
              }}
              className="w-full min-h-12 px-4 rounded-2xl bg-[#131318] hover:bg-[#1A1A22] border border-white/[0.1] hover:border-[#3B82F6]/50 flex items-center justify-between gap-3 text-left cursor-pointer transition-colors"
            >
              <span className="flex items-center gap-3 min-w-0 text-sm text-zinc-400">
                <Search className="w-4 h-4 text-[#60A5FA] shrink-0" />
                <span className="truncate">
                  {searchQuery.trim()
                    ? `Seguir buscando: «${searchQuery.trim()}»`
                    : '¿Qué quieres escuchar? Artistas, canciones o radios...'}
                </span>
              </span>
              <span className="hidden sm:inline text-xs font-semibold text-[#60A5FA] shrink-0">
                Buscar
              </span>
            </button>

            {homeLoading ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-14 rounded-xl bg-[#131318] border border-white/[0.05]" />
                  ))}
                </div>
                <div className="flex gap-3 overflow-hidden">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="w-[156px] h-[200px] rounded-2xl bg-[#131318] shrink-0" />
                  ))}
                </div>
              </div>
            ) : homeData ? (
              activeMoodSelection ? (
                <section className="space-y-5 animate-fade-in">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-3xl bg-gradient-to-r from-[#3B82F6]/18 via-[#131318] to-[#131318] border border-[#3B82F6]/25">
                    <div className="flex items-center gap-4 min-w-0">
                      <CoverArt
                        src={activeMoodSelection.cover}
                        alt={activeMoodSelection.title}
                        fallbackLabel={activeMoodSelection.title}
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
                        className="h-11 px-5 rounded-full bg-gradient-to-r from-[#2563EB] to-[#3B82F6] text-white font-bold text-xs inline-flex items-center gap-2 cursor-pointer shrink-0 shadow-lg whitespace-nowrap"
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
                  {renderEmisorasPopulares(homeData.topArtists)}
                  {forYouTracks.length > 0 &&
                    renderTrackCardsCarousel(m.forYouImportedTitle, forYouTracks, m.forYouImportedSub)}
                  {renderTrackCardsCarousel('Novedades para ti', homeData.spainHits, m.secSpainHits)}
                  {renderTrackCardsCarousel(
                    `Hecho para ${storedProfile.name || 'ti'}`,
                    homeData.spotifyHits,
                    m.secSpotifyHits
                  )}
                  {renderTrackCardsCarousel(m.secYtmHits, homeData.youtubeMusicHits, m.secYtmHits)}
                  {renderAlbumsCarousel(m.secNewReleases, homeData.newReleases)}
                  {renderArtistsCarousel(m.secTopArtists, homeData.topArtists)}
                  {renderTrackCardsCarousel(m.secMorocco, homeData.moroccoMix, m.secMorocco)}
                  {renderTrackCardsCarousel(m.secArab, homeData.arabMix, m.secArab)}
                  {renderTrackCardsCarousel(m.secAfrica, homeData.africaMix, m.secAfrica)}
                  {renderTrackCardsCarousel(m.secUrbano, homeData.urbanoMix, m.secUrbano)}
                  {renderTrackCardsCarousel(m.secPop, homeData.popMix, m.secPop)}
                  {renderTrackCardsCarousel(m.secChill, homeData.chillLofiMix, m.secChill)}
                  {renderTrackCardsCarousel(m.secFlamenco, homeData.flamencoAcousticMix, m.secFlamenco)}
                  {renderTrackCardsCarousel(m.secElectronic, homeData.electronicMix, m.secElectronic)}
                  {renderTrackCardsCarousel(m.secRock, homeData.rockIndieMix, m.secRock)}
                  {renderTrackCardsCarousel(m.secLatin, homeData.latinSalsaMix, m.secLatin)}
                  {renderTrackCardsCarousel(m.secRnb, homeData.rnbSoulMix, m.secRnb)}
                  {renderTrackCardsCarousel(m.secTop50, homeData.topTracks, m.secTop50)}
                  {renderAlbumsCarousel(m.secTopAlbums, homeData.topAlbums)}
                  {renderPlaylistsCarousel(m.secEditorialPlaylists, homeData.editorialPlaylists)}
                </>
              )
            ) : (
              <div className="py-16 px-4 rounded-3xl bg-[#131318] border border-white/[0.06] text-center space-y-3">
                <p className="text-sm text-zinc-300">{m.catalogLoadError}</p>
                <button
                  type="button"
                  onClick={() => loadHomeData()}
                  className="min-h-11 px-5 rounded-full bg-gradient-to-r from-[#2563EB] to-[#3B82F6] text-white text-xs font-bold cursor-pointer"
                >
                  Reintentar
                </button>
              </div>
            )}
          </div>
        ) : navTab === 'search' ? (
          <div className="space-y-5 animate-fade-in">
            {/* Search Input Header */}
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setProfileDrawerOpen(true);
                }}
                aria-label="Abrir perfil"
                className="w-11 h-11 rounded-full bg-gradient-to-br from-[#7C3AED] to-[#2563EB] border border-white/20 text-white font-display font-black text-sm flex items-center justify-center shrink-0 cursor-pointer"
              >
                {userInitial}
              </button>
              <div className="relative flex-1 min-w-0">
                <Search className="w-5 h-5 text-[#60A5FA] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && searchQuery.trim().length >= 2) {
                      addSearchHistory(searchQuery.trim());
                    }
                  }}
                  placeholder="¿Qué quieres escuchar?"
                  className="w-full h-12 pl-12 pr-12 rounded-2xl bg-[#131318] border border-white/15 focus:border-[#3B82F6] text-sm sm:text-base text-white placeholder:text-zinc-500 outline-none transition-colors"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      searchInputRef.current?.focus();
                    }}
                    aria-label={m.clearSearch}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {searchQuery.trim() ? (
              <>
                {/* Search Category Filter Buttons */}
                <HorizontalRail compact gapClassName="gap-2">
                  {searchFilterTabs.map((ft) => {
                    const selected = searchFilter === ft.id;
                    return (
                      <button
                        key={ft.id}
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          setSearchFilter(ft.id);
                        }}
                        className={`min-h-10 px-4 rounded-full text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-all ${
                          selected
                            ? 'bg-gradient-to-r from-[#2563EB] to-[#3B82F6] text-white'
                            : 'bg-[#131318] hover:bg-[#1B1B24] text-zinc-300 border border-white/[0.08]'
                        }`}
                      >
                        {ft.label}
                        {typeof ft.count === 'number' && ft.count > 0 ? ` (${ft.count})` : ''}
                      </button>
                    );
                  })}
                </HorizontalRail>

                {searchLoading ? (
                  <div className="py-14 flex flex-col items-center gap-2 text-sm text-zinc-400">
                    <Loader2 className="w-5 h-5 text-[#60A5FA] animate-spin" />
                    <span>{m.searchingWorld}</span>
                  </div>
                ) : searchResults ? (
                  searchResults.tracks.length === 0 &&
                  searchResults.artists.length === 0 &&
                  searchResults.albums.length === 0 &&
                  searchResults.playlists.length === 0 &&
                  searchResults.radios.length === 0 ? (
                    <div className="py-14 text-center rounded-3xl bg-[#131318] border border-white/[0.06]">
                      <p className="text-base font-bold text-white">
                        {m.noResultsTitle} “{searchQuery}”
                      </p>
                      <p className="text-xs text-zinc-400 mt-1">{m.noResultsSub}</p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {(searchFilter === 'all' || searchFilter === 'tracks') &&
                        searchResults.tracks.length > 0 && (
                          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                            {searchFilter === 'all' && (
                              <div className="lg:col-span-5 space-y-2.5">
                                <h2 className="font-display text-lg font-bold text-white">{m.topResult}</h2>
                                <button
                                  type="button"
                                  onClick={() => {
                                    addSearchHistory(searchQuery.trim());
                                    playTrack(searchResults.tracks[0], searchResults.tracks);
                                  }}
                                  className="group w-full p-5 rounded-3xl bg-gradient-to-br from-[#3B82F6]/20 via-[#131318] to-[#0A0B10] hover:border-[#3B82F6]/50 border border-white/[0.08] text-left cursor-pointer transition-all relative overflow-hidden"
                                >
                                  <CoverArt
                                    src={searchResults.tracks[0].album.coverXl || searchResults.tracks[0].album.cover}
                                    alt={searchResults.tracks[0].title}
                                    fallbackLabel={searchResults.tracks[0].artist.name}
                                    className="w-24 h-24 rounded-2xl object-cover shadow-xl mb-4"
                                  />
                                  <h3 className="font-display text-2xl font-black text-white truncate">
                                    {searchResults.tracks[0].title}
                                  </h3>
                                  <p className="text-sm text-zinc-300 mt-1 truncate">
                                    {m.songSingular} · {searchResults.tracks[0].artist.name}
                                  </p>
                                  <span className="absolute right-5 bottom-5 w-12 h-12 rounded-full bg-gradient-to-br from-[#2563EB] to-[#3B82F6] text-white flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
                                    <Play className="w-5 h-5 fill-current ml-0.5" />
                                  </span>
                                </button>
                              </div>
                            )}

                            <div className={`${searchFilter === 'all' ? 'lg:col-span-7' : 'lg:col-span-12'} space-y-2.5`}>
                              <h2 className="font-display text-lg font-bold text-white">{m.songsSection}</h2>
                              <div className="rounded-2xl bg-[#0D0D12] border border-white/[0.06] p-2">
                                {renderTrackList(
                                  searchFilter === 'all'
                                    ? searchResults.tracks.slice(0, 6)
                                    : searchResults.tracks
                                )}
                              </div>
                            </div>
                          </div>
                        )}

                      {(searchFilter === 'all' || searchFilter === 'artists') &&
                        renderArtistsCarousel(m.artistsSection, searchResults.artists)}
                      {(searchFilter === 'all' || searchFilter === 'albums') &&
                        renderAlbumsCarousel(m.albumsSection, searchResults.albums)}
                      {(searchFilter === 'all' || searchFilter === 'playlists') &&
                        renderPlaylistsCarousel(m.playlistsSection, searchResults.playlists)}

                      {(searchFilter === 'all' || searchFilter === 'radios') &&
                        searchResults.radios.length > 0 && (
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
                                        ? 'bg-[#3B82F6]/16 border-[#3B82F6]/60'
                                        : 'bg-[#131318] hover:bg-[#1B1B22] border-white/[0.06]'
                                    }`}
                                  >
                                    <div className="w-12 h-12 rounded-xl overflow-hidden bg-[#101826] border border-white/10 shrink-0 flex items-center justify-center">
                                      <CoverArt
                                        src={station.favicon}
                                        alt={station.name}
                                        fallbackLabel={station.name}
                                        className="w-full h-full object-cover"
                                      />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <p className={`text-sm font-bold truncate ${active ? 'text-[#60A5FA]' : 'text-white'}`}>
                                        {station.name}
                                      </p>
                                      <p className="text-xs text-zinc-400 truncate">{station.country}</p>
                                    </div>
                                    <span className="w-9 h-9 rounded-full bg-gradient-to-br from-[#2563EB] to-[#3B82F6] text-white flex items-center justify-center shrink-0">
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

                      {searchFilter === 'all' && searchResults.tracks.length > 6 && (
                        <section className="space-y-3">
                          <h2 className="font-display text-lg font-bold text-white">{m.moreResults}</h2>
                          {renderTrackList(searchResults.tracks.slice(6))}
                        </section>
                      )}
                    </div>
                  )
                ) : null}
              </>
            ) : (
              <div className="space-y-6">
                {/* Recent Search History */}
                {searchHistory.length > 0 && (
                  <section className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <h2 className="font-display text-sm font-bold text-zinc-300">
                        {m.recentSearchesTitle}
                      </h2>
                      <button
                        type="button"
                        onClick={clearSearchHistory}
                        className="text-xs font-semibold text-zinc-400 hover:text-white cursor-pointer"
                      >
                        {m.clearHistoryBtn}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {searchHistory.map((term) => (
                        <div
                          key={term}
                          className="inline-flex items-center rounded-full bg-[#131318] border border-white/[0.08]"
                        >
                          <button
                            type="button"
                            onClick={() => setSearchQuery(term)}
                            className="min-h-10 pl-3.5 pr-2 text-xs font-semibold text-zinc-200 hover:text-white cursor-pointer"
                          >
                            {term}
                          </button>
                          <button
                            type="button"
                            onClick={() => removeSearchHistory(term)}
                            aria-label={`Eliminar ${term}`}
                            className="w-8 h-8 mr-1 rounded-full text-zinc-500 hover:text-white flex items-center justify-center cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Quick Pick Suggestions + Favorite Imported Artists */}
                <section className="space-y-2.5">
                  <h2 className="font-display text-sm font-bold text-zinc-300">{m.quickSearchesTitle}</h2>
                  <div className="flex flex-wrap gap-2">
                    {[
                      ...tasteProfile.favoriteArtists.slice(0, 4),
                      'Bad Bunny',
                      'Quevedo',
                      'ElGrandeToto',
                      'Rosalía',
                      'Morad',
                      'Burna Boy',
                    ]
                      .filter((v, idx, arr) => arr.indexOf(v) === idx)
                      .slice(0, 8)
                      .map((artist) => (
                        <button
                          key={artist}
                          type="button"
                          onClick={() => {
                            setSearchQuery(artist);
                            addSearchHistory(artist);
                          }}
                          className="min-h-10 px-4 rounded-full bg-[#131318] hover:bg-[#3B82F6]/18 border border-white/[0.08] hover:border-[#3B82F6]/45 text-xs font-semibold text-zinc-100 cursor-pointer transition-colors"
                        >
                          {artist}
                        </button>
                      ))}
                  </div>
                </section>

                {/* Colorful Browse Genres Grid */}
                <section className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#60A5FA]" />
                    <h2 className="font-display text-lg font-bold text-white">{m.exploreByGenre}</h2>
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
                        className="group relative h-26 sm:h-30 rounded-2xl p-4 text-left overflow-hidden cursor-pointer border border-white/10 shadow-lg hover:brightness-110 transition-all"
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
              </div>
            )}
          </div>
        ) : navTab === 'radios' ? (
          <div className="space-y-5 animate-fade-in">
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
                        ? 'bg-gradient-to-r from-[#2563EB] to-[#3B82F6] text-white'
                        : 'bg-[#131318] hover:bg-[#1B1B24] text-zinc-200 border border-white/[0.08]'
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
                          ? 'bg-[#3B82F6]/16 border-[#3B82F6]/60'
                          : 'bg-[#0D0D12] hover:bg-[#14141C] border-white/[0.08]'
                      }`}
                    >
                      <div className="w-13 h-13 rounded-xl overflow-hidden bg-[#101826] border border-white/10 shrink-0">
                        <CoverArt
                          src={station.favicon}
                          alt={station.name}
                          fallbackLabel={station.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-bold truncate ${active ? 'text-[#60A5FA]' : 'text-white'}`}>
                          {station.name}
                        </p>
                        <p className="text-xs text-zinc-400 truncate mt-0.5">
                          {station.country} · {station.tags.slice(0, 2).join(' · ')}
                        </p>
                      </div>
                      <span className="w-10 h-10 rounded-full bg-gradient-to-br from-[#2563EB] to-[#3B82F6] text-white flex items-center justify-center shrink-0">
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
          /* TU BIBLIOTECA — Spotify Screenshot 2 inspired in Riffan Obsidian + Cobalt/Violet */
          <div className="space-y-5 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={() => setProfileDrawerOpen(true)}
                  aria-label="Abrir perfil"
                  className="w-10 h-10 rounded-full bg-gradient-to-br from-[#7C3AED] to-[#2563EB] border border-white/20 text-white font-display font-black text-sm flex items-center justify-center shrink-0 cursor-pointer"
                >
                  {userInitial}
                </button>
                <h1 className="font-display text-2xl sm:text-3xl font-black text-white truncate">
                  {m.libraryTitle}
                </h1>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setShowImportModal(true);
                  }}
                  title="Importar Spotify / Exportify"
                  className="h-10 px-3 rounded-full bg-[#131318] hover:bg-[#1B1B24] border border-[#3B82F6]/35 text-[#93C5FD] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Disc3 className="w-4 h-4" />
                  <span className="hidden sm:inline">Spotify / Exportify</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    clearMusicDetailStack();
                    setNavTab('search');
                  }}
                  aria-label="Buscar en música"
                  className="w-10 h-10 rounded-full hover:bg-white/[0.08] text-white flex items-center justify-center cursor-pointer"
                >
                  <Search className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreatePlaylistModal(true)}
                  aria-label={m.newPlaylist}
                  className="w-10 h-10 rounded-full hover:bg-white/[0.08] text-white flex items-center justify-center cursor-pointer"
                >
                  <Plus className="w-6 h-6" />
                </button>
              </div>
            </div>

            {/* Category Filter Chips */}
            <HorizontalRail compact gapClassName="gap-2">
              {[
                { id: 'all' as const, label: 'Todo' },
                { id: 'playlists' as const, label: 'Listas' },
                { id: 'albums' as const, label: 'Álbumes' },
                { id: 'artists' as const, label: 'Artistas' },
                { id: 'offline' as const, label: `Offline (${offlineTracks.length})` },
              ].map((chip) => {
                const active = libraryFilter === chip.id;
                return (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => setLibraryFilter(chip.id)}
                    className={`min-h-9 px-4 rounded-full text-xs font-bold cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                      active
                        ? 'bg-gradient-to-r from-[#2563EB] to-[#3B82F6] text-white'
                        : 'bg-[#131318] hover:bg-[#1B1B24] text-zinc-200 border border-white/[0.08]'
                    }`}
                  >
                    {chip.label}
                  </button>
                );
              })}
            </HorizontalRail>

            {/* Sort + Layout Bar */}
            <div className="flex items-center justify-between gap-2 text-xs text-zinc-300">
              <button
                type="button"
                onClick={() => setLibrarySort((prev) => (prev === 'recent' ? 'alpha' : 'recent'))}
                className="min-h-9 px-2 rounded-lg hover:bg-white/[0.06] inline-flex items-center gap-1.5 font-semibold cursor-pointer"
              >
                <ArrowUpDown className="w-3.5 h-3.5" />
                <span>{librarySort === 'recent' ? 'Recientes' : 'A–Z'}</span>
              </button>

              <button
                type="button"
                onClick={() => setLibraryLayout((prev) => (prev === 'list' ? 'grid' : 'list'))}
                aria-label="Cambiar vista lista o cuadrícula"
                className="w-9 h-9 rounded-lg hover:bg-white/[0.06] flex items-center justify-center cursor-pointer text-zinc-300"
              >
                {libraryLayout === 'list' ? <Grid className="w-4 h-4" /> : <LayoutList className="w-4 h-4" />}
              </button>
            </div>

            {libraryFilter === 'offline' ? (
              offlineTracks.length === 0 ? (
                <div className="py-14 px-4 text-center rounded-2xl bg-[#0D0D12] border border-white/[0.06] space-y-2">
                  <FolderDown className="w-8 h-8 text-[#60A5FA] mx-auto" />
                  <p className="text-sm font-bold text-white">{m.offlineLibTitle}</p>
                  <p className="text-xs text-zinc-400">{m.offlineLibEmpty}</p>
                </div>
              ) : (
                renderTrackList(offlineTracks)
              )
            ) : (
              <div
                className={
                  libraryLayout === 'grid'
                    ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5'
                    : 'space-y-1.5'
                }
              >
                {/* Pinned Canciones que te gustan */}
                {(libraryFilter === 'all' || libraryFilter === 'playlists') && (
                  <button
                    type="button"
                    onClick={() => pushMusicDetail({ kind: 'liked' })}
                    className={
                      libraryLayout === 'grid'
                        ? 'p-2.5 rounded-2xl bg-[#0D0D12] hover:bg-[#14141C] border border-white/[0.06] text-left cursor-pointer space-y-2.5'
                        : 'w-full p-2 rounded-2xl hover:bg-white/[0.05] flex items-center gap-3.5 text-left cursor-pointer'
                    }
                  >
                    <div
                      className={`${
                        libraryLayout === 'grid' ? 'w-full aspect-square rounded-xl' : 'w-14 h-14 rounded-xl shrink-0'
                      } bg-gradient-to-br from-[#7C3AED] via-[#3B82F6] to-[#60A5FA] flex items-center justify-center`}
                    >
                      <Heart className={`${libraryLayout === 'grid' ? 'w-12 h-12' : 'w-6 h-6'} text-white fill-current`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm sm:text-base font-bold text-white truncate">{m.likedSongs}</p>
                      <p className="text-xs text-zinc-400 truncate mt-0.5 tabular-nums">
                        Lista · {likedTracks.length} {m.songsCount}
                      </p>
                    </div>
                  </button>
                )}

                {/* User Playlists */}
                {(libraryFilter === 'all' || libraryFilter === 'playlists') &&
                  sortedUserPlaylists.map((pl) => (
                    <button
                      key={pl.id}
                      type="button"
                      onClick={() => pushMusicDetail({ kind: 'user_playlist', playlistId: pl.id })}
                      className={
                        libraryLayout === 'grid'
                          ? 'p-2.5 rounded-2xl bg-[#0D0D12] hover:bg-[#14141C] border border-white/[0.06] text-left cursor-pointer space-y-2.5'
                          : 'w-full p-2 rounded-2xl hover:bg-white/[0.05] flex items-center gap-3.5 text-left cursor-pointer'
                      }
                    >
                      <PlaylistCollageArt
                        tracks={pl.tracks}
                        title={pl.name}
                        sizeClassName={
                          libraryLayout === 'grid' ? 'w-full aspect-square rounded-xl' : 'w-14 h-14 rounded-xl'
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm sm:text-base font-bold text-white truncate">{pl.name}</p>
                        <p className="text-xs text-zinc-400 truncate mt-0.5 tabular-nums">
                          {m.playlistLabel} · {pl.tracks.length} {m.songsCount}
                        </p>
                      </div>
                    </button>
                  ))}

                {/* Saved Playlists */}
                {(libraryFilter === 'all' || libraryFilter === 'playlists') &&
                  sortedSavedPlaylists.map((pl) => (
                    <button
                      key={pl.id}
                      type="button"
                      onClick={() => openPlaylistDetail(pl.id, pl)}
                      className={
                        libraryLayout === 'grid'
                          ? 'p-2.5 rounded-2xl bg-[#0D0D12] hover:bg-[#14141C] border border-white/[0.06] text-left cursor-pointer space-y-2.5'
                          : 'w-full p-2 rounded-2xl hover:bg-white/[0.05] flex items-center gap-3.5 text-left cursor-pointer'
                      }
                    >
                      <CoverArt
                        src={pl.cover}
                        alt={pl.title}
                        fallbackLabel={pl.title}
                        className={
                          libraryLayout === 'grid'
                            ? 'w-full aspect-square rounded-xl object-cover'
                            : 'w-14 h-14 rounded-xl object-cover shrink-0'
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm sm:text-base font-bold text-white truncate">{pl.title}</p>
                        <p className="text-xs text-zinc-400 truncate mt-0.5">
                          {m.playlistLabel} · {pl.creator || 'Editorial'}
                        </p>
                      </div>
                    </button>
                  ))}

                {/* Saved Albums */}
                {(libraryFilter === 'all' || libraryFilter === 'albums') &&
                  sortedSavedAlbums.map((alb) => (
                    <button
                      key={alb.id}
                      type="button"
                      onClick={() => openAlbumDetail(alb.id, alb)}
                      className={
                        libraryLayout === 'grid'
                          ? 'p-2.5 rounded-2xl bg-[#0D0D12] hover:bg-[#14141C] border border-white/[0.06] text-left cursor-pointer space-y-2.5'
                          : 'w-full p-2 rounded-2xl hover:bg-white/[0.05] flex items-center gap-3.5 text-left cursor-pointer'
                      }
                    >
                      <CoverArt
                        src={alb.cover}
                        alt={alb.title}
                        fallbackLabel={alb.title}
                        className={
                          libraryLayout === 'grid'
                            ? 'w-full aspect-square rounded-xl object-cover'
                            : 'w-14 h-14 rounded-xl object-cover shrink-0'
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm sm:text-base font-bold text-white truncate">{alb.title}</p>
                        <p className="text-xs text-zinc-400 truncate mt-0.5">
                          {m.albumLabel} · {alb.artist?.name || ''}
                        </p>
                      </div>
                    </button>
                  ))}

                {/* Favorite / Recent Artists (circular) */}
                {(libraryFilter === 'all' || libraryFilter === 'artists') &&
                  libraryArtists.map((art) => (
                    <button
                      key={`lib-art-${art.id}-${art.name}`}
                      type="button"
                      onClick={() =>
                        isOpenableArtistId(art.id)
                          ? openArtistDetail(art.id, art)
                          : void startArtistRadio(art)
                      }
                      className={
                        libraryLayout === 'grid'
                          ? 'p-2.5 rounded-2xl bg-[#0D0D12] hover:bg-[#14141C] border border-white/[0.06] text-center cursor-pointer space-y-2.5'
                          : 'w-full p-2 rounded-2xl hover:bg-white/[0.05] flex items-center gap-3.5 text-left cursor-pointer'
                      }
                    >
                      <CoverArt
                        src={art.picture}
                        alt={art.name}
                        fallbackLabel={art.name}
                        className={
                          libraryLayout === 'grid'
                            ? 'w-full aspect-square rounded-full object-cover'
                            : 'w-14 h-14 rounded-full object-cover shrink-0'
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm sm:text-base font-bold text-white truncate">{art.name}</p>
                        <p className="text-xs text-zinc-400 mt-0.5">{m.artistRole}</p>
                      </div>
                    </button>
                  ))}
              </div>
            )}

            {recentTracks.length > 0 && libraryFilter === 'all' && (
              <section className="space-y-3 pt-2">
                <h2 className="font-display text-lg font-bold text-white">{m.recentlyPlayed}</h2>
                {renderTrackList(recentTracks.slice(0, 12))}
              </section>
            )}
          </div>
        )}
      </div>

      {/* Slide-Over Studio & Account Tools Drawer (Opened by User Avatar) */}
      {profileDrawerOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex justify-start"
          onClick={() => setProfileDrawerOpen(false)}
        >
          <aside
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[320px] h-full bg-[#0C0C0F] border-r border-white/[0.1] p-5 flex flex-col gap-5 overflow-y-auto no-scrollbar shadow-2xl"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-11 h-11 rounded-full bg-gradient-to-br from-[#7C3AED] to-[#2563EB] text-white font-display font-black text-base flex items-center justify-center shrink-0">
                  {userInitial}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white truncate">{storedProfile.name || 'Riffan'}</p>
                  <p className="text-xs text-zinc-400">Riffan Music Studio</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setProfileDrawerOpen(false)}
                aria-label={m.back}
                className="w-9 h-9 rounded-full hover:bg-white/10 text-zinc-400 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Listening Stats */}
            <div className="p-3.5 rounded-2xl bg-[#131318] border border-white/[0.08] space-y-2.5">
              <p className="text-xs font-bold text-zinc-300">{m.statsTitle}</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-base font-black text-white tabular-nums">{listeningStats.totalPlays}</p>
                  <p className="text-[10px] text-zinc-400">{m.statsPlaysLabel}</p>
                </div>
                <div>
                  <p className="text-base font-black text-white tabular-nums">
                    {Math.round((listeningStats.totalListenSec || 0) / 60)}
                  </p>
                  <p className="text-[10px] text-zinc-400">{m.statsMinutesLabel}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[#60A5FA] truncate">{topStatArtist}</p>
                  <p className="text-[10px] text-zinc-400">{m.statsTopArtistLabel}</p>
                </div>
              </div>
            </div>

            {/* Quick Pro Studio & Sync Tools */}
            <div className="space-y-1.5">
              {[
                {
                  label: 'Importar Spotify / Exportify',
                  sub: 'Conectar, CSV o YouTube Music',
                  icon: <Disc3 className="w-4 h-4 text-[#60A5FA]" />,
                  onClick: () => {
                    setProfileDrawerOpen(false);
                    setShowImportModal(true);
                  },
                },
                {
                  label: 'Estudio 8D & Ecualizador',
                  sub: '10 bandas, FX, Slowed/Nightcore, MP3',
                  icon: <Headphones className="w-4 h-4 text-[#A78BFA]" />,
                  onClick: () => {
                    setProfileDrawerOpen(false);
                    setShowEqModal(true);
                  },
                },
                {
                  label: m.downloadsTitle,
                  sub: `${offlineTracks.length} offline`,
                  icon: <FolderDown className="w-4 h-4 text-sky-400" />,
                  onClick: () => {
                    setProfileDrawerOpen(false);
                    setShowDownloadDrawer(true);
                  },
                },
                {
                  label: m.driveModeBtn,
                  sub: 'Controles grandes para coche',
                  icon: <Car className="w-4 h-4 text-emerald-400" />,
                  onClick: () => {
                    setProfileDrawerOpen(false);
                    setDriveModeOpen(true);
                  },
                },
              ].map((tool) => (
                <button
                  key={tool.label}
                  type="button"
                  onClick={tool.onClick}
                  className="w-full min-h-12 p-3 rounded-2xl bg-[#131318] hover:bg-[#1B1B24] border border-white/[0.06] flex items-center gap-3 text-left cursor-pointer transition-colors"
                >
                  <span className="w-9 h-9 rounded-xl bg-white/[0.06] flex items-center justify-center shrink-0">
                    {tool.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-white truncate">{tool.label}</p>
                    <p className="text-[11px] text-zinc-400 truncate">{tool.sub}</p>
                  </div>
                </button>
              ))}
            </div>

            {/* Language Selector */}
            <div className="space-y-2">
              <p className="text-xs font-bold text-zinc-400">{m.languageTitle}</p>
              <div className="flex flex-wrap gap-1.5">
                {MUSIC_LANGUAGES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setMusicLang(item.id)}
                    className={`min-h-9 px-3 rounded-xl text-xs font-bold cursor-pointer transition-colors ${
                      musicLang === item.id
                        ? 'bg-[#3B82F6] text-white'
                        : 'bg-white/[0.06] text-zinc-300 hover:text-white'
                    }`}
                  >
                    {item.code}
                  </button>
                ))}
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* Mobile Fixed Spotify-Inspired 5-Tab Bottom Nav */}
      <nav
        aria-label={m.playerRegionAria}
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 h-16 bg-[#07080D]/95 backdrop-blur-2xl border-t border-white/[0.08] pb-safe flex items-center justify-around px-1"
      >
        {[
          { id: 'home' as const, label: 'Inicio', icon: Home },
          { id: 'search' as const, label: 'Buscar', icon: Search },
          { id: 'library' as const, label: 'Tu biblioteca', icon: Library },
          { id: 'radios' as const, label: 'Radios', icon: Radio },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = navTab === tab.id && !detail;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                triggerHaptic('light');
                clearMusicDetailStack();
                setNavTab(tab.id);
              }}
              className={`flex-1 min-h-11 flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-colors ${
                active ? 'text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Icon className={`w-5 h-5 ${active ? 'text-[#60A5FA]' : ''}`} />
              <span className="text-[10px] font-semibold leading-none truncate">{tab.label}</span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => {
            triggerHaptic('light');
            setShowImportModal(true);
          }}
          className="flex-1 min-h-11 flex flex-col items-center justify-center gap-0.5 cursor-pointer text-zinc-400 hover:text-[#60A5FA] transition-colors"
        >
          <Disc3 className="w-5 h-5 text-[#60A5FA]" />
          <span className="text-[10px] font-semibold leading-none truncate">Importar</span>
        </button>
      </nav>
    </div>
  );
};
