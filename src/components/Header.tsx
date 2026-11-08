import React, { useEffect, useState } from 'react';
import { Activity, Crown, Film, LogOut, Monitor, MoreHorizontal, Share2, Sparkles, Tv, Users, X } from 'lucide-react';
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
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const latencyColor = latencyMs < 50
    ? 'text-emerald-300'
    : latencyMs < 150
      ? 'text-amber-300'
      : 'text-rose-300';
  const menuItem = 'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-slate-200 transition hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-40';

  useEffect(() => {
    if (!isMenuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMenuOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isMenuOpen]);

  return (
    <header className="relative z-30 flex h-12 shrink-0 items-center justify-between gap-2 border-b border-white/[0.08] bg-slate-950 px-3 sm:h-14 sm:px-5">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-rose-600 to-amber-500 text-white shadow-md sm:h-9 sm:w-9">
          <Film className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h1 className="flex items-center gap-1.5 truncate text-xs font-bold text-slate-100 sm:text-sm">
            <span className="truncate">{roomName}</span>
            {currentUser.isHost && <Crown className="h-3 w-3 shrink-0 text-amber-300" />}
          </h1>
          <p className="truncate font-mono text-[10px] text-slate-500">Sala {roomId.slice(0, 10)}</p>
        </div>
      </div>

      <nav aria-label="Acciones de la sala" className="flex shrink-0 items-center gap-1 sm:gap-1.5">
        {onOpenAi && (
          <button type="button" onClick={onOpenAi} className="hidden items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/15 px-2 py-1.5 text-xs font-bold text-amber-200 sm:inline-flex" title="Recomendaciones con IA">
            <Sparkles className="h-3.5 w-3.5" /> IA
          </button>
        )}
        {onOpenTv && (
          <button type="button" onClick={onOpenTv} className="hidden items-center gap-1 rounded-lg border border-blue-500/30 bg-blue-600/15 px-2 py-1.5 text-xs font-bold text-blue-200 sm:inline-flex" title="Enviar a la televisión">
            <Tv className="h-3.5 w-3.5" /> Tele
          </button>
        )}
        {onToggleVirtualBrowser && (
          <button type="button" onClick={() => onToggleVirtualBrowser(true)} aria-label="Abrir catálogo" aria-pressed={isVirtualBrowser} className={`hidden h-9 w-9 items-center justify-center rounded-xl border text-slate-300 transition hover:bg-white/[0.08] sm:inline-flex ${isVirtualBrowser ? 'border-rose-300/20 bg-rose-400/10 text-rose-200' : 'border-white/[0.08] bg-white/[0.035]'}`}>
            <Film className="h-4 w-4" />
          </button>
        )}
        {onToggleScreenShare && (
          <button type="button" onClick={() => onToggleScreenShare(!isScreenSharing)} disabled={!currentUser.isHost} aria-label={isScreenSharing ? 'Dejar de compartir pantalla' : 'Compartir pantalla'} className={`hidden h-9 w-9 items-center justify-center rounded-xl border text-slate-300 transition hover:bg-white/[0.08] disabled:opacity-40 sm:inline-flex ${isScreenSharing ? 'border-rose-300/20 bg-rose-400/10 text-rose-200' : 'border-white/[0.08] bg-white/[0.035]'}`}>
            <Monitor className="h-4 w-4" />
          </button>
        )}
        <button type="button" onClick={onOpenHealthMonitor} aria-label={`Estado de conexión: ${latencyMs} ms`} className={`hidden h-9 items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.035] px-2 font-mono text-[11px] sm:inline-flex ${latencyColor}`}>
          <Activity className="h-3.5 w-3.5" /> {latencyMs} ms
        </button>
        <button type="button" onClick={onOpenParticipants} aria-label={`${participants.length} participantes`} className="hidden h-9 items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.035] px-2 text-xs text-slate-200 sm:inline-flex">
          <Users className="h-3.5 w-3.5 text-slate-400" /> {participants.length}
        </button>
        <button type="button" onClick={onOpenInvite} aria-label="Invitar a la sala" className="flex h-9 w-9 items-center justify-center gap-1.5 rounded-xl bg-rose-600 px-2.5 text-xs font-bold text-white transition hover:bg-rose-500 sm:w-auto">
          <Share2 className="h-3.5 w-3.5" /><span className="hidden sm:inline">Invitar</span>
        </button>
        <button type="button" onClick={onOpenProfile} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/15 text-xs shadow-sm sm:h-9 sm:w-9" style={{ backgroundColor: currentUser.color }} title={`Perfil de ${currentUser.name}`} aria-label={`Perfil de ${currentUser.name}`}>
          {currentUser.avatar}
        </button>
        <button type="button" onClick={() => setIsMenuOpen((open) => !open)} aria-label={isMenuOpen ? 'Cerrar acciones de la sala' : 'Más acciones de la sala'} aria-expanded={isMenuOpen} aria-controls="room-actions-menu" className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.035] text-slate-300 sm:hidden">
          {isMenuOpen ? <X className="h-4 w-4" /> : <MoreHorizontal className="h-5 w-5" />}
        </button>
      </nav>

      {isMenuOpen && (
        <div id="room-actions-menu" className="absolute right-3 top-[calc(100%+8px)] z-50 w-64 rounded-2xl border border-white/10 bg-[#171c20] p-2 shadow-2xl shadow-black/50 sm:hidden">
          {onToggleVirtualBrowser && <button type="button" onClick={() => { onToggleVirtualBrowser(true); setIsMenuOpen(false); }} className={menuItem}><Film className="h-4 w-4 text-slate-400" /> Abrir catálogo</button>}
          {onToggleScreenShare && <button type="button" onClick={() => { onToggleScreenShare(!isScreenSharing); setIsMenuOpen(false); }} disabled={!currentUser.isHost} className={menuItem}><Monitor className="h-4 w-4 text-slate-400" /> {isScreenSharing ? 'Dejar de compartir' : 'Compartir pantalla'}</button>}
          {onOpenAi && <button type="button" onClick={() => { onOpenAi(); setIsMenuOpen(false); }} className={menuItem}><Sparkles className="h-4 w-4 text-amber-300" /> Recomendaciones IA</button>}
          {onOpenTv && <button type="button" onClick={() => { onOpenTv(); setIsMenuOpen(false); }} className={menuItem}><Tv className="h-4 w-4 text-blue-300" /> Enviar a la TV</button>}
          <button type="button" onClick={() => { onOpenParticipants(); setIsMenuOpen(false); }} className={menuItem}><Users className="h-4 w-4 text-slate-400" /> Participantes <span className="ml-auto text-xs text-slate-500">{participants.length}</span></button>
          <button type="button" onClick={() => { onOpenHealthMonitor(); setIsMenuOpen(false); }} className={menuItem}><Activity className={`h-4 w-4 ${latencyColor}`} /> Estado de conexión <span className="ml-auto font-mono text-[11px] text-slate-500">{latencyMs} ms</span></button>
          <div className="my-1 border-t border-white/[0.07]" />
          <button type="button" onClick={() => { onLeaveRoom(); setIsMenuOpen(false); }} className={`${menuItem} text-rose-200 hover:bg-rose-400/10`}><LogOut className="h-4 w-4" /> Salir de la sala</button>
        </div>
      )}
    </header>
  );
};
