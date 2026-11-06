import React from 'react';
import { Share2, Users, Crown, Film, Monitor, Activity } from 'lucide-react';
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
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-white/[0.08] bg-[#0b1014]/95 px-3 shadow-[0_8px_24px_rgba(0,0,0,0.18)] backdrop-blur-xl md:px-5">
      {/* Brand & Room Name */}
      <div className="flex min-w-0 items-center gap-3">
        <button
          onClick={onLeaveRoom}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-500 text-white shadow-[0_5px_16px_rgba(244,63,94,0.24)] transition hover:bg-rose-400 active:scale-95"
          title="Cambiar de sala"
          aria-label="Salir de la sala"
        >
          <Film className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate text-sm font-semibold text-slate-100 md:text-[15px]">{roomName}</h1>
            {currentUser.isHost && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-200/15 bg-amber-300/10 px-2 py-0.5 text-[10px] font-semibold text-amber-200">
                <Crown className="h-3 w-3" /> Anfitrión
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[10px] text-slate-500">
            <span className="font-mono">{roomId.slice(0, 12)}</span>
            <span className="h-1 w-1 rounded-full bg-slate-600" />
            <span className="uppercase tracking-[0.12em]">{isVirtualBrowser ? 'Navegador' : 'Reproductor'}</span>
          </div>
        </div>
      </div>

      {/* Room actions */}
      <div className="flex shrink-0 items-center gap-1.5 md:gap-2">
        {onToggleScreenShare && (
          <button
            onClick={() => onToggleScreenShare(!isScreenSharing)}
            disabled={!currentUser.isHost}
            className={`flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              isScreenSharing
                ? 'border-rose-300/20 bg-rose-400/15 text-rose-100'
                : 'border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.09]'
            }`}
            title={currentUser.isHost ? 'Compartir pantalla con la sala' : 'Solo el anfitrión puede compartir pantalla'}
          >
            <Monitor className="h-4 w-4" />
            <span className="hidden sm:inline">{isScreenSharing ? 'Compartiendo' : 'Pantalla'}</span>
          </button>
        )}

        <button
          onClick={onOpenHealthMonitor}
          className={`flex h-9 items-center gap-1.5 rounded-xl border px-2.5 font-mono text-[11px] font-semibold transition-colors ${getLatencyColor(latencyMs)}`}
          title="Abrir estado de conexión"
          aria-label={`Latencia ${latencyMs} milisegundos`}
        >
          <Activity className="h-3.5 w-3.5" />
          <span>{latencyMs} ms</span>
        </button>

        <button
          onClick={onOpenParticipants}
          className="flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-xs font-medium text-slate-200 transition-colors hover:bg-white/[0.09]"
          title="Ver participantes"
        >
          <Users className="h-4 w-4 text-slate-400" />
          <span>{participants.length}</span>
        </button>

        <button
          onClick={onOpenInvite}
          className="flex h-9 items-center gap-2 rounded-xl bg-rose-500 px-3 text-xs font-semibold text-white shadow-[0_5px_16px_rgba(244,63,94,0.18)] transition-colors hover:bg-rose-400"
        >
          <Share2 className="h-4 w-4" />
          <span className="hidden sm:inline">Invitar</span>
        </button>

        <button
          onClick={onOpenProfile}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 text-sm shadow-inner transition-transform active:scale-95"
          style={{ backgroundColor: currentUser.color }}
          title={`Perfil: ${currentUser.name}`}
          aria-label={`Perfil de ${currentUser.name}`}
        >
          {currentUser.avatar}
        </button>
      </div>
    </header>
  );
};
