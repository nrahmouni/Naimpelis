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
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const latencyColor = latencyMs < 50
    ? 'text-emerald-300'
    : latencyMs < 150
      ? 'text-amber-300'
      : 'text-rose-300';

  const iconButton = 'inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.035] text-slate-300 transition hover:border-white/[0.14] hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400';
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
          className={`${iconButton} hidden gap-1.5 px-2.5 sm:inline-flex`}
        >
          <Users className="w-3 h-3 text-slate-400" />
          <span>{participants.length}</span>
        </button>
        <button
          type="button"
          onClick={onOpenInvite}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all active:scale-95 shadow-md shadow-rose-950/40"
        >
          <Share2 className="w-3 h-3" />
          <span className="hidden xs:inline">Invitar</span>
        </button>
        <button
          type="button"
          onClick={onOpenProfile}
          className="w-6 h-6 rounded-full flex items-center justify-center text-xs border border-slate-700 active:scale-95 shrink-0 shadow-sm"
          style={{ backgroundColor: currentUser.color }}
          title={`Perfil: ${currentUser.name}`}
        >
          {currentUser.avatar}
        </button>
        <button type="button" onClick={onLeaveRoom} className={`${iconButton} hidden text-slate-400 sm:inline-flex`} title="Salir de la sala" aria-label="Salir de la sala">
          <LogOut className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setIsMenuOpen((open) => !open)}
          aria-label={isMenuOpen ? 'Cerrar acciones de la sala' : 'Más acciones de la sala'}
          aria-expanded={isMenuOpen}
          aria-controls="room-actions-menu"
          className={`${iconButton} h-9 w-9 sm:hidden`}
        >
          {isMenuOpen ? <X className="h-4 w-4" /> : <MoreHorizontal className="h-5 w-5" />}
        </button>
      </nav>
      {isMenuOpen && (
        <div id="room-actions-menu" className="absolute right-3 top-[calc(100%+8px)] z-50 w-64 rounded-2xl border border-white/10 bg-[#171c20] p-2 shadow-2xl shadow-black/50 sm:hidden">
          {onToggleVirtualBrowser && (
            <button type="button" onClick={() => { onToggleVirtualBrowser(true); setIsMenuOpen(false); }} className={menuItem}>
              <Film className="h-4 w-4 text-slate-400" /> Abrir catálogo
            </button>
          )}
          {onToggleScreenShare && (
            <button
              type="button"
              onClick={() => { onToggleScreenShare(!isScreenSharing); setIsMenuOpen(false); }}
              disabled={!currentUser.isHost}
              className={menuItem}
            >
              <Monitor className="h-4 w-4 text-slate-400" /> {isScreenSharing ? 'Dejar de compartir' : 'Compartir pantalla'}
            </button>
          )}
          <button type="button" onClick={() => { onOpenParticipants(); setIsMenuOpen(false); }} className={menuItem}>
            <Users className="h-4 w-4 text-slate-400" /> Participantes <span className="ml-auto text-xs text-slate-500">{participants.length}</span>
          </button>
          <button type="button" onClick={() => { onOpenHealthMonitor(); setIsMenuOpen(false); }} className={menuItem}>
            <Activity className={`h-4 w-4 ${latencyColor}`} /> Estado de conexión <span className="ml-auto font-mono text-[11px] text-slate-500">{latencyMs} ms</span>
          </button>
          <div className="my-1 border-t border-white/[0.07]" />
          <button type="button" onClick={() => { onLeaveRoom(); setIsMenuOpen(false); }} className={`${menuItem} text-rose-200 hover:bg-rose-400/10`}>
            <LogOut className="h-4 w-4" /> Salir de la sala
          </button>
        </div>
      )}
    </header>
  );
};
