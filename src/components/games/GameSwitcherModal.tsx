import React from 'react';
import { Shuffle, X } from 'lucide-react';
import type { AppLanguage } from '../../types';
import type { UnifiedGameId } from './GameLogos';
import { pickLang } from '../../utils/i18n';

export const GAME_SIGNATURES: Record<UnifiedGameId, { color: string; label: string }> = {
  parchis: { color: '#F59E0B', label: 'Parchís' },
  uno: { color: '#E11D48', label: 'UNO' },
  pinturillo: { color: '#EC4899', label: 'Pinturillo' },
  pool: { color: '#10B981', label: 'Billar' },
  chapas: { color: '#84CC16', label: 'Fútbol Chapas' },
  headsoccer: { color: '#38BDF8', label: 'Cabezones' },
  penalty: { color: '#10B981', label: 'Penaltis' },
  racing3d: { color: '#22D3EE', label: 'Nitro GP 3D' },
  pingpong: { color: '#F43F5E', label: 'Ping Pong 2P' },
  soccerpong: { color: '#22C55E', label: 'Fútbol Pong 3D' },
  gyrohockey: { color: '#22D3EE', label: 'Air Hockey' },
  gyrospace: { color: '#A855F7', label: 'Galaxia Gyro' },
  gyrobowling: { color: '#F59E0B', label: 'Bolos 3D' },
  gyrotennis: { color: '#84CC16', label: 'Tenis Slam' },
  gyrolab: { color: '#06B6D4', label: 'Laberinto 3D' },
  bomberman: { color: '#F97316', label: 'Bomberman' },
  pacman: { color: '#FACC15', label: 'Pac-Man' },
  tetris: { color: '#A855F7', label: 'Tetris' },
  hextris: { color: '#EC4899', label: 'Hextris' },
  game2048: { color: '#F59E0B', label: '2048' },
  flappy: { color: '#38BDF8', label: 'Clumsy Bird' },
  hexgl: { color: '#22D3EE', label: 'HexGL 3D' },
  arkanoid: { color: '#3B82F6', label: 'BrickIt' },
  invaders: { color: '#22C55E', label: 'Invaders' },
  tvtrivia: { color: '#8B5CF6', label: 'Quiz TV' },
  poker: { color: '#A855F7', label: 'Póker' },
  blackjack: { color: '#10B981', label: 'Blackjack' },
  chess: { color: '#9146FF', label: 'Ajedrez' },
  checkers: { color: '#F43F5E', label: 'Damas' },
  connect4: { color: '#3B82F6', label: 'Conecta 4' },
};

export function getGamesHubTitleMap(lang: AppLanguage): Record<UnifiedGameId, string> {
  return {
    parchis: pickLang(lang, { es: '🎲 Parchís', ca: '🎲 Parxís', en: '🎲 Parchís' }),
    uno: '🃏 UNO',
    pinturillo: '🎨 Pinturillo',
    pool: pickLang(lang, { es: '🎱 Billar Bola 8', ca: '🎱 Billar Bola 8', en: '🎱 8-Ball Pool' }),
    chapas: pickLang(lang, { es: '⚽ Fútbol Chapas', ca: '⚽ Futbol Xapes', en: '⚽ Soccer Caps' }),
    headsoccer: pickLang(lang, { es: '🥅 Fútbol Cabezones', ca: '🥅 Futbol Capgrossos', en: '🥅 Head Soccer' }),
    penalty: pickLang(lang, { es: '⚽ Penaltis Mundial', ca: '⚽ Penals Mundial', en: '⚽ World Penalty' }),
    racing3d: '🏎️ Nitro GP 3D',
    pingpong: '🏓 Ping Pong 2P',
    soccerpong: '⚽ Fútbol Pong 3D',
    gyrohockey: '🏒 Neon Air Hockey',
    gyrospace: '🚀 Galaxia Gyro',
    gyrobowling: '🎳 Bolos Pro 3D Gyro',
    gyrotennis: '🎾 Tenis Slam Pro 2P',
    gyrolab: '🧿 Laberinto Esfera 3D',
    bomberman: '💣 Bomberman Party',
    pacman: '🟡 Pac-Man Arcade HD',
    tetris: '🧱 Tetris Sprint TV',
    hextris: '⬡ Hextris Neon TV',
    game2048: '🔢 2048 TV Edition',
    flappy: '🐦 Clumsy Bird TV',
    hexgl: '🛸 HexGL Hover 3D',
    arkanoid: '🧱 BrickIt Arkanoid',
    invaders: '👾 Space Invaders',
    tvtrivia: '🧠 Riffan Quiz TV',
    poker: pickLang(lang, { es: '♠️ Póker Hold’em', ca: '♠️ Pòquer Hold’em', en: '♠️ Texas Hold’em' }),
    blackjack: '🃏 Blackjack 21',
    chess: pickLang(lang, { es: '♟️ Ajedrez', ca: '♟️ Escacs', en: '♟️ Chess' }),
    checkers: pickLang(lang, { es: '🔴 Damas', ca: '🔴 Dames', en: '🔴 Checkers' }),
    connect4: pickLang(lang, { es: '🟡 Conecta 4', ca: '🟡 Connecta 4', en: '🟡 Connect 4' }),
  };
}

export function getGameSwitcherOptions(titleMap: Record<UnifiedGameId, string>): Array<{
  id: UnifiedGameId;
  label: string;
  subtitle: string;
  color: string;
}> {
  return [
    { id: 'tetris', label: titleMap.tetris, subtitle: 'Puzzle 10×20', color: GAME_SIGNATURES.tetris.color },
    { id: 'pacman', label: titleMap.pacman, subtitle: 'Laberinto', color: GAME_SIGNATURES.pacman.color },
    { id: 'bomberman', label: titleMap.bomberman, subtitle: 'Arena 4 bots', color: GAME_SIGNATURES.bomberman.color },
    { id: 'tvtrivia', label: titleMap.tvtrivia, subtitle: '1–4 Sofá', color: GAME_SIGNATURES.tvtrivia.color },
    { id: 'hexgl', label: titleMap.hexgl, subtitle: 'Nave 3D', color: GAME_SIGNATURES.hexgl.color },
    { id: 'hextris', label: titleMap.hextris, subtitle: 'Hexágono', color: GAME_SIGNATURES.hextris.color },
    { id: 'game2048', label: titleMap.game2048, subtitle: 'Fusión 4×4', color: GAME_SIGNATURES.game2048.color },
    { id: 'flappy', label: titleMap.flappy, subtitle: '1 Botón', color: GAME_SIGNATURES.flappy.color },
    { id: 'arkanoid', label: titleMap.arkanoid, subtitle: 'Ladrillos', color: GAME_SIGNATURES.arkanoid.color },
    { id: 'invaders', label: titleMap.invaders, subtitle: 'Retro 1978', color: GAME_SIGNATURES.invaders.color },
    { id: 'racing3d', label: titleMap.racing3d, subtitle: '3D + Giroscopio', color: GAME_SIGNATURES.racing3d.color },
    { id: 'pingpong', label: titleMap.pingpong, subtitle: 'Raqueta Móvil 2P', color: GAME_SIGNATURES.pingpong.color },
    { id: 'soccerpong', label: titleMap.soccerpong, subtitle: 'Estadio 3D · 1P/2P', color: GAME_SIGNATURES.soccerpong.color },
    { id: 'gyrohockey', label: titleMap.gyrohockey, subtitle: 'Móvil Giroscopio', color: GAME_SIGNATURES.gyrohockey.color },
    { id: 'gyrospace', label: titleMap.gyrospace, subtitle: 'Nave Giroscopio', color: GAME_SIGNATURES.gyrospace.color },
    { id: 'gyrobowling', label: titleMap.gyrobowling, subtitle: 'Bolos Giroscopio', color: GAME_SIGNATURES.gyrobowling.color },
    { id: 'gyrotennis', label: titleMap.gyrotennis, subtitle: 'Raqueta Wii 2P', color: GAME_SIGNATURES.gyrotennis.color },
    { id: 'gyrolab', label: titleMap.gyrolab, subtitle: 'Tablero Giroscopio', color: GAME_SIGNATURES.gyrolab.color },
    { id: 'penalty', label: titleMap.penalty, subtitle: 'Tanda Penaltis', color: GAME_SIGNATURES.penalty.color },
    { id: 'headsoccer', label: titleMap.headsoccer, subtitle: '1v1 · 60s', color: GAME_SIGNATURES.headsoccer.color },
    { id: 'pool', label: titleMap.pool, subtitle: '1v1 · Bola 8', color: GAME_SIGNATURES.pool.color },
    { id: 'chapas', label: titleMap.chapas, subtitle: '1v1 / 2v2', color: GAME_SIGNATURES.chapas.color },
    { id: 'poker', label: titleMap.poker, subtitle: '2–6 jug.', color: GAME_SIGNATURES.poker.color },
    { id: 'blackjack', label: titleMap.blackjack, subtitle: '21 Casino', color: GAME_SIGNATURES.blackjack.color },
    { id: 'uno', label: titleMap.uno, subtitle: '2–4 jug.', color: GAME_SIGNATURES.uno.color },
    { id: 'parchis', label: titleMap.parchis, subtitle: '2–4 jug.', color: GAME_SIGNATURES.parchis.color },
    { id: 'pinturillo', label: titleMap.pinturillo, subtitle: 'Dibuja', color: GAME_SIGNATURES.pinturillo.color },
    { id: 'chess', label: titleMap.chess, subtitle: '1v1 Tablero', color: GAME_SIGNATURES.chess.color },
    { id: 'checkers', label: titleMap.checkers, subtitle: '1v1 Tablero', color: GAME_SIGNATURES.checkers.color },
    { id: 'connect4', label: titleMap.connect4, subtitle: '1v1 Tablero', color: GAME_SIGNATURES.connect4.color },
  ];
}

interface GameSwitcherModalProps {
  lang: AppLanguage;
  selectedGame: UnifiedGameId;
  activeSeatedPlayers: Array<{ id: string; name: string; avatar: string }>;
  switcherOptions: Array<{
    id: UnifiedGameId;
    label: string;
    subtitle: string;
    color: string;
  }>;
  onClose: () => void;
  onSelectGame: (targetId: UnifiedGameId) => void;
}

export const GameSwitcherModal: React.FC<GameSwitcherModalProps> = ({
  lang,
  selectedGame,
  activeSeatedPlayers,
  switcherOptions,
  onClose,
  onSelectGame,
}) => (
  <div
    role="dialog"
    aria-modal="true"
    aria-label={pickLang(lang, {
      es: 'Cambiar de juego sin salir',
      ca: 'Canviar de joc sense sortir',
      en: 'Switch game without leaving',
    })}
    className="fixed inset-0 z-[195] bg-black/70 backdrop-blur-md flex items-end sm:items-center justify-center p-2.5 sm:p-4 animate-fade-in"
    onClick={onClose}
  >
    <div
      className="w-full max-w-lg rounded-3xl bg-[#10121E]/95 border border-white/[0.14] shadow-[0_24px_60px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col max-h-[84dvh]"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-4 py-3 border-b border-white/[0.08] flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Shuffle className="w-4 h-4 text-[#BF94FF] shrink-0" />
            <h3 className="font-display font-extrabold text-sm sm:text-base text-white truncate">
              {pickLang(lang, {
                es: 'Cambiar de juego',
                ca: 'Canviar de joc',
                en: 'Switch game',
              })}
            </h3>
          </div>
          <p className="text-[11px] text-zinc-400 mt-0.5">
            {pickLang(lang, {
              es: 'Cambia al instante sin salir · Se mantienen los jugadores en mesa',
              ca: 'Canvia a l’instant sense sortir · Es mantenen els jugadors a taula',
              en: 'Switch instantly without exiting · Seated players stay together',
            })}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={pickLang(lang, { es: 'Cerrar', ca: 'Tancar', en: 'Close' })}
          className="w-8 h-8 rounded-xl bg-white/[0.06] hover:bg-white/[0.14] border border-white/[0.1] flex items-center justify-center text-zinc-300 hover:text-white cursor-pointer shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {activeSeatedPlayers.length > 0 && (
        <div className="px-4 py-2 bg-white/[0.03] border-b border-white/[0.06] flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300 whitespace-nowrap shrink-0">
            {pickLang(lang, {
              es: 'En mesa:',
              ca: 'A taula:',
              en: 'Seated:',
            })}
          </span>
          {activeSeatedPlayers.map((p) => (
            <span
              key={p.id}
              className="px-2 py-0.5 rounded-lg bg-white/[0.07] border border-white/[0.1] text-[11px] font-semibold text-zinc-100 inline-flex items-center gap-1 whitespace-nowrap shrink-0"
            >
              <span>{p.avatar}</span>
              <span className="max-w-[96px] truncate">{p.name}</span>
            </span>
          ))}
        </div>
      )}

      <div className="p-3 overflow-y-auto custom-scrollbar grid grid-cols-2 sm:grid-cols-3 gap-2">
        {switcherOptions.map((opt) => {
          const isCurrent = opt.id === selectedGame;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onSelectGame(opt.id)}
              className={`p-2.5 rounded-2xl border text-left flex flex-col gap-1 cursor-pointer active:scale-[0.97] transition-all ${
                isCurrent
                  ? 'bg-[#9146FF]/20 border-[#9146FF] shadow-[0_0_16px_rgba(145,70,255,0.28)]'
                  : 'bg-white/[0.04] hover:bg-white/[0.09] border-white/[0.09] hover:border-white/25'
              }`}
            >
              <div className="flex items-center justify-between gap-1.5">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: opt.color }}
                />
                {isCurrent && (
                  <span className="px-1.5 py-0.5 rounded bg-[#9146FF] text-[9px] font-black uppercase text-white">
                    {pickLang(lang, { es: 'Actual', ca: 'Actual', en: 'Playing' })}
                  </span>
                )}
              </div>
              <span className="text-xs font-extrabold text-white truncate">
                {opt.label}
              </span>
              <span className="text-[10px] text-zinc-400 truncate">
                {opt.subtitle}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  </div>
);
