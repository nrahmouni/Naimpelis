import React from 'react';
import { ArrowLeft, Loader2, Radio, RotateCw, Tv, X } from 'lucide-react';
import type { HalftimeChiringuitoState } from '../../hooks/useHalftimeChiringuitoBreak';
import { triggerHaptic } from '../../utils/haptics';

interface HalftimeChiringuitoBarProps {
  state: HalftimeChiringuitoState;
}

export const HalftimeChiringuitoBar: React.FC<HalftimeChiringuitoBarProps> = ({ state }) => {
  const {
    showPrompt,
    isWatchingChiringuitoBreak,
    isSwitching,
    statusNotice,
    liveProbe,
    snapshot,
    matchSummary,
    switchToChiringuitoInside,
    refreshChiringuitoProbe,
    returnToSavedMatch,
    toggleAutoReturn,
    dismissPrompt,
  } = state;

  if (!showPrompt && !isWatchingChiringuitoBreak && !statusNotice) {
    return null;
  }

  const altCandidates = (liveProbe?.candidates || [])
    .filter((c) => c.videoId && c.videoId !== snapshot?.chiringuitoStreamKey)
    .slice(0, 3);

  return (
    <div className="w-full max-w-6xl mx-auto mt-2.5 px-2.5 sm:px-3">
      {statusNotice && !showPrompt && !isWatchingChiringuitoBreak && (
        <div className="px-3.5 py-2.5 rounded-xl bg-emerald-500/15 border border-emerald-400/35 text-xs font-bold text-emerald-200 flex items-center gap-2">
          <RotateCw className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{statusNotice}</span>
        </div>
      )}

      {showPrompt && (
        <div className="rounded-2xl bg-[#110F18] border border-rose-500/40 px-3.5 py-3 shadow-[0_12px_32px_rgba(225,29,72,0.16)] flex flex-col gap-2.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-2.5 min-w-0">
              <span className="w-9 h-9 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center shrink-0">
                <Radio className="w-4 h-4 text-rose-400 animate-pulse" />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] font-black uppercase tracking-wider text-rose-400">
                    DESCANSO · {matchSummary.homeTeam} {matchSummary.homeScore}-{matchSummary.awayScore}{' '}
                    {matchSummary.awayTeam}
                  </span>
                  {liveProbe?.isLiveNow && (
                    <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      {liveProbe.activeStream?.channelName
                        ? `${liveProbe.activeStream.channelName}${liveProbe.activeStream.viewerText ? ` · ${liveProbe.activeStream.viewerText}` : ''}`
                        : 'Directo YT activo'}
                    </span>
                  )}
                </div>
                <p className="text-xs sm:text-[13px] font-bold text-white truncate mt-0.5">
                  {liveProbe?.activeStream?.title ||
                    'Chiringuito Inside en directo — comenta la media parte sin perder el partido'}
                </p>
                <p className="text-[11px] text-zinc-400 leading-snug">
                  Busca automáticamente directos activos en YouTube y vuelve al partido al arrancar la 2ª parte.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <button
                type="button"
                disabled={isSwitching}
                onClick={() => {
                  triggerHaptic('success');
                  void switchToChiringuitoInside('inside');
                }}
                className="min-h-10 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-60 text-white text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all"
              >
                {isSwitching ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Radio className="w-3.5 h-3.5" />
                )}
                <span>Poner Chiringuito Inside</span>
              </button>

              <button
                type="button"
                disabled={isSwitching}
                onClick={() => {
                  triggerHaptic('light');
                  void switchToChiringuitoInside('mega');
                }}
                className="min-h-10 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-zinc-200 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all"
              >
                <Tv className="w-3.5 h-3.5 text-rose-400" />
                <span>Mega TV</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  dismissPrompt();
                }}
                aria-label="Ocultar aviso de descanso"
                className="min-w-10 min-h-10 rounded-xl bg-white/[0.04] hover:bg-white/[0.1] text-zinc-400 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {altCandidates.length > 1 && (
            <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-white/[0.06]">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mr-1">
                Otros directos YT:
              </span>
              {altCandidates.slice(1, 3).map((cand) => (
                <button
                  key={cand.videoId}
                  type="button"
                  disabled={isSwitching}
                  onClick={() => {
                    triggerHaptic('light');
                    void switchToChiringuitoInside('inside', cand);
                  }}
                  className="min-h-8 px-2.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.12] border border-white/[0.08] text-[11px] font-semibold text-zinc-200 truncate max-w-[230px] cursor-pointer transition-colors"
                >
                  {cand.channelName || cand.title}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {isWatchingChiringuitoBreak && snapshot && (
        <div className="rounded-2xl bg-[#111521] border border-emerald-500/35 px-3.5 py-3 flex flex-col gap-2.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-block w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                <span className="text-[11px] font-black uppercase tracking-wider text-white">
                  Media parte: {snapshot.homeTeam} {matchSummary.homeScore}-{matchSummary.awayScore}{' '}
                  {snapshot.awayTeam}
                </span>
                <span className="text-[11px] font-semibold text-zinc-400 tabular-nums">
                  ({matchSummary.statusLabel})
                </span>
              </div>
              <p className="text-[11px] text-zinc-300 mt-0.5 truncate">
                Viendo <strong className="text-white">{snapshot.chiringuitoTitle}</strong> ·{' '}
                {snapshot.autoReturnEnabled
                  ? 'Se repondrá el partido automáticamente al iniciar la 2ª parte.'
                  : 'Auto-retorno pausado (vuelve manualmente cuando quieras).'}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <button
                type="button"
                disabled={isSwitching}
                onClick={() => {
                  triggerHaptic('light');
                  void refreshChiringuitoProbe();
                }}
                title="Buscar nuevos directos en YouTube"
                className="min-h-10 px-2.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.12] border border-white/[0.1] text-zinc-200 text-xs font-bold inline-flex items-center gap-1 cursor-pointer active:scale-95 transition-all"
              >
                <RotateCw className={`w-3.5 h-3.5 ${isSwitching ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Buscar YT</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  toggleAutoReturn();
                }}
                aria-pressed={snapshot.autoReturnEnabled}
                className={`min-h-10 px-3 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all ${
                  snapshot.autoReturnEnabled
                    ? 'bg-emerald-500/18 border-emerald-400/45 text-emerald-200'
                    : 'bg-white/[0.05] border-white/[0.1] text-zinc-300'
                }`}
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>
                  {snapshot.autoReturnEnabled ? 'Auto-volver: ON' : 'Auto-volver: OFF'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  triggerHaptic('success');
                  returnToSavedMatch();
                }}
                className="min-h-10 px-4 rounded-xl bg-[#7C3AED] hover:bg-[#8B5CF6] text-white text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Volver al partido ahora</span>
              </button>
            </div>
          </div>

          {altCandidates.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-white/[0.06]">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mr-1">
                Otras emisiones YT en directo:
              </span>
              {altCandidates.map((cand) => (
                <button
                  key={cand.videoId}
                  type="button"
                  disabled={isSwitching}
                  onClick={() => {
                    triggerHaptic('light');
                    void switchToChiringuitoInside('inside', cand);
                  }}
                  className="min-h-8 px-2.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.12] border border-white/[0.08] text-[11px] font-semibold text-zinc-200 truncate max-w-[230px] cursor-pointer transition-colors"
                >
                  {cand.channelName || cand.title}
                  {cand.viewerText ? ` · ${cand.viewerText}` : ''}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
