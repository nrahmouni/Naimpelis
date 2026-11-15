import React, { useState, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { User } from 'firebase/auth';
import {
  Send,
  Users,
  MessageSquare,
  Share2,
  Check,
  Shield,
  Edit3,
  Crown,
  Lock,
  Unlock,
  ListVideo,
  BarChart2,
  Trash2,
  Play,
  Bookmark,
  KeyRound,
  Tv,
  QrCode,
  SlidersHorizontal,
  Smile,
  X,
  Link2,
  Globe,
  Maximize2,
  LogOut,
  UserCheck,
  UserPlus,
  Clock,
  ThumbsUp,
  Plus,
  ChevronUp,
  Gamepad2,
  Pin,
  ArrowUp,
  ArrowDown,
  RotateCcw,
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
  BoardClockMinutes,
  BoardCoord,
  BoardGameState,
  BoardGameType,
  ChessPromotionPiece,
  PartyColor,
  PartyGameState,
  PartyGameType,
} from '../types';
import { RoomBoardGamePanel } from './RoomBoardGamePanel';
import { PartyGamesStage } from './PartyGamesStage';
import type { TypingUserPayload } from '../shared/protocol';
import { UI_COPY, pickLang } from '../utils/i18n';
import { buildShortInviteUrl } from '../utils/shortLink';
import { deriveFriendCode } from '../utils/storage';
import { triggerHaptic } from '../utils/haptics';
import {
  EffectiveViewMode,
  ViewModeSwitchButton,
} from './MobileViewportGuard';
import {
  PrimaryButton,
  SecondaryButton,
  IconButton,
  StandardInput,
  BottomSheet,
  SegmentedControl,
  EmptyStateCard,
  HapticTvRemote,
} from './ui/DesignSystem';
import { PosterImage } from './ui/PosterImage';

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
  currentVideoTimeSec?: number;
  onSeekToTimestamp?: (seconds: number) => void;
  onPlayCustomUrl: (rawUrl: string) => void;
  onOpenCloudBrowser: (url: string) => void;
  onStartPollFromQueue: () => void;
  onVotePoll: (pollId: string, optionId: string) => void;
  onClosePoll: (pollId: string) => void;
  initialView?: 'chat' | 'queue' | 'room';
  openQueueTrigger?: number;
  hideInternalTabs?: boolean;
  isKeyboardOpen?: boolean;
  onOpenFloatingChatOnVideo?: () => void;
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
  onLeaveRoom: () => void;
  gameState?: BoardGameState | null;
  gameMoveError?: string | null;
  onStartBoardGame?: (
    gameType: BoardGameType,
    soloLocal?: boolean,
    clockMinutes?: BoardClockMinutes
  ) => void;
  onJoinGameSeat?: (side: 'w' | 'b' | 'spectate') => void;
  onSendGameMove?: (from: BoardCoord, to: BoardCoord, promotionPiece?: ChessPromotionPiece) => void;
  onResignBoardGame?: () => void;
  onResetBoardGame?: (opts?: {
    gameType?: BoardGameType;
    swapColors?: boolean;
    clockMinutes?: BoardClockMinutes;
  }) => void;
  onCloseBoardGame?: () => void;
  partyGameState?: PartyGameState | null;
  onStartPartyGame?: (gameType: PartyGameType) => void;
  onPartyGameAction?: (
    action: 'roll_dice' | 'move_piece' | 'play_card' | 'draw_card' | 'pass_turn' | 'rematch',
    opts?: { pieceId?: number; cardId?: string; chosenColor?: PartyColor }
  ) => void;
  onClosePartyGame?: () => void;
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
  onLeaveRoom,
  gameState = null,
  gameMoveError = null,
  onStartBoardGame,
  onJoinGameSeat,
  onSendGameMove,
  onResignBoardGame,
  onResetBoardGame,
  onCloseBoardGame,
  partyGameState = null,
  onStartPartyGame,
  onPartyGameAction,
  onClosePartyGame,
}) => {
  const t = UI_COPY[lang];
  const isHost = currentUser.isHost || currentUser.id === hostId;
  const selfMember = participants.find((p) => p.id === currentUser.id);
  const isCoHost = !isHost && (currentUser.role === 'mod' || selfMember?.role === 'mod');
  const canManageMedia = isHost || isCoHost;
  const [activeTab, setActiveTab] = useState<'chat' | 'queue' | 'games' | 'room'>(initialView);
  const [gamesSubTab, setGamesSubTab] = useState<'board' | 'party'>('board');
  const [undoRemovedItem, setUndoRemovedItem] = useState<RoomQueueItem | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [inputText, setInputText] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [roomNameDraft, setRoomNameDraft] = useState(roomName);
  const [newRoomNameDraft, setNewRoomNameDraft] = useState('');
  const [pinDraft, setPinDraft] = useState(currentHostPin || '');
  const [tvCodeInput, setTvCodeInput] = useState('');
  const [customUrlInput, setCustomUrlInput] = useState('');
  const [profileNameDraft, setProfileNameDraft] = useState(currentUser.name);
  const [showFloatingReactions, setShowFloatingReactions] = useState(false);
  const [pairedCodeLabel, setPairedCodeLabel] = useState<string | null>(null);
  const [forceShowRemote, setForceShowRemote] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  // Progressive Disclosure Bottom Sheets
  const [showUrlLoaderSheet, setShowUrlLoaderSheet] = useState(false);
  const [showRoomSettingsSheet, setShowRoomSettingsSheet] = useState(false);
  const [showTvRemoteSheet, setShowTvRemoteSheet] = useState(false);
  const [showQrInviteSheet, setShowQrInviteSheet] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setActiveTab(initialView);
  }, [initialView]);

  useEffect(() => {
    if (partyGameState && !gameState) {
      setGamesSubTab('party');
    }
  }, [partyGameState, gameState]);

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
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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

  const handleShareInvite = async () => {
    const shareText = activeMediaTitle
      ? pickLang(lang, {
          es: `🍿 Estamos viendo «${activeMediaTitle}» en directo en la sala de ${currentUser.name}. ¡Entra en 1 toque:`,
          ca: `🍿 Estem veient «${activeMediaTitle}» en directe a la sala de ${currentUser.name}. Entra en 1 toc:`,
          en: `🍿 We're watching "${activeMediaTitle}" live in ${currentUser.name}'s room. Join in 1 tap:`,
        })
      : pickLang(lang, {
          es: `🍿 Únete a nuestra sala de cine y fútbol en directo (${roomName}):`,
          ca: `🍿 Uneix-te a la nostra sala de cinema i futbol en directe (${roomName}):`,
          en: `🍿 Join our live cinema & sports watch room (${roomName}):`,
        });

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `${roomName} — NAIM CINE`,
          text: shareText,
          url: inviteUrl,
        });
        return;
      } catch {
        // Fallback to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(`${shareText}\n${inviteUrl}`);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      // ignore
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
    const locale = lang === 'ca' ? 'ca-ES' : lang === 'en' ? 'en-US' : 'es-ES';
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

  const totalVotes =
    activePoll?.options.reduce((acc, o) => acc + o.voterIds.length, 0) || 0;

  return (
    <aside className="w-full h-full flex flex-col bg-[#18181B] border-l border-white/[0.08] select-none overflow-hidden relative">
      {/* ==================================================================== */}
      {/* ULTRA-COMPACT CORNER TABS BAR (LEAVES CHAT OPEN & UNOBSTRUCTED)      */}
      {/* ==================================================================== */}
      {(!hideInternalTabs || showMenusButton) && (
        <div className="px-2.5 py-1.5 border-b border-white/[0.06] flex items-center justify-between gap-2 shrink-0 bg-[#18181B]/95 backdrop-blur-xl z-20">
          <div className="flex items-center gap-1.5 min-w-0">
            {showMenusButton && onShowMenus ? (
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
                className="h-7 px-2 rounded-lg bg-white/[0.07] hover:bg-white/[0.14] border border-white/[0.1] text-[11px] font-semibold text-zinc-100 flex items-center gap-1 whitespace-nowrap cursor-pointer active:scale-95 transition-all shrink-0"
              >
                <ChevronUp className="w-3 h-3 text-[#BF94FF]" />
                <span>{pickLang(lang, { es: 'Menús', ca: 'Menús', en: 'Menus' })}</span>
              </button>
            ) : (
              <span className="text-[11px] font-semibold text-zinc-400 truncate pl-0.5">
                {activeTab === 'chat'
                  ? t.tabChat
                  : activeTab === 'queue'
                  ? pickLang(lang, { es: 'Cola', ca: 'Cua', en: 'Queue' })
                  : activeTab === 'games'
                  ? pickLang(lang, { es: 'Juegos', ca: 'Jocs', en: 'Games' })
                  : t.tabRoom}
              </span>
            )}
          </div>

          {!hideInternalTabs && (
          <div className="flex items-center gap-1 shrink-0 ml-auto">
            <SegmentedControl
              compact
              value={activeTab}
              onChange={setActiveTab}
              options={[
                {
                  id: 'chat',
                  label: t.tabChat,
                  icon: <MessageSquare className="w-3 h-3 shrink-0" />,
                },
                {
                  id: 'queue',
                  label: pickLang(lang, { es: 'Cola', ca: 'Cua', en: 'Queue' }),
                  icon: <ListVideo className="w-3 h-3 shrink-0" />,
                  badge: roomQueue.length,
                },
                {
                  id: 'games',
                  label: pickLang(lang, { es: 'Juegos', ca: 'Jocs', en: 'Games' }),
                  icon: <Gamepad2 className="w-3 h-3 shrink-0" />,
                  badge: gameState && gameState.status !== 'finished' ? '●' : undefined,
                },
                {
                  id: 'room',
                  label: t.tabRoom,
                  icon: <Users className="w-3 h-3 shrink-0" />,
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
                className="w-7 h-7 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] flex items-center justify-center text-[#BF94FF] cursor-pointer shrink-0 transition-colors"
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
                className={`w-7 h-7 rounded-lg border flex items-center justify-center cursor-pointer shrink-0 transition-colors ${
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
          {/* Active Poll Banner (if open) */}
          {activePoll && !activePoll.isClosed && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mx-3 mt-2.5 p-3.5 rounded-2xl nc-specular-surface border border-[#9146FF]/40 space-y-2.5 shrink-0 shadow-lg"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#BF94FF]">
                  <BarChart2 className="w-3.5 h-3.5" />
                  <span>
                    {pickLang(lang, {
                      es: 'Encuesta en Vivo',
                      ca: 'Enquesta en Directe',
                      en: 'Live Poll',
                    })}
                  </span>
                </div>
                {canManageMedia && (
                  <button
                    type="button"
                    onClick={() => onClosePoll(activePoll.id)}
                    className="text-xs text-[#ADADB8] hover:text-white cursor-pointer"
                  >
                    {pickLang(lang, { es: 'Cerrar', ca: 'Tancar', en: 'Close' })}
                  </button>
                )}
              </div>
              <p className="text-xs font-bold text-white">{activePoll.question}</p>
              <div className="space-y-1.5">
                {activePoll.options.map((opt) => {
                  const votes = opt.voterIds.length;
                  const pct = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
                  const voted = opt.voterIds.includes(currentUser.id);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onVotePoll(activePoll.id, opt.id)}
                      className={`w-full relative overflow-hidden rounded-xl border px-3 py-2 text-left transition-all cursor-pointer ${
                        voted
                          ? 'border-[#9146FF]/65 bg-[#9146FF]/20'
                          : 'border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08]'
                      }`}
                    >
                      <motion.div
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: Math.max(0, pct / 100) }}
                        transition={{ type: 'spring', stiffness: 260, damping: 28 }}
                        className="absolute inset-y-0 left-0 w-full origin-left bg-[#9146FF]/30"
                      />
                      <div className="relative flex items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-white truncate">
                          {opt.item.title}
                        </span>
                        <span className="text-xs font-mono text-zinc-300 tabular-nums shrink-0">
                          {pct}% ({votes})
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </motion.div>
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
            className={`flex-1 overflow-y-auto px-3.5 py-2.5 space-y-2.5 custom-scrollbar ${
              showFloatingReactions ? 'pb-16' : 'pb-3'
            }`}
          >
            {messages.length === 0 ? (
              <div className="space-y-3">
                <EmptyStateCard
                  icon={<MessageSquare className="w-6 h-6" />}
                  title={lang === 'ca' ? 'El xat està tranquil' : lang === 'es' ? 'El chat está tranquilo' : 'Chat is quiet'}
                  description={
                    lang === 'ca'
                      ? 'Saluda el grup o envia una reacció en directe.'
                      : lang === 'es'
                        ? 'Saluda al grupo o lanza una reacción en vivo mientras veis la sala.'
                        : 'Say hi to your room or send a live reaction.'
                  }
                />
                <div className="flex flex-wrap items-center justify-center gap-1.5 px-2">
                  {(lang === 'ca'
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
              messages.map((msg) => {
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
                <div className="pointer-events-auto inline-flex items-center gap-0.5 px-2 py-1 rounded-full bg-[#141418]/95 backdrop-blur-2xl border border-white/[0.14] shadow-[0_12px_32px_rgba(0,0,0,0.82)] max-w-full overflow-x-auto no-scrollbar">
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
                    className="w-7 h-7 rounded-full hover:bg-white/15 text-[#ADADB8] hover:text-white flex items-center justify-center shrink-0 cursor-pointer ml-0.5 sticky right-0 bg-[#141418]/95"
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
            <div className="px-3.5 py-1 text-[11px] text-[#ADADB8] bg-[#18181B] border-t border-white/[0.06] truncate">
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

          {/* Chat Input Bar */}
          <form
            onSubmit={handleSend}
            className="p-2.5 border-t border-white/[0.08] bg-[#18181B]/95 backdrop-blur-xl flex items-center gap-1.5 shrink-0 z-20"
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
        <div className="flex-1 overflow-y-auto p-3.5 space-y-4 custom-scrollbar">
          {/* Action Header */}
          <div className="flex items-center justify-between gap-2">
            <div>
              <h4 className="text-sm font-bold text-white">
                {pickLang(lang, {
                  es: 'Cola de Reproducción',
                  ca: 'Cua de Reproducció',
                  en: 'Playback Queue',
                })}
              </h4>
              <p className="text-xs text-zinc-400">
                {roomQueue.length}{' '}
                {roomQueue.length === 1
                  ? pickLang(lang, {
                      es: 'vídeo en lista',
                      ca: 'vídeo en llista',
                      en: 'video in queue',
                    })
                  : pickLang(lang, {
                      es: 'vídeos en lista',
                      ca: 'vídeos en llista',
                      en: 'videos in queue',
                    })}
              </p>
            </div>
            {canManageMedia && (
              <div className="flex items-center gap-2">
                {roomQueue.length >= 2 && (
                  <SecondaryButton onClick={onStartPollFromQueue}>
                    <BarChart2 className="w-4 h-4 text-[#BF94FF]" />
                    <span>
                      {pickLang(lang, {
                        es: 'Votar Cola',
                        ca: 'Votar Cua',
                        en: 'Vote Queue',
                      })}
                    </span>
                  </SecondaryButton>
                )}

                <SecondaryButton onClick={() => setShowUrlLoaderSheet(true)}>
                  <Link2 className="w-4 h-4 text-sky-400" />
                  <span>
                    {pickLang(lang, { es: 'Enlace', ca: 'Enllaç', en: 'Link' })}
                  </span>
                </SecondaryButton>
              </div>
            )}
          </div>

          {!canManageMedia && (
            <div className="px-3 py-2 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-amber-200 text-xs flex items-center gap-2">
              <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>
                {pickLang(lang, {
                  es: 'Solo el Anfitrión o un Co-anfitrión puede cambiar de película o canal. Puedes votar los títulos en cola.',
                  ca: 'Només l’Amfitrió o un Co-amfitrió pot canviar de pel·lícula o canal. Pots votar els títols a la cua.',
                  en: 'Only the Host or a Co-host can change movies or channels. You can vote on queued items.',
                })}
              </span>
            </div>
          )}

          {roomQueue.length === 0 ? (
            <EmptyStateCard
              icon={<ListVideo className="w-6 h-6" />}
              title={pickLang(lang, {
                es: 'La cola está vacía',
                ca: 'La cua és buida',
                en: 'Queue is empty',
              })}
              description={
                canManageMedia
                  ? pickLang(lang, {
                      es: 'Añade películas, episodios o vídeos desde el catálogo con el botón + Cola, o abre un enlace directo.',
                      ca: 'Afegeix pel·lícules, episodis o vídeos des del catàleg amb el botó + Cua, o obre un enllaç directe.',
                      en: 'Add movies, episodes, or videos from the catalog with + Queue, or open a direct link.',
                    })
                  : pickLang(lang, {
                      es: 'Puedes sugerir películas o vídeos a la cola con el botón + Cola para que el Anfitrión los ponga.',
                      ca: 'Pots suggerir pel·lícules o vídeos a la cua amb el botó + Cua perquè l’Amfitrió els posi.',
                      en: 'Suggest movies or videos to the queue with + Queue for the Host to play.',
                    })
              }
              actionLabel={
                canManageMedia
                  ? pickLang(lang, {
                      es: 'Pegar enlace o abrir web',
                      ca: 'Enganxar enllaç o obrir web',
                      en: 'Paste link or open web',
                    })
                  : undefined
              }
              onAction={canManageMedia ? () => setShowUrlLoaderSheet(true) : undefined}
            />
          ) : (
            <div className="space-y-2.5">
              {undoRemovedItem && onRestoreQueueItem && (
                <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-400/35 flex items-center justify-between gap-2">
                  <span className="text-xs text-amber-100 truncate">
                    {pickLang(lang, {
                      es: `Quitado "${undoRemovedItem.title}"`,
                      ca: `Tret "${undoRemovedItem.title}"`,
                      en: `Removed "${undoRemovedItem.title}"`,
                    })}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
                      onRestoreQueueItem(undoRemovedItem);
                      setUndoRemovedItem(null);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-amber-400 text-[#140E02] text-xs font-bold flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>{pickLang(lang, { es: 'Deshacer', ca: 'Desfer', en: 'Undo' })}</span>
                  </button>
                </div>
              )}

              {roomQueue.map((item, idx) => (
                <div
                  key={item.id}
                  className="group relative overflow-hidden rounded-2xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.07] p-2.5 flex items-center gap-3 transition-all"
                >
                  <div className="relative w-20 aspect-video rounded-xl overflow-hidden bg-black shrink-0">
                    <PosterImage
                      src={item.poster}
                      alt={item.title}
                      aspect="none"
                      className="w-full h-full"
                      fallbackIcon={
                        <span className="text-xs font-mono text-zinc-500">#{idx + 1}</span>
                      }
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/75 to-transparent flex items-end p-1.5 pointer-events-none">
                      <span className="text-[0.65rem] font-mono font-bold text-white">
                        #{idx + 1}
                      </span>
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-white truncate">
                      {item.title}
                    </div>
                    <div className="text-xs text-zinc-400 truncate mt-0.5">
                      {pickLang(lang, {
                        es: `Añadido por ${item.addedBy}`,
                        ca: `Afegit per ${item.addedBy}`,
                        en: `Added by ${item.addedBy}`,
                      })}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {onVoteQueueItem && (
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          onVoteQueueItem(item.id);
                        }}
                        title={pickLang(lang, {
                          es: 'Votar este título en la cola',
                          ca: 'Votar aquest títol a la cua',
                          en: 'Vote for this title in queue',
                        })}
                        aria-label={pickLang(lang, {
                          es: 'Votar este título en la cola',
                          ca: 'Votar aquest títol a la cua',
                          en: 'Vote for this title in queue',
                        })}
                        className={`min-h-9 px-2 rounded-xl text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors ${
                          item.voterIds?.includes(currentUser.id)
                            ? 'bg-[#9146FF]/25 border border-[#9146FF]/55 text-[#BF94FF]'
                            : 'bg-[#26262C] hover:bg-white/[0.12] text-[#EFEFF1]'
                        }`}
                      >
                        <ThumbsUp className="w-3 h-3" />
                        <span>{item.voterIds?.length || 0}</span>
                      </button>
                    )}
                    {canManageMedia && (
                      <>
                        {onReorderQueueItem && roomQueue.length > 1 && (
                          <div className="flex items-center gap-0.5">
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => {
                                triggerHaptic('light');
                                onReorderQueueItem(item.id, 'up');
                              }}
                              aria-label={pickLang(lang, { es: 'Subir en la cola', ca: 'Pujar a la cua', en: 'Move up' })}
                              className="w-7 h-8 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] disabled:opacity-30 flex items-center justify-center text-zinc-300 cursor-pointer disabled:cursor-not-allowed"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === roomQueue.length - 1}
                              onClick={() => {
                                triggerHaptic('light');
                                onReorderQueueItem(item.id, 'down');
                              }}
                              aria-label={pickLang(lang, { es: 'Bajar en la cola', ca: 'Baixar a la cua', en: 'Move down' })}
                              className="w-7 h-8 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] disabled:opacity-30 flex items-center justify-center text-zinc-300 cursor-pointer disabled:cursor-not-allowed"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                        {idx > 0 && onPromoteQueueItem && (
                          <button
                            type="button"
                            onClick={() => {
                              triggerHaptic('light');
                              onPromoteQueueItem(item.id);
                            }}
                            title={pickLang(lang, {
                              es: 'Poner siguiente en reproducirse',
                              ca: 'Posar següent a reproduir-se',
                              en: 'Move to play next',
                            })}
                            aria-label={pickLang(lang, {
                              es: 'Poner siguiente en reproducirse',
                              ca: 'Posar següent a reproduir-se',
                              en: 'Move to play next',
                            })}
                            className="min-h-8 px-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-[10px] font-bold text-zinc-300 hover:text-white flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            <span>↑ #1</span>
                          </button>
                        )}
                        <IconButton
                          onClick={() => onPlayQueueItem(item)}
                          variant="crimson"
                          title={pickLang(lang, {
                            es: 'Reproducir ahora',
                            ca: 'Reproduir ara',
                            en: 'Play now',
                          })}
                          aria-label={pickLang(lang, {
                            es: 'Reproducir ahora',
                            ca: 'Reproduir ara',
                            en: 'Play now',
                          })}
                        >
                          <Play className="w-4 h-4 fill-current" />
                        </IconButton>
                        <IconButton
                          onClick={() => handleQueueDeleteWithUndo(item)}
                          variant="ghost"
                          title={pickLang(lang, {
                            es: 'Quitar de la cola',
                            ca: 'Treure de la cua',
                            en: 'Remove from queue',
                          })}
                          aria-label={pickLang(lang, {
                            es: 'Quitar de la cola',
                            ca: 'Treure de la cua',
                            en: 'Remove from queue',
                          })}
                        >
                          <Trash2 className="w-4 h-4 text-zinc-400 hover:text-rose-400" />
                        </IconButton>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 3: ONLINE MULTIPLAYER BOARD & PARTY GAMES (4P + 1V1)             */}
      {/* ==================================================================== */}
      {activeTab === 'games' && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="px-3 py-2 border-b border-white/[0.07] bg-[#0B0B10] flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setGamesSubTab('board');
              }}
              className={`flex-1 min-h-8 px-2.5 rounded-lg text-[11px] font-bold whitespace-nowrap cursor-pointer transition-colors ${
                gamesSubTab === 'board'
                  ? 'bg-[#9146FF] text-white'
                  : 'bg-white/[0.05] text-zinc-300 hover:bg-white/[0.1]'
              }`}
            >
              {pickLang(lang, { es: '1v1 Tablero', ca: '1v1 Tauler', en: '1v1 Board' })}
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setGamesSubTab('party');
              }}
              className={`flex-1 min-h-8 px-2.5 rounded-lg text-[11px] font-bold whitespace-nowrap cursor-pointer transition-colors ${
                gamesSubTab === 'party'
                  ? 'bg-[#9146FF] text-white'
                  : 'bg-white/[0.05] text-zinc-300 hover:bg-white/[0.1]'
              }`}
            >
              {pickLang(lang, { es: 'Parchís & UNO 4P', ca: 'Parxís & UNO 4P', en: 'Ludo & UNO 4P' })}
            </button>
          </div>

          {gamesSubTab === 'board' ? (
            <RoomBoardGamePanel
              gameState={gameState}
              currentUser={currentUser}
              lang={lang}
              moveError={gameMoveError}
              onStartGame={(gt, solo, clockMin) => onStartBoardGame?.(gt, solo, clockMin)}
              onJoinSeat={(side) => onJoinGameSeat?.(side)}
              onMove={(from, to, promo) => onSendGameMove?.(from, to, promo)}
              onResign={() => onResignBoardGame?.()}
              onReset={(opts) => onResetBoardGame?.(opts)}
              onCloseGame={() => onCloseBoardGame?.()}
              onBack={hideInternalTabs ? () => setActiveTab('room') : undefined}
            />
          ) : (
            <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
              <PartyGamesStage
                lang={lang}
                currentUser={currentUser}
                participants={participants}
                partyGameState={partyGameState}
                isOffline={false}
                onStartOnline={onStartPartyGame}
                onOnlineAction={onPartyGameAction}
                onCloseOnline={onClosePartyGame}
                onBack={hideInternalTabs ? () => setActiveTab('room') : undefined}
              />
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 4: ROOM & PARTICIPANTS (Clean View + Bottom Sheets for Tools)    */}
      {/* ==================================================================== */}
      {activeTab === 'room' && (
        <div className="flex-1 overflow-y-auto p-3.5 space-y-4 custom-scrollbar">
          {/* Primary Action Card: Room Info + Share Link & TV Remote */}
          <div className="p-4 rounded-3xl nc-specular-surface border border-white/[0.1] space-y-3.5">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="text-base font-bold text-white truncate">{roomName}</h4>
                  {hasPin && <KeyRound className="w-4 h-4 text-amber-400 shrink-0" />}
                </div>
                <p className="text-xs text-zinc-400 font-mono mt-0.5">
                  {pickLang(lang, { es: 'Código:', ca: 'Codi:', en: 'Code:' })}{' '}
                  <span className="text-white font-bold">{roomId}</span>
                </p>
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

            <div className="grid grid-cols-2 gap-2.5">
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
          </div>

          {/* Quick Launcher for Online Room Board Games */}
          <div className="p-3.5 rounded-2xl bg-gradient-to-r from-[#9146FF]/15 via-[#1C1C24] to-[#1C1C24] border border-[#9146FF]/35 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-[#9146FF]/20 border border-[#9146FF]/40 flex items-center justify-center text-[#DFCCFF] shrink-0">
                <Gamepad2 className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-white truncate">
                  {partyGameState
                    ? partyGameState.gameType === 'parchis'
                      ? pickLang(lang, { es: 'Parchís 4P en curso', ca: 'Parxís 4P actiu', en: '4P Ludo active' })
                      : pickLang(lang, { es: 'UNO 4P en curso', ca: 'UNO 4P actiu', en: '4P UNO active' })
                    : gameState
                    ? gameState.gameType === 'chess'
                      ? pickLang(lang, { es: 'Partida de Ajedrez en curso', ca: 'Partida d’Escacs activa', en: 'Chess match active' })
                      : gameState.gameType === 'connect4'
                      ? pickLang(lang, { es: 'Conecta 4 en curso', ca: 'Connecta 4 actiu', en: 'Connect 4 active' })
                      : pickLang(lang, { es: 'Partida de Damas en curso', ca: 'Partida de Dames activa', en: 'Checkers match active' })
                    : pickLang(lang, { es: 'Juegos Online en Sala', ca: 'Jocs Online a la Sala', en: 'Online Room Games' })}
                </div>
                <div className="text-[11px] text-zinc-400 truncate">
                  {pickLang(lang, {
                    es: 'Parchís, UNO, Conecta 4, Damas y Ajedrez',
                    ca: 'Parxís, UNO, Connecta 4, Dames i Escacs',
                    en: 'Ludo, UNO, Connect 4, Checkers & Chess',
                  })}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setActiveTab('games');
              }}
              className="min-h-9 px-3 rounded-xl bg-[#9146FF] hover:bg-[#772CE8] text-xs font-bold text-white whitespace-nowrap shrink-0 cursor-pointer active:scale-95 transition-all"
            >
              {gameState || partyGameState
                ? pickLang(lang, { es: 'Ver Juego', ca: 'Veure Joc', en: 'Open Game' })
                : pickLang(lang, { es: 'Jugar', ca: 'Jugar', en: 'Play' })}
            </button>
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
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-11 h-11 rounded-full flex items-center justify-center text-base font-bold text-white border border-white/15 shrink-0"
                        style={{ backgroundColor: p.color || '#9146FF' }}
                      >
                        {p.avatar && p.avatar.length <= 2 ? p.avatar : getInitials(p.name)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-white truncate">
                            {p.name}
                          </span>
                          {isSelf && (
                            <span className="text-xs px-2.5 py-0.5 rounded-full bg-white/12 text-zinc-200 font-semibold leading-tight">
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
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative shrink-0">
                          <div
                            className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white border border-white/15"
                            style={{ backgroundColor: friend.color || '#9146FF' }}
                          >
                            {friend.avatar && friend.avatar.length <= 2
                              ? friend.avatar
                              : getInitials(friend.name)}
                          </div>
                          <span
                            className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#18181B] ${
                              isOnline ? 'bg-emerald-400' : 'bg-zinc-600'
                            }`}
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-white truncate">
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
            <SecondaryButton
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
              fullWidth
              className={confirmLeave ? '!bg-[#EB0400] !border-[#EB0400] !text-white' : ''}
            >
              <LogOut className={`w-4 h-4 ${confirmLeave ? 'text-white' : 'text-[#BF94FF]'}`} />
              <span>
                {confirmLeave
                  ? pickLang(lang, {
                      es: '¿Seguro? Pulsa para salir',
                      ca: 'Segur? Prem per sortir',
                      en: 'Sure? Tap to leave',
                    })
                  : t.leaveRoom}
              </span>
            </SecondaryButton>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* BOTTOM SHEET 1: DIRECT LINK / CLOUD BROWSER                          */}
      {/* ==================================================================== */}
      <BottomSheet
        isOpen={showUrlLoaderSheet}
        onClose={() => setShowUrlLoaderSheet(false)}
        lang={lang}
        title={pickLang(lang, {
          es: 'Enlace directo o navegador web',
          ca: 'Enllaç directe o navegador web',
          en: 'Direct link or web browser',
        })}
        subtitle={pickLang(lang, {
          es: 'Reproduce archivos de vídeo directos o abre cualquier web de forma segura',
          ca: 'Reprodueix arxius de vídeo directes o obre qualsevol web de manera segura',
          en: 'Play direct video files or open any website securely',
        })}
        icon={<Link2 className="w-5 h-5" />}
      >
        <div className="space-y-3">
          <StandardInput
            type="url"
            value={customUrlInput}
            onChange={(e) => setCustomUrlInput(e.target.value)}
            placeholder={pickLang(lang, {
              es: 'https://ejemplo.com/stream.m3u8 o web...',
              ca: 'https://exemple.com/stream.m3u8 o web...',
              en: 'https://example.com/stream.m3u8 or website...',
            })}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <PrimaryButton
              disabled={!customUrlInput.trim()}
              onClick={() => {
                if (!customUrlInput.trim()) return;
                onPlayCustomUrl(customUrlInput.trim());
                setCustomUrlInput('');
                setShowUrlLoaderSheet(false);
              }}
              fullWidth
            >
              <Play className="w-4 h-4 fill-current" />
              <span>{t.playNativeBtn}</span>
            </PrimaryButton>
            <SecondaryButton
              disabled={!customUrlInput.trim()}
              onClick={() => {
                if (!customUrlInput.trim()) return;
                onOpenCloudBrowser(customUrlInput.trim());
                setCustomUrlInput('');
                setShowUrlLoaderSheet(false);
              }}
              fullWidth
            >
              <Globe className="w-4 h-4 text-sky-400" />
              <span>{t.openCloudBtn}</span>
            </SecondaryButton>
          </div>
        </div>
      </BottomSheet>

      {/* ==================================================================== */}
      {/* BOTTOM SHEET 2: SMART TV HAPTIC REMOTE / PAIRING                     */}
      {/* ==================================================================== */}
      <BottomSheet
        isOpen={showTvRemoteSheet}
        onClose={() => setShowTvRemoteSheet(false)}
        lang={lang}
        title={
          hasConnectedSmartTv
            ? pickLang(lang, {
                es: 'Mando Haptic Touch TV',
                ca: 'Comandament Haptic Touch TV',
                en: 'Haptic Touch TV Remote',
              })
            : pickLang(lang, {
                es: 'Vincular Smart TV',
                ca: 'Vincular Smart TV',
                en: 'Pair Smart TV',
              })
        }
        subtitle={
          hasConnectedSmartTv
            ? pickLang(lang, {
                es: `Control táctil en tiempo real · ${pairedCodeLabel ? `TV #${pairedCodeLabel}` : 'Sala Activa'}`,
                ca: `Control tàctil en temps real · ${pairedCodeLabel ? `TV #${pairedCodeLabel}` : 'Sala Activa'}`,
                en: `Real-time touch control · ${pairedCodeLabel ? `TV #${pairedCodeLabel}` : 'Active Room'}`,
              })
            : pickLang(lang, {
                es: 'Introduce los 4 dígitos que aparecen en /tv',
                ca: 'Introdueix els 4 dígits que apareixen a /tv',
                en: 'Enter the 4 digits shown on /tv',
              })
        }
        icon={<Tv className="w-5 h-5" />}
      >
        {tvClaimStatus && (
          <div
            className={`p-3 rounded-2xl border text-xs font-semibold ${
              tvClaimStatus.type === 'success'
                ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-200'
                : 'bg-rose-500/15 border-rose-500/35 text-rose-200'
            }`}
          >
            {tvClaimStatus.message}
          </div>
        )}

        {hasConnectedSmartTv ? (
          <div className="space-y-2.5">
            <HapticTvRemote
              pairedTvCode={
                pairedCodeLabel ||
                pickLang(lang, { es: 'ACTIVA', ca: 'ACTIVA', en: 'ACTIVE' })
              }
              onCommand={handleMapTvCommand}
              onDisconnect={() => {
                onSendTvRemoteCommand('disconnect_tv');
                setPairedCodeLabel(null);
                setForceShowRemote(false);
              }}
            />
            <SecondaryButton
              onClick={() => {
                setForceShowRemote(false);
                setPairedCodeLabel(null);
              }}
              fullWidth
              className="!min-h-[38px] !py-1.5 text-xs"
            >
              {pickLang(lang, {
                es: 'Vincular otro televisor con código',
                ca: 'Vincular un altre televisor amb codi',
                en: 'Pair another TV with code',
              })}
            </SecondaryButton>
          </div>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const clean = tvCodeInput.replace(/\D/g, '').slice(0, 4);
              if (clean.length === 4) {
                await onClaimTvCode(clean);
                setPairedCodeLabel(clean);
                setTvCodeInput('');
              }
            }}
            className="space-y-4 text-center"
          >
            <p className="text-xs text-zinc-400">
              {pickLang(lang, { es: 'Abre', ca: 'Obre', en: 'Open' })}{' '}
              <span className="text-white font-mono">{window.location.origin}/tv</span>{' '}
              {pickLang(lang, {
                es: 'en tu televisor e introduce el código de 4 dígitos:',
                ca: 'al teu televisor i introdueix el codi de 4 dígits:',
                en: 'on your TV and enter the 4-digit code:',
              })}
            </p>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              value={tvCodeInput}
              onChange={(e) =>
                setTvCodeInput(e.target.value.replace(/\D/g, '').slice(0, 4))
              }
              placeholder="0000"
              aria-label={pickLang(lang, {
                es: 'Código de 4 dígitos',
                ca: 'Codi de 4 dígits',
                en: '4-digit pairing code',
              })}
              className="w-full h-16 rounded-2xl bg-[#0E0E10] border-2 border-white/15 focus:border-[#9146FF] text-center font-mono text-3xl font-bold tracking-[0.4em] text-white focus:outline-none"
            />
            <PrimaryButton
              type="submit"
              disabled={tvCodeInput.length !== 4}
              fullWidth
              size="lg"
            >
              <Tv className="w-4 h-4" />
              <span>
                {pickLang(lang, {
                  es: 'Conectar Smart TV',
                  ca: 'Connectar Smart TV',
                  en: 'Connect Smart TV',
                })}
              </span>
            </PrimaryButton>
            <SecondaryButton
              type="button"
              onClick={() => setForceShowRemote(true)}
              fullWidth
            >
              {pickLang(lang, {
                es: 'Abrir Mando Haptic Touch directamente',
                ca: 'Obrir Comandament Haptic Touch directament',
                en: 'Open Haptic Touch Remote directly',
              })}
            </SecondaryButton>
          </form>
        )}
      </BottomSheet>

      {/* ==================================================================== */}
      {/* BOTTOM SHEET 3: QR INVITE                                            */}
      {/* ==================================================================== */}
      <BottomSheet
        isOpen={showQrInviteSheet}
        onClose={() => setShowQrInviteSheet(false)}
        lang={lang}
        title={pickLang(lang, {
          es: 'Código QR de Invitación',
          ca: 'Codi QR d’Invitació',
          en: 'Invitation QR Code',
        })}
        subtitle={roomName}
        icon={<QrCode className="w-5 h-5" />}
      >
        <div className="flex flex-col items-center gap-4 py-2">
          <div className="p-3 rounded-3xl bg-white shadow-xl">
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
                inviteUrl
              )}`}
              alt={pickLang(lang, {
                es: 'QR Sala',
                ca: 'QR Sala',
                en: 'Room QR',
              })}
              className="w-44 h-44 rounded-xl"
            />
          </div>
          <p className="text-xs text-zinc-400 text-center max-w-xs">
            {pickLang(lang, {
              es: 'Escanea con la cámara del móvil para entrar directamente a esta sala.',
              ca: 'Escaneja amb la càmera del mòbil per entrar directament a aquesta sala.',
              en: 'Scan with your phone camera to join this room directly.',
            })}
          </p>
          <PrimaryButton onClick={handleShareInvite} fullWidth>
            <Share2 className="w-4 h-4" />
            <span>
              {pickLang(lang, {
                es: 'Compartir enlace corto',
                ca: 'Compartir enllaç curt',
                en: 'Share short link',
              })}
            </span>
          </PrimaryButton>
        </div>
      </BottomSheet>

      {/* ==================================================================== */}
      {/* BOTTOM SHEET 4: PROGRESSIVE DISCLOSURE ROOM SETTINGS                 */}
      {/* ==================================================================== */}
      <BottomSheet
        isOpen={showRoomSettingsSheet}
        onClose={() => setShowRoomSettingsSheet(false)}
        lang={lang}
        title={pickLang(lang, {
          es: 'Ajustes y Seguridad de Sala',
          ca: 'Ajustos i Seguretat de Sala',
          en: 'Room Settings & Security',
        })}
        subtitle={pickLang(lang, {
          es: 'Personaliza tu nombre, permisos, PIN y preferencias',
          ca: 'Personalitza el teu nom, permisos, PIN i preferències',
          en: 'Customize your display name, permissions, PIN & preferences',
        })}
        icon={<Shield className="w-5 h-5" />}
      >
        {/* 0. User Display Name */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
            <UserCheck className="w-3.5 h-3.5 text-[#BF94FF]" />
            <span>
              {pickLang(lang, {
                es: 'Tu nombre en la sala',
                ca: 'El teu nom a la sala',
                en: 'Your name in room',
              })}
            </span>
          </label>
          <div className="flex items-center gap-2">
            <StandardInput
              type="text"
              value={profileNameDraft}
              onChange={(e) => setProfileNameDraft(e.target.value)}
            />
            <PrimaryButton
              onClick={() => {
                if (profileNameDraft.trim()) {
                  onUpdateProfile(
                    profileNameDraft.trim(),
                    currentUser.avatar,
                    currentUser.color
                  );
                }
              }}
            >
              {pickLang(lang, { es: 'Guardar', ca: 'Desar', en: 'Save' })}
            </PrimaryButton>
          </div>
        </div>

        {/* 1. Rename Room */}
        {isHost && (
          <div className="space-y-2 pt-2 border-t border-white/[0.07]">
            <label className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
              <Edit3 className="w-3.5 h-3.5 text-[#BF94FF]" />
              <span>
                {pickLang(lang, {
                  es: 'Nombre de la sala',
                  ca: 'Nom de la sala',
                  en: 'Room name',
                })}
              </span>
            </label>
            <div className="flex items-center gap-2">
              <StandardInput
                type="text"
                value={roomNameDraft}
                onChange={(e) => setRoomNameDraft(e.target.value)}
              />
              <PrimaryButton
                onClick={() => {
                  if (roomNameDraft.trim()) {
                    onRenameRoom(roomNameDraft.trim());
                  }
                }}
              >
                {pickLang(lang, { es: 'Guardar', ca: 'Desar', en: 'Save' })}
              </PrimaryButton>
            </div>
          </div>
        )}

        {/* 2. Toggles: Host Lock & Permanent Room */}
        <div className="space-y-2 pt-2 border-t border-white/[0.07]">
          <SecondaryButton
            onClick={() => onToggleHostLock(!hostOnlyControl)}
            disabled={!isHost}
            active={hostOnlyControl}
            fullWidth
            className="!justify-between"
          >
            <span className="flex items-center gap-2">
              {hostOnlyControl ? (
                <Lock className="w-4 h-4 text-amber-400" />
              ) : (
                <Unlock className="w-4 h-4 text-emerald-400" />
              )}
              <span>
                {pickLang(lang, {
                  es: 'Control de Reproducción (Solo Anfitrión / Co-anfitrión)',
                  ca: 'Control de Reproducció (Només Amfitrió / Co-amfitrió)',
                  en: 'Playback Control (Host / Co-host Only)',
                })}
              </span>
            </span>
            <span className="text-xs font-mono uppercase">
              {hostOnlyControl
                ? pickLang(lang, { es: 'ACTIVO', ca: 'ACTIU', en: 'ON' })
                : pickLang(lang, { es: 'PAUSA LIBRE', ca: 'PAUSA LLIURE', en: 'PLAY/PAUSE OPEN' })}
            </span>
          </SecondaryButton>
          <p className="text-[11px] text-zinc-400 px-1 leading-relaxed">
            {pickLang(lang, {
              es: 'Solo el creador de la sala es Anfitrión y puede cambiar canales o películas. Asigna Co-anfitriones en la lista de participantes para compartir ese control.',
              ca: 'Només el creador de la sala és Amfitrió i pot canviar canals o pel·lícules. Assigna Co-amfitrions a la llista de participants per compartir aquest control.',
              en: 'Only the room creator is Host and can change channels or movies. Assign Co-hosts in the participants list to share media control.',
            })}
          </p>

          <SecondaryButton
            onClick={onTogglePermanentRoom}
            disabled={!isHost}
            active={isCurrentRoomPermanent}
            fullWidth
            className="!justify-between"
          >
            <span className="flex items-center gap-2">
              <Bookmark className="w-4 h-4 text-[#BF94FF]" />
              <span>
                {pickLang(lang, {
                  es: 'Sala Permanente 24/7',
                  ca: 'Sala Permanent 24/7',
                  en: '24/7 Permanent Room',
                })}
              </span>
            </span>
            <span className="text-xs font-mono uppercase">
              {isCurrentRoomPermanent
                ? pickLang(lang, { es: 'GUARDADA', ca: 'DESADA', en: 'SAVED' })
                : pickLang(lang, { es: 'TEMPORAL', ca: 'TEMPORAL', en: 'TEMP' })}
            </span>
          </SecondaryButton>
        </div>

        {/* 3. Room 4-Digit PIN */}
        {isHost && (
          <div className="space-y-2 pt-2 border-t border-white/[0.07]">
            <label className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-amber-400" />
              <span>
                {pickLang(lang, {
                  es: `PIN de 4 dígitos ${hasPin ? '(Activo)' : '(Opcional)'}`,
                  ca: `PIN de 4 dígits ${hasPin ? '(Actiu)' : '(Opcional)'}`,
                  en: `4-digit PIN ${hasPin ? '(Active)' : '(Optional)'}`,
                })}
              </span>
            </label>
            <div className="flex items-center gap-2">
              <StandardInput
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pinDraft}
                onChange={(e) =>
                  setPinDraft(e.target.value.replace(/\D/g, '').slice(0, 4))
                }
                placeholder={
                  hasPin
                    ? pickLang(lang, {
                        es: 'Cambiar PIN (4 dígitos)',
                        ca: 'Canviar PIN (4 dígits)',
                        en: 'Change PIN (4 digits)',
                      })
                    : pickLang(lang, {
                        es: 'Ej. 1234',
                        ca: 'Ex. 1234',
                        en: 'e.g. 1234',
                      })
                }
              />
              <PrimaryButton
                disabled={pinDraft.length !== 4}
                onClick={() => {
                  if (pinDraft.length === 4) {
                    onSetRoomPin(pinDraft);
                    setPinDraft('');
                  }
                }}
              >
                {pickLang(lang, { es: 'Activar', ca: 'Activar', en: 'Enable' })}
              </PrimaryButton>
              {hasPin && (
                <SecondaryButton onClick={() => onSetRoomPin('')}>
                  {pickLang(lang, { es: 'Quitar', ca: 'Treure', en: 'Remove' })}
                </SecondaryButton>
              )}
            </div>
          </div>
        )}

        {/* 4. Create New Room */}
        {onCreateNewRoom && (
          <div className="space-y-2 pt-2 border-t border-white/[0.07]">
            <label className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5 text-[#BF94FF]" />
              <span>
                {pickLang(lang, {
                  es: 'Crear nueva sala',
                  ca: 'Crear nova sala',
                  en: 'Create new room',
                })}
              </span>
            </label>
            <div className="flex items-center gap-2">
              <StandardInput
                type="text"
                value={newRoomNameDraft}
                onChange={(e) => setNewRoomNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    onCreateNewRoom(newRoomNameDraft.trim() || undefined);
                    setNewRoomNameDraft('');
                    setShowRoomSettingsSheet(false);
                  }
                }}
                placeholder={pickLang(lang, {
                  es: 'Nombre opcional (ej. Noche de Cine)',
                  ca: 'Nom opcional (ex. Nit de Cinema)',
                  en: 'Optional name (e.g. Movie Night)',
                })}
              />
              <PrimaryButton
                onClick={() => {
                  onCreateNewRoom(newRoomNameDraft.trim() || undefined);
                  setNewRoomNameDraft('');
                  setShowRoomSettingsSheet(false);
                }}
              >
                <Plus className="w-4 h-4" />
                <span>
                  {pickLang(lang, { es: 'Crear', ca: 'Crear', en: 'Create' })}
                </span>
              </PrimaryButton>
            </div>
          </div>
        )}

        {/* 5. View Mode Switcher */}
        <div className="pt-2 border-t border-white/[0.07] flex items-center justify-between">
          <span className="text-xs text-zinc-400">
            {pickLang(lang, {
              es: 'Formato de pantalla',
              ca: 'Format de pantalla',
              en: 'Screen layout',
            })}
          </span>
          <ViewModeSwitchButton
            effectiveView={effectiveView}
            onToggle={onToggleViewMode}
            lang={lang}
          />
        </div>
      </BottomSheet>
    </aside>
  );
};
