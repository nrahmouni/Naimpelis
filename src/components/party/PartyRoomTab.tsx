import React from 'react';
import {
  Check,
  Copy,
  Crown,
  Film,
  KeyRound,
  MessageCircle,
  QrCode,
  Radio,
  Send,
  Share2,
  Shield,
  SlidersHorizontal,
  Tv,
  UserPlus,
} from 'lucide-react';
import type {
  AppLanguage,
  OnlineAppUser,
  Participant,
  RoomRole,
  SavedFriend,
} from '../../types';
import type { GameVoiceChatState } from '../../hooks/useGameVoiceChat';
import { UI_COPY, pickLang } from '../../utils/i18n';
import { deriveFriendCode } from '../../utils/storage';
import { triggerHaptic } from '../../utils/haptics';
import { IconButton, PrimaryButton, SecondaryButton } from '../ui/DesignSystem';
import { GameVoiceBar } from '../games/GameVoiceBar';
import { getParticipantInitials } from './PartyChatTab';

interface PartyRoomTabProps {
  lang: AppLanguage;
  roomId: string;
  roomName: string;
  hasPin: boolean;
  isHost: boolean;
  hostId: string;
  currentUser: Participant;
  participants: Participant[];
  savedFriends: SavedFriend[];
  onlineUsers: OnlineAppUser[];
  activeMediaTitle: string;
  activeMediaPoster: string;
  activeMediaIsLive: boolean;
  isRoomPlaying: boolean;
  hasConnectedSmartTv: boolean;
  localizedInviteText: string;
  whatsappShareUrl: string;
  copiedCode: boolean;
  copiedLink: boolean;
  leaveButtonSlot: React.ReactNode;
  inviteSentFeedback?: string | null;
  voiceChat?: GameVoiceChatState;
  onCopyRoomCode: () => void;
  onShareInvite: () => void;
  onOpenQrInvite: () => void;
  onOpenRoomSettings: () => void;
  onOpenTvRemote: () => void;
  onOpenFriendsModal?: () => void;
  onAddFriend?: (entry: {
    friendId: string;
    name: string;
    avatar: string;
    color: string;
    friendCode?: string;
  }) => void;
  onSetParticipantRole?: (userId: string, role: RoomRole) => void;
  onSendDirectRoomInvite?: (friend: {
    friendId: string;
    name: string;
    friendCode?: string;
  }) => void;
}

export const PartyRoomTab: React.FC<PartyRoomTabProps> = ({
  lang,
  roomId,
  roomName,
  hasPin,
  isHost,
  hostId,
  currentUser,
  participants,
  savedFriends,
  onlineUsers,
  activeMediaTitle,
  activeMediaPoster,
  activeMediaIsLive,
  isRoomPlaying,
  hasConnectedSmartTv,
  localizedInviteText,
  whatsappShareUrl,
  copiedCode,
  copiedLink,
  leaveButtonSlot,
  inviteSentFeedback,
  voiceChat,
  onCopyRoomCode,
  onShareInvite,
  onOpenQrInvite,
  onOpenRoomSettings,
  onOpenTvRemote,
  onOpenFriendsModal,
  onAddFriend,
  onSetParticipantRole,
  onSendDirectRoomInvite,
}) => {
  const t = UI_COPY[lang];

  return (
    <div className="flex-1 overflow-y-auto p-3.5 space-y-4 custom-scrollbar">
      {voiceChat && <GameVoiceBar lang={lang} voice={voiceChat} />}

      {/* Primary Action Card: Room Info + Share Link & TV Remote */}
      <div className="p-4 rounded-3xl nc-specular-surface border border-white/[0.1] space-y-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <h4 className="text-base font-bold text-white break-words leading-snug min-w-0">
                {roomName}
              </h4>
              {hasPin && <KeyRound className="w-4 h-4 text-amber-400 shrink-0" />}
            </div>
            <button
              type="button"
              onClick={onCopyRoomCode}
              title={pickLang(lang, {
                es: 'Tocar para copiar código de sala',
                ca: 'Toca per copiar el codi de sala',
                en: 'Tap to copy room code',
              })}
              className="mt-1 inline-flex items-center gap-1.5 px-2 py-1 -ml-2 rounded-lg hover:bg-white/[0.08] active:scale-[0.98] text-xs font-mono text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
            >
              <span>
                {pickLang(lang, { es: 'Código:', ca: 'Codi:', en: 'Code:' })}{' '}
                <span className="text-white font-bold">{roomId}</span>
              </span>
              {copiedCode ? (
                <span className="inline-flex items-center gap-1 text-[#00F593] font-sans font-semibold text-[11px]">
                  <Check className="w-3.5 h-3.5 shrink-0" />
                  <span>{t.copied}</span>
                </span>
              ) : (
                <Copy className="w-3.5 h-3.5 text-[#BF94FF] shrink-0" />
              )}
            </button>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <IconButton
              onClick={onOpenQrInvite}
              title={pickLang(lang, {
                es: 'Ver Código QR de la Sala',
                ca: 'Veure Codi QR de la Sala',
                en: 'View Room QR Code',
              })}
              aria-label={pickLang(lang, {
                es: 'Código QR',
                ca: 'Codi QR',
                en: 'QR Code',
              })}
            >
              <QrCode className="w-4 h-4 text-[#BF94FF]" />
            </IconButton>
            <IconButton
              onClick={onOpenRoomSettings}
              title={pickLang(lang, {
                es: 'Ajustes de Sala',
                ca: 'Ajustos de Sala',
                en: 'Room Settings',
              })}
              aria-label={pickLang(lang, {
                es: 'Ajustes de Sala',
                ca: 'Ajustos de Sala',
                en: 'Room Settings',
              })}
            >
              <SlidersHorizontal className="w-4 h-4" />
            </IconButton>
          </div>
        </div>

        {(activeMediaTitle || activeMediaPoster) && (
          <div className="p-2.5 rounded-xl bg-black/35 border border-white/[0.08] flex items-center gap-2.5">
            {activeMediaPoster ? (
              <img
                src={activeMediaPoster}
                alt={activeMediaTitle || roomName}
                referrerPolicy="no-referrer"
                className={`shrink-0 rounded-lg border border-white/10 ${
                  activeMediaIsLive
                    ? 'w-12 h-10 object-contain bg-black/70 p-1'
                    : 'w-10 h-14 object-cover'
                }`}
              />
            ) : (
              <div className="w-10 h-12 rounded-lg bg-[#9146FF]/18 border border-[#9146FF]/35 flex items-center justify-center text-[#BF94FF] shrink-0">
                {activeMediaIsLive ? (
                  <Radio className="w-4 h-4 text-[#EB0400]" />
                ) : (
                  <Film className="w-4 h-4" />
                )}
              </div>
            )}
            <div className="min-w-0 flex-1 space-y-0.5">
              {activeMediaIsLive ? (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#EB0400]/20 border border-[#EB0400]/45 text-[9px] font-extrabold uppercase tracking-wider text-rose-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#EB0400] animate-pulse" />
                  <span>
                    {pickLang(lang, {
                      es: 'Canal en directo',
                      ca: 'Canal en directe',
                      en: 'Live channel',
                    })}
                  </span>
                </span>
              ) : (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-[#9146FF]/20 border border-[#9146FF]/45 text-[9px] font-bold uppercase tracking-wider text-[#D8B4FE]">
                  {pickLang(lang, {
                    es: 'Viendo ahora',
                    ca: 'Veient ara',
                    en: 'Now watching',
                  })}
                </span>
              )}
              {activeMediaTitle && (
                <div className="text-xs font-bold text-white truncate">
                  {activeMediaTitle}
                </div>
              )}
              <p className="text-[10px] text-zinc-400 line-clamp-2 leading-snug">
                “{localizedInviteText}”
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <a
            href={whatsappShareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-10 px-3 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-xs font-bold text-emerald-100 flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors"
          >
            <MessageCircle className="w-4 h-4 text-emerald-300 shrink-0" />
            <span>WhatsApp</span>
          </a>

          <SecondaryButton onClick={onShareInvite} fullWidth className="whitespace-nowrap">
            {copiedLink ? (
              <>
                <Check className="w-4 h-4 text-[#00F593] shrink-0" />
                <span>{t.copied}</span>
              </>
            ) : (
              <>
                <Share2 className="w-4 h-4 text-[#BF94FF] shrink-0" />
                <span>{pickLang(lang, { es: 'Compartir', ca: 'Compartir', en: 'Share' })}</span>
              </>
            )}
          </SecondaryButton>
        </div>

        <SecondaryButton
          onClick={onOpenTvRemote}
          active={hasConnectedSmartTv}
          fullWidth
          className="whitespace-nowrap"
        >
          <Tv className="w-4 h-4 text-[#BF94FF] shrink-0" />
          <span>
            {hasConnectedSmartTv
              ? pickLang(lang, { es: 'TV Activa', ca: 'TV Activa', en: 'TV Active' })
              : pickLang(lang, { es: 'Mando TV', ca: 'Comandament TV', en: 'TV Remote' })}
          </span>
        </SecondaryButton>
      </div>

      {inviteSentFeedback && (
        <div className="p-3 rounded-2xl bg-emerald-500/15 border border-emerald-400/35 text-emerald-200 text-xs font-semibold flex items-center gap-2 animate-fade-in">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{inviteSentFeedback}</span>
        </div>
      )}

      {/* Participants List */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
            {t.participants} ({participants.length})
          </span>
          <span className="text-xs text-[#00F593] font-medium flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#00F593]" />
            {pickLang(lang, {
              es: 'Sala en vivo',
              ca: 'Sala en directe',
              en: 'Live room',
            })}
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
                className="flex items-center justify-between p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.06] gap-2"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div
                    className="w-11 h-11 rounded-2xl flex items-center justify-center text-sm font-bold text-white border border-white/15 shrink-0"
                    style={{ backgroundColor: p.color || '#9146FF' }}
                  >
                    {isTvDevice ? '📺' : getParticipantInitials(p.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-white break-words leading-snug">
                        {p.name}
                      </span>
                      {isSelf && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-white/12 text-zinc-200 font-semibold leading-tight shrink-0">
                          {t.you}
                        </span>
                      )}
                    </div>
                    <span
                      className={`text-xs flex items-center gap-1.5 mt-0.5 ${
                        isTvDevice || isRoomPlaying
                          ? 'text-emerald-400'
                          : activeMediaTitle
                          ? 'text-amber-300'
                          : 'text-zinc-400'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          isTvDevice || isRoomPlaying
                            ? 'bg-emerald-400'
                            : activeMediaTitle
                            ? 'bg-amber-400'
                            : 'bg-zinc-500'
                        }`}
                      />
                      <span>
                        {isTvDevice
                          ? pickLang(lang, {
                              es: '📺 En Smart TV',
                              ca: '📺 A Smart TV',
                              en: '📺 On Smart TV',
                            })
                          : isRoomPlaying
                          ? pickLang(lang, {
                              es: '▶ Viendo en directo',
                              ca: '▶ Veient en directe',
                              en: '▶ Watching live',
                            })
                          : activeMediaTitle
                          ? pickLang(lang, {
                              es: '⏸ En pausa',
                              ca: '⏸ En pausa',
                              en: '⏸ Paused',
                            })
                          : pickLang(lang, {
                              es: 'Sincronizado en sala',
                              ca: 'Sincronitzat a la sala',
                              en: 'Synced in room',
                            })}
                      </span>
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {!isSelf && !isTvDevice && onAddFriend && (
                    alreadyFriend ? (
                      <span className="px-2.5 py-1 rounded-xl bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 text-xs font-bold flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" />
                        <span>
                          {pickLang(lang, { es: 'Amigo', ca: 'Amic', en: 'Friend' })}
                        </span>
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
                        className="min-h-9 px-3 rounded-xl bg-[#9146FF]/15 hover:bg-[#9146FF]/30 border border-[#9146FF]/45 text-xs font-bold text-[#BF94FF] flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all"
                        title={pickLang(lang, {
                          es: 'Guardar en tu lista de amigos',
                          ca: "Desar a la teva llista d'amics",
                          en: 'Save to your friends list',
                        })}
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>
                          {pickLang(lang, { es: '+ Amigo', ca: '+ Amic', en: '+ Friend' })}
                        </span>
                      </button>
                    )
                  )}

                  {p.isHost || p.id === hostId ? (
                    <span className="px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/35 text-amber-300 text-xs font-bold flex items-center gap-1.5 leading-tight">
                      <Crown className="w-3.5 h-3.5 shrink-0" />
                      <span>{t.hostLabel}</span>
                    </span>
                  ) : isHost && !isTvDevice && onSetParticipantRole ? (
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        onSetParticipantRole(p.id, p.role === 'mod' ? 'viewer' : 'mod');
                      }}
                      className={`min-h-9 px-3 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all ${
                        p.role === 'mod'
                          ? 'bg-emerald-500/20 hover:bg-emerald-500/30 border-emerald-400/45 text-emerald-300'
                          : 'bg-white/[0.05] hover:bg-white/[0.1] border-white/[0.1] text-zinc-200'
                      }`}
                      title={
                        p.role === 'mod'
                          ? pickLang(lang, {
                              es: 'Quitar permiso de Co-anfitrión',
                              ca: 'Treure permís de Co-amfitrió',
                              en: 'Remove Co-host permission',
                            })
                          : pickLang(lang, {
                              es: 'Asignar como Co-anfitrión para que pueda cambiar de canal o película',
                              ca: 'Assignar com a Co-amfitrió perquè pugui canviar de canal o pel·lícula',
                              en: 'Assign as Co-host to allow changing channels and movies',
                            })
                      }
                    >
                      <Shield className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        {p.role === 'mod' ? `✓ ${t.modLabel}` : `+ ${t.modLabel}`}
                      </span>
                    </button>
                  ) : p.role === 'mod' ? (
                    <span className="px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-400/35 text-emerald-300 text-xs font-bold flex items-center gap-1.5 leading-tight">
                      <Shield className="w-3.5 h-3.5 shrink-0" />
                      <span>{t.modLabel}</span>
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Saved Friends & Direct In-App Invite Section */}
      <div className="space-y-2.5 pt-1">
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
              className="text-xs font-semibold text-[#BF94FF] hover:underline flex items-center gap-1.5 cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>
                {pickLang(lang, {
                  es: 'Buscar o añadir amigos',
                  ca: 'Cercar o afegir amics',
                  en: 'Search or add friends',
                })}
              </span>
            </button>
          )}
        </div>

        {savedFriends.length === 0 ? (
          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.07] space-y-3">
            <p className="text-xs text-zinc-300 leading-relaxed">
              {pickLang(lang, {
                es: 'Añade a tus amigos por su código o desde la sala para invitarlos con 1 toque sin salir de la app.',
                ca: "Afegeix els teus amics pel seu codi o des de la sala per convidar-los amb 1 toc sense sortir de l'app.",
                en: 'Add friends by code or from the room to invite them in 1 tap without leaving the app.',
              })}
            </p>
            {onOpenFriendsModal && (
              <PrimaryButton onClick={onOpenFriendsModal} fullWidth>
                <UserPlus className="w-4 h-4 shrink-0" />
                <span>
                  {pickLang(lang, {
                    es: 'Añadir e Invitar Amigos',
                    ca: 'Afegir i Convidar Amics',
                    en: 'Add & Invite Friends',
                  })}
                </span>
              </PrimaryButton>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {savedFriends.slice(0, 6).map((friend) => {
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
                  <div className="flex items-center gap-3 min-w-0 flex-1">
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
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold text-white break-words leading-snug">
                        {friend.name}
                      </div>
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
                              es: '🟢 En línea en la app',
                              ca: "🟢 En línia a l'app",
                              en: '🟢 Online in app',
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
                      <span>
                        {pickLang(lang, { es: 'Invitar', ca: 'Convidar', en: 'Invite' })}
                      </span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="pt-2">{leaveButtonSlot}</div>
    </div>
  );
};
