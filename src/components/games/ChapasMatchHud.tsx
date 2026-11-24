import React from 'react';
import { Flag, RotateCcw, Shield } from 'lucide-react';
import type {
  AppLanguage,
  ChapasFlagId,
  ChapasTeamId,
  FutbolChapasState,
} from '../../types';
import { CHAPAS_TEAM_PRESETS } from '../../shared/futbolChapas';
import { getCircleFlagCdnUrl } from '../../shared/gameAssetsCdn';
import type { GameVoiceChatState } from '../../hooks/useGameVoiceChat';
import { ChapasSeatSlot } from './ChapasLobbyAndHud';
import { pickLang } from '../../utils/i18n';

interface ChapasScoreboardBarProps {
  lang: AppLanguage;
  activeState: FutbolChapasState;
  flagA: (typeof CHAPAS_TEAM_PRESETS)[number];
  flagB: (typeof CHAPAS_TEAM_PRESETS)[number];
  currentUserId: string;
  isOffline: boolean;
  isSimulatingUI: boolean;
  turnRatio: number;
  voiceChat?: GameVoiceChatState;
  voicePeerMap: Map<string, { isMuted: boolean }>;
  onJoinSeat: (seatIndex: 0 | 1 | 2 | 3) => void;
}

export const ChapasScoreboardBar: React.FC<ChapasScoreboardBarProps> = ({
  lang,
  activeState,
  flagA,
  flagB,
  currentUserId,
  isOffline,
  isSimulatingUI,
  turnRatio,
  voiceChat,
  voicePeerMap,
  onJoinSeat,
}) => (
  <div className="px-2 py-1 rounded-xl bg-gradient-to-b from-[#335C1D] via-[#264615] to-[#1A330E] border border-emerald-300/25 flex items-center justify-between gap-1 shrink-0 shadow-md">
    <div className="flex items-center gap-1 min-w-0">
      {([0, 1] as const).map((seatIdx) => (
        <ChapasSeatSlot
          key={seatIdx}
          lang={lang}
          seatIndex={seatIdx}
          activeState={activeState}
          currentUserId={currentUserId}
          isOffline={isOffline}
          turnRatio={turnRatio}
          voiceChat={voiceChat}
          voicePeerMap={voicePeerMap}
          onJoinSeat={onJoinSeat}
        />
      ))}
    </div>

    <div className="flex flex-col items-center justify-center px-1.5 shrink-0">
      <div className="flex items-center gap-1.5">
        <img
          src={getCircleFlagCdnUrl(flagA.id)}
          alt={flagA.name}
          className="w-5 h-5 rounded-full border border-white/80 shadow-sm shrink-0 object-cover"
        />
        <span className="text-base sm:text-xl font-black font-mono tabular-nums text-white tracking-tight drop-shadow">
          {activeState.scores.A} - {activeState.scores.B}
        </span>
        <img
          src={getCircleFlagCdnUrl(flagB.id)}
          alt={flagB.name}
          className="w-5 h-5 rounded-full border border-white/80 shadow-sm shrink-0 object-cover"
        />
      </div>
      <span className="text-[9px] sm:text-[10px] font-semibold text-emerald-100/85 truncate max-w-[125px] sm:max-w-[200px]">
        {isSimulatingUI
          ? pickLang(lang, { es: 'Jugada en curso…', ca: 'Jugada en curs…', en: 'Shot in play…' })
          : activeState.statusMessage}
      </span>
    </div>

    <div className="flex items-center gap-1 min-w-0">
      {([2, 3] as const).map((seatIdx) => (
        <ChapasSeatSlot
          key={seatIdx}
          lang={lang}
          seatIndex={seatIdx}
          activeState={activeState}
          currentUserId={currentUserId}
          isOffline={isOffline}
          turnRatio={turnRatio}
          voiceChat={voiceChat}
          voicePeerMap={voicePeerMap}
          onJoinSeat={onJoinSeat}
        />
      ))}
    </div>
  </div>
);

export const ChapasGoalBannerOverlay: React.FC<{
  goalBanner: { team: ChapasTeamId; flag: ChapasFlagId };
  scores: { A: number; B: number };
}> = ({ goalBanner, scores }) => (
  <div className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center p-4 overflow-hidden">
    <div className="absolute inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center">
      <div className="w-[360px] h-[360px] nc-ray-spin opacity-45 bg-[radial-gradient(ellipse_at_center,rgba(251,191,36,0.6)_0%,transparent_70%)]" />
    </div>
    <div className="relative z-10 flex flex-col items-center justify-center text-center space-y-2">
      <div className="nc-goal-kinetic text-4xl sm:text-6xl font-black italic tracking-wider text-amber-300 drop-shadow-[0_10px_25px_rgba(245,158,11,0.9)]">
        ⚽ ¡GOOOL!
      </div>
      <div className="px-4 py-1.5 rounded-full bg-black/85 border border-amber-400/80 shadow-lg text-xs sm:text-sm font-extrabold text-white flex items-center gap-2">
        <img
          src={getCircleFlagCdnUrl(goalBanner.flag)}
          alt={goalBanner.flag}
          className="w-5 h-5 rounded-full border border-white/70 object-cover"
        />
        <span>{CHAPAS_TEAM_PRESETS.find((f) => f.id === goalBanner.flag)?.name || ''}</span>
        <span className="text-amber-300 font-mono font-bold">
          ({scores.A} - {scores.B})
        </span>
      </div>
    </div>
  </div>
);

export const ChapasFooterBar: React.FC<{
  lang: AppLanguage;
  status: FutbolChapasState['status'];
  isMyTurn: boolean;
  activeSeatName?: string;
  isOffline: boolean;
  hasMySeats: boolean;
  onRematch: () => void;
  onForfeitOnline?: () => void;
}> = ({
  lang,
  status,
  isMyTurn,
  activeSeatName,
  isOffline,
  hasMySeats,
  onRematch,
  onForfeitOnline,
}) => (
  <div className="px-2.5 py-1 rounded-xl bg-white/[0.04] border border-white/[0.09] flex items-center justify-between gap-2 shrink-0 text-[11px] text-zinc-300">
    <div className="flex items-center gap-1.5 min-w-0">
      <Shield className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
      <span className="truncate">
        {status === 'playing'
          ? isMyTurn
            ? pickLang(lang, {
                es: 'Arrastra una chapa hacia atrás y suelta para chutar',
                ca: 'Arrossega una xapa enrere i deixa anar per xutar',
                en: 'Pull any of your caps back & release to flick',
              })
            : pickLang(lang, {
                es: `Turno de ${activeSeatName || 'rival'}`,
                ca: `Torn de ${activeSeatName || 'rival'}`,
                en: `${activeSeatName || 'Opponent'}'s turn`,
              })
          : pickLang(lang, {
              es: 'Hasta 3 pases seguidos · Primero a 3 goles',
              ca: 'Fins a 3 passades seguides · Primer a 3 gols',
              en: 'Up to 3 passes per possession · First to 3 goals',
            })}
      </span>
    </div>

    <div className="flex items-center gap-1 shrink-0">
      {isOffline ? (
        <button
          type="button"
          onClick={onRematch}
          title={pickLang(lang, { es: 'Reiniciar partido', ca: 'Reiniciar partit', en: 'Restart match' })}
          className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] flex items-center justify-center text-zinc-200 cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      ) : (
        status === 'playing' &&
        hasMySeats && (
          <button
            type="button"
            onClick={() => onForfeitOnline?.()}
            title={pickLang(lang, { es: 'Abandonar partido', ca: 'Abandonar partit', en: 'Forfeit match' })}
            className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-rose-500/20 border border-white/[0.1] flex items-center justify-center text-zinc-200 hover:text-rose-200 cursor-pointer"
          >
            <Flag className="w-3.5 h-3.5" />
          </button>
        )
      )}
    </div>
  </div>
);
