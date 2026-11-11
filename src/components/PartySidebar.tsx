import React, { useEffect, useRef, useState } from 'react';
import {
  Send,
  Users,
  MessageSquare,
  Crown,
  Share2,
  Tv,
  Check,
  Edit3,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { AppLanguage, ChatMessage, Participant } from '../types';
import { UI_COPY } from '../utils/i18n';
import { triggerHaptic } from '../utils/haptics';
import { buildShortInviteUrl } from '../utils/shortLink';

const QUICK_REACTIONS = ['🔥', '😂', '⚽', '🍿', '🤯', '👏', '❤️'];
const AVATARS = ['🍿', '🎬', '⚽', '🏎️', '🎧', '🦊', '🦁', '⚡'];
const COLORS = ['#e11d48', '#f59e0b', '#10b981', '#0ea5e9', '#8b5cf6', '#ec4899'];

interface PartySidebarProps {
  roomId: string;
  currentUser: Participant;
  hostId: string;
  participants: Participant[];
  messages: ChatMessage[];
  lang: AppLanguage;
  initialView?: 'chat' | 'room';
  hideInternalTabs?: boolean;
  onSendMessage: (text: string) => void;
  onSendReaction: (emoji: string) => void;
  onTransferHost: (newHostId: string) => void;
  onUpdateProfile: (name: string, avatar: string, color: string) => void;
}

export const PartySidebar: React.FC<PartySidebarProps> = ({
  roomId,
  currentUser,
  hostId,
  participants,
  messages,
  lang,
  initialView = 'chat',
  hideInternalTabs = false,
  onSendMessage,
  onSendReaction,
  onTransferHost,
  onUpdateProfile,
}) => {
  const t = UI_COPY[lang];
  const [activeTab, setActiveTab] = useState<'chat' | 'room'>(initialView);
  const [draft, setDraft] = useState('');
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [showTvQr, setShowTvQr] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [editName, setEditName] = useState(currentUser.name);
  const [editAvatar, setEditAvatar] = useState(currentUser.avatar);
  const [editColor, setEditColor] = useState(currentUser.color);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setActiveTab(initialView);
  }, [initialView]);

  useEffect(() => {
    if (activeTab === 'chat') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, activeTab]);

  const inviteUrl = buildShortInviteUrl(roomId, false);
  const tvUrl = buildShortInviteUrl(roomId, true);

  const handleShareOrCopyInvite = async () => {
    triggerHaptic('success');
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `Sala #${roomId.toUpperCase()} · NAIM CINE`,
          text: 'Entra directo a mi sala NAIM CINE:',
          url: inviteUrl,
        });
        return;
      } catch {
        // user cancelled share sheet or unsupported -> fallback to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopiedInvite(true);
      setTimeout(() => setCopiedInvite(false), 2200);
    } catch {
      // ignore
    }
  };

  const handleSubmitMessage = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) return;
    triggerHaptic('light');
    onSendMessage(trimmed);
    setDraft('');
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim()) return;
    triggerHaptic('success');
    onUpdateProfile(editName.trim().slice(0, 24), editAvatar, editColor);
    setEditingProfile(false);
  };

  const isCurrentUserHost = currentUser.id === hostId;

  return (
    <aside className="flex flex-col h-full w-full bg-[#12141D] lg:border-l lg:border-white/[0.08] select-none">
      {/* Desktop Sidebar Segmented Header (hidden on mobile where bottom nav handles switching) */}
      {!hideInternalTabs && (
        <div className="p-2.5 border-b border-white/[0.08] flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('chat')}
            className={`flex-1 min-h-[40px] px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'chat'
                ? 'bg-[#191C28] text-white border border-white/10'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>{t.tabChat}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('room')}
            className={`flex-1 min-h-[40px] px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'room'
                ? 'bg-[#191C28] text-white border border-white/10'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>
              {t.participants} ({participants.length})
            </span>
          </button>
        </div>
      )}

      {/* ================================================================== */}
      {/* TAB 1: REAL-TIME CHAT & REACTIONS                                  */}
      {/* ================================================================== */}
      {activeTab === 'chat' ? (
        <>
          <div className="flex-1 overflow-y-auto overscroll-contain p-3.5 sm:p-4 space-y-3 min-h-0">
            {messages.map((msg) => {
              if (msg.isSystem) {
                return (
                  <div
                    key={msg.id}
                    className="py-1.5 px-3 rounded-xl bg-white/[0.03] text-[11px] text-zinc-400 text-center"
                  >
                    {msg.text}
                  </div>
                );
              }

              const isMe = msg.senderId === currentUser.id;
              const timeStr = new Date(msg.timestamp).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <div
                  key={msg.id}
                  className={`flex items-start gap-2.5 ${isMe ? 'flex-row-reverse' : ''}`}
                >
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center text-sm shrink-0 border border-white/10"
                    style={{ backgroundColor: `${msg.senderColor}22` }}
                  >
                    {msg.senderAvatar}
                  </div>
                  <div
                    className={`max-w-[78%] ${
                      isMe ? 'items-end' : 'items-start'
                    } flex flex-col`}
                  >
                    <div className="flex items-baseline gap-1.5 mb-0.5">
                      <span
                        className="text-xs font-semibold"
                        style={{ color: msg.senderColor }}
                      >
                        {msg.senderName}
                      </span>
                      <span className="text-[10px] font-mono tabular-nums text-zinc-500">
                        {timeStr}
                      </span>
                    </div>
                    <div
                      className={`px-3.5 py-2 rounded-2xl text-xs sm:text-sm leading-relaxed break-words select-text ${
                        isMe
                          ? 'bg-[#E11D48] text-white rounded-tr-sm'
                          : 'bg-[#191C28] text-zinc-100 border border-white/[0.06] rounded-tl-sm'
                      }`}
                    >
                      {msg.text}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Touch-Ergonomic Floating Reaction Bar (>=44px buttons) */}
          <div className="px-2.5 py-1.5 border-t border-white/[0.06] flex items-center justify-between gap-1 shrink-0">
            {QUICK_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  onSendReaction(emoji);
                }}
                className="w-11 h-11 rounded-xl hover:bg-white/[0.08] active:scale-90 flex items-center justify-center text-lg transition-transform cursor-pointer"
                aria-label={`Enviar reacción ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>

          {/* 16px Mobile Chat Input (Zero Auto-Zoom) */}
          <form
            onSubmit={handleSubmitMessage}
            className="p-2.5 sm:p-3 border-t border-white/[0.08] flex items-center gap-2 shrink-0 bg-[#12141D]"
          >
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t.chatPlaceholder}
              maxLength={350}
              className="flex-1 min-w-0 h-11 px-4 rounded-2xl bg-[#090A0F] border border-white/10 focus:border-white/35 text-base sm:text-sm text-white placeholder:text-zinc-500 outline-none"
            />
            <button
              type="submit"
              disabled={!draft.trim()}
              className="w-11 h-11 rounded-2xl bg-[#E11D48] hover:bg-[#BE123C] active:scale-95 disabled:opacity-40 flex items-center justify-center text-white shrink-0 cursor-pointer disabled:cursor-not-allowed transition-all"
              aria-label={t.send}
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </>
      ) : (
        /* ================================================================== */
        /* TAB 2: ROOM MANAGEMENT, NATIVE SHARE, SMART TV QR & PARTICIPANTS   */
        /* ================================================================== */
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-5 min-h-0">
          {/* Room Invite & Smart TV Card */}
          <div className="p-4 rounded-2xl bg-[#090A0F] border border-white/[0.08] space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-400">
                {lang === 'es' ? 'Enlace corto' : 'Short link'}
              </span>
              <span className="font-mono text-white font-semibold truncate max-w-[190px] select-all">
                {inviteUrl.replace(/^https?:\/\//, '')}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={handleShareOrCopyInvite}
                className="min-h-[46px] px-3 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] active:scale-[0.98] text-xs font-semibold text-white flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer transition-all"
              >
                {copiedInvite ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>{t.copied}</span>
                  </>
                ) : (
                  <>
                    <Share2 className="w-4 h-4" />
                    <span>{t.invite}</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowTvQr((v) => !v)}
                className="min-h-[46px] px-3 rounded-xl bg-[#191C28] hover:bg-[#232838] active:scale-[0.98] border border-white/10 text-xs font-semibold text-zinc-200 flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer transition-all"
              >
                <Tv className="w-4 h-4 text-sky-400" />
                <span>{t.smartTv}</span>
              </button>
            </div>

            {showTvQr && tvUrl && (
              <div className="pt-3 border-t border-white/[0.08] flex flex-col items-center text-center gap-2.5">
                <div className="p-3 bg-white rounded-2xl">
                  <QRCodeSVG value={tvUrl} size={144} />
                </div>
                <p className="text-xs text-zinc-400 leading-snug">
                  Escanea este código o abre este enlace en tu Smart TV para proyectar la sala sincronizada a pantalla completa.
                </p>
                <span className="text-[11px] font-mono text-zinc-500 break-all select-all">
                  {tvUrl}
                </span>
              </div>
            )}
          </div>

          {/* Profile Customization */}
          <div>
            {!editingProfile ? (
              <button
                type="button"
                onClick={() => {
                  setEditName(currentUser.name);
                  setEditAvatar(currentUser.avatar);
                  setEditColor(currentUser.color);
                  setEditingProfile(true);
                }}
                className="w-full min-h-[48px] px-4 rounded-2xl bg-[#191C28] hover:bg-[#232838] border border-white/[0.08] text-xs sm:text-sm font-medium text-zinc-200 flex items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                <Edit3 className="w-4 h-4 text-zinc-400" />
                <span>
                  {lang === 'es'
                    ? `Personalizar mi perfil (${currentUser.name})`
                    : `Customize profile (${currentUser.name})`}
                </span>
              </button>
            ) : (
              <form
                onSubmit={handleSaveProfile}
                className="p-4 rounded-2xl bg-[#090A0F] border border-white/10 space-y-3.5"
              >
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  maxLength={24}
                  className="w-full h-11 px-3.5 rounded-xl bg-[#12141D] border border-white/10 text-base sm:text-sm text-white outline-none"
                />
                <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
                  {AVATARS.map((av) => (
                    <button
                      key={av}
                      type="button"
                      onClick={() => setEditAvatar(av)}
                      className={`h-11 rounded-xl flex items-center justify-center text-lg cursor-pointer ${
                        editAvatar === av
                          ? 'bg-white/20 border border-white/35'
                          : 'bg-[#12141D] border border-white/[0.06]'
                      }`}
                    >
                      {av}
                    </button>
                  ))}
                </div>
                <div className="flex items-center justify-between gap-2 pt-1">
                  <div className="flex items-center gap-1">
                    {COLORS.map((hex) => (
                      <button
                        key={hex}
                        type="button"
                        onClick={() => setEditColor(hex)}
                        className="w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer"
                      >
                        <span
                          className={`w-6 h-6 rounded-full ${
                            editColor === hex ? 'ring-2 ring-white scale-110' : 'opacity-75'
                          }`}
                          style={{ backgroundColor: hex }}
                        />
                      </button>
                    ))}
                  </div>
                  <button
                    type="submit"
                    className="min-h-[40px] px-4 rounded-xl bg-[#E11D48] text-xs font-semibold text-white cursor-pointer"
                  >
                    {lang === 'es' ? 'Guardar' : 'Save'}
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Connected Participants List (56px+ Touch Rows) */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-medium text-zinc-400 px-0.5">
              {t.participants} ({participants.length})
            </h4>
            <div className="space-y-2">
              {participants.map((p) => {
                const isHost = p.id === hostId;
                const isSelf = p.id === currentUser.id;
                return (
                  <div
                    key={p.id}
                    className="min-h-[56px] p-3 rounded-2xl bg-[#090A0F] border border-white/[0.07] flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
                        style={{ backgroundColor: `${p.color}22` }}
                      >
                        {p.avatar}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs sm:text-sm font-semibold text-white truncate flex items-center gap-1.5">
                          <span className="truncate">{p.name}</span>
                          {isSelf && (
                            <span className="text-[11px] text-zinc-400 font-normal">
                              ({t.you})
                            </span>
                          )}
                        </div>
                        {isHost && (
                          <div className="text-[11px] text-amber-400 flex items-center gap-1 mt-0.5">
                            <Crown className="w-3 h-3" />
                            <span>{t.hostLabel}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {isCurrentUserHost && !isSelf && (
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          onTransferHost(p.id);
                        }}
                        className="min-h-[40px] px-3 rounded-xl bg-[#191C28] hover:bg-[#232838] text-xs font-medium text-zinc-200 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {t.makeHost}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
