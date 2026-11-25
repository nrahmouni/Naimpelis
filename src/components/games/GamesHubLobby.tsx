import React, { useEffect, useRef, useState } from 'react';
import { Bot, Check, ChevronRight, Code2, Play, Search, Share2, Users, X } from 'lucide-react';
import type { AppLanguage, Participant } from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import { RiffanGamesIcon } from '../ui/RiffanIcons';
import { GameLogoArtwork, type UnifiedGameId } from './GameLogos';
import { lazyWithRetry } from '../../utils/lazyWithRetry';
import type { OpenRepoGameItem } from './arcade/OpenGamesRepoStage';

const RobotMascot3DBadge = lazyWithRetry(() =>
  import('./arcade/RobotMascot3DBadge').then((m) => ({ default: m.RobotMascot3DBadge }))
);
const RiveInteractiveBadge = lazyWithRetry(() =>
  import('./arcade/RiveInteractiveBadge').then((m) => ({ default: m.RiveInteractiveBadge }))
);

export type GameCategoryFilter = 'all' | 'arcade' | 'party' | 'board' | 'openrepo';

export interface GameCatalogEntry {
  id: UnifiedGameId;
  category: Exclude<GameCategoryFilter, 'all' | 'openrepo'>;
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
  onOpenRepoGame?: (game: OpenRepoGameItem) => void;
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
  onOpenRepoGame,
  onInviteGame,
  inviteCopied,
}) => {
  const [activeCategory, setActiveCategory] = useState<GameCategoryFilter>('all');
  const [openRepoGames, setOpenRepoGames] = useState<OpenRepoGameItem[]>([]);
  const [openRepoCategories, setOpenRepoCategories] = useState<
    Array<{ id: string; label: string; emoji: string; color: string }>
  >([]);
  const [openRepoSubCat, setOpenRepoSubCat] = useState<string>('all');
  const [openRepoSearch, setOpenRepoSearch] = useState<string>('');
  const [openRepoLoading, setOpenRepoLoading] = useState<boolean>(false);
  const gridRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setOpenRepoLoading(true);
    fetch('/api/games/open-catalog')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        if (Array.isArray(data.games)) setOpenRepoGames(data.games);
        if (Array.isArray(data.categories)) setOpenRepoCategories(data.categories);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setOpenRepoLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void import('./arcade/arcadeAnimations').then(({ animateStaggerCards }) => {
      if (!cancelled) animateStaggerCards(gridRef.current, '.nc-game-card');
    });
    return () => {
      cancelled = true;
    };
  }, [activeCategory, openRepoSubCat]);

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
      id: 'gyrobowling',
      category: 'arcade',
      title: pickLang(lang, { es: 'Bolos Pro 3D Gyro', ca: 'Bitlles Pro 3D Gyro', en: 'Pro 3D Gyro Bowling' }),
      meta: pickLang(lang, {
        es: 'Bolos 3D · Giroscopio móvil 2P',
        ca: 'Bitlles 3D · Giroscopi mòbil 2P',
        en: '3D Bowling · 2P Phone gyro',
      }),
      playersHint: 'GYRO',
      accentBorder: 'hover:border-amber-400/75',
      backdropClass: 'from-[#3D220A] via-[#1B122E] to-[#0B0D14]',
    },
    {
      id: 'gyrotennis',
      category: 'arcade',
      title: pickLang(lang, { es: 'Tenis Slam Pro 2P', ca: 'Tennis Slam Pro 2P', en: 'Tennis Slam Pro 2P' }),
      meta: pickLang(lang, {
        es: 'Raqueta Wii Gyro · 1P/2P',
        ca: 'Raqueta Wii Gyro · 1P/2P',
        en: 'Wii Gyro Racket · 1P/2P',
      }),
      playersHint: '2P',
      accentBorder: 'hover:border-lime-400/75',
      backdropClass: 'from-[#0D381F] via-[#102138] to-[#0B0D14]',
    },
    {
      id: 'gyrolab',
      category: 'arcade',
      title: pickLang(lang, { es: 'Laberinto Esfera 3D', ca: 'Laberint Esfera 3D', en: 'Sphere Labyrinth 3D' }),
      meta: pickLang(lang, {
        es: 'Inclina tablero · Estrellas · Gyro',
        ca: 'Inclina tauler · Estrelles · Gyro',
        en: 'Tilt board · Stars · Phone gyro',
      }),
      playersHint: 'GYRO',
      accentBorder: 'hover:border-cyan-400/75',
      backdropClass: 'from-[#2C1810] via-[#131D36] to-[#0B0D14]',
    },
    {
      id: 'pingpong',
      category: 'arcade',
      title: pickLang(lang, { es: 'Ping Pong Pro 2P', ca: 'Ping Pong Pro 2P', en: 'Ping Pong Pro 2P' }),
      meta: pickLang(lang, {
        es: 'Raqueta Móvil 2P · Giroscopio',
        ca: 'Raqueta Mòbil 2P · Giroscopi',
        en: '2P Phone Racket · Gyroscope',
      }),
      playersHint: '2P',
      accentBorder: 'hover:border-rose-400/75',
      backdropClass: 'from-[#063829] via-[#0F1B33] to-[#0B0D14]',
    },
    {
      id: 'soccerpong',
      category: 'arcade',
      title: pickLang(lang, { es: 'Fútbol Pong 3D', ca: 'Futbol Pong 3D', en: 'Soccer Pong 3D' }),
      meta: pickLang(lang, {
        es: 'Estadio 3D · 1P / 2P Móvil',
        ca: 'Estadi 3D · 1P / 2P Mòbil',
        en: '3D Pitch · 1P / 2P Mobile',
      }),
      playersHint: '1P/2P',
      accentBorder: 'hover:border-emerald-400/75',
      backdropClass: 'from-[#166534] via-[#1E293B] to-[#0B0D14]',
    },
    {
      id: 'penalty',
      category: 'arcade',
      title: pickLang(lang, { es: 'Penaltis Mundial Pro', ca: 'Penals Mundial Pro', en: 'World Cup Penalties' }),
      meta: pickLang(lang, {
        es: '10 países · Móvil 2P · Rosca 8s',
        ca: '10 països · Mòbil 2P · Rosca 8s',
        en: '10 nations · 2P Mobile · Curve 8s',
      }),
      playersHint: '1P/2P',
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
    {
      id: 'tetris',
      category: 'arcade',
      title: 'Tetris Sprint TV',
      meta: pickLang(lang, { es: 'Puzzle 10×20 · 7-bag · Caída', ca: 'Puzzle 10×20 · 7-bag · Caiguda', en: '10×20 Puzzle · 7-bag · Drop' }),
      playersHint: '1P',
      accentBorder: 'hover:border-purple-400/70',
      backdropClass: 'from-[#221048] via-[#121636] to-[#0B0D14]',
    },
    {
      id: 'pacman',
      category: 'arcade',
      title: 'Pac-Man Arcade HD',
      meta: pickLang(lang, { es: 'Laberinto · Fantasmas · Giroscopio', ca: 'Laberint · Fantasmes · Giroscopi', en: 'Maze · Ghosts · Phone gyro' }),
      playersHint: 'GYRO',
      accentBorder: 'hover:border-yellow-400/70',
      backdropClass: 'from-[#261D07] via-[#13182E] to-[#0B0D14]',
    },
    {
      id: 'bomberman',
      category: 'party',
      title: 'Bomberman Party Arena',
      meta: pickLang(lang, { es: 'Bombas · 3 bots IA · Giroscopio', ca: 'Bombes · 3 bots IA · Giroscopi', en: 'Bombs · 3 AI bots · Gyro' }),
      playersHint: 'GYRO',
      accentBorder: 'hover:border-orange-400/70',
      backdropClass: 'from-[#12331E] via-[#27160B] to-[#0B0D14]',
    },
    {
      id: 'tvtrivia',
      category: 'party',
      title: 'Riffan TV Quiz Show',
      meta: pickLang(lang, { es: '1–4 sofá · 5 categorías · 50/50', ca: '1–4 sofà · 5 categories · 50/50', en: '1–4 couch · 5 categories · 50/50' }),
      playersHint: '1–4',
      accentBorder: 'hover:border-violet-400/70',
      backdropClass: 'from-[#2D144F] via-[#15183A] to-[#0B0D14]',
    },
    {
      id: 'hexgl',
      category: 'arcade',
      title: 'HexGL Hover 3D',
      meta: pickLang(lang, { es: 'Nave 3D · Turbo · Giroscopio', ca: 'Nau 3D · Turbo · Giroscopi', en: '3D Hover · Turbo · Phone gyro' }),
      playersHint: 'GYRO',
      accentBorder: 'hover:border-cyan-400/70',
      backdropClass: 'from-[#092940] via-[#141736] to-[#0B0D14]',
    },
    {
      id: 'hextris',
      category: 'arcade',
      title: 'Hextris Neon TV',
      meta: pickLang(lang, { es: 'Hexágono giratorio · Combos 3+', ca: 'Hexàgon giratori · Combos 3+', en: 'Rotating hex · 3+ combos' }),
      playersHint: '1P',
      accentBorder: 'hover:border-pink-400/70',
      backdropClass: 'from-[#2F1035] via-[#161233] to-[#0B0D14]',
    },
    {
      id: 'game2048',
      category: 'arcade',
      title: '2048 TV Edition',
      meta: pickLang(lang, { es: 'Tablero 4×4 · Deshacer · Récord', ca: 'Tauler 4×4 · Desfer · Rècord', en: '4×4 Grid · Undo · Best' }),
      playersHint: '1P',
      accentBorder: 'hover:border-amber-400/70',
      backdropClass: 'from-[#2B1F0E] via-[#13192D] to-[#0B0D14]',
    },
    {
      id: 'flappy',
      category: 'arcade',
      title: 'Clumsy Bird TV',
      meta: pickLang(lang, { es: 'Agita/inclina · Giroscopio móvil', ca: 'Agita/inclina · Giroscopi mòbil', en: 'Shake/tilt · Phone gyro' }),
      playersHint: 'GYRO',
      accentBorder: 'hover:border-sky-400/70',
      backdropClass: 'from-[#0C3B59] via-[#102238] to-[#0B0D14]',
    },
    {
      id: 'arkanoid',
      category: 'arcade',
      title: 'BrickIt Arkanoid',
      meta: pickLang(lang, { es: 'Ladrillos · Láser · Giroscopio', ca: 'Maons · Làser · Giroscopi', en: 'Bricks · Laser · Phone gyro' }),
      playersHint: 'GYRO',
      accentBorder: 'hover:border-blue-400/70',
      backdropClass: 'from-[#10264F] via-[#13152B] to-[#0B0D14]',
    },
    {
      id: 'invaders',
      category: 'arcade',
      title: 'Space Invaders Retro',
      meta: pickLang(lang, { es: 'Oleadas 5×11 · OVNI · Giroscopio', ca: 'Onades 5×11 · OVNI · Giroscopi', en: '5×11 Waves · UFO · Phone gyro' }),
      playersHint: 'GYRO',
      accentBorder: 'hover:border-emerald-400/70',
      backdropClass: 'from-[#0A2B1D] via-[#0E182B] to-[#0B0D14]',
    },
  ];

  const activeLiveGame = gameCatalog.find((g) => isLiveGame(g.id)) || null;
  const featuredGame = activeLiveGame || gameCatalog[1]; // Spotlight live match or 8-Ball Pool
  const categoryCounts = {
    all: gameCatalog.length,
    arcade: gameCatalog.filter((g) => g.category === 'arcade').length,
    party: gameCatalog.filter((g) => g.category === 'party').length,
    board: gameCatalog.filter((g) => g.category === 'board').length,
    openrepo: openRepoGames.length || 142,
  };
  const filteredGames = gameCatalog.filter(
    (g) => activeCategory === 'all' || g.category === activeCategory
  );
  const filteredOpenRepoGames = openRepoGames.filter((g) => {
    const matchCat = openRepoSubCat === 'all' || g.category === openRepoSubCat;
    const q = openRepoSearch.trim().toLowerCase();
    const matchQ =
      !q ||
      g.name.toLowerCase().includes(q) ||
      g.description.toLowerCase().includes(q) ||
      g.tags.some((t) => t.toLowerCase().includes(q));
    return matchCat && matchQ;
  });
  const featuredOpenRepoPicks = ['crossy-road', 'level-devil', 'stack-tower', 'road-fighter', 'alien-battle', 'fighter-jet']
    .map((slug) => openRepoGames.find((g) => g.slug === slug))
    .filter((g): g is OpenRepoGameItem => Boolean(g));

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
                    es: `Sala en directo · ${participants.length} conectado${participants.length === 1 ? '' : 's'} · 29 juegos`,
                    ca: `Sala en directe · ${participants.length} connectat${participants.length === 1 ? '' : 's'} · 29 jocs`,
                    en: `Live room · ${participants.length} connected · 29 games`,
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
            { id: 'openrepo', label: pickLang(lang, { es: 'Repo MIT', ca: 'Repo MIT', en: 'Open Source' }) },
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

          <div className="relative w-full h-36 sm:h-40 rounded-2xl bg-black/40 border border-white/[0.1] overflow-hidden shrink-0">
            <GameLogoArtwork
              gameId={featuredGame.id}
              className="w-full h-full group-hover:scale-[1.03] transition-transform duration-300"
            />
            <React.Suspense fallback={null}>
              <div className="pointer-events-none absolute bottom-1.5 left-1.5 w-12 h-12 opacity-90">
                <RiveInteractiveBadge
                  theme={featuredGame.id === 'racing3d' ? 'vehicles' : 'skills'}
                  className="w-full h-full"
                />
              </div>
              <div className="pointer-events-none absolute -bottom-1 right-1 w-24 h-24">
                <RobotMascot3DBadge clip="Dance" character="robot" className="w-full h-full" />
              </div>
            </React.Suspense>
          </div>
        </div>
      )}

      {activeCategory === 'openrepo' ? (
        <div className="space-y-4">
          <div className="rounded-3xl bg-gradient-to-br from-[#171133] via-[#0D0D12] to-[#0A1324] border border-[#7C3AED]/30 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1 min-w-0">
              <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#A78BFA]">
                <Code2 className="w-3.5 h-3.5" />
                <span>sausi-7/games · MIT Open Source</span>
              </div>
              <h3 className="font-display font-black text-lg sm:text-xl text-white">
                {pickLang(lang, {
                  es: `${openRepoGames.length || 142} Juegos HTML5 & Phaser Listos para Jugar`,
                  ca: `${openRepoGames.length || 142} Jocs HTML5 & Phaser Llestos per Jugar`,
                  en: `${openRepoGames.length || 142} Ready-to-Play HTML5 & Phaser Games`,
                })}
              </h3>
              <p className="text-xs text-zinc-300">
                {pickLang(lang, {
                  es: 'Catálogo open-source integrado al instante en pantalla completa, táctil y teclado, sin anuncios.',
                  ca: 'Catàleg open-source integrat a l’instant en pantalla completa, tàctil i teclat, sense anuncis.',
                  en: 'Instant open-source arcade collection in fullscreen with touch & keyboard, ad-free.',
                })}
              </p>
            </div>

            <div className="relative w-full sm:w-64 shrink-0">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={openRepoSearch}
                onChange={(e) => setOpenRepoSearch(e.target.value)}
                placeholder={pickLang(lang, { es: 'Buscar juego...', ca: 'Cercar joc...', en: 'Search game...' })}
                className="w-full min-h-[44px] pl-10 pr-9 rounded-xl bg-black/50 border border-white/15 focus:border-[#8B5CF6] text-xs sm:text-sm text-white placeholder:text-zinc-500 outline-none"
              />
              {openRepoSearch && (
                <button
                  type="button"
                  onClick={() => setOpenRepoSearch('')}
                  aria-label="Clear"
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
            <button
              type="button"
              onClick={() => setOpenRepoSubCat('all')}
              className={`min-h-[40px] px-3.5 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer border ${
                openRepoSubCat === 'all'
                  ? 'bg-[#7C3AED] text-white border-[#8B5CF6]'
                  : 'bg-[#0D0D12] text-zinc-300 border-white/[0.08] hover:bg-white/[0.06]'
              }`}
            >
              {pickLang(lang, { es: 'Todos', ca: 'Tots', en: 'All' })} ({openRepoGames.length})
            </button>
            {openRepoCategories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setOpenRepoSubCat(c.id)}
                className={`min-h-[40px] px-3.5 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer border inline-flex items-center gap-1.5 ${
                  openRepoSubCat === c.id
                    ? 'bg-[#7C3AED] text-white border-[#8B5CF6]'
                    : 'bg-[#0D0D12] text-zinc-300 border-white/[0.08] hover:bg-white/[0.06]'
                }`}
              >
                <span>{c.emoji}</span>
                <span>{c.label}</span>
              </button>
            ))}
          </div>

          {openRepoLoading && openRepoGames.length === 0 ? (
            <div className="py-12 text-center text-xs text-zinc-400">
              {pickLang(lang, { es: 'Sincronizando repositorio MIT...', ca: 'Sincronitzant repositori MIT...', en: 'Loading MIT repository...' })}
            </div>
          ) : (
            <div ref={gridRef} className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {filteredOpenRepoGames.map((og) => {
                const catMeta = openRepoCategories.find((c) => c.id === og.category);
                return (
                  <button
                    key={og.slug}
                    type="button"
                    onClick={() => {
                      triggerHaptic('medium');
                      onOpenRepoGame?.(og);
                    }}
                    className="nc-game-card group rounded-2xl sm:rounded-3xl bg-[#0D0D12] border border-white/[0.08] hover:border-[#8B5CF6]/70 overflow-hidden text-left flex flex-col cursor-pointer active:scale-95 transition-all p-4 gap-2.5"
                  >
                    <div className="flex items-center justify-between gap-2 w-full">
                      <span
                        className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl shrink-0 border border-white/10"
                        style={{ backgroundColor: `${catMeta?.color || '#7c3aed'}22` }}
                      >
                        {catMeta?.emoji || '🕹️'}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-white/[0.06] border border-white/10 text-[10px] font-bold uppercase text-zinc-300">
                        {og.tech}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="font-display font-bold text-sm sm:text-base text-white group-hover:text-[#A78BFA] truncate">
                        {og.name}
                      </h4>
                      <p className="text-[11px] sm:text-xs text-zinc-400 line-clamp-2 mt-1 leading-snug">
                        {og.description || `${catMeta?.label || og.category} · HTML5`}
                      </p>
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-bold text-[#A78BFA] pt-1 border-t border-white/[0.06] w-full">
                      <span>{pickLang(lang, { es: 'Jugar ya', ca: 'Jugar ara', en: 'Play now' })}</span>
                      <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* 4. RESPONSIVE GAME CARDS GRID */}
          <div ref={gridRef} className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {filteredGames.map((game) => {
              const live = isLiveGame(game.id);
              return (
                <button
                  key={game.id}
                  type="button"
                  onClick={() => onOpenGame(game.id)}
                  className={`nc-game-card group rounded-2xl sm:rounded-3xl bg-[#0D0D12] border border-white/[0.08] ${game.accentBorder} overflow-hidden text-left flex flex-col cursor-pointer active:scale-95 transition-all shadow-[0_12px_28px_rgba(0,0,0,0.42)] hover:shadow-[0_16px_34px_rgba(124,58,237,0.22)]`}
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

          {activeCategory === 'all' && featuredOpenRepoPicks.length > 0 && (
            <div className="pt-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-display font-extrabold text-base sm:text-lg text-white flex items-center gap-2">
                    <Code2 className="w-4 h-4 text-[#A78BFA] shrink-0" />
                    <span className="truncate">
                      {pickLang(lang, {
                        es: `Repositorios Open Source · ${openRepoGames.length || 142} Juegos Listos`,
                        ca: `Repositoris Open Source · ${openRepoGames.length || 142} Jocs Llestos`,
                        en: `Open Source Repositories · ${openRepoGames.length || 142} Ready Games`,
                      })}
                    </span>
                  </h3>
                  <p className="text-xs text-zinc-400">
                    sausi-7/games · MIT License · Phaser / Three.js / HTML5
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setActiveCategory('openrepo');
                  }}
                  className="min-h-[40px] px-3.5 rounded-xl bg-[#7C3AED]/20 hover:bg-[#7C3AED]/35 border border-[#8B5CF6]/40 text-xs font-bold text-[#DDD6FE] whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {pickLang(lang, {
                    es: `Ver todos (${openRepoGames.length || 142})`,
                    ca: `Veure tots (${openRepoGames.length || 142})`,
                    en: `See all (${openRepoGames.length || 142})`,
                  })}
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                {featuredOpenRepoPicks.map((og) => {
                  const catMeta = openRepoCategories.find((c) => c.id === og.category);
                  return (
                    <button
                      key={og.slug}
                      type="button"
                      onClick={() => {
                        triggerHaptic('medium');
                        onOpenRepoGame?.(og);
                      }}
                      className="group rounded-2xl bg-[#0D0D12] border border-white/[0.08] hover:border-[#8B5CF6]/70 p-3 text-left flex flex-col justify-between gap-2 cursor-pointer active:scale-95 transition-all"
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="text-xl">{catMeta?.emoji || '🕹️'}</span>
                        <span className="text-[10px] font-bold uppercase text-zinc-400">{og.tech}</span>
                      </div>
                      <p className="font-display font-bold text-xs text-white group-hover:text-[#A78BFA] truncate">
                        {og.name}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
