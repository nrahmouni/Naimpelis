import React, { useMemo } from 'react';
import {
  CheckCircle2,
  Download,
  HardDrive,
  Play,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import { useMusicStore } from '../../store/useMusicStore';
import { useBackInterceptor } from '../../lib/backInterceptor';
import { triggerHaptic } from '../../utils/haptics';
import type { ExportBitrate, MusicTrack } from '../../types/music';
import {
  cancelDownloadJob,
  removeTrackFromOfflineLibrary,
  startDownloadMp3Job,
} from './MusicAudioEngine';
import { clearAllOfflineTracks } from '../../services/musicOfflineDb';
import { CoverArt } from './CoverArt';
import { MUSIC_I18N } from './musicI18n';

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

export const MusicDownloadDrawer: React.FC = () => {
  const showDownloadDrawer = useMusicStore((s) => s.showDownloadDrawer);
  const setShowDownloadDrawer = useMusicStore((s) => s.setShowDownloadDrawer);
  const downloadJobs = useMusicStore((s) => s.downloadJobs);
  const removeDownloadJob = useMusicStore((s) => s.removeDownloadJob);
  const offlineTrackIds = useMusicStore((s) => s.offlineTrackIds);
  const setOfflineTrackIds = useMusicStore((s) => s.setOfflineTrackIds);
  const exportBitrate = useMusicStore((s) => s.exportBitrate);
  const setExportBitrate = useMusicStore((s) => s.setExportBitrate);
  const likedTracks = useMusicStore((s) => s.likedTracks);
  const recentTracks = useMusicStore((s) => s.recentTracks);
  const userPlaylists = useMusicStore((s) => s.userPlaylists);
  const queue = useMusicStore((s) => s.queue);
  const playTrack = useMusicStore((s) => s.playTrack);
  const musicLang = useMusicStore((s) => s.musicLang);
  const m = MUSIC_I18N[musicLang];

  useBackInterceptor(
    showDownloadDrawer,
    'music-download-drawer',
    () => setShowDownloadDrawer(false),
    { priority: 24 }
  );

  const offlineResolvedTracks = useMemo(() => {
    const pool = new Map<string, MusicTrack>();
    [...likedTracks, ...recentTracks, ...queue, ...userPlaylists.flatMap((p) => p.tracks)].forEach(
      (t) => {
        if (!pool.has(t.id)) pool.set(t.id, t);
      }
    );
    return offlineTrackIds
      .map((id) => pool.get(id))
      .filter((t): t is MusicTrack => Boolean(t));
  }, [offlineTrackIds, likedTracks, recentTracks, queue, userPlaylists]);

  if (!showDownloadDrawer) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex justify-end"
      onClick={() => setShowDownloadDrawer(false)}
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md h-full bg-[#070C14]/98 border-l border-[#10B981]/25 p-5 flex flex-col gap-4 shadow-2xl"
      >
        <div className="flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Download className="w-5 h-5 text-[#34D399] shrink-0" />
            <h3 className="font-display text-base font-bold text-white truncate">
              {m.downloadsTitle}
            </h3>
          </div>
          <button
            type="button"
            onClick={() => setShowDownloadDrawer(false)}
            aria-label={m.cancel}
            className="w-10 h-10 rounded-full hover:bg-white/10 text-zinc-300 flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Bitrate Export Preference */}
        <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 space-y-2 shrink-0">
          <p className="text-xs font-bold text-zinc-300">{m.exportBitrateLabel}</p>
          <div className="grid grid-cols-3 gap-1.5">
            {(['128k', '192k', '320k'] as ExportBitrate[]).map((br) => (
              <button
                key={br}
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setExportBitrate(br);
                }}
                className={`h-8 rounded-xl text-xs font-bold cursor-pointer transition-all ${
                  exportBitrate === br
                    ? 'bg-gradient-to-r from-[#10B981] to-[#22D3EE] text-[#03130E]'
                    : 'bg-white/[0.05] text-zinc-300 hover:bg-white/[0.1]'
                }`}
              >
                {br.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-5 pr-1">
          {/* Active & Recent Download Jobs */}
          <section className="space-y-2">
            {downloadJobs.length === 0 ? (
              <p className="text-xs text-zinc-500 py-4 text-center">{m.downloadsEmpty}</p>
            ) : (
              downloadJobs.map((job) => (
                <div
                  key={job.id}
                  className="p-3 rounded-2xl bg-[#0B121D] border border-white/[0.08] space-y-2"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0">
                      <CoverArt
                        src={job.track.album.cover}
                        alt={job.track.title}
                        fallbackLabel={job.track.artist.name}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-white truncate">{job.track.title}</p>
                      <p className="text-[11px] text-zinc-400 truncate tabular-nums">
                        {job.track.artist.name} · {job.mode.toUpperCase()} · {job.bitrate}
                      </p>
                    </div>
                    {job.status === 'downloading' ? (
                      <button
                        type="button"
                        onClick={() => cancelDownloadJob(job.id)}
                        className="w-8 h-8 rounded-full hover:bg-white/10 text-zinc-400 hover:text-rose-400 flex items-center justify-center cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    ) : job.status === 'error' || job.status === 'cancelled' ? (
                      <button
                        type="button"
                        onClick={() => void startDownloadMp3Job(job.track, { bitrate: job.bitrate })}
                        className="w-8 h-8 rounded-full hover:bg-white/10 text-[#22D3EE] flex items-center justify-center cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => removeDownloadJob(job.id)}
                        className="w-8 h-8 rounded-full hover:bg-white/10 text-[#34D399] flex items-center justify-center cursor-pointer"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {job.status === 'downloading' && (
                    <div className="space-y-1">
                      <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-[#10B981] to-[#22D3EE] transition-[width] duration-150"
                          style={{ width: `${job.progressPct}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] text-zinc-400 tabular-nums">
                        <span>{formatBytes(job.loadedBytes)}</span>
                        <span>{job.progressPct}%</span>
                      </div>
                    </div>
                  )}

                  {job.status === 'error' && job.error && (
                    <p className="text-[11px] text-rose-400 truncate">{job.error}</p>
                  )}
                </div>
              ))
            )}
          </section>

          {/* Offline Cached Library */}
          <section className="space-y-2.5 pt-2 border-t border-white/[0.08]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-300 inline-flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-[#34D399]" />
                {m.offlineLibTitle} ({offlineTrackIds.length})
              </span>
              {offlineTrackIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    void clearAllOfflineTracks().then(() => setOfflineTrackIds([]));
                  }}
                  className="text-[11px] font-semibold text-rose-300 hover:text-rose-200 cursor-pointer"
                >
                  {m.clearHistoryBtn}
                </button>
              )}
            </div>

            {offlineResolvedTracks.length === 0 ? (
              <p className="text-xs text-zinc-500 py-3">{m.offlineLibEmpty}</p>
            ) : (
              <div className="space-y-1.5">
                {offlineResolvedTracks.map((tr) => (
                  <div
                    key={tr.id}
                    className="flex items-center gap-2.5 p-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.06]"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        playTrack(tr, offlineResolvedTracks);
                        setShowDownloadDrawer(false);
                      }}
                      className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer"
                    >
                      <div className="w-9 h-9 rounded-lg overflow-hidden shrink-0">
                        <CoverArt
                          src={tr.album.cover}
                          alt={tr.title}
                          fallbackLabel={tr.artist.name}
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-white truncate">{tr.title}</p>
                        <p className="text-[10px] text-zinc-400 truncate">{tr.artist.name}</p>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => playTrack(tr, offlineResolvedTracks)}
                      className="w-8 h-8 rounded-full text-[#34D399] hover:bg-white/10 flex items-center justify-center cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void removeTrackFromOfflineLibrary(tr.id)}
                      title={m.removeOfflineBtn}
                      className="w-8 h-8 rounded-full text-zinc-500 hover:text-rose-400 flex items-center justify-center cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
};
