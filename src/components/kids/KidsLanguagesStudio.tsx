import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Award,
  BookOpen,
  CheckCircle2,
  Compass,
  Globe,
  Lock,
  MapPin,
  Mic,
  PenTool,
  Snail,
} from 'lucide-react';
import type { KidsAgeGroup, KidsLanguageCode } from '../../types';
import { triggerHaptic } from '../../utils/haptics';
import { useKidsStore } from '../../store/useKidsStore';
import { FlagBadgeSvg } from '../ui/LanguageBadge';
import {
  KIDS_LANGUAGES,
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
import { KidsVocabSvg } from './KidsSvgArt';
import { KidsConfettiCanvas } from './KidsConfettiCanvas';
import { KidsHandwritingCanvas } from './KidsHandwritingCanvas';
import {
  extractCleanWord,
  KidsIslandLessonModal,
  KidsPlacementModal,
  type ActiveIslandLessonState,
} from './KidsStudioModals';
import {
  KidsScenesAndPhonicsMode,
  KidsSentencesMode,
  KidsVocabExplorerMode,
} from './KidsStudioVocabAndModes';

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

  const [activeLesson, setActiveLesson] = useState<ActiveIslandLessonState | null>(null);
  const [placementOpen, setPlacementOpen] = useState(false);
  const [placementStep, setPlacementStep] = useState(0);
  const [placementScore, setPlacementScore] = useState(0);

  const [sentenceIdx, setSentenceIdx] = useState(0);
  const [pickedWordIdx, setPickedWordIdx] = useState<number[]>([]);
  const [sentenceStatus, setSentenceStatus] = useState<'playing' | 'won' | 'wrong'>('playing');
  const [listeningMic, setListeningMic] = useState(false);
  const [micResult, setMicResult] = useState<{ text: string; ok: boolean } | null>(null);

  const [sceneSubTab, setSceneSubTab] = useState<SceneSubTab>('montessori');
  const [phonicsIdx, setPhonicsIdx] = useState(0);
  const [blended, setBlended] = useState(false);
  const [minimalChallengeTarget, setMinimalChallengeTarget] = useState<'A' | 'B'>('A');
  const [minimalIdx, setMinimalIdx] = useState(0);
  const [minimalFeedback, setMinimalFeedback] = useState<'ok' | 'retry' | null>(null);

  const [category, setCategory] = useState<'all' | ExtendedVocabCategory>('all');
  const [wordIndex, setWordIndex] = useState(0);
  const [customResult, setCustomResult] = useState<KidsVocabEntry | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);

  const targetMeta =
    KIDS_LANGUAGES.find((l) => l.code === targetLang) || KIDS_LANGUAGES[2];

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
      speakTarget(sentenceData.full, targetLang, true);
      onEarnStar(2);
      onMissionLearn?.();
      setMicResult({ text: sentenceData.full, ok: true });
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

  const filteredVocab = useMemo(
    () =>
      category === 'all'
        ? EXTENDED_VOCAB_ITEMS
        : EXTENDED_VOCAB_ITEMS.filter((v) => v.category === category),
    [category]
  );

  const currentWord =
    customResult ||
    filteredVocab[wordIndex % Math.max(1, filteredVocab.length)] ||
    EXTENDED_VOCAB_ITEMS[0];

  const targetTr = currentWord.translations[targetLang] || currentWord.translations.en;
  const nativeTr = currentWord.translations[kidsLang] || currentWord.translations.es;

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

      {/* STUDIO TOOLBAR */}
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

      {/* MODE 1: PROGRESSIVE LEARNING ISLANDS */}
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

      {mode === 'sentences' && (
        <KidsSentencesMode
          kidsLang={kidsLang}
          targetLang={targetLang}
          targetMeta={targetMeta}
          t={t}
          activeSentence={activeSentence}
          sentenceData={sentenceData}
          sentenceNative={sentenceNative}
          shuffledSentenceTokens={shuffledSentenceTokens}
          pickedWordIdx={pickedWordIdx}
          setPickedWordIdx={setPickedWordIdx}
          sentenceStatus={sentenceStatus}
          setSentenceStatus={setSentenceStatus}
          setSentenceIdx={setSentenceIdx}
          listeningMic={listeningMic}
          micResult={micResult}
          supportsSpeechRec={supportsSpeechRec}
          onPracticeVoice={handlePracticeVoice}
          onPickSentenceWord={handlePickSentenceWord}
        />
      )}

      {mode === 'scenes' && (
        <KidsScenesAndPhonicsMode
          kidsLang={kidsLang}
          targetLang={targetLang}
          ageGroup={ageGroup}
          soundEnabled={ux.soundEnabled}
          tortoiseSpeech={ux.tortoiseSpeech}
          sceneSubTab={sceneSubTab}
          setSceneSubTab={setSceneSubTab}
          activePhonics={activePhonics}
          blended={blended}
          setBlended={setBlended}
          setPhonicsIdx={setPhonicsIdx}
          langPhonicsLen={langPhonics.length}
          activeMinimal={activeMinimal}
          minimalChallengeTarget={minimalChallengeTarget}
          setMinimalChallengeTarget={setMinimalChallengeTarget}
          minimalFeedback={minimalFeedback}
          setMinimalFeedback={setMinimalFeedback}
          setMinimalIdx={setMinimalIdx}
          langMinimalLen={langMinimal.length}
          speakTarget={speakTarget}
          recordDomainResult={recordDomainResult}
          onEarnStar={onEarnStar}
          onMissionLearn={onMissionLearn}
        />
      )}

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

      {mode === 'explore' && (
        <KidsVocabExplorerMode
          ageGroup={ageGroup}
          targetLang={targetLang}
          setTargetLang={setTargetLang}
          targetMeta={targetMeta}
          soundEnabled={ux.soundEnabled}
          tortoiseSpeech={ux.tortoiseSpeech}
          t={t}
          category={category}
          setCategory={setCategory}
          setWordIndex={setWordIndex}
          setCustomResult={setCustomResult}
          compareOpen={compareOpen}
          setCompareOpen={setCompareOpen}
          filteredVocabLen={filteredVocab.length}
          currentWord={currentWord}
          targetTr={targetTr}
          nativeTr={nativeTr}
          setConfettiActive={setConfettiActive}
          recordDomainResult={recordDomainResult}
          onEarnStar={onEarnStar}
          onMissionLearn={onMissionLearn}
        />
      )}

      <KidsIslandLessonModal
        activeLesson={activeLesson}
        setActiveLesson={setActiveLesson}
        kidsLang={kidsLang}
        targetLang={targetLang}
        soundEnabled={ux.soundEnabled}
        speakTarget={speakTarget}
        completeCurriculumNode={completeCurriculumNode}
        setConfettiActive={setConfettiActive}
        onEarnStar={onEarnStar}
        onMissionLearn={onMissionLearn}
        handleLessonQuizPick={handleLessonQuizPick}
      />

      <KidsPlacementModal
        open={placementOpen}
        onClose={() => setPlacementOpen(false)}
        placementItems={placementItems}
        placementStep={placementStep}
        kidsLang={kidsLang}
        targetLang={targetLang}
        targetMeta={targetMeta}
        onAnswer={handlePlacementAnswer}
      />
    </div>
  );
};
