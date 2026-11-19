import React, { useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  Check,
  ChevronUp,
  KeyRound,
  ListVideo,
  LogOut,
  Maximize2,
  MessageSquare,
  MoreHorizontal,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  AppLanguage,
  ChatMessage,
  OnlineAppUser,
  Participant,
  RoomPollState,
  RoomQueueItem,
  RoomRole,
  SavedFriend,
  TvRemoteCommandType,
} from '../types';
import type { GameVoiceChatState } from '../hooks/useGameVoiceChat';
import type { TypingUserPayload } from '../shared/protocol';
import { UI_COPY, pickLang } from '../utils/i18n';
import {
  buildLocalizedInviteMessage,
  buildWhatsAppShareUrl,
  copyTextSafely,
  shareOrCopyInvite,
} from '../utils/inviteShare';
import { buildShortInviteUrl } from '../utils/shortLink';
import { triggerHaptic } from '../utils/haptics';
import { EffectiveViewMode } from './MobileViewportGuard';
import { IconButton, SegmentedControl } from './ui/DesignSystem';
import { PartyQueuePanel } from './party/PartyQueuePanel';
import { PartyModerationSheets } from './party/PartyModerationSheets';
import { PartyChatTab } from './party/PartyChatTab';
import { PartyFriendsTab } from './party/PartyFriendsTab';
import { PartyRoomTab } from './party/PartyRoomTab';
import { PartySalaOptionsSheet } from './party/PartySalaOptionsSheet';

interface PartySidebarProps {
  roomId: string;
  currentUser: Participant;
  hostId: string;
  participants: Participant[];
  messages: ChatMessage[];
  lang: AppLanguage;
  effectiveView: EffectiveViewMode;
  onToggleViewMode: () => void;
  authUser?: User | null;
  authLoading?: boolean;
  onSignIn?: () => void;
  onSignOut?: () => void;
  hostOnlyControl: boolean;
  onToggleHostLock: (nextLocked: boolean) => void;
  roomName: string;
  onRenameRoom: (nextName: string) => void;
  hasPin: boolean;
  currentHostPin?: string;
  onSetRoomPin: (nextPinCode: string) => void;
  isCurrentRoomPermanent: boolean;
  onTogglePermanentRoom: () => void;
  onClaimTvCode: (fourDigitCode: string) => void | Promise<void>;
  tvClaimStatus?: { type: 'success' | 'error'; message: string } | null;
  isRoomPlaying: boolean;
  onRemoteTogglePlay: () => void;
  onRemoteSeekDelta: (deltaSec: number) => void;
  onSendTvRemoteCommand: (cmd: TvRemoteCommandType) => void;
  onSwitchThisDeviceToTvLobby: () => void;
  activePoll: RoomPollState | null;
  roomQueue: RoomQueueItem[];
  onPlayQueueItem: (item: RoomQueueItem) => void;
  onRemoveFromQueue: (id: string) => void;
  onPromoteQueueItem?: (id: string) => void;
  onReorderQueueItem?: (id: string, direction: 'up' | 'down') => void;
  onRestoreQueueItem?: (item: RoomQueueItem) => void;
  onVoteQueueItem?: (id: string) => void;
  onSetParticipantRole?: (userId: string, role: RoomRole) => void;
  pinnedMessage?: ChatMessage | null;
  onPinMessage?: (messageId: string) => void;
  onUnpinMessage?: () => void;
  typingUsers?: TypingUserPayload[];
  onTypingChange?: (isTyping: boolean) => void;
  activeMediaTitle?: string;
  activeMediaPoster?: string;
  activeMediaIsLive?: boolean;
  currentVideoTimeSec?: number;
  onSeekToTimestamp?: (seconds: number) => void;
  onPlayCustomUrl: (rawUrl: string) => void;
  onOpenCloudBrowser: (url: string) => void;
  onStartPollFromQueue: () => void;
  onVotePoll: (pollId: string, optionId: string) => void;
  onClosePoll: (pollId: string) => void;
  initialView?: 'chat' | 'friends' | 'queue' | 'room';
  openQueueTrigger?: number;
  hideInternalTabs?: boolean;
  isKeyboardOpen?: boolean;
  onOpenFloatingChatOnVideo?: () => void;
  onBrowseCatalog?: () => void;
  showMenusButton?: boolean;
  onShowMenus?: () => void;
  savedFriends?: SavedFriend[];
  onlineUsers?: OnlineAppUser[];
  onOpenFriendsModal?: () => void;
  onAddFriend?: (entry: {
    friendId: string;
    name: string;
    avatar: string;
    color: string;
    friendCode?: string;
  }) => void;
  onSendDirectRoomInvite?: (friend: {
    friendId: string;
    name: string;
    friendCode?: string;
  }) => void;
  inviteSentFeedback?: string | null;
  onSendMessage: (text: string) => void;
  onSendReaction: (emoji: string) => void;
  onTransferHost: (newHostId: string) => void;
  onUpdateProfile: (nextName: string, nextAvatar: string, nextColor: string) => void;
  onCreateNewRoom?: (customRoomName?: string) => void;
  onSwitchRoom?: (targetRoomCode: string) => void;
  onLeaveRoom: () => void;
  voiceChat?: GameVoiceChatState;
  worldSalaMode?: boolean;
}

export const PartySidebar: React.FC<PartySidebarProps> = ({
  roomId,
  currentUser,
  hostId,
  participants,
  messages,
  lang,
  effectiveView,
  onToggleViewMode,
  hostOnlyControl,
  onToggleHostLock,
  roomName,
  onRenameRoom,
  hasPin,
  currentHostPin,
  onSetRoomPin,
  isCurrentRoomPermanent,
  onTogglePermanentRoom,
  onClaimTvCode,
  tvClaimStatus,
  isRoomPlaying,
  onRemoteTogglePlay,
  onRemoteSeekDelta,
  onSendTvRemoteCommand,
  activePoll,
  roomQueue,
  onPlayQueueItem,
  onRemoveFromQueue,
  onPromoteQueueItem,
  onReorderQueueItem,
  onRestoreQueueItem,
  onVoteQueueItem,
  onSetParticipantRole,
  pinnedMessage = null,
  onPinMessage,
  onUnpinMessage,
  typingUsers = [],
  onTypingChange,
  activeMediaTitle = '',
  activeMediaPoster = '',
  activeMediaIsLive = false,
  currentVideoTimeSec = 0,
  onSeekToTimestamp,
  onPlayCustomUrl,
  onOpenCloudBrowser,
  onStartPollFromQueue,
  onVotePoll,
  onClosePoll,
  initialView = 'chat',
  openQueueTrigger,
  hideInternalTabs = false,
  onOpenFloatingChatOnVideo,
  onBrowseCatalog,
  showMenusButton = false,
  onShowMenus,
  savedFriends = [],
  onlineUsers = [],
  onOpenFriendsModal,
  onAddFriend,
  onSendDirectRoomInvite,
  inviteSentFeedback,
  onSendMessage,
  onSendReaction,
  onUpdateProfile,
  onCreateNewRoom,
  onSwitchRoom,
  onLeaveRoom,
  voiceChat,
  worldSalaMode = false,
}) => {
  const t = UI_COPY[lang];
  const isHost = currentUser.isHost || currentUser.id === hostId;
  const selfMember = participants.find((p) => p.id === currentUser.id);
  const isCoHost = !isHost && (currentUser.role === 'mod' || selfMember?.role === 'mod');
  const canManageMedia = isHost || isCoHost;
  const resolvedInitialTab: 'chat' | 'friends' | 'queue' | 'room' =
    !worldSalaMode && initialView === 'friends' ? 'room' : initialView;
  const [activeTab, setActiveTab] = useState<'chat' | 'friends' | 'queue' | 'room'>(
    resolvedInitialTab
  );
  const [undoRemovedItem, setUndoRemovedItem] = useState<RoomQueueItem | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [roomNameDraft, setRoomNameDraft] = useState(roomName);
  const [newRoomNameDraft, setNewRoomNameDraft] = useState('');
  const [joinRoomCodeDraft, setJoinRoomCodeDraft] = useState('');
  const [pinDraft, setPinDraft] = useState(currentHostPin || '');
  const [tvCodeInput, setTvCodeInput] = useState('');
  const [customUrlInput, setCustomUrlInput] = useState('');
  const [profileNameDraft, setProfileNameDraft] = useState(currentUser.name);
  const [pairedCodeLabel, setPairedCodeLabel] = useState<string | null>(null);
  const [forceShowRemote, setForceShowRemote] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const [showSalaOptionsSheet, setShowSalaOptionsSheet] = useState(false);
  const [showUrlLoaderSheet, setShowUrlLoaderSheet] = useState(false);
  const [showRoomSettingsSheet, setShowRoomSettingsSheet] = useState(false);
  const [showTvRemoteSheet, setShowTvRemoteSheet] = useState(false);
  const [showQrInviteSheet, setShowQrInviteSheet] = useState(false);
  const [showQuickInviteSheet, setShowQuickInviteSheet] = useState(false);

  useEffect(() => {
    setActiveTab(!worldSalaMode && initialView === 'friends' ? 'room' : initialView);
  }, [initialView, worldSalaMode]);

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    };
  }, []);

  const handleQueueDeleteWithUndo = (item: RoomQueueItem) => {
    onRemoveFromQueue(item.id);
    if (!onRestoreQueueItem) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoRemovedItem(item);
    undoTimerRef.current = setTimeout(() => {
      setUndoRemovedItem(null);
      undoTimerRef.current = null;
    }, 5000);
  };

  useEffect(() => {
    if (openQueueTrigger && openQueueTrigger > 0) {
      setActiveTab('queue');
    }
  }, [openQueueTrigger]);

  useEffect(() => {
    setRoomNameDraft(roomName);
  }, [roomName]);

  useEffect(() => {
    setProfileNameDraft(currentUser.name);
  }, [currentUser.name]);

  const inviteUrl = buildShortInviteUrl(roomId, false);
  const hasConnectedSmartTv =
    participants.some((p) => p.name.includes('(TV)') || p.avatar === '📺') ||
    Boolean(pairedCodeLabel) ||
    forceShowRemote;

  const localizedInviteText = buildLocalizedInviteMessage({
    lang,
    roomName,
    userName: currentUser.name,
    activeMediaTitle,
    activeMediaIsLive,
  });
  const whatsappShareUrl = buildWhatsAppShareUrl({
    lang,
    roomName,
    inviteUrl,
    userName: currentUser.name,
    activeMediaTitle,
    activeMediaIsLive,
  });

  const handleShareInvite = async () => {
    triggerHaptic('light');
    const result = await shareOrCopyInvite({
      title: activeMediaTitle ? `${activeMediaTitle} — RiffanTV` : `${roomName} — RiffanTV`,
      text: localizedInviteText,
      url: inviteUrl,
    });
    if (result === 'copied') {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  const handleCopyInviteLinkOnly = async () => {
    triggerHaptic('success');
    const ok = await copyTextSafely(`${localizedInviteText}\n${inviteUrl}`);
    if (ok) {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  const handleCopyRoomCode = async () => {
    triggerHaptic('light');
    const ok = await copyTextSafely(roomId);
    if (ok) {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2200);
    }
  };

  const handleOpenInviteAction = () => {
    triggerHaptic('light');
    if (onOpenFriendsModal) {
      onOpenFriendsModal();
    } else {
      setShowQuickInviteSheet(true);
    }
  };

  const handleMapTvCommand = (
    action:
      | 'toggle_play'
      | 'seek_delta'
      | 'toggle_mute'
      | 'volume_delta'
      | 'set_volume'
      | 'force_sync'
      | 'toggle_fullscreen'
      | 'cycle_aspect'
      | 'toggle_ambilight'
      | 'cycle_subtitles'
      | 'cycle_audio',
    value?: number
  ) => {
    if (action === 'toggle_play') onRemoteTogglePlay();
    else if (action === 'seek_delta') onRemoteSeekDelta(value || 10);
    else if (action === 'toggle_mute') onSendTvRemoteCommand('toggle_mute');
    else if (action === 'volume_delta') onSendTvRemoteCommand((value || 0) >= 0 ? 'vol_up' : 'vol_down');
    else if (action === 'set_volume') onSendTvRemoteCommand((value || 50) >= 50 ? 'vol_up' : 'vol_down');
    else if (action === 'force_sync') onSendTvRemoteCommand('reload_tv');
    else if (action === 'toggle_fullscreen') onSendTvRemoteCommand('toggle_fullscreen');
    else if (action === 'cycle_aspect') onSendTvRemoteCommand('toggle_aspect');
    else if (action === 'toggle_ambilight') onSendTvRemoteCommand('toggle_ambilight');
    else if (action === 'cycle_subtitles') onSendTvRemoteCommand('cycle_subtitles');
    else if (action === 'cycle_audio') onSendTvRemoteCommand('cycle_audio');
  };

  const handleTriggerLeaveClick = (closeSheet?: boolean) => {
    triggerHaptic('medium');
    if (confirmLeave) {
      if (closeSheet) setShowSalaOptionsSheet(false);
      onLeaveRoom();
      setConfirmLeave(false);
    } else {
      setConfirmLeave(true);
      setTimeout(() => setConfirmLeave(false), 3200);
    }
  };

  const renderLeaveButton = (closeSheet?: boolean) => (
    <button
      type="button"
      onClick={() => handleTriggerLeaveClick(closeSheet)}
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
  );

  return (
    <aside
      className={`w-full h-full flex flex-col select-none overflow-hidden relative ${
        worldSalaMode ? 'bg-[#0B0D14] border-l border-white/[0.08]' : 'bg-transparent'
      }`}
    >
      {worldSalaMode ? (
        <div className="border-b border-white/[0.08] shrink-0 bg-[#10121C]/95 backdrop-blur-xl z-20">
          <div className="px-3.5 py-2.5 flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 min-w-0">
                <h3 className="font-display font-bold text-sm sm:text-base text-white break-words leading-snug min-w-0">
                  {roomName}
                </h3>
                {hasPin && <KeyRound className="w-3.5 h-3.5 text-[#BF94FF] shrink-0" />}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-[#00F593] font-semibold mt-0.5">
                <span className="w-2 h-2 rounded-full bg-[#00F593] shrink-0" />
                <span className="tabular-nums">
                  {participants.length}{' '}
                  {pickLang(lang, {
                    es: participants.length === 1 ? 'conectado' : 'conectados',
                    ca: participants.length === 1 ? 'connectat' : 'connectats',
                    en: participants.length === 1 ? 'connected' : 'connected',
                  })}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleOpenInviteAction}
                className="min-h-10 px-3.5 rounded-2xl bg-[#9146FF] hover:bg-[#7C2AE8] text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all shadow-[0_4px_14px_rgba(145,70,255,0.35)]"
              >
                {copiedLink ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>{t.copied}</span>
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4" />
                    <span>{pickLang(lang, { es: 'Invitar', ca: 'Convidar', en: 'Invite' })}</span>
                  </>
                )}
              </button>

              <IconButton
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setShowSalaOptionsSheet(true);
                }}
                aria-label={pickLang(lang, {
                  es: 'Más opciones de sala',
                  ca: 'Més opcions de sala',
                  en: 'More room options',
                })}
              >
                <MoreHorizontal className="w-5 h-5" />
              </IconButton>
            </div>
          </div>

          <div className="px-3.5 pb-2">
            <SegmentedControl
              compact
              value={activeTab === 'room' ? 'friends' : activeTab}
              onChange={(val) => setActiveTab(val)}
              options={[
                {
                  id: 'chat',
                  label: t.tabChat,
                  icon: <MessageSquare className="w-3 h-3 shrink-0" />,
                },
                {
                  id: 'friends',
                  label: pickLang(lang, { es: 'Amigos', ca: 'Amics', en: 'Friends' }),
                  icon: <Users className="w-3 h-3 shrink-0" />,
                  badge: savedFriends.length > 0 ? savedFriends.length : participants.length,
                },
                {
                  id: 'queue',
                  label: pickLang(lang, { es: 'Cola', ca: 'Cua', en: 'Queue' }),
                  icon: <ListVideo className="w-3 h-3 shrink-0" />,
                  badge: roomQueue.length,
                },
              ]}
            />
          </div>
        </div>
      ) : (
        (!hideInternalTabs || showMenusButton) && (
          <div className="px-2.5 py-1.5 border-b border-white/[0.06] flex items-center gap-2 shrink-0 bg-[#0D0F18]/95 backdrop-blur-xl z-20 overflow-hidden">
            {showMenusButton && onShowMenus && (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  onShowMenus();
                }}
                aria-label={pickLang(lang, {
                  es: 'Mostrar menús',
                  ca: 'Mostrar menús',
                  en: 'Show menus',
                })}
                className="h-8 px-2.5 rounded-xl bg-white/[0.07] hover:bg-white/[0.14] border border-white/[0.1] text-[11px] font-semibold text-zinc-100 flex items-center gap-1 whitespace-nowrap cursor-pointer active:scale-95 transition-all shrink-0"
              >
                <ChevronUp className="w-3 h-3 text-[#BF94FF]" />
                <span>{pickLang(lang, { es: 'Menús', ca: 'Menús', en: 'Menus' })}</span>
              </button>
            )}

            {!hideInternalTabs && (
              <div className="flex items-center gap-1.5 flex-1 min-w-0 overflow-hidden">
                <SegmentedControl
                  compact
                  className="flex-1 min-w-0 !w-full !grid grid-cols-3"
                  value={activeTab === 'friends' ? 'room' : activeTab}
                  onChange={(val) => setActiveTab(val)}
                  options={[
                    {
                      id: 'chat',
                      label: t.tabChat,
                      icon: <MessageSquare className="w-3.5 h-3.5 shrink-0" />,
                    },
                    {
                      id: 'queue',
                      label: pickLang(lang, { es: 'Cola', ca: 'Cua', en: 'Queue' }),
                      icon: <ListVideo className="w-3.5 h-3.5 shrink-0" />,
                      badge: roomQueue.length,
                    },
                    {
                      id: 'room',
                      label: t.tabRoom,
                      icon: <Users className="w-3.5 h-3.5 shrink-0" />,
                      badge: participants.length,
                    },
                  ]}
                />

                {onOpenFloatingChatOnVideo && (
                  <button
                    type="button"
                    onClick={onOpenFloatingChatOnVideo}
                    title={pickLang(lang, {
                      es: 'Superponer chat flotante sobre el vídeo',
                      ca: 'Superposar xat flotant sobre el vídeo',
                      en: 'Overlay floating chat on video',
                    })}
                    aria-label={pickLang(lang, {
                      es: 'Chat flotante sobre el vídeo',
                      ca: 'Xat flotant sobre el vídeo',
                      en: 'Floating chat over video',
                    })}
                    className="w-8 h-8 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] flex items-center justify-center text-[#BF94FF] cursor-pointer shrink-0 transition-colors"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                  </button>
                )}

                {effectiveView === 'desktop' && (
                  <button
                    type="button"
                    onClick={handleOpenInviteAction}
                    title={
                      onOpenFriendsModal
                        ? pickLang(lang, {
                            es: 'Amigos e Invitación Directa',
                            ca: 'Amics i Invitació Directa',
                            en: 'Friends & Direct Invite',
                          })
                        : t.invite
                    }
                    aria-label={t.invite}
                    className={`w-8 h-8 rounded-xl border flex items-center justify-center cursor-pointer shrink-0 transition-colors ${
                      copiedLink
                        ? 'bg-emerald-500/20 border-emerald-500/40 text-white'
                        : 'bg-white/[0.06] hover:bg-white/[0.12] border-white/[0.08] text-[#BF94FF]'
                    }`}
                  >
                    {copiedLink ? (
                      <Check className="w-3.5 h-3.5 text-white" />
                    ) : (
                      <UserPlus className="w-3.5 h-3.5" />
                    )}
                  </button>
                )}
              </div>
            )}
          </div>
        )
      )}

      {activeTab === 'chat' && (
        <PartyChatTab
          lang={lang}
          currentUser={currentUser}
          participants={participants}
          messages={messages}
          activePoll={activePoll}
          canManageMedia={canManageMedia}
          pinnedMessage={pinnedMessage}
          typingUsers={typingUsers}
          currentVideoTimeSec={currentVideoTimeSec}
          worldSalaMode={worldSalaMode}
          voiceChat={voiceChat}
          onOpenInviteAction={handleOpenInviteAction}
          onVotePoll={onVotePoll}
          onClosePoll={onClosePoll}
          onPinMessage={onPinMessage}
          onUnpinMessage={onUnpinMessage}
          onSeekToTimestamp={onSeekToTimestamp}
          onSendMessage={onSendMessage}
          onSendReaction={onSendReaction}
          onTypingChange={onTypingChange}
        />
      )}

      {activeTab === 'queue' && (
        <PartyQueuePanel
          lang={lang}
          currentUser={currentUser}
          roomQueue={roomQueue}
          canManageMedia={canManageMedia}
          undoRemovedItem={undoRemovedItem}
          onRestoreUndoItem={(item) => {
            if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
            onRestoreQueueItem?.(item);
            setUndoRemovedItem(null);
          }}
          onDeleteQueueItemWithUndo={handleQueueDeleteWithUndo}
          onPlayQueueItem={onPlayQueueItem}
          onStartPollFromQueue={onStartPollFromQueue}
          onOpenUrlLoaderSheet={() => setShowUrlLoaderSheet(true)}
          onBrowseCatalog={onBrowseCatalog}
          onVoteQueueItem={onVoteQueueItem}
          onPromoteQueueItem={onPromoteQueueItem}
          onReorderQueueItem={onReorderQueueItem}
          onRestoreQueueItem={onRestoreQueueItem}
        />
      )}

      {worldSalaMode && activeTab === 'friends' && (
        <PartyFriendsTab
          lang={lang}
          currentUser={currentUser}
          participants={participants}
          savedFriends={savedFriends}
          onlineUsers={onlineUsers}
          activeMediaTitle={activeMediaTitle}
          isRoomPlaying={isRoomPlaying}
          copiedLink={copiedLink}
          inviteSentFeedback={inviteSentFeedback}
          onAddFriend={onAddFriend}
          onOpenFriendsModal={onOpenFriendsModal}
          onShareInvite={() => void handleShareInvite()}
          onSendDirectRoomInvite={onSendDirectRoomInvite}
        />
      )}

      {activeTab === 'room' && (
        <PartyRoomTab
          lang={lang}
          roomId={roomId}
          roomName={roomName}
          hasPin={hasPin}
          isHost={isHost}
          hostId={hostId}
          currentUser={currentUser}
          participants={participants}
          savedFriends={savedFriends}
          onlineUsers={onlineUsers}
          activeMediaTitle={activeMediaTitle}
          activeMediaPoster={activeMediaPoster}
          activeMediaIsLive={activeMediaIsLive}
          isRoomPlaying={isRoomPlaying}
          hasConnectedSmartTv={hasConnectedSmartTv}
          localizedInviteText={localizedInviteText}
          whatsappShareUrl={whatsappShareUrl}
          copiedCode={copiedCode}
          copiedLink={copiedLink}
          leaveButtonSlot={renderLeaveButton(false)}
          inviteSentFeedback={inviteSentFeedback}
          voiceChat={voiceChat}
          onCopyRoomCode={() => void handleCopyRoomCode()}
          onShareInvite={() => void handleShareInvite()}
          onOpenQrInvite={() => setShowQrInviteSheet(true)}
          onOpenRoomSettings={() => setShowRoomSettingsSheet(true)}
          onOpenTvRemote={() => setShowTvRemoteSheet(true)}
          onOpenFriendsModal={onOpenFriendsModal}
          onAddFriend={onAddFriend}
          onSetParticipantRole={onSetParticipantRole}
          onSendDirectRoomInvite={onSendDirectRoomInvite}
        />
      )}

      <PartyModerationSheets
        lang={lang}
        roomName={roomName}
        inviteUrl={inviteUrl}
        isHost={isHost}
        hostOnlyControl={hostOnlyControl}
        hasPin={hasPin}
        isCurrentRoomPermanent={isCurrentRoomPermanent}
        currentUser={currentUser}
        effectiveView={effectiveView}
        onToggleViewMode={onToggleViewMode}
        showUrlLoaderSheet={showUrlLoaderSheet}
        setShowUrlLoaderSheet={setShowUrlLoaderSheet}
        customUrlInput={customUrlInput}
        setCustomUrlInput={setCustomUrlInput}
        onPlayCustomUrl={onPlayCustomUrl}
        onOpenCloudBrowser={onOpenCloudBrowser}
        showTvRemoteSheet={showTvRemoteSheet}
        setShowTvRemoteSheet={setShowTvRemoteSheet}
        hasConnectedSmartTv={hasConnectedSmartTv}
        pairedCodeLabel={pairedCodeLabel}
        setPairedCodeLabel={setPairedCodeLabel}
        setForceShowRemote={setForceShowRemote}
        tvClaimStatus={tvClaimStatus}
        tvCodeInput={tvCodeInput}
        setTvCodeInput={setTvCodeInput}
        onClaimTvCode={onClaimTvCode}
        handleMapTvCommand={handleMapTvCommand}
        onSendTvRemoteCommand={onSendTvRemoteCommand}
        showQrInviteSheet={showQrInviteSheet}
        setShowQrInviteSheet={setShowQrInviteSheet}
        handleShareInvite={handleShareInvite}
        showRoomSettingsSheet={showRoomSettingsSheet}
        setShowRoomSettingsSheet={setShowRoomSettingsSheet}
        profileNameDraft={profileNameDraft}
        setProfileNameDraft={setProfileNameDraft}
        onUpdateProfile={onUpdateProfile}
        roomNameDraft={roomNameDraft}
        setRoomNameDraft={setRoomNameDraft}
        onRenameRoom={onRenameRoom}
        onToggleHostLock={onToggleHostLock}
        onTogglePermanentRoom={onTogglePermanentRoom}
        pinDraft={pinDraft}
        setPinDraft={setPinDraft}
        onSetRoomPin={onSetRoomPin}
        onCreateNewRoom={onCreateNewRoom}
        newRoomNameDraft={newRoomNameDraft}
        setNewRoomNameDraft={setNewRoomNameDraft}
      />

      <PartySalaOptionsSheet
        lang={lang}
        roomId={roomId}
        roomName={roomName}
        hostId={hostId}
        currentUser={currentUser}
        participants={participants}
        savedFriends={savedFriends}
        roomQueue={roomQueue}
        canManageMedia={canManageMedia}
        undoRemovedItem={undoRemovedItem}
        copiedLink={copiedLink}
        copiedCode={copiedCode}
        inviteUrl={inviteUrl}
        whatsappShareUrl={whatsappShareUrl}
        hasConnectedSmartTv={hasConnectedSmartTv}
        confirmLeave={confirmLeave}
        joinRoomCodeDraft={joinRoomCodeDraft}
        showSalaOptionsSheet={showSalaOptionsSheet}
        showQuickInviteSheet={showQuickInviteSheet}
        voiceChat={voiceChat}
        setShowSalaOptionsSheet={setShowSalaOptionsSheet}
        setShowQuickInviteSheet={setShowQuickInviteSheet}
        setShowQrInviteSheet={setShowQrInviteSheet}
        setShowUrlLoaderSheet={setShowUrlLoaderSheet}
        setShowTvRemoteSheet={setShowTvRemoteSheet}
        setShowRoomSettingsSheet={setShowRoomSettingsSheet}
        setJoinRoomCodeDraft={setJoinRoomCodeDraft}
        onShareInvite={() => void handleShareInvite()}
        onCopyInviteLinkOnly={() => void handleCopyInviteLinkOnly()}
        onCopyRoomCode={() => void handleCopyRoomCode()}
        onRestoreUndoItem={(item) => {
          if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
          onRestoreQueueItem?.(item);
          setUndoRemovedItem(null);
        }}
        onDeleteQueueItemWithUndo={handleQueueDeleteWithUndo}
        onPlayQueueItem={onPlayQueueItem}
        onStartPollFromQueue={onStartPollFromQueue}
        onBrowseCatalog={onBrowseCatalog}
        onVoteQueueItem={onVoteQueueItem}
        onPromoteQueueItem={onPromoteQueueItem}
        onReorderQueueItem={onReorderQueueItem}
        onRestoreQueueItem={onRestoreQueueItem}
        onOpenFriendsModal={onOpenFriendsModal}
        onAddFriend={onAddFriend}
        onCreateNewRoom={onCreateNewRoom}
        onSwitchRoom={onSwitchRoom}
        onTriggerLeaveClick={() => handleTriggerLeaveClick(true)}
      />
    </aside>
  );
};
