import React, { useState, useEffect } from 'react';
import { Film, Play, Sparkles, ArrowRight, Share2, History, Tv } from 'lucide-react';
import { motion } from 'motion/react';
import { triggerHaptic, playCinemaSound } from '../utils/haptics';
import { getStoredProfile, saveStoredProfile, getRecentRooms } from '../utils/storage';
import { RecentRoom } from '../types';

interface RoomJoinScreenProps {
  initialRoomId?: string;
  onJoinRoom: (roomId: string, user: { name: string; avatar: string; color: string }) => void;
}

const AVATARS = ['🍿', '🎬', '🦁', '🦊', '🐱', '🐶', '👽', '🤖', '👑', '🕶️', '🔥', '⚡'];
const COLORS = ['#f43f5e', '#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4', '#e11d48'];

export const RoomJoinScreen: React.FC<RoomJoinScreenProps> = ({
  initialRoomId,
  onJoinRoom,
}) => {
  const stored = getStoredProfile();
  const [roomIdInput, setRoomIdInput] = useState(initialRoomId || '');
  const [userName, setUserName] = useState(stored.name || '');
  const [selectedAvatar, setSelectedAvatar] = useState(stored.avatar || '🍿');
  const [selectedColor, setSelectedColor] = useState(stored.color || '#f43f5e');
  const [recentRooms, setRecentRooms] = useState<RecentRoom[]>([]);
  const [activeTab, setActiveTab] = useState<'create' | 'recents'>('create');

  useEffect(() => {
    setRecentRooms(getRecentRooms());
  }, []);

  const handleSaveAndJoin = (targetRoomId: string) => {
    triggerHaptic('success');
    playCinemaSound('join');

    const nameToUse = userName.trim() || `Cinéfilo_${Math.floor(Math.random() * 900 + 100)}`;
    const profile = { name: nameToUse, avatar: selectedAvatar, color: selectedColor };
    saveStoredProfile(profile);
    onJoinRoom(targetRoomId, profile);
  };

  const handleCreateNewRoom = () => {
    const targetRoomId = initialRoomId || `sala-${Math.random().toString(36).substring(2, 8)}`;
    handleSaveAndJoin(targetRoomId);
  };

  const handleJoinExisting = (event: React.FormEvent) => {
    event.preventDefault();
    if (roomIdInput.trim()) {
      const cleanRoomId = roomIdInput.trim().replace(/^.*[?&]room=/, '');
      handleSaveAndJoin(cleanRoomId);
    }
  };

  return (
    <div className="min-h-full bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-3 sm:p-4 relative overflow-hidden selection:bg-rose-500 selection:text-white">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[32rem] h-[32rem] bg-rose-600/15 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-amber-500/10 blur-[120px] rounded-full pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="w-full max-w-sm bg-slate-900/80 border border-slate-800/80 rounded-3xl p-5 sm:p-6 shadow-2xl backdrop-blur-2xl relative z-10 flex flex-col items-center text-center ring-1 ring-white/5"
      >
        <div className="relative mb-3 group">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-rose-600 via-pink-600 to-amber-500 flex items-center justify-center text-white shadow-xl shadow-rose-950/60 ring-2 ring-white/10 transition-transform group-hover:scale-105">
            <Film className="w-8 h-8" />
          </div>
          <span className="absolute -bottom-1 -right-1 px-1.5 py-0.5 rounded-full bg-rose-500 text-[9px] font-black uppercase tracking-wider text-white shadow-md">
            PRO
          </span>
        </div>

        <h1 className="text-xl sm:text-2xl font-black text-slate-100 tracking-tight flex items-center gap-1.5">
          <span>Naimpelis</span>
          <span className="text-rose-500">.</span>
        </h1>
        <p className="text-xs text-slate-400 mt-0.5 mb-4 max-w-[260px] leading-relaxed">
          Tu cine compartido en directo. Películas de Movidy y Bingetrix en sincronía.
        </p>

        <div className="w-full bg-slate-950/70 border border-slate-800/80 rounded-2xl p-3.5 mb-4 text-left space-y-3 shadow-inner">
          <div>
            <label className="text-[11px] font-bold text-slate-300 block mb-1">Tu Nombre / Apodo</label>
            <input
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="Ej: Laura, Carlos, Alex..."
              maxLength={24}
              className="w-full px-3 py-2 bg-slate-900/90 border border-slate-700/60 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500/50"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-bold text-slate-300">Elige tu Avatar</label>
              <div className="flex items-center gap-1">
                {COLORS.slice(0, 5).map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setSelectedColor(color);
                    }}
                    className={`w-3.5 h-3.5 rounded-full transition-transform ${
                      selectedColor === color ? 'scale-125 ring-2 ring-white' : 'opacity-70'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between gap-1 overflow-x-auto no-scrollbar py-1">
              {AVATARS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setSelectedAvatar(emoji);
                  }}
                  className={`w-8 h-8 rounded-xl flex items-center justify-center text-base border transition-all shrink-0 ${
                    selectedAvatar === emoji
                      ? 'bg-rose-600/30 border-rose-500 scale-110 shadow-lg'
                      : 'bg-slate-900/80 border-slate-800 text-slate-400'
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
            <span className="text-sm font-bold tracking-tight text-white">Watch2Gether</span>
          </div>

        {!initialRoomId && recentRooms.length > 0 && (
          <div className="flex w-full p-0.5 mb-3 bg-slate-950/60 border border-slate-800/80 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveTab('create')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold ${
                activeTab === 'create' ? 'bg-rose-600 text-white' : 'text-slate-400'
              }`}
            >
              Crear / Entrar
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('recents')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold ${
                activeTab === 'recents' ? 'bg-rose-600 text-white' : 'text-slate-400'
              }`}
            >
              Recientes ({recentRooms.length})
            </button>
          </div>
        )}

        {initialRoomId ? (
          <div className="w-full space-y-3">
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-left flex items-center gap-2.5">
              <Share2 className="w-4 h-4 text-rose-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-bold text-rose-300">¡Te han invitado a una sala!</p>
                <p className="text-[11px] text-slate-400 font-mono truncate">ID: {initialRoomId}</p>
              </div>
            </div>
          )}

            <button
              onClick={handleCreateNewRoom}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white font-black text-xs flex items-center justify-center gap-2 shadow-xl shadow-rose-950/60 active:scale-95 transition-all"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>Entrar a la Sala Ahora</span>
            </button>
          </div>
        ) : activeTab === 'recents' && recentRooms.length > 0 ? (
          <div className="w-full space-y-2 max-h-56 overflow-y-auto">
            {recentRooms.map((room) => (
              <button
                key={room.id}
                onClick={() => handleSaveAndJoin(room.id)}
                className="w-full p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-rose-500/50 flex items-center justify-between text-left group transition-all"
              >
                <div className="min-w-0 pr-2">
                  <p className="text-xs font-bold text-slate-200 group-hover:text-rose-400 truncate flex items-center gap-1.5">
                    <Film className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                    <span>{room.name}</span>
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-rose-400 shrink-0" />
              </button>
            ))}
          </div>
        ) : (
          <div className="w-full space-y-3.5">
            <button
              onClick={handleCreateNewRoom}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-rose-600 via-pink-600 to-rose-700 text-white font-black text-xs flex items-center justify-center gap-2 shadow-xl active:scale-95 transition-all"
            >
              <Sparkles className="w-4 h-4" />
              <span>Crear Nueva Sala de Cine</span>
            </button>

            <form onSubmit={handleJoinExisting} className="flex gap-2">
              <input
                type="text"
                value={roomIdInput}
                onChange={(e) => setRoomIdInput(e.target.value)}
                placeholder="Pega el código o link..."
                className="flex-1 px-3 py-2.5 bg-slate-950/80 border border-slate-700/70 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none"
                required
              />
              <button
                type="submit"
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 font-bold text-xs flex items-center gap-1.5 border border-slate-700"
              >
                <span>Entrar</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        )}
      </motion.div>
    </div>
  );
};
