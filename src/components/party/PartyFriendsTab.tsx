import React from 'react';
import { Check, Send, Share2, UserPlus } from 'lucide-react';
import type { AppLanguage, OnlineAppUser, Participant, SavedFriend } from '../../types';
import { UI_COPY, pickLang } from '../../utils/i18n';
import { deriveFriendCode } from '../../utils/storage';
import { PrimaryButton, SecondaryButton } from '../ui/DesignSystem';
import { getParticipantInitials } from './PartyChatTab';

interface PartyFriendsTabProps {
  lang: AppLanguage;
  currentUser: Participant;
  participants: Participant[];
  savedFriends: SavedFriend[];
  onlineUsers: OnlineAppUser[];
  activeMediaTitle: string;
  isRoomPlaying: boolean;
  copiedLink: boolean;
  inviteSentFeedback?: string | null;
  onAddFriend?: (entry: {
    friendId: string;
    name: string;
    avatar: string;
    color: string;
    friendCode?: string;
  }) => void;
  onOpenFriendsModal?: () => void;
  onShareInvite: () => void;
  onSendDirectRoomInvite?: (friend: {
    friendId: string;
    name: string;
    friendCode?: string;
  }) => void;
}

export const PartyFriendsTab: React.FC<PartyFriendsTabProps> = ({
  lang,
  currentUser,
  participants,
  savedFriends,
  onlineUsers,
  activeMediaTitle,
  isRoomPlaying,
  copiedLink,
  inviteSentFeedback,
  onAddFriend,
  onOpenFriendsModal,
  onShareInvite,
  onSendDirectRoomInvite,
}) => {
  const t = UI_COPY[lang];

  return (
    <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-4 space-y-5 custom-scrollbar">
      {inviteSentFeedback && (
        <div className="p-3 rounded-2xl bg-emerald-500/15 border border-emerald-400/35 text-emerald-200 text-xs font-semibold flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{inviteSentFeedback}</span>
        </div>
      )}

      {/* Participants in current room */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
            {pickLang(lang, {
              es: `Conectados en sala (${participants.length})`,
              ca: `Connectats a la sala (${participants.length})`,
              en: `In room now (${participants.length})`,
            })}
          </span>
          <span className="text-xs text-[#00F593] font-semibold flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#00F593] animate-pulse" />
            {pickLang(lang, { es: 'En vivo', ca: 'En directe', en: 'Live' })}
          </span>
        </div>

        <div className="space-y-2">
          {participants.map((p) => {
            const isSelf = p.id === currentUser.id;
            const isTvDevice = p.name.includes('(TV)') || p.avatar === '📺';
            const pCode = deriveFriendCode(p.id);
            const alreadyFriend = savedFriends.some(
              (f) => f.friendId === p.id || f.friendCode === pCode
            );
            return (
              <div
                key={p.id}
                className="flex items-center justify-between p-3 rounded-2xl bg-white/[0.03] border border-white/[0.06] gap-2"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div
                    className="w-10 h-10 rounded-2xl flex items-center justify-center text-xs font-bold text-white border border-white/15 shrink-0"
                    style={{ backgroundColor: p.color || '#9146FF' }}
                  >
                    {isTvDevice ? '📺' : getParticipantInitials(p.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-white break-words leading-snug">
                      {p.name} {isSelf ? `(${t.you})` : ''}
                    </p>
                    <p className="text-[11px] text-emerald-400 truncate">
                      {activeMediaTitle
                        ? isRoomPlaying
                          ? `▶ ${activeMediaTitle}`
                          : `⏸ ${activeMediaTitle}`
                        : pickLang(lang, {
                            es: 'En línea en la sala',
                            ca: 'En línia a la sala',
                            en: 'Online in room',
                          })}
                    </p>
                  </div>
                </div>

                {!isSelf && !isTvDevice && onAddFriend && (
                  alreadyFriend ? (
                    <span className="px-2.5 py-1 rounded-xl bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 text-xs font-bold flex items-center gap-1 shrink-0">
                      <Check className="w-3.5 h-3.5" />
                      <span>{pickLang(lang, { es: 'Amigo', ca: 'Amic', en: 'Friend' })}</span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        onAddFriend({
                          friendId: p.id,
                          name: p.name,
                          avatar: p.avatar,
                          color: p.color,
                          friendCode: pCode,
                        })
                      }
                      className="min-h-9 px-3 rounded-xl bg-[#9146FF] hover:bg-[#7C2AE8] text-xs font-bold text-white flex items-center gap-1 cursor-pointer active:scale-95 transition-all shrink-0"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>{pickLang(lang, { es: 'Añadir', ca: 'Afegir', en: 'Add' })}</span>
                    </button>
                  )
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Saved Friends */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
            {pickLang(lang, {
              es: `Mis Amigos (${savedFriends.length})`,
              ca: `Els meus Amics (${savedFriends.length})`,
              en: `My Friends (${savedFriends.length})`,
            })}
          </span>
          {onOpenFriendsModal && (
            <button
              type="button"
              onClick={onOpenFriendsModal}
              className="text-xs font-semibold text-[#BF94FF] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>{pickLang(lang, { es: 'Añadir amigo', ca: 'Afegir amic', en: 'Add friend' })}</span>
            </button>
          )}
        </div>

        {savedFriends.length === 0 ? (
          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.07] space-y-3">
            <p className="text-xs text-zinc-300 leading-relaxed">
              {pickLang(lang, {
                es: 'Añade amigos por su código o comparte tu sala con 1 toque para ver juntos en tiempo real.',
                ca: 'Afegeix amics pel seu codi o comparteix la sala amb 1 toc per veure junts en temps real.',
                en: 'Add friends by code or share your room in 1 tap to watch together live.',
              })}
            </p>
            <div className="flex flex-wrap gap-2">
              {onOpenFriendsModal && (
                <PrimaryButton onClick={onOpenFriendsModal} className="flex-1">
                  <UserPlus className="w-4 h-4 shrink-0" />
                  <span>{pickLang(lang, { es: 'Añadir por código', ca: 'Afegir per codi', en: 'Add by code' })}</span>
                </PrimaryButton>
              )}
              <SecondaryButton onClick={onShareInvite} className="flex-1">
                <Share2 className="w-4 h-4 text-[#BF94FF] shrink-0" />
                <span>{copiedLink ? t.copied : pickLang(lang, { es: 'Copiar enlace', ca: 'Copiar enllaç', en: 'Copy link' })}</span>
              </SecondaryButton>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {savedFriends.map((friend) => {
              const inCurrentRoom = participants.some(
                (p) =>
                  p.id === friend.friendId ||
                  deriveFriendCode(p.id) === friend.friendCode
              );
              const liveStatus = onlineUsers.find(
                (u) =>
                  u.userId === friend.friendId ||
                  u.friendCode === friend.friendCode
              );
              const isOnline = Boolean(liveStatus) || inCurrentRoom;

              return (
                <div
                  key={friend.friendId}
                  className="flex items-center justify-between p-3 rounded-2xl bg-white/[0.03] border border-white/[0.06] gap-2"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative shrink-0">
                      <div
                        className="w-10 h-10 rounded-2xl flex items-center justify-center text-xs font-bold text-white border border-white/15"
                        style={{ backgroundColor: friend.color || '#9146FF' }}
                      >
                        {getParticipantInitials(friend.name)}
                      </div>
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#18181B] ${
                          isOnline ? 'bg-emerald-400' : 'bg-zinc-600'
                        }`}
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-white truncate">{friend.name}</div>
                      <div className="text-xs truncate mt-0.5">
                        {inCurrentRoom ? (
                          <span className="text-emerald-400 font-semibold">
                            {pickLang(lang, {
                              es: 'Ya está en tu sala',
                              ca: 'Ja és a la teva sala',
                              en: 'Already in your room',
                            })}
                          </span>
                        ) : isOnline ? (
                          <span className="text-emerald-400 font-medium">
                            {pickLang(lang, {
                              es: 'En línea en la app',
                              ca: "En línia a l'app",
                              en: 'Online in app',
                            })}
                          </span>
                        ) : (
                          <span className="text-zinc-500">
                            {pickLang(lang, {
                              es: `Desconectado · #${friend.friendCode}`,
                              ca: `Desconnectat · #${friend.friendCode}`,
                              en: `Offline · #${friend.friendCode}`,
                            })}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {!inCurrentRoom && onSendDirectRoomInvite && (
                    <button
                      type="button"
                      onClick={() =>
                        onSendDirectRoomInvite({
                          friendId: friend.friendId,
                          name: friend.name,
                          friendCode: friend.friendCode,
                        })
                      }
                      className="min-h-9 px-3.5 rounded-xl bg-[#9146FF] hover:bg-[#772CE8] text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all shrink-0"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{pickLang(lang, { es: 'Invitar', ca: 'Convidar', en: 'Invite' })}</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
