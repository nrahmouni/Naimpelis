import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  FileUp,
  Heart,
  Link2,
  ListMusic,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useMusicStore } from '../../store/useMusicStore';
import { useBackInterceptor } from '../../lib/backInterceptor';
import { triggerHaptic } from '../../utils/haptics';
import { parseMusicImportText } from '../../services/musicImporter';
import type { ImportedTrackInput, MusicTrack } from '../../types/music';
import { MUSIC_I18N } from './musicI18n';
import { CoverArt } from './CoverArt';

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
  const importTracksIntoLikes = useMusicStore((s) => s.importTracksIntoLikes);
  const importTracksIntoPlaylist = useMusicStore((s) => s.importTracksIntoPlaylist);
  const mergeTasteProfile = useMusicStore((s) => s.mergeTasteProfile);
  const removeFavoriteArtist = useMusicStore((s) => s.removeFavoriteArtist);
  const removeFavoriteGenre = useMusicStore((s) => s.removeFavoriteGenre);
  const playTrack = useMusicStore((s) => s.playTrack);
  const m = MUSIC_I18N[musicLang];

  const [tab, setTab] = useState<'link' | 'file' | 'taste'>('link');
  const [linkUrl, setLinkUrl] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [loading, setLoading] = useState(false);
  const [matching, setMatching] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreviewState | null>(null);
  const [targetDest, setTargetDest] = useState<'likes' | 'playlist' | 'taste'>('likes');
  const [customPlaylistName, setCustomPlaylistName] = useState('');
  const [artistInput, setArtistInput] = useState('');
  const [mixLoading, setMixLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useBackInterceptor(showImportModal, 'music-import-modal', () => setShowImportModal(false), {
    priority: 26,
  });

  if (!showImportModal) return null;

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
      const detectedArtists: string[] = Array.isArray(data.detectedArtists) ? data.detectedArtists : [];
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
      onImportedToast?.(
        `${m.importSuccessToast}: +${added} ${m.likedSongs}`
      );
    } else if (targetDest === 'playlist' && preview.matchedTracks.length > 0) {
      const plName = customPlaylistName.trim() || preview.title;
      importTracksIntoPlaylist(
        plName,
        `${preview.sourceProvider.toUpperCase()} · ${preview.matchedTracks.length} ${m.songsCount}`,
        preview.matchedTracks
      );
      onImportedToast?.(`${m.importSuccessToast}: ${plName}`);
    } else {
      onImportedToast?.(`${m.importSuccessToast}: ${artistsToMerge.length} artistas`);
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

  const handlePlayTasteMix = async () => {
    if (tasteProfile.favoriteArtists.length === 0) return;
    setMixLoading(true);
    triggerHaptic('medium');
    try {
      const topArtists = tasteProfile.favoriteArtists.slice(0, 5);
      const responses = await Promise.all(
        topArtists.map((art) =>
          fetch(`/api/music/search?q=${encodeURIComponent(art)}`)
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
        setShowImportModal(false);
      } else {
        setErrorMsg('No se encontraron temas reproducibles para esos artistas.');
      }
    } finally {
      setMixLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={() => setShowImportModal(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-xl max-h-[90dvh] rounded-t-3xl sm:rounded-3xl bg-[#070D16] border border-[#10B981]/25 shadow-[0_24px_80px_rgba(0,0,0,0.9)] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="shrink-0 px-4 sm:px-6 pt-4 pb-3 border-b border-white/[0.08] flex items-center justify-between gap-2 bg-[#09101B]">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#10B981]/25 to-[#22D3EE]/20 border border-[#10B981]/40 flex items-center justify-center text-[#34D399] shrink-0">
              <Sparkles className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-extrabold text-white truncate">
                {m.importTitle}
              </h3>
              <p className="text-[11px] text-zinc-400 truncate">{m.importSub}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowImportModal(false)}
            aria-label={m.cancel}
            className="w-9 h-9 rounded-full bg-white/[0.06] hover:bg-white/12 text-zinc-300 flex items-center justify-center cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 3-Tab Switcher */}
        <div className="shrink-0 px-4 sm:px-6 pt-3 pb-2 border-b border-white/[0.06] bg-[#080E18]">
          <div className="grid grid-cols-3 gap-1.5">
            {(
              [
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
                      ? 'bg-[#10B981]/20 border border-[#10B981]/60 text-[#6EE7B7]'
                      : 'bg-white/[0.04] hover:bg-white/[0.08] border border-white/5 text-zinc-400 hover:text-white'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-2xl bg-rose-500/12 border border-rose-500/35 text-xs text-rose-200 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
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
                  className="w-full h-11 px-3.5 rounded-xl bg-white/[0.06] border border-white/15 focus:border-[#10B981] text-xs sm:text-sm text-white placeholder:text-zinc-500 outline-none"
                />
                <p className="text-[11px] text-zinc-400 leading-relaxed">{m.importLinkHelp}</p>
              </div>

              <button
                type="submit"
                disabled={loading || matching || !linkUrl.trim()}
                className="w-full h-11 rounded-xl bg-gradient-to-r from-[#10B981] to-[#22D3EE] text-[#03130E] font-extrabold text-xs sm:text-sm inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
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

              <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/10 text-[11px] text-zinc-400 leading-relaxed">
                {m.importPrivateWarn}
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
                className="w-full p-4 rounded-2xl border border-dashed border-[#10B981]/45 bg-[#10B981]/8 hover:bg-[#10B981]/14 text-center space-y-1.5 cursor-pointer transition-colors"
              >
                <FileUp className="w-6 h-6 text-[#34D399] mx-auto" />
                <p className="text-xs sm:text-sm font-bold text-white">{m.importFileDrop}</p>
              </button>

              <div className="space-y-2">
                <textarea
                  rows={4}
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder={m.importFilePastePlaceholder}
                  className="w-full p-3 rounded-xl bg-white/[0.06] border border-white/15 focus:border-[#10B981] text-xs text-white placeholder:text-zinc-500 outline-none resize-none"
                />
                <button
                  type="button"
                  disabled={matching || !pasteText.trim()}
                  onClick={() => void handleParsedContent(pasteText)}
                  className="w-full h-10 rounded-xl bg-gradient-to-r from-[#10B981] to-[#22D3EE] text-[#03130E] font-extrabold text-xs inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-45"
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

              <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-1.5">
                <p className="text-[11px] font-bold text-[#34D399] uppercase tracking-wider">
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
                  className="flex-1 h-10 px-3 rounded-xl bg-white/[0.06] border border-white/15 focus:border-[#10B981] text-xs sm:text-sm text-white placeholder:text-zinc-500 outline-none"
                />
                <button
                  type="submit"
                  className="h-10 px-3.5 rounded-xl bg-[#10B981]/20 hover:bg-[#10B981]/30 border border-[#10B981]/50 text-[#6EE7B7] font-bold text-xs inline-flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </form>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-zinc-300">{m.tasteArtistsLabel}</p>
                  <span className="text-[11px] text-zinc-500 tabular-nums">
                    {tasteProfile.favoriteArtists.length}
                  </span>
                </div>
                {tasteProfile.favoriteArtists.length === 0 ? (
                  <p className="text-xs text-zinc-500 py-3">
                    Añade artistas o importa un enlace/archivo para entrenar tu feed Para Ti.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {tasteProfile.favoriteArtists.map((artist) => (
                      <span
                        key={artist}
                        className="inline-flex items-center gap-1.5 h-8 pl-3 pr-2 rounded-full bg-white/[0.07] border border-white/10 text-xs font-semibold text-zinc-200"
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

              {tasteProfile.favoriteGenres.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-zinc-300">{m.tasteGenresLabel}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {tasteProfile.favoriteGenres.map((genre) => (
                      <span
                        key={genre}
                        className="inline-flex items-center gap-1.5 h-7 pl-2.5 pr-1.5 rounded-full bg-[#22D3EE]/12 border border-[#22D3EE]/35 text-[11px] font-semibold text-[#67E8F9]"
                      >
                        <span>{genre}</span>
                        <button
                          type="button"
                          onClick={() => removeFavoriteGenre(genre)}
                          className="w-4 h-4 rounded-full hover:bg-white/15 flex items-center justify-center text-cyan-200 cursor-pointer"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {tasteProfile.favoriteArtists.length > 0 && (
                <button
                  type="button"
                  disabled={mixLoading}
                  onClick={() => void handlePlayTasteMix()}
                  className="w-full h-11 rounded-xl bg-gradient-to-r from-[#10B981] to-[#22D3EE] text-[#03130E] font-extrabold text-xs sm:text-sm inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
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
                      <span className="shrink-0 tabular-nums">
                        {src.provider.replace('_', ' ')} · {src.trackCount}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Matched Preview & Destination Selector */}
          {preview && (
            <div className="rounded-2xl bg-[#0B121D] border border-[#10B981]/35 p-3.5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-extrabold text-white truncate">{preview.title}</p>
                  <p className="text-[11px] text-[#34D399] tabular-nums">
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
                      <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0 bg-[#0F1724]">
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
                            ? 'bg-[#10B981]/20 border-[#10B981] text-[#6EE7B7]'
                            : 'bg-white/[0.04] border-white/10 text-zinc-300'
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
                    className="w-full h-10 px-3 rounded-xl bg-white/[0.06] border border-white/15 focus:border-[#10B981] text-xs text-white outline-none"
                  />
                )}

                <button
                  type="button"
                  onClick={handleCommitImport}
                  className="w-full h-11 rounded-xl bg-gradient-to-r from-[#10B981] to-[#22D3EE] text-[#03130E] font-extrabold text-xs sm:text-sm inline-flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>{m.importSuccessToast}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
