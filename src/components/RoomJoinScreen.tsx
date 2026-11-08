import React, { useState, useEffect } from 'react';
import { Film, Sparkles, History } from 'lucide-react';
import { motion } from 'framer-motion';
import { triggerHaptic, playCinemaSound } from '../utils/haptics';
import { getStoredProfile, saveStoredProfile, getRecentRooms } from '../utils/storage';
import { RecentRoom } from '../types';
import { Language, TRANSLATIONS } from '../utils/i18n';

interface RoomJoinScreenProps {
  initialRoomId?: string;
  onJoinRoom: (roomId: string, user: { name: string; avatar: string; color: string }, lang: Language) => void;
}

const AVATARS = ['🍿', '🎬', '🦁', '🦊', '🐱', '🐶', '👽', '🤖', '👑', '🕶️', '🔥', '⚡'];
const COLORS = ['#f43f5e', '#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4', '#e11d48'];

const FUNNY_NAMES = [
  'Palomita_Asesina', 'Cinefilo_Sin_Silla', 'Spoiler_Man', 'Mando_A_Distancia', 
  'Peli_Y_Manta', 'El_Rey_Del_Popcorn', 'Critico_De_Sofa', 'Actor_Secundario', 
  'Proyeccionista_Loco', 'Cine_De_Barrio', 'Frikipelis', 'Buscador_De_Trailers',
  'Naim_El_Jefe', 'Cinefilo_Extremo'
];

export const RoomJoinScreen: React.FC<RoomJoinScreenProps> = ({
  initialRoomId,
  onJoinRoom,
}) => {
  const stored = getStoredProfile();
  const [roomIdInput, setRoomIdInput] = useState(initialRoomId || '');
  const [userName, setUserName] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState(stored.avatar || '🍿');
  const [selectedColor, setSelectedColor] = useState(stored.color || '#f43f5e');
  const [language, setLanguage] = useState<Language>('es');
  const [recentRooms, setRecentRooms] = useState<RecentRoom[]>([]);
  const t = TRANSLATIONS[language];

  useEffect(() => {
    setRecentRooms(getRecentRooms());
  }, []);

  const handleSaveAndJoin = (targetRoomId: string) => {
    triggerHaptic('success');
    playCinemaSound('join');

    let nameToUse = userName.trim();
    if (!nameToUse) {
      const randomFunny = FUNNY_NAMES[Math.floor(Math.random() * FUNNY_NAMES.length)];
      nameToUse = `${randomFunny}_${Math.floor(Math.random() * 900 + 100)}`;
    }
    
    const profile = { name: nameToUse, avatar: selectedAvatar, color: selectedColor };
    saveStoredProfile(profile);
    onJoinRoom(targetRoomId, profile, language);
  };

  const handleCreateNewRoom = () => {
    const targetRoomId = initialRoomId || `sala-${Math.random().toString(36).substring(2, 8)}`;
    handleSaveAndJoin(targetRoomId);
  };

  const handleJoinExisting = (e: React.FormEvent) => {
    e.preventDefault();
    if (roomIdInput.trim()) {
      const cleanRoomId = roomIdInput.trim().replace(/^.*[?&]room=/, '');
      handleSaveAndJoin(cleanRoomId);
    }
  };

  return (
    <div className="min-h-screen w-full bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 relative overflow-y-auto selection:bg-rose-500 selection:text-white py-12">
      <div className="absolute inset-0 z-0 fixed">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center opacity-20 grayscale" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md z-10 flex flex-col items-center"
      >
        <div className="flex items-center gap-3 mb-6 sm:mb-8">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-rose-600 flex items-center justify-center shadow-lg shadow-rose-900/40">
            <Film className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tighter uppercase italic">
              Naimpelis<span className="text-rose-600">.</span>
            </h1>
            <p className="text-[9px] sm:text-[10px] text-rose-500 font-bold tracking-widest uppercase">Premium Cinema Experience</p>
          </div>
        </div>

        <div className="w-full bg-slate-900/60 backdrop-blur-3xl border border-white/10 rounded-[2rem] sm:rounded-[2.5rem] p-6 sm:p-8 shadow-2xl space-y-4 sm:space-y-6">
          <div className="space-y-3 sm:space-y-4">
            {/* Language Selector */}
            <div className="flex justify-center gap-2 mb-2">
              {(['es', 'en', 'zh'] as Language[]).map((l) => (
                <button
                  key={l}
                  onClick={() => setLanguage(l)}
                  className={`px-4 py-2 rounded-full text-[11px] font-black uppercase transition-all flex items-center gap-2 ${
                    language === l ? 'bg-rose-600 text-white shadow-lg shadow-rose-900/40 ring-2 ring-rose-500/50' : 'bg-slate-950/50 text-slate-500 border border-white/5 hover:border-white/20'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${language === l ? 'bg-white' : 'bg-transparent'}`} />
                  {l === 'es' ? 'Español' : l === 'en' ? 'English' : '中文'}
                </button>
              ))}
            </div>

            <div className="text-center space-y-1">
              <h2 className="text-base sm:text-lg font-bold text-white">{t.welcome}</h2>
              <p className="text-[10px] sm:text-xs text-slate-400">{t.welcomeSub}</p>
            </div>

            <div className="space-y-4">
              <div className="relative">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    placeholder={t.namePlaceholder}
                    className="flex-1 h-12 sm:h-14 bg-slate-950/50 border border-white/5 rounded-2xl px-5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-rose-500/50 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      const randomFunny = FUNNY_NAMES[Math.floor(Math.random() * FUNNY_NAMES.length)];
                      setUserName(`${randomFunny}_${Math.floor(Math.random() * 900 + 100)}`);
                    }}
                    className="w-12 sm:w-14 h-12 sm:h-14 bg-slate-800 hover:bg-slate-700 text-white rounded-2xl flex items-center justify-center transition-all active:scale-90 border border-white/5 group"
                    title={t.randomName}
                  >
                    <History className="w-5 h-5 group-hover:rotate-180 transition-transform duration-500" />
                  </button>
                </div>
                {!userName.trim() && (
                  <p className="mt-1.5 ml-2 text-[8px] font-bold text-rose-500 animate-pulse uppercase tracking-tighter">
                    {t.nameRequired}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between gap-2 px-1">
                <div className="flex items-center gap-2">
                  <div 
                    className="w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center text-xl sm:text-2xl border-2 border-rose-500/30 bg-slate-950"
                    style={{ color: selectedColor }}
                  >
                    {selectedAvatar}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-tight">{t.avatarLabel}</span>
                    <span className="text-[10px] sm:text-xs text-slate-300 font-medium">{t.avatarSub}</span>
                  </div>
                </div>
                
                <div className="flex gap-1">
                  {COLORS.slice(0, 4).map(c => (
                    <button 
                      key={c}
                      onClick={() => setSelectedColor(c)}
                      className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full border-2 ${selectedColor === c ? 'border-white scale-110' : 'border-transparent opacity-50'}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-6 gap-2 pt-1 sm:pt-2">
                {AVATARS.slice(0, 12).map(emoji => (
                  <button
                    key={emoji}
                    onClick={() => setSelectedAvatar(emoji)}
                    className={`h-9 sm:h-10 rounded-xl flex items-center justify-center text-base sm:text-lg transition-all ${
                      selectedAvatar === emoji ? 'bg-rose-600 text-white shadow-lg' : 'bg-slate-950/50 hover:bg-slate-800 text-slate-400 border border-white/5'
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="pt-2 sm:pt-4 space-y-3">
            <button
              onClick={handleCreateNewRoom}
              disabled={!userName.trim()}
              className="w-full h-14 sm:h-16 bg-rose-600 hover:bg-rose-500 text-white rounded-2xl font-black text-xs sm:text-sm uppercase tracking-widest shadow-xl shadow-rose-900/20 active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed"
            >
              <Sparkles className="w-5 h-5 fill-white" />
              <span>{t.createRoom}</span>
            </button>

            <div className="flex items-center gap-4 py-1 sm:py-2">
              <div className="h-px flex-1 bg-white/5" />
              <span className="text-[9px] sm:text-[10px] font-bold text-slate-600 uppercase tracking-widest">{t.joinRoom}</span>
              <div className="h-px flex-1 bg-white/5" />
            </div>

            <form onSubmit={handleJoinExisting} className="flex gap-2">
              <input
                type="text"
                value={roomIdInput}
                onChange={(e) => setRoomIdInput(e.target.value)}
                placeholder={t.roomIdPlaceholder}
                className="flex-1 h-10 sm:h-12 bg-slate-950/50 border border-white/5 rounded-xl px-4 text-[10px] sm:text-xs text-white placeholder:text-slate-600 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!userName.trim()}
                className="h-10 sm:h-12 px-4 sm:px-6 bg-slate-800 hover:bg-slate-700 text-white font-bold text-[10px] sm:text-xs rounded-xl transition-all disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed"
              >
                {t.enterButton}
              </button>
            </form>
          </div>
        </div>

        <p className="mt-6 sm:mt-8 text-[9px] sm:text-[10px] text-slate-500 font-medium tracking-wide uppercase">
          © 2026 NAIMPELIS • {t.premiumCinema}
        </p>
      </motion.div>
    </div>
  );
};
