import React, { useState, useRef, useEffect } from 'react';
import { Send, Smile, MessageSquare, Sparkles, ChevronDown, X } from 'lucide-react';
import { ChatMessage, Participant } from '../types';
import { Language, TRANSLATIONS } from '../utils/i18n';
import { motion, AnimatePresence } from 'framer-motion';
import { triggerHaptic } from '../utils/haptics';

interface HandsomeChatProps {
  messages: ChatMessage[];
  currentUser: Participant;
  language: Language;
  onSendMessage: (text: string) => void;
}

const EMOJIS = ['🍿', '❤️', '🔥', '😂', '😮', '👏', '🎬', '🤩', '👍', '💀', '🎉', '🤯'];

export const HandsomeChat: React.FC<HandsomeChatProps> = ({
  messages,
  currentUser,
  language,
  onSendMessage,
}) => {
  const t = TRANSLATIONS[language];
  const [isOpen, setIsOpen] = useState(false);
  const [isIdle, setIsIdle] = useState(false);
  const [inputText, setInputText] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const idleTimerRef = useRef<any>(null);

  const resetIdleTimer = () => {
    setIsIdle(false);
    clearTimeout(idleTimerRef.current);
    if (!isOpen) {
      idleTimerRef.current = setTimeout(() => {
        setIsIdle(true);
      }, 4000);
    }
  };

  useEffect(() => {
    resetIdleTimer();
    return () => clearTimeout(idleTimerRef.current);
  }, [isOpen]);

  const scrollToBottom = (smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom(true);
      setUnreadCount(0);
    } else if (messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.senderId !== currentUser.id && !lastMsg.isSystem) {
        setUnreadCount((prev: number) => prev + 1);
        resetIdleTimer();
      }
    }
  }, [messages.length, isOpen]);

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
      setTimeout(() => scrollToBottom(true), 100);
    }
  };

  const addEmoji = (emoji: string) => {
    setInputText((prev: string) => prev + emoji);
  };

  return (
    <>
      {/* Draggable & Auto-hiding Floating Toggle Button */}
      <motion.button
        drag
        dragMomentum={false}
        dragElastic={0.1}
        onDragStart={() => setIsIdle(false)}
        onDragEnd={() => resetIdleTimer()}
        onClick={() => {
          setIsOpen(!isOpen);
          triggerHaptic('light');
        }}
        initial={{ x: 0, y: 0 }}
        className={`fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-2xl transition-all active:scale-90 touch-none ${
          isOpen 
            ? 'bg-slate-800 text-white rotate-90 scale-90' 
            : isIdle 
              ? 'bg-rose-600/30 text-white/40 backdrop-blur-sm border border-white/5 translate-x-4 opacity-50 hover:opacity-100 hover:translate-x-0'
              : 'bg-rose-600 text-white hover:bg-rose-500 ring-4 ring-rose-500/10'
        }`}
        aria-label={isOpen ? "Cerrar chat" : "Abrir chat"}
        style={{ cursor: 'grab' }}
        whileTap={{ cursor: 'grabbing' }}
      >
        {isOpen ? <X className="h-6 w-6" /> : <MessageSquare className="h-6 w-6" />}
        {!isOpen && unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-6 min-w-[24px] items-center justify-center rounded-full bg-emerald-500 px-1.5 text-[10px] font-bold text-white shadow-lg ring-2 ring-slate-950">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </motion.button>

      {/* Responsive Chat Floating Container */}
      <div 
        className={`fixed bottom-24 right-6 z-40 flex flex-col bg-[#0b0f13]/90 backdrop-blur-2xl transition-all duration-300 ease-out border border-white/10 shadow-2xl rounded-[2rem] overflow-hidden ${
          isOpen 
            ? 'opacity-100 translate-y-0 pointer-events-auto' 
            : 'opacity-0 translate-y-8 pointer-events-none'
        } w-[calc(100vw-3rem)] sm:w-80 md:w-96 h-[60vh] max-h-[500px]`}
      >
        {/* Chat Header */}
        <div className="flex items-center justify-between border-b border-white/5 p-4 bg-white/5">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-500 text-white shadow-lg shadow-rose-900/20">
              <MessageSquare className="h-4 w-4" />
            </div>
            <h3 className="text-xs font-black text-slate-100 uppercase tracking-widest">{t.liveChat}</h3>
          </div>
          <button 
            onClick={() => setIsOpen(false)}
            className="p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Messages List */}
        <div
          ref={chatContainerRef}
          onScroll={handleScroll}
          className="relative flex-1 space-y-3 overflow-y-auto p-4 custom-scrollbar bg-slate-950/20"
        >
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center p-6 text-center text-slate-600">
              <Sparkles className="mb-2 h-8 w-8 opacity-20" />
              <p className="text-[10px] font-bold uppercase tracking-widest">{t.startChat}</p>
            </div>
          ) : (
            messages.map((msg) => {
              const isMe = msg.senderId === currentUser.id;
              if (msg.isSystem) {
                return (
                  <div key={msg.id} className="my-2 flex justify-center px-2">
                    <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-white/5 bg-white/5 px-3 py-1 text-center text-[9px] font-bold text-slate-500 uppercase tracking-tighter">
                      <span>{msg.senderAvatar || '🎬'}</span>
                      <span className="truncate">{msg.text || 'Evento del sistema'}</span>
                    </div>
                  </div>
                );
              }

              return (
                <div key={msg.id} className={`flex gap-2.5 text-sm ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                  <div
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] shadow-md border border-white/5"
                    style={{ backgroundColor: msg.senderColor || '#3b82f6' }}
                  >
                    {msg.senderAvatar}
                  </div>
                  <div className={`flex max-w-[80%] flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    <div className="mb-1 flex items-center gap-1.5 px-1">
                      <span className="text-[9px] font-black text-slate-500 uppercase">{msg.senderName || 'Anónimo'}</span>
                      <span className="font-mono text-[8px] text-slate-700">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className={`break-words rounded-2xl px-3.5 py-2 text-[12px] leading-snug shadow-sm ${
                      isMe
                        ? 'rounded-tr-sm bg-rose-600 text-white font-medium'
                        : 'rounded-tl-sm border border-white/[0.06] bg-white/[0.04] text-slate-200'
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

        {/* Floating Scroll Down */}
        {showScrollDown && (
          <button
            onClick={() => scrollToBottom(true)}
            className="absolute bottom-20 right-4 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-rose-600 text-white shadow-xl backdrop-blur-sm active:scale-90 transition-transform"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        )}

        {/* Emoji Picker */}
        {showEmojiPicker && (
          <div className="absolute bottom-[4.5rem] left-4 right-4 z-30 grid grid-cols-6 gap-1 rounded-2xl border border-white/10 bg-[#0b0f13] p-2 shadow-2xl backdrop-blur-xl">
            {EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => addEmoji(emoji)}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-lg transition-colors hover:bg-white/10"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        {/* Input Bar */}
        <form onSubmit={handleSend} className="border-t border-white/5 bg-white/5 p-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-all ${
                showEmojiPicker ? 'border-rose-500/50 bg-rose-500/10 text-rose-500' : 'border-white/5 bg-white/5 text-slate-400 hover:text-white'
              }`}
            >
              <Smile className="h-4 w-4" />
            </button>
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={t.writeSomething}
              className="h-10 min-w-0 flex-1 rounded-xl border border-white/5 bg-slate-950 px-3.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-rose-500/30 transition-all"
            />
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-600 text-white shadow-lg hover:bg-rose-500 disabled:opacity-40 active:scale-95 transition-all"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </form>
      </div>
    </>
  );
};
