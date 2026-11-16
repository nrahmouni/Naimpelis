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
import { UniversalHomeSearch } from './home/UniversalHomeSearch';
import type { CatalogMovie, SpanishTdtChannel, SportsMatch } from '../types';

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
  movies?: CatalogMovie[];
  series?: CatalogMovie[];
  tdtChannels?: SpanishTdtChannel[];
  liveMatches?: SportsMatch[];
  onPlayMovie?: (movie: CatalogMovie) => void;
  onPlaySeries?: (series: CatalogMovie) => void;
  onPlayChannel?: (channel: SpanishTdtChannel) => void;
  onPlayMatch?: (match: SportsMatch) => void;
  onSelectGame?: (gameId: string) => void;
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

// ----------------------------------------------------------------------------
// Living Card Micro-Animations
// ----------------------------------------------------------------------------

/** CINE: Subtle golden/purple floating dust motes in front of projector */
const CineDustMotes: React.FC = () => {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-40">
      <motion.div
        animate={{
          y: [-2, -26],
          x: [0, 4, -2, 0],
          opacity: [0, 0.8, 0],
        }}
        transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute bottom-4 left-6 w-1.5 h-1.5 rounded-full bg-amber-200 shadow-[0_0_8px_#FDE68A]"
      />
      <motion.div
        animate={{
          y: [-4, -30],
          x: [0, -5, 3, 0],
          opacity: [0, 0.9, 0],
        }}
        transition={{ duration: 4.1, repeat: Infinity, delay: 1.2, ease: 'easeInOut' }}
        className="absolute bottom-6 right-10 w-1 h-1 rounded-full bg-[#BF94FF] shadow-[0_0_6px_#BF94FF]"
      />
      <motion.div
        animate={{
          y: [0, -22],
          x: [0, 6, 0],
          opacity: [0, 0.7, 0],
        }}
        transition={{ duration: 3.6, repeat: Infinity, delay: 2.1, ease: 'easeInOut' }}
        className="absolute bottom-2 left-1/2 w-1.5 h-1.5 rounded-full bg-amber-300 shadow-[0_0_8px_#FDE68A]"
      />
      <motion.div
        animate={{
          opacity: [0.12, 0.28, 0.12],
          scale: [0.98, 1.04, 0.98],
        }}
        transition={{ duration: 3.8, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute -top-12 -right-8 w-44 h-44 rounded-full bg-gradient-to-br from-[#9146FF]/35 to-transparent blur-2xl pointer-events-none"
      />
    </div>
  );
};

/** FÚTBOL: Green radar pulse + soft stadium light sheen sweep */
const FutbolRadarAnimation: React.FC = () => {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* Stadium Light Beam Sheen */}
      <motion.div
        animate={{
          x: ['-100%', '200%'],
          opacity: [0, 0.25, 0],
        }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute inset-0 w-1/2 bg-gradient-to-r from-transparent via-emerald-400/20 to-transparent skew-x-12"
      />
      {/* Subtle Radar Ring Pulse from top-right */}
      <motion.div
        animate={{
          scale: [0.8, 1.8],
          opacity: [0.4, 0],
        }}
        transition={{ duration: 2.6, repeat: Infinity, ease: 'easeOut' }}
        className="absolute -top-6 -right-6 w-28 h-28 rounded-full border border-emerald-400/35"
      />
      <motion.div
        animate={{
          scale: [0.6, 2.2],
          opacity: [0.25, 0],
        }}
        transition={{ duration: 2.6, repeat: Infinity, delay: 0.8, ease: 'easeOut' }}
        className="absolute -top-6 -right-6 w-28 h-28 rounded-full border border-emerald-400/25"
      />
    </div>
  );
};

/** TV EN DIRECTO: Concentric signal wave rings radiating from icon */
const TvSignalAnimation: React.FC = () => {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      <motion.div
        animate={{
          scale: [0.8, 1.9],
          opacity: [0.35, 0],
        }}
        transition={{ duration: 2.8, repeat: Infinity, ease: 'easeOut' }}
        className="absolute top-2 left-2 w-14 h-14 rounded-full border border-sky-400/40"
      />
      <motion.div
        animate={{
          scale: [0.6, 2.4],
          opacity: [0.22, 0],
        }}
        transition={{ duration: 2.8, repeat: Infinity, delay: 0.9, ease: 'easeOut' }}
        className="absolute top-2 left-2 w-14 h-14 rounded-full border border-sky-400/25"
      />
    </div>
  );
};

/** JUEGOS: Floating organic neon sparkles */
const JuegosNeonSparkles: React.FC = () => {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-50">
      <motion.div
        animate={{
          scale: [1, 1.3, 1],
          opacity: [0.3, 0.85, 0.3],
          rotate: [0, 90, 180],
        }}
        transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute top-6 right-8 w-2 h-2 rounded-sm bg-fuchsia-400 shadow-[0_0_10px_#E879F9]"
      />
      <motion.div
        animate={{
          scale: [0.8, 1.4, 0.8],
          opacity: [0.2, 0.9, 0.2],
          rotate: [0, -90, -180],
        }}
        transition={{ duration: 4.2, repeat: Infinity, delay: 1.4, ease: 'easeInOut' }}
        className="absolute bottom-6 right-16 w-1.5 h-1.5 rounded-full bg-cyan-300 shadow-[0_0_8px_#67E8F9]"
      />
      <motion.div
        animate={{
          y: [-2, -14, -2],
          opacity: [0.2, 0.7, 0.2],
        }}
        transition={{ duration: 3.8, repeat: Infinity, delay: 0.6, ease: 'easeInOut' }}
        className="absolute bottom-8 left-12 w-1 h-1 rounded-full bg-purple-300 shadow-[0_0_6px_#D8B4FE]"
      />
    </div>
  );
};

/** CINE: Semi-transparent drifting movie posters montage in card background */
const CinePosterDrift: React.FC<{ movies?: CatalogMovie[] }> = ({ movies = [] }) => {
  const displayMovies = (movies.length > 0 ? movies.slice(0, 8) : []).filter(
    (m) => m.poster || m.backdrop
  );
  if (displayMovies.length === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-18 group-hover:opacity-30 transition-opacity">
      <motion.div
        animate={{ x: [0, -280] }}
        transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
        className="flex items-center gap-2.5 absolute top-1/2 -translate-y-1/2 left-0 will-change-transform"
      >
        {[...displayMovies, ...displayMovies].map((m, idx) => (
          <div
            key={`${m.id}-${idx}`}
            className="w-12 h-18 sm:w-14 sm:h-20 rounded-xl overflow-hidden shrink-0 border border-white/10 bg-black/40 shadow-sm"
          >
            <img
              src={m.poster || m.backdrop}
              alt=""
              className="w-full h-full object-cover grayscale-[25%] contrast-125"
              loading="lazy"
            />
          </div>
        ))}
      </motion.div>
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#141520]/40 to-transparent" />
    </div>
  );
};

/** TV EN DIRECTO: Semi-transparent drifting Spanish TV channel logos montage in background */
const TvChannelDrift: React.FC<{ channels?: SpanishTdtChannel[] }> = ({ channels = [] }) => {
  const displayChannels = (channels.length > 0 ? channels.slice(0, 8) : []).filter(
    (ch) => ch.shortMark || ch.name
  );
  if (displayChannels.length === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-18 group-hover:opacity-32 transition-opacity">
      <motion.div
        animate={{ x: [0, -260] }}
        transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
        className="flex items-center gap-2 absolute top-1/2 -translate-y-1/2 left-0 will-change-transform"
      >
        {[...displayChannels, ...displayChannels].map((ch, idx) => (
          <div
            key={`${ch.id}-${idx}`}
            className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center font-display font-extrabold text-[10px] text-white shrink-0 border border-white/15 shadow-sm"
            style={{
              background: `linear-gradient(135deg, ${ch.brandTone || '#38BDF8'}40 0%, #111827 100%)`,
            }}
          >
            {ch.shortMark || ch.name.slice(0, 3)}
          </div>
        ))}
      </motion.div>
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#0F1E33]/40 to-transparent" />
    </div>
  );
};

/** FÚTBOL: Semi-transparent drifting football crests and live match badges */
const FutbolBadgeDrift: React.FC<{ matches?: SportsMatch[] }> = ({ matches = [] }) => {
  const displayTeams = matches.slice(0, 6).flatMap((m) => [
    {
      name: m.matchMeta?.homeShort || m.matchMeta?.homeTeam?.slice(0, 4) || m.title.split('vs')[0]?.trim().slice(0, 4) || 'LCL',
      logo: m.matchMeta?.homeLogo || '',
    },
    {
      name: m.matchMeta?.awayShort || m.matchMeta?.awayTeam?.slice(0, 4) || m.title.split('vs')[1]?.trim().slice(0, 4) || 'VIS',
      logo: m.matchMeta?.awayLogo || '',
    },
  ]);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-18 group-hover:opacity-30 transition-opacity">
      <motion.div
        animate={{ x: [0, -240] }}
        transition={{ duration: 17, repeat: Infinity, ease: 'linear' }}
        className="flex items-center gap-2.5 absolute top-1/2 -translate-y-1/2 left-0 will-change-transform"
      >
        {(displayTeams.length > 0
          ? [...displayTeams, ...displayTeams]
          : [
              { name: 'RMA', logo: '' },
              { name: 'FCB', logo: '' },
              { name: 'ATM', logo: '' },
              { name: 'LIV', logo: '' },
              { name: 'MCI', logo: '' },
              { name: 'BAY', logo: '' },
              { name: 'PSG', logo: '' },
              { name: 'INT', logo: '' },
            ]
        ).map((t, idx) => (
          <div
            key={`${t.name}-${idx}`}
            className="w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center font-display font-extrabold text-[11px] text-emerald-200 shrink-0 border border-emerald-400/25 bg-emerald-950/60 shadow-sm"
          >
            {t.logo ? (
              <img src={t.logo} alt="" className="w-7 h-7 object-contain" />
            ) : (
              <span>{t.name}</span>
            )}
          </div>
        ))}
      </motion.div>
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#0B231B]/40 to-transparent" />
    </div>
  );
};

/** JUEGOS: Semi-transparent drifting badges for the 4 multiplayer games */
const JuegosCardsDrift: React.FC = () => {
  const games = [
    { title: 'Parchís', badge: '🎲 4P' },
    { title: 'UNO', badge: '🃏 Wild' },
    { title: 'Pool 8-Ball', badge: '🎱 8-Ball' },
    { title: 'Ajedrez', badge: '♟️ 1v1' },
  ];

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-20 group-hover:opacity-35 transition-opacity">
      <motion.div
        animate={{ x: [0, -260] }}
        transition={{ duration: 16, repeat: Infinity, ease: 'linear' }}
        className="flex items-center gap-2.5 absolute top-1/2 -translate-y-1/2 left-0 will-change-transform"
      >
        {[...games, ...games, ...games].map((g, idx) => (
          <div
            key={`${g.title}-${idx}`}
            className="px-2.5 py-1.5 rounded-xl flex items-center gap-1.5 font-bold text-xs text-white shrink-0 border border-white/15 bg-white/[0.06] backdrop-blur-sm shadow-sm"
          >
            <span className="text-sm">{g.badge.split(' ')[0]}</span>
            <span className="text-[11px] tracking-tight">{g.title}</span>
          </div>
        ))}
      </motion.div>
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#251033]/40 to-transparent" />
    </div>
  );
};

/** SALA CON AMIGOS: Animated audio waveform bars next to social icon */
const SalaVoiceWaves: React.FC = () => {
  return (
    <div className="flex items-center gap-0.5">
      {[0.4, 0.8, 1, 0.6].map((multiplier, i) => (
        <motion.span
          key={i}
          animate={{
            height: ['4px', `${12 * multiplier}px`, '4px'],
          }}
          transition={{
            duration: 1.2,
            repeat: Infinity,
            delay: i * 0.18,
            ease: 'easeInOut',
          }}
          className="w-0.5 rounded-full bg-[#00F593]"
        />
      ))}
    </div>
  );
};

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
  movies = [],
  series = [],
  tdtChannels = [],
  liveMatches = [],
  onPlayMovie = () => {},
  onPlaySeries = () => {},
  onPlayChannel = () => {},
  onPlayMatch = () => {},
  onSelectGame = () => {},
}) => {
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(displayName);

  // Radial Spotlight hover coordinates per card
  const [spotlightPos, setSpotlightPos] = useState<Record<string, { x: number; y: number }>>({});

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

  const handleCardPointerMove = (id: string, e: React.PointerEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 100);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 100);
    setSpotlightPos((prev) => ({ ...prev, [id]: { x, y } }));
  };

  const handleCardClick = (worldId: PrimaryWorldId) => {
    triggerHaptic('medium');
    onSelectWorld(worldId);
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
        accentBorder: 'border-[#9146FF]/35 hover:border-[#9146FF]/80',
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
        accentBorder: 'border-emerald-400/30 hover:border-emerald-400/75',
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
        accentBorder: 'border-sky-400/30 hover:border-sky-400/75',
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
        accentBorder: 'border-fuchsia-400/30 hover:border-fuchsia-400/75',
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
        accentBorder: 'border-indigo-400/35 hover:border-indigo-400/80',
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
    <div className="relative w-full overflow-x-hidden">
      {/* ==================================================================== */}
      {/* MAIN HOME VIEW CONTAINER                                             */}
      {/* ==================================================================== */}
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
                className="min-h-12 min-w-12 px-4 rounded-2xl bg-[#9146FF] hover:bg-[#7C2AE8] text-white font-bold flex items-center justify-center cursor-pointer active:scale-95 transition-all shadow-[0_4px_14px_rgba(145,70,255,0.4)]"
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

        {/* 2. UNIVERSAL SMART AI SEARCH (DIRECTLY BELOW GREETING) */}
        <section aria-label={pickLang(lang, { es: 'Buscador inteligente', ca: 'Cercador intel·ligent', en: 'Smart search' })}>
          <UniversalHomeSearch
            lang={lang}
            movies={movies}
            series={series}
            tdtChannels={tdtChannels}
            liveMatches={liveMatches}
            onPlayMovie={onPlayMovie}
            onPlaySeries={onPlaySeries}
            onPlayChannel={onPlayChannel}
            onPlayMatch={onPlayMatch}
            onSelectGame={onSelectGame}
          />
        </section>

        {/* 3. CONDITIONAL CONTINUE WATCHING STRIP (ONLY IF USER HAS HISTORY) */}
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

        {/* 4. LIVING BENTO CARDS (INTERACTIVE GLASSMORPHISM + MICRO-ANIMATIONS + SPOTLIGHT) */}
        <section className="grid grid-cols-2 gap-3 sm:gap-4">
          {orderedWorlds.map((world, index) => {
            const Icon = world.icon;
            const isRecent = lastUsedWorld === world.id && index === 0;
            const isLastOddCard = orderedWorlds.length % 2 === 1 && index === orderedWorlds.length - 1;
            const pos = spotlightPos[world.id] || { x: 50, y: 50 };

            return (
              <motion.button
                key={world.id}
                type="button"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, delay: index * 0.04 }}
                whileTap={{ scale: 0.96 }}
                onPointerEnter={() => onPreloadWorld?.(world.id)}
                onTouchStart={() => onPreloadWorld?.(world.id)}
                onPointerMove={(e) => handleCardPointerMove(world.id, e)}
                onClick={() => handleCardClick(world.id)}
                className={`group relative rounded-3xl p-4 sm:p-5 bg-gradient-to-br ${world.gradient} border ${world.accentBorder} text-left flex flex-col justify-between gap-4 min-h-[144px] sm:min-h-[164px] cursor-pointer transition-all overflow-hidden shadow-[0_10px_28px_rgba(0,0,0,0.45)] backdrop-blur-md ${
                  isLastOddCard ? 'col-span-2' : ''
                }`}
              >
                {/* Dynamic Radial Spotlight on Touch / Hover */}
                <div
                  className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                  style={{
                    background: `radial-gradient(220px circle at ${pos.x}% ${pos.y}%, rgba(255,255,255,0.08), transparent 70%)`,
                  }}
                />

                {/* Ambient Category Thematic Background Drifts */}
                {world.id === 'cine' && <CinePosterDrift movies={movies} />}
                {world.id === 'tv' && <TvChannelDrift channels={tdtChannels} />}
                {world.id === 'futbol' && <FutbolBadgeDrift matches={liveMatches} />}
                {world.id === 'juegos' && <JuegosCardsDrift />}

                {/* Ambient Category Micro-Animations */}
                {world.id === 'cine' && <CineDustMotes />}
                {world.id === 'futbol' && <FutbolRadarAnimation />}
                {world.id === 'tv' && <TvSignalAnimation />}
                {world.id === 'juegos' && <JuegosNeonSparkles />}

                {/* Card Header: Icon + Live Badges */}
                <div className="relative z-10 flex items-start justify-between gap-2">
                  <div
                    className={`w-11 h-11 rounded-2xl border flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105 shadow-sm ${world.iconBg}`}
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

                    {world.id === 'sala' && (
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#00F593]/18 border border-[#00F593]/40 text-[#00F593] text-[11px] font-bold leading-none tabular-nums">
                        <SalaVoiceWaves />
                        <span>{roomParticipantsCount > 0 ? roomParticipantsCount : 1}</span>
                      </div>
                    )}

                    {isRecent && !(world.id === 'futbol' && liveMatchesCount > 0) && (
                      <span className="px-2 py-0.5 rounded-full bg-white/10 text-[10px] font-semibold text-zinc-200">
                        {pickLang(lang, { es: 'Reciente', ca: 'Recent', en: 'Recent' })}
                      </span>
                    )}
                  </div>
                </div>

                {/* Card Title & Description */}
                <div className="relative z-10 min-w-0 space-y-1">
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

        {/* 5. COMPACT SINGLE-LINE "SORPRÉNDEME" AT THE VERY BOTTOM */}
        <section className="pt-1">
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              triggerHaptic('light');
              onOpenSurpriseMe();
            }}
            className="w-full min-h-12 px-4 py-2.5 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] hover:border-[#9146FF]/60 flex items-center justify-between gap-3 text-left cursor-pointer transition-all duration-200 group"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-[#9146FF]/20 text-[#D8B4FE] border border-[#9146FF]/35 flex items-center justify-center shrink-0 group-hover:bg-[#9146FF] group-hover:text-white transition-colors">
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              <span className="font-display font-bold text-xs sm:text-sm text-white truncate">
                {pickLang(lang, {
                  es: 'Sorpréndeme',
                  ca: 'Sorprèn-me',
                  en: 'Surprise me',
                })}
              </span>
              <span className="text-[11px] text-zinc-400 hidden sm:inline truncate">
                — {pickLang(lang, {
                  es: 'Elige algo al instante con IA sin pensar',
                  ca: "Tria alguna cosa a l'instant amb IA",
                  en: 'Instant pick with AI',
                })}
              </span>
            </div>
            <div className="flex items-center gap-1 text-xs font-semibold text-[#BF94FF] group-hover:text-white transition-colors shrink-0">
              <span className="hidden xs:inline">{pickLang(lang, { es: 'Elegir', ca: 'Triar', en: 'Pick' })}</span>
              <ChevronRight className="w-4 h-4" />
            </div>
          </motion.button>
        </section>
      </div>
    </div>
  );
};
