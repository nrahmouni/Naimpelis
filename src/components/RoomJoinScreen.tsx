import React, { useState, useEffect } from 'react';
import { ArrowRight, Film, History, Play, Share2, Sparkles } from 'lucide-react';
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
    <main className="relative flex min-h-dvh items-start justify-center overflow-x-hidden bg-[#0b0e11] px-3 py-4 text-slate-100 selection:bg-rose-500 selection:text-white sm:items-center sm:px-6 sm:py-8">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-[32rem] w-[32rem] rounded-full bg-rose-600/[0.12] blur-[120px]" />
        <div className="absolute -bottom-56 -right-36 h-[36rem] w-[36rem] rounded-full bg-indigo-500/[0.09] blur-[130px]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.035),transparent_55%)]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="relative z-10 grid w-full max-w-5xl overflow-hidden rounded-2xl border border-white/[0.09] bg-[#111518]/90 shadow-[0_32px_100px_rgba(0,0,0,0.48)] backdrop-blur-2xl sm:rounded-[28px] md:grid-cols-[1fr_0.92fr]"
      >
        <section className="flex flex-col justify-between border-b border-white/[0.07] p-5 sm:p-10 md:border-b-0 md:border-r md:p-12">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-rose-700 text-white shadow-lg shadow-rose-950/30">
              <Film className="h-5 w-5" />
            </div>
            <span className="text-sm font-bold tracking-tight text-white">Naimpelis</span>
          </div>
          <div className="py-5 sm:py-9 md:py-14">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-rose-300/15 bg-rose-400/[0.07] px-2.5 py-1.5 text-[10px] font-medium text-rose-200 sm:mb-5 sm:px-3 sm:text-[11px]">
              <Sparkles className="h-3.5 w-3.5" />
              Tu próxima noche de cine empieza aquí
            </div>
            <h1 className="max-w-md text-3xl font-semibold leading-[1.08] tracking-[-0.045em] text-white sm:text-5xl">
              Elige algo.
              <br />
              <span className="bg-gradient-to-r from-rose-300 to-amber-200 bg-clip-text text-transparent">Invita a todos.</span>
            </h1>
            <p className="mt-3 max-w-sm text-xs leading-5 text-slate-400 sm:mt-5 sm:text-[15px] sm:leading-6">
              Películas, series y deporte en sincronía. Una sala privada, sin complicaciones.
            </p>
          </div>
          <p className="hidden text-xs text-slate-500 sm:block">Reproducción compartida · Chat en directo</p>
        </section>

        <section className="p-5 sm:p-9 md:p-10">
          {initialRoomId ? (
            <div className="mb-6 flex items-center gap-3 rounded-2xl border border-rose-300/15 bg-rose-400/[0.06] p-3.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-400/10 text-rose-200">
                <Share2 className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-white">Te invitaron a una sala</p>
                <p className="truncate font-mono text-xs text-slate-400">{initialRoomId}</p>
              </div>
            </div>
          ) : null}

          <div className="mb-5 sm:mb-6">
            <h2 className="text-lg font-semibold tracking-tight text-white">Antes de entrar</h2>
            <p className="mt-1 text-xs leading-5 text-slate-400">Elige cómo te verá tu grupo. Puedes cambiarlo después.</p>
          </div>

          <div className="space-y-4 sm:space-y-5">
            <div>
              <label htmlFor="display-name" className="mb-2 block text-xs font-medium text-slate-300">Tu nombre</label>
              <input
                id="display-name"
                type="text"
                value={userName}
                onChange={(event) => setUserName(event.target.value)}
                placeholder="¿Cómo te llamas?"
                maxLength={24}
                className="h-11 w-full rounded-xl border border-white/[0.1] bg-[#0b0e11] px-3.5 text-sm text-white placeholder:text-slate-600 transition focus:border-rose-300/50 focus:outline-none focus:ring-4 focus:ring-rose-300/[0.08]"
              />
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-300">Tu avatar</span>
                <div className="flex items-center gap-1.5">
                  {COLORS.slice(0, 6).map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => { triggerHaptic('light'); setSelectedColor(color); }}
                      aria-label={`Elegir color ${color}`}
                      aria-pressed={selectedColor === color}
                      className="flex h-5 w-5 items-center justify-center rounded-full transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                      style={{ backgroundColor: color }}
                    >
                      {selectedColor === color && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {AVATARS.map((avatar) => (
                  <button
                    key={avatar}
                    type="button"
                    onClick={() => { triggerHaptic('light'); setSelectedAvatar(avatar); }}
                    aria-label={`Elegir avatar ${avatar}`}
                    aria-pressed={selectedAvatar === avatar}
                    className={`flex h-9 w-9 items-center justify-center rounded-xl border text-base transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 ${
                      selectedAvatar === avatar ? 'border-rose-300/50 bg-rose-400/10' : 'border-white/[0.08] bg-white/[0.025] hover:border-white/20 hover:bg-white/[0.06]'
                    }`}
                  >
                    {avatar}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="my-5 h-px bg-white/[0.07] sm:my-6" />
          {initialRoomId ? (
            <button
              type="button"
              onClick={handleCreateNewRoom}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-rose-500 px-4 text-sm font-semibold text-white shadow-lg shadow-rose-950/25 transition hover:bg-rose-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
            >
              <Play className="h-4 w-4 fill-current" /> Entrar a la sala
            </button>
          ) : (
            <div className="space-y-3">
              <button
                type="button"
                onClick={handleCreateNewRoom}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-rose-500 px-4 text-sm font-semibold text-white shadow-lg shadow-rose-950/25 transition hover:bg-rose-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
              >
                <Sparkles className="h-4 w-4" /> Crear una sala <ArrowRight className="ml-auto h-4 w-4" />
              </button>
              <form onSubmit={handleJoinExisting} className="flex gap-2">
                <input
                  type="text"
                  value={roomIdInput}
                  onChange={(event) => setRoomIdInput(event.target.value)}
                  aria-label="Código o enlace de la sala"
                  placeholder="Pega el código o enlace"
                  className="h-11 min-w-0 flex-1 rounded-xl border border-white/[0.1] bg-[#0b0e11] px-3 text-xs text-white placeholder:text-slate-600 transition focus:border-white/25 focus:outline-none focus:ring-4 focus:ring-white/[0.04]"
                  required
                />
                <button type="submit" className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl border border-white/[0.1] bg-white/[0.045] px-3.5 text-xs font-medium text-slate-200 transition hover:bg-white/[0.09] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40">
                  Entrar <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </form>
            </div>
          )}

          {!initialRoomId && recentRooms.length > 0 && (
            <div className="mt-6 border-t border-white/[0.07] pt-4">
              <h3 className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-400">
                <History className="h-3.5 w-3.5" /> Salas recientes
              </h3>
              <div className="flex flex-wrap gap-2">
                {recentRooms.slice(0, 3).map((room) => (
                  <button
                    key={room.id}
                    type="button"
                    onClick={() => handleSaveAndJoin(room.id)}
                    className="inline-flex max-w-full items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.025] px-2.5 py-2 text-xs text-slate-300 transition hover:border-rose-300/25 hover:bg-rose-400/[0.06]"
                  >
                    <Film className="h-3.5 w-3.5 shrink-0 text-rose-300" />
                    <span className="truncate">{room.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      </motion.div>
    </main>
  );
};
