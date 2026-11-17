import React, { useState } from 'react';
import {
  UserPlus,
  UserCheck,
  Send,
  Check,
  Trash2,
  Copy,
  Tv,
  Trophy,
  Film,
} from 'lucide-react';
import {
  RiffanArrowRightIcon,
  RiffanCloseIcon,
  RiffanPlayIcon,
  RiffanShareIcon,
  RiffanUsersIcon,
} from './ui/RiffanIcons';
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
import {
  buildLocalizedInviteMessage,
  buildWhatsAppShareUrl,
  copyTextSafely,
  shareOrCopyInvite,
} from '../utils/inviteShare';
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
  activeSportsMatch?: {
    homeTeam: string;
    awayTeam: string;
    homeLogo?: string;
    awayLogo?: string;
    competition?: string;
    score?: string;
  } | null;
  activeMovie?: {
    title: string;
    year?: string;
    poster?: string;
    rating?: string;
    season?: number;
    episode?: number;
  } | null;
  activeChannel?: {
    name: string;
    dial?: number;
    logoUrl?: string;
    network?: string;
  } | null;
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
  activeMediaPoster,
  activeMediaIsLive = false,
  activeSportsMatch,
  activeMovie,
  activeChannel,
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
  const [copiedRoomId, setCopiedRoomId] = useState(false);
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
    const ok = await copyTextSafely(`#${myFriendCode}`);
    if (ok) {
      setCopiedMyCode(true);
      setTimeout(() => setCopiedMyCode(false), 2000);
    }
  };

  const handleCopyRoomCode = async () => {
    triggerHaptic('success');
    const ok = await copyTextSafely(roomId);
    if (ok) {
      setCopiedRoomId(true);
      setTimeout(() => setCopiedRoomId(false), 2000);
    }
  };

  const handleCopyInviteLinkOnly = async () => {
    triggerHaptic('success');
    const ok = await copyTextSafely(`${localizedInviteText}\n${inviteUrl}`);
    if (ok) {
      setCopiedRoomLink(true);
      setTimeout(() => setCopiedRoomLink(false), 2200);
    }
  };

  const localizedInviteText = buildLocalizedInviteMessage({
    lang,
    roomName,
    userName: currentUser.name,
    activeMediaTitle,
    activeMediaIsLive,
    activeSportsMatch,
    activeMovie,
    activeChannel,
    activeMediaPoster,
  });

  const whatsAppShareHref = buildWhatsAppShareUrl({
    lang,
    roomName,
    inviteUrl,
    userName: currentUser.name,
    activeMediaTitle,
    activeMediaIsLive,
    activeSportsMatch,
    activeMovie,
    activeChannel,
    activeMediaPoster,
  });

  const handleShareOrCopyLink = async () => {
    triggerHaptic('success');
    const res = await shareOrCopyInvite({
      title: activeMediaTitle ? `${activeMediaTitle} — RiffanTV` : `${roomName} — RiffanTV`,
      text: localizedInviteText,
      url: inviteUrl,
    });
    if (res === 'copied') {
      setCopiedRoomLink(true);
      setTimeout(() => setCopiedRoomLink(false), 2200);
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
      icon={<RiffanUsersIcon size={20} />}
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

        {/* 0. Quick Room Link + Copy + WhatsApp Invite Bar right at the top */}
        <div className="p-3.5 rounded-2xl bg-[#9146FF]/10 border border-[#9146FF]/30 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#D8B4FE] block">
                {pickLang(lang, {
                  es: 'Invitar con enlace de sala',
                  ca: 'Convidar amb enllaç de sala',
                  en: 'Invite via room link',
                })}
              </span>
              <span className="text-xs font-mono text-zinc-300 truncate block">
                {roomName} · #{roomId}
              </span>
            </div>
            <button
              type="button"
              onClick={handleCopyRoomCode}
              className="min-h-8 px-2.5 rounded-xl bg-black/40 hover:bg-black/60 border border-white/10 text-[11px] font-mono font-bold text-white flex items-center gap-1 cursor-pointer shrink-0 transition-colors"
            >
              {copiedRoomId ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{pickLang(lang, { es: 'Copiado', ca: 'Copiat', en: 'Copied' })}</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-[#BF94FF]" />
                  <span>{roomId}</span>
                </>
              )}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleCopyInviteLinkOnly}
              className={`min-h-11 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all border ${
                copiedRoomLink
                  ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200'
                  : 'bg-[#9146FF] hover:bg-[#7C2AE8] border-[#9146FF] text-white'
              }`}
            >
              {copiedRoomLink ? (
                <>
                  <Check className="w-4 h-4 shrink-0" />
                  <span>{pickLang(lang, { es: 'Enlace copiado', ca: 'Enllaç copiat', en: 'Link copied' })}</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 shrink-0" />
                  <span>{pickLang(lang, { es: 'Copiar enlace', ca: 'Copiar enllaç', en: 'Copy link' })}</span>
                </>
              )}
            </button>

            <a
              href={whatsAppShareHref}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => triggerHaptic('light')}
              className="min-h-11 px-3 rounded-xl bg-[#25D366] hover:bg-[#20BD5A] text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95"
            >
              <span>WhatsApp</span>
              <RiffanArrowRightIcon size={14} tone="current" />
            </a>
          </div>
        </div>

        {/* 1. My code + Copy */}
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
                            <RiffanArrowRightIcon size={14} tone="current" />
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

        {/* 4. Rich Media Room Preview Card (Movie with poster, Channel with logo, or Partidazo Home vs Away) */}
        {(activeSportsMatch || activeChannel || activeMovie || activeMediaTitle) && (
          <div className="p-3.5 rounded-2xl bg-gradient-to-br from-[#161828] to-[#0D0F1A] border border-white/[0.12] space-y-2">
            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-zinc-400">
              <span>
                {pickLang(lang, {
                  es: 'En pantalla en esta sala',
                  ca: 'En pantalla en aquesta sala',
                  en: 'Now playing in room',
                })}
              </span>
              <span className="px-2 py-0.5 rounded-md bg-[#9146FF]/25 text-[#BF94FF] text-[10px] font-bold">
                {activeSportsMatch
                  ? pickLang(lang, { es: 'PARTIDAZO', ca: 'PARTIDÀS', en: 'BIG MATCH' })
                  : activeMediaIsLive || activeChannel
                  ? pickLang(lang, { es: 'EN DIRECTO', ca: 'EN DIRECTE', en: 'LIVE' })
                  : pickLang(lang, { es: 'CINE Y SERIES', ca: 'CINEMA I SÈRIES', en: 'CINEMA' })}
              </span>
            </div>

            {activeSportsMatch && activeSportsMatch.homeTeam && activeSportsMatch.awayTeam ? (
              <div className="p-3 rounded-xl bg-black/50 border border-white/10 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className="w-8 h-8 rounded-lg bg-white/10 p-1 flex items-center justify-center shrink-0">
                      {activeSportsMatch.homeLogo ? (
                        <img
                          src={activeSportsMatch.homeLogo}
                          alt={activeSportsMatch.homeTeam}
                          className="w-full h-full object-contain"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <span className="text-xs font-bold text-white">
                          {activeSportsMatch.homeTeam.slice(0, 3).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-bold text-white truncate">
                      {activeSportsMatch.homeTeam}
                    </span>
                  </div>

                  <div className="px-2.5 py-1 rounded-lg bg-[#9146FF]/30 text-[#D8B4FE] font-mono text-xs font-bold shrink-0">
                    {activeSportsMatch.score || 'VS'}
                  </div>

                  <div className="flex items-center justify-end gap-2 min-w-0 flex-1 text-right">
                    <span className="text-xs font-bold text-white truncate">
                      {activeSportsMatch.awayTeam}
                    </span>
                    <div className="w-8 h-8 rounded-lg bg-white/10 p-1 flex items-center justify-center shrink-0">
                      {activeSportsMatch.awayLogo ? (
                        <img
                          src={activeSportsMatch.awayLogo}
                          alt={activeSportsMatch.awayTeam}
                          className="w-full h-full object-contain"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <span className="text-xs font-bold text-white">
                          {activeSportsMatch.awayTeam.slice(0, 3).toUpperCase()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {activeSportsMatch.competition && (
                  <p className="text-[11px] text-zinc-400 text-center truncate pt-0.5">
                    {activeSportsMatch.competition}
                  </p>
                )}
              </div>
            ) : activeChannel || (activeMediaIsLive && activeMediaTitle) ? (
              <div className="flex items-center gap-3 p-2.5 rounded-xl bg-black/50 border border-white/10">
                <div className="w-12 h-10 rounded-lg bg-black/80 border border-white/10 p-1.5 flex items-center justify-center shrink-0">
                  {activeChannel?.logoUrl || activeMediaPoster ? (
                    <img
                      src={activeChannel?.logoUrl || activeMediaPoster}
                      alt={activeChannel?.name || activeMediaTitle}
                      className="max-w-full max-h-full object-contain"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <Tv className="w-5 h-5 text-[#BF94FF]" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-xs font-bold text-white truncate">
                    {activeChannel?.name || activeMediaTitle}
                  </h4>
                  <p className="text-[11px] text-zinc-400 truncate">
                    {activeChannel?.network || 'Emisión en vivo'}
                    {activeChannel?.dial ? ` · Dial ${activeChannel.dial}` : ''}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 p-2.5 rounded-xl bg-black/50 border border-white/10">
                <div className="w-10 h-14 rounded-lg overflow-hidden bg-black/60 border border-white/10 shrink-0">
                  {activeMovie?.poster || activeMediaPoster ? (
                    <img
                      src={activeMovie?.poster || activeMediaPoster}
                      alt={activeMovie?.title || activeMediaTitle}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-500">
                      <Film className="w-4 h-4" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-xs font-bold text-white truncate">
                    {activeMovie?.title || activeMediaTitle}
                  </h4>
                  <p className="text-[11px] text-zinc-400 truncate">
                    {activeMovie?.year ? `${activeMovie.year} ` : ''}
                    {activeMovie?.season && activeMovie?.episode
                      ? `· T${activeMovie.season}·E${activeMovie.episode} `
                      : ''}
                    {activeMovie?.rating ? `· ★ ${activeMovie.rating}` : ''}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 5. Dual Share buttons: Native Share / Copy & Direct WhatsApp */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <PrimaryButton fullWidth size="lg" onClick={handleShareOrCopyLink}>
            {copiedRoomLink ? (
              <>
                <Check className="w-4 h-4" />
                <span>
                  {pickLang(lang, {
                    es: 'Enlace copiado',
                    ca: 'Enllaç copiat',
                    en: 'Link copied',
                  })}
                </span>
              </>
            ) : (
              <>
                <RiffanShareIcon size={16} tone="current" />
                <span>
                  {pickLang(lang, {
                    es: 'Compartir sala',
                    ca: 'Compartir sala',
                    en: 'Share room',
                  })}
                </span>
              </>
            )}
          </PrimaryButton>

          <a
            href={whatsAppShareHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => triggerHaptic('light')}
            className="min-h-12 px-4 rounded-2xl bg-[#25D366] hover:bg-[#20BD5A] text-slate-950 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-[0_8px_24px_rgba(37,211,102,0.3)] transition-all cursor-pointer"
          >
            <span>WhatsApp</span>
            <RiffanArrowRightIcon size={16} tone="current" />
          </a>
        </div>
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

