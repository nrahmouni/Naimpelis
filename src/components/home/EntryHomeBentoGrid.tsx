import React from 'react';
import { motion } from 'motion/react';
import { Database, Radio, Server, Tv } from 'lucide-react';
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
  liveMatchesCount,
  featuredLiveMatch,
  roomParticipantsCount,
  onPreloadWorld,
  onCardPointerMove,
  onCardClick,
  renderSpotlightOverlay,
}) => (
  <section className="grid grid-cols-2 md:grid-cols-6 gap-3 sm:gap-3.5">
    {/* HERO CARD: CINE Y SERIES */}
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.16 }}
      whileTap={{ scale: 0.96 }}
      onPointerEnter={() => onPreloadWorld?.('cine')}
      onTouchStart={() => onPreloadWorld?.('cine')}
      onPointerMove={(e) => onCardPointerMove('cine', e)}
      onClick={(e) => onCardClick('cine', e)}
      className="group relative col-span-2 md:col-span-4 md:order-1 rounded-[24px] p-5 sm:p-6 min-h-[164px] sm:min-h-[188px] bg-[#0D0D12] hover:bg-[#14141C] border border-white/[0.08] hover:border-[#7C3AED]/60 shadow-[0_18px_50px_rgba(0,0,0,0.65)] text-left flex flex-col justify-between overflow-hidden cursor-pointer transition-all duration-200"
    >
      {renderSpotlightOverlay('cine')}

      <div
        aria-hidden="true"
        className="absolute right-0 top-0 bottom-0 w-[44%] sm:w-[46%] pointer-events-none overflow-hidden select-none"
      >
        {heroPosters.length > 0 ? (
          <div className="relative w-full h-full flex items-center justify-end pr-2 sm:pr-4 pt-1 opacity-90">
            {heroPosters.slice(0, 3).map((m, idx) => {
              const offsets = [
                'right-16 sm:right-24 bottom-3 sm:bottom-4 -rotate-6 opacity-75 scale-90 group-hover:-translate-x-2.5 group-hover:-rotate-12 group-hover:scale-95',
                'right-8 sm:right-12 bottom-4 sm:bottom-5 rotate-2 opacity-90 scale-95 z-[1] group-hover:-translate-y-2 group-hover:scale-100',
                'right-1 sm:right-2 bottom-3 sm:bottom-4 rotate-6 opacity-100 z-[2] group-hover:translate-x-2 group-hover:rotate-12 group-hover:scale-105',
              ];
              return (
                <div
                  key={m.id || idx}
                  className={`absolute w-[68px] h-[98px] sm:w-[88px] sm:h-[126px] rounded-xl overflow-hidden border border-white/15 bg-[#0D0D12] shadow-[0_14px_30px_rgba(0,0,0,0.75)] transition-transform duration-300 ${
                    offsets[idx] || offsets[0]
                  }`}
                >
                  <img
                    src={m.poster}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
              );
            })}
          </div>
        ) : null}
        <div className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-[#0D0D12] via-[#0D0D12]/65 to-transparent" />
      </div>

      <div className="relative z-10 flex items-center gap-2 text-xs font-medium text-zinc-400">
        <span className="w-8 h-8 rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-[#A78BFA] shrink-0">
          <RiffanMoviesIcon size={16} animate="hover" />
        </span>
        {lastUsedWorld === 'cine' ? (
          <span className="text-[#A78BFA] font-semibold">
            {pickLang(lang, { es: 'Reciente', ca: 'Recent', en: 'Recent' })}
          </span>
        ) : (
          <span>{pickLang(lang, { es: 'Catálogo 4K', ca: 'Catàleg 4K', en: '4K Catalog' })}</span>
        )}
      </div>

      <div className="relative z-10 max-w-[62%] sm:max-w-[56%] space-y-1 mt-4">
        <h2 className="font-display font-bold text-lg sm:text-2xl text-white tracking-tight leading-tight">
          {pickLang(lang, { es: 'Cine y Series', ca: 'Cine i Sèries', en: 'Movies & Series' })}
        </h2>
        <p className="text-xs sm:text-[13px] text-zinc-400 leading-snug">
          {pickLang(lang, {
            es: 'Películas, series y anime en 4K',
            ca: 'Pel·lícules, sèries i anime en 4K',
            en: 'Movies, series & anime in 4K',
          })}
        </p>
        <div className="pt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-zinc-200 group-hover:text-[#A78BFA] transition-colors">
          <span>{pickLang(lang, { es: 'Explorar', ca: 'Explorar', en: 'Browse' })}</span>
          <RiffanArrowRightIcon size={14} animate="hover" />
        </div>
      </div>
    </motion.button>

    {/* CARD 2: SALA CON AMIGOS */}
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.16, delay: 0.04 }}
      whileTap={{ scale: 0.95 }}
      onPointerEnter={() => onPreloadWorld?.('sala')}
      onTouchStart={() => onPreloadWorld?.('sala')}
      onPointerMove={(e) => onCardPointerMove('sala', e)}
      onClick={(e) => onCardClick('sala', e)}
      className="group relative col-span-1 md:col-span-2 md:order-2 rounded-[24px] p-4 sm:p-5 min-h-[148px] sm:min-h-[188px] bg-[#0D0D12] hover:bg-[#14141C] border border-white/[0.08] hover:border-[#7C3AED]/60 shadow-[0_14px_40px_rgba(0,0,0,0.55)] text-left flex flex-col justify-between overflow-hidden cursor-pointer transition-all duration-200"
    >
      {renderSpotlightOverlay('sala')}

      <div className="relative z-10 flex items-center justify-between gap-2">
        <span className="w-9 h-9 rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-[#A78BFA] shrink-0">
          <RiffanUsersIcon size={17} animate="hover" />
        </span>

        {sessionMode !== 'solo' && (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#10B981] tabular-nums">
            <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
            <span>
              {roomParticipantsCount > 0 ? roomParticipantsCount : 1}{' '}
              {pickLang(lang, { es: 'en sala', ca: 'a la sala', en: 'in room' })}
            </span>
          </span>
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
        <p className="text-xs text-zinc-400 leading-snug">
          {sessionMode === 'solo'
            ? pickLang(lang, {
                es: 'Crea una sala para ver juntos',
                ca: 'Crea una sala per veure junts',
                en: 'Create a room to watch together',
              })
            : pickLang(lang, {
                es: 'Chat, voz y cola compartida',
                ca: 'Xat, veu i cua compartida',
                en: 'Live chat, voice & shared queue',
              })}
        </p>
      </div>
    </motion.button>

    {/* CARD 3: FÚTBOL */}
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.16, delay: 0.08 }}
      whileTap={{ scale: 0.95 }}
      onPointerEnter={() => onPreloadWorld?.('futbol')}
      onTouchStart={() => onPreloadWorld?.('futbol')}
      onPointerMove={(e) => onCardPointerMove('futbol', e)}
      onClick={(e) => onCardClick('futbol', e)}
      className="group relative col-span-1 md:col-span-2 md:order-3 rounded-[24px] p-4 sm:p-5 min-h-[148px] sm:min-h-[168px] bg-[#0D0D12] hover:bg-[#14141C] border border-white/[0.08] hover:border-[#7C3AED]/60 shadow-[0_14px_40px_rgba(0,0,0,0.55)] text-left flex flex-col justify-between overflow-hidden cursor-pointer transition-all duration-200"
    >
      {renderSpotlightOverlay('futbol')}

      <div className="relative z-10 flex items-center justify-between gap-2">
        <span className="w-9 h-9 rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-emerald-400 shrink-0">
          <RiffanFootballIcon size={18} animate="hover" />
        </span>

        {liveMatchesCount > 0 ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#FF6B6B] tabular-nums">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#EF4444] opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#EF4444]" />
            </span>
            <span>
              {pickLang(lang, {
                es: `${liveMatchesCount} en vivo`,
                ca: `${liveMatchesCount} en directe`,
                en: `${liveMatchesCount} live`,
              })}
            </span>
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
        <p className="text-xs text-zinc-400 leading-snug">
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

    {/* CARD 4: TV EN DIRECTO */}
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.16, delay: 0.12 }}
      whileTap={{ scale: 0.95 }}
      onPointerEnter={() => onPreloadWorld?.('tv')}
      onTouchStart={() => onPreloadWorld?.('tv')}
      onPointerMove={(e) => onCardPointerMove('tv', e)}
      onClick={(e) => onCardClick('tv', e)}
      className="group relative col-span-1 md:col-span-2 md:order-4 rounded-[24px] p-4 sm:p-5 min-h-[148px] sm:min-h-[168px] bg-[#0D0D12] hover:bg-[#14141C] border border-white/[0.08] hover:border-[#7C3AED]/60 shadow-[0_14px_40px_rgba(0,0,0,0.55)] text-left flex flex-col justify-between overflow-hidden cursor-pointer transition-all duration-200"
    >
      {renderSpotlightOverlay('tv')}

      <div className="relative z-10 flex items-center justify-between gap-2">
        <span className="w-9 h-9 rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-sky-400 shrink-0">
          <RiffanChannelsIcon size={17} animate="hover" />
        </span>

        {lastUsedWorld === 'tv' ? (
          <span className="text-[11px] font-medium text-[#A78BFA]">
            {pickLang(lang, { es: 'Reciente', ca: 'Recent', en: 'Recent' })}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-red-400">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#EF4444] opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#EF4444]" />
            </span>
            <span>24/7</span>
          </span>
        )}
      </div>

      <div className="relative z-10 min-w-0 space-y-1 pt-4">
        <h2 className="font-display font-bold text-base sm:text-lg text-white tracking-tight leading-snug">
          {pickLang(lang, { es: 'TV en Directo', ca: 'TV en Directe', en: 'Live TV' })}
        </h2>
        <p className="text-xs text-zinc-400 leading-snug">
          {pickLang(lang, {
            es: 'TDT, programación y canales 24/7',
            ca: 'TDT, programació i canals 24/7',
            en: 'DTT, guide & 24/7 channels',
          })}
        </p>
      </div>
    </motion.button>

    {/* CARD 5: JUEGOS */}
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.16, delay: 0.16 }}
      whileTap={{ scale: 0.95 }}
      onPointerEnter={() => onPreloadWorld?.('juegos')}
      onTouchStart={() => onPreloadWorld?.('juegos')}
      onPointerMove={(e) => onCardPointerMove('juegos', e)}
      onClick={(e) => onCardClick('juegos', e)}
      className="group relative col-span-1 md:col-span-2 md:order-5 rounded-[24px] p-4 sm:p-5 min-h-[148px] sm:min-h-[168px] bg-[#0D0D12] hover:bg-[#14141C] border border-white/[0.08] hover:border-[#7C3AED]/60 shadow-[0_14px_40px_rgba(0,0,0,0.55)] text-left flex flex-col justify-between overflow-hidden cursor-pointer transition-all duration-200"
    >
      {renderSpotlightOverlay('juegos')}

      <div className="relative z-10 flex items-center justify-between gap-2">
        <span className="w-9 h-9 rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-fuchsia-300 shrink-0">
          <RiffanDiceIcon size={18} animate="hover" />
        </span>

        {lastUsedWorld === 'juegos' && (
          <span className="text-[11px] font-medium text-[#A78BFA]">
            {pickLang(lang, { es: 'Reciente', ca: 'Recent', en: 'Recent' })}
          </span>
        )}
      </div>

      <div className="relative z-10 min-w-0 space-y-1 pt-4">
        <h2 className="font-display font-bold text-base sm:text-lg text-white tracking-tight leading-snug">
          {pickLang(lang, { es: 'Juegos', ca: 'Jocs', en: 'Games' })}
        </h2>
        <p className="text-xs text-zinc-400 leading-snug">
          {pickLang(lang, {
            es: 'Billar, Parchís, UNO y más',
            ca: 'Billar, Parxís, UNO i més',
            en: 'Pool, Parchís, UNO & more',
          })}
        </p>
      </div>
    </motion.button>

    {/* CARD 6: CLIPBOX · BÓVEDA & MOTORES */}
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.16, delay: 0.2 }}
      whileTap={{ scale: 0.95 }}
      onPointerEnter={() => onPreloadWorld?.('clipbox')}
      onTouchStart={() => onPreloadWorld?.('clipbox')}
      onPointerMove={(e) => onCardPointerMove('clipbox', e)}
      onClick={(e) => onCardClick('clipbox', e)}
      className="group relative col-span-1 md:col-span-3 md:order-6 rounded-[24px] p-4 sm:p-5 min-h-[148px] sm:min-h-[156px] bg-[#0D0D12] hover:bg-[#14141C] border border-white/[0.08] hover:border-[#06B6D4]/60 shadow-[0_14px_40px_rgba(0,0,0,0.55)] text-left flex flex-col justify-between overflow-hidden cursor-pointer transition-all duration-200"
    >
      {renderSpotlightOverlay('clipbox')}

      <div className="relative z-10 flex items-center justify-between gap-2">
        <span className="w-9 h-9 rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-[#06B6D4] shrink-0">
          <Database className="w-4 h-4" />
        </span>

        {lastUsedWorld === 'clipbox' ? (
          <span className="text-[11px] font-medium text-[#06B6D4]">
            {pickLang(lang, { es: 'Reciente', ca: 'Recent', en: 'Recent' })}
          </span>
        ) : (
          <span className="text-[11px] font-medium text-zinc-400 tabular-nums">
            440 hosts
          </span>
        )}
      </div>

      <div className="relative z-10 min-w-0 space-y-1 pt-4">
        <h2 className="font-display font-bold text-base sm:text-lg text-white tracking-tight leading-snug">
          ClipBox
        </h2>
        <p className="text-xs text-zinc-400 leading-snug">
          {pickLang(lang, {
            es: 'Motores de cine/anime, subs y descifrador',
            ca: 'Motors de cinema/anime, subs i desxifrador',
            en: 'Cinema/anime engines, subs & decoder',
          })}
        </p>
      </div>
    </motion.button>

    {/* CARD 7: RBTV+ · DEPORTES, DOH & P2P */}
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.16, delay: 0.24 }}
      whileTap={{ scale: 0.95 }}
      onPointerEnter={() => onPreloadWorld?.('rbtv')}
      onTouchStart={() => onPreloadWorld?.('rbtv')}
      onPointerMove={(e) => onCardPointerMove('rbtv', e)}
      onClick={(e) => onCardClick('rbtv', e)}
      className="group relative col-span-1 md:col-span-3 md:order-7 rounded-[24px] p-4 sm:p-5 min-h-[148px] sm:min-h-[156px] bg-[#0D0D12] hover:bg-[#14141C] border border-white/[0.08] hover:border-[#F59E0B]/60 shadow-[0_14px_40px_rgba(0,0,0,0.55)] text-left flex flex-col justify-between overflow-hidden cursor-pointer transition-all duration-200"
    >
      {renderSpotlightOverlay('rbtv')}

      <div className="relative z-10 flex items-center justify-between gap-2">
        <span className="w-9 h-9 rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-[#F59E0B] shrink-0">
          <Radio className="w-4 h-4" />
        </span>

        {lastUsedWorld === 'rbtv' ? (
          <span className="text-[11px] font-medium text-[#F59E0B]">
            {pickLang(lang, { es: 'Reciente', ca: 'Recent', en: 'Recent' })}
          </span>
        ) : (
          <span className="text-[11px] font-medium text-zinc-400 tabular-nums">
            47 hosts · DoH
          </span>
        )}
      </div>

      <div className="relative z-10 min-w-0 space-y-1 pt-4">
        <h2 className="font-display font-bold text-base sm:text-lg text-white tracking-tight leading-snug">
          RBTV+
        </h2>
        <p className="text-xs text-zinc-400 leading-snug">
          {pickLang(lang, {
            es: 'Cluster deportivo, DoH y arquitectura P2P',
            ca: 'Clúster esportiu, DoH i arquitectura P2P',
            en: 'Sports cluster, DoH & P2P architecture',
          })}
        </p>
      </div>
    </motion.button>

    {/* CARD 8: BELIX TV · MOTOR XTREAM CODES */}
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.16, delay: 0.28 }}
      whileTap={{ scale: 0.95 }}
      onPointerEnter={() => onPreloadWorld?.('belix')}
      onTouchStart={() => onPreloadWorld?.('belix')}
      onPointerMove={(e) => onCardPointerMove('belix', e)}
      onClick={(e) => onCardClick('belix', e)}
      className="group relative col-span-1 md:col-span-3 md:order-8 rounded-[24px] p-4 sm:p-5 min-h-[148px] sm:min-h-[156px] bg-[#0D0D12] hover:bg-[#14141C] border border-white/[0.08] hover:border-[#F43F5E]/60 shadow-[0_14px_40px_rgba(0,0,0,0.55)] text-left flex flex-col justify-between overflow-hidden cursor-pointer transition-all duration-200"
    >
      {renderSpotlightOverlay('belix')}

      <div className="relative z-10 flex items-center justify-between gap-2">
        <span className="w-9 h-9 rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-[#F43F5E] shrink-0">
          <Server className="w-4 h-4" />
        </span>

        {lastUsedWorld === 'belix' ? (
          <span className="text-[11px] font-medium text-[#F43F5E]">
            {pickLang(lang, { es: 'Reciente', ca: 'Recent', en: 'Recent' })}
          </span>
        ) : (
          <span className="text-[11px] font-medium text-zinc-400 tabular-nums">
            15 APIs · 21 hosts
          </span>
        )}
      </div>

      <div className="relative z-10 min-w-0 space-y-1 pt-4">
        <h2 className="font-display font-bold text-base sm:text-lg text-white tracking-tight leading-snug">
          Belix TV
        </h2>
        <p className="text-xs text-zinc-400 leading-snug">
          {pickLang(lang, {
            es: 'Motor Xtream Codes, directos y constructor',
            ca: 'Motor Xtream Codes, directes i constructor',
            en: 'Xtream Codes engine, live TV & builder',
          })}
        </p>
      </div>
    </motion.button>

    {/* CARD 9: ATRESPLAYER · VOD, WIDEVINE DRM & TDT ATRESMEDIA */}
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.16, delay: 0.32 }}
      whileTap={{ scale: 0.95 }}
      onPointerEnter={() => onPreloadWorld?.('atresplayer')}
      onTouchStart={() => onPreloadWorld?.('atresplayer')}
      onPointerMove={(e) => onCardPointerMove('atresplayer', e)}
      onClick={(e) => onCardClick('atresplayer', e)}
      className="group relative col-span-1 md:col-span-3 md:order-9 rounded-[24px] p-4 sm:p-5 min-h-[148px] sm:min-h-[156px] bg-[#0D0D12] hover:bg-[#14141C] border border-white/[0.08] hover:border-[#FF5E1A]/60 shadow-[0_14px_40px_rgba(0,0,0,0.55)] text-left flex flex-col justify-between overflow-hidden cursor-pointer transition-all duration-200"
    >
      {renderSpotlightOverlay('atresplayer')}

      <div className="relative z-10 flex items-center justify-between gap-2">
        <span className="w-9 h-9 rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-[#FF5E1A] shrink-0">
          <Tv className="w-4 h-4" />
        </span>

        {lastUsedWorld === 'atresplayer' ? (
          <span className="text-[11px] font-medium text-[#FF5E1A]">
            {pickLang(lang, { es: 'Reciente', ca: 'Recent', en: 'Recent' })}
          </span>
        ) : (
          <span className="text-[11px] font-medium text-zinc-400 tabular-nums">
            6 directos HD
          </span>
        )}
      </div>

      <div className="relative z-10 min-w-0 space-y-1 pt-4">
        <h2 className="font-display font-bold text-base sm:text-lg text-white tracking-tight leading-snug">
          Atresmedia
        </h2>
        <p className="text-xs text-zinc-400 leading-snug">
          {pickLang(lang, {
            es: 'Antena 3, laSexta, Pasapalabra y programas HD',
            ca: 'Antena 3, laSexta, Pasapalabra i programes HD',
            en: 'Antena 3, laSexta, Pasapalabra & HD shows',
          })}
        </p>
      </div>
    </motion.button>
  </section>
);

