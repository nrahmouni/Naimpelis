import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  Film,
  Trophy,
  Tv,
  Gamepad2,
  Users,
  Sparkles,
  Check,
  Pencil,
  Play,
  ChevronRight,
  Clock,
} from 'lucide-react';
import type { AppLanguage, WatchHistoryItem } from '../types';
import type { PrimaryWorldId } from '../store/useAppStore';
import { pickLang } from '../utils/i18n';
import { triggerHaptic } from '../utils/haptics';
import { PosterImage } from './ui/PosterImage';

interface EntryHomeScreenProps {
  lang: AppLanguage;
  displayName: string;
  isGuestName: boolean;
  onUpdateDisplayName: (nextName: string) => void;
  watchHistory: WatchHistoryItem[];
  onResumeHistoryItem: (item: WatchHistoryItem) => void;
  onOpenContinueWatchingAll: () => void;
  onOpenSurpriseMe: () => void;
  onSelectWorld: (world: PrimaryWorldId) => void;
  onPreloadWorld?: (world: PrimaryWorldId) => void;
  lastUsedWorld: PrimaryWorldId | null;
  liveMatchesCount: number;
  roomParticipantsCount: number;
}

interface WorldTileConfig {
  id: PrimaryWorldId;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  gradient: string;
  accentBorder: string;
  iconBg: string;
}

export const EntryHomeScreen: React.FC<EntryHomeScreenProps> = ({
  lang,
  displayName,
  isGuestName,
  onUpdateDisplayName,
  watchHistory,
  onResumeHistoryItem,
  onOpenContinueWatchingAll,
  onOpenSurpriseMe,
  onSelectWorld,
  onPreloadWorld,
  lastUsedWorld,
  liveMatchesCount,
  roomParticipantsCount,
}) => {
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(displayName);

  const handleSaveName = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleaned = nameDraft.trim();
    if (cleaned.length >= 2) {
      triggerHaptic('light');
      onUpdateDisplayName(cleaned);
    } else {
      setNameDraft(displayName);
    }
    setEditingName(false);
  };

  const orderedWorlds = useMemo(() => {
    const base: WorldTileConfig[] = [
      {
        id: 'cine',
        title: pickLang(lang, { es: 'CINE', ca: 'CINE', en: 'CINEMA' }),
        description: pickLang(lang, {
          es: 'Películas, series y plataformas',
          ca: 'Pel·lícules, sèries i plataformes',
          en: 'Movies, series & platforms',
        }),
        icon: Film,
        gradient: 'from-[#9146FF]/28 via-[#3B1878]/25 to-[#11131B]',
        accentBorder: 'border-[#9146FF]/35 hover:border-[#9146FF]/75',
        iconBg: 'bg-[#9146FF]/25 text-[#D8B4FE] border-[#9146FF]/45',
      },
      {
        id: 'futbol',
        title: pickLang(lang, { es: 'FÚTBOL', ca: 'FUTBOL', en: 'FOOTBALL' }),
        description: pickLang(lang, {
          es: 'Partidos de hoy y canales en vivo',
          ca: "Partits d'avui i canals en directe",
          en: 'Today’s matches & live channels',
        }),
        icon: Trophy,
        gradient: 'from-emerald-600/24 via-[#0F2A22]/30 to-[#11131B]',
        accentBorder: 'border-emerald-400/30 hover:border-emerald-400/70',
        iconBg: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/35',
      },
      {
        id: 'tv',
        title: pickLang(lang, { es: 'TV EN DIRECTO', ca: 'TV EN DIRECTE', en: 'LIVE TV' }),
        description: pickLang(lang, {
          es: 'TDT, programación y señales 24/7',
          ca: 'TDT, programació i senyals 24/7',
          en: 'Live TV, guide & 24/7 channels',
        }),
        icon: Tv,
        gradient: 'from-sky-500/24 via-[#122238]/30 to-[#11131B]',
        accentBorder: 'border-sky-400/30 hover:border-sky-400/70',
        iconBg: 'bg-sky-500/20 text-sky-300 border-sky-400/35',
      },
      {
        id: 'juegos',
        title: pickLang(lang, { es: 'JUEGOS', ca: 'JOCS', en: 'GAMES' }),
        description: pickLang(lang, {
          es: 'Billar, Parchís, UNO y más en grupo',
          ca: 'Billar, Parxís, UNO i més en grup',
          en: 'Pool, Parchís, UNO & more',
        }),
        icon: Gamepad2,
        gradient: 'from-fuchsia-600/24 via-[#2D143B]/30 to-[#11131B]',
        accentBorder: 'border-fuchsia-400/30 hover:border-fuchsia-400/70',
        iconBg: 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-400/35',
      },
      {
        id: 'sala',
        title: pickLang(lang, { es: 'SALA CON AMIGOS', ca: 'SALA AMB AMICS', en: 'WATCH PARTY' }),
        description: pickLang(lang, {
          es: 'Chat en vivo, voz y cola compartida',
          ca: 'Xat en directe, veu i cua compartida',
          en: 'Live chat, voice & shared queue',
        }),
        icon: Users,
        gradient: 'from-indigo-500/26 via-[#1B1840]/30 to-[#11131B]',
        accentBorder: 'border-indigo-400/35 hover:border-indigo-400/75',
        iconBg: 'bg-indigo-500/20 text-indigo-300 border-indigo-400/40',
      },
    ];

    if (!lastUsedWorld) return base;
    const idx = base.findIndex((item) => item.id === lastUsedWorld);
    if (idx <= 0) return base;
    const picked = base[idx];
    return [picked, ...base.slice(0, idx), ...base.slice(idx + 1)];
  }, [lang, lastUsedWorld]);

  const greetingWord = pickLang(lang, { es: 'Hola', ca: 'Hola', en: 'Hi' });

  return (
    <div className="w-full max-w-4xl mx-auto px-4 pt-2 pb-24 space-y-5 @container">
      {/* 1. PERSONALIZED GREETING */}
      <section className="space-y-1">
        {editingName ? (
          <form onSubmit={handleSaveName} className="flex items-center gap-2 max-w-sm">
            <input
              type="text"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              maxLength={24}
              autoFocus
              aria-label={pickLang(lang, {
                es: 'Tu nombre',
                ca: 'El teu nom',
                en: 'Your name',
              })}
              className="flex-1 min-h-12 px-3.5 rounded-2xl bg-white/[0.07] border border-[#9146FF] text-lg font-display font-bold text-white focus:outline-none"
            />
            <button
              type="submit"
              className="min-h-12 min-w-12 px-4 rounded-2xl bg-[#9146FF] hover:bg-[#7C2AE8] text-white font-bold flex items-center justify-center cursor-pointer active:scale-95 transition-all"
              aria-label={pickLang(lang, { es: 'Guardar', ca: 'Desar', en: 'Save' })}
            >
              <Check className="w-5 h-5" />
            </button>
          </form>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            {isGuestName ? (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setNameDraft(displayName);
                  setEditingName(true);
                }}
                className="group inline-flex items-center gap-2 text-left cursor-pointer rounded-xl py-0.5 focus:outline-none"
                title={pickLang(lang, {
                  es: 'Toca para cambiar tu nombre',
                  ca: 'Toca per canviar el teu nom',
                  en: 'Tap to change your name',
                })}
              >
                <h1 className="font-display font-extrabold text-[clamp(1.65rem,5vw,2.25rem)] leading-tight tracking-tight text-white">
                  {greetingWord}, {displayName}
                </h1>
                <span className="w-8 h-8 rounded-full bg-white/[0.07] group-hover:bg-[#9146FF]/30 border border-white/[0.1] flex items-center justify-center text-zinc-300 group-hover:text-white transition-colors shrink-0">
                  <Pencil className="w-3.5 h-3.5" />
                </span>
              </button>
            ) : (
              <h1 className="font-display font-extrabold text-[clamp(1.65rem,5vw,2.25rem)] leading-tight tracking-tight text-white">
                {greetingWord}, {displayName}
              </h1>
            )}
          </div>
        )}

        <p className="text-sm sm:text-base text-zinc-400 font-medium">
          {pickLang(lang, {
            es: '¿Qué quieres ver hoy?',
            ca: 'Què vols veure avui?',
            en: 'What do you want to watch today?',
          })}
        </p>
      </section>

      {/* 2. CONDITIONAL CONTINUE WATCHING STRIP (ONLY IF USER HAS HISTORY) */}
      {watchHistory.length > 0 && (
        <section className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display font-bold text-sm sm:text-base text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#BF94FF]" />
              <span>
                {pickLang(lang, {
                  es: 'Continuar viendo',
                  ca: 'Continuar veient',
                  en: 'Continue watching',
                })}
              </span>
            </h2>
            {watchHistory.length > 4 && (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  onOpenContinueWatchingAll();
                }}
                className="min-h-10 px-2.5 rounded-xl text-xs font-semibold text-[#BF94FF] hover:text-white inline-flex items-center gap-1 cursor-pointer"
              >
                <span>{pickLang(lang, { es: 'Ver todo', ca: 'Veure-ho tot', en: 'See all' })}</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="scroll-snap-x flex gap-3 overflow-x-auto pb-1 no-scrollbar">
            {watchHistory.slice(0, 10).map((item) => {
              const pct =
                item.durationSec && item.durationSec > 0 && item.resumeTimeSec
                  ? Math.min(96, Math.max(6, Math.round((item.resumeTimeSec / item.durationSec) * 100)))
                  : 18;
              const epBadge =
                item.mediaType === 'tv' && item.season && item.episode
                  ? `T${item.season}·E${item.episode}`
                  : null;

              return (
                <button
                  key={`${item.id}-${item.watchedAt}`}
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    onResumeHistoryItem(item);
                  }}
                  className="scroll-snap-item w-[156px] sm:w-[172px] shrink-0 rounded-2xl bg-[#11131B] border border-white/[0.08] hover:border-[#9146FF]/60 overflow-hidden text-left group active:scale-[0.97] transition-all cursor-pointer"
                >
                  <div className="relative aspect-video w-full bg-[#090A0F]">
                    <PosterImage
                      src={item.backdrop || item.poster}
                      alt={item.title}
                      aspect="video"
                      fallbackTitle={item.title}
                      imgClassName="sm:group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="w-9 h-9 rounded-full bg-black/65 backdrop-blur-md border border-white/25 flex items-center justify-center text-white group-hover:bg-[#9146FF] group-hover:border-[#9146FF] transition-colors">
                        <Play className="w-4 h-4 fill-current ml-0.5" />
                      </span>
                    </span>
                    {epBadge && (
                      <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-black/75 text-[10px] font-bold text-white tabular-nums">
                        {epBadge}
                      </span>
                    )}
                    <div className="absolute inset-x-0 bottom-0 h-1 bg-white/15">
                      <div
                        className="h-full bg-[#9146FF]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  <div className="p-2.5">
                    <p className="text-xs font-bold text-white leading-snug line-clamp-1">
                      {item.title}
                    </p>
                    {item.subtitle && (
                      <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                        {item.subtitle}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* 3. COMPACT SURPRISE ME CARD ABOVE THE WORLD GRID */}
      <motion.button
        type="button"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        onClick={() => {
          triggerHaptic('light');
          onOpenSurpriseMe();
        }}
        className="w-full min-h-14 px-4 py-3 rounded-2xl bg-gradient-to-r from-[#9146FF]/22 via-[#6D28D9]/18 to-[#141520] hover:from-[#9146FF]/32 hover:to-[#1B1D2C] border border-[#9146FF]/40 flex items-center justify-between gap-3 text-left cursor-pointer active:scale-[0.985] transition-all"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-[#9146FF] text-white flex items-center justify-center shrink-0 shadow-[0_4px_14px_rgba(145,70,255,0.4)]">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="font-display font-bold text-sm text-white leading-tight">
              {pickLang(lang, {
                es: 'Sorpréndeme',
                ca: 'Sorprèn-me',
                en: 'Surprise me',
              })}
            </p>
            <p className="text-xs text-zinc-300 truncate mt-0.5">
              {pickLang(lang, {
                es: 'Elige algo al instante sin pensar',
                ca: "Tria alguna cosa a l'instant",
                en: 'Instant pick to watch right now',
              })}
            </p>
          </div>
        </div>
        <ChevronRight className="w-5 h-5 text-[#D8B4FE] shrink-0" />
      </motion.button>

      {/* 4. WORLDS GRID (2 PER ROW, LARGE TACTILE CARDS, LAST USED FIRST) */}
      <section className="grid grid-cols-2 gap-3 sm:gap-4">
        {orderedWorlds.map((world, index) => {
          const Icon = world.icon;
          const isRecent = lastUsedWorld === world.id && index === 0;
          const isLastOddCard = orderedWorlds.length % 2 === 1 && index === orderedWorlds.length - 1;

          return (
            <motion.button
              key={world.id}
              type="button"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, delay: index * 0.04 }}
              onPointerEnter={() => onPreloadWorld?.(world.id)}
              onTouchStart={() => onPreloadWorld?.(world.id)}
              onClick={() => {
                triggerHaptic('light');
                onSelectWorld(world.id);
              }}
              className={`group relative rounded-3xl p-4 sm:p-5 bg-gradient-to-br ${world.gradient} border ${world.accentBorder} text-left flex flex-col justify-between gap-4 min-h-[144px] sm:min-h-[164px] cursor-pointer active:scale-[0.97] transition-all overflow-hidden shadow-[0_10px_28px_rgba(0,0,0,0.45)] ${
                isLastOddCard ? 'col-span-2' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div
                  className={`w-11 h-11 rounded-2xl border flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105 ${world.iconBg}`}
                >
                  <Icon className="w-5 h-5" />
                </div>

                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                  {world.id === 'futbol' && liveMatchesCount > 0 && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#EB0400] text-white text-[11px] font-bold leading-none tabular-nums shadow-md">
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                      <span>
                        {pickLang(lang, {
                          es: `${liveMatchesCount} en vivo`,
                          ca: `${liveMatchesCount} en directe`,
                          en: `${liveMatchesCount} live`,
                        })}
                      </span>
                    </span>
                  )}

                  {world.id === 'sala' && roomParticipantsCount > 1 && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#00F593]/18 border border-[#00F593]/40 text-[#00F593] text-[11px] font-bold leading-none tabular-nums">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#00F593]" />
                      <span>{roomParticipantsCount}</span>
                    </span>
                  )}

                  {isRecent && !(world.id === 'futbol' && liveMatchesCount > 0) && (
                    <span className="px-2 py-0.5 rounded-full bg-white/10 text-[10px] font-semibold text-zinc-200">
                      {pickLang(lang, { es: 'Reciente', ca: 'Recent', en: 'Recent' })}
                    </span>
                  )}
                </div>
              </div>

              <div className="min-w-0 space-y-1">
                <h3 className="font-display font-extrabold text-base sm:text-lg text-white tracking-tight leading-snug">
                  {world.title}
                </h3>
                <p className="text-xs text-zinc-300 leading-snug line-clamp-2">
                  {world.description}
                </p>
              </div>
            </motion.button>
          );
        })}
      </section>
    </div>
  );
};
