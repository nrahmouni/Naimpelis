import React, { useState } from 'react';
import { Bot, Check, ChevronRight, Play, Share2, Users } from 'lucide-react';
import type { AppLanguage, Participant } from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import { RiffanGamesIcon } from '../ui/RiffanIcons';
import { GameLogoArtwork, type UnifiedGameId } from './GameLogos';

export type GameCategoryFilter = 'all' | 'arcade' | 'party' | 'board';

export interface GameCatalogEntry {
  id: UnifiedGameId;
  category: Exclude<GameCategoryFilter, 'all'>;
  title: string;
  meta: string;
  playersHint: string;
  accentBorder: string;
  backdropClass: string;
}

interface GamesHubLobbyProps {
  lang: AppLanguage;
  roomId?: string;
  participants: Participant[];
  hubMode: 'online' | 'offline';
  onChangeHubMode: (mode: 'online' | 'offline') => void;
  isLiveGame: (gameId: UnifiedGameId) => boolean;
  onOpenGame: (gameId: UnifiedGameId) => void;
  onInviteGame: (gameId: UnifiedGameId) => Promise<void>;
  inviteCopied: boolean;
}

export const GamesHubLobby: React.FC<GamesHubLobbyProps> = ({
  lang,
  roomId,
  participants,
  hubMode,
  onChangeHubMode,
  isLiveGame,
  onOpenGame,
  onInviteGame,
  inviteCopied,
}) => {
  const [activeCategory, setActiveCategory] = useState<GameCategoryFilter>('all');

  const gameCatalog: GameCatalogEntry[] = [
    {
      id: 'racing3d',
      category: 'arcade',
      title: pickLang(lang, { es: 'Nitro GP 3D', ca: 'Nitro GP 3D', en: 'Nitro GP 3D' }),
      meta: pickLang(lang, {
        es: '3D WebGL · Giroscopio móvil TV',
        ca: '3D WebGL · Giroscopi mòbil TV',
        en: '3D WebGL · Phone gyro sync',
      }),
      playersHint: '3D',
      accentBorder: 'hover:border-cyan-400/70',
      backdropClass: 'from-[#160D38] via-[#0E1B3A] to-[#0B0D14]',
    },
    {
      id: 'gyrohockey',
      category: 'arcade',
      title: pickLang(lang, { es: 'Neon Air Hockey Gyro', ca: 'Neon Air Hockey Gyro', en: 'Neon Air Hockey Gyro' }),
      meta: pickLang(lang, {
        es: 'Air Hockey · Giroscopio móvil QR',
        ca: 'Air Hockey · Giroscopi mòbil QR',
        en: 'Air Hockey · Phone gyro QR',
      }),
      playersHint: 'GYRO',
      accentBorder: 'hover:border-cyan-400/75',
      backdropClass: 'from-[#082442] via-[#1B0D3A] to-[#0B0D14]',
    },
    {
      id: 'gyrospace',
      category: 'arcade',
      title: pickLang(lang, { es: 'Galaxia Interceptor Gyro', ca: 'Galàxia Interceptor Gyro', en: 'Galaxy Interceptor Gyro' }),
      meta: pickLang(lang, {
        es: 'Nave espacial · Giroscopio móvil',
        ca: 'Nau espacial · Giroscopi mòbil',
        en: 'Starfighter · Phone gyro tilt',
      }),
      playersHint: 'GYRO',
      accentBorder: 'hover:border-purple-400/75',
      backdropClass: 'from-[#2A114F] via-[#121636] to-[#0B0D14]',
    },
    {
      id: 'penalty',
      category: 'arcade',
      title: pickLang(lang, { es: 'Penaltis Mundial', ca: 'Penals Mundial', en: 'World Penalty' }),
      meta: pickLang(lang, {
        es: 'Fútbol TV · Tanda 5 tiros',
        ca: 'Futbol TV · Tanda 5 xuts',
        en: 'TV Shootout · 5 kicks',
      }),
      playersHint: '1vIA',
      accentBorder: 'hover:border-emerald-400/70',
      backdropClass: 'from-[#0D2B24] via-[#10263A] to-[#0B0D14]',
    },
    {
      id: 'headsoccer',
      category: 'arcade',
      title: pickLang(lang, { es: 'Fútbol Cabezones', ca: 'Futbol Capgrossos', en: 'Head Soccer' }),
      meta: pickLang(lang, { es: 'Estadio 1v1 · 60s · IA', ca: 'Estadi 1v1 · 60s · IA', en: '1v1 Stadium · 60s · AI' }),
      playersHint: '1v1',
      accentBorder: 'hover:border-sky-400/65',
      backdropClass: 'from-[#0D1E3A] via-[#10263A] to-[#0B0D14]',
    },
    {
      id: 'pool',
      category: 'arcade',
      title: pickLang(lang, { es: 'Billar Bola 8', ca: 'Billar Bola 8', en: '8-Ball Pool' }),
      meta: pickLang(lang, { es: '1v1 · Física pro · IA', ca: '1v1 · Física pro · IA', en: '1v1 · Pro physics · AI' }),
      playersHint: '1v1',
      accentBorder: 'hover:border-emerald-400/60',
      backdropClass: 'from-[#0B3B2E] via-[#082920] to-[#0B0D14]',
    },
    {
      id: 'poker',
      category: 'party',
      title: pickLang(lang, { es: 'Póker Hold’em', ca: 'Pòquer Hold’em', en: 'Texas Hold’em' }),
      meta: pickLang(lang, { es: 'No-Limit · 2–6 jug. · Bots', ca: 'No-Limit · 2–6 jug. · Bots', en: 'No-Limit · 2–6 pl. · Bots' }),
      playersHint: '2–6',
      accentBorder: 'hover:border-[#8B5CF6]/70',
      backdropClass: 'from-[#2A1348] via-[#190B2E] to-[#0B0D14]',
    },
    {
      id: 'blackjack',
      category: 'party',
      title: 'Blackjack 21',
      meta: pickLang(lang, { es: 'Casino vs Crupier · 3:2', ca: 'Casino vs Crupier · 3:2', en: 'Casino vs Dealer · 3:2' }),
      playersHint: '1–4',
      accentBorder: 'hover:border-emerald-400/65',
      backdropClass: 'from-[#0D3829] via-[#08241B] to-[#0B0D14]',
    },
    {
      id: 'chapas',
      category: 'arcade',
      title: pickLang(lang, { es: 'Fútbol Chapas', ca: 'Futbol Xapes', en: 'Soccer Caps' }),
      meta: pickLang(lang, { es: 'Estadio · 1v1 / 2v2 · IA', ca: 'Estadi · 1v1 / 2v2 · IA', en: 'Stadium · 1v1 / 2v2 · AI' }),
      playersHint: '1v1',
      accentBorder: 'hover:border-lime-400/60',
      backdropClass: 'from-[#1B4214] via-[#132E10] to-[#0B0D14]',
    },
    {
      id: 'uno',
      category: 'party',
      title: 'UNO',
      meta: pickLang(lang, { es: '2–4 jugadores · 108 cartas', ca: '2–4 jugadors · 108 cartes', en: '2–4 players · 108 cards' }),
      playersHint: '2–4',
      accentBorder: 'hover:border-rose-400/60',
      backdropClass: 'from-[#2A101B] via-[#1B0D17] to-[#0B0D14]',
    },
    {
      id: 'parchis',
      category: 'party',
      title: pickLang(lang, { es: 'Parchís', ca: 'Parxís', en: 'Parchís' }),
      meta: pickLang(lang, { es: 'Hasta 4 jugadores · Bots', ca: 'Fins a 4 jugadors · Bots', en: 'Up to 4 players · Bots' }),
      playersHint: '2–4',
      accentBorder: 'hover:border-[#8B5CF6]/70',
      backdropClass: 'from-[#1F1638] via-[#141326] to-[#0B0D14]',
    },
    {
      id: 'pinturillo',
      category: 'party',
      title: 'Pinturillo',
      meta: pickLang(lang, { es: 'Dibuja y adivina · 2–6 jug.', ca: 'Dibuixa i endevina · 2–6', en: 'Draw & guess · 2–6 pl.' }),
      playersHint: '2–6',
      accentBorder: 'hover:border-sky-400/60',
      backdropClass: 'from-[#102235] via-[#0F1726] to-[#0B0D14]',
    },
    {
      id: 'chess',
      category: 'board',
      title: pickLang(lang, { es: 'Ajedrez', ca: 'Escacs', en: 'Chess' }),
      meta: pickLang(lang, { es: 'FIDE · 1v1 y contra IA', ca: 'FIDE · 1v1 i contra IA', en: 'FIDE · 1v1 & vs AI' }),
      playersHint: '1v1',
      accentBorder: 'hover:border-amber-300/55',
      backdropClass: 'from-[#221D19] via-[#17161E] to-[#0B0D14]',
    },
    {
      id: 'checkers',
      category: 'board',
      title: pickLang(lang, { es: 'Damas', ca: 'Dames', en: 'Checkers' }),
      meta: pickLang(lang, { es: '8×8 · Captura múltiple · IA', ca: '8×8 · Captura múltiple · IA', en: '8×8 · Multi-jump · AI' }),
      playersHint: '1v1',
      accentBorder: 'hover:border-rose-400/60',
      backdropClass: 'from-[#28131D] via-[#191119] to-[#0B0D14]',
    },
    {
      id: 'connect4',
      category: 'board',
      title: pickLang(lang, { es: 'Conecta 4', ca: 'Connecta 4', en: 'Connect 4' }),
      meta: pickLang(lang, { es: '7×6 · 1v1 y contra IA', ca: '7×6 · 1v1 i contra IA', en: '7×6 · 1v1 & vs AI' }),
      playersHint: '1v1',
      accentBorder: 'hover:border-blue-400/60',
      backdropClass: 'from-[#111D3B] via-[#101528] to-[#0B0D14]',
    },
  ];

  const activeLiveGame = gameCatalog.find((g) => isLiveGame(g.id)) || null;
  const featuredGame = activeLiveGame || gameCatalog[1]; // Spotlight live match or 8-Ball Pool
  const categoryCounts = {
    all: gameCatalog.length,
    arcade: gameCatalog.filter((g) => g.category === 'arcade').length,
    party: gameCatalog.filter((g) => g.category === 'party').length,
    board: gameCatalog.filter((g) => g.category === 'board').length,
  };
  const filteredGames = gameCatalog.filter(
    (g) => activeCategory === 'all' || g.category === activeCategory
  );

  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 pt-2 pb-28 sm:pb-12 space-y-5 touch-pan-y">
      {/* 1. CLEAN HEADER + ONLINE/AI SEGMENTED SWITCH */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0 flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-[#0D0D12] border border-white/[0.08] flex items-center justify-center shrink-0">
            <RiffanGamesIcon size={24} animate="hover" />
          </div>
          <div className="min-w-0">
            <h2 className="font-display font-extrabold text-xl sm:text-2xl text-white tracking-tight leading-tight">
              {pickLang(lang, { es: 'Salón de Juegos', ca: 'Saló de Jocs', en: 'Games Lounge' })}
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5 tabular-nums leading-snug">
              {hubMode === 'online'
                ? pickLang(lang, {
                    es: `Sala en directo · ${participants.length} conectado${participants.length === 1 ? '' : 's'} · 15 juegos`,
                    ca: `Sala en directe · ${participants.length} connectat${participants.length === 1 ? '' : 's'} · 15 jocs`,
                    en: `Live room · ${participants.length} connected · 15 games`,
                  })
                : pickLang(lang, {
                    es: 'Modo entrenamiento offline contra IA · Sin esperas',
                    ca: 'Mode entrenament offline contra IA · Sense esperes',
                    en: 'Offline practice vs AI · Instant play',
                  })}
            </p>
          </div>
        </div>

        <div className="flex items-center p-1 rounded-2xl bg-[#0D0D12] border border-white/[0.08] self-start sm:self-auto shrink-0">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onChangeHubMode('online');
            }}
            className={`min-h-[44px] px-4 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer active:scale-95 transition-all ${
              hubMode === 'online'
                ? 'bg-[#7C3AED] text-white shadow-[0_4px_14px_rgba(124,58,237,0.35)]'
                : 'text-zinc-300 hover:text-white'
            }`}
          >
            <Users className="w-4 h-4 shrink-0" />
            <span>{pickLang(lang, { es: 'Online', ca: 'Online', en: 'Online' })}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onChangeHubMode('offline');
            }}
            className={`min-h-[44px] px-4 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer active:scale-95 transition-all ${
              hubMode === 'offline'
                ? 'bg-[#7C3AED] text-white shadow-[0_4px_14px_rgba(124,58,237,0.35)]'
                : 'text-zinc-300 hover:text-white'
            }`}
          >
            <Bot className="w-4 h-4 shrink-0" />
            <span>{pickLang(lang, { es: 'Contra IA', ca: 'Contra IA', en: 'Vs AI' })}</span>
          </button>
        </div>
      </div>

      {/* 2. CATEGORY FILTER TABS */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
        {(
          [
            { id: 'all', label: pickLang(lang, { es: 'Todos', ca: 'Tots', en: 'All' }) },
            { id: 'arcade', label: pickLang(lang, { es: '1v1 Arcade', ca: '1v1 Arcade', en: '1v1 Arcade' }) },
            { id: 'party', label: pickLang(lang, { es: 'Cartas & Party', ca: 'Cartes & Party', en: 'Cards & Party' }) },
            { id: 'board', label: pickLang(lang, { es: 'Mesa Clásica', ca: 'Taula Clàssica', en: 'Classic Board' }) },
          ] as const
        ).map((tab) => {
          const active = activeCategory === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setActiveCategory(tab.id);
              }}
              className={`min-h-[44px] px-4 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer active:scale-95 transition-all border tabular-nums ${
                active
                  ? 'bg-[#7C3AED] text-white border-[#8B5CF6] shadow-[0_6px_18px_rgba(124,58,237,0.35)]'
                  : 'bg-[#0D0D12] hover:bg-white/[0.08] text-zinc-300 border-white/[0.08]'
              }`}
            >
              {tab.label} ({categoryCounts[tab.id]})
            </button>
          );
        })}
      </div>

      {/* 3. EDITORIAL SPOTLIGHT HERO CARD */}
      {activeCategory === 'all' && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => onOpenGame(featuredGame.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onOpenGame(featuredGame.id);
            }
          }}
          className={`group relative rounded-3xl overflow-hidden bg-gradient-to-br ${featuredGame.backdropClass} border ${
            activeLiveGame ? 'border-[#00F593]/50' : 'border-white/[0.08]'
          } hover:border-[#8B5CF6] p-4 sm:p-6 grid grid-cols-1 sm:grid-cols-[1fr_240px] lg:grid-cols-[1fr_300px] items-stretch gap-4 cursor-pointer active:scale-[0.99] transition-all shadow-[0_18px_46px_rgba(0,0,0,0.5)]`}
        >
          <div className="flex flex-col justify-between gap-4 min-w-0">
            <div className="space-y-1.5">
              <p
                className={`text-[11px] font-bold uppercase tracking-wider ${
                  activeLiveGame ? 'text-[#00F593]' : 'text-[#A78BFA]'
                }`}
              >
                {activeLiveGame
                  ? pickLang(lang, { es: 'Partida activa en sala', ca: 'Partida activa a la sala', en: 'Active match in room' })
                  : pickLang(lang, { es: 'Destacado del salón', ca: 'Destacat del saló', en: 'Lounge spotlight' })}
              </p>

              <h3 className="font-display font-black text-2xl sm:text-3xl text-white tracking-tight leading-tight">
                {featuredGame.title}
              </h3>

              <p className="text-xs sm:text-sm text-zinc-300">{featuredGame.meta}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <span className="min-h-[44px] px-5 rounded-xl bg-[#7C3AED] group-hover:bg-[#8B5CF6] text-white text-xs sm:text-sm font-bold inline-flex items-center gap-2 whitespace-nowrap shrink-0 shadow-[0_8px_22px_rgba(124,58,237,0.4)] transition-colors">
                <Play className="w-4 h-4 fill-current shrink-0" />
                <span>
                  {activeLiveGame
                    ? pickLang(lang, { es: 'Entrar a la mesa', ca: 'Entrar a la taula', en: 'Join table' })
                    : pickLang(lang, { es: 'Jugar ahora', ca: 'Jugar ara', en: 'Play now' })}
                </span>
              </span>

              {roomId && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void onInviteGame(featuredGame.id);
                  }}
                  className="min-h-[44px] px-4 rounded-xl bg-black/45 hover:bg-black/65 border border-white/15 text-xs font-semibold text-zinc-100 inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {inviteCopied ? (
                    <Check className="w-4 h-4 text-[#00F593] shrink-0" />
                  ) : (
                    <Share2 className="w-4 h-4 shrink-0" />
                  )}
                  <span>
                    {inviteCopied
                      ? pickLang(lang, { es: 'Copiado', ca: 'Copiat', en: 'Copied' })
                      : pickLang(lang, { es: 'Invitar', ca: 'Convidar', en: 'Invite' })}
                  </span>
                </button>
              )}
            </div>
          </div>

          <div className="w-full h-36 sm:h-40 rounded-2xl bg-black/40 border border-white/[0.1] overflow-hidden shrink-0">
            <GameLogoArtwork
              gameId={featuredGame.id}
              className="w-full h-full group-hover:scale-[1.03] transition-transform duration-300"
            />
          </div>
        </div>
      )}

      {/* 4. RESPONSIVE BESPOKE SVG GAME CARDS GRID */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
        {filteredGames.map((game) => {
          const live = isLiveGame(game.id);
          return (
            <button
              key={game.id}
              type="button"
              onClick={() => onOpenGame(game.id)}
              className={`group rounded-2xl sm:rounded-3xl bg-[#0D0D12] border border-white/[0.08] ${game.accentBorder} overflow-hidden text-left flex flex-col cursor-pointer active:scale-95 transition-all shadow-[0_12px_28px_rgba(0,0,0,0.42)] hover:shadow-[0_16px_34px_rgba(124,58,237,0.22)]`}
            >
              <div
                className={`relative w-full aspect-[16/10] bg-gradient-to-br ${game.backdropClass} border-b border-white/[0.06] overflow-hidden`}
              >
                <GameLogoArtwork
                  gameId={game.id}
                  className="w-full h-full group-hover:scale-[1.04] transition-transform duration-300"
                />
                {live && (
                  <span className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md bg-[#00F593] text-zinc-950 text-[10px] font-black uppercase tracking-wider shadow-md">
                    {pickLang(lang, { es: 'En sala', ca: 'En sala', en: 'Live' })}
                  </span>
                )}
              </div>

              <div className="p-4 flex-1 flex flex-col justify-between gap-1.5 w-full min-w-0">
                <div className="flex items-start justify-between gap-2 min-w-0">
                  <h3 className="font-display font-bold text-sm sm:text-base text-white tracking-tight leading-snug break-words group-hover:text-[#A78BFA] transition-colors">
                    {game.title}
                  </h3>
                  <ChevronRight className="w-4 h-4 text-zinc-400 group-hover:text-white group-hover:translate-x-0.5 transition-all shrink-0 mt-0.5" />
                </div>

                <p className="text-[11px] sm:text-xs text-zinc-400 leading-snug break-words tabular-nums">
                  {game.meta}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
