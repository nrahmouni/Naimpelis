import React, { useState, useRef, useEffect } from 'react';
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
import type { TypingUserPayload } from '../shared/protocol';
import { UI_COPY } from '../utils/i18n';
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
  onVoteQueueItem?: (id: string) => void;
  onSetParticipantRole?: (userId: string, role: RoomRole) => void;
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
  onVoteQueueItem,
  onSetParticipantRole,
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
}) => {
  const t = UI_COPY[lang];
  const isHost = currentUser.isHost || currentUser.id === hostId;
  const [activeTab, setActiveTab] = useState<'chat' | 'queue' | 'room'>(initialView);
  const [inputText, setInputText] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [roomNameDraft, setRoomNameDraft] = useState(roomName);
  const [newRoomNameDraft, setNewRoomNameDraft] = useState('');
  const [pinDraft, setPinDraft] = useState(currentHostPin || '');
  const [tvCodeInput, setTvCodeInput] = useState('');
  const [customUrlInput, setCustomUrlInput] = useState('');
  const [profileNameDraft, setProfileNameDraft] = useState(currentUser.name);
  const [showFloatingReactions, setShowFloatingReactions] = useState(true);
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
      ? `🍿 Estamos viendo «${activeMediaTitle}» en directo en la sala de ${currentUser.name}. ¡Entra en 1 toque:`
      : `🍿 Únete a nuestra sala de cine y fútbol en directo (${roomName}):`;

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
    return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
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
    <aside className="w-full h-full flex flex-col bg-[#08080C] border-l border-white/[0.06] select-none overflow-hidden relative">
      {/* ==================================================================== */}
      {/* FLOATING MINIMALIST SEGMENTED CONTROL HEADER                         */}
      {/* ==================================================================== */}
      {!hideInternalTabs && (
        <div className="px-3 pt-2.5 pb-2 border-b border-white/[0.06] flex items-center gap-2 shrink-0 bg-[#08080C]/90 backdrop-blur-xl z-20">
          <SegmentedControl
            className="flex-1"
            value={activeTab}
            onChange={setActiveTab}
            options={[
              {
                id: 'chat',
                label: t.tabChat,
                icon: <MessageSquare className="w-4 h-4 shrink-0" />,
              },
              {
                id: 'queue',
                label: lang === 'es' ? 'Cola' : 'Queue',
                icon: <ListVideo className="w-4 h-4 shrink-0" />,
                badge: roomQueue.length,
              },
              {
                id: 'room',
                label: t.tabRoom,
                icon: <Users className="w-4 h-4 shrink-0" />,
                badge: participants.length,
              },
            ]}
          />

          {onOpenFloatingChatOnVideo && (
            <IconButton
              onClick={onOpenFloatingChatOnVideo}
              variant="glass"
              title="Superponer chat flotante sobre el vídeo"
              aria-label="Chat flotante sobre el vídeo"
            >
              <Maximize2 className="w-4 h-4 text-[#FB7185]" />
            </IconButton>
          )}

          {effectiveView === 'desktop' && (
            <IconButton
              onClick={onOpenFriendsModal || handleShareInvite}
              variant={copiedLink ? 'crimson' : 'glass'}
              title={
                onOpenFriendsModal
                  ? 'Amigos e Invitación Directa'
                  : t.invite
              }
              aria-label={t.invite}
            >
              {copiedLink ? (
                <Check className="w-4 h-4 text-white" />
              ) : (
                <UserPlus className="w-4 h-4 text-[#FB7185]" />
              )}
            </IconButton>
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
            <div className="mx-3 mt-2.5 p-3.5 rounded-2xl bg-[#12121A]/95 border border-[#E11D48]/35 space-y-2.5 shrink-0 shadow-lg">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#FB7185]">
                  <BarChart2 className="w-3.5 h-3.5" />
                  <span>Encuesta en Vivo</span>
                </div>
                {isHost && (
                  <button
                    type="button"
                    onClick={() => onClosePoll(activePoll.id)}
                    className="text-xs text-zinc-400 hover:text-white cursor-pointer"
                  >
                    Cerrar
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
                          ? 'border-[#E11D48]/60 bg-[#E11D48]/15'
                          : 'border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06]'
                      }`}
                    >
                      <div
                        className="absolute inset-y-0 left-0 bg-[#E11D48]/20 transition-all duration-300"
                        style={{ width: `${pct}%` }}
                      />
                      <div className="relative flex items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-white truncate">
                          {opt.item.title}
                        </span>
                        <span className="text-xs font-mono text-zinc-300 shrink-0">
                          {pct}% ({votes})
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Borderless Chat Stream */}
          <div className="flex-1 overflow-y-auto px-3.5 py-3 space-y-3 custom-scrollbar pb-20">
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
                  {[
                    '👋 ¡Hola a todos!',
                    '🍿 ¡Empezamos!',
                    '🔥 ¡Qué pasada!',
                    '⏸️ Un segundo porfa',
                  ].map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        onSendMessage(chip);
                      }}
                      className="min-h-9 px-3 rounded-xl bg-white/[0.06] hover:bg-[#E11D48]/25 border border-white/10 text-xs font-medium text-zinc-200 cursor-pointer transition-colors"
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
                        backgroundColor: msg.senderColor || '#E11D48',
                      }}
                    >
                      {msg.senderAvatar && msg.senderAvatar.length <= 2
                        ? msg.senderAvatar
                        : getInitials(msg.senderName)}
                    </div>

                    {/* Borderless Message Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span
                          className="text-xs font-bold truncate"
                          style={{ color: msg.senderColor || '#FB7185' }}
                        >
                          {msg.senderName}
                        </span>
                        <span className="text-[0.68rem] font-mono text-zinc-500 shrink-0">
                          {formatTime(msg.timestamp)}
                        </span>
                      </div>
                      <p className="text-sm text-zinc-100 leading-relaxed break-words select-text mt-0.5">
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
                                        className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded-md bg-[#E11D48]/20 hover:bg-[#E11D48]/35 border border-[#E11D48]/40 font-mono text-xs font-bold text-[#FB7185] cursor-pointer"
                                        title={`Saltar a ${part}`}
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
          {showFloatingReactions && (
            <div className="absolute inset-x-2 bottom-17 z-20 flex justify-center pointer-events-none animate-fade-in">
              <div className="pointer-events-auto inline-flex items-center gap-0.5 px-2 py-1 rounded-full bg-[#0E0F16]/95 backdrop-blur-2xl border border-white/[0.12] shadow-[0_12px_32px_rgba(0,0,0,0.75)] max-w-full overflow-x-auto no-scrollbar">
                {QUICK_REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => onSendReaction(emoji)}
                    className="w-8 h-8 rounded-full hover:bg-white/[0.12] active:scale-125 transition-all flex items-center justify-center text-base shrink-0 cursor-pointer"
                    title={`Enviar ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setShowFloatingReactions(false)}
                  className="w-7 h-7 rounded-full hover:bg-white/15 text-zinc-300 hover:text-white flex items-center justify-center shrink-0 cursor-pointer ml-0.5 sticky right-0 bg-[#0E0F16]/90"
                  title="Ocultar barra de emojis"
                  aria-label="Ocultar emojis"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Typing indicator above input */}
          {typingUsers.filter((u) => u.userId !== currentUser.id).length > 0 && (
            <div className="px-3.5 py-1 text-[11px] text-zinc-400 bg-[#0B0B10]/85 border-t border-white/[0.04] truncate">
              {typingUsers
                .filter((u) => u.userId !== currentUser.id)
                .map((u) => u.userName)
                .join(', ')}{' '}
              {lang === 'en' ? 'is typing...' : lang === 'ca' ? 'està escrivint...' : 'está escribiendo...'}
            </div>
          )}

          {/* Chat Input Bar */}
          <form
            onSubmit={handleSend}
            className="p-2.5 border-t border-white/[0.07] bg-[#0B0B10]/95 backdrop-blur-xl flex items-center gap-1.5 shrink-0 z-20"
          >
            {!showFloatingReactions && (
              <IconButton
                type="button"
                onClick={() => setShowFloatingReactions(true)}
                variant="ghost"
                title="Mostrar reacciones"
                aria-label="Mostrar reacciones"
              >
                <Smile className="w-5 h-5 text-zinc-400" />
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
                title="Insertar minuto exacto del vídeo"
                aria-label="Insertar minuto actual"
                className="min-h-11 px-2.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] font-mono text-[11px] font-bold text-zinc-300 hover:text-white flex items-center gap-1 shrink-0 cursor-pointer transition-colors"
              >
                <Clock className="w-3.5 h-3.5 text-[#E11D48]" />
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
                  aria-label="Enviar mensaje"
                  className="w-9 h-9 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] disabled:opacity-30 text-white flex items-center justify-center transition-all active:scale-90 cursor-pointer"
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
                {lang === 'es' ? 'Cola de Reproducción' : 'Playback Queue'}
              </h4>
              <p className="text-xs text-zinc-400">
                {roomQueue.length} {roomQueue.length === 1 ? 'vídeo en lista' : 'vídeos en lista'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {roomQueue.length >= 2 && (
                <SecondaryButton onClick={onStartPollFromQueue}>
                  <BarChart2 className="w-4 h-4 text-[#E11D48]" />
                  <span>Votar Cola</span>
                </SecondaryButton>
              )}

              <SecondaryButton onClick={() => setShowUrlLoaderSheet(true)}>
                <Link2 className="w-4 h-4 text-sky-400" />
                <span>Enlace</span>
              </SecondaryButton>
            </div>
          </div>

          {roomQueue.length === 0 ? (
            <EmptyStateCard
              icon={<ListVideo className="w-6 h-6" />}
              title={lang === 'ca' ? 'La cua és buida' : lang === 'es' ? 'La cola está vacía' : 'Queue is empty'}
              description="Añade películas, episodios o vídeos desde el catálogo con el botón + Cola, o abre un enlace directo."
              actionLabel="Pegar enlace o abrir web"
              onAction={() => setShowUrlLoaderSheet(true)}
            />
          ) : (
            <div className="space-y-2.5">
              {roomQueue.map((item, idx) => (
                <div
                  key={item.id}
                  className="group relative overflow-hidden rounded-2xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.07] p-2.5 flex items-center gap-3 transition-all"
                >
                  <div className="relative w-20 aspect-video rounded-xl overflow-hidden bg-black shrink-0">
                    {item.poster ? (
                      <img
                        src={item.poster}
                        alt={item.title}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs font-mono text-zinc-500">
                        #{idx + 1}
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/75 to-transparent flex items-end p-1.5">
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
                      Añadido por {item.addedBy}
                    </div>
                  </div>

                  {(!hostOnlyControl || isHost) && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      {onVoteQueueItem && (
                        <button
                          type="button"
                          onClick={() => {
                            triggerHaptic('light');
                            onVoteQueueItem(item.id);
                          }}
                          title="Votar este título en la cola"
                          className={`min-h-9 px-2.5 rounded-xl text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors ${
                            item.voterIds?.includes(currentUser.id)
                              ? 'bg-[#E11D48]/25 border border-[#E11D48]/50 text-[#FB7185]'
                              : 'bg-white/[0.06] hover:bg-white/[0.12] text-zinc-300'
                          }`}
                        >
                          <ThumbsUp className="w-3 h-3" />
                          <span>{item.voterIds?.length || 0}</span>
                        </button>
                      )}
                      {idx > 0 && onPromoteQueueItem && (
                        <button
                          type="button"
                          onClick={() => {
                            triggerHaptic('light');
                            onPromoteQueueItem(item.id);
                          }}
                          title="Poner siguiente en reproducirse"
                          className="min-h-9 px-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-[10px] font-bold text-zinc-300 hover:text-white flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <span>↑ #1</span>
                        </button>
                      )}
                      <IconButton
                        onClick={() => onPlayQueueItem(item)}
                        variant="crimson"
                        title="Reproducir ahora"
                      >
                        <Play className="w-4 h-4 fill-current" />
                      </IconButton>
                      <IconButton
                        onClick={() => onRemoveFromQueue(item.id)}
                        variant="ghost"
                        title="Quitar de la cola"
                      >
                        <Trash2 className="w-4 h-4 text-zinc-400 hover:text-rose-400" />
                      </IconButton>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 3: ROOM & PARTICIPANTS (Clean View + Bottom Sheets for Tools)    */}
      {/* ==================================================================== */}
      {activeTab === 'room' && (
        <div className="flex-1 overflow-y-auto p-3.5 space-y-4 custom-scrollbar">
          {/* Primary Action Card: Room Info + Share Link & TV Remote */}
          <div className="p-4 rounded-3xl bg-white/[0.03] border border-white/[0.08] space-y-3.5">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="text-base font-bold text-white truncate">{roomName}</h4>
                  {hasPin && <KeyRound className="w-4 h-4 text-amber-400 shrink-0" />}
                </div>
                <p className="text-xs text-zinc-400 font-mono mt-0.5">
                  Código: <span className="text-white font-bold">{roomId}</span>
                </p>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <IconButton
                  onClick={() => setShowQrInviteSheet(true)}
                  title="Ver Código QR de la Sala"
                  aria-label="Código QR"
                >
                  <QrCode className="w-4 h-4 text-[#FB7185]" />
                </IconButton>
                <IconButton
                  onClick={() => setShowRoomSettingsSheet(true)}
                  title="Ajustes de Sala"
                  aria-label="Ajustes de Sala"
                >
                  <SlidersHorizontal className="w-4 h-4" />
                </IconButton>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <SecondaryButton onClick={handleShareInvite} fullWidth className="whitespace-nowrap">
                {copiedLink ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{t.copied}</span>
                  </>
                ) : (
                  <>
                    <Share2 className="w-4 h-4 text-[#FB7185] shrink-0" />
                    <span>Compartir</span>
                  </>
                )}
              </SecondaryButton>

              <SecondaryButton
                onClick={() => setShowTvRemoteSheet(true)}
                active={hasConnectedSmartTv}
                fullWidth
                className="whitespace-nowrap"
              >
                <Tv className="w-4 h-4 text-[#E11D48] shrink-0" />
                <span>{hasConnectedSmartTv ? 'TV Activa' : 'Mando TV'}</span>
              </SecondaryButton>
            </div>
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
              <span className="text-xs text-emerald-400 font-medium flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Sala en vivo
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
                        style={{ backgroundColor: p.color || '#E11D48' }}
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
                              ? '📺 En Smart TV'
                              : isRoomPlaying
                              ? '▶ Viendo en directo'
                              : activeMediaTitle
                              ? '⏸ En pausa'
                              : 'Sincronizado en sala'}
                          </span>
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {!isSelf && !isTvDevice && onAddFriend && (
                        alreadyFriend ? (
                          <span className="px-2.5 py-1 rounded-xl bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 text-xs font-bold flex items-center gap-1">
                            <Check className="w-3.5 h-3.5" />
                            <span>Amigo</span>
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
                            className="min-h-9 px-3 rounded-xl bg-[#E11D48]/15 hover:bg-[#E11D48]/25 border border-[#E11D48]/35 text-xs font-bold text-[#FB7185] flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all"
                            title="Guardar en tu lista de amigos"
                          >
                            <UserPlus className="w-3.5 h-3.5" />
                            <span>+ Amigo</span>
                          </button>
                        )
                      )}

                      {p.isHost || p.id === hostId ? (
                        <span className="px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/35 text-amber-300 text-xs font-bold flex items-center gap-1.5 leading-tight">
                          <Crown className="w-3.5 h-3.5 shrink-0" />
                          <span>{t.hostLabel}</span>
                        </span>
                      ) : isHost ? (
                        <div className="flex items-center gap-1">
                          {onSetParticipantRole && !isTvDevice && (
                            <button
                              type="button"
                              onClick={() =>
                                onSetParticipantRole(p.id, p.role === 'mod' ? 'viewer' : 'mod')
                              }
                              className={`min-h-9 px-2.5 rounded-xl border text-[11px] font-semibold cursor-pointer ${
                                p.role === 'mod'
                                  ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300'
                                  : 'bg-white/[0.04] hover:bg-white/[0.09] border-white/[0.08] text-zinc-300'
                              }`}
                              title="Alternar rol de Moderador"
                            >
                              <Shield className="w-3 h-3 inline mr-1" />
                              {p.role === 'mod' ? 'Mod' : 'Viewer'}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onTransferHost(p.id)}
                            className="min-h-9 px-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-semibold text-zinc-300 cursor-pointer"
                            title={t.makeHost}
                          >
                            {t.makeHost}
                          </button>
                        </div>
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
                Mis Amigos ({savedFriends.length})
              </span>
              {onOpenFriendsModal && (
                <button
                  type="button"
                  onClick={onOpenFriendsModal}
                  className="text-xs font-semibold text-[#FB7185] hover:underline flex items-center gap-1.5 cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Buscar o añadir amigos</span>
                </button>
              )}
            </div>

            {savedFriends.length === 0 ? (
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.07] space-y-3">
                <p className="text-xs text-zinc-300 leading-relaxed">
                  Añade a tus amigos por su código o desde la sala para invitarlos con 1 toque sin salir de la app.
                </p>
                {onOpenFriendsModal && (
                  <PrimaryButton onClick={onOpenFriendsModal} fullWidth>
                    <UserPlus className="w-4 h-4 shrink-0" />
                    <span>Añadir e Invitar Amigos</span>
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
                            style={{ backgroundColor: friend.color || '#E11D48' }}
                          >
                            {friend.avatar && friend.avatar.length <= 2
                              ? friend.avatar
                              : getInitials(friend.name)}
                          </div>
                          <span
                            className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#08080C] ${
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
                                Ya está en tu sala
                              </span>
                            ) : isOnline ? (
                              <span className="text-emerald-400 font-medium">
                                🟢 En línea en la app
                              </span>
                            ) : (
                              <span className="text-zinc-500">
                                Desconectado · #{friend.friendCode}
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
                          className="min-h-9 px-3.5 rounded-xl bg-[#E11D48] hover:bg-[#F43F5E] text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all shrink-0"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>Invitar</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="pt-2 space-y-2.5">
            {onCreateNewRoom && (
              <SecondaryButton
                onClick={() => {
                  triggerHaptic('medium');
                  onCreateNewRoom();
                }}
                fullWidth
              >
                <Plus className="w-4 h-4 text-[#FB7185] shrink-0" />
                <span>
                  {lang === 'es'
                    ? 'Crear nueva sala'
                    : lang === 'ca'
                    ? 'Crear nova sala'
                    : 'Create new room'}
                </span>
              </SecondaryButton>
            )}

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
              className={confirmLeave ? '!bg-rose-600 !text-white animate-pulse' : ''}
            >
              <LogOut className="w-4 h-4 text-rose-400" />
              <span>
                {confirmLeave
                  ? lang === 'es'
                    ? '¿Seguro? Pulsa para salir'
                    : 'Sure? Tap to leave'
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
        title="Enlace directo o navegador web"
        subtitle="Reproduce archivos de vídeo directos o abre cualquier web de forma segura"
        icon={<Link2 className="w-5 h-5" />}
      >
        <div className="space-y-3">
          <StandardInput
            type="url"
            value={customUrlInput}
            onChange={(e) => setCustomUrlInput(e.target.value)}
            placeholder="https://ejemplo.com/stream.m3u8 o web..."
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
        title={hasConnectedSmartTv ? 'Mando Haptic Touch TV' : 'Vincular Smart TV'}
        subtitle={
          hasConnectedSmartTv
            ? `Control táctil en tiempo real · ${pairedCodeLabel ? `TV #${pairedCodeLabel}` : 'Sala Activa'}`
            : 'Introduce los 4 dígitos que aparecen en /tv'
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
          <div className="space-y-3">
            <HapticTvRemote
              pairedTvCode={pairedCodeLabel || 'ACTIVA'}
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
            >
              Vincular otro televisor con código
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
              Abre <span className="text-white font-mono">{window.location.origin}/tv</span> en tu televisor e introduce el código de 4 dígitos:
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
              className="w-full h-16 rounded-2xl bg-black/75 border-2 border-white/15 focus:border-[#E11D48] text-center font-mono text-3xl font-bold tracking-[0.4em] text-white focus:outline-none"
            />
            <PrimaryButton
              type="submit"
              disabled={tvCodeInput.length !== 4}
              fullWidth
              size="lg"
            >
              <Tv className="w-4 h-4" />
              <span>Conectar Smart TV</span>
            </PrimaryButton>
            <SecondaryButton
              type="button"
              onClick={() => setForceShowRemote(true)}
              fullWidth
            >
              Abrir Mando Haptic Touch directamente
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
        title="Código QR de Invitación"
        subtitle={roomName}
        icon={<QrCode className="w-5 h-5" />}
      >
        <div className="flex flex-col items-center gap-4 py-2">
          <div className="p-3 rounded-3xl bg-white shadow-xl">
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
                inviteUrl
              )}`}
              alt="QR Sala"
              className="w-44 h-44 rounded-xl"
            />
          </div>
          <p className="text-xs text-zinc-400 text-center max-w-xs">
            Escanea con la cámara del móvil para entrar directamente a esta sala.
          </p>
          <PrimaryButton onClick={handleShareInvite} fullWidth>
            <Share2 className="w-4 h-4" />
            <span>Compartir enlace corto</span>
          </PrimaryButton>
        </div>
      </BottomSheet>

      {/* ==================================================================== */}
      {/* BOTTOM SHEET 4: PROGRESSIVE DISCLOSURE ROOM SETTINGS                 */}
      {/* ==================================================================== */}
      <BottomSheet
        isOpen={showRoomSettingsSheet}
        onClose={() => setShowRoomSettingsSheet(false)}
        title="Ajustes y Seguridad de Sala"
        subtitle="Personaliza tu nombre, permisos, PIN y preferencias"
        icon={<Shield className="w-5 h-5" />}
      >
        {/* 0. User Display Name */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
            <UserCheck className="w-3.5 h-3.5 text-[#E11D48]" />
            <span>Tu nombre en la sala</span>
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
              Guardar
            </PrimaryButton>
          </div>
        </div>

        {/* 1. Rename Room */}
        {isHost && (
          <div className="space-y-2 pt-2 border-t border-white/[0.07]">
            <label className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
              <Edit3 className="w-3.5 h-3.5 text-[#E11D48]" />
              <span>Nombre de la sala</span>
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
                Guardar
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
              <span>Modo Anfitrión (Solo Host controla el vídeo)</span>
            </span>
            <span className="text-xs font-mono uppercase">
              {hostOnlyControl ? 'ACTIVO' : 'LIBRE'}
            </span>
          </SecondaryButton>

          <SecondaryButton
            onClick={onTogglePermanentRoom}
            disabled={!isHost}
            active={isCurrentRoomPermanent}
            fullWidth
            className="!justify-between"
          >
            <span className="flex items-center gap-2">
              <Bookmark className="w-4 h-4 text-[#FB7185]" />
              <span>Sala Permanente 24/7</span>
            </span>
            <span className="text-xs font-mono uppercase">
              {isCurrentRoomPermanent ? 'GUARDADA' : 'TEMPORAL'}
            </span>
          </SecondaryButton>
        </div>

        {/* 3. Room 4-Digit PIN */}
        {isHost && (
          <div className="space-y-2 pt-2 border-t border-white/[0.07]">
            <label className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-amber-400" />
              <span>PIN de 4 dígitos {hasPin ? '(Activo)' : '(Opcional)'}</span>
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
                placeholder={hasPin ? 'Cambiar PIN (4 dígitos)' : 'Ej. 1234'}
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
                Activar
              </PrimaryButton>
              {hasPin && (
                <SecondaryButton onClick={() => onSetRoomPin('')}>
                  Quitar
                </SecondaryButton>
              )}
            </div>
          </div>
        )}

        {/* 4. Create New Room */}
        {onCreateNewRoom && (
          <div className="space-y-2 pt-2 border-t border-white/[0.07]">
            <label className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5 text-[#E11D48]" />
              <span>
                {lang === 'es'
                  ? 'Crear nueva sala'
                  : lang === 'ca'
                  ? 'Crear nova sala'
                  : 'Create new room'}
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
                placeholder={
                  lang === 'es'
                    ? 'Nombre opcional (ej. Noche de Cine)'
                    : 'Optional name (e.g. Movie Night)'
                }
              />
              <PrimaryButton
                onClick={() => {
                  onCreateNewRoom(newRoomNameDraft.trim() || undefined);
                  setNewRoomNameDraft('');
                  setShowRoomSettingsSheet(false);
                }}
              >
                <Plus className="w-4 h-4" />
                <span>{lang === 'es' ? 'Crear' : 'Create'}</span>
              </PrimaryButton>
            </div>
          </div>
        )}

        {/* 5. View Mode Switcher */}
        <div className="pt-2 border-t border-white/[0.07] flex items-center justify-between">
          <span className="text-xs text-zinc-400">Formato de pantalla</span>
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
