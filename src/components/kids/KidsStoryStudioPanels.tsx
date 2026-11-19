import React from 'react';
import { CheckCircle2, Volume2 } from 'lucide-react';
import type { KidsAgeGroup, KidsLanguageCode } from '../../types';
import { playKidsSound } from './kidsAudioEngine';
import { speakKidsText } from './kidsTtsHelper';
import { KidsSquishButton } from './KidsPrimitives';

export type StoryStudioTab = 'create' | 'library' | 'tutor';

export interface StoryChapterData {
  title: string;
  chapterText: string;
  choiceA: string;
  choiceB: string;
  vocabularyWord: string;
  vocabularyMeaning: string;
  quizQuestion: string;
  quizOptions: string[];
  correctOptionIndex: number;
  illustrationScene?: {
    skyTheme?: string;
    heroSymbol?: string;
    companionSymbol?: string;
    settingSymbol?: string;
    caption?: string;
  };
}

export interface TutorAnswerData {
  explanation: string;
  funFact: string;
  quizQuestion: string;
  quizOptions: string[];
  correctIndex: number;
  encouragement: string;
}

export const STORY_HEROES = ['Zorri Explorador', 'Capitana Luna', 'Dino Curioso', 'Robi Inventor'];
export const STORY_WORLDS = ['Montañas del Rif', 'Arrecife Azul', 'Estación Espacial', 'Bosque Secreto'];
export const STORY_VALUES = ['Amistad', 'Curiosidad', 'Compartir', 'Valentía'];

export const CURIOSITY_PROMPTS = [
  '¿Por qué el cielo es azul?',
  '¿Cómo duermen los delfines?',
  '¿Por qué brilla la Luna?',
  '¿Cómo hacen miel las abejas?',
];

export function buildOfflineStoryChapter(
  hero: string,
  setting: string,
  moralValue: string,
  step: number,
  lang: KidsLanguageCode,
  chosenAction = ''
): StoryChapterData {
  const isEnd = step >= 3;
  const vocabByLang: Record<KidsLanguageCode, { word: string; meaning: string }> = {
    es: { word: 'Estrella', meaning: 'Punto de luz en el cielo nocturno' },
    ca: { word: 'Estrella', meaning: 'Punt de llum al cel nocturn' },
    en: { word: 'Star', meaning: 'Bright light shining in the night sky' },
    nl: { word: 'Ster', meaning: 'Lichtpuntje hoog aan de hemel' },
    fr: { word: 'Étoile', meaning: 'Lumière brillante dans le ciel' },
    ar: { word: 'نجمة (Najma)', meaning: 'Estrella brillante en el cielo' },
    rif: { word: 'Itri', meaning: 'Estrella en Tarifit (nuestro cielo del Rif)' },
    zh: { word: '星星 (Xīngxing)', meaning: 'Estrella que brilla de noche' },
  };
  const featured = vocabByLang[lang] || vocabByLang.es;

  const chapterTexts = [
    `${hero} llegó muy ilusionado a ${setting}. Allí encontró una brújula brillante que señalaba hacia una luz misteriosa y escuchó el sonido de la palabra "${featured.word}". Para avanzar con ${moralValue.toLowerCase()}, tenía que tomar su primera decisión.`,
    `Después de elegir "${chosenAction || 'seguir el sendero luminoso'}", ${hero} descubrió un puente sobre las nubes en ${setting}. Un pequeño compañero buscaba ayuda porque había perdido su mapa estelar. Gracias al valor de ${moralValue.toLowerCase()}, unieron sus pistas y encontraron la llave dorada.`,
    `Con gran alegría, ${hero} completó la misión en ${setting} junto a su nuevo amigo. Comprendieron que ${moralValue.toLowerCase()} ilumina cualquier aventura igual que "${featured.word}" en la noche. Todo el equipo celebró mirando el cielo estrellado.`,
  ];

  return {
    title: `${hero} en ${setting}`,
    chapterText: chapterTexts[Math.min(2, Math.max(0, step - 1))],
    choiceA: isEnd ? 'Fin de la aventura' : 'Seguir las huellas brillantes',
    choiceB: isEnd ? 'Volver a empezar' : 'Preguntar al búho sabio',
    vocabularyWord: featured.word,
    vocabularyMeaning: featured.meaning,
    quizQuestion: `¿Qué valor ayudó a ${hero} en ${setting}?`,
    quizOptions: [moralValue, 'No escuchar a nadie', 'Dormir todo el día'],
    correctOptionIndex: 0,
    illustrationScene: {
      skyTheme: setting.toLowerCase().includes('espacial') ? 'space' : 'adventure',
      caption: `${hero} · Capítulo ${step}`,
    },
  };
}

export function buildOfflineTutorAnswer(question: string): TutorAnswerData {
  const q = question.toLowerCase();
  if (q.includes('cielo')) {
    return {
      explanation:
        'La luz del Sol parece blanca, pero mezcla todos los colores del arcoíris. Cuando entra en la atmósfera de la Tierra, la luz azul rebota por todas partes más que los demás colores.',
      funFact: 'Desde el espacio, sin atmósfera alrededor, el cielo se ve completamente negro incluso de día.',
      quizQuestion: '¿Qué color de la luz solar se dispersa más en nuestra atmósfera?',
      quizOptions: ['Azul', 'Verde oscuro', 'Marrón'],
      correctIndex: 0,
      encouragement: 'Pregunta brillante de científico joven.',
    };
  }
  if (q.includes('delf')) {
    return {
      explanation:
        'Los delfines duermen con medio cerebro despierto cada vez. Así pueden seguir subiendo a respirar aire a la superficie mientras descansan.',
      funFact: 'Un ojo permanece abierto vigilando el mar y cambia de lado tras unas horas.',
      quizQuestion: '¿Cómo descansan los delfines en el océano?',
      quizOptions: ['Con medio cerebro despierto', 'Debajo de la arena', 'Sin respirar nunca'],
      correctIndex: 0,
      encouragement: 'Gran curiosidad marina.',
    };
  }
  return {
    explanation:
      'En la naturaleza todo funciona por pistas asombrosas de luz, gravedad y trabajo en equipo. Observar el mundo con preguntas es el primer paso de cualquier gran descubrimiento.',
    funFact: 'Preguntar "¿por qué?" varias veces al día entrena la memoria más rápido que memorizar sin contexto.',
    quizQuestion: '¿Cuál es el primer paso de cualquier descubrimiento científico?',
    quizOptions: ['Hacer preguntas y observar', 'No probar nada', 'Adivinar sin mirar'],
    correctIndex: 0,
    encouragement: 'Sigue explorando el mundo.',
  };
}

interface SavedStoryEntry {
  id: string;
  title: string;
  lang: KidsLanguageCode;
  chapters: string[];
  createdAt: string;
}

export const KidsStoryLibraryTab: React.FC<{
  savedStories: SavedStoryEntry[];
  readingSavedIdx: number | null;
  onReadSavedStory: (idx: number, text: string, lang: KidsLanguageCode) => void;
}> = ({ savedStories, readingSavedIdx, onReadSavedStory }) => (
  <div className="space-y-3">
    {savedStories.length === 0 ? (
      <div className="rounded-2xl bg-[#0F1633] border border-white/10 p-6 text-center space-y-2">
        <p className="text-sm font-black text-white">Tu biblioteca está vacía</p>
        <p className="text-xs font-bold text-sky-200">
          Crea un cuento en la pestaña anterior y pulsa Guardar Cuento para leerlo sin internet.
        </p>
      </div>
    ) : (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {savedStories.map((st, idx) => (
          <div
            key={st.id}
            className={`rounded-2xl p-3.5 border transition-colors ${
              readingSavedIdx === idx
                ? 'bg-indigo-500/20 border-indigo-300'
                : 'bg-[#0F1633] border-white/10'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-[11px] font-black uppercase text-indigo-300">
                  {st.lang.toUpperCase()} · {st.createdAt}
                </div>
                <h4 className="font-display font-black text-sm text-white mt-0.5">{st.title}</h4>
              </div>
              <button
                type="button"
                onClick={() => onReadSavedStory(idx, st.chapters.join(' '), st.lang)}
                className="px-3 py-1.5 rounded-xl bg-amber-400 text-slate-950 font-black text-xs flex items-center gap-1 cursor-pointer shrink-0"
              >
                <Volume2 className="w-3.5 h-3.5" />
                <span>Oír</span>
              </button>
            </div>
            <p className="text-xs text-sky-100/85 mt-2 line-clamp-3">{st.chapters.join(' ')}</p>
          </div>
        ))}
      </div>
    )}
  </div>
);

export const KidsStoryTutorTab: React.FC<{
  tutorQuestion: string;
  setTutorQuestion: (q: string) => void;
  loadingTutor: boolean;
  tutorAnswer: TutorAnswerData | null;
  tutorQuizPick: number | null;
  setTutorQuizPick: (i: number) => void;
  storyLang: KidsLanguageCode;
  ageGroup: KidsAgeGroup;
  speakRate: number | undefined;
  soundEnabled: boolean;
  onAskTutor: (qOverride?: string) => Promise<void>;
  onEarnStar: (stars: number, badgeId?: string) => void;
}> = ({
  tutorQuestion,
  setTutorQuestion,
  loadingTutor,
  tutorAnswer,
  tutorQuizPick,
  setTutorQuizPick,
  storyLang,
  ageGroup,
  speakRate,
  soundEnabled,
  onAskTutor,
  onEarnStar,
}) => (
  <div className="space-y-3">
    <div className="flex flex-wrap gap-1.5">
      {CURIOSITY_PROMPTS.map((q) => (
        <button
          key={q}
          type="button"
          onClick={() => {
            setTutorQuestion(q);
            void onAskTutor(q);
          }}
          className="px-3 py-1.5 rounded-xl bg-[#182352] hover:bg-[#233378] border border-white/15 text-xs font-black text-sky-100 cursor-pointer"
        >
          {q}
        </button>
      ))}
    </div>

    <div className="flex gap-2">
      <input
        type="text"
        value={tutorQuestion}
        onChange={(e) => setTutorQuestion(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && void onAskTutor()}
        placeholder="Pregunta algo de ciencia, espacio o animales..."
        className="flex-1 h-11 px-3 rounded-xl bg-[#0F1633] border border-white/20 text-sm font-bold text-white outline-none focus:border-indigo-400"
      />
      <KidsSquishButton
        disabled={loadingTutor}
        onClick={() => void onAskTutor()}
        className="!min-h-[44px] h-11 px-4 rounded-xl bg-indigo-400 text-slate-950 border-b-4 border-indigo-700 font-black text-xs"
      >
        {loadingTutor ? 'Pensando...' : 'Preguntar'}
      </KidsSquishButton>
    </div>

    {tutorAnswer && (
      <div className="rounded-2xl bg-[#0F1633] border border-indigo-400/30 p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-bold text-white leading-relaxed">{tutorAnswer.explanation}</p>
          <button
            type="button"
            onClick={() =>
              speakKidsText(tutorAnswer.explanation, storyLang, {
                ageGroup,
                rate: speakRate,
              })
            }
            className="p-2 rounded-xl bg-amber-400/20 text-amber-300 shrink-0 cursor-pointer"
            aria-label="Escuchar respuesta"
          >
            <Volume2 className="w-4 h-4" />
          </button>
        </div>

        <div className="rounded-xl bg-amber-400/10 border border-amber-300/30 p-2.5 text-xs font-bold text-amber-200">
          Dato curioso: {tutorAnswer.funFact}
        </div>

        <div className="space-y-2 pt-1">
          <div className="text-xs font-black text-emerald-300">
            Mini Reto (+3 estrellas): {tutorAnswer.quizQuestion}
          </div>
          <div className="flex flex-wrap gap-2">
            {tutorAnswer.quizOptions.map((opt, i) => {
              const picked = tutorQuizPick === i;
              const isRight = i === tutorAnswer.correctIndex;
              return (
                <button
                  key={i}
                  type="button"
                  disabled={tutorQuizPick !== null}
                  onClick={() => {
                    setTutorQuizPick(i);
                    if (isRight) {
                      playKidsSound('levelUp', soundEnabled, true);
                      onEarnStar(3, 'explorador');
                    } else {
                      playKidsSound('error', soundEnabled, false);
                    }
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black cursor-pointer border ${
                    picked && isRight
                      ? 'bg-emerald-400 text-slate-950 border-emerald-200'
                      : picked
                      ? 'bg-rose-500/30 text-rose-200 border-rose-400'
                      : 'bg-[#182352] text-white border-white/15 hover:bg-[#22326B]'
                  }`}
                >
                  {picked && isRight && <CheckCircle2 className="w-3.5 h-3.5 inline me-1" />}
                  {opt}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    )}
  </div>
);
