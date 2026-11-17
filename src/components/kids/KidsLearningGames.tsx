import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  Loader2,
  Mic,
  RefreshCw,
  Sparkles,
  Volume2,
  X,
} from 'lucide-react';
import type { AppLanguage, KidsAgeGroup, KidsLanguageCode } from '../../types';
import { triggerHaptic } from '../../utils/haptics';
import { useKidsStore } from '../../store/useKidsStore';
import { FlagBadgeSvg } from '../ui/LanguageBadge';
import {
  KIDS_LANGUAGES,
  KIDS_SCIENCE_CARDS,
  KIDS_VOCAB_BANK,
  loadLeitnerBoxes,
  pickLeitnerEntries,
  updateLeitnerBox,
  type KidsVocabEntry,
  type LeitnerBoxesMap,
} from './kidsData';
import { playKidsSound } from './kidsAudioEngine';
import { getKidsDir, getKidsUiCopy } from './kidsI18n';
import { speakKidsText } from './kidsTtsHelper';
import { KidsSpeakButton, KidsSquishButton } from './KidsPrimitives';
import { KidsConfettiCanvas } from './KidsConfettiCanvas';
import { KidsMathBubblesGame } from './KidsMathBubblesGame';
import { KidsSteamSortGame } from './KidsSteamSortGame';
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
  unlockedRewards?: string[];
  onSelectKidsLang: (lang: KidsLanguageCode) => void;
  onEarnStar: (stars: number, badgeId?: string) => void;
  onMissionLearn?: () => void;
  onBackToPortal?: () => void;
}

type KidsGameModuleId =
  | 'languages'
  | 'math'
  | 'memory'
  | 'steam'
  | 'story'
  | 'science'
  | 'trivia';

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

export const KidsLearningGames: React.FC<
  KidsLearningGamesProps & { resetSeq?: number }
> = ({
  kidsLang,
  ageGroup,
  lockedLang = null,
  bedtimeMode = false,
  unlockedRewards = [],
  resetSeq = 0,
  onSelectKidsLang,
  onEarnStar,
  onMissionLearn,
  onBackToPortal,
}) => {
  const ux = useKidsStore((s) => s.ux);
  const activeProfile = useKidsStore((s) => s.getActiveProfile());
  const profileId = activeProfile.id || 'kid-1';
  const t = getKidsUiCopy(kidsLang);
  const dir = getKidsDir(kidsLang);

  const [activeGame, setActiveGame] = useState<KidsGameModuleId | null>(null);

  useEffect(() => {
    if (resetSeq > 0) {
      setActiveGame(null);
    }
  }, [resetSeq]);

  // 1. 8-LANGUAGE STUDIO + VOICE WORD TRANSLATOR
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

  // 2. LEITNER BILINGUAL MEMORY
  const [leitnerBoxes, setLeitnerBoxes] = useState<LeitnerBoxesMap>(() =>
    loadLeitnerBoxes(profileId)
  );
  const [memoryCards, setMemoryCards] = useState<
    Array<{
      uid: string;
      pairId: string;
      label: string;
      speechWord: string;
      emoji: string;
      boxLevel: 1 | 2 | 3;
      flipped: boolean;
      matched: boolean;
    }>
  >([]);
  const [flippedIndices, setFlippedIndices] = useState<number[]>([]);
  const [memoryMoves, setMemoryMoves] = useState(0);
  const [memoryVictory, setMemoryVictory] = useState(false);
  const [memoryConfetti, setMemoryConfetti] = useState(false);

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

  // 5. TRIVIA IA
  const [triviaTopic, setTriviaTopic] = useState('Espacio y Planetas');
  const [triviaData, setTriviaData] = useState<TutorPayload | null>(null);
  const [triviaLoading, setTriviaLoading] = useState(false);
  const [triviaError, setTriviaError] = useState<string | null>(null);
  const [triviaPicked, setTriviaPicked] = useState<number | null>(null);

  const activeLangMeta =
    KIDS_LANGUAGES.find((l) => l.code === kidsLang) || KIDS_LANGUAGES[0];

  useEffect(() => {
    setLeitnerBoxes(loadLeitnerBoxes(profileId));
  }, [profileId]);

  const resetMemoryDeck = useCallback(
    (boxesOverride?: LeitnerBoxesMap) => {
      const boxes = boxesOverride || loadLeitnerBoxes(profileId);
      const pairCount = ageGroup === '3-5' ? 3 : 6;
      const sample = pickLeitnerEntries(KIDS_VOCAB_BANK, boxes, pairCount);
      const deck = sample
        .flatMap((entry) => {
          const word = entry.translations[kidsLang].word;
          const boxLevel = boxes[entry.id] || 1;
          return [
            {
              uid: `${entry.id}-emoji`,
              pairId: entry.id,
              label: entry.emoji,
              speechWord: word,
              emoji: entry.emoji,
              boxLevel,
              flipped: false,
              matched: false,
            },
            {
              uid: `${entry.id}-word`,
              pairId: entry.id,
              label: word,
              speechWord: word,
              emoji: entry.emoji,
              boxLevel,
              flipped: false,
              matched: false,
            },
          ];
        })
        .sort(() => Math.random() - 0.5);
      setMemoryCards(deck);
      setFlippedIndices([]);
      setMemoryMoves(0);
      setMemoryVictory(false);
      setMemoryConfetti(false);
    },
    [ageGroup, kidsLang, profileId]
  );

  useEffect(() => {
    resetMemoryDeck();
  }, [resetMemoryDeck]);

  const handlePlayWordAudio = async (
    text: string,
    targetLang: KidsLanguageCode,
    tag: string,
    customStyle?: string
  ) => {
    triggerHaptic('light');
    if (!ux.soundEnabled) return;
    setSpeakingId(tag);
    await speakKidsText(text, targetLang, { style: customStyle, ageGroup });
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
        setTranslateError(data?.error || t.aiUnavailable);
      } else {
        setCustomWordEntry(data.entry as KidsVocabEntry);
        setTranslateInput('');
        onMissionLearn?.();
        onEarnStar(2, 'genio_multilingue');
      }
    } catch {
      setTranslateError(t.aiConnError);
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
          error: data?.error || t.aiUnavailable,
        };
      }
      return { tutor: data.tutor as TutorPayload };
    } catch {
      return { tutor: null, error: t.aiConnError };
    }
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
        setStoryError(data?.error || t.aiUnavailable);
      } else {
        setStoryData(data.story as StoryPayload);
        setStoryStep(nextStep);
        onMissionLearn?.();
        onEarnStar(3, 'story_explorer');
      }
    } catch {
      setStoryError(t.aiConnError);
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
    if (flippedIndices.length >= 2 || memoryVictory) return;
    const card = memoryCards[idx];
    if (!card || card.flipped || card.matched) return;

    triggerHaptic('light');
    playKidsSound('tap', ux.soundEnabled, true);
    if (ux.soundEnabled) {
      void speakKidsText(card.speechWord, kidsLang, { ageGroup });
    }

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
        const updatedBoxes = updateLeitnerBox(leitnerBoxes, first.pairId, true, profileId);
        setLeitnerBoxes(updatedBoxes);
        playKidsSound('success', ux.soundEnabled, true);
        triggerHaptic('success');

        window.setTimeout(() => {
          setMemoryCards((prev) => {
            const matchedNext = prev.map((c, i) =>
              i === firstIdx || i === secondIdx
                ? { ...c, matched: true, boxLevel: updatedBoxes[c.pairId] || c.boxLevel }
                : c
            );
            if (matchedNext.every((c) => c.matched)) {
              setMemoryVictory(true);
              setMemoryConfetti(true);
              playKidsSound('levelUp', ux.soundEnabled, true);
              onMissionLearn?.();
              onEarnStar(4, 'memory_master');
            }
            return matchedNext;
          });
          setFlippedIndices([]);
        }, 380);
      } else {
        const downgradedBoxes = updateLeitnerBox(leitnerBoxes, first.pairId, false, profileId);
        setLeitnerBoxes(downgradedBoxes);
        playKidsSound('error', ux.soundEnabled, true);
        triggerHaptic('warning');

        window.setTimeout(() => {
          setMemoryCards((prev) =>
            prev.map((c, i) =>
              i === firstIdx || i === secondIdx ? { ...c, flipped: false } : c
            )
          );
          setFlippedIndices([]);
        }, 760);
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

  const masteredCount = useMemo(
    () => Object.values(leitnerBoxes).filter((lvl) => lvl === 3).length,
    [leitnerBoxes]
  );

  const gameModules: Array<{
    id: KidsGameModuleId;
    title: string;
    iconName: KidsAnimatedIconId;
    tone: string;
  }> = [
    {
      id: 'languages',
      title: t.tabLanguages,
      iconName: 'languages',
      tone: 'from-sky-400/25 to-cyan-500/20 border-sky-400/55',
    },
    {
      id: 'math',
      title: t.tabMath,
      iconName: 'math',
      tone: 'from-amber-400/25 to-orange-500/20 border-amber-400/55',
    },
    {
      id: 'memory',
      title: t.tabMemory,
      iconName: 'memory',
      tone: 'from-emerald-400/25 to-teal-500/20 border-emerald-400/55',
    },
    {
      id: 'steam',
      title: t.tabSteam,
      iconName: 'science',
      tone: 'from-indigo-400/25 to-blue-500/20 border-indigo-400/55',
    },
    {
      id: 'story',
      title: t.tabStory,
      iconName: 'story',
      tone: 'from-pink-400/25 to-rose-500/20 border-pink-400/55',
    },
    {
      id: 'science',
      title: t.tabScience,
      iconName: 'magic',
      tone: 'from-violet-400/25 to-purple-500/20 border-violet-400/55',
    },
    {
      id: 'trivia',
      title: t.tabTrivia,
      iconName: 'trivia',
      tone: 'from-cyan-400/25 to-sky-500/20 border-cyan-400/55',
    },
  ];

  const activeMeta = gameModules.find((m) => m.id === activeGame) || null;

  if (!activeGame) {
    return (
      <div dir={dir} className="flex-1 min-h-0 flex flex-col gap-3 overflow-hidden">
        <div className="shrink-0 flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            {onBackToPortal && (
              <button
                type="button"
                onClick={onBackToPortal}
                data-tv-focusable="true"
                className="min-h-[46px] px-3.5 sm:px-4 rounded-2xl bg-[#1A244D] hover:bg-[#25336B] border-b-4 border-[#0D132B] text-white text-xs sm:text-sm font-black flex items-center gap-1.5 cursor-pointer active:scale-95"
              >
                <ChevronLeft className="w-4 h-4 rtl:rotate-180" />
                <span>{t.backToHome}</span>
              </button>
            )}
            <h2 className="font-display font-black text-lg sm:text-2xl text-white">
              {t.chooseActivityPrompt}
            </h2>
          </div>
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 overflow-y-auto no-scrollbar pb-1">
          {gameModules.map((mod) => (
            <button
              key={mod.id}
              type="button"
              onClick={() => {
                triggerHaptic('medium');
                playKidsSound('tap', ux.soundEnabled, true);
                setActiveGame(mod.id);
              }}
              className={`rounded-3xl bg-gradient-to-br ${mod.tone} border-2 border-b-4 p-4 flex flex-col items-center justify-center gap-3 text-center cursor-pointer transition-transform hover:scale-[1.02] active:scale-95 shadow-lg min-h-[130px]`}
            >
              <KidsAnimatedCategoryIcon name={mod.iconName} size={52} />
              <span className="font-display font-black text-base sm:text-lg text-white leading-tight">
                {mod.title}
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div dir={dir} className="flex-1 min-h-0 flex flex-col gap-2.5 overflow-hidden">
      <div className="shrink-0 flex items-center justify-between gap-3 px-1">
        <button
          type="button"
          onClick={() => {
            triggerHaptic('light');
            setActiveGame(null);
          }}
          className="min-h-[46px] px-4 rounded-2xl bg-[#1A244D] hover:bg-[#25336B] border-b-4 border-[#0D132B] text-white text-sm font-black flex items-center gap-2 cursor-pointer active:scale-95"
        >
          <ChevronLeft className="w-5 h-5 rtl:rotate-180" />
          <span>{t.wizBack}</span>
        </button>

        {activeMeta && (
          <div className="flex items-center gap-2">
            <KidsAnimatedCategoryIcon name={activeMeta.iconName} size={24} />
            <h2 className="font-display font-black text-base sm:text-lg text-white">
              {activeMeta.title}
            </h2>
          </div>
        )}
      </div>

      {/* GAME 1: 8-LANGUAGE AUDIO VOCABULARY + VOICE TRANSLATOR */}
      {activeGame === 'languages' && (
        <div className="flex-1 min-h-0 rounded-2xl bg-[#141B34] border-2 border-[#24305C] p-2.5 sm:p-3 flex flex-col justify-between gap-2 overflow-hidden">
          <div className="shrink-0 flex flex-wrap items-center justify-between gap-1.5">
            <div className="flex items-center gap-1.5">
              <span className="text-2xl sm:text-3xl">{currentWord.emoji}</span>
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                {(
                  [
                    { id: 'all', label: t.vocabAll },
                    { id: 'animals', label: t.vocabAnimals },
                    { id: 'nature', label: t.vocabNature },
                    { id: 'numbers', label: t.vocabNumbers },
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
                    className={`min-h-9 px-2.5 rounded-lg text-xs font-bold cursor-pointer border-b-2 ${
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

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleTranslateWord();
              }}
              className="flex items-center gap-1.5 flex-1 min-w-[200px] max-w-xs"
            >
              {supportsVoice && (
                <button
                  type="button"
                  onClick={handleVoiceTranslate}
                  aria-label={t.voiceSearchLabel}
                  className={`w-9 h-9 shrink-0 rounded-lg flex items-center justify-center cursor-pointer border-b-2 ${
                    listeningTranslator
                      ? 'bg-rose-500 text-white border-rose-700 animate-pulse'
                      : 'bg-pink-500/25 text-pink-200 border-pink-700/60'
                  }`}
                >
                  <Mic className="w-4 h-4" />
                </button>
              )}
              <input
                type="text"
                value={translateInput}
                onChange={(e) => setTranslateInput(e.target.value)}
                placeholder={t.vocabTranslatePlaceholder}
                className="flex-1 min-w-0 h-9 px-2.5 rounded-lg bg-[#0B0F20] border border-white/15 text-xs text-white placeholder:text-zinc-400 outline-none"
              />
              <button
                type="submit"
                disabled={translatingWord || !translateInput.trim()}
                className="h-9 px-2.5 rounded-lg bg-amber-400 text-black text-xs font-extrabold flex items-center gap-1 cursor-pointer disabled:opacity-45 shrink-0"
              >
                {translatingWord ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                <span>8x</span>
              </button>
              {customWordEntry && (
                <button
                  type="button"
                  onClick={() => setCustomWordEntry(null)}
                  aria-label="Reset"
                  className="h-9 w-9 rounded-lg bg-white/10 text-zinc-200 flex items-center justify-center cursor-pointer shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </form>

            {!customWordEntry && (
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setVocabIndex((i) => (i - 1 + filteredVocab.length) % filteredVocab.length)}
                  className="h-9 px-2.5 rounded-lg bg-[#1E274C] text-xs font-bold text-white cursor-pointer"
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
                  className="h-9 px-3 rounded-lg bg-amber-400 border-b-2 border-amber-600 text-xs font-extrabold text-black cursor-pointer"
                >
                  {t.vocabNextWord}
                </button>
              </div>
            )}
          </div>

          {translateError && (
            <div className="shrink-0 px-2.5 py-1 rounded-lg bg-rose-500/20 border border-rose-400/40 text-xs text-rose-100">
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
                  className={`p-2.5 rounded-2xl border-2 border-b-4 text-start flex flex-col justify-between cursor-pointer transition-all active:translate-y-0.5 ${
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
                      className={`w-4 h-4 shrink-0 ${
                        speakingId === tag ? 'text-amber-300' : 'text-zinc-300'
                      }`}
                    />
                  </div>
                  <div>
                    <div className="font-display font-extrabold text-base sm:text-lg text-white truncate">
                      {entry.word}
                    </div>
                    <div className="text-[11px] text-sky-300 font-mono truncate">
                      /{entry.phonetic}/
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* GAME 2: CANVAS FALLING NUMBER BUBBLES (ADAPTIVE MATH) */}
      {activeGame === 'math' && (
        <KidsMathBubblesGame
          kidsLang={kidsLang}
          ageGroup={ageGroup}
          unlockedRewards={unlockedRewards}
          onEarnStar={onEarnStar}
          onMissionLearn={onMissionLearn}
        />
      )}

      {/* GAME 3: LEITNER BILINGUAL MEMORY MATCH WITH AUTO-TTS + VICTORY */}
      {activeGame === 'memory' && (
        <div className="flex-1 min-h-0 rounded-2xl bg-[#141B34] border-2 border-[#24305C] p-3 flex flex-col gap-2 overflow-hidden relative">
          <KidsConfettiCanvas
            active={memoryConfetti}
            lowStimulation={ux.lowStimulation}
            onComplete={() => setMemoryConfetti(false)}
          />

          <div className="shrink-0 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-white">
              <FlagBadgeSvg code={activeLangMeta.flagCode} className="w-4 h-3" />
              <span>{t.memoryRule}</span>
              <span className="text-sky-300 tabular-nums">
                · {memoryMoves} {t.memoryMovesLabel}
              </span>
              <span className="text-emerald-300 tabular-nums hidden sm:inline">
                · {t.memoryMasteredLabel}: {masteredCount}/{KIDS_VOCAB_BANK.length}
              </span>
            </div>
            <button
              type="button"
              onClick={() => resetMemoryDeck()}
              className="min-h-11 px-3 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-black text-white flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{t.memoryNewDeck}</span>
            </button>
          </div>

          <div className="relative flex-1 min-h-0 flex flex-col">
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
                    className={`rounded-2xl border-2 border-b-4 flex flex-col items-center justify-center p-1.5 text-center cursor-pointer transition-all active:scale-95 relative ${
                      card.matched
                        ? 'bg-emerald-500/25 border-emerald-400 text-emerald-100'
                        : revealed
                        ? 'bg-amber-400/20 border-amber-400 text-white'
                        : 'bg-[#1B2447] hover:bg-[#243161] border-[#2C3A70] text-amber-300'
                    }`}
                  >
                    {revealed ? (
                      <>
                        <span
                          className={
                            card.uid.endsWith('-emoji')
                              ? 'text-3xl sm:text-4xl'
                              : 'font-display font-extrabold text-sm sm:text-base'
                          }
                        >
                          {card.label}
                        </span>
                        <span className="text-[10px] font-bold text-sky-200/80 mt-0.5">
                          {t.memoryBoxPrefix} {card.boxLevel}
                        </span>
                      </>
                    ) : (
                      <span className="text-2xl font-black opacity-85">?</span>
                    )}
                  </button>
                );
              })}
            </div>

            {memoryVictory && (
              <div className="absolute inset-0 bg-[#0B1026]/90 backdrop-blur-md rounded-2xl flex flex-col items-center justify-center gap-3 p-4 text-center">
                <div className="text-5xl">🧠</div>
                <h3 className="font-display font-black text-2xl sm:text-3xl text-emerald-300">
                  {t.memoryVictoryTitle}
                </h3>
                <p className="text-sm sm:text-base font-bold text-white max-w-sm">
                  {t.memoryVictoryBody} (+4 ⭐)
                </p>
                <KidsSquishButton
                  onClick={() => resetMemoryDeck()}
                  className="px-6 rounded-2xl bg-gradient-to-b from-amber-300 to-amber-500 text-slate-950 border-b-4 border-amber-700 font-black text-base"
                >
                  {t.gameRetryBtn}
                </KidsSquishButton>
              </div>
            )}
          </div>
        </div>
      )}

      {/* GAME 4: STEAM DRAG & DROP DOM COLLISION GAME */}
      {activeGame === 'steam' && (
        <KidsSteamSortGame
          kidsLang={kidsLang}
          ageGroup={ageGroup}
          onEarnStar={onEarnStar}
          onMissionLearn={onMissionLearn}
        />
      )}

      {/* GAME 5: AI ILLUSTRATED STORYBOOK + BEDTIME VOICE */}
      {activeGame === 'story' && (
        <div className="flex-1 min-h-0 rounded-2xl bg-[#10121C] border border-white/[0.09] p-3 flex flex-col justify-between gap-2 overflow-hidden">
          <div className="shrink-0 flex flex-wrap items-center justify-between gap-1.5">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {['Zorro Estrella', 'Dragón Azul', 'Delfín Mágico'].map((hero) => (
                <button
                  key={hero}
                  type="button"
                  onClick={() => setStoryHero(hero)}
                  className={`h-8 px-2.5 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer border ${
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
                  className={`h-8 px-2.5 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer border ${
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
              className="h-9 px-3.5 rounded-xl bg-amber-400 text-black text-xs font-extrabold flex items-center gap-1 cursor-pointer shrink-0"
            >
              {storyLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              <span>{bedtimeMode ? `🌙 ${t.storyBedtimeBtn}` : t.storyCreateBtn}</span>
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
                    {storyData.title} ({storyStep}/3)
                  </h4>
                </div>
                <KidsSpeakButton
                  text={storyData.chapterText}
                  lang={kidsLang}
                  size="md"
                />
              </div>

              <StoryIllustrationSvg
                scene={storyData.illustrationScene}
                heroName={storyHero}
                settingName={storySetting}
              />

              <p className="flex-1 min-h-0 overflow-y-auto text-sm sm:text-base text-zinc-100 leading-relaxed pe-1">
                {storyData.chapterText}
              </p>

              {storyStep < 3 && (
                <div className="shrink-0 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={storyLoading}
                    onClick={() => void handleGenerateStory(storyData.choiceA, storyStep + 1)}
                    className="min-h-11 p-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/40 text-start text-xs font-semibold text-white cursor-pointer truncate"
                  >
                    A: {storyData.choiceA}
                  </button>
                  <button
                    type="button"
                    disabled={storyLoading}
                    onClick={() => void handleGenerateStory(storyData.choiceB, storyStep + 1)}
                    className="min-h-11 p-2 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-400/40 text-start text-xs font-semibold text-white cursor-pointer truncate"
                  >
                    B: {storyData.choiceB}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 min-h-0 rounded-2xl bg-[#161926] border border-white/[0.07] flex flex-col items-center justify-center p-4 text-center gap-2">
              <div className="text-4xl">{bedtimeMode ? '🌙' : '📖'}</div>
              <p className="text-sm sm:text-base font-bold text-white">{t.storyEmptyPrompt}</p>
            </div>
          )}
        </div>
      )}

      {/* GAME 6: SCIENCE & PROFE IA */}
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
                className={`h-9 px-3 rounded-xl border text-xs font-bold flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
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
                  <p className="text-xs sm:text-sm text-zinc-300 line-clamp-2">
                    {selectedScienceCard.summary}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <KidsSpeakButton
                  text={`${selectedScienceCard.title}. ${selectedScienceCard.summary}`}
                  lang={kidsLang}
                  size="md"
                />
                <button
                  type="button"
                  disabled={scienceLoading}
                  onClick={() => void handleAskScience(selectedScienceCard.sampleQuestion)}
                  className="h-9 px-3 rounded-xl bg-violet-500 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                >
                  {scienceLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  <span>{t.scienceProfeBtn}</span>
                </button>
              </div>
            </div>

            {scienceError && (
              <div className="p-2.5 rounded-xl bg-rose-500/20 border border-rose-400/40 text-xs text-rose-100">
                {scienceError}
              </div>
            )}

            {scienceAnswer && (
              <div className="flex-1 min-h-0 overflow-y-auto p-3 rounded-xl bg-[#0D101B] border border-violet-400/25 text-xs sm:text-sm text-zinc-100 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <p>{scienceAnswer.explanation}</p>
                  <KidsSpeakButton
                    text={`${scienceAnswer.explanation} ${scienceAnswer.funFact}`}
                    lang={kidsLang}
                    size="md"
                  />
                </div>
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
                placeholder={`${t.scienceAskPlaceholderPrefix} ${activeLangMeta.nativeLabel}...`}
                className="flex-1 h-10 px-3 rounded-xl bg-[#090B12] border border-white/10 text-xs sm:text-sm text-white outline-none"
              />
              <button
                type="submit"
                disabled={scienceLoading}
                className="h-10 px-4 rounded-xl bg-amber-400 text-black text-xs sm:text-sm font-extrabold cursor-pointer"
              >
                {t.scienceAskBtn}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* GAME 7: TRIVIA IA */}
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
                className={`h-8 px-3 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer border ${
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
              className="h-8 px-3 rounded-lg bg-amber-400 text-black text-xs font-extrabold flex items-center gap-1 cursor-pointer shrink-0"
            >
              {triviaLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              <span>{t.triviaNewBtn}</span>
            </button>
          </div>

          {triviaError && (
            <div className="shrink-0 p-2.5 rounded-xl bg-rose-500/20 border border-rose-400/40 text-xs text-rose-100">
              {triviaError}
            </div>
          )}

          {triviaData ? (
            <div className="flex-1 min-h-0 p-3.5 rounded-2xl bg-[#192244] border border-cyan-400/25 flex flex-col justify-between gap-2 overflow-hidden">
              <div className="flex items-start justify-between gap-2">
                <div className="font-display font-bold text-sm sm:text-lg text-white">
                  {triviaData.quizQuestion}
                </div>
                <KidsSpeakButton
                  text={triviaData.quizQuestion}
                  lang={kidsLang}
                  size="md"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {triviaData.quizOptions.map((opt, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setTriviaPicked(idx);
                      if (idx === triviaData.correctIndex) {
                        playKidsSound('success', ux.soundEnabled, true);
                        onMissionLearn?.();
                        onEarnStar(3, 'trivia_champion');
                      } else {
                        playKidsSound('error', ux.soundEnabled, true);
                      }
                    }}
                    className={`min-h-11 p-3 rounded-xl border-2 text-start text-xs sm:text-sm font-bold cursor-pointer ${
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
                <p className="text-xs sm:text-sm text-cyan-200 font-semibold truncate">
                  {triviaData.explanation}
                </p>
              )}
            </div>
          ) : (
            <div className="flex-1 min-h-0 rounded-2xl bg-[#192244] border border-white/[0.07] flex flex-col items-center justify-center p-4 text-center gap-2">
              <div className="text-4xl">🏆</div>
              <p className="text-sm sm:text-base font-bold text-white">{t.triviaEmptyPrompt}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
