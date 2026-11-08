import React, { useState, useRef, useEffect } from 'react';
import { Send, Smile, ChevronDown } from 'lucide-react';
import { ChatMessage, Participant } from '../types';
import { triggerHaptic, playCinemaSound } from '../utils/haptics';

interface HandsomeChatProps {
  messages: ChatMessage[];
  currentUser: Participant;
  onSendMessage: (text: string) => void;
  onClose?: () => void;
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
      triggerHaptic('light');
      playCinemaSound('reaction');
      onSendMessage(inputText.trim());
      setInputText('');
      setShowEmojiPicker(false);
    }
  };

  const addEmoji = (emoji: string) => {
    triggerHaptic('light');
    setInputText((prev) => prev + emoji);
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-[#0d1317]">
      {/* Messages List Container */}
      <div
        ref={chatContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-3 space-y-2.5 min-h-0"
      >
        {messages.map((msg) => {
          const isMe = msg.senderId === currentUser.id;
          const isSystem = msg.isSystem;

          if (isSystem) {
            return (
              <div key={msg.id} className="flex justify-center my-1">
                <span className="px-3 py-1 rounded-full bg-slate-900/90 border border-slate-800 text-[11px] text-slate-400 font-medium shadow-sm">
                  {msg.text}
                </span>
              </div>
            );
          }

          return (
            <div
              key={msg.id}
              className={`flex items-start gap-2 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}
            >
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs shrink-0 shadow-sm border border-white/10"
                style={{ backgroundColor: msg.senderColor || '#3b82f6' }}
              >
                {msg.senderAvatar || '🍿'}
              </div>

              <div
                className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed shadow-md ${
                  isMe
                    ? 'bg-rose-600 text-white rounded-tr-xs font-medium'
                    : 'bg-[#1b272e] text-slate-100 rounded-tl-xs border border-white/5'
                }`}
              >
                {!isMe && (
                  <p className="text-[10px] font-bold text-rose-300 mb-0.5" style={{ color: msg.senderColor }}>
                    {msg.senderName}
                  </p>
                )}
                <p className="break-words">{msg.text}</p>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Scroll Down Button */}
      {showScrollDown && (
        <button
          onClick={() => scrollToBottom(true)}
          className="absolute bottom-16 right-4 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-rose-600 text-white shadow-lg active:scale-90"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      )}

      {/* Emoji Picker Popup */}
      {showEmojiPicker && (
        <div className="absolute bottom-16 left-3 z-30 grid w-60 grid-cols-6 gap-1 rounded-2xl border border-white/10 bg-[#151d22] p-2 shadow-2xl">
          {EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => addEmoji(emoji)}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-lg hover:bg-white/10 active:scale-90"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* Input Bar */}
      <form onSubmit={handleSend} className="flex items-center gap-2 border-t border-white/10 bg-[#11181c] p-2.5">
        <button
          type="button"
          onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
            showEmojiPicker ? 'border-rose-400 bg-rose-600/20 text-rose-300' : 'border-white/10 bg-white/5 text-slate-300'
          }`}
        >
          <Smile className="h-4 w-4" />
        </button>
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          maxLength={1000}
          placeholder="Escribe un mensaje..."
          className="h-10 min-w-0 flex-1 rounded-xl border border-white/10 bg-[#090e11] px-3 text-xs text-slate-100 placeholder:text-slate-500 focus:border-rose-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!inputText.trim()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-600 text-white shadow-md active:scale-95 disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
};
