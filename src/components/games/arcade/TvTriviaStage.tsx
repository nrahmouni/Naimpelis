import React, { useCallback, useEffect, useRef, useState } from 'react';
import { HelpCircle, RotateCcw, Sparkles, Trophy, Tv, Users } from 'lucide-react';
import type { AppLanguage } from '../../../types';
import { pickLang } from '../../../utils/i18n';
import { triggerHaptic } from '../../../utils/haptics';
import { loadArcadeBest, playArcadeSfx, saveArcadeBest } from './arcadeAudio';
import { PixiGameFxLayer, type PixiGameFxHandle } from './PixiGameFxLayer';

interface QuizItem {
  cat: 'cine' | 'futbol' | 'musica' | 'ciencia' | 'cultura';
  q: string;
  opts: [string, string, string, string];
  ans: 0 | 1 | 2 | 3;
}

const QUIZ_BANK: QuizItem[] = [
  { cat: 'cine', q: '¿Qué director dirigió "Origen" e "Interstellar"?', opts: ['Christopher Nolan', 'Denis Villeneuve', 'Ridley Scott', 'Steven Spielberg'], ans: 0 },
  { cat: 'cine', q: '¿Cómo se llama el planeta natal de Luke Skywalker en Star Wars?', opts: ['Hoth', 'Naboo', 'Tatooine', 'Endor'], ans: 2 },
  { cat: 'cine', q: '¿Qué actor interpreta a Tony Stark / Iron Man?', opts: ['Chris Evans', 'Robert Downey Jr.', 'Mark Ruffalo', 'Paul Rudd'], ans: 1 },
  { cat: 'cine', q: '¿Cuál fue el primer largometraje de animación por ordenador de Pixar?', opts: ['Bichos', 'Monstruos S.A.', 'Toy Story', 'Buscando a Nemo'], ans: 2 },
  { cat: 'cine', q: '¿En qué serie aparece el restaurante "Los Pollos Hermanos"?', opts: ['The Wire', 'Breaking Bad', 'Narcos', 'Ozark'], ans: 1 },
  { cat: 'cine', q: '¿Qué estudio japonés creó "El viaje de Chihiro"?', opts: ['Toei Animation', 'Studio Ghibli', 'Madhouse', 'Kyoto Animation'], ans: 1 },
  { cat: 'futbol', q: '¿En qué año ganó España su primer Mundial de fútbol masculino?', opts: ['2006', '2008', '2010', '2012'], ans: 2 },
  { cat: 'futbol', q: '¿Quién marcó el gol de España en la final del Mundial de Sudáfrica?', opts: ['Fernando Torres', 'David Villa', 'Andrés Iniesta', 'Xavi Hernández'], ans: 2 },
  { cat: 'futbol', q: '¿Qué club posee más títulos de la UEFA Champions League?', opts: ['AC Milan', 'FC Barcelona', 'Bayern Múnich', 'Real Madrid'], ans: 3 },
  { cat: 'futbol', q: '¿Qué futbolista ha ganado más Balones de Oro en la historia?', opts: ['Cristiano Ronaldo', 'Lionel Messi', 'Johan Cruyff', 'Michel Platini'], ans: 1 },
  { cat: 'futbol', q: '¿Cuál es el estadio del Athletic Club en Bilbao?', opts: ['Anoeta', 'Mestalla', 'San Mamés', 'El Sadar'], ans: 2 },
  { cat: 'futbol', q: '¿Qué selección ganó la Eurocopa 2024 en Alemania?', opts: ['Francia', 'Inglaterra', 'España', 'Alemania'], ans: 2 },
  { cat: 'musica', q: '¿Qué cantante española lanzó el álbum "Motomami"?', opts: ['Aitana', 'Rosalía', 'Bad Gyal', 'Lola Índigo'], ans: 1 },
  { cat: 'musica', q: '¿De qué ciudad británica eran originarios The Beatles?', opts: ['Mánchester', 'Londres', 'Liverpool', 'Birmingham'], ans: 2 },
  { cat: 'musica', q: '¿Cuántas cuerdas tiene normalmente una guitarra española estándar?', opts: ['4', '5', '6', '8'], ans: 2 },
  { cat: 'musica', q: '¿Qué grupo español compuso "La Flaca"?', opts: ['Estopa', 'Jarabe de Palo', 'Fito & Fitipaldis', 'El Canto del Loco'], ans: 1 },
  { cat: 'musica', q: '¿Quién interpretó "Bohemian Rhapsody" como vocalista de Queen?', opts: ['Freddie Mercury', 'David Bowie', 'Elton John', 'George Michael'], ans: 0 },
  { cat: 'ciencia', q: '¿Cuál es el planeta más cercano al Sol?', opts: ['Venus', 'Mercurio', 'Marte', 'Tierra'], ans: 1 },
  { cat: 'ciencia', q: '¿Cuál es el símbolo químico del oro en la tabla periódica?', opts: ['Ag', 'Or', 'Au', 'Fe'], ans: 2 },
  { cat: 'ciencia', q: '¿Cuántos corazones tiene un pulpo?', opts: ['1', '2', '3', '4'], ans: 2 },
  { cat: 'ciencia', q: '¿Qué científica ganó dos premios Nobel en Física y Química?', opts: ['Rosalind Franklin', 'Marie Curie', 'Ada Lovelace', 'Jane Goodall'], ans: 1 },
  { cat: 'ciencia', q: '¿Cuál es el hueso más largo del cuerpo humano?', opts: ['Húmero', 'Tibia', 'Fémur', 'Radio'], ans: 2 },
  { cat: 'ciencia', q: '¿Qué órgano del cuerpo humano produce la insulina?', opts: ['Hígado', 'Riñón', 'Páncreas', 'Estómago'], ans: 2 },
  { cat: 'cultura', q: '¿En qué ciudad se encuentra el Museo del Prado?', opts: ['Barcelona', 'Madrid', 'Sevilla', 'Valencia'], ans: 1 },
  { cat: 'cultura', q: '¿Quién escribió "Don Quijote de la Mancha"?', opts: ['Lope de Vega', 'Miguel de Cervantes', 'Francisco de Quevedo', 'Calderón de la Barca'], ans: 1 },
  { cat: 'cultura', q: '¿Cuál es el río más caudaloso del mundo?', opts: ['Nilo', 'Misisipi', 'Amazonas', 'Yangtsé'], ans: 2 },
  { cat: 'cultura', q: '¿En qué año llegó el ser humano a la Luna con el Apolo 11?', opts: ['1965', '1969', '1972', '1959'], ans: 1 },
  { cat: 'cultura', q: '¿Quién pintó "El Guernica"?', opts: ['Salvador Dalí', 'Pablo Picasso', 'Joan Miró', 'Diego Velázquez'], ans: 1 },
];

const CAT_LABELS: Record<string, string> = {
  all: 'Todas',
  cine: 'Cine y Series',
  futbol: 'Fútbol',
  musica: 'Música',
  ciencia: 'Ciencia',
  cultura: 'Cultura',
};

interface TvTriviaStageProps {
  lang: AppLanguage;
  mutedOverride?: boolean;
}

export const TvTriviaStage: React.FC<TvTriviaStageProps> = ({ lang, mutedOverride = false }) => {
  const BEST_KEY = 'riffan_arcade_tvtrivia_best_v1';
  const [phase, setPhase] = useState<'setup' | 'playing' | 'podium'>('setup');
  const [playerCount, setPlayerCount] = useState(1);
  const [category, setCategory] = useState('all');
  const [players, setPlayers] = useState<Array<{ name: string; score: number; streak: number; fifty: number }>>([]);
  const [deck, setDeck] = useState<QuizItem[]>([]);
  const [qIdx, setQIdx] = useState(0);
  const [turnIdx, setTurnIdx] = useState(0);
  const [timeLeft, setTimeLeft] = useState(15);
  const [chosenIdx, setChosenIdx] = useState<number | null>(null);
  const [hiddenOpts, setHiddenOpts] = useState<Record<number, boolean>>({});
  const [bestScore, setBestScore] = useState(() => loadArcadeBest(BEST_KEY));
  const pixiFxRef = useRef<PixiGameFxHandle | null>(null);

  const beginMatch = () => {
    triggerHaptic('medium');
    const nextPlayers = Array.from({ length: playerCount }, (_, i) => ({
      name: `Jugador ${i + 1}`,
      score: 0,
      streak: 0,
      fifty: 2,
    }));
    const filtered = category === 'all' ? QUIZ_BANK : QUIZ_BANK.filter((q) => q.cat === category);
    const pool = [...(filtered.length >= 10 ? filtered : QUIZ_BANK)].sort(() => Math.random() - 0.5).slice(0, 10);
    setPlayers(nextPlayers);
    setDeck(pool);
    setQIdx(0);
    setTurnIdx(0);
    setTimeLeft(15);
    setChosenIdx(null);
    setHiddenOpts({});
    setPhase('playing');
  };

  const handleAnswer = useCallback(
    (idx: number) => {
      if (phase !== 'playing' || chosenIdx !== null) return;
      setChosenIdx(idx);
      const q = deck[qIdx];
      const correct = q && idx === q.ans;
      setPlayers((prev) =>
        prev.map((pl, i) => {
          if (i !== turnIdx) return pl;
          if (!correct) return { ...pl, streak: 0 };
          const streak = pl.streak + 1;
          const pts = 100 + Math.round(timeLeft * 8) + (streak - 1) * 25;
          const total = pl.score + pts;
          if (total > bestScore) {
            setBestScore(total);
            saveArcadeBest(BEST_KEY, total);
          }
          return { ...pl, streak, score: total };
        })
      );
      if (correct) {
        playArcadeSfx(660, 0.14, 'triangle', 0.08, mutedOverride);
        pixiFxRef.current?.emitBurst(0.5, 0.55, 'goal', 20);
      } else {
        playArcadeSfx(160, 0.2, 'sawtooth', 0.07, mutedOverride);
      }

      window.setTimeout(() => {
        if (qIdx + 1 >= deck.length) {
          setPhase('podium');
        } else {
          setQIdx((v) => v + 1);
          setTurnIdx((v) => (v + 1) % playerCount);
          setTimeLeft(15);
          setChosenIdx(null);
          setHiddenOpts({});
        }
      }, 1450);
    },
    [phase, chosenIdx, deck, qIdx, turnIdx, timeLeft, bestScore, mutedOverride, playerCount]
  );

  useEffect(() => {
    if (phase !== 'playing' || chosenIdx !== null) return;
    const t = window.setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 0.25) {
          handleAnswer(-1);
          return 0;
        }
        return prev - 0.25;
      });
    }, 250);
    return () => window.clearInterval(t);
  }, [phase, chosenIdx, handleAnswer]);

  const useFifty = () => {
    const q = deck[qIdx];
    const pl = players[turnIdx];
    if (!q || !pl || pl.fifty <= 0 || chosenIdx !== null) return;
    const wrongs = [0, 1, 2, 3].filter((i) => i !== q.ans).sort(() => Math.random() - 0.5);
    setHiddenOpts({ [wrongs[0]]: true, [wrongs[1]]: true });
    setPlayers((prev) => prev.map((p, i) => (i === turnIdx ? { ...p, fifty: p.fifty - 1 } : p)));
    playArcadeSfx(620, 0.08, 'sine', 0.06, mutedOverride);
  };

  if (phase === 'setup') {
    return (
      <div className="w-full max-w-2xl mx-auto rounded-3xl bg-[radial-gradient(ellipse_at_top,rgba(56,189,248,0.16),rgba(13,18,32,0.98)_65%)] border border-cyan-400/20 shadow-[0_20px_54px_rgba(0,0,0,0.75)] p-6 space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-500/30 via-violet-500/25 to-amber-400/20 border border-cyan-300/40 shadow-[0_0_24px_rgba(34,211,238,0.28)] flex items-center justify-center shrink-0">
              <Tv className="w-6 h-6 text-cyan-300" />
            </div>
            <div>
              <h3 className="font-display text-2xl font-black text-white">Riffan TV Quiz Show</h3>
              <p className="text-xs sm:text-sm text-zinc-400 mt-1">
                {pickLang(lang, {
                  es: 'Concurso de preguntas para 1 jugador o hasta 4 turnos en el mismo dispositivo.',
                  ca: 'Concurs de preguntes per a 1 jugador o fins a 4 torns al mateix dispositiu.',
                  en: 'Spanish TV Trivia show for 1 player or up to 4 pass-and-play turns.',
                })}
              </p>
            </div>
          </div>
          <span className="text-xs font-bold text-amber-300 flex items-center gap-1 tabular-nums shrink-0">
            <Trophy className="w-4 h-4" /> {bestScore}
          </span>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-bold text-zinc-400 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" /> Jugadores en sala / sofá
          </div>
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 4].map((cnt) => (
              <button
                key={cnt}
                type="button"
                onClick={() => setPlayerCount(cnt)}
                className={`min-h-11 px-4 rounded-xl text-xs font-bold cursor-pointer whitespace-nowrap border ${
                  playerCount === cnt
                    ? 'bg-[#7C3AED] border-[#8B5CF6] text-white'
                    : 'bg-white/[0.05] border-white/10 text-zinc-300 hover:bg-white/[0.1]'
                }`}
              >
                {cnt === 1 ? '1 Jugador' : `${cnt} Jugadores`}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-bold text-zinc-400">Categoría</div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(CAT_LABELS).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setCategory(k)}
                className={`min-h-10 px-3.5 rounded-xl text-xs font-bold cursor-pointer whitespace-nowrap border ${
                  category === k
                    ? 'bg-cyan-600 border-cyan-400 text-white'
                    : 'bg-white/[0.05] border-white/10 text-zinc-300 hover:bg-white/[0.1]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={beginMatch}
          className="w-full min-h-12 rounded-2xl bg-[#7C3AED] hover:bg-[#8B5CF6] text-sm font-black text-white cursor-pointer"
        >
          Empezar Concurso (10 preguntas)
        </button>
      </div>
    );
  }

  if (phase === 'podium') {
    const sorted = [...players].sort((a, b) => b.score - a.score);
    return (
      <div className="w-full max-w-xl mx-auto rounded-3xl bg-[radial-gradient(ellipse_at_top,rgba(250,204,21,0.16),rgba(13,18,32,0.98)_65%)] border border-amber-400/25 shadow-[0_20px_54px_rgba(0,0,0,0.75)] p-6 space-y-5 text-center">
        <div className="flex items-center justify-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400/25 to-cyan-500/20 border border-amber-300/45 flex items-center justify-center shadow-[0_0_24px_rgba(250,204,21,0.3)] shrink-0">
            <Sparkles className="w-6 h-6 text-amber-300" />
          </div>
          <Trophy className="w-11 h-11 text-amber-400 drop-shadow-[0_0_12px_rgba(250,204,21,0.65)]" />
        </div>
        <h3 className="font-display text-2xl font-black text-white">Clasificación Final</h3>
        <div className="space-y-2">
          {sorted.map((pl, idx) => (
            <div
              key={pl.name}
              className="flex items-center justify-between px-4 py-3 rounded-2xl bg-white/[0.05] border border-white/10 text-sm font-bold text-white tabular-nums"
            >
              <span>{idx === 0 ? `🏆 ${pl.name}` : `${idx + 1}. ${pl.name}`}</span>
              <span className="text-emerald-300">{pl.score} pts</span>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setPhase('setup')}
          className="min-h-11 px-6 rounded-xl bg-[#7C3AED] hover:bg-[#8B5CF6] text-xs font-black text-white inline-flex items-center gap-2 cursor-pointer"
        >
          <RotateCcw className="w-4 h-4" /> Jugar otra ronda
        </button>
      </div>
    );
  }

  const q = deck[qIdx];
  const curPlayer = players[turnIdx];
  const pct = Math.max(0, (timeLeft / 15) * 100);

  return (
    <div className="relative overflow-hidden w-full max-w-3xl mx-auto rounded-3xl bg-[radial-gradient(ellipse_at_top,rgba(56,189,248,0.14),rgba(13,18,32,0.98)_65%)] border border-cyan-400/20 shadow-[0_20px_54px_rgba(0,0,0,0.75)] p-4 sm:p-6 space-y-5">
      <PixiGameFxLayer ref={pixiFxRef} />
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold">
        <div className="flex flex-wrap items-center gap-2 tabular-nums">
          {players.map((pl, idx) => (
            <div
              key={pl.name}
              className={`px-3 py-1.5 rounded-xl border ${
                idx === turnIdx ? 'border-cyan-400 bg-cyan-500/15 text-white' : 'border-white/10 bg-white/[0.04] text-zinc-400'
              }`}
            >
              {pl.name}: {pl.score}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!curPlayer || curPlayer.fifty <= 0 || chosenIdx !== null}
            onClick={useFifty}
            className="min-h-10 px-3 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 disabled:opacity-40 border border-amber-400/40 text-amber-200 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <HelpCircle className="w-4 h-4" /> 50/50 ({curPlayer?.fifty ?? 0})
          </button>
          <span className="text-zinc-400 tabular-nums">
            {qIdx + 1}/{deck.length}
          </span>
        </div>
      </div>

      <div className="h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
        <div
          className={`h-full transition-all duration-200 ${pct < 30 ? 'bg-rose-500' : 'bg-cyan-400'}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {q && (
        <>
          <div className="space-y-1">
            <div className="text-xs font-bold text-cyan-300">{CAT_LABELS[q.cat]}</div>
            <h3 className="text-lg sm:text-2xl font-black text-white leading-snug">{q.q}</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {q.opts.map((opt, idx) => {
              const hidden = Boolean(hiddenOpts[idx]);
              const isAns = idx === q.ans;
              const isChosen = chosenIdx === idx;
              let btnStyle =
                'bg-gradient-to-b from-white/[0.08] to-white/[0.03] hover:from-cyan-500/20 hover:to-violet-500/15 border-white/15 border-b-2 border-b-white/25 text-white shadow-md';
              if (chosenIdx !== null) {
                if (isAns)
                  btnStyle =
                    'bg-gradient-to-b from-emerald-600/90 to-emerald-800/90 border-emerald-300 text-white shadow-[0_0_24px_rgba(16,185,129,0.5)]';
                else if (isChosen)
                  btnStyle =
                    'bg-gradient-to-b from-rose-700/90 to-rose-900/90 border-rose-400 text-white shadow-[0_0_18px_rgba(244,63,94,0.45)]';
              }
              return (
                <button
                  key={idx}
                  type="button"
                  disabled={hidden || chosenIdx !== null}
                  onClick={() => handleAnswer(idx)}
                  className={`min-h-14 px-4 py-3 rounded-2xl border text-left text-sm font-bold transition-all active:scale-[0.98] cursor-pointer disabled:opacity-20 flex items-center gap-3 ${btnStyle}`}
                >
                  <span className="w-7 h-7 rounded-lg bg-white/10 border border-white/20 flex items-center justify-center text-xs font-black text-cyan-200 shrink-0">
                    {['A', 'B', 'C', 'D'][idx]}
                  </span>
                  <span className="leading-snug">{opt}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
