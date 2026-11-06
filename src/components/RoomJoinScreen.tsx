import React, { useState } from 'react';
import { Film, Play, Sparkles, Users, ArrowRight, Share2 } from 'lucide-react';
import { Participant } from '../types';

interface RoomJoinScreenProps {
  initialRoomId?: string;
  onJoinRoom: (roomId: string, user: { name: string; avatar: string; color: string }, hostToken?: string) => void;
}

const AVATARS = ['🍿', '🎬', '🦁', '🦊', '🐱', '🐶', '👽', '🤖', '👑'];
const COLORS = ['#f43f5e', '#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899'];

export const RoomJoinScreen: React.FC<RoomJoinScreenProps> = ({
  initialRoomId,
  onJoinRoom,
}) => {
  const [roomIdInput, setRoomIdInput] = useState(initialRoomId || '');
  const [userName, setUserName] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState('🍿');
  const [selectedColor, setSelectedColor] = useState('#f43f5e');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const getUserMeta = () => ({
    name: userName.trim() || `Cinefilo_${Math.floor(Math.random() * 900 + 100)}`,
    avatar: selectedAvatar,
    color: selectedColor,
  });

  const handleCreateNewRoom = async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Sala de Cine 🍿' }),
      });
      if (!response.ok) throw new Error('No se pudo crear la sala.');
      const room = await response.json();
      onJoinRoom(room.id, getUserMeta(), room.hostToken);
    } catch {
      setError('No se pudo crear la sala. Inténtalo de nuevo.');
      setIsLoading(false);
    }
  };

  const handleJoinRoom = async (targetRoomId: string) => {
    setIsLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/rooms/${encodeURIComponent(targetRoomId)}`);
      if (!response.ok) throw new Error('Sala no encontrada.');
      onJoinRoom(targetRoomId, getUserMeta());
    } catch {
      setError('No se encontró esa sala. Comprueba el código de invitación.');
      setIsLoading(false);
    }
  };

  const handleJoinExisting = (e: React.FormEvent) => {
    e.preventDefault();
    if (roomIdInput.trim()) {
      const cleanRoomId = roomIdInput.trim().replace(/^.*[?&]room=/, '');
      void handleJoinRoom(cleanRoomId);
    }
  };

  return (
    <div className="min-h-full bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4 relative overflow-hidden selection:bg-rose-500 selection:text-white">
      {/* Visual Ambient Glow Backdrop */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-rose-600/15 blur-3xl rounded-full pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 w-80 h-80 bg-amber-500/10 blur-3xl rounded-full pointer-events-none" />

      <div className="w-full max-w-sm bg-slate-900/90 border border-slate-800/80 rounded-3xl p-6 shadow-2xl backdrop-blur-xl relative z-10 flex flex-col items-center text-center">
        {/* App Logo */}
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-rose-600 via-pink-600 to-amber-500 flex items-center justify-center text-white shadow-xl shadow-rose-950/50 mb-3 animate-pulse-glow">
          <Film className="w-9 h-9" />
        </div>

        <h1 className="text-xl font-extrabold text-slate-100 tracking-tight">Watch2Gether</h1>
        <p className="text-xs text-slate-400 mt-1 mb-5">
          Ve películas y vídeos con amigos en tiempo real con chat en directo
        </p>

        {/* User Identity Config */}
        <div className="w-full bg-slate-950 border border-slate-800/80 rounded-2xl p-3.5 mb-5 text-left space-y-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-300 mb-1">Tu Apodo para la Sala</label>
            <input
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="Ej: Alex, Laura, Cinefilo_99..."
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700/60 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500/50"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-300 mb-1">Elige tu Avatar</label>
            <div className="flex items-center justify-between gap-1 overflow-x-auto no-scrollbar py-1">
              {AVATARS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setSelectedAvatar(emoji)}
                  className={`w-8 h-8 rounded-xl flex items-center justify-center text-base border transition-transform shrink-0 ${
                    selectedAvatar === emoji
                      ? 'bg-rose-600 text-white border-rose-400 scale-110 shadow-md'
                      : 'bg-slate-900 border-slate-800 hover:bg-slate-800'
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        {initialRoomId ? (
          <div className="w-full space-y-3">
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-left flex items-center gap-2.5">
              <Share2 className="w-5 h-5 text-rose-400 shrink-0" />
              <div>
                <p className="text-xs font-bold text-rose-300">¡Te han invitado a una sala!</p>
                <p className="text-[11px] text-slate-400 font-mono">ID: {initialRoomId}</p>
              </div>
            </div>

            <button
              onClick={() => void handleJoinRoom(initialRoomId)}
              disabled={isLoading}
              className="w-full py-3 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-rose-950/50 active:scale-95 transition-all"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>{isLoading ? 'Conectando...' : 'Entrar a la Sala Ahora'}</span>
            </button>
          </div>
        ) : (
          <div className="w-full space-y-4">
            <button
              onClick={() => void handleCreateNewRoom()}
              disabled={isLoading}
              className="w-full py-3.5 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-rose-950/50 active:scale-95 transition-all"
            >
              <Sparkles className="w-4 h-4" />
              <span>{isLoading ? 'Creando...' : 'Crear Nueva Sala de Cine'}</span>
            </button>

            <div className="flex items-center gap-2 my-2">
              <div className="flex-1 h-px bg-slate-800" />
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">O ÚNETE A UNA SALA</span>
              <div className="flex-1 h-px bg-slate-800" />
            </div>

            <form onSubmit={handleJoinExisting} className="flex gap-2">
              <input
                type="text"
                value={roomIdInput}
                onChange={(e) => setRoomIdInput(e.target.value)}
                placeholder="Código o Link de la sala..."
                className="flex-1 px-3 py-2.5 bg-slate-950 border border-slate-700/70 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500/50"
                required
              />
              <button
                type="submit"
                disabled={isLoading}
                className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center gap-1 border border-slate-700 transition-colors"
              >
                <span>Entrar</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        )}
        {error && <p role="alert" className="w-full mt-3 text-xs text-rose-300">{error}</p>}
      </div>
    </div>
  );
};
