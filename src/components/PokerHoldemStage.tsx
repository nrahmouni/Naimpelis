import React, { useEffect, useMemo, useState } from 'react';
import {
  Bot,
  Coins,
  Crown,
  Play,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import type { AppLanguage, Participant } from '../types';
import {
  applyPokerAction,
  choosePokerBotAction,
  createInitialPokerState,
  evaluateBest5Of7,
  formatPokerRank,
  startNextPokerHand,
  type PokerActionType,
  type PokerCard,
  type PokerGameState,
  type PokerSeat,
} from '../shared/texasHoldem';
import type { GameVoiceChatState } from '../hooks/useGameVoiceChat';
import { VoiceSpeakerIndicator } from './games/GameVoiceBar';
import { playGameSfx, useGameSoundMute } from './games/GameEffects';
import { pickLang } from '../utils/i18n';
import { triggerHaptic } from '../utils/haptics';

export interface PokerHoldemStageProps {
  lang: AppLanguage;
  currentUser: Participant;
  participants: Participant[];
  pokerState: PokerGameState | null;
  isOffline?: boolean;
  isHost?: boolean;
  voiceChat?: GameVoiceChatState;
  mutedOverride?: boolean;
  onStartOnline?: (botsEnabled?: boolean) => void;
  onJoinSeatOnline?: (seatIndex?: number | 'spectate') => void;
  onToggleBotsOnline?: (botsEnabled: boolean) => void;
  onStartMatchOnline?: () => void;
  onActionOnline?: (action: PokerActionType, raiseTo?: number) => void;
  onRebuyOnline?: () => void;
}

const SUIT_GLYPH: Record<PokerCard['suit'], string> = {
  spades: '♠',
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
};

const PlayingCardView: React.FC<{
  card?: PokerCard | null;
  faceDown?: boolean;
  highlighted?: boolean;
  compact?: boolean;
}> = ({ card, faceDown = false, highlighted = false, compact = false }) => {
  const sizeCls = compact
    ? 'w-8 h-11 rounded-md text-[10px]'
    : 'w-11 h-16 sm:w-13 sm:h-18 rounded-lg text-xs';

  if (faceDown || !card) {
    return (
      <div
        className={`${sizeCls} bg-gradient-to-br from-[#4c1d95] via-[#311068] to-[#1e0b42] border border-violet-300/35 shadow-md flex items-center justify-center relative overflow-hidden shrink-0`}
      >
        <div
          className="absolute inset-1 rounded-[4px] border border-violet-300/25 opacity-60"
          style={{
            backgroundImage:
              'repeating-linear-gradient(45deg, rgba(191,148,255,0.12) 0 4px, transparent 4px 8px)',
          }}
        />
        <span className="text-violet-200/80 font-black text-[10px] relative z-10">✦</span>
      </div>
    );
  }

  const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
  const rankLabel = formatPokerRank(card.rank);
  const suitChar = SUIT_GLYPH[card.suit];

  return (
    <div
      className={`${sizeCls} bg-gradient-to-b from-white to-zinc-100 border ${
        highlighted
          ? 'border-amber-400 ring-2 ring-amber-400/80 -translate-y-1 shadow-[0_8px_20px_rgba(250,204,21,0.45)]'
          : 'border-zinc-300 shadow-[0_4px_12px_rgba(0,0,0,0.45)]'
      } flex flex-col justify-between p-1 select-none shrink-0 transition-all`}
    >
      <div
        className={`leading-none font-black flex items-center gap-0.5 ${
          isRed ? 'text-rose-600' : 'text-zinc-900'
        }`}
      >
        <span>{rankLabel}</span>
        <span className="text-[0.85em]">{suitChar}</span>
      </div>
      <div
        className={`self-center leading-none ${compact ? 'text-sm' : 'text-lg sm:text-xl'} ${
          isRed ? 'text-rose-600' : 'text-zinc-900'
        }`}
      >
        {suitChar}
      </div>
      <div
        className={`leading-none font-black self-end rotate-180 flex items-center gap-0.5 ${
          isRed ? 'text-rose-600' : 'text-zinc-900'
        }`}
      >
        <span>{rankLabel}</span>
      </div>
    </div>
  );
};

export const PokerHoldemStage: React.FC<PokerHoldemStageProps> = ({
  lang,
  currentUser,
  pokerState,
  isOffline = false,
  isHost = false,
  voiceChat,
  mutedOverride,
  onStartOnline,
  onJoinSeatOnline,
  onToggleBotsOnline,
  onStartMatchOnline,
  onActionOnline,
  onRebuyOnline,
}) => {
  const [localMuted] = useGameSoundMute();
  const muted = mutedOverride ?? localMuted;

  const [offlineState, setOfflineState] = useState<PokerGameState>(() =>
    createInitialPokerState(
      [
        {
          id: currentUser.id,
          name: currentUser.name,
          avatar: currentUser.avatar || '🃏',
          color: currentUser.color || '#9146FF',
        },
      ],
      { fillWithBots: true, autoStart: true }
    )
  );
  const [raiseAmount, setRaiseAmount] = useState(40);
  const [showRaiseControls, setShowRaiseControls] = useState(false);

  const state: PokerGameState | null = isOffline ? offlineState : pokerState;

  // Offline AI Bot turn scheduler (smooth 850ms-1050ms delay)
  useEffect(() => {
    if (!isOffline) return;
    if (offlineState.status !== 'playing') return;
    const activeSeat = offlineState.seats[offlineState.turnSeat];
    if (!activeSeat || !activeSeat.isBot) return;

    const timer = window.setTimeout(() => {
      const move = choosePokerBotAction(offlineState);
      const res = applyPokerAction(offlineState, activeSeat.userId, move.action, move.raiseTo);
      if (res.ok) {
        playGameSfx(
          move.action === 'fold' ? 'card_draw' : 'card_play',
          muted
        );
        setOfflineState(res.state);
      }
    }, 900);

    return () => window.clearTimeout(timer);
  }, [isOffline, offlineState, muted]);

  const mySeat: PokerSeat | null = useMemo(() => {
    if (!state) return null;
    return state.seats.find((s) => s && !s.isBot && s.userId === currentUser.id) || null;
  }, [state, currentUser.id]);

  const isMyTurn = Boolean(
    state &&
      state.status === 'playing' &&
      mySeat &&
      state.turnSeat === mySeat.seatIndex &&
      !mySeat.folded &&
      !mySeat.allIn
  );

  const toCall = useMemo(() => {
    if (!state || !mySeat) return 0;
    return Math.max(0, state.currentBet - mySeat.currentBet);
  }, [state, mySeat]);

  const minRaiseTo = useMemo(() => {
    if (!state || !mySeat) return 40;
    const rawMin = state.currentBet + state.minRaiseIncrement;
    const maxTotal = mySeat.currentBet + mySeat.chips;
    return Math.min(maxTotal, Math.max(state.bigBlind, rawMin));
  }, [state, mySeat]);

  const maxRaiseTo = mySeat ? mySeat.currentBet + mySeat.chips : 1000;

  useEffect(() => {
    setRaiseAmount(minRaiseTo);
    setShowRaiseControls(false);
  }, [state?.turnSeat, state?.street, minRaiseTo]);

  const winningCardIds = useMemo(() => {
    const ids = new Set<string>();
    if (!state || state.status !== 'finished') return ids;
    for (const w of state.winners) {
      w.hand?.best5Ids.forEach((id) => ids.add(id));
    }
    return ids;
  }, [state]);

  const myLiveBestHand = useMemo(() => {
    if (!state || !mySeat || mySeat.holeCards.length < 2 || mySeat.folded) return null;
    if (state.communityCards.length < 3) return null;
    return evaluateBest5Of7([...mySeat.holeCards, ...state.communityCards]);
  }, [state, mySeat]);

  const handleAction = (action: PokerActionType, targetRaise?: number) => {
    triggerHaptic(action === 'all_in' || action === 'raise' ? 'medium' : 'light');
    playGameSfx(action === 'fold' ? 'card_draw' : 'card_play', muted);
    if (isOffline) {
      const res = applyPokerAction(offlineState, currentUser.id, action, targetRaise);
      if (res.ok) setOfflineState(res.state);
    } else {
      onActionOnline?.(action, targetRaise);
    }
  };

  const handleDealNext = () => {
    triggerHaptic('medium');
    playGameSfx('card_play', muted);
    if (isOffline) {
      const res = startNextPokerHand(offlineState);
      if (res.ok) setOfflineState(res.state);
    } else if (!state) {
      onStartOnline?.(true);
    } else {
      onStartMatchOnline?.();
    }
  };

  const handleResetOffline = () => {
    triggerHaptic('medium');
    setOfflineState(
      createInitialPokerState(
        [
          {
            id: currentUser.id,
            name: currentUser.name,
            avatar: currentUser.avatar || '🃏',
            color: currentUser.color || '#9146FF',
          },
        ],
        { fillWithBots: true, autoStart: true }
      )
    );
  };

  // Online Waiting / Empty Table
  if (!isOffline && !state) {
    return (
      <div className="w-full max-w-3xl mx-auto rounded-2xl bg-[#120d22] border border-violet-400/20 p-5 flex flex-col items-center text-center gap-4 shadow-2xl">
        <div className="flex items-center gap-2">
          <PlayingCardView card={{ id: 'As', rank: 14, suit: 'spades' }} />
          <PlayingCardView card={{ id: 'Kh', rank: 13, suit: 'hearts' }} />
        </div>
        <div>
          <h3 className="font-display font-black text-xl text-white">
            {pickLang(lang, { es: 'Texas Hold’em No-Limit', ca: 'Texas Hold’em No-Limit', en: 'Texas Hold’em No-Limit' })}
          </h3>
          <p className="text-xs text-zinc-300 mt-1 max-w-md">
            {pickLang(lang, {
              es: 'Ciegas $10/$20 · Hasta 6 jugadores en mesa · Reparte con amigos o completa los asientos con bots IA.',
              ca: 'Cegues $10/$20 · Fins a 6 jugadors a la taula · Juga amb amics o bots IA.',
              en: '$10/$20 Blinds · Up to 6 seats · Play with friends or fill empty seats with AI bots.',
            })}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onStartOnline?.(true)}
          className="min-h-11 px-6 rounded-xl bg-gradient-to-r from-[#9146FF] to-fuchsia-600 hover:brightness-110 text-white text-xs font-black flex items-center gap-2 shadow-lg cursor-pointer"
        >
          <Play className="w-4 h-4 fill-current" />
          <span>{pickLang(lang, { es: 'Abrir Mesa de Póker', ca: 'Obrir Taula de Pòquer', en: 'Open Poker Table' })}</span>
        </button>
      </div>
    );
  }

  if (!state) return null;

  const humanSeatCount = state.seats.filter((s) => s && !s.isBot).length;
  const botCount = state.seats.filter((s) => s && s.isBot).length;
  const occupiedCount = state.seats.filter(Boolean).length;

  // Order seats so viewer's seat (or seat 0) sits cleanly at the bottom-center
  const orderedSeats = state.seats.filter((s): s is PokerSeat => s !== null);
  const mySeatIdx = mySeat?.seatIndex ?? 0;
  const topSeats = orderedSeats.filter((s) => s.seatIndex !== mySeatIdx);
  const bottomSeat = orderedSeats.find((s) => s.seatIndex === mySeatIdx) || null;

  const renderSeatCard = (seat: PokerSeat, isHero = false) => {
    const isTurn = state.status === 'playing' && state.turnSeat === seat.seatIndex;
    const isDealer = state.dealerSeat === seat.seatIndex;
    const isSB = state.sbSeat === seat.seatIndex && state.handNumber > 0;
    const isBB = state.bbSeat === seat.seatIndex && state.handNumber > 0;
    const isWinner = state.status === 'finished' && state.winners.some((w) => w.seatIndex === seat.seatIndex);
    const shouldShowFaceUp =
      seat.seatIndex === mySeat?.seatIndex ||
      ((state.street === 'showdown' || state.status === 'finished') && !seat.folded && seat.holeCards.length > 0);

    return (
      <div
        key={seat.seatIndex}
        className={`rounded-2xl p-2 sm:p-2.5 border transition-all flex ${
          isHero ? 'flex-row items-center justify-between gap-3 w-full max-w-md mx-auto' : 'flex-col gap-1.5 min-w-0'
        } ${
          isWinner
            ? 'bg-amber-500/15 border-amber-400 shadow-[0_0_24px_rgba(250,204,21,0.3)]'
            : isTurn
            ? 'bg-[#9146FF]/20 border-[#BF94FF] shadow-[0_0_18px_rgba(145,70,255,0.35)]'
            : seat.folded
            ? 'bg-white/[0.02] border-white/[0.06] opacity-55'
            : 'bg-black/45 border-white/[0.1]'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center text-sm shrink-0">
            {seat.isBot ? '🤖' : seat.avatar}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 min-w-0">
              <span className="text-[11px] sm:text-xs font-bold text-white truncate">
                {seat.name}
              </span>
              {!isOffline && !seat.isBot && voiceChat && (() => {
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
              {isDealer && (
                <span className="px-1.5 py-0.5 rounded bg-amber-400 text-zinc-950 text-[9px] font-black leading-none shrink-0">
                  D
                </span>
              )}
              {!isDealer && isSB && (
                <span className="px-1 py-0.5 rounded bg-sky-400/25 text-sky-200 text-[9px] font-bold leading-none shrink-0">
                  SB
                </span>
              )}
              {isBB && (
                <span className="px-1 py-0.5 rounded bg-fuchsia-400/25 text-fuchsia-200 text-[9px] font-bold leading-none shrink-0">
                  BB
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-[10px] sm:text-[11px] font-mono text-emerald-300 font-bold">
              <span>${seat.chips}</span>
              {seat.currentBet > 0 && (
                <span className="text-amber-300">· Apuesta ${seat.currentBet}</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            {seat.holeCards.length > 0 ? (
              seat.holeCards.map((c, idx) => (
                <PlayingCardView
                  key={c.id || idx}
                  card={shouldShowFaceUp ? c : null}
                  faceDown={!shouldShowFaceUp}
                  highlighted={winningCardIds.has(c.id)}
                  compact={!isHero}
                />
              ))
            ) : state.status === 'playing' && !seat.folded ? (
              <>
                <PlayingCardView faceDown compact={!isHero} />
                <PlayingCardView faceDown compact={!isHero} />
              </>
            ) : null}
          </div>

          <div className="flex flex-col items-end gap-1">
            {seat.lastActionLabel && (
              <span className="px-2 py-0.5 rounded-md bg-white/10 text-[10px] font-bold text-zinc-200 whitespace-nowrap">
                {seat.lastActionLabel}
              </span>
            )}
            {seat.revealedHand && state.status === 'finished' && (
              <span className="px-2 py-0.5 rounded-md bg-amber-400/20 border border-amber-400/40 text-[10px] font-black text-amber-200 whitespace-nowrap">
                {seat.revealedHand.categoryLabelEs}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col gap-3 select-none">
      {/* Top Status & Table Management Strip */}
      <div className="rounded-2xl bg-[#120d22] border border-white/10 px-3 py-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="px-2 py-0.5 rounded-lg bg-[#9146FF]/25 border border-[#BF94FF]/35 text-[11px] font-bold text-violet-200 uppercase">
            {state.street === 'waiting' ? 'Lobby' : state.street}
          </span>
          <span className="text-xs font-semibold text-zinc-200 truncate">
            {state.statusMessage}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {!isOffline && !mySeat && (
            <button
              type="button"
              onClick={() => onJoinSeatOnline?.()}
              className="min-h-8 px-3 rounded-xl bg-[#9146FF] hover:bg-[#7C2AE8] text-white text-xs font-bold cursor-pointer"
            >
              Sentarme
            </button>
          )}
          {!isOffline && isHost && (
            <button
              type="button"
              onClick={() => onToggleBotsOnline?.(botCount === 0)}
              className="min-h-8 px-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-[11px] font-semibold text-zinc-200 flex items-center gap-1 cursor-pointer"
            >
              <Bot className="w-3.5 h-3.5 text-amber-300" />
              <span>{botCount > 0 ? 'Quitar Bots' : 'Añadir Bots'}</span>
            </button>
          )}
          {isOffline && (
            <button
              type="button"
              onClick={handleResetOffline}
              className="min-h-8 px-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-[11px] font-semibold text-zinc-200 flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reiniciar Mesa</span>
            </button>
          )}
        </div>
      </div>

      {/* Opponents Row */}
      {topSeats.length > 0 && (
        <div
          className={`grid gap-2 ${
            topSeats.length <= 2
              ? 'grid-cols-2'
              : topSeats.length === 3
              ? 'grid-cols-3'
              : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-5'
          }`}
        >
          {topSeats.map((s) => renderSeatCard(s, false))}
        </div>
      )}

      {/* Sleek Dark/Purple Felt Poker Table Center */}
      <div className="relative rounded-[36px] bg-gradient-to-b from-[#2b154d] via-[#1c0e36] to-[#110824] border-4 border-[#3b2069] shadow-[inset_0_0_50px_rgba(0,0,0,0.65),0_18px_40px_rgba(0,0,0,0.65)] px-4 py-5 flex flex-col items-center justify-center gap-3.5">
        <div className="absolute inset-2 rounded-[28px] border border-violet-300/15 pointer-events-none" />

        {/* Pot & Blinds Pill */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="px-4 py-1.5 rounded-full bg-black/55 border border-amber-400/40 flex items-center gap-2 shadow-lg">
            <Coins className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-bold text-zinc-300">BOTE:</span>
            <span className="font-mono text-sm font-black text-amber-300 tabular-nums">
              ${state.pot}
            </span>
          </div>
          <span className="text-[10px] font-mono text-violet-200/70">
            SB ${state.smallBlind} / BB ${state.bigBlind}
          </span>
        </div>

        {/* 5 Community Cards */}
        <div className="relative z-10 flex items-center justify-center gap-1.5 sm:gap-2.5 min-h-[76px]">
          {Array.from({ length: 5 }).map((_, idx) => {
            const card = state.communityCards[idx];
            if (!card) {
              return (
                <div
                  key={idx}
                  className="w-11 h-16 sm:w-13 sm:h-18 rounded-lg border border-dashed border-violet-300/20 bg-black/20 shrink-0"
                />
              );
            }
            return (
              <PlayingCardView
                key={card.id}
                card={card}
                highlighted={winningCardIds.has(card.id)}
              />
            );
          })}
        </div>

        {/* Winner Banner or Live Hand Hint */}
        {state.status === 'finished' && state.winners.length > 0 ? (
          <div className="relative z-10 flex flex-wrap items-center justify-center gap-2">
            {state.winners.map((w) => (
              <div
                key={w.seatIndex}
                className="px-3.5 py-1.5 rounded-xl bg-amber-400/20 border border-amber-400/50 text-xs font-black text-amber-200 flex items-center gap-1.5"
              >
                <Crown className="w-3.5 h-3.5 text-amber-300" />
                <span>
                  {w.name} +${w.amount}
                  {w.hand ? ` · ${w.hand.categoryLabelEs}` : ''}
                </span>
              </div>
            ))}
          </div>
        ) : myLiveBestHand ? (
          <div className="relative z-10 px-3 py-1 rounded-full bg-black/45 border border-white/10 text-[11px] font-bold text-violet-200">
            Tu mejor mano: <span className="text-amber-300">{myLiveBestHand.categoryLabelEs}</span>
          </div>
        ) : null}
      </div>

      {/* Hero Seat */}
      {bottomSeat && renderSeatCard(bottomSeat, true)}

      {/* Action Controls */}
      {isMyTurn && mySeat ? (
        <div className="rounded-2xl bg-[#120d22] border border-[#BF94FF]/35 p-3 space-y-2.5 shadow-xl">
          {showRaiseControls && mySeat.chips > toCall && (
            <div className="space-y-2 pb-2 border-b border-white/10">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-zinc-300">Cantidad total de apuesta:</span>
                <span className="font-mono text-sm font-black text-amber-300">${raiseAmount}</span>
              </div>
              <input
                type="range"
                min={minRaiseTo}
                max={maxRaiseTo}
                step={5}
                value={raiseAmount}
                onChange={(e) => setRaiseAmount(Number(e.target.value))}
                className="w-full accent-[#9146FF] cursor-pointer"
              />
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { label: '2x', val: Math.min(maxRaiseTo, Math.max(minRaiseTo, (state.currentBet || state.bigBlind) * 2)) },
                  { label: '1/2 Bote', val: Math.min(maxRaiseTo, Math.max(minRaiseTo, state.currentBet + Math.round(state.pot * 0.5))) },
                  { label: 'Bote', val: Math.min(maxRaiseTo, Math.max(minRaiseTo, state.currentBet + state.pot)) },
                  { label: 'All-In', val: maxRaiseTo },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setRaiseAmount(preset.val)}
                    className="min-h-8 px-2.5 rounded-lg bg-white/[0.08] hover:bg-white/[0.15] text-[11px] font-bold text-zinc-100 cursor-pointer"
                  >
                    {preset.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    raiseAmount >= maxRaiseTo
                      ? handleAction('all_in')
                      : handleAction('raise', raiseAmount)
                  }
                  className="ml-auto min-h-9 px-4 rounded-xl bg-amber-400 hover:bg-amber-300 text-zinc-950 text-xs font-black cursor-pointer"
                >
                  Confirmar ${raiseAmount}
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => handleAction('fold')}
              className="min-h-12 rounded-xl bg-rose-500/20 hover:bg-rose-500/35 border border-rose-400/40 text-xs sm:text-sm font-black text-rose-200 cursor-pointer active:scale-95 transition-all"
            >
              Retirarse (Fold)
            </button>

            {toCall === 0 ? (
              <button
                type="button"
                onClick={() => handleAction('check')}
                className="min-h-12 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/35 border border-emerald-400/45 text-xs sm:text-sm font-black text-emerald-100 cursor-pointer active:scale-95 transition-all"
              >
                Pasar (Check)
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleAction('call')}
                className="min-h-12 rounded-xl bg-sky-500/25 hover:bg-sky-500/40 border border-sky-400/45 text-xs sm:text-sm font-black text-sky-100 cursor-pointer active:scale-95 transition-all"
              >
                {mySeat.chips <= toCall ? `All-In $${mySeat.chips}` : `Igualar $${toCall}`}
              </button>
            )}

            <button
              type="button"
              disabled={mySeat.chips <= toCall}
              onClick={() => setShowRaiseControls((v) => !v)}
              className="min-h-12 rounded-xl bg-[#9146FF] hover:bg-[#7C2AE8] disabled:opacity-40 text-xs sm:text-sm font-black text-white cursor-pointer active:scale-95 transition-all"
            >
              {state.currentBet === 0 ? 'Apostar' : 'Subir (Raise)'}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
          {(state.status === 'waiting' || state.status === 'finished') && (
            <button
              type="button"
              disabled={occupiedCount < 2}
              onClick={handleDealNext}
              className="min-h-11 px-6 rounded-xl bg-gradient-to-r from-[#9146FF] to-fuchsia-600 hover:brightness-110 disabled:opacity-40 text-white text-xs font-black flex items-center gap-2 shadow-lg cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>
                {state.handNumber === 0
                  ? pickLang(lang, { es: 'Repartir Primera Mano', ca: 'Repartir Primera Mà', en: 'Deal First Hand' })
                  : pickLang(lang, { es: 'Siguiente Mano', ca: 'Següent Mà', en: 'Next Hand' })}
              </span>
            </button>
          )}
          {!isOffline && mySeat && mySeat.chips < 100 && state.status !== 'playing' && (
            <button
              type="button"
              onClick={() => onRebuyOnline?.()}
              className="min-h-11 px-4 rounded-xl bg-amber-400/20 hover:bg-amber-400/30 border border-amber-400/40 text-xs font-black text-amber-200 cursor-pointer"
            >
              Recomprar $1000
            </button>
          )}
          {state.status === 'playing' && (
            <span className="text-xs text-zinc-400">
              {state.seats[state.turnSeat]
                ? `Turno de ${state.seats[state.turnSeat]!.name}...`
                : 'Resolviendo mano...'}
            </span>
          )}
          {!isOffline && occupiedCount < 2 && humanSeatCount < 2 && (
            <span className="text-xs text-zinc-400">
              Siéntate o activa los bots para repartir.
            </span>
          )}
        </div>
      )}
    </div>
  );
};
