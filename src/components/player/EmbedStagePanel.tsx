import React from 'react';
import { ExternalLink, SkipBack, SkipForward } from 'lucide-react';
import type { AppLanguage, VideoState } from '../../types';
import { triggerHaptic } from '../../utils/haptics';
import { unwrapEmbedUrl } from './embedWindowUtils';
import { formatUniqueTrackChipLabels } from './trackLabelUtils';
import {
  RiffanCloseIcon,
  RiffanPlayIcon,
  RiffanRetryIcon,
  RiffanWarningIcon,
} from '../ui/RiffanIcons';

interface EmbedStagePanelProps {
  lang: AppLanguage;
  videoState: VideoState;
  isExtracting: boolean;
  isMinimized: boolean;
  isMobileExternal: boolean;
  externalWinState: 'idle' | 'open' | 'closed' | 'blocked';
  externalTargetUrl: string;
  embedWatchdogPhase: 'watching' | 'verified' | 'window_preferred' | 'exhausted';
  activeEmbedInlineUrl: string;
  activeEmbedDirectUrl: string;
  lastAttemptedEmbedUrl: string;
  embedRescueDismissedUrl: string;
  setEmbedRescueDismissedUrl: (url: string) => void;
  onPrevEpisode?: () => void;
  onNextEpisode?: () => void;
  onOpenControlledExternalWindow: (urlOverride?: string) => void;
  onFocusExternalWindow: () => void;
  onCloseExternalWindow: () => void;
  onSelectExternalServer: (trackIdx: number) => void;
  onMarkInlineServerWorking: () => void;
  onRetryInlineEmbed: () => void;
  onOpenInCloudBrowser?: (url: string) => void;
}

export const EmbedStagePanel: React.FC<EmbedStagePanelProps> = ({
  lang,
  videoState,
  isExtracting,
  isMinimized,
  isMobileExternal,
  externalWinState,
  externalTargetUrl,
  embedWatchdogPhase,
  activeEmbedInlineUrl,
  activeEmbedDirectUrl,
  lastAttemptedEmbedUrl,
  embedRescueDismissedUrl,
  setEmbedRescueDismissedUrl,
  onPrevEpisode,
  onNextEpisode,
  onOpenControlledExternalWindow,
  onFocusExternalWindow,
  onCloseExternalWindow,
  onSelectExternalServer,
  onMarkInlineServerWorking,
  onRetryInlineEmbed,
  onOpenInCloudBrowser,
}) => {
  const activeTrack = videoState.tracks[videoState.activeTrackIndex];
  const activeTrackUrl = unwrapEmbedUrl(
    activeTrack?.sourceUrl || activeTrack?.resolvedStreamUrl || videoState.url
  );

  const externalBackupHref = (() => {
    const candidates = [
      activeTrackUrl,
      unwrapEmbedUrl(videoState.rawSourceUrl || ''),
      unwrapEmbedUrl(videoState.url),
      ...videoState.tracks.map((tr) => unwrapEmbedUrl(tr.sourceUrl)),
    ].filter(Boolean);

    for (const c of candidates) {
      if (/bingetrix\.[a-z.]+/i.test(c)) {
        return c;
      }
    }
    if (videoState.seriesMeta?.tmdbId) {
      return `https://bingetrix.sc/watch/tv/${videoState.seriesMeta.tmdbId}/${
        videoState.seriesMeta.season || 1
      }/${videoState.seriesMeta.episode || 1}`;
    }
    for (const c of candidates) {
      const tvM =
        c.match(
          /(?:bingetrix|vidlink|autoembed)\.[a-z.]+\/(?:watch\/|embed\/|v2\/)?tv\/(?:tmdb\/)?(\d+)[/-](\d+)[/-](\d+)/i
        ) ||
        c.match(/2embed\.[a-z.]+\/(?:embedtv|tv)\/(\d+)(?:&s=|\/)(\d+)(?:&e=|\/)(\d+)/i);
      if (tvM) {
        return `https://bingetrix.sc/watch/tv/${tvM[1]}/${tvM[2]}/${tvM[3]}`;
      }
      const movM = c.match(
        /(?:bingetrix|vidlink|autoembed|2embed)\.[a-z.]+\/(?:watch\/|embed\/|v2\/)?(?:movie\/)?(?:tmdb\/)?(\d+)/i
      );
      if (movM) {
        return `https://bingetrix.sc/watch/${movM[1]}`;
      }
    }
    return activeTrackUrl;
  })();

  const inlineIframeSrc = activeEmbedInlineUrl || videoState.url;
  const lastAttemptedUrl =
    lastAttemptedEmbedUrl || activeTrackUrl || activeEmbedDirectUrl;
  const canPrevEpisode = Boolean(
    videoState.seriesMeta &&
      onPrevEpisode &&
      (videoState.seriesMeta.season > 1 || videoState.seriesMeta.episode > 1)
  );

  // 1) Controlled External Window Active Panel
  if (externalWinState === 'open') {
    return (
      <div className="relative w-full h-full bg-gradient-to-b from-[#171226] via-[#0F0F15] to-black flex flex-col items-center justify-center pt-14 sm:pt-12 pb-4 px-3 sm:px-5 text-center overflow-y-auto">
        <div className="w-full max-w-lg rounded-2xl bg-[#14141B]/95 border border-[#9146FF]/45 p-3.5 sm:p-4 shadow-2xl space-y-3">
          <div className="flex items-center justify-between gap-2 text-left">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-[10px] font-bold uppercase tracking-wider mb-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>
                  {isMobileExternal
                    ? 'Reproduciendo en pestaña externa'
                    : 'Reproduciendo en ventana externa'}
                </span>
              </div>
              <h4 className="font-display font-bold text-xs sm:text-sm text-white truncate">
                {videoState.title}
              </h4>
              <p className="text-[11px] text-zinc-400 truncate">
                {activeTrack?.label || 'Servidor Web'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onFocusExternalWindow();
              }}
              className="min-h-9 px-3.5 rounded-xl bg-[#9146FF] hover:bg-[#772CE8] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Traer al frente</span>
            </button>

            <button
              type="button"
              onClick={() => {
                triggerHaptic('medium');
                onCloseExternalWindow();
              }}
              className="min-h-9 px-3.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/35 border border-rose-400/40 text-rose-100 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <RiffanCloseIcon size={14} tone="current" />
              <span>{isMobileExternal ? 'Cerrar pestaña' : 'Cerrar ventana'}</span>
            </button>
          </div>

          {videoState.seriesMeta && (onPrevEpisode || onNextEpisode) && (
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1 border-t border-white/[0.08]">
              {onPrevEpisode && (
                <button
                  type="button"
                  disabled={!canPrevEpisode || isExtracting}
                  onClick={() => {
                    triggerHaptic('light');
                    onPrevEpisode();
                  }}
                  className="min-h-8 px-3 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold text-white inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <SkipBack className="w-3.5 h-3.5" />
                  <span>Capítulo anterior</span>
                </button>
              )}
              {onNextEpisode && (
                <button
                  type="button"
                  disabled={isExtracting}
                  onClick={() => {
                    triggerHaptic('light');
                    onNextEpisode();
                  }}
                  className="min-h-8 px-3 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold text-white inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <span>Siguiente capítulo</span>
                  <SkipForward className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {videoState.tracks.length > 1 && (
            <div className="pt-1 border-t border-white/[0.08]">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                Cambiar servidor en {isMobileExternal ? 'pestaña' : 'ventana'}
              </div>
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                {(() => {
                  const extTracks = videoState.tracks.slice(0, 6);
                  const extLabels = formatUniqueTrackChipLabels(extTracks, lang);
                  return extTracks.map((tr, idx) => {
                    const isAct = idx === videoState.activeTrackIndex;
                    const label = extLabels[idx] || `Servidor ${idx + 1}`;
                    return (
                      <button
                        key={tr.id || idx}
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          onSelectExternalServer(idx);
                        }}
                        className={`min-h-7 px-2.5 rounded-lg text-[11px] font-bold cursor-pointer transition-colors ${
                          isAct
                            ? 'bg-[#9146FF] text-white'
                            : 'bg-white/[0.08] hover:bg-white/[0.16] text-zinc-200'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  });
                })()}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 2) Controlled External Window Closed State
  if (externalWinState === 'closed') {
    return (
      <div className="relative w-full h-full bg-[#0E0E14] flex flex-col items-center justify-center pt-14 sm:pt-12 pb-4 px-4 text-center gap-3 overflow-y-auto">
        <div className="w-11 h-11 rounded-2xl bg-white/[0.07] border border-white/15 flex items-center justify-center text-zinc-200">
          <ExternalLink className="w-5 h-5" />
        </div>
        <div className="space-y-1 max-w-md">
          <h4 className="font-display font-bold text-sm sm:text-base text-white">
            {isMobileExternal ? 'Pestaña cerrada' : 'Ventana cerrada'}
          </h4>
          <p className="text-xs text-zinc-400 truncate">{videoState.title}</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('medium');
              onOpenControlledExternalWindow(activeTrackUrl);
            }}
            className="min-h-10 px-4 rounded-xl bg-[#9146FF] hover:bg-[#772CE8] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <RiffanPlayIcon size={14} tone="current" />
            <span>Reabrir</span>
          </button>
          <button
            type="button"
            onClick={onRetryInlineEmbed}
            className="min-h-10 px-3.5 rounded-xl bg-white/10 hover:bg-white/15 text-zinc-100 text-xs font-semibold cursor-pointer"
          >
            Reintentar inline
          </button>
        </div>
      </div>
    );
  }

  // 3) Popup Blocker Fallback State
  if (externalWinState === 'blocked') {
    const fallbackHref = externalTargetUrl || activeTrackUrl || externalBackupHref;
    return (
      <div className="relative w-full h-full bg-[#120E18] flex flex-col items-center justify-center pt-14 sm:pt-12 pb-4 px-4 text-center gap-3 overflow-y-auto">
        <RiffanWarningIcon size={32} animate="always" className="text-amber-400" />
        <div className="space-y-1 max-w-md">
          <h4 className="font-display font-bold text-sm sm:text-base text-white">
            Permite ventanas emergentes para este sitio
          </h4>
          <p className="text-xs text-zinc-300">
            El navegador bloqueó la ventana controlada. Puedes reintentar o abrir en pestaña normal.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('medium');
              onOpenControlledExternalWindow(fallbackHref);
            }}
            className="min-h-10 px-4 rounded-xl bg-[#9146FF] hover:bg-[#772CE8] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <RiffanRetryIcon size={14} tone="current" />
            <span>Reintentar</span>
          </button>
          <a
            href={fallbackHref}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-10 px-4 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-100 text-xs font-bold inline-flex items-center gap-1.5"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Abrir fuera</span>
          </a>
          <button
            type="button"
            onClick={onRetryInlineEmbed}
            className="min-h-10 px-3.5 rounded-xl bg-white/10 hover:bg-white/15 text-zinc-200 text-xs font-semibold cursor-pointer"
          >
            Reintentar inline
          </button>
        </div>
      </div>
    );
  }

  // 4) Watchdog Exhausted OR Server Persisted as window_required
  if (embedWatchdogPhase === 'exhausted' || embedWatchdogPhase === 'window_preferred') {
    return (
      <div className="relative w-full h-full bg-gradient-to-b from-[#171224] to-black flex flex-col items-center justify-center pt-14 sm:pt-12 pb-4 px-4 text-center gap-3 overflow-y-auto">
        <div className="space-y-1 max-w-md">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#BF94FF]">
            {activeTrack?.label || 'Servidor Web'}
          </div>
          <h4 className="font-display font-bold text-sm sm:text-base text-white">
            {embedWatchdogPhase === 'window_preferred'
              ? 'Este servidor requiere ventana externa para reproducir sin bloqueos'
              : 'Los servidores integrados no respondieron a tiempo'}
          </h4>
          <p className="text-xs text-zinc-400">
            Abre el reproductor directamente en {isMobileExternal ? 'una pestaña' : 'una ventana'} controlada con cambio de capítulos y servidores.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('success');
              onOpenControlledExternalWindow(lastAttemptedUrl);
            }}
            className="min-h-11 px-5 rounded-xl bg-[#9146FF] hover:bg-[#772CE8] text-white text-xs sm:text-sm font-bold inline-flex items-center gap-2 shadow-[0_10px_28px_rgba(145,70,255,0.45)] cursor-pointer transition-all"
          >
            <RiffanPlayIcon size={16} tone="current" />
            <span>Reproducir en ventana externa</span>
          </button>
          <button
            type="button"
            onClick={onRetryInlineEmbed}
            className="min-h-10 px-3.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-zinc-100 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <RiffanRetryIcon size={14} tone="current" />
            <span>Reintentar inline</span>
          </button>
          <a
            href={externalBackupHref}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-10 px-3.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-zinc-100 text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Abrir fuera</span>
          </a>
        </div>
      </div>
    );
  }

  // 5) Default Inline Iframe Mode (clean video surface without Ventana/Funciona/Cloud HD overlay)
  void isMinimized;
  void embedRescueDismissedUrl;
  void setEmbedRescueDismissedUrl;
  void onMarkInlineServerWorking;
  void onOpenInCloudBrowser;
  return (
    <div className="relative w-full h-full bg-black">
      <iframe
        key={inlineIframeSrc}
        src={inlineIframeSrc}
        title={videoState.title || 'Reproductor Web HD'}
        allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
        allowFullScreen
        referrerPolicy="no-referrer"
        className="w-full h-full border-0 bg-black"
      />
    </div>
  );
};
