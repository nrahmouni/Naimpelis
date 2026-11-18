/**
 * @module EpgChannelModal
 * @description Real-time TV schedule (EPG) modal/drawer for TDT, Movistar+,
 * DAZN, and international live channels with signal switching.
 */
import React, { useRef } from 'react';
import { Clock, Play, X } from 'lucide-react';
import type { AppLanguage, ChannelLiveEpg, SpanishTdtChannel } from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import { useFocusTrap } from '../../utils/useFocusTrap';
import { ChannelLogoBadge, getChannelRegionMeta } from '../ui/ChannelLogoBadge';

interface EpgChannelModalProps {
  lang: AppLanguage;
  channel: SpanishTdtChannel | null;
  epgClockMs: number;
  loadingEpg: boolean;
  getChannelLiveEpg: (channelId: string) => ChannelLiveEpg | null;
  onClose: () => void;
  onPlayChannel: (channel: SpanishTdtChannel, signalIndex: number, liveHint?: string) => void;
}

export const EpgChannelModal: React.FC<EpgChannelModalProps> = ({
  lang,
  channel,
  epgClockMs,
  loadingEpg,
  getChannelLiveEpg,
  onClose,
  onPlayChannel,
}) => {
  const modalRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(Boolean(channel), onClose, modalRef);

  if (!channel) return null;

  const modalEpg = getChannelLiveEpg(channel.id);
  const scheduleList = modalEpg?.upcoming || [];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label={channel.name}
        tabIndex={-1}
        className="w-full sm:max-w-xl max-h-[86vh] rounded-t-3xl sm:rounded-3xl bg-[#10121C]/96 backdrop-blur-2xl nc-specular-surface border-t sm:border border-white/[0.12] flex flex-col overflow-hidden shadow-2xl animate-sheet-up outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sm:hidden w-10 h-1.5 bg-zinc-700 rounded-full mx-auto mt-3" />

        <div className="p-4 sm:p-5 border-b border-white/[0.08] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <ChannelLogoBadge channel={channel} size="md" />
            <div className="min-w-0">
              <h3 className="font-display font-bold text-base sm:text-lg text-white truncate flex items-center gap-1.5">
                <span className="truncate">{channel.name}</span>
                <span className="text-xs font-medium text-zinc-400 shrink-0">
                  · {getChannelRegionMeta(channel).langTag}
                </span>
              </h3>
              <div className="text-xs text-zinc-400 truncate">
                <span>
                  {pickLang(lang, {
                    es: 'Guía EPG en Tiempo Real',
                    ca: 'Guia EPG en Temps Real',
                    en: 'Real-Time EPG Guide',
                  })}
                </span>
                <span className="mx-1.5 text-zinc-600" aria-hidden="true">
                  ·
                </span>
                <span>{channel.network}</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={pickLang(lang, {
              es: 'Cerrar Guía EPG',
              ca: 'Tancar Guia EPG',
              en: 'Close EPG Guide',
            })}
            className="min-h-[44px] min-w-[44px] rounded-2xl bg-white/[0.05] hover:bg-white/[0.12] border border-white/[0.08] flex items-center justify-center text-zinc-300 hover:text-white cursor-pointer transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
          {scheduleList.length === 0 ? (
            <div className="py-8 text-center space-y-2">
              <Clock className="w-7 h-7 text-zinc-500 mx-auto" />
              <p className="text-sm font-semibold text-white">{channel.description}</p>
              <p className="text-xs text-zinc-400">
                {loadingEpg
                  ? pickLang(lang, {
                      es: 'Sincronizando parrilla en directo...',
                      ca: 'Sincronitzant graella en directe...',
                      en: 'Syncing live TV guide...',
                    })
                  : pickLang(lang, {
                      es: 'Emisión continua 24/7 en directo disponible para reproducir ahora.',
                      ca: 'Emissió contínua 24/7 en directe disponible per reproduir ara.',
                      en: '24/7 continuous live broadcast ready to play now.',
                    })}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.07]">
              {scheduleList.map((prog, idx) => {
                const isCurrent = prog.startMs <= epgClockMs && prog.stopMs > epgClockMs;

                return (
                  <div
                    key={`${prog.startMs}-${idx}`}
                    className={`py-3.5 first:pt-0 last:pb-0 space-y-1.5 ${
                      isCurrent ? 'text-white' : 'text-zinc-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`font-mono tabular-nums font-semibold ${
                            isCurrent ? 'text-[#BF94FF]' : 'text-zinc-400'
                          }`}
                        >
                          {prog.startLabel} – {prog.stopLabel}
                        </span>
                        {isCurrent && (
                          <>
                            <span className="text-zinc-600" aria-hidden="true">
                              ·
                            </span>
                            <span className="font-semibold text-emerald-400">
                              {pickLang(lang, {
                                es: 'En emisión ahora',
                                ca: 'En emissió ara',
                                en: 'On Air Now',
                              })}
                            </span>
                          </>
                        )}
                        {prog.category && (
                          <>
                            <span className="text-zinc-600" aria-hidden="true">
                              ·
                            </span>
                            <span className="text-zinc-400 truncate">{prog.category}</span>
                          </>
                        )}
                      </div>

                      {prog.rating && (
                        <span className="font-mono tabular-nums text-[11px] text-zinc-500 shrink-0">
                          {prog.rating}
                        </span>
                      )}
                    </div>

                    <div className="font-display font-bold text-sm sm:text-[15px] text-white leading-snug">
                      {prog.title}
                    </div>

                    {isCurrent && modalEpg && (
                      <div className="h-1 w-full rounded-full bg-white/[0.08] overflow-hidden">
                        <div
                          className="h-full w-full bg-[#9146FF] rounded-full origin-left"
                          style={{
                            transform: `scaleX(${Math.max(
                              0.04,
                              Math.min(1, modalEpg.progressPct / 100)
                            )})`,
                          }}
                        />
                      </div>
                    )}

                    {prog.description && (
                      <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">
                        {prog.description}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-white/[0.08] bg-[#090A10] flex items-center gap-2 overflow-x-auto no-scrollbar">
          {channel.channels.map((sig, sIdx) => {
            const isPrimary = sIdx === 0;
            return (
              <button
                key={sig.id}
                type="button"
                onClick={() => {
                  const target = channel;
                  const hint = modalEpg?.now?.title;
                  onClose();
                  triggerHaptic('success');
                  onPlayChannel(target, sIdx, hint);
                }}
                className={`min-h-[46px] px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  isPrimary
                    ? 'flex-1 bg-[#9146FF] hover:bg-[#7C2AE8] text-white'
                    : 'bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-zinc-200'
                }`}
              >
                <Play className="w-4 h-4 fill-current" />
                <span>
                  {isPrimary
                    ? pickLang(lang, {
                        es: `Ver ${channel.name} en directo`,
                        ca: `Veure ${channel.name} en directe`,
                        en: `Watch ${channel.name} Live`,
                      })
                    : pickLang(lang, {
                        es: `Señal ${sIdx + 1}`,
                        ca: `Senyal ${sIdx + 1}`,
                        en: `Signal ${sIdx + 1}`,
                      })}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
