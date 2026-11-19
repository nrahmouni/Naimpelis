import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Clock,
  MessageSquare,
  Mic,
  MicOff,
  Pin,
  Send,
  Smile,
  X,
} from 'lucide-react';
import type { AppLanguage, ChatMessage, Participant, RoomPollState } from '../../types';
import type { GameVoiceChatState } from '../../hooks/useGameVoiceChat';
import type { TypingUserPayload } from '../../shared/protocol';
import { UI_COPY, pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import { EmptyStateCard, IconButton, StandardInput } from '../ui/DesignSystem';
import { PartyPollCard } from './PartyPollCard';
import { GameVoiceBar } from '../games/GameVoiceBar';
import { PartyChatVoiceStrip, getParticipantInitials } from './PartyChatVoiceStrip';

export { getParticipantInitials };

const QUICK_REACTIONS = ['🔥', '😂', '❤️', '👏', '😱', '⚽', '🍿', '🎉'];

export function formatChatVideoStamp(sec: number): string {
  const total = Math.max(0, Math.floor(sec));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function parseTimestampToSeconds(token: string): number | null {
  const parts = token.split(':').map((n) => Number(n));
  if (parts.some((n) => !Number.isFinite(n) || n < 0)) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

interface PartyChatTabProps {
  lang: AppLanguage;
  currentUser: Participant;
  participants: Participant[];
  messages: ChatMessage[];
  activePoll: RoomPollState | null;
  canManageMedia: boolean;
  pinnedMessage: ChatMessage | null;
  typingUsers: TypingUserPayload[];
  currentVideoTimeSec: number;
  worldSalaMode: boolean;
  voiceChat?: GameVoiceChatState;
  onOpenInviteAction: () => void;
  onVotePoll: (pollId: string, optionId: string) => void;
  onClosePoll: (pollId: string) => void;
  onPinMessage?: (messageId: string) => void;
  onUnpinMessage?: () => void;
  onSeekToTimestamp?: (seconds: number) => void;
  onSendMessage: (text: string) => void;
  onSendReaction: (emoji: string) => void;
  onTypingChange?: (isTyping: boolean) => void;
}

export const PartyChatTab: React.FC<PartyChatTabProps> = ({
  lang,
  currentUser,
  participants,
  messages,
  activePoll,
  canManageMedia,
  pinnedMessage,
  typingUsers,
  currentVideoTimeSec,
  worldSalaMode,
  voiceChat,
  onOpenInviteAction,
  onVotePoll,
  onClosePoll,
  onPinMessage,
  onUnpinMessage,
  onSeekToTimestamp,
  onSendMessage,
  onSendReaction,
  onTypingChange,
}) => {
  const t = UI_COPY[lang];
  const [inputText, setInputText] = useState('');
  const [showFloatingReactions, setShowFloatingReactions] = useState(false);
  const chatListRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    const raf = window.requestAnimationFrame(() => {
      if (chatListRef.current) {
        chatListRef.current.scrollTop = chatListRef.current.scrollHeight;
      } else {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    });
    return () => window.cancelAnimationFrame(raf);
  }, [messages.length]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText.trim());
    setInputText('');
    onTypingChange?.(false);
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    const locale =
      lang === 'ca' ? 'ca-ES' : lang === 'en' ? 'en-US' : lang === 'zh' ? 'zh-CN' : 'es-ES';
    return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      {voiceChat &&
        (voiceChat.isJoined ||
          voiceChat.voicePeers.length > 0 ||
          Boolean(voiceChat.errorMessage) ||
          voiceChat.audioPlaybackBlocked) && (
          <div className="px-3 pt-2 shrink-0">
            <GameVoiceBar lang={lang} voice={voiceChat} compact />
          </div>
        )}

      <PartyChatVoiceStrip
        lang={lang}
        currentUser={currentUser}
        participants={participants}
        voiceChat={voiceChat}
        onOpenInviteAction={onOpenInviteAction}
      />

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
                {pickLang(lang, { es: 'Fijado por sala', ca: 'Fixat', en: 'Pinned' })} ·{' '}
                {pinnedMessage.senderName}
              </div>
              <p className="text-xs text-white line-clamp-2 break-words">
                {pinnedMessage.text}
              </p>
            </div>
          </div>
          {canManageMedia && onUnpinMessage && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onUnpinMessage();
              }}
              aria-label={pickLang(lang, {
                es: 'Desfijar mensaje',
                ca: 'Desfixar missatge',
                en: 'Unpin message',
              })}
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
                ? ['👋 大家好！', '🍿 开始观影！', '🔥 太精彩了！', '⏸️ 稍等一下']
                : lang === 'ca'
                ? ['👋 Hola a tots!', '🍿 Comencem!', '🔥 Quina passada!', '⏸️ Un segon si us plau']
                : lang === 'en'
                ? ['👋 Hey everyone!', '🍿 Let’s start!', '🔥 So good!', '⏸️ One sec please']
                : ['👋 ¡Hola a todos!', '🍿 ¡Empezamos!', '🔥 ¡Qué pasada!', '⏸️ Un segundo porfa']
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
              <div key={msg.id} className="flex items-start gap-2.5 group animate-fade-in">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 mt-0.5 shadow-sm border border-white/15"
                  style={{ backgroundColor: msg.senderColor || '#9146FF' }}
                >
                  {msg.senderAvatar && msg.senderAvatar.length <= 2
                    ? msg.senderAvatar
                    : getParticipantInitials(msg.senderName)}
                </div>

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

      {/* FLOATING REACTION PILL */}
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
              ? pickLang(lang, {
                  es: 'Unirse al chat de voz',
                  ca: 'Unir-se a la veu',
                  en: 'Join voice chat',
                })
              : voiceChat.isMuted
              ? pickLang(lang, {
                  es: 'Activar micrófono',
                  ca: 'Activar micròfon',
                  en: 'Unmute microphone',
                })
              : pickLang(lang, {
                  es: 'Silenciar micrófono',
                  ca: 'Silenciar micròfon',
                  en: 'Mute microphone',
                })
          }
          aria-label={
            !voiceChat.isJoined
              ? pickLang(lang, { es: 'Activar voz', ca: 'Activar veu', en: 'Join voice' })
              : voiceChat.isMuted
              ? pickLang(lang, {
                  es: 'Activar micrófono',
                  ca: 'Activar micròfon',
                  en: 'Unmute mic',
                })
              : pickLang(lang, {
                  es: 'Silenciar micrófono',
                  ca: 'Silenciar micròfon',
                  en: 'Mute mic',
                })
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
              setInputText((prev) => (prev ? `${prev.trim()} ${stamp} ` : `${stamp} `));
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
  );
};
