import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import {
  Crown,
  Flag,
  Maximize2,
  Minimize2,
  RotateCcw,
  RefreshCw,
  ArrowUpDown,
  Users,
  Sparkles,
  X,
  ArrowLeft,
  Swords,
  Clock,
  Trophy,
  ChevronDown,
  ChevronUp,
  Play,
  Timer,
} from 'lucide-react';
import {
  AppLanguage,
  BoardClockMinutes,
  BoardCoord,
  BoardGameState,
  BoardGameType,
  BoardSide,
  ChessPromotionPiece,
  Participant,
} from '../types';
import {
  findConnect4WinningLine,
  getConnect4DropRow,
  getLegalMovesForSquare,
  getPieceSide,
} from '../shared/boardGames';
import type { GameVoiceChatState } from '../hooks/useGameVoiceChat';
import { GameVoiceBar, VoiceSpeakerIndicator } from './games/GameVoiceBar';
import {
  GameFloatingReactionToast,
  GameMuteButton,
  GameReactionButton,
  VictoryCelebrationOverlay,
  playGameSfx,
  useGameFloatingReaction,
  useGameSoundMute,
} from './games/GameEffects';
import { pickLang } from '../utils/i18n';
import { triggerHaptic } from '../utils/haptics';

interface RoomBoardGamePanelProps {
  gameState: BoardGameState | null;
  currentUser: Participant;
  lang: AppLanguage;
  onStartGame: (gameType: BoardGameType, soloLocal?: boolean, clockMinutes?: BoardClockMinutes) => void;
  onJoinSeat: (side: 'w' | 'b' | 'spectate') => void;
  onStartMatch?: () => void;
  onMove: (from: BoardCoord, to: BoardCoord, promotionPiece?: ChessPromotionPiece) => void;
  onResign: () => void;
  onReset: (opts?: { gameType?: BoardGameType; swapColors?: boolean; clockMinutes?: BoardClockMinutes }) => void;
  onCloseGame: () => void;
  moveError?: string | null;
  onBack?: () => void;
  voiceChat?: GameVoiceChatState;
  isOnlineRoom?: boolean;
  isHost?: boolean;
  fullScreenMode?: boolean;
  hideGameSwitcher?: boolean;
  hideVoiceBar?: boolean;
  mutedOverride?: boolean;
  onToggleMuteOverride?: () => void;
}

const CLOCK_OPTIONS: BoardClockMinutes[] = [0, 3, 5, 10];
const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

function formatClockMs(ms: number): string {
  const safe = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

/**
 * High-contrast Staunton SVG vector pieces with Clásico (Ivory/Ebony) and Neón (Cyber-Glass) themes.
 */
const StauntonChessPiece: React.FC<{
  side: BoardSide;
  kind: string;
  theme?: 'classic' | 'neon';
}> = ({ side, kind, theme = 'classic' }) => {
  const isWhite = side === 'w';
  const uid = `${isWhite ? 'w' : 'b'}-${theme}`;

  let fill = isWhite ? `url(#chess-ivory-${uid})` : `url(#chess-obsidian-${uid})`;
  let stroke = isWhite ? '#292018' : '#E2E8F0';
  let detail = isWhite ? '#5C4D3C' : '#94A3B8';
  let dropShadow = 'drop-shadow-[0_4px_6px_rgba(0,0,0,0.72)]';

  if (theme === 'neon') {
    fill = isWhite ? `url(#chess-neon-cyan-${uid})` : `url(#chess-neon-magenta-${uid})`;
    stroke = isWhite ? '#A5F3FC' : '#FBCFE8';
    detail = isWhite ? '#0891B2' : '#C026D3';
    dropShadow = isWhite
      ? 'drop-shadow-[0_0_8px_rgba(6,182,212,0.85)]'
      : 'drop-shadow-[0_0_8px_rgba(217,70,239,0.85)]';
  }

  return (
    <svg
      viewBox="0 0 45 45"
      className={`w-[84%] h-[84%] select-none pointer-events-none transition-transform duration-150 ${dropShadow}`}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`chess-ivory-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="45%" stopColor="#F5EFE0" />
          <stop offset="100%" stopColor="#D9C9A5" />
        </linearGradient>
        <linearGradient id={`chess-obsidian-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3F4657" />
          <stop offset="50%" stopColor="#1E222D" />
          <stop offset="100%" stopColor="#0A0C10" />
        </linearGradient>
        <linearGradient id={`chess-neon-cyan-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#A5F3FC" />
          <stop offset="48%" stopColor="#06B6D4" />
          <stop offset="100%" stopColor="#083344" />
        </linearGradient>
        <linearGradient id={`chess-neon-magenta-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FBCFE8" />
          <stop offset="48%" stopColor="#D946EF" />
          <stop offset="100%" stopColor="#4A044E" />
        </linearGradient>
      </defs>

      {kind === 'K' && (
        <g strokeLinecap="round" strokeLinejoin="round">
          <path d="M22.5 11.63V6M20 8h5" stroke={stroke} strokeWidth="2.1" fill="none" />
          <path
            d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5"
            fill={fill}
            stroke={stroke}
            strokeWidth="1.6"
          />
          <path
            d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-3.5-7.5-13-10.5-16-4-3 6 5 10 5 10V37z"
            fill={fill}
            stroke={stroke}
            strokeWidth="1.6"
          />
          <path
            d="M11.5 30c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0"
            fill="none"
            stroke={detail}
            strokeWidth="1.25"
          />
        </g>
      )}

      {kind === 'Q' && (
        <g strokeLinecap="round" strokeLinejoin="round">
          <circle cx="6" cy="12" r="2.3" fill={fill} stroke={stroke} strokeWidth="1.4" />
          <circle cx="14" cy="9" r="2.3" fill={fill} stroke={stroke} strokeWidth="1.4" />
          <circle cx="22.5" cy="8" r="2.4" fill={fill} stroke={stroke} strokeWidth="1.4" />
          <circle cx="31" cy="9" r="2.3" fill={fill} stroke={stroke} strokeWidth="1.4" />
          <circle cx="39" cy="12" r="2.3" fill={fill} stroke={stroke} strokeWidth="1.4" />
          <path
            d="M9 26c8.5-1.5 21-1.5 27 0l2.5-12.5L31 25l-.3-14.1-5.2 13.6-3-14.5-3 14.5-5.2-13.6L14 25 6.5 13.5 9 26z"
            fill={fill}
            stroke={stroke}
            strokeWidth="1.55"
          />
          <path
            d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 1.5-1 0-2.5 0 0 .5-1.5-1-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z"
            fill={fill}
            stroke={stroke}
            strokeWidth="1.55"
          />
          <path d="M11.5 30c3.5-1 18.5-1 22 0M12 33.5c6-1 15-1 21 0" fill="none" stroke={detail} strokeWidth="1.25" />
        </g>
      )}

      {kind === 'R' && (
        <g strokeLinecap="round" strokeLinejoin="round">
          <path
            d="M9 39h27v-3H9v3zm3-3v-4h21v4H12zm-1-22V9h4v2h5V9h5v2h5V9h4v5"
            fill={fill}
            stroke={stroke}
            strokeWidth="1.6"
          />
          <path d="M34 14l-3 3H14l-3-3" fill={fill} stroke={stroke} strokeWidth="1.6" />
          <path d="M31 17v12.5H14V17" fill={fill} stroke={stroke} strokeWidth="1.6" />
          <path d="M31 29.5l1.5 2.5h-20l1.5-2.5" fill={fill} stroke={stroke} strokeWidth="1.6" />
          <path d="M11 14h23" fill="none" stroke={detail} strokeWidth="1.3" />
        </g>
      )}

      {kind === 'B' && (
        <g strokeLinecap="round" strokeLinejoin="round">
          <path
            d="M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.354.49-2.323.47-3-.5 1.354-1.94 3-2 3-2z"
            fill={fill}
            stroke={stroke}
            strokeWidth="1.6"
          />
          <path
            d="M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2z"
            fill={fill}
            stroke={stroke}
            strokeWidth="1.6"
          />
          <circle cx="22.5" cy="8" r="2.4" fill={fill} stroke={stroke} strokeWidth="1.5" />
          <path d="M17.5 26h10M15 30h15m-7.5-14.5v5M20 18h5" fill="none" stroke={detail} strokeWidth="1.35" />
        </g>
      )}

      {kind === 'N' && (
        <g strokeLinecap="round" strokeLinejoin="round">
          <path
            d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21"
            fill={fill}
            stroke={stroke}
            strokeWidth="1.6"
          />
          <path
            d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4.003 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3"
            fill={fill}
            stroke={stroke}
            strokeWidth="1.6"
          />
          <circle cx="15" cy="15.5" r="1.2" fill={detail} />
          <path d="M9.5 25.5a0.7 0.9 30 1 1-1.2 1" stroke={detail} strokeWidth="1.2" fill="none" />
        </g>
      )}

      {kind === 'P' && (
        <path
          d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z"
          fill={fill}
          stroke={stroke}
          strokeWidth="1.65"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
};

/**
 * Ridged 3D Checkers Disc with machined circular ridges, specular highlights, and golden King Crown.
 */
const CheckersToken3D: React.FC<{
  isWhite: boolean;
  isKing: boolean;
  animateCrownDrop?: boolean;
}> = ({ isWhite, isKing, animateCrownDrop = false }) => (
  <div
    className={`w-[82%] h-[82%] rounded-full relative flex items-center justify-center transition-transform duration-150 ${
      isWhite
        ? 'bg-gradient-to-b from-[#FFFFFF] via-[#EFE6D4] to-[#C4B390] border border-white shadow-[0_5px_12px_rgba(0,0,0,0.7),inset_0_2px_3px_rgba(255,255,255,0.95),inset_0_-3px_5px_rgba(0,0,0,0.28)]'
        : 'bg-gradient-to-b from-[#FB7185] via-[#E11D48] to-[#7F0E28] border border-rose-300/80 shadow-[0_5px_12px_rgba(0,0,0,0.8),inset_0_2px_3px_rgba(255,255,255,0.45),inset_0_-3px_5px_rgba(50,3,15,0.7)]'
    }`}
  >
    {/* Outer machined ridge */}
    <div
      className={`w-[78%] h-[78%] rounded-full border flex items-center justify-center ${
        isWhite
          ? 'border-[#B2A07E]/75 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]'
          : 'border-rose-950/70 shadow-[inset_0_1px_2px_rgba(0,0,0,0.55)]'
      }`}
    >
      {/* Inner recessed core */}
      <div
        className={`w-[66%] h-[66%] rounded-full border flex items-center justify-center ${
          isWhite
            ? 'border-white/80 bg-gradient-to-t from-[#E2D4B6] to-[#FFFFFF]'
            : 'border-rose-300/40 bg-gradient-to-t from-[#9F1239] to-[#F43F5E]'
        }`}
      >
        {isKing && (
          <div className="relative w-full h-full flex items-center justify-center">
            <Crown
              className={`w-[76%] h-[76%] fill-amber-300 text-amber-500 drop-shadow-[0_2px_6px_rgba(0,0,0,0.65)] ${
                animateCrownDrop ? 'nc-crown-drop' : ''
              }`}
            />
            <span className="absolute top-0.5 right-0.5 text-amber-200 nc-crown-sparkle text-[9px]">
              ✨
            </span>
          </div>
        )}
      </div>
    </div>
  </div>
);

export const RoomBoardGamePanel: React.FC<RoomBoardGamePanelProps> = ({
  gameState,
  currentUser,
  lang,
  onStartGame,
  onJoinSeat,
  onStartMatch,
  onMove,
  onResign,
  onReset,
  onCloseGame,
  moveError,
  onBack,
  voiceChat,
  isOnlineRoom = false,
  isHost = false,
  fullScreenMode = false,
  hideGameSwitcher = false,
  hideVoiceBar = false,
  mutedOverride,
  onToggleMuteOverride,
}) => {
  const [selected, setSelected] = useState<BoardCoord | null>(null);
  const [pendingPromo, setPendingPromo] = useState<{ from: BoardCoord; to: BoardCoord } | null>(null);
  const [manualFlip, setManualFlip] = useState<boolean | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [localMuted, toggleLocalMute] = useGameSoundMute();
  const muted = mutedOverride !== undefined ? mutedOverride : localMuted;
  const toggleMute = onToggleMuteOverride || toggleLocalMute;
  const [selectedClockMin, setSelectedClockMin] = useState<BoardClockMinutes>(0);
  const [hoverCol, setHoverCol] = useState<number | null>(null);
  const [nowTs, setNowTs] = useState<number>(() => Date.now());
  const [showHistory, setShowHistory] = useState(false);
  const [chessTheme, setChessTheme] = useState<'classic' | 'neon'>('classic');
  const prevMoveCountRef = useRef<number>(0);

  // Chess captured piece tally & material differential
  const chessMaterial = useMemo(() => {
    if (!gameState || gameState.gameType !== 'chess') return null;
    const initialCounts: Record<string, number> = { P: 8, N: 2, B: 2, R: 2, Q: 1 };
    const values: Record<string, number> = { P: 1, N: 3, B: 3, R: 5, Q: 9 };
    const currentCounts: { w: Record<string, number>; b: Record<string, number> } = {
      w: { P: 0, N: 0, B: 0, R: 0, Q: 0, K: 0 },
      b: { P: 0, N: 0, B: 0, R: 0, Q: 0, K: 0 },
    };

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p: string | null | undefined = gameState.board[r]?.[c];
        if (p && (p[0] === 'w' || p[0] === 'b')) {
          const s = p[0] as 'w' | 'b';
          const k = p[1];
          if (currentCounts[s][k] !== undefined) {
            currentCounts[s][k]++;
          }
        }
      }
    }

    const capturedFromBlack: { kind: string; count: number }[] = [];
    const capturedFromWhite: { kind: string; count: number }[] = [];
    let scoreDiff = 0; // positive = White is ahead

    (['Q', 'R', 'B', 'N', 'P'] as const).forEach((kind) => {
      const lostW = Math.max(0, (initialCounts[kind] || 0) - (currentCounts.w[kind] || 0));
      const lostB = Math.max(0, (initialCounts[kind] || 0) - (currentCounts.b[kind] || 0));
      if (lostB > 0) capturedFromBlack.push({ kind, count: lostB });
      if (lostW > 0) capturedFromWhite.push({ kind, count: lostW });
      scoreDiff += ((currentCounts.w[kind] || 0) - (currentCounts.b[kind] || 0)) * (values[kind] || 0);
    });

    return { capturedFromBlack, capturedFromWhite, scoreDiff };
  }, [gameState]);

  // Checkers captured piece count
  const checkersCaptured = useMemo(() => {
    if (!gameState || gameState.gameType !== 'checkers') return null;
    let wCount = 0;
    let bCount = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = gameState.board[r]?.[c];
        if (p === 'w' || p === 'W') wCount++;
        if (p === 'b' || p === 'B') bCount++;
      }
    }
    return {
      whiteLost: Math.max(0, 12 - wCount),
      blackLost: Math.max(0, 12 - bCount),
    };
  }, [gameState]);

  const voicePeerMap = useMemo(() => {
    const m = new Map<string, { isMuted: boolean }>();
    if (voiceChat) {
      for (const peer of voiceChat.voicePeers) {
        m.set(peer.userId, { isMuted: peer.isMuted });
      }
    }
    return m;
  }, [voiceChat]);

  useEffect(() => {
    if (!gameState || gameState.status !== 'playing') return;
    setNowTs(Date.now());
    const id = window.setInterval(() => setNowTs(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [gameState?.status, gameState?.turnDeadlineAt, gameState?.updatedAt]);

  useEffect(() => {
    setSelected(null);
    setPendingPromo(null);
  }, [gameState?.updatedAt, gameState?.turn, gameState?.gameType]);

  // Tactile sound effects synced cleanly to board updates
  useEffect(() => {
    if (!gameState) {
      prevMoveCountRef.current = 0;
      return;
    }
    const moveCount = gameState.moveHistory?.length || 0;
    const isFreshMove = moveCount > prevMoveCountRef.current;
    prevMoveCountRef.current = moveCount;

    if (muted) return;
    if (gameState.status === 'finished' && gameState.winner && gameState.winner !== 'draw') {
      playGameSfx('victory', false);
      return;
    }
    if (!isFreshMove) return;
    if (gameState.inCheck) {
      playGameSfx('board_check', false);
      return;
    }
    if (gameState.lastMove?.promoted) {
      playGameSfx('crown_drop', false);
      return;
    }
    if (gameState.gameType === 'connect4' && gameState.lastMove) {
      playGameSfx('board_drop', false);
      return;
    }
    if (gameState.lastMove) {
      playGameSfx(gameState.lastMove.captured ? 'board_capture' : 'board_move', false);
    }
  }, [gameState?.updatedAt, gameState?.status, gameState?.inCheck, muted]);

  useEffect(() => {
    if (!muted && moveError) {
      playGameSfx('error', false);
    }
  }, [moveError, muted]);

  const mySide: BoardSide | 'both' | null = useMemo(() => {
    if (!gameState) return null;
    if (gameState.soloLocal) return 'both';
    const isW = gameState.players.w?.userId === currentUser.id;
    const isB = gameState.players.b?.userId === currentUser.id;
    if (isW && isB) return 'both';
    if (isW) return 'w';
    if (isB) return 'b';
    return null;
  }, [gameState, currentUser.id]);

  const canInteractCurrentTurn = useMemo(() => {
    if (!gameState || gameState.status !== 'playing') return false;
    if (gameState.soloLocal) return true;
    const activeSeat = gameState.players[gameState.turn];
    return Boolean(activeSeat && activeSeat.userId === currentUser.id);
  }, [gameState, currentUser.id]);

  useEffect(() => {
    if (
      gameState?.gameType === 'checkers' &&
      gameState.mustContinueFrom &&
      canInteractCurrentTurn
    ) {
      setSelected(gameState.mustContinueFrom);
    }
  }, [gameState?.mustContinueFrom, gameState?.gameType, canInteractCurrentTurn]);

  const legalMoves = useMemo(() => {
    if (!gameState || !selected || gameState.gameType === 'connect4') return [];
    return getLegalMovesForSquare(gameState, selected);
  }, [gameState, selected]);

  const connect4WinningLine = useMemo(() => {
    if (!gameState || gameState.gameType !== 'connect4' || gameState.status !== 'finished') {
      return null;
    }
    if (gameState.winningLine && gameState.winningLine.length === 4) {
      return gameState.winningLine;
    }
    if (gameState.winner === 'w' || gameState.winner === 'b') {
      return findConnect4WinningLine(gameState.board, gameState.winner);
    }
    return null;
  }, [gameState]);

  const isFlipped = manualFlip !== null ? manualFlip : mySide === 'b';

  const handleSquareClick = useCallback(
    (r: number, c: number) => {
      if (!gameState || gameState.status === 'finished') return;
      if (!canInteractCurrentTurn) {
        triggerHaptic('light');
        return;
      }

      if (gameState.gameType === 'connect4') {
        const dropRow = getConnect4DropRow(gameState.board, c);
        if (dropRow >= 0) {
          triggerHaptic('light');
          onMove({ r: 0, c }, { r: dropRow, c });
        }
        return;
      }

      const targetMove = legalMoves.find((m) => m.r === r && m.c === c);
      if (selected && targetMove) {
        if (gameState.gameType === 'chess' && targetMove.isPromotion) {
          setPendingPromo({ from: selected, to: { r, c } });
          return;
        }
        triggerHaptic('light');
        onMove(selected, { r, c });
        setSelected(null);
        return;
      }

      const piece = gameState.board[r][c];
      const pieceSide = getPieceSide(piece);
      if (piece && pieceSide === gameState.turn) {
        if (
          gameState.gameType === 'checkers' &&
          gameState.mustContinueFrom &&
          (gameState.mustContinueFrom.r !== r || gameState.mustContinueFrom.c !== c)
        ) {
          return;
        }
        const movesForPiece = getLegalMovesForSquare(gameState, { r, c });
        if (movesForPiece.length > 0) {
          triggerHaptic('light');
          setSelected({ r, c });
        } else {
          setSelected(null);
        }
      } else {
        setSelected(null);
      }
    },
    [gameState, canInteractCurrentTurn, legalMoves, selected, onMove]
  );

  // ==========================================================================
  // 1. SIDEBAR FALLBACK LAUNCHER VIEW (NO ACTIVE BOARD YET)
  // ==========================================================================
  if (!gameState) {
    return (
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5 custom-scrollbar">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="min-h-9 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-xs font-semibold text-zinc-200 flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{pickLang(lang, { es: 'Volver', ca: 'Tornar', en: 'Back' })}</span>
          </button>
        )}

        {isOnlineRoom && !hideVoiceBar && voiceChat && <GameVoiceBar lang={lang} voice={voiceChat} />}

        <div className="p-3.5 rounded-2xl nc-specular-surface border border-white/[0.1] space-y-2.5">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#BF94FF]">
            <Swords className="w-4 h-4" />
            <span>
              {pickLang(lang, {
                es: 'Juegos de Tablero 1v1',
                ca: 'Jocs de Tauler 1v1',
                en: '1v1 Board Games',
              })}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold text-zinc-300 flex items-center gap-1 mr-1">
              <Clock className="w-3.5 h-3.5 text-[#BF94FF]" />
            </span>
            {CLOCK_OPTIONS.map((mins) => (
              <button
                key={mins}
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setSelectedClockMin(mins);
                }}
                className={`h-7 px-2.5 rounded-lg text-[11px] font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  selectedClockMin === mins
                    ? 'bg-[#9146FF] text-white'
                    : 'bg-white/[0.06] hover:bg-white/[0.12] text-zinc-300'
                }`}
              >
                {mins === 0
                  ? pickLang(lang, { es: '15s/turno', ca: '15s/torn', en: '15s/turn' })
                  : `${mins} min`}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2.5">
          {([
            { gt: 'chess' as BoardGameType, titleEs: 'Ajedrez', titleEn: 'Chess', icon: '♟️' },
            { gt: 'checkers' as BoardGameType, titleEs: 'Damas', titleEn: 'Checkers', icon: '🔴' },
            { gt: 'connect4' as BoardGameType, titleEs: 'Conecta 4', titleEn: 'Connect 4', icon: '🟡' },
          ]).map((item) => (
            <div
              key={item.gt}
              className="p-3 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-between gap-2"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="text-lg shrink-0">{item.icon}</span>
                <span className="text-sm font-bold text-white truncate">
                  {pickLang(lang, { es: item.titleEs, ca: item.titleEs, en: item.titleEn })}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('medium');
                    onStartGame(item.gt, false, selectedClockMin);
                  }}
                  className="min-h-9 px-3 rounded-xl bg-[#9146FF] hover:bg-[#772CE8] text-xs font-bold text-white flex items-center gap-1.5 whitespace-nowrap cursor-pointer active:scale-95"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Online</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    onStartGame(item.gt, true, selectedClockMin);
                  }}
                  className="min-h-9 px-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-xs font-semibold text-zinc-200 flex items-center gap-1 whitespace-nowrap cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#BF94FF]" />
                  <span>Libre</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ==========================================================================
  // 2. ACTIVE BOARD VIEW
  // ==========================================================================
  const whiteSeat = gameState.players.w;
  const blackSeat = gameState.players.b;
  const displayRows = isFlipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
  const displayCols = isFlipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];

  const getSideClockMs = (side: BoardSide): number | null => {
    if (!gameState.clockMinutes || !gameState.clocksMs) return null;
    const base = gameState.clocksMs[side] ?? 0;
    if (gameState.status === 'playing' && gameState.turn === side && gameState.turnStartedAt) {
      return Math.max(0, base - Math.max(0, nowTs - gameState.turnStartedAt));
    }
    return base;
  };

  const getSideLabel = (side: BoardSide) => {
    if (gameState.gameType === 'connect4') {
      return side === 'w'
        ? pickLang(lang, { es: 'Amarillas', ca: 'Grogues', en: 'Yellow' })
        : pickLang(lang, { es: 'Rojas', ca: 'Roges', en: 'Red' });
    }
    if (side === 'w') return pickLang(lang, { es: 'Blancas', ca: 'Blanques', en: 'White' });
    return gameState.gameType === 'checkers'
      ? pickLang(lang, { es: 'Rojas', ca: 'Roges', en: 'Red' })
      : pickLang(lang, { es: 'Negras', ca: 'Negres', en: 'Black' });
  };

  const turnLabel =
    gameState.status === 'finished'
      ? gameState.winner === 'draw'
        ? pickLang(lang, { es: 'Empate', ca: 'Empat', en: 'Draw' })
        : pickLang(lang, {
            es: `Gana ${
              gameState.winner === 'w'
                ? whiteSeat?.name || getSideLabel('w')
                : blackSeat?.name || getSideLabel('b')
            }`,
            ca: `Guanya ${
              gameState.winner === 'w'
                ? whiteSeat?.name || getSideLabel('w')
                : blackSeat?.name || getSideLabel('b')
            }`,
            en: `${
              gameState.winner === 'w'
                ? whiteSeat?.name || getSideLabel('w')
                : blackSeat?.name || getSideLabel('b')
            } wins`,
          })
      : gameState.soloLocal
      ? `${pickLang(lang, { es: 'Modo Libre', ca: 'Mode Lliure', en: 'Free Play' })} · ${
          gameState.turn === 'w' ? getSideLabel('w') : getSideLabel('b')
        }`
      : gameState.status === 'waiting'
      ? pickLang(lang, {
          es: 'Elige color y pulsa Play',
          ca: 'Tria color i prem Play',
          en: 'Pick side & press Play',
        })
      : canInteractCurrentTurn
      ? pickLang(lang, { es: 'Tu turno', ca: 'El teu torn', en: 'Your turn' })
      : pickLang(lang, {
          es: `Turno: ${
            gameState.turn === 'w'
              ? whiteSeat?.name || getSideLabel('w')
              : blackSeat?.name || getSideLabel('b')
          }`,
          ca: `Torn: ${
            gameState.turn === 'w'
              ? whiteSeat?.name || getSideLabel('w')
              : blackSeat?.name || getSideLabel('b')
          }`,
          en: `Turn: ${
            gameState.turn === 'w'
              ? whiteSeat?.name || getSideLabel('w')
              : blackSeat?.name || getSideLabel('b')
          }`,
        });

  const matchHistory = gameState.matchHistory || [];
  const remainingTurnSec =
    gameState.status === 'playing' && gameState.turnDeadlineAt
      ? Math.max(0, Math.ceil((gameState.turnDeadlineAt - nowTs) / 1000))
      : 15;

  const moveSeqKey = gameState.moveHistory.length;

  const winSubtitle =
    gameState.winReason === 'connect4'
      ? pickLang(lang, { es: '4 en raya', ca: '4 en ratlla', en: '4 in a row!' })
      : gameState.winReason === 'checkmate'
      ? pickLang(lang, { es: 'Jaque mate', ca: 'Escac i mat', en: 'Checkmate' })
      : gameState.winReason === 'stalemate'
      ? pickLang(lang, { es: 'Rey ahogado (Tablas)', ca: 'Rei ofegat', en: 'Stalemate (Draw)' })
      : gameState.winReason === 'threefold_repetition'
      ? pickLang(lang, { es: 'Triple repetición', ca: 'Triple repetició', en: 'Threefold repetition' })
      : gameState.winReason === 'fifty_moves'
      ? pickLang(lang, { es: 'Regla 50 jugadas', ca: 'Regla 50 jugades', en: '50-move draw' })
      : gameState.winReason === 'insufficient_material'
      ? pickLang(lang, { es: 'Material insuficiente', ca: 'Material insuficient', en: 'Insufficient material' })
      : gameState.winReason === 'timeout'
      ? pickLang(lang, { es: 'Tiempo agotado', ca: 'Temps esgotat', en: 'Time out' })
      : gameState.winReason === 'resign'
      ? pickLang(lang, { es: 'Por rendición', ca: 'Per rendició', en: 'By resignation' })
      : gameState.winReason === 'no_moves'
      ? pickLang(lang, { es: 'Sin movimientos', ca: 'Sense moviments', en: 'No legal moves' })
      : gameState.winner === 'draw'
      ? pickLang(lang, { es: 'Empate', ca: 'Empat', en: 'Draw' })
      : pickLang(lang, { es: 'Todas las fichas capturadas', ca: 'Totes capturades', en: 'All captured' });

  const { floatingReaction, sendReaction } = useGameFloatingReaction(!isOnlineRoom);

  const renderBoardContent = (largeMode: boolean) => (
    <div
      className={`relative flex flex-col ${
        fullScreenMode
          ? 'justify-between h-full overflow-hidden gap-2 max-w-[600px] w-full mx-auto'
          : largeMode
          ? 'gap-3 max-w-[540px] w-full mx-auto'
          : 'gap-2 w-full'
      }`}
    >
      {!fullScreenMode && (
        <GameFloatingReactionToast reaction={floatingReaction} className="top-10 right-2" />
      )}
      {/* Compact Utility Bar (No multi-game switcher strip) */}
      {!hideGameSwitcher && (
        <div className="flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-extrabold text-white truncate">
              {gameState.gameType === 'connect4'
                ? pickLang(lang, { es: '🟡 Conecta 4', ca: '🟡 Connecta 4', en: '🟡 Connect 4' })
                : gameState.gameType === 'checkers'
                ? pickLang(lang, { es: '🔴 Damas Españolas', ca: '🔴 Dames Espanyoles', en: '🔴 Checkers' })
                : pickLang(lang, { es: '♟️ Ajedrez FIDE', ca: '♟️ Escacs FIDE', en: '♟️ FIDE Chess' })}
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {gameState.gameType === 'chess' && (
              <button
                type="button"
                onClick={() => setChessTheme((t) => (t === 'classic' ? 'neon' : 'classic'))}
                title={chessTheme === 'classic' ? 'Tema Neón' : 'Tema Clásico'}
                className="h-8 px-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] flex items-center gap-1 text-[11px] font-bold text-zinc-300 cursor-pointer"
              >
                <Sparkles className="w-3 h-3 text-[#BF94FF]" />
                <span className="hidden sm:inline">{chessTheme === 'classic' ? 'Clásico' : 'Neón'}</span>
              </button>
            )}
            {gameState.gameType !== 'connect4' && (
              <button
                type="button"
                onClick={() => setManualFlip((f) => !(f ?? isFlipped))}
                title={pickLang(lang, { es: 'Girar tablero', ca: 'Girar tauler', en: 'Flip board' })}
                className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] flex items-center justify-center text-zinc-300 cursor-pointer"
              >
                <ArrowUpDown className="w-3.5 h-3.5" />
              </button>
            )}
            {!fullScreenMode && (
              <GameReactionButton
                lang={lang}
                compact
                onSelectEmoji={(emoji) => sendReaction(currentUser, emoji)}
              />
            )}
            <GameMuteButton muted={muted} onToggle={toggleMute} lang={lang} />
            {!fullScreenMode && (
              <button
                type="button"
                onClick={() => setIsExpanded((v) => !v)}
                title={largeMode ? 'Reducir' : 'Ampliar'}
                className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] flex items-center justify-center text-[#BF94FF] cursor-pointer"
              >
                {largeMode ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setIsExpanded(false);
                onCloseGame();
              }}
              title={pickLang(lang, { es: 'Cerrar', ca: 'Tancar', en: 'Close' })}
              className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-rose-500/25 border border-white/[0.08] flex items-center justify-center text-zinc-400 hover:text-rose-300 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {isOnlineRoom && !hideVoiceBar && !gameState.soloLocal && voiceChat && (
        <GameVoiceBar lang={lang} voice={voiceChat} compact />
      )}

      {/* Player Seats Row */}
      <div className="grid grid-cols-2 gap-2 shrink-0">
        {(['w', 'b'] as BoardSide[]).map((side) => {
          const seat = gameState.players[side];
          const isTurn = gameState.status === 'playing' && gameState.turn === side;
          const isMe = seat?.userId === currentUser.id;
          const sideLabel = getSideLabel(side);
          const clockMs = getSideClockMs(side);
          const isLowClock = clockMs !== null && clockMs < 30_000;
          const voiceInfo = seat && !seat.isBot ? voicePeerMap.get(seat.userId) : undefined;
          const voiceLevel = seat && !seat.isBot ? voiceChat?.audioLevels?.[seat.userId] ?? 0 : 0;
          const isSpeaking = Boolean(
            seat &&
              !seat.isBot &&
              !voiceInfo?.isMuted &&
              (voiceLevel > 0.06 || voiceChat?.speakingUserIds.includes(seat.userId))
          );
          const canPickSeat = !seat && !gameState.soloLocal && gameState.status === 'waiting';

          return (
            <div
              key={side}
              className={`p-2 rounded-xl border transition-colors flex items-center justify-between gap-1.5 min-w-0 ${
                isSpeaking
                  ? 'ring-2 ring-emerald-400 bg-emerald-500/15 border-emerald-400/60 shadow-[0_0_12px_rgba(16,185,129,0.35)]'
                  : isTurn
                  ? 'bg-[#9146FF]/15 border-[#9146FF]/60 shadow-[0_0_16px_rgba(145,70,255,0.2)]'
                  : 'bg-white/[0.03] border-white/[0.08]'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`w-3.5 h-3.5 rounded-full shrink-0 border ${
                    gameState.gameType === 'connect4'
                      ? side === 'w'
                        ? 'bg-amber-400 border-amber-200'
                        : 'bg-rose-500 border-rose-300'
                      : side === 'w'
                      ? 'bg-[#F8F3E6] border-amber-900/40'
                      : gameState.gameType === 'checkers'
                      ? 'bg-rose-600 border-rose-300'
                      : 'bg-zinc-900 border-zinc-400'
                  }`}
                />
                {seat ? (
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold text-white truncate flex items-center gap-1">
                      <span className="truncate">{seat.name}</span>
                      {isMe && <span className="text-[10px] text-[#BF94FF] shrink-0">· Tú</span>}
                      {!seat.isBot && (
                        <VoiceSpeakerIndicator
                          inVoice={Boolean(voiceInfo)}
                          isSpeaking={isSpeaking}
                          isMuted={Boolean(voiceInfo?.isMuted)}
                          audioLevel={voiceLevel}
                        />
                      )}
                    </div>
                    <div className="text-[10px] text-zinc-400 font-mono tabular-nums whitespace-nowrap flex items-center gap-1.5">
                      <span>{sideLabel} · {seat.score} pts</span>
                      {gameState.gameType === 'chess' && chessMaterial && (
                        <>
                          {side === 'w' && chessMaterial.scoreDiff > 0 && (
                            <span className="px-1 rounded bg-emerald-500/25 text-emerald-300 font-bold text-[9px]">
                              +{chessMaterial.scoreDiff}
                            </span>
                          )}
                          {side === 'b' && chessMaterial.scoreDiff < 0 && (
                            <span className="px-1 rounded bg-emerald-500/25 text-emerald-300 font-bold text-[9px]">
                              +{Math.abs(chessMaterial.scoreDiff)}
                            </span>
                          )}
                        </>
                      )}
                      {gameState.gameType === 'checkers' && checkersCaptured && (
                        <span className="text-[9px] text-zinc-300 opacity-80">
                          {side === 'w' && checkersCaptured.blackLost > 0
                            ? `+${checkersCaptured.blackLost} fichas`
                            : side === 'b' && checkersCaptured.whiteLost > 0
                            ? `+${checkersCaptured.whiteLost} fichas`
                            : ''}
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold text-zinc-200 whitespace-nowrap">
                      {sideLabel}
                    </div>
                    <div className="text-[10px] text-zinc-400 whitespace-nowrap">
                      {pickLang(lang, { es: 'Libre · Bot IA', ca: 'Lliure · Bot IA', en: 'Open · AI Bot' })}
                    </div>
                  </div>
                )}
              </div>

              {clockMs !== null ? (
                <span
                  className={`px-1.5 py-0.5 rounded-md font-mono text-[11px] font-bold tabular-nums shrink-0 ${
                    isLowClock
                      ? 'bg-rose-500/25 text-rose-200 animate-pulse'
                      : isTurn
                      ? 'bg-[#9146FF]/35 text-white'
                      : 'bg-white/[0.06] text-zinc-300'
                  }`}
                >
                  {formatClockMs(clockMs)}
                </span>
              ) : (
                canPickSeat && (
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('medium');
                      onJoinSeat(side);
                    }}
                    className="h-7 px-2.5 rounded-lg bg-[#9146FF] hover:bg-[#772CE8] text-[10px] font-bold text-white whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {pickLang(lang, { es: 'Elegir', ca: 'Triar', en: 'Pick' })}
                  </button>
                )
              )}
            </div>
          );
        })}
      </div>

      {/* Turn / Play Status Bar */}
      <div
        className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center justify-between gap-2 shrink-0 ${
          gameState.status === 'finished'
            ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-200'
            : gameState.inCheck
            ? 'bg-rose-500/20 border-rose-400/50 text-rose-200'
            : canInteractCurrentTurn
            ? 'bg-[#9146FF]/15 border-[#9146FF]/40 text-[#DFCCFF]'
            : 'bg-white/[0.03] border-white/[0.06] text-zinc-300'
        }`}
      >
        <span className="truncate">
          {gameState.inCheck && gameState.status !== 'finished'
            ? `⚠️ ${pickLang(lang, { es: '¡JAQUE!', ca: 'ESCAC!', en: 'CHECK!' })} · ${turnLabel}`
            : gameState.mustContinueFrom
            ? `⚡ ${pickLang(lang, {
                es: 'Captura múltiple obligatoria',
                ca: 'Captura múltiple obligatòria',
                en: 'Multi-jump required',
              })}`
            : turnLabel}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          {gameState.status === 'waiting' && (isHost || gameState.soloLocal) && onStartMatch && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('medium');
                onStartMatch();
              }}
              className="h-7 px-3 rounded-lg bg-gradient-to-r from-[#9146FF] to-emerald-500 text-[11px] font-extrabold text-white flex items-center gap-1 whitespace-nowrap cursor-pointer active:scale-95 shrink-0 shadow-md"
            >
              <Play className="w-3 h-3 fill-current" />
              <span>Play</span>
            </button>
          )}
          {gameState.status === 'playing' && (
            <span
              className={`px-1.5 py-0.5 rounded-md font-mono text-[10px] font-bold tabular-nums flex items-center gap-1 ${
                remainingTurnSec <= 4
                  ? 'bg-rose-500/25 text-rose-200'
                  : 'bg-white/[0.08] text-zinc-200'
              }`}
            >
              <Timer className="w-3 h-3" />
              <span>{remainingTurnSec}s</span>
            </span>
          )}
          {gameState.gameType !== 'connect4' && hideGameSwitcher && (
            <button
              type="button"
              onClick={() => setManualFlip((f) => !(f ?? isFlipped))}
              title={pickLang(lang, { es: 'Girar tablero', ca: 'Girar tauler', en: 'Flip board' })}
              className="w-6 h-6 rounded-md bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-zinc-300 cursor-pointer"
            >
              <ArrowUpDown className="w-3 h-3" />
            </button>
          )}
          {mySide && mySide !== 'both' && !gameState.soloLocal && gameState.status !== 'finished' && (
            <button
              type="button"
              onClick={() => onJoinSeat('spectate')}
              className="text-[10px] text-zinc-400 hover:text-white underline whitespace-nowrap shrink-0 cursor-pointer"
            >
              {pickLang(lang, { es: 'Espectar', ca: 'Mirar', en: 'Spectate' })}
            </button>
          )}
        </div>
      </div>

      {moveError && (
        <div className="px-2.5 py-1.5 rounded-xl bg-rose-500/15 border border-rose-500/35 text-[11px] text-rose-200 shrink-0">
          {moveError}
        </div>
      )}

      {/* Interactive Tabletop Stage: Connect 4 (6x7) OR Checkers/Chess (8x8) */}
      <div className="flex-1 min-h-0 flex items-center justify-center">
        {gameState.gameType === 'connect4' ? (
          <div
            className={`relative mx-auto rounded-2xl p-2 sm:p-2.5 nc-tabletop-slate border border-white/[0.12] select-none touch-manipulation ${
              fullScreenMode ? 'w-[min(90vw,52dvh)] max-w-[440px] aspect-[7/6]' : 'w-full aspect-[7/6]'
            }`}
          >
            {/* 3D Beveled Cobalt Blue Connect-4 Chassis */}
            <div className="relative w-full h-full rounded-xl p-1.5 sm:p-2 bg-gradient-to-b from-[#1D4ED8] via-[#1E40AF] to-[#0F172A] border border-blue-400/35 shadow-[inset_0_2px_4px_rgba(255,255,255,0.35),inset_0_-8px_16px_rgba(7,14,35,0.85),0_12px_32px_rgba(0,0,0,0.7)] overflow-hidden">
              {/* Corner screws */}
              <span className="absolute top-1.5 left-1.5 w-2 h-2 rounded-full bg-slate-300 border border-slate-500 shadow-inner flex items-center justify-center opacity-75 pointer-events-none"><span className="w-1 h-[0.5px] bg-slate-700 rotate-45" /></span>
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-slate-300 border border-slate-500 shadow-inner flex items-center justify-center opacity-75 pointer-events-none"><span className="w-1 h-[0.5px] bg-slate-700 -rotate-45" /></span>
              <span className="absolute bottom-1.5 left-1.5 w-2 h-2 rounded-full bg-slate-300 border border-slate-500 shadow-inner flex items-center justify-center opacity-75 pointer-events-none"><span className="w-1 h-[0.5px] bg-slate-700 -rotate-12" /></span>
              <span className="absolute bottom-1.5 right-1.5 w-2 h-2 rounded-full bg-slate-300 border border-slate-500 shadow-inner flex items-center justify-center opacity-75 pointer-events-none"><span className="w-1 h-[0.5px] bg-slate-700 rotate-90" /></span>

              {/* Diagonal glass reflection streak */}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-white/[0.06] to-transparent z-15" />

              <div className="grid grid-cols-7 grid-rows-6 gap-1.5 w-full h-full relative z-10">
                {Array.from({ length: 6 }).map((_, r) =>
                  Array.from({ length: 7 }).map((__, c) => {
                    const cell = gameState.board[r]?.[c] ?? null;
                    const isLastDrop =
                      gameState.lastMove?.to.r === r && gameState.lastMove?.to.c === c;
                    const nextDropRow = getConnect4DropRow(gameState.board, c);
                    const isPreviewTarget =
                      hoverCol === c && nextDropRow === r && canInteractCurrentTurn && !cell;
                    const isWinDisc = Boolean(
                      connect4WinningLine?.some((wCoord) => wCoord.r === r && wCoord.c === c)
                    );

                    return (
                      <button
                        key={`c4-${r}-${c}`}
                        type="button"
                        onMouseEnter={() => setHoverCol(c)}
                        onMouseLeave={() => setHoverCol((curr) => (curr === c ? null : curr))}
                        onClick={() => handleSquareClick(r, c)}
                        aria-label={`Columna ${c + 1} Fila ${r + 1}`}
                        className="relative w-full h-full rounded-full cursor-pointer flex items-center justify-center bg-[#070B14] border border-blue-950/90 shadow-[inset_0_4px_8px_rgba(0,0,0,0.95),inset_0_-1px_2px_rgba(147,197,253,0.25)] transition-transform active:scale-95"
                      >
                        {cell ? (
                          <div
                            key={isLastDrop ? `drop-${moveSeqKey}` : undefined}
                            style={
                              isLastDrop
                                ? ({ '--drop-rows': r + 1.4 } as React.CSSProperties)
                                : undefined
                            }
                            className={`w-[88%] h-[88%] rounded-full flex items-center justify-center ${
                              isLastDrop ? 'nc-c4-drop' : ''
                            } ${
                              cell === 'w'
                                ? 'bg-gradient-to-b from-[#FEF08A] via-[#FACC15] to-[#B45309] border border-yellow-100 shadow-[0_3px_8px_rgba(0,0,0,0.65),inset_0_2px_3px_rgba(255,255,255,0.9),inset_0_-3px_5px_rgba(113,63,18,0.65)]'
                                : 'bg-gradient-to-b from-[#FDA4AF] via-[#E11D48] to-[#881337] border border-rose-200/90 shadow-[0_3px_8px_rgba(0,0,0,0.7),inset_0_2px_3px_rgba(255,255,255,0.65),inset_0_-3px_5px_rgba(76,5,25,0.75)]'
                            } ${isWinDisc ? 'ring-2 ring-white ring-offset-1 ring-offset-amber-400 brightness-110 shadow-[0_0_16px_rgba(250,204,21,0.9)] animate-pulse' : ''}`}
                          >
                            <div
                              className={`w-[60%] h-[60%] rounded-full border ${
                                cell === 'w' ? 'border-amber-200/70 shadow-inner' : 'border-rose-200/50 shadow-inner'
                              }`}
                            />
                          </div>
                        ) : (
                          isPreviewTarget && (
                            <div
                              className={`w-[82%] h-[82%] rounded-full border-2 border-dashed flex items-center justify-center ${
                                gameState.turn === 'w'
                                  ? 'bg-amber-400/30 border-amber-300/80 text-amber-200'
                                  : 'bg-rose-400/30 border-rose-300/80 text-rose-200'
                              }`}
                            >
                              <ChevronDown className="w-4 h-4 animate-bounce" />
                            </div>
                          )
                        )}
                      </button>
                    );
                  })
                )}
              </div>

              {/* Glowing 4-in-a-Row Victory Beam */}
              {connect4WinningLine && connect4WinningLine.length === 4 && (
                <svg
                  viewBox="0 0 7 6"
                  className="pointer-events-none absolute inset-1.5 sm:inset-2 w-[calc(100%-0.75rem)] sm:w-[calc(100%-1rem)] h-[calc(100%-0.75rem)] sm:h-[calc(100%-1rem)] z-20"
                >
                  <line
                    x1={connect4WinningLine[0].c + 0.5}
                    y1={connect4WinningLine[0].r + 0.5}
                    x2={connect4WinningLine[3].c + 0.5}
                    y2={connect4WinningLine[3].r + 0.5}
                    stroke="#FFFFFF"
                    strokeWidth="0.24"
                    strokeLinecap="round"
                    opacity="0.6"
                  />
                  <line
                    x1={connect4WinningLine[0].c + 0.5}
                    y1={connect4WinningLine[0].r + 0.5}
                    x2={connect4WinningLine[3].c + 0.5}
                    y2={connect4WinningLine[3].r + 0.5}
                    stroke="#FACC15"
                    strokeWidth="0.12"
                    strokeLinecap="round"
                  />
                </svg>
              )}
            </div>

            {/* Chassis pedestal feet */}
            <div className="absolute -bottom-2.5 inset-x-8 flex justify-between pointer-events-none z-0">
              <div className="w-10 h-3 rounded-b-lg bg-[#0F172A] border-b-2 border-x border-blue-400/35 shadow-[0_4px_8px_rgba(0,0,0,0.85)]" />
              <div className="w-10 h-3 rounded-b-lg bg-[#0F172A] border-b-2 border-x border-blue-400/35 shadow-[0_4px_8px_rgba(0,0,0,0.85)]" />
            </div>

            {gameState.status === 'finished' && (
              <VictoryCelebrationOverlay
                lang={lang}
                title={turnLabel}
                subtitle={winSubtitle}
                primaryLabel={pickLang(lang, { es: 'Revancha', ca: 'Revenja', en: 'Rematch' })}
                onPrimaryAction={() => {
                  triggerHaptic('medium');
                  onReset({ swapColors: false });
                }}
                secondaryLabel={pickLang(lang, {
                  es: 'Cambiar turnos',
                  ca: 'Canviar torns',
                  en: 'Swap starter',
                })}
                onSecondaryAction={() => {
                  triggerHaptic('light');
                  onReset({ swapColors: true });
                }}
              />
            )}
          </div>
        ) : (
          <div
            className={`relative mx-auto rounded-2xl p-2 sm:p-2.5 nc-tabletop-slate border border-white/[0.12] select-none touch-manipulation ${
              fullScreenMode ? 'w-[min(88vw,50dvh)] max-w-[430px] aspect-square' : 'w-full aspect-square'
            }`}
          >
            <div className={`grid grid-cols-8 grid-rows-8 w-full h-full rounded-xl overflow-hidden shadow-inner ${
              gameState.gameType === 'checkers'
                ? 'border-2 border-[#180E0A] ring-1 ring-amber-900/30'
                : 'border border-white/15'
            }`}>
              {displayRows.map((r, dispR) =>
                displayCols.map((c, dispC) => {
                  const isDark = (r + c) % 2 === 1;
                  const piece = gameState.board[r][c];
                  const isSelected = selected?.r === r && selected?.c === c;
                  const isLastFrom =
                    gameState.lastMove?.from.r === r && gameState.lastMove?.from.c === c;
                  const isLastTo =
                    gameState.lastMove?.to.r === r && gameState.lastMove?.to.c === c;
                  const legalTarget = legalMoves.find((m) => m.r === r && m.c === c);
                  const isKingInCheck =
                    gameState.gameType === 'chess' &&
                    gameState.inCheck &&
                    piece === `${gameState.inCheck}K`;

                  // Dedicated Board Themes:
                  // 1) Damas: Dark Walnut (#231610) vs Cream Maple (#EDE4D0)
                  // 2) Chess (Classic): Charcoal Slate (#262E3D) vs Polished Slate (#7C869E)
                  // 3) Chess (Neon): Deep Void (#0A101D) vs Cyber Steel (#1B2742)
                  let squareBg = '';
                  if (gameState.gameType === 'checkers') {
                    if (isSelected) {
                      squareBg = 'bg-amber-600/75 shadow-[inset_0_0_10px_rgba(245,158,11,0.9)]';
                    } else if (isLastTo) {
                      squareBg = isDark ? 'bg-[#55301E]' : 'bg-[#D2B997]';
                    } else if (isLastFrom) {
                      squareBg = isDark ? 'bg-[#3D2114]' : 'bg-[#DFCDAF]';
                    } else if (isDark) {
                      squareBg = 'bg-[#231610] shadow-[inset_0_2px_4px_rgba(0,0,0,0.65)]';
                    } else {
                      squareBg = 'bg-[#ECE3CD]';
                    }
                  } else if (chessTheme === 'neon') {
                    if (isKingInCheck) {
                      squareBg = 'bg-rose-700/90 nc-check-aura';
                    } else if (isSelected) {
                      squareBg = 'bg-cyan-500/50 shadow-[inset_0_0_12px_rgba(6,182,212,0.8)]';
                    } else if (isLastTo) {
                      squareBg = isDark ? 'bg-[#163B54]' : 'bg-[#215777]';
                    } else if (isLastFrom) {
                      squareBg = isDark ? 'bg-[#102B3E]' : 'bg-[#1B435C]';
                    } else if (isDark) {
                      squareBg = 'bg-[#090F1C] border border-cyan-950/40';
                    } else {
                      squareBg = 'bg-[#16233B] border border-cyan-800/30';
                    }
                  } else {
                    if (isKingInCheck) {
                      squareBg = 'bg-rose-700/85 nc-check-aura';
                    } else if (isSelected) {
                      squareBg = 'bg-[#9146FF]/65';
                    } else if (isLastTo) {
                      squareBg = isDark ? 'bg-[#4f3b7d]' : 'bg-[#7962aa]';
                    } else if (isLastFrom) {
                      squareBg = isDark ? 'bg-[#3c2f5c]' : 'bg-[#63528a]';
                    } else if (isDark) {
                      squareBg = 'bg-[#28303E]';
                    } else {
                      squareBg = 'bg-[#7C879D]';
                    }
                  }

                  const showRank = c === displayCols[0];
                  const showFile = r === displayRows[7];

                  // Compute glide/jump deltas for the piece that just landed on `isLastTo`
                  let animClass = '';
                  let animStyle: React.CSSProperties | undefined;
                  if (isLastTo && gameState.lastMove) {
                    const fromDispR = displayRows.indexOf(gameState.lastMove.from.r);
                    const fromDispC = displayCols.indexOf(gameState.lastMove.from.c);
                    if (fromDispR >= 0 && fromDispC >= 0) {
                      const dCols = fromDispC - dispC;
                      const dRows = fromDispR - dispR;
                      if (gameState.gameType === 'chess') {
                        animClass = 'nc-chess-glide';
                        animStyle = {
                          '--glide-x': `${dCols * 100}%`,
                          '--glide-y': `${dRows * 100}%`,
                        } as React.CSSProperties;
                      } else if (gameState.gameType === 'checkers') {
                        animClass = gameState.lastMove.captured ? 'nc-checkers-arc' : 'nc-chess-glide';
                        animStyle = gameState.lastMove.captured
                          ? ({
                              '--jump-x': `${dCols * 100}%`,
                              '--jump-y': `${dRows * 100}%`,
                            } as React.CSSProperties)
                          : ({
                              '--glide-x': `${dCols * 100}%`,
                              '--glide-y': `${dRows * 100}%`,
                            } as React.CSSProperties);
                      }
                    }
                  }

                  const renderSquarePiece = () => {
                    if (!piece) return null;
                    if (gameState.gameType === 'checkers') {
                      const isWhite = piece === 'w' || piece === 'W';
                      const isKing = piece === 'W' || piece === 'B';
                      return (
                        <CheckersToken3D
                          isWhite={isWhite}
                          isKing={isKing}
                          animateCrownDrop={Boolean(isLastTo && gameState.lastMove?.promoted)}
                        />
                      );
                    }
                    const side = (piece[0] as BoardSide) || 'w';
                    const kind = piece[1] || 'P';
                    return <StauntonChessPiece side={side} kind={kind} theme={chessTheme} />;
                  };

                  return (
                    <button
                      key={`${r}-${c}`}
                      type="button"
                      onClick={() => handleSquareClick(r, c)}
                      aria-label={`${FILES[c]}${8 - r}`}
                      className={`relative w-full h-full flex items-center justify-center cursor-pointer transition-colors ${squareBg}`}
                    >
                      {showRank && (
                        <span className="absolute top-0.5 left-0.5 text-[8px] font-mono leading-none opacity-60 text-white pointer-events-none">
                          {8 - r}
                        </span>
                      )}
                      {showFile && (
                        <span className="absolute bottom-0.5 right-0.5 text-[8px] font-mono leading-none opacity-60 text-white pointer-events-none">
                          {FILES[c]}
                        </span>
                      )}

                      {piece && (
                        <div
                          key={isLastTo ? `move-${moveSeqKey}` : undefined}
                          style={animStyle}
                          className={`w-full h-full flex items-center justify-center ${animClass}`}
                        >
                          {renderSquarePiece()}
                        </div>
                      )}

                      {legalTarget && (
                        <span
                          className={`pointer-events-none absolute z-10 ${
                            legalTarget.isCapture
                              ? 'inset-1.5 rounded-full border-[3px] border-rose-400/95 shadow-[0_0_14px_rgba(244,63,94,0.95)] animate-pulse'
                              : 'w-[28%] h-[28%] rounded-full bg-emerald-400/95 shadow-[0_0_10px_rgba(16,185,129,0.85)] animate-pulse'
                          }`}
                        />
                      )}
                    </button>
                  );
                })
              )}
            </div>

            {/* Chess Promotion Picker Overlay */}
            {pendingPromo && (
              <div className="absolute inset-0 z-20 rounded-2xl bg-black/78 backdrop-blur-sm flex flex-col items-center justify-center gap-3 p-4">
                <span className="text-xs font-bold uppercase tracking-wider text-white">
                  {pickLang(lang, {
                    es: 'Promocionar peón a:',
                    ca: 'Promocionar peó a:',
                    en: 'Promote pawn to:',
                  })}
                </span>
                <div className="grid grid-cols-4 gap-2">
                  {(['Q', 'R', 'B', 'N'] as ChessPromotionPiece[]).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => {
                        onMove(pendingPromo.from, pendingPromo.to, p);
                        setPendingPromo(null);
                        setSelected(null);
                      }}
                      className="w-13 h-13 rounded-2xl bg-[#26262C] hover:bg-[#9146FF] border border-white/20 flex items-center justify-center cursor-pointer active:scale-95 transition-all"
                    >
                      <StauntonChessPiece side={gameState.turn} kind={p} theme={chessTheme} />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Metallic Victory Banner + Confetti Overlay */}
            {gameState.status === 'finished' && (
              <VictoryCelebrationOverlay
                lang={lang}
                title={turnLabel}
                subtitle={winSubtitle}
                primaryLabel={pickLang(lang, { es: 'Revancha', ca: 'Revenja', en: 'Rematch' })}
                onPrimaryAction={() => {
                  triggerHaptic('medium');
                  onReset({ swapColors: false });
                }}
                secondaryLabel={pickLang(lang, {
                  es: 'Cambiar colores',
                  ca: 'Canviar colors',
                  en: 'Swap colors',
                })}
                onSecondaryAction={() => {
                  triggerHaptic('light');
                  onReset({ swapColors: true });
                }}
              />
            )}
          </div>
        )}
      </div>

      {/* Bottom Move History & Controls (Non-truncated clean mobile text) */}
      <div className="flex items-center justify-between gap-2 pt-0.5 shrink-0">
        <div className="flex-1 min-w-0 overflow-x-auto whitespace-nowrap text-[11px] font-mono tabular-nums text-zinc-400 bg-white/[0.03] border border-white/[0.06] rounded-xl px-2.5 py-1.5 no-scrollbar">
          {gameState.moveHistory.length === 0
            ? pickLang(lang, { es: 'Sin jugadas', ca: 'Sense jugades', en: 'No moves' })
            : gameState.moveHistory.slice(-8).join(' · ')}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {mySide && gameState.status !== 'finished' && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('medium');
                onResign();
              }}
              title={pickLang(lang, { es: 'Rendirse', ca: 'Rendir-se', en: 'Resign' })}
              className="h-8 px-2.5 rounded-xl bg-white/[0.05] hover:bg-rose-500/20 border border-white/[0.08] text-[11px] font-semibold text-zinc-300 hover:text-rose-200 flex items-center gap-1 whitespace-nowrap cursor-pointer"
            >
              <Flag className="w-3 h-3" />
              <span>{pickLang(lang, { es: 'Rendirse', ca: 'Rendir-se', en: 'Resign' })}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onReset({ swapColors: false });
            }}
            title={pickLang(lang, { es: 'Reiniciar', ca: 'Reiniciar', en: 'Reset' })}
            className="h-8 px-2.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.12] border border-white/[0.08] text-[11px] font-semibold text-zinc-200 flex items-center gap-1 whitespace-nowrap cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>{pickLang(lang, { es: 'Reiniciar', ca: 'Reiniciar', en: 'Reset' })}</span>
          </button>
        </div>
      </div>

      {/* Collapsible Match History */}
      {matchHistory.length > 0 && !fullScreenMode && (
        <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] overflow-hidden shrink-0">
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="w-full px-3 py-1.5 flex items-center justify-between text-[11px] font-semibold text-zinc-300 hover:text-white cursor-pointer"
          >
            <span className="flex items-center gap-1.5">
              <Trophy className="w-3.5 h-3.5 text-amber-400" />
              <span>
                {pickLang(lang, {
                  es: `Historial (${matchHistory.length})`,
                  ca: `Historial (${matchHistory.length})`,
                  en: `History (${matchHistory.length})`,
                })}
              </span>
            </span>
            {showHistory ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          {showHistory && (
            <div className="px-3 pb-2 space-y-1 border-t border-white/[0.06] pt-1.5 max-h-32 overflow-y-auto custom-scrollbar">
              {[...matchHistory].reverse().map((mh) => (
                <div key={mh.id} className="flex items-center justify-between text-[11px] text-zinc-400">
                  <span className="truncate">
                    <strong className="text-zinc-200">{mh.winnerName}</strong> · {mh.gameType}
                  </span>
                  <span className="font-mono text-[10px] text-zinc-500 shrink-0">
                    {mh.reason || 'fin'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <>
      <div
        className={`flex-1 ${
          fullScreenMode
            ? 'h-full overflow-hidden p-1.5 sm:p-2 flex flex-col'
            : 'overflow-y-auto p-3 space-y-2.5 custom-scrollbar'
        }`}
      >
        {onBack && !hideGameSwitcher && (
          <button
            type="button"
            onClick={onBack}
            className="min-h-8 px-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-[11px] font-semibold text-zinc-200 flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{pickLang(lang, { es: 'Volver', ca: 'Tornar', en: 'Back' })}</span>
          </button>
        )}
        {renderBoardContent(false)}
      </div>

      {isExpanded && (
        <div
          className="fixed inset-0 z-[195] bg-black/85 backdrop-blur-xl flex items-center justify-center p-3 sm:p-6"
          onClick={() => setIsExpanded(false)}
        >
          <div
            className="w-full max-w-[580px] rounded-3xl bg-[#141418] border border-white/[0.12] p-4 sm:p-5 shadow-[0_24px_80px_rgba(0,0,0,0.9)] max-h-[94dvh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {renderBoardContent(true)}
          </div>
        </div>
      )}
    </>
  );
};
