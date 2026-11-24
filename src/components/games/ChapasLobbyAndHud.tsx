import React from 'react';
import { Bot, Play, Smile, Users } from 'lucide-react';
import type {
  AppLanguage,
  ChapasTeamId,
  FutbolChapasState,
} from '../../types';
import { CHAPAS_TEAM_PRESETS } from '../../shared/futbolChapas';
import { getCircleFlagCdnUrl } from '../../shared/gameAssetsCdn';
import type { GameVoiceChatState } from '../../hooks/useGameVoiceChat';
import { VoiceSpeakerIndicator } from './GameVoiceBar';
import { pickLang } from '../../utils/i18n';

export const CHAPAS_QUICK_EMOJIS = ['⚽', '🔥', '👏', '😂', '😱', '🏆'];

export interface ChapasSeatSlotProps {
  lang: AppLanguage;
  seatIndex: 0 | 1 | 2 | 3;
  activeState: FutbolChapasState;
  currentUserId: string;
  isOffline: boolean;
  turnRatio: number;
  voiceChat?: GameVoiceChatState;
  voicePeerMap: Map<string, { isMuted: boolean }>;
  onJoinSeat: (seatIndex: 0 | 1 | 2 | 3) => void;
}

export const ChapasSeatSlot: React.FC<ChapasSeatSlotProps> = ({
  lang,
  seatIndex,
  activeState,
  currentUserId,
  isOffline,
  turnRatio,
  voiceChat,
  voicePeerMap,
  onJoinSeat,
}) => {
  const seat = activeState.players[seatIndex];
  const isActive = activeState.status === 'playing' && activeState.activeSeatIndex === seatIndex;
  const isMe = Boolean(seat && !seat.isBot && seat.userId === currentUserId);
  const voiceInfo = seat && !seat.isBot ? voicePeerMap.get(seat.userId) : undefined;
  const voiceLevel = seat && !seat.isBot ? voiceChat?.audioLevels?.[seat.userId] ?? 0 : 0;
  const isSpeaking = Boolean(
    seat &&
      !seat.isBot &&
      !voiceInfo?.isMuted &&
      (voiceLevel > 0.06 || voiceChat?.speakingUserIds.includes(seat.userId))
  );
  const canJoinThisSeat =
    !isOffline &&
    activeState.status === 'waiting' &&
    (!seat || seat.isBot);

  return (
    <button
      type="button"
      disabled={!canJoinThisSeat && !isMe}
      onClick={() => {
        if (canJoinThisSeat) onJoinSeat(seatIndex);
      }}
      className={`relative flex flex-col items-center min-w-0 px-1 py-0.5 rounded-xl transition-all ${
        canJoinThisSeat ? 'cursor-pointer hover:bg-white/[0.08]' : 'cursor-default'
      }`}
    >
      <div className="w-10 h-1.5 rounded-full bg-black/50 border border-white/15 overflow-hidden mb-0.5">
        {isActive && (
          <div
            className={`h-full transition-[width] duration-150 ${
              turnRatio < 0.3 ? 'bg-rose-500' : 'bg-amber-400'
            }`}
            style={{ width: `${Math.round(turnRatio * 100)}%` }}
          />
        )}
      </div>

      <div
        className={`relative w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-sm sm:text-base border-2 transition-all ${
          isSpeaking
            ? 'border-emerald-400 ring-2 ring-emerald-400/60 bg-emerald-500/20'
            : isActive
            ? 'border-sky-400 bg-sky-500/20 shadow-[0_0_12px_rgba(56,189,248,0.5)]'
            : seat
            ? 'border-white/35 bg-white/[0.1]'
            : 'border-dashed border-white/25 bg-white/[0.03]'
        }`}
      >
        <span>{seat ? seat.avatar : '+'}</span>
        {seat && !seat.isBot && voiceInfo && (
          <span className="absolute -top-1 -right-1">
            <VoiceSpeakerIndicator
              inVoice
              isSpeaking={isSpeaking}
              isMuted={voiceInfo.isMuted}
              audioLevel={voiceLevel}
            />
          </span>
        )}
        {seat?.isBot && (
          <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-zinc-900 border border-white/25 flex items-center justify-center">
            <Bot className="w-2 h-2 text-emerald-300" />
          </span>
        )}
      </div>

      <div className="flex items-center gap-0.5 max-w-[64px] sm:max-w-[84px] mt-0.5">
        <span className="text-[10px] font-bold text-white truncate">
          {seat
            ? seat.name
            : canJoinThisSeat
            ? pickLang(lang, { es: 'Unirse', ca: 'Unir-se', en: 'Join' })
            : '—'}
        </span>
        {seat && !seat.isBot && (
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
        )}
      </div>

      {isActive && isMe && (
        <span className="mt-0.5 px-1.5 py-px rounded-md bg-sky-500 text-white text-[8px] font-black leading-tight whitespace-nowrap shadow">
          {pickLang(lang, { es: 'Tu turno', ca: 'El teu torn', en: 'Your turn' })}
        </span>
      )}
    </button>
  );
};

export interface ChapasWaitingLobbyBarProps {
  lang: AppLanguage;
  activeState: FutbolChapasState;
  flagA: (typeof CHAPAS_TEAM_PRESETS)[number];
  flagB: (typeof CHAPAS_TEAM_PRESETS)[number];
  canConfigureLobby: boolean;
  isOffline: boolean;
  hasMySeat: boolean;
  onCycleTeamFlag: (team: ChapasTeamId) => void;
  onToggleBots: () => void;
  onJoinSeat: (seatIndex: 0 | 1 | 2 | 3) => void;
  onStartMatch: () => void;
}

export const ChapasWaitingLobbyBar: React.FC<ChapasWaitingLobbyBarProps> = ({
  lang,
  activeState,
  flagA,
  flagB,
  canConfigureLobby,
  isOffline,
  hasMySeat,
  onCycleTeamFlag,
  onToggleBots,
  onJoinSeat,
  onStartMatch,
}) => (
  <div className="absolute inset-x-2.5 bottom-2.5 z-20 rounded-2xl bg-[#0D1310]/94 backdrop-blur-md border border-emerald-400/35 p-2.5 flex flex-wrap items-center justify-between gap-2 shadow-2xl">
    <div className="flex items-center gap-1.5 flex-wrap">
      <button
        type="button"
        disabled={!canConfigureLobby}
        onClick={() => onCycleTeamFlag('A')}
        className="min-h-9 px-2.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] disabled:opacity-65 border border-white/20 text-[11px] font-extrabold text-white flex items-center gap-2 whitespace-nowrap cursor-pointer shadow-sm"
      >
        <img
          src={getCircleFlagCdnUrl(flagA.id)}
          alt={flagA.name}
          className="w-5 h-5 rounded-full border-2 border-slate-200 shadow-inner object-cover"
        />
        <span>Eq.1 · {flagA.short}</span>
      </button>

      <button
        type="button"
        disabled={!canConfigureLobby}
        onClick={() => onCycleTeamFlag('B')}
        className="min-h-9 px-2.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] disabled:opacity-65 border border-white/20 text-[11px] font-extrabold text-white flex items-center gap-2 whitespace-nowrap cursor-pointer shadow-sm"
      >
        <img
          src={getCircleFlagCdnUrl(flagB.id)}
          alt={flagB.name}
          className="w-5 h-5 rounded-full border-2 border-slate-200 shadow-inner object-cover"
        />
        <span>Eq.2 · {flagB.short}</span>
      </button>

      {canConfigureLobby && (
        <button
          type="button"
          onClick={onToggleBots}
          className={`min-h-9 px-2.5 rounded-xl border text-[11px] font-extrabold flex items-center gap-1 whitespace-nowrap cursor-pointer transition-colors ${
            activeState.botsEnabled
              ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200'
              : 'bg-zinc-800/80 border-white/15 text-zinc-300'
          }`}
        >
          <Bot className="w-3.5 h-3.5" />
          <span>
            {activeState.botsEnabled
              ? pickLang(lang, { es: 'Bots: Sí', ca: 'Bots: Sí', en: 'Bots: On' })
              : pickLang(lang, { es: 'Bots: No', ca: 'Bots: No', en: 'Bots: Off' })}
          </span>
        </button>
      )}
    </div>

    <div className="flex items-center gap-1.5 ml-auto">
      {!isOffline && !hasMySeat && (
        <button
          type="button"
          onClick={() => onJoinSeat(2)}
          className="min-h-9 px-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-xs font-extrabold text-white flex items-center gap-1 whitespace-nowrap cursor-pointer"
        >
          <Users className="w-3.5 h-3.5" />
          <span>{pickLang(lang, { es: 'Unirse', ca: 'Unir-se', en: 'Join' })}</span>
        </button>
      )}

      {canConfigureLobby ? (
        <button
          type="button"
          onClick={onStartMatch}
          className="min-h-9 px-4 rounded-xl bg-gradient-to-b from-emerald-500 to-emerald-600 hover:brightness-110 text-xs font-black text-zinc-950 flex items-center gap-1.5 whitespace-nowrap cursor-pointer shadow-lg active:scale-95 transition-all"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>{pickLang(lang, { es: 'Play · Sacar', ca: 'Play · Treure', en: 'Play · Kickoff' })}</span>
        </button>
      ) : (
        <span className="text-[11px] font-semibold text-zinc-300 px-2">
          {pickLang(lang, {
            es: 'Esperando al anfitrión…',
            ca: "Esperant l'amfitrió…",
            en: 'Waiting for host…',
          })}
        </span>
      )}
    </div>
  </div>
);

export const ChapasEmojiReactionDock: React.FC<{
  lang: AppLanguage;
  emojiMenuOpen: boolean;
  onToggleOpen: () => void;
  onSendEmoji: (emoji: string) => void;
}> = ({ lang, emojiMenuOpen, onToggleOpen, onSendEmoji }) => (
  <div className="absolute right-2 top-1/2 -translate-y-1/2 z-10 flex flex-col items-end gap-1.5">
    {emojiMenuOpen && (
      <div className="p-1.5 rounded-2xl bg-black/80 backdrop-blur-md border border-white/15 flex flex-col gap-1 shadow-xl">
        {CHAPAS_QUICK_EMOJIS.map((em) => (
          <button
            key={em}
            type="button"
            onClick={() => onSendEmoji(em)}
            className="w-8 h-8 rounded-xl hover:bg-white/15 flex items-center justify-center text-base cursor-pointer active:scale-90 transition-transform"
          >
            {em}
          </button>
        ))}
      </div>
    )}
    <button
      type="button"
      onClick={onToggleOpen}
      aria-label={pickLang(lang, { es: 'Reacciones', ca: 'Reaccions', en: 'Reactions' })}
      className="w-9 h-9 rounded-full bg-amber-400/90 hover:bg-amber-300 text-zinc-950 shadow-lg border border-white/50 flex items-center justify-center cursor-pointer active:scale-95 transition-all"
    >
      <Smile className="w-5 h-5" />
    </button>
  </div>
);
