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
      <div className="h-10 px-3 rounded-xl bg-[#12141D] border border-white/10 flex items-center justify-center text-zinc-400 shrink-0">
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
      (lang === 'es' ? 'Mi Perfil' : 'Profile');

    return (
      <button
        type="button"
        onClick={() => {
          triggerHaptic('light');
          onOpenProfileHub();
        }}
        className={`min-h-[40px] ${
          compact ? 'px-2.5 sm:px-3' : 'px-3.5'
        } rounded-xl bg-[#12141D] hover:bg-[#191C28] active:scale-95 border ${
          user ? 'border-emerald-500/35' : 'border-white/15'
        } text-xs font-semibold text-white flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer transition-all`}
        title={
          lang === 'es'
            ? 'Abrir Mi Perfil (Historial, Favoritos y Salas)'
            : 'Open My Profile (History, Favorites & Rooms)'
        }
      >
        {user?.photoURL && !imgBroken ? (
          <img
            src={user.photoURL}
            alt={shortName}
            referrerPolicy="no-referrer"
            onError={() => setImgBroken(true)}
            className="w-6 h-6 rounded-full object-cover shrink-0"
          />
        ) : (
          <span className="w-6 h-6 rounded-lg bg-[#E11D48]/20 border border-[#E11D48]/40 text-white flex items-center justify-center text-[10px] font-display font-bold shrink-0">
            {displayName ? getMonogramInitials(displayName) : <UserIcon className="w-3.5 h-3.5" />}
          </span>
        )}
        <span className={compact ? 'hidden sm:inline max-w-[96px] truncate' : 'inline'}>
          {lang === 'es' ? 'Mi Perfil' : 'Profile'}
        </span>
        {user && <Cloud className="w-3.5 h-3.5 text-emerald-400 shrink-0 hidden md:block" />}
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
        className={`min-h-[40px] ${
          compact ? 'px-2.5 sm:px-3.5' : 'px-3.5'
        } rounded-xl bg-[#12141D] hover:bg-[#191C28] active:scale-95 border border-white/15 text-xs font-semibold text-white flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-all`}
        title={
          lang === 'es'
            ? 'Iniciar sesión con Google y entrar directo'
            : 'Sign in with Google and enter directly'
        }
      >
        {busy ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-[#38BDF8]" />
        ) : (
          <LogIn className="w-3.5 h-3.5 text-[#38BDF8]" />
        )}
        <span className={compact ? 'hidden sm:inline' : 'inline'}>
          {lang === 'es' ? 'Iniciar sesión' : 'Sign in'}
        </span>
      </button>
    );
  }

  const shortName =
    user.displayName?.split(' ')[0] ||
    user.email?.split('@')[0] ||
    (lang === 'es' ? 'Mi Cuenta' : 'Account');

  return (
    <button
      type="button"
      onClick={handleLoginClick}
      className="min-h-[40px] px-2.5 sm:px-3 rounded-xl bg-[#12141D] hover:bg-[#191C28] border border-emerald-500/35 text-xs font-semibold text-white flex items-center gap-2 cursor-pointer transition-colors"
    >
      <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center text-[11px] font-bold shrink-0">
        {shortName.slice(0, 1).toUpperCase()}
      </span>
      <span className="hidden md:inline max-w-[96px] truncate">{shortName}</span>
      <Cloud className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
    </button>
  );
};
