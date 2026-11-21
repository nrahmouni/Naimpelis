import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  FileUp,
  Heart,
  Link2,
  ListMusic,
  Loader2,
  LogIn,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useMusicStore } from '../../store/useMusicStore';
import { useBackInterceptor } from '../../lib/backInterceptor';
import { triggerHaptic } from '../../utils/haptics';
import { parseMusicImportText } from '../../services/musicImporter';
import {
  connectAndImportSpotifyAccount,
  connectAndImportYoutubeAccount,
  fetchSpotifyOAuthStatus,
  initMusicOAuthMemoryCleanup,
  type FullOAuthImportResult,
  type SpotifyOAuthStatus,
} from '../../services/musicPlatformOAuth';
import type { ImportedTrackInput, MusicTrack } from '../../types/music';
import { MUSIC_I18N } from './musicI18n';
import { CoverArt } from './CoverArt';
import { RiffanMusicLogo } from './RiffanMusicLogo';

export const MUSIC_IMPORT_PROMPT_SEEN_KEY = 'riffan_music_import_prompt_seen_v1';

const QUICK_TASTE_GENRES = [
  'Urbano',
  'Reggaeton',
  'Pop',
  'Hip-Hop',
  'Flamenco',
  'Electrónica',
  'Rock',
  'Lo-Fi',
  'Árabe',
  'Afrobeats',
] as const;

function markImportPromptSeen() {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(MUSIC_IMPORT_PROMPT_SEEN_KEY, '1');
    }
  } catch {
    // ignore storage errors
  }
}

interface ImportPreviewState {
  sourceProvider: 'spotify' | 'youtube_music' | 'file';
  title: string;
  warning?: string;
  rawInputs: ImportedTrackInput[];
  matchedTracks: MusicTrack[];
  detectedArtists: string[];
  detectedGenres: string[];
}

export const SpotifyYtmImportModal: React.FC<{
  onImportedToast?: (msg: string) => void;
}> = ({ onImportedToast }) => {
  const showImportModal = useMusicStore((s) => s.showImportModal);
  const setShowImportModal = useMusicStore((s) => s.setShowImportModal);
  const musicLang = useMusicStore((s) => s.musicLang);
  const tasteProfile = useMusicStore((s) => s.tasteProfile);
  const musicToast = useMusicStore((s) => s.musicToast);
  const showMusicToast = useMusicStore((s) => s.showMusicToast);
  const importTracksIntoLikes = useMusicStore((s) => s.importTracksIntoLikes);
  const importTracksIntoPlaylist = useMusicStore((s) => s.importTracksIntoPlaylist);
  const mergeTasteProfile = useMusicStore((s) => s.mergeTasteProfile);
  const removeFavoriteArtist = useMusicStore((s) => s.removeFavoriteArtist);
  const removeFavoriteGenre = useMusicStore((s) => s.removeFavoriteGenre);
  const playTrack = useMusicStore((s) => s.playTrack);
  const m = MUSIC_I18N[musicLang];

  const [tab, setTab] = useState<'connect' | 'link' | 'file' | 'taste'>('connect');
  const [linkUrl, setLinkUrl] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [loading, setLoading] = useState(false);
  const [matching, setMatching] = useState(false);
  const [oauthLoadingProvider, setOauthLoadingProvider] = useState<
    'spotify' | 'youtube_music' | null
  >(null);
  const [spotifyStatus, setSpotifyStatus] = useState<SpotifyOAuthStatus | null>(null);
  const [copiedCallback, setCopiedCallback] = useState(false);
  const [oauthPreview, setOauthPreview] = useState<FullOAuthImportResult | null>(null);
  const [selectedPlaylistIds, setSelectedPlaylistIds] = useState<Set<string>>(new Set());
  const [includeOAuthLikes, setIncludeOAuthLikes] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreviewState | null>(null);
  const [targetDest, setTargetDest] = useState<'likes' | 'playlist' | 'taste'>('likes');
  const [customPlaylistName, setCustomPlaylistName] = useState('');
  const [artistInput, setArtistInput] = useState('');
  const [mixLoading, setMixLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    initMusicOAuthMemoryCleanup();
  }, []);

  useEffect(() => {
    if (!showImportModal) return;
    let active = true;
    fetchSpotifyOAuthStatus()
      .then((status) => {
        if (active) setSpotifyStatus(status);
      })
      .catch(() => {
        // ignore status check error
      });
    return () => {
      active = false;
    };
  }, [showImportModal]);

  const dismissModal = () => {
    markImportPromptSeen();
    setShowImportModal(false);
  };

  useBackInterceptor(showImportModal, 'music-import-modal', dismissModal, {
    priority: 26,
  });

  const emitToast = (msg: string) => {
    showMusicToast(msg);
    onImportedToast?.(msg);
  };

  const handleCopyCallbackUrl = async () => {
    const urlToCopy = spotifyStatus?.activeCallbackUrl || spotifyStatus?.devCallbackUrl;
    if (!urlToCopy) return;
    try {
      await navigator.clipboard.writeText(urlToCopy);
      setCopiedCallback(true);
      setTimeout(() => setCopiedCallback(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleConnectYoutube = async () => {
    setErrorMsg(null);
    setOauthPreview(null);
    setPreview(null);
    setOauthLoadingProvider('youtube_music');
    triggerHaptic('medium');
    try {
      const payload = await connectAndImportYoutubeAccount();
      setOauthPreview(payload);
      setSelectedPlaylistIds(new Set(payload.playlists.map((p) => p.id)));
      setIncludeOAuthLikes(true);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'No se pudo conectar con Google / YouTube Music.'
      );
    } finally {
      setOauthLoadingProvider(null);
    }
  };

  const handleConnectSpotify = async () => {
    setErrorMsg(null);
    setOauthPreview(null);
    setPreview(null);
    setOauthLoadingProvider('spotify');
    triggerHaptic('medium');
    try {
      const payload = await connectAndImportSpotifyAccount();
      setOauthPreview(payload);
      setSelectedPlaylistIds(new Set(payload.playlists.map((p) => p.id)));
      setIncludeOAuthLikes(true);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'No se pudo conectar con Spotify.'
      );
    } finally {
      setOauthLoadingProvider(null);
    }
  };

  const handleToggleOAuthPlaylist = (id: string) => {
    triggerHaptic('light');
    setSelectedPlaylistIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCommitOAuthImport = () => {
    if (!oauthPreview) return;
    triggerHaptic('medium');
    markImportPromptSeen();

    let likedAdded = 0;
    if (includeOAuthLikes && oauthPreview.likedTracks.length > 0) {
      likedAdded = importTracksIntoLikes(oauthPreview.likedTracks);
    }

    let playlistsCreated = 0;
    let totalTracksCount = likedAdded;
    for (const pl of oauthPreview.playlists) {
      if (!selectedPlaylistIds.has(pl.id) || pl.tracks.length === 0) continue;
      importTracksIntoPlaylist(pl.name, pl.description, pl.tracks);
      playlistsCreated += 1;
      totalTracksCount += pl.tracks.length;
    }

    mergeTasteProfile({
      artists: oauthPreview.favoriteArtists,
      genres: oauthPreview.favoriteGenres,
      source: {
        provider: oauthPreview.provider,
        label: oauthPreview.accountLabel || oauthPreview.provider,
        trackCount: totalTracksCount || oauthPreview.totalTracksImported,
      },
    });

    const summaryParts: string[] = [];
    if (likedAdded > 0) summaryParts.push(`+${likedAdded} ${m.likedSongs}`);
    if (playlistsCreated > 0) summaryParts.push(`${playlistsCreated} playlists`);
    if (oauthPreview.favoriteArtists.length > 0) {
      summaryParts.push(`${oauthPreview.favoriteArtists.length} ${m.artistsSection.toLowerCase()}`);
    }

    emitToast(`${m.importSuccessToast}: ${summaryParts.join(' · ') || oauthPreview.accountLabel}`);
    setOauthPreview(null);
    setShowImportModal(false);
  };

  const matchBatchOnServer = async (items: ImportedTrackInput[]): Promise<MusicTrack[]> => {
    if (items.length === 0) return [];
    setMatching(true);
    try {
      const res = await fetch('/api/music/match-tracks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: items.slice(0, 45) }),
      });
      const data = await res.json();
      if (data?.success && Array.isArray(data.tracks)) {
        return data.tracks as MusicTrack[];
      }
      return [];
    } catch {
      return [];
    } finally {
      setMatching(false);
    }
  };

  const handleAnalyzeLink = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = linkUrl.trim();
    if (!clean) return;
    setErrorMsg(null);
    setPreview(null);
    setOauthPreview(null);
    setLoading(true);
    triggerHaptic('light');

    try {
      const res = await fetch('/api/music/import-external', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: clean }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        setErrorMsg(data?.error || data?.warning || 'No se pudo analizar ese enlace.');
        setLoading(false);
        return;
      }

      const rawInputs: ImportedTrackInput[] = Array.isArray(data.tracks) ? data.tracks : [];
      const detectedArtists: string[] = Array.isArray(data.topArtists)
        ? data.topArtists
        : Array.isArray(data.detectedArtists)
        ? data.detectedArtists
        : [];
      const title = String(data.title || 'Playlist Importada');
      setCustomPlaylistName(title);
      setLoading(false);

      const matched = await matchBatchOnServer(rawInputs);
      setPreview({
        sourceProvider: data.provider === 'youtube_music' ? 'youtube_music' : 'spotify',
        title,
        warning: data.warning,
        rawInputs,
        matchedTracks: matched,
        detectedArtists,
        detectedGenres: [],
      });
    } catch {
      setLoading(false);
      setErrorMsg('Error de conexión al analizar el enlace.');
    }
  };

  const handleParsedContent = async (rawContent: string, fileName = '') => {
    const clean = rawContent.trim();
    if (!clean) return;
    setErrorMsg(null);
    setPreview(null);
    setOauthPreview(null);
    triggerHaptic('light');

    const parsed = parseMusicImportText(clean, fileName);
    if (parsed.tracks.length === 0 && parsed.topArtists.length === 0) {
      setErrorMsg('No se detectaron canciones o artistas válidos en el archivo o texto.');
      return;
    }

    const title = parsed.playlistTitle || 'Lista Importada';
    setCustomPlaylistName(title);
    const provider: 'spotify' | 'youtube_music' | 'file' = parsed.format.startsWith('spotify')
      ? 'spotify'
      : parsed.format === 'youtube_takeout'
      ? 'youtube_music'
      : 'file';

    const matched = await matchBatchOnServer(parsed.tracks);
    setPreview({
      sourceProvider: provider,
      title,
      rawInputs: parsed.tracks,
      matchedTracks: matched,
      detectedArtists: parsed.topArtists,
      detectedGenres: parsed.topGenres,
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      await handleParsedContent(text, file.name);
    } catch {
      setErrorMsg('No se pudo leer el archivo seleccionado.');
    } finally {
      e.target.value = '';
    }
  };

  const handleCommitImport = () => {
    if (!preview) return;
    triggerHaptic('medium');
    markImportPromptSeen();

    const artistsToMerge = Array.from(
      new Set([
        ...preview.detectedArtists,
        ...preview.matchedTracks.map((t) => t.artist.name.split(',')[0].trim()).filter(Boolean),
      ])
    ).slice(0, 30);

    mergeTasteProfile({
      artists: artistsToMerge,
      genres: preview.detectedGenres,
      source: {
        provider: preview.sourceProvider,
        label: preview.title,
        trackCount: preview.matchedTracks.length || preview.rawInputs.length,
      },
    });

    if (targetDest === 'likes' && preview.matchedTracks.length > 0) {
      const added = importTracksIntoLikes(preview.matchedTracks);
      emitToast(`${m.importSuccessToast}: +${added} ${m.likedSongs}`);
    } else if (targetDest === 'playlist' && preview.matchedTracks.length > 0) {
      const plName = customPlaylistName.trim() || preview.title;
      importTracksIntoPlaylist(
        plName,
        `${preview.sourceProvider.toUpperCase()} · ${preview.matchedTracks.length} ${m.songsCount}`,
        preview.matchedTracks
      );
      emitToast(`${m.importSuccessToast}: ${plName}`);
    } else {
      emitToast(`${m.importSuccessToast}: ${artistsToMerge.length} artistas`);
    }

    setPreview(null);
    setLinkUrl('');
    setPasteText('');
    setShowImportModal(false);
  };

  const handleAddManualTaste = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = artistInput.trim();
    if (!clean) return;
    triggerHaptic('light');
    mergeTasteProfile({ artists: [clean] });
    setArtistInput('');
  };

  const handleToggleQuickGenre = (genre: string) => {
    triggerHaptic('light');
    const exists = tasteProfile.favoriteGenres.some(
      (g) => g.toLowerCase() === genre.toLowerCase()
    );
    if (exists) {
      removeFavoriteGenre(
        tasteProfile.favoriteGenres.find((g) => g.toLowerCase() === genre.toLowerCase()) || genre
      );
    } else {
      mergeTasteProfile({ genres: [genre] });
    }
  };

  const handlePlayTasteMix = async () => {
    const queries = [
      ...tasteProfile.favoriteArtists.slice(0, 4),
      ...tasteProfile.favoriteGenres.slice(0, 3),
    ];
    if (queries.length === 0) return;
    setMixLoading(true);
    triggerHaptic('medium');
    markImportPromptSeen();
    try {
      const responses = await Promise.all(
        queries.map((q) =>
          fetch(`/api/music/search?q=${encodeURIComponent(q)}`)
            .then((r) => r.json())
            .catch(() => null)
        )
      );
      const collected: MusicTrack[] = [];
      const seen = new Set<string>();
      for (const r of responses) {
        const list: MusicTrack[] = Array.isArray(r?.tracks) ? r.tracks : [];
        for (const t of list.slice(0, 5)) {
          if (!seen.has(t.id)) {
            seen.add(t.id);
            collected.push(t);
          }
        }
      }
      if (collected.length > 0) {
        const shuffled = [...collected].sort(() => Math.random() - 0.5);
        playTrack(shuffled[0], shuffled);
        emitToast(`${m.forYouImportedTitle}`);
        setShowImportModal(false);
      } else {
        setErrorMsg('No se encontraron temas reproducibles para esos gustos.');
      }
    } finally {
      setMixLoading(false);
    }
  };

  const hasAnyTaste =
    tasteProfile.favoriteArtists.length > 0 || tasteProfile.favoriteGenres.length > 0;

  return (
    <>
      {musicToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-24 sm:bottom-28 left-1/2 -translate-x-1/2 z-[90] max-w-[92vw] px-4 py-2.5 rounded-2xl bg-[#131318]/95 backdrop-blur-2xl border border-[#3B82F6]/45 text-white text-xs font-bold shadow-[0_14px_40px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.14)] flex items-center gap-2 pointer-events-none animate-fade-in"
        >
          <Sparkles className="w-4 h-4 text-[#60A5FA] shrink-0" />
          <span className="truncate">{musicToast}</span>
        </div>
      )}

      {showImportModal && (
        <div
          className="fixed inset-0 z-50 bg-black/82 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in"
          onClick={dismissModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={m.importTitle}
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-xl max-h-[92dvh] rounded-t-3xl sm:rounded-3xl bg-[#0C0C0F] border border-white/[0.12] shadow-[0_28px_90px_rgba(0,0,0,0.94),inset_0_1px_0_rgba(255,255,255,0.14)] flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="shrink-0 px-4 sm:px-6 pt-4 pb-3 border-b border-white/[0.08] flex items-center justify-between gap-2 bg-[#131318]">
              <div className="flex items-center gap-3 min-w-0">
                <RiffanMusicLogo variant="mark" size={38} frameStyle="obsidian" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-[#60A5FA] font-semibold">
                      {m.importWelcomeBadge}
                    </span>
                  </div>
                  <h3 className="font-display text-sm sm:text-base font-extrabold text-white truncate">
                    {m.importTitle}
                  </h3>
                  <p className="text-[11px] text-zinc-400 truncate">{m.importSub}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={dismissModal}
                aria-label={m.cancel}
                className="w-9 h-9 rounded-full bg-white/[0.06] hover:bg-white/[0.14] border border-white/[0.08] text-zinc-300 hover:text-white flex items-center justify-center cursor-pointer shrink-0 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 4-Tab Switcher */}
            <div className="shrink-0 px-4 sm:px-6 pt-3 pb-2.5 border-b border-white/[0.06] bg-[#0C0C0F]">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {(
                  [
                    { id: 'connect', label: m.importTabConnect, icon: LogIn },
                    { id: 'link', label: m.importTabLink, icon: Link2 },
                    { id: 'file', label: m.importTabFile, icon: FileUp },
                    { id: 'taste', label: m.importTabTaste, icon: Heart },
                  ] as const
                ).map((item) => {
                  const Icon = item.icon;
                  const active = tab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        setTab(item.id);
                        setErrorMsg(null);
                      }}
                      className={`h-9 px-2 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                        active
                          ? 'bg-[#3B82F6]/20 border border-[#3B82F6]/60 text-[#93C5FD] shadow-[0_0_18px_rgba(59,130,246,0.2)]'
                          : 'bg-[#131318] hover:bg-[#1B1B22] border border-white/[0.08] text-zinc-400 hover:text-white'
                      }`}
                    >
                      <Icon className={`w-3.5 h-3.5 shrink-0 ${active && item.id === 'taste' ? 'text-[#FF2D55]' : ''}`} />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
              {errorMsg && (
                <div className="p-3 rounded-2xl bg-[#FF2D55]/12 border border-[#FF2D55]/40 text-xs text-rose-200 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-[#FF2D55] shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {tab === 'connect' && (
                <div className="space-y-3.5">
                  {oauthLoadingProvider && (
                    <div className="p-4 rounded-2xl bg-[#3B82F6]/12 border border-[#3B82F6]/45 flex items-center gap-3 text-xs text-blue-100">
                      <Loader2 className="w-5 h-5 text-[#60A5FA] animate-spin shrink-0" />
                      <span className="font-semibold">{m.oauthImportingAll}</span>
                    </div>
                  )}

                  {/* YouTube / YouTube Music Google Sign-In Card */}
                  <div className="p-4 rounded-2xl bg-[#131318] border border-white/[0.1] space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[#FF0033]/15 border border-[#FF0033]/35 flex items-center justify-center shrink-0">
                        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
                          <circle cx="12" cy="12" r="10" fill="#FF0033" />
                          <polygon points="10,8.5 16.5,12 10,15.5" fill="#FFFFFF" />
                        </svg>
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-xs sm:text-sm font-extrabold text-white">
                          {m.connectYoutubeTitle}
                        </h4>
                        <p className="text-[11px] text-zinc-400 leading-relaxed mt-0.5">
                          {m.connectYoutubeSub}
                        </p>
                      </div>
                    </div>

                    {/* Official Google Sign-In Button Styling */}
                    <button
                      type="button"
                      disabled={Boolean(oauthLoadingProvider)}
                      onClick={() => void handleConnectYoutube()}
                      className="w-full h-11 px-4 rounded-xl bg-white hover:bg-zinc-100 text-[#1F1F1F] font-semibold text-xs sm:text-sm inline-flex items-center justify-center gap-2.5 shadow-[0_6px_20px_rgba(0,0,0,0.4)] cursor-pointer disabled:opacity-50 transition-all"
                    >
                      {oauthLoadingProvider === 'youtube_music' ? (
                        <Loader2 className="w-4 h-4 animate-spin text-[#4285F4]" />
                      ) : (
                        <svg viewBox="0 0 48 48" className="w-4.5 h-4.5 shrink-0">
                          <path
                            fill="#EA4335"
                            d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                          />
                          <path
                            fill="#4285F4"
                            d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                          />
                          <path
                            fill="#FBBC05"
                            d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                          />
                          <path
                            fill="#34A853"
                            d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                          />
                        </svg>
                      )}
                      <span>{m.connectYoutubeBtn}</span>
                    </button>
                  </div>

                  {/* Spotify Login Card */}
                  <div className="p-4 rounded-2xl bg-[#131318] border border-white/[0.1] space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[#1DB954]/15 border border-[#1DB954]/35 flex items-center justify-center shrink-0">
                        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="#1DB954">
                          <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                        </svg>
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-xs sm:text-sm font-extrabold text-white">
                          {m.connectSpotifyTitle}
                        </h4>
                        <p className="text-[11px] text-zinc-400 leading-relaxed mt-0.5">
                          {m.connectSpotifySub}
                        </p>
                      </div>
                    </div>

                    {spotifyStatus?.configured ? (
                      <button
                        type="button"
                        disabled={Boolean(oauthLoadingProvider)}
                        onClick={() => void handleConnectSpotify()}
                        className="w-full h-11 px-4 rounded-xl bg-[#1DB954] hover:bg-[#1ed760] text-black font-extrabold text-xs sm:text-sm inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shadow-[0_8px_24px_rgba(29,185,84,0.28)] transition-all"
                      >
                        {oauthLoadingProvider === 'spotify' ? (
                          <Loader2 className="w-4 h-4 animate-spin text-black" />
                        ) : (
                          <LogIn className="w-4 h-4" />
                        )}
                        <span>{m.connectSpotifyBtn}</span>
                      </button>
                    ) : (
                      <div className="space-y-2.5">
                        <div className="p-2.5 rounded-xl bg-[#0C0C0F] border border-white/[0.08] text-[11px] text-zinc-400 space-y-1.5">
                          <p className="text-zinc-300 font-semibold">
                            Activa las credenciales de Spotify en AI Studio Secrets (
                            <span className="font-mono text-[#93C5FD]">SPOTIFY_CLIENT_ID</span> +{' '}
                            <span className="font-mono text-[#93C5FD]">SPOTIFY_CLIENT_SECRET</span>)
                            con esta Redirect URI:
                          </p>
                          {spotifyStatus?.activeCallbackUrl && (
                            <div className="flex items-center gap-1.5">
                              <code className="flex-1 truncate px-2 py-1 rounded-lg bg-[#131318] border border-white/[0.08] text-[10px] font-mono text-[#93C5FD]">
                                {spotifyStatus.activeCallbackUrl}
                              </code>
                              <button
                                type="button"
                                onClick={() => void handleCopyCallbackUrl()}
                                className="h-7 px-2 rounded-lg bg-white/[0.08] hover:bg-white/[0.15] text-[10px] font-bold text-white inline-flex items-center gap-1 cursor-pointer shrink-0"
                              >
                                <Copy className="w-3 h-3" />
                                <span>{copiedCallback ? 'OK' : 'Copiar'}</span>
                              </button>
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => setTab('link')}
                          className="w-full h-10 px-3 rounded-xl bg-[#3B82F6]/16 hover:bg-[#3B82F6]/25 border border-[#3B82F6]/45 text-[#93C5FD] font-bold text-xs inline-flex items-center justify-center gap-2 cursor-pointer transition-colors"
                        >
                          <Link2 className="w-3.5 h-3.5" />
                          <span>O pega tu enlace de Perfil / Playlist pública ahora</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {tab === 'link' && (
                <form onSubmit={handleAnalyzeLink} className="space-y-3">
                  <div className="space-y-2">
                    <input
                      type="url"
                      value={linkUrl}
                      onChange={(e) => setLinkUrl(e.target.value)}
                      placeholder={m.importLinkPlaceholder}
                      className="w-full h-11 px-3.5 rounded-xl bg-[#131318] border border-white/[0.12] focus:border-[#3B82F6] text-xs sm:text-sm text-white placeholder:text-zinc-500 outline-none transition-colors"
                    />
                    <p className="text-[11px] text-zinc-400 leading-relaxed">{m.importLinkHelp}</p>
                  </div>

                  <button
                    type="submit"
                    disabled={loading || matching || !linkUrl.trim()}
                    className="w-full h-11 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#3B82F6] hover:brightness-110 text-white font-extrabold text-xs sm:text-sm inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-45 shadow-[0_8px_24px_rgba(37,99,235,0.35)] transition-all"
                  >
                    {loading || matching ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>{matching ? m.importMatchingLabel : '...'}</span>
                      </>
                    ) : (
                      <>
                        <Link2 className="w-4 h-4" />
                        <span>{m.importLinkBtn}</span>
                      </>
                    )}
                  </button>

                  <div className="p-3 rounded-2xl bg-[#131318] border border-white/[0.08] text-[11px] text-zinc-400 leading-relaxed">
                    Soporta playlists públicas, álbumes, perfiles de Spotify (`open.spotify.com/user/...`) y canales/playlists de YouTube (`@usuario` o `playlist?list=...`).
                  </div>
                </form>
              )}

              {tab === 'file' && (
                <div className="space-y-3.5">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,.csv,.m3u,.m3u8,.txt,application/json,text/csv,text/plain"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full p-4 rounded-2xl border border-dashed border-[#3B82F6]/45 bg-[#3B82F6]/10 hover:bg-[#3B82F6]/16 text-center space-y-1.5 cursor-pointer transition-colors"
                  >
                    <FileUp className="w-6 h-6 text-[#60A5FA] mx-auto" />
                    <p className="text-xs sm:text-sm font-bold text-white">{m.importFileDrop}</p>
                  </button>

                  <div className="space-y-2">
                    <textarea
                      rows={4}
                      value={pasteText}
                      onChange={(e) => setPasteText(e.target.value)}
                      placeholder={m.importFilePastePlaceholder}
                      className="w-full p-3 rounded-xl bg-[#131318] border border-white/[0.12] focus:border-[#3B82F6] text-xs text-white placeholder:text-zinc-500 outline-none resize-none transition-colors"
                    />
                    <button
                      type="button"
                      disabled={matching || !pasteText.trim()}
                      onClick={() => void handleParsedContent(pasteText)}
                      className="w-full h-10 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#3B82F6] hover:brightness-110 text-white font-extrabold text-xs inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-45 shadow-[0_6px_20px_rgba(37,99,235,0.3)] transition-all"
                    >
                      {matching ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>{m.importMatchingLabel}</span>
                        </>
                      ) : (
                        <span>{m.importParseBtn}</span>
                      )}
                    </button>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-[#131318] border border-white/[0.08] space-y-1.5">
                    <p className="text-[11px] font-bold text-[#60A5FA] uppercase tracking-wider">
                      {m.importHowToTitle}
                    </p>
                    <p className="text-[11px] text-zinc-300 leading-relaxed">{m.importHowToSpotify}</p>
                    <p className="text-[11px] text-zinc-300 leading-relaxed">{m.importHowToYtm}</p>
                  </div>
                </div>
              )}

              {tab === 'taste' && (
                <div className="space-y-4">
                  <form onSubmit={handleAddManualTaste} className="flex gap-2">
                    <input
                      type="text"
                      value={artistInput}
                      onChange={(e) => setArtistInput(e.target.value)}
                      placeholder={m.addArtistPlaceholder}
                      className="flex-1 h-10 px-3 rounded-xl bg-[#131318] border border-white/[0.12] focus:border-[#3B82F6] text-xs sm:text-sm text-white placeholder:text-zinc-500 outline-none"
                    />
                    <button
                      type="submit"
                      className="h-10 px-3.5 rounded-xl bg-[#3B82F6]/20 hover:bg-[#3B82F6]/30 border border-[#3B82F6]/55 text-[#93C5FD] font-bold text-xs inline-flex items-center gap-1 cursor-pointer shrink-0 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </form>

                  {/* Quick-pick genre chips */}
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-zinc-300">{m.tasteGenresLabel}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {QUICK_TASTE_GENRES.map((genre) => {
                        const active = tasteProfile.favoriteGenres.some(
                          (g) => g.toLowerCase() === genre.toLowerCase()
                        );
                        return (
                          <button
                            key={genre}
                            type="button"
                            onClick={() => handleToggleQuickGenre(genre)}
                            className={`h-8 px-3 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                              active
                                ? 'bg-[#2563EB]/25 border-[#3B82F6] text-white shadow-[0_0_12px_rgba(59,130,246,0.28)]'
                                : 'bg-[#131318] hover:bg-[#1B1B22] border-white/[0.08] text-zinc-300'
                            }`}
                          >
                            {active ? `✓ ${genre}` : `+ ${genre}`}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-zinc-300">{m.tasteArtistsLabel}</p>
                      <span className="text-[11px] font-mono text-zinc-500 tabular-nums">
                        {tasteProfile.favoriteArtists.length}
                      </span>
                    </div>
                    {tasteProfile.favoriteArtists.length === 0 ? (
                      <p className="text-xs text-zinc-500 py-2">
                        Conecta tu cuenta o añade artistas favoritos para entrenar tu feed Para Ti.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {tasteProfile.favoriteArtists.map((artist) => (
                          <span
                            key={artist}
                            className="inline-flex items-center gap-1.5 h-8 pl-3 pr-2 rounded-full bg-[#1B1B22] border border-white/[0.1] text-xs font-semibold text-zinc-200"
                          >
                            <span>{artist}</span>
                            <button
                              type="button"
                              onClick={() => removeFavoriteArtist(artist)}
                              className="w-5 h-5 rounded-full hover:bg-white/15 flex items-center justify-center text-zinc-400 hover:text-white cursor-pointer"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {hasAnyTaste && (
                    <button
                      type="button"
                      disabled={mixLoading}
                      onClick={() => void handlePlayTasteMix()}
                      className="w-full h-11 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#3B82F6] hover:brightness-110 text-white font-extrabold text-xs sm:text-sm inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shadow-[0_8px_24px_rgba(37,99,235,0.35)]"
                    >
                      {mixLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Sparkles className="w-4 h-4" />
                      )}
                      <span>{m.generateTasteMixBtn}</span>
                    </button>
                  )}

                  {tasteProfile.importedSources.length > 0 && (
                    <div className="space-y-1.5 pt-2 border-t border-white/[0.06]">
                      {tasteProfile.importedSources.slice(0, 5).map((src) => (
                        <div
                          key={src.id}
                          className="flex items-center justify-between text-[11px] text-zinc-400"
                        >
                          <span className="truncate font-medium text-zinc-300">{src.label}</span>
                          <span className="shrink-0 font-mono tabular-nums">
                            {src.provider.replace('_', ' ')} · {src.trackCount}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Full Account OAuth Import Preview */}
              {oauthPreview && (
                <div className="rounded-2xl bg-[#131318] border border-[#3B82F6]/50 p-4 space-y-3.5 shadow-[0_12px_36px_rgba(37,99,235,0.18)]">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-[#60A5FA] font-bold">
                        {oauthPreview.provider === 'spotify' ? 'Spotify conectado' : 'YouTube Music conectado'}
                      </span>
                      <p className="text-sm font-extrabold text-white truncate">
                        {oauthPreview.accountLabel}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setOauthPreview(null)}
                      className="w-8 h-8 rounded-full hover:bg-white/10 text-zinc-400 flex items-center justify-center cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Stats grid */}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-2 rounded-xl bg-[#0C0C0F] border border-white/[0.07]">
                      <p className="text-sm font-extrabold font-mono text-white tabular-nums">
                        {oauthPreview.likedTracks.length}
                      </p>
                      <p className="text-[10px] text-zinc-400 truncate">{m.likedSongs}</p>
                    </div>
                    <div className="p-2 rounded-xl bg-[#0C0C0F] border border-white/[0.07]">
                      <p className="text-sm font-extrabold font-mono text-[#60A5FA] tabular-nums">
                        {oauthPreview.playlists.length}
                      </p>
                      <p className="text-[10px] text-zinc-400 truncate">{m.playlistsSection}</p>
                    </div>
                    <div className="p-2 rounded-xl bg-[#0C0C0F] border border-white/[0.07]">
                      <p className="text-sm font-extrabold font-mono text-white tabular-nums">
                        {oauthPreview.favoriteArtists.length}
                      </p>
                      <p className="text-[10px] text-zinc-400 truncate">{m.artistsSection}</p>
                    </div>
                  </div>

                  {/* Toggle Liked Songs */}
                  {oauthPreview.likedTracks.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setIncludeOAuthLikes((v) => !v)}
                      className={`w-full px-3 py-2 rounded-xl border text-xs font-bold flex items-center justify-between cursor-pointer transition-colors ${
                        includeOAuthLikes
                          ? 'bg-[#FF2D55]/15 border-[#FF2D55]/50 text-white'
                          : 'bg-[#0C0C0F] border-white/[0.08] text-zinc-400'
                      }`}
                    >
                      <span className="inline-flex items-center gap-2">
                        <Heart className={`w-3.5 h-3.5 ${includeOAuthLikes ? 'text-[#FF2D55] fill-current' : ''}`} />
                        <span>
                          Importar {oauthPreview.likedTracks.length} canciones a {m.likedSongs}
                        </span>
                      </span>
                      <span className="font-mono text-[11px]">{includeOAuthLikes ? '✓' : '—'}</span>
                    </button>
                  )}

                  {/* Selectable Playlists */}
                  {oauthPreview.playlists.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-bold text-zinc-300">
                        Playlists a importar ({selectedPlaylistIds.size}/{oauthPreview.playlists.length})
                      </p>
                      <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                        {oauthPreview.playlists.map((pl) => {
                          const selected = selectedPlaylistIds.has(pl.id);
                          return (
                            <button
                              key={pl.id}
                              type="button"
                              onClick={() => handleToggleOAuthPlaylist(pl.id)}
                              className={`h-8 px-2.5 rounded-xl border text-[11px] font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-all ${
                                selected
                                  ? 'bg-[#3B82F6]/20 border-[#3B82F6] text-white'
                                  : 'bg-[#0C0C0F] border-white/[0.08] text-zinc-400'
                              }`}
                            >
                              <ListMusic className="w-3 h-3 shrink-0" />
                              <span className="truncate max-w-[160px]">{pl.name}</span>
                              <span className="font-mono text-[10px] text-[#93C5FD]">
                                {pl.tracks.length}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Genres & Artists Preview */}
                  {(oauthPreview.favoriteGenres.length > 0 ||
                    oauthPreview.favoriteArtists.length > 0) && (
                    <div className="flex flex-wrap gap-1">
                      {oauthPreview.favoriteGenres.slice(0, 6).map((g) => (
                        <span
                          key={g}
                          className="px-2 py-0.5 rounded-full bg-[#3B82F6]/15 border border-[#3B82F6]/35 text-[10px] font-semibold text-[#93C5FD]"
                        >
                          {g}
                        </span>
                      ))}
                      {oauthPreview.favoriteArtists.slice(0, 6).map((a) => (
                        <span
                          key={a}
                          className="px-2 py-0.5 rounded-full bg-white/[0.06] border border-white/[0.08] text-[10px] text-zinc-300"
                        >
                          {a}
                        </span>
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleCommitOAuthImport}
                    className="w-full h-11 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#3B82F6] hover:brightness-110 text-white font-extrabold text-xs sm:text-sm inline-flex items-center justify-center gap-2 cursor-pointer shadow-[0_8px_24px_rgba(37,99,235,0.38)]"
                  >
                    <Check className="w-4 h-4" />
                    <span>{m.oauthCommitAllBtn}</span>
                  </button>
                </div>
              )}

              {/* Matched Preview (Link / File) & Destination Selector */}
              {preview && (
                <div className="rounded-2xl bg-[#131318] border border-[#3B82F6]/40 p-3.5 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-extrabold text-white truncate">{preview.title}</p>
                      <p className="text-[11px] font-mono text-[#60A5FA] tabular-nums">
                        {preview.matchedTracks.length} {m.songsCount} · {preview.detectedArtists.length}{' '}
                        {m.artistsSection.toLowerCase()}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPreview(null)}
                      className="w-8 h-8 rounded-full hover:bg-white/10 text-zinc-400 flex items-center justify-center cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {preview.warning && (
                    <p className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/25 rounded-xl p-2">
                      {preview.warning}
                    </p>
                  )}

                  {preview.matchedTracks.length > 0 && (
                    <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                      {preview.matchedTracks.slice(0, 12).map((t) => (
                        <div key={t.id} className="flex items-center gap-2.5 text-xs">
                          <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0 bg-[#1B1B22]">
                            <CoverArt src={t.album.cover} alt={t.title} fallbackLabel={t.artist.name} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-white truncate">{t.title}</p>
                            <p className="text-[10px] text-zinc-400 truncate">{t.artist.name}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="space-y-2 pt-2 border-t border-white/[0.06]">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                      {(
                        [
                          { id: 'likes', label: m.importTargetLikes, icon: Heart },
                          { id: 'playlist', label: m.importTargetPlaylist, icon: ListMusic },
                          { id: 'taste', label: m.importTargetTasteOnly, icon: Sparkles },
                        ] as const
                      ).map((dest) => {
                        const Icon = dest.icon;
                        const active = targetDest === dest.id;
                        return (
                          <button
                            key={dest.id}
                            type="button"
                            onClick={() => setTargetDest(dest.id)}
                            className={`min-h-9 px-2.5 py-1.5 rounded-xl border text-[11px] font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer ${
                              active
                                ? 'bg-[#3B82F6]/20 border-[#3B82F6] text-[#93C5FD]'
                                : 'bg-white/[0.04] border-white/[0.08] text-zinc-300'
                            }`}
                          >
                            <Icon className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">{dest.label}</span>
                          </button>
                        );
                      })}
                    </div>

                    {targetDest === 'playlist' && (
                      <input
                        type="text"
                        value={customPlaylistName}
                        onChange={(e) => setCustomPlaylistName(e.target.value)}
                        placeholder={m.importPlaylistNamePlaceholder}
                        className="w-full h-10 px-3 rounded-xl bg-[#1B1B22] border border-white/[0.12] focus:border-[#3B82F6] text-xs text-white outline-none"
                      />
                    )}

                    <button
                      type="button"
                      onClick={handleCommitImport}
                      className="w-full h-11 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#3B82F6] hover:brightness-110 text-white font-extrabold text-xs sm:text-sm inline-flex items-center justify-center gap-2 cursor-pointer shadow-[0_8px_24px_rgba(37,99,235,0.35)]"
                    >
                      <Check className="w-4 h-4" />
                      <span>{m.importSuccessToast}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Footer Skip CTA */}
            <div className="shrink-0 px-4 sm:px-6 py-3 border-t border-white/[0.06] bg-[#08080B] flex items-center justify-between gap-2">
              <span className="text-[11px] text-zinc-500 truncate">
                Spotify · YouTube Music · Ajustes
              </span>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  dismissModal();
                }}
                className="min-h-9 px-4 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-bold text-zinc-200 hover:text-white cursor-pointer transition-colors shrink-0"
              >
                {m.importSkipLater}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
