import React, { useState } from 'react';
import { User, Check, X, Palette, Sparkles } from 'lucide-react';
import { Participant } from '../types';

interface UserProfileModalProps {
  currentUser: Participant;
  onSave: (name: string, avatar: string, color: string) => void;
  onClose: () => void;
}

const AVATARS = ['🍿', '🎬', '🦁', '🦊', '🐱', '🐶', '🐼', '🐯', '👽', '🤖', '👑', '😎'];
const COLORS = [
  '#f43f5e', // Rose
  '#3b82f6', // Blue
  '#10b981', // Emerald
  '#8b5cf6', // Violet
  '#f59e0b', // Amber
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#84cc16', // Lime
];

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  currentUser,
  onSave,
  onClose,
}) => {
  const [name, setName] = useState(currentUser.name);
  const [avatar, setAvatar] = useState(currentUser.avatar);
  const [color, setColor] = useState(currentUser.color);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onSave(name.trim(), avatar, color);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-rose-500" />
            <h3 className="text-sm font-bold text-slate-100">Configurar Tu Perfil</h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
          {/* Avatar Preview */}
          <div className="flex flex-col items-center justify-center gap-2">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center text-3xl shadow-lg ring-4 ring-slate-800 border border-white/20 transition-all"
              style={{ backgroundColor: color }}
            >
              {avatar}
            </div>
            <span className="text-xs font-semibold text-slate-300">Tu Avatar en el Chat</span>
          </div>

          {/* Name Field */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Nombre o Apodo</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Cinefilo_99"
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700/70 rounded-xl text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-rose-500"
              required
            />
          </div>

          {/* Select Avatar Icon */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">Icono de Avatar</label>
            <div className="grid grid-cols-6 gap-1.5">
              {AVATARS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setAvatar(emoji)}
                  className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg border transition-all ${
                    avatar === emoji
                      ? 'bg-rose-600 text-white border-rose-400 scale-110 shadow-md'
                      : 'bg-slate-950 border-slate-800 hover:bg-slate-800'
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {/* Select Color */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">Color de Usuario</label>
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full transition-all border-2 shrink-0 ${
                    color === c ? 'border-white scale-110 shadow-md' : 'border-transparent opacity-80'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-2.5 mt-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-lg shadow-rose-950/40 active:scale-95 transition-all"
          >
            Guardar Cambios
          </button>
        </form>
      </div>
    </div>
  );
};
