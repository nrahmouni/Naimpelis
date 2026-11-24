import React, { useEffect, useMemo, useState } from 'react';
import {
  Coins,
  Play,
  RefreshCw,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import type { AppLanguage, Participant } from '../types';
import {
  applyBlackjackAction,
  canDoubleBlackjackHand,
  canSplitBlackjackHand,
  createInitialBlackjackState,
  dealBlackjackRound,
  formatBjRank,
  getBlackjackHandValue,
  placeBlackjackBet,
  prepareNewBlackjackBettingRound,
  type BjCard,
  type BlackjackGameState,
  type BlackjackSeat,
} from '../shared/blackjack';
import type { GameVoiceChatState } from '../hooks/useGameVoiceChat';
import { VoiceSpeakerIndicator } from './games/GameVoiceBar';
import { playGameSfx, useGameSoundMute } from './games/GameEffects';
import { pickLang } from '../utils/i18n';
import { triggerHaptic } from '../utils/haptics';
import { getPlayingCardSvgUrl } from '../shared/gameAssetsCdn';

export interface BlackjackStageProps {
  lang: AppLanguage;
  currentUser: Participant;
  participants: Participant[];
  blackjackState: BlackjackGameState | null;
  isOffline?: boolean;
  isHost?: boolean;
  voiceChat?: GameVoiceChatState;
  mutedOverride?: boolean;
  onStartOnline?: () => void;
  onJoinSeatOnline?: (seatIndex?: number | 'spectate') => void;
  onBetOnline?: (op: { kind: 'add'; amount: number } | { kind: 'clear' } | { kind: 'rebet' } | { kind: 'rebuy' }) => void;
  onDealOnline?: () => void;
  onActionOnline?: (action: 'hit' | 'stand' | 'double' | 'split') => void;
  onNewRoundOnline?: () => void;
}

const SUIT_SYMBOL: Record<BjCard['suit'], string> = {
  spades: '♠',
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
};

const CHIP_VALUES = [
  { amount: 5, bg: 'from-rose-500 to-rose-700 border-rose-200/70' },
  { amount: 25, bg: 'from-emerald-500 to-emerald-700 border-emerald-200/70' },
  { amount: 100, bg: 'from-zinc-700 to-zinc-950 border-amber-300/70' },
  { amount: 500, bg: 'from-violet-600 to-indigo-900 border-violet-200/70' },
] as const;

const BjCardVisual: React.FC<{ card?: BjCard | null; faceDown?: boolean; foil?: boolean }> = ({
  card,
  faceDown = false,
  foil = false,
}) => {
  const [failedCardKey, setFailedCardKey] = useState<string | null>(null);

  if (faceDown || !card) {
    return (
      <div className="w-12 h-[68px] sm:w-14 sm:h-20 rounded-xl bg-gradient-to-br from-emerald-900 via-[#0d2d25] to-[#061814] border-2 border-amber-300/45 shadow-[0_8px_18px_rgba(0,0,0,0.55)] flex items-center justify-center relative overflow-hidden shrink-0">
        <div
          className="absolute inset-1 rounded-lg border border-amber-200/25"
          style={{
            backgroundImage:
              'repeating-linear-gradient(45deg, rgba(250,204,21,0.14) 0 4px, transparent 4px 8px)',
          }}
        />
        <span className="text-amber-300/90 font-black text-xs relative z-10">21</span>
      </div>
    );
  }

  const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
  const rank = formatBjRank(card.rank);
  const suit = SUIT_SYMBOL[card.suit];
  const cardKey = `${rank}-${card.suit}`;
  const svgUrl = getPlayingCardSvgUrl(rank, card.suit);

  if (failedCardKey !== cardKey) {
    return (
      <div
        className={`relative w-12 h-[68px] sm:w-14 sm:h-20 rounded-xl bg-white border border-zinc-300/90 shadow-[0_8px_18px_rgba(0,0,0,0.52)] overflow-hidden select-none shrink-0 ${
          foil ? 'card-foil-shimmer' : ''
        }`}
      >
        <img
          src={svgUrl}
          alt={`${rank} ${card.suit}`}
          onError={() => setFailedCardKey(cardKey)}
          className="w-full h-full object-contain p-[1px] pointer-events-none select-none"
          draggable={false}
        />
      </div>
    );
  }

  return (
    <div
      className={`relative w-12 h-[68px] sm:w-14 sm:h-20 rounded-xl bg-gradient-to-b from-white to-zinc-100 border border-zinc-300 shadow-[0_6px_16px_rgba(0,0,0,0.45)] overflow-hidden flex flex-col justify-between p-1.5 select-none shrink-0 ${
        foil ? 'card-foil-shimmer' : ''
      }`}
    >
      <div
        className={`text-xs font-black leading-none flex items-center gap-0.5 ${
          isRed ? 'text-rose-600' : 'text-zinc-900'
        }`}
      >
        <span>{rank}</span>
        <span className="text-[10px]">{suit}</span>
      </div>
      <div
        className={`text-xl sm:text-2xl self-center leading-none ${
          isRed ? 'text-rose-600' : 'text-zinc-900'
        }`}
      >
        {suit}
      </div>
      <div
        className={`text-xs font-black leading-none self-end rotate-180 ${
          isRed ? 'text-rose-600' : 'text-zinc-900'
        }`}
      >
        {rank}
      </div>
    </div>
  );
};

export const BlackjackStage: React.FC<BlackjackStageProps> = ({
  lang,
  currentUser,
  blackjackState,
  isOffline = false,
  voiceChat,
  mutedOverride,
  onStartOnline,
  onJoinSeatOnline,
  onBetOnline,
  onDealOnline,
  onActionOnline,
  onNewRoundOnline,
}) => {
  const [localMuted] = useGameSoundMute();
  const muted = mutedOverride ?? localMuted;

  const [offlineState, setOfflineState] = useState<BlackjackGameState>(() =>
    createInitialBlackjackState({
      id: currentUser.id,
      name: currentUser.name,
      avatar: currentUser.avatar || '🎰',
      color: currentUser.color || '#10B981',
    })
  );

  const state: BlackjackGameState | null = isOffline ? offlineState : blackjackState;

  const mySeat: BlackjackSeat | null = useMemo(() => {
    if (!state) return null;
    return state.seats.find((s) => s?.userId === currentUser.id) || null;
  }, [state, currentUser.id]);

  // Play outcome SFX once when entering settled
  const prevPhaseRef = React.useRef<BlackjackGameState['phase'] | null>(null);
  useEffect(() => {
    if (!state) return;
    if (prevPhaseRef.current === 'playing' && state.phase === 'settled' && mySeat) {
      const anyBjOrWin = mySeat.hands.some((h) => h.outcome === 'blackjack' || h.outcome === 'win');
      const allPush = mySeat.hands.length > 0 && mySeat.hands.every((h) => h.outcome === 'push');
      if (anyBjOrWin) playGameSfx('victory', muted);
      else if (allPush) playGameSfx('draw', muted);
      else if (mySeat.hands.length > 0) playGameSfx('defeat', muted);
    }
    prevPhaseRef.current = state.phase;
  }, [state?.phase, mySeat, muted]);

  const handleBet = (
    op: { kind: 'add'; amount: number } | { kind: 'clear' } | { kind: 'rebet' } | { kind: 'rebuy' }
  ) => {
    triggerHaptic('light');
    playGameSfx('card_draw', muted);
    if (isOffline) {
      const res = placeBlackjackBet(offlineState, currentUser.id, op);
      if (res.ok) setOfflineState(res.state);
    } else {
      onBetOnline?.(op);
    }
  };

  const handleDeal = () => {
    triggerHaptic('medium');
    playGameSfx('card_play', muted);
    if (isOffline) {
      const res = dealBlackjackRound(offlineState);
      if (res.ok) setOfflineState(res.state);
    } else {
      onDealOnline?.();
    }
  };

  const handleAction = (action: 'hit' | 'stand' | 'double' | 'split') => {
    triggerHaptic(action === 'double' || action === 'split' ? 'medium' : 'light');
    playGameSfx(action === 'stand' ? 'board_move' : 'card_play', muted);
    if (isOffline) {
      const res = applyBlackjackAction(offlineState, currentUser.id, action);
      if (res.ok) setOfflineState(res.state);
    } else {
      onActionOnline?.(action);
    }
  };

  const handleNewRound = () => {
    triggerHaptic('light');
    if (isOffline) {
      setOfflineState((prev) => prepareNewBlackjackBettingRound(prev));
    } else {
      onNewRoundOnline?.();
    }
  };

  const handleResetOffline = () => {
    triggerHaptic('medium');
    setOfflineState(
      createInitialBlackjackState({
        id: currentUser.id,
        name: currentUser.name,
        avatar: currentUser.avatar || '🎰',
        color: currentUser.color || '#10B981',
      })
    );
  };

  if (!isOffline && !state) {
    return (
      <div className="w-full max-w-3xl mx-auto rounded-2xl bg-[#07211a] border border-emerald-400/25 p-5 flex flex-col items-center text-center gap-4 shadow-2xl">
        <div className="flex items-center gap-2">
          <BjCardVisual card={{ id: 'bj-1', rank: 1, suit: 'spades' }} foil />
          <BjCardVisual card={{ id: 'bj-2', rank: 11, suit: 'hearts' }} foil />
        </div>
        <div>
          <h3 className="font-display font-black text-xl text-white">Blackjack 21</h3>
          <p className="text-xs text-emerald-100/75 mt-1 max-w-md">
            {pickLang(lang, {
              es: 'Blackjack natural paga 3:2 · Crupier pide hasta 16 y se planta en 17 · Hasta 4 jugadores contra la banca.',
              ca: 'Blackjack natural paga 3:2 · Crupier demana fins a 16 i es planta en 17 · Fins a 4 jugadors.',
              en: 'Blackjack pays 3:2 · Dealer stands on 17 · Up to 4 players against the house.',
            })}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onStartOnline?.()}
          className="min-h-11 px-6 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:brightness-110 text-white text-xs font-black flex items-center gap-2 shadow-lg cursor-pointer"
        >
          <Play className="w-4 h-4 fill-current" />
          <span>{pickLang(lang, { es: 'Abrir Mesa de Blackjack', ca: 'Obrir Taula de Blackjack', en: 'Open Blackjack Table' })}</span>
        </button>
      </div>
    );
  }

  if (!state) return null;

  const isMyTurn =
    state.phase === 'playing' &&
    mySeat !== null &&
    state.seats[state.activeSeatIndex]?.userId === currentUser.id;
  const activeHand = isMyTurn && mySeat ? mySeat.hands[mySeat.activeHandIndex] || null : null;

  const dealerVisibleCards = state.dealerHoleRevealed
    ? state.dealerCards
    : state.dealerCards.slice(0, 1);
  const dealerScore = getBlackjackHandValue(dealerVisibleCards);

  const occupiedSeats = state.seats.filter((s): s is BlackjackSeat => s !== null);

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col gap-3 select-none">
      {/* Top Status Bar */}
      <div className="rounded-2xl bg-[#0a231c] border border-emerald-400/20 px-3 py-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="px-2 py-0.5 rounded-lg bg-emerald-500/20 border border-emerald-400/35 text-[11px] font-black text-emerald-200">
            Ronda #{state.roundNumber || 1}
          </span>
          <span className="text-xs font-semibold text-zinc-100 truncate">
            {state.statusMessage}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {mySeat && (
            <div className="px-2.5 py-1 rounded-xl bg-black/40 border border-amber-400/30 flex items-center gap-1.5">
              <Coins className="w-3.5 h-3.5 text-amber-400" />
              <span className="font-mono text-xs font-black text-amber-300 tabular-nums">
                ${mySeat.bankroll}
              </span>
            </div>
          )}
          {!isOffline && !mySeat && (
            <button
              type="button"
              onClick={() => onJoinSeatOnline?.()}
              className="min-h-8 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-black cursor-pointer"
            >
              Sentarme
            </button>
          )}
          {isOffline && (
            <button
              type="button"
              onClick={handleResetOffline}
              className="min-h-8 px-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-[11px] font-semibold text-zinc-200 flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reiniciar</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Casino Emerald Felt Table */}
      <div className="relative rounded-[32px] bg-gradient-to-b from-[#0f3d2e] via-[#0a2b21] to-[#061813] border-[5px] border-[#1b5442] shadow-[inset_0_0_60px_rgba(0,0,0,0.65),0_20px_44px_rgba(0,0,0,0.7)] p-4 sm:p-5 flex flex-col gap-5 overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse at 50% 25%, rgba(52,211,153,0.14) 0%, transparent 65%)',
          }}
        />
        <div className="pointer-events-none absolute inset-2.5 rounded-[24px] border border-amber-300/20" />
        <div className="relative z-10 text-center text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300/75">
          BLACKJACK PAGA 3 A 2 · CRUPIER SE PLANTA EN 17
        </div>

        {/* Dealer Hand */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black uppercase tracking-wider text-emerald-100/80">
              Crupier
            </span>
            {state.dealerCards.length > 0 && (
              <span className="px-2 py-0.5 rounded-md bg-black/55 border border-white/15 font-mono text-xs font-black text-white tabular-nums">
                {state.dealerHoleRevealed
                  ? dealerScore.isNaturalBlackjack
                    ? 'BJ 21'
                    : dealerScore.isBust
                    ? `Pasado (${dealerScore.total})`
                    : dealerScore.total
                  : `${dealerScore.total} + ?`}
              </span>
            )}
          </div>

          <div className="flex items-center justify-center gap-2 min-h-[82px]">
            {state.dealerCards.length === 0 ? (
              <div className="px-4 py-3 rounded-xl border border-dashed border-emerald-200/20 text-xs text-emerald-100/45">
                Esperando apuestas...
              </div>
            ) : (
              <>
                {state.dealerCards.map((c, idx) => (
                  <BjCardVisual key={c.id || idx} card={c} foil={c.rank === 1 || c.rank >= 11} />
                ))}
                {!state.dealerHoleRevealed && <BjCardVisual faceDown />}
              </>
            )}
          </div>
        </div>

        {/* Player Seats Grid */}
        <div
          className={`grid gap-3 ${
            occupiedSeats.length <= 1
              ? 'grid-cols-1 max-w-md mx-auto w-full'
              : occupiedSeats.length === 2
              ? 'grid-cols-1 sm:grid-cols-2'
              : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
          }`}
        >
          {occupiedSeats.map((seat) => {
            const seatTurn = state.phase === 'playing' && state.activeSeatIndex === seat.seatIndex;
            return (
              <div
                key={seat.seatIndex}
                className={`rounded-2xl p-3 border transition-all flex flex-col gap-2.5 ${
                  seatTurn
                    ? 'bg-amber-400/10 border-amber-300 shadow-[0_0_24px_rgba(250,204,21,0.25)]'
                    : 'bg-black/35 border-white/10'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-sm">{seat.avatar}</span>
                    <span className="text-xs font-bold text-white truncate">{seat.name}</span>
                    {!isOffline && voiceChat && (() => {
                      const peer = voiceChat.voicePeers.find((p) => p.userId === seat.userId);
                      const level = voiceChat.audioLevels?.[seat.userId] ?? 0;
                      const speaking = Boolean(
                        peer && !peer.isMuted && (level > 0.06 || voiceChat.speakingUserIds.includes(seat.userId))
                      );
                      return (
                        <VoiceSpeakerIndicator
                          inVoice={Boolean(peer)}
                          isSpeaking={speaking}
                          isMuted={Boolean(peer?.isMuted)}
                          audioLevel={level}
                        />
                      );
                    })()}
                  </div>
                  <span className="font-mono text-[11px] font-bold text-amber-300">
                    {seat.pendingBet > 0
                      ? `Apuesta $${seat.pendingBet}`
                      : `Saldo $${seat.bankroll}`}
                  </span>
                </div>

                {seat.hands.length > 0 ? (
                  <div className="flex flex-wrap items-start justify-center gap-3">
                    {seat.hands.map((hand, hIdx) => {
                      const val = getBlackjackHandValue(hand.cards, {
                        isSplitHand: hand.isSplitHand,
                      });
                      const isThisHandTurn = seatTurn && seat.activeHandIndex === hIdx;
                      const scoreText = val.isNaturalBlackjack
                        ? 'Blackjack!'
                        : val.isBust
                        ? `Pasado (${val.total})`
                        : val.isSoft
                        ? `${val.total - 10}/${val.total}`
                        : `${val.total}`;

                      return (
                        <div
                          key={hand.id}
                          className={`rounded-xl p-2 border flex flex-col items-center gap-1.5 ${
                            isThisHandTurn
                              ? 'border-amber-300 bg-amber-400/10'
                              : 'border-white/10 bg-black/25'
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            {hand.cards.map((c, cIdx) => (
                              <BjCardVisual
                                key={c.id || cIdx}
                                card={c}
                                foil={
                                  c.rank === 1 ||
                                  c.rank >= 11 ||
                                  hand.outcome === 'blackjack' ||
                                  hand.outcome === 'win'
                                }
                              />
                            ))}
                          </div>

                          <div className="flex items-center gap-1.5 flex-wrap justify-center">
                            <span className="px-2 py-0.5 rounded bg-black/60 font-mono text-[11px] font-black text-white">
                              {scoreText}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-white/10 font-mono text-[10px] font-bold text-amber-300">
                              ${hand.bet}
                            </span>
                          </div>

                          {hand.outcome !== 'pending' && (
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                hand.outcome === 'blackjack'
                                  ? 'bg-amber-400 text-zinc-950'
                                  : hand.outcome === 'win'
                                  ? 'bg-emerald-500 text-zinc-950'
                                  : hand.outcome === 'push'
                                  ? 'bg-slate-400 text-zinc-950'
                                  : 'bg-rose-500/80 text-white'
                              }`}
                            >
                              {hand.outcome === 'blackjack'
                                ? `BLACKJACK 3:2 +$${hand.payout - hand.bet}`
                                : hand.outcome === 'win'
                                ? `GANAS +$${hand.payout - hand.bet}`
                                : hand.outcome === 'push'
                                ? 'EMPATE'
                                : hand.outcome === 'bust'
                                ? 'PASADO'
                                : 'PIERDES'}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-3 text-center text-xs text-emerald-100/55">
                    {seat.pendingBet > 0
                      ? `Ficha lista: $${seat.pendingBet}`
                      : 'Toca una ficha para apostar'}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Betting Tray & Action Controls */}
      {mySeat && (state.phase === 'betting' || state.phase === 'settled') && (
        <div className="rounded-2xl bg-[#0a231c] border border-emerald-400/20 p-3 space-y-3">
          {/* Chip Buttons */}
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            {CHIP_VALUES.map((chip) => (
              <button
                key={chip.amount}
                type="button"
                disabled={mySeat.bankroll < chip.amount}
                onClick={() => handleBet({ kind: 'add', amount: chip.amount })}
                className={`w-12 h-12 rounded-full bg-gradient-to-b ${chip.bg} border-2 border-dashed font-mono text-xs font-black text-white shadow-[0_6px_14px_rgba(0,0,0,0.6),inset_0_2px_3px_rgba(255,255,255,0.45)] flex items-center justify-center cursor-pointer active:scale-90 disabled:opacity-35 transition-transform`}
              >
                ${chip.amount}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            {mySeat.pendingBet > 0 && (
              <button
                type="button"
                onClick={() => handleBet({ kind: 'clear' })}
                className="min-h-10 px-3.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold text-zinc-200 cursor-pointer"
              >
                Limpiar
              </button>
            )}
            <button
              type="button"
              onClick={() => handleBet({ kind: 'rebet' })}
              className="min-h-10 px-3.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold text-zinc-100 cursor-pointer"
            >
              Repetir (${mySeat.lastBet || 25})
            </button>
            {mySeat.bankroll < 50 && mySeat.pendingBet === 0 && (
              <button
                type="button"
                onClick={() => handleBet({ kind: 'rebuy' })}
                className="min-h-10 px-3.5 rounded-xl bg-amber-400/20 border border-amber-400/40 text-xs font-black text-amber-200 cursor-pointer"
              >
                Recomprar $1000
              </button>
            )}
            {state.phase === 'settled' ? (
              <button
                type="button"
                onClick={handleNewRound}
                className="min-h-11 px-6 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:brightness-110 text-zinc-950 text-xs font-black flex items-center gap-1.5 shadow-lg cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Nueva Ronda</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleDeal}
                className="min-h-11 px-6 rounded-xl bg-gradient-to-r from-amber-400 to-yellow-500 hover:brightness-110 text-zinc-950 text-xs font-black flex items-center gap-1.5 shadow-lg cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span>Repartir</span>
              </button>
            )}
          </div>
        </div>
      )}

      {isMyTurn && mySeat && activeHand && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <button
            type="button"
            onClick={() => handleAction('hit')}
            className="min-h-12 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs sm:text-sm font-black cursor-pointer active:scale-95 transition-all shadow-lg"
          >
            Pedir (Hit)
          </button>
          <button
            type="button"
            onClick={() => handleAction('stand')}
            className="min-h-12 rounded-xl bg-rose-500/25 hover:bg-rose-500/40 border border-rose-400/45 text-rose-100 text-xs sm:text-sm font-black cursor-pointer active:scale-95 transition-all"
          >
            Plantarse (Stand)
          </button>
          <button
            type="button"
            disabled={!canDoubleBlackjackHand(activeHand, mySeat)}
            onClick={() => handleAction('double')}
            className="min-h-12 rounded-xl bg-amber-400/25 hover:bg-amber-400/40 border border-amber-300/45 disabled:opacity-35 text-amber-100 text-xs sm:text-sm font-black cursor-pointer active:scale-95 transition-all"
          >
            Doblar (2x)
          </button>
          <button
            type="button"
            disabled={!canSplitBlackjackHand(activeHand, mySeat)}
            onClick={() => handleAction('split')}
            className="min-h-12 rounded-xl bg-violet-500/25 hover:bg-violet-500/40 border border-violet-300/45 disabled:opacity-35 text-violet-100 text-xs sm:text-sm font-black cursor-pointer active:scale-95 transition-all"
          >
            Dividir (Split)
          </button>
        </div>
      )}
    </div>
  );
};
