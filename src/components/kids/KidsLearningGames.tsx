import React, { useEffect, useMemo, useState } from 'react';
import {
  Atom,
  BookOpen,
  Brain,
  Calculator,
  CheckCircle2,
  Globe2,
  HelpCircle,
  Loader2,
  Mic,
  RefreshCw,
  Sparkles,
  Trophy,
  Volume2,
  X,
} from 'lucide-react';
import type { AppLanguage, KidsAgeGroup, KidsLanguageCode } from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import { FlagBadgeSvg } from '../ui/LanguageBadge';
import {
  KIDS_LANGUAGES,
  KIDS_SCIENCE_CARDS,
  KIDS_VOCAB_BANK,
  type KidsVocabEntry,
} from './kidsData';
import { speakKidsText } from './kidsTtsHelper';
import {
  KidsAnimatedCategoryIcon,
  type KidsAnimatedIconId,
} from './KidsSvgArt';

interface KidsLearningGamesProps {
  shellLang: AppLanguage;
  kidsLang: KidsLanguageCode;
  ageGroup: KidsAgeGroup;
  lockedLang?: KidsLanguageCode | null;
  bedtimeMode?: boolean;
  onSelectKidsLang: (lang: KidsLanguageCode) => void;
  onEarnStar: (stars: number, badgeId?: string) => void;
  onMissionLearn?: () => void;
}

type KidsGameModuleId =
  | 'languages'
  | 'story'
  | 'math'
  | 'science'
  | 'memory'
  | 'trivia';

interface MathChallenge {
  prompt: string;
  visualEmojis?: string;
  options: number[];
  answer: number;
}

interface StoryIllustrationScene {
  skyTheme: string;
  heroSymbol: string;
  companionSymbol: string;
  settingSymbol: string;
  caption: string;
}

interface StoryPayload {
  title: string;
  chapterText: string;
  choiceA: string;
  choiceB: string;
  vocabularyWord: string;
  vocabularyMeaning: string;
  quizQuestion: string;
  quizOptions: string[];
  correctOptionIndex: number;
  illustrationScene?: StoryIllustrationScene;
}

interface TutorPayload {
  explanation: string;
  funFact: string;
  quizQuestion: string;
  quizOptions: string[];
  correctIndex: number;
  encouragement: string;
}

interface BrowserSpeechRec {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

function generateMathChallenge(age: KidsAgeGroup): MathChallenge {
  const rand = (min: number, max: number) =>
    Math.floor(Math.random() * (max - min + 1)) + min;

  let prompt = '';
  let visualEmojis: string | undefined;
  let answer = 0;

  if (age === '3-5') {
    const a = rand(1, 5);
    const b = rand(1, 4);
    answer = a + b;
    const icons = ['🍎', '⭐', '🐣', '🍓', '🎈'];
    const icon = icons[rand(0, icons.length - 1)];
    visualEmojis = `${icon.repeat(a)}  +  ${icon.repeat(b)}`;
    prompt = `${a} + ${b} = ?`;
  } else if (age === '6-8') {
    const isAdd = Math.random() > 0.4;
    if (isAdd) {
      const a = rand(6, 24);
      const b = rand(4, 18);
      answer = a + b;
      prompt = `${a} + ${b} = ?`;
    } else {
      const b = rand(3, 14);
      const res = rand(4, 19);
      const a = b + res;
      answer = res;
      prompt = `${a} − ${b} = ?`;
    }
  } else {
    const mode = rand(0, 2);
    if (mode === 0) {
      const a = rand(3, 12);
      const b = rand(3, 12);
      answer = a * b;
      prompt = `${a} × ${b} = ?`;
    } else if (mode === 1) {
      const divisor = rand(2, 9);
      const q = rand(3, 12);
      answer = q;
      prompt = `${divisor * q} ÷ ${divisor} = ?`;
    } else {
      const a = rand(12, 40);
      const b = rand(6, 25);
      answer = a * 2 + b;
      prompt = `(${a} × 2) + ${b} = ?`;
    }
  }

  const wrongSet = new Set<number>([answer]);
  while (wrongSet.size < 4) {
    const delta = rand(-5, 6);
    const cand = Math.max(1, answer + (delta === 0 ? 2 : delta));
    wrongSet.add(cand);
  }
  const options = Array.from(wrongSet).sort(() => Math.random() - 0.5);
  return { prompt, visualEmojis, options, answer };
}

const StoryIllustrationSvg: React.FC<{
  scene?: StoryIllustrationScene;
  heroName: string;
  settingName: string;
}> = ({ scene, heroName, settingName }) => {
  const skyRaw = (scene?.skyTheme || settingName || '').toLowerCase();
  const isNight = /night|noche|espacio|space|star|moon|dormir/.test(skyRaw);
  const isOcean = /mar|ocean|sea|agua|underwater/.test(skyRaw);
  const heroSym = scene?.heroSymbol || (heroName.includes('Dragón') ? '🐉' : heroName.includes('Delfín') ? '🐬' : '🦊');
  const compSym = scene?.companionSymbol || '✨';
  const setSym = scene?.settingSymbol || (isOcean ? '🐠' : isNight ? '🪐' : '🌲');

  const topColor = isOcean ? '#0369A1' : isNight ? '#0B1026' : '#1E3A8A';
  const bottomColor = isOcean ? '#0EA5E9' : isNight ? '#312E81' : '#0EA5E9';
  const hillColor = isOcean ? '#0284C7' : isNight ? '#1E1B4B' : '#15803D';

  return (
    <div className="shrink-0 relative h-24 sm:h-28 rounded-xl overflow-hidden border border-white/15 bg-[#0D1226]">
      <svg viewBox="0 0 420 110" preserveAspectRatio="none" className="w-full h-full block">
        <defs>
          <linearGradient id="storySkyGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={topColor} />
            <stop offset="100%" stopColor={bottomColor} />
          </linearGradient>
        </defs>
        <rect width="420" height="110" fill="url(#storySkyGrad)" />
        <circle cx="52" cy="28" r="14" fill={isNight ? '#FEF08A' : '#FACC15'} opacity="0.92" />
        <circle cx="140" cy="22" r="2.2" fill="#FFFFFF" opacity="0.7" />
        <circle cx="240" cy="18" r="2.8" fill="#FDE047" opacity="0.85" />
        <circle cx="348" cy="30" r="2" fill="#FFFFFF" opacity="0.65" />
        <path d="M0 82 Q105 56 210 78 T420 72 L420 110 L0 110 Z" fill={hillColor} opacity="0.95" />
      </svg>

      <div className="absolute inset-0 flex items-center justify-around px-4">
        <span className="text-3xl sm:text-4xl drop-shadow-md" aria-hidden="true">
          {setSym}
        </span>
        <div className="flex items-center gap-2 bg-black/35 backdrop-blur-sm px-3 py-1 rounded-2xl border border-white/15">
          <span className="text-3xl sm:text-4xl drop-shadow">{heroSym}</span>
          <span className="text-xl sm:text-2xl">{compSym}</span>
        </div>
        <span className="text-2xl sm:text-3xl drop-shadow-md" aria-hidden="true">
          ⭐
        </span>
      </div>

      {scene?.caption && (
        <div className="absolute bottom-1 inset-x-2 text-center">
          <span className="inline-block px-2 py-0.5 rounded-md bg-black/55 text-[10px] font-semibold text-amber-100 truncate max-w-full">
            {scene.caption}
          </span>
        </div>
      )}
    </div>
  );
};

export const KidsLearningGames: React.FC<KidsLearningGamesProps> = ({
  shellLang,
  kidsLang,
  ageGroup,
  lockedLang = null,
  bedtimeMode = false,
  onSelectKidsLang,
  onEarnStar,
  onMissionLearn,
}) => {
  const [activeGame, setActiveGame] = useState<KidsGameModuleId>('languages');

  // 1. MATH
  const [mathChallenge, setMathChallenge] = useState<MathChallenge>(() =>
    generateMathChallenge(ageGroup)
  );
  const [mathFeedback, setMathFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [mathStreak, setMathStreak] = useState(0);
  const [mathHint, setMathHint] = useState<TutorPayload | null>(null);
  const [mathHintLoading, setMathHintLoading] = useState(false);
  const [mathHintError, setMathHintError] = useState<string | null>(null);

  useEffect(() => {
    setMathChallenge(generateMathChallenge(ageGroup));
    setMathFeedback(null);
    setMathHint(null);
    setMathHintError(null);
  }, [ageGroup]);

  // 2. 8-LANGUAGE STUDIO + VOICE WORD TRANSLATOR
  const [vocabCat, setVocabCat] = useState<'all' | 'animals' | 'nature' | 'numbers' | 'family'>('all');
  const [vocabIndex, setVocabIndex] = useState(0);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [translateInput, setTranslateInput] = useState('');
  const [translatingWord, setTranslatingWord] = useState(false);
  const [translateError, setTranslateError] = useState<string | null>(null);
  const [customWordEntry, setCustomWordEntry] = useState<KidsVocabEntry | null>(null);
  const [listeningTranslator, setListeningTranslator] = useState(false);

  const supportsVoice = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const w = window as unknown as {
      SpeechRecognition?: unknown;
      webkitSpeechRecognition?: unknown;
    };
    return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
  }, []);

  const filteredVocab = useMemo(
    () =>
      vocabCat === 'all'
        ? KIDS_VOCAB_BANK
        : KIDS_VOCAB_BANK.filter((v) => v.category === vocabCat),
    [vocabCat]
  );
  const currentWord =
    customWordEntry || filteredVocab[vocabIndex % filteredVocab.length] || KIDS_VOCAB_BANK[0];

  // 3. AI STORY STUDIO
  const [storyHero, setStoryHero] = useState('Zorro Estrella');
  const [storySetting, setStorySetting] = useState('Bosque Mágico');
  const [storyStep, setStoryStep] = useState(1);
  const [storyData, setStoryData] = useState<StoryPayload | null>(null);
  const [storyLoading, setStoryLoading] = useState(false);
  const [storyError, setStoryError] = useState<string | null>(null);

  // 4. SCIENCE LAB
  const [selectedScienceCard, setSelectedScienceCard] = useState(KIDS_SCIENCE_CARDS[0]);
  const [scienceInput, setScienceInput] = useState('');
  const [scienceAnswer, setScienceAnswer] = useState<TutorPayload | null>(null);
  const [scienceLoading, setScienceLoading] = useState(false);
  const [scienceError, setScienceError] = useState<string | null>(null);

  // 5. BILINGUAL MEMORY
  const [memoryCards, setMemoryCards] = useState<
    Array<{ uid: string; pairId: string; label: string; emoji: string; flipped: boolean; matched: boolean }>
  >([]);
  const [flippedIndices, setFlippedIndices] = useState<number[]>([]);
  const [memoryMoves, setMemoryMoves] = useState(0);

  // 6. TRIVIA IA
  const [triviaTopic, setTriviaTopic] = useState('Espacio y Planetas');
  const [triviaData, setTriviaData] = useState<TutorPayload | null>(null);
  const [triviaLoading, setTriviaLoading] = useState(false);
  const [triviaError, setTriviaError] = useState<string | null>(null);
  const [triviaPicked, setTriviaPicked] = useState<number | null>(null);

  const activeLangMeta =
    KIDS_LANGUAGES.find((l) => l.code === kidsLang) || KIDS_LANGUAGES[0];

  const resetMemoryDeck = () => {
    const pairCount = ageGroup === '3-5' ? 3 : 6;
    const sample = KIDS_VOCAB_BANK.slice(0, pairCount);
    const deck = sample
      .flatMap((entry) => {
        const word = entry.translations[kidsLang].word;
        return [
          {
            uid: `${entry.id}-emoji`,
            pairId: entry.id,
            label: entry.emoji,
            emoji: entry.emoji,
            flipped: false,
            matched: false,
          },
          {
            uid: `${entry.id}-word`,
            pairId: entry.id,
            label: word,
            emoji: entry.emoji,
            flipped: false,
            matched: false,
          },
        ];
      })
      .sort(() => Math.random() - 0.5);
    setMemoryCards(deck);
    setFlippedIndices([]);
    setMemoryMoves(0);
  };

  useEffect(() => {
    resetMemoryDeck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kidsLang, ageGroup]);

  const handlePlayWordAudio = async (
    text: string,
    targetLang: KidsLanguageCode,
    tag: string,
    customStyle?: string
  ) => {
    triggerHaptic('light');
    setSpeakingId(tag);
    await speakKidsText(text, targetLang, customStyle);
    setSpeakingId(null);
  };

  const handleTranslateWord = async (overrideWord?: string) => {
    const raw = (overrideWord ?? translateInput).trim();
    if (!raw) return;
    triggerHaptic('medium');
    setTranslatingWord(true);
    setTranslateError(null);

    try {
      const res = await fetch('/api/kids/ai-translate-word', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word: raw }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok || !data?.entry) {
        setTranslateError(data?.error || 'No se pudo traducir esa palabra ahora.');
      } else {
        setCustomWordEntry(data.entry as KidsVocabEntry);
        setTranslateInput('');
        onMissionLearn?.();
        onEarnStar(2, 'genio_multilingue');
      }
    } catch {
      setTranslateError('Error de conexión con el traductor IA.');
    } finally {
      setTranslatingWord(false);
    }
  };

  const handleVoiceTranslate = () => {
    if (typeof window === 'undefined') return;
    const w = window as unknown as {
      SpeechRecognition?: new () => BrowserSpeechRec;
      webkitSpeechRecognition?: new () => BrowserSpeechRec;
    };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return;

    triggerHaptic('medium');
    setListeningTranslator(true);
    try {
      const rec = new Ctor();
      rec.lang = activeLangMeta.speechCode || 'es-ES';
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.onresult = (evt) => {
        const spoken = String(evt.results?.[0]?.[0]?.transcript || '').trim();
        setListeningTranslator(false);
        if (spoken) {
          setTranslateInput(spoken);
          void handleTranslateWord(spoken);
        }
      };
      rec.onerror = () => setListeningTranslator(false);
      rec.onend = () => setListeningTranslator(false);
      rec.start();
    } catch {
      setListeningTranslator(false);
    }
  };

  const handleMathAnswer = (val: number) => {
    triggerHaptic('medium');
    if (val === mathChallenge.answer) {
      setMathFeedback('correct');
      setMathStreak((s) => s + 1);
      onMissionLearn?.();
      onEarnStar(2, mathStreak + 1 >= 5 ? 'math_wizard' : undefined);
      setTimeout(() => {
        setMathChallenge(generateMathChallenge(ageGroup));
        setMathFeedback(null);
        setMathHint(null);
      }, 900);
    } else {
      setMathFeedback('wrong');
      setMathStreak(0);
    }
  };

  const requestAiTutor = async (
    mode: 'math_hint' | 'language_coach' | 'science_qa' | 'quiz_pack',
    payload: { topic?: string; question?: string; targetWord?: string }
  ): Promise<{ tutor: TutorPayload | null; error?: string }> => {
    try {
      const res = await fetch('/api/kids/ai-tutor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lang: kidsLang,
          ageGroup,
          mode,
          ...payload,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok || !data?.tutor) {
        return {
          tutor: null,
          error: data?.error || 'Profe IA no está disponible ahora mismo.',
        };
      }
      return { tutor: data.tutor as TutorPayload };
    } catch {
      return { tutor: null, error: 'Error de conexión con Profe IA.' };
    }
  };

  const handleAskMathHint = async () => {
    setMathHintLoading(true);
    setMathHintError(null);
    const { tutor, error } = await requestAiTutor('math_hint', {
      question: mathChallenge.prompt,
    });
    setMathHint(tutor);
    if (!tutor && error) setMathHintError(error);
    setMathHintLoading(false);
  };

  const handleGenerateStory = async (chosenAction?: string, nextStep = 1) => {
    triggerHaptic('medium');
    setStoryLoading(true);
    setStoryError(null);
    try {
      const res = await fetch('/api/kids/ai-story', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lang: kidsLang,
          ageGroup,
          hero: storyHero,
          setting: storySetting,
          moralValue: bedtimeMode ? 'Calma, sueños dulces y amistad' : 'Amistad y alegría',
          previousStory: storyData?.chapterText || '',
          chosenAction: chosenAction || '',
          step: nextStep,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok || !data?.story) {
        setStoryError(data?.error || 'No se pudo generar el cuento ahora.');
      } else {
        setStoryData(data.story as StoryPayload);
        setStoryStep(nextStep);
        onMissionLearn?.();
        onEarnStar(3, 'story_explorer');
      }
    } catch {
      setStoryError('Error al conectar con Profe IA.');
    } finally {
      setStoryLoading(false);
    }
  };

  const handleAskScience = async (questionToAsk?: string) => {
    const q = (questionToAsk || scienceInput || selectedScienceCard.sampleQuestion).trim();
    if (!q) return;
    triggerHaptic('medium');
    setScienceLoading(true);
    setScienceError(null);
    const { tutor, error } = await requestAiTutor('science_qa', {
      question: q,
      topic: selectedScienceCard.title,
    });
    setScienceAnswer(tutor);
    if (!tutor && error) setScienceError(error);
    if (tutor) {
      onMissionLearn?.();
      onEarnStar(2, 'science_curious');
    }
    setScienceLoading(false);
  };

  const handleFlipMemoryCard = (idx: number) => {
    if (flippedIndices.length >= 2) return;
    const card = memoryCards[idx];
    if (!card || card.flipped || card.matched) return;

    triggerHaptic('light');
    const nextCards = memoryCards.map((c, i) =>
      i === idx ? { ...c, flipped: true } : c
    );
    const nextFlipped = [...flippedIndices, idx];
    setMemoryCards(nextCards);
    setFlippedIndices(nextFlipped);

    if (nextFlipped.length === 2) {
      setMemoryMoves((m) => m + 1);
      const [firstIdx, secondIdx] = nextFlipped;
      const first = nextCards[firstIdx];
      const second = nextCards[secondIdx];
      if (first.pairId === second.pairId) {
        setTimeout(() => {
          setMemoryCards((prev) => {
            const matchedNext = prev.map((c, i) =>
              i === firstIdx || i === secondIdx ? { ...c, matched: true } : c
            );
            if (matchedNext.every((c) => c.matched)) {
              onMissionLearn?.();
              onEarnStar(4, 'memory_master');
            }
            return matchedNext;
          });
          setFlippedIndices([]);
        }, 380);
      } else {
        setTimeout(() => {
          setMemoryCards((prev) =>
            prev.map((c, i) =>
              i === firstIdx || i === secondIdx ? { ...c, flipped: false } : c
            )
          );
          setFlippedIndices([]);
        }, 720);
      }
    }
  };

  const handleLoadAiTrivia = async (topicOverride?: string) => {
    const target = topicOverride || triviaTopic;
    triggerHaptic('medium');
    setTriviaLoading(true);
    setTriviaError(null);
    setTriviaPicked(null);
    const { tutor, error } = await requestAiTutor('quiz_pack', { topic: target });
    setTriviaData(tutor);
    if (!tutor && error) setTriviaError(error);
    setTriviaLoading(false);
  };

  const gameModules: Array<{
    id: KidsGameModuleId;
    title: string;
    iconName: KidsAnimatedIconId;
  }> = [
    { id: 'languages', title: pickLang(shellLang, { es: 'Idiomas', ca: 'Idiomes', en: 'Languages' }), iconName: 'languages' },
    { id: 'math', title: pickLang(shellLang, { es: 'Mates', ca: 'Mates', en: 'Math' }), iconName: 'math' },
    { id: 'memory', title: pickLang(shellLang, { es: 'Memoria', ca: 'Memòria', en: 'Memory' }), iconName: 'memory' },
    { id: 'story', title: pickLang(shellLang, { es: 'Cuentos', ca: 'Contes', en: 'Stories' }), iconName: 'story' },
    { id: 'science', title: pickLang(shellLang, { es: 'Ciencia', ca: 'Ciència', en: 'Science' }), iconName: 'science' },
    { id: 'trivia', title: pickLang(shellLang, { es: 'Trivia', ca: 'Trivia', en: 'Trivia' }), iconName: 'trivia' },
  ];

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2.5 overflow-hidden">
      <div className="shrink-0 flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
        {gameModules.map(({ id, title, iconName }) => {
          const isSelected = activeGame === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => {
                triggerHaptic('medium');
                setActiveGame(id);
              }}
              className={`h-9 px-3 rounded-2xl text-xs font-black flex items-center gap-2 whitespace-nowrap cursor-pointer border-b-2 transition-all active:scale-95 ${
                isSelected
                  ? 'bg-gradient-to-r from-sky-300 to-sky-500 text-zinc-950 border-sky-700 shadow-md scale-105'
                  : 'bg-[#182144] hover:bg-[#232F5C] text-zinc-100 border-[#0D1226]'
              }`}
            >
              <KidsAnimatedCategoryIcon name={iconName} size={18} />
              <span>{title}</span>
            </button>
          );
        })}
      </div>

      {/* GAME 1: 8-LANGUAGE AUDIO VOCABULARY + VOICE TRANSLATOR (ZERO SCROLL) */}
      {activeGame === 'languages' && (
        <div className="flex-1 min-h-0 rounded-2xl bg-[#141B34] border-2 border-[#24305C] p-2.5 sm:p-3 flex flex-col justify-between gap-2 overflow-hidden">
          <div className="shrink-0 flex flex-wrap items-center justify-between gap-1.5">
            <div className="flex items-center gap-1.5">
              <span className="text-2xl sm:text-3xl">{currentWord.emoji}</span>
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                {(
                  [
                    { id: 'all', label: 'Todo' },
                    { id: 'animals', label: 'Animales' },
                    { id: 'nature', label: 'Natura' },
                    { id: 'numbers', label: '1-2-3' },
                  ] as const
                ).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setCustomWordEntry(null);
                      setVocabCat(c.id);
                      setVocabIndex(0);
                    }}
                    className={`h-7 px-2 rounded-lg text-[11px] font-bold cursor-pointer border-b-2 ${
                      vocabCat === c.id && !customWordEntry
                        ? 'bg-sky-400 text-black border-sky-600'
                        : 'bg-[#1B2447] text-zinc-200 border-[#0B0F20]'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Voice / Text 8-Flag Word Translator */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleTranslateWord();
              }}
              className="flex items-center gap-1 flex-1 min-w-[190px] max-w-xs"
            >
              {supportsVoice && (
                <button
                  type="button"
                  onClick={handleVoiceTranslate}
                  aria-label="Traducir con voz"
                  className={`h-7 w-7 shrink-0 rounded-lg flex items-center justify-center cursor-pointer border-b-2 ${
                    listeningTranslator
                      ? 'bg-rose-500 text-white border-rose-700 animate-pulse'
                      : 'bg-pink-500/25 text-pink-200 border-pink-700/60'
                  }`}
                >
                  <Mic className="w-3.5 h-3.5" />
                </button>
              )}
              <input
                type="text"
                value={translateInput}
                onChange={(e) => setTranslateInput(e.target.value)}
                placeholder="Di o escribe palabra..."
                className="flex-1 min-w-0 h-7 px-2 rounded-lg bg-[#0B0F20] border border-white/15 text-[11px] text-white placeholder:text-zinc-400 outline-none"
              />
              <button
                type="submit"
                disabled={translatingWord || !translateInput.trim()}
                className="h-7 px-2 rounded-lg bg-amber-400 text-black text-[11px] font-extrabold flex items-center gap-1 cursor-pointer disabled:opacity-45 shrink-0"
              >
                {translatingWord ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                <span>8x</span>
              </button>
              {customWordEntry && (
                <button
                  type="button"
                  onClick={() => setCustomWordEntry(null)}
                  aria-label="Volver al diccionario"
                  className="h-7 w-7 rounded-lg bg-white/10 text-zinc-200 flex items-center justify-center cursor-pointer shrink-0"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </form>

            {!customWordEntry && (
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setVocabIndex((i) => (i - 1 + filteredVocab.length) % filteredVocab.length)}
                  className="h-7 px-2 rounded-lg bg-[#1E274C] text-xs font-bold text-white cursor-pointer"
                >
                  ◀
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setVocabIndex((i) => (i + 1) % filteredVocab.length);
                    onMissionLearn?.();
                    onEarnStar(1);
                  }}
                  className="h-7 px-2.5 rounded-lg bg-amber-400 border-b-2 border-amber-600 text-xs font-extrabold text-black cursor-pointer"
                >
                  Siguiente ▶
                </button>
              </div>
            )}
          </div>

          {translateError && (
            <div className="shrink-0 px-2.5 py-1 rounded-lg bg-rose-500/20 border border-rose-400/40 text-[11px] text-rose-100">
              {translateError}
            </div>
          )}

          <div className="flex-1 min-h-0 grid grid-cols-2 sm:grid-cols-4 gap-2">
            {KIDS_LANGUAGES.map((lMeta) => {
              const entry = currentWord.translations[lMeta.code];
              const tag = `${currentWord.id}-${lMeta.code}`;
              const isPrimary = lMeta.code === kidsLang;
              return (
                <button
                  key={lMeta.code}
                  type="button"
                  onClick={() => {
                    if (!lockedLang) onSelectKidsLang(lMeta.code);
                    void handlePlayWordAudio(entry.word, lMeta.code, tag);
                  }}
                  className={`p-2.5 rounded-2xl border-2 border-b-4 text-left flex flex-col justify-between cursor-pointer transition-all active:translate-y-0.5 ${
                    isPrimary
                      ? 'bg-amber-400/20 border-amber-400'
                      : 'bg-[#192244] hover:bg-[#222D58] border-[#25315E]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-sky-100">
                      <FlagBadgeSvg code={lMeta.flagCode} className="w-4 h-3" />
                      <span>{lMeta.nativeLabel}</span>
                    </span>
                    <Volume2
                      className={`w-3.5 h-3.5 shrink-0 ${
                        speakingId === tag ? 'text-amber-300' : 'text-zinc-300'
                      }`}
                    />
                  </div>
                  <div>
                    <div className="font-display font-extrabold text-sm sm:text-base text-white truncate">
                      {entry.word}
                    </div>
                    <div className="text-[10px] text-sky-300 font-mono truncate">
                      /{entry.phonetic}/
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* GAME 2: ADAPTIVE MATH (ZERO SCROLL) */}
      {activeGame === 'math' && (
        <div className="flex-1 min-h-0 rounded-2xl bg-[#141B34] border-2 border-[#24305C] p-4 flex flex-col items-center justify-between text-center overflow-hidden">
          <div className="w-full flex items-center justify-between text-xs font-bold text-sky-200">
            <span>Nivel {ageGroup}</span>
            <span className="text-emerald-300">Racha: {mathStreak} 🔥</span>
          </div>

          <div className="space-y-2 my-auto">
            {mathChallenge.visualEmojis && (
              <div className="text-2xl sm:text-3xl tracking-widest">{mathChallenge.visualEmojis}</div>
            )}
            <div className="font-display font-extrabold text-4xl sm:text-6xl text-white tabular-nums">
              {mathChallenge.prompt}
            </div>
            {mathFeedback === 'correct' && (
              <div className="text-sm font-bold text-emerald-300 flex items-center justify-center gap-1">
                <CheckCircle2 className="w-4 h-4" /> ¡+2 ⭐!
              </div>
            )}
            {mathFeedback === 'wrong' && (
              <div className="text-xs font-bold text-amber-300">¡Prueba otro número!</div>
            )}
            {mathHint && (
              <p className="text-xs text-amber-200 max-w-md mx-auto">{mathHint.explanation}</p>
            )}
            {mathHintError && (
              <p className="text-xs text-rose-300 max-w-md mx-auto">{mathHintError}</p>
            )}
          </div>

          <div className="w-full max-w-lg space-y-2">
            <div className="grid grid-cols-4 gap-2.5">
              {mathChallenge.options.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => handleMathAnswer(opt)}
                  className="h-14 sm:h-16 rounded-2xl bg-[#1B2447] hover:bg-emerald-500/25 border-2 border-b-4 border-[#2E3C73] hover:border-emerald-400 font-display font-black text-2xl text-white cursor-pointer active:translate-y-0.5 transition-all"
                >
                  {opt}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                disabled={mathHintLoading}
                onClick={() => void handleAskMathHint()}
                className="h-8 px-3 rounded-xl bg-white/[0.1] text-xs font-bold text-amber-200 flex items-center gap-1 cursor-pointer"
              >
                {mathHintLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <HelpCircle className="w-3 h-3" />}
                <span>Pista IA</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMathChallenge(generateMathChallenge(ageGroup));
                  setMathFeedback(null);
                  setMathHint(null);
                  setMathHintError(null);
                }}
                className="h-8 px-3 rounded-xl bg-white/[0.08] text-xs font-bold text-zinc-200 flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Cambiar</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GAME 3: BILINGUAL MEMORY MATCH (ZERO SCROLL) */}
      {activeGame === 'memory' && (
        <div className="flex-1 min-h-0 rounded-2xl bg-[#141B34] border-2 border-[#24305C] p-3 flex flex-col gap-2 overflow-hidden">
          <div className="shrink-0 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-white">
              <FlagBadgeSvg code={activeLangMeta.flagCode} className="w-4 h-3" />
              <span>Empareja dibujo y palabra · {memoryMoves} jugadas</span>
            </div>
            <button
              type="button"
              onClick={resetMemoryDeck}
              className="h-7 px-2.5 rounded-lg bg-white/10 text-xs font-bold text-white flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Nuevo</span>
            </button>
          </div>

          <div
            className={`flex-1 min-h-0 grid gap-2 ${
              ageGroup === '3-5'
                ? 'grid-cols-3 grid-rows-2'
                : 'grid-cols-3 sm:grid-cols-4 grid-rows-4 sm:grid-rows-3'
            }`}
          >
            {memoryCards.map((card, idx) => {
              const revealed = card.flipped || card.matched;
              return (
                <button
                  key={card.uid}
                  type="button"
                  onClick={() => handleFlipMemoryCard(idx)}
                  className={`rounded-2xl border-2 border-b-4 flex items-center justify-center p-1.5 text-center cursor-pointer transition-all active:translate-y-0.5 ${
                    card.matched
                      ? 'bg-emerald-500/25 border-emerald-400 text-emerald-100'
                      : revealed
                      ? 'bg-amber-400/20 border-amber-400 text-white'
                      : 'bg-[#1B2447] hover:bg-[#243161] border-[#2C3A70] text-amber-300'
                  }`}
                >
                  {revealed ? (
                    <span className={card.uid.endsWith('-emoji') ? 'text-3xl sm:text-4xl' : 'font-display font-extrabold text-xs sm:text-sm'}>
                      {card.label}
                    </span>
                  ) : (
                    <span className="text-xl font-black opacity-80">?</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* GAME 4: AI ILLUSTRATED STORYBOOK + BEDTIME VOICE (ZERO SCROLL) */}
      {activeGame === 'story' && (
        <div className="flex-1 min-h-0 rounded-2xl bg-[#10121C] border border-white/[0.09] p-3 flex flex-col justify-between gap-2 overflow-hidden">
          <div className="shrink-0 flex flex-wrap items-center justify-between gap-1.5">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {['Zorro Estrella', 'Dragón Azul', 'Delfín Mágico'].map((hero) => (
                <button
                  key={hero}
                  type="button"
                  onClick={() => setStoryHero(hero)}
                  className={`h-7 px-2.5 rounded-lg text-[11px] font-bold whitespace-nowrap cursor-pointer border ${
                    storyHero === hero
                      ? 'bg-amber-400 text-black border-amber-200'
                      : 'bg-white/5 text-zinc-200 border-white/10'
                  }`}
                >
                  {hero}
                </button>
              ))}
              {['Bosque Mágico', 'Espacio', 'Fondo del Mar'].map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStorySetting(st)}
                  className={`h-7 px-2.5 rounded-lg text-[11px] font-bold whitespace-nowrap cursor-pointer border ${
                    storySetting === st
                      ? 'bg-sky-400 text-black border-sky-200'
                      : 'bg-white/5 text-zinc-300 border-white/10'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={storyLoading}
              onClick={() => void handleGenerateStory(undefined, 1)}
              className="h-8 px-3 rounded-xl bg-amber-400 text-black text-xs font-extrabold flex items-center gap-1 cursor-pointer shrink-0"
            >
              {storyLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              <span>{bedtimeMode ? '🌙 Cuento Dulce' : 'Crear Cuento'}</span>
            </button>
          </div>

          {storyError && (
            <div className="shrink-0 text-xs text-rose-300 font-semibold">{storyError}</div>
          )}

          {storyData ? (
            <div className="flex-1 min-h-0 flex flex-col justify-between gap-2 p-2.5 rounded-2xl bg-[#161926] border border-amber-400/25 overflow-hidden">
              <div className="shrink-0 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <FlagBadgeSvg code={activeLangMeta.flagCode} className="w-4 h-3" />
                  <h4 className="font-display font-bold text-sm sm:text-base text-white truncate">
                    {storyData.title} (Cap. {storyStep}/3)
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    void handlePlayWordAudio(
                      storyData.chapterText,
                      kidsLang,
                      'story-tts',
                      bedtimeMode
                        ? 'Gentle, slow, soothing bedtime lullaby whisper storytelling voice for a sleepy child.'
                        : undefined
                    )
                  }
                  className="h-7 px-2.5 rounded-lg bg-sky-500/20 text-sky-200 text-xs font-bold flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>{bedtimeMode ? 'Nana Voz' : 'Escuchar'}</span>
                </button>
              </div>

              <StoryIllustrationSvg
                scene={storyData.illustrationScene}
                heroName={storyHero}
                settingName={storySetting}
              />

              <p className="flex-1 min-h-0 overflow-y-auto text-xs sm:text-sm text-zinc-100 leading-relaxed pr-1">
                {storyData.chapterText}
              </p>

              {storyStep < 3 && (
                <div className="shrink-0 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={storyLoading}
                    onClick={() => void handleGenerateStory(storyData.choiceA, storyStep + 1)}
                    className="p-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/40 text-left text-xs font-semibold text-white cursor-pointer truncate"
                  >
                    A: {storyData.choiceA}
                  </button>
                  <button
                    type="button"
                    disabled={storyLoading}
                    onClick={() => void handleGenerateStory(storyData.choiceB, storyStep + 1)}
                    className="p-2 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-400/40 text-left text-xs font-semibold text-white cursor-pointer truncate"
                  >
                    B: {storyData.choiceB}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 min-h-0 rounded-2xl bg-[#161926] border border-white/[0.07] flex flex-col items-center justify-center p-4 text-center gap-2">
              <div className="text-4xl">{bedtimeMode ? '🌙' : '📖'}</div>
              <p className="text-sm font-bold text-white">
                Elige protagonista y escenario arriba y pulsa «{bedtimeMode ? 'Cuento Dulce' : 'Crear Cuento'}»
              </p>
            </div>
          )}
        </div>
      )}

      {/* GAME 5: SCIENCE & NATURE (ZERO SCROLL) */}
      {activeGame === 'science' && (
        <div className="flex-1 min-h-0 rounded-2xl bg-[#10121C] border border-white/[0.09] p-3 flex flex-col justify-between gap-2 overflow-hidden">
          <div className="shrink-0 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {KIDS_SCIENCE_CARDS.map((card) => (
              <button
                key={card.id}
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setSelectedScienceCard(card);
                  setScienceAnswer(null);
                }}
                className={`h-8 px-2.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  selectedScienceCard.id === card.id
                    ? 'bg-violet-500 text-white border-violet-300'
                    : 'bg-[#161926] text-zinc-200 border-white/10'
                }`}
              >
                <span>{card.emoji}</span>
                <span>{card.title}</span>
              </button>
            ))}
          </div>

          <div className="flex-1 min-h-0 p-3.5 rounded-2xl bg-[#161926] border border-white/[0.08] flex flex-col justify-between gap-2 overflow-hidden">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="text-3xl shrink-0">{selectedScienceCard.emoji}</span>
                <div className="min-w-0">
                  <h4 className="font-display font-bold text-sm sm:text-base text-white truncate">
                    {selectedScienceCard.title}
                  </h4>
                  <p className="text-xs text-zinc-300 line-clamp-2">{selectedScienceCard.summary}</p>
                </div>
              </div>
              <button
                type="button"
                disabled={scienceLoading}
                onClick={() => void handleAskScience(selectedScienceCard.sampleQuestion)}
                className="h-8 px-3 rounded-xl bg-violet-500 text-white text-xs font-bold flex items-center gap-1 cursor-pointer shrink-0"
              >
                {scienceLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                <span>Profe IA</span>
              </button>
            </div>

            {scienceError && (
              <div className="p-2.5 rounded-xl bg-rose-500/20 border border-rose-400/40 text-xs text-rose-100">
                {scienceError}
              </div>
            )}

            {scienceAnswer && (
              <div className="flex-1 min-h-0 overflow-y-auto p-3 rounded-xl bg-[#0D101B] border border-violet-400/25 text-xs sm:text-sm text-zinc-100 space-y-1">
                <p>{scienceAnswer.explanation}</p>
                <p className="text-amber-300 font-semibold">💡 {scienceAnswer.funFact}</p>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleAskScience();
              }}
              className="shrink-0 flex items-center gap-1.5"
            >
              <input
                type="text"
                value={scienceInput}
                onChange={(e) => setScienceInput(e.target.value)}
                placeholder={`Pregunta a Profe IA en ${activeLangMeta.nativeLabel}...`}
                className="flex-1 h-9 px-3 rounded-xl bg-[#090B12] border border-white/10 text-xs text-white outline-none"
              />
              <button
                type="submit"
                disabled={scienceLoading}
                className="h-9 px-3.5 rounded-xl bg-amber-400 text-black text-xs font-extrabold cursor-pointer"
              >
                Preguntar
              </button>
            </form>
          </div>
        </div>
      )}

      {/* GAME 6: TRIVIA IA (ZERO SCROLL) */}
      {activeGame === 'trivia' && (
        <div className="flex-1 min-h-0 rounded-2xl bg-[#141B34] border-2 border-[#24305C] p-3 flex flex-col justify-between gap-2 overflow-hidden">
          <div className="shrink-0 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {['Espacio y Planetas', 'Animales', 'Música y Arte', 'Inventos'].map((topic) => (
              <button
                key={topic}
                type="button"
                onClick={() => {
                  setTriviaTopic(topic);
                  void handleLoadAiTrivia(topic);
                }}
                className={`h-7 px-2.5 rounded-lg text-[11px] font-bold whitespace-nowrap cursor-pointer border ${
                  triviaTopic === topic
                    ? 'bg-cyan-400 text-black border-cyan-200'
                    : 'bg-white/[0.05] text-zinc-200 border-white/10'
                }`}
              >
                {topic}
              </button>
            ))}
            <button
              type="button"
              disabled={triviaLoading}
              onClick={() => void handleLoadAiTrivia()}
              className="h-7 px-3 rounded-lg bg-amber-400 text-black text-[11px] font-extrabold flex items-center gap-1 cursor-pointer shrink-0"
            >
              {triviaLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              <span>Nueva</span>
            </button>
          </div>

          {triviaError && (
            <div className="shrink-0 p-2.5 rounded-xl bg-rose-500/20 border border-rose-400/40 text-xs text-rose-100">
              {triviaError}
            </div>
          )}

          {triviaData ? (
            <div className="flex-1 min-h-0 p-3.5 rounded-2xl bg-[#192244] border border-cyan-400/25 flex flex-col justify-between gap-2 overflow-hidden">
              <div className="font-display font-bold text-sm sm:text-lg text-white">
                {triviaData.quizQuestion}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {triviaData.quizOptions.map((opt, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setTriviaPicked(idx);
                      if (idx === triviaData.correctIndex) {
                        onMissionLearn?.();
                        onEarnStar(3, 'trivia_champion');
                      }
                    }}
                    className={`p-3 rounded-xl border-2 text-left text-xs sm:text-sm font-bold cursor-pointer ${
                      triviaPicked === null
                        ? 'bg-[#0D1328] hover:bg-white/[0.08] border-white/15 text-white'
                        : idx === triviaData.correctIndex
                        ? 'bg-emerald-500/25 border-emerald-400 text-emerald-200'
                        : triviaPicked === idx
                        ? 'bg-rose-500/25 border-rose-400 text-rose-200'
                        : 'bg-white/[0.02] border-white/[0.05] text-zinc-500'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
              {triviaPicked !== null && (
                <p className="text-xs text-cyan-200 font-semibold truncate">{triviaData.explanation}</p>
              )}
            </div>
          ) : (
            <div className="flex-1 min-h-0 rounded-2xl bg-[#192244] border border-white/[0.07] flex flex-col items-center justify-center p-4 text-center gap-2">
              <div className="text-4xl">🏆</div>
              <p className="text-sm font-bold text-white">Toca un tema arriba para empezar el Trivia IA</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
