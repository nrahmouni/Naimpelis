import React, { useState } from 'react';
import { ListMusic, Loader2, Plus, Radio, Trash2, X } from 'lucide-react';
import { useMusicStore } from '../../store/useMusicStore';
import { useAppStore } from '../../store/useAppStore';
import { useBackInterceptor } from '../../lib/backInterceptor';
import { triggerHaptic } from '../../utils/haptics';
import { MusicAudioEngine } from './MusicAudioEngine';
import { SpotifyPlayerBar } from './SpotifyPlayerBar';
import { EqAndTimerModal, FullScreenNowPlayingModal } from './FullScreenNowPlayingModal';
import { MusicDownloadDrawer } from './MusicDownloadDrawer';
import { DriveModeOverlay } from './DriveModeOverlay';
import { MUSIC_I18N } from './musicI18n';
import { CoverArt } from './CoverArt';

interface GlobalMusicLayerProps {
  isFullscreenVideoActive: boolean;
  onOpenMusicWorld: () => void;
}

export const GlobalMusicLayer: React.FC<GlobalMusicLayerProps> = ({
  isFullscreenVideoActive,
  onOpenMusicWorld,
}) => {
  const activeWorld = useAppStore((s) => s.activeWorld);
  const currentTrack = useMusicStore((s) => s.currentTrack);
  const activeRadio = useMusicStore((s) => s.activeRadio);
  const queue = useMusicStore((s) => s.queue);
  const queueIndex = useMusicStore((s) => s.queueIndex);
  const userPlaylists = useMusicStore((s) => s.userPlaylists);
  const showQueueDrawer = useMusicStore((s) => s.showQueueDrawer);
  const setShowQueueDrawer = useMusicStore((s) => s.setShowQueueDrawer);
  const playlistPickerTrack = useMusicStore((s) => s.playlistPickerTrack);
  const setPlaylistPickerTrack = useMusicStore((s) => s.setPlaylistPickerTrack);
  const showCreatePlaylistModal = useMusicStore((s) => s.showCreatePlaylistModal);
  const setShowCreatePlaylistModal = useMusicStore((s) => s.setShowCreatePlaylistModal);
  const autoplaySimilar = useMusicStore((s) => s.autoplaySimilar);
  const setAutoplaySimilar = useMusicStore((s) => s.setAutoplaySimilar);
  const seedGenre = useMusicStore((s) => s.seedGenre);
  const isFetchingRelated = useMusicStore((s) => s.isFetchingRelated);
  const musicToast = useMusicStore((s) => s.musicToast);
  const showMusicToast = useMusicStore((s) => s.showMusicToast);
  const musicLang = useMusicStore((s) => s.musicLang);
  const playTrack = useMusicStore((s) => s.playTrack);
  const removeFromQueue = useMusicStore((s) => s.removeFromQueue);
  const createUserPlaylist = useMusicStore((s) => s.createUserPlaylist);
  const addTrackToUserPlaylist = useMusicStore((s) => s.addTrackToUserPlaylist);
  const pushMusicDetail = useMusicStore((s) => s.pushMusicDetail);

  const [newPlaylistName, setNewPlaylistName] = useState('');
  const m = MUSIC_I18N[musicLang];

  useBackInterceptor(showQueueDrawer, 'music-global-queue-drawer', () => setShowQueueDrawer(false), {
    priority: 18,
  });
  useBackInterceptor(
    Boolean(playlistPickerTrack),
    'music-global-pl-picker',
    () => setPlaylistPickerTrack(null),
    { priority: 22 }
  );
  useBackInterceptor(
    showCreatePlaylistModal,
    'music-global-create-pl',
    () => setShowCreatePlaylistModal(false),
    { priority: 23 }
  );

  const hasMediaBar = Boolean(currentTrack || activeRadio);
  const showMiniBar = hasMediaBar && !isFullscreenVideoActive;

  return (
    <>
      {/* Persistent Headless Audio + 8D WebAudio DSP Engine (never unmounts when switching worlds) */}
      <MusicAudioEngine />

      {showMiniBar && (
        <SpotifyPlayerBar
          dockedAboveMusicNav={activeWorld === 'music'}
          onOpenMusicWorld={activeWorld !== 'music' ? onOpenMusicWorld : undefined}
        />
      )}

      <FullScreenNowPlayingModal
        onOpenPlaylistPicker={() => {
          const t = useMusicStore.getState().currentTrack;
          if (t) setPlaylistPickerTrack(t);
        }}
      />
      <EqAndTimerModal />
      <MusicDownloadDrawer />
      <DriveModeOverlay />

      {/* Global Queue Drawer */}
      {showQueueDrawer && (
        <aside className="fixed right-0 top-0 bottom-0 z-[85] w-full max-w-sm bg-[#0C0C0F]/98 backdrop-blur-2xl border-l border-white/[0.1] p-5 flex flex-col gap-3.5 shadow-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ListMusic className="w-5 h-5 text-[#60A5FA]" />
              <h3 className="font-display text-base font-bold text-white">{m.queueTitle}</h3>
            </div>
            <button
              type="button"
              onClick={() => setShowQueueDrawer(false)}
              aria-label={m.back}
              className="w-10 h-10 rounded-full hover:bg-white/10 text-zinc-300 flex items-center justify-center cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-3 rounded-2xl bg-[#131318] border border-white/[0.08] space-y-2 shrink-0">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Radio
                    className={`w-3.5 h-3.5 ${autoplaySimilar ? 'text-[#60A5FA]' : 'text-zinc-500'}`}
                  />
                  <span className="truncate">{m.autoplayLabel}</span>
                </p>
                <p className="text-[11px] text-zinc-400 truncate">{m.autoplaySub}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={autoplaySimilar}
                onClick={() => {
                  triggerHaptic('light');
                  setAutoplaySimilar(!autoplaySimilar);
                }}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
                  autoplaySimilar ? 'bg-[#3B82F6]' : 'bg-white/15'
                }`}
              >
                <span
                  className={`inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow transition-transform ${
                    autoplaySimilar ? 'translate-x-[22px]' : 'translate-x-[3px]'
                  }`}
                />
              </button>
            </div>
            {(seedGenre || isFetchingRelated) && autoplaySimilar && (
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#93C5FD]">
                {isFetchingRelated ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                    <span>{m.autoplayLoadingNext}</span>
                  </>
                ) : (
                  <span>
                    {m.autoplayBadge} · {seedGenre}
                  </span>
                )}
              </div>
            )}
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
                      active ? 'bg-[#3B82F6]/16 border border-[#3B82F6]/40' : 'hover:bg-white/[0.05]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => playTrack(t, queue, { preserveSeed: true })}
                      className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer"
                    >
                      <CoverArt
                        src={t.album.cover}
                        alt={t.title}
                        fallbackLabel={t.artist.name}
                        className="w-10 h-10 rounded-lg object-cover shrink-0"
                      />
                      <div className="min-w-0">
                        <p
                          className={`text-xs font-bold truncate ${
                            active ? 'text-[#60A5FA]' : 'text-white'
                          }`}
                        >
                          {t.title}
                        </p>
                        <p className="text-[11px] text-zinc-400 truncate">{t.artist.name}</p>
                      </div>
                    </button>
                    {!active && (
                      <button
                        type="button"
                        onClick={() => removeFromQueue(idx)}
                        aria-label={m.removeFromPlaylist}
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

      {/* Global Create Playlist Modal */}
      {showCreatePlaylistModal && (
        <div
          className="fixed inset-0 z-[90] bg-black/75 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setShowCreatePlaylistModal(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              if (!newPlaylistName.trim()) return;
              const id = createUserPlaylist(newPlaylistName, playlistPickerTrack || undefined);
              setNewPlaylistName('');
              setShowCreatePlaylistModal(false);
              setPlaylistPickerTrack(null);
              if (activeWorld === 'music') {
                pushMusicDetail({ kind: 'user_playlist', playlistId: id });
              }
              showMusicToast(m.playlistCreated);
            }}
            className="w-full max-w-sm rounded-3xl bg-[#0C0C0F] border border-[#3B82F6]/25 p-6 space-y-4 shadow-2xl"
          >
            <h3 className="font-display text-lg font-bold text-white">{m.createPlaylistTitle}</h3>
            <input
              type="text"
              autoFocus
              value={newPlaylistName}
              onChange={(e) => setNewPlaylistName(e.target.value)}
              placeholder={m.createPlaylistPlaceholder}
              className="w-full h-11 px-4 rounded-xl bg-white/[0.06] border border-white/15 focus:border-[#3B82F6] text-sm text-white outline-none"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreatePlaylistModal(false)}
                className="min-h-10 px-4 rounded-full text-xs font-semibold text-zinc-300 hover:text-white cursor-pointer"
              >
                {m.cancel}
              </button>
              <button
                type="submit"
                className="min-h-10 px-5 rounded-full bg-gradient-to-r from-[#2563EB] to-[#3B82F6] text-white text-xs font-bold cursor-pointer"
              >
                {m.create}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Global Add-to-Playlist Picker Modal */}
      {playlistPickerTrack && !showCreatePlaylistModal && (
        <div
          className="fixed inset-0 z-[90] bg-black/75 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setPlaylistPickerTrack(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl bg-[#0C0C0F] border border-[#3B82F6]/25 p-5 space-y-4 shadow-2xl"
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
              onClick={() => setShowCreatePlaylistModal(true)}
              className="w-full min-h-11 px-4 rounded-2xl bg-[#3B82F6]/15 border border-[#3B82F6]/40 text-sm font-bold text-[#93C5FD] flex items-center gap-2 cursor-pointer"
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
                    showMusicToast(`${m.addedToPlaylist} ${pl.name}`);
                    setPlaylistPickerTrack(null);
                  }}
                  className="w-full min-h-11 p-2.5 rounded-xl hover:bg-white/[0.06] flex items-center justify-between text-left cursor-pointer"
                >
                  <span className="text-sm font-semibold text-white truncate">{pl.name}</span>
                  <span className="text-xs text-zinc-400 tabular-nums">{pl.tracks.length}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Global Music Toast */}
      {musicToast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed left-1/2 -translate-x-1/2 z-[95] px-4 py-2 rounded-full bg-gradient-to-r from-[#2563EB] to-[#3B82F6] text-white text-xs font-bold shadow-[0_8px_24px_rgba(59,130,246,0.42)] pointer-events-none ${
            activeWorld === 'music' ? 'bottom-36 lg:bottom-24' : 'bottom-24'
          }`}
        >
          {musicToast}
        </div>
      )}
    </>
  );
};
