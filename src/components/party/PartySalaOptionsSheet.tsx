import React from 'react';
import {
  Check,
  Copy,
  Crown,
  LogIn,
  LogOut,
  MessageCircle,
  Plus,
  QrCode,
  Share2,
  SlidersHorizontal,
  Tv,
  UserPlus,
} from 'lucide-react';
import type {
  AppLanguage,
  Participant,
  RoomQueueItem,
  SavedFriend,
} from '../../types';
import type { GameVoiceChatState } from '../../hooks/useGameVoiceChat';
import { UI_COPY, pickLang } from '../../utils/i18n';
import { deriveFriendCode } from '../../utils/storage';
import {
  BottomSheet,
  IconButton,
  PrimaryButton,
  SecondaryButton,
  StandardInput,
} from '../ui/DesignSystem';
import { GameVoiceBar } from '../games/GameVoiceBar';
import { PartyQueuePanel } from './PartyQueuePanel';
import { getParticipantInitials } from './PartyChatTab';

interface PartySalaOptionsSheetProps {
  lang: AppLanguage;
  roomId: string;
  roomName: string;
  hostId: string;
  currentUser: Participant;
  participants: Participant[];
  savedFriends: SavedFriend[];
  roomQueue: RoomQueueItem[];
  canManageMedia: boolean;
  undoRemovedItem: RoomQueueItem | null;
  copiedLink: boolean;
  copiedCode: boolean;
  inviteUrl: string;
  whatsappShareUrl: string;
  hasConnectedSmartTv: boolean;
  confirmLeave: boolean;
  joinRoomCodeDraft: string;
  showSalaOptionsSheet: boolean;
  showQuickInviteSheet: boolean;
  voiceChat?: GameVoiceChatState;
  setShowSalaOptionsSheet: (open: boolean) => void;
  setShowQuickInviteSheet: (open: boolean) => void;
  setShowQrInviteSheet: (open: boolean) => void;
  setShowUrlLoaderSheet: (open: boolean) => void;
  setShowTvRemoteSheet: (open: boolean) => void;
  setShowRoomSettingsSheet: (open: boolean) => void;
  setJoinRoomCodeDraft: (val: string) => void;
  onShareInvite: () => void;
  onCopyInviteLinkOnly: () => void;
  onCopyRoomCode: () => void;
  onRestoreUndoItem: (item: RoomQueueItem) => void;
  onDeleteQueueItemWithUndo: (item: RoomQueueItem) => void;
  onPlayQueueItem: (item: RoomQueueItem) => void;
  onStartPollFromQueue: () => void;
  onBrowseCatalog?: () => void;
  onVoteQueueItem?: (id: string) => void;
  onPromoteQueueItem?: (id: string) => void;
  onReorderQueueItem?: (id: string, direction: 'up' | 'down') => void;
  onRestoreQueueItem?: (item: RoomQueueItem) => void;
  onOpenFriendsModal?: () => void;
  onAddFriend?: (entry: {
    friendId: string;
    name: string;
    avatar: string;
    color: string;
    friendCode?: string;
  }) => void;
  onCreateNewRoom?: (customRoomName?: string) => void;
  onSwitchRoom?: (targetRoomCode: string) => void;
  onTriggerLeaveClick: () => void;
}

export const PartySalaOptionsSheet: React.FC<PartySalaOptionsSheetProps> = ({
  lang,
  roomId,
  roomName,
  hostId,
  currentUser,
  participants,
  savedFriends,
  roomQueue,
  canManageMedia,
  undoRemovedItem,
  copiedLink,
  copiedCode,
  inviteUrl,
  whatsappShareUrl,
  hasConnectedSmartTv,
  confirmLeave,
  joinRoomCodeDraft,
  showSalaOptionsSheet,
  showQuickInviteSheet,
  voiceChat,
  setShowSalaOptionsSheet,
  setShowQuickInviteSheet,
  setShowQrInviteSheet,
  setShowUrlLoaderSheet,
  setShowTvRemoteSheet,
  setShowRoomSettingsSheet,
  setJoinRoomCodeDraft,
  onShareInvite,
  onCopyInviteLinkOnly,
  onCopyRoomCode,
  onRestoreUndoItem,
  onDeleteQueueItemWithUndo,
  onPlayQueueItem,
  onStartPollFromQueue,
  onBrowseCatalog,
  onVoteQueueItem,
  onPromoteQueueItem,
  onReorderQueueItem,
  onRestoreQueueItem,
  onOpenFriendsModal,
  onAddFriend,
  onCreateNewRoom,
  onSwitchRoom,
  onTriggerLeaveClick,
}) => {
  const t = UI_COPY[lang];

  return (
    <>
      <BottomSheet
        isOpen={showSalaOptionsSheet}
        onClose={() => setShowSalaOptionsSheet(false)}
        lang={lang}
        title={roomName}
        subtitle={`${pickLang(lang, { es: 'Código', ca: 'Codi', en: 'Code' })}: ${roomId}`}
        maxWidth="sm:max-w-lg"
      >
        <div className="space-y-5">
          {/* Code + Share / QR / WhatsApp */}
          <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs text-zinc-400">
                  {pickLang(lang, { es: 'Código de sala', ca: 'Codi de sala', en: 'Room code' })}
                </p>
                <p className="text-base font-mono font-bold text-white tracking-wider">
                  {roomId}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <SecondaryButton onClick={onShareInvite}>
                  <Copy className="w-4 h-4 text-[#BF94FF]" />
                  <span>
                    {copiedLink ? t.copied : pickLang(lang, { es: 'Copiar', ca: 'Copiar', en: 'Copy' })}
                  </span>
                </SecondaryButton>
                <IconButton
                  onClick={() => {
                    setShowSalaOptionsSheet(false);
                    setShowQrInviteSheet(true);
                  }}
                  aria-label="QR"
                >
                  <QrCode className="w-4 h-4 text-[#BF94FF]" />
                </IconButton>
              </div>
            </div>

            <a
              href={whatsappShareUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full min-h-11 px-3 rounded-xl bg-[#00F593]/12 hover:bg-[#00F593]/20 border border-[#00F593]/35 text-xs font-bold text-[#00F593] flex items-center justify-center gap-2 transition-colors"
            >
              <MessageCircle className="w-4 h-4 shrink-0" />
              <span>
                {pickLang(lang, {
                  es: 'Enviar por WhatsApp',
                  ca: 'Enviar per WhatsApp',
                  en: 'Send on WhatsApp',
                })}
              </span>
            </a>
          </div>

          {voiceChat && <GameVoiceBar lang={lang} voice={voiceChat} />}

          {/* Queue */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                {pickLang(lang, {
                  es: `Cola (${roomQueue.length})`,
                  ca: `Cua (${roomQueue.length})`,
                  en: `Queue (${roomQueue.length})`,
                })}
              </span>
            </div>
            <div className="rounded-2xl border border-white/[0.08] overflow-hidden max-h-72 overflow-y-auto custom-scrollbar">
              <PartyQueuePanel
                lang={lang}
                currentUser={currentUser}
                roomQueue={roomQueue}
                canManageMedia={canManageMedia}
                undoRemovedItem={undoRemovedItem}
                onRestoreUndoItem={onRestoreUndoItem}
                onDeleteQueueItemWithUndo={onDeleteQueueItemWithUndo}
                onPlayQueueItem={(item) => {
                  setShowSalaOptionsSheet(false);
                  onPlayQueueItem(item);
                }}
                onStartPollFromQueue={() => {
                  setShowSalaOptionsSheet(false);
                  onStartPollFromQueue();
                }}
                onOpenUrlLoaderSheet={() => {
                  setShowSalaOptionsSheet(false);
                  setShowUrlLoaderSheet(true);
                }}
                onBrowseCatalog={
                  onBrowseCatalog
                    ? () => {
                        setShowSalaOptionsSheet(false);
                        onBrowseCatalog();
                      }
                    : undefined
                }
                onVoteQueueItem={onVoteQueueItem}
                onPromoteQueueItem={onPromoteQueueItem}
                onReorderQueueItem={onReorderQueueItem}
                onRestoreQueueItem={onRestoreQueueItem}
              />
            </div>
          </div>

          {/* Participants & Friends */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                {t.participants} ({participants.length})
              </span>
              {onOpenFriendsModal && (
                <button
                  type="button"
                  onClick={() => {
                    setShowSalaOptionsSheet(false);
                    onOpenFriendsModal();
                  }}
                  className="text-xs font-semibold text-[#BF94FF] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>{pickLang(lang, { es: 'Amigos', ca: 'Amics', en: 'Friends' })}</span>
                </button>
              )}
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
                    className="flex items-center justify-between p-2.5 rounded-2xl bg-white/[0.03] border border-white/[0.06] gap-2"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white border border-white/15 shrink-0"
                        style={{ backgroundColor: p.color || '#9146FF' }}
                      >
                        {p.avatar && p.avatar.length <= 2
                          ? p.avatar
                          : getParticipantInitials(p.name)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white truncate">
                          {p.name} {isSelf ? `(${t.you})` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {!isSelf && !isTvDevice && onAddFriend && !alreadyFriend && (
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
                          className="min-h-9 px-2.5 rounded-xl bg-[#9146FF]/20 border border-[#9146FF]/45 text-xs font-bold text-[#D8B4FE] cursor-pointer"
                        >
                          + {pickLang(lang, { es: 'Amigo', ca: 'Amic', en: 'Friend' })}
                        </button>
                      )}
                      {(p.isHost || p.id === hostId) && (
                        <span className="px-2 py-0.5 rounded-full bg-white/10 text-zinc-200 text-[11px] font-bold flex items-center gap-1">
                          <Crown className="w-3 h-3 text-[#BF94FF]" />
                          {t.hostLabel}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Create / Join Another Room */}
          <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-3">
            {onCreateNewRoom && (
              <SecondaryButton
                fullWidth
                onClick={() => {
                  setShowSalaOptionsSheet(false);
                  onCreateNewRoom();
                }}
              >
                <Plus className="w-4 h-4 text-[#BF94FF]" />
                <span>
                  {pickLang(lang, {
                    es: 'Crear sala nueva',
                    ca: 'Crear sala nova',
                    en: 'Create new room',
                  })}
                </span>
              </SecondaryButton>
            )}

            {onSwitchRoom && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const clean = joinRoomCodeDraft.trim().toUpperCase();
                  if (!clean) return;
                  setShowSalaOptionsSheet(false);
                  setJoinRoomCodeDraft('');
                  onSwitchRoom(clean);
                }}
                className="flex items-center gap-2"
              >
                <StandardInput
                  value={joinRoomCodeDraft}
                  onChange={(e) => setJoinRoomCodeDraft(e.target.value.toUpperCase())}
                  placeholder={pickLang(lang, {
                    es: 'Unirme con código...',
                    ca: 'Unir-me amb codi...',
                    en: 'Join with code...',
                  })}
                  className="uppercase font-mono"
                />
                <SecondaryButton type="submit" disabled={!joinRoomCodeDraft.trim()}>
                  <LogIn className="w-4 h-4 text-[#BF94FF]" />
                  <span>{pickLang(lang, { es: 'Entrar', ca: 'Entrar', en: 'Join' })}</span>
                </SecondaryButton>
              </form>
            )}
          </div>

          {/* Connected TV Remote + Room Settings + Leave */}
          <div className="space-y-2">
            {hasConnectedSmartTv && (
              <SecondaryButton
                fullWidth
                active
                onClick={() => {
                  setShowSalaOptionsSheet(false);
                  setShowTvRemoteSheet(true);
                }}
              >
                <Tv className="w-4 h-4 text-[#00F593]" />
                <span>
                  {pickLang(lang, { es: 'Mando TV', ca: 'Comandament TV', en: 'TV Remote' })}
                </span>
              </SecondaryButton>
            )}

            <SecondaryButton
              fullWidth
              onClick={() => {
                setShowSalaOptionsSheet(false);
                setShowRoomSettingsSheet(true);
              }}
            >
              <SlidersHorizontal className="w-4 h-4 text-[#BF94FF]" />
              <span>
                {pickLang(lang, {
                  es: 'Ajustes de sala',
                  ca: 'Ajustos de sala',
                  en: 'Room settings',
                })}
              </span>
            </SecondaryButton>

            <button
              type="button"
              onClick={onTriggerLeaveClick}
              className={`w-full min-h-11 px-4 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition-all ${
                confirmLeave
                  ? 'bg-[#EB0400] hover:bg-red-600 border-[#EB0400] text-white'
                  : 'bg-red-500/10 hover:bg-red-500/20 border-red-500/30 text-red-300 hover:text-red-200'
              }`}
            >
              <LogOut
                className={`w-4 h-4 shrink-0 ${confirmLeave ? 'text-white' : 'text-red-400'}`}
              />
              <span>
                {confirmLeave
                  ? pickLang(lang, {
                      es: '¿Seguro? Pulsa para salir',
                      ca: 'Segur? Prem per sortir',
                      en: 'Sure? Tap to leave',
                    })
                  : t.leaveRoom}
              </span>
            </button>
          </div>
        </div>
      </BottomSheet>

      {/* BUILT-IN FALLBACK INVITE SHEET */}
      <BottomSheet
        isOpen={showQuickInviteSheet}
        onClose={() => setShowQuickInviteSheet(false)}
        lang={lang}
        title={pickLang(lang, {
          es: 'Invitar a la Sala',
          ca: 'Convidar a la Sala',
          en: 'Invite to Room',
        })}
        subtitle={roomName}
        icon={<UserPlus className="w-5 h-5" />}
      >
        <div className="space-y-4">
          <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="text-xs text-zinc-400 block">
                {pickLang(lang, { es: 'Código de sala', ca: 'Codi de sala', en: 'Room code' })}
              </span>
              <span className="font-mono text-base font-bold text-white tracking-wider">
                {roomId}
              </span>
            </div>
            <SecondaryButton onClick={onCopyRoomCode}>
              {copiedCode ? (
                <>
                  <Check className="w-4 h-4 text-[#00F593]" />
                  <span>{t.copied}</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-[#BF94FF]" />
                  <span>
                    {pickLang(lang, { es: 'Copiar código', ca: 'Copiar codi', en: 'Copy code' })}
                  </span>
                </>
              )}
            </SecondaryButton>
          </div>

          <div className="p-3 rounded-2xl bg-black/35 border border-white/[0.08] space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
              {pickLang(lang, {
                es: 'Enlace directo',
                ca: 'Enllaç directe',
                en: 'Direct link',
              })}
            </span>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={inviteUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 min-h-10 px-3 rounded-xl bg-black/50 border border-white/10 text-xs font-mono text-zinc-200 outline-none"
              />
              <SecondaryButton onClick={onCopyInviteLinkOnly}>
                {copiedLink ? (
                  <>
                    <Check className="w-4 h-4 text-[#00F593]" />
                    <span>{t.copied}</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-[#BF94FF]" />
                    <span>{pickLang(lang, { es: 'Copiar', ca: 'Copiar', en: 'Copy' })}</span>
                  </>
                )}
              </SecondaryButton>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <PrimaryButton onClick={onShareInvite} fullWidth>
              {copiedLink ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
              <span>
                {copiedLink
                  ? t.copied
                  : pickLang(lang, { es: 'Compartir', ca: 'Compartir', en: 'Share' })}
              </span>
            </PrimaryButton>
            <a
              href={whatsappShareUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-11 px-3 rounded-xl bg-[#25D366] hover:bg-[#20BD5A] text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
            >
              <MessageCircle className="w-4 h-4 shrink-0" />
              <span>WhatsApp</span>
            </a>
          </div>

          <SecondaryButton
            fullWidth
            onClick={() => {
              setShowQuickInviteSheet(false);
              setShowQrInviteSheet(true);
            }}
          >
            <QrCode className="w-4 h-4 text-[#BF94FF]" />
            <span>
              {pickLang(lang, { es: 'Ver código QR', ca: 'Veure codi QR', en: 'Show QR code' })}
            </span>
          </SecondaryButton>
        </div>
      </BottomSheet>
    </>
  );
};
