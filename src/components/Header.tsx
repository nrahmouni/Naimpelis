import React from 'react';
import { Share2, Users, Crown, Film, Tv } from 'lucide-react';
import { Participant } from '../types';
import { Language, TRANSLATIONS } from '../utils/i18n';

interface HeaderProps {
  roomName: string;
  roomId: string;
  participants: Participant[];
  currentUser: Participant;
  latencyMs: number;
  language: Language;
  isVirtualBrowser?: boolean;
  isScreenSharing?: boolean;
  onToggleVirtualBrowser?: (enabled: boolean) => void;
  onToggleScreenShare?: (enabled: boolean) => void;
  onOpenInvite: () => void;
  onOpenTv?: () => void;
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
  language,
  isVirtualBrowser = true,
  isScreenSharing = false,
  onToggleVirtualBrowser,
  onToggleScreenShare,
  onOpenInvite,
  onOpenTv,
  onOpenParticipants,
  onOpenProfile,
  onLeaveRoom,
  onOpenHealthMonitor,
}) => {
  const t = TRANSLATIONS[language];
  const getLatencyColor = (ms: number) => {
    if (ms < 50) return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    if (ms < 150) return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
    return 'text-rose-400 bg-rose-500/10 border-rose-500/20';
  };

  return (
    <header className="bg-slate-950 border-b border-white/5 px-3 sm:px-4 flex items-center justify-between gap-2 sticky top-0 z-30 shadow-2xl h-14 sm:h-16 select-none backdrop-blur-md">
      {/* Brand & Room Name */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <button
          onClick={onLeaveRoom}
          className="w-10 h-10 rounded-xl bg-rose-600 flex items-center justify-center text-white shrink-0 hover:bg-rose-500 active:scale-95 transition-all shadow-lg shadow-rose-900/20"
          title="Cambiar de sala"
        >
          <Film className="w-5 h-5" />
        </button>
        <div className="min-w-0 flex flex-col">
          <h1 className="text-xs sm:text-sm font-black text-slate-100 truncate tracking-tight uppercase">
            {roomName}
          </h1>
          <div className="flex items-center gap-2">
            {currentUser.isHost && (
              <span className="flex items-center gap-0.5 text-[8px] sm:text-[9px] font-black text-amber-500 uppercase">
                <Crown className="w-2.5 h-2.5" /> {t.host}
              </span>
            )}
            <button
              onClick={onOpenHealthMonitor}
              className={`flex items-center gap-1 px-1.5 rounded-full text-[8px] sm:text-[9px] font-mono font-black transition-all ${getLatencyColor(latencyMs)}`}
            >
              <span className="w-1 h-1 rounded-full bg-current animate-pulse" />
              <span>{latencyMs}ms</span>
            </button>
          </div>
        </div>
      </div>

      {/* Action Zone */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        {/* Participants Button */}
        <button
          onClick={onOpenParticipants}
          className="h-10 px-2.5 rounded-xl bg-white/5 border border-white/5 text-slate-200 flex items-center gap-1.5 hover:bg-white/10 active:scale-95 transition-all"
          title={t.participants}
        >
          <Users className="w-4 h-4 text-slate-400" />
          <span className="text-xs font-black">{participants.length}</span>
        </button>

        {/* Send to TV Button */}
        {onOpenTv && (
          <button
            onClick={onOpenTv}
            className="h-10 w-10 sm:w-auto sm:px-3 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/20 flex items-center justify-center gap-2 active:scale-95 transition-all"
            title={t.tv}
          >
            <Tv className="w-4 h-4" />
            <span className="hidden md:inline text-xs font-black uppercase">{t.tv}</span>
          </button>
        )}

        {/* Invite CTA Button */}
        <button
          onClick={onOpenInvite}
          className="h-10 px-3 sm:px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white flex items-center gap-2 shadow-lg shadow-rose-900/20 active:scale-95 transition-all"
        >
          <Share2 className="w-4 h-4" />
          <span className="hidden xs:inline text-xs font-black uppercase tracking-tight">{t.invite}</span>
        </button>

        {/* User Profile Avatar */}
        <button
          onClick={onOpenProfile}
          className="w-10 h-10 rounded-xl flex items-center justify-center text-lg border-2 border-white/10 active:scale-95 shrink-0 transition-all overflow-hidden"
          style={{ backgroundColor: currentUser.color }}
          title={`Perfil: ${currentUser.name}`}
        >
          <span className="drop-shadow-md">{currentUser.avatar}</span>
        </button>
      </div>
    </header>
  );
};
