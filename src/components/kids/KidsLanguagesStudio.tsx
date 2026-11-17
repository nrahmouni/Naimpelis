import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Award,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Compass,
  Ear,
  Flame,
  Globe,
  Loader2,
  Lock,
  MapPin,
  Mic,
  PenTool,
  RotateCcw,
  Search,
  Snail,
  Sparkles,
  Star,
  Volume2,
  X,
} from 'lucide-react';
import type { KidsAgeGroup, KidsLanguageCode } from '../../types';
import { triggerHaptic } from '../../utils/haptics';
import { useKidsStore } from '../../store/useKidsStore';
import { FlagBadgeSvg } from '../ui/LanguageBadge';
import {
  KIDS_LANGUAGES,
  loadLeitnerBoxes,
  type KidsVocabCategory,
  type KidsVocabEntry,
} from './kidsData';
import {
  EXTENDED_VOCAB_ITEMS,
  findExtendedVocabEntry,
  KIDS_LEARNING_ISLANDS,
  KIDS_MINIMAL_PAIRS,
  KIDS_PHONICS_DRILLS,
  KIDS_SENTENCE_BANK,
  type ExtendedVocabCategory,
  type ExtendedVocabItem,
  type KidsIslandUnit,
} from './kidsCurriculumData';
import { playKidsComboNote, playKidsSound } from './kidsAudioEngine';
import { getKidsDir, getKidsUiCopy } from './kidsI18n';
import { speakKidsText } from './kidsTtsHelper';
import { KidsSpeakButton, KidsSquishButton } from './KidsPrimitives';
import { KidsVocabSvg } from './KidsSvgArt';
import { KidsConfettiCanvas } from './KidsConfettiCanvas';
import { KidsHandwritingCanvas } from './KidsHandwritingCanvas';
import { KidsInteractiveScene } from './KidsInteractiveScene';

interface KidsLanguagesStudioProps {
  kidsLang: KidsLanguageCode;
  ageGroup: KidsAgeGroup;
  onChangeLang: (lang: KidsLanguageCode) => void;
  onEarnStar: (stars: number, badgeId?: string) => void;
  onMissionLearn?: () => void;
  onBackToPortal?: () => void;
}

type StudioMode = 'islands' | 'sentences' | 'scenes' | 'writing' | 'explore';
type SceneSubTab = 'montessori' | 'phonics' | 'minimal';

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

function extractCleanWord(rawWord: string): string {
  const idx = rawWord.indexOf('(');
  const base = (idx >= 0 ? rawWord.slice(0, idx) : rawWord).trim();
  return base || rawWord.trim();
}

function getTargetDefault(uiLang: KidsLanguageCode): KidsLanguageCode {
  return uiLang === 'es' ? 'rif' : 'es';
}

function normalizeSpokenMatch(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\u0600-\u06ff\u4e00-\u9fff]+/g, ' ')
    .trim();
}

export const KidsLanguagesStudio: React.FC<KidsLanguagesStudioProps> = ({
  kidsLang,
  ageGroup,
  onEarnStar,
  onMissionLearn,
}) => {
  const ux = useKidsStore((s) => s.ux);
  const toggleTortoiseSpeech = useKidsStore((s) => s.toggleTortoiseSpeech);
  const getActiveProfile = useKidsStore((s) => s.getActiveProfile);
  const profilesStore = useKidsStore((s) => s.profilesStore);
  const completeCurriculumNode = useKidsStore((s) => s.completeCurriculumNode);
  const recordDomainResult = useKidsStore((s) => s.recordDomainResult);

  const profile = useMemo(() => getActiveProfile(), [profilesStore, getActiveProfile]);
  const completedNodes = profile.completedNodes || {};
  const t = getKidsUiCopy(kidsLang);
  const dir = getKidsDir(kidsLang);

  const [targetLang, setTargetLang] = useState<KidsLanguageCode>(() => getTargetDefault(kidsLang));
  const [mode, setMode] = useState<StudioMode>('explore');
  const [confettiActive, setConfettiActive] = useState(false);

  // Island Lesson Runner Modal state
  const [activeLesson, setActiveLesson] = useState<{
    island: KidsIslandUnit;
    node: KidsIslandUnit['nodes'][number];
    stepIdx: number;
    vocabPool: ExtendedVocabItem[];
    quizIdx: number;
    quizAnswerPicked: string | null;
    quizScore: number;
  } | null>(null);

  // Quick 60s Placement Diagnostic
  const [placementOpen, setPlacementOpen] = useState(false);
  const [placementStep, setPlacementStep] = useState(0);
  const [placementScore, setPlacementScore] = useState(0);

  // Sentence Builder & Voice Recognition
  const [sentenceIdx, setSentenceIdx] = useState(0);
  const [pickedWordIdx, setPickedWordIdx] = useState<number[]>([]);
  const [sentenceStatus, setSentenceStatus] = useState<'playing' | 'won' | 'wrong'>('playing');
  const [listeningMic, setListeningMic] = useState(false);
  const [micResult, setMicResult] = useState<{ text: string; ok: boolean } | null>(null);

  // Scenes & Phonics Sub-tabs
  const [sceneSubTab, setSceneSubTab] = useState<SceneSubTab>('montessori');
  const [phonicsIdx, setPhonicsIdx] = useState(0);
  const [blended, setBlended] = useState(false);
  const [minimalChallengeTarget, setMinimalChallengeTarget] = useState<'A' | 'B'>('A');
  const [minimalIdx, setMinimalIdx] = useState(0);
  const [minimalFeedback, setMinimalFeedback] = useState<'ok' | 'retry' | null>(null);

  // 8-Lang 60+ Word Explorer + Leitner Weak-Words Filter + AI Translator
  const [category, setCategory] = useState<'all' | ExtendedVocabCategory>('all');
  const [weakOnly, setWeakOnly] = useState(false);
  const [wordIndex, setWordIndex] = useState(0);
  const [query, setQuery] = useState('');
  const [customResult, setCustomResult] = useState<KidsVocabEntry | null>(null);
  const [customLoading, setCustomLoading] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);

  const targetMeta =
    KIDS_LANGUAGES.find((l) => l.code === targetLang) || KIDS_LANGUAGES[2];

  const speechRate = ux.tortoiseSpeech ? 0.66 : undefined;
  const leitnerBoxes = useMemo(() => loadLeitnerBoxes(profile.id || 'kid-1'), [profile.id]);

  const speakTarget = useCallback(
    (text: string, langCode: KidsLanguageCode = targetLang, slowOverride = false) => {
      if (!ux.soundEnabled) return;
      void speakKidsText(text, langCode, {
        ageGroup,
        rate: slowOverride || ux.tortoiseSpeech ? 0.66 : undefined,
      });
    },
    [ageGroup, targetLang, ux.soundEnabled, ux.tortoiseSpeech]
  );

  const handleSelectTargetLang = (code: KidsLanguageCode) => {
    triggerHaptic('light');
    playKidsSound('tap', ux.soundEnabled, true);
    setTargetLang(code);
  };

  // ======================== 1. ISLAND CURRICULUM RUNNER ========================
  const startIslandNode = (island: KidsIslandUnit, node: KidsIslandUnit['nodes'][number]) => {
    triggerHaptic('medium');
    playKidsSound('tap', ux.soundEnabled, true);
    const vocabPool = island.vocabIds
      .map((id) => EXTENDED_VOCAB_ITEMS.find((v) => v.id === id))
      .filter((x): x is ExtendedVocabItem => Boolean(x));

    setActiveLesson({
      island,
      node,
      stepIdx: 0,
      vocabPool: vocabPool.length > 0 ? vocabPool : EXTENDED_VOCAB_ITEMS.slice(0, 4),
      quizIdx: 0,
      quizAnswerPicked: null,
      quizScore: 0,
    });

    const firstWord = extractCleanWord(
      (vocabPool[0]?.translations[targetLang] || EXTENDED_VOCAB_ITEMS[0].translations.en).word
    );
    speakTarget(firstWord, targetLang);
  };

  const handleLessonQuizPick = (chosenId: string) => {
    if (!activeLesson || activeLesson.quizAnswerPicked !== null) return;
    const targetItem =
      activeLesson.vocabPool[activeLesson.quizIdx % activeLesson.vocabPool.length];
    const isCorrect = chosenId === targetItem.id;

    recordDomainResult('lang', isCorrect, targetItem.id);

    if (isCorrect) {
      triggerHaptic('success');
      playKidsComboNote(activeLesson.quizScore, ux.soundEnabled);
    } else {
      triggerHaptic('warning');
      playKidsSound('error', ux.soundEnabled, true);
    }

    const nextScore = activeLesson.quizScore + (isCorrect ? 1 : 0);
    setActiveLesson({
      ...activeLesson,
      quizAnswerPicked: chosenId,
      quizScore: nextScore,
    });

    window.setTimeout(() => {
      setActiveLesson((curr) => {
        if (!curr) return null;
        const maxQuestions = curr.node.kind === 'boss' ? Math.min(4, curr.vocabPool.length) : 3;
        if (curr.quizIdx + 1 >= maxQuestions) {
          completeCurriculumNode(curr.node.id, curr.node.rewardStars);
          setConfettiActive(true);
          playKidsSound('levelUp', ux.soundEnabled, true);
          onEarnStar(curr.node.rewardStars, 'tarifit_friend');
          onMissionLearn?.();
          return null;
        }
        const nextIdx = curr.quizIdx + 1;
        const nextWord = extractCleanWord(
          (curr.vocabPool[nextIdx % curr.vocabPool.length].translations[targetLang] ||
            EXTENDED_VOCAB_ITEMS[0].translations.en).word
        );
        speakTarget(nextWord, targetLang);
        return {
          ...curr,
          quizIdx: nextIdx,
          quizAnswerPicked: null,
        };
      });
    }, 800);
  };

  // ======================== 2. PLACEMENT TEST (60s) ========================
  const placementItems = useMemo(
    () => [
      findExtendedVocabEntry('cat'),
      findExtendedVocabEntry('apple'),
      findExtendedVocabEntry('water'),
      findExtendedVocabEntry('sun'),
      findExtendedVocabEntry('mountain'),
    ],
    []
  );

  const handlePlacementAnswer = (chosenId: string) => {
    const target = placementItems[placementStep];
    const ok = chosenId === target.id;
    const nextScore = placementScore + (ok ? 1 : 0);
    if (ok) playKidsSound('success', ux.soundEnabled, true);
    else playKidsSound('error', ux.soundEnabled, true);

    if (placementStep + 1 >= placementItems.length) {
      // Unlock islands proportionally to placement score
      const unlockCount = Math.min(KIDS_LEARNING_ISLANDS.length, Math.max(1, nextScore));
      for (let i = 0; i < unlockCount - 1; i++) {
        const isl = KIDS_LEARNING_ISLANDS[i];
        completeCurriculumNode(isl.nodes[0].id, 0);
      }
      setConfettiActive(true);
      onEarnStar(3 + nextScore, 'tarifit_friend');
      onMissionLearn?.();
      setPlacementOpen(false);
      setPlacementStep(0);
      setPlacementScore(0);
    } else {
      setPlacementScore(nextScore);
      setPlacementStep((s) => s + 1);
    }
  };

  // ======================== 3. SENTENCE BUILDER & VOICE =========================
  const activeSentence = KIDS_SENTENCE_BANK[sentenceIdx % KIDS_SENTENCE_BANK.length];
  const sentenceData =
    activeSentence.translations[targetLang] || activeSentence.translations.es;
  const sentenceNative =
    activeSentence.translations[kidsLang] || activeSentence.translations.es;

  const shuffledSentenceTokens = useMemo(() => {
    const tokensWithNoise = [...sentenceData.tokens, sentenceData.distractor];
    return tokensWithNoise
      .map((word, idx) => ({
        word,
        sortKey: ((word.codePointAt(0) || 1) * 19 + idx * 31 + sentenceIdx * 11) % 89,
      }))
      .sort((a, b) => a.sortKey - b.sortKey)
      .map((item) => item.word);
  }, [sentenceData.distractor, sentenceData.tokens, sentenceIdx]);

  useEffect(() => {
    setPickedWordIdx([]);
    setSentenceStatus('playing');
    setMicResult(null);
  }, [sentenceIdx, targetLang]);

  const handlePickSentenceWord = (idx: number) => {
    if (sentenceStatus === 'won' || pickedWordIdx.includes(idx)) return;
    triggerHaptic('light');
    playKidsSound('tap', ux.soundEnabled, true);
    const word = shuffledSentenceTokens[idx];
    speakTarget(word, targetLang);

    const next = [...pickedWordIdx, idx];
    setPickedWordIdx(next);
    setSentenceStatus('playing');

    if (next.length === sentenceData.tokens.length) {
      const builtTokens = next.map((i) => shuffledSentenceTokens[i]);
      const expectedTokens = sentenceData.tokens;
      const isMatch = builtTokens.every((tk, pos) => tk === expectedTokens[pos]);

      recordDomainResult('lang', isMatch, activeSentence.id);

      if (isMatch) {
        triggerHaptic('success');
        playKidsSound('levelUp', ux.soundEnabled, true);
        setSentenceStatus('won');
        setConfettiActive(true);
        onEarnStar(4, 'genio_multilingue');
        onMissionLearn?.();
        window.setTimeout(() => {
          speakTarget(sentenceData.full, targetLang);
        }, 250);
      } else {
        triggerHaptic('warning');
        playKidsSound('error', ux.soundEnabled, true);
        setSentenceStatus('wrong');
      }
    }
  };

  const supportsSpeechRec = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const w = window as unknown as {
      SpeechRecognition?: unknown;
      webkitSpeechRecognition?: unknown;
    };
    return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
  }, []);

  const handlePracticeVoice = () => {
    const w = window as unknown as {
      SpeechRecognition?: new () => BrowserSpeechRec;
      webkitSpeechRecognition?: new () => BrowserSpeechRec;
    };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) {
      // Fallback tactile self-check if device has no SpeechRecognition
      speakTarget(sentenceData.full, targetLang, true);
      onEarnStar(2);
      onMissionLearn?.();
      setMicResult({
        text: sentenceData.full,
        ok: true,
      });
      return;
    }

    setListeningMic(true);
    setMicResult(null);
    try {
      const rec = new Ctor();
      rec.lang = targetMeta.speechCode || 'es-ES';
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.onresult = (evt) => {
        const spoken = String(evt.results?.[0]?.[0]?.transcript || '').trim();
        const normSpoken = normalizeSpokenMatch(spoken);
        const normTarget = normalizeSpokenMatch(sentenceData.full);
        const targetWords = normTarget.split(' ').filter(Boolean);
        const hits = targetWords.filter((wrd) => normSpoken.includes(wrd)).length;
        const ok = hits >= Math.max(1, Math.floor(targetWords.length / 2));
        setMicResult({ text: spoken || sentenceData.full, ok });
        recordDomainResult('lang', ok, activeSentence.id);
        if (ok) {
          playKidsSound('success', ux.soundEnabled, true);
          onEarnStar(3, 'genio_multilingue');
          onMissionLearn?.();
        } else {
          playKidsSound('error', ux.soundEnabled, true);
        }
        setListeningMic(false);
      };
      rec.onerror = () => setListeningMic(false);
      rec.onend = () => setListeningMic(false);
      rec.start();
    } catch {
      setListeningMic(false);
    }
  };

  // ======================== 4. EXPLORER + AI TRANSLATE ========================
  const filteredVocab = useMemo(() => {
    let base =
      category === 'all'
        ? EXTENDED_VOCAB_ITEMS
        : EXTENDED_VOCAB_ITEMS.filter((v) => v.category === category);
    if (weakOnly) {
      const weak = base.filter((v) => (leitnerBoxes[v.id] || 1) < 3);
      if (weak.length > 0) base = weak;
    }
    return base;
  }, [category, leitnerBoxes, weakOnly]);

  const currentWord =
    customResult ||
    filteredVocab[wordIndex % Math.max(1, filteredVocab.length)] ||
    EXTENDED_VOCAB_ITEMS[0];

  const targetTr = currentWord.translations[targetLang] || currentWord.translations.en;
  const nativeTr = currentWord.translations[kidsLang] || currentWord.translations.es;

  const handleLookupWord = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = query.trim().toLowerCase();
    if (!clean) return;
    triggerHaptic('light');
    playKidsSound('tap', ux.soundEnabled, true);

    const localMatch = EXTENDED_VOCAB_ITEMS.find((entry) =>
      Object.values(entry.translations).some((tr) => tr.word.toLowerCase().includes(clean))
    );
    if (localMatch) {
      setCustomResult({
        id: localMatch.id,
        category: (localMatch.category as KidsVocabCategory) || 'family',
        iconId: localMatch.iconId,
        translations: localMatch.translations,
      });
      onEarnStar(1, 'tarifit_friend');
      onMissionLearn?.();
      return;
    }

    setCustomLoading(true);
    try {
      const res = await fetch('/api/kids/ai-translate-word', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word: clean, ageGroup }),
      });
      const data = await res.json().catch(() => null);
      const translatedMap = data?.entry?.translations || data?.translations;
      if (data?.ok && translatedMap) {
        setCustomResult({
          id: `custom-${clean}`,
          category: 'family',
          iconId: data?.entry?.iconId || 'star',
          translations: translatedMap,
        });
        onEarnStar(2, 'tarifit_friend');
        onMissionLearn?.();
      }
    } finally {
      setCustomLoading(false);
    }
  };

  // Phonics + Minimal pairs active item
  const langPhonics = useMemo(() => {
    const match = KIDS_PHONICS_DRILLS.filter((p) => p.lang === targetLang);
    return match.length > 0 ? match : KIDS_PHONICS_DRILLS;
  }, [targetLang]);
  const activePhonics = langPhonics[phonicsIdx % langPhonics.length];

  const langMinimal = useMemo(() => {
    const match = KIDS_MINIMAL_PAIRS.filter((m) => m.lang === targetLang);
    return match.length > 0 ? match : KIDS_MINIMAL_PAIRS;
  }, [targetLang]);
  const activeMinimal = langMinimal[minimalIdx % langMinimal.length];

  const dyslexiaCls = ux.dyslexiaFont ? 'tracking-[0.06em] leading-relaxed' : '';

  return (
    <div dir={dir} className={`flex-1 min-h-0 flex flex-col gap-2 overflow-hidden relative ${dyslexiaCls}`}>
      <KidsConfettiCanvas
        active={confettiActive}
        lowStimulation={ux.lowStimulation}
        onComplete={() => setConfettiActive(false)}
      />

      {/* STUDIO TOOLBAR: 5 Progressive Tabs + Tortoise Mode + 8-Lang Strip */}
      <div className="shrink-0 flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <div className="flex items-center gap-1 bg-[#0D132B] p-1 rounded-2xl border border-white/10 overflow-x-auto no-scrollbar">
            {(
              [
                { id: 'islands', label: 'Islas', icon: Compass, color: 'bg-amber-400 text-slate-950' },
                { id: 'sentences', label: 'Frases y Voz', icon: Mic, color: 'bg-emerald-400 text-slate-950' },
                { id: 'scenes', label: 'Escenas y Sonidos', icon: BookOpen, color: 'bg-pink-400 text-slate-950' },
                { id: 'writing', label: 'Caligrafía', icon: PenTool, color: 'bg-violet-400 text-slate-950' },
                { id: 'explore', label: '60+ Palabras', icon: Globe, color: 'bg-sky-400 text-slate-950' },
              ] as const
            ).map((tab) => {
              const Icon = tab.icon;
              const isAct = mode === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  data-tv-focusable="true"
                  onClick={() => {
                    playKidsSound('tap', ux.soundEnabled, true);
                    setMode(tab.id);
                  }}
                  className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors ${
                    isAct ? `${tab.color} shadow` : 'text-sky-100/80 hover:bg-white/5'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                playKidsSound('tap', ux.soundEnabled, true);
                toggleTortoiseSpeech();
              }}
              aria-label="Modo tortuga lento"
              title="Voz lenta 0.7x para aprender mejor"
              className={`h-8 px-2.5 rounded-xl border text-[11px] font-black flex items-center gap-1 cursor-pointer ${
                ux.tortoiseSpeech
                  ? 'bg-emerald-400 text-slate-950 border-emerald-200'
                  : 'bg-[#141D42] text-emerald-200 border-white/10'
              }`}
            >
              <Snail className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">0.7x</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setPlacementStep(0);
                setPlacementScore(0);
                setPlacementOpen(true);
              }}
              className="h-8 px-2.5 rounded-xl bg-amber-400/20 hover:bg-amber-400/30 border border-amber-300/40 text-amber-200 text-[11px] font-black flex items-center gap-1 cursor-pointer"
            >
              <Award className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Test Nivel</span>
            </button>
          </div>
        </div>

        {/* Equal 8-Language Selector Strip */}
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
          {KIDS_LANGUAGES.map((langMeta) => {
            const active = langMeta.code === targetLang;
            return (
              <button
                key={langMeta.code}
                type="button"
                data-tv-focusable="true"
                onClick={() => handleSelectTargetLang(langMeta.code)}
                className={`h-8 px-2 rounded-xl border text-[11px] font-black flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                  active
                    ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-md scale-[1.02]'
                    : 'bg-[#141D42] hover:bg-[#1C2858] text-sky-100 border-white/10'
                }`}
              >
                <FlagBadgeSvg code={langMeta.flagCode} className="w-4 h-2.5 shrink-0" />
                <span className="truncate">{langMeta.nativeLabel}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* =====================================================================
          MODE 1: PROGRESSIVE LEARNING ISLANDS (DUOLINGO-STYLE PATH)
         ===================================================================== */}
      {mode === 'islands' && (
        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar pb-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {KIDS_LEARNING_ISLANDS.map((island, islIdx) => {
              const title = island.titleByLang[kidsLang] || island.titleByLang.es;
              const prevIsland = islIdx > 0 ? KIDS_LEARNING_ISLANDS[islIdx - 1] : null;
              const unlocked =
                islIdx === 0 ||
                Boolean(completedNodes[prevIsland?.nodes[0]?.id || '']) ||
                Boolean(completedNodes[island.nodes[0].id]);
              const doneInIsland = island.nodes.filter((n) => completedNodes[n.id]).length;

              return (
                <div
                  key={island.id}
                  className={`rounded-3xl border-2 p-3.5 flex flex-col gap-3 transition-all ${
                    unlocked
                      ? 'bg-gradient-to-br from-[#192350] to-[#101736] border-white/15 shadow-xl'
                      : 'bg-[#0F152F]/70 border-white/5 opacity-75'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border border-white/20"
                        style={{ backgroundColor: `${island.accentHex}28` }}
                      >
                        <KidsVocabSvg iconId={island.iconId} size={32} />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-display font-black text-sm sm:text-base text-white truncate">
                          {title}
                        </h3>
                        <p className="text-[11px] font-bold text-sky-200/75 tabular-nums">
                          {doneInIsland}/{island.nodes.length} pasos · {targetMeta.nativeLabel}
                        </p>
                      </div>
                    </div>

                    {!unlocked && <Lock className="w-4 h-4 text-zinc-400 shrink-0" />}
                  </div>

                  {/* Winding Path Nodes */}
                  <div className="grid grid-cols-2 gap-2">
                    {island.nodes.map((node, nIdx) => {
                      const isDone = Boolean(completedNodes[node.id]);
                      const prevNodeDone =
                        nIdx === 0 ? unlocked : Boolean(completedNodes[island.nodes[nIdx - 1].id]);
                      const nodeClickable = unlocked && (nIdx === 0 || prevNodeDone || isDone);

                      return (
                        <button
                          key={node.id}
                          type="button"
                          disabled={!nodeClickable}
                          data-tv-focusable="true"
                          onClick={() => startIslandNode(island, node)}
                          className={`p-2.5 rounded-2xl border-2 border-b-4 text-start flex items-center justify-between gap-2 transition-all ${
                            isDone
                              ? 'bg-emerald-500/20 border-emerald-400 text-emerald-100 cursor-pointer'
                              : nodeClickable
                              ? 'bg-[#22306B] hover:bg-[#2C3E8A] border-amber-400/50 text-white cursor-pointer'
                              : 'bg-[#0B1026] border-white/5 text-zinc-500 cursor-not-allowed'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="text-[10px] font-black uppercase text-amber-300">
                              +{node.rewardStars} est.
                            </div>
                            <div className="text-xs font-extrabold truncate">{node.labelEs}</div>
                          </div>
                          {isDone ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />
                          ) : (
                            <MapPin className="w-4 h-4 text-amber-300 shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* =====================================================================
          MODE 2: INTERACTIVE SENTENCE BUILDER + VOICE PRACTICE
         ===================================================================== */}
      {mode === 'sentences' && (
        <div className="flex-1 min-h-0 flex flex-col justify-between gap-2.5 overflow-y-auto no-scrollbar pb-3">
          {/* Prompt Card */}
          <div className="rounded-3xl bg-gradient-to-br from-[#1B2654] to-[#111838] border-2 border-emerald-400/40 p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-16 h-16 rounded-2xl bg-[#0B1026] border border-white/15 flex items-center justify-center shrink-0">
                <KidsVocabSvg iconId={activeSentence.iconId} size={46} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-emerald-300">
                  <FlagBadgeSvg code={targetMeta.flagCode} className="w-4 h-2.5 shrink-0" />
                  <span>Forma la frase · [{sentenceData.phonetic}]</span>
                </div>
                <div className="font-display font-black text-lg sm:text-2xl text-white">
                  {sentenceNative.full}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <KidsSpeakButton
                text={sentenceData.full}
                lang={targetLang}
                size="md"
              />
              <KidsSquishButton
                onClick={handlePracticeVoice}
                className={`!min-h-[42px] px-3 rounded-xl font-black text-xs flex items-center gap-1.5 ${
                  listeningMic
                    ? 'bg-rose-500 text-white animate-pulse'
                    : 'bg-pink-400 text-slate-950 border-b-4 border-pink-600'
                }`}
              >
                <Mic className="w-4 h-4" />
                <span>{supportsSpeechRec ? 'Pronunciar' : 'Escucha y Repite'}</span>
              </KidsSquishButton>
              <KidsSquishButton
                onClick={() => setSentenceIdx((i) => (i + 1) % KIDS_SENTENCE_BANK.length)}
                ariaLabel={t.vocabNextWord}
                className="w-11 !min-h-[42px] rounded-xl bg-[#243272] text-white flex items-center justify-center"
              >
                <ChevronRight className="w-5 h-5 rtl:rotate-180" />
              </KidsSquishButton>
            </div>
          </div>

          {micResult && (
            <div
              className={`px-3.5 py-2 rounded-2xl border text-xs font-extrabold flex items-center justify-between gap-2 ${
                micResult.ok
                  ? 'bg-emerald-500/20 border-emerald-400 text-emerald-100'
                  : 'bg-amber-500/20 border-amber-400 text-amber-100'
              }`}
            >
              <span>
                {micResult.ok ? '¡Muy bien pronunciado!' : 'Prueba otra vez despacio:'} "{micResult.text}"
              </span>
              {micResult.ok && <span>+3 estrellas</span>}
            </div>
          )}

          {/* Sentence Construction Tray */}
          <div
            dir={targetLang === 'ar' ? 'rtl' : 'ltr'}
            className="rounded-3xl bg-[#0D132B] border-2 border-white/15 p-4 flex flex-wrap items-center justify-center gap-2.5 min-h-[88px]"
          >
            {sentenceData.tokens.map((expected, slotIdx) => {
              const pickedIdx = pickedWordIdx[slotIdx];
              const word = pickedIdx !== undefined ? shuffledSentenceTokens[pickedIdx] : null;
              return (
                <button
                  key={`${slotIdx}-${expected}`}
                  type="button"
                  onClick={() => {
                    if (pickedIdx === undefined || sentenceStatus === 'won') return;
                    setPickedWordIdx((prev) => prev.filter((_, i) => i !== slotIdx));
                    setSentenceStatus('playing');
                  }}
                  className={`min-w-[68px] h-12 px-3.5 rounded-2xl border-2 font-display font-black text-base sm:text-lg flex items-center justify-center transition-all ${
                    sentenceStatus === 'won'
                      ? 'bg-emerald-400 text-slate-950 border-emerald-200 scale-105'
                      : sentenceStatus === 'wrong'
                      ? 'bg-rose-500/25 text-rose-200 border-rose-400'
                      : word !== null
                      ? 'bg-amber-400 text-slate-950 border-amber-200 cursor-pointer'
                      : 'bg-white/5 text-white/25 border-dashed border-white/25'
                  }`}
                >
                  {word !== null ? word : '____'}
                </button>
              );
            })}
          </div>

          {/* Word Token Bank */}
          <div className="flex-1 flex flex-col items-center justify-center gap-3 rounded-3xl bg-[#12193B] border border-white/10 p-4">
            <p className="text-[11px] font-bold text-sky-200/75">
              Toca las palabras en orden correcto (cuidado: hay 1 palabra trampa):
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              {shuffledSentenceTokens.map((tk, idx) => {
                const used = pickedWordIdx.includes(idx);
                return (
                  <KidsSquishButton
                    key={`${idx}-${tk}`}
                    disabled={used || sentenceStatus === 'won'}
                    onClick={() => handlePickSentenceWord(idx)}
                    className={`h-12 px-4 rounded-2xl border-b-4 font-display font-black text-base sm:text-lg ${
                      used
                        ? 'opacity-25 bg-[#1B254D] border-[#0E142E] text-white'
                        : 'bg-[#1F2D69] hover:bg-[#2A3D8D] border-[#0E1538] text-white'
                    }`}
                  >
                    {tk}
                  </KidsSquishButton>
                );
              })}
            </div>

            {sentenceStatus === 'wrong' && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-rose-300">{t.mathTryAnother}</span>
                <button
                  type="button"
                  onClick={() => {
                    setPickedWordIdx([]);
                    setSentenceStatus('playing');
                  }}
                  className="text-xs font-black text-amber-300 underline cursor-pointer"
                >
                  Reiniciar
                </button>
              </div>
            )}

            {sentenceStatus === 'won' && (
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1.5 text-sm font-black text-emerald-300">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{sentenceData.full} (+4)</span>
                </span>
                <KidsSquishButton
                  onClick={() => setSentenceIdx((i) => (i + 1) % KIDS_SENTENCE_BANK.length)}
                  className="!min-h-[38px] h-9 px-4 rounded-xl bg-amber-400 text-slate-950 font-black text-xs"
                >
                  Siguiente frase
                </KidsSquishButton>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          MODE 3: MONTESSORI SCENES, PHONICS BLENDING & MINIMAL PAIRS
         ===================================================================== */}
      {mode === 'scenes' && (
        <div className="flex-1 min-h-0 flex flex-col gap-2 overflow-hidden">
          <div className="shrink-0 flex items-center gap-1.5">
            {(
              [
                { id: 'montessori', label: 'Escenas Vivas' },
                { id: 'phonics', label: 'Fonética y Sílabas' },
                { id: 'minimal', label: 'Oído Fino (Pares)' },
              ] as const
            ).map((sub) => (
              <button
                key={sub.id}
                type="button"
                onClick={() => {
                  playKidsSound('tap', ux.soundEnabled, true);
                  setSceneSubTab(sub.id);
                }}
                className={`h-8 px-3 rounded-xl text-xs font-black border cursor-pointer ${
                  sceneSubTab === sub.id
                    ? 'bg-pink-400 text-slate-950 border-pink-200'
                    : 'bg-[#141D42] text-sky-100 border-white/10'
                }`}
              >
                {sub.label}
              </button>
            ))}
          </div>

          {sceneSubTab === 'montessori' && (
            <KidsInteractiveScene
              nativeLang={kidsLang}
              targetLang={targetLang}
              ageGroup={ageGroup}
              onSuccessChallenge={(vocabId) => {
                recordDomainResult('lang', true, vocabId);
                onEarnStar(2, 'tarifit_friend');
                onMissionLearn?.();
              }}
            />
          )}

          {sceneSubTab === 'phonics' && activePhonics && (
            <div className="flex-1 min-h-0 rounded-3xl bg-[#141C42] border-2 border-pink-400/35 p-4 sm:p-6 flex flex-col items-center justify-center gap-5 text-center overflow-y-auto">
              <KidsVocabSvg iconId={activePhonics.iconId} size={68} />

              <div className="flex items-center justify-center gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={() => speakTarget(activePhonics.leftPart, activePhonics.lang, true)}
                  className="px-5 py-3 rounded-2xl bg-sky-500/25 border-2 border-sky-400 font-display font-black text-2xl sm:text-3xl text-white cursor-pointer"
                >
                  {activePhonics.leftPart}
                </button>
                <span className="text-2xl font-black text-amber-300">+</span>
                <button
                  type="button"
                  onClick={() => speakTarget(activePhonics.rightPart, activePhonics.lang, true)}
                  className="px-5 py-3 rounded-2xl bg-pink-500/25 border-2 border-pink-400 font-display font-black text-2xl sm:text-3xl text-white cursor-pointer"
                >
                  {activePhonics.rightPart}
                </button>
                <span className="text-2xl font-black text-emerald-300">=</span>
                <KidsSquishButton
                  onClick={() => {
                    setBlended(true);
                    playKidsSound('success', ux.soundEnabled, true);
                    speakTarget(activePhonics.combined, activePhonics.lang, false);
                    onEarnStar(2);
                    onMissionLearn?.();
                  }}
                  className={`px-6 py-3 rounded-2xl border-b-4 font-display font-black text-2xl sm:text-3xl ${
                    blended
                      ? 'bg-emerald-400 text-slate-950 border-emerald-600'
                      : 'bg-amber-400 text-slate-950 border-amber-600'
                  }`}
                >
                  {activePhonics.combined}
                </KidsSquishButton>
              </div>

              <div className="max-w-md space-y-1">
                <div className="text-sm font-black text-white">{activePhonics.meaningEs}</div>
                <p className="text-xs font-semibold text-sky-200/80">{activePhonics.tip}</p>
              </div>

              <KidsSquishButton
                onClick={() => {
                  setBlended(false);
                  setPhonicsIdx((i) => (i + 1) % langPhonics.length);
                }}
                className="px-5 rounded-xl bg-[#22306B] text-white text-xs font-black flex items-center gap-1.5"
              >
                <span>Siguiente sílaba</span>
                <ChevronRight className="w-4 h-4" />
              </KidsSquishButton>
            </div>
          )}

          {sceneSubTab === 'minimal' && activeMinimal && (
            <div className="flex-1 min-h-0 rounded-3xl bg-[#141C42] border-2 border-amber-400/35 p-4 sm:p-6 flex flex-col items-center justify-center gap-4 text-center overflow-y-auto">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-400/20 text-amber-200 text-xs font-black">
                <Ear className="w-4 h-4" />
                <span>Pulsa Oír Reto y distingue qué palabra suena</span>
              </div>

              <KidsSquishButton
                onClick={() => {
                  const chosenTarget: 'A' | 'B' = Math.random() > 0.5 ? 'A' : 'B';
                  setMinimalChallengeTarget(chosenTarget);
                  setMinimalFeedback(null);
                  const w = chosenTarget === 'A' ? activeMinimal.wordA : activeMinimal.wordB;
                  speakTarget(w, activeMinimal.lang, ux.tortoiseSpeech);
                }}
                className="px-6 rounded-2xl bg-amber-400 border-b-4 border-amber-600 text-slate-950 font-black text-sm flex items-center gap-2"
              >
                <Volume2 className="w-5 h-5" />
                <span>Oír Palabra Misteriosa</span>
              </KidsSquishButton>

              <div className="grid grid-cols-2 gap-3 w-full max-w-md">
                {(['A', 'B'] as const).map((side) => {
                  const word = side === 'A' ? activeMinimal.wordA : activeMinimal.wordB;
                  const phon = side === 'A' ? activeMinimal.phoneticA : activeMinimal.phoneticB;
                  return (
                    <button
                      key={side}
                      type="button"
                      onClick={() => {
                        const ok = side === minimalChallengeTarget;
                        setMinimalFeedback(ok ? 'ok' : 'retry');
                        recordDomainResult('lang', ok);
                        if (ok) {
                          playKidsSound('success', ux.soundEnabled, true);
                          onEarnStar(2);
                          onMissionLearn?.();
                        } else {
                          playKidsSound('error', ux.soundEnabled, true);
                          speakTarget(word, activeMinimal.lang, true);
                        }
                      }}
                      className="p-4 rounded-2xl bg-[#1B275C] hover:bg-[#243478] border-2 border-sky-400/35 text-center cursor-pointer space-y-1"
                    >
                      <div className="font-display font-black text-2xl text-white">{word}</div>
                      <div className="text-xs font-bold text-amber-200">{phon}</div>
                    </button>
                  );
                })}
              </div>

              <p className="text-xs font-bold text-sky-200/80 max-w-md">{activeMinimal.contrastNote}</p>

              {minimalFeedback && (
                <div
                  className={`text-xs font-black ${
                    minimalFeedback === 'ok' ? 'text-emerald-300' : 'text-amber-300'
                  }`}
                >
                  {minimalFeedback === 'ok' ? '¡Oído perfecto! +2 estrellas' : 'Escucha otra vez despacio'}
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  setMinimalFeedback(null);
                  setMinimalIdx((i) => (i + 1) % langMinimal.length);
                }}
                className="text-xs font-black text-sky-300 underline cursor-pointer"
              >
                Siguiente contraste
              </button>
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          MODE 4: TACTILE HANDWRITING STUDIO
         ===================================================================== */}
      {mode === 'writing' && (
        <KidsHandwritingCanvas
          kidsLang={targetLang}
          ageGroup={ageGroup}
          onCompleteGlyph={(glyphId) => {
            recordDomainResult('lang', true, glyphId);
            setConfettiActive(true);
            onEarnStar(3, 'genio_multilingue');
            onMissionLearn?.();
          }}
        />
      )}

      {/* =====================================================================
          MODE 5: 60+ VOCABULARY EXPLORER + LEITNER WEAK FILTER + AI TRANSLATE
         ===================================================================== */}
      {mode === 'explore' && (
        <div className="flex-1 min-h-0 flex flex-col justify-between gap-2 overflow-hidden">
          {/* Quick Category Carousel (Single compact row, zero typing required) */}
          <div className="shrink-0 flex items-center justify-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            {(
              [
                { id: 'all', label: 'Todas' },
                { id: 'animals', label: 'Animales' },
                { id: 'food', label: 'Comida' },
                { id: 'nature', label: 'Naturaleza' },
                { id: 'numbers', label: 'Números' },
                { id: 'family', label: 'Familia' },
              ] as const
            ).map((cat) => (
              <button
                key={cat.id}
                type="button"
                data-tv-focusable="true"
                onClick={() => {
                  setCustomResult(null);
                  setCategory(cat.id as 'all' | ExtendedVocabCategory);
                  setWordIndex(0);
                }}
                className={`h-7 px-3 rounded-full text-xs font-black cursor-pointer transition-all ${
                  category === cat.id
                    ? 'bg-amber-400 text-slate-950 shadow scale-105'
                    : 'bg-[#151E46] text-sky-100 hover:bg-[#202D68] border border-white/10'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* ZERO-SCROLL HERO CARD: Full height, child-focused */}
          <div className="flex-1 min-h-0 rounded-3xl bg-gradient-to-b from-[#182455] via-[#12193D] to-[#0A0F26] border-2 border-sky-400/40 p-3 sm:p-5 flex flex-col items-center justify-between shadow-2xl relative">
            {/* Top Language Badge & Compare Toggle */}
            <div className="w-full flex items-center justify-between gap-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-white/15 text-xs font-black text-amber-300">
                <FlagBadgeSvg code={targetMeta.flagCode} className="w-4 h-2.5 shrink-0" />
                <span>{targetMeta.nativeLabel}</span>
              </div>

              <button
                type="button"
                data-tv-focusable="true"
                onClick={() => setCompareOpen((v) => !v)}
                className="h-7 px-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-sky-200 text-xs font-bold cursor-pointer"
              >
                {compareOpen ? 'Ocultar otros idiomas' : 'Ver en 8 idiomas'}
              </button>
            </div>

            {/* Center Visual Word Stage */}
            <div className="flex flex-col items-center justify-center text-center my-auto space-y-2">
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-[#090E24] border-2 border-amber-300/40 flex items-center justify-center shadow-xl p-2">
                <KidsVocabSvg iconId={currentWord.iconId} size={64} />
              </div>

              <div className="space-y-0.5">
                <h3 className="font-display font-black text-3xl sm:text-4xl text-white tracking-tight leading-tight">
                  {extractCleanWord(targetTr.word)}
                </h3>
                <p className="text-xs sm:text-sm font-bold text-amber-300">
                  [{targetTr.phonetic}] · {extractCleanWord(nativeTr.word)}
                </p>
              </div>
            </div>

            {/* If 8-language bridge opened, show compact inline chips */}
            {compareOpen && (
              <div className="w-full grid grid-cols-4 sm:grid-cols-8 gap-1 my-1">
                {KIDS_LANGUAGES.map((langMeta) => {
                  const entry = currentWord.translations[langMeta.code];
                  const isTarget = langMeta.code === targetLang;
                  return (
                    <button
                      key={langMeta.code}
                      type="button"
                      onClick={() => {
                        setTargetLang(langMeta.code);
                        void speakKidsText(extractCleanWord(entry.word), langMeta.code, {
                          ageGroup,
                          rate: ux.tortoiseSpeech ? 0.72 : undefined,
                        });
                      }}
                      className={`p-1 rounded-lg border text-center flex flex-col items-center gap-0.5 cursor-pointer ${
                        isTarget
                          ? 'bg-amber-400 text-slate-950 border-amber-300 font-black'
                          : 'bg-[#151F48] text-white border-white/10'
                      }`}
                    >
                      <FlagBadgeSvg code={langMeta.flagCode} className="w-3.5 h-2" />
                      <span className="text-[9px] truncate w-full">{extractCleanWord(entry.word)}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Bottom Giant Controls: Left Arrow, Huge Audio, Star Button, Right Arrow */}
            <div className="w-full flex items-center justify-between gap-2 pt-1">
              <KidsSquishButton
                onClick={() => {
                  setCustomResult(null);
                  setWordIndex((i) => (i - 1 + filteredVocab.length) % filteredVocab.length);
                }}
                ariaLabel={t.vocabPrevWord}
                className="!min-w-[44px] !min-h-[44px] h-11 w-11 sm:w-12 rounded-2xl bg-[#1C2858] hover:bg-[#253574] text-white flex items-center justify-center shadow-md"
              >
                <ChevronLeft className="w-5 h-5 rtl:rotate-180" />
              </KidsSquishButton>

              <div className="flex items-center gap-2">
                <KidsSpeakButton
                  text={extractCleanWord(targetTr.word)}
                  lang={targetLang}
                  size="lg"
                />

                <KidsSquishButton
                  onClick={() => {
                    playKidsSound('star', ux.soundEnabled, true);
                    setConfettiActive(true);
                    recordDomainResult('lang', true, currentWord.id);
                    onEarnStar(1, 'tarifit_friend');
                    onMissionLearn?.();
                    setWordIndex((i) => (i + 1) % filteredVocab.length);
                  }}
                  className="!min-h-[44px] h-11 px-4 sm:px-5 rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 font-display font-black text-xs sm:text-sm flex items-center gap-1.5 shadow-lg"
                >
                  <Star className="w-4 h-4 fill-slate-950" />
                  <span>¡Me la sé! (+1)</span>
                </KidsSquishButton>
              </div>

              <KidsSquishButton
                onClick={() => {
                  setCustomResult(null);
                  setWordIndex((i) => (i + 1) % filteredVocab.length);
                }}
                ariaLabel={t.vocabNextWord}
                className="!min-w-[44px] !min-h-[44px] h-11 w-11 sm:w-12 rounded-2xl bg-amber-400 hover:bg-amber-300 text-slate-950 flex items-center justify-center shadow-md"
              >
                <ChevronRight className="w-5 h-5 rtl:rotate-180" />
              </KidsSquishButton>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          EMBEDDED ISLAND MINI-LESSON MODAL (VOCAB + QUIZ LOOP)
         ===================================================================== */}
      {activeLesson && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[262] bg-black/82 backdrop-blur-md flex items-center justify-center p-3 sm:p-5"
        >
          <div className="w-full max-w-lg rounded-3xl bg-[#141B38] border-2 border-amber-400/50 p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="text-[11px] font-black uppercase text-amber-300">
                  {activeLesson.island.titleByLang[kidsLang] || activeLesson.island.titleByLang.es}
                </span>
                <h3 className="font-display font-black text-lg text-white truncate">
                  {activeLesson.node.labelEs}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveLesson(null)}
                aria-label="Close"
                className="w-10 h-10 rounded-xl bg-white/10 text-white flex items-center justify-center cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {activeLesson.node.kind === 'vocab' && activeLesson.stepIdx < activeLesson.vocabPool.length ? (
              (() => {
                const item = activeLesson.vocabPool[activeLesson.stepIdx];
                const tr = item.translations[targetLang] || item.translations.en;
                const nat = item.translations[kidsLang] || item.translations.es;
                return (
                  <div className="space-y-4 text-center">
                    <div className="p-6 rounded-3xl bg-[#0D132B] border border-white/15 flex flex-col items-center gap-3">
                      <KidsVocabSvg iconId={item.iconId} size={78} />
                      <div className="font-display font-black text-3xl text-amber-300">
                        {extractCleanWord(tr.word)}
                      </div>
                      <div className="text-xs font-bold text-sky-200">
                        [{tr.phonetic}] · {extractCleanWord(nat.word)}
                      </div>
                      <KidsSpeakButton text={extractCleanWord(tr.word)} lang={targetLang} size="lg" />
                    </div>
                    <KidsSquishButton
                      onClick={() => {
                        playKidsSound('tap', ux.soundEnabled, true);
                        const nextIdx = activeLesson.stepIdx + 1;
                        if (nextIdx >= activeLesson.vocabPool.length) {
                          completeCurriculumNode(activeLesson.node.id, activeLesson.node.rewardStars);
                          setConfettiActive(true);
                          onEarnStar(activeLesson.node.rewardStars, 'tarifit_friend');
                          onMissionLearn?.();
                          setActiveLesson(null);
                        } else {
                          const nTr = activeLesson.vocabPool[nextIdx].translations[targetLang];
                          speakTarget(extractCleanWord(nTr.word), targetLang);
                          setActiveLesson({ ...activeLesson, stepIdx: nextIdx });
                        }
                      }}
                      className="w-full rounded-2xl bg-emerald-400 text-slate-950 font-black text-base"
                    >
                      {activeLesson.stepIdx + 1 >= activeLesson.vocabPool.length
                        ? `Completar paso (+${activeLesson.node.rewardStars})`
                        : 'Siguiente palabra'}
                    </KidsSquishButton>
                  </div>
                );
              })()
            ) : (
              (() => {
                const targetItem =
                  activeLesson.vocabPool[activeLesson.quizIdx % activeLesson.vocabPool.length];
                const tr = targetItem.translations[targetLang] || targetItem.translations.en;
                const options = [
                  targetItem,
                  ...activeLesson.vocabPool.filter((v) => v.id !== targetItem.id).slice(0, 3),
                ]
                  .slice(0, 4)
                  .sort((a, b) => a.id.localeCompare(b.id));

                return (
                  <div className="space-y-4">
                    <div className="p-4 rounded-2xl bg-[#0D132B] border border-white/15 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[11px] font-bold text-sky-300 uppercase">
                          Reto {activeLesson.quizIdx + 1} · ¿Cuál corresponde a:
                        </div>
                        <div className="font-display font-black text-2xl text-white truncate">
                          {extractCleanWord(tr.word)}
                        </div>
                        <div className="text-xs font-bold text-amber-200/80">[{tr.phonetic}]</div>
                      </div>
                      <KidsSpeakButton text={extractCleanWord(tr.word)} lang={targetLang} size="md" />
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      {options.map((opt) => {
                        const natOpt = opt.translations[kidsLang] || opt.translations.es;
                        const pickedThis = activeLesson.quizAnswerPicked === opt.id;
                        const isRight = opt.id === targetItem.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => handleLessonQuizPick(opt.id)}
                            className={`p-3.5 rounded-2xl border-2 flex flex-col items-center gap-2 cursor-pointer transition-all ${
                              activeLesson.quizAnswerPicked && isRight
                                ? 'bg-emerald-500/25 border-emerald-400'
                                : pickedThis
                                ? 'bg-rose-500/25 border-rose-400'
                                : 'bg-[#1B2552] hover:bg-[#253370] border-white/15'
                            }`}
                          >
                            <KidsVocabSvg iconId={opt.iconId} size={50} />
                            <span className="font-display font-black text-sm text-white">
                              {extractCleanWord(natOpt.word)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          60-SECOND PLACEMENT DIAGNOSTIC MODAL
         ===================================================================== */}
      {placementOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[262] bg-black/82 backdrop-blur-md flex items-center justify-center p-4"
        >
          <div className="w-full max-w-md rounded-3xl bg-[#141B38] border-2 border-sky-400/50 p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-amber-300 font-black text-sm">
                <Flame className="w-4 h-4" />
                <span>Test Rápido de Nivel ({placementStep + 1}/{placementItems.length})</span>
              </div>
              <button
                type="button"
                onClick={() => setPlacementOpen(false)}
                className="w-9 h-9 rounded-xl bg-white/10 text-white flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {(() => {
              const target = placementItems[placementStep];
              const tr = target.translations[targetLang] || target.translations.en;
              const opts = [
                target,
                ...placementItems.filter((x) => x.id !== target.id).slice(0, 3),
              ].sort((a, b) => a.id.localeCompare(b.id));
              return (
                <>
                  <div className="p-4 rounded-2xl bg-[#0D132B] border border-white/10 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-sky-300">{targetMeta.nativeLabel}</div>
                      <div className="font-display font-black text-2xl text-white">
                        {extractCleanWord(tr.word)}
                      </div>
                    </div>
                    <KidsSpeakButton text={extractCleanWord(tr.word)} lang={targetLang} size="md" />
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    {opts.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => handlePlacementAnswer(o.id)}
                        className="p-3 rounded-2xl bg-[#1B2552] hover:bg-[#253370] border border-white/15 flex flex-col items-center gap-2 cursor-pointer"
                      >
                        <KidsVocabSvg iconId={o.iconId} size={44} />
                        <span className="text-xs font-black text-white">
                          {extractCleanWord((o.translations[kidsLang] || o.translations.es).word)}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};
