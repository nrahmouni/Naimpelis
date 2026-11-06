import React, { useState, useRef, useEffect } from 'react';
import { Send, Smile, MessageSquare, Sparkles, ChevronDown } from 'lucide-react';
import { ChatMessage, Participant } from '../types';

interface HandsomeChatProps {
  messages: ChatMessage[];
  currentUser: Participant;
  onSendMessage: (text: string) => void;
}

const EMOJIS = ['🍿', '❤️', '🔥', '😂', '😮', '👏', '🎬', '🤩', '👍', '💀', '🎉', '🤯'];

export const HandsomeChat: React.FC<HandsomeChatProps> = ({
  messages,
  currentUser,
  onSendMessage,
}) => {
  const [inputText, setInputText] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);

  const scrollToBottom = (smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  };

  useEffect(() => {
    if (!showScrollDown) scrollToBottom(true);
  }, [messages.length, showScrollDown]);

  const handleScroll = () => {
    if (chatContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 80;
      setShowScrollDown(!isNearBottom);
    }
  };

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (inputText.trim()) {
      onSendMessage(inputText.trim());
      setInputText('');
      setShowEmojiPicker(false);
    }
  };



  const addEmoji = (emoji: string) => {
    setInputText((prev) => prev + emoji);
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-[#0d1317]">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/[0.07] px-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.06] text-emerald-200">
            <MessageSquare className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-100">Conversación</h2>
            <p className="text-[11px] text-slate-500">Mensajes de la sala</p>
          </div>
        </div>
        <span className="flex items-center gap-1.5 rounded-full border border-emerald-300/10 bg-emerald-300/[0.06] px-2.5 py-1 text-[10px] font-medium text-emerald-200">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> En directo
        </span>
      </div>

      <div
        ref={chatContainerRef}
        onScroll={handleScroll}
        role="log"
        aria-label="Mensajes de la sala"
        aria-live="polite"
        className="relative flex-1 space-y-3 overflow-y-auto p-4"
      >
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center p-6 text-center text-slate-500">
            <Sparkles className="mb-2 h-8 w-8 text-rose-300/50" />
            <p className="text-sm font-medium">La conversación empieza aquí</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.senderId === currentUser.id;
            if (msg.isSystem) {
              return (
                <div key={msg.id} className="my-2 flex justify-center">
                  <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-center text-[11px] text-slate-400">
                    <span>{msg.senderAvatar}</span>
                    <span>{msg.text}</span>
                  </div>
                </div>
              );
            }

            return (
              <div key={msg.id} className={`flex gap-2.5 text-sm ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 text-xs shadow-sm"
                  style={{ backgroundColor: msg.senderColor || '#3b82f6' }}
                >
                  {msg.senderAvatar}
                </div>
                <div className={`flex max-w-[84%] flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                  <div className="mb-1 flex items-center gap-1.5 px-1">
                    <span className="text-xs font-semibold text-slate-300">{msg.senderName}</span>
                    <span className="font-mono text-[10px] text-slate-500">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className={`break-words rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed shadow-sm ${
                    isMe
                      ? 'rounded-tr-sm bg-rose-500 text-white'
                      : 'rounded-tl-sm border border-white/[0.06] bg-white/[0.05] text-slate-100'
                  }`}>
                    {msg.text}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {showScrollDown && (
        <button
          onClick={() => scrollToBottom(true)}
          className="absolute bottom-20 right-4 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-rose-500 text-white shadow-lg transition-transform hover:bg-rose-400 active:scale-90"
          aria-label="Ir al mensaje más reciente"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      )}

      {showEmojiPicker && (
        <div className="absolute bottom-16 left-3 z-30 grid w-60 grid-cols-6 gap-1 rounded-xl border border-white/10 bg-[#151d22] p-2 shadow-2xl">
          {EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => addEmoji(emoji)}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-lg transition-colors hover:bg-white/[0.08]"
              aria-label={`Añadir ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={handleSend} className="flex items-center gap-2 border-t border-white/[0.07] bg-[#11181c] p-3">
        <button
          type="button"
          onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors ${
            showEmojiPicker ? 'border-rose-300/30 bg-rose-300/10 text-rose-100' : 'border-white/[0.08] bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]'
          }`}
          aria-label="Abrir selector de emojis"
        >
          <Smile className="h-4 w-4" />
        </button>
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          maxLength={1000}
          aria-label="Escribe un mensaje"
          placeholder="Escribe un mensaje..."
          className="h-11 min-w-0 flex-1 rounded-xl border border-white/[0.08] bg-[#090e11] px-3.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-rose-300/40 focus:outline-none focus:ring-2 focus:ring-rose-300/10"
        />
        <button
          type="submit"
          disabled={!inputText.trim()}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-500 text-white shadow-md transition-colors hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-rose-500"
          aria-label="Enviar mensaje"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
};
