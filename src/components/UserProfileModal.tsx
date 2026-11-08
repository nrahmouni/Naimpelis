import React, { useState } from 'react';
import { User, X, Check } from 'lucide-react';
import { Participant } from '../types';
import { triggerHaptic } from '../utils/haptics';
import { Language, TRANSLATIONS } from '../utils/i18n';

interface UserProfileModalProps {
  currentUser: Participant;
  language: Language;
  onSave: (name: string, avatar: string, color: string) => void;
  onClose: () => void;
}

const AVATARS = ['🍿', '🎬', '🦁', '🦊', '🐱', '🐶', '👽', '🤖', '👑', '🕶️', '🔥', '⚡'];
const COLORS = ['#f43f5e', '#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4', '#e11d48'];

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  currentUser,
  language,
  onSave,
  onClose,
}) => {
  const t = TRANSLATIONS[language];
  const [name, setName] = useState(currentUser.name);
  const [avatar, setAvatar] = useState(currentUser.avatar);
  const [color, setColor] = useState(currentUser.color);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      triggerHaptic('success');
      onSave(name.trim(), avatar, color);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl flex flex-col">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-rose-500" />
            <h3 className="text-sm font-bold text-slate-100">{t.profileTitle}</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded bg-slate-800 text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-5 space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-300 block mb-1">{t.nameLabel}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none"
              required
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-300 block mb-1.5">{t.colorLabel}</label>
            <div className="flex items-center gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-6 h-6 rounded-full transition-transform ${
                    color === c ? 'scale-125 ring-2 ring-white' : 'opacity-70'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-300 block mb-1.5">{t.avatarLabel}</label>
            <div className="grid grid-cols-6 gap-2">
              {AVATARS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setAvatar(emoji)}
                  className={`h-9 rounded-xl flex items-center justify-center text-lg border ${
                    avatar === emoji ? 'bg-rose-600/30 border-rose-500' : 'bg-slate-950 border-slate-800'
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-3 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-lg"
          >
            <Check className="w-4 h-4" />
            <span>{t.saveChanges}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
