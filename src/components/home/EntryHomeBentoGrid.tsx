import React from 'react';
import { motion } from 'motion/react';
import { CircleDot, Dices, Spade } from 'lucide-react';
import type { AppLanguage, CatalogMovie } from '../../types';
import type { PrimaryWorldId } from '../../store/useAppStore';
import { pickLang } from '../../utils/i18n';
import {
  RiffanArrowRightIcon,
  RiffanChannelsIcon,
  RiffanDiceIcon,
  RiffanFootballIcon,
  RiffanMoviesIcon,
  RiffanUsersIcon,
} from '../ui/RiffanIcons';

/** Subtle animated audio waveform bars strictly inside the Sala badge */
const SalaVoiceWaves: React.FC = () => (
  <span className="inline-flex items-end gap-[2px] h-3" aria-hidden="true">
    {[0.45, 0.9, 1, 0.6].map((multiplier, i) => (
      <motion.span
        key={i}
        animate={{ height: ['4px', `${11 * multiplier}px`, '4px'] }}
        transition={{
          duration: 1.15,
          repeat: Infinity,
          delay: i * 0.16,
          ease: 'easeInOut',
        }}
        className="w-[2px] rounded-full bg-[#00F593]"
      />
    ))}
  </span>
);

interface EntryHomeBentoGridProps {
  lang: AppLanguage;
  sessionMode?: 'solo' | 'party';
  lastUsedWorld: PrimaryWorldId | null;
  heroPosters: CatalogMovie[];
  featuredChannels: Array<{ id: string; mark: string; tone: string }>;
  liveMatchesCount: number;
  featuredLiveMatch: string | null;
  roomParticipantsCount: number;
  onPreloadWorld?: (world: PrimaryWorldId) => void;
  onCardPointerMove: (id: string, e: React.PointerEvent<HTMLButtonElement>) => void;
  onCardClick: (worldId: PrimaryWorldId, e?: React.MouseEvent<HTMLButtonElement>) => void;
  renderSpotlightOverlay: (id: string) => React.ReactNode;
}

export const EntryHomeBentoGrid: React.FC<EntryHomeBentoGridProps> = ({
  lang,
  sessionMode = 'party',
  lastUsedWorld,
  heroPosters,
  featuredChannels,
  liveMatchesCount,
  featuredLiveMatch,
  roomParticipantsCount,
  onPreloadWorld,
  onCardPointerMove,
  onCardClick,
  renderSpotlightOverlay,
}) => (
  <section className="grid grid-cols-2 md:grid-cols-6 gap-3 sm:gap-4">
    {/* HERO CARD: CINE Y SERIES */}
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.14 }}
      whileTap={{ scale: 0.98 }}
      onPointerEnter={() => onPreloadWorld?.('cine')}
      onTouchStart={() => onPreloadWorld?.('cine')}
      onPointerMove={(e) => onCardPointerMove('cine', e)}
      onClick={(e) => onCardClick('cine', e)}
      className="group relative col-span-2 md:col-span-4 md:order-1 rounded-3xl p-4 sm:p-6 min-h-[154px] sm:min-h-[188px] bg-[#10121C] hover:bg-[#131624] border border-white/[0.09] hover:border-[#9146FF]/55 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_14px_34px_rgba(0,0,0,0.45)] text-left flex flex-col justify-between overflow-hidden cursor-pointer transition-all duration-200"
    >
      {renderSpotlightOverlay('cine')}

      <div
        aria-hidden="true"
        className="absolute -bottom-16 right-8 w-56 h-56 rounded-full bg-[#9146FF]/18 blur-3xl pointer-events-none group-hover:bg-[#9146FF]/28 transition-colors duration-300"
      />

      <div
        aria-hidden="true"
        className="absolute right-0 top-0 bottom-0 w-[46%] sm:w-[48%] pointer-events-none overflow-hidden select-none"
      >
        {heroPosters.length > 0 ? (
          <div className="relative w-full h-full flex items-center justify-end pr-2 sm:pr-4 pt-1">
            {heroPosters.slice(0, 3).map((m, idx) => {
              const offsets = [
                'right-16 sm:right-24 bottom-3 sm:bottom-4 -rotate-8 opacity-80 scale-90',
                'right-8 sm:right-12 bottom-4 sm:bottom-5 rotate-2 opacity-95 scale-95 z-[1]',
                'right-1 sm:right-2 bottom-3 sm:bottom-4 rotate-8 opacity-100 z-[2]',
              ];
              return (
                <div
                  key={m.id || idx}
                  className={`absolute w-[70px] h-[102px] sm:w-[92px] sm:h-[132px] rounded-xl overflow-hidden border border-white/25 bg-[#181A28] shadow-[0_14px_30px_rgba(0,0,0,0.65)] transition-transform duration-300 group-hover:-translate-y-1.5 ${
                    offsets[idx] || offsets[0]
                  }`}
                >
                  <img
                    src={m.poster}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover brightness-110 contrast-105"
                    loading="lazy"
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <div className="relative w-full h-full flex items-end justify-end pr-4 pb-2 opacity-55">
            <div className="w-20 h-28 rounded-xl border border-white/15 bg-gradient-to-br from-[#9146FF]/25 to-transparent -rotate-6 translate-x-4" />
            <div className="w-20 h-28 rounded-xl border border-white/20 bg-gradient-to-br from-white/[0.1] to-transparent rotate-6" />
          </div>
        )}
        <div className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-[#10121C] via-[#10121C]/55 to-transparent" />
      </div>

      <div className="relative z-10 flex items-center gap-2 text-xs font-medium text-zinc-400">
        <span className="w-7 h-7 rounded-lg bg-[#9146FF]/18 border border-[#9146FF]/35 flex items-center justify-center text-[#D8B4FE] shrink-0">
          <RiffanMoviesIcon size={15} animate="hover" />
        </span>
        {lastUsedWorld === 'cine' ? (
          <span className="text-[#C4A7FF] font-semibold">
            {pickLang(lang, { es: 'Reciente', ca: 'Recent', en: 'Recent' })}
          </span>
        ) : (
          <span>{pickLang(lang, { es: 'Catálogo 4K', ca: 'Catàleg 4K', en: '4K Catalog' })}</span>
        )}
      </div>

      <div className="relative z-10 max-w-[62%] sm:max-w-[56%] space-y-1 mt-3">
        <h2 className="font-display font-bold text-lg sm:text-2xl text-white tracking-tight leading-tight">
          {pickLang(lang, { es: 'Cine y Series', ca: 'Cine i Sèries', en: 'Movies & Series' })}
        </h2>
        <p className="text-xs sm:text-[13px] text-zinc-400 leading-snug line-clamp-2">
          {pickLang(lang, {
            es: 'Películas, series y anime en 4K',
            ca: 'Pel·lícules, sèries i anime en 4K',
            en: 'Movies, series & anime in 4K',
          })}
        </p>
        <div className="pt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-[#C4A7FF] group-hover:text-white transition-colors">
          <span>{pickLang(lang, { es: 'Explorar', ca: 'Explorar', en: 'Browse' })}</span>
          <RiffanArrowRightIcon size={14} animate="hover" />
        </div>
      </div>
    </motion.button>

    {/* CARD 2: FÚTBOL */}
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.14 }}
      whileTap={{ scale: 0.97 }}
      onPointerEnter={() => onPreloadWorld?.('futbol')}
      onTouchStart={() => onPreloadWorld?.('futbol')}
      onPointerMove={(e) => onCardPointerMove('futbol', e)}
      onClick={(e) => onCardClick('futbol', e)}
      className="group relative col-span-1 md:col-span-2 md:order-3 rounded-3xl p-4 sm:p-5 min-h-[144px] sm:min-h-[168px] bg-[#10121B] hover:bg-[#131722] border border-white/[0.08] hover:border-emerald-400/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_10px_28px_rgba(0,0,0,0.42)] text-left flex flex-col justify-between overflow-hidden cursor-pointer transition-all duration-200"
    >
      {renderSpotlightOverlay('futbol')}

      <svg
        aria-hidden="true"
        viewBox="0 0 120 120"
        className="absolute -top-6 -right-6 w-28 h-28 text-emerald-400 opacity-[0.08] pointer-events-none"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <circle cx="90" cy="30" r="34" />
        <circle cx="90" cy="30" r="14" />
      </svg>

      <div className="relative z-10 flex items-center justify-between gap-2">
        <div className="w-9 h-9 rounded-xl bg-emerald-500/12 border border-emerald-400/25 flex items-center justify-center text-emerald-400 shrink-0 group-hover:scale-105 transition-transform">
          <RiffanFootballIcon size={18} animate="hover" />
        </div>

        {liveMatchesCount > 0 ? (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#EB0400] text-white text-[10px] font-bold leading-none tabular-nums">
            <span className="w-1.5 h-1.5 rounded-full bg-white" />
            <span>
              {pickLang(lang, {
                es: `${liveMatchesCount} en vivo`,
                ca: `${liveMatchesCount} en directe`,
                en: `${liveMatchesCount} live`,
              })}
            </span>
          </span>
        ) : lastUsedWorld === 'futbol' ? (
          <span className="text-[11px] font-semibold text-emerald-300">
            {pickLang(lang, { es: 'Reciente', ca: 'Recent', en: 'Recent' })}
          </span>
        ) : (
          <span className="text-[11px] font-medium text-zinc-500">
            {pickLang(lang, { es: 'Hoy', ca: 'Avui', en: 'Today' })}
          </span>
        )}
      </div>

      <div className="relative z-10 min-w-0 space-y-1 pt-4">
        <h2 className="font-display font-bold text-base sm:text-lg text-white tracking-tight leading-snug">
          {pickLang(lang, { es: 'Fútbol', ca: 'Futbol', en: 'Football' })}
        </h2>
        <p className="text-xs text-zinc-400 leading-snug line-clamp-2">
          {featuredLiveMatch
            ? featuredLiveMatch
            : pickLang(lang, {
                es: 'Partidos de hoy y señales en vivo',
                ca: "Partits d'avui i senyals en directe",
                en: "Today's matches & live feeds",
              })}
        </p>
      </div>
    </motion.button>

    {/* CARD 3: TV EN DIRECTO */}
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.14 }}
      whileTap={{ scale: 0.97 }}
      onPointerEnter={() => onPreloadWorld?.('tv')}
      onTouchStart={() => onPreloadWorld?.('tv')}
      onPointerMove={(e) => onCardPointerMove('tv', e)}
      onClick={(e) => onCardClick('tv', e)}
      className="group relative col-span-1 md:col-span-2 md:order-4 rounded-3xl p-4 sm:p-5 min-h-[144px] sm:min-h-[168px] bg-[#10121B] hover:bg-[#131724] border border-white/[0.08] hover:border-sky-400/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_10px_28px_rgba(0,0,0,0.42)] text-left flex flex-col justify-between overflow-hidden cursor-pointer transition-all duration-200"
    >
      {renderSpotlightOverlay('tv')}

      <div
        aria-hidden="true"
        className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-sky-500/12 blur-2xl pointer-events-none"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-3 top-10 flex items-center gap-1.5 opacity-[0.09] group-hover:opacity-[0.18] rotate-2 transition-opacity duration-300"
      >
        {featuredChannels.slice(0, 4).map((ch) => (
          <span
            key={`bg-${ch.id}`}
            className="px-2 py-0.5 rounded-lg border border-white/20 text-[10px] font-black text-white"
            style={{ backgroundColor: ch.tone }}
          >
            {ch.mark}
          </span>
        ))}
      </div>

      <div className="relative z-10 flex items-center justify-between gap-2">
        <div className="w-9 h-9 rounded-xl bg-sky-500/12 border border-sky-400/25 flex items-center justify-center text-sky-400 shrink-0 group-hover:scale-105 transition-transform">
          <RiffanChannelsIcon size={17} animate="hover" />
        </div>

        <div className="flex items-center -space-x-1.5" aria-hidden="true">
          {featuredChannels.slice(0, 3).map((ch) => (
            <span
              key={ch.id}
              className="w-6 h-6 rounded-full border border-[#10121B] flex items-center justify-center text-[9px] font-display font-bold text-white shadow-sm"
              style={{ backgroundColor: ch.tone }}
            >
              {ch.mark.slice(0, 2)}
            </span>
          ))}
        </div>
      </div>

      <div className="relative z-10 min-w-0 space-y-1 pt-4">
        <h2 className="font-display font-bold text-base sm:text-lg text-white tracking-tight leading-snug">
          {pickLang(lang, { es: 'TV en Directo', ca: 'TV en Directe', en: 'Live TV' })}
        </h2>
        <p className="text-xs text-zinc-400 leading-snug line-clamp-2">
          {pickLang(lang, {
            es: 'TDT, programación y canales 24/7',
            ca: 'TDT, programació i canals 24/7',
            en: 'DTT, guide & 24/7 channels',
          })}
        </p>
      </div>
    </motion.button>

    {/* CARD 4: JUEGOS */}
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.14 }}
      whileTap={{ scale: 0.97 }}
      onPointerEnter={() => onPreloadWorld?.('juegos')}
      onTouchStart={() => onPreloadWorld?.('juegos')}
      onPointerMove={(e) => onCardPointerMove('juegos', e)}
      onClick={(e) => onCardClick('juegos', e)}
      className="group relative col-span-1 md:col-span-2 md:order-5 rounded-3xl p-4 sm:p-5 min-h-[144px] sm:min-h-[168px] bg-[#10121B] hover:bg-[#151422] border border-white/[0.08] hover:border-fuchsia-400/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_10px_28px_rgba(0,0,0,0.42)] text-left flex flex-col justify-between overflow-hidden cursor-pointer transition-all duration-200"
    >
      {renderSpotlightOverlay('juegos')}

      <div
        aria-hidden="true"
        className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-fuchsia-500/12 blur-2xl pointer-events-none"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-2 bottom-2 flex items-center gap-2 opacity-[0.1] group-hover:opacity-[0.2] group-hover:scale-105 transition-all duration-300 text-fuchsia-300"
      >
        <CircleDot className="w-7 h-7 -rotate-12" />
        <Dices className="w-8 h-8 rotate-12" />
        <Spade className="w-6 h-6 -rotate-6" />
      </div>

      <div className="relative z-10 flex items-center justify-between gap-2">
        <div className="w-9 h-9 rounded-xl bg-fuchsia-500/12 border border-fuchsia-400/25 flex items-center justify-center text-fuchsia-400 shrink-0 group-hover:scale-105 transition-transform">
          <RiffanDiceIcon size={18} animate="hover" />
        </div>

        <div className="flex items-center -space-x-1.5" aria-hidden="true">
          {[
            { Icon: CircleDot, key: 'pool' },
            { Icon: Dices, key: 'dice' },
            { Icon: Spade, key: 'cards' },
          ].map(({ Icon, key }) => (
            <span
              key={key}
              className="w-6 h-6 rounded-full bg-[#181A28] border border-white/[0.12] flex items-center justify-center text-fuchsia-300 shadow-sm"
            >
              <Icon className="w-3 h-3" />
            </span>
          ))}
        </div>
      </div>

      <div className="relative z-10 min-w-0 space-y-1 pt-4">
        <h2 className="font-display font-bold text-base sm:text-lg text-white tracking-tight leading-snug">
          {pickLang(lang, { es: 'Juegos', ca: 'Jocs', en: 'Games' })}
        </h2>
        <p className="text-xs text-zinc-400 leading-snug line-clamp-2">
          {pickLang(lang, {
            es: 'Billar, Parchís, UNO y más',
            ca: 'Billar, Parxís, UNO i més',
            en: 'Pool, Parchís, UNO & more',
          })}
        </p>
      </div>
    </motion.button>

    {/* CARD 5: SALA CON AMIGOS */}
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.14 }}
      whileTap={{ scale: 0.97 }}
      onPointerEnter={() => onPreloadWorld?.('sala')}
      onTouchStart={() => onPreloadWorld?.('sala')}
      onPointerMove={(e) => onCardPointerMove('sala', e)}
      onClick={(e) => onCardClick('sala', e)}
      className="group relative col-span-1 md:col-span-2 md:order-2 rounded-3xl p-4 sm:p-5 min-h-[144px] sm:min-h-[188px] bg-gradient-to-br from-[#17132A] via-[#11131E] to-[#10121B] hover:from-[#1D1736] hover:to-[#131522] border border-[#9146FF]/35 hover:border-[#9146FF]/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_12px_32px_rgba(145,70,255,0.14)] text-left flex flex-col justify-between overflow-hidden cursor-pointer transition-all duration-200"
    >
      {renderSpotlightOverlay('sala')}

      <div
        aria-hidden="true"
        className="absolute -bottom-10 -right-10 w-36 h-36 rounded-full bg-[#9146FF]/20 blur-2xl pointer-events-none"
      />

      <div className="relative z-10 flex items-center justify-between gap-2">
        <div className="w-9 h-9 rounded-xl bg-[#9146FF]/22 border border-[#9146FF]/40 flex items-center justify-center text-[#D8B4FE] shrink-0 group-hover:scale-105 transition-transform">
          <RiffanUsersIcon size={17} animate="hover" />
        </div>

        {sessionMode === 'solo' ? (
          <span className="px-2 py-0.5 rounded-full bg-[#9146FF]/25 border border-[#BF94FF]/45 text-[10px] font-bold text-[#E9D5FF] whitespace-nowrap">
            {pickLang(lang, {
              es: 'Ver con amigos',
              ca: 'Veure amb amics',
              en: 'Watch party',
              rif: 'S tmdukkalin',
              zh: '创建房间',
            })}
          </span>
        ) : (
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#00F593] tabular-nums">
            <SalaVoiceWaves />
            <span>{roomParticipantsCount > 0 ? roomParticipantsCount : 1}</span>
          </div>
        )}
      </div>

      <div className="relative z-10 min-w-0 space-y-1 pt-4">
        <h2 className="font-display font-bold text-base sm:text-lg text-white tracking-tight leading-snug">
          {pickLang(lang, {
            es: 'Sala con Amigos',
            ca: 'Sala amb Amics',
            en: 'Watch Party',
          })}
        </h2>
        <p className="text-xs text-zinc-400 leading-snug line-clamp-2">
          {sessionMode === 'solo'
            ? pickLang(lang, {
                es: 'Crea una sala y comparte enlace',
                ca: 'Crea una sala i comparteix enllaç',
                en: 'Create a room and share link',
              })
            : pickLang(lang, {
                es: 'Chat, voz y cola compartida',
                ca: 'Xat, veu i cua compartida',
                en: 'Live chat, voice & shared queue',
              })}
        </p>
      </div>
    </motion.button>
  </section>
);
