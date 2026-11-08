import React from 'react';
import { Share2, Users, Crown, Film, Sparkles, Tv } from 'lucide-react';
import { Participant } from '../types';

interface HeaderProps {
  roomName: string;
  roomId: string;
  participants: Participant[];
  currentUser: Participant;
  latencyMs: number;
  isVirtualBrowser?: boolean;
  isScreenSharing?: boolean;
  onToggleVirtualBrowser?: (enabled: boolean) => void;
  onToggleScreenShare?: (enabled: boolean) => void;
  onOpenInvite: () => void;
  onOpenTv?: () => void;
  onOpenAi?: () => void;
  onOpenParticipants: () => void;
  onOpenProfile: () => void;
  onLeaveRoom: () => void;
  onOpenHealthMonitor: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  roomName,
  roomId,
  participants,
  currentUser,
  latencyMs,
  isVirtualBrowser = true,
  isScreenSharing = false,
  onToggleVirtualBrowser,
  onToggleScreenShare,
  onOpenInvite,
  onOpenTv,
  onOpenAi,
  onOpenParticipants,
  onOpenProfile,
  onLeaveRoom,
  onOpenHealthMonitor,
}) => {
  const getLatencyColor = (ms: number) => {
    if (ms < 50) return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    if (ms < 150) return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
    return 'text-rose-400 bg-rose-500/10 border-rose-500/20';
  };

  return (
    <header className="bg-slate-950 border-b border-slate-800/80 px-2.5 py-1.5 flex items-center justify-between gap-1 sticky top-0 z-30 shadow-sm h-10 select-none">
      {/* Brand & Room Info */}
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-rose-600 to-amber-500 flex items-center justify-center text-white shrink-0 shadow-md">
          <Film className="w-3.5 h-3.5" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xs font-bold text-slate-100 truncate flex items-center gap-1">
            <span>{roomName}</span>
          </h1>
          <p className="text-[10px] text-slate-400 font-mono truncate">ID: {roomId}</p>
        </div>
      </div>

      {/* Actions Strip */}
      <div className="flex items-center gap-1 shrink-0">
        {onOpenAi && (
          <button
            onClick={onOpenAi}
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-xs font-bold transition-all active:scale-95 shadow-sm"
            title="Cinéfilo AI: Recomendador con Gemini"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden xs:inline">IA</span>
          </button>
        )}

        {onOpenTv && (
          <button
            onClick={onOpenTv}
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 border border-blue-500/30 text-xs font-bold transition-all active:scale-95 shadow-sm"
            title="Enviar a la Tele (Smart TV / Chromecast / AirPlay)"
          >
            <Tv className="w-3.5 h-3.5 text-blue-400" />
            <span className="hidden xs:inline">Tele</span>
          </button>
        )}

        <button
          onClick={onOpenParticipants}
          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 text-slate-200 text-xs font-bold active:scale-95 border border-slate-700/60"
          title="Ver participantes"
        >
          <Users className="w-3 h-3 text-slate-400" />
          <span>{participants.length}</span>
        </button>

        <button
          onClick={onOpenInvite}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all active:scale-95 shadow-md shadow-rose-950/40"
        >
          <Share2 className="w-3 h-3" />
          <span className="hidden xs:inline">Invitar</span>
        </button>

        <button
          onClick={onOpenProfile}
          className="w-6 h-6 rounded-full flex items-center justify-center text-xs border border-slate-700 active:scale-95 shrink-0 shadow-sm"
          style={{ backgroundColor: currentUser.color }}
          title={`Perfil: ${currentUser.name}`}
        >
          {currentUser.avatar}
        </button>
      </div>
    </header>
  );
};
