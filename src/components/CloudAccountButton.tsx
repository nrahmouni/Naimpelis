import React, { useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import { Cloud, Loader2, LogIn, User as UserIcon } from 'lucide-react';
import { AppLanguage } from '../types';
import { triggerHaptic } from '../utils/haptics';
import { getMonogramInitials } from './MobileViewportGuard';

interface CloudAccountButtonProps {
  user: User | null;
  authLoading: boolean;
  lang: AppLanguage;
  displayName?: string;
  compact?: boolean;
  isDesktop?: boolean;
  onSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onOpenProfileHub?: () => void;
}

export const CloudAccountButton: React.FC<CloudAccountButtonProps> = ({
  user,
  authLoading,
  lang,
  displayName,
  compact = false,
  isDesktop = false,
  onSignIn,
  onOpenProfileHub,
}) => {
  const [busy, setBusy] = useState(false);
  const [imgBroken, setImgBroken] = useState(false);

  useEffect(() => {
    setImgBroken(false);
  }, [user?.photoURL]);

  const handleLoginClick = async () => {
    if (busy || authLoading) return;
    triggerHaptic('medium');
    setBusy(true);
    try {
      await onSignIn();
    } finally {
      setBusy(false);
    }
  };

  if (authLoading) {
    return (
      <div className="h-10 px-3 rounded-xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-zinc-400 shrink-0">
        <Loader2 className="w-4 h-4 animate-spin" />
      </div>
    );
  }

  // Inside the Room (when onOpenProfileHub is provided): clicking opens Mi Perfil Hub!
  if (onOpenProfileHub) {
    const shortName =
      displayName ||
      user?.displayName?.split(' ')[0] ||
      user?.email?.split('@')[0] ||
      (lang === 'es' ? 'Perfil' : 'Profile');

    return (
      <button
        type="button"
        onClick={() => {
          triggerHaptic('light');
          onOpenProfileHub();
        }}
        className={`min-h-[36px] ${
          compact && !isDesktop ? 'px-2' : 'px-2.5'
        } rounded-xl bg-white/[0.06] hover:bg-white/[0.12] active:scale-95 border border-white/[0.1] text-xs font-semibold text-white flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer transition-all`}
        title={
          lang === 'es'
            ? 'Abrir Mi Perfil (Historial, Favoritos, Salas y Vista)'
            : 'Open My Profile (History, Favorites, Rooms & View)'
        }
      >
        {user?.photoURL && !imgBroken ? (
          <img
            src={user.photoURL}
            alt={shortName}
            referrerPolicy="no-referrer"
            onError={() => setImgBroken(true)}
            className="w-6 h-6 rounded-full object-cover shrink-0 ring-2 ring-[#9146FF]/45"
          />
        ) : (
          <span className="w-6 h-6 rounded-full bg-gradient-to-br from-[#9E5CFF] to-[#7C2AE8] text-white flex items-center justify-center text-[0.65rem] font-display font-bold shrink-0 shadow-[0_0_12px_rgba(145,70,255,0.4)]">
            {displayName ? getMonogramInitials(displayName) : <UserIcon className="w-3.5 h-3.5" />}
          </span>
        )}
        <span className={compact && !isDesktop ? 'hidden' : 'inline max-w-24 truncate'}>
          {lang === 'es' ? 'Perfil' : 'Profile'}
        </span>
        {user && (
          <span
            className={`w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 shadow-[0_0_6px_#34d399] ${
              compact && !isDesktop ? 'hidden' : 'block'
            }`}
          />
        )}
      </button>
    );
  }

  // On LobbyScreen when not signed in: 1-tap Google Sign-In
  if (!user) {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={handleLoginClick}
        className={`min-h-[32px] ${
          compact && !isDesktop ? 'px-2' : 'px-3'
        } rounded-lg bg-white/[0.05] hover:bg-white/[0.1] active:scale-95 border border-white/[0.09] text-xs font-semibold text-zinc-100 flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-all`}
        title={
          lang === 'es'
            ? 'Iniciar sesión con Google y sincronizar en la nube'
            : 'Sign in with Google and sync to cloud'
        }
      >
        {busy ? (
          <Loader2 className="w-4 h-4 animate-spin text-white" />
        ) : (
          <LogIn className="w-4 h-4 text-zinc-300" />
        )}
        <span className={compact && !isDesktop ? 'hidden' : 'inline'}>
          {lang === 'es' ? 'Acceder' : 'Sign in'}
        </span>
      </button>
    );
  }

  const shortName =
    user.displayName?.split(' ')[0] ||
    user.email?.split('@')[0] ||
    (lang === 'es' ? 'Cuenta' : 'Account');

  return (
    <button
      type="button"
      onClick={handleLoginClick}
      className="min-h-[32px] px-2 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] text-xs font-semibold text-white flex items-center gap-1.5 cursor-pointer transition-colors shrink-0"
    >
      <span className="w-6 h-6 rounded-full bg-[#9146FF]/20 border border-[#9146FF]/45 text-white flex items-center justify-center text-xs font-bold shrink-0">
        {shortName.slice(0, 1).toUpperCase()}
      </span>
      {isDesktop && <span className="max-w-24 truncate">{shortName}</span>}
      <Cloud className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
    </button>
  );
};
