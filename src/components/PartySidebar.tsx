import React, { Suspense, useState, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { User } from 'firebase/auth';
import {
  Send,
  Users,
  MessageSquare,
  Share2,
  Check,
  Shield,
  Crown,
  ListVideo,
  KeyRound,
  Tv,
  QrCode,
  SlidersHorizontal,
  Smile,
  X,
  Maximize2,
  LogOut,
  UserPlus,
  Clock,
  ChevronUp,
  Pin,
  Film,
  Radio,
  MessageCircle,
  MoreHorizontal,
  Mic,
  MicOff,
  Copy,
  Plus,
  LogIn,
} from 'lucide-react';
import {
  ChatMessage,
  Participant,
  RoomQueueItem,
  RoomPollState,
  AppLanguage,
  TvRemoteCommandType,
  SavedFriend,
  OnlineAppUser,
  RoomRole,
} from '../types';
import type { GameVoiceChatState } from '../hooks/useGameVoiceChat';
import type { TypingUserPayload } from '../shared/protocol';
import { UI_COPY, pickLang } from '../utils/i18n';
import {
  buildLocalizedInviteMessage,
  buildWhatsAppShareUrl,
} from '../utils/inviteShare';
import { buildShortInviteUrl } from '../utils/shortLink';
import { deriveFriendCode } from '../utils/storage';
import { triggerHaptic } from '../utils/haptics';
import { EffectiveViewMode } from './MobileViewportGuard';
import {
  PrimaryButton,
  SecondaryButton,
  IconButton,
  StandardInput,
  SegmentedControl,
  EmptyStateCard,
  BottomSheet,
} from './ui/DesignSystem';
import { PartyPollCard } from './party/PartyPollCard';
import { PartyQueuePanel } from './party/PartyQueuePanel';
import { PartyModerationSheets } from './party/PartyModerationSheets';
import { GameVoiceBar } from './games/GameVoiceBar';

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

const QUICK_REACTIONS = ['🔥', '😂', '❤️', '👏', '😱', '⚽', '🍿', '🎉'];

function formatChatVideoStamp(sec: number): string {
  const total = Math.max(0, Math.floor(sec));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function parseTimestampToSeconds(token: string): number | null {
  const parts = token.split(':').map((n) => Number(n));
  if (parts.some((n) => !Number.isFinite(n) || n < 0)) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
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
  onTransferHost,
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
  const [activeTab, setActiveTab] = useState<'chat' | 'friends' | 'queue' | 'room'>(resolvedInitialTab);
  const [undoRemovedItem, setUndoRemovedItem] = useState<RoomQueueItem | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [inputText, setInputText] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [roomNameDraft, setRoomNameDraft] = useState(roomName);
  const [newRoomNameDraft, setNewRoomNameDraft] = useState('');
  const [joinRoomCodeDraft, setJoinRoomCodeDraft] = useState('');
  const [pinDraft, setPinDraft] = useState(currentHostPin || '');
  const [tvCodeInput, setTvCodeInput] = useState('');
  const [customUrlInput, setCustomUrlInput] = useState('');
  const [profileNameDraft, setProfileNameDraft] = useState(currentUser.name);
  const [showFloatingReactions, setShowFloatingReactions] = useState(false);
  const [pairedCodeLabel, setPairedCodeLabel] = useState<string | null>(null);
  const [forceShowRemote, setForceShowRemote] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  // Progressive Disclosure Bottom Sheets
  const [showSalaOptionsSheet, setShowSalaOptionsSheet] = useState(false);
  const [showUrlLoaderSheet, setShowUrlLoaderSheet] = useState(false);
  const [showRoomSettingsSheet, setShowRoomSettingsSheet] = useState(false);
  const [showTvRemoteSheet, setShowTvRemoteSheet] = useState(false);
  const [showQrInviteSheet, setShowQrInviteSheet] = useState(false);

  const chatListRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (activeTab !== 'chat') return;
    const raf = window.requestAnimationFrame(() => {
      if (chatListRef.current) {
        chatListRef.current.scrollTop = chatListRef.current.scrollHeight;
      } else {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    });
    return () => window.cancelAnimationFrame(raf);
  }, [messages.length, activeTab]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText.trim());
    setInputText('');
    onTypingChange?.(false);
  };

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
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: activeMediaTitle ? `${activeMediaTitle} — RiffanTV` : `${roomName} — RiffanTV`,
          text: localizedInviteText,
          url: inviteUrl,
        });
        return;
      } catch {
        // Fallback to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(`${localizedInviteText}\n${inviteUrl}`);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      // ignore
    }
  };

  const handleCopyRoomCode = async () => {
    triggerHaptic('light');
    try {
      await navigator.clipboard.writeText(roomId);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2200);
    } catch {
      // ignore
    }
  };

  const deduplicatedMessages = React.useMemo(() => {
    const out: ChatMessage[] = [];
    const seenIds = new Set<string>();
    const recentJoinKeys = new Map<string, number>();
    for (const m of messages) {
      if (seenIds.has(m.id)) continue;
      seenIds.add(m.id);
      if (m.isSystem && m.systemType === 'join') {
        const joinKey = (m.systemUserId || m.text.trim()).toLowerCase();
        const prevTs = recentJoinKeys.get(joinKey);
        if (prevTs !== undefined && Math.abs(m.timestamp - prevTs) < 180_000) {
          continue;
        }
        recentJoinKeys.set(joinKey, m.timestamp);
      }
      out.push(m);
    }
    return out;
  }, [messages]);

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
    if (action === 'toggle_play') {
      onRemoteTogglePlay();
    } else if (action === 'seek_delta') {
      onRemoteSeekDelta(value || 10);
    } else if (action === 'toggle_mute') {
      onSendTvRemoteCommand('toggle_mute');
    } else if (action === 'volume_delta') {
      onSendTvRemoteCommand((value || 0) >= 0 ? 'vol_up' : 'vol_down');
    } else if (action === 'set_volume') {
      onSendTvRemoteCommand((value || 50) >= 50 ? 'vol_up' : 'vol_down');
    } else if (action === 'force_sync') {
      onSendTvRemoteCommand('reload_tv');
    } else if (action === 'toggle_fullscreen') {
      onSendTvRemoteCommand('toggle_fullscreen');
    } else if (action === 'cycle_aspect') {
      onSendTvRemoteCommand('toggle_aspect');
    } else if (action === 'toggle_ambilight') {
      onSendTvRemoteCommand('toggle_ambilight');
    } else if (action === 'cycle_subtitles') {
      onSendTvRemoteCommand('cycle_subtitles');
    } else if (action === 'cycle_audio') {
      onSendTvRemoteCommand('cycle_audio');
    }
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    const locale =
      lang === 'ca' ? 'ca-ES' : lang === 'en' ? 'en-US' : lang === 'zh' ? 'zh-CN' : 'es-ES';
    return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  };

  const getInitials = (name: string) => {
    const clean = (name || 'U').trim();
    const parts = clean.split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return clean.slice(0, 2).toUpperCase();
  };

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
                <h3 className="font-display font-bold text-sm sm:text-base text-white truncate">
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
                onClick={() => {
                  triggerHaptic('light');
                  void handleShareInvite();
                }}
                className="min-h-10 px-3.5 rounded-2xl bg-[#9146FF] hover:bg-[#7C2AE8] text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all shadow-[0_4px_14px_rgba(145,70,255,0.35)]"
              >
                {copiedLink ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>{t.copied}</span>
                  </>
                ) : (
                  <>
                    <Share2 className="w-4 h-4" />
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
      ) : (!hideInternalTabs || showMenusButton) && (
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
                  onClick={onOpenFriendsModal || handleShareInvite}
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
      )}

      {/* ==================================================================== */}
      {/* TAB 1: BORDERLESS CHAT + FLOATING REACTION PILL                      */}
      {/* ==================================================================== */}
      {activeTab === 'chat' && (
        <div className="flex-1 flex flex-col min-h-0 relative">
          {voiceChat && (voiceChat.isJoined || voiceChat.voicePeers.length > 0) && (
            <div className="px-3 pt-2 shrink-0">
              <GameVoiceBar lang={lang} voice={voiceChat} compact />
            </div>
          )}

          {/* Mini Friends / Participants Strip inside Chat */}
          <div className="mx-3 mt-2 px-3 py-1.5 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-1.5 min-w-0 overflow-x-auto no-scrollbar">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 shrink-0">
                {pickLang(lang, { es: 'En sala', ca: 'A la sala', en: 'In room' })}:
              </span>
              <div className="flex items-center -space-x-1.5 shrink-0">
                {participants.slice(0, 6).map((p) => (
                  <div
                    key={p.id}
                    title={`${p.name} · ${p.id === currentUser.id ? t.you : pickLang(lang, { es: 'En sala', ca: 'A la sala', en: 'In room' })}`}
                    className="relative w-6 h-6 rounded-full border-2 border-[#12131C] flex items-center justify-center text-[10px] font-bold text-white shadow-sm"
                    style={{ backgroundColor: p.color || '#9146FF' }}
                  >
                    {p.avatar === '📺' ? '📺' : getInitials(p.name)}
                    <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#00F593] border border-[#12131C]" />
                  </div>
                ))}
              </div>
              {participants.length > 6 && (
                <span className="text-[10px] text-zinc-400 font-bold tabular-nums">
                  +{participants.length - 6}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={onOpenFriendsModal || handleShareInvite}
              className="min-h-[26px] px-2 rounded-lg bg-[#9146FF]/20 hover:bg-[#9146FF]/30 border border-[#9146FF]/40 text-[#D8B4FE] text-[11px] font-bold flex items-center gap-1 cursor-pointer active:scale-95 transition-all shrink-0"
            >
              <UserPlus className="w-3 h-3" />
              <span>{pickLang(lang, { es: 'Invitar', ca: 'Convidar', en: 'Invite' })}</span>
            </button>
          </div>
          {/* Active Poll Banner (if open) */}
          {activePoll && !activePoll.isClosed && (
            <PartyPollCard
              activePoll={activePoll}
              currentUser={currentUser}
              lang={lang}
              canManageMedia={canManageMedia}
              onVotePoll={onVotePoll}
              onClosePoll={onClosePoll}
            />
          )}

          {/* Pinned Chat Message Bar */}
          {pinnedMessage && (
            <div className="mx-3 mt-2 px-3 py-2 rounded-xl bg-[#9146FF]/15 border border-[#9146FF]/35 flex items-start justify-between gap-2 shrink-0">
              <div className="flex items-start gap-2 min-w-0">
                <Pin className="w-3.5 h-3.5 text-[#BF94FF] shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#BF94FF] truncate">
                    {pickLang(lang, { es: 'Fijado por sala', ca: 'Fixat', en: 'Pinned' })} · {pinnedMessage.senderName}
                  </div>
                  <p className="text-xs text-white line-clamp-2 break-words">{pinnedMessage.text}</p>
                </div>
              </div>
              {canManageMedia && onUnpinMessage && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    onUnpinMessage();
                  }}
                  aria-label={pickLang(lang, { es: 'Desfijar mensaje', ca: 'Desfixar missatge', en: 'Unpin message' })}
                  className="w-6 h-6 rounded-md hover:bg-white/10 text-zinc-300 hover:text-white flex items-center justify-center shrink-0 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {/* Borderless Chat Stream */}
          <div
            ref={chatListRef}
            className={`flex-1 overflow-y-auto px-3.5 py-2.5 space-y-2.5 custom-scrollbar smooth-scroll-area ${
              showFloatingReactions ? 'pb-16' : 'pb-3'
            }`}
          >
            {deduplicatedMessages.length === 0 ? (
              <div className="space-y-3">
                <EmptyStateCard
                  icon={<MessageSquare className="w-6 h-6" />}
                  title={pickLang(lang, {
                    es: 'El chat está tranquilo',
                    ca: 'El xat està tranquil',
                    en: 'Chat is quiet',
                    zh: '聊天室很安静',
                  })}
                  description={pickLang(lang, {
                    es: 'Saluda al grupo o lanza una reacción en vivo mientras veis la sala.',
                    ca: 'Saluda el grup o envia una reacció en directe.',
                    en: 'Say hi to your room or send a live reaction.',
                    zh: '向房间好友打个招呼或发送实时表情互动。',
                  })}
                />
                <div className="flex flex-wrap items-center justify-center gap-1.5 px-2">
                  {(lang === 'zh'
                    ? [
                        '👋 大家好！',
                        '🍿 开始观影！',
                        '🔥 太精彩了！',
                        '⏸️ 稍等一下',
                      ]
                    : lang === 'ca'
                    ? [
                        '👋 Hola a tots!',
                        '🍿 Comencem!',
                        '🔥 Quina passada!',
                        '⏸️ Un segon si us plau',
                      ]
                    : lang === 'en'
                    ? [
                        '👋 Hey everyone!',
                        '🍿 Let’s start!',
                        '🔥 So good!',
                        '⏸️ One sec please',
                      ]
                    : [
                        '👋 ¡Hola a todos!',
                        '🍿 ¡Empezamos!',
                        '🔥 ¡Qué pasada!',
                        '⏸️ Un segundo porfa',
                      ]
                  ).map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        onSendMessage(chip);
                      }}
                      className="min-h-9 px-3 rounded-xl bg-[#26262C] hover:bg-[#9146FF]/25 border border-white/10 text-xs font-medium text-[#EFEFF1] cursor-pointer transition-colors"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              deduplicatedMessages.map((msg) => {
                if (msg.isSystem) {
                  return (
                    <div key={msg.id} className="flex justify-center py-0.5">
                      <span className="text-xs text-zinc-500 text-center leading-snug px-2">
                        {msg.text}
                      </span>
                    </div>
                  );
                }

                return (
                  <div
                    key={msg.id}
                    className="flex items-start gap-2.5 group animate-fade-in"
                  >
                    {/* Clean User Avatar Badge */}
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 mt-0.5 shadow-sm border border-white/15"
                      style={{
                        backgroundColor: msg.senderColor || '#9146FF',
                      }}
                    >
                      {msg.senderAvatar && msg.senderAvatar.length <= 2
                        ? msg.senderAvatar
                        : getInitials(msg.senderName)}
                    </div>

                    {/* Borderless Message Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-baseline gap-2 min-w-0">
                          <span
                            className="text-xs font-bold truncate"
                            style={{ color: msg.senderColor || '#BF94FF' }}
                          >
                            {msg.senderName}
                          </span>
                          <span className="text-[0.68rem] font-mono text-[#ADADB8] shrink-0">
                            {formatTime(msg.timestamp)}
                          </span>
                        </div>
                        {canManageMedia && onPinMessage && (
                          <button
                            type="button"
                            onClick={() => {
                              triggerHaptic('light');
                              onPinMessage(msg.id);
                            }}
                            title={pickLang(lang, {
                              es: 'Fijar mensaje en la sala',
                              ca: 'Fixar missatge a la sala',
                              en: 'Pin message in room',
                            })}
                            aria-label={pickLang(lang, {
                              es: 'Fijar mensaje',
                              ca: 'Fixar missatge',
                              en: 'Pin message',
                            })}
                            className="opacity-0 group-hover:opacity-100 focus:opacity-100 w-6 h-6 rounded-md hover:bg-white/10 text-zinc-400 hover:text-[#BF94FF] flex items-center justify-center shrink-0 cursor-pointer transition-opacity"
                          >
                            <Pin className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      <p className="text-sm text-[#EFEFF1] leading-relaxed break-words select-text mt-0.5">
                        {onSeekToTimestamp
                          ? msg.text
                              .split(/(\b(?:\d{1,2}:)?\d{1,2}:\d{2}\b)/g)
                              .map((part, i) => {
                                if (/^(?:\d{1,2}:)?\d{1,2}:\d{2}$/.test(part)) {
                                  const secs = parseTimestampToSeconds(part);
                                  if (secs !== null) {
                                    return (
                                      <button
                                        key={i}
                                        type="button"
                                        onClick={() => {
                                          triggerHaptic('light');
                                          onSeekToTimestamp(secs);
                                        }}
                                        className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded-md bg-[#9146FF]/20 hover:bg-[#9146FF]/35 border border-[#9146FF]/45 font-mono text-xs font-bold text-[#BF94FF] cursor-pointer"
                                        title={pickLang(lang, {
                                          es: `Saltar a ${part}`,
                                          ca: `Saltar a ${part}`,
                                          en: `Jump to ${part}`,
                                        })}
                                      >
                                        <Clock className="w-2.5 h-2.5" />
                                        <span>{part}</span>
                                      </button>
                                    );
                                  }
                                }
                                return <React.Fragment key={i}>{part}</React.Fragment>;
                              })
                          : msg.text}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={chatEndRef} />
          </div>

          {/* FLOATING REACTION PILL (Hovering above the chat input) */}
          <AnimatePresence>
            {showFloatingReactions && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.94 }}
                transition={{ duration: 0.16 }}
                className="absolute inset-x-2 bottom-17 z-20 flex justify-center pointer-events-none"
              >
                <div className="pointer-events-auto inline-flex items-center gap-0.5 px-2 py-1 rounded-full bg-[#10121C]/95 backdrop-blur-2xl border border-white/[0.14] shadow-[0_12px_32px_rgba(0,0,0,0.82)] max-w-full overflow-x-auto no-scrollbar">
                  {QUICK_REACTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => onSendReaction(emoji)}
                      className="w-8 h-8 rounded-full hover:bg-white/[0.12] active:scale-125 transition-transform flex items-center justify-center text-base shrink-0 cursor-pointer"
                      title={pickLang(lang, {
                        es: `Enviar ${emoji}`,
                        ca: `Enviar ${emoji}`,
                        en: `Send ${emoji}`,
                      })}
                      aria-label={pickLang(lang, {
                        es: `Enviar reacción ${emoji}`,
                        ca: `Enviar reacció ${emoji}`,
                        en: `Send reaction ${emoji}`,
                      })}
                    >
                      {emoji}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setShowFloatingReactions(false)}
                    className="w-7 h-7 rounded-full hover:bg-white/15 text-[#ADADB8] hover:text-white flex items-center justify-center shrink-0 cursor-pointer ml-0.5 sticky right-0 bg-[#10121C]/95"
                    title={pickLang(lang, {
                      es: 'Ocultar barra de emojis',
                      ca: 'Amagar barra d’emojis',
                      en: 'Hide emoji bar',
                    })}
                    aria-label={pickLang(lang, {
                      es: 'Ocultar emojis',
                      ca: 'Amagar emojis',
                      en: 'Hide emojis',
                    })}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Typing indicator above input */}
          {typingUsers.filter((u) => u.userId !== currentUser.id).length > 0 && (
            <div className="px-3.5 py-1 text-[11px] text-[#ADADB8] bg-[#0D0F18] border-t border-white/[0.06] truncate">
              {typingUsers
                .filter((u) => u.userId !== currentUser.id)
                .map((u) => u.userName)
                .join(', ')}{' '}
              {pickLang(lang, {
                es: 'está escribiendo...',
                ca: 'està escrivint...',
                en: 'is typing...',
              })}
            </div>
          )}

          {/* FLOATING CIRCULAR VOICE MIC BUTTON IN WORLD SALA MODE */}
          {worldSalaMode && voiceChat && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('medium');
                if (!voiceChat.isJoined) {
                  void voiceChat.joinVoice();
                } else {
                  voiceChat.toggleMute();
                }
              }}
              title={
                !voiceChat.isJoined
                  ? pickLang(lang, { es: 'Unirse al chat de voz', ca: 'Unir-se a la veu', en: 'Join voice chat' })
                  : voiceChat.isMuted
                  ? pickLang(lang, { es: 'Activar micrófono', ca: 'Activar micròfon', en: 'Unmute microphone' })
                  : pickLang(lang, { es: 'Silenciar micrófono', ca: 'Silenciar micròfon', en: 'Mute microphone' })
              }
              aria-label={
                !voiceChat.isJoined
                  ? pickLang(lang, { es: 'Activar voz', ca: 'Activar veu', en: 'Join voice' })
                  : voiceChat.isMuted
                  ? pickLang(lang, { es: 'Activar micrófono', ca: 'Activar micròfon', en: 'Unmute mic' })
                  : pickLang(lang, { es: 'Silenciar micrófono', ca: 'Silenciar micròfon', en: 'Mute mic' })
              }
              className={`absolute right-3 bottom-19 z-20 w-12 h-12 rounded-full flex items-center justify-center border shadow-[0_10px_24px_rgba(0,0,0,0.6)] cursor-pointer active:scale-95 transition-all ${
                !voiceChat.isJoined
                  ? 'bg-[#22222B] hover:bg-[#9146FF] border-white/15 text-zinc-200 hover:text-white'
                  : voiceChat.isMuted
                  ? 'bg-[#EB0400]/20 border-[#EB0400]/55 text-rose-200'
                  : 'bg-[#00F593]/20 border-[#00F593]/60 text-[#00F593]'
              }`}
            >
              {voiceChat.isJoined && voiceChat.isMuted ? (
                <MicOff className="w-5 h-5" />
              ) : (
                <Mic className="w-5 h-5" />
              )}
            </button>
          )}

          {/* Chat Input Bar */}
          <form
            onSubmit={handleSend}
            className="p-2.5 border-t border-white/[0.08] bg-[#0D0F18]/95 backdrop-blur-xl flex items-center gap-1.5 shrink-0 z-20 pb-[max(0.625rem,env(safe-area-inset-bottom))]"
          >
            {!showFloatingReactions && (
              <IconButton
                type="button"
                onClick={() => setShowFloatingReactions(true)}
                variant="ghost"
                title={pickLang(lang, {
                  es: 'Mostrar reacciones',
                  ca: 'Mostrar reaccions',
                  en: 'Show reactions',
                })}
                aria-label={pickLang(lang, {
                  es: 'Mostrar reacciones',
                  ca: 'Mostrar reaccions',
                  en: 'Show reactions',
                })}
              >
                <Smile className="w-5 h-5 text-[#ADADB8]" />
              </IconButton>
            )}

            {currentVideoTimeSec > 1 && (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  const stamp = formatChatVideoStamp(currentVideoTimeSec);
                  setInputText((prev) =>
                    prev ? `${prev.trim()} ${stamp} ` : `${stamp} `
                  );
                }}
                title={pickLang(lang, {
                  es: 'Insertar minuto exacto del vídeo',
                  ca: 'Inserir minut exacte del vídeo',
                  en: 'Insert current video timestamp',
                })}
                aria-label={pickLang(lang, {
                  es: 'Insertar minuto actual',
                  ca: 'Inserir minut actual',
                  en: 'Insert current timestamp',
                })}
                className="min-h-11 px-2.5 rounded-xl bg-[#26262C] hover:bg-white/[0.12] border border-white/[0.08] font-mono text-[11px] font-bold text-[#EFEFF1] hover:text-white flex items-center gap-1 shrink-0 cursor-pointer transition-colors"
              >
                <Clock className="w-3.5 h-3.5 text-[#BF94FF]" />
                <span className="hidden sm:inline">
                  {formatChatVideoStamp(currentVideoTimeSec)}
                </span>
              </button>
            )}

            <StandardInput
              type="text"
              value={inputText}
              onChange={(e) => {
                const val = e.target.value;
                setInputText(val);
                onTypingChange?.(val.trim().length > 0);
              }}
              placeholder={t.chatPlaceholder}
              rightElement={
                <button
                  type="submit"
                  disabled={!inputText.trim()}
                  aria-label={pickLang(lang, {
                    es: 'Enviar mensaje',
                    ca: 'Enviar missatge',
                    en: 'Send message',
                  })}
                  className="w-9 h-9 rounded-xl bg-[#9146FF] hover:bg-[#772CE8] disabled:opacity-30 text-white flex items-center justify-center transition-all active:scale-90 cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                </button>
              }
            />
          </form>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 2: QUEUE & POLLS (Progressive Disclosure)                        */}
      {/* ==================================================================== */}
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

      {/* ==================================================================== */}
      {/* TAB 2B: AMIGOS EN SALA Y CONECTADOS (World Sala full screen only)    */}
      {/* ==================================================================== */}
      {worldSalaMode && activeTab === 'friends' && (
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
                        {isTvDevice ? '📺' : getInitials(p.name)}
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
                  <SecondaryButton onClick={handleShareInvite} className="flex-1">
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
                            {getInitials(friend.name)}
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
      )}

      {/* ==================================================================== */}
      {/* TAB 3: ROOM & PARTICIPANTS (Clean View + Bottom Sheets for Tools)    */}
      {/* ==================================================================== */}
      {activeTab === 'room' && (
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
                  onClick={() => void handleCopyRoomCode()}
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
                  onClick={() => setShowQrInviteSheet(true)}
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
                  onClick={() => setShowRoomSettingsSheet(true)}
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

              <SecondaryButton onClick={handleShareInvite} fullWidth className="whitespace-nowrap">
                {copiedLink ? (
                  <>
                    <Check className="w-4 h-4 text-[#00F593] shrink-0" />
                    <span>{t.copied}</span>
                  </>
                ) : (
                  <>
                    <Share2 className="w-4 h-4 text-[#BF94FF] shrink-0" />
                    <span>
                      {pickLang(lang, { es: 'Compartir', ca: 'Compartir', en: 'Share' })}
                    </span>
                  </>
                )}
              </SecondaryButton>
            </div>

            <SecondaryButton
              onClick={() => setShowTvRemoteSheet(true)}
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
                        {isTvDevice ? '📺' : getInitials(p.name)}
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
                            {p.role === 'mod'
                              ? pickLang(lang, {
                                  es: `✓ ${t.modLabel}`,
                                  ca: `✓ ${t.modLabel}`,
                                  en: `✓ ${t.modLabel}`,
                                })
                              : pickLang(lang, {
                                  es: `+ ${t.modLabel}`,
                                  ca: `+ ${t.modLabel}`,
                                  en: `+ ${t.modLabel}`,
                                })}
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

          {/* Saved Friends & Direct In-App Invite Section (Single Unified Entry Point) */}
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
                            {getInitials(friend.name)}
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

          <div className="pt-2">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('medium');
                if (confirmLeave) {
                  onLeaveRoom();
                  setConfirmLeave(false);
                } else {
                  setConfirmLeave(true);
                  setTimeout(() => setConfirmLeave(false), 3200);
                }
              }}
              className={`w-full min-h-11 px-4 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition-all ${
                confirmLeave
                  ? 'bg-[#EB0400] hover:bg-red-600 border-[#EB0400] text-white'
                  : 'bg-red-500/10 hover:bg-red-500/20 border-red-500/30 text-red-300 hover:text-red-200'
              }`}
            >
              <LogOut className={`w-4 h-4 shrink-0 ${confirmLeave ? 'text-white' : 'text-red-400'}`} />
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

      {/* SALA OPTIONS BOTTOM SHEET (WORLD SALA MODE) */}
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
                <SecondaryButton
                  onClick={() => {
                    void handleShareInvite();
                  }}
                >
                  <Copy className="w-4 h-4 text-[#BF94FF]" />
                  <span>{copiedLink ? t.copied : pickLang(lang, { es: 'Copiar', ca: 'Copiar', en: 'Copy' })}</span>
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
              <span>{pickLang(lang, { es: 'Enviar por WhatsApp', ca: 'Enviar per WhatsApp', en: 'Send on WhatsApp' })}</span>
            </a>
          </div>

          {/* Voice Bar inside options sheet for full peer controls */}
          {voiceChat && <GameVoiceBar lang={lang} voice={voiceChat} />}

          {/* Queue */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                {pickLang(lang, { es: `Cola (${roomQueue.length})`, ca: `Cua (${roomQueue.length})`, en: `Queue (${roomQueue.length})` })}
              </span>
            </div>
            <div className="rounded-2xl border border-white/[0.08] overflow-hidden max-h-72 overflow-y-auto custom-scrollbar">
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
                        {p.avatar && p.avatar.length <= 2 ? p.avatar : getInitials(p.name)}
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

          {/* Connected TV Remote (Only shown if TV connected) + Room Settings + Leave */}
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
                <span>{pickLang(lang, { es: 'Mando TV', ca: 'Comandament TV', en: 'TV Remote' })}</span>
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
              <span>{pickLang(lang, { es: 'Ajustes de sala', ca: 'Ajustos de sala', en: 'Room settings' })}</span>
            </SecondaryButton>

            <button
              type="button"
              onClick={() => {
                triggerHaptic('medium');
                if (confirmLeave) {
                  setShowSalaOptionsSheet(false);
                  onLeaveRoom();
                  setConfirmLeave(false);
                } else {
                  setConfirmLeave(true);
                  setTimeout(() => setConfirmLeave(false), 3200);
                }
              }}
              className={`w-full min-h-11 px-4 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition-all ${
                confirmLeave
                  ? 'bg-[#EB0400] hover:bg-red-600 border-[#EB0400] text-white'
                  : 'bg-red-500/10 hover:bg-red-500/20 border-red-500/30 text-red-300 hover:text-red-200'
              }`}
            >
              <LogOut className={`w-4 h-4 shrink-0 ${confirmLeave ? 'text-white' : 'text-red-400'}`} />
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
    </aside>
  );
};
