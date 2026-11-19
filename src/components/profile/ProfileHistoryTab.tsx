import React from 'react';
import { Film, Play, RotateCcw, Trash2, X } from 'lucide-react';
import type { AppLanguage, WatchHistoryItem } from '../../types';
import { triggerHaptic } from '../../utils/haptics';
import { pickLang } from '../../utils/i18n';
import { PosterImage } from '../ui/PosterImage';

export function formatResumeClock(sec?: number): string {
  if (!sec || !Number.isFinite(sec) || sec <= 0) return '00:00';
  const total = Math.floor(sec);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return hrs > 0 ? `${hrs}:${pad(mins)}:${pad(secs)}` : `${pad(mins)}:${pad(secs)}`;
}

interface ProfileHistoryTabProps {
  lang: AppLanguage;
  watchHistory: WatchHistoryItem[];
  onReplayHistoryItem: (item: WatchHistoryItem, forceRestart?: boolean) => void;
  onRemoveHistoryItem: (id: string) => void;
  onClearHistory: () => void;
  onClose: () => void;
}

export const ProfileHistoryTab: React.FC<ProfileHistoryTabProps> = ({
  lang,
  watchHistory,
  onReplayHistoryItem,
  onRemoveHistoryItem,
  onClearHistory,
  onClose,
}) => {
  const latestWatched = watchHistory[0] || null;

  return (
    <div className="space-y-5">
      {latestWatched ? (
        <>
          {/* Spotlight Resume Card */}
          <div className="relative rounded-2xl overflow-hidden border border-white/[0.09] bg-white/[0.04] nc-specular-surface p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5 min-w-0">
              <PosterImage
                src={latestWatched.poster}
                alt={latestWatched.title}
                aspect="poster"
                className="w-16 rounded-xl border border-white/10 shrink-0"
                fallbackIcon={<Film className="w-6 h-6 text-zinc-500" />}
              />
              <div className="min-w-0 space-y-1">
                <div className="text-[11px] font-medium text-[#BF94FF]">
                  {pickLang(lang, {
                    es: 'Última reproducción',
                    ca: 'Última reproducció',
                    en: 'Last watched',
                  })}
                </div>
                <h3 className="font-display font-bold text-base sm:text-lg text-white truncate">
                  {latestWatched.title}
                </h3>
                <p className="text-xs text-zinc-400 truncate">
                  {latestWatched.subtitle}
                </p>
                {latestWatched.resumeTimeSec && latestWatched.resumeTimeSec > 5 ? (
                  <div className="pt-1 space-y-1 max-w-[240px]">
                    <div className="text-[11px] font-mono tabular-nums text-zinc-300">
                      {pickLang(lang, {
                        es: 'Punto guardado:',
                        ca: 'Punt desat:',
                        en: 'Saved at:',
                      })}{' '}
                      {formatResumeClock(latestWatched.resumeTimeSec)}
                      {latestWatched.durationSec
                        ? ` / ${formatResumeClock(latestWatched.durationSec)}`
                        : ''}
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-white/15 overflow-hidden">
                      <div
                        className="h-full bg-[#9146FF] rounded-full"
                        style={{
                          width: `${
                            latestWatched.durationSec && latestWatched.durationSec > 0
                              ? Math.min(
                                  98,
                                  Math.max(
                                    6,
                                    Math.round(
                                      (latestWatched.resumeTimeSec /
                                        latestWatched.durationSec) *
                                        100
                                    )
                                  )
                                )
                              : 35
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('success');
                  onReplayHistoryItem(latestWatched, false);
                  onClose();
                }}
                className="flex-1 sm:flex-initial min-h-[44px] px-4 rounded-xl bg-[#9146FF] hover:bg-[#772CE8] text-xs sm:text-sm font-semibold text-white flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer transition-colors"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>
                  {latestWatched.resumeTimeSec && latestWatched.resumeTimeSec > 5
                    ? pickLang(lang, {
                        es: `Seguir en ${formatResumeClock(latestWatched.resumeTimeSec)}`,
                        ca: `Continuar a ${formatResumeClock(latestWatched.resumeTimeSec)}`,
                        en: `Resume ${formatResumeClock(latestWatched.resumeTimeSec)}`,
                      })
                    : pickLang(lang, {
                        es: 'Reproducir',
                        ca: 'Reproduir',
                        en: 'Play',
                      })}
                </span>
              </button>

              {latestWatched.resumeTimeSec && latestWatched.resumeTimeSec > 5 ? (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    onReplayHistoryItem(latestWatched, true);
                    onClose();
                  }}
                  title={pickLang(lang, {
                    es: 'Empezar desde 00:00',
                    ca: 'Començar des de 00:00',
                    en: 'Start from 00:00',
                  })}
                  aria-label={pickLang(lang, {
                    es: 'Empezar desde 00:00',
                    ca: 'Començar des de 00:00',
                    en: 'Start from 00:00',
                  })}
                  className="w-11 h-11 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 flex items-center justify-center text-zinc-300 cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              ) : null}
            </div>
          </div>

          {/* Full History List */}
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-medium text-zinc-400">
              {pickLang(lang, {
                es: 'Todo tu historial de visualización',
                ca: 'Tot el teu historial de visualització',
                en: 'Complete watch history',
              })}
            </h4>
            <button
              type="button"
              onClick={(e) => {
                const btn = e.currentTarget;
                triggerHaptic('medium');
                if (btn.dataset.confirm === '1') {
                  btn.dataset.confirm = '0';
                  onClearHistory();
                } else {
                  btn.dataset.confirm = '1';
                  const span = btn.querySelector('span');
                  if (span) {
                    span.textContent = pickLang(lang, {
                      es: '¿Confirmar borrar?',
                      ca: 'Confirmes esborrar?',
                      en: 'Confirm clear?',
                    });
                  }
                  setTimeout(() => {
                    btn.dataset.confirm = '0';
                    if (span) {
                      span.textContent = pickLang(lang, {
                        es: 'Borrar todo',
                        ca: 'Esborrar tot',
                        en: 'Clear all',
                      });
                    }
                  }, 3000);
                }
              }}
              className="min-h-[36px] px-2.5 rounded-xl bg-white/[0.04] hover:bg-rose-500/20 border border-white/[0.08] text-xs font-medium text-zinc-300 hover:text-rose-300 flex items-center gap-1 cursor-pointer transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>
                {pickLang(lang, {
                  es: 'Borrar todo',
                  ca: 'Esborrar tot',
                  en: 'Clear all',
                })}
              </span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {watchHistory.map((item) => {
              const pct =
                item.resumeTimeSec && item.durationSec && item.durationSec > 0
                  ? Math.min(
                      98,
                      Math.max(
                        5,
                        Math.round((item.resumeTimeSec / item.durationSec) * 100)
                      )
                    )
                  : item.resumeTimeSec && item.resumeTimeSec > 5
                  ? 30
                  : 0;

              return (
                <div
                  key={item.id}
                  className="rounded-2xl bg-white/[0.04] border border-white/[0.08] hover:border-[#9146FF]/40 p-3 flex items-center gap-3 transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      onReplayHistoryItem(item, false);
                      onClose();
                    }}
                    className="flex items-center gap-3 flex-1 min-w-0 text-left cursor-pointer"
                  >
                    <div className="relative w-12 h-16 rounded-lg overflow-hidden bg-[#26262C] shrink-0">
                      <PosterImage
                        src={item.poster}
                        alt={item.title}
                        aspect="none"
                        className="w-full h-full"
                        fallbackIcon={<Film className="w-4 h-4 text-zinc-500" />}
                      />
                      {pct > 0 && (
                        <div className="absolute bottom-0 inset-x-0 h-1 bg-black/70">
                          <div
                            className="h-full bg-[#9146FF]"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="text-xs sm:text-sm font-semibold text-white truncate">
                        {item.title}
                      </div>
                      <div className="text-[11px] text-zinc-400 truncate mt-0.5">
                        {item.subtitle}
                      </div>
                      <div className="text-[11px] font-mono tabular-nums text-[#BF94FF] mt-1">
                        {item.resumeTimeSec && item.resumeTimeSec > 5
                          ? `${pickLang(lang, {
                              es: 'Seguir en',
                              ca: 'Continuar a',
                              en: 'Resume',
                            })} ${formatResumeClock(item.resumeTimeSec)}`
                          : pickLang(lang, {
                              es: 'Volver a ver',
                              ca: 'Tornar a veure',
                              en: 'Watch again',
                            })}
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      onRemoveHistoryItem(item.id);
                    }}
                    aria-label={pickLang(lang, {
                      es: 'Eliminar del historial',
                      ca: "Eliminar de l'historial",
                      en: 'Remove from history',
                    })}
                    className="w-9 h-9 rounded-xl bg-white/[0.04] hover:bg-rose-500/20 text-zinc-400 hover:text-rose-300 flex items-center justify-center shrink-0 cursor-pointer transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <p className="py-12 text-center text-sm text-zinc-400">
          {pickLang(lang, {
            es: 'Tu historial está vacío.',
            ca: 'El teu historial és buit.',
            en: 'Your watch history is empty.',
          })}
        </p>
      )}
    </div>
  );
};
