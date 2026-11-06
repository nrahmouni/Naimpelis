import React, { useState, useRef, useEffect } from 'react';
import { Send, Smile, MessageSquare, Sparkles, ChevronDown } from 'lucide-react';
import { ChatMessage, Participant } from '../types';
import { formatTime } from '../utils/videoParser';

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
    scrollToBottom(true);
  }, [messages.length]);

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
    <div className="flex-1 flex flex-col bg-slate-950 min-h-0 relative">


      {/* Messages Scroll Area */}
      <div
        ref={chatContainerRef}
        onScroll={handleScroll}
        className="flex-1 p-3 overflow-y-auto space-y-2.5 relative"
      >
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
            <Sparkles className="w-8 h-8 text-rose-500/40 mb-2 animate-pulse" />
            <p className="text-xs font-medium">¡Sé el primero en comentar la película!</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.senderId === currentUser.id;

            if (msg.isSystem) {
              return (
                <div key={msg.id} className="flex justify-center my-1.5">
                  <div className="inline-flex items-center gap-1.5 bg-slate-900/70 border border-slate-800 px-3 py-1 rounded-full text-[11px] text-slate-400 text-center shadow-sm">
                    <span>{msg.senderAvatar}</span>
                    <span>{msg.text}</span>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={msg.id}
                className={`flex gap-2 text-xs ${isMe ? 'flex-row-reverse' : 'flex-row'}`}
              >
                {/* Avatar */}
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs shrink-0 shadow-sm border border-slate-800"
                  style={{ backgroundColor: msg.senderColor || '#3b82f6' }}
                >
                  {msg.senderAvatar}
                </div>

                {/* Message Bubble */}
                <div
                  className={`max-w-[78%] flex flex-col ${
                    isMe ? 'items-end' : 'items-start'
                  }`}
                >
                  <div className="flex items-center gap-1.5 px-1 mb-0.5">
                    <span className="font-semibold text-[11px] text-slate-300">
                      {msg.senderName}
                    </span>
                    <span className="text-[9px] font-mono text-slate-500">
                      {new Date(msg.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>

                  <div
                    className={`px-3 py-2 rounded-2xl text-xs break-words shadow-sm ${
                      isMe
                        ? 'bg-rose-600 text-white rounded-tr-xs'
                        : 'bg-slate-800 text-slate-100 border border-slate-700/60 rounded-tl-xs'
                    }`}
                  >
                    {msg.text}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Scroll Down Floating Indicator */}
      {showScrollDown && (
        <button
          onClick={() => scrollToBottom(true)}
          className="absolute bottom-16 right-4 z-20 w-8 h-8 rounded-full bg-rose-600 text-white shadow-lg flex items-center justify-center hover:bg-rose-500 transition-transform active:scale-90"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      )}



      {/* Emoji Picker Popup */}
      {showEmojiPicker && (
        <div className="absolute bottom-14 left-3 z-30 bg-slate-900 border border-slate-700 rounded-2xl p-2 shadow-2xl grid grid-cols-6 gap-1 w-60">
          {EMOJIS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => addEmoji(emoji)}
              className="w-8 h-8 rounded-lg hover:bg-slate-800 flex items-center justify-center text-lg active:scale-125 transition-transform"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* Chat Input Form */}
      <form
        onSubmit={handleSend}
        className="bg-slate-900 p-2.5 border-t border-slate-800 flex items-center gap-2"
      >
        <button
          type="button"
          onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          className={`p-2 rounded-xl border text-slate-300 transition-colors ${
            showEmojiPicker
              ? 'bg-rose-600 text-white border-rose-500'
              : 'bg-slate-800 border-slate-700/60 hover:bg-slate-700'
          }`}
        >
          <Smile className="w-4 h-4" />
        </button>

        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Escribe un mensaje..."
          className="flex-1 px-3 py-2 bg-slate-950 border border-slate-700/60 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500/50 transition-all"
        />

        <button
          type="submit"
          disabled={!inputText.trim()}
          className="p-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-40 disabled:hover:bg-rose-600 text-white transition-all shadow-md active:scale-95 shrink-0"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};
