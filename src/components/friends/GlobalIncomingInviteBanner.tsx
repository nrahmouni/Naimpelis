import React, { useState } from 'react';
import { UserPlus } from 'lucide-react';
import type {
  AppLanguage,
  IncomingFriendAddedNotice,
  IncomingRoomInvite,
} from '../../types';
import { triggerHaptic } from '../../utils/haptics';
import { pickLang } from '../../utils/i18n';
import { RiffanCloseIcon, RiffanPlayIcon } from '../ui/RiffanIcons';

interface GlobalIncomingInviteBannerProps {
  lang?: AppLanguage;
  invite: IncomingRoomInvite | null;
  friendAddedNotice: IncomingFriendAddedNotice | null;
  isAlreadyFriend?: boolean;
  onAcceptInvite: (invite: IncomingRoomInvite) => void;
  onDismissInvite: () => void;
  onAcceptFriendBack: (notice: IncomingFriendAddedNotice) => void;
  onDismissFriendNotice: () => void;
}

export const GlobalIncomingInviteBanner: React.FC<GlobalIncomingInviteBannerProps> = ({
  lang = 'es',
  invite,
  friendAddedNotice,
  isAlreadyFriend,
  onAcceptInvite,
  onDismissInvite,
  onAcceptFriendBack,
  onDismissFriendNotice,
}) => {
  const [savingBack, setSavingBack] = useState(false);

  React.useEffect(() => {
    setSavingBack(false);
    if (!friendAddedNotice) return;
    const timer = window.setTimeout(() => {
      onDismissFriendNotice();
    }, 6500);
    return () => window.clearTimeout(timer);
  }, [friendAddedNotice, onDismissFriendNotice]);

  React.useEffect(() => {
    if (!friendAddedNotice) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onDismissFriendNotice();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [friendAddedNotice, onDismissFriendNotice]);

  if (!invite && !friendAddedNotice) return null;

  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[240] w-[calc(100%-20px)] max-w-[440px] space-y-2 pointer-events-none">
      {invite && (
        <div className="pointer-events-auto p-3.5 rounded-3xl bg-[#141418]/96 backdrop-blur-2xl nc-specular-surface border border-[#9146FF]/55 shadow-[0_24px_70px_rgba(145,70,255,0.42)] flex flex-col gap-3 animate-fade-in">
          <div className="flex items-start justify-between gap-2.5">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="w-11 h-11 rounded-2xl flex items-center justify-center text-base font-bold text-white border border-white/20 shrink-0 shadow-md"
                style={{ backgroundColor: invite.fromUserColor || '#9146FF' }}
              >
                {invite.fromUserAvatar && invite.fromUserAvatar.length <= 2
                  ? invite.fromUserAvatar
                  : invite.fromUserName.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="px-2 py-0.5 rounded-full bg-[#9146FF]/25 text-[#BF94FF] text-[10px] font-bold uppercase tracking-wider">
                    {pickLang(lang, {
                      es: 'Invitación en Directo',
                      ca: 'Invitació en Directe',
                      en: 'Live Invite',
                    })}
                  </span>
                </div>
                <h4 className="text-sm font-bold text-white truncate mt-0.5">
                  {pickLang(lang, {
                    es: `${invite.fromUserName} te invita a su sala`,
                    ca: `${invite.fromUserName} et convida a la seva sala`,
                    en: `${invite.fromUserName} invited you to a room`,
                  })}
                </h4>
                <p className="text-xs text-zinc-300 truncate">
                  {invite.roomName}
                  {invite.mediaTitle ? ` · 🎬 ${invite.mediaTitle}` : ''}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onDismissInvite}
              aria-label={pickLang(lang, {
                es: 'Cerrar invitación',
                ca: 'Tancar invitació',
                en: 'Dismiss invite',
              })}
              className="w-9 h-9 rounded-full bg-white/[0.08] hover:bg-white/[0.16] text-zinc-300 hover:text-white flex items-center justify-center shrink-0 cursor-pointer"
            >
              <RiffanCloseIcon size={16} tone="current" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onAcceptInvite(invite)}
              className="min-h-10 px-4 rounded-2xl bg-[#9146FF] hover:bg-[#772CE8] active:scale-95 text-xs font-bold text-white flex items-center justify-center gap-1.5 shadow-[0_8px_24px_rgba(145,70,255,0.4)] cursor-pointer transition-all"
            >
              <RiffanPlayIcon size={14} tone="current" />
              <span>
                {pickLang(lang, {
                  es: 'Unirme a la sala',
                  ca: 'Unir-me a la sala',
                  en: 'Join room',
                })}
              </span>
            </button>

            <button
              type="button"
              onClick={onDismissInvite}
              className="min-h-10 px-4 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs font-semibold text-zinc-300 flex items-center justify-center cursor-pointer transition-colors"
            >
              {pickLang(lang, { es: 'Ahora no', ca: 'Ara no', en: 'Not now' })}
            </button>
          </div>
        </div>
      )}

      {friendAddedNotice && (
        <div
          role="status"
          onClick={() => {
            triggerHaptic('light');
            onDismissFriendNotice();
          }}
          className="pointer-events-auto p-3 rounded-2xl bg-[#141418]/98 backdrop-blur-2xl nc-specular-surface border border-emerald-500/45 shadow-[0_18px_50px_rgba(0,0,0,0.75)] flex items-center justify-between gap-2.5 animate-fade-in cursor-pointer"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
              style={{ backgroundColor: friendAddedNotice.fromUserColor || '#9146FF' }}
            >
              {friendAddedNotice.fromUserAvatar || '👋'}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-white truncate">
                {pickLang(lang, {
                  es: `${friendAddedNotice.fromUserName} te añadió como amigo`,
                  ca: `${friendAddedNotice.fromUserName} t’ha afegit com a amic`,
                  en: `${friendAddedNotice.fromUserName} added you as a friend`,
                })}
              </div>
              <div className="text-[11px] text-zinc-400 font-mono">
                {pickLang(lang, { es: 'Código', ca: 'Codi', en: 'Code' })} #
                {friendAddedNotice.fromFriendCode}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {!isAlreadyFriend && (
              <button
                type="button"
                disabled={savingBack}
                onClick={(e) => {
                  e.stopPropagation();
                  if (savingBack) return;
                  setSavingBack(true);
                  onAcceptFriendBack(friendAddedNotice);
                }}
                className="min-h-9 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-[11px] font-bold text-slate-950 flex items-center gap-1 cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>
                  + {pickLang(lang, { es: 'Guardar', ca: 'Desar', en: 'Save' })}
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                triggerHaptic('light');
                onDismissFriendNotice();
              }}
              aria-label={pickLang(lang, { es: 'Cerrar aviso', ca: 'Tancar avís', en: 'Dismiss' })}
              className="w-10 h-10 rounded-xl bg-white/[0.08] hover:bg-white/[0.16] border border-white/10 text-zinc-200 hover:text-white flex items-center justify-center cursor-pointer active:scale-95 transition-all"
            >
              <RiffanCloseIcon size={16} tone="current" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
