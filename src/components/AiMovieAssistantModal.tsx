import React, { useState } from 'react';
import { Sparkles, Film, ArrowRight, RefreshCw, X, Lightbulb } from 'lucide-react';
import { motion } from 'motion/react';
import { triggerHaptic, playCinemaSound } from '../utils/haptics';

interface MovieRec {
  title: string;
  year: string;
  genre: string;
  pitch: string;
  searchQuery: string;
}

interface AiMovieAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentMovieTitle?: string;
  onSelectMovie: (title: string) => void;
}

const PRESET_MOODS = [
  { label: '🤯 Giros Inesperados', query: 'películas con giros de guión sorprendentes' },
  { label: '😂 Risas con Amigos', query: 'comedia divertida para reír en grupo' },
  { label: '😱 Terror Inquietante', query: 'terror psicológico o suspenso tenso' },
  { label: '🚀 Ciencia Ficción Épica', query: 'sci-fi inteligente y visualmente impactante' },
  { label: '🍿 Acción Palomitera', query: 'acción pura o aventura entretenida' },
];

export const AiMovieAssistantModal: React.FC<AiMovieAssistantModalProps> = ({
  isOpen,
  onClose,
  currentMovieTitle,
  onSelectMovie,
}) => {
  const [mood, setMood] = useState('');
  const [recommendations, setRecommendations] = useState<MovieRec[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleAskGemini = async (selectedMood?: string) => {
    const finalMood = selectedMood || mood;
    setIsLoading(true);
    triggerHaptic('medium');
    playCinemaSound('sync');

    try {
      const res = await fetch('/api/ai/recommend-movies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mood: finalMood, currentMovie: currentMovieTitle, count: 3 }),
      });
      const data = await res.json();
      if (data.recommendations) {
        setRecommendations(data.recommendations);
      } else if (data.fallback) {
        setRecommendations(data.fallback);
      }
    } catch {
      setRecommendations([
        { title: 'Inception', year: '2010', genre: 'Sci-Fi', pitch: 'Giro tras giro en sueños compartidos.', searchQuery: 'Inception' },
        { title: 'Parasite', year: '2019', genre: 'Suspense', pitch: 'Imposible despegar los ojos.', searchQuery: 'Parasite' },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePickMovie = (searchQuery: string) => {
    triggerHaptic('success');
    playCinemaSound('popcorn');
    onSelectMovie(searchQuery);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-slate-900 border border-slate-700/80 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl text-slate-100 flex flex-col"
      >
        <div className="bg-gradient-to-r from-amber-500/20 via-rose-500/20 to-slate-900 px-4 py-3.5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-500 flex items-center justify-center text-white shadow-lg">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white">Cinéfilo AI (Gemini)</h3>
              <p className="text-[11px] text-slate-400">Recomendaciones según el ánimo de la sala</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded bg-slate-800 text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3.5">
          <div className="flex flex-wrap gap-1.5">
            {PRESET_MOODS.map((pm) => (
              <button
                key={pm.label}
                onClick={() => {
                  setMood(pm.query);
                  handleAskGemini(pm.query);
                }}
                className="px-2.5 py-1 rounded-xl bg-slate-800 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold"
              >
                {pm.label}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={mood}
              onChange={(e) => setMood(e.target.value)}
              placeholder="¿Qué queréis ver hoy?..."
              className="flex-1 px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none"
            />
            <button
              onClick={() => handleAskGemini()}
              disabled={isLoading}
              className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shrink-0"
            >
              {isLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              <span>{isLoading ? '...' : 'Buscar'}</span>
            </button>
          </div>

          <div className="space-y-2">
            {recommendations.map((rec) => (
              <div key={rec.title} className="p-3 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h4 className="text-xs font-bold text-slate-100">{rec.title} ({rec.year})</h4>
                  <p className="text-[11px] text-slate-400 italic">"{rec.pitch}"</p>
                </div>
                <button
                  onClick={() => handlePickMovie(rec.searchQuery || rec.title)}
                  className="px-3 py-1.5 rounded-xl bg-rose-600 text-white font-bold text-xs shrink-0 flex items-center gap-1"
                >
                  <span>Ver</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
};
