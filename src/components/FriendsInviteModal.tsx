import React, { useState } from 'react';
import {
  Users,
  UserPlus,
  UserCheck,
  Send,
  Share2,
  Check,
  X,
  Trash2,
  Play,
  ArrowRight,
  Copy,
} from 'lucide-react';
import {
  AppLanguage,
  IncomingFriendAddedNotice,
  IncomingRoomInvite,
  OnlineAppUser,
  Participant,
  SavedFriend,
} from '../types';
import { deriveFriendCode } from '../utils/storage';
import { buildShortInviteUrl } from '../utils/shortLink';
import { triggerHaptic } from '../utils/haptics';
import { pickLang } from '../utils/i18n';
import { buildLocalizedInviteMessage } from '../utils/inviteShare';
import { BottomSheet, PrimaryButton, SecondaryButton } from './ui/DesignSystem';

interface FriendsInviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: AppLanguage;
  currentUser: Participant;
  roomId: string;
  roomName: string;
  activeMediaTitle?: string;
  activeMediaPoster?: string;
  activeMediaIsLive?: boolean;
  participants: Participant[];
  savedFriends: SavedFriend[];
  onlineUsers: OnlineAppUser[];
  inviteSentFeedback?: string | null;
  onAddFriend: (entry: {
    friendId: string;
    name: string;
    avatar: string;
    color: string;
    friendCode?: string;
  }) => void;
  onRemoveFriend: (friendId: string) => void;
  onSendDirectRoomInvite: (friend: {
    friendId: string;
    name: string;
    friendCode?: string;
  }) => void;
  onJoinFriendRoom?: (targetRoomId: string, targetRoomName?: string) => void;
}

export const FriendsInviteModal: React.FC<FriendsInviteModalProps> = ({
  isOpen,
  onClose,
  lang,
  currentUser,
  roomId,
  roomName,
  activeMediaTitle,
  activeMediaIsLive = false,
  participants,
  savedFriends,
  onlineUsers,
  inviteSentFeedback,
  onAddFriend,
  onRemoveFriend,
  onSendDirectRoomInvite,
  onJoinFriendRoom,
}) => {
  const [manualNameInput, setManualNameInput] = useState('');
  const [manualCodeInput, setManualCodeInput] = useState('');
  const [copiedMyCode, setCopiedMyCode] = useState(false);
  const [copiedRoomLink, setCopiedRoomLink] = useState(false);
  const [invitedIds, setInvitedIds] = useState<Record<string, boolean>>({});

  const myFriendCode = deriveFriendCode(currentUser.id);
  const inviteUrl = buildShortInviteUrl(roomId, false);

  const isFriendSaved = (userId: string, friendCode?: string) => {
    const codeUpper = (friendCode || deriveFriendCode(userId)).toUpperCase();
    return savedFriends.some(
      (f) =>
        f.friendId === userId ||
        (f.friendCode && f.friendCode.toUpperCase() === codeUpper)
    );
  };

  const findOnlineStateForFriend = (friend: SavedFriend): OnlineAppUser | undefined => {
    const codeUpper = (friend.friendCode || '').toUpperCase();
    const nameLower = friend.name.trim().toLowerCase();
    return onlineUsers.find(
      (u) =>
        u.userId !== currentUser.id &&
        (u.userId === friend.friendId ||
          (codeUpper && u.friendCode.toUpperCase() === codeUpper) ||
          u.name.trim().toLowerCase() === nameLower)
    );
  };

  const discoverableUsers = (() => {
    const map = new Map<
      string,
      {
        userId: string;
        name: string;
        avatar: string;
        color: string;
        friendCode: string;
        inMyRoom: boolean;
        roomName?: string;
      }
    >();

    participants.forEach((p) => {
      if (p.id === currentUser.id || p.name.includes('(TV)') || p.avatar === '📺') {
        return;
      }
      map.set(p.id, {
        userId: p.id,
        name: p.name,
        avatar: p.avatar || '🍿',
        color: p.color || '#9146FF',
        friendCode: deriveFriendCode(p.id),
        inMyRoom: true,
        roomName,
      });
    });

    onlineUsers.forEach((u) => {
      if (u.userId === currentUser.id || map.has(u.userId)) return;
      map.set(u.userId, {
        userId: u.userId,
        name: u.name,
        avatar: u.avatar || '🍿',
        color: u.color || '#9146FF',
        friendCode: u.friendCode || deriveFriendCode(u.userId),
        inMyRoom: u.roomId === roomId,
        roomName: u.roomName,
      });
    });

    return Array.from(map.values()).filter((u) => !isFriendSaved(u.userId, u.friendCode));
  })();

  const handleCopyMyCode = async () => {
    triggerHaptic('success');
    try {
      await navigator.clipboard.writeText(`#${myFriendCode}`);
      setCopiedMyCode(true);
      setTimeout(() => setCopiedMyCode(false), 2000);
    } catch {
      // ignore
    }
  };

  const localizedInviteText = buildLocalizedInviteMessage({
    lang,
    roomName,
    userName: currentUser.name,
    activeMediaTitle,
    activeMediaIsLive,
  });

  const handleShareOrCopyLink = async () => {
    triggerHaptic('success');
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: activeMediaTitle ? `${activeMediaTitle} — RiffanTV` : `${roomName} — RiffanTV`,
          text: localizedInviteText,
          url: inviteUrl,
        });
        return;
      } catch {
        // fallback to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(`${localizedInviteText}\n${inviteUrl}`);
      setCopiedRoomLink(true);
      setTimeout(() => setCopiedRoomLink(false), 2200);
    } catch {
      // ignore
    }
  };

  const handleManualAddFriend = (e: React.FormEvent) => {
    e.preventDefault();
    const rawName = manualNameInput.trim();
    const rawCode = manualCodeInput.trim().replace(/^#/, '').toUpperCase();
    if (!rawName && !rawCode) return;

    const matchedOnline = onlineUsers.find(
      (u) =>
        (rawCode && u.friendCode.toUpperCase() === rawCode) ||
        (rawName && u.name.trim().toLowerCase() === rawName.toLowerCase())
    );

    if (matchedOnline) {
      onAddFriend({
        friendId: matchedOnline.userId,
        name: matchedOnline.name,
        avatar: matchedOnline.avatar,
        color: matchedOnline.color,
        friendCode: matchedOnline.friendCode,
      });
    } else {
      const generatedId = rawCode
        ? `code-${rawCode}`
        : `friend-${rawName.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
      onAddFriend({
        friendId: generatedId,
        name:
          rawName ||
          `${pickLang(lang, { es: 'Amigo', ca: 'Amic', en: 'Friend' })} #${rawCode}`,
        avatar: '🎬',
        color: '#9146FF',
        friendCode: rawCode || deriveFriendCode(generatedId),
      });
    }

    triggerHaptic('success');
    setManualNameInput('');
    setManualCodeInput('');
  };

  const handleTriggerInvite = (friend: {
    friendId: string;
    name: string;
    friendCode?: string;
  }) => {
    triggerHaptic('success');
    setInvitedIds((prev) => ({ ...prev, [friend.friendId]: true }));
    onSendDirectRoomInvite(friend);
    setTimeout(() => {
      setInvitedIds((prev) => ({ ...prev, [friend.friendId]: false }));
    }, 3000);
  };

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      lang={lang}
      maxWidth="sm:max-w-lg"
      icon={<Users className="w-5 h-5" />}
      title={pickLang(lang, {
        es: 'Amigos',
        ca: 'Amics',
        en: 'Friends',
      })}
      subtitle={pickLang(lang, {
        es: 'Tu código e invitaciones a la sala',
        ca: 'El teu codi i invitacions a la sala',
        en: 'Your code and room invites',
      })}
    >
      <div className="space-y-4">
        {inviteSentFeedback && (
          <div className="p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/35 text-xs font-semibold text-emerald-200 flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{inviteSentFeedback}</span>
          </div>
        )}

        {/* 1. My code + Copy at top */}
        <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="text-xs text-zinc-400 block">
              {pickLang(lang, {
                es: 'Mi código',
                ca: 'El meu codi',
                en: 'My code',
              })}
            </span>
            <span className="font-mono text-base font-bold text-white">
              #{myFriendCode}
            </span>
          </div>

          <SecondaryButton onClick={handleCopyMyCode}>
            {copiedMyCode ? (
              <>
                <Check className="w-4 h-4 text-emerald-400" />
                <span>{pickLang(lang, { es: 'Copiado', ca: 'Copiat', en: 'Copied' })}</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-[#BF94FF]" />
                <span>{pickLang(lang, { es: 'Copiar', ca: 'Copiar', en: 'Copy' })}</span>
              </>
            )}
          </SecondaryButton>
        </div>

        {/* 2. Friends list */}
        <div className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
            {pickLang(lang, {
              es: 'Lista de amigos',
              ca: 'Llista d’amics',
              en: 'Friends list',
            })}
          </h3>

          {savedFriends.length === 0 ? (
            <p className="py-4 text-center text-sm text-zinc-400">
              {pickLang(lang, {
                es: 'Aún no tienes amigos guardados.',
                ca: 'Encara no tens amics desats.',
                en: 'No saved friends yet.',
              })}
            </p>
          ) : (
            <div className="space-y-2">
              {savedFriends.map((friend) => {
                const onlineInfo = findOnlineStateForFriend(friend);
                const isInSameRoom =
                  Boolean(onlineInfo && onlineInfo.roomId === roomId) ||
                  participants.some(
                    (p) =>
                      p.id === friend.friendId ||
                      p.name.trim().toLowerCase() === friend.name.trim().toLowerCase()
                  );
                const justInvited = Boolean(invitedIds[friend.friendId]);

                return (
                  <div
                    key={friend.friendId}
                    className="p-3 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-between gap-2.5"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative shrink-0">
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white border border-white/15"
                          style={{ backgroundColor: friend.color || '#9146FF' }}
                        >
                          {friend.avatar && friend.avatar.length <= 2
                            ? friend.avatar
                            : friend.name.slice(0, 2).toUpperCase()}
                        </div>
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#141418] ${
                            onlineInfo || isInSameRoom ? 'bg-emerald-400' : 'bg-zinc-600'
                          }`}
                        />
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-bold text-white truncate">
                            {friend.name}
                          </span>
                          {friend.friendCode && (
                            <span className="text-xs font-mono text-zinc-400 shrink-0">
                              #{friend.friendCode}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-zinc-400 truncate">
                          {isInSameRoom
                            ? pickLang(lang, {
                                es: 'En tu sala',
                                ca: 'A la teva sala',
                                en: 'In your room',
                              })
                            : onlineInfo
                            ? pickLang(lang, {
                                es: 'En línea',
                                ca: 'En línia',
                                en: 'Online',
                              })
                            : pickLang(lang, {
                                es: 'Desconectado',
                                ca: 'Desconnectat',
                                en: 'Offline',
                              })}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {!isInSameRoom && (
                        <button
                          type="button"
                          onClick={() =>
                            handleTriggerInvite({
                              friendId: onlineInfo?.userId || friend.friendId,
                              name: friend.name,
                              friendCode: friend.friendCode,
                            })
                          }
                          className={`min-h-12 px-3.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                            justInvited
                              ? 'bg-emerald-500 text-white'
                              : 'bg-[#9146FF] hover:bg-[#7C2AE8] text-white'
                          }`}
                        >
                          {justInvited ? (
                            <>
                              <Check className="w-4 h-4" />
                              <span>{pickLang(lang, { es: 'Enviada', ca: 'Enviada', en: 'Sent' })}</span>
                            </>
                          ) : (
                            <>
                              <Send className="w-4 h-4" />
                              <span>{pickLang(lang, { es: 'Invitar', ca: 'Convidar', en: 'Invite' })}</span>
                            </>
                          )}
                        </button>
                      )}

                      {!isInSameRoom &&
                        onlineInfo?.roomId &&
                        onlineInfo.roomId !== roomId &&
                        onJoinFriendRoom && (
                          <button
                            type="button"
                            onClick={() => {
                              triggerHaptic('light');
                              onJoinFriendRoom(onlineInfo.roomId!, onlineInfo.roomName);
                              onClose();
                            }}
                            className="min-h-12 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs font-semibold text-zinc-200 flex items-center gap-1 cursor-pointer"
                          >
                            <span>{pickLang(lang, { es: 'Unirme', ca: 'Unir-me', en: 'Join' })}</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        )}

                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          onRemoveFriend(friend.friendId);
                        }}
                        aria-label={pickLang(lang, {
                          es: 'Eliminar amigo',
                          ca: 'Eliminar amic',
                          en: 'Remove friend',
                        })}
                        className="w-12 h-12 rounded-xl hover:bg-rose-500/20 text-zinc-400 hover:text-rose-300 flex items-center justify-center cursor-pointer transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {discoverableUsers.length > 0 && (
            <div className="pt-2 space-y-2">
              {discoverableUsers.slice(0, 4).map((u) => (
                <div
                  key={u.userId}
                  className="p-2.5 rounded-2xl bg-white/[0.02] border border-white/[0.07] flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                      style={{ backgroundColor: u.color || '#9146FF' }}
                    >
                      {u.avatar && u.avatar.length <= 2
                        ? u.avatar
                        : u.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white truncate">
                        {u.name} <span className="font-mono text-zinc-400">#{u.friendCode}</span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('success');
                      onAddFriend({
                        friendId: u.userId,
                        name: u.name,
                        avatar: u.avatar,
                        color: u.color,
                        friendCode: u.friendCode,
                      });
                    }}
                    className="min-h-12 px-3 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] border border-white/10 text-xs font-semibold text-white flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    <UserCheck className="w-4 h-4 text-[#BF94FF]" />
                    <span>{pickLang(lang, { es: 'Añadir', ca: 'Afegir', en: 'Add' })}</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 3. Single Add Friend field */}
        <form onSubmit={handleManualAddFriend} className="flex items-center gap-2">
          <input
            type="text"
            value={manualNameInput}
            onChange={(e) => {
              const val = e.target.value;
              setManualNameInput(val);
              const hashMatch = val.match(/#([A-Za-z0-9]{4,10})/);
              if (hashMatch) {
                setManualCodeInput(hashMatch[1].toUpperCase());
              } else if (val.trim().startsWith('#')) {
                setManualCodeInput(val.trim().slice(1).toUpperCase());
              } else {
                setManualCodeInput('');
              }
            }}
            placeholder={pickLang(lang, {
              es: 'Añadir amigo (nombre o #código)',
              ca: 'Afegir amic (nom o #codi)',
              en: 'Add friend (name or #code)',
            })}
            className="flex-1 min-h-12 px-3.5 rounded-xl bg-black/45 border border-white/10 focus:border-[#9146FF] text-sm text-white placeholder:text-zinc-500 outline-none"
          />
          <button
            type="submit"
            disabled={!manualNameInput.trim() && !manualCodeInput.trim()}
            className="min-h-12 px-4 rounded-xl bg-[#9146FF] hover:bg-[#7C2AE8] disabled:opacity-35 text-sm font-bold text-white flex items-center justify-center gap-1.5 cursor-pointer shrink-0 transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            <span>{pickLang(lang, { es: 'Añadir', ca: 'Afegir', en: 'Add' })}</span>
          </button>
        </form>

        {/* 4. Single Share button */}
        <PrimaryButton fullWidth size="lg" onClick={handleShareOrCopyLink}>
          {copiedRoomLink ? (
            <>
              <Check className="w-4 h-4" />
              <span>{pickLang(lang, { es: 'Enlace copiado', ca: 'Enllaç copiat', en: 'Link copied' })}</span>
            </>
          ) : (
            <>
              <Share2 className="w-4 h-4" />
              <span>{pickLang(lang, { es: 'Compartir', ca: 'Compartir', en: 'Share' })}</span>
            </>
          )}
        </PrimaryButton>
      </div>
    </BottomSheet>
  );
};

// ============================================================================
// GLOBAL FLOATING IN-APP ROOM INVITATION & FRIEND REQUEST BANNER
// ============================================================================
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
  if (!invite && !friendAddedNotice) return null;

  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[95] w-[calc(100%-20px)] max-w-[440px] space-y-2 pointer-events-none">
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
              className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.14] text-zinc-400 hover:text-white flex items-center justify-center shrink-0 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onAcceptInvite(invite)}
              className="min-h-10 px-4 rounded-2xl bg-[#9146FF] hover:bg-[#772CE8] active:scale-95 text-xs font-bold text-white flex items-center justify-center gap-1.5 shadow-[0_8px_24px_rgba(145,70,255,0.4)] cursor-pointer transition-all"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
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
        <div className="pointer-events-auto p-3 rounded-2xl bg-[#141418]/96 backdrop-blur-2xl nc-specular-surface border border-emerald-500/45 shadow-2xl flex items-center justify-between gap-2.5 animate-fade-in">
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
                onClick={() => onAcceptFriendBack(friendAddedNotice)}
                className="min-h-8 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-[11px] font-bold text-slate-950 flex items-center gap-1 cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>
                  + {pickLang(lang, { es: 'Guardar', ca: 'Desar', en: 'Save' })}
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={onDismissFriendNotice}
              aria-label={pickLang(lang, { es: 'Cerrar aviso', ca: 'Tancar avís', en: 'Dismiss' })}
              className="w-7 h-7 rounded-lg bg-white/5 text-zinc-400 hover:text-white flex items-center justify-center cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

