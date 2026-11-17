import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookmarkCheck,
  BookOpen,
  CheckCircle2,
  HelpCircle,
  Loader2,
  Sparkles,
  Volume2,
  X,
} from 'lucide-react';
import type { KidsAgeGroup, KidsLanguageCode } from '../../types';
import { triggerHaptic } from '../../utils/haptics';
import { useKidsStore } from '../../store/useKidsStore';
import { KIDS_LANGUAGES } from './kidsData';
import { playKidsSound } from './kidsAudioEngine';
import { getKidsDir } from './kidsI18n';
import { speakKidsText } from './kidsTtsHelper';
import { KidsSquishButton } from './KidsPrimitives';
import { KidsAnimatedPosterSvg, KidsBadgeIcon } from './KidsSvgArt';

type StoryStudioTab = 'create' | 'library' | 'tutor';

interface StoryChapterData {
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

interface TutorAnswerData {
  explanation: string;
  funFact: string;
  quizQuestion: string;
  quizOptions: string[];
  correctIndex: number;
  encouragement: string;
}

const STORY_HEROES = ['Zorri Explorador', 'Capitana Luna', 'Dino Curioso', 'Robi Inventor'];
const STORY_WORLDS = ['Montañas del Rif', 'Arrecife Azul', 'Estación Espacial', 'Bosque Secreto'];
const STORY_VALUES = ['Amistad', 'Curiosidad', 'Compartir', 'Valentía'];

const CURIOSITY_PROMPTS = [
  '¿Por qué el cielo es azul?',
  '¿Cómo duermen los delfines?',
  '¿Por qué brilla la Luna?',
  '¿Cómo hacen miel las abejas?',
];

function buildOfflineStoryChapter(
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

function buildOfflineTutorAnswer(question: string): TutorAnswerData {
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

interface KidsStoryStudioProps {
  open: boolean;
  onClose: () => void;
  kidsLang: KidsLanguageCode;
  ageGroup: KidsAgeGroup;
  onEarnStar: (stars: number, badgeId?: string) => void;
}

export const KidsStoryStudio: React.FC<KidsStoryStudioProps> = ({
  open,
  onClose,
  kidsLang,
  ageGroup,
  onEarnStar,
}) => {
  const profile = useKidsStore((s) => s.getActiveProfile());
  const ux = useKidsStore((s) => s.ux);
  const saveKidsStory = useKidsStore((s) => s.saveKidsStory);
  const recordDomainResult = useKidsStore((s) => s.recordDomainResult);

  const [tab, setTab] = useState<StoryStudioTab>('create');

  // Creator config
  const [hero, setHero] = useState(STORY_HEROES[0]);
  const [setting, setSetting] = useState(STORY_WORLDS[0]);
  const [moralValue, setMoralValue] = useState(STORY_VALUES[0]);
  const [storyLang, setStoryLang] = useState<KidsLanguageCode>(kidsLang);

  // Active Story state
  const [step, setStep] = useState(1);
  const [chaptersHistory, setChaptersHistory] = useState<string[]>([]);
  const [featuredWords, setFeaturedWords] = useState<string[]>([]);
  const [currentChapter, setCurrentChapter] = useState<StoryChapterData | null>(null);
  const [loadingStory, setLoadingStory] = useState(false);
  const [quizAnswerIdx, setQuizAnswerIdx] = useState<number | null>(null);
  const [savedFlag, setSavedFlag] = useState(false);

  // Karaoke word highlighter state
  const [karaokeWordIdx, setKaraokeWordIdx] = useState<number>(-1);
  const karaokeTimerRef = useRef<number | null>(null);

  // Library active reading state
  const [readingSavedIdx, setReadingSavedIdx] = useState<number | null>(null);

  // Profe IA state
  const [tutorQuestion, setTutorQuestion] = useState(CURIOSITY_PROMPTS[0]);
  const [tutorAnswer, setTutorAnswer] = useState<TutorAnswerData | null>(null);
  const [loadingTutor, setLoadingTutor] = useState(false);
  const [tutorQuizPick, setTutorQuizPick] = useState<number | null>(null);

  useEffect(() => {
    return () => {
      if (karaokeTimerRef.current) window.clearInterval(karaokeTimerRef.current);
    };
  }, []);

  const stopKaraoke = () => {
    if (karaokeTimerRef.current) {
      window.clearInterval(karaokeTimerRef.current);
      karaokeTimerRef.current = null;
    }
    setKaraokeWordIdx(-1);
  };

  const activeStoryWords = useMemo(() => {
    if (tab === 'library' && readingSavedIdx !== null) {
      const saved = (profile.savedStories || [])[readingSavedIdx];
      return saved ? saved.chapters.join(' ').split(/\s+/).filter(Boolean) : [];
    }
    return currentChapter ? currentChapter.chapterText.split(/\s+/).filter(Boolean) : [];
  }, [currentChapter, profile.savedStories, readingSavedIdx, tab]);

  if (!open) return null;

  const dir = getKidsDir(kidsLang);
  const speakRate = ux.tortoiseSpeech ? 0.72 : undefined;

  const playKaraokeReadAloud = (text: string, lang: KidsLanguageCode) => {
    stopKaraoke();
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length === 0) return;

    triggerHaptic('light');
    void speakKidsText(text, lang, { ageGroup, rate: speakRate });

    const msPerWord = ux.tortoiseSpeech ? 460 : 320;
    let idx = 0;
    setKaraokeWordIdx(0);
    karaokeTimerRef.current = window.setInterval(() => {
      idx += 1;
      if (idx >= words.length) {
        stopKaraoke();
      } else {
        setKaraokeWordIdx(idx);
      }
    }, msPerWord);
  };

  const generateChapter = async (nextStep: number, chosenAction = '', prevText = '') => {
    stopKaraoke();
    setLoadingStory(true);
    setQuizAnswerIdx(null);
    setSavedFlag(false);

    try {
      const res = await fetch('/api/kids/ai-story', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hero,
          setting,
          moralValue,
          lang: storyLang,
          ageGroup,
          step: nextStep,
          previousStory: prevText,
          chosenAction,
        }),
      });
      if (!res.ok) throw new Error('offline_fallback');
      const data = await res.json();
      if (!data?.ok || !data?.story?.chapterText) throw new Error('invalid_story');

      const chapter = data.story as StoryChapterData;
      setCurrentChapter(chapter);
      setStep(nextStep);
      setChaptersHistory((prev) =>
        nextStep === 1 ? [chapter.chapterText] : [...prev, chapter.chapterText]
      );
      if (chapter.vocabularyWord) {
        setFeaturedWords((prev) =>
          Array.from(new Set([...(nextStep === 1 ? [] : prev), chapter.vocabularyWord]))
        );
      }
    } catch {
      const fallback = buildOfflineStoryChapter(
        hero,
        setting,
        moralValue,
        nextStep,
        storyLang,
        chosenAction
      );
      setCurrentChapter(fallback);
      setStep(nextStep);
      setChaptersHistory((prev) =>
        nextStep === 1 ? [fallback.chapterText] : [...prev, fallback.chapterText]
      );
      setFeaturedWords((prev) =>
        Array.from(new Set([...(nextStep === 1 ? [] : prev), fallback.vocabularyWord]))
      );
    } finally {
      setLoadingStory(false);
    }
  };

  const handleSaveToLibrary = () => {
    if (!currentChapter || savedFlag) return;
    saveKidsStory({
      id: `story-${Date.now().toString(36)}`,
      title: currentChapter.title,
      lang: storyLang,
      chapters: chaptersHistory.length > 0 ? chaptersHistory : [currentChapter.chapterText],
      featuredWords,
      createdAt: new Date().toISOString().slice(0, 10),
    });
    setSavedFlag(true);
    playKidsSound('success', ux.soundEnabled, true);
    onEarnStar(2, 'explorador');
  };

  const askTutor = async (qOverride?: string) => {
    const q = (qOverride || tutorQuestion).trim();
    if (!q) return;
    setLoadingTutor(true);
    setTutorQuizPick(null);

    try {
      const res = await fetch('/api/kids/ai-tutor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'science_qa',
          lang: storyLang,
          ageGroup,
          question: q,
        }),
      });
      if (!res.ok) throw new Error('offline_tutor');
      const data = await res.json();
      if (!data?.ok || !data?.tutor?.explanation) throw new Error('invalid_tutor');
      setTutorAnswer(data.tutor as TutorAnswerData);
    } catch {
      setTutorAnswer(buildOfflineTutorAnswer(q));
    } finally {
      setLoadingTutor(false);
    }
  };

  const savedStories = profile.savedStories || [];

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-tv-modal="true"
      dir={dir}
      className="fixed inset-0 z-[258] bg-[#050816]/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 landscape:p-1.5"
    >
      <div
        className={`w-full max-w-4xl max-h-[92dvh] landscape:max-h-[96dvh] rounded-3xl bg-[#101836] border-2 border-indigo-400/40 shadow-2xl flex flex-col overflow-hidden ${
          ux.dyslexiaFont ? 'tracking-wide leading-relaxed' : ''
        }`}
      >
        {/* HEADER */}
        <div className="shrink-0 px-4 py-3 landscape:py-2 bg-[#0B1128] border-b border-white/10 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-400/40 text-indigo-300 flex items-center justify-center shrink-0">
              <BookOpen className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display font-black text-base sm:text-xl text-white truncate">
                Estudio de Cuentos IA y Profe Curioso
              </h2>
              <p className="text-[11px] font-bold text-indigo-300">
                Lectura karaoke palabra a palabra en 8 idiomas · Biblioteca sin conexión
              </p>
            </div>
          </div>

          <button
            type="button"
            data-tv-focusable="true"
            onClick={() => {
              stopKaraoke();
              onClose();
            }}
            aria-label="Cerrar"
            className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* TABS */}
        <div className="shrink-0 px-3 sm:px-4 py-2.5 flex flex-wrap gap-1.5 bg-[#0D142E] border-b border-white/10">
          {(
            [
              { id: 'create', label: 'Crear Cuento', Icon: Sparkles },
              { id: 'library', label: `Biblioteca (${savedStories.length})`, Icon: BookmarkCheck },
              { id: 'tutor', label: 'Profe IA ¿Por qué?', Icon: HelpCircle },
            ] as const
          ).map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              data-tv-focusable="true"
              onClick={() => {
                stopKaraoke();
                playKidsSound('tap', ux.soundEnabled, false);
                setTab(id);
              }}
              className={`h-9 px-3 rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer transition-colors ${
                tab === id
                  ? 'bg-indigo-400 text-slate-950 shadow'
                  : 'bg-[#17224B] text-sky-100 hover:bg-[#22326B]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{label}</span>
            </button>
          ))}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 space-y-4">
          {/* =================================================================
           * TAB 1: CREAR CUENTO INTERACTIVO (3 CAPÍTULOS + KARAOKE)
           * ================================================================= */}
          {tab === 'create' && (
            <div className="space-y-4">
              {!currentChapter && (
                <div className="rounded-2xl bg-[#0F1633] border border-white/10 p-4 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-[11px] font-black uppercase text-sky-300 mb-1">
                        Protagonista
                      </label>
                      <select
                        value={hero}
                        onChange={(e) => setHero(e.target.value)}
                        className="w-full h-10 px-2.5 rounded-xl bg-[#182352] border border-white/15 text-xs font-black text-white outline-none"
                      >
                        {STORY_HEROES.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-black uppercase text-sky-300 mb-1">
                        Mundo
                      </label>
                      <select
                        value={setting}
                        onChange={(e) => setSetting(e.target.value)}
                        className="w-full h-10 px-2.5 rounded-xl bg-[#182352] border border-white/15 text-xs font-black text-white outline-none"
                      >
                        {STORY_WORLDS.map((w) => (
                          <option key={w} value={w}>
                            {w}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-black uppercase text-sky-300 mb-1">
                        Valor del Cuento
                      </label>
                      <select
                        value={moralValue}
                        onChange={(e) => setMoralValue(e.target.value)}
                        className="w-full h-10 px-2.5 rounded-xl bg-[#182352] border border-white/15 text-xs font-black text-white outline-none"
                      >
                        {STORY_VALUES.map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-black uppercase text-sky-300 mb-1">
                        Idioma del Cuento
                      </label>
                      <select
                        value={storyLang}
                        onChange={(e) => setStoryLang(e.target.value as KidsLanguageCode)}
                        className="w-full h-10 px-2.5 rounded-xl bg-[#182352] border border-white/15 text-xs font-black text-white outline-none"
                      >
                        {KIDS_LANGUAGES.map((l) => (
                          <option key={l.code} value={l.code}>
                            {l.nativeLabel}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <KidsSquishButton
                    disabled={loadingStory}
                    onClick={() => generateChapter(1)}
                    className="w-full sm:w-auto px-6 rounded-xl bg-gradient-to-b from-indigo-300 to-indigo-500 border-b-4 border-indigo-800 text-slate-950 font-black text-sm flex items-center justify-center gap-2"
                  >
                    {loadingStory ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    <span>{loadingStory ? 'Escribiendo Capítulo 1...' : 'Crear Cuento Mágico'}</span>
                  </KidsSquishButton>
                </div>
              )}

              {currentChapter && (
                <div className="space-y-3">
                  {/* Illustrated Storybook Frame + Header */}
                  <div className="rounded-2xl bg-[#0B1128] border border-indigo-400/30 p-3 sm:p-4 flex flex-col sm:flex-row gap-3 items-center">
                    <div className="w-28 h-36 rounded-xl overflow-hidden shrink-0 border border-white/15">
                      <KidsAnimatedPosterSvg
                        title={currentChapter.title}
                        category={setting}
                        langCode={storyLang}
                      />
                    </div>
                    <div className="flex-1 min-w-0 space-y-2 text-center sm:text-start">
                      <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                        <span className="px-2.5 py-0.5 rounded-full bg-indigo-400/20 text-indigo-200 text-[11px] font-black">
                          Capítulo {step} de 3
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full bg-amber-400/20 text-amber-200 text-[11px] font-black">
                          Palabra: {currentChapter.vocabularyWord}
                        </span>
                      </div>
                      <h3 className="font-display font-black text-lg sm:text-xl text-white">
                        {currentChapter.title}
                      </h3>
                      <p className="text-xs font-bold text-sky-200">
                        {currentChapter.vocabularyWord}: {currentChapter.vocabularyMeaning}
                      </p>
                      <div className="flex flex-wrap justify-center sm:justify-start gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => playKaraokeReadAloud(currentChapter.chapterText, storyLang)}
                          className="h-9 px-3.5 rounded-xl bg-amber-400 text-slate-950 font-black text-xs flex items-center gap-1.5 cursor-pointer"
                        >
                          <Volume2 className="w-4 h-4" />
                          <span>Leer Karaoke</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveToLibrary}
                          disabled={savedFlag}
                          className="h-9 px-3.5 rounded-xl bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 font-black text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                        >
                          <BookmarkCheck className="w-4 h-4" />
                          <span>{savedFlag ? 'Guardado Offline' : 'Guardar Cuento'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            stopKaraoke();
                            setCurrentChapter(null);
                            setStep(1);
                          }}
                          className="h-9 px-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-black text-xs cursor-pointer"
                        >
                          Nuevo
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Interactive Word-by-Word Karaoke Text */}
                  <div className="rounded-2xl bg-[#162048] border border-white/15 p-4">
                    <div
                      className={`flex flex-wrap gap-x-1.5 gap-y-2 ${
                        ux.dyslexiaFont ? 'text-lg sm:text-xl leading-loose' : 'text-base sm:text-lg leading-relaxed'
                      } font-bold text-white`}
                    >
                      {activeStoryWords.map((word, idx) => (
                        <button
                          key={`${word}-${idx}`}
                          type="button"
                          onClick={() =>
                            speakKidsText(word, storyLang, { ageGroup, rate: speakRate })
                          }
                          className={`px-1 rounded-md transition-colors cursor-pointer ${
                            karaokeWordIdx === idx
                              ? 'bg-amber-300 text-slate-950 scale-105 shadow'
                              : 'hover:bg-white/10'
                          }`}
                        >
                          {word}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Choices for Steps 1 -> 2 -> 3 */}
                  {step < 3 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {[currentChapter.choiceA, currentChapter.choiceB].map((choice, idx) => (
                        <KidsSquishButton
                          key={idx}
                          disabled={loadingStory}
                          onClick={() => generateChapter(step + 1, choice, currentChapter.chapterText)}
                          className="rounded-2xl bg-[#1C285B] hover:bg-[#253578] border-b-4 border-[#0E1535] text-white font-black text-xs sm:text-sm p-3 text-start flex items-center gap-2"
                        >
                          <KidsBadgeIcon iconId={idx === 0 ? 'compass' : 'sparkles'} className="w-4 h-4 text-amber-300 shrink-0" />
                          <span>{choice}</span>
                        </KidsSquishButton>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-2xl bg-emerald-500/15 border border-emerald-400/35 p-3 space-y-2">
                      <div className="text-xs font-black text-emerald-200">
                        Reto de comprensión (+4 estrellas): {currentChapter.quizQuestion}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {currentChapter.quizOptions.map((opt, i) => {
                          const picked = quizAnswerIdx === i;
                          const isRight = i === currentChapter.correctOptionIndex;
                          return (
                            <button
                              key={i}
                              type="button"
                              disabled={quizAnswerIdx !== null}
                              onClick={() => {
                                setQuizAnswerIdx(i);
                                if (isRight) {
                                  playKidsSound('levelUp', ux.soundEnabled, true);
                                  recordDomainResult('lang', true);
                                  onEarnStar(4, 'explorador');
                                } else {
                                  playKidsSound('error', ux.soundEnabled, false);
                                  recordDomainResult('lang', false);
                                }
                              }}
                              className={`px-3 py-2 rounded-xl text-xs font-black cursor-pointer border ${
                                picked && isRight
                                  ? 'bg-emerald-400 text-slate-950 border-emerald-200'
                                  : picked
                                  ? 'bg-rose-500/30 text-rose-200 border-rose-400'
                                  : 'bg-[#17224B] text-white border-white/15 hover:bg-[#22326B]'
                              }`}
                            >
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* =================================================================
           * TAB 2: BIBLIOTECA OFFLINE
           * ================================================================= */}
          {tab === 'library' && (
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
                          <h4 className="font-display font-black text-sm text-white mt-0.5">
                            {st.title}
                          </h4>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setReadingSavedIdx(idx);
                            playKaraokeReadAloud(st.chapters.join(' '), st.lang);
                          }}
                          className="px-3 py-1.5 rounded-xl bg-amber-400 text-slate-950 font-black text-xs flex items-center gap-1 cursor-pointer shrink-0"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                          <span>Oír</span>
                        </button>
                      </div>
                      <p className="text-xs text-sky-100/85 mt-2 line-clamp-3">
                        {st.chapters.join(' ')}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* =================================================================
           * TAB 3: PROFE IA ¿POR QUÉ...?
           * ================================================================= */}
          {tab === 'tutor' && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {CURIOSITY_PROMPTS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => {
                      setTutorQuestion(q);
                      void askTutor(q);
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
                  onKeyDown={(e) => e.key === 'Enter' && void askTutor()}
                  placeholder="Pregunta algo de ciencia, espacio o animales..."
                  className="flex-1 h-11 px-3 rounded-xl bg-[#0F1633] border border-white/20 text-sm font-bold text-white outline-none focus:border-indigo-400"
                />
                <KidsSquishButton
                  disabled={loadingTutor}
                  onClick={() => void askTutor()}
                  className="!min-h-[44px] h-11 px-4 rounded-xl bg-indigo-400 text-slate-950 border-b-4 border-indigo-700 font-black text-xs"
                >
                  {loadingTutor ? 'Pensando...' : 'Preguntar'}
                </KidsSquishButton>
              </div>

              {tutorAnswer && (
                <div className="rounded-2xl bg-[#0F1633] border border-indigo-400/30 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-bold text-white leading-relaxed">
                      {tutorAnswer.explanation}
                    </p>
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
                                playKidsSound('levelUp', ux.soundEnabled, true);
                                onEarnStar(3, 'explorador');
                              } else {
                                playKidsSound('error', ux.soundEnabled, false);
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
          )}
        </div>
      </div>
    </div>
  );
};
