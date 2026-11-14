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
  Sparkles,
  Copy,
  QrCode,
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

interface FriendsInviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: AppLanguage;
  currentUser: Participant;
  roomId: string;
  roomName: string;
  activeMediaTitle?: string;
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
  const [showQr, setShowQr] = useState(false);
  const [invitedIds, setInvitedIds] = useState<Record<string, boolean>>({});

  if (!isOpen) return null;

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

  // Discoverable users: in current room or online in the app right now (excluding self and TVs)
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

    return Array.from(map.values());
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

  const handleShareOrCopyLink = async () => {
    triggerHaptic('success');
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `${roomName} — NAIM CINE`,
          text: `Únete a mi sala en directo (${roomName}):`,
          url: inviteUrl,
        });
        return;
      } catch {
        // fallback to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(inviteUrl);
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

    // Check if there is an online user matching that code or name
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
      const generatedId = rawCode ? `code-${rawCode}` : `friend-${rawName.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
      onAddFriend({
        friendId: generatedId,
        name: rawName || `Amigo #${rawCode}`,
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
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Amigos e Invitaciones Directas"
      onClick={onClose}
      className="fixed inset-0 z-[75] bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center sm:p-4 animate-fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-[540px] max-h-[90dvh] rounded-t-3xl sm:rounded-3xl bg-[#141418]/96 backdrop-blur-2xl nc-specular-surface border-t sm:border border-white/[0.12] shadow-[0_30px_100px_rgba(0,0,0,0.95)] flex flex-col overflow-hidden animate-sheet-up"
      >
        {/* Mobile grab handle */}
        <div className="sm:hidden pt-2.5 flex justify-center">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="px-5 pt-4 pb-3.5 border-b border-white/[0.08] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-[#9146FF]/18 border border-[#9146FF]/45 flex items-center justify-center text-[#BF94FF] shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display font-bold text-base sm:text-lg text-white truncate">
                {lang === 'es' ? 'Amigos e Invitación Directa' : 'Friends & Direct Invite'}
              </h2>
              <p className="text-xs text-zinc-400 truncate">
                {lang === 'es'
                  ? `Invita sin salir de la app a ${roomName}`
                  : `Invite friends directly to ${roomName}`}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="w-9 h-9 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-zinc-300 hover:text-white flex items-center justify-center cursor-pointer transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5 custom-scrollbar">
          {/* Live Feedback Banner */}
          {inviteSentFeedback && (
            <div className="p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/35 text-xs font-semibold text-emerald-200 flex items-center gap-2 animate-fade-in">
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{inviteSentFeedback}</span>
            </div>
          )}

          {/* 1. My Friend Code + Quick External Link Card */}
          <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                  {lang === 'es' ? 'Tu perfil y código de amigo' : 'Your Friend Code'}
                </span>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-sm font-bold text-white">{currentUser.name}</span>
                  <span className="px-2 py-0.5 rounded-lg bg-[#9146FF]/20 border border-[#9146FF]/45 font-mono text-xs font-bold text-[#BF94FF]">
                    #{myFriendCode}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleCopyMyCode}
                  className="min-h-9 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs font-semibold text-zinc-200 flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedMyCode ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Copiado</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Copiar #{myFriendCode}</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setShowQr((v) => !v)}
                  className="w-9 h-9 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-zinc-300 flex items-center justify-center cursor-pointer"
                  title="Mostrar código QR de la sala"
                >
                  <QrCode className="w-4 h-4" />
                </button>
              </div>
            </div>

            {showQr && (
              <div className="pt-2 pb-1 flex flex-col items-center gap-2 border-t border-white/[0.07]">
                <div className="p-2.5 rounded-2xl bg-white">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(
                      inviteUrl
                    )}`}
                    alt="QR Sala"
                    className="w-36 h-36 rounded-lg"
                  />
                </div>
                <span className="text-[11px] text-zinc-400">
                  Escanea para entrar directo a {roomName}
                </span>
              </div>
            )}

            <button
              type="button"
              onClick={handleShareOrCopyLink}
              className="w-full min-h-10 px-4 rounded-xl bg-white/[0.06] hover:bg-white/[0.11] border border-white/10 text-xs font-semibold text-white flex items-center justify-center gap-2 cursor-pointer transition-colors"
            >
              {copiedRoomLink ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>¡Enlace de sala copiado al portapapeles!</span>
                </>
              ) : (
                <>
                  <Share2 className="w-4 h-4 text-[#BF94FF]" />
                  <span>Compartir enlace de la sala (WhatsApp / Copiar)</span>
                </>
              )}
            </button>
          </div>

          {/* 2. Saved Friends List (1-Tap Direct In-App Invite) */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between px-0.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
                <span>Mis Amigos Guardados ({savedFriends.length})</span>
              </h3>
              <span className="text-[11px] text-emerald-400 font-medium">
                Invitación instantánea en la app
              </span>
            </div>

            {savedFriends.length === 0 ? (
              <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06] text-center space-y-1.5">
                <UserPlus className="w-6 h-6 text-zinc-500 mx-auto" />
                <p className="text-xs font-semibold text-zinc-200">
                  Aún no has guardado amigos en tu lista
                </p>
                <p className="text-[11px] text-zinc-400 max-w-xs mx-auto">
                  Añade a las personas que están en tu sala o escribe su nombre / código abajo para invitarlos siempre con 1 toque sin salir de la app.
                </p>
              </div>
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
                      className="p-3 rounded-2xl bg-white/[0.03] hover:bg-white/[0.05] border border-white/[0.08] flex items-center justify-between gap-2.5 transition-colors"
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
                            className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#18181B] ${
                              onlineInfo || isInSameRoom
                                ? 'bg-emerald-400'
                                : 'bg-zinc-600'
                            }`}
                          />
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-bold text-white truncate">
                              {friend.name}
                            </span>
                            {friend.friendCode && (
                              <span className="text-[10px] font-mono text-zinc-400 shrink-0">
                                #{friend.friendCode}
                              </span>
                            )}
                          </div>

                          <div className="text-[11px] truncate mt-0.5">
                            {isInSameRoom ? (
                              <span className="text-emerald-400 font-semibold">
                                Ya está contigo en esta sala
                              </span>
                            ) : onlineInfo ? (
                              <span className="text-emerald-400 font-medium">
                                En línea en la app
                                {onlineInfo.mediaTitle
                                  ? ` · Viendo "${onlineInfo.mediaTitle}"`
                                  : onlineInfo.roomName
                                  ? ` · En ${onlineInfo.roomName}`
                                  : ''}
                              </span>
                            ) : (
                              <span className="text-zinc-500">
                                Fuera de la app · Recibirá tu aviso al entrar
                              </span>
                            )}
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
                            className={`min-h-9 px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all ${
                              justInvited
                                ? 'bg-emerald-500 text-white'
                                : 'bg-[#9146FF] hover:bg-[#772CE8] text-white shadow-[0_6px_18px_rgba(145,70,255,0.35)]'
                            }`}
                          >
                            {justInvited ? (
                              <>
                                <Check className="w-3.5 h-3.5" />
                                <span>Enviada</span>
                              </>
                            ) : (
                              <>
                                <Send className="w-3.5 h-3.5" />
                                <span>Invitar</span>
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
                                onJoinFriendRoom(
                                  onlineInfo.roomId!,
                                  onlineInfo.roomName
                                );
                                onClose();
                              }}
                              title={`Ir a ${onlineInfo.roomName || 'su sala'}`}
                              className="min-h-9 px-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-[11px] font-semibold text-zinc-200 flex items-center gap-1 cursor-pointer"
                            >
                              <span>Unirme</span>
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          )}

                        <button
                          type="button"
                          onClick={() => {
                            triggerHaptic('light');
                            onRemoveFriend(friend.friendId);
                          }}
                          title="Eliminar de amigos"
                          aria-label="Eliminar de amigos"
                          className="w-8 h-8 rounded-xl hover:bg-rose-500/20 text-zinc-500 hover:text-rose-300 flex items-center justify-center cursor-pointer transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 3. People in Your Room or Online Right Now (1-Tap Add or Invite) */}
          {discoverableUsers.length > 0 && (
            <div className="space-y-2.5 pt-2 border-t border-white/[0.07]">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#BF94FF]" />
                <span>Personas Conectadas Ahora ({discoverableUsers.length})</span>
              </h3>

              <div className="space-y-2">
                {discoverableUsers.map((u) => {
                  const alreadyFriend = isFriendSaved(u.userId, u.friendCode);
                  const justInvited = Boolean(invitedIds[u.userId]);
                  return (
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
                          <div className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                            <span className="truncate">{u.name}</span>
                            <span className="text-[10px] font-mono text-zinc-400">
                              #{u.friendCode}
                            </span>
                          </div>
                          <div className="text-[11px] text-emerald-400 truncate">
                            {u.inMyRoom
                              ? 'En tu sala ahora mismo'
                              : u.roomName
                              ? `Conectado en ${u.roomName}`
                              : 'Conectado en la app'}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {!u.inMyRoom && (
                          <button
                            type="button"
                            onClick={() =>
                              handleTriggerInvite({
                                friendId: u.userId,
                                name: u.name,
                                friendCode: u.friendCode,
                              })
                            }
                            className="min-h-8 px-2.5 rounded-xl bg-[#9146FF] hover:bg-[#772CE8] text-[11px] font-bold text-white flex items-center gap-1 cursor-pointer"
                          >
                            <Send className="w-3 h-3" />
                            <span>{justInvited ? 'Enviada' : 'Invitar'}</span>
                          </button>
                        )}

                        {alreadyFriend ? (
                          <span className="min-h-8 px-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-[11px] font-semibold text-emerald-300 flex items-center gap-1">
                            <UserCheck className="w-3.5 h-3.5" />
                            <span>Amigo</span>
                          </span>
                        ) : (
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
                            className="min-h-8 px-3 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] border border-white/15 text-[11px] font-semibold text-white flex items-center gap-1 cursor-pointer"
                          >
                            <UserPlus className="w-3.5 h-3.5 text-[#BF94FF]" />
                            <span>+ Guardar</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 4. Add Friend Manually by Name or Friend Code (Single Unified Input) */}
          <form
            onSubmit={handleManualAddFriend}
            className="p-3 rounded-2xl bg-white/[0.02] border border-white/[0.08] space-y-2"
          >
            <label className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
              <UserPlus className="w-3.5 h-3.5 text-[#BF94FF]" />
              <span>Añadir amigo por Nombre o #Código</span>
            </label>
            <div className="flex items-center gap-2">
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
                placeholder="Ej: Carlos o #A8F92B"
                className="flex-1 h-10 px-3.5 rounded-xl bg-[#26262C] border border-white/10 focus:border-[#9146FF] text-xs text-white placeholder:text-[#ADADB8] outline-none"
              />
              <button
                type="submit"
                disabled={!manualNameInput.trim() && !manualCodeInput.trim()}
                className="h-10 px-4 rounded-xl bg-[#9146FF] text-white hover:bg-[#772CE8] disabled:opacity-35 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shrink-0 transition-colors"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Guardar</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// GLOBAL FLOATING IN-APP ROOM INVITATION & FRIEND REQUEST BANNER
// Appears at the top of the screen anywhere in the app (Lobby or inside any room)
// ============================================================================
interface GlobalIncomingInviteBannerProps {
  invite: IncomingRoomInvite | null;
  friendAddedNotice: IncomingFriendAddedNotice | null;
  isAlreadyFriend?: boolean;
  onAcceptInvite: (invite: IncomingRoomInvite) => void;
  onDismissInvite: () => void;
  onAcceptFriendBack: (notice: IncomingFriendAddedNotice) => void;
  onDismissFriendNotice: () => void;
}

export const GlobalIncomingInviteBanner: React.FC<GlobalIncomingInviteBannerProps> = ({
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
                    Invitación en Directo
                  </span>
                </div>
                <h4 className="text-sm font-bold text-white truncate mt-0.5">
                  {invite.fromUserName} te invita a su sala
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
              aria-label="Cerrar invitación"
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
              <span>Unirme a la sala</span>
            </button>

            <button
              type="button"
              onClick={onDismissInvite}
              className="min-h-10 px-4 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs font-semibold text-zinc-300 flex items-center justify-center cursor-pointer transition-colors"
            >
              Ahora no
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
                {friendAddedNotice.fromUserName} te añadió como amigo
              </div>
              <div className="text-[11px] text-zinc-400 font-mono">
                Código #{friendAddedNotice.fromFriendCode}
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
                <span>+ Guardar</span>
              </button>
            )}
            <button
              type="button"
              onClick={onDismissFriendNotice}
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
