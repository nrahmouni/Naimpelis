import React from 'react';
import { Share2, Users, Crown, Film, Sparkles, UserCheck } from 'lucide-react';
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
    <header className="bg-slate-950 border-b border-slate-800/80 px-2 py-1 flex items-center justify-between gap-1 sticky top-0 z-30 shadow-sm h-8 select-none">
      {/* Brand & Room Name */}
      <div className="flex items-center gap-1 min-w-0">
        <button
          onClick={onLeaveRoom}
          className="w-5 h-5 rounded-md bg-rose-600 flex items-center justify-center text-white shrink-0 hover:opacity-90 active:scale-95 transition-all text-[10px]"
          title="Cambiar de sala"
        >
          <Film className="w-3 h-3" />
        </button>
        <div className="min-w-0 flex items-center gap-1">
          <h1 className="text-[11px] font-bold text-slate-200 truncate tracking-tight">
            {roomName}
          </h1>
          {currentUser.isHost && (
            <span className="inline-flex items-center gap-0.5 px-1 text-[8px] font-bold text-amber-400 bg-amber-500/10 rounded shrink-0">
              <Crown className="w-2 h-2" />
            </span>
          )}
        </div>
      </div>

      {/* Action Zone */}
      <div className="flex items-center gap-1 shrink-0">
        {/* WebRTC Screen Share Button */}
        {onToggleScreenShare && (
          <button
            onClick={() => onToggleScreenShare(!isScreenSharing)}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold transition-all active:scale-95 ${
              isScreenSharing
                ? 'bg-rose-600 text-white animate-pulse'
                : 'bg-rose-500/20 text-rose-300'
            }`}
            title="Transmitir tu pantalla o ventana en directo"
          >
            <span>📡</span>
            <span className="hidden xs:inline">{isScreenSharing ? 'En Vivo' : 'Pantalla'}</span>
          </button>
        )}

        {/* Latency Badge */}
        <button
          onClick={onOpenHealthMonitor}
          className={`flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-mono font-bold transition-all active:scale-95 ${getLatencyColor(
            latencyMs
          )}`}
          title="Monitor de salud"
        >
          <span className="w-1 h-1 rounded-full bg-current animate-pulse" />
          <span>{latencyMs}ms</span>
        </button>

        {/* Participants Button */}
        <button
          onClick={onOpenParticipants}
          className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-slate-800 text-slate-200 text-[10px] font-bold active:scale-95"
          title="Ver usuarios"
        >
          <Users className="w-2.5 h-2.5 text-slate-400" />
          <span>{participants.length}</span>
        </button>

        {/* Invite CTA Button */}
        <button
          onClick={onOpenInvite}
          className="flex items-center gap-0.5 px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold transition-all active:scale-95"
        >
          <Share2 className="w-2.5 h-2.5" />
          <span className="hidden xs:inline">Invitar</span>
        </button>

        {/* User Profile Avatar */}
        <button
          onClick={onOpenProfile}
          className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] border border-slate-700 active:scale-95 shrink-0"
          style={{ backgroundColor: currentUser.color }}
          title={`Perfil: ${currentUser.name}`}
        >
          {currentUser.avatar}
        </button>
      </div>
    </header>
  );
};
